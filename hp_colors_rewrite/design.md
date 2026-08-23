# HP Colors Rewrite — ESC Editor Design

## Purpose

Add an obvious, Deadlock-native ESC-menu entry for configuring the v1 healthbar. The editor changes visible healthbars live, persists only real setting changes, and performs no continuous synchronization.

This design covers the v1 editor only. It excludes Anita UI compatibility, legacy preset compatibility, durable storage, and v2 healthbars. Rewrite-native live settings transfer and session presets use the existing canonical snapshot and effective-settings resolver.

## Entry point

Add `HP COLORS` as a stock `nav_menu_item minor` row inside `SubOptions`, after Player Feedback and immediately before Settings. This keeps it below contextual actions and makes the entry visually indistinguishable from neighboring native Escape-menu rows.

- Preserve the stock row geometry, typography, spacing, hover, and focus behavior without entry-specific CSS.
- Use only the explicit uppercase `menuButtonLabel`; do not add a swatch, accent, icon, shortcut hint, badge, or attention pulse.
- Do not add a second entry point.

## Visual direction: Ritual Stripe

The editor extends the stock ESC menu’s dark paper-and-metal language.

- Responsive centered shell, designed around `1120 × 760`.
- Approximately 230px left category rail.
- Header with `HP COLORS`, the current category, live-save status, Undo, Peek, and Done.
- Contextual subcategory tabs above one scrollable settings surface.
- No embedded or simulated healthbar preview.
- Restrained transform/opacity transitions only; no frame-driven animation.

### Supporter ticker

- The flexible header-rule area may show a supporter ticker while the editor is open. Donor #1 remains stationary for two seconds when each cycle starts, then all ranked supporters scroll. A centered `Thank you for supporting` card holds for three seconds. Its five-second exit uses a fixed spacer before the next cycle's first donor, preventing overlap while donor #1 enters from the right. Duplicate cycle markup makes the reset frame visually identical. The ticker sits between the title block and `LIVE`; `LIVE` and `DONATE` keep their existing controls and order.
- `HPColorsSupporterTicker` is an optional, display-only `CitadelHTMLPanel`. It cannot take focus, cursor, mouse, keyboard, or Escape input.
- Each editor open loads `https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/` once. The menu does not poll or fetch supporter data during gameplay.
- Every close path navigates the panel to `about:blank` and collapses it. A missing panel or failed `SetURL` call must not block editor open or close.
- The hosted page is generated from the reviewed public supporter CSV. Its static HTML and CSS use the Deadlock Oracle family when available and render at most ten ranked public aliases and USD totals. A same-origin loop controller only restarts the completed one-shot animation; it cannot fetch, store, or transmit data. GitHub Pages may retain an older successful deployment for ten minutes.
- The hosted strip must keep this cycle running when the embedded browser reports `prefers-reduced-motion`; Deadlock reports that preference even when the ticker is expected to animate. Do not depend on CSS `infinite` iteration because the in-game HTML surface can stop on its final keyframe.
- Do not package donor rows or show a stale fallback. If the HTML panel captures input, shows browser error UI, scales poorly, fails to unload, or adds measurable closed-editor cost, replace it with the remote image design.

### Typography

- `VALVEPulp`: title and major headings.
- `VALVEOracle`: navigation, values, status, and utility text.
- Retail Demo/Noto Sans: setting names and helper text.
- `Reaver`: optional single decorative accent, never body copy.

### Palette

- Off-black: `#10130D`
- Off-white: `#FFEFD7`
- Active green: `#5FE69E`
- Enemy: `#FF410D`
- Threshold gold: `#FFED79`
- Ally/healing soul: `#70F8C1`

Color must never be the only state indicator.

## Information architecture

### Overview

#### Master

- Master customization switch.
- The switch bypasses custom rendering without deleting configured values.
- Enemy, ally, readout, and effects summaries link to their owning categories.
- A quiet `No visible healthbars` status appears when no applicable v1 bars exist; controls remain editable.

#### Layout

- Bar width.
- Bar height.
- Bar position.
- Sliders include bounded numeric fields.

#### Presets

