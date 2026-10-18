# Profile charts and stats bridge bandwidth plan

This plan cuts deadlock-api.com requests, bytes and runtime work for the ShowRank barebones profile surfaces and the `deadlock-stats-bridge` pages, without changing what players see.
The rule it enforces is that every kept change carries a measured trunk baseline and an equivalence pin.
Rank History is the largest single payload a player triggers, about 108 KB to 197 KB of match history plus about 238 KB of tier icons, and it is the main target.
PR ids in order are P1, P2, P3, P4, P5 and P6.
Runtime spikes for native badges, the stats selection monitor and early-match scheduling wait for a live game session the operator authorizes.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`, adapted to this workspace. The bridge repo lands by pushing to `origin main`, which deploys GitHub Pages. The mod repo lands as local commits and ships through `build_showrank_barebones.ps1 -Install`. The operator approves every landing. P2 stops at review-ready for the operator's visual check.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Record the operator's decision on the deprecated `/v1/players/{id}/mmr-history` endpoint in the decision trail. The default is to use it with the bounded fallback in P2.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:src/rank-history.js` in `deadlock-stats-bridge`.
  - [ ] `git show origin/main:src/playstyle.js` in `deadlock-stats-bridge`.
  - [ ] `git show origin/main:src/cache.js` in `deadlock-stats-bridge`.
  - [ ] `git show HEAD:showrank_barebones/AGENTS.md` in the mod repo.
  - [ ] The pstack `playbooks/autopilot-stack.md`, `playbooks/refactoring.md`, `playbooks/perf-issue.md` and `skills/swarm/SKILL.md` from `cursor/plugins` main.
  - [ ] The repo skills `optimize-measured` and `refactor-pinned`.
- [ ] Arm the audit tick as `/loop 1h` where the harness supports it. In this harness the owner runs the tick at every phase boundary instead.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph.
  - [ ] P1, P2 and P3 are independent and first. All three branch from bridge `main`.
  - [ ] P4 after P1, because both touch the player cache key in `src/cache.js`.
  - [ ] P5 after P2 and P3, because it extracts code both of them change.
  - [ ] P6 is independent of the bridge PRs and touches only the mod repo.
- [ ] Hold the file boundaries.
  - [ ] P1 touches only `src/app.js`, `src/bridge.js`, `src/cache.js` and their tests.
  - [ ] P2 touches only `src/rank-history.js`, `rank-history.html`, `assets/ranks/`, `tools/make-rank-thumbnails.mjs` and `test/rank-history.test.js`.
  - [ ] P3 touches only `src/playstyle.js`, `src/page-cache.js` and `test/playstyle.test.js`.
  - [ ] P4 touches only `src/api.js`, `src/metrics.js` and new parity fixtures under `test/fixtures/`.
  - [ ] P5 touches only `src/*.js` imports, `*.html` and a new `src/page-status.js`.
  - [ ] P6 touches only `showrank_barebones/panorama/scripts/showrank_barebones.js` and `showrank_barebones/tests/`.
- [ ] Hold the review gate. P2 changes visible chart icons. It waits for the operator's review in chat with screenshots and a video before landing.

### PR mechanics, for every PR

- [ ] Resolve the forge once. There is no pull request forge in this workspace. Each PR id is one ordered commit series, recorded in the decision trail with its SHA.
- [ ] Run `node --test` in `deadlock-stats-bridge` and `npm --prefix showrank_barebones run validate` once before each landing.
- [ ] Run `/deslop` before each commit and `/no-comments` before review, or the repo's `unslop` skill where those are not installed.
- [ ] Triage every review comment from the `reviewer` agent before landing.
- [ ] Rebase onto current trunk before the code-ready report. Rebase again only at landing or on a conflict.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. One gates lane runs the unit commands. The ten live lanes come from the PR's **Verify, live** block. The perf lane comes from its **Verify, perf** block. Two audit lanes read the diff and the receipts and distrust the commit message. The root audits the receipts before the verdict.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh verdict.
- [ ] The root lands the series only after a clean verdict at the exact head SHA and the operator's go. A bridge landing is a push to `origin main` followed by a deployed-page check.

