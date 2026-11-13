"""Regenerate old_main_menu/panorama styles from the Jul 2025 stock files (build 5712).

usage: py old_main_menu/tools/derive_from_5712.py <gametracking 5712 panorama dir> <gametracking current panorama dir>

The Jul 2025 sources come from SteamTracking/GameTracking-Deadlock commit 1aac1d6 (ClientVersion 5712,
2025-07-31). Every change made to them for the current client is a named, asserted patch below, so the
deviation list stays reviewable and the script fails loudly when an upstream file does not match.
Layouts are hand-written (see RESEARCH.md); only the large stylesheets are derived here.
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "panorama" / "styles"


def load(path):
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    if lines and lines[0].startswith("/* Prettified by Source 2 Viewer"):
        lines = lines[2:] if len(lines) > 1 and lines[1] == "" else lines[1:]
    return "\n".join(lines).replace("\r\n", "\n")


def patch(text, name, old, new, count=1):
    found = text.count(old)
    if found != count:
        raise SystemExit(f"patch '{name}': expected {count} match(es), found {found}")
    return text.replace(old, new)


def header(source):
    return (
        f"/* Deadlock Jul 2025 (build 5712) {source}, adapted for the current client by\n"
        "   old_main_menu/tools/derive_from_5712.py. Do not hand-edit the patched sections without updating it. */\n\n"
    )


def dashboard(old_dir, new_dir):
    css = load(old_dir / "styles" / "dashboard.css")
    cur = load(new_dir / "styles" / "dashboard.css")

    # Current client: a party hideout hides the dashboard unless the home page is open.
    css = patch(css, "hideout",
        "#LeftStripe,.connectedToGame.isShowingRosterConfirmPage #LeftStripe",
        ".connectedToGame.connectedToHideout:not(.IsShowingHomePage) #DashboardContents\n{\n\tvisibility: collapse;\n}\n\n"
        "#LeftStripe,.connectedToGame.isShowingRosterConfirmPage #LeftStripe")
    # Lane training became the tutorial.
    css = patch(css, "tutorial scene",
        ".connectedToLaneTraining #HeroScenePanel,",
        ".connectedToLaneTraining #HeroScenePanel,.connectedToTutorial #HeroScenePanel,")
    css = patch(css, "tutorial newplayer",
        ",.connectedToLaneTraining #NewPlayerContainer\n",
        ",.connectedToLaneTraining #NewPlayerContainer,.connectedToTutorial #NewPlayerContainer\n")
    # Pages (play, heroes) must open while the client sits in a party hideout, which counts as connected.
    css = patch(css, "pages in hideout",
        ".connectedToGame #DashboardPages\n{\n\tvisibility: collapse;\n}",
        ".connectedToGame:not(.connectedToHideout) #DashboardPages\n{\n\tvisibility: collapse;\n}")
    # The intro movie class is now set and cleared by old_main_menu.js (the engine no longer does).
    # Current Leave/Abandon button rules (the button is part of the current dashboard contract).
    start = cur.index("#lobbyleave\n{")
    end = cur.index("\n\n", cur.index(".connectedToHeroTesting #lobbyleave #label_leave_testing"))
    end = cur.index("}", end) + 1
    lobby = cur[start:end]
    css = patch(css, "lobbyleave rules", "#reconnect\n{\n\tvisibility: collapse;\n}",
        lobby + "\n\n#reconnect\n{\n\tvisibility: collapse;\n}")
    # Seasonal tooltip id renamed; keep the current glyph precache list.
    css = patch(css, "seasonal tooltip id", "SeasonalAchievement2024Tooltip", "SeasonalAchievementTooltip", count=3)
    css = patch(css, "glyph precache",
        '\tbackground-image: url("s2r://panorama/images/glyphs/mouse5.vsvg");\n}',
        '\tbackground-image: url("s2r://panorama/images/glyphs/mouse5.vsvg");\n'
        '\tbackground-image: url("s2r://panorama/images/glyphs/keyboard_arrow_up.vsvg");\n'
        '\tbackground-image: url("s2r://panorama/images/glyphs/keyboard_arrow_down.vsvg");\n'
        '\tbackground-image: url("s2r://panorama/images/glyphs/keyboard_arrow_left.vsvg");\n'
        '\tbackground-image: url("s2r://panorama/images/glyphs/keyboard_arrow_right.vsvg");\n}')
    return header("panorama/styles/dashboard.css") + css


def play_menu(old_dir):
    menu = load(old_dir / "styles" / "citadel_db_play_menu.css")
    # The Jul 2025 dashboard held <CitadelPlayMenu id="PlayMenu"/>, an engine panel that loaded
    # citadel_db_play_menu.xml. That class is gone; its content is inlined into dashboard.xml as
    # Panel#PlayMenu, so the type selector becomes the id.
    menu = patch(menu, "inlined play menu", "CitadelPlayMenu\n{", "#PlayMenu\n{")
    return header("panorama/styles/citadel_db_play_menu.css") + menu


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    old_dir, new_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "dashboard.css": dashboard(old_dir, new_dir),
        "citadel_db_play_menu.css": play_menu(old_dir),
        "citadel_db_page_home.css": header("panorama/styles/citadel_db_page_home.css") + load(old_dir / "styles" / "citadel_db_page_home.css"),
    }
    for name, text in files.items():
        (OUT / name).write_bytes(text.encode("utf-8"))
        print(f"wrote {OUT / name} ({len(text)} chars)")


if __name__ == "__main__":
    main()
