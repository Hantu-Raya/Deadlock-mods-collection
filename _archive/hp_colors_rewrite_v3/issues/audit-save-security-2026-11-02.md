# HP Colors v3 save-security audit (Claude + Claude Fable 5.1), 2026-11-02

## Verdict

Requested by the user after rumors that saving is "easily exploitable". Claude and Claude Fable 5.1 audited the save path independently, then Fable red-teamed the patch. One real high-severity issue: any page or link opened in **Steam's own browser or overlay** could **delete or replace** the save. The save could never be **read** cross-site, and nothing leads to code execution. All PoCs ran offline against copies of the page and scripts; nothing touched the real Steam profile, the game or GitHub.

Evidence: `.scratch/save_sec/` (`brief.md`, `plan.md`, `Claude/`, `Fable/findings.md` with round 2, PoCs).

## Findings and fixes

| ID | Sev | Finding | Fix |
|---|---|---|---|
| F1 | P1 | The hosted page (`D:/hpv2-store/index.html`) ran any request in its URL fragment. Steam's CEF profile (`%LOCALAPPDATA%/Steam/htmlcache/Default/Local Storage`) holds the save next to youtube.com, x.com, google.com and other sites, so a link could navigate the page: keyed `d` deleted the save and backup, a `w` without `m` replaced it (the record checksum is public FNV-1a), `.prev` could be written directly, and with the game open a planted record merged in after a conflict reload. | Page guard: every hpcolors key except v2's refuses `d` (`readonly`), direct `.prev` writes (`readonly_backup`) and writes without `m` (`needs_cas`). Another site cannot read the save, so it cannot supply the `m` of an existing save. |
| F1b | P3 | (Fable round 2) Any refused or malformed request reset the page's single in-progress write, aborting the game's multi-chunk save. | A failed request clears only its own logical read or write. |
| F2 | P2 | A hacked `latest.json` could point the update DOWNLOAD at any GameBanana page (another mod). | Client: DOWNLOAD only opens `https://gamebanana.com/mods/download/603113(#FileInfo_<n>)` (menu and bridge). |
| F3 | P3 | Pasted bundle codes kept 20,000-character or blank preset names and arbitrary preset and bundle fields, which lived on in the save and in the victim's own exports. Round 2 found the first fix still let junk through `hidden` and the bundle fields REPLACE ALL takes. | Client: pasted HPC3 bundle codes keep only fields the build reads, names 1-48 characters (trimmed), boolean `hidden`, the baked default's hidden state and name (checked shapes) and `nextUserPresetNumber`; own saves are read as-is. |
| F4 | P2 | Suspected only: the whole `hantu-raya.github.io` origin is one trust boundary (preset builder, other mods' pages). No XSS sink found. | Not a code fix: keep 2FA on the GitHub account. |

Checked and not exploitable: reading the save cross-site (replies only reach the page's own title), prototype pollution, CSS/URL/console-command injection from values (validated or allow-listed; the colorblind list only names the three simulation convars), HTML injection (no `html="true"` labels), spoofed bridge replies, parser/CPU blowups (caps keep decoding in milliseconds), key tricks against the guard (`v03`, case, zero-width suffix), staging reuse and lost-ack replay.

## Compatibility

- The v3 bridge only sends `r`, `w` (always to `hantu.hpcolors.v3/state`, always with `m` set during load) and `lv`; it never deletes or writes `.prev`. Page CAS landed 2026-10-15 (`94cc689`) before 3.0.0 (2026-10-17). Only the 3.3.0+ client source is in git, so 3.0-3.2 paks were not byte-verified.
- v2 clients keep keyless Forget and unconditional writes on the v2 keys.
- F3: v2-migration fields (`v2pending`, `v2scopes`, `v2conditions`) are kept so a migrated library can still be restored; at the current record version their contents are not validated (bounded by the 32,768-character code cap).

## Residual

- A brand-new install with no v3 save accepts a first write with `m: "none"`, so a page could seed settings before the game saves once (and a planted v2 record is migrated when both v3 keys are absent). No user data is at risk; the game's first save locks it out.
- v2 keys stay unguarded (v2 clients cannot send anything new).
- A malicious page that stays open and keeps sending well-formed write chunks can still delay multi-chunk saves (no data loss; saving resumes once it is closed).
- Closing the fresh-install gap needs a page-minted capability token returned only in `hello` (a client release plus a grace period for 3.5.0 clients). Not built.

## Status

- Client fixes (F2, F3) ship in the 3.6.0 pak.
- The page guard (F1, F1b) is committed nowhere yet: it is a working-tree change in `D:/hpv2-store/index.html`, vendored as `vendor/hpv2-store.js` with the pin at `published: false` (`publishedSha256` = the served page). **It protects nobody until the user approves the push.** After pushing: confirm the served bytes, then re-pin `published: true` and drop `publishedSha256`/`publishedCapabilities`.

- Tracked privately as draft GitHub Security Advisory [GHSA-qx4g-5539-3v8h](https://github.com/Hantu-Raya/hpv2-store/security/advisories/GHSA-qx4g-5539-3v8h) on hpv2-store (all six items; visible to repo admins only). User decision 2026-11-02: test the mod in game first, push the page and publish the advisory later.

## Tests (each red before its fix)

- `store-page.test.js`: "guard: a crafted link cannot delete…", "…cannot replace an existing v3 save", "…backup cannot be written directly…", "a refused foreign request does not abort…"; "the v3 build keeps saving…" guards compatibility. Six older page tests that encoded unconditional v3 writes and v3 deletes now use `m` or v2 keys.
- `update-notice.test.js`: "the menu refuses an off-site link…" (other mods and paths).
- `codec.test.js`: "pasted bundle codes keep only real preset fields…", "…keep only real bundle metadata…"; the unicode and record-v1 tests now expect the unread `routing` field dropped from pasted codes and kept in saves.
- `audit-storage.test.js`: size refusal now bulks the code with 100 presets (48-character names); page-test count 20 → 25.
