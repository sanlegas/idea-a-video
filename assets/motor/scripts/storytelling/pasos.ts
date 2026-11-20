// Steps of the storytelling flow, from a topic or a guion to a film. Each declares who does it (code, local GPU or a
// cloud LLM), what it writes and an estimate for `--plan`. Narration and pictures come from the providers of
// config/medios.json (scripts/lib/voz.ts and scripts/lib/imagenes.ts); the final mix is the Tinta step, reused as it is.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {z} from 'zod';
import type {Word} from '../../src/estudio/film';
import {estilizar, PRESET_IDS, PRESETS, type PresetId} from '../../src/storytelling/estilo';
import {ACTO_ES, ACTOS, CAMARAS, FPS, ENFOQUES, GRADOS, LOOK_IDS, LOOKS, norma, revisarPelicula, TEXTO_APARECE, TEXTO_ESTILOS, TEXTO_POSICION, TRANSICIONES, type Acto, type Estilo, type LookId, type Pelicula, type Plano} from '../../src/storytelling/formato';
import {sintetizar, type Golpe} from '../explica/sonido';
import {GANCHO, GANCHO_GUION, GANCHO_VISUAL, revisarGancho} from '../lib/gancho';
import {annotatedText, NOTES_RULE, readGuion, type Guion} from '../lib/guion';
import {prepararEntorno} from '../lib/entorno';
import {conseguirImagenes, origenDe, type Pedido} from '../lib/imagenes';
import {askJson, targetFor} from '../lib/llm';
import {medios, type ProveedorImagen, type ProveedorVoz} from '../lib/medios';
import {mezclarMuestras, type Toque} from '../lib/muestras';
import {ANIMOS, mezclarMusica, modoMusica, MODOS, pistas, planDeAnimos, revisarPlan, type Animo, type Modo, type PlanMusical, type Trozo} from '../lib/musica';
import type {Log, Paso} from '../lib/orquestador';
import {estiloPreferido} from '../lib/preferencias';
import {narrar} from '../lib/voz';
import {PASOS as PASOS_TINTA} from '../tinta/pasos';
import {remotion} from '../lib/sistema';

// estilo names the preset of the `estilo` step and musica the kind of background music; aMano marks the answers a person brought, which are checked and never redone.
// voz and imagenes say where narration and pictures come from in this run. `borrador` voice and `placas` pictures
// need no GPU, no key and no network: word times are estimated and pictures stay as labelled plates.
export type Ctx = {nombre: string; dir: string; pub: string; perfil: string; log: Log; voz: ProveedorVoz; imagenes: ProveedorImagen[]; aMano: {direccion: boolean; planos: boolean; estilo: boolean; musica: boolean}; estilo?: PresetId; musica?: Modo; tema?: string; fuentes?: string; segundos: number};

// What --plan assumes before the real numbers exist.
export type Supuestos = {segundos: number; palabras: number; planos: number; imagenes: number; segundosPorImagen: number};

const leer = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8'));
const escribir = (f: string, v: unknown) => writeFileSync(f, JSON.stringify(v, null, 1));
const guionDe = (ctx: Ctx): Guion => readGuion(readFileSync(`${ctx.dir}/guion.md`, 'utf8'));
const palabrasDe = (ctx: Ctx) => leer<{duration: number; words: Word[]}>(`${ctx.dir}/palabras.json`);
const tinta = (id: string) => PASOS_TINTA.find((p) => p.id === id)!;

