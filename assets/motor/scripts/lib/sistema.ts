// What the flows ask of the operating system, written once so they behave the same on macOS, Linux and Windows:
// running the project's own tools without a shell, a temp folder inside the project, waiting, and unpacking a zip.
import {execFileSync, spawnSync, type ExecFileSyncOptions} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

// The project's own command-line tools, run with this same Node: no npx, no .cmd wrappers, no PATH lookups.
const REMOTION = path.resolve('node_modules/@remotion/cli/remotion-cli.js');
const TSX = path.resolve('node_modules/tsx/dist/cli.mjs');

// Without a terminal to watch, a render's progress is hundreds of lines nobody reads: only errors are printed.
export const remotion = (args: string[], opciones: ExecFileSyncOptions = {stdio: 'inherit'}) =>
	execFileSync(process.execPath, [REMOTION, ...args, ...(args[0] === 'render' && !process.stdout.isTTY && !args.some((a) => a.startsWith('--log')) ? ['--log=error'] : [])], opciones);

// A script of the project, as its own process, with its exit code.
export const tsx = (script: string, args: string[]) => spawnSync(process.execPath, [TSX, script, ...args], {stdio: 'inherit'}).status ?? 1;

// A plain JavaScript file of the project.
export const nodo = (script: string, args: string[], opciones: ExecFileSyncOptions = {stdio: 'inherit'}) => execFileSync(process.execPath, [script, ...args], opciones);

// Render bundles copy public/, and the system temp folder may be small or live in memory: the project keeps its own.
// Node reads TMPDIR on macOS and Linux, and TEMP or TMP on Windows.
export const carpetaTemporal = () => {
	const dir = path.resolve('out/tmp');
	mkdirSync(dir, {recursive: true});
	process.env.TMPDIR = process.env.TEMP = process.env.TMP = dir;
	return dir;
};

// Waits without spawning anything.
export const dormir = (segundos: number) => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(segundos * 1000));

// Unpacks the members of a zip that match the patterns. Windows ships tar, which reads zip files; the others ship unzip.
export const descomprimir = (zip: string, patrones: string[], destino: string) => {
	mkdirSync(destino, {recursive: true});
	if (process.platform === 'win32') execFileSync('tar', ['-xf', zip, '-C', destino, ...patrones]);
	else execFileSync('unzip', ['-o', '-q', zip, ...patrones, '-d', destino]);
};
