import {semanticIssues, SHOT_CATALOG, shotsFor, StoryboardSchema, type Prop, type Storyboard, type TomaCode, type World} from '../../src/schema';
import {askJson, targetFor} from '../lib/llm';
import type {Step} from './types';

// The director is only offered what this film's world can actually show.
const system = (world: World, props: Prop[], written: TomaCode[]) => {
	const shots = [
		...shotsFor(world).map((s) => `- ${s} (scene ${SHOT_CATALOG[s].scene}): ${SHOT_CATALOG[s].about}`),
		// Shots programmed for this film: use them exactly where the guion talks about what they show.
		...written.map((t) => `- ${t.id} (scene toma): ${t.about} Programada para este video: úsala justo donde el guion habla de eso.`),
	].join('\n');
	return `Eres director de videos explicativos verticales. Conviertes un guion en storyboard JSON para un kit fijo de animación.

Protagonista: ${world.hero.name}. Entorno: ${world.environment}.
Planos disponibles:
${shots}

Reglas:
- Divide el guion en beats, en orden, sin cambiar, añadir ni omitir palabras. Cada beat dura de 2 a 8 segundos de voz.
- El beat 0 es el gancho: solo la primera frase (o hasta su primera coma), de 2 a 4 segundos, con el plano más dinámico que muestre lo que esa frase nombra. Nunca abre con una vista quieta ni lejana.
- Varía planos: no repitas el mismo plano en beats seguidos salvo que sean una sola idea.
- grade: night, dawn o day. Debe seguir la hora que indique el guion: madrugada es night; amanecer es dawn; si no indica, day.
- quake: 0 sin sismo, 1 máximo. Solo mientras el guion narre un temblor; si no hay temblor, 0 siempre.
- collapse: true solo si el guion dice que caen edificios.
- counter: solo en cut_detail, con to=número y unit corta; si no aplica, null.
- chip: siempre null; otro paso escribe esos textos.
${props.length ? `- prop: id de un objeto con modelo 3D cuando el beat lo nombra o explica; aparece en una tarjeta sobre el plano. Muestra cada objeto al menos una vez, en el beat donde se nombra. null si el beat no trata de ninguno. Objetos: ${props.map((p) => `${p.id} (${p.label})`).join(', ')}.` : '- prop: siempre null.'}
- title: título breve.
Devuelve solo JSON.`;
};

// The hook beat: at most the first sentence, so the first cut comes within the first seconds.
const openingIssues = (sb: Storyboard) => {
	const first = sb.beats[0]?.text ?? '';
	const sentence = first.match(/^[^.?!]*[.?!]/)?.[0] ?? first;
	const words = first.split(/\s+/).filter(Boolean).length;
	return first.trim().length > sentence.trim().length + 1 || words > 16 ? [`el beat 0 es el gancho: debe contener solo la primera frase (o hasta su primera coma) y durar de 2 a 4 segundos; ahora tiene ${words} palabras`] : [];
};

export const storyboard: Step = {
	id: 'storyboard',
	needs: ['guion.md', 'world.json', 'props.json', 'tomas.json'],
	makes: ['storyboard.json'],
	run: async (ctx) => {
		const world = ctx.read<World>('world.json');
		const props = ctx.read<Prop[]>('props.json');
		const written = ctx.read<TomaCode[]>('tomas.json');
		const ids = new Set(props.map((p) => p.id));
		const guion = ctx.guion();
		const sb = await askJson(targetFor(ctx.profile, 'storyboard'), StoryboardSchema, system(world, props, written), `Guion:\n${ctx.notas()}`, {
			temperature: 0.3,
			attempts: 4,
			check: (v) => [
				...semanticIssues(v as Storyboard, guion, world, written),
				...openingIssues(v as Storyboard),
				...(v as Storyboard).beats.filter((b) => b.prop && !ids.has(b.prop)).map((b) => `prop ${b.prop} no existe; usa uno de: ${[...ids].join(', ') || 'ninguno, deja null'}`),
			],
		});
		ctx.write('storyboard.json', sb);
		console.log(`  ${sb.beats.length} beats: ${sb.beats.map((b) => (b.prop ? `${b.shot}+${b.prop}` : b.shot)).join(', ')}`);
	},
};
