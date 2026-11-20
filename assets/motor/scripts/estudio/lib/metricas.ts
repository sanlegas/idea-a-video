// What can be measured without judgement. A model can miss an empty frame; these numbers cannot.
import {execFileSync} from 'node:child_process';

const W = 108;
const H = 192;

const gray = (file: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], {maxBuffer: 1 << 24});

const share = (data: Buffer, from: number, to: number, test: (v: number) => boolean) => {
	let hit = 0;
	let total = 0;
	for (let y = Math.floor(from * H); y < Math.floor(to * H); y++) {
		for (let x = 0; x < W; x++) {
			total++;
			if (test(data[y * W + x])) hit++;
		}
	}
	return hit / total;
};

export type Measures = {issues: string[]; values: Record<string, number>};

export const measure = (files: string[]): Measures => {
	const frames = files.map(gray);
	const issues: string[] = [];
	const lit = frames.map((f) => share(f, 0.28, 1, (v) => v > 48));
	const burnt = frames.map((f) => share(f, 0, 1, (v) => v > 242));
	const behindText = frames.map((f) => share(f, 0.16, 0.27, (v) => v > 62));
	frames.forEach((_, i) => {
		if (lit[i] < 0.04) issues.push(`cuadro ${i + 1}: casi vacío, el protagonista ocupa menos del 4 % de la zona visible; acerca la cámara o agranda el objeto`);
		if (burnt[i] > 0.1) issues.push(`cuadro ${i + 1}: quemado, ${Math.round(burnt[i] * 100)} % de la imagen está en blanco puro; baja intensidades`);
		if (behindText[i] > 0.34) issues.push(`cuadro ${i + 1}: hay objetos detrás del texto, entre 15 % y 27 % del alto; usa kit.camera.frame o baja el protagonista`);
	});
	const motion = frames.slice(1).map((f, i) => {
		let sum = 0;
		for (let k = 0; k < f.length; k++) sum += Math.abs(f[k] - frames[i][k]);
		return sum / f.length;
	});
	if (motion.length && Math.max(...motion) < 1.2) issues.push('la escena casi no cambia entre momentos; cada momento debe verse distinto');
	return {issues, values: {lit: Math.min(...lit), burnt: Math.max(...burnt), behindText: Math.max(...behindText), motion: Math.max(...motion, 0)}};
};
