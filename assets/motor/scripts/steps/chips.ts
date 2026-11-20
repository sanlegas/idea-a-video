// On-screen text in three steps: a copywriter proposes, fixed rules filter, an editor picks.
import {z} from 'zod';
import type {Storyboard} from '../../src/schema';
import {spanishNumbers} from '../../src/spanishNumbers';
import {askJson, targetFor} from '../lib/llm';
import type {Step} from './types';

const MAX_CHIPS = 5;
const WriterSchema = z.object({beats: z.array(z.object({beat: z.number(), candidates: z.array(z.string()).min(3).max(8)}))});
const EditorSchema = z.object({picks: z.array(z.object({beat: z.number(), text: z.string(), why: z.string()}))});

const SYSTEM_WRITER = `Escribes el texto corto en pantalla de videos explicativos verticales en español de México.
El texto acompaña a la voz: no resume, provoca. Debe hacer que alguien deje de deslizar.

Fórmulas que funcionan:
- Dato duro que sorprende: "70 toneladas", "Miles de volts"
- Pregunta que abre curiosidad: "¿Por qué 11?", "¿Y si pasa despacito?"
- Contraste en pocas palabras: "Área, no peso", "A 1 km: trenes. A 10: ninguno"
- Tensión incompleta: "33 metros de pie… ¿cómo?"

Prohibido:
- Etiquetas de enciclopedia: "Colapso estructural", "Diseño resiliente", "Ingeniería avanzada", "Lago antiguo", "Suelo firme"
- Palabras abstractas o de folleto: resiliente, estructural, innovador, solución, clave, ingeniería, diseño, impacto, fenómeno
- Copiar una frase completa de la voz
- Cualquier dato, número o nombre que no esté en el guion
- Exagerar lo que dice el guion: intacta, siempre, nunca, todos, perfecta

Cada texto: 2 a 6 palabras, máximo 30 caracteres. Para cada beat escribe 6 opciones muy distintas: al menos un dato con número del guion si lo hay, una pregunta y un contraste con coma, por ejemplo "Se dobla, no rompe". Devuelve solo JSON.`;

const SYSTEM_EDITOR = `Eres editor jefe de videos virales en español de México. Eliges textos en pantalla.
Escoge como máximo ${MAX_CHIPS} textos para todo el video, nunca en beats consecutivos. El beat 0 siempre lleva texto: es el gancho y debe provocar curiosidad en menos de un segundo. Luego prioriza giro y cierre.
Prefiere el que más curiosidad o sorpresa provoque y se entienda en menos de un segundo.
Cada opción trae su tipo: dato, contraste o gancho. Mezcla tipos: si existen, usa al menos un dato y un contraste.
Copia solo el texto de la opción, sin la etiqueta entre corchetes.
Usa el texto exacto de una opción dada. Devuelve solo JSON.`;

// Absolutes claim more than the script does, however good they sound.
const ABSOLUTE = /\b(intact[oa]s?|ilesa?|siempre|nunca|jam[aá]s|tod[oa]s?|ning[uú]n[oa]?|nadie|nada|perfect[oa]|indestructible|invencible|milagro|imposible|eterna?)\b/i;
const BANNED = /\b(resiliente|resiliencia|estructural|innovador|innovaci[oó]n|soluci[oó]n|clave|ingenier[ií]a|dise[nñ]o|impacto|fen[oó]meno|avanzad[oa]|moderno|tecnolog[ií]a|sistema|proceso)\b/i;

const normalize = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9ñ ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const review = (text: string, guion: string, allowedNumbers: Set<number>, beatText: string) => {
	const problems: string[] = [];
	let score = 0;
	if (text.length > 30) problems.push('largo');
	const words = text.split(/\s+/).length;
	if (words < 2 && !/\d/.test(text)) problems.push('corto');
	if (words > 6) problems.push('muchas palabras');
	if (BANNED.test(text)) problems.push('abstracto');
	if (ABSOLUTE.test(text) && !ABSOLUTE.test(guion)) problems.push('exagera');
	for (const n of text.match(/\d+/g) ?? []) {
		if (!allowedNumbers.has(Number(n))) problems.push(`numero ${n} no esta en guion`);
	}
	const g = normalize(guion);
	for (const name of text.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g)?.slice(1) ?? []) {
		if (!g.includes(normalize(name))) problems.push(`nombre ${name} no esta en guion`);
	}
	if (normalize(beatText).includes(normalize(text)) && words > 3) problems.push('copia la voz');
	if (/\d/.test(text)) score += 2;
	if (/[¿?]/.test(text)) score += 2;
	if (/(…|:|,| no | sin | pero | ni )/.test(text)) score += 2;
	if (words <= 4) score += 1;
	return {problems, score};
};

