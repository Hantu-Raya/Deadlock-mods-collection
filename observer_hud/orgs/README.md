# Organisation variants

A private build of the Observer HUD for one tournament organiser: the same pak10, with that org's font, art,
CSS and editor defaults on top. The public release (`build_observer_hud.ps1` without `-Org`) never includes
any of it.

```powershell
py observer_hud/scripts/make-org-art.py <org>        # after the org's art source changes
powershell -ExecutionPolicy Bypass -File build_observer_hud.ps1 -Org <org> [-Install] [-GamePak <pak01_dir.vpk>]
# -> dist\observer_hud_<org>\ and dist\Observer_HUD_<org>_<version>_<yy.MM.dd>.7z
```

## How a variant is applied

The build validates and minifies the base HUD exactly as for a release (validator on the source, then on
the Closure output), then runs `scripts/apply-org.py <org> <stage>` and compiles the result:

| Part of `orgs/<org>/` | Effect |
|---|---|
| `org.json` `defaults` | Written into `oh_state.js` `DEFAULTS` and read back in a Node VM. Only `style` (`names`/`desk`) and `banCount` (2/3). They apply to a fresh setup, RESET and fields a save lacks; a saved setup keeps its own values. |
| `org.json` `captions` | Translates the game and first-to captions (Night Desk's top right corner and the Names plate): `game` replaces `GAME {n}`, `first` replaces `FIRST TO {n}`. `{n}` is the number; `"one\|many"` gives one form for 1 and one for the rest. Replaced in `oh_state.js` and read back in a Node VM. Other texts are not translatable yet. |
| `org.json` `font` | `family` goes first in every `font-family` of the listed stylesheets (base fonts stay as fallback). The file ships loose as `game\citadel\panorama\fonts\<installAs>`: Panorama loads no font from a VPK, and the stock `fonts.conf` loads only file names on its `<fontpattern>` list (dlf ADR 0003). `installAs` must be a listed name that no stock file and no other mod here uses (DLF: `vt323.ttf`, `quantico.otf`, `rajdhani.ttf`). |
| `org.json` `art` | Sources `make-org-art.py` turns into `panorama/images/observer_hud/<out>.png` + `.vtex` (visible-pixel crop, scaled, straight-alpha bleed). |
| `panorama/**` | Copied into the stage and packed. New files only: the build refuses to replace a base file. |
| `styles/<name>.css` | Appended to `panorama/styles/observer_hud/<name>.css`, so it wins ties with the base rules. |
| `source/` | The client's own files (fonts, PSDs). Git-ignored: their licences usually forbid passing them on. The README says where each came from. |

The archive holds `game\citadel\addons\pak10_dir.vpk` and, with a font, `game\citadel\panorama\fonts\<font>`;
it is extracted over the Deadlock folder. `-Install` also copies the font (an older different file is
backed up to `panorama\fonts_backup\`, outside the folder `fonts.conf` reads). Restart Deadlock after
either. A variant replaces the public pak10 on that PC; both use the same saved setup.

## Variants

| Org | Request | Status |
|---|---|---|
| [notlynx](notlynx/README.md) | Hikasami font, own centre logo, third ban | Built and live-checked 2026-11-10 |
