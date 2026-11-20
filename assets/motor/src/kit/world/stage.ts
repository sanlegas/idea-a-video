import type {Film, World} from '../../schema';
import {modelBounds} from './model';

// The measurements every camera and label derives from, so one set of shots fits any protagonist.
export type Stage = {height: number; extent: number; scale: number; cutZ: number; depth: number; behind: boolean};

export const stageFor = ({world, hero}: Pick<Film, 'world' | 'hero'>): Stage => {
	const bounds = hero ? modelBounds(hero) : null;
	const span = bounds ? Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) : world.hero.width;
	const zHalf = bounds ? Math.max(Math.abs(bounds.max.z), Math.abs(bounds.min.z)) : world.hero.width / 2;
	const height = bounds ? bounds.max.y : world.hero.height;
	const extent = Math.max(height, span * 0.9);
	const layers = world.cutaway?.layers ?? [];
	return {
		height,
		extent,
		scale: extent / 166,
		cutZ: zHalf + 15,
		depth: layers.length ? Math.abs(layers[layers.length - 1].to) : 40,
		// Over water the slice sits behind the hull, so the submerged part stays in view.
		behind: world.environment === 'coast',
	};
};

export const worldPaper = (world: World) => world.environment === 'studio';
