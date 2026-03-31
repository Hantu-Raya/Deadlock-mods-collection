# HP Colors Save Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead persistence code in `anita_ui_core.js` with a working 3-tier system (convar cross-restart, root panel session, clipboard manual) so HP Colors settings survive game restarts.

**Architecture:** Settings are encoded as base64url JSON and embedded as a namespaced token `[ANITA-v1-hp_colors]:base64` inside the archived game convar `deadlock_hero_debuts_seen`. The convar has the `a` (archive) flag so the game writes it to `game.cfg` on clean exit. On startup the token is extracted and decoded. A session-level `SetAttributeString` on the root panel provides within-session resilience. Save/Copy/Paste buttons give manual control.

**Tech Stack:** Deadlock Panorama JS (ES5 subset, no `btoa`/`atob`/`$.persistentStorage`), `GameInterfaceAPI.GetSettingString`, `GameInterfaceAPI.ConsoleCommand`, `$.Schedule`, `$.DispatchEvent("CopyStringToClipboard", ...)`

**Spec:** `docs/superpowers/specs/2026-03-30-hp-colors-save-settings-design.md`

---

## Key Files

| File | Role |
|------|------|
| `hp_colors/panorama/scripts/anita_ui_core.js` | Main target — contains `AnitaPersistence`, `AnitaRenderer`, `AnitaCore` |
| `hp_colors/panorama/styles/anita_ui.css` | UI styles — add footer button classes |
| `hp_colors/panorama/scripts/hp_registrar.js` | Bump `storageVersion` 1→2 |
| `hp_colors/CLAUDE.md` | Update known limitations section |
| `anitaui/panorama/scripts/anita_ui_core.js` | Mirror of above — keep in sync |
| `anitaui/panorama/styles/anita_ui.css` | Mirror of above — keep in sync |

**Do not touch:** `hp_colors/panorama/scripts/healthbar_logic.js`

---

## Codebase Orientation

`anita_ui_core.js` has three main objects, all inside one IIFE:

- **`AnitaPersistence`** (line ~137) — handles all read/write of settings. This is where all the broken code lives. Key methods: `hydrateConfig`, `persistConfig`, `readPrimaryPayload`, `readFallbackPayload`, `readLegacyValues`, `canReadSettings`, `canWriteSettings`, `canUsePersistentStorage`, `buildStoredPayload`, `parseStoredPayload`.
- **`AnitaComponents`** (line ~528) — creates individual UI controls (toggle, stepper, cycler, colorpicker, button).
- **`AnitaRenderer`** (line ~820ish) — manages the window/tabs/content. `renderModSettings` (line ~908) is where we add the footer row.
- **`AnitaCore`** (line ~968) — event listener, `handleUpdateEvent` calls `persistConfig` on every setting change.

`getRoot` helper at line ~972+ traverses up from `$.GetContextPanel()` to find the root.

---

## Task 1: Add base64url helpers to `anita_ui_core.js`

Panorama's JS has no `btoa`/`atob`. We need pure-JS base64url encode/decode.

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js` — add helpers near top of IIFE, before `AnitaPersistence`

- [ ] **Step 1: Add base64url helpers**

Find the line `const Logger = AnitaUILogger(CONFIG.DEBUG_MODE);` (around line 125). Insert the following block immediately after it:

```js
  // Base64url encode/decode — no btoa/atob in Deadlock Panorama
  var AnitaBase64 = (function () {
    var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    function encode(str) {
      var bytes = [];
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) {
          bytes.push(code);
        } else if (code < 2048) {
          bytes.push(0xC0 | (code >> 6));
          bytes.push(0x80 | (code & 0x3F));
        } else {
          bytes.push(0xE0 | (code >> 12));
          bytes.push(0x80 | ((code >> 6) & 0x3F));
          bytes.push(0x80 | (code & 0x3F));
        }
      }
      var out = "";
      for (var j = 0; j < bytes.length; j += 3) {
        var b0 = bytes[j], b1 = bytes[j + 1] || 0, b2 = bytes[j + 2] || 0;
        out += CHARS[b0 >> 2];
        out += CHARS[((b0 & 3) << 4) | (b1 >> 4)];
        out += (j + 1 < bytes.length) ? CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "";
        out += (j + 2 < bytes.length) ? CHARS[b2 & 63] : "";
      }
      return out;
    }

    function decode(str) {
      var lookup = {};
      for (var i = 0; i < CHARS.length; i++) lookup[CHARS[i]] = i;
      var bytes = [];
      for (var j = 0; j < str.length; j += 4) {
        var c0 = lookup[str[j]] || 0;
        var c1 = lookup[str[j + 1]] || 0;
        var c2 = str[j + 2] !== undefined ? (lookup[str[j + 2]] || 0) : 0;
        var c3 = str[j + 3] !== undefined ? (lookup[str[j + 3]] || 0) : 0;
        bytes.push((c0 << 2) | (c1 >> 4));
        if (str[j + 2] !== undefined) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
        if (str[j + 3] !== undefined) bytes.push(((c2 & 3) << 6) | c3);
      }
      var out = "";
      for (var k = 0; k < bytes.length; k++) {
        var b = bytes[k];
        if (b < 128) {
          out += String.fromCharCode(b);
        } else if (b < 224) {
          out += String.fromCharCode(((b & 31) << 6) | (bytes[++k] & 63));
        } else {
          var b2 = bytes[++k], b3 = bytes[++k];
          out += String.fromCharCode(((b & 15) << 12) | ((b2 & 63) << 6) | (b3 & 63));
        }
      }
      return out;
    }

    return { encode: encode, decode: decode };
  })();
