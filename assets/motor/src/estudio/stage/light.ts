import * as THREE from 'three';
import type {World} from '../worlds';

const panel = (w: number, h: number, color: [number, number, number], pos: [number, number, number]) => {
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(...color), side: THREE.DoubleSide}));
	mesh.position.set(...pos);
	mesh.lookAt(0, 0, 0);
	return mesh;
};

// A dark room with softboxes: the metal gets its highlights from these shapes, so they need no image file.
export const studioEnvironment = (gl: THREE.WebGLRenderer, world: World) => {
	const room = new THREE.Scene();
	room.background = new THREE.Color(0.2, 0.1, 0.1);
	const [r, g, b] = world.bokeh;
	room.add(panel(30, 7, [r * 1.6, g * 1.6, b * 1.6], [0, 2, -16]));
	room.add(panel(6, 12, [5.5, 4.9, 4.7], [-9, 2.5, 7]));
	room.add(panel(2.2, 12, [7, 6.4, 6.2], [8, 2, 8.5]));
	room.add(panel(26, 26, [1.9, 1.62, 1.62], [0, 12, 1]));
	room.add(panel(40, 40, [0.1, 0.03, 0.03], [0, -9, 0]));
	const pmrem = new THREE.PMREMGenerator(gl);
	const texture = pmrem.fromScene(room, 0.012, 0.1, 60).texture;
	pmrem.dispose();
	return texture;
};

export const studioLights = (scene: THREE.Scene, world: World) => {
	const key = new THREE.DirectionalLight('#fff1ea', 1.25);
	key.position.set(-4, 7, 9);
	const rim = new THREE.DirectionalLight(new THREE.Color(...world.bokeh), 2);
	rim.position.set(3, 3, -12);
	scene.add(key, rim);
};
