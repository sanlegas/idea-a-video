import {useFrame, useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MTLLoader} from 'three/examples/jsm/loaders/MTLLoader.js';
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import type {Prop} from '../../schema';

// When a prop is on screen. Beats in a row that show the same prop are one appearance.
export type PropShow = {id: string; start: number; end: number};

const SIZE = 720;
const TOP = 560;
const IN = 0.35;
const OUT = 0.3;
const FIT = 1.25;
// A card is an introduction, not the shot: each prop appears once, for a few seconds, and the world stays the picture.
const LONGEST = 5;

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const easeOut = (u: number) => 1 - (1 - u) ** 3;

const load = async (prop: Prop): Promise<THREE.Object3D> => {
	const url = staticFile(prop.file);
	if (prop.format === 'glb') return (await new GLTFLoader().loadAsync(url)).scene;
	const materials = await new MTLLoader().loadAsync(url.replace(/\.obj$/, '.mtl'));
	materials.preload();
	return new OBJLoader().setMaterials(materials).loadAsync(url);
};

// Every model is centred and scaled to the same size, so a pipe and a house fill the card alike.
const normalize = (object: THREE.Object3D) => {
	const box = new THREE.Box3().setFromObject(object);
	const size = box.getSize(new THREE.Vector3());
	const center = box.getCenter(new THREE.Vector3());
	const holder = new THREE.Group();
	object.position.sub(center);
	holder.add(object);
	holder.scale.setScalar(FIT / Math.max(size.x, size.y, size.z, 1e-6));
	return holder;
};

const showAt = (shows: PropShow[], t: number) => shows.find((s) => t >= s.start && t < s.end) ?? null;

const Turntable: React.FC<{models: Map<string, THREE.Object3D>; shows: PropShow[]}> = ({models, shows}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const gl = useThree((s) => s.gl);
	const {scene, camera} = useMemo(() => {
		const scene = new THREE.Scene();
		scene.add(new THREE.HemisphereLight('#ffffff', '#6f7f99', 2.2));
		const sun = new THREE.DirectionalLight('#ffffff', 2.6);
		sun.position.set(2, 3.5, 2.5);
		scene.add(sun);
		models.forEach((m) => scene.add(m));
		const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
		camera.position.set(0, 0.75, 2.45);
		camera.lookAt(0, -0.12, 0);
		return {scene, camera};
	}, [models]);
	const current = useRef(frame);
	current.current = frame;
	useFrame(() => {
		const t = current.current / fps;
		const show = showAt(shows, t);
		models.forEach((m, id) => {
			m.visible = show?.id === id;
			if (m.visible && show) m.rotation.y = -0.7 + (t - show.start) * 0.55;
		});
		gl.setClearColor(0x000000, 0);
		gl.clear();
		gl.render(scene, camera);
	}, 1);
	return null;
};

// A glass card with the model turning and its name, over the world, while the voice talks about it.
export const PropCards: React.FC<{props: Prop[]; shows: PropShow[]}> = ({props, shows}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const [models, setModels] = useState<Map<string, THREE.Object3D> | null>(null);
	const [handle] = useState(() => delayRender('modelos del catálogo'));

	useEffect(() => {
		// A model that fails to load is left out; the film still renders without its card.
		Promise.all(props.map((p) => load(p).then((o) => [p.id, normalize(o)] as const, () => null))).then((loaded) => {
			setModels(new Map(loaded.filter((x): x is readonly [string, THREE.Group] => x !== null)));
			continueRender(handle);
		});
	}, [props, handle]);

	if (!models) return null;
	const show = showAt(shows, t);
	const prop = show && models.has(show.id) ? props.find((p) => p.id === show.id) : null;
	const opacity = show ? Math.min(easeOut(clamp01((t - show.start) / IN)), clamp01((show.end - t) / OUT)) : 0;
	const scale = 0.88 + 0.12 * easeOut(clamp01(show ? (t - show.start) / IN : 0));

	return (
		<div style={{position: 'absolute', left: (1080 - SIZE) / 2, top: TOP, width: SIZE, opacity, transform: `scale(${scale})`, transformOrigin: '50% 40%'}}>
			<div style={{position: 'absolute', inset: 0, borderRadius: 52, background: 'rgba(250,251,255,.86)', boxShadow: '0 30px 80px rgba(10,20,40,.35)', border: '2px solid rgba(255,255,255,.9)'}} />
			<ThreeCanvas width={SIZE} height={SIZE} flat dpr={1} frameloop="demand" style={{position: 'relative'}} gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}}>
				<Turntable models={models} shows={shows} />
			</ThreeCanvas>
			<div style={{position: 'relative', marginTop: -20, paddingBottom: 34, textAlign: 'center', fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 76, color: '#14213d', textTransform: 'uppercase', letterSpacing: '0.01em'}}>
				{prop?.label ?? ''}
			</div>
		</div>
	);
};

// Appearances from the storyboard: the first run of beats that shows each prop, cut to LONGEST seconds.
export const propShows = (beats: {prop?: string | null}[], times: {start: number; end: number}[]): PropShow[] => {
	const shows: PropShow[] = [];
	beats.forEach((b, i) => {
		if (!b.prop) return;
		const last = shows[shows.length - 1];
		if (last && last.id === b.prop && Math.abs(last.end - times[i].start) < 0.5) last.end = times[i].end - 0.05;
		else if (!shows.some((s) => s.id === b.prop)) shows.push({id: b.prop, start: times[i].start + 0.15, end: times[i].end - 0.05});
	});
	return shows.map((s) => ({...s, end: Math.min(s.end, s.start + LONGEST)}));
};
