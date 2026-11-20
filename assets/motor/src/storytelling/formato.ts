// Format of a storytelling film: a narrated short cut fast between three kinds of shot (staged scene, narrator to
// camera, graphic card), with word-by-word captions. Plain data, shared by the steps that write it and the render.
import type {Word} from '../estudio/film';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// Story beats, in the order they usually come. A film opens on the hook and may skip some of the rest.
export const ACTOS = ['gancho', 'tesis', 'historia', 'mecanismo', 'ejemplos', 'giro', 'aplicacion', 'cierre'] as const;
export type Acto = (typeof ACTOS)[number];

export const ACTO_ES: Record<Acto, string> = {
	gancho: 'escena cotidiana dramatizada, en segunda persona o con diálogo, que termina en un remate',
	tesis: 'la idea del video dicha en una frase corta, como una ley o un nombre',
	historia: 'un caso concreto con nombre propio: una persona, una empresa o un estudio',
	mecanismo: 'por qué pasa: la explicación, con sus datos',
	ejemplos: 'dos o tres situaciones cotidianas donde se nota',
	giro: 'el reencuadre: lo que casi nadie ve de esa idea',
	aplicacion: 'qué hacer con eso, hablándole de tú a quien mira',
	cierre: 'frase final que regresa a la escena del gancho',
};

// One graphic system per film: background of the cards, type, accent and the light of the narrator's room.
export type Look = {
	about: string;
	fondo: string;
	tinta: string;
	suave: string;
	acento: string;
	oscuro: boolean;
	// Narrator plate: centre and edge of the room glow, lamp colour, caption glow.
	ambiente: [string, string];
	lampara: string;
	brillo: string;
	// Light of the staged scenes, appended to their image prompts.
	luz_en: string;
};

export const LOOKS = {
	papel: {
		about: 'papel crema arrugado, letra negra apretada y marcador naranja; recortes en blanco y negro. Para temas de psicología cotidiana y humor',
		fondo: '#ECE7DC',
		tinta: '#141414',
		suave: '#6B665C',
		acento: '#FF5A1F',
		oscuro: false,
		ambiente: ['#3A1D0B', '#090504'],
		lampara: '#FFB45C',
		brillo: 'rgba(255,190,110,.55)',
		luz_en: 'warm amber light from a single lamp, dark room',
	},
	noche: {
		about: 'fondo negro, siluetas blancas que brillan y acento violeta; frío y tecnológico. Para atención, pantallas, trabajo y datos',
		fondo: '#0A0A0D',
		tinta: '#F4F4F6',
		suave: '#8D8F99',
		acento: '#B58CFF',
		oscuro: true,
		ambiente: ['#1B2026', '#050607'],
		lampara: '#DCE6F2',
		brillo: 'rgba(255,255,255,.45)',
		luz_en: 'cool dim grey-blue light from a screen, dark room at night',
	},
	brasa: {
		about: 'fondo negro con resplandor naranja, letra que brilla; íntimo y épico. Para mentalidad, deporte y superación',
		fondo: '#0B0908',
		tinta: '#FFF3E6',
		suave: '#9A8A7A',
		acento: '#FF7A1A',
		oscuro: true,
		ambiente: ['#4A1707', '#070403'],
		lampara: '#FF6A1A',
		brillo: 'rgba(255,140,40,.7)',
		luz_en: 'dark room with a deep orange backlight glow',
	},
} satisfies Record<string, Look>;
export type LookId = keyof typeof LOOKS;
export const LOOK_IDS = Object.keys(LOOKS) as LookId[];

// How close the frame is. Two shots of the same picture with different framing read as a punch-in cut.
export const ENCUADRES = {abierto: 1, medio: 1.32, detalle: 1.8, cerca: 1.5} as const;
export type Foco = 'arriba' | 'centro' | 'abajo';

// ---------------------------------------------------------------- style: how a shot enters, moves, focuses and captions
// Decided once per film by the `estilo` step (src/storytelling/estilo.ts) and kept in estilo.json, so a film can be
// restyled or replicated without touching its cut. A film without these fields renders as before: hard cuts, slow push-in.

