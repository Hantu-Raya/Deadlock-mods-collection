# 3D HUD Health Bars Text Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `hud_health_bars` inside `3d hud` into a text-first HP display where health progress visually clips through the HP text, missing health uses `#333333ea`, full health shows only current HP, damaged health shows current HP plus a tiny max HP suffix, and the 3D hero sits next to/behind the HP text.

**Architecture:** Keep all source changes inside `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud`. Reuse Deadlock's existing health bindings and `ProgressBarWithMiddle` state instead of adding a polling script. Add local health XML/CSS overrides under `3d hud/panorama`, and update `3d hud/build_3d_hud.ps1` so those layout overrides are staged and compiled into `pak98_dir.vpk`.

**Tech Stack:** Source 2 Panorama XML/CSS, Deadlock compiled HUD resources, `vpkeditcli.exe`, `sr2compiler\New folder.exe`, `3d hud\build_3d_hud.ps1`.

---

## Current Evidence

- Requested skills loaded: `find-skills`, `karpathy-guidelines`, Superpowers, and Leonxlnx frontend design skills.
- Best matching Leonxlnx frontend skill: `.agents/skills/Leonxlnx/design-taste-frontend/SKILL.md`.
- VPK inspected with:

```powershell
$vpk = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\pak01_dir.vpk"
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe" $vpk --file-tree --no-progress |
  Select-String -Pattern "hud_health" -CaseSensitive:$false
```

- Shipped health resources found: `hud_health.vxml_c`, `hud_health_container.vxml_c`, `hud_health_single_bar.vxml_c`, `hud_health_stacked.vxml_c`, `hud_health_pips.vxml_c`, and matching `.vcss_c` files.
- Shipped `hud_health.xml` structure uses:

```xml
<ProgressBarWithMiddle id="health_bar" class="large_progress_bar" vertical="true">
  <Panel class="progress_bar_numbers">
    <Panel class="bar_num_col_right">
      <Label id="current_health" class="progress_bar_current" text="{i:health}" />
      <Label id="max_health" text="/{i:maxHealth}" />
    </Panel>
  </Panel>
</ProgressBarWithMiddle>
```

- `3d hud\hud.xml` already contains `CitadelHudHealthContainer id="health_and_abilities_container"` and a static `ThreeDHeroHudProbe` with many predeclared `CitadelHeroScenePanelNew` panels.
- `3d hud\build_3d_hud.ps1` currently stages root `hud.xml`, `panorama\styles`, and `panorama\scripts`, but not `panorama\layout`. This must be fixed before adding health XML overrides.
- Dirty worktree contains unrelated `buff_timer_virgin` changes and temp folders. Do not modify or revert them.

## File Map

- Modify: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\build_3d_hud.ps1`
  - Responsibility: stage `3d hud\panorama\layout\*.xml` into the temporary addon layout folder before compile.
- Modify: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\hud.xml`
  - Responsibility: keep the health container and existing 3D hero host in the HUD root; avoid broad scene-panel changes.
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\layout\hud_health.xml`
  - Responsibility: override default local health layout with layered HP text and existing health/shield bindings.
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\layout\hud_health_single_bar.xml`
  - Responsibility: keep the single-bar variant in sync with the layered HP text behavior.
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\styles\hud_health.css`
  - Responsibility: make the health display text-first, set missing fill to `#333333ea`, hide max HP when full, reveal tiny suffix on damage, and reduce visible bar chrome.
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\styles\hud_health_container.css`
  - Responsibility: align health container and fallback current/total labels near the new text health presentation.
- Modify: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\styles\3d_hud.css`
  - Responsibility: position the existing static hero scenes next to and behind the HP text.

## Task 1: Baseline Guard

**Files:**
- Read only: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\hud.xml`
- Read only: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\styles\3d_hud.css`
- Read only: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\build_3d_hud.ps1`

- [ ] **Step 1: Confirm unrelated dirty files**

Run:

```powershell
git status --short
```

Expected: unrelated `buff_timer_virgin` changes may exist. Do not revert them.

- [ ] **Step 2: Confirm `3d hud` health and hero anchors**

Run:

```powershell
Select-String -Path "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\hud.xml" -Pattern "CitadelHudHealthContainer|ThreeDHeroHudProbe|ThreeDHeroDynamicHeroHost" -Context 2,2
```

Expected: `CitadelHudHealthContainer id="health_and_abilities_container"` exists near line 269, and `ThreeDHeroHudProbe` / `ThreeDHeroDynamicHeroHost` exist near line 320.

- [ ] **Step 3: Log checkpoint**

Use `memory_save` with concepts `3d hud, hud_health_bars, baseline guard, dirty worktree` and note that unrelated dirty files were preserved.

## Task 2: Stage 3D HUD Layout Overrides

**Files:**
- Modify: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\build_3d_hud.ps1`

