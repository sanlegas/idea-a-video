import React, {useMemo} from 'react';
import {AbsoluteFill, getStaticFiles, Html5Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SectionLabels} from './kit/overlay/SectionLabels';
import {SwayHud} from './kit/overlay/SwayHud';
import {Captions} from './kit/ui/Captions';
import {Chip} from './kit/ui/Chip';
import {PropCards, propShows} from './kit/ui/PropCard';
import {makeCamera, Segment} from './kit/world/camera';
import {CityWorld, WorldPlan} from './kit/world/CityWorld';
import {stageFor, worldPaper} from './kit/world/stage';
import type {Film} from './schema';

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const ramp = (t: number, from: number, dur: number) => clamp01((t - from) / dur);

// The film file is the only thing that changes between videos; every value below derives from it.
const buildPlan = (film: Film): WorldPlan => {
	const {world, hero, storyboard: sb, timing} = film;
	const stage = stageFor({world, hero});
	const segments: Segment[] = [];
	sb.beats.forEach((b, i) => {
		const {start, end} = timing.beats[i];
		// Beats that repeat a shot are one continuous move, not a restart of it.
		const last = segments[segments.length - 1];
		if (last && last.shot === b.shot) last.end = end;
		else segments.push({start, end, shot: b.shot});
	});
	const grades = sb.beats.map((b, i) => ({time: timing.beats[i].start, grade: b.grade}));
	const span = (shot: string) => {
		const i = sb.beats.findIndex((b) => b.shot === shot);
		return i >= 0 ? timing.beats[i] : null;
	};
	// Beats in a row that use the same written toma are one window, so it plays through without restarting.
	const written = new Set((film.tomas ?? []).map((x) => x.id));
	const tomaWindows: {id: string; start: number; end: number}[] = [];
	sb.beats.forEach((b, i) => {
		if (!written.has(b.shot)) return;
		const last = tomaWindows[tomaWindows.length - 1];
		if (last && last.id === b.shot && Math.abs(last.end - timing.beats[i].start) < 0.05) last.end = timing.beats[i].end;
		else tomaWindows.push({id: b.shot, start: timing.beats[i].start, end: timing.beats[i].end});
	});
	const collapseIndex = sb.beats.findIndex((b) => b.collapse);
	const firstQuake = sb.beats.findIndex((b) => b.quake > 0);
	const quakeAt = (t: number) => {
		let q = 0;
		sb.beats.forEach((b, i) => {
			if (b.scene !== 'world') return;
			const {start, end} = timing.beats[i];
			q = Math.max(q, b.quake * Math.min(ramp(t, start, 1.4), clamp01((end + 0.9 - t) / 1.2)));
		});
		return q;
	};
	const diagram = span('diagram');
	const waves = span('cut_waves');
	const detail = span('cut_detail');
	const alwaysPaper = worldPaper(world);
	const paperAt = (t: number) => {
		if (alwaysPaper) return 1;
		if (!diagram) return 0;
		return Math.min(ramp(t, diagram.start - 0.2, 0.7), clamp01((diagram.end + 0.25 - t) / 0.7));
	};
	const swing = (t: number) => {
		if (!diagram) return 0;
		const age = t - diagram.start;
		return Math.sin(age * 3.6) * Math.exp(-Math.max(0, age) * 0.28) * paperAt(t);
	};
	const motion = world.diagram?.motion ?? 'none';
	const flexAt = (t: number) => (motion === 'sway' ? swing(t) * stage.height * 0.1 : 0);
	const bobAt = (t: number) => (motion === 'bob' ? swing(t) * stage.height * 0.12 : 0);
	const waveAt = (t: number) => (waves ? ramp(t, waves.start - 0.3, 1) * (detail ? 1 - 0.55 * ramp(t, detail.start + 2, 2) : 1) : 0);
	const pileAt = (t: number) => (detail ? ramp(t, detail.start + 0.3, 3.2) : 0);
	const depthAt = (t: number) => (detail ? ramp(t, detail.start + 0.3, 2.8) : 0);
	const pose = makeCamera(stage, segments);
	const tiltAt = (t: number) => (pose(t).pos.y > stage.extent * 0.36 && paperAt(t) < 0.5 ? 0.85 : 0.2);
	return {
		segments,
		grades,
		quakeAt,
		quakeStart: firstQuake >= 0 ? timing.beats[firstQuake].start : 1e6,
		collapseAt: collapseIndex >= 0 ? timing.beats[collapseIndex].start - 0.65 : null,
		paperAt,
		flexAt,
		bobAt,
		waveAt,
		pileAt,
		depthAt,
		tiltAt,
		pose,
		stage,
		tomaWindows,
	};
};

export const Video: React.FC<{film: Film}> = ({film}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const {storyboard, timing, world} = film;
	const {beats} = storyboard;
	const plan = useMemo(() => buildPlan(film), [film]);
	const files = getStaticFiles().map((f) => f.name);
	const counter = beats.find((b) => b.counter)?.counter ?? null;
	const paper = plan.paperAt(t);
	const section = plan.pose(t).pos.y < 0;
	const props = film.props ?? [];
	const shows = useMemo(() => propShows(beats, timing.beats), [beats, timing]);

	return (
		<AbsoluteFill style={{background: '#0b1224'}}>
			<CityWorld plan={plan} film={film} />
			{section && world.cutaway ? <SectionLabels plan={plan} world={world} counter={counter} /> : null}
			{paper > 0.02 && world.diagram ? <SwayHud plan={plan} world={world} /> : null}
			{props.length && shows.length ? <PropCards props={props} shows={shows} /> : null}
			{beats.map((b, i) =>
				b.chip ? <Chip key={i} chip={b.chip} start={timing.beats[i].start + 0.1} end={timing.beats[i].end - 0.1} y={b.scene === 'cutaway' ? 210 : 270} light={paper > 0.5} /> : null,
			)}
			{storyboard.captions && timing.words.length ? <Captions words={timing.words} /> : null}
			{files.includes('voice.wav') ? <Html5Audio src={staticFile('voice.wav')} /> : null}
			{files.includes('bed.wav') ? <Html5Audio src={staticFile('bed.wav')} /> : null}
		</AbsoluteFill>
	);
};
