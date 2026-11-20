// The creative stages. Models invent each scene here; nothing below knows about any particular subject.
import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {z} from 'zod';
import {wordTime, type Film, type Word} from '../../../src/estudio/film';
import {WORLDS, type WorldKey} from '../../../src/estudio/worlds';
import {GANCHO_VISUAL} from '../../lib/gancho';
import {NOTES_RULE, type Guion} from '../../lib/guion';
import {askJson, askText, outOfCredit, PedidoPendiente, releaseLocal, spend, targetFor} from '../../lib/llm';
import {makeSheet} from './hoja';
import {measure} from './metricas';
import {apiText, checkProgram} from './programa';
import {offeredResources} from './recursos';
import type {Renderer} from './render';

const WORLD_NAMES = Object.keys(WORLDS) as [WorldKey, ...WorldKey[]];
const worldList = WORLD_NAMES.map((w) => `- ${w}: ${WORLDS[w].about}`).join('\n');
const PASS = 7;

const STYLE = `Lenguaje visual:
- Fondo casi negro y un solo tono de color por escena. Luz de estudio, objetos brillantes y limpios.
- Un protagonista físico domina el cuadro. Nada de collage ni de muchos elementos pequeños.
- Una idea abstracta se vuelve un objeto o una acción concreta que se entiende sin audio.
- Cada cifra se ve como cantidad o tamaño real.
- Cada verbo fuerte dispara una acción justo en esa palabra.
- Acción breve, luego pausa para mirar. Una acción principal a la vez.
- Cámara gran angular y pocos movimientos, con intención.
- El texto de la narración aparece arriba, entre 15 % y 27 % del alto: esa franja queda libre.`;

const ideaSchema = z.object({
	concepto: z.string().min(20),
	protagonista: z.string().min(3),
	mundo: z.enum(WORLD_NAMES),
	escenas: z.array(z.object({primera: z.number().int().min(0), ultima: z.number().int().min(0), idea: z.string().min(8), salida: z.enum(['corte', 'swipe', 'fundido'])})).min(1).max(40),
});
export type Ideas = z.infer<typeof ideaSchema>;

// Scene times from the plan: each scene runs until the next one's first word, so the picture never waits for a pause to change.
export const planScenes = (ideas: Ideas, words: Word[], duration: number) =>
	ideas.escenas.map((s, i, all) => ({
		id: `s${i + 1}`,
		first: s.primera,
		last: s.ultima,
		start: i === 0 ? 0 : words[s.primera].start - 0.05,
		end: i === all.length - 1 ? duration : words[all[i + 1].primera].start - 0.05,
		exit: s.salida,
		idea: s.idea,
	}));

