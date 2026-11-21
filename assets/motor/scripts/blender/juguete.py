"""Pieces for building glossy toy 3D models by code in Blender, for the estudio flow.

The assistant writes a short script with one function per model and a MODELOS table; `pnpm blender <run>` runs it in
Blender with no window (scripts/blender/correr.py) and leaves, for each model, <name>.glb, two preview pictures and its
measures in runs/<run>/modelos_src. See scripts/blender/ejemplo.py and the skill's references/blender.md.

Conventions every model follows, so kit.model() and the scene programs find what they expect:
- Up is +Z and the front faces -Y (the camera side; glTF +Z). The base sits at z = 0.
- A part a scene moves is one named object (unir) whose origin is the point it turns around: shoulder, hinge, axle.
  In the scene it is model.getObjectByName('<name>'). Names: lower case, digits and _, like brazo_d or puerta.
- A colour a scene changes, glass, or a light is a named material (material('vidrio', ...)): the scene finds it by name.
- A model's function may return named points {name: (x, y, z)}: they are saved, in the frame kit.model gives, in
  anclas.json, so a scene can put things exactly on a handle, a screen or a seat.
Colours are '#RRGGBB' strings or materials made with material().
"""
import json
import math
import os

import bmesh
import bpy
from mathutils import Vector

# What `from juguete import *` gives a model script: the pieces, nothing of the modules this file uses.
__all__ = ['material', 'con', 'caja', 'cilindro', 'cono', 'esfera', 'toro', 'palo', 'torno', 'placa', 'arco', 'unir', 'colgar', 'ojos', 'Vector']

RUGOSIDAD = float(os.environ.get('RUGOSIDAD', '0.4'))
ANCLAS = {}
_por_color = {}


# ---------------------------------------------------------------- materials

def _lineal(hexcolor):
    h = hexcolor.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]


def _entrada(bsdf, *nombres):
    for n in nombres:
        if n in bsdf.inputs:
            return bsdf.inputs[n]
    return None


def material(nombre, color, rugosidad=None, metal=0.0, emision=0.0, alfa=1.0):
    """A named material, made once: a scene finds glass, lights or a recolourable body by this name."""
    m = bpy.data.materials.get(nombre)
    if m:
        return m
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    lin = _lineal(color)
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    bsdf.inputs['Roughness'].default_value = RUGOSIDAD if rugosidad is None else rugosidad
    bsdf.inputs['Metallic'].default_value = metal
    if alfa < 1:
        bsdf.inputs['Alpha'].default_value = alfa
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(m, attr, val)
            except (AttributeError, TypeError):
                pass
    if emision:
        # Blender 4 renamed the emission colour input; older versions call it Emission.
        c = _entrada(bsdf, 'Emission Color', 'Emission')
        if c:
            c.default_value = (*lin, 1)
        f = _entrada(bsdf, 'Emission Strength')
        if f:
            f.default_value = emision
    m.diffuse_color = (*lin, alfa)
    return m


def _mat(color):
    if not isinstance(color, str):
        return color
    if color not in _por_color:
        _por_color[color] = material(f'color_{color.lstrip("#").lower()}', color)
    return _por_color[color]


def con(obj, mat):
    """Gives an object one material (a '#RRGGBB' colour or a material)."""
    obj.data.materials.clear()
    obj.data.materials.append(_mat(mat))
    return obj


def suave(o):
    for p in o.data.polygons:
        p.use_smooth = True
    return o


# ---------------------------------------------------------------- shapes

_EJES = {'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0), 'z': (0, 0, 0)}


def caja(tam, centro, mat, bisel=0.0):
    """Box of size (x, y, z) centred at centro; bisel rounds its edges (toys have no sharp corners)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=centro)
    o = bpy.context.active_object
    o.scale = tam
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bisel:
        b = o.modifiers.new('bisel', 'BEVEL')
        b.width = bisel
        b.segments = 3
    return con(o, mat)


def cilindro(r, alto, centro, mat, eje='z', lados=48):
    """Cylinder along eje ('x', 'y' or 'z'): a wheel facing the camera is eje='y'."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=alto, location=centro, rotation=_EJES[eje], vertices=lados)
    return con(suave(bpy.context.active_object), mat)


def cono(r1, r2, alto, centro, mat, eje='z', lados=48):
    """Cone or truncated cone along eje: r1 at the bottom (or the -axis end), r2 at the top."""
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=alto, location=centro, rotation=_EJES[eje], vertices=lados)
    return con(suave(bpy.context.active_object), mat)


