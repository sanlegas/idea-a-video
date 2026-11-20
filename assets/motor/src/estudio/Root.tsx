import {loadFont} from '@remotion/fonts';
import React from 'react';
import {Composition, staticFile} from 'remotion';
import {Escena} from './Escena';
import {FPS, HEIGHT, WIDTH, type Assembly, type Film} from './film';
import {Montaje} from './Montaje';

['500', '700', '800', '900'].forEach((weight) => loadFont({family: 'Figtree', url: staticFile(`estudio/fonts/figtree-latin-${weight}-normal.woff2`), weight}));

const EMPTY: Film = {name: 'vacio', duration: 1, words: [], pages: [], assets: {}, shots: [{id: 's', code: "escena({world: 'azul'}, () => () => {});", start: 0, end: 1}], audio: null};

const NOTHING: Assembly = {film: EMPTY, clips: []};

export const Root: React.FC = () => (
	<>
	<Composition
		id="Escena"
		component={Escena}
		fps={FPS}
		width={WIDTH}
		height={HEIGHT}
		durationInFrames={30}
		defaultProps={{film: EMPTY, shotId: 's'}}
		calculateMetadata={({props}) => {
			const shot = props.film.shots.find((s) => s.id === props.shotId);
			return {durationInFrames: Math.max(1, Math.ceil(((shot?.end ?? 1) - (shot?.start ?? 0)) * FPS))};
		}}
	/>
	<Composition
		id="Montaje"
		component={Montaje}
		fps={FPS}
		width={WIDTH}
		height={HEIGHT}
		durationInFrames={30}
		defaultProps={{assembly: NOTHING}}
		calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.ceil(props.assembly.film.duration * FPS))})}
	/>
	</>
);
