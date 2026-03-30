# hp_colors Persistence Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hp_colors settings resetting to defaults on game restart by wiring the auto-save write path and adding the convar fallback read path.

**Architecture:** Two independent changes in two files. `anita_ui_core.js` gets a debounced `persistConfig` call wired into `handleUpdateEvent` so settings are written to the convar on every change. `anita_persist_loader.js` gets a convar fallback branch in `readStoredPayload` so settings are read back from the convar on bootstrap when `$.persistentStorage` is unavailable (always, on this client).

**Tech Stack:** Panorama JS (Source 2 engine), `GameInterfaceAPI.ConsoleCommand` / `GetSettingString`, archived convar `deadlock_hero_debuts_seen`, `$.Schedule` for debounce, `ClientUI_FireOutput` events.

---

## Pre-flight

Before starting, verify you can build and deploy:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

Expected: `pak96_dir.vpk` copied to the Deadlock addons folder with no errors.

Open Deadlock, load a match or use sandbox mode. Open the console (`~`). You should see:

```
[Anita-UI][Bridge] HP Colors | storage available=0
[Anita-UI][Bridge] HP Colors | loader ready
```

If those lines don't appear, the mod is not loading. Do not proceed until they do.

---

## File Map

| File | Change |
|------|--------|
| `hp_colors/panorama/scripts/anita_ui_core.js` | Add debounced `persistConfig` call in `handleUpdateEvent` (~line 1360) |
| `hp_colors/panorama/scripts/anita_persist_loader.js` | Add convar fallback branch in `readStoredPayload` (~line 292) |
| `hp_colors/CLAUDE.md` | Update persistence status section |

No new files. `hud_escape_menu.xml` already exists (pre-existing from prior work). No changes to `healthbar_logic.js` or `hp_registrar.js`.

---

## Task 1: Wire auto-save in `handleUpdateEvent`

**File:** `hp_colors/panorama/scripts/anita_ui_core.js`

`handleUpdateEvent` (line 1356) currently calls `applyUpdate` and handles `bridge_bootstrap` — but never calls `persistConfig`. Add a debounced write after `applyUpdate` succeeds, skipping bootstrap events.

- [ ] **Step 1: Locate the exact insertion point**

  Read `anita_ui_core.js` around line 1356. Confirm `handleUpdateEvent` looks like this:

  ```js
  handleUpdateEvent: function (data) {
    if (!data || !data.mod_title || !data.setting_id) return;
    var config = this.findRegisteredMod(data.mod_title);
    if (!config) return;
    if (!AnitaPersistence.applyUpdate(config, data.setting_id, data.value)) return;
    if (String(data.update_source || "") === "bridge_bootstrap") {
      config.__anitaBootstrapReceived = true;
      this.queueRenderRefresh(config);
    }
  },
  ```

- [ ] **Step 2: Add the debounced persist call**

  Replace the `handleUpdateEvent` function body with:

  ```js
  handleUpdateEvent: function (data) {
    if (!data || !data.mod_title || !data.setting_id) return;
    var config = this.findRegisteredMod(data.mod_title);
    if (!config) return;
    if (!AnitaPersistence.applyUpdate(config, data.setting_id, data.value)) return;
    if (String(data.update_source || "") === "bridge_bootstrap") {
      config.__anitaBootstrapReceived = true;
      this.queueRenderRefresh(config);
      return;
    }
    // Auto-save: debounce 2s to avoid flooding ConsoleCommand on rapid slider drags
    var writeToken = (config.__anitaPendingWriteToken || 0) + 1;
    config.__anitaPendingWriteToken = writeToken;
    $.Schedule(2.0, function () {
      if (!config || config.__anitaPendingWriteToken !== writeToken) return;
      AnitaPersistence.persistConfig(config, false);
    });
  },
  ```

  Key points:
  - `return` is added after the `bridge_bootstrap` block so bootstrap events never trigger a write
  - Token pattern (`writeToken` / `__anitaPendingWriteToken`) cancels earlier pending writes when new changes arrive within the 2s window
  - `forceWrite=false` lets `persistConfig` skip if payload is unchanged (its own guard)

- [ ] **Step 3: Build and deploy**

  ```powershell
  powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
  ```

- [ ] **Step 4: Verify write fires in-game**

  Launch Deadlock. Open the Anita-UI panel for HP Colors. Change any setting (e.g. toggle HP Colors off then on). Wait 2 seconds. In the console, run:

  ```
  deadlock_hero_debuts_seen
  ```

  **Expected:** Value contains `[ANITA-v1-hp_colors]:` followed by a base64url string.

  Also check the console log for:
  ```
  [Anita-UI][Persist] HP Colors | convar write ns=hp_colors encoded_len=...
  [Anita-UI][Persist] HP Colors | convar readback found_token=1
  ```

  If `found_token=0` appears, the write happened but the readback failed — note it and continue (it may be a same-session timing issue).