// Splits a guion into scenes and fixes the thread that keeps them one film.
export const planIdeas = async (profile: string, guion: string, words: Word[], duration: number, notes?: Guion) => {
	const system = `Eres showrunner de videos explicativos verticales. Divides una narración en escenas y defines el hilo visual que las une.
${STYLE}

Mundos de color:
${worldList}

Devuelve JSON:
- concepto: la idea visual que recorre todo el video, en una o dos frases.
- protagonista: el objeto o personaje recurrente, descrito para que siempre se vea igual.
- mundo: color base del video.
- escenas: en orden, cubriendo todas las palabras. primera y ultima son índices de palabra. Cada escena es una sola idea visual de 2.5 a 9 segundos y termina al final de una frase o coma.
- salida: cómo pasa a la siguiente. corte si continúa el mismo lugar, swipe si cambia de idea, fundido si pasa el tiempo.

La primera escena es el gancho: dura de 2 a 4 segundos (córtala en la primera coma o punto que lo permita) y su idea es la imagen más llamativa del video, la que muestra justo lo que dice la primera frase. En los primeros 10 segundos las escenas son cortas.
${GANCHO_VISUAL}`;
	const list = words.map((w, i) => `${i}:${w.word}(${w.start.toFixed(1)})`).join(' ');
	// A scene never spans two of the author's notes, so each scene has one picture to follow.
	const fences = notes?.annotated ? notes.blocks.filter((b, i) => i > 0 && (b.notes.length || notes.blocks[i - 1].notes.length)).map((b) => b.first) : [];
	const authored = notes?.annotated
		? `\n\n${NOTES_RULE}\n${notes.style.length ? `Estilo del autor para todo el video: ${notes.style.join(' ')}\n` : ''}Tramos del autor, con lo que debe verse en cada uno. Una escena nunca cruza el límite entre dos tramos; un tramo largo sí puede ser varias escenas:\n${notes.blocks.map((b) => `- palabras ${b.first} a ${b.last}${b.notes.length ? `: ${b.notes.join(' ')}` : ': sin indicación'}`).join('\n')}`
		: '';
	const check = (value: unknown) => {
		const {escenas} = value as Ideas;
		const issues: string[] = [];
		escenas.forEach((s, i) => fences.filter((f) => s.primera < f && s.ultima >= f).forEach((f) => issues.push(`la escena ${i + 1} cruza el inicio del tramo del autor en la palabra ${f}; córtala ahí`)));
		if (escenas[0].primera !== 0) issues.push('la primera escena debe empezar en la palabra 0');
		if (escenas[escenas.length - 1].ultima !== words.length - 1) issues.push(`la última escena debe terminar en la palabra ${words.length - 1}`);
		// The opening scene is the hook: if a comma or full stop lets it end before 4.5 s, it must.
		const first = escenas[0];
		const firstEnd = escenas.length > 1 ? (words[first.ultima + 1]?.start ?? duration) : duration;
		if (firstEnd > 4.5) {
			const cut = words.findIndex((w, i) => i < first.ultima && /[,.;:?!]["»]?$/.test(w.word) && (words[i + 1]?.start ?? duration) >= 2 && (words[i + 1]?.start ?? duration) <= 4.5);
			if (cut >= 0) issues.push(`la primera escena dura ${firstEnd.toFixed(1)} s; es el gancho y debe durar menos de 4.5 s: termínala en la palabra ${cut}`);
		}
		escenas.forEach((s, i) => {
			if (i && s.primera !== escenas[i - 1].ultima + 1) issues.push(`la escena ${i + 1} debe empezar justo después de la anterior`);
			const start = words[s.primera]?.start ?? 0;
			const end = i === escenas.length - 1 ? duration : (words[s.ultima + 1]?.start ?? duration);
			if (end - start < 2 || end - start > 10) issues.push(`la escena ${i + 1} dura ${(end - start).toFixed(1)} s; debe durar de 2.5 a 9 s`);
		});
		return issues;
	};
	return askJson(targetFor(profile, 'ideas'), ideaSchema, system, `Narración (${duration.toFixed(1)} s):\n${guion}\n\nPalabras con índice y segundo:\n${list}${authored}`, {temperature: 0.5, check, attempts: 4});
};

// 3D models made for this film (runs/<name>/modelos.json): name and what it shows. Scenes reach them with kit.model.
let modelos: Record<string, string> = {};
export const usarModelos = (catalogo: Record<string, string>) => {
	modelos = catalogo;
};
// Local mode: this machine draws no pictures. Every scene is made of 3D models (this film's and the shared catalog's,
// kit/modelos) and flat 2D drawings painted with code, so nothing leaves the machine and no picture is generated.
let sinImagenes = false;
let catalogoLocal: Record<string, string> = {};
export const usarModoLocal = (catalogo: Record<string, string>) => {
	sinImagenes = true;
	catalogoLocal = catalogo;
};
export const modoLocal = () => sinImagenes;
// Every model a scene may ask for, with what it shows.
const ofrecidos = () => ({...(sinImagenes ? catalogoLocal : {}), ...modelos});
const describirModelo = (n: string) => ofrecidos()[n] ?? '';
const modelLine = () => {
	const extra = Object.entries(catalogoLocal).filter(([n]) => !(n in modelos));
	const propios = Object.keys(modelos).length ? `\n\nModelos 3D hechos para este video. Se ven de todos lados y pueden girar; cuando el objeto está aquí, úsalo en vez de pedir una imagen:\n${Object.entries(modelos).map(([n, en]) => `- ${n}: ${en}`).join('\n')}` : '';
	const kit = sinImagenes && extra.length ? `\n\nCatálogo de modelos 3D de juguete, listos para cualquier escena (mismo estilo: brillantes, cabezas grandes, colores limpios):\n${extra.map(([n, en]) => `- ${n}: ${en}`).join('\n')}` : '';
	return propios + kit;
};

const directionSchema = z.object({
	metafora: z.string().min(20),
	protagonista: z.string().min(3),
	mundo: z.enum(WORLD_NAMES),
	imagenes: z.array(z.object({nombre: z.string().regex(/^[a-z0-9_]{2,24}$/), en: z.string().min(8).max(220), tipo: z.enum(['objeto', 'lugar'])})).max(4),
	modelos: z.array(z.string()).max(8).optional(),
	momentos: z.array(z.object({palabra: z.string().min(1), ocurre: z.string().min(10)})).min(2).max(5),
	camara: z.string().min(10),
	claves: z.array(z.string()).min(1).max(2),
	recursos: z.array(z.string()).max(2).optional(),
});
export type Direction = z.infer<typeof directionSchema>;

// notes: what the author wrote this stretch must show. They win over every other rule.
export type SceneBrief = {text: string; words: Word[]; duration: number; thread: string | null; notes?: string[]; opening?: boolean};

// The opening scene carries the hook: what it must do in its first frames, for the art director and the writer.
const openingLine = (scene: SceneBrief) => (scene.opening ? `\n\nESTA ES LA ESCENA DE APERTURA: decide si alguien se queda.\n${GANCHO_VISUAL}\n- El primer momento cae en una de las dos primeras palabras: algo ya se mueve en el primer cuadro.` : '');

const authorLine = (scene: SceneBrief) => (scene.notes?.length ? `\n\nVISUAL DEL AUTOR, obligatorio en esta escena: ${scene.notes.join(' ')}` : '');

export const direct = async (profile: string, scene: SceneBrief) => {
	const catalog = offeredResources();
	const system = `Eres director de arte de videos explicativos verticales. No existen plantillas ni escenas prefabricadas: para cada idea inventas una imagen física, concreta y sorprendente, y la describes para que un programador la anime.
${STYLE}

Tu paleta real de recursos. Diseña con esto, porque es lo que se ve bien:
${sinImagenes ? `- Modelos 3D de juguete de la lista de abajo: personas, animales, muebles, aparatos, vehículos, edificios. Se mueven, giran y sus partes con nombre se animan.
- Dibujos 2D planos hechos con código, para lo que no esté en la lista: ilustración vectorial de colores planos y contorno oscuro grueso (un corazón, un pulmón, un billete, un ícono, un diagrama). Esta máquina no genera imágenes.` : '- Objetos fotorrealistas generados por IA: un corazón, un avión, una bombilla, un planeta. Se mueven, escalan, flotan y pueden multiplicarse por cientos.'}
- Rayos de luz suaves, partículas por miles, destellos, líneas brillantes que se dibujan, flechas de fuerza, anillos de energía.
- Piso negro espejo, luces desenfocadas, estrellas.
- Contadores y etiquetas cortas.
Evita lo que se ve pobre: cables, cilindros, abstracciones, cosas que deban deformarse o romperse. Si algo es abstracto, muéstralo con un objeto real y con movimiento de luz o partículas.

Recursos reales que se descargan solo si los pides. Usa uno cuando la escena muestre justo eso:
${catalog.map((r) => `- ${r.id}: ${r.about}`).join('\n')}${modelLine()}

Mundos de color disponibles:
${worldList}

Devuelve JSON:
- metafora: qué ve el espectador, en una o dos frases concretas.
- protagonista: el objeto principal.
- mundo: uno de la lista.
${sinImagenes ? '- imagenes: siempre lista vacía: esta máquina no genera imágenes. Si el protagonista no está en la lista de modelos, descríbelo en protagonista como dibujo 2D plano (forma, colores, contorno) y el programador lo pintará con código.' : '- imagenes: de 0 a 4 imágenes que se generarán con IA (al menos una si la escena no usa modelos). Son objetos reales y reconocibles, no conceptos: nombre corto en minúsculas, en con la descripción en inglés del objeto solo, y tipo objeto. Usa tipo lugar solo para un paisaje de fondo. Reutiliza los nombres del hilo si el objeto ya existe.'}
- momentos: de 2 a 5, en orden. palabra debe ser una palabra exacta de esta narración; ocurre dice qué cambia en pantalla en ese instante.
- camara: cómo se mueve y por qué.
- claves: una o dos palabras exactas de la narración que merecen resaltarse.
- recursos: ids de recursos reales que necesita esta escena, o lista vacía.${Object.keys(ofrecidos()).length ? '\n- modelos: nombres de la lista de modelos 3D que usa esta escena, o lista vacía.' : ''}`;
	const user = `${scene.thread ? `Hilo del video:\n${scene.thread}\n\n` : ''}Narración de esta escena (${scene.duration.toFixed(1)} s):\n${scene.text}${authorLine(scene)}${openingLine(scene)}${scene.notes?.length ? `\n\n${NOTES_RULE} Si choca con las reglas de estilo de arriba, gana el autor. Tu metáfora y tus momentos deben ser exactamente lo que pidió.` : ''}`;
	const known = (w: string) => {
		try {
			wordTime(scene.words, w);
			return true;
		} catch {
			return false;
		}
	};
	const check = (value: unknown) => {
		const d = value as Direction;
		const issues = [...d.momentos.map((m) => m.palabra), ...d.claves].filter((w) => !known(w)).map((w) => `"${w}" no es una palabra exacta de la narración`);
		const times = d.momentos.filter((m) => known(m.palabra)).map((m) => wordTime(scene.words, m.palabra));
		if (times.some((t, i) => i > 0 && t < times[i - 1])) issues.push('momentos deben ir en orden de la narración');
		(d.recursos ?? []).filter((id) => !catalog.some((r) => r.id === id)).forEach((id) => issues.push(`${id} no es un recurso de la lista`));
		(d.modelos ?? []).filter((n) => !(n in ofrecidos())).forEach((n) => issues.push(`${n} no es un modelo de la lista`));
		if (sinImagenes && d.imagenes.length) issues.push('esta máquina no genera imágenes: deja imagenes vacía y usa un modelo de la lista o describe el protagonista como dibujo 2D');
		if (!sinImagenes && !d.imagenes.length && !d.modelos?.length) issues.push('la escena necesita al menos una imagen o un modelo');
		if (scene.opening && times.length && times[0] - scene.words[0].start > 0.8) issues.push(`es la escena de apertura: el primer momento debe caer en una de las primeras palabras ("${scene.words[0].word}" o "${scene.words[1]?.word ?? scene.words[0].word}"), no en "${d.momentos[0].palabra}"`);
		return issues;
	};
	return askJson(targetFor(profile, 'direccion'), directionSchema, system, user, {temperature: 0.7, check});
};

// The 2D drawing example only matters when scenes may have no picture (local mode).
const examples = () =>
	readdirSync('scripts/estudio/ejemplos')
		.filter((f) => sinImagenes || !f.startsWith('dibujo'))
		.sort()
		.map((f) => '```ts\n' + readFileSync(`scripts/estudio/ejemplos/${f}`, 'utf8').trim() + '\n```')
		.join('\n\n');

const writerSystem = () => `Eres un programador gráfico experto en three.js. Escribes una escena de video vertical 1080 x 1920 como un programa corto. Tienes three.js completo más un kit con luz de estudio, piso, bokeh y texto.

${STYLE}

Reglas del programa:
- Escribe una sola llamada a escena(...), sin import ni export. Nada de window, document, fetch, Date ni Math.random: usa random(semilla).
- Todo es función de t. No guardes estado entre cuadros: t puede saltar a cualquier momento.
- Usa at('palabra') para que cada acción caiga en su palabra. Nunca escribas segundos a mano.
- Construye una vez y en la función devuelta solo mueve cosas. Nada de crear geometría dentro de (t) => {...}.
- Máximo 130 líneas. Prefiere pocas ideas bien hechas. No uses ShaderMaterial ni GLSL: combina materiales, dots, glow y line.
- Reutiliza variables: cada objeto se crea una sola vez y aparece o desaparece con scale, position o intensity.
- El protagonista es kit.model si la dirección trae modelos 3D; si no, kit.image con una imagen de tu lista. No lo modeles con geometría: una figura simple se ve pobre junto a una imagen o un modelo.${sinImagenes ? `
- Si la dirección no trae modelos ni imágenes, el protagonista es un dibujo 2D plano pintado con código (ver Dibujo 2D). Nunca un cubo, esfera o cilindro gris en su lugar.` : ''}
- Un modelo 3D sí puede girar, inclinarse y mostrarse de lado: aprovéchalo.
- Usa geometría y efectos solo para lo que rodea al protagonista: kit.beam, kit.dots, kit.glow, kit.line, kit.arrow, anillos.
- kit.glow es un acento: nunca más grande que el protagonista. Un halo blanco grande detrás de un objeto tapa la imagen.
- Una imagen es una tarjeta con relieve: casi siempre mira a la cámara. No la hagas girar: muévela, escálala o inclínala en z.
- Las imágenes miden lo que pidas con height. Un protagonista ocupa de 45 % a 70 % del ancho visible.
- Encuadre: el video es angosto. A una distancia d, con fov 50, se ven 0.93 d de alto y solo 0.52 d de ancho. Si el objeto mide m de ancho, ponte al menos a 2.2 m de distancia.
- Encuadra al protagonista con kit.camera.frame. Calcula por ti la distancia y deja libre la franja de texto.
- Si dos objetos comparten cuadro, agrúpalos en un THREE.Group y encuadra el grupo.
- Usa floor solo si el protagonista se apoya en y = 0; un piso bajo objetos flotantes crea reflejos raros. Usa stars para espacio. No uses floor y stars juntos.

${sinImagenes ? `Dibujo 2D (esta máquina no genera imágenes):
- Pinta el protagonista con Canvas 2D en kit.texture y ponlo en un plano con kit.material('glow', '#ffffff', {map, intensity: 1, opacity: 0.99}): glow conserva los colores exactos y opacity 0.99 respeta la transparencia del lienzo.
- Estilo de ilustración vectorial: formas con Path2D, rellenos planos, contorno oscuro grueso (3 a 4 % del ancho del lienzo), un brillo blanco translúcido y una sombra plana. Lienzo de 1024 px de ancho, proporcional al plano.
- El plano mira a la cámara. Anímalo moviendo, escalando o inclinando en z; para que cambie, repinta: guarda el contexto (tex.image como HTMLCanvasElement) y marca tex.needsUpdate solo cuando cambie lo pintado.
- Partes que se mueven (una tapa, una aguja, un brazo) van en planos aparte dentro de un THREE.Group, con el pivote en su borde.
- Un dibujo 2D convive con modelos 3D del catálogo y con los efectos del kit (glow, line, dots, arrow).

` : ''}API completa:
\`\`\`ts
${apiText()}
\`\`\`

Ejemplos de escenas buenas, de otros temas. Aprende la forma, no copies su contenido:

${examples()}

Responde solo con un bloque de código ts.`;

const resourceLine = (d: Direction) => {
	const list = offeredResources().filter((r) => d.recursos?.includes(r.id));
	return list.length ? `\n- Recursos reales, disponibles con kit.picture o kit.backdrop: ${list.map((r) => `'${r.id}': ${r.about}`).join('; ')}` : '';
};

const taskFor = (scene: SceneBrief, d: Direction, start: number, end: number) => `Narración de esta escena:
${scene.text}${authorLine(scene)}

Palabras disponibles para at(), con su segundo:
${scene.words.map((w) => `${w.word} ${w.start.toFixed(2)}`).join(', ')}

Esta escena va del segundo ${start.toFixed(2)} al ${end.toFixed(2)}.

Dirección de arte:
- Lo que ve el espectador: ${d.metafora}
- Protagonista: ${d.protagonista}
- Mundo: ${d.mundo}
- Cámara: ${d.camara}
- Imágenes disponibles para kit.image: ${d.imagenes.map((i) => `'${i.nombre}' (${i.tipo === 'lugar' ? 'fondo, usa kit.backdrop' : 'objeto'}): ${i.en}`).join('; ') || 'ninguna'}${d.modelos?.length ? `\n- Modelos 3D disponibles para kit.model: ${d.modelos.map((n) => `'${n}': ${describirModelo(n)}`).join('; ')}` : ''}${resourceLine(d)}${!d.imagenes.length && !d.modelos?.length ? '\n- Sin imagen ni modelo: dibuja el protagonista en 2D con kit.texture (ver Dibujo 2D).' : ''}
- Momentos:
${d.momentos.map((m) => `  - en "${m.palabra}": ${m.ocurre}`).join('\n')}${scene.opening ? `\n\nEscena de apertura (gancho). En el segundo ${start.toFixed(2)} el protagonista ya está en cuadro, grande y centrado, y algo se mueve: la cámara entra rápido o el objeto cae, gira o choca. Nada aparece desde escala 0 ni desde negro en el primer cuadro.` : ''}`;

const codeBlock = (text: string) => {
	const match = /```(?:ts|typescript|js|javascript)?\s*\n([\s\S]*?)\n```/.exec(text);
	return (match ? match[1] : text).trim();
};

const critiqueSchema = z.object({
	puntaje: z.number().min(0).max(10),
	se_entiende: z.boolean(),
	problemas: z.array(z.object({momento: z.number(), problema: z.string(), arreglo: z.string()})).max(3),
});
type Critique = z.infer<typeof critiqueSchema>;

const criticize = (profile: string, image: string, scene: SceneBrief, d: Direction): Promise<Critique> => {
	const system = `Eres un director de fotografía exigente. Recibes una tira con momentos de una escena de video vertical. Juzga solo lo que ves, sin suponer.
Puntaje: 9-10 listo para publicar. 7-8 bueno con detalles menores. 4-6 se entiende a medias o se ve pobre. 0-3 roto, vacío o irreconocible.
Baja el puntaje si: el protagonista no se reconoce, está cortado, es pequeño, parece una forma genérica, no se ve lo pedido en cada momento, hay elementos encimados, o la imagen se ve plana.
La franja superior con texto es normal. Lista solo los 3 problemas que más dañan la imagen, del más grave al menor. Cada arreglo debe ser un cambio simple: mover, escalar, cambiar color, brillo o tamaño, o agregar un objeto. Devuelve solo JSON.`;
	const user = `Narración: ${scene.text}
Intención: ${d.metafora}${scene.notes?.length ? `\nEl autor pidió ver esto; baja mucho el puntaje si no se cumple: ${scene.notes.join(' ')}` : ''}
Debe verse:
${d.momentos.map((m, i) => `${i + 1}. ${m.ocurre}`).join('\n')}`;
	return askJson(targetFor(profile, 'critico'), critiqueSchema, system, user, {temperature: 0.1, maxTokens: 2400, image});
};

const pick = (profile: string, imageA: string, imageB: string, out: string, scene: SceneBrief, d: Direction) => {
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', imageA, '-i', imageB, '-filter_complex', 'vstack', '-q:v', '3', out]);
	const system = `Comparas dos versiones de una misma escena de video vertical. Arriba está la versión A y abajo la B. Elige la que mejor comunica la idea y se ve más limpia, potente y profesional. Devuelve solo JSON.`;
	return askJson(targetFor(profile, 'comparador'), z.object({mejor: z.enum(['A', 'B']), motivo: z.string()}), system, `Narración: ${scene.text}\nIntención: ${d.metafora}${scene.notes?.length ? `\nGana la que más se acerque a lo que pidió el autor: ${scene.notes.join(' ')}` : ''}`, {temperature: 0.1, maxTokens: 1500, image: out});
};

const PATCH = `

No repitas el programa. Responde solo con uno o más bloques exactos:
<<<<
texto exacto que existe en tu versión
====
texto nuevo
>>>>`;

// A correction comes back as small replacements, which costs a fraction of the whole program. Anything that does not apply returns null.
const applyPatch = (code: string, answer: string) => {
	const blocks = [...answer.matchAll(/<<<<\n([\s\S]*?)\n====\n([\s\S]*?)\n?>>>>/g)];
	if (!blocks.length) return null;
	let patched = code;
	for (const [, from, to] of blocks) {
		if (!patched.includes(from)) return null;
		patched = patched.replace(from, () => to);
	}
	return patched;
};

// Every program closes the call to escena; an answer that stops before that was cut off on the way.
const cutOff = (code: string) => !/\}\s*\)\s*;?\s*$/.test(code.trim());

