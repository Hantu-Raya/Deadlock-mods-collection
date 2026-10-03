# AGENT GUIDE: recent_purchase

Project type: Source 2 Panorama UI mod (quickbuy cost tracker).
Primary output: compiled assets in `../recent_purchase_compiled/` → `pak81_dir.vpk`.

## Description
Enhances the Deadlock quickbuy queue HUD with a **Total Cost** summary and
**per-item remaining souls** display. Original item costs are preserved; the
mod adds a `/` divider plus a remaining-cost label, e.g. `$3,200 / -800`.

Build scripts copy this guide into `recent_purchase_terser/`. If this file is
read from the terser folder, treat that folder as generated staging output and
patch `recent_purchase/` instead.

## Stock Base

Stock files come from SteamTracking/GameTracking-Deadlock commit
`cc57a5a4117382375d0c1189873474ce4b901260` (2026-09-30), under
`game/citadel/pak01_dir/`:

- `panorama/layout/hud_quickbuy.xml` and `hud_quickbuy_entry.xml`: stock layout plus the mod additions listed below. Refresh with a three-way merge (old stock, local, new stock).
- `panorama/styles/hud_quickbuy.css` and `citadel_hud_hero_shop.css`: copied **verbatim** to `panorama/styles/base/`. Replace them wholesale on refresh; never put mod rules there.

Upstream decompiles includes/imports as `.vcss`; local copies keep the compiled `.vcss_c` suffix. Image URLs (`.vtex`, `.vsvg`) stay as upstream writes them.

## Build

Preferred full build from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_recent_purchase.ps1
```

The script compiles the runtime with Closure ADVANCED into `recent_purchase_terser/`,
compiles that copy to `recent_purchase_terser_compiled/`, syncs `recent_purchase_compiled/`,
packs `pak81_dir.vpk`, and deploys it to the Deadlock addons folder configured in the script.
It runs `recent_purchase/scripts/validate-queue-costs.js` on the readable source and again on the
Closure output, and fails the build if either run fails. The check loads the runtime into a mock
quickbuy HUD and asserts TOTAL, per-item remaining souls, recipe deduction, sell credit, and
unchanged-write behavior. Run it alone with `node recent_purchase/scripts/validate-queue-costs.js [script.js]`.

Closure ADVANCED renames dot properties that are not in the externs. Never mix `obj['key']` and
`obj.key` for the same property: this once made every item cost read as 0 in the shipped VPK while
the readable source still worked.

Manual commands:

```powershell
# Source/debug compile only
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\recent_purchase"

# Pack + deploy (single-file VPK)
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\recent_purchase_compiled" -o "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak81_dir.vpk" -s --no-progress
cp "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak81_dir.vpk" "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak81_dir.vpk"
```

## Source Files

| File | Purpose |
|---|---|
| `panorama/scripts/recent_purchase_queue_costs.js` | Core logic. 50ms polling loop, cost parsing, recipe component deduction, sell queue credit, total cost sum, per-item remaining souls, and click-to-team-chat need messages. |
| `panorama/layout/hud_quickbuy.xml` | Stock layout plus script include and `#RecentPurchaseCostSummary` after `.BuildOrderLabel` inside `.QuickbuyQueueOuter`. |
| `panorama/layout/hud_quickbuy_entry.xml` | Stock entry layout plus `#RecentPurchaseCostDivider` and `#RecentPurchaseDeficitLabel` inside `.CostPanel`, `id="goldIcon"` on the cost icon, and `hittestchildren="true"` on `.NamePanel` so the remaining label is clickable. |
| `panorama/styles/hud_quickbuy.css` | Imports `base/hud_quickbuy.vcss_c`, then mod overrides: queue positioning, total cost box, divider/remaining-cost label styling. |
| `panorama/styles/citadel_hud_hero_shop.css` | Imports `base/citadel_hud_hero_shop.vcss_c`, then the `#RecentPurchasesPanel` position override (`margin-left: 18%; margin-bottom: 26.2%`). |
| `panorama/styles/base/*.css` | Verbatim stock copies; see Stock Base. |

