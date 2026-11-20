import * as THREE from 'three';
import {toon} from './npr';

// Scenery templates. Each one is a small set with named places (slots) where objects can stand, a door actors walk in
// through and a wide view. A model only chooses names; positions live here, so nothing ends up floating or inside a wall.
// Units: 1 = 20 cm. Floors are at y = 0.5 (Kenney floor tiles are half a unit thick).

// compartido: several objects may stand here one after another (stages of something being built), swapped with
// 'aparece' and 'desaparece'.
export type Slot = {x: number; y: number; z: number; rot?: number; pared?: {eje: 'x' | 'z'; en: number}; compartido?: boolean; about: string};

export type Plantilla = {
	id: string;
	about: string;
	origen: THREE.Vector3;
	slots: Record<string, Slot>;
	puerta: THREE.Vector3;
	vista: {pos: THREE.Vector3; mira: THREE.Vector3};
	// oscuro: night backdrop, so captions in the normal tone turn light.
	oscuro?: boolean;
	kenney: string[];
	construir: (scene: THREE.Scene, kenney: (ref: string, color?: string) => THREE.Object3D) => void;
};

const TILE = 10;
const MENTA = '#A9D8C2';
const MADERA = '#D9A15E';

const caja = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color, 0));
	m.position.set(x, y + h / 2, z);
	return m;
};

// Places a Kenney model by the middle of its footprint, standing on y.
const poner = (scene: THREE.Scene, o: THREE.Object3D, x: number, y: number, z: number, rot = 0) => {
	o.position.set(x, y, z);
	o.rotation.y = rot;
	scene.add(o);
};

const sala: Plantilla = {
	id: 'sala',
	about: 'sala de una casa vista en corte desde arriba: pared del fondo con ventana, pared izquierda con puerta, sillón, librero, lámpara, mesita, mueble de tele y alfombra. Para mostrar lo que pasa dentro de una casa.',
	origen: new THREE.Vector3(0, 0, 0),
	slots: {
		pared_fondo: {x: -10, y: 8.5, z: -14, pared: {eje: 'z', en: -14.75}, about: 'alto en la pared del fondo, mirando al cuarto (cámaras, sensores, sirenas, paneles)'},
		pared_izquierda: {x: -14, y: 9.5, z: 2.5, rot: Math.PI / 2, pared: {eje: 'x', en: -14.75}, about: 'alto en la pared izquierda, junto a la puerta, mirando al cuarto'},
		mesa: {x: 8.6, y: 4.34, z: -12.8, about: 'sobre la mesita junto al sillón (aparatos pequeños: grabadora, módem, bocina)'},
		mueble_tv: {x: 11, y: 3.6, z: 6, rot: -Math.PI / 2, about: 'sobre el mueble bajo de la derecha, mirando al centro (tele, monitor, consola)'},
		piso_centro: {x: 2, y: 0.5, z: 2, about: 'en el centro del piso, sobre la alfombra'},
		piso_entrada: {x: -9, y: 0.5, z: 9, about: 'en el piso junto a la puerta'},
		piso_fondo: {x: -4, y: 0.5, z: -8, about: 'en el piso, al fondo, frente al librero'},
	},
	puerta: new THREE.Vector3(-22, 0.5, 10),
	vista: {pos: new THREE.Vector3(Math.sin(0.7) * 100, 90, Math.cos(0.7) * 100), mira: new THREE.Vector3(0, 2, 0)},
	kenney: ['muebles/floorFull', 'muebles/wall', 'muebles/wallWindow', 'muebles/wallDoorway', 'muebles/rugRound', 'muebles/loungeSofa', 'muebles/lampRoundFloor', 'muebles/pottedPlant', 'muebles/sideTable', 'muebles/bookcaseOpen', 'muebles/cabinetTelevision', 'muebles/chair'],
	construir: (scene, k) => {
		for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) poner(scene, k('muebles/floorFull', '#E9DCC4'), i * TILE, 0, j * TILE);
		poner(scene, k('muebles/wall', MENTA), -TILE, 0, -1.5 * TILE);
		poner(scene, k('muebles/wallWindow', MENTA), 0, 0, -1.5 * TILE);
		poner(scene, k('muebles/wall', MENTA), TILE, 0, -1.5 * TILE);
		poner(scene, k('muebles/wallDoorway', MENTA), -1.5 * TILE, 0, TILE, Math.PI / 2);
		poner(scene, k('muebles/wall', MENTA), -1.5 * TILE, 0, 0, Math.PI / 2);
		poner(scene, k('muebles/wall', MENTA), -1.5 * TILE, 0, -TILE, Math.PI / 2);
		poner(scene, k('muebles/rugRound'), 1, 0.5, 1);
		poner(scene, k('muebles/loungeSofa'), 1, 0.5, -11.6);
		poner(scene, k('muebles/lampRoundFloor'), -6.5, 0.5, -12.5);
		poner(scene, k('muebles/pottedPlant'), 12.5, 0.5, -12.5);
		poner(scene, k('muebles/sideTable'), 9.5, 0.5, -12.8);
		poner(scene, k('muebles/bookcaseOpen'), -13.4, 0.5, -6, Math.PI / 2);
		poner(scene, k('muebles/cabinetTelevision'), 11, 0.5, 6, -Math.PI / 2);
		poner(scene, k('muebles/chair'), -4, 0.5, 9, 0.6);
	},
};

