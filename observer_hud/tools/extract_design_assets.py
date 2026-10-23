"""Rebuild observer_hud/designs/assets from the installed Deadlock game.

Extracts the top-bar assets chosen in decisions/asset-triage.json from pak01,
copies the curated set and the mock roster, builds the gameplay backdrop and
writes assets/generated.css: game fonts and SVG masks as data URIs, because
Chrome blocks file:// fonts and masks across files.

    py observer_hud/tools/extract_design_assets.py [--game <citadel dir>]

The assets are Valve's. They are for local design previews only; the mod
itself references the same files in game by their s2r:// paths.
"""
import argparse
import base64
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageFilter

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "observer_hud" / "designs" / "assets"
TMP = REPO / ".tmp" / "oh_extract"
VIEWER_CANDIDATES = [
    REPO / ".tmp" / "source2viewer-cli" / "Source2Viewer-CLI.exe",
    REPO / ".tmp" / "vrf-cli-19.2" / "Source2Viewer-CLI.exe",
]
FILTER = [
    "panorama/images/hud/top_bar/",
    "panorama/images/hud/objectives/",
    "panorama/images/hud/core/",
    "panorama/images/hud/healthbar/",
    "panorama/images/hud/kill_feed/",
    "panorama/images/hud/teamscore_souls_backer_l.vsvg_c",
    "panorama/images/hud/teamscore_souls_backer_r.vsvg_c",
    "panorama/images/hud/corner_cap.vsvg_c",
    "panorama/images/icons/deadlock_logo.vsvg_c",
    "panorama/images/icons/crown.vsvg_c",
    "panorama/images/icons/properties/death.vsvg_c",
    "panorama/images/heroes/",
    # Stock top-bar pieces for design 11 (citadel_hud_top_bar.css references these).
    "panorama/images/masks/dust_01_psd.vtex_c",
    "panorama/images/hero_badges/hero_image_mask_psd.vtex_c",
    "panorama/images/hud/icons/skull.vsvg_c",
    "panorama/images/hud/spec_icon_png.vtex_c",
    # Objective timers (round 5): bridge powerup, rejuvenator, rift (koth), urn (soul jar).
    "panorama/images/hud/modifiers/icon_powerup.vsvg_c",
    "panorama/images/hud/modifiers/icon_rejuvenator.vsvg_c",
    "panorama/images/hud/icons/rejuvenator.vsvg_c",
    "panorama/images/minimap/minimap_icon_koth.vsvg_c",
    "panorama/images/minimap/minimap_icon_koth_png.vtex_c",
    "panorama/images/minimap/soul_jar_marker_psd.vtex_c",
    # Stock settings-page pieces the built editor uses (oh_editor.css), for design 18.
    "panorama/images/buttons/switch_background.vsvg_c",
    "panorama/images/buttons/switch_handle_off.vsvg_c",
    "panorama/images/buttons/switch_handle_on.vsvg_c",
    "panorama/images/buttons/button_nav_mask_threshold_psd.vtex_c",
    "panorama/images/buttons/temp_background_environment_png.vtex_c",
    "panorama/images/textures/paper_tile_1k_psd.vtex_c",
    # Stock objective health (hud_objective_health.css), for design 19.
    "panorama/images/hud/world_space/hero_healthbar_fill_center_darker_psd.vtex_c",
    "panorama/images/npcs/tier_2_boss_psd.vtex_c",
]
KEEP = [
    "hud/top_bar/topbar_panel_backer.svg",
    "hud/top_bar/topbar_panel_backer_team1.svg",
    "hud/top_bar/topbar_panel_backer_team2.svg",
    "hud/top_bar/topbar_player_left_mask.svg",
    "hud/top_bar/topbar_player_right_mask.svg",
    "hud/top_bar/topbar_player_left_portrait_mask.svg",
    "hud/top_bar/topbar_player_right_portrait_mask.svg",
    "hud/top_bar/icon_ultimate.svg",
    "hud/top_bar/icon_ultimate_enemy.svg",
    "hud/top_bar/icon_ultimate_off.svg",
    "hud/top_bar/team_soul_backer1.svg",
    "hud/top_bar/team_soul_backer2.svg",
    "hud/top_bar/team_rejuv_1_png.png",
    "hud/top_bar/team_rejuv_2_png.png",
    "hud/top_bar/team_rejuv_3_png.png",
    "hud/top_bar/team_rejuv_4_png.png",
    "hud/modifiers/icon_powerup.svg",
    "hud/modifiers/icon_rejuvenator.svg",
    "hud/icons/rejuvenator.svg",
    "minimap/minimap_icon_koth.svg",
    "minimap/minimap_icon_koth_png.png",
    "minimap/soul_jar_marker_psd.png",
    "hud/top_bar/chat_texture_png.png",
    "hud/top_bar/koth_backer_png.png",
    "hud/core/icon_team1_psd.png",
    "hud/core/icon_team2_psd.png",
    "hud/core/team1_icon.svg",
    "hud/core/team2_icon.svg",
    "hud/core/team1_icon_png.png",
    "hud/core/team2_icon_png.png",
    "hud/core/logo_team1.svg",
    "hud/core/logo_team2.svg",
    "hud/core/icon_soul.svg",
    "hud/healthbar/healthbar_fill_texture_team1_png.png",
    "hud/healthbar/healthbar_fill_texture_team2_png.png",
    "hud/healthbar/healthbar_fill_texture_png.png",
    "hud/kill_feed/feed_killer_bg.svg",
    "hud/teamscore_souls_backer_l.svg",
    "hud/teamscore_souls_backer_r.svg",
    "hud/corner_cap.svg",
    "icons/deadlock_logo.svg",
    "icons/crown.svg",
    "icons/properties/death.svg",
    "hud/top_bar/coin_background.svg",
    "hud/top_bar/coin_background_selected.svg",
    "hud/top_bar/coin_inner_border.svg",
    "hud/top_bar/icon_ultimate_mini.svg",
    "hud/healthbar/healthbar_backer_vert_border.svg",
    "hud/healthbar/healthbar_backer_vert_mask.svg",
    "masks/dust_01_psd.png",
    "hero_badges/hero_image_mask_psd.png",
    "hud/icons/skull.svg",
    "buttons/switch_background.svg",
    "buttons/switch_handle_off.svg",
    "buttons/switch_handle_on.svg",
    "hud/world_space/hero_healthbar_fill_center_darker_psd.png",
    "npcs/tier_2_boss_psd.png",
]
# Downscaled: the stock files are 2.7-3.2k px wide.
LARGE = {
    "hud/objectives/team1_patron_logo_psd.png": 900,
    "hud/objectives/team2_patron_logo_psd.png": 900,
    "hud/objectives/team1_patron_backer_png.png": 1600,
    "buttons/temp_background_environment_png.png": 1280,
    "textures/paper_tile_1k_psd.png": 512,
}
ROSTER = ["haze", "inferno", "lash", "kelvin", "wraith", "bull",
          "gigawatt", "digger", "spectre", "hornet", "synth", "sumo",
          # ban picker extras for design 11
          "astro", "bebop", "viscous", "yamato", "mirage", "shiv"]