## Architecture

- **Recipe components**: `RECIPES_RAW` maps 65 upgrade items to prerequisite components (e.g. `Colossus` -> `Extra Health`), keyed by in-game English names because the runtime matches `#ModName` text. Canonicalized via lowercase + stripped punctuation. Source of truth: every `m_vecComponentItems` entry in upstream `scripts/abilities.vdata`, named through `resource/localization/citadel_gc_mod_names/citadel_gc_mod_names_english.txt`. Keep the table an exact mirror of that data, including the three items disabled in vdata (`Aerial Supremacy`, `Apex Combat`, `Timeless Emblem`); they never appear in the queue.
- **Cost math per tick**:
  1. Parse base cost from `#ModCost` text
  2. Deduct prerequisite costs for earlier queued items
  3. Apply 50% sell-queue credit only to the net total; queued sale proceeds are not spendable yet
  4. Incrementally subtract current souls per queue position
  5. Write remaining to `#RecentPurchaseDeficitLabel`
  6. Attach a click handler to the remaining label that can team-chat `Need X more for item`
- **Total summary**: total is the effective queue cost after recipe deductions and planned sell credit, clamped to 0. Per-item remaining souls use current spendable souls only.
- **Panel caching**: `_totalLbl`, `_queuePanel`, `_sellPanel` cached with `.IsValid()` check each tick. Dynamic quickbuy entries are traversed every 50ms in visual order into reused item records; their child references are cached on each entry and reacquired when invalid. Cost math and label writes run only when queue membership/order, item name/cost text, sell queue, child refs, or gold change. Each deficit label gets one `onactivate` handler that reads its current `_lastChatMsg`.

## DOM Traversal Order (Critical)

The stack-based item collection in `getItems()` must preserve DOM top-to-bottom order. Push children in **reverse** to counteract LIFO pop:

```javascript
for (let i = n - 1; i >= 0; i--) stack.push(p.GetChild(i));
```

Forward-order push (`0..n-1`) reverses queue order, causing the wrong item to receive remaining-souls attribution.

## Visual Style Rules

- **Total cost box**: `#RecentPurchaseCostSummary` at top of queue. `background-color: #00000040`, `border: 1px solid #ffffff15`, uppercase `"TOTAL"` label.
- **Per-item remaining**: `#ModCost` is **never overwritten**. Remaining is displayed via `#RecentPurchaseDeficitLabel`; while more souls are needed, the deficit label, base cost, and gold icon use `NEED_COLOR` (`#d64259`). When covered, the label shows `0` and uses `OWNED_COLOR` (`#66ffd9`).
- **Font parity**: Remaining cost and divider use `font-size: 16px; font-weight: bold; vertical-align: center;` to exactly match `#ModCost`.
- **Divider**: The current design intentionally uses `#RecentPurchaseCostDivider` with text ` / ` between base cost and remaining amount.

## Anti-Patterns

- **Do not overwrite `#ModCost`** — always write to `#RecentPurchaseDeficitLabel`.
- **Do not remove `hud_quickbuy_entry.xml`** — the remaining souls labels live there. The base game entry layout does not have them.
- **Do not remove `#RecentPurchaseCostDivider`** — the current layout depends on it for the `$cost / remaining` presentation.
- **Do not remove the click handler on `#RecentPurchaseDeficitLabel`** unless replacing the team-chat flow deliberately.
- **Do not assume `FindChildTraverse('QuickbuyQueue')` returns items in visual order** — always traverse and collect explicitly.

## Validation

1. Compiled output exists in `recent_purchase_compiled/panorama/...`
2. No script errors in Panorama debugger (`F7`)
3. Total cost panel visible when shop open
4. Per-item `/ -X` appears in red when more souls are needed, same font size as base cost
5. First queued item gets reduced first as souls increase