```

- [ ] **Step 2: Verify the helpers round-trip**

In the same file, temporarily add a quick smoke-test log right after the `AnitaBase64` block. This will print to the Deadlock console when the mod loads:

```js
  (function() {
    var test = '{"version":2,"values":{"hp_enabled":true}}';
    var encoded = AnitaBase64.encode(test);
    var decoded = AnitaBase64.decode(encoded);
    $.Msg("[Anita-UI][Base64] roundtrip ok=" + (decoded === test ? "1" : "0") + " encoded_len=" + encoded.length);
  })();
```

- [ ] **Step 3: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js
git commit -m "feat(hp_colors): add base64url helpers to anita_ui_core"
```

---

## Task 2: Replace dead persistence guards with `canPersistViaConvar`

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js` — inside `AnitaPersistence`

- [ ] **Step 1: Replace `canReadSettings`, `canWriteSettings`, `canUsePersistentStorage`**

Find `canReadSettings: function ()` (line ~179). Replace the three methods with:

```js
    canPersistViaConvar: function () {
      return typeof GameInterfaceAPI !== "undefined" &&
        !!GameInterfaceAPI &&
        typeof GameInterfaceAPI.GetSettingString === "function" &&
        typeof GameInterfaceAPI.ConsoleCommand === "function";
    },
```

Also delete `getPrimaryKey`, `getFallbackKey`, and `STORAGE_PREFIX` — they are no longer needed.

> **Note:** `normalizeNamespace` and `getVersion` are still needed — keep them.

- [ ] **Step 2: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js
git commit -m "refactor(hp_colors): replace dead persistence guards with canPersistViaConvar"
```

---

## Task 3: Replace `readPrimaryPayload` with convar token extraction

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js` — `readPrimaryPayload` method

- [ ] **Step 1: Replace `readPrimaryPayload`**

Find the `readPrimaryPayload: function (config)` method (line ~306). Replace the entire method:

```js
    CONVAR_KEY: "deadlock_hero_debuts_seen",
    TOKEN_PREFIX: "ANITA-v1-",

    getTokenRegex: function (ns) {
      return new RegExp("\\[ANITA-v1-" + ns + "\\]:[A-Za-z0-9_-]+");
    },

    getCleanupRegex: function (ns) {
      return new RegExp("\\[ANITA-v1-" + ns + "\\]:[A-Za-z0-9_-]*", "g");
    },

    readPrimaryPayload: function (config) {
      if (!this.canPersistViaConvar()) return null;
      var ns = this.normalizeNamespace(config && config.storageNamespace);
      if (!ns) return null;

      var convarRaw = "";
      try {
        convarRaw = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
      } catch (e) {
        this.logForConfig(config, "convar read threw: " + e);
        return null;
      }

      var match = convarRaw.match(this.getTokenRegex(ns));
      if (!match) {
        this.logForConfig(config, "convar token not found in " + this.CONVAR_KEY);
        return null;
      }

      var tokenPart = match[0];
      var encoded = tokenPart.split("]:")[1] || "";
      if (!encoded) return null;

      var raw = "";
      try {
        raw = AnitaBase64.decode(encoded);
      } catch (e) {
        this.logForConfig(config, "base64 decode failed: " + e);
        return null;
      }

      this.logForConfig(config, "convar token found ns=" + ns + " encoded_len=" + encoded.length);
      return this.parseStoredPayload(config, raw, "convar");
    },
