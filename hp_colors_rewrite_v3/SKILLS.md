# Skills for the v3 rewrite

Routed with `ask-matt` (local `~/.agents/skills/ask-matt`), then filled in with this repo's skills and the pstack principles. Only skills that exist locally are listed as runnable; pstack is a Cursor plugin and is not installed here, so its items are reading, not commands.

## Route (ask-matt)

ask-matt sends "a huge, foggy effort, too big for one session" to `/wayfinder`, then merges onto the main flow. v3 fits: 21k runtime lines, open scope cuts, an external storage page, three package variants.

| Step | Skill | Output for v3 |
|---|---|---|
| 1. Chart | `/wayfinder` (runs `/grilling` + `/domain-modeling`) | `MAP.md` plus decision tickets in `tickets/`. Started in this folder. |
| 2. Resolve decisions | one ticket per session: `/grilling` (HITL), `/research` (AFK), `/prototype` (HITL) | Closed tickets, answers in `MAP.md` "Decisions so far" |
| 3. Collapse | `/to-spec` | `SPEC.md` |
| 4. Slice | `/to-tickets` | tracer-bullet build tickets with blocking edges |
| 5. Build | `/implement` per ticket, `/clear` between tickets | code + E2E tests; `/implement` drives `/tdd` and ends with `/code-review` |

Keep steps 3–4 in one context window (ask-matt "Context hygiene"). Use `/handoff` only for a prototype that lives in its own directory.

Vocabulary underneath: `/domain-modeling` keeps `CONTEXT.md` (surface, owner, side, scope, record version) honest; `/codebase-design` names the deep modules (schema, codec, renderer plan/apply, storage bridge).

Location override: the repo tracker convention is `.scratch/hp_colors/<feature>/` (`docs/agents/issue-tracker.md`). You asked for plans in `hp_colors_rewrite_v3/`, so the map and tickets live here. They move to `.scratch/hp_colors/v3/` if you prefer the convention.

## Repo skills that apply

| Skill | When in v3 |
|---|---|
| `fallow` | Before cutting: dead-code and duplication audit of v2 (`hp_colors_rewrite_v2/.fallow/` cache exists). Feeds the feature-cut ticket. |
| `ponytail-audit` | Same ticket: whole-v2 over-engineering list. |
| `improve-codebase-architecture` | Optional survey of v2 seams before `/codebase-design`. |
| `refactor-pinned` | Only for code carried over unchanged (storage bridge). Not for the rewrite itself: v3 changes behavior on purpose. |
| `optimize-measured` | Performance budget: baseline v2 with `scripts/measure-hp-colors-rewrite-v2-refactor.js` and `scripts/profile-hp-colors-rewrite-v2-reads.js`, then hold v3 to it. |
| `etw-benchmark-review` / `gameinfo-bench` | Only if an in-game FPS claim is made. `fps/AGENTS.md` requires asking before every benchmark launch. |
| `deadlock-launch-vconsole` | Live smoke. Needs your consent per launch. |
| `pack-vpk` | Release packaging, once v3 has a build wrapper. |
| `code-review` | End of each `/implement` ticket; also standalone for the final diff. |
| `writing-for-agents` | v3 `AGENTS.md` (target ≤100 lines). |
| `writing-clearly-and-concisely`, `unslop` | All v3 docs, changelog and GameBanana text. |
| `gamebanana-mod-page-writing` | Release page copy. |
| `diagnosing-bugs` | Live-only failures after release. |

Skip: `tdd` as a standalone flow (the repo prefers E2E and `/implement` already drives red-green), `grill-me` (we have a working directory, so `grill-with-docs`/`grilling` win), `triage` (no external reports drive v3), `verify-hp-colors` (legacy full lane).

## pstack (cursor/plugins/pstack)

Not installed. Worth adopting as rules for the map's Notes:

| Principle / skill | Why it matters here |
|---|---|
| redesign-from-first-principles | The whole effort. Design as if presets, sides and NPC gates were known on day one. |
| subtract-before-you-add | Run the cut ticket before any v3 code. |
| foundational-thinking, model-the-domain | Schema table and side-as-data come before renderer code. |
| boundary-discipline | All v2 compatibility lives in one `fromV2` module. |
| outcome-oriented-execution, migrate-callers-then-delete-legacy-apis | No v2/v3 compatibility shims inside the runtime; v3 replaces pak02 in one release. |
| build-the-lever, encode-lessons-in-structure | Generate menu XML, id list, codec slot table and docs from the schema. Turn "refresh the QOLLOCK copy" from a doc rule into a build step. |
| test-behavior-not-implementation, prove-it-works | No source-text asserts; E2E through the VM adapter; live smoke before release. |
| explain-the-number | Any perf claim states what limits it. |
| `/arena`, `/interrogate`, `/create-verification-skill` | Worth porting by hand: arena for the renderer prototype, interrogate for multi-model review of the schema/codec, a verify skill that turns the live-smoke list into a feature map. |

pstack's own README says "i don't believe in planning; the best spec is code." That argues for keeping the map short and reaching a prototype early (renderer plan/apply ticket), not for skipping the map: the scope cuts and the hosted-page change need your decisions before code.
