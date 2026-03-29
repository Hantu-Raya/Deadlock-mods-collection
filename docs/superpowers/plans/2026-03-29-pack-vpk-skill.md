# pack-vpk Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `.claude/skills/pack-vpk/SKILL.md` that guides Claude through the full Deadlock mod build pipeline (clean → compile → pack → deploy) for any mod in this repo.

**Architecture:** Single skill file at `.claude/skills/pack-vpk/SKILL.md`. When invoked, the skill instructs Claude to identify the target mod, prefer an existing `build_<mod>.ps1` if present, and fall back to an inline PowerShell sequence that mirrors what those scripts do.

**Tech Stack:** Markdown (SKILL.md), PowerShell (build commands), sr2compiler, vpkeditcli

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `.claude/skills/pack-vpk/SKILL.md` | The skill — trigger phrases, mod/VPK mapping table, 7-step workflow, inline PowerShell commands |

No other files are created or modified.

---

### Task 1: Create the skill directory and SKILL.md

**Files:**
- Create: `.claude/skills/pack-vpk/SKILL.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .claude/skills/pack-vpk
```

- [ ] **Step 2: Write SKILL.md**

Create `.claude/skills/pack-vpk/SKILL.md` with this exact content:

```markdown
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
```

- [ ] **Step 3: Verify the file exists**

```bash
ls .claude/skills/pack-vpk/SKILL.md
```

Expected: file listed, non-empty.

- [ ] **Step 4: Sanity-check the content**

Read `.claude/skills/pack-vpk/SKILL.md` and confirm:
- YAML front matter has `name: pack-vpk` and a `description` line
- Mapping table contains `pak96` and `jungle_timer` rows
- All 7 steps are present
- PowerShell code blocks are present for Steps 3–6

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/pack-vpk/SKILL.md
git commit -m "feat: add pack-vpk Claude Code skill"
```

Expected: 1 file changed, commit succeeds.

---

### Task 2: Verify skill registration

**Files:**
- Read: `.claude/skills/pack-vpk/SKILL.md`

- [ ] **Step 1: Confirm YAML front matter is valid**

Read `.claude/skills/pack-vpk/SKILL.md`. The file must start with:

```
---
name: pack-vpk
description: ...
---
```

If the front matter is missing or malformed, Claude Code will not load the skill.

- [ ] **Step 2: Confirm the mapping table is complete**

Grep for both known mod names:

```bash
grep -c "pak96\|jungle_timer" .claude/skills/pack-vpk/SKILL.md
```

Expected: output is `2` (both rows present).

- [ ] **Step 3: Confirm all 7 steps are present**

```bash
grep -c "^## Step" .claude/skills/pack-vpk/SKILL.md
```

Expected: `7`

- [ ] **Step 4: Confirm PowerShell blocks exist**

```bash
grep -c "Start-Process\|Copy-Item\|Remove-Item" .claude/skills/pack-vpk/SKILL.md
```

Expected: `3` or more (one per step 3, 4, 5, 6).

- [ ] **Step 5: Final commit check**

```bash
git log --oneline -1
```

Expected: commit message contains "pack-vpk".
