import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const FONTS = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 'C:/Windows/Fonts/arial.ttf'];

// A strip of moments, the way a person would look at a scene: one glance at the whole.
export const makeSheet = (files: string[], out: string, seconds: number[]) => {
	// A drive letter's colon would end the option, so it is escaped below.
	const font = FONTS.find(existsSync);
	const inputs = files.flatMap((f) => ['-i', f]);
	const label = (i: number) => (font ? `,drawbox=y=0:w=iw:h=34:color=black@0.7:t=fill,drawtext=fontfile=${font.replace(/:/g, '\\:')}:text='${i + 1} (${seconds[i].toFixed(1)} s)':x=10:y=8:fontsize=20:fontcolor=white` : '');
	const each = files.map((_, i) => `[${i}:v]scale=360:640${label(i)}[f${i}]`).join(';');
	const chain = files.map((_, i) => `[f${i}]`).join('');
	execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `${each};${chain}hstack=inputs=${files.length}`, '-frames:v', '1', '-q:v', '3', out]);
	return out;
};
