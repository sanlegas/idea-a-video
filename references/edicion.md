# Edición: estilo, transiciones, subtítulos, sonido y música

Lo que comparten los flujos al editar. Las listas completas de valores están en [opciones.md](opciones.md).

## Estilo en Storytelling (paso `estilo`)

El corte dice qué plano va en cada palabra. El estilo dice cómo entra cada plano, cómo se mueve la cámara sobre la foto, dónde está el foco, qué color tiene la película y cómo se ven y aparecen los subtítulos. Queda en `runs/storytelling/<nombre>/estilo.json`, así que se repite en otro video o se corrige a mano.

```
pnpm storytelling <nombre> --estilo dinamico                # preset (por defecto)
pnpm storytelling <nombre> --estilo cine --desde estilo     # cambia el estilo de un video hecho; no rehace voz ni imágenes
pnpm storytelling <nombre> --estilo mi_estilo.json          # estilo escrito a mano
pnpm storytelling <nombre> --desde montaje                  # después de editar estilo.json
```

| Preset | Para qué | Subtítulos | Transiciones |
| --- | --- | --- | --- |
| `dinamico` | Redes: llamativo | Condensados en mayúsculas con borde; se resalta la palabra que suena; el narrador va palabra por palabra | Barridos, fogonazos, acercamientos de golpe |
| `cine` | Documental: pausado | Limpios; cada palabra aparece al decirse | Fundidos con cambio de foco, iris en los remates |
| `sobrio` | Sin adornos | Limpios; la frase espera atenuada | Solo cortes secos |

Un preset es una tabla de reglas: qué transición recibe cada tipo de corte (remate de tesis o giro, acercamiento sobre la misma imagen, entrada y salida de lámina, paso al narrador, foto de archivo), qué movimientos de cámara se turnan en cada encuadre y qué enfoque lleva cada plano.

En `estilo.json` cada plano lleva `transicion`, `camara` y `enfoque`, y puede llevar `texto` para cambiar los subtítulos solo ahí. La película lleva `texto` (`estilo`, `aparece`, `posicion`) y `grado` (color).

- **Cámara y enfoque** solo aplican a las escenas. El narrador va en mano y las láminas tienen su propia animación.
- **`destello`** deja un cuadro casi blanco. Varios seguidos pueden molestar a personas sensibles a destellos; por defecto solo van en la tesis, el giro y la llegada de una foto de archivo.
- **Imágenes con diseño de cine:** al generarlas, el prompt pide lente, luz motivada, bruma y poca profundidad de campo. Al renderizar se agregan color, halo en las luces, viñeta y grano.

## Transiciones en los otros flujos

| Flujo | Transiciones | Cómo se eligen |
| --- | --- | --- |
| Explica | `corte`, `fundido`, `deslizar`, `barrido`, `iris`, `reloj`, `latigo`, `golpe`, `destello` | `entrada` de cada escena del plan |
| Tinta | `corte`, `golpe`, `latigo`, `destello` | Las pone el código según lo que cambia entre tomas; `entrada` en la toma lo fija |
| Estudio | `corte`, `swipe`, `fundido` | El LLM, al dividir el guion |
| Plantillas | — | Un solo mundo con cámara continua |

## Sonidos de corte

Cada transición que se mueve suena con una muestra grabada, puesta para que su momento más fuerte caiga en el corte. Los cortes secos entre imágenes no suenan. Los efectos dentro de una escena (un número que cuenta, un clic, lluvia, un motor) son sintetizados.

Las muestras están en `kit/biblioteca/sonidos/muestras/`, con su catálogo `muestras.json` (cómo suena, cuándo se usa, `ancla` con su momento más fuerte, origen y licencia). Para cambiar un sonido se reemplaza el `.wav` y se ajusta su `ancla`.

## Música de fondo

La música cambia con el momento del video. Cada flujo le da un ánimo a cada tramo, el código elige una pista de ese ánimo en la biblioteca y las mezcla en un archivo que queda debajo de la voz.

| Ánimo | Qué se busca |
| --- | --- |
| `tension` | Suspenso: algo está por pasar |
| `curiosidad` | Pulso constante de quien investiga o explica |
| `oscuro` | Grave e inquietante: la mala noticia |
| `esperanza` | Cálido y abierto: la salida |

| Flujo | De dónde sale el ánimo |
| --- | --- |
| Storytelling | Del acto: gancho → tensión; tesis, historia, mecanismo, ejemplos → curiosidad; giro → oscuro; aplicación y cierre → esperanza |
| Explica | `animo` de la escena; sin él, curiosidad, y esperanza en el cierre |
| Tinta | Del tono del rótulo: alerta → tensión; lo demás → curiosidad |
| Estudio | Del ánimo que el LLM da a cada escena |
| Plantillas | Del ánimo que el LLM da a cada beat |

- **Cambio de pista:** solo donde cambia el ánimo, con un cruce de 1.2 s sobre el corte. Un tramo de menos de 6 s se queda con la música anterior; el final puede durar 4.
- **Qué pista:** primero las que van con el look, luego las que cubren el tramo sin repetirse. Entre las que quedan decide el nombre del video: repetir la corrida elige lo mismo.
- **Bajo la voz:** todas las pistas están a la misma sonoridad. `musica.nivel` en `config/medios.json` es el volumen donde nadie habla; mientras suena la voz, la música baja más. Medido: queda de 12 a 15 dB por debajo de la voz.
- **Modos:** `pistas` (biblioteca), `sintetizada` (una cama simple hecha por código) y `no`. En Storytelling y Explica, `--musica` lo cambia por corrida; en los demás, `musica.modo` de `config/medios.json`.

En Storytelling el plan queda en `musica.json` (qué pista suena en cada tramo y desde qué segundo) y se puede editar:

```
pnpm storytelling <nombre> --musica runs/storytelling/<nombre>/musica.json --solo musica
pnpm storytelling <nombre> --solo sonido
pnpm storytelling <nombre> --solo mezcla
```

### La biblioteca

Diez pistas de dominio público (CC0), de 48 s a 3 min. No viajan con el motor: `pnpm bibliotecas` baja cada una de donde su autor la publicó, comprueba su huella y la convierte. Sin la biblioteca los flujos siguen funcionando con la cama sintetizada, y lo dicen.

Para agregar una pista: un MP3 a −20 LUFS en `kit/biblioteca/musica/` y su entrada en `musica.json` con ánimo, autor, origen y licencia. Solo dominio público o CC0: una pista que exige atribución necesitaría que el flujo escribiera los créditos del video, y no lo hace.

## Lo que hay que saber

- **Las pistas y los sonidos se eligieron por la descripción de sus autores y por medidas** (duración, sonoridad, regularidad). Si una pista no va con su ánimo, cámbiale el `animo` en el catálogo o quítala.
- **Pocas pistas por ánimo:** dos o tres. Con un mismo look tienden a salir las mismas.
- **El ánimo sale de la estructura, no del texto:** un gancho cómico recibe música de tensión igual que uno dramático. Se corrige editando `musica.json` o el `animo` de la escena.