BACKDROP_SOURCE = REPO / ".scratch" / "qollock_sb" / "shot.jpg"
# Families as Pango names them; Radiance maps to Retail Demo for English (stock fonts.conf).
FONTS = [
    ("Retail Demo", 400, "retaildemo-regular.otf"),
    ("Retail Demo", 600, "retaildemo-semibold.otf"),
    ("Retail Demo", 700, "retaildemo-bold.otf"),
    ("Reaver", 400, "reaver-regular.otf"),
    ("Reaver", 600, "reaver-semibold.otf"),
    ("Reaver", 700, "reaver-bold.otf"),
    ("VALVE Oracle", 500, "valveoracle-medium.ttf"),
    ("VALVE Oracle", 600, "valveoracle-semibold.ttf"),
    ("Valve Pulp", 700, "valvepulp-bold.ttf"),
]
MASKS = [
    "hud/top_bar/topbar_player_left_mask.svg",
    "hud/top_bar/topbar_player_right_mask.svg",
    "hud/top_bar/topbar_player_left_portrait_mask.svg",
    "hud/top_bar/topbar_player_right_portrait_mask.svg",
    "hud/top_bar/topbar_panel_backer.svg",
    "hud/top_bar/team_soul_backer1.svg",
    "hud/top_bar/team_soul_backer2.svg",
    "hud/teamscore_souls_backer_l.svg",
    "hud/teamscore_souls_backer_r.svg",
    "hud/core/team1_icon.svg",
    "hud/core/team2_icon.svg",
    "hud/core/icon_soul.svg",
    "hud/top_bar/icon_ultimate.svg",
    "icons/properties/death.svg",
    "icons/deadlock_logo.svg",
    "icons/crown.svg",
    "hud/healthbar/healthbar_backer_vert_mask.svg",
    "hud/healthbar/healthbar_backer_vert_border.svg",
    "hud/top_bar/coin_background_selected.svg",
    "hud/icons/skull.svg",
    "masks/dust_01_psd.png",
    "hero_badges/hero_image_mask_psd.png",
    "hud/modifiers/icon_powerup.svg",
    "hud/modifiers/icon_rejuvenator.svg",
    "hud/icons/rejuvenator.svg",
    # Full-colour images, not masks: the stock kill feed shows these for rift and urn events.
    "minimap/minimap_icon_koth_png.png",
    "minimap/soul_jar_marker_psd.png",
    "buttons/button_nav_mask_threshold_psd.png",
    "hud/objectives/healthbar_mask_png.png",
]
# Panorama opacity-mask-threshold (value, softness) baked into the mask: luminance -> alpha.
THRESHOLD = {"buttons/button_nav_mask_threshold_psd.png": (0.02, 0.01)}


