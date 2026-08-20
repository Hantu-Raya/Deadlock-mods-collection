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
  -> hp_colors_contract.js
  -> owns the immutable healthbar setting schema and normalization policy
  -> hp_colors_state.js
  -> owns canonical state policy behind one immutable send/read seam
  -> hp_colors_menu.js + hp_colors_menu.css
  -> adapts Panorama panels, scheduling, transport, replay, and clipboard effects

unit_status_overlay.xml
  -> hp_colors_contract.js
  -> supplies the same healthbar setting schema and normalization policy
  -> healthbar_probe.js
  -> caches the latest snapshot per overlay context
  -> discovers, classifies, and styles local v1 bars
  -> logs bounded probe, config, and role transitions
```

`hp_colors_contract.js` is the single source for healthbar setting defaults, deterministic key order, types, enum options, numeric bounds, and normalization helpers. Both layouts load it before their consumer. `hp_colors_state.js` uses the complete schema for session state, import, conditions, and publication. `healthbar_probe.js` uses the same normalizer at the config boundary. Each consumer captures the frozen contract and removes the temporary factory from its Panorama global surface.

`hp_colors_state.js` owns one hidden canonical base, ordered session-scoped snapshot rows, and a baked-before-user session preset repository. Its menu-owned factory instance accepts atomic domain intents through `send()` and exposes a cached immutable rendering projection through `read()`. On a cold boot with no session cache, a valid builder `HPCRP1` selection becomes Current and is published before hero or game-mode lifecycle observation. The resolver then uses Current first, followed by the first matching Selected Heroes row, the first All Heroes row, and the hidden base represented by baked Rewrite Default. Applied user presets stamp Current with their stable source ID so later lifecycle observations can distinguish the same route from a different preset route. User presets expose only All Heroes and Selected Heroes; legacy user Global records normalize to All Heroes without applying. Explicit **Apply** replaces Current and publishes immediately. Editor controls then mutate that Current working copy without changing the source preset record; only **Save & Apply** replaces a user record. Only byte-different resolved effective values produce a publication effect and increment the separate effective revision. `hp_colors_menu.js` executes that effect through the existing absolute-root config attribute and `ClientUI_FireOutput`, retains the same-session state effect in the menu-only root attribute, and adaptively replays only its cached serialized publication for late contexts.

Hero identity is transient state-module metadata, not part of the healthbar settings snapshot. The menu adapter observes only the generated `CitadelHudTopBarPlayer.LocalPlayer` card under `#TopBar` and reports epoch-tagged lifecycle, exact retail-name, and required ability-slot observations. The state module maps exact names to stable `hero_*` keys, requires two matching active-match samples, rejects stale epochs, and exposes only referenced ability slots for polling. Blank, `#`, fuzzy, and unmapped values remain unknown. Manual Override uses one explicit stable key; Off clears effective identity and skips local-card scans. Identity/lifecycle state never enters the canonical setting schema, HPCR2, Undo, the effective snapshot publication, or unit-status contexts. Scope rows and preset records validate and deduplicate stable hero keys, normalize empty Selected rows to Off, and remain session-only. Explicit preset application does not wait for identity. On later exact identity transitions, automatic routing resolves the first matching saved Selected record, then the first saved All Heroes record. It preserves edited Current when that route resolves to Current's source preset ID, and replaces Current only when the resolved preset changes. Leaving an active Selected scope without either automatically applies baked Rewrite Default.

Preserve these authority rules:

