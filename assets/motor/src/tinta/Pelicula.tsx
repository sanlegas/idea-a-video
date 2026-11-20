import {useFrame, useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, Easing, Html5Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {aplicarFalla, CONSTRUCCIONES, resetPose, type Falla} from './construcciones';
import {ESCENARIOS} from './escenarios';
import {asentar, cargarGenerado, cargarKenney, contraPared} from './generado';
import {CONTORNO, entintar, SIN_TINTA, soloContorno, Tinta, toon} from './npr';
import {easeOut3, ramp} from '../estudio/film';
import {entradaDe, ENTRADAS, tomaEn, type Accion, type Objeto, type Pelicula, type Tono} from './formato';

const W = 1080;
const H = 1920;
const TONO: Record<Tono, string> = {normal: '#1F1E24', alerta: '#D8432C', info: '#2F6BFF'};

// The stock character: a red skittle, turned on a lathe.
const bolo = () => {
	const pts = [[0, 0], [1.25, 0], [1.6, 0.9], [1.65, 2.0], [1.3, 3.0], [0.7, 3.7], [0.62, 4.2], [0.95, 4.9], [0.98, 5.5], [0.7, 6.1], [0, 6.3]].map(([x, y]) => new THREE.Vector2(x, y));
	const g = new THREE.Group();
	g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), toon('#E2553D', 0.05)));
	const banda = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.72, 0.28, 28), toon('#F4EBDD', 0));
	banda.position.y = 3.95;
	g.add(banda);
	return g;
};

// The stock ball: something small that rolls off an unguarded edge.
const pelota = (largo: number) => {
	const g = new THREE.Group();
	const m = new THREE.Mesh(new THREE.SphereGeometry(largo / 2, 24, 16), toon('#E2553D', 0));
	m.position.y = largo / 2;
	const franja = new THREE.Mesh(new THREE.TorusGeometry(largo / 2, largo * 0.05, 8, 32), toon('#F4EBDD', 0));
	franja.position.y = largo / 2;
	g.add(m, franja);
	return g;
};

const anillo = (color: string) => {
	const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({color, transparent: true, depthWrite: false, side: THREE.DoubleSide}));
	m.rotation.x = -Math.PI / 2;
	m.layers.set(SIN_TINTA);
	return m;
};

const cono = () => {
	const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 40, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: '#FFE27A', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide}));
	m.layers.set(SIN_TINTA);
	return m;
};

// Every model the film needs, loaded once: Kenney refs of the sceneries used and each object's own source.
type Cargados = {kenney: Map<string, THREE.Object3D>; objetos: Map<string, THREE.Object3D>};

const cargarTodo = async (p: Pelicula): Promise<Cargados> => {
	const usados = new Set([...p.tomas.map((t) => t.escenario), ...p.objetos.map((o) => o.lugar.escenario)]);
	const refs = new Set([...usados].flatMap((e) => ESCENARIOS[e]?.kenney ?? []));
	p.objetos.forEach((o) => o.fuente.startsWith('kenney:') && refs.add(o.fuente.slice(7)));
	const kenney = new Map(await Promise.all([...refs].map(async (r) => [r, await cargarKenney(r)] as const)));
	const objetos = new Map(
		await Promise.all(
			p.objetos.map(async (o) => {
				let obj: THREE.Object3D;
				if (o.fuente === 'bolo') obj = bolo();
				else if (o.fuente === 'pelota') obj = pelota(o.largo);
				else if (o.fuente.startsWith('construccion:')) obj = CONSTRUCCIONES[o.fuente.slice(13)].construir(o.partes ?? []);
				else if (o.fuente.startsWith('glb:')) obj = await cargarGenerado({archivo: o.fuente.slice(4), largo: o.largo});
				else obj = asentar(entintar(kenney.get(o.fuente.slice(7))!.clone(true)), o.largo);
				if (o.fuente === 'bolo') obj.scale.setScalar(o.largo / 6.3);
				if (o.contorno) soloContorno(obj);
				return [o.id, obj] as const;
			}),
		),
	);
	return {kenney, objetos};
};

