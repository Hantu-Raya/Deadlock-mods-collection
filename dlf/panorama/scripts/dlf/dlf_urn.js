// Urn carrier icon on the top-bar cards (citadel_hud_top_bar.xml; #DLFUrn in citadel_hud_top_bar_player.xml,
// styled in dlf_card.css). User 2026-10-25: show who carries the urn next to the ult icon.
// Sources (client.dll 6819):
// - the kill feed (#EventFeed, citadel_hud_data_feed_info.xml rows, rva 0x1e3e1e0): a pickup row gets
//   .IdolPickedUp with the picker as its killer (#KillerImage, Label.killerInfo bound to {s:killer_name});
//   .IdolReturned and .IdolExpired rows end the carry. Rows live a few seconds and the engine reuses them,
//   so a row counts again when its event, hero or name changes;
// - the minimap (#hud_minimap, rva 0x1e61b20): each player marker (.map_button.player) carries
//   .PlayerIsHoldingIdol while its hero holds the urn (modifier state 0x9A). It names no player, so it only
//   says how long the carry lasts: once seen, the carry ends when no marker has it (dropped or delivered),
//   and a pickup it never confirms within PICK_GRACE_MS (an old row read at a late join) is dropped. Until
//   the class has been seen this session (not seen live for a spectator) the feed alone decides.
// The picker's card is found by the row's hero (#KillerImage heroid against each card's #HeroBadge), since
// dlf_names.js may show an alias in the feed label; by the label's name only when the hero is unknown;
// never when two cards fit. A dead carrier's icon goes at once. The minimap is read only while someone
// carries the urn; classes are written only when the carrier changes.
(() => {
  "use strict";

  const TAG = "[DLF-URN]";
  const TICK_SEC = 0.5;
  const FIND_RETRY_MS = 10000; // a missing feed or minimap is looked for again this often
  const PICK_GRACE_MS = 2000;
  const EVENTS = ["IdolPickedUp", "IdolReturned", "IdolExpired"];
  const TEAM_PANELS = ["TeamFriendly", "TeamEnemy"];

  const context = $.GetContextPanel();
  if (typeof context.DLFUrnStop === "function") context.DLFUrnStop();
  let stopped = false;
  let errorShown = false;
  context.DLFUrnStop = () => { stopped = true; };

  const S = $.DLFState;
  const valid = S.valid;
  const attrs = S.hudAttrs(context);

  // rows: feed row -> { sig, image, label } (the last event read from it).
  const Find = { feed: null, minimap: null, feedAt: 0, minimapAt: 0 };
  const rows = new Map();
  // card: the carrier's card; shown: the card whose icon has the class; pickedAt: Date.now() of the pickup;
  // held: the minimap confirmed this carry; minimapWorks: the class was seen this session.
  // slot: the buff slot written on shown's icon (0: none).
  const Urn = { card: null, shown: null, slot: 0, pickedAt: 0, held: false, minimapWorks: false };

  function find(key, atKey, id, now) {
    if (valid(Find[key])) return Find[key];
    Find[key] = null;
    if (now < Find[atKey]) return null;
    const found = attrs.root().FindChildTraverse(id);
    if (valid(found)) Find[key] = found;
    else Find[atKey] = now + FIND_RETRY_MS;
    return Find[key];
  }

  function cards() {
    const list = [];
    for (const id of TEAM_PANELS) {
      const team = context.FindChildTraverse(id);
      const players = valid(team) ? team.FindChildTraverse("PlayersContainer") : null;
      if (!valid(players)) continue;
      for (const card of players.Children()) if (card.paneltype === "CitadelHudTopBarPlayer") list.push(card);
    }
    return list;
  }

  const nameOf = (card) => {
    const label = card.FindChildrenWithClassTraverse("AlwaysPlayerName")[0] || card.FindChildrenWithClassTraverse("PlayerName")[0];
    const text = label ? label.text : "";
    return typeof text === "string" ? text.trim().toUpperCase() : "";
  };

  // The one card for a hero id (else by name); null when none or two fit.
  function cardFor(hero, name) {
    const all = cards();
    if (hero > 0) {
      const owners = all.filter((card) => {
        const badge = card.FindChildTraverse("HeroBadge");
        return badge && Number(badge.heroid) === hero;
      });
      if (owners.length) return owners.length === 1 ? owners[0] : null;
    }
    const upper = name.trim().toUpperCase();
    const named = upper ? all.filter((card) => nameOf(card) === upper) : [];
    return named.length === 1 ? named[0] : null;
  }

  function readFeed(feed, now) {
    const seen = new Set();
    for (const row of feed.Children()) {
      let event = "";
      for (const cls of EVENTS) if (row.BHasClass(cls)) event = cls;
      if (!event) continue;
      seen.add(row);
      let info = rows.get(row);
      if (!info) {
        info = { sig: "", image: row.FindChildTraverse("KillerImage"), label: row.FindChildrenWithClassTraverse("killerInfo")[0] || null };
        rows.set(row, info);
      }
      const hero = valid(info.image) ? Number(info.image.heroid) || 0 : 0;
      const text = valid(info.label) ? info.label.text : "";
      const name = typeof text === "string" && text !== "{s:killer_name}" ? text : "";
      const sig = `${event}|${hero}|${name}`;
      if (sig === info.sig) continue;
      info.sig = sig;
      if (event === "IdolPickedUp") {
        Urn.card = cardFor(hero, name);
        Urn.pickedAt = now;
        Urn.held = false;
      } else {
        Urn.card = null;
      }
    }
    for (const row of rows.keys()) if (!seen.has(row)) rows.delete(row);
  }

  function readMinimap(now) {
    const minimap = find("minimap", "minimapAt", "hud_minimap", now);
    if (!minimap) return;
    const holding = minimap.FindChildrenWithClassTraverse("PlayerIsHoldingIdol").length > 0;
    if (holding) {
      Urn.held = true;
      Urn.minimapWorks = true;
    } else if (Urn.held || (Urn.minimapWorks && now - Urn.pickedAt >= PICK_GRACE_MS)) {
      Urn.card = null;
    }
  }

  // The first free buff slot right of the ult icon: the rings (pickup_timers.js pickupSlot) put floor(n/2)
  // of n visible buffs on the right, so slot floor(n/2) + 1 (dlf_card.css .DLFUrnSlot1-3).
  function slotFor(card) {
    const row = card.FindChildTraverse("HPV2PickupIndicators");
    let n = 0;
    if (valid(row) && row.style.visibility === "visible") {
      for (let b = 0; b < 4; b++) {
        const ring = row.FindChildTraverse(`HPV2Pickup${b}`);
        if (valid(ring) && ring.style.visibility === "visible") n++;
      }
    }
    return Math.floor(n / 2) + 1;
  }

  function setIcon(card, slot) {
    if (!valid(card)) return;
    const icon = card.FindChildTraverse("DLFUrn");
    if (!valid(icon)) return;
    icon.SetHasClass("DLFUrnHeld", slot > 0);
    for (let k = 1; k <= 3; k++) icon.SetHasClass(`DLFUrnSlot${k}`, k === slot);
  }

  function render() {
    const slot = Urn.card ? slotFor(Urn.card) : 0;
    if (Urn.card === Urn.shown && slot === Urn.slot) return;
    if (Urn.shown !== Urn.card) setIcon(Urn.shown, 0);
    setIcon(Urn.card, slot);
    Urn.shown = Urn.card;
    Urn.slot = slot;
  }

  function step(now) {
    const feed = find("feed", "feedAt", "EventFeed", now);
    if (feed) readFeed(feed, now);
    if (Urn.card && (!valid(Urn.card) || Urn.card.BHasClass("Dead"))) Urn.card = null;
    if (Urn.card) readMinimap(now);
    render();
  }

  function tick() {
    if (stopped) return;
    $.Schedule(TICK_SEC, tick);
    try {
      step(Date.now());
    } catch (e) {
      if (!errorShown) {
        errorShown = true;
        $.Msg(`${TAG} tick error: ${e && e.message ? e.message : e}`);
      }
    }
  }

  // A reload starts clean: no card keeps an icon from the previous run.
  for (const card of cards()) {
    const icon = card.FindChildTraverse("DLFUrn");
    if (valid(icon) && icon.BHasClass("DLFUrnHeld")) setIcon(card, 0);
  }
  tick();
})();
