# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-10
**Commit:** fd9181b
**Branch:** main

## OVERVIEW
Deadlock Panorama UI mod collection. 23 source mods compiling to VPK-ready structure via Source 2 resourcecompiler.

## STRUCTURE
```
./
├── {mod}/                    # Source (panorama/{scripts,styles,layout,images})
├── {mod}_compiled/           # Output (.vjs_c, .vcss_c, .vxml_c)
├── abilities/                # VData definitions + Python build scripts (non-Panorama)
├── old_hud/                  # Legacy reference (107+ files, archival)
├── post/                     # Post-processing (.vpost, non-Panorama)
└── shiv/                     # Audio mod (soundevents, non-Panorama)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Soul Timer | `soul_timer/` | Drain formula, root re-parenting, watchdog pattern |
| Buff/Rejuv Timers | `buff_timer_*/` | Phase tracking (Initial->Buff->CD), top bar variants |
| Health Bars | `hp/` | 5 variants (fixed, interp, team-based). See hp/AGENTS.md |
| Combined | `combined_timer/` | Soul + Buff merged into single mod |
| Kaiz HUD | `kaiz_hud/` | Comprehensive redesign, health color interpolation |
| Self HP | `self_hp/` | Revitalizer tracker, DEBUG=true warning |
| Radar | `radar/fgH/` | Minimap (note: nested structure anomaly) |
| Rank Display | `showrank/` | CSS-only, profile card styling |
| Damage Events | `event/` | CSS-only, hit indicator styling |
| Abilities | `abilities/` | VData mod, Python scripts. See abilities/AGENTS.md |
| Legacy/Archive | `old_hud/` | NeonPrime HUD reference. See old_hud/AGENTS.md |

## MOD TYPES
| Type | Has Scripts | Examples |
|------|-------------|----------|
| Full Panorama | Yes | `soul_timer`, `hp`, `combined_timer`, `kaiz_hud` |
| CSS-only | No | `showrank`, `event`, `recent_purchase`, `standalone*` |
| Non-Panorama | N/A | `abilities/` (VData), `post/` (vpost), `shiv/` (audio) |

## CONVENTIONS
- **JS**: IIFE + `'use strict'`. Cache `FindChildTraverse` at boot. Single-letter vars OK.
- **CSS**: `wash-color` for tinting. `overflow: noclip` for overlays. `z-index: 99999+`.
- **XML**: `hittest="false"` for overlays. `file://{resources}/` (source), `s2r://` (compiled).
- **Tick Rates**: 0.1s (fast/render), 1s (normal/state), 3s (idle/background).

## ANTI-PATTERNS (CRITICAL)
| Pattern | Why Bad | Fix |
|---------|---------|-----|
| `$.GetContextPanel()` in loops | Performance | Cache at boot |
| `new Array/Object` in render | GC pressure | Reuse objects |
| Trust `visible` alone | Ghost panels | Check `actualvisibility !== "collapse"` too |
| Bare panel access | Crash on reload | Wrap in try-catch + `?.IsValid?.()` |
| `Game.GetGameTime()` unwrapped | Returns 0 | Try-catch + fallback to UI clock parse |

## KNOWN ENGINE BUGS
| Bug | Symptom | Workaround |
|-----|---------|------------|
| Ghost Panel | Stale values after reload | `visible===true && actualvisibility!=="collapse"` |
| Shop Pause | Timer freezes | Watchdog timer (2s check, 5s stall = restart) |
| GetGameTime=0 | Timers stuck | Fallback chain: `Game.GetGameTime()` -> `GameUI.GetGameTime()` -> parse clock text |
| Panel Crash | JS Exception on HUD reload | Wrap ALL panel access in try-catch |

## PERFORMANCE PATTERNS
```javascript
// Panel Caching (MANDATORY)
const UI = { root: null, label: null };
function boot() {
  UI.root = $.GetContextPanel();
  UI.label = UI.root.FindChildTraverse("MyLabel");
  if (!UI.label) $.Schedule(0.5, boot);
}

// Game Time with Fallback (MANDATORY for timers)
function gTime() {
  const n = Date.now();
  if (n - _tCacheTs < 200) return _tCache;
  try { return Game.GetGameTime() || 0; } catch { return uiClockTime(); }
}
```

## BUILD
```powershell
# Compile after code changes (MANDATORY before testing)
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"

# Example: Compile buff_timer_virgin
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```

**Protocol:** After ANY code change, run compile command before testing in-game.
See `.agent/workflows/deadlock-modding.md` for detailed steps.

## NON-STANDARD STRUCTURES
| Path | Issue | Impact |
|------|-------|--------|
| `radar/fgH/` | Extra nesting | Inconsistent paths |
| `legacytarget/` | No `panorama/` wrapper | Files at root |
| `heatlh_color_blind/` | Typo + variant subdirs | Should be split |

## SHARED CODE (Refactor Candidates)
| Function | Found In | Purpose |
|----------|----------|---------|
| `gTime()` | soul_timer, buff_timer_*, combined_timer | Game time with cache+fallback |
| `findRoot()` | rejuvnbufftimer.js variants | HUD root discovery |
| `parseSec()` | Multiple | Clock text -> seconds |
| Color constants | hp/, kaiz_hud/ | `r=[225,97,97]` etc. |

## DEBUG
| Tag | Module | Meaning |
|-----|--------|---------|
| `[ST-S]` | Soul Timer | Standard logic |
| `[ST-B]` | Buff Timer | Standard logic |
| `[WD]` | Watchdog | Loop stalled, auto-restarted |
| `[ERR]` | Error | Exception caught, recovering |

Enable: Add `-dev -tools` to Deadlock launch options. See `PROBLEM.md` for troubleshooting.