type Efecto = {accion: Accion; malla: THREE.Mesh; origen?: THREE.Vector3};
type Mundo = {scene: THREE.Scene; objetos: Map<string, THREE.Object3D>; destino: Map<string, THREE.Vector3>; centro: Map<string, THREE.Vector3>; medida: Map<string, number>; efectos: Efecto[]};

const construir = (p: Pelicula, c: Cargados): Mundo => {
	const scene = new THREE.Scene();
	// Toon diffuse divides by π: ambient plus sun near π leaves lit faces at their own colour.
	scene.add(new THREE.HemisphereLight('#ffffff', '#d9d2c3', 1.7));
	const sol = new THREE.DirectionalLight('#fff8ec', 1.6);
	sol.position.set(-20, 40, 25);
	scene.add(sol);
	const pasto = new THREE.Mesh(new THREE.PlaneGeometry(2000, 400), toon('#9BD36F', 0.12));
	pasto.rotation.x = -Math.PI / 2;
	pasto.position.set(200, -0.05, 0);
	scene.add(pasto);

	const usados = new Set([...p.tomas.map((t) => t.escenario), ...p.objetos.map((o) => o.lugar.escenario)]);
	usados.forEach((id) => {
		const e = ESCENARIOS[id];
		const grupo = new THREE.Scene();
		e.construir(grupo, (ref, color) => {
			const o = entintar(c.kenney.get(ref)!.clone(true));
			if (color) o.traverse((m) => ((m as THREE.Mesh).isMesh ? ((m as THREE.Mesh).material = toon(color, 0)) : null));
			return asentar(o);
		});
		const holder = new THREE.Group();
		holder.position.copy(e.origen);
		[...grupo.children].forEach((ch) => holder.add(ch));
		scene.add(holder);
	});

	const destino = new Map<string, THREE.Vector3>();
	const centro = new Map<string, THREE.Vector3>();
	const medida = new Map<string, number>();
	p.objetos.forEach((o: Objeto) => {
		const obj = c.objetos.get(o.id)!;
		const e = ESCENARIOS[o.lugar.escenario];
		const s = e.slots[o.lugar.slot];
		obj.position.set(e.origen.x + s.x, s.y, e.origen.z + s.z);
		// A ball shares the deck with the trunk: it rests off-centre, in front, where it can be seen and roll off.
		if (o.fuente === 'pelota') obj.position.add(new THREE.Vector3(3, 0, 3));
		obj.rotation.y = (s.rot ?? 0) + (o.giro ?? 0);
		scene.add(obj);
		if (s.pared) contraPared(obj, s.pared.eje, (s.pared.eje === 'x' ? e.origen.x : e.origen.z) + s.pared.en);
		obj.updateMatrixWorld(true);
		const box = new THREE.Box3().setFromObject(obj);
		destino.set(o.id, obj.position.clone());
		centro.set(o.id, box.getCenter(new THREE.Vector3()));
		medida.set(o.id, Math.max(...box.getSize(new THREE.Vector3()).toArray()));
	});

	const efectos: Efecto[] = [];
	p.acciones.forEach((a) => {
		if (a.tipo === 'pulso') {
			const m = anillo('#E2553D');
			scene.add(m);
			efectos.push({accion: a, malla: m});
		}
		if (a.tipo === 'cono') {
			const m = cono();
			const obj = c.objetos.get(a.objeto)!;
			const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
			// Generated objects face +z: the lens is at the front, near the top.
			const origen = obj.localToWorld(new THREE.Vector3(0, (size.y / obj.scale.y) * 0.75, (size.z / obj.scale.z) * 0.45));
			m.position.copy(origen);
			scene.add(m);
			efectos.push({accion: a, malla: m, origen});
		}
	});
	return {scene, objetos: c.objetos, destino, centro, medida, efectos};
};

