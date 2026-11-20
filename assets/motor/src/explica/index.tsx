import {loadFont} from '@remotion/fonts';
import React from 'react';
import {Composition, registerRoot, staticFile} from 'remotion';
import ejemplo from '../../guiones/explica/ia.json';
import {Explica} from './Explica';
import {FPS, HEIGHT, inicios, revisar, WIDTH, type Plan} from './plan';

['500', '700', '800', '900'].forEach((weight) => loadFont({family: 'Figtree', url: staticFile(`estudio/fonts/figtree-latin-${weight}-normal.woff2`), weight}));

const Root: React.FC = () => (
	<Composition
		id="Explica"
		component={Explica}
		fps={FPS}
		width={WIDTH}
		height={HEIGHT}
		durationInFrames={30}
		defaultProps={{plan: ejemplo as Plan}}
		calculateMetadata={({props}) => {
			const problemas = revisar(props.plan);
			if (problemas.length) throw new Error(`plan con problemas:\n${problemas.join('\n')}`);
			return {durationInFrames: Math.max(1, Math.round(inicios(props.plan).duracion * FPS))};
		}}
	/>
);

registerRoot(Root);
