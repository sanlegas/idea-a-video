// Background music from a library of public-domain tracks (kit/biblioteca/musica). A film is split in stretches,
// each with a mood; this file picks a track for each stretch and mixes them into one file that stays under the voice.
// The catalog says what each track sounds like, which moods it serves and where it came from.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';

const DIR = 'kit/biblioteca/musica';

export const ANIMOS = {
	tension: 'suspenso: algo está por pasar',
	curiosidad: 'pulso constante de quien investiga o explica',
	oscuro: 'grave e inquietante: la mala noticia',
	esperanza: 'cálido y abierto: la salida',
} as const;
export type Animo = keyof typeof ANIMOS;

// looks: the graphic looks a track suits; without it, any. Every file is at the same loudness (-20 LUFS).
export type Pista = {archivo: string; animo: Animo[]; looks?: string[]; hace: string; dur: number; fuente: string; titulo: string; autor: string; licencia: string};
// The tracks this machine has: those of the catalog whose file is here. The library is installed apart
// (scripts/bibliotecas.ts), so a machine may hold all of it, part of it or none.
export const pistas = (): Record<string, Pista> => Object.fromEntries(Object.entries(JSON.parse(readFileSync(`${DIR}/musica.json`, 'utf8')) as Record<string, Pista>).filter(([, p]) => existsSync(`${DIR}/${p.archivo}`)));

let avisado = false;
// The kind of music a run gets: library tracks need the library. Without any track here, the synthesized bed plays
// instead, and the run says so once.
export const modoMusica = (pedido: Modo): Modo => {
	if (pedido !== 'pistas' || Object.keys(pistas()).length) return pedido;
	if (!avisado) console.log('música: la biblioteca no está instalada (corre pnpm bibliotecas); suena la cama sintetizada');
	avisado = true;
	return 'sintetizada';
};

// One stretch of the film with one track. inicio: second of the track where it starts playing.
export type Tramo = {momento: string; animo: Animo; desde: number; hasta: number; pista: string; inicio: number};
// pistas: tracks of the library; sintetizada: the synthesized bed the flow had before; no: no music at all.
export const MODOS = ['pistas', 'sintetizada', 'no'] as const;
export type Modo = (typeof MODOS)[number];
// nivel: gain of the music where nobody speaks, 1 being as loud as the files are; under the voice it drops further.
export type PlanMusical = {modo: Modo; nivel: number; tramos: Tramo[]};

// A track for a mood: one that suits the look, long enough to cover the stretch without repeating if there is one,
// and not the one that just played. Among those, the film's name decides, so a rerun picks the same and another
// film may get another.
export const elegirPista = ({animo, look, largo, semilla, evita}: {animo: Animo; look: string; largo: number; semilla: string; evita?: string}) => {
	// With part of the library missing, a mood without tracks borrows from the ones that are here.
	const deAnimo = Object.entries(pistas()).filter(([, p]) => p.animo.includes(animo));
	const todas = deAnimo.length ? deAnimo : Object.entries(pistas());
	if (!todas.length) throw new Error(`no hay pistas de música instaladas en ${DIR}: corre pnpm bibliotecas, o usa --musica sintetizada`);
	const mejor = (lista: typeof todas, sirve: (x: (typeof todas)[number]) => boolean) => (lista.some(sirve) ? lista.filter(sirve) : lista);
	let c = mejor(todas, ([, p]) => !p.looks || p.looks.includes(look));
	c = mejor(c, ([, p]) => p.dur >= largo);
	c = mejor(c, ([id]) => id !== evita);
	return c[parseInt(createHash('sha1').update(semilla).digest('hex').slice(0, 8), 16) % c.length][0];
};

// A plan from the mood of each stretch of a film, whatever the flow calls its stretches (acts, scenes, beats, shots).
// Neighbours with the same mood become one stretch, and a stretch too short for a track to register keeps the music
// it came with. minimo is that length in seconds.
export type Trozo = {momento: string; animo: Animo; desde: number; hasta: number};
export const planDeAnimos = ({trozos, look, nombre, duracion, nivel, minimo = 6}: {trozos: Trozo[]; look: string; nombre: string; duracion: number; nivel: number; minimo?: number}): PlanMusical => {
	const unir = (lista: Trozo[]) => lista.reduce<Trozo[]>((a, g) => (a.length && a[a.length - 1].animo === g.animo ? [...a.slice(0, -1), {...a[a.length - 1], hasta: g.hasta}] : [...a, {...g}]), []);
	let grupos = unir(trozos);
	for (let i = 0; i < grupos.length && grupos.length > 1; ) {
		// The ending may be shorter than the rest: a film that resolves should sound like it.
		if (grupos[i].hasta - grupos[i].desde >= (i === grupos.length - 1 ? Math.min(minimo, 4) : minimo)) i++;
		// A short opening joins what follows; of the two, the longer one says the mood.
		else if (i === 0) grupos.splice(0, 2, {...(grupos[0].hasta - grupos[0].desde > grupos[1].hasta - grupos[1].desde ? grupos[0] : grupos[1]), desde: grupos[0].desde, hasta: grupos[1].hasta});
		else grupos.splice(i - 1, 2, {...grupos[i - 1], hasta: grupos[i].hasta});
	}
	grupos = unir(grupos);
	const tramos: Tramo[] = [];
	grupos.forEach((g, i) => tramos.push({...g, desde: i === 0 ? 0 : g.desde, hasta: i === grupos.length - 1 ? duracion : g.hasta, pista: elegirPista({animo: g.animo, look, largo: g.hasta - g.desde, semilla: `${nombre}|${g.momento}`, evita: tramos[i - 1]?.pista}), inicio: 0}));
	return {modo: 'pistas', nivel, tramos};
};

