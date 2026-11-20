import * as THREE from 'three';

const vertex = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const target = (w: number, h: number) =>
	new THREE.WebGLRenderTarget(w, h, {type: THREE.HalfFloatType, depthBuffer: false, colorSpace: THREE.NoColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter});

// Glow, tone curve and display encoding. Colors stay linear and open-ended until this pass.
export class StudioPost {
	private scene = new THREE.Scene();
	private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private mesh: THREE.Mesh;
	private bright: THREE.ShaderMaterial;
	private blur: THREE.ShaderMaterial;
	private final: THREE.ShaderMaterial;
	private levels: {a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget}[];

	constructor(private gl: THREE.WebGLRenderer, width: number, height: number) {
		const common = {depthTest: false, depthWrite: false, vertexShader: vertex};
		this.bright = new THREE.ShaderMaterial({
			...common,
			uniforms: {tex: {value: null}, threshold: {value: 0.8}},
			fragmentShader: `varying vec2 vUv; uniform sampler2D tex; uniform float threshold;
			void main(){ vec3 c = min(texture2D(tex, vUv).rgb, vec3(16.0)); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.6, l), 1.0); }`,
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
			uniforms: {tex: {value: null}, b0: {value: null}, b1: {value: null}, b2: {value: null}, b3: {value: null}, uBloom: {value: 0.32}, uFrame: {value: 0}, uExposure: {value: 1}},
			fragmentShader: /* glsl */ `
			varying vec2 vUv; uniform sampler2D tex, b0, b1, b2, b3; uniform float uBloom, uFrame, uExposure;
			float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.37) * 43758.5453); }
			vec3 neutral(vec3 color){
				float x = min(color.r, min(color.g, color.b));
				float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
				color -= offset;
				float peak = max(color.r, max(color.g, color.b));
				float start = 0.76;
				if (peak < start) return color;
				float d = 1.0 - start;
				float top = 1.0 - d * d / (peak + d - start);
				color *= top / peak;
				float g = 1.0 - 1.0 / (0.15 * (peak - top) + 1.0);
				return mix(color, vec3(top), g);
			}
			vec3 encode(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
			void main(){
				vec3 c = texture2D(tex, vUv).rgb * uExposure;
				c += (texture2D(b0, vUv).rgb * 0.5 + texture2D(b1, vUv).rgb * 0.7 + texture2D(b2, vUv).rgb * 0.9 + texture2D(b3, vUv).rgb * 1.1) * uBloom;
				vec2 q = (vUv - vec2(0.5, 0.52)) * vec2(1.05, 0.92);
				c *= 1.0 - smoothstep(0.1, 0.62, length(q)) * 0.62;
				c = encode(neutral(c));
				c += (hash(vUv * vec2(1080.0, 1920.0)) - 0.5) * 0.008;
				gl_FragColor = vec4(c, 1.0);
			}`,
		});
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
		this.mesh.frustumCulled = false;
		this.scene.add(this.mesh);
		this.levels = [2, 4, 8, 16].map((d) => ({a: target(Math.round(width / d), Math.round(height / d)), b: target(Math.round(width / d), Math.round(height / d))}));
	}

	private pass(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
		this.mesh.material = material;
		this.gl.setRenderTarget(to);
		this.gl.render(this.scene, this.camera);
	}

	render(input: THREE.Texture, frame: number, exposure: number) {
		this.bright.uniforms.tex.value = input;
		this.pass(this.bright, this.levels[0].a);
		let source: THREE.Texture = this.levels[0].a.texture;
		const u = this.blur.uniforms;
		this.levels.forEach((level) => {
			u.tex.value = source;
			u.dir.value.set(1.4 / level.a.width, 0);
			this.pass(this.blur, level.a);
			u.tex.value = level.a.texture;
			u.dir.value.set(0, 1.4 / level.a.height);
			this.pass(this.blur, level.b);
			source = level.b.texture;
		});
		const f = this.final.uniforms;
		f.tex.value = input;
		f.b0.value = this.levels[0].b.texture;
		f.b1.value = this.levels[1].b.texture;
		f.b2.value = this.levels[2].b.texture;
		f.b3.value = this.levels[3].b.texture;
		f.uFrame.value = frame;
		f.uExposure.value = exposure;
		this.pass(this.final, null);
	}
}
