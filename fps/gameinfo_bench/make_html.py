"""Build the published benchmark page (index-ready HTML + 1200x630 card) from harness3 run folders (stdlib only).

Round r6 (2026-10-13): Hantu's vs Sqooky vs kaizuchanerus minimum spec, timed with PresentMon (FPS, 1%/0.1% lows,
display latency), plus the r6 findings (Sqooky's engine-loop settings, mesh buffer pools, kaizuchanerus' culling)
and the earlier r5 parallel-toggle fix.
Page order follows the reader's questions: who is fastest and by how much (headline + run plot),
is it consistent (paired restarts), what was found, what is the catch, what was tested, raw evidence.
Every headline claim is asserted against the run data, so new data that breaks a claim fails the build.
"""
import html, json, os, statistics
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Page + card output (site/ is a separate git repo pushed to hantu-raya.github.io/hantu-cnvar).
HERE = Path(os.environ.get("GAMEINFO_PAGE_OUT") or REPO / ".scratch/gameinfo_opt/r5_3way_20261012")
RUNS = Path(os.environ.get("GAMEINFO_PAGE_RUNS") or REPO / ".scratch/gameinfo_opt/runs")      # r6 runs
OLD_RUNS = REPO / ".scratch/gameinfo_opt/r3_20261011/bench"                                     # r5 fix runs
OURS, SQ, KZ = "Hantu's", "Sqooky", "kaizuchanerus"
# PresentMon, ABBA, run without the tester's auto.cfg (harness3 --no-auto-cfg). Hantu's = mesh pools + sleep-after-tick 1 + perf_r3.cfg
SETS = [(SQ, "runs-20261013_163516_333447"), (KZ, "runs-20261013_165900_808861")]
ARMS = [OURS, SQ, KZ]
TONE = {OURS: "a", SQ: "b", KZ: "c"}
REPO_SQ = "https://github.com/Sqooky/OptimizationLock/tree/f6fdab7f66e7c314b011a861589fa12db27c8a3e"
SOURCES = {
    OURS: ("Installed <code>gameinfo.gi</code> + <code>perf_r3.cfg</code>", "gameinfo md5 7053ce4e, cfg md5 73201c91"),
    SQ: (f'<a href="{REPO_SQ}/Sqooky\'s%20.gi">Sqooky/OptimizationLock</a>, "Sqooky\'s .gi"', "main @ f6fdab7, 2026-10-12"),
    KZ: (f'<a href="{REPO_SQ}/kaizuchanerus%20minimum%20spec">Sqooky/OptimizationLock</a>, "kaizuchanerus minimum spec"',
         "main @ f6fdab7, 2026-10-12"),
}
SQ_FIX = "runs-20261013_125945_694922"     # PresentMon. A = Sqooky as published, B = without its engine-loop lines
KZ_CULL = "runs-20261013_111854_366798"    # A = kaizuchanerus, B = with Hantu's size cull + draw distance (profiler FPS, ratio 1)
MESH = ["runs-20261013_061209_173442", "runs-20261013_081450_652770"]   # A = Hantu's, B = + MeshSystem pools (ABBA, BAAB)
NO_GAIN = [  # (change, PresentMon run folder, now in Hantu's config). A = Hantu's (mesh pools + perf_r3.cfg), B = A + the change; ABBA, 300 s
    ("<code>r_frame_sync_enable 0</code> (from kaizuchanerus)", "runs-20261013_144117_916356", False),
    ("<code>engine_low_latency_sleep_after_client_tick 1</code> (from kaizuchanerus)", "runs-20261013_150547_914449", True),
    ("Light-cookie allocation back to default (8 / 16)", "runs-20261013_152933_959737", False),
    ("<code>SceneSystem/GpuLightBinner 0</code> (darkens the map: no dynamic lights)", "runs-20261013_155316_457629", False),
    # 2026-10-13 evening, run without auto.cfg on the current config (sleep-after-tick included)
    ("Without the <code>&#8209;favor_consistent_framerate</code> launch option", "runs-20261013_173932_331753", False),
    ("<code>Particles/DisableSorting 1</code> (particles drawn unsorted)", "runs-20261013_180309_188105", False),
    ("<code>sc_aggregate_indirect_draw_compaction_threshold</code> 4 → 16 (stock 8)", "runs-20261013_182747_578099", False),
]
# dead.bat launches with +exec auto.cfg, which runs after the gameinfo. It ran in every set except the head-to-head (SETS) and the last three NO_GAIN rows.
# Counted 2026-10-13: auto.cfg has 112 settings and overrides 9 of Hantu's ConVars lines, 9 of Sqooky's and 5 of kaizuchanerus'.
AUTO_CFG = dict(settings=112, ours=9, sq=9, kz=5)
GI_ONLY = "runs-20261013_074619_547183"   # game frame counter: Hantu's gameinfo with an empty cfg (A side)
AXIS = (90, 115)        # FPS axis of the run plot
DIFF = (-20, 5)         # FPS axis of the paired-difference plot
FAXIS = (95, 105)       # Sqooky fix plot

mean = statistics.fmean
e = html.escape
pct = lambda v, lo, hi: f"{100 * (v - lo) / (hi - lo):.2f}%"


def load(root, folder, ratio_ok=True):
    doc = json.loads((root / folder / "results.json").read_text(encoding="utf-8"))
    assert doc["restored"] and not doc.get("restore_errors") and all(r["valid"] for r in doc["runs"]), folder
    if ratio_ok:
        assert all(abs(r["frame_to_present_ratio"] - 1) < 0.05 for r in doc["runs"]), folder
    return doc


def sides(doc, key="fps"):
    return ([r[key] for r in doc["runs"] if r["label"] == "A"], [r[key] for r in doc["runs"] if r["label"] == "B"])


def pair_diffs(doc, key="fps"):
    """B − A for each adjacent pair, whatever the order (ABBA, BAAB...)."""
    r = doc["runs"]
    out = []
    for i in range(0, len(r), 2):
        x, y = r[i], r[i + 1]
        a, b = (x, y) if x["label"] == "A" else (y, x)
        out.append(b[key] - a[key])
    return out


