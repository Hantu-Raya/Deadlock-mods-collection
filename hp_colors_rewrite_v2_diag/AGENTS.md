# HPv2 diagnostic lane — never ship

Opt-in callback/message attribution for the normal HP Colors Rewrite v2 runtime.
Only the probe lives here. The wrapper copies canonical source into an isolated
stage, runs its usual Closure/validators, then injects the unminified probe first
in the world, relay, topbar and Escape layouts. Never edit canonical Panorama
files to enable diagnostics, distribute this VPK, or load it beside normal pak02.

```powershell
# Local build only; does not deploy or overwrite the clean build output.
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1 -Diagnostics
# ONLY after an explicit request to install diagnostics: backs up/replaces installed pak02.
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1 -Diagnostics -DeployDiagnostics
node --test scripts/validate-hp-colors-rewrite-v2-diag.test.js
node scripts/hpv2-diag-report.js "G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/console.log" --json .tmp/hpv2-diag.json --label D
```

Output: `pak02_dir.hpv2diag.vpk`, with separate diagnostic compiled/staging trees.
Fully restart Deadlock after an authorized install. Follow the
[10-minute test](../docs/2026-10-03-hp-colors-v2-lag-investigation.md#10-minute-in-game-test),
retain the capture and installed hashes, then explicitly restore a clean build.
Use clean builds for frame-time comparisons: the observer adds overhead.

`[HPV2DIAG] v1` records use integer `Date.now()` milliseconds and preceding-window
counts. Compact rows: `c=[owner,count,totalMs,maxMs,spikes>=4ms]`,
`m=[rx|tx,magic,count,UTF8bytes]`, `u=sampled distinct ultimate at`,
`uo=unretained ultimate observations/values`, `h=10 scan-phase buckets`,
`cut=line compaction count`. Eight callback owners and four message keys are kept
plus `<other>` aggregates; at most eight `at` values are retained. Reports stay
within 900 characters, first at 60–61 s, then every 60 s via original APIs.
Owners are delay-based, not mangled function names; menu 1 s identity/replay work
cannot be distinguished. Distinct reporting contexts are not a live census;
sampled ultimate deliveries are lower bounds, not listener-delivery counts.

VM/parser tests and successful packaging do not verify in-game behavior or FPS.
