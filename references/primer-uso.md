# Primer uso: el asistente inicial

La primera vez que alguien usa la skill, el asistente inicial lo deja listo en un par de minutos: revisa que su máquina tenga lo necesario y dice cómo instalar lo que falte, le deja elegir cómo trabajar (lo que haya, la nube o solo su equipo), un tipo de video (una plantilla) y de dónde salen la voz, las imágenes y la música, y lo guarda. Desde ahí, `pnpm video` hace un video sin nombrar ninguna opción.

Hay dos formas de pasarlo, y hacen lo mismo:

- **Con un asistente de IA** (Claude Code, Codex u otro): el asistente corre los comandos, resume y pregunta en el chat. Es lo que describe esta página.
- **A mano, en una terminal:** `pnpm asistente` dice qué falta instalar y hace de tres a seis preguntas con opciones numeradas; Enter acepta la recomendada.

## Cuándo toca

- El motor no está instalado en la carpeta de trabajo.
- `pnpm asistente --estado` empieza con "Primera vez en esta carpeta". Lo que lo decide es que no exista `config/preferencias.json`.
- El usuario pide cambiar su configuración: es el mismo asistente, solo con lo que cambia.

## Los pasos, para el asistente de IA

### 1. Instalar

```
node <carpeta de la skill>/scripts/instalar.mjs <carpeta destino>
```

Pregunta antes dónde; por defecto `./idea-a-video`. Tarda unos minutos la primera vez (dependencias y unos 60 MB de música). Al terminar imprime el estado del asistente. Si faltan Node 20 o pnpm, el instalador se detiene y dice cómo instalarlos: díselo al usuario y repite.

### 2. Leer el estado y revisar lo que falta

```
pnpm asistente --estado        # para leer
pnpm asistente --estado --webgl  # además prueba WebGL con un cuadro 3D (medio minuto); el resultado queda guardado
pnpm asistente --json          # lo mismo como datos
```

Trae, en orden:

1. **Lo que necesita tu equipo.** Cada requisito con su estado y el comando para instalarlo en ese sistema:

   | Requisito | Tipo | Para qué |
   | --- | --- | --- |
   | Node 20, pnpm, ffmpeg y ffprobe, 2 GB libres | obligatorio | todo: sin ellos no sale ningún video |
   | WebGL en el navegador de render | 3D | las plantillas `medida`, `ilustrado` y `mundo`, y el modo local; `sin probar` hasta correr `--webgl` |
   | Whisper | opcional | subtítulos exactos a la palabra sin ElevenLabs |
   | Voz propia (Piper u otro comando) | opcional | voz natural sin pagar |

   Si falta uno obligatorio, el estado empieza con `ANTES DE SEGUIR`. Dale al usuario el comando de su línea (por ejemplo `brew install ffmpeg`), espera a que lo instale y repite `--estado`. No sigas con las preguntas hasta que no falte nada obligatorio. Lo opcional se ofrece al final, sin insistir.
2. **Cómo trabajar:** los tres modos, con lo que daría cada uno en esa máquina, lo que le falta y lo que cuesta.
3. Las claves que hay (solo nombres), cada plantilla con su estado (`lista`, `limitada` o `no disponible`, y por qué), las opciones de voz, imágenes, música y quién escribe, y qué elegiría `auto` hoy.

No cambia nada.

### 3. Resumir

Cuatro o cinco líneas, en palabras del usuario. No pegues las tablas. Un ejemplo, para una máquina sin claves:

> Tu equipo tiene todo lo necesario y puede hacer ya los ocho tipos de video. Hoy saldrían con la voz del sistema y fotos libres de bancos de imágenes, sin costo. Puedes trabajar así, pasar a la nube para que la voz suene natural y cada imagen se haga para su plano, o quedarte solo en tu equipo, con escenas 3D y dibujos hechos por código.

### 4. Una pregunta: ¿cómo quieres trabajar?

| Modo | Qué hace | Qué pide | Guardar |
| --- | --- | --- | --- |
| `auto` (recomendado) | Usa lo que haya: un comando propio, una clave si está, o lo gratis (voz del sistema, fotos libres). Mejora solo cuando llega una clave | nada | `pnpm asistente --recomendado` |
| `nube` | Voz de ElevenLabs e imágenes hechas para cada plano con FLUX en fal | `ELEVENLABS_API_KEY` y `FAL_KEY` en `.env`; se cobra en sus cuentas (imágenes ~$0.003 cada una; la voz clonada pide un plan de pago de ElevenLabs) | `pnpm asistente --guardar modo=nube` |
| `local` | Nada sale de su equipo al hacer un video: voz propia o del sistema, escenas 3D con modelos del catálogo y dibujos 2D, sin fotos de banco. Sin comando de imagen, la plantilla pasa a `medida`: las de storytelling saldrían con placas de texto | WebGL (pruébalo con `--webgl`); la primera vez se descargan gratis el navegador de render y paquetes de modelos | `pnpm asistente --guardar modo=local` |

