import {WorldSchema, type World} from '../../src/schema';
import {askJson, targetFor} from '../lib/llm';
import type {Step} from './types';

const SYSTEM = `Eres director de arte de videos explicativos 3D verticales, con estilo flat low-poly. Decides el mundo que mejor cuenta el guion.
Solo existe este kit:

environment:
- city: ciudad en manzanas con edificios, calles y árboles.
- coast: mar low-poly hasta el horizonte.
- open: terreno abierto con colinas y árboles.
- studio: fondo claro infinito, sin paisaje.

hero, el protagonista, real en metros:
- kind "tower": edificio escalonado. tower trae floors, tiers (until es piso donde termina cada tramo, width su ancho en metros, de abajo arriba), color y mast (antena en metros, 0 si no hay).
- kind "ship": cualquier barco. height va de la quilla a la chimenea, width es la eslora. ship trae levels (pisos de cubierta), funnels (chimeneas) y colores hullColor, bootColor (franja de flotación), deckColor, houseColor, funnelColor. Es el mejor resultado para barcos.
- kind "model": solo si ningún arquetipo sirve; se construye con piezas simples y queda tosco. En brief describe sus partes visibles.
- tower y ship son null cuando no corresponden.
- floats true si flota en agua; exige environment coast.

density, trees, traffic, crowd van de 0 a 1. floors es [min,max] de pisos de edificios vecinos. traffic y crowd solo aplican en city.
palette: colores hexadecimales propios del lugar y la época. buildings lleva de 6 a 10 tonos.
landmark: bellas_artes solo si ocurre en el centro de Ciudad de México; si no, none.

cutaway: usa solo si la explicación necesita ver bajo el suelo o el agua; si no, null.
- layers: capas de arriba abajo, con from y to en metros negativos desde 0, contiguas. Solo materiales del terreno o del agua, nunca partes del protagonista.
- piles: pilotes dibujados (count entre 8 y 20), top y tip en metros negativos, o null.
- basement: profundidad de sótano en metros negativos, o null.

diagram: usa si conviene ver el movimiento del protagonista sobre plano técnico; si no, null.
- motion: sway (se dobla por arriba), bob (sube y baja en agua), none.
- label: qué mide la barra del plano, máximo 36 caracteres.
- forces: hasta 3 flechas de fuerza con label corto y direction up, down, left o right; lista vacía si no aplican.

gaps: frases cortas con lo que el guion pediría y este kit no puede mostrar. Sé honesto; si nada falta, lista vacía.
Devuelve solo JSON.`;

const check = (w: World) => {
	const issues: string[] = [];
	if (w.hero.kind === 'tower' && !w.hero.tower) issues.push('hero tower necesita tower');
	if (w.hero.kind !== 'tower' && w.hero.tower) issues.push('tower debe ser null');
	if (w.hero.kind === 'ship' && !w.hero.ship) issues.push('hero ship necesita ship');
	if (w.hero.kind !== 'ship' && w.hero.ship) issues.push('ship debe ser null');
	if (w.hero.floats && w.environment !== 'coast') issues.push('floats exige environment coast');
	if (w.hero.tower) {
		const t = w.hero.tower.tiers;
		if (t[t.length - 1].until !== w.hero.tower.floors) issues.push('el último tier debe terminar en floors');
		t.forEach((x, i) => i && x.until <= t[i - 1].until && issues.push('tiers deben crecer en until'));
	}
	w.cutaway?.layers.forEach((l, i, a) => {
		if (l.from > 0 || l.to >= l.from) issues.push(`capa ${l.name}: from y to negativos, to más profundo`);
		if (i && Math.abs(a[i - 1].to - l.from) > 0.01) issues.push(`capa ${l.name} no toca a la anterior`);
	});
	if (w.cutaway?.piles && w.cutaway.piles.tip >= w.cutaway.piles.top) issues.push('tip debe ser más profundo que top');
	return issues;
};

export const art: Step = {
	id: 'art',
	needs: ['guion.md', 'brief.json'],
	makes: ['world.json'],
	run: async (ctx) => {
		const user = `Análisis:\n${JSON.stringify(ctx.read('brief.json'))}\n\nGuion:\n${ctx.notas()}`;
		const world = await askJson(targetFor(ctx.profile, 'art'), WorldSchema, SYSTEM, user, {temperature: 0.4, check: (v) => check(v as World)});
		ctx.write('world.json', world);
		console.log(`  ${world.environment} | hero ${world.hero.kind}: ${world.hero.name} | cutaway ${world.cutaway ? 'sí' : 'no'} | diagrama ${world.diagram?.motion ?? 'no'}`);
		world.gaps.forEach((g) => console.log(`  falta en kit: ${g}`));
	},
};
