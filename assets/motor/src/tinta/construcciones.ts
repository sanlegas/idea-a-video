import * as THREE from 'three';
import {toon} from './npr';

// Things built in code, piece by piece, because they must fit a scenery exactly (a treehouse hugs the patio's trunk).
// A generated model cannot do that: without the tree in the picture, the image model draws a table with legs.
// Each construction takes a list of parts, so a story can show it growing stage by stage.

export type Construccion = {about: string; partes: Record<string, string>; construir: (partes: string[]) => THREE.Group};

const MADERA = '#D9A15E';
const MADERA_OSCURA = '#B9844A';
const ACERO = '#B8BEC6';

const caja = (g: THREE.Group, w: number, h: number, d: number, color: string, x: number, y: number, z: number, rot?: THREE.Euler) => {
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color, 0));
	m.position.set(x, y, z);
	if (rot) m.rotation.copy(rot);
	g.add(m);
	return m;
};

// A board between two points, w wide and t thick.
const tabla = (g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, w: number, t: number, color = MADERA) => {
	const largo = a.distanceTo(b);
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, largo, t), toon(color, 0));
	m.position.copy(a).add(b).multiplyScalar(0.5);
	m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
	g.add(m);
};

const cilindro = (g: THREE.Group, r: number, h: number, color: string, pos: THREE.Vector3, eje: 'x' | 'z') => {
	const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), toon(color, 0));
	m.position.copy(pos);
	m.rotation[eje === 'x' ? 'z' : 'x'] = Math.PI / 2;
	g.add(m);
};

