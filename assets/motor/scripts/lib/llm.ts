// One call for every step, whichever model answers it. config/models.json picks the model per step.
// Besides cloud APIs and a local server, a step can be answered by the assistant running the session (provider
// `sesion`): the request is left as a file, the run stops, and the same command picks the answer up when it exists.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {claveDe, variable} from './claves';
import {correr, local} from './local';
import {preferencias} from './preferencias';

// OpenRouter routing: sort 'price' picks the cheapest provider that supports every parameter; only pins providers and never falls back.
// json 'object' asks for plain JSON and sends the shape in the prompt, for providers without strict schemas.
type Target = {provider: 'local' | 'openrouter' | 'deepseek' | 'sesion'; model: string; thinking?: 'minimal' | 'low' | 'high' | 'off'; sort?: 'price'; only?: string[]; json?: 'object'; step?: string};

const config = JSON.parse(readFileSync('config/models.json', 'utf8'));
// Any server that speaks the OpenAI chat API: LM Studio, Ollama, llama.cpp.
const LOCAL = variable('LM_BASE') ?? local().llm?.url ?? 'http://127.0.0.1:1234/v1';
const OPENROUTER = 'https://openrouter.ai/api/v1';
const DEEPSEEK = 'https://api.deepseek.com';

// The profile a flow uses when the run names none: the one this machine prefers, or the assistant in the session,
// which needs no key.
export const perfilPorDefecto = () => variable('LLM_PERFIL') ?? preferencias().llm ?? local().llm?.perfil ?? 'sesion';

export const targetFor = (profile: string, step: string): Target => {
	const p = config.profiles[profile];
	if (!p) throw new Error(`perfil desconocido: ${profile}`);
	return {...(p[step] ?? p.default), step};
};

let loaded: string | null = null;

// A GPU that fits one big model at a time swaps it between steps, if this machine says how (config/local.json).
const orden = (c: string[] | undefined, modelo = '') => {
	if (!c) return;
	try {
		correr(c.map((x) => x.replace('{modelo}', modelo)), [], {stdio: 'ignore'});
	} catch {
		// a server that is not running has nothing to swap
	}
};

const ensureLocal = (model: string) => {
	if (loaded === model || !local().llm?.cargar) return;
	orden(local().llm?.descargar);
	orden(local().llm?.cargar, model);
	loaded = model;
};

export const releaseLocal = () => {
	if (loaded) orden(local().llm?.descargar);
	loaded = null;
};

// A model left by another run would starve voice and images of GPU memory.
export const clearLocal = () => {
	orden(local().llm?.descargar);
	loaded = null;
};

const chatLocal = async (body: object) => {
	const res = await fetch(`${LOCAL}/chat/completions`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...body, stream: true})});
	if (!res.ok || !res.body) throw new Error(await res.text());
	let content = '';
	let reasoning = '';
	let buffer = '';
	for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
		buffer += Buffer.from(chunk).toString('utf8');
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
			const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta;
			content += delta?.content ?? '';
			reasoning += delta?.reasoning_content ?? delta?.reasoning ?? '';
		}
	}
	// LM Studio can route constrained output of thinking models to the reasoning channel.
	return content || reasoning;
};

export const openRouterKey = () => claveDe('openrouter', 'El LLM por OpenRouter');
export const deepSeekKey = () => claveDe('deepseek', 'El LLM de DeepSeek');

export const deepSeekBalance = async () => {
	const res = await fetch(`${DEEPSEEK}/user/balance`, {headers: {authorization: `Bearer ${deepSeekKey()}`}});
	if (!res.ok) throw new Error(`DeepSeek respondió ${res.status}`);
	const {is_available: available, balance_infos: infos} = (await res.json()) as {is_available: boolean; balance_infos: {total_balance: string}[]};
	return {available, dollars: Number(infos[0]?.total_balance ?? 0)};
};

type StepSpend = {calls: number; dollars: number; output: number; thinking: number};

export const spend = {calls: 0, tokens: 0, dollars: 0, input: 0, cached: 0, output: 0, thinking: 0, steps: {} as Record<string, StepSpend>};

// Retrying cannot fix an empty account, so a run stops here and keeps what it finished.
export const outOfCredit = (e: unknown) => /requires more credits|insufficient balance/i.test(String(e));

