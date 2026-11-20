// Secrets of cloud services. They live in the environment or in .env of the working folder, never in a file of the
// project. Every service has one name; config/local.json may say that this machine keeps one under another name.
import {existsSync, readFileSync} from 'node:fs';
import {local} from './local';

export const CLAVES = {
	elevenlabs: 'ELEVENLABS_API_KEY',
	openrouter: 'OPENROUTER_API_KEY',
	deepseek: 'DEEPSEEK_API_KEY',
	pexels: 'PEXELS_API_KEY',
	fal: 'FAL_KEY',
} as const;
export type Servicio = keyof typeof CLAVES;

// Any setting kept beside the secrets, such as the id of a voice.
export const variable = (nombre: string): string | null => {
	const nombres = [nombre, ...(local().claves?.[nombre] ? [local().claves![nombre]] : [])];
	for (const n of nombres) if (process.env[n]) return process.env[n] as string;
	if (existsSync('.env')) {
		for (const linea of readFileSync('.env', 'utf8').split('\n')) {
			const m = /^\s*(\w+)\s*=\s*["']?([^"'\s]+)/.exec(linea);
			if (m && nombres.includes(m[1])) return m[2];
		}
	}
	return null;
};

export const clave = (servicio: Servicio) => variable(CLAVES[servicio]);

// The key, or an error that says which variable to set and where.
export const claveDe = (servicio: Servicio, para: string) => {
	const k = clave(servicio);
	if (!k) throw new Error(`${para} necesita ${CLAVES[servicio]}: ponla en .env de esta carpeta (ver .env.example)`);
	return k;
};
