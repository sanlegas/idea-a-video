// Sound for a finished film. A model only picks from fixed lists. Code synthesizes ambience and effects; the music comes
// from the public-domain tracks of kit/biblioteca/musica and the passages from the recorded samples of kit/biblioteca/sonidos.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {z} from 'zod';
import {wordTime, type Word} from '../../../src/estudio/film';
import {askJson, targetFor} from '../../lib/llm';
import {medios} from '../../lib/medios';
import {mezclarMuestras, type Toque} from '../../lib/muestras';
import {mezclarMusica, modoMusica, pistas, planDeAnimos, type Animo} from '../../lib/musica';
import type {Direction} from './cerebro';
// @ts-expect-error plain JS module shared with scripts/sound.mjs
import {catalogoTexto, EFECTOS, sonarEfecto} from '../../../kit/biblioteca/sonidos/efectos.mjs';

export type SoundScene = {id: string; start: number; end: number; exit: 'corte' | 'swipe' | 'fundido'; idea: string; words: Word[]; direction: Direction};

const MOODS = ['tension', 'asombro', 'calma', 'cierre'] as const;
const AMBIENCES = ['ninguno', 'agua', 'viento', 'maquina', 'ciudad', 'electrico'] as const;
const OWN_EFFECTS = ['ninguno', 'pop', 'golpe', 'burbujas', 'chorro', 'zumbido', 'chispa', 'click', 'subida', 'bajada'];
const EFFECTS = [...new Set([...OWN_EFFECTS, ...Object.keys(EFECTOS)])] as [string, ...string[]];

const soundSchema = z.object({
	escenas: z.array(z.object({id: z.string(), animo: z.enum(MOODS), ambiente: z.enum(AMBIENCES), efectos: z.array(z.enum(EFFECTS))})),
});
export type SoundDesign = z.infer<typeof soundSchema>;

const SYSTEM = `Eres diseñador de sonido de videos explicativos verticales. La voz manda: la música y los efectos la acompañan sin taparla.
Por escena eliges:
- animo de la música: tension (problema, peligro, algo falla), asombro (descubrimiento, idea nueva), calma (explicación serena), cierre (solución, remate final).
- ambiente de fondo: ninguno, agua, viento, maquina, ciudad o electrico, según lo que se ve. Usa ninguno si nada suena en esa imagen.
- efectos: uno por momento, en el mismo orden. Catálogo:
  pop (algo aparece o se marca), golpe (algo cae, choca o se cierra fuerte), burbujas (aire en agua), chorro (agua que corre, sale o salpica),
  zumbido (un motor arranca), chispa (electricidad, algo se quema), click (interruptor, válvula, pieza que encaja),
  subida (algo sube o crece), bajada (algo baja, se vacía o se apaga), ninguno.
  Biblioteca compartida, para sonidos más específicos:
${catalogoTexto()}
El ánimo cambia pocas veces: la música sigue el arco del video, no cada frase. No pongas efecto en cada momento: deja ninguno cuando el cambio es sutil.
Responde solo JSON.`;

const describe = (scenes: SoundScene[]) =>
	scenes
		.map((s) => [`${s.id} (${(s.end - s.start).toFixed(1)} s): ${s.words.map((w) => w.word).join(' ')}`, `  imagen: ${s.direction.metafora}`, ...s.direction.momentos.map((m, i) => `  momento ${i + 1}, en "${m.palabra}": ${m.ocurre}`)].join('\n'))
		.join('\n');

export const designSound = (profile: string, scenes: SoundScene[]) =>
	askJson(targetFor(profile, 'sonido'), soundSchema, SYSTEM, describe(scenes), {
		temperature: 0.3,
		maxTokens: 2500,
		check: (value) => {
			const {escenas} = value as SoundDesign;
			if (escenas.length !== scenes.length || escenas.some((e, i) => e.id !== scenes[i].id)) return [`devuelve las ${scenes.length} escenas en orden: ${scenes.map((s) => s.id).join(', ')}`];
			return escenas.flatMap((e, i) => (e.efectos.length === scenes[i].direction.momentos.length ? [] : [`${e.id} tiene ${scenes[i].direction.momentos.length} momentos y necesita ese número de efectos`]));
		},
	});

const SR = 48000;
const tau = Math.PI * 2;
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

