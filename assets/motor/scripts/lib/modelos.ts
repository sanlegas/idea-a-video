// Shared 3D model catalog (kit/modelos): toy models made by code that any estudio run can reuse by name, so a cup,
// a chair or an office worker built once is not built again. Each model is kit/modelos/<nombre>.glb, and
// kit/modelos/catalogo.json says what it shows, how big it is and which parts a scene can move.
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

export const KIT_MODELOS = 'kit/modelos';
const CATALOGO = `${KIT_MODELOS}/catalogo.json`;

export type ModeloKit = {
	// What it shows, with the names of its moving parts in parentheses, as a scene writer reads it.
	en: string;
	// Width, height and depth in the model's own units (kit.model scales the height to what a scene asks).
	medidas?: number[];
	// Named nodes a scene can reach with getObjectByName (doors, arms, needles...).
	partes?: string[];
};

export const catalogoKit = (): Record<string, ModeloKit> => (existsSync(CATALOGO) ? JSON.parse(readFileSync(CATALOGO, 'utf8')) : {});
export const archivoKit = (nombre: string) => `${KIT_MODELOS}/${nombre}.glb`;

// The text a scene writer gets for a model: what it is plus its proportions, so it can pick a sensible height.
export const describir = (m: ModeloKit) => (m.medidas ? `${m.en} (proporción ancho × alto × fondo: ${m.medidas.map((v) => +v.toFixed(2)).join(' × ')})` : m.en);

// A run's model entry: a .glb of its own ({archivo, en}) or one from the shared catalog ({kit: "nombre"} or just {}).
export type EntradaModelo = {archivo?: string; en?: string; kit?: string};
export const resolverModelo = (nombre: string, e: EntradaModelo = {}): {archivo: string; en: string} => {
	if (e.archivo) {
		// A model built by code (pnpm blender) leaves its measures in anclas.json beside it: the scene writer gets its
		// proportions as it does for the catalog's.
		const anclas = path.join(path.dirname(e.archivo), 'anclas.json');
		const medidas = existsSync(anclas) ? (JSON.parse(readFileSync(anclas, 'utf8')) as Record<string, {medidas?: number[]}>)[nombre]?.medidas : undefined;
		return {archivo: e.archivo, en: describir({en: e.en ?? nombre, medidas})};
	}
	const id = e.kit ?? nombre;
	const m = catalogoKit()[id];
	if (!m) throw new Error(`no hay modelo "${id}" en ${KIT_MODELOS}: búscalo con pnpm modelos buscar <palabra>`);
	return {archivo: archivoKit(id), en: e.en ?? describir(m)};
};

// Names a Blender export gives on its own (Cube.003, Sphere...): not parts anyone named on purpose.
const AUTOMATICO = /^(cube|sphere|cylinder|torus|cone|plane|circle|icosphere|bezier|curve|text|mesh|object|empty|scene|root)(\.\d+)?$/i;
// Named nodes of a .glb: the parts its builder named so scenes can move them.
export const partesDe = (archivo: string): string[] => {
	const b = readFileSync(archivo);
	if (b.toString('ascii', 0, 4) !== 'glTF') return [];
	const largo = b.readUInt32LE(12);
	const gltf = JSON.parse(b.toString('utf8', 20, 20 + largo)) as {nodes?: {name?: string}[]};
	const nombres = (gltf.nodes ?? []).map((n) => n.name ?? '').filter((n) => n && !AUTOMATICO.test(n) && /^[a-z0-9_áéíóúñ]+$/.test(n));
	return [...new Set(nombres)];
};