- The full-width Preset Library combines routing context, save target, repository order, selection, and management in one workspace; transient identity internals remain runtime-owned and hidden.
- The workspace explains session presets first: in-game changes last until Deadlock closes, web-builder presets return after restart, and one preset VPK may contain both All Heroes and Selected Heroes records.
- The routing card shows the active hero and the user-facing rule: a hero-specific preset wins first, otherwise All Heroes applies. If several records cover the same hero, the highest record in the list wins.
- Save-target controls expose only All Heroes and selected stable heroes. Their help states that Selected Heroes overrides All Heroes for the chosen heroes and that All Heroes covers everyone else.
- Session Presets list baked records before session user records.
- **New Preset** opens a focused create form for name and Current target. **Create Preset** snapshots the latest Current working values with that scope metadata, allocates a monotonic ID, closes the form, and never applies settings.
- Clicking a session row enters a clearly labeled editing state without changing live settings. Its primary action becomes **Save & Apply**, which warns that it will replace the named record, updates that stable ID from the current editor values and scope, then uses the existing preset-application path. **Cancel** exits editing without mutation.
- Baked rows remain immutable. Their primary action stays **Apply**; they never expose **Save & Apply**.
- A compact action guide distinguishes all three mutations: **Create Preset** saves a new library record without changing the live HUD, **Apply** loads a record without editing it, and **Save & Apply** replaces the selected user record from Current before loading it.
- Explicit **Apply** replaces Current and publishes immediately, even before stable identity resolves or when the current detected hero differs. Applied user presets stamp Current with their stable source ID. Later exact identity transitions preserve edited Current when the first matching saved Selected or All Heroes route has that same ID, and replace Current only when routing resolves to a different preset or baked Rewrite Default.
- Rename starts from the row name. Copy, Apply, valid Up/Down moves, and Delete/Hide remain row-local. Destructive confirmation replaces only the affected row.
- Repository-only mutations repair stable-ID references but never apply settings, enter Undo, increment revision, or dispatch configuration. Explicit **Apply** and the apply half of **Save & Apply** are live-settings transitions.
- Copy Selected and Copy All produce a separate `HPCRP1` repository code. `HPCR2` remains live-settings transfer only and always represents a complete values-plus-conditions snapshot; array-only historical codes mean zero conditions rather than “preserve current conditions.”
- Copy All preserves baked-before-user order, hidden baked state, selection, and record metadata while excluding synthetic Current.
- Import validates the complete code before appending user records with fresh monotonic IDs. It never applies or publishes settings.
- Runtime-created/imported records and repository edits disappear when Deadlock restarts. A builder-generated pak96 repopulates its original `HPCRP1` records from the versioned hidden store in `hud_escape_menu.xml`. On cold boot without a session cache, the builder-selected user record becomes Current and publishes before hero, area, or game-mode lifecycle observation. When the records include an All Heroes user preset, the builder marks baked Rewrite Default hidden and hydration preserves that state. The store is build-time/read-only and does not make in-game edits durable.

### Enemy

#### Bar

- Enable coloring.
- Show or hide the bar without stopping width updates.
- Fixed or gradient mode.
- Low, mid, and high colors.
- One always-editable low/high threshold pair shared by enemy bars, ally bars, and custom HP text.
- Optional high-HP team color.
- Structure and objective color exclusions, plus a separate creature-class ghoul exclusion and full-healthbar opacity control.

#### Heal & Damage

- Healing color.
- Recent-damage color.

#### Shields & Icons

- Shield-indicator color.
- Ultimate-icon behavior and color.

#### Pulse

- Threshold, speed, intensity, and color mode.
- Optional bar hiding.
- Optional HP-text pulse.

#### Kill Marker

- Enable, threshold, width, and color.

### Ally

#### Bar

- Enable ally customization.
- Low, mid, and high colors.

#### Heal & Damage

- Healing color.
- Recent-damage color.

#### Shields

- Shield-indicator color.

#### Pulse

- Threshold, speed, intensity, and color.

### Health Info

#### HP Text

- Visibility.
- Current/max, percentage, and current-only formats.
- Size and font.
- Bar-derived or custom colors.

#### Text Position

- Horizontal and vertical offsets.

#### Pips & Levels

- Pip visibility and optional 10-HP pip calculation.
- Enemy-player level visibility.

## Control behavior

- Put essential controls first.
- Put nonessential controls in one expandable `Advanced` section per tab.
- Keep disabled essential controls visible but dimmed.
- Collapse disabled advanced dependencies.
- Pair sliders with bounded numeric fields.
- Open color swatches into one shared HSL palette with a modal-routed Hue × Saturation field, a blue-ring selection pointer, one native Lightness slider, a canonical hex readout, and the existing strict hex input.
- Keep opacity separate and expose it only where the runtime supports it.
- Show short helper text inline; reserve tooltips for detailed caveats.

