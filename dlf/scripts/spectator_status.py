#!/usr/bin/env python3
"""Make the ability statuses in dlf/spectator-status.json visible on every hero's world healthbar.

    py dlf/scripts/spectator_status.py <abilities.vdata> <modifiers.vdata> [--localization <dir>]  # transform in place
    py dlf/scripts/spectator_status.py --verify <abilities.vdata> <modifiers.vdata>   # check, change nothing

The inputs are the installed game's scripts/abilities.vdata and scripts/modifiers.vdata, decompiled by
build_dlf.ps1. The root _include block is removed (its records are already merged into the decompiled
text, as in abilities/), then every listed modifier gets the spec's fields (overhead status drawn for
everyone, not hidden). The world healthbar then lists the status for a spectator too, and
dlf_debuff_world.js forwards it to the top bar. Every listed record and modifier must exist exactly
once, so a game patch that renames one fails the build instead of silently dropping it. Idempotent.
classSwaps entries give one listed modifier subclass another client `_class` (and an AnimGraph base
action) when its own client class hides it in code; the old class must match, so a patch fails loudly.
"unnamed" lists ability/modifier pairs that have no localized name: they also get
m_eHudDisplayLocation DISPLAY_HUD_NONE, so the watched hero's own HUD does not print the raw
#ability/modifier token now that they are no longer hidden. Each must be a listed modifier.
With --localization <game citadel/resource/localization dir> the transform also fails when a listed
modifier has no English name and is not in "unnamed".
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "abilities" / "scripts"))
from active import get_record_name, iter_record_spans  # noqa: E402
from apply_healthbar_status_overrides import FIELD_PATTERN, _modifier_span, _set_modifier_fields  # noqa: E402

SPEC_PATH = ROOT / "dlf" / "spectator-status.json"
INCLUDE = re.compile(r'(?m)^\s*_include\s*=\s*\r?\n\s*\[\s*\r?\n(?:\s*resource_name:"[^"]+",?\s*\r?\n)+\s*\]\s*\r?\n')


def load_spec():
    return json.loads(SPEC_PATH.read_text(encoding="utf-8"))


def strip_include(content, name):
    count = len(INCLUDE.findall(content))
    if count > 1:
        raise ValueError(f"{name}: expected at most one root _include block, found {count}")
    return INCLUDE.sub("", content, count=1)


def direct_fields(record, marker):
    """Direct field name -> value of the modifier block holding `marker`."""
    lines = record.splitlines(keepends=True)
    start, end, indent = _modifier_span(lines, marker)
    found = {}
    for index in range(start + 1, end):
        match = FIELD_PATTERN.match(lines[index].rstrip("\r\n"))
        if match and match.group("indent") == indent:
            found[match.group("name")] = lines[index].split("=", 1)[1].strip()
    return found


def targets(spec):
    """(file, record name, marker, ability/modifier key) for every listed modifier."""
    for entry in spec["abilities"]:
        for name in entry["modifiers"]:
            yield "abilities", entry["ability"], f'_my_subclass_name = "{name}"', f'{entry["ability"]}/{name}'
    for name in spec["genericModifiers"]:
        # A modifiers.vdata record is one flat block; its own _class line marks it.
        yield "modifiers", name, '_class = "', name


def records_of(content):
    return {get_record_name(record): (start, end, record) for start, end, record in iter_record_spans(content)}


def class_swap(record, swap, verify=False):
    """Give one modifier subclass another client class (spec classSwaps) plus an AnimGraph base action.

    Returns (record, changes). The modifier must currently have `from` (or already `to`), so a game
    patch that changes the class fails the build."""
    lines = record.splitlines(keepends=True)
    marker = f'_my_subclass_name = "{swap["modifier"]}"'
    if sum(1 for line in lines if marker in line) != 1:
        raise ValueError(f"abilities/{swap['ability']}: expected one {marker!r}")
    start, end, indent = _modifier_span(lines, marker)
    newline = "\r\n" if any(line.endswith("\r\n") for line in lines) else "\n"
    direct = [index for index in range(start + 1, end)
              if lines[index].startswith(indent) and lines[index][len(indent):len(indent) + 1].strip()
              and lines[index].strip() not in ("{", "}")]
    classes = [index for index in direct if lines[index].strip().startswith("_class = ")]
    if len(classes) != 1:
        raise ValueError(f"abilities/{swap['ability']} {swap['modifier']}: expected one _class line")
    current = lines[classes[0]].strip()
    want = f'_class = "{swap["to"]}"'
    changes = 0
    if current != want:
        if verify or current != f'_class = "{swap["from"]}"':
            raise ValueError(f"abilities/{swap['ability']} {swap['modifier']}: {current}, expected {swap['from']} -> {swap['to']}")
        lines[classes[0]] = f"{indent}{want}{newline}"
        changes += 1
    action = swap["baseAction"]
    body = [f'm_strParamName = "{action["m_strParamName"]}"', f'm_nPriority = {action["m_nPriority"]}']
    found = [index for index in direct if lines[index].strip() == "m_AG2BaseAction ="]
    if found:
        block = "".join(lines[found[0]:found[0] + 6])
        if not all(item in block for item in body):
            raise ValueError(f"abilities/{swap['ability']} {swap['modifier']}: m_AG2BaseAction differs from the spec")
    elif verify:
        raise ValueError(f"abilities/{swap['ability']} {swap['modifier']}: m_AG2BaseAction missing")
    else:
        lines[end:end] = [f"{indent}m_AG2BaseAction = {newline}", f"{indent}{{{newline}"] + \
            [f"{indent}\t{item}{newline}" for item in body] + [f"{indent}}}{newline}"]
        changes += 1
    return "".join(lines), changes


def transform(contents, spec, verify=False):
    """contents: {"abilities": text, "modifiers": text}. Returns (new contents, field changes)."""
    unnamed = set(spec.get("unnamed", []))
    listed = {key for _, _, _, key in targets(spec)}
    if unnamed - listed:
        raise ValueError(f"unnamed entries not among the listed modifiers: {sorted(unnamed - listed)}")
    hud_none = {"m_eHudDisplayLocation": '"DISPLAY_HUD_NONE"'}
    out = {}
    changes = 0
    for kind, content in contents.items():
        if not verify:
            content = strip_include(content, kind)
        records = records_of(content)
        edits = {}
        for target_kind, record_name, marker, key in targets(spec):
            want = {**spec["fields"], **hud_none} if key in unnamed else spec["fields"]
            if target_kind != kind:
                continue
            if record_name not in records:
                raise ValueError(f"{kind}: record {record_name} not found")
            record = edits.get(record_name, records[record_name][2])
            lines = record.splitlines(keepends=True)
            hits = sum(1 for line in lines if marker in line)
            if hits != 1:
                raise ValueError(f"{kind}/{record_name}: expected one {marker!r}, found {hits}")
            current = direct_fields(record, marker)
            if current.get("m_eModifierDisplayLocaiton") == '"MODIFIER_DISPLAY_BOTTOM_LEFT"':
                raise ValueError(f"{kind}/{record_name} {marker}: displayed bottom-left only, not on the healthbar")
            if verify:
                wrong = {name: current.get(name) for name, value in want.items() if current.get(name) != value}
                if wrong:
                    raise ValueError(f"{kind}/{record_name} {marker}: not applied {wrong}")
                continue
            record, changed = _set_modifier_fields(record, marker, want)
            edits[record_name] = record
            changes += changed
        for swap in spec.get("classSwaps", []) if kind == "abilities" else []:
            if swap["ability"] not in records:
                raise ValueError(f"{kind}: record {swap['ability']} not found")
            record, changed = class_swap(edits.get(swap["ability"], records[swap["ability"]][2]), swap, verify)
            if not verify:
                edits[swap["ability"]] = record
                changes += changed
        for record_name, record in sorted(edits.items(), key=lambda item: -records[item[0]][0]):
            start, end, _ = records[record_name]
            content = content[:start] + record + content[end:]
        out[kind] = content
    return out, changes


def english_keys(directory):
    """Lower-cased token names of every *_english.txt under the game's localization directory."""
    files = sorted(pathlib.Path(directory).glob("*/*_english.txt"))
    if not files:
        raise ValueError(f"no *_english.txt under {directory}")
    pattern = re.compile(r'^\s*"([^"]+)"\s+"', re.M)
    return {match.group(1).lower() for path in files
            for match in pattern.finditer(path.read_text(encoding="utf-8", errors="ignore"))}


