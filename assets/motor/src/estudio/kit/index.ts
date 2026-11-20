import * as THREE from 'three';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import {easeIn3, easeInOut3, easeOut3, backOut, ramp} from '../film';
import {mixPose, pose, type Pose} from '../stage/pose';
import type {Hud} from './hud';

type Vec = [number, number, number];
type Finish = 'metal' | 'chrome' | 'glass' | 'plastic' | 'matte' | 'glow';
type CameraKey = {time: number; position: number[]; look: number[]; fov?: number; ease?: 'linear' | 'out' | 'inOut'};
type Dot = {x: number; y: number; z: number; size: number; alpha: number; r: number; g: number; b: number};

const USABLE = 0.7;
const BELOW_TEXT = 0.11;
const TURN_LIMIT = 0.55;

const bounce = (u: number) => {
	const n = 7.5625;
	const d = 2.75;
	if (u < 1 / d) return n * u * u;
	if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
	if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
	return n * (u -= 2.625 / d) * u + 0.984375;
};

const EASES = {linear: (u: number) => u, out: easeOut3, inOut: easeInOut3};

// A flat color reads as a cut-out. Facing the camera a shining solid burns hotter, so it keeps its volume.
const shaded = (m: THREE.MeshBasicMaterial) => {
	m.onBeforeCompile = (shader) => {
		shader.vertexShader =
			'varying float vFacing;\n' +
			shader.vertexShader.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
				vec3 facing = normal;
				#ifdef USE_INSTANCING
					facing = mat3(instanceMatrix) * facing;
				#endif
				vFacing = abs(normalize(normalMatrix * facing).z);`,
			);
		shader.fragmentShader = 'varying float vFacing;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= 0.5 + 0.8 * vFacing * vFacing;');
	};
	m.customProgramCacheKey = () => 'glow-shaded';
	return m;
};

const material = (finish: Finish, color: string, o: {intensity?: number; opacity?: number; roughness?: number; map?: THREE.Texture} = {}): THREE.Material => {
	const c = new THREE.Color(color);
	const fade = o.opacity !== undefined && o.opacity < 1 ? {transparent: true, opacity: o.opacity} : {};
	if (finish === 'glow') return shaded(new THREE.MeshBasicMaterial({color: c.multiplyScalar(o.intensity ?? 1.6), map: o.map, ...fade}));
	if (finish === 'metal') return new THREE.MeshPhysicalMaterial({color: c, metalness: 1, roughness: o.roughness ?? 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3, map: o.map, ...fade});
	if (finish === 'chrome') return new THREE.MeshPhysicalMaterial({color: c, metalness: 1, roughness: o.roughness ?? 0.07, map: o.map, ...fade});
	if (finish === 'plastic') return new THREE.MeshPhysicalMaterial({color: c, metalness: 0, roughness: o.roughness ?? 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2, map: o.map, ...fade});
	if (finish === 'matte') return new THREE.MeshStandardMaterial({color: c, roughness: o.roughness ?? 0.85, map: o.map, ...fade});
	return new THREE.MeshPhysicalMaterial({color: c, metalness: 0, roughness: o.roughness ?? 0.06, transparent: true, opacity: o.opacity ?? 0.26, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide});
};

const extrude = (svgPath: string, {size, depth, bevel = 0}: {size: number; depth: number; bevel?: number}) => {
	const parsed = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${svgPath}"/></svg>`);
	const raw = parsed.paths.flatMap((p) => SVGLoader.createShapes(p)).map((s) => s.extractPoints(36));
	const all = raw.flatMap((s) => s.shape);
	if (!all.length) throw new Error('extrude: la ruta SVG no produjo ninguna forma');
	const box = new THREE.Box2().setFromPoints(all);
	const span = box.getSize(new THREE.Vector2());
	const k = size / Math.max(span.x, span.y);
	const center = box.getCenter(new THREE.Vector2());
	const place = (p: THREE.Vector2) => new THREE.Vector2((p.x - center.x) * k, -(p.y - center.y) * k);
	const shapes = raw.map(({shape, holes}) => {
		const s = new THREE.Shape(shape.map(place));
		s.holes = holes.map((h) => new THREE.Path(h.map(place)));
		return s;
	});
	const geometry = new THREE.ExtrudeGeometry(shapes, {depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 5, curveSegments: 24});
	geometry.center();
	return geometry;
};

