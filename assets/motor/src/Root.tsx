import {loadFont} from '@remotion/fonts';
import React from 'react';
import {Composition, staticFile} from 'remotion';
import film from '../data/film.json';
import {Film} from './schema';
import {Video} from './Video';

const FPS = 30;

loadFont({family: 'Inter', url: staticFile('fonts/inter-latin-800-normal.woff2'), weight: '800'});
loadFont({family: 'Inter', url: staticFile('fonts/inter-latin-600-normal.woff2'), weight: '600'});
loadFont({family: 'Barlow Condensed', url: staticFile('fonts/BarlowCondensed-ExtraBold.woff2'), weight: '800'});
loadFont({family: 'Barlow Condensed', url: staticFile('fonts/BarlowCondensed-Bold.woff2'), weight: '700'});
loadFont({family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono-latin-600-normal.woff2'), weight: '600'});

export const Root: React.FC = () => (
	<Composition
		id="Pilot"
		component={Video}
		fps={FPS}
		width={1080}
		height={1920}
		durationInFrames={Math.ceil((film as unknown as Film).timing.duration * FPS)}
		defaultProps={{film: film as unknown as Film}}
		// The tomas step renders single frames of films it builds on the fly, so the length follows the film it is given.
		calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.ceil(props.film.timing.duration * FPS))})}
	/>
);
