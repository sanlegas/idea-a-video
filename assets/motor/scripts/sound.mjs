// Music bed and effects synthesized from the storyboard, so the mix needs no sample library.
import {readFileSync, writeFileSync} from 'node:fs';
import {momentoDe, sonarEfecto} from '../kit/biblioteca/sonidos/efectos.mjs';

const SR = 48000;
const run = process.argv[2];
// --sin-pad and --sin-whoosh leave out the synthesized music and passages, when library tracks and recorded samples take their place.
const sinPad = process.argv.includes('--sin-pad');
const sinWhoosh = process.argv.includes('--sin-whoosh');
const read = (f) => JSON.parse(readFileSync(`${run}/${f}`, 'utf8'));
const sb = read('storyboard.json');
const timing = read('timing.json');
const design = read('sound.json');
const moodOf = (i) => design.beats.find((b) => b.beat === i)?.mood ?? 'calm';
const ambienceOf = (i) => design.beats.find((b) => b.beat === i)?.ambience ?? 'none';
const beatAt = (t) => {
	const i = sb.beats.findIndex((_, k) => t >= timing.beats[k].start && t < timing.beats[k].end);
	return i < 0 ? sb.beats.length - 1 : i;
};
const n = Math.ceil(timing.duration * SR);
const L = new Float32Array(n);
const R = new Float32Array(n);

let seed = 1957;
const rnd = () => {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 4294967296 - 0.5;
};
const clamp01 = (u) => Math.min(1, Math.max(0, u));
const tau = Math.PI * 2;

const quakeAt = (t) => {
	let q = 0;
	sb.beats.forEach((b, i) => {
		const {start, end} = timing.beats[i];
		q = Math.max(q, b.quake * Math.min(clamp01((t - start) / 1.6), clamp01((end + 0.8 - t) / 1.2)));
	});
	return q;
};

// Pad: chord follows the grade, so the night is minor and the dawn resolves.
const CHORDS = {tension: [55, 110, 130.81, 164.81], calm: [65.41, 130.81, 196, 246.94], wonder: [73.42, 146.83, 220, 277.18], resolve: [65.41, 130.81, 196, 329.63]};
const chordAt = (t) => CHORDS[moodOf(beatAt(t))];
// Comes in already playing (a slow swell wastes the hook) and fades out with the film.
const fade = (t) => Math.min(clamp01(t / 0.25), clamp01((timing.duration - t) / 2.2));
let current = [...chordAt(0)];
const phases = [0, 0, 0, 0, 0, 0, 0, 0];
for (let i = 0; i < n && !sinPad; i++) {
	const t = i / SR;
	const target = chordAt(t);
	let l = 0;
	let r = 0;
	current = current.map((f, k) => f + (target[k] - f) * 0.00002);
	current.forEach((f, k) => {
		phases[k] += (tau * f) / SR;
		phases[k + 4] += (tau * f * 1.0035) / SR;
		const lfo = 0.72 + 0.28 * Math.sin(t * (0.5 + k * 0.17) + k);
		const v = (Math.sin(phases[k]) + 0.4 * Math.sin(phases[k] * 2)) * lfo * (k === 0 ? 0.5 : 0.17);
		const w = (Math.sin(phases[k + 4]) + 0.4 * Math.sin(phases[k + 4] * 2)) * lfo * (k === 0 ? 0.5 : 0.17);
		l += v;
		r += w;
	});
	L[i] += l * 0.11 * fade(t);
	R[i] += r * 0.11 * fade(t);
}

// Rumble: brown noise pushed through two low-pass stages, moved by the same envelope as the picture.
let b1 = 0;
let b2 = 0;
let b3 = 0;
for (let i = 0; i < n; i++) {
	const t = i / SR;
	b1 = b1 * 0.996 + rnd() * 0.05;
	b2 += (b1 - b2) * 0.012;
	b3 += (b2 - b3) * 0.012;
	const v = Math.tanh(b3 * 26) * Math.pow(quakeAt(t), 1.3) * (0.8 + 0.2 * Math.sin(t * 13));
	L[i] += v * 0.62;
	R[i] += v * 0.6;
}

// Ambience: filtered noise chosen per beat, fading across beat changes.
{
	const SHAPE = {city: {lp: 0.03, gain: 0.05, wob: 0.2}, water: {lp: 0.09, gain: 0.09, wob: 0.8}, wind: {lp: 0.05, gain: 0.08, wob: 0.5}, machine: {lp: 0.02, gain: 0.08, wob: 3}};
	let low = 0;
	let level = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const shape = SHAPE[ambienceOf(beatAt(t))];
		const target = shape ? shape.gain : 0;
		level += (target - level) * 0.00004;
		low += (rnd() - low) * (shape?.lp ?? 0.05);
		const v = low * level * 3.2 * (0.7 + 0.3 * Math.sin(t * (shape?.wob ?? 1) * 6.28));
		L[i] += v;
		R[i] += v * 0.92;
	}
}

