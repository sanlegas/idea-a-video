// Idea: "Ahorras una moneda al día. En un año son 365." A picture repeated: quantity becomes something you can walk across.
escena({world: 'ambar', floor: true, bokeh: true}, ({kit, at, end, random}) => {
	const coins = kit.add(kit.imageSwarm('moneda', 365, {height: 0.8}));
	const rand = random(4);
	const slots = Array.from({length: 365}, (_, i) => ({
		x: (i % 7) * 0.9 - 2.7,
		z: -Math.floor(i / 7) * 0.9,
		delay: at('año') + (i / 365) * (at('365') - at('año')),
		tilt: (rand() - 0.5) * 0.2,
	}));

	kit.counter({from: 1, to: 365, start: at('año'), end: at('365'), unit: 'monedas', singular: 'moneda'});

	kit.camera.path([
		{time: 0, position: [1.2, 0.9, 5], look: [-0.6, 0.5, 0], fov: 46},
		{time: at('año'), position: [1.4, 1.2, 5.4], look: [-0.5, 0.5, 0], fov: 46},
		{time: at('365') + 0.3, position: [3, 7, 8], look: [0, 0, -18], fov: 58},
		{time: end, position: [3.2, 7.4, 8.4], look: [0, 0, -18], fov: 58, ease: 'linear'},
	]);

	return (t) => {
		coins.each((o, i) => {
			const s = slots[i];
			const pop = kit.ramp(t, s.delay, s.delay + 0.22);
			o.position.set(s.x, (1 - kit.ease.out(pop)) * 0.6, s.z);
			o.rotation.z = s.tilt;
			o.scale.setScalar(pop === 0 ? 0 : kit.ease.back(pop));
		});
	};
});
