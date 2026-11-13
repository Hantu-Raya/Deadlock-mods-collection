# Renderer prototype failure modes

Throwaway, single enemy-player bar. Question: can facts → memoised plan → ledger apply preserve release/lifecycle behavior within 300 active / 200 idle / 30 dormant counted operations/bar/s? This inventory precedes the code. It covers plausible failures of this slice, not every future v3 feature.

## Facts and identity

- Cached carrier classes go stale when a player becomes an objective without a generation change; custom styles/text survive on the wrong kind.
- An objective returns to a player but the dormant scheduler never notices.
- A valid cached panel moves to another parent; stale references paint a detached tree.
- A child dies or the bar subtree is replaced; the ledger restores/writes the wrong object, or discovery chooses duplicate shield IDs.
- Delayed boot sees only part of the tree; a permanently cached miss prevents recovery.
- A carrier dies while its child still reports valid; writes continue despite invalid lineage.
- Carrier has contradictory player/objective/friend/local-player classes; an unsupported unit is mistaken for an enemy player.
- Panel calls throw during engine invalidation; a callback aborts and polling stops forever.
- Health uses clip rather than width, clips have nonzero left edges, or fill and inner have different UI scales; the fraction is wrong.
- Zero/unlaid, nonfinite, negative or temporarily inconsistent geometry produces NaN, a false empty bar, or a geometry feedback loop.
- Facts reuse an old measurement after layout or scale changes. Measuring the renderer's own width/offset and adding it to desired geometry compounds movement every tick.

## Pure plan and settings

- Memo key omits fraction, class/eligibility, geometry validity, lineage identity or config revision; changed input reuses old output.
- Mutable settings change without a revision, or caller-supplied revisions collide; memo returns stale output.
- Settings and facts are mutated by planning, or planning performs panel calls; preview/test behavior diverges from runtime.
- Invalid/unbounded settings or color strings enter style writes; wrong side's settings are used.
- Gradient endpoint/midpoint interpolation, clamping or fixed-mode selection is wrong.
- Pixel settings are multiplied by UI scale twice or interpreted as v2 raw/percent units.
- Geometry takes more than one layout tick to settle; temporary invalid facts discard ownership or create oscillation.
- Cached plans grow without bound across health/config changes.

## Apply and release

- First stock capture occurs after custom writes, or an empty inline value is treated as an explicit stock value. Release writes null/empty rather than a concrete stock fallback.
- Master off, text off, unsupported kind, failed lineage or invalid geometry misses a release path.
- Ledger survives recycle/replacement; old player's stock overwrites the next unit's captured stock.
- Restore loses native HP label's original parent or binding identity; a replacement label/JS text write breaks engine updates.
- Native text's original parent dies while the label remains valid; restoration cannot faithfully reconstruct stock lineage.
- Unchanged plans still write styles/SetParent; operation budget and CSS invalidation grow.
- Engine overwrites an owned style between paints; a ledger-only diff fails to repair it.
- Engine changes stock while ownership is active; the captured first-write snapshot is no longer current stock.
- Another mod owns the same property or parent; restoring a snapshot clobbers that mod's newer write.
- A style or SetParent call fails halfway through apply/release; ledger records success too early and loses its restoration obligation.

## Scheduler and measurement

- Idle probe misses a health/layout/class change, or first-hit response waits for the 1.5 s full paint.
- Active never settles idle, idle never becomes active, or dormant becomes a dead end after enable/config/class changes.
- Reconfiguration queues duplicate loops; obsolete callbacks paint after stop/restart.
- 0.15/1.5/1 seconds are accidentally treated as milliseconds; floating-point deadlines drift full paints.
- Full-tree walks run every probe rather than only at discovery/death/lineage change.
- Boot/release spikes are hidden by steady-state averages; many bars contend despite passing a single-bar budget.
- Count adds overlapping find/children breakdowns twice, omits height/offset reads, includes fixture clip writes or final observations, or divides by callbacks/wall time instead of ten simulated seconds.
- A cheaper fixture/feature slice is described as parity or FPS improvement. The v2 baseline includes pips, shields and other work absent from this prototype.

## Evidence boundary

Node VM tests will cover lifecycle, health/config changes, explicit stock release, scale-aware health, geometry settling, memo/diff behavior and each steady-state ceiling. Native engine binding/layout, arbitrary API exceptions, stock stylesheet drift, concurrent mod/engine ownership changes, dead-parent restoration, many-bar scaling, visual parity and FPS require later engine/integration evidence. See [ticket 05 baseline](../../research/05-performance-baseline.md#counting-rule) and [PLAN D6](../../PLAN.md#d6-renderer-facts--plan--apply).
