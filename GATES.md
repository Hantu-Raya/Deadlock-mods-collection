# Gates: Rewrite V2 public release audit

Scope: Audit the Rewrite V2 and QOLLOCK release lane, remove verified debug and dead code, simplify safe complexity, document the stacking rule, and keep the web-builder XML mirrors current.

- [x] G0: this ledger states checks that can fail
  CHECK: node C:/Users/Administrator/.agents/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8

- [x] G1: canonical and QOLLOCK runtime contracts pass
  CHECK: node --test --test-reporter=tap scripts/validate-hp-colors-rewrite-v2-baseline.test.js scripts/validate-hp-colors-rewrite-v2-editor.test.js scripts/validate-hp-colors-rewrite-v2-parity.test.js scripts/validate-hp-colors-rewrite-v2-state.test.js scripts/validate-hp-colors-rewrite-v2-qollock.test.js
  EXPECT: # fail 0
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=43370d2cb927c0cc4e34f176950b424f59cc485ed84557da4e850dd38d4206e0; output-bytes=25818

- [x] G2: QOLLOCK release package builds without deployment
  CHECK: powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2_qollock.ps1 -SkipDeploy
  EXPECT: HP Colors Rewrite v2 QOLLOCK build complete
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=a4ecc425a0ce86f657c0db65913524578c74ea9c79668dd0035d538cea60480b; output-bytes=29414

- [x] G3: canonical Rewrite V2 web-builder XML matches exactly
  CHECK: cmd /d /c "fc /b hp_colors_rewrite_v2\panorama\layout\hud_escape_menu.xml D:\web\hp-colors-preset-builder\public\templates\hpv2_hp_colors_rewrite\panorama\layout\hud_escape_menu.xml >nul && echo XML_SYNC_OK"
  EXPECT: XML_SYNC_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=e43184d16f6f5940f3c4dbe43ccc55e8a85a435d07b11ac891d267d5ee9a0ab6; output-bytes=13

- [x] G4: QOLLOCK Rewrite V2 web-builder XML matches exactly
  CHECK: cmd /d /c "fc /b hp_colors_rewrite_v2_qollock\panorama\layout\hud_escape_menu.xml D:\web\hp-colors-preset-builder\public\templates\hpv2_hp_colors_rewrite_qollock\panorama\layout\hud_escape_menu.xml >nul && echo XML_SYNC_OK"
  EXPECT: XML_SYNC_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=e43184d16f6f5940f3c4dbe43ccc55e8a85a435d07b11ac891d267d5ee9a0ab6; output-bytes=13

- [x] G5: web builder tests pass
  CHECK: npm --prefix D:\web\hp-colors-preset-builder test
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=c1cec488a41673914d6615b712b012edb874b0cba92f583f886bfdebd7ce0dd0; output-bytes=29309

- [x] G6: web builder production build succeeds
  CHECK: npm --prefix D:\web\hp-colors-preset-builder run build
  EXPECT: Complete!
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=7dc4b94a56a34ae6fbfd1c085f9c31a20af417e266417075feace9c16427d6c3; output-bytes=832
