import {loadFont} from '@remotion/fonts';
import React from 'react';
import {Composition, registerRoot, staticFile} from 'remotion';
import ejemplo from '../../guiones/storytelling/ejemplo.json';
import {FPS, HEIGHT, revisarPelicula, WIDTH, type Pelicula} from './formato';
import {Storytelling} from './Pelicula';

['500', '700', '800', '900'].forEach((weight) => loadFont({family: 'Figtree', url: staticFile(`estudio/fonts/figtree-latin-${weight}-normal.woff2`), weight}));
loadFont({family: 'Barlow Condensed', url: staticFile('fonts/BarlowCondensed-ExtraBold.woff2'), weight: '800'});

const Root: React.FC = () => (
	<Composition
		id="Storytelling"
		component={Storytelling}
		fps={FPS}
		width={WIDTH}
		height={HEIGHT}
		durationInFrames={30}
		defaultProps={{pelicula: ejemplo as Pelicula}}
		calculateMetadata={({props}) => {
			const problemas = revisarPelicula(props.pelicula);
			if (problemas.length) throw new Error(`película con problemas:\n${problemas.join('\n')}`);
			return {durationInFrames: Math.max(1, Math.round(props.pelicula.duracion * FPS))};
		}}
	/>
);

registerRoot(Root);
