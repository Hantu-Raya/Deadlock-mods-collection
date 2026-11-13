# Ship fonts as loose files under listed names

Decided 2026-10-16 after a live test.

Panorama does not load fonts from addon VPKs, and the stock `fonts.conf` loads only files named on its `<fontpattern>` list. A packed font and a loose `gofire.otf` were both ignored; a loose `quantico.otf` rendered GOFIRE. So `build_dlf.ps1` copies each font to `game/citadel/panorama/fonts/` under a name the pattern lists and no stock font uses (Modesto Lite Expanded as `vt323.ttf`, GOFIRE as `quantico.otf`, Operation Napalm as `rajdhani.ttf`), and Pango picks the face by the family name inside the file.

Consequences: the fonts live in the release 7z and in `-Deploy`, not in pak01; the banner falls back to GOFIRE (then Jost) when a file is missing; a stock update that starts using one of those names would change what draws. Modesto Lite Expanded is an Adobe Typekit font, so its licence needs checking before the archive is published, and GOFIRE is free for personal use only. See [SPEC.md](../../SPEC.md#banner) and [ENGINE.md](../../ENGINE.md#fonts-and-images).
