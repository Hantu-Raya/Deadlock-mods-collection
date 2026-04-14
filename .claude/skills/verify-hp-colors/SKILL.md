---
name: verify-hp-colors
description: Verify hp_colors source integrity after edits — check JS syntax, alias map consistency, and storageVersion alignment across all four files. Use when the user says "verify hp_colors" or after editing hp_colors source files.
---

# Verify hp_colors

Run a fast local verification pass on `hp_colors/` source files after edits.

---

## Step 1 — JavaScript syntax check

Run `node --check` on each JS file:

```powershell
node --check "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\healthbar_logic.js"
node --check "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\hp_registrar.js"
node --check "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\anita_ui_core.js"
node --check "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\anita_persist_loader.js"
```

Any non-zero exit = hard stop. Report the file and error.

---

## Step 2 — Alias map consistency

The compact alias maps in three files must contain exactly the same key→alias pairs.
Extract the alias objects and compare:

```powershell
$files = @(
  "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\anita_ui_core.js",
  "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\anita_persist_loader.js",
  "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\healthbar_logic.js"
)
```

For each file, grep for alias entries (pattern: `hp_\w+:\s*"[a-z]+"`) and compare the sets.
Mismatch = hard stop. Report which keys differ and in which file.

---

## Step 3 — storageVersion alignment

Check that all files reference the same `storageVersion`:

```powershell
Select-String -Path "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors\panorama\scripts\hp_registrar.js" -Pattern "storageVersion" | Select-Object -First 1
```

The value should match what AGENTS.md and CLAUDE.md document (currently `10`).
If mismatched, report expected vs actual.

---

## Step 4 — DEFAULTS keys match hp_registrar schema

Ensure every key in `DEFAULTS` (in `healthbar_logic.js`) has a corresponding schema entry in `hp_registrar.js` and vice versa.
Missing key in either = hard stop.

---

## Step 5 — No debug artifacts in terser output

After build, verify zero occurrences of debug patterns in `hp_colors_terser/`:

```powershell
Select-String -Path "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors_terser\panorama\scripts\*.js" -Pattern "_L\(" | Measure-Object | Select-Object -ExpandProperty Count
Select-String -Path "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors_terser\panorama\scripts\*.js" -Pattern "\$.Msg" | Measure-Object | Select-Object -ExpandProperty Count
Select-String -Path "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\hp_colors_terser\panorama\scripts\*.js" -Pattern 'style\.washColor\s*=\s*""' | Measure-Object | Select-Object -ExpandProperty Count
```

All three counts must be `0`. Non-zero = report the offending file/line.

---

## Step 6 — Report

Summarize:
- Pass/fail for each step
- Total issues found (must be 0 for green)
- If green: "Verification passed. Safe to build."
- If red: list each failure with file and line.