// DeepSeek charges double during these UTC hours, Monday to Friday.
const isPeak = (now = new Date()) => {
	const day = now.getUTCDay();
	const hour = now.getUTCHours();
	return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
};

type Usage = {
	total_tokens?: number;
	prompt_tokens?: number;
	completion_tokens?: number;
	cost?: number;
	prompt_cache_hit_tokens?: number;
	prompt_cache_miss_tokens?: number;
	prompt_tokens_details?: {cached_tokens?: number};
	completion_tokens_details?: {reasoning_tokens?: number};
};

const priceOf = (target: Target, u: Usage) => {
	if (target.provider !== 'deepseek') return u.cost ?? 0;
	const price = config.prices[target.model] as {hit: number; miss: number; out: number; peak: number} | undefined;
	if (!price) throw new Error(`Falta el precio de ${target.model} en config/models.json`);
	const dollars = ((u.prompt_cache_hit_tokens ?? 0) * price.hit + (u.prompt_cache_miss_tokens ?? 0) * price.miss + (u.completion_tokens ?? 0) * price.out) / 1e6;
	return isPeak() ? dollars * price.peak : dollars;
};

const record = (target: Target, u: Usage) => {
	const dollars = priceOf(target, u);
	const thinking = u.completion_tokens_details?.reasoning_tokens ?? 0;
	spend.calls += 1;
	spend.tokens += u.total_tokens ?? 0;
	spend.dollars += dollars;
	spend.input += u.prompt_tokens ?? 0;
	spend.cached += u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
	spend.output += u.completion_tokens ?? 0;
	spend.thinking += thinking;
	const step = (spend.steps[target.step ?? 'otro'] ??= {calls: 0, dollars: 0, output: 0, thinking: 0});
	step.calls += 1;
	step.dollars += dollars;
	step.output += u.completion_tokens ?? 0;
	step.thinking += thinking;
};

const STALL = 90000;

// Long answers stream: a silent connection is cut and retried instead of waiting forever.
const streamChat = async (url: string, key: string, body: object) => {
	const stall = new AbortController();
	let timer = setTimeout(() => stall.abort(), STALL);
	const res = await fetch(url, {
		method: 'POST',
		signal: stall.signal,
		headers: {'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-title': 'guion-video'},
		body: JSON.stringify({...body, stream: true}),
	});
	if (!res.ok || !res.body) return {status: res.status, text: await res.text()};
	let content = '';
	let finish = '';
	let usage: Usage = {};
	let buffer = '';
	for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
		clearTimeout(timer);
		timer = setTimeout(() => stall.abort(), STALL);
		buffer += Buffer.from(chunk).toString('utf8');
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
			const data = JSON.parse(line.slice(6));
			if (data.error) return {status: 500, text: JSON.stringify(data.error)};
			const choice = data.choices?.[0];
			content += choice?.delta?.content ?? '';
			finish = choice?.finish_reason ?? finish;
			usage = data.usage ?? usage;
		}
	}
	clearTimeout(timer);
	return {status: 200, content, finish, usage};
};

const send = (target: Target, body: object) =>
	target.provider === 'deepseek'
		? streamChat(`${DEEPSEEK}/chat/completions`, deepSeekKey(), {...body, stream_options: {include_usage: true}})
		: // Only providers that honor the JSON schema may serve the request.
			streamChat(`${OPENROUTER}/chat/completions`, openRouterKey(), {...body, provider: {require_parameters: true, ...(target.sort ? {sort: target.sort} : {}), ...(target.only ? {order: target.only, allow_fallbacks: false} : {})}, usage: {include: true}});

const chatCloud = async (target: Target, body: object) => {
	for (let attempt = 0; ; attempt++) {
		const answer = await send(target, body).catch((e) => ({status: 503, text: String(e)}));
		if ('text' in answer) {
			if ((answer.status === 429 || answer.status >= 500) && attempt < 4) {
				await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
				continue;
			}
			throw new Error((answer.text ?? '').slice(0, 400));
		}
		record(target, answer.usage ?? {});
		if (!answer.content) throw new Error(`Respuesta vacía (${answer.finish || 'sin motivo'})`);
		return answer.content;
	}
};

type AskOptions = {temperature?: number; maxTokens?: number; attempts?: number; check?: (value: unknown) => string[]; image?: string};

