import * as THREE from 'three';
import type {World} from '../../schema';
import {instanced, lambert, mulberry32, patch, place, type Instance} from './materials';

// Every environment other than the city: the kit offers these, the art step chooses.
export const buildGround = (root: THREE.Group, world: World) => {
	if (world.environment === 'coast') {
		const sea = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200, 300, 300), patch(new THREE.MeshLambertMaterial({color: world.palette.water, flatShading: true}), {waves: true}));
		sea.rotation.x = -Math.PI / 2;
		sea.receiveShadow = true;
		root.add(sea);
		return;
	}
	const rand = mulberry32(7);
	const hills = world.environment === 'open';
	const geometry = new THREE.PlaneGeometry(6000, 6000, hills ? 180 : 1, hills ? 180 : 1);
	if (hills) {
		const pos = geometry.attributes.position;
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i);
			const y = pos.getY(i);
			const far = Math.min(1, Math.max(0, (Math.hypot(x, y) - 260) / 700));
			pos.setZ(i, (Math.sin(x * 0.006) * Math.cos(y * 0.005) * 34 + Math.sin(x * 0.017 + 1) * 10 + Math.cos(y * 0.013) * 12) * far);
		}
		geometry.computeVertexNormals();
	}
	const floor = new THREE.Mesh(geometry, lambert({color: world.palette.ground, flatShading: hills}));
	floor.rotation.x = -Math.PI / 2;
	floor.receiveShadow = true;
	root.add(floor);
	if (!hills) return;
	const trunks: Instance[] = [];
	const crowns: Instance[] = [];
	const leaf = new THREE.Color(world.palette.foliage);
	const bark = new THREE.Color('#6b4a30');
	for (let i = 0; i < 520 * world.trees; i++) {
		const a = rand() * Math.PI * 2;
		const r = 90 + rand() * 900;
		const x = Math.cos(a) * r;
		const z = Math.sin(a) * r;
		const s = 1.2 + rand() * 1.6;
		trunks.push({matrix: place(x, -1, z, 0.5 * s, 4 * s, 0.5 * s), color: bark});
		crowns.push({matrix: place(x, 4 * s, z, 3.6 * s, 3.2 * s, 3.6 * s), color: leaf.clone().multiplyScalar(0.86 + rand() * 0.34)});
	}
	if (trunks.length) {
		root.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), lambert({}), trunks));
		root.add(instanced(new THREE.IcosahedronGeometry(0.5, 1), lambert({flatShading: true}), crowns));
	}
};