// Seconds two tracks overlap at a change of stretch.
const CRUCE = 1.2;

export const revisarPlan = (plan: PlanMusical, duracion: number): string[] => {
	const p: string[] = [];
	if (!MODOS.includes(plan.modo)) p.push(`modo desconocido: ${plan.modo}; hay: ${MODOS.join(', ')}`);
	if (!(plan.nivel > 0 && plan.nivel <= 1.5)) p.push(`nivel fuera de rango (0 a 1.5): ${plan.nivel}`);
	if (plan.modo !== 'pistas') return p;
	if (!plan.tramos.length) p.push('el modo pistas necesita al menos un tramo');
	const cat = pistas();
	plan.tramos.forEach((t, i) => {
		const id = `tramo ${i + 1} (${t.momento})`;
		if (!cat[t.pista]) p.push(`${id}: pista desconocida: ${t.pista}; hay: ${Object.keys(cat).join(', ')}`);
		else if (t.inicio < 0 || t.inicio >= cat[t.pista].dur) p.push(`${id}: inicio ${t.inicio} fuera de la pista, que dura ${cat[t.pista].dur} s`);
		if (!(t.hasta > t.desde)) p.push(`${id}: termina antes de empezar`);
		if (Math.abs(t.desde - (i ? plan.tramos[i - 1].hasta : 0)) > 0.05) p.push(`${id}: empieza en ${t.desde} y debe empezar en ${i ? plan.tramos[i - 1].hasta : 0}`);
	});
	const fin = plan.tramos[plan.tramos.length - 1]?.hasta;
	if (fin !== undefined && Math.abs(fin - duracion) > 0.5) p.push(`el último tramo termina en ${fin} y la película dura ${duracion.toFixed(2)}`);
	return p;
};

// All stretches in one stereo file as long as the film. Tracks cross-fade at each change, the first comes in already
// playing (a 60 ms ramp only avoids a click: a slow fade-in wastes the hook) and the last fades out with the film. With a voice file, the music drops while someone speaks and comes back in the gaps.
export const mezclarMusica = ({plan, duracion, voz, salida}: {plan: PlanMusical; duracion: number; voz?: string | null; salida: string}) => {
	const cat = pistas();
	const n = plan.tramos.length;
	const entradas: string[] = [];
	const ramas = plan.tramos.map((t, k) => {
		const ultimo = k === n - 1;
		const desde = k === 0 ? 0 : t.desde - CRUCE / 2;
		const largo = (ultimo ? duracion : t.hasta + CRUCE / 2) - desde;
		const [entra, sale] = [k === 0 ? 0.06 : CRUCE, ultimo ? Math.min(2, largo / 2) : CRUCE];
		// The track repeats if the stretch outlasts it.
		entradas.push('-stream_loop', '-1', '-ss', t.inicio.toFixed(2), '-t', largo.toFixed(3), '-i', `${DIR}/${cat[t.pista].archivo}`);
		// qsin on both sides keeps the loudness steady through the overlap.
		return `[${k}:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=${entra}:curve=qsin,afade=t=out:st=${(largo - sale).toFixed(3)}:d=${sale.toFixed(3)}:curve=qsin,adelay=${Math.round(desde * 1000)}:all=1[t${k}]`;
	});
	const junta = `${plan.tramos.map((_, k) => `[t${k}]`).join('')}amix=inputs=${n}:normalize=0:duration=longest[m]`;
	const conVoz = Boolean(voz && existsSync(voz));
	if (conVoz) entradas.push('-i', voz!);
	// About 6 dB down while the voice sounds, back up in under half a second when it stops.
	const baja = conVoz ? `[m][${n}:a]sidechaincompress=threshold=0.03:ratio=2.5:attack=20:release=450[d];[d]` : '[m]';
	const fin = `${baja}volume=${plan.nivel.toFixed(2)},apad[a]`;
	execFileSync('ffmpeg', ['-v', 'error', '-y', ...entradas, '-filter_complex', [...ramas, junta, fin].join(';'), '-map', '[a]', '-t', duracion.toFixed(3), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', salida]);
};
