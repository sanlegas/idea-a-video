// The whole surface a scene program can touch. This file is also what the scene writer reads.

type Vec3 = [number, number, number];
type Finish = 'metal' | 'chrome' | 'glass' | 'plastic' | 'matte' | 'glow';
type WorldName = 'rojo' | 'ambar' | 'verde' | 'azul' | 'violeta' | 'rosa' | 'cian';

type SceneSetup = {
	/** Single hue of the scene: it tints the backdrop, the bokeh and the light. */
	world: WorldName;
	/** Polished black floor at y = 0. It reflects everything above it by itself. */
	floor?: boolean;
	/** Out-of-focus lights behind the action. */
	bokeh?: boolean;
	/** Starfield. Use it for space, usually with floor and bokeh off. */
	stars?: boolean;
};

/** Registers the scene. The program builds things once and returns a function that poses them at time t. */
declare function escena(setup: SceneSetup, program: (context: SceneContext) => (t: number) => void): void;

type SceneContext = {
	/** The complete three.js library. */
	THREE: typeof import('three');
	kit: Kit;
	/** Second when a word of this scene starts. occurrence picks a word repeated inside the scene, from 1. Accents and case do not matter. */
	at: (word: string, occurrence?: number) => number;
	/** First and last second of this scene. */
	start: number;
	end: number;
	/** Seeded random generator. Math.random does not exist here: every frame must be reproducible. */
	random: (seed: number) => () => number;
};

type CameraKey = {
	/** Second at which the camera arrives at this pose. */
	time: number;
	position: number[];
	look: number[];
	/** Vertical field of view in degrees. 45 to 60 feels wide and dramatic. Default 50. */
	fov?: number;
	/** How it arrives here from the previous key. Default 'inOut'. */
	ease?: 'linear' | 'out' | 'inOut';
};

