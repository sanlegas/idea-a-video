import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import type {Icono} from '../plan';

export const C = {
	papel: '#F5F0E6',
	papel2: '#ECE4D4',
	tinta: '#1C1B29',
	suave: '#6E6A78',
	rojo: '#FF5A36',
	azul: '#2F6BFF',
	verde: '#14B87A',
	amarillo: '#FFC531',
	morado: '#8B5CF6',
};
export const SERIE = [C.azul, C.rojo, C.verde, C.amarillo, C.morado];
export const FONT = 'Figtree';

// Progress from 0 to 1 that springs in at second `at` of the scene.
export const useEntra = (at = 0, damping = 14) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return spring({frame: frame - Math.round(at * fps), fps, config: {damping, mass: 0.6}});
};

// Eased progress between two seconds of the scene.
export const useTramo = (from: number, to: number, ease = Easing.inOut(Easing.cubic)) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return interpolate(frame / fps, [from, to], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
};

// Paper background with soft drifting blobs and a dot grid, so flat scenes still breathe.
export const Fondo: React.FC<{acento?: string; children?: React.ReactNode}> = ({acento = C.azul, children}) => {
	const frame = useCurrentFrame();
	const drift = (k: number) => Math.sin(frame / 70 + k) * 40;
	return (
		<AbsoluteFill style={{background: C.papel, overflow: 'hidden', fontFamily: FONT, color: C.tinta}}>
			<div style={{position: 'absolute', width: 900, height: 900, borderRadius: '50%', left: -300 + drift(0), top: -250 + drift(1), background: acento, opacity: 0.08, filter: 'blur(40px)'}} />
			<div style={{position: 'absolute', width: 800, height: 800, borderRadius: '50%', right: -320 + drift(2), bottom: -200 + drift(3), background: C.amarillo, opacity: 0.12, filter: 'blur(50px)'}} />
			<svg width="100%" height="100%" style={{position: 'absolute', opacity: 0.35}}>
				<defs>
					<pattern id="puntos" width="54" height="54" patternUnits="userSpaceOnUse">
						<circle cx="2" cy="2" r="2" fill={C.papel2} />
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill="url(#puntos)" />
			</svg>
			{children}
		</AbsoluteFill>
	);
};

// Words land one after another, each with a small bounce.
export const Texto: React.FC<{texto: string; at?: number; paso?: number; clave?: string; size?: number; peso?: number; color?: string; align?: 'center' | 'left'; style?: React.CSSProperties}> = ({texto, at = 0, paso = 0.07, clave, size = 96, peso = 900, color = C.tinta, align = 'center', style}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const norm = (w: string) => w.toLowerCase().replace(/[^a-záéíóúñü0-9%]/gi, '');
	const claves = new Set((clave ?? '').split(/\s+/).map(norm).filter(Boolean));
	const words = texto.split(/\s+/);
	return (
		<div style={{fontSize: size, fontWeight: peso, lineHeight: 1.08, letterSpacing: '-0.02em', textAlign: align, color, ...style}}>
			{words.map((w, i) => {
				const s = spring({frame: frame - Math.round((at + i * paso) * fps), fps, config: {damping: 12, mass: 0.5}});
				const esClave = claves.has(norm(w));
				const marca = interpolate(frame / fps, [at + i * paso + 0.25, at + i * paso + 0.55], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
				return (
					<React.Fragment key={i}>
						<span style={{display: 'inline-block', position: 'relative', opacity: s, transform: `translateY(${(1 - s) * 40}px) scale(${0.85 + 0.15 * s})`}}>
							{esClave ? <span style={{position: 'absolute', left: -12, right: -12, top: '0.06em', bottom: '0.02em', background: C.amarillo, borderRadius: 14, transformOrigin: 'left', transform: `scaleX(${marca}) rotate(-1.5deg)`}} /> : null}
							<span style={{position: 'relative', color: esClave && marca > 0.5 ? C.tinta : undefined}}>{w}</span>
						</span>{' '}
					</React.Fragment>
				);
			})}
		</div>
	);
};

// Flat icons drawn on a 100×100 grid.
export const Icon: React.FC<{nombre: Icono; size?: number; color?: string; fondo?: string}> = ({nombre, size = 160, color = C.tinta, fondo}) => {
	const sw = 7;
	const common = {fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
	const body: Record<Icono, React.ReactNode> = {
		chat: (
			<>
				<path d="M18 26 h64 a8 8 0 0 1 8 8 v30 a8 8 0 0 1 -8 8 h-34 l-18 14 v-14 h-12 a8 8 0 0 1 -8 -8 v-30 a8 8 0 0 1 8 -8z" {...common} />
				<circle cx="34" cy="49" r="4.5" fill={color} />
				<circle cx="50" cy="49" r="4.5" fill={color} />
				<circle cx="66" cy="49" r="4.5" fill={color} />
			</>
		),
		persona: (
			<>
				<circle cx="50" cy="32" r="15" {...common} />
				<path d="M20 86 c2 -20 14 -30 30 -30 s28 10 30 30" {...common} />
			</>
		),
		chip: (
			<>
				<rect x="26" y="26" width="48" height="48" rx="8" {...common} />
				<rect x="40" y="40" width="20" height="20" rx="3" fill={color} />
				{[36, 50, 64].map((p) => (
					<React.Fragment key={p}>
						<path d={`M${p} 26 v-12 M${p} 74 v12 M26 ${p} h-12 M74 ${p} h12`} {...common} />
					</React.Fragment>
				))}
			</>
		),
		rayo: <path d="M56 10 L24 56 h24 l-6 34 l34 -48 h-24z" {...common} />,
		globo: (
			<>
				<circle cx="50" cy="50" r="36" {...common} />
				<path d="M14 50 h72 M50 14 c-18 20 -18 52 0 72 M50 14 c18 20 18 52 0 72" {...common} />
			</>
		),
		grafica: <path d="M16 84 h70 M24 70 l18 -20 l14 12 l26 -32 M68 30 h14 v14" {...common} />,
		check: <path d="M22 52 l18 18 l38 -40" {...common} strokeWidth={sw + 3} />,
		reloj: (
			<>
				<circle cx="50" cy="52" r="34" {...common} />
				<path d="M50 32 v20 l14 10" {...common} />
			</>
		),
		empresa: <path d="M18 86 h64 M26 86 v-56 h30 v56 M56 46 h18 v40 M36 42 h10 M36 56 h10 M36 70 h10" {...common} />,
		escuela: <path d="M10 42 l40 -20 l40 20 l-40 20z M26 50 v20 c8 8 40 8 48 0 v-20 M90 42 v22" {...common} />,
	};
	return (
		<svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible'}}>
			{fondo ? <circle cx="50" cy="50" r="50" fill={fondo} /> : null}
			<g transform={fondo ? 'translate(18 18) scale(0.64)' : undefined}>{body[nombre]}</g>
		</svg>
	);
};

export const Fuente: React.FC<{texto?: string}> = ({texto}) => {
	const u = useEntra(0.6);
	if (!texto) return null;
	return <div style={{position: 'absolute', left: 90, right: 90, bottom: 150, fontSize: 30, fontWeight: 500, color: C.suave, opacity: u}}>Fuente: {texto}</div>;
};

export const numero = (v: number, decimales = 0) => v.toLocaleString('es-MX', {minimumFractionDigits: decimales, maximumFractionDigits: decimales});
