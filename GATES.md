# Gates: HP Colors v2 readout and dead-code cleanup

OWNS: GATES.md, hp_colors_rewrite_v2/**, scripts/validate-hp-colors-rewrite-v2-baseline.test.js

Scope: Move every segment another 25% left using the existing margin-direction rule, move each HP counter by the matching endpoint distance, add segment-1 margin interpolation across 0–8 pips like segment 2 across 8–16 pips, retain stamina at `110px` by `44.8px`, and build and replace the deployed eight-asset VPK without screenshots.

- [x] G0: gate ledger syntax is valid
  CHECK: node C:/Users/Administrator/.agents/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=9825df100e4c6041e7c2c8cf6a0633a9d26dfcc234d1348e91fa47e09e654561; output-bytes=396

- [x] G1: validator proves both interpolation ranges
  CHECK: node --test scripts/validate-hp-colors-rewrite-v2-baseline.test.js && echo HPV2_GEOMETRY_OK
  EXPECT: HPV2_GEOMETRY_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=86b3625ecd395ca47fd2bf88fca4efa2de875ee8abbd3d899348fbebf96ac157; output-bytes=1355

- [x] G2: authored v2 source contains no proven dead code
  EVIDENCE: Fallow 2.98.0 reported only four unused-file false positives because Panorama loads every production script from XML rather than imports. Layout inspection confirmed all four entry points. A declaration/reference audit found one real candidate, `readPanelId`; LSP reported only its declaration, so it was removed. Re-running the audit found no remaining single-use named functions or variables.
- [x] G3: production build deploys exactly eight assets
  CHECK: powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1 && echo HPV2_DEPLOY_OK
  EXPECT: HPV2_DEPLOY_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=463032ff8bf290403b213389c62e613bdca7859801f3346ec9f2c75f40e20674; output-bytes=2394

- [x] G4: root and deployed VPK hashes match
  EVIDENCE: Both files are SHA-256 `DEA3CEEBDF76CB27B96B0A4F7414C414D55EFA2513F7D4EB84F1BAA1E2DF26AF`.

## Prior verification history

Earlier hashes and live-smoke evidence belong to earlier CSS builds. `HANDOFF.md` and `hp_colors_rewrite_v2/FEATURES.md` retain that history. They are not evidence for this task.
