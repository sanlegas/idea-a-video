// One door for every flow of the project: lists them, or runs one with its own options untouched.
// usage: pnpm flujo                          table of flows
//        pnpm flujo <flujo> --ayuda          what that flow takes and where it is documented
//        pnpm flujo <flujo> <sus opciones>   same as calling the flow's own command
// Each flow keeps its own script and options; this file only knows where they are, so adding a flow is one entry here.
import {FLUJOS} from './lib/flujos';
import {tsx} from './lib/sistema';

const [id, ...resto] = process.argv.slice(2);

if (!id || id === '--ayuda') {
	const linea = (c: string[]) => `| ${c.join(' | ')} |`;
	console.log(linea(['Flujo', 'Qué hace', 'Entra', 'Sale', 'Qué necesita', 'Pasos']));
	console.log(linea(['---', '---', '---', '---', '---', '---']));
	Object.entries(FLUJOS).forEach(([k, f]) => console.log(linea([k, f.hace, f.entra, f.sale, f.corre, f.pasos])));
	console.log('\nCorrer uno: pnpm flujo <flujo> <sus opciones>. Sus opciones: pnpm flujo <flujo> --ayuda');
	console.log('Sin elegir flujo: pnpm video usa la plantilla de siempre (pnpm asistente la cambia; pnpm video --plantillas las lista).');
	process.exit(0);
}

const flujo = FLUJOS[id];
if (!flujo) {
	console.error(`flujo desconocido: ${id}; hay: ${Object.keys(FLUJOS).join(', ')}`);
	process.exit(1);
}
if (resto.includes('--ayuda') || !resto.length) {
	console.log(`${id}: ${flujo.hace}\n\nUso:   pnpm flujo ${id} ${flujo.uso}\nEntra: ${flujo.entra}\nSale:  ${flujo.sale}\nPide:  ${flujo.corre}\nPasos: ${flujo.pasos}\nDoc:   ${flujo.doc}`);
	process.exit(0);
}
// The flow runs as its own process, so it reads its options and exits exactly as when called directly.
process.exit(tsx(flujo.script, resto));
