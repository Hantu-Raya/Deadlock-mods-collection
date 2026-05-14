# Deadlock ETW Convar Waves - 2026-05-13

Purpose: test one convar wave at a time with PerfView ETW so we can pick changes
that actually reduce CPU pressure or improve 1% lows.

## Rules

- One wave per trace. Do not stack waves until a winner is proven.
- Keep the same map, hero, camera route, fight pattern, launch options, and trace
  duration as much as possible.
- For frame time in ms, lower is better.
- Judge the clean gameplay window first. Ignore first-load and trace-stop bins
  unless the stutter was manually observed there.
- Keep `cloth_update "1"`.
- Keep all `panorama_worldpanel_update_cull*` commands removed.
- Do not treat lower game CPU cores alone as a win if P99/P95 gets worse.

## Files

- `waves.json`: ranked wave definitions.
- `cfg/*.cfg`: runtime probe cfgs. These set/query the wave convars in console.
- `gameinfo-snippets/*.kv`: paste-ready gameinfo snippets for each wave.
- `Apply-EtwWave.ps1`: guarded applier for the live `gameinfo.gi`.
- `Analyze-EtwWave.ps1`: extracts and summarizes a new `PerfViewData.etl.zip`.

## How To Run A Wave

From PowerShell in the repo:

```powershell
$waveRoot = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\fps\etw_waves_2026-05-13"
& "$waveRoot\Apply-EtwWave.ps1" -List
& "$waveRoot\Apply-EtwWave.ps1" -Wave W01_particle_threshold_1200
```

Then restart Deadlock, run the same in-game route, collect PerfView, and analyze:

```powershell
& "$waveRoot\Analyze-EtwWave.ps1" -RunId W01_particle_threshold_1200
```

The analyzer writes:

```text
fps\etw_waves_2026-05-13\results\<RunId>\summary.json
fps\etw_waves_2026-05-13\results\<RunId>\summary.md
```

It also extracts the ETL/ETLX payload into that run folder. After confirming the
summary is good, you can delete the large `PerfViewData.etl` and
`PerfViewData.etlx` files from that run folder if you only need the summary.

To return to the current baseline and remove the managed wave block:

```powershell
& "$waveRoot\Apply-EtwWave.ps1" -Clear
```

## Stickiness Check

After launching a wave, open VConsole and run the matching probe:

```text
exec etw_W01_particle_threshold_1200
```

The probe sets the convar again and then queries it by name. If the console says
`unknown command`, `not found`, or prints the old value, mark that convar as not
sticking. If it prints the target value, it probably sticks for that session.

For development/defensive convars, trust `gameinfo.gi` plus a full restart more
than runtime `exec`. Some cvars are launch-time only.

## Wave Order

1. `W00_current_baseline`: clear managed wave block and capture control.
2. `W01_particle_threshold_1200`: test strict P99 concern against current 999.
3. `W02_particle_threshold_1600`: prior live value, only if 999 vs 1200 is mixed.
4. `W03_tempent_collision_1000`: temp-entity collision from 999999 to 1000.
5. `W04_break_pieces_zero`: breakable piece cap from 0.5 to 0.
6. `W05_particles_render_only_frames`: particle render-only frame behavior.
7. `W06_ui_audio_nonpositional`: only if audio CPU appears.
8. `W07_audio_occlusion_rays_zero`: only if audio CPU appears.
9. `W08_thread_pool_option_6`: compare against current measured-good `4`.
10. `W09_particle_threshold_800`: more aggressive GPU-headroom particle test.
11. `W10_texture_pool_512`: only if texture pop-in/stream hitches appear.

Agent pass note: the helper agent ranked `cl_fasttempentcollision "1000"` as the
strongest next CPU A/B after the particle-threshold question. It also suggested
`thread_pool_option "6"`, `r_particle_max_size_cull "800"`, and
`r_texture_pool_size "512"` as optional later waves. Those are included as W08
through W10.

## Keep/Reject Criteria

Keep a wave only when most of these improve or stay flat:

- Clean-window P99 and P95 frame time.
- Clean-window max frame time.
- Average game CPU cores for similar trace length/workload.
- Top sampled modules for the targeted subsystem.
- No increase in `SimulationTicks=2` bursts.
- No gameplay/visual/audio regression.

Reject a wave if P99 worsens by more than normal noise, if the target subsystem
does not improve, or if the convar does not stick.
