// Where narration, pictures and music come from. config/medios.json holds the defaults and every provider's settings;
// a flow can override the provider per run. `auto` picks from what this machine and its keys allow, and says why.
// Keys never live in that file: they come from the environment or .env (scripts/lib/claves.ts).
import {readFileSync} from 'node:fs';
import {clave, CLAVES, variable} from './claves';
import {local} from './local';
import {vozDelSistema} from './voz_sistema';

// local: this machine's own command (config/local.json). sistema: the voice the operating system ships.
// borrador: no voice, estimated word times.
export const PROVEEDORES_VOZ = ['local', 'elevenlabs', 'sistema', 'borrador'] as const;
export type ProveedorVoz = (typeof PROVEEDORES_VOZ)[number];
// stock: free photographs. nube: generated in the cloud. placas: no pictures, labelled plates instead.
export const PROVEEDORES_IMAGEN = ['local', 'stock', 'nube', 'placas'] as const;
export type ProveedorImagen = (typeof PROVEEDORES_IMAGEN)[number];

export type Medios = {
	voz: {
		proveedor: ProveedorVoz | 'auto';
		// voice_id empty: the first voice of the account that speaks Spanish. ELEVENLABS_VOICE_ID in the environment wins.
		elevenlabs: {voice_id: string; model_id: string; output_format: string; stability: number; similarity_boost: number; style: number; speed: number};
	};
	imagen: {
		// Tried in order: a picture one provider cannot give goes to the next. ["auto"] picks the chain.
		proveedores: (ProveedorImagen | 'auto')[];
		stock: {fuentes: ('pexels' | 'commons' | 'openverse')[]; licencias_openverse: string; ancho_minimo: number};
		// Cloud pictures come from fal: FLUX schnell, or another of its text-to-image models. dolares_por_imagen: fal does
		// not say what a picture cost, so the report counts this estimate.
		nube: {servicio: 'fal'; modelo: string; dolares_por_imagen: number};
	};
	// Background music: tracks of kit/biblioteca/musica, the synthesized bed, or none; and how loud it plays.
	musica: {modo: 'pistas' | 'sintetizada' | 'no'; nivel: number};
};

export const medios = (): Medios => JSON.parse(readFileSync('config/medios.json', 'utf8'));

// "stock,nube" on the command line, or the list in the config.
export const leerProveedores = <T extends string>(texto: string | undefined, validos: readonly T[], porDefecto: T[]): T[] => {
	if (!texto) return porDefecto;
	const lista = texto.split(',').map((x) => x.trim()).filter(Boolean);
	const malos = lista.filter((x) => !validos.includes(x as T));
	if (malos.length) throw new Error(`proveedor desconocido: ${malos.join(', ')}; hay: ${validos.join(', ')}`);
	return lista as T[];
};

// ---------------------------------------------------------------- auto: what this machine and its keys allow

export type Eleccion<T> = {proveedor: T; porque: string};

// Voice: this machine's own model, then ElevenLabs if its key is here, then the voice of the operating system, and
// only then no voice at all, said out loud.
export const resolverVoz = (pedido: ProveedorVoz | 'auto'): Eleccion<ProveedorVoz> => {
	if (pedido !== 'auto') return {proveedor: pedido, porque: 'pedido'};
	if (local().voz) return {proveedor: 'local', porque: 'esta máquina tiene su propio comando de voz'};
	if (clave('elevenlabs')) return {proveedor: 'elevenlabs', porque: `hay ${CLAVES.elevenlabs}`};
	const sistema = vozDelSistema();
	if (sistema) return {proveedor: 'sistema', porque: `voz "${sistema.voz}" de ${sistema.so}: no hay ${CLAVES.elevenlabs} ni comando de voz local; con esa clave la voz mejora`};
	return {proveedor: 'borrador', porque: `sin voz: no hay ${CLAVES.elevenlabs}, comando de voz local ni voz en español en este sistema${process.platform === 'linux' ? ' (en Linux se puede instalar Piper: ver docs/proveedores.md)' : ''}; el video sale mudo, con los tiempos estimados`};
};

// The fal model that draws cloud pictures, what one costs, and whether FAL_KEY is here.
export const nubeImagen = (): {modelo: string; dolares: number; hayClave: boolean} => {
	// Configs written before pictures moved to fal only name an OpenRouter model ({servicio: 'openrouter' or 'auto',
	// modelo, fal?}): their fal part is used, or FLUX schnell.
	const n = medios().imagen.nube as Partial<Medios['imagen']['nube']> & {servicio?: string; fal?: {modelo?: string; dolares_por_imagen?: number}};
	const propia = n.servicio === 'fal';
	return {
		modelo: (propia ? n.modelo : n.fal?.modelo) ?? 'fal-ai/flux/schnell',
		dolares: (propia ? n.dolares_por_imagen : n.fal?.dolares_por_imagen) ?? 0.003,
		hayClave: Boolean(clave('fal')),
	};
};

// Pictures: this machine's own model alone; otherwise generated in the cloud if FAL_KEY is here, with free
// photographs behind for what the cloud does not give; with no key, free photographs only.
export const resolverImagenes = (pedido: (ProveedorImagen | 'auto')[]): Eleccion<ProveedorImagen[]> => {
	if (!pedido.includes('auto')) return {proveedor: pedido as ProveedorImagen[], porque: 'pedido'};
	if (local().imagen) return {proveedor: ['local'], porque: 'esta máquina tiene su propio comando de imágenes'};
	const nube = nubeImagen();
	if (nube.hayClave) return {proveedor: ['nube', 'stock'], porque: `hay ${CLAVES.fal}: ${nube.modelo} en fal; lo que no salga, de fotos libres`};
	return {proveedor: ['stock'], porque: `fotos libres: no hay ${CLAVES.fal} ni comando de imágenes local${clave('pexels') ? '' : `; con ${CLAVES.pexels} las fotos mejoran`}`};
};

// The ElevenLabs voice this run asks for, if it names one.
export const vozElevenlabs = () => variable('ELEVENLABS_VOICE_ID') ?? (medios().voz.elevenlabs.voice_id || null);
