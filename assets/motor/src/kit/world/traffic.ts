import * as THREE from 'three';
import {PITCH} from './city';
import {instanced, lambert, mulberry32, shadowDepth, unitBox} from './materials';

const RANGE = 7;

// 1950s sedan: a side profile extruded across the car, so it casts a real silhouette.
const sedan = () => {
	const s = new THREE.Shape();
	const points = [
		[-2.35, 0.42],
		[-2.42, 0.82],
		[-2.0, 1.02],
		[-1.05, 1.08],
		[-0.62, 1.56],
		[0.7, 1.56],
		[1.2, 1.08],
		[2.25, 0.98],
		[2.4, 0.72],
		[2.32, 0.42],
	];
	points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
	const g = new THREE.ExtrudeGeometry(s, {depth: 1.76, bevelEnabled: false});
	g.translate(0, 0, -0.88);
	return g;
};

const cabin = () => {
	const s = new THREE.Shape();
	[
		[-0.9, 1.1],
		[-0.56, 1.49],
		[0.66, 1.49],
		[1.04, 1.1],
	].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
	const g = new THREE.ExtrudeGeometry(s, {depth: 1.8, bevelEnabled: false});
	g.translate(0, 0, -0.9);
	return g;
};

type Vehicle = {along: boolean; line: number; offset: number; speed: number; dir: number; bus: boolean; color: THREE.Color};

export const buildTraffic = (root: THREE.Group, amount: number) => {
	const rand = mulberry32(44);
	const span = RANGE * PITCH;
	const colors = ['#c9463a', '#e7e4dc', '#3b6fb5', '#2d8c6a', '#d8a93c', '#3f4148', '#7b9ab0'].map((c) => new THREE.Color(c));
	const vehicles: Vehicle[] = Array.from({length: Math.round(130 * amount)}, (_, i) => {
		const dir = rand() < 0.5 ? 1 : -1;
		return {
			along: rand() < 0.5,
			line: (Math.floor(rand() * 14) - 7 + 0.5) * PITCH + dir * 4.4,
			offset: rand() * span * 2,
			speed: 9 + rand() * 9,
			dir,
			bus: i % 11 === 0,
			color: i % 11 === 0 ? new THREE.Color('#d8c24a') : colors[Math.floor(rand() * colors.length)],
		};
	});
	const cars = vehicles.filter((v) => !v.bus);
	const buses = vehicles.filter((v) => v.bus);
	const zero = cars.map(() => ({matrix: new THREE.Matrix4(), color: undefined as THREE.Color | undefined}));
	const carBody = instanced(sedan(), lambert({flatShading: true}), cars.map((c) => ({matrix: new THREE.Matrix4(), color: c.color})));
	const carGlass = instanced(cabin(), lambert({color: '#1f2733', flatShading: true}), zero, false);
	const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12).rotateX(Math.PI / 2);
	const wheels = instanced(wheelGeo, lambert({color: '#17181b'}), Array.from({length: cars.length * 4}, () => ({matrix: new THREE.Matrix4()})), false);
	const busBody = instanced(unitBox(), lambert({vertexColors: true}), buses.map((b) => ({matrix: new THREE.Matrix4(), color: b.color})));
	const busGlass = instanced(unitBox(), lambert({color: '#22303c'}), buses.map(() => ({matrix: new THREE.Matrix4()})), false);
	[carBody, carGlass, wheels, busBody, busGlass].forEach((m) => root.add(m));

	const headlightGeo = new THREE.BufferGeometry();
	const headlightPos = new Float32Array(vehicles.length * 3);
	headlightGeo.setAttribute('position', new THREE.BufferAttribute(headlightPos, 3));
	const headlights = new THREE.Points(headlightGeo, new THREE.PointsMaterial({color: '#ffe7b0', size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
	headlights.frustumCulled = false;
	root.add(headlights);

	const m = new THREE.Matrix4();
	const child = new THREE.Matrix4();
	const out = new THREE.Matrix4();
	const pos = new THREE.Vector3();
	const q = new THREE.Quaternion();
	const scale = new THREE.Vector3(1, 1, 1);
	const y = new THREE.Vector3(0, 1, 0);

	const placement = (v: Vehicle, t: number, stopAt: number) => {
		// Drivers brake when the ground starts to move.
		const travelled = t < stopAt ? v.speed * t : v.speed * (stopAt + 1.1 * (1 - Math.exp(-(t - stopAt) / 1.1)));
		const period = span * 2;
		const s = (((v.offset + v.dir * travelled) % period) + period) % period - span;
		pos.set(v.along ? v.line : s, 0.05, v.along ? s : v.line);
		const heading = v.along ? (v.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : v.dir > 0 ? 0 : Math.PI;
		q.setFromAxisAngle(y, heading);
		return heading;
	};

	const update = (t: number, stopAt: number, headlightGlow: number) => {
		cars.forEach((v, i) => {
			placement(v, t, stopAt);
			m.compose(pos, q, scale);
			carBody.setMatrixAt(i, m);
			carGlass.setMatrixAt(i, m);
			[
				[-1.45, 0.86],
				[1.5, 0.86],
				[-1.45, -0.86],
				[1.5, -0.86],
			].forEach(([x, z], k) => {
				child.makeTranslation(x, 0.38, z);
				out.multiplyMatrices(m, child);
				wheels.setMatrixAt(i * 4 + k, out);
			});
			const f = new THREE.Vector3(2.5, 0.8, 0).applyQuaternion(q).add(pos);
			headlightPos.set([f.x, f.y, f.z], i * 3);
		});
		buses.forEach((v, i) => {
			placement(v, t, stopAt);
			m.compose(pos, q, new THREE.Vector3(10.5, 3.1, 2.5));
			m.multiply(child.makeTranslation(0, 0.13, 0));
			busBody.setMatrixAt(i, m);
			m.compose(pos, q, new THREE.Vector3(10.6, 0.9, 2.56));
			m.multiply(child.makeTranslation(0, 2.3, 0));
			busGlass.setMatrixAt(i, m);
			const f = new THREE.Vector3(5.4, 1, 0).applyQuaternion(q).add(pos);
			headlightPos.set([f.x, f.y, f.z], (cars.length + i) * 3);
		});
		[carBody, carGlass, wheels, busBody, busGlass].forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
		headlightGeo.attributes.position.needsUpdate = true;
		(headlights.material as THREE.PointsMaterial).opacity = headlightGlow;
	};

	return {update, shadowDepth};
};
