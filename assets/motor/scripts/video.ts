// One command for "make me a video": runs the flow of the user's template, so nothing has to be remembered.
// Everything after the command goes to the flow as it is.
// usage: pnpm video                                          the first time, the first-use assistant; later, the template and how to use it
//        pnpm video <nombre> --tema "…"                      a video with the template chosen in the assistant
//        pnpm video <nombre> --guion guiones/storytelling/x.md
//        pnpm video <nombre> --tema "…" --plantilla documental     another template, for this video only
//        pnpm video --plantillas                             the list of templates
import {FLUJOS} from './lib/flujos';
import {PLANTILLA_IDS, plantilla, preferencias, primeraVez, type PlantillaId} from './lib/preferencias';
import {tsx} from './lib/sistema';

const args = process.argv.slice(2);
const valor = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);

if (args.includes('--plantillas')) {
	console.log('| Plantilla | Nombre | Para qué | Entra | Flujo |\n| --- | --- | --- | --- | --- |');
	PLANTILLA_IDS.forEach((id) => {
		const t = plantilla(id);
		console.log(`| ${id} | ${t.nombre}${t.segundos ? `, ~${t.segundos} s, estilo ${t.estilo}` : ''} | ${t.para} | ${t.entra} | ${t.flujo} |`);
	});
	console.log(`\nLa de siempre: ${preferencias().plantilla} (se cambia con pnpm asistente). Para un solo video: pnpm video … --plantilla <id>.`);
	process.exit(0);
}

const pedida = valor('plantilla');
if (pedida && !PLANTILLA_IDS.includes(pedida as PlantillaId)) {
	console.error(`plantilla desconocida: ${pedida}; hay: ${PLANTILLA_IDS.join(', ')}`);
	process.exit(1);
}
const id = (pedida as PlantillaId | undefined) ?? preferencias().plantilla;
const t = plantilla(id);
// --plantilla belongs to this command: it is taken out before the rest travels to the flow.
const resto = args.filter((a, i) => a !== '--plantilla' && args[i - 1] !== '--plantilla');

if (!resto.length) {
	// Nothing asked and nothing chosen yet: this is the moment for the first-use assistant.
	if (primeraVez() && !pedida) process.exit(tsx('scripts/asistente.ts', []));
	console.log(`Plantilla: ${id} (${t.nombre}): ${t.para}.`);
	console.log(`Entra: ${t.entra}.\nUso:   pnpm video ${FLUJOS[t.flujo].uso.split(' [')[0]}\nEj.:   pnpm video ${t.ejemplo}`);
	console.log('\nOtras plantillas: pnpm video --plantillas. Cambiar la de siempre: pnpm asistente.');
	process.exit(0);
}
if (primeraVez() && !pedida) console.log('Aún no has elegido plantilla ni proveedores: van los recomendados. Para elegir: pnpm asistente\n');

// The flows read the user's usual style and length by themselves. A template named for this one video brings its
// own, unless the run says otherwise.
const extras: string[] = [];
if (pedida && t.flujo === 'storytelling') {
	if (t.estilo && !resto.includes('--estilo')) extras.push('--estilo', t.estilo);
	if (t.segundos && !resto.includes('--segundos')) extras.push('--segundos', String(t.segundos));
}
console.log(`plantilla ${id} (${t.nombre}) → pnpm ${t.flujo} ${[...resto, ...extras].map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}\n`);
process.exit(tsx(FLUJOS[t.flujo].script, [...resto, ...extras]));
