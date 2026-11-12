# DLL tooling findings (Deadlock client 6861)

Static string, xref and disassembly analysis of the installed binaries, done in 2026-11. Nothing here was observed at runtime.

- **Install analysed:** `F:\SteamLibrary\steamapps\common\Deadlock`. `game/citadel/steam.inf` reads `ClientVersion=6861`, `SourceRevision=11219368`, `VersionDate=Nov 09 2026`. All DLLs are dated 2026-11-12, and their PE timestamps fall on 2026-11-09.
- **Pin:** `game-data-pin.json` pins `clientVersion` 6828, so the install has drifted by 33 builds.
- **Method:** `.scratch/dll-research/extract.py` extracts ASCII and UTF-16LE strings with file offsets, RVAs and sections into `strings_<dll>.tsv`. `.scratch/dll-research/dllx.py` adds:
  - function bounds from `.pdata`;
  - an index of `lea reg,[rip+x]` string xrefs;
  - `call rel32` scans;
  - capstone disassembly.
- **IDA:** no IDA, Ghidra or radare2 was found on PATH. The `.i64` databases next to the DLLs are from 2026-07/08, older than the binaries, so they were not used. *Correction 2026-11-13:* the workspace has a managed `native-pe-decomp` skill and a `decomp` tool, but on this machine the tool reports `Installed IDA not found`: `IDADIR` is unset, there is no Hex-Rays config, and the documented `F:/Program Files/IDA Professional 9.0/idat.exe` and `scripts/run-ida-workflow.py` are absent. Round 2 therefore used capstone disassembly of the same hash-bound binaries (see below).
- **Offsets:** "@0x…" is a file offset. "fn 0x…" and "RVA 0x…" are RVAs; the image base is 0x180000000.

Labels:
- **CONFIRMED**: the string or table was found at the stated DLL and offset. For code facts, the instruction sequence was read at the stated RVA.
- **INFERRED**: a reasoned reading of strings or disassembly that runtime has not proved.
- **NOT FOUND**: absent from every analysed DLL (`panorama`, `panoramauiclient`, `client`, `engine2`, `tier0`, `v8`, `v8system`, `panorama_text_pango`, `deadlock.exe`). For the GameUI members, the search covered every DLL under `game/`.

## Ranked tooling improvements

