import * as THREE from 'three';
import {instanced, lambert, mulberry32} from './materials';

type Person = {
	home: THREE.Vector3;
	dir: THREE.Vector3;
	speed: number;
	wakes: number;
	runFor: number;
	height: number;
	seed: number;
	hat: boolean;
	coat: THREE.Color;
};

const SKIN = ['#c79a76', '#a9744f', '#8a5a3c', '#d6ae8c'].map((c) => new THREE.Color(c));
const CLOTHES = ['#3d4656', '#5b4a3f', '#7a2f2f', '#2e4f4a', '#8a7a5c', '#cfc8b8', '#47315a', '#2b2f3a'].map((c) => new THREE.Color(c));
const LEGS = ['#23262e', '#3a3530', '#2b3442'].map((c) => new THREE.Color(c));

// Jointed people rather than cards: at street level they are the scale that makes the tower big.
export const buildCrowd = (root: THREE.Group, focus: THREE.Vector3[], amount: number) => {
	const rand = mulberry32(28);
	const people: Person[] = [];
	const spawn = (x: number, z: number, target: THREE.Vector3, delay: number) => {
		const home = new THREE.Vector3(x, 0.36, z);
		const dir = target.clone().sub(home);
		dir.y = 0;
		const distance = dir.length();
		dir.normalize();
		const speed = 3.4 + rand() * 1.6;
		people.push({
			home,
			dir,
			speed,
			wakes: delay,
			runFor: distance / speed,
			height: 1.6 + rand() * 0.2,
			seed: rand() * 100,
			hat: rand() < 0.4,
			coat: CLOTHES[Math.floor(rand() * CLOTHES.length)],
		});
	};

	// They leave the facades around the plaza and gather on open ground, looking up.
	focus.forEach((target, f) => {
		for (let i = 0; i < Math.round(46 * amount); i++) {
			const a = rand() * Math.PI * 2;
			const r = 44 + rand() * 46;
			const goal = target.clone().add(new THREE.Vector3((rand() - 0.5) * 26, 0, (rand() - 0.5) * 26));
			spawn(target.x + Math.cos(a) * r, target.z + Math.sin(a) * r, goal, f * 0.3 + rand() * 2.4);
		}
	});

	const count = people.length;
	const blank = () => Array.from({length: count}, () => ({matrix: new THREE.Matrix4()}));
	const limb = (w: number, l: number) => new THREE.BoxGeometry(w, l, w).translate(0, -l / 2, 0);
	const torso = instanced(new THREE.BoxGeometry(0.44, 0.62, 0.25).translate(0, 0.31, 0), lambert({}), blank());
	const head = instanced(new THREE.IcosahedronGeometry(0.115, 1), lambert({flatShading: true}), blank());
	const hat = instanced(new THREE.CylinderGeometry(0.1, 0.17, 0.11, 8), lambert({color: '#2a2622'}), blank());
	const upperArm = instanced(limb(0.1, 0.3), lambert({}), Array.from({length: count * 2}, () => ({matrix: new THREE.Matrix4()})));
	const lowerArm = instanced(limb(0.085, 0.28), lambert({}), Array.from({length: count * 2}, () => ({matrix: new THREE.Matrix4()})));
	const upperLeg = instanced(limb(0.15, 0.42), lambert({}), Array.from({length: count * 2}, () => ({matrix: new THREE.Matrix4()})));
	const lowerLeg = instanced(limb(0.12, 0.42), lambert({}), Array.from({length: count * 2}, () => ({matrix: new THREE.Matrix4()})));
	const meshes = [torso, head, hat, upperArm, lowerArm, upperLeg, lowerLeg];
	meshes.forEach((m) => root.add(m));

	people.forEach((p, i) => {
		torso.setColorAt(i, p.coat);
		head.setColorAt(i, SKIN[i % SKIN.length]);
		const legs = LEGS[i % LEGS.length];
		for (let s = 0; s < 2; s++) {
			upperArm.setColorAt(i * 2 + s, p.coat);
			lowerArm.setColorAt(i * 2 + s, SKIN[i % SKIN.length]);
			upperLeg.setColorAt(i * 2 + s, legs);
			lowerLeg.setColorAt(i * 2 + s, legs);
		}
	});

	const body = new THREE.Matrix4();
	const a = new THREE.Matrix4();
	const b = new THREE.Matrix4();
	const out = new THREE.Matrix4();
	const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
	const euler = new THREE.Euler();
	const q = new THREE.Quaternion();
	const v = new THREE.Vector3();
	const one = new THREE.Vector3(1, 1, 1);
	const up = new THREE.Vector3(0, 1, 0);

	const joint = (parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, target: THREE.Matrix4) => {
		euler.set(rx, 0, 0);
		q.setFromEuler(euler);
		v.set(x, y, z);
		a.compose(v, q, one);
		return target.multiplyMatrices(parent, a);
	};

	const update = (t: number, quakeStart: number) => {
		people.forEach((p, i) => {
			const start = quakeStart + p.wakes;
			if (t < start) {
				[torso, head, hat].forEach((m) => m.setMatrixAt(i, hidden));
				for (let s = 0; s < 2; s++) [upperArm, lowerArm, upperLeg, lowerLeg].forEach((m) => m.setMatrixAt(i * 2 + s, hidden));
				return;
			}
			const age = t - start;
			const moving = Math.min(age, p.runFor);
			const running = age < p.runFor ? 1 : 0;
			const stride = (age * p.speed * 1.5 + p.seed) * running;
			const swing = running ? Math.sin(stride) : 0;
			const bob = running ? Math.abs(Math.cos(stride)) * 0.06 : Math.sin(t * 1.4 + p.seed) * 0.006;
			const lean = running ? 0.28 : -0.05;
			const facing = Math.atan2(p.dir.x, p.dir.z);
			const scale = p.height / 1.7;
			v.copy(p.home).addScaledVector(p.dir, p.speed * moving);
			v.y += 0.86 * scale + bob;
			euler.set(lean, facing, 0, 'YXZ');
			q.setFromEuler(euler);
			body.compose(v, q, new THREE.Vector3(scale, scale, scale));
			torso.setMatrixAt(i, body);

			// Once safe they look up at the tower.
			joint(body, 0, 0.75, 0, running ? -0.2 : -0.55, b);
			head.setMatrixAt(i, b);
			if (p.hat) hat.setMatrixAt(i, out.multiplyMatrices(b, new THREE.Matrix4().makeTranslation(0, 0.1, 0)));
			else hat.setMatrixAt(i, hidden);

			for (let s = 0; s < 2; s++) {
				const side = s ? 1 : -1;
				const phase = side * swing;
				joint(body, side * 0.27, 0.58, 0, phase * 1.1 + (running ? 0 : 0.05), b);
				upperArm.setMatrixAt(i * 2 + s, b);
				joint(b, 0, -0.3, 0, running ? -1.1 : -0.1, out);
				lowerArm.setMatrixAt(i * 2 + s, out);
				joint(body, side * 0.12, 0, 0, -phase * 1.0 - lean, b);
				upperLeg.setMatrixAt(i * 2 + s, b);
				joint(b, 0, -0.42, 0, running ? Math.max(0, phase) * 1.3 + 0.2 : 0, out);
				lowerLeg.setMatrixAt(i * 2 + s, out);
			}
		});
		meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
	};

	return {update, up};
};
