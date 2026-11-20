// A guion is narration plus optional visual notes. Lines starting with ">" are notes: they are never narrated.
// Notes before the first narrated line describe the whole video (style); the rest belong to the narration just above them.

export type Block = {text: string; notes: string[]; first: number; last: number};
export type Guion = {narration: string; style: string[]; blocks: Block[]; annotated: boolean};

// Desde video labels each stretch ("**Voz literal (0.05–6.16 s):**", "> **Visual:**"); the labels are never narrated or shown.
const SPEECH_LABEL = /^\*\*Voz literal[^*]*\*\*\s*/i;
const NOTE_LABEL = /^\*\*Visual:?\*\*:?\s*/i;

export const readGuion = (source: string): Guion => {
	const style: string[] = [];
	const blocks: {text: string[]; notes: string[]}[] = [];
	for (const raw of source.split('\n')) {
		const line = raw.trim().replace(SPEECH_LABEL, '');
		if (!line) continue;
		if (line.startsWith('>')) {
			const note = line.replace(/^>\s*/, '').replace(NOTE_LABEL, '');
			if (!note) continue;
			if (blocks.length) blocks[blocks.length - 1].notes.push(note);
			else style.push(note);
			continue;
		}
		// Narration after a note opens a new block, so each note keeps the words it was written for.
		const last = blocks[blocks.length - 1];
		if (last && !last.notes.length) last.text.push(line);
		else blocks.push({text: [line], notes: []});
	}
	let index = 0;
	const placed = blocks.map((b) => {
		const text = b.text.join('\n');
		const count = text.split(/\s+/).filter(Boolean).length;
		const block = {text, notes: b.notes, first: index, last: index + count - 1};
		index += count;
		return block;
	});
	return {narration: placed.map((b) => b.text).join('\n'), style, blocks: placed, annotated: style.length > 0 || placed.some((b) => b.notes.length > 0)};
};

// The guion as a model should read it: narration with the author's notes marked, or plain narration when there are none.
export const annotatedText = (g: Guion) =>
	[
		...(g.style.length ? [`[ESTILO DEL AUTOR para todo el video: ${g.style.join(' ')}]`] : []),
		...g.blocks.map((b) => (b.notes.length ? `${b.text}\n[VISUAL DEL AUTOR: ${b.notes.join(' ')}]` : b.text)),
	].join('\n');

// What every creative step is told when the author wrote notes.
export const NOTES_RULE = `Las líneas [VISUAL DEL AUTOR] y [ESTILO DEL AUTOR] no se narran: son lo que el autor quiere ver. Son obligatorias. Ejecútalas tal como están escritas y solo decide lo que no especifican. Nunca las contradigas ni las cambies por otra idea.`;

// Notes that apply to a span of words, for a scene that covers it.
export const notesFor = (g: Guion, first: number, last: number) => g.blocks.filter((b) => b.notes.length && b.first <= last && b.last >= first).flatMap((b) => b.notes);