// The wording decides the design: a lone figure is a stat, a two-part line a stack, anything else a block.
const classify = (raw: string) => {
	const text = raw.trim().replace(/\.$/, '');
	const numbers = text.match(/\d[\d.,]*/g) ?? [];
	if (numbers.length === 1 && /^\d[\d.,]*\s*[A-Za-zÁÉÍÓÚÑáéíóúñ]*$/.test(text)) {
		return {kind: 'stat' as const, text, lead: null, punch: text, value: numbers[0], unit: text.slice(numbers[0].length).trim() || null};
	}
	const parts = /^(.{3,24}?[,:…])\s+(.{2,22})$/.exec(text);
	if (parts && !/[¿?]/.test(text)) return {kind: 'stack' as const, text, lead: parts[1].replace(/:$/, ''), punch: parts[2], value: null, unit: null};
	return {kind: 'block' as const, text, lead: null, punch: text, value: null, unit: null};
};

const LABEL = {stat: 'dato', stack: 'contraste', block: 'gancho'};


export const chips: Step = {
	id: 'chips',
	needs: ['guion.md', 'storyboard.json'],
	makes: ['film_chips.json'],
	run: async (ctx) => {
		const guion = ctx.guion();
		const sb = ctx.read<Storyboard>('storyboard.json');
		const target = targetFor(ctx.profile, 'chips');
		const allowed = new Set(spanishNumbers(guion));
		sb.beats.forEach((b) => b.counter && allowed.add(b.counter.to));
		const list = sb.beats.map((b, i) => `${i}: [${b.shot}] ${b.text}`).join('\n');
		const draft = await askJson(target, WriterSchema, SYSTEM_WRITER, `Guion completo:\n${ctx.notas()}\n\nBeats:\n${list}`, {temperature: 0.85});
		const reviewed = draft.beats.filter((b) => sb.beats[b.beat]).map((b) => ({
			beat: b.beat,
			options: b.candidates.map((text) => ({text: text.trim(), ...review(text.trim(), guion, allowed, sb.beats[b.beat].text)})),
		}));
		const shortlist = reviewed
			.map((b) => ({beat: b.beat, options: b.options.filter((o) => !o.problems.length).sort((x, y) => y.score - x.score).slice(0, 4)}))
			.filter((b) => b.options.length);
		const prompt = `Guion:\n${guion}\n\nOpciones por beat:\n${shortlist.map((b) => `Beat ${b.beat} (${sb.beats[b.beat].text.slice(0, 50)}…):\n${b.options.map((o) => `- [${LABEL[classify(o.text).kind]}] ${o.text}`).join('\n')}`).join('\n\n')}`;
		const edit = await askJson(target, EditorSchema, SYSTEM_EDITOR, prompt, {temperature: 0.2});
		const valid = edit.picks.filter((p) => shortlist.some((b) => b.beat === p.beat && b.options.some((o) => o.text === p.text.trim())));
		const chosen: typeof valid = [];
		for (const p of valid.sort((a, b) => a.beat - b.beat)) {
			if (chosen.length >= MAX_CHIPS) break;
			if (chosen.some((c) => Math.abs(c.beat - p.beat) < 2)) continue;
			chosen.push(p);
		}
		// The opening beat is the hook: it always carries a text, the best-scored option, even if the editor skipped it.
		const opening = shortlist.find((b) => b.beat === 0)?.options[0];
		if (opening && !chosen.some((c) => c.beat === 0)) {
			const kept = chosen.filter((c) => c.beat >= 2).slice(0, MAX_CHIPS - 1);
			chosen.splice(0, chosen.length, {beat: 0, text: opening.text, why: 'gancho del primer beat'}, ...kept);
		}
		// The editor tends to repeat one formula, so a missing design replaces a pick whose design is repeated.
		for (const need of ['stat', 'block', 'stack'] as const) {
			const kindOf = (c: {text: string}) => classify(c.text).kind;
			if (chosen.some((c) => kindOf(c) === need)) continue;
			for (const c of chosen) {
				if (chosen.filter((o) => kindOf(o) === kindOf(c)).length < 2) continue;
				const option = shortlist.find((b) => b.beat === c.beat)?.options.find((o) => classify(o.text).kind === need);
				if (option) {
					c.text = option.text;
					break;
				}
			}
		}
		ctx.write('film_chips.json', chosen.map((c) => ({beat: c.beat, chip: classify(c.text)})));
		chosen.forEach((c) => console.log(`  ${c.beat}: ${c.text}`));
	},
};
