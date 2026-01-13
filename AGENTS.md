# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-12
**Commit:** 7232f3e
**Branch:** main

## OVERVIEW
Deadlock Panorama UI mod collection. 25 source mods compiling to VPK-ready structure via Source 2 resourcecompiler.

## STRUCTURE
```
./
├── {mod}/                    # Source (panorama/{scripts,styles,layout,images})
├── {mod}_compiled/           # Output (.vjs_c, .vcss_c, .vxml_c)
├── abilities/                # VData definitions + Python scripts (non-Panorama)
├── post/                     # Post-processing (.vpost, non-Panorama)
├── shiv/                     # Audio mod (soundevents, non-Panorama)
└── test/                     # Archive: kaiz_hud, old_hud, Predi2
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Soul Timer | `soul_timer/` | Drain formula, root re-parenting, watchdog pattern |
| Soul Timer Warning | `soul_timer_warning_addon/` | CSS addon: pre-transform-scale2d pulse + glow |
| Buff/Rejuv Timers | `buff_timer_*/` | Phase tracking. `virgin` has minimap claim detection + glows |
| Health Bars | `hp/` | 5 variants (fixed, interp, team-based). See hp/AGENTS.md |
| Combined | `combined_timer/` | Soul + Buff merged |
| Self HP | `self_hp/` | Revitalizer tracker. WARNING: DEBUG=true |
| Radar | `radar/fgH/` | Minimap (anomaly: extra nesting) |
| Rank Display | `showrank/` | CSS-only |
| Abilities | `abilities/` | VData mod, Python scripts |
| Legacy | `test/old_hud/` | NeonPrime reference (107+ files, archival) |

## MOD TYPES
| Type | Has Scripts | Examples |
|------|-------------|----------|
| Full Panorama | Yes | `soul_timer`, `hp`, `combined_timer`, `buff_timer_virgin` |
| CSS-only | No | `showrank`, `event`, `soul_timer_warning_addon` |
| Non-Panorama | N/A | `abilities/` (VData), `post/` (vpost), `shiv/` (audio) |

## CONVENTIONS

### JavaScript
```javascript
(()=>{"use strict";
const UI={root:null,label:null};  // Panel cache at module scope
let _tCache=0,_tCacheTs=0;        // Leading underscore = private

function boot(){
  UI.root=$.GetContextPanel();
  UI.label=UI.root.FindChildTraverse("MyLabel");
  if(!UI.label?.IsValid?.())return $.Schedule(0.5,boot);  // Retry pattern
  loop();
}

function gTime(){  // MANDATORY for timers
  const n=Date.now();
  if(n-_tCacheTs<200)return _tCache;
  let t=0;
  try{t=Game.GetGameTime?.()|0;}catch{}
  if(t>0){_tCache=t;_tCacheTs=n;return t;}
  try{t=GameUI.GetGameTime?.()|0;}catch{}
  if(t>0){_tCache=t;_tCacheTs=n;return t;}
  return uiClockTime();  // Fallback: parse clock text
}

boot();
})();
```

### CSS
```css
@import url("s2r://panorama/styles/base/original.vcss_c");  /* CSS Hijack */

@keyframes 'pulse' {
    0%   { pre-transform-scale2d: 1.0; }  /* NOT scale3d */
    50%  { pre-transform-scale2d: 1.5; }
    100% { pre-transform-scale2d: 1.0; }
}

#AnimatedLabel {
    width: 100px; height: 100px;  /* Fixed box for scaling */
    overflow: noclip;             /* MANDATORY for glows */
}
```

### Tick Rates
| Use Case | Rate |
|----------|------|
| Render | 0.05s - 0.1s |
| State | 0.5s - 1.0s |
| Background | 2.0s - 3.0s |

## ANTI-PATTERNS (CRITICAL)
| Pattern | Why Bad | Fix |
|---------|---------|-----|
| `$.GetContextPanel()` in loops | Performance | Cache at boot |
| `new Array/Object` in render | GC pressure | Reuse objects |
| Trust `visible` alone | Ghost panels | Check `actualvisibility !== "collapse"` |
| Bare panel access | Crash on reload | `try-catch` + `?.IsValid?.()` |
| `Game.GetGameTime()` unwrapped | Returns 0 | Use `gTime()` with fallback |
| `transform: scale3d` + text-shadow | Clipping | Use `pre-transform-scale2d` |
| `font-size` animation | Jitter/crash | Use `pre-transform-scale2d` |
| `box-shadow` | Doesn't render | Use gradient overlay panels |
| Radial gradients | Unreliable | Use linear gradients |
| `clip: rect()` | Ignored | Use separate panels |

## KNOWN ENGINE BUGS
| Bug | Symptom | Workaround |
|-----|---------|------------|
| Ghost Panel | Stale values after reload | `visible===true && actualvisibility!=="collapse"` |
| Shop Pause | Timer freezes | Watchdog (2s check, 5s stall = restart) |
| GetGameTime=0 | Returns 0 in menus | 4-tier fallback chain |
| Panel Crash | Exception on reload | Wrap ALL panel access in try-catch |
| Scale3d + shadow | Clipped/blurred | `pre-transform-scale2d` |

## PANORAMA CSS LEARNINGS
| Feature | Status | Alternative |
|---------|--------|-------------|
| `box-shadow` | ❌ No effect | Gradient overlay panels |
| `clip: rect()` | ❌ Unreliable | Separate panels per region |
| Radial gradients | ❌ Don't render | Linear gradients |
| Linear gradients | ✅ Works | `gradient(linear, ...)` |
| `overflow: noclip` | ✅ Required | For effects beyond bounds |
| `pre-transform-scale2d` | ✅ Required | For text scaling |
| `border-radius: 50%` | ✅ Works | Circular panels |

## BUILD

```powershell
# Compile after ANY code change
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

## NON-STANDARD STRUCTURES
| Path | Issue | Impact |
|------|-------|--------|
| `radar/fgH/` | Extra nesting | Inconsistent paths |
| `legacytarget/` | No `panorama/` wrapper | Files at root |
| `heatlh_color_blind/` | Typo + variant subdirs | Should be split |
| `hud/` | Mixed vdata + panorama | Ambiguous mod type |

## SHARED CODE (Refactor Candidates)
| Function | Found In | Purpose |
|----------|----------|---------|
| `gTime()` | soul_timer, buff_timer_*, combined_timer | Game time with cache+fallback |
| `findRoot()` | Multiple timer mods | HUD root discovery |
| `parseSec()` | Multiple | Clock text → seconds |
| Color constants | hp/, kaiz_hud/ | `r=[225,97,97]` etc. |

## DEBUG
| Tag | Module |
|-----|--------|
| `[ST-S]` | Soul Timer |
| `[ST-B]` | Buff Timer |
| `[BT-P]` | Buff Timer Position |
| `[WD]` | Watchdog |
| `[ERR]` | Exception |

Enable: `-dev -tools` launch options. Console: F7.
