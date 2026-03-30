# hp_colors — Persistence Fix & Footer UI Design

**Date:** 2026-03-31
**Status:** Design approved — implementation pending

---

## Problem

Settings in the hp_colors mod always reset to defaults on game restart. Two root causes confirmed via console log inspection:

1. **Write broken** — `deadlock_hero_debuts_seen` contains only `hero_abrams` (game default). The token `[ANITA-v1-hp_colors]:...` is never written because `handleUpdateEvent` in `anita_ui_core.js` calls `applyUpdate` but never calls `persistConfig`. The `writeConvar` / `writeConvarBestEffort` infrastructure already exists and is wired inside `persistConfig` — the missing link is the `handleUpdateEvent → scheduleDebounced → persistConfig` chain.
2. **Read broken** — `anita_persist_loader.js` logs `storage available=0` and returns null immediately. `readStoredPayload()` checks `hasPersistentStorage()`, gets false, and bails. It has no convar fallback branch.

Additionally, the Save/Copy/Paste UI buttons are not yet implemented.

---

## Runtime Facts

- `$.persistentStorage` is unavailable (`storage available=0` confirmed in logs)
- `deadlock_hero_debuts_seen` is an official archived Deadlock convar (flag `a`) — saved to `cfg/user/game.cfg` on clean exit
- `GameInterfaceAPI.GetSettingString` and `GameInterfaceAPI.ConsoleCommand` appear to be available in `base_hud.xml` context (guarded by runtime `typeof` checks in code); neither individual API availability nor full end-to-end round-trip (write on change → read on restart) has been independently verified
- The QOL mod does not use `deadlock_hero_debuts_seen` — no conflict risk
- Token format already defined: `[ANITA-v1-hp_colors]:<base64url>`

---

## Scope

Three coordinated changes across two files:

| # | What | File |
|---|------|------|
| 1 | Wire `handleUpdateEvent` → debounced `persistConfig` | `anita_ui_core.js` |
| 2 | Add convar fallback branch to `readStoredPayload()` | `anita_persist_loader.js` |
| 3 | Add always-visible footer buttons (Save / Copy / Paste) | `anita_ui_core.js` |

**Ownership rule:** `anita_ui_core.js` owns convar writes (via `persistConfig`). `anita_persist_loader.js` owns bootstrap reads — it will now also read from the convar when `$.persistentStorage` is unavailable. Both files independently handle their own read/write side; they do not share a read path.

---

## Section 1 — Write Path (auto-save on setting change)

**File:** `anita_ui_core.js`

**This is a new change to be implemented** — `handleUpdateEvent` currently calls only `applyUpdate` and returns. `persistConfig` already exists and is wired to the Save and Paste buttons, but the auto-save-on-change call from `handleUpdateEvent` is absent and must be added.

**Specific change:** In `handleUpdateEvent`, after `applyUpdate` returns true, add a debounced `persistConfig` call, skipping if `update_source === "bridge_bootstrap"`.

