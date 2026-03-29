# PowerShell Build Patterns

Use these repo-native patterns when a mod already has a `.ps1` build script.

## Common sequence

1. Set `$ErrorActionPreference = 'Stop'`.
2. Define root, source, compiled, and live target paths.
3. Remove stale compiled output or old pack artifacts.
4. Run the compiler, packer, or transformer.
5. Verify the expected output exists.
6. Copy, move, or overwrite only the final artifact.

## `build_jungle_timer.ps1`

- Clean `jungle_timer_compiled` and the previous VPK output.
- Compile with `sr2compiler\New folder.exe`.
- Verify `panorama\scripts\jungle_timer.vjs_c` exists.
- Pack the compiled folder with `vpkeditcli.exe`.
- Copy the single-file VPK to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk`.

## `build_buff_timer_virgin_terser.ps1`

- Remove the previous compressed mod folder.
- Copy the source mod into a staging folder.
- Minify `panorama\scripts\rejuvnbufftimer.js` with `npx terser`.
- Verify the minified script exists and report its size.

## `passive_items_mod\Build-Templates.ps1`

- Generate a config JS file per loop iteration.
- Run `Compiler.exe` against the module folder.
- Move the produced `pak99_dir.vpk` into the templates directory.
- Keep the output artifacts separate from the source tree.

