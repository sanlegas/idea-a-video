import * as THREE from 'three';
import {aplanarTextura, type Aplanado} from './aplanar';

// Ink-on-paper look for plain 3D: flat toon colours, black lines where depth or surface direction jumps, and a paper wash over all of it.
// Objects on layer SIN_TINTA (light cones, pulses, glows) are drawn in colour but never get ink lines.
export const SIN_TINTA = 1;
// Objects on layer CONTORNO (and not on 0) get ink only on their silhouette: in the normal pass they show one flat
// direction, so slits, holes and inner shells of generated meshes never draw lines. Their toon shading is unchanged.
export const CONTORNO = 2;
export const soloContorno = (o: THREE.Object3D) => {
	o.traverse((c) => c.layers.set(CONTORNO));
	return o;
};

export type Papel = {fondo: THREE.Color; tinta: THREE.Color; grosor: number; manchas: number; grano: number};

export const PAPEL: Papel = {fondo: new THREE.Color('#F3EEE2'), tinta: new THREE.Color('#1F1E24'), grosor: 1.3, manchas: 0.11, grano: 0.05};

const vertex = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const fragment = `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 res;
uniform float near;
uniform float far;
uniform vec3 fondo;
uniform vec3 tinta;
uniform float grosor;
uniform float manchas;
uniform float grano;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

vec3 sRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float lin(float d){ return near * far / (far - d * (far - near)); }
float depthAt(vec2 uv){ return lin(texture2D(tDepth, uv).r); }
vec3 normalAt(vec2 uv){ return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }

void main(){
	// Lines wander a pixel or so, like a hand that is steady but not a ruler.
	vec2 wob = (vec2(fbm(vUv * 9.0), fbm(vUv * 9.0 + 7.3)) - 0.5) * 1.6 / res;
	vec2 uv = vUv + wob;
	vec2 px = grosor / res;

	float dc = depthAt(uv);
	float dEdge = 0.0;
	float nEdge = 0.0;
	vec3 nc = normalAt(uv);
	// Sobel-like cross: compare the centre with its four neighbours.
	vec2 offs[4];
	offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0); offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
	for (int i = 0; i < 4; i++){
		float d = depthAt(uv + offs[i]);
		dEdge += abs(d - dc) / max(dc, 1e-3);
		vec3 n = normalAt(uv + offs[i]);
		nEdge += 1.0 - dot(n, nc);
	}
	float ink = max(smoothstep(0.035, 0.07, dEdge), smoothstep(0.25, 0.5, nEdge));

	vec4 c = texture2D(tColor, vUv);
	float empty = step(0.99999, texture2D(tDepth, vUv).r);
	vec3 col = mix(c.rgb, fondo, empty * (1.0 - c.a));
	// Targets hold linear light; paper and ink are judged on the screen's sRGB values.
	col = sRGB(col);

	// Paper: slow watercolour blotches, then fine tooth.
	float blot = fbm(vUv * vec2(3.0, 5.3)) - 0.5;
	float tooth = hash(floor(vUv * res)) - 0.5;
	col *= 1.0 + blot * manchas * 2.0 + tooth * grano;
	col = mix(col, sRGB(tinta), ink * 0.92);
	gl_FragColor = vec4(col, 1.0);
}`;

// Colour pass with depth, normal pass, then one full-screen pass that inks and papers the picture.
export class Tinta {
	private color: THREE.WebGLRenderTarget;
	private normal: THREE.WebGLRenderTarget;
	private quad: THREE.Mesh;
	private post = new THREE.Scene();
	private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private normals = new THREE.MeshNormalMaterial();
	// View-space (0, 0, 1) packed as colour: the same direction the empty background reads as.
	private plano = new THREE.MeshBasicMaterial({color: new THREE.Color().setRGB(0.5, 0.5, 1, THREE.LinearSRGBColorSpace)});
	private material: THREE.ShaderMaterial;

	constructor(private gl: THREE.WebGLRenderer, width: number, height: number, papel: Papel = PAPEL) {
		const depth = new THREE.DepthTexture(width, height);
		depth.type = THREE.FloatType;
		this.color = new THREE.WebGLRenderTarget(width, height, {samples: 4, depthTexture: depth});
		this.normal = new THREE.WebGLRenderTarget(width, height);
		this.material = new THREE.ShaderMaterial({
			vertexShader: vertex,
			fragmentShader: fragment,
			depthTest: false,
			depthWrite: false,
			uniforms: {
				tColor: {value: this.color.texture},
				tDepth: {value: depth},
				tNormal: {value: this.normal.texture},
				res: {value: new THREE.Vector2(width, height)},
				near: {value: 1},
				far: {value: 1000},
				fondo: {value: papel.fondo},
				tinta: {value: papel.tinta},
				grosor: {value: papel.grosor},
				manchas: {value: papel.manchas},
				grano: {value: papel.grano},
			},
		});
		this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
		this.post.add(this.quad);
	}

	render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
		const {gl} = this;
		this.material.uniforms.near.value = camera.near;
		this.material.uniforms.far.value = camera.far;

		gl.setRenderTarget(this.color);
		gl.setClearColor(0x000000, 0);
		gl.clear();
		gl.render(scene, camera);

		// Normals only for inked objects; the background reads as one flat direction, so it never draws lines.
		const layers = camera.layers.mask;
		camera.layers.set(0);
		const background = scene.background;
		scene.background = null;
		scene.overrideMaterial = this.normals;
		gl.setRenderTarget(this.normal);
		gl.setClearColor(0x8080ff, 1);
		gl.clear();
		gl.render(scene, camera);
		// Silhouette-only objects on top, keeping the depth buffer so they are hidden where something covers them.
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		camera.layers.set(CONTORNO);
		scene.overrideMaterial = this.plano;
		gl.render(scene, camera);
		gl.autoClear = autoClear;
		scene.overrideMaterial = null;
		scene.background = background;
		camera.layers.mask = layers;

		gl.setRenderTarget(null);
		gl.render(this.post, this.ortho);
	}

	dispose() {
		this.color.dispose();
		this.normal.dispose();
		this.material.dispose();
	}
}

// Three flat tones, no gradients: lit, side and shade.
const ramp = (() => {
	const t = new THREE.DataTexture(new Uint8Array([168, 168, 168, 255, 214, 214, 214, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
	t.minFilter = THREE.NearestFilter;
	t.magFilter = THREE.NearestFilter;
	t.needsUpdate = true;
	return t;
})();

const CREMA = new THREE.Color('#F6EFDF');

// Toon material in a softened, slightly pastel version of the given colour.
export const toon = (color: THREE.ColorRepresentation, pastel = 0.18) => new THREE.MeshToonMaterial({color: new THREE.Color(color).lerp(CREMA, pastel), gradientMap: ramp});

// Swaps every material of a loaded model for its toon twin, keeping each part's colour and texture.
// Generated models (TRELLIS) carry their colour in a texture with a white base colour, so the map must survive.
// With `aplanado`, textures are reduced to a few flat pastel patches first (see aplanar.ts).
export const entintar = (object: THREE.Object3D, pastel = 0.18, aplanado?: Aplanado | false) => {
	object.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		const swap = (m: THREE.Material) => {
			const src = m as THREE.MeshStandardMaterial;
			const t = toon(src.color ?? '#cccccc', pastel);
			if (src.map) {
				t.map = aplanado ? aplanarTextura(src.map, aplanado) : src.map;
				// The texture already carries its pastel colours; a cream tint on top turns greys brown.
				t.color.set('#ffffff');
			}
			return t;
		};
		mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
	});
	return object;
};