const userContent = (text: string, image?: string) => {
	if (!image) return text;
	const data = readFileSync(image).toString('base64');
	return [
		{type: 'text', text},
		{type: 'image_url', image_url: {url: `data:image/jpeg;base64,${data}`}},
	];
};

const chatFor = (target: Target) => (target.provider === 'local' ? chatLocal : (body: object) => chatCloud(target, body));

// ---------------------------------------------------------------- the assistant in the session answers

// Thrown when a step waits for an answer written by hand. Not a failure: the run stops, and repeating the same
// command continues from here.
export class PedidoPendiente extends Error {
	constructor(public pedido: string, public respuesta: string, motivo: string) {
		super(`${motivo}\n  1. Lee ${pedido}\n  2. Escribe la respuesta en ${respuesta}\n  3. Repite el mismo comando`);
	}
}

// Where requests and answers live: the run's own folder, set by each flow.
const carpetaPedidos = () => process.env.PEDIDOS ?? 'out/pedidos';

// The same request always has the same name, so an answer written once is found by every rerun.
const pedidoDe = (target: Target, partes: string[], ext: string) => {
	const id = `${(target.step ?? 'paso').replace(/[^a-z0-9_-]/gi, '_')}-${createHash('sha1').update(partes.join('\u0000')).digest('hex').slice(0, 10)}`;
	const dir = carpetaPedidos();
	mkdirSync(dir, {recursive: true});
	return {pedido: path.join(dir, `${id}.pedido.md`), respuesta: path.join(dir, `${id}.respuesta.${ext}`), rechazada: (n: number) => path.join(dir, `${id}.rechazada-${n}.${ext}`)};
};

const escribirPedido = (archivo: string, {paso, respuesta, formato, system, user, image, shape, correcciones}: {paso: string; respuesta: string; formato: string; system: string; user: string; image?: string; shape?: unknown; correcciones?: string}) =>
	writeFileSync(
		archivo,
		[
			`# Pedido: ${paso}`,
			`Escribe la respuesta en \`${respuesta}\` y repite el comando que dejó este pedido. ${formato}`,
			...(correcciones ? [`## Correcciones a tu respuesta anterior\n\n${correcciones}`] : []),
			`## Instrucciones\n\n${system}`,
			`## Entrada\n\n${user}`,
			...(image ? [`## Imagen\n\nMira \`${image}\` antes de responder.`] : []),
			...(shape ? [`## Esquema que debe cumplir el JSON\n\n\`\`\`json\n${JSON.stringify(shape, null, 1)}\n\`\`\``] : []),
		].join('\n\n') + '\n',
	);

const cuantasRechazadas = (rechazada: (n: number) => string) => {
	let n = 0;
	while (existsSync(rechazada(n + 1))) n++;
	return n;
};

// Thinking is billed as output, so each step says how much of it is worth paying for.
const thinkingFor = ({provider, thinking}: Target) => {
	// DeepSeek has no minimal effort: it treats it as low.
	if (provider === 'deepseek') return thinking === 'off' ? {thinking: {type: 'disabled'}} : {thinking: {type: 'enabled'}, reasoning_effort: thinking === 'minimal' ? 'low' : (thinking ?? 'high')};
	if (provider === 'openrouter' && thinking) return {reasoning: {effort: thinking === 'off' ? 'none' : thinking}};
	return {};
};

const TOKEN_ROOM = {local: 1, openrouter: 3, deepseek: 2, sesion: 1};

// Plain answer for work that is not JSON, such as code.
export const askText = async (target: Target, system: string, user: string, {temperature = 0.4, maxTokens = 7000}: AskOptions = {}) => {
	if (target.provider === 'sesion') {
		const f = pedidoDe(target, [system, user], 'txt');
		if (existsSync(f.respuesta)) return readFileSync(f.respuesta, 'utf8');
		escribirPedido(f.pedido, {paso: target.step ?? 'paso', respuesta: f.respuesta, formato: 'La respuesta es texto plano: solo lo que se pide, sin explicación alrededor.', system, user});
		throw new PedidoPendiente(f.pedido, f.respuesta, `El paso "${target.step ?? 'paso'}" espera una respuesta de la sesión.`);
	}
	if (target.provider === 'local') ensureLocal(target.model);
	return chatFor(target)({
		model: target.model,
		temperature,
		max_tokens: maxTokens * TOKEN_ROOM[target.provider],
		// On OpenRouter thinking has a ceiling, or it can use the whole answer and leave nothing written.
		...(target.provider === 'openrouter' && !target.thinking ? {reasoning: {max_tokens: maxTokens}} : thinkingFor(target)),
		messages: [
			{role: 'system', content: system},
			{role: 'user', content: user},
		],
	});
};