// Voices narrate at 2.5 to 2.7 words per second, pauses between sentences included (measured with a cloned voice,
// the system voice and Piper). The estimate of --plan uses this until the real voice has been timed.
export const PALABRAS_POR_SEGUNDO = 2.6;
// Sentences are narrated one by one, as in Tinta.
const frases = (texto: string) => texto.split('\n').flatMap((l) => l.match(/[^.?!]+[.?!]+["»]?|[^.?!]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
// List prices of the default cloud model (config/models.json), at off-peak rates; peak hours cost double.
const dolaresLLM = (entrada: number, salida: number) => (entrada * 0.15 + salida * 0.6) / 1e6;
const MAX_IMAGENES = 24;

// ---------------------------------------------------------------- pacing, measured on the five reference shorts

// Median shot 1.3–2.4 s, mean 1.8–3.9 s, longest single shot of the body under 9 s; the hook is 10–30 % of the film.
const RITMO = {minimo: 0.45, maximo: 7, media: 3.6, gancho: 0.35, narrador: 0.35, laminas: [0.15, 0.55] as const, titular: 14};

// ---------------------------------------------------------------- schemas

const guionSchema = z.object({titulo: z.string(), partes: z.array(z.object({acto: z.enum(ACTOS), frases: z.array(z.string())}))});

const direccionSchema = z.object({
	look: z.enum(LOOK_IDS as [LookId, ...LookId[]]),
	personaje_en: z.string(),
	ambiente_en: z.string(),
	actos: z.array(z.object({acto: z.enum(ACTOS), primera: z.number().int(), ultima: z.number().int()})),
});
export type Direccion = z.infer<typeof direccionSchema>;

const planosSchema = z.object({
	planos: z.array(
		z.object({
			primera: z.number().int(),
			ultima: z.number().int(),
			tipo: z.enum(['escena', 'narrador', 'lamina']),
			imagen_en: z.string().nullable(),
			busca_en: z.string().nullable(),
			tratamiento: z.enum(['color', 'archivo']).nullable(),
			encuadre: z.enum(['abierto', 'medio', 'detalle']).nullable(),
			foco: z.enum(['arriba', 'centro', 'abajo']).nullable(),
			bloque: z.enum(['titular', 'recorte', 'dato', 'cita']).nullable(),
			clave: z.array(z.string()),
			etiqueta: z.string().nullable(),
			valor: z.number().nullable(),
			prefijo: z.string().nullable(),
			sufijo: z.string().nullable(),
			autor: z.string().nullable(),
		}),
	),
});
export type PlanosLLM = z.infer<typeof planosSchema>;

const llaves = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const textoSchema = z.object({estilo: z.enum(llaves(TEXTO_ESTILOS)), aparece: z.enum(llaves(TEXTO_APARECE)), posicion: z.enum(llaves(TEXTO_POSICION))});
const estiloSchema = z.object({
	preset: z.string(),
	texto: textoSchema,
	grado: z.enum(llaves(GRADOS)),
	planos: z.array(z.object({transicion: z.enum(llaves(TRANSICIONES)), camara: z.enum(llaves(CAMARAS)), enfoque: z.enum(llaves(ENFOQUES)), texto: textoSchema.partial().optional()})),
});
const estiloDe = (ctx: Ctx, planos: number): Estilo => {
	if (!existsSync(`${ctx.dir}/estilo.json`)) throw new Error('falta estilo.json: corre --desde estilo');
	const leido = estiloSchema.safeParse(leer(`${ctx.dir}/estilo.json`));
	// Says which shot and which field, in the words of the file, instead of a schema dump.
	if (!leido.success) throw new Error(`estilo.json con problemas:\n- ${leido.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('\n- ')}`);
	const e = leido.data;
	if (e.planos.length !== planos) throw new Error(`estilo.json trae ${e.planos.length} planos y planos.json, ${planos}: corre --desde estilo, o corrige el archivo`);
	return e;
};

// ---------------------------------------------------------------- prompts

const LISTA_ACTOS = ACTOS.map((a) => `- ${a}: ${ACTO_ES[a]}`).join('\n');

const SISTEMA_GUION = `Eres guionista de videos verticales cortos de divulgación con formato storytelling: una idea de psicología, ciencia o vida diaria contada como historia, en español de México, hablándole de tú a quien mira.
Escribes solo lo que dirá la voz. Estructura, en este orden (puedes omitir historia o ejemplos si el tema no los tiene):
${LISTA_ACTOS}

Reglas:
- El gancho arranca en plena acción ("Vas entrando a…", "Imagínate que…", o una línea de diálogo). Ocupa entre 10 y 30 % del texto y termina en un remate.
- Frases cortas, de 6 a 16 palabras. Una idea por frase. Lenguaje de plática, concreto y visual: cosas que se pueden mostrar.
- La tesis es una sola frase que se puede citar.
- Repite la idea central con otras palabras justo después del giro.
- El cierre retoma un objeto o momento del gancho.
- Números con letra ("veintitrés minutos"), sin siglas ni símbolos.
- Hechos: usa solo los datos, nombres y estudios que vengan en FUENTES. Si no hay FUENTES, no cites estudios, cifras ni personas reales: cuenta el caso como experiencia cotidiana. Nunca inventes un dato.
- Largo: el que se pide, con 10 % de margen.

${GANCHO_GUION}
Responde solo JSON.`;

const SISTEMA_DIRECCION = `Eres director de videos verticales cortos con formato storytelling. Recibes la narración con cada frase numerada y decides tres cosas antes de cortar planos.

1. actos: a qué momento de la historia pertenece cada frase. Tramos seguidos: cada uno va de la frase "primera" a la "ultima"; el siguiente empieza en ultima+1; el primero empieza en 0 y el último termina en la última frase.
${LISTA_ACTOS}
El primer tramo siempre es gancho. Usa solo los actos que el texto tiene de verdad.

2. look: el sistema gráfico de todo el video. Uno solo:
${LOOK_IDS.map((k) => `- ${k}: ${LOOKS[k].about}`).join('\n')}

3. personaje_en: en inglés, quien vive la escena del gancho, descrito para un generador de imágenes: edad aproximada, pelo, ropa de un solo color. Una persona genérica, nunca alguien real ni famoso. Ej.: "a young man in his twenties with short dark hair wearing a plain white shirt".
   ambiente_en: en inglés, el cuarto vacío desde donde habla el narrador, coherente con el tema. Ej.: "a small home office at night with a desk lamp and a bookshelf".
Responde solo JSON.`;

const SISTEMA_PLANOS = `Eres editor de videos verticales cortos con formato storytelling: corte rápido, cada plano dura lo que dura una idea. La voz narra; tú decides qué se ve en cada tramo de palabras.
Recibes la narración con cada palabra numerada, marcada por actos, y el look del video.

Planos: tramos seguidos de palabras. Cada plano va de "primera" a "ultima"; el siguiente empieza en ultima+1; el primero empieza en 0 y el último termina en la última palabra.
Ritmo: un plano dura de 1 a 4 segundos (3 a 12 palabras). Nunca más de ${RITMO.maximo} segundos. Corta en comas, puntos y cambios de idea. En el gancho corta más rápido: 1 a 2,5 segundos.

Tres tipos de plano:

A) "escena": una fotografía a cuadro completo de lo que se cuenta.
- imagen_en: en inglés, una sola toma concreta y física: quién, qué hace, dónde, desde qué ángulo. Escribe PROTAGONISTA donde aparezca el personaje del gancho (el código pone su descripción). Sin texto en la imagen. Nunca personas reales ni famosas: si la narración nombra a alguien real, muestra un objeto, un lugar o una figura de espaldas o en silueta.
- busca_en: 2 o 3 palabras clave en inglés para buscar esa misma toma en un banco de fotos (ej.: "alarm clock", "hand phone night"); menos palabras encuentran más. Prefiere objetos, manos y lugares a rostros. Va en todo plano que lleve imagen_en; en los demás, null.
- Para cortar sin cambiar de imagen repite EXACTAMENTE el mismo imagen_en con otro encuadre: así se hace un acercamiento de golpe. Dos planos seguidos con el mismo imagen_en deben cambiar de encuadre. Máximo ${MAX_IMAGENES} imagen_en distintos en todo el video; reutiliza.
- encuadre: "abierto" (toda la toma), "medio" o "detalle" (muy cerca). foco: qué parte se acerca: "arriba" (caras), "centro" o "abajo" (manos, mesa, objetos).
- tratamiento: "color" para lo que pasa hoy; "archivo" (foto antigua en blanco y negro con trama) para historia, estudios y casos del pasado.

B) "narrador": no hay imagen; la frase aparece grande sobre un cuarto oscuro, como si alguien te la dijera de frente. Úsalo para opiniones, transiciones ("y aquí es donde…", "pero…") y frases dirigidas a quien mira. Nunca en el gancho. Deja imagen_en, tratamiento, encuadre, foco y bloque en null.

C) "lamina": gráfico animado sobre el fondo del look. Lleva bloque:
- "titular": las palabras del plano aparecen como tipografía grande. Para la tesis, definiciones y frases que deben quedarse. Máximo ${RITMO.titular} palabras. clave: 1 a 3 palabras del plano que van con marcador.
- "recorte": un objeto o figura recortada con una etiqueta. imagen_en: UN solo sujeto, sin fondo ni escena (ej.: "a human brain", "an old rotary phone"). etiqueta: 1 a 3 palabras en español. Para explicar un mecanismo.
- "dato": un número que cuenta hasta su valor. valor: el número; prefijo y sufijo ("%", " min", "x"); etiqueta: 2 a 4 palabras que dicen qué mide. Solo para cifras que la narración dice en ese plano.
- "cita": una foto enmarcada con el nombre de quien hizo o dijo algo. autor: el nombre tal como lo dice la narración. imagen_en: nunca la persona real; su entorno, su herramienta o una figura de espaldas.
En láminas deja encuadre y foco en null, y tratamiento en null.

Reglas del formato:
- Todo el gancho son escenas: es un sketch. Al menos 3 planos, con acercamientos de golpe.
- El primer plano dura como máximo 2,5 segundos y muestra justo lo que dice la primera frase, en encuadre medio o detalle: es la imagen que detiene a quien pasa el dedo.
- La tesis lleva al menos una lámina titular.
- Alterna: no más de 3 planos seguidos del mismo tipo fuera del gancho.
- Las láminas ocupan entre 15 y 55 % del tiempo; el narrador, no más de 35 %.
- clave siempre son palabras que están dentro del plano. En escena y narrador, clave va vacío.
- Los campos que no aplican van en null.

${GANCHO_VISUAL}
Responde solo JSON.`;

// ---------------------------------------------------------------- checks

const revisarGuion = (g: z.infer<typeof guionSchema>, objetivo: number) => {
	const p: string[] = [];
	const todas = g.partes.flatMap((x) => x.frases);
	const n = todas.join(' ').split(/\s+/).filter(Boolean).length;
	if (n < objetivo * 0.8 || n > objetivo * 1.2) p.push(`el guion tiene ${n} palabras y debe tener cerca de ${objetivo}`);
	if (g.partes[0]?.acto !== 'gancho') p.push('la primera parte debe ser el gancho');
	if (!g.partes.some((x) => x.acto === 'tesis')) p.push('falta la tesis');
	const gancho = g.partes[0]?.frases.join(' ').split(/\s+/).length ?? 0;
	if (gancho > n * RITMO.gancho) p.push(`el gancho ocupa ${Math.round((gancho / n) * 100)} % del texto; máximo ${RITMO.gancho * 100} %`);
	const largas = todas.filter((f) => f.split(/\s+/).length > 22);
	if (largas.length) p.push(`${largas.length} frases pasan de 22 palabras: pártelas`);
	if (/\d/.test(todas.join(' '))) p.push('escribe los números con letra');
	p.push(...revisarGancho(todas.join(' ')));
	return p;
};

const revisarDireccion = (d: Direccion, lineas: string[]) => {
	const p: string[] = [];
	d.actos.forEach((a, i) => {
		const esperada = i === 0 ? 0 : d.actos[i - 1].ultima + 1;
		if (a.primera !== esperada) p.push(`el tramo ${i + 1} empieza en la frase ${a.primera} y debe empezar en ${esperada}`);
		if (a.ultima < a.primera) p.push(`el tramo ${i + 1} termina antes de empezar`);
	});
	if (d.actos[0]?.acto !== 'gancho') p.push('el primer tramo debe ser gancho');
	if (d.actos.length && d.actos[d.actos.length - 1].ultima !== lineas.length - 1) p.push(`el último tramo debe terminar en la frase ${lineas.length - 1}`);
	const cuenta = (desde: number, hasta: number) => lineas.slice(desde, hasta + 1).join(' ').split(/\s+/).length;
	const total = cuenta(0, lineas.length - 1);
	if (d.actos[0] && cuenta(d.actos[0].primera, d.actos[0].ultima) > total * RITMO.gancho + 12) p.push(`el gancho es demasiado largo: debe ser menos de ${RITMO.gancho * 100} % del texto`);
	if (!d.personaje_en.trim() || !d.ambiente_en.trim()) p.push('faltan personaje_en o ambiente_en');
	return p;
};

// Act of every word, from the act of its sentence.
const actoDePalabras = (d: Direccion, words: Word[]): Acto[] => words.map((w) => d.actos.find((a) => w.line >= a.primera && w.line <= a.ultima)?.acto ?? 'cierre');

export const revisarPlanos = (r: PlanosLLM, words: Word[], duracion: number, d: Direccion) => {
	const p: string[] = [];
	const s = r.planos;
	const actos = actoDePalabras(d, words);
	const ok = s.every((x, i) => x.primera === (i === 0 ? 0 : s[i - 1].ultima + 1) && x.ultima >= x.primera && x.ultima < words.length);
	s.forEach((x, i) => {
		const esperada = i === 0 ? 0 : s[i - 1].ultima + 1;
		if (x.primera !== esperada) p.push(`plano ${i + 1} empieza en ${x.primera} y debe empezar en ${esperada}`);
		if (x.ultima < x.primera) p.push(`plano ${i + 1} termina antes de empezar`);
	});
	if (s.length && s[s.length - 1].ultima !== words.length - 1) p.push(`el último plano debe terminar en la palabra ${words.length - 1}`);
	// Timing rules need a clean partition; report it first and stop.
	if (!ok || p.length) return p;

	const inicio = (i: number) => (i === 0 ? 0 : words[s[i].primera].start);
	const dur = s.map((_, i) => (i + 1 < s.length ? inicio(i + 1) : duracion) - inicio(i));
	const tiempo = (f: (x: PlanosLLM['planos'][number]) => boolean) => s.reduce((a, x, i) => a + (f(x) ? dur[i] : 0), 0);
	const imagenes = new Set<string>();
	s.forEach((x, i) => {
		const id = `plano ${i + 1} (${x.tipo}, palabras ${x.primera}-${x.ultima})`;
		const acto = actos[x.primera];
		if (dur[i] > RITMO.maximo) p.push(`${id}: dura ${dur[i].toFixed(1)} s; pártelo en planos de menos de ${RITMO.maximo} s`);
		if (dur[i] < RITMO.minimo) p.push(`${id}: dura ${dur[i].toFixed(1)} s; únelo al plano de al lado`);
		if (acto === 'gancho' && x.tipo !== 'escena') p.push(`${id}: está en el gancho y debe ser escena`);
		const dentro = new Set(words.slice(x.primera, x.ultima + 1).map((w) => norma(w.word)));
		const fuera = x.clave.filter((k) => !dentro.has(norma(k)));
		if (fuera.length) p.push(`${id}: clave ${fuera.join(', ')} no está entre las palabras del plano`);
		if (x.tipo === 'escena') {
			if (!x.imagen_en?.trim()) p.push(`${id}: una escena necesita imagen_en`);
			if (!x.encuadre || !x.foco || !x.tratamiento) p.push(`${id}: una escena necesita encuadre, foco y tratamiento`);
			const antes = s[i - 1];
			if (antes?.tipo === 'escena' && antes.imagen_en === x.imagen_en && antes.encuadre === x.encuadre) p.push(`${id}: repite imagen y encuadre del plano anterior; cambia el encuadre o únelos`);
			if (x.imagen_en) imagenes.add(x.imagen_en);
		}
		if (x.tipo === 'lamina') {
			if (!x.bloque) p.push(`${id}: una lámina necesita bloque`);
			if (x.bloque === 'titular' && x.ultima - x.primera + 1 > RITMO.titular) p.push(`${id}: un titular lleva máximo ${RITMO.titular} palabras`);
			if (x.bloque === 'titular' && !x.clave.length) p.push(`${id}: un titular necesita 1 a 3 palabras en clave`);
			if (x.bloque === 'recorte' && (!x.imagen_en?.trim() || !x.etiqueta?.trim())) p.push(`${id}: un recorte necesita imagen_en y etiqueta`);
			if (x.bloque === 'dato' && x.valor === null) p.push(`${id}: un dato necesita valor`);
			if (x.bloque === 'cita' && !x.autor?.trim()) p.push(`${id}: una cita necesita autor`);
			if (x.imagen_en) imagenes.add(x.imagen_en);
		}
	});
	const media = duracion / s.length;
	if (media > RITMO.media) p.push(`los planos duran ${media.toFixed(1)} s en promedio; corta más: el promedio debe quedar bajo ${RITMO.media} s`);
	if (tiempo((x) => x.tipo === 'narrador') > duracion * RITMO.narrador) p.push(`el narrador ocupa más de ${RITMO.narrador * 100} % del tiempo: cambia planos de narrador por escenas o láminas`);
	const laminas = tiempo((x) => x.tipo === 'lamina') / duracion;
	if (laminas < RITMO.laminas[0]) p.push(`las láminas ocupan ${Math.round(laminas * 100)} %; deben ocupar al menos ${RITMO.laminas[0] * 100} %`);
	if (laminas > RITMO.laminas[1]) p.push(`las láminas ocupan ${Math.round(laminas * 100)} %; máximo ${RITMO.laminas[1] * 100} %`);
	const delGancho = s.filter((x) => actos[x.primera] === 'gancho');
	if (delGancho.length < 3) p.push('el gancho necesita al menos 3 planos');
	// The first shot is what stops the scroll: short, and never a wide establishing shot.
	if (dur[0] > GANCHO.primerPlano) p.push(`el primer plano dura ${dur[0].toFixed(1)} s: el primero debe durar menos de ${GANCHO.primerPlano} s; pártelo`);
	if (s[0].tipo === 'escena' && s[0].encuadre === 'abierto') p.push('el primer plano es abierto: ábrelo en medio o detalle sobre lo que dice la primera frase');
	if (actos.includes('tesis') && !s.some((x) => actos[x.primera] === 'tesis' && x.bloque === 'titular')) p.push('la tesis debe llevar una lámina titular');
	if (imagenes.size > MAX_IMAGENES) p.push(`hay ${imagenes.size} imágenes distintas; máximo ${MAX_IMAGENES}: repite imagen_en con otro encuadre`);
	for (let i = 3; i < s.length; i++) {
		if (actos[s[i].primera] !== 'gancho' && [1, 2, 3].every((k) => s[i - k].tipo === s[i].tipo && (s[i].tipo !== 'lamina' || s[i - k].bloque === s[i].bloque))) {
			p.push(`planos ${i - 2} a ${i + 1}: cuatro seguidos de tipo ${s[i].tipo}; alterna`);
			break;
		}
	}
	return p;
};

// ---------------------------------------------------------------- music

// The story in four moments, each with the mood its music should have. A track changes only where the moment does.
const MOMENTOS: Record<Acto, {momento: string; animo: Animo}> = {
	gancho: {momento: 'apertura', animo: 'tension'},
	tesis: {momento: 'desarrollo', animo: 'curiosidad'},
	historia: {momento: 'desarrollo', animo: 'curiosidad'},
	mecanismo: {momento: 'desarrollo', animo: 'curiosidad'},
	ejemplos: {momento: 'desarrollo', animo: 'curiosidad'},
	giro: {momento: 'giro', animo: 'oscuro'},
	aplicacion: {momento: 'cierre', animo: 'esperanza'},
	cierre: {momento: 'cierre', animo: 'esperanza'},
};
const planMusicalSchema = z.object({
	modo: z.enum(MODOS),
	nivel: z.number(),
	tramos: z.array(z.object({momento: z.string(), animo: z.enum(Object.keys(ANIMOS) as [Animo, ...Animo[]]), desde: z.number(), hasta: z.number(), pista: z.string(), inicio: z.number()})),
});

const trozosDe = (f: Pelicula): Trozo[] => f.planos.map((p) => ({...MOMENTOS[p.acto], desde: p.desde, hasta: p.hasta}));

const planMusicalDe = (ctx: Ctx): PlanMusical | null => (existsSync(`${ctx.dir}/musica.json`) ? planMusicalSchema.parse(leer(`${ctx.dir}/musica.json`)) : null);

// ---------------------------------------------------------------- pictures

const SUFIJO = {
	// Written as a director of photography would brief a shot: lens, where light comes from, depth, air.
	color: (luz: string) => `, cinematic film still shot on a 35mm anamorphic lens, ${luz}, motivated practical light with a soft rim light on the subject, light haze in the air, deep shadows, layered depth with foreground and background, shallow depth of field with soft bokeh, subtle film grain, vertical composition, no text, no watermark`,
	archivo: ', black and white archival press photograph, mid-century, soft focus, heavy film grain, vertical composition, no text, no watermark',
	recorte_papel: ', single subject, high contrast black and white studio photograph, centered, whole subject visible, isolated on a pure white background, no text',
	recorte_oscuro: ', single subject, black and white studio photograph with a soft rim light, centered, whole subject visible, isolated on a pure black background, no text',
	ambiente: (luz: string) => `, empty room with no people, ${luz}, one small practical lamp in the background, out of focus, vertical composition, no text`,
};

// Keywords for a photo search when the plan gives none: the first content words of the description.
const VACIAS = new Set('a an the of in on at with and its his her to from by for is are seen view close extreme very whose that each their own out into across no only as while it this up down over under behind front'.split(' '));
const buscaDe = (texto: string) => texto.toLowerCase().replace(/protagonista/g, 'person').replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !VACIAS.has(w)).slice(0, 4).join(' ');

// The same words from the same origin always give the same file, so a repeated shot costs one picture and a rerun
// costs none. Another provider or model gets other files: pictures of one origin are never passed off as another's.
const pedido = (ctx: Ctx, clase: Pedido['clase'], prompt: string, busca: string, ancho: number, alto: number): Pedido => {
	const id = createHash('sha1').update(`${origenDe(ctx.imagenes)}|${prompt}|${ancho}x${alto}`).digest('hex').slice(0, 12);
	return {id, archivo: `storytelling/${ctx.nombre}/img/${id}.png`, prompt, busca, ancho, alto, clase};
};

const pedidoDe = (ctx: Ctx, x: PlanosLLM['planos'][number], d: Direccion): Pedido | null => {
	if (!x.imagen_en?.trim()) return null;
	const look = LOOKS[d.look];
	const base = x.imagen_en.trim().replace(/PROTAGONISTA/g, d.personaje_en.trim());
	const busca = x.busca_en?.trim() || buscaDe(x.imagen_en);
	if (x.tipo === 'escena') return pedido(ctx, 'escena', base + (x.tratamiento === 'archivo' ? SUFIJO.archivo : SUFIJO.color(look.luz_en)), busca, 864, 1536);
	if (x.bloque === 'recorte') return pedido(ctx, 'recorte', base + (look.oscuro ? SUFIJO.recorte_oscuro : SUFIJO.recorte_papel), `${busca} isolated`, 1024, 1024);
	// A photo found in a bank may show a real person, and on this card it would sit under someone else's name.
	if (x.bloque === 'cita') return soloBanco(ctx) ? null : pedido(ctx, 'cita', base + SUFIJO.archivo, busca, 1024, 1024);
	return null;
};
// Pictures only from photo banks: nothing in the chain draws what is asked. The narrator's room is then drawn by
// code and quote cards carry no photo, because a found picture cannot be trusted to show what those two need.
const soloBanco = (ctx: Ctx) => ctx.imagenes.includes('stock') && !ctx.imagenes.some((p) => p === 'local' || p === 'nube');
const pedidoAmbiente = (ctx: Ctx, d: Direccion) => pedido(ctx, 'ambiente', d.ambiente_en.trim() + SUFIJO.ambiente(LOOKS[d.look].luz_en), `${buscaDe(d.ambiente_en)} dark`, 864, 1536);
const sinGpu = (ctx: Ctx) => ctx.voz !== 'local' && !ctx.imagenes.includes('local');

// ---------------------------------------------------------------- steps

export const PASOS: Paso<Ctx, Supuestos>[] = [
	{
		id: 'entorno',
		titulo: 'Revisar la máquina',
		quien: 'código',
		con: 'ffmpeg, disco, clave del LLM pedido y, si la voz o las imágenes son locales, los modelos de esta máquina',
		produce: [],
		estima: () => ({segundos: 30, dolares: 0}),
		run: async (ctx) => {
			ctx.log(`voz: ${ctx.voz}; imágenes: ${ctx.imagenes.join(' > ')}`);
			await prepararEntorno({perfil: ctx.perfil, usaLocal: !sinGpu(ctx), log: ctx.log, flujo: 'storytelling'});
		},
	},
	{
		id: 'guion',
		titulo: 'Escribir el guion con la estructura storytelling',
		quien: 'LLM',
		con: 'LLM del perfil --llm, solo con --tema; con --guion lo escribe una persona o el asistente',
		produce: ['guion.md'],
		estima: (s) => ({segundos: 20 + s.palabras * 0.12, dolares: dolaresLLM(1500, s.palabras * 4)}),
		run: async (ctx) => {
			// A guion brought with --guion stays as written, also when --desde reruns this step.
			if (!ctx.tema && existsSync(`${ctx.dir}/guion.md`)) return ctx.log('guion escrito a mano: se usa tal cual');
			if (!ctx.tema) throw new Error('Falta el guion: usa --guion guiones/storytelling/x.md, o --tema "…" para que lo escriba el LLM');
			const objetivo = Math.round(ctx.segundos * PALABRAS_POR_SEGUNDO);
			const fuentes = ctx.fuentes ? `\n\nFUENTES (lo único que puedes citar):\n${readFileSync(ctx.fuentes, 'utf8')}` : '\n\nNo hay FUENTES.';
			const g = await askJson(targetFor(ctx.perfil, 'guion'), guionSchema, SISTEMA_GUION, `Tema: ${ctx.tema}\nLargo: ${objetivo} palabras (${ctx.segundos} s de video).${fuentes}`, {temperature: 0.8, maxTokens: 4000, check: (v) => revisarGuion(v as z.infer<typeof guionSchema>, objetivo)});
			// One sentence per line, a blank line between acts. Acts are decided again by `direccion`, from the text alone.
			writeFileSync(`${ctx.dir}/guion.md`, `${g.partes.map((x) => x.frases.join('\n')).join('\n\n')}\n`);
			ctx.log(`guion "${g.titulo}": ${g.partes.map((x) => x.acto).join(' → ')}. Revísalo en ${ctx.dir}/guion.md antes de seguir: los datos son responsabilidad de quien publica`);
		},
	},
	{
		id: 'voz',
		titulo: 'Narrar el guion y medir cada palabra',
		quien: 'proveedor',
		con: 'config/medios.json: local (el comando de voz de esta máquina), elevenlabs (nube), sistema (la voz del sistema operativo) o borrador (sin voz); luego se mide cada palabra',
		produce: ['palabras.json'],
		estima: (s) => ({segundos: 15 + s.segundos * 0.6, dolares: 0}),
		run: async (ctx) => {
			const lineas = frases(guionDe(ctx).narration);
			const {duration, words, misheard} = await narrar({proveedor: ctx.voz, lineas, dir: ctx.dir, salida: `${ctx.pub}/voz.wav`, nombre: ctx.nombre, log: ctx.log, palabrasPorSegundo: PALABRAS_POR_SEGUNDO});
			escribir(`${ctx.dir}/palabras.json`, {duration, words, voz: ctx.voz});
			ctx.log(`voz ${ctx.voz}: ${duration.toFixed(1)} s, ${words.length} palabras${ctx.voz === 'borrador' ? ' (tiempos estimados, sin audio)' : ''}${misheard.length ? `, dudosas: ${misheard.join(' ')}` : ''}`);
		},
	},
	{
		id: 'direccion',
		titulo: 'Marcar los actos y elegir look, personaje y ambiente',
		quien: 'LLM',
		con: 'LLM del perfil --llm (por defecto, el asistente de la sesión); o un direccion.json escrito a mano con --direccion',
		produce: ['direccion.json'],
		estima: (s) => ({segundos: 15 + s.palabras * 0.05, dolares: dolaresLLM(1800 + s.palabras * 2, 1500)}),
		run: async (ctx) => {
			const guion = guionDe(ctx);
			const lineas = leer<string[]>(`${ctx.dir}/beats.json`);
			// A direction brought with --direccion is the answer: it is checked, never asked again, even on a rerun.
			if (ctx.aMano.direccion) {
				const mal = revisarDireccion(direccionSchema.parse(leer(`${ctx.dir}/direccion.json`)), lineas);
				if (mal.length) throw new Error(`direccion.json con problemas:\n- ${mal.join('\n- ')}`);
				return ctx.log('dirección escrita a mano: revisada, sin LLM');
			}
			const notas = guion.annotated ? `\n\nNotas del autor:\n${annotatedText(guion)}\n${NOTES_RULE}` : '';
			const usuario = `Narración (${lineas.length} frases):\n${lineas.map((l, i) => `${i}: ${l}`).join('\n')}${notas}`;
			const d = await askJson(targetFor(ctx.perfil, 'direccion'), direccionSchema, SISTEMA_DIRECCION, usuario, {temperature: 0.4, maxTokens: 2500, check: (v) => revisarDireccion(v as Direccion, lineas)});
			escribir(`${ctx.dir}/direccion.json`, d);
			ctx.log(`look ${d.look}; ${d.actos.map((a) => `${a.acto} ${a.primera}-${a.ultima}`).join(', ')}`);
		},
	},
	{
		id: 'planos',
		titulo: 'Cortar en planos: escena, narrador o lámina',
		quien: 'LLM',
		con: 'LLM del perfil --llm (por defecto, el asistente de la sesión); o un planos.json escrito a mano con --planos',
		produce: ['planos.json'],
		estima: (s) => ({segundos: 20 + s.palabras * 0.4, dolares: dolaresLLM(4500 + s.palabras * 10, 2500 + s.planos * 110)}),
		run: async (ctx) => {
			const {duration, words} = palabrasDe(ctx);
			const d = leer<Direccion>(`${ctx.dir}/direccion.json`);
			const guion = guionDe(ctx);
			// Same for --planos. With a real voice the clock changes, so the durations are checked again here.
			if (ctx.aMano.planos) {
				const mal = revisarPlanos(planosSchema.parse(leer(`${ctx.dir}/planos.json`)), words, duration, d);
				if (mal.length) throw new Error(`planos.json con problemas:\n- ${mal.join('\n- ')}`);
				return ctx.log('planos escritos a mano: revisados, sin LLM');
			}
			const actos = actoDePalabras(d, words);
			// Words numbered, with a header each time the act changes and the clock every few words so durations can be judged.
			const numeradas = words.map((w, i) => `${i === 0 || actos[i] !== actos[i - 1] ? `\n[${actos[i].toUpperCase()}] ` : ''}${i % 12 === 0 ? `(${w.start.toFixed(1)}s) ` : ''}${i}:${w.word}`).join(' ');
			const notas = guion.annotated ? `\n\nNotas del autor:\n${annotatedText(guion)}\n${NOTES_RULE}` : '';
			const usuario = `Look: ${d.look} (${LOOKS[d.look].about}).\nPROTAGONISTA: ${d.personaje_en}\n\nNarración (${words.length} palabras, ${duration.toFixed(0)} s, ${(words.length / duration).toFixed(1)} palabras por segundo). Cada palabra lleva su número; las marcas como (5.1s) dicen en qué segundo suena la palabra que sigue, para juzgar duraciones:${numeradas}${notas}`;
			const r = await askJson(targetFor(ctx.perfil, 'planos'), planosSchema, SISTEMA_PLANOS, usuario, {temperature: 0.4, maxTokens: 16000, check: (v) => revisarPlanos(v as PlanosLLM, words, duration, d)});
			escribir(`${ctx.dir}/planos.json`, r);
			ctx.log(`${r.planos.length} planos, ${(duration / r.planos.length).toFixed(1)} s en promedio`);
		},
	},
	{
		id: 'estilo',
		titulo: 'Elegir transición, cámara, enfoque y subtítulos de cada plano',
		quien: 'código',
		con: `reglas del preset --estilo (${PRESET_IDS.join(', ')}; src/storytelling/estilo.ts); o un estilo.json escrito a mano con --estilo x.json`,
		produce: ['estilo.json'],
		estima: () => ({segundos: 1, dolares: 0}),
		run: async (ctx) => {
			const {words} = palabrasDe(ctx);
			const d = leer<Direccion>(`${ctx.dir}/direccion.json`);
			const r = planosSchema.parse(leer(`${ctx.dir}/planos.json`));
			// A style brought with --estilo x.json is the answer: checked against the cut, never recomputed.
			if (ctx.aMano.estilo) {
				estiloDe(ctx, r.planos.length);
				return ctx.log('estilo escrito a mano: revisado');
			}
			// Without --estilo a rerun keeps the preset the film already had; a new film gets the user's usual one.
			const previo = existsSync(`${ctx.dir}/estilo.json`) ? leer<{preset?: string}>(`${ctx.dir}/estilo.json`).preset : undefined;
			const id = ctx.estilo ?? (previo && previo in PRESETS ? (previo as PresetId) : estiloPreferido());
			const actos = actoDePalabras(d, words);
			// Two shots share a picture when their description is the same: that is what makes a cut a punch-in.
			const e = estilizar(r.planos.map((x) => ({tipo: x.tipo, bloque: x.bloque, imagen: x.imagen_en?.trim() || null, tratamiento: x.tratamiento, encuadre: x.encuadre, acto: actos[x.primera]})), id, d.look);
			escribir(`${ctx.dir}/estilo.json`, e);
			const cuenta = (k: 'transicion' | 'camara' | 'enfoque') => Object.entries(e.planos.reduce<Record<string, number>>((a, x) => ({...a, [x[k]]: (a[x[k]] ?? 0) + 1}), {})).map(([n, c]) => `${c} ${n}`).join(', ');
			ctx.log(`estilo ${id}: subtítulos ${e.texto.estilo}/${e.texto.aparece}/${e.texto.posicion}, color ${e.grado}`);
			ctx.log(`transiciones: ${cuenta('transicion')}. cámara: ${cuenta('camara')}. enfoque: ${cuenta('enfoque')}`);
			ctx.log(`para cambiar un plano, edita ${ctx.dir}/estilo.json y corre --desde montaje`);
		},
	},
	{
		id: 'montaje',
		titulo: 'Poner tiempos a los planos y armar la película',
		quien: 'código',
		con: 'tiempos de palabras.json; revisa también planos.json editado a mano',
		produce: ['pelicula.json'],
		estima: () => ({segundos: 1, dolares: 0}),
		run: async (ctx) => {
			const {duration, words} = palabrasDe(ctx);
			const d = leer<Direccion>(`${ctx.dir}/direccion.json`);
			const r = planosSchema.parse(leer(`${ctx.dir}/planos.json`));
			const problemas = [...revisarDireccion(d, leer<string[]>(`${ctx.dir}/beats.json`)), ...revisarPlanos(r, words, duration, d)];
			if (problemas.length) throw new Error(`planos.json o direccion.json con problemas:\n- ${problemas.join('\n- ')}`);
			const actos = actoDePalabras(d, words);
			const estilo = estiloDe(ctx, r.planos.length);
			const inicio = (i: number) => (i === 0 ? 0 : words[r.planos[i].primera].start);
			let cerca = false;
			const planos: Plano[] = r.planos.map((x, i) => {
				const base = {desde: inicio(i), hasta: i + 1 < r.planos.length ? inicio(i + 1) : duration, primera: x.primera, ultima: x.ultima, acto: actos[x.primera], ...estilo.planos[i]};
				const img = pedidoDe(ctx, x, d);
				// The narrator room alternates between two distances, so a run of phrases still cuts.
				cerca = x.tipo === 'narrador' ? !cerca && r.planos[i - 1]?.tipo === 'narrador' : false;
				if (x.tipo === 'escena') return {...base, tipo: 'escena', imagen: img!.archivo, prompt: img!.prompt, tratamiento: x.tratamiento!, encuadre: x.encuadre!, foco: x.foco!};
				if (x.tipo === 'narrador') return {...base, tipo: 'narrador', encuadre: cerca ? 'cerca' : 'medio'};
				return {...base, tipo: 'lamina', bloque: x.bloque!, clave: x.clave, imagen: img?.archivo ?? null, prompt: img?.prompt, etiqueta: x.etiqueta ?? undefined, valor: x.valor ?? undefined, prefijo: x.prefijo ?? undefined, sufijo: x.sufijo ?? undefined, autor: x.autor ?? undefined};
			});
			const ambiente = soloBanco(ctx) ? null : pedidoAmbiente(ctx, d);
			const pelicula: Pelicula = {nombre: ctx.nombre, duracion: duration, look: d.look, palabras: words, planos, ambiente: ambiente?.archivo ?? null, texto: estilo.texto, grado: estilo.grado, voz: null, sonido: null};
			const mal = revisarPelicula(pelicula);
			if (mal.length) throw new Error(`película con problemas:\n- ${mal.join('\n- ')}`);
			// Every picture the film points at, once, with the origin that names its files.
			const pedidos = [...new Map([...(ambiente ? [ambiente] : []), ...r.planos.flatMap((x) => pedidoDe(ctx, x, d) ?? [])].map((x) => [x.id, x])).values()];
			escribir(`${ctx.dir}/imagenes.json`, {origen: origenDe(ctx.imagenes), pedidos});
			escribir(`${ctx.dir}/pelicula.json`, pelicula);
			const cuenta = (t: Plano['tipo']) => planos.filter((x) => x.tipo === t).length;
			ctx.log(`${planos.length} planos: ${cuenta('escena')} escenas, ${cuenta('narrador')} de narrador, ${cuenta('lamina')} láminas`);
		},
	},
	{
		id: 'imagenes',
		titulo: 'Fotografías de escenas, recortes y ambiente',
		quien: 'proveedor',
		con: 'config/medios.json, en orden: stock (Pexels, Wikimedia Commons, Openverse), nube (OpenRouter) o local (el modelo de esta máquina); placas no hace ninguna',
		produce: [],
		estima: (s) => ({segundos: s.imagenes * s.segundosPorImagen, dolares: 0}),
		run: async (ctx) => {
			const {origen, pedidos} = leer<{origen: string; pedidos: Pedido[]}>(`${ctx.dir}/imagenes.json`);
			// File names carry the origin, so the film only finds pictures made by the providers it was assembled for.
			if (origen !== origenDe(ctx.imagenes)) throw new Error(`la película se montó para imágenes de "${origen}" y ahora se piden de "${origenDe(ctx.imagenes)}": corre --desde montaje`);
			if (ctx.imagenes[0] === 'placas') return ctx.log('placas: sin imágenes; el render pone placas con el texto de cada imagen');
			const {creditos, faltan} = await conseguirImagenes({pedidos, proveedores: ctx.imagenes, nombre: ctx.nombre, dir: ctx.dir, log: ctx.log});
			// creditos.json lists only the pictures this film shows, so nobody is credited for a photo that is not in it.
			const delVideo = creditos.filter((c) => pedidos.some((p) => p.archivo === c.archivo));
			escribir(`${ctx.dir}/creditos.json`, delVideo);
			const acreditar = delVideo.filter((c) => c.proveedor === 'stock').length;
			ctx.log(`${pedidos.length - faltan.length} de ${pedidos.length} imágenes${acreditar ? `; ${acreditar} son fotos de banco: sus autores y licencias están en ${ctx.dir}/creditos.json` : ''}`);
			if (faltan.length) ctx.log(`ATENCIÓN: ${faltan.length} sin imagen (${faltan.map((p) => p.busca).join(' | ')}). Esos planos saldrán como placa: cambia su busca_en en ${ctx.dir}/planos.json por otras palabras y corre --desde montaje`);
		},
	},
	{
		id: 'musica',
		titulo: 'Elegir la música de cada momento y mezclarla bajo la voz',
		quien: 'código',
		con: 'pistas de dominio público de kit/biblioteca/musica, según el ánimo de cada momento (--musica pistas|sintetizada|no); o un musica.json escrito a mano con --musica x.json',
		produce: ['musica.json'],
		estima: (s) => ({segundos: 2 + s.segundos * 0.03, dolares: 0}),
		run: async (ctx) => {
			const f = leer<Pelicula>(`${ctx.dir}/pelicula.json`);
			let plan: PlanMusical;
			if (ctx.aMano.musica) {
				// A plan brought with --musica x.json is the answer: checked against the film, never recomputed.
				plan = planMusicalSchema.parse(leer(`${ctx.dir}/musica.json`));
			} else {
				// Without --musica a rerun keeps the kind of music the film already had.
				const modo = modoMusica(ctx.musica ?? planMusicalDe(ctx)?.modo ?? medios().musica.modo);
				plan = modo === 'pistas' ? planDeAnimos({trozos: trozosDe(f), look: f.look, nombre: ctx.nombre, duracion: f.duracion, nivel: medios().musica.nivel}) : {modo, nivel: medios().musica.nivel, tramos: []};
			}
			const mal = revisarPlan(plan, f.duracion);
			if (mal.length) throw new Error(`musica.json con problemas:\n- ${mal.join('\n- ')}`);
			escribir(`${ctx.dir}/musica.json`, plan);
			if (plan.modo !== 'pistas') return ctx.log(plan.modo === 'no' ? 'sin música' : 'música sintetizada: la pone el paso sonido');
			const voz = ctx.voz === 'borrador' ? null : `${ctx.pub}/voz.wav`;
			mezclarMusica({plan, duracion: f.duracion, voz, salida: `${ctx.dir}/musica.wav`});
			const cat = pistas();
			plan.tramos.forEach((t) => ctx.log(`${t.desde.toFixed(1)}–${t.hasta.toFixed(1)} s ${t.momento} (${t.animo}): "${cat[t.pista].titulo}" de ${cat[t.pista].autor}, ${cat[t.pista].licencia}`));
			ctx.log(`para cambiar una pista o dónde empieza, edita ${ctx.dir}/musica.json y corre --desde musica --musica ${ctx.dir}/musica.json`);
		},
	},
	{
		id: 'sonido',
		titulo: 'Efectos en los cortes, sobre la música',
		quien: 'código',
		con: 'efectos de lámina sintetizados (scripts/explica/sonido.ts) + muestras grabadas en cada transición (kit/biblioteca/sonidos/muestras) + la música del paso musica',
		produce: [],
		estima: (s) => ({segundos: 5 + s.segundos * 0.1, dolares: 0}),
		run: async (ctx) => {
			const f = leer<Pelicula>(`${ctx.dir}/pelicula.json`);
			// What the cards do inside themselves stays synthesized: a number counting up, a label landing.
			const golpes: Golpe[] = f.planos.flatMap((p) => {
				if (p.tipo !== 'lamina') return [];
				if (p.bloque === 'dato') return [{t: p.desde + 0.12, efecto: 'subida'}, {t: p.desde + 1.0, efecto: 'pop'}];
				return p.bloque === 'recorte' ? [{t: p.desde + 0.7, efecto: 'click'}] : [];
			});
			// Every transition that moves has its sound, landing on the cut. A hard cut sounds only when a card arrives
			// or the story turns; cuts between pictures stay silent, as in the references.
			const toques: Toque[] = f.planos.flatMap((p, i): Toque[] => {
				const antes = f.planos[i - 1];
				if (!antes) return [];
				const t = p.desde;
				const remate = antes.acto !== p.acto && (p.acto === 'tesis' || p.acto === 'giro');
				const tr = p.transicion ?? 'corte';
				if (tr === 'destello') return remate ? [{t, muestra: 'subida', gain: 0.5}, {t, muestra: 'impacto', gain: 0.9}] : [{t, muestra: 'obturador', gain: 0.8}];
				if (tr === 'iris') return [{t: t + 0.1, muestra: 'barrido_grave', gain: 0.8}, ...(remate ? [{t: t + 0.3, muestra: 'impacto', gain: 0.6}] : [])];
				if (tr === 'latigo') return [{t: t + 0.08, muestra: 'barrido', gain: 0.75}];
				if (tr === 'empuje') return [{t: t + 0.12, muestra: 'barrido', gain: 0.4}];
				if (tr === 'golpe') return [{t, muestra: 'subgolpe', gain: 0.42}];
				if (tr === 'fallo') return [{t: t + 0.05, muestra: 'fallo', gain: 0.7}];
				if (tr === 'disolver') return [];
				if (remate) return [{t, muestra: 'impacto', gain: 0.75}];
				return p.tipo === 'lamina' && antes.tipo !== 'lamina' ? [{t: t + 0.04, muestra: 'barrido', gain: 0.55}] : [];
			});
			// The bed is the music of the `musica` step; a film from before that step keeps the synthesized one.
			const plan = planMusicalDe(ctx);
			const modo = plan?.modo ?? 'sintetizada';
			if (modo === 'pistas' && !existsSync(`${ctx.dir}/musica.wav`)) throw new Error('falta musica.wav: corre --desde musica');
			sintetizar({duracion: f.duracion, golpes, file: `${ctx.dir}/sonido_base.wav`, musica: modo === 'sintetizada' ? 0.7 : 0, conVoz: true});
			mezclarMuestras(`${ctx.dir}/sonido_base.wav`, toques, `${ctx.pub}/sonido.wav`, modo === 'pistas' ? `${ctx.dir}/musica.wav` : null);
			const cuenta = Object.entries(toques.reduce<Record<string, number>>((a, x) => ({...a, [x.muestra]: (a[x.muestra] ?? 0) + 1}), {})).map(([n, c]) => `${c} ${n}`).join(', ');
			ctx.log(`sonido: música ${modo}; ${cuenta || 'sin transiciones sonoras'}`);
		},
	},
	{
		id: 'render',
		titulo: 'Renderizar la película',
		quien: 'código',
		con: 'Remotion (2D, sin three.js)',
		produce: ['mudo.mp4'],
		estima: (s) => ({segundos: 15 + s.segundos * 1.2, dolares: 0}),
		run: async (ctx) => {
			const f = leer<Pelicula>(`${ctx.dir}/pelicula.json`);
			// A picture that was never made (draft run, or one that failed) becomes a labelled plate instead of stopping the render.
			const hay = (file?: string | null) => (file && existsSync(`public/${file}`) ? file : null);
			const planos = f.planos.map((p) => (p.tipo === 'narrador' ? p : {...p, imagen: hay(p.imagen)}));
			const faltan = f.planos.filter((p) => p.tipo !== 'narrador' && p.imagen && !hay(p.imagen)).length;
			if (faltan && ctx.imagenes[0] !== 'placas') ctx.log(`aviso: ${faltan} planos sin imagen salen como placa; corre --desde imagenes`);
			const props = `${ctx.dir}/props.json`;
			escribir(props, {pelicula: {...f, planos, ambiente: hay(f.ambiente)}});
			remotion(['render', 'src/storytelling/index.tsx', 'Storytelling', `${ctx.dir}/mudo.mp4`, `--props=${props}`, '--codec=h264', '--crf=18'], {stdio: 'inherit'});
		},
	},
	{
		id: 'mezcla',
		titulo: 'Unir voz, sonido y video',
		quien: 'código',
		con: 'paso mezcla de Tinta: ffmpeg',
		produce: ['film.mp4'],
		estima: () => ({segundos: 15, dolares: 0}),
		run: async (ctx) => tinta('mezcla').run({...ctx, guion: guionDe(ctx)}),
	},
	{
		id: 'revision_final',
		titulo: 'Hoja de cuadros del video para revisar',
		quien: 'revisión',
		con: 'ffmpeg (hoja) + el asistente o una persona (mirarla)',
		produce: ['hoja.png'],
		estima: () => ({segundos: 10, dolares: 0}),
		run: async (ctx) => {
			// One frame per shot, taken past its middle, where the transition is over: every shot shows up, in order.
			const f = leer<Pelicula>(`${ctx.dir}/pelicula.json`);
			const cuadros = f.planos.map((p) => Math.round((p.desde + (p.hasta - p.desde) * 0.6) * FPS));
			const filas = Math.max(1, Math.ceil(cuadros.length / 10));
			execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${ctx.dir}/film.mp4`, '-vf', `select='${cuadros.map((n) => `eq(n\\,${n})`).join('+')}',scale=216:-1,tile=10x${filas}`, '-fps_mode', 'passthrough', '-frames:v', '1', `${ctx.dir}/hoja.png`]);
			ctx.log(`revisa ${ctx.dir}/hoja.png (un cuadro por plano, en orden) y ${ctx.dir}/film.mp4`);
			// A film with a plate where a picture should be is not finished, and says so last, where it is seen.
			const placas = f.planos.filter((p) => p.tipo !== 'narrador' && p.imagen && !existsSync(`public/${p.imagen}`)).length;
			if (placas && ctx.imagenes[0] !== 'placas') ctx.log(`ATENCIÓN: ${placas} planos salieron como placa, sin imagen. Cambia su busca_en en ${ctx.dir}/planos.json y corre --desde montaje`);
		},
	},
];
