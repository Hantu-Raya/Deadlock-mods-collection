"""Writes dlf_banner_2ban.png: the DLF banner with the inner ban box of each team painted out.

The banner art (dlf_banner.png, from the league PSD) has three red ban boxes per team. With two bans
per team (state.banCount 2, the ESC menu's BANS switch) the box next to the centre arc is not used, so
#DLFBanner swaps to this copy (dlf_banner.css, .DLFTwoBans). The box sits on the band's semi-transparent
black (alpha about 212), so it cannot be covered by an overlay: the box's rows are copied from a plain
stretch of band in the same rows (left: x 600..647, right: x 1290..1337) with a 3 px cross-fade at
each edge. The coloured underline (row 39) and everything outside the box rows stay as they are.

Run after export-banner-art.py whenever dlf_banner.png changes:
    py dlf/scripts/make-two-ban-banner.py [--preview out.png]
Needs Pillow and numpy.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "panorama/images/dlf/dlf_banner.png"
OUT = ROOT / "panorama/images/dlf/dlf_banner_2ban.png"

ROWS = (7, 39)  # box rows 8..37 plus one row each side; row 39 is the underline (kept)
# (box x0, box x1 inclusive, donor x0): the inner box of each team and a plain band stretch.
BOXES = [(785, 826, 600), (1094, 1135, 1290)]
PAD = 2  # columns painted beyond the box on each side
FADE = 3  # cross-fade width at each edge


def main():
    art = np.array(Image.open(SRC).convert("RGBA")).astype(np.float64)
    out = art.copy()
    y0, y1 = ROWS
    for box0, box1, donor0 in BOXES:
        x0, x1 = box0 - PAD, box1 + PAD
        width = x1 - x0 + 1
        donor = art[y0:y1, donor0:donor0 + width]
        target = art[y0:y1, x0:x1 + 1]
        weight = np.ones(width)
        for i in range(FADE):
            # The outermost PAD columns sit on band already: fade from the original into the donor.
            weight[i] = weight[-1 - i] = (i + 1) / (FADE + 1)
        weight = weight[None, :, None]
        out[y0:y1, x0:x1 + 1] = donor * weight + target * (1 - weight)
        # Inside the box itself every pixel is donor (the fade only touches the band columns).
        out[y0:y1, box0:box1 + 1] = art[y0:y1, donor0 + PAD:donor0 + PAD + (box1 - box0 + 1)]
    Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), "RGBA").save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT.parent)}")
    if "--preview" in sys.argv:
        path = Path(sys.argv[sys.argv.index("--preview") + 1])
        world = Image.new("RGBA", (1920, 100), (96, 120, 140, 255))  # a mid-grey-blue "game world"
        rows = []
        for img in (Image.open(SRC).convert("RGBA"), Image.open(OUT).convert("RGBA")):
            rows.append(Image.alpha_composite(world, img).crop((560, 0, 1360, 60)))
        sheet = Image.new("RGB", (800, 124), (0, 0, 0))
        sheet.paste(rows[0].convert("RGB"), (0, 0))
        sheet.paste(rows[1].convert("RGB"), (0, 64))
        sheet.save(path, quality=60)
        print(f"preview {path}")


if __name__ == "__main__":
    main()
