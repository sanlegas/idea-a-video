import type {Model, Part, World} from '../../schema';

const part = (shape: Part['shape'], size: Part['size'], pos: Part['pos'], color: string, rot: Part['rot'] = [0, 0, 0]): Part => ({shape, size, pos, rot, color});

// Objects the kit knows how to build well. The LLM picks one and sets its parameters; it does not place parts.
export const shipModel = (hero: World['hero']): Model => {
	const spec = hero.ship!;
	const L = hero.width;
	const B = L * 0.15;
	const H = hero.height;
	const draft = H * 0.2;
	const free = H * 0.2;
	const parts: Part[] = [
		part('hull', [L, draft + free, B], [0, -draft, 0], spec.hullColor),
		part('hull', [L * 1.004, draft * 0.34 + free * 0.08, B * 1.012], [0, -draft * 0.34, 0], spec.bootColor),
		part('hull', [L * 0.985, 0.35, B * 0.97], [0, free, 0], spec.deckColor),
	];
	const levels = spec.levels;
	const houseH = (H - free) * 0.55;
	const levelH = houseH / levels;
	const houseL = L * 0.46;
	const houseX = -L * 0.08;
	for (let i = 0; i < levels; i++) {
		const k = 1 - (i / levels) * 0.42;
		const y = free + 0.35 + i * levelH;
		const w = houseL * k;
		const d = B * 0.74 * (1 - i * 0.05);
		parts.push(part('box', [w, levelH * 0.92, d], [houseX, y, 0], spec.houseColor));
		parts.push(part('box', [w + 0.5, levelH * 0.08, d + 0.5], [houseX, y + levelH * 0.92, 0], spec.deckColor));
		const windows = Math.floor(w / (levelH * 1.1));
		for (let n = 0; n < windows; n++) {
			const x = houseX + ((n + 0.5) / windows - 0.5) * (w - levelH);
			[-1, 1].forEach((s) => parts.push(part('box', [levelH * 0.6, levelH * 0.42, 0.14], [x, y + levelH * 0.28, (s * d) / 2], '#22303e')));
		}
	}
	const top = free + 0.35 + levels * levelH;
	parts.push(part('box', [L * 0.08, levelH * 0.95, B * 0.4], [houseX + houseL * 0.2, top, 0], spec.houseColor));
	parts.push(part('box', [L * 0.082, levelH * 0.34, B * 0.41], [houseX + houseL * 0.2, top + levelH * 0.34, 0], '#22303e'));
	for (let i = 0; i < spec.funnels; i++) {
		const x = houseX - houseL * 0.22 + (i - (spec.funnels - 1) / 2) * L * 0.09;
		const r = B * 0.2;
		const f = H - top;
		parts.push(part('cylinder', [r, f * 0.95, r * 1.2], [x, top, 0], spec.funnelColor, [0, 0, 4]));
		parts.push(part('cylinder', [r * 1.02, f * 0.14, r * 1.22], [x, top + f * 0.76, 0], '#1b1f26', [0, 0, 4]));
	}
	parts.push(part('cylinder', [0.5, H * 0.34, 0.5], [L * 0.3, free, 0], '#5d6670'));
	parts.push(part('box', [0.3, 0.3, B * 0.4], [L * 0.3, free + H * 0.25, 0], '#5d6670'));
	const rails = Math.floor(L / 3);
	for (let n = 0; n < rails; n++) {
		const x = -L * 0.47 + (n / rails) * L * 0.8;
		[-1, 1].forEach((s) => parts.push(part('box', [0.14, 1, 0.14], [x, free + 0.35, s * B * 0.46], '#d9d4c8')));
	}
	return {name: hero.name, parts};
};

export const ARCHETYPES: Partial<Record<World['hero']['kind'], (hero: World['hero']) => Model>> = {ship: shipModel};