// Root, fifth and two colour notes per mood, in Hz.
const CHORDS: Record<(typeof MOODS)[number], number[]> = {
	tension: [55, 110, 130.81, 164.81],
	asombro: [73.42, 146.83, 220, 277.18],
	calma: [65.41, 130.81, 196, 246.94],
	cierre: [65.41, 130.81, 196, 329.63],
};
const AMBIENCE_SHAPE: Record<(typeof AMBIENCES)[number], {lp: number; gain: number; wobble: number; hum: number}> = {
	ninguno: {lp: 0.05, gain: 0, wobble: 1, hum: 0},
	agua: {lp: 0.09, gain: 0.08, wobble: 0.8, hum: 0},
	viento: {lp: 0.04, gain: 0.07, wobble: 0.35, hum: 0},
	maquina: {lp: 0.02, gain: 0.05, wobble: 3, hum: 0.02},
	ciudad: {lp: 0.03, gain: 0.04, wobble: 0.2, hum: 0},
	electrico: {lp: 0.2, gain: 0.015, wobble: 8, hum: 0.012},
};

const wav = (L: Float32Array, R: Float32Array) => {
	const n = L.length;
	const buffer = Buffer.alloc(44 + n * 4);
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + n * 4, 4);
	buffer.write('WAVEfmt ', 8);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(2, 22);
	buffer.writeUInt32LE(SR, 24);
	buffer.writeUInt32LE(SR * 4, 28);
	buffer.writeUInt16LE(4, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36);
	buffer.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		buffer.writeInt16LE(Math.round(Math.tanh(L[i] * 0.9) * 32000), 44 + i * 4);
		buffer.writeInt16LE(Math.round(Math.tanh(R[i] * 0.9) * 32000), 46 + i * 4);
	}
	return buffer;
};

