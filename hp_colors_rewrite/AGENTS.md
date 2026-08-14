# Repository Guidelines

## Project Overview

`hp_colors_rewrite/` is a clean-room Panorama rewrite of HP Colors for Deadlock. The current v1 slice includes the ESC editor, confirmed section reset with guarded feedback, cached renderer, reversible visibility, feedback controls, fixed/gradient colors, target exclusions, positioning, ultimate-icon coloring, HP readout, health-pip visibility, enemy level tiers, CSS-driven enemy/ally low-HP pulse, a static enemy-player kill marker, transient Auto/Manual/Off hero identity with match lifecycle tracking, hero scopes, session preset application, and session repository management.

Do not add durable persistence, preset copy/bundle/import compatibility, or Anita compatibility until a focused slice requires them. `FEATURES.md` distinguishes implemented milestones from later compatibility goals.

Source-of-truth order:

1. Current user requirements and root `../AGENTS.md`.
2. Current stock layouts in `SteamTracking/GameTracking-Deadlock`.
3. `FEATURES.md` for milestone scope and observable behavior.
4. `design.md` for the approved ESC editor interaction and visual contract.
5. Module XML/JS/CSS for runtime behavior.
6. `../build_hp_colors_rewrite.ps1` for packaging and deployment.

## Questions are read-only

- A question is a request for an answer, not for changes. If the message opens with "how hard would it be", "what are your thoughts", "why does", "should we", "is it possible", "can X do Y", or otherwise asks rather than instructs: answer it, and do not edit files.
- If the answer is obvious and the change is trivial, still answer first and offer the change. Ask before making it.

## Architecture & Data Flow

```text
hud_escape_menu.xml
  -> hp_colors_menu.js + hp_colors_menu.css
  -> owns the session snapshot and functional controls
  -> publishes versioned base-to-overlay config changes

unit_status_overlay.xml
  -> healthbar_probe.js
  -> caches the latest snapshot per overlay context
  -> discovers, classifies, and styles local v1 bars
  -> logs transition-only telemetry
```

`hp_colors_menu.js` owns one hidden canonical base, ordered session-scoped snapshot rows, and a baked-before-user session preset repository. A deterministic resolver chooses the first matching Selected Heroes row, then the first All Heroes row, then the hidden base represented by baked Rewrite Default. User presets expose only All Heroes and Selected Heroes; legacy user Global records normalize to All Heroes without applying. Applying All/Selected preserves the hidden base and replaces the Current scope. Only the resolved effective snapshot is retained in the existing absolute-root config attribute and published through `ClientUI_FireOutput`; a separate menu-only root attribute retains base, scope rows, user presets, stable IDs, baked display-name overrides, hidden baked IDs, selection, pending identity match, and repository ordering. Effective-value equality gates revision increments and dispatch. While effective customization is enabled, the owner replays the unchanged cached snapshot at 1-second hot, 3-second warm, then 8-second idle intervals so late contexts receive it without full-tree rescans.

Hero identity is transient menu-owned metadata, not part of the healthbar settings snapshot. Auto detection reads only the generated `CitadelHudTopBarPlayer.LocalPlayer` card under `#TopBar`, maps the exact `.HeroName` retail text to a stable `hero_*` key, and requires two matching active-match samples. Blank, `#`, fuzzy, and unmapped values remain unknown. Manual Override uses one explicit stable key; Off clears effective identity and skips local-card scans. Identity/lifecycle state never enters `DEFAULTS`, HPCR2, Undo, the root snapshot publication, or unit-status contexts. Scope rows and preset records validate and deduplicate stable hero keys, normalize empty Selected rows to Off, and remain session-only. A Selected preset waits without live mutation until exact identity resolves; match applies once and mismatch rejects. On later exact identity transitions, the first matching saved Selected record in current session repository order replaces any stale Current row for that hero; otherwise the first saved All Heroes record restores the shared fallback. Leaving an active Selected scope without either automatically applies the baked `baked_default` record. Manual mutation cancels and suppresses a pending record for that resolving transition.

Preserve these authority rules:

