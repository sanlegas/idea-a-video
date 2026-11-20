# Inicio

## Requisitos

| Qué | Para qué | Cómo se instala |
| --- | --- | --- |
| Node 20 o más nuevo | Correr el motor | [nodejs.org](https://nodejs.org) |
| pnpm | Instalar dependencias | `npm install -g pnpm`, o `corepack enable pnpm` |
| ffmpeg (con ffprobe) | Audio, mezcla e imágenes | macOS: `brew install ffmpeg`. Debian o Ubuntu: `sudo apt install ffmpeg`. Windows: `winget install ffmpeg` |
| ~1.5 GB de disco | Dependencias, navegador de render y música | — |

El navegador con el que se renderiza lo descarga Remotion solo, la primera vez (unos 100 MB). No hace falta tener Chrome.

Nada más es obligatorio. Claves, Whisper, Python y GPU son opcionales: ver [proveedores.md](proveedores.md) y [maquina.md](maquina.md).

## Instalar la skill

La skill es una carpeta con `SKILL.md`. Cada asistente la busca en su propio lugar:

| Asistente | Dónde copiar la carpeta `idea-a-video` |
| --- | --- |
| Claude Code | `~/.claude/skills/` (para todos los proyectos) o `.claude/skills/` dentro de un proyecto |
| Codex | `~/.codex/skills/` |
| Otro asistente con skills | Su carpeta de skills; consulta su documentación |
| Asistente sin skills | Pídele que lea `SKILL.md` de esta carpeta antes de empezar |

En Windows, `~` es la carpeta del usuario (`C:\Users\<usuario>`).

## Instalar el motor

El motor (código, bibliotecas de sonido, ejemplos) viaja dentro de la skill y se copia a una carpeta de trabajo, que es donde quedan los guiones y los videos:

```
node <carpeta de la skill>/scripts/instalar.mjs <carpeta destino>
```

Hace esto, en orden, y se puede repetir sin perder nada:

1. Copia el motor. En una carpeta que ya lo tiene, actualiza el código y deja intactos `.env`, `config/local.json`, `config/preferencias.json`, `config/medios.json`, tus guiones y tus videos.
2. Deja la documentación en `docs/` y un `AGENTS.md` con el resumen de operación, para asistentes que leen instrucciones de la carpeta.
3. Instala dependencias con pnpm.
4. Baja la biblioteca de música (unos 60 MB de originales) y la convierte. Con `--sin-musica` se salta; después se instala con `pnpm bibliotecas`.
5. La primera vez abre el **asistente inicial**: revisa qué falta instalar y ofrece tres modos de trabajo (`auto`, `nube` o `local`); en una terminal pregunta con opciones numeradas (Enter acepta la recomendada); corrido por un asistente de IA, imprime lo que falta y las opciones para que él te pregunte. Las veces siguientes, y con `--sin-asistente`, muestra el diagnóstico. Ver [primer-uso.md](primer-uso.md).

## Primer video

Dentro de la carpeta del motor:

```
pnpm asistente                                     # si no lo pasaste al instalar: plantilla, voz, imágenes y música
pnpm video mi-video --tema "por qué bostezamos"    # un video con tu plantilla
pnpm explica guiones/explica/ia.json               # explicativo 2D de ejemplo: no pide voz, imágenes ni LLM
pnpm storytelling ejemplo --guion guiones/storytelling/ejemplo.md \
  --direccion guiones/storytelling/ejemplo.direccion.json --planos guiones/storytelling/ejemplo.planos.json
```

`pnpm video` corre el flujo de tu plantilla; con `--tema`, el guion lo escribe tu asistente de IA (o el modelo que elegiste) cuando el motor se lo pide. El tercer comando deja `runs/explica/ia/film.mp4` en uno o dos minutos. El cuarto hace un corto de storytelling con la dirección y los planos de ejemplo ya escritos, así que no deja pedidos: narra con la voz que el diagnóstico eligió y busca fotos libres.

## Claves

Copia `.env.example` a `.env` y llena solo las que tengas. Todas son opcionales.

| Variable | Qué mejora | Dónde se obtiene |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | Voz natural en vez de la del sistema | elevenlabs.io |
| `FAL_KEY` | Imágenes generadas para cada plano con FLUX (~$0.003 cada una) en vez de fotos de banco | fal.ai |
| `OPENROUTER_API_KEY` | LLM por API: un modelo escribe sin esperar al asistente | openrouter.ai |
| `PEXELS_API_KEY` | Fotos libres mejores y más parejas | pexels.com/api |
| `DEEPSEEK_API_KEY` | LLM por API, alternativa a OpenRouter | platform.deepseek.com |

El asistente nunca debe pedir ni escribir una clave: las pone el usuario en su `.env`, que no se comparte ni se sube a ningún repositorio (el `.gitignore` del motor ya lo excluye).

## Dónde queda cada cosa

| Carpeta | Contenido |
| --- | --- |
| `guiones/` | Guiones y planes: lo que escribe el usuario o el asistente |
| `runs/<flujo>/<nombre>/` | Todo lo de una corrida: pasos intermedios, pedidos, `film.mp4`, `hoja.png`, `reporte.json` |
| `public/` | Voz, imágenes y sonido que el render necesita |
| `config/` | Lo que elegiste en el asistente (`preferencias.json`), valores por defecto (`medios.json`), perfiles de LLM (`models.json`) y, si existe, lo propio de esta máquina (`local.json`) |
| `docs/` | Esta documentación |
