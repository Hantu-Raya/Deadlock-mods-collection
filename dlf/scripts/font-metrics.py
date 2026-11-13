"""Prints FIT_ADVANCES for dlf_state.js: each banner font's glyph advances (thousandths of an em)
for FIT_CHARS, read from the font file's hmtx table. Rerun after changing a banner font.

  py dlf/scripts/font-metrics.py [Deadlock citadel/panorama/fonts dir]

Needs fontTools. GOFIRE and Operation Napalm come from dlf/fonts; Jost (bold italic, the JOST
banner font) from the game's font folder.
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

FIT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 #-_.'!?&/()"
FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"
GAME_FONTS = Path(sys.argv[1] if len(sys.argv) > 1 else r"G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\panorama\fonts")
FILES = {
    "gofire": FONTS_DIR / "gofire.otf",
    "napalm": FONTS_DIR / "operation-napalm-italic.ttf",
    "jost": GAME_FONTS / "jost-bolditalic.ttf",
}

for key, path in FILES.items():
    font = TTFont(path)
    cmap = font.getBestCmap()
    units = font["head"].unitsPerEm
    widths = [round(font["hmtx"][cmap[ord(char)]][0] * 1000 / units) for char in FIT_CHARS]
    print(f'    {key}: "{",".join(map(str, widths))}",')
