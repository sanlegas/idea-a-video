// New 3D models built by code in Blender, for the estudio flow: the assistant writes a short Python script with the
// pieces of scripts/blender/juguete.py, and this command runs it in Blender with no window. No picture generator and
// no service: the model comes out of the script alone.
// usage:
//   pnpm blender                                     where Blender is on this machine, or how to install it
//   pnpm blender <corrida> --nuevo                   starts runs/<corrida>/modelos.py from scripts/blender/ejemplo.py
//   pnpm blender <corrida> [script.py] [nombre...]   builds the models of the script (by default runs/<corrida>/modelos.py)
//                                                    into runs/<corrida>/modelos_src and lists them in runs/<corrida>/modelos.json
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {buscarBlender, BLENDER_MINIMO, construirModelos, instalarBlender} from './lib/blender';
import {describir, type EntradaModelo} from './lib/modelos';

const args = process.argv.slice(2);
const libres = args.filter((a) => !a.startsWith('--'));
const [corrida, ...resto] = libres;
const leer = <T>(f: string, vacio: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : vacio);

const blender = buscarBlender();
const minimo = BLENDER_MINIMO.join('.');

if (!corrida) {
	if (!blender) {
		console.log(`Blender: no está en esta máquina. Instálalo (${minimo} o más nuevo): ${instalarBlender()}`);
		process.exit(1);
	}
	console.log(`Blender ${blender.version}: ${blender.ruta}${blender.vieja ? ` (versión vieja: las piezas de scripts/blender/juguete.py piden ${minimo} o más nueva)` : ''}`);
	console.log('Modelos nuevos para una corrida: pnpm blender <corrida> --nuevo, edita runs/<corrida>/modelos.py, y pnpm blender <corrida>');
	process.exit(0);
}

if (!/^[\w-]+$/.test(corrida)) throw new Error(`corrida "${corrida}": usa letras, números, _ y -`);
const dir = `runs/${corrida}`;
const script = resto[0]?.endsWith('.py') ? resto[0] : `${dir}/modelos.py`;
const nombres = resto.filter((r) => !r.endsWith('.py'));

if (args.includes('--nuevo')) {
	if (existsSync(script)) throw new Error(`${script} ya existe: edítalo, o bórralo para empezar de nuevo`);
	mkdirSync(dir, {recursive: true});
	copyFileSync('scripts/blender/ejemplo.py', script);
	console.log(`${script}: plantilla con dos modelos de ejemplo (lampara, regalo). Cámbialos por los del video y corre pnpm blender ${corrida}`);
	process.exit(0);
}

if (!blender) throw new Error(`Blender no está en esta máquina: ${instalarBlender()}`);
if (blender.vieja) console.log(`AVISO: Blender ${blender.version} es más viejo que ${minimo}; si algo falla, actualízalo`);
if (!existsSync(script)) throw new Error(`no existe ${script}: empieza con pnpm blender ${corrida} --nuevo`);

const salida = `${dir}/modelos_src`;
const r = construirModelos(blender, script, salida, nombres);
if (r.salida) console.log(r.salida);
if (!r.ok) {
	console.error(`\nBlender no terminó: corrige ${script} y repite`);
	process.exit(1);
}

// The run's list: what the script built now enters runs/<corrida>/modelos.json beside catalog models already there.
const hechos = leer<Record<string, {archivo: string; en: string}>>(`${salida}/modelos.json`, {});
const anclas = leer<Record<string, {medidas?: number[]; partes?: string[]}>>(`${salida}/anclas.json`, {});
const lista = leer<Record<string, EntradaModelo>>(`${dir}/modelos.json`, {});
for (const [n, m] of Object.entries(hechos)) lista[n] = {archivo: m.archivo, en: m.en};
writeFileSync(`${dir}/modelos.json`, JSON.stringify(lista, null, 1));

const hoy = nombres.length ? nombres : Object.keys(hechos);
console.log(`\n${dir}/modelos.json: ${Object.keys(lista).length} modelos`);
for (const n of hoy) {
	const a = anclas[n] ?? {};
	console.log(`- ${n}: ${describir({en: hechos[n]?.en ?? n, medidas: a.medidas})}${a.partes?.length ? `\n  partes: ${a.partes.join(', ')}` : ''}\n  mira ${salida}/${n}.png y ${salida}/${n}_frente.png antes de usarlo`);
}
console.log(`\nÚsalos en el video con pnpm estudio ${corrida} (lee ${dir}/modelos.json). Uno que sirva para otros videos: pnpm modelos guardar ${corrida} <nombre>`);
