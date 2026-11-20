import * as THREE from 'three';
import type {World} from '../../schema';
import {instanced, lambert, place, unitBox} from './materials';
import type {Stage} from './stage';

const MAX_LAYERS = 6;

// The ground itself, cut open: the same world continues below the surface, drawn on one great slice.
export const buildSection = (root: THREE.Group, world: World, stage: Stage) => {
	const cut = world.cutaway;
	if (!cut) return {update: () => undefined};
	const z = stage.behind ? -stage.cutZ : stage.cutZ;
	const count = Math.min(MAX_LAYERS, cut.layers.length);
	const uniforms = {
		uWave: {value: 0},
		uT: {value: 0},
		uLight: {value: 1},
		uDepth: {value: stage.depth},
		uCount: {value: count},
		uTops: {value: Array.from({length: MAX_LAYERS}, (_, i) => cut.layers[i]?.from ?? -1e4)},
		uColors: {value: Array.from({length: MAX_LAYERS}, (_, i) => new THREE.Color(cut.layers[i]?.color ?? '#000000'))},
	};
	const slice = new THREE.Mesh(
		new THREE.PlaneGeometry(Math.max(1400, stage.depth * 40), stage.depth * 4),
		new THREE.ShaderMaterial({
			uniforms,
			vertexShader: `varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`,
			fragmentShader: /* glsl */ `
			varying vec3 vP; uniform float uWave, uT, uLight, uDepth; uniform int uCount;
			uniform float uTops[${MAX_LAYERS}]; uniform vec3 uColors[${MAX_LAYERS}];
			float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
			float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
				return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
			float fbm(vec2 p){ return noise(p)*0.55 + noise(p*2.1)*0.3 + noise(p*4.3)*0.15; }
			void main(){
				float scale = 33.0 / uDepth;
				vec2 q = vP.xy * scale;
				float y = vP.y + (fbm(vec2(q.x*0.05, 3.0))-0.5)*1.6/scale;
				vec3 c = uColors[0];
				for (int i = 0; i < uCount; i++) if (y < uTops[i]) c = uColors[i];
				c *= 0.88 + fbm(vec2(q.x*0.02, q.y*0.9))*0.24;
				c *= 1.0 - smoothstep(0.78,0.82,noise(q*1.7))*0.12;
				float glow = 0.0;
				for (int i = 0; i < 7; i++) {
					float fi = float(i);
					float y0 = -uDepth + fi*uDepth*0.14;
					float amp = (0.25 + fi*fi*0.1)*uWave/scale;
					float d = abs(vP.y - (y0 + sin(vP.x*scale*0.2 - uT*7.0 + fi*0.5)*amp));
					glow += smoothstep(0.34/scale,0.06/scale,d)*(0.45+fi*0.09);
				}
				c = mix(c, vec3(0.42,1.15,1.05), clamp(glow,0.0,1.0)*uWave);
				gl_FragColor = vec4(c*uLight, 1.0);
			}`,
		}),
	);
	slice.position.set(0, -stage.depth * 2, z);
	root.add(slice);

	const box = unitBox();
	const w = world.hero.width;
	const concrete = new THREE.Color('#cfccc2');
	if (cut.basement !== null) {
		const b = cut.basement;
		root.add(
			instanced(
				box,
				lambert({vertexColors: true, emissive: '#3c3a36'}),
				[
					{matrix: place(0, b, z + 0.6, w * 1.16, -b, 0.6), color: new THREE.Color('#8f8a80')},
					{matrix: place(0, b - 0.7, z + 1, w * 1.2, 0.9, 1), color: concrete},
					...[-1, 1].map((s) => ({matrix: place((s * w * 1.16) / 2, b, z + 1, 1, -b, 1), color: concrete})),
				],
				false,
			),
		);
	}
	const count2 = cut.piles?.count ?? 0;
	const piles = count2 ? instanced(new THREE.CylinderGeometry(0.62, 0.62, 1, 10).translate(0, -0.5, 0), lambert({color: '#e2dfd5', emissive: '#514e47'}), Array.from({length: count2}, () => ({matrix: new THREE.Matrix4()})), false) : null;
	const tips = count2 ? instanced(new THREE.ConeGeometry(0.62, 1.5, 10).rotateX(Math.PI), lambert({color: '#b9b6ad', emissive: '#3d3b36'}), Array.from({length: count2}, () => ({matrix: new THREE.Matrix4()})), false) : null;
	if (piles && tips) root.add(piles, tips);
	const ruler = instanced(box, new THREE.MeshBasicMaterial({color: new THREE.Color(1.3, 1.02, 0.34)}), [{matrix: new THREE.Matrix4()}], false);
	root.add(ruler);

	const m = new THREE.Matrix4();
	const update = (t: number, wave: number, pile: number, depth: number, light: number) => {
		uniforms.uT.value = t;
		uniforms.uWave.value = wave;
		uniforms.uLight.value = light;
		if (piles && tips && cut.piles) {
			const {top, tip} = cut.piles;
			const length = top - tip;
			for (let i = 0; i < count2; i++) {
				const x = (i / (count2 - 1) - 0.5) * w;
				// Driven from the center outwards, one after another.
				const center = Math.abs(i - (count2 - 1) / 2) / ((count2 - 1) / 2);
				const k = Math.min(1, Math.max(0, pile * 1.45 - center * 0.45));
				const eased = 1 - Math.pow(1 - k, 3);
				const l = Math.max(0.001, length * eased);
				piles.setMatrixAt(i, m.compose(new THREE.Vector3(x, top, z + 1.4), new THREE.Quaternion(), new THREE.Vector3(1, l, 1)));
				tips.setMatrixAt(i, m.compose(new THREE.Vector3(x, top - l - 0.7, z + 1.4), new THREE.Quaternion(), new THREE.Vector3(eased > 0.01 ? 1 : 0, 1, 1)));
			}
			piles.instanceMatrix.needsUpdate = true;
			tips.instanceMatrix.needsUpdate = true;
		}
		const deepest = cut.piles?.tip ?? -stage.depth * 0.8;
		ruler.setMatrixAt(0, m.compose(new THREE.Vector3(w * 0.7, deepest * depth, z + 1.6), new THREE.Quaternion(), new THREE.Vector3(0.34, Math.max(0.001, -deepest * depth), 0.34)));
		ruler.instanceMatrix.needsUpdate = true;
	};

	return {update};
};
