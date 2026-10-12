"""Build benchmark_3way.html from the two harness3 run folders (stdlib only).

Page order follows the reader's questions: who is fastest and by how much (headline +
run plot), is it consistent (paired restarts), what is the catch (caveats), what was
tested (configs), and the raw evidence (collapsed run table and method).
"""
import html, json, statistics
from pathlib import Path

import os
REPO = Path(__file__).resolve().parents[2]
# Page + card output (site/ is a separate git repo pushed to hantu-raya.github.io/hantu-cnvar).
HERE = Path(os.environ.get("GAMEINFO_PAGE_OUT") or REPO / ".scratch/gameinfo_opt/r5_3way_20261012")
# Folder holding the runs-* directories this page cites.
BENCH = Path(os.environ.get("GAMEINFO_PAGE_RUNS") or REPO / ".scratch/gameinfo_opt/r3_20261011/bench")
OURS = "Hantu's"
SETS = [("Sqooky 3.5.1", "runs-20261012_135232_597622"), ("CompyLock", "runs-20261012_141613_574256")]
ARMS = [OURS, "Sqooky 3.5.1", "CompyLock"]
TONE = {OURS: "a", "Sqooky 3.5.1": "b", "CompyLock": "c"}
SOURCES = {
    OURS: ("Installed <code>gameinfo.gi</code> + <code>perf_r3.cfg</code>", "md5 c9281b77"),
    "Sqooky 3.5.1": ('<a href="https://github.com/Sqooky/OptimizationLock/tree/7d560c50cc172f90f431a35c21823e04d4bd66d2">Sqooky/OptimizationLock</a>, "Sqooky\'s .gi"',
                     "main @ 7d560c5, 2026-10-11"),
    "CompyLock": ('<a href="https://github.com/7liv/compylock/tree/e69ac8a7a7065af4d507dc2a2e488ff03f1be286">7liv/compylock</a>',
                  "main @ e69ac8a, 2026-10-10"),
}
AXIS = (80, 110)        # FPS axis of the run plot
DIFF = (-20, 0)         # FPS axis of the paired-difference plot

runs, pairs = [], []    # runs: (set name, index, arm, record); pairs: (opponent, n, ours fps, their fps)
for other, folder in SETS:
    doc = json.loads((BENCH / folder / "results.json").read_text(encoding="utf-8"))
    assert doc["restored"] and not doc.get("restore_errors"), folder
    recs = doc["runs"]
    assert [r["label"] for r in recs] == list("ABBA") and all(r["valid"] for r in recs), folder
    for i, r in enumerate(recs, 1):
        runs.append((other, i, OURS if r["label"] == "A" else other, r))
    for n, (a, b) in enumerate(((recs[0], recs[1]), (recs[3], recs[2])), 1):
        pairs.append((other, n, a["fps"], b["fps"]))

mean = statistics.fmean
fps = {a: [r["fps"] for _, _, arm, r in runs if arm == a] for a in ARMS}
cpu = {a: [r["cpu_cores"] for _, _, arm, r in runs if arm == a] for a in ARMS}
base = mean(fps[OURS])
lead = {a: 100 * (base / mean(fps[a]) - 1) for a in ARMS[1:]}
assert min(fps[OURS]) > max(v for a in ARMS[1:] for v in fps[a]), "headline claims full separation"
assert all(b < a for _, _, a, b in pairs), "headline claims every pair favours Hantu's"
assert all(AXIS[0] <= v <= AXIS[1] for a in ARMS for v in fps[a])
assert all(DIFF[0] <= b - a <= DIFF[1] for _, _, a, b in pairs)
e = html.escape
pct = lambda v, lo, hi: f"{100 * (v - lo) / (hi - lo):.2f}%"


