# AGENTS: sr2compiler

## OVERVIEW
`Src2QuickCompiler` (shipped as `New folder.exe`) is a custom C# wrapper around the Valve Source 2 `resourcecompiler.exe`. It addresses the lack of a standalone compiler for Deadlock by leveraging the Dota 2 Workshop Tools environment to process Panorama UI assets (XML, JS, CSS).

## USAGE
The tool is primarily invoked via CLI and requires a valid `pref.json` pointing to a Dota 2 installation.

### CLI Arguments
```powershell
.\sr2compiler\"New folder.exe" "<absolute_path_to_mod_folder>"
```

### Workflow
1. **Target**: Pass the folder containing raw `panorama/` assets.
2. **Execution**: The tool stages files, compiles them, and monitors for completion.
3. **Output**: Resulting compiled files (`.vxml_c`, `.vjs_c`, `.vcss_c`) are moved to a `<mod_folder>_compiled` directory adjacent to the source.

## ARCHITECTURE
The compiler operates by "hijacking" the Dota 2 content/game flow to bypass Deadlock's lack of public SDK tools.

1. **Staging**: Source files are copied from the mod directory to the Dota 2 `content/dota_addons/` workspace.
2. **Compilation**: `resourcecompiler.exe` is spawned with `-f -v -p` flags, targeting the staged files. It generates binary-ready chunks for the Source 2 engine.
3. **Regurgitation**: Once `resourcecompiler` finishes, the tool scrapes the `game/dota_addons/` output folder for the compiled binaries.
4. **Cleanup**: Staged files are removed from the Dota 2 installation to prevent workspace pollution.

## LIMITATIONS
### Console.ReadKey() Bug
The tool contains an unhandled exception when executed in environments where standard input is redirected (e.g., CI/CD pipelines, VS Code Task runner, or wrapper scripts).
- **Cause**: The code calls `Console.ReadKey()` at the end of execution to keep the window open.
- **Effect**: If `stdin` is not an interactive terminal, it throws `InvalidOperationException`.
- **Workaround**: Ensure the tool is run in an interactive shell or use a wrapper that handles the exception.

### Asset Scope
Currently strictly limited to Panorama UI assets. VData and SoundEvent compilation are handled by separate Python scripts or manual workflows.
