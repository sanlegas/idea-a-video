---
name: idea-a-video
description: Genera videos verticales narrados en español (shorts, reels, TikTok) a partir de un tema o de un guion, con voz, imágenes, subtítulos, transiciones, efectos de sonido y música. Úsala cuando pidan hacer un video explicativo o de storytelling, un explicativo 2D con gráficas, un video 3D ilustrado, cambiar el estilo, la voz, las imágenes o la música de un video ya hecho, o saber qué puede generar su computadora y qué claves necesita.
---

# idea-a-video

Motor que convierte una idea (un tema, o un guion ya escrito) en un video vertical de 1080×1920. Tú, el asistente, lo operas con comandos en la carpeta de trabajo del usuario: escribes el guion, respondes los pedidos que el motor te deja en archivos y revisas el resultado. El motor valida todo lo que escribes.

Funciona sin ninguna clave: tú haces de LLM, la voz es la del sistema operativo y las imágenes son fotos libres. Con claves mejora la voz (ElevenLabs) y las imágenes (FLUX en fal). También puede trabajar solo en local: nada sale del equipo del usuario.

## Primer uso: asistente inicial

Si el motor no está instalado, o `pnpm asistente --estado` empieza con "Primera vez", guía al usuario antes de nada más. Son un par de minutos y pocas preguntas. Guion de la conversación y ejemplos en [references/primer-uso.md](references/primer-uso.md).

1. **Instala el motor** en una carpeta del usuario (pregunta dónde; por defecto `./idea-a-video`):
   ```
   node <carpeta de esta skill>/scripts/instalar.mjs <carpeta destino>
   ```
   Pide Node 20 o más nuevo y pnpm; si falta algo, dice cómo instalarlo. Al terminar imprime el estado del asistente. Se repite con `pnpm asistente --estado`.
2. **Revisa lo que falta instalar.** El estado empieza por "Lo que necesita tu equipo": si dice `ANTES DE SEGUIR` o un requisito obligatorio con `FALTA` (ffmpeg, pnpm, Node, disco), dale al usuario el comando de su sistema que trae esa línea, espera a que lo instale y repite `pnpm asistente --estado`. Sin eso no sale ningún video. Lo marcado como opcional (Whisper, voz propia) se ofrece después, no ahora.
3. **Resume en cuatro o cinco líneas**, sin pegar las tablas: qué plantillas están listas en su máquina y con qué voz e imágenes saldrían hoy sus videos.
4. **Haz una sola pregunta: ¿cómo quiere trabajar?** Son los tres modos de "Cómo trabajar"; di en una línea qué daría cada uno en su máquina, como lo imprime `--estado`:
   - `auto` (recomendado): usa lo que haya; sin claves sale gratis, con la voz del sistema y fotos libres. `pnpm asistente --recomendado`.
   - `nube`: lo mejor, voz natural de ElevenLabs e imágenes hechas para cada plano con FLUX. Pide `ELEVENLABS_API_KEY` y `FAL_KEY`, y se cobra en sus cuentas: dile el costo que trae la línea. `pnpm asistente --guardar modo=nube`.
   - `local`: nada sale de su equipo al hacer un video; escenas 3D con modelos del catálogo y dibujos 2D, voz propia o del sistema. Deja la plantilla `medida` si no tiene un comando de imagen. Antes del primer video, prueba una vez `pnpm asistente --estado --webgl` (medio minuto): sin WebGL no se renderizan las plantillas 3D. `pnpm asistente --guardar modo=local`.

   Si quiere elegir más (plantilla, voz, imágenes, música), pregunta de una en una con las opciones de `--estado` y guarda todo junto: `pnpm asistente --guardar modo=… plantilla=… musica=…`. Si tu entorno tiene una herramienta para preguntar con opciones, úsala; si no, una lista numerada.