// When no version runs, the film still needs this stretch: the protagonist alone, with a slow push in. The report sends it to a person.
export const fallbackProgram = (d: Direction) => {
	const hero = d.imagenes.find((i) => i.tipo === 'objeto');
	const place = d.imagenes.find((i) => i.tipo === 'lugar');
	const model = d.modelos?.[0];
	if (!hero && model) {
		return `escena({world: '${d.mundo}', floor: true, bokeh: true}, ({kit, end}) => {
	const hero = kit.add(kit.model('${model}', {height: 3.6}));
	kit.camera.path([
		{time: 0, ...kit.camera.frame(hero, {fill: 0.55})},
		{time: end, ...kit.camera.frame(hero, {fill: 0.68, yaw: 0.2})},
	]);
	return (t) => {
		hero.rotation.y = Math.sin(t * 0.5) * 0.4;
	};
});
`;
	}
	if (hero) {
		return `escena({world: '${d.mundo}', floor: true, bokeh: true}, ({kit, end}) => {
	const hero = kit.add(kit.image('${hero.nombre}', {height: 3.6}));
	kit.camera.path([
		{time: 0, ...kit.camera.frame(hero, {fill: 0.55})},
		{time: end, ...kit.camera.frame(hero, {fill: 0.68, yaw: 0.2})},
	]);
	return (t) => {
		hero.position.y = Math.sin(t * 1.6) * 0.05;
	};
});
`;
	}
	if (!place) {
		// Local mode with nothing to show: the protagonist's name painted as a flat sign, with a slow push in.
		const nombre = JSON.stringify(d.protagonista.slice(0, 40).toUpperCase());
		return `escena({world: '${d.mundo}', floor: false, bokeh: true}, ({kit, end, THREE}) => {
	const tex = kit.texture(1024, 512, (c) => {
		c.fillStyle = '#14101c';
		c.beginPath();
		c.roundRect(16, 16, 992, 480, 64);
		c.fill();
		c.lineWidth = 18;
		c.strokeStyle = '#ffffff';
		c.stroke();
		c.fillStyle = '#ffffff';
		c.font = '900 92px Figtree, sans-serif';
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillText(${nombre}, 512, 262, 920);
	});
	const sign = kit.add(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), kit.material('glow', '#ffffff', {map: tex, intensity: 1, opacity: 0.99})));
	sign.position.set(0, 2, 0);
	kit.camera.path([
		{time: 0, position: [0, 1.6, 9], look: [0, 1.6, 0], fov: 50},
		{time: end, position: [0, 1.6, 8], look: [0, 1.6, 0], fov: 50, ease: 'linear'},
	]);
	return (t) => {
		sign.position.y = 2 + Math.sin(t * 1.4) * 0.05;
	};
});
`;
	}
	return `escena({world: '${d.mundo}', floor: false, bokeh: true}, ({kit}) => {
	kit.backdrop('${place.nombre}');
	kit.camera.still([0, 3, 10], [0, 3, 0], 45);
	return () => {};
});
`;
};

