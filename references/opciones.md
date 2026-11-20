# Opciones

Este archivo se genera del código del motor. No lo edites a mano.

## Plantillas de video (`pnpm video`)

Una plantilla es un tipo de video ya armado: un flujo con su estilo y su duración. El asistente inicial (`pnpm asistente`) guarda la de siempre; `--plantilla <id>` usa otra en un solo video. Recomendada: `historia`.

| Plantilla | Nombre | Para qué | Entra | Flujo | Estilo | Duración | Ejemplo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `historia` | Historia completa | una idea contada como historia, con gancho, caso, explicación y cierre; fotos, láminas y subtítulos llamativos | un tema o un guion | `storytelling` | `dinamico` | ~75 s | `pnpm video mi-video --tema "por qué bostezamos"` |
| `corto` | Corto llamativo | lo mismo en breve, para redes: gancho fuerte y cortes rápidos | un tema o un guion | `storytelling` | `dinamico` | ~45 s | `pnpm video mi-video --tema "por qué bostezamos"` |
| `documental` | Mini documental | ritmo pausado, fundidos y subtítulos limpios; para temas serios o con más datos | un tema o un guion | `storytelling` | `cine` | ~90 s | `pnpm video mi-video --tema "cómo se hizo el canal de Panamá"` |
| `sobrio` | Sobrio | cortes secos y subtítulos discretos, sin efectos; para marcas y temas formales | un tema o un guion | `storytelling` | `sobrio` | ~60 s | `pnpm video mi-video --guion guiones/storytelling/mi-video.md` |
| `datos` | Datos en 2D | cifras, gráficas y texto animado, sin voz; no pide claves ni imágenes | un plan con las escenas y sus datos (.json) | `explica` | — | la del guion | `pnpm video guiones/explica/ia.json` |
| `ilustrado` | Ilustrado en 3D | objetos con contorno de tinta sobre una maqueta; para explicar aparatos y cosas de casa | un guion | `tinta` | — | la del guion | `pnpm video mi-video --guion guiones/tinta/mi-video.md` |
| `mundo` | Mundo 3D | una ciudad, una torre o un barco recorridos por la cámara; para temas físicos y de gran escala | un guion | `plantillas` | — | la del guion | `pnpm video mi-video --guion guiones/mi-video.md` |
| `medida` | Escenas 3D a medida | cada escena se inventa y se programa para el guion; lo más variado, lo más lento y lo menos seguro | un guion | `estudio` | — | la del guion | `pnpm video mi-video --guion guiones/mi-video.md` |

### Lo que pregunta el asistente inicial

Se guarda con `pnpm asistente --guardar <ajuste>=<valor>`. Recomendado: `modo=auto`, `plantilla=historia`, `voz=auto`, `imagenes=auto`, `musica=pistas`.

| Ajuste | Valor | Qué es |
| --- | --- | --- |
| `modo` | `auto` | usa lo que haya en tu equipo y tus claves; sin claves sale gratis, con la voz del sistema y fotos libres |
| `modo` | `nube` | lo mejor: voz natural de ElevenLabs e imágenes hechas para cada plano con FLUX; pide ELEVENLABS_API_KEY y FAL_KEY, y se cobra en tus cuentas |
| `modo` | `local` | nada sale de tu equipo al hacer un video: voz propia o del sistema, escenas 3D con modelos del catálogo y dibujos 2D; sin claves ni fotos de banco |
| `voz` | `auto` | la mejor que haya: un comando propio, ElevenLabs si está su clave, o la voz del sistema |
| `voz` | `elevenlabs` | voz natural en la nube; pide ELEVENLABS_API_KEY |
| `voz` | `sistema` | la voz que trae el sistema operativo; gratis y sin conexión |
| `voz` | `local` | un comando de voz propio, declarado en config/local.json |
| `voz` | `borrador` | sin voz: videos mudos, para revisar el corte |
| `imagenes` | `auto` | lo mejor que haya: un comando propio, generadas en la nube si está la clave, o fotos libres |
| `imagenes` | `nube,stock` | generadas para cada plano, y fotos libres para lo que falle; pide FAL_KEY (FLUX en fal, ~$0.003 por imagen) |
| `imagenes` | `stock` | fotos libres de bancos; gratis, pero no siempre vienen al caso |
| `imagenes` | `local` | un comando de imagen propio, declarado en config/local.json |
| `imagenes` | `placas` | sin imágenes: placas con el texto de lo que iría |
| `musica` | `pistas` | música de la biblioteca, que cambia con el momento del video |
| `musica` | `sintetizada` | una cama musical simple hecha por código |
| `musica` | `no` | sin música |
| `llm` | `sesion` | tu asistente de IA (Claude Code, Codex u otro) escribe guion, dirección y planos cuando el motor se lo pide; sin clave |
| `llm` | `openrouter` | un modelo en la nube los escribe solo; pide OPENROUTER_API_KEY |
| `llm` | `deepseek` | DeepSeek en la nube los escribe solo; pide DEEPSEEK_API_KEY |
| `llm` | `local` | un servidor propio compatible con OpenAI (LM_BASE, o llm en config/local.json) |
| `estilo` | `dinamico`, `cine`, `sobrio` | estilo de las plantillas de storytelling, si no se quiere el de la plantilla |
| `segundos` | 15 a 240 | duración de las plantillas de storytelling, si no se quiere la de la plantilla |

