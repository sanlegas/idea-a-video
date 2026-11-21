// New 3D models built in Blender for one estudio film, when this machine has Blender. After the ideas, a model of the
// run's LLM (the assistant of the session by default) decides which key objects or characters the catalog lacks,
// writes each one as a short Python function with the pieces of scripts/blender/juguete.py, and Blender builds it with
// no window. The code is checked before it runs, a preview is judged, and a failed build goes back with its error.
// No picture generator is involved. What comes out is offered to every scene like a catalog model.
//
// Files, all in runs/<run>/modelos_src: modelos_plan.json (which models), <nombre>.py (the code that built it),
// <nombre>.glb and its previews, <nombre>.estado.json (attempts and their problems), anclas.json and modelos.json.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {z} from 'zod';
import {construirModelos, revisarCodigoModelo, type Blender} from '../../lib/blender';
import {askJson, askText, outOfCredit, PedidoPendiente, targetFor} from '../../lib/llm';
import type {Ideas} from './cerebro';

export const MAX_NUEVOS = 4;
const INTENTOS = 3;

const planSchema = z.object({
	modelos: z
		.array(
			z.object({
				nombre: z.string(),
				en: z.string().min(20),
				por_que: z.string(),
			}),
		)
		.max(MAX_NUEVOS),
});
type Plan = z.infer<typeof planSchema>;

const revisionSchema = z.object({
	sirve: z.boolean(),
	problemas: z.array(z.string()),
});

const PLAN_SYSTEM = `Eres director de arte de un video 3D de juguetes. Decides qué modelos 3D nuevos hay que construir por código en Blender para este video.
Ya existe un catálogo de modelos de juguete (lista abajo) y la corrida puede traer modelos propios. Pide un modelo nuevo solo para un personaje u objeto que:
- es protagonista, recurrente o central para entender el video, y
- no está en el catálogo ni en los modelos de la corrida, ni hay uno que sirva con otro color, y
- se arma bien con formas simples de juguete (cajas redondeadas, esferas, cilindros, tornos, conos): vehículos, aparatos, animales, edificios, muebles, comida, personajes con carita.
No pidas personas reales, marcas, logotipos, paisajes enteros ni cosas que deban deformarse. Lo secundario se resuelve con un dibujo 2D o con el catálogo. Cero modelos es una respuesta válida.
Máximo ${MAX_NUEVOS}. Para cada uno:
- nombre: corto, en minúsculas, con letras, números y _ (por ejemplo tren_naranja).
- en: qué muestra, como lo leerá quien programa las escenas: forma, colores, hacia dónde mira, y cada parte que se mueve o material que cambia con su nombre entre paréntesis (por ejemplo: puertas que se abren (puerta_i, puerta_d), llantas que giran (llanta_1..4), vidrio (material vidrio)).
- por_que: en qué escenas aparece y por qué el catálogo no basta.`;

