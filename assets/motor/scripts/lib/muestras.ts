// Recorded sound effects (kit/biblioteca/sonidos/muestras): short samples laid over a synthesized bed with ffmpeg.
// The catalog says what each one is for, where its loudest moment falls (ancla) and where it came from.
import {execFileSync} from 'node:child_process';
import {copyFileSync, readFileSync} from 'node:fs';

const DIR = 'kit/biblioteca/sonidos/muestras';
export type Muestra = {archivo: string; hace: string; cuando: string; dur: number; ancla: number; fuente: string; titulo: string; autor: string; licencia: string};
export const muestras = (): Record<string, Muestra> => JSON.parse(readFileSync(`${DIR}/muestras.json`, 'utf8'));

// t is the moment the loudest part of the sample must land on, in film seconds.
export type Toque = {t: number; muestra: string; gain: number};

// The first frame lands on a clean, low hit, so the film starts with a punch instead of silence. A flow that already
// put a sound in the first 0.4 s keeps its own.
const APERTURA: Toque = {t: 0.04, muestra: 'subgolpe', gain: 0.55};
export const conApertura = (toques: Toque[]): Toque[] => (toques.some((g) => g.t < 0.4) ? toques : [APERTURA, ...toques]);

// fondo: a file as long as the film (the background music) that goes in at its own level.
// apertura: false leaves the start without the opening hit (a test clip, or audio that is not a whole film).
export const mezclarMuestras = (base: string, entrada: Toque[], salida: string, fondo?: string | null, apertura = true) => {
	const toques = apertura ? conApertura(entrada) : entrada;
	if (!toques.length && !fondo) return copyFileSync(base, salida);
	const cat = muestras();
	const entradas = toques.flatMap((g) => {
		if (!cat[g.muestra]) throw new Error(`muestra desconocida: ${g.muestra}; hay: ${Object.keys(cat).join(', ')}`);
		return ['-i', `${DIR}/${cat[g.muestra].archivo}`];
	});
	const ramas = toques.map((g, k) => `[${k + 1}:a]volume=${g.gain.toFixed(2)},adelay=${Math.max(0, Math.round((g.t - cat[g.muestra].ancla) * 1000))}:all=1[m${k}]`);
	if (fondo) entradas.push('-i', fondo);
	// normalize=0 keeps every input at its own level; the bed sets the length.
	const mezcla = `[0:a]${toques.map((_, k) => `[m${k}]`).join('')}${fondo ? `[${toques.length + 1}:a]` : ''}amix=inputs=${toques.length + 1 + (fondo ? 1 : 0)}:normalize=0:duration=first,alimiter=limit=0.95[a]`;
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', base, ...entradas, '-filter_complex', [...ramas, mezcla].join(';'), '-map', '[a]', '-c:a', 'pcm_s16le', salida]);
};