def esfera(r, centro, mat, escala=(1, 1, 1)):
    """Sphere, or an ellipsoid with escala: heads, bodies, eyes, noses."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=centro, segments=32, ring_count=16)
    o = bpy.context.active_object
    o.scale = escala
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return con(suave(o), mat)


def toro(R, r, centro, mat, eje='z'):
    """Ring: R is the ring radius, r the tube radius."""
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=centro, rotation=_EJES[eje], major_segments=64, minor_segments=12)
    return con(suave(bpy.context.active_object), mat)


def palo(p1, p2, r, mat, lados=16):
    """Round bar from point p1 to point p2: arms, legs, handles, poles."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(p1 + p2) / 2, vertices=lados)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return con(suave(o), mat)


def torno(perfil, mat, nombre='torno', lados=64, centro=(0, 0, 0)):
    """Solid of revolution about the vertical axis from a profile [(radius, z), ...]: cups, vases, bottles, lamps.
    A radius of 0 closes that end. The object sits at centro, so rotating it turns it about that point."""
    me = bpy.data.meshes.new(nombre)
    bm = bmesh.new()
    anillos = []
    for r, z in perfil:
        if r < 1e-6:
            anillos.append([bm.verts.new((0, 0, z))])
        else:
            anillos.append([bm.verts.new((r * math.cos(2 * math.pi * k / lados), r * math.sin(2 * math.pi * k / lados), z)) for k in range(lados)])
    for a, b in zip(anillos, anillos[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for k in range(lados):
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[(k + 1) % lados]))
            elif len(b) == 1:
                bm.faces.new((a[k], a[(k + 1) % lados], b[0]))
            else:
                bm.faces.new((a[k], a[(k + 1) % lados], b[(k + 1) % lados], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nombre, me)
    bpy.context.collection.objects.link(o)
    o.location = centro
    return con(suave(o), mat)


def placa(puntos, centro_y, grosor, mat, nombre='placa'):
    """Flat piece facing the camera: a polygon of (x, z) points, extruded grosor along Y around centro_y.
    Stars, signs, leaves, flat shapes."""
    me = bpy.data.meshes.new(nombre)
    bm = bmesh.new()
    a = [bm.verts.new((x, centro_y - grosor / 2, z)) for x, z in puntos]
    b = [bm.verts.new((x, centro_y + grosor / 2, z)) for x, z in puntos]
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    n = len(puntos)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nombre, me)
    bpy.context.collection.objects.link(o)
    return con(o, mat)


def arco(R, r, centro, mat, desde=math.pi * 1.1, hasta=math.pi * 1.9, nombre='arco'):
    """Part of a ring facing the camera, from angle desde to hasta (pi..2pi is the lower half: a smile).
    Returned as its own object named nombre, origin at centro (a mouth named 'boca' can be flipped to a frown with
    scale.y = -1 in the scene)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=(0, 0, 0), major_segments=64, minor_segments=12)
    o = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(o.data)
    fuera = [v for v in bm.verts if not (desde - 0.05 <= math.atan2(v.co.y, v.co.x) % (2 * math.pi) <= hasta + 0.05)]
    bmesh.ops.delete(bm, geom=fuera, context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    suave(o)
    o.rotation_euler.x = math.pi / 2
    o.location = centro
    con(o, mat)
    return unir([o], nombre, centro)


# ---------------------------------------------------------------- parts

def aplicar(obj):
    """Bakes modifiers, rotation and scale into the mesh: the exported node keeps only its position (its pivot)."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    # location=False must be explicit: the origin is the pivot a scene turns the part around.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def unir(objs, nombre, pivote):
    """Joins pieces into one named part whose origin is pivote, the point it turns around (shoulder, hinge, axle)."""
    for o in objs:
        aplicar(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    bpy.context.scene.cursor.location = pivote
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)
    o.name = nombre
    o.data.name = nombre
    return o


def colgar(hijo, padre):
    """Hangs a part from another keeping where it is: a forearm from an arm, eyes from a head that turns."""
    hijo.parent = padre
    hijo.matrix_parent_inverse = padre.matrix_world.inverted()
    return hijo