## Flujos

| Flujo | Qué hace | Entra | Sale | Qué necesita |
| --- | --- | --- | --- | --- |
| `plantillas` | Video 3D con tomas ya programadas que un LLM elige y rellena | guion (.md) | `runs/<nombre>/film.mp4` | voz y LLM (el asistente de la sesión, o una clave); render 3D con WebGL |
| `estudio` | Video 3D donde un LLM inventa, programa, mira y corrige cada escena | guion (.md) | `runs/<nombre>/film.mp4` | voz y LLM; imágenes generadas opcionales (sin ellas, modelos 3D del catálogo y dibujos 2D hechos con código); render 3D con WebGL (--ligero si hay poca GPU) |
| `tinta` | Video 3D ilustrado: objetos con contorno de tinta sobre maquetas | guion (.md) | `runs/tinta/<nombre>/film.mp4` | voz y LLM; objetos nuevos en 3D solo con un comando propio; render 3D con WebGL |
| `storytelling` | Corto narrado de corte rápido: escenas fotográficas, frases del narrador y láminas gráficas | guion (.md) o tema | `runs/storytelling/<nombre>/film.mp4` | cualquier máquina: voz e imágenes según claves y modelos propios; --borrador sin nada |
| `explica` | Explicativo 2D: texto animado, gráficas y transiciones | plan (.json) escrito a mano | `runs/explica/<nombre>/film.mp4` | cualquier máquina |

### Uso de cada flujo

- **plantillas:** `pnpm plantillas <nombre> --guion guiones/x.md [--llm sesion|openrouter|deepseek|local] [--from paso] [--until paso] [--only paso] [--factcheck]`
  14 pasos declarados; salta los hechos; --from, --until, --only. Detalle: `docs/flujo-plantillas.md`
- **estudio:** `pnpm estudio <nombre> --guion guiones/x.md [--llm sesion|openrouter|deepseek|local] [--modelos a,b] [--sin-imagenes] [--ligero] [--intentos 3] [--una-escena] [--rehacer] [--sin-sonido]`
  etapas fijas; reutiliza lo hecho; --rehacer. Detalle: `docs/flujo-estudio.md`
- **tinta:** `pnpm tinta <nombre> --guion guiones/tinta/x.md [--llm sesion|openrouter|deepseek|local] [--desde paso] [--hasta paso] [--solo paso] [--plan]`
  11 pasos; salta los hechos; --desde, --hasta, --solo; --plan estima sin correr. Detalle: `docs/flujo-tinta.md`
- **storytelling:** `pnpm storytelling <nombre> --guion guiones/storytelling/x.md | --tema "…" [--fuentes x.md] [--segundos 75] [--llm sesion|openrouter|deepseek|local] [--direccion x.json] [--planos x.json] [--estilo dinamico|cine|sobrio|x.json] [--musica pistas|sintetizada|no|x.json] [--voz local|elevenlabs|borrador] [--imagenes local|stock|nube|placas] [--borrador] [--desde paso] [--hasta paso] [--solo paso] [--plan]`
  13 pasos; salta los hechos; --desde, --hasta, --solo; --plan estima sin correr. Detalle: `docs/flujo-storytelling.md`
