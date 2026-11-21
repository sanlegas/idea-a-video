// What this machine has of its own, beyond what every machine has: commands that narrate, draw, cut out, time words
// or build 3D models on local hardware, a local LLM server and a browser to render with. All of it is optional and
// comes from config/local.json, a file that describes one machine and never travels with the project. Without it the
// flows use cloud providers or the alternatives that need no key.
//
// A command is a list: the program and its first arguments. Each kind has a contract, so any local model fits:
//   voz       <lineas.json> <carpeta>          one audio per line: beat_00.wav, beat_01.wav… (VOZ in the environment names the voice)
//   imagen    <pedidos.json> <carpeta> [modelo] one <id>.png per request; requests are [{id, prompt, wide, tall, seed}]
//   recorte   <trabajos.json>                  cuts each {from, to} out of its background and prints {"to", "aspect"} per line
//   tiempos   <audio> <salida.json>            writes [{text, start, end}], one entry per word heard
//   modelo3d  <imagen.png> <modelo.glb> […]    pairs of picture and model; flags of `reintentos` go after the pairs
import {execFileSync, type ExecFileSyncOptions} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';

export type Comando = string[];

export type Local = {
	voz?: {comando: Comando; voz?: string};
	// segundos: how long one picture takes here, for the estimates of --plan.
	imagen?: {comando: Comando; modelo?: string; segundos?: number};
	recorte?: {comando: Comando};
	tiempos?: {comando: Comando};
	// reintentos: flags to try again with, in order, when a model fails (for example, a smaller resolution).
	// mb_libres: megabytes of GPU memory to wait for before each try, on a GPU shared with other work.
	modelo3d?: {comando: Comando; reintentos?: string[][]; mb_libres?: number};
	// url: an OpenAI-compatible server. cargar and descargar swap models on a GPU that fits one at a time; {modelo} is replaced.
	// perfil: the profile of config/models.json this machine uses when a run names none.
	llm?: {url?: string; perfil?: string; cargar?: Comando; descargar?: Comando};
	// Runs before a flow that uses anything local: starts servers, checks models, and fails saying what is missing.
	preparar?: Comando;
	// Runs after each local command, to give the GPU back.
	liberar?: Comando;
	// whisper.cpp: the program and its model file, for timing words when there is no `tiempos` command.
	whisper?: {cli?: string; modelo?: string};
	// Variables this machine keeps under another name: {"OPENROUTER_API_KEY": "MI_NOMBRE"}.
	claves?: Record<string, string>;
	// A browser for the renders, when the one Remotion downloads is not wanted; gl is its --gl option.
	chrome?: {ruta?: string; gl?: string};
	// Blender, when it is not where its installer usually puts it: new 3D models built by code (pnpm blender).
	blender?: {ruta?: string};
};

const ARCHIVO = 'config/local.json';
let leido: Local | null = null;

export const local = (): Local => (leido ??= existsSync(ARCHIVO) ? (JSON.parse(readFileSync(ARCHIVO, 'utf8')) as Local) : {});

// ~ at the start of a program or an argument is the home folder.
export const ruta = (s: string) => (s.startsWith('~/') ? `${homedir()}/${s.slice(2)}` : s);

export const correr = (comando: Comando, args: string[] = [], opciones: ExecFileSyncOptions = {}) => {
	const [programa, ...fijos] = comando.map(ruta);
	return execFileSync(programa, [...fijos, ...args], opciones);
};

// Gives the GPU back after local work, if this machine says how. Never stops a run: the work is already done.
export const liberar = () => {
	const c = local().liberar;
	if (!c) return;
	try {
		correr(c, [], {stdio: 'ignore'});
	} catch {
		// nothing to do: the next local command will find the memory it finds
	}
};

// The model file whisper.cpp reads: the one this machine names, or the one the installer leaves in the cache.
export const WHISPER_MODELO = `${homedir()}/.cache/idea-a-video/whisper/ggml-small.bin`;
export const whisper = () => {
	const w = local().whisper ?? {};
	return {cli: w.cli ?? 'whisper-cli', modelo: ruta(w.modelo ?? WHISPER_MODELO)};
};

// What to tell someone who asks for a local provider this machine does not have.
export const sinLocal = (que: string, alternativa: string) => new Error(`${que} con un modelo local necesita un comando en ${ARCHIVO} (ver config/local.example.json): esta máquina no lo tiene. ${alternativa}`);

// The browser renders run in: the one this machine names, or the one Remotion downloads. 3D scenes need WebGL, which
// Chrome gives through ANGLE; on Linux without a display that is its EGL backend.
export const navegador = () => {
	const c = local().chrome ?? {};
	return {gl: (c.gl ?? (process.platform === 'linux' ? 'angle-egl' : 'angle')) as 'angle' | 'angle-egl' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan', ejecutable: c.ruta ? ruta(c.ruta) : null};
};
