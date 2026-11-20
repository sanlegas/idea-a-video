// Guion to ink-style film, step by step. Voice comes from what this machine and its keys allow; new 3D objects need
// an image-to-3D command of this machine, and without one the film uses the catalogue.
// usage: pnpm tinta <nombre> --guion guiones/x.md [--llm deepseek|local|...] [--desde paso] [--hasta paso] [--solo paso] [--plan]
//   --plan   prints every step with who does it and an estimate of time and cost, and runs nothing.
// Finished steps are skipped; --desde reruns from that step on.
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {readGuion} from '../lib/guion';
import {perfilPorDefecto, spend} from '../lib/llm';
import {principal} from '../lib/orquestador';
import {PASOS, type Ctx, type Supuestos} from './pasos';
import {carpetaTemporal} from '../lib/sistema';

const args = process.argv.slice(2);
const flag = (n: string) => {
	const i = args.indexOf(`--${n}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const nombre = args[0];
if (!nombre || nombre.startsWith('--')) throw new Error('Falta el nombre: pnpm tinta <nombre> --guion guiones/x.md');
const dir = `runs/tinta/${nombre}`;
const pub = `public/tinta/${nombre}`;
mkdirSync(dir, {recursive: true});
mkdirSync(pub, {recursive: true});
// A guion that changed since the last run makes the voice and the shots stale: the run starts over from the voice,
// unless it was told where to start.
const guionCambio = Boolean(flag('guion')) && existsSync(`${dir}/guion.md`) && existsSync(`${dir}/palabras.json`) && readFileSync(`${dir}/guion.md`, 'utf8') !== readFileSync(flag('guion')!, 'utf8');
if (flag('guion')) copyFileSync(flag('guion')!, `${dir}/guion.md`);
if (guionCambio && !flag('desde') && !flag('solo') && !args.includes('--plan')) {
	console.log('el guion cambió desde la última corrida: se rehace desde la voz');
	args.push('--desde', 'voz');
}
if (!existsSync(`${dir}/guion.md`)) throw new Error(`Falta el guion: usa --guion la primera vez`);
// Render bundles copy public/; the system temp folder may live in memory, so the project keeps its own.
carpetaTemporal();

const guion = readGuion(readFileSync(`${dir}/guion.md`, 'utf8'));
const log = (...x: unknown[]) => console.log(new Date().toTimeString().slice(0, 8), ...x);
const ctx: Ctx = {nombre, dir, pub, perfil: flag('llm') ?? perfilPorDefecto(), guion, log};

const leer = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);

// Real numbers once earlier steps exist; otherwise a typical explainer: 3.4 words per second (Qwen3-TTS), 8 objects, 5 generated.
const supuestos = (): Supuestos => {
	const w = leer(`${dir}/palabras.json`);
	const r = leer(`${dir}/reparto.json`);
	const p = leer(`${dir}/pelicula.json`);
	const palabras = w?.words.length ?? guion.narration.split(/\s+/).filter(Boolean).length;
	const segundos = w?.duration ?? palabras / 3.4;
	const generados = r ? new Set(r.objetos.filter((o: {fuente: string}) => o.fuente === 'generar').map((o: {prompt_en: string}) => o.prompt_en)).size : 5;
	return {segundos, palabras, objetos: r?.objetos.length ?? 8, generados, tomas: p?.tomas.length ?? Math.round(segundos / 4)};
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const tabla = (filas: {paso: string; quien: string; con: string; t: number; usd: number}[]) => {
	const linea = (c: string[]) => `| ${c.join(' | ')} |`;
	console.log(linea(['Paso', 'Quién', 'Con', 'Tiempo', 'USD']));
	console.log(linea(['---', '---', '---', '---:', '---:']));
	filas.forEach((f) => console.log(linea([f.paso, f.quien, f.con, mmss(f.t), f.usd.toFixed(4)])));
	console.log(linea(['**Total**', '', '', `**${mmss(filas.reduce((a, f) => a + f.t, 0))}**`, `**${filas.reduce((a, f) => a + f.usd, 0).toFixed(4)}**`]));
};

const main = async () => {
	if (args.includes('--plan')) {
		const s = supuestos();
		console.log(`${nombre}: ~${s.segundos.toFixed(0)} s de video, ${s.palabras} palabras, ${s.objetos} objetos (${s.generados} generados), ~${s.tomas} tomas\n`);
		tabla(PASOS.map((p) => ({paso: p.id, quien: p.quien, con: p.con, t: p.estima(s).segundos, usd: p.estima(s).dolares})));
		return;
	}
	const ids = PASOS.map((p) => p.id);
	const desde = flag('desde') ?? flag('solo');
	const hasta = flag('hasta') ?? flag('solo');
	for (const n of [desde, hasta]) if (n && !ids.includes(n)) throw new Error(`paso desconocido: ${n}; pasos: ${ids.join(', ')}`);
	const i0 = desde ? ids.indexOf(desde) : 0;
	const i1 = hasta ? ids.indexOf(hasta) : ids.length - 1;
	const reporte = leer(`${dir}/reporte.json`) ?? {pasos: {}};
	for (const [i, p] of PASOS.entries()) {
		if (i < i0 || i > i1) continue;
		const hecho = p.produce.length && p.produce.every((f) => existsSync(`${dir}/${f}`));
		if (hecho && !desde) {
			log(`${p.id}: ya está`);
			continue;
		}
		log(`${p.id} (${p.quien}): ${p.titulo}`);
		const t0 = Date.now();
		const d0 = spend.dollars;
		await p.run(ctx);
		reporte.pasos[p.id] = {quien: p.quien, segundos: Math.round((Date.now() - t0) / 1000), dolares: spend.dollars - d0};
		writeFileSync(`${dir}/reporte.json`, JSON.stringify(reporte, null, 1));
	}
	console.log();
	tabla(Object.entries(reporte.pasos as Record<string, {quien: string; segundos: number; dolares: number}>).map(([id, r]) => ({paso: id, quien: r.quien, con: PASOS.find((p) => p.id === id)?.con ?? '', t: r.segundos, usd: r.dolares})));
	// Only a run that reached the last step has a film that matches what it just did.
	if (i1 === PASOS.length - 1 && existsSync(`${dir}/film.mp4`)) log(`listo: ${dir}/film.mp4`);
};

// Requests for the assistant in the session, and its answers, stay with the run.
process.env.PEDIDOS = `${dir}/pedidos`;
principal(main);
