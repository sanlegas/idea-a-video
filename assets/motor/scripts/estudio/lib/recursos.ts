// External files the kit needs. Only entries of config/recursos.json are ever fetched: nothing a model writes becomes a URL.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';

// about offers a resource to the art director, who can only name it; entries without about stay out of the catalog.
export type Resource = {url: string; file: string; bytes: number; sha256?: string; credit: string; about?: string; aspect?: number; derived?: {file: string; ffmpeg: string[]}};

const FILE = 'config/recursos.json';
const registry = (): Record<string, Resource> => JSON.parse(readFileSync(FILE, 'utf8'));
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

const healthy = (r: Resource) => existsSync(r.file) && statSync(r.file).size === r.bytes && (!r.sha256 || sha256(r.file) === r.sha256);

const download = async (id: string, r: Resource) => {
	console.log(`  descargando ${id}: ${path.basename(r.file)} (${(r.bytes / 1e6).toFixed(2)} MB)`);
	const res = await fetch(r.url, {redirect: 'follow'});
	if (!res.ok) throw new Error(`${id}: ${res.status} al descargar ${r.url}`);
	const data = Buffer.from(await res.arrayBuffer());
	if (data.length !== r.bytes) throw new Error(`${id}: se esperaban ${r.bytes} bytes y llegaron ${data.length}`);
	const hash = createHash('sha256').update(data).digest('hex');
	if (r.sha256 && hash !== r.sha256) throw new Error(`${id}: la huella no coincide con la registrada`);
	mkdirSync(path.dirname(r.file), {recursive: true});
	writeFileSync(r.file, data);
	return hash;
};

// Leaves every requested resource on disk, intact. A file that fails its check is fetched again.
export const ensureResources = async (ids: string[]) => {
	const all = registry();
	const report: {id: string; file: string; state: string; credit: string; aspect: number}[] = [];
	for (const id of [...new Set(ids)]) {
		const r = all[id];
		if (!r) throw new Error(`recurso desconocido: ${id}`);
		let state = 'listo';
		if (!healthy(r)) {
			const hash = await download(id, r);
			// The first download pins the file, so later runs can tell if it changed.
			if (!r.sha256) {
				r.sha256 = hash;
				writeFileSync(FILE, JSON.stringify(all, null, 2) + '\n');
			}
			state = 'descargado';
		}
		if (r.derived && !existsSync(r.derived.file)) {
			execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', r.file, ...r.derived.ffmpeg, r.derived.file]);
			state = 'preparado';
		}
		report.push({id, file: r.derived?.file ?? r.file, state, credit: r.credit, aspect: r.aspect ?? 1});
	}
	return report;
};

export const allResourceIds = () => Object.keys(registry());

export const offeredResources = () => Object.entries(registry()).flatMap(([id, r]) => (r.about ? [{id, about: r.about}] : []));

if (process.argv[1]?.endsWith('recursos.ts')) ensureResources(allResourceIds()).then((r) => console.log(r.map((x) => `${x.id}: ${x.state}`).join('\n')));