// Music bed, ambience, passages and effects in one stereo file as long as the film. pad and whoosh are the synthesized
// music and passages; they stay off when library tracks and recorded samples take their place.
export const synthesize = (design: SoundDesign, scenes: SoundScene[], duration: number, file: string, seed = 1957, {pad = true, whoosh: conWhoosh = true} = {}) => {
	const n = Math.ceil(duration * SR);
	const L = new Float32Array(n);
	const R = new Float32Array(n);
	const rnd = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296 - 0.5;
	};
	const sceneAt = (t: number) => Math.max(0, scenes.findIndex((s, i) => t < s.end || i === scenes.length - 1));
	// Comes in already playing (a slow swell wastes the hook) and fades out with the film.
	const fade = (t: number) => Math.min(clamp01(t / 0.25), clamp01((duration - t) / 2.2));

	// Pad: two detuned voices per note, gliding to the next chord.
	if (pad) {
		let current = [...CHORDS[design.escenas[0].animo]];
		const phases = new Float64Array(8);
		for (let i = 0; i < n; i++) {
			const t = i / SR;
			const target = CHORDS[design.escenas[sceneAt(t)].animo];
			current = current.map((f, k) => f + (target[k] - f) * 0.00002);
			let l = 0;
			let r = 0;
			current.forEach((f, k) => {
				phases[k] += (tau * f) / SR;
				phases[k + 4] += (tau * f * 1.0035) / SR;
				const lfo = 0.72 + 0.28 * Math.sin(t * (0.5 + k * 0.17) + k);
				const weight = k === 0 ? 0.5 : 0.17;
				l += (Math.sin(phases[k]) + 0.4 * Math.sin(phases[k] * 2)) * lfo * weight;
				r += (Math.sin(phases[k + 4]) + 0.4 * Math.sin(phases[k + 4] * 2)) * lfo * weight;
			});
			L[i] += l * 0.1 * fade(t);
			R[i] += r * 0.1 * fade(t);
		}
	}

	// Ambience: filtered noise per scene, crossfading at scene changes.
	{
		let low = 0;
		let level = 0;
		let hum = 0;
		let phase = 0;
		for (let i = 0; i < n; i++) {
			const t = i / SR;
			const shape = AMBIENCE_SHAPE[design.escenas[sceneAt(t)].ambiente];
			level += (shape.gain - level) * 0.00004;
			hum += (shape.hum - hum) * 0.00004;
			low += (rnd() - low) * shape.lp;
			phase += (tau * 100) / SR;
			const v = low * level * 3.2 * (0.7 + 0.3 * Math.sin(t * shape.wobble * tau)) + hum * (Math.sin(phase) + 0.5 * Math.sin(phase * 3));
			L[i] += v;
			R[i] += v * 0.92;
		}
	}

	const add = (at: number, length: number, fn: (t: number, u: number) => number, gain: number, pan = 0) => {
		const a = Math.round(at * SR);
		const len = Math.round(length * SR);
		for (let i = 0; i < len && a + i < n; i++) {
			if (a + i < 0) continue;
			const v = fn(i / SR, i / len) * gain;
			L[a + i] += v * (1 - Math.max(0, pan));
			R[a + i] += v * (1 + Math.min(0, pan));
		}
	};
	const sweep = (from: number, to: number) => {
		let phase = 0;
		return (t: number, u: number) => {
			phase += (tau * (from + (to - from) * u * u)) / SR;
			return Math.sin(phase) * Math.sin(Math.PI * u);
		};
	};
	const noise = (lp: number) => {
		let low = 0;
		return () => (low += (rnd() * 2 - low) * lp);
	};

	const EFFECT: Record<string, (at: number) => void> = {
		pop: (at) => add(at, 0.1, (t, u) => Math.sin(tau * 880 * t) * (1 - u) ** 2, 0.12),
		golpe: (at) => {
			const dust = noise(0.16);
			add(at, 0.9, (t, u) => (Math.sin(tau * 52 * t) * Math.exp(-t * 6) * 0.9 + dust() * Math.exp(-t * 7) * 0.5) * (1 - u), 0.5);
		},
		burbujas: (at) => {
			for (let k = 0; k < 9; k++) {
				const f = 500 + (rnd() + 0.5) * 900;
				add(at + k * 0.08 + (rnd() + 0.5) * 0.05, 0.06, (t, u) => Math.sin(tau * f * (1 + u * 0.6) * t) * Math.sin(Math.PI * u), 0.07, rnd());
			}
		},
		chorro: (at) => {
			const hiss = noise(0.25);
			add(at, 1.3, (_, u) => hiss() * Math.sin(Math.PI * Math.min(1, u * 2.5)) * (1 - u) ** 0.6, 0.16);
		},
		zumbido: (at) => {
			let phase = 0;
			add(at, 1.6, (_, u) => {
				phase += (tau * (60 + 60 * clamp01(u * 2))) / SR;
				return (Math.sin(phase) + 0.4 * Math.sin(phase * 2) + 0.2 * Math.sin(phase * 3)) * clamp01(u * 5) * (1 - u) ** 0.5;
			}, 0.12);
		},
		chispa: (at) => {
			for (let k = 0; k < 6; k++) {
				const crack = noise(0.9);
				add(at + k * 0.05 + (rnd() + 0.5) * 0.04, 0.025, (_, u) => crack() * (1 - u), 0.18, rnd() * 0.6);
			}
		},
		click: (at) => add(at, 0.03, (t, u) => Math.sin(tau * 2200 * t) * (1 - u), 0.12),
		subida: (at) => add(at, 0.6, sweep(300, 900), 0.07),
		bajada: (at) => add(at, 0.6, sweep(900, 260), 0.07),
	};

	// Whoosh into the next scene on a swipe or a fade; a cut stays dry.
	const whoosh = (end: number, length: number, gain: number) => {
		let low = 0;
		let band = 0;
		add(end - length, length + 0.3, (t) => {
			const u = clamp01(t / length);
			const f = 0.02 + u * u * 0.16;
			low += f * band;
			band += f * (rnd() * 2 - low - band * 0.5);
			return band * Math.sin(Math.PI * u ** 1.8) * (t > length ? Math.exp(-(t - length) * 14) : 1);
		}, gain);
	};

	scenes.forEach((s, i) => {
		if (conWhoosh && i < scenes.length - 1 && s.exit !== 'corte') whoosh(s.end, s.exit === 'swipe' ? 0.5 : 0.8, 0.35);
		s.direction.momentos.forEach((m, k) => {
			const effect = design.escenas[i].efectos[k];
			if (!effect || effect === 'ninguno') return;
			let at: number;
			try {
				at = wordTime(s.words, m.palabra);
			} catch {
				return;
			}
			if (EFFECT[effect]) EFFECT[effect](at + 0.05);
			else sonarEfecto(effect, at + 0.05, add);
		});
	});

	writeFileSync(file, wav(L, R));
};

