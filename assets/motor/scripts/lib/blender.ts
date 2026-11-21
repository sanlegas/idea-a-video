// Blender on this machine, for building new 3D models by code (scripts/blender.ts). The program is the one
// config/local.json names ({"blender": {"ruta": "…"}}), or the BLENDER variable, or the usual install places of each
// system, or `blender` on the PATH. It runs with no window, so any machine that installs it can use it.
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {local, ruta} from './local';

// The oldest version the pieces in scripts/blender/juguete.py are written for (4.2 is a long-term release).
export const BLENDER_MINIMO = [4, 2];

const candidatos = (): string[] => {
	const propios = [local().blender?.ruta, process.env.BLENDER].filter((x): x is string => Boolean(x)).map(ruta);
	if (process.platform === 'darwin') return [...propios, '/Applications/Blender.app/Contents/MacOS/Blender', `${homedir()}/Applications/Blender.app/Contents/MacOS/Blender`, 'blender'];
	if (process.platform === 'win32') {
		// The installer puts each version in its own folder: the newest first.
		const raiz = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Blender Foundation');
		const versiones = existsSync(raiz) ? readdirSync(raiz).sort().reverse().map((d) => path.join(raiz, d, 'blender.exe')) : [];
		return [...propios, ...versiones, 'blender'];
	}
	return [...propios, 'blender', '/snap/bin/blender', '/usr/bin/blender'];
};

export type Blender = {ruta: string; version: string; vieja: boolean};

let hallado: Blender | null | undefined;

// The first candidate that answers --version. Asked once per process: Blender takes about a second to answer.
export const buscarBlender = (): Blender | null => {
	if (hallado !== undefined) return hallado;
	hallado = null;
	for (const c of candidatos()) {
		if (c.includes(path.sep) && !existsSync(c)) continue;
		try {
			const salida = execFileSync(c, ['--version'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000});
			const m = salida.match(/Blender (\d+)\.(\d+)(?:\.(\d+))?/);
			if (!m) continue;
			const [mayor, menor] = [Number(m[1]), Number(m[2])];
			hallado = {ruta: c, version: m[0].replace('Blender ', ''), vieja: mayor < BLENDER_MINIMO[0] || (mayor === BLENDER_MINIMO[0] && menor < BLENDER_MINIMO[1])};
			break;
		} catch {
			// not there, or not Blender: try the next one
		}
	}
	return hallado;
};

// How to install it on this system, in one line.
export const instalarBlender = () =>
	({
		darwin: 'brew install --cask blender, o bájalo de https://www.blender.org/download',
		win32: 'winget install BlenderFoundation.Blender, o bájalo de https://www.blender.org/download',
		linux: 'sudo snap install blender --classic, o bájalo de https://www.blender.org/download (si queda fuera del PATH, pon su ruta en config/local.json: {"blender": {"ruta": "…"}})',
	})[process.platform as 'darwin' | 'win32' | 'linux'] ?? 'bájalo de https://www.blender.org/download';

// Builds the models of one script (MODELOS table, pieces of scripts/blender/juguete.py) into carpeta, with no window:
// <nombre>.glb, two previews and anclas.json/modelos.json there. salida keeps what matters of Blender's talk: one line
// per model, the warnings and, when it fails, the Python error.
export const construirModelos = (blender: Blender, script: string, carpeta: string, nombres: string[] = []): {ok: boolean; salida: string} => {
	mkdirSync(carpeta, {recursive: true});
	const r = spawnSync(blender.ruta, ['-b', '--factory-startup', '--python-exit-code', '2', '--python', 'scripts/blender/correr.py', '--', script, carpeta, ...nombres], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
	const lineas = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n');
	const propias = lineas.filter((l) => /^(modelo |AVISO )/.test(l));
	if (r.status === 0) return {ok: true, salida: propias.join('\n')};
	const i = lineas.findIndex((l) => /^(FALLA|Traceback)/.test(l));
	const error = (i >= 0 ? lineas.slice(i) : lineas.slice(-30)).filter((l) => l && !/^(Blender quit|Blender \d|Fra:|Saved:|Time:|Error: script failed)/.test(l));
	return {ok: false, salida: [...propias, ...error].join('\n') || `Blender terminó con código ${r.status ?? r.signal}`};
};

// Code a model writes for Blender runs on this machine, so it may only build shapes: the pieces of juguete.py, math and
// random. No other import, no files, no dunder tricks, no direct bpy. Returns what is wrong; empty means it may run.
const IMPORTS_PERMITIDOS = /^\s*(?:import (?:math|random)|from (?:math|random|juguete|mathutils) import [\w, ()*]+)\s*$/;
const PROHIBIDO_PY: [RegExp, string][] = [
	[/__/, 'nombres con doble guion bajo'],
	[/\b(?:open|exec|eval|compile|globals|locals|vars|getattr|setattr|delattr|input|breakpoint|exit|quit|help|memoryview)\s*\(/, 'funciones que salen de construir formas'],
	[/\b(?:bpy|bmesh|os|sys|subprocess|socket|shutil|pathlib|importlib|json|pickle|urllib|requests|ctypes|threading|runpy|builtins)\b/, 'módulos del sistema o de Blender: usa solo las piezas de juguete'],
];
export const revisarCodigoModelo = (codigo: string): string[] => {
	const problemas: string[] = [];
	codigo.split('\n').forEach((l, k) => {
		if (/^\s*(?:import|from)\s/.test(l) && !IMPORTS_PERMITIDOS.test(l)) problemas.push(`línea ${k + 1}: import no permitido (${l.trim().slice(0, 60)}); solo math, random, mathutils y juguete`);
	});
	for (const [re, que] of PROHIBIDO_PY) {
		const m = codigo.match(re);
		if (m) problemas.push(`usa ${m[0].trim()}: ${que}`);
	}
	if (!/^def construir\(\s*\)\s*:/m.test(codigo)) problemas.push('falta la función def construir(): que arma el modelo');
	return problemas;
};
