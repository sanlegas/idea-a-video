# Problemas comunes

Empieza siempre por `pnpm diagnostico`: dice qué falta y cómo arreglarlo.

| Lo que pasa | Por qué | Arreglo |
| --- | --- | --- |
| El comando termina con código 3 y habla de un pedido | No es un error: un paso espera tu respuesta | Lee el `.pedido.md`, escribe la `.respuesta.json` y repite el comando. Ver [pedidos.md](pedidos.md) |
| "La respuesta del paso … fue rechazada" | Tu respuesta no cumplió el esquema o las reglas del paso | Lee **Correcciones** en el pedido, corrige todas y repite |
| "Entorno incompleto: falta ffmpeg" | ffmpeg no está instalado o no está en el `PATH` | Instálalo y abre una terminal nueva |
| "… necesita FAL_KEY" (u otra) | Se pidió un proveedor de nube sin su clave | El usuario la pone en `.env`, o se elige otro proveedor (`--imagenes stock`, `--voz sistema`) |
| El video salió sin voz | `auto` no encontró clave, comando propio ni voz en español en el sistema | Instala una voz en español en el sistema, o pon `ELEVENLABS_API_KEY` |
| "la película se montó para imágenes de X y ahora se piden de Y" | Cambió el proveedor de imágenes entre corridas (por ejemplo, se agregó una clave) | Repite con `--desde montaje` |
| Cambié el guion y la voz sigue diciendo lo anterior | Se editó `runs/…/guion.md` a mano, o se repitió sin `--guion` | Pasa el guion otra vez con `--guion`: Storytelling y Tinta notan el cambio y rehacen desde la voz. O usa `--desde voz` |
| La corrida termina con `ATENCIÓN: N planos salieron como placa` | El banco de fotos no encontró nada para esas palabras | Cambia su `busca_en` en `planos.json` de la corrida por otras dos palabras y repite `--desde montaje`. Repetir `--desde imagenes` sin cambiarlo no ayuda |
| Fotos de banco que no vienen al caso | La búsqueda sin Pexels es pobre y toma el primer resultado | Pon `PEXELS_API_KEY` (gratis). Cambia `busca_en` en `planos.json` de la corrida (otras palabras dan otra foto; objetos y lugares salen mejor que personas) y repite `--desde montaje`. O usa `--imagenes nube,stock` |
| "música: la biblioteca no está instalada" | No se bajó la música | `pnpm bibliotecas`. Mientras tanto suena la cama sintetizada |
| `pnpm bibliotecas` dice "huella distinta" | El archivo bajado no es el que el catálogo conoce (descarga cortada, o el autor lo cambió) | Borra ese archivo de `out/cache/musica` y repite; si persiste, quita la pista de `musica.json` |
| Subtítulos un poco fuera de la voz | Sin Whisper, los tiempos de palabra se estiman dentro de cada frase | Instala whisper.cpp con su modelo, o usa ElevenLabs. Ver [proveedores.md](proveedores.md) |
| Un flujo 3D falla o sale negro al renderizar | El navegador no da WebGL en esa máquina | `pnpm diagnostico --webgl`. En Linux sin pantalla, prueba `"chrome": {"gl": "swangle"}` en `config/local.json` |
| El render se queda sin espacio o tarda mucho en arrancar | La carpeta temporal o el disco están llenos | Borra `out/tmp`; el motor pide 5 GB libres |
| "el reparto pide objetos nuevos en 3D y esta máquina no tiene con qué hacerlos" | Tinta sin comando de imagen a 3D | Cambia esos objetos por modelos del catálogo en `reparto.json` y repite `--desde imagenes` |
| "estilo.json trae N planos y planos.json, M" | Se cambió el corte después de fijar el estilo | `--desde estilo`, o corrige `estilo.json` |
| Un paso ya hecho no se repite | Los pasos terminados se saltan | `--desde <paso>` rehace desde ahí; `--solo <paso>` solo ese |
| Un plano salió mal (imagen, texto, duración) | — | Edita `planos.json` (o `pelicula.json`) de la corrida y repite desde `montaje`; para otra imagen, cambia su `imagen_en` |
| Estudio deja decenas de pedidos | Cada escena pide dirección, programa y crítica | Usa una clave de LLM: `--llm openrouter` |
| `pnpm` no existe | No está instalado | `npm install -g pnpm`, o `corepack enable pnpm` |

## Volver a empezar una corrida

Cada corrida vive en `runs/<flujo>/<nombre>/`. Usar otro `<nombre>` empieza de cero sin tocar la anterior. Las imágenes ya hechas se reutilizan entre corridas del mismo nombre.

## Reportar un fallo

Lo que ayuda a entenderlo: la salida de `pnpm diagnostico`, el comando que se corrió y el mensaje de error completo. **Nunca incluyas tu `.env` ni el valor de una clave.**