type Kit = {
	/** Puts an object on the stage and returns it. */
	add: <T extends import('three').Object3D>(object: T) => T;
	/** Studio-lit material. 'glow' ignores light and shines. intensity only applies to 'glow'; above 1 it blooms. */
	material: (finish: Finish, color: string, options?: {intensity?: number; opacity?: number; roughness?: number; map?: import('three').Texture}) => any;
	/** Solid from an SVG path: centered, y up, longest side equal to size. */
	extrude: (svgPath: string, options: {size: number; depth: number; bevel?: number}) => import('three').BufferGeometry;
	/** Solid of revolution around y from a half profile of [radius, height] points. Smooth by default. */
	lathe: (profile: [number, number][], segments?: number) => import('three').BufferGeometry;
	/** Texture painted with Canvas 2D. */
	texture: (width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) => import('three').Texture;
	/** Texture of a picture or real resource from your brief, to wrap a mesh: kit.material('glow', '#ffffff', {map: kit.picture('name')}). */
	picture: (name: string) => import('three').Texture;
	/**
	 * Picture of a real object made for this film, listed in your brief. This is the best way to show a protagonist.
	 * It stands on its base at y = 0 of its own position and has soft relief. It is a card: it turns a little but always keeps facing the camera, so it can never spin or show its side. height sets its size.
	 * Animate it like any object: position, rotation, scale. opacity fades it.
	 */
	image: (name: string, options: {height: number; relief?: number; opacity?: number}) => ImageCard;
	/**
	 * Real 3D model made for this film, listed in your brief under models. Unlike a picture it can spin, tilt and show every side.
	 * It stands on its base at y = 0 of its own position, centred. height sets its height; size sets its longest side instead.
	 * Its front faces +z. Animate it like any object: position, rotation, scale. opacity fades it.
	 */
	model: (name: string, options: {height?: number; size?: number; opacity?: number}) => import('three').Group & {opacity: number};
	/** Many copies of one picture standing up, always facing the camera. Up to 3000. Pose them with .each like a swarm. */
	imageSwarm: (name: string, count: number, options: {height: number}) => Swarm;
	/** Full-frame picture behind everything, for places. Always fills the frame. Add it once; it needs no position. Only for names marked as scenery. */
	backdrop: (name: string, options?: {brightness?: number}) => ImageCard;
	/** Soft ray of light between two points. Set .intensity and .width while animating. */
	beam: (from: Vec3, to: Vec3, options: {color: string; width: number; intensity?: number}) => Beam;
	/** Soft ball of light that always faces the camera. Set .intensity and .position while animating. */
	glow: (options: {color: string; size: number; intensity?: number}) => Glow;
	/** Many copies of one mesh in a single draw. Up to 5000. */
	swarm: (geometry: import('three').BufferGeometry, material: import('three').Material, count: number) => Swarm;
	/** Thousands of soft particles. Up to 20000. */
	dots: (count: number, options?: {size?: number; color?: string; additive?: boolean}) => Dots;
	/** Glowing tube through points. Call .draw(u) to reveal it from 0 to 1. */
	line: (points: Vec3[], options: {color: string; width: number; intensity?: number}) => Line;
	/** Glowing arrow. Call .grow(u) to extend it from 0 to 1. */
	arrow: (from: Vec3, to: Vec3, options: {color: string; width: number; intensity?: number}) => Arrow;
	/** Small text tag glued to a point or object. Never place it over the top quarter of the frame. */
	label: (text: string, options: {at: Vec3 | import('three').Object3D; offset?: [number, number]; size?: number; color?: string}) => Tag;
	/** Glass pill with a number that counts during [start, end]. Give screen pixels x, y (1080 x 1920) or glue it with at. */
	counter: (options: {from: number; to: number; start: number; end: number; unit: string; singular?: string; decimals?: number; x?: number; y?: number; at?: Vec3 | import('three').Object3D; hide?: number}) => Tag;
	camera: {
		/** Fixed camera. */
		still: (position: Vec3, look: Vec3, fov?: number) => void;
		/** Camera path. Keys are sorted by time; it holds still before the first key and after the last. */
		path: (keys: CameraKey[]) => void;
		/**
		 * Pose that frames an object below the text band, so it is never cut or hidden. Use it for every shot of the protagonist:
		 * kit.camera.path([{time: 0, ...kit.camera.frame(heart, {fill: 0.6})}, {time: at('late'), ...kit.camera.frame(heart, {fill: 0.8, yaw: 0.3})}]).
		 * fill goes from 0.3 (object far) to 0.9 (object huge). yaw and pitch orbit around it, in radians.
		 */
		frame: (target: import('three').Object3D, options?: {fill?: number; yaw?: number; pitch?: number; fov?: number}) => {position: Vec3; look: Vec3; fov: number};
	};
	/** 0 before from, 1 after to, linear between. */
	ramp: (t: number, from: number, to: number) => number;
	ease: {
		out: (u: number) => number;
		in: (u: number) => number;
		inOut: (u: number) => number;
		/** Overshoots and settles: good for things popping into place. */
		back: (u: number) => number;
		/** Falls and bounces to rest. */
		bounce: (u: number) => number;
	};
};

type Glow = import('three').Object3D & {intensity: number};
type ImageCard = import('three').Mesh & {opacity: number};
type Beam = import('three').Object3D & {intensity: number; width: number};

type Swarm = import('three').InstancedMesh & {
	/** Poses every copy. Set o.position, o.rotation and o.scale; hide a copy with o.scale.setScalar(0). */
	each: (pose: (o: import('three').Object3D, index: number) => void) => void;
	/** Tints one copy. */
	tint: (index: number, color: string) => void;
};

type Dot = {x: number; y: number; z: number; size: number; alpha: number; r: number; g: number; b: number};

type Dots = import('three').Object3D & {
	/** Poses every particle. alpha 0 hides it. r, g, b are linear light and may exceed 1 to bloom. */
	each: (pose: (dot: Dot, index: number) => void) => void;
};

type Line = import('three').Mesh & {draw: (u: number) => void; intensity: number};
type Arrow = import('three').Group & {grow: (u: number) => void};
type Tag = {text: string; opacity: number};