- **explica:** `pnpm explica guiones/explica/<plan>.json [--sin-sonido] [--cuadros 2,12.5]`
  un solo paso: revisa, sintetiza sonido y renderiza. Detalle: `docs/flujo-explica.md`

## Modelos 3D del catálogo (`pnpm modelos`)

146 modelos de juguete hechos por código, en `kit/modelos`, para el flujo estudio: personas, animales, muebles, aparatos, vehículos y edificios. Los que tienen partes con nombre (brazos, puertas, agujas) se mueven en las escenas. `pnpm modelos buscar <palabra>` los encuentra y `pnpm estudio <nombre> --modelos a,b` los pone en un video.

## Valores por defecto (`config/medios.json`)

| Ajuste | Valor | Otras opciones |
| --- | --- | --- |
| Voz (`voz.proveedor`) | `auto` | `auto`, `local`, `elevenlabs`, `sistema`, `borrador` |
| Imágenes (`imagen.proveedores`) | `auto` | `auto`, `local`, `stock`, `nube`, `placas`; una lista se prueba en orden |
| Modelo de imagen en la nube, en fal (`imagen.nube.modelo`) | `fal-ai/flux/schnell` | cualquier modelo de texto a imagen de fal; `imagen.nube.dolares_por_imagen` es el costo que estima el reporte (0.003) |
| Fuentes de fotos libres (`imagen.stock.fuentes`) | `pexels,commons,openverse` | el orden es el de búsqueda |
| Música (`musica.modo`) | `pistas` | `pistas`, `sintetizada`, `no` |
| Volumen de la música (`musica.nivel`) | 0.5 | 0 a 1.5; bajo la voz baja unos 6 dB más |
| Modelo de voz de ElevenLabs (`voz.elevenlabs.model_id`) | `eleven_multilingual_v2` | cualquier modelo de voz de la cuenta |
| LLM (`--llm`) | `sesion` | `sesion`, `local`, `deepseek`, `mix`, `openrouter`, `glm`, `glm_zai` |

## Variables de entorno

Todas opcionales. Van en `.env` de la carpeta de trabajo, o en el entorno.

| Variable | Para qué |
| --- | --- |
| `ELEVENLABS_API_KEY` | Voz de ElevenLabs y sus tiempos de palabra |
| `ELEVENLABS_VOICE_ID` | Voz de ElevenLabs a usar; sin ella, la primera de la cuenta que hable español |
| `FAL_KEY` | Imágenes generadas para cada plano, con FLUX en fal |
| `OPENROUTER_API_KEY` | LLM con `--llm openrouter` |
| `PEXELS_API_KEY` | Fotos libres de Pexels, antes que las de Wikimedia |
| `DEEPSEEK_API_KEY` | LLM con `--llm deepseek` |
| `LLM_PERFIL` | Perfil de LLM cuando la corrida no pasa `--llm` |
| `LM_BASE` | Dirección de un servidor de LLM local compatible con OpenAI, para `--llm local` |
| `VOZ` | Nombre de la voz para el comando de voz propio |
| `VOZ_SISTEMA` | Nombre exacto de la voz del sistema operativo a usar |

## Storytelling

### Pasos

