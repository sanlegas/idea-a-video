import * as THREE from 'three';
import {mulberry32} from '../film';
import type {World} from '../worlds';

export const buildSky = (root: THREE.Object3D, world: World, floor: boolean) => {
	const uniforms = {uHorizon: {value: new THREE.Color(...world.horizon)}, uZenith: {value: new THREE.Color(...world.zenith)}, uFloor: {value: floor ? 1 : 0}};
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(300, 32, 24),
		new THREE.ShaderMaterial({
			side: THREE.BackSide,
			depthWrite: false,
			uniforms,
			vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
			fragmentShader: `varying vec3 vDir; uniform vec3 uHorizon, uZenith; uniform float uFloor;
			void main(){
				float h = normalize(vDir).y;
				// Without a floor there is no horizon line: the same glow continues below.
				if (uFloor < 0.5) h = abs(h) * 0.6;
				vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.42, pow(max(h, 0.0), 0.72)));
				c += uHorizon * 0.42 * exp(-h * h * 160.0);
				if (uFloor > 0.5) c *= smoothstep(-0.03, 0.0, h);
				gl_FragColor = vec4(c, 1.0);
			}`,
		}),
	);
	dome.renderOrder = -20;
	dome.frustumCulled = false;
	root.add(dome);
	return dome;
};

type Disc = {position: THREE.Vector3; size: number; tone: number; phase: number};

const discs = (seed: number, count: number, make: (rand: () => number) => Omit<Disc, 'phase'>) => {
	const rand = mulberry32(seed);
	return Array.from({length: count}, () => ({...make(rand), phase: rand() * 6.28}));
};

// Out-of-focus lights on a far ring. They fill the sky faintly and crowd together at the horizon.
export const buildBokeh = (root: THREE.Object3D, world: World, floor: boolean) => {
	const ring = (rand: () => number, r: number) => {
		const a = rand() * Math.PI * 2;
		return [Math.cos(a) * r, Math.sin(a) * r] as const;
	};
	const sky = discs(3, 90, (rand) => {
		const [x, z] = ring(rand, 90 + rand() * 30);
		return {position: new THREE.Vector3(x, 8 + rand() * 62, z), size: 4 + rand() ** 1.6 * 12, tone: 0.05 + rand() * 0.1};
	});
	const band = discs(9, 240, (rand) => {
		const [x, z] = ring(rand, 100 + rand() * 30);
		return {position: new THREE.Vector3(x, floor ? 0.4 + rand() ** 2 * 9 : (rand() - 0.5) * 90, z), size: 3.5 + rand() ** 2 * 11, tone: floor ? 0.2 + rand() ** 2 * 0.9 : 0.1 + rand() ** 2 * 0.3};
	});
	const all: Disc[] = [...sky, ...band];
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
	geometry.setIndex([0, 1, 2, 0, 2, 3]);
	geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(all.flatMap((d) => d.position.toArray())), 3));
	geometry.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(all.flatMap((d) => [d.size, d.tone, d.phase])), 3));
	geometry.instanceCount = all.length;
	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: {uT: {value: 0}, uGain: {value: 1}, uColor: {value: new THREE.Color(...world.bokeh)}},
		vertexShader: `attribute vec3 aCenter; attribute vec3 aData; varying vec2 vP; varying float vTone; uniform float uT, uGain;
		void main(){
			vec3 c = aCenter;
			c.y += sin(uT * 0.3 + aData.z) * 1.1;
			c.x += cos(uT * 0.22 + aData.z) * 1.4;
			vec4 view = viewMatrix * vec4(c, 1.0);
			view.xy += position.xy * aData.x;
			vP = position.xy * 2.0;
			vTone = uGain * aData.y * (0.82 + 0.18 * sin(uT * 0.9 + aData.z * 3.0));
			gl_Position = projectionMatrix * view;
		}`,
		fragmentShader: `varying vec2 vP; varying float vTone; uniform vec3 uColor;
		void main(){
			float d = length(vP);
			float disc = 1.0 - smoothstep(0.86, 1.0, d);
			float lip = smoothstep(0.55, 0.95, d) * 0.28;
			gl_FragColor = vec4(uColor * vTone * (0.72 + lip) * disc, 1.0);
		}`,
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.frustumCulled = false;
	mesh.renderOrder = -10;
	root.add(mesh);
	return material;
};

// Fixed stars around the scene, each with its own brightness.
export const buildStars = (root: THREE.Object3D) => {
	const rand = mulberry32(21);
	const count = 3200;
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const z = rand() * 2 - 1;
		const a = rand() * Math.PI * 2;
		const r = Math.sqrt(1 - z * z);
		positions.set([Math.cos(a) * r * 280, z * 280, Math.sin(a) * r * 280], i * 3);
		const b = 0.12 + rand() ** 4 * 1.8;
		const warm = rand();
		colors.set([b * (0.86 + warm * 0.14), b * 0.92, b * (1 - warm * 0.14)], i * 3);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	const points = new THREE.Points(geometry, new THREE.PointsMaterial({size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
	points.frustumCulled = false;
	points.renderOrder = -15;
	root.add(points);
	return points;
};
