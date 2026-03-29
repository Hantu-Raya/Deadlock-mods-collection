---
name: pack-vpk
description: Build and deploy a Deadlock mod VPK — clean, compile with sr2compiler, pack with vpkeditcli, and copy to the game addons folder. Use when the user says "pack the vpk", "build and deploy", "repack", or asks to compile a mod and put it in the game.
---

# Pack VPK

Pack and deploy a Deadlock mod through the full build pipeline:
**clean → compile → pack → deploy**.

---

## Key Constants

| Item | Value |
|------|-------|
| Repo root | `F:\Users\Shiv\Desktop\Deadlock-mods-collection` |
| Compiler | `<root>\sr2compiler\New folder.exe` |
| Compiler output | `<root>\<mod>_compiled\` (compiler always writes here) |
| VPK tool | `<root>\passive_items_mod\compiler\vpkeditcli.exe` |
| VPK staging | `<root>\<vpk_name>` |
| Addons dir | `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\` |

All inline commands run in **PowerShell**.

---

## Known Mod → VPK Mapping

| Mod folder | VPK filename |
|------------|-------------|
| `pak96` | `pak96_dir.vpk` |
| `jungle_timer` | `pak98_dir.vpk` |

For unlisted mods: read `build_<mod>.ps1` → `$vpkOut`. If no PS1 exists, ask the user which pak number to use.

---

## Step 1 — Identify mod and resolve VPK name

1a. Identify the mod folder from the user message, session context, or by asking.

1b. Resolve `<vpk_name>`:
- In mapping table → use listed filename.
- Not in table → find `build_<mod>.ps1` and read its `$vpkOut`.
- No PS1 → ask: "Which pak number should I use? (e.g. pak97)"

---

## Step 2 — Check for an existing build script

Look for `build_<mod>.ps1` in the repo root.

**If found** — PS1 scripts are self-contained (clean + compile + pack + deploy). Run:

```
powershell -ExecutionPolicy Bypass -File "<root>\build_<mod>.ps1"
```

- Non-zero exit = hard stop. Report error output.
- Success → skip to **Step 7**.

**If not found** → continue to Step 3.

---

## Step 3 — Clean

```powershell
if (Test-Path "<root>\<mod>_compiled") { Remove-Item -Recurse -Force "<root>\<mod>_compiled" }
if (Test-Path "<root>\<vpk_name>")     { Remove-Item -Force "<root>\<vpk_name>" }
```

---

## Step 4 — Compile

```powershell
$proc = Start-Process -FilePath "<root>\sr2compiler\New folder.exe" `
    -ArgumentList '"<root>\<mod>"' -PassThru -Wait
if ($proc.ExitCode -ne 0) { Write-Error "Compiler failed (exit $($proc.ExitCode))"; exit 1 }
```

Non-zero exit = hard stop. Do not pack.

---

## Step 5 — Pack

```powershell
$pack = Start-Process -FilePath "<root>\passive_items_mod\compiler\vpkeditcli.exe" `
    -ArgumentList "`"<root>\<mod>_compiled`" -o `"<root>\<vpk_name>`" -s --no-progress" `
    -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) { Write-Error "Pack failed (exit $($pack.ExitCode))"; exit 1 }
```

`-s` = single-file VPK (prevents `_001` fragmentation). Non-zero exit = hard stop.

---

## Step 6 — Deploy

```powershell
Copy-Item -Path "<root>\<vpk_name>" `
    -Destination "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\<vpk_name>" `
    -Force
```

---

## Step 7 — Verify and report

Confirm the VPK exists at the addons destination and report its size in KB.

- **Success:** "Deployed `<vpk_name>` → addons (`<size> KB`). Launch Deadlock to test."
- **Failure:** name the failing step and include the error output.