# ---- Head-to-head ----
runs, pairs, set_means = [], [], {}
for other, folder in SETS:
    doc = load(RUNS, folder, ratio_ok=False)
    recs = doc["runs"]
    assert [r["label"] for r in recs] == list("ABBA") and all("pm_fps" in r for r in recs), folder
    for i, r in enumerate(recs, 1):
        runs.append((other, i, OURS if r["label"] == "A" else other, r))
    for n, (a, b) in enumerate(((recs[0], recs[1]), (recs[3], recs[2])), 1):
        pairs.append((other, n, a["pm_fps"], b["pm_fps"]))
    a_fps, b_fps = sides(doc, "pm_fps")
    set_means[other] = (mean(a_fps), mean(b_fps))
    # Proof auto.cfg did not run: moved aside for the set, and Hantu's read back its own values, not auto.cfg's (60 / 15 / 0).
    assert doc["auto_cfg"]["removed"] and not doc["auto_cfg"]["present_during_runs"] and doc["auto_cfg"]["restored"], folder
    for r in recs:
        if r["label"] == "A":
            v = r["effective_values"]["values"]
            assert (v["minimap_update_rate_hz"], v["cq_buffer_bloat_msecs_max"], v["r_decals"]) == ("10", "120", "1"), (folder, v)

arm_vals = lambda key: {a: [r[key] for _, _, arm, r in runs if arm == a] for a in ARMS}
fps, cpu = arm_vals("pm_fps"), arm_vals("cpu_cores")
low1, low01 = arm_vals("pm_low1_fps"), arm_vals("pm_low01_fps")
lat, lat99 = arm_vals("pm_display_latency_avg_ms"), arm_vals("pm_display_latency_p99_ms")
lead = {o: 100 * (h / t - 1) for o, (h, t) in set_means.items()}          # Hantu's vs that config, same set
sq_runs = [r for s, _, arm, r in runs if s == SQ]
assert min(r["pm_fps"] for r in sq_runs if r["label"] == "A") > max(r["pm_fps"] for r in sq_runs if r["label"] == "B"), "Sqooky separation"
assert all(b < a for o, _, a, b in pairs if o == SQ), "every Sqooky pair favours Hantu's"
assert abs(lead[KZ]) < 3, "kaizuchanerus 'tie' claim needs |difference| < 3% (ABBA resolution)"
assert mean(low1[OURS]) > mean(low1[SQ]) and mean(lat[OURS]) < min(mean(lat[SQ]), mean(lat[KZ])), "lows/latency claims"
assert all(AXIS[0] <= v <= AXIS[1] for a in ARMS for v in fps[a])
assert all(DIFF[0] <= b - a <= DIFF[1] for _, _, a, b in pairs)

# ---- Findings ----
fix_doc = load(RUNS, SQ_FIX, ratio_ok=False)
sq_before, sq_after = sides(fix_doc, "pm_fps")
sq_fix_gain = 100 * (mean(sq_after) / mean(sq_before) - 1)
sq_prof_before, sq_prof_after = sides(fix_doc)               # the game's own counter, for the correction note
fix_low = [mean(s) for s in sides(fix_doc, "pm_low1_fps")]
fix_lat = [mean(s) for s in sides(fix_doc, "pm_display_latency_avg_ms")]
fix_lat99 = [mean(s) for s in sides(fix_doc, "pm_display_latency_p99_ms")]
assert abs(sq_fix_gain) < 3, "Sqooky fix is described as an FPS tie"
assert all(d > 0 for d in pair_diffs(fix_doc, "pm_low1_fps")) and all(d < 0 for d in pair_diffs(fix_doc, "pm_display_latency_avg_ms"))
assert mean(sq_prof_after) / mean(sq_prof_before) > 1.08, "correction note: the profiler counter showed a large false gain"
assert all(FAXIS[0] <= v <= FAXIS[1] for v in sq_before + sq_after)
kz_cull, kz_ours_cull = sides(load(RUNS, KZ_CULL))
kz_cull_cost = 100 * (mean(kz_ours_cull) / mean(kz_cull) - 1)
assert kz_cull_cost < -5 and all(d < 0 for d in pair_diffs(load(RUNS, KZ_CULL))), "kaizuchanerus culling claim"

mesh_docs = [load(RUNS, f) for f in MESH]
mesh_pairs = [d for doc in mesh_docs for d in pair_diffs(doc)]
mesh_a = [v for doc in mesh_docs for v in sides(doc)[0]]
mesh_b = [v for doc in mesh_docs for v in sides(doc)[1]]
mesh_gain = 100 * (mean(mesh_b) / mean(mesh_a) - 1)
assert all(d > 0 for d in mesh_pairs) and len(mesh_pairs) == 4, "mesh pool claims 4/4 positive pairs"

no_gain_rows, no_gain_docs = [], []
for label, folder, added in NO_GAIN:
    doc = load(RUNS, folder)
    assert [r["label"] for r in doc["runs"]] == list("ABBA") and all("pm_fps" in r for r in doc["runs"]), folder
    no_gain_docs.append(doc)
    cells = []
    for key, unit in (("pm_fps", ""), ("pm_low1_fps", ""), ("pm_display_latency_avg_ms", " ms")):
        a, b = (mean(v) for v in sides(doc, key))
        cells.append(f'<td class="num">{a:.1f} → {b:.1f}{unit}</td>')
    a, b = (mean(v) for v in sides(doc, "pm_fps"))
    change = 100 * (b / a - 1)
    assert abs(change) < 3, f"{label}: {change:+.1f}% is not 'no gain' at ABBA resolution"
    pd = ", ".join(f"{d:+.1f}" for d in pair_diffs(doc, "pm_fps"))
    tag = ' <span class="added">Now in Hantu\'s config</span>' if added else ""
    no_gain_rows.append(f'<tr><th scope="row">{label}{tag}</th><td class="num">{change:+.1f}%</td>{"".join(cells)}<td class="num">{pd}</td></tr>')
