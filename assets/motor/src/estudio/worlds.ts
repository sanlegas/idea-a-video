type RGB = [number, number, number];

// Each topic lives in one hue. Values are linear light: the backdrop stays nearly black and only the accents glow.
export type World = {about: string; horizon: RGB; zenith: RGB; bokeh: RGB; floor: RGB; haze: RGB; rim: {halo: string; line: string; core: string; neck: string; fill: [string, string, string]}};

const tone = (r: number, g: number, b: number, k: number): RGB => [r * k, g * k, b * k];

const make = (about: string, hue: RGB, rim: World['rim']): World => ({
	about,
	horizon: tone(...hue, 0.2),
	zenith: tone(...hue, 0.012),
	bokeh: hue,
	floor: tone(...hue, 0.12),
	haze: tone(...hue, 0.03),
	rim,
});

export const WORLDS = {
	rojo: make('producto, azúcar, salud, peligro, sangre', [1, 0.05, 0.05], {halo: '#ff5238', line: '#ffa184', core: '#fff0e8', neck: '#ff2018', fill: ['#531a10', '#3a130c', '#240b07']}),
	ambar: make('fuego, sol, energía, dinero antiguo, desierto', [1, 0.34, 0.04], {halo: '#ff9a3a', line: '#ffc48a', core: '#fff3e0', neck: '#ff7a18', fill: ['#4d2c0c', '#361f09', '#221305']}),
	verde: make('naturaleza, biología, dinero, crecimiento', [0.06, 0.9, 0.3], {halo: '#3cff8a', line: '#9affc4', core: '#ecfff4', neck: '#18e06a', fill: ['#0f3d24', '#0b2c1a', '#071c11']}),
	azul: make('agua, frío, tecnología, cielo, ciencia', [0.08, 0.32, 1], {halo: '#4a8cff', line: '#9cc2ff', core: '#eef5ff', neck: '#2a6cff', fill: ['#10284f', '#0c1d3a', '#081325']}),
	violeta: make('mente, misterio, noche, tiempo', [0.45, 0.14, 1], {halo: '#a06bff', line: '#cdb0ff', core: '#f5efff', neck: '#8040ff', fill: ['#2c1650', '#1f103a', '#140a26']}),
	rosa: make('emoción, feria, cuerpo, relaciones', [1, 0.09, 0.45], {halo: '#ff5a9a', line: '#ffa6c8', core: '#fff0f6', neck: '#ff2a78', fill: ['#4f1630', '#3a1024', '#250a17']}),
	cian: make('datos, hielo, electricidad, precisión', [0.06, 0.62, 0.9], {halo: '#5fd0ff', line: '#a8e6ff', core: '#f0fbff', neck: '#2aa8ff', fill: ['#0e2c48', '#0a2036', '#061524']}),
} satisfies Record<string, World>;

export type WorldKey = keyof typeof WORLDS;