5. **Di los avisos** que imprime al guardar bajo "Antes del primer video": una clave que falta, WebGL sin probar o una plantilla que no sale completa. **Nunca pidas una clave en el chat ni la escribas tú**: el usuario copia `.env.example` a `.env` y la pone. En modo local, ofrece lo opcional que imprime al final (Whisper, voz propia), sin insistir.
6. **Ofrece el primer video** ahí mismo: pide un tema y sigue "Hacer un video".

Si el usuario llegó con un pedido concreto ("hazme un video sobre X"), no lo frenes con preguntas: instala, revisa que no falte nada obligatorio, corre `pnpm asistente --recomendado`, dile en una línea qué quedó elegido y que se cambia cuando quiera (por ejemplo a `nube` o `local`), y haz el video.

Cuando pida cambiar su configuración ("otra voz", "sin música", "quiero videos más cortos"), es el mismo asistente: `pnpm asistente --estado` y `--guardar` solo con lo que cambia.

Todos los comandos de abajo se corren dentro de la carpeta del motor.

## Plantillas

Una plantilla es un tipo de video ya armado: un flujo con su estilo y su duración. `pnpm video` usa la que el usuario eligió en el asistente; `--plantilla <id>` usa otra solo en ese video. No es lo mismo que el flujo `plantillas`, que es uno de los que una plantilla puede usar.

| El usuario quiere | Plantilla | Flujo y referencia |
| --- | --- | --- |
| Una idea contada como historia, con fotos y láminas (~75 s) | `historia` | `storytelling`: [flujo-storytelling.md](references/flujo-storytelling.md) |
| Lo mismo en breve, para redes (~45 s) | `corto` | `storytelling` |
| Ritmo pausado, fundidos y subtítulos limpios (~90 s) | `documental` | `storytelling`, estilo `cine` |
| Cortes secos y subtítulos discretos (~60 s) | `sobrio` | `storytelling`, estilo `sobrio` |
| Cifras, gráficas y texto animado en 2D, sin voz | `datos` | `explica`: [flujo-explica.md](references/flujo-explica.md) |
| 3D con aspecto dibujado: objetos sobre maquetas | `ilustrado` | `tinta`: [flujo-tinta.md](references/flujo-tinta.md) |
| 3D de gran escala: ciudad, torre, barco | `mundo` | `plantillas`: [flujo-plantillas.md](references/flujo-plantillas.md) |
| 3D con escenas inventadas para ese guion | `medida` | `estudio`: [flujo-estudio.md](references/flujo-estudio.md) |

`pnpm video --plantillas` las lista; `pnpm video` sin argumentos dice cuál es la de siempre y cómo se usa. Cada flujo se puede correr también por su nombre con todas sus opciones: `pnpm flujo` los lista y `pnpm flujo <flujo> --ayuda` muestra las de uno.

## Hacer un video

Para "hazme un video sobre X" con una plantilla de storytelling (`historia`, `corto`, `documental`, `sobrio`). Con otra plantilla, sigue la referencia de su flujo: cambia lo que entra, el ciclo de pedidos es el mismo.

1. **Escribe el guion** en `guiones/storytelling/<nombre>.md` siguiendo [references/flujo-storytelling.md](references/flujo-storytelling.md) y [references/gancho.md](references/gancho.md): una frase por línea; la primera frase es el gancho (5 a 16 palabras, directo al tema, algo que se pueda mostrar) y enuncia la tesis; los demás actos (historia, mecanismo, ejemplos, giro, aplicación, cierre) van solo si el texto los tiene. El largo lo fija el guion: unas 2.6 palabras por segundo de video, así que la plantilla `historia` (75 s) pide unas 195 palabras y `corto` (45 s), unas 115. No inventes datos: cita solo lo que el usuario te dio o lo que puedas verificar, y dile qué afirmaciones debe revisar.
2. **Corre la plantilla:**
   ```
   pnpm video <nombre> --guion guiones/storytelling/<nombre>.md
   ```
   Con `--tema "…"` en vez de `--guion`, el motor te pide el guion a ti con el largo de la plantilla ya calculado.
