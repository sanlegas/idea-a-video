import type {Hud} from './hud';
import type * as THREE from 'three';
import * as Three from 'three';
import {mulberry32, wordTime, type Film, type Shot} from '../film';
import {WORLDS, type WorldKey} from '../worlds';
import {createKit} from './index';

export type SceneSetup = {world: WorldKey; floor?: boolean; bokeh?: boolean; stars?: boolean};
type Program = (context: unknown) => (t: number) => void;

// Names a scene must not reach. The checker refuses them first; this is the second lock, at run time.
const BLOCKED = ['window', 'document', 'globalThis', 'self', 'parent', 'top', 'frames', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'Function', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Date', 'performance'];

export const readProgram = (code: string) => {
	let found: {setup: SceneSetup; program: Program} | null = null;
	const escena = (setup: SceneSetup, program: Program) => {
		found = {setup, program};
	};
	const guard = `"use strict"; const ${BLOCKED.map((n) => `${n} = undefined`).join(', ')};\n`;
	// eslint-disable-next-line no-new-func
	new Function('escena', 'Math', guard + code)(escena, Object.assign(Object.create(Math), {random: undefined}));
	if (!found) throw new Error('el programa no llamó a escena()');
	return found as {setup: SceneSetup; program: Program};
};

export const runProgram = (film: Film, shot: Shot, program: Program, root: THREE.Group, hud: Hud, setup: SceneSetup, textures: Record<string, THREE.Texture>, models: Record<string, THREE.Object3D> = {}) => {
	const [r, g, b] = WORLDS[setup.world].bokeh;
	const glowColor = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.8)`;
	const pictures = Object.fromEntries(Object.entries(textures).map(([name, texture]) => [name, {texture, aspect: film.assets[name].aspect}]));
	const {kit, poseAt, look} = createKit(root, hud, glowColor, pictures, Boolean(setup.floor), models);
	const narrated = shot.span ? film.words.slice(shot.span[0], shot.span[1] + 1) : film.words;
	const update = program({THREE: Three, kit, at: (word: string, occurrence?: number) => wordTime(narrated, word, occurrence), start: shot.start, end: shot.end, random: mulberry32});
	if (typeof update !== 'function') throw new Error('el programa debe devolver una función (t) => void');
	return {update, poseAt, look};
};
