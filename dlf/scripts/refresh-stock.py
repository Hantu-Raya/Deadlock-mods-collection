"""Refresh DLF's stock Deadlock base files from SteamTracking/GameTracking-Deadlock.

    py dlf/scripts/refresh-stock.py            # copy upstream base CSS and pin it
    py dlf/scripts/refresh-stock.py --check    # exit 1 when upstream moved past the pin
    py dlf/scripts/refresh-stock.py --accept   # after a manual rebase: pin the overrides too

`styles/base/*.css` are verbatim stock copies that the DLF wrappers @import, so they are
refreshed automatically, and so are the generated tables `panorama/scripts/dlf/dlf_heroes.js`
(ban picker), `panorama/scripts/dlf/dlf_debuff_icons.js` (top-bar debuff icons) and
`panorama/scripts/dlf/dlf_status_css.js` (DEV status log class list), and `MOD_ICONS` in
`panorama/scripts/qollock/ql_recent_purchases_data.js` (recent-purchase item icons by English shop name;
other languages keep their old entries). The layout overrides, objectives_map.css and gameinfo.gi carry DLF edits on top of
stock; for those the script only reports upstream drift. Rebase them by hand (diff the pinned and
current stock file, port the change), then run --accept.
"""
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

REPO = "SteamTracking/GameTracking-Deadlock"
PANORAMA = "game/citadel/pak01_dir/panorama/"
DLF = pathlib.Path(__file__).resolve().parents[1]
PIN = DLF / "stock-pin.json"

# Stock path (repo-relative) -> DLF verbatim copy.
BASE = {
    PANORAMA + f"styles/{name}.css": f"panorama/styles/base/{name}.css"
    for name in (
        "citadel_hud_hero_shop",
        "citadel_hud_top_bar",
        "citadel_hud_top_bar_chat",
        "hud",
        "hud_paused",
        "hud_spectate_bar",
    )
}
# Stock path -> DLF file that carries edits on top of it.
OVERRIDDEN = {
    PANORAMA + "layout/citadel_hud_top_bar.xml": "panorama/layout/citadel_hud_top_bar.xml",
    PANORAMA + "layout/citadel_hud_top_bar_player.xml": "panorama/layout/citadel_hud_top_bar_player.xml",
    PANORAMA + "layout/unit_status_overlay_v2.xml": "panorama/layout/unit_status_overlay_v2.xml",
    PANORAMA + "layout/citadel_status_effect.xml": "panorama/layout/citadel_status_effect.xml",
    PANORAMA + "layout/citadel_hud_data_feed_info.xml": "panorama/layout/citadel_hud_data_feed_info.xml",
    PANORAMA + "layout/hud_escape_menu.xml": "panorama/layout/hud_escape_menu.xml",
    PANORAMA + "layout/hud_paused.xml": "panorama/layout/hud_paused.xml",
    PANORAMA + "styles/objectives_map.css": "panorama/styles/objectives_map.css",
    PANORAMA + "layout/post_game/citadel_db_page_post_game_new.xml": "panorama/layout/post_game/citadel_db_page_post_game_new.xml",
    "game/citadel/gameinfo.gi": "gameinfo/gameinfo.gi",
}
# Hero table for the ban picker: enabled heroes (in-development ones too, e.g. Hero Labs) with an
# English retail name. CitadelHeroImage.SetHeroID takes the m_HeroID numbers.
HERO_SOURCES = (
    "game/citadel/pak01_dir/scripts/heroes.vdata",
    "game/citadel/resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt",
)
HEROES_OUT = "panorama/scripts/dlf/dlf_heroes.js"
NOT_HEROES = {"hero_base", "hero_targetdummy", "hero_genericperson"}
# Debuff icon table: a world-bar status effect's panel id is status_<ability>, and the engine draws
# that ability's m_strAbilityImage. Paths are stored after file://{images}/, grouped by folder.
ICON_SOURCES = ("game/citadel/pak01_dir/scripts/abilities.vdata",)
ICONS_OUT = "panorama/scripts/dlf/dlf_debuff_icons.js"
# Status-log class list: every m_strSmallIconCssClass, which the engine adds as a class to a status
# panel. Panorama cannot list a panel's classes, so the DEV status log tests these by name.
CSS_SOURCES = ("game/citadel/pak01_dir/scripts/abilities.vdata", "game/citadel/pak01_dir/scripts/modifiers.vdata")
CSS_OUT = "panorama/scripts/dlf/dlf_status_css.js"
# Recent-purchase icons: the shop row and the popups only know the item's display name (in the
# client's language), so MOD_ICONS maps item names to their m_strShopIconLarge (m_strAbilityImage
# when there is none). GameTracking carries only the English names; names in other languages and
# names a patch dropped keep their old (QOLLOCK) entries, so a renamed item shows no icon there.
MOD_ICON_SOURCES = ("game/citadel/pak01_dir/scripts/abilities.vdata",
                    "game/citadel/resource/localization/citadel_gc_mod_names/citadel_gc_mod_names_english.txt")
