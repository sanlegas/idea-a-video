// Style of a storytelling film, decided by rules: which transition each cut gets, how the camera moves over each
// picture, where focus goes and how captions look and appear. Pure data in, pure data out, so the `estilo` step can
// write it to estilo.json and a person can edit that file. To add a style, add a preset here.
import type {Acto, Camara, Enfoque, Estilo, EstiloPlano, Grado, LookId, Texto, Transicion} from './formato';

// What the rules need to know about a shot, before it has times or files.
export type Corte = {tipo: 'escena' | 'narrador' | 'lamina'; bloque?: string | null; imagen?: string | null; tratamiento?: string | null; encuadre?: string | null; acto: Acto};

// Each kind of cut, from the most specific to the most general. A list is taken in turn, so the same kind of cut
// does not always look the same.
type Turno = Transicion | Transicion[];
type Cortes = {
	// The story turns: first shot of the thesis or of the twist.
	remate: Turno;
	// Same picture as the shot before, framed closer or wider; also narrator to narrator.
	acercamiento: Turno;
	a_lamina: Turno;
	entre_laminas: Turno;
	de_lamina: Turno;
	a_narrador: Turno;
	// A press photo arriving after colour.
	archivo: Turno;
	otro: Turno;
};

type Preset = {
	about: string;
	texto: Texto;
	// Narrator shots have no picture: the phrase is the shot, so it may appear another way.
	narrador: Partial<Texto>;
	// 'look' takes the grade from the film's look.
	grado: Grado | 'look';
	cortes: Cortes;
	porLook?: Partial<Record<LookId, Partial<Cortes>>>;
	// Camera moves by framing, taken in turn so two shots in a row never move alike.
	camaras: {abierto: Camara[]; medio: Camara[]; detalle: Camara[]; archivo: Camara[]};
	enfoque: {detalle: Enfoque; nueva: Enfoque; resto: Enfoque};
};

const GRADO_DE_LOOK: Record<LookId, Grado> = {papel: 'cine', noche: 'frio', brasa: 'calido'};

export const PRESETS = {
	dinamico: {
		about: 'llamativo, para redes: barridos, fogonazos y acercamientos de golpe; subtítulos condensados con la palabra que suena resaltada; el narrador, palabra por palabra',
		texto: {estilo: 'bloque', aparece: 'karaoke', posicion: 'abajo'},
		narrador: {aparece: 'palabra'},
		grado: 'look',
		cortes: {remate: 'destello', acercamiento: 'golpe', a_lamina: ['latigo', 'empuje', 'latigo', 'iris'], entre_laminas: 'empuje', de_lamina: ['latigo', 'corte'], a_narrador: 'disolver', archivo: 'destello', otro: 'corte'},
		// A signal dropping suits the look about screens.
		porLook: {noche: {de_lamina: ['fallo', 'latigo', 'corte']}},
		camaras: {abierto: ['empujar', 'paneo_der', 'alejar', 'paneo_izq'], medio: ['mano', 'empujar', 'subir'], detalle: ['empujar', 'mano', 'alejar'], archivo: ['empujar', 'subir']},
		enfoque: {detalle: 'selectivo', nueva: 'entrar', resto: 'fijo'},
	},
	cine: {
		about: 'pausado, de documental: fundidos con cambio de foco, iris en los remates, cámara lenta; subtítulos limpios que se van armando',
		texto: {estilo: 'limpio', aparece: 'acumula', posicion: 'abajo'},
		narrador: {aparece: 'pagina'},
		grado: 'cine',
		cortes: {remate: 'iris', acercamiento: 'corte', a_lamina: 'empuje', entre_laminas: 'corte', de_lamina: 'disolver', a_narrador: 'disolver', archivo: 'disolver', otro: 'corte'},
		camaras: {abierto: ['empujar', 'paneo_der', 'paneo_izq'], medio: ['empujar', 'alejar'], detalle: ['empujar'], archivo: ['empujar']},
		enfoque: {detalle: 'selectivo', nueva: 'entrar', resto: 'fijo'},
	},
	sobrio: {
		about: 'como los cortos de referencia: solo cortes secos y avance lento; subtítulos que se encienden palabra por palabra',
		texto: {estilo: 'limpio', aparece: 'pagina', posicion: 'alterna'},
		narrador: {},
		grado: 'neutro',
		cortes: {remate: 'corte', acercamiento: 'corte', a_lamina: 'corte', entre_laminas: 'corte', de_lamina: 'corte', a_narrador: 'corte', archivo: 'corte', otro: 'corte'},
		camaras: {abierto: ['empujar'], medio: ['empujar'], detalle: ['empujar'], archivo: ['empujar']},
		enfoque: {detalle: 'fijo', nueva: 'fijo', resto: 'fijo'},
	},
} satisfies Record<string, Preset>;
export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export const estilizar = (cortes: Corte[], id: PresetId, look: LookId): Estilo => {
	const preset: Preset = PRESETS[id];
	const c: Cortes = {...preset.cortes, ...preset.porLook?.[look]};
	const vistas = new Set<string>();
	const turno = {abierto: 0, medio: 0, detalle: 0, archivo: 0};
	const veces: Partial<Record<keyof Cortes, number>> = {};
	const toca = (k: keyof Cortes): Transicion => {
		const v = c[k];
		if (!Array.isArray(v)) return v;
		veces[k] = (veces[k] ?? 0) + 1;
		return v[(veces[k]! - 1) % v.length];
	};
	const planos = cortes.map((p, i): EstiloPlano => {
		const a = cortes[i - 1];
		const clase: keyof Cortes | null = !a
			? null
			: a.acto !== p.acto && (p.acto === 'tesis' || p.acto === 'giro')
				? 'remate'
				: (p.imagen && p.imagen === a.imagen) || (p.tipo === 'narrador' && a.tipo === 'narrador')
					? 'acercamiento'
					: p.tipo === 'lamina'
						? a.tipo === 'lamina' ? 'entre_laminas' : 'a_lamina'
						: a.tipo === 'lamina'
							? 'de_lamina'
							: p.tipo === 'narrador'
								? 'a_narrador'
								: p.tratamiento === 'archivo' && a.tratamiento !== 'archivo'
									? 'archivo'
									: 'otro';
		const transicion: Transicion = clase ? toca(clase) : 'corte';
		const nueva = Boolean(p.imagen) && !vistas.has(p.imagen!);
		if (p.imagen) vistas.add(p.imagen);
		if (p.tipo !== 'escena') return {transicion, camara: p.tipo === 'narrador' ? 'mano' : 'quieta', enfoque: 'fijo', ...(p.tipo === 'narrador' && Object.keys(preset.narrador).length ? {texto: preset.narrador} : {})};
		const grupo = p.tratamiento === 'archivo' ? 'archivo' : ((p.encuadre ?? 'medio') as 'abierto' | 'medio' | 'detalle');
		const lista = preset.camaras[grupo];
		const camara = lista[turno[grupo]++ % lista.length];
		// A blurred entrance over a transition that already blurs or wipes would read as a mistake.
		const limpia = transicion === 'corte' || transicion === 'destello';
		// The first shot is the hook: sharp from frame 0, never a focus pull that opens on a blur.
		const enfoque: Enfoque = i === 0 ? 'fijo' : p.encuadre === 'detalle' ? preset.enfoque.detalle : nueva && limpia ? preset.enfoque.nueva : preset.enfoque.resto;
		return {transicion, camara, enfoque};
	});
	return {preset: id, texto: preset.texto, grado: preset.grado === 'look' ? GRADO_DE_LOOK[look] : preset.grado, planos};
};
