import React from 'react';

type Props = {value: string; unit: string; x: number; y: number; opacity: number; scale?: number; tone: 'dark' | 'light'; glow?: string};

// Glass pill that sits on the thing it measures.
export const Counter: React.FC<Props> = ({value, unit, x, y, opacity, scale = 1, tone, glow = 'rgba(255,120,90,0.8)'}) => {
	if (opacity <= 0) return null;
	const light = tone === 'light';
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				transform: `translate(-50%, -50%) scale(${scale})`,
				opacity,
				display: 'flex',
				alignItems: 'baseline',
				gap: 16,
				padding: '20px 40px 24px',
				borderRadius: 34,
				background: light ? 'rgba(66,66,70,0.86)' : 'rgba(18,10,12,0.74)',
				border: '1.5px solid rgba(255,255,255,0.13)',
				boxShadow: '0 12px 38px rgba(0,0,0,0.34)',
				fontFamily: 'Figtree',
				whiteSpace: 'nowrap',
			}}
		>
			<span style={{fontSize: 100, lineHeight: '100px', fontWeight: 800, color: light ? '#ffffff' : '#fff1ea', fontVariantNumeric: 'tabular-nums', textShadow: light ? 'none' : `0 0 26px ${glow}`}}>{value}</span>
			<span style={{fontSize: 44, fontWeight: 700, color: light ? '#ffffff' : '#ffe6dc'}}>{unit}</span>
		</div>
	);
};