| # | Paso | Quién | Con qué | Deja |
| --- | --- | --- | --- | --- |
| 1 | `entorno` | código | ffmpeg, disco, clave del LLM pedido y, si la voz o las imágenes son locales, los modelos de esta máquina | — |
| 2 | `guion` | LLM | LLM del perfil --llm, solo con --tema; con --guion lo escribe una persona o el asistente | `guion.md` |
| 3 | `voz` | proveedor | config/medios.json: local (el comando de voz de esta máquina), elevenlabs (nube), sistema (la voz del sistema operativo) o borrador (sin voz); luego se mide cada palabra | `palabras.json` |
| 4 | `direccion` | LLM | LLM del perfil --llm (por defecto, el asistente de la sesión); o un direccion.json escrito a mano con --direccion | `direccion.json` |
| 5 | `planos` | LLM | LLM del perfil --llm (por defecto, el asistente de la sesión); o un planos.json escrito a mano con --planos | `planos.json` |
| 6 | `estilo` | código | reglas del preset --estilo (dinamico, cine, sobrio; src/storytelling/estilo.ts); o un estilo.json escrito a mano con --estilo x.json | `estilo.json` |
| 7 | `montaje` | código | tiempos de palabras.json; revisa también planos.json editado a mano | `pelicula.json` |
| 8 | `imagenes` | proveedor | config/medios.json, en orden: stock (Pexels, Wikimedia Commons, Openverse), nube (OpenRouter) o local (el modelo de esta máquina); placas no hace ninguna | — |
| 9 | `musica` | código | pistas de dominio público de kit/biblioteca/musica, según el ánimo de cada momento (--musica pistas\|sintetizada\|no); o un musica.json escrito a mano con --musica x.json | `musica.json` |
| 10 | `sonido` | código | efectos de lámina sintetizados (scripts/explica/sonido.ts) + muestras grabadas en cada transición (kit/biblioteca/sonidos/muestras) + la música del paso musica | — |
| 11 | `render` | código | Remotion (2D, sin three.js) | `mudo.mp4` |
| 12 | `mezcla` | código | paso mezcla de Tinta: ffmpeg | `film.mp4` |
| 13 | `revision_final` | revisión | ffmpeg (hoja) + el asistente o una persona (mirarla) | `hoja.png` |

### Looks (`look` en la dirección)

| Look | Cómo es |
| --- | --- |
| `papel` | papel crema arrugado, letra negra apretada y marcador naranja; recortes en blanco y negro. Para temas de psicología cotidiana y humor |
| `noche` | fondo negro, siluetas blancas que brillan y acento violeta; frío y tecnológico. Para atención, pantallas, trabajo y datos |
| `brasa` | fondo negro con resplandor naranja, letra que brilla; íntimo y épico. Para mentalidad, deporte y superación |

### Actos

| Acto | Qué es |
| --- | --- |
| `gancho` | escena cotidiana dramatizada, en segunda persona o con diálogo, que termina en un remate |
| `tesis` | la idea del video dicha en una frase corta, como una ley o un nombre |
| `historia` | un caso concreto con nombre propio: una persona, una empresa o un estudio |
| `mecanismo` | por qué pasa: la explicación, con sus datos |
| `ejemplos` | dos o tres situaciones cotidianas donde se nota |
| `giro` | el reencuadre: lo que casi nadie ve de esa idea |
| `aplicacion` | qué hacer con eso, hablándole de tú a quien mira |
| `cierre` | frase final que regresa a la escena del gancho |

### Estilos (`--estilo`)

| Preset | Carácter | Subtítulos | Color |
| --- | --- | --- | --- |
| `dinamico` | llamativo, para redes: barridos, fogonazos y acercamientos de golpe; subtítulos condensados con la palabra que suena resaltada; el narrador, palabra por palabra | bloque / karaoke / abajo | el del look |
| `cine` | pausado, de documental: fundidos con cambio de foco, iris en los remates, cámara lenta; subtítulos limpios que se van armando | limpio / acumula / abajo | cine |
| `sobrio` | como los cortos de referencia: solo cortes secos y avance lento; subtítulos que se encienden palabra por palabra | limpio / pagina / alterna | neutro |

### Transiciones (`transicion` en `estilo.json`)

| Transición | Dura | Qué hace |
| --- | --- | --- |
| `corte` | 0 s | corte seco |
| `golpe` | 0.2 s | entra más cerca y se asienta: acercamiento de golpe |
| `latigo` | 0.22 s | barrido lateral rápido con estela |
| `empuje` | 0.32 s | el plano nuevo sube y empuja al anterior |
| `destello` | 0.3 s | fogonazo blanco que se apaga |
| `fallo` | 0.2 s | interferencia digital: saltos y franjas |
| `disolver` | 0.34 s | fundido cruzado con cambio de foco |
| `iris` | 0.42 s | se abre en círculo desde el punto de foco |

### Cámara, enfoque y color

