# Ticket 25 documentation audit — Astra

Read-only review of `.scratch/hpv3_scopes/brief-25.md`, ticket 25, the lane AGENTS/CONTEXT/ENGINE/LIVE-VERIFIED/MAP/PLAN/SPEC files, all six ADRs and the root v3 lane entry. Current source and existing ticket evidence were inspected; no runtime suites, generators, builds, deployment or launches were run. This report is the only repository write.

## P0–P1

None found.

## P2

### 1. The renderer contract omits the required HP-row alignment exception

**Locations:** `PLAN.md:52`; `SPEC.md:102`.

Both describe the hero name's explicit `center` restoration as the only exception to clearing absent inline styles with `null`. Current `panorama/scripts/hp_colors_v3_renderer.js:907-911` also restores the HP readout row's `horizontalAlign` to `right`. This is not optional cleanup: ticket 22 records that clearing this alias throws and aborts preview painting (`issues/22-styling-show-bounds-and-own-hud-color.md:175-192`). Following the purported complete contract can reintroduce that native failure.

**Fix:** document both exceptions, preferably by routing these passages to one authoritative restoration contract rather than maintaining separate incomplete copies.

### 2. Rules are repeated across documents, and the test policy already disagrees

**Locations:** `AGENTS.md:33,37,39,46-47`; `PLAN.md:75,80-86,98`; `SPEC.md:100-101,126`; `ENGINE.md:26-29`.

The release rule, CSS ceilings, storage conflict/recovery policy and source-text assertion policy are restated rather than routed to their owners. The last has already diverged: SPEC says a test “never greps source text,” while AGENTS and PLAN explicitly permit the package asset contract to inspect source/asset text. An agent following SPEC can reject an explicitly permitted packaging guard. This also fails the requested single-location rule policy.

**Fix:** choose one normative home per rule, replace duplicate prescriptions with links, and retain the package-contract exception in the authoritative test policy. Keep ADR rationale and engine evidence, but avoid making each another copy of operational instructions.

## P3

### 3. The glossary contains implementation and protocol guarantees

**Locations:** `CONTEXT.md:78,86`.

The relay definition specifies a sibling panel communication arrangement; the CAS definition specifies raw-record checksums and cross-native-browser transaction limits. These describe implementation choices and guarantees, not just the terms' domain meanings. The brief and CONTEXT format explicitly require a glossary devoid of implementation details.

**Fix:** keep short definitions of relay and compare-at-commit here; move the sibling transport detail to the implementation contract and checksum/native-page limitations to ADR 0002 or the storage contract.

### 4. The mask fact points to the wrong live-evidence ticket

**Location:** `ENGINE.md:27`.

The linked ticket 22 does not record the `opacity-mask: none` observation. The actual user report, cause and regression are in `issues/19-styling-bar-style-v2-and-old.md:59-72` (“Live 6782: stock mask stayed on V1/OLD”). The claim itself has recorded support, but the evidence link sends a reviewer to an unrelated failure and VM tests are not a substitute for that report.

**Fix:** link directly to ticket 19's live section. No new live run is needed to repair this citation.

### 5. The preview description incorrectly promises one cancellation token

**Location:** `SPEC.md:116`.

The spec says scheduled preview work is cancelled through one generation token. The implementation deliberately has independent play and layout-settle tokens/jobs (`panorama/scripts/hp_colors_v3_preview.js:71,298-333`); `cancel()` invalidates both. The distinction prevents one stale callback from clearing the other job and should not be described as a single-token design.

**Fix:** describe cancellation of both independently guarded schedules, or omit this implementation detail from the behavioral spec.

### 6. The live ledger omits the recorded centering recheck

**Location:** `LIVE-VERIFIED.md:12-13`.

