// Guion to finished video, with no person in the loop.
// usage: pnpm estudio <name> --guion file [--llm deepseek|glm|openrouter|local|mix] [--intentos 3] [--una-escena] [--rehacer] [--sin-sonido] [--sin-blender]
// With Blender on this machine, the LLM also writes the new 3D models the film needs and Blender builds them (--sin-blender skips it).
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import type {Assembly, AssemblyClip, Film, Footage, Shot, Word} from '../../src/estudio/film';
import {notesFor, readGuion} from '../lib/guion';
import {clearLocal, perfilPorDefecto, spend} from '../lib/llm';
import {medios, resolverVoz} from '../lib/medios';
import {principal} from '../lib/orquestador';
import {narrarFrases} from '../lib/voz';
import {cached, direct, modoLocal, planIdeas, planScenes, usarModelos, usarModoLocal, writeScene, type Direction, type Ideas, type SceneBrief, type SceneResult} from './lib/cerebro';
import {prepararEntorno} from '../lib/entorno';
import {ensureImages, proveedoresDibujo, type ImageAsset} from './lib/imagenes';
import {makePages} from './lib/paginas';
import {joinVoice, wordTimes} from './lib/palabras';
import {ensureResources} from './lib/recursos';
import {openRenderer} from './lib/render';
import {addSound} from './lib/sonido';
import {carpetaTemporal} from '../lib/sistema';
import {catalogoKit, describir, resolverModelo, type EntradaModelo} from '../lib/modelos';
import {buscarBlender} from '../lib/blender';
import {modelosNuevos} from './lib/modelos_nuevos';

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
const name = args[0];
if (!name || name.startsWith('--')) throw new Error('Falta nombre de corrida');
const profile = flag('llm') ?? perfilPorDefecto();
const maxVisual = Number(flag('intentos') ?? 3);
const dir = `runs/${name}`;
const pub = `public/run/${name}`;
const SWIPE = 0.24;
const FADE = 0.3;
const BROKEN = 3;

mkdirSync(dir, {recursive: true});
mkdirSync(`${pub}/clips`, {recursive: true});
// Render bundles copy public/; the system temp folder may live in memory, so the project keeps its own.
carpetaTemporal();
const log = (...x: unknown[]) => console.log(new Date().toTimeString().slice(0, 8), ...x);

