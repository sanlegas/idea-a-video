# Storytelling: tema o guion → corto narrado de corte rápido

Corto vertical de 1 a 3 minutos que cuenta una idea como historia. Abre con una escena cotidiana, le pone nombre a la idea, la respalda con un caso, la explica y la devuelve a quien mira. La imagen cambia cada 2 segundos entre tres tipos de plano: escena fotográfica, frase del narrador sobre un cuarto oscuro y lámina gráfica. Los subtítulos siguen la voz palabra por palabra.

```
pnpm storytelling <nombre> --guion guiones/storytelling/x.md      # corre todo
pnpm storytelling <nombre> --tema "por qué procrastinamos" --segundos 90 [--fuentes datos.md]
pnpm storytelling <nombre> --plan                                  # pasos, tiempo y costo; no corre nada
pnpm storytelling <nombre> --desde planos                          # rehace desde un paso
pnpm storytelling <nombre> --solo render                           # un solo paso
pnpm storytelling <nombre> --borrador                              # sin voz y con placas: para juzgar el corte
```

Resultado en `runs/storytelling/<nombre>/`: `film.mp4`, `hoja.png` (un cuadro por plano, en orden), `reporte.json` (tiempo y costo por paso) y `creditos.json` (autor y licencia de cada imagen que el video muestra). Los pasos terminados se saltan. Si el guion cambió desde la última corrida, el flujo lo nota y rehace desde la voz.

## Valor por defecto

60 a 75 s, LLM = el asistente de la sesión, voz e imágenes `auto`, estilo `dinamico`, música `pistas`. Los pasos y todas las opciones están en [opciones.md](opciones.md).

## El guion

Un archivo `.md` con **una frase por línea** y una línea en blanco entre actos. Solo lleva lo que dirá la voz.

| Acto | Qué es |
| --- | --- |
| `gancho` | Escena cotidiana dramatizada, en segunda persona o con diálogo, que termina en remate. Entre 10 y 30 % del texto |
| `tesis` | La idea en una sola frase corta, citable, como una ley o un nombre |
| `historia` | Un caso con nombre propio: una persona, una empresa o un estudio |
| `mecanismo` | Por qué pasa, con sus datos |
| `ejemplos` | Dos o tres situaciones cotidianas donde se nota |
| `giro` | El reencuadre: lo que casi nadie ve de esa idea |
| `aplicacion` | Qué hacer con eso, hablándole de tú a quien mira |
| `cierre` | Frase final que regresa a la escena del gancho |

Reglas:

- El gancho arranca en plena acción ("Vas entrando a…", "Imagínate que…"). Sin saludos ni "en este video". La primera frase sigue [gancho.md](gancho.md): de 5 a 16 palabras, directo al tema y con algo que se pueda mostrar.
- Frases de 6 a 16 palabras, una idea por frase, con cosas que se pueden mostrar.
- Números con letra ("veintitrés minutos"), sin siglas ni símbolos.
- Obligatorio: empezar con el gancho. Usa solo los actos que el texto tenga de verdad; un video corto puede quedarse en gancho, tesis, mecanismo y cierre.
- **Datos:** solo los que dio el usuario o vengan en `--fuentes`. Sin fuentes, no cites estudios, cifras ni personas reales: cuenta el caso como experiencia cotidiana. El flujo no verifica hechos.
- Largo: lo fija el guion. Las voces narran a unas 2.5 a 2.7 palabras por segundo contando las pausas entre frases: 20 s son unas 50 palabras; 60 s, unas 155. `--segundos` solo aplica con `--tema`.
- **Videos cortos:** desde unos 20 s funciona. Con pocas frases, cada pausa pesa más: cuenta 2.4 palabras por segundo. El gancho necesita al menos 3 planos y la tesis una lámina, así que conviene un mínimo de 5 o 6 frases.

Las líneas que empiezan con `>` son notas del autor: no se narran y guían la imagen.

```
> Look brasa. La protagonista es una maestra de primaria.

Vas entrando al salón y se te cae la pila de exámenes.
> Toma desde arriba: hojas regadas en el piso.
```

`guiones/storytelling/ejemplo.md` es un guion de muestra, con su dirección y sus planos ya escritos (`ejemplo.direccion.json`, `ejemplo.planos.json`). Sus cifras están citadas de memoria: verifícalas antes de publicar algo basado en él.

## Dirección (paso `direccion`)

Recibe las frases numeradas y decide:

