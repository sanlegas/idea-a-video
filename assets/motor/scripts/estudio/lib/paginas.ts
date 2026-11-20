import type {Page, Word} from '../../../src/estudio/film';

const WIDE = 30;
const MAX_WORDS = 7;

// Text pages: a page never spans a sentence, and two lines of big type hold about thirty characters each.
export const makePages = (words: Word[], duration: number, keys: string[]): Page[] => {
	const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
	const wanted = new Set(keys.map(key));
	const groups: number[][] = [];
	let current: number[] = [];
	let chars = 0;
	words.forEach((w, i) => {
		const previous = words[i - 1];
		const breath = previous && (previous.line !== w.line || /[.?!]$/.test(previous.word) || w.start - previous.end > 0.28);
		if (current.length && (breath || current.length >= MAX_WORDS || chars + w.word.length + 1 > WIDE * 1.4)) {
			groups.push(current);
			current = [];
			chars = 0;
		}
		current.push(i);
		chars += w.word.length + 1;
	});
	if (current.length) groups.push(current);
	return groups.map((g, i) => ({
		words: g,
		key: g.find((w) => wanted.has(key(words[w].word))) ?? null,
		start: i === 0 ? 0 : words[g[0]].start - 0.03,
		end: i === groups.length - 1 ? duration : words[groups[i + 1][0]].start - 0.03,
	}));
};
