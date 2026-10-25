"""Writes the post-game board's torn-paper opacity masks (pg_board.css opacity-mask), one per panel size.

Panorama's opacity-mask reads the mask's alpha (live 2026-10-26): the stock masks/rough_edge_0x_png carry
their wobbly outline only in RGB with alpha 255 everywhere (decoded with Source 2 Viewer), so they masked
nothing and every "torn" surface was a plain dark rectangle (user 2026-10-26: "I can still see the dark
edges and does not look like a torn paper"). These masks are drawn at each panel's own size, so nothing
stretches: every edge is a deckled tear (several octaves of noise plus the odd rounded bite, never deeper
than inset + 2.4 amplitudes), with a short fibrous fringe outside it, fully transparent beyond. The mask is
in alpha (and grey). No light rim over the tear: the user disliked the cream border (2026-10-26).
Usage: py observer_hud/scripts/make-torn-masks.py   (rewrites the PNGs and .vtex beside them)
"""
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "panorama" / "images" / "observer_hud"
VTEX_TEMPLATE = OUT / "buy_frame2_l.vtex"
SS = 4  # supersampling per axis

# name: (width, height, inset px, tear amplitude px, fringe px, seed). Sizes are the panels' boxes in
# pg_board.css (the validator compares).
MASKS = {
    "torn_head_l": (702, 96, 7, 5.0, 3, 11),
    "torn_head_r": (702, 96, 7, 5.0, 3, 12),
    "torn_graph": (1600, 112, 6, 4.5, 3, 31),
    "torn_track": (164, 18, 2.5, 1.6, 1.5, 41),
    "torn_award": (108, 30, 2.5, 1.8, 1.5, 51),
}


def edge(length, inset, amp, rng):
    """Inset of one edge at each supersampled position along it (px)."""
    n = length * SS
    x = np.arange(n) / SS
    out = np.full(n, float(inset))
    # Octaves of smooth value noise: long wobble, mid tears, short jags.
    for wavelength, weight in ((48, 1.0), (17, 0.6), (6, 0.35), (2.2, 0.2)):
        knots = rng.uniform(-1, 1, int(length / wavelength) + 3)
        t = x / wavelength
        i = np.floor(t).astype(int)
        f = t - i
        f = f * f * (3 - 2 * f)
        out += amp * weight * (knots[i] * (1 - f) + knots[i + 1] * f)
    # The odd deeper bite where the tear changed direction.
    for _ in range(max(1, int(length / 140))):
        if rng.random() < 0.7:
            centre = rng.uniform(0.05, 0.95) * length
            width = rng.uniform(6, 18)
            depth = amp * rng.uniform(1.0, 2.0)
            out += depth * 0.5 * (1 + np.cos(np.pi * np.clip(np.abs(x - centre) / width, 0, 1)))
    # Never deeper than inset + 2.4 amplitudes, so a tear does not reach the content.
    return np.clip(out, 0.6, inset + 2.4 * amp)


def mask(width, height, inset, amp, fringe, seed):
    rng = np.random.default_rng(seed)
    w, h = width * SS, height * SS
    top, bottom = edge(width, inset, amp, rng), edge(width, inset, amp, rng)
    left, right = edge(height, inset, amp, rng), edge(height, inset, amp, rng)
    ys = (np.arange(h)[:, None] + 0.5) / SS
    xs = (np.arange(w)[None, :] + 0.5) / SS
    # How far outside the tear a point is (<= 0 inside): the largest overshoot past any edge.
    out = np.maximum.reduce([
        left[:, None] - xs,
        xs - (width - right[:, None]),
        top[None, :] - ys,
        ys - (height - bottom[None, :]),
    ])
    inside = (out <= 0).astype(np.float32)
    # Fibres: sparse short strands just outside the tear, fading out over the fringe.
    fibre = rng.random((h, w)).astype(np.float32)
    fibre = np.where(fibre > 0.55, (fibre - 0.55) / 0.45, 0)
    fade = np.clip(1 - out / fringe, 0, 1) * (out > 0)
    value = np.maximum(inside, fibre * fade * 0.6)
    def down(a):
        return a.reshape(height, SS, width, SS).mean(axis=(1, 3))
    grey = np.round(down(value) * 255).astype(np.uint8)
    # Grey in every channel: live, a mask with alpha 255 everywhere masked nothing (2026-10-26).
    mask_img = Image.fromarray(np.dstack([grey, grey, grey, grey]), "RGBA")
    return mask_img


def main():
    template = VTEX_TEMPLATE.read_text(encoding="utf-8")
    for name, spec in MASKS.items():
        mask(*spec).save(OUT / f"{name}.png", optimize=True)
        vtex = template.replace("panorama/images/observer_hud/buy_frame2_l.png", f"panorama/images/observer_hud/{name}.png")
        (OUT / f"{name}.vtex").write_text(vtex, encoding="utf-8", newline="\n")
        print(f"{name}: {spec[0]}x{spec[1]}")


if __name__ == "__main__":
    main()
