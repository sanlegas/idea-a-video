import {evolvePath} from '@remotion/paths';
import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Barras, Linea} from '../plan';
import {C, Fondo, Fuente, numero, SERIE, Texto, useTramo} from './base';

// Round axis top: 1, 2 or 5 times a power of ten, just above the data.
const techo = (max: number) => {
	const p = 10 ** Math.floor(Math.log10(max || 1));
	return ([1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= max * 1.08) ?? 10 * p);
};

const decimalesDe = (vals: number[]) => (vals.some((v) => !Number.isInteger(v)) ? 1 : 0);

// Line that draws itself through the data; a live readout rides its tip and notes appear as it reaches them.
export const GraficaLinea: React.FC<{e: Linea}> = ({e}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const L = 130, R = 960, T = 640, B = 1360;
	const top = techo(Math.max(...e.puntos.map((p) => p.y)));
	const xs = e.puntos.map((_, i) => L + ((R - L) * i) / (e.puntos.length - 1));
	const ys = e.puntos.map((p) => B - ((B - T) * p.y) / top);
	const d = xs.map((x, i) => `${i ? 'L' : 'M'} ${x} ${ys[i]}`).join(' ');
	const seg = xs.slice(1).map((x, i) => Math.hypot(x - xs[i], ys[i + 1] - ys[i]));
	const total = seg.reduce((a, b) => a + b, 0);
	const acum = [0, ...seg.map((_, i) => seg.slice(0, i + 1).reduce((a, b) => a + b, 0) / total)];

	const ejes = useTramo(0.15, 0.6);
	const dibujo = useTramo(0.7, Math.max(1.6, e.dur * 0.72), Easing.inOut(Easing.quad));
	const {strokeDasharray, strokeDashoffset} = evolvePath(dibujo, d);

	// Tip of the line: which segment it is on and how far along.
	const fin = acum.findIndex((a, i) => i > 0 && dibujo <= a);
	const k = fin === -1 ? seg.length - 1 : fin - 1;
	const u = Math.min(1, (dibujo - acum[k]) / Math.max(1e-6, acum[k + 1] - acum[k]));
	const hx = xs[k] + (xs[k + 1] - xs[k]) * u;
	const hy = ys[k] + (ys[k + 1] - ys[k]) * u;
	const hv = e.puntos[k].y + (e.puntos[k + 1].y - e.puntos[k].y) * u;
	const dec = decimalesDe(e.puntos.map((p) => p.y));
	const lineas = [0.25, 0.5, 0.75, 1].map((f) => f * top);

	return (
		<Fondo acento={C.azul}>
			<div style={{position: 'absolute', left: 90, right: 90, top: 250}}>
				<Texto texto={e.titulo} size={78} align="left" />
				{e.unidad ? <div style={{fontSize: 38, fontWeight: 600, color: C.suave, marginTop: 18, opacity: ejes}}>{e.unidad}</div> : null}
			</div>
			<svg width="1080" height="1920" style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
				<defs>
					<linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor={C.azul} stopOpacity="0.32" />
						<stop offset="1" stopColor={C.azul} stopOpacity="0" />
					</linearGradient>
					<clipPath id="hasta">
						<rect x={0} y={0} width={hx} height={1920} />
					</clipPath>
				</defs>
				{lineas.map((v, i) => {
					const y = B - ((B - T) * v) / top;
					return (
						<g key={i} opacity={ejes}>
							<line x1={L} x2={R} y1={y} y2={y} stroke={C.papel2} strokeWidth={3} strokeDasharray="10 12" />
							<text x={L - 20} y={y + 12} textAnchor="end" fontSize={32} fontWeight={600} fill={C.suave}>{numero(v)}</text>
						</g>
					);
				})}
				<line x1={L} x2={L + (R - L) * ejes} y1={B} y2={B} stroke={C.tinta} strokeWidth={5} strokeLinecap="round" />
				{e.area !== false ? <path d={`${d} L ${R} ${B} L ${L} ${B} Z`} fill="url(#area)" clipPath="url(#hasta)" /> : null}
				<path d={d} fill="none" stroke={C.azul} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
				{e.puntos.map((p, i) => {
					const llega = dibujo >= acum[i] - 1e-3;
					const at = (0.7 + acum[i] * (Math.max(1.6, e.dur * 0.72) - 0.7));
					const s = llega ? spring({frame: frame - Math.round(at * fps), fps, config: {damping: 10, mass: 0.4}}) : 0;
					const ultimo = i === e.puntos.length - 1;
					return (
						<g key={i}>
							<circle cx={xs[i]} cy={ys[i]} r={(ultimo ? 22 : 15) * s} fill={C.papel} stroke={ultimo ? C.rojo : C.azul} strokeWidth={8} />
							<text x={xs[i]} y={B + 58} textAnchor="middle" fontSize={28} fontWeight={700} fill={C.tinta} opacity={ejes}>{p.x}</text>
							{p.nota && s > 0 ? (
								// Notes hang under their point: the live readout owns the space above the tip.
								<g opacity={s} transform={`translate(${Math.min(1080 - 30 - (p.nota.length * 19 + 50) / 2, Math.max(L + 80, xs[i]))} ${ys[i] + 50 + 20 * (1 - s)})`}>
									<rect x={-(p.nota.length * 19 + 50) / 2} y={0} width={p.nota.length * 19 + 50} height={64} rx={32} fill={C.tinta} />
									<text x={0} y={44} textAnchor="middle" fontSize={34} fontWeight={800} fill={C.papel}>{p.nota}</text>
								</g>
							) : null}
						</g>
					);
				})}
				{dibujo > 0.01 ? (
					<g transform={`translate(${Math.min(1080 - 140, Math.max(L + 120, hx))} ${hy - 50})`}>
						<rect x={-125} y={-58} width={250} height={84} rx={20} fill={C.rojo} />
						<text x={0} y={2} textAnchor="middle" fontSize={50} fontWeight={900} fill="#fff">{numero(hv, dec)}</text>
					</g>
				) : null}
			</svg>
			<Fuente texto={e.fuente} />
		</Fondo>
	);
};

