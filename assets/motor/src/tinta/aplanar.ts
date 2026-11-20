import * as THREE from 'three';

// Turns a photo-like texture (what TRELLIS bakes) into a few flat pastel patches, the way an illustrator would colour it.
// Blur first so vents, grain and tiny text melt; cluster colours with k-means; lift darks and calm saturation;
// then a majority pass removes the specks left at patch borders. Deterministic, so every render frame agrees.

export type Aplanado = {
	colores?: number; // flat colours per model
	lado?: number; // working size in pixels; textures are scaled down to this
	desenfoque?: number; // blur radius in pixels before clustering
	piso?: number; // darkest allowed lightness (0..1): stops dark plastic from reading as a black hole
	techo?: number; // lightest allowed lightness
	saturacion?: number; // highest allowed saturation
	fusion?: number; // colours closer than this (RGB distance) become one: baked shading splits a white body in two otherwise
};

const hsl = (c: RGB) => {
	const o = {h: 0, s: 0, l: 0};
	new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).getHSL(o);
	return o;
};

// Same paint: close in RGB, or two near-greys of similar lightness (a white body and its baked shadow).
// Toon shading puts the shadow back, so the texture should hold one colour per material.
// A light near-grey and a darker near-grey: the same paint, lit and in its baked shadow.
const pinturaYSombra = (a: RGB, b: RGB) => {
	const x = hsl(a), y = hsl(b);
	return x.s < 0.2 && y.s < 0.2 && Math.abs(x.l - y.l) < 0.45 && Math.min(x.l, y.l) > 0.3;
};
const mismaPintura = (a: RGB, b: RGB, umbral: number) => dist(a, b) < umbral * umbral || pinturaYSombra(a, b);

// Joins clusters that are the same paint, nearest first, weighting by how many pixels each holds.
const fusionar = (c: RGB[], peso: number[], umbral: number) => {
	const out = c.map((x, i) => ({c: x, w: peso[i]}));
	for (;;) {
		let par: [number, number] | null = null;
		for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) if (mismaPintura(out[i].c, out[j].c, umbral) && (!par || dist(out[i].c, out[j].c) < dist(out[par[0]].c, out[par[1]].c))) par = [i, j];
		if (!par) return out.map((x) => x.c);
		const [a, b] = par;
		const w = out[a].w + out[b].w || 1;
		// A paint and its baked shadow: keep the lit one, toon shading adds the shadow back. Merely close colours blend by
		// pixel count; keeping the lighter there let a small brown patch take over a black box.
		const sombra = pinturaYSombra(out[a].c, out[b].c);
		const c = sombra ? (hsl(out[a].c).l >= hsl(out[b].c).l ? out[a].c : out[b].c) : ([0, 1, 2].map((k) => (out[a].c[k] * out[a].w + out[b].c[k] * out[b].w) / w) as RGB);
		out[a] = {c, w};
		out.splice(b, 1);
	}
};

const BASE: Required<Aplanado> = {colores: 4, lado: 512, desenfoque: 3, piso: 0.24, techo: 0.93, saturacion: 0.5, fusion: 80};

type RGB = [number, number, number];

const dist = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

const kmeans = (px: Uint8ClampedArray, k: number): {centros: RGB[]; peso: number[]} => {
	// Sample on a fixed stride, skipping transparent atlas gutters.
	const n = px.length / 4;
	const step = Math.max(1, Math.floor(n / 30000));
	const pts: RGB[] = [];
	for (let i = 0; i < n; i += step) if (px[i * 4 + 3] > 128) pts.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
	if (!pts.length) return {centros: [[200, 200, 200] as RGB], peso: [1]};
	// Seeds at luminance quantiles: stable, and they spread from shadow to highlight.
	const lum = (p: RGB) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
	const sorted = [...pts].sort((a, b) => lum(a) - lum(b));
	let c: RGB[] = Array.from({length: k}, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * (sorted.length - 1))]] as RGB);
	for (let it = 0; it < 12; it++) {
		const sum = c.map(() => [0, 0, 0, 0]);
		for (const p of pts) {
			let best = 0;
			for (let j = 1; j < k; j++) if (dist(p, c[j]) < dist(p, c[best])) best = j;
			const s = sum[best];
			s[0] += p[0];
			s[1] += p[1];
			s[2] += p[2];
			s[3]++;
		}
		c = c.map((old, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : old));
		if (it === 11) return {centros: c, peso: sum.map((s) => s[3])};
	}
	return {centros: c, peso: c.map(() => 1)};
};

