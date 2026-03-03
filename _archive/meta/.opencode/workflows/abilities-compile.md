---
description: Process abilities files by removing _include block, running bat scripts, and copying back
---

# Abilities Compile Workflow

This workflow removes the `_include` block (lines 4-59) from abilities files, processes them with external bat scripts, and copies the results back.

## Prerequisites

- Ensure `F:\Users\Shiv\Desktop\New folder (2)\passive.bat` exists
- Ensure `F:\Users\Shiv\Desktop\New folder (2)\active.bat` exists

## Steps

### 1. Delete the `_include` block from abilities.vdata

Remove lines 4-59 from `abilities\scripts\abilities.vdata` (the `_include = [...]` array block).

### 2. Copy files to New folder (2)

// turbo

```powershell
Copy-Item "f:\Users\Shiv\Desktop\Deadlock-mods-collection\abilities\scripts\abilities.vdata" -Destination "F:\Users\Shiv\Desktop\New folder (2)\" -Force
```

// turbo

```powershell
Copy-Item "f:\Users\Shiv\Desktop\Deadlock-mods-collection\hud\abilities2.vdata" -Destination "F:\Users\Shiv\Desktop\New folder (2)\" -Force
```

### 3. Run passive.bat

```powershell
& "F:\Users\Shiv\Desktop\New folder (2)\passive.bat"
```

### 4. Run active.bat

```powershell
& "F:\Users\Shiv\Desktop\New folder (2)\active.bat"
```

### 5. Copy processed files back to abilities\scripts

// turbo

```powershell
Copy-Item "F:\Users\Shiv\Desktop\New folder (2)\abilities.vdata" -Destination "f:\Users\Shiv\Desktop\Deadlock-mods-collection\abilities\scripts\" -Force
```

// turbo

```powershell
Copy-Item "F:\Users\Shiv\Desktop\New folder (2)\abilities2.vdata" -Destination "f:\Users\Shiv\Desktop\Deadlock-mods-collection\abilities\scripts\" -Force
```

## Notes

- The `_include` block being removed contains resource references to hero abilities (astro, atlas, bebop, etc.) and upgrades
- After this workflow, the abilities files will be processed by the external bat scripts
- The `// turbo` annotation means those copy commands will auto-run without confirmation
