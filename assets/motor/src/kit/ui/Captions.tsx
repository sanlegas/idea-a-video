import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {WordTime} from '../../schema';

// One spoken word at a time, white with a black outline, low on the screen.
export const Captions: React.FC<{words: WordTime[]}> = ({words}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	let current = -1;
	for (let i = 0; i < words.length && words[i].start <= t; i++) current = i;
	if (current < 0 || t > words[current].end + 0.45) return null;
	const age = t - words[current].start;
	const scale = 0.82 + 0.18 * Math.min(1, age / 0.09);
	return (
		<div style={{position: 'absolute', left: 40, right: 40, top: 1290, textAlign: 'center', transform: `scale(${scale})`, color: '#fff', fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 112, lineHeight: 1, WebkitTextStroke: '14px #0d0f14', paintOrder: 'stroke fill', textShadow: '0 8px 18px rgba(0,0,0,.35)'}}>
			{words[current].word}
		</div>
	);
};
