// Guion -> checkable claims -> evidence -> verdicts with verbatim quotes. A quote that is not in the page is discarded.
// usage: tsx scripts/factcheck.ts [--model id] [--base url] [--strict] [--guion path]
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {z} from 'zod';

const flag = (name: string, fallback: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : fallback;
};
const MODEL = flag('model', 'google/gemma-4-31b');
const BASE = flag('base', 'http://127.0.0.1:1234/v1');
const GUION = flag('guion', 'data/guion.md');
const STRICT = process.argv.includes('--strict');
const EMBED = 'text-embedding-nomic-embed-text-v1.5';
const UA = 'guion-video-factcheck/0.1';
const CACHE = 'data/facts/cache';
mkdirSync(CACHE, {recursive: true});

type Source = {id: string; url: string; title: string; domain: string; tier: number; text: string};
type Passage = {source: Source; text: string};

const ClaimsSchema = z.object({
	claims: z
		.array(
			z.object({
				text: z.string(),
				kind: z.enum(['numero', 'fecha', 'evento', 'mecanismo']),
				numbers: z.array(z.string()),
				queries_es: z.array(z.string()).min(1).max(3),
				queries_en: z.array(z.string()).min(1).max(2),
			}),
		)
		.min(1)
		.max(16),
});

const VerdictSchema = z.object({
	verdict: z.enum(['apoya', 'contradice', 'parcial', 'sin_evidencia']),
	explanation: z.string(),
	suggested_rewrite: z.string().nullable(),
	evidence: z
		.array(z.object({source: z.string(), quote: z.string(), stance: z.enum(['apoya', 'contradice'])}))
		.max(6),
});

const llm = async <T>(schema: z.ZodType<T>, system: string, user: string, maxTokens = 3000): Promise<T> => {
	const res = await fetch(`${BASE}/chat/completions`, {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify({
			model: MODEL,
			temperature: 0.1,
			max_tokens: maxTokens,
			stream: true,
			messages: [
				{role: 'system', content: system},
				{role: 'user', content: user},
			],
			response_format: {type: 'json_schema', json_schema: {name: 'out', strict: true, schema: z.toJSONSchema(schema, {target: 'draft-7'})}},
		}),
	});
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
	return schema.parse(JSON.parse(content || reasoning));
};

const embed = async (input: string[]): Promise<number[][]> => {
	const res = await fetch(`${BASE}/embeddings`, {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify({model: EMBED, input}),
	});
	const body = await res.json();
	return body.data.map((d: {embedding: number[]}) => d.embedding);
};

const cached = async (key: string, fetcher: () => Promise<string>) => {
	const file = `${CACHE}/${createHash('sha1').update(key).digest('hex')}.txt`;
	if (existsSync(file)) return readFileSync(file, 'utf8');
	const text = await fetcher();
	writeFileSync(file, text);
	return text;
};

const getText = (url: string) =>
	cached(url, async () => {
		const res = await fetch(url, {headers: {'user-agent': UA}, signal: AbortSignal.timeout(20000)});
		if (!res.ok) throw new Error(`${res.status} ${url}`);
		return res.text();
	});

const TIER1 = /(gob\.mx|\.edu|unam\.mx|\.ac\.|doi\.org|icevirtuallibrary|openalex|scielo|smie\.org|iingen|ssn\.unam|cenapred|asce\.org|nist\.gov)/;
const TIER3 = /(sopitas|chilango|tvazteca|azteca|aztecajalisco|scribd|facebook|tiktok|pinterest|blog)/;
const tierOf = (domain: string) => (TIER1.test(domain) ? 1 : /wikipedia/.test(domain) ? 2 : TIER3.test(domain) ? 4 : 3);

