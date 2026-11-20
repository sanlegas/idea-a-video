import {useFrame, useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import type {Film} from '../../schema';
import {makeCamera, PoseFn, Segment} from './camera';
import {buildCity} from './city';
import {buildCollapse, CollapseData, CollapseMeta} from './collapse';
import {buildCrowd} from './crowd';
import {buildGround} from './ground';
import {worldUniforms} from './materials';
import {buildModel} from './model';
import {PostChain} from './post';
import {buildSection} from './section';
import {buildSky, GradeName, mixGrade} from './sky';
import type {Stage} from './stage';
import {buildTower} from './tower';
import {buildTraffic} from './traffic';
import {buildTomas, type Toma, type TomaWindow} from './tomas/run';

export type GradeKey = {time: number; grade: GradeName};

export type WorldPlan = {
	segments: Segment[];
	grades: GradeKey[];
	quakeAt: (t: number) => number;
	quakeStart: number;
	collapseAt: number | null;
	paperAt: (t: number) => number;
	flexAt: (t: number) => number;
	waveAt: (t: number) => number;
	pileAt: (t: number) => number;
	depthAt: (t: number) => number;
	tiltAt: (t: number) => number;
	bobAt: (t: number) => number;
	pose: PoseFn;
	stage: Stage;
	tomaWindows: TomaWindow[];
};

const MAX_SAMPLES = 16;
const SHUTTER = 0.8;

const gradeAt = (t: number, keys: GradeKey[]) => {
	let current = keys[0];
	let previous = keys[0];
	for (const k of keys) {
		if (k.time <= t) {
			if (k.grade !== current.grade) {
				previous = current;
				current = k;
			}
		}
	}
	return mixGrade(previous.grade, current.grade, Math.min(1, (t - current.time) / 1.6));
};

class World {
	scene = new THREE.Scene();
	camera: THREE.PerspectiveCamera;
	fog = new THREE.Fog('#000000', 280, 2300);
	private frameScene: THREE.WebGLRenderTarget;
	private accum: THREE.WebGLRenderTarget[];
	private quadScene = new THREE.Scene();
	private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private quad: THREE.ShaderMaterial;
	private post: PostChain;
	private sky: ReturnType<typeof buildSky>;
	private city: ReturnType<typeof buildCity> | null = null;
	private tower: ReturnType<typeof buildTower> | null = null;
	private model: THREE.Group | null = null;
	private traffic: ReturnType<typeof buildTraffic> | null = null;
	private crowd: ReturnType<typeof buildCrowd> | null = null;
	private section: ReturnType<typeof buildSection>;
	private collapse: ReturnType<typeof buildCollapse> | null = null;
	private clip: THREE.Plane;
	private dustTint = new THREE.Color();
	private root: THREE.Group;
	private tomas: Toma[] = [];
	private heroRest: {position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; visible: boolean} | null = null;
	private heroTouched = false;
	// What was visible before a toma hid the surroundings, to put it back exactly.
	private shown: Map<THREE.Object3D, boolean> | null = null;
	private paperBackground = new THREE.Color();

	constructor(
		private gl: THREE.WebGLRenderer,
		private plan: WorldPlan,
		private film: Film,
		collapse: CollapseData | null,
		private fps: number,
		width: number,
		height: number,
	) {
		gl.outputColorSpace = THREE.LinearSRGBColorSpace;
		gl.toneMapping = THREE.NoToneMapping;
		gl.autoClear = true;
		gl.shadowMap.enabled = true;
		gl.shadowMap.type = THREE.PCFShadowMap;
		gl.shadowMap.autoUpdate = false;
		this.camera = new THREE.PerspectiveCamera(40, width / height, 3, 9000);
		this.scene.fog = this.fog;
		const root = new THREE.Group();
		this.root = root;
		this.scene.add(root);
		this.sky = buildSky(root, this.scene);
		const {world, hero} = film;
		worldUniforms.uHeroH.value = plan.stage.height;
		this.clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), plan.stage.cutZ + 3);
		if (world.environment === 'city') {
			this.city = buildCity(root, world, collapse !== null);
			if (world.traffic > 0.02) this.traffic = buildTraffic(root, world.traffic);
			if (world.crowd > 0.02) this.crowd = buildCrowd(root, [new THREE.Vector3(82, 0, 92), new THREE.Vector3(46, 0, 300)], world.crowd);
			if (collapse) this.collapse = buildCollapse(root, collapse);
		} else {
			buildGround(root, world);
		}
		if (hero) this.model = buildModel(root, hero);
		else this.tower = buildTower(root, world);
		this.section = buildSection(root, world, plan.stage);
		// Tomas written for this film: their own groups, the same protagonist, run only inside their windows.
		const written = film.tomas ?? [];
		if (written.length) {
			const heroObject = this.model ?? new THREE.Group();
			this.heroRest = {position: heroObject.position.clone(), quaternion: heroObject.quaternion.clone(), scale: heroObject.scale.clone(), visible: heroObject.visible};
			const size = {height: plan.stage.height, width: plan.stage.extent};
			this.tomas = buildTomas(
				this.scene,
				written.map((w) => ({id: w.id, js: w.js, duration: plan.tomaWindows.filter((x) => x.id === w.id).reduce((a, x) => Math.max(a, x.end - x.start), 0)})),
				heroObject,
				size,
				world,
			);
		}

		const target = (samples: number) =>
			new THREE.WebGLRenderTarget(width, height, {type: THREE.HalfFloatType, samples, depthBuffer: samples > 0, colorSpace: THREE.NoColorSpace});
		this.frameScene = target(4);
		this.accum = [target(0), target(0)];
		this.quad = new THREE.ShaderMaterial({
			depthTest: false,
			depthWrite: false,
			uniforms: {uA: {value: null}, uB: {value: null}, uMix: {value: 1}},
			vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
			fragmentShader:
				// NaN times zero is still NaN: an invalid pixel must never enter the running average, or it stays on screen for good.
				`varying vec2 vUv; uniform sampler2D uA, uB; uniform float uMix;
				vec3 clean(vec3 c) { return (isnan(c.r) || isnan(c.g) || isnan(c.b) || isinf(c.r) || isinf(c.g) || isinf(c.b)) ? vec3(0.0) : min(c, vec3(12.0)); }
				void main() {
					vec3 b = clean(texture2D(uB, vUv).rgb);
					gl_FragColor = vec4(uMix >= 0.999 ? b : mix(clean(texture2D(uA, vUv).rgb), b, uMix), 1.0);
				}`,
		});
		this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quad));
		this.post = new PostChain(gl, width, height);
	}

	// The toma on screen at t, if any. It owns the camera; with mundo 'oculto' the surroundings step aside.
	private tomaPose(t: number) {
		const window = this.plan.tomaWindows.find((w) => t >= w.start && t < w.end);
		const active = window ? this.tomas.find((x) => x.id === window.id) : undefined;
		const hero = this.model;
		if (hero && this.heroRest && (active || this.heroTouched)) {
			hero.position.copy(this.heroRest.position);
			hero.quaternion.copy(this.heroRest.quaternion);
			hero.scale.copy(this.heroRest.scale);
			hero.visible = this.heroRest.visible;
			this.heroTouched = Boolean(active);
		}
		this.tomas.forEach((x) => (x.group.visible = x === active));
		const hidden = active?.setup.mundo === 'oculto';
		if (hidden && !this.shown) {
			this.shown = new Map(this.root.children.map((c) => [c, c.visible]));
			this.root.children.forEach((c) => (c.visible = c === hero));
		} else if (!hidden && this.shown) {
			this.shown.forEach((visible, c) => (c.visible = visible));
			this.shown = null;
		}
		this.scene.background = hidden ? this.paperBackground.set(active!.setup.fondo ?? '#e9eef2') : null;
		if (!active || !window) return null;
		const span = Math.max(1e-3, window.end - window.start);
		const result = active.update(Math.min(1, Math.max(0, (t - window.start) / span)), t - window.start);
		return result && result.camera ? result.camera : null;
	}

	private setPose(t: number) {
		const written = this.tomas.length ? this.tomaPose(t) : null;
		if (written) {
			this.camera.position.set(...written.position);
			this.camera.lookAt(new THREE.Vector3(...written.look));
			const fov = written.fov ?? 40;
			if (this.camera.fov !== fov) {
				this.camera.fov = fov;
				this.camera.updateProjectionMatrix();
			}
			this.gl.clippingPlanes = [];
			return;
		}
		const pose = this.plan.pose(t, this.plan.quakeAt);
		this.camera.position.copy(pose.pos);
		this.camera.lookAt(pose.look);
		if (this.camera.fov !== pose.fov) {
			this.camera.fov = pose.fov;
			this.camera.updateProjectionMatrix();
		}
		// Underground, everything in front of the slice is cut away.
		this.gl.clippingPlanes = pose.pos.y < 0 ? [this.clip] : [];
	}

	private cameraSpeed(t: number) {
		const dt = 1 / this.fps;
		const a = this.plan.pose(t - dt / 2);
		const b = this.plan.pose(t + dt / 2);
		return a.pos.distanceTo(b.pos) + a.look.distanceTo(b.look) * 0.25;
	}

	private updateWorld(t: number) {
		const {plan} = this;
		const grade = gradeAt(t, plan.grades);
		const paper = plan.paperAt(t);
		const quake = plan.quakeAt(t);
		const day = 1 - grade.night;
		this.sky.apply(grade, paper);
		this.fog.color.copy(grade.fog).lerp(worldUniforms.uPaperColor.value, paper);
		// The blueprint is shot from far away: haze there would wash the tower out.
		this.fog.near = 280 + paper * 2200;
		this.fog.far = 2300 + paper * 3000;
		worldUniforms.uT.value = t;
		worldUniforms.uQuake.value = quake;
		worldUniforms.uPaper.value = paper;
		worldUniforms.uFlex.value = plan.flexAt(t);
		const dark = Math.min(1, Math.max(0, (t - plan.quakeStart - 0.6) / 4.2));
		worldUniforms.uBlackout.value = Math.max(dark * 0.92, day);
		if (this.city) this.city.lampMaterial.opacity = (1 - worldUniforms.uBlackout.value) * 0.9;
		this.traffic?.update(t, plan.quakeStart + 0.8, grade.night * 0.9);
		this.crowd?.update(t, plan.quakeStart);
		this.section.update(t, plan.waveAt(t), plan.pileAt(t), plan.depthAt(t), 0.82 + day * 0.18);
		this.collapse?.update(plan.collapseAt === null ? -1 : t - plan.collapseAt, this.dustTint.copy(grade.key).lerp(grade.sky, 0.5).multiplyScalar(0.55 + day * 0.45));
		if (this.tower) {
			this.tower.beaconMaterial.visible = Math.sin(t * 5) > -0.2 && day < 0.5;
			this.tower.ghosts.forEach((m) => (m.opacity = paper * 0.15));
		}
		if (this.model && this.film.world.hero.floats) {
			this.model.position.y = Math.sin(t * 0.9) * 0.5 * Math.max(1, plan.stage.scale) + plan.bobAt(t);
			this.model.rotation.z = Math.sin(t * 0.7 + 1) * 0.018;
			this.model.rotation.x = Math.sin(t * 0.55) * 0.012;
		}
		return {grade, paper};
	}

	render(frame: number) {
		const t = frame / this.fps;
		const {grade, paper} = this.updateWorld(t);
		this.setPose(t);
		const speed = this.cameraSpeed(t);
		const samples = speed > 1.8 ? Math.min(MAX_SAMPLES, 5 + Math.ceil(speed * 1.2)) : 1;
		const {gl} = this;
		gl.shadowMap.needsUpdate = true;
		let read = this.accum[0];
		let write = this.accum[1];
		for (let i = 0; i < samples; i++) {
			const sub = samples === 1 ? 0 : ((i + 0.5) / samples - 0.5) * (SHUTTER / this.fps);
			this.setPose(t + sub);
			gl.setRenderTarget(this.frameScene);
			gl.clear();
			gl.render(this.scene, this.camera);
			gl.clippingPlanes = [];
			this.quad.uniforms.uA.value = read.texture;
			this.quad.uniforms.uB.value = this.frameScene.texture;
			this.quad.uniforms.uMix.value = 1 / (i + 1);
			gl.setRenderTarget(write);
			gl.render(this.quadScene, this.quadCam);
			[read, write] = [write, read];
		}
		gl.clippingPlanes = [];
		this.post.render(read.texture, frame, {
			bloom: 0.72 * (1 - paper * 0.8),
			tilt: this.plan.tiltAt(t),
			saturation: grade.saturation,
			contrast: grade.contrast,
			lift: grade.lift,
			grain: 0.016,
		});
	}
}