export type Attempt = {n: number; kind: string; score: number | null; issues: string[]; seconds: number; dollars: number};
export type SceneResult = {code: string; js: string; score: number; chosen: number; visual: number; attempts: Attempt[]};

type WriteOptions = {profile: string; renderer: Renderer; base: (code: string) => Film; shotId: string; scene: SceneBrief; direction: Direction; start: number; end: number; dir: string; previousCode: string | null; maxVisual: number; log: (...x: unknown[]) => void};

// The loop a person would run by hand: write, run, look, fix.
export const writeScene = async ({profile, renderer, base, shotId, scene, direction, start, end, dir, previousCode, maxVisual, log}: WriteOptions): Promise<SceneResult> => {
	const moments = direction.momentos.slice(0, 3).map((m) => wordTime(scene.words, m.palabra) + 0.45);
	const seconds = [...moments, end - 0.2].map((s) => Math.max(start + 0.05, Math.min(end - 0.1, s)));
	const continuity = previousCode ? `\n\nEscena anterior del mismo video. Si el protagonista aparece aquí, reutiliza exactamente su construcción para que se vea igual:\n\`\`\`ts\n${previousCode}\n\`\`\`` : '';
	const task = taskFor(scene, direction, start, end) + continuity;
	const attempts: Attempt[] = [];
	const maxCalls = maxVisual + 3;
	let feedback = '';
	let previous = '';
	let visual = 0;
	let best: SceneResult | null = null;
	for (let call = 1; call <= maxCalls && visual < maxVisual; call++) {
		const started = Date.now();
		const paid = spend.dollars;
		const note = (kind: string, score: number | null, list: string[]) => {
			attempts.push({n: call, kind, score, issues: list, seconds: (Date.now() - started) / 1000, dollars: spend.dollars - paid});
			log(`intento ${call}: ${kind}${score === null ? '' : ` ${score}/10`}${list.length ? ` | ${list[0].slice(0, 150)}` : ''}`);
		};
		const fix = `${task}\n\nTu versión anterior:\n\`\`\`ts\n${previous}\n\`\`\`\n\nCorrige solo esto, con cambios pequeños, sin reescribir lo que funciona y sin agregar complejidad:\n${feedback}`;
		let code: string;
		try {
			if (previous) {
				const answer = await askText(targetFor(profile, 'correccion'), writerSystem(), fix + PATCH, {temperature: 0.2});
				const whole = !answer.includes('<<<<') && answer.includes('escena(') ? codeBlock(answer) : null;
				const patched = applyPatch(previous, answer) ?? whole;
				if (!patched) log('  el parche no aplicó; pido el programa completo');
				code = patched ?? codeBlock(await askText(targetFor(profile, 'correccion'), writerSystem(), fix, {temperature: 0.2}));
			} else code = codeBlock(await askText(targetFor(profile, 'escritor'), writerSystem(), task, {temperature: 0.35}));
		} catch (e) {
			if (outOfCredit(e) || e instanceof PedidoPendiente) throw e;
			note('sin respuesta', null, [String(e).slice(0, 200)]);
			continue;
		}
		writeFileSync(`${dir}/intento_${call}.ts`, code);
		// A cut answer or a correction that changed nothing gives the loop nothing new to check: start that version again from the task.
		if (cutOff(code)) {
			note('respuesta cortada', null, ['el programa no termina']);
			previous = '';
			continue;
		}
		if (code === previous) {
			note('sin cambios', null, ['la corrección devolvió el mismo programa']);
			previous = '';
			continue;
		}
		previous = code;
		const {js, issues} = checkProgram(code);
		if (!js) {
			note('rechazo técnico', null, issues);
			feedback = issues.map((x) => `- ${x}`).join('\n');
			continue;
		}
		const prefix = `${dir}/intento_${call}`;
		let shots: {files: string[]; logs: string[]};
		try {
			shots = await renderer.stills(base(js), shotId, seconds, prefix);
		} catch (e) {
			const message = String(e).split('\n')[0].slice(0, 300);
			note('fallo al ejecutar', null, [message]);
			feedback = `- Error al ejecutar: ${message}`;
			continue;
		}
		if (shots.logs.length) {
			note('error de render', null, shots.logs.slice(0, 2));
			feedback = shots.logs.slice(0, 2).map((x) => `- ${x}`).join('\n');
			continue;
		}
		visual++;
		const image = makeSheet(shots.files, `${prefix}.jpg`, seconds);
		const measures = measure(shots.files);
		// A critic that fails must not sink the film: the scene keeps its measures and the loop goes on.
		const review = await criticize(profile, image, scene, direction).catch((e): Critique => {
			if (outOfCredit(e) || e instanceof PedidoPendiente) throw e;
			log(`  crítico sin respuesta: ${String(e).slice(0, 120)}`);
			return {puntaje: measures.issues.length ? 3 : 5, se_entiende: true, problemas: []};
		});
		releaseLocal();
		writeFileSync(`${prefix}.json`, JSON.stringify({review, measures}, null, 1));
		const blockers = [...measures.issues, ...review.problemas.map((p) => `momento ${p.momento}: ${p.problema}. Arreglo: ${p.arreglo}`)];
		const score = measures.issues.length ? Math.min(review.puntaje, 6) : review.puntaje;
		note('revisión', score, blockers);
		// Absolute scores barely move between versions, so the best one is chosen by looking at both.
		if (!best) best = {code, js, score, chosen: call, visual, attempts};
		else {
			const verdict = await pick(profile, `${dir}/intento_${best.chosen}.jpg`, image, `${prefix}_comparacion.jpg`, scene, direction).catch((e) => {
				if (outOfCredit(e) || e instanceof PedidoPendiente) throw e;
				return {mejor: 'A' as const, motivo: 'sin respuesta'};
			});
			log(`  comparación: ${verdict.mejor === 'B' ? `gana intento ${call}` : `sigue intento ${best.chosen}`}`);
			if (verdict.mejor === 'B') best = {code, js, score, chosen: call, visual, attempts};
		}
		if (score >= PASS && review.se_entiende) break;
		feedback = blockers.map((x) => `- ${x}`).join('\n') || '- Sube la calidad visual: protagonista más grande, reconocible y con más contraste.';
	}
	if (!best) {
		const code = fallbackProgram(direction);
		writeFileSync(`${dir}/respaldo.ts`, code);
		const {js, issues} = checkProgram(code);
		if (!js) throw new Error(`ningún intento produjo una escena que corra, y el respaldo tampoco: ${issues[0]}`);
		log('  ningún intento corrió; uso escena de respaldo y la marco para revisar');
		attempts.push({n: attempts.length + 1, kind: 'respaldo', score: 0, issues: [], seconds: 0, dollars: 0});
		return {code, js, score: 0, chosen: 0, visual, attempts};
	}
	return {...best, visual, attempts};
};

// A file cut short by a crash or a power loss is treated as missing, so that piece is made again instead of stopping the run.
export const cached = <T>(file: string): T | null => {
	if (!existsSync(file)) return null;
	try {
		return JSON.parse(readFileSync(file, 'utf8')) as T;
	} catch {
		console.log(`  ${file} está dañado; se rehace`);
		return null;
	}
};
