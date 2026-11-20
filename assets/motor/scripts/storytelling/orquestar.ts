// Topic or guion to a storytelling short, step by step. Voice and pictures come from what this machine and its keys
// allow (config/medios.json, `auto`); --borrador needs nothing: no voice, labelled plates instead of pictures.
// usage: pnpm storytelling <nombre> --guion guiones/storytelling/x.md [--llm deepseek|local|...] [--desde paso] [--hasta paso] [--solo paso] [--plan]
//   --tema "…" [--fuentes datos.md] [--segundos 75]   the LLM writes the guion instead of --guion
//   --direccion x.json / --planos x.json               hand-written answers for those two LLM steps (a person or the assistant directs)
//   --estilo dinamico|cine|sobrio | x.json             transitions, camera, focus and captions: a preset, or a hand-written estilo.json
//   --musica pistas|sintetizada|no | x.json            background music: library tracks by mood (default), the old bed, none, or a hand-written plan
//   --voz local|elevenlabs|borrador                    where narration comes from (default: config/medios.json)
//   --imagenes local|stock|nube|placas                 where pictures come from; a list like stock,nube falls through in order
//   --borrador   same as --voz borrador --imagenes placas: an animatic to judge the cut, on any machine
//   --plan       prints every step with who does it and an estimate of time and cost, and runs nothing
// Finished steps are skipped; --desde reruns from that step on.
import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {readGuion} from '../lib/guion';
import {perfilPorDefecto} from '../lib/llm';
import {leerProveedores, medios, PROVEEDORES_IMAGEN, PROVEEDORES_VOZ, resolverImagenes, resolverVoz} from '../lib/medios';
import {MODOS, type Modo} from '../lib/musica';
import {banderas, orquestar, principal, reloj} from '../lib/orquestador';
import {PRESET_IDS, type PresetId} from '../../src/storytelling/estilo';
import {PALABRAS_POR_SEGUNDO, PASOS, type Ctx, type Supuestos} from './pasos';
import {segundosPreferidos} from '../lib/preferencias';
import {carpetaTemporal} from '../lib/sistema';

const args = process.argv.slice(2);
const {valor, tiene} = banderas(args);
const nombre = args[0];
if (!nombre || nombre.startsWith('--')) throw new Error('Falta el nombre: pnpm storytelling <nombre> --guion guiones/storytelling/x.md');
const dir = `runs/storytelling/${nombre}`;
const pub = `public/storytelling/${nombre}`;
mkdirSync(dir, {recursive: true});
mkdirSync(pub, {recursive: true});
// Inputs a person brings: the guion, and optionally the two answers an LLM would otherwise give.
// A guion that changed since the last run makes everything after it stale: the voice says the old text and the cut
// counts the old words. The run then starts over from the voice, unless it was told where to start.
const guionNuevo = valor('guion') ? readFileSync(valor('guion')!, 'utf8') : null;
const guionCambio = guionNuevo !== null && existsSync(`${dir}/guion.md`) && existsSync(`${dir}/palabras.json`) && readFileSync(`${dir}/guion.md`, 'utf8') !== guionNuevo;
for (const [bandera, archivo] of [['guion', 'guion.md'], ['direccion', 'direccion.json'], ['planos', 'planos.json']]) if (valor(bandera)) copyFileSync(valor(bandera)!, `${dir}/${archivo}`);
if (guionCambio && !valor('desde') && !valor('solo') && !tiene('plan')) {
	reloj('el guion cambió desde la última corrida: se rehace desde la voz');
	args.push('--desde', 'voz');
}
// --estilo is a preset name, or a file with the style of every shot already decided.
const estilo = valor('estilo');
const estiloAMano = Boolean(estilo?.endsWith('.json'));
if (estiloAMano && path.resolve(estilo!) !== path.resolve(`${dir}/estilo.json`)) copyFileSync(estilo!, `${dir}/estilo.json`);
else if (estilo && !PRESET_IDS.includes(estilo as PresetId)) throw new Error(`estilo desconocido: ${estilo}; hay: ${PRESET_IDS.join(', ')}, o un archivo .json`);
// Render bundles copy public/; the system temp folder may live in memory, so the project keeps its own.
carpetaTemporal();