// Treehouse around the patio trunk (radius ≈ 1.6 at deck height). Origin: trunk axis, deck top at y = 0.
// Units: 1 = 20 cm. Deck 14 × 14 (2.8 m), railing 4.5 high (90 cm), balusters 0.45 apart (9 cm gap).
const casaArbol: Construccion = {
	about: 'casa del árbol alrededor del tronco del patio (va en patio/plataforma), armada por partes',
	partes: {
		piso: 'dos vigas pegadas al tronco y un piso de tablas encima',
		clavos: 'las vigas sujetas al tronco con clavos',
		tirafondos: 'las vigas sujetas con tirafondos (tornillos gruesos de acero)',
		pernos: 'las vigas separadas del tronco por pernos de anclaje con collar de acero',
		tornapuntas: 'diagonales bajo el piso, de la punta de cada viga a un punto más bajo del tronco',
		barandal_tablas: 'barandal de tablas acostadas, con hueco abajo',
		balaustres: 'barandal de barrotes verticales muy juntos',
		techo: 'cuatro postes y techo de dos aguas',
		holgura: 'hueco amplio entre el tronco y el piso',
	},
	construir: (partes) => {
		const g = new THREE.Group();
		const tiene = (p: string) => partes.includes(p);
		const R = 1.6;
		const LADO = 14;
		const separacion = tiene('pernos') ? 2 : 0;
		const zViga = R + 0.35 + separacion;
		const hueco = tiene('holgura') ? R + 1.1 : R + 0.15;

		// Beams on both sides of the trunk, each in two halves that meet at the trunk (so a split can open them),
		// and the deck boards across them, cut around the trunk.
		for (const s of [-1, 1])
			for (const lado of [-1, 1]) {
				const v = caja(g, (LADO + 2) / 2, 1.2, 0.7, MADERA_OSCURA, (lado * (LADO + 2)) / 4, -0.95, s * zViga);
				v.name = 'viga';
				v.userData.lado = lado;
			}
		const n = 12;
		for (let i = 0; i < n; i++) {
			const z = -LADO / 2 + (i + 0.5) * (LADO / n);
			const ancho = LADO / n - 0.12;
			if (Math.abs(z) < hueco + ancho / 2) {
				const x0 = Math.sqrt(Math.max(0, hueco * hueco - z * z)) + 0.05;
				const tramo = LADO / 2 - x0;
				for (const s of [-1, 1]) {
					const t = caja(g, tramo, 0.3, ancho, MADERA, s * (x0 + tramo / 2), -0.15, z);
					t.name = 'tabla_cerca';
					t.userData.lado = s;
				}
			} else caja(g, LADO, 0.3, ancho, MADERA, 0, -0.15, z);
		}

		// What holds each beam to the trunk.
		for (const s of [-1, 1]) {
			const centro = new THREE.Vector3(0, -0.95, s * zViga);
			if (tiene('clavos')) for (const dx of [-0.4, 0.4]) cilindro(g, 0.08, 0.9, ACERO, centro.clone().add(new THREE.Vector3(dx, 0, s * 0.4)), 'z');
			if (tiene('tirafondos')) {
				cilindro(g, 0.28, 0.25, ACERO, centro.clone().add(new THREE.Vector3(0, 0, s * 0.45)), 'z');
				cilindro(g, 0.12, 1.4, ACERO, centro.clone().add(new THREE.Vector3(0, 0, -s * 0.2)), 'z');
			}
			if (tiene('pernos')) {
				cilindro(g, 0.3, separacion + 1.2, ACERO, new THREE.Vector3(0, -0.95, s * (R + separacion / 2)), 'z');
				cilindro(g, 0.75, 0.3, ACERO, new THREE.Vector3(0, -0.95, s * (R + 0.4)), 'z');
			}
		}

		// Knee braces: from each beam end down to the trunk, a triangle with beam and trunk.
		if (tiene('tornapuntas'))
			for (const s of [-1, 1]) for (const lado of [-1, 1]) tabla(g, new THREE.Vector3(lado * (LADO / 2 - 0.5), -1.5, s * zViga), new THREE.Vector3(lado * (R + 0.2), -7.5, s * (R * 0.6)), 0.6, 0.6, MADERA_OSCURA);

		// Railing on the four edges.
		const ALTO = 4.5;
		const bordes: [THREE.Vector3, THREE.Vector3][] = [
			[new THREE.Vector3(-LADO / 2, 0, -LADO / 2), new THREE.Vector3(LADO / 2, 0, -LADO / 2)],
			[new THREE.Vector3(LADO / 2, 0, -LADO / 2), new THREE.Vector3(LADO / 2, 0, LADO / 2)],
			[new THREE.Vector3(LADO / 2, 0, LADO / 2), new THREE.Vector3(-LADO / 2, 0, LADO / 2)],
			[new THREE.Vector3(-LADO / 2, 0, LADO / 2), new THREE.Vector3(-LADO / 2, 0, -LADO / 2)],
		];
		if (tiene('barandal_tablas') || tiene('balaustres')) {
			for (const [a] of bordes) caja(g, 0.5, ALTO, 0.5, MADERA_OSCURA, a.x, ALTO / 2, a.z);
			for (const [a, b] of bordes) {
				const sube = (v: THREE.Vector3, y: number) => v.clone().setY(y);
				tabla(g, sube(a, ALTO), sube(b, ALTO), 0.35, 0.6);
				if (tiene('barandal_tablas')) tabla(g, sube(a, ALTO * 0.55), sube(b, ALTO * 0.55), 0.35, 0.6);
				if (tiene('balaustres')) {
					const largo = a.distanceTo(b);
					const pasos = Math.floor(largo / 0.45);
					for (let i = 1; i < pasos; i++) {
						const p = a.clone().lerp(b, i / pasos);
						caja(g, 0.18, ALTO - 0.2, 0.18, MADERA, p.x, ALTO / 2, p.z);
					}
				}
			}
		}

		// Four posts and a gable roof that overhangs the deck.
		if (tiene('techo')) {
			const POSTE = 9;
			for (const [a] of bordes) caja(g, 0.5, POSTE, 0.5, MADERA_OSCURA, a.x * 0.96, POSTE / 2, a.z * 0.96);
			const vuelo = 1.6;
			const media = LADO / 2 + vuelo;
			const cumbre = POSTE + 4;
			for (const s of [-1, 1]) {
				const faldon = new THREE.Mesh(new THREE.BoxGeometry(LADO + 2 * vuelo, 0.35, Math.hypot(media, cumbre - POSTE) + 0.3), toon('#C46F45', 0));
				faldon.position.set(0, (POSTE + cumbre) / 2, (s * media) / 2);
				faldon.rotation.x = s * Math.atan2(cumbre - POSTE, media);
				g.add(faldon);
			}
		}
		g.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.isMesh) m.userData.madera = (m.material as THREE.MeshToonMaterial).color.getHexString() !== new THREE.Color(ACERO).getHexString();
		});
		return g;
	},
};