// A closet with two wooden shelves, like the corner where a recorder, a monitor and a battery live.
const repisa: Plantilla = {
	id: 'repisa',
	about: 'nicho en la pared con dos repisas de madera, visto de frente. Para aparatos de un sistema: monitor arriba, grabadora y respaldo de energía abajo, panel en la pared.',
	origen: new THREE.Vector3(200, 0, 0),
	slots: {
		repisa_alta: {x: 0, y: 14.6, z: -1, about: 'al centro de la repisa de arriba (monitor, pantalla)'},
		repisa_baja_izquierda: {x: -4.5, y: 6.6, z: -1, about: 'repisa de abajo, a la izquierda'},
		repisa_baja_derecha: {x: 4.5, y: 6.6, z: -1, about: 'repisa de abajo, a la derecha'},
		pared_alta: {x: 0, y: 21, z: -5, pared: {eje: 'z', en: -5.5}, about: 'en la pared, arriba de las repisas (panel, teclado, centro de carga)'},
		piso: {x: 0, y: 0.5, z: 0, about: 'en el piso del nicho'},
	},
	puerta: new THREE.Vector3(40, 0.5, 18),
	vista: {pos: new THREE.Vector3(14, 30, 100), mira: new THREE.Vector3(0, 11, 0)},
	kenney: [],
	construir: (scene) => {
		scene.add(caja(26, 0.5, 14, '#E9DCC4', 0, 0, 1));
		scene.add(caja(26, 28, 1, MENTA, 0, 0, -6));
		scene.add(caja(1, 28, 12, '#97C9B2', -13, 0, 0));
		scene.add(caja(1, 28, 12, '#97C9B2', 13, 0, 0));
		scene.add(caja(25, 0.6, 9, MADERA, 0, 6, -1.5));
		scene.add(caja(25, 0.6, 9, MADERA, 0, 14, -1.5));
	},
};

// Plain paper floor for close-ups of one object.
const estudio: Plantilla = {
	id: 'estudio',
	about: 'fondo liso de papel con una base redonda. Para mostrar un objeto solo, de cerca, o explicar sus partes.',
	origen: new THREE.Vector3(400, 0, 0),
	slots: {centro: {x: 0, y: 0.6, z: 0, about: 'al centro de la base'}},
	puerta: new THREE.Vector3(30, 0.6, 0),
	vista: {pos: new THREE.Vector3(0, 16, 52), mira: new THREE.Vector3(0, 4, 0)},
	kenney: [],
	construir: (scene) => {
		const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.6, 64), toon('#E9DCC4', 0));
		base.position.y = 0.3;
		scene.add(base);
	},
};


