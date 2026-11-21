import {useFrame, useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {Film, Shot} from '../film';
import {Hud} from '../kit/hud';
import {readProgram, runProgram} from '../kit/program';
import {WORLDS} from '../worlds';
import {buildBokeh, buildSky, buildStars} from './backdrop';
import {MirrorFloor} from './floor';
import {studioEnvironment, studioLights} from './light';
import type {Pose} from './pose';
import {StudioPost} from './post';

const SHUTTER = 0.5;
const CALM_SAMPLES = 6;
const FAST_SAMPLES = 14;
// Light render (film.ligero): one pass when calm, two in fast moves, and less antialiasing. Several times faster
// where WebGL runs on the processor; motion blur is shorter and edges a little harder.
const LIGERO = {calm: 1, fast: 2, msaa: 2};

// A low-discrepancy sequence: every sample of a frame looks through a slightly different point of the pixel.
const halton = (i: number, base: number) => {
	let f = 1;
	let r = 0;
	for (let n = i; n > 0; n = Math.floor(n / base)) {
		f /= base;
		r += f * (n % base);
	}
	return r;
};

// Over footage, additive light (glows, dots, stars) must add colour without making its whole sprite opaque: the alpha
// channel keeps only what solid things cover, and the post pass turns light into coverage.
const keepAlpha = (o: THREE.Object3D) => {
	const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
	for (const x of m ? (Array.isArray(m) ? m : [m]) : []) {
		if (x.blending !== THREE.AdditiveBlending) continue;
		x.blending = THREE.CustomBlending;
		x.blendEquation = THREE.AddEquation;
		x.blendSrc = THREE.SrcAlphaFactor;
		x.blendDst = THREE.OneFactor;
		x.blendSrcAlpha = THREE.ZeroFactor;
		x.blendDstAlpha = THREE.OneFactor;
		x.needsUpdate = true;
	}
};

class Studio {
	private scene = new THREE.Scene();
	private camera: THREE.PerspectiveCamera;
	private frameTarget: THREE.WebGLRenderTarget;
	private accum: THREE.WebGLRenderTarget[];
	private quadScene = new THREE.Scene();
	private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private quad: THREE.ShaderMaterial;
	private post: StudioPost;
	private dome: THREE.Object3D;
	private bokeh: THREE.ShaderMaterial | null = null;
	private bokehMesh: THREE.Object3D | null = null;
	private stars: THREE.Object3D | null = null;
	private floor: MirrorFloor | null = null;
	private root = new THREE.Group();
	private update: (t: number) => void;
	private poseAt: (t: number) => Pose;
	private look: (position: THREE.Vector3) => void;
	private hud: Hud;
	private ligero: boolean;
	// Footage under the scene: the 3D keeps a clear background so the video shows through.
	private clear: boolean;

	constructor(private gl: THREE.WebGLRenderer, film: Film, private shot: Shot, hudRoot: HTMLElement | null, {textures, models}: Loaded, private fps: number, private width: number, private height: number) {
		this.ligero = Boolean(film.ligero);
		this.clear = Boolean(shot.footage);
		gl.toneMapping = THREE.NoToneMapping;
		gl.autoClear = true;
		gl.setClearColor('#000000', this.clear ? 0 : 1);
		const {setup, program} = readProgram(shot.code);
		const world = WORLDS[setup.world] ?? WORLDS.azul;
		this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
		this.scene.environment = studioEnvironment(gl, world);
		studioLights(this.scene, world);
		this.dome = buildSky(this.scene, setup.stars ? {...world, horizon: world.zenith} : world, Boolean(setup.floor));
		this.dome.visible = !this.clear;
		if (setup.bokeh) {
			this.bokeh = buildBokeh(this.scene, world, Boolean(setup.floor));
			this.bokehMesh = this.scene.children[this.scene.children.length - 1];
		}
		if (setup.stars) this.stars = buildStars(this.scene);
		if (setup.floor) {
			this.floor = new MirrorFloor(world, width, height);
			this.scene.add(this.floor.mesh);
		}
		this.scene.add(this.root);
		this.hud = new Hud(hudRoot, width, height);
		const made = runProgram(film, shot, program, this.root, this.hud, setup, textures, models);
		this.update = made.update;
		this.poseAt = made.poseAt;
		this.look = made.look;

		const target = (samples: number) => new THREE.WebGLRenderTarget(width, height, {type: THREE.HalfFloatType, samples, depthBuffer: samples > 0, colorSpace: THREE.NoColorSpace});
		this.frameTarget = target(this.ligero ? LIGERO.msaa : 4);
		this.accum = [target(0), target(0)];
		this.quad = new THREE.ShaderMaterial({
			depthTest: false,
			depthWrite: false,
			uniforms: {uA: {value: null}, uB: {value: null}, uMix: {value: 1}},
			vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
			fragmentShader: `varying vec2 vUv; uniform sampler2D uA, uB; uniform float uMix;
			vec3 clean(vec3 c) { return (isnan(c.r) || isnan(c.g) || isnan(c.b) || isinf(c.r) || isinf(c.g) || isinf(c.b)) ? vec3(0.0) : min(c, vec3(20.0)); }
			void main() {
				vec4 sb = texture2D(uB, vUv);
				vec4 b = vec4(clean(sb.rgb), clamp(sb.a, 0.0, 1.0));
				vec4 sa = texture2D(uA, vUv);
				vec4 a = vec4(clean(sa.rgb), clamp(sa.a, 0.0, 1.0));
				gl_FragColor = uMix >= 0.999 ? b : mix(a, b, uMix);
			}`,
		});
		this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quad));
		this.post = new StudioPost(gl, width, height);
	}

	private place(t: number, sample: number) {
		const p = this.poseAt(t);
		this.camera.position.copy(p.pos);
		this.camera.lookAt(p.look);
		this.camera.updateMatrixWorld();
		if (this.camera.fov !== p.fov) {
			this.camera.fov = p.fov;
			this.camera.updateProjectionMatrix();
		}
		this.camera.setViewOffset(this.width, this.height, halton(sample + 1, 2) - 0.5, halton(sample + 1, 3) - 0.5, this.width, this.height);
		this.dome.position.copy(p.pos);
		this.look(p.pos);
		if (this.bokeh) this.bokeh.uniforms.uT.value = t;
		this.update(t);
		if (this.clear) this.scene.traverse(keepAlpha);
	}

	private samplesAt(t: number) {
		const a = this.poseAt(t - 0.5 / this.fps);
		const b = this.poseAt(t + 0.5 / this.fps);
		const travel = a.pos.distanceTo(b.pos) + a.look.distanceTo(b.look);
		const size = Math.max(1, a.pos.distanceTo(a.look));
		const fast = travel / size > 0.006;
		if (this.ligero) return fast ? LIGERO.fast : LIGERO.calm;
		return fast ? FAST_SAMPLES : CALM_SAMPLES;
	}

	render(frame: number) {
		const t = this.shot.start + frame / this.fps;
		const {gl} = this;
		const samples = this.samplesAt(t);
		if (this.floor) {
			this.place(t, 0);
			this.camera.clearViewOffset();
			this.floor.capture(gl, this.scene, this.camera, [this.dome, ...(this.bokehMesh ? [this.bokehMesh] : []), ...(this.stars ? [this.stars] : [])]);
		}
		let read = this.accum[0];
		let write = this.accum[1];
		for (let i = 0; i < samples; i++) {
			this.place(t + ((i + 0.5) / samples - 0.5) * (SHUTTER / this.fps), i);
			gl.setRenderTarget(this.frameTarget);
			gl.clear();
			gl.render(this.scene, this.camera);
			this.quad.uniforms.uA.value = read.texture;
			this.quad.uniforms.uB.value = this.frameTarget.texture;
			this.quad.uniforms.uMix.value = 1 / (i + 1);
			gl.setRenderTarget(write);
			gl.render(this.quadScene, this.quadCamera);
			[read, write] = [write, read];
		}
		this.camera.clearViewOffset();
		this.place(t, 0);
		this.camera.clearViewOffset();
		this.post.render(read.texture, frame, 1, this.clear);
		this.hud.sync(t, this.poseAt(t));
	}
}