const Escena: React.FC<{p: Pelicula; cargados: Cargados}> = ({p, cargados}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const gl = useThree((s) => s.gl);
	const current = useRef(frame);
	current.current = frame;
	const mundo = useMemo(() => construir(p, cargados), [p, cargados]);
	const view = useMemo(() => {
		const cam = new THREE.PerspectiveCamera(28, W / H, 0.5, 900);
		cam.layers.enable(SIN_TINTA);
		cam.layers.enable(CONTORNO);
		return cam;
	}, []);
	const tinta = useMemo(() => new Tinta(gl, W, H), [gl]);
	useEffect(() => () => tinta.dispose(), [tinta]);

	useFrame(() => {
		const t = current.current / fps;
		const toma = tomaEn(p, t);
		const e = ESCENARIOS[toma.escenario];
		// Each shot looks from its own angle and distance, so cutting between two shots of one place still reads as a cut.
		const k = p.tomas.indexOf(toma);
		const angulo = (((k * 0.618) % 1) - 0.5) * 0.7;
		const lejos = 0.84 + ((k * 0.37) % 1) * 0.22;
		const girar = (v: THREE.Vector3) => v.applyAxisAngle(new THREE.Vector3(0, 1, 0), angulo);
		const u = interpolate(t, [toma.desde, toma.hasta], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

		// Objects: entrances, appearances and turns.
		p.objetos.forEach((o) => {
			const obj = mundo.objetos.get(o.id)!;
			const fin = mundo.destino.get(o.id)!;
			if (o.fuente.startsWith('construccion:')) resetPose(obj);
			obj.position.copy(fin);
			obj.visible = true;
			obj.rotation.z = 0;
			const base = obj.userData.escalaBase ?? (obj.userData.escalaBase = obj.scale.x);
			obj.scale.setScalar(base);
		});
		// Visibility follows each object's aparece/desaparece in time order, so one can vanish and come back: hidden before
		// a first 'aparece', and every event already reached switches it. desde is the 'aparece' that pops it in.
		const vista = new Map<string, {visible: boolean; desde: number | null}>();
		[...p.acciones].filter((a) => a.tipo === 'aparece' || a.tipo === 'desaparece').sort((a, b) => a.en - b.en).forEach((a) => {
			const v = vista.get(a.objeto) ?? {visible: a.tipo !== 'aparece', desde: null};
			if (t >= a.en) Object.assign(v, {visible: a.tipo === 'aparece', desde: a.tipo === 'aparece' ? a.en : null});
			vista.set(a.objeto, v);
		});
		vista.forEach((v, id) => {
			const obj = mundo.objetos.get(id);
			if (!obj) return;
			obj.visible = v.visible;
			if (v.desde === null) return;
			const s = interpolate(t, [v.desde, v.desde + 0.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2))});
			obj.scale.setScalar(obj.userData.escalaBase * Math.max(0.001, s));
		});
		p.acciones.forEach((a) => {
			const obj = mundo.objetos.get(a.objeto);
			if (!obj) return;
			if (a.tipo === 'entra') {
				const o = p.objetos.find((x) => x.id === a.objeto)!;
				const puerta = ESCENARIOS[o.lugar.escenario].puerta.clone().add(ESCENARIOS[o.lugar.escenario].origen);
				const k = interpolate(t, [a.en, a.hasta], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad)});
				const fin = mundo.destino.get(a.objeto)!;
				const andando = k > 0 && k < 1 ? 1 : 0;
				obj.position.lerpVectors(puerta, fin, k).setY(fin.y + Math.abs(Math.sin(t * 9)) * 0.6 * andando);
				obj.rotation.z = Math.sin(t * 9) * 0.08 * andando;
			}
			if (a.tipo === 'falla' && t >= a.en) aplicarFalla(obj, a.efecto as Falla, Math.min(1, (t - a.en) / Math.max(0.3, a.hasta - a.en)), t);
			if (a.tipo === 'cae' && t >= a.en) {
				// Rolls a little toward the open edge, then drops to the ground and bounces twice.
				const fin = mundo.destino.get(a.objeto)!;
				const dur = Math.max(0.6, a.hasta - a.en);
				const k = Math.min(1, (t - a.en) / dur);
				const rueda = Math.min(1, k / 0.3);
				const borde = 4.8;
				obj.position.x = fin.x + rueda * borde;
				const caida = Math.max(0, (k - 0.3) / 0.7);
				const suelo = 0.5;
				const rebote = Math.abs(Math.sin(caida * Math.PI * 2.5)) * (1 - caida) * 1.5;
				obj.position.y = caida > 0 ? suelo + (fin.y - suelo) * Math.max(0, 1 - caida * 2.2) ** 2 + (caida > 0.45 ? rebote : 0) : fin.y;
				obj.rotation.z = -rueda * 4 - caida * 6;
			}
			if (a.tipo === 'gira') obj.rotation.y = interpolate(t, [a.en, a.hasta], [0, Math.PI * 2], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
		});

		// Effects: alarm pulses and camera cones.
		mundo.efectos.forEach(({accion: a, malla, origen}) => {
			if (a.tipo === 'pulso') {
				const activo = t >= a.en && t < a.hasta;
				malla.visible = activo;
				const g = activo ? ((t - a.en) % 0.85) / 0.85 : 0;
				const obj = mundo.objetos.get(a.objeto)!;
				malla.position.set(obj.position.x, mundo.destino.get(a.objeto)!.y + 0.15, obj.position.z);
				malla.scale.setScalar(mundo.medida.get(a.objeto)! * (0.6 + g * 1.3));
				(malla.material as THREE.MeshBasicMaterial).opacity = (1 - g) * 0.9;
			}
			if (a.tipo === 'cono' && origen) {
				const activo = t >= a.en && t < a.hasta;
				malla.visible = activo;
				const blanco = mundo.objetos.get(a.hacia);
				const punto = blanco ? new THREE.Vector3().setFromMatrixPosition(blanco.matrixWorld).add(new THREE.Vector3(0, 1.5, 0)) : origen.clone().add(new THREE.Vector3(0, -10, 10));
				const largo = origen.distanceTo(punto) + 2;
				malla.scale.set(largo * 0.4, largo * 0.4, largo);
				malla.lookAt(punto);
			}
		});

		// Camera: the scenery's wide view, or a frame around one object, always drifting slowly closer.
		const empuje = 1 - 0.07 * Easing.inOut(Easing.quad)(u);
		// While something breaks or falls in this scenery, the camera goes to it even in a wide shot: a split beam or a
		// popping board is too small to read from afar.
		const foco = p.acciones.find((a) => (a.tipo === 'falla' || a.tipo === 'cae') && t >= a.en - 0.3 && t < a.hasta + 0.6 && p.objetos.find((o) => o.id === a.objeto)?.lugar.escenario === toma.escenario);
		const objetivo = foco ? foco.objeto : toma.encuadre === 'objeto' ? toma.objetivo : undefined;
		if (objetivo && mundo.centro.has(objetivo)) {
			const c = mundo.centro.get(objetivo)!.clone();
			// A fall needs the whole height in frame: aim halfway down, toward the edge it rolls off, from further away.
			if (foco?.tipo === 'cae') c.set(mundo.destino.get(objetivo)!.x + 5, mundo.destino.get(objetivo)!.y / 2, mundo.destino.get(objetivo)!.z + 2);
			// Splits and pops happen under and on the deck: aim a little below the centre of the house.
			const efecto = foco?.tipo === 'falla' ? (foco as {efecto: string}).efecto : null;
			if (efecto === 'truena') c.y -= 2;
			// Beams split under the deck: look at them from below.
			if (efecto === 'raja') c.y -= 4;
			// Seen from below, a split beam hides behind whoever stands on the grass: come round a little.
			const lado = girar(e.vista.pos.clone().sub(e.vista.mira).setY(0).normalize()).applyAxisAngle(new THREE.Vector3(0, 1, 0), efecto === 'raja' ? 0.9 : 0);
			const d = (foco?.tipo === 'cae' ? 46 : Math.max(16, mundo.medida.get(objetivo)! * (foco ? 2.4 : 5.5))) * empuje;
			view.position.copy(c).add(lado.multiplyScalar(d)).add(new THREE.Vector3(0, efecto === 'raja' ? -d * 0.25 : d * 0.45, 0));
			view.lookAt(c);
		} else {
			const pos = girar(e.vista.pos.clone().sub(e.vista.mira)).multiplyScalar(empuje * lejos).add(e.vista.mira).add(e.origen);
			view.position.copy(pos);
			view.lookAt(e.vista.mira.clone().add(e.origen));
		}
		view.updateMatrixWorld();
		mundo.scene.updateMatrixWorld(true);
		tinta.render(mundo.scene, view);
	}, 1);
	return null;
};

