"""Example of a run's model script: copy it to runs/<run>/modelos.py (`pnpm blender <run> --nuevo` does it) and
replace the models with the ones the video needs. `pnpm blender <run>` builds them.

Each model is a function that builds it with the pieces of juguete.py (sizes in metres of a toy: a person is ~2.4 tall)
and may return named points for the scenes. MODELOS at the end says, for each one, what it shows and which parts move:
that text is what the scene writer reads.
"""
import math

from juguete import arco, caja, cilindro, esfera, material, ojos, palo, toro, torno, unir


def lampara():
    """Desk lamp about 1.6 tall: base, arm that tilts at the base (brazo), shade with a bulb that lights (material foco)."""
    metal = material('metal', '#D9DEE5', rugosidad=0.2, metal=0.8)
    pintura = material('cuerpo', '#3FA7FF', rugosidad=0.3)
    cilindro(0.45, 0.1, (0, 0, 0.05), pintura)
    cilindro(0.08, 0.1, (0, 0, 0.15), metal)
    # The arm and everything above it is one part, so the scene tilts it all from its base.
    piezas = [palo((0, 0, 0.2), (0.25, 0, 1.2), 0.05, pintura),
              esfera(0.08, (0.25, 0, 1.2), metal),
              palo((0.25, 0, 1.2), (0.6, 0, 1.35), 0.045, pintura)]
    pantalla = torno([(0.06, 0.0), (0.12, -0.05), (0.32, -0.38), (0.3, -0.4), (0.1, -0.08), (0.0, -0.05)], pintura, 'pantalla', centro=(0.62, 0, 1.4))
    pantalla.rotation_euler.y = math.radians(-25)
    foco = esfera(0.1, (0.77, 0, 1.07), material('foco', '#FFF2B3', emision=2.0))
    unir(piezas + [pantalla, foco], 'brazo', (0, 0, 0.2))
    return {'foco': (0.77, 0, 1.07)}


def regalo():
    """Gift box about 1.1 tall with a face: lid with a bow that opens on its back hinge (tapa), eyes, brows and mouth."""
    papel = material('papel', '#FF4F7B', rugosidad=0.35)
    cinta = material('cinta', '#FFD34D', rugosidad=0.25)
    caja((1.0, 1.0, 0.8), (0, 0, 0.4), papel, bisel=0.04)
    caja((0.16, 1.02, 0.81), (0, 0, 0.4), cinta, bisel=0.01)
    t = [caja((1.08, 1.08, 0.18), (0, 0, 0.89), papel, bisel=0.04),
         caja((0.17, 1.1, 0.19), (0, 0, 0.89), cinta, bisel=0.01),
         toro(0.13, 0.05, (-0.13, 0, 1.05), cinta, eje='y'),
         toro(0.13, 0.05, (0.13, 0, 1.05), cinta, eje='y')]
    # Hinge on the back edge of the lid: rotating tapa about x opens it backwards.
    unir(t, 'tapa', (0, 0.54, 0.8))
    ojos(0.5, -0.5, sep=0.2, r=0.1)
    arco(0.09, 0.02, (0, -0.505, 0.28), material('boca', '#5A1F2E'), nombre='boca')
    return {'centro_tapa': (0, 0, 1.0)}


MODELOS = {
    'lampara': (lampara, 'lámpara de escritorio azul de juguete: brazo que se inclina desde la base (brazo) y foco que se enciende (material foco)'),
    'regalo': (regalo, 'caja de regalo rosa de juguete con moño amarillo y carita: tapa con bisagra atrás (tapa), ojos (ojo_d, ojo_i), cejas (ceja_d, ceja_i) y boca (boca)'),
}