def flat(rel: str) -> str:
    return rel.replace("/", "__")


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", default="G:/SteamLibrary/steamapps/common/Deadlock/game/citadel")
    ap.add_argument("--skip-extract", action="store_true")
    args = ap.parse_args()
    game = Path(args.game)
    pak = game / "pak01_dir.vpk"
    viewer = next((p for p in VIEWER_CANDIDATES if p.exists()), None)
    if not pak.exists():
        sys.exit(f"missing {pak}")
    if not args.skip_extract:
        if viewer is None:
            sys.exit("Source2Viewer-CLI.exe not found under .tmp/")
        # Some unrelated hero files carry a RED2 block VRF cannot parse; their errors are noise.
        subprocess.run([str(viewer), "-i", str(pak), "-o", str(TMP), "-d", "--threads", "8",
                        "-f", ",".join(FILTER)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    images = TMP / "panorama" / "images"
    game_out = OUT / "game"
    heroes_out = game_out / "heroes"
    heroes_out.mkdir(parents=True, exist_ok=True)

    missing = []
    for rel in KEEP:
        src = images / rel
        if not src.exists():
            missing.append(rel)
            continue
        shutil.copy2(src, game_out / flat(rel))
    for rel, width in LARGE.items():
        src = images / rel
        if not src.exists():
            missing.append(rel)
            continue
        im = Image.open(src)
        im.resize((width, round(im.height * width / im.width)), Image.LANCZOS).save(game_out / flat(rel))
    for hero in ROSTER:
        for suffix in ("_card_psd.png", "_mm_psd.png", "_sm_psd.png"):
            src = images / "heroes" / (hero + suffix)
            if src.exists():
                shutil.copy2(src, heroes_out / src.name)
            elif suffix != "_sm_psd.png":  # some heroes (hornet) ship no _sm; designs fall back to _card
                missing.append(f"heroes/{hero}{suffix}")
    if missing:
        sys.exit("missing extracted assets: " + ", ".join(missing))

    if BACKDROP_SOURCE.exists():
        # A real match frame; its top 250 rows (stock top bar, FPS counter) are blurred away.
        bg = Image.open(BACKDROP_SOURCE).convert("RGB").resize((1920, 1080), Image.LANCZOS)
        band = bg.crop((0, 0, 1920, 250)).filter(ImageFilter.GaussianBlur(30))
        mask = Image.linear_gradient("L").resize((1920, 250)).point(
            lambda v: 255 if v < 205 else int(255 * (1 - (v - 205) / 50)))
        bg.paste(band, (0, 0), mask)
        bg.save(game_out / "scene_backdrop.jpg", quality=86)
    else:
        print(f"warning: {BACKDROP_SOURCE} missing; keeping any existing backdrop")

    css = ["/* generated by observer_hud/tools/extract_design_assets.py; do not edit */"]
    for family, weight, name in FONTS:
        path = game / "panorama" / "fonts" / name
        if not path.exists():
            sys.exit(f"missing font {path}")
        fmt, mime = ("opentype", "font/otf") if name.endswith(".otf") else ("truetype", "font/ttf")
        css.append(f"@font-face {{ font-family: '{family}'; font-weight: {weight}; "
                   f"src: url('{data_uri(path, mime)}') format('{fmt}'); }}")
    css.append(":root {")
    for rel in MASKS:
        var = "--m-" + Path(rel).stem.replace("_", "-")
        mime = "image/svg+xml" if rel.endswith(".svg") else "image/png"
        src = images / rel
        if rel in THRESHOLD:
            value, soft = THRESHOLD[rel]
            lo, hi = 255 * (value - soft), 255 * (value + soft)
            alpha = Image.open(src).convert("L").point(lambda v: 0 if v <= lo else 255 if v >= hi else int(255 * (v - lo) / (hi - lo)))
            out = Image.new("RGBA", alpha.size, (255, 255, 255, 0))
            out.putalpha(alpha)
            src = TMP / (flat(rel) + ".threshold.png")
            out.save(src)
        css.append(f"  {var}: url('{data_uri(src, mime)}');")
    css.append("}")
    (OUT / "generated.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    print(f"ok: {len(KEEP) + len(LARGE)} hud assets, {len(ROSTER)} heroes, {len(FONTS)} fonts, {len(MASKS)} masks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
