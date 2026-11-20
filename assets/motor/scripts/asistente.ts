// First-use assistant: in a couple of minutes it checks that this machine has what the engine needs, says what it
// can make, lets the user pick a way of working (what there is, the paid cloud services, or nothing from outside), a
// template (a kind of video) and where voice, pictures, music and the writing come from, and leaves it written so
// every later video needs no options.
// usage: pnpm asistente                     asks in the terminal; Enter takes the recommended answer
//        pnpm asistente --estado [--json]   what is missing, what there is to choose and what is chosen; changes nothing
//        pnpm asistente --estado --webgl    the same, after rendering one 3D frame to prove WebGL (half a minute)
//        pnpm asistente --recomendado       takes every recommended answer, without asking
//        pnpm asistente --guardar modo=local [plantilla=medida] [voz=…] [imagenes=…] [musica=…] [estilo=cine] [segundos=60] [llm=…]
// An AI assistant guiding a person reads the options with --estado and writes the answers with --guardar.
// Without a terminal to ask in, the plain command behaves as --estado.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
import {CLAVES} from './lib/claves';
import {FLUJOS} from './lib/flujos';
import {perfilPorDefecto} from './lib/llm';
import {medios, nubeImagen, resolverImagenes, resolverVoz} from './lib/medios';
import {
	ajustesDeModo,
	estiloPreferido,
	guardarEleccion,
	MODOS_TRABAJO,
	OPCIONES,
	PLANTILLA_IDS,
	PLANTILLAS_SIN_FOTOS,
	plantilla,
	plantillaPara,
	preferencias,
	primeraVez,
	RECOMENDADA,
	RECOMENDADO,
	segundosPreferidos,
	type Ajuste,
	type ModoTrabajo,
} from './lib/preferencias';

const args = process.argv.slice(2);

type Diagnostico = {
	sistema: {plataforma: string; procesador: string; memoria_gb: number; disco_libre_gb: number; gpu: {tipo: string; nombre: string; memoria_gb: number}};
	herramientas: {node: string; pnpm: string | null; ffmpeg: boolean; ffprobe: boolean; python3: boolean; webgl: boolean | null; whisper: string | null};
	claves: Record<string, boolean>;
	comandos_propios: Record<string, boolean>;
	eleccion: {llm: string; voz: string; voz_porque: string; imagenes: string[]; imagenes_porque: string};
	flujos: Record<string, {estado: 'listo' | 'limitado' | 'falta'; nota: string}>;
};

