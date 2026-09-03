# Gates: Rewrite V2 automatic indicator centering

OWNS: hp_colors_rewrite_v2/**, hp_colors_rewrite_v2_qollock/**, scripts/validate-hp-colors-rewrite-v2-*.test.js, GATES.md, HANDOFF.md

Scope: Derive the healthbar scale origin from live layout geometry so anchored indicators remain centered across max-HP layouts and height scales, preserve unanchored positioning, and deploy QOLLOCK.

- [x] G0: this ledger states checks that can fail
  CHECK: node C:/Users/Administrator/.agents/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8

- [x] G1: focused tests prove dynamic visible-center scaling and indicator alignment
  CHECK: node --test --test-reporter=tap --test-name-pattern="visible bar center|complete segment surface|indicator geometry|layout reset" scripts/validate-hp-colors-rewrite-v2-baseline.test.js scripts/validate-hp-colors-rewrite-v2-editor.test.js scripts/validate-hp-colors-rewrite-v2-state.test.js
  EXPECT: # fail 0
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=ae530223262ea594cbeb36ed8a5f8d7347fdab8b9d69176f38505ee402622b99; output-bytes=2039

- [x] G2: all canonical Rewrite V2 validators pass
  CHECK: node --test --test-reporter=tap scripts/validate-hp-colors-rewrite-v2-baseline.test.js scripts/validate-hp-colors-rewrite-v2-editor.test.js scripts/validate-hp-colors-rewrite-v2-parity.test.js scripts/validate-hp-colors-rewrite-v2-state.test.js
  EXPECT: # fail 0
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=f46f39141dbf429f4dea32410163224560b4589016004fd1df44de2f0276887b; output-bytes=24826

- [x] G3: QOLLOCK package builds and deploys automatic centering
  CHECK: powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2_qollock.ps1
  EXPECT: Deployed OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=4cb4710e181411e442d6a3bce622047b2bb97ba7bb495289bed8c25ac9c8a6e1; output-bytes=29763

- [x] G4: final debug run prints stable geometry and reset values
  CHECK: node --test --test-reporter=spec --test-name-pattern="indicator geometry debug|layout reset debug" scripts/validate-hp-colors-rewrite-v2-baseline.test.js scripts/validate-hp-colors-rewrite-v2-state.test.js
  EXPECT: ult=-619.75px,-510.25px
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection; path=22f74fea6fc7/30 entries; EXPECT=matched; output-sha256=58000b3b40f58b3138b68cb7edd61d67671bb5e246bc761b9c51583ccf8f6aae; output-bytes=440
