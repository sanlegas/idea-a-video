// Everything a toma (a shot written for the Plantillas world) may use. The writer reads this file; the checker compiles against it.
// A toma lives inside the film's world: same ground, sky, colors and protagonist. It only adds what the kit could not show.

type Vec3 = [number, number, number];
type Object3D = import('three').Object3D;

type TomaSetup = {
	/** 'visible' keeps the ground, sky and surroundings; 'oculto' hides them and leaves a plain background, for close-ups and cross-sections. */
	mundo: 'visible' | 'oculto';
	/** Background color when mundo is 'oculto'. */
	fondo?: string;
};

type Pose = {position: Vec3; look: Vec3; fov?: number};

type TomaContext = {
	/** The complete three.js library. */
	THREE: typeof import('three');
	/** Adds an object to this toma. It is only visible while the toma is on screen. The ground is y = 0 and the protagonist stands at the origin; units are meters. */
	add: <T extends Object3D>(object: T) => T;
	/** The protagonist built for this film. You may move, scale, rotate or hide it; it goes back to normal after the toma. */
	hero: Object3D;
	/** Size of the protagonist in meters: height, and width along its longest side. Size everything you add against this. */
	size: {height: number; width: number};
	/** Colors of this film's world. Use them so the toma matches the rest of the video. */
	palette: {ground: string; street: string; foliage: string; water: string; accent: string; buildings: string[]};
	/** Flat-shaded material, like everything else in the world. glow makes it ignore light, for lights, water highlights or warnings. */
	material: (color: string, options?: {opacity?: number; glow?: boolean}) => import('three').Material;
	/** Box whose base sits on y = 0 of its own position: kit.box(w, h, d, material). */
	box: (width: number, height: number, depth: number, material: import('three').Material) => import('three').Mesh;
	/** Upright cylinder whose base sits on y = 0 of its own position. */
	cylinder: (radius: number, height: number, material: import('three').Material) => import('three').Mesh;
	/** Many copies of one mesh in one draw, up to 5000. Pose them every frame with each. */
	swarm: (geometry: import('three').BufferGeometry, material: import('three').Material, count: number) => Swarm;
	/** Seeded random numbers between 0 and 1. Never use Math.random. */
	random: (seed: number) => () => number;
	/** 0 before from, 1 after to, linear between. */
	ramp: (u: number, from: number, to: number) => number;
	ease: {in: (u: number) => number; out: (u: number) => number; inOut: (u: number) => number};
	/** Seconds the toma lasts on screen. */
	duration: number;
	/** Camera pose that frames a point and a size from a side: yaw and pitch in radians. Handy for the returned camera. */
	frame: (target: Vec3, size: number, options?: {yaw?: number; pitch?: number; fov?: number}) => Pose;
};

type Swarm = import('three').InstancedMesh & {
	/** Poses every copy for this frame. Set o.position, o.rotation, o.scale; scale 0 hides one. */
	each: (pose: (o: Object3D, index: number) => void) => void;
};

/**
 * A toma: toma(setup, (ctx) => { build once; return (u, t) => { animate; return {camera} } }).
 * u goes from 0 to 1 across the toma and t is seconds since it started. Return the camera pose for this instant; it must keep the main subject in the middle third of the frame, below the top quarter where the text sits.
 */
declare function toma(setup: TomaSetup, program: (ctx: TomaContext) => (u: number, t: number) => {camera: Pose}): void;
