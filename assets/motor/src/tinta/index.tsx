import {loadFont} from '@remotion/fonts';
import React from 'react';
import {Composition, registerRoot, staticFile} from 'remotion';
import {ModeloTinta, type ModeloProps} from './Modelo';
import {PeliculaTinta} from './Pelicula';
import type {Pelicula} from './formato';
import ejemplo from '../../guiones/tinta/ejemplo.json';

['500', '700', '800', '900'].forEach((weight) => loadFont({family: 'Figtree', url: staticFile(`estudio/fonts/figtree-latin-${weight}-normal.woff2`), weight}));

const Root: React.FC = () => (
	<>
		<Composition
			id="PeliculaTinta"
			component={PeliculaTinta}
			fps={30}
			width={1080}
			height={1920}
			durationInFrames={30}
			defaultProps={{pelicula: ejemplo as Pelicula}}
			calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.round(props.pelicula.duracion * 30))})}
		/>
		<Composition id="ModeloTinta" component={ModeloTinta} fps={30} width={1080} height={1920} durationInFrames={180} defaultProps={{archivo: 'tinta/modelos/prueba.glb', titulo: ''} as ModeloProps} />
	</>
);

registerRoot(Root);
