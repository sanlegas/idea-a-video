// Pictures from three kinds of place, tried in the order the run asks for: free stock photos, a cloud image model,
// or this machine's own image model. Whatever the source, each picture ends as a PNG cropped to the size asked,
// and its origin is written down so stock photos can be credited.
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {clave, CLAVES, claveDe} from './claves';
import {clearLocal, spend} from './llm';
import {correr, liberar, local as maquina, sinLocal} from './local';
import {medios, nubeImagen, type ProveedorImagen} from './medios';

type Log = (...x: unknown[]) => void;

// prompt: full description for a generator. busca: a few keywords for a photo search.
export type Pedido = {id: string; archivo: string; prompt: string; busca: string; ancho: number; alto: number; clase: 'escena' | 'recorte' | 'cita' | 'ambiente'};
export type Credito = {archivo: string; proveedor: string; fuente?: string; autor?: string; licencia?: string; url?: string};

// Sites that ask automated clients to say what they are. Nothing about the user or the project travels in it.
const AGENTE = 'guion-video/0.1 (video tool; stock photo search)';
const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const destino = (p: Pedido) => `public/${p.archivo}`;
const hecho = (p: Pedido) => existsSync(destino(p));

// Any image file in, a PNG of the exact size out: scaled to cover and cropped at the centre.
const normalizar = (origen: string, p: Pedido) => {
	mkdirSync(path.dirname(destino(p)), {recursive: true});
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', origen, '-vf', `scale=${p.ancho}:${p.alto}:force_original_aspect_ratio=increase,crop=${p.ancho}:${p.alto}`, '-frames:v', '1', destino(p)]);
};

const bajar = async (url: string, archivo: string) => {
	const res = await fetch(url, {headers: {'user-agent': AGENTE}, signal: AbortSignal.timeout(60000)});
	if (!res.ok) throw new Error(`${res.status} al bajar ${url}`);
	writeFileSync(archivo, Buffer.from(await res.arrayBuffer()));
};

const json = async (url: string, headers: Record<string, string> = {}, intentos = 1): Promise<unknown> => {
	for (let i = 0; ; i++) {
		const res = await fetch(url, {headers: {'user-agent': AGENTE, ...headers}, signal: AbortSignal.timeout(15000)}).catch(() => null);
		if (res?.ok) return res.json();
		if (i + 1 >= intentos) throw new Error(`${res?.status ?? 'sin respuesta'} en ${new URL(url).host}`);
		await pausa(1500);
	}
};

// ---------------------------------------------------------------- stock

type Foto = {url: string; ancho: number; alto: number; autor?: string; licencia?: string; pagina?: string};
const sinEtiquetas = (s?: string) => (s ?? '').replace(/<[^>]+>/g, '').trim();