```

- [ ] **Step 2: Remove `readFallbackPayload` and `readLegacyValues`**

Find and delete both methods entirely (lines ~329-382). They reference `$.persistentStorage` which doesn't exist.

- [ ] **Step 3: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js
git commit -m "feat(hp_colors): replace readPrimaryPayload with convar token extraction"
```

---

## Task 4: Replace `persistConfig` write paths with convar write

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js` — `persistConfig` method

- [ ] **Step 1: Replace `persistConfig`**

Find `persistConfig: function (config)` (line ~462). Replace the entire method:

```js
    persistConfig: function (config) {
      if (!this.hasPersistentConfig(config)) return false;

      var raw = this.buildStoredPayload(config);
      if (!raw) return false;
      if (raw === String(config.__anitaLastPersistedRaw || "")) {
        this.logForConfig(config, "write skipped unchanged");
        return false;
      }

      var ns = this.normalizeNamespace(config.storageNamespace);
      var encoded = AnitaBase64.encode(raw);
      var token = "[ANITA-v1-" + ns + "]:" + encoded;

      if (this.canPersistViaConvar()) {
        try {
          var current = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
          // Use * in cleanup regex to also remove malformed empty-payload tokens
          var cleaned = current.replace(this.getCleanupRegex(ns), "").replace(/,,+/g, ",").replace(/^,|,$/, "");
          var finalValue = (cleaned ? cleaned + "," : "") + token;
          // Double-quote the value to protect [ ] from Source engine console bracket parsing
          GameInterfaceAPI.ConsoleCommand(this.CONVAR_KEY + ' "' + finalValue + '"');
          this.logForConfig(config, "convar write ns=" + ns + " encoded_len=" + encoded.length);

          // Verify write round-trips
          var readBack = "";
          try {
            readBack = String(GameInterfaceAPI.GetSettingString(this.CONVAR_KEY) || "");
          } catch (eRB) {}
          this.logForConfig(config, "convar readback found_token=" + (readBack.indexOf("[ANITA-v1-" + ns + "]") !== -1 ? "1" : "0"));
        } catch (e) {
          this.logForConfig(config, "convar write threw: " + e);
        }
      } else {
        this.logForConfig(config, "canPersistViaConvar=false, skipping convar write");
      }

      // Session fallback — survives panel reloads within same game session
      try {
        var root = $.GetContextPanel();
        while (root && root.GetParent()) root = root.GetParent();
        if (root && root.SetAttributeString) {
          root.SetAttributeString("anita_v1_" + ns, encoded);
          this.logForConfig(config, "session write ns=" + ns);
        }
      } catch (eSession) {
        this.logForConfig(config, "session write threw: " + eSession);
      }

      config.__anitaLastPersistedRaw = raw;
      return true;
    },
```

- [ ] **Step 2: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js
git commit -m "feat(hp_colors): replace persistConfig with convar + session write"
```

---

## Task 5: Update `hydrateConfig` — add session fallback read

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js` — `hydrateConfig` method

- [ ] **Step 1: Rewrite `hydrateConfig`**

Find `hydrateConfig: function (config)` (line ~402). Replace it:

```js
    hydrateConfig: function (config) {
      this.ensureDefaults(config);

      if (!this.hasPersistentConfig(config)) {
        config.__anitaLastPersistedRaw = "";
        this.logForConfig(config, "persistence disabled (no storageNamespace)");
        return;
      }

      // Tier 1: convar (cross-restart)
      var persisted = this.readPrimaryPayload(config);
      if (persisted) {
        this.applyResolvedValues(config, persisted.values);
        config.__anitaLastPersistedRaw = persisted.raw;
        this.logForConfig(config, "hydrated from convar");
        return;
      }

      // Tier 2: root panel attribute (session fallback)
      var ns = this.normalizeNamespace(config.storageNamespace);
      try {
        var root = $.GetContextPanel();
        while (root && root.GetParent()) root = root.GetParent();
        if (root && root.GetAttributeString) {
          var sessionEncoded = root.GetAttributeString("anita_v1_" + ns, "");
          if (sessionEncoded) {
            var sessionRaw = AnitaBase64.decode(sessionEncoded);
            var sessionPersisted = this.parseStoredPayload(config, sessionRaw, "session");
            if (sessionPersisted) {
              this.applyResolvedValues(config, sessionPersisted.values);
              config.__anitaLastPersistedRaw = sessionPersisted.raw;
              this.logForConfig(config, "hydrated from session attribute");
              return;
            }
          }
        }
      } catch (eSession) {
        this.logForConfig(config, "session read threw: " + eSession);
      }

      // Tier 3: defaults
      this.logForConfig(config, "hydrated from defaults");
      config.__anitaLastPersistedRaw = "";
    },
