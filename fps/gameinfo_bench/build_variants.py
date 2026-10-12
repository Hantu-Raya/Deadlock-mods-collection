"""Build benchmark variants of a gameinfo.gi + perf cfg pair.

Revert (leave-out) variants: each listed key goes back to its stock value when stock sets
it, otherwise the entry (or its clamp block) is deleted; cfg lines for those keys are
dropped. Value variants (--set) replace the value of an existing entry in place.
Filesystem search paths, AddonConfig and RenderModes are never touched.

  py build_variants.py --base B.gi --cfg perf_r3.cfg --stock stock.gi --inventory inv.json --out DIR --list
  py build_variants.py ... --out DIR --batches            # one leave-one-batch-out variant per batch
  py build_variants.py ... --out DIR --name S3 --revert cl_interp_parallel,iv_parallel_restore
  py build_variants.py ... --out DIR --name T_max --set ThreadPoolCoreTypeRequest=max_threads --set thread_pool_option=6

Each variant is DIR/<name>/{gameinfo.gi,perf_r3.cfg}; feed them to harness3.py --b/--b-cfg.
Line endings and all untouched bytes are preserved.
"""
import argparse, json, re
from collections import defaultdict
from pathlib import Path

import kv

SKIP_PATHS = ("gameinfo/filesystem", "gameinfo/addonconfig", "gameinfo/materialsystem2")
CFG_NON_CVARS = ("echo", "cvar_unhide", "exec", "execifexists")
# Batch rules: first match wins. Order matters (e.g. parallel before physics).
RULES = [
    ("B01_threadpool", r"^(threadpoolcoretyperequest|thread_pool_option)$"),
    ("B02_parallel", r"parallel|async|multithread|threaded|_jobs?$|_job_|latch|update_voices_low_priority"),
    ("B05_shadows", r"shadow|^csm_|^lb_csm|cascade|sparseshadowtree|spotlight|^lb_barnlight|^lb_sun_csm|^lb_bin_slices|shadowatlas|shadowdepth|^lb_precomputed"),
    ("B04_particles", r"particle|^gpuparticles$|^postsimulate$|^pervertexlighting@particles|impacteffects|show_splashes|^fx_|^rope_|tracer|^cl_fasttempentcollision|mpropertyflatten"),
    ("B09_physics_gore", r"phys|ragdoll|violence|break|gib|^props_|highlight"),
    ("B06_lighting_post", r"light|environment_map|aoproxy|depthoffield|fog|sun|ssao|bloom|depth_of_field|distancefield|lightmap|^mat_|hdr|tonemap|colorcorrection|envmap|cubemap|ambientocclusion|skybox|gradient|ssss|multiscatter|hair|subsurface|^volume_|cloak_blur|_ao$|opaquefade|r_effects"),
    ("B03_animation", r"^animgraph|^ik_|boneflex|clientflex|^skeleton_|^anim_|morphing|animated_material|footlock"),
    ("B08_textures_memory", r"texture|pool|_level$|^rtx_|shader_quality|decal|^v8_|bufferpool|streamingpool|mip_bias|virtualtextures|dashboard_render_quality"),
    ("B12_misc", r"^ai_|^nav_|^sv_|think_limit"),
    ("B07_world_lod", r"^sc_|size_cull|farz|mapextents|propsmaxdist|grass|clutter|pixelvisibility|wind|aspectratio|^mesh_|disablelateallocatedtransformbuffer|thumper|^r_draw|lod"),
    ("B10_sound", r"^snd_|^audio_|^voice_|^dsp_|^sos_|^cc_|^soundsystem"),
    ("B11_hud_ui", r"panorama|^citadel_|minimap|outline|fps_max|steam_inputhandler|^mm_|debug_draw|selection"),
    ("B12_misc", r".*"),
]


def classify(key, path=""):
    k = key.lower()
    probe = f"{k}@particles" if path.endswith("/particles") and k == "pervertexlighting" else k
    return next(name for name, pattern in RULES if re.search(pattern, probe))


def cfg_key(line):
    parts = line.split()
    if parts and not line.lstrip().startswith("//") and len(parts) > 1 and parts[0].lower() not in CFG_NON_CVARS:
        return parts[0]
    return None


def entries(inventory, cfg_text):
    """Every difference vs stock plus every cfg setter: dict(path, key, owner, batch)."""
    out = []
    for i in inventory["items"]:
        if i["path"].startswith(SKIP_PATHS):
            continue
        owner = i["path"].split("/")[2] if i["path"].startswith("gameinfo/convars/") else None
        out.append(dict(path=i["path"], key=i["key"], owner=owner, batch=classify(owner or i["key"], i["path"])))
    for line in cfg_text.splitlines():
        key = cfg_key(line)
        if key:
            out.append(dict(path="cfg", key=key, owner=None, batch=classify(key)))
    return out


def line_span(text, start, end):
    """Delete the whole line when it holds only this entry (plus an optional comment)."""
    ls = text.rfind("\n", 0, start) + 1
    le = text.find("\n", end)
    le = len(text) if le < 0 else le
    rest = text[end:le].strip()
    if text[ls:start].strip() == "" and (rest == "" or rest.startswith("//")):
        return (ls, le + 1, "")
    return (start, end, "")