// A back yard with one big tree, for anything built on or around a trunk (a treehouse, a swing, a bird box).
// The tree is drawn here rather than taken from Kenney: the story needs a tall, thick trunk at the centre.
const patio: Plantilla = {
	id: 'patio',
	about: 'patio con un árbol grande al centro (tronco alto y grueso, copa arriba), barda de block al fondo y pasto. Para cosas que se construyen en el árbol o a su alrededor, por etapas.',
	origen: new THREE.Vector3(600, 0, 0),
	slots: {
		plataforma: {x: 0, y: 14, z: 0, compartido: true, about: 'alrededor del tronco a unos 3 m de altura; aquí van las etapas de lo que se construye en el árbol (plataforma, barandal, techo…), una tras otra'},
		tronco_alto: {x: 0, y: 26, z: 0, about: 'alrededor del tronco, más arriba, cerca de la copa'},
		pie_del_arbol: {x: 0, y: 0.5, z: 0, compartido: true, about: 'en el piso, alrededor de la base del tronco'},
		piso_lado: {x: 7, y: 0.5, z: 9, about: 'en el pasto, a un lado del árbol (herramientas, materiales, una persona)'},
		piso_frente: {x: -9, y: 0.5, z: 11, about: 'en el pasto, al frente del árbol'},
	},
	puerta: new THREE.Vector3(-40, 0.5, 18),
	vista: {pos: new THREE.Vector3(38, 26, 100), mira: new THREE.Vector3(0, 18, 0)},
	kenney: [],
	construir: (scene) => {
		const corteza = toon('#8B6B4E', 0);
		const tronco = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.8, 34, 18), corteza);
		tronco.position.y = 17;
		scene.add(tronco);
		// Two branches leaving the trunk near the top, then the crown.
		for (const [ang, inc] of [[0.6, 0.55], [-2.4, 0.6]]) {
			const rama = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 9, 10), corteza);
			rama.position.set(Math.cos(ang) * 2.5, 31, Math.sin(ang) * 2.5);
			rama.rotation.set(Math.sin(ang) * inc, 0, -Math.cos(ang) * inc);
			scene.add(rama);
		}
		const hojas = toon('#6FBF5A', 0);
		for (const [x, y, z, r] of [[0, 38, 0, 8], [6, 35, 2, 6], [-6, 35, -1, 6], [2, 36, -6, 5.5], [-2, 35, 6, 5.5]]) {
			const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), hojas);
			copa.position.set(x, y, z);
			scene.add(copa);
		}
		scene.add(caja(70, 9, 1.2, '#E7DCC6', 0, 0, -22));
		const tierra = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.2, 24), toon('#A98463', 0));
		tierra.position.y = 0.1;
		scene.add(tierra);
	},
};

// The Earth seen from space, with room for satellites around and above it, and one place on its surface.
// It sits far from the others, past the end of the shared grass, against its own night-blue backdrop.
const orbita: Plantilla = {
	id: 'orbita',
	about: 'la Tierra vista desde el espacio, con satélites en órbita alrededor y arriba, sobre un fondo azul noche con estrellas. Para satélites, señales que bajan del espacio y aparatos en la superficie.',
	origen: new THREE.Vector3(1600, 0, 0),
	slots: {
		superficie: {x: 0, y: 7.9, z: 1, about: 'sobre la Tierra, arriba al centro (un celular, una antena, un receptor)'},
		sat_izquierda: {x: -10, y: 22, z: 0, about: 'un satélite en órbita, a la izquierda'},
		sat_derecha: {x: 10, y: 24, z: -2, about: 'un satélite en órbita, a la derecha'},
		sat_arriba: {x: -4, y: 34, z: -6, about: 'un satélite en órbita, arriba'},
		sat_lejos: {x: 6, y: 40, z: -14, about: 'un satélite en órbita, arriba y al fondo'},
	},
	puerta: new THREE.Vector3(-30, 7.9, 10),
	vista: {pos: new THREE.Vector3(0, 24, 110), mira: new THREE.Vector3(0, 21, 0)},
	oscuro: true,
	kenney: [],
	construir: (scene) => {
		const fondo = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), toon('#22305A', 0));
		fondo.position.set(0, 60, -130);
		scene.add(fondo);
		// Stars at fixed, pseudo-random places so every render is the same.
		const estrella = toon('#FFF4C8', 0);
		for (let i = 0; i < 90; i++) {
			const a = Math.sin(i * 12.9898) * 43758.5453;
			const b = Math.sin(i * 78.233) * 12543.8731;
			const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + (i % 3) * 0.15, 0), estrella);
			s.position.set((a - Math.floor(a) - 0.5) * 260, (b - Math.floor(b)) * 190 - 40, -120);
			scene.add(s);
		}
		// The Earth: ocean, a few flat green landmasses on its surface and a light orbit ring around it.
		const centro = new THREE.Vector3(0, -6, 0);
		const tierra = new THREE.Mesh(new THREE.SphereGeometry(14, 64, 48), toon('#4A90D9', 0));
		tierra.position.copy(centro);
		scene.add(tierra);
		const verde = toon('#6FBF5A', 0);
		for (const [lat, lon, r] of [[0.75, -0.5, 5], [0.25, 0.9, 4.2], [0.45, 2.4, 4.6], [-0.2, -1.6, 3.6], [1.15, 1.6, 3.2], [-0.5, 0.3, 3]]) {
			const dir = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
			const masa = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), verde);
			masa.scale.set(1, 0.18, 1);
			masa.position.copy(centro).addScaledVector(dir, 13.85);
			masa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
			scene.add(masa);
		}
		const anillo = new THREE.Mesh(new THREE.TorusGeometry(30, 0.12, 8, 160), toon('#F3EEE2', 0));
		anillo.position.copy(centro);
		anillo.rotation.set(Math.PI / 2 - 0.35, 0.2, 0);
		scene.add(anillo);
	},
};

