// Puts the typefaces the films use where the renders read them (public/). They do not travel with the project: each
// comes from its own package (@fontsource/*), which carries the font's licence, and is copied here once.
// usage: pnpm fuentes
import {copyFileSync, existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';

// package, file inside its `files` folder, where the films expect it under public/
const FUENTES: [string, string, string][] = [
	...['500', '700', '800', '900'].map((w): [string, string, string] => ['figtree', `figtree-latin-${w}-normal.woff2`, `estudio/fonts/figtree-latin-${w}-normal.woff2`]),
	['inter', 'inter-latin-600-normal.woff2', 'fonts/inter-latin-600-normal.woff2'],
	['inter', 'inter-latin-800-normal.woff2', 'fonts/inter-latin-800-normal.woff2'],
	['jetbrains-mono', 'jetbrains-mono-latin-600-normal.woff2', 'fonts/jetbrains-mono-latin-600-normal.woff2'],
	['barlow-condensed', 'barlow-condensed-latin-700-normal.woff2', 'fonts/BarlowCondensed-Bold.woff2'],
	['barlow-condensed', 'barlow-condensed-latin-800-normal.woff2', 'fonts/BarlowCondensed-ExtraBold.woff2'],
];

let puestas = 0;
for (const [paquete, archivo, destino] of FUENTES) {
	const origen = path.join('node_modules', '@fontsource', paquete, 'files', archivo);
	if (!existsSync(origen)) throw new Error(`falta ${origen}: corre pnpm install`);
	const final = path.join('public', destino);
	if (existsSync(final)) continue;
	mkdirSync(path.dirname(final), {recursive: true});
	copyFileSync(origen, final);
	puestas++;
}
console.log(`fuentes: ${FUENTES.length} en public/${puestas ? `, ${puestas} nuevas` : ''}`);