const add = (at, dur, fn, gain = 1, pan = 0) => {
	const a = Math.round(at * SR);
	const len = Math.round(dur * SR);
	for (let i = 0; i < len && a + i < n; i++) {
		if (a + i < 0) continue;
		const v = fn(i / SR, i / len) * gain;
		L[a + i] += v * (1 - Math.max(0, pan));
		R[a + i] += v * (1 + Math.min(0, pan));
	}
};

// Falling buildings: a low thump with debris on top.
const collapse = sb.beats.findIndex((b) => b.collapse);
if (collapse >= 0) {
	for (let k = 0; k < 14; k++) {
		const at = timing.beats[collapse].start + 0.3 + k * 0.2 + (rnd() + 0.5) * 0.3;
		const f = 46 + (rnd() + 0.5) * 26;
		let lp = 0;
		add(
			at,
			1.5,
			(t, u) => {
				lp += (rnd() * 2 - lp) * 0.16;
				return (Math.sin(tau * f * t) * Math.exp(-t * 5) * 0.9 + lp * Math.exp(-t * 3.2) * 0.8) * (1 - u);
			},
			0.5,
			rnd() * 0.7,
		);
	}
}

// Whoosh: noise through a band that sweeps with the move.
const whoosh = (end, dur, gain = 0.5) => {
	let low = 0;
	let band = 0;
	add(
		end - dur,
		dur + 0.3,
		(t) => {
			const u = clamp01(t / dur);
			const f = 0.02 + u * u * 0.16;
			low += f * band;
			band += f * (rnd() * 2 - low - band * 0.5);
			return band * Math.sin(Math.PI * Math.pow(u, 1.8)) * (t > dur ? Math.exp(-(t - dur) * 14) : 1);
		},
		gain,
	);
};
sb.beats.forEach((b, i) => {
	if (sinWhoosh) return;
	const next = sb.beats[i + 1];
	const {end} = timing.beats[i];
	if (b.shot === 'dive') whoosh(end, 1.3, 0.75);
	else if (next) whoosh(end, 0.7, 0.5);
});

// Chip pops and the counter ticking.
sb.beats.forEach((b, i) => {
	const {start} = timing.beats[i];
	if (b.chip) add(start + 0.12, 0.09, (t, u) => Math.sin(tau * 880 * t) * (1 - u) * (1 - u), 0.09);
	// A model card rises in: a short upward chirp.
	if (b.prop && !sb.beats.slice(0, i).some((x) => x.prop === b.prop)) add(start + 0.15, 0.14, (t, u) => Math.sin(tau * 620 * (1 + u * 0.6) * t) * (1 - u) ** 2, 0.08);
	if (b.counter) {
		const ticks = Math.min(b.counter.to, 40);
		for (let k = 0; k < ticks; k++) {
			const u = k / ticks;
			add(start + 0.25 + 2.4 * (1 - Math.pow(1 - u, 2)), 0.03, (t, p) => Math.sin(tau * 1500 * t) * (1 - p), 0.05);
		}
	}
});

const writeWav = (file, left, right) => {
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
		buffer.writeInt16LE(Math.round(Math.tanh(left[i] * 0.9) * 32000), 44 + i * 4);
		buffer.writeInt16LE(Math.round(Math.tanh(right[i] * 0.9) * 32000), 46 + i * 4);
	}
	writeFileSync(`${run}/${file}`, buffer);
};
writeWav('bed.wav', L, R);

// Chosen effects go on their own track, so the voice does not push them down with the music.
const fxL = new Float32Array(n);
const fxR = new Float32Array(n);
const addFx = (at, dur, fn, gain = 1, pan = 0) => {
	const a = Math.round(at * SR);
	const len = Math.round(dur * SR);
	for (let i = 0; i < len && a + i < n; i++) {
		if (a + i < 0) continue;
		const v = fn(i / SR, i / len, dur) * gain;
		fxL[a + i] += v * (1 - Math.max(0, pan));
		fxR[a + i] += v * (1 + Math.min(0, pan));
	}
};
const chosen = design.efectos ?? [];
chosen.forEach((e) => {
	const {start, end} = timing.beats[e.beat];
	sonarEfecto(e.efecto, momentoDe(sb.beats[e.beat].text, e.palabra, start, end, timing.words) + (e.offset ?? 0), addFx, {dur: e.dur, gain: e.gain, pan: e.pan});
});
writeWav('efectos.wav', fxL, fxR);
console.log('bed', timing.duration.toFixed(2), 's,', chosen.length, 'efectos');
