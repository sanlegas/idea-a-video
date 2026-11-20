// The first seconds of a short decide if anyone stays. These rules are shared by every flow that writes a guion
// or plans the opening, so all of them start the same way: no intro, a hook that can be seen, motion from frame 0.
//
// Where the rules come from (public research, 2026-11-15; details in docs/GANCHO.md):
// - A study of 4,784 hooks from videos with 1M+ views: median hook 11–12 words (middle half 9–14); a question is
//   not required (≈15 %); no single formula dominates. Mechanisms that recur: hidden consequence, contradiction,
//   immediate stakes, unexplained event.
// - Shorts creators interviewed on their method: hook under 3 s; foreshadow the payoff; first frame centred with at
//   most three objects, readable as a thumbnail and understandable on mute; "but/so" to move the story.
// - Popular animated explainer shorts: no intro, one question stated at once, the video ends when it is answered.
// - Practitioner guides: no greeting, logo or fade; the first frame must look different from the feed; the picture
//   shows what the voice promises; on-screen text compresses the hook instead of repeating it.

export const GANCHO = {
	// Words in the first sentence, and how long the first shot may last before something changes.
	palabras: [5, 16] as const,
	primerPlano: 3,
};

export const GANCHO_GUION = `Gancho: los primeros 5 a 10 segundos deciden si alguien se queda.
- La primera frase es el gancho: de ${GANCHO.palabras[0]} a ${GANCHO.palabras[1]} palabras, menos de 3 segundos dicha, y entra directo al tema. Nada de saludos, "en este video", "hoy te voy a explicar", definiciones ni contexto histórico al inicio.
- Usa un mecanismo claro: una pregunta concreta que el video sí responde ("¿Por qué el agua del retrete no se desborda?"), una contradicción (dos hechos que chocan), la consecuencia oculta de algo cotidiano, una situación en segunda persona con algo en juego ("Vas a cien kilómetros por hora y…"), el resultado o la cifra sorprendente primero, o un hecho que exige explicación.
- La primera frase nombra algo que se puede mostrar: se entiende sin audio y en pantalla se ve justo lo que se oye.
- La segunda o tercera frase sube lo que está en juego o anticipa el pago con algo concreto. Nunca promesas vagas como "no vas a creer lo que pasa".
- Antes del segundo 10 queda claro de qué trata y por qué importa. La respuesta llega después, y el video termina poco después de darla.
- Una sola pregunta central por video. Usa "pero" y "entonces" para avanzar.`;

export const GANCHO_VISUAL = `Apertura audiovisual (primeros 3 segundos):
- El primer cuadro ya es la imagen más llamativa del video: el protagonista centrado, grande y en acción, con tres objetos como máximo. Nada de fundido desde negro, títulos, logos ni planos vacíos.
- Hay movimiento desde el cuadro 0: la cámara entra rápido o algo cae, gira, choca o aparece de golpe.
- Lo que se ve es lo que dice la voz en ese instante.
- La primera escena dura de 1.5 a ${GANCHO.primerPlano} segundos. En los primeros 10 segundos el plano o la acción cambian cada 1.5 a 3 segundos.
- El texto en pantalla, si lo hay, comprime el gancho en 2 a 4 palabras con una resaltada; no repite toda la narración.`;

// Openings that waste the first seconds.
const RELLENO = /^(hola|hey|qu[eé] tal|bienvenid|buen(os|as) (d[ií]as|tardes|noches)|en (este|el) (video|v[ií]deo|corto)|hoy (te |les )?(voy|vamos|vas) a|antes de (empezar|comenzar)|sab[ií]as que\b|d[eé]jame (contarte|explicarte))/i;

const sinSignos = (s: string) => s.replace(/^[¿¡"'«(\s]+/, '');

// Whether a line opens with a greeting or an intro instead of the subject.
export const esRelleno = (texto: string) => RELLENO.test(sinSignos(texto.trim()));

// First sentence of a narration, as the voice will say it.
export const primeraFrase = (texto: string) => (texto.trim().match(/^[^.?!]*[.?!]+["»]?|^[^.?!]+$/)?.[0] ?? '').trim();

// Problems with the opening of a narration, worded for the model (or person) that has to fix them.
export const revisarGancho = (texto: string): string[] => {
	const p: string[] = [];
	const primera = primeraFrase(texto);
	const palabras = primera.split(/\s+/).filter(Boolean).length;
	if (!primera) return ['falta la primera frase'];
	if (esRelleno(primera)) p.push(`la primera frase ("${primera}") gasta el gancho en un saludo o una introducción: empieza directo con la pregunta, el choque o la situación`);
	if (palabras < GANCHO.palabras[0] || palabras > GANCHO.palabras[1]) p.push(`la primera frase tiene ${palabras} palabras: el gancho debe tener de ${GANCHO.palabras[0]} a ${GANCHO.palabras[1]} para decirse en menos de 3 segundos`);
	return p;
};