The latest framing entry still records the old approximately 41% horizontal center. Current preview framing was subsequently centered at 50%, and ticket 22c already records a native recheck on debug `348f2fc2`, with `.scratch/hpv3_live1/22c_live11_centre.png` (`issues/22c-preview-hero-model.md:797-807`). That screenshot exists. The ledger's opening rule requires rechecking touched features, but omitting the completed recheck makes current centering acceptance undiscoverable from the designated ledger.

**Fix:** retain the old build-scoped observations and add the existing live-check-11 evidence, explicitly scoped to default width. Do not extend it to wide-bar parity.

### 7. The maintainer story still promises generated documentation

**Location:** `SPEC.md:84`.

Story 47 says a schema row makes the menu, codes, saves **and docs** follow automatically. The new implementation decision at `SPEC.md:95` and `PLAN.md:32` explicitly says no documentation settings table is generated; `tools/generate.js:248-264` confirms there is no documentation output. The ticket's implementation note says this absent deliverable was corrected, but the user story still promises it.

**Fix:** remove automatic documentation generation from the implemented story, or explicitly mark it as deferred rather than claiming through-24 implementation covers it. This docs-only ticket should not add generator functionality.

## Checks and positive findings

- Lane AGENTS is **54 lines**, within the 100-line cap, and contains rules/routing rather than release history. The root v3 entry is one line and links to it.
- A static script checked **121 Markdown relative links/anchors across 14 ticket-25 documents**: no missing destinations or anchors. The incorrect evidence destination above is semantic, not a broken link.
- All seven distinct command targets exist, including the v2 storage suite; wrapper source supports `-SkipDeploy` and the native PowerShell `-Debug` switch, with the documented build-only output paths. Both generator CLIs implement `--check`. The external hosted source path exists.
- Source inspection corroborated generated/source boundaries, settings/control-id shapes, record v12, 128 presets, 4,096/32,768/192,000 character caps, 40-entry Undo, eight-row pagination, signature slots/tiers, scheduler intervals, selector limits, routing precedence, CAS capability checks and one-way QOLLOCK composition.
- All six ADRs record meaningful compatibility/boundary trade-offs with real alternatives; none needs removal on the supplied ADR criteria.
- Tickets 23/24 are explicitly not live-verified. The cited combined suite totals match the existing ticket-24 audit record, not a new run. Inspected live claims have recorded support; the mask citation and missing centering row above need repair. Retained screenshot/performance paths inspected for the ledger exist.

## Fixes

Docs25 addressed all seven findings with Markdown-only changes:

1. Added the single renderer restoration contract in SPEC: exact captured-value restoration, shorthand clears, explicit hero-name `center` and HP-row `right`, plus the independent topbar cooldown fallback. PLAN and AGENTS now route to it.
2. Kept release/recomposition, CSS ceilings and behavioral-test policy (including the package-contract source-text exception) normative in AGENTS. Centralized storage readiness, reconciliation, conflict/retry and recovery in SPEC; PLAN and the storage ADRs now route to that contract, with ADRs retaining rationale and limitations. ENGINE retains observations rather than duplicate prescriptions.
3. Reduced Relay and CAS glossary entries to domain definitions. Sibling routing remains in SPEC's transport description; checksum/native-page limitations remain in ADR 0002.
4. Corrected the mask observation's evidence link to ticket 19's “Live 6782: stock mask stayed on V1/OLD” section.
5. Corrected SPEC's preview cancellation description to independently guarded play and layout-settle schedules.
6. Added the already-recorded debug `348f2fc2` live-check-11 centering evidence to the ledger, scoped to default width; older observations remain build-scoped, and wide-bar parity is not claimed.
7. Removed automatic documentation generation from maintainer story 47; prose remains separately maintained.

Verification: the relative-link/anchor script passed **223 links across 68 source Markdown documents, zero broken** (excluding `.build/` and `.tmp/`, including root AGENTS). Lane AGENTS is **53 lines**. No runtime suites, generators, builds, deployment, publication or launches were run. No code file was edited; Main's menu changes were untouched.