- A bar belongs to the overlay context that discovered it.
- Replaced panel parts increment the local generation, clear render caches, and reapply the cached snapshot.
- `team_neutral` wins classification before `enemy` or `friend`; `team1`/`team2` never imply relation. Building and boss flags are classified independently from relation, and unknown teams retain the configured high color.
- The custom renderer writes fill/healing/delta and ultimate-icon `washColor`, bullet-shield `backgroundColor`, container opacity/width/height/transform, stock pip-label visibility, rewrite-owned level visibility/tier classes, namespaced pulse classes/duration, and rewrite-owned kill-marker visibility/position/width/color. It never writes engine-owned fill, feedback, shield widths, pip or level text, icon image, or icon visibility. The kill marker is restricted to visible enemy panels with the stock `player` class; allies, neutrals, non-player units, buildings, sentries, bosses, and boss barracks always clear it. Bypass and exclusions clear rewrite-owned state so stock CSS resumes.
- Hidden enemy and ally bar containers remain rendered at `opacity: 0.01` so the engine continues updating their widths; showing them writes `opacity: 1`. Never use `visibility: collapse` or zero opacity for this control.
- The owned HP counter uses the legacy non-displacing geometry: `WindowRoot` is `100%` wide and `fit-children` high; `UnitStatus` is a bottom-aligned, centered `fit-children` down-flow; and `InfoHealthContainer` is a bottom-aligned `fit-children` × `300px` right-flow. A narrow `1px` × `399px` in-flow extent immediately before `InfoHealthContainer` enlarges the world-panel render surface upward without changing horizontal flow or the bottom-anchored healthbar position. `hp_counter_anchor` is an ignored-flow `100%` × `100%` sibling of `InfoHealthContainer` directly under `UnitStatus`; it must not be nested inside the finite 300px health container. Runtime gives the single `hp_counter` label `height: 100%`, writes the requested font size, and translates the anchor with `translate3d`; never transform the label or add a wide horizontal canvas. Dynamic text tint uses `washColor`; never replace it with dynamic `color`. Portable placement limits remain ±405px horizontally, −35px upward, and 840px downward, with 500px as the vertical default. The addon never executes engine-setting commands or mutates external game files. `WindowRoot`, `UnitStatus`, `InfoHealthContainer`, `hp_counter_anchor`, and `hp_counter` retain `overflow: noclip`.
- Pip, level, and health-percentage state remains local to the probe. Production must not serialize or emit per-bar data diagnostics.
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
- `../hp_colors_rewrite_qollock/` — package-derived layouts and compatibility guards for the installed QOLLOCK `pak03`; it reuses canonical Rewrite scripts and styles during the build.

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

### QOLLOCK compatibility

Run the compatibility regression before packaging:

```powershell
node --test scripts/validate-hp-colors-rewrite-qollock.test.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_qollock.ps1
```

The compatibility install order is builder-generated `pak01`, Rewrite support `pak02`, then QOLLOCK `pak03`. Lower-numbered addon VPKs win collisions, so `pak02` supplies the combined HUD and Escape-menu layouts while `pak03` supplies QOLLOCK runtime assets.

