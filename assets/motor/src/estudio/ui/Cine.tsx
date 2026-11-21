import React, {useMemo} from 'react';
import {OffthreadVideo, Sequence, staticFile, useVideoConfig} from 'remotion';
import {mulberry32, type Footage} from '../film';

// The film look (Film.look 'cine'), for scenes over real footage. The grade and the weave go on the pictures only, so the captions stay crisp;
// grain and vignette go over the pictures, under the captions.
export const cineGrade = (frame: number): React.CSSProperties => {
	const r = mulberry32(frame * 7919 + 13);
	const flicker = 1 + (r() - 0.5) * 0.018;
	const dx = (r() - 0.5) * 1.2;
	const dy = (r() - 0.5) * 1.2;
	return {filter: `contrast(1.07) saturate(1.06) brightness(${(0.97 * flicker).toFixed(4)})`, transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(1.004)`};
};

const GRAIN = 384;

// Film grain: one noise tile drawn once, moved to a new random place every frame.
const useGrain = () =>
	useMemo(() => {
		const c = document.createElement('canvas');
		c.width = c.height = GRAIN;
		const ctx = c.getContext('2d')!;
		const img = ctx.createImageData(GRAIN, GRAIN);
		const r = mulberry32(4242);
		for (let i = 0; i < GRAIN * GRAIN; i++) {
			const v = Math.round(128 + (r() + r() + r() - 1.5) * 90);
			img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
			img.data[i * 4 + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);
		return c.toDataURL('image/png');
	}, []);

export const CineOverlay: React.FC<{frame: number}> = ({frame}) => {
	const grain = useGrain();
	const r = mulberry32(frame * 104729 + 7);
	return (
		<>
			{/* Cool shadows, warm highlights: a soft split tone. */}
			<div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,60,90,0.16) 0%, rgba(0,0,0,0) 45%, rgba(90,50,20,0.10) 100%)', mixBlendMode: 'soft-light', pointerEvents: 'none'}} />
			<div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 78% 62% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none'}} />
			<div
				style={{
					position: 'absolute',
					inset: 0,
					backgroundImage: `url(${grain})`,
					backgroundSize: `${GRAIN}px ${GRAIN}px`,
					backgroundPosition: `${Math.floor(r() * GRAIN)}px ${Math.floor(r() * GRAIN)}px`,
					mixBlendMode: 'overlay',
					opacity: 0.16,
					pointerEvents: 'none',
				}}
			/>
		</>
	);
};

// A footage clip under a scene that starts at film second t0: it plays from its own first frame at footage.at.
export const Toma: React.FC<{footage: Footage; t0: number}> = ({footage, t0}) => {
	const {fps} = useVideoConfig();
	const rate = footage.rate ?? 1;
	const late = Math.round((footage.at - t0) * fps);
	const trim = Math.max(0, Math.round((t0 - footage.at) * rate * fps));
	return (
		<Sequence from={Math.max(0, late)} layout="none">
			<OffthreadVideo src={staticFile(footage.file)} trimBefore={trim} playbackRate={rate} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
		</Sequence>
	);
};
