# hp_colors — Persistence Fix & Footer UI Design

**Date:** 2026-03-31
**Status:** Approved

---

## Problem

Settings in the hp_colors mod always reset to defaults on game restart. Two root causes confirmed via console log inspection:

1. **Write broken** — `deadlock_hero_debuts_seen` contains only `hero_abrams` (game default). The token `[ANITA-v1-hp_colors]:...` is never written because the write path in `anita_ui_core.js` is not wired to the `ANITA_UPDATE` event.
2. **Read broken** — `anita_persist_loader.js` logs `storage available=0` and returns null immediately. It only tries `$.persistentStorage`, which does not exist in the current Deadlock client. It never falls back to reading the convar.

Additionally, the Save/Copy/Paste UI buttons are designed but not implemented.

---

## Confirmed Runtime Facts

- `$.persistentStorage` is unavailable (`storage available=0` in logs)
- `deadlock_hero_debuts_seen` is an official archived Deadlock convar (flag `a`) — saved to `cfg/user/game.cfg` on clean exit
- `GameInterfaceAPI.GetSettingString` and `GameInterfaceAPI.ConsoleCommand` are available in `base_hud.xml` context
- The QOL mod does not use `deadlock_hero_debuts_seen` — no conflict risk
- Token format already defined: `[ANITA-v1-hp_colors]:<base64url>`

---

## Scope

Three coordinated changes across two files:

| # | What | File |
|---|------|------|
| 1 | Wire auto-save to `ANITA_UPDATE` event | `anita_ui_core.js` |
| 2 | Add convar fallback to bootstrap read | `anita_persist_loader.js` |
| 3 | Add always-visible footer buttons (Save / Copy / Paste) | `anita_ui_core.js` |

---

## Section 1 — Write Path (auto-save on setting change)

**File:** `anita_ui_core.js`

When `ANITA_UPDATE` fires for hp_colors and `update_source` is not `bridge_bootstrap`:

1. Accumulate updated value into in-memory `currentValues`
2. Debounce 0.35s (cancel prior scheduled write if another change arrives)
3. On fire:
   - Build JSON payload: `{ version: 2, values: { ...currentValues } }`
   - Base64url encode → form token `[ANITA-v1-hp_colors]:<encoded>`
   - Read current `deadlock_hero_debuts_seen` via `GameInterfaceAPI.GetSettingString`
   - Strip any existing `[ANITA-v1-hp_colors]:...` entry using the token regex
   - Append new token, clean up double-commas and leading/trailing commas
   - Write back via `GameInterfaceAPI.ConsoleCommand('deadlock_hero_debuts_seen "<finalValue>"')`
   - Log `convar write ns=hp_colors encoded_len=<n>`
4. If `GameInterfaceAPI.ConsoleCommand` throws, catch and log `convar write failed`

The functions `writeConvar`, `writeConvarBestEffort`, `buildStoredPayload`, and the token regex helpers already exist in `anita_ui_core.js`. The missing piece is calling them from the `ANITA_UPDATE` listener.

---

## Section 2 — Read Path (bootstrap from convar)

**File:** `anita_persist_loader.js`

Modify `readStoredPayload()` to add a convar fallback branch:

```
readStoredPayload():
  1. If $.persistentStorage available:
       → read from persistentStorage (existing path, unchanged)
  2. Else if GameInterfaceAPI.GetSettingString available:
       → read deadlock_hero_debuts_seen
       → regex-match [ANITA-v1-hp_colors]:<encoded>
       → base64url decode → JSON parse → mergeWithDefaults
       → cachePayload and return
  3. Else:
       → log "no storage backend available"
       → return null
```

The base64url decoder (`AnitaBase64.decode`) and `parseStoredPayload` / `mergeWithDefaults` are already present in `anita_persist_loader.js`. Only the convar read branch needs to be added.

Token regex pattern (matches existing format):
```
/\[ANITA-v1-hp_colors\]:([A-Za-z0-9\-_]+)/
```

---

## Section 3 — Footer UI (Save / Copy / Paste)

**File:** `anita_ui_core.js`

A footer row rendered at the bottom of the hp_colors Anita-UI panel. Always visible regardless of persistence backend status.

### Buttons

| Button | Action | Feedback |
|--------|--------|---------|
| **Save** | Force-write current settings to convar immediately (bypass debounce, `forceWrite=true`) | Label briefly changes to "Saved!" for 1.5s |
| **Copy** | Build token string, call `$.DispatchEvent("CopyStringToClipboard", token)` | Label briefly changes to "Copied!" for 1.5s |
| **Paste** | Show inline text input in footer; on confirm, decode token → replay via `ANITA_UPDATE` | Input clears on success; shows "Error" on decode failure |

### Implementation notes

- Footer row rendered dynamically by the existing UI builder — no new XML layout file needed
- Buttons use the existing `type: "button"` element type already supported in the config schema
- `CopyStringToClipboard` availability not guaranteed — wrap in try/catch; on failure show a modal-style tooltip with the raw token text so the user can copy manually
- Paste input: a single-line `<TextEntry>` panel; on `TextEntrySubmit` or a confirm button, call the decode + replay path
- The token format for Copy/Paste is the full embeddable string: `[ANITA-v1-hp_colors]:<base64url>` so it can be shared and pasted back directly

---

## Error Handling

| Failure | Behavior |
|---------|---------|
| `ConsoleCommand` throws on write | Log `convar write failed`, session mirror still updated |
| `GetSettingString` unavailable on read | Log `no storage backend`, load defaults |
| Token not found in convar on read | Log `convar token not found`, load defaults |
| Base64url decode fails | Log `payload decode failed`, load defaults |
| `CopyStringToClipboard` unavailable | Show raw token in inline tooltip for manual copy |
| Paste token malformed | Show "Error" in paste input, do not apply |

---

## Files Changed

| File | Changes |
|------|---------|
| `hp_colors/panorama/scripts/anita_ui_core.js` | Wire `ANITA_UPDATE` → debounced convar write; add footer Save/Copy/Paste buttons |
| `hp_colors/panorama/scripts/anita_persist_loader.js` | Add convar fallback branch in `readStoredPayload()` |

No new files. No layout XML changes. No changes to `healthbar_logic.js` or `hp_registrar.js`.

---

## Success Criteria

1. After changing a setting and restarting the game, the setting is restored automatically
2. Console shows `convar write ns=hp_colors` after a setting change (within 0.35s)
3. Console shows `bootstrap replay count=9` on next launch
4. `deadlock_hero_debuts_seen` contains `[ANITA-v1-hp_colors]:...` after a setting change
5. Save button force-writes immediately and shows "Saved!" feedback
6. Copy button produces a valid token string
7. Paste button successfully restores settings from a pasted token
