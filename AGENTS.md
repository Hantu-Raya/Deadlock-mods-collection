# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-19
**Commit:** 4c38eef
**Branch:** main

## OVERVIEW
Deadlock Panorama UI mod collection. 25+ source mods compiling to VPK-ready structure via Source 2 resourcecompiler. Key features include soul timers, buff/rejuv trackers, and custom health bars.

## STRUCTURE
```
./
├── {mod}/                    # Source (panorama/{scripts,styles,layout,images})
├── {mod}_compiled/           # Output (.vjs_c, .vcss_c, .vxml_c)
├── buff_timer_virgin/         # v5.1 Production Rejuv/Buff tracker
├── combined_timer_v2/        # Latest high-complexity merge (v4.2 + v5.1)
├── abilities/                # Core VData definitions (260k lines) + Python toggles
├── self_hp/                  # Revitalizer tracker with damage detection
├── shiv/                     # Audio mod (soundevents + randomizer logic)
├── sr2compiler/              # Custom Source 2 ResourceCompiler tool
└── test/                     # Archive: kaiz_hud, old_hud (archival reference)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Soul Timer | `soul_timer/` | Drain formula, root re-parenting, v4.2 optimized |
| Combined v2 | `combined_timer_v2/` | Merged Soul + Buff, newest logic |
| Buff/Rejuv | `buff_timer_virgin/` | v5.1 Prod: 8-unit proximity scan, 6-panel glow |
| Health Bars | `hp/` | Logic variants (fixed, interp, team-based) |
| Self HP | `self_hp/` | Item cooldown logic via damage detection |
| Abilities | `abilities/` | Core VData definitions (260k lines). Python scripts (active.py/passive.py) toggle m_bShowInPassiveItemsArea. |
| Audio | `shiv/` | Hero-specific sound event overrides |
| Legacy | `test/old_hud/` | NeonPrime reference (107+ files) |

## MOD SPECIFICS

### Buff Timer Virgin (v5.1)
- **Status**: Production Ready.
- **Hero Detection**: Confirmed impossible via Panorama; uses proximity scan (8 unit radius) for claim detection.
- **Dead Handling**: Hybrid system with 2s grace period to prevent flickering on death.
- **Visuals**: 6-panel curved glow system for enhanced visibility.

## CONVENTIONS

### JavaScript (Resilient Patterns)
- **4-Tier Game Time**: `gTime()` uses `Game` API -> `GameUI` -> `Game.GetDOTATime` -> UI Clock Parsing.
- **Adaptive Polling**: 0.05s when values change, 0.25s-0.5s when static (see `kaiz_hud`).
- **Boot & Retry**: Scripts must check `$.GetContextPanel()?.IsValid()` and retry if HUD isn't ready.
- **Panel Caching**: Always cache traverses at boot scope (e.g., `UI.label = UI.root.FindChildTraverse("...")`).

### CSS (Hijack Pattern)
- **CSS Hijacking**: Create file with game name, `@import` original, then add custom overrides.
- **Pre-transform-scale2d**: MUST use for pulsing text with shadows (avoids clipping/blurring).
- **Noclip Overflow**: Use `overflow: noclip;` to prevent glow/shadow clipping at panel bounds.

## ANTI-PATTERNS (CRITICAL)
| Pattern | Why Bad | Fix |
|---------|---------|-----|
| `SetParent()` to engine root | Floating panels, centering bugs | Parent to `HudCore` or `CitadelHud` |
| `Game.GetGameTime()` unwrapped | Returns 0 in menus | Use 4-tier `gTime()` fallback |
| `transform: scale3d` + shadow | Clipping/Blurring | Use `pre-transform-scale2d` |
| `font-size` animation | Layout jitter/crashes | Use `pre-transform-scale2d` |
| Bare ID root parenting | Compile error if on root | Put ID on first child (e.g., `id="Hud"` on `HudCore`) |

## SHARED CODE (Refactor Candidates)
| Function | Purpose |
|----------|---------|
| `gTime()` | Robust game time with 4-tier fallback |
| `findRoot()` | Hierarchical root discovery |
| `validPanel()` | Recursive visibility/validity check |
| `parseSec()` | Time string (MM:SS) to seconds |
| `detectDamage()` | Change detection for health status |

## GOTCHAS
- **Abilities VData Size**: `abilities.vdata` and `abilities2.vdata` are massive (~260k lines each). Conventional text editors may struggle; use stream-based processing or high-performance editors.
- **Hardcoded Paths**: The VData compilation workflow often requires external working directories due to hardcoded paths in helper scripts/batch files. Not fully portable.

## BUILD
```powershell
# Compile after ANY code change
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

## DEBUG
| Tag | Module |
|-----|--------|
| `[ST-S]` | Soul Timer |
| `[BT-P]` | Buff Timer Position |
| `[WD]` | Watchdog |
| `[ERR]` | Exception |

Enable: `-dev -tools` launch options. Console: F7.
