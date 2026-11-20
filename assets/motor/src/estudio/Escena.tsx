import React from 'react';
import {AbsoluteFill, Html5Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Film} from './film';
import {Stage} from './stage/Stage';
import {Karaoke} from './ui/Karaoke';

// One scene with its text and voice. Time inside is film time, so a scene renders the same alone or assembled.
export const Escena: React.FC<{film: Film; shotId: string}> = ({film, shotId}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const shot = film.shots.find((s) => s.id === shotId);
	if (!shot) throw new Error(`escena desconocida: ${shotId}`);
	const t = shot.start + frame / fps;
	return (
		<AbsoluteFill style={{background: '#000'}}>
			<Stage film={film} shot={shot} />
			<Karaoke film={film} t={t} />
			{film.audio ? <Html5Audio src={staticFile(film.audio)} /> : null}
		</AbsoluteFill>
	);
};