no_gain_rows = "".join(no_gain_rows)
# The sleep-after test compared identical setups: auto.cfg (sets it true) ran after the gameinfo in every run.
sleep_doc = no_gain_docs[1]
for r in sleep_doc["runs"]:
    assert "execing auto.cfg" in Path(r["console_log"]).read_text(encoding="utf-8", errors="replace"), r["console_log"]
sleep_a, sleep_b = (mean(v) for v in sides(sleep_doc, "pm_fps"))
sleep_gain = 100 * (sleep_b / sleep_a - 1)
added_names = [lbl.split("</code>")[0].replace("<code>", "") for lbl, _, added in NO_GAIN if added]
gi_only = mean(sides(load(RUNS, GI_ONLY))[0])
# How far the game's own counter strays from PresentMon on runs where it counts one frame per Present.
pm_checked = [r for _, _, _, r in runs] + fix_doc["runs"] + [r for d in no_gain_docs for r in d["runs"]]
agree = [r for r in pm_checked if abs(r["frame_to_present_ratio"] - 1) < 0.05]
counter_gap = max(100 * abs(r["fps"] / r["pm_fps"] - 1) for r in agree)
assert len(agree) >= 8 and counter_gap < 2.5, "warning text claims the counter agrees within ~2% for ratio-1 configs"
NOPM = '<span class="nopm">Not PresentMon</span>'

# ---- Earlier fix (r5, 2026-10-12) ----
old_before, old_after = sides(load(OLD_RUNS, "runs-20261012_151306_471929"))
old_gain = 100 * (mean(old_after) / mean(old_before) - 1)
TOGGLES = [("iv_parallel_restore", "0", "1", "runs-20261012_161216_972876"),
           ("animgraph_parallel_postdataupdate", "false", "true (default)", "runs-20261012_162401_449112"),
           ("cl_interp_parallel", "0", "1", "runs-20261012_160036_701587")]
toggle_rows = []
for name, old, new, folder in TOGGLES:
    fixed, broken = sides(load(OLD_RUNS, folder))
    cost = 100 * (mean(broken) / mean(fixed) - 1)
    assert cost < 0, name
    toggle_rows.append(f'<tr><th scope="row"><code>{name}</code></th><td class="num flag">{cost:+.1f}%</td>'
                       f'<td class="num">{old}</td><td class="num">{new}</td></tr>')
toggle_rows = "".join(toggle_rows)


def dot_row(label, vals, tone, note, axis):
    dots = "".join(f'<span class="dot" style="left:{pct(v, *axis)}" title="{v:.1f} FPS"></span>' for v in vals)
    return (f'<div class="row t-{tone}"><div class="name">{label}</div><div class="track">'
            f'<span class="range" style="left:{pct(min(vals), *axis)};width:calc({pct(max(vals), *axis)} - {pct(min(vals), *axis)})"></span>'
            f'{dots}<span class="mean" style="left:{pct(mean(vals), *axis)}"></span></div>'
            f'<div class="val"><b>{mean(vals):.1f}</b><small>{note}</small></div></div>')


def axis_row(axis, step=5, fmt=str):
    ticks = "".join(f'<span class="tick" style="left:{pct(t, *axis)}">{fmt(t)}</span>' for t in range(axis[0], axis[1] + 1, step))
    return f'<div class="row axis" aria-hidden="true"><div></div><div class="track">{ticks}</div><div class="unit">FPS</div></div>'


def run_plot():
    rows = []
    for a in ARMS:
        note = "4 runs, 2 sets" if a == OURS else (f"Hantu's +{lead[a]:.1f}%" if lead[a] > 0 else f"{-lead[a]:.1f}% above Hantu's")
        rows.append(dot_row(e(a), fps[a], TONE[a], note, AXIS))
    label = "; ".join(f"{a} {mean(fps[a]):.1f}" for a in ARMS)
    return f'<div class="plot" role="img" aria-label="Average FPS: {label}">{"".join(rows)}{axis_row(AXIS)}</div>'


def pair_plot():
    zero = pct(0, *DIFF)
    rows = []
    for other, n, a, b in pairs:
        d = b - a
        lo, hi = (pct(d, *DIFF), zero) if d < 0 else (zero, pct(d, *DIFF))
        rows.append(f'<div class="row t-{TONE[other]}"><div class="name">vs {e(other)} <small>pair {n}</small></div>'
                    f'<div class="track"><span class="bar{" pos" if d > 0 else ""}" style="left:{lo};width:calc({hi} - {lo})"></span></div>'
                    f'<div class="val"><b>{d:+.1f}</b><small>{b:.1f} vs {a:.1f}</small></div></div>')
    fmt = lambda t: f"{t:+d}".replace("+0", "0")
    label = "; ".join(f"{o} pair {n} {b - a:+.1f}" for o, n, a, b in pairs)
    return (f'<div class="plot pairs" role="img" aria-label="Their FPS minus Hantu\'s in each back-to-back pair: {label}" '
            f'style="--zero:{zero}">{"".join(rows)}{axis_row(DIFF, fmt=fmt)}</div>')


def fix_plot():
    rows = dot_row("As published", sq_before, "b", "two settings on", FAXIS) + dot_row("Without them", sq_after, "a", f"{sq_fix_gain:+.1f}%", FAXIS)
    return (f'<div class="plot" role="img" aria-label="Sqooky FPS as published {mean(sq_before):.1f}, without the two settings {mean(sq_after):.1f}">'
            f'{rows}{axis_row(FAXIS)}</div>')


low_rows = "".join(
    f'<tr><th scope="row" class="cfg"><span class="sw t-{TONE[a]}"></span>{e(a)}</th>'
    f'<td class="num">{mean(fps[a]):.1f}</td><td class="num">{mean(low1[a]):.1f}</td><td class="num">{mean(low01[a]):.1f}</td>'
    f'<td class="num">{mean(lat[a]):.1f}</td><td class="num">{mean(lat99[a]):.1f}</td></tr>'
    for a in ARMS)

