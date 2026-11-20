// Downloads the Kenney packs the ink-style test uses and prints each model's size, to place them by hand.
// usage: pnpm tinta:preparar [model ...]
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import {ensurePack} from '../lib/kenney';

const main = async () => {
	await ensurePack('muebles');
	const names = process.argv.slice(2);
	for (const m of names) {
		const o = new OBJLoader().parse(readFileSync(`public/kenney/muebles/${m}.obj`, 'utf8'));
		const b = new THREE.Box3().setFromObject(o);
		const s = b.getSize(new THREE.Vector3());
		console.log(m.padEnd(20), s.toArray().map((v) => v.toFixed(2)).join(' x '), ' min', b.min.toArray().map((v) => v.toFixed(2)).join(','));
	}
};
main();