// Voice over the bed: the bed ducks under the voice, then the whole mix is normalized for phones.
export const mixSound = (video: string, bed: string, output: string) =>
	execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', video, '-i', bed, '-filter_complex',
		'[1:a]volume=0.75[bed];[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[key][voz];[bed][key]sidechaincompress=threshold=0.05:ratio=4:attack=15:release=320[duck];[duck][voz]amix=inputs=2:duration=first:weights=1 1:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=8[a]',
		'-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output]);

// The mood a scene asks for, as a mood of the music library.
const ANIMO: Record<(typeof MOODS)[number], Animo> = {tension: 'tension', asombro: 'curiosidad', calma: 'curiosidad', cierre: 'esperanza'};
// mixSound lowers the whole bed hard while the voice sounds, so library music goes in louder than its level for flows
// that lower it gently.
const BAJO_LA_VOZ = 1.6;

// The bed of a film (fondo.wav): ambience and effects synthesized, a recorded sound on each passage and music by the
// mood of each scene. Which track plays where stays in musica.json.
export const makeBed = ({design, scenes, duration, dir, log}: {design: SoundDesign; scenes: SoundScene[]; duration: number; dir: string; log: (...x: unknown[]) => void}) => {
	const {nivel} = medios().musica;
	const modo = modoMusica(medios().musica.modo);
	const base = `${dir}/fondo_base.wav`;
	synthesize(design, scenes, duration, base, [...dir].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 1957), {pad: modo === 'sintetizada', whoosh: false});
	// A swipe sounds as it crosses; a fade gets only a low breath.
	const toques: Toque[] = scenes.flatMap((s, i) => (i === scenes.length - 1 || s.exit === 'corte' ? [] : [s.exit === 'swipe' ? {t: s.end - 0.1, muestra: 'barrido', gain: 0.7} : {t: s.end - 0.1, muestra: 'barrido_grave', gain: 0.3}]));
	let fondo: string | null = null;
	if (modo === 'pistas') {
		const plan = planDeAnimos({trozos: scenes.map((s, i) => ({momento: design.escenas[i].animo, animo: ANIMO[design.escenas[i].animo], desde: s.start, hasta: s.end})), look: 'noche', nombre: dir, duracion: duration, nivel: Math.min(1.5, nivel * BAJO_LA_VOZ)});
		writeFileSync(`${dir}/musica.json`, JSON.stringify(plan, null, 1));
		fondo = `${dir}/musica.wav`;
		mezclarMusica({plan, duracion: duration, voz: null, salida: fondo});
		const cat = pistas();
		plan.tramos.forEach((t) => log(`música ${t.desde.toFixed(1)}–${t.hasta.toFixed(1)} s (${t.animo}): "${cat[t.pista].titulo}" de ${cat[t.pista].autor}, ${cat[t.pista].licencia}`));
	}
	const bed = `${dir}/fondo.wav`;
	mezclarMuestras(base, toques, bed, fondo);
	return bed;
};

// The whole stage: design once per run (kept in sonido.json), then synthesize and mix. Returns the design so the report can show it.
export const addSound = async ({profile, dir, scenes, duration, video, output, redo, log}: {profile: string; dir: string; scenes: SoundScene[]; duration: number; video: string; output: string; redo: boolean; log: (...x: unknown[]) => void}) => {
	const file = `${dir}/sonido.json`;
	const kept = !redo && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as SoundDesign) : null;
	const fits = kept && kept.escenas.length === scenes.length && kept.escenas.every((e, i) => e.efectos.length === scenes[i].direction.momentos.length);
	const design = fits ? kept : await designSound(profile, scenes);
	writeFileSync(file, JSON.stringify(design, null, 1));
	const bed = makeBed({design, scenes, duration, dir, log});
	mixSound(video, bed, output);
	log(`sonido: ${design.escenas.map((e) => e.animo).filter((m, i, all) => m !== all[i - 1]).join(' → ')}, ${design.escenas.flatMap((e) => e.efectos).filter((e) => e !== 'ninguno').length} efectos`);
	return design;
};