// Valid JSON is not enough: `check` returns what is wrong, and the model gets it back to fix.
export const askJson = async <T>(target: Target, schema: z.ZodType<T>, system: string, user: string, {temperature = 0.3, maxTokens = 7000, attempts = 3, check, image}: AskOptions = {}): Promise<T> => {
	const shape = z.toJSONSchema(schema, {target: 'draft-7'});
	if (target.provider === 'sesion') {
		const paso = target.step ?? 'paso';
		const f = pedidoDe(target, [system, user, JSON.stringify(shape), image ?? ''], 'json');
		const pedir = (motivo: string, correcciones?: string) => {
			escribirPedido(f.pedido, {paso, respuesta: f.respuesta, formato: 'La respuesta es solo JSON que cumpla el esquema del final. El código la revisa: si algo no cuadra, este archivo dirá qué corregir.', system, user, image, shape, correcciones});
			return new PedidoPendiente(f.pedido, f.respuesta, motivo);
		};
		if (!existsSync(f.respuesta)) throw pedir(`El paso "${paso}" espera una respuesta de la sesión.`);
		// The answer goes through the same checks as a model's. A rejected one is set aside, and the request says why.
		let issues: string[];
		try {
			const raw = readFileSync(f.respuesta, 'utf8');
			const value = schema.parse(JSON.parse(raw));
			issues = check?.(value) ?? [];
			if (!issues.length) return value;
		} catch (e) {
			issues = [`JSON inválido: ${String(e).slice(0, 600)}`];
		}
		renameSync(f.respuesta, f.rechazada(cuantasRechazadas(f.rechazada) + 1));
		throw pedir(`La respuesta del paso "${paso}" fue rechazada: ${issues.slice(0, 3).join('; ').slice(0, 300)}`, issues.map((x) => `- ${x}`).join('\n'));
	}
	if (target.provider === 'local') ensureLocal(target.model);
	const chat = chatFor(target);
	// Some APIs only promise valid JSON, so the shape travels in the prompt and zod still checks the answer.
	const direct = target.provider === 'deepseek' || target.json === 'object';
	const format = direct ? {type: 'json_object'} : {type: 'json_schema', json_schema: {name: 'out', strict: true, schema: shape}};
	const instructions = direct ? `${system}\n\nResponde solo con JSON que cumpla este esquema:\n${JSON.stringify(shape)}` : system;
	let feedback = '';
	let last = '';
	for (let i = 0; i < attempts; i++) {
		try {
			const raw = await chat({
				model: target.model,
				temperature,
				// DeepSeek spends part of the budget thinking before it writes the answer.
				max_tokens: target.provider === 'local' ? maxTokens : maxTokens * 4,
				...thinkingFor(target),
				messages: [
					{role: 'system', content: instructions},
					{role: 'user', content: userContent(feedback ? `${user}\n\nTu respuesta anterior fue rechazada. Corrige esto:\n${feedback}` : user, image)},
				],
				response_format: format,
			});
			const value = schema.parse(JSON.parse(raw));
			// A strict schema can make a model answer with valid but empty placeholders.
			const filler = raw.match(/:\s*"\s*(\.{2,}|…)\s*"/g)?.length ?? 0;
			const issues = [...(filler ? [`${filler} campos traen relleno en vez de contenido real`] : []), ...(check?.(value) ?? [])];
			if (!issues.length) return value;
			last = issues.join('; ');
			feedback = issues.map((x) => `- ${x}`).join('\n');
		} catch (e) {
			last = String(e).slice(0, 400);
			feedback = `- JSON inválido: ${last}`;
		}
		console.log(`   intento ${i + 1} rechazado: ${last.slice(0, 160)}`);
	}
	throw new Error(`Sin respuesta válida tras ${attempts} intentos: ${last}`);
};