// Sentences are narrated one by one, so ideas stay apart and a long text never hangs the voice model.
const sentences = (guion: string) => guion.split('\n').flatMap((line) => line.match(/[^.?!]+[.?!]+["»]?|[^.?!]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);

// One audio per sentence, from the voice this machine and its keys allow; a run with no voice gets silence of the
// right length, so the film can still be judged.
const narrate = async (lines: string[]) => {
	const beats = `${dir}/beats`;
	// Compared as data: the local voice rewrites beats.json indented, and a text comparison would narrate again on every run.
	const mismas = existsSync(`${dir}/beats.json`) && JSON.stringify(JSON.parse(readFileSync(`${dir}/beats.json`, 'utf8'))) === JSON.stringify(lines);
	if (mismas && existsSync(beats) && readdirSync(beats).filter((f) => /\.(wav|flac|mp3|ogg|aiff?|m4a)$/i.test(f)).length === lines.length) return false;
	writeFileSync(`${dir}/beats.json`, JSON.stringify(lines));
	const voz = resolverVoz(medios().voz.proveedor);
	log(`voz: ${voz.proveedor} (${voz.porque})`);
	await narrarFrases({proveedor: voz.proveedor, lineas: lines, beats, log});
	return true;
};

const main = async () => {
	const t0 = Date.now();
	const source = flag('guion');
	if (source) copyFileSync(source, `${dir}/guion.md`);
	// Lines starting with > are the author's visual notes: they guide the picture and are never narrated.
	const authored = readGuion(readFileSync(`${dir}/guion.md`, 'utf8'));
	const guion = authored.narration;
	const lines = sentences(guion);

	// 3D models for this film: runs/<name>/modelos.json maps a name to a .glb of its own ({archivo, en}) or to one of the
	// shared catalog in kit/modelos ({kit: nombre}); --modelos a,b adds catalog models without touching that file.
	const propios: Record<string, EntradaModelo> = existsSync(`${dir}/modelos.json`) ? JSON.parse(readFileSync(`${dir}/modelos.json`, 'utf8')) : {};
	for (const n of (flag('modelos') ?? '').split(',').map((x) => x.trim()).filter(Boolean)) propios[n] ??= {kit: n};
	const catalogo = Object.fromEntries(Object.entries(propios).map(([n, e]) => [n, resolverModelo(n, e)]));
	mkdirSync(`${pub}/modelos`, {recursive: true});
	Object.entries(catalogo).forEach(([n, m]) => copyFileSync(m.archivo, `${pub}/modelos/${n}.glb`));
	usarModelos(Object.fromEntries(Object.entries(catalogo).map(([n, m]) => [n, m.en])));
	if (Object.keys(catalogo).length) log(`${Object.keys(catalogo).length} modelos 3D: ${Object.keys(catalogo).join(', ')}`);
	// Local mode: nothing here can draw pictures (or --sin-imagenes asks not to). Scenes are built from 3D models, this
	// film's and the shared catalog's, and from flat 2D drawings painted with code: no picture is generated or downloaded.
	if (has('sin-imagenes') || !proveedoresDibujo().length) {
		usarModoLocal(Object.fromEntries(Object.entries(catalogoKit()).map(([n, m]) => [n, describir(m)])));
		log(`imágenes: ninguna${has('sin-imagenes') ? ' (--sin-imagenes)' : ', esta máquina no tiene con qué generarlas'}; escenas con modelos 3D del catálogo y dibujos 2D hechos con código`);
	}
	if (has('ligero')) log('render ligero: una o dos pasadas por cuadro, para computadoras con poca GPU');

	if (!has('sin-entorno')) await prepararEntorno({perfil: profile, usaLocal: true, log, flujo: 'estudio'});
	clearLocal();
	const narrada = await narrate(lines);
	const {duration, spans} = joinVoice(`${dir}/beats`, `${pub}/voice.wav`);
	// Timing the words takes a minute or two; with the same voice, the saved timing is the same answer.
	const guardadas = !narrada && existsSync(`${dir}/words.json`) ? (JSON.parse(readFileSync(`${dir}/words.json`, 'utf8')) as {duration: number; words: Word[]}) : null;
	const {words, misheard} = guardadas && Math.abs(guardadas.duration - duration) < 0.01 ? {words: guardadas.words, misheard: [] as string[]} : wordTimes(lines, `${pub}/voice.wav`, spans, `${dir}/tmp`);
	writeFileSync(`${dir}/words.json`, JSON.stringify({duration, words}, null, 1));
	log(`voz ${duration.toFixed(2)} s, ${words.length} palabras${misheard.length ? `, dudosas: ${misheard.join(' ')}` : ''}`);

	const ideasFile = `${dir}/ideas.json`;
	const ideas: Ideas = (!has('rehacer') && cached<Ideas>(ideasFile)) || (has('una-escena') ? {concepto: guion, protagonista: 'el de la idea', mundo: 'azul', escenas: [{primera: 0, ultima: words.length - 1, idea: guion, salida: 'corte'}]} : await planIdeas(profile, guion, words, duration, authored));
	writeFileSync(ideasFile, JSON.stringify(ideas, null, 1));
	log(`${ideas.escenas.length} escenas: ${ideas.concepto}`);

	// New 3D models for what the catalog lacks, built by code in Blender when this machine has it: no picture generator.
	const blender = has('sin-blender') || has('una-escena') ? null : buscarBlender();
	if (blender && !blender.vieja) {
		const nuevos = await modelosNuevos(blender, `${dir}/modelos_src`, {
			profile,
			ideas,
			guion,
			estilo: authored.style,
			catalogo: Object.fromEntries(Object.entries(catalogoKit()).map(([n, m]) => [n, describir(m)])),
			propios: Object.fromEntries(Object.entries(catalogo).map(([n, m]) => [n, m.en])),
			log,
		});
		if (Object.keys(nuevos).length) {
			for (const [n, m] of Object.entries(nuevos)) {
				propios[n] = {archivo: m.archivo, en: m.en};
				catalogo[n] = resolverModelo(n, propios[n]);
				copyFileSync(m.archivo, `${pub}/modelos/${n}.glb`);
			}
			writeFileSync(`${dir}/modelos.json`, JSON.stringify(propios, null, 1));
			usarModelos(Object.fromEntries(Object.entries(catalogo).map(([n, m]) => [n, m.en])));
		}
	} else if (!has('sin-blender') && !has('una-escena')) log(`modelos nuevos: no (${blender ? `Blender ${blender.version} es más viejo que 4.2` : 'esta máquina no tiene Blender'}); escenas con el catálogo${modoLocal() ? ' y dibujos 2D' : ' e imágenes'}`);

	const planned = planScenes(ideas, words, duration);
	// Real footage under the scenes and the film look that goes with it; without them every scene draws its own backdrop.
	let footage: Record<string, Footage> = {};
	let look: Film['look'] = undefined;

	const style = authored.style.length ? `\nEstilo del autor, obligatorio en todo el video: ${authored.style.join(' ')}` : '';
	const baseThread = ideas.escenas.length > 1 ? `Concepto: ${ideas.concepto}\nProtagonista recurrente: ${ideas.protagonista}\nColor base: ${ideas.mundo}${style}` : style.trim() || null;
	const directions: Direction[] = [];
	const sceneThread = () => {
		const made = new Map(directions.flatMap((d) => d.imagenes).map((i) => [i.nombre, i]));
		const list = [...made.values()].map((i) => `${i.nombre}: ${i.en}`).join('; ');
		const usados = [...new Set(directions.flatMap((d) => d.modelos ?? []))].join(', ');
		const previas = [list && `Imágenes ya creadas, reutilízalas con el mismo nombre y la misma descripción si aparecen aquí: ${list}`, usados && `Modelos 3D ya usados; si el mismo personaje u objeto aparece aquí, usa el mismo modelo: ${usados}`].filter(Boolean).join('\n');
		return baseThread && previas ? `${baseThread}\n${previas}\nEscena anterior: ${directions[directions.length - 1].metafora}` : baseThread;
	};
	for (const p of planned) {
		const file = `${dir}/${p.id}_direccion.json`;
		const sceneWords = words.slice(p.first, p.last + 1);
		const brief: SceneBrief = {text: sceneWords.map((w) => w.word).join(' '), words: sceneWords, duration: p.end - p.start, thread: sceneThread(), notes: notesFor(authored, p.first, p.last), opening: p.id === 's1'};
		const d = (!has('rehacer') && cached<Direction>(file)) || (await direct(profile, brief));
		writeFileSync(file, JSON.stringify(d, null, 1));
		directions.push(d);
		log(`${p.id} dirección: ${d.metafora}`);
	}

	// Models a scene took from the shared catalog travel into this run like its own.
	for (const n of new Set(directions.flatMap((d) => d.modelos ?? []))) {
		if (catalogo[n]) continue;
		catalogo[n] = resolverModelo(n, {kit: n});
		copyFileSync(catalogo[n].archivo, `${pub}/modelos/${n}.glb`);
		log(`modelo ${n}: del catálogo`);
	}

	const pages = makePages(words, duration, directions.flatMap((d) => d.claves));
	const seen = new Map<string, {name: string; describe: string; cut: boolean}>();
	directions.flatMap((d) => d.imagenes).forEach((i) => seen.set(i.nombre, {name: i.nombre, describe: i.en, cut: i.tipo === 'objeto'}));
	const assets: Record<string, ImageAsset> = await ensureImages([...seen.values()], name, log);
	Object.keys(catalogo).forEach((n) => (assets[n] = {file: `run/${name}/modelos/${n}.glb`, aspect: 1, modelo: true}));
	const resources = await ensureResources(directions.flatMap((d) => d.recursos ?? []));
	resources.forEach((r) => {
		const file = path.basename(r.file);
		copyFileSync(r.file, `${pub}/assets/${file}`);
		assets[r.id] = {file: `run/${name}/assets/${file}`, aspect: r.aspect};
		log(`recurso ${r.id}: ${r.state}`);
	});
	const makeFilm = (shots: Shot[], withText: boolean): Film => ({name, duration, words, pages: withText ? pages : [], shots, assets, audio: null, ...(has('ligero') ? {ligero: true} : {}), ...(look ? {look} : {})});

	const renderer = await openRenderer();
	const results: SceneResult[] = [];
	for (const [i, p] of planned.entries()) {
		const file = `${dir}/${p.id}_final.json`;
		const sceneWords = words.slice(p.first, p.last + 1);
		const brief: SceneBrief = {text: sceneWords.map((w) => w.word).join(' '), words: sceneWords, duration: p.end - p.start, thread: baseThread, notes: notesFor(authored, p.first, p.last), opening: p.id === 's1'};
		let result = !has('rehacer') ? cached<SceneResult>(file) : null;
		if (!result) {
			log(`${p.id}: ${brief.text}`);
			const sceneDir = `${dir}/${p.id}`;
			mkdirSync(sceneDir, {recursive: true});
			result = await writeScene({
				profile,
				renderer,
				base: (code) => makeFilm([{id: p.id, code, start: p.start, end: p.end, span: [p.first, p.last], footage: footage[p.id]}], true),
				shotId: p.id,
				scene: brief,
				direction: directions[i],
				start: p.start,
				end: p.end,
				dir: sceneDir,
				previousCode: i > 0 ? results[i - 1].code : null,
				maxVisual,
				log,
			});
			writeFileSync(file, JSON.stringify(result, null, 1));
			log(`${p.id}: elegido intento ${result.chosen}, ${result.score}/10 tras ${result.visual} revisiones`);
		}
		results.push(result);
	}

	// Each clip starts early enough to be on screen during the passage that brings it in.
	const lead = (i: number) => (i === 0 ? 0 : planned[i - 1].exit === 'swipe' ? SWIPE : planned[i - 1].exit === 'fundido' ? FADE : 0);
	const tClips = Date.now();
	const clips: AssemblyClip[] = [];
	for (const [i, p] of planned.entries()) {
		const from = p.start - lead(i);
		const shot: Shot = {id: p.id, code: results[i].js, start: from, end: p.end, span: [p.first, p.last], footage: footage[p.id]};
		const output = `${pub}/clips/${p.id}.mp4`;
		await renderer.clip(makeFilm([shot], false), p.id, output);
		const previous = i ? planned[i - 1].exit : null;
		clips.push({file: `run/${name}/clips/${p.id}.mp4`, from, to: p.end, enter: previous ? {type: previous, start: from, end: p.start} : null});
		log(`clip ${p.id} listo`);
	}
	await renderer.close();
	const clipSeconds = (Date.now() - tClips) / 1000;

	const assembly: Assembly = {film: {...makeFilm([], true), audio: `run/${name}/voice.wav`}, clips};
	const montage = await openRenderer();
	const raw = `${dir}/crudo.mp4`;
	await montage.assemble(assembly, raw);
	await montage.close();
	const sound = has('sin-sonido')
		? (execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=8', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${dir}/film.mp4`]), null)
		: await addSound({profile, dir, scenes: planned.map((p, i) => ({...p, words: words.slice(p.first, p.last + 1), direction: directions[i]})), duration, video: raw, output: `${dir}/film.mp4`, redo: has('rehacer'), log});

	const report = {
		name,
		profile,
		duration,
		concept: ideas.concepto,
		scenes: planned.map((p, i) => ({id: p.id, seconds: p.end - p.start, score: results[i].score, chosen: results[i].chosen, revisions: results[i].visual, calls: results[i].attempts.length, metaphor: directions[i].metafora})),
		// Scenes a person should look at: the loop ended without a version that works.
		review: planned.filter((_, i) => results[i].score <= BROKEN).map((p) => p.id),
		credits: resources.map((r) => r.credit),
		sound: sound?.escenas ?? null,
		dollars: spend.dollars,
		calls: spend.calls,
		tokens: spend.tokens,
		usage: {input: spend.input, cached: spend.cached, output: spend.output, thinking: spend.thinking, steps: spend.steps},
		clipSeconds,
		totalSeconds: (Date.now() - t0) / 1000,
	};
	writeFileSync(`${dir}/reporte.json`, JSON.stringify(report, null, 1));
	log(`listo: ${report.scenes.map((s) => `${s.id} ${s.score}/10`).join(', ')} | $${spend.dollars.toFixed(4)} | ${report.totalSeconds.toFixed(0)} s`);
	if (report.review.length) log(`revisar a mano: ${report.review.join(', ')}`);
};

// Requests for the assistant in the session, and its answers, stay with the run.
process.env.PEDIDOS = `${dir}/pedidos`;
// principal exits the process at the end: an open browser would keep it alive after a failure.
principal(main);
