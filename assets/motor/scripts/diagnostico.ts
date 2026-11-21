// What this machine can run: its hardware and tools, which keys it has (names only, never values), which local
// commands it declares, what `auto` will pick for each piece, and what each flow can do with that.
// usage: pnpm diagnostico [--json] [--webgl]
//   --json   the same facts as data, for a program to read
//   --webgl  also renders one 3D frame, to prove the browser gives WebGL here (takes about half a minute)
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {oido} from './estudio/lib/palabras';
import {clave, CLAVES, variable, type Servicio} from './lib/claves';
import {tiene} from './lib/entorno';
import {perfilPorDefecto} from './lib/llm';
import {local, navegador, whisper} from './lib/local';
import {medios, resolverImagenes, resolverVoz} from './lib/medios';
import {ensurePack} from './lib/kenney';
import {carpetaTemporal, remotion} from './lib/sistema';
import {FLUJOS} from './lib/flujos';
import {catalogoKit} from './lib/modelos';
import {buscarBlender} from './lib/blender';

const args = process.argv.slice(2);
const sale = (programa: string, a: string[]) => {
	try {
		return execFileSync(programa, a, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
	} catch {
		return null;
	}
};

// ---------------------------------------------------------------- facts

const gb = (bytes: number) => +(bytes / 1e9).toFixed(1);
const gpu = () => {
	const nvidia = sale('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
	if (nvidia) {
		const [nombre, mb] = nvidia.split('\n')[0].split(',').map((x) => x.trim());
		return {tipo: 'nvidia', nombre, memoria_gb: +(Number(mb) / 1024).toFixed(1)};
	}
	// Apple Silicon shares its memory between processor and graphics.
	if (process.platform === 'darwin' && process.arch === 'arm64') return {tipo: 'apple', nombre: os.cpus()[0]?.model ?? 'Apple Silicon', memoria_gb: gb(os.totalmem())};
	return {tipo: 'ninguna', nombre: 'sin GPU dedicada detectada', memoria_gb: 0};
};

const {bavail, bsize} = statfsSync('.');
const l = local();
const claves = Object.fromEntries((Object.keys(CLAVES) as Servicio[]).map((s) => [CLAVES[s], Boolean(clave(s))]));
const voz = resolverVoz(medios().voz.proveedor);
const imagenes = resolverImagenes(medios().imagen.proveedores);
const oye = oido();
const perfil = perfilPorDefecto();
const blender = buscarBlender();

// One 3D frame of the sample film through the same browser the flows use. Slow, so only on request; the sample
// uses furniture of the catalogue, which is downloaded the first time. The answer is kept, with the browser settings
// it was measured with, so later diagnoses report it without rendering again.
const PRUEBA_WEBGL = 'out/diagnostico_webgl.json';
const webgl = async (): Promise<boolean | null> => {
	const ajuste = `${navegador().gl}|${navegador().ejecutable ?? ''}`;
	if (!args.includes('--webgl')) {
		if (!existsSync(PRUEBA_WEBGL)) return null;
		const antes = JSON.parse(readFileSync(PRUEBA_WEBGL, 'utf8')) as {funciona: boolean; ajuste: string};
		return antes.ajuste === ajuste ? antes.funciona : null;
	}
	carpetaTemporal();
	const cuadro = 'out/tmp/diagnostico_webgl.png';
	rmSync(cuadro, {force: true});
	let funciona = false;
	try {
		await ensurePack('muebles');
		remotion(['still', 'src/tinta/index.tsx', 'PeliculaTinta', cuadro, '--frame=10', '--scale=0.25', `--gl=${navegador().gl}`, '--log=error', ...(navegador().ejecutable ? [`--browser-executable=${navegador().ejecutable}`] : [])], {stdio: 'ignore'});
		funciona = existsSync(cuadro);
	} catch {
		funciona = false;
	}
	writeFileSync(PRUEBA_WEBGL, JSON.stringify({funciona, ajuste, fecha: new Date().toISOString().slice(0, 10)}));
	return funciona;
};
// Everything below waits for that frame, so it lives in one function.
const main = async () => {
	const pruebaWebgl = await webgl();

	const hechos = {
		sistema: {plataforma: `${process.platform} ${process.arch}`, procesador: os.cpus()[0]?.model ?? '?', nucleos: os.cpus().length, memoria_gb: gb(os.totalmem()), disco_libre_gb: gb(bavail * bsize), gpu: gpu()},
		herramientas: {
			node: process.version,
			pnpm: sale('pnpm', ['-v']),
			ffmpeg: tiene('ffmpeg'),
			ffprobe: tiene('ffprobe'),
			python3: tiene('python3'),
			navegador_de_render: navegador().ejecutable ?? (existsSync('node_modules/.remotion') ? 'el de Remotion, ya descargado' : 'el de Remotion; se descarga en el primer render'),
			webgl: pruebaWebgl,
			whisper: oye === 'whisper' ? `${whisper().cli} con ${path.basename(whisper().modelo)}` : oye === 'comando' ? 'comando propio' : null,
			// New 3D models built by code for estudio (pnpm blender): no picture generator involved.
			blender: blender ? `${blender.version}${blender.vieja ? ' (vieja)' : ''}` : null,
		},
		claves,
		comandos_propios: {voz: Boolean(l.voz), imagen: Boolean(l.imagen), recorte: Boolean(l.recorte), tiempos: Boolean(l.tiempos), modelo3d: Boolean(l.modelo3d), llm_local: Boolean(l.llm?.url ?? variable('LM_BASE'))},
		eleccion: {
			llm: perfil,
			voz: voz.proveedor,
			voz_porque: voz.porque,
			imagenes: imagenes.proveedor,
			imagenes_porque: imagenes.porque,
			tiempos_de_palabra: voz.proveedor === 'elevenlabs' ? 'los que da ElevenLabs con el audio' : oye ? 'medidos' : 'estimados dentro de cada frase',
			objetos_3d_nuevos: l.modelo3d ? 'comando propio' : 'no: catálogo, construcciones y personaje',
			modelos_por_codigo: blender ? 'Blender: pnpm estudio los construye solo para cada video (el LLM escribe cada modelo)' : 'no: sin Blender, solo los del catálogo',
		},
	};

	// ---------------------------------------------------------------- what each flow can do with that

	type Estado = 'listo' | 'limitado' | 'falta';
	const base = hechos.herramientas.ffmpeg && Number(process.versions.node.split('.')[0]) >= 20;
	const sinBase = 'instala ffmpeg y Node 20 o más nuevo';
	const dibuja = imagenes.proveedor.some((p) => p === 'local' || p === 'nube');
	const soloPlacas = imagenes.proveedor.every((p) => p === 'placas');
	const conVoz = voz.proveedor !== 'borrador';
	const vozFalta = `sin voz (pon ${CLAVES.elevenlabs} en .env, o un comando de voz en config/local.json)`;
	const sesion = perfil === 'sesion';

	const flujos: Record<string, {estado: Estado; nota: string}> = {
		explica: base ? {estado: 'listo', nota: 'no necesita voz, imágenes ni LLM'} : {estado: 'falta', nota: sinBase},
		storytelling: !base
			? {estado: 'falta', nota: sinBase}
			: conVoz && !soloPlacas
				? {estado: 'listo', nota: `voz ${voz.proveedor}, imágenes ${imagenes.proveedor.join(' > ')}${oye ? '' : '; tiempos de palabra estimados'}`}
				: {estado: 'limitado', nota: `${conVoz ? `voz ${voz.proveedor}` : vozFalta}; ${soloPlacas ? `sin imágenes: placas de texto (con ${CLAVES.fal}, fotos libres o un comando de imagen salen imágenes)` : `imágenes ${imagenes.proveedor.join(' > ')}`}`},
		tinta: !base ? {estado: 'falta', nota: sinBase} : {estado: conVoz ? 'listo' : 'limitado', nota: `${conVoz ? `voz ${voz.proveedor}` : vozFalta}; objetos: ${hechos.eleccion.objetos_3d_nuevos}; pide WebGL`},
		plantillas: !base ? {estado: 'falta', nota: sinBase} : {estado: conVoz ? 'listo' : 'limitado', nota: `${conVoz ? `voz ${voz.proveedor}` : vozFalta}; pide WebGL`},
		estudio: !base
			? {estado: 'falta', nota: sinBase}
			: !dibuja
				? {estado: 'limitado', nota: [`modo local: escenas con ${Object.keys(catalogoKit()).length} modelos 3D del catálogo${blender ? ', modelos nuevos que el asistente construye en Blender' : ''} y dibujos 2D hechos con código, sin imágenes generadas (con ${CLAVES.fal} o un comando de imagen se suman objetos realistas)`, conVoz ? `voz ${voz.proveedor}` : vozFalta, ...(sesion ? ['con el asistente de la sesión es lento: varias rondas por escena'] : []), 'pide WebGL; sin GPU usa --ligero'].join('; ')}
				: {estado: conVoz && !sesion ? 'listo' : 'limitado', nota: [conVoz ? `voz ${voz.proveedor}` : vozFalta, l.recorte ? 'recorte con comando propio' : 'recorte simple (fondo negro a transparente)', ...(blender ? ['modelos nuevos con Blender'] : []), ...(sesion ? ['con el asistente de la sesión es lento: varias rondas por escena; va mejor con una clave de LLM'] : []), 'pide WebGL'].join('; ')},
		'desde-video': !base ? {estado: 'falta', nota: sinBase} : oye ? {estado: 'listo', nota: `oye con ${hechos.herramientas.whisper}; describe con el LLM ${perfil}`} : {estado: 'falta', nota: 'necesita oír la voz del video: instala whisper.cpp y su modelo (ver whisper en config/local.example.json)'},
	};

	// A copy of the engine may leave a flow out: only the flows it has are reported.
	for (const id of Object.keys(flujos)) if (!FLUJOS[id]) delete flujos[id];

	// ---------------------------------------------------------------- output

	if (args.includes('--json')) {
		console.log(JSON.stringify({...hechos, flujos}, null, 1));
		return;
	}

	const s = hechos.sistema;
	const h = hechos.herramientas;
	const si = (b: unknown) => (b ? 'sí' : 'no');
	console.log(`Máquina: ${s.plataforma}, ${s.procesador}, ${s.nucleos} núcleos, ${s.memoria_gb} GB de memoria, ${s.disco_libre_gb} GB libres`);
	console.log(`GPU: ${s.gpu.nombre}${s.gpu.memoria_gb ? ` (${s.gpu.memoria_gb} GB${s.gpu.tipo === 'apple' ? ' compartidos' : ''})` : ''}`);
	console.log(`Herramientas: Node ${h.node}, pnpm ${h.pnpm ?? 'no'}, ffmpeg ${si(h.ffmpeg)}, python3 ${si(h.python3)}, whisper ${h.whisper ?? 'no'}, Blender ${h.blender ?? 'no'}`);
	console.log(`Navegador de render: ${h.navegador_de_render}${h.webgl === null ? '' : `; WebGL ${h.webgl ? 'funciona' : 'NO funciona'}`}`);
	console.log(`Claves en el entorno o en .env: ${Object.entries(claves).map(([n, v]) => `${n} ${si(v)}`).join(', ')}`);
	console.log(`Comandos propios (config/local.json): ${Object.entries(hechos.comandos_propios).filter(([, v]) => v).map(([n]) => n).join(', ') || 'ninguno'}`);
	console.log('\nLo que elige "auto" aquí:');
	console.log(`- LLM: ${perfil}${sesion ? ' (el asistente de la sesión; sin clave)' : ''}`);
	console.log(`- Voz: ${voz.proveedor} (${voz.porque})`);
	console.log(`- Imágenes: ${imagenes.proveedor.join(' > ')} (${imagenes.porque})`);
	console.log(`- Tiempos de palabra: ${hechos.eleccion.tiempos_de_palabra}`);
	console.log(`- Objetos 3D nuevos (de una imagen): ${hechos.eleccion.objetos_3d_nuevos}`);
	console.log(`- Modelos 3D por código: ${hechos.eleccion.modelos_por_codigo}`);
	console.log('\n| Flujo | Estado | Con qué |\n| --- | --- | --- |');
	Object.entries(flujos).forEach(([id, f]) => console.log(`| ${id} | ${f.estado} | ${f.nota} |`));
	if (h.webgl === null) console.log('\nTinta, Plantillas y Estudio renderizan en 3D: `pnpm diagnostico --webgl` comprueba que el navegador dé WebGL en esta máquina.');
};

main();