// Night-blue backdrop with fixed stars, shared by the space sceneries.
const cielo = (scene: THREE.Scene, semilla = 0) => {
	const fondo = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), toon('#22305A', 0));
	fondo.position.set(0, 60, -130);
	scene.add(fondo);
	const estrella = toon('#FFF4C8', 0);
	for (let i = semilla; i < semilla + 90; i++) {
		const a = Math.sin(i * 12.9898) * 43758.5453;
		const b = Math.sin(i * 78.233) * 12543.8731;
		const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + (i % 3) * 0.15, 0), estrella);
		s.position.set((a - Math.floor(a) - 0.5) * 260, (b - Math.floor(b)) * 190 - 40, -120);
		scene.add(s);
	}
};

// A low stage where one object at a time is shown, with a presenter standing at the front left.
// The frame is narrow (vertical video), so both places sit close to the middle.
const tarima: Plantilla = {
	id: 'tarima',
	about: 'tarima redonda frente a una pared lila, con un presentador a la izquierda. Para mostrar, uno tras otro, los objetos de los que habla alguien.',
	origen: new THREE.Vector3(2000, 0, 0),
	slots: {
		centro: {x: 2.5, y: 1.1, z: -3, compartido: true, about: 'sobre la tarima; los objetos se turnan aquí, uno a la vez, con aparece y desaparece'},
		izquierda: {x: -4.6, y: 0.5, z: 6, about: 'en el piso, al frente a la izquierda de la tarima (la persona que presenta)'},
	},
	puerta: new THREE.Vector3(-30, 0.5, 10),
	vista: {pos: new THREE.Vector3(0, 18, 62), mira: new THREE.Vector3(0, 5.5, 0)},
	kenney: [],
	construir: (scene) => {
		scene.add(caja(120, 0.5, 60, '#E9DCC4', 0, 0, 0));
		const pared = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), toon('#C9B8E8', 0));
		pared.position.set(0, 40, -22);
		scene.add(pared);
		const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.6, 1.1, 64), toon('#F3EEE2', 0));
		base.position.set(2.5, 0.55, -3);
		scene.add(base);
		const borde = new THREE.Mesh(new THREE.TorusGeometry(8.3, 0.18, 8, 96), toon('#7C6BB0', 0));
		borde.position.set(2.5, 1.1, -3);
		borde.rotation.x = Math.PI / 2;
		scene.add(borde);
	},
};

