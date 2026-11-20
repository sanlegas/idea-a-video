// Adds the sound stage to a run that already has its cut with voice only (crudo.mp4), without writing or rendering scenes again.
// usage: pnpm estudio:sonido <name> [--llm deepseek|glm|openrouter|local|mix] [--rehacer]
import {existsSync, readFileSync} from 'node:fs';
import type {Word} from '../../src/estudio/film';
import {perfilPorDefecto, spend} from '../lib/llm';
import {principal} from '../lib/orquestador';
import {planScenes, type Direction, type Ideas} from './lib/cerebro';
import {addSound} from './lib/sonido';

const args = process.argv.slice(2);
const name = args[0];
if (!name || name.startsWith('--')) throw new Error('Falta nombre de corrida');
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const profile = flag('llm') ?? perfilPorDefecto();
const dir = `runs/${name}`;
const read = <T>(file: string): T => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
const log = (...x: unknown[]) => console.log(new Date().toTimeString().slice(0, 8), ...x);

const main = async () => {
	if (!existsSync(`${dir}/crudo.mp4`)) throw new Error(`${dir}/crudo.mp4 no existe: corre pnpm estudio primero`);
	const {duration, words} = read<{duration: number; words: Word[]}>('words.json');
	const planned = planScenes(read<Ideas>('ideas.json'), words, duration);
	const scenes = planned.map((p) => ({...p, words: words.slice(p.first, p.last + 1), direction: read<Direction>(`${p.id}_direccion.json`)}));
	await addSound({profile, dir, scenes, duration, video: `${dir}/crudo.mp4`, output: `${dir}/film.mp4`, redo: args.includes('--rehacer'), log});
	log(`listo: ${dir}/film.mp4 | $${spend.dollars.toFixed(4)}`);
};

// Requests for the assistant in the session, and its answers, stay with the run.
process.env.PEDIDOS = `${dir}/pedidos`;
principal(main);
