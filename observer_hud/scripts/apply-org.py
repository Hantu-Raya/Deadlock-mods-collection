"""Applies an organisation variant (observer_hud/orgs/<org>) to a staged pak10 source tree. Called by
build_observer_hud.ps1 -Org <org> after the base scripts passed the validator (source and Closure output),
so the base behaviour stays proven and only the overlay below is new:

  1. orgs/<org>/panorama/**     copied into the stage; new files only (never replaces a base file).
  2. font.family                put first in every font-family declaration of font.styles (each stylesheet
                                must have at least one); the base fonts stay as the fallback.
  3. orgs/<org>/styles/<n>.css  appended to panorama/styles/observer_hud/<n>.css (last, so it wins ties).
  4. defaults                   written into oh_state.js DEFAULTS (style, banCount; source or Closure
                                output), then checked by loading the staged oh_state.js in a Node VM.
  5. captions                   the "GAME {n}" and "FIRST TO {n}" texts in oh_state.js replaced (game, first;
                                {n} is the number, "one|many" gives a form for 1 and one for the rest), then
                                checked the same way.

Usage: py observer_hud/scripts/apply-org.py <org> <stage root holding panorama/>
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parent.parent
# Defaults an org may change, with the values $.OHState accepts (oh_state.js STYLES, BAN_COUNTS).
DEFAULT_VALUES = {"style": ("names", "desk"), "banCount": (2, 3)}
FONT_DECL = re.compile(r"(font-family\s*:\s*)([^;{}]+);")
DEFAULTS_START = re.compile(r"Object\.freeze\(\{\s*v\s*:\s*1\s*,")


def fail(message):
    raise SystemExit(f"[org] {message}")


def copy_tree(org_dir, stage):
    copied = []
    root = org_dir / "panorama"
    if not root.is_dir():
        return copied
    for source in sorted(p for p in root.rglob("*") if p.is_file()):
        relative = source.relative_to(org_dir)
        target = stage / relative
        if target.exists():
            fail(f"{relative} would replace a base file; org art needs its own name")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        copied.append(relative.as_posix())
    return copied


def apply_font(font, styles_dir):
    family = font["family"]
    if not re.fullmatch(r"[A-Za-z0-9 ]+", family):
        fail(f"font family {family!r}: letters, digits and spaces only")
    quoted = f'"{family}"' if " " in family else family
    total = 0
    for name in font["styles"]:
        path = styles_dir / f"{name}.css"
        if not path.is_file():
            fail(f"font style {name}.css is not in the stage")
        text = path.read_text(encoding="utf-8")
        count = 0

        def first(match):
            nonlocal count
            value = match.group(2).strip()
            if value.split(",")[0].strip().strip('"') == family:
                return match.group(0)
            count += 1
            return f"{match.group(1)}{quoted}, {value};"

        text = FONT_DECL.sub(first, text)
        if not count:
            fail(f"{name}.css has no font-family declaration to put {family} in")
        path.write_text(text, encoding="utf-8")
        total += count
        print(f"[org] font {family}: {name}.css, {count} declarations")
    return total


def append_styles(org_dir, styles_dir):
    for source in sorted((org_dir / "styles").glob("*.css")) if (org_dir / "styles").is_dir() else []:
        target = styles_dir / source.name
        if not target.is_file():
            fail(f"styles/{source.name} has no base stylesheet to append to")
        with target.open("a", encoding="utf-8") as out:
            out.write("\n" + source.read_text(encoding="utf-8"))
        print(f"[org] css: {source.name} appended")


def apply_defaults(defaults, state_js):
    text = state_js.read_text(encoding="utf-8")
    starts = list(DEFAULTS_START.finditer(text))
    if len(starts) != 1:
        fail(f"oh_state.js: expected one DEFAULTS literal, found {len(starts)}")
    start = starts[0].end()
    # The top-level keys before the first team object (style, event, stage, bestOf, banCount).
    end = text.find("amber", start)
    if end < 0:
        fail("oh_state.js: DEFAULTS literal has no amber entry")
    head = text[start:end]
    for key, value in defaults.items():
        if key not in DEFAULT_VALUES:
            fail(f"default {key!r} cannot be set by an org (only {', '.join(DEFAULT_VALUES)})")
        if value not in DEFAULT_VALUES[key]:
            fail(f"default {key}={value!r} is not one of {DEFAULT_VALUES[key]}")
        pattern = re.compile(rf"(\b{key}\s*:\s*)(\"[^\"]*\"|\d+)")
        found = pattern.findall(head)
        if len(found) != 1:
            fail(f"oh_state.js DEFAULTS: expected one {key}, found {len(found)}")
        head = pattern.sub(lambda m: m.group(1) + json.dumps(value), head)
    state_js.write_text(text[:start] + head + text[end:], encoding="utf-8")
    # Load the staged file as Panorama would ($ global) and read the defaults back.
    check = (
        "const vm=require('vm'),fs=require('fs');const c={$:{}};vm.createContext(c);"
        "vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);const S=c.$.OHState;"
        "const d=S.defaults(),n=S.normalize({}),want=JSON.parse(process.argv[2]);"
        "for(const k of Object.keys(want)){if(d[k]!==want[k]||n[k]!==want[k])"
        "{console.error(k,d[k],n[k]);process.exit(1)}}"
    )
    result = subprocess.run(["node", "-e", check, str(state_js), json.dumps(defaults)], capture_output=True, text=True)
    if result.returncode:
        fail(f"oh_state.js defaults did not take: {result.stderr.strip() or result.stdout.strip()}")
    print(f"[org] defaults: {json.dumps(defaults)} (checked in a VM)")


# Caption an org may translate -> the base literal in oh_state.js (CAPTIONS).
CAPTION_BASE = {"game": "GAME {n}", "first": "FIRST TO {n}"}
CAPTION_MAX = 24


def apply_captions(captions, state_js):
    text = state_js.read_text(encoding="utf-8")
    for key, value in captions.items():
        if key not in CAPTION_BASE:
            fail(f"caption {key!r} cannot be set by an org (only {', '.join(CAPTION_BASE)})")
        forms = value.split("|") if isinstance(value, str) else []
        if not 1 <= len(forms) <= 2 or any(form.count("{n}") != 1 or not form.replace("{n}", "").strip() for form in forms):
            fail(f"caption {key}={value!r}: one text or \"one|many\", each with {{n}} once")
        if any(len(form.replace("{n}", "0")) > CAPTION_MAX or re.search(r"[\x00-\x1f\\]", form) for form in forms):
            fail(f"caption {key}={value!r}: at most {CAPTION_MAX} characters a form, no control characters or backslash")
        literal = json.dumps(CAPTION_BASE[key])
        if text.count(literal) != 1:
            fail(f"oh_state.js: expected one {literal}, found {text.count(literal)}")
        text = text.replace(literal, json.dumps(value))
    state_js.write_text(text, encoding="utf-8")
    # Read each caption back for 1 and 2 from the staged file.
    check = (
        "const vm=require('vm'),fs=require('fs');const c={$:{}};vm.createContext(c);"
        "vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);const S=c.$.OHState;"
        "const want=JSON.parse(process.argv[2]);for(const k of Object.keys(want)){const f=want[k].split('|');"
        "for(const n of [1,2]){const w=f[n===1?0:f.length-1].replace('{n}',String(n));"
        "if(S.caption(k,n)!==w){console.error(k,n,S.caption(k,n));process.exit(1)}}}"
    )
    result = subprocess.run(["node", "-e", check, str(state_js), json.dumps(captions)], capture_output=True, text=True)
    if result.returncode:
        fail(f"oh_state.js captions did not take: {result.stderr.strip() or result.stdout.strip()}")
    print(f"[org] captions: {json.dumps(captions)} (checked in a VM)")


def main():
    if len(sys.argv) != 3:
        fail("usage: apply-org.py <org> <stage root>")
    org, stage = sys.argv[1], Path(sys.argv[2])
    if not re.fullmatch(r"[a-z0-9_]+", org):
        fail(f"org id {org!r}: lower-case letters, digits and _ only")
    org_dir = MODULE / "orgs" / org
    config = json.loads((org_dir / "org.json").read_text(encoding="utf-8"))
    if config.get("id") != org:
        fail(f"org.json id {config.get('id')!r} is not {org!r}")
    styles_dir = stage / "panorama" / "styles" / "observer_hud"
    state_js = stage / "panorama" / "scripts" / "observer_hud" / "oh_state.js"
    for relative in copy_tree(org_dir, stage):
        print(f"[org] file: {relative}")
    if config.get("font"):
        apply_font(config["font"], styles_dir)
    append_styles(org_dir, styles_dir)
    if config.get("defaults"):
        apply_defaults(config["defaults"], state_js)
    if config.get("captions"):
        apply_captions(config["captions"], state_js)


if __name__ == "__main__":
    main()
