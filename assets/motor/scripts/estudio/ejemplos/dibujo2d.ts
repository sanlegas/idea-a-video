// Idea: "Tu corazón late unas cien mil veces al día." No picture and no model: the hero is a flat 2D drawing painted with Canvas on a card that faces the camera, beating, with a pulse line that draws itself.
escena({world: 'rosa', floor: false, bokeh: true}, ({kit, at, end, THREE}) => {
	// A card painted once: Path2D shapes, flat fill, thick dark outline, one white highlight. Glow keeps the colours exact, like a vector drawing.
	const card = (w: number, h: number, paint: (c: CanvasRenderingContext2D, W: number, H: number) => void) => {
		const W = 1024;
		const H = Math.round((W * h) / w);
		const tex = kit.texture(W, H, (c) => paint(c, W, H));
		return kit.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), kit.material('glow', '#ffffff', {map: tex, intensity: 1, opacity: 0.99})));
	};
	const heart = card(3.2, 3, (c, W, H) => {
		const p = new Path2D();
		p.moveTo(W * 0.5, H * 0.9);
		p.bezierCurveTo(W * 0.06, H * 0.6, W * 0.04, H * 0.2, W * 0.28, H * 0.13);
		p.bezierCurveTo(W * 0.4, H * 0.1, W * 0.48, H * 0.18, W * 0.5, H * 0.28);
		p.bezierCurveTo(W * 0.52, H * 0.18, W * 0.6, H * 0.1, W * 0.72, H * 0.13);
		p.bezierCurveTo(W * 0.96, H * 0.2, W * 0.94, H * 0.6, W * 0.5, H * 0.9);
		c.fillStyle = 'rgba(40, 0, 12, 0.35)';
		c.save();
		c.translate(W * 0.02, H * 0.03);
		c.fill(p);
		c.restore();
		c.fillStyle = '#ff3b5c';
		c.fill(p);
		c.lineWidth = W * 0.035;
		c.lineJoin = 'round';
		c.strokeStyle = '#3a0a14';
		c.stroke(p);
		c.fillStyle = 'rgba(255, 255, 255, 0.6)';
		c.beginPath();
		c.ellipse(W * 0.3, H * 0.3, W * 0.07, H * 0.04, -0.7, 0, Math.PI * 2);
		c.fill();
	});
	heart.position.set(0, 2.6, 0);

	// Pulse line under the heart: flat, then a spike on every beat.
	const pts: [number, number, number][] = [];
	for (let i = 0; i <= 60; i++) {
		const x = -2 + (i / 60) * 4;
		const k = i % 15;
		pts.push([x, 0.9 + (k === 7 ? 0.55 : k === 8 ? -0.3 : 0), 0.2]);
	}
	const pulse = kit.add(kit.line(pts, {color: '#ffffff', width: 0.05, intensity: 1.4}));
	const halo = kit.add(kit.glow({color: '#ff7a90', size: 3.4, intensity: 0}));
	halo.position.set(0, 2.6, -0.2);
	const count = kit.counter({from: 0, to: 100000, start: at('cien'), end: end - 0.3, unit: 'latidos', at: [0, 0.35, 0.4]});

	kit.camera.path([
		{time: 0, position: [0, 2.2, 8.2], look: [0, 2, 0], fov: 50},
		{time: end, position: [0, 2.1, 7.4], look: [0, 1.9, 0], fov: 50, ease: 'linear'},
	]);

	return (t) => {
		const beat = Math.pow(Math.max(0, Math.sin(t * 7.5)), 8);
		heart.scale.setScalar(1 + beat * 0.08);
		heart.rotation.z = Math.sin(t * 1.3) * 0.04;
		halo.intensity = 0.3 + beat * 0.8;
		pulse.draw(kit.ease.out(kit.ramp(t, at('late') - 0.1, at('late') + 1.2)));
		count.opacity = kit.ramp(t, at('cien') - 0.2, at('cien'));
	};
});
