// A 2D explainer is a list of scenes, each one a fixed block filled with data.
// The plan is plain JSON so a model (or a person) can write it, and code checks it before rendering.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type Icono = 'chat' | 'persona' | 'chip' | 'rayo' | 'globo' | 'grafica' | 'check' | 'reloj' | 'empresa' | 'escuela';

// latigo: fast sideways pan with a smear; golpe: the scene lands from closer up; destello: a white flash between scenes.
export type Transicion = 'corte' | 'fundido' | 'deslizar' | 'barrido' | 'iris' | 'reloj' | 'latigo' | 'golpe' | 'destello';

// Mood of the background music while a scene is on (tracks of kit/biblioteca/musica).
export type Animo = 'tension' | 'curiosidad' | 'oscuro' | 'esperanza';

// Moment of a scene, in seconds from its start, when a sound effect plays.
export type Golpe = {en: number; efecto: string};

// animo: without it, scenes play under 'curiosidad' and the closing one under 'esperanza'.
type Base = {dur: number; entrada?: Transicion; sonidos?: Golpe[]; animo?: Animo};

export type Portada = Base & {tipo: 'portada'; antetitulo?: string; titulo: string; clave?: string; icono?: Icono};

export type Dato = Base & {tipo: 'dato'; valor: number; decimales?: number; prefijo?: string; sufijo?: string; etiqueta: string; icono?: Icono; fuente?: string};

export type Punto = {x: string; y: number; nota?: string};
export type Linea = Base & {tipo: 'linea'; titulo: string; unidad?: string; puntos: Punto[]; fuente: string; area?: boolean};

export type Barra = {etiqueta: string; valor: number; color?: string};
export type Barras = Base & {tipo: 'barras'; titulo: string; unidad?: string; barras: Barra[]; fuente: string};

export type Paso = {icono: Icono; texto: string};
export type Pasos = Base & {tipo: 'pasos'; titulo: string; pasos: Paso[]};

export type Comparar = Base & {tipo: 'comparar'; titulo: string; antes: {etiqueta: string; valor: string; icono: Icono}; despues: {etiqueta: string; valor: string; icono: Icono}};

export type Cierre = Base & {tipo: 'cierre'; frase: string; clave?: string; pie?: string};

export type Escena = Portada | Dato | Linea | Barras | Pasos | Comparar | Cierre;

export type Plan = {nombre: string; escenas: Escena[]; audio?: string | null; voz?: string | null};

// Length of the passage that brings a scene in, in seconds.
export const PASO: Record<Transicion, number> = {corte: 0, fundido: 0.4, deslizar: 0.45, barrido: 0.45, iris: 0.6, reloj: 0.6, latigo: 0.3, golpe: 0.26, destello: 0.36};

export const frames = (s: number) => Math.max(1, Math.round(s * FPS));

// Start of each scene on the film clock: passages overlap the end of the previous scene.
export const inicios = (plan: Plan) => {
	const out: number[] = [];
	let t = 0;
	plan.escenas.forEach((e, i) => {
		if (i > 0) t -= frames(PASO[e.entrada ?? 'corte']) / FPS;
		out.push(t);
		t += frames(e.dur) / FPS;
	});
	return {inicios: out, duracion: t};
};

// Problems a person or a model must fix before the plan renders.
export const revisar = (plan: Plan): string[] => {
	const p: string[] = [];
	plan.escenas.forEach((e, i) => {
		const id = `escena ${i + 1} (${e.tipo})`;
		if (!(e.dur >= 1.5)) p.push(`${id}: dura menos de 1,5 s`);
		if (i > 0 && PASO[e.entrada ?? 'corte'] >= e.dur / 2) p.push(`${id}: la transición ocupa más de media escena`);
		if (e.tipo === 'linea' && e.puntos.length < 2) p.push(`${id}: una línea necesita al menos 2 puntos`);
		if (e.tipo === 'barras' && (e.barras.length < 2 || e.barras.length > 7)) p.push(`${id}: entre 2 y 7 barras`);
		if (e.tipo === 'pasos' && (e.pasos.length < 2 || e.pasos.length > 5)) p.push(`${id}: entre 2 y 5 pasos`);
		if ((e.tipo === 'linea' || e.tipo === 'barras') && !e.fuente.trim()) p.push(`${id}: toda gráfica cita su fuente`);
		e.sonidos?.forEach((s) => s.en > e.dur && p.push(`${id}: sonido ${s.efecto} cae después del final`));
	});
	return p;
};