def ojos(z, y, sep=0.15, r=0.11, color_ceja='#2A160C', alto_ceja=0.2):
    """Big cartoon eyes facing the camera at height z, front y: ojo_d / ojo_i (origin at each eye, scale its height to
    blink) and brows ceja_d / ceja_i. ojo_d is the one on the right of the screen."""
    blanco = material('ojo', '#FFFFFF', rugosidad=0.15)
    negro = material('pupila', '#17191D', rugosidad=0.1)
    brillo = material('brillo', '#FFFFFF', emision=0.6)
    ceja = material('ceja', color_ceja)
    for lado, n in ((1, 'd'), (-1, 'i')):
        c = (lado * sep, y, z)
        piezas = [esfera(r, c, blanco, escala=(0.9, 0.55, 1.1)),
                  esfera(r * 0.5, (c[0], y - r * 0.5, z - r * 0.15), negro, escala=(1, 0.4, 1.1)),
                  esfera(r * 0.16, (c[0] + r * 0.18, y - r * 0.72, z + r * 0.1), brillo)]
        unir(piezas, f'ojo_{n}', c)
        unir([caja((r * 1.4, 0.03, r * 0.32), (lado * sep, y - 0.01, z + alto_ceja), ceja, bisel=0.012)], f'ceja_{n}', (lado * sep, y - 0.01, z + alto_ceja))


# ---------------------------------------------------------------- export

# Names Blender gives on its own: a part someone meant to name never looks like these.
_AUTOMATICO = ('Cube', 'Sphere', 'Cylinder', 'Torus', 'Cone', 'Plane', 'Circle', 'Icosphere', 'torno', 'placa', 'arco')


def limpiar():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    _por_color.clear()


def _foto(carpeta, archivo, centro, lado, desde):
    """A quick picture of the model (Workbench, no lights to set up) for the assistant to check before using it."""
    sc = bpy.context.scene
    for o in [o for o in sc.objects if o.type in ('CAMERA', 'EMPTY')]:
        bpy.data.objects.remove(o, do_unlink=True)
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.world = sc.world or bpy.data.worlds.new('mundo')
    bpy.ops.object.empty_add(location=centro)
    mira = bpy.context.active_object
    lejos = lado * 2.1
    bpy.ops.object.camera_add(location=(centro.x + lejos * desde[0], centro.y + lejos * desde[1], centro.z + lejos * desde[2]))
    cam = bpy.context.active_object
    seguir = cam.constraints.new('TRACK_TO')
    seguir.target = mira
    seguir.track_axis = 'TRACK_NEGATIVE_Z'
    seguir.up_axis = 'UP_Y'
    cam.data.lens = 45
    sc.camera = cam
    sc.render.filepath = os.path.join(carpeta, archivo)
    bpy.ops.render.render(write_still=True)


def exportar(nombre, construir, carpeta):
    """Builds one model in an empty scene and writes <nombre>.glb, <nombre>.png (three-quarter view),
    <nombre>_frente.png (as the scene camera sees it) and its entry in ANCLAS: longest side, width × height × depth in
    the kit frame, its named parts and the points construir() returned."""
    limpiar()
    puntos = construir() or {}
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH':
            aplicar(o)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(carpeta, f'{nombre}.glb'), export_format='GLB', use_selection=True, export_apply=True)
    mallas = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in mallas for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    # The frame kit.model gives (before it scales the model to the height a scene asks): glTF axes (x, z, -y), centred
    # on x and on depth, base at y = 0.
    kit = lambda p: [round(p[0] - (lo.x + hi.x) / 2, 4), round(p[2] - lo.z, 4), round(-p[1] + (lo.y + hi.y) / 2, 4)]
    dims = hi - lo
    partes = sorted({o.name for o in mallas if not o.name.split('.')[0] in _AUTOMATICO and not o.name.startswith('color_')})
    ANCLAS[nombre] = {'largo': round(max(dims), 4), 'medidas': [round(dims.x, 4), round(dims.z, 4), round(dims.y, 4)], 'partes': partes, **{k: kit(v) for k, v in puntos.items()}}
    centro, lado = (lo + hi) / 2, max(dims)
    try:
        _foto(carpeta, f'{nombre}.png', centro, lado, (-0.75, -0.65, 0.3))
        _foto(carpeta, f'{nombre}_frente.png', centro, lado, (0, -1.0, 0.12))
    except Exception as e:  # a machine with no graphics for Blender still gets its .glb
        print(f'AVISO {nombre}: sin vista previa ({e})')
    print(f'modelo {nombre}: medidas {ANCLAS[nombre]["medidas"]}, partes {", ".join(partes) or "ninguna"}')