```

- [ ] **Step 2: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js
git commit -m "feat(hp_colors): update hydrateConfig with convar+session read tiers"
```

---

## Task 6: Add write debounce to `handleUpdateEvent`

Without debounce, every stepper `+/-` click fires a `ConsoleCommand`. Debounce to 2s.

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js` — `AnitaCore.handleUpdateEvent`

- [ ] **Step 1: Replace `handleUpdateEvent` with debounced version**

Find `handleUpdateEvent: function (data)` (line ~1066). Replace:

```js
    handleUpdateEvent: function (data) {
      if (!data || !data.mod_title || !data.setting_id) return;
      var config = this.findRegisteredMod(data.mod_title);
      if (!config) return;
      if (!AnitaPersistence.applyUpdate(config, data.setting_id, data.value)) return;

      // Debounce: cancel any pending write, schedule new one in 2s
      var writeToken = (config.__anitaPendingWriteToken || 0) + 1;
      config.__anitaPendingWriteToken = writeToken;
      $.Schedule(2.0, function () {
        if (config.__anitaPendingWriteToken !== writeToken) return; // superseded
        AnitaPersistence.persistConfig(config);
      });
    },
```

- [ ] **Step 2: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js
git commit -m "feat(hp_colors): debounce persistConfig writes by 2s"
```

---

