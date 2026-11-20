# Licencias

Qué licencia tiene cada pieza con la que se hace un video, y qué debe saber quien lo publica. Esto es un resumen para orientarse, no asesoría legal: ante la duda, lee la licencia de origen.

## Lo que usa el motor

| Pieza | Licencia | Qué implica |
| --- | --- | --- |
| **Remotion** (render de video) | Licencia propia | **Gratis para personas, organizaciones sin fines de lucro y empresas de hasta 3 empleados**, también para uso comercial. Una empresa más grande necesita una licencia de pago. Términos vigentes: [remotion.dev/license](https://remotion.dev/license) |
| React, three.js, zod, tsx, TypeScript | MIT | Uso libre |
| GSAP | Licencia estándar de GSAP, sin costo | Uso libre, también comercial; ver gsap.com/licensing |
| Rapier (física) | Apache 2.0 | Uso libre |
| ffmpeg | LGPL o GPL, según cómo se compiló | Se usa como programa aparte; no viaja con la skill |
| Fuentes: Figtree, Inter, JetBrains Mono, Barlow Condensed | SIL Open Font License 1.1 | Uso libre en videos. Llegan por sus paquetes `@fontsource`, que traen la licencia |

## Lo que se baja al instalar o al correr

| Pieza | Licencia | Qué implica |
| --- | --- | --- |
| Música de fondo (10 pistas de OpenGameArt) | CC0 1.0 | Dominio público: uso libre, también comercial, sin atribución obligatoria. Autor y origen de cada pista en [opciones.md](opciones.md) |
| Sonidos de corte (7 muestras de Freesound) | CC0 1.0 | Igual. Viajan con el motor |
| Modelos 3D de Kenney (Tinta, Plantillas) | CC0 1.0 | Uso libre; el crédito a Kenney es opcional |
| Modelos 3D del catálogo (`kit/modelos`, Estudio) | La del motor | Hechos por código para este motor; viajan con él y se usan en los videos que hagas. Son personajes y objetos genéricos: no copian a personas reales ni marcas |
| Recursos de Estudio (`config/recursos.json`) | Cada uno la suya | El reporte de la corrida lista en `credits` lo que hay que acreditar |
| Navegador de render | El de Chromium | Lo baja Remotion |

## Lo que depende del proveedor elegido

- **Fotos de banco.** Cada foto trae su licencia y su autor en `creditos.json` de la corrida. Pexels permite uso libre sin atribución. Las de Wikimedia Commons y Openverse varían: muchas piden nombrar al autor y la licencia al publicar. Revisa ese archivo antes de publicar.
- **Imágenes generadas en la nube.** Los términos son los de fal y del modelo que elijas. FLUX.1 schnell, el de fábrica, tiene licencia Apache 2.0, que permite uso comercial de lo que genera.
- **Voz de ElevenLabs.** Los términos son los de tu plan; el uso comercial depende de él.
- **Voz del sistema operativo.** Las voces de macOS y Windows tienen los términos de su sistema; revisa si permiten el uso que le darás al video.
- **Piper** (voz local opcional). El programa es GPL-3.0 y aquí corre como programa aparte. Cada voz tiene su propia licencia en su ficha.
- **Whisper** (medir palabras). whisper.cpp y los modelos de Whisper son MIT.
- **Modelos propios** conectados por `config/local.json`: sus licencias son asunto de quien los instala. Algunos modelos de imagen, de recorte de fondo o de imagen a 3D prohíben el uso comercial de lo que producen.

## Lo que es responsabilidad de quien publica

- **Los hechos del guion.** El motor no verifica cifras, nombres ni estudios.
- **Personas reales.** Los flujos piden no generar imágenes de personas reales ni famosas. No lo fuerces. Una foto de banco sí puede mostrar a una persona real: publicarla junto a un texto que no habla de ella puede afectar su imagen, aunque la licencia de la foto lo permita.
- **Etiquetado.** Algunas plataformas piden declarar el contenido generado con IA.
