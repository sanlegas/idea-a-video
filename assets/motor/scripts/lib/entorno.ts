// Leaves the machine ready before a run spends anything: the tools every flow needs, the key of the LLM the run
// asked for, room on disk, and whatever this machine does to wake its own models (config/local.json, `preparar`).
// What is missing stops the run now, saying how to fix it, not halfway through.
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync, rmSync, statfsSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {clave, CLAVES} from './claves';
import {deepSeekBalance} from './llm';
import {correr, local} from './local';

type Log = (...x: unknown[]) => void;
const MIN_FREE_GB = 5;

export const tiene = (programa: string) => {
	try {
		execFileSync(process.platform === 'win32' ? 'where' : 'which', [programa], {stdio: 'ignore'});
		return true;
	} catch {
		return false;
	}
};

// A run that crashed never removed its render bundle. Flows point the temp folder inside the project, so only our
// own files are touched. A bundle younger than STALE_HOURS may belong to a run still going, so it stays.
const STALE_HOURS = 12;
const clearBundles = () =>
	readdirSync(tmpdir())
		.filter((f) => f.startsWith('remotion-webpack-bundle-'))
		.map((f) => path.join(tmpdir(), f))
		.filter((f) => Date.now() - statSync(f).mtimeMs > STALE_HOURS * 3600e3)
		.forEach((f) => rmSync(f, {recursive: true, force: true}));

// usaLocal: the run narrates, draws or builds models with this machine's own commands.
export const prepararEntorno = async ({perfil, usaLocal, log, flujo = ''}: {perfil: string; usaLocal: boolean; log: Log; flujo?: string}) => {
	const problemas: string[] = [];
	if (!tiene('ffmpeg')) problemas.push('falta ffmpeg: instálalo (macOS: brew install ffmpeg; Debian o Ubuntu: sudo apt install ffmpeg; Windows: winget install ffmpeg)');

	const {bavail, bsize} = statfsSync('.');
	const libres = (bavail * bsize) / 1e9;
	if (libres < MIN_FREE_GB) problemas.push(`solo quedan ${libres.toFixed(1)} GB libres en disco; hacen falta ${MIN_FREE_GB}`);
	clearBundles();

	const pasos = Object.values(JSON.parse(readFileSync('config/models.json', 'utf8')).profiles[perfil] ?? {}) as {provider: string}[];
	if (!pasos.length) throw new Error(`perfil de LLM desconocido: ${perfil}; los perfiles están en config/models.json`);
	if (pasos.some((s) => s.provider === 'openrouter') && !clave('openrouter')) problemas.push(`el perfil ${perfil} usa OpenRouter: falta ${CLAVES.openrouter} en .env`);
	if (pasos.some((s) => s.provider === 'deepseek')) {
		if (!clave('deepseek')) problemas.push(`el perfil ${perfil} usa DeepSeek: falta ${CLAVES.deepseek} en .env`);
		else {
			const saldo = await deepSeekBalance().catch((e) => {
				problemas.push(`DeepSeek: ${String(e).slice(0, 160)}`);
				return null;
			});
			if (saldo && !saldo.available) problemas.push('DeepSeek no tiene saldo');
			if (saldo) log(`DeepSeek: saldo $${saldo.dollars.toFixed(2)}`);
		}
	}
	if (pasos.some((s) => s.provider === 'sesion')) log('LLM: el asistente de la sesión responde cada pedido; la corrida se detiene en cada uno y sigue al repetir el comando');

	if (problemas.length) throw new Error(`Entorno incompleto:\n- ${problemas.join('\n- ')}`);

	// This machine's own servers and models: it knows how to start and check them.
	const preparar = local().preparar;
	if (usaLocal && preparar) correr(preparar, [perfil, flujo], {stdio: 'inherit'});
	log(`entorno listo: ffmpeg, ${libres.toFixed(0)} GB libres${usaLocal && preparar ? ', modelos locales revisados' : ''}`);
};
