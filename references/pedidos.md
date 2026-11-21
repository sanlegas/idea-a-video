# Pedidos: cuando el asistente hace de LLM

Por defecto (`--llm sesion`) los pasos que necesitan un modelo de lenguaje te los pide a ti, el asistente que opera la sesión. No hace falta ninguna clave.

## Cómo funciona

1. El flujo llega a un paso de LLM y no encuentra respuesta. Escribe el pedido en la carpeta de la corrida y termina con **código de salida 3**. No es un error.
   ```
   El paso "planos" espera una respuesta de la sesión.
     1. Lee runs/storytelling/mi-video/pedidos/planos-a032afa95c.pedido.md
     2. Escribe la respuesta en runs/storytelling/mi-video/pedidos/planos-a032afa95c.respuesta.json
     3. Repite el mismo comando
   ```
2. Lees el `.pedido.md`. Trae las instrucciones del paso, la entrada (por ejemplo, la narración con cada palabra numerada) y el esquema JSON que debe cumplir la respuesta.
3. Escribes la respuesta en el archivo que indica: `.respuesta.json` (solo JSON, sin texto alrededor) o `.respuesta.txt` cuando el paso pide código o texto.
4. Repites exactamente el mismo comando, con las mismas opciones (también `--desde`, si lo llevaba: lo ya hecho con la misma entrada se reutiliza). El flujo lee tu respuesta, la revisa y sigue hasta el siguiente pedido o hasta terminar.

pnpm puede añadir una línea como `Command failed with exit code 3`: es su forma de decir que el comando no terminó con 0. Con código 3 no hubo fallo, hay un pedido.

## Si la respuesta se rechaza

El motor revisa tu respuesta igual que la de cualquier modelo: forma del JSON y reglas del paso (tramos seguidos, duraciones, nombres que existen). Si algo falla:

- Tu archivo pasa a llamarse `.rechazada-1.json` (queda de registro).
- El `.pedido.md` gana una sección **Correcciones a tu respuesta anterior** con cada problema.
- Corriges, escribes de nuevo la `.respuesta.json` y repites el comando.

Lee las correcciones completas antes de reescribir: suelen ser varias y todas deben quedar resueltas.

## Consejos

- **Respeta los índices.** Los pasos de corte trabajan con números de palabra o de frase, no con segundos. El primer tramo empieza en 0, cada uno empieza donde termina el anterior y el último llega al final.
- **No cambies el pedido.** El nombre del archivo sale del contenido del pedido: si la entrada cambia (otro guion, otra voz), el flujo deja un pedido nuevo y el anterior queda sin uso. En Storytelling y Tinta, pasar un guion distinto al de la última corrida rehace desde la voz por sí solo y lo avisa.
- **Pedidos con imagen.** Algunos pasos piden mirar una imagen (hoja de cuadros de una escena o de un video). Ábrela antes de responder. Si no puedes ver imágenes, corre ese flujo con `--llm openrouter`.
- **Abre fuerte.** Al escribir un guion o cortar escenas, planos o tomas, la primera frase y el primer plano siguen [gancho.md](gancho.md); el código rechaza un saludo, una primera frase fuera de 5 a 16 palabras o un primer plano largo o abierto.
- **Una respuesta por pedido.** Una corrida puede dejar varios pedidos, uno tras otro. Estudio deja muchos (varias rondas por escena): va más rápido con una clave de LLM.

## Qué pasos piden respuesta

| Flujo | Pasos |
| --- | --- |
| Storytelling | `guion` (solo con `--tema`), `direccion`, `planos` |
| Tinta | `reparto`, `tomas` |
| Plantillas | `catalogo`, `brief`, `art`, `tomas`, `storyboard`, `chips`, `sound` |
| Estudio | ideas; con Blender, `modelos` (cuáles faltan), `modelo` (código Python de cada uno) y su crítica con imagen; dirección de cada escena, programa de cada escena, crítica con imagen y sonido |

En Storytelling también puedes entregar las respuestas como archivos propios, sin esperar el pedido: `--direccion x.json`, `--planos x.json`, `--estilo x.json`, `--musica x.json`.

## Usar un modelo por API en vez de la sesión

`--llm openrouter`, `--llm deepseek` o `--llm local` (un servidor compatible con OpenAI; su dirección va en `LM_BASE`). Los perfiles están en `config/models.json`: cada uno dice qué modelo responde cada paso. Para que sea el valor por defecto, pon `LLM_PERFIL=openrouter` en `.env`.
