import {ARCHETYPES} from '../../src/kit/world/archetypes';
import {ModelSchema, type Model, type Part, type World} from '../../src/schema';
import {askJson, targetFor} from '../lib/llm';
import type {Context, Step} from './types';

const SYSTEM = `Eres modelador 3D low-poly. Construyes un objeto con piezas simples, para video con estilo flat.
Coordenadas en metros: x a lo largo del objeto, y hacia arriba, z a lo ancho. El origen está en el suelo, centrado; si flota, y=0 es la línea de agua y el casco baja a y negativa.
Cada pieza: shape box, cylinder, cone o sphere. size es [largo x, alto y, ancho z]. pos es el centro de la BASE de la pieza. rot son grados [x,y,z].
Reglas:
- Entre 30 y 90 piezas. Cada pieza toca a otra; nada flota suelto.
- Primero el volumen principal, luego detalle: ventanas, barandas, chimeneas, ejes, según el objeto.
- Simétrico cuando el objeto real lo es. Usa 4 a 8 colores hexadecimales coherentes.
- Si es hueco, represéntalo con paredes, no con un bloque sólido.
Devuelve solo JSON.`;

const bounds = (parts: Part[]) => {
	const lo = [Infinity, Infinity, Infinity];
	const hi = [-Infinity, -Infinity, -Infinity];
	parts.forEach((p) => {
		const half = [p.size[0] / 2, p.size[1], p.size[2] / 2];
		[0, 1, 2].forEach((a) => {
			const min = a === 1 ? p.pos[1] : p.pos[a] - half[a];
			const max = a === 1 ? p.pos[1] + half[1] : p.pos[a] + half[a];
			lo[a] = Math.min(lo[a], min);
			hi[a] = Math.max(hi[a], max);
		});
	});
	return {lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]};
};

const touches = (a: Part, b: Part, margin: number) =>
	[0, 2].every((k) => Math.abs(a.pos[k] - b.pos[k]) <= (a.size[k] + b.size[k]) / 2 + margin) && a.pos[1] <= b.pos[1] + b.size[1] + margin && b.pos[1] <= a.pos[1] + a.size[1] + margin;

const checkModel = (height: number, width: number) => (value: unknown) => {
	const m = value as Model;
	const issues: string[] = [];
	const {size} = bounds(m.parts);
	if (size[1] < height * 0.6 || size[1] > height * 1.5) issues.push(`altura total ${size[1].toFixed(1)} m; debe rondar ${height} m`);
	if (Math.max(size[0], size[2]) < width * 0.5) issues.push(`ancho total ${Math.max(size[0], size[2]).toFixed(1)} m; debe rondar ${width} m`);
	if (m.parts.length < 24) issues.push(`solo ${m.parts.length} piezas; usa al menos 30`);
	if (new Set(m.parts.map((p) => p.color)).size < 3) issues.push('usa al menos 3 colores');
	const margin = Math.max(size[0], size[1], size[2]) * 0.03;
	const loose = m.parts.filter((p, i) => !m.parts.some((q, j) => i !== j && touches(p, q, margin))).length;
	if (loose > m.parts.length * 0.1) issues.push(`${loose} piezas flotan sueltas; deben tocar otra`);
	return issues;
};

// A resolver turns one requested asset into files in the run folder. New kinds of asset register here.
const RESOLVERS: Record<string, (ctx: Context, world: World) => Promise<void>> = {
	tower: async (ctx) => ctx.write('assets/hero.json', null),
	ship: async (ctx, world) => {
		const model = ARCHETYPES.ship!(world.hero);
		ctx.write('assets/hero.json', model);
		console.log(`  arquetipo barco: ${model.parts.length} piezas`);
	},
	model: async (ctx, world) => {
		const {name, brief, height, width, floats} = world.hero;
		const user = `Objeto: ${name}\nDescripción: ${brief}\nAltura real sobre su base: ${height} m. Largo o ancho mayor: ${width} m.${floats ? ' Flota: casco bajo y=0.' : ''}`;
		const model = await askJson(targetFor(ctx.profile, 'assets'), ModelSchema, SYSTEM, user, {temperature: 0.5, maxTokens: 9000, attempts: 3, check: checkModel(height, width)});
		ctx.write('assets/hero.json', model);
		console.log(`  modelo ${name}: ${model.parts.length} piezas, ${bounds(model.parts).size.map((n) => n.toFixed(1)).join(' x ')} m`);
	},
};

export const assets: Step = {
	id: 'assets',
	needs: ['world.json'],
	makes: ['assets/hero.json'],
	run: async (ctx) => {
		const world = ctx.read<World>('world.json');
		await RESOLVERS[world.hero.kind](ctx, world);
	},
};
