// Builds muestras/barrido.wav: a clean, airy whoosh for cuts, synthesized by code so it carries no third-party licence.
// Filtered noise whose band sweeps up to the cut and back down, with a smooth envelope and a left-to-right pan.
// Run: node kit/biblioteca/sonidos/barrido.mjs   (same seed, same file)
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 48000;
const DUR = 0.62;
const PICO = 0.26; // seconds; muestras.json "ancla" must match
const n = Math.round(SR * DUR);

// Seeded generator, so the file is reproducible.
let seed = 0x9e3779b9;
const rnd = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
	return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
// Gaussian-ish noise: smoother spectrum than plain uniform noise.
const ruido = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.87;

// Topology-preserving state-variable filter: stays clean while its cutoff moves every sample.
const svf = () => {
	let ic1 = 0;
	let ic2 = 0;
	return (x, fc, q) => {
		const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR);
		const k = 1 / q;
		const a1 = 1 / (1 + g * (g + k));
		const v1 = a1 * ic1 + g * a1 * (x - ic2);
		const v2 = ic2 + g * v1;
		ic1 = 2 * v1 - ic1;
		ic2 = 2 * v2 - ic2;
		return {bp: v1, lp: v2, hp: x - k * v1 - v2};
	};
};

const smooth = (u) => u * u * (3 - 2 * u);
const logLerp = (a, b, u) => a * Math.pow(b / a, u);
// Band centre: rises to the cut, then falls back.
const centro = (t) => (t < PICO ? logLerp(380, 2600, smooth(t / PICO)) : logLerp(2600, 650, smooth(Math.min(1, (t - PICO) / (DUR - PICO)))));
const envolvente = (t) => {
	const sube = t < PICO ? Math.pow(smooth(t / PICO), 1.6) : Math.exp(-(t - PICO) / 0.085);
	const cola = Math.min(1, (DUR - t) / 0.04);
	return sube * Math.max(0, cola);
};

const f1 = svf();
const f2 = svf();
const cuerpo = svf();
const aire = svf();
const mono = new Float64Array(n);
for (let i = 0; i < n; i++) {
	const t = i / SR;
	const x = ruido();
	const fc = centro(t);
	const banda = f2(f1(x, fc, 0.9).bp, fc, 0.9).bp;
	const grave = cuerpo(x, fc * 0.45, 0.7).lp;
	const brillo = aire(x, 6500, 0.7).hp;
	const e = envolvente(t);
	mono[i] = (banda * 1.0 + grave * 0.3) * e + brillo * 0.05 * Math.pow(e, 1.5);
}

// Remove DC, then normalise the peak to -3 dBFS.
let media = 0;
for (const v of mono) media += v / n;
let pico = 0;
for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs((mono[i] -= media)));
const escala = Math.pow(10, -3 / 20) / pico;

// Constant-power pan from a little left to a little right, 16-bit with TPDF dither.
const datos = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) {
	const p = -0.45 + 0.9 * smooth(i / (n - 1));
	const ang = ((p + 1) * Math.PI) / 4;
	const v = mono[i] * escala;
	const canal = (g) => Math.max(-32768, Math.min(32767, Math.round(v * g * 32767 + (rnd() - rnd()))));
	datos.writeInt16LE(canal(Math.cos(ang) * Math.SQRT2 * 0.92), i * 4);
	datos.writeInt16LE(canal(Math.sin(ang) * Math.SQRT2 * 0.92), i * 4 + 2);
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
const salida = join(dirname(fileURLToPath(import.meta.url)), 'muestras', 'barrido.wav');
writeFileSync(salida, Buffer.concat([cab, datos]));
console.log(`${salida}: ${DUR} s, pico en ${PICO} s`);