// Deep space: one big body in the middle and room around it for things in orbit.
const cosmos: Plantilla = {
	id: 'cosmos',
	about: 'espacio profundo con estrellas sobre fondo azul noche, sin Tierra. Para un astro grande al centro (el Sol, la Luna, Marte), uno a la vez, y cosas que lo rodean.',
	origen: new THREE.Vector3(2400, 0, 0),
	slots: {
		centro: {x: 0, y: 7, z: 0, compartido: true, about: 'el astro grande al centro; se turnan aquí, uno a la vez, con aparece y desaparece'},
		alrededor_izquierda: {x: -8.5, y: 18, z: 4, about: 'flotando a la izquierda del astro, arriba'},
		alrededor_derecha: {x: 8.5, y: 9, z: 4, about: 'flotando a la derecha del astro, abajo'},
		alrededor_arriba: {x: 2, y: 23.5, z: 2, about: 'flotando sobre el astro'},
		alrededor_abajo: {x: -3, y: 2.5, z: 6, about: 'flotando bajo el astro, al frente'},
	},
	puerta: new THREE.Vector3(-30, 7, 10),
	vista: {pos: new THREE.Vector3(0, 16, 78), mira: new THREE.Vector3(0, 14, 0)},
	oscuro: true,
	kenney: [],
	construir: (scene) => cielo(scene, 200),
};

// A wall of six cubbies plus a spot on top: pieces of a set, each in its own hole, filled one by one.
const HUECO = {ancho: 9.6, alto: 9};
const tablero: Plantilla = {
	id: 'tablero',
	about: 'mueble de pared con seis huecos (tres filas de dos) y un lugar arriba al centro, como un rompecabezas: cada hueco guarda una pieza de un conjunto.',
	origen: new THREE.Vector3(2800, 0, 0),
	slots: {
		arriba_izquierda: {x: -5, y: 19.1, z: -0.5, about: 'hueco de arriba, a la izquierda'},
		arriba_derecha: {x: 5, y: 19.1, z: -0.5, about: 'hueco de arriba, a la derecha'},
		medio_izquierda: {x: -5, y: 10.1, z: -0.5, about: 'hueco de en medio, a la izquierda'},
		medio_derecha: {x: 5, y: 10.1, z: -0.5, about: 'hueco de en medio, a la derecha'},
		abajo_izquierda: {x: -5, y: 1.1, z: -0.5, about: 'hueco de abajo, a la izquierda'},
		abajo_derecha: {x: 5, y: 1.1, z: -0.5, about: 'hueco de abajo, a la derecha'},
		remate: {x: 0, y: 28.3, z: -0.5, about: 'encima del mueble, al centro: la pieza principal'},
	},
	puerta: new THREE.Vector3(-30, 0.5, 12),
	// Far enough that the whole wall and the piece on top fit under the caption, even at the closest drift.
	vista: {pos: new THREE.Vector3(0, 24, 125), mira: new THREE.Vector3(0, 18, 0)},
	kenney: [],
	construir: (scene) => {
		scene.add(caja(140, 0.5, 70, '#E9DCC4', 0, 0, 0));
		const pared = new THREE.Mesh(new THREE.PlaneGeometry(220, 140), toon('#A9D8C2', 0));
		pared.position.set(0, 50, -24);
		scene.add(pared);
		const ancho = HUECO.ancho * 2 + 1.2;
		const fondo = caja(ancho, HUECO.alto * 3 + 1.2, 0.6, '#F3E3C3', 0, 0.5, -5.4);
		scene.add(fondo);
		// Shelves, sides and the middle divider, in wood.
		for (let fila = 0; fila <= 3; fila++) scene.add(caja(ancho, 0.6, 10, MADERA, 0, 0.5 + fila * HUECO.alto, -0.5));
		for (const x of [-ancho / 2 + 0.3, 0, ancho / 2 - 0.3]) scene.add(caja(0.6, HUECO.alto * 3, 10, MADERA, x, 0.5, -0.5));
	},
};

export const ESCENARIOS: Record<string, Plantilla> = {sala, repisa, estudio, patio, orbita, tarima, cosmos, tablero};

// Text for a model: every scenery and its places.
export const catalogoEscenarios = () =>
	Object.values(ESCENARIOS)
		.map((e) => `- ${e.id}: ${e.about}\n${Object.entries(e.slots).map(([k, s]) => `    ${k}: ${s.about}`).join('\n')}`)
		.join('\n');