// Horizontal bars grow one after another, each counting up to its value.
export const GraficaBarras: React.FC<{e: Barras}> = ({e}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const top = techo(Math.max(...e.barras.map((b) => b.valor)));
	const dec = decimalesDe(e.barras.map((b) => b.valor));
	// Rows share the band between the title and the source line.
	const fila = Math.min(200, 980 / e.barras.length);
	const alto = fila * 0.62;
	const ancho = 820;
	const paso = Math.min(0.45, (e.dur * 0.6) / e.barras.length);
	return (
		<Fondo acento={C.verde}>
			<div style={{position: 'absolute', left: 90, right: 90, top: 250}}>
				<Texto texto={e.titulo} size={78} align="left" />
				{e.unidad ? <div style={{fontSize: 38, fontWeight: 600, color: C.suave, marginTop: 18}}>{e.unidad}</div> : null}
			</div>
			<div style={{position: 'absolute', left: 90, top: 620, width: 900}}>
				{e.barras.map((b, i) => {
					const at = 0.5 + i * paso;
					const s = spring({frame: frame - Math.round(at * fps), fps, config: {damping: 18, mass: 0.8}});
					const crece = interpolate(frame / fps, [at, at + 1.1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
					const color = b.color ?? SERIE[i % SERIE.length];
					const w = Math.max(8, (ancho * b.valor) / top) * crece;
					return (
						<div key={i} style={{height: fila, opacity: Math.min(1, s * 1.4)}}>
							<div style={{fontSize: 36, fontWeight: 800, marginBottom: 8}}>{b.etiqueta}</div>
							<div style={{display: 'flex', alignItems: 'center', gap: 22}}>
								<div style={{width: w, height: alto * 0.6, background: color, borderRadius: 18, boxShadow: `0 8px 0 ${C.papel2}`}} />
								<div style={{fontSize: 48, fontWeight: 900}}>{numero(b.valor * crece, dec)}</div>
							</div>
						</div>
					);
				})}
			</div>
			<Fuente texto={e.fuente} />
		</Fondo>
	);
};