## Saving and recovery

Changes autosave. `DONE` and Escape close the editor and return to the stock ESC menu.

- Toggles and discrete selections commit immediately when their value changes.
- Slider and color drags update live but create one persistence and undo operation per completed gesture.
- Undo keeps a bounded in-memory history for the current editor session and clears on close.
- Reset Section restores shipped defaults after confirmation; the reset itself can be undone.
- Closing never rolls settings back.

## Live inspection

Real in-game healthbars are the only preview authority.

### Hold-to-Peek

- A visible press-and-hold `PEEK` control fades or collapses the editor shell.
- A keyboard hint and binding work only when a real binding is resolved.
- A capture surface preserves release detection while the shell is hidden.
- Gameplay input remains blocked during Peek.
- Releasing Peek restores the editor.

`Test Pulse` temporarily triggers the chosen pulse on currently visible applicable bars, restores normal threshold behavior afterward, and never persists test state.

Runtime verification must prove that v1 bars remain visible while the custom editor owns the ESC surface. If they do not, fix the editor’s visibility ownership; do not add a simulated preview fallback.

## Runtime state flow

Use one authoritative global base, ordered session scope rows, and one resolved effective settings snapshot.

`hp_colors_contract.js` is the sole healthbar setting schema. It defines shipped defaults, deterministic key order, setting types, enum choices, numeric bounds, and normalization. The ESC state owner and every isolated healthbar probe load that contract before accepting state or configuration, so a setting cannot normalize differently across Panorama contexts.

1. The ESC editor owns the versioned session settings, scope, and user-preset state.
2. Changed controls edit Current when it exists and otherwise edit the hidden base; both control changes and preset applications normalize through the same resolver and publish only when effective values change.
3. An adaptive cached replay (1-second hot, 3-second warm, 8-second idle) feeds late isolated overlays while customization is enabled.
4. Render caches prevent unchanged inline style writes.
5. Closing the editor stops editor work while applied bars retain their appearance.
6. The master bypass clears only code-owned inline styles; it does not delete configured values.

Do not add mouseover resynchronization, full-tree refreshes, duplicate authorities, or overlay-to-menu request paths. Replay only the cached serialized snapshot; never rebuild it or touch bars from the publisher.

## Implementation slices

The first slice proved the editor seam:

1. Stock-derived `hud_escape_menu.xml` override and visible `HP COLORS` entry.
2. Ritual Stripe shell, category rail, tabs, Peek, Undo, and Done controls.
3. One guarded local editor lifecycle.

The second slice adds core functional customization:

1. Session-scoped master, width, height, enemy, ally, mode, color, and threshold controls.
2. One versioned snapshot, immediate base-to-overlay changes, and adaptive cached replay for late contexts.
3. Neutral-first relation classification.
4. Shield-aware health percentage and legacy-compatible low-to-mid/high-to-full gradient interpolation with cached wash-color writes.
5. Stock restoration when customization is bypassed.

The third slice adds feedback-layer controls without adding another runtime path:

1. Enemy and ally tabs expose healing, recent-damage delta, and bullet-shield colors.
2. The existing snapshot carries the six colors.
3. The cached local renderer changes only layer color properties and leaves all engine-driven widths and timing untouched.
4. Disabled relations, neutral/other roles, and master bypass restore stock inline styling.

The fourth slice adds one reusable HSL color palette:

1. Three native horizontal Panorama `Slider` controls expose Hue `0–359`, Saturation `0–100`, and Lumen `0–100`.
2. Every slider updates the authoritative snapshot and visible healthbars live.
3. Each completed slider gesture adds one Undo entry.
4. One modal popup is reused for every color setting and closes without rollback.

The fifth slice adds target-aware healthbar controls:

1. The snapshot carries team-high color, independent structure/objective/ghoul exclusions, ghoul opacity, X/Y bar position, and one shared ultimate-icon mode/color.
2. One ancestry classification records relation, team, building, sentry, boss, and creature-class ghoul facts; neutral remains authoritative and unknown teams retain the configured high color.
3. Position writes only `UnitHealthbarContainer`, preserving stock unit, ultimate, and level icon placement plus engine-owned fill geometry. Ghoul opacity applies one value to `UnitHealthbarContainer` and `unit_info_bg`; it does not add a separate ultimate-opacity setting.
4. Ghoul opacity is resolved independently before color exclusion, so excluded ghouls retain the requested healthbar and ultimate-ready background opacity. Zero uses the existing nonzero hidden value to preserve engine width updates.
5. Ultimate-icon styling changes only `washColor`; Custom applies one shared color to enemy and ally icons even when their bar-color toggle is off, while Follow Bar colors only customized bars. Stock image selection and visibility remain engine-owned.

