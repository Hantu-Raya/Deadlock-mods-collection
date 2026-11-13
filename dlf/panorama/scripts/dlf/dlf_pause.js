// Minimal pause box (hud_paused.xml): "II" while the game is paused, the unpause countdown number
// in its place while it counts. The engine puts .Hidden on #PausedCountdownLabel while paused and
// takes it off each countdown second (live in Observer HUD, client 6813, [OH-PAUSE] log 2026-10-23).
// .PausedTextMoved and gameIsPausedCountdown stay on after the first countdown, so the old CSS swap on
// .PausedTextMoved drew an empty box on the second pause. II's visibility is written "visible" /
// "collapse", never cleared with null (a cleared inline collapse stays hidden live). The loop checks
// every 0.5 s and every 0.1 s while the pause box shows; it writes only on change.
(() => {
  "use strict";

  const TAG = "[DLF]";
  const IDLE_SEC = 0.5;
  const WATCH_SEC = 0.1;

  const context = $.GetContextPanel();
  if (typeof context.DLFPauseStop === "function") context.DLFPauseStop();
  let stopped = false;
  context.DLFPauseStop = () => { stopped = true; };

  const UI = { icon: null, count: null, game: null };
  let shown = "";
  let errorShown = false;

  const valid = (panel) => !!panel && typeof panel.IsValid === "function" && panel.IsValid();

  function cache() {
    if (valid(UI.icon) && valid(UI.count) && valid(UI.game)) return true;
    UI.icon = context.FindChildTraverse("PausedLabel");
    UI.count = context.FindChildTraverse("PausedCountdownLabel");
    UI.game = context.FindChildTraverse("PausedGameContainer");
    shown = "";
    return valid(UI.icon) && valid(UI.count) && valid(UI.game);
  }

  function tick() {
    if (stopped) return;
    let delay = IDLE_SEC;
    try {
      if (cache()) {
        // While the box is hidden II is set back to visible, so the next pause shows it at once.
        const open = !UI.game.BHasClass("Hidden");
        const counting = open && !UI.count.BHasClass("Hidden") && String(UI.count.text || "") !== "";
        const next = counting ? "collapse" : "visible";
        if (next !== shown) {
          UI.icon.style.visibility = next;
          shown = next;
        }
        if (open) delay = WATCH_SEC;
      }
    } catch (e) {
      if (!errorShown) {
        errorShown = true;
        $.Msg(`${TAG} pause: ${e && e.message ? e.message : e}`);
      }
    }
    $.Schedule(delay, tick);
  }

  tick();
})();
