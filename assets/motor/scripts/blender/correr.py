"""Runs inside Blender (no window): builds the models of one script and writes them to a folder.

Called by `pnpm blender` (scripts/blender.ts) as:
  blender -b --factory-startup --python-exit-code 2 --python scripts/blender/correr.py -- <script.py> <carpeta> [nombre...]
The script defines MODELOS = {'nombre': (funcion, 'qué muestra, con sus partes entre paréntesis')} and builds each
model with the pieces of juguete.py. Writes <carpeta>/<nombre>.glb and its previews for every model (or only the named
ones), and keeps <carpeta>/anclas.json and <carpeta>/modelos.json up to date.
"""
import json
import os
import re
import runpy
import sys
import traceback

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import juguete  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]
if len(args) < 2:
    raise SystemExit('uso: correr.py <script.py> <carpeta> [nombre...]')
script, carpeta, solo = args[0], args[1], args[2:]
os.makedirs(carpeta, exist_ok=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(script)))

modelos = runpy.run_path(script).get('MODELOS')
if not isinstance(modelos, dict) or not modelos:
    raise SystemExit(f'{script} no define MODELOS = {{"nombre": (funcion, "descripción")}}')
for nombre, valor in modelos.items():
    if not re.fullmatch(r'[a-z0-9_]+', nombre):
        raise SystemExit(f'modelo "{nombre}": usa minúsculas, números y _')
    if not (isinstance(valor, tuple) and len(valor) == 2 and callable(valor[0]) and isinstance(valor[1], str)):
        raise SystemExit(f'modelo "{nombre}": su valor es (funcion, "descripción")')
faltan = [n for n in solo if n not in modelos]
if faltan:
    raise SystemExit(f'{script} no tiene {", ".join(faltan)}: tiene {", ".join(modelos)}')

archivo_anclas = os.path.join(carpeta, 'anclas.json')
if os.path.exists(archivo_anclas):
    juguete.ANCLAS.update(json.load(open(archivo_anclas, encoding='utf-8')))

fallas = []
for nombre, (construir, _) in modelos.items():
    if solo and nombre not in solo:
        continue
    try:
        juguete.exportar(nombre, construir, carpeta)
    except Exception:
        fallas.append(nombre)
        print(f'FALLA {nombre}:\n{traceback.format_exc()}')

json.dump(juguete.ANCLAS, open(archivo_anclas, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# The folder's list keeps models other scripts built there before.
archivo_lista = os.path.join(carpeta, 'modelos.json')
hechos = json.load(open(archivo_lista, encoding='utf-8')) if os.path.exists(archivo_lista) else {}
hechos.update({n: {'archivo': os.path.join(carpeta, f'{n}.glb'), 'en': d} for n, (_, d) in modelos.items() if os.path.exists(os.path.join(carpeta, f'{n}.glb'))})
json.dump(hechos, open(archivo_lista, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if fallas:
    raise RuntimeError(f'no se pudieron construir: {", ".join(fallas)}')
