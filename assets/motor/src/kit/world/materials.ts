import * as THREE from 'three';

// Colors are authored in display space and stay there: no color management, no tone mapping.
THREE.ColorManagement.enabled = false;

export const worldUniforms = {
	uQuake: {value: 0},
	uT: {value: 0},
	// 0 every light on, 1 the whole city dark.
	uBlackout: {value: 0},
	// 0 the real world, 1 the pale blueprint the diagrams live on.
	uPaper: {value: 0},
	uPaperColor: {value: new THREE.Color('#e7edf0')},
	uFlex: {value: 0},
	uHeroH: {value: 166},
};

type PatchOptions = {
	/** Instanced windows that glow until the blackout reaches them. */
	lit?: boolean;
	/** The tower: follows the bending diagram and keeps its color on paper. */
	tower?: boolean;
	/** Sign of a ghost copy of the tower, drawn at the extremes of the sway. */
	ghost?: number;
	/** Sea surface: rolling swell on a coarse grid, shaded per facet. */
	waves?: boolean;
};

// One displacement for everything in the city, so buildings, windows and the tower shake as a single body.
const quakeGlsl = /* glsl */ `
	uniform float uQuake; uniform float uT; uniform float uFlex; uniform float uHeroH;
	vec3 quakeOffset(vec3 p) {
		float h = clamp(p.y / uHeroH, 0.0, 1.3);
		float amp = 0.26 + pow(h, 1.7) * 7.0;
		float phase = dot(p.xz, vec2(0.006, 0.004));
		float a = sin(uT * 6.3 + phase) * 0.65 + sin(uT * 9.7 + phase * 1.7) * 0.35;
		float b = sin(uT * 5.1 - phase) * 0.6 + sin(uT * 11.3 + phase) * 0.4;
		return vec3(a, 0.0, b) * amp * uQuake;
	}
`;

export const patch = <T extends THREE.Material>(material: T, {lit = false, tower = false, ghost = 0, waves = false}: PatchOptions = {}): T => {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, worldUniforms);
		shader.vertexShader =
			`${quakeGlsl}
			${lit ? 'attribute float aLit; attribute float aOff; varying float vLit; uniform float uBlackout;' : ''}\n` +
			shader.vertexShader.replace(
				'#include <begin_vertex>',
				waves
					? `#include <begin_vertex>
					transformed.z += sin(position.x * 0.021 + uT * 1.1) * 1.5 + sin(position.y * 0.033 - uT * 0.8) * 1.3 + sin((position.x + position.y) * 0.083 + uT * 1.7) * 0.8;`
					: '#include <begin_vertex>',
			).replace(
				'#include <project_vertex>',
				`vec4 mvPosition = vec4(transformed, 1.0);
				#ifdef USE_INSTANCING
					mvPosition = instanceMatrix * mvPosition;
				#endif
				vec4 wp = modelMatrix * mvPosition;
				${
					lit
						? `float flicker = step(0.0, sin(uT * 47.0 + aOff * 91.0));
						float gone = 1.0 - smoothstep(aOff - 0.03, aOff + 0.02, uBlackout);
						vLit = aLit * gone * mix(1.0, flicker, smoothstep(aOff - 0.16, aOff, uBlackout));`
						: ''
				}
				wp.xyz += quakeOffset(wp.xyz);
				${tower ? `wp.x += ${ghost ? `${ghost.toFixed(1)} * abs(uFlex)` : 'uFlex'} * pow(clamp(wp.y / uHeroH, 0.0, 1.3), 1.7);` : ''}
				mvPosition = viewMatrix * wp;
				gl_Position = projectionMatrix * mvPosition;`,
			);
		shader.fragmentShader =
			`uniform float uPaper; uniform vec3 uPaperColor; ${lit ? 'varying float vLit;' : ''}\n` +
			shader.fragmentShader.replace(
				'#include <fog_fragment>',
				`#include <fog_fragment>
				${lit ? 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.9, 1.45, 0.82), vLit);' : ''}
				${tower ? '' : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(uPaperColor, gl_FragColor.rgb, 0.1), uPaper);'}`,
			);
	};
	material.customProgramCacheKey = () => `quake-${lit}-${tower}-${ghost}-${waves}`;
	return material;
};

export const lambert = (opts: THREE.MeshLambertMaterialParameters = {}, patchOptions: PatchOptions = {}) =>
	patch(new THREE.MeshLambertMaterial(opts), patchOptions);

// Shadows must move with the same displacement as the meshes that cast them.
export const shadowDepth = patch(new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking}));

// Unit box standing on the ground, with a soft darkening towards its foot.
export const unitBox = (heightSegments = 1) => {
	const g = new THREE.BoxGeometry(1, 1, 1, 1, heightSegments, 1);
	g.translate(0, 0.5, 0);
	const pos = g.attributes.position;
	const normal = g.attributes.normal;
	const colors = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		const tone = Math.abs(normal.getY(i)) > 0.5 ? 1 : 0.82 + 0.18 * pos.getY(i);
		colors.set([tone, tone, tone], i * 3);
	}
	g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	return g;
};

export const canvasTexture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	draw(c.getContext('2d')!);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.NoColorSpace;
	t.anisotropy = 8;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	return t;
};

export const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type Instance = {matrix: THREE.Matrix4; color?: THREE.Color};

export const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, items: Instance[], shadows = true) => {
	const mesh = new THREE.InstancedMesh(geometry, material, items.length);
	items.forEach((it, i) => {
		mesh.setMatrixAt(i, it.matrix);
		if (it.color) mesh.setColorAt(i, it.color);
	});
	mesh.frustumCulled = false;
	mesh.castShadow = shadows;
	mesh.receiveShadow = true;
	mesh.customDepthMaterial = shadowDepth;
	return mesh;
};

export const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) =>
	new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

// A box of the given thickness stretched between two points.
export const beam = (a: THREE.Vector3, b: THREE.Vector3, thickness: number) => {
	const dir = b.clone().sub(a);
	const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
	return new THREE.Matrix4().compose(a, q, new THREE.Vector3(thickness, dir.length(), thickness));
};
