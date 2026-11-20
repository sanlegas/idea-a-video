// Reusable sound effects, synthesized by code. Each entry is both catalog (hace, cuando, etiquetas) and generator (hacer).
// hacer(rnd) returns (t, u, dur) => sample, with t in seconds and u from 0 to 1. To add an effect, add one entry here.
const tau = Math.PI * 2;
const s = (f, t) => Math.sin(tau * f * t);
const noise = (rnd) => rnd() * 2 - 1;
// One-pole lowpass over noise; k near 0 is darker.
const dark = (rnd, k) => {
	let y = 0;
	return () => (y += (noise(rnd) - y) * k);
};
// Noise through a resonant band centred at f, with quality q.
const band = (rnd, q = 0.12) => {
	let lo = 0;
	let bp = 0;
	return (f) => {
		const c = Math.min(0.9, 2 * Math.sin((Math.PI * f) / 48000));
		lo += c * bp;
		bp += c * (noise(rnd) - lo - bp * q * 8);
		return bp;
	};
};
const ring = (fs, t, d) => fs.reduce((a, f, i) => a + s(f, t) * Math.exp(-t * d * (1 + i * 0.5)), 0) / fs.length;
const edges = (u, a = 0.05, b = 0.2) => Math.min(1, u / a) * Math.min(1, (1 - u) / b);

