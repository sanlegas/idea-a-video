import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Cierre, Comparar, Dato, Pasos, Portada} from '../plan';
import {C, Fondo, Fuente, Icon, numero, Texto, useEntra, useTramo} from './base';

// Opening card: small kicker, big title with one highlighted word, an icon that pops in.
export const PortadaView: React.FC<{e: Portada}> = ({e}) => {
	// The cover is the hook: everything is on screen within the first few frames, never an empty first frame.
	const kicker = useEntra(-0.15);
	const icono = useEntra(-0.12, 9);
	const frame = useCurrentFrame();
	return (
		<Fondo acento={C.rojo}>
			<div style={{position: 'absolute', left: 90, right: 90, top: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 50}}>
				{e.icono ? (
					<div style={{transform: `scale(${icono}) rotate(${(1 - icono) * -25 + Math.sin(frame / 18) * 3}deg)`}}>
						<Icon nombre={e.icono} size={260} color="#fff" fondo={C.rojo} />
					</div>
				) : null}
				{e.antetitulo ? (
					<div style={{fontSize: 40, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.rojo, opacity: kicker, transform: `translateY(${(1 - kicker) * 20}px)`}}>{e.antetitulo}</div>
				) : null}
				<Texto texto={e.titulo} clave={e.clave} at={-0.15} size={112} />
			</div>
		</Fondo>
	);
};

// One big number that counts up inside a ring that fills with it.
export const DatoView: React.FC<{e: Dato}> = ({e}) => {
	const cuenta = useTramo(0.3, Math.min(e.dur * 0.6, 2.2), Easing.out(Easing.cubic));
	const aro = useEntra(0.1, 16);
	const r = 300;
	const largo = 2 * Math.PI * r;
	return (
		<Fondo acento={C.azul}>
			<svg width="1080" height="1920" style={{position: 'absolute', inset: 0}}>
				<circle cx={540} cy={820} r={r} fill="none" stroke={C.papel2} strokeWidth={34} />
				<circle cx={540} cy={820} r={r} fill="none" stroke={C.azul} strokeWidth={34} strokeLinecap="round" strokeDasharray={largo} strokeDashoffset={largo * (1 - cuenta)} transform="rotate(-90 540 820)" opacity={aro} />
			</svg>
			<div style={{position: 'absolute', left: 0, right: 0, top: 820 - 110, textAlign: 'center', fontSize: 190, fontWeight: 900, letterSpacing: '-0.04em', transform: `scale(${0.7 + 0.3 * aro})`}}>
				{e.prefijo ?? ''}
				{numero(e.valor * cuenta, e.decimales ?? 0)}
				<span style={{fontSize: 110, color: C.azul}}>{e.sufijo ?? ''}</span>
			</div>
			{e.icono ? (
				<div style={{position: 'absolute', left: 540 - 70, top: 820 - r - 70, transform: `scale(${aro})`}}>
					<Icon nombre={e.icono} size={140} color="#fff" fondo={C.tinta} />
				</div>
			) : null}
			<div style={{position: 'absolute', left: 110, right: 110, top: 1220}}>
				<Texto texto={e.etiqueta} at={0.6} size={68} peso={800} />
			</div>
			<Fuente texto={e.fuente} />
		</Fondo>
	);
};

// Short list: each row slides in from the left with its icon.
export const PasosView: React.FC<{e: Pasos}> = ({e}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const paso = Math.min(0.7, (e.dur * 0.65) / e.pasos.length);
	return (
		<Fondo acento={C.morado}>
			<div style={{position: 'absolute', left: 90, right: 90, top: 300}}>
				<Texto texto={e.titulo} size={84} align="left" />
			</div>
			<div style={{position: 'absolute', left: 90, right: 90, top: 640, display: 'flex', flexDirection: 'column', gap: 46}}>
				{e.pasos.map((p, i) => {
					const s = spring({frame: frame - Math.round((0.5 + i * paso) * fps), fps, config: {damping: 14, mass: 0.6}});
					return (
						<div key={i} style={{display: 'flex', alignItems: 'center', gap: 36, opacity: s, transform: `translateX(${(1 - s) * -160}px)`, background: '#fff', borderRadius: 36, padding: '28px 36px', boxShadow: `0 12px 0 ${C.papel2}`}}>
							<Icon nombre={p.icono} size={120} color="#fff" fondo={[C.azul, C.rojo, C.verde, C.morado, C.amarillo][i % 5]} />
							<div style={{fontSize: 52, fontWeight: 800, lineHeight: 1.15}}>{p.texto}</div>
						</div>
					);
				})}
			</div>
		</Fondo>
	);
};

// Before and after, stacked, with an arrow that draws between them.
export const CompararView: React.FC<{e: Comparar}> = ({e}) => {
	const a = useEntra(0.4);
	const flecha = useTramo(1.0, 1.6);
	const b = useEntra(1.5, 10);
	const tarjeta = (lado: Comparar['antes'], u: number, color: string, top: number) => (
		<div style={{position: 'absolute', left: 120, right: 120, top, height: 380, background: '#fff', borderRadius: 48, boxShadow: `0 16px 0 ${C.papel2}`, display: 'flex', alignItems: 'center', gap: 40, padding: '0 56px', opacity: u, transform: `scale(${0.8 + 0.2 * u})`}}>
			<Icon nombre={lado.icono} size={170} color="#fff" fondo={color} />
			<div>
				<div style={{fontSize: 42, fontWeight: 700, color: C.suave}}>{lado.etiqueta}</div>
				<div style={{fontSize: 110, fontWeight: 900, color, letterSpacing: '-0.03em'}}>{lado.valor}</div>
			</div>
		</div>
	);
	return (
		<Fondo acento={C.amarillo}>
			<div style={{position: 'absolute', left: 90, right: 90, top: 260}}>
				<Texto texto={e.titulo} size={80} />
			</div>
			{tarjeta(e.antes, a, C.suave, 560)}
			<svg width="1080" height="1920" style={{position: 'absolute', inset: 0}}>
				<path d="M540 960 V1090" stroke={C.tinta} strokeWidth={14} strokeLinecap="round" strokeDasharray={130} strokeDashoffset={130 * (1 - flecha)} />
				<path d="M496 1060 L540 1108 L584 1060" fill="none" stroke={C.tinta} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={flecha > 0.9 ? 1 : 0} />
			</svg>
			{tarjeta(e.despues, b, C.rojo, 1140)}
		</Fondo>
	);
};

// Closing line on dark paper, with the key word in yellow.
export const CierreView: React.FC<{e: Cierre}> = ({e}) => {
	const pie = useEntra(1.2);
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pulso = interpolate(Math.sin((frame / fps) * 2.2), [-1, 1], [0.96, 1.04]);
	return (
		<Fondo acento={C.amarillo}>
			<div style={{position: 'absolute', inset: 0, background: C.tinta}} />
			<div style={{position: 'absolute', left: 90, right: 90, top: 700, transform: `scale(${pulso})`}}>
				<Texto texto={e.frase} clave={e.clave} size={104} color={C.papel} at={0.2} />
			</div>
			{e.pie ? <div style={{position: 'absolute', left: 0, right: 0, bottom: 260, textAlign: 'center', fontSize: 40, fontWeight: 700, color: C.amarillo, opacity: pie}}>{e.pie}</div> : null}
		</Fondo>
	);
};
