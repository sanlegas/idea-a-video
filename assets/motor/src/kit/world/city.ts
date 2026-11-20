import * as THREE from 'three';
import type {World} from '../../schema';
import {overlapsHero} from './heroes';
import {canvasTexture, Instance, instanced, lambert, mulberry32, patch, place, unitBox} from './materials';

export const BLOCK = 74;
export const STREET = 18;
export const PITCH = BLOCK + STREET;
const RANGE = 14;
const WINDOW_RADIUS = 620;

type Win = {matrix: THREE.Matrix4; lit: number; off: number};

const windowsOn = (out: Win[], x: number, z: number, w: number, d: number, h: number, rand: () => number) => {
	const rows = Math.floor((h - 4.2) / 3.5);
	const face = (count: number, along: number, emit: (o: number, y: number) => void) => {
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < count; c++) emit(((c + 0.5) / count - 0.5) * along, 5.8 + r * 3.5);
		}
	};
	const push = (m: THREE.Matrix4) => out.push({matrix: m, lit: rand() < 0.26 ? 1 : 0, off: rand() * 0.95});
	const cx = Math.max(1, Math.floor(w / 4.8));
	const cz = Math.max(1, Math.floor(d / 4.8));
	face(cz, d - 3, (o, y) => push(place(x + w / 2 + 0.05, y, z + o, 1.7, 2.1, 1, Math.PI / 2)));
	face(cz, d - 3, (o, y) => push(place(x - w / 2 - 0.05, y, z + o, 1.7, 2.1, 1, -Math.PI / 2)));
	face(cx, w - 3, (o, y) => push(place(x + o, y, z + d / 2 + 0.05, 1.7, 2.1, 1)));
	face(cx, w - 3, (o, y) => push(place(x + o, y, z - d / 2 - 0.05, 1.7, 2.1, 1, Math.PI)));
};