3. **Responde los pedidos.** Cuando el comando termina con código 3, te dejó un pedido: lee el archivo `.pedido.md` que nombra, escribe la respuesta en el archivo `.respuesta.json` que indica y repite el mismo comando. Si tu respuesta no pasa la revisión, el pedido trae las correcciones. Detalle en [references/pedidos.md](references/pedidos.md).
4. **Revisa** `runs/storytelling/<nombre>/hoja.png` (un cuadro por plano, en orden) antes de entregar, y lee las últimas líneas de la corrida: una que empieza con `ATENCIÓN` dice que algún plano quedó sin imagen. Si un plano salió mal, corrígelo en `planos.json` de la corrida y repite con `--desde montaje`.
5. **Entrega** `runs/storytelling/<nombre>/film.mp4` y dile al usuario qué proveedor se usó para voz e imágenes, y si alguna foto de banco pide crédito (`creditos.json`).

Antes de gastar tiempo o dinero, `--plan` muestra los pasos, el tiempo y el costo estimados sin correr nada.

## Reglas

- **Di qué se eligió.** Cada corrida imprime el proveedor de voz e imágenes y por qué. Repíteselo al usuario, sobre todo si el video salió sin voz o con fotos de banco.
- **Pregunta antes de gastar.** Los pasos con clave cuestan dinero del usuario. Con ElevenLabs, fal o un LLM por API activos, corre `--plan` y confirma antes de una corrida larga.
- **No rehagas de más.** Los pasos terminados se saltan. Para cambiar solo el estilo: `--estilo cine --desde estilo`. Solo la música: `--solo musica`, `--solo sonido`, `--solo mezcla`.
- **Los hechos son del usuario.** El motor no verifica datos. Marca cada cifra, nombre o estudio del guion para que el usuario lo confirme.
- **Mira lo que salió.** Con fotos de banco pueden aparecer personas reales, marcas o imágenes que no vienen al caso. Abre `hoja.png`, y si un plano no sirve, cambia su `busca_en` (o su `imagen_en`) y repite `--desde montaje`.
- **Modelos 3D ya hechos.** Para un video `medida` (flujo estudio), antes de correrlo busca en el catálogo los objetos y personajes del guion: `pnpm modelos buscar <palabra>`. Los que sirvan entran con `--modelos a,b`. Detalle en [flujo-estudio.md](references/flujo-estudio.md).
- **Estudio en local.** Sin `FAL_KEY` ni comando de imagen (o con `modo=local`), Estudio corre en modo local: cada escena usa modelos 3D del catálogo o un dibujo 2D hecho con código, sin servicios externos. `--sin-imagenes` lo fuerza aunque haya clave. En computadoras con poca GPU (o sin ella) agrega `--ligero`: renderiza unas cuatro veces más rápido. Si `pnpm diagnostico --webgl` no da WebGL, Estudio no puede renderizar.
- **Si no puedes ver imágenes**, no respondas pedidos que traen una: usa `--llm openrouter` en esos pasos (Estudio, Plantillas con tomas nuevas) y avisa que pide clave.

## Referencias

- [primer-uso.md](references/primer-uso.md): el asistente inicial, paso a paso: qué decir, qué preguntar y qué se guarda.
- [inicio.md](references/inicio.md): requisitos, instalación por sistema operativo y por asistente, primer video.
- [maquina.md](references/maquina.md): qué necesita cada flujo y cómo leer el diagnóstico.
- [proveedores.md](references/proveedores.md): voz, imágenes, LLM, 3D y transcripción; local, nube y sin clave; variables de entorno.
- [pedidos.md](references/pedidos.md): cómo respondes cuando haces de LLM.
- [gancho.md](references/gancho.md): los primeros 5 a 10 segundos de cualquier guion y la apertura audiovisual, en todos los flujos.
- [edicion.md](references/edicion.md): estilos, transiciones, subtítulos, sonidos y música.
- [opciones.md](references/opciones.md): todas las opciones y sus valores por defecto, generado del código.
- [licencias.md](references/licencias.md): qué licencia tiene cada pieza y qué debe saber quien publica.
- [problemas.md](references/problemas.md): errores comunes y su arreglo.