const CODE_SYSTEM = `Escribes en Python un modelo 3D de juguete para Blender, con las piezas de juguete.py. El modelo se ve en un video de fondo oscuro con luz de estudio: formas simples, redondeadas y brillantes, colores saturados, pocas piezas grandes.

Escribe solo código Python, sin explicación ni bloque de markdown. Debe definir def construir(): que arma el modelo en una escena vacía y devuelve un diccionario de puntos con nombre ({} si no hace falta). Puedes definir funciones auxiliares.
Solo puedes importar: from juguete import *, import math, import random, from mathutils import Vector. No uses bpy, bmesh, archivos, os ni nada fuera de estas piezas: el código se revisa antes de correr y se rechaza.

Reglas:
- Arriba es +Z; el frente mira a -Y (hacia la cámara); la base queda en z = 0. Un vehículo o animal de perfil va con la nariz hacia +X.
- Tamaños en metros de juguete: una persona mide 2.4, una taza 0.6, un coche 2.2 de largo. Las proporciones entre partes importan; la escena fija la altura final.
- Toda pieza lleva un color '#RRGGBB' o un material de material(). Usa bisel en las cajas (0.03 a 0.1) para que no haya aristas filosas.
- Cada parte que se mueve (de la descripción, entre paréntesis) es un objeto con su nombre exacto hecho con unir(piezas, 'nombre', pivote): el pivote es el punto desde donde gira (bisagra, hombro, eje de la rueda). Una parte que cuelga de otra se une con colgar(hijo, padre).
- Cada material con nombre de la descripción se crea con material('nombre', color, ...): vidrio, foco, cuerpo...
- Piezas finas desaparecen a la distancia de la cámara: grosor mínimo 0.03.
- Personajes: cabeza grande y ojos con ojos(); boca con arco(..., nombre='boca').

Piezas (los colores van como '#RRGGBB' o como un material):
- material(nombre, color, rugosidad=None, metal=0.0, emision=0.0, alfa=1.0): material con nombre, se reutiliza si ya existe.
- caja(tam, centro, mat, bisel=0.0): caja de tamaño (x, y, z) centrada en centro.
- cilindro(r, alto, centro, mat, eje='z', lados=48): cilindro a lo largo de eje 'x', 'y' o 'z'; una rueda vista de frente es eje='y'.
- cono(r1, r2, alto, centro, mat, eje='z', lados=48): cono o cono truncado; r1 abajo, r2 arriba.
- esfera(r, centro, mat, escala=(1, 1, 1)): esfera o elipsoide.
- toro(R, r, centro, mat, eje='z'): anillo.
- palo(p1, p2, r, mat, lados=16): barra redonda del punto p1 al p2 (brazos, patas, manijas).
- torno(perfil, mat, nombre='torno', lados=64, centro=(0, 0, 0)): sólido de revolución vertical desde [(radio, z), ...] relativo a centro; radio 0 cierra ese extremo. Gíralo con obj.rotation_euler.
- placa(puntos, centro_y, grosor, mat, nombre='placa'): figura plana de puntos (x, z) que mira a la cámara, extruida en Y.
- arco(R, r, centro, mat, desde=pi*1.1, hasta=pi*1.9, nombre='arco'): parte de un anillo de frente (una sonrisa).
- ojos(z, y, sep=0.15, r=0.11, color_ceja='#2A160C', alto_ceja=0.2): ojos de caricatura ojo_d / ojo_i y cejas ceja_d / ceja_i a la altura z, con el frente en y.
- unir(objetos, nombre, pivote): une piezas en una parte con nombre cuyo origen es pivote.
- colgar(hijo, padre): cuelga una parte de otra.
Cada pieza devuelve su objeto; obj.location, obj.rotation_euler (radianes) y obj.scale se pueden cambiar antes de unir.

Ejemplo:
def construir():
    papel = material('papel', '#FF4F7B', rugosidad=0.35)
    cinta = material('cinta', '#FFD34D', rugosidad=0.25)
    caja((1.0, 1.0, 0.8), (0, 0, 0.4), papel, bisel=0.04)
    tapa = [caja((1.08, 1.08, 0.18), (0, 0, 0.89), papel, bisel=0.04),
            toro(0.13, 0.05, (-0.13, 0, 1.05), cinta, eje='y'),
            toro(0.13, 0.05, (0.13, 0, 1.05), cinta, eje='y')]
    unir(tapa, 'tapa', (0, 0.54, 0.8))
    ojos(0.5, -0.5, sep=0.2, r=0.1)
    arco(0.09, 0.02, (0, -0.505, 0.28), material('boca', '#5A1F2E'), nombre='boca')
    return {'centro_tapa': (0, 0, 1.0)}`;

const REVISION_SYSTEM = `Revisas un modelo 3D de juguete recién construido, antes de que entre a un video. La imagen muestra dos vistas: a la izquierda de tres cuartos y a la derecha de frente, como lo verá la cámara.
sirve es true si se reconoce como lo que dice la descripción, con sus partes en su lugar, y se vería bien como juguete brillante sobre fondo oscuro. Detalles menores no lo invalidan.
problemas: lo que hay que corregir en el código, concreto (pieza, posición, tamaño, color), de lo más grave a lo menos. Vacío si sirve.`;

type Estado = {intentos: {codigo: string; error?: string; problemas?: string[]}[]; listo?: boolean};

const leer = <T>(f: string, vacio: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : vacio);
const codigoDe = (texto: string) => {
	const m = /```(?:python|py)?\s*\n([\s\S]*?)\n```/.exec(texto);
	return (m ? m[1] : texto).trim();
};

export type Contexto = {
	profile: string;
	ideas: Ideas;
	guion: string;
	estilo: string[];
	catalogo: Record<string, string>;
	propios: Record<string, string>;
	log: (...x: unknown[]) => void;
};