// Without --segundos, the length of the user's usual template.
const segundos = Number(valor('segundos') ?? segundosPreferidos());
// --borrador only fills what the run did not say: `--borrador --imagenes stock` is an animatic with real photos.
const m = medios();
// A provider named on the command line is used as asked. Otherwise `auto` picks from what this machine and its keys
// allow, and the run says what it picked and why before spending anything.
const pideVoz = valor('voz') ? leerProveedores(valor('voz'), PROVEEDORES_VOZ, [])[0] : tiene('borrador') ? 'borrador' : m.voz.proveedor;
const pideImagenes = valor('imagenes') ? leerProveedores(valor('imagenes'), PROVEEDORES_IMAGEN, []) : tiene('borrador') ? ['placas' as const] : m.imagen.proveedores;
const eligeVoz = resolverVoz(pideVoz);
const eligeImagenes = resolverImagenes(pideImagenes);
const voz = eligeVoz.proveedor;
const imagenes = eligeImagenes.proveedor;
if (eligeVoz.porque !== 'pedido') reloj(`voz: ${voz} (${eligeVoz.porque})`);
if (eligeImagenes.porque !== 'pedido') reloj(`imágenes: ${imagenes.join(' > ')} (${eligeImagenes.porque})`);
// Requests for the assistant in the session, and its answers, stay with the run.
process.env.PEDIDOS = `${dir}/pedidos`;
// --musica is a kind of music, or a file that says which track plays in each stretch.
const musica = valor('musica');
const musicaAMano = Boolean(musica?.endsWith('.json'));
if (musicaAMano && path.resolve(musica!) !== path.resolve(`${dir}/musica.json`)) copyFileSync(musica!, `${dir}/musica.json`);
else if (musica && !musicaAMano && !MODOS.includes(musica as Modo)) throw new Error(`música desconocida: ${musica}; hay: ${MODOS.join(', ')}, o un archivo .json`);
const ctx: Ctx = {nombre, dir, pub, perfil: valor('llm') ?? perfilPorDefecto(), log: reloj, voz, imagenes, aMano: {direccion: Boolean(valor('direccion')), planos: Boolean(valor('planos')), estilo: estiloAMano, musica: musicaAMano}, estilo: estiloAMano ? undefined : (estilo as PresetId | undefined), musica: musicaAMano ? undefined : (musica as Modo | undefined), tema: valor('tema'), fuentes: valor('fuentes'), segundos};

const leer = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);

// Real numbers once earlier steps exist; otherwise the length asked for, a cut every 2.5 s and a new picture every third shot.
const supuestos = (): Supuestos => {
	const w = leer(`${dir}/palabras.json`);
	const p = leer(`${dir}/pelicula.json`);
	const guion = existsSync(`${dir}/guion.md`) ? readGuion(readFileSync(`${dir}/guion.md`, 'utf8')).narration.split(/\s+/).filter(Boolean).length : Math.round(segundos * PALABRAS_POR_SEGUNDO);
	const palabras = w?.words.length ?? guion;
	const dura = w?.duration ?? palabras / PALABRAS_POR_SEGUNDO;
	const planos = p?.planos.length ?? Math.round(dura / 2.5);
	const cuantas = p ? new Set([p.ambiente, ...p.planos.map((x: {imagen?: string | null}) => x.imagen)].filter(Boolean)).size : Math.min(24, Math.round(planos * 0.35) + 1);
	// Measured for the local model (Tinta runs); the other two are rough until a full run measures them.
	const segundosPorImagen = {local: 32, nube: 12, stock: 4, placas: 0}[ctx.imagenes[0]];
	return {segundos: dura, palabras, planos, imagenes: ctx.imagenes[0] === 'placas' ? 0 : cuantas, segundosPorImagen};
};

principal(() => orquestar({pasos: PASOS, ctx, args, supuestos, resumen: (s) => `${nombre}: ~${s.segundos.toFixed(0)} s de video, ${s.palabras} palabras, ~${s.planos} planos, ${s.imagenes} imágenes (${imagenes.join(' > ')}), voz ${voz}`}));
