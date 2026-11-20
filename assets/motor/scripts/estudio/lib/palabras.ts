// The guion decides the text; speech recognition only says when each word was spoken.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import type {Word} from '../../../src/estudio/film';
import {correr, local, whisper} from '../../lib/local';

const LEAD = 0.05;
const GAP = 0.34;
const TAIL = 0.9;
const SR = 48000;

const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse';

export type Heard = {text: string; start: number; end: number};

// Joins sentences with a short breath, so ideas stay apart.
export const joinVoice = (dir: string, out: string) => {
	const files = readdirSync(dir).filter((f) => /^beat_.*\.(wav|mp3|flac|aiff?|ogg|opus|m4a)$/i.test(f)).sort();
	const silence = (s: number) => Buffer.alloc(Math.round(s * SR) * 4);
	const parts: Buffer[] = [silence(LEAD)];
	const spans: {start: number; end: number}[] = [];
	let t = LEAD;
	files.forEach((f, i) => {
		const a = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, f), '-af', TRIM, '-ar', String(SR), '-ac', '1', '-f', 'f32le', '-'], {maxBuffer: 1 << 28});
		const d = a.length / 4 / SR;
		spans.push({start: t, end: t + d});
		const pause = i < files.length - 1 ? GAP : TAIL;
		parts.push(a, silence(pause));
		t += d + pause;
	});
	const raw = path.join(path.dirname(out), 'voz.f32');
	writeFileSync(raw, Buffer.concat(parts));
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', raw, '-ac', '2', '-c:a', 'pcm_s16le', out]);
	return {duration: t, spans};
};

const tiene = (programa: string) => {
	try {
		execFileSync(process.platform === 'win32' ? 'where' : 'which', [programa], {stdio: 'ignore'});
		return true;
	} catch {
		return false;
	}
};

// What this machine can hear the voice with: its own command, or whisper.cpp with its model. Neither: null.
export const oido = (): 'comando' | 'whisper' | null => {
	if (local().tiempos) return 'comando';
	const w = whisper();
	return tiene(w.cli) && existsSync(w.modelo) ? 'whisper' : null;
};

// Every word heard, with its time. null when this machine has nothing to hear with.
export const oir = (audio: string, dir: string): Heard[] | null => {
	const con = oido();
	if (!con) return null;
	if (con === 'comando') {
		const out = path.join(dir, 'heard.json');
		correr(local().tiempos!.comando, [audio, out], {stdio: 'ignore'});
		return JSON.parse(readFileSync(out, 'utf8'));
	}
	const w = whisper();
	const wav = path.join(dir, 'a16.wav');
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', audio, '-ar', '16000', '-ac', '1', wav]);
	execFileSync(w.cli, ['-m', w.modelo, '-f', wav, '-l', 'es', '-ml', '1', '-sow', '-ojf', '-of', path.join(dir, 'w'), '-np'], {stdio: 'ignore'});
	return JSON.parse(readFileSync(path.join(dir, 'w.json'), 'utf8'))
		.transcription.map((w: {text: string; offsets: {from: number; to: number}}) => ({text: w.text.trim(), start: w.offsets.from / 1000, end: w.offsets.to / 1000}))
		.filter((w: Heard) => w.text);
};

// Edit distance between written and heard words, so a misheard word still gets its neighbours' time.
const align = (tokens: {word: string; line: number}[], heard: Heard[]) => {
	const n = tokens.length;
	const m = heard.length;
	const cost = Array.from({length: n + 1}, () => new Float64Array(m + 1));
	const from = Array.from({length: n + 1}, () => new Int8Array(m + 1));
	for (let i = 1; i <= n; i++) {
		cost[i][0] = i;
		from[i][0] = 1;
	}
	for (let j = 1; j <= m; j++) {
		cost[0][j] = j;
		from[0][j] = 2;
	}
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const same = key(tokens[i - 1].word) === key(heard[j - 1].text);
			const options = [cost[i - 1][j - 1] + (same ? 0 : 1), cost[i - 1][j] + 1, cost[i][j - 1] + 1];
			const best = options.indexOf(Math.min(...options));
			cost[i][j] = options[best];
			from[i][j] = best;
		}
	}
	const pair: (Heard | null)[] = new Array(n).fill(null);
	for (let i = n, j = m; i > 0 || j > 0; ) {
		const step = from[i][j];
		if (step === 0) {
			pair[i - 1] = heard[j - 1];
			i--;
			j--;
		} else if (step === 1) i--;
		else j--;
	}
	return pair;
};

