# Menu mocks

Type: wayfinder:prototype (HITL)
Status: Closed
Blocked by: none

## Question

Which menu structure wins: organised by part of the bar, or by side? With or without Basic/Advanced folds?

## Notes

Two browser mocks in Deadlock's ESC style (`GRILL.md` 9, 11, 19, 20), each with the search toggle (filtered, editable rows; names + help + keywords) and a preview slot that follows the page. Use v2's real settings list for content. No game launch. After the pick, a follow-up prototype checks that a schema-generated page compiles with sr2compiler and keeps stable ids.

## Resolution

Both browser mocks are ready for the user's pick; **no menu structure or fold preference has been selected**.

- [By part](../mocks/by-part.html): Bar, HP Text, Name, Indicators, Units, Presets; enemy/ally side by side, with shared controls below.
- [By side](../mocks/by-side.html): Enemy, Ally, Units, Shared, Presets.
- Both open directly from disk, use the v2 ESC palette/font names, offer editable cross-page name/help/keyword search and a Basic/Advanced-fold toggle, and include an approximate CSS hero/NPC/objective preview with HP slider and damage/heal playback.
- [Extractor](../mocks/extract-settings.js) generated [shared settings](../mocks/settings.js) for all 155 live v2 keys using actual XML names/help and shipped contract defaults/ranges; offsets display in pixels. Stored HP-text offsets are already pixels, while legacy bar/stamina/ultimate/level offsets convert from tenths.
- Browser-tool verification passed both `file://` pages with **zero script/console errors**. `red`, `offset`, `name` returned **10, 24, 18** editable rows respectively. The retained [browser check](../mocks/verify-browser.js) also verifies full setting reachability, folds, help search, preview edits, unit-kind switching, snapshot restore/reset and damage/healing phases.

[README](../mocks/README.md) records usage, source evidence, verification and limits. The CSS preview is not the real renderer; system font fallbacks and session-only presets are deliberate mock limits, not Panorama parity claims. No Deadlock launch, build, deployment or benchmark occurred. After the user picks a structure and fold behavior, the next prototype remains schema-generated Panorama rows with stable IDs and a real-renderer preview.

User pick (2026-10-14): **by part** (`mocks/by-part.html`: Bar, HP Text, Name, Indicators, Units, Presets; enemy and ally side by side) **with Basic/Advanced folds**. Next: the follow-up prototype that generates a by-part page from the schema and compiles it with sr2compiler, keeping stable ids; carry Fable's Panorama portability notes from `mocks/README.md`.
