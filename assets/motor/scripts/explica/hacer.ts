// 2D explainer from a plan: checks it, synthesizes its sound and renders the film.
// usage: pnpm explica guiones/explica/ia.json [--sin-sonido] [--musica pistas|sintetizada|no] [--cuadros 1,4.5,9]
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {inicios, revisar, type Plan} from '../../src/explica/plan';
import {esRelleno} from '../lib/gancho';
import {medios} from '../lib/medios';
import {modoMusica, MODOS, type Modo} from '../lib/musica';
import {sonidoDe} from './sonido';
import {carpetaTemporal, remotion as cli} from '../lib/sistema';

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const source = args[0];
if (!source || source.startsWith('--')) throw new Error('Falta el plan: pnpm explica guiones/explica/<nombre>.json');

const plan: Plan = JSON.parse(readFileSync(source, 'utf8'));
// The first scene is the hook: short, and it names the subject at once (see skill/references/gancho.md).
const abre = plan.escenas[0];
const deGancho = [
	...(abre && abre.dur > 4 ? [`escena 1 (${abre.tipo}): es el gancho y dura ${abre.dur} s; máximo 4 s`] : []),
	...(abre?.tipo === 'portada' && esRelleno(`${abre.antetitulo ?? ''} ${abre.titulo}`) ? ['escena 1 (portada): el título es el gancho; empieza con la pregunta o la cifra, sin saludo ni "en este video"'] : []),
];
const problemas = [...revisar(plan), ...deGancho];
if (problemas.length) throw new Error(`El plan tiene problemas:\n${problemas.join('\n')}`);

const dir = `runs/explica/${plan.nombre}`;
const pub = `public/explica/${plan.nombre}`;
mkdirSync(dir, {recursive: true});
mkdirSync(pub, {recursive: true});
carpetaTemporal();

if (!args.includes('--sin-sonido')) {
	const pedida = (flag('musica') ?? medios().musica.modo) as Modo;
	if (!MODOS.includes(pedida)) throw new Error(`música desconocida: ${pedida}; hay: ${MODOS.join(', ')}`);
	const modo = modoMusica(pedida);
	sonidoDe(plan, `${pub}/sonido.wav`, {conVoz: Boolean(plan.voz), modo, nivel: medios().musica.nivel, log: console.log});
	plan.audio = `explica/${plan.nombre}/sonido.wav`;
}
const props = `${dir}/props.json`;
writeFileSync(props, JSON.stringify({plan}));
const {duracion} = inicios(plan);
console.log(`${plan.nombre}: ${plan.escenas.length} escenas, ${duracion.toFixed(1)} s`);

const remotion = (cmd: string[]) => cli([...cmd, `--props=${props}`]);
const cuadros = flag('cuadros');
if (cuadros) {
	for (const s of cuadros.split(',').map(Number)) remotion(['still', 'src/explica/index.tsx', 'Explica', `${dir}/cuadro_${s}.png`, `--frame=${Math.round(s * 30)}`]);
} else {
	remotion(['render', 'src/explica/index.tsx', 'Explica', `${dir}/film.mp4`, '--codec=h264', '--crf=18']);
	console.log(`listo: ${dir}/film.mp4`);
}