const lathe = (profile: [number, number][], segments = 72) => {
	const smooth = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(Math.max(32, profile.length * 10));
	const points = smooth.map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
	// A profile drawn downwards would turn the solid inside out, so its direction is taken from the area it encloses.
	const area = points.reduce((sum, p, i) => {
		const q = points[(i + 1) % points.length];
		return sum + p.x * q.y - q.x * p.y;
	}, 0);
	return new THREE.LatheGeometry(area < 0 ? points.reverse() : points, segments);
};

const texture = (width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	paint(canvas.getContext('2d')!);
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
};

const glow = ({color, size, intensity = 1}: {color: string; size: number; intensity?: number}, floor: boolean) => {
	const uniforms = {uColor: {value: new THREE.Color(color)}, uIntensity: {value: intensity}, uSize: {value: size}, uGround: {value: floor ? 1 : 0}};
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1),
		new THREE.ShaderMaterial({
			uniforms,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			vertexShader: `varying vec2 vP; varying float vY; varying float vRise; uniform float uSize;
			void main(){ vP = position.xy * 2.0; float s = length(modelMatrix[0].xyz); vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy * uSize * s; vY = (inverse(viewMatrix) * c).y; vRise = uSize * s * 0.2; gl_Position = projectionMatrix * c; }`,
			// However hard a scene pushes it, light saturates softly and never turns into a white disc. Over a floor it fades before the horizon can cut it.
			fragmentShader: `varying vec2 vP; varying float vY; varying float vRise; uniform vec3 uColor; uniform float uIntensity, uGround;
			void main(){
				float r = length(vP);
				float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.75, 1.0, r)) + exp(-r * r * 60.0) * 2.0;
				float power = 1.6 * (1.0 - exp(-uIntensity / 1.6));
				float light = 1.8 * (1.0 - exp(-power * a / 1.8));
				light *= mix(1.0, smoothstep(0.0, vRise, vY), uGround);
				gl_FragColor = vec4(uColor * light, 1.0);
			}`,
		}),
	) as unknown as THREE.Mesh & {intensity: number};
	mesh.frustumCulled = false;
	Object.defineProperty(mesh, 'intensity', {get: () => uniforms.uIntensity.value, set: (v: number) => (uniforms.uIntensity.value = v)});
	return mesh;
};

const swarm = (geometry: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
	const mesh = new THREE.InstancedMesh(geometry, mat, Math.min(count, 5000)) as THREE.InstancedMesh & {each: (pose: (o: THREE.Object3D, i: number) => void) => void; tint: (i: number, color: string) => void};
	mesh.frustumCulled = false;
	const o = new THREE.Object3D();
	mesh.each = (poseOne) => {
		for (let i = 0; i < mesh.count; i++) {
			o.position.set(0, 0, 0);
			o.rotation.set(0, 0, 0);
			o.scale.set(1, 1, 1);
			poseOne(o, i);
			o.updateMatrix();
			mesh.setMatrixAt(i, o.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
	};
	const color = new THREE.Color();
	mesh.tint = (i, hex) => {
		mesh.setColorAt(i, color.set(hex));
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	};
	return mesh;
};

const dots = (requested: number, {size = 0.06, color = '#ffffff', additive = true}: {size?: number; color?: string; additive?: boolean} = {}) => {
	const count = Math.min(requested, 20000);
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
	geometry.setIndex([0, 1, 2, 0, 2, 3]);
	const centers = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
	const tones = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
	geometry.setAttribute('aCenter', centers);
	geometry.setAttribute('aTone', tones);
	geometry.instanceCount = count;
	const base = new THREE.Color(color);
	const mesh = new THREE.Mesh(
		geometry,
		new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
			vertexShader: `attribute vec4 aCenter; attribute vec4 aTone; varying vec2 vP; varying vec4 vTone;
			void main(){ vec4 c = modelViewMatrix * vec4(aCenter.xyz, 1.0); c.xy += position.xy * aCenter.w; vP = position.xy * 2.0; vTone = aTone; gl_Position = projectionMatrix * c; }`,
			fragmentShader: `varying vec2 vP; varying vec4 vTone;
			void main(){ float r = length(vP); float a = (1.0 - smoothstep(0.35, 1.0, r)) * vTone.a; if (a <= 0.001) discard; gl_FragColor = vec4(vTone.rgb * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'}); }`,
		}),
	) as unknown as THREE.Mesh & {each: (pose: (dot: Dot, i: number) => void) => void};
	mesh.frustumCulled = false;
	const dot: Dot = {x: 0, y: 0, z: 0, size, alpha: 1, r: base.r, g: base.g, b: base.b};
	mesh.each = (poseOne) => {
		for (let i = 0; i < count; i++) {
			dot.x = 0;
			dot.y = 0;
			dot.z = 0;
			dot.size = size;
			dot.alpha = 1;
			dot.r = base.r;
			dot.g = base.g;
			dot.b = base.b;
			poseOne(dot, i);
			centers.setXYZW(i, dot.x, dot.y, dot.z, dot.size);
			tones.setXYZW(i, dot.r, dot.g, dot.b, dot.alpha);
		}
		centers.needsUpdate = true;
		tones.needsUpdate = true;
	};
	return mesh;
};

