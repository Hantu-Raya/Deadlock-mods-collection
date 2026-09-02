# Gates: Rewrite V2 release cleanup

OWNS: hp_colors_rewrite_v2/**, hp_colors_rewrite_v2_qollock/**, scripts/validate-hp-colors-rewrite-v2-*.test.js

Scope: Prepare Rewrite V2 and its QOLLOCK package for release. Remove temporary geometry diagnostics, preserve measured left-edge alignment across live width changes, and keep package contracts unchanged.

- [x] G0: this ledger states checks that can fail
  CHECK: node C:/Users/Administrator/.agents/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=e80020e47be8/35 entries; EXPECT=matched; output-sha256=45f2f0b23659d603aebd358a717e9093af5a69c8ff812ab8199510941e171ecc; output-bytes=150

- [x] G1: all in-repository Rewrite V2 and QOLLOCK validators pass
  CHECK: node --test --test-reporter=tap scripts/validate-hp-colors-rewrite-v2-baseline.test.js scripts/validate-hp-colors-rewrite-v2-editor.test.js scripts/validate-hp-colors-rewrite-v2-parity.test.js scripts/validate-hp-colors-rewrite-v2-state.test.js && node --test --test-reporter=tap --test-name-pattern="refresh injects|checked-in layouts|support folder|opening either settings panel|pak02 contract" scripts/validate-hp-colors-rewrite-v2-qollock.test.js
  EXPECT: # fail 0
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=e80020e47be8/35 entries; EXPECT=matched; output-sha256=819fea35075b375414ba6254bc30c707401757e5980b3c67a8418a55ac776d9b; output-bytes=24972

- [x] G2: Rewrite V2 release package builds without deployment
  CHECK: powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1 -SkipDeploy
  EXPECT: HP Colors Rewrite v2 build complete.
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=e80020e47be8/35 entries; EXPECT=matched; output-sha256=fdbace5887bcace0cc2100259f9735ae9f9db3beab17370c71b933b43b0ca7ec; output-bytes=36884

- [x] G3: QOLLOCK compatibility release package builds without deployment
  CHECK: powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2_qollock.ps1 -SkipDeploy
  EXPECT: HP Colors Rewrite v2 QOLLOCK build complete
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=e80020e47be8/35 entries; EXPECT=matched; output-sha256=d5439acd4a2e4b566a95f5589610daac41c65b8599b7569557b750a8286d825c; output-bytes=29095

- [x] G4: every removed debug or unused symbol has direct reference evidence
  EVIDENCE: hp_colors_v2_menu.js removals were unreachable or side-effect-free at every local callsite; the temporary center logger, panel formatter, recursive ID collector, counters, and state fields had no production consumer and were removed together; QOLLOCK debug-named panels belong to pinned upstream pak03 and remain unchanged.
