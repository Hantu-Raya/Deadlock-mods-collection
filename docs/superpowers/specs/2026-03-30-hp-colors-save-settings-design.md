# HP Colors — Save Settings Design

**Date:** 2026-03-30
**Mod:** `hp_colors`
**Scope:** Add working cross-restart settings persistence to `anita_ui_core.js`

---

## Problem

`anita_ui_core.js` currently attempts persistence via three dead code paths:

1. **Primary write** (`persistConfig`, line ~475): `GameInterfaceAPI.SetSettingString("anita_ui_mod_hp_colors_v1", json)` — custom key has no `a` (archive) flag, never written to `game.cfg`, does not survive restart
2. **Fallback write** (`persistConfig`, line ~502): `$.persistentStorage.setItem(...)` — `$.persistentStorage` does not exist in Deadlock Panorama
3. **Fallback read** (`readFallbackPayload`, line ~336) and **legacy read** (`readLegacyValues`, lines ~366-378): both call `$.persistentStorage.getItem(...)` — same, does not exist

Result: all HP Colors settings reset to defaults on every game restart.

---

## Root Cause

Deadlock Panorama's JS sandbox exposes no direct persistent storage API for custom data. The only confirmed cross-restart mechanisms are:
1. **Archived (`a` flag) console variables** — saved to `cfg/user/game.cfg` on exit; readable via `GameInterfaceAPI.GetSettingString`; writable via `GameInterfaceAPI.ConsoleCommand("<cvar> <value>")`
2. **Hero build category names** — stored on Valve servers; requires complex UI automation (as used by the QOL mod)

---

## Solution Overview

Hijack the archived string convar `deadlock_hero_debuts_seen` (flags: `cl, a, release`) as a "junk drawer" for mod settings tokens. The debut system tracks which hero debut popups have been dismissed as a comma-separated list of `hero_xxx` names; it silently ignores entries that do not match a known hero name, making it safe to embed our token.

Three-tier persistence implemented entirely inside `anita_ui_core.js`:

| Tier | Mechanism | Scope |
|------|-----------|-------|
| Primary | `ConsoleCommand("deadlock_hero_debuts_seen ...")` | Cross-restart |
| Session | `root.SetAttributeString("anita_v1_<ns>", encoded)` | Within-session |
| Manual | Copy / Paste buttons in Anita-UI | Clipboard |

---

## Token Format

Each registered mod that has a `storageNamespace` gets its own namespaced token embedded in `deadlock_hero_debuts_seen`:

```
[ANITA-v1-<storageNamespace>]:<base64url_encoded_json>
```

Example for `hp_colors`:
```
[ANITA-v1-hp_colors]:eyJ2ZXJzaW9uIjoxLCJ2YWx1ZXMiOnsiLi4uIn19
```

The convar value may contain both real debut IDs and ANITA tokens, comma-separated:
```
hero_abrams,hero_bebop,[ANITA-v1-hp_colors]:eyJ...,[ANITA-v1-other_mod]:eyJ...
```

The game's debut system ignores `[ANITA-v1-...]` entries as unrecognized IDs.

**Payload:** base64url-encoded (no `=` padding, chars `[A-Za-z0-9_-]` only) JSON string matching the existing `buildStoredPayload` format:
```json
{"version":1,"values":{"hp_enabled":true,"hp_mode":1,...}}
```

The hp_colors JSON payload is approximately 215 characters, encoding to ~290 base64url characters — well within safe convar value limits.

**Base64url helpers** must be implemented in `anita_ui_core.js` (no browser `btoa`/`atob` in Panorama):
- `toBase64Url(str)` — encodes UTF-8 string to base64url without padding
- `fromBase64Url(str)` — decodes base64url string to UTF-8 string; throws on invalid input

---

## Code Paths to Change in `anita_ui_core.js`

### Replace `canReadSettings` / `canWriteSettings`

Replace both with a single guard:
```js
canPersistViaConvar: function() {
  return typeof GameInterfaceAPI !== "undefined" &&
    !!GameInterfaceAPI &&
    typeof GameInterfaceAPI.GetSettingString === "function" &&
    typeof GameInterfaceAPI.ConsoleCommand === "function";
}
```

### Replace `readPrimaryPayload`

Old: reads entire convar value as JSON via `GetSettingString(primaryKey)` where `primaryKey = "anita_ui_mod_hp_colors_v1"`.

New logic:
1. `raw = GameInterfaceAPI.GetSettingString("deadlock_hero_debuts_seen")`
2. Extract token: match `/\[ANITA-v1-<ns>\]:[A-Za-z0-9_-]+/` in `raw`
3. If match: `fromBase64Url(match[1])` → pass to existing `parseStoredPayload`
4. If no match or decode fails: return `null`

### Remove `readFallbackPayload` and `readLegacyValues`

Both are dead code (rely on `$.persistentStorage`). Remove them entirely. Update `hydrateConfig` to only call `readPrimaryPayload` (convar) then fall through to session attribute fallback (new), then defaults.

### Replace `persistConfig` write paths

Old:
- Primary: `GameInterfaceAPI.SetSettingString(primaryKey, raw)` (line ~475)
- Fallback: `$.persistentStorage.setItem(fallbackKey, raw)` (line ~502)

