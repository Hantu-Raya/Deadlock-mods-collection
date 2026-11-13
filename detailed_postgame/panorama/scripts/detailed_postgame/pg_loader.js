// Detailed Post Scoreboard Menu (pak11): page-context loader. Runs in CitadelPostGameNew (our override of
// post_game/citadel_db_page_post_game_new.xml). Loads the board layout into #ScoreboardScreen and puts
// the Play Again flame video back (its src attribute cannot be compiled from a mod, see ENGINE.md).
(() => {
  "use strict";

  const TAG = "[DPS]";
  const BOARD = "file://{resources}/layout/detailed_postgame/pg_board.xml";
  const FLAME = "file://{resources}/videos/pick_screen/play_btn_grn_flame.webm";
  const ctx = $.GetContextPanel();
  const ok = (p) => !!(p && p.IsValid && p.IsValid());

  // The flame does not depend on the board: it comes back even when the board cannot load.
  function flame(attempt) {
    const fx = ctx.FindChildTraverse("PlayButtonFX");
    if (!ok(fx)) {
      if (attempt < 40) $.Schedule(0.5, () => flame(attempt + 1));
      return;
    }
    if (typeof fx.SetMovie !== "function") return;
    try {
      fx.SetMovie(FLAME);
      if (typeof fx.Play === "function") fx.Play();
    } catch (e) {
      $.Msg(`${TAG} flame video: ${e}`);
    }
  }

  function boot(attempt) {
    const screen = ctx.FindChildTraverse("ScoreboardScreen");
    if (!ok(screen)) {
      if (attempt < 40) $.Schedule(0.5, () => boot(attempt + 1));
      return;
    }
    if (ok(screen.FindChild("NSHost"))) return;
    const host = $.CreatePanel("Panel", screen, "NSHost", { hittest: "false" });
    if (!host.BLoadLayout(BOARD, false, false)) {
      $.Msg(`${TAG} could not load ${BOARD}`);
      host.DeleteAsync(0);
    }
  }

  flame(0);
  boot(0);
})();
