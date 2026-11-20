import * as THREE from 'three';
import type {Model, Part} from '../../schema';
import {instanced, lambert} from './materials';

// A unit hull: lofted from keel to deck, with a raked bow at +x and a square stern.
const hull = () => {
	const STATIONS = 22;
	const beam = (u: number) => (u < 0.62 ? 1 - Math.pow((0.62 - u) / 0.62, 3) * 0.16 : Math.cos(((u - 0.62) / 0.38) * (Math.PI / 2)) ** 0.8);
	const positions: number[] = [];
	const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
	for (let i = 0; i < STATIONS; i++) {
		const u0 = i / STATIONS;
		const u1 = (i + 1) / STATIONS;
		const x = (u: number, y: number) => u - 0.5 - (1 - y) * Math.max(0, u - 0.8) * 0.5;
		const top = (u: number, s: number) => [x(u, 1), 1, (s * Math.max(0.001, beam(u))) / 2];
		const mid = (u: number, s: number) => [x(u, 0.45), 0.45, s * Math.max(0.001, beam(u)) * 0.46];
		const low = (u: number, s: number) => [x(u, 0), 0, s * Math.max(0.001, beam(u)) * 0.2];
		quad(top(u0, 1), mid(u0, 1), mid(u1, 1), top(u1, 1));
		quad(mid(u0, 1), low(u0, 1), low(u1, 1), mid(u1, 1));
		quad(top(u1, -1), mid(u1, -1), mid(u0, -1), top(u0, -1));
		quad(mid(u1, -1), low(u1, -1), low(u0, -1), mid(u0, -1));
		quad(top(u0, -1), top(u0, 1), top(u1, 1), top(u1, -1));
		quad(low(u1, -1), low(u1, 1), low(u0, 1), low(u0, -1));
	}
	const b = (y: number, w: number) => [-0.5, y, w];
	const s = beam(0);
	quad(b(1, s / 2), b(0.45, s * 0.46), b(0.45, -s * 0.46), b(1, -s / 2));
	quad(b(0.45, s * 0.46), b(0, s * 0.2), b(0, -s * 0.2), b(0.45, -s * 0.46));
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	g.computeVertexNormals();
	return g;
};

const SHAPES: Record<Part['shape'], () => THREE.BufferGeometry> = {
	hull,
	box: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
	cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0),
	cone: () => new THREE.ConeGeometry(0.5, 1, 14).translate(0, 0.5, 0),
	sphere: () => new THREE.IcosahedronGeometry(0.5, 2).translate(0, 0.5, 0),
};

const rad = THREE.MathUtils.degToRad;

// A model the assets step described as simple parts: drawn as instances so hundreds of parts stay one draw per shape.
export const buildModel = (root: THREE.Group, model: Model) => {
	const group = new THREE.Group();
	root.add(group);
	(Object.keys(SHAPES) as Part['shape'][]).forEach((shape) => {
		const parts = model.parts.filter((p) => p.shape === shape);
		if (!parts.length) return;
		const items = parts.map((p) => ({
			matrix: new THREE.Matrix4().compose(
				new THREE.Vector3(...p.pos),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(p.rot[0]), rad(p.rot[1]), rad(p.rot[2]))),
				new THREE.Vector3(...p.size),
			),
			color: new THREE.Color(p.color),
		}));
		group.add(instanced(SHAPES[shape](), lambert({flatShading: true}, {tower: true}), items));
	});
	return group;
};

export const modelBounds = (model: Model) => {
	const box = new THREE.Box3();
	model.parts.forEach((p) => {
		box.expandByPoint(new THREE.Vector3(p.pos[0] - p.size[0] / 2, p.pos[1], p.pos[2] - p.size[2] / 2));
		box.expandByPoint(new THREE.Vector3(p.pos[0] + p.size[0] / 2, p.pos[1] + p.size[1], p.pos[2] + p.size[2] / 2));
	});
	return box;
};
