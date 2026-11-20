// Steps of the ink-style flow, from guion to film. Each declares who does it (code, local GPU, a cloud LLM, or a review
// by the assistant or a person), what it reads and writes, and a cost/time estimate used by `--plan`.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {Word} from '../../src/estudio/film';
import {catalogoConstrucciones, CONSTRUCCIONES, FALLAS} from '../../src/tinta/construcciones';
import {catalogoEscenarios, ESCENARIOS} from '../../src/tinta/escenarios';
import {entradaDe, TIPOS_ACCION, type Accion, type Objeto, type Pelicula, type Toma} from '../../src/tinta/formato';
import {prepararEntorno, tiene} from '../lib/entorno';
import {sintetizar, type Golpe} from '../explica/sonido';
import {readGuion, type Guion} from '../lib/guion';
import {ensurePack, kenneyCatalog} from '../lib/kenney';
import {conseguirImagenes, type Pedido} from '../lib/imagenes';
import {askJson, clearLocal, targetFor} from '../lib/llm';
import {correr, liberar, local} from '../lib/local';
import {medios, resolverImagenes, resolverVoz} from '../lib/medios';
import {narrar} from '../lib/voz';
import {mezclarMuestras, type Toque} from '../lib/muestras';
import {mezclarMusica, modoMusica, pistas, planDeAnimos} from '../lib/musica';
import {dormir, remotion} from '../lib/sistema';
import {GANCHO_VISUAL} from '../lib/gancho';

export type Quien = 'código' | 'proveedor' | 'LLM' | 'revisión';

export type Ctx = {nombre: string; dir: string; pub: string; perfil: string; guion: Guion; log: (...x: unknown[]) => void};

// What --plan assumes before the real numbers exist: narration speed, objects and how many are generated.
export type Supuestos = {segundos: number; palabras: number; objetos: number; generados: number; tomas: number};

export type Paso = {
	id: string;
	titulo: string;
	quien: Quien;
	// Model, service or tool doing the work, for the table.
	con: string;
	produce: string[];
	estima: (s: Supuestos) => {segundos: number; dolares: number};
	run: (ctx: Ctx) => Promise<void>;
};