def run_plot():
    ticks = "".join(f'<span class="tick" style="left:{pct(t, *AXIS)}">{t}</span>' for t in range(AXIS[0], AXIS[1] + 1, 5))
    rows = []
    for a in ARMS:
        dots = "".join(f'<span class="dot" style="left:{pct(v, *AXIS)}" title="{v:.1f} FPS"></span>' for v in fps[a])
        gap = "fastest" if a == OURS else f"Hantu's +{lead[a]:.1f}%"
        rows.append(
            f'<div class="row t-{TONE[a]}"><div class="name">{e(a)}</div>'
            f'<div class="track"><span class="range" style="left:{pct(min(fps[a]), *AXIS)};width:calc({pct(max(fps[a]), *AXIS)} - {pct(min(fps[a]), *AXIS)})"></span>'
            f'{dots}<span class="mean" style="left:{pct(mean(fps[a]), *AXIS)}"></span></div>'
            f'<div class="val"><b>{mean(fps[a]):.1f}</b><small>{gap}</small></div></div>')
    return (f'<div class="plot" role="img" aria-label="Average FPS: '
            + "; ".join(f"{a} {mean(fps[a]):.1f}" for a in ARMS)
            + f'">{"".join(rows)}<div class="row axis" aria-hidden="true"><div></div><div class="track">{ticks}</div><div class="unit">FPS</div></div></div>')


def pair_plot():
    ticks = "".join(f'<span class="tick" style="left:{pct(t, *DIFF)}">{t:+d}</span>'.replace("+0", "0") for t in range(DIFF[0], DIFF[1] + 1, 5))
    rows = []
    for other, n, a, b in pairs:
        d = b - a
        rows.append(
            f'<div class="row t-{TONE[other]}"><div class="name">vs {e(other)} <small>pair {n}</small></div>'
            f'<div class="track"><span class="bar" style="left:{pct(d, *DIFF)};right:0"></span></div>'
            f'<div class="val"><b>{d:+.1f}</b><small>{b:.1f} vs {a:.1f}</small></div></div>')
    return (f'<div class="plot pairs" role="img" aria-label="Their FPS minus Hantu\'s in each back-to-back pair: '
            + "; ".join(f"{o} pair {n} {b - a:+.1f}" for o, n, a, b in pairs)
            + f'">{"".join(rows)}<div class="row axis" aria-hidden="true"><div></div><div class="track">{ticks}</div><div class="unit">FPS</div></div></div>')


config_rows = "".join(
    f'<tr><th scope="row"><span class="sw t-{TONE[a]}"></span>{e(a)}</th><td>{SOURCES[a][0]}<br><small>{SOURCES[a][1]}</small></td>'
    f'<td class="num">{mean(fps[a]):.1f}</td><td class="num">{min(fps[a]):.1f}–{max(fps[a]):.1f}</td><td class="num">{mean(cpu[a]):.2f}</td></tr>'
    for a in ARMS)

run_rows = "".join(
    f'<tr><td>vs {e(s) if arm == OURS else e(arm)}</td><td class="num">{i}</td><th scope="row"><span class="sw t-{TONE[arm]}"></span>{e(arm)}</th>'
    f'<td class="num">{r["fps"]:.1f}</td><td class="num">{r["present_n"]:,}</td><td class="num">{r["frame_n"]:,}</td>'
    f'<td class="num{" flag" if r["doubled_frame_count"] else ""}">{r["frame_to_present_ratio"]:.2f}</td>'
    f'<td class="num">{r["cpu_cores"]:.2f}</td><td class="num">{r["frame_active_p99_ms"]:.2f}{"*" if r["doubled_frame_count"] else ""}</td></tr>'
    for s, i, arm, r in runs)

# ---- Follow-up: ablation of Hantu's own config (same harness, demo and window) ----
def load(folder):
    doc = json.loads((BENCH / folder / "results.json").read_text(encoding="utf-8"))
    assert doc["restored"] and not doc.get("restore_errors") and all(r["valid"] for r in doc["runs"]), folder
    assert all(abs(r["frame_to_present_ratio"] - 1) < 0.05 for r in doc["runs"]), folder
    side = lambda lab: [r["fps"] for r in doc["runs"] if r["label"] == lab]
    return side("A"), side("B")

FIX_RUN = "runs-20261012_151306_471929"            # A = Hantu's as benchmarked above, B = three toggles back to stock
before_fps, after_fps = load(FIX_RUN)
fix_gain = 100 * (mean(after_fps) / mean(before_fps) - 1)
assert min(after_fps) > max(before_fps), "update claims every fixed run beat every old run"
TOGGLES = [  # (setting, old value, stock value, folder: A = fixed config, B = this one setting broken again)
    ("iv_parallel_restore", "0", "1", "runs-20261012_161216_972876"),
    ("animgraph_parallel_postdataupdate", "false", "true (default)", "runs-20261012_162401_449112"),
    ("cl_interp_parallel", "0", "1", "runs-20261012_160036_701587"),
]
toggle_rows, toggle_costs = [], []
for name, old, new, folder in TOGGLES:
    fixed, broken = load(folder)
    cost = 100 * (mean(broken) / mean(fixed) - 1)
    assert cost < 0, name
    toggle_costs.append(cost)
    toggle_rows.append(f'<tr><th scope="row"><code>{name}</code></th><td class="num flag">{cost:+.1f}%</td><td class="num">{old}</td><td class="num">{new}</td>'
                       f'<td class="num">{mean(fixed):.1f}</td><td class="num">{mean(broken):.1f}</td></tr>')