// How a shot enters. dur in seconds; solapa: the shot before stays underneath while this one comes in.
export const TRANSICIONES = {
	corte: {dur: 0, solapa: false, hace: 'corte seco'},
	golpe: {dur: 0.2, solapa: false, hace: 'entra más cerca y se asienta: acercamiento de golpe'},
	latigo: {dur: 0.22, solapa: true, hace: 'barrido lateral rápido con estela'},
	empuje: {dur: 0.32, solapa: true, hace: 'el plano nuevo sube y empuja al anterior'},
	destello: {dur: 0.3, solapa: false, hace: 'fogonazo blanco que se apaga'},
	fallo: {dur: 0.2, solapa: false, hace: 'interferencia digital: saltos y franjas'},
	disolver: {dur: 0.34, solapa: true, hace: 'fundido cruzado con cambio de foco'},
	iris: {dur: 0.42, solapa: true, hace: 'se abre en círculo desde el punto de foco'},
} as const;
export type Transicion = keyof typeof TRANSICIONES;

// How the camera moves over a picture while the shot lasts.
export const CAMARAS = {
	empujar: 'avanza despacio hacia el foco',
	alejar: 'retrocede y abre el cuadro',
	paneo_izq: 'recorre hacia la izquierda',
	paneo_der: 'recorre hacia la derecha',
	subir: 'sube',
	bajar: 'baja',
	mano: 'cámara en mano: deriva y gira apenas',
	quieta: 'fija',
} as const;
export type Camara = keyof typeof CAMARAS;

export const ENFOQUES = {
	fijo: 'todo nítido',
	entrar: 'empieza desenfocado y enfoca',
	selectivo: 'nítido solo alrededor del foco; el resto, desenfocado como con lente abierto',
} as const;
export type Enfoque = keyof typeof ENFOQUES;

// Colour grade of the photographs.
export const GRADOS = {
	neutro: 'solo contraste',
	cine: 'sombras verde azuladas, luces ámbar y halo en las luces',
	frio: 'azulado y poco saturado, con halo',
	calido: 'ámbar, con halo',
	bn: 'blanco y negro contrastado',
} as const;
export type Grado = keyof typeof GRADOS;

// Captions: how they look, when each word shows and where they sit over a photograph.
export const TEXTO_ESTILOS = {
	limpio: 'grotesca blanca con resplandor',
	bloque: 'condensada en mayúsculas con borde negro grueso',
	caja: 'texto sobre caja oscura; la palabra que suena, sobre caja de color',
	contorno: 'letras huecas que se rellenan al decirse',
} as const;
export const TEXTO_APARECE = {
	pagina: 'la frase espera atenuada y cada palabra se enciende al decirse',
	acumula: 'cada palabra aparece al decirse y se queda',
	karaoke: 'la frase está completa y la palabra que suena se resalta',
	palabra: 'una sola palabra a la vez, grande',
	maquina: 'se escribe letra por letra, con cursor',
} as const;
export const TEXTO_POSICION = {alterna: 'arriba y abajo, alternando por plano', arriba: 'arriba', centro: 'al centro', abajo: 'tercio inferior'} as const;
export type Texto = {estilo: keyof typeof TEXTO_ESTILOS; aparece: keyof typeof TEXTO_APARECE; posicion: keyof typeof TEXTO_POSICION};
// What a film without style uses: the look the flow had before styles existed.
export const TEXTO_BASE: Texto = {estilo: 'limpio', aparece: 'pagina', posicion: 'alterna'};

export type EstiloPlano = {transicion: Transicion; camara: Camara; enfoque: Enfoque; texto?: Partial<Texto>};
// estilo.json: one entry per shot of planos.json, in order.
export type Estilo = {preset: string; texto: Texto; grado: Grado; planos: EstiloPlano[]};

type Base = {desde: number; hasta: number; primera: number; ultima: number; acto: Acto} & Partial<EstiloPlano>;

// Staged scene: a generated photograph filling the frame, pushed in slowly. `archivo` gives it the look of an old press photo.
export type PlanoEscena = Base & {tipo: 'escena'; imagen: string | null; prompt: string; tratamiento: 'color' | 'archivo'; encuadre: 'abierto' | 'medio' | 'detalle'; foco: Foco};