def nameless(contents, spec, keys):
    """Listed ability/modifier keys with no English name (no m_sLocalizationName token, no key token)."""
    found = []
    for kind, record_name, marker, key in targets(spec):
        record = records_of(contents[kind])[record_name][2]
        token = direct_fields(record, marker).get("m_sLocalizationName", "").strip('"').lstrip("#").lower()
        if not (token and token in keys) and key.lower() not in keys:
            found.append(key)
    return found


def main(argv):
    verify = argv[:1] == ["--verify"]
    paths = argv[1:] if verify else argv
    localization = None
    if "--localization" in paths:
        at = paths.index("--localization")
        localization = paths[at + 1] if at + 1 < len(paths) else None
        paths = paths[:at] + paths[at + 2:]
        if not localization:
            print(__doc__)
            return 2
    if len(paths) != 2:
        print(__doc__)
        return 2
    files = dict(zip(("abilities", "modifiers"), (pathlib.Path(path) for path in paths)))
    contents = {kind: path.read_text(encoding="utf-8") for kind, path in files.items()}
    spec = load_spec()
    if localization:
        missing = sorted(set(nameless(contents, spec, english_keys(localization))) - set(spec.get("unnamed", [])))
        if missing:
            raise ValueError(f"no English name, add to spectator-status.json unnamed: {missing}")
    result, changes = transform(contents, spec, verify=verify)
    count = sum(len(entry["modifiers"]) for entry in spec["abilities"]) + len(spec["genericModifiers"])
    if verify:
        print(f"[spectator-status] verified {count} modifiers")
        return 0
    for kind, path in files.items():
        if result[kind] != contents[kind]:
            path.write_text(result[kind], encoding="utf-8", newline="")
    print(f"[spectator-status] {count} modifiers, {changes} field(s) set")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