- **`actos`:** tramos seguidos de frases, cada uno con su acto. El primero empieza en la frase 0 y es `gancho`; el último termina en la última frase.
- **`look`:** el sistema gráfico de todo el video: `papel` (crema, marcador naranja), `noche` (negro, acento violeta) o `brasa` (negro con resplandor naranja).
- **`personaje_en`:** en inglés, quien vive la escena del gancho: edad, pelo, ropa de un color. Nunca alguien real.
- **`ambiente_en`:** en inglés, el cuarto vacío desde donde habla el narrador. Solo se usa cuando hay un proveedor que genera imágenes; con fotos de banco el cuarto se dibuja por código.

## Planos (paso `planos`)

Recibe las palabras numeradas, agrupadas por acto, y corta el video. Cada plano cubre un tramo de palabras (`primera`, `ultima`) y es de un tipo:

| Tipo | Qué muestra | Campos |
| --- | --- | --- |
| `escena` | Fotografía a cuadro completo | `imagen_en` (en inglés), `busca_en` (2 o 3 palabras en inglés para buscar foto), `encuadre` (`abierto`, `medio`, `detalle`), `foco` (`arriba`, `centro`, `abajo`), `tratamiento` (`color`, `archivo`) |
| `narrador` | La frase, grande, sobre el cuarto del narrador | ninguno |
| `lamina` | Gráfico sobre el fondo del look | `bloque` y sus campos |

| Bloque de lámina | Qué muestra | Campos |
| --- | --- | --- |
| `titular` | Las palabras del plano como tipografía grande, cada una al sonar | `clave`: 1 a 3 palabras resaltadas |
| `recorte` | Un objeto recortado con línea y etiqueta | `imagen_en`, `busca_en`, `etiqueta` |
| `dato` | Un número que cuenta; con `%` dibuja un aro | `valor`, `prefijo`, `sufijo`, `etiqueta` |
| `cita` | Foto enmarcada con el nombre de quien hizo o dijo algo | `autor`, `imagen_en` (su entorno, nunca la persona real), `busca_en` |

- **Personaje:** escribe `PROTAGONISTA` en `imagen_en` y el código pone la descripción de la dirección, para que se parezca entre escenas.
- **Acercamiento de golpe:** el mismo `imagen_en` con otro `encuadre` reutiliza la imagen y se ve como un corte más cerrado.
- **`busca_en`** importa cuando las imágenes son fotos de banco: dos palabras concretas ("alarm clock") encuentran más que cuatro. Pide objetos, manos, lugares y siluetas, no rostros: una foto de banco puede mostrar a una persona real reconocible.

Reglas que revisa el código:

- Los planos cubren todas las palabras, seguidos y sin huecos.
- Cada plano dura entre 0.45 y 7 s; el promedio queda bajo 3.6 s.
- Todo el gancho son escenas y tiene al menos 3 planos.
- La tesis lleva una lámina `titular`; un titular tiene máximo 14 palabras.
- Las láminas ocupan entre 15 y 55 % del tiempo; el narrador, máximo 35 %.
- No hay cuatro planos seguidos del mismo tipo fuera del gancho.
- Dos escenas seguidas con la misma imagen cambian de encuadre.
- Máximo 24 imágenes distintas.
- Las palabras `clave` están dentro de su plano.

## Estilo, sonido y música

El corte (qué plano va en cada palabra) y el estilo (cómo entra cada plano, cámara, enfoque, color, subtítulos) son pasos separados: ver [edicion.md](edicion.md).

```
pnpm storytelling <nombre> --estilo cine --desde estilo     # otro estilo sin rehacer voz ni imágenes
pnpm storytelling <nombre> --musica no --desde musica       # sin música
```

## Respuestas a mano

Dirección, planos, estilo y música se pueden entregar como archivos en vez de esperar el pedido: `--direccion x.json`, `--planos x.json`, `--estilo x.json`, `--musica x.json`. El código los revisa y los usa tal cual, también al repetir.

## Límites

- **Escenas quietas:** una escena es una foto con movimiento de cámara y cambio de foco. No hay acción dentro del plano.
- **Sin presentador:** el plano `narrador` es la frase sobre un cuarto, no una persona a cámara.
- **Personaje poco estable:** la misma descripción no garantiza la misma cara entre imágenes generadas, y con fotos de banco no hay personaje. Ayuda repetir imágenes con otro encuadre y mostrar manos, espaldas y objetos.
- **Detalles del guion en la imagen:** un modelo de imagen puede ignorar un detalle (la hora en un reloj). Revisa la hoja.
- **Recortes:** el recorte no borra el fondo, lo funde. Con una foto de banco sin fondo liso se ve un cuadro alrededor.
- **Solo fotos de banco:** las fotos encontradas pueden no venir al caso, y pueden mostrar personas reales, marcas o logotipos. Por eso, sin un proveedor que dibuje, la lámina `cita` lleva las iniciales del nombre en vez de una foto y el cuarto del narrador se dibuja por código. Revisa siempre la hoja antes de publicar.
- **Un look por video.**
