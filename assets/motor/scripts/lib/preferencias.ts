// What this user makes most often: a template (a kind of video with its style and length already chosen) and where
// voice, pictures, music and the writing come from. The first-use assistant (scripts/asistente.ts) writes it;
// `pnpm video` and the flows read it, so a video can be asked for without naming a single option.
// The template and the writer live in config/preferencias.json; voice, pictures and music keep their place in
// config/medios.json. Neither file travels: they are this user's.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {PRESET_IDS, type PresetId} from '../../src/storytelling/estilo';
import {local} from './local';
import {MODOS, type Modo} from './musica';
import {PROVEEDORES_IMAGEN, PROVEEDORES_VOZ, type Medios} from './medios';
import {vozDelSistema} from './voz_sistema';

// A template: a flow, and for Storytelling the style and the length it is usually made with.
// Not to be confused with the flow called `plantillas`, which is one of the flows a template can use.
export type Plantilla = {nombre: string; para: string; flujo: string; estilo?: PresetId; segundos?: number; entra: string; ejemplo: string};

export const PLANTILLAS = {
	historia: {nombre: 'Historia completa', para: 'una idea contada como historia, con gancho, caso, explicación y cierre; fotos, láminas y subtítulos llamativos', flujo: 'storytelling', estilo: 'dinamico', segundos: 75, entra: 'un tema o un guion', ejemplo: 'mi-video --tema "por qué bostezamos"'},
	corto: {nombre: 'Corto llamativo', para: 'lo mismo en breve, para redes: gancho fuerte y cortes rápidos', flujo: 'storytelling', estilo: 'dinamico', segundos: 45, entra: 'un tema o un guion', ejemplo: 'mi-video --tema "por qué bostezamos"'},
	documental: {nombre: 'Mini documental', para: 'ritmo pausado, fundidos y subtítulos limpios; para temas serios o con más datos', flujo: 'storytelling', estilo: 'cine', segundos: 90, entra: 'un tema o un guion', ejemplo: 'mi-video --tema "cómo se hizo el canal de Panamá"'},
	sobrio: {nombre: 'Sobrio', para: 'cortes secos y subtítulos discretos, sin efectos; para marcas y temas formales', flujo: 'storytelling', estilo: 'sobrio', segundos: 60, entra: 'un tema o un guion', ejemplo: 'mi-video --guion guiones/storytelling/mi-video.md'},
	datos: {nombre: 'Datos en 2D', para: 'cifras, gráficas y texto animado, sin voz; no pide claves ni imágenes', flujo: 'explica', entra: 'un plan con las escenas y sus datos (.json)', ejemplo: 'guiones/explica/ia.json'},
	ilustrado: {nombre: 'Ilustrado en 3D', para: 'objetos con contorno de tinta sobre una maqueta; para explicar aparatos y cosas de casa', flujo: 'tinta', entra: 'un guion', ejemplo: 'mi-video --guion guiones/tinta/mi-video.md'},
	mundo: {nombre: 'Mundo 3D', para: 'una ciudad, una torre o un barco recorridos por la cámara; para temas físicos y de gran escala', flujo: 'plantillas', entra: 'un guion', ejemplo: 'mi-video --guion guiones/mi-video.md'},
	medida: {nombre: 'Escenas 3D a medida', para: 'cada escena se inventa y se programa para el guion; lo más variado, lo más lento y lo menos seguro', flujo: 'estudio', entra: 'un guion', ejemplo: 'mi-video --guion guiones/mi-video.md'},
} satisfies Record<string, Plantilla>;
export type PlantillaId = keyof typeof PLANTILLAS;
export const PLANTILLA_IDS = Object.keys(PLANTILLAS) as PlantillaId[];
export const RECOMENDADA: PlantillaId = 'historia';
export const plantilla = (id: PlantillaId): Plantilla => PLANTILLAS[id];

// llm: who writes guion, direction and shots when the run does not say. modo: the way of working last chosen.
// configurado: when the assistant last ran.
export type Preferencias = {plantilla: PlantillaId; estilo?: PresetId; segundos?: number; llm?: string; modo?: ModoTrabajo; configurado?: string};

// A way of working sets voice and pictures together. auto: whatever this machine and its keys give. nube: the paid
// services, for the best result. local: nothing leaves the machine while a video is made.
export const MODOS_TRABAJO = ['auto', 'nube', 'local'] as const;
export type ModoTrabajo = (typeof MODOS_TRABAJO)[number];
// Templates that come out whole with nothing from outside: they draw their own pictures in 2D or 3D.
export const PLANTILLAS_SIN_FOTOS: PlantillaId[] = ['medida', 'ilustrado', 'mundo', 'datos'];

