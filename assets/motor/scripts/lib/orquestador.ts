// Runs a flow as a list of steps: skips what is already made, reruns from a step, keeps a report of time and cost,
// and with --plan prints who does each step and an estimate without running anything.
// Same behaviour as scripts/tinta/orquestar.ts, taken out so any flow can declare its steps and reuse it.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {PedidoPendiente, releaseLocal, spend} from './llm';

export type Quien = 'código' | 'proveedor' | 'LLM' | 'revisión';

// C is what every step receives; S is what --plan assumes before the real numbers exist.
export type Paso<C, S> = {
	id: string;
	titulo: string;
	quien: Quien;
	// Model, service or tool doing the work, for the table.
	con: string;
	// Files, relative to the run folder, that mean the step is done. Empty: the step always runs and skips its own work.
	produce: string[];
	estima: (s: S) => {segundos: number; dolares: number};
	run: (ctx: C) => Promise<void>;
};

export type Log = (...x: unknown[]) => void;

export const banderas = (args: string[]) => ({
	valor: (n: string) => {
		const i = args.indexOf(`--${n}`);
		return i >= 0 ? args[i + 1] : undefined;
	},
	tiene: (n: string) => args.includes(`--${n}`),
});

export const reloj: Log = (...x) => console.log(new Date().toTimeString().slice(0, 8), ...x);

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const tabla = (filas: {paso: string; quien: string; con: string; t: number; usd: number}[]) => {
	const linea = (c: string[]) => `| ${c.join(' | ')} |`;
	console.log(linea(['Paso', 'Quién', 'Con', 'Tiempo', 'USD']));
	console.log(linea(['---', '---', '---', '---:', '---:']));
	filas.forEach((f) => console.log(linea([f.paso, f.quien, f.con, mmss(f.t), f.usd.toFixed(4)])));
	console.log(linea(['**Total**', '', '', `**${mmss(filas.reduce((a, f) => a + f.t, 0))}**`, `**${filas.reduce((a, f) => a + f.usd, 0).toFixed(4)}**`]));
};

type Reporte = {pasos: Record<string, {quien: string; segundos: number; dolares: number}>};

export const orquestar = async <C extends {dir: string; log: Log}, S>({pasos, ctx, args, supuestos, resumen}: {pasos: Paso<C, S>[]; ctx: C; args: string[]; supuestos: () => S; resumen: (s: S) => string}) => {
	const {valor, tiene} = banderas(args);
	if (tiene('plan')) {
		const s = supuestos();
		console.log(`${resumen(s)}\n`);
		// The assistant in the session answers for free; a step it answers costs no money, whatever an API would charge.
		const gratis = (ctx as {perfil?: string}).perfil === 'sesion';
		tabla(pasos.map((p) => ({paso: p.id, quien: p.quien, con: p.con, t: p.estima(s).segundos, usd: gratis && p.quien === 'LLM' ? 0 : p.estima(s).dolares})));
		return;
	}
	const ids = pasos.map((p) => p.id);
	const desde = valor('desde') ?? valor('solo');
	const hasta = valor('hasta') ?? valor('solo');
	for (const n of [desde, hasta]) if (n && !ids.includes(n)) throw new Error(`paso desconocido: ${n}; pasos: ${ids.join(', ')}`);
	const i0 = desde ? ids.indexOf(desde) : 0;
	const i1 = hasta ? ids.indexOf(hasta) : ids.length - 1;
	const archivo = `${ctx.dir}/reporte.json`;
	const reporte: Reporte = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : {pasos: {}};
	for (const [i, p] of pasos.entries()) {
		if (i < i0 || i > i1) continue;
		const hecho = p.produce.length > 0 && p.produce.every((f) => existsSync(`${ctx.dir}/${f}`));
		if (hecho && !desde) {
			ctx.log(`${p.id}: ya está`);
			continue;
		}
		ctx.log(`${p.id} (${p.quien}): ${p.titulo}`);
		const t0 = Date.now();
		const d0 = spend.dollars;
		await p.run(ctx);
		reporte.pasos[p.id] = {quien: p.quien, segundos: Math.round((Date.now() - t0) / 1000), dolares: spend.dollars - d0};
		writeFileSync(archivo, JSON.stringify(reporte, null, 1));
	}
	console.log();
	tabla(Object.entries(reporte.pasos).map(([id, r]) => ({paso: id, quien: r.quien, con: pasos.find((p) => p.id === id)?.con ?? '', t: r.segundos, usd: r.dolares})));
	// Only a run that reached the last step has a film that matches what it just did.
	if (i1 === pasos.length - 1 && existsSync(`${ctx.dir}/film.mp4`)) ctx.log(`listo: ${ctx.dir}/film.mp4`);
	else if (i1 < pasos.length - 1) ctx.log(`hecho hasta el paso ${pasos[i1].id}; el video no se volvió a renderizar`);
};

// Entry point of a flow script: reports the error, frees the local model and exits.
export const principal = (main: () => Promise<void>) =>
	main()
		.catch((e) => {
			// A step waiting for the session's answer is not a failure: exit code 3 says "answer and run again".
			if (e instanceof PedidoPendiente) {
				console.log(`\n${e.message}`);
				process.exitCode = 3;
				return;
			}
			console.error(String(e?.stack ?? e).slice(0, 3000));
			process.exitCode = 1;
		})
		.finally(() => {
			releaseLocal();
			process.exit();
		});
