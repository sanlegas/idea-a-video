// The tomas step: before the storyboard, a model writes the shots this film needs and the fixed kit lacks.
// Each toma is checked, rendered and judged like an Estudio scene; good ones join a library that later films can reuse.
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {z} from 'zod';
import {SHOT_CATALOG, shotsFor, type Film, type Model, type TomaCode, type World} from '../../src/schema';
import {makeSheet} from '../estudio/lib/hoja';
import {apiText, checkProgram, TOMAS_API} from '../estudio/lib/programa';
import {askJson, askText, outOfCredit, releaseLocal, targetFor} from '../lib/llm';
import {openWorldRenderer, type WorldRenderer} from '../lib/plantillas_render';
import type {Context, Step} from './types';

const LIBRARY = 'kit/tomas';
const MAX_TOMAS = 6;
const MAX_CALLS = 6;
const MAX_LOOKS = 3;
const PASS = 7;
// A toma kept for later films must have looked at least this good.
const KEEP = 6;
const TEST_SECONDS = 6;

type Saved = TomaCode & {code: string; score: number; run: string};

const library = (): Saved[] => (existsSync(LIBRARY) ? readdirSync(LIBRARY).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${LIBRARY}/${f}`, 'utf8')) as Saved) : []);

const planSchema = z.object({
	tomas: z
		.array(
			z.object({
				id: z.string().regex(/^[a-z][a-z0-9_]{2,30}$/),
				muestra: z.string().min(20).max(400),
				para: z.string().min(5),
				reutiliza: z.string().nullable(),
			}),
		)
		.max(MAX_TOMAS),
});

const critiqueSchema = z.object({
	puntaje: z.number().min(0).max(10),
	se_entiende: z.boolean(),
	problemas: z.array(z.object({problema: z.string(), arreglo: z.string()})).max(3),
});

const PLAN_SYSTEM = (world: World, saved: Saved[]) => `Eres director técnico de un kit de animación 3D low-poly para videos explicativos verticales.
El kit ya trae estas tomas fijas:
${shotsFor(world).map((s) => `- ${s}: ${SHOT_CATALOG[s].about}`).join('\n')}

Decides qué tomas nuevas hay que programar para este video: solo para momentos del guion que esas tomas fijas no pueden mostrar y que el espectador necesita ver.
Cada toma nueva vive dentro del mismo mundo y con el mismo protagonista, y muestra una sola acción física concreta: algo que se derrumba, se llena, se mueve, crece o se conecta.
${saved.length ? `Biblioteca de tomas ya programadas en videos anteriores. Si una sirve tal cual, pon su id en reutiliza en vez de pedir una nueva:\n${saved.map((s) => `- ${s.id}: ${s.about}`).join('\n')}\n` : ''}
Reglas:
- Máximo ${MAX_TOMAS}. Menos es mejor: solo lo que de verdad falta.
- id: corto, minúsculas y guiones bajos, describe la acción (pared_derrumbe, agua_desborda).
- muestra: qué se ve, objeto por objeto, y qué cambia del principio al final. Concreto y físico.
- para: la frase del guion donde va.
- reutiliza: id de la biblioteca o null.
Devuelve solo JSON.`;

const writerSystem = (example: string) => `Programas tomas para el kit de animación de Plantillas. Escribes TypeScript que solo usa esta API:

${apiText(TOMAS_API)}

Ejemplo de una toma buena, de otro tema. Aprende la forma, no copies su contenido:
\`\`\`ts
${example}
\`\`\`

Reglas:
- Solo una llamada a toma(...). Sin import, sin export, sin Math.random; usa random(semilla).
- Construye todo una vez y en la función devuelta solo mueve, escala, colorea u oculta.
- Tamaños en metros, contra size. Colores de palette para que combine con el resto del video.
- La cámara siempre encuadra la acción completa, debajo del cuarto superior de la imagen, donde va el texto.
- Formas simples y legibles en un teléfono: pocas piezas grandes valen más que muchas pequeñas.
- Responde solo con el programa en un bloque \`\`\`ts.`;

const codeBlock = (text: string) => {
	const match = /```(?:ts|typescript|js|javascript)?\s*\n([\s\S]*?)\n```/.exec(text);
	return (match ? match[1] : text).trim();
};

// A film of one beat: the toma alone, in this film's world, for a few seconds.
const testFilm = (world: World, hero: Model | null, toma: TomaCode): Film => ({
	world,
	hero,
	storyboard: {title: toma.id, beats: [{text: toma.id, scene: 'toma', shot: toma.id, grade: 'day', quake: 0, collapse: false, counter: null, chip: null, prop: null}]},
	timing: {duration: TEST_SECONDS, beats: [{start: 0, end: TEST_SECONDS}], words: []},
	tomas: [toma],
});

const write = async (ctx: Context, renderer: WorldRenderer, world: World, hero: Model | null, plan: z.infer<typeof planSchema>['tomas'][number], example: string, dir: string) => {
	const system = writerSystem(example);
	const task = `Toma: ${plan.id}
Debe mostrar: ${plan.muestra}
Va en esta parte del guion: ${plan.para}
Mundo del video: ${world.environment}. Protagonista: ${world.hero.name} (${world.hero.brief}), ${world.hero.height} m de alto y ${world.hero.width} m de ancho.
${world.cutaway ? `Capas del suelo, de arriba abajo: ${world.cutaway.layers.map((l) => `${l.name} ${l.color}`).join(', ')}.` : ''}`;
	const seconds = [0.15, 0.5, 0.85].map((u) => u * TEST_SECONDS);
	let previous = '';
	let feedback = '';
	let looks = 0;
	let best: Saved | null = null;
	for (let call = 1; call <= MAX_CALLS && looks < MAX_LOOKS; call++) {
		const ask = previous ? `${task}\n\nTu versión anterior:\n\`\`\`ts\n${previous}\n\`\`\`\n\nCorrige esto sin reescribir lo que funciona:\n${feedback}` : task;
		let code: string;
		try {
			code = codeBlock(await askText(targetFor(ctx.profile, previous ? 'correccion' : 'escritor'), system, ask, {temperature: previous ? 0.2 : 0.35}));
		} catch (e) {
			if (outOfCredit(e)) throw e;
			console.log(`    intento ${call}: sin respuesta`);
			continue;
		}
		writeFileSync(`${dir}/${plan.id}_${call}.ts`, code);
		previous = code;
		const {js, issues} = checkProgram(code, TOMAS_API);
		if (!js) {
			console.log(`    intento ${call}: rechazo técnico | ${issues[0]?.slice(0, 140)}`);
			feedback = issues.map((x) => `- ${x}`).join('\n');
			continue;
		}
		const toma = {id: plan.id, about: plan.muestra, js};
		let shots: {files: string[]; logs: string[]};
		try {
			shots = await renderer.stills(testFilm(world, hero, toma), seconds, `${dir}/${plan.id}_${call}`);
		} catch (e) {
			const message = String(e).split('\n')[0].slice(0, 300);
			console.log(`    intento ${call}: fallo al ejecutar | ${message}`);
			feedback = `- Error al ejecutar: ${message}`;
			continue;
		}
		if (shots.logs.length) {
			console.log(`    intento ${call}: error de render | ${shots.logs[0].slice(0, 140)}`);
			feedback = shots.logs.slice(0, 2).map((x) => `- ${x}`).join('\n');
			continue;
		}
		looks++;
		const sheet = makeSheet(shots.files, `${dir}/${plan.id}_${call}.jpg`, seconds);
		const review = await askJson(
			targetFor(ctx.profile, 'critico'),
			critiqueSchema,
			`Eres director de fotografía exigente. Recibes tres momentos de una toma de video vertical, de izquierda a derecha. Juzga solo lo que ves.
Puntaje: 9-10 listo para publicar. 7-8 bueno. 4-6 se entiende a medias o se ve pobre. 0-3 roto, vacío o irreconocible.
Baja el puntaje si la acción pedida no se ve, si está cortada, muy pequeña, tapada o fuera de cuadro, o si no cambia de un momento a otro. Lista los 3 problemas más graves con un arreglo simple. Devuelve solo JSON.`,
			`Debe mostrar: ${plan.muestra}`,
			{temperature: 0.1, maxTokens: 2400, image: sheet},
		).catch((e): z.infer<typeof critiqueSchema> => {
			if (outOfCredit(e)) throw e;
			return {puntaje: 5, se_entiende: true, problemas: []};
		});
		releaseLocal();
		console.log(`    intento ${call}: revisión ${review.puntaje}/10${review.problemas[0] ? ` | ${review.problemas[0].problema.slice(0, 120)}` : ''}`);
		if (!best || review.puntaje > best.score) best = {...toma, code, score: review.puntaje, run: ctx.name};
		if (review.puntaje >= PASS && review.se_entiende) break;
		feedback = review.problemas.map((p) => `- ${p.problema}. Arreglo: ${p.arreglo}`).join('\n') || '- Haz la acción más grande, más clara y con más contraste.';
	}
	return best;
};

export const tomas: Step = {
	id: 'tomas',
	needs: ['guion.md', 'world.json', 'assets/hero.json'],
	makes: ['tomas.json'],
	run: async (ctx) => {
		const world = ctx.read<World>('world.json');
		const hero = ctx.read<Model | null>('assets/hero.json');
		const saved = library();
		const plan = await askJson(targetFor(ctx.profile, 'tomas'), planSchema, PLAN_SYSTEM(world, saved), `Lo que el mundo fijo no puede mostrar, según el director de arte:\n${world.gaps.map((g) => `- ${g}`).join('\n') || '- nada'}\n\nGuion:\n${ctx.notas()}`, {
			temperature: 0.3,
			check: (v) => {
				const list = (v as z.infer<typeof planSchema>).tomas;
				const issues = list.filter((t) => t.reutiliza && !saved.some((s) => s.id === t.reutiliza)).map((t) => `${t.reutiliza} no está en la biblioteca`);
				if (new Set(list.map((t) => t.id)).size !== list.length) issues.push('cada id debe ser único');
				return issues;
			},
		});
		console.log(`  ${plan.tomas.length} tomas: ${plan.tomas.map((t) => (t.reutiliza ? `${t.id} (biblioteca)` : t.id)).join(', ') || 'ninguna'}`);
		const dir = `${ctx.dir}/tomas`;
		mkdirSync(dir, {recursive: true});
		mkdirSync(LIBRARY, {recursive: true});
		const example = readFileSync('scripts/steps/tomas/ejemplo.txt', 'utf8');
		const done: Saved[] = [];
		const renderer = plan.tomas.some((t) => !t.reutiliza) ? await openWorldRenderer() : null;
		try {
			for (const p of plan.tomas) {
				const reused = p.reutiliza ? saved.find((s) => s.id === p.reutiliza) : null;
				if (reused) {
					const {js} = checkProgram(reused.code, TOMAS_API);
					if (js) done.push({...reused, js});
					continue;
				}
				console.log(`  ${p.id}: ${p.muestra.slice(0, 120)}`);
				const best = await write(ctx, renderer!, world, hero, p, example, dir);
				// A toma that never ran, or that looked broken, is left out: the storyboard will not offer it.
				if (!best || best.score <= 3) {
					console.log(`    ${p.id} descartada`);
					continue;
				}
				done.push(best);
				if (best.score >= KEEP) writeFileSync(`${LIBRARY}/${best.id}.json`, JSON.stringify(best, null, 1));
			}
		} finally {
			await renderer?.close();
		}
		ctx.write('tomas.json', done.map(({id, about, js, score}) => ({id, about, js, score})));
		console.log(`  listas: ${done.map((t) => `${t.id} ${t.score}/10`).join(', ') || 'ninguna'}`);
	},
};