const line = (points: Vec[], {color, width, intensity = 1.6}: {color: string; width: number; intensity?: number}) => {
	const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
	const tubular = Math.max(80, points.length * 32);
	const radial = 10;
	const geometry = new THREE.TubeGeometry(curve, tubular, width / 2, radial, false);
	const c = new THREE.Color(color);
	const mat = new THREE.MeshBasicMaterial({color: c.clone().multiplyScalar(intensity)});
	const mesh = new THREE.Mesh(geometry, mat) as unknown as THREE.Mesh & {draw: (u: number) => void; intensity: number};
	mesh.frustumCulled = false;
	const total = geometry.index!.count;
	const step = radial * 6;
	let lit = intensity;
	let drawn = true;
	// A solid tube without light would read as a black bar.
	const refresh = () => {
		mesh.visible = drawn && lit > 0.001;
		mat.color.copy(c).multiplyScalar(lit);
	};
	mesh.draw = (u) => {
		const k = Math.round(Math.max(0, Math.min(1, u)) * tubular);
		drawn = k > 0;
		geometry.setDrawRange(0, Math.min(total, k * step));
		refresh();
	};
	Object.defineProperty(mesh, 'intensity', {
		set: (v: number) => {
			lit = v;
			refresh();
		},
		get: () => lit,
	});
	refresh();
	return mesh;
};

const UP = new THREE.Vector3(0, 1, 0);

const arrow = (from: Vec, to: Vec, {color, width, intensity = 1.6}: {color: string; width: number; intensity?: number}) => {
	const a = new THREE.Vector3(...from);
	const dir = new THREE.Vector3(...to).sub(a);
	const length = dir.length();
	const head = Math.min(length * 0.34, width * 4.5);
	const mat = new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(intensity)});
	const group = new THREE.Group() as THREE.Group & {grow: (u: number) => void};
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, 1, 16).translate(0, 0.5, 0), mat);
	const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 1.7, head, 24).translate(0, head / 2, 0), mat);
	group.add(shaft, tip);
	group.position.copy(a);
	group.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
	group.grow = (u) => {
		const k = Math.max(0, Math.min(1, u));
		group.visible = k > 0;
		shaft.scale.y = Math.max(0.001, (length - head) * k);
		tip.position.y = (length - head) * k;
		tip.scale.setScalar(Math.max(0.001, Math.min(1, k * 3)));
	};
	group.grow(1);
	return group;
};