const leer = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8'));
const escribir = (f: string, v: unknown) => writeFileSync(f, JSON.stringify(v, null, 1));
// On a GPU shared with other work, each try at a 3D model waits until enough memory is free. The machine says how
// much (config/local.json, modelo3d.mb_libres); without that, or without an NVIDIA card, nothing waits.
const esperarGPU = (log: Ctx['log']) => {
	const MB_TRELLIS = local().modelo3d?.mb_libres;
	if (!MB_TRELLIS || !tiene('nvidia-smi')) return liberar();
	const libre = () => Number(execFileSync('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], {encoding: 'utf8'}).trim());
	const hasta = Date.now() + 20 * 60 * 1000;
	let avisado = false;
	for (;;) {
		liberar();
		const mb = libre();
		if (mb >= MB_TRELLIS) return;
		if (Date.now() > hasta) throw new Error(`la GPU sigue ocupada (${mb} MB libres) tras 20 min: otro trabajo la está usando`);
		if (!avisado) log(`GPU ocupada por otro trabajo (${mb} MB libres); espero a que se libere`);
		avisado = true;
		dormir(15);
	}
};

// Sentences are narrated one by one, so ideas stay apart and a long text never hangs the voice model.
const frases = (texto: string) => texto.split('\n').flatMap((l) => l.match(/[^.?!]+[.?!]+["»]?|[^.?!]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);

// List prices of the default cloud model (config/models.json), at off-peak rates; peak hours cost double.
const dolaresLLM = (entrada: number, salida: number) => (entrada * 0.15 + salida * 0.6) / 1e6;

const muebles = () => kenneyCatalog().packs.muebles.models;

// ---------------------------------------------------------------- schemas

const repartoSchema = z.object({
	objetos: z.array(
		z.object({
			id: z.string(),
			nombre: z.string(),
			fuente: z.string(),
			prompt_en: z.string().nullable(),
			largo: z.number(),
			escenario: z.string(),
			slot: z.string(),
			contorno: z.boolean(),
			giro: z.number(),
			partes: z.array(z.string()).nullable(),
		}),
	),
});
type Reparto = z.infer<typeof repartoSchema>;

const tomasSchema = z.object({
	tomas: z.array(z.object({primera: z.number().int(), ultima: z.number().int(), escenario: z.string(), encuadre: z.enum(['general', 'objeto']), objetivo: z.string().nullable(), rotulo: z.string(), tono: z.enum(['normal', 'alerta', 'info'])})),
	acciones: z.array(z.object({tipo: z.enum(TIPOS_ACCION), objeto: z.string(), palabra: z.number().int(), hasta_palabra: z.number().int().nullable(), hacia: z.string().nullable(), efecto: z.string().nullable()})),
});
type TomasLLM = z.infer<typeof tomasSchema>;

// ---------------------------------------------------------------- prompts

const SISTEMA_REPARTO = `Eres director de arte de videos explicativos verticales en estilo ilustración: objetos 3D simples con colores planos y contorno de tinta, vistos en maquetas (una sala en corte, un nicho con repisas, un fondo liso).
Lees un guion y decides qué objetos deben verse y dónde van. No escribes coordenadas: eliges un escenario y uno de sus lugares con nombre.

Escenarios y lugares:
${'{ESCENARIOS}'}

Construcciones (se arman en código y encajan exacto en su lugar):
${'{CONSTRUCCIONES}'}

Para cada objeto:
- id: corto, en minúsculas y con guion bajo.
- fuente: "construccion:<id>" para lo que se arma pieza por pieza sobre el escenario (ver Construcciones); siempre gana sobre "generar" cuando aplica. Con "partes" eliges qué piezas lleva esa etapa: cada etapa es un objeto completo con todas las piezas que ya tiene.
- fuente: "kenney:muebles/<modelo>" si un modelo del catálogo lo representa bien (pantallas, monitores, teles, computadoras y muebles: siempre del catálogo); "generar" si es un aparato u objeto específico del tema (se modela con IA a partir de una imagen); "bolo" para un personaje (ladrón, persona, visita); "pelota" para una pelota (algo que rueda y se cae).
- prompt_en: solo si fuente es "generar". Una frase en inglés que describa el objeto real, su color y forma, sin fondo ni escena. Ej.: "a white CCTV bullet camera with a ring of LEDs around the lens and a short black cable".
  Un solo objeto, sin pared, soporte ni mueble alrededor. Si tiene pantalla, que esté apagada (blank dark screen): sin fotos, texto ni números, porque el modelador 3D confunde lo que se ve en la pantalla con profundidad.
- largo: lado más largo en unidades de la maqueta (1 unidad = 20 cm). Exagera un poco lo importante para que se lea: una cámara de pared 4, una grabadora 4, un monitor 8, una persona 6.3.
- escenario y slot: uno de la lista. No pongas dos objetos en el mismo lugar del mismo escenario, salvo en los lugares para etapas (dicen "una tras otra"): ahí van las etapas de algo que se construye, cada una como objeto completo (la plataforma sola; la plataforma con barandal; con techo…), y se turnan.
- contorno: true para aparatos pequeños con rejillas, botones o huecos; false para el resto.
- giro: radianes extra sobre la orientación del lugar; 0 casi siempre. Los objetos generados miran hacia el frente de la imagen; si un aparato debe apuntar de lado, usa 1.57.
Si el mismo objeto debe verse en dos escenarios, crea dos objetos con distinto id y el mismo prompt_en.
Cámaras, sensores, sirenas y paneles van en un lugar de pared, nunca sobre muebles.
Si el guion habla de una persona (alguien entra, un ladrón, un vecino), incluye un bolo en un lugar de piso del escenario donde ocurre.
Incluye cada aparato u objeto que el guion nombra y explica: si una frase dice "Ese es el X", el X tiene que verse. Nada de adorno que el guion no mencione. Máximo 10 generados. Responde solo JSON.`;

const SISTEMA_TOMAS = `Eres director de videos explicativos verticales en estilo ilustración 3D con contorno de tinta. La voz narra; tú decides qué se ve en cada momento.
Recibes la narración con cada palabra numerada, los escenarios y los objetos ya colocados.

Tomas: cortan la narración en tramos seguidos. Cada toma cubre de la palabra "primera" a la "ultima"; la siguiente empieza en ultima+1. La primera empieza en 0 y la última termina en la última palabra.
- Una toma por idea, de 2 a 6 segundos; corta en el final de una frase o cuando cambia lo que se explica.
- escenario: dónde se está.
- encuadre: "general" para ver todo el escenario; "objeto" para acercarse a un objeto (objetivo = su id, y debe estar en ese escenario).
- rotulo: 2 a 5 palabras que resumen lo que se dice, en minúsculas, tomadas de la narración. Ej.: "el sensor de movimiento".
- tono: "alerta" para problemas, peligro o fallas; "info" para la solución o el dato clave; "normal" para lo demás.

Acciones, ancladas a la palabra donde ocurren:
- aparece: el objeto aparece de golpe cuando se le nombra (antes no se ve).
- desaparece: el objeto deja de verse en esa palabra. Para etapas en el mismo lugar: la etapa nueva aparece y la anterior desaparece en la misma palabra.
- pulso: anillo que late bajo el objeto desde palabra hasta hasta_palabra (alarmas, detecciones, algo que se activa).
- cono: el objeto (una cámara o sensor) proyecta su campo de visión hacia "hacia" (id de otro objeto del mismo escenario), desde palabra hasta hasta_palabra.
- entra: un objeto bolo camina desde la puerta del escenario hasta su lugar, desde palabra hasta hasta_palabra.
- gira: el objeto da una vuelta completa, desde palabra hasta hasta_palabra (para presentarlo).
- falla: una construcción falla, desde palabra hasta hasta_palabra, con efecto (hacia y efecto van en null en las demás acciones):
${'{FALLAS}'}
  Cada vez que la narración dice que algo se dobla, resbala, gira, se raja, truena o se pudre, pon la falla sobre la etapa que se ve en ese momento.
- cae: el objeto (una pelota) rueda hasta la orilla y cae al suelo, desde palabra hasta hasta_palabra.
- lluvia: llueve en el escenario del objeto, desde palabra hasta hasta_palabra.
Pon una acción cada vez que la narración nombra algo que pasa. hasta_palabra y hacia van en null cuando no aplican.

La primera toma es el gancho: encuadre "objeto" sobre lo que nombra la primera frase, de 4 a 10 palabras, con una acción (aparece, gira, pulso, cae o falla) en una de sus tres primeras palabras, para que algo pase desde el primer cuadro. Nunca abre con una vista general.
${GANCHO_VISUAL}
Responde solo JSON.`;

// ---------------------------------------------------------------- checks

// Words that mean someone is in the story; then a skittle must stand somewhere, or the narration has nobody to show.
// Something in the story rolls or falls off: then a ball must exist to show it.
const RUEDA = /\b(ruede|rueda|ruedan|pelota|bal[oó]n|canica)\b/i;
const PERSONA = /\b(ladr[oó]n|alguien|persona|vecino|intruso|visita|tu mano|caminas?|entra)\b/i;

// hecho: whether a model with that key is already on disk (made by hand or by an earlier run); those cost nothing.
const revisarReparto = (r: Reparto, guion: string, hecho: (clave: string) => boolean = () => false) => {
	const p: string[] = [];
	if (PERSONA.test(guion) && !r.objetos.some((o) => o.fuente === 'bolo')) p.push('el guion habla de una persona y no hay ningún bolo: agrega uno en un lugar de piso del escenario donde ocurre');
	const ids = new Set<string>();
	const ocupados = new Set<string>();
	const catalogo = new Set(muebles());
	r.objetos.forEach((o) => {
		if (ids.has(o.id)) p.push(`id repetido: ${o.id}`);
		ids.add(o.id);
		const e = ESCENARIOS[o.escenario];
		if (!e) p.push(`${o.id}: escenario desconocido ${o.escenario}`);
		else if (!e.slots[o.slot]) p.push(`${o.id}: ${o.escenario} no tiene lugar ${o.slot}; usa ${Object.keys(e.slots).join(', ')}`);
		const lugar = `${o.escenario}/${o.slot}`;
		if (ocupados.has(lugar) && !e?.slots[o.slot]?.compartido) p.push(`${o.id}: el lugar ${lugar} ya está ocupado`);
		ocupados.add(lugar);
		if (o.fuente.startsWith('kenney:') && !catalogo.has(o.fuente.replace('kenney:muebles/', ''))) p.push(`${o.id}: ${o.fuente} no está en el catálogo`);
		if (!['generar', 'bolo', 'pelota'].includes(o.fuente) && !o.fuente.startsWith('kenney:muebles/') && !o.fuente.startsWith('construccion:')) p.push(`${o.id}: fuente inválida ${o.fuente}`);
		if (o.fuente.startsWith('construccion:')) {
			const c = CONSTRUCCIONES[o.fuente.slice(13)];
			if (!c) p.push(`${o.id}: no existe la construcción ${o.fuente}`);
			else {
				const malas = (o.partes ?? []).filter((x) => !c.partes[x]);
				if (!o.partes?.length) p.push(`${o.id}: una construcción necesita partes`);
				if (malas.length) p.push(`${o.id}: partes desconocidas ${malas.join(', ')}; usa ${Object.keys(c.partes).join(', ')}`);
			}
		}
		if (o.fuente === 'generar' && !o.prompt_en?.trim()) p.push(`${o.id}: falta prompt_en`);
		// A machine with no image-to-3D command cannot make new objects: the answer must stay within the catalogue.
		if (o.fuente === 'generar' && !local().modelo3d) p.push(`${o.id}: esta máquina no puede generar modelos 3D nuevos; usa un modelo del catálogo (kenney:muebles/<modelo>) que lo represente, o deja fuera el objeto`);
		if (!(o.largo > 0.5 && o.largo < 20)) p.push(`${o.id}: largo fuera de rango`);
	});
	// The limit is on new models to make; the same model in two places, or one already made, is free.
	if (new Set(r.objetos.filter((o) => o.fuente === 'generar' && o.prompt_en && !hecho(clave(o.prompt_en))).map((o) => o.prompt_en)).size > 10) p.push('más de 10 modelos nuevos que generar');
	return p;
};

const revisarTomas = (t: TomasLLM, n: number, objetos: Objeto[]) => {
	const p: string[] = [];
	const por = new Map(objetos.map((o) => [o.id, o]));
	t.tomas.forEach((s, i) => {
		const esperada = i === 0 ? 0 : t.tomas[i - 1].ultima + 1;
		if (s.primera !== esperada) p.push(`toma ${i + 1} empieza en ${s.primera} y debe empezar en ${esperada}`);
		if (s.ultima < s.primera) p.push(`toma ${i + 1} termina antes de empezar`);
		if (!ESCENARIOS[s.escenario]) p.push(`toma ${i + 1}: escenario desconocido ${s.escenario}`);
		if (s.encuadre === 'objeto') {
			const o = s.objetivo ? por.get(s.objetivo) : null;
			if (!o) p.push(`toma ${i + 1}: objetivo ${s.objetivo} no existe`);
			else if (o.lugar.escenario !== s.escenario) p.push(`toma ${i + 1}: ${o.id} está en ${o.lugar.escenario}, no en ${s.escenario}`);
		}
	});
	if (t.tomas.length && t.tomas[t.tomas.length - 1].ultima !== n - 1) p.push(`la última toma debe terminar en la palabra ${n - 1}`);
	// The opening shot is the hook: close on a thing, short, and something happens at once.
	const abre = t.tomas[0];
	if (abre) {
		if (abre.encuadre !== 'objeto') p.push('la toma 1 es el gancho: usa encuadre "objeto" sobre lo que nombra la primera frase, no una vista general');
		if (abre.ultima - abre.primera + 1 > 12 && t.tomas.length > 1) p.push(`la toma 1 cubre ${abre.ultima - abre.primera + 1} palabras: el gancho debe cortar antes (máximo 12 palabras, unos 3 segundos)`);
		if (!t.acciones.some((a) => a.palabra <= Math.min(2, abre.ultima) && a.tipo !== 'desaparece')) p.push('la toma 1 necesita una acción (aparece, gira, pulso, cae o falla) en las palabras 0 a 2: algo debe pasar desde el primer cuadro');
	}
	// Stages sharing a place: each must appear, and every one but the last must leave, or they all show at once.
	const grupos = new Map<string, Objeto[]>();
	objetos.filter((o) => o.fuente.startsWith('construccion:')).forEach((o) => {
		const k = `${o.lugar.escenario}/${o.lugar.slot}`;
		grupos.set(k, [...(grupos.get(k) ?? []), o]);
	});
	for (const [lugar, os] of grupos) {
		if (os.length < 2) continue;
		const aparece = (o: Objeto) => t.acciones.find((a) => a.tipo === 'aparece' && a.objeto === o.id);
		const sinAparecer = os.filter((o) => !aparece(o));
		if (sinAparecer.length) p.push(`en ${lugar} hay ${os.length} etapas: ${sinAparecer.map((o) => o.id).join(', ')} necesita(n) una acción aparece`);
		const ultima = [...os].sort((a, b) => (aparece(b)?.palabra ?? 0) - (aparece(a)?.palabra ?? 0))[0];
		const sinIrse = os.filter((o) => o !== ultima && !t.acciones.some((a) => a.tipo === 'desaparece' && a.objeto === o.id));
		if (sinIrse.length) p.push(`en ${lugar}: ${sinIrse.map((o) => o.id).join(', ')} necesita(n) desaparece cuando aparece la etapa siguiente`);
	}
	t.acciones.forEach((a, i) => {
		const o = por.get(a.objeto);
		if (!o) p.push(`acción ${i + 1}: objeto ${a.objeto} no existe`);
		if (a.palabra < 0 || a.palabra >= n) p.push(`acción ${i + 1}: palabra fuera de rango`);
		if (a.tipo !== 'aparece' && a.tipo !== 'desaparece' && (a.hasta_palabra === null || a.hasta_palabra < a.palabra)) p.push(`acción ${i + 1} (${a.tipo}) necesita hasta_palabra >= palabra`);
		if (a.tipo === 'cono') {
			const h = a.hacia ? por.get(a.hacia) : null;
			if (!h) p.push(`acción ${i + 1}: cono necesita hacia con un objeto existente`);
			else if (o && h.lugar.escenario !== o.lugar.escenario) p.push(`acción ${i + 1}: ${a.hacia} no está en el escenario de ${a.objeto}`);
		}
		if (a.tipo === 'entra' && o && o.fuente !== 'bolo') p.push(`acción ${i + 1}: solo un bolo puede entrar caminando`);
		if (a.tipo === 'gira' && o?.fuente.startsWith('construccion:')) p.push(`acción ${i + 1}: una construcción no gira; usa aparece para mostrar cada etapa`);
		if (a.tipo === 'falla') {
			if (o && !o.fuente.startsWith('construccion:')) p.push(`acción ${i + 1}: falla solo aplica a una construcción`);
			if (!a.efecto || !(a.efecto in FALLAS)) p.push(`acción ${i + 1}: falla necesita efecto: ${Object.keys(FALLAS).join(', ')}`);
		}
	});
	return p;
};

// ---------------------------------------------------------------- helpers

const palabras = (ctx: Ctx) => leer<{duration: number; words: Word[]}>(`${ctx.dir}/palabras.json`);
const clave = (prompt: string) => createHash('sha1').update(prompt).digest('hex').slice(0, 12);
// Three-quarter view: an image-to-3D model reads depth from the side and top it can see. A straight front view gave flat, guessed
// backs (a bullet camera came out stubby, a monitor became a thick box).
const SUFIJO_IMAGEN = ', simple clean shapes, low detail product model, three-quarter view from the front right and slightly above, showing the front, the right side and the top, whole object visible, soft even lighting, isolated on a plain light grey background, no text';
// Measured with TRELLIS.2 on two objects: from a three-quarter image the model still puts the object's front at +z,
// the convention the sceneries use (wall slots face the room), so no extra turn is needed. Kept as a named constant in
// case another view or model version changes that.
const GIRO_VISTA = 0;

// Objects as the film needs them: generated ones point at their GLB.
const objetosFinales = (ctx: Ctx): Objeto[] =>
	leer<Reparto>(`${ctx.dir}/reparto.json`).objetos.map((o) => ({
		id: o.id,
		nombre: o.nombre,
		fuente: o.fuente === 'generar' ? `glb:tinta/${ctx.nombre}/${clave(o.prompt_en!)}.glb` : o.fuente,
		largo: o.largo,
		lugar: {escenario: o.escenario, slot: o.slot},
		contorno: o.contorno,
		giro: o.giro + (o.fuente === 'generar' ? GIRO_VISTA : 0),
		partes: o.partes ?? undefined,
	}));

// ---------------------------------------------------------------- steps

export const PASOS: Paso[] = [
	{
		id: 'entorno',
		titulo: 'Revisar la máquina',
		quien: 'código',
		con: 'ffmpeg, disco, clave del LLM pedido, los modelos de esta máquina si se usan, y el catálogo de muebles',
		produce: [],
		estima: () => ({segundos: 30, dolares: 0}),
		run: async (ctx) => {
			const voz = resolverVoz(medios().voz.proveedor);
			ctx.log(`voz: ${voz.proveedor} (${voz.porque}); objetos nuevos en 3D: ${local().modelo3d ? 'con el comando de esta máquina' : 'no: solo catálogo, construcciones y personaje'}`);
			await prepararEntorno({perfil: ctx.perfil, usaLocal: voz.proveedor === 'local' || Boolean(local().imagen ?? local().modelo3d), log: ctx.log, flujo: 'estudio'});
			await ensurePack('muebles');
		},
	},
	{
		id: 'voz',
		titulo: 'Narrar el guion y medir cada palabra',
		quien: 'proveedor',
		con: 'config/medios.json: el comando de voz de esta máquina, ElevenLabs o sin voz; luego se mide cada palabra',
		produce: ['palabras.json'],
		estima: (s) => ({segundos: 15 + s.segundos * 0.6, dolares: 0}),
		run: async (ctx) => {
			const {duration, words, misheard} = await narrar({proveedor: resolverVoz(medios().voz.proveedor).proveedor, lineas: frases(ctx.guion.narration), dir: ctx.dir, salida: `${ctx.pub}/voz.wav`, log: ctx.log});
			escribir(`${ctx.dir}/palabras.json`, {duration, words});
			ctx.log(`voz ${duration.toFixed(1)} s, ${words.length} palabras${misheard.length ? `, dudosas: ${misheard.join(' ')}` : ''}`);
		},
	},
	{
		id: 'reparto',
		titulo: 'Elegir objetos, de dónde salen y dónde van',
		quien: 'LLM',
		con: 'LLM del perfil --llm (por defecto, el asistente de la sesión)',
		produce: ['reparto.json'],
		estima: (s) => ({segundos: 20 + s.palabras * 0.13, dolares: dolaresLLM(6000 + s.palabras * 2, 9000)}),
		run: async (ctx) => {
			const sistema = SISTEMA_REPARTO.replace('{ESCENARIOS}', catalogoEscenarios()).replace('{CONSTRUCCIONES}', catalogoConstrucciones());
			const notas = ctx.guion.style.length ? `\nEstilo del autor: ${ctx.guion.style.join(' ')}` : '';
			const usuario = `Guion:\n${ctx.guion.narration}${notas}\n\nCatálogo kenney:muebles/<modelo>: ${muebles().join(', ')}`;
			const r = await askJson(targetFor(ctx.perfil, 'reparto'), repartoSchema, sistema, usuario, {temperature: 0.4, maxTokens: 6000, check: (v) => revisarReparto(v as Reparto, ctx.guion.narration, (k) => existsSync(`${ctx.pub}/${k}.glb`))});
			// A ball when something rolls off an edge. Added by code: the model kept leaving it out even when told exactly.
			if (RUEDA.test(ctx.guion.narration) && !r.objetos.some((o) => o.fuente === 'pelota')) {
				const base = r.objetos.find((o) => o.fuente.startsWith('construccion:')) ?? r.objetos[0];
				r.objetos.push({id: 'pelota', nombre: 'pelota', fuente: 'pelota', prompt_en: null, largo: 1.2, escenario: base.escenario, slot: base.slot, contorno: false, giro: 0, partes: null});
			}
			escribir(`${ctx.dir}/reparto.json`, r);
			ctx.log(`${r.objetos.length} objetos: ${r.objetos.map((o) => `${o.id} (${o.fuente === 'generar' ? 'generar' : o.fuente}) en ${o.escenario}/${o.slot}`).join(', ')}`);
		},
	},
	{
		id: 'imagenes',
		titulo: 'Imagen de cada objeto a generar',
		quien: 'proveedor',
		con: 'el modelo de imagen de esta máquina o FLUX en la nube (fal); las fotos de banco no sirven para sacar un modelo 3D',
		produce: [],
		estima: (s) => ({segundos: s.generados * (local().imagen?.segundos ?? 20), dolares: 0}),
		run: async (ctx) => {
			const nuevos = [...new Map(leer<Reparto>(`${ctx.dir}/reparto.json`).objetos.filter((o) => o.fuente === 'generar').map((o) => [clave(o.prompt_en!), o.prompt_en!])).entries()];
			if (!nuevos.length) return;
			mkdirSync(`${ctx.pub}/img`, {recursive: true});
			// Pictures of older runs lived beside the run; they are still good.
			nuevos.forEach(([k]) => existsSync(`${ctx.dir}/img/${k}.png`) && !existsSync(`${ctx.pub}/img/${k}.png`) && copyFileSync(`${ctx.dir}/img/${k}.png`, `${ctx.pub}/img/${k}.png`));
			const pedidos: Pedido[] = nuevos.filter(([k]) => !existsSync(`${ctx.pub}/img/${k}.png`)).map(([k, prompt]) => ({id: k, archivo: `tinta/${ctx.nombre}/img/${k}.png`, prompt: prompt + SUFIJO_IMAGEN, busca: '', ancho: 1024, alto: 1024, clase: 'recorte'}));
			if (!pedidos.length) return;
			const proveedores = resolverImagenes(medios().imagen.proveedores).proveedor.filter((p) => p === 'local' || p === 'nube');
			if (!proveedores.length) throw new Error('el reparto pide objetos nuevos y no hay con qué dibujarlos: pon FAL_KEY en .env, configura un comando de imagen en config/local.json, o cambia esos objetos por modelos del catálogo en reparto.json');
			const {faltan} = await conseguirImagenes({pedidos, proveedores, nombre: ctx.nombre, dir: ctx.dir, log: ctx.log});
			if (faltan.length) throw new Error(`no salieron ${faltan.length} imágenes: ${faltan.map((p) => p.id).join(', ')}`);
			ctx.log(`${pedidos.length} imágenes`);
		},
	},
	{
		id: 'modelos',
		titulo: 'Modelo 3D de cada imagen',
		quien: 'proveedor',
		con: 'el comando de imagen a 3D de esta máquina (config/local.json, modelo3d)',
		produce: [],
		estima: (s) => ({segundos: s.generados ? 50 + s.generados * 105 + Math.ceil(s.generados * 0.4) * 80 : 0, dolares: 0}),
		run: async (ctx) => {
			const faltan = [...new Set(leer<Reparto>(`${ctx.dir}/reparto.json`).objetos.filter((o) => o.fuente === 'generar').map((o) => clave(o.prompt_en!)))].filter((k) => !existsSync(`${ctx.pub}/${k}.glb`));
			if (!faltan.length) return;
			const m3 = local().modelo3d;
			if (!m3) throw new Error('el reparto pide objetos nuevos en 3D y esta máquina no tiene con qué hacerlos: configura modelo3d en config/local.json (ver config/local.example.json), o cambia esos objetos por modelos del catálogo en reparto.json');
			liberar();
			// Objects go through one process so the model loads once. A failed object (out of GPU memory, most often) can
			// leave that process unable to continue, so the command stops at the first one: the failed object goes to the
			// retries the machine names, each in a fresh process, and a new process continues with the rest.
			const par = (k: string) => [path.resolve(`${ctx.pub}/img/${k}.png`), path.resolve(`${ctx.pub}/${k}.glb`)];
			const hecho = (k: string) => existsSync(`${ctx.pub}/${k}.glb`);
			const a512: string[] = [];
			let pendientes = faltan;
			while (pendientes.length) {
				esperarGPU(ctx.log);
				try {
					correr(m3.comando, pendientes.flatMap(par), {stdio: 'inherit'});
				} catch {
					const fallo = pendientes.find((k) => !hecho(k))!;
					ctx.log(`${fallo}: falló, va a reintento`);
					a512.push(fallo);
				}
				pendientes = pendientes.filter((k) => !hecho(k) && !a512.includes(k));
			}
			// Retry ladder, each try in a fresh process, with the flags the machine gives (lighter settings, usually).
			const fallidos: string[] = [];
			for (const k of a512) {
				const ok = (m3.reintentos ?? []).some((extra) => {
					esperarGPU(ctx.log);
					try {
						correr(m3.comando, [...par(k), ...extra], {stdio: 'inherit'});
						return true;
					} catch {
						ctx.log(`${k}: falló con ${extra.join(' ')}`);
						return false;
					}
				});
				if (!ok) fallidos.push(k);
			}
			if (fallidos.length) throw new Error(`no salieron los modelos ${fallidos.join(', ')}: cambia su prompt_en en reparto.json y repite desde imagenes`);
			ctx.log(`${faltan.length} modelos`);
		},
	},
	{
		id: 'tomas',
		titulo: 'Cortar en tomas, rótulos y acciones',
		quien: 'LLM',
		con: 'LLM del perfil --llm (por defecto, el asistente de la sesión)',
		produce: ['pelicula.json'],
		estima: (s) => ({segundos: 10 + s.palabras * 0.23, dolares: dolaresLLM(5000 + s.palabras * 10, 2000 + s.palabras * 45)}),
		run: async (ctx) => {
			const {duration, words} = palabras(ctx);
			const objetos = objetosFinales(ctx);
			const numeradas = words.map((w, i) => `${i}:${w.word}`).join(' ');
			const lista = objetos.map((o) => `- ${o.id}: ${o.nombre}${o.fuente === 'bolo' ? ' (personaje bolo)' : ''}, en ${o.lugar.escenario}/${o.lugar.slot}`).join('\n');
			const usuario = `Narración (${words.length} palabras, ${duration.toFixed(0)} s):\n${numeradas}\n\nEscenarios:\n${catalogoEscenarios()}\n\nObjetos colocados:\n${lista}`;
			const sistemaTomas = SISTEMA_TOMAS.replace('{FALLAS}', Object.entries(FALLAS).map(([k, v]) => `    ${k}: ${v}`).join('\n'));
			const t = await askJson(targetFor(ctx.perfil, 'tomas'), tomasSchema, sistemaTomas, usuario, {temperature: 0.3, maxTokens: 9000, check: (v) => revisarTomas(v as TomasLLM, words.length, objetos)});
			const inicio = (i: number) => (i === 0 ? 0 : words[t.tomas[i].primera].start);
			const tomas: Toma[] = t.tomas.map((s, i) => ({desde: inicio(i), hasta: i + 1 < t.tomas.length ? inicio(i + 1) : duration, escenario: s.escenario, encuadre: s.encuadre, objetivo: s.objetivo ?? undefined, rotulo: s.rotulo, tono: s.tono}));
			const acciones = t.acciones.map((a): Accion => {
				const en = words[a.palabra].start;
				const hasta = a.hasta_palabra !== null ? Math.max(en + 0.6, words[Math.min(a.hasta_palabra, words.length - 1)].end) : en;
				if (a.tipo === 'aparece' || a.tipo === 'desaparece') return {tipo: a.tipo, objeto: a.objeto, en};
				if (a.tipo === 'cono') return {tipo: 'cono', objeto: a.objeto, en, hasta, hacia: a.hacia!};
				if (a.tipo === 'falla') return {tipo: 'falla', objeto: a.objeto, en, hasta, efecto: a.efecto!};
				return {tipo: a.tipo, objeto: a.objeto, en, hasta};
			});
			const pelicula: Pelicula = {nombre: ctx.nombre, duracion: duration, objetos, tomas, acciones};
			escribir(`${ctx.dir}/pelicula.json`, pelicula);
			ctx.log(`${tomas.length} tomas, ${acciones.length} acciones`);
		},
	},
	{
		id: 'revision_modelos',
		titulo: 'Hoja de modelos generados para revisar',
		quien: 'revisión',
		con: 'Remotion (hoja) + el asistente o una persona (mirarla)',
		produce: [],
		estima: (s) => ({segundos: s.generados * 12, dolares: 0}),
		run: async (ctx) => {
			// Only this film's objects: earlier runs may have left GLBs for prompts no longer used.
			const glbs = [...new Set(leer<Reparto>(`${ctx.dir}/reparto.json`).objetos.filter((o) => o.fuente === 'generar').map((o) => `${clave(o.prompt_en!)}.glb`))].filter((f) => existsSync(`${ctx.pub}/${f}`));
			if (!glbs.length) return;
			const cuadros = glbs.map((f) => {
				const png = path.resolve(`${ctx.dir}/modelo_${f.replace('.glb', '')}.png`);
				if (!existsSync(png)) remotion(['still', 'src/tinta/index.tsx', 'ModeloTinta', png, '--frame=40', `--props=${JSON.stringify({archivo: `tinta/${ctx.nombre}/${f}`})}`], {stdio: 'ignore'});
				return png;
			});
			const filtro = cuadros.length > 1 ? `${cuadros.map((_, i) => `[${i}]`).join('')}hstack=${cuadros.length},scale=${Math.min(2400, cuadros.length * 400)}:-1` : 'scale=400:-1';
			execFileSync('ffmpeg', ['-v', 'error', '-y', ...cuadros.flatMap((c) => ['-i', c]), '-filter_complex', filtro, `${ctx.dir}/modelos.png`]);
			ctx.log(`revisa ${ctx.dir}/modelos.png: si un modelo salió mal, cambia su prompt_en en reparto.json y repite desde imagenes`);
		},
	},
	{
		id: 'sonido',
		titulo: 'Música, transiciones y efectos',
		quien: 'código',
		con: 'efectos de objeto sintetizados (kit/biblioteca/sonidos) + muestras grabadas en los cortes + música de kit/biblioteca/musica según el tono de cada toma',
		produce: [],
		estima: (s) => ({segundos: 5 + s.segundos * 0.1, dolares: 0}),
		run: async (ctx) => {
			const p = leer<Pelicula>(`${ctx.dir}/pelicula.json`);
			const EFECTO: Record<Accion['tipo'], string> = {aparece: 'pop', desaparece: 'bajada', pulso: 'zumbido_sensor', cono: 'click', entra: 'subida', gira: 'subida', falla: 'madera_cruje', cae: 'golpe_seco', lluvia: 'lluvia'};
			const FALLA_SUENA: Record<string, string> = {resbala: 'madera_cruje', ladea: 'madera_cruje', raja: 'grieta', truena: 'grieta', pudre: 'goteo'};
			// What objects do stays synthesized; each cut that moves takes its recorded sound.
			const golpes: Golpe[] = p.acciones.map((a) => {
				if (a.tipo === 'falla') return {t: a.en, efecto: FALLA_SUENA[a.efecto] ?? 'madera_cruje'};
				// The ball lands near the end of its fall; rain lasts as long as the action.
				if (a.tipo === 'cae') return {t: a.en + (a.hasta - a.en) * 0.6, efecto: 'golpe_seco'};
				if (a.tipo === 'lluvia') return {t: a.en, efecto: 'lluvia', dur: a.hasta - a.en};
				return {t: a.en, efecto: EFECTO[a.tipo]};
			});
			const SUENA = {latigo: {muestra: 'barrido', gain: 0.75, en: 0.08}, golpe: {muestra: 'subgolpe', gain: 0.4, en: 0}, destello: {muestra: 'impacto', gain: 0.7, en: 0}};
			const toques: Toque[] = p.tomas.flatMap((t, i) => {
				const e = entradaDe(p, i);
				return e === 'corte' ? [] : [{t: t.desde + SUENA[e].en, muestra: SUENA[e].muestra, gain: SUENA[e].gain}];
			});
			// A caption that reveals a figure (or one marked with campana) lands with the chime, as it bounces in.
			// The alert flash already has its own hit.
			p.tomas.forEach((t, i) => {
				if (t.rotulo && (t.campana ?? /\d/.test(t.rotulo)) && entradaDe(p, i) !== 'destello') toques.push({t: t.desde + 0.12, muestra: 'campanita', gain: 0.4});
			});
			// Music follows the tone of the shots: tension while the alert lasts, the steady pulse of an explanation otherwise.
			const {nivel} = medios().musica;
			const modo = modoMusica(medios().musica.modo);
			sintetizar({duracion: p.duracion, golpes, file: `${ctx.dir}/sonido_base.wav`, musica: modo === 'sintetizada' ? 1 : 0, conVoz: true});
			let fondo: string | null = null;
			if (modo === 'pistas') {
				const plan = planDeAnimos({trozos: p.tomas.map((t) => ({momento: t.tono === 'alerta' ? 'alerta' : 'explicacion', animo: t.tono === 'alerta' ? ('tension' as const) : ('curiosidad' as const), desde: t.desde, hasta: t.hasta})), look: 'papel', nombre: ctx.nombre, duracion: p.duracion, nivel});
				escribir(`${ctx.dir}/musica.json`, plan);
				fondo = `${ctx.dir}/musica.wav`;
				// The mix of this flow does not lower the bed under the voice, so the music comes already lowered.
				mezclarMusica({plan, duracion: p.duracion, voz: existsSync(`${ctx.pub}/voz.wav`) ? `${ctx.pub}/voz.wav` : null, salida: fondo});
				const cat = pistas();
				plan.tramos.forEach((t) => ctx.log(`música ${t.desde.toFixed(1)}–${t.hasta.toFixed(1)} s (${t.animo}): "${cat[t.pista].titulo}" de ${cat[t.pista].autor}, ${cat[t.pista].licencia}`));
			}
			mezclarMuestras(`${ctx.dir}/sonido_base.wav`, toques, `${ctx.pub}/sonido.wav`, fondo);
		},
	},
	{
		id: 'render',
		titulo: 'Renderizar la película',
		quien: 'código',
		con: 'Remotion + three.js (estilo tinta)',
		produce: ['mudo.mp4'],
		estima: (s) => ({segundos: 10 + s.segundos * 2.1, dolares: 0}),
		run: async (ctx) => {
			const props = `${ctx.dir}/props.json`;
			escribir(props, {pelicula: leer<Pelicula>(`${ctx.dir}/pelicula.json`)});
			remotion(['render', 'src/tinta/index.tsx', 'PeliculaTinta', `${ctx.dir}/mudo.mp4`, `--props=${props}`, '--codec=h264', '--crf=18'], {stdio: 'inherit'});
		},
	},
	{
		id: 'mezcla',
		titulo: 'Unir voz, sonido y video',
		quien: 'código',
		con: 'ffmpeg',
		produce: ['film.mp4'],
		estima: () => ({segundos: 15, dolares: 0}),
		run: async (ctx) => {
			execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${ctx.dir}/mudo.mp4`, '-i', `${ctx.pub}/voz.wav`, '-i', `${ctx.pub}/sonido.wav`, '-filter_complex', '[1:a]volume=1.0[v];[2:a]volume=0.7[s];[v][s]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=8[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${ctx.dir}/film.mp4`]);
		},
	},
	{
		id: 'revision_final',
		titulo: 'Hoja de cuadros del video para revisar',
		quien: 'revisión',
		con: 'ffmpeg (hoja) + el asistente o una persona (mirarla)',
		produce: ['hoja.png'],
		estima: () => ({segundos: 10, dolares: 0}),
		run: async (ctx) => {
			execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${ctx.dir}/film.mp4`, '-vf', 'fps=1/4,scale=240:-1,tile=8x3', '-frames:v', '1', `${ctx.dir}/hoja.png`]);
			ctx.log(`revisa ${ctx.dir}/hoja.png y ${ctx.dir}/film.mp4`);
		},
	},
];
