// Sound for a 2D explainer: background music, a recorded sound on every passage and the synthesized effects each scene asks for.
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inicios, PASO, type Plan, type Transicion} from '../../src/explica/plan';
import {mezclarMuestras, type Toque} from '../lib/muestras';
import {mezclarMusica, pistas, planDeAnimos, type Modo} from '../lib/musica';
// @ts-expect-error plain JS module shared with the other flows
import {EFECTOS, sonarEfecto} from '../../kit/biblioteca/sonidos/efectos.mjs';

const SR = 48000;
const tau = Math.PI * 2;

// Bright, unhurried progression (I–V–vi–IV in C) that loops every 8 s.
const ACORDES = [
	[130.81, 196.0, 261.63, 329.63],
	[98.0, 196.0, 246.94, 293.66],
	[110.0, 164.81, 220.0, 261.63],
	[87.31, 174.61, 220.0, 261.63],
];

const wav = (L: Float32Array, R: Float32Array) => {
	const n = L.length;
	const b = Buffer.alloc(44 + n * 4);
	b.write('RIFF', 0);
	b.writeUInt32LE(36 + n * 4, 4);
	b.write('WAVEfmt ', 8);
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(2, 22);
	b.writeUInt32LE(SR, 24);
	b.writeUInt32LE(SR * 4, 28);
	b.writeUInt16LE(4, 32);
	b.writeUInt16LE(16, 34);
	b.write('data', 36);
	b.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		b.writeInt16LE(Math.round(Math.tanh(L[i] * 0.9) * 32000), 44 + i * 4);
		b.writeInt16LE(Math.round(Math.tanh(R[i] * 0.9) * 32000), 46 + i * 4);
	}
	return b;
};

// A moment where an effect plays, in film seconds; dur overrides the effect's own length.
export type Golpe = {t: number; efecto: string; dur?: number};

// Music bed plus effects, as one stereo file. Shared by the 2D (Explica) and ink (Tinta) flows.
export const sintetizar = ({duracion, golpes, file, musica = 1, conVoz = false}: {duracion: number; golpes: Golpe[]; file: string; musica?: number; conVoz?: boolean}) => {
	const n = Math.ceil(duracion * SR);
	const L = new Float32Array(n);
	const R = new Float32Array(n);
	const add = (at: number, dur: number, fn: (t: number, u: number, d: number) => number, gain: number, pan = 0) => {
		const a = Math.max(0, Math.round(at * SR));
		const len = Math.round(dur * SR);
		for (let i = 0; i < len && a + i < n; i++) {
			const v = fn(i / SR, i / len, dur) * gain;
			L[a + i] += v * (1 - Math.max(0, pan));
			R[a + i] += v * (1 + Math.min(0, pan));
		}
	};

	// Bed: plucked chord tones on each half beat plus a quiet pad; lower under narration.
	const nivel = musica * (conVoz ? 0.45 : 1);
	// Comes in already playing (a slow swell wastes the hook) and fades out with the film.
	const fade = (t: number) => Math.min(1, t / 0.25, (duracion - t) / 1.8);
	const fases = new Float64Array(4);
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const acorde = ACORDES[Math.floor(t / 2) % ACORDES.length];
		let pad = 0;
		acorde.forEach((f, k) => {
			fases[k] += (tau * f) / SR;
			pad += Math.sin(fases[k]) * (k === 0 ? 0.5 : 0.22);
		});
		const lfo = 0.8 + 0.2 * Math.sin(t * 0.9);
		L[i] += pad * 0.05 * lfo * nivel * Math.max(0, fade(t));
		R[i] += pad * 0.05 * lfo * nivel * Math.max(0, fade(t));
	}
	for (let beat = 0; beat * 0.5 < duracion - 0.5; beat++) {
		const t = beat * 0.5;
		const acorde = ACORDES[Math.floor(t / 2) % ACORDES.length];
		const f = acorde[1 + (beat % 3)] * 2;
		add(t, 0.45, (x) => (Math.sin(tau * f * x) + 0.3 * Math.sin(tau * f * 2 * x)) * Math.exp(-x * 9), 0.06 * nivel * Math.max(0, fade(t)), beat % 2 ? 0.35 : -0.35);
	}
	golpes.forEach((g) => {
		if (!EFECTOS[g.efecto]) throw new Error(`efecto desconocido: ${g.efecto}`);
		sonarEfecto(g.efecto, g.t, add, g.dur ? {dur: g.dur} : {});
	});
	writeFileSync(file, wav(L, R));
	return duracion;
};