// When each character of a sentence sounds, as a voice provider reports it: three parallel lists.
export type Alineacion = {characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[]};

// Characters into words: a word runs from its first character to its last, and spaces part them.
export const palabrasDeAlineacion = (a: Alineacion): Heard[] => {
	const out: Heard[] = [];
	let actual: Heard | null = null;
	a.characters.forEach((c, i) => {
		if (/\s/.test(c)) {
			if (actual) out.push(actual);
			actual = null;
		} else if (actual) {
			actual.text += c;
			actual.end = a.character_end_times_seconds[i];
		} else actual = {text: c, start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i]};
	});
	if (actual) out.push(actual);
	return out;
};

// Word times from what the voice provider reported, if it covers every sentence word for word. Each sentence was
// trimmed of silence when joined, so its words are fitted between the sentence's start and end in the film.
const deAlineacion = (lines: string[], spans: {start: number; end: number}[], carpeta: string): Word[] | null => {
	const words: Word[] = [];
	for (const [line, text] of lines.entries()) {
		const archivo = path.join(carpeta, `beat_${String(line).padStart(2, '0')}.json`);
		if (!existsSync(archivo)) return null;
		const dichas = JSON.parse(readFileSync(archivo, 'utf8')) as Heard[];
		const partes = text.split(/\s+/).filter(Boolean);
		if (dichas.length !== partes.length || !dichas.length) return null;
		const [de, a] = [dichas[0].start, dichas[dichas.length - 1].end];
		const escala = (spans[line].end - spans[line].start) / Math.max(1e-6, a - de);
		const en = (t: number) => +(spans[line].start + (t - de) * escala).toFixed(3);
		partes.forEach((word, k) => words.push({word, line, start: en(dichas[k].start), end: en(dichas[k].end)}));
	}
	return words;
};

// alineacion: folder with the provider's own word times, one file per sentence; used when it is there and complete.
export const wordTimes = (lines: string[], audio: string, spans: {start: number; end: number}[], dir: string, alineacion?: string) => {
	mkdirSync(dir, {recursive: true});
	const propias = alineacion && existsSync(alineacion) ? deAlineacion(lines, spans, alineacion) : null;
	if (propias) return {words: propias, misheard: [] as string[], estimado: false};
	const heard = oir(audio, dir);
	const tokens = lines.flatMap((text, line) => text.split(/\s+/).filter(Boolean).map((word) => ({word, line})));
	// Nothing to hear with: each sentence's start and end are exact (they come from joining the audio), and its words
	// share that time by their length. Close enough for captions; a cut on a word may land a little off.
	if (!heard) {
		const words: Word[] = [];
		lines.forEach((text, line) => {
			const partes = text.split(/\s+/).filter(Boolean);
			const peso = (w: string) => 0.1 + 0.045 * w.length + (/[,;:]$/.test(w) ? 0.12 : 0);
			const total = partes.reduce((a, w) => a + peso(w), 0);
			let t = spans[line].start;
			partes.forEach((word) => {
				const d = ((spans[line].end - spans[line].start) * peso(word)) / total;
				words.push({word, line, start: +t.toFixed(3), end: +(t + d).toFixed(3)});
				t += d;
			});
		});
		return {words, misheard: [] as string[], estimado: true};
	}
	const pair = align(tokens, heard);
	const words: Word[] = tokens.map((t, i) => ({...t, start: pair[i]?.start ?? -1, end: pair[i]?.end ?? -1}));
	// A word the recognizer merged or dropped takes its time from its neighbours.
	words.forEach((w, i) => {
		if (w.start >= 0) return;
		const before = words.slice(0, i).reverse().find((x) => x.start >= 0);
		const after = words.slice(i + 1).find((x) => x.start >= 0);
		w.start = before?.end ?? spans[w.line].start;
		w.end = after?.start ?? w.start + 0.2;
	});
	words.forEach((w, i) => {
		if (i === 0 || words[i - 1].line !== w.line) w.start = Math.max(w.start, spans[w.line].start);
	});
	return {words, misheard: tokens.filter((t, i) => !pair[i] || key(pair[i]!.text) !== key(t.word)).map((t) => t.word), estimado: false};
};