- A bar belongs to the overlay context that discovered it.
- Replaced panel parts increment the local generation, clear render caches, and reapply the cached snapshot.
- `team_neutral` wins classification before `enemy` or `friend`; `team1`/`team2` never imply relation. Building and boss flags are classified independently from relation, and unknown teams retain the configured high color.
- The custom renderer writes fill/healing/delta and ultimate-icon `washColor`, bullet-shield `backgroundColor`, container opacity/width/height/transform, stock pip-label visibility, rewrite-owned level visibility/tier classes, namespaced pulse classes/duration, and rewrite-owned kill-marker visibility/position/width/color. It never writes engine-owned fill, feedback, shield widths, pip or level text, icon image, or icon visibility. The kill marker is restricted to visible enemy panels with the stock `player` class; allies, neutrals, non-player units, buildings, sentries, bosses, and boss barracks always clear it. Bypass and exclusions clear rewrite-owned state so stock CSS resumes.
- Hidden enemy and ally bar containers remain rendered at `opacity: 0.01` so the engine continues updating their widths; showing them writes `opacity: 1`. Never use `visibility: collapse` or zero opacity for this control.
- The owned HP counter uses the legacy non-displacing geometry: `WindowRoot` is `100%` wide and `fit-children` high; `UnitStatus` is a bottom-aligned, centered `fit-children` down-flow; and `InfoHealthContainer` is a bottom-aligned `fit-children` × `300px` right-flow. A narrow `1px` × `399px` in-flow extent immediately before `InfoHealthContainer` enlarges the world-panel render surface upward without changing horizontal flow or the bottom-anchored healthbar position. `hp_counter_anchor` is an ignored-flow `100%` × `100%` sibling of `InfoHealthContainer` directly under `UnitStatus`; it must not be nested inside the finite 300px health container. Runtime gives the single `hp_counter` label `height: 100%`, writes the requested font size, and translates the anchor with `translate3d`; never transform the label or add a wide horizontal canvas. Dynamic text tint uses `washColor`; never replace it with dynamic `color`. Portable placement limits remain ±405px horizontally, −35px upward, and 840px downward, with 500px as the vertical default. The addon never executes engine-setting commands or mutates external game files. `WindowRoot`, `UnitStatus`, `InfoHealthContainer`, `hp_counter_anchor`, and `hp_counter` retain `overflow: noclip`.
- Pip, level, and floored health-percentage diagnostics remain transition-only. Raw geometry changes inside the same displayed percentage must not emit another data line.
- Hero and lifecycle diagnostics remain transition-only. The watcher polls at one second while active or transitioning, five seconds in lobby/post-match, clears cached hero/clock panels on lifecycle changes, and generation-checks every scheduled callback.
- Precise-pip calculation changes only rewrite-owned parsing. The editor may copy the three required ConVars lines for manual placement in `gameinfo.gi`, but it must never mutate that file, execute console commands, or claim the configuration was applied or verified. Enabling shows the 10/10/10 values; disabling shows the 100/100/5 defaults and reminds users to delete custom entries if they will not use the feature.
- Low-HP pulse remains CSS-driven. JavaScript changes cached class membership and duration only on state/config transitions; it never animates brightness per frame.
- Removed bars are deleted from the local registry.

## Key Directories

- `panorama/layout/` — stock-derived v1 unit-status and ESC-menu overrides with only rewrite includes and panels added.
- `panorama/scripts/` — the local healthbar probe and ESC editor lifecycle runtime.
- `panorama/styles/` — the Ritual Stripe editor and entry styling.
- `../hp_colors_rewrite_compiled/` — generated `.vxml_c`/`.vjs_c`/`.vcss_c` output. Never edit it.
- `../scripts/` — shared Source 2 packaging helpers used by the root build wrapper.

Do not copy implementation from `../hp_colors/` or its validators. This rewrite intentionally starts from small seams rather than the old runtime.

## Development Commands

