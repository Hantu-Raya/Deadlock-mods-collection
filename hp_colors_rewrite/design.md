# HP Colors Rewrite — ESC Editor Design

## Purpose

Add an obvious, Deadlock-native ESC-menu entry for configuring the v1 healthbar. The editor changes visible healthbars live, persists only real setting changes, and performs no continuous synchronization.

This design covers the v1 editor only. It excludes Anita UI compatibility, legacy preset compatibility, durable storage, and v2 healthbars. Rewrite-native live settings transfer and session presets use the existing canonical snapshot and effective-settings resolver.

## Entry point

Add `HP COLORS` as the final large primary row immediately before the smaller stock Settings section.

- Preserve the stock ESC row geometry, skew, speckle, spacing, and hover behavior.
- Use an explicit uppercase label rather than an icon-only affordance.
- Add a restrained brand-green edge and wash plus a small enemy/soul color swatch.
- Show a shortcut hint only when the runtime resolves a real binding. Never hardcode a key.
- Do not add a badge, attention pulse, or second entry point.

## Visual direction: Ritual Stripe

The editor extends the stock ESC menu’s dark paper-and-metal language.

- Responsive centered shell, designed around `1120 × 760`.
- Approximately 230px left category rail.
- Header with `HP COLORS`, the current category, live-save status, Undo, Peek, and Done.
- Contextual subcategory tabs above one scrollable settings surface.
- No embedded or simulated healthbar preview.
- Restrained transform/opacity transitions only; no frame-driven animation.

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

#### Status

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
- Auto, Manual Override, and Off still expose only exact stable hero keys. The workspace surfaces the active hero and the automatic Selected → All Heroes → Rewrite Default route without presenting lifecycle diagnostics as user controls.
- Save-target controls expose only All Heroes and selected stable heroes. The canonical base remains hidden and is represented by baked Rewrite Default.
- Session Presets list baked records before session user records.
- Save automatically snapshots the latest canonical editor values with the chosen scope metadata. With no selected user record it creates a new monotonic ID; creating an All Heroes preset hides the baked Rewrite Default row while retaining it as the canonical fallback. With a selected user record, Save overwrites that record in place. **New Preset** clears that update target.
- Applying a Selected Heroes preset waits for stable identity and rejects a settled mismatch. Later exact identity transitions select the first matching saved Selected record, otherwise the first saved All Heroes record, then the baked Rewrite Default when leaving a Selected scope.
- Selecting a row never applies it. Rename is initiated from the row name; Copy, Apply/Cancel, valid Up/Down moves, and Delete/Hide live on that row. Destructive confirmation replaces only the affected row, so management never shifts to a separate action panel.
- Repository-only mutations repair stable-ID references but never apply settings, enter Undo, increment revision, or dispatch configuration.
- Copy Selected and Copy All produce a separate `HPCRP1` repository code; the existing `HPCR2` path remains live-settings transfer only.
- Copy All preserves baked-before-user order, hidden baked state, selection, and record metadata while excluding synthetic Current.
- Import validates the complete code before appending user records with fresh monotonic IDs. It never applies or publishes settings.
- Preset records and repository metadata disappear when Deadlock restarts; the interface must not imply durable storage.

### Enemy

#### Bar

- Enable coloring.
- Show or hide the bar without stopping width updates.
- Fixed or gradient mode.
- Low, mid, and high colors.
- Low and high thresholds.
- Optional high-HP team color.
- Building and boss exclusions.

#### Feedback

- Healing color.
- Damage-delta color.

#### Shields & Icons

- Bullet-shield color.
- Ultimate-icon behavior and color.

### Ally

#### Bar

- Enable ally customization.
- Low, mid, and high colors.

#### Feedback

- Healing color.
- Damage-delta color.

#### Shields

- Bullet-shield color.

### Readout

#### HP Number

- Visibility.
- Current/max, percentage, and current-only formats.
- Size.
- Bar-derived or custom colors.

#### Level & Pips

- Level visibility.
- Pip visibility.

#### Placement

- Number position and offsets.

### Effects

#### Enemy Pulse

- Threshold, speed, intensity, and color mode.
- Optional bar hiding.
- Optional HP-number pulse.

#### Ally Pulse

- Threshold, speed, intensity, and color.

#### Kill Marker

- Enable, threshold, width, and color.

## Control behavior

- Put essential controls first.
- Put nonessential controls in one expandable `Advanced` section per tab.
- Keep disabled essential controls visible but dimmed.
- Collapse disabled advanced dependencies.
- Pair sliders with bounded numeric fields.
- Open color swatches into one shared HSL palette with a modal-routed Hue × Saturation field, a blue-ring selection pointer, one native Lumen slider, a canonical hex readout, and the existing strict hex input.
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