export const buildCity = (root: THREE.Group, world: World, keepHeroLots: boolean) => {
	const rand = mulberry32(1957);
	const walls: Instance[] = [];
	const lips: Instance[] = [];
	const shops: Instance[] = [];
	const tanks: Instance[] = [];
	const slabs: Instance[] = [];
	const windows: Win[] = [];
	const trunks: Instance[] = [];
	const crowns: Instance[] = [];
	const poles: Instance[] = [];
	const lamps: number[] = [];

	const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), lambert({color: world.palette.street}));
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	root.add(ground);

	const park = new Set(['-2:0', '-2:-1', '-3:0', '-3:-1']);
	// Open ground in front of the tower, so hero shots have air around it.
	const plaza = new Set(['0:1', '1:1', '-1:1', '1:0']);
	const bellasArtes = world.landmark === 'bellas_artes' ? '-1:-1' : '';
	const shopColors = ['#7c3b2e', '#2f5d57', '#37466b', '#8a6a2c', '#5a3a4f'].map((c) => new THREE.Color(c));
	const roof = new THREE.Color('#8d8c88');
	const tankColor = new THREE.Color('#d8d3c6');
	const leaf = new THREE.Color(world.palette.foliage);
	const leafColors = [1, 0.88, 1.1, 1.22].map((k) => leaf.clone().multiplyScalar(k));
	const bark = new THREE.Color('#6b4a30');
	const poleColor = new THREE.Color('#2c3034');

	const tree = (x: number, z: number, s: number) => {
		trunks.push({matrix: place(x, 0.4, z, 0.42 * s, 3.4 * s, 0.42 * s), color: bark});
		const c = leafColors[Math.floor(rand() * leafColors.length)];
		for (let k = 0; k < 3; k++) {
			const r = (2.1 + rand() * 1.1) * s;
			crowns.push({
				matrix: new THREE.Matrix4().compose(
					new THREE.Vector3(x + (rand() - 0.5) * 2.4 * s, 0.4 + (3.6 + rand() * 1.7) * s, z + (rand() - 0.5) * 2.4 * s),
					new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3)),
					new THREE.Vector3(r, r * 0.86, r),
				),
				color: c,
			});
		}
	};

	for (let i = -RANGE; i <= RANGE; i++) {
		for (let j = -RANGE; j <= RANGE; j++) {
			const cx = i * PITCH;
			const cz = j * PITCH;
			const key = `${i}:${j}`;
			const open = plaza.has(key);
			const color = park.has(key) ? world.palette.foliage : open ? new THREE.Color(world.palette.ground).multiplyScalar(1.1) : world.palette.ground;
			slabs.push({matrix: place(cx, 0, cz, BLOCK, 0.35, BLOCK), color: new THREE.Color(color)});
			const dist = Math.hypot(cx, cz);
			if (dist < 720) {
				for (const [dx, dz] of [
					[-1, -1],
					[1, -1],
					[-1, 1],
					[1, 1],
				]) {
					const px = cx + (dx * BLOCK) / 2;
					const pz = cz + (dz * BLOCK) / 2;
					poles.push({matrix: place(px, 0.3, pz, 0.24, 8.4, 0.24), color: poleColor});
					lamps.push(px, 8.7, pz);
				}
			}
			if ((i === 0 && j === 0) || open || key === bellasArtes) continue;
			if (park.has(key)) {
				for (let t = 0; t < 30; t++) tree(cx + (rand() - 0.5) * 66, cz + (rand() - 0.5) * 66, 1 + rand() * 0.5);
				continue;
			}
			const lots = 3;
			const lot = BLOCK / lots;
			for (let a = 0; a < lots; a++) {
				for (let b = 0; b < lots; b++) {
					if (a === 1 && b === 1) continue;
					if (rand() > 0.4 + world.density * 0.6) continue;
					const w = lot * (0.8 + rand() * 0.17);
					const d = lot * (0.8 + rand() * 0.17);
					const x = cx - BLOCK / 2 + lot * (a + 0.5);
					const z = cz - BLOCK / 2 + lot * (b + 0.5);
					if (keepHeroLots && overlapsHero(x, z, w, d)) continue;
					const tall = dist < 420 ? 1 : 0.72;
					const [lowest, highest] = world.floors;
					const h = (lowest + rand() * rand() * (highest - lowest)) * 3.5 * tall + 3.5;
					const c = new THREE.Color(world.palette.buildings[Math.floor(rand() * world.palette.buildings.length)]);
					walls.push({matrix: place(x, 0, z, w, h, d), color: c});
					lips.push({matrix: place(x, h, z, w + 0.5, 0.8, d + 0.5), color: c.clone().multiplyScalar(1.07)});
					lips.push({matrix: place(x, h + 0.75, z, w - 1, 0.08, d - 1), color: roof});
					shops.push({matrix: place(x, 0, z, w + 0.16, 3.8, d + 0.16), color: shopColors[Math.floor(rand() * shopColors.length)]});
					if (dist < WINDOW_RADIUS) windowsOn(windows, x, z, w, d, h, rand);
					if (rand() < 0.62) {
						const tx = x + (rand() - 0.5) * w * 0.55;
						const tz = z + (rand() - 0.5) * d * 0.55;
						tanks.push({matrix: place(tx, h + 2.3, tz, 1.7, 2.3, 1.7), color: tankColor});
						tanks.push({matrix: place(tx, h + 0.8, tz, 0.24, 1.6, 0.24), color: roof});
					}
				}
			}
			if (dist < 640 && rand() < world.trees * 1.4) {
				for (let k = -1; k <= 1; k += 2) {
					tree(cx + BLOCK / 2 - 1.8, cz + k * 22, 0.9);
					tree(cx + k * 22, cz + BLOCK / 2 - 1.8, 0.9);
				}
			}
		}
	}

	// Plaza edge trees frame the tower without touching the camera paths.
	[
		[-30, 58],
		[-18, 72],
		[-34, 120],
		[-58, 104],
		[126, 62],
		[120, 118],
		[66, 58],
	].forEach(([x, z]) => tree(x, z, 1.2));

	const box = unitBox();
	root.add(instanced(box, lambert({vertexColors: true}), slabs, false));
	root.add(instanced(unitBox(2), lambert({vertexColors: true}), walls));
	root.add(instanced(box, lambert({vertexColors: true}), lips));
	root.add(instanced(box, lambert({vertexColors: true}), shops));
	root.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0), lambert({}), tanks));
	root.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), lambert({}), trunks));
	root.add(instanced(new THREE.IcosahedronGeometry(1, 1), lambert({flatShading: true}), crowns));
	root.add(instanced(box, lambert({vertexColors: true}), poles, false));

	// Lane dashes and zebra crossings.
	const dashes: Instance[] = [];
	const span = RANGE * PITCH;
	const flat = (x: number, z: number, sx: number, sz: number) => ({
		matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, 0.06, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(sx, sz, 1)),
	});
	for (let i = -RANGE; i <= RANGE; i++) {
		for (let s = -span; s < span; s += 13) {
			dashes.push(flat((i + 0.5) * PITCH, s, 0.5, 5));
			dashes.push(flat(s, (i + 0.5) * PITCH, 5, 0.5));
		}
	}
	for (const px of [46, -46]) {
		for (const pz of [46, -46]) {
			for (let k = -3; k <= 3; k++) {
				dashes.push(flat(px + k * 2.4, pz + 12, 1.2, 4));
				dashes.push(flat(px + 12, pz + k * 2.4, 4, 1.2));
			}
		}
	}
	root.add(instanced(new THREE.PlaneGeometry(1, 1), lambert({color: '#e8e3d6'}), dashes, false));

	// Windows of every building, one instanced quad each.
	const winGeo = new THREE.PlaneGeometry(1, 1);
	winGeo.setAttribute('aLit', new THREE.InstancedBufferAttribute(Float32Array.from(windows.map((w) => w.lit)), 1));
	winGeo.setAttribute('aOff', new THREE.InstancedBufferAttribute(Float32Array.from(windows.map((w) => w.off)), 1));
	const frame = canvasTexture(64, 80, (ctx) => {
		ctx.fillStyle = '#d7d2c6';
		ctx.fillRect(0, 0, 64, 80);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(7, 7, 50, 66);
		ctx.fillStyle = '#d7d2c6';
		ctx.fillRect(29, 7, 6, 66);
		ctx.fillRect(7, 32, 50, 5);
	});
	const glass = lambert({color: '#3a4a5c', map: frame, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2}, {lit: true});
	root.add(instanced(winGeo, glass, windows.map((w) => ({matrix: w.matrix})), false));

	if (bellasArtes) addBellasArtes(root, -PITCH, -PITCH);

	// Street lamps: their glow belongs to the night and dies with the blackout.
	const lampGeo = new THREE.BufferGeometry();
	lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
	const glow = canvasTexture(64, 64, (ctx) => {
		const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
		g.addColorStop(0, 'rgba(255,225,170,1)');
		g.addColorStop(0.28, 'rgba(255,205,130,.55)');
		g.addColorStop(1, 'rgba(255,190,110,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 64, 64);
	});
	const lampMaterial = new THREE.PointsMaterial({map: glow, size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0});
	root.add(new THREE.Points(lampGeo, lampMaterial));

	return {lampMaterial};
};

