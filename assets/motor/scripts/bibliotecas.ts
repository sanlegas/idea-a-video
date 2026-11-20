// Brings the background music library to this machine. The tracks do not travel with the project: each is
// downloaded from where its author published it, checked against the fingerprint in the catalog, and converted
// to the form the flows use (MP3, every track at the same loudness).
// usage: pnpm bibliotecas [--rehacer]
// Without the library the flows still work: they fall back to the synthesized bed.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const DIR = 'kit/biblioteca/musica';
const CACHE = 'out/cache/musica';
// Loudness every track is brought to, so one level in a plan means the same for all of them.
const SONORIDAD = -20;

type Pista = {archivo: string; titulo: string; autor: string; licencia: string; descarga?: {url: string; sha256: string; bytes: number}; recorte?: number};
const catalogo = JSON.parse(readFileSync(`${DIR}/musica.json`, 'utf8')) as Record<string, Pista>;
const rehacer = process.argv.includes('--rehacer');

// ffmpeg prints the measurement on its error output.
const medir = (archivo: string) => {
	const {stderr} = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', archivo, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,ebur128', '-f', 'null', '-'], {encoding: 'utf8'});
	const m = [...(stderr ?? '').matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
	if (!m) throw new Error(`no se pudo medir la sonoridad de ${archivo}`);
	return Number(m[1]);
};

const main = async () => {
	mkdirSync(CACHE, {recursive: true});
	let hechas = 0;
	const fallas: string[] = [];
	for (const [id, p] of Object.entries(catalogo)) {
		const destino = `${DIR}/${p.archivo}`;
		if (existsSync(destino) && !rehacer) continue;
		if (!p.descarga) {
			fallas.push(`${id}: el catálogo no dice de dónde bajarla`);
			continue;
		}
		try {
			const original = path.join(CACHE, `${id}${path.extname(new URL(p.descarga.url).pathname)}`);
			if (!existsSync(original)) {
				console.log(`bajando ${p.titulo} (${(p.descarga.bytes / 1e6).toFixed(1)} MB)`);
				const res = await fetch(p.descarga.url, {headers: {'user-agent': 'idea-a-video/0.1 (video tool; music library)'}});
				if (!res.ok) throw new Error(`el sitio respondió ${res.status}`);
				writeFileSync(original, Buffer.from(await res.arrayBuffer()));
			}
			// A file that is not the one the catalog knows is never used: it may be another recording, or not audio at all.
			const huella = createHash('sha256').update(readFileSync(original)).digest('hex');
			if (huella !== p.descarga.sha256) throw new Error('el archivo bajado no es el que el catálogo conoce (huella distinta); bórralo de out/cache/musica y repite, o quita la pista del catálogo');
			const ganancia = SONORIDAD - medir(original);
			const filtros = ['silenceremove=start_periods=1:start_threshold=-50dB', `volume=${ganancia.toFixed(2)}dB`, 'alimiter=limit=0.9', ...(p.recorte ? [`afade=t=out:st=${p.recorte - 3}:d=3`] : [])];
			execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', original, '-af', filtros.join(','), ...(p.recorte ? ['-t', String(p.recorte)] : []), '-ac', '2', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '160k', destino]);
			hechas++;
			console.log(`lista: ${p.archivo} — "${p.titulo}" de ${p.autor}, ${p.licencia}`);
		} catch (e) {
			fallas.push(`${id}: ${String((e as Error).message ?? e).slice(0, 200)}`);
		}
	}
	const total = Object.values(catalogo).filter((p) => existsSync(`${DIR}/${p.archivo}`)).length;
	console.log(`música: ${total} de ${Object.keys(catalogo).length} pistas en ${DIR}${hechas ? `, ${hechas} nuevas` : ''}`);
	if (fallas.length) {
		console.log(`sin instalar:\n- ${fallas.join('\n- ')}\nLos flujos siguen funcionando: con menos pistas eligen entre las que hay, y sin ninguna usan la cama sintetizada.`);
		process.exitCode = 2;
	}
};

main();
