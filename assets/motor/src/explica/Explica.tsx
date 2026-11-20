import {clockWipe} from '@remotion/transitions/clock-wipe';
import {fade} from '@remotion/transitions/fade';
import {iris} from '@remotion/transitions/iris';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {linearTiming, springTiming, TransitionSeries, type TransitionPresentation, type TransitionPresentationComponentProps} from '@remotion/transitions';
import React from 'react';
import {AbsoluteFill, Easing, Html5Audio, staticFile} from 'remotion';
import {frames, HEIGHT, PASO, WIDTH, type Escena, type Plan, type Transicion} from './plan';
import {CierreView, CompararView, DatoView, PasosView, PortadaView} from './ui/bloques';
import {GraficaBarras, GraficaLinea} from './ui/graficas';

const Bloque: React.FC<{e: Escena}> = ({e}) => {
	switch (e.tipo) {
		case 'portada':
			return <PortadaView e={e} />;
		case 'dato':
			return <DatoView e={e} />;
		case 'linea':
			return <GraficaLinea e={e} />;
		case 'barras':
			return <GraficaBarras e={e} />;
		case 'pasos':
			return <PasosView e={e} />;
		case 'comparar':
			return <CompararView e={e} />;
		case 'cierre':
			return <CierreView e={e} />;
	}
};

// Fast sideways pan: both scenes travel together and smear along the way.
const Latigo: React.FC<TransitionPresentationComponentProps<{lado: number}>> = ({children, presentationDirection, presentationProgress: u, passedProps}) => {
	const x = presentationDirection === 'entering' ? (1 - u) * 100 * passedProps.lado : -u * 100 * passedProps.lado;
	return <AbsoluteFill style={{transform: `translateX(${x.toFixed(2)}%)`, filter: u > 0.02 && u < 0.98 ? `url(#explica-barrido${u > 0.2 && u < 0.8 ? 2 : 1})` : undefined}}>{children}</AbsoluteFill>;
};

// Punch-in: the camera lunges into the old scene, and the new one is already there when it lands. Scenes bring
// their own contents in, so the lunge has to show on the scene that leaves.
const Golpe: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({children, presentationDirection, presentationProgress: u}) => {
	// The lunge is over by the middle of the passage, where the cut falls.
	const w = Math.min(1, u * 2);
	if (presentationDirection === 'exiting') return <AbsoluteFill style={{transform: `scale(${1 + 0.4 * w * w})`, filter: w > 0.05 ? `blur(${(w * 12).toFixed(1)}px)` : undefined}}>{children}</AbsoluteFill>;
	const v = Math.max(0, (u - 0.5) / 0.5);
	return <AbsoluteFill style={{opacity: u < 0.5 ? 0 : 1, transform: `scale(${1 + 0.12 * (1 - v) ** 3})`}}>{children}</AbsoluteFill>;
};

// Flash: the old scene burns to white on the first third, the new one comes out of it.
const CORTE_DESTELLO = 0.34;
const Destello: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({children, presentationDirection, presentationProgress: u}) => {
	const entra = presentationDirection === 'entering';
	const blanco = entra ? (1 - (u - CORTE_DESTELLO) / (1 - CORTE_DESTELLO)) ** 2 : Math.min(1, u / CORTE_DESTELLO) ** 2;
	return (
		<AbsoluteFill style={{opacity: entra && u < CORTE_DESTELLO ? 0 : 1}}>
			{children}
			<AbsoluteFill style={{background: '#fff', opacity: Math.max(0, Math.min(1, blanco)) * 0.92}} />
		</AbsoluteFill>
	);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presentacion = (t: Transicion, i: number): TransitionPresentation<any> => {
	if (t === 'deslizar') return slide({direction: i % 2 ? 'from-right' : 'from-bottom'});
	if (t === 'barrido') return wipe({direction: i % 2 ? 'from-left' : 'from-top-right'});
	if (t === 'iris') return iris({width: WIDTH, height: HEIGHT});
	if (t === 'reloj') return clockWipe({width: WIDTH, height: HEIGHT});
	if (t === 'latigo') return {component: Latigo, props: {lado: i % 2 ? -1 : 1}};
	if (t === 'golpe') return {component: Golpe, props: {}};
	if (t === 'destello') return {component: Destello, props: {}};
	return fade();
};

// Scenes play in a row; each passage overlaps the end of the scene before it.
export const Explica: React.FC<{plan: Plan}> = ({plan}) => (
	<AbsoluteFill style={{background: '#F5F0E6'}}>
		{/* Sideways-only blur for the whip pan, in two strengths. */}
		<svg width="0" height="0" style={{position: 'absolute'}}>
			<filter id="explica-barrido1" x="-10%" y="0" width="120%" height="100%">
				<feGaussianBlur stdDeviation="20 0" />
			</filter>
			<filter id="explica-barrido2" x="-20%" y="0" width="140%" height="100%">
				<feGaussianBlur stdDeviation="55 0" />
			</filter>
		</svg>
		<TransitionSeries>
			{plan.escenas.flatMap((e, i) => {
				const t = e.entrada ?? 'corte';
				const out: React.ReactNode[] = [];
				if (i > 0 && t !== 'corte') {
					// A whip pan starts fast and brakes; the others run at their own pace.
					const timing = t === 'deslizar' ? springTiming({config: {damping: 200}, durationInFrames: frames(PASO[t])}) : linearTiming({durationInFrames: frames(PASO[t]), easing: t === 'latigo' ? Easing.inOut(Easing.cubic) : undefined});
					out.push(<TransitionSeries.Transition key={`t${i}`} presentation={presentacion(t, i)} timing={timing} />);
				}
				out.push(
					<TransitionSeries.Sequence key={`s${i}`} durationInFrames={frames(e.dur)}>
						<Bloque e={e} />
					</TransitionSeries.Sequence>,
				);
				return out;
			})}
		</TransitionSeries>
		{plan.voz ? <Html5Audio src={staticFile(plan.voz)} /> : null}
		{plan.audio ? <Html5Audio src={staticFile(plan.audio)} /> : null}
	</AbsoluteFill>
);