// Plans, writes, builds and checks the new models; returns name → description of each one that built, with its .glb in
// carpeta. A pending request of the session stops the run as any other step does; other failures drop that model.
export const modelosNuevos = async (blender: Blender, carpeta: string, c: Contexto): Promise<Record<string, {archivo: string; en: string}>> => {
	const planFile = `${carpeta}/modelos_plan.json`;
	mkdirSync(carpeta, {recursive: true});
	const ocupados = new Set([...Object.keys(c.catalogo), ...Object.keys(c.propios)]);
	const plan: Plan =
		(existsSync(planFile) && leer<Plan>(planFile, {modelos: []})) ||
		(await askJson(
			targetFor(c.profile, 'modelos'),
			planSchema,
			PLAN_SYSTEM,
			[
				`Concepto: ${c.ideas.concepto}`,
				`Protagonista: ${c.ideas.protagonista}`,
				c.estilo.length ? `Estilo del autor: ${c.estilo.join(' ')}` : '',
				`Escenas:\n${c.ideas.escenas.map((e, i) => `${i + 1}. ${e.idea}`).join('\n')}`,
				`Modelos de la corrida:\n${Object.entries(c.propios).map(([n, d]) => `- ${n}: ${d}`).join('\n') || '- ninguno'}`,
				`Catálogo:\n${Object.entries(c.catalogo).map(([n, d]) => `- ${n}: ${d}`).join('\n')}`,
			]
				.filter(Boolean)
				.join('\n\n'),
			{
				temperature: 0.3,
				check: (v) => {
					const p = v as Plan;
					const issues: string[] = [];
					const vistos = new Set<string>();
					for (const m of p.modelos) {
						if (!/^[a-z0-9_]{2,40}$/.test(m.nombre)) issues.push(`nombre "${m.nombre}": minúsculas, números y _`);
						if (ocupados.has(m.nombre)) issues.push(`"${m.nombre}" ya existe: úsalo tal cual o elige otro nombre`);
						if (vistos.has(m.nombre)) issues.push(`"${m.nombre}" repetido`);
						vistos.add(m.nombre);
					}
					return issues;
				},
			},
		));
	writeFileSync(planFile, JSON.stringify(plan, null, 1));
	if (!plan.modelos.length) {
		c.log('modelos nuevos: ninguno, alcanza con el catálogo');
		return {};
	}
	c.log(`modelos nuevos con Blender ${blender.version}: ${plan.modelos.map((m) => m.nombre).join(', ')}`);

	const hechos: Record<string, {archivo: string; en: string}> = {};
	for (const m of plan.modelos) {
		const estadoFile = `${carpeta}/${m.nombre}.estado.json`;
		const glb = `${carpeta}/${m.nombre}.glb`;
		const estado = leer<Estado>(estadoFile, {intentos: []});
		const guardar = () => writeFileSync(estadoFile, JSON.stringify(estado, null, 1));
		try {
			while (!(estado.listo && existsSync(glb)) && estado.intentos.length < INTENTOS) {
				const previos = estado.intentos.map((x, i) => `Intento ${i + 1}:\n${x.codigo}\n${x.error ? `Falló al construir:\n${x.error}` : `Se construyó, pero la revisión pidió:\n${(x.problemas ?? []).map((p) => `- ${p}`).join('\n')}`}`).join('\n\n');
				const tarea = `Modelo: ${m.nombre}\nDescripción (debe cumplirse, con estas partes y materiales con nombre): ${m.en}\nPara este video: ${c.ideas.concepto}${previos ? `\n\n${previos}\n\nEscribe la versión corregida completa.` : ''}`;
				const codigo = codigoDe(await askText(targetFor(c.profile, 'modelo'), CODE_SYSTEM, tarea, {temperature: 0.3}));
				const malos = revisarCodigoModelo(codigo);
				if (malos.length) {
					estado.intentos.push({codigo, error: `El código no pasó la revisión: ${malos.join('; ')}`});
					guardar();
					continue;
				}
				const script = `${carpeta}/${m.nombre}.py`;
				writeFileSync(script, `from juguete import *\n\n${codigo}\n\n\nMODELOS = {${JSON.stringify(m.nombre)}: (construir, ${JSON.stringify(m.en)})}\n`);
				const r = construirModelos(blender, script, carpeta, [m.nombre]);
				if (!r.ok) {
					estado.intentos.push({codigo, error: r.salida.slice(-1500)});
					guardar();
					c.log(`modelo ${m.nombre}: no se construyó (intento ${estado.intentos.length})`);
					continue;
				}
				// Both previews side by side, for one look at the model.
				const vista = `${carpeta}/${m.nombre}_revision.png`;
				if (existsSync(`${carpeta}/${m.nombre}_frente.png`)) {
					execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', `${carpeta}/${m.nombre}.png`, '-i', `${carpeta}/${m.nombre}_frente.png`, '-filter_complex', 'hstack=inputs=2', vista]);
					const rev = await askJson(targetFor(c.profile, 'critico'), revisionSchema, REVISION_SYSTEM, `Modelo: ${m.nombre}\nDescripción: ${m.en}\nIntento ${estado.intentos.length + 1} (código de ${codigo.length} caracteres)`, {temperature: 0.1, maxTokens: 1500, image: vista});
					if (!rev.sirve && rev.problemas.length && estado.intentos.length + 1 < INTENTOS) {
						estado.intentos.push({codigo, problemas: rev.problemas});
						guardar();
						c.log(`modelo ${m.nombre}: se corrige (${rev.problemas[0].slice(0, 80)})`);
						continue;
					}
					if (!rev.sirve) c.log(`ATENCIÓN modelo ${m.nombre}: la revisión aún pide cambios; entra así, míralo en ${vista}`);
				}
				estado.intentos.push({codigo});
				estado.listo = true;
				guardar();
				c.log(`modelo ${m.nombre}: construido en Blender`);
			}
		} catch (e) {
			if (outOfCredit(e) || e instanceof PedidoPendiente) throw e;
			c.log(`modelo ${m.nombre}: se omite (${String(e).split('\n')[0].slice(0, 200)})`);
			continue;
		}
		if (estado.listo && existsSync(glb)) hechos[m.nombre] = {archivo: glb, en: m.en};
		else c.log(`modelo ${m.nombre}: se omite tras ${INTENTOS} intentos; las escenas usan el catálogo o un dibujo 2D`);
	}
	return hechos;
};
