# Estudio: guion → video 3D con escenas hechas para ese guion

Sin plantillas: para cada escena, un modelo inventa la imagen, escribe un programa corto que la anima, mira los cuadros renderizados y la corrige. Sirve para cualquier tema. La calidad varía más que en los otros flujos: puede salir mejor, o con escenas que hay que rehacer.

```
pnpm estudio <nombre> --guion guiones/x.md
pnpm estudio <nombre> --llm openrouter        # recomendado: un modelo por API
pnpm estudio <nombre> --modelos taza,cama     # usa modelos 3D del catálogo (kit/modelos)
pnpm estudio <nombre> --sin-imagenes          # modo local: modelos y dibujos 2D, sin generar imágenes
pnpm estudio <nombre> --ligero                # render rápido para computadoras con poca GPU
pnpm estudio <nombre> --intentos 3            # revisiones visuales por escena
pnpm estudio <nombre> --una-escena            # todo el guion como una sola escena
pnpm estudio <nombre> --rehacer               # ignora escenas y sonido guardados
pnpm estudio <nombre> --sin-sonido            # solo voz
pnpm estudio:sonido <nombre> [--rehacer]      # rehace solo el sonido de una corrida terminada
```

Resultado: `runs/<nombre>/film.mp4` y `reporte.json`. Si una escena termina rota, `reporte.json` la lista en `review`. Si usa recursos reales, `credits` lista lo que hay que acreditar. Pide WebGL.

## Qué necesita

- **Imágenes generadas (opcionales):** con `FAL_KEY` o un comando de imagen propio, una escena puede pedir objetos realistas generados para ella. Las fotos de banco no sirven: las escenas piden objetos concretos. Sin generador, o con `modo=local` en el asistente, el flujo corre en modo local (abajo) y el diagnóstico lo marca `limitado`.
- **Recorte de fondo:** solo con imágenes generadas. Con un comando de recorte (`rembg`) cada objeto queda con su silueta; sin él, el fondo negro se vuelve transparente y los objetos oscuros pierden partes.
- **LLM:** con el asistente de la sesión funciona, pero es lento: cada escena deja varios pedidos (dirección, programa, y una crítica con imagen por cada intento). Para un video de 8 escenas son decenas de pedidos. Con una clave (`--llm openrouter` o `--llm deepseek`) corre solo.
- **Voz:** cualquiera.

## Guion

Un `.md` con la narración, con notas del autor opcionales (`>`). La primera frase es el gancho: ver [gancho.md](gancho.md). La escena 1 dura menos de 4.5 s cuando una coma o punto lo permite, y su primer momento cae en las dos primeras palabras.

## Modelos 3D ya hechos

El motor trae un catálogo de modelos 3D de juguete hechos por código, en `kit/modelos`: personas (oficinista, compañera, científico, piloto, mamá, señor…), animales, muebles, aparatos, vehículos, edificios y paisajes. Un modelo se ve igual en todas las escenas, se puede girar y, si tiene partes con nombre, moverlas: brazos y piernas que se sientan, puertas, agujas, tapas. Úsalo en vez de pedir una imagen cuando el objeto está en el catálogo.

```
pnpm modelos                                   # todos, con sus partes
pnpm modelos buscar silla                      # los que dicen "silla"
pnpm modelos usar <nombre> silla_oficina oficinista   # los anota en runs/<nombre>/modelos.json
pnpm modelos guardar <nombre> <modelo> --como <nuevo> --en "qué muestra (partes)"
```

- **Antes de correr el video**, busca los objetos y personajes del guion y pasa los que sirvan con `--modelos a,b` o `pnpm modelos usar`. El flujo los copia a la corrida y se los ofrece a cada escena con su descripción y proporciones.
- **En la escena:** `kit.model('<nombre>', {height})` lo pone de pie sobre el piso con esa altura; una parte se alcanza con `getObjectByName('<parte>')` y se gira desde su pivote (hombro, cadera, bisagra).
- **Modelos propios:** `runs/<nombre>/modelos.json` también acepta un `.glb` hecho para ese video: `{"cohete": {"archivo": "ruta/cohete.glb", "en": "qué muestra"}}`. Si queda bien, `pnpm modelos guardar` lo pasa al catálogo para los siguientes videos.

