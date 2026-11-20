# Tinta: guion → video ilustrado en 3D

Video vertical con objetos 3D simples que se ven dibujados: colores planos pastel, contorno de tinta y textura de papel, sobre maquetas (una sala, un patio, una repisa). El asistente decide qué se ve y cuándo; el código decide dónde y cómo.

```
pnpm tinta <nombre> --guion guiones/tinta/x.md      # corre todo
pnpm tinta <nombre> --plan                           # pasos, tiempo y costo; no corre nada
pnpm tinta <nombre> --desde tomas                    # rehace desde un paso
pnpm tinta <nombre> --solo render
pnpm tinta:studio                                    # ver guiones/tinta/ejemplo.json en vivo
```

Resultado en `runs/tinta/<nombre>/`: `film.mp4`, `hoja.png`, `reporte.json`. Pide WebGL (`pnpm diagnostico --webgl`). La primera corrida baja el catálogo de muebles (5.6 MB).

## Valor por defecto

LLM = el asistente de la sesión; voz `auto`; objetos del catálogo, construcciones y personaje; música según el tono de cada toma. Los pasos están en [opciones.md](opciones.md).

## El guion

Un `.md` con la narración, una frase por línea. Funciona bien la estructura problema y solución ("Pero…", "Entonces…"), con objetos que se puedan señalar. Las líneas con `>` son notas del autor y no se narran. La primera frase es el gancho: ver [gancho.md](gancho.md). La toma 1 se acerca a un objeto que nombra esa frase, con una acción en sus tres primeras palabras.

## Reparto (paso `reparto`)

Decide qué objetos existen, de dónde salen y en qué lugar van. Nunca se escriben coordenadas: se eligen lugares con nombre.

| `fuente` | Qué es |
| --- | --- |
| `kenney:muebles/<modelo>` | Un modelo del catálogo (120 muebles y aparatos de casa: `televisionModern`, `laptop`, `radio`, `lampRoundTable`…). Licencia CC0 |
| `bolo` | El personaje: un bolo rojo. Obligatorio si el guion habla de una persona |
| `pelota` | La agrega el código cuando algo rueda o se cae |
| `construccion:<id>` | Algo que se arma pieza por pieza sobre el escenario (hoy: `casa_arbol`, con sus `partes` por etapa) |
| `generar` | Un objeto nuevo, descrito en `prompt_en`. **Solo si la máquina tiene un comando de imagen a 3D**; sin él, el código lo rechaza y hay que usar el catálogo |

Escenarios y sus lugares están en [opciones.md](opciones.md): `sala`, `patio`, `repisa`, `estudio`. Tamaños en unidades de maqueta (1 = 20 cm).

## Tomas (paso `tomas`)

Corta la narración en tomas, con rótulos y acciones.

- **Encuadre:** `general` (todo el escenario) u `objeto` (acercamiento a uno, con `objetivo`).
- **Rótulo:** 2 a 5 palabras, arriba, con `tono` `normal`, `alerta` (rojo) o `info` (azul).
- **Acciones**, ancladas a una palabra de la narración: `aparece`, `desaparece`, `pulso` (anillo de alarma), `cono` (campo de visión hacia otro objeto), `entra` (el personaje camina desde la puerta), `gira`, `cae`, `lluvia` y `falla` sobre una construcción (`resbala`, `ladea`, `raja`, `truena`, `pudre`).
- **Entrada de la toma:** la decide el código según lo que cambia. Otro escenario: `latigo`. Empieza la alerta: `destello`. La cámara va a un objeto del mismo escenario: `golpe`. Lo demás: `corte`. Se fija a mano con `entrada` en la toma de `pelicula.json`.

Reglas que revisa el código: las tomas cubren toda la narración sin huecos; un `cono` apunta a un objeto del mismo escenario; las etapas de una construcción aparecen y desaparecen en orden; una construcción no gira.

## Probar sin LLM

`guiones/tinta/ejemplo.json` es una película escrita a mano con objetos del catálogo. `pnpm tinta:studio` la muestra en vivo. Si una toma no convence en una corrida, se edita `runs/tinta/<nombre>/pelicula.json` y se repite `--desde sonido`.

## Objetos nuevos en 3D

El flujo completo original genera objetos propios: una imagen de cada objeto y, de ella, un modelo 3D. Eso pide un comando de imagen a 3D en `config/local.json` (`modelo3d`) y un proveedor de imágenes que dibuje (`nube` o `local`): ver [proveedores.md](proveedores.md). Sin ese comando, Tinta trabaja con el catálogo y lo dice al empezar.

## Límites

- **Catálogo doméstico:** muebles y aparatos de casa. Un tema de otro ámbito necesita objetos nuevos.
- **Cuatro escenarios.** Uno nuevo se programa en `src/tinta/escenarios.ts`.
- **Vistas generales repetidas:** muchas tomas `general` seguidas del mismo escenario se sienten quietas.
- **Una cámara:** dos tomas nunca se ven a la vez; el látigo saca una y mete la otra.
