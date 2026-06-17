# HP-bar publisher

Publishes bridge pickup status classes from the stock unit-status overlay context and records a 160s start/end time per active buff.

# Shared payload

Stores compact per-unit masks plus per-buff `started_at`, `ends_at`, and `duration_ms` fields in `GameUI.CustomUIConfig().__topbarStatusBuffs`; mirrors changes through `ClientUI_FireOutput`.

# Topbar consumer and icon slots

Matches shared records by normalized player name first, then hero name, and toggles fixed topbar icon/timer slots.

# Validation, packaging, and manual QA

Use the module validator before compiling. The build wrapper compiles, packs, inspects `pak89_dir.vpk`, and deploys only after the packed tree passes required/forbidden asset checks.
