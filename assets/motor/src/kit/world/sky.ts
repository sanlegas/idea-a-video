import * as THREE from 'three';
import {canvasTexture, mulberry32, worldUniforms} from './materials';

export type GradeName = 'night' | 'dawn' | 'day';

const dir = (az: number, el: number) => new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));

type Grade = {
	zenith: string;
	horizon: string;
	fog: string;
	sun: THREE.Vector3;
	disc: string;
	discSize: number;
	night: number;
	key: string;
	keyPower: number;
	sky: string;
	floor: string;
	skyPower: number;
	lift: string;
	saturation: number;
	contrast: number;
};

export const GRADES: Record<GradeName, Grade> = {
	night: {zenith: '#060c20', horizon: '#26355a', fog: '#1c2845', sun: dir(0.95, 0.72), disc: '#e6ebff', discSize: 0.9994, night: 1, key: '#b4c3f2', keyPower: 0.85, sky: '#46567f', floor: '#1b2030', skyPower: 0.72, lift: '#050a1c', saturation: 1.08, contrast: 1.06},
	dawn: {zenith: '#6ea5e0', horizon: '#ffd2a3', fog: '#f4d0ac', sun: dir(1.25, 0.1), disc: '#fff0cf', discSize: 0.998, night: 0, key: '#ffc78f', keyPower: 1.25, sky: '#b6cfee', floor: '#cdb79e', skyPower: 0.6, lift: '#120a04', saturation: 1.1, contrast: 1.04},
	day: {zenith: '#3b7dd3', horizon: '#d2e6ef', fog: '#d4e3e8', sun: dir(0.9, 0.8), disc: '#ffffff', discSize: 0.999, night: 0, key: '#fff3e0', keyPower: 1.05, sky: '#cfe3f4', floor: '#c2b6a2', skyPower: 0.66, lift: '#000000', saturation: 1.05, contrast: 1.02},
};

const smooth = (x: number) => x * x * (3 - 2 * x);

export const mixGrade = (a: GradeName, b: GradeName, u: number) => {
	const k = smooth(u);
	const A = GRADES[a];
	const B = GRADES[b];
	const col = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), k);
	const num = (x: number, y: number) => x + (y - x) * k;
	return {
		zenith: col(A.zenith, B.zenith),
		horizon: col(A.horizon, B.horizon),
		fog: col(A.fog, B.fog),
		disc: col(A.disc, B.disc),
		key: col(A.key, B.key),
		sky: col(A.sky, B.sky),
		floor: col(A.floor, B.floor),
		lift: col(A.lift, B.lift),
		sun: A.sun.clone().lerp(B.sun, k).normalize(),
		discSize: num(A.discSize, B.discSize),
		night: num(A.night, B.night),
		keyPower: num(A.keyPower, B.keyPower),
		skyPower: num(A.skyPower, B.skyPower),
		saturation: num(A.saturation, B.saturation),
		contrast: num(A.contrast, B.contrast),
	};
};

export type MixedGrade = ReturnType<typeof mixGrade>;