// Keeps the hue, calms the saturation and squeezes lightness into a paper-friendly band.
const pastel = (c: RGB, o: Required<Aplanado>): RGB => {
	const col = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);
	const hsl = {h: 0, s: 0, l: 0};
	col.getHSL(hsl);
	const l = o.piso + hsl.l * (o.techo - o.piso);
	// Keep the colour's chroma, not its HSL saturation: near black, a faint tint reads as high saturation, and lifting
	// the lightness while keeping it turned black plastic brown.
	const croma = hsl.s * (1 - Math.abs(2 * hsl.l - 1));
	const s = Math.min(o.saturacion, croma / Math.max(1e-3, 1 - Math.abs(2 * l - 1)));
	// Neutral dark plastic goes slate (cool blue-grey), as in the reference: under the warm paper light a true grey reads brown.
	if (s < 0.06 && hsl.l < 0.45) col.setHSL(0.6, 0.12, l);
	else col.setHSL(hsl.h, s, l);
	return [col.r * 255, col.g * 255, col.b * 255];
};

export const aplanarImagen = (fuente: CanvasImageSource & {width: number; height: number}, opciones: Aplanado = {}) => {
	const o = {...BASE, ...opciones};
	const escala = Math.min(1, o.lado / Math.max(fuente.width, fuente.height));
	const w = Math.max(1, Math.round(fuente.width * escala));
	const h = Math.max(1, Math.round(fuente.height * escala));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
	ctx.filter = `blur(${o.desenfoque}px)`;
	ctx.drawImage(fuente, 0, 0, w, h);
	ctx.filter = 'none';
	const data = ctx.getImageData(0, 0, w, h);
	const px = data.data;
	const k = kmeans(px, o.colores);
	const centros = fusionar(k.centros, k.peso, o.fusion);
	const salida = centros.map((c) => pastel(c, o));

	const etiqueta = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const p: RGB = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
		let best = 0;
		for (let j = 1; j < centros.length; j++) if (dist(p, centros[j]) < dist(p, centros[best])) best = j;
		etiqueta[i] = best;
	}
	// Majority of the 5×5 neighbourhood, twice: slits and specks a few pixels wide join the patch around them.
	let limpia = etiqueta;
	const votos = new Uint16Array(centros.length);
	for (let pasada = 0; pasada < 2; pasada++) {
		const antes = limpia;
		limpia = new Uint8Array(antes);
		for (let y = 2; y < h - 2; y++)
			for (let x = 2; x < w - 2; x++) {
				votos.fill(0);
				for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) votos[antes[(y + dy) * w + x + dx]]++;
				let best = antes[y * w + x];
				for (let j = 0; j < centros.length; j++) if (votos[j] > votos[best]) best = j;
				limpia[y * w + x] = best;
			}
	}
	for (let i = 0; i < w * h; i++) {
		const c = salida[limpia[i]];
		px[i * 4] = c[0];
		px[i * 4 + 1] = c[1];
		px[i * 4 + 2] = c[2];
		px[i * 4 + 3] = 255;
	}
	ctx.putImageData(data, 0, 0);
	return {canvas, colores: salida.map((c) => `#${new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).getHexString()}`)};
};

// Same texture, flattened, ready to drop into a material in place of the original.
export const aplanarTextura = (tex: THREE.Texture, opciones: Aplanado = {}) => {
	const {canvas} = aplanarImagen(tex.image as HTMLImageElement, opciones);
	const t = new THREE.CanvasTexture(canvas);
	t.flipY = tex.flipY;
	t.wrapS = tex.wrapS;
	t.wrapT = tex.wrapT;
	t.colorSpace = THREE.SRGBColorSpace;
	t.channel = tex.channel;
	t.needsUpdate = true;
	return t;
};
