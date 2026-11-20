import * as THREE from 'three';
import type {World} from '../../schema';
import {beam, Instance, instanced, lambert, mulberry32, patch, place, shadowDepth, unitBox} from './materials';


// The real tower's silhouette: stacked setbacks, a metal skin of fins and glass, and a lattice mast on top.
export const buildTower = (root: THREE.Group, world: World) => {
	const spec = world.hero.tower!;
	const body = world.hero.height - spec.mast;
	const FLOOR = Math.min(4.2, Math.max(2.8, body / spec.floors));
	const base = new THREE.Color(spec.color);
	const TIERS = spec.tiers.map((t, i) => ({
		from: i ? spec.tiers[i - 1].until : 0,
		to: t.until,
		w: t.width,
		d: t.width * (i ? 1 : 0.86),
		color: base.clone().multiplyScalar(1 + i * 0.03),
	}));
	const rand = mulberry32(44);
	const shells: Instance[] = [];
	const ribs: Instance[] = [];
	const windows: {matrix: THREE.Matrix4; lit: number; off: number}[] = [];
	const metal = new THREE.Color('#7f8d99');
	const light = new THREE.Color('#dfe6ea');

	TIERS.forEach((t, index) => {
		const y0 = t.from * FLOOR;
		const h = (t.to - t.from) * FLOOR;
		shells.push({matrix: place(0, y0, 0, t.w, h, t.d), color: t.color});
		// Roof lip at every setback, and the slab edge of each floor.
		shells.push({matrix: place(0, y0 + h - 0.1, 0, t.w + 1.1, 0.7, t.d + 1.1), color: light});
		for (let f = t.from; f < t.to; f++) {
			const y = f * FLOOR;
			ribs.push({matrix: place(0, y, 0, t.w + 0.34, 0.5, t.d + 0.34), color: metal});
			const face = (span: number, emit: (o: number) => void, step: number) => {
				const n = Math.floor(span / step);
				for (let i = 0; i < n; i++) emit(((i + 0.5) / n - 0.5) * (span - 1.5));
			};
			const glass = (m: THREE.Matrix4) => windows.push({matrix: m, lit: rand() < 0.34 ? 1 : 0, off: 0.25 + rand() * 0.7});
			const step = index === 0 ? 5.4 : 2.9;
			const wh = index === 0 ? 2.5 : 2.35;
			face(t.d, (o) => glass(place(t.w / 2 + 0.07, y + 0.55 + wh / 2, o, step - 0.8, wh, 1, Math.PI / 2)), step);
			face(t.d, (o) => glass(place(-t.w / 2 - 0.07, y + 0.55 + wh / 2, o, step - 0.8, wh, 1, -Math.PI / 2)), step);
			face(t.w, (o) => glass(place(o, y + 0.55 + wh / 2, t.d / 2 + 0.07, step - 0.8, wh, 1)), step);
			face(t.w, (o) => glass(place(o, y + 0.55 + wh / 2, -t.d / 2 - 0.07, step - 0.8, wh, 1, Math.PI)), step);
		}
		// Vertical fins run the height of the tier.
		const fin = index === 0 ? 5.4 : 2.9;
		const nx = Math.floor(t.w / fin);
		const nz = Math.floor(t.d / fin);
		for (let i = 0; i <= nx; i++) {
			const x = -t.w / 2 + 0.75 + (i / nx) * (t.w - 1.5);
			ribs.push({matrix: place(x, y0, t.d / 2 + 0.14, 0.26, h, 0.36), color: metal});
			ribs.push({matrix: place(x, y0, -t.d / 2 - 0.14, 0.26, h, 0.36), color: metal});
		}
		for (let i = 0; i <= nz; i++) {
			const z = -t.d / 2 + 0.75 + (i / nz) * (t.d - 1.5);
			ribs.push({matrix: place(t.w / 2 + 0.14, y0, z, 0.36, h, 0.26), color: metal});
			ribs.push({matrix: place(-t.w / 2 - 0.14, y0, z, 0.36, h, 0.26), color: metal});
		}
	});

	const top = spec.floors * FLOOR;
	const crown = TIERS[TIERS.length - 1].w;
	shells.push({matrix: place(0, top, 0, crown * 0.66, 6, crown * 0.66), color: new THREE.Color('#aeb9c2')});
	shells.push({matrix: place(0, top + 6, 0, crown * 0.42, 3, crown * 0.42), color: new THREE.Color('#98a4ae')});

	// Lattice mast.
	const mastBase = top + 9;
	const mastTop = mastBase + spec.mast;
	const levels = spec.mast > 0 ? 13 : 0;
	const leg = (i: number, level: number) => {
		const y = mastBase + (level / levels) * (mastTop - mastBase);
		const r = 2.5 * (1 - (level / levels) * 0.86);
		return new THREE.Vector3(i < 2 ? r : -r, y, i === 1 || i === 2 ? r : -r);
	};
	const steel = new THREE.Color('#7b8690');
	for (let level = 0; level < levels; level++) {
		for (let i = 0; i < 4; i++) {
			const j = (i + 1) % 4;
			ribs.push({matrix: beam(leg(i, level), leg(i, level + 1), 0.3), color: steel});
			ribs.push({matrix: beam(leg(i, level), leg(j, level + 1), 0.13), color: steel});
			ribs.push({matrix: beam(leg(i, level + 1), leg(j, level + 1), 0.13), color: steel});
		}
	}

	const shellGeometry = unitBox(Math.max(12, spec.floors));
	root.add(instanced(shellGeometry, lambert({vertexColors: true}, {tower: true}), shells));
	root.add(instanced(unitBox(12), lambert({vertexColors: true}, {tower: true}), ribs));

	const winGeo = new THREE.PlaneGeometry(1, 1);
	winGeo.setAttribute('aLit', new THREE.InstancedBufferAttribute(Float32Array.from(windows.map((w) => w.lit)), 1));
	winGeo.setAttribute('aOff', new THREE.InstancedBufferAttribute(Float32Array.from(windows.map((w) => w.off)), 1));
	const glass = lambert({color: '#33485e', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2}, {lit: true, tower: true});
	const winMesh = instanced(winGeo, glass, windows.map((w) => ({matrix: w.matrix})), false);
	root.add(winMesh);

	// Beacons on the mast.
	const beaconMaterial = patch(new THREE.MeshBasicMaterial({color: new THREE.Color(3.2, 0.3, 0.22)}), {tower: true});
	(spec.mast > 0 ? [mastTop, mastBase + spec.mast * 0.4] : []).forEach((y) => {
		const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), beaconMaterial);
		b.position.y = y;
		root.add(b);
	});

	// Ghosts at both ends of the sway, used only by the blueprint.
	const ghosts = [-1, 1].map((sign) => {
		const material = patch(new THREE.MeshBasicMaterial({color: '#5d97ec', transparent: true, opacity: 0, depthWrite: false}), {tower: true, ghost: sign});
		const mesh = new THREE.InstancedMesh(shellGeometry, material, shells.length);
		shells.forEach((s, i) => mesh.setMatrixAt(i, s.matrix));
		mesh.frustumCulled = false;
		mesh.customDepthMaterial = shadowDepth;
		mesh.renderOrder = 5;
		root.add(mesh);
		return material;
	});

	return {beaconMaterial, ghosts};
};