export const EFECTOS = {
	pop: {hace: 'Pop corto y limpio', cuando: 'algo aparece o se marca', etiquetas: ['general'], dur: 0.1, gain: 0.3, hacer: () => (t, u) => s(880, t) * (1 - u) ** 2},
	click: {hace: 'Clic seco', cuando: 'interruptor, botón, pieza pequeña', etiquetas: ['general'], dur: 0.05, gain: 0.5, hacer: (r) => (t, u) => (noise(r) * 0.6 + s(2400, t)) * (1 - u) ** 3},
	golpe_seco: {hace: 'Golpe grave y sordo', cuando: 'algo cae, choca o aterriza', etiquetas: ['general', 'impacto'], dur: 0.42, gain: 0.8, hacer: (r) => {
		const d = dark(r, 0.1);
		return (t) => s(62 * (1 + Math.exp(-t * 30)), t) * Math.exp(-t * 11) + d() * Math.exp(-t * 26);
	}},
	subida: {hace: 'Barrido ascendente', cuando: 'algo crece, sube o se multiplica', etiquetas: ['general'], dur: 0.55, gain: 0.25, hacer: () => {
		let p = 0;
		return (t, u) => ((p += (tau * (220 + 660 * u * u)) / 48000), Math.sin(p) * edges(u));
	}},
	bajada: {hace: 'Barrido descendente', cuando: 'algo baja, se vacía o se apaga', etiquetas: ['general'], dur: 0.55, gain: 0.25, hacer: () => {
		let p = 0;
		return (t, u) => ((p += (tau * (760 - 600 * u)) / 48000), Math.sin(p) * edges(u));
	}},
	exito: {hace: 'Arpegio alegre', cuando: 'cierre, logro, felicitación', etiquetas: ['general', 'cierre'], dur: 1.1, gain: 0.3, hacer: () => (t) => [523.25, 659.25, 783.99, 1046.5].reduce((a, f, i) => {
		const q = t - i * 0.11;
		return q < 0 ? a : a + (s(f, q) + 0.3 * s(f * 2, q)) * Math.exp(-q * 4.5);
	}, 0) / 2.2},
	zumbido_sensor: {hace: 'Pitidos electrónicos', cuando: 'sensor, computadora, señal', etiquetas: ['electronica'], dur: 0.5, gain: 0.2, hacer: () => (t) => (Math.floor(t * 14) % 2 ? 0 : s(1760, t))},
	chispazo: {hace: 'Descarga eléctrica', cuando: 'corto circuito, electricidad', etiquetas: ['electronica', 'impacto'], dur: 0.5, gain: 0.45, hacer: (r) => {
		const b = band(r, 0.05);
		return (t, u) => b(3200 + 1500 * Math.sin(t * 90)) * (r() > 0.45 ? 1 : 0.1) * (1 - u);
	}},
	click_metal: {hace: 'Clic metálico', cuando: 'palanca, válvula, pestillo, pieza metálica', etiquetas: ['metal', 'mecanica'], dur: 0.14, gain: 0.55, hacer: (r) => (t) => ring([2100, 3370, 5120], t, 34) + noise(r) * Math.exp(-t * 200) * 0.6},
	engrane_encaja: {hace: 'Clac de piezas que encajan', cuando: 'engrane o pieza dentada entra en su sitio', etiquetas: ['metal', 'mecanica', 'engrane'], dur: 0.28, gain: 0.7, hacer: (r) => (t) => (t < 0.09 ? 0 : ring([1340, 2210], t - 0.09, 24)) + ring([1800, 2900], t, 42) + noise(r) * Math.exp(-t * 90) * 0.4},
	giro_engranes: {hace: 'Tic-tac rápido de engranes girando', cuando: 'mecanismo girando', etiquetas: ['metal', 'mecanica', 'engrane', 'continuo'], dur: 2, gain: 0.3, hacer: (r) => {
		const b = band(r, 0.1);
		return (t, u) => (b(1900) * (0.3 + 0.7 * Math.exp(-((t * 22) % 1) * 7)) + s(90, t) * 0.25) * edges(u, 0.1, 0.25);
	}},
	tronido_dientes: {hace: 'Dientes metálicos que truenan', cuando: 'engranes chocan, se muerden o rompen', etiquetas: ['metal', 'mecanica', 'engrane', 'falla'], dur: 1, gain: 0.7, hacer: (r) => {
		const b = band(r, 0.04);
		return (t, u) => (b(1200 + r() * 1600) * (Math.exp(-((t * 19) % 1) * 5)) + ring([430, 690], (t * 19) % 1, 3) * 0.4) * edges(u, 0.02, 0.2);
	}},
	raspado_metal: {hace: 'Raspón de metal contra metal', cuando: 'dos piezas rozan sin encajar', etiquetas: ['metal', 'friccion', 'falla'], dur: 0.7, gain: 0.5, hacer: (r) => {
		const b = band(r, 0.03);
		return (t, u) => b(2600 + Math.sin(t * 70) * 900) * edges(u, 0.04, 0.3);
	}},
	golpe_metal: {hace: 'Golpe metálico con resonancia', cuando: 'pieza pesada de metal se monta o cae', etiquetas: ['metal', 'impacto'], dur: 0.7, gain: 0.55, hacer: (r) => (t) => ring([310, 742, 1188, 1763], t, 7) + noise(r) * Math.exp(-t * 90) * 0.5},
	motor_arranca: {hace: 'Marcha y motor que arranca', cuando: 'un motor enciende', etiquetas: ['motor'], dur: 1.5, gain: 0.5, hacer: (r) => {
		const d = dark(r, 0.2);
		return (t, u) => {
			const crank = t < 0.7;
			const f = crank ? 11 : 26 + 8 * Math.exp(-(t - 0.7) * 4);
			const beat = Math.exp(-((t * f) % 1) * 3.5);
			return (d() * 1.6 * beat + s(crank ? 70 : 92, t) * 0.5 * beat) * edges(u, 0.04, 0.25);
		};
	}},
	motor_ralenti: {hace: 'Motor estable', cuando: 'motor en marcha de fondo', etiquetas: ['motor', 'continuo'], dur: 3, gain: 0.32, hacer: (r) => {
		const d = dark(r, 0.16);
		return (t, u) => (d() * 1.4 * Math.exp(-((t * 25) % 1) * 3) + s(76, t) * 0.4) * edges(u, 0.2, 0.3);
	}},
	motor_forzado: {hace: 'Motor que sube de vueltas y se queda al límite', cuando: 'motor revolucionado o exigido', etiquetas: ['motor', 'falla'], dur: 2.4, gain: 0.34, hacer: (r) => {
		let p = 0;
		const d = dark(r, 0.3);
		return (t, u) => {
			const f = 110 + 240 * Math.min(1, u * 1.6) + Math.sin(t * 60) * 4;
			p += (tau * f) / 48000;
			return (((p / tau) % 1) * 2 - 1 + d() * 0.5) * edges(u, 0.1, 0.15);
		};
	}},
	motor_apaga: {hace: 'Motor que se ahoga y muere', cuando: 'motor se apaga o falla', etiquetas: ['motor', 'falla'], dur: 1.1, gain: 0.55, hacer: (r) => {
		const d = dark(r, 0.2);
		let ph = 0;
		return (t, u) => {
			ph += (24 * (1 - u) ** 1.4 + 1) / 48000;
			return (d() * 1.5 * Math.exp(-(ph % 1) * 4) + s(70 * (1 - u * 0.5), t) * 0.5 * Math.exp(-(ph % 1) * 4)) * (1 - u);
		};
	}},
	siseo_aire: {hace: 'Siseo de aire', cuando: 'aire que pasa, se escapa o ventila', etiquetas: ['aire'], dur: 0.9, gain: 0.3, hacer: (r) => {
		const b = band(r, 0.3);
		return (t, u) => b(5200) * edges(u, 0.2, 0.4);
	}},
	vacio: {hace: 'Succión ascendente de aire', cuando: 'vacío, algo jala aire', etiquetas: ['aire'], dur: 1, gain: 0.32, hacer: (r) => {
		const b = band(r, 0.08);
		return (t, u) => b(500 + 2000 * u) * edges(u, 0.2, 0.15);
	}},
	chorro_liquido: {hace: 'Líquido que corre', cuando: 'líquido corre o entra en un tubo', etiquetas: ['liquido', 'continuo'], dur: 1.1, gain: 0.34, hacer: (r) => {
		const b = band(r, 0.12);
		return (t, u) => b(1100 + Math.sin(t * 35) * 400 + r() * 300) * edges(u, 0.12, 0.3);
	}},
	fuga_liquido: {hace: 'Rocío de fuga a presión', cuando: 'manguera rota, líquido sale', etiquetas: ['liquido', 'falla'], dur: 1.3, gain: 0.4, hacer: (r) => {
		const b = band(r, 0.2);
		return (t, u) => b(3400 + r() * 1600) * edges(u, 0.02, 0.4);
	}},
	goteo: {hace: 'Gotas', cuando: 'gotas caen', etiquetas: ['liquido'], dur: 0.6, gain: 0.3, hacer: () => (t) => [0, 0.2, 0.42].reduce((a, q) => (t < q ? a : a + Math.sin(tau * (620 + 900 * (t - q)) * (t - q)) * Math.exp(-(t - q) * 32)), 0)},
	chirrido_freno: {hace: 'Chirrido agudo de freno', cuando: 'frenos rechinan o resbalan', etiquetas: ['friccion', 'auto'], dur: 1, gain: 0.2, hacer: () => (t, u) => (s(2860 + Math.sin(t * 40) * 45, t) + 0.5 * s(4120, t)) * edges(u, 0.06, 0.25)},
	patinada: {hace: 'Llanta que patina', cuando: 'rueda bloqueada, derrape', etiquetas: ['friccion', 'auto', 'continuo'], dur: 1.6, gain: 0.45, hacer: (r) => {
		const b = band(r, 0.03);
		return (t, u) => b(980 + Math.sin(t * 16) * 110) * edges(u, 0.04, 0.3);
	}},
	vibra_abs: {hace: 'Pulsos rápidos del ABS', cuando: 'vibración hidráulica, pulsos repetidos', etiquetas: ['friccion', 'auto', 'continuo'], dur: 2, gain: 0.55, hacer: (r) => {
		const d = dark(r, 0.25);
		return (t, u) => (s(82, t) + d() * 0.7) * Math.exp(-((t * 15) % 1) * 4.5) * edges(u, 0.05, 0.2);
	}},
	fuego: {hace: 'Crepitar de fuego', cuando: 'algo arde', etiquetas: ['fuego', 'continuo'], dur: 1.6, gain: 0.4, hacer: (r) => {
		const d = dark(r, 0.08);
		let c = 0;
		return (t, u) => {
			if (r() < 0.0012) c = 1;
			c *= 0.992;
			return (d() * 1.8 + noise(r) * c) * edges(u, 0.2, 0.3);
		};
	}},
	madera_cruje: {hace: 'Madera que cruje', cuando: 'madera se aprieta o se rompe', etiquetas: ['madera', 'friccion'], dur: 0.7, gain: 0.5, hacer: (r) => {
		const b = band(r, 0.06);
		return (t, u) => b(780) * Math.exp(-((t * 13 + Math.sin(t * 7)) % 1) * 5) * (1 - u);
	}},
	obturador: {hace: 'Disparo de cámara', cuando: 'se toma una foto', etiquetas: ['electronica', 'camara'], dur: 0.22, gain: 0.55, hacer: (r) => (t) => (t < 0.1 ? noise(r) * Math.exp(-t * 90) : noise(r) * Math.exp(-(t - 0.1) * 80)) + ring([1800], t, 45) * 0.5},
	foco_bip: {hace: 'Doble bip de enfoque', cuando: 'algo queda enfocado o ajustado', etiquetas: ['electronica', 'camara'], dur: 0.3, gain: 0.2, hacer: () => (t) => (t < 0.11 ? s(1320, t) : t > 0.16 ? s(1760, t) : 0)},
	datos: {hace: 'Ráfaga de datos digitales', cuando: 'información corre o se procesa', etiquetas: ['electronica', 'continuo'], dur: 1.6, gain: 0.18, hacer: (r) => {
		let f = 1000;
		let next = 0;
		return (t, u) => {
			if (t >= next) {
				f = 700 + r() * 2300;
				next = t + 0.03 + r() * 0.05;
			}
			return (s(f, t) > 0 ? 1 : -1) * edges(u, 0.05, 0.2);
		};
	}},
	fotones: {hace: 'Destellos finos de luz', cuando: 'luz cae, algo brilla', etiquetas: ['luz', 'continuo'], dur: 2, gain: 0.22, hacer: (r) => {
		let v = 0;
		let f = 3000;
		let start = 0;
		return (t, u) => {
			if (r() < 0.0009) {
				f = 2600 + r() * 3200;
				start = t;
				v = 1;
			}
			return s(f, t - start) * v * (v *= 0.9994) * edges(u, 0.2, 0.3);
		};
	}},
	bobina: {hace: 'Zumbido corto electromagnético', cuando: 'bobina, imán o motor pequeño se activa', etiquetas: ['electronica', 'motor'], dur: 0.6, gain: 0.3, hacer: () => (t, u) => (s(120, t) + 0.6 * s(240, t) + 0.3 * s(360, t)) * edges(u, 0.08, 0.3)},
	mosca: {hace: 'Zumbido de moscas', cuando: 'moscas o insectos vuelan', etiquetas: ['animal', 'continuo'], dur: 1.6, gain: 0.16, hacer: () => (t, u) => (s(205 + Math.sin(t * 19) * 26, t) + 0.6 * s(410 + Math.sin(t * 13) * 40, t)) * edges(u, 0.15, 0.3)},
	lluvia: {hace: 'Lluvia', cuando: 'llueve', etiquetas: ['clima', 'continuo'], dur: 2.5, gain: 0.3, hacer: (r) => {
		const b = band(r, 0.5);
		return (t, u) => (b(4300) + (r() < 0.002 ? noise(r) * 3 : 0)) * edges(u, 0.25, 0.4);
	}},
	martillo: {hace: 'Martillazo', cuando: 'construcción, golpe puntual', etiquetas: ['obra', 'impacto'], dur: 0.16, gain: 0.55, hacer: (r) => (t) => ring([1200, 2300], t, 30) + noise(r) * Math.exp(-t * 120)},
	whoosh: {hace: 'Soplido que pasa rápido', cuando: 'cambio de pantalla, algo cruza el cuadro', etiquetas: ['general', 'transicion'], dur: 0.45, gain: 0.5, hacer: (r) => {
		const b = band(r, 0.35);
		return (t, u) => b(350 + 2600 * Math.sin(Math.PI * u) ** 2) * Math.sin(Math.PI * u) ** 1.5;
	}},
	grieta: {hace: 'Grieta que se abre', cuando: 'muro o material se raja', etiquetas: ['obra', 'falla'], dur: 0.5, gain: 0.5, hacer: (r) => (t, u) => (r() < 0.05 ? noise(r) * 2 : 0) * (1 - u) + s(55, t) * Math.exp(-t * 7) * 0.5},
};

