import {z} from 'zod';

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

// One piece of a model described by the LLM: size is width, height, depth; pos is the center of its base.
export const PartSchema = z.object({
	shape: z.enum(['box', 'cylinder', 'cone', 'sphere', 'hull']),
	size: Vec3,
	pos: Vec3,
	rot: Vec3,
	color: Color,
});

export const ModelSchema = z.object({
	name: z.string(),
	parts: z.array(PartSchema).min(6).max(120),
});

const TowerSchema = z.object({
	floors: z.number().int().min(5).max(120),
	tiers: z.array(z.object({until: z.number().int(), width: z.number().min(6).max(90)})).min(1).max(8),
	color: Color,
	mast: z.number().min(0).max(120),
});

const ShipSchema = z.object({
	levels: z.number().int().min(1).max(8),
	funnels: z.number().int().min(0).max(4),
	hullColor: Color,
	bootColor: Color,
	deckColor: Color,
	houseColor: Color,
	funnelColor: Color,
});

export const WorldSchema = z.object({
	environment: z.enum(['city', 'coast', 'open', 'studio']),
	density: z.number().min(0).max(1),
	floors: z.tuple([z.number().int().min(1), z.number().int().max(40)]),
	palette: z.object({
		buildings: z.array(Color).min(3).max(12),
		ground: Color,
		street: Color,
		foliage: Color,
		water: Color,
		accent: Color,
	}),
	trees: z.number().min(0).max(1),
	traffic: z.number().min(0).max(1),
	crowd: z.number().min(0).max(1),
	landmark: z.enum(['bellas_artes', 'none']),
	hero: z.object({
		name: z.string().min(2),
		kind: z.enum(['tower', 'ship', 'model']),
		height: z.number().min(3).max(900),
		width: z.number().min(2).max(500),
		tower: TowerSchema.nullable(),
		ship: ShipSchema.nullable(),
		brief: z.string().min(2),
		floats: z.boolean(),
	}),
	cutaway: z
		.object({
			layers: z.array(z.object({name: z.string().max(24), color: Color, from: z.number(), to: z.number()})).min(1).max(6),
			piles: z.object({count: z.number().int().min(8).max(24), top: z.number(), tip: z.number()}).nullable(),
			basement: z.number().nullable(),
		})
		.nullable(),
	diagram: z
		.object({
			motion: z.enum(['sway', 'bob', 'none']),
			label: z.string().max(36),
			forces: z.array(z.object({label: z.string().max(18), direction: z.enum(['up', 'down', 'left', 'right'])})).max(3),
		})
		.nullable(),
	gaps: z.array(z.string()),
});

export type World = z.infer<typeof WorldSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type Part = z.infer<typeof PartSchema>;

export const SHOT_CATALOG: Record<string, {scene: 'world' | 'cutaway' | 'diagram'; about: string; requires?: (w: World) => boolean}> = {
	aerial_push: {scene: 'world', about: 'acercamiento aéreo, ideal para abrir'},
	orbit: {scene: 'world', about: 'órbita alrededor del protagonista'},
	hero_low: {scene: 'world', about: 'contrapicado desde el suelo'},
	hero_top: {scene: 'world', about: 'cerca de la parte alta del protagonista'},
	collapse_street: {scene: 'world', about: 'calle donde edificios caen; solo con collapse=true', requires: (w) => w.environment === 'city'},
	dive: {scene: 'world', about: 'cámara cae y entra bajo el suelo o el agua; siempre justo antes de cutaway', requires: (w) => w.cutaway !== null},
	pull_back: {scene: 'world', about: 'alejamiento final'},
	cut_wide: {scene: 'cutaway', about: 'corte completo de capas bajo el suelo o agua', requires: (w) => w.cutaway !== null},
	cut_waves: {scene: 'cutaway', about: 'corte con ondas que atraviesan capas', requires: (w) => w.cutaway !== null},
	cut_detail: {scene: 'cutaway', about: 'detalle de estructura bajo tierra; usa counter para profundidad', requires: (w) => w.cutaway !== null},
	diagram: {scene: 'diagram', about: 'plano técnico sobre fondo claro con el protagonista moviéndose', requires: (w) => w.diagram !== null},
};

