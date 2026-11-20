export type Context = {
	dir: string;
	name: string;
	profile: string;
	factcheck: boolean;
	read: <T = any>(file: string) => T;
	write: (file: string, value: unknown) => void;
	// Narration only: what the voice says and what beats must contain word for word.
	guion: () => string;
	// The guion as creative steps read it: narration plus the author's visual notes, when there are any.
	notas: () => string;
};

// A step declares what it reads and writes. Adding a stage to the film is adding one of these.
export type Step = {
	id: string;
	needs: string[];
	makes: string[];
	enabled?: (ctx: Context) => boolean;
	run: (ctx: Context) => Promise<void> | void;
};