// How a construction fails on screen. Each one is a pose at progress u (0..1) and time t, applied after resetPose.
export const FALLAS = {
	resbala: 'los clavos ceden: la casa baja por el tronco y se inclina',
	ladea: 'el piso gira sobre su único tornillo y se mece como columpio',
	raja: 'el tronco engorda y abre las vigas, que se agrietan',
	truena: 'las tablas junto al tronco se levantan y truenan',
	pudre: 'la madera se oscurece y se pudre',
} as const;
export type Falla = keyof typeof FALLAS;

const PODRIDA = new THREE.Color('#4A4F2A');
const ROJO = new THREE.Color('#D9534F');

// Remembers each piece's resting pose and colour the first time, and puts them back every frame.
export const resetPose = (g: THREE.Object3D) => {
	g.traverse((o) => {
		const m = o as THREE.Mesh;
		if (!o.userData.pose) o.userData.pose = {p: o.position.clone(), r: o.rotation.clone(), c: m.isMesh ? (m.material as THREE.MeshToonMaterial).color.clone() : null};
		o.position.copy(o.userData.pose.p);
		o.rotation.copy(o.userData.pose.r);
		if (m.isMesh && o.userData.pose.c) (m.material as THREE.MeshToonMaterial).color.copy(o.userData.pose.c);
	});
};

const tinte = (m: THREE.Mesh, color: THREE.Color, k: number) => (m.material as THREE.MeshToonMaterial).color.lerp(color, k);

export const aplicarFalla = (g: THREE.Object3D, falla: Falla, u: number, t: number) => {
	const e = u * u * (3 - 2 * u);
	if (falla === 'pudre') g.position.y -= e * 0.6;
	if (falla === 'resbala') {
		g.position.y -= e * 6;
		g.rotation.z += e * 0.22;
	}
	// Swings sideways (seen from the front, a tilt toward the camera would barely show).
	if (falla === 'ladea') {
		const a = Math.sin(t * 3.2) * 0.32 * Math.min(1, u * 3);
		g.rotation.z += a;
		g.position.y -= Math.abs(a) * 3;
	}
	g.traverse((o) => {
		const m = o as THREE.Mesh;
		if (!m.isMesh) return;
		if (falla === 'raja' && o.name === 'viga') {
			// The trunk swells and pushes the beam halves apart; they bend and redden where they split.
			o.position.x += o.userData.lado * e * 1.4;
			o.rotation.z += o.userData.lado * e * 0.22;
			o.position.y -= e * 0.4;
			tinte(m, ROJO, e * 0.9);
		}
		if (falla === 'truena' && o.name === 'tabla_cerca') {
			// Boards next to the trunk snap upward, one after another, with a small shake.
			o.position.y += e * 2.6;
			o.rotation.z -= o.userData.lado * e * 0.75;
			o.position.x += Math.sin(t * 40) * 0.05 * (u > 0 && u < 1 ? 1 : 0);
			tinte(m, ROJO, e * 0.9);
		}
		// Rot: wood goes dark olive, in blotches (alternate boards first), and the deck sags a little.
		if (falla === 'pudre' && o.userData.madera) tinte(m, PODRIDA, e * (o.id % 3 === 0 ? 0.95 : 0.75));
	});
};

export const CONSTRUCCIONES: Record<string, Construccion> = {casa_arbol: casaArbol};

export const catalogoConstrucciones = () =>
	Object.entries(CONSTRUCCIONES)
		.map(([id, c]) => `- construccion:${id}: ${c.about}. Partes: ${Object.entries(c.partes).map(([k, v]) => `${k} (${v})`).join('; ')}`)
		.join('\n');
