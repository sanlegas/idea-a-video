import {z} from 'zod';
import {askJson, targetFor} from '../lib/llm';
import type {Step} from './types';

const BriefSchema = z.object({
	topic: z.string(),
	tone: z.string(),
	place: z.string(),
	era: z.string(),
	timeOfDay: z.enum(['night', 'dawn', 'day', 'night_to_dawn']),
	subject: z.string(),
	mechanism: z.string(),
	keyNumbers: z.array(z.string()),
	events: z.array(z.string()),
	mustShow: z.array(z.string()).max(8),
});

const SYSTEM = `Analizas un guion de video explicativo vertical antes de producirlo.
Extrae qué cuenta, sin inventar nada. subject es el objeto o lugar protagonista. mechanism es la idea que el video explica.
events son sucesos que ocurren en pantalla según el guion. mustShow son las imágenes sin las cuales el video no se entiende.
Devuelve solo JSON.`;

export const brief: Step = {
	id: 'brief',
	needs: ['guion.md'],
	makes: ['brief.json'],
	run: async (ctx) => {
		const out = await askJson(targetFor(ctx.profile, 'brief'), BriefSchema, SYSTEM, `Guion:\n${ctx.notas()}`, {temperature: 0.2});
		ctx.write('brief.json', out);
		console.log(`  ${out.subject} | ${out.place} | ${out.timeOfDay}`);
	},
};