export const buildSky = (root: THREE.Group, scene: THREE.Scene, reach = 760) => {
	const uniforms = {
		uZenith: {value: new THREE.Color()},
		uHorizon: {value: new THREE.Color()},
		uSunDir: {value: new THREE.Vector3(0, 1, 0)},
		uDisc: {value: new THREE.Color()},
		uDiscSize: {value: 0.999},
		uPaper: worldUniforms.uPaper,
		uPaperColor: worldUniforms.uPaperColor,
	};
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(4200, 48, 24),
		new THREE.ShaderMaterial({
			side: THREE.BackSide,
			depthWrite: false,
			fog: false,
			uniforms,
			vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: /* glsl */ `
			varying vec3 vDir; uniform vec3 uZenith, uHorizon, uDisc, uSunDir, uPaperColor; uniform float uDiscSize, uPaper;
			void main(){
				vec3 d = normalize(vDir);
				float h = pow(clamp(d.y * 1.6, 0.0, 1.0), 0.62);
				vec3 c = mix(uHorizon, uZenith, h);
				float s = max(dot(d, uSunDir), 0.0);
				c += uDisc * (pow(s, 90.0) * 0.28 + pow(s, 18.0) * 0.14);
				c = mix(c, uDisc * 1.6, smoothstep(uDiscSize, uDiscSize + 0.0004, s));
				c = mix(c, vec3(0.1, 0.08, 0.07), smoothstep(-0.005, -0.06, d.y));
				vec2 grid = abs(fract(gl_FragCoord.xy / 54.0) - 0.5);
				float line = 1.0 - smoothstep(0.0, 0.03, 0.5 - max(grid.x, grid.y));
				c = mix(c, uPaperColor - line * vec3(0.09, 0.07, 0.06), uPaper);
				gl_FragColor = vec4(c, 1.0);
			}`,
		}),
	);
	dome.renderOrder = -10;
	root.add(dome);

	const key = new THREE.DirectionalLight('#ffffff', 1);
	key.castShadow = true;
	key.shadow.mapSize.set(4096, 4096);
	key.shadow.camera.left = -reach;
	key.shadow.camera.right = reach;
	key.shadow.camera.top = reach;
	key.shadow.camera.bottom = -reach;
	key.shadow.camera.near = 10;
	key.shadow.camera.far = 3600;
	key.shadow.normalBias = 0.7;
	key.shadow.bias = -0.0006;
	key.target.position.set(0, 0, 90);
	scene.add(key, key.target);
	const fill = new THREE.HemisphereLight('#ffffff', '#000000', 1);
	scene.add(fill);

	const rand = mulberry32(3);
	const stars = new Float32Array(900 * 3);
	for (let i = 0; i < 900; i++) {
		const v = new THREE.Vector3(rand() - 0.5, rand() * 0.8 + 0.05, rand() - 0.5).normalize().multiplyScalar(4000);
		stars.set([v.x, v.y, v.z], i * 3);
	}
	const starGeo = new THREE.BufferGeometry();
	starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
	const starMaterial = new THREE.PointsMaterial({color: '#dfe7ff', size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, opacity: 0});
	root.add(new THREE.Points(starGeo, starMaterial));

	const ridge = (seed: number, base: number, amp: number) =>
		canvasTexture(2048, 256, (ctx) => {
			const r = mulberry32(seed);
			const k = Array.from({length: 7}, () => [1 + Math.floor(r() * 6), r() * Math.PI * 2, r()]);
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.moveTo(0, 256);
			for (let x = 0; x <= 2048; x += 8) {
				const u = (x / 2048) * Math.PI * 2;
				const y = k.reduce((sum, [f, p, a]) => sum + Math.sin(u * f + p) * a, 0) / 3;
				ctx.lineTo(x, base - Math.max(0, y) * amp - y * amp * 0.2);
			}
			ctx.lineTo(2048, 256);
			ctx.fill();
			// The foot of the range dissolves, so it sits in the haze instead of on a hard line.
			ctx.globalCompositeOperation = 'destination-out';
			const fade = ctx.createLinearGradient(0, 120, 0, 256);
			fade.addColorStop(0, 'rgba(0,0,0,0)');
			fade.addColorStop(1, 'rgba(0,0,0,1)');
			ctx.fillStyle = fade;
			ctx.fillRect(0, 0, 2048, 256);
		});
	const mountainMaterials = ([
		[ridge(5, 190, 150), 3700, 520],
		[ridge(9, 215, 120), 3300, 340],
	] as const).map(([map, radius, height]) => {
		const material = new THREE.MeshBasicMaterial({map, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false});
		const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 96, 1, true), material);
		m.position.y = height / 2 - 8;
		m.renderOrder = -9;
		root.add(m);
		return material;
	});

	const cloudTexture = canvasTexture(512, 220, (ctx) => {
		ctx.fillStyle = '#ffffff';
		[
			[150, 140, 62],
			[230, 105, 88],
			[320, 125, 72],
			[395, 150, 46],
			[95, 165, 38],
		].forEach(([x, y, s]) => {
			ctx.beginPath();
			ctx.arc(x, y, s, 0, Math.PI * 2);
			ctx.fill();
		});
		ctx.fillRect(70, 150, 360, 50);
		ctx.globalCompositeOperation = 'source-atop';
		const g = ctx.createLinearGradient(0, 110, 0, 205);
		g.addColorStop(0, 'rgba(255,255,255,0)');
		g.addColorStop(1, 'rgba(120,135,170,.55)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 512, 220);
	});
	const cloudMaterial = new THREE.SpriteMaterial({map: cloudTexture, transparent: true, depthWrite: false, fog: false});
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2 + rand() * 0.3;
		const s = new THREE.Sprite(cloudMaterial);
		s.position.set(Math.sin(a) * 2500, 620 + rand() * 520, Math.cos(a) * 2500);
		const w = 460 + rand() * 300;
		s.scale.set(w, w * 0.43, 1);
		s.renderOrder = -8;
		root.add(s);
	}

	const apply = (g: MixedGrade, paper: number) => {
		uniforms.uZenith.value.copy(g.zenith);
		uniforms.uHorizon.value.copy(g.horizon);
		uniforms.uSunDir.value.copy(g.sun);
		uniforms.uDisc.value.copy(g.disc);
		uniforms.uDiscSize.value = g.discSize;
		starMaterial.opacity = g.night * 0.8 * (1 - paper);
		key.color.copy(g.key);
		key.intensity = Math.PI * g.keyPower;
		key.position.copy(g.sun).multiplyScalar(1700).add(key.target.position);
		fill.color.copy(g.sky);
		fill.groundColor.copy(g.floor);
		fill.intensity = Math.PI * g.skyPower;
		const far = g.horizon.clone().lerp(g.zenith, 0.25).multiplyScalar(0.92);
		const near = g.horizon.clone().lerp(g.zenith, 0.38).multiplyScalar(0.78);
		mountainMaterials[0].color.copy(far);
		mountainMaterials[1].color.copy(near);
		mountainMaterials.forEach((m) => (m.opacity = 1 - paper));
		cloudMaterial.opacity = 1 - paper;
		cloudMaterial.color.copy(new THREE.Color(1, 1, 1).lerp(g.horizon, 0.3).multiplyScalar(0.34 + (1 - g.night) * 0.66));
	};

	return {apply, key};
};