## Task 7: Add Save / Copy / Paste footer row to `AnitaRenderer.renderModSettings`

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js` — `AnitaRenderer.renderModSettings`
- Modify: `hp_colors/panorama/styles/anita_ui.css` — add footer CSS

- [ ] **Step 1: Add footer row at end of `renderModSettings`**

Find the closing of `renderModSettings` just before the final `},` (line ~963–964, after the `config.elements.forEach` block). Insert:

```js
      // Footer: Save / Copy / Paste (only for mods with storageNamespace)
      if (config.storageNamespace) {
        var footer = $.CreatePanel("Panel", container, "");
        footer.AddClass("AnitaFooterRow");

        function makeFooterBtn(parent, label, id) {
          var btn = $.CreatePanel("Button", parent, id || "");
          btn.AddClass("AnitaFooterBtn");
          var lbl = $.CreatePanel("Label", btn, "");
          lbl.text = label;
          return { btn: btn, lbl: lbl };
        }

        function flashLabel(btn, lbl, msg, durationSec) {
          var orig = lbl.text;
          lbl.text = msg;
          btn.AddClass("AnitaFooterBtnSuccess");
          $.Schedule(durationSec, function () {
            if (lbl && lbl.IsValid()) lbl.text = orig;
            if (btn && btn.IsValid()) btn.RemoveClass("AnitaFooterBtnSuccess");
          });
        }

        // Save button — bypasses debounce
        var saveB = makeFooterBtn(footer, "Save", "");
        saveB.btn.SetPanelEvent("onactivate", function () {
          config.__anitaPendingWriteToken = (config.__anitaPendingWriteToken || 0) + 1; // cancel pending debounce
          AnitaPersistence.persistConfig(config);
          flashLabel(saveB.btn, saveB.lbl, "Saved!", 1.5);
        });

        // Copy button
        var copyB = makeFooterBtn(footer, "Copy", "");
        copyB.btn.SetPanelEvent("onactivate", function () {
          var raw = AnitaPersistence.buildStoredPayload(config);
          var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
          var encoded = AnitaBase64.encode(raw);
          var token = "[ANITA-v1-" + ns + "]:" + encoded;
          try {
            $.DispatchEvent("CopyStringToClipboard", token);
            flashLabel(copyB.btn, copyB.lbl, "Copied!", 1.5);
          } catch (e) {
            flashLabel(copyB.btn, copyB.lbl, "Failed", 1.5);
          }
        });

        // Paste button — uses TextEntry clipboard workaround
        var pasteB = makeFooterBtn(footer, "Paste", "");
        var pasteEntry = $.CreatePanel("TextEntry", footer, "");
        pasteEntry.style.width = "0px";
        pasteEntry.style.height = "0px";
        pasteEntry.style.opacity = "0";
        pasteB.btn.SetPanelEvent("onactivate", function () {
          try {
            pasteEntry.text = "";
            pasteEntry.SetFocus();
            $.DispatchEvent("TextEntryPasteFromClipboard", pasteEntry);
            $.Schedule(0.1, function () {
              var text = pasteEntry.text;
              if (!text) { flashLabel(pasteB.lbl, "Empty", 1.5); return; }
              var ns = AnitaPersistence.normalizeNamespace(config.storageNamespace);
              var rx = new RegExp("\\[ANITA-v1-" + ns + "\\]:[A-Za-z0-9_-]+");
              var match = text.match(rx);
              if (!match) { flashLabel(pasteB.btn, pasteB.lbl, "Invalid", 1.5); return; }
              var encoded = match[0].split("]:")[1] || "";
              try {
                var raw = AnitaBase64.decode(encoded);
                var parsed = AnitaPersistence.parseStoredPayload(config, raw, "paste");
                if (!parsed) { flashLabel(pasteB.btn, pasteB.lbl, "Invalid", 1.5); return; }
                AnitaPersistence.applyResolvedValues(config, parsed.values);
                // Re-render tab to update UI controls
                AnitaRenderer.renderModSettings(config);
                // Emit all current values to healthbar_logic
                AnitaCore.emitCurrentValues(config);
                AnitaPersistence.persistConfig(config);
                flashLabel(pasteB.btn, pasteB.lbl, "Applied!", 1.5);
              } catch (eDec) {
                flashLabel(pasteB.btn, pasteB.lbl, "Invalid", 1.5);
              }
            });
          } catch (ePaste) {
            flashLabel(pasteB.btn, pasteB.lbl, "Unavailable", 1.5);
          }
        });
      }
