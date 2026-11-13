# Preview bar prototype failure modes

Throwaway prototype for ticket 10, written before the code. Question: can the renderer prototype's `plan`, plus its apply contract, draw a fake bar tree in the ESC menu? The preview has an HP slider and a damage/heal play button, and must not touch stock settings previews, real world bars or the menu's scheduler after close. This list covers the preview slice only. Renderer-internal failures are in [the renderer list](../renderer/FAILURE-MODES.md).

## Isolation: stock panels and world bars

- **Id lookups escape the preview.** If the fake tree reuses stock ids (`UnitHealthbar`, `UnitHealthbarValue`, `unit_healthbar_lagging`), a `FindChildTraverse` from the menu root, or from any shared ancestor, can return a stock or world panel. The renderer would then own and restyle a real bar.
- **Class scans pick up the fake tree.** If the fake tree carries real carrier classes (`player`, `enemy`, `friend`, `boss_tier1`), stock CSS or another script's class scan can treat the menu bar as a world unit. The same applies to a v2 or v3 world script calling `FindChildrenWithClassTraverse("UnitHealthbarContainer")` from a shared root.
- **The renderer self-boots on include.** Including `renderer.js` in the menu layout boots it on the menu's context panel. It climbs the menu's ancestors looking for `WindowRoot` and a carrier, runs `discover()` on the menu root, and keeps a 1 s dormant loop alive for as long as the menu exists.
- **The part map is not proven local.** If the part map is resolved once and never checked, a part may sit outside the preview pane: a typo'd id that collides, or a panel re-parented by another mod. Apply then writes styles or calls `SetParent` outside the pane.
- **HP-text adoption moves the wrong label.** It moves a stock label, or a release restores the preview label into a parent outside the pane.
- **Stock previews lose their events.** If preview ids collide with stock settings previews (`CitadelColorPicker` swatch, settings share preview) or with v2 menu ids, `SetPanelEvent` overwrites their `onactivate` or `onvaluechanged` handlers.
- **A malformed settings record reaches style writes.** The record comes from the menu, so a wrong type, a non-hex colour or `NaN` would produce writes such as `#NaN` or `NaNpx`.

## Scheduler and lifecycle

- **ESC closes the menu without calling the preview's `close()`.** The play sequence or settle retries keep firing. The preview must have no perpetual loop, so the worst case is bounded.
- **A stale callback runs after close.** `close()` cancels the current job, but a callback from an older generation still runs and repaints after close. Every callback must check a generation token.
- **Reopening duplicates work.** Reopen, a double `open()` or a second play press starts a second sequence that interleaves with the first.
- **The pane dies mid-sequence.** The pane is deleted or the layout reloaded during a sequence, and the next step touches invalid panels.
- **Delays use the wrong unit.** Seconds and milliseconds are confused, so steps run 1000 times too slowly or too fast.
- **The pane opens unlaid.** It is zero-sized on open because layout runs a frame later. `plan` returns a release, so the bar stays stock forever unless a bounded settle retry repaints once layout exists. The retries must also stop once it does.

## Input races

- **Play races the slider.** A step overwrites the value the user just dragged to. Or the preview's own slider write fires `onvaluechanged`, synchronously or a frame later, and cancels the sequence it is running.
- **The page switches mid-animation.** The sequence keeps stepping with the old kind's names and HP scale. Or the old kind's captured stock is restored onto the new kind's stock look.
- **The side switches mid-animation.** Same as a page switch.
- **Kinds switch in the wrong order.** Release must restore the old capture before the new kind's stock look is written. Otherwise the new kind inherits the old kind's captured stock (the renderer's recycle failure, reproduced in the menu).
- **Settings change during play.** The next step must use the new settings, without restarting or duplicating the sequence.

## Fidelity: fake tree versus real lineage

- **The lineage diverges.** The fake tree's depth and parents differ from `UnitStatus > InfoHealthContainer > UnitHealthbarsContainer > UnitHealthbar.UnitHealthbarContainer > UnitHealthbarInner > unit_healthbar_lagging` (plus `InfoHealthContainer > UnitHealthbarValue`). Plan geometry (`position`, `width`, HP-text adoption into the bar) then means something else in the menu.
- **The eligibility rule diverges.** The preview's rule differs from the renderer's `carrierFacts`, for example painting an ally hero while world ally bars stay stock.
- **The apply copy diverges.** The renderer prototype exports only `plan`; its `apply` is bound to its stock-id cache. A preview-side apply can drift from the renderer's ledger contract: first-write capture, explicit stock release, diff-only writes, and `SetParent` adoption and restore.
- **The pinned stock differs.** The preview's stock fallbacks differ from the renderer's, so a release looks different in the menu than on a world bar.
- **The stock look is only approximate.** CSS approximates the stock image, wash, sizes and fonts. NPC and objective geometry is not pinned anywhere in v3 yet.
- **The health signal bypasses probing.** The preview feeds the fraction directly, while world bars measure clip and width. Probe and parse bugs therefore never show up in the preview.
- **UI scale differs.** Menu panels and world panels have different `actualuiscale`, so pixel settings appear at menu scale rather than world scale.

## Evidence boundary

Node VM tests can cover: id and lineage isolation against the stock and v2 layouts, slider repaint, play start and end, slider cancelling play, close and page-switch cancellation by generation token, kind following the page, zero writes outside the pane, an empty scheduler after close, and plan and apply equivalence with the real `renderer.js` on a stock-lineage fixture.

Only an in-game look can confirm:

- the look itself: wash on the stock fill image, fonts and sizes;
- whether XML `Slider` events fire synchronously;
- whether the ESC close path reaches `close()`;
- stock escape-menu CSS reacting to lineage classes;
- menu UI scale.