const FUENTES: Record<string, (p: Pedido) => Promise<Foto[]>> = {
	// Pexels: free to use, credit asked when possible. Needs a free key.
	pexels: async (p) => {
		const key = clave('pexels');
		if (!key) throw new Error(`sin clave (${CLAVES.pexels} en .env)`);
		const forma = p.alto > p.ancho ? 'portrait' : 'square';
		const d = (await json(`https://api.pexels.com/v1/search?query=${encodeURIComponent(p.busca)}&orientation=${forma}&per_page=15`, {authorization: key})) as {photos: {width: number; height: number; url: string; photographer: string; src: {large2x: string}}[]};
		return d.photos.map((f) => ({url: f.src.large2x, ancho: f.width, alto: f.height, autor: f.photographer, licencia: 'Pexels License', pagina: f.url}));
	},
	// Wikimedia Commons: no key. Licences vary and most ask for credit, so each one is kept. Photographs only (JPEG of a
	// minimum size): its text search also returns scans, diagrams and icons.
	commons: async (p) => {
		// Its search wants every word to match, so long queries find nothing or noise: measured, "slot machine" finds slot
		// machines and "slot machine isolated" finds none. The full keywords go first, then only the first two.
		const palabras = p.busca.replace(/\bisolated\b/g, '').trim().split(/\s+/);
		for (const busca of [...new Set([palabras.join(' '), palabras.slice(0, 2).join(' ')])]) {
			const q = new URLSearchParams({action: 'query', format: 'json', generator: 'search', gsrsearch: `filemime:image/jpeg fileres:>${medios().imagen.stock.ancho_minimo} ${busca}`, gsrnamespace: '6', gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600', iiextmetadatafilter: 'LicenseShortName|Artist'});
			const d = (await json(`https://commons.wikimedia.org/w/api.php?${q}`, {}, 2)) as {query?: {pages: Record<string, {index: number; imageinfo: {url: string; thumburl?: string; width: number; height: number; mime: string; descriptionurl: string; extmetadata?: {LicenseShortName?: {value: string}; Artist?: {value: string}}}[]}>}};
			const fotos = Object.values(d.query?.pages ?? {})
				.sort((a, b) => a.index - b.index)
				.map((x) => x.imageinfo[0])
				.filter((i) => /jpeg/.test(i.mime))
				.map((i) => ({url: i.thumburl ?? i.url, ancho: i.width, alto: i.height, autor: sinEtiquetas(i.extmetadata?.Artist?.value), licencia: i.extmetadata?.LicenseShortName?.value, pagina: i.descriptionurl}));
			if (fotos.length) return fotos;
		}
		return [];
	},
	// Openverse: no key, public-domain filter by default. Measured 2026-11-11: most searches end in a 504 after a long
	// wait, so it goes last and gets a single short try.
	openverse: async (p) => {
		const q = new URLSearchParams({q: p.busca, license: medios().imagen.stock.licencias_openverse, page_size: '20'});
		const d = (await json(`https://api.openverse.org/v1/images/?${q}`)) as {results: {url: string; width: number; height: number; creator?: string; license: string; foreign_landing_url: string}[]};
		return d.results.map((f) => ({url: f.url, ancho: f.width, alto: f.height, autor: f.creator, licencia: f.license.toUpperCase(), pagina: f.foreign_landing_url}));
	},
};

const stock = async (pedidos: Pedido[], tmp: string, log: Log): Promise<Credito[]> => {
	const c = medios().imagen.stock;
	const usadas = new Set<string>();
	const creditos: Credito[] = [];
	const caidas = new Set<string>();
	for (const p of pedidos) {
		for (const fuente of c.fuentes) {
			if (caidas.has(fuente) || hecho(p)) continue;
			let fotos: Foto[];
			try {
				fotos = await FUENTES[fuente](p);
			} catch (e) {
				// A source without its key is skipped for the whole run; a search that failed is skipped for this picture only.
				if (/sin clave/.test(String(e))) {
					caidas.add(fuente);
					log(`stock: ${fuente} ${String(e).replace('Error: ', '')}`);
				}
				continue;
			}
			// Big enough, not used yet, and the right shape first: a tall frame crops a wide photo to a sliver.
			const alta = p.alto > p.ancho;
			const buenas = fotos.filter((f) => f.ancho >= c.ancho_minimo && !usadas.has(f.url)).sort((a, b) => Number(alta ? b.alto > b.ancho : false) - Number(alta ? a.alto > a.ancho : false));
			for (const f of buenas.slice(0, 3)) {
				try {
					const archivo = `${tmp}/${p.id}.bin`;
					await bajar(f.url, archivo);
					normalizar(archivo, p);
					usadas.add(f.url);
					creditos.push({archivo: p.archivo, proveedor: 'stock', fuente, autor: f.autor, licencia: f.licencia, url: f.pagina});
					break;
				} catch {
					continue;
				}
			}
			await pausa(250);
		}
		if (!hecho(p)) log(`stock: nada para "${p.busca}"`);
	}
	return creditos;
};

// ---------------------------------------------------------------- cloud model

// fal bills by the megapixel, rounded up: the picture is asked in the frame's shape at no more than one megapixel,
// in steps of 16 pixels, and scaled to its size afterwards.
export const tamanoFal = (p: {ancho: number; alto: number}) => {
	const forma = p.ancho / p.alto;
	const width = Math.floor(Math.sqrt(1e6 * forma) / 16) * 16;
	return {width, height: Math.floor(width / forma / 16) * 16};
};

// One picture from fal into `archivo`: FLUX schnell by default, or another of its text-to-image models (they take a
// prompt and an image_size). It comes back in the same answer (sync_mode), so fal keeps no copy in its request
// history. False when its safety filter refused to draw it.
const fal = async (p: Pedido, modelo: string, key: string, archivo: string, log: Log) => {
	const res = await fetch(`https://fal.run/${modelo}`, {
		method: 'POST',
		headers: {authorization: `Key ${key}`, 'content-type': 'application/json'},
		body: JSON.stringify({prompt: p.prompt, image_size: tamanoFal(p), num_images: 1, output_format: 'png', sync_mode: true}),
		signal: AbortSignal.timeout(180000),
	});
	if (!res.ok) throw new Error(`fal respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const d = (await res.json()) as {images?: {url?: string}[]; has_nsfw_concepts?: boolean[]};
	// A picture its safety filter flags comes back black: it is left for the next provider.
	if (d.has_nsfw_concepts?.[0]) {
		log(`nube: fal no dibujó "${p.prompt.slice(0, 60)}…" (su filtro la marcó)`);
		return false;
	}
	const url = d.images?.[0]?.url;
	if (!url) throw new Error(`fal no devolvió imagen para ${p.id}`);
	if (url.startsWith('data:')) {
		const coma = url.indexOf(',');
		const datos = url.slice(coma + 1);
		writeFileSync(archivo, url.slice(0, coma).endsWith(';base64') ? Buffer.from(datos, 'base64') : Buffer.from(decodeURIComponent(datos), 'binary'));
	} else await bajar(url, archivo);
	return true;
};

const nube = async (pedidos: Pedido[], tmp: string, log: Log): Promise<Credito[]> => {
	const {modelo, dolares} = nubeImagen();
	const key = claveDe('fal', 'Generar imágenes en la nube');
	const creditos: Credito[] = [];
	for (const p of pedidos) {
		const archivo = `${tmp}/${p.id}.bin`;
		if (!(await fal(p, modelo, key, archivo, log))) continue;
		normalizar(archivo, p);
		creditos.push({archivo: p.archivo, proveedor: 'nube', fuente: `fal:${modelo}`});
	}
	// fal does not say what a picture cost: the estimate counts with the LLM spend, so the step's row in the report shows it.
	const gasto = creditos.length * dolares;
	spend.dollars += gasto;
	log(`nube: ${creditos.length} imágenes con ${modelo} en fal${gasto ? `, ~$${gasto.toFixed(3)} estimado` : ''}`);
	return creditos;
};

// ---------------------------------------------------------------- this machine's own model

// The name the machine gives its model: it goes into the origin of the pictures, so another model never reuses them.
export const modeloLocal = () => maquina().imagen?.modelo ?? 'propio';

// Through the command of config/local.json, which leaves one <id>.png per request in a folder.
const local = async (pedidos: Pedido[], tmp: string, log: Log): Promise<Credito[]> => {
	const c = maquina().imagen;
	if (!c) throw sinLocal('Generar imágenes', 'Usa --imagenes nube (pide FAL_KEY) o --imagenes stock.');
	clearLocal();
	const lista = `${tmp}/pedidos.json`;
	const carpeta = path.resolve(`${tmp}/propias`);
	mkdirSync(carpeta, {recursive: true});
	writeFileSync(lista, JSON.stringify(pedidos.map((p) => ({id: p.id, prompt: p.prompt, wide: p.ancho, tall: p.alto, seed: 7}))));
	correr(c.comando, [lista, carpeta, ...(c.modelo ? [c.modelo] : [])], {stdio: 'ignore'});
	liberar();
	const creditos: Credito[] = [];
	pedidos.forEach((p) => {
		const hecha = `${carpeta}/${p.id}.png`;
		if (!existsSync(hecha)) return;
		mkdirSync(path.dirname(destino(p)), {recursive: true});
		copyFileSync(hecha, destino(p));
		creditos.push({archivo: p.archivo, proveedor: 'local', fuente: modeloLocal()});
	});
	log(`local: ${creditos.length} imágenes con ${modeloLocal()}`);
	return creditos;
};

// ---------------------------------------------------------------- entry

// What makes two runs share pictures: same providers in the same order, and the same models behind them.
export const origenDe = (proveedores: ProveedorImagen[]) =>
	proveedores.map((p) => (p === 'local' ? `local:${modeloLocal()}` : p === 'nube' ? `nube:${nubeImagen().modelo}` : p === 'stock' ? `stock:${medios().imagen.stock.fuentes.join('+')}` : p)).join('>');

// Makes every missing picture, provider by provider. A provider that cannot work here (no key, no local model) is reported
// and the next one takes what is left. Returns the credits of everything made so far, old runs included.
export const conseguirImagenes = async ({pedidos, proveedores, nombre, dir, log}: {pedidos: Pedido[]; proveedores: ProveedorImagen[]; nombre: string; dir: string; log: Log}) => {
	// The ledger of every picture this run folder ever got: a picture reused later still needs its credit.
	const archivoCreditos = `${dir}/creditos_todas.json`;
	// Runs from before the ledger kept it in creditos.json.
	const anterior = [archivoCreditos, `${dir}/creditos.json`].find((f) => existsSync(f));
	const creditos: Credito[] = anterior ? JSON.parse(readFileSync(anterior, 'utf8')) : [];
	const tmp = `${dir}/tmp_img`;
	mkdirSync(tmp, {recursive: true});
	const unicos = [...new Map(pedidos.map((p) => [p.id, p])).values()];
	for (const proveedor of proveedores) {
		const faltan = unicos.filter((p) => !hecho(p));
		if (!faltan.length || proveedor === 'placas') break;
		try {
			const nuevos = proveedor === 'stock' ? await stock(faltan, tmp, log) : proveedor === 'nube' ? await nube(faltan, tmp, log) : await local(faltan, tmp, log);
			creditos.push(...nuevos);
			if (proveedor === 'stock') log(`stock: ${nuevos.length} de ${faltan.length} fotos`);
		} catch (e) {
			log(`${proveedor}: no disponible (${String(e).replace('Error: ', '').slice(0, 200)})`);
		}
		writeFileSync(archivoCreditos, JSON.stringify(creditos, null, 1));
	}
	rmSync(tmp, {recursive: true, force: true});
	const faltan = unicos.filter((p) => !hecho(p));
	return {creditos, faltan};
};
