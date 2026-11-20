// Plantillas flow: guion -> film, one declared step at a time. Finished steps are skipped, so a change only reruns what depends on it.
// usage: pnpm plantillas <run-name> [--guion file] [--llm local|deepseek|mix] [--from step] [--until step] [--only step] [--factcheck]
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {prepararEntorno} from './lib/entorno';
import {annotatedText, NOTES_RULE, readGuion} from './lib/guion';
import {perfilPorDefecto, releaseLocal, spend} from './lib/llm';
import {principal} from './lib/orquestador';
import {STEPS} from './steps';
import type {Context} from './steps/types';
import {carpetaTemporal} from './lib/sistema';

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const name = args[0];
if (!name || name.startsWith('--')) throw new Error('Falta nombre de corrida');
const dir = `runs/${name}`;
mkdirSync(`${dir}/assets`, {recursive: true});
// Render bundles land in the temp folder, which may live in memory; keeping them in the project lets the environment check clean them.
carpetaTemporal();
const source = flag('guion');
if (source) copyFileSync(source, `${dir}/guion.md`);

const ctx: Context = {
	dir,
	name,
	profile: flag('llm') ?? perfilPorDefecto(),
	factcheck: args.includes('--factcheck'),
	read: (file) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')),
	write: (file, value) => writeFileSync(`${dir}/${file}`, JSON.stringify(value, null, 1)),
	guion: () => readGuion(readFileSync(`${dir}/guion.md`, 'utf8')).narration,
	notas: () => {
		const g = readGuion(readFileSync(`${dir}/guion.md`, 'utf8'));
		return g.annotated ? `${annotatedText(g)}\n\n${NOTES_RULE} Si el kit no puede mostrar algo que pidió el autor, usa lo más cercano que sí exista.` : g.narration;
	},
};

const hash = (files: string[]) => {
	const h = createHash('sha1');
	files.forEach((f) => existsSync(`${dir}/${f}`) && h.update(readFileSync(`${dir}/${f}`)));
	return h.digest('hex');
};

const main = async () => {
	const statusFile = `${dir}/steps.json`;
	const status: Record<string, string> = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : {};
	const from = flag('from');
	const only = flag('only');
	let forced = false;
	const t0 = Date.now();
	await prepararEntorno({perfil: ctx.profile, usaLocal: true, log: (...x) => console.log(...x), flujo: 'plantillas'});
	for (const step of STEPS) {
		if (from === step.id) forced = true;
		if (only && only !== step.id) continue;
		if (step.enabled && !step.enabled(ctx)) continue;
		const key = hash(step.needs);
		const done = status[step.id] === key && step.makes.every((f) => existsSync(`${dir}/${f}`));
		if (done && !forced && only !== step.id) {
			console.log(`· ${step.id} (sin cambios)`);
			continue;
		}
		const t = Date.now();
		console.log(`▶ ${step.id}`);
		const before = {...spend};
		await step.run(ctx);
		status[step.id] = key;
		writeFileSync(statusFile, JSON.stringify(status, null, 1));
		const paid = spend.dollars - before.dollars;
		console.log(`  ${step.id}: ${((Date.now() - t) / 1000).toFixed(0)} s${spend.calls > before.calls ? `, ${spend.tokens - before.tokens} tokens, $${paid.toFixed(4)}` : ''}`);
		if (flag('until') === step.id) break;
	}
	releaseLocal();
	console.log(`listo en ${((Date.now() - t0) / 1000).toFixed(0)} s: ${dir}${spend.calls ? ` (${spend.calls} llamadas, $${spend.dollars.toFixed(4)})` : ''}`);
};

// Requests for the assistant in the session, and its answers, stay with the run.
process.env.PEDIDOS = `${dir}/pedidos`;
principal(main);