def revert_gi(text, stock_text, remove):
    """remove: {(path, key)} casefolded entries and {("block", convar)} clamp blocks."""
    ours, sections = kv.parse(text)
    stock, _ = kv.parse(stock_text)
    edits = []
    for ident, occ in ours.items():
        if ident not in remove:
            continue
        for n, item in enumerate(occ):
            if n == 0 and ident in stock:
                v = item["value"]
                edits.append((v.start, v.end, kv.quote(stock[ident][0]["value"].value)))
            else:
                edits.append(line_span(text, item["key"].start, item["value"].end))
    for path, blocks in sections.items():
        if path.startswith("gameinfo/convars/") and ("block", path.split("/")[2]) in remove:
            edits.extend(line_span(text, b["key"].start, b["close"].end) for b in blocks)
    for start, end, rep in sorted(edits, reverse=True):
        text = text[:start] + rep + text[end:]
    return text


def set_gi(text, key, value):
    """Replace the value of the gameinfo entry named key (any section). Returns (text, found)."""
    ours, _ = kv.parse(text)
    hits = [item for ident, occ in ours.items() if ident[1] == key.casefold() for item in occ]
    if len(hits) > 1:
        raise SystemExit(f"--set {key}: {len(hits)} gameinfo entries match; edit by hand")
    if not hits:
        return text, False
    v = hits[0]["value"]
    return text[:v.start] + kv.quote(value) + text[v.end:], True


def set_cfg_lines(lines, key, value):
    out, hit = [], False
    for line in lines:
        if (cfg_key(line) or "").lower() == key.lower():
            ending = line[len(line.rstrip("\r\n")):]
            out.append(f'{key} "{value}"{ending}')
            hit = True
        else:
            out.append(line)
    return out, hit


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", type=Path, required=True, help="gameinfo.gi being tested (usually the installed copy)")
    ap.add_argument("--cfg", type=Path, required=True, help="companion cfg re-applied after auto.cfg (perf_r3.cfg)")
    ap.add_argument("--stock", type=Path, required=True)
    ap.add_argument("--inventory", type=Path, required=True, help="output of inventory.py for --base")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--list", action="store_true", help="print batches and exit")
    ap.add_argument("--batches", help="build leave-one-batch-out variants (all, or comma list like B02,B05)", nargs="?", const="all")
    ap.add_argument("--name")
    ap.add_argument("--revert", help="comma list of keys to revert to stock")
    ap.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    a = ap.parse_args()

    base_text = a.base.read_bytes().decode("utf-8")
    cfg_text = a.cfg.read_bytes().decode("utf-8")
    stock_text = a.stock.read_bytes().decode("utf-8")
    ents = entries(json.loads(a.inventory.read_text(encoding="utf-8")), cfg_text)
    batches = defaultdict(list)
    for e in ents:
        batches[e["batch"]].append(e)
    if a.list:
        for b in sorted(batches):
            ks = sorted({e["owner"] or e["key"] for e in batches[b]})
            print(f"{b}: {len(ks)} keys\n   " + " ".join(ks))
        return

    targets = {}
    if a.batches:
        for b in sorted(batches):
            if a.batches == "all" or b.split("_")[0] in a.batches.split(","):
                targets[b] = (batches[b], [])
    else:
        if not a.name or not (a.revert or a.set):
            ap.error("custom variants need --name and --revert and/or --set")
        want = {k.lower() for k in (a.revert or "").split(",") if k}
        chosen = [e for e in ents if (e["owner"] or e["key"]).lower() in want]
        missing = want - {(e["owner"] or e["key"]).lower() for e in chosen}
        if missing:
            ap.error(f"not in the inventory or cfg: {sorted(missing)}")
        targets[a.name] = (chosen, [s.split("=", 1) for s in a.set])

    for name, (chosen, sets) in targets.items():
        remove = {("block", e["owner"]) if e["owner"] else (e["path"], e["key"]) for e in chosen if e["path"] != "cfg"}
        remove = {(p.casefold(), k.casefold()) if p != "block" else (p, k.lower()) for p, k in remove}
        drop = {(e["owner"] or e["key"]).lower() for e in chosen}
        gi = revert_gi(base_text, stock_text, remove)
        lines = [l for l in cfg_text.splitlines(keepends=True) if (cfg_key(l) or "").lower() not in drop]
        for key, value in sets:
            lines, in_cfg = set_cfg_lines(lines, key, value)
            gi, in_gi = set_gi(gi, key, value)
            if not (in_cfg or in_gi):
                raise SystemExit(f"--set {key}: not found in gameinfo or {a.cfg.name}")
        kv.parse(gi)  # the variant must still parse
        d = a.out / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "gameinfo.gi").write_bytes(gi.encode("utf-8"))
        (d / a.cfg.name).write_bytes("".join(lines).encode("utf-8"))
        print(f"{name}: reverted {len(remove)} gi entries, dropped cfg keys {len(drop)}, set {len(sets)} -> {d}")


if __name__ == "__main__":
    main()
