import React from 'react';
import {AbsoluteFill, Html5Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Film} from './film';
import {Stage} from './stage/Stage';
import {cineGrade, CineOverlay, Toma} from './ui/Cine';
import {Karaoke} from './ui/Karaoke';

// One scene with its text and voice. Time inside is film time, so a scene renders the same alone or assembled.
// A clip for the montage has no text; the montage grades the film look itself, so only a preview with text gets it here.
export const Escena: React.FC<{film: Film; shotId: string}> = ({film, shotId}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const shot = film.shots.find((s) => s.id === shotId);
	if (!shot) throw new Error(`escena desconocida: ${shotId}`);
	const t = shot.start + frame / fps;
	const cine = film.look === 'cine' && film.pages.length > 0;
	return (
		<AbsoluteFill style={{background: '#000'}}>
			<AbsoluteFill style={cine ? cineGrade(frame) : undefined}>
				{shot.footage ? <Toma footage={shot.footage} t0={shot.start} /> : null}
				<Stage film={film} shot={shot} />
			</AbsoluteFill>
			{cine ? <CineOverlay frame={frame} /> : null}
			<Karaoke film={film} t={t} />
			{film.audio ? <Html5Audio src={staticFile(film.audio)} /> : null}
		</AbsoluteFill>
	);
};
