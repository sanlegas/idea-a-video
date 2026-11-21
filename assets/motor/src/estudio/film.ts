export type Word = {word: string; line: number; start: number; end: number};

// One screen of text. key marks the word that keeps its blue selection.
export type Page = {words: number[]; key: number | null; start: number; end: number};

// A scene written for this film. code is a program for the kit, already checked and compiled to JavaScript.
// span holds the first and last word narrated over it, so a word repeated along the film keeps its moment in this scene.
export type Shot = {id: string; code: string; start: number; end: number; span?: [number, number]; footage?: Footage};

// Real footage under a scene: a video in public/, the film second its first frame plays at, and its
// speed (below 1 stretches a short clip over a longer scene). The scene's 3D draws on top of it with a clear background.
export type Footage = {file: string; at: number; rate?: number};

// Images generated for this film, by the name scene programs use. modelo: a 3D model (.glb) made for this film, for kit.model.
export type Asset = {file: string; aspect: number; modelo?: boolean};

// ligero: a light render for computers with little or no GPU (one or two passes per frame instead of up to 14).
// look 'cine': the montage grades the pictures like film, with grain, vignette and a slight weave.
export type Film = {name: string; duration: number; words: Word[]; pages: Page[]; shots: Shot[]; assets: Record<string, Asset>; audio: string | null; ligero?: boolean; look?: 'cine'};

export type Passage = {type: 'corte' | 'swipe' | 'fundido'; start: number; end: number};
export type AssemblyClip = {file: string; from: number; to: number; enter: Passage | null};
export type Assembly = {film: Film; clips: AssemblyClip[]};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
export const ramp = (t: number, from: number, to: number) => clamp01((t - from) / Math.max(1e-6, to - from));
export const smooth = (u: number) => u * u * (3 - 2 * u);
export const easeOut3 = (u: number) => 1 - (1 - u) ** 3;
export const easeIn3 = (u: number) => u * u * u;
export const easeInOut3 = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
export const backOut = (u: number) => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2;

export const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Finds a word of the narration whatever its accents, case or punctuation.
export const wordTime = (words: Word[], word: string, occurrence = 1) => {
	const hits = words.filter((w) => key(w.word) === key(word));
	const hit = hits[Math.max(0, Math.min(hits.length - 1, occurrence - 1))];
	if (!hit) throw new Error(`palabra no encontrada en la narración: ${word}`);
	return hit.start;
};