- [ ] **Step 5: Commit**

  ```bash
  git add hp_colors/panorama/scripts/anita_ui_core.js
  git commit -m "fix(hp_colors): wire handleUpdateEvent to debounced persistConfig for auto-save"
  ```

---

## Task 2: Add convar fallback read in `anita_persist_loader.js`

**File:** `hp_colors/panorama/scripts/anita_persist_loader.js`

`readStoredPayload` (line 282) currently checks `hasPersistentStorage()`, gets `false`, logs `"persistentStorage unavailable; manual token fallback only"`, and returns `null`. Add a branch that reads from `deadlock_hero_debuts_seen` via `GameInterfaceAPI.GetSettingString` when `$.persistentStorage` is unavailable.

- [ ] **Step 1: Locate the insertion point**

  Read `anita_persist_loader.js` around line 282. Confirm `readStoredPayload` looks like this (the relevant part):

  ```js
  function readStoredPayload() {
    if (cachedRaw && cachedEncoded && cachedValues) {
      return { raw: cachedRaw, encoded: cachedEncoded, values: cloneValues(cachedValues), source: "cache" };
    }

    if (!hasPersistentStorage()) {
      log("persistentStorage unavailable; manual token fallback only");
      return null;
    }
    // ... persistentStorage read path ...
  }
  ```