Di qué daría cada modo en su máquina, tal como lo imprime `--estado`. Un modo fija voz, imágenes y quién escribe; lo que se nombre aparte gana (`modo=nube voz=sistema`).

Si quiere elegir más, las preguntas de abajo, de una en una. Si tu entorno tiene una herramienta para preguntar con opciones, úsala; si no, una lista numerada corta. Salta la pregunta que solo tenga una opción útil en esa máquina, y en `nube` o `local` no preguntes voz ni imágenes: el modo ya las fija.

| Pregunta | Opciones | Notas |
| --- | --- | --- |
| ¿Qué tipo de video harás más seguido? | Las plantillas de `--estado` | Ofrece primero las que están `lista`. Es la de siempre, no la única: cualquier video puede usar otra con `--plantilla` |
| ¿De dónde sale la voz? | `auto`, `elevenlabs`, `sistema`, `borrador` (y `local` si hay comando propio) | `auto` basta casi siempre: usa lo mejor que haya y mejora solo cuando llega una clave |
| ¿De dónde salen las imágenes? | `auto`, `nube,stock`, `stock`, `placas` (y `local`) | Con fotos de banco pueden salir personas reales o imágenes que no vienen al caso: avísalo |
| ¿Música de fondo? | `pistas`, `sintetizada`, `no` | `pistas` cambia de pista con el momento del video |

Hay tres ajustes más que solo se preguntan si el usuario los menciona: `estilo` (`dinamico`, `cine`, `sobrio`) y `segundos` (15 a 240) para las plantillas de storytelling, y `llm`, que dice quién escribe guion, dirección y planos. Por defecto es `sesion`: tú. Con `openrouter` o `deepseek` los escribe un modelo en la nube y no quedan pedidos para ti.

```
pnpm asistente --guardar modo=local plantilla=ilustrado musica=pistas
pnpm asistente --guardar plantilla=corto voz=auto imagenes=stock musica=pistas
pnpm asistente --guardar plantilla=documental segundos=120          # solo lo que se nombra cambia
pnpm asistente --guardar llm=openrouter
```

Una elección que no existe no guarda nada y dice cuáles hay.

### 5. Decir los avisos

Al guardar, el comando imprime qué quedó, qué usará `auto`, y bajo **"Antes del primer video"** lo que falta: algo obligatorio sin instalar, una clave que la elección pide, WebGL sin probar para una plantilla 3D, un comando propio sin declarar, o una plantilla que esta máquina no puede correr completa. Díselo al usuario tal cual. En modo local, al final imprime lo opcional que mejoraría el resultado sin costo (Whisper, voz propia): ofrécelo una vez.

**Claves:** nunca las pidas en el chat ni las escribas. El usuario copia `.env.example` a `.env` en la carpeta del motor y pone la suya. Todas son opcionales.

### 6. El primer video

Ofrécelo ahí mismo. El comando imprime el ejemplo para la plantilla elegida:

```
pnpm video mi-video --tema "por qué bostezamos"
```

Pide un tema al usuario y sigue "Hacer un video" de `SKILL.md`.

## Si el usuario llega con prisa

Con un pedido concreto ("hazme un video sobre los volcanes"), no lo frenes: instala, revisa que no falte nada obligatorio, corre `pnpm asistente --recomendado`, dile en una línea qué quedó elegido y que se cambia cuando quiera, y haz el video. Las preguntas quedan para cuando las pida.

## Qué guarda y dónde

| Archivo | Qué | Quién lo lee |
| --- | --- | --- |
| `config/preferencias.json` | El modo y la plantilla de siempre; estilo y segundos propios si se eligieron; `llm` si se eligió | `pnpm video`, y los flujos cuando una corrida no nombra estilo, segundos o `--llm` |
| `config/medios.json` | Voz, imágenes y música por defecto | Todos los flujos |

Los dos son del usuario: actualizar el motor no los toca, y no viajan si comparte la skill. Una opción en la línea de comandos gana siempre sobre lo guardado (`--estilo cine`, `--voz borrador`, `--musica no`, `--llm openrouter`). La variable `LLM_PERFIL` gana sobre el `llm` guardado.

## Después

| Para | Comando |
| --- | --- |
| Ver lo elegido y las opciones | `pnpm asistente --estado` |
| Cambiar algo | `pnpm asistente --guardar <ajuste>=<valor>` |
| Repetir las preguntas en la terminal | `pnpm asistente` |
| Ver los tipos de video | `pnpm video --plantillas` |
| Otra plantilla en un solo video | `pnpm video <nombre> --tema "…" --plantilla documental` |
| Volver a los valores recomendados | `pnpm asistente --recomendado` |

## Instalar sin preguntas

Para una instalación desatendida, `--sin-asistente` instala y muestra solo el diagnóstico; `--sin-musica` salta la descarga de música. Sin elegir nada, el motor usa lo recomendado, y `pnpm video` lo recuerda en una línea.

```
node <carpeta de la skill>/scripts/instalar.mjs <carpeta destino> --sin-asistente --sin-musica
```