## Modo local: sin servicios externos

Cuando la máquina no tiene con qué generar imágenes, o con `--sin-imagenes`, Estudio no genera ni baja ninguna imagen. Cada escena se arma con:

- **Modelos 3D del catálogo** (`kit/modelos`) y los de la corrida. El pedido de dirección trae el catálogo completo, y los modelos que elige una escena se copian solos a la corrida.
- **Dibujos 2D hechos con código:** lo que no está en el catálogo se pinta como ilustración vectorial (rellenos planos, contorno grueso) sobre una tarjeta que mira a la cámara, y se anima moviéndolo, escalándolo o repintándolo.

Con la voz del sistema, el asistente como LLM y la música ya bajada, nada sale de la máquina. Lo único que pide es WebGL: `pnpm diagnostico --webgl` lo comprueba.

**Poca GPU:** cada cuadro se dibuja de 6 a 14 veces para suavizar el movimiento. `--ligero` lo baja a una o dos: en una prueba con WebGL por procesador (sin GPU), un clip de 4.7 s pasó de 261 s a 67 s, y con la GPU integrada de 13 s a 10 s. Se ve casi igual; el movimiento rápido queda un poco menos suave. Sin GPU, un video de 80 s tarda unos 20 minutos en clips.

## Etapas

| Etapa | Qué hace | Quién |
| --- | --- | --- |
| Entorno | Revisa herramientas, disco y clave | Código |
| Voz y palabras | Narra y mide cada palabra | Proveedor de voz |
| Ideas | Divide el guion en escenas y define el hilo visual; cada escena dice cómo sale: `corte`, `swipe` o `fundido` | LLM |
| Dirección | Para cada escena: la imagen, qué pasa en cada palabra clave y qué imágenes o recursos necesita | LLM |
| Imágenes y recursos | Genera objetos y lugares, recorta fondos y baja recursos permitidos | Proveedor de imágenes |
| Escritor | Escribe un programa corto por escena | LLM |
| Verificador | Revisa tipos y permisos del programa y renderiza momentos clave | Código |
| Crítico | Mide la imagen, señala problemas y elige entre versiones | Métricas y un LLM que ve imágenes |
| Clips y montaje | Renderiza cada escena y las une con texto y voz | Código |
| Sonido | Ánimo musical, ambiente y un efecto por momento | LLM y código |

Lo ya hecho se reutiliza: repetir el comando solo rehace lo que falte. Las imágenes se guardan por descripción, así que un protagonista se ve igual en todas sus escenas.

## Seguridad del código generado

Los programas de escena corren en el navegador de render, sin imports, red ni acceso a archivos. `scripts/estudio/lib/programa.ts` lo revisa antes de ejecutar y el kit lo bloquea al correr. Lo único que una escena puede usar está en `src/estudio/kit/api.d.ts`.

## Sonido y montaje

- **Transiciones:** `swipe` (con estela) y `fundido` (con cambio de foco). El LLM elige cuál al dividir el guion.
- **Sonido:** ánimo por escena (`tension`, `asombro`, `calma`, `cierre`) que se traduce a la música de la biblioteca; ambiente (`agua`, `viento`, `maquina`, `ciudad`, `electrico`) y efectos sintetizados; un barrido grabado en cada `swipe`. Ver [edicion.md](edicion.md).

## Límites

- **Calidad variable:** el bucle de corrección no garantiza una escena buena. Revisa `review` en el reporte.
- **Costo:** con API, cada escena son varias llamadas con imágenes. `reporte.json` trae el gasto real.
- **Recursos externos:** solo los de `config/recursos.json`, fijados por huella.
