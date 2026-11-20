# Explica: plan → explicativo 2D

Video explicativo en 2D: texto animado, cifras, gráficas, transiciones, sonido y música. No usa voz, imágenes, LLM ni 3D, así que corre en cualquier máquina con Node y ffmpeg, sin claves y sin conexión (salvo la música, que se instala una vez).

```
pnpm explica guiones/explica/ia.json                   # video en runs/explica/ia/film.mp4
pnpm explica guiones/explica/ia.json --cuadros 2,12.5  # solo cuadros sueltos, para revisar
pnpm explica guiones/explica/ia.json --musica no       # pistas (por defecto), sintetizada o no
pnpm explica guiones/explica/ia.json --sin-sonido
pnpm explica:studio                                    # editar y ver en vivo
```

## El plan

Un JSON con `nombre` y una lista de `escenas`. El asistente lo escribe a partir de lo que pide el usuario; el código lo revisa antes de renderizar. `guiones/explica/ia.json` es un ejemplo completo. La primera escena es el gancho ([gancho.md](gancho.md)): dura 4 s como máximo y, si es portada, su título abre con la pregunta o la cifra, sin saludo.

Cada escena es un bloque fijo con sus datos:

| `tipo` | Muestra | Campos propios |
| --- | --- | --- |
| `portada` | Antetítulo, título con una palabra resaltada e icono | `titulo`, `antetitulo`, `clave`, `icono` |
| `dato` | Un número que cuenta dentro de un aro | `valor`, `decimales`, `prefijo`, `sufijo`, `etiqueta`, `icono`, `fuente` |
| `linea` | Gráfica de línea que se dibuja, con lectura en la punta | `titulo`, `unidad`, `puntos` (`[{x, y, nota}]`), `fuente`, `area` |
| `barras` | Barras horizontales que crecen una tras otra | `titulo`, `unidad`, `barras` (`[{etiqueta, valor, color}]`, de 2 a 7), `fuente` |
| `pasos` | Lista de 2 a 5 filas con icono | `titulo`, `pasos` (`[{icono, texto}]`) |
| `comparar` | Antes y después con flecha | `titulo`, `antes`, `despues` (cada uno `{etiqueta, valor, icono}`) |
| `cierre` | Frase final sobre fondo oscuro | `frase`, `clave`, `pie` |

Iconos: `chat`, `persona`, `chip`, `rayo`, `globo`, `grafica`, `check`, `reloj`, `empresa`, `escuela`.

Todas las escenas llevan además:

| Campo | Qué es |
| --- | --- |
| `dur` | Segundos que dura; mínimo 1.5 |
| `entrada` | Cómo entra: `corte`, `fundido`, `deslizar`, `barrido`, `iris`, `reloj`, `latigo`, `golpe`, `destello`. La primera escena no lleva |
| `sonidos` | Efectos dentro de la escena: `[{"en": 0.5, "efecto": "pop"}]`, con `en` en segundos desde que empieza |
| `animo` | Ánimo de la música mientras dura: `tension`, `curiosidad`, `oscuro`, `esperanza`. Sin él: `curiosidad`, y `esperanza` en el cierre |

Efectos más usados: `pop`, `click`, `subida`, `bajada`, `golpe_seco`, `exito`. La lista completa está en `kit/biblioteca/sonidos/efectos.mjs`.

## Reglas que revisa el código

- Toda gráfica (`linea`, `barras`) cita su `fuente`.
- La transición ocupa menos de media escena.
- Una línea tiene al menos 2 puntos; barras, entre 2 y 7; pasos, entre 2 y 5.
- Ningún sonido cae después del final de su escena.

## Sonido y música

Cada transición suena con una muestra grabada (el `fundido` no suena) y la música sale de la biblioteca según el ánimo. Un cambio de música necesita al menos 6 segundos del ánimo nuevo; el cierre, 4. Ver [edicion.md](edicion.md).

## Límites

- **Sin voz:** el flujo no narra. El texto en pantalla lleva el mensaje.
- **Bloques fijos:** no hay figuras libres; lo que no cabe en un bloque no se puede mostrar.
- **Los datos son de quien publica:** el flujo no verifica las cifras ni las fuentes.