| Campo | Valor | Qué hace |
| --- | --- | --- |
| `camara` | `empujar` | avanza despacio hacia el foco |
| `camara` | `alejar` | retrocede y abre el cuadro |
| `camara` | `paneo_izq` | recorre hacia la izquierda |
| `camara` | `paneo_der` | recorre hacia la derecha |
| `camara` | `subir` | sube |
| `camara` | `bajar` | baja |
| `camara` | `mano` | cámara en mano: deriva y gira apenas |
| `camara` | `quieta` | fija |
| `enfoque` | `fijo` | todo nítido |
| `enfoque` | `entrar` | empieza desenfocado y enfoca |
| `enfoque` | `selectivo` | nítido solo alrededor del foco; el resto, desenfocado como con lente abierto |
| `grado` | `neutro` | solo contraste |
| `grado` | `cine` | sombras verde azuladas, luces ámbar y halo en las luces |
| `grado` | `frio` | azulado y poco saturado, con halo |
| `grado` | `calido` | ámbar, con halo |
| `grado` | `bn` | blanco y negro contrastado |

### Subtítulos (`texto` en `estilo.json`)

| Campo | Valor | Qué hace |
| --- | --- | --- |
| `estilo` | `limpio` | grotesca blanca con resplandor |
| `estilo` | `bloque` | condensada en mayúsculas con borde negro grueso |
| `estilo` | `caja` | texto sobre caja oscura; la palabra que suena, sobre caja de color |
| `estilo` | `contorno` | letras huecas que se rellenan al decirse |
| `aparece` | `pagina` | la frase espera atenuada y cada palabra se enciende al decirse |
| `aparece` | `acumula` | cada palabra aparece al decirse y se queda |
| `aparece` | `karaoke` | la frase está completa y la palabra que suena se resalta |
| `aparece` | `palabra` | una sola palabra a la vez, grande |
| `aparece` | `maquina` | se escribe letra por letra, con cursor |
| `posicion` | `alterna` | arriba y abajo, alternando por plano |
| `posicion` | `arriba` | arriba |
| `posicion` | `centro` | al centro |
| `posicion` | `abajo` | tercio inferior |

## Explica

| Transición (`entrada`) | Dura |
| --- | --- |
| `corte` | 0 s |
| `fundido` | 0.4 s |
| `deslizar` | 0.45 s |
| `barrido` | 0.45 s |
| `iris` | 0.6 s |
| `reloj` | 0.6 s |
| `latigo` | 0.3 s |
| `golpe` | 0.26 s |
| `destello` | 0.36 s |

## Tinta

### Pasos

| # | Paso | Quién | Con qué | Deja |
| --- | --- | --- | --- | --- |
| 1 | `entorno` | código | ffmpeg, disco, clave del LLM pedido, los modelos de esta máquina si se usan, y el catálogo de muebles | — |
| 2 | `voz` | proveedor | config/medios.json: el comando de voz de esta máquina, ElevenLabs o sin voz; luego se mide cada palabra | `palabras.json` |
| 3 | `reparto` | LLM | LLM del perfil --llm (por defecto, el asistente de la sesión) | `reparto.json` |
| 4 | `imagenes` | proveedor | el modelo de imagen de esta máquina o FLUX en la nube (fal); las fotos de banco no sirven para sacar un modelo 3D | — |
| 5 | `modelos` | proveedor | el comando de imagen a 3D de esta máquina (config/local.json, modelo3d) | — |
| 6 | `tomas` | LLM | LLM del perfil --llm (por defecto, el asistente de la sesión) | `pelicula.json` |
| 7 | `revision_modelos` | revisión | Remotion (hoja) + el asistente o una persona (mirarla) | — |
| 8 | `sonido` | código | efectos de objeto sintetizados (kit/biblioteca/sonidos) + muestras grabadas en los cortes + música de kit/biblioteca/musica según el tono de cada toma | — |
| 9 | `render` | código | Remotion + three.js (estilo tinta) | `mudo.mp4` |
| 10 | `mezcla` | código | ffmpeg | `film.mp4` |
| 11 | `revision_final` | revisión | ffmpeg (hoja) + el asistente o una persona (mirarla) | `hoja.png` |

### Escenarios y lugares