const beam = (from: Vec, to: Vec, {color, width, intensity = 1.4}: {color: string; width: number; intensity?: number}) => {
	const a = new THREE.Vector3(...from);
	const b = new THREE.Vector3(...to);
	const uniforms = {uA: {value: a}, uB: {value: b}, uWidth: {value: width}, uColor: {value: new THREE.Color(color)}, uIntensity: {value: intensity}};
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1, 1, 24),
		new THREE.ShaderMaterial({
			uniforms,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending,
			vertexShader: `uniform vec3 uA, uB; uniform float uWidth; varying vec2 vP;
			void main(){
				float u = position.y + 0.5;
				vec4 viewA = viewMatrix * vec4(uA, 1.0);
				vec4 viewB = viewMatrix * vec4(uB, 1.0);
				vec3 along = normalize(viewB.xyz - viewA.xyz);
				vec3 side = normalize(cross(along, vec3(0.0, 0.0, 1.0)));
				vec4 c = mix(viewA, viewB, u);
				c.xyz += side * position.x * uWidth * 2.4;
				vP = vec2(position.x * 2.0, u);
				gl_Position = projectionMatrix * c;
			}`,
			fragmentShader: `varying vec2 vP; uniform vec3 uColor; uniform float uIntensity;
			void main(){ float across = exp(-vP.x * vP.x * 14.0) + exp(-vP.x * vP.x * 120.0) * 1.6; float ends = smoothstep(0.0, 0.03, vP.y) * smoothstep(1.0, 0.97, vP.y); gl_FragColor = vec4(uColor * uIntensity * across * ends, 1.0); }`,
		}),
	) as unknown as THREE.Mesh & {intensity: number; width: number};
	mesh.frustumCulled = false;
	Object.defineProperty(mesh, 'intensity', {get: () => uniforms.uIntensity.value, set: (v: number) => (uniforms.uIntensity.value = v)});
	Object.defineProperty(mesh, 'width', {get: () => uniforms.uWidth.value, set: (v: number) => (uniforms.uWidth.value = v)});
	return mesh;
};

// Rounds a flat cut-out into a soft relief, thickest far from its edge, so it catches perspective when the camera moves.
const reliefGeometry = (image: CanvasImageSource, width: number, height: number, relief: number) => {
	const GRID = 90;
	const canvas = document.createElement('canvas');
	canvas.width = GRID;
	canvas.height = GRID;
	const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
	ctx.drawImage(image, 0, 0, GRID, GRID);
	const alpha = ctx.getImageData(0, 0, GRID, GRID).data;
	const far = new Float32Array(GRID * GRID);
	for (let i = 0; i < GRID * GRID; i++) far[i] = alpha[i * 4 + 3] > 40 ? 1e3 : 0;
	const pass = (x: number, y: number, dx: number, dy: number) => {
		if (x + dx < 0 || y + dy < 0 || x + dx >= GRID || y + dy >= GRID) return 1;
		return far[(y + dy) * GRID + x + dx] + Math.hypot(dx, dy);
	};
	for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) far[y * GRID + x] = Math.min(far[y * GRID + x], pass(x, y, -1, 0), pass(x, y, 0, -1), pass(x, y, -1, -1), pass(x, y, 1, -1));
	for (let y = GRID - 1; y >= 0; y--) for (let x = GRID - 1; x >= 0; x--) far[y * GRID + x] = Math.min(far[y * GRID + x], pass(x, y, 1, 0), pass(x, y, 0, 1), pass(x, y, 1, 1), pass(x, y, -1, 1));
	const deepest = Math.max(1, ...far);
	const geometry = new THREE.PlaneGeometry(width, height, GRID - 1, GRID - 1).translate(0, height / 2, 0);
	const position = geometry.attributes.position;
	for (let i = 0; i < position.count; i++) {
		const d = far[i] / deepest;
		position.setZ(i, Math.sqrt(Math.max(0, 1 - (1 - d) ** 2)) * relief * height);
	}
	geometry.computeVertexNormals();
	return geometry;
};

const point = (at: Vec | THREE.Object3D) => (Array.isArray(at) ? new THREE.Vector3(...at) : at);

