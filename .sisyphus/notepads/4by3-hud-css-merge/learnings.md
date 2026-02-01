# Learnings - 4by3-hud-css-merge

## 2026-01-30 Session Start
- Strategy: "New base + 4:3 overlay" - use new game CSS as base
- ONLY override: `#health_and_abilities_container { margin-right: 70% }` (was 1290px in new CSS)
- All other differences: take NEW game values
- DO NOT preserve old/stale 4:3 values