```

- [ ] **Step 2: Add CSS classes to `anita_ui.css`**

Append at the end of `hp_colors/panorama/styles/anita_ui.css`:

```css
.AnitaFooterRow
{
    flow-children: right;
    margin-top: 10px;
    padding: 6px 8px;
    background-color: gradient( linear, 0% 0%, 0% 100%, from( #1a1a1aaa ), to( #111111aa ) );
    border-radius: 4px;
    align: center center;
}

.AnitaFooterBtn
{
    padding: 4px 14px;
    margin-right: 6px;
    background-color: #2a2a2a;
    border-radius: 3px;
    transition-property: background-color;
    transition-duration: 0.1s;
}

.AnitaFooterBtn:hover
{
    background-color: #3d3d3d;
}

.AnitaFooterBtn Label
{
    color: #c8c8c8;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.AnitaFooterBtnSuccess Label
{
    color: #7fff7f;
}
```

- [ ] **Step 3: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js hp_colors/panorama/styles/anita_ui.css
git commit -m "feat(hp_colors): add Save/Copy/Paste footer row to Anita-UI settings panel"
```

---

## Task 8: Bump `storageVersion` in `hp_registrar.js`

**Files:**
- Modify: `hp_colors/panorama/scripts/hp_registrar.js`

- [ ] **Step 1: Bump version**

Find `storageVersion: 1` in `hp_registrar.js` (line ~35). Change to:

```js
      storageVersion: 2,
```

- [ ] **Step 2: Commit**

```bash
git add hp_colors/panorama/scripts/hp_registrar.js
git commit -m "chore(hp_colors): bump storageVersion to 2"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `hp_colors/CLAUDE.md`

- [ ] **Step 1: Update Known Limitations section**

Find the `## Known limitations` section. Replace:

```markdown
- `$.persistentStorage` is unavailable in Deadlock Panorama — settings reset to defaults on game restart
- No cross-restart persistence until Valve enables the storage API
```

With:

```markdown
- Settings are persisted cross-restart via the `deadlock_hero_debuts_seen` archived convar. Requires a clean game exit (crash = settings lost for that session, same as any game setting).
- The convar token survives game updates unless Valve changes the `deadlock_hero_debuts_seen` format — regex extraction is defensive and falls back to defaults on any parse failure.
```

- [ ] **Step 2: Commit**

```bash
git add hp_colors/CLAUDE.md
git commit -m "docs(hp_colors): update known limitations — persistence now works"
```

---

## Task 10: Remove smoke-test log from Task 1

The temporary round-trip log added in Task 1 Step 2 must be removed before shipping.

**Files:**
- Modify: `hp_colors/panorama/scripts/anita_ui_core.js`

- [ ] **Step 1: Delete the smoke-test IIFE**

Remove the `(function() { var test = ...})()` block added in Task 1.

- [ ] **Step 2: Commit**

```bash
git add hp_colors/panorama/scripts/anita_ui_core.js
git commit -m "chore(hp_colors): remove base64 smoke-test log"
```

---

## Task 11: Mirror changes to `anitaui/`

`anitaui/` is the standalone copy of the framework. Mirror all changes.

**Files:**
- Modify: `anitaui/panorama/scripts/anita_ui_core.js`
- Modify: `anitaui/panorama/styles/anita_ui.css` (if it exists; skip if not)

- [ ] **Step 1: Copy updated files**

```bash
cp hp_colors/panorama/scripts/anita_ui_core.js anitaui/panorama/scripts/anita_ui_core.js
cp hp_colors/panorama/styles/anita_ui.css anitaui/panorama/styles/anita_ui.css
```

> If `anitaui/panorama/styles/anita_ui.css` does not exist yet, create it by copying from `hp_colors`. The spec lists it as a required change — do not skip it.

- [ ] **Step 2: Commit**

```bash
git add anitaui/
git commit -m "chore(anitaui): mirror save-settings changes from hp_colors"
```

---

## Task 12: Pack and verify in-game

**Files:** No source changes — build and test.

- [ ] **Step 1: Pack the VPK**

Use the `/pack-vpk` skill or run:
```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

- [ ] **Step 2: In-game verification checklist**

Launch Deadlock and open the Anita-UI settings panel:

1. **Base64 log** (if smoke-test not yet removed): check console for `[Anita-UI][Base64] roundtrip ok=1`
2. **Footer row visible**: Save / Copy / Paste buttons appear at bottom of HP Colors tab
3. **Change a setting** (e.g. toggle "Enable" off): wait 2s, check console for `convar write ns=hp_colors`
4. **Verify readback**: console should show `convar readback found_token=1`
5. **Copy**: click Copy, check clipboard contains `[ANITA-v1-hp_colors]:...`
6. **Restart game**: settings should load from convar on next launch — check console for `hydrated from convar`
7. **Paste**: copy a valid token to clipboard, click Paste, verify settings update and UI refreshes
8. **Bracket safety**: check that `[` and `]` in the token name don't cause a console error — look for unexpected output when writing

- [ ] **Step 3: Commit if any fixes were needed from verification**

```bash
git add -p
git commit -m "fix(hp_colors): <describe fix>"
```

---

## Implementation Notes

- **Panorama JS is ES5** — no `const`/`let` inside functions that existed before, no arrow functions in new `AnitaPersistence` methods (use `var` and `function`). Arrow functions are already used in `AnitaComponents`/`AnitaRenderer` — fine to continue there.
- **`PERSISTENCE_DEBUG: true`** is set in CONFIG — all `this.logForConfig(...)` calls will print to console. Use this liberally to trace what's happening.
- **`getRoot` pattern** — the existing code at line ~877 uses `let root = $.GetContextPanel(); while (root.GetParent()) root = root.GetParent();` for the root panel. Use that same pattern in `persistConfig` and `hydrateConfig`.
- **`parseStoredPayload`** expects JSON in the format `{"version": N, "values": {...}}` — `buildStoredPayload` produces this. Don't change either of these.
- **`TextEntryPasteFromClipboard`** event name — if this doesn't work in Deadlock, try `TextEntryPaste`. The event name needs to be verified in-game.
