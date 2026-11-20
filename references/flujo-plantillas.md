# Plantillas: guion → video 3D con tomas ya programadas

Video 3D de un mundo continuo (una ciudad, un edificio, un barco) recorrido por una cámara, con textos en pantalla y contadores. El asistente elige y rellena tomas que ya existen; por eso el resultado es parejo y predecible, pero solo cubre temas que caben en sus plantillas.

```
pnpm plantillas <nombre> --guion guiones/x.md
pnpm plantillas <nombre> --from storyboard      # rehace desde un paso
pnpm plantillas <nombre> --until merge          # se detiene al terminar ese paso
pnpm plantillas <nombre> --only bed             # un solo paso
```

Resultado: `runs/<nombre>/film.mp4`. Los pasos terminados se saltan; si cambia un archivo de entrada, solo se rehace lo que depende de él. Pide WebGL.

## Cuándo usarlo

| Usa Plantillas si | Usa otro flujo si |
| --- | --- |
| El tema es físico y de escala grande: sismos y edificios, barcos, torres, tráfico | El tema es abstracto o cotidiano: Storytelling |
| Quieres resultado seguro sin revisar escena por escena | Quieres visuales propios para ese guion: Estudio |

## Pasos

La tabla con lo que lee y deja cada paso está en [opciones.md](opciones.md). En resumen:

| Paso | Decide o produce |
| --- | --- |
| `catalogo` | Elige modelos 3D del catálogo para objetos que nombra el guion y baja sus paquetes |
| `brief` | Tema, lugar, hora, protagonista, sucesos |
| `art` | Entorno, paleta, protagonista, corte, diagrama, y lo que el kit no puede mostrar (`gaps`) |
| `assets` | Prepara recursos, como el modelo del protagonista |
| `tomas` | Programa tomas nuevas para lo que falta, las verifica y las critica mirando cuadros |
| `storyboard` | Divide el guion en beats, elige plano y toma de cada uno |
| `chips` | Textos en pantalla |
| `sound` | Ánimo musical (`tension`, `wonder`, `calm`, `resolve`) y ambiente por beat, y efectos |
| `merge`, `voice`, `bed`, `render`, `mix` | Une, narra, arma el sonido, renderiza y mezcla |

Con el asistente como LLM, cada paso de la primera mitad deja un pedido: ver [pedidos.md](pedidos.md). El paso `tomas` pide escribir código y mirar cuadros renderizados; si el asistente no puede ver imágenes, usa `--llm openrouter`.

## Guion

Un `.md` con la narración. Acepta notas del autor con `>`: las que van antes de la primera frase describen el estilo de todo el video; las demás aplican a la narración justo arriba. La primera frase es el gancho: ver [gancho.md](gancho.md). El beat 0 contiene solo esa frase y siempre lleva texto en pantalla.

```
> Animación 3D de bloques, fondo verde, luz plana.

Pero las paredes de tierra se desmoronan y tapan el hoyo.
> Corte del suelo: las paredes del hoyo se derrumban hasta llenarlo.
```

## Catálogo de modelos

`config/kenney.json` registra paquetes CC0 de Kenney (fábrica, casas, campo, muebles), cada uno con su dirección de descarga y su huella. El código baja el paquete, verifica la huella y extrae los modelos. Cada objeto aparece una vez en una tarjeta, girando, cuando la voz lo nombra.

## Sonido y música

Música de la biblioteca según el ánimo de cada beat, barridos grabados entre beats y ambiente sintetizado: ver [edicion.md](edicion.md).

## Límites

- **Temas:** los que caben en sus plantillas. Lo que el kit no sabe mostrar queda anotado en `gaps` de `world.json`.
- **Un solo mundo con cámara continua:** no hay cortes que editar ni estilos de transición.
- **Tomas nuevas:** el paso `tomas` es el más lento y el menos seguro; una toma que no corre o sale mal se descarta.
