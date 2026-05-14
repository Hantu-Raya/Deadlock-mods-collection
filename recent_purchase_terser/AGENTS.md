# AGENT GUIDE: recent_purchase

## GENERATED STAGING COPY
`recent_purchase_terser/` is regenerated from `recent_purchase/` by
`build_recent_purchase.ps1`. Do not make source fixes here unless the user is
explicitly inspecting generated/minified output. Patch `../recent_purchase/`
and rebuild with:

```powershell
powershell -ExecutionPolicy Bypass -File build_recent_purchase.ps1
```

The build script deletes this folder and copies `recent_purchase/` into it, so
custom guidance here must also exist in the source guide if it needs to survive
the next build.

Project type: Source 2 Panorama UI mod (quickbuy cost tracker).
Primary output: compiled assets in `../recent_purchase_compiled/` → `pak81_dir.vpk`.

## Description
Enhances the Deadlock quickbuy queue HUD with a **Total Cost** summary and
**per-item remaining souls** display. Original item costs are preserved; the
mod adds a `/` divider plus a remaining-cost label, e.g. `$3,200 / -800`.

Build scripts copy this guide into `recent_purchase_terser/`. If this file is
read from the terser folder, treat that folder as generated staging output and
patch `recent_purchase/` instead.

## Build

```powershell
# Direct staging compile only
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\recent_purchase_terser"

# Pack + deploy (single-file VPK)
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\recent_purchase_terser_compiled" -o "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak81_dir.vpk" -s --no-progress
cp "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak81_dir.vpk" "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak81_dir.vpk"
```

## Source Files

| File | Purpose |
|---|---|
| `panorama/scripts/recent_purchase_queue_costs.js` | Core logic. 50ms polling loop, cost parsing, recipe component deduction, sell queue credit, total cost sum, per-item remaining souls, and click-to-team-chat need messages. |
| `panorama/layout/hud_quickbuy.xml` | Modified stock layout. Adds script include + `#RecentPurchaseCostSummary` panel at top of `.QuickbuyQueueOuter`. |
| `panorama/layout/hud_quickbuy_entry.xml` | Modified stock entry layout. Adds `#RecentPurchaseCostDivider` and `#RecentPurchaseDeficitLabel` inside `.CostPanel`. |
| `panorama/styles/hud_quickbuy.css` | Mod overrides. Queue positioning, total cost box styling, divider/remaining-cost label styling. |
| `panorama/styles/citadel_hud_hero_shop.css` | `#RecentPurchasesPanel` position override (`margin-left: 18%; margin-bottom: 26.2%`). |

## Architecture

- **Recipe components**: `RECIPES_RAW` maps 53 upgrade items to prerequisite components (e.g. `Colossus` -> `Extra Health`). Canonicalized via lowercase + stripped punctuation.
- **Cost math per tick**:
  1. Parse base cost from `#ModCost` text
  2. Deduct prerequisite costs for earlier queued items
  3. Apply 50% sell-queue credit to available souls
  4. Incrementally subtract from available souls per queue position
  5. Write remaining to `#RecentPurchaseDeficitLabel`
  6. Attach a click handler to the remaining label that can team-chat `Need X more for item`
- **Total summary**: total is the effective queue cost after recipe deductions and sell-credit subtraction, clamped to 0.
- **Panel caching**: `_totalLbl`, `_queuePanel`, `_sellPanel` cached with `.IsValid()` check each tick. Dynamic quickbuy entries and labels are traversed every 50ms because the queue is volatile; treat this as a deliberate exception to the repo-wide hot-loop traversal rule unless you are actively optimizing this module.

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

1. Compiled output exists in `recent_purchase_terser_compiled/panorama/...`
   for direct staging builds, or `recent_purchase_compiled/panorama/...` after
   the full `build_recent_purchase.ps1` sync step.
2. No script errors in Panorama debugger (`F7`)
3. Total cost panel visible when shop open
4. Per-item `/ -X` appears in red when more souls are needed, same font size as base cost
5. First queued item gets reduced first as souls increase
