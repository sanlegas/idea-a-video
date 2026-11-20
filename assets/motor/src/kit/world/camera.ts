import gsap from 'gsap';
import * as THREE from 'three';
import type {Stage} from './stage';

export type Pose = {pos: THREE.Vector3; look: THREE.Vector3; fov: number};
export type Segment = {start: number; end: number; shot: string};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const curve = (...points: [number, number, number][]) => new THREE.CatmullRomCurve3(points.map((p) => v(...p)), false, 'centripetal');
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

const soft = gsap.parseEase('sine.inOut');
const settle = gsap.parseEase('power2.out');
const glide = gsap.parseEase('power1.inOut');
const fall = gsap.parseEase('power3.in');
const whipEase = gsap.parseEase('expo.inOut');
const rise = gsap.parseEase('power2.inOut');

const WHIP = 0.75;

// Shots are authored for a 166 m protagonist and scaled to the real one.
const buildShots = ({scale: s, cutZ, depth: D, height: H}: Stage) => {
	const hero = (p: THREE.Vector3) => {
		p.multiplyScalar(s);
		return p.setY(Math.max(1.9, p.y));
	};
	// Where a shot looks follows the protagonist's real height, so long low objects stay in frame.
	const aim = (p: THREE.Vector3) => v(p.x * s, (p.y / 166) * H, p.z * s);
	const z0 = cutZ + D * 5.2;
	const P = {
		push: curve([360, 300, 640], [270, 220, 470], [190, 150, 330]),
		orbit: curve([120, 170, 305], [165, 150, 270], [215, 128, 235]),
		street: curve([46, 13, 352], [46, 11, 330], [46, 9.5, 306]),
		low: curve([96, 2, 132], [84, 2.4, 118], [70, 3.4, 102]),
		top: curve([92, 150, 150], [72, 172, 120], [44, 186, 92]),
		flex: curve([-30, 96, 1320], [0, 96, 1290], [30, 96, 1260]),
		pull: curve([150, 44, 230], [230, 130, 400], [340, 270, 620]),
		wide: curve([0, -D * 0.6, z0], [0, -D * 0.58, z0 * 0.92]),
		waves: curve([0, -D * 0.58, z0 * 0.92], [-D * 0.2, -D * 0.6, z0 * 0.78]),
		detail: curve([-D * 0.2, -D * 0.6, z0 * 0.78], [0, -D * 0.68, z0 * 0.76], [D * 0.16, -D * 0.8, z0 * 0.62]),
	};
	const low0 = P.low.getPoint(1).multiplyScalar(s).setY(3.4);
	const dive = (k: number) => {
		const a = low0.clone();
		const b = low0.clone().multiplyScalar(0.78).setY(1.6);
		const c = v(low0.x * 0.5, -D * 0.12, low0.z * 0.9);
		const d = P.wide.getPoint(0);
		return new THREE.CatmullRomCurve3([a, b, c, d], false, 'centripetal').getPoint(k);
	};
	const shots: Record<string, (u: number) => Pose> = {
		aerial_push: (u) => ({pos: hero(P.push.getPoint(settle(u))), look: aim(v(0, 60, 0).lerp(v(0, 84, 0), u)), fov: 40}),
		orbit: (u) => ({pos: hero(P.orbit.getPoint(glide(u))), look: aim(v(0, 62, 0)), fov: 42}),
		collapse_street: (u) => ({pos: P.street.getPoint(glide(u)), look: v(38, 38, 120).lerp(v(40, 34, 150), u), fov: 46}),
		hero_low: (u) => ({pos: hero(P.low.getPoint(soft(u))), look: aim(v(4, 96, 0).lerp(v(0, 128, 0), soft(u))), fov: 58}),
		hero_top: (u) => ({pos: hero(P.top.getPoint(soft(u))), look: aim(v(0, 158, 0).lerp(v(0, 172, 0), u)), fov: 42}),
		dive: (u) => {
			const k = fall(u);
			const tilt = soft(clamp01(u * 1.2));
			const look = aim(v(0, 128, 0)).lerp(v(low0.x * 0.4, -4, low0.z * 0.6), tilt).lerp(v(0, -D * 0.55, cutZ), clamp01((u - 0.82) / 0.18));
			return {pos: dive(k), look, fov: 58 - k * 16};
		},
		cut_wide: (u) => ({pos: P.wide.getPoint(soft(u)), look: v(0, -D * 0.5, cutZ), fov: 42}),
		cut_waves: (u) => ({pos: P.waves.getPoint(soft(u)), look: v(0, -D * 0.55, cutZ).lerp(v(-D * 0.2, -D * 0.55, cutZ), u), fov: 42}),
		cut_detail: (u) => ({pos: P.detail.getPoint(soft(u)), look: v(0, -D * 0.55, cutZ).lerp(v(D * 0.16, -D * 0.78, cutZ), soft(u)), fov: 42}),
		diagram: (u) => ({pos: P.flex.getPoint(glide(u)).multiplyScalar(s), look: aim(v(0, 92, 0)), fov: 15}),
		pull_back: (u) => ({pos: hero(P.pull.getPoint(rise(u))), look: aim(v(0, 80, 0).lerp(v(0, 120, 0), u)), fov: 40}),
	};
	return shots;
};

