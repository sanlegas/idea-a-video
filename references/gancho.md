# Gancho: los primeros 5 a 10 segundos

En un video corto casi todo el abandono pasa en los primeros segundos. Estas reglas valen para **todos los flujos** y para quien escriba el guion: el asistente, el usuario o un modelo. El motor las usa en sus pedidos (`scripts/lib/gancho.ts`) y revisa la primera frase de los guiones que escribe un modelo.

## Guion

- **La primera frase es el gancho.** De 5 a 16 palabras (lo típico en videos de millones de vistas es 9 a 14), dicha en menos de 3 segundos, y entra directo al tema.
- **Nada de relleno al inicio:** ni saludos, ni "en este video", ni "hoy te voy a explicar", ni definiciones o contexto histórico. El motor rechaza una primera frase que empiece así.
- **Un mecanismo claro.** Elige uno:

| Mecanismo | Ejemplo |
| --- | --- |
| Pregunta concreta que el video sí responde | "¿Por qué el agua del retrete nunca se desborda?" |
| Situación en segunda persona con algo en juego | "Vas a cien kilómetros por hora y una abeja flota junto a tu cara." |
| Contradicción: dos hechos que chocan | "Esta torre resistió el sismo que tiró los edificios nuevos de su cuadra." |
| Consecuencia oculta de algo cotidiano | "Cada vez que frenas, tu café intenta seguir de largo." |
| Resultado o cifra sorprendente primero | "Un avión pesa cuatrocientas toneladas y aun así flota en el aire." |
| Hecho que exige explicación | "En mil novecientos cincuenta y siete, una sola torre quedó en pie." |

- **Se puede mostrar.** La primera frase nombra algo visible: se entiende sin audio y en pantalla se ve justo lo que se oye.
- **Anticipa el pago** en la segunda o tercera frase, con algo concreto. Nunca promesas vagas ("no vas a creer lo que pasa"): se sienten trampa.
- **Antes del segundo 10** queda claro de qué trata y por qué importa. La respuesta completa llega después y el video termina poco después de darla.
- **Una sola pregunta central** por video. "Pero" y "entonces" hacen avanzar la historia.

## Imagen y sonido de la apertura

- **El primer cuadro es la imagen más llamativa del video:** el protagonista centrado, grande y en acción, con tres objetos como máximo. Debe funcionar como miniatura.
- **Sin fundido desde negro, títulos, logos ni planos vacíos.** El video empieza en plena acción.
- **Movimiento desde el cuadro 0:** la cámara entra rápido, o algo cae, gira, choca o aparece de golpe.
- **La imagen dice lo mismo que la voz** en ese instante.
- **Primer plano corto:** de 1.5 a 3 segundos. En los primeros 10 segundos el plano o la acción cambian cada 1.5 a 3 segundos.
- **Texto en pantalla:** si lo hay, comprime el gancho en 2 a 4 palabras con una resaltada; no repite toda la narración.
- **Sonido:** un golpe o barrido marca el primer cuadro, y la música entra ya sonando, sin subir poco a poco.

## Qué hace cada flujo con esto

| Flujo | Gancho del guion | Apertura |
| --- | --- | --- |
| Storytelling | El paso `guion` (con `--tema`) sigue estas reglas y revisa la primera frase | El primer plano dura menos de 3 s, no es abierto y muestra la primera frase |
| Estudio | Escríbelo tú en el guion | La escena 1 dura menos de 4.5 s cuando una coma lo permite; su primer momento cae en las dos primeras palabras |
| Tinta | Escríbelo tú en el guion | La toma 1 es un acercamiento a un objeto, con una acción en las palabras 0 a 2 |
| Plantillas | Escríbelo tú en el guion | El primer beat abre con el protagonista y un texto de gancho |
| Explica | La portada es el gancho: título con la pregunta o la cifra | Entra de golpe, sin fundido |
