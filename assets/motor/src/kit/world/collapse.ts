import * as THREE from 'three';
import {HEROES} from './heroes';
import {canvasTexture, instanced, lambert, mulberry32} from './materials';

export type CollapseMeta = {hz: number; frames: number; bodies: {kind: 'panel' | 'slab' | 'column'; size: [number, number, number]; color: string; hero: number}[]};
export type CollapseData = {meta: CollapseMeta; data: Float32Array};

const DUST_PER_HERO = 34;

// Plays back the baked rigid bodies, and raises the dust that rolls out of each falling building.
export const buildCollapse = (root: THREE.Group, {meta, data}: CollapseData) => {
	const panelTexture = canvasTexture(128, 96, (ctx) => {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, 128, 96);
		ctx.fillStyle = '#39485a';
		ctx.fillRect(34, 22, 60, 52);
		ctx.fillStyle = '#d9d4c8';
		ctx.fillRect(62, 22, 4, 52);
		ctx.fillRect(34, 46, 60, 4);
	});
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const kinds = [
		{kind: 'panel', material: lambert({map: panelTexture})},
		{kind: 'slab', material: lambert({color: '#b9b4a8'})},
		{kind: 'column', material: lambert({color: '#a9a498'})},
	] as const;
	const groups = kinds.map(({kind, material}) => {
		const indices = meta.bodies.flatMap((b, i) => (b.kind === kind ? [i] : []));
		const mesh = instanced(
			geometry,
			material,
			indices.map((i) => ({matrix: new THREE.Matrix4(), color: kind === 'panel' ? new THREE.Color(meta.bodies[i].color) : new THREE.Color('#ffffff')})),
		);
		root.add(mesh);
		return {mesh, indices};
	});

	const rand = mulberry32(19);
	const puffTexture = canvasTexture(128, 128, (ctx) => {
		for (let i = 0; i < 26; i++) {
			const x = 64 + (rand() - 0.5) * 66;
			const y = 64 + (rand() - 0.5) * 66;
			const r = 18 + rand() * 26;
			const g = ctx.createRadialGradient(x, y, 1, x, y, r);
			g.addColorStop(0, 'rgba(255,255,255,.16)');
			g.addColorStop(1, 'rgba(255,255,255,0)');
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, 128, 128);
		}
	});
	const puffs = HEROES.flatMap((h) =>
		Array.from({length: DUST_PER_HERO}, () => {
			const a = rand() * Math.PI * 2;
			const material = new THREE.SpriteMaterial({map: puffTexture, transparent: true, depthWrite: false, opacity: 0, rotation: rand() * 6.28, fog: true});
			const sprite = new THREE.Sprite(material);
			root.add(sprite);
			return {
				sprite,
				material,
				x: h.x + (Math.cos(a) * h.w) / 2,
				z: h.z + (Math.sin(a) * h.d) / 2,
				dx: Math.cos(a),
				dz: Math.sin(a),
				delay: h.delay + 0.55 + rand() * 1.5,
				reach: 10 + rand() * 26,
				rise: 4 + rand() * 24,
				size: 9 + rand() * 16,
			};
		}),
	);

	const m = new THREE.Matrix4();
	const p = new THREE.Vector3();
	const p2 = new THREE.Vector3();
	const q = new THREE.Quaternion();
	const q2 = new THREE.Quaternion();
	const s = new THREE.Vector3();
	const dust = new THREE.Color();
	const n = meta.bodies.length;

	const update = (age: number, tint: THREE.Color) => {
		const f = Math.max(0, Math.min(meta.frames - 1.001, age * meta.hz));
		const f0 = Math.floor(f);
		const k = f - f0;
		groups.forEach(({mesh, indices}) => {
			indices.forEach((body, i) => {
				const a = (f0 * n + body) * 7;
				const b = a + n * 7;
				p.set(data[a], data[a + 1], data[a + 2]);
				p2.set(data[b], data[b + 1], data[b + 2]);
				q.set(data[a + 3], data[a + 4], data[a + 5], data[a + 6]);
				q2.set(data[b + 3], data[b + 4], data[b + 5], data[b + 6]);
				p.lerp(p2, k);
				q.slerp(q2, k);
				s.fromArray(meta.bodies[body].size);
				mesh.setMatrixAt(i, m.compose(p, q, s));
			});
			mesh.instanceMatrix.needsUpdate = true;
		});
		dust.set('#d9c9ae').multiply(tint);
		puffs.forEach((d) => {
			const life = age - d.delay;
			if (life < 0 || life > 9) {
				d.material.opacity = 0;
				return;
			}
			const grow = 1 - Math.pow(1 - Math.min(1, life / 3.2), 3);
			d.sprite.position.set(d.x + d.dx * d.reach * grow, 2 + d.rise * grow * (0.4 + 0.6 * Math.min(1, life / 5)), d.z + d.dz * d.reach * grow);
			d.sprite.scale.setScalar(d.size * (0.5 + grow * 1.8));
			d.material.opacity = 0.42 * Math.min(1, life / 0.25) * Math.pow(1 - life / 9, 1.6);
			d.material.color.copy(dust);
		});
	};

	return {update};
};
