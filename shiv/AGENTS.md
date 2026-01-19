# SHIV AUDIO MOD

## OVERVIEW
Core audio modification for hero **Shiv**, implementing high-fidelity sound event overrides for weapon systems, ability mechanics, and character VO. This mod focuses on tactile feedback and variety through extensive randomization.

## STRUCTURE
- `soundevents/hero/shiv.vsndevts`: Central KV3 definition file for all Shiv-related sound events.
- `sounds/vo/shiv/`: Source directory for custom voice-over assets and ability-specific vocal cues.
- `sounds/weapons/shiv/`: (Virtual) Directory referenced for firing, reloading, and impact assets.
- `sounds/abilities/shiv/`: (Virtual) Directory for dagger, dash, and ultimate sound layers.

## LOGIC
### Randomizer Patterns
- **High-Variance Firing**: `Shiv.Wpn.Fire` utilizes an array of 60 unique `.vsnd` files to prevent acoustic fatigue during rapid fire.
- **Recency Bias**: Uses `recency_bias_max_scale = 0.8` to ensure the same sound doesn't repeat too frequently in a sequence.
- **Surface Impact**: Material-agnostic randomized impacts for daggers and bullets.

### Pitch & Volume Shifting
- **Dynamic Variety**: Zoom and reload events use `pitch_rand_min/max` (typically ±0.05 to ±0.15) and `volume_rand_min/max` to make every interaction sound slightly unique.
- **Audio Envelopes**: `Shiv.Dive.Falling.Lp` implements `param_envelope` logic to scale pitch over a 10-second duration, creating a rising tension effect.

### Layered Events (`citadel_start_multi`)
- **Composite Casting**: `Shiv.ShivDagger.Cast` triggers 4 distinct sub-events (Bounce, Growl, Low, Stab) simultaneously to create a complex, textured sound profile.
- **Delayed Sequences**: Impact events use `delay` parameters (e.g., 0.35s and 2.85s) to sequence follow-up VO lines after the initial hit.

## HEROES (SHIV SPECIFIC)
- **ShivDagger (A1)**: Implements whizby logic with 26 variations and custom projectile loops.
- **ShivFlash (Ult)**: Features a three-stage impact system. Kill-specific VO lines are triggered on a delay to emphasize successful execution.
- **Rage System**: Dedicated sound cues for Full Rage entry and exit, providing audio-only feedback for resource management.
- **Foley & Movement**: 15-track randomized footsteps layered with custom foley (movement) sounds for a unique sonic identity.