const shake = (t: number, quake: number): THREE.Vector3 =>
	v(
		Math.sin(t * 37.1) * 0.5 + Math.sin(t * 23.3) * 0.5,
		Math.sin(t * 31.7 + 1) * 0.5 + Math.sin(t * 19.1) * 0.5,
		Math.sin(t * 27.3 + 2) * 0.5 + Math.sin(t * 41.9) * 0.5,
	).multiplyScalar(quake * 1.5);

export type PoseFn = (t: number, quakeAt?: (t: number) => number) => Pose;

export const makeCamera = (stage: Stage, segments: Segment[]): PoseFn => {
	const SHOTS = buildShots(stage);
	return (t, quakeAt = () => 0) => {
		let index = segments.findIndex((s) => t >= s.start && t < s.end);
		if (index < 0) index = t < segments[0].start ? 0 : segments.length - 1;
		const s = segments[index];
		const pose = (SHOTS[s.shot] ?? SHOTS.orbit)(clamp01((t - s.start) / (s.end - s.start)));
		// Consecutive shots are one flight: the last instants of a shot whip into the next one.
		const next = segments[index + 1];
		if (next && s.shot !== 'dive' && t > s.end - WHIP) {
			const k = whipEase((t - (s.end - WHIP)) / WHIP);
			const to = (SHOTS[next.shot] ?? SHOTS.orbit)(0);
			const lift = pose.pos.y > 0 && to.pos.y > 0 ? Math.sin(Math.PI * k) * Math.min(90 * stage.scale, pose.pos.distanceTo(to.pos) * 0.3) : 0;
			pose.pos.lerp(to.pos, k);
			pose.pos.y += lift;
			pose.look.lerp(to.look, k);
			pose.fov += (to.fov - pose.fov) * k;
		}
		const q = quakeAt(t);
		if (q > 0 && pose.pos.y > 0) {
			pose.pos.add(shake(t, q));
			pose.look.add(shake(t + 3.1, q));
		}
		return pose;
	};
};

const projector = new THREE.PerspectiveCamera();

// Screen position of a world point, so HTML labels can stick to the 3D scene.
export const projectAt = (world: THREE.Vector3, pose: Pose, width: number, height: number) => {
	projector.fov = pose.fov;
	projector.aspect = width / height;
	projector.near = 3;
	projector.far = 9000;
	projector.updateProjectionMatrix();
	projector.position.copy(pose.pos);
	projector.lookAt(pose.look);
	projector.updateMatrixWorld();
	const p = world.clone().project(projector);
	return {x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, visible: p.z < 1};
};
