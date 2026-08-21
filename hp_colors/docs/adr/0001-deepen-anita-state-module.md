---
status: accepted
---

# Deepen Anita state behind a send/read seam

HP Colors Rewrite will concentrate canonical values, hero scopes, selected preset routing, preset repository transitions, ability conditions, Undo, transfer policy, runtime settling, normalization, and effective preset snapshot equality in one deep in-process Anita state module. After a focused compile, load-order, packaging, and VM proof, the module will live in a separate authored Panorama script that exposes one immutable factory; Anita UI will own the only runtime instance. Its interface will be `send(domainIntent)`, returning a typed outcome, immutable view, and declarative effects, plus `read()` for the cached current view. Panorama rendering, root attributes, event dispatch, adaptive replay, scheduling, and clipboard execution remain outside the seam.

## Considered options

- Keeping the module inside `hp_colors_menu.js` avoids a new global factory but prevents the interface from becoming the direct test surface.
- Grouped caller-first methods make current handlers shorter but create a wider, shallower interface that grows with Anita UI.
- An extensible intent registry adds a hypothetical seam without a second extension author or runtime variation.
- A global singleton would create a second authority; the accepted factory creates isolated instances instead.

## Consequences

The module will own versioned same-session hydration, atomic domain intents, gesture and confirmation transactions, lifecycle epochs, required ability-slot projections, typed rejections, transition IDs, and effective revisions. It will return only session-state, effective preset snapshot, and clipboard-write effects; adapters retry effects idempotently without rolling back state. Direct send/read tests will replace redundant VM policy tests, while focused VM tests remain for Panorama wiring, transport, scheduling, packaging, and live behavior. If the separate-script proof fails, implementation stops and this decision must be revisited rather than adding a compatibility path or duplicate authority.
