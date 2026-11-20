import {useFrame, useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {entintar, Tinta, toon} from './npr';
import {suavizarNormales} from './suavizar';

const W = 1080;
const H = 1920;

// One model turning on paper with the ink style: to judge a generated GLB as it would look in a video.
// colores: flat colours for the texture (0 keeps the generated texture as it is).
// suavizado: Laplacian passes for the normals (0 keeps the generated normals).
// giro: fixed turn in radians; with it the model stands still instead of spinning (for the four-side review sheet).
export type ModeloProps = {archivo: string; titulo?: string; colores?: number; suavizado?: number; giro?: number};

const Giro: React.FC<{objeto: THREE.Object3D; giro?: number}> = ({objeto, giro}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const gl = useThree((s) => s.gl);
	const current = useRef(frame);
	current.current = frame;
	const {scene, camera, pivote} = useMemo(() => {
		const scene = new THREE.Scene();
		scene.add(new THREE.HemisphereLight('#ffffff', '#d9d2c3', 1.7));
		const sol = new THREE.DirectionalLight('#fff8ec', 1.6);
		sol.position.set(-3, 5, 4);
		scene.add(sol);
		const piso = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 64), toon('#E9DCC4', 0));
		piso.position.y = -0.03;
		scene.add(piso);
		const pivote = new THREE.Group();
		pivote.add(objeto);
		scene.add(pivote);
		const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
		camera.position.set(0, 2.2, 7.2);
		camera.lookAt(0, 0.5, 0);
		return {scene, camera, pivote};
	}, [objeto]);
	const tinta = useMemo(() => new Tinta(gl, W, H), [gl]);
	useEffect(() => () => tinta.dispose(), [tinta]);
	useFrame(() => {
		pivote.rotation.y = giro ?? -0.6 + (current.current / fps) * 0.5;
		tinta.render(scene, camera);
	}, 1);
	return null;
};

// Centred on the floor and scaled to about one unit tall, whatever size the generator chose.
const asentar = (o: THREE.Object3D) => {
	const box = new THREE.Box3().setFromObject(o);
	const size = box.getSize(new THREE.Vector3());
	const c = box.getCenter(new THREE.Vector3());
	o.position.set(-c.x, -box.min.y, -c.z);
	const g = new THREE.Group();
	g.add(o);
	g.scale.setScalar(1.2 / Math.max(size.x, size.y, size.z, 1e-6));
	return g;
};

export const ModeloTinta: React.FC<ModeloProps> = ({archivo, titulo, colores = 4, suavizado = 12, giro}) => {
	const [objeto, setObjeto] = useState<THREE.Object3D | null>(null);
	const [handle] = useState(() => delayRender(`modelo ${archivo}`));
	useEffect(() => {
		new GLTFLoader().loadAsync(staticFile(archivo)).then((g) => {
			if (suavizado > 0) g.scene.traverse((o) => ((o as THREE.Mesh).isMesh ? suavizarNormales((o as THREE.Mesh).geometry, suavizado) : null));
			setObjeto(asentar(entintar(g.scene, 0.12, colores > 0 ? {colores} : false)));
			continueRender(handle);
		});
	}, [archivo, colores, suavizado, handle]);
	return (
		<AbsoluteFill style={{background: '#F3EEE2'}}>
			{objeto ? (
				<ThreeCanvas width={W} height={H} flat dpr={1} frameloop="demand" gl={{antialias: false, preserveDrawingBuffer: true}}>
					<Giro objeto={objeto} giro={giro} />
				</ThreeCanvas>
			) : null}
			{titulo ? <div style={{position: 'absolute', left: 60, right: 60, top: 300, textAlign: 'center', fontFamily: 'Figtree', fontWeight: 900, fontSize: 84, color: '#1F1E24'}}>{titulo}</div> : null}
		</AbsoluteFill>
	);
};