Debounce window: **2 seconds** (chosen to avoid flooding `ConsoleCommand` on rapid stepper or slider drags; the debounce token lives in `anita_ui_core.js` and is separate from `anita_persist_loader.js`'s `PERSIST_DEBOUNCE_SEC`).

Full write sequence when triggered:
1. Accumulate updated value into in-memory `currentValues`
2. Cancel prior scheduled persist token; schedule new one for 2s
3. On fire:
   - Build JSON payload: `{ version: 2, values: { ...currentValues } }`
   - Base64url encode → form token `[ANITA-v1-hp_colors]:<encoded>`
   - Read current `deadlock_hero_debuts_seen` via `GameInterfaceAPI.GetSettingString`
   - Strip any existing `[ANITA-v1-hp_colors]:...` entry using the token regex
   - Append new token, clean up double-commas and leading/trailing commas
   - Write back via `GameInterfaceAPI.ConsoleCommand('deadlock_hero_debuts_seen "<finalValue>"')`
   - Log `convar write ns=hp_colors encoded_len=<n>`
4. If `ConsoleCommand` throws, catch and log `convar write failed`; session mirror is still updated

The functions `writeConvar`, `writeConvarBestEffort`, `buildStoredPayload`, and token regex helpers already exist and are already called inside `persistConfig`. No new infrastructure needed.

---

## Section 2 — Read Path (bootstrap from convar)

**File:** `anita_persist_loader.js`

**This is a new change to be implemented** — `readStoredPayload()` currently has no convar read path. Modify it to add a convar fallback branch:

```
readStoredPayload():
  1. If cache hit (cachedRaw && cachedEncoded && cachedValues):
       → return from cache (existing path, unchanged)
  2. If $.persistentStorage available:
       → read from persistentStorage (existing path, unchanged)
  3. Else if GameInterfaceAPI available and GetSettingString is a function:
       → call GameInterfaceAPI.GetSettingString("deadlock_hero_debuts_seen")
       → regex-match [ANITA-v1-hp_colors]:<encoded>
       → if no match: log "convar token not found", return null
       → AnitaBase64.decode(encoded) → parseStoredPayload → mergeWithDefaults
       → cachePayload(raw, encoded, values) and return result
  4. Else:
       → log "no storage backend available"
       → return null
```

`AnitaBase64.decode`, `parseStoredPayload`, `mergeWithDefaults`, and `cachePayload` are all already present in `anita_persist_loader.js`.

Token regex:
```
/\[ANITA-v1-hp_colors\]:([A-Za-z0-9\-_]+)/
```

---

## Section 3 — Footer UI (Save / Copy / Paste)

**File:** `anita_ui_core.js`

A footer rendered at the bottom of the hp_colors Anita-UI panel. Always visible regardless of persistence backend status.

### Layout

Two-row structure inside a `footerWrap` panel:

- **Row 1 (button row):** Save, Copy, Paste buttons always visible
- **Row 2 (paste row):** A `TextEntry` input + Apply button; hidden by default, toggled visible when Paste is clicked

### Buttons

| Button | Action | Feedback |
|--------|--------|---------|
| **Save** | Force-write current settings to convar immediately (`forceWrite=true` bypasses the "unchanged payload" skip-guard in `persistConfig`) | Label briefly changes to "Saved!" for 1.5s |
| **Copy** | Build token string, call `$.DispatchEvent("CopyStringToClipboard", $.GetContextPanel(), token)` | Label briefly changes to "Copied!" for 1.5s |
| **Paste** | Toggle the paste row visible; hide it again on successful apply or second Paste click | Paste row appears/disappears |

### Paste row

- Single-line `TextEntry` panel
- "Apply" button: on click, decode token from TextEntry → call in order:
  1. `AnitaPersistence.applyResolvedValues`
  2. `AnitaPersistence.persistConfig(config, true)`
  3. `setPasteVisible(false)` — hide the paste row **before** re-rendering (safe: avoids stale panel references)
  4. `AnitaRenderer.renderModSettings(config)` — visually updates all control states
  5. `AnitaCore.emitCurrentValues`
- On decode failure: show "Error" label next to the Apply button; do not hide the paste row

### Implementation notes

- Footer row rendered dynamically by the existing UI builder — no new XML layout file needed
- `CopyStringToClipboard` call must include the context panel as the second argument: `$.DispatchEvent("CopyStringToClipboard", $.GetContextPanel(), token)`
- If `CopyStringToClipboard` throws, catch and display the raw token in an inline tooltip so the user can copy manually

---

## Error Handling

| Failure | Behavior |
|---------|---------|
| `ConsoleCommand` throws on write | Log `convar write failed`, session mirror still updated |
| `GetSettingString` unavailable on read | Log `no storage backend available`, load defaults |
| Token not found in convar on read | Log `convar token not found`, load defaults |
| Base64url decode fails | Log `payload decode failed`, load defaults |
| `CopyStringToClipboard` throws | Show raw token in inline tooltip for manual copy |
| Paste token malformed | Show "Error" next to Apply button, do not apply |

---

## Files Changed

| File | Changes |
|------|---------|
| `hp_colors/panorama/scripts/anita_ui_core.js` | Wire `handleUpdateEvent` → debounced `persistConfig`; add footer Save/Copy/Paste UI |
| `hp_colors/panorama/scripts/anita_persist_loader.js` | Add convar fallback branch in `readStoredPayload()` |
| `hp_colors/CLAUDE.md` | Update persistence status to reflect working convar path |

No new layout XML files. No changes to `healthbar_logic.js`. `hp_registrar.js` already has `storageVersion: 2` — no further changes needed there.

---

## Success Criteria

1. After changing a setting and restarting the game, the setting is restored automatically
2. Console shows `convar write ns=hp_colors` after a setting change (within 2s of last change)
3. Console shows `bootstrap replay count=<N>` on next launch, where N equals the number of keys in the stored payload (expected: all schema keys = 9)
4. `deadlock_hero_debuts_seen` contains `[ANITA-v1-hp_colors]:...` after a setting change
5. Save button force-writes immediately and shows "Saved!" feedback
6. Copy button produces a valid token string (verified by pasting it back)
7. Paste button successfully restores settings from a pasted token
