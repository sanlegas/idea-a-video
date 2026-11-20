import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {releaseLocal} from '../lib/llm';
import {navegador} from '../lib/local';
import {medios, resolverVoz} from '../lib/medios';
import {narrarFrases} from '../lib/voz';
import {mezclarMuestras, type Toque} from '../lib/muestras';
import {mezclarMusica, modoMusica, pistas, planDeAnimos, type Animo} from '../lib/musica';
import type {Storyboard} from '../../src/schema';
import type {Step} from './types';
import {nodo, remotion} from '../lib/sistema';

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, {stdio: 'inherit'});

export const factcheck: Step = {
	id: 'factcheck',
	needs: ['guion.md'],
	makes: ['facts.md'],
	enabled: (ctx) => ctx.factcheck,
	run: (ctx) => {
		sh(`${process.cwd()}/node_modules/.bin/tsx`, ['scripts/factcheck.ts', '--guion', `${ctx.dir}/guion.md`, '--strict']);
		copyFileSync('data/facts.md', `${ctx.dir}/facts.md`);
	},
};

export const merge: Step = {
	id: 'merge',
	needs: ['storyboard.json', 'film_chips.json'],
	makes: ['film_storyboard.json'],
	run: (ctx) => {
		const sb = ctx.read<Storyboard>('storyboard.json');
		ctx.read<{beat: number; chip: Storyboard['beats'][number]['chip']}[]>('film_chips.json').forEach((c) => (sb.beats[c.beat].chip = c.chip));
		ctx.write('film_storyboard.json', sb);
	},
};

export const voice: Step = {
	id: 'voice',
	needs: ['storyboard.json'],
	makes: ['voice.wav', 'timing.json'],
	run: async (ctx) => {
		releaseLocal();
		const sb = ctx.read<Storyboard>('storyboard.json');
		ctx.write('beats.json', sb.beats.map((b) => b.text));
		// One audio per beat, from the voice this machine and its keys allow; with no voice, silence of the right length.
		const voz = resolverVoz(medios().voz.proveedor);
		console.log(`  voz: ${voz.proveedor} (${voz.porque})`);
		await narrarFrases({proveedor: voz.proveedor, lineas: sb.beats.map((b) => b.text), beats: `${ctx.dir}/beats`, log: (...x) => console.log(' ', ...x)});
		nodo('scripts/timing.mjs', [ `${ctx.dir}/beats`, ctx.dir]);
	},
};

// The mood of a beat, as a mood of the music library.
const ANIMO: Record<'tension' | 'wonder' | 'calm' | 'resolve', Animo> = {tension: 'tension', wonder: 'curiosidad', calm: 'curiosidad', resolve: 'esperanza'};
// The mix lowers the whole bed hard while the voice sounds, so library music goes in louder than its level for flows
// that lower it gently.
const BAJO_LA_VOZ = 1.6;

export const bed: Step = {
	id: 'bed',
	needs: ['storyboard.json', 'timing.json', 'sound.json', 'world.json'],
	makes: ['bed.wav'],
	run: (ctx) => {
		// Ambience, rumble and counters are synthesized. The music comes from the public-domain tracks of
		// kit/biblioteca/musica, by the mood of each beat, and every move between beats takes a recorded sound.
		const {nivel} = medios().musica;
		const modo = modoMusica(medios().musica.modo);
		nodo('scripts/sound.mjs', [ ctx.dir, '--sin-whoosh', ...(modo === 'sintetizada' ? [] : ['--sin-pad'])]);
		const sb = ctx.read<Storyboard>('storyboard.json');
		const timing = ctx.read<{duration: number; beats: {start: number; end: number}[]}>('timing.json');
		const design = ctx.read<{beats: {beat: number; mood: keyof typeof ANIMO}[]}>('sound.json');
		const toques: Toque[] = sb.beats.flatMap((b, i) => {
			const {end} = timing.beats[i];
			if (b.shot === 'dive') return [{t: end - 0.3, muestra: 'barrido_grave', gain: 0.8}];
			return i + 1 < sb.beats.length ? [{t: end - 0.1, muestra: 'barrido', gain: 0.5}] : [];
		});
		const f = (n: string) => `${ctx.dir}/${n}`;
		let fondo: string | null = null;
		if (modo === 'pistas') {
			const mood = (i: number) => design.beats.find((x) => x.beat === i)?.mood ?? 'calm';
			const plan = planDeAnimos({trozos: timing.beats.map((b, i) => ({momento: mood(i), animo: ANIMO[mood(i)], desde: b.start, hasta: b.end})), look: 'papel', nombre: ctx.name, duracion: timing.duration, nivel: Math.min(1.5, nivel * BAJO_LA_VOZ)});
			ctx.write('musica.json', plan);
			fondo = f('musica.wav');
			mezclarMusica({plan, duracion: timing.duration, voz: null, salida: fondo});
			const cat = pistas();
			plan.tramos.forEach((t) => console.log(`  música ${t.desde.toFixed(1)}–${t.hasta.toFixed(1)} s (${t.animo}): "${cat[t.pista].titulo}" de ${cat[t.pista].autor}, ${cat[t.pista].licencia}`));
		}
		renameSync(f('bed.wav'), f('bed_base.wav'));
		mezclarMuestras(f('bed_base.wav'), toques, f('bed.wav'), fondo);
	},
};

export const render: Step = {
	id: 'render',
	needs: ['film_storyboard.json', 'timing.json', 'world.json', 'assets/hero.json', 'props.json', 'tomas.json'],
	makes: ['silent.mp4'],
	run: (ctx) => {
		const storyboard = ctx.read<Storyboard>('film_storyboard.json');
		if (storyboard.beats.some((b) => b.collapse) || !existsSync('public/collapse.bin')) nodo('scripts/bake-collapse.mjs', []);
		writeFileSync('data/film.json', JSON.stringify({world: ctx.read('world.json'), hero: ctx.read('assets/hero.json'), storyboard, timing: ctx.read('timing.json'), props: ctx.read('props.json'), tomas: ctx.read('tomas.json')}));
		const nav = navegador();
		const gl = [`--gl=${nav.gl}`, ...(nav.ejecutable ? [`--browser-executable=${nav.ejecutable}`] : [])];
		remotion(['render', 'src/index.ts', 'Pilot', `${ctx.dir}/silent.mp4`, '--muted', '--crf=18', '--concurrency=1', '--log=error', ...gl]);
	},
};

export const mix: Step = {
	id: 'mix',
	needs: ['silent.mp4', 'voice.wav', 'bed.wav', 'efectos.wav'],
	makes: ['film.mp4'],
	run: (ctx) => {
		const f = (n: string) => `${ctx.dir}/${n}`;
		const hasFx = existsSync(f('efectos.wav'));
		sh('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', f('silent.mp4'), '-i', f('voice.wav'), '-i', f('bed.wav'), ...(hasFx ? ['-i', f('efectos.wav')] : []), '-filter_complex',
			'[2:a]volume=0.75[bed];[1:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[key][voz];[bed][key]sidechaincompress=threshold=0.05:ratio=4:attack=15:release=320[duck];' + (hasFx ? '[duck][3:a][voz]amix=inputs=3:weights=1 0.65 1' : '[duck][voz]amix=inputs=2:weights=1 1') + ':normalize=0,loudnorm=I=-14:TP=-1.5:LRA=8[a]',
			'-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', f('film.mp4')]);
		console.log(`  ${readFileSync(f('film.mp4')).length} bytes`);
	},
};
