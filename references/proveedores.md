# Proveedores: de dónde sale cada pieza

Cada pieza que antes pedía una máquina con GPU tiene tres caminos: algo propio de la máquina del usuario, un servicio en la nube con clave, o una alternativa que no pide nada. `auto` (el valor por defecto) elige en ese orden según lo que encuentre, y cada corrida dice qué eligió y por qué. El modo que se elige en el asistente fija los tres de una vez: `modo=nube` (ElevenLabs y FLUX), `modo=local` (solo lo del equipo: voz propia o del sistema, sin imágenes de fuera) o `modo=auto` (ver [primer-uso.md](primer-uso.md)).

| Pieza | Propio de la máquina | Nube (variable) | Sin clave |
| --- | --- | --- | --- |
| Voz | comando de voz en `config/local.json` | ElevenLabs (`ELEVENLABS_API_KEY`) | voz del sistema operativo; si no hay, sin voz |
| Tiempos de palabra | Whisper (`whisper-cli`) o comando propio | los da ElevenLabs con el audio | estimados dentro de cada frase |
| Imágenes | comando de imagen | FLUX schnell en fal (`FAL_KEY`) | fotos libres: Pexels (`PEXELS_API_KEY`, gratis), Wikimedia Commons, Openverse |
| Recorte de fondo | comando de recorte (`rembg`) | — | fondo negro a transparente |
| LLM de texto | servidor compatible con OpenAI (`--llm local`) | OpenRouter o DeepSeek (`--llm openrouter`, `--llm deepseek`) | el asistente de la sesión (`--llm sesion`) |
| LLM que ve imágenes | modelo local con visión | OpenRouter | el asistente, si puede ver imágenes |
| Imagen a 3D (Tinta) | comando de 3D | no incluido | catálogo de modelos, construcciones y personaje |

## Voz

```
pnpm storytelling <nombre> --voz elevenlabs      # fija un proveedor: local, elevenlabs, sistema, borrador
```

- **ElevenLabs:** con la clave basta. Sin `ELEVENLABS_VOICE_ID`, usa la primera voz de la cuenta que hable español y dice cuál. Modelo, estabilidad y velocidad están en `config/medios.json`. La misma llamada devuelve cuándo suena cada carácter, así que los subtítulos quedan exactos sin Whisper. Cobra por carácter narrado.
- **Voz del sistema:** la que trae macOS (por ejemplo "Paulina") o Windows. Gratis y sin conexión. `VOZ_SISTEMA` fija otra por su nombre exacto.
- **Sin voz (`borrador`):** el video sale mudo con los tiempos estimados. Sirve para juzgar el corte.
- **Comando propio:** ver abajo. Para Linux se incluye uno listo con Piper:
  ```
  pip install piper-tts
  python scripts/local/voz_piper.py --instalar
  ```
  y en `config/local.json`: `{"voz": {"comando": ["python", "scripts/local/voz_piper.py"]}}`

## Imágenes

```
pnpm storytelling <nombre> --imagenes nube,stock  # una lista se prueba en orden
```

- **Nube:** FLUX.1 schnell en fal (`imagen.nube.modelo` en `config/medios.json`), con `FAL_KEY`. Cuesta unos $0.003 por imagen: un minuto de video usa de 12 a 20. Cada imagen se pide en la forma del cuadro y a menos de un megapíxel, porque fal cobra por megapíxel. En fal sirve cualquier otro modelo de texto a imagen que reciba `prompt` e `image_size` (por ejemplo `fal-ai/flux-2/klein`); si lo cambias, cambia también `imagen.nube.dolares_por_imagen`, porque fal no dice cuánto costó cada imagen y el reporte usa ese valor. Una imagen que el filtro de fal rechaza pasa al siguiente proveedor de la lista.
- **Fotos libres:** pueden mostrar personas reales reconocibles, marcas o logotipos, y no siempre vienen al caso: revisa la hoja de cuadros antes de publicar. Con `PEXELS_API_KEY` las fotos son más parejas. Sin ella se busca en Wikimedia Commons, donde la búsqueda es más pobre. Autor y licencia de cada foto quedan en `creditos.json` de la corrida: algunas licencias piden atribución al publicar.
- **Placas:** ningún proveedor; cada plano muestra una placa con el texto de la imagen que iría.
- Cambiar de proveedor cambia el nombre de los archivos, para que una foto de banco nunca pase por generada. Por eso, tras cambiarlo, se repite `--desde montaje`.

## LLM

Por defecto responde el asistente de la sesión: ver [pedidos.md](pedidos.md). Los perfiles de `config/models.json` dicen qué modelo responde cada paso con `--llm openrouter`, `--llm deepseek` o `--llm local`. `LLM_PERFIL` en `.env` cambia el valor por defecto.

## Lo que no viene incluido

- **Imagen a 3D en la nube:** hay servicios que convierten una imagen en un modelo GLB, pero ninguno está integrado ni probado. Tinta funciona con el catálogo. Quien tenga uno lo conecta como comando propio.

## Comandos propios (`config/local.json`)

Cualquier modelo local se conecta como un comando: una lista con el programa y sus primeros argumentos. `config/local.example.json` trae la forma. Este archivo describe una máquina: no se comparte.

| Clave | El motor lo llama con | Debe dejar |
| --- | --- | --- |
| `voz` | `<lineas.json> <carpeta>`; `VOZ` en el entorno nombra la voz | un audio por frase: `beat_00.wav`, `beat_01.wav`… |
| `imagen` | `<pedidos.json> <carpeta> [modelo]`; pedidos: `[{id, prompt, wide, tall, seed}]` | un `<id>.png` por pedido |
| `recorte` | `<trabajos.json>`; trabajos: `[{from, to}]` | cada `to` recortado, y una línea `{"to", "aspect"}` por trabajo en la salida |
| `tiempos` | `<audio> <salida.json>` | `[{text, start, end}]`, una entrada por palabra oída |
| `modelo3d` | `<imagen.png> <modelo.glb>` en pares | cada `.glb`; `reintentos` da banderas para un segundo intento |

Otras claves: `llm.url` (servidor local), `whisper` (programa y modelo de whisper.cpp), `chrome` (navegador para renderizar), `preparar` (comando que revisa y levanta lo local antes de una corrida) y `liberar` (comando que devuelve la GPU después de cada paso local).

## Whisper para medir palabras

Sin Whisper los subtítulos siguen la voz con tiempos estimados; con él, quedan exactos y los cortes caen en la palabra. Instalación de whisper.cpp:

- macOS: `brew install whisper-cpp`
- Linux y Windows: compilar o bajar el binario de [github.com/ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp)

El modelo (`ggml-small.bin`, ~470 MB) se baja de la página del proyecto y se deja en `~/.cache/idea-a-video/whisper/`, o donde diga `whisper.modelo` en `config/local.json`.
