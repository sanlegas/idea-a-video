import {z} from 'zod';
import {askJson, targetFor} from '../lib/llm';
import {ensurePack, kenneyCatalog, resolveModel, type PropModel} from '../lib/kenney';
import type {Step} from './types';

const ChoiceSchema = z.object({
	objetos: z
		.array(
			z.object({
				id: z.string().regex(/^[a-z_]{2,20}$/),
				etiqueta: z.string().min(2).max(22),
				modelo: z.string(),
			}),
		)
		.max(10),
});

const system = () => {
	const {packs} = kenneyCatalog();
	const list = Object.entries(packs)
		.map(([id, p]) => `${id} (${p.about}):\n${p.models.map((m) => `${id}/${m}`).join(', ')}`)
		.join('\n\n');
	return `Eres director de arte de videos explicativos 3D verticales, estilo low-poly. Eliges modelos 3D ya hechos para los objetos que la narración nombra o explica.
Cada objeto elegido aparecerá en una tarjeta, girando con su etiqueta, mientras la voz habla de él.

Catálogo, solo puedes usar estos nombres exactos:
${list}

Reglas:
- Elige solo objetos concretos y visibles que el guion nombra: máquinas, piezas, recipientes, muebles, edificios. Nada abstracto.
- El modelo debe parecerse de verdad al objeto. Si ninguno se parece, no lo incluyas. Es mejor omitir que mostrar algo equivocado.
- Un objeto por idea; no repitas el mismo modelo para dos objetos distintos.
- id: corto, minúsculas y guiones bajos. etiqueta: nombre en español como lo dice el guion, máximo 22 caracteres.
- modelo: "paquete/nombre" exacto del catálogo.
Devuelve solo JSON.`;
};

export const catalogo: Step = {
	id: 'catalogo',
	needs: ['guion.md'],
	makes: ['props.json'],
	run: async (ctx) => {
		const out = await askJson(targetFor(ctx.profile, 'catalogo'), ChoiceSchema, system(), `Guion:\n${ctx.notas()}`, {
			temperature: 0.2,
			check: (v) => {
				const {objetos} = v as z.infer<typeof ChoiceSchema>;
				const issues = objetos.filter((o) => !resolveModel(o.modelo)).map((o) => `"${o.modelo}" no existe en el catálogo`);
				const ids = objetos.map((o) => o.id);
				if (new Set(ids).size !== ids.length) issues.push('cada id debe ser único');
				return issues;
			},
		});
		const props: PropModel[] = out.objetos.map((o) => ({id: o.id, label: o.etiqueta, model: o.modelo, ...resolveModel(o.modelo)!}));
		for (const pack of new Set(props.map((p) => p.model.split('/')[0]))) await ensurePack(pack);
		ctx.write('props.json', props);
		console.log(`  ${props.length ? props.map((p) => `${p.label} → ${p.model}`).join(', ') : 'ningún modelo del catálogo encaja'}`);
	},
};