toggle_rows = "".join(toggle_rows)
UAXIS = (95, 115)
assert all(UAXIS[0] <= v <= UAXIS[1] for v in before_fps + after_fps)


def update_plot():
    ticks = "".join(f'<span class="tick" style="left:{pct(t, *UAXIS)}">{t}</span>' for t in range(UAXIS[0], UAXIS[1] + 1, 5))
    rows = []
    for label, vals, tone, note in (("Before fix", before_fps, "b", "original"), ("After fix", after_fps, "a", f"+{fix_gain:.1f}%")):
        dots = "".join(f'<span class="dot" style="left:{pct(v, *UAXIS)}" title="{v:.1f} FPS"></span>' for v in vals)
        rows.append(f'<div class="row t-{tone}"><div class="name">{label}</div><div class="track">'
                    f'<span class="range" style="left:{pct(min(vals), *UAXIS)};width:calc({pct(max(vals), *UAXIS)} - {pct(min(vals), *UAXIS)})"></span>'
                    f'{dots}<span class="mean" style="left:{pct(mean(vals), *UAXIS)}"></span></div>'
                    f'<div class="val"><b>{mean(vals):.1f}</b><small>{note}</small></div></div>')
    return (f'<div class="plot" role="img" aria-label="Hantu\'s FPS before fix {mean(before_fps):.1f}, after fix {mean(after_fps):.1f}">'
            + "".join(rows) + f'<div class="row axis" aria-hidden="true"><div></div><div class="track">{ticks}</div><div class="unit">FPS</div></div></div>')

title = f"Hantu's gameinfo vs Sqooky vs CompyLock: Deadlock FPS benchmark"
summary = (f"Hantu's averaged {base:.1f} FPS, {lead['Sqooky 3.5.1']:.1f}% more than Sqooky 3.5.1 "
           f"and {lead['CompyLock']:.1f}% more than CompyLock, on the same recorded match.")

SITE = "https://hantu-raya.github.io/hantu-cnvar/"
card_alt = "Average FPS: " + ", ".join(f"{a} {mean(fps[a]):.1f}" for a in ARMS) + ". Deadlock gameinfo benchmark, client 6774."

card_rows = "".join(
    f'<div class="r t-{TONE[a]}"><div class="n">{e(a)}</div>'
    f'<div class="t"><span style="width:{100 * mean(fps[a]) / 110:.2f}%"></span></div>'
    f'<div class="v">{mean(fps[a]):.1f}</div></div>'
    for a in ARMS)

card = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0}}
html,body{{width:1200px;height:630px;overflow:hidden}}
body{{background:#0e1013;color:#e8eaed;font-family:system-ui,"Segoe UI",sans-serif;padding:64px 72px;display:flex;flex-direction:column}}
.eyebrow{{font:600 22px/1 "Cascadia Mono",Consolas,monospace;color:#9aa3ae;letter-spacing:.04em}}
h1{{font-size:60px;line-height:1.08;letter-spacing:-.02em;font-weight:700;margin-top:22px}}
h1 em{{font-style:normal;color:#3ddc97}}
.rows{{margin-top:auto;display:grid;gap:18px}}
.r{{display:grid;grid-template-columns:240px 1fr 140px;align-items:center;gap:28px}}
.n{{font-size:30px;font-weight:600}}
.t{{height:30px;background:#1b1f25;border-radius:6px;overflow:hidden}}
.t span{{display:block;height:100%;border-radius:6px;background:currentColor}}
.v{{font:700 40px/1 "Cascadia Mono",Consolas,monospace;font-variant-numeric:tabular-nums;color:#e8eaed;white-space:nowrap}}
.v small{{font-size:24px;font-weight:600;color:#9aa3ae;margin-left:12px}}
.t-a{{color:#3ddc97}}.t-b{{color:#8ea7c4}}.t-c{{color:#c9a27a}}
.t-a .n,.t-a .v{{color:#3ddc97}}
.foot{{margin-top:34px;display:flex;justify-content:space-between;font:500 20px/1 "Cascadia Mono",Consolas,monospace;color:#6b7480;white-space:nowrap;gap:32px}}
</style></head><body>
<div class="eyebrow">DEADLOCK GAMEINFO BENCHMARK · AVG FPS</div>
<h1><em>Hantu's</em> ran {lead['Sqooky 3.5.1']:.0f}% faster than Sqooky<br>and {lead['CompyLock']:.0f}% faster than CompyLock</h1>
<div class="rows">{card_rows}</div>
<div class="foot"><span>same replay · 8 × 300 s runs · client 6774</span><span>hantu-raya.github.io/hantu-cnvar</span></div>
</body></html>"""
(HERE / "card.html").write_text(card, encoding="utf-8")

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
<meta property="og:image" content="{SITE}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{e(card_alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}og.png">
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
code{{font:0.88em var(--mono)}}
small{{color:var(--mut)}}
.eyebrow{{font:500 13px/1.4 var(--mono);color:var(--mut);letter-spacing:.02em;margin:0 0 20px}}
h1{{font-size:clamp(28px,4.6vw,42px);line-height:1.15;letter-spacing:-.02em;font-weight:650;margin:0 0 18px;max-width:28ch}}
h1 em{{font-style:normal;color:var(--a)}}
.lede{{font-size:18px;color:var(--mut);max-width:62ch;margin:0}}
.update{{margin:22px 0 0;padding:12px 18px;max-width:62ch;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--a);border-radius:0 10px 10px 0;font-size:15px}}
.update b{{color:var(--fg)}}
h2{{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:64px 0 6px}}
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
.pairs .track::after{{content:"";position:absolute;right:0;top:-6px;bottom:-6px;border-right:1px dashed var(--faint)}}
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
ul.limits{{padding-left:20px;max-width:68ch}}
ul.limits li{{margin:8px 0}}

.table-wrap{{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel)}}
table{{border-collapse:collapse;width:100%;font-size:14px}}
th,td{{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}}
tr:last-child>*{{border-bottom:0}}
thead th{{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--mut);white-space:nowrap}}
tbody th{{font-weight:600;white-space:nowrap}}
tbody td:first-child{{white-space:nowrap}}
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
</style>
</head>
<body>
<main>
<header>
<p class="eyebrow">Deadlock gameinfo benchmark · client 6774 · 2026-10-12</p>
<h1><em>Hantu's</em> gameinfo ran {lead['Sqooky 3.5.1']:.0f}% faster than Sqooky and {lead['CompyLock']:.0f}% faster than CompyLock.</h1>
<p class="lede">{base:.1f} FPS against {mean(fps['Sqooky 3.5.1']):.1f} and {mean(fps['CompyLock']):.1f}, on the same recorded match with the game restarted for every run.
All four Hantu's runs beat all four of the others.</p>
<p class="update"><b>Update:</b> a follow-up found three settings in Hantu's own config that were costing about {fix_gain:.0f}%.
With them fixed it averaged <b>{mean(after_fps):.1f} FPS</b> on the same replay. <a href="#h-update">See the fix</a></p>
</header>

<section aria-labelledby="h-fps">
<h2 id="h-fps">Average FPS</h2>
<p class="sub">Each dot is one 300-second run; the solid tick is the average. Higher is better.</p>
{run_plot()}
<p class="legend"><i class="ld"></i>one run <i class="lm"></i>average</p>
</section>

<section aria-labelledby="h-pairs">
<h2 id="h-pairs">Back-to-back pairs</h2>
<p class="sub">Each competitor run was paired with the Hantu's run next to it, which cancels slow drift such as heat or background load.
Bars show how many FPS the competitor lost in that pair.</p>
{pair_plot()}
</section>

<section aria-labelledby="h-update">
<h2 id="h-update">Update: fixing Hantu's config</h2>
<p class="sub">Taking groups of settings out one at a time found three that turned off parts of the game's own parallel processing.
Putting them back to stock raised Hantu's from {mean(before_fps):.1f} to {mean(after_fps):.1f} FPS, and every fixed run beat every old one.</p>
{update_plot()}
<p class="sub" style="margin-top:28px">Each setting was then switched back to its old value on its own to measure its share. Together they cost about {-sum(toggle_costs):.1f}%, close to the combined gain.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Setting</th><th scope="col" class="num">Cost</th><th scope="col" class="num">Was</th><th scope="col" class="num">Now</th><th scope="col" class="num">FPS fixed</th><th scope="col" class="num">FPS with old value</th></tr></thead>
<tbody>{toggle_rows}</tbody></table></div>
<p class="legend">The fixed config was not re-run against Sqooky and CompyLock; the head-to-head numbers above are from the original runs. Each per-setting cost is a single pair of 300-second runs.
A later draw-distance change in Hantu's install (props 600, fade 100) has not been benchmarked.</p>
</section>

<section aria-labelledby="h-catch">
<h2 id="h-catch">Before you switch</h2>
<div class="caveat">
<h3>The configs do not look the same</h3>
<p>Hantu's turns off direct lighting, the skybox, fog and decals and caps textures at 128. Part of its lead comes from drawing less, so compare the visuals as well as the numbers.</p>
</div>
<ul class="limits">
<li>Hantu's was tested with its <code>perf_r3.cfg</code>. The other two were tested with their <code>gameinfo.gi</code> only; Sqooky's addon pak and <code>base_convars.txt</code> and CompyLock's VPKs and <code>video.txt</code> were not installed.</li>
<li>Two pairs per competitor is a small sample. The direction held in every pair, but the 95% confidence interval on each difference still includes zero.</li>
<li>Sqooky and CompyLock overlap (85.4–94.0 FPS) and cannot be ranked against each other.</li>
<li>The scene is a CPU-bound spectator replay. Live matches add server and input work.</li>
</ul>
</section>

<section aria-labelledby="h-configs">
<h2 id="h-configs">What was tested</h2>
<p class="sub">Both public configs were checked against their latest <code>main</code> commit on the day of the run.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Config</th><th scope="col">Source</th><th scope="col" class="num">Avg FPS</th><th scope="col" class="num">Range</th><th scope="col" class="num">CPU cores</th></tr></thead>
<tbody>{config_rows}</tbody></table></div>
</section>

<section aria-labelledby="h-detail">
<h2 id="h-detail">Details</h2>
<details>
<summary>Every run</summary>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Set</th><th scope="col" class="num">#</th><th scope="col">Config</th><th scope="col" class="num">FPS</th><th scope="col" class="num">FrameTotal frames</th><th scope="col" class="num">Summary frames</th><th scope="col" class="num">Ratio</th><th scope="col" class="num">CPU cores</th><th scope="col" class="num">P99 ms</th></tr></thead>
<tbody>{run_rows}</tbody></table></div>
<p><small>* Not comparable. Sqooky and CompyLock both set <code>engine_low_latency_sleep_after_client_tick false</code>,
<code>engine_accurate_input_processing_delta_time true</code> and <code>engine_max_ticks_to_simulate 2</code>. With those set, the profiler's summary logs about two frames
for every real one, which drags its frame-time percentiles down. FPS comes from the FrameTotal counter, which stayed at one per frame, so it is far less affected.</small></p>
</details>
<details>
<summary>How it was measured</summary>
<ul>
<li>Demo 110239551 from tick 138245, 300 seconds per run, 1600×900 windowed, same installed mods for every run.</li>
<li>Two sets in ABBA order: Hantu's, Sqooky, Sqooky, Hantu's; then the same with CompyLock. Each run closed the game, installed that config's <code>gameinfo.gi</code>, relaunched and drove the replay over the developer console.</li>
<li>For the competitor runs an empty <code>perf_r3.cfg</code> replaced Hantu's, so none of its settings applied.</li>
<li>FPS = frames counted by the profiler's FrameTotal row ÷ wall-clock seconds. Client 6774 no longer reports a Present counter, so this is a profiler count, not an independent present measurement. CPU = process CPU time ÷ wall-clock seconds, where 1.0 is one fully busy logical core.</li>
<li>The original <code>gameinfo.gi</code> and <code>perf_r3.cfg</code> were restored and checksum-verified after each set.</li>
</ul>
</details>
</section>

<footer>Raw data: <code>{e(SETS[0][1])}</code> and <code>{e(SETS[1][1])}</code>.</footer>
</main>
</body>
</html>
"""
(HERE / "benchmark_3way.html").write_text(doc, encoding="utf-8")
print("wrote", HERE / "benchmark_3way.html", len(doc), "bytes")
