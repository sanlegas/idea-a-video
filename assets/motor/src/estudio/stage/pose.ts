import * as THREE from 'three';

export type Pose = {pos: THREE.Vector3; look: THREE.Vector3; fov: number};

export const pose = (pos: [number, number, number], look: [number, number, number], fov: number): Pose => ({pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov});
export const mixPose = (a: Pose, b: Pose, k: number): Pose => ({pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k), fov: a.fov + (b.fov - a.fov) * k});

const projector = new THREE.PerspectiveCamera();

// Where a point of the set falls on screen, so an HTML label can ride on a 3D object.
export const project = (point: THREE.Vector3, p: Pose, width: number, height: number) => {
	projector.fov = p.fov;
	projector.aspect = width / height;
	projector.near = 0.1;
	projector.far = 1000;
	projector.updateProjectionMatrix();
	projector.position.copy(p.pos);
	projector.lookAt(p.look);
	projector.updateMatrixWorld();
	const q = point.clone().project(projector);
	return {x: (q.x * 0.5 + 0.5) * width, y: (-q.y * 0.5 + 0.5) * height};
};