// Voice, pictures and writer that a way of working means on this machine. local: the machine's own commands where it
// declares them, else the system voice and no pictures from outside (the 3D templates draw their own; Storytelling
// shows text plates), and the session's assistant writes.
export const ajustesDeModo = (modo: ModoTrabajo): {voz: string; imagenes: string; llm?: string} => {
	if (modo === 'nube') return {voz: 'elevenlabs', imagenes: 'nube,stock'};
	if (modo === 'local') return {voz: local().voz ? 'local' : vozDelSistema() ? 'sistema' : 'borrador', imagenes: local().imagen ? 'local' : 'placas', llm: 'sesion'};
	return {voz: 'auto', imagenes: 'auto'};
};

const ARCHIVO = 'config/preferencias.json';
const MEDIOS = 'config/medios.json';
const perfiles = (): string[] => Object.keys(JSON.parse(readFileSync('config/models.json', 'utf8')).profiles);

// Without the file, nobody has chosen yet: the first-use assistant has not run in this folder.
export const primeraVez = () => !existsSync(ARCHIVO);
// A template this version no longer has falls back to the recommended one instead of stopping every command.
export const preferencias = (): Preferencias => {
	if (!existsSync(ARCHIVO)) return {plantilla: RECOMENDADA};
	const p = JSON.parse(readFileSync(ARCHIVO, 'utf8')) as Preferencias;
	return PLANTILLA_IDS.includes(p.plantilla) ? p : {...p, plantilla: RECOMENDADA};
};

// The style and length a Storytelling video gets when the run names none: the user's own, or those of their template.
export const estiloPreferido = (): PresetId => preferencias().estilo ?? plantilla(preferencias().plantilla).estilo ?? 'dinamico';
export const segundosPreferidos = (): number => preferencias().segundos ?? plantilla(preferencias().plantilla).segundos ?? 75;

// What can be chosen, in the words a person reads. `auto` picks from the keys and the machine, and says what it picked.
export const OPCIONES = {
	modo: {
		auto: 'usa lo que haya en tu equipo y tus claves; sin claves sale gratis, con la voz del sistema y fotos libres',
		nube: 'lo mejor: voz natural de ElevenLabs e imágenes hechas para cada plano con FLUX; pide ELEVENLABS_API_KEY y FAL_KEY, y se cobra en tus cuentas',
		local: 'nada sale de tu equipo al hacer un video: voz propia o del sistema, escenas 3D con modelos del catálogo y dibujos 2D; sin claves ni fotos de banco',
	},
	voz: {
		auto: 'la mejor que haya: un comando propio, ElevenLabs si está su clave, o la voz del sistema',
		elevenlabs: 'voz natural en la nube; pide ELEVENLABS_API_KEY',
		sistema: 'la voz que trae el sistema operativo; gratis y sin conexión',
		local: 'un comando de voz propio, declarado en config/local.json',
		borrador: 'sin voz: videos mudos, para revisar el corte',
	},
	imagenes: {
		auto: 'lo mejor que haya: un comando propio, generadas en la nube si está la clave, o fotos libres',
		'nube,stock': 'generadas para cada plano, y fotos libres para lo que falle; pide FAL_KEY (FLUX en fal, ~$0.003 por imagen)',
		stock: 'fotos libres de bancos; gratis, pero no siempre vienen al caso',
		local: 'un comando de imagen propio, declarado en config/local.json',
		placas: 'sin imágenes: placas con el texto de lo que iría',
	},
	musica: {
		pistas: 'música de la biblioteca, que cambia con el momento del video',
		sintetizada: 'una cama musical simple hecha por código',
		no: 'sin música',
	},
	llm: {
		sesion: 'tu asistente de IA (Claude Code, Codex u otro) escribe guion, dirección y planos cuando el motor se lo pide; sin clave',
		openrouter: 'un modelo en la nube los escribe solo; pide OPENROUTER_API_KEY',
		deepseek: 'DeepSeek en la nube los escribe solo; pide DEEPSEEK_API_KEY',
		local: 'un servidor propio compatible con OpenAI (LM_BASE, o llm en config/local.json)',
	},
} as const;
export type Ajuste = keyof typeof OPCIONES;
export const RECOMENDADO = {modo: 'auto', plantilla: RECOMENDADA, voz: 'auto', imagenes: 'auto', musica: 'pistas'} as const;
// The template to offer first for a way of working: in local mode, without a picture command, one that draws its own.
export const plantillaPara = (modo: ModoTrabajo): PlantillaId => (modo === 'local' && !local().imagen ? 'medida' : RECOMENDADA);

const ELEGIBLES = ['modo', 'plantilla', 'estilo', 'segundos', 'voz', 'imagenes', 'musica', 'llm'];

