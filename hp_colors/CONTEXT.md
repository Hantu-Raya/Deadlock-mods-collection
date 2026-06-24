# HP Colors

HP Colors is the player-facing context for configuring Deadlock healthbar readability. It names the gameplay concepts behind enemy, ally, pulse, HP-number, level-number, kill-marker, preset, and hero-targeted behavior.

## Language

**Health state**:
The readable condition of a unit's health, usually expressed as low, mid, or high health. Health state is what the mod helps the player recognize quickly.
_Avoid_: HP condition, health mode

**Enemy healthbar**:
A hostile unit's visible healthbar in the Deadlock HUD. HP Colors primarily changes this surface so enemy health state is easier to read.
_Avoid_: Red bar, target bar

**Ally healthbar**:
A friendly unit's visible healthbar in the Deadlock HUD. Ally coloring is optional and separate from enemy healthbar coloring.
_Avoid_: Friendly bar, team bar

**Neutral healthbar**:
A neutral or jungle unit's visible healthbar. Neutral healthbars are not enemy healthbars, even when they appear in the same HUD surface.
_Avoid_: Jungle enemy bar, unclassified enemy bar

**Building**:
A tower, boss, barracks, or similar non-hero objective healthbar. Building handling is distinct from normal enemy and ally healthbar behavior.
_Avoid_: Structure, objective unit

**HP number**:
The numeric health readout shown near a healthbar. It can show full HP, percentage, or current HP depending on the player's preference.
_Avoid_: Counter, overlay text

**Health pips**:
The segmented health markers that communicate maximum health. Hiding health pips changes healthbar readability, not the unit's actual health.
_Avoid_: Segments, tick marks

**Low-HP pulse**:
A visual emphasis applied when a unit falls below the configured pulse threshold. The pulse communicates danger or kill opportunity.
_Avoid_: Flash animation, heartbeat effect

**Kill marker**:
A threshold marker placed on the healthbar to show a chosen kill-zone percentage. It is a visual decision aid, not a damage calculator.
_Avoid_: Execute marker, death line

**Level number**:
The visible unit level near the healthbar. HP Colors may restyle it so level tiers are easier to scan.
_Avoid_: Rank number, tier badge

**Preset**:
A named collection of HP Colors settings. A preset represents a reusable visual preference, not a separate mod.
_Avoid_: Profile, theme

**Preset code**:
A copyable text token that carries preset values between installs or workflows. It is the manual fallback for sharing or importing settings.
_Avoid_: Save code, import string

**Preset builder**:
The workflow for creating, ordering, importing, exporting, and targeting presets. It may be in-game or external, but it still manages HP Colors presets.
_Avoid_: Config editor, theme manager

**Hero scope**:
The rule that decides which heroes a preset applies to. A preset can be off, apply to all heroes, or apply only to selected heroes.
_Avoid_: Hero filter, character targeting

**Selected preset**:
The preset currently chosen by hero scope and priority. It is the preset expected to drive the active runtime visuals.
_Avoid_: Active profile, current theme

**Anita UI**:
The in-game settings surface used by HP Colors. Anita UI is the player-facing configuration host, not the runtime healthbar itself.
_Avoid_: Settings bridge, menu framework