// The diagnosis is its own program: it is asked for its facts as data. --webgl renders one 3D frame to prove it.
const diagnosticar = (): Diagnostico => {
	const r = spawnSync(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/diagnostico.ts', '--json', ...(args.includes('--webgl') ? ['--webgl'] : [])], {encoding: 'utf8'});
	if (r.status !== 0) throw new Error(`el diagnóstico no pudo correr: ${(r.stderr ?? '').slice(0, 400)}`);
	return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
};

// ---------------------------------------------------------------- what the machine needs

// obligatorio: nothing works without it. 3d: the 3D templates and the local mode. opcional: better results.
type Requisito = {que: string; tipo: 'obligatorio' | '3d' | 'opcional'; estado: 'listo' | 'falta' | 'sin probar'; para: string; como: string};
const porSistema = (m: {darwin: string; linux: string; win32: string}) => m[process.platform as keyof typeof m] ?? m.linux;

const requisitos = (d: Diagnostico): Requisito[] => {
	const h = d.herramientas;
	const g = d.sistema.gpu;
	const tarjeta = g.tipo === 'nvidia' || g.tipo === 'apple';
	const si = (b: unknown): Requisito['estado'] => (b ? 'listo' : 'falta');
	return [
		{que: 'Node 20 o más nuevo', tipo: 'obligatorio', estado: si(Number(h.node.replace(/^v/, '').split('.')[0]) >= 20), para: 'todo', como: 'instálalo de https://nodejs.org'},
		{que: 'pnpm', tipo: 'obligatorio', estado: si(h.pnpm), para: 'todo', como: 'npm install -g pnpm'},
		{que: 'ffmpeg y ffprobe', tipo: 'obligatorio', estado: si(h.ffmpeg && h.ffprobe), para: 'voz, montaje y mezcla de todos los videos', como: porSistema({darwin: 'brew install ffmpeg', linux: 'sudo apt install ffmpeg', win32: 'winget install ffmpeg, y abre una terminal nueva'})},
		{que: '2 GB libres en disco', tipo: 'obligatorio', estado: si(d.sistema.disco_libre_gb >= 2), para: 'renders y descargas', como: `hay ${d.sistema.disco_libre_gb} GB: libera espacio`},
		{
			que: 'WebGL en el navegador de render',
			tipo: '3d',
			estado: h.webgl === null ? 'sin probar' : si(h.webgl),
			para: `las plantillas ${PLANTILLAS_SIN_FOTOS.filter((p) => p !== 'datos').join(', ')} y el modo local`,
			como: h.webgl === false ? 'actualiza el controlador de video; sin tarjeta gráfica, pon {"chrome": {"gl": "swangle"}} en config/local.json y renderiza con --ligero' : h.webgl ? 'listo' : 'pnpm asistente --estado --webgl (medio minuto)',
		},
		{que: 'Whisper', tipo: 'opcional', estado: si(h.whisper), para: 'subtítulos exactos a la palabra con voz propia o del sistema', como: porSistema({darwin: 'brew install whisper-cpp, y su modelo: ver Whisper en docs/proveedores.md', linux: 'compila whisper.cpp: ver Whisper en docs/proveedores.md', win32: 'baja whisper.cpp: ver Whisper en docs/proveedores.md'})},
		// The public copy of the engine travels without the author's cloned voices: then only Piper or a command of one's own.
		existsSync('kit/voces/voces.json')
			? {
					que: 'Voz propia en tu equipo',
					tipo: 'opcional',
					estado: si(d.comandos_propios.voz),
					para: 'voz natural sin pagar: las voces clonadas incluidas (Qwen3-TTS) o Piper en Linux',
					como: tarjeta && h.python3 ? 'ver "Voces clonadas incluidas" en docs/proveedores.md (descarga de 4.3 GB)' : `las voces incluidas piden ${h.python3 ? '' : 'Python 3.10 o más nuevo y '}tarjeta gráfica; sin ella una frase tarda minutos${process.platform === 'linux' ? '. Piper sí corre sin ella: ver docs/proveedores.md' : ''}`,
				}
			: {
					que: 'Voz propia en tu equipo',
					tipo: 'opcional',
					estado: si(d.comandos_propios.voz),
					para: `voz sin pagar, mejor que la del sistema: ${process.platform === 'linux' ? 'Piper' : 'un comando de voz propio'}`,
					como: process.platform === 'linux' ? 'pip install piper-tts; ver Voz en docs/proveedores.md' : 'ver "Comandos propios" en docs/proveedores.md',
				},
	];
};

// ---------------------------------------------------------------- the three ways of working, on this machine

type Modo = {hoy: string; falta: string[]; nota: string};
const modos = (d: Diagnostico): Record<ModoTrabajo, Modo> => {
	const voz = resolverVoz('auto');
	const imagenes = resolverImagenes(['auto']);
	const local = ajustesDeModo('local');
	const fal = nubeImagen();
	const webgl = d.herramientas.webgl;
	return {
		auto: {hoy: `voz ${voz.proveedor}, imágenes ${imagenes.proveedor.join(' > ')}`, falta: [], nota: 'mejora sola cuando llega una clave o un comando propio'},
		nube: {
			hoy: 'voz de ElevenLabs, imágenes con FLUX en fal (fotos libres para la que falle)',
			falta: [CLAVES.elevenlabs, CLAVES.fal].filter((k) => !d.claves[k]).map((k) => `${k} en .env`),
			nota: `costo en tus cuentas: imágenes ~$${fal.dolares} cada una (un minuto de video usa unas 12 a 20); voz por carácter según tu plan de ElevenLabs (un minuto son ~900 caracteres; la voz clonada pide un plan de pago)`,
		},
		local: {
			hoy: `voz ${local.voz}, imágenes ${local.imagenes === 'placas' ? 'ninguna de fuera: modelos 3D del catálogo y dibujos 2D en las plantillas 3D, placas de texto en las de storytelling' : local.imagenes}`,
			falta: [...(webgl === false ? ['WebGL: sin él no se renderizan las plantillas 3D'] : webgl === null ? ['probar WebGL: pnpm asistente --estado --webgl'] : []), ...(local.voz === 'borrador' ? ['una voz: este sistema no trae voz en español; instala una voz propia (ver docs/proveedores.md)'] : [])],
			nota: `recomendada la plantilla ${plantillaPara('local')}; la primera vez se descargan gratis el navegador de render y paquetes de modelos, después no hace falta conexión${d.sistema.gpu.tipo === 'ninguna' ? '; sin tarjeta gráfica renderiza con --ligero' : ''}`,
		},
	};
};

// ---------------------------------------------------------------- state

// Choices this machine cannot use are left out: a provider that needs a command or a server nobody declared.
const disponibles = (d: Diagnostico): Record<Ajuste, [string, string][]> => ({
	modo: Object.entries(OPCIONES.modo),
	voz: Object.entries(OPCIONES.voz).filter(([k]) => k !== 'local' || d.comandos_propios.voz),
	imagenes: Object.entries(OPCIONES.imagenes).filter(([k]) => k !== 'local' || d.comandos_propios.imagen),
	musica: Object.entries(OPCIONES.musica),
	llm: Object.entries(OPCIONES.llm).filter(([k]) => k !== 'local' || d.comandos_propios.llm_local),
});

const estado = (d: Diagnostico) => {
	const m = medios();
	const op = disponibles(d);
	// What `auto` would pick today, whatever is chosen now.
	const voz = resolverVoz('auto');
	const imagenes = resolverImagenes(['auto']);
	const reqs = requisitos(d);
	return {
		primera_vez: primeraVez(),
		maquina: `${d.sistema.plataforma}, ${d.sistema.procesador}, ${d.sistema.memoria_gb} GB de memoria, GPU: ${d.sistema.gpu.nombre}`,
		requisitos: reqs,
		falta_instalar: reqs.filter((r) => r.tipo === 'obligatorio' && r.estado === 'falta').map((r) => r.que),
		claves: d.claves,
		modos: modos(d),
		plantillas: PLANTILLA_IDS.map((id) => {
			const t = plantilla(id);
			const f = d.flujos[t.flujo];
			return {id, nombre: t.nombre, para: t.para, entra: t.entra, estilo: t.estilo ?? null, segundos: t.segundos ?? null, flujo: t.flujo, en_esta_maquina: f.estado, nota: f.nota, recomendada: id === RECOMENDADA};
		}),
		opciones: {modo: Object.fromEntries(op.modo), voz: Object.fromEntries(op.voz), imagenes: Object.fromEntries(op.imagenes), musica: Object.fromEntries(op.musica), llm: Object.fromEntries(op.llm)},
		auto_elige: {voz: `${voz.proveedor} (${voz.porque})`, imagenes: `${imagenes.proveedor.join(' > ')} (${imagenes.porque})`},
		elegido: {modo: preferencias().modo ?? 'auto', plantilla: preferencias().plantilla, estilo: estiloPreferido(), segundos: segundosPreferidos(), voz: m.voz.proveedor, imagenes: m.imagen.proveedores.join(','), musica: m.musica.modo, llm: perfilPorDefecto()},
		recomendado: RECOMENDADO,
	};
};
type Estado = ReturnType<typeof estado>;

const EN_MAQUINA = {listo: 'lista', limitado: 'limitada', falta: 'no disponible'};
const TITULOS: [Exclude<Ajuste, 'modo'>, string][] = [['voz', 'Voz'], ['imagenes', 'Imágenes'], ['musica', 'Música'], ['llm', 'Quién escribe guion, dirección y planos']];

const mostrar = (e: Estado) => {
	console.log(e.primera_vez ? 'Primera vez en esta carpeta: todavía no se ha elegido nada. Lo que sigue son los valores de fábrica.' : `Ya configurado. Modo: ${e.elegido.modo}. Plantilla de siempre: ${e.elegido.plantilla}.`);
	console.log(`Máquina: ${e.maquina}`);
	if (e.falta_instalar.length) console.log(`\nANTES DE SEGUIR falta instalar: ${e.falta_instalar.join(', ')}. Sin eso no sale ningún video (cómo, abajo).`);
	console.log('\n## Lo que necesita tu equipo\n');
	const marca = {listo: 'listo', falta: 'FALTA', 'sin probar': 'sin probar'};
	for (const r of e.requisitos) {
		const estado = r.tipo === 'opcional' && r.estado === 'falta' ? 'no (opcional)' : marca[r.estado];
		console.log(`- ${r.que}: ${estado}. Para ${r.para}${r.estado === 'listo' ? '' : `. Cómo: ${r.como}`}`);
	}
	console.log(`Claves: ${Object.entries(e.claves).map(([k, v]) => `${k} ${v ? 'sí' : 'no'}`).join(', ')}`);
	console.log('\n## Cómo trabajar (modo=)\n');
	for (const id of MODOS_TRABAJO) {
		const m = e.modos[id];
		console.log(`- ${id}${id === 'auto' ? ' (recomendado)' : ''}${id === e.elegido.modo && !e.primera_vez ? ' (ahora)' : ''}: ${e.opciones.modo[id]}`);
		console.log(`  Aquí: ${m.hoy}.${m.falta.length ? ` Falta: ${m.falta.join('; ')}.` : ''} ${m.nota[0].toUpperCase()}${m.nota.slice(1)}.`);
	}
	console.log('\n## Plantillas (plantilla=)\n\n| Plantilla | Nombre | Para qué | Entra | En esta máquina |\n| --- | --- | --- | --- | --- |');
	e.plantillas.forEach((t) => console.log(`| ${t.id}${t.recomendada ? ' (recomendada)' : ''} | ${t.nombre}${t.segundos ? `, ~${t.segundos} s, estilo ${t.estilo}` : ''} | ${t.para} | ${t.entra} | ${EN_MAQUINA[t.en_esta_maquina]}: ${t.nota} |`));
	console.log(`\nAhora: ${e.elegido.plantilla}. En las de storytelling se puede cambiar el estilo (estilo=dinamico|cine|sobrio) y el largo (segundos=15 a 240).`);
	console.log('\nUn modo fija voz, imágenes y quién escribe; cada uno se puede cambiar aparte:');
	for (const [k, titulo] of TITULOS) {
		console.log(`\n## ${titulo} (${k}=)\n`);
		Object.entries(e.opciones[k]).forEach(([id, que]) => console.log(`- ${id}${id === e.elegido[k] ? ' (ahora)' : ''}: ${que}`));
		if (!(e.elegido[k] in e.opciones[k])) console.log(`- ${e.elegido[k]} (ahora)`);
	}
	console.log(`\nCon "auto", hoy saldría: voz ${e.auto_elige.voz}; imágenes ${e.auto_elige.imagenes}.`);
	console.log('\nGuardar lo recomendado:  pnpm asistente --recomendado');
	console.log('Guardar un modo:         pnpm asistente --guardar modo=local plantilla=medida   (o modo=nube, modo=auto)');
};

// After writing: what was saved, what it means on this machine, what to fix before the first video, and the first video.
const siguiente = () => {
	const d = diagnosticar();
	const e = estado(d);
	const t = plantilla(e.elegido.plantilla);
	const f = d.flujos[t.flujo];
	const modo = e.elegido.modo as ModoTrabajo;
	console.log(`\nGuardado. Modo: ${modo}. Plantilla: ${e.elegido.plantilla} (${t.nombre}${t.flujo === 'storytelling' ? `, estilo ${e.elegido.estilo}, ~${e.elegido.segundos} s` : ''}).`);
	console.log(`Voz: ${e.elegido.voz}${e.elegido.voz === 'auto' ? ` → ${e.auto_elige.voz}` : ''}`);
	console.log(`Imágenes: ${e.elegido.imagenes}${e.elegido.imagenes === 'auto' ? ` → ${e.auto_elige.imagenes}` : ''}`);
	console.log(`Música: ${e.elegido.musica}. Escribe: ${e.elegido.llm}.`);

	const avisos: string[] = [];
	for (const r of e.requisitos) if (r.tipo === 'obligatorio' && r.estado === 'falta') avisos.push(`instala ${r.que}: ${r.como}`);
	const placas = e.elegido.imagenes === 'placas' && t.flujo === 'storytelling';
	if (placas) avisos.push(`sin imágenes de fuera, ${e.elegido.plantilla} sale con placas de texto en vez de imágenes; las que dibujan las suyas son ${PLANTILLAS_SIN_FOTOS.join(', ')}: pnpm asistente --guardar plantilla=${plantillaPara('local')}`);
	else if (f.estado !== 'listo') avisos.push(`la plantilla ${e.elegido.plantilla} está ${EN_MAQUINA[f.estado]} en esta máquina: ${f.nota}`);
	const falta = (variable: string, para: string) => !d.claves[variable] && avisos.push(`${para} pide ${variable} en .env (copia de .env.example); sin ella, el video se detiene`);
	if (e.elegido.voz === 'elevenlabs') falta(CLAVES.elevenlabs, 'la voz de ElevenLabs');
	if (e.elegido.imagenes.split(',').includes('nube')) falta(CLAVES.fal, 'generar imágenes con FLUX');
	if (e.elegido.llm === 'openrouter') falta(CLAVES.openrouter, 'escribir con OpenRouter');
	if (e.elegido.llm === 'deepseek') falta(CLAVES.deepseek, 'escribir con DeepSeek');
	if (e.elegido.voz === 'local' && !d.comandos_propios.voz) avisos.push('la voz "local" pide un comando de voz en config/local.json (ver config/local.example.json)');
	if (e.elegido.imagenes.split(',').includes('local') && !d.comandos_propios.imagen) avisos.push('las imágenes "local" piden un comando de imagen en config/local.json (ver config/local.example.json)');
	if (PLANTILLAS_SIN_FOTOS.includes(e.elegido.plantilla) && e.elegido.plantilla !== 'datos' && d.herramientas.webgl === null) avisos.push('prueba una vez que el navegador dé WebGL: pnpm asistente --estado --webgl (medio minuto)');
	if (d.herramientas.webgl === false && PLANTILLAS_SIN_FOTOS.includes(e.elegido.plantilla) && e.elegido.plantilla !== 'datos') avisos.push(`WebGL no funciona aquí y ${e.elegido.plantilla} es 3D: ${e.requisitos.find((r) => r.tipo === '3d')?.como}`);
	if (avisos.length) console.log(`\nAntes del primer video:\n- ${avisos.join('\n- ')}`);

	console.log(`\nTu primer video (${t.entra}):\n  pnpm video ${t.ejemplo}${modo === 'local' && d.sistema.gpu.tipo === 'ninguna' && t.flujo === 'estudio' ? ' --ligero' : ''}`);
	console.log(`Sale en ${FLUJOS[t.flujo].sale}. Otra plantilla solo para un video: añade --plantilla <id>. Cambiar lo elegido: pnpm asistente.`);
	// What would raise the quality, in the way of working chosen: keys for the cloud, programs for the local mode.
	const mejoras =
		modo === 'local'
			? e.requisitos.filter((r) => r.tipo === 'opcional' && r.estado === 'falta').map((r) => `${r.que} (${r.para}): ${r.como}`)
			: [!d.claves[CLAVES.elevenlabs] && `${CLAVES.elevenlabs} (voz natural)`, !d.claves[CLAVES.fal] && `${CLAVES.fal} (imágenes hechas para cada plano con FLUX)`].filter((x): x is string => Boolean(x));
	if (mejoras.length) console.log(modo === 'local' ? `Opcional, en tu equipo y sin costo:\n- ${mejoras.join('\n- ')}` : `Opcional, para subir la calidad: pon en .env ${mejoras.join(' y ')}.`);
};

// ---------------------------------------------------------------- in a terminal

// One question in the terminal: numbered answers, the first is the recommended one and Enter takes it.
const preguntar = async (rl: ReturnType<typeof createInterface>, titulo: string, opciones: [string, string][], marca = 'recomendado') => {
	console.log(`\n${titulo}`);
	opciones.forEach(([id, que], i) => console.log(`  ${i + 1}. ${id}${i === 0 ? ` (${marca})` : ''}: ${que}`));
	for (;;) {
		const r = (await rl.question(`Elige 1-${opciones.length} [1]: `)).trim();
		if (!r) return opciones[0][0];
		const n = Number(r);
		if (Number.isInteger(n) && n >= 1 && n <= opciones.length) return opciones[n - 1][0];
		const porNombre = opciones.find(([id]) => id === r);
		if (porNombre) return porNombre[0];
		console.log('  Escribe el número de una opción, o Enter para la primera.');
	}
};

const main = async () => {
	if (args.includes('--guardar')) {
		const eleccion = Object.fromEntries(args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
		if (!Object.keys(eleccion).length) throw new Error('--guardar pide al menos una elección, por ejemplo: pnpm asistente --guardar modo=local plantilla=medida');
		guardarEleccion(eleccion);
		return siguiente();
	}
	if (args.includes('--recomendado')) {
		// Back to the recommended answers: a style, a length or a writer chosen before is forgotten too.
		guardarEleccion({...RECOMENDADO}, {deCero: true});
		return siguiente();
	}
	const d = diagnosticar();
	const e = estado(d);
	if (args.includes('--json')) return console.log(JSON.stringify(e, null, 1));
	if (args.includes('--estado') || !process.stdin.isTTY) return mostrar(e);

	// In a terminal, with a person: what is missing first, then the way of working, then the rest, each question
	// with its recommended answer first. A way of working other than auto already sets voice and pictures.
	console.log('Asistente de idea-a-video. Enter acepta la opción recomendada.');
	console.log(`Tu máquina: ${e.maquina}`);
	if (e.falta_instalar.length) {
		console.log('\nAntes de hacer videos falta instalar:');
		e.requisitos.filter((r) => r.tipo === 'obligatorio' && r.estado === 'falta').forEach((r) => console.log(`- ${r.que}: ${r.como}`));
		console.log('Puedes elegir ahora y tenerlo listo después.');
	}
	const rl = createInterface({input: process.stdin, output: process.stdout});
	const primero = (lista: [string, string][], id: string) => [...lista.filter(([k]) => k === id), ...lista.filter(([k]) => k !== id)];
	const op = disponibles(d);
	const modo = (await preguntar(
		rl,
		'¿Cómo quieres trabajar?',
		op.modo.map(([id, que]): [string, string] => [id, `${que}. Aquí: ${e.modos[id as ModoTrabajo].hoy}${e.modos[id as ModoTrabajo].falta.length ? `; falta ${e.modos[id as ModoTrabajo].falta.join(', ')}` : ''}`]),
	)) as ModoTrabajo;
	const plantillas = e.plantillas.map((t): [string, string] => [t.id, `${t.nombre}${t.segundos ? ` (~${t.segundos} s)` : ''}: ${t.para}. Aquí: ${EN_MAQUINA[t.en_esta_maquina]}${t.en_esta_maquina === 'listo' ? '' : ` (${t.nota})`}`]);
	const eleccion: Record<string, string> = {modo, plantilla: await preguntar(rl, '¿Qué tipo de video harás más seguido? (se puede cambiar en cada video)', primero(plantillas, plantillaPara(modo)))};
	if (modo === 'auto') {
		eleccion.voz = await preguntar(rl, `¿De dónde sale la voz? Con "auto", hoy sería: ${e.auto_elige.voz}`, primero(op.voz, 'auto'));
		eleccion.imagenes = await preguntar(rl, `¿De dónde salen las imágenes? Con "auto", hoy sería: ${e.auto_elige.imagenes}`, primero(op.imagenes, 'auto'));
	}
	eleccion.musica = await preguntar(rl, '¿Música de fondo?', primero(op.musica, 'pistas'));
	if (modo !== 'local') eleccion.llm = await preguntar(rl, '¿Quién escribe el guion, la dirección y los planos?', primero(op.llm, e.elegido.llm in OPCIONES.llm ? e.elegido.llm : 'sesion'), e.elegido.llm === 'sesion' ? 'recomendado' : 'como está ahora');
	rl.close();
	guardarEleccion(eleccion);
	siguiente();
};

main().catch((e) => {
	// Ctrl+C or Ctrl+D in the middle of the questions: nothing was written.
	console.error(e?.code === 'ABORT_ERR' ? '\nAsistente cancelado: no se guardó nada. Para aceptar lo recomendado sin preguntas: pnpm asistente --recomendado' : String(e?.message ?? e));
	process.exit(1);
});
