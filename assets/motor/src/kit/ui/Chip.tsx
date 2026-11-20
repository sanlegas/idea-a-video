import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Chip as ChipData} from '../../schema';
import {useSeek} from '../overlay/useSeek';

type Props = {chip: ChipData; time: number; length: number; y: number; light: boolean};

const CONDENSED = "'Barlow Condensed'";
const row = (y: number): React.CSSProperties => ({position: 'absolute', left: 0, right: 0, top: y, display: 'flex', flexDirection: 'column', alignItems: 'center'});

// Condensed caps run about 0.47em per character, so one line can be sized before it is rendered.
const fit = (text: string, max: number, min: number, width = 950) => Math.max(min, Math.min(max, Math.floor(width / (text.length * 0.47))));

const Block: React.FC<Props> = ({chip, time, length, y}) => {
	const size = fit(chip.punch, 124, 76);
	const root = useSeek<HTMLDivElement>((tl, el) => {
		const box = el.querySelector('.box');
		tl.fromTo(box, {xPercent: -135, skewX: -9}, {xPercent: 0, skewX: 0, duration: 0.46, ease: 'back.out(1.5)'}, 0);
		tl.fromTo(el.querySelector('.txt'), {xPercent: -10, opacity: 0}, {xPercent: 0, opacity: 1, duration: 0.3, ease: 'power3.out'}, 0.12);
		tl.to(box, {xPercent: 135, skewX: 9, duration: 0.3, ease: 'power3.in'}, Math.max(0.8, length - 0.3));
	}, time);
	return (
		<div ref={root} style={row(y)}>
			<div className="box" style={{maxWidth: 1010, background: '#2756ff', boxShadow: '0 16px 44px rgba(39,86,255,.42)', padding: '16px 34px 18px'}}>
				<div className="txt" style={{color: '#fff', fontFamily: CONDENSED, fontWeight: 800, fontSize: size, lineHeight: 0.98, letterSpacing: '0.01em', textAlign: 'center', textTransform: 'uppercase'}}>
					{chip.punch}
				</div>
			</div>
		</div>
	);
};

const Stack: React.FC<Props> = ({chip, time, length, y}) => {
	const size = fit(chip.punch, 116, 80);
	const root = useSeek<HTMLDivElement>((tl, el) => {
		const lead = el.querySelector('.lead');
		const punch = el.querySelector('.punch');
		tl.fromTo(punch, {clipPath: 'inset(0 100% 0 0)'}, {clipPath: 'inset(0 0% 0 0)', duration: 0.36, ease: 'power3.out'}, 0);
		tl.fromTo(lead, {clipPath: 'inset(0 0 0 100%)'}, {clipPath: 'inset(0 0 0 0%)', duration: 0.32, ease: 'power3.out'}, 0.16);
		const out = Math.max(0.8, length - 0.3);
		tl.to(lead, {clipPath: 'inset(0 100% 0 0)', duration: 0.22, ease: 'power3.in'}, out);
		tl.to(punch, {clipPath: 'inset(0 0 0 100%)', duration: 0.26, ease: 'power3.in'}, out + 0.04);
	}, time);
	return (
		<div ref={root} style={row(y)}>
			<div className="lead" style={{position: 'relative', zIndex: 1, marginBottom: -14, background: '#ffb400', color: '#101319', padding: '6px 28px 7px', fontFamily: CONDENSED, fontWeight: 700, fontSize: 54, letterSpacing: '0.05em', textTransform: 'uppercase'}}>
				{chip.lead}
			</div>
			<div className="punch" style={{background: '#101319', color: '#fff', padding: '12px 32px', fontFamily: CONDENSED, fontWeight: 800, fontSize: size, lineHeight: 1, textTransform: 'uppercase'}}>
				{chip.punch}
			</div>
		</div>
	);
};

const Stat: React.FC<Props> = ({chip, time, length, y, light}) => {
	const value = chip.value ?? chip.punch;
	const root = useSeek<HTMLDivElement>((tl, el) => {
		tl.fromTo(el.querySelectorAll('.digit'), {y: 70, opacity: 0, filter: 'blur(14px)'}, {y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.42, ease: 'power3.out', stagger: 0.07}, 0);
		tl.fromTo(el.querySelector('.unit'), {x: -24, opacity: 0}, {x: 0, opacity: 1, duration: 0.3, ease: 'power2.out'}, 0.3);
		tl.to(el, {y: -30, opacity: 0, duration: 0.24, ease: 'power2.in'}, Math.max(0.8, length - 0.24));
	}, time);
	const shadow = light ? 'none' : '0 6px 10px rgba(0,0,0,.45), 0 10px 44px rgba(0,0,0,.7)';
	return (
		<div ref={root} style={row(y - 40)}>
			<div style={{display: 'flex', alignItems: 'baseline', gap: 14, color: light ? '#10141c' : '#fff', fontFamily: CONDENSED, fontWeight: 800, fontSize: 230, lineHeight: 0.9, textShadow: shadow}}>
				{[...value].map((c, i) => (
					<span key={i} className="digit" style={{display: 'inline-block'}}>
						{c}
					</span>
				))}
				<span className="unit" style={{color: light ? '#2756ff' : '#ffd24a', fontWeight: 700, fontSize: 76, textTransform: 'uppercase', textShadow: shadow}}>
					{chip.unit}
				</span>
			</div>
		</div>
	);
};

const KINDS = {block: Block, stack: Stack, stat: Stat};

export const Chip: React.FC<{chip: ChipData; start: number; end: number; y?: number; light?: boolean}> = ({chip, start, end, y = 270, light = false}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	if (t < start || t > end) return null;
	const Body = KINDS[chip.kind];
	return <Body chip={chip} time={t - start} length={end - start} y={y} light={light} />;
};

export const Tag: React.FC<{x: number; y: number; children: React.ReactNode; color?: string; size?: number; opacity?: number}> = ({x, y, children, color = '#fff', size = 40, opacity = 1}) => (
	<div
		style={{
			position: 'absolute',
			left: x,
			top: y,
			opacity,
			padding: '8px 16px 9px',
			borderRadius: 10,
			background: 'rgba(14,18,27,.9)',
			color,
			fontFamily: 'JetBrains Mono',
			fontWeight: 600,
			fontSize: size,
			whiteSpace: 'nowrap',
		}}
	>
		{children}
	</div>
);