- [ ] **Step 1: Add a source layouts variable**

Add this near the existing `$sourceHud`, `$sourceStyles`, and `$sourceScripts` variables:

```powershell
$sourceLayouts = Join-Path $scriptDir 'panorama\layout'
```

- [ ] **Step 2: Copy layout overrides into the staged addon**

After the existing line that copies root `hud.xml` into `$stageHudLayout`, add:

```powershell
if (Test-Path -LiteralPath $sourceLayouts) {
    Copy-Item -Path (Join-Path $sourceLayouts '*') -Destination $stageHudLayout -Recurse -Force
}
```

- [ ] **Step 3: Keep required compiled checks unchanged**

Do not remove these existing checks:

```powershell
Require-Path -Path $compiledHud -Label 'Compiled hud.vxml_c'
Require-Path -Path $compiledCss -Label 'Compiled 3d_hud.vcss_c'
Require-Path -Path $compiledScript -Label 'Compiled 3d_hero_dynamic.vjs_c'
```

- [ ] **Step 4: Log checkpoint**

Use `memory_save` with concepts `3d hud, build_3d_hud, layout staging`.

## Task 3: Add Layered Health XML Overrides

**Files:**
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\layout\hud_health.xml`
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\layout\hud_health_single_bar.xml`

- [ ] **Step 1: Create `hud_health.xml`**

Use the shipped structure, but replace the health labels with layered text panels. Keep shield and regen bindings unchanged.

```xml
<root>
  <styles>
    <include src="s2r://panorama/styles/citadel_base_styles.vcss_c" />
    <include src="s2r://panorama/styles/hud_common.vcss_c" />
    <include src="s2r://panorama/styles/hud_health.vcss_c" />
  </styles>
  <Panel class="bars_container" hittest="false">
    <Panel class="health_bar_line">
      <Panel class="health_bar_border">
        <ProgressBarWithMiddle id="health_bar" class="large_progress_bar hud_text_health_bar" vertical="false">
          <Panel class="hp_text_stack hp_text_stack_back">
            <Label id="current_health_back" class="progress_bar_current hp_text_current hp_text_missing" text="{i:health}" />
            <Label id="max_health_back" class="hp_text_max hp_text_missing" text="/{i:maxHealth}" />
          </Panel>
          <Panel class="hp_text_stack hp_text_stack_fill">
            <Label id="current_health" class="progress_bar_current hp_text_current hp_text_filled" text="{i:health}" />
            <Label id="max_health" class="hp_text_max hp_text_filled" text="/{i:maxHealth}" />
          </Panel>
        </ProgressBarWithMiddle>
        <ProgressBarWithMiddle id="pending_incoming_damage" class="large_progress_bar" vertical="false" />
        <ProgressBarWithMiddle id="pending_incoming_heal" class="large_progress_bar" vertical="false" />
        <Panel id="healthBottomEdge" />
        <Panel id="health_bar_frame" />
      </Panel>
      <Panel class="regen_container">
        <Image class="regen_image" src="s2r://panorama/images/hud/healthbar/icon_regen_arrows.vsvg" />
        <Label class="regen_value" text="{s:HealthRegen}" />
      </Panel>
      <Panel id="RejuvenatorContainer" />
    </Panel>
    <ProgressBarWithMiddle id="tech_shield_bar" class="small_progress_bar" vertical="true">
      <Panel class="progress_bar_numbers">
        <Label class="progress_bar_current" text="{i:techShieldHealth}" />
        <Label class="progress_bar_max" text="/{i:techShieldMaxHealth}" />
      </Panel>
    </ProgressBarWithMiddle>
    <ProgressBarWithMiddle id="shield_bar" class="small_progress_bar" vertical="true">
      <Panel class="progress_bar_numbers">
        <Label class="progress_bar_current" text="{i:shieldHealth}" />
        <Label class="progress_bar_max" text="/{i:shieldMaxHealth}" />
      </Panel>
    </ProgressBarWithMiddle>
  </Panel>
</root>
```

- [ ] **Step 2: Create `hud_health_single_bar.xml`**

Use the same layered health label structure, without shields/regen.

