// Builds muestras/campanita.wav: a bright two-note chime for a caption or a figure coming in, synthesized by code so it
// carries no third-party licence.
// Two bell tones a fourth apart (G6 and C7) with their upper partials; each partial rings and fades on its own, the
// highest one longest, which is what makes it sparkle. Levels and decays were measured on a reference chime.
// Run: node kit/biblioteca/sonidos/campanita.mjs   (same seed, same file)
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 48000;
const DUR = 1.3;
const GOLPE = 0.004; // seconds; muestras.json "ancla" must match
const n = Math.round(SR * DUR);

// Seeded generator, so the file is reproducible.
let seed = 0x2545f491;
const rnd = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
	return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

// [Hz, level in dB against the loudest, seconds to fall 20 dB]
const PARCIALES = [
	[1571.9, -3.9, 0.53], // G6
	[2104.9, -6.3, 0.42], // C7
	[3143.8, -11.8, 0.54], // G6 x2
	[4193.6, -3.7, 0.58], // C7 x2
	[4715.8, -10.9, 0.62], // G6 x3
	[5232.6, -14.1, 0.2],
	[5491.0, -13.9, 0.39],
	[6287.7, 0.0, 0.97], // G6 x4, the ring that stays
];

// A partial: quick strike, then an exponential fade. Each channel is detuned a hair the other way for width.
const canal = (lado) => {
	const out = new Float64Array(n);
	for (const [hz, db, t20] of PARCIALES) {
		const a = Math.pow(10, db / 20);
		const tau = t20 / Math.log(10); // -20 dB at t20
		const f = hz * (1 + lado * 0.00035);
		const fase = rnd() * Math.PI * 2;
		for (let i = 0; i < n; i++) {
			const t = i / SR;
			const ataque = Math.min(1, t / GOLPE);
			out[i] += a * ataque * Math.exp(-Math.max(0, t - GOLPE) / tau) * Math.sin(2 * Math.PI * f * t + fase);
		}
	}
	// The mallet: a few milliseconds of bright noise on the strike.
	let prev = 0;
	for (let i = 0; i < Math.round(SR * 0.012); i++) {
		const x = rnd() * 2 - 1;
		const alto = x - prev;
		prev = x;
		out[i] += alto * 0.08 * Math.exp(-(i / SR) / 0.003);
	}
	// Soft tail so the file ends in silence.
	for (let i = 0; i < n; i++) out[i] *= Math.min(1, (n - 1 - i) / (SR * 0.08));
	return out;
};

const L = canal(-1);
const R = canal(1);
let pico = 0;
for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
const escala = Math.pow(10, -3 / 20) / pico;

// 16-bit with TPDF dither.
const datos = Buffer.alloc(n * 4);
const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * escala * 32767 + (rnd() - rnd()))));
for (let i = 0; i < n; i++) {
	datos.writeInt16LE(q(L[i]), i * 4);
	datos.writeInt16LE(q(R[i]), i * 4 + 2);
}
const cab = Buffer.alloc(44);
cab.write('RIFF', 0);
cab.writeUInt32LE(36 + datos.length, 4);
cab.write('WAVEfmt ', 8);
cab.writeUInt32LE(16, 16);
cab.writeUInt16LE(1, 20);
cab.writeUInt16LE(2, 22);
cab.writeUInt32LE(SR, 24);
cab.writeUInt32LE(SR * 4, 28);
cab.writeUInt16LE(4, 32);
cab.writeUInt16LE(16, 34);
cab.write('data', 36);
cab.writeUInt32LE(datos.length, 40);
const salida = join(dirname(fileURLToPath(import.meta.url)), 'muestras', 'campanita.wav');
writeFileSync(salida, Buffer.concat([cab, datos]));
console.log(`${salida}: ${DUR} s, golpe en ${GOLPE} s`);
