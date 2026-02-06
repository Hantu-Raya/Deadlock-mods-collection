# Draft: Buff Timer Optimization Plan

## Requirements (confirmed)
- Optimize for low CPU usage during gaming
- Optimize for GPU and memory efficiency
- Maintain information accuracy (timer accuracy is critical)
- Fix existing bugs

## Codebase Analysis (from explore agent)

### File Structure
- `panorama/scripts/rejuvnbufftimer.js` (1490 lines) - Main logic
- `panorama/styles/hud_timer.css` (353 lines) - Timer styling
- `panorama/styles/buff_claim.css` (481 lines) - Minimap glows, claim indicators
- `panorama/layout/hud.xml` (379 lines) - Panel definitions

### Current Good Patterns (KEEP)
| Pattern | Implementation | Benefit |
|---------|---------------|---------|
| Adaptive Polling | 0.1s when active, 1s normal, 30s idle | Reduces idle CPU |
| DOM Write Guards | `_lastRejuvText` compare before assign | Prevents redundant layout |
| Time Caching | `_tCache` with 200ms TTL | Reduces string parsing |
| Player Cache | `_playerCache` with 800ms TTL | Reduces DOM traversal |
| Squared Distance | `distSq()` instead of `Math.sqrt()` | Avoids expensive sqrt |
| Object Pooling | `_posResult`, `_nearResult` reused | Eliminates GC pressure |
| Early Exit | Quick bailout when claim not active | 99% check elimination |

### Identified Bugs/Issues
1. **DUPLICATE TEXT ASSIGNMENT (lines 274-293)**: Second `if (t !== _lastRejuvText)` check never executes because line 276 already set `_lastRejuvText = t`
2. **Missing panel validity check**: Line 274 doesn't check `UI.rLab?.IsValid?.()` before assignment
3. **No bounds checking on SEQ[idx]**: Could cause undefined access if idx corrupted
4. **Floating point comparison**: `now !== lastSec` could miss ticks due to float precision

### Areas for Optimization
1. Consolidate duplicate BHasClass calls in hot paths
2. Reduce try-catch scope (some wrap large blocks unnecessarily)
3. Consider consolidating linger + powerup iteration logic (shared player iterator)
4. Claim ring animation could use less frequent updates

## Research Findings

### Panorama UI Specific
- Known JavaScript slowness issues in Source 2 Panorama (CS:GO issue #3972)
- Frame spikes caused by excessive JS/PanoramaUI processing
- Panel lifecycle management critical

### General Game UI Optimization
- Frame budget: 16.67ms for 60frame_rate
- Object pooling reduces GC pressure
- Adaptive polling based on activity state
- Batch DOM operations
- Separate update logic from render logic

## Panorama-Specific Optimization Research (Librarian)

### $.Schedule() Interval Guidelines
| Use Case | Interval | Frequency |
|----------|----------|-----------|
| Particle/Visual Effects | `1/144` | 144Hz |
| Input/Click Behaviors | `1/60` | 60Hz |
| Entity/Unit Updates | `1/30` | 30Hz |
| Shop/Range Checks | `1/10` | 10Hz |
| Screen Resize Detection | `1/4` | 4Hz |
| Background Data Sync | `1/2` to `1` | 0.5-1Hz |

### Expensive CSS Properties (Avoid)
| Property | Cost | Optimization |
|----------|------|--------------|
| `box-shadow` | Very High | Use pre-rendered images |
| `blur()` filter | Very High | Avoid real-time blur |
| `transform: scale3d` + shadow | High | Use `pre-transform-scale2d` |
| Complex gradients | Medium | Use `s2r://` image references |

### Memory Leak Prevention
1. Use `DeleteAsync(delay)` instead of immediate deletion
2. Clear panel references after deletion: `delete panels[id]`
3. Use IIFE pattern to avoid global scope pollution
4. Track event handlers and use active flags

### Panel Caching Best Practices
- Cache all panels at boot in `UI` object
- Always check `panel?.IsValid?.()` before access
- Boot retry pattern: `if (!UI.panel?.IsValid?.()) return $.Schedule(0.5, boot);`

## Open Questions
- [ ] Priority: CPU vs Memory vs visual polish?
- [ ] Acceptable visual degradation for performance?
- [ ] Any specific lag/stuttering user is experiencing?
- [ ] Target frame budget for the mod?

## Scope Boundaries
- INCLUDE: [TBD after interview]
- EXCLUDE: [TBD after interview]