```xml
<root>
  <styles>
    <include src="s2r://panorama/styles/citadel_base_styles.vcss_c" />
    <include src="s2r://panorama/styles/hud_common.vcss_c" />
    <include src="s2r://panorama/styles/hud_health_single_bar.vcss_c" />
  </styles>
  <Panel class="health_bar_line">
    <Panel class="health_bar_border">
      <ProgressBarWithMiddle id="health_bar" class="large_progress_bar hud_text_health_bar" vertical="false">
        <Panel class="hp_text_stack hp_text_stack_back">
          <Label id="current_health_back" class="progress_bar_current hp_text_current hp_text_missing" text="{i:health}" />
          <Label id="max_health_back" class="hp_text_max hp_text_missing" text="/{i:maxHealth}" />
        </Panel>
        <Panel class="hp_text_stack hp_text_stack_fill">
          <Label id="current_health" class="progress_bar_current hp_text_current hp_text_filled" text="{i:health}" />
          <Label id="max_health" class="hp_text_max hp_text_filled" text="/{i:maxHealth}" />
        </Panel>
      </ProgressBarWithMiddle>
      <ProgressBarWithMiddle id="pending_healing" class="large_progress_bar" vertical="false" />
      <ProgressBarWithMiddle id="pending_incoming_damage" class="large_progress_bar" vertical="false" />
      <Panel id="healthBottomEdge" />
      <Panel id="health_bar_frame" />
    </Panel>
  </Panel>
</root>
```

- [ ] **Step 3: Log checkpoint**

Use `memory_save` with concepts `3d hud, hud_health_bars, layered XML`.

## Task 4: Add 3D HUD Health CSS Overrides

**Files:**
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\styles\hud_health.css`
- Create: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\styles\hud_health_container.css`

- [ ] **Step 1: Create `hud_health.css`**

Add text-first health bar styling:

```css
#health_bar
{
  background-color: #333333ea;
  width: 168px;
  height: 72px;
  margin: 0px;
  border: 0px solid transparent;
  border-radius: 0px;
  overflow: clip;
}

#health_bar.hud_text_health_bar
{
  background-color: #333333ea;
  box-shadow: none;
}

.hp_text_stack
{
  width: 168px;
  height: 72px;
  horizontal-align: center;
  vertical-align: center;
  flow-children: none;
  overflow: noclip;
}

.hp_text_stack_back
{
  z-index: 1;
}

.hp_text_stack_fill
{
  z-index: 3;
}

.hp_text_current
{
  font-size: 48px;
  font-weight: bold;
  font-family: sans;
  letter-spacing: 0px;
  text-align: right;
  horizontal-align: right;
  vertical-align: center;
  margin-right: 42px;
  text-shadow: 1px 1px 0px #000000cc;
  text-overflow: shrink;
  max-width: 126px;
}

.hp_text_max
{
  font-size: 16px;
  font-weight: semi-bold;
  font-family: sans;
  letter-spacing: 0px;
  horizontal-align: right;
  vertical-align: bottom;
  margin-right: 4px;
  margin-bottom: 9px;
  opacity: 0;
  text-shadow: 1px 1px 0px #000000cc;
  transition-property: opacity;
  transition-duration: 0.12s;
}

.hp_text_missing
{
  color: #333333ea;
}

.hp_text_filled
{
  color: #ffffff;
}

#health_bar.healthLost .hp_text_max,
#current_health.healthLost ~ #max_health,
#max_health.healthLost
{
  opacity: 1;
}

#healthBottomEdge,
#health_bar_frame
{
  opacity: 0;
  visibility: collapse;
}

#health_bar .ProgressBarLeft
{
  background-color: #ffffff;
  background-image: none;
}

#health_bar .ProgressBarMiddle,
#health_bar .ProgressBarRight
{
  background-color: #333333ea;
}
```

- [ ] **Step 2: Create `hud_health_container.css`**

Add alignment for the health container and fallback labels:

