// Renders a toma alone over a finished run's world: tsx scripts/lib/probar_toma.ts <run> <toma.ts> <out-prefix>
import {readFileSync} from 'node:fs';
import type {Film} from '../../src/schema';
import {checkProgram, TOMAS_API} from '../estudio/lib/programa';
import {openWorldRenderer} from './plantillas_render';

const [run, file, prefix] = process.argv.slice(2);
const read = (f: string) => JSON.parse(readFileSync(`runs/${run}/${f}`, 'utf8'));
const {js, issues} = checkProgram(readFileSync(file, 'utf8'), TOMAS_API);
if (!js) throw new Error(issues.join('\n'));
const film: Film = {
	world: read('world.json'),
	hero: read('assets/hero.json'),
	storyboard: {title: 'prueba', beats: [{text: 'prueba', scene: 'toma', shot: 'prueba', grade: 'day', quake: 0, collapse: false, counter: null, chip: null, prop: null}]},
	timing: {duration: 4, beats: [{start: 0, end: 4}], words: []},
	tomas: [{id: 'prueba', about: 'prueba', js}],
};
const main = async () => {
	const r = await openWorldRenderer();
	const out = await r.stills(film, [0.4, 2, 3.6], prefix);
	console.log(JSON.stringify(out));
	await r.close();
};
main().then(() => process.exit()).catch((e) => {
	console.error(String(e).slice(0, 1500));
	process.exit(1);
});