| Escenario | Cómo es | Lugares |
| --- | --- | --- |
| `sala` | sala de una casa vista en corte desde arriba: pared del fondo con ventana, pared izquierda con puerta, sillón, librero, lámpara, mesita, mueble de tele y alfombra. Para mostrar lo que pasa dentro de una casa. | `pared_fondo`, `pared_izquierda`, `mesa`, `mueble_tv`, `piso_centro`, `piso_entrada`, `piso_fondo` |
| `repisa` | nicho en la pared con dos repisas de madera, visto de frente. Para aparatos de un sistema: monitor arriba, grabadora y respaldo de energía abajo, panel en la pared. | `repisa_alta`, `repisa_baja_izquierda`, `repisa_baja_derecha`, `pared_alta`, `piso` |
| `estudio` | fondo liso de papel con una base redonda. Para mostrar un objeto solo, de cerca, o explicar sus partes. | `centro` |
| `patio` | patio con un árbol grande al centro (tronco alto y grueso, copa arriba), barda de block al fondo y pasto. Para cosas que se construyen en el árbol o a su alrededor, por etapas. | `plataforma`, `tronco_alto`, `pie_del_arbol`, `piso_lado`, `piso_frente` |
| `orbita` | la Tierra vista desde el espacio, con satélites en órbita alrededor y arriba, sobre un fondo azul noche con estrellas. Para satélites, señales que bajan del espacio y aparatos en la superficie. | `superficie`, `sat_izquierda`, `sat_derecha`, `sat_arriba`, `sat_lejos` |
| `tarima` | tarima redonda frente a una pared lila, con un presentador a la izquierda. Para mostrar, uno tras otro, los objetos de los que habla alguien. | `centro`, `izquierda` |
| `cosmos` | espacio profundo con estrellas sobre fondo azul noche, sin Tierra. Para un astro grande al centro (el Sol, la Luna, Marte), uno a la vez, y cosas que lo rodean. | `centro`, `alrededor_izquierda`, `alrededor_derecha`, `alrededor_arriba`, `alrededor_abajo` |
| `tablero` | mueble de pared con seis huecos (tres filas de dos) y un lugar arriba al centro, como un rompecabezas: cada hueco guarda una pieza de un conjunto. | `arriba_izquierda`, `arriba_derecha`, `medio_izquierda`, `medio_derecha`, `abajo_izquierda`, `abajo_derecha`, `remate` |

**Acciones:** `aparece`, `desaparece`, `pulso`, `cono`, `entra`, `gira`, `falla`, `cae`, `lluvia`.

**Entradas de toma (`entrada`):** `corte` (0 s), `golpe` (0.2 s), `latigo` (0.24 s), `destello` (0.3 s).

## Plantillas

| # | Paso | Lee | Deja |
| --- | --- | --- | --- |
| 1 | `factcheck` | `guion.md` | `facts.md` |
| 2 | `catalogo` | `guion.md` | `props.json` |
| 3 | `brief` | `guion.md` | `brief.json` |
| 4 | `art` | `guion.md`, `brief.json` | `world.json` |
| 5 | `assets` | `world.json` | `assets/hero.json` |
| 6 | `tomas` | `guion.md`, `world.json`, `assets/hero.json` | `tomas.json` |
| 7 | `storyboard` | `guion.md`, `world.json`, `props.json`, `tomas.json` | `storyboard.json` |
| 8 | `chips` | `guion.md`, `storyboard.json` | `film_chips.json` |
| 9 | `sound` | `storyboard.json` | `sound.json` |
| 10 | `merge` | `storyboard.json`, `film_chips.json` | `film_storyboard.json` |
| 11 | `voice` | `storyboard.json` | `voice.wav`, `timing.json` |
| 12 | `bed` | `storyboard.json`, `timing.json`, `sound.json`, `world.json` | `bed.wav` |
| 13 | `render` | `film_storyboard.json`, `timing.json`, `world.json`, `assets/hero.json`, `props.json`, `tomas.json` | `silent.mp4` |
| 14 | `mix` | `silent.mp4`, `voice.wav`, `bed.wav`, `efectos.wav` | `film.mp4` |

## Música (`kit/biblioteca/musica`)

| Ánimo | Qué se busca |
| --- | --- |
| `tension` | suspenso: algo está por pasar |
| `curiosidad` | pulso constante de quien investiga o explica |
| `oscuro` | grave e inquietante: la mala noticia |
| `esperanza` | cálido y abierto: la salida |

