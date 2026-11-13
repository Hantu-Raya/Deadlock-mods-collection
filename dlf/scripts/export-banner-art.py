"""Exports the DLF banner art from the league PSD (default G:\\NEW HUD 3 ban.psd, 2026-10-28).

  dlf_banner.png            1920x100 banner: PSD rows 504..603 (the top screen edge is row 504). The
                            solid band is rows 0..67; rows 68..99 are the torn bottom edge, which
                            fades to transparent behind the top-bar cards (see design.md).
  dlf_emblem_amber.png      the Hidden King emblem (layer "HK") and
  dlf_emblem_sapphire.png   the Archmother emblem (layer "AM"): each team's default logo,
                            256 px wide, untrimmed so the PSD placement box maps to the logo box.
                            Only a smart object holds the full-size emblem; when the layer is a
                            rasterized pixel layer (HK in the 2026-10-28 PSD, pixel-identical to the
                            earlier smart object), the existing PNG is kept.

The banner is Photoshop's stored composite, so shapes and the crack art stay exactly as drawn. Only
the text layers and the two emblems are cut out: their boxes (plus 4 px) are re-rendered by
psd-tools with those layers hidden. psd-tools draws vector shapes slightly differently from
Photoshop, so it is not used for the rest. Needs psd-tools, Pillow and numpy.

Fully transparent pixels get the colour of the nearest visible pixel (bleed). Panorama filters the
texture with straight alpha, so the PSD's white behind transparency showed as a white outline and
white specks along the torn edge in game (user screenshot 2026-10-20).
"""
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

PSD = Path(sys.argv[1] if len(sys.argv) > 1 else r"G:\NEW HUD 3 ban.psd")
IMAGES = Path(__file__).resolve().parent.parent / "panorama" / "images" / "dlf"
TOP = 504
HEIGHT = 100
PAD = 4
EMBLEMS = {"HK": "dlf_emblem_amber.png", "AM": "dlf_emblem_sapphire.png"}
EMBLEM_WIDTH = 256


def bleed(rgba):
    """Copy of an RGBA array whose fully transparent pixels take the mean RGB of their visible (or
    already filled) 4-neighbours, grown outwards until every pixel is filled. Alpha is unchanged."""
    out = rgba.copy()
    rgb = out[..., :3].astype(np.float64)
    known = out[..., 3] > 0
    if not known.any():
        return out
    while not known.all():
        total = np.zeros_like(rgb)
        count = np.zeros(known.shape)
        for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
            shifted_known = np.roll(known, step, axis)
            shifted_rgb = np.roll(rgb, step, axis)
            # np.roll wraps around; the wrapped row or column is not a neighbour.
            edge = [slice(None), slice(None)]
            edge[axis] = 0 if step == 1 else -1
            shifted_known[tuple(edge)] = False
            total += shifted_rgb * shifted_known[..., None]
            count += shifted_known
        grow = ~known & (count > 0)
        rgb[grow] = total[grow] / count[grow][:, None]
        known = known | grow
    out[..., :3] = np.rint(rgb).clip(0, 255).astype(np.uint8)
    return out


def main():
    psd = PSDImage.open(PSD)
    if psd.size != (1920, 1080):
        raise SystemExit(f"unexpected PSD size {psd.size}")
    stored = np.asarray(psd.composite().convert("RGBA")).copy()
    if stored.shape != (1080, 1920, 4):
        raise SystemExit("the PSD has no stored composite (save it with Maximize Compatibility)")

    layers = {layer.name: layer for layer in psd.descendants()}
    missing = [name for name in EMBLEMS if name not in layers]
    if missing:
        raise SystemExit(f"missing emblem layers: {missing}")
    cut = [layer for layer in psd.descendants() if layer.kind == "type"] + [layers[name] for name in EMBLEMS]
    for layer in cut:
        layer.visible = False
    clean = np.asarray(psd.composite(force=True).convert("RGBA"))
    for layer in cut:
        x0, y0, x1, y1 = layer.bbox
        x0, y0, x1, y1 = max(0, x0 - PAD), max(0, y0 - PAD), min(1920, x1 + PAD), min(1080, y1 + PAD)
        stored[y0:y1, x0:x1] = clean[y0:y1, x0:x1]

    banner_path = IMAGES / "dlf_banner.png"
    Image.fromarray(bleed(stored[TOP:TOP + HEIGHT])).save(banner_path)
    print(f"banner 1920x{HEIGHT} -> {banner_path}")

    for name, file in EMBLEMS.items():
        layer = layers[name]
        if layer.kind != "smartobject":
            print(f"{name} is a {layer.kind} layer, not a smart object: kept {IMAGES / file}")
            continue
        emblem = Image.open(io.BytesIO(layer.smart_object.data)).convert("RGBA")
        height = round(emblem.height * EMBLEM_WIDTH / emblem.width)
        emblem = np.asarray(emblem.resize((EMBLEM_WIDTH, height), Image.LANCZOS))
        Image.fromarray(bleed(emblem)).save(IMAGES / file)
        box = [round(v) for v in layer.smart_object.transform_box]
        print(f"{name} {EMBLEM_WIDTH}x{height} -> {IMAGES / file}; PSD box x {box[0]}..{box[2]}, y {box[1] - TOP}..{box[5] - TOP}")


if __name__ == "__main__":
    main()
