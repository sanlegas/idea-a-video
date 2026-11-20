// Join beat narrations into public/voice.wav. Beat lengths give the film's timing; whisper only audits the words.
// usage: node scripts/timing.mjs <dir with beat_XX files>
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const run = process.argv[3];
// The voice starts almost at once: dead air before the first word wastes the hook.
const LEAD = 0.12;
const GAP = 0.2;
const TAIL = 1.6;
const SR = 48000;

const sb = JSON.parse(readFileSync(`${run}/storyboard.json`, 'utf8'));
const files = readdirSync(dir).filter((f) => /^beat_.*\.(wav|mp3|flac|aiff?|ogg|opus|m4a)$/i.test(f)).sort();
if (files.length !== sb.beats.length) throw new Error(`${files.length} audios para ${sb.beats.length} beats`);

mkdirSync('out/voice', {recursive: true});
const pcm = (f) =>
	execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, f), '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', '-ar', String(SR), '-ac', '1', '-f', 'f32le', '-'], {maxBuffer: 1 << 28});

const silence = (s) => Buffer.alloc(Math.round(s * SR) * 4);
const parts = [silence(LEAD)];
const beats = [];
let t = LEAD;
for (const f of files) {
	const a = pcm(f);
	const d = a.length / 4 / SR;
	beats.push({start: t, end: t + d});
	parts.push(a, silence(GAP));
	t += d + GAP;
}
// Beats touch each other so the picture never falls through a gap; the first one also owns the lead-in.
beats.forEach((b, i) => {
	b.start = i === 0 ? 0 : beats[i - 1].end;
	b.end = i === beats.length - 1 ? t + TAIL : b.end + GAP;
});
parts.push(silence(TAIL));
const raw = Buffer.concat(parts);
writeFileSync('out/voice/raw.f32', raw);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'out/voice/raw.f32', '-ac', '2', '-c:a', 'pcm_s16le', `${run}/voice.wav`]);
const duration = raw.length / 4 / SR;
writeFileSync(`${run}/timing.json`, JSON.stringify({duration, beats, words: []}, null, 2));
console.log(`duracion ${duration.toFixed(2)} s`, beats.map((b) => b.start.toFixed(2)).join(' '));