- [ ] **Step 2: Replace the early-return with convar fallback**

  Replace:

  ```js
  if (!hasPersistentStorage()) {
    log("persistentStorage unavailable; manual token fallback only");
    return null;
  }
  ```

  With:

  ```js
  if (!hasPersistentStorage()) {
    log("persistentStorage unavailable; trying convar fallback");

    var hasConvar = typeof GameInterfaceAPI !== "undefined" &&
      GameInterfaceAPI &&
      typeof GameInterfaceAPI.GetSettingString === "function";

    if (!hasConvar) {
      log("no storage backend available");
      return null;
    }

    var convarRaw = "";
    try {
      convarRaw = String(GameInterfaceAPI.GetSettingString("deadlock_hero_debuts_seen") || "");
    } catch (eConvar) {
      log("convar read threw: " + eConvar);
      return null;
    }

    var tokenMatch = convarRaw.match(/\[ANITA-v1-hp_colors\]:([A-Za-z0-9\-_]+)/);
    if (!tokenMatch) {
      log("convar token not found");
      return null;
    }

    var convarEncoded = tokenMatch[1];
    var convarDecoded = "";
    try {
      convarDecoded = AnitaBase64.decode(convarEncoded);
    } catch (eDec) {
      log("convar payload decode failed err=" + eDec);
      return null;
    }

    var convarParsed = parseStoredPayload(convarDecoded, "convar");
    if (!convarParsed) return null;

    cachePayload(convarParsed.raw, convarEncoded, convarParsed.values);
    log("convar bootstrap source=convar encoded_len=" + convarEncoded.length);
    return {
      raw: convarParsed.raw,
      encoded: convarEncoded,
      values: cloneValues(convarParsed.values),
      source: "convar"
    };
  }
  ```

  Key points:
  - `GameInterfaceAPI` availability is checked at runtime (same pattern as the rest of the file's guards)
  - Token regex is hardcoded to `hp_colors` namespace — this file is already hp_colors-specific (`STORAGE_NAMESPACE = "hp_colors"`)
  - `cachePayload` call ensures subsequent calls within the same session hit the cache branch (no repeated convar reads)

- [ ] **Step 3: Build and deploy**

  ```powershell
  powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
  ```

- [ ] **Step 4: Verify full round-trip**

  1. Change a setting in Anita-UI (e.g. set low threshold to 30)
  2. Wait 2 seconds — confirm `convar write ns=hp_colors` appears in console
  3. Run `deadlock_hero_debuts_seen` in console — confirm token is present
  4. **Quit Deadlock completely** (clean exit so `cfg/user/game.cfg` is saved)
  5. Relaunch Deadlock
  6. Open the console — look for:
     ```
     [Anita-UI][Bridge] HP Colors | convar bootstrap source=convar encoded_len=...
     [Anita-UI][Bridge] HP Colors | bootstrap replay count=9 source=...
     ```
  7. Open the Anita-UI panel — confirm low threshold shows 30 (not the default 25)

  **If bootstrap replay count=0 or settings are default:** The convar was written but not read back. Check the log for:
  - `convar token not found` — write happened but regex did not match (most likely: convar value was overwritten or token format mismatch)
  - `convar read threw` — `GameInterfaceAPI.GetSettingString` is unavailable in the escape-menu context

- [ ] **Step 5: Commit**

  ```bash
  git add hp_colors/panorama/scripts/anita_persist_loader.js
  git commit -m "fix(hp_colors): add convar fallback read in anita_persist_loader for cross-restart bootstrap"
  ```

---

## Task 3: Verify footer UI (Save / Copy / Paste)

**File:** `hp_colors/panorama/scripts/anita_ui_core.js`

The footer Save/Copy/Paste buttons are already implemented in `anita_ui_core.js` (around lines 1151–1218). This task confirms they work correctly end-to-end now that the persistence plumbing is in place.

- [ ] **Step 1: Confirm Save button writes immediately**

  In-game, open the Anita-UI HP Colors panel. Click **Save**. Within 0.5s (no debounce) the console should show:
  ```
  [Anita-UI][Persist] HP Colors | convar write ns=hp_colors encoded_len=...
  ```
  The button label should briefly flash "Saved!".

- [ ] **Step 2: Confirm Copy button produces a valid token**

  Click **Copy**. The button label should flash "Copied!". In a text editor, paste — you should get a string like:
  ```
  [ANITA-v1-hp_colors]:eyJ2ZXJzaW9uIjo...
  ```
  If clipboard is unavailable in this build, an inline tooltip should show the raw token for manual copy.

- [ ] **Step 3: Confirm Paste button restores settings**

  1. Change a setting (e.g. set low threshold to 40)
  2. Click **Save** to persist it
  3. Change the same setting back to default (25)
  4. Click **Paste** — the paste row appears
  5. Paste the previously copied token into the text field
  6. Click **Apply** — the setting should restore to 40 and the paste row should close

- [ ] **Step 4: Commit (no code changes expected)**

  If the footer buttons already work without modification, no commit is needed. If any fix was required, commit it:

  ```bash
  git add hp_colors/panorama/scripts/anita_ui_core.js
  git commit -m "fix(hp_colors): fix footer Save/Copy/Paste button behavior"
  ```

---

## Task 4: Update CLAUDE.md

**File:** `hp_colors/CLAUDE.md`

- [ ] **Step 1: Update the Persistence status section**

  Find the `## Persistence status` section and replace it to reflect the working state:

  ```markdown
  ## Persistence status

  Cross-restart persistence uses two coordinated layers:

  1. **Auto-save write** (`anita_ui_core.js`)
     - `handleUpdateEvent` debounces 2s then calls `persistConfig`
     - `persistConfig` embeds `[ANITA-v1-hp_colors]:<base64url>` into `deadlock_hero_debuts_seen` via `GameInterfaceAPI.ConsoleCommand`
     - Save button in the footer triggers an immediate force-write

  2. **Bootstrap read** (`anita_persist_loader.js`, escape-menu context)
     - On startup, tries `$.persistentStorage` first (unavailable on current client)
     - Falls back to reading `deadlock_hero_debuts_seen` via `GameInterfaceAPI.GetSettingString`
     - Decodes token, replays values via `ANITA_UPDATE` events

  3. **Session mirror** (both scripts)
     - Root HUD attribute `anita_v1_hp_colors` keeps settings alive across same-session panel reloads

  4. **Manual backup** (footer UI)
     - Copy/Paste token buttons let users export and restore settings manually

  ## Known limitations

  - Requires a clean game exit for `deadlock_hero_debuts_seen` to be flushed to `cfg/user/game.cfg`
  - `GameInterfaceAPI` availability in escape-menu context is not independently verified — if `storage available=0` and `convar token not found` both appear on restart, the convar read API may be unavailable in that context
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add hp_colors/CLAUDE.md
  git commit -m "docs(hp_colors): update CLAUDE.md to reflect working convar persistence"
  ```

---

## Verification Checklist

After all tasks complete, confirm all success criteria from the spec:

- [ ] After changing a setting and restarting the game, the setting is restored automatically
- [ ] Console shows `convar write ns=hp_colors` after a setting change (within 2s)
- [ ] Console shows `bootstrap replay count=9` on next launch
- [ ] `deadlock_hero_debuts_seen` contains `[ANITA-v1-hp_colors]:...` after a setting change
- [ ] Save button force-writes immediately and shows "Saved!" feedback
- [ ] Copy button produces a valid token string
- [ ] Paste button successfully restores settings from a pasted token