```css
#hud_health_bars
{
  visibility: collapse;
}

.view_is_in_eye.player_selected #hud_health_bars
{
  visibility: visible;
}

.healthContainer
{
  horizontal-align: right;
  opacity: 1;
  margin-top: 148px;
  z-index: 120;
  width: 168px;
  height: 72px;
  margin-right: 168px;
  margin-left: 0px;
  flow-children: none;
}

.AspectRatio16x10 .healthContainer,
.AspectRatio21x9 .healthContainer
{
  horizontal-align: right;
  opacity: 1;
  margin-top: 148px;
  z-index: 120;
  width: 168px;
  height: 72px;
  margin-right: 168px;
  margin-left: 0px;
  flow-children: none;
}

.currentHealthLabel
{
  font-weight: bold;
  color: #ffffff;
  font-family: sans;
  letter-spacing: 0px;
  font-size: 48px;
  text-overflow: shrink;
  max-width: 126px;
  horizontal-align: right;
  vertical-align: center;
  margin-right: 42px;
  text-shadow: 1px 1px 0px #000000cc;
  transform: rotateZ(0deg);
}

.totalHealthLabel
{
  font-size: 16px;
  font-family: sans;
  horizontal-align: right;
  vertical-align: bottom;
  margin-right: 4px;
  margin-bottom: 9px;
  font-weight: semi-bold;
  color: #ffffffcc;
  opacity: 0;
  text-shadow: 1px 1px 0px #000000cc;
  transform: rotateZ(0deg);
}

.localPlayerLowHealth .totalHealthLabel,
.healthLow .totalHealthLabel,
.healthLow #max_health,
.healthMid #max_health
{
  opacity: 1;
}
```

- [ ] **Step 3: Known validation point**

If in-game validation shows `.hp_text_stack_fill` is not clipped by `ProgressBarWithMiddle`, revise by moving the filled labels into a child panel that Panorama places inside the progress-fill layer, or fall back to a readable two-tone text overlay where the bar is visually minimized behind the glyphs.

- [ ] **Step 4: Log checkpoint**

Use `memory_save` with concepts `3d hud, hud_health_bars, text health CSS, clip validation risk`.

## Task 5: Position the 3D Hero Behind the HP Text

**Files:**
- Modify: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\styles\3d_hud.css`
- Modify only if required by validation: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\hud.xml`

- [ ] **Step 1: Adjust `#ThreeDHeroHudProbe` CSS**

Replace the current block with:

```css
#ThreeDHeroHudProbe {
  horizontal-align: right;
  vertical-align: center;
  width: 250px;
  height: 320px;
  margin-right: 8px;
  margin-top: 24px;
  opacity: 0.55;
  transform: scaleY(1) scaleX(-1);
  z-index: 35;
  overflow: noclip;
}
```

- [ ] **Step 2: Keep static hero scene architecture intact**

Do not remove predeclared `CitadelHeroScenePanelNew` panels from `3d hud\hud.xml`. This preserves the recent known-good 3D HUD behavior.

- [ ] **Step 3: Log checkpoint**

Use `memory_save` with concepts `3d hud, 3d hero placement, health text composition`.

## Task 6: Build, Pack, and Manual Validation

**Files:**
- Verify packed output: `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\pak98_dir.vpk`
- Verify deployed output: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk`

- [ ] **Step 1: Run the 3D HUD build script**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\build_3d_hud.ps1"
```

Expected:

```text
[1/4] Staging 3D HUD addon...
[2/4] Minifying Panorama JS with terser...
[3/4] Compiling staged addon...
[4/4] Packing pak98_dir.vpk...
Deployed OK -> G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk
```

- [ ] **Step 2: Verify compiled health overrides were produced during build**

Before cleanup, or by temporarily adding a diagnostic if needed, confirm the staged compiled folder contains:

```text
panorama\layout\hud_health.vxml_c
panorama\layout\hud_health_single_bar.vxml_c
panorama\styles\hud_health.vcss_c
panorama\styles\hud_health_container.vcss_c
```

If the script cleans temporary folders before inspection, verify the final VPK file tree instead:

```powershell
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\pak98_dir.vpk" --file-tree --no-progress |
  Select-String -Pattern "hud_health|3d_hud|3d_hero_dynamic" -CaseSensitive:$false
```

- [ ] **Step 3: In-game validation**

Launch Deadlock with `-dev -tools`, open Panorama debugger or VConsole, then verify:

- Full health shows only the current HP number.
- After damage, current HP plus tiny `/max` appears at the lower right.
- Missing-health text/background uses `#333333ea`.
- Filled-health text reads white.
- 3D hero is next to and behind the HP text, not covering ability UI.
- No Panorama script or layout errors appear.

- [ ] **Step 4: Log final result**

Use `memory_save` with concepts `3d hud, hud_health_bars, build result, manual validation` and include whether compile/pack/deploy succeeded plus what still requires in-game validation.

## Self-Review

- Spec coverage: plan covers `3d hud`-only source changes, text-only health, clipped fill attempt, missing color, full-vs-damaged max HP behavior, 3D hero placement, VPK inspection, build, and manual validation.
- Placeholder scan: no `TODO`, `TBD`, or unspecified "handle later" steps.
- Risk: true glyph-level clipping may require in-game validation because Source 2 Panorama `ProgressBarWithMiddle` clipping behavior cannot be proven by static compile alone.
