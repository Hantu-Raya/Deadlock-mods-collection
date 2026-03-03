# Clip Progress Bar - Decisions

## 2026-01-24 Session Start

### Approach: Two-Label Overlay Pattern
- Base label: Grey text with shadow (always visible)
- Clip label: White text with shadow, dynamically clipped via JS
- Overlay positioned absolutely over base using `position: 0px 0px 0px`
- z-index on clip label higher than base

### Color Specification
- Base: `#808080` (grey)
- RejuvTime clip: `#ffffff` (white)
- BuffTime clip: White→Red interpolation (`rgb(255, g, g)` where g decreases)

### Progress Direction
- Progress fills TOWARD spawn (0% at countdown start, 100% at spawn)
- RejuvTime: Left-to-right fill
- BuffTime: Right-to-left fill
