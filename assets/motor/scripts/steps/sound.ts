import {z} from 'zod';
import type {Storyboard} from '../../src/schema';
import {askJson, targetFor} from '../lib/llm';
// @ts-expect-error plain JS module shared with scripts/sound.mjs
import {catalogoTexto, EFECTOS} from '../../kit/biblioteca/sonidos/efectos.mjs';
import type {Step} from './types';

const MOODS = ['tension', 'wonder', 'calm', 'resolve'] as const;
const AMBIENCE = ['none', 'city', 'water', 'wind', 'machine'] as const;

const SoundSchema = z.object({
	beats: z.array(z.object({beat: z.number(), mood: z.enum(MOODS), ambience: z.enum(AMBIENCE)})),
	efectos: z.array(z.object({beat: z.number(), palabra: z.string(), efecto: z.string(), dur: z.number().optional(), gain: z.number().optional()})).default([]),
});

const SYSTEM = `Eres diseñador de sonido de videos explicativos. Por cada beat eliges mood musical y ambiente de fondo.
mood: tension (peligro, duda), wonder (descubrimiento), calm (explicación serena), resolve (cierre, alivio).
ambience: none, city, water, wind o machine, según lo que se ve.
Pocos cambios de mood: la música sigue el arco, no cada frase.
Además eliges efectos en "efectos": cada uno con beat, la palabra exacta del beat donde suena, y un id del catálogo.
Pon efecto solo cuando pasa algo físico en pantalla: arrancar, chocar, encajar, romperse. Entre 0 y 2 por beat. Usa dur (segundos) solo para alargar un sonido continuo.
Catálogo:
${catalogoTexto()}
Solo ids del catálogo. Devuelve solo JSON.`;

export const sound: Step = {
	id: 'sound',
	needs: ['storyboard.json'],
	makes: ['sound.json'],
	run: async (ctx) => {
		const sb = ctx.read<Storyboard>('storyboard.json');
		const list = sb.beats.map((b, i) => `${i}: [${b.shot}, ${b.grade}] ${b.text}`).join('\n');
		const out = await askJson(targetFor(ctx.profile, 'sound'), SoundSchema, SYSTEM, list, {
			temperature: 0.3,
			check: (v) => {
				const o = v as z.infer<typeof SoundSchema>;
				const problems = o.beats.length === sb.beats.length ? [] : [`debe haber ${sb.beats.length} beats`];
				for (const e of o.efectos) {
					if (!EFECTOS[e.efecto]) problems.push(`efecto desconocido: ${e.efecto}`);
					const beat = sb.beats[e.beat];
					if (!beat) problems.push(`beat inexistente: ${e.beat}`);
					else if (!beat.text.toLowerCase().includes(e.palabra.toLowerCase())) problems.push(`"${e.palabra}" no está en el beat ${e.beat}`);
				}
				return problems;
			},
		});
		ctx.write('sound.json', out);
		console.log(`  ${out.beats.map((b) => b.mood).join(' ')}; ${out.efectos.length} efectos`);
	},
};
