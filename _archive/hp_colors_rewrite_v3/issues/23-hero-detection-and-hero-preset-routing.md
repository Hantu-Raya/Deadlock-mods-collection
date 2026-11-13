# 23: Hero detection and hero preset routing

**What to build:** Automatic hero detection and a hero-to-preset map plus default preset.

**Blocked by:** 22

**Status:** implemented — VM-verified; not live-verified

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [x] Stale identity callbacks rejected
- [x] Matches SPEC stories 35, 37
- [x] VM E2E tests boot the real scripts and pass

## Implementation

- The menu watches the local TopBar hero even while closed: two samples settle/clear identity, with 1 s play/transition and 5 s lobby/hideout/postgame polling. Cached refs, watch generations and lifecycle epochs reject stale polls and deferred routes.
- Native bundle metadata stores `heroPresets`, `heroDefault` and validated `sourcePresetId`/`sourceWasMapped`. Source persistence preserves same-source edits across restart; these fields never enter settings-only codes or world messages. The existing metadata wire grammar needs no record-version bump.
- HEROES opens one searchable, eight-row paged picker; DEFAULT is exclusive, including the built-in default. Routing edits share settings Undo. Automatic routing adds no Undo and waits for slider/color sessions; hideout drops to default, pregame/unknown identity preserve settings.
- Delete clears references and source, reorder preserves mapping, ordinary IMPORT leaves active metadata unchanged, and REPLACE ALL restores/remaps references while dropping missing targets. The conservative merge treats each routing field as a whole metadata key.
- V2 conversion resolves first Selected → first matching Except → first All against the current catalog, then removes legacy preset/scope routing fields. **Known ceiling:** heroes added to a later catalog fall to `heroDefault`, not an earlier All-Except preset.
- Tests: 17 VM-seam routing cases in `tests/hero-routing.test.js`, including the three red-first corrections recorded in `audit-23-astra.md`; updated migration, menu/preview scheduler and gated-debug logging regressions. Final canonical suite **1085/1085**, QOLLOCK **24/24**, v2 storage **48/48**; both generator `--check`s current. Existing per-bar operation ceilings remain green; combined HUD/identity watch measures 27.6 counted operations/s under the unchanged 30/s HUD ceiling.
- No paks built, deployment or game launch; `LIVE-VERIFIED.md` unchanged.
