// The voice the operating system already has: free, offline and with nothing to install on macOS and Windows.
// Plainer than a cloud voice or a cloned one, but a film with it can be heard and timed. On Linux it is espeak-ng,
// if installed, which sounds robotic.
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {variable} from './claves';

export type VozSistema = {so: 'macos' | 'windows' | 'linux'; voz: string};

const sale = (programa: string, args: string[]) => {
	try {
		return execFileSync(programa, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
	} catch {
		return null;
	}
};

const POWERSHELL = ['-NoProfile', '-NonInteractive', '-Command'];
// Voices that read well, first; then any Mexican or Latin American Spanish, then any Spanish.
const PREFERIDAS = ['Paulina', 'Mónica', 'Sabina', 'Helena'];
const orden = (v: {nombre: string; idioma: string}) => {
	const p = PREFERIDAS.findIndex((n) => v.nombre.startsWith(n));
	return (p >= 0 ? p : PREFERIDAS.length) * 10 + (/MX|419|US/i.test(v.idioma) ? 0 : 1);
};

let hallada: VozSistema | null | undefined;

// A Spanish voice of this system, or null. VOZ_SISTEMA in the environment names one by hand.
export const vozDelSistema = (): VozSistema | null => {
	if (hallada !== undefined) return hallada;
	const elegir = (so: VozSistema['so'], voces: {nombre: string; idioma: string}[]) => {
		const pedida = variable('VOZ_SISTEMA');
		// A short name ("Paulina") also picks the voice that macOS lists as "Paulina (Español (México))".
		const v = pedida ? (voces.find((x) => x.nombre === pedida) ?? voces.find((x) => x.nombre.startsWith(`${pedida} (`))) : [...voces].sort((a, b) => orden(a) - orden(b))[0];
		return v ? {so, voz: v.nombre} : null;
	};
	if (process.platform === 'darwin') {
		// One voice per line: name, locale, sample. Names may hold spaces and parentheses.
		const voces = (sale('say', ['-v', '?']) ?? '').split('\n').flatMap((l) => {
			const m = /^(.+?)\s+(es_[A-Za-z0-9]+)\s+#/.exec(l);
			return m ? [{nombre: m[1].trim(), idioma: m[2]}] : [];
		});
		hallada = elegir('macos', voces);
	} else if (process.platform === 'win32') {
		const lista = sale('powershell', [...POWERSHELL, "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }"]);
		const voces = (lista ?? '').split(/\r?\n/).flatMap((l) => {
			const [nombre, idioma] = l.split('|');
			return idioma?.toLowerCase().startsWith('es') ? [{nombre: nombre.trim(), idioma: idioma.trim()}] : [];
		});
		hallada = elegir('windows', voces);
	} else hallada = sale('espeak-ng', ['--version']) ? {so: 'linux', voz: variable('VOZ_SISTEMA') ?? 'es-419'} : null;
	return hallada;
};

// One audio per sentence in `beats`. The text travels in a file, never on the command line, so no character of it is
// read as an option or needs escaping.
export const narrarConSistema = (lineas: string[], beats: string) => {
	const v = vozDelSistema();
	if (!v) throw new Error('este sistema no tiene una voz en español: en macOS, Ajustes > Accesibilidad > Contenido leído > Voces; en Windows, Configuración > Hora e idioma > Voz; en Linux, instala espeak-ng');
	// Beside the audio, not among it: the beats folder holds only what can be heard.
	const textos = path.join(path.dirname(beats), 'texto_voz');
	mkdirSync(textos, {recursive: true});
	lineas.forEach((texto, i) => {
		const id = path.join(beats, `beat_${String(i).padStart(2, '0')}`);
		const guion = path.join(textos, `beat_${String(i).padStart(2, '0')}.txt`);
		writeFileSync(guion, texto, 'utf8');
		if (v.so === 'macos') execFileSync('say', ['-v', v.voz, '-o', `${id}.aiff`, '-f', guion], {stdio: 'ignore'});
		else if (v.so === 'windows') {
			const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
			execFileSync('powershell', [...POWERSHELL, `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice(${q(v.voz)}); $s.SetOutputToWaveFile(${q(path.resolve(`${id}.wav`))}); $s.Speak([System.IO.File]::ReadAllText(${q(path.resolve(guion))}, [System.Text.Encoding]::UTF8)); $s.Dispose()`], {stdio: 'ignore'});
		} else execFileSync('espeak-ng', ['-v', v.voz, '-s', '155', '-w', `${id}.wav`, '-f', guion], {stdio: 'ignore'});
	});
	return v;
};