config_rows = "".join(
    f'<tr><th scope="row" class="cfg"><span class="sw t-{TONE[a]}"></span>{e(a)}</th><td>{SOURCES[a][0]}<br><small>{SOURCES[a][1]}</small></td>'
    f'<td class="num">{mean(fps[a]):.1f}</td><td class="num">{min(fps[a]):.1f}–{max(fps[a]):.1f}</td><td class="num">{mean(cpu[a]):.2f}</td></tr>'
    for a in ARMS)

run_rows = "".join(
    f'<tr><td>vs {e(s)}</td><td class="num">{i}</td><th scope="row" class="cfg"><span class="sw t-{TONE[arm]}"></span>{e(arm)}</th>'
    f'<td class="num">{r["pm_fps"]:.1f}</td><td class="num">{r["pm_low1_fps"]:.1f}</td><td class="num">{r["pm_low01_fps"]:.1f}</td>'
    f'<td class="num">{r["pm_display_latency_avg_ms"]:.1f}</td><td class="num">{r["pm_frames"]:,}</td>'
    f'<td class="num{" flag" if r["doubled_frame_count"] else ""}">{r["fps"]:.1f}{"*" if r["doubled_frame_count"] else ""}</td>'
    f'<td class="num">{r["cpu_cores"]:.2f}</td></tr>'
    for s, i, arm, r in runs)

sq_h, sq_t = set_means[SQ]
kz_h, kz_t = set_means[KZ]
title = "Hantu's gameinfo vs Sqooky vs kaizuchanerus: Deadlock FPS benchmark"
summary = (f"Hantu's ran {lead[SQ]:.0f}% faster than Sqooky ({sq_h:.1f} vs {sq_t:.1f} FPS), tied kaizuchanerus' minimum spec "
           f"({kz_h:.1f} vs {kz_t:.1f}) and had the lowest display latency of the three ({mean(lat[OURS]):.1f} ms), "
           "timed frame by frame with PresentMon on the same recorded match.")
SITE = "https://hantu-raya.github.io/hantu-cnvar/"
# Social embeds (Discord, X, ...) cache the preview by URL: bump this name whenever card.html changes.
OG_IMAGE = "og-20261013-noautocfg.png"
card_alt = ("Average FPS, 1% low and display latency: "
            + "; ".join(f"{a} {mean(fps[a]):.1f} FPS, 1% low {mean(low1[a]):.1f}, {mean(lat[a]):.1f} ms" for a in ARMS)
            + ". Deadlock gameinfo benchmark, client 6774, PresentMon.")
best_lat = min(ARMS, key=lambda a: mean(lat[a]))
assert best_lat == OURS, "card headline claims Hantu's has the lowest latency"
card_rows = "".join(
    f'<div class="r t-{TONE[a]}"><div class="n">{e(a)}</div>'
    f'<div class="t"><span style="width:{100 * mean(fps[a]) / AXIS[1]:.2f}%"></span></div>'
    f'<div class="v">{mean(fps[a]):.1f}</div><div class="v s">{mean(low1[a]):.1f}</div>'
    f'<div class="v s{" best" if a == best_lat else ""}">{mean(lat[a]):.1f}<small>ms</small></div></div>'
    for a in ARMS)
card = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0}}
html,body{{width:1200px;height:630px;overflow:hidden}}
body{{background:#0e1013;color:#e8eaed;font-family:system-ui,"Segoe UI",sans-serif;padding:64px 72px;display:flex;flex-direction:column}}
.eyebrow{{font:600 22px/1 "Cascadia Mono",Consolas,monospace;color:#9aa3ae;letter-spacing:.04em}}
h1{{font-size:54px;line-height:1.1;letter-spacing:-.02em;font-weight:700;margin-top:22px}}
h1 em{{font-style:normal;color:#3ddc97}}
.rows{{margin-top:auto;display:grid;gap:16px}}
.r{{display:grid;grid-template-columns:220px 1fr 130px 110px 150px;align-items:center;gap:24px}}
.r.h{{font:600 18px/1 "Cascadia Mono",Consolas,monospace;color:#6b7480;letter-spacing:.04em}}
.r.h div:nth-child(n+3){{text-align:right}}
.n{{font-size:30px;font-weight:600}}
.t{{height:28px;background:#1b1f25;border-radius:6px;overflow:hidden}}
.t span{{display:block;height:100%;border-radius:6px;background:currentColor}}
.v{{font:700 38px/1 "Cascadia Mono",Consolas,monospace;font-variant-numeric:tabular-nums;color:#e8eaed;white-space:nowrap;text-align:right}}
.v.s{{font-size:32px;color:#c3c9d1}}
.v small{{font-size:20px;margin-left:4px;color:#6b7480}}
.t-a{{color:#3ddc97}}.t-b{{color:#8ea7c4}}.t-c{{color:#c9a27a}}
.t-a .n,.t-a .v{{color:#3ddc97}}
.foot{{margin-top:30px;display:flex;justify-content:space-between;font:500 19px/1 "Cascadia Mono",Consolas,monospace;color:#6b7480;white-space:nowrap;gap:32px}}
</style></head><body>
<div class="eyebrow">DEADLOCK GAMEINFO BENCHMARK · PRESENTMON</div>
<h1><em>Hantu's</em> ran {lead[SQ]:.0f}% faster than Sqooky<br>with the lowest latency of the three</h1>
<div class="rows"><div class="r h"><div></div><div></div><div>AVG FPS</div><div>1% LOW</div><div>LATENCY</div></div>{card_rows}</div>
<div class="foot"><span>8 × 300 s runs · client 6774 · latency: frame start → screen</span><span>hantu-raya.github.io/hantu-cnvar</span></div>
</body></html>"""
(HERE / "card.html").write_text(card, encoding="utf-8")

# ---- Sticky "on this page" sidebar with scroll progress (plain strings: no f-string brace doubling) ----
TOC = [("top", "Summary"), ("h-fps", "Average FPS"), ("h-pairs", "Back-to-back pairs"), ("h-found", "What was found"),
       ("h-catch", "Before you switch"), ("h-configs", "What was tested"), ("h-detail", "Details")]
TOC_NAV = ('<div class="topbar" aria-hidden="true"></div>\n<nav class="toc" aria-label="On this page">\n'
           '<div class="toc-pct" aria-hidden="true"><span id="toc-pct">0</span><small>%</small></div>\n'
           '<div class="toc-label">read</div>\n<div class="toc-list"><span class="toc-rail" aria-hidden="true"></span>'
           '<span class="toc-fill" aria-hidden="true"></span><ol>'
           + "".join(f'<li><a href="#{i}">{e(t)}</a></li>' for i, t in TOC) + "</ol></div>\n</nav>")
TOC_CSS = """
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
h2,#top{scroll-margin-top:24px}
.topbar{position:fixed;top:0;left:0;right:0;height:3px;z-index:10;background:var(--a);transform-origin:left;transform:scaleX(var(--p,0))}
.toc{display:none}
@media (min-width:1180px){
  .topbar{display:none}
  main{margin-left:max(232px,calc(50% - 440px))}
  .toc{display:block;position:fixed;top:56px;left:max(24px,calc(50% - 648px));width:184px;font-size:14px}
}
.toc-pct{font:650 34px/1 var(--mono);letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--fg)}
.toc-pct small{font-size:15px;font-weight:500;color:var(--mut);margin-left:2px}
.toc-label{font:500 11px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:6px 0 18px}
.toc-list{position:relative}
.toc-rail,.toc-fill{position:absolute;left:0;top:4px;bottom:4px;width:2px;border-radius:2px}
.toc-rail{background:var(--line)}
.toc-fill{background:var(--a);transform-origin:top;transform:scaleY(var(--p,0))}
.toc ol{list-style:none;margin:0;padding:0}
.toc a{display:block;padding:6px 0 6px 16px;color:var(--mut);text-decoration:none;line-height:1.35;transition:color .15s}
.toc a:hover{color:var(--fg)}
.toc li.done a{color:var(--fg)}
.toc a[aria-current]{color:var(--a);font-weight:600}
"""
TOC_JS = """(() => {
  "use strict";
  const root = document.documentElement;
  const pct = document.getElementById("toc-pct");
  const links = [...document.querySelectorAll(".toc a")];
  const targets = links.map((a) => document.getElementById(a.hash.slice(1)));
  let queued = false, lastN = -1, lastActive = -2;
  function update() {
    queued = false;
    const max = root.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
    root.style.setProperty("--p", p.toFixed(4));
    const n = Math.round(p * 100);
    if (n !== lastN) { lastN = n; pct.textContent = n; }
    let active = -1;
    const line = innerHeight * 0.3;
    targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= line) active = i; });
    if (p >= 0.999) active = targets.length - 1;
    if (active === lastActive) return;
    lastActive = active;
    links.forEach((a, i) => {
      a.parentElement.classList.toggle("done", i < active);
      if (i === active) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  document.querySelectorAll("details").forEach((d) => d.addEventListener("toggle", queue));
  update();
})();"""

doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(summary)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(summary)}">
<meta property="og:type" content="article">
<meta property="og:url" content="{SITE}">
<meta property="og:image" content="{SITE}{OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{e(card_alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}{OG_IMAGE}">
<link rel="icon" href="data:,">
<meta name="theme-color" content="#0e1013">
<style>
:root{{
  color-scheme:dark light;
  --bg:#0e1013;--panel:#15181d;--line:#262b33;--fg:#e8eaed;--mut:#9aa3ae;--faint:#5c6570;
  --a:#3ddc97;--b:#8ea7c4;--c:#c9a27a;--warn:#f2b155;--link:#8fb8ff;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"Cascadia Mono","SF Mono",Consolas,monospace;
}}
@media (prefers-color-scheme:light){{
  :root{{--bg:#f7f7f5;--panel:#fff;--line:#e2e2de;--fg:#16181b;--mut:#5b636d;--faint:#9aa1a9;
        --a:#0f9d63;--b:#5b7594;--c:#9c6f43;--warn:#a5650b;--link:#2559c7}}
}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 var(--sans);-webkit-font-smoothing:antialiased}}
main{{max-width:880px;margin:0 auto;padding:56px 24px 80px}}
a{{color:var(--link);text-underline-offset:2px}}
a:focus-visible,summary:focus-visible{{outline:2px solid var(--link);outline-offset:3px;border-radius:2px}}
code{{font:0.88em var(--mono);overflow-wrap:anywhere}}
small{{color:var(--mut)}}
.eyebrow{{font:500 13px/1.4 var(--mono);color:var(--mut);letter-spacing:.02em;margin:0 0 20px}}
h1{{font-size:clamp(28px,4.6vw,42px);line-height:1.15;letter-spacing:-.02em;font-weight:650;margin:0 0 18px;max-width:28ch}}
h1 em{{font-style:normal;color:var(--a)}}
.lede{{font-size:18px;color:var(--mut);max-width:62ch;margin:0}}
.update{{margin:22px 0 0;padding:12px 18px;max-width:62ch;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--a);border-radius:0 10px 10px 0;font-size:15px}}
.update b{{color:var(--fg)}}
h2{{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:64px 0 6px}}
h3{{font-size:18px;margin:40px 0 6px}}
.sub{{margin:0 0 20px;color:var(--mut);max-width:64ch}}
section>p{{max-width:68ch}}

.plot{{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px 20px 8px}}
.row{{display:grid;grid-template-columns:150px 1fr 120px;align-items:center;gap:16px;min-height:52px}}
.row+.row{{border-top:1px solid var(--line)}}
.row.axis{{border-top:0;min-height:32px}}
.name{{font-weight:600}}
.name small{{display:block;font-weight:400}}
.track{{position:relative;height:28px}}
.axis .track{{height:20px}}
.range{{position:absolute;top:50%;height:2px;margin-top:-1px;background:currentColor;opacity:.35}}
.dot{{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:currentColor;opacity:.55}}
.mean{{position:absolute;top:2px;bottom:2px;width:3px;margin-left:-1.5px;border-radius:2px;background:currentColor}}
.bar{{position:absolute;top:6px;bottom:6px;border-radius:4px 0 0 4px;background:currentColor;opacity:.8}}
.bar.pos{{border-radius:0 4px 4px 0}}
.pairs .track::after{{content:"";position:absolute;left:var(--zero);top:-6px;bottom:-6px;border-left:1px dashed var(--faint)}}
.axis .track::after{{display:none}}
.tick{{position:absolute;transform:translateX(-50%);font:12px var(--mono);color:var(--faint)}}
.unit{{font:12px var(--mono);color:var(--faint);padding-left:10px}}
.val{{font-variant-numeric:tabular-nums;line-height:1.25}}
.val b{{font:600 20px var(--mono);display:block}}
.val small{{font-size:13px}}
.t-a{{color:var(--a)}}.t-b{{color:var(--b)}}.t-c{{color:var(--c)}}
.row .name,.row .val b{{color:var(--fg)}}
.t-a .name,.t-a .val b{{color:var(--a)}}
.legend{{font-size:14px;color:var(--mut);margin:10px 2px 0}}
.legend i{{display:inline-block;vertical-align:middle;margin:0 6px 0 14px;background:var(--mut)}}
.legend i:first-child{{margin-left:0}}
.legend .ld{{width:10px;height:10px;border-radius:50%;opacity:.6}}
.legend .lm{{width:3px;height:14px;border-radius:2px}}

.caveat{{border-left:3px solid var(--warn);background:var(--panel);border-radius:0 10px 10px 0;padding:18px 22px;margin-top:20px}}
.caveat h3{{margin:0 0 6px;font-size:16px;color:var(--warn)}}
.caveat p{{margin:0}}
.added{{display:inline-block;vertical-align:2px;margin-left:8px;padding:1px 8px;border:1px solid var(--a);border-radius:999px;
  font:600 11px/1.4 var(--mono);letter-spacing:.04em;text-transform:uppercase;color:var(--a);white-space:nowrap}}
.nopm{{display:inline-block;vertical-align:3px;margin-left:10px;padding:2px 8px;border:1px solid var(--warn);border-radius:999px;
  font:600 11px/1.4 var(--mono);letter-spacing:.04em;text-transform:uppercase;color:var(--warn);white-space:nowrap}}
.nopm-note{{border-left:3px solid var(--warn);background:var(--panel);border-radius:0 10px 10px 0;padding:14px 18px;margin:14px 0 8px;font-size:15px;max-width:68ch}}
.nopm-note p{{margin:0}}
ul.limits{{padding-left:20px;max-width:68ch}}
ul.limits li{{margin:8px 0}}

.table-wrap{{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel)}}
table{{border-collapse:collapse;width:100%;font-size:14px}}
th,td{{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}}
tr:last-child>*{{border-bottom:0}}
thead th{{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--mut);white-space:nowrap}}
tbody th{{font-weight:600}}
tbody th.cfg{{white-space:nowrap}}
.num{{text-align:right;font:13.5px var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}}
.flag{{color:var(--warn)}}
.sw{{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;background:currentColor;vertical-align:1px}}
.sw.t-a{{color:var(--a)}}.sw.t-b{{color:var(--b)}}.sw.t-c{{color:var(--c)}}

details{{border-top:1px solid var(--line);padding:14px 0}}
details:last-of-type{{border-bottom:1px solid var(--line)}}
summary{{cursor:pointer;font-weight:600;list-style-position:outside;margin-left:18px}}
details[open] summary{{margin-bottom:14px}}
details p,details li{{max-width:70ch}}
footer{{margin-top:56px;font-size:13px;color:var(--faint)}}

@media (max-width:640px){{
  main{{padding-top:36px}}
  .row{{grid-template-columns:1fr auto;grid-template-areas:"name val" "track track";gap:4px 12px;padding:10px 0}}
  .row .name{{grid-area:name}}.row .val{{grid-area:val;text-align:right}}.row .track{{grid-area:track}}
  .row.axis{{grid-template-areas:"track track";padding-top:0}}
  .row.axis>div:first-child,.row.axis .unit{{display:none}}
  .val small{{display:none}}
}}
{TOC_CSS}
</style>
</head>
<body>
{TOC_NAV}
<main>
<header id="top">
<p class="eyebrow">Deadlock gameinfo benchmark · client 6774 · 2026-10-13</p>
<h1><em>Hantu's</em> gameinfo ran {lead[SQ]:.0f}% faster than Sqooky and tied kaizuchanerus' minimum spec.</h1>
<p class="lede">Hantu's averaged {sq_h:.1f} FPS to Sqooky's {sq_t:.1f}, and {kz_h:.1f} to kaizuchanerus' {kz_t:.1f}, on the same recorded match with the game restarted for every run
and no extra cfg on the public configs, so each ran as published.
Every frame was timed with PresentMon. kaizuchanerus keeps up by drawing less: with Hantu's object culling and draw distance it lost {-kz_cull_cost:.0f}%
(game frame counter, not PresentMon).</p>
<p class="update"><b>Correction:</b> the previous version said two Sqooky settings cost it 9%. That came from the game's own frame counter, which undercounts with those
settings on. Timed with PresentMon they change average FPS by only {sq_fix_gain:+.1f}%; they do make 1% lows and latency slightly worse. <a href="#h-found">Details</a></p>
</header>

<section aria-labelledby="h-fps">
<h2 id="h-fps">Average FPS</h2>
<p class="sub">Each dot is one 300-second run; the solid tick is the average. Higher is better. Hantu's has four runs, two from each set.</p>
{run_plot()}
<p class="legend"><i class="ld"></i>one run <i class="lm"></i>average</p>
<h3>Lows and latency</h3>
<p class="sub">From the same PresentMon captures, limited to the 300-second window. The 1% low is the frame rate at the slowest 1% of frames
(the 99th-percentile frame time); the 0.1% low is the same for the slowest 0.1%. Display latency is the time from the game starting a frame to it
reaching the screen. It does not include mouse or keyboard input, which a replay doesn't use.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Config</th><th scope="col" class="num">Avg FPS</th><th scope="col" class="num">1% low</th><th scope="col" class="num">0.1% low</th>
<th scope="col" class="num">Latency ms</th><th scope="col" class="num">P99 latency ms</th></tr></thead>
<tbody>{low_rows}</tbody></table></div>
<p class="legend">Higher FPS and lows are better; lower latency is better. 0.1% lows swing with single hitches (one run of each public config dropped to about 23–40), so read them loosely.</p>
</section>

<section aria-labelledby="h-pairs">
<h2 id="h-pairs">Back-to-back pairs</h2>
<p class="sub">Each run of a public config was paired with the Hantu's run next to it, which cancels slow drift such as heat or background load.
Bars show how many FPS the public config gained or lost in that pair.</p>
{pair_plot()}
<p class="legend">Both Sqooky pairs lost by a wide margin. The kaizuchanerus pairs are within the run-to-run noise of about 3%, so they count as a tie.</p>
</section>

<section aria-labelledby="h-found">
<h2 id="h-found">What was found</h2>
<div class="nopm-note"><p>{NOPM} Results marked like this were measured before PresentMon was added, with the game's own frame counter. For configs
without Sqooky's engine settings that counter matched PresentMon within {counter_gap:.1f}% on every run checked, and these comparisons stay within one config,
so the FPS changes should hold. They have <b>no 1% lows or latency</b>, and they were not re-run with PresentMon.</p></div>
<h3>kaizuchanerus keeps up by culling{NOPM}</h3>
<p class="sub">It sets <code>r_size_cull_threshold 1.6</code> (hides small objects at range, including breakables and golden statues) and <code>r_farz</code> /
<code>r_mapextents 4500</code> (a shorter draw distance). Switching those three to Hantu's values (0.9, 13999, 7000) dropped it from {mean(kz_cull):.1f} to
{mean(kz_ours_cull):.1f} FPS ({kz_cull_cost:+.1f}%, both pairs agreeing). Which of the three carries most of that was not split out.</p>

<h3>Sqooky's engine settings: no FPS cost, slightly worse lows and latency</h3>
<p class="sub">Sqooky sets <code>engine_accurate_input_processing_delta_time true</code> and <code>engine_max_ticks_to_simulate 2</code>
(plus <code>engine_low_latency_sleep_after_client_tick false</code>, which the tester's <code>auto.cfg</code> set back to true in every run, so it was not tested). Timed with PresentMon, removing them moved average FPS from
{mean(sq_before):.1f} to {mean(sq_after):.1f} ({sq_fix_gain:+.1f}%, within noise). The 1% low rose from {fix_low[0]:.1f} to {fix_low[1]:.1f} and display latency fell from
{fix_lat[0]:.1f} to {fix_lat[1]:.1f} ms (P99 {fix_lat99[0]:.1f} to {fix_lat99[1]:.1f}), consistent in both pairs.</p>
{fix_plot()}
<p class="legend">With these settings on, the game's own frame counter read {mean(sq_prof_before):.1f} FPS while PresentMon timed {mean(sq_before):.1f}. That gap produced
the earlier, wrong "9%" figure. Even without them Sqooky stays about {100 * (1 - mean(sq_after) / mean(fps[OURS])):.0f}% behind Hantu's.</p>

<h3>Lines the game ignores</h3>
<p class="sub">Both public configs set things the game never applies. They cost nothing, but they do not do what their comments say.</p>
<ul class="limits">
<li><b>Locked ConVars.</b> The game ignores <code>gameinfo.gi</code> lines for ConVars flagged <code>gameinfo_cannot_override</code>. Sqooky has 17, including
<code>lb_enable_lights</code> and <code>lb_enable_dynamic_lights</code>. kaizuchanerus has 34, including <code>r_shadows</code>, <code>r_directlighting</code> and <code>lb_enable_sunlight</code>.</li>
<li><b>Names that don't exist.</b> Sqooky sets 40 ConVars that client 6774 does not register, such as <code>mat_async_shader_load</code> and <code>panorama_max_fps</code>; kaizuchanerus sets 27.</li>
<li><b>Keys no DLL reads.</b> Sqooky's <code>WorldRenderer/Aggregate*</code>, <code>EnvironmentMapCacheSize</code>, <code>RenderSystem/GraphicsPipelineLibrary</code>,
<code>SceneSystem/EnableSunlight</code>, <code>ShadowDepthBuffer</code> and <code>Particles/EnableMixedResolution</code> are never read as settings: the names appear only as internal resource labels, or nowhere in the game's DLLs.</li>
<li><b>One adds latency.</b> Sqooky's <code>snd_mixahead 0.05</code> buffers 50 ms of audio; the default is 1 ms.</li>
</ul>

<h3>Mesh buffer pools: +{mesh_gain:.1f}% for Hantu's{NOPM}</h3>
<p class="sub">Hantu's gameinfo already reserved index and vertex buffer pools, but the game's mesh code only uses them when two
<code>MeshSystem</code> flags are on, and they are off by default. Turning on <code>UseIndexBufferPool</code> and <code>UseVertexBufferPool</code> cut vertex buffers
from about 5,670 to about 440 and used about 760 MB more video memory. All four back-to-back pairs favoured it ({", ".join(f"{d:+.1f}" for d in mesh_pairs)} FPS).
The Hantu's runs above include it, so the PresentMon head-to-head already reflects it.</p>

<h3>Tried, no gain</h3>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Change to Hantu's</th><th scope="col" class="num">Change</th><th scope="col" class="num">Avg FPS</th>
<th scope="col" class="num">1% low</th><th scope="col" class="num">Latency</th><th scope="col" class="num">Pairs (FPS)</th></tr></thead>
<tbody>{no_gain_rows}</tbody></table></div>
<p class="legend">Timed with PresentMon. Each row is one back-to-back set: two 300-second runs of Hantu's config and two with the change (before → after).
Average FPS differences under about 3% are noise, and 1% lows moved by up to about 4 FPS between runs of the same config. The sleep-after-tick row
compares two identical setups: the tester's <code>auto.cfg</code> already set it to true in every run, so its {sleep_gain:+.1f}% is run-to-run noise.</p>
<p class="sub" style="margin-top:14px">Added to Hantu's config after these tests: <code>{added_names[0]}</code>. It did not move FPS or latency outside the
noise and is included in the head-to-head above. <code>GpuLightBinner 0</code> was tried as well and taken back out: it swaps in an empty light binner,
so the map renders without its dynamic lights.</p>
<p class="sub"><code>SceneSystem/RenderMeshlets 1</code> was not benchmarked: on DX11 the game fails to create vertex buffers with it on, so models would be missing.</p>
</section>

<section aria-labelledby="h-catch">
<h2 id="h-catch">Before you switch</h2>
<div class="caveat">
<h3>The configs do not look the same</h3>
<p>Hantu's turns off direct lighting, the skybox, fog and decals and caps textures at 128. kaizuchanerus sets <code>r_size_cull_threshold 1.6</code>, which hides
breakables and golden statues at range, and a 4,500-unit draw distance. Part of each lead comes from drawing less, so compare the visuals as well as the numbers.</p>
</div>
<ul class="limits">
<li>Hantu's was tested with its <code>perf_r3.cfg</code>. Some of its lines only apply with a cvar-unhide DLL in <code>citadel/addons</code>. The gameinfo alone ran at {gi_only:.1f} FPS
in the same test setup {NOPM}.</li>
<li>The public configs were tested with their <code>gameinfo.gi</code> only. Lines the game ignores (locked ConVars) were left out, which changes nothing. Sqooky's addon pak and <code>base_convars.txt</code> were not installed.</li>
<li>The head-to-head and the last three "Tried, no gain" rows ran without the tester's <code>auto.cfg</code> (moved aside for those sets; every Hantu's run read back
its own values), so each config ran as written. The other findings were measured with it: its {AUTO_CFG["settings"]} settings ran after the gameinfo and replaced {AUTO_CFG["ours"]} of
Hantu's lines, {AUTO_CFG["sq"]} of Sqooky's and {AUTO_CFG["kz"]} of kaizuchanerus', the same values on both sides of each comparison.</li>
<li>Two pairs per public config is a small sample. A 3% difference is about the smallest this design can resolve.</li>
<li>The scene is a CPU-bound spectator replay. Live matches add server and input work, and the latency figures exclude input.</li>
</ul>
</section>

<section aria-labelledby="h-configs">
<h2 id="h-configs">What was tested</h2>
<p class="sub">Both public configs were checked against the latest <code>main</code> commit on the day of the run. CompyLock, compared in the previous round, is no longer tracked.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Config</th><th scope="col">Source</th><th scope="col" class="num">Avg FPS</th><th scope="col" class="num">Range</th><th scope="col" class="num">CPU cores</th></tr></thead>
<tbody>{config_rows}</tbody></table></div>
</section>

<section aria-labelledby="h-detail">
<h2 id="h-detail">Details</h2>
<details>
<summary>Every run</summary>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Set</th><th scope="col" class="num">#</th><th scope="col">Config</th><th scope="col" class="num">FPS</th><th scope="col" class="num">1% low</th>
<th scope="col" class="num">0.1% low</th><th scope="col" class="num">Latency ms</th><th scope="col" class="num">Frames</th><th scope="col" class="num">Game counter FPS</th>
<th scope="col" class="num">CPU cores</th></tr></thead>
<tbody>{run_rows}</tbody></table></div>
<p><small>FPS, lows, latency and frames are from PresentMon. * With Sqooky's engine settings the game's own counter undercounts frames, so its figure is wrong.</small></p>
</details>
<details>
<summary>Earlier fix (2026-10-12) {NOPM}</summary>
<p>The previous round found three settings in Hantu's own config that switched off parts of the game's parallel processing. Putting them back to stock raised it from
{mean(old_before):.1f} to {mean(old_after):.1f} FPS (+{old_gain:.1f}%). That fix is part of the Hantu's config tested above. Measured the previous day with the game's
frame counter on Hantu's config only, which counts correctly there; no lows or latency.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Setting</th><th scope="col" class="num">Cost</th><th scope="col" class="num">Was</th><th scope="col" class="num">Now</th></tr></thead>
<tbody>{toggle_rows}</tbody></table></div>
</details>
<details>
<summary>How it was measured</summary>
<ul>
<li>Demo 110239551 from tick 138245, 300 seconds per run, 1600×900 windowed, same installed mods for every run.</li>
<li>Sets of four runs in ABBA order (one confirmation set in BAAB). Each run closed the game, installed that config's <code>gameinfo.gi</code>, relaunched and drove the replay over the developer console.</li>
<li>For the public configs an empty <code>perf_r3.cfg</code> replaced Hantu's, so none of its settings applied.</li>
<li>FPS = PresentMon frames ÷ the sum of their frame times, for frames the game started inside the 300-second window (PresentMon 2.6.0, game process only).
CPU = process CPU time ÷ wall-clock seconds, where 1.0 is one fully busy logical core.</li>
<li>The original <code>gameinfo.gi</code> and <code>perf_r3.cfg</code> were restored and checksum-verified after each set.</li>
</ul>
</details>
</section>

<footer>Raw data: <code>{e(SETS[0][1])}</code>, <code>{e(SETS[1][1])}</code>, <code>{e(SQ_FIX)}</code>, <code>{e(KZ_CULL)}</code>, <code>{e(MESH[0])}</code>, <code>{e(MESH[1])}</code>.</footer>
</main>
<script>{TOC_JS}</script>
</body>
</html>
"""
missing = [i for i, _ in TOC if f'id="{i}"' not in doc]
assert not missing, f"sidebar links to missing ids: {missing}"
(HERE / "benchmark_3way.html").write_text(doc, encoding="utf-8")
print("wrote", HERE / "benchmark_3way.html", len(doc), "bytes")