The sixth slice adds the static enemy HP readout:

1. The existing snapshot carries visibility, format, size, direct X/Y offsets, color source, and custom low/mid/high colors.
2. `unit_status_overlay.xml` owns one non-interactive counter anchor and label outside the engine-owned fill hierarchy.
3. The local renderer derives current/max HP from cached stock pip text and the existing shield-aware health ratio; percentage can render without a derived maximum.
4. Bar-derived text follows the final enemy palette, including team-high color. Custom text uses its own three colors while sharing thresholds and Fixed/Gradient behavior.
5. The enemy bar-color toggle restores only relation-owned colors; HP text remains controlled by its own visibility setting. Master bypass, exclusions, neutral, ally, and unclassified paths collapse and clear the owned counter. Late or replaced panels reuse the cached snapshot without another authority or scheduler.

The hero identity slice adds one transient read model beside—not inside—the healthbar snapshot:

1. Auto detection selects the generated topbar card carrying `LocalPlayer`, maps its exact retail-name label to one stable `hero_*` key, and requires two matching active-match samples.
2. Manual Override uses one explicit stable key; Off clears effective identity and skips local-card scans.
3. Unknown, blank, placeholder, fuzzy, and unmapped labels resolve to no effective hero. No scoped state is guessed.
4. Lifecycle state comes from exact hideout, pregame, and post-game HUD classes plus a parseable current topbar clock. Lifecycle changes clear cached panels, candidates, and detected identity.
5. One generation-guarded watcher polls at one second while active or transitioning and five seconds in lobby/post-match. Cached clocks are retained only while their text remains parseable.
6. Identity metadata remains outside `DEFAULTS`, HPCR2, Undo, root snapshot publication, and unit-status contexts.
7. The hero-scope slice keeps one hidden canonical base plus ordered, normalized snapshot rows. Resolution priority is Current, then the first matching Selected Heroes row, then the first All Heroes row, then the hidden base.
8. Only the resolved effective values cross the existing overlay publication seam. Scope source changes with byte-identical effective values do not increment revision or dispatch.
9. Current save-target controls choose All Heroes or validated, deduplicated stable hero keys. Removing the final selected hero returns Current to All Heroes. Save snapshots the latest Current working values automatically.
10. Scope rows use a separate menu-only root cache. They remain outside `DEFAULTS`, HPCR2, Undo, and unit-status payloads, while the existing config root attribute remains effective-values-only.
11. The preset slice adds one baked-before-user repository with stable IDs, normalized frozen values, and scope metadata. The baked `baked_default` record documents the shipped startup state.
12. All Heroes and Selected Heroes application preserve the hidden canonical base and replace Current. Subsequent controls mutate that Current working copy without changing the source preset record; only **Save & Apply** replaces a user record. Legacy user Global records normalize to All Heroes without applying; baked Rewrite Default remains the immutable base representation.
13. Explicit Selected preset application replaces Current and publishes immediately without waiting for stable identity. Later hero transitions preserve edited Current when the resolved Selected or All Heroes record has the same stable source ID, restore a different first matching record when the route changes, and apply baked Rewrite Default when leaving an active Selected scope without either.
14. Preset metadata and session user records remain outside `DEFAULTS`, HPCR2, Undo, root unit-status publication, and healthbar contexts.
15. The repository-management slice retains a monotonic next-user number, baked display-name overrides, hidden baked IDs, and one selected record in the menu-only cache.
16. Visible repository order is fixed visible baked records followed by movable session records. Hidden baked records remain canonical and continue to serve automatic fallback.
17. Selecting a session row enters menu-local edit mode without applying it. Renaming, reordering, deleting, hiding, restoring, and canceling edit never call the effective-settings reconciliation or publication path. Selection repairs to the nearest surviving visible record.
18. Explicit **Apply** and the apply half of **Save & Apply** replace Current through the same preset application path. Editing and Active Current match remain separate states in both behavior and presentation.
19. Cold-boot builder hydration turns the validated `HPCRP1` selected user record into Current and publishes it even when a prior root snapshot exists. It does not wait for identity or another lifecycle transition.