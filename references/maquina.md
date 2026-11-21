# Qué puede correr esta máquina

```
pnpm diagnostico            # hechos de la máquina, lo que elige "auto" y el estado de cada flujo
pnpm diagnostico --webgl    # además renderiza un cuadro 3D para probar el navegador (medio minuto)
pnpm diagnostico --json     # lo mismo como datos
```

El diagnóstico no cambia nada. Reporta sistema, memoria, GPU, disco, herramientas, **nombres** de las claves presentes (nunca sus valores), comandos propios declarados en `config/local.json`, lo que elegirá `auto` y, por flujo, uno de tres estados:

| Estado | Significa |
| --- | --- |
| `listo` | El flujo corre completo con lo que hay |
| `limitado` | Corre, pero algo sale reducido (sin voz, recorte simple, lento) y dice qué lo mejoraría |
| `falta` | No puede correr; dice qué instalar o qué clave poner |

## Qué pide cada flujo

| Flujo | Siempre | Voz | Imágenes | LLM | Además |
| --- | --- | --- | --- | --- | --- |
| Explica | Node, ffmpeg | no usa | no usa | no usa | — |
| Storytelling | Node, ffmpeg | cualquiera; sin voz sale mudo | fotos libres, nube o propias | el asistente o API | — |
| Tinta | Node, ffmpeg | cualquiera | solo para objetos nuevos | el asistente o API | WebGL; objetos nuevos en 3D piden un comando propio |
| Plantillas | Node, ffmpeg | cualquiera | no usa | el asistente o API | WebGL |
| Estudio | Node, ffmpeg | cualquiera | opcionales: generadas en la nube o propias; sin ellas, modelos 3D del catálogo y dibujos 2D (modo local) | API recomendada; con el asistente es lento | WebGL; con poca GPU, `--ligero` |

**WebGL:** los flujos 3D se renderizan en un navegador sin ventana que dibuja con WebGL. Funciona en computadoras con o sin GPU dedicada, pero más lento sin ella. `pnpm diagnostico --webgl` (o `pnpm asistente --estado --webgl`) lo comprueba una vez y el resultado queda guardado en `out/diagnostico_webgl.json`; los diagnósticos siguientes lo reportan sin renderizar. Si no funciona: actualiza el controlador de video, o pon `{"chrome": {"gl": "swangle"}}` en `config/local.json` (WebGL por software) y renderiza con `--ligero`.

## Procesos que corren en la máquina del usuario

| Proceso | Qué necesita | Notas |
| --- | --- | --- |
| Render de video (todos los flujos) | Procesador y memoria | Medido: un corto de 87 s tardó de 4 a 5 minutos en un equipo de escritorio; un borrador de 68 s, 1:39 en una laptop Apple M1 con 16 GB |
| Voz del sistema | Nada que instalar en macOS y Windows | En Linux, `espeak-ng`, que suena robótico |
| Voz con Piper | Python 3.9 o más nuevo y `pip install piper-tts`; voz de 63 MB | Corre en el procesador: 25 frases en 2 s en un equipo de escritorio. Probado en Linux; en macOS con Apple Silicon la versión 1.8.0 falla al cargar sus datos |
| Modelos 3D nuevos por código (Estudio) | Blender 4.2 o más nuevo | Sin GPU especial ni generador de imágenes: un modelo de juguete tarda un par de segundos. Ver [blender.md](blender.md) |
| Medir cada palabra (Whisper) | `whisper-cli` de whisper.cpp y un modelo `ggml` | Sin él, los tiempos se estiman dentro de cada frase. Con ElevenLabs no hace falta |
| Recorte de fondo (Estudio) | Python con `rembg` y `pillow` | Sin él, el fondo negro se vuelve transparente: más burdo |
| Generar imágenes con modelo propio | GPU y un comando que cumpla el contrato | Ver [proveedores.md](proveedores.md) |
| Imagen a 3D con modelo propio (Tinta) | GPU NVIDIA con mucha memoria y un comando propio | Con TRELLIS.2 se midieron picos de 4 a 8 GB de memoria de video por objeto |
| LLM local | Un servidor compatible con OpenAI | La memoria depende del modelo que se elija |

Las cifras de esta tabla son mediciones en equipos concretos, no mínimos garantizados: en otra máquina cambian.

## Windows

El motor evita comandos propios de macOS y Linux: corre sus herramientas con el mismo Node, usa `tar` para descomprimir y mantiene su carpeta temporal dentro del proyecto. Aun así, **Windows no se ha probado**. Puntos a vigilar:

- ffmpeg debe estar en el `PATH` (`winget install ffmpeg` y abrir una terminal nueva).
- La voz del sistema usa PowerShell y las voces instaladas en Configuración > Hora e idioma > Voz. Hace falta una en español.
- Los comandos propios de `config/local.json` deben nombrar el programa como se llama en Windows (`python`, no `python3`).
- Rutas con espacios o acentos en la carpeta del motor pueden dar problemas con ffmpeg: usa una ruta simple.

Si algo falla en Windows, el mensaje de error del motor dice qué comando falló; con eso se puede corregir o reportar.
