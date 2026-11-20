// The shared 3D model catalog (kit/modelos), from the command line.
// usage:
//   pnpm modelos                                   lists every model: name, what it shows, its moving parts
//   pnpm modelos buscar <palabra...>               only the models whose name or description has all the words
//   pnpm modelos usar <corrida> <nombre...>        adds them to runs/<corrida>/modelos.json for pnpm estudio
//   pnpm modelos guardar <corrida> <nombre> [--como <nuevo>] [--en "…"] [--reemplazar]
//                                                  copies a model of a run into the catalog, to reuse it later
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {archivoKit, catalogoKit, describir, KIT_MODELOS, partesDe, type EntradaModelo, type ModeloKit} from './lib/modelos';

const args = process.argv.slice(2);
const opcion = (n: string) => {
	const i = args.indexOf(`--${n}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const libres = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--reemplazar'].includes(args[i - 1])));
const [orden, ...resto] = libres;
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const leer = <T>(f: string, vacio: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : vacio);

const mostrar = (lista: [string, ModeloKit][]) => {
	if (!lista.length) return console.log('ningún modelo coincide');
	for (const [n, m] of lista) console.log(`${n}\n  ${describir(m)}${m.partes?.length ? `\n  partes: ${m.partes.join(', ')}` : ''}`);
	console.log(`\n${lista.length} modelos. Úsalos en un video: pnpm modelos usar <corrida> <nombre...>, o pnpm estudio <corrida> --modelos a,b`);
};

const catalogo = catalogoKit();

if (!orden) mostrar(Object.entries(catalogo));
else if (orden === 'buscar') {
	const palabras = resto.map(sinAcentos);
	mostrar(Object.entries(catalogo).filter(([n, m]) => palabras.every((p) => sinAcentos(`${n} ${m.en}`).includes(p))));
} else if (orden === 'usar') {
	const [corrida, ...nombres] = resto;
	if (!corrida || !nombres.length) throw new Error('uso: pnpm modelos usar <corrida> <nombre...>');
	const faltan = nombres.filter((n) => !catalogo[n]);
	if (faltan.length) throw new Error(`no están en el catálogo: ${faltan.join(', ')} (pnpm modelos buscar <palabra>)`);
	const destino = `runs/${corrida}/modelos.json`;
	mkdirSync(path.dirname(destino), {recursive: true});
	const propios = leer<Record<string, EntradaModelo>>(destino, {});
	for (const n of nombres) propios[n] = {kit: n};
	writeFileSync(destino, JSON.stringify(propios, null, 1));
	console.log(`${destino}: ${Object.keys(propios).length} modelos (${nombres.join(', ')} del catálogo)`);
} else if (orden === 'guardar') {
	const [corrida, nombre] = resto;
	if (!corrida || !nombre) throw new Error('uso: pnpm modelos guardar <corrida> <nombre> [--como <nuevo>] [--en "…"]');
	// A run lists its models in runs/<corrida>/modelos.json; models built by code may only have their builder's list.
	const listas = [`runs/${corrida}/modelos.json`, `runs/${corrida}/modelos_src/modelos.json`];
	const entrada = listas.map((f) => leer<Record<string, EntradaModelo>>(f, {})[nombre]).find((e) => e?.archivo);
	if (!entrada?.archivo || !existsSync(entrada.archivo)) throw new Error(`la corrida ${corrida} no tiene un .glb propio llamado ${nombre}`);
	const id = opcion('como') ?? nombre;
	if (!/^[a-z0-9_]+$/.test(id)) throw new Error(`nombre "${id}": usa minúsculas, números y _`);
	if (catalogo[id] && !args.includes('--reemplazar')) throw new Error(`ya hay un modelo "${id}" en el catálogo: usa --como <otro> o --reemplazar`);
	// The builder's anchors file, next to the .glb, keeps the model's measures.
	const anclas = leer<Record<string, {medidas?: number[]}>>(path.join(path.dirname(entrada.archivo), 'anclas.json'), {});
	mkdirSync(KIT_MODELOS, {recursive: true});
	copyFileSync(entrada.archivo, archivoKit(id));
	const medidas = anclas[nombre]?.medidas;
	const partes = partesDe(archivoKit(id));
	catalogo[id] = {en: opcion('en') ?? entrada.en ?? id, ...(medidas ? {medidas} : {}), ...(partes.length ? {partes} : {})};
	const ordenado = Object.fromEntries(Object.entries(catalogo).sort(([a], [b]) => a.localeCompare(b)));
	writeFileSync(`${KIT_MODELOS}/catalogo.json`, JSON.stringify(ordenado, null, 1));
	console.log(`${id} guardado en ${KIT_MODELOS}${partes.length ? ` (partes: ${partes.join(', ')})` : ''}`);
} else throw new Error(`orden desconocida "${orden}": usa buscar, usar o guardar`);