// Checks every choice and says what is wrong in the user's words. Returns the problems; nothing is written.
export const revisarEleccion = (e: Record<string, string>): string[] => {
	const p: string[] = [];
	const hay = (v: readonly string[]) => `hay: ${v.join(', ')}`;
	for (const k of Object.keys(e)) if (!ELEGIBLES.includes(k)) p.push(`"${k}" no es algo que se pueda elegir; ${hay(ELEGIBLES)}`);
	if (e.modo && !MODOS_TRABAJO.includes(e.modo as ModoTrabajo)) p.push(`modo desconocido: ${e.modo}; ${hay(MODOS_TRABAJO)}`);
	if (e.plantilla && !PLANTILLA_IDS.includes(e.plantilla as PlantillaId)) p.push(`plantilla desconocida: ${e.plantilla}; ${hay(PLANTILLA_IDS)}`);
	if (e.estilo && !PRESET_IDS.includes(e.estilo as PresetId)) p.push(`estilo desconocido: ${e.estilo}; ${hay(PRESET_IDS)}`);
	if (e.segundos && !(Number(e.segundos) >= 15 && Number(e.segundos) <= 240)) p.push(`segundos fuera de rango: ${e.segundos}; van de 15 a 240`);
	if (e.voz && !['auto', ...PROVEEDORES_VOZ].includes(e.voz)) p.push(`voz desconocida: ${e.voz}; ${hay(['auto', ...PROVEEDORES_VOZ])}`);
	if (e.imagenes && e.imagenes.split(',').some((x) => !['auto', ...PROVEEDORES_IMAGEN].includes(x.trim()))) p.push(`imágenes desconocidas: ${e.imagenes}; ${hay(['auto', ...PROVEEDORES_IMAGEN])}, o varias separadas por comas, que se prueban en orden`);
	if (e.musica && !MODOS.includes(e.musica as Modo)) p.push(`música desconocida: ${e.musica}; ${hay(MODOS)}`);
	if (e.llm && !perfiles().includes(e.llm)) p.push(`llm desconocido: ${e.llm}; ${hay(perfiles())}`);
	return p;
};

// Writes what was chosen: template, style, length, writer and way of working to preferencias.json; voice, pictures
// and music to medios.json. A way of working fills voice, pictures and writer unless they are named too. What is not
// named stays as it was; `deCero` forgets the earlier choices instead.
export const guardarEleccion = (pedida: Record<string, string>, {deCero = false} = {}): Preferencias => {
	const mal = revisarEleccion(pedida);
	if (mal.length) throw new Error(`No se guardó nada:\n- ${mal.join('\n- ')}`);
	const e: Record<string, string> = pedida.modo ? {...ajustesDeModo(pedida.modo as ModoTrabajo), ...pedida} : pedida;
	const antes: Preferencias = deCero ? {plantilla: RECOMENDADA} : preferencias();
	// Local mode without a picture command would leave a Storytelling template with text plates: unless a template is
	// named, it moves to one that draws its own pictures.
	if (e.modo === 'local' && !e.plantilla && e.imagenes === 'placas' && plantilla(antes.plantilla).flujo === 'storytelling') e.plantilla = plantillaPara('local');
	const nuevas: Preferencias = {plantilla: (e.plantilla as PlantillaId | undefined) ?? antes.plantilla};
	if (e.modo ?? antes.modo) nuevas.modo = (e.modo ?? antes.modo) as ModoTrabajo;
	// A style or a length of the user's own belongs to the template it was chosen for: a new template brings its own.
	const estilo = (e.estilo as PresetId | undefined) ?? (e.plantilla ? undefined : antes.estilo);
	const segundos = e.segundos ? Number(e.segundos) : e.plantilla ? undefined : antes.segundos;
	if (estilo) nuevas.estilo = estilo;
	if (segundos) nuevas.segundos = segundos;
	if (e.llm ?? antes.llm) nuevas.llm = e.llm ?? antes.llm;
	nuevas.configurado = new Date().toISOString().slice(0, 10);
	writeFileSync(ARCHIVO, `${JSON.stringify(nuevas, null, '\t')}\n`);
	if (e.voz || e.imagenes || e.musica) {
		const m = JSON.parse(readFileSync(MEDIOS, 'utf8')) as Medios;
		if (e.voz) m.voz.proveedor = e.voz as Medios['voz']['proveedor'];
		if (e.imagenes) m.imagen.proveedores = e.imagenes.split(',').map((x) => x.trim()) as Medios['imagen']['proveedores'];
		if (e.musica) m.musica.modo = e.musica as Modo;
		writeFileSync(MEDIOS, `${JSON.stringify(m, null, 2)}\n`);
	}
	return nuevas;
};
