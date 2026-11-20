// Runs tomas: shots written for this film by a model, checked before they reach the browser, and locked again here.
import * as THREE from 'three';
import type {World} from '../../../schema';
import {lambert, mulberry32} from '../materials';

export type TomaSetup = {mundo: 'visible' | 'oculto'; fondo?: string};
type Pose = {position: [number, number, number]; look: [number, number, number]; fov?: number};
type Update = (u: number, t: number) => {camera: Pose} | void;
export type TomaWindow = {id: string; start: number; end: number};

// Names a toma must not reach. The checker refuses them first; this is the second lock, at run time.
const BLOCKED = ['window', 'document', 'globalThis', 'self', 'parent', 'top', 'frames', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'Function', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Date', 'performance'];

const read = (js: string) => {
	let found: {setup: TomaSetup; program: (ctx: unknown) => Update} | null = null;
	const toma = (setup: TomaSetup, program: (ctx: unknown) => Update) => {
		found = {setup, program};
	};
	const guard = `"use strict"; const ${BLOCKED.map((n) => `${n} = undefined`).join(', ')};\n`;
	// eslint-disable-next-line no-new-func
	new Function('toma', 'Math', guard + js)(toma, Object.assign(Object.create(Math), {random: undefined}));
	if (!found) throw new Error('la toma no llamó a toma()');
	return found as {setup: TomaSetup; program: (ctx: unknown) => Update};
};

const ease = {in: (u: number) => u * u * u, out: (u: number) => 1 - (1 - u) ** 3, inOut: (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)};
const ramp = (u: number, from: number, to: number) => Math.min(1, Math.max(0, (u - from) / Math.max(1e-6, to - from)));

const swarm = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number) => {
	const mesh = new THREE.InstancedMesh(geometry, material, Math.min(5000, count)) as THREE.InstancedMesh & {each: (pose: (o: THREE.Object3D, i: number) => void) => void};
	mesh.frustumCulled = false;
	mesh.castShadow = true;
	const dummy = new THREE.Object3D();
	mesh.each = (pose) => {
		for (let i = 0; i < mesh.count; i++) {
			dummy.position.set(0, 0, 0);
			dummy.rotation.set(0, 0, 0);
			dummy.scale.set(1, 1, 1);
			pose(dummy, i);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
	};
	return mesh;
};

const frame = (target: [number, number, number], size: number, {yaw = 0.5, pitch = 0.3, fov = 40}: {yaw?: number; pitch?: number; fov?: number} = {}): Pose => {
	// Far enough that size fills about half the frame height.
	const distance = (size * 1.1) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
	return {
		position: [target[0] + Math.sin(yaw) * Math.cos(pitch) * distance, target[1] + Math.sin(pitch) * distance, target[2] + Math.cos(yaw) * Math.cos(pitch) * distance],
		look: target,
		fov,
	};
};

export type Toma = {id: string; setup: TomaSetup; group: THREE.Group; update: Update};

// Builds every toma of the film once. Each gets its own group, hidden until its window.
export const buildTomas = (scene: THREE.Scene, tomas: {id: string; js: string; duration: number}[], hero: THREE.Object3D, size: {height: number; width: number}, world: World): Toma[] =>
	tomas.map(({id, js, duration}) => {
		const {setup, program} = read(js);
		const group = new THREE.Group();
		group.visible = false;
		scene.add(group);
		const material = (color: string, {opacity = 1, glow = false}: {opacity?: number; glow?: boolean} = {}) =>
			glow
				? new THREE.MeshBasicMaterial({color, transparent: opacity < 1, opacity, toneMapped: false})
				: lambert({color, flatShading: true, transparent: opacity < 1, opacity}, {tower: true});
		const withShadow = <T extends THREE.Mesh>(m: T) => {
			m.castShadow = true;
			m.receiveShadow = true;
			return m;
		};
		const ctx = {
			THREE,
			add: <T extends THREE.Object3D>(o: T) => {
				o.traverse((c) => {
					if ((c as THREE.Mesh).isMesh) withShadow(c as THREE.Mesh);
				});
				group.add(o);
				return o;
			},
			hero,
			size,
			palette: {ground: world.palette.ground, street: world.palette.street, foliage: world.palette.foliage, water: world.palette.water, accent: world.palette.accent, buildings: world.palette.buildings},
			material,
			box: (w: number, h: number, d: number, m: THREE.Material) => withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m)),
			cylinder: (r: number, h: number, m: THREE.Material) => withShadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20).translate(0, h / 2, 0), m)),
			swarm,
			random: mulberry32,
			ramp,
			ease,
			duration,
			frame,
		};
		const update = program(ctx);
		if (typeof update !== 'function') throw new Error(`la toma ${id} debe devolver una función (u, t) => {camera}`);
		return {id, setup, group, update};
	});