// The Palacio de Bellas Artes across the street names the place at a glance: marble block, tiled dome.
const addBellasArtes = (root: THREE.Group, x: number, z: number) => {
	const stone = new THREE.Color('#e4dccb');
	const shade = new THREE.Color('#cfc6b4');
	const parts: Instance[] = [
		{matrix: place(x, 0, z, 64, 4, 60), color: shade},
		{matrix: place(x, 4, z, 58, 18, 54), color: stone},
		{matrix: place(x, 22, z, 60, 1.6, 56), color: shade},
		{matrix: place(x, 23.6, z, 36, 8, 36), color: stone},
	];
	for (let i = -3; i <= 3; i++) {
		parts.push({matrix: place(x + i * 7.6, 4, z + 27.6, 1.5, 18, 1.5), color: shade});
	}
	root.add(instanced(unitBox(), lambert({vertexColors: true}), parts));
	const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), patch(new THREE.MeshLambertMaterial({color: '#d99a3e', flatShading: true})));
	dome.position.set(x, 31.6, z);
	dome.scale.y = 1.12;
	dome.castShadow = true;
	root.add(dome);
	const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 5, 12), lambert({color: '#c9b37a'}));
	lantern.position.set(x, 51, z);
	lantern.castShadow = true;
	root.add(lantern);
};