Build, pack, back up the existing addon, deploy, and verify the deployment hash:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite.ps1
```

The wrapper creates root `pak01_dir.vpk` and deploys it to:

```text
G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak01_dir.vpk
```

Focused automated regressions live under `../scripts/`; run the validators named in Testing & QA. Runtime verification still happens in Deadlock.

`pak01_dir.vpk` conflicts with other pak01 producers such as Poker and Qollite. The rewrite wrapper creates a timestamped backup before replacing the addon, but running another pak01 wrapper will still replace this mod.

## Code Conventions & Common Patterns

- Panorama JavaScript uses a strict IIFE, two-space indentation, `var`, `camelCase` functions/state, and `UPPER_SNAKE_CASE` protocol/timing constants.
- Use the Source 2 `$` global directly; there is no module loader, dependency injection container, Node runtime, or browser DOM. `GameUI` is not defined in unit-status script contexts—never depend on it.
- Use `$.Schedule` in seconds. Long-lived callbacks must stop when their context panel becomes invalid.
- Guard volatile panel methods with validity checks and narrow `try/catch`; a racing or replaced Panorama panel is normal runtime behavior.
- Keep discovery bounded at one-second scans, depth 12, and 512 visited panels. Gradient painting may read only cached fill/parent/shield widths at 0.15-second active, 0.25-second recent, and 1.5-second idle intervals; never move tree discovery or logging into that paint tick.
- Keep mutable ownership local: each probe owns only the bars discovered in its overlay context. Do not introduce shared state unless live evidence proves local ownership insufficient.
- Preserve stock panel IDs, hierarchy, snippets, and bindings. Refresh stock XML from current GameTracking rather than reconstructing or guessing it.
- Work only on the v1 healthbar and its approved ESC editor. Do not introduce additional HUD surfaces.
- Keep debug logging transition-based. Do not log every one-second scan.
- Emit pip/width telemetry only when its signature changes. Do not log unchanged data every scan.
- Prefer the smallest behavior needed for the current milestone. Do not recreate old HP Colors abstractions or add speculative settings infrastructure.
- Make complex behavior emerge from the fewest deep seams possible. Prefer deleting coordination, state, and message paths over making them more elaborate.
- Do not add fallback paths. When a path is broken, remove it and replace it with one proven path; never keep the failed route beside the replacement.
- Solve each requirement where its data already lives. Keep ownership local unless live evidence proves that insufficient.
- Keep hot paths allocation- and write-conscious. Do not scan the full HUD per frame, log unchanged telemetry, or repeat unchanged style/attribute writes. The gradient tick must return before color computation when floored shield-aware health percentage is unchanged.
- Color swatches open one shared HSL picker with three native horizontal Panorama `Slider` controls: Hue `0–359`, Saturation `0–100`, and Lumen `0–100`. All three update the authoritative snapshot live and add one Undo entry per completed gesture. Do not add custom pointer fields, mouse bridges, drag proxies, generic panel mouse routing, or coordinate polling.
- Delete experiments and instrumentation that no longer prove current behavior. Debug code must remain bounded, transition-based, and useful to the in-game smoke.

## Important Files

- `FEATURES.md` — milestone contract, future feature inventory, telemetry format, and smoke steps.
- `design.md` — approved ESC editor information architecture, interactions, visuals, and state-flow constraints.
- `panorama/layout/unit_status_overlay.xml` — classic stock overlay plus probe include.
- `panorama/layout/hud_escape_menu.xml` — current stock ESC layout plus the HP Colors entry and editor shell.
- `panorama/scripts/healthbar_probe.js` — local discovery and telemetry entry point.
- `panorama/scripts/hp_colors_menu.js` — local ESC editor lifecycle and navigation.
- `panorama/styles/hp_colors_menu.css` — Ritual Stripe entry and editor styling.
- `../scripts/source2_package_pipeline.ps1` — safe cleanup, compiler, VPK pack/list, and asset-contract helpers.
- `../sr2compiler/pref.json` — Dota Workshop Tools location used by the compiler wrapper.

## Runtime/Tooling Preferences

- Windows PowerShell is the supported build shell.
- Use the repository wrapper, not direct compiler or packer commands.
- Required tools: `sr2compiler/New folder.exe`, .NET 9 runtime support, Dota Workshop Tools/resourcecompiler, and a repository `vpkeditcli.exe` candidate.
- No npm/Bun/Node package manifest belongs to this module. Do not introduce a package manager.
- The compiler may hang or exit nonzero after producing every required output because of its final redirected `Console.ReadKey`. Required outputs are the success signal; missing output is fatal.
- Never hand-edit `hp_colors_rewrite_compiled/`, root `pak01_dir.vpk`, deployed VPKs, or timestamped backups.
- The build must retain exactly the two layouts, two scripts, editor stylesheet, and unit-status pulse stylesheet required by the current slice and reject raw source or documentation inside the VPK.
- Never launch, restart, stop, or otherwise control Deadlock. Only the user runs the game and performs interactive smoke steps. After the user exits, inspect `console.log` for evidence.

## Testing & QA
Focused regression tests include `../scripts/validate-hp-colors-rewrite-readout.test.js`, `../scripts/validate-hp-colors-rewrite-hero-lifecycle.test.js`, `../scripts/validate-hp-colors-rewrite-hero-scopes.test.js`, `../scripts/validate-hp-colors-rewrite-presets.test.js`, and the current rewrite feature validators under `../scripts/`. They cover the native palette, reversible non-culling visibility, team-high colors, exclusions, position, ultimate icons, HP readout, pips, levels, CSS-driven pulse, the enemy-player-only kill marker, live publishing, replacement replay, Undo, exact hero normalization, lifecycle reset, Auto/Manual/Off identity, inactive polling, stale-generation rejection, deterministic Selected/All/global scope priority, stable hero-key normalization, base/effective separation, changed-effective-only publication, the searchable Current Settings scope picker, baked-before-user preset ordering, frozen session saves, explicit Off/All/Selected application, inert repository selection, stable rename identity, baked display-name overrides, confirmed delete/hide, restore order, monotonic IDs, deterministic reorder boundaries, routing-priority changes, pending/selected reference repair, unknown-identity waiting, mismatch rejection, pending cancellation, no-publication repository mutations, and preset-metadata exclusion. Compilation, VPK asset checks, and matching SHA-256 hashes prove packaging and deployment only; they do not prove Panorama runtime behavior.

Required smoke:

1. Run `build_hp_colors_rewrite.ps1`.
2. Ask the user to restart Deadlock with `-dev -tools`; replacing a VPK while the game is running is not sufficient.
3. Open `HP COLORS`; toggle the master switch and require enemy bars to change immediately.
4. Exercise fixed/gradient enemy colors, thresholds, visibility, width, height, healing, damage-delta, and bullet-shield colors.
5. Enable ally customization and require only friend bar, healing, damage-delta, and bullet-shield colors to change.
6. Require neutral units and unclassified bars to remain stock.
7. Spawn or reveal late bars and require them to receive the current snapshot without reopening the editor.
8. Open color swatches across enemy and ally pages; drag hue, saturation, and Lumen to require live canonical hex and bar updates, then require one Undo to restore the pre-drag color.
9. Exercise Reset Section confirmation, Cancel, already-default feedback, Undo, Peek, Done, and Escape, including Escape dismissing the reset dialog or palette before closing the editor. Require Reset Section and Undo to be hidden on the Presets page and restored on settings pages.
10. Exercise HP readout visibility, current/max, percentage, and current-only formats; size and positive/negative offsets; bar-derived and custom fixed/gradient colors; exclusions; and late/replaced bars.
11. Exercise enemy and ally pulse threshold boundaries, speed, intensity, custom colors, enemy bar hiding, independent HP-number animation and text-modifier toggles, pulse-only readout size/offsets with normal-geometry restoration, bypass/exclusion cleanup, and coexistence with stock `health_critical` styling.
12. Enable the kill marker and exercise threshold endpoints, width, and color on enemy heroes; require allies, neutrals, lane units, summons, buildings, sentries, bosses, and boss barracks to remain marker-free. Verify hidden and pulse-hidden bars, bypass, late/replaced panels, and cleanup.
13. Toggle enemy pips, precise-pip calculation, and levels; verify tier boundaries and stock restoration. Require the precise-pip warning on both enable and disable, exact copied 10/10/10 and 100/100/5 ConVars values, the disable deletion reminder, and a working Close action. Require the UI not to claim that it applied or verified gameinfo.gi.
14. On the Presets page, verify lobby/pregame, active-match, hero-change, post-match, and next-match transitions. Auto must resolve a stable `hero_*` key only after settling; blank or placeholder labels must stay unknown. Manual Override must use the selected hero, Off must clear effective identity, and replaced topbar cards/clocks must recover without stale hero leakage. These lifecycle diagnostics stay hidden from the workspace.
15. Choose All Heroes and Selected Heroes save targets; require no user-facing Global category. Search and multi-select stable heroes; removing the final selected hero must return the target to All Heroes. With no selected user row, Save must create a new monotonic All Heroes or Selected Heroes record. Creating an All Heroes record must hide the baked Rewrite Default row without removing its canonical fallback; Restore Baked must reveal it again. With a selected user row, the same Save must update it in place without changing its ID or position; New Preset must return Save to create mode. Saving alone must not repaint or publish.
16. Save distinct All Heroes and Selected Heroes session presets; require baked records before session records and stable creation order. Legacy user Global records must normalize to All Heroes without applying or replacing the hidden base. Require Selected → All Heroes → Rewrite Default automatic routing on exact settled hero transitions, including stale Current-row replacement and no revision/dispatch for byte-identical effective values. Without an All Heroes record, changing away from Shiv must apply the baked Rewrite Default automatically. Restart Deadlock and require session user presets to be absent.
17. Select presets without applying them; require distinct Selected, Active, and Waiting states. Exercise per-row Apply/Cancel, inline user and baked rename, per-user Up/Down boundaries, Copy, confirmed user deletion and baked hiding, Restore Baked, selection/pending repair, and automatic priority after reorder. Copy All, then import both single and bundle codes into a fresh session repository; require preserved names, scopes, heroes, values, baked display/hidden state, conditional metadata, fresh monotonic user IDs, deterministic order, exclusion of synthetic Current, and atomic rejection of malformed bundles. Require every repository-only action to leave live bars, revision, Undo, and dispatch unchanged. At each supported UI scale, require the full-width repository, save-target controls, transfer controls, expanded preset viewport, and row-local actions to remain readable and operable without clipping behind the fixed footer.
18. Exit so `console.log` flushes; require config/role/data/identity transition logs with no rewrite exceptions. Restart Deadlock and require session repository records to be absent until a verified writable persistence backend is introduced.

Never claim in-game verification unless this smoke was performed in a real Deadlock session. Record packaging/deployment success separately from live runtime proof.
