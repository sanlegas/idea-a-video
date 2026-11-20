#!/usr/bin/env python3
"""Local voice on the processor, with Piper (https://github.com/OHF-Voice/piper1-gpl), in the contract of
scripts/lib/local.ts: voz_piper.py <lineas.json> <carpeta> leaves one beat_NN.wav per line.

Setup, once:
    pip install piper-tts
    python scripts/local/voz_piper.py --instalar            # downloads the default voice (63 MB)
Then, in config/local.json:
    "voz": {"comando": ["python", "scripts/local/voz_piper.py"]}

The voice is the one VOZ names in the environment (a Piper voice such as es_MX-ald-medium, installed with
--instalar <name>), or es_MX-claude-high. Piper is GPL-3.0; it runs here as a separate program."""
import json
import os
import sys
import urllib.request
import wave
from pathlib import Path

VOCES = Path.home() / ".cache" / "idea-a-video" / "piper"
POR_DEFECTO = "es_MX-claude-high"


def archivo(nombre):
    return VOCES / f"{nombre}.onnx"


def instalar(nombre):
    """Downloads a voice of the public Piper collection: es_MX-claude-high lives at es/es_MX/claude/high/."""
    idioma, quien, calidad = nombre.split("-")
    base = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{idioma.split('_')[0]}/{idioma}/{quien}/{calidad}/{nombre}.onnx"
    VOCES.mkdir(parents=True, exist_ok=True)
    for sufijo in ("", ".json"):
        destino = Path(str(archivo(nombre)) + sufijo)
        if not destino.exists():
            print(f"bajando {destino.name}", flush=True)
            urllib.request.urlretrieve(base + sufijo, destino)
    print(f"voz lista: {archivo(nombre)}")


if len(sys.argv) > 1 and sys.argv[1] == "--instalar":
    instalar(sys.argv[2] if len(sys.argv) > 2 else POR_DEFECTO)
    sys.exit(0)

if len(sys.argv) < 3:
    raise SystemExit(__doc__)

voz = os.environ.get("VOZ") or POR_DEFECTO
if not archivo(voz).exists():
    raise SystemExit(f"falta la voz {voz}: corre  python scripts/local/voz_piper.py --instalar {voz}")
try:
    from piper import PiperVoice
except ImportError:
    raise SystemExit("falta Piper: corre  pip install piper-tts")

lineas = json.load(open(sys.argv[1], encoding="utf8"))
carpeta = Path(sys.argv[2])
carpeta.mkdir(parents=True, exist_ok=True)
modelo = PiperVoice.load(str(archivo(voz)))
for i, texto in enumerate(lineas):
    with wave.open(str(carpeta / f"beat_{i:02d}.wav"), "wb") as salida:
        modelo.synthesize_wav(texto, salida)
