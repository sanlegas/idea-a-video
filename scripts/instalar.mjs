#!/usr/bin/env node
// Installs the engine of the skill in a working folder: copies it, installs its dependencies, brings the fonts and
// the music library, and the first time opens the first-use assistant (later runs show the diagnosis). Safe to
// repeat: it updates the code and never touches what is the user's (keys, settings, choices, guiones, runs).
// usage: node instalar.mjs [carpeta destino] [--sin-musica] [--sin-asistente]
// Plain Node, no dependencies, so it runs the same on macOS, Linux and Windows.
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const destino = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'idea-a-video');
const motor = path.join(skill, 'assets', 'motor');

const mayor = Number(process.versions.node.split('.')[0]);
if (mayor < 20) {
	console.error(`Hace falta Node 20 o más nuevo; este es ${process.version}. Instálalo de https://nodejs.org y repite.`);
	process.exit(1);
}
if (!existsSync(motor)) {
	console.error(`No encuentro el motor en ${motor}: la carpeta de la skill está incompleta.`);
	process.exit(1);
}

// Files that belong to the user once they exist: an update leaves them as they are.
const DEL_USUARIO = new Set(['.env', path.join('config', 'local.json'), path.join('config', 'preferencias.json'), path.join('config', 'medios.json'), path.join('config', 'models.json')]);
const todos = (dir, base = dir) => readdirSync(dir).flatMap((n) => {
	const f = path.join(dir, n);
	return statSync(f).isDirectory() ? todos(f, base) : [path.relative(base, f)];
});

const nuevo = !existsSync(path.join(destino, 'package.json'));
mkdirSync(destino, {recursive: true});
let copiados = 0;
for (const rel of todos(motor)) {
	const a = path.join(destino, rel);
	if (existsSync(a) && (DEL_USUARIO.has(rel) || rel.startsWith(`guiones${path.sep}`))) continue;
	mkdirSync(path.dirname(a), {recursive: true});
	cpSync(path.join(motor, rel), a);
	copiados++;
}
// The documentation goes along, for assistants that read instructions from the working folder.
cpSync(path.join(skill, 'references'), path.join(destino, 'docs'), {recursive: true});
console.log(`${nuevo ? 'Motor instalado' : 'Motor actualizado'} en ${destino} (${copiados} archivos)`);

// Windows runs npm-installed tools through .cmd files, which need a shell.
const correr = (programa, a, opciones = {}) => spawnSync(programa, a, {cwd: destino, stdio: 'inherit', shell: process.platform === 'win32', ...opciones});
const responde = (programa, a) => correr(programa, a, {stdio: 'ignore'}).status === 0;

const pnpm = responde('pnpm', ['--version']) ? ['pnpm'] : responde('corepack', ['pnpm', '--version']) ? ['corepack', 'pnpm'] : null;
if (!pnpm) {
	console.error('\nFalta pnpm. Instálalo con  npm install -g pnpm  (o  corepack enable pnpm ) y repite este comando.');
	process.exit(1);
}
const paso = (titulo, a, {obligatorio = true} = {}) => {
	console.log(`\n== ${titulo}`);
	const r = correr(pnpm[0], [...pnpm.slice(1), ...a]);
	if (r.status !== 0 && obligatorio) {
		console.error(`\nNo se pudo completar: ${titulo}. Corrige lo que indica el mensaje de arriba y repite este comando.`);
		process.exit(1);
	}
	return r.status === 0;
};

paso('Dependencias', ['install']);
paso('Fuentes', ['fuentes']);
if (!responde('ffmpeg', ['-version'])) console.log('\nFalta ffmpeg. macOS: brew install ffmpeg · Debian o Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg (y abre una terminal nueva).');
else if (args.includes('--sin-musica')) console.log('\nMúsica sin instalar (--sin-musica): los videos usarán la cama sintetizada. Se instala después con  pnpm bibliotecas');
else paso('Música de fondo (unos 60 MB de descarga)', ['bibliotecas'], {obligatorio: false});

// The first time, the first-use assistant: with a person at the terminal it asks five questions; run by an AI
// assistant (no terminal to ask in) it prints what there is to choose, for that assistant to ask the person.
// Later runs, and --sin-asistente, show the plain diagnosis.
const elegido = existsSync(path.join(destino, 'config', 'preferencias.json'));
const conAsistente = !elegido && !args.includes('--sin-asistente');
if (!conAsistente || !paso('Asistente inicial', ['asistente'], {obligatorio: false})) paso('Diagnóstico', ['diagnostico'], {obligatorio: false});
const falta = !existsSync(path.join(destino, 'config', 'preferencias.json'));

console.log(`\nListo. Trabaja dentro de ${destino}:`);
if (falta) console.log('  pnpm asistente --recomendado              # falta elegir: esto acepta lo recomendado; pnpm asistente pregunta');
console.log('  pnpm video <nombre> --tema "…"            # un video con tu plantilla');
console.log('  pnpm video --plantillas                   # los tipos de video; --plantilla <id> usa otro en un video');
console.log('  pnpm asistente                            # cambiar plantilla, voz, imágenes, música o quién escribe');
console.log('  pnpm explica guiones/explica/ia.json      # prueba rápida: explicativo 2D, sin voz ni claves');
console.log('Claves opcionales: copia .env.example a .env y llena las que tengas. La documentación quedó en docs/.');
