"""Writes an organisation variant's built-in art (observer_hud/orgs/<org>/org.json "art") as PNG + .vtex
under observer_hud/orgs/<org>/panorama/images/observer_hud/, where the -Org build copies it into pak10.

Each entry: {"source": "source/logo.psd", "out": "org_logo", "height": 256}. The source (PSD composite or
any image Pillow reads) is cut to its visible pixels and scaled to `height` (aspect kept). Panorama filters
textures with straight alpha, so transparent pixels take the colour of the nearest visible pixel
(dlf/ENGINE.md, Fonts and images: a white matte drew a white outline when scaled).
Usage: py observer_hud/scripts/make-org-art.py <org>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

MODULE = Path(__file__).resolve().parent.parent
VTEX_TEMPLATE = MODULE / "panorama" / "images" / "observer_hud" / "buy_frame2_l.vtex"


def bleed(rgba):
    """RGBA array copy whose fully transparent pixels take the mean RGB of their visible (or already
    filled) 4-neighbours, grown outwards until every pixel is filled. Alpha is unchanged."""
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


def load(path):
    if path.suffix.lower() == ".psd":
        from psd_tools import PSDImage
        return PSDImage.open(path).composite().convert("RGBA")
    return Image.open(path).convert("RGBA")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: make-org-art.py <org>")
    org_dir = MODULE / "orgs" / sys.argv[1]
    config = json.loads((org_dir / "org.json").read_text(encoding="utf-8"))
    out_dir = org_dir / "panorama" / "images" / "observer_hud"
    out_dir.mkdir(parents=True, exist_ok=True)
    template = VTEX_TEMPLATE.read_text(encoding="utf-8")
    old = "panorama/images/observer_hud/buy_frame2_l.png"
    if template.count(old) != 1:
        raise SystemExit(f"{VTEX_TEMPLATE.name} no longer names {old}")
    for entry in config.get("art", []):
        source = org_dir / entry["source"]
        if not source.is_file():
            raise SystemExit(f"art source missing: {source} (see {org_dir / 'README.md'})")
        image = load(source)
        box = image.getchannel("A").getbbox()
        if not box:
            raise SystemExit(f"{source.name} has no visible pixels")
        image = image.crop(box)
        height = int(entry["height"])
        width = max(1, round(image.width * height / image.height))
        image = image.resize((width, height), Image.LANCZOS)
        image = Image.fromarray(bleed(np.asarray(image)), "RGBA")
        name = entry["out"]
        image.save(out_dir / f"{name}.png", optimize=True)
        (out_dir / f"{name}.vtex").write_text(template.replace(old, f"panorama/images/observer_hud/{name}.png"), encoding="utf-8")
        print(f"{name}.png {width}x{height} (aspect {width / height:.4f}) from {source.name}")


if __name__ == "__main__":
    main()