const seedOf = (text) => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rng = (seed) => {
	let x = seed || 1;
	return () => {
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		x >>>= 0;
		return x / 4294967296;
	};
};

// Writes one effect into a buffer through add(at, dur, fn, gain, pan).
export const sonarEfecto = (id, at, add, {dur, gain = 1, pan = 0} = {}) => {
	const e = EFECTOS[id];
	if (!e) throw new Error(`efecto desconocido: ${id}`);
	const length = dur ?? e.dur;
	add(at, length, e.hacer(rng(seedOf(`${id}:${at}`))), e.gain * gain, pan);
};

export const catalogoTexto = () => Object.entries(EFECTOS).map(([id, e]) => `${id}: ${e.hace}. Úsalo cuando ${e.cuando}. [${e.etiquetas.join(', ')}]`).join('\n');

const plain = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Instant of a chosen word: the voice's real clock when words are known, otherwise its share of the beat's text.
export const momentoDe = (texto, palabra, inicio, fin, words = []) => {
	const p = plain(palabra);
	const hit = words.find((w) => w.start >= inicio - 0.12 && w.start < fin && plain(w.word).startsWith(p));
	if (hit) return hit.start;
	const said = texto.split(/\s+/);
	const k = said.findIndex((w) => plain(w).startsWith(p));
	if (k < 0) return inicio;
	const total = said.reduce((a, w) => a + w.length + 1, 0);
	return inicio + ((fin - inicio) * said.slice(0, k).reduce((a, w) => a + w.length + 1, 0)) / total;
};
