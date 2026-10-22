# 24: Ability conditions

**What to build:** Ability signature-tier conditions on settings.

**Blocked by:** 23

**Status:** implemented — VM-verified; not live-verified

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [x] Matches SPEC story 36
- [x] Conditions use the shared Undo stack
- [x] VM E2E tests boot the real scripts and pass

## Implementation

- Native `rules[settingSlot] = {slot, minTier, value}` covers every live schema cell. Record v12 encodes sparse rule quadruples in active settings, presets, settings/bundle codes and saves; normal validation, caps and newer-save protection apply. Older v3 `v2conditions` and v2 imports map legacy keys/sides once, drop retired keys and remove the old metadata.
- Authored settings and rules stay in edits, presets, saves, codes and shared Undo snapshots. Only publication/preview resolve matching values and normalize crossed thresholds; polls with identical effective settings publish nothing and do not advance revisions. Preset application replaces rules; page reset removes its rules in the same single Undo entry.
- Ticket 23's watcher samples only referenced LOCAL signature slots, selects the highest Tier class, caches/repairs panel refs, rejects spectator tiers and clears observations on hero/epoch changes or newly referenced slots. Stale generations/epochs cannot sample or schedule. World rendering is unchanged.
- Every row, including search results, has a marked condition action. One isolated dialog supports cycling slots/tiers, boolean/enum/number/colour editors, native picker, Apply/Remove/Cancel and Escape. Picker drafts never edit authored settings. Automatic routes wait for the dialog to close. Debug tier/match observations log only changes; release source has no active logging.
- Verification: nine new VM-seam condition cases plus updated migration/metadata/debug regressions; full canonical **1094/1094**, QOLLOCK **24/24**, v2 storage **48/48**. Both generator `--check`s are current. Existing per-bar operation ceilings remain green (baseline active **164.3**, idle **145.7**, dormant **6** operations/s); the no-rule HUD/identity watcher remains **27.6/s** against its **30/s** ceiling.
- No pak builds, deployment or game launch. `LIVE-VERIFIED.md` unchanged; native engine rendering and compiled-release verification remain untested.

## HUD-style slot picker follow-up

- Slots now use off-white discs with dark hero glyphs, number badges, selected accent rings and tier labels; unknown live tiers dim but remain selectable. Icons come from the four signature bindings in pinned `heroes.vdata` plus newly pinned `abilities.vdata` at the same commit. Missing heroes/images use number fallbacks; owned `SetImage` writes occur only when paths change, including hero changes while open. Draft/Undo behavior and Main's UI tooltip/change-gated route-log fixes are preserved.
- Red-first catalog and picker regressions cover real Infernus icons, hero switching, fallback, cached image writes, selection/tier state and pin drift. Final canonical **1101/1101**, QOLLOCK **24/24**, v2 storage **48/48**; both generator `--check`s current. No builds, deployment or launches; native visual rendering remains unverified.
