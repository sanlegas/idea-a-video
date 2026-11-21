# Modelos 3D nuevos con Blender

Cuando un video `medida` (flujo estudio) necesita un objeto o personaje que no está en el catálogo (`pnpm modelos buscar <palabra>`), se construye por código: el LLM de la corrida (tú, el asistente, si no hay clave) escribe una función corta de Python con piezas de juguete (cajas, esferas, cilindros, tornos) y Blender la convierte en un `.glb` sin abrir ventana. Si la máquina tiene Blender, `pnpm estudio` lo hace solo; también se puede hacer a mano antes.

**No hace falta generador de imágenes, ni claves, ni GPU especial.** El modelo sale solo del script: Blender corre en la computadora del usuario y nada sale de ella. Lo único que pide es Blender instalado. Un modelo tarda un par de segundos.

| Para un objeto nuevo en 3D | Pide | Resultado |
| --- | --- | --- |
| Blender, con el asistente (esta guía) | Blender 4.2 o más nuevo | modelo de juguete brillante, con partes que se mueven y colores con nombre |
| Imagen a 3D (comando `modelo3d`, flujo tinta) | generador de imágenes y GPU NVIDIA con mucha memoria | objeto con aspecto de la imagen, sin partes que se muevan |
| Ninguno | — | catálogo, o un dibujo 2D hecho con código |

## Instalar y comprobar

```
pnpm blender            # dónde está Blender y su versión, o cómo instalarlo
```

- **macOS:** `brew install --cask blender`, o el instalador de https://www.blender.org/download
- **Windows:** `winget install BlenderFoundation.Blender`, o el instalador
- **Linux:** `sudo snap install blender --classic`, o el archivo de blender.org

El motor lo busca en el lugar de siempre de cada sistema y en el `PATH`. Si está en otro lado: `{"blender": {"ruta": "…"}}` en `config/local.json`, o la variable `BLENDER`. `pnpm asistente --estado` y `pnpm diagnostico` lo reportan como opcional.

## Dentro de `pnpm estudio` (automático)

Si la máquina tiene Blender, `pnpm estudio` agrega una etapa después de las ideas. No hay que pedirla: `--sin-blender` la apaga.

1. **Plan** (pedido `modelos`): con el concepto, las escenas y el catálogo, decide qué personajes u objetos clave faltan, hasta 4. Cero es válido. Cada uno con nombre, descripción y partes que se mueven entre paréntesis.
2. **Código** (pedido `modelo`, uno por modelo): una función `def construir():` en Python con las piezas de `juguete.py`. El motor revisa el código antes de correrlo (solo `juguete`, `math`, `random` y `mathutils`; nada de archivos, sistema ni `bpy`) y lo construye en Blender. Si no pasa la revisión o Blender da error, el pedido vuelve con el error y el código anterior.
3. **Revisión** (pedido `critico`, con imagen): las dos vistas lado a lado en `runs/<corrida>/modelos_src/<nombre>_revision.png`. Si no se reconoce, vuelve al paso 2 con los problemas. Tres intentos por modelo; si nunca se construye, se omite y las escenas usan el catálogo o un dibujo 2D.

Lo construido entra a `runs/<corrida>/modelos.json` y cada escena lo recibe con su descripción y proporciones. Con el asistente como LLM, tú respondes esos pedidos como cualquier otro (ver [pedidos.md](pedidos.md)); con una clave de LLM, corre solo. Los archivos quedan en `runs/<corrida>/modelos_src`: `modelos_plan.json`, `<nombre>.py`, `<nombre>.glb`, las vistas y `<nombre>.estado.json` (los intentos).

## A mano, antes de correr

Para controlar cada detalle, o para modelos que la etapa automática no pidió, constrúyelos tú antes de `pnpm estudio`. Lo que ya está en `runs/<corrida>/modelos.json` el plan lo da por hecho.

1. **Lee el guion y busca en el catálogo** los objetos y personajes clave. Lo que esté, úsalo (`pnpm modelos usar <corrida> a b`). Construye solo lo que falte y se vea mucho: el protagonista, el chiste recurrente, el aparato que explica el video. Lo secundario puede ser un dibujo 2D.
2. **Empieza el script de la corrida:**
   ```
   pnpm blender <corrida> --nuevo     # crea runs/<corrida>/modelos.py con dos modelos de ejemplo
   ```
