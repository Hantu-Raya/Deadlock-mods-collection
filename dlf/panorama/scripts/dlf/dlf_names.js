// Player aliases outside the banner (citadel_hud_top_bar.xml; Observer HUD's renderMarkers and
// renderFeedNames, user 2026-10-24). The banner publishes { "<in-game name>": alias } on
// $.DLFState.ALIASES_ATTR (unique names only); this shows the alias on:
// - the far-away hero markers (stock hud_unit_indicators_v2.xml: #unit_indicators_v2, one .PlayerEntry per
//   player with its name in #PlayerName's Label and the hero in #HeroIcon). The name the engine wrote is
//   kept and written back when the alias goes; a name the engine writes again is taken as the new real
//   name and the alias goes back on at the next tick. Stock styling stays (only the Label's text changes).
// - the kill feed rows (stock citadel_hud_data_feed_info.xml in #EventFeed: Label.killerInfo and
//   .victimInfo bound to {s:killer_name} / {s:victim_name}). With an alias the label gets it, which unbinds
//   it, so a hidden Label of ours in the row, bound to the same variable, keeps reading the in-game name
//   (a row the engine reuses shows its new names); without one the label is bound again. Rows live a few
//   seconds, so while there are aliases a FEED_WATCH_S watch reads the row count and passes over the rows
//   when it moves; the 1 s tick passes over them too (reused rows).
// A name resolves by itself, else, for a name no card shows (a Steam friend nickname), by its hero image's
// heroid against the cards' #HeroBadge (two cards with that hero: no alias). With no aliases and none
// shown, neither the markers nor the feed are read.
(() => {
  "use strict";

  const TAG = "[DLF-NAMES]";
  const TICK_SEC = 1;
  const FEED_WATCH_S = 0.25;
  const RESOLVE_MS = 5000; // a marker's alias and the cards' heroes are looked up again this often
  const FIND_RETRY_MS = 10000; // a missing marker list or feed is looked for again this often
  const FEED_LABELS = [["killerInfo", "{s:killer_name}", "KillerImage"], ["victimInfo", "{s:victim_name}", "VictimImage"]];
  const TEAM_PANELS = ["TeamFriendly", "TeamEnemy"];

  const context = $.GetContextPanel();
  if (typeof context.DLFNamesStop === "function") context.DLFNamesStop();
  let stopped = false;
  let errorShown = false;

  const S = $.DLFState;
  const valid = S.valid;
  const attrs = S.hudAttrs(context);

  // upper-cased in-game name -> alias; sig changes with the map.
  const Aliases = { map: new Map(), sig: "", count: 0 };
  // The cards' names (upper-cased) and heroes, read while there are aliases, at most every RESOLVE_MS.
  const Cards = { names: new Set(), heroes: new Map(), at: -Infinity };
  const Markers = { root: null, retryAt: 0, entries: new Map(), replaced: 0 };
  const Feed = { panel: null, retryAt: 0, rows: new Map(), replaced: 0, count: -1, watching: false, gen: 0 };

  const logOnce = (what, e) => {
    if (errorShown) return;
    errorShown = true;
    $.Msg(`${TAG} ${what}: ${e && e.message ? e.message : e}`);
  };

  function refreshAliases() {
    const raw = attrs.changed(S.ALIASES_ATTR);
    if (raw === undefined) return;
    const map = S.aliasMap(raw);
    const sig = JSON.stringify([...map]);
    if (sig === Aliases.sig) return;
    Aliases.map = map;
    Aliases.sig = sig;
    Aliases.count = map.size;
    Cards.at = -Infinity;
  }

  // Every card's name and hero (heroid -> names of the cards with it).
  function refreshCards(now) {
    if (now - Cards.at < RESOLVE_MS) return;
    Cards.at = now;
    const names = new Set();
    const heroes = new Map();
    for (const id of TEAM_PANELS) {
      const team = context.FindChildTraverse(id);
      const players = valid(team) ? team.FindChildTraverse("PlayersContainer") : null;
      if (!valid(players)) continue;
      for (const card of players.Children()) {
        if (card.paneltype !== "CitadelHudTopBarPlayer") continue;
        const label = card.FindChildrenWithClassTraverse("AlwaysPlayerName")[0] || card.FindChildrenWithClassTraverse("PlayerName")[0];
        const text = label ? label.text : "";
        const name = typeof text === "string" ? text.trim().toUpperCase() : "";
        if (!name) continue;
        names.add(name);
        const badge = card.FindChildTraverse("HeroBadge");
        const hero = badge ? Number(badge.heroid) : NaN;
        if (hero > 0) heroes.set(hero, (heroes.get(hero) || []).concat([name]));
      }
    }
    Cards.names = names;
    Cards.heroes = heroes;
  }

  // The alias for a shown name: by the name, else (a name no card shows) by its hero.
  function aliasFor(real, heroPanel) {
    if (!real) return "";
    const upper = real.trim().toUpperCase();
    const byName = Aliases.map.get(upper);
    if (byName) return byName;
    if (Cards.names.has(upper)) return "";
    const hero = valid(heroPanel) ? Number(heroPanel.heroid) : NaN;
    const owners = hero > 0 ? Cards.heroes.get(hero) || [] : [];
    return owners.length === 1 ? Aliases.map.get(owners[0]) || "" : "";
  }

  // ------------------------------------------------------------------ markers

  function markersRoot(now) {
    if (valid(Markers.root)) return Markers.root;
    Markers.entries = new Map();
    if (now < Markers.retryAt) return null;
    const found = attrs.root().FindChildTraverse("unit_indicators_v2");
    Markers.root = valid(found) ? found : null;
    if (!Markers.root) Markers.retryAt = now + FIND_RETRY_MS;
    return Markers.root;
  }

  function renderMarkers(now) {
    if (!Aliases.count && !Markers.replaced) return;
    const root = markersRoot(now);
    if (!root) return;
    const seen = new Map();
    let replaced = 0;
    for (const entry of root.Children()) {
      let info = Markers.entries.get(entry);
      if (info === undefined) {
        info = null;
        if (entry.BHasClass("PlayerEntry")) {
          const holder = entry.FindChildTraverse("PlayerName");
          const label = holder ? holder.Children()[0] : null;
          if (!label) continue; // the native name Label is not made yet: look again next tick
          info = { label: label, hero: entry.FindChildTraverse("HeroIcon"), real: "", shown: null, alias: "", sig: "", at: 0 };
        }
      }
      seen.set(entry, info);
      if (!info) continue;
      const text = info.label.text;
      if (text !== info.shown) {
        info.real = typeof text === "string" ? text : "";
        info.shown = info.real;
        info.sig = "";
      }
      if (info.sig !== Aliases.sig || now - info.at >= RESOLVE_MS) {
        info.alias = Aliases.count ? aliasFor(info.real, info.hero) : "";
        info.sig = Aliases.sig;
        info.at = now;
      }
      const want = info.alias || info.real;
      if (want !== info.shown) {
        info.label.text = want;
        info.shown = want;
      }
      if (info.shown !== info.real) replaced++;
    }
    Markers.entries = seen;
    Markers.replaced = replaced;
  }

  // ------------------------------------------------------------------ kill feed

  const boundText = (label, bind) => {
    const text = label.text;
    return typeof text === "string" && text !== bind ? text : "";
  };

  // The row's two names, or null for other rows (team events) and rows not built yet.
  function feedRowNames(row) {
    const names = [];
    for (const [cls, bind, image] of FEED_LABELS) {
      const label = row.FindChildrenWithClassTraverse(cls)[0];
      if (!label) return null;
      names.push({ label: label, bind: bind, hero: row.FindChildTraverse(image), real: "", hidden: null, alias: "", sig: "", shown: "" });
    }
    return names;
  }

  function renderFeedName(row, name) {
    const real = boundText(name.hidden || name.label, name.bind);
    if (real !== name.real) {
      name.real = real;
      name.sig = "";
    }
    if (name.sig !== Aliases.sig) {
      name.alias = Aliases.count && real ? aliasFor(real, name.hero) : "";
      name.sig = Aliases.sig;
    }
    if (name.alias) {
      if (!name.hidden) {
        name.hidden = $.CreatePanel("Label", row, "", { text: name.bind, hittest: "false" });
        name.hidden.style.width = "0px";
        name.hidden.style.height = "0px";
        name.hidden.style.opacity = "0";
      }
      if (name.shown !== name.alias) {
        name.label.text = name.alias;
        name.shown = name.alias;
      }
      return true;
    }
    if (name.shown) {
      name.label.text = name.bind;
      name.shown = "";
    }
    return false;
  }

  function feedPanel(now) {
    if (valid(Feed.panel)) return Feed.panel;
    Feed.rows = new Map();
    if (now < Feed.retryAt) return null;
    const found = attrs.root().FindChildTraverse("EventFeed");
    Feed.panel = valid(found) ? found : null;
    if (!Feed.panel) Feed.retryAt = now + FIND_RETRY_MS;
    return Feed.panel;
  }

  function renderFeed(now) {
    if (!Aliases.count && !Feed.replaced) return;
    const feed = feedPanel(now);
    if (!feed) return;
    const rows = feed.Children();
    const seen = new Map();
    let replaced = 0;
    for (const row of rows) {
      let names = Feed.rows.get(row);
      if (!names) names = feedRowNames(row);
      if (!names) continue;
      seen.set(row, names);
      for (const name of names) if (renderFeedName(row, name)) replaced++;
    }
    Feed.rows = seen;
    Feed.count = rows.length;
    Feed.replaced = replaced;
    if (Aliases.count && !Feed.watching) {
      Feed.watching = true;
      const gen = ++Feed.gen;
      $.Schedule(FEED_WATCH_S, () => watchFeed(gen));
    }
  }

  // Between ticks, a new row (the child count moved) gets its names at once.
  function watchFeed(gen) {
    if (stopped || gen !== Feed.gen || !Aliases.count) {
      if (gen === Feed.gen) Feed.watching = false;
      return;
    }
    // No validity call at this rate: the tick re-finds a rebuilt feed; a deleted panel throws here.
    try {
      if (Feed.panel && Feed.panel.GetChildCount() !== Feed.count) {
        refreshCards(Date.now());
        renderFeed(Date.now());
      }
    } catch (e) {
      Feed.panel = null;
    }
    $.Schedule(FEED_WATCH_S, () => watchFeed(gen));
  }

  // ------------------------------------------------------------------ loop

  function restoreAll() {
    for (const info of Markers.entries.values()) {
      if (info && info.shown !== info.real && valid(info.label)) info.label.text = info.real;
      if (info) info.shown = info.real;
    }
    Markers.replaced = 0;
    for (const names of Feed.rows.values()) {
      for (const name of names) {
        if (name.shown && valid(name.label)) name.label.text = name.bind;
        name.shown = "";
      }
    }
    Feed.replaced = 0;
    Feed.gen++;
    Feed.watching = false;
  }

  function tick() {
    if (stopped) return;
    $.Schedule(TICK_SEC, tick);
    try {
      refreshAliases();
      const now = Date.now();
      if (Aliases.count) refreshCards(now);
      renderMarkers(now);
      renderFeed(now);
    } catch (e) {
      logOnce("tick error", e);
    }
  }

  context.DLFNamesStop = () => {
    stopped = true;
    try {
      restoreAll();
    } catch (e) {}
  };

  tick();
})();
