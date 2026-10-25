// Observer HUD tournament setup editor (observer_hud/editor.xml, injected into the stock #EscapeMenu
// by oh_host.js, which calls $.OHMenuAttach with the injected panel). Every edit goes through
// $.OHHost.setState, so the bar and the aliases change at once; texts apply while typing, a logo URL
// on Enter or when the field loses focus. Pages in match-day order (design 18): MATCH (stage, format,
// both series wins capped by it, bans), TEAMS (name, tag, logo URL per side; team logo shape, size and
// Night Desk's name gap), PLAYERS (an alias per player listed on the stock top bar, and the status
// column's DEV settings: on/off, world-bar poll, status log), TOP BAR (the look, organiser name and logo,
// event title), NIGHT DESK (info card; dimmed with a Use Night Desk button while Base Game+ Names is
// picked), TIMERS (objective timers and the soul lead graph, both looks since design 19) and SHARE (a code
// carries the setup to another observer PC). Cards say BOTH LOOKS or NIGHT DESK ONLY; RESET <PAGE>
// resets exactly that page's settings. The window is settings-style (rail of pages, cards of label +
// control rows) but not full screen.
// Esc closes the whole Escape menu (the editor cannot hook the stock oncancel without replacing
// another mod's handler); edits are already applied, so nothing is lost.
(() => {
  "use strict";

  const TAG = "[OH-MENU]";
  const VERSION = "0.1.0";
  const AUTHOR_URL = "https://x.com/hanturaya";
  const DONATE_URL = "https://ko-fi.com/hantuaraya";
  // Local save: the hpv2-store /oh/v2/ page (store v2) keeps the setup record and the match cards in Steam's
  // CEF localStorage (fragment in, HTMLTitle out; keys hantu.observer_hud.v2/state and /matches). The v1
  // page /oh/ stays for released paks and is never written; its record is read once, by the v2 page, to
  // migrate. Same transport as DLF's /dlf/ page. A reply is cut at 4096 characters by the game, so the
  // record is read in pieces (r with s = offset).
  const STORE_URL = "https://hantu-raya.github.io/hpv2-store/oh/v2/";
  const STORE_PREFIX = "OHS2:";
  const STORE_VERSION = 2;
  const RECORD_PREFIX = "OHS1.";
  const RECORD_SCHEMA = 1;
  const READ_LIMIT = 8192;
  const HELLO_RETRY_S = 2;
  const SLOW_RETRY_S = 5; // after READY_TIMEOUT_MS
  const READY_TIMEOUT_MS = 30000; // then the footer says session only, while the page is still asked
  const RETRY_WINDOW_MS = 180000; // then the page is asked again only when the editor opens
  const FIRST_RELOAD_MS = 6000; // a lost load is reloaded after this, then after twice the last gap
  const MAX_RELOAD_GAP_MS = 60000;
  const REPLY_TIMEOUT_S = 5;
  const SAVE_DELAY_S = 1.5;
  const SAVE_RETRY_S = [2, 4, 8];
  // HP Colors v3's hosted supporter strip; ?v= asks for a fresh page on each open.
  const STRIP_URL = "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip-v3/?v=";
  const ROSTER_TICK_S = 1;
  const RESET_ARM_MS = 4000;
  const S = $.OHState;
  const valid = S.valid;
  const SIDES = [["amber", "Amber"], ["sapphire", "Sapphire"]];
  const PLAYER_ROWS = 6;
  const HEROES = typeof OH_HEROES === "object" && Array.isArray(OH_HEROES) ? OH_HEROES : [];
  const LOGO_TEXT = {
    none: "",
    loading: "Loading the logo...",
    loaded: "Logo loaded.",
    failed: "Could not load that image; the monogram stays."
  };
  const BAD_URL = "Not used: needs a plain http(s) address.";
  const LOOKS = [["names", "OHLookNames"], ["desk", "OHLookDesk"]];
  const GRAPH_CHOICES = [[0, "OHGraphOff"], [15, "OHGraph15"], [30, "OHGraph30"], [60, "OHGraph60"], [-1, "OHGraphAlways"]];
  const EVERY_CHOICES = [60, 120, 180, 300, 600].map((every) => [every, `OHGraphEvery${every}`]); // = OHState GRAPH_EVERY
  const GRAPH_STEPS = [["size", "Size"], ["x", "X"], ["y", "Y"]];
  const LOGO_SHAPE_CHOICES = [["circle", "OHLogoCircle"], ["square", "OHLogoSquare"]]; // = OHState LOGO_SHAPES
  const LOGO_STEPS = [["size", "Size"], ["gap", "Gap"]];
  // Objective timers: [state key, button id] for each pick; the rift has only OFF / ON (Always id).
  const CUE_LABELS = [[0, "Off"], [15, "15"], [30, "30"], [60, "60"], [120, "120"], [-1, "Always"]];
  const CUE_CHOICES = [];
  for (const [side, key] of [["Bridge", "bridge"], ["Urn", "urn"], ["Mid", "mid"]]) {
    for (const [show, suffix] of CUE_LABELS) CUE_CHOICES.push([key, show, `OHCue${side}${suffix}`]);
  }
  CUE_CHOICES.push(["rift", 0, "OHCueRiftOff"], ["rift", -1, "OHCueRiftAlways"]);
  // Purchase notices: seconds -> button (OHBuysOff, OHBuys3, ...).
  const BUYS_CHOICES = S.BUYS_SHOW.map((show) => [show, show ? `OHBuys${show}` : "OHBuysOff"]);
  // Settings-style pages: [name, title, description]; the rail button is #OHNav<name>, the root gets
  // OHShow<name>. RESET <title> resets the state keys in PAGE_RESET (SHARE has none: its button hides).
  const PAGES = [
    ["Match", "MATCH", "Changes between games: the stage, the series score and the bans. Edits show at once."],
    ["Teams", "TEAMS", "Each side's name, tag and logo, and how both logos are drawn."],
    ["Players", "PLAYERS", "An alias per player, by in-game name, and what shows under each card: purchases and the status column."],
    ["TopBar", "TOP BAR", "The top bar's look and the text in its centre and corner."],
    ["Desk", "NIGHT DESK", "Settings only the Night Desk look uses."],
    ["Timers", "TIMERS", "What shows under the clock: the objective timers and the soul lead graph."],
    ["Share", "SHARE", "Carry the whole setup to another observer PC."]
  ];
  const DESK_OFF_TEXT = "Only Night Desk uses these. Base Game+ Names is picked, so they are kept but not shown.";
  const LOOK_NOTE = {
    names: "Player names in a strip over the cards; team plates at the screen's top edge.",
    desk: "A 56 px band with corner text and the info card; tune the card on NIGHT DESK."
  };
  const LOGO_SIZE_NOTE = {
    names: "Base Game+ Names: the plate is the logo + 13 px tall",
    desk: "Night Desk uses 24-50 px; past 30 the cards spread"
  };
  const EVENT_NOTE = { names: "Shows in the centre only while the organiser name is empty.", desk: "Top-left corner of the band." };

  const context = $.GetContextPanel();
  if (typeof context.OHMenuStop === "function") context.OHMenuStop();
  let stopped = false;
  let root = null;
  let picking = null; // { team, slot } while the hero picker is open
  let resetArmed = { kind: "", at: 0 }; // "page" | "all": a second press within RESET_ARM_MS resets
  let page = "Match"; // kept across opens
  let stripOpens = 0;
  let rosterGen = 0; // the alias-row loop's generation (rosterTick)
  let rows = { amber: [], sapphire: [] }; // in-game names shown in the alias rows
  let rowsSig = ""; // roster and accounts the rows were drawn for (rosterTick)
  const logoError = { amber: false, sapphire: false, org: false }; // a rejected URL is kept in its box
  const UI = {};
  const alive = () => !stopped && valid(root);

  const heroName = (id) => {
    const hero = HEROES.find((entry) => entry[0] === id);
    return hero ? hero[1] : "";
  };

  function edit(mutate) {
    const next = S.clone($.OHHost.getState());
    mutate(next);
    $.OHHost.setState(next);
  }

  // ------------------------------------------------------------------ render

  // Leaves a focused entry alone so typing is never overwritten mid-edit.
  function syncEntry(entry, text) {
    if (!valid(entry)) return;
    try {
      if (entry.BHasKeyFocus && entry.BHasKeyFocus()) return;
    } catch (e) {}
    if (entry.text !== text) entry.text = text;
  }
  function setText(panel, text) {
    if (valid(panel) && panel.text !== text) panel.text = text;
  }

  // side is "Amber", "Sapphire" or "Org": the note under that logo URL field.
  function renderLogo(team, side) {
    const note = UI[`OH${side}LogoNote`];
    if (logoError[team]) {
      setText(note, BAD_URL);
      note.SetHasClass("OHError", true);
      return;
    }
    const status = $.OHHost.logoState(team);
    setText(note, LOGO_TEXT[status] || "");
    note.SetHasClass("OHError", status === "failed");
  }

  // The alias a card's name shows now: by its account when known, else the session alias, else the v1 one.
  function aliasOf(state, name) {
    const account = name ? $.OHHost.accountOf(name) : "";
    const player = account ? state.players[account] : undefined;
    return player ? player.a : (name && (state.pending[name] || state.legacy[name])) || "";
  }
  function renderPlayers() {
    const state = $.OHHost.getState();
    for (const [team, side] of SIDES) {
      for (let slot = 0; slot < PLAYER_ROWS; slot++) {
        const name = rows[team][slot] || "";
        const account = name ? $.OHHost.accountOf(name) : "";
        UI[`OH${side}Player${slot}Row`].SetHasClass("OHShown", !!name);
        setText(UI[`OH${side}Player${slot}Game`], name);
        syncEntry(UI[`OH${side}Player${slot}Entry`], aliasOf(state, name));
        // A v1 alias (by name) offers a one-click bind to the account once the card's account is known.
        UI[`OH${side}Player${slot}Bind`].SetHasClass("OHShown", !!account && !state.players[account] && !!state.legacy[name]);
      }
      UI[`OH${side}PlayersEmpty`].SetHasClass("OHShown", rows[team].length === 0);
    }
  }

  // A picked choice wears the stock SecondaryButton "fill Selected" look.
  function pick(button, on) {
    button.SetHasClass("OHSelected", on);
    button.SetHasClass("fill", on);
    button.SetHasClass("Selected", on);
  }

  const pageTitle = () => (PAGES.find((entry) => entry[0] === page) || PAGES[0])[1];

  function setPage(name) {
    page = name;
    for (const [other] of PAGES) {
      root.SetHasClass(`OHShow${other}`, other === name);
      UI[`OHNav${other}`].SetHasClass("Selected", other === name);
    }
    root.SetHasClass("OHNoPageReset", name === "Share");
    render();
  }

  // Title and description of the page shown; NIGHT DESK says why it is dimmed under Base Game+ Names.
  function renderHead(state) {
    const [, title, description] = PAGES.find((entry) => entry[0] === page) || PAGES[0];
    setText(UI.OHPageTitle, title);
    setText(UI.OHStatus, page === "Desk" && state.style !== "desk" ? DESK_OFF_TEXT : description);
  }

  function render() {
    if (!alive()) return;
    const state = $.OHHost.getState();
    syncEntry(UI.OHEventEntry, state.event);
    syncEntry(UI.OHStageEntry, state.stage);
    for (const n of S.BEST_OF) pick(UI[`OHBo${n}`], state.bestOf === n);
    const wins = S.winsNeeded(state.bestOf);
    setText(UI.OHFormatNote, `first to ${wins}`);
    for (const [look, id] of LOOKS) pick(UI[id], state.style === look);
    const desk = state.style === "desk";
    root.SetHasClass("OHLookDeskOn", desk);
    UI.OHNavDesk.SetHasClass("OHNavOff", !desk);
    setText(UI.OHRailLook, `Look: ${desk ? "Night Desk" : "Base Game+ Names"}`);
    setText(UI.OHLookNote, LOOK_NOTE[state.style]);
    setText(UI.OHLogoSizeNote, LOGO_SIZE_NOTE[state.style]);
    setText(UI.OHEventNote, EVENT_NOTE[state.style]);
    renderHead(state);
    syncEntry(UI.OHOrgEntry, state.org.name);
    if (!logoError.org) syncEntry(UI.OHOrgLogoEntry, state.org.logo.url);
    renderLogo("org", "Org");
    syncEntry(UI.OHInfoTitleEntry, state.info.title);
    syncEntry(UI.OHInfoValueEntry, state.info.value);
    syncEntry(UI.OHInfoCaptionEntry, state.info.caption);
    for (const [show, id] of GRAPH_CHOICES) pick(UI[id], state.graph.show === show);
    for (const [every, id] of EVERY_CHOICES) pick(UI[id], state.graph.every === every);
    setText(UI.OHGraphSizeValue, `${state.graph.size}%`);
    setText(UI.OHGraphXValue, `${state.graph.x} px`);
    setText(UI.OHGraphYValue, `${state.graph.y} px`);
    for (const [shape, id] of LOGO_SHAPE_CHOICES) pick(UI[id], state.logo.shape === shape);
    setText(UI.OHLogoSizeValue, `${state.logo.size} px`);
    setText(UI.OHLogoGapValue, `${state.logo.gap} px`);
    for (const [key, show, id] of CUE_CHOICES) pick(UI[id], state.cues[key] === show);
    for (const [show, id] of BUYS_CHOICES) pick(UI[id], state.buys === show);
    for (const [team, side] of SIDES) {
      const entry = state[team];
      syncEntry(UI[`OH${side}NameEntry`], entry.name);
      syncEntry(UI[`OH${side}TagEntry`], entry.tag);
      setText(UI[`OH${side}SeriesValue`], String(entry.series));
      setText(UI[`OH${side}SeriesNote`], `of ${wins}`);
      setText(UI[`OH${side}SeriesTitle`], `${entry.name} wins`);
      setText(UI[`OH${side}BansTitle`], `${entry.name} bans`);
      if (!logoError[team]) syncEntry(UI[`OH${side}LogoEntry`], entry.logo.url);
      renderLogo(team, side);
      entry.bans.forEach((id, slot) => {
        const button = UI[`OH${side}Ban${slot}`];
        button.SetHasClass("OHBanSet", id > 0);
        if (id > 0) UI[`OH${side}Ban${slot}Image`].SetHeroID(id);
        setText(UI[`OH${side}Ban${slot}Label`], id > 0 ? heroName(id) || `Hero ${id}` : `Ban ${slot + 1}: none`);
      });
    }
    renderPlayers();
    UI.OHDebuffToggle.SetHasClass("Checked", state.dev.debuffs);
    setText(UI.OHDebuffToggleLabel, state.dev.debuffs ? "ON" : "OFF");
    setText(UI.OHPollValue, `${state.dev.debuffPollMs} ms`);
    UI.OHLogToggle.SetHasClass("Checked", state.dev.logStatus);
    setText(UI.OHLogToggleLabel, state.dev.logStatus ? "ON" : "OFF");
    const armed = (kind) => resetArmed.kind === kind && Date.now() - resetArmed.at < RESET_ARM_MS;
    setText(UI.OHResetLabel, armed("all") ? "CONFIRM RESET ALL" : "RESET ALL");
    UI.OHReset.SetHasClass("OHArmed", armed("all"));
    setText(UI.OHResetPageLabel, `${armed("page") ? "CONFIRM " : ""}RESET ${pageTitle()}`);
    UI.OHResetPage.SetHasClass("OHArmed", armed("page"));
    if (picking) {
      const taken = new Set([...state.amber.bans, ...state.sapphire.bans].filter((id) => id > 0));
      for (const tile of UI.tiles) tile.panel.SetHasClass("OHTaken", taken.has(tile.id));
    }
  }

  // ------------------------------------------------------------------ actions

  // Texts apply as typed; one that is too long cannot be typed (maxchars) and is rejected by normalize.
  function bindText(entry, apply, current) {
    const commit = () => {
      if (!alive()) return;
      const text = S.cleanText(String(entry.text || ""), 64);
      if (text !== null && text !== current()) edit((next) => apply(next, text));
    };
    const release = () => {
      try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
    };
    entry.SetPanelEvent("ontextentrychange", commit);
    entry.SetPanelEvent("ontextentrysubmit", () => {
      commit();
      release();
      render();
    });
    entry.SetPanelEvent("onblur", () => {
      commit();
      render();
    });
    entry.SetPanelEvent("oncancel", () => {
      entry.text = current();
      release();
    });
  }

  // A rejected URL keeps the current logo and says so; it is never truncated or logged.
  // team is "amber", "sapphire" or "org".
  function commitLogo(team, entry) {
    if (!alive()) return;
    const url = S.cleanUrl(String(entry.text || ""));
    logoError[team] = url === null;
    if (url !== null && url !== $.OHHost.getState()[team].logo.url) edit((next) => { next[team].logo.url = url; });
    else render();
  }
  function bindLogo(team, entry) {
    bind(entry, "ontextentrysubmit", () => {
      commitLogo(team, entry);
      try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
    });
    bind(entry, "onblur", () => commitLogo(team, entry));
    bind(entry, "oncancel", () => {
      logoError[team] = false;
      entry.text = $.OHHost.getState()[team].logo.url;
      try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
      render();
    });
  }

  function stepSeries(team, delta) {
    edit((next) => {
      const max = S.winsNeeded(next.bestOf);
      next[team].series = Math.max(0, Math.min(max, next[team].series + delta));
    });
  }

  function setBestOf(n) {
    edit((next) => {
      next.bestOf = n;
      for (const [team] of SIDES) next[team].series = Math.min(next[team].series, S.winsNeeded(n));
    });
  }

  function commitAlias(team, slot, entry) {
    if (!alive()) return;
    const name = rows[team][slot];
    if (!name) return;
    const text = S.cleanText(String(entry.text || ""), S.LIMITS.alias);
    if (text === null) return;
    if (text === aliasOf($.OHHost.getState(), name)) return;
    const account = $.OHHost.accountOf(name);
    edit((next) => {
      // An account's alias is keyed by the account; without one (a bot, an unmatched persona, a duplicate
      // name, no marker yet) it is a session alias by name that binds later within this map load. A
      // full list (24) keeps the alias as a session alias.
      delete next.pending[name];
      delete next.legacy[name];
      if (account && (text === "" || next.players[account] || Object.keys(next.players).length < S.MAX_ALIASES)) {
        if (text) next.players[account] = { a: text, n: name };
        else delete next.players[account];
      } else if (text) {
        next.pending[name] = text;
      }
    });
  }

  // The chip: bind a v1 alias to the account the card now has. Nothing binds without this click.
  function bindLegacy(team, slot) {
    if (!alive()) return;
    const name = rows[team][slot];
    const account = name ? $.OHHost.accountOf(name) : "";
    if (!account) return;
    edit((next) => {
      const alias = next.legacy[name];
      if (!alias || next.players[account] || Object.keys(next.players).length >= S.MAX_ALIASES) return;
      next.players[account] = { a: alias, n: name };
      delete next.legacy[name];
    });
  }

  function openPicker(team, slot) {
    picking = { team, slot };
    const state = $.OHHost.getState();
    setText(UI.OHPickerTitle, `BAN ${slot + 1} FOR ${state[team].name}`);
    root.AddClass("OHPicking");
    render();
  }
  function closePicker() {
    picking = null;
    if (valid(root)) root.RemoveClass("OHPicking");
  }
  // A hero is banned once: picking it again moves it to this slot.
  function pickHero(id) {
    if (!picking) return;
    const { team, slot } = picking;
    closePicker();
    edit((next) => {
      for (const [other] of SIDES) next[other].bans = next[other].bans.map((ban) => ban === id ? 0 : ban);
      next[team].bans[slot] = id;
    });
  }

  function buildHeroGrid() {
    UI.OHHeroGrid.RemoveAndDeleteChildren();
    UI.tiles = [];
    for (const [id, name] of HEROES) {
      const tile = $.CreatePanel("Button", UI.OHHeroGrid, `OHHero${id}`, { class: "OHHeroTile" });
      const image = $.CreatePanel("CitadelHeroImage", tile, "", {
        class: "OHHeroTileImage", heroimagestyle: "small", scaling: "stretch-to-cover-preserve-aspect", hittest: "false"
      });
      image.SetHeroID(id);
      $.CreatePanel("Label", tile, "", { class: "OHHeroTileName", text: name, hittest: "false" });
      tile.SetPanelEvent("onactivate", () => {
        if (alive()) pickHero(id);
      });
      UI.tiles.push({ id, panel: tile });
    }
  }

  // The code goes in the box and, through the box, on the clipboard: CopyStringToClipboard throws in
  // this game (DLF, live 2026-10-17); TextEntryCopyToClipboard copies a selected entry.
  function copyCode() {
    const entry = UI.OHShareEntry;
    entry.text = S.encodeShare($.OHHost.getState());
    let copied = false;
    try {
      entry.SetFocus();
      entry.SelectAll();
      copied = $.DispatchEvent("TextEntryCopyToClipboard", entry) !== false;
    } catch (e) {}
    try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
    setText(UI.OHShareStatus, copied ? "Code copied." : "The code is in the box: select it and press Ctrl+C.");
  }

  // A valid code replaces the setup (fields it lacks take the defaults); this PC's DEV settings stay.
  // An empty box pastes the clipboard first. Any other text changes nothing.
  function importCode() {
    const entry = UI.OHShareEntry;
    let text = String(entry.text || "").trim();
    if (!text) {
      try { $.DispatchEvent("TextEntryInsertFromClipboard", entry); } catch (e) {}
      text = String(entry.text || "").trim();
    }
    if (!text) {
      setText(UI.OHShareStatus, "Paste a code first.");
      return;
    }
    const result = S.decodeShare(text);
    if (result.kind !== "valid") {
      setText(UI.OHShareStatus, result.kind === "unsupported" ? "That code is from a newer version of the mod." : "Not an Observer HUD code.");
      return;
    }
    closePicker();
    const dev = $.OHHost.getState().dev;
    const next = result.state && typeof result.state === "object" ? S.clone(result.state) : {};
    next.dev = dev;
    logoError.amber = false;
    logoError.sapphire = false;
    logoError.org = false;
    $.OHHost.setState(S.normalize(next, Object.assign(S.defaults(), { dev })));
    setText(UI.OHShareStatus, "Imported.");
  }

  // RESET asks once more; the second press within RESET_ARM_MS clears the setup (DEV settings stay).
  // RESET <PAGE> puts the settings on the page shown back to their defaults; RESET ALL does every page.
  // Each arms on the first press and acts on a second press within RESET_ARM_MS.
  function reset(kind) {
    const now = Date.now();
    if (!(resetArmed.kind === kind && now - resetArmed.at < RESET_ARM_MS)) {
      resetArmed = { kind, at: now };
      render();
      $.Schedule(RESET_ARM_MS / 1000 + 0.05, () => render());
      return;
    }
    resetArmed = { kind: "", at: 0 };
    closePicker();
    const base = S.defaults();
    if (kind === "all") {
      logoError.amber = logoError.sapphire = logoError.org = false;
      unblockStore();
      $.OHHost.setState(base);
      return;
    }
    if (page === "Share") return; // nothing to reset (the button is hidden there)
    edit((next) => {
      if (page === "Match") {
        next.stage = base.stage;
        next.bestOf = base.bestOf;
        for (const [team] of SIDES) {
          next[team].series = base[team].series;
          next[team].bans = base[team].bans.slice();
        }
      } else if (page === "Teams") {
        for (const [team] of SIDES) {
          for (const key of ["name", "tag", "logo"]) next[team][key] = base[team][key];
        }
        next.logo = base.logo;
        logoError.amber = logoError.sapphire = false;
      } else if (page === "Players") {
        next.players = base.players;
        next.legacy = base.legacy;
        next.pending = base.pending;
        next.buys = base.buys;
        next.dev = base.dev;
      } else if (page === "TopBar") {
        for (const key of ["style", "org", "event"]) next[key] = base[key];
        logoError.org = false;
      } else if (page === "Desk") {
        next.info = base.info;
      } else if (page === "Timers") {
        next.cues = base.cues;
        next.graph = base.graph;
      }
    });
  }

  function openExternal(url) {
    try {
      $.DispatchEvent("ExternalBrowserGoToURL", url);
    } catch (e) { /* The external browser is optional. */ }
  }

  // The strip is an optional hosted page (as in HP Colors v3): the editor works without it.
  function setStrip(open) {
    const strip = UI.OHSupporterStrip;
    strip.RemoveClass("Open");
    try {
      if (typeof strip.SetIgnoreCursor === "function") strip.SetIgnoreCursor(true);
      if (typeof strip.SetURL !== "function") return;
      const url = open ? `${STRIP_URL}${Date.now().toString(36)}.${++stripOpens}` : "about:blank";
      if (strip.SetURL(url) !== false && open) strip.AddClass("Open");
    } catch (e) { /* no strip */ }
  }

  function setOpen(open) {
    if (!valid(root)) return;
    const was = root.BHasClass("OHOpen");
    root.SetHasClass("OHOpen", open);
    if (was !== open) setStrip(open);
    if (!open) closePicker();
    if (open) {
      // The save page gave up while unanswered: opening the editor asks it again.
      if (Store.phase === "unavailable" && Store.offline) startHello();
      rows = $.OHHost.roster();
      render();
      const gen = ++rosterGen;
      $.Schedule(ROSTER_TICK_S, () => rosterTick(gen));
    }
  }

  function bind(panel, event, fn) {
    panel.SetPanelEvent(event, () => {
      if (alive()) fn();
    });
  }

  function bindControls() {
    bind(UI.OHDone, "onactivate", () => setOpen(false));
    // The backdrop takes the clicks around the dialog; a click there closes the picker first.
    bind(UI.OHBackdrop, "onactivate", () => {
      if (picking) closePicker();
      else setOpen(false);
    });
    bind(UI.OHReset, "onactivate", () => reset("all"));
    bind(UI.OHDonate, "onactivate", () => openExternal(DONATE_URL));
    bind(UI.OHAuthor, "onactivate", () => openExternal(AUTHOR_URL));
    bind(UI.OHResetPage, "onactivate", () => reset("page"));
    for (const [name] of PAGES) bind(UI[`OHNav${name}`], "onactivate", () => setPage(name));
    bind(UI.OHDebuffToggle, "onactivate", () => edit((next) => { next.dev.debuffs = !next.dev.debuffs; }));
    bind(UI.OHLogToggle, "onactivate", () => edit((next) => { next.dev.logStatus = !next.dev.logStatus; }));
    const stepPoll = (delta) => edit((next) => {
      const steps = S.DEBUFF_POLL_STEPS;
      next.dev.debuffPollMs = steps[Math.max(0, Math.min(steps.length - 1, steps.indexOf(next.dev.debuffPollMs) + delta))];
    });
    bind(UI.OHPollDown, "onactivate", () => stepPoll(-1));
    bind(UI.OHPollUp, "onactivate", () => stepPoll(1));
    bind(UI.OHShareCopy, "onactivate", copyCode);
    bind(UI.OHShareImport, "onactivate", importCode);
    bind(UI.OHShareEntry, "ontextentrysubmit", importCode);
    bind(UI.OHPickerNone, "onactivate", () => {
      if (!picking) return;
      const { team, slot } = picking;
      closePicker();
      edit((next) => { next[team].bans[slot] = 0; });
    });
    bind(UI.OHPickerCancel, "onactivate", () => {
      closePicker();
      render();
    });
    for (const n of S.BEST_OF) bind(UI[`OHBo${n}`], "onactivate", () => setBestOf(n));
    const state = () => $.OHHost.getState();
    bindText(UI.OHEventEntry, (next, text) => { next.event = text; }, () => state().event);
    bindText(UI.OHStageEntry, (next, text) => { next.stage = text; }, () => state().stage);
    for (const [look, id] of LOOKS) bind(UI[id], "onactivate", () => edit((next) => { next.style = look; }));
    bind(UI.OHUseDesk, "onactivate", () => edit((next) => { next.style = "desk"; }));
    bindText(UI.OHOrgEntry, (next, text) => { next.org.name = text; }, () => state().org.name);
    bindLogo("org", UI.OHOrgLogoEntry);
    bindText(UI.OHInfoTitleEntry, (next, text) => { next.info.title = text; }, () => state().info.title);
    bindText(UI.OHInfoValueEntry, (next, text) => { next.info.value = text; }, () => state().info.value);
    bindText(UI.OHInfoCaptionEntry, (next, text) => { next.info.caption = text; }, () => state().info.caption);
    for (const [show, id] of GRAPH_CHOICES) bind(UI[id], "onactivate", () => edit((next) => { next.graph.show = show; }));
    for (const [every, id] of EVERY_CHOICES) bind(UI[id], "onactivate", () => edit((next) => { next.graph.every = every; }));
    // Size, X and Y step by their GRAPH_LIMITS step and stop at the limits.
    for (const [key, name] of GRAPH_STEPS) {
      const step = (sign) => edit((next) => {
        const [min, max, by] = S.GRAPH_LIMITS[key];
        next.graph[key] = Math.max(min, Math.min(max, next.graph[key] + sign * by));
      });
      bind(UI[`OHGraph${name}Down`], "onactivate", () => step(-1));
      bind(UI[`OHGraph${name}Up`], "onactivate", () => step(1));
    }
    for (const [shape, id] of LOGO_SHAPE_CHOICES) bind(UI[id], "onactivate", () => edit((next) => { next.logo.shape = shape; }));
    // Logo size and gap step by their LOGO_LIMITS step and stop at the limits.
    for (const [key, name] of LOGO_STEPS) {
      const step = (sign) => edit((next) => {
        const [min, max, by] = S.LOGO_LIMITS[key];
        next.logo[key] = Math.max(min, Math.min(max, next.logo[key] + sign * by));
      });
      bind(UI[`OHLogo${name}Down`], "onactivate", () => step(-1));
      bind(UI[`OHLogo${name}Up`], "onactivate", () => step(1));
    }
    for (const [key, show, id] of CUE_CHOICES) bind(UI[id], "onactivate", () => edit((next) => { next.cues[key] = show; }));
    for (const [show, id] of BUYS_CHOICES) bind(UI[id], "onactivate", () => edit((next) => { next.buys = show; }));
    for (const [team, side] of SIDES) {
      // An empty name falls back to the default team name.
      bindText(UI[`OH${side}NameEntry`], (next, text) => { next[team].name = text; }, () => state()[team].name);
      bindText(UI[`OH${side}TagEntry`], (next, text) => { next[team].tag = text; }, () => state()[team].tag);
      bind(UI[`OH${side}SeriesDown`], "onactivate", () => stepSeries(team, -1));
      bind(UI[`OH${side}SeriesUp`], "onactivate", () => stepSeries(team, 1));
      bindLogo(team, UI[`OH${side}LogoEntry`]);
      for (let slot = 0; slot < S.BAN_SLOTS; slot++) bind(UI[`OH${side}Ban${slot}`], "onactivate", () => openPicker(team, slot));
      for (let slot = 0; slot < PLAYER_ROWS; slot++) {
        const entry = UI[`OH${side}Player${slot}Entry`];
        bind(entry, "ontextentrychange", () => commitAlias(team, slot, entry));
        bind(entry, "ontextentrysubmit", () => {
          commitAlias(team, slot, entry);
          try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
        });
        bind(entry, "onblur", () => commitAlias(team, slot, entry));
        bind(UI[`OH${side}Player${slot}Bind`], "onactivate", () => bindLegacy(team, slot));
        bind(entry, "oncancel", () => {
          const name = rows[team][slot];
          entry.text = aliasOf(state(), name);
          try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
        });
      }
    }
  }

  const IDS = ["OHEditor", "OHBackdrop", "OHStatus", "OHEventEntry", "OHStageEntry", "OHShareEntry",
    "OHShareCopy", "OHShareImport", "OHShareStatus", "OHPageTitle", "OHDebuffToggle", "OHDebuffToggleLabel", "OHPollDown",
    "OHPollValue", "OHPollUp", "OHLogToggle", "OHLogToggleLabel", "OHReset", "OHResetLabel", "OHDone", "OHPicker",
    "OHPickerTitle", "OHPickerNone", "OHPickerCancel", "OHHeroGrid", "OHOrgEntry", "OHOrgLogoEntry", "OHOrgLogoNote",
    "OHInfoTitleEntry", "OHInfoValueEntry", "OHInfoCaptionEntry", "OHRailLook", "OHUseDesk", "OHLookNote",
    "OHLogoSizeNote", "OHEventNote", "OHFormatNote"];
  for (const [, id] of LOOKS) IDS.push(id);
  for (const [, id] of GRAPH_CHOICES) IDS.push(id);
  for (const [, id] of EVERY_CHOICES) IDS.push(id);
  for (const [, name] of GRAPH_STEPS) IDS.push(`OHGraph${name}Down`, `OHGraph${name}Value`, `OHGraph${name}Up`);
  for (const [, id] of LOGO_SHAPE_CHOICES) IDS.push(id);
  for (const [, name] of LOGO_STEPS) IDS.push(`OHLogo${name}Down`, `OHLogo${name}Value`, `OHLogo${name}Up`);
  for (const [, , id] of CUE_CHOICES) IDS.push(id);
  for (const [, id] of BUYS_CHOICES) IDS.push(id);
  IDS.push("OHResetPage", "OHResetPageLabel", "OHDonate", "OHAuthor", "OHAuthorLabel", "OHVersion", "OHSupporterStrip",
    "OHSaveStatus", "OHStore");
  for (const n of [1, 3, 5, 7]) IDS.push(`OHBo${n}`);
  for (const [name] of PAGES) IDS.push(`OHNav${name}`);
  for (const [, side] of SIDES) {
    IDS.push(`OH${side}NameEntry`, `OH${side}TagEntry`, `OH${side}SeriesDown`, `OH${side}SeriesValue`, `OH${side}SeriesUp`,
      `OH${side}LogoEntry`, `OH${side}LogoNote`, `OH${side}PlayersEmpty`, `OH${side}SeriesNote`, `OH${side}SeriesTitle`,
      `OH${side}BansTitle`);
    for (let slot = 0; slot < 2; slot++) IDS.push(`OH${side}Ban${slot}`, `OH${side}Ban${slot}Image`, `OH${side}Ban${slot}Label`);
    for (let slot = 0; slot < PLAYER_ROWS; slot++) {
      IDS.push(`OH${side}Player${slot}Row`, `OH${side}Player${slot}Game`, `OH${side}Player${slot}Entry`, `OH${side}Player${slot}Bind`);
    }
  }

  // While the editor is open, the alias rows follow the stock top bar (players join, swap, leave). The
  // loop runs only while it is open (setOpen starts it; a newer open or a close ends it), so a closed
  // editor costs nothing per second.
  function rosterTick(gen) {
    if (stopped || gen !== rosterGen || !alive() || !root.BHasClass("OHOpen")) return;
    try {
      const next = $.OHHost.roster();
      // An account that arrives changes the row's alias and chip without changing the roster.
      const sig = JSON.stringify(next) + "|" + next.amber.concat(next.sapphire).map((name) => $.OHHost.accountOf(name)).join(",");
      if (sig !== rowsSig) {
        rowsSig = sig;
        rows = next;
        renderPlayers();
      }
      renderLogo("amber", "Amber");
      renderLogo("sapphire", "Sapphire");
      renderLogo("org", "Org");
    } catch (e) {
      $.Msg(`${TAG} roster tick failed: ${e && e.message ? e.message : e}`);
    }
    $.Schedule(ROSTER_TICK_S, () => rosterTick(gen));
  }

  // ------------------------------------------------------------------ local save

  // phase: idle -> hello -> read -> ready | blocked (damaged or newer save; RESET ALL overwrites) |
  // unavailable (session only). One request in flight; saves throttle at SAVE_DELAY_S; an edit made
  // while the save loads wins over the stored record; a layout reload keeps its carried state.
  const Store = {
    panel: null, phase: "idle", seq: 0, gen: 0, helloId: "", startMs: 0, pendingId: "", pendingOp: "",
    savedRecord: "", sentRecord: "", retry: 0, readRetried: false, capacity: 4096, logosDropped: false,
    adopt: true, bootVersion: 0, saveQueued: false, started: false, reloadAt: 0, reloadGap: 0, offline: false,
    readText: "", readPages: 0, fromV1: false, cards: [], cardWait: false, cardLogged: false, cardHooked: false
  };

  function setSaveStatus(text, tone) {
    if (!valid(UI.OHSaveStatus)) return;
    setText(UI.OHSaveStatus, text);
    UI.OHSaveStatus.SetHasClass("OHSaveOk", tone === "ok");
    UI.OHSaveStatus.SetHasClass("OHSaveWarn", tone === "warn");
  }

  // Session aliases (pending) are never saved.
  function encodeRecord(value) {
    const kept = S.clone(value);
    delete kept.pending;
    const body = JSON.stringify({ s: RECORD_SCHEMA, state: kept });
    return `${RECORD_PREFIX}${S.checksum(body)}.${body}`;
  }
  // The record to save: in full, or without logo URLs when over the page's capacity; null if neither fits.
  function encodeSave() {
    const state = $.OHHost.getState();
    const full = encodeRecord(state);
    if (full.length <= Store.capacity) return { record: full, logosDropped: false };
    const stripped = S.clone(state);
    for (const [team] of SIDES) stripped[team].logo.url = "";
    stripped.org.logo.url = "";
    const record = encodeRecord(stripped);
    return { record: record.length <= Store.capacity ? record : null, logosDropped: true };
  }
  function decodeRecord(record) {
    if (record === null || record === undefined) return { kind: "absent" };
    if (typeof record !== "string" || record.length > READ_LIMIT || record.slice(0, 5) !== RECORD_PREFIX ||
        record.charAt(13) !== "." || S.checksum(record.slice(14)) !== record.slice(5, 13)) return { kind: "corrupt" };
    let body = null;
    try { body = JSON.parse(record.slice(14)); } catch (e) { return { kind: "corrupt" }; }
    if (!body || typeof body !== "object" || !body.state || typeof body.state !== "object") return { kind: "corrupt" };
    if (body.s !== RECORD_SCHEMA) return { kind: Number.isInteger(body.s) && body.s > RECORD_SCHEMA ? "newer" : "corrupt" };
    return { kind: "valid", state: body.state };
  }
  const savedText = () => (Store.logosDropped ? "SAVED - LOGO URLS THIS SESSION ONLY" : "SAVED");

  function storeSend(message) {
    if (stopped || !valid(Store.panel)) return false;
    try {
      Store.panel.SetURL(`${STORE_URL}#${encodeURIComponent(JSON.stringify(message))}`);
      return true;
    } catch (e) {
      return false;
    }
  }
  // A URL that only changes the fragment never reloads the page, so a lost load (an error page) would
  // never answer: leaving it for about:blank makes the next hello load the page afresh.
  function storeBlank() {
    if (stopped || !valid(Store.panel)) return false;
    try {
      Store.panel.SetURL("about:blank");
      return true;
    } catch (e) {
      return false;
    }
  }
  // offline: the page did not answer; opening the editor asks it again.
  function storeUnavailable(text, offline) {
    Store.phase = "unavailable";
    Store.offline = !!offline;
    Store.gen++;
    Store.pendingId = "";
    Store.pendingOp = "";
    setSaveStatus(text, "warn");
  }
  function startStore() {
    if (!valid(UI.OHStore)) return;
    // A re-attached editor (the Escape menu was rebuilt) keeps this process's state.
    Store.adopt = !Store.started && !$.OHHost.carried();
    Store.started = true;
    Store.panel = UI.OHStore;
    Store.bootVersion = $.OHHost.version();
    try {
      $.RegisterEventHandler("HTMLTitle", Store.panel, onStoreTitle);
    } catch (e) {
      storeUnavailable("OFFLINE - SESSION ONLY", false);
      return;
    }
    startHello();
  }
  // Asks the page until it answers: every HELLO_RETRY_S, slower and with the footer saying session
  // only after READY_TIMEOUT_MS, and gives up after RETRY_WINDOW_MS. The page is reloaded after
  // FIRST_RELOAD_MS and then at doubling gaps, so a slow load is not cut off every time.
  function startHello() {
    Store.gen++;
    Store.phase = "hello";
    Store.offline = false;
    Store.pendingId = "";
    Store.pendingOp = "";
    Store.readRetried = false;
    Store.startMs = Date.now();
    Store.reloadAt = Store.startMs + FIRST_RELOAD_MS;
    Store.reloadGap = FIRST_RELOAD_MS;
    setSaveStatus("LOADING SAVE", "");
    storeHello(Store.gen);
  }
  function storeHello(gen) {
    if (gen !== Store.gen || Store.phase !== "hello") return;
    const now = Date.now();
    const waited = now - Store.startMs;
    if (waited >= RETRY_WINDOW_MS) {
      storeUnavailable("OFFLINE - SESSION ONLY", true);
      return;
    }
    const slow = waited >= READY_TIMEOUT_MS;
    if (slow) setSaveStatus("OFFLINE - SESSION ONLY", "warn");
    let sent;
    if (now >= Store.reloadAt) {
      Store.reloadGap = Math.min(Store.reloadGap * 2, MAX_RELOAD_GAP_MS);
      Store.reloadAt = now + Store.reloadGap;
      sent = storeBlank();
    } else {
      sent = storeSend({ i: (Store.helloId = `h${++Store.seq}`), o: "hello" });
    }
    if (!sent) {
      storeUnavailable("OFFLINE - SESSION ONLY", false);
      return;
    }
    $.Schedule(slow ? SLOW_RETRY_S : HELLO_RETRY_S, () => storeHello(gen));
  }
  function storeRequest(op, message) {
    const id = `${op}${++Store.seq}`;
    message.i = id;
    message.o = op;
    Store.pendingId = id;
    Store.pendingOp = op;
    const gen = Store.gen;
    $.Schedule(REPLY_TIMEOUT_S, () => {
      if (gen === Store.gen && Store.pendingId === id) storeFinish(null);
    });
    if (!storeSend(message)) storeFinish(null);
  }
  function storeFinish(reply) {
    const op = Store.pendingOp;
    Store.pendingId = "";
    Store.pendingOp = "";
    if (op === "r") onStoreRead(reply);
    else if (op === "w") onStoreWrite(reply);
    else if (op === "u") onStoreCard(reply);
    flushCards();
  }
  function onStoreTitle(panelOrTitle, eventTitle) {
    if (stopped) return;
    const title = eventTitle !== undefined ? eventTitle : panelOrTitle;
    if (typeof title !== "string" || title.indexOf(STORE_PREFIX) !== 0) return;
    let reply = null;
    try { reply = JSON.parse(title.slice(STORE_PREFIX.length)); } catch (e) { return; }
    if (!reply || typeof reply !== "object") return;
    if (reply.o === "ready") {
      if (Store.phase !== "hello" || reply.i !== Store.helloId) return;
      if (typeof reply.h !== "string" || reply.h.split("#")[0] !== STORE_URL) return;
      if (reply.v !== STORE_VERSION || reply.ok !== true) {
        storeUnavailable("SAVE PAGE OUTDATED - SESSION ONLY");
        return;
      }
      Store.capacity = Number.isInteger(reply.m) && reply.m >= 1024 && reply.m <= READ_LIMIT ? reply.m : 4096;
      Store.phase = "read";
      Store.readText = "";
      Store.readPages = 0;
      storeRequest("r", {});
      return;
    }
    // Late, duplicate and foreign replies carry an id we are not waiting for.
    if (Store.pendingId && reply.i === Store.pendingId) storeFinish(reply);
  }
  function onStoreRead(reply) {
    if (Store.phase !== "read") return;
    if (!reply || reply.ok !== true) {
      if (Store.readRetried) {
        storeUnavailable("OFFLINE - SESSION ONLY", true);
        return;
      }
      Store.readRetried = true;
      Store.readText = "";
      Store.readPages = 0;
      storeRequest("r", {});
      return;
    }
    // The record comes in pieces that each fit the game's 4096-character title (v = piece, s = its start, n = the whole length).
    if (reply.x === 1) {
      if (typeof reply.v !== "string" || reply.s !== Store.readText.length || !Number.isInteger(reply.n) || reply.n < 0 || reply.n > READ_LIMIT) {
        storeUnavailable("OFFLINE - SESSION ONLY", true);
        return;
      }
      Store.readText += reply.v;
      Store.fromV1 = reply.f === 1;
      if (Store.readText.length < reply.n) {
        if (!reply.v.length || ++Store.readPages > 16) {
          storeUnavailable("OFFLINE - SESSION ONLY", true);
          return;
        }
        storeRequest("r", { s: Store.readText.length });
        return;
      }
    }
    const result = decodeRecord(reply.x === 1 ? Store.readText : null);
    if (result.kind === "corrupt" || result.kind === "newer") {
      Store.phase = "blocked";
      setSaveStatus(result.kind === "newer" ? "NEWER SAVE - RESET TO OVERWRITE" : "SAVE DAMAGED - RESET TO REPAIR", "warn");
      return;
    }
    Store.phase = "ready";
    if (result.kind === "valid") {
      // A record the page found under v1's key is not "saved" here: the next save writes the v2 key.
      Store.savedRecord = Store.fromV1 ? "" : Store.readText;
      // Edits made while the save loaded, or a carried state, win over the record.
      if (Store.adopt && $.OHHost.version() === Store.bootVersion) $.OHHost.setState(result.state);
    }
    scheduleSave();
  }
  function scheduleSave() {
    if (Store.phase !== "ready" || Store.saveQueued) return;
    Store.saveQueued = true;
    const gen = Store.gen;
    $.Schedule(SAVE_DELAY_S, () => {
      Store.saveQueued = false;
      if (gen === Store.gen) flushSave();
    });
    if (encodeSave().record !== Store.savedRecord) setSaveStatus("SAVING", "");
  }
  function flushSave() {
    if (Store.phase !== "ready" || Store.pendingOp) return; // a write in flight reschedules from its reply
    const { record, logosDropped } = encodeSave();
    if (record === null) {
      setSaveStatus("TOO LONG TO SAVE - SESSION ONLY", "warn");
      return;
    }
    Store.logosDropped = logosDropped;
    if (record === Store.savedRecord) {
      setSaveStatus(savedText(), "ok");
      return;
    }
    Store.sentRecord = record;
    setSaveStatus("SAVING", "");
    storeRequest("w", { v: record });
  }
  function onStoreWrite(reply) {
    if (Store.phase !== "ready") return;
    if (reply && reply.ok === true) {
      Store.savedRecord = Store.sentRecord;
      Store.retry = 0;
      if (encodeSave().record === Store.savedRecord) setSaveStatus(savedText(), "ok");
      else scheduleSave();
      return;
    }
    // A lost reply leaves the stored value unknown, so the retry writes even an unchanged record.
    Store.savedRecord = "";
    if (Store.retry < SAVE_RETRY_S.length) {
      const gen = Store.gen;
      $.Schedule(SAVE_RETRY_S[Store.retry++], () => { if (gen === Store.gen) flushSave(); });
      setSaveStatus("SAVE RETRYING", "warn");
    } else {
      storeUnavailable("SAVE FAILED - SESSION ONLY");
    }
  }
  // Match cards (plan phase 4): the host hands each card it writes to $.OHHost.onCard; it goes to the page's
  // matches key with one upsert at a time, after the setup record's own requests (one request in flight).
  // A failed upsert is tried again at CARD_RETRY_S, then dropped (the board still gets the card in this
  // session, by the handoff). An unreachable store keeps at most CARD_QUEUE cards and costs nothing.
  const CARD_RETRY_S = [2, 4];
  const CARD_QUEUE = 3;
  function queueCard(card) {
    Store.cards.push({ card: card, tries: 0 });
    while (Store.cards.length > CARD_QUEUE) Store.cards.shift();
    flushCards();
  }
  function flushCards() {
    if (stopped || (Store.phase !== "ready" && Store.phase !== "blocked") || Store.pendingOp || !Store.cards.length || Store.cardWait) return;
    storeRequest("u", { c: Store.cards[0].card });
  }
  function onStoreCard(reply) {
    const entry = Store.cards[0];
    if (!entry) return;
    if (reply && reply.ok === true) {
      Store.cards.shift();
    } else if (entry.tries < CARD_RETRY_S.length) {
      const gen = Store.gen;
      Store.cardWait = true;
      $.Schedule(CARD_RETRY_S[entry.tries++], () => {
        Store.cardWait = false;
        if (gen === Store.gen) flushCards();
      });
    } else {
      Store.cards.shift();
      if (!Store.cardLogged) $.Msg(`${TAG} a match card could not be saved`);
      Store.cardLogged = true;
    }
    // A setup save that waited for this request goes now.
    if (Store.phase === "ready" && encodeSave().record !== Store.savedRecord) scheduleSave();
  }

  // RESET ALL repairs a damaged or newer save by overwriting it.
  function unblockStore() {
    if (Store.phase !== "blocked") return;
    Store.phase = "ready";
    Store.savedRecord = "";
  }

  $.OHMenuAttach = (panel) => {
    if (stopped || !valid(panel)) return;
    for (const id of IDS) {
      const found = panel.FindChildTraverse(id);
      if (!valid(found)) {
        $.Msg(`${TAG} editor layout lacks #${id}`);
        return;
      }
      UI[id] = found;
    }
    root = panel;
    picking = null;
    bindControls();
    buildHeroGrid();
    setPage(page);
    setText(UI.OHVersion, `v${VERSION}`);
    render();
    startStore();
    if (!Store.cardHooked) {
      Store.cardHooked = true;
      $.OHHost.onCard(queueCard);
    }
    if ($.OHHost.card()) queueCard($.OHHost.card());
    $.Msg(`${TAG} editor ready`);
  };

  // The host's native entry in the stock menu list opens the editor.
  $.OHMenuOpen = () => {
    if (alive()) setOpen(true);
  };

  context.OHMenuStop = () => {
    stopped = true;
  };

  $.OHHost.onChange(() => {
    render();
    scheduleSave();
  });
})();
