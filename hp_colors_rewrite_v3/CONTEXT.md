# HP Colors v3 language

The vocabulary of healthbar customization, preset routing and durable local saves.

## Settings and records

**Setting**: A named customization choice, such as bar width or health-text color. A side-aware setting has an enemy value and an ally value.

**Side**: The enemy or ally relation used for a setting's value, not an absolute Amber/Sapphire team.

**Team**: The absolute Amber (`team1`) or Sapphire (`team2`) team of a bar, read from its carrier classes. Team colors are editable shared settings; an unknown team falls back to the non-team color.
_Avoid_: Side, relation.

**Shared**: A setting value common to both sides.

**Setting cell**: One setting's value on one side, or its single shared value.

**Slot**: The stable numeric identity of a setting cell in a record. An **ability slot** instead identifies one of the local hero's four signature abilities; it is not a setting slot.

**Record**: The versioned representation of settings or a bundle used for saving or sharing.

**Record version**: The interpretation of a record's values, omissions and upgrades. It is distinct from the mod's release version and the store-page protocol version.

**Sparse record**: A record that omits values implied by its record version rather than repeating a complete settings set.

**Bundle**: Active authored settings and rules together with the saved preset library and bundle metadata, including hero routing and active source identity.
_Avoid_: Preset, settings-only code.

**Preset**: A named, reusable set of authored settings and rules with a stable identity. A preset is not the whole bundle.

**Built-in default**: The shipped default preset, distinct from user-created presets and from the chosen hero default.
_Avoid_: Base, frozen baseline.

**Active settings**: The currently selected or edited authored settings, whether or not they still equal their source preset.

**Authored settings**: The values the player edits, saves and shares, before ability conditions are evaluated.

**Effective settings**: The normalized values currently presented by the mod after matching ability rules override authored values.

**Bundle metadata**: Bundle information other than active settings, active rules and the preset list, such as routing choices or preset-name overrides.

## Heroes and conditions

**Local player**: The player whose own HUD supplies hero identity and signature tiers, not the enemy whose world healthbar is being drawn.

**Hero map**: The explicit association from known heroes to preset identities.
_Avoid_: Per-preset scope mode.

**Hero default**: The optional fallback preset selected for heroes without a map entry. It can refer to the built-in default, but is not synonymous with it.

**Source preset**: The preset identity from which active settings last came (the applied preset). Since 2026-11-02 edits are saved into a custom source preset; the baked Default never changes.

**Selected preset**: The library tile chosen on the Presets page as the target of toolbar actions. Selecting a preset never applies it; it is distinct from the source preset and from the hero default.

**Routing**: Automatic selection of the active source from the local hero's map entry or hero default.

**Condition / rule**: A setting-cell override consisting of an ability slot, a minimum signature tier and a replacement value. “Condition” is the editor term; “rule” is the native domain representation.

**Signature tier**: The local hero's observed upgrade tier for a signature ability, from unupgraded tier 0 through tier 3; unavailable is not tier 0.

## Rendering and publication

**Carrier**: A panel that supplies unit-kind, relation or presentation facts for a world healthbar.

**Lineage**: The parent/child identity chain that establishes which panels belong to the primary healthbar rather than a duplicate or retired tree.

**Facts**: The observed unit identity, presentation and geometry used to determine a healthbar's appearance.

**Plan**: The desired owned styles and classes derived from facts and effective settings.

**Apply**: Reconciliation of a plan with the currently owned panel properties and classes.

**Lease**: A renderer's temporary ownership of a panel style, class or adopted panel relationship, including its restoration obligation.

**Ledger**: The collection of those leases and the captured state needed to relinquish them.

**Release**: Relinquishing renderer ownership and restoring native control. A **mod release** instead means a published package; it is not renderer release.

**Publisher epoch**: The identity of one configuration publisher incarnation, distinct from a hero-watch lifecycle epoch.

**Revision**: The ordered effective-configuration change within a publisher epoch, not a record version.

**Relay**: An intermediary through which configuration requests reach the editor.

**Status-effect row**: The game's `#StatusEffects` row of effect icons (debuffs and pickups) at the top of a world bar's canvas. The renderer moves the whole row with the bar and pickup offsets; icons keep their native size and place in it.
_Avoid_: Pickup row, buff row.

**Kill bounty**: The souls the local player's solo kill on an enemy hero pays them now, the number on the game's kill popup. The topbar computes it from server rules; it is not a team total.

**Update badge**: The "!" beside HP COLORS in the Escape menu while a newer release exists, asked each time the Escape menu opens. The **update notice** is the editor's once-per-session dialog for the same check.

## Storage and transfer

**Store page**: The hosted HTTPS document whose origin-local storage holds this PC's durable save. It is not a server-side account or cloud save.

**Storage bridge**: The connection between the editor and the store page.

**CAS**: Compare-at-commit protection against replacing a save that changed since it was observed.

**Acknowledged baseline**: The last loaded or acknowledged bundle against which outstanding local edits are distinguished from remote changes.

**CONFLICT**: A refused save with overlapping local and remote changes; remote bytes and the complete unsaved local draft are retained.

**UNAVAILABLE**: Durable saving is not currently usable; the editor's draft remains session-only unless a later save is acknowledged.

**REPLACE ALL**: The confirmed application of a bundle's active settings, rules, metadata and replacement preset library, subject to normal save conflict protection.

**IMPORT**: In the Bundle box, append-only creation of fresh-id preset copies, without replacing active settings or bundle metadata. Settings-code IMPORT instead applies settings and rules; it is not bundle recovery.

## Packages

**Lane**: A separately maintained source and build boundary, such as canonical v3 or its QOLLOCK compatibility lane.

**Variant**: An alternative pak02 composition using the same canonical runtime, not an additional pak02 to install alongside it.

**QOLLOCK**: The compatibility variant for the pinned external QOLLOCK pak03, which retains ownership of its own HUD and settings system.