// Narrator to camera: there is no presenter, so the phrase itself fills a dark room with one lamp.
export type PlanoNarrador = Base & {tipo: 'narrador'; encuadre: 'medio' | 'cerca'};

// Graphic card. titular: the narrated words as big type. recorte: a cutout with a labelled leader line.
// dato: a number that counts up. cita: a framed picture with the name of who said or did it.
export type PlanoLamina = Base & {
	tipo: 'lamina';
	bloque: 'titular' | 'recorte' | 'dato' | 'cita';
	clave: string[];
	imagen?: string | null;
	prompt?: string;
	etiqueta?: string;
	valor?: number;
	prefijo?: string;
	sufijo?: string;
	autor?: string;
};

export type Plano = PlanoEscena | PlanoNarrador | PlanoLamina;

export type Pelicula = {
	nombre: string;
	duracion: number;
	look: LookId;
	palabras: Word[];
	planos: Plano[];
	// Optional picture of the narrator's room; without it the room is drawn.
	ambiente: string | null;
	// Style of the whole film; each shot carries its own transition, camera and focus.
	texto?: Texto;
	grado?: Grado;
	// Audio only for the live preview; the render step leaves both empty and ffmpeg mixes them afterwards.
	voz: string | null;
	sonido: string | null;
};

export const norma = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]/g, '');

// A word as a caption shows it: no trailing comma or period, question and exclamation marks kept.
export const limpia = (w: string) => w.replace(/^[«"“(]+/, '').replace(/[.,;:»"”)…]+$/, '');

// Caption pages inside one shot. linea: 1 to 4 words, for the narrator. bloque: up to three short lines, over pictures.
export type Pagina = {palabras: number[]; desde: number; hasta: number};
const LIMITE = {linea: {palabras: 4, letras: 20}, bloque: {palabras: 9, letras: 46}};

export const paginas = (words: Word[], p: Base, modo: keyof typeof LIMITE): Pagina[] => {
	const max = LIMITE[modo];
	const grupos: number[][] = [];
	let actual: number[] = [];
	let letras = 0;
	for (let i = p.primera; i <= p.ultima; i++) {
		const antes = words[i - 1];
		const pausa = actual.length > 0 && (/[.?!…]["»”]?$/.test(antes.word) || (modo === 'linea' && actual.length >= 2 && /[,;:]$/.test(antes.word)) || words[i].start - antes.end > 0.4);
		if (actual.length && (pausa || actual.length >= max.palabras || letras + words[i].word.length > max.letras)) {
			grupos.push(actual);
			actual = [];
			letras = 0;
		}
		actual.push(i);
		letras += words[i].word.length + 1;
	}
	if (actual.length) grupos.push(actual);
	return grupos.map((g, k) => ({palabras: g, desde: k === 0 ? p.desde : words[g[0]].start - 0.04, hasta: k === grupos.length - 1 ? p.hasta : words[grupos[k + 1][0]].start - 0.04}));
};

// Problems a film must not reach the render with. The steps run richer checks; this guards hand-edited files.
export const revisarPelicula = (f: Pelicula): string[] => {
	const p: string[] = [];
	if (!LOOKS[f.look]) p.push(`look desconocido: ${f.look}`);
	f.planos.forEach((s, i) => {
		const id = `plano ${i + 1} (${s.tipo})`;
		if (!(s.hasta > s.desde)) p.push(`${id}: termina antes de empezar`);
		if (i > 0 && Math.abs(s.desde - f.planos[i - 1].hasta) > 0.02) p.push(`${id}: no empieza donde termina el anterior`);
		if (s.primera < 0 || s.ultima >= f.palabras.length || s.ultima < s.primera) p.push(`${id}: palabras fuera de rango`);
		if (s.tipo === 'lamina' && s.bloque === 'dato' && typeof s.valor !== 'number') p.push(`${id}: un dato necesita valor`);
		if (s.transicion && !TRANSICIONES[s.transicion]) p.push(`${id}: transición desconocida: ${s.transicion}`);
		if (s.camara && !CAMARAS[s.camara]) p.push(`${id}: cámara desconocida: ${s.camara}`);
		if (s.enfoque && !ENFOQUES[s.enfoque]) p.push(`${id}: enfoque desconocido: ${s.enfoque}`);
	});
	return p;
};