### Boot recipe, for every live lane

Each live lane runs on this Windows workstation at the PR head. Browser lanes drive headless Chromium through the eval `browser` helper, the local stand-in for `control-ui`. In-game lanes run only on the operator's explicit go in the current turn, following the `deadlock-launch-vconsole` skill.

- [ ] `git fetch origin main && git checkout <head SHA>` in `deadlock-stats-bridge`.
- [ ] Serve the bridge with `npx --yes http-server -p 8765 -c-1 --silent .` and wait for port 8765.
- [ ] Open pages only through `browser.open` and read results only through the page title, `document.body` and the request log from `tab.requests()`.
- [ ] Save every screenshot to `.scratch/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Keep every cached player prefix across surfaces (P1)

**Depends on.** None.

**Files.**

- [ ] Edit `src/bridge.js`.
- [ ] Edit `src/app.js`.
- [ ] Edit `src/cache.js`.
- [ ] Edit `test/cache.test.js`.

**Build.**

- [ ] Make `aggregatePlayerPrefixes` callers in `src/bridge.js` and `src/app.js` store every supported prefix the response covers, so a 150-match bridge write never replaces a cached 200-match explorer entry with fewer prefixes.
- [ ] Make `writePlayerCache` in `src/cache.js` keep the entry with the larger `maxMatches` when both are fresh, and never merge samples of different ages.

**You see.**

- [ ] The request log shows one `/v1/matches/metadata` call for the sequence explorer 200, bridge 150, explorer 200 on one account.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/cache.test.js` gains the case explorer 200 then bridge 150 then explorer 200 makes one metadata fetch. Run `node --test test/cache.test.js`.
- [ ] `test/cache.test.js` gains the case a stale 200 entry and a fresh 150 entry never combine. Run `node --test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `openai-codex/gpt-6-astra` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run explorer 200, bridge 150, explorer 200 for account 487348881 at trunk and head. Save `p1-regression.png`. Pass when trunk logs two metadata calls and head logs one.
- [ ] Lane 2. Bridge 150 first, then explorer 200. Save `p1-bridge-first.png`. Pass when head makes exactly two metadata calls and both pages render.
- [ ] Lane 3. Explorer 200 then bridge 50. Save `p1-bridge-50.png`. Pass when the bridge makes no metadata call.
- [ ] Lane 4. Explorer 200 for ranked, bridge 150 for unranked. Save `p1-modes.png`. Pass when each mode keeps its own entry.
- [ ] Lane 5. Expire the explorer entry by clock, then open bridge 150. Save `p1-stale.png`. Pass when the bridge fetches fresh data.
- [ ] Lane 6. Fill localStorage to the cache bound with other accounts. Save `p1-eviction.png`. Pass when the oldest entry is evicted and no write throws.
- [ ] Lane 7. Two tabs open explorer and bridge together for one account. Save `p1-two-tabs.png`. Pass when at most one metadata call is in flight.
- [ ] Lane 8. Explicit refresh in the explorer after a bridge write. Save `p1-refresh.png`. Pass when refresh refetches and stores 200 prefixes.
- [ ] Lane 9. Bridge 150 with the metadata request failing 500. Save `p1-error.png`. Pass when the existing 200 entry stays readable.
- [ ] Lane 10. Compare all 18 main metrics and 2 supplemental values for every prefix between trunk and head after lane 1. Save `p1-metrics.png`. Pass when every value is identical.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Metadata calls and wire bytes for the lane 1 sequence.
- [ ] Probe. Lane 1 request log at trunk and head, interleaved twice.
- [ ] Baseline. Record the trunk call count and bytes first. The audit estimates two calls and about 1.3 MB.
- [ ] Rule. Head fails when it makes more than one metadata call for the sequence or any metric differs.

**Review gate.** None. P1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Reviewer triage done.
- [ ] Rebased onto current trunk after the verdict.
- [ ] Root pushes to `origin main` on the operator's go and confirms the deployed `bridge.html` serves the new module version.

## Shrink the Rank History download (P2)

**Depends on.** None.

**Files.**

- [ ] Edit `src/rank-history.js`.
- [ ] Edit `rank-history.html`.
- [ ] Create `tools/make-rank-thumbnails.mjs`.
- [ ] Create `assets/ranks/tier01.webp` to `assets/ranks/tier11.webp`.
- [ ] Edit `test/rank-history.test.js`.
- [ ] Create `test/fixtures/rank-history-parity.json`.

**Build.**

- [ ] Load points from `/v1/players/{id}/mmr-history` in `loadHistory`, reusing `normalizeHistory` for de-duplication and order.
- [ ] Fall back to `/v1/players/{id}/match-history` on any non-2xx except 429, an invalid shape, or zero usable rows. Never fall back on 429 or abort. Hold both calls inside one 20-second budget.
- [ ] Suppress the mmr call for the rest of the page session after it fails once.
- [ ] Generate 64px-wide, aspect-preserving lossless WebP thumbnails for the 11 tiers with `tools/make-rank-thumbnails.mjs` and serve them from GitHub Pages. Keep native Panorama badges unchanged.

**You see.**

- [ ] The request log for a cold Rank History open shows one `mmr-history` call of about 2 KB and tier icons of about 5 KB each.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/rank-history.test.js` gains a parity case. Recorded responses for accounts 900605181 and 487348881 produce identical points from both endpoints. Run `node --test test/rank-history.test.js`.
- [ ] `test/rank-history.test.js` gains fallback cases for 404, 410, invalid shape and zero rows, and no-fallback cases for 429 and abort. Run `node --test`.
- [ ] `test/rank-history.test.js` gains a case that the chart references only `assets/ranks/` icons. Run `node --test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `openai-codex/gpt-6-astra` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open Rank History cold for 487348881 group 5 at trunk and head. Save `p2-regression.png`. Pass when the plotted points are identical and head bytes are under 40 KB.
- [ ] Lane 2. Account 900605181 group 1. In the same run, fetch `match-history` and `mmr-history` once each and normalize both with `normalizeHistory`. Save `p2-group1.png`. Pass when the head chart's point count and callout equal the values derived from the `match-history` capture. Exact counts such as 171 points and Phantom 6 belong only to the recorded parity fixture, because live data changes with every match.
- [ ] Lane 3. Groups 5, 10 and 25 in turn. Save `p2-groups.png`. Pass when no API call follows the first.
- [ ] Lane 4. Route `mmr-history` to 404. Save `p2-fallback-404.png`. Pass when the chart draws from `match-history`.
- [ ] Lane 5. Route `mmr-history` to an empty array. Save `p2-fallback-empty.png`. Pass when the chart draws from `match-history`.
- [ ] Lane 6. Route `mmr-history` to 429. Save `p2-429.png`. Pass when the page shows the busy message and makes no `match-history` call.
- [ ] Lane 7. An account with no ranked matches. Save `p2-unranked.png`. Pass when the page shows the empty message after two calls.
- [ ] Lane 8. Chart at 900x166 and 1600x200 viewports. Save `p2-sizes.png`. Pass when every tier icon is sharp and unclipped.
- [ ] Lane 9. Four-tier history for 487348881. Save `p2-four-tiers.png`. Pass when all four thumbnails load from the Pages origin.
- [ ] Lane 10. In-game lane, only on the operator's go. Open own profile, then the Rank History tab. Save `p2-ingame.png`. Pass when the chart shows the same points as trunk and `console.log` has no script error.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total wire bytes and request count for a cold Rank History open, API plus icons plus page modules.
- [ ] Probe. Lane 1 request log at trunk and head with a cleared browser cache, interleaved twice.
- [ ] Baseline. Record trunk first. The audit measured about 108 KB history, 238 KB icons and 10 KB static for 487348881.
- [ ] Rule. Head fails above 40 KB total or when any plotted point differs from trunk.

**Review gate.** The operator reviews before landing.

- [ ] Copy lane 1, lane 8 and lane 9 screenshots into `.scratch/swarm-p2/review/` as `p2-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of switching all four groups on trunk and head. Save it as `.scratch/swarm-p2/review/p2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at review-ready. Wait for the operator's go.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Reviewer triage done.
- [ ] Rebased onto current trunk after the verdict.
- [ ] Root pushes to `origin main` on the operator's go and confirms the deployed page serves the new icons.

## Cache playstyle resources independently with cooldowns (P3)

**Depends on.** None.

**Files.**

- [ ] Edit `src/playstyle.js`.
- [ ] Edit `src/page-cache.js`.
- [ ] Edit `test/playstyle.test.js`.

**Build.**

- [ ] Cache the four playstyle resources separately in `runPlaystyle`, so one failed sibling never discards a successful one.
- [ ] Share one in-flight promise per resource key across same-page calls.
- [ ] Persist a 429 cooldown per endpoint family in `src/page-cache.js` and skip fetches while it holds, matching the bridge's rate-state behavior.

**You see.**

- [ ] After an account-curve failure, reopening the profile refetches only the account curve.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/playstyle.test.js` gains a partial-failure case that refetches one resource. Run `node --test test/playstyle.test.js`.
- [ ] `test/playstyle.test.js` gains a cooldown case that makes zero calls during a persisted 429 window and recovers after it. Run `node --test`.
- [ ] `test/playstyle.test.js` gains a stale-nonce case where an old profile's result never publishes. Run `node --test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `openai-codex/gpt-6-astra` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Fail the account curve once, then reopen within the TTL, at trunk and head. Save `p3-regression.png`. Pass when trunk refetches two account calls and head refetches one.
- [ ] Lane 2. Cold open for 487348881. Save `p3-cold.png`. Pass when four calls run and the radar matches trunk.
- [ ] Lane 3. Five different accounts in a row. Save `p3-five.png`. Pass when the community pair is fetched once.
- [ ] Lane 4. Route metrics to 429 with `retry-after: 30`. Save `p3-429.png`. Pass when the busy message shows and a reopen within 30 seconds makes no call.
- [ ] Lane 5. Reopen after the cooldown ends. Save `p3-recover.png`. Pass when the radar draws.
- [ ] Lane 6. Two tabs open the same account together. Save `p3-two-tabs.png`. Pass when each resource is fetched at most once per tab.
- [ ] Lane 7. Switch account mid-load. Save `p3-switch.png`. Pass when only the second account's radar publishes.
- [ ] Lane 8. Corrupt one cached entry in localStorage. Save `p3-corrupt.png`. Pass when that resource refetches and the radar draws.
- [ ] Lane 9. An account with no matches in 30 days. Save `p3-empty.png`. Pass when the empty message shows.
- [ ] Lane 10. Resize after a ready radar. Save `p3-resize.png`. Pass when it redraws with no new call.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. API calls in the partial-failure reopen and in the cooldown reopen scenarios.
- [ ] Probe. Lane 1 and lane 4 request logs at trunk and head, interleaved twice.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails when either scenario makes as many calls as trunk, or when a radar differs from trunk.

