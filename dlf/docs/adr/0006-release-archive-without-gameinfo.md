# Do not ship `gameinfo.gi` in the release archive

Decided 2026-10-20 (the user).

The release 7z holds `game/citadel/addons/pak01_dir.vpk` and the three loose fonts, with no `gameinfo.gi`. The observer PC's `citadel/gameinfo.gi` must already mount `citadel/addons` (`Game citadel/addons` before `Game citadel`); `dlf/gameinfo/gameinfo.gi` stays in the repo as the validated reference for that mount, and `-Deploy` never copies it. The reason is not recorded in the docs.

Cost: a PC without the mount loads no addon paks, so DLF does nothing there until the user edits the file once. The build checks the archive holds exactly the expected entries. See [AGENTS.md](../../AGENTS.md#commands).