const stripHtml = (html: string) =>
	html
		.replace(/<(script|style|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#\d+;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const sources = new Map<string, Source>();
const addSource = (url: string, title: string, text: string) => {
	if (sources.has(url) || text.length < 200) return;
	const domain = new URL(url).hostname.replace(/^www\./, '');
	sources.set(url, {id: `S${sources.size + 1}`, url, title, domain, tier: tierOf(domain), text});
};

const fromWikipedia = async (lang: string, query: string) => {
	const search = JSON.parse(await getText(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(query)}`));
	for (const hit of search.query.search) {
		const title: string = hit.title;
		const page = JSON.parse(await getText(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`));
		const text = (Object.values(page.query.pages)[0] as {extract?: string}).extract ?? '';
		addSource(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`, title, text);
	}
};

const fromOpenAlex = async (query: string) => {
	const data = JSON.parse(await getText(`https://api.openalex.org/works?per-page=5&search=${encodeURIComponent(query)}`));
	for (const work of data.results ?? []) {
		const index = work.abstract_inverted_index as Record<string, number[]> | null;
		if (!index) continue;
		const words: string[] = [];
		Object.entries(index).forEach(([w, positions]) => positions.forEach((p) => (words[p] = w)));
		addSource(work.doi ?? work.id, work.title ?? 'OpenAlex', words.join(' '));
	}
};

const fromUrls = async () => {
	if (!existsSync('data/fuentes.txt')) return;
	for (const url of readFileSync('data/fuentes.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
		try {
			if (url.endsWith('.pdf')) {
				const text = await cached(url, async () => {
					const res = await fetch(url, {headers: {'user-agent': UA}, signal: AbortSignal.timeout(30000)});
					const file = `${CACHE}/tmp.pdf`;
					writeFileSync(file, Buffer.from(await res.arrayBuffer()));
					return execFileSync('pdftotext', ['-layout', file, '-'], {maxBuffer: 1 << 26}).toString();
				});
				addSource(url, url.split('/').pop() ?? url, text.replace(/\s+/g, ' '));
				continue;
			}
			const html = await getText(url);
			const title = /<title[^>]*>([^<]*)/i.exec(html)?.[1]?.trim() ?? url;
			addSource(url, title, stripHtml(html));
		} catch (e) {
			console.log('no se pudo leer', url, String(e).slice(0, 100));
		}
	}
};

const passagesOf = (s: Source): Passage[] => {
	const sentences = s.text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/);
	const out: Passage[] = [];
	for (let i = 0; i < sentences.length; i += 2) {
		const text = sentences.slice(i, i + 3).join(' ');
		if (text.length > 60) out.push({source: s, text});
	}
	return out;
};

const norm = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const cosine = (a: number[], b: number[]) => {
	let dot = 0;
	let na = 0;
	let nb = 0;
	a.forEach((v, i) => {
		dot += v * b[i];
		na += v * v;
		nb += b[i] * b[i];
	});
	return dot / Math.sqrt(na * nb);
};

const topPassages = async (claim: string, pool: Passage[], k: number) => {
	const words = norm(claim).split(' ').filter((w) => w.length > 3);
	const scored = pool
		.map((p) => {
			const n = norm(p.text);
			return {p, hits: words.filter((w) => n.includes(w)).length};
		})
		.filter((x) => x.hits > 0)
		.sort((a, b) => b.hits - a.hits)
		.slice(0, 80)
		.map((x) => x.p);
	if (!scored.length) return [];
	const vectors = await embed([`search_query: ${claim}`, ...scored.map((p) => `search_document: ${p.text.slice(0, 900)}`)]);
	const [query, ...docs] = vectors;
	const ranked = scored.map((p, i) => ({p, score: cosine(query, docs[i])})).sort((a, b) => b.score - a.score);
	// Several voices beat many quotes from one page.
	const perSource = new Map<string, number>();
	const picked: Passage[] = [];
	for (const {p} of ranked) {
		const n = perSource.get(p.source.id) ?? 0;
		if (n >= 2) continue;
		perSource.set(p.source.id, n + 1);
		picked.push(p);
		if (picked.length === k) break;
	}
	return picked;
};

const SYSTEM_CLAIMS = `Extraes afirmaciones verificables de un guion de video en español.
Incluye toda fecha, número, cantidad, causa o mecanismo presentado como hecho. Convierte números escritos en cifras dentro de numbers.
Cada afirmación debe entenderse sola, con sujeto explícito y sin pronombres. Genera búsquedas en español e inglés. Devuelve solo JSON.`;

const SYSTEM_JUDGE = `Eres verificador de hechos estricto. Decides si los pasajes apoyan una afirmación.
Reglas:
- Usa solo los pasajes dados, nunca tu memoria.
- Cada quote debe copiarse literalmente de un pasaje, con 5 a 30 palabras.
- "apoya": al menos un pasaje afirma lo mismo. Un dato cercano no basta para números exactos.
- "contradice": algún pasaje afirma algo incompatible. Reporta también los que apoyan.
- "parcial": solo parte de la afirmación tiene respaldo.
- "sin_evidencia": ningún pasaje trata el punto.
- Si no es "apoya", suggested_rewrite propone una frase hablada en español que sí respalden los pasajes. Si es "apoya", null.
Devuelve solo JSON.`;

const main = async () => {
	const guion = readFileSync(GUION, 'utf8').trim();
	console.log('extrayendo afirmaciones');
	const {claims} = await llm(ClaimsSchema, SYSTEM_CLAIMS, `Guion:\n${guion}`);
	console.log(claims.length, 'afirmaciones');

	await fromUrls();
	for (const claim of claims) {
		for (const q of claim.queries_es) await fromWikipedia('es', q).catch(() => undefined);
		for (const q of claim.queries_en) {
			await fromWikipedia('en', q).catch(() => undefined);
			await fromOpenAlex(q).catch(() => undefined);
		}
	}
	const pool = [...sources.values()].flatMap(passagesOf);
	console.log(sources.size, 'fuentes,', pool.length, 'pasajes');

	const results = [];
	for (const claim of claims) {
		const passages = await topPassages(claim.text, pool, 9);
		const context = passages.map((p) => `[${p.source.id} | ${p.source.domain}] ${p.text.slice(0, 900)}`).join('\n\n');
		const verdict = passages.length
			? await llm(VerdictSchema, SYSTEM_JUDGE, `Afirmación: ${claim.text}\n\nPasajes:\n${context}`)
			: {verdict: 'sin_evidencia' as const, explanation: 'Sin pasajes relevantes.', suggested_rewrite: null, evidence: []};

		// The model's word is not evidence: keep only quotes that really exist in the cited source.
		const verified = verdict.evidence.flatMap((e) => {
			const id = /S\d+/.exec(e.source)?.[0];
			const s = [...sources.values()].find((x) => x.id === id);
			return s && norm(s.text).includes(norm(e.quote)) ? [{...e, url: s.url, domain: s.domain, tier: s.tier}] : [];
		});
		const dropped = verdict.evidence.length - verified.length;
		const support = verified.filter((e) => e.stance === 'apoya');
		const against = verified.filter((e) => e.stance === 'contradice');
		const domains = new Set(support.map((e) => e.domain));
		const numbersOk = claim.numbers.every((n) => support.some((e) => norm(e.quote).includes(norm(n))));
		const strong = domains.size >= 2 || support.some((e) => e.tier === 1);
		const status = against.length
			? 'CONFLICTO'
			: verdict.verdict === 'apoya' && support.length && numbersOk && strong
				? 'CONFIRMADO'
				: support.length
					? 'DEBIL'
					: 'SIN_RESPALDO';
		const row = {...claim, status, verdict: verdict.verdict, explanation: verdict.explanation, rewrite: verdict.suggested_rewrite, evidence: verified, droppedQuotes: dropped};
		results.push(row);
		console.log(status.padEnd(13), claim.text.slice(0, 90));
	}

	mkdirSync('data', {recursive: true});
	writeFileSync('data/facts.json', JSON.stringify(results, null, 2));
	const icon: Record<string, string> = {CONFIRMADO: '✅', DEBIL: '🟡', CONFLICTO: '🔴', SIN_RESPALDO: '⚪'};
	const md = results
		.map((r) => {
			const ev = r.evidence.map((e) => `  - ${e.stance === 'apoya' ? '+' : '−'} "${e.quote}" — [${e.domain}](${e.url})`).join('\n');
			return `${icon[r.status]} **${r.status}**: ${r.text}\n  ${r.explanation}${r.rewrite ? `\n  Propuesta: ${r.rewrite}` : ''}\n${ev}`;
		})
		.join('\n\n');
	writeFileSync('data/facts.md', `# Verificación del guion\n\n${md}\n`);
	const blocked = results.filter((r) => r.status === 'CONFLICTO' || r.status === 'SIN_RESPALDO');
	console.log(`${results.length - blocked.length}/${results.length} sin bloqueo`);
	if (STRICT && blocked.length) process.exit(2);
};

main();