**Review gate.** None. P3 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Reviewer triage done.
- [ ] Rebased onto current trunk after the verdict.
- [ ] Root pushes to `origin main` on the operator's go and confirms the deployed page.

## Project the metadata query behind a parity gate (P4)

**Depends on.** P1.

**Files.**

- [ ] Edit `src/api.js`.
- [ ] Create `test/fixtures/metadata-full-150-ranked.json` and `test/fixtures/metadata-full-150-unranked.json`.
- [ ] Create `test/metadata-projection.test.js`.

**Build.**

- [ ] Record full responses for both modes. Replace `include_player_final_stats=true` with the minimal `extra_player_columns` set that `src/metrics.js` reads. Keep teammate kills, because `killParticipation` divides by all same-team kills, so `only_filtered_players` stays off.
- [ ] Land only when the parity test passes. Otherwise close P4 with the parity diff as evidence and no source change.

**You see.**

- [ ] The 150-match comparison downloads at least 30 percent fewer bytes with identical stats.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/metadata-projection.test.js` compares all 18 main metrics and 2 supplemental values for every prefix and both modes between full and projected responses. Run `node --test test/metadata-projection.test.js`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `openai-codex/gpt-6-astra` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the 150-match ranked comparison for 487348881 at trunk and head. Save `p4-regression.png`. Pass when every value matches and head bytes are at most 70 percent of trunk.
- [ ] Lane 2. Same for unranked mode. Save `p4-unranked.png`. Pass when every value matches.
- [ ] Lane 3. Explorer at 25, 50, 100 and 200 matches. Save `p4-prefixes.png`. Pass when every prefix matches trunk.
- [ ] Lane 4. Account 900605181. Save `p4-second.png`. Pass when every value matches trunk.
- [ ] Lane 5. An account with fewer than 50 matches. Save `p4-short.png`. Pass when the sample count and values match trunk.
- [ ] Lane 6. Kill participation for a match with an abandoned teammate. Save `p4-kp.png`. Pass when it matches trunk.
- [ ] Lane 7. The explorer's raw-response section. Save `p4-raw.png`. Pass when it renders the projected response without errors.
- [ ] Lane 8. Route metadata to 429. Save `p4-429.png`. Pass when the cooldown behavior matches trunk.
- [ ] Lane 9. Bridge page through the mod's VS COMMUNITY flow in Chromium. Save `p4-bridge.png`. Pass when the title protocol payload matches trunk.
- [ ] Lane 10. In-game lane, only on the operator's go. Open VS COMMUNITY on own profile. Save `p4-ingame.png`. Pass when the numbers match trunk.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wire bytes of the 150-match metadata query.
- [ ] Probe. `curl --compressed -w %{size_download}` on the trunk and head query strings for both modes, interleaved three times.
- [ ] Baseline. Record trunk first. The audit measured 661,653 B wire for 487348881 ranked.
- [ ] Rule. Head fails above 70 percent of trunk bytes or on any metric difference.

**Review gate.** None. P4 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Reviewer triage done.
- [ ] Rebased onto current trunk after the verdict.
- [ ] Root pushes to `origin main` on the operator's go, or records that P4 closed with no change.

## Extract the chart-page status helper and unify module versions (P5)

**Depends on.** P2 and P3.

**Files.**

- [ ] Create `src/page-status.js`.
- [ ] Edit `src/rank-history.js`.
- [ ] Edit `src/playstyle.js`.
- [ ] Edit every `src/*.js` import and `*.html` script tag that carries a `?v=` query.

**Build.**

- [ ] Move `publish`, `showMessage`, `errorCode` and the pagehide abort setup into `src/page-status.js`, parameterized by title prefix. Keep query parsing and rendering in each page.
- [ ] Give every shared module one version identity, so `api.js` and `metrics.js` download once across pages.

**You see.**

- [ ] Both chart pages publish byte-identical titles and hashes for ready, empty and error outcomes.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The existing `test/rank-history.test.js` and `test/playstyle.test.js` pass unchanged. Run `node --test`.
- [ ] A new case asserts each shared module path appears with exactly one `?v=` value across all pages. Run `node --test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `openai-codex/gpt-6-astra` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Load both chart pages for 487348881 at trunk and head. Save `p5-regression.png`. Pass when titles and SVG output are identical.
- [ ] Lane 2. Rank History error outcome. Save `p5-rh-error.png`. Pass when the title matches trunk.
- [ ] Lane 3. Playstyle error outcome. Save `p5-ps-error.png`. Pass when the title matches trunk.
- [ ] Lane 4. Empty outcomes on both pages. Save `p5-empty.png`. Pass when the titles match trunk.
- [ ] Lane 5. Invalid query on both pages. Save `p5-invalid.png`. Pass when the titles match trunk.
- [ ] Lane 6. Navigate away mid-load. Save `p5-abort.png`. Pass when no title publishes.
- [ ] Lane 7. Load the explorer, bridge and both charts in one tab. Save `p5-modules.png`. Pass when `api.js` is requested once.
- [ ] Lane 8. Party page. Save `p5-party.png`. Pass when its title matches trunk.
- [ ] Lane 9. Explorer page. Save `p5-explorer.png`. Pass when it renders like trunk.
- [ ] Lane 10. Hash fallback, reading the result from the URL fragment only. Save `p5-hash.png`. Pass when it decodes to the title.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Combined gzip bytes and unique static requests for both chart pages plus the explorer.
- [ ] Probe. Lane 7 request log at trunk and head.
- [ ] Baseline. Record trunk first. The audit measured three `api.js` identities of 3,294 B each.
- [ ] Rule. Head fails if either number increases.

**Review gate.** None. P5 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Reviewer triage done.
- [ ] Rebased onto current trunk after the verdict.
- [ ] Root pushes to `origin main` on the operator's go and confirms every deployed page.

## Separate chart signal reading from reconciliation in the mod (P6)

**Depends on.** None.

**Files.**

- [ ] Edit `showrank_barebones/panorama/scripts/showrank_barebones.js`.
- [ ] Edit `showrank_barebones/tests/showrank-barebones-runtime.test.js`.

**Build.**

- [ ] Read visibility, account, async state and group once per tick into one snapshot in `reconcileProfileCharts`, and have `profileChartsSignal` derive its string from that snapshot.
- [ ] Keep the two chart records, the token and the scheduling rules unchanged.

**You see.**

- [ ] The chart controller reads each native signal once per tick.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The existing profile chart tests pass unchanged. Run `npm --prefix showrank_barebones run validate`.
- [ ] Mutation checks on a scratch copy via `SHOWRANK_BAREBONES_RUNTIME` still fail the tests for the account signal, the prefix check and the both-panels-missing guard.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `openai-codex/gpt-6-astra` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the VM chart scenarios at trunk and head. Save `p6-regression.png`. Pass when the recorded URL, class and text sequences are identical.
- [ ] Lane 2. Visible profile switch with no pointer activity. Save `p6-switch.png`. Pass when the new account loads within 2.5 seconds.
- [ ] Lane 3. Return by keyboard after a stock history failure. Save `p6-return.png`. Pass when Rank History falls back again.
- [ ] Lane 4. Group change while loading. Save `p6-group.png`. Pass when the last group wins.
- [ ] Lane 5. Late status from an old nonce. Save `p6-stale.png`. Pass when it is ignored.
- [ ] Lane 6. Only the radar panel present. Save `p6-radar-only.png`. Pass when the radar loads.
- [ ] Lane 7. Page destroyed. Save `p6-destroy.png`. Pass when no callback stays pending.
- [ ] Lane 8. In-game lane, only on the operator's go. Open own profile. Save `p6-ingame-own.png`. Pass when both charts show and `console.log` has no script error.
- [ ] Lane 9. In-game lane, only on the operator's go. Open a friend's profile from the friends list. Save `p6-ingame-friend.png`. Pass when the radar shows the friend's account.
- [ ] Lane 10. In-game lane, only on the operator's go. Leave and re-enter the profile page. Save `p6-ingame-reenter.png`. Pass when the charts reload without pointer activity.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Native method calls and text reads per settled visible tick and per hidden tick in the VM harness.
- [ ] Probe. The `operationCounts` wrapper from `scripts/hp-colors-panorama-test-adapter.js` over 60 simulated seconds, at trunk and head.
- [ ] Baseline. Record trunk first. The audit measured 13 native calls plus 1 text read per visible tick and 3 per hidden tick.
- [ ] Rule. Head fails if either count increases.

**Review gate.** None. P6 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Reviewer triage done.
- [ ] Rebased onto current mod trunk after the verdict.
- [ ] Root commits locally, runs `build_showrank_barebones.ps1 -Install` with Deadlock closed, and records the installed pak89 hash.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names, including the before and after bytes per scenario.

## Appendix A. Prototype evidence

No code prototypes ran. The operator asked for a plan only. Read-only measurements settled these questions on 2026-10-19.

- The `mmr-history` endpoint gives the same chart points as `match-history`. For 900605181 it returned 227 rows with 171 unique matches. All 171 matched badge and start time, and the 56 duplicates were exact copies. For 487348881 it returned 241 rows with 201 unique matches and 0 differences. Wire bytes fell from 197,477 B to 1,747 B and from 108,082 B to 2,325 B.
- Match history carries 5,164 rows of 28 fields for 900605181, of which the chart uses 171 rows and 3 fields.
- The rank asset CDN has no small variant. `small_subrank3_webp`, `subrank3_webp` and `large_subrank3_webp` are the same 115,530 B file. `large_webp` is 49,824 B and `chalk_webp` 16,580 B for tier 9.
- A 64x51 lossless WebP of the tier 11 icon is 5,374 B against 87,114 B, a 93.8 percent cut. This was generated in memory, not deployed.
- The per-player `rank/image` WebP measured 115,818 B and 204,080 B for two accounts.
- The 150-match metadata query measured 661,653 B wire and 5,434,096 B decoded.

These stay unproven and wait for spikes the operator must authorize.

- Native badges spike. Return 12 roster badges from the party page and set shared self-hosted thumbnails in Panorama. Native widths reach 92px, so it needs its own sizes. Placement and team-average parity are open.
- Stats selection monitor spike. The worst VM case is 64,560 native calls per minute with row 64 selected. A cached selected row is not equivalent, because keyboard focus on an earlier row must still win. It needs a live diagnostics build to find a native focus event.
- Early-match scheduler spike. Thirteen chains make 840 callbacks per minute. One durable watchdog could cut that to 180, but leader-loss recovery needs a parent-owned scheduler proven live.
- Whether CEF shares localStorage and the native image cache across HTML panels, and whether `about:blank` frees a browser's memory.

## Appendix B. Alternatives rejected

- A debounce on Rank History group buttons. Warm group changes already make no API call, and no cold rapid clicking was observed.
- Merging Rank History and the radar into one HTML panel. They sit in different columns, and merging saves no API call.
- Loading the radar only on click. It already loads only for a visible, verified profile, and hiding it changes behavior.
- Shrinking the SVGs. They are 2.7 KB to 18.4 KB, small next to the images.
- Application-level stale-while-revalidate. The API already sends `stale-while-revalidate`.
- `only_filtered_players=true` on the metadata query. It drops teammates and breaks kill participation.
- Switching to `mmr-history` with no fallback. The API documents it as deprecated.
- One 64px thumbnail set for every surface. Native badges render up to 92px before UI scaling.

## Appendix C. Risks

- P2. The deprecated `mmr-history` endpoint may disappear or start returning partial data. The fallback covers errors and empty results but cannot detect a partial nonempty list. The owner keeps the parity fixture and watches the API changelog.
- P2. Unranked players pay one extra 2 KB request for the fallback.
- P2. Self-hosted thumbnails go stale if Valve changes rank art. The generator script reruns from `/v1/assets/ranks`.
- P3. Per-resource caching could publish an old profile's result. The stale-nonce test guards it.
- P4. The projection may not reproduce every metric. P4 then closes with no change.
- P6. In-game lanes need a launch the operator authorizes, and Steam `-insecure` must not persist onto official servers.

## Appendix D. Links and reading list

- `showrank_barebones/AGENTS.md`, profile charts section.
- `deadlock-stats-bridge/RATE_LIMIT_OPTIMIZATION_PLAN.md`. Its 12-metric count is stale, and the real count is 18 plus 2 supplemental.
- `https://api.deadlock-api.com/openapi.json`, saved as `.scratch/audit/openapi.json`.
- Astra's audit transcript at `agent://AstraAudit`.
- pstack `skills/how/SKILL.md` before P1 and P4, and `skills/interrogate/SKILL.md` before landing P2 and P4.
- Keep the decision trail per pstack `skills/show-me-your-work/SKILL.md` in `.scratch/audit/decisions.tsv`.
