// Narration, sentence by sentence, from whichever provider the run asks for. Every provider leaves one audio file per
// sentence in the beats folder; joining them and timing each word is the same for all (scripts/estudio/lib/palabras.ts).
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import type {Word} from '../../src/estudio/film';
import {joinVoice, palabrasDeAlineacion, wordTimes, type Alineacion} from '../estudio/lib/palabras';
import {claveDe, variable} from './claves';
import {clearLocal} from './llm';
import {correr, liberar, local, sinLocal} from './local';
import {medios, vozElevenlabs, type ProveedorVoz} from './medios';
import {narrarConSistema, vozDelSistema} from './voz_sistema';

type Log = (...x: unknown[]) => void;
const ELEVEN = 'https://api.elevenlabs.io/v1';
// Where a provider that knows when each word sounds leaves that, one file per sentence, beside the audio.
export const carpetaAlineacion = (beats: string) => path.join(path.dirname(beats), 'alineacion');

// This machine's own voice model, through the command of config/local.json. VOZ in the environment names the voice;
// otherwise the one that file gives.
const propia = (lineas: string[], beats: string) => {
	const c = local().voz;
	if (!c) throw sinLocal('La voz', 'Usa --voz elevenlabs, o --voz borrador para un video sin voz.');
	clearLocal();
	const lista = path.join(path.dirname(beats), 'beats.json');
	writeFileSync(lista, JSON.stringify(lineas, null, 1));
	const voz = variable('VOZ') ?? c.voz;
	correr(c.comando, [lista, beats], {stdio: 'ignore', env: {...process.env, ...(voz ? {VOZ: voz} : {})}});
	liberar();
};

// The voice of the account to narrate with when the run names none: the first one that speaks Spanish, or the first.
const vozDeLaCuenta = async (key: string, log: Log) => {
	const res = await fetch(`${ELEVEN}/voices`, {headers: {'xi-api-key': key}});
	if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status} al listar las voces: ${(await res.text()).slice(0, 200)}`);
	const {voices} = (await res.json()) as {voices: {voice_id: string; name: string; labels?: Record<string, string>; verified_languages?: {language: string}[]}[]};
	if (!voices?.length) throw new Error('La cuenta de ElevenLabs no tiene voces: agrega una, o pon su id en ELEVENLABS_VOICE_ID');
	const habla = (v: (typeof voices)[number]) => [v.labels?.language, ...(v.verified_languages ?? []).map((l) => l.language)].some((l) => l?.toLowerCase().startsWith('es'));
	const v = voices.find(habla) ?? voices[0];
	log(`ElevenLabs: sin voz elegida, uso "${v.name}" (${v.voice_id}); para fijar otra pon ELEVENLABS_VOICE_ID en .env`);
	return v.voice_id;
};

// ElevenLabs text-to-speech. Each sentence travels with its neighbours as context, so the tone carries across cuts.
const elevenlabs = async (lineas: string[], beats: string, log: Log) => {
	const c = medios().voz.elevenlabs;
	const alineacion = carpetaAlineacion(beats);
	rmSync(alineacion, {recursive: true, force: true});
	mkdirSync(alineacion, {recursive: true});
	const key = claveDe('elevenlabs', 'La voz de ElevenLabs');
	const voz = vozElevenlabs() ?? (await vozDeLaCuenta(key, log));
	const ext = c.output_format.split('_')[0] === 'pcm' ? 'pcm' : c.output_format.split('_')[0];
	let letras = 0;
	for (const [i, text] of lineas.entries()) {
		// The same request that makes the audio returns when each character sounds, so words can be timed on any
		// machine, with nothing to hear the voice with.
		const res = await fetch(`${ELEVEN}/text-to-speech/${voz}/with-timestamps?output_format=${c.output_format}`, {
			method: 'POST',
			headers: {'xi-api-key': key, 'content-type': 'application/json'},
			body: JSON.stringify({
				text,
				model_id: c.model_id,
				voice_settings: {stability: c.stability, similarity_boost: c.similarity_boost, style: c.style, speed: c.speed},
				seed: 1957 + i,
				previous_text: lineas[i - 1] ?? null,
				next_text: lineas[i + 1] ?? null,
			}),
		});
		if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status} en la frase ${i}: ${(await res.text()).slice(0, 300)}`);
		const {audio_base64, alignment} = (await res.json()) as {audio_base64: string; alignment?: Alineacion | null};
		const id = `beat_${String(i).padStart(2, '0')}`;
		writeFileSync(path.join(beats, `${id}.${ext}`), Buffer.from(audio_base64, 'base64'));
		if (alignment) writeFileSync(path.join(alineacion, `${id}.json`), JSON.stringify(palabrasDeAlineacion(alignment)));
		letras += text.length;
	}
	log(`ElevenLabs: ${lineas.length} frases, ${letras} caracteres con ${c.model_id}`);
};

