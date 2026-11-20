// Pictures a scene asks for, from this machine's own model or from a cloud one. The same description always gives the
// same file, so a protagonist looks alike in every scene.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {conseguirImagenes, modeloLocal, origenDe, type Pedido} from '../../lib/imagenes';
import {correr, local} from '../../lib/local';
import {medios, resolverImagenes} from '../../lib/medios';

const STORE = 'out/estudio/imagenes';
const OBJECT = ', stylized glossy 3D render, soft studio rim light, centered, whole object visible, nothing else, no text, isolated on a pure black background';
const SCENERY = ', cinematic 3D render, dark and moody, deep shadows, low key lighting, no text, no people in the foreground';

export type ImageRequest = {name: string; describe: string; cut: boolean};
export type ImageAsset = {file: string; aspect: number; modelo?: boolean};

// An object without its background. With a cut-out command on this machine (config/local.json, recorte) the object
// is trimmed to its own outline; without one, the black it was drawn on turns transparent, which leaves dark objects
// with holes and keeps the square frame.
const recortar = (trabajos: {from: string; to: string}[]) => {
	const c = local().recorte;
	if (c) {
		const lista = `${STORE}/recortes.json`;
		writeFileSync(lista, JSON.stringify(trabajos));
		return (correr(c.comando, [lista], {encoding: 'utf8', maxBuffer: 1 << 24}) as unknown as string).trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as {to: string; aspect: number});
	}
	return trabajos.map((t) => {
		execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', t.from, '-vf', 'colorkey=0x000000:0.10:0.06,format=rgba', '-frames:v', '1', t.to]);
		return {to: t.to, aspect: 1};
	});
};

// What can draw a scene's objects here: a picture model on this machine (local) or in the cloud (nube). Free photos
// do not count: scenes ask for specific objects. None means local mode (models and 2D drawings only).
export const proveedoresDibujo = () => resolverImagenes(medios().imagen.proveedores).proveedor.filter((p) => p === 'local' || p === 'nube');

export const ensureImages = async (requests: ImageRequest[], run: string, log: (...x: unknown[]) => void) => {
	mkdirSync(STORE, {recursive: true});
	const target = `public/run/${run}/assets`;
	mkdirSync(target, {recursive: true});
	// Only providers that draw what is asked: a stock photo cannot be the object a scene describes.
	const proveedores = proveedoresDibujo();
	// A picture keeps its name while its model does: one machine model alone names it as before, anything else by origin.
	const marca = proveedores.length === 1 && proveedores[0] === 'local' ? modeloLocal() : origenDe(proveedores);
	const rows = requests.map((r) => {
		const prompt = r.describe + (r.cut ? OBJECT : SCENERY);
		const id = createHash('sha1').update(marca === 'flux_klein' ? prompt : `${marca}|${prompt}`).digest('hex').slice(0, 14);
		return {...r, prompt, id, png: `${STORE}/${id}.png`, meta: `${STORE}/${id}.json`};
	});
	// A meta file left empty by a crash counts as missing, and its picture is made again.
	const readable = (file: string) => {
		try {
			return Boolean(JSON.parse(readFileSync(file, 'utf8')));
		} catch {
			return false;
		}
	};
	const missing = rows.filter((r) => !existsSync(r.meta) || !existsSync(r.png) || !readable(r.meta));
	if (missing.length) {
		if (!proveedores.length) throw new Error('las escenas piden imágenes y no hay con qué dibujarlas: pon FAL_KEY en .env o configura un comando de imagen en config/local.json');
		log(`generando ${missing.length} imágenes con ${proveedores.join(' > ')}`);
		// Raw pictures land beside the store; the shared library writes under public/, so their path goes up from there.
		const crudo = (id: string) => `${STORE}/crudo/${id}.png`;
		const pedidos: Pedido[] = missing.map((r) => ({id: r.id, archivo: path.relative('public', crudo(r.id)), prompt: r.prompt, busca: '', ancho: r.cut ? 1024 : 864, alto: r.cut ? 1024 : 1536, clase: r.cut ? 'recorte' : 'escena'}));
		const {faltan} = await conseguirImagenes({pedidos, proveedores, nombre: run, dir: STORE, log});
		if (faltan.length) throw new Error(`no salieron ${faltan.length} imágenes: ${faltan.map((p) => p.prompt.slice(0, 50)).join(' | ')}`);
		const cut = recortar(missing.filter((r) => r.cut).map((r) => ({from: path.resolve(crudo(r.id)), to: path.resolve(r.png)})));
		missing.forEach((r) => {
			const done = cut.find((c) => c.to === path.resolve(r.png));
			if (!r.cut) copyFileSync(crudo(r.id), r.png);
			writeFileSync(r.meta, JSON.stringify({aspect: done?.aspect ?? 864 / 1536}));
		});
	}
	return Object.fromEntries(
		rows.map((r) => {
			copyFileSync(r.png, `${target}/${r.id}.png`);
			const {aspect} = JSON.parse(readFileSync(r.meta, 'utf8')) as {aspect: number};
			return [r.name, {file: `run/${run}/assets/${r.id}.png`, aspect}];
		}),
	) as Record<string, ImageAsset>;
};
