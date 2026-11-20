import * as THREE from 'three';

// Normals as if the surface had no small grooves. Generated meshes model every vent and seam; the ink pass would
// draw each one as a scribble. Positions are smoothed (Laplacian) only to compute normals, then thrown away, so the
// silhouette stays exact while slits, ribs and noise stop reading as edges. Big creases, like a box's corners,
// survive because a few smoothing passes cannot round something that wide.
export const suavizarNormales = (geometry: THREE.BufferGeometry, pasadas = 12, fuerza = 0.6) => {
	const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
	const n = pos.count;
	// Texture seams split vertices that share a position: join them by position so smoothing crosses seams.
	const clave = new Map<string, number>();
	const unico = new Int32Array(n);
	const base: number[] = [];
	for (let i = 0; i < n; i++) {
		const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
		let u = clave.get(k);
		if (u === undefined) {
			u = base.length / 3;
			clave.set(k, u);
			base.push(pos.getX(i), pos.getY(i), pos.getZ(i));
		}
		unico[i] = u;
	}
	const m = base.length / 3;
	const index = geometry.getIndex();
	const tri = index ? Array.from(index.array as ArrayLike<number>) : Array.from({length: n}, (_, i) => i);
	const vecinos: Set<number>[] = Array.from({length: m}, () => new Set());
	for (let t = 0; t < tri.length; t += 3) {
		const [a, b, c] = [unico[tri[t]], unico[tri[t + 1]], unico[tri[t + 2]]];
		vecinos[a].add(b).add(c);
		vecinos[b].add(a).add(c);
		vecinos[c].add(a).add(b);
	}
	let p = Float32Array.from(base);
	for (let it = 0; it < pasadas; it++) {
		const q = new Float32Array(p);
		for (let v = 0; v < m; v++) {
			const vs = vecinos[v];
			if (!vs.size) continue;
			let x = 0, y = 0, z = 0;
			vs.forEach((w) => {
				x += p[w * 3];
				y += p[w * 3 + 1];
				z += p[w * 3 + 2];
			});
			q[v * 3] += (x / vs.size - p[v * 3]) * fuerza;
			q[v * 3 + 1] += (y / vs.size - p[v * 3 + 1]) * fuerza;
			q[v * 3 + 2] += (z / vs.size - p[v * 3 + 2]) * fuerza;
		}
		p = q;
	}
	// Area-weighted normals on the smoothed surface, handed back to every original vertex.
	const nu = new Float32Array(m * 3);
	const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
	for (let t = 0; t < tri.length; t += 3) {
		const [a, b, c] = [unico[tri[t]], unico[tri[t + 1]], unico[tri[t + 2]]];
		A.fromArray(p, a * 3);
		B.fromArray(p, b * 3);
		C.fromArray(p, c * 3);
		N.subVectors(C, B).cross(A.clone().sub(B));
		for (const v of [a, b, c]) {
			nu[v * 3] += N.x;
			nu[v * 3 + 1] += N.y;
			nu[v * 3 + 2] += N.z;
		}
	}
	const normal = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		N.fromArray(nu, unico[i] * 3).normalize();
		normal[i * 3] = N.x;
		normal[i * 3 + 1] = N.y;
		normal[i * 3 + 2] = N.z;
	}
	geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
	return geometry;
};