MOD_ICONS_OUT = "panorama/scripts/qollock/ql_recent_purchases_data.js"
MOD_ICONS_BLOCK = re.compile(r"(?:// .*\n)*    const MOD_ICONS = \{\n(.*?)\n    \};\n", re.S)


def hero_table(vdata, names_text):
    names = dict(re.findall(r'"(hero_[a-z0-9_]+):n"\s+"([^"]+)"', names_text))
    heroes = []
    for key, body in zip(*[iter(re.split(r"\n\t(hero_[a-z0-9_]+) = \n", vdata)[1:])] * 2):
        field = lambda name: (re.search(r"\n\t\t" + name + r" = ([^\n]+)", body) or [None, ""])[1].strip()
        if key in NOT_HEROES or key not in names or field("m_bDisabled") != "false":
            continue
        heroes.append((names[key], int(field("m_HeroID")), key))
    heroes.sort()
    if len(heroes) < 30 or len({hero_id for _, hero_id, _ in heroes}) != len(heroes):
        raise SystemExit(f"hero table looks wrong ({len(heroes)} heroes)")
    rows = ",\n".join(f"  [{hero_id}, {json.dumps(name)}]" for name, hero_id, _ in heroes)
    return ("// Generated by dlf/scripts/refresh-stock.py from GameTracking heroes.vdata and English hero names.\n"
            "// [m_HeroID, retail name], sorted by name: the ban picker's hero list. Do not edit.\n"
            f"var DLF_HEROES = [\n{rows}\n];\n")


def icon_table(vdata):
    parts = re.split(r"\n\t([a-z0-9_]+) = \n", vdata)
    groups = {}
    for key, body in zip(parts[1::2], parts[2::2]):
        found = re.search(r'\n\t\tm_strAbilityImage = panorama:"file://\{images\}/([a-z0-9_./-]+)"', body)
        if not found or len(key) > 64:
            continue
        folder, file = found[1].rsplit("/", 1)
        base, ext = file.rsplit(".", 1)
        # "key" when the file is <key>.psd, else "key=<file>" (the .psd extension omitted).
        entry = key if base == key and ext == "psd" else f"{key}={base if ext == 'psd' else file}"
        if " " in entry or "=" in base or "." in base:
            raise SystemExit(f"unexpected ability image {found[1]}")
        groups.setdefault(folder, []).append(entry)
    count = sum(len(entries) for entries in groups.values())
    if count < 500 or "synth_affliction" not in groups.get("hud/abilities/synth", []):
        raise SystemExit(f"debuff icon table looks wrong ({count} abilities)")
    rows = ",\n".join(f"  {json.dumps(folder)}: {json.dumps(' '.join(sorted(entries)))}"
                      for folder, entries in sorted(groups.items()))
    return ("// Generated by dlf/scripts/refresh-stock.py from GameTracking abilities.vdata. Do not edit.\n"
            "// Folder under file://{images}/ -> \"ability ability=file ...\"; a bare ability is <ability>.psd.\n"
            f"var DLF_DEBUFF_ICONS = {{\n{rows}\n}};\n")


def css_table(*vdata):
    names = sorted({name for text in vdata for name in re.findall(r'm_strSmallIconCssClass = "([^"]*)"', text) if name})
    bad = [name for name in names if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name)]
    if bad or len(names) < 50 or "stunned" not in names:
        raise SystemExit(f"status class list looks wrong ({len(names)} classes, bad: {bad[:5]})")
    return ("// Generated by dlf/scripts/refresh-stock.py from GameTracking abilities.vdata and modifiers.vdata.\n"
            "// Every m_strSmallIconCssClass: the DEV status log tests a status panel for each. Do not edit.\n"
            f"var DLF_STATUS_CSS = {json.dumps(' '.join(names))};\n")


