# Clip Progress Bar - Learnings

## 2026-01-24 Session Complete

### Implementation Summary
All 4 tasks completed with critical fix applied:
1. **XML**: Added `RejuvTimeClip` and `BuffTimeClip` overlay labels
2. **CSS**: Modified base labels to grey (#808080), added clip overlay labels with white fill
3. **JS**: Added progress calculation, DOM guards, panel caching, and reset logic
4. **Compile**: 4 files compiled successfully with 0 failures

### CRITICAL FIX: clip-path vs clip: rect()
**Original plan used `clip-path: inset()` - THIS DOES NOT WORK IN PANORAMA JS!**

The native Deadlock implementation (as seen in Panorama Debugger) uses:
```css
clip: rect(top%, right%, bottom%, left%);
```

**Correct syntax for Panorama:**
- CSS: `clip: rect(0%, 100%, 100%, 100%);`
- JS: `panel.style.clip = "rect(0%,50%,100%,0%)";`

**Progress formulas:**
- RejuvTime (L→R): `rect(0%, ${pct}%, 100%, 0%)` - right edge moves 0→100%
- BuffTime (R→L): `rect(0%, 100%, 100%, ${100-pct}%)` - left edge moves 100%→0%

### Key Implementation Details
- Progress: 0% at countdown start → 100% at spawn
- BuffTime color interpolation: `rgb(255, g, g)` where g = 255*(1-pct/100)

## 2026-01-24 Session Start

### Source File Analysis
- **hud.xml**: Buff panel at lines 193-196, Rejuv panel at lines 197-201
- **hud_timer.css**: BuffTime styling at lines 137-151, RejuvTime at lines 153-167
- **rejuvnbufftimer.js**: UI object at line 40, DOM guards at line 30, main loop at line 75-77

### Key Pattern from Example
- Native engine uses `SplitLabel` + `src="panel://..."` which is ENGINE-ONLY
- Our approach: Two overlapping Label panels with CSS `clip-path: inset()`
- Thick shadow pattern: `text-shadow: 0px 0px 0px 8 black;`

### Current Timer Colors
- Both use `color: offWhite@90` - will change to `#808080` (grey)

### Clip-path Direction Logic
- L→R fill (RejuvTime): `clip-path: inset(0% ${100-pct}% 0% 0%)` - clips from RIGHT
- R→L fill (BuffTime): `clip-path: inset(0% 0% 0% ${100-pct}%)` - clips from LEFT