`pak03_dir.vpk` in the Deadlock addons folder is the only QOLLOCK source authority. The build has no dependency on `G:\QOLLOCK`. A normal build rejects a changed `pak03` hash. After installing a QOLLOCK update, refresh and build from that package:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_qollock.ps1 -RefreshFromInstalledQollock
```

The refresh extracts and decompiles `hud.vxml_c` and `hud_escape_menu.vxml_c`, removes QOLLOCK body-healthbar includes, injects canonical Rewrite fragments and compatibility guards, updates `qollock-source.sha256`, then compiles and packs `pak02_dir.vpk`. Source2Viewer CLI is required only for this refresh. Use the normal wrapper without the switch when the installed `pak03` hash has not changed.

Never hand-edit the generated compatibility layouts. Update `scripts/refresh-hp-colors-rewrite-qollock.js` and regenerate them. The compatibility bridge must close only QOLLOCK's settings panel before opening HP Colors; calling `ForceCloseModSettings` resumes gameplay and dismisses the Escape menu.

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
- Do not emit per-bar pip, width, or health geometry diagnostics in production.
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
- When this XML changes, complete the Rewrite v2 XML sync gate in `D:\web\hp-colors-preset-builder\AGENTS.md` before treating the change as finished.
- `panorama/scripts/healthbar_probe.js` — local discovery and telemetry entry point.
- `panorama/scripts/hp_colors_contract.js` — immutable shared setting schema and normalization policy loaded before state and probe.
- `panorama/scripts/hp_colors_state.js` — deep canonical state policy and immutable factory.
- `panorama/scripts/hp_colors_menu.js` — local ESC editor lifecycle and navigation.
- `panorama/styles/hp_colors_menu.css` — Ritual Stripe entry and editor styling.
- `../scripts/source2_package_pipeline.ps1` — safe cleanup, compiler, VPK pack/list, and asset-contract helpers.
- `../sr2compiler/pref.json` — Dota Workshop Tools location used by the compiler wrapper.

## Runtime/Tooling Preferences

- Windows PowerShell is the supported build shell.
- Use the repository wrapper, not direct compiler or packer commands.
- Required tools: `sr2compiler/New folder.exe`, .NET 9 runtime support, Dota Workshop Tools/resourcecompiler, and a repository `vpkeditcli.exe` candidate.
- The module runtime and build remain package-manager-free. `package.json` and `oxlint.config.ts` exist only for local Oxlint tooling; do not add npm dependencies to runtime or packaging paths.
- The compiler may hang or exit nonzero after producing every required output because of its final redirected `Console.ReadKey`. Required outputs are the success signal; missing output is fatal.
- Never hand-edit `hp_colors_rewrite_compiled/`, root `pak01_dir.vpk`, deployed VPKs, or timestamped backups.
- The build must retain exactly the two layouts, four scripts, editor stylesheet, and unit-status pulse stylesheet required by the current slice and reject raw source or documentation inside the VPK.
- Never launch, restart, stop, or otherwise control Deadlock. Only the user runs the game and performs interactive smoke steps. After the user exits, inspect `console.log` for evidence.

## Testing & QA
Focused regression tests include `../scripts/validate-hp-colors-rewrite-readout.test.js`, `../scripts/validate-hp-colors-rewrite-hero-lifecycle.test.js`, `../scripts/validate-hp-colors-rewrite-hero-scopes.test.js`, `../scripts/validate-hp-colors-rewrite-presets.test.js`, and the current rewrite feature validators under `../scripts/`. They cover the native palette, reversible non-culling visibility, team-high colors, exclusions, position, ultimate icons, HP readout, pips, levels, CSS-driven pulse, the enemy-player-only kill marker, live publishing, replacement replay, Undo, exact hero normalization, lifecycle reset, Auto/Manual/Off identity, inactive polling, stale-generation rejection, deterministic Selected/All/global scope priority, stable hero-key normalization, base/effective separation, changed-effective-only publication, the searchable Current Settings scope picker, baked-before-user preset ordering, cold-boot builder selection publication, frozen session saves, explicit Off/All/Selected application, inert repository selection, stable rename identity, baked display-name overrides, confirmed delete/hide, restore order, monotonic IDs, deterministic reorder boundaries, routing-priority changes, selected-reference repair, no-publication repository mutations, and preset-metadata exclusion. Compilation, VPK asset checks, and matching SHA-256 hashes prove packaging and deployment only; they do not prove Panorama runtime behavior.

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
15. Choose All Heroes and Selected Heroes save targets; require no user-facing Global category. Search and multi-select stable heroes; removing the final selected hero must return the target to All Heroes. With the form closed, **New Preset** must open a blank create-only form. **Create Preset** must allocate a new monotonic All Heroes or Selected Heroes record, close the form, and never apply or publish settings. Creating an All Heroes record must hide the baked Rewrite Default row without removing its canonical fallback; Restore Baked must reveal it again.
16. Click a session row and require a distinct **EDITING** state, a populated name, an overwrite warning, and a row-local **Save & Apply** action. Require Cancel to close editing without repository or live-setting mutation. **Save & Apply** must retain the stable ID and order, replace that record from the current editable values, conditions, and scope, then use the existing application route. Baked rows must remain immutable and expose **Apply** only.
17. Save distinct All Heroes and Selected Heroes session presets; require baked records before session records and stable creation order. Install a web-builder preset VPK, restart Deadlock, and require its selected `HPCRP1` record to become Current and affect live bars before any game-mode, area, or hero lifecycle transition. Change a toggle and slider; require Current and live bars to update while the hidden base and source preset record remain unchanged until **Save & Apply**. Move between hideout and testing repeatedly; require the edited Current values to survive whenever automatic routing resolves to that same source preset. A web-builder seed containing an All Heroes user preset must hide baked Rewrite Default while retaining its canonical fallback. Renaming, reordering, deleting, hiding, restoring, and canceling edit never call the effective-settings reconciliation or publication seam. Selection repairs to the nearest surviving visible record.
18. Exercise immediate idle-row Apply before identity settles, inline user and baked rename, per-user Up/Down boundaries, Copy, confirmed user deletion and baked hiding, Restore Baked, selection repair, and automatic priority after reorder. Copy All, then import both single and bundle codes into a fresh session repository; require preserved names, scopes, heroes, values, baked display/hidden state, conditional metadata, fresh monotonic user IDs, deterministic order, exclusion of synthetic Current, and atomic rejection of malformed bundles. Require every repository-only action to leave live bars, revision, Undo, and dispatch unchanged. At each supported UI scale, require the full-width repository, create/edit form, and row controls to remain readable without overlap or clipping.
19. Exit so `console.log` flushes; require config/role/data/identity transition logs with no rewrite exceptions. Restart Deadlock and require runtime-created session records to be absent while packaged builder records hydrate again.

Never claim in-game verification unless this smoke was performed in a real Deadlock session. Record packaging/deployment success separately from live runtime proof.