def mod_icon_table(vdata, *names_texts):
    images = {}
    for key, body in zip(*[iter(re.split(r"\n\t([a-z0-9_]+) = \n", vdata)[1:])] * 2):
        if not re.search(r'\n\t\tm_eAbilityType = "?EAbilityType_Item"?\n', body):
            continue
        found = (re.search(r'\n\t\tm_strShopIconLarge = panorama:"file://\{images\}/([a-z0-9_./-]+)\.psd"', body) or
                 re.search(r'\n\t\tm_strAbilityImage = panorama:"file://\{images\}/([a-z0-9_./-]+)\.psd"', body))
        if found:
            images[key] = f'url("s2r://panorama/images/{found[1]}_psd.vtex")'
    icons = {}
    for text in names_texts:
        for key, name in re.findall(r'^\s*"([a-z0-9_]+)"\s+"((?:[^"\\]|\\.)*)"', text, re.M):
            name = name.replace('\\"', '"').strip()
            if key in images and name:
                icons.setdefault(name, images[key])
    if len(images) < 150 or icons.get("Spirit Shredder") is None or icons.get("Lucky Shot") is None:
        raise SystemExit(f"recent-purchase icon table looks wrong ({len(images)} items, {len(icons)} names)")
    raw = (DLF / MOD_ICONS_OUT).read_bytes().decode("utf-8")
    eol = "\r\n" if "\r\n" in raw else "\n"
    current = raw.replace("\r\n", "\n")
    block = MOD_ICONS_BLOCK.match(current)
    if not block:
        raise SystemExit(f"MOD_ICONS block not found at the top of dlf/{MOD_ICONS_OUT}")
    merged = {**json.loads("{" + block[1] + "}"), **icons}
    rows = ",\n".join(f"        {json.dumps(name, ensure_ascii=False)}: {json.dumps(url)}" for name, url in sorted(merged.items()))
    text = ("// MOD_ICONS: generated by dlf/scripts/refresh-stock.py from GameTracking abilities.vdata and\n"
            "// citadel_gc_mod_names_english.txt (English item name -> shop icon; other languages as QOLLOCK shipped them). Do not edit.\n"
            f"    const MOD_ICONS = {{\n{rows}\n    }};\n" + current[block.end():])
    return text.replace("\n", eol)


def fetch(url, attempts=3):
    request = urllib.request.Request(url, headers={"User-Agent": "dlf-refresh-stock"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except OSError:
            if attempt == attempts - 1:
                raise


def main():
    args = set(sys.argv[1:])
    check, accept = "--check" in args, "--accept" in args
    head = json.loads(fetch(f"https://api.github.com/repos/{REPO}/commits/master"))
    commit = head["sha"]
    pin = json.loads(PIN.read_text(encoding="utf-8")) if PIN.exists() else {"files": {}}
    files = dict(pin["files"])
    pending = []

    print(f"GameTracking master {commit[:10]} ({head['commit']['message'].split('|')[0].strip()})")
    for stock, local in {**BASE, **OVERRIDDEN}.items():
        data = fetch(f"https://raw.githubusercontent.com/{REPO}/{commit}/{stock}")
        digest = hashlib.sha256(data).hexdigest()
        if files.get(stock) == digest:
            continue
        if stock in BASE:
            print(f"  {'stale' if check else 'refreshed'}: dlf/{local}")
            if check:
                pending.append(stock)
            else:
                (DLF / local).write_bytes(data)
                files[stock] = digest
        elif accept and not check:
            print(f"  accepted rebase: dlf/{local}")
            files[stock] = digest
        else:
            print(f"  REBASE NEEDED: {stock} changed upstream -> port into dlf/{local}")
            pending.append(stock)

    for sources, out, build in ((HERO_SOURCES, HEROES_OUT, hero_table), (ICON_SOURCES, ICONS_OUT, icon_table),
                                (CSS_SOURCES, CSS_OUT, css_table), (MOD_ICON_SOURCES, MOD_ICONS_OUT, mod_icon_table)):
        data = [fetch(f"https://raw.githubusercontent.com/{REPO}/{commit}/{path}") for path in sources]
        digests = [hashlib.sha256(item).hexdigest() for item in data]
        if all(pin["files"].get(path) == digest for path, digest in zip(sources, digests)) and (DLF / out).exists():
            continue
        print(f"  {'stale' if check else 'regenerated'}: dlf/{out}")
        if check:
            pending.append(out)
        else:
            (DLF / out).write_text(build(*(item.decode("utf-8") for item in data)), encoding="utf-8", newline="\n")
            files.update(zip(sources, digests))
    if not check:
        PIN.write_text(json.dumps({"repo": REPO, "commit": commit, "files": files}, indent=2) + "\n",
                       encoding="utf-8")
    if not pending:
        print("  pinned stock files are current")
    sys.exit(1 if pending else 0)


if __name__ == "__main__":
    main()
