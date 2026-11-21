// The flows of the project, as data: what each does, takes and gives, what it asks of the machine and where it is
// documented. The dispatcher (scripts/flujo.ts) and the generated documentation read this one list.
import {existsSync} from 'node:fs';

export type Flujo = {
	script: string;
	// Arguments as the flow's own command takes them.
	uso: string;
	hace: string;
	entra: string;
	sale: string;
	// What a full run needs beyond Node, ffmpeg and a browser. `pnpm diagnostico` says what this machine has.
	corre: string;
	// How the flow moves through its steps: what can be rerun, skipped or estimated.
	pasos: string;
	doc: string;
};

const TODOS: Record<string, Flujo> = {
	plantillas: {
		script: 'scripts/plantillas.ts',
		uso: '<nombre> --guion guiones/x.md [--llm sesion|openrouter|deepseek|local] [--from paso] [--until paso] [--only paso] [--factcheck]',
		hace: 'Video 3D con tomas ya programadas que un LLM elige y rellena',
		entra: 'guion (.md)',
		sale: 'runs/<nombre>/film.mp4',
		corre: 'voz y LLM (el asistente de la sesión, o una clave); render 3D con WebGL',
		pasos: '14 pasos declarados; salta los hechos; --from, --until, --only',
		doc: 'docs/flujo-plantillas.md',
	},
	estudio: {
		script: 'scripts/estudio/generar.ts',
		uso: '<nombre> --guion guiones/x.md [--llm sesion|openrouter|deepseek|local] [--modelos a,b] [--sin-imagenes] [--sin-blender] [--ligero] [--intentos 3] [--una-escena] [--rehacer] [--sin-sonido]',
		hace: 'Video 3D donde un LLM inventa, programa, mira y corrige cada escena',
		entra: 'guion (.md)',
		sale: 'runs/<nombre>/film.mp4',
		corre: 'voz y LLM; imágenes generadas opcionales (sin ellas, modelos 3D del catálogo y dibujos 2D hechos con código); con Blender, modelos 3D nuevos escritos por el LLM; render 3D con WebGL (--ligero si hay poca GPU)',
		pasos: 'etapas fijas; reutiliza lo hecho; --rehacer',
		doc: 'docs/flujo-estudio.md',
	},
	tinta: {
		script: 'scripts/tinta/orquestar.ts',
		uso: '<nombre> --guion guiones/tinta/x.md [--llm sesion|openrouter|deepseek|local] [--desde paso] [--hasta paso] [--solo paso] [--plan]',
		hace: 'Video 3D ilustrado: objetos con contorno de tinta sobre maquetas',
		entra: 'guion (.md)',
		sale: 'runs/tinta/<nombre>/film.mp4',
		corre: 'voz y LLM; objetos nuevos en 3D solo con un comando propio; render 3D con WebGL',
		pasos: '11 pasos; salta los hechos; --desde, --hasta, --solo; --plan estima sin correr',
		doc: 'docs/flujo-tinta.md',
	},
	storytelling: {
		script: 'scripts/storytelling/orquestar.ts',
		uso: '<nombre> --guion guiones/storytelling/x.md | --tema "…" [--fuentes x.md] [--segundos 75] [--llm sesion|openrouter|deepseek|local] [--direccion x.json] [--planos x.json] [--estilo dinamico|cine|sobrio|x.json] [--musica pistas|sintetizada|no|x.json] [--voz local|elevenlabs|borrador] [--imagenes local|stock|nube|placas] [--borrador] [--desde paso] [--hasta paso] [--solo paso] [--plan]',
		hace: 'Corto narrado de corte rápido: escenas fotográficas, frases del narrador y láminas gráficas',
		entra: 'guion (.md) o tema',
		sale: 'runs/storytelling/<nombre>/film.mp4',
		corre: 'cualquier máquina: voz e imágenes según claves y modelos propios; --borrador sin nada',
		pasos: '13 pasos; salta los hechos; --desde, --hasta, --solo; --plan estima sin correr',
		doc: 'docs/flujo-storytelling.md',
	},
	explica: {
		script: 'scripts/explica/hacer.ts',
		uso: 'guiones/explica/<plan>.json [--sin-sonido] [--cuadros 2,12.5]',
		hace: 'Explicativo 2D: texto animado, gráficas y transiciones',
		entra: 'plan (.json) escrito a mano',
		sale: 'runs/explica/<nombre>/film.mp4',
		corre: 'cualquier máquina',
		pasos: 'un solo paso: revisa, sintetiza sonido y renderiza',
		doc: 'docs/flujo-explica.md',
	},
	'desde-video': {
		script: 'scripts/video/desde_video.ts',
		uso: '<video.mp4> <nombre> [--llm sesion|openrouter|local]',
		hace: 'Convierte un video terminado en guion anotado, para rehacerlo en otro flujo',
		entra: 'video (.mp4)',
		sale: 'guiones/<nombre>.md',
		corre: 'reconocimiento de voz en esta máquina y un LLM que vea imágenes',
		pasos: 'un solo paso: transcribe, corta por frase y describe cada tramo',
		doc: 'docs/flujo-desde-video.md',
	},
};

// A copy of the engine can leave a flow out (the shareable skill does): a flow whose script is not here does not exist.
export const FLUJOS: Record<string, Flujo> = Object.fromEntries(Object.entries(TODOS).filter(([, f]) => existsSync(f.script)));
