// DLF broadcast editor in the Escape menu, one tab strip and seven pages: MATCH (season and match
// numbers, series format, series scores, hero bans per team, 2 or 3 by the BANS switch), TEAMS (names, logos: web image URL
// and size), PLAYERS (session-only and per-account name aliases for the banner), SOUL GRAPH (the
// top-bar soul lead graph: show time, mark interval, size, offsets, line colour, area fill), STYLE
// (banner text font, size, offsets, spacing per section), SHARE / SAVE (a code holding the whole
// save plus this session's player names, for another PC; RESET TO DEFAULTS and FORGET SAVE) and DEV
// (top-bar debuff icons: on/off, world-bar poll interval, status log). Every edit is published at
// once on the HUD root attribute $.DLFState.ATTR (the banner reads it each second) and saved on this
// PC through the hpv2-store /dlf/ page (fragment in, HTMLTitle out; one key, hantu.dlf.v1/match).
// The banner publishes the live roster the rows show on $.DLFState.ROSTER_ATTR. When the editor opens,
// the menu learns each player's Steam account the way ShowRank does: it activates the player's row
// in the stock PLAYERS list, which opens that player's profile card, and reads the card's
// {i:r:account_id}. Rows are sorted by account; an alias for a player with an account is saved in
// state.aliases and follows the player; players without one (bots) get a session alias by slot.
(() => {
  "use strict";

  const TAG = "[DLF-MENU]";
  const STORE_URL = "https://hantu-raya.github.io/hpv2-store/dlf/";
  const STORE_PREFIX = "DLFS1:";
  const STORE_VERSION = 1;
  const RECORD_PREFIX = "DLFS1.";
  const SCHEMA = 1;
  // Records up to READ_LIMIT are read; writes stop at the page's advertised capacity (ready reply m,
  // absent = the original page's 1024). A record over it is saved without the logo URLs.
  const READ_LIMIT = 4096;
  const LEGACY_CAPACITY = 1024;
  const LOGO_STEP = 10;
  const REPLY_TIMEOUT_S = 5;
  // A lost or late page is asked again (Observer HUD, live 2026-10-23: the hello gave up for good after
  // 30 s, and fragment-only URLs never reload a page whose first load was lost).
  const HELLO_RETRY_S = 2;
  const SLOW_RETRY_S = 5; // after READY_TIMEOUT_MS
  const READY_TIMEOUT_MS = 30000; // then the status says session only, while the page is still asked
  const RETRY_WINDOW_MS = 180000; // then the page is asked again only when the editor opens
  const FIRST_RELOAD_MS = 6000; // a lost load is reloaded after this, then after twice the last gap
  const MAX_RELOAD_GAP_MS = 60000;
  const SAVE_DELAY_S = 1.5;
  const SAVE_RETRY_S = [2, 4, 8];
  const BOOT_RETRY_S = 0.5;
  const FORGET_CONFIRM_S = 3; // FORGET SAVE needs a second click within this
  const RESET_CONFIRM_S = 4; // RESET ALL and RESET <page> act on a second press within this
  const SIDES = [["amber", "Amber", "AMBER"], ["sapphire", "Sapphire", "SAPPHIRE"]];
  const S = $.DLFState;

  const context = $.GetContextPanel();
  if (typeof context.DLFMenuStop === "function") context.DLFMenuStop();
  let stopped = false;
  const handles = new Set();
  const alive = () => !stopped && valid(context);

  const valid = S.valid;
  const attrs = S.hudAttrs(context);
  function schedule(delay, fn) {
    const handle = $.Schedule(delay, () => {
      handles.delete(handle);
      if (alive()) fn();
    });
    handles.add(handle);
    return handle;
  }
  function cancel(handle) {
    if (handle !== null && handles.has(handle)) {
      handles.delete(handle);
      try { $.CancelScheduled(handle); } catch (e) {}
    }
    return null;
  }
  context.DLFMenuStop = () => {
    stopped = true;
    for (const handle of handles) {
      try { $.CancelScheduled(handle); } catch (e) {}
    }
    handles.clear();
  };

  // ------------------------------------------------------------------ state

  const DEFAULTS = S.defaults();
  const HEROES = Array.isArray(typeof DLF_HEROES !== "undefined" ? DLF_HEROES : null) ? DLF_HEROES : [];
  const HERO_NAMES = new Map(HEROES.map(([id, name]) => [id, name]));
  let state = DEFAULTS;
  let picking = null; // { team, slot } while the hero grid is open
  let names = S.normalizeNames(null); // session-only aliases
  let roster = { amber: [], sapphire: [] }; // live game names from the banner
  const entryOwner = new Map(); // alias entry -> the player key its text was synced for
  let accounts = {}; // game name -> Steam account id ($.DLFState.ACCOUNTS_ATTR)
  const noAccount = new Set(); // names whose row opened no profile card this session (bots)
  const rows = { amber: [], sapphire: [] }; // editor rows: { game, slot, account }, sorted by account
  let probeGen = 0;
  let styleSection = "team"; // the STYLE tab being edited (UI only)
  let page = "Match"; // the editor page showing (UI only; a reloaded layout starts on MATCH)
  let logoStatus = {}; // { amber/sapphire: "default" | "loading" | "loaded" | "failed" } from the banner
  const logoNote = {}; // per team: "INVALID URL" after a rejected entry, until the next commit
  const ROSTER_TICK_S = 1;
  // Account probe (user 2026-10-24: faster). Polls instead of fixed waits: the list and each opened card
  // are looked at every PROBE_POLL_S and used the moment they are there. A row whose card does not come
  // (a bot) is given up after 5 x the slowest card seen so far, clamped to PROBE_WAIT_S; before any card
  // is seen that is the 1 s the old fixed steps allowed.
  const PROBE_POLL_S = 0.03;
  const PROBE_LIST_MAX_S = 1.5;
  const PROBE_WAIT_S = [0.3, 1.0];

  // Unknown hero IDs (a hero removed by a patch) become empty slots.
  function knownBans(next) {
    for (const [team] of SIDES) next[team].bans = next[team].bans.map((id) => HERO_NAMES.has(id) ? id : 0);
    return next;
  }

  function publish() {
    try {
      attrs.write(S.ATTR, state);
    } catch (e) {
      $.Msg(`${TAG} publish failed: ${e && e.message ? e.message : e}`);
    }
  }

  function setState(next, { save = true } = {}) {
    state = knownBans(S.normalize(next, DEFAULTS));
    publish();
    render();
    if (save) {
      // An edit or import made while a forget is queued or in flight is saved once the delete is answered.
      if (Store.forgetPending || Store.pendingOp === "d") Store.saveAfterForget = true;
      scheduleSave();
    }
  }

  // A deliberate edit made while the save is still loading wins over the stored record.
  function edit(mutate) {
    const next = JSON.parse(JSON.stringify(state));
    mutate(next);
    Store.adoptRead = false;
    setState(next);
  }

  // ------------------------------------------------------------------ UI

  const UI = {};
  const lastText = new Map();
  const lastHero = new Map();

  function setText(panel, text) {
    if (!valid(panel) || lastText.get(panel) === text) return;
    panel.text = text;
    lastText.set(panel, text);
  }
  function setHero(image, id) {
    if (!valid(image) || lastHero.get(image) === id) return;
    if (id > 0) image.SetHeroID(id);
    lastHero.set(image, id);
  }
  function bind(panel, event, fn) {
    if (!valid(panel)) return;
    panel.SetPanelEvent(event, () => {
      if (alive()) fn();
    });
  }

  // STYLE steppers: [id part, style key].
  const STYLE_STEPPERS = [["Size", "size"], ["X", "x"], ["Y", "y"], ["Spacing", "spacing"]];
  const LOGO_STATUS_TEXT = { default: "TEAM EMBLEM", loading: "LOADING", loaded: "WEB LOGO", failed: "FAILED - SHOWING EMBLEM" };

  // Editor pages: the tab DLF<Page>Toggle shows DLF<Page>Panel while the context has DLF<Page>Open.
  const PAGES = ["Match", "Teams", "Players", "Graph", "Style", "Share", "Dev"];
  // GRAPH steppers: [id part, graph key]; each moves by its GRAPH_LIMITS step.
  const GRAPH_STEPPERS = [["Size", "size"], ["X", "x"], ["Y", "y"]];
  // Team column titles that also show the team's name (the TEAMS page has the name box itself).
  const TEAM_TITLES = ["Match", "Players"];

  function findUi() {
    const ids = ["DLFMenuButton", "DLFMenuRoot", "DLFMenuStatus", "DLFMenuClose", "DLFMenuReset", "DLFMenuForget",
      "DLFMenuForgetLabel", "DLFStore",
      "DLFSeasonDown", "DLFSeasonEntry", "DLFSeasonUp", "DLFMatchDown", "DLFMatchEntry", "DLFMatchUp",
      "DLFSeriesEntry", "DLFHeroPicker", "DLFPickerTitle", "DLFPickerNone", "DLFPickerCancel", "DLFHeroGrid",
      "DLFDebuffToggle", "DLFDebuffToggleLabel", "DLFPollDown", "DLFPollValue", "DLFPollUp",
      "DLFLogToggle", "DLFLogToggleLabel", "DLFStyleFont", "DLFStyleFontLabel", "DLFStyleReset",
      "DLFShareEntry", "DLFShareCopy", "DLFShareImport", "DLFShareStatus",
      "DLFGraphShowRow", "DLFGraphFirstRow", "DLFGraphEveryRow", "DLFGraphLineRow", "DLFGraphFill", "DLFGraphFillLabel", "DLFGraphReset",
      "DLFMenuResetLabel", "DLFMenuResetPage", "DLFMenuResetPageLabel", "DLFBuysRow",
      "DLFAutoSeries", "DLFAutoSeriesLabel", "DLFBanCount", "DLFBanCountLabel", "DLFCueBridgeRow", "DLFCueUrnRow", "DLFCueMidRow", "DLFCueRiftRow"];
    for (const name of PAGES) ids.push(`DLF${name}Toggle`, `DLF${name}Panel`);
    for (const section of S.STYLE_SECTIONS) ids.push(`DLFStyleTab_${section}`);
    for (const key of STYLE_STEPPERS) ids.push(`DLFStyle${key[0]}Down`, `DLFStyle${key[0]}Value`, `DLFStyle${key[0]}Up`);
    for (const key of GRAPH_STEPPERS) ids.push(`DLFGraph${key[0]}Down`, `DLFGraph${key[0]}Value`, `DLFGraph${key[0]}Up`);
    for (const [, side] of SIDES) {
      for (const name of TEAM_TITLES) ids.push(`DLF${side}${name}Title`);
      ids.push(`DLF${side}NameEntry`, `DLF${side}ScoreDown`, `DLF${side}ScoreValue`, `DLF${side}ScoreUp`,
        `DLF${side}LogoEntry`, `DLF${side}LogoDown`, `DLF${side}LogoScale`, `DLF${side}LogoUp`, `DLF${side}LogoStatus`);
      for (let slot = 0; slot < S.BAN_SLOTS; slot++) {
        ids.push(`DLF${side}Ban${slot}`, `DLF${side}Ban${slot}Image`, `DLF${side}Ban${slot}Label`);
      }
      for (let slot = 0; slot < S.PLAYER_SLOTS; slot++) {
        ids.push(`DLF${side}Player${slot}Row`, `DLF${side}Player${slot}Game`, `DLF${side}Player${slot}Entry`);
      }
    }
    for (const id of ids) {
      const panel = context.FindChildTraverse(id);
      if (!valid(panel)) return false;
      UI[id] = panel;
    }
    return true;
  }

  function render() {
    if (!valid(UI.DLFMenuRoot)) return;
    syncEntry(UI.DLFSeasonEntry, String(state.season));
    syncEntry(UI.DLFMatchEntry, String(state.match));
    syncEntry(UI.DLFSeriesEntry, state.seriesFormat);
    for (const [team, side, upper] of SIDES) {
      const details = state[team];
      for (const name of TEAM_TITLES) setText(UI[`DLF${side}${name}Title`], `${upper} - ${details.name}`);
      syncEntry(UI[`DLF${side}NameEntry`], details.name);
      setText(UI[`DLF${side}ScoreValue`], details.score === null ? "-" : String(details.score));
      syncEntry(UI[`DLF${side}LogoEntry`], details.logo.url);
      setText(UI[`DLF${side}LogoScale`], `${details.logo.scale}%`);
      details.bans.forEach((id, slot) => {
        const button = UI[`DLF${side}Ban${slot}`];
        // A slot past banCount collapses (its ban stays in the state).
        const shown = slot < state.banCount;
        if (button.visible !== shown) button.visible = shown;
        button.SetHasClass("Empty", !(id > 0));
        button.SetHasClass("Picking", !!picking && picking.team === team && picking.slot === slot);
        setHero(UI[`DLF${side}Ban${slot}Image`], id);
        setText(UI[`DLF${side}Ban${slot}Label`], id > 0 ? HERO_NAMES.get(id) || "" : "NO BAN");
      });
    }
    setText(UI.DLFDebuffToggleLabel, state.dev.debuffs ? "ON" : "OFF");
    UI.DLFDebuffToggle.SetHasClass("On", state.dev.debuffs);
    setText(UI.DLFPollValue, `${state.dev.debuffPollMs / 1000} s`);
    setText(UI.DLFLogToggleLabel, state.dev.logStatus ? "ON" : "OFF");
    UI.DLFLogToggle.SetHasClass("On", state.dev.logStatus);
    setText(UI.DLFAutoSeriesLabel, state.autoSeries ? "ON" : "OFF");
    UI.DLFAutoSeries.SetHasClass("On", state.autoSeries);
    setText(UI.DLFBanCountLabel, String(state.banCount));
    renderStyle();
    renderGraph();
    renderBuys();
    renderReset();
    renderLogoStatus();
    const taken = new Set(SIDES.flatMap(([team]) => state[team].bans).filter((id) => id > 0));
    for (const tile of UI.tiles || []) tile.panel.SetHasClass("Taken", taken.has(tile.id));
    renderPlayers();
  }

  function renderStyle() {
    const entry = state.style[styleSection];
    for (const section of S.STYLE_SECTIONS) UI[`DLFStyleTab_${section}`].SetHasClass("Selected", section === styleSection);
    setText(UI.DLFStyleFontLabel, S.FONTS[entry.font].label);
    for (const [part, key] of STYLE_STEPPERS) setText(UI[`DLFStyle${part}Value`], String(entry[key]));
  }

  function renderGraph() {
    const graph = state.graph;
    for (const choice of UI.graphChoices || []) choice.panel.SetHasClass("Selected", graph[choice.key] === choice.value);
    setText(UI.DLFGraphSizeValue, `${graph.size}%`);
    setText(UI.DLFGraphXValue, `${graph.x} px`);
    setText(UI.DLFGraphYValue, `${graph.y} px`);
    setText(UI.DLFGraphFillLabel, graph.fill ? "ON" : "OFF");
    UI.DLFGraphFill.SetHasClass("On", graph.fill);
  }

  function renderBuys() {
    for (const choice of UI.buysChoices || []) choice.panel.SetHasClass("Selected", state.buys === choice.value);
    for (const choice of UI.cueChoices || []) choice.panel.SetHasClass("Selected", state.cues[choice.kind] === choice.value);
  }

  function renderLogoStatus() {
    for (const [team, side] of SIDES) {
      const status = logoStatus[team] || (state[team].logo.url ? "loading" : "default");
      const label = UI[`DLF${side}LogoStatus`];
      setText(label, logoNote[team] || LOGO_STATUS_TEXT[status] || "");
      label.SetHasClass("Failed", !!logoNote[team] || status === "failed");
    }
  }

  function readLogoStatus() {
    const parsed = attrs.changed(S.LOGO_STATUS_ATTR);
    if (parsed === undefined) return false;
    logoStatus = {};
    for (const [team] of SIDES) {
      const value = parsed ? parsed[team] : null;
      if (typeof value === "string" && LOGO_STATUS_TEXT[value]) logoStatus[team] = value;
    }
    return true;
  }

  // A team's players sorted by Steam account (players without one after, in top-bar order).
  function sortRows() {
    for (const [team] of SIDES) {
      rows[team] = roster[team].map((game, slot) => ({ game, slot, account: game ? accounts[game] || "" : "" }))
        .filter((player) => player.game)
        .sort((a, b) => (a.account ? 0 : 1) - (b.account ? 0 : 1) ||
          (a.account && b.account ? Number(a.account) - Number(b.account) : a.slot - b.slot));
    }
  }

  // Who an entry's text belongs to: the account, or for a player without one the slot and name.
  const playerKey = (player) => !player ? "" : player.account ? `a:${player.account}` : `s:${player.slot}:${player.game}`;

  // One row per player: the game name and account, and the alias entry (unused rows are disabled).
  function renderPlayers() {
    sortRows();
    for (const [team, side] of SIDES) {
      for (let row = 0; row < S.PLAYER_SLOTS; row++) {
        const player = rows[team][row] || null;
        UI[`DLF${side}Player${row}Row`].SetHasClass("Empty", !player);
        setText(UI[`DLF${side}Player${row}Game`], !player ? "EMPTY SLOT" :
          player.account ? `${player.game} (${player.account})` : player.game);
        const entry = UI[`DLF${side}Player${row}Entry`];
        if (entry.enabled !== !!player) entry.enabled = !!player;
        // The player the entry's text belongs to: updated whenever the entry is synced (not mid-edit).
        if (syncEntry(entry, aliasOf(team, player))) entryOwner.set(entry, playerKey(player));
      }
    }
  }

  function aliasOf(team, player) {
    if (!player) return "";
    if (player.account) return state.aliases[player.account] || "";
    const alias = S.displayName(names, team, player.slot, player.game);
    return alias !== player.game ? alias : "";
  }

  function publishNames() {
    try {
      attrs.write(S.NAMES_ATTR, names);
    } catch (e) {
      $.Msg(`${TAG} names publish failed: ${e && e.message ? e.message : e}`);
    }
  }

  // An alias belongs to the row's player: saved by account when known, else a session alias for the
  // slot while it holds the same game name. Blank (or the game name) removes it.
  function commitAlias(team, row, entry) {
    const player = rows[team][row] || null;
    if (!player || !valid(entry)) return;
    // The row's player changed while this was typed: the draft was for someone else.
    if (entryOwner.has(entry) && entryOwner.get(entry) !== playerKey(player)) {
      entry.text = aliasOf(team, player);
      entryOwner.set(entry, playerKey(player));
      return;
    }
    const typed = S.cleanName(String(entry.text || ""), S.MAX_ALIAS);
    const alias = typed !== player.game ? typed : "";
    if (player.account) {
      edit((next) => {
        if (alias) next.aliases[player.account] = alias;
        else delete next.aliases[player.account];
      });
      return;
    }
    names = S.normalizeNames(Object.assign({}, names, {
      [team]: names[team].map((item, index) => index !== player.slot ? item : (alias ? { n: player.game, a: alias } : null))
    }));
    publishNames();
    renderPlayers();
  }

  // ------------------------------------------------------------------ Steam accounts

  // The account on a stock profile card: a hidden label bound to the card's {i:r:account_id}.
  function cardAccount(card) {
    let label = card.FindChildTraverse("DLFAccount");
    if (!valid(label)) {
      label = $.CreatePanel("Label", card, "DLFAccount", { text: "{i:r:account_id}", hittest: "false" });
      label.style.visibility = "collapse";
    }
    const text = String(label.text || "");
    return S.ACCOUNT.test(text) ? text : "";
  }

  // Profile cards. Cards open as context-menu popups: while waiting for one, the walk covers only the
  // deepest still-valid ancestor of the last card seen ("home"); the whole UI is walked when there is no
  // home and on every PROBE_FULL_EVERY-th look and the last one, so a card that opens elsewhere is still found.
  const PROBE_FULL_EVERY = 5;
  let cardHomes = [];
  function cardsUnder(top) {
    const cards = [];
    const walk = (panel, depth) => {
      if (depth > 40) return;
      if (panel.paneltype === "CitadelProfileCard") cards.push(panel);
      for (const child of panel.Children()) walk(child, depth + 1);
    };
    walk(top, 0);
    return cards;
  }
  function uiRoot() {
    let top = context;
    for (let depth = 0; depth < 40 && valid(top.GetParent()); depth++) top = top.GetParent();
    return top;
  }
  function profileCards(full) {
    const home = full ? null : cardHomes.find(valid);
    return cardsUnder(home || uiRoot());
  }
  function rememberHome(card) {
    const homes = [];
    for (let panel = card.GetParent(); valid(panel) && valid(panel.GetParent()) && homes.length < 40; panel = panel.GetParent()) homes.push(panel);
    cardHomes = homes; // deepest first; the UI root itself is not a home
  }

  function closeContextMenus() {
    try { $.DispatchEvent("DismissAllContextMenus"); } catch (e) {}
  }

  // Opens each unknown player's stock PLAYERS row in turn and reads the profile card it opens. A card
  // counts only when it is the one card whose account changed (ShowRank's direct witness) and that
  // account is not already another player's; a name two players share is never probed. Stops when the
  // editor closes.
  let slowestCardS = 0;
  function probeAccounts() {
    const gen = ++probeGen;
    const live = () => gen === probeGen && alive() && context.BHasClass("DLFMenuOpen");
    const tab = context.FindChildTraverse("PlayersTab");
    if (valid(tab)) {
      try { $.DispatchEvent("Activated", tab, "mouse"); } catch (e) {}
    }
    const entriesOf = () => {
      const list = context.FindChildTraverse("PlayersList");
      const entries = [];
      const walk = (panel, depth) => {
        if (depth > 12) return;
        if (panel.paneltype === "CitadelPlayersListEntry") entries.push(panel);
        else for (const child of panel.Children()) walk(child, depth + 1);
      };
      if (valid(list)) walk(list, 0);
      return entries;
    };
    const run = (entries) => {
      const named = entries.map((entry) => {
        const label = entry.FindChildrenWithClassTraverse("PlayerName")[0];
        return { entry, name: valid(label) ? S.cleanName(label.text, S.MAX_TEXT) : "" };
      });
      const count = new Map();
      for (const { name } of named) count.set(name, (count.get(name) || 0) + 1);
      const todo = named.filter(({ name }) => name && count.get(name) === 1 && !accounts[name] && !noAccount.has(name));
      const next = () => {
        if (!live()) return closeContextMenus();
        const item = todo.shift();
        if (!item) {
          closeContextMenus();
          return;
        }
        const main = item.entry.FindChildTraverse("MainContents");
        if (!valid(main)) return next();
        const before = new Map(profileCards(true).map((card) => [card, cardAccount(card)]));
        try {
          $.DispatchEvent("Activated", main, "mouse");
        } catch (e) {
          return next();
        }
        const wait = Math.min(PROBE_WAIT_S[1], Math.max(PROBE_WAIT_S[0], slowestCardS ? slowestCardS * 5 : PROBE_WAIT_S[1]));
        let waited = 0;
        let looks = 0;
        const look = () => {
          if (!live()) return closeContextMenus();
          waited += PROBE_POLL_S;
          const last = waited >= wait;
          const changed = profileCards(last || ++looks % PROBE_FULL_EVERY === 0).map((card) => [card, cardAccount(card)])
            .filter(([card, account]) => account && account !== before.get(card));
          const found = [...new Set(changed.map(([, account]) => account))];
          if (found.length === 1) {
            const owner = Object.keys(accounts).find((name) => accounts[name] === found[0]);
            if (owner && owner !== item.name) {
              noAccount.add(item.name); // a late card of another row: never pinned on this one
            } else {
              slowestCardS = Math.max(slowestCardS, waited);
              rememberHome(changed[0][0]);
              accounts = Object.assign({}, accounts, { [item.name]: found[0] });
              attrs.write(S.ACCOUNTS_ATTR, accounts);
              renderPlayers();
            }
          } else if (!last) {
            schedule(PROBE_POLL_S, look);
            return;
          } else {
            noAccount.add(item.name);
          }
          closeContextMenus();
          schedule(0, next);
        };
        schedule(PROBE_POLL_S, look);
      };
      next();
    };
    // The PLAYERS tab fills its list after activation: used as soon as it has rows.
    let listWaited = 0;
    const waitList = () => {
      if (!live()) return;
      const entries = entriesOf();
      listWaited += PROBE_POLL_S;
      if (!entries.length && listWaited < PROBE_LIST_MAX_S) return schedule(PROBE_POLL_S, waitList);
      run(entries);
    };
    schedule(PROBE_POLL_S, waitList);
  }

  function readRoster() {
    const parsed = attrs.changed(S.ROSTER_ATTR);
    if (parsed === undefined) return false;
    for (const [team] of SIDES) {
      const list = parsed && Array.isArray(parsed[team]) ? parsed[team] : [];
      roster[team] = [];
      for (let slot = 0; slot < S.PLAYER_SLOTS; slot++) {
        roster[team].push(typeof list[slot] === "string" ? list[slot].slice(0, S.MAX_TEXT) : "");
      }
    }
    return true;
  }

  // The rows follow the roster once a second while the editor is open; AUTO SERIES looks at the match end.
  function rosterTick() {
    if (context.BHasClass("DLFMenuOpen")) {
      if (readRoster()) {
        renderPlayers();
        // A new player joined: learn their account (players already known are skipped).
        const all = roster.amber.concat(roster.sapphire);
        if (all.some((game) => game && all.indexOf(game) === all.lastIndexOf(game) && !accounts[game] && !noAccount.has(game))) {
          probeAccounts();
        }
      }
      if (readLogoStatus()) renderLogoStatus();
    }
    try {
      seriesTick();
    } catch (e) {
      $.Msg(`${TAG} series check failed: ${e && e.message ? e.message : e}`);
    }
    schedule(ROSTER_TICK_S, rosterTick);
  }

  // AUTO SERIES (Observer HUD's awardSeries). The stock match-end screen (hud.xml #MatchEnd) names the
  // winner: client.dll 6819 sets Team1Victory when team 2 (Amber) won and Team2Victory otherwise, with
  // MatchFinished; an abandoned game gets MatchAbandoned instead (Observer HUD's static RE). The winner's
  // series score goes up once per map (the stock #TopBar is rebuilt on every map load, so a demo seek back
  // and forth keeps one point), only for a game seen ending while spectating: the screen must have been
  // seen hidden while spectating on that map first, because #Hud survives a map change and a screen still
  // showing the last result must not count again. Never past the wins the series format needs ("Best of 3":
  // 2) and never on a hidden score. Off by default; the score steppers still override. Not seen live in DLF.
  // The same private lobby (user 2026-11-06, on Observer HUD: game 2 of a series did not count): games
  // played one after another can keep #TopBar. Spectating live (no replay_playback), the end screen we
  // counted going away again starts the next game, whose result counts; a demo keeps one point per bar.
  const SPECTATOR_CLASSES = ["spec_mode", "TeamSpectator", "replay_playback"];
  const Series = { hud: null, bar: null, end: null, armed: null, awarded: null, told: null };
  function seriesTick() {
    if (!state.autoSeries) return;
    const root = attrs.root();
    if (!valid(Series.bar)) Series.bar = root.FindChildTraverse("TopBar");
    if (!valid(Series.hud)) Series.hud = root.FindChildTraverse("Hud");
    if (!valid(Series.end)) Series.end = root.FindChildTraverse("MatchEnd");
    const bar = Series.bar;
    const end = Series.end;
    if (!valid(bar) || !valid(Series.hud) || !valid(end)) return;
    if (!end.BHasClass("ShowMatchEnd")) {
      if (!SPECTATOR_CLASSES.some((cls) => Series.hud.BHasClass(cls))) return;
      Series.armed = bar;
      if (Series.awarded === bar && !Series.hud.BHasClass("replay_playback")) {
        Series.awarded = null;
        $.Msg(`${TAG} next game on the same map: its result will count`);
      }
      return;
    }
    if (Series.awarded === bar) return;
    if (!end.BHasClass("MatchFinished") || end.BHasClass("MatchAbandoned")) return;
    const team = end.BHasClass("Team1Victory") ? "amber" : end.BHasClass("Team2Victory") ? "sapphire" : "";
    if (!team) return;
    if (Series.armed !== bar) {
      if (Series.told !== bar) $.Msg(`${TAG} match end seen without the game before it: series not changed; set it in the editor`);
      Series.told = bar;
      return;
    }
    Series.awarded = bar;
    const score = state[team].score;
    if (score === null) {
      $.Msg(`${TAG} match end: ${team} wins; the score is hidden, series not changed`);
      return;
    }
    const wins = S.seriesWins(state.seriesFormat);
    const next = Math.min(score + 1, wins === null ? 99 : wins);
    $.Msg(`${TAG} match end: ${team} wins (series ${team} ${next})`);
    if (next !== score) edit((draft) => { draft[team].score = next; });
  }

  // Leave a focused entry alone so typing is never overwritten mid-edit; true when the entry holds text.
  function syncEntry(entry, text) {
    if (!valid(entry)) return false;
    try {
      if (entry.BHasKeyFocus && entry.BHasKeyFocus()) return false;
    } catch (e) {}
    if (entry.text !== text) entry.text = text;
    return true;
  }

  function buildHeroGrid() {
    UI.DLFHeroGrid.RemoveAndDeleteChildren(); // tiles of a previous script instance
    UI.tiles = [];
    for (const [id, name] of HEROES) {
      const tile = $.CreatePanel("Button", UI.DLFHeroGrid, `DLFHero${id}`, { class: "DLFHeroTile" });
      const image = $.CreatePanel("CitadelHeroImage", tile, "", {
        class: "DLFHeroTileImage", heroimagestyle: "small", scaling: "stretch-to-cover-preserve-aspect", hittest: "false"
      });
      image.SetHeroID(id);
      $.CreatePanel("Label", tile, "", { class: "DLFHeroTileName", text: name, hittest: "false" });
      bind(tile, "onactivate", () => pickHero(id));
      UI.tiles.push({ id, panel: tile });
    }
  }

  function openPicker(team, slot) {
    picking = { team, slot };
    const side = SIDES.find(([key]) => key === team);
    setText(UI.DLFPickerTitle, `BAN ${slot + 1} FOR ${state[team].name || side[2]}`);
    context.AddClass("DLFPicking");
    render();
  }
  function closePicker() {
    picking = null;
    context.RemoveClass("DLFPicking");
    render();
  }
  // A hero can be banned once: picking it again moves it to this slot.
  function pickHero(id) {
    if (!picking) return;
    const { team, slot } = picking;
    edit((next) => {
      for (const [other] of SIDES) next[other].bans = next[other].bans.map((ban) => ban === id ? 0 : ban);
      next[team].bans[slot] = id;
    });
    closePicker();
  }

  function step(path, delta, max) {
    edit((next) => {
      const owner = path.length === 2 ? next[path[0]] : next;
      const key = path[path.length - 1];
      const current = owner[key] === null ? 0 : owner[key];
      owner[key] = Math.max(0, Math.min(max, current + delta));
    });
  }

  // The poll interval moves through S.DEBUFF_POLL_STEPS and stops at either end.
  function stepPoll(delta) {
    const steps = S.DEBUFF_POLL_STEPS;
    edit((next) => {
      const index = Math.max(0, Math.min(steps.length - 1, steps.indexOf(next.dev.debuffPollMs) + delta));
      next.dev.debuffPollMs = steps[index];
    });
  }

  // Style values move one pixel at a time inside the section's STYLE_LIMITS.
  function stepStyle(key, delta) {
    const [min, max] = S.STYLE_LIMITS[styleSection][key];
    edit((next) => {
      const entry = next.style[styleSection];
      entry[key] = Math.max(min, Math.min(max, entry[key] + delta));
    });
  }
  function cycleFont() {
    edit((next) => {
      const entry = next.style[styleSection];
      entry.font = S.FONT_KEYS[(S.FONT_KEYS.indexOf(entry.font) + 1) % S.FONT_KEYS.length];
    });
  }
  function selectStyle(section) {
    styleSection = section;
    renderStyle();
  }
  function stepLogo(team, delta) {
    const [min, max] = S.LOGO_SCALE;
    edit((next) => {
      next[team].logo.scale = Math.max(min, Math.min(max, next[team].logo.scale + delta));
    });
  }
  // A rejected URL keeps the current logo and says so; it is never truncated or logged.
  function commitLogo(team, entry) {
    if (!valid(entry)) return;
    const url = S.cleanUrl(String(entry.text || ""));
    if (url === null) {
      logoNote[team] = "INVALID URL (HTTP/HTTPS IMAGE)";
      renderLogoStatus();
      return;
    }
    delete logoNote[team];
    if (url === state[team].logo.url) {
      renderLogoStatus();
      return;
    }
    edit((next) => { next[team].logo.url = url; });
  }
  // One page shows at a time; the tab strip stays in place, so switching pages costs no mouse travel.
  function selectPage(name) {
    page = name;
    for (const other of PAGES) {
      context.SetHasClass(`DLF${other}Open`, other === page);
      UI[`DLF${other}Toggle`].SetHasClass("Selected", other === page);
    }
    setArmed(""); // a press armed on another page is not this page's
  }

  // ------------------------------------------------------------------ soul graph

  // Choice buttons come from the $.DLFState tables, so the menu never copies their numbers.
  const graphShowLabel = (seconds) => seconds === 0 ? "OFF" : seconds === -1 ? "ALWAYS" : `${seconds} S`;
  const graphEveryLabel = (seconds) => seconds % 60 === 0 ? `${seconds / 60} MIN` : `${seconds} S`;
  function buildGraphChoices() {
    UI.graphChoices = [];
    const build = (row, key, values, idOf, labelOf) => {
      row.RemoveAndDeleteChildren(); // buttons of a previous script instance
      values.forEach((value, index) => {
        const button = $.CreatePanel("Button", row, idOf(value, index), { class: "DLFChoice" });
        $.CreatePanel("Label", button, "", { hittest: "false" }).text = labelOf(value);
        bind(button, "onactivate", () => edit((next) => { next.graph[key] = value; }));
        UI.graphChoices.push({ key, value, panel: button });
      });
    };
    build(UI.DLFGraphShowRow, "show", S.GRAPH_SHOW, (value, index) => `DLFGraphShow${index}`, graphShowLabel);
    build(UI.DLFGraphFirstRow, "first", S.GRAPH_FIRST, (value, index) => `DLFGraphFirst${index}`, graphEveryLabel);
    build(UI.DLFGraphEveryRow, "every", S.GRAPH_EVERY, (value, index) => `DLFGraphEvery${index}`, graphEveryLabel);
    build(UI.DLFGraphLineRow, "line", S.GRAPH_LINES, (value) => `DLFGraphLine_${value}`, (value) => String(value).toUpperCase());
  }
  // Size, X and Y move by their GRAPH_LIMITS step and stop at the limits.
  function stepGraph(key, delta) {
    const [min, max, size] = S.GRAPH_LIMITS[key];
    edit((next) => {
      next.graph[key] = Math.max(min, Math.min(max, next.graph[key] + delta * size));
    });
  }

  // Purchase notice seconds (DEV page): one choice button per S.BUYS_SHOW value.
  function buildBuysChoices() {
    UI.buysChoices = [];
    UI.DLFBuysRow.RemoveAndDeleteChildren(); // buttons of a previous script instance
    S.BUYS_SHOW.forEach((value, index) => {
      const button = $.CreatePanel("Button", UI.DLFBuysRow, `DLFBuys${index}`, { class: "DLFChoice" });
      $.CreatePanel("Label", button, "", { hittest: "false" }).text = value === 0 ? "OFF" : `${value} S`;
      bind(button, "onactivate", () => edit((next) => { next.buys = value; }));
      UI.buysChoices.push({ value, panel: button });
    });
  }

  // Objective timer show windows (SOUL GRAPH page): one choice button per S.CUE_SHOW value (the rift:
  // S.RIFT_SHOW, shown as OFF / ON).
  const CUE_ROWS = [["bridge", "DLFCueBridgeRow"], ["urn", "DLFCueUrnRow"], ["mid", "DLFCueMidRow"], ["rift", "DLFCueRiftRow"]];
  function buildCueChoices() {
    UI.cueChoices = [];
    for (const [kind, rowId] of CUE_ROWS) {
      const row = UI[rowId];
      row.RemoveAndDeleteChildren(); // buttons of a previous script instance
      (kind === "rift" ? S.RIFT_SHOW : S.CUE_SHOW).forEach((value, index) => {
        const button = $.CreatePanel("Button", row, `${rowId}${index}`, { class: "DLFChoice" });
        const label = value === 0 ? "OFF" : value === -1 ? (kind === "rift" ? "ON" : "ALWAYS") : `${value} S`;
        $.CreatePanel("Label", button, "", { hittest: "false" }).text = label;
        bind(button, "onactivate", () => edit((next) => { next.cues[kind] = value; }));
        UI.cueChoices.push({ kind: kind, value: value, panel: button });
      });
    }
  }

  // ------------------------------------------------------------------ share codes

  function setShareStatus(text) {
    setText(UI.DLFShareStatus, text);
  }
  // The code goes in the box and, through the box, on the clipboard: CopyStringToClipboard throws in
  // this game (live 2026-10-17, HP Colors v3), TextEntryCopyToClipboard copies a selected entry.
  function copyCode() {
    const entry = UI.DLFShareEntry;
    entry.text = S.encodeShare(state, names);
    let copied = false;
    try {
      entry.SetFocus();
      entry.SelectAll();
      copied = $.DispatchEvent("TextEntryCopyToClipboard", entry) !== false;
    } catch (e) {}
    try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
    setShareStatus(copied ? "CODE COPIED" : "CODE IN THE BOX - SELECT IT AND PRESS CTRL+C");
  }
  // A valid code replaces the whole state (fields it lacks take the defaults) and this session's
  // names, and is saved; any other text changes nothing. An empty box pastes the clipboard first.
  function importCode() {
    const entry = UI.DLFShareEntry;
    let text = String(entry.text || "").trim();
    if (!text) {
      try { $.DispatchEvent("TextEntryInsertFromClipboard", entry); } catch (e) {}
      text = String(entry.text || "").trim();
    }
    if (!text) {
      setShareStatus("PASTE A CODE FIRST");
      return;
    }
    const result = S.decodeShare(text);
    if (result.kind !== "valid") {
      setShareStatus(result.kind === "unsupported" ? "CODE FROM A NEWER VERSION - UPDATE THE MOD" : "NOT A DLF CODE");
      return;
    }
    if (Store.phase === "blocked") {
      Store.phase = "ready";
      Store.savedRecord = "";
    }
    closePicker();
    names = S.normalizeNames(result.names);
    publishNames();
    Store.adoptRead = false; // a deliberate edit, like edit()
    // This PC's DEV settings (debuff icons, poll, status log) stay: they describe the PC, not the broadcast.
    const incoming = result.state && typeof result.state === "object" ? result.state : {};
    setState(Object.assign({}, incoming, { dev: state.dev }));
    setShareStatus("IMPORTED");
  }

  // Season or match typed as a whole number 0-MAX_NUMBER (a leading # is allowed, as on the banner);
  // anything else puts the current number back.
  function commitNumber(key, entry) {
    if (!valid(entry)) return;
    const match = /^#?\s*(\d{1,4})$/.exec(String(entry.text || "").trim());
    const value = match ? Number(match[1]) : -1;
    if (value >= 0 && value <= S.MAX_NUMBER && value !== state[key]) edit((next) => { next[key] = value; });
    entry.text = String(state[key]);
  }

  function commitEntry(entry, apply) {
    if (!valid(entry)) return;
    const text = String(entry.text || "").replace(/\s+/g, " ").trim().slice(0, S.MAX_TEXT);
    edit((next) => apply(next, text));
  }

  function bindEntry(entry, apply, current) {
    const release = () => {
      try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
    };
    bind(entry, "ontextentrysubmit", () => {
      commitEntry(entry, apply);
      release();
    });
    bind(entry, "onblur", () => commitEntry(entry, apply));
    bind(entry, "oncancel", () => {
      entry.text = current();
      release();
    });
  }

  function bindControls() {
    bind(UI.DLFMenuButton, "onactivate", () => {
      context.ToggleClass("DLFMenuOpen");
      if (context.BHasClass("DLFMenuOpen")) {
        // The save page gave up while unanswered: opening the editor asks it again.
        if (Store.phase === "unavailable" && Store.offline) startHello();
        probeAccounts();
      }
      if (readRoster()) renderPlayers();
      if (readLogoStatus()) renderLogoStatus();
    });
    bind(UI.DLFMenuClose, "onactivate", closeMenu);
    bind(UI.DLFMenuReset, "onactivate", () => pressReset("all"));
    bind(UI.DLFMenuResetPage, "onactivate", () => pressReset(`page:${page}`));
    bind(UI.DLFMenuForget, "onactivate", armForget);
    for (const name of PAGES) bind(UI[`DLF${name}Toggle`], "onactivate", () => selectPage(name));
    bind(UI.DLFShareCopy, "onactivate", copyCode);
    bind(UI.DLFShareImport, "onactivate", importCode);
    bind(UI.DLFShareEntry, "ontextentrysubmit", importCode);
    for (const section of S.STYLE_SECTIONS) bind(UI[`DLFStyleTab_${section}`], "onactivate", () => selectStyle(section));
    bind(UI.DLFStyleFont, "onactivate", cycleFont);
    for (const [part, key] of STYLE_STEPPERS) {
      bind(UI[`DLFStyle${part}Down`], "onactivate", () => stepStyle(key, -1));
      bind(UI[`DLFStyle${part}Up`], "onactivate", () => stepStyle(key, 1));
    }
    bind(UI.DLFStyleReset, "onactivate", () => edit((next) => {
      next.style[styleSection] = Object.assign({}, S.STYLE_DEFAULTS[styleSection]);
    }));
    for (const [part, key] of GRAPH_STEPPERS) {
      bind(UI[`DLFGraph${part}Down`], "onactivate", () => stepGraph(key, -1));
      bind(UI[`DLFGraph${part}Up`], "onactivate", () => stepGraph(key, 1));
    }
    bind(UI.DLFGraphFill, "onactivate", () => edit((next) => { next.graph.fill = !next.graph.fill; }));
    bind(UI.DLFGraphReset, "onactivate", () => edit((next) => { next.graph = Object.assign({}, S.GRAPH_DEFAULTS); }));
    bind(UI.DLFDebuffToggle, "onactivate", () => edit((next) => { next.dev.debuffs = !next.dev.debuffs; }));
    bind(UI.DLFPollDown, "onactivate", () => stepPoll(-1));
    bind(UI.DLFPollUp, "onactivate", () => stepPoll(1));
    bind(UI.DLFLogToggle, "onactivate", () => edit((next) => { next.dev.logStatus = !next.dev.logStatus; }));
    bind(UI.DLFAutoSeries, "onactivate", () => edit((next) => { next.autoSeries = !next.autoSeries; }));
    // BANS flips between 3 and 2 per team (a third ban is kept while hidden).
    bind(UI.DLFBanCount, "onactivate", () => edit((next) => { next.banCount = next.banCount === 3 ? 2 : 3; }));
    for (const key of ["season", "match"]) {
      const entry = UI[key === "season" ? "DLFSeasonEntry" : "DLFMatchEntry"];
      const release = () => {
        try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
      };
      bind(entry, "ontextentrysubmit", () => {
        commitNumber(key, entry);
        release();
      });
      bind(entry, "onblur", () => commitNumber(key, entry));
      bind(entry, "oncancel", () => {
        entry.text = String(state[key]);
        release();
      });
    }
    bind(UI.DLFSeasonDown, "onactivate", () => step(["season"], -1, S.MAX_NUMBER));
    bind(UI.DLFSeasonUp, "onactivate", () => step(["season"], 1, S.MAX_NUMBER));
    bind(UI.DLFMatchDown, "onactivate", () => step(["match"], -1, S.MAX_NUMBER));
    bind(UI.DLFMatchUp, "onactivate", () => step(["match"], 1, S.MAX_NUMBER));
    bindEntry(UI.DLFSeriesEntry, (next, text) => { next.seriesFormat = text; }, () => state.seriesFormat);
    for (const [team, side] of SIDES) {
      bind(UI[`DLF${side}ScoreDown`], "onactivate", () => step([team, "score"], -1, S.MAX_SCORE));
      bind(UI[`DLF${side}ScoreUp`], "onactivate", () => step([team, "score"], 1, S.MAX_SCORE));
      // An empty name falls back to the default team name.
      bindEntry(UI[`DLF${side}NameEntry`], (next, text) => { next[team].name = text; }, () => state[team].name);
      bind(UI[`DLF${side}LogoDown`], "onactivate", () => stepLogo(team, -LOGO_STEP));
      bind(UI[`DLF${side}LogoUp`], "onactivate", () => stepLogo(team, LOGO_STEP));
      const logoEntry = UI[`DLF${side}LogoEntry`];
      bind(logoEntry, "ontextentrysubmit", () => {
        commitLogo(team, logoEntry);
        try { $.DispatchEvent("DropInputFocus", logoEntry); } catch (e) {}
      });
      bind(logoEntry, "onblur", () => commitLogo(team, logoEntry));
      bind(logoEntry, "oncancel", () => {
        logoEntry.text = state[team].logo.url;
        delete logoNote[team];
        renderLogoStatus();
        try { $.DispatchEvent("DropInputFocus", logoEntry); } catch (e) {}
      });
      for (let slot = 0; slot < S.BAN_SLOTS; slot++) {
        bind(UI[`DLF${side}Ban${slot}`], "onactivate", () => openPicker(team, slot));
      }
      for (let slot = 0; slot < S.PLAYER_SLOTS; slot++) {
        const entry = UI[`DLF${side}Player${slot}Entry`];
        const release = () => {
          try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
        };
        bind(entry, "ontextentrysubmit", () => {
          commitAlias(team, slot, entry);
          release();
        });
        bind(entry, "onblur", () => commitAlias(team, slot, entry));
        bind(entry, "oncancel", () => {
          entry.text = aliasOf(team, rows[team][slot] || null);
          release();
        });
      }
    }
    bind(UI.DLFPickerNone, "onactivate", () => {
      if (!picking) return;
      const { team, slot } = picking;
      edit((next) => { next[team].bans[slot] = 0; });
      closePicker();
    });
    bind(UI.DLFPickerCancel, "onactivate", closePicker);
  }

  function closeMenu() {
    closePicker();
    setArmed("");
    context.RemoveClass("DLFMenuOpen");
  }

  // ESC, the stock Resume button and the dimmed background call this first: it closes the hero picker,
  // then the editor, and returns true while it consumed the press (the ESC menu then stays open).
  $.DLFMenuCancel = () => {
    if (!alive() || !context.BHasClass("DLFMenuOpen")) return false;
    if (picking) closePicker();
    else closeMenu();
    return true;
  };

  // ------------------------------------------------------------------ durable save

  // phase: idle -> hello -> read -> ready | blocked (unreadable save; RESET overwrites) | unavailable (session only)
  const Store = {
    panel: null, phase: "idle", seq: 0, helloId: "", startMs: 0, pendingId: "", pendingOp: "",
    helloHnd: null, timeoutHnd: null, saveHnd: null, readRetried: false, savedRecord: "", sentRecord: "",
    retry: 0, adoptRead: true, capacity: LEGACY_CAPACITY, logosDropped: false,
    reloadAt: 0, reloadGap: 0, offline: false, // offline: the page never answered; the editor asks again
    forgetPending: false, // delete once the page is ready or the write in flight is answered
    saveAfterForget: false // an edit or import made while the delete was queued or in flight (setState)
  };

  function setStatus(text) {
    setText(UI.DLFMenuStatus, text);
  }

  const checksum = S.checksum;
  function encodeState(value) {
    const body = JSON.stringify(Object.assign({ s: SCHEMA }, value));
    return RECORD_PREFIX + checksum(body) + "." + body;
  }
  // The record this state saves as: in full, or without the logo URLs (scales kept) when the full
  // record is over the page's capacity. record is null when even that is too long.
  function encode() {
    const full = encodeState(state);
    if (full.length <= Store.capacity) return { record: full, logosDropped: false };
    const stripped = JSON.parse(JSON.stringify(state));
    for (const [team] of SIDES) stripped[team].logo.url = "";
    const record = encodeState(stripped);
    return { record: record.length <= Store.capacity ? record : null, logosDropped: true };
  }
  function savedStatus() {
    return Store.logosDropped ? "SAVED - LOGO URLS THIS SESSION ONLY" : "SAVED";
  }
  function decode(record) {
    if (record === null || record === undefined) return { kind: "absent" };
    if (typeof record !== "string" || record.length > READ_LIMIT || record.slice(0, 6) !== RECORD_PREFIX ||
        record.charAt(14) !== "." || checksum(record.slice(15)) !== record.slice(6, 14)) return { kind: "corrupt" };
    let body = null;
    try { body = JSON.parse(record.slice(15)); } catch (e) { return { kind: "corrupt" }; }
    if (!body || typeof body !== "object") return { kind: "corrupt" };
    if (body.s !== SCHEMA) return { kind: Number.isInteger(body.s) && body.s > SCHEMA ? "unsupported" : "corrupt" };
    return { kind: "valid", state: body };
  }

  function send(message) {
    if (!alive() || !valid(Store.panel)) return false;
    try {
      Store.panel.SetURL(STORE_URL + "#" + encodeURIComponent(JSON.stringify(message)));
      return true;
    } catch (e) {
      return false;
    }
  }
  // A URL that only changes the fragment never reloads the page, so a lost load (an error page) would
  // never answer: leaving it for about:blank makes the next hello load the page afresh.
  function blank() {
    if (!alive() || !valid(Store.panel)) return false;
    try {
      Store.panel.SetURL("about:blank");
      return true;
    } catch (e) {
      return false;
    }
  }
  function setUnavailable(status, offline = false) {
    Store.phase = "unavailable";
    Store.offline = !!offline;
    Store.helloHnd = cancel(Store.helloHnd);
    Store.timeoutHnd = cancel(Store.timeoutHnd);
    Store.saveHnd = cancel(Store.saveHnd);
    Store.pendingId = "";
    Store.pendingOp = "";
    setStatus(status);
  }
  function startStore() {
    Store.panel = UI.DLFStore;
    try {
      $.RegisterEventHandler("HTMLTitle", Store.panel, onTitle);
    } catch (e) {
      setUnavailable("OFFLINE - SESSION ONLY", false);
      return;
    }
    startHello();
  }
  // Asks the page until it answers: every HELLO_RETRY_S, slower and with the status saying session
  // only after READY_TIMEOUT_MS, and gives up after RETRY_WINDOW_MS. The page is reloaded after
  // FIRST_RELOAD_MS and then at doubling gaps, so a slow load is not cut off every time.
  function startHello() {
    Store.helloHnd = cancel(Store.helloHnd);
    Store.timeoutHnd = cancel(Store.timeoutHnd);
    Store.phase = "hello";
    Store.offline = false;
    Store.pendingId = "";
    Store.pendingOp = "";
    Store.readRetried = false;
    Store.startMs = Date.now();
    Store.reloadAt = Store.startMs + FIRST_RELOAD_MS;
    Store.reloadGap = FIRST_RELOAD_MS;
    hello();
  }
  function hello() {
    Store.helloHnd = null;
    if (Store.phase !== "hello") return;
    const now = Date.now();
    const waited = now - Store.startMs;
    if (waited >= RETRY_WINDOW_MS) {
      setUnavailable("OFFLINE - SESSION ONLY", true);
      return;
    }
    const slow = waited >= READY_TIMEOUT_MS;
    if (slow) setStatus("OFFLINE - SESSION ONLY");
    let sent;
    if (now >= Store.reloadAt) {
      Store.reloadGap = Math.min(Store.reloadGap * 2, MAX_RELOAD_GAP_MS);
      Store.reloadAt = now + Store.reloadGap;
      sent = blank();
    } else {
      Store.helloId = "h" + ++Store.seq;
      sent = send({ i: Store.helloId, o: "hello" });
    }
    if (!sent) {
      setUnavailable("OFFLINE - SESSION ONLY", false);
      return;
    }
    Store.helloHnd = schedule(slow ? SLOW_RETRY_S : HELLO_RETRY_S, hello);
  }
  function request(op, message) {
    const id = op + ++Store.seq;
    message.i = id;
    message.o = op;
    Store.pendingId = id;
    Store.pendingOp = op;
    Store.timeoutHnd = schedule(REPLY_TIMEOUT_S, () => {
      Store.timeoutHnd = null;
      if (Store.pendingId === id) finish(null);
    });
    if (!send(message)) finish(null);
  }
  function finish(reply) {
    const op = Store.pendingOp;
    Store.pendingId = "";
    Store.pendingOp = "";
    Store.timeoutHnd = cancel(Store.timeoutHnd);
    if (op === "r") onRead(reply);
    else if (op === "w") onWriteAck(reply);
    else if (op === "d") onForgetAck(reply);
  }
  function onTitle(panelOrTitle, eventTitle) {
    if (!alive()) return;
    const title = arguments.length > 1 ? eventTitle : panelOrTitle;
    if (typeof title !== "string" || title.indexOf(STORE_PREFIX) !== 0) return;
    let reply = null;
    try { reply = JSON.parse(title.slice(STORE_PREFIX.length)); } catch (e) { return; }
    if (!reply || typeof reply !== "object") return;
    if (reply.o === "ready") {
      onReady(reply);
      return;
    }
    // Late, duplicate and foreign replies carry an id we are not waiting for.
    if (!Store.pendingId || reply.i !== Store.pendingId) return;
    finish(reply);
  }
  function onReady(reply) {
    if (Store.phase !== "hello" || reply.i !== Store.helloId) return;
    if (typeof reply.h !== "string" || reply.h.split("#")[0] !== STORE_URL) return;
    Store.helloHnd = cancel(Store.helloHnd);
    if (reply.v !== STORE_VERSION || reply.ok !== true) {
      setUnavailable("SAVE PAGE OUTDATED - SESSION ONLY");
      return;
    }
    Store.capacity = Number.isInteger(reply.m) && reply.m >= LEGACY_CAPACITY && reply.m <= READ_LIMIT ? reply.m : LEGACY_CAPACITY;
    Store.phase = "read";
    request("r", {});
  }
  function onRead(reply) {
    if (Store.phase !== "read") return;
    if (!reply || reply.ok !== true) {
      if (!Store.readRetried) {
        Store.readRetried = true;
        request("r", {});
      } else {
        setUnavailable("OFFLINE - SESSION ONLY", true);
      }
      return;
    }
    if (Store.forgetPending) {
      Store.forgetPending = false;
      Store.phase = "ready";
      request("d", {});
      return;
    }
    const stored = reply.x === 1 ? reply.v : null;
    const result = decode(stored);
    if (result.kind === "valid") {
      Store.savedRecord = stored;
      Store.phase = "ready";
      // After an ESC layout reload the root attribute already holds this process's latest state.
      if (Store.adoptRead) setState(result.state, { save: false });
      setStatus("SAVED");
      scheduleSave();
    } else if (result.kind === "absent") {
      Store.phase = "ready";
      setStatus("DEFAULTS");
      scheduleSave();
    } else {
      Store.phase = "blocked";
      setStatus(result.kind === "unsupported" ? "NEWER SAVE - RESET TO OVERWRITE" : "SAVE DAMAGED - RESET TO REPAIR");
    }
  }
  function scheduleSave() {
    if (Store.phase === "ready" && Store.saveHnd === null) Store.saveHnd = schedule(SAVE_DELAY_S, flushSave);
  }
  // One write in flight; edits made meanwhile are picked up when its ack reschedules.
  function flushSave() {
    Store.saveHnd = cancel(Store.saveHnd);
    if (Store.phase !== "ready") return;
    if (Store.pendingOp) return; // a write reschedules from its reply; a delete from onForgetAck
    const { record, logosDropped } = encode();
    if (record === null) {
      // Not even the logo-free record fits: keep the session edits, write nothing, retry on the next edit.
      setStatus("TOO LONG TO SAVE - SESSION ONLY");
      return;
    }
    Store.logosDropped = logosDropped;
    if (record === Store.savedRecord) {
      setStatus(savedStatus());
      return;
    }
    Store.sentRecord = record;
    setStatus("SAVING");
    request("w", { v: record });
  }
  function onWriteAck(reply) {
    if (Store.phase !== "ready") return;
    if (Store.forgetPending) {
      Store.forgetPending = false;
      request("d", {});
      return;
    }
    if (reply && reply.ok === true) {
      Store.savedRecord = Store.sentRecord;
      Store.retry = 0;
      if (encode().record === Store.savedRecord) setStatus(savedStatus());
      else {
        setStatus("SAVING");
        scheduleSave();
      }
      return;
    }
    // A lost reply leaves the stored value unknown, so the retry writes even an unchanged record.
    Store.savedRecord = "";
    if (Store.retry < SAVE_RETRY_S.length) {
      Store.saveHnd = cancel(Store.saveHnd);
      Store.saveHnd = schedule(SAVE_RETRY_S[Store.retry++], flushSave);
      setStatus("SAVE RETRYING");
    } else {
      setUnavailable("SAVE FAILED - SESSION ONLY");
    }
  }

  // FORGET SAVE: deletes this PC's stored record (page op d) and starts from the defaults with no
  // account aliases or session names, so an import afterwards starts clean. Nothing is written until
  // the next edit. The first click only arms it; a second click within FORGET_CONFIRM_S forgets.
  let forgetArmed = null;
  function setForgetArmed(armed) {
    forgetArmed = cancel(forgetArmed);
    if (armed) forgetArmed = schedule(FORGET_CONFIRM_S, () => setForgetArmed(false));
    setText(UI.DLFMenuForgetLabel, armed ? "CLICK AGAIN TO FORGET" : "FORGET SAVE");
  }
  function armForget() {
    if (forgetArmed === null) {
      setForgetArmed(true);
      return;
    }
    setForgetArmed(false);
    forgetSave();
  }
  function forgetSave() {
    closePicker();
    names = S.normalizeNames(null);
    publishNames();
    Store.adoptRead = false;
    Store.saveHnd = cancel(Store.saveHnd);
    setState(DEFAULTS, { save: false });
    if (Store.phase === "unavailable") {
      setStatus("DEFAULTS - NO SAVE PAGE, NOTHING FORGOTTEN");
      return;
    }
    if (Store.phase === "blocked") Store.phase = "ready";
    setStatus("FORGETTING SAVE");
    if (Store.phase !== "ready" || Store.pendingOp === "w") Store.forgetPending = true; // still loading, or a write in flight
    else if (!Store.pendingOp) request("d", {});
  }
  function onForgetAck(reply) {
    if (reply && reply.ok === true) {
      Store.savedRecord = "";
      Store.logosDropped = false;
      setStatus("SAVE FORGOTTEN - DEFAULTS");
    } else {
      // The page Pages served before the delete op answers invalid_request.
      setStatus(reply && /invalid_request/.test(String(reply.e)) ? "FORGET NEEDS THE UPDATED SAVE PAGE" : "FORGET FAILED - TRY AGAIN");
    }
    if (Store.saveAfterForget) {
      Store.saveAfterForget = false;
      scheduleSave();
    }
  }

  function resetToDefaults() {
    if (Store.phase === "blocked") {
      Store.phase = "ready";
      Store.savedRecord = "";
    }
    closePicker();
    Store.adoptRead = false; // a deliberate edit, like edit()
    setState(DEFAULTS);
  }

  // RESET ALL and RESET <page> (header): the first press arms (the label asks again), a second press
  // within RESET_CONFIRM_S acts; a page change, closing the editor or the timeout disarms.
  const RESET_PAGES = { Match: "MATCH", Teams: "TEAMS", Players: "PLAYERS", Graph: "SOUL GRAPH", Style: "STYLE", Dev: "DEV" };
  let resetArmed = ""; // "" | "all" | "page:<Page>"
  let resetHandle = null;
  function renderReset() {
    if (!valid(UI.DLFMenuResetPage)) return;
    const label = RESET_PAGES[page];
    UI.DLFMenuResetPage.SetHasClass("DLFNoReset", !label);
    setText(UI.DLFMenuResetLabel, resetArmed === "all" ? "AGAIN TO RESET ALL" : "RESET ALL");
    setText(UI.DLFMenuResetPageLabel, !label ? "" : resetArmed === `page:${page}` ? `AGAIN TO RESET ${label}` : `RESET ${label}`);
  }
  function setArmed(kind) {
    resetHandle = cancel(resetHandle);
    resetArmed = kind;
    if (kind) resetHandle = schedule(RESET_CONFIRM_S, () => setArmed(""));
    renderReset();
  }
  function pressReset(kind) {
    if (resetArmed !== kind) {
      setArmed(kind);
      return;
    }
    setArmed("");
    if (kind === "all") resetToDefaults();
    else resetPage();
  }
  // The settings the shown page owns go back to the defaults (match.json's, like RESET ALL).
  function resetPage() {
    closePicker();
    if (page === "Players") names = S.normalizeNames(null);
    if (page === "Players") publishNames();
    const copy = (value) => JSON.parse(JSON.stringify(value));
    edit((next) => {
      if (page === "Match") {
        next.season = DEFAULTS.season;
        next.match = DEFAULTS.match;
        next.seriesFormat = DEFAULTS.seriesFormat;
        next.autoSeries = DEFAULTS.autoSeries;
        next.banCount = DEFAULTS.banCount;
        for (const [team] of SIDES) {
          next[team].score = DEFAULTS[team].score;
          next[team].bans = copy(DEFAULTS[team].bans);
        }
      } else if (page === "Teams") {
        for (const [team] of SIDES) {
          next[team].name = DEFAULTS[team].name;
          next[team].logo = copy(DEFAULTS[team].logo);
        }
      } else if (page === "Players") {
        next.aliases = {};
      } else if (page === "Graph") {
        next.graph = copy(DEFAULTS.graph);
        next.cues = copy(DEFAULTS.cues);
      } else if (page === "Style") {
        next.style = copy(DEFAULTS.style);
      } else if (page === "Dev") {
        next.dev = copy(DEFAULTS.dev);
        next.buys = DEFAULTS.buys;
      }
    });
  }

  // ------------------------------------------------------------------ post-game handoff

  // The post-game board (dlf_pg_board.js) runs in the dashboard, which cannot read the HUD root, so the
  // setup it shows (team names and logos, season and match, aliases by account) is handed over on
  // ClientUI_FireOutput every HANDOFF_S as "DLFM1:" + JSON { v: 1, at, state } (Observer HUD's match-card
  // handoff reached the post-game page live). Only normalized state is sent; logo URLs are never logged.
  const HANDOFF_S = 5;
  let handoffFailed = false;
  function handoffTick() {
    try {
      const team = (key) => ({ name: state[key].name, logo: state[key].logo });
      const body = { v: 1, at: Date.now(), state: { season: state.season, match: state.match, seriesFormat: state.seriesFormat,
        amber: team("amber"), sapphire: team("sapphire"), aliases: state.aliases } };
      $.DispatchEvent("ClientUI_FireOutput", `DLFM1:${JSON.stringify(body)}`);
    } catch (e) {
      if (!handoffFailed) $.Msg(`${TAG} post-game handoff failed: ${e && e.message ? e.message : e}`);
      handoffFailed = true;
    }
    schedule(HANDOFF_S, handoffTick);
  }

  // ------------------------------------------------------------------ boot

  function boot() {
    if (!findUi()) {
      schedule(BOOT_RETRY_S, boot);
      return;
    }
    // A reloaded ESC layout keeps this process's latest state from the HUD root.
    const carried = attrs.read(S.ATTR);
    Store.adoptRead = !carried;
    names = S.normalizeNames(attrs.read(S.NAMES_ATTR));
    accounts = S.normalizeAccounts(attrs.read(S.ACCOUNTS_ATTR));
    readRoster();
    buildHeroGrid();
    buildGraphChoices();
    buildBuysChoices();
    buildCueChoices();
    bindControls();
    selectPage(page);
    setState(carried || DEFAULTS, { save: false });
    rosterTick();
    startStore();
    handoffTick();
    $.Msg(`${TAG} ready (${HEROES.length} heroes, ${carried ? "carried state" : "loading save"})`);
  }

  boot();
})();
