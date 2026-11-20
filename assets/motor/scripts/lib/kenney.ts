// Kenney model packs (CC0). Only packs in config/kenney.json are fetched, each pinned by size and hash; a model only ever names one of their files.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {descomprimir} from './sistema';

export type Pack = {url: string; bytes: number; sha256: string; folder: string; format: 'glb' | 'obj'; about: string; models: string[]};
export type Catalog = {credit: string; packs: Record<string, Pack>};
// A model the film uses: file is relative to public/, so the render can load it with staticFile.
export type PropModel = {id: string; label: string; model: string; file: string; format: Pack['format']};

const CACHE = 'out/kenney';
const PUBLIC = 'public/kenney';

export const kenneyCatalog = (): Catalog => JSON.parse(readFileSync('config/kenney.json', 'utf8'));

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const fetchPack = async (id: string, pack: Pack) => {
	const zip = `${CACHE}/${path.basename(pack.url)}`;
	if (existsSync(zip) && statSync(zip).size === pack.bytes && sha256(readFileSync(zip)) === pack.sha256) return zip;
	console.log(`  descargando paquete ${id} (${(pack.bytes / 1e6).toFixed(1)} MB)`);
	const res = await fetch(pack.url, {redirect: 'follow'});
	if (!res.ok) throw new Error(`${id}: ${res.status} al descargar ${pack.url}`);
	const data = Buffer.from(await res.arrayBuffer());
	if (data.length !== pack.bytes || sha256(data) !== pack.sha256) throw new Error(`${id}: el paquete descargado no coincide con su huella registrada`);
	mkdirSync(CACHE, {recursive: true});
	writeFileSync(zip, data);
	return zip;
};

// Leaves the pack's models under public/kenney/<id>/, keeping its Textures folder beside them.
export const ensurePack = async (id: string) => {
	const pack = kenneyCatalog().packs[id];
	if (!pack) throw new Error(`paquete desconocido: ${id}`);
	const target = `${PUBLIC}/${id}`;
	if (pack.models.every((m) => existsSync(`${target}/${m}.${pack.format}`))) return;
	const zip = await fetchPack(id, pack);
	const scratch = `${CACHE}/${id}`;
	rmSync(scratch, {recursive: true, force: true});
	// Only the registered folder is extracted, and only model, material and texture files.
	const patterns = pack.format === 'glb' ? [`${pack.folder}*.glb`, `${pack.folder}Textures/*.png`] : [`${pack.folder}*.obj`, `${pack.folder}*.mtl`];
	descomprimir(zip, patterns, scratch);
	mkdirSync(target, {recursive: true});
	cpSync(path.join(scratch, pack.folder), target, {recursive: true});
	rmSync(scratch, {recursive: true, force: true});
};

// "pack/model" from the catalog to a file the render can load.
export const resolveModel = (ref: string) => {
	const [id, name] = ref.split('/');
	const pack = kenneyCatalog().packs[id];
	if (!pack || !pack.models.includes(name)) return null;
	return {pack: id, file: `kenney/${id}/${name}.${pack.format}`, format: pack.format};
};