// The recorded sound of each passage (kit/biblioteca/sonidos/muestras) and how far into the passage its loudest
// moment lands. A fade stays silent.
const SUENA: Partial<Record<Transicion, {muestra: string; gain: number; en: number}>> = {
	deslizar: {muestra: 'barrido', gain: 0.6, en: 0.35},
	barrido: {muestra: 'barrido', gain: 0.5, en: 0.4},
	latigo: {muestra: 'barrido', gain: 0.8, en: 0.45},
	iris: {muestra: 'barrido_grave', gain: 0.7, en: 0.3},
	reloj: {muestra: 'barrido_grave', gain: 0.6, en: 0.3},
	golpe: {muestra: 'subgolpe', gain: 0.5, en: 0.1},
	destello: {muestra: 'impacto', gain: 0.7, en: 0.34},
};

// modo: tracks of the music library chosen by the mood of each scene (pistas), the synthesized bed, or no music.
// nivel is the gain of the library music; without a voice over it, it plays louder.
export const sonidoDe = (plan: Plan, file: string, {musica = 1, conVoz = false, modo = 'sintetizada' as Modo, nivel = 0.5, log = (() => undefined) as (...x: unknown[]) => void} = {}) => {
	const {inicios: t0, duracion} = inicios(plan);
	const golpes: Golpe[] = plan.escenas.flatMap((e, i) => (e.sonidos ?? []).map((s) => ({t: t0[i] + s.en, efecto: s.efecto})));
	const toques: Toque[] = plan.escenas.flatMap((e, i) => {
		const entrada = e.entrada ?? 'corte';
		const s = SUENA[entrada];
		return i > 0 && s ? [{t: t0[i] + PASO[entrada] * s.en, muestra: s.muestra, gain: s.gain}] : [];
	});
	const base = path.join(tmpdir(), `explica_${plan.nombre}_base.wav`);
	sintetizar({duracion, golpes, file: base, musica: modo === 'sintetizada' ? musica : 0, conVoz});
	let fondo: string | null = null;
	if (modo === 'pistas') {
		// Scenes say their mood, or take the default: the closing scene resolves, the rest explain.
		const trozos = plan.escenas.map((e, i) => ({momento: e.tipo === 'cierre' ? 'cierre' : 'desarrollo', animo: e.animo ?? (e.tipo === 'cierre' ? ('esperanza' as const) : ('curiosidad' as const)), desde: t0[i], hasta: i + 1 < t0.length ? t0[i + 1] : duracion}));
		const pm = planDeAnimos({trozos, look: 'papel', nombre: plan.nombre, duracion, nivel: conVoz ? nivel : Math.min(1.5, nivel * 2.8)});
		fondo = path.join(tmpdir(), `explica_${plan.nombre}_musica.wav`);
		mezclarMusica({plan: pm, duracion, voz: plan.voz ? `public/${plan.voz}` : null, salida: fondo});
		const cat = pistas();
		pm.tramos.forEach((t) => log(`música ${t.desde.toFixed(1)}–${t.hasta.toFixed(1)} s (${t.animo}): "${cat[t.pista].titulo}" de ${cat[t.pista].autor}, ${cat[t.pista].licencia}`));
	}
	mezclarMuestras(base, toques, file, fondo);
	return duracion;
};