// What a scene loads before its first frame: pictures as textures, models as scenes to clone.
type Loaded = {textures: Record<string, THREE.Texture>; models: Record<string, THREE.Object3D>};

const Rig: React.FC<{film: Film; shot: Shot; hud: React.RefObject<HTMLDivElement | null>; loaded: Loaded}> = ({film, shot, hud, loaded}) => {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const gl = useThree((s) => s.gl);
	const studio = useMemo(() => {
		try {
			return new Studio(gl, film, shot, hud.current, loaded, fps, width, height);
		} catch (e) {
			cancelRender(e);
			throw e;
		}
	}, [gl, film, shot, hud, loaded, fps, width, height]);
	const current = useRef(frame);
	current.current = frame;
	// A positive priority hands the render loop over to the studio.
	useFrame(() => {
		try {
			studio.render(current.current);
		} catch (e) {
			cancelRender(e);
		}
	}, 1);
	return null;
};

const FONTS = ['900 236px Figtree', '800 100px Figtree', '700 44px Figtree'];

export const Stage: React.FC<{film: Film; shot: Shot}> = ({film, shot}) => {
	const {width, height} = useVideoConfig();
	const [handle] = useState(() => delayRender('fuentes de escena'));
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const hud = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const loader = new THREE.TextureLoader();
		const wanted = Object.entries(film.assets).filter(([name]) => shot.code.includes(name));
		const pictures = wanted.filter(([, asset]) => !asset.modelo).map(async ([name, asset]) => {
			const texture = await loader.loadAsync(staticFile(asset.file));
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.anisotropy = 8;
			return [name, texture] as const;
		});
		const models = wanted.filter(([, asset]) => asset.modelo).map(async ([name, asset]) => [name, (await new GLTFLoader().loadAsync(staticFile(asset.file))).scene] as const);
		Promise.all([Promise.all(pictures), Promise.all(models), ...FONTS.map((f) => document.fonts.load(f))])
			.then(([textures, scenes]) => {
				setLoaded({textures: Object.fromEntries(textures), models: Object.fromEntries(scenes)});
				continueRender(handle);
			})
			.catch((e) => cancelRender(e));
	}, [film, shot, handle]);
	return (
		<>
			{loaded ? (
				<ThreeCanvas width={width} height={height} flat linear dpr={1} frameloop="demand" style={{position: 'absolute', inset: 0}} gl={{antialias: false, alpha: Boolean(shot.footage), premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}>
					<Rig film={film} shot={shot} hud={hud} loaded={loaded} />
				</ThreeCanvas>
			) : null}
			<div ref={hud} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}} />
		</>
	);
};