| # | Change | Tool | Evidence | Expected accuracy gain | Effort |
|---|---|---|---|---|---|
| 1 | Replace the project ceiling (10 selectors / 1,024 chars) with the two parser limits, keeping a margin. **(a)** The raw prelude text (from the previous `}`/`;` to `{`) must be ≤ 2,047 bytes; count whitespace and, conservatively, comments. **(b)** Each comma-separated selector must be ≤ 256 chars. Today one 300-char selector passes the 1,024 rule but the engine rejects it. Keep a project margin if wanted, but stop calling it the engine rule. | `tools/lib/stylesheets.js` | CONFIRMED in panorama.dll. **(a)** The read buffer is `mov r8d,0x800` (fn 0x162f90, RVA 0x163260). Token reader 0x148ee0 fails when `len > size-1` (RVA 0x1490f4), then emits `Failed to parse selector` (@0x4d39b0, RVA 0x16342d). This matches the live 6782 failure (37 selectors / ~2.9 KB). **(b)** `_V_strcspn(",")` then `cmp r15,0x100; ja` leads to `Selector exceeds temp buffer size: %s` (@0x4d3e40, RVA 0x166165). INFERRED: no selector-count limit exists. The selector vector grows dynamically (fn 0x165da0), and no count constant was found. | Catches a real failure mode the tool misses (b) and stops over-rejecting valid lists (a) | S |
| 2 | Check property names against the 140 engine-registered properties. Optionally also check the JS style keys after kebab-casing. | `stylesheets.js`, `check-renderer-mutation.js` | CONFIRMED: 140 `CStylePropertyFactory` registrations in panorama.dll (one static initializer each). panoramauiclient.dll and client.dll register the identical 140. The engine's error for anything else is `Invalid property name: %s` (@0x4d3f58). [list](../../.scratch/dll-research/panorama-css-properties.txt) | Turns an in-game `Parsing error` into a build error. Today all 74 used properties and all JS style keys are valid, so this guards against regressions. | S |
| 3 | Reject selector features the parser rejects: the `+` and `~` combinators, at-rules other than `@define`/`@keyframes`/`@import`, pseudo-classes outside the engine set, and type selectors that are not a registered panel type. | `stylesheets.js` | CONFIRMED: `Unsupported combinator in selector: %c` (@0x4d3e18). RVA 0x165b94–0x165c07 accepts `>` and rejects `+`/`~`. `Found unsupported CSS at-rule: %s` (@0x4d3a48). Style-flag table @0x4e1d18 (13 flags). Structural pseudo-classes in fn 0x164a80. `Unknown panel type in style selector: %s` (@0x4d3e90). 505 panel types. [lists](../../.scratch/dll-research/css-selector-pseudo-and-keywords.txt), [panel types](../../.scratch/dll-research/panel-types.txt) | New error classes are caught before live testing. Today the mod uses only `hover focus active disabled descendantfocus not` and `>`, all valid. | S–M |
| 4 | The log scanner should take the `(line,col)` location form. Today `(%d,%d)` lands in `source` and `sourceLine` is null. | `tools/logscan.js` (`\*+ Parsing (error\|warning) on (.+?)(?:\((\d+)\))?:`) | CONFIRMED: format `***** Parsing %s on %s%s:  %s\n` (@0x4c40a8), filled by fn 0xb4cf0 with `error`/`warning` and the location `(%d,%d)` or `(%d)` | Correct file and line mapping for layout/XML errors | XS |
| 5 | Make `cssNeedle` work for messages without arguments. `Failed to parse selector` has no `: %s`, so the current regex never matches it. Add needles for `Selector exceeds temp buffer size: %s`, `Unsupported combinator in selector: %c`, `Found unsupported CSS at-rule: %s`, `Found no selectors: %s` and `Error parsing @keyframe selector: %s`. For `Failed to parse selector`, fall back to the reported line or to the stylesheet preflight result from #1. | `tools/logscan.js` `cssNeedle` | CONFIRMED: the exact strings are in the stylefile.cpp block @0x4d3788–0x4d3fe0. [all diagnostics](../../.scratch/dll-research/panorama-diagnostics.txt) | The most likely CSS failure maps to its rule instead of "file only" | XS |
| 6 | Handle the second JS exception form, `JS Exception!!\n\n(undefined:0) - %s`. Today the message goes into `source` and the entry reports "no message". Also accept the `JS(%s:%d:%d)` form. | `tools/logscan.js` `parseExceptionBlock` | CONFIRMED: the strings are in fn 0xb23ec (@0x4c3df0, @0x4c3e00, @0x4c3ed1). The primary form `JS Exception! *** Skipping rest of script *** \n\n%s\nline:%d, col:%d` + `>> %s` + `   at %s` + `(%s:%d:%d)` already matches. | Fewer unattributed JS errors | XS |
| 7 | Add a test-adapter strict mode. Calling an adapter-only API should fail the test. *(Corrected 2026-11-13: GameUI is not provably fictional. The names are absent from the DLL strings, but QOLLOCK's shipped scripts call `GameUI.CustomUIConfig`, so the binding is probably built from data the string scan cannot see. Unused fakes were removed; `CustomUIConfig` and `Game.GetState` are kept because tests use them.)* | `scripts/hp-colors-panorama-test-adapter.js` | NOT FOUND: none of `CustomUIConfig`, `SetMouseCallback`, `GetCursorPosition` or a JS `GameUI` binding exists in any game DLL, and `GetState` is in no Panorama DLL. The mod's own comment says the Escape context has no GameUI. The mod scripts never call them. | Prevents tests passing against an API that does not exist | S |
| 8 | Fix the adapter's event semantics. **(a)** `RegisterEventHandler` should not call `SetPanelEvent`: these are separate engine mechanisms. **(b)** `RegisterForUnhandledEvent` should allow several handlers per event; the adapter keeps only the last one in `handlers[eventName]`. **(c)** Add an arity check against the engine's declared event argument counts. | adapter | CONFIRMED: `RegisterEventHandler` is in the `$` table (fn 0xafff0, "Register an event handler"). `SetPanelEvent` is a separate panel-prototype method (panorama.dll fn 0x105d50) and also a registered event `SetPanelEvent/2`. Event table: 1,121 registrations with argument counts, [engine-events.txt](../../.scratch/dll-research/engine-events.txt). (a) and (b) are INFERRED semantics. | Tests stop accepting wiring the engine would not run | S |
| 9 | Check `$.DispatchEvent` names and argument counts in the mod against the event table. All 16 event names the mod uses are registered. One mismatch to review: `CopyStringToClipboard` is declared with 2 args, and the mod passes 1. INFERRED: the declared count excludes the target panel. | new lint in `tools/test.js` or `audit-*` | CONFIRMED: registration sites @ client.dll calls to 0x22f7690 | Catches misspelled or invented event names at build time | S |
| 10 | Strengthen build identity. **(a)** Discovery should require `game/citadel/bin/win64/client.dll` beside `steam.inf`. An empty stub tree exists at `G:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\citadel`. **(b)** Record `SourceRevision` and the panorama.dll/client.dll SHA-256 in the pin. **(c)** `doctor` should report a pin drift of 6828 against 6861 installed. The working-tree `discoverDeadlock` (being edited concurrently) already resolves F: through `libraryfolders.vdf`, so the old hard-coded `G:\SteamLibrary\...` default is gone. | `tools/lib/toolchain.js`, `game-data.js`, `doctor.js` | CONFIRMED: steam.inf fields as above. engine2.dll parses `ClientVersion`/`PatchVersion`/`SourceRevision`/`VersionDate` (@0x52f598–0x52f638) and prints `Build: %d (revision %s)\n` (@0x527bd8). engine2 has compile date/time `Nov  9 2026` / `09:03:02` (fn 0x2047e0). The DLLs have no VERSIONINFO resource. client.dll has no `.rsrc` section at all. | The pin is checked against the real binaries, not just a text file | S |
| 11 | Document that panel `style` longhand unsets are restricted. The renderer's `STYLE_ALIASES` workaround (clear the base, re-set the siblings) matches the engine. Add a mutation-check rule against `style.<longhand> = null`. | `check-renderer-mutation.js` | CONFIRMED: `Cannot set a property alias to undefined, only a base property, we don't support unset of alias alone` (panorama.dll @0x4c22d0) | Guards against a silent no-op | XS |
| 12 | (Needs live verification) Release builds might be able to ship an inline source map. If so, live stack traces would show source lines instead of renamed locals. | `build.js` minifier step | CONFIRMED that the strings exist in the exception handler fn 0xb23ec: `data:application/json;base64,`, `Invalid source mapping url prefix. %s`, `Unable to parse source map json. %s` (@0x4c3d70), `source_map.json`, `mappings`. INFERRED that this maps positions. | Possibly better live triage | M + live test |

## 1. Panorama CSS

### Property names (CONFIRMED)
- **Registration:** panorama.dll registers 140 property factories. Each static initializer passes a name and then `Plat_FatalError("CStylePropertyFactory:  Factory for '%s' already exists!!!!")` (@0x4d5698). Three of the names are the one-letter `x`, `y` and `z`.
- **Same set elsewhere:** client.dll (callers of 0x23e9a80 and 0x23e9bf0) and panoramauiclient.dll (0x195430, 0x1955a0) register the identical 140 names. There are no extra Citadel properties.
- **Limit strings:** `Need to increase size of static g_StylePropertyRegistrations (MAX_PANORAMA_STYLE_SYMBOLS)` and `CStyleSymbol must become larger, cannot fit all style properties in uint8` (@0x4d4730).
- **Full list:** [panorama-css-properties.txt](../../.scratch/dll-research/panorama-css-properties.txt).

Notable members:
- `-s2-mix-blend-mode`, `wash-color`, `pre-transform-scale2d`, `pre-transform-rotate2d`
- `opacity-mask` and its `-position`/`-scale`/`-threshold` variants
- `img-shadow`, `world-blur`, `texture-sampling`
- `ui-scale` and `ui-scale-x/y/z`
- `flow-children`, `ignore-parent-flow`
- `transition-high-framerate`, `transition-frame-time`, `animation-frame-time`
- `sound`, `sound-out`, `tooltip-*-position`, `context-menu-*-position`
- `layout-position`, `border-brush`, `opacity-brush`, `border-image-*`

Not registered: `outline`, `filter`, `display`, `top`, `left`, `gap` and any `-webkit-*` property.

**Mod comparison:**
- The v3 sheets (`hp_colors_v3_menu.css`, `hp_colors_v3_world.css`, generated `unit_status_v2.css`) use 74 distinct properties. All 74 are registered: [mod-css-properties.txt](../../.scratch/dll-research/mod-css-properties.txt).
- The other lane sheets have none outside the set.
- All 14 `panel.style.<camelCase>` keys in the mod scripts map to registered properties. The keys in `STYLE_ALIASES` (margin, font, animation, border longhands) are registered too.

### Selectors, pseudo-classes, at-rules
- **Style flags (pseudo-classes), CONFIRMED** in the pointer table @0x4e1d18 (16-byte entries): `hover focus active disabled enabled inspect selected descendantfocus parentdisabled layoutfailed activationdisabled hscroll vscroll`.
- **Structural pseudo-classes, CONFIRMED** in selector-parser fn 0x164a80: `:not(`, `first-child`, `last-child`, `nth-child`, `nth-last-child` and the arguments `odd`/`even`. It also calls `panorama::InternalMakeSymbol`.
  - INFERRED: unknown pseudo-class names may be interned as symbols rather than rejected. This is unproven, so tooling should whitelist.
- **Combinators, CONFIRMED** (fn 0x165967): the descendant combinator (space) and `>` are accepted. `+` and `~` are parsed and then rejected with `Unsupported combinator in selector: %c`. Type selectors are checked against the panel registry (`Unknown panel type in style selector: %s`).
- **At-rules, CONFIRMED** (fn 0x162f90, compared with `V_stricmp_fast`): `@define`, `@keyframes`, `@import`. Anything else gives `Found unsupported CSS at-rule: %s`. There is no `@media`, `@font-face` or `@supports`.
  - `@define` errors: `@define name is invalid (use A-Z,a-z,_-): %s`, `Conflicting @define value for '%s', was '%s', new '%s'`, `@define missing colon/semicolon`, `Error parsing @define value`.
  - `@keyframes` errors: `Invalid @keyframe name (missing quotes or empty)` (quotes are required), `Missing opening brace for @keyframe`, `Error parsing @keyframe selector: %s`, `%s property listed in a keyframe but marked as cannot transition`, `Failed to parse properties for keyframe: %s`.
  - `@import` errors: `A style file cannot import itself`, the "already included" message, `@import missing semicolon`, `Error parsing @import url '%s'`, `Unable to @import style file '%s'`.
- **Mod usage:**
  - pseudo-classes `hover`(34) `focus`(31) `active`(23) `disabled`(6) `not`(5) `descendantfocus`(1);
  - combinator `>` (3);
  - at-rules `@keyframes` (35), `@define` (20), `@import` (2).
  - Everything is supported.

### Hard limits
- **Selector-list text, CONFIRMED (code):** ≤ 2,047 bytes, from a 0x800 buffer. See improvement #1.
  - INFERRED: the reader copies whitespace and newlines verbatim after skipping leading whitespace. Whether comments inside the prelude count is unproven, so count them.
- **Single selector, CONFIRMED (code):** ≤ 256 chars between commas (`cmp r15,0x100`).
- **Number of selectors per rule:** NOT FOUND. No constant exists, and the vector grows dynamically.
- **Number of properties:** CONFIRMED (string) a uint8 symbol space, plus the `g_iStylePropertyIndexNextFree < 255` assert. This is an engine-internal limit, not one a mod can hit.
- **Max classes, nesting, keyframes count:** NOT FOUND (no limit strings or constants located).
- **Files:** `Error loading %s: paths to css files cannot contain '..'` (@0x4c06c8). `Found duplicate <styles /> tag; only one per file permitted.` (@0x4a90f0).

### Values, units, easing, colour functions
- **CONFIRMED value keywords** (@0x4d2500–0x4d3780, used by parsers 0x148000–0x152000):
  - easing: `ease ease-in ease-out ease-in-out linear cubic-bezier`
  - animation: `normal reverse alternate alternate-reverse forwards backwards both infinite`
  - transforms: `translate3d translatex/y/z scale3d scalex/y/z rotate3d rotatex/y/z skew skewx skewy`
  - layout: `fit-children fill-parent-flow( width-percentage( height-percentage(`
  - fills: `gradient( linear radial from to color-stop( hsv-transform opacity-transform url(`
  - other: `transparent none unset auto`
  - cursors and repeat modes.
  - INFERRED: `rgb`, but not `rgba`, is a referenced keyword (rgba NOT FOUND as a separate string; `#RRGGBBAA` is the format used, `#%02X%02X%02X%02X` @0x4d2b00 region).
- **Output formats, CONFIRMED** in that region: `%spx`, `%s%%`, `%sms`, `%ss`, `%sdeg`. They suggest the units px, %, ms, s, deg.
  - `em ex px cm mm in pt pc` are referenced only by the SVG parser (fn 0x12bbf2), not the CSS length parser.
  - `vh`, `vw`, `rem`, `rad` and `turn`: NOT FOUND.
- **Blend modes** (fn 0x189c10): `normal multiply screen additive opaque overlay hardlight linearburn darken …`.
- **Overflow values:** `squish clip scroll noclip`.
- **List:** [css-selector-pseudo-and-keywords.txt](../../.scratch/dll-research/css-selector-pseudo-and-keywords.txt).

### Error message formats for the log scanner (CONFIRMED)
- **Logging channels** are registered via `tier0!LoggingSystem_RegisterLoggingChannel`: `Panorama` (fn 0x48d90), `PanoramaScript` (fn 0x48dd0) and `VScript` (fn 0x6cd00).
  - INFERRED: these are the `[Panorama]` and `[PanoramaScript]` console prefixes.
- **Parse errors:**
  - Format: `***** Parsing %s on %s%s:  %s\n`, where %s is `error` or `warning`, the location is `(%d,%d)` or `(%d)`, and two spaces precede the message.
  - Prefix `P:%s`.
  - Alert text: `Error parsing layout and style files` (@0x4c40c8).
- **JS errors:**
  - `JS Exception! *** Skipping rest of script *** \n\n%s\nline:%d, col:%d`, followed by `\n\n>> %s`, `\n   at %s` and `\n(%s:%d:%d)`.
  - `JS Exception!!\n\n(undefined:0) - %s`.
  - `\nJS(%s:%d:%d)\n%s\n%s\n` (fn 0xb2d9a).
  - The word `Uncaught` comes from V8 (`Uncaught %` @v8.dll 0x26bd220, `Uncaught (in promise)` @0x273b810).
- **FATAL:** `FATAL ERROR: ` (tier0.dll @0x327f18).
- **Layout warnings:**
  - `Invalid content width (flChildWidth = %f) calculated during child panel "%s"; this panel "%s" (reverting to %f…` (@0x4c9ce0); the height variant is @0x4c9c60.
  - `**** Panel %s has …` (@0x4c9560–0x4c9620).
  - `**** Failed to parse panel property %s: %s` (@0x4c9310).
  - `**** Ignoring panel property %s: %s. Always false.` (@0x4c93d0).
- **Other:** `Trying to apply missing animation: %s` (@0x4e1f60), `Failed to add include for file: %s` (@0x4d3740), `Invalid value for property '%s': %s` (@0x4c2420), `Failed to parse style value for %s` (@0x4c2448).
- **All panorama-owned diagnostics (250):** [panorama-diagnostics.txt](../../.scratch/dll-research/panorama-diagnostics.txt).

## 2. Panorama JS API

### `$` functions (CONFIRMED)
- **Location:** panorama.dll fn 0xafff0 registers `$` plus 28 functions, each with a doc string: [js-dollar-api.txt](../../.scratch/dll-research/js-dollar-api.txt).
- **The 28 functions:** `Msg AssertHelper Warning DispatchEvent DispatchEventAsync RegisterEventHandler RegisterForUnhandledEvent UnregisterForUnhandledEvent FindChildInContext AsyncWebRequest("disabled") CreatePanel CreatePanelWithProperties(DEPRECATED) CanLocalize Localize ConstructString ConstructMFString Language Schedule CancelScheduled FrameTime GetContextPanel RegisterKeyBind Each DbgIsReloadingScript HTMLEscape LogChannel BImageFileExists MousePosition`.
- **`UnregisterEventHandler`:** exists only as the C++ `CUIEngine::UnregisterEventHandler` and is NOT in the JS table.
- **`$()`:** `FindChildInContext()/$() require an id selector (start with #) for now` (@0x4c3580).
- **Mod usage:** the mod uses 9 of these functions, all present. Its other `$.HPColors…` names are mod-owned globals.

### Panel methods and properties (CONFIRMED)
- **Base table:** client.dll fn 0x2318ee0 (panoramauiclient.dll fn 0xd93e0 has the same names) registers 113 distinct names. Each uses its own call template, so arity cannot be read from strings.
  - INFERRED: methods that share a template have the same signature (for example `AddClass` and `RemoveClass` both use 0x2308ea0).
- **Per-type tables** (type labels are INFERRED from names):
  - TextEntry 0x23567f0
  - DropDown 0x2363e20
  - Image 0x235cf30 (`SetImage SetImageFromPanel SetScaling`)
  - Label 0x2334b40 (`text SetLocString SetAlreadyLocalizedText`)
  - Movie 0x23907b0
  - Slider 0x23a0c10
  - HTML-like 0x23addd0 (`SetURL SetIgnoreCursor`)
  - cycle button 0x233c8d0
  - carousel 0x239b380
- **Prototype methods:** `SetPanelEvent` and `RunScriptInPanelContext` are added by panorama.dll fn 0x105d50. `paneltype` is referenced by fn 0x10da30 (INFERRED to be a property accessor).
- **No dialog-variable getter:** there is no `GetDialogVariable*` in any DLL (NOT FOUND).
- **Lists:** [js-panel-api.txt](../../.scratch/dll-research/js-panel-api.txt).

### Event names (CONFIRMED)
- client.dll registers 1,121 events through 0x22f7690, each with a declared argument count.
- panoramauiclient.dll registers a 284-event subset plus `CloseConsole` and `SetConsoleUIVisible`.
- File: [engine-events.txt](../../.scratch/dll-research/engine-events.txt).
- All 16 event names the mod dispatches or registers are present:
  - ClientUI_FireOutput, UIShowTextTooltip, UIHideTextTooltip, CopyStringToClipboard, TextEntryCopyToClipboard, TextEntryInsertFromClipboard, TextEntryChanged, ExternalBrowserGoToURL
  - CitadelConCommand, Activated, CitadelColorPickerColorChanged, HTMLTitle, HTMLURLChanged, SliderReleased
- Argument counts match the reading "declared count excludes the target panel", except `CopyStringToClipboard`: declared 2, mod passes 1 (INFERRED).

### Panel types (CONFIRMED)
- There are 505 registrations through client.dll 0x231a090 (r8 = name): [panel-types.txt](../../.scratch/dll-research/panel-types.txt).
- `Frame` is not among them (INFERRED to be registered elsewhere or absent).

### Adapter compared with the engine
- **Mod calls against the engine:** every panel method the mod calls (33 names) exists as a string in client.dll and panoramauiclient.dll and appears in the matching registration table.
- **Adapter-only APIs (fiction):**
  - `GameUI.CustomUIConfig`, `GameUI.GetCursorPosition`, `GameUI.SetMouseCallback`: NOT FOUND in any game DLL.
  - `Game.GetState`: NOT FOUND in any Panorama DLL.
  - The `paneltype` field exists in the engine (see above). The mod reads `paneltype || type`, which is safe.
- **Semantic gaps (INFERRED):**
  - `RegisterEventHandler` is routed into `SetPanelEvent`.
  - `RegisterForUnhandledEvent` keeps one handler per event name.
  - `DispatchEvent` always returns `true`.
  - `$` is an object, not callable. The mod never calls `$()`.
- **Engine APIs the adapter lacks:** 19 `$` functions (`Localize`, `FrameTime`, `Each`, `LogChannel`, `Warning`, …) and most base-panel members, for example `SetDialogVariable*`, `GetAttributeInt`, `BLoadLayoutSnippet`, `actuallayoutwidth`/`desiredlayout*`, `ScrollToTop`, `ScrollParentToMakePanelFit`.
  - The mod calls `ScrollToTop`, `ScrollParentToMakePanelFit`, `SetURL`, `SetIgnoreCursor`, `TriggerClass` and `BLoadLayout`, but the adapter's MockPanel does not define them. Tests either stub them ad hoc or do not reach them; this was not traced.

## 3. Game data the world bars expose

- **Unit status overlay (world bars).** C++ `CUnitStatusOverlayV2` loads `unit_status_overlay_v2.xml` (@0x2d1c430). It looks up these panels (fn 0x1e7c2c0, CONFIRMED):
  - `StatusEffects UnitHealthbarsContainer UnitHealthbar UnitHealthbarValue`
  - `UnitShieldbar UnitShieldbarValue` (absent from the stock XML; INFERRED to be legacy)
  - `StaminaContainer HealthbarEdgeWidth`
- **Dialog variables on the world bars:**
  - CONFIRMED in this code: `health`, `name` and `player_level`. Only these three are set with SetDialogVariable* there.
  - The stock XML also uses `{i:neutral_bounty}`, `{i:stacks}` and `{s:status}`. `neutral_bounty` is set at client.dll RVA 0xa5c785, outside the overlay code.
  - **`health` is a sum:** `SetDialogVariableInt("health", [rdi+0x30]+[rdi+0x28]+[rdi+0x20])` (RVA 0x1e8fac8–0x1e8faf1). The value is the sum of three internal integer fields, and strings cannot tell which ones.
- **Classes set by C++ (CONFIRMED strings in fn 0x1e8f621 / 0x1e950e9):**
  - `health_total_lg/md/sm/health_total`: chosen by comparing a float with the thresholds `health_total_lg_threshold` and `health_total_md_threshold`. INFERRED to be a max-HP size bucket.
  - bar layers: `unit_healthbar_lagging/deferred/delta/healing/bullet_shield/ratking_armor`
  - state: `health_hidden unkillable health_assassinate health_critical has_rejuv has_ultimate has_killstreak beingSpectated playerIsBot HideName ShowAllyHealthValue`
  - unit kind: `team relationship` and the entity-class names (`minion midboss boss_tier1…`).
- **Max HP and barrier on world bars:**
  - NOT FOUND as dialog variables. No `max_health`, `barrier`, `shield` or percent variable is set in the overlay code.
  - JS cannot read dialog variables anyway: there is no `GetDialogVariable*` binding. The only Panorama-visible values are the formatted label text (`UnitHealthbarValue`), the layer panels' layout sizes, and the bucket classes.
  - So ticket 51's "Known limits" stands. The percent has to be inferred from bar geometry, and the barrier inflation cannot be separated from that data.
- **Local hero HUD only** (CONFIRMED, client.dll SetDialogVariable sites):
  - `hud_health_container`: `current_health`, `total_health`, `health_regen`, `bullet_shield_current`, `bullet_shield_max` (RVA 0x1c3dab1–0x1c3dbbd, strings @0x2ca8330).
  - `hud_health.xml`: `shieldHealth`, `shieldMaxHealth`, `HealthRegen` (RVA 0x1c425f5).
  - These values are rendered into labels whose text a script in the HUD context could read. That covers only the local player, not other units.
  - This is a possible exact-percent source for the own-HUD bar only. Whether the mod's script context can reach that panel is unverified.
- **Other game data:** `hero_id` (8 sites), `team_networth`, `hero_level` and `gold` are set on menu or HUD panels, not on world bars. The list of 467 names is in [client-dialog-variables.txt](../../.scratch/dll-research/client-dialog-variables.txt); it was built heuristically from the nearest preceding string. Convars include `citadel_unit_status_max_health_per_bar`, `…_max_total_bars`, `…_show_health_value` and `…_max_health_segment_increment` (@0x2d16668…). Neighbourhood dumps: [overlay strings](../../.scratch/dll-research/client-unit-status-overlay-strings.txt), [code strings](../../.scratch/dll-research/client-unit-status-code-strings.txt).

## 4. Build identity and install discovery

- **Version sources:**
  - CONFIRMED: `steam.inf` is the only version source in text form. engine2.dll reads it (fields @0x52f598–0x52f638, `Ignoring unknown field steam.inf: '%s'`).
  - No DLL has a VERSIONINFO resource, and client.dll has no `.rsrc`.
  - CONFIRMED: the PE TimeDateStamps are 2026-11-09 16:55–17:07 UTC, consistent with `VersionDate=Nov 09 2026 10:12:11`.
  - CONFIRMED: engine2 embeds `Nov  9 2026` and `09:03:02` (fn 0x2047e0), and client.dll has `Nov  9 2026` @0x2bed6e0.
  - The build number 6861 and revision 11219368 are not embedded as text (NOT FOUND). INFERRED: `Build: %d (revision %s)` is printed from the parsed steam.inf.
- **Install location:**
  - Steam `SteamPath` is `d:/steam`.
  - `libraryfolders.vdf` lists D:\steam, E:\SteamLibrary and F:\SteamLibrary; only F:\SteamLibrary lists app 1422450.
  - The old hard-coded `G:\SteamLibrary\…\steam.inf` does not exist.
  - `G:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\citadel` exists as an empty directory tree.
  - The working-tree `discoverDeadlock` (uncommitted, being edited concurrently) resolves `F:\SteamLibrary\steamapps\common\Deadlock\game\citadel\steam.inf` via the library manifest. `projects.js` now derives `DEFAULT_STEAM_INF` from it.
  - Remaining fix: require the binaries beside the found steam.inf, and add the pin drift check (#10).

## Not determined
- How many selectors a rule may have. No limit was found, and the 2,047-byte prelude is the binding one.
- Whether comments inside a prelude count toward the 2,047 bytes.
- Whether unknown pseudo-classes are errors or silently interned.
- Exact JS arities, apart from the event argument counts and the shared-template grouping.
- Which three fields sum to the world-bar `health` value, and whether `health_total_*` bucket max HP.
- Whether the engine applies inline source maps to release scripts.
- The meaning of the second event argument of `CopyStringToClipboard`.

## Round 2 (2026-11-13): disassembly answers

**Method.** The `decomp`/IDA path failed (`Installed IDA not found`), so these answers come from capstone disassembly of the same binaries. Nothing was written to the game folder, and no debugger or process was used.

| Binary | SHA-256 |
|---|---|
| panorama.dll | `aea8e631e7ee3515f8e158e7bf49234be57c5c35f3d14e54960db84045d9f58f` |
| client.dll | `d0341ce77398614af905ef8669d328fd4d45958282acef66789a250492e466b5` |

All addresses below are RVAs.

### 1. CSS parser (panorama.dll)
- **Comments and whitespace inside a selector list count toward the 2,047-byte buffer.** CONFIRMED.
  - Token reader 0x148ee0 skips only *leading* whitespace (`CUtlBuffer::EatWhiteSpace`, 0x148f2f) and *leading* comments: 0x148db0 eats one `/*…*/` or `//…` and is called only before the copy loop (0x148f38).
  - The copy loop (0x148f81–0x149138) has no comment handling. Every byte up to `;{}`, including inner whitespace and comments, is copied, and the size check runs before each store (0x1490f4).
  - Trailing whitespace is trimmed only after the delimiter is reached (0x1490b0), so it still counts while copying.
  - The `stylesheets.js` measurement (raw text minus leading whitespace) matches. It also counts a leading comment, which is conservative.
- **Error versus warning.** CONFIRMED.
  - Two reporters exist: 0x15f700 calls 0xb4cf0 with `dl=1` (`Parsing error`); 0x15f800 calls it with `dl=0` (`Parsing warning`). 0xb4cf0 chooses `error`/`warning` from `dl` (0xb4d11).
  - **Errors:** `Failed to parse selector`, `Found unsupported CSS at-rule`, `Unsupported combinator`, `Selector exceeds temp buffer size`, `Error parsing style selector`, `Found no selectors`, `Error parsing style`, and the `@define`/`@keyframes`/`@import` errors.
  - **Warnings:** `Invalid property name`, `Unknown panel type in style selector`, `Conflicting @define value`, `Trying to apply missing animation`.
- **Unknown property:** a warning. The declaration is dropped and parsing continues with the next declaration (0x167a14 calls 0x15f800; 0x167a32 jumps to 0x167303). CONFIRMED.
  - The tooling still treats this as an error, by design.
- **Unknown at-rule, and selector-list failure:** an error. Both then reach 0x1633da: buffer reset, `xor r15b,r15b` (0x1633e8) clears the load's success flag.
  - INFERRED: the whole sheet fails to load. This is consistent with the live 6782 Escape-menu abort.
- **Unknown pseudo-class:** NOT DETERMINED. The selector parser 0x164a80 calls no reporter and interns names through `InternalMakeSymbol`, so the most likely outcome is silent acceptance that never matches. The tooling keeps this as a warning.
- **Other fixed buffers** (CONFIRMED: `mov r8d, N` before each call to reader 0x148ee0):

  | What | Limit | Buffer / location |
  |---|---|---|
  | Property name | ≤ 4,095 bytes | 0x1000 at 0x167312 |
  | Property value | ≤ 4,095 bytes | 0x1000 at 0x1673f8 |
  | `@define` name and value | ≤ 1,023 bytes | 0x400 in 0x163490 |
  | `@keyframes` name | ≤ 1,023 bytes | 0x400 in 0x1638c0 |
  | Keyframe stop selector | ≤ 1,023 bytes | 0x400 in 0x163b05 |
  | `@import` | ≤ 1,023 bytes | 0x400 in 0x164120 |
  | Small token, purpose unknown | 0x10 bytes | 0x16721f |

  - JS `panel.style.x = value` goes through a CPanelStyle setter (0xa76fb) with a 0x400 buffer. INFERRED: values are limited to ≤ 1,023 bytes.
  - Selector count per rule, classes per selector, keyframes count and stylesheet size: no fixed buffer or constant found (NOT FOUND). The selector vector grows dynamically.

### 2. JS API
- **Registration tables:** see `engine-facts.json` (`js.dollar`, `js.panel`, `js.panelTyped`, `js.events`).
  - Panel methods are registered one template instantiation per method (client.dll 0x2318ee0), so argument types live in the template code, not in a table. Decoding them per method was NOT DONE in this round.
  - Event argument counts are CONFIRMED as declared integers (`r8d`).
- **`GameUI`/`Game`:** NOT FOUND in any DLL string table, ASCII or UTF-16, across every game DLL. Their source is NOT DETERMINED.
  - They may be defined by script shipped in the game VPKs. The pak01 VPK archives (about 38 GB) were not searched.
  - QOLLOCK's shipped scripts call `GameUI.CustomUIConfig`, so the earlier "fiction" label is withdrawn.
- **`CopyStringToClipboard` declares 2 arguments:** NOT DETERMINED. The registration encodes a count but no names.
- **Source maps:** CONFIRMED that the exception handler 0xb23ec does the following:
  - it reads the V8 `Message::GetScriptOrigin()` source-map URL (`v8::String::Utf8Value` at 0xb2542);
  - it compares the first 29 characters with `data:application/json;base64,` (`_V_strncmp`, 0xb2585);
  - on a match it base64-decodes and parses the map (0xb1ca3: `version`, `mappings`); otherwise it prints `Invalid source mapping url prefix. %s`.
  - NOT DETERMINED: whether the resource compiler or V8 fills the origin's source-map URL from a `//# sourceMappingURL=` comment in a mod's script. This needs a live test before the build relies on it.

### 3. World health bar (client.dll)
- **The `health` dialog variable** is `SetDialogVariableInt("health", s+0x20 + s+0x28 + s+0x30)`: the sum of three integers in the unit-status state struct (0x1e8fac8–0x1e8faf1).
  - CONFIRMED that it is a sum. Which three game fields these are is NOT DETERMINED, because the struct has no schema strings.
- **`health_total_*` classes:**
  - The float at `s+0xc` is compared with two thresholds that 0x230f2a0 reads, once per process (cached static at 0x1e8f708), from the stock stylesheet `@define health_total_lg_threshold: 4000;` and `@define health_total_md_threshold: 2000;` (vendor `unit_status_v2.css`).
  - At or above the lg threshold the class is `health_total_lg`; at or above the md threshold, `health_total_md`; otherwise `health_total_sm` (0x1e8f71e–0x1e8f801). A fourth class, `health_total`, is also set.
  - CONFIRMED mechanism. INFERRED that `s+0xc` is max health or the bar total; the same value is passed (`cvtss2si`) to 0x1cb0890 just before, plausibly the segment-line builder.
- **Can CSS or JS observe max HP or barrier?**
  - CSS can see only the three size buckets.
  - The `@define` thresholds live in the generated sheet, so the mod could move them. But they are read once per process, there are only two of them, and they bucket a single float. That gives at most a coarse ≥ X test, not a value. CONFIRMED.
  - No max-HP, barrier or segment-size dialog variable, attribute or class is set on the unit-status panel (NOT FOUND among all 838 SetDialogVariable call sites).
- **Bar fill width:** computed by 0x1e71950, called six times, once per layer: lagging, deferred, delta, healing, bullet_shield and ratking_armor. Its formula was NOT DETERMINED in this round.
- **Verdict for ticket 51:** no exact barrier fix is available from engine-exposed data. The integrator should keep the geometry-based percent.
  - Possible approximation, not exact: if the `unit_healthbar_bullet_shield` layer's width is readable (`actuallayoutwidth`) alongside the health layer, the barrier share of the bar might be subtracted geometrically. This is INFERRED and untested, and the renderer is unchanged.

### 4. Tooling changes from this round
- `engine-facts.json` now records:
  - binary SHA-256s;
  - comment and whitespace counting;
  - property-name/value and at-rule buffers;
  - severity (error versus warning) and what each one does to a sheet;
  - the `@define` values the engine reads;
  - the source-map handler;
  - the GameUI/Game names absent from the DLL strings.
- `stylesheets.js` now also rejects property values over 4,095 bytes and `@define`/`@keyframes`/`@import` text over 1,023 bytes.
- **Test adapter:**
  - Strict mode is on by default (`HPV3_ADAPTER_STRICT=0` turns it off).
  - It checks the adapter's own `$` functions, dispatched event names, MockPanel prototype methods, and capitalized panel members that are not mod-prefixed.
  - `HPV3_ADAPTER_STRICT=full` also checks event names passed to handler registration. It stays opt-in because `validate-hp-colors-rewrite-v2-diag.test.js` registers a stand-in event named `Throws`.
  - Assigning to `$` is no longer checked: mods publish `$` members in game (QOLLOCK host: `BuildUI`, `ToggleSettingsWindow`, `HandleModSettingsCancel`, …).
- Open question, behaviour unchanged: the adapter routes `RegisterEventHandler` through `SetPanelEvent` and keeps one unhandled-event handler per event name; whether the engine does the same is unknown.