New:
1. `raw = this.buildStoredPayload(config)` (unchanged)
2. `encoded = toBase64Url(raw)`
3. `token = "[ANITA-v1-" + ns + "]:" + encoded`
4. `current = GameInterfaceAPI.GetSettingString("deadlock_hero_debuts_seen") || ""`
5. Replace existing token using `*` (not `+`) to catch malformed empty-payload tokens: `current.replace(/\[ANITA-v1-<ns>\]:[A-Za-z0-9_-]*/g, "").replace(/,,+/g,",").replace(/^,|,$/g,"")`. The `*` here is intentional — if a previous write produced a truncated token like `[ANITA-v1-hp_colors]:` with no payload, this cleanup removes it so no orphan prefix is left in the convar.
6. Append new token: `(cleaned ? cleaned + "," : "") + token`
7. `GameInterfaceAPI.ConsoleCommand('deadlock_hero_debuts_seen "' + finalValue + '"')` — the value is double-quoted to avoid any bracket interpretation of `[` / `]` in the Source engine console parser
8. Also: `root.SetAttributeString("anita_v1_" + ns, encoded)` (session fallback write)

### Add session fallback read in `hydrateConfig`

After `readPrimaryPayload` returns null, before applying defaults:
```js
var sessionRaw = root ? root.GetAttributeString("anita_v1_" + ns, "") : "";
if (sessionRaw) {
  try {
    var decoded = fromBase64Url(sessionRaw);
    persisted = this.parseStoredPayload(config, decoded, "session");
  } catch(e) {}
}
```

**Root panel access:** in `anita_ui_core.js` running in `base_hud.xml`, the root panel is accessible via `$.GetContextPanel()` traversing up, or `$.UIToolkitAPI.MakeGlobalObject` — use the existing pattern already used in the file for `IDs.HUD_ROOT`: `$.GetContextPanel().FindAncestor("Hud") || $.GetContextPanel()`. If unavailable, skip session tier silently.

---

## Legacy Migration

`readLegacyValues` is removed. The legacy storage key prefix `legacyStoragePrefix: "hp_mod_"` in `hp_registrar.js` becomes vestigial but harmless — no change needed there.

**Storage version:** bump `storageVersion` from `1` to `2` in `hp_registrar.js` to change the version field in the `buildStoredPayload` JSON. This prevents any hypothetical future attempt to read stale v1 data via a matching custom convar key (none will exist, but it's correct hygiene).

---

## Write Debounce

Setting changes emit `ANITA_UPDATE` events which call `handleUpdateEvent` → `persistConfig`. To avoid hammering `ConsoleCommand` on rapid changes (steppers, colorpickers), wrap `persistConfig` in a 2-second debounce using `$.Schedule`. The "Save" button bypasses the debounce and calls `persistConfig` immediately.

Debounce implementation: store a per-config `__anitaPendingWriteToken`; on each write request schedule a callback; if a new request arrives before the callback fires, cancel (via token mismatch) and reschedule.

---

## UI Additions

A footer row is added at the bottom of each mod tab in `AnitaRenderer.renderModSettings`, only when `config.storageNamespace` is set:

```
[Save]  [Copy]  [Paste]
```

- **Save** — calls `persistConfig` immediately; label changes to "Saved ✓" for 1.5s
- **Copy** — builds token string, calls `$.DispatchEvent("CopyStringToClipboard", token)`; label changes to "Copied ✓" for 1.5s
- **Paste** — reads clipboard via `TextEntry` workaround (set focus, read `text`); validates regex; if valid calls `applyResolvedValues` + `emitCurrentValues` + `persistConfig`; shows "Applied" or "Invalid"

New CSS classes needed in `anita_ui.css`: `AnitaFooterRow`, `AnitaFooterBtn`, `AnitaFooterBtnSuccess`.

---

## Guard Conditions

- All persistence calls wrapped in `canPersistViaConvar()` check
- If guard fails: session-only (`SetAttributeString`) + clipboard only
- Token extraction regex uses `+` not `*` to require at least one base64 char: `/\[ANITA-v1-[a-z0-9_]+\]:[A-Za-z0-9_-]+/`
- `ConsoleCommand` value is double-quoted: `'deadlock_hero_debuts_seen "' + finalValue + '"'` — the double-quoting protects `[` / `]` chars in the token name from any bracket parsing in the Source engine console; if testing reveals the Source parser does not interpret brackets specially, the quotes are harmless. This should be verified during implementation with a quick test write/read cycle.
- All `try/catch` around `fromBase64Url` and `JSON.parse`

---

## Files Changed

| File | Change |
|------|--------|
| `hp_colors/panorama/scripts/anita_ui_core.js` | Replace dead persistence paths; add convar read/write; add session fallback; add clipboard UI; add base64url helpers; new CSS classes |
| `hp_colors/panorama/styles/anita_ui.css` | Add `AnitaFooterRow`, `AnitaFooterBtn`, `AnitaFooterBtnSuccess` classes |
| `hp_colors/panorama/scripts/hp_registrar.js` | Bump `storageVersion: 1` → `2` |
| `hp_colors/CLAUDE.md` | Update "Known limitations" — remove note that settings always reset |
| `anitaui/panorama/scripts/anita_ui_core.js` | Mirror same changes (source-of-truth copy); new persistence code is harmless when no mod with `storageNamespace` is registered — `canPersistViaConvar()` guard or `hydrateConfig` simply falls through to defaults |
| `anitaui/panorama/styles/anita_ui.css` | Mirror CSS changes |

`hp_colors/panorama/scripts/healthbar_logic.js` — no change.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `deadlock_hero_debuts_seen` format changes in a Deadlock update | Extraction regex is narrow; ignores all non-ANITA content; fallback to defaults on any failure |
| Actual payload size (~290 base64 chars per mod) growing with multiple mods | Each mod has its own token; total convar length stays proportional to mod count; no practical limit concern for 1-2 mods |
| `ConsoleCommand` unavailable in some panel contexts | `canPersistViaConvar()` guard; silent degradation to session-only |
| Crash before `game.cfg` is written | Same loss as any other archived convar; cross-restart persistence requires clean exit |
| Clipboard API unavailable (Paste button) | Wrap in try/catch; show "Unavailable" if clipboard read fails |
