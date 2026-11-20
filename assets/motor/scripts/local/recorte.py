#!/usr/bin/env python3
"""Cut objects out of their background: recorte.py <jobs.json>. Jobs: [{"from", "to"}]. Needs rembg and Pillow (pip install rembg pillow)."""
import json
import sys

from PIL import Image
from rembg import new_session, remove

session = new_session("isnet-general-use", providers=["CPUExecutionProvider"])
for job in json.load(open(sys.argv[1])):
    cut = remove(Image.open(job["from"]).convert("RGB"), session=session)
    box = cut.point(lambda v: 255 if v > 12 else 0).getchannel("A").getbbox() or (0, 0, cut.width, cut.height)
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(cut.width, box[2] + pad), min(cut.height, box[3] + pad))
    trimmed = cut.crop(box)
    trimmed.save(job["to"])
    print(json.dumps({"to": job["to"], "aspect": trimmed.width / trimmed.height}), flush=True)