// What a scene program can reach. Same names as api.d.ts, which is the contract the writer reads.
export const createKit = (root: THREE.Group, hud: Hud, glowColor: string, pictures: Record<string, {texture: THREE.Texture; aspect: number}>, floor: boolean, models: Record<string, THREE.Object3D> = {}) => {
	let keys: CameraKey[] = [];
	const eye = new THREE.Vector3();
	const shifting: THREE.Vector2[] = [];
	const picture = (name: string) => {
		const found = pictures[name];
		if (!found) throw new Error(`imagen desconocida: ${name}. Disponibles: ${Object.keys(pictures).join(', ') || 'ninguna'}`);
		return found;
	};
	const cardMaterial = (texture: THREE.Texture, opacity: number) => new THREE.MeshBasicMaterial({map: texture, transparent: true, opacity, alphaTest: 0.02, side: THREE.DoubleSide});
	const withOpacity = <T extends THREE.Mesh>(mesh: T, mat: THREE.MeshBasicMaterial) => {
		Object.defineProperty(mesh, 'opacity', {get: () => mat.opacity, set: (v: number) => (mat.opacity = v)});
		return mesh as T & {opacity: number};
	};
	// A picture is a card: seen from the side it becomes a sliver, so it never strays far from facing the camera.
	const keepFacing = <T extends THREE.Mesh>(mesh: T) => {
		const compose = mesh.updateMatrix.bind(mesh);
		const place = new THREE.Vector3();
		mesh.updateMatrix = () => {
			const chosen = mesh.rotation.y;
			if (eye.lengthSq() > 0) {
				place.copy(mesh.position);
				if (mesh.parent) place.applyMatrix4(mesh.parent.matrixWorld);
				const toCamera = Math.atan2(eye.x - place.x, eye.z - place.z);
				const turn = Math.atan2(Math.sin(chosen - toCamera), Math.cos(chosen - toCamera));
				mesh.rotation.y = toCamera + TURN_LIMIT * Math.tanh(turn / TURN_LIMIT);
			}
			compose();
			mesh.rotation.y = chosen;
		};
		return mesh;
	};
	const toPose = (k: CameraKey): Pose => pose(k.position as Vec, k.look as Vec, k.fov ?? 50);
	const poseAt = (t: number): Pose => {
		if (!keys.length) return pose([0, 2.4, 10], [0, 1.2, 0], 50);
		if (t <= keys[0].time) return toPose(keys[0]);
		for (let i = 1; i < keys.length; i++) {
			const b = keys[i];
			if (t <= b.time) return mixPose(toPose(keys[i - 1]), toPose(b), EASES[b.ease ?? 'inOut'](ramp(t, keys[i - 1].time, b.time)));
		}
		return toPose(keys[keys.length - 1]);
	};
	const kit = {
		add: <T extends THREE.Object3D>(object: T) => {
			root.add(object);
			return object;
		},
		material,
		extrude,
		lathe,
		texture,
		picture: (name: string) => picture(name).texture,
		glow: (o: {color: string; size: number; intensity?: number}) => glow(o, floor),
		beam,
		image: (name: string, {height, relief = 0.1, opacity = 1}: {height: number; relief?: number; opacity?: number}) => {
			const {texture, aspect} = picture(name);
			const mat = cardMaterial(texture, opacity);
			const mesh = new THREE.Mesh(reliefGeometry(texture.image as CanvasImageSource, height * aspect, height, relief), mat);
			mesh.frustumCulled = false;
			return withOpacity(keepFacing(mesh), mat);
		},
		// A real 3D model: it can turn and show every side, unlike a picture. It stands on y = 0, centred on its own spot.
		model: (name: string, {height, size, opacity = 1}: {height?: number; size?: number; opacity?: number}) => {
			const found = models[name];
			if (!found) throw new Error(`modelo desconocido: ${name}. Disponibles: ${Object.keys(models).join(', ') || 'ninguno'}`);
			const copy = found.clone(true);
			const box = new THREE.Box3().setFromObject(copy);
			const dims = box.getSize(new THREE.Vector3());
			const s = height ? height / Math.max(1e-6, dims.y) : (size ?? 1) / Math.max(1e-6, dims.x, dims.y, dims.z);
			copy.scale.setScalar(s);
			copy.position.set((-(box.min.x + box.max.x) / 2) * s, -box.min.y * s, (-(box.min.z + box.max.z) / 2) * s);
			const materials: THREE.Material[] = [];
			copy.traverse((o) => {
				const mesh = o as THREE.Mesh;
				if (!mesh.isMesh) return;
				mesh.frustumCulled = false;
				mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
				materials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
			});
			const holder = new THREE.Group();
			holder.add(copy);
			const setOpacity = (v: number) =>
				materials.forEach((m) => {
					m.opacity = v;
					m.transparent = v < 0.999;
					m.depthWrite = v >= 0.999;
				});
			setOpacity(opacity);
			let current = opacity;
			Object.defineProperty(holder, 'opacity', {get: () => current, set: (v: number) => setOpacity((current = v))});
			return holder as THREE.Group & {opacity: number};
		},
		imageSwarm: (name: string, count: number, {height}: {height: number}) => {
			const {texture, aspect} = picture(name);
			const geometry = new THREE.PlaneGeometry(height * aspect, height).translate(0, height / 2, 0);
			const mat = new THREE.MeshBasicMaterial({map: texture, alphaTest: 0.06, alphaToCoverage: true, side: THREE.DoubleSide});
			const mesh = swarm(geometry, mat, Math.min(count, 3000));
			const pose = mesh.each;
			mesh.each = (poseOne) =>
				pose((o, i) => {
					poseOne(o, i);
					o.rotation.y = Math.atan2(eye.x - o.position.x, eye.z - o.position.z);
				});
			return mesh;
		},
		backdrop: (name: string, {brightness = 0.6}: {brightness?: number} = {}) => {
			const {texture, aspect} = picture(name);
			const uniforms = {tMap: {value: texture}, uBrightness: {value: brightness}, uOpacity: {value: 1}, uShift: {value: new THREE.Vector2()}, uAspect: {value: aspect / (9 / 16)}};
			// Glued to the frame, so a place can never show its edges; it slides a little as the camera turns.
			// Drawn first among solids, or it would paint over them. Custom blending keeps it fading without moving it to the transparent pass.
			const mesh = new THREE.Mesh(
				new THREE.PlaneGeometry(2, 2),
				new THREE.ShaderMaterial({
					uniforms,
					blending: THREE.CustomBlending,
					depthTest: false,
					depthWrite: false,
					vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }',
					fragmentShader: `varying vec2 vUv; uniform sampler2D tMap; uniform float uBrightness, uOpacity, uAspect; uniform vec2 uShift;
					void main(){
						vec2 uv = (vUv - 0.5) * 0.92;
						if (uAspect > 1.0) uv.x /= uAspect; else uv.y *= uAspect;
						vec4 c = texture2D(tMap, uv + 0.5 + uShift);
						float edge = smoothstep(0.0, 0.3, vUv.y) * 0.5 + 0.5;
						gl_FragColor = vec4(c.rgb * uBrightness * edge, uOpacity);
					}`,
				}),
			);
			mesh.renderOrder = -12;
			mesh.frustumCulled = false;
			kit.add(mesh);
			shifting.push(uniforms.uShift.value);
			Object.defineProperty(mesh, 'opacity', {get: () => uniforms.uOpacity.value, set: (v: number) => (uniforms.uOpacity.value = v)});
			return mesh as unknown as THREE.Mesh & {opacity: number};
		},
		swarm,
		dots,
		line,
		arrow,
		label: (text: string, o: {at: Vec | THREE.Object3D; offset?: [number, number]; size?: number; color?: string}) => hud.label(text, {...o, at: point(o.at)}),
		counter: (o: {from: number; to: number; start: number; end: number; unit: string; singular?: string; decimals?: number; x?: number; y?: number; at?: Vec | THREE.Object3D; hide?: number}) => hud.counter({...o, at: o.at ? point(o.at) : undefined}, glowColor),
		camera: {
			still: (position: Vec, look: Vec, fov?: number) => {
				keys = [{time: 0, position, look, fov}];
			},
			path: (list: CameraKey[]) => {
				keys = [...list].sort((a, b) => a.time - b.time);
			},
			frame: (target: THREE.Object3D, {fill = 0.65, yaw = 0, pitch = 0.04, fov = 46}: {fill?: number; yaw?: number; pitch?: number; fov?: number} = {}) => {
				target.updateWorldMatrix(true, true);
				const box = new THREE.Box3().setFromObject(target);
				const size = box.getSize(new THREE.Vector3());
				const center = box.getCenter(new THREE.Vector3());
				const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
				// Everything lives in the lower 70 % of the frame: the text band takes the rest.
				const distance = Math.max(size.y / (2 * tan * USABLE * fill), Math.max(size.x, size.z) / (2 * tan * (9 / 16) * fill)) + size.z / 2;
				const span = 2 * tan * distance;
				const look = center.clone().add(new THREE.Vector3(0, span * BELOW_TEXT, 0));
				const position = center.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance));
				position.y += span * BELOW_TEXT;
				return {position: position.toArray() as Vec, look: look.toArray() as Vec, fov};
			},
		},
		ramp,
		ease: {out: easeOut3, in: easeIn3, inOut: easeInOut3, back: backOut, bounce},
	};
	const look = (position: THREE.Vector3) => {
		eye.copy(position);
		shifting.forEach((v) => v.set(Math.atan2(eye.x, eye.z) * 0.012, eye.y * 0.0015));
	};
	return {kit, poseAt, look};
};