// No voice: silence of the right length and a clock estimated from the length of each word.
const borrador = (lineas: string[], salida: string, palabrasPorSegundo: number) => {
	const words: Word[] = [];
	let t = 0.15;
	lineas.forEach((l, line) => {
		l.split(/\s+/).filter(Boolean).forEach((word) => {
			const largo = (0.1 + 0.045 * word.length) * (3.4 / palabrasPorSegundo);
			words.push({word, line, start: +t.toFixed(3), end: +(t + largo).toFixed(3)});
			t += largo + (/[,;:]$/.test(word) ? 0.14 : 0.02);
		});
		t += 0.3;
	});
	const duration = +(t + 0.4).toFixed(2);
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(duration), salida]);
	return {duration, words, misheard: [] as string[]};
};

// Fills `beats` with one audio per sentence, from the provider asked for. Flows that join and time the voice
// themselves call this; the rest call narrar.
export const narrarFrases = async ({proveedor, lineas, beats, log, palabrasPorSegundo = 3.4}: {proveedor: ProveedorVoz; lineas: string[]; beats: string; log: Log; palabrasPorSegundo?: number}) => {
	rmSync(beats, {recursive: true, force: true});
	mkdirSync(beats, {recursive: true});
	if (proveedor === 'local') propia(lineas, beats);
	else if (proveedor === 'elevenlabs') await elevenlabs(lineas, beats, log);
	else if (proveedor === 'sistema') log(`voz del sistema: ${narrarConSistema(lineas, beats).voz}`);
	// No voice: a placeholder as long as each sentence would take to say, so the film keeps its rhythm. It is a 20 Hz
	// hum far below hearing rather than digital silence, because joining the sentences trims silence off their ends.
	else
		lineas.forEach((l, i) => {
			const dura = l.split(/\s+/).filter(Boolean).reduce((a, w) => a + (0.12 + 0.045 * w.length) * (3.4 / palabrasPorSegundo), 0.2);
			execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=20:sample_rate=48000', '-af', 'volume=0.07', '-t', dura.toFixed(2), path.join(beats, `beat_${String(i).padStart(2, '0')}.wav`)]);
		});
};

// Narrates `lineas` into `salida` (wav) and returns the time of every word. `dir` keeps the per-sentence audio, so a
// rerun with the same provider, voice and text costs nothing.
export const narrar = async ({proveedor, lineas, dir, salida, log, palabrasPorSegundo = 3.4}: {proveedor: ProveedorVoz; lineas: string[]; dir: string; salida: string; nombre?: string; log: Log; palabrasPorSegundo?: number}) => {
	writeFileSync(`${dir}/beats.json`, JSON.stringify(lineas, null, 1));
	if (proveedor === 'borrador') return borrador(lineas, salida, palabrasPorSegundo);
	const beats = `${dir}/beats`;
	const huella = JSON.stringify({proveedor, ajustes: proveedor === 'local' ? {voz: variable('VOZ') ?? local().voz?.voz ?? null} : proveedor === 'sistema' ? vozDelSistema() : {...medios().voz.elevenlabs, voice_id: vozElevenlabs()}, lineas});
	const marca = `${dir}/voz_hecha.json`;
	const vigente = existsSync(marca) && readFileSync(marca, 'utf8') === huella && existsSync(beats) && readdirSync(beats).filter((f) => /^beat_/.test(f)).length === lineas.length;
	if (!vigente) {
		await narrarFrases({proveedor, lineas, beats, log});
		writeFileSync(marca, huella);
	}
	const {duration, spans} = joinVoice(beats, salida);
	const {words, misheard, estimado} = wordTimes(lineas, salida, spans, `${dir}/tmp`, proveedor === 'elevenlabs' ? carpetaAlineacion(beats) : undefined);
	if (estimado) log('tiempos de palabra estimados dentro de cada frase: esta máquina no tiene con qué oír la voz (ver whisper en config/local.example.json)');
	return {duration, words, misheard};
};
