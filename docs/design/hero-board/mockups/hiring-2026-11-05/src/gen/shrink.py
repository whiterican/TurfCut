#!/usr/bin/env python3
"""Quantise the rendered PNGs to a 256-colour palette so the package stays small
in git. Lossy only in colour depth (no resampling): the pixel grid, DPR 2, stays.
Run after build.mjs: python3 src/gen/shrink.py  (from the mockup folder)."""
import sys, pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[2]
total_before = total_after = 0
for png in list(root.glob("*.png")) + list((root / "annotated").glob("*.png")) + list((root / "viewport").glob("*.png")):
    before = png.stat().st_size
    im = Image.open(png).convert("RGBA")
    q = im.convert("P", palette=Image.ADAPTIVE, colors=256)
    q.save(png, optimize=True)
    after = png.stat().st_size
    total_before += before; total_after += after
print(f"{total_before/1e6:.1f} MB -> {total_after/1e6:.1f} MB")
