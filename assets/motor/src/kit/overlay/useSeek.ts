import gsap from 'gsap';
import {useLayoutEffect, useRef} from 'react';

gsap.ticker.sleep();

// A paused GSAP timeline seeked to the film's time, so overlays stay frame-accurate in the render.
export const useSeek = <T extends HTMLElement>(build: (tl: gsap.core.Timeline, root: T) => void, time: number) => {
	const root = useRef<T>(null);
	const timeline = useRef<gsap.core.Timeline | null>(null);
	useLayoutEffect(() => {
		const tl = gsap.timeline({paused: true});
		build(tl, root.current as T);
		timeline.current = tl;
		return () => {
			tl.kill();
			timeline.current = null;
		};
		// The timeline is built once per mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	useLayoutEffect(() => {
		timeline.current?.seek(time, false);
	}, [time]);
	return root;
};