1. The ESC editor owns the versioned session settings, scope, and user-preset state.
2. Changed controls and preset applications normalize through the same resolver and publish only when effective values change.
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

1. The existing snapshot carries team-high color, independent building/boss exclusions, X/Y bar position, and ultimate-icon mode/color.
2. One ancestry classification records relation, team, building, sentry, and boss facts; neutral remains authoritative and unknown teams retain the configured high color.
3. Position translates only `UnitHealthbarContainer`, preserving stock icon placement and engine-owned fill geometry.
4. Exclusions clear relation-owned colors while retaining global size and position controls.
5. Ultimate-icon styling changes only `washColor`; stock image selection and visibility remain engine-owned.

The sixth slice adds the static enemy HP readout:

1. The existing snapshot carries visibility, format, size, direct X/Y offsets, color source, and custom low/mid/high colors.
2. `unit_status_overlay.xml` owns one non-interactive counter anchor and label outside the engine-owned fill hierarchy.
3. The local renderer derives current/max HP from cached stock pip text and the existing shield-aware health ratio; percentage can render without a derived maximum.
4. Bar-derived text follows the final enemy palette, including team-high color. Custom text uses its own three colors while sharing thresholds and Fixed/Gradient behavior.
5. Bypass, disabled, excluded, neutral, ally, and unclassified paths collapse and clear the owned counter. Late or replaced panels reuse the cached snapshot without another authority or scheduler.

The hero identity slice adds one transient read model beside—not inside—the healthbar snapshot:

1. Auto detection selects the generated topbar card carrying `LocalPlayer`, maps its exact retail-name label to one stable `hero_*` key, and requires two matching active-match samples.
2. Manual Override uses one explicit stable key; Off clears effective identity and skips local-card scans.
3. Unknown, blank, placeholder, fuzzy, and unmapped labels resolve to no effective hero. No scoped state is guessed.
4. Lifecycle state comes from exact hideout, pregame, and post-game HUD classes plus a parseable current topbar clock. Lifecycle changes clear cached panels, candidates, and detected identity.
5. One generation-guarded watcher polls at one second while active or transitioning and five seconds in lobby/post-match. Cached clocks are retained only while their text remains parseable.
6. Identity metadata remains outside `DEFAULTS`, HPCR2, Undo, root snapshot publication, and unit-status contexts.
7. The hero-scope slice keeps one canonical global base plus ordered, normalized snapshot rows. Resolution priority is first matching Selected Heroes row, then first All Heroes row, then global base.
8. Only the resolved effective values cross the existing overlay publication seam. Scope source changes with byte-identical effective values do not increment revision or dispatch.
9. Current save-target controls choose All Heroes or validated, deduplicated stable hero keys. Removing the final selected hero returns Current to All Heroes. Save snapshots the latest canonical editor values automatically.
10. Scope rows use a separate menu-only root cache. They remain outside `DEFAULTS`, HPCR2, Undo, and unit-status payloads, while the existing config root attribute remains effective-values-only.
11. The preset slice adds one baked-before-user repository with stable IDs, normalized frozen values, and scope metadata. The baked `baked_default` record documents the shipped startup state.
12. All Heroes and Selected Heroes application preserve the hidden canonical base and replace Current. Legacy user Global records normalize to All Heroes without applying; baked Rewrite Default remains the immutable base representation.
13. Selected preset application waits without live mutation until exact stable identity resolves. Matching identity applies once, mismatch rejects, and subsequent manual mutations cancel and suppress that pending match for the resolving transition. Later hero transitions restore the first matching Selected record, otherwise the first All Heroes record; leaving an active Selected scope without either automatically applies the baked Rewrite Default.
14. Preset metadata and session user records remain outside `DEFAULTS`, HPCR2, Undo, root unit-status publication, and healthbar contexts.
15. The repository-management slice retains a monotonic next-user number, baked display-name overrides, hidden baked IDs, and one selected record in the menu-only cache.
16. Visible repository order is fixed visible baked records followed by movable session records. Hidden baked records remain canonical and continue to serve automatic fallback.
17. Selecting, renaming, reordering, deleting, hiding, and restoring records never call the effective-settings reconciliation or publication seam. Deleting a pending user clears that request; selection repairs to the nearest surviving visible record.
18. Explicit Apply reuses the existing preset application path. Selection, Active Current match, and pending identity wait remain separate states in both behavior and presentation.