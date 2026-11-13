# Gameinfo A/B benchmark tools

Python 3.12, Windows, standard library only. These scripts measure Deadlock `gameinfo.gi` +
`perf_r3.cfg` variants on a fixed demo with a full game restart per run. Run output, game
copies and working files stay in gitignored `.scratch/gameinfo_opt/`.

| Script | Purpose |
|---|---|
| `harness3.py` | Restarted A/B runs, effective-value dumps, paired statistics |
| `inventory.py` | Diff a gameinfo against stock → `inventory.json` |
| `build_variants.py` | Revert (`--revert`, `--batches`) or value (`--set`) variants of gi + cfg |
| `kv.py` | Span-preserving gameinfo parser used by the two scripts above |
| `make_html.py` | Builds the published 3-way page and preview card from cited run folders |

Checks after editing these scripts (from the repo root):

```powershell
uvx ruff check fps/gameinfo_bench                 # bug-finding rules, config in ruff.toml
cd fps/gameinfo_bench; py harness3.py --self-check   # offline parser/stats/launch-arg checks
```

Builder changes should reproduce existing variants byte for byte (compare against a prior
round's `variants/` with `cmp`) before any launch.

## Prerequisites

- Desktop `C:\Users\Administrator\Desktop\dead.bat` and `vcon.py`, and the cvar-unhide proxy at
  `game\citadel\addons\bin\win64\server.dll` (detailed VProfLite runs need `cvar_unhide`; see
  `.agents/skills/deadlock-launch-vconsole`). `--remove-addon-dll` (before `ab`/`dump`) instead moves it aside
  for the set, restores it SHA256-checked, and switches to the demo-end FPS metric.
- Gameinfo arms must not set `gameinfo_cannot_override` ConVars: the run refuses them (flags read
  from `--flags`, default `.scratch/rift_vdata/convars_latest.txt`). Put such settings in a cfg instead.
- Demo `citadel/addons/110239551.dem`. Each run plays from tick 138245 to the demo end (~483 s).
- Paths to the game are constants at the top of `harness3.py` (G:\SteamLibrary\…).

## Typical round

```powershell
$W = ".scratch\gameinfo_opt\<round>"          # working folder for this round
$G = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel"
Copy-Item "$G\gameinfo.gi" "$W\base.gi"; Copy-Item "$G\cfg\perf_r3.cfg" "$W\perf_r3.cfg"
# stock: SteamTracking/GameTracking-Deadlock game/citadel/gameinfo.gi -> $W\stock.gi
py fps\gameinfo_bench\inventory.py --base $W\base.gi --stock $W\stock.gi --out $W\inventory.json
$C = "--base $W\base.gi --cfg $W\perf_r3.cfg --stock $W\stock.gi --inventory $W\inventory.json --out $W\variants"
py fps\gameinfo_bench\build_variants.py $C.Split() --list
py fps\gameinfo_bench\build_variants.py $C.Split() --name S3 --revert cl_interp_parallel,iv_parallel_restore
py fps\gameinfo_bench\build_variants.py $C.Split() --name T_max --set ThreadPoolCoreTypeRequest=max_threads --set thread_pool_option=6

cd fps\gameinfo_bench
py harness3.py --self-check
py harness3.py --plan ab --a ..\..\$W\base.gi --a-cfg ..\..\$W\perf_r3.cfg --b ..\..\$W\variants\S3\gameinfo.gi --b-cfg ..\..\$W\variants\S3\perf_r3.cfg --order ABBA
py harness3.py ab   --a ... --a-cfg ... --b ... --b-cfg ... --order ABBA --secs 300 [--cvars names.txt]
py harness3.py --remove-addon-dll ab --a ... --b ... --order ABBA    # DLL-free mode, demo-end FPS
```

`--plan` writes nothing and starts nothing. A real `ab` run kills `deadlock.exe`, so make sure
nobody is playing. Runs land in `.scratch/gameinfo_opt/runs/runs-<timestamp>/`, which can be
overridden with `GAMEINFO_BENCH_RUNS`.

Comparing a public config against Hantu's: give the competitor arm an **empty**
`perf_r3.cfg` (same basename) so the `execifexists perf_r3` hook in auto.cfg applies nothing.

## What the harness does per run

Kill the game; with `--remove-addon-dll`, move the proxy DLL aside (once per set); install the arm's gameinfo;
rewrite the pinned files; install the arm's cfg under its basename; launch `dead.bat -windowed -res 1600x900
-vconsole -insecure +exec bench_r3 [+exec <cfg>]`; wait for VConsole and SIGNONSTATE_FULL; `cvar_unhide` (when
the proxy is installed); `exec <cfg>`; `playdemo`; wait for "Host activate: Playing Demo"; pause, seek, settle
6 s. **Detailed mode** (default, proxy installed): VProfLite report, resume, measure `--secs` (default 300),
pause, report. **DLL-free mode** (`--remove-addon-dll`): resume and play to the demo end. At the end of the set
it restores gameinfo (SHA256-checked), the proxy DLL if moved, every touched cfg and the pinned files. Check
`restored`, `addon_dll` and `restore_errors` in `results.json`.

**Pinned files.** The game saves archived ConVars on graceful exit. The harness snapshots
`machine_convars.vcfg`, `user_convars_0_slot0.vcfg` and `boot.vcfg` once and rewrites them
before every launch, so one arm cannot leak into the next. Consequence: removing an archived
key from a gameinfo arm does not revert it; the archived value still applies.

## Reading the numbers

- **PresentMon** (default; `--presentmon PATH`, `--no-presentmon`): Intel PresentMon 2.6.0 records every Present of the game
  during the window. `pm_fps`, `pm_low1_fps` / `pm_low01_fps` (1000 / P99 / P99.9 frame time), `pm_display_latency_avg_ms`
  (CPU frame start to screen, no input) and `pm_dropped_pct` are the metrics to judge on.
- Detailed mode: `fps` = end-minus-start **FrameTotal** sample count ÷ wall seconds (client 6774's VProfLite
  has no Present_RenderDevice row). `frame_to_present_ratio` 1.7–2.3 flags the doubled-frame artifact from the
  engine-loop trio (`engine_low_latency_sleep_after_client_tick false`, `engine_accurate_input_processing_delta_time
  true`, `engine_max_ticks_to_simulate 2`); percentiles are then not comparable. P99 and Avg columns are
  cumulative since demo activation, so they are weak evidence.
- DLL-free mode: `fps` = the engine's `[Demo] Demo playback finished ( N seconds, M render frames, X fps)` line
  from the seek to the demo end (~483 s; under 400 s is invalid). No frame-time percentiles.
- `cpu_cores` = process CPU seconds ÷ wall seconds (1.0 = one busy logical core);
  `globpool_workers` confirms the thread-pool size actually used.
- Differences are B − A per adjacent pair. Noise (detailed, 300 s runs): SD ≈ 1.1 FPS at ~102 FPS.
  One pair resolves ≈ 5% effects; ABBA (2 pairs) ≈ 3%; 1–2% effects need 5+ pairs. DLL-free mode noise is not
  yet re-estimated; on 2026-10-13 same-arm runs differed by 0.15 and 1.34 FPS.
- Developer-only cvars read back empty in `--cvars` unless the proxy is installed and `cvar_unhide` ran
  (installed perf_r3.cfg runs it).
- `--cvars names.txt` reads live values **inside the demo** after seeking. Every name must be
  registered or the run is invalid; check against a cvarlist first.
