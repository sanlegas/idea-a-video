# idea-a-video: motor

Esta carpeta es el motor de la skill `idea-a-video`: convierte una idea (un tema, o un guion ya escrito) en un video vertical narrado. Si eres un asistente trabajando aquí, esto es lo que necesitas; el detalle está en `docs/`.

## Operación

Todos los comandos se corren en esta carpeta.

```
pnpm asistente --estado          # primera vez o no, qué falta instalar, modos (auto, nube, local), plantillas y opciones
pnpm asistente --recomendado     # acepta lo recomendado; --guardar modo=local plantilla=… guarda una elección
pnpm video <nombre> --guion guiones/storytelling/<nombre>.md    # un video con la plantilla del usuario
pnpm video <nombre> --tema "…" --plantilla documental           # otra plantilla, solo en este video
pnpm video --plantillas          # los tipos de video
pnpm diagnostico                 # el detalle de la máquina y qué elegirá "auto"
pnpm flujo                       # los flujos, con todas sus opciones: pnpm flujo <flujo> --ayuda
```

## Primer uso

Si `pnpm asistente --estado` empieza con "Primera vez", el usuario aún no ha elegido nada. Si dice que falta instalar algo obligatorio, dale el comando que trae y espera. Luego resúmele en pocas líneas qué puede hacer su máquina y pregúntale una sola cosa: ¿cómo quiere trabajar? `auto` (lo recomendado, gratis sin claves), `nube` (ElevenLabs y FLUX, con sus claves y su costo) o `local` (nada sale de su equipo). Guarda con `--recomendado` o con `--guardar modo=…`, dile los avisos que imprime y ofrécele su primer video. Si llegó con un pedido concreto, usa `--recomendado` y haz el video. Paso a paso en `docs/primer-uso.md`.

Una plantilla es un tipo de video ya armado (flujo, estilo y duración): `historia`, `corto`, `documental`, `sobrio`, `datos`, `ilustrado`, `mundo`, `medida`.

Flujos: `storytelling` (corto narrado con fotos y láminas), `explica` (explicativo 2D), `tinta` (3D ilustrado), `plantillas` (3D con tomas programadas), `estudio` (3D con escenas hechas para el guion). Cada uno tiene su archivo `docs/flujo-<nombre>.md`.

## Pedidos: tú haces de LLM

Por defecto, los pasos que necesitan un modelo de lenguaje te los piden a ti. Cuando un comando termina con **código de salida 3**:

1. Lee el archivo `.pedido.md` que nombra el mensaje.
2. Escribe la respuesta en el archivo `.respuesta.json` (o `.txt`) que indica: solo el JSON pedido, sin texto alrededor.
3. Repite exactamente el mismo comando.

Si la respuesta se rechaza, el pedido trae una sección de correcciones: resuélvelas todas y repite. Detalle en `docs/pedidos.md`.

## Reglas

- **Claves:** nunca pidas una clave en el chat ni la escribas. El usuario edita su `.env` (ver `.env.example`). Todas son opcionales.
- **Di qué se eligió:** cada corrida imprime el proveedor de voz e imágenes y por qué. Repíteselo al usuario.
- **Antes de gastar:** con claves de nube activas, corre `--plan` y confirma con el usuario.
- **Gancho:** los primeros 5 a 10 segundos deciden si alguien se queda. Al escribir un guion o un plan, la primera frase es el gancho (5 a 16 palabras, directo al tema, sin saludo, algo que se pueda mostrar) y el primer plano es corto, cerca y en movimiento. Las reglas completas están en `scripts/lib/gancho.ts`.
- **Hechos:** el motor no verifica datos. No inventes cifras, nombres ni estudios; marca los que el usuario debe confirmar.
- **Revisa antes de entregar:** `runs/<flujo>/<nombre>/hoja.png` muestra un cuadro cada pocos segundos.
- **Modelos 3D nuevos:** con Blender en la máquina (`pnpm blender`), `pnpm estudio` construye solo los objetos clave que faltan en el catálogo: responde sus pedidos `modelos`, `modelo` (código Python) y `critico` (vista previa). No pide generador de imágenes; `--sin-blender` lo apaga. A mano: `pnpm blender <corrida>`. Detalle en `docs/blender.md`.
- **No rehagas de más:** los pasos terminados se saltan; `--desde <paso>` rehace desde uno y `--solo <paso>` solo ese.

## Dónde está cada cosa

| Carpeta | Contenido |
| --- | --- |
| `guiones/` | Guiones y planes |
| `runs/<flujo>/<nombre>/` | Una corrida: pasos, pedidos, `film.mp4`, `hoja.png`, `reporte.json` |
| `config/preferencias.json` | Lo que eligió el usuario en el asistente: modo, plantilla de siempre, estilo, segundos, quién escribe |
| `config/medios.json` | Valores por defecto de voz, imágenes y música |
| `config/models.json` | Perfiles de LLM para `--llm` |
| `config/local.json` | Lo propio de esta máquina (opcional; ver `config/local.example.json`) |
| `docs/` | Documentación completa: `primer-uso.md`, `inicio.md`, `maquina.md`, `proveedores.md`, `blender.md`, `edicion.md`, `opciones.md`, `licencias.md`, `problemas.md` |
