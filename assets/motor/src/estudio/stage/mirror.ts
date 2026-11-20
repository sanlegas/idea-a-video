import * as THREE from 'three';

// The same material for the copy under the floor: it fades with depth, as a reflection on polished black does.
export const reflected = <T extends THREE.Material>(material: T, strength: number, falloff: number): T => {
	const m = material.clone() as T;
	m.onBeforeCompile = (shader) => {
		shader.vertexShader =
			'varying float vDepth;\n' +
			shader.vertexShader.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
				vec4 worldPoint = vec4(transformed, 1.0);
				#ifdef USE_INSTANCING
					worldPoint = instanceMatrix * worldPoint;
				#endif
				vDepth = -(modelMatrix * worldPoint).y;`,
			);
		shader.fragmentShader =
			'varying float vDepth;\n' +
			shader.fragmentShader.replace(
				'#include <dithering_fragment>',
				`#include <dithering_fragment>
				gl_FragColor.rgb *= ${strength.toFixed(3)} * exp(-max(vDepth, 0.0) * ${falloff.toFixed(3)});`,
			);
	};
	m.customProgramCacheKey = () => `mirror-${strength}-${falloff}`;
	return m;
};