export const shotsFor = (w: World) => Object.keys(SHOT_CATALOG).filter((k) => SHOT_CATALOG[k].requires?.(w) ?? true);

// block: hook or question. stack: small lead over a big punch. stat: one number and its unit.
const ChipSchema = z.object({
	kind: z.enum(['block', 'stack', 'stat']),
	text: z.string().min(1).max(34),
	lead: z.string().nullable(),
	punch: z.string().min(1),
	value: z.string().nullable(),
	unit: z.string().nullable(),
});

const BeatSchema = z.object({
	text: z.string().min(1),
	scene: z.enum(['world', 'cutaway', 'diagram', 'toma']),
	shot: z.string(),
	grade: z.enum(['night', 'dawn', 'day']),
	quake: z.number().min(0).max(1),
	collapse: z.boolean(),
	counter: z.object({to: z.number(), unit: z.string().max(4)}).nullable(),
	chip: ChipSchema.nullable(),
	prop: z.string().nullable(),
});

export const StoryboardSchema = z.object({
	title: z.string().min(1).max(80),
	beats: z.array(BeatSchema).min(4).max(32),
	captions: z.boolean().optional(),
});

export type Storyboard = z.infer<typeof StoryboardSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Chip = z.infer<typeof ChipSchema>;

export type WordTime = {word: string; start: number; end: number};
export type BeatTime = {start: number; end: number};
export type Timing = {duration: number; beats: BeatTime[]; words: WordTime[]};

// A ready-made model shown on a card while the voice talks about it. file is relative to public/.
export type Prop = {id: string; label: string; file: string; format: 'glb' | 'obj'};

// A shot written for this film by the tomas step: checked and compiled before it gets here.
export type TomaCode = {id: string; about: string; js: string};

export type Film = {world: World; hero: Model | null; storyboard: Storyboard; timing: Timing; props?: Prop[]; tomas?: TomaCode[]};

const normalize = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9ñ ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// Schema-valid is not enough: these are the mistakes that would produce a wrong film without any error.
export const semanticIssues = (sb: Storyboard, guion: string, world: World, tomas: {id: string}[] = []): string[] => {
	const issues: string[] = [];
	const written = new Set(tomas.map((t) => t.id));
	const shots = [...shotsFor(world), ...written];
	sb.beats.forEach((b, i) => {
		if (!shots.includes(b.shot)) {
			issues.push(`beat ${i}: shot ${b.shot} no existe; usa uno de ${shots.join(', ')}`);
			return;
		}
		const scene = written.has(b.shot) ? 'toma' : SHOT_CATALOG[b.shot].scene;
		if (scene !== b.scene) issues.push(`beat ${i}: shot ${b.shot} pertenece a scene ${scene}`);
		if (b.collapse && b.shot !== 'collapse_street') issues.push(`beat ${i}: collapse debe usar collapse_street`);
		if (b.counter && b.shot !== 'cut_detail') issues.push(`beat ${i}: counter fuera de cut_detail`);
		if (b.shot === 'diagram' && b.text.split(/\s+/).length < 9) issues.push(`beat ${i}: diagram necesita al menos 9 palabras para alcanzar a leerse; une frases contiguas`);
		const next = sb.beats[i + 1];
		if (b.shot === 'dive' && next?.scene !== 'cutaway') issues.push(`beat ${i}: dive debe ir justo antes de cutaway`);
	});
	if (sb.beats.some((b) => b.scene === 'cutaway') && !sb.beats.some((b) => b.shot === 'dive')) issues.push('falta dive antes de cutaway');
	if (normalize(sb.beats.map((b) => b.text).join(' ')) !== normalize(guion)) issues.push('los beats deben contener el guion completo, palabra por palabra');
	return issues;
};