3. **Escribe un modelo por función** y la tabla `MODELOS` al final (abajo, las reglas). Usa las piezas de `scripts/blender/juguete.py`; el ejemplo es `scripts/blender/ejemplo.py`.
4. **Constrúyelos:**
   ```
   pnpm blender <corrida>             # todos los de runs/<corrida>/modelos.py
   pnpm blender <corrida> tren mamut  # solo esos
   ```
   Deja en `runs/<corrida>/modelos_src` cada `<nombre>.glb`, `<nombre>.png` (vista de tres cuartos), `<nombre>_frente.png` (como lo ve la cámara de una escena) y `anclas.json` (medidas, partes y puntos), y los anota en `runs/<corrida>/modelos.json`. Si el script falla, imprime el error de Python: corrígelo y repite.
5. **Mira las dos vistas de cada modelo** antes de seguir (si puedes ver imágenes). Lo típico: una pieza girada desde el lugar equivocado, partes que se atraviesan, un color que no se distingue del fondo oscuro, ojos que no miran al frente.
6. **Corre el video:** `pnpm estudio <corrida> --guion …`. Cada escena recibe los modelos con su descripción y proporciones; el programa de la escena los pone con `kit.model('<nombre>', {height})` y mueve sus partes con `getObjectByName('<parte>')`.
7. **Si un modelo sirve para otros videos:** `pnpm modelos guardar <corrida> <nombre> --en "qué muestra (partes)"` lo pasa al catálogo.

Si ya vas a mitad de una corrida y una dirección necesita un modelo que no existe, puedes construirlo en ese momento y repetir el comando: la corrida vuelve a leer `runs/<corrida>/modelos.json` cada vez.

## Reglas del script

```python
from juguete import caja, cilindro, esfera, material, ojos, palo, unir

def cohete():
    cuerpo = material('cuerpo', '#F2F4F7', rugosidad=0.3)        # color que una escena puede cambiar
    cilindro(0.35, 1.6, (0, 0, 1.0), cuerpo)
    ...
    unir([aleta1, aleta2], 'aletas', (0, 0, 0.4))                  # parte que se mueve, con su pivote
    return {'punta': (0, 0, 2.2)}                                  # puntos con nombre para las escenas

MODELOS = {
    'cohete': (cohete, 'cohete blanco de juguete con aletas rojas (aletas) y ventanilla azul (material vidrio)'),
}
```

- **Ejes:** arriba es `+Z`, el frente mira a `-Y` (hacia la cámara), la base queda en `z = 0`. Un vehículo o animal de perfil va con la nariz hacia `+X`.
- **Tamaño:** en metros de juguete; una persona mide ~2.4 y una taza ~0.6. La escena fija la altura final, pero las proporciones entre partes son las del script.
- **Estilo de juguete:** formas simples y redondeadas (`bisel` en las cajas), colores saturados, pocas piezas grandes. Cabezas grandes y ojos con `ojos()` dan personajes simpáticos. Evita piezas muy finas: a la distancia de la cámara desaparecen.
- **Partes que se mueven:** cada una es un objeto con nombre hecho con `unir(piezas, 'nombre', pivote)`; el pivote es el punto desde donde gira (hombro, bisagra, eje de la rueda). Nombres en minúsculas con `_`: `brazo_d`, `puerta`, `llanta_1`. Una parte que cuelga de otra (antebrazo del brazo, ojos de una cabeza que gira) se une con `colgar(hijo, padre)`.
- **Materiales con nombre** para lo que una escena cambia: un color (`cuerpo`), un vidrio (`vidrio`: el motor lo carga opaco y la escena lo vuelve transparente por su nombre), una luz (`material('foco', '#FFF2B3', emision=2)`).
- **La descripción de `MODELOS`** es lo que lee quien escribe la escena: di qué es, de qué color, hacia dónde mira, y cada parte o material con nombre entre paréntesis.
- **Puntos con nombre:** lo que devuelve la función (una manija, una pantalla, un asiento) queda en `anclas.json` en el marco de `kit.model`, para poner cosas justo ahí.

Piezas de `juguete.py`: `caja`, `cilindro`, `cono`, `esfera`, `toro`, `palo` (barra entre dos puntos), `torno` (sólido de revolución: tazas, botellas, lámparas), `placa` (figura plana extruida: estrellas, letreros), `arco` (una boca), `ojos`, `unir`, `colgar`, `material`. Los colores van como `'#RRGGBB'` o como un material.

## Si tu entorno se conecta a Blender en vivo

Algunos asistentes pueden conectarse a una ventana abierta de Blender (por ejemplo, con un servidor MCP de Blender). Sirve para mirar o retocar a mano, pero el modelo que entra al video sale del script de la corrida: así se puede rehacer igual, revisar y guardar en el catálogo. Si lo cambias en vivo, pasa el cambio al script y repite `pnpm blender <corrida>`.
