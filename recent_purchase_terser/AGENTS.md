# AGENT GUIDE: recent_purchase

Project type: Source 2 Panorama UI mod (quickbuy cost tracker).
Primary output: compiled assets in `../recent_purchase_compiled/` → `pak81_dir.vpk`.

## Description
Enhances the Deadlock quickbuy queue HUD with a **Total Cost** summary and **per-item remaining souls** display. Original item costs are preserved; remaining needed is shown in red parentheses: `$3,200 (-800)`.

## Build

```powershell
# Compile only
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\recent_purchase"

# Pack + deploy (single-file VPK)
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\recent_purchase_compiled" -o "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak81_dir.vpk" -s --no-progress
cp "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak81_dir.vpk" "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak81_dir.vpk"
```

## Source Files

| File | Purpose |
|---|---|
| `panorama/scripts/recent_purchase_queue_costs.js` | Core logic. 50ms polling loop, cost parsing, recipe component deduction, sell queue credit (50%), total cost sum, per-item remaining souls. |
| `panorama/layout/hud_quickbuy.xml` | Modified stock layout. Adds script include + `#RecentPurchaseCostSummary` panel at top of `.QuickbuyQueueOuter`. |
| `panorama/layout/hud_quickbuy_entry.xml` | Modified stock entry layout. Adds `#RecentPurchaseDeficitLabel` + divider labels inside `.CostPanel`. |
| `panorama/styles/hud_quickbuy.css` | Mod overrides. Queue positioning, total cost box styling, remaining souls visibility toggle. |
| `panorama/styles/citadel_hud_hero_shop.css` | `#RecentPurchasesPanel` position override (`margin-left: 18%; margin-bottom: 26.2%`). |

## Architecture

- **Recipe components**: `RECIPE_COMPONENTS_RAW` maps ~50 upgrade items to prerequisite components (e.g. `Colossus` → `Extra Health`). Canonicalized via lowercase + stripped punctuation.
- **Cost math per tick**:
  1. Parse base cost from `#ModCost` text
  2. Deduct prerequisite costs for earlier queued items
  3. Apply 50% sell-queue credit to available souls
  4. Incrementally subtract from available souls per queue position
  5. Write remaining to `#RecentPurchaseDeficitLabel`
- **Panel caching**: `_totalLbl`, `_queuePanel`, `_sellPanel` cached with `.IsValid()` check each tick.

## DOM Traversal Order (Critical)

The stack-based item collection in `getItems()` must preserve DOM top-to-bottom order. Push children in **reverse** to counteract LIFO pop:

```javascript
for (let i = n - 1; i >= 0; i--) stack.push(p.GetChild(i));
```

Forward-order push (`0..n-1`) reverses queue order, causing the wrong item to receive remaining-souls attribution.

## Visual Style Rules

- **Total cost box**: `#RecentPurchaseCostSummary` at top of queue. `background-color: #00000040`, `border: 1px solid #ffffff15`, uppercase `"TOTAL"` label.
- **Per-item remaining**: `#ModCost` is **never overwritten**. Remaining displayed via `#RecentPurchaseDeficitLabel` as a red negative deficit while more souls are needed.
- **Font parity**: Remaining cost uses `font-size: 16px; font-weight: bold; vertical-align: center;` to exactly match `#ModCost`.
- **Visibility**: Parentheses + remaining label hidden when `remainingSoulsCost <= 0` (via `.HasRemainingSoulsNeeded` class).

## Anti-Patterns

- **Do not overwrite `#ModCost`** — always write to `#RecentPurchaseDeficitLabel`.
- **Do not remove `hud_quickbuy_entry.xml`** — the remaining souls labels live there. The base game entry layout does not have them.
- **Do not use `/` divider** — that is Enhanced Quickbuy's visual style. Use `(-X)` for differentiation.
- **Do not assume `FindChildTraverse('QuickbuyQueue')` returns items in visual order** — always traverse and collect explicitly.

## Validation

1. Compiled output exists in `recent_purchase_compiled/panorama/...`
2. No script errors in Panorama debugger (`F7`)
3. Total cost panel visible when shop open
4. Per-item `(-X)` appears in red, same font size as base cost
5. First queued item gets reduced first as souls increase
