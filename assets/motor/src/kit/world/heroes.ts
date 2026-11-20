// Buildings that really fall. Shared by the city, which leaves their lots empty, and by the physics bake.
export type Hero = {x: number; z: number; w: number; d: number; floors: number; color: string; delay: number};

export const FLOOR_H = 3.5;

export const HEROES: Hero[] = [
	{x: 72, z: 254, w: 30, d: 26, floors: 10, color: '#d8c6ad', delay: 0},
	{x: 18, z: 262, w: 32, d: 28, floors: 9, color: '#c8b0a0', delay: 0.6},
	{x: 74, z: 198, w: 28, d: 30, floors: 9, color: '#c3cbc8', delay: 1},
	{x: 16, z: 204, w: 30, d: 26, floors: 8, color: '#debd9f', delay: 0.35},
];

export const overlapsHero = (x: number, z: number, w: number, d: number) =>
	HEROES.some((h) => Math.abs(h.x - x) < (h.w + w) / 2 + 2 && Math.abs(h.z - z) < (h.d + d) / 2 + 2);
