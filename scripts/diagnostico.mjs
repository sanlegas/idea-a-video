#!/usr/bin/env node
// Runs the diagnosis of an installed engine from anywhere: what the machine has, what "auto" will pick, and what each
// flow can do. Changes nothing.
// usage: node diagnostico.mjs [carpeta del motor] [--json] [--webgl]
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const motor = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const tsx = path.join(motor, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!existsSync(path.join(motor, 'scripts', 'diagnostico.ts')) || !existsSync(tsx)) {
	console.error(`No hay un motor instalado en ${motor}. Instálalo con  node instalar.mjs <carpeta>  y repite.`);
	process.exit(1);
}
// The engine's own tools run with this same Node: no shell, no PATH lookups.
const r = spawnSync(process.execPath, [tsx, 'scripts/diagnostico.ts', ...args.filter((a) => a.startsWith('--'))], {cwd: motor, stdio: 'inherit'});
process.exit(r.status ?? 1);
