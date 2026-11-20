// Idea: "Una bombilla convierte casi toda su energía en calor. Solo una parte mínima se vuelve luz." One hero, light that shows the idea, a pause to look.
escena({world: 'ambar', floor: true, bokeh: true}, ({kit, at, end, random}) => {
	const bulb = kit.add(kit.image('bombilla', {height: 4.2}));
	bulb.position.set(0, 0.2, 0);

	const core = kit.add(kit.glow({color: '#ffd9a0', size: 4.5, intensity: 0}));
	core.position.set(0, 2.8, 0.3);

	const rand = random(9);
	const heat = kit.add(kit.dots(2600, {size: 0.11, color: '#ff6a20'}));
	const seeds = Array.from({length: 2600}, () => ({a: rand() * 6.28, speed: 0.6 + rand() * 1.8, born: rand() * 1.4, lift: rand()}));

	const ray = kit.add(kit.beam([0, 2.8, 0.5], [0, 7.5, 3], {color: '#fff2d0', width: 0.5, intensity: 0}));
	const share = kit.label('5 %', {at: [0, 5.2, 1.6], size: 56, color: '#fff2d0'});

	kit.camera.path([
		{time: 0, position: [0, 3.4, 10.5], look: [0, 3.1, 0], fov: 46},
		{time: at('calor'), position: [1.6, 3.2, 8.6], look: [0, 3.2, 0], fov: 46, ease: 'out'},
		{time: at('luz'), position: [-1.2, 3, 9.2], look: [0, 3.6, 0], fov: 50},
		{time: end, position: [-1.4, 3, 9.6], look: [0, 3.6, 0], fov: 50, ease: 'linear'},
	]);

	return (t) => {
		const on = kit.ease.out(kit.ramp(t, at('energía'), at('energía') + 0.5));
		core.intensity = on * (0.9 + Math.sin(t * 9) * 0.06);
		const hot = kit.ramp(t, at('calor') - 0.1, at('calor') + 0.3);
		heat.each((d, i) => {
			const s = seeds[i];
			const age = ((t * 0.5 + s.born) % 1.4) / 1.4;
			const r = 0.5 + age * 3.4 * s.speed;
			d.x = Math.cos(s.a) * r;
			d.z = Math.sin(s.a) * r;
			d.y = 2.6 + age * 2.2 * s.lift;
			d.alpha = hot * (1 - age) * 0.8;
		});
		const light = kit.ramp(t, at('luz') - 0.1, at('luz') + 0.3);
		ray.intensity = light * 1.8;
		share.opacity = light;
		const beat = 1 + Math.sin(t * 2.4) * 0.008;
		bulb.scale.setScalar(beat);
	};
});
