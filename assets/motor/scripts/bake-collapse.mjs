// Rigid-body collapse baked ahead of the render, so every frame of the film sees the same rubble.
import RAPIER from '@dimforge/rapier3d-compat';
import {readFileSync, writeFileSync} from 'node:fs';

const source = readFileSync('src/kit/world/heroes.ts', 'utf8');
const FLOOR_H = Number(/FLOOR_H = ([\d.]+)/.exec(source)[1]);
const HEROES = [...source.matchAll(/\{x: (\d+), z: (\d+), w: (\d+), d: (\d+), floors: (\d+), color: '([^']+)', delay: ([\d.]+)\}/g)].map((m) => ({
	x: +m[1],
	z: +m[2],
	w: +m[3],
	d: +m[4],
	floors: +m[5],
	color: m[6],
	delay: +m[7],
}));

await RAPIER.init();
const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
world.timestep = 1 / 120;
world.createCollider(RAPIER.ColliderDesc.cuboid(900, 1, 900).setTranslation(0, -1, 0).setFriction(0.9));

let seed = 57;
const rnd = () => {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 4294967296;
};

const bodies = [];
const add = (hero, kind, floor, x, y, z, sx, sy, sz, ry = 0) => {
	const q = {x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2)};
	const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q));
	const density = kind === 'panel' ? 300 : 900;
	world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setFriction(0.7).setRestitution(0.05).setDensity(density), body);
	bodies.push({body, hero, kind, floor, size: [sx, sy, sz], color: HEROES[hero].color});
};

HEROES.forEach((h, hi) => {
	const panelW = 5;
	const t = 0.34;
	for (let f = 0; f < h.floors; f++) {
		const y = f * FLOOR_H;
		// Four interior columns carry each floor, as the real frames did.
		for (const [cx, cz] of [
			[-0.28, -0.28],
			[0.28, -0.28],
			[-0.28, 0.28],
			[0.28, 0.28],
		]) {
			add(hi, 'column', f, h.x + cx * h.w, y + (FLOOR_H - t) / 2, h.z + cz * h.d, 0.9, FLOOR_H - t - 0.01, 0.9);
		}
		const nx = Math.round(h.w / panelW);
		const nz = Math.round(h.d / panelW);
		for (let i = 0; i < nx; i++) {
			const px = h.x - h.w / 2 + (h.w / nx) * (i + 0.5);
			add(hi, 'panel', f, px, y + (FLOOR_H - t) / 2, h.z + h.d / 2 - t / 2, h.w / nx - 0.02, FLOOR_H - t - 0.01, t);
			add(hi, 'panel', f, px, y + (FLOOR_H - t) / 2, h.z - h.d / 2 + t / 2, h.w / nx - 0.02, FLOOR_H - t - 0.01, t);
		}
		for (let i = 0; i < nz; i++) {
			const pz = h.z - h.d / 2 + (h.d / nz) * (i + 0.5);
			add(hi, 'panel', f, h.x + h.w / 2 - t / 2, y + (FLOOR_H - t) / 2, pz, t, FLOOR_H - t - 0.01, h.d / nz - 0.02);
			add(hi, 'panel', f, h.x - h.w / 2 + t / 2, y + (FLOOR_H - t) / 2, pz, t, FLOOR_H - t - 0.01, h.d / nz - 0.02);
		}
		const sx = 3;
		const sz = 3;
		for (let a = 0; a < sx; a++) {
			for (let b = 0; b < sz; b++) {
				add(hi, 'slab', f, h.x - h.w / 2 + (h.w / sx) * (a + 0.5), y + FLOOR_H - t / 2, h.z - h.d / 2 + (h.d / sz) * (b + 0.5), h.w / sx - 0.03, t, h.d / sz - 0.03);
			}
		}
	}
});

const HZ = 30;
const DURATION = 9;
const STEPS_PER_FRAME = 120 / HZ;
const frames = DURATION * HZ;
const data = new Float32Array(frames * bodies.length * 7);
const released = new Set();

const release = (hi) => {
	released.add(hi);
	const h = HEROES[hi];
	bodies.forEach((b) => {
		if (b.hero !== hi) return;
		b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
		// The ground floor gives way first: its columns vanish and its walls are thrown out.
		if (b.floor === 0 && b.kind === 'column') world.removeRigidBody(b.body), (b.gone = true);
		if (b.floor <= 1 && b.kind === 'panel') {
			const p = b.body.translation();
			const dx = p.x - h.x;
			const dz = p.z - h.z;
			const len = Math.hypot(dx, dz) || 1;
			const m = b.body.mass();
			b.body.applyImpulse({x: (dx / len) * m * (3 + rnd() * 3), y: 0, z: (dz / len) * m * (3 + rnd() * 3)}, true);
		}
		// A lean grows with height, so the mass falls off-center and tears the stack apart.
		if (!b.gone) {
			const p = b.body.translation();
			const lean = (p.y / (h.floors * FLOOR_H)) * (1.4 + rnd() * 0.6);
			const m = b.body.mass();
			b.body.applyImpulse({x: m * lean * (hi % 2 ? -1 : 1), y: 0, z: m * lean * 0.4}, true);
		}
	});
};

const t0 = Date.now();
for (let frame = 0; frame < frames; frame++) {
	const t = frame / HZ;
	HEROES.forEach((h, hi) => {
		if (!released.has(hi) && t >= h.delay) release(hi);
	});
	for (let s = 0; s < STEPS_PER_FRAME; s++) world.step();
	bodies.forEach((b, i) => {
		const o = (frame * bodies.length + i) * 7;
		if (b.gone) {
			data.set([0, -50, 0, 0, 0, 0, 1], o);
			return;
		}
		const p = b.body.translation();
		const q = b.body.rotation();
		data.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], o);
	});
}

writeFileSync('public/collapse.bin', Buffer.from(data.buffer));
writeFileSync(
	'public/collapse.json',
	JSON.stringify({hz: HZ, frames, bodies: bodies.map((b) => ({kind: b.kind, size: b.size, color: b.color, hero: b.hero}))}),
);
const moved = data.slice((frames - 1) * bodies.length * 7, frames * bodies.length * 7);
let low = 0;
for (let i = 0; i < bodies.length; i++) if (moved[i * 7 + 1] < 7) low++;
console.log(`${bodies.length} cuerpos, ${frames} frames, ${(data.byteLength / 1e6).toFixed(1)} MB, ${low} en escombros, ${Date.now() - t0} ms`);
