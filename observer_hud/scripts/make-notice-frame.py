"""Writes the purchase notice frame pieces (oh_debuffs.css .OHBuyEdge*): white, anti-aliased in the
texture, washed per slot/tier in CSS.

Panorama draws a transformed panel's own edges without anti-aliasing (live 2026-10-23: the wobbling
notice frame stair-stepped at 1600x900). An image is filtered, so the frame is drawn into images whose
outer PAD texels are transparent: the panel's hard edge falls in empty texels and the visible edge is
the texture's smooth one. One notice quad is 40 px high: PAD, a 36 px frame (outer corner radius 4),
PAD. Three pieces (left cap, stretched middle, right cap) keep the border width at any notice width.
The caps are transparent on both outer columns, so a wrapping sampler adds no seam; the middle is the
same in every column (wrapping is harmless) and runs 3 px under each cap (CSS), so a cap's transparent
inner column shows the middle's band.
Usage: py observer_hud/scripts/make-notice-frame.py   (rewrites the PNGs and .vtex beside them)
"""
from pathlib import Path

from PIL import Image

HEIGHT = 40
PAD = 2
RADIUS = 4
CAP_W = 9  # PAD + RADIUS + 2 band columns + 1 transparent column
MID_W = 4
SS = 16  # supersampling per axis
OUT = Path(__file__).resolve().parent.parent / "panorama" / "images" / "observer_hud"
VTEX = (Path(__file__).resolve().parents[2] / "dlf" / "panorama" / "images" / "dlf" / "dlf_emblem_amber.vtex")


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x < x1 and y0 <= y < y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def coverage(px, py, width, band):
    """Fraction of texel (px, py) covered by the frame band of a notice `width` px wide."""
    hits = 0
    for sy in range(SS):
        for sx in range(SS):
            x = px + (sx + 0.5) / SS
            y = py + (sy + 0.5) / SS
            outer = inside_round_rect(x, y, PAD, PAD, width - PAD, HEIGHT - PAD, RADIUS)
            inner = inside_round_rect(x, y, PAD + band, PAD + band, width - PAD - band, HEIGHT - PAD - band,
                                      max(RADIUS - band, 0))
            hits += outer and not inner
    return hits / (SS * SS)


def piece(columns, x_offset, width, band):
    image = Image.new("RGBA", (columns, HEIGHT), (255, 255, 255, 0))
    for py in range(HEIGHT):
        for px in range(columns):
            alpha = round(255 * coverage(x_offset + px, py, width, band))
            image.putpixel((px, py), (255, 255, 255, alpha))
    return image


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    template = VTEX.read_text(encoding="utf-8")
    wide = 200  # any notice wider than both caps
    for band in (2, 3):
        left = piece(CAP_W, 0, wide, band)
        for py in range(HEIGHT):  # transparent inner column (the middle shows under it)
            left.putpixel((CAP_W - 1, py), (255, 255, 255, 0))
        middle = piece(MID_W, wide // 2, wide, band)
        right = left.transpose(Image.FLIP_LEFT_RIGHT)
        for name, image in (("l", left), ("m", middle), ("r", right)):
            stem = f"buy_frame{band}_{name}"
            image.save(OUT / f"{stem}.png", optimize=True)
            vtex = template.replace("panorama/images/dlf/dlf_emblem_amber.png", f"panorama/images/observer_hud/{stem}.png")
            if vtex == template:
                raise SystemExit("vtex template path not found")
            (OUT / f"{stem}.vtex").write_text(vtex, encoding="utf-8", newline="\n")
            print(stem, image.size)


if __name__ == "__main__":
    main()
