import * as THREE from 'three';

const vertex = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const target = (w: number, h: number) =>
	new THREE.WebGLRenderTarget(w, h, {type: THREE.HalfFloatType, depthBuffer: false, colorSpace: THREE.NoColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter});

export type Look = {bloom: number; tilt: number; saturation: number; contrast: number; lift: THREE.Color; grain: number};

// Bloom, miniature focus and the final grade: what turns clean polygons into a picture.
export class PostChain {
	private scene = new THREE.Scene();
	private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private mesh: THREE.Mesh;
	private bright: THREE.ShaderMaterial;
	private blur: THREE.ShaderMaterial;
	private final: THREE.ShaderMaterial;
	private levels: {a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget}[];
	private soft: {a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget};

	constructor(private gl: THREE.WebGLRenderer, width: number, height: number) {
		const common = {depthTest: false, depthWrite: false, vertexShader: vertex};
		this.bright = new THREE.ShaderMaterial({
			...common,
			uniforms: {tex: {value: null}, threshold: {value: 1}},
			fragmentShader: `varying vec2 vUv; uniform sampler2D tex; uniform float threshold;
			void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.35, l), 1.0); }`,
		});
		this.blur = new THREE.ShaderMaterial({
			...common,
			uniforms: {tex: {value: null}, dir: {value: new THREE.Vector2()}},
			fragmentShader: `varying vec2 vUv; uniform sampler2D tex; uniform vec2 dir;
			void main(){
				vec3 c = texture2D(tex, vUv).rgb * 0.227;
				c += (texture2D(tex, vUv + dir * 1.385).rgb + texture2D(tex, vUv - dir * 1.385).rgb) * 0.316;
				c += (texture2D(tex, vUv + dir * 3.231).rgb + texture2D(tex, vUv - dir * 3.231).rgb) * 0.07;
				gl_FragColor = vec4(c, 1.0);
			}`,
		});
		this.final = new THREE.ShaderMaterial({
			...common,
			uniforms: {
				tex: {value: null},
				b0: {value: null},
				b1: {value: null},
				b2: {value: null},
				soft: {value: null},
				uBloom: {value: 0.7},
				uTilt: {value: 0},
				uSat: {value: 1},
				uContrast: {value: 1},
				uLift: {value: new THREE.Color(0, 0, 0)},
				uGrain: {value: 0.012},
				uFrame: {value: 0},
			},
			fragmentShader: /* glsl */ `
			varying vec2 vUv; uniform sampler2D tex, b0, b1, b2, soft;
			uniform float uBloom, uTilt, uSat, uContrast, uGrain, uFrame; uniform vec3 uLift;
			float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.37) * 43758.5453); }
			void main(){
				vec3 c = texture2D(tex, vUv).rgb;
				float focus = smoothstep(0.17, 0.5, abs(vUv.y - 0.46));
				c = mix(c, texture2D(soft, vUv).rgb, focus * uTilt);
				c += (texture2D(b0, vUv).rgb * 0.55 + texture2D(b1, vUv).rgb * 0.6 + texture2D(b2, vUv).rgb * 0.75) * uBloom;
				c = c / (1.0 + max(c - 1.0, 0.0) * 0.5);
				float l = dot(c, vec3(0.3, 0.59, 0.11));
				c = mix(vec3(l), c, uSat);
				c = (c - 0.5) * uContrast + 0.5 + uLift * (1.0 - l);
				vec2 q = vUv - vec2(0.5, 0.48);
				c *= 1.0 - dot(q, q) * 0.62;
				c += (hash(vUv * vec2(1080.0, 1920.0)) - 0.5) * uGrain;
				gl_FragColor = vec4(c, 1.0);
			}`,
		});
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
		this.mesh.frustumCulled = false;
		this.scene.add(this.mesh);
		this.levels = [2, 4, 8].map((d) => ({a: target(Math.round(width / d), Math.round(height / d)), b: target(Math.round(width / d), Math.round(height / d))}));
		this.soft = {a: target(Math.round(width / 3), Math.round(height / 3)), b: target(Math.round(width / 3), Math.round(height / 3))};
	}

	private pass(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
		this.mesh.material = material;
		this.gl.setRenderTarget(to);
		this.gl.render(this.scene, this.camera);
	}

	private blurPair(source: THREE.Texture, pair: {a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget}, radius: number) {
		const u = this.blur.uniforms;
		u.tex.value = source;
		u.dir.value.set(radius / pair.a.width, 0);
		this.pass(this.blur, pair.a);
		u.tex.value = pair.a.texture;
		u.dir.value.set(0, radius / pair.a.height);
		this.pass(this.blur, pair.b);
	}

	render(input: THREE.Texture, frame: number, look: Look) {
		this.bright.uniforms.tex.value = input;
		this.pass(this.bright, this.levels[0].a);
		let source: THREE.Texture = this.levels[0].a.texture;
		this.levels.forEach((level) => {
			this.blurPair(source, level, 1.2);
			source = level.b.texture;
		});
		this.blurPair(input, this.soft, 1.6);
		const u = this.final.uniforms;
		u.tex.value = input;
		u.b0.value = this.levels[0].b.texture;
		u.b1.value = this.levels[1].b.texture;
		u.b2.value = this.levels[2].b.texture;
		u.soft.value = this.soft.b.texture;
		u.uBloom.value = look.bloom;
		u.uTilt.value = look.tilt;
		u.uSat.value = look.saturation;
		u.uContrast.value = look.contrast;
		u.uLift.value.copy(look.lift);
		u.uGrain.value = look.grain;
		u.uFrame.value = frame;
		this.pass(this.final, null);
	}
}
