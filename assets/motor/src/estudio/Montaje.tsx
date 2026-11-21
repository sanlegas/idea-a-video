import React from 'react';
import {AbsoluteFill, Html5Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {easeInOut3, HEIGHT, ramp, type Assembly, type AssemblyClip} from './film';
import {cineGrade, CineOverlay} from './ui/Cine';
import {Karaoke} from './ui/Karaoke';

// A swipe smears along its way while it is fast, as a real pan does; a fade pulls focus, so the old picture goes
// soft as the new one sharpens.
const motion = (clip: AssemblyClip, next: AssemblyClip | undefined, t: number): React.CSSProperties => {
	const style: React.CSSProperties = {};
	const filters: string[] = [];
	const rapido = (u: number) => u > 0.12 && u < 0.88;
	if (clip.enter && clip.enter.type !== 'corte') {
		const u = ramp(t, clip.enter.start, clip.enter.end);
		const p = easeInOut3(u);
		if (clip.enter.type === 'swipe') {
			style.transform = `translateY(${(1 - p) * HEIGHT}px)`;
			if (rapido(u)) filters.push('url(#montaje-barrido)');
		}
		if (clip.enter.type === 'fundido') {
			style.opacity = p;
			if (u < 1) filters.push(`blur(${((1 - p) * 16).toFixed(1)}px)`);
		}
	}
	if (next?.enter && next.enter.type !== 'corte') {
		const u = ramp(t, next.enter.start, next.enter.end);
		const p = easeInOut3(u);
		if (next.enter.type === 'swipe') {
			style.transform = `translateY(${-p * HEIGHT}px)`;
			if (rapido(u)) filters.push('url(#montaje-barrido)');
		}
		if (next.enter.type === 'fundido' && u > 0) filters.push(`blur(${(p * 12).toFixed(1)}px)`);
	}
	if (filters.length) style.filter = filters.join(' ');
	return style;
};

// Clips run under one narration; text stays put while the pictures change beneath it.
export const Montaje: React.FC<{assembly: Assembly}> = ({assembly}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const {clips, film} = assembly;
	return (
		<AbsoluteFill style={{background: '#000'}}>
			{/* Up-and-down-only blur for the swipe. */}
			<svg width="0" height="0" style={{position: 'absolute'}}>
				<filter id="montaje-barrido" x="0" y="-15%" width="100%" height="130%">
					<feGaussianBlur stdDeviation="0 46" />
				</filter>
			</svg>
			<AbsoluteFill style={film.look === 'cine' ? cineGrade(frame) : undefined}>
				{clips.map((clip, i) => (
					<Sequence key={clip.file} from={Math.round(clip.from * fps)} durationInFrames={Math.max(1, Math.round((clip.to - clip.from) * fps))} layout="none">
						<AbsoluteFill style={motion(clip, clips[i + 1], t)}>
							<OffthreadVideo src={staticFile(clip.file)} muted />
						</AbsoluteFill>
					</Sequence>
				))}
			</AbsoluteFill>
			{film.look === 'cine' ? <CineOverlay frame={frame} /> : null}
			<Karaoke film={film} t={t} />
			{film.audio ? <Html5Audio src={staticFile(film.audio)} /> : null}
		</AbsoluteFill>
	);
};
