// Ultimate cooldown counter on each top-bar card (citadel_hud_top_bar.xml). The game sets the
// ult_cooldown dialog variable on #UltimateStatusBG, and a binding only sees variables on itself
// or an ancestor, so the {i:ult_cooldown} source label lives there (#DLFUltCooldownHidden, never
// drawn) and this copies it to the visible #DLFUltCooldown beside the icon. The value moves once
// a second, so a 0.5 s loop never lags by more than half a second; writes happen only on change.
// 0 (ready) or an unbound label hides the counter; CSS also hides it when ready, locked or on
// the scoreboard. Same finding as Third Eye's topbar_ult_cooldown.
(() => {
  "use strict";

  const TAG = "[DLF-ULT]";
  const TICK_SEC = 0.5;
  const RESCAN_MS = 5000;
  const TEAMS = ["TeamFriendly", "TeamEnemy"];

  const context = $.GetContextPanel();
  if (typeof context.DLFUltCooldownStop === "function") context.DLFUltCooldownStop();
  let stopped = false;
  context.DLFUltCooldownStop = () => { stopped = true; };

  let cards = [];
  let nextRescanMs = 0;
  let errorShown = false;

  const valid = $.DLFState.valid;

  // Labels are cached per card; the pickup rings may move the ultimate icon, never these panels.
  function scan() {
    const next = [];
    for (const id of TEAMS) {
      const team = context.FindChildTraverse(id);
      const players = valid(team) ? team.FindChildTraverse("PlayersContainer") : null;
      if (!valid(players)) continue;
      for (const panel of players.Children()) {
        if (!valid(panel) || panel.paneltype !== "CitadelHudTopBarPlayer") continue;
        // Reuse a card only while its labels live: the engine can rebuild a card's children.
        const known = cards.find((card) => card.panel === panel);
        if (known && cardValid(known)) {
          next.push(known);
          continue;
        }
        const hidden = panel.FindChildTraverse("DLFUltCooldownHidden");
        const shown = panel.FindChildTraverse("DLFUltCooldown");
        if (valid(hidden) && valid(shown)) next.push({ panel, hidden, shown, text: null });
      }
    }
    cards = next;
  }

  const cardValid = (card) => valid(card.panel) && valid(card.hidden) && valid(card.shown);
  const cardsValid = () => cards.length > 0 && cards.every(cardValid);

  function sync(card) {
    const text = card.hidden.text;
    if (typeof text !== "string" || text === card.text) return;
    card.text = text;
    const seconds = /^\d{1,4}$/.test(text) ? Number(text) : 0;
    card.shown.SetHasClass("DLFCounting", seconds > 0);
    if (seconds > 0) card.shown.text = String(seconds);
  }

  function tick() {
    if (stopped) return;
    $.Schedule(TICK_SEC, tick);
    try {
      const now = Date.now();
      if (now >= nextRescanMs || !cardsValid()) {
        scan();
        nextRescanMs = now + RESCAN_MS;
      }
      for (const card of cards) sync(card);
    } catch (e) {
      if (!errorShown) {
        errorShown = true;
        $.Msg(`${TAG} tick error: ${e && e.message ? e.message : e}`);
      }
    }
  }

  tick();
})();