// Rain over the shots of a scenery while a 'lluvia' action lasts: slanted streaks drawn over the picture, and a grey veil.
const Lluvia: React.FC<{p: Pelicula}> = ({p}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const toma = tomaEn(p, t);
	const activa = p.acciones.find((a): a is Extract<Accion, {tipo: 'lluvia'}> => a.tipo === 'lluvia' && t >= a.en && t < a.hasta && p.objetos.find((o) => o.id === a.objeto)?.lugar.escenario === toma.escenario);
	if (!activa) return null;
	const u = Math.min(1, (t - activa.en) / 0.5, (activa.hasta - t) / 0.5);
	const gotas = Array.from({length: 160}, (_, i) => {
		const x = ((i * 137.5) % 1080) + ((frame * 9) % 60);
		const y = ((i * 263 + frame * 70) % 2100) - 100;
		return <div key={i} style={{position: 'absolute', left: x, top: y, width: 4, height: 90, background: 'rgba(70,95,130,.7)', transform: 'rotate(14deg)', borderRadius: 2}} />;
	});
	return <div style={{position: 'absolute', inset: 0, opacity: u, background: 'rgba(60,75,100,.26)'}}>{gotas}</div>;
};

// The shot's caption, at the top, coming in with the shot.
const Rotulo: React.FC<{p: Pelicula}> = ({p}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const toma = tomaEn(p, t);
	if (!toma.rotulo) return null;
	const u = interpolate(t, [toma.desde, toma.desde + 0.22, toma.hasta - 0.15, toma.hasta], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	// It lands with a small overshoot, a beat after the picture, and an alert shakes once.
	const cae = ramp(t, toma.desde + 0.06, toma.desde + 0.3);
	const rebote = 1 + 2.7 * (cae - 1) ** 3 + 1.7 * (cae - 1) ** 2;
	const tiembla = toma.tono === 'alerta' ? Math.sin((t - toma.desde) * 55) * 7 * Math.max(0, 1 - (t - toma.desde) / 0.45) : 0;
	// Over a night sky the normal tone turns cream, with a dark shadow instead of a paper one.
	const oscuro = ESCENARIOS[toma.escenario]?.oscuro;
	const color = oscuro && (toma.tono ?? 'normal') === 'normal' ? '#F3EEE2' : TONO[toma.tono ?? 'normal'];
	return <div style={{position: 'absolute', left: 60, right: 60, top: 230, textAlign: 'center', fontFamily: 'Figtree', fontWeight: 900, fontSize: 80, lineHeight: 1.1, color, opacity: u, transform: `translate(${tiembla.toFixed(1)}px, ${((1 - rebote) * 26).toFixed(1)}px) scale(${(0.9 + 0.1 * rebote).toFixed(3)})`, textShadow: oscuro ? '0 3px 0 rgba(16,20,40,.85)' : '0 3px 0 rgba(243,238,226,.9)'}}>{toma.rotulo}</div>;
};

// How the picture comes in at each cut. The 3D scene has one camera, so two shots never show at once: a whip pan
// slides the old shot off the paper and the new one in, a punch-in lands from closer up and a flash burns to white.
const Corte: React.FC<{p: Pelicula; children: React.ReactNode}> = ({p, children}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const i = Math.max(0, p.tomas.indexOf(tomaEn(p, t)));
	const toma = p.tomas[i];
	const tipo = entradaDe(p, i);
	const d = Math.min(ENTRADAS[tipo], (toma.hasta - toma.desde) * 0.5);
	const e = d > 0 ? ramp(t, toma.desde, toma.desde + d) : 1;
	// The shot before a whip pan starts leaving three frames early.
	const sale = i + 1 < p.tomas.length && entradaDe(p, i + 1) === 'latigo' ? ramp(t, toma.hasta - 0.1, toma.hasta) : 0;
	const lado = (k: number) => (k % 2 ? -1 : 1);
	const tr: string[] = [];
	const fl: string[] = [];
	if (e < 1 && tipo === 'golpe') {
		tr.push(`scale(${1 + 0.16 * (1 - easeOut3(e))})`);
		fl.push(`blur(${(6 * (1 - e)).toFixed(1)}px)`);
	}
	if (e < 1 && tipo === 'latigo') {
		tr.push(`translateX(${(lado(i) * (1 - easeOut3(e)) * 70).toFixed(2)}%)`);
		// The smear follows the speed: strong while the shot flies in, light as it brakes, gone before it stops.
		if (e < 0.8) fl.push(`url(#tinta-barrido${e < 0.45 ? '' : '-suave'})`);
	}
	if (sale > 0) {
		tr.push(`translateX(${(-lado(i + 1) * sale * sale * 70).toFixed(2)}%)`);
		fl.push('url(#tinta-barrido)');
	}
	const blanco = e < 1 && tipo === 'destello' ? 0.85 * (1 - e) ** 3 : 0;
	return (
		<AbsoluteFill style={{transform: tr.length ? tr.join(' ') : undefined, filter: fl.length ? fl.join(' ') : undefined}}>
			{children}
			{blanco > 0.01 ? <AbsoluteFill style={{background: '#fff', opacity: blanco}} /> : null}
		</AbsoluteFill>
	);
};

export const PeliculaTinta: React.FC<{pelicula: Pelicula}> = ({pelicula}) => {
	const [cargados, setCargados] = useState<Cargados | null>(null);
	const [handle] = useState(() => delayRender(`película ${pelicula.nombre}`));
	useEffect(() => {
		cargarTodo(pelicula).then((c) => {
			setCargados(c);
			continueRender(handle);
		});
	}, [pelicula, handle]);
	return (
		<AbsoluteFill style={{background: '#F3EEE2'}}>
			{/* Sideways-only blur for the whip pan. */}
			<svg width="0" height="0" style={{position: 'absolute'}}>
				<filter id="tinta-barrido" x="-15%" y="0" width="130%" height="100%">
					<feGaussianBlur stdDeviation="42 0" />
				</filter>
				<filter id="tinta-barrido-suave" x="-10%" y="0" width="120%" height="100%">
					<feGaussianBlur stdDeviation="14 0" />
				</filter>
			</svg>
			<Corte p={pelicula}>
				{cargados ? (
					<ThreeCanvas width={W} height={H} flat dpr={1} frameloop="demand" gl={{antialias: false, preserveDrawingBuffer: true}}>
						<Escena p={pelicula} cargados={cargados} />
					</ThreeCanvas>
				) : null}
				<Lluvia p={pelicula} />
			</Corte>
			<Rotulo p={pelicula} />
			{pelicula.audio ? <Html5Audio src={staticFile(pelicula.audio)} /> : null}
		</AbsoluteFill>
	);
};
