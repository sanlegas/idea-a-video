import * as THREE from 'three';
import type {World} from '../worlds';

const DOWN_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Polished black floor. Anything above it is reflected on its own, so a scene never has to think about it.
export class MirrorFloor {
	private target: THREE.WebGLRenderTarget;
	private virtual = new THREE.PerspectiveCamera();
	private material: THREE.ShaderMaterial;
	readonly mesh: THREE.Mesh;

	constructor(world: World, width: number, height: number) {
		const depthTexture = new THREE.DepthTexture(Math.round(width / 2), Math.round(height / 2), THREE.UnsignedIntType);
		this.target = new THREE.WebGLRenderTarget(Math.round(width / 2), Math.round(height / 2), {type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace, depthBuffer: true, depthTexture});
		this.material = new THREE.ShaderMaterial({
			uniforms: {
				tReflect: {value: this.target.texture},
				tDepth: {value: depthTexture},
				uMatrix: {value: new THREE.Matrix4()},
				uView: {value: new THREE.Matrix4()},
				uForward: {value: new THREE.Vector3()},
				uVirtual: {value: new THREE.Vector3()},
				uNear: {value: 0.25},
				uFar: {value: 2000},
				uFloor: {value: new THREE.Color(...world.floor)},
				uHaze: {value: new THREE.Color(...world.haze)},
			},
			vertexShader: `uniform mat4 uMatrix, uView; varying vec3 vW; varying vec4 vProj; varying float vDepth;
			void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vProj = uMatrix * w; vDepth = -(uView * w).z; gl_Position = projectionMatrix * viewMatrix * w; }`,
			fragmentShader: /* glsl */ `
			varying vec3 vW; varying vec4 vProj; varying float vDepth;
			uniform sampler2D tReflect, tDepth; uniform vec3 uFloor, uHaze, uForward, uVirtual; uniform float uNear, uFar;
			float distanceAt(vec2 uv){ float ndc = texture2D(tDepth, uv).r * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - ndc * (uFar - uNear)); }
			void main(){
				vec3 v = normalize(cameraPosition - vW);
				vec2 uv = vProj.xy / vProj.w;
				vec3 ray = normalize(vW - uVirtual);
				float gap = max(0.0, distanceAt(uv) - vDepth);
				float rise = gap * ray.y / max(0.05, dot(ray, uForward));
				float spread = 0.0007 + 0.009 * clamp(rise * 0.3, 0.0, 1.0);
				vec3 c = vec3(0.0);
				for (int i = 0; i < 8; i++) {
					float a = float(i) * 2.39996;
					float r = sqrt((float(i) + 0.5) / 8.0);
					c += texture2D(tReflect, uv + vec2(cos(a), sin(a)) * r * spread * vec2(1.0, 0.5625)).rgb;
				}
				c /= 8.0;
				float grazing = pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
				float graze = pow(1.0 - clamp(v.y, 0.0, 1.0), 26.0);
				float haze = pow(1.0 - clamp(v.y, 0.0, 1.0), 5.0);
				vec3 mirror = min(c, vec3(1.6)) * exp(-rise * 1.15) * mix(0.3, 0.8, grazing);
				gl_FragColor = vec4(uFloor * graze + uHaze * haze + mirror, 1.0);
			}`,
		});
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), this.material);
		this.mesh.frustumCulled = false;
	}

	// Renders the world seen from below the floor, once per frame.
	capture(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]) {
		const c = this.virtual;
		const eye = camera.getWorldPosition(new THREE.Vector3());
		const forward = camera.getWorldDirection(new THREE.Vector3());
		const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
		c.position.set(eye.x, -eye.y, eye.z);
		c.up.set(up.x, -up.y, up.z);
		c.fov = camera.fov;
		c.aspect = camera.aspect;
		c.near = camera.near;
		c.far = camera.far;
		c.updateProjectionMatrix();
		c.lookAt(eye.x + forward.x, -eye.y - forward.y, eye.z + forward.z);
		c.updateMatrixWorld();
		const u = this.material.uniforms;
		u.uMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
		u.uView.value.copy(c.matrixWorldInverse);
		u.uForward.value.copy(c.getWorldDirection(new THREE.Vector3()));
		u.uVirtual.value.copy(c.position);
		u.uNear.value = c.near;
		u.uFar.value = c.far;
		const shown = hide.map((o) => o.visible);
		hide.forEach((o) => (o.visible = false));
		this.mesh.visible = false;
		gl.setRenderTarget(this.target);
		gl.clippingPlanes = [DOWN_CLIP];
		gl.clear();
		gl.render(scene, c);
		gl.clippingPlanes = [];
		this.mesh.visible = true;
		hide.forEach((o, i) => (o.visible = shown[i]));
	}
}