| Pista | Ánimo | Looks | Dura | Cómo suena | Origen y licencia |
| --- | --- | --- | --- | --- | --- |
| `investigacion_oscura` | tension | todos | 48 s | Partitura oscura y misteriosa, pensada para ir debajo de diálogos | [Unsolved Investigation](https://opengameart.org/content/unsolved-investigation), isaiah658. CC0 1.0 |
| `expediente` | tension | noche | 58 s | Misterio de ciencia ficción que va creciendo | [The Y Files](https://opengameart.org/content/the-y-files), TAD. CC0 1.0 |
| `detective` | curiosidad | papel | 56 s | Música de detective, en bucle | [Investigation](https://opengameart.org/content/investigation-0), Umplix. CC0 1.0 |
| `lofi` | curiosidad | papel, brasa | 123 s | Lofi hip hop tranquilo, de piano eléctrico | [Chill lofi inspired](https://opengameart.org/content/chill-lofi-inspired), omfgdude. CC0 1.0 |
| `synthwave` | curiosidad | noche | 180 s | Synthwave relajado de sintetizadores | [Calm Relax 1 (Synthwave 421k)](https://opengameart.org/content/calm-relax-1-synthwave-421k), cynicmusic (The Cynic Project). CC0 1.0 |
| `ecos` | oscuro | todos | 48 s | Ambiente inquietante, en la línea de Silent Hill | [Echoes of the Past](https://opengameart.org/content/echoes-of-the-past), isaiah658. CC0 1.0 |
| `desangre` | oscuro | todos | 158 s | Lento y dramático, de cámara lenta | [Bleeding out](https://opengameart.org/content/bleeding-out), Brandon Morris. CC0 1.0 |
| `piano_bateria` | esperanza | papel, brasa | 64 s | Piano con batería: algo melancólico, pero esperanzado | [Piano & Drums, positive melancholy](https://opengameart.org/content/piano-drums-positive-melancholy-212), Dizzy Crow. CC0 1.0 |
| `revelacion` | esperanza | todos | 85 s | Acústico, meditativo y calmado | [Revelation](https://opengameart.org/content/revelation), Indieteur. CC0 1.0 |
| `momentos` | esperanza | papel | 77 s | Tema pequeño de piano | [Happy moments](https://opengameart.org/content/happy-moments), Centurion_of_war. CC0 1.0 |

## Sonidos de corte (`kit/biblioteca/sonidos/muestras`)

| Muestra | Cómo suena | Cuándo | Origen y licencia |
| --- | --- | --- | --- |
| `barrido` | Barrido corto, limpio y aireado | corte de látigo: entra una lámina o cambia la imagen de golpe | [Barrido sintetizado por código](kit/biblioteca/sonidos/barrido.mjs), idea-a-video. CC0 1.0 |
| `campanita` | Campanita brillante de dos notas | entra un letrero con una cifra o un dato que se revela | [Campanita sintetizada por código](kit/biblioteca/sonidos/campanita.mjs), idea-a-video. CC0 1.0 |
| `barrido_grave` | Barrido grave y largo, de tráiler | apertura en iris o cambio de acto | [Cinematic Woosh SFX-010.wav](https://freesound.org/people/AudioPapkin/sounds/648729/), AudioPapkin. CC0 1.0 |
| `impacto` | Golpe grave con cola | destello: llega la tesis o el giro | [Sound Design Elements Impact SFX PS 017](https://freesound.org/people/AudioPapkin/sounds/755054/), AudioPapkin. CC0 1.0 |
| `subgolpe` | Bombo seco y grave | acercamiento de golpe sobre la misma imagen | [Hard_Subby_Kick.mp3](https://freesound.org/people/NoirPantalon/sounds/102130/), NoirPantalon. CC0 1.0 |
| `subida` | Subida corta que termina en el corte | anticipa el destello de la tesis o el giro | [ENERGY RISER 2](https://freesound.org/people/magnuswaker/sounds/523057/), magnuswaker. CC0 1.0 |
| `fallo` | Interferencia digital | corte con fallo de señal | [Digital Glitch_v1.wav](https://freesound.org/people/tadaizm/sounds/458065/), tadaizm. CC0 1.0 |
| `obturador` | Obturador de cámara | entra una foto de archivo o una cita | [Camera Shutter](https://freesound.org/people/roachpowder/sounds/170229/), roachpowder. CC0 1.0 |