const Rig: React.FC<{plan: WorldPlan; film: Film; collapse: CollapseData | null}> = ({plan, film, collapse}) => {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const gl = useThree((s) => s.gl);
	const world = useMemo(() => new World(gl, plan, film, collapse, fps, width, height), [gl, plan, film, collapse, fps, width, height]);
	const current = useRef(frame);
	current.current = frame;
	// A positive priority hands the render loop over to World.
	useFrame(() => world.render(current.current), 1);
	return null;
};

export const CityWorld: React.FC<{plan: WorldPlan; film: Film}> = ({plan, film}) => {
	const {width, height} = useVideoConfig();
	const [collapse, setCollapse] = useState<CollapseData | null>(null);
	const needsBake = plan.collapseAt !== null;
	const [handle] = useState(() => (needsBake ? delayRender('collapse bake') : null));

	useEffect(() => {
		if (handle === null) return;
		Promise.all([fetch(staticFile('collapse.json')).then((r) => r.json()), fetch(staticFile('collapse.bin')).then((r) => r.arrayBuffer())])
			.then(([meta, buffer]: [CollapseMeta, ArrayBuffer]) => {
				setCollapse({meta, data: new Float32Array(buffer)});
				continueRender(handle);
			})
			.catch((e) => cancelRender(e));
	}, [handle]);

	if (needsBake && !collapse) return null;
	return (
		<ThreeCanvas
			width={width}
			height={height}
			flat
			linear
			legacy
			dpr={1}
			frameloop="demand"
			gl={{antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}
		>
			<Rig plan={plan} film={film} collapse={collapse} />
		</ThreeCanvas>
	);
};
