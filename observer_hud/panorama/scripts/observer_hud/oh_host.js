// Observer HUD host (this mod's hud_spectate_bar.xml). The stock spectate bar is part of hud.xml and
// loads at UI start, so this script finds the HUD root and loads the mod's own layouts into stock
// panels (approach B, spike 2026-10-22):
//   observer_hud/band.xml right after the stock #TopBar in its parent (header band; the stock corner
//     icons stay outside its lacquer) while the stock #TopBar moves down by the band's height;
//   observer_hud/tournament_bar.xml into #TopBar (plates, clock bans, stage, soul lead graph);
//   observer_hud/debuffs.xml into each top-bar card (ability status column, drawn by oh_debuffs.js);
//   observer_hud/editor.xml into #EscapeMenu (oh_menu.js).
// Two looks (state.style): "names" Base Game+ Names (default: names strip, plates, bans beside the
// clock, stage under the soul plates) and "desk" Night Desk (56 px band with corners, team names,
// bans, names row, wordmark over the series, info card, soul lead graph).
// #TopBar and the cards are rebuilt on map loads and hero swaps, so a 1 s tick re-injects what is
// missing; a cached card is reused only while its cached children are valid. Outside spectating the
// tick only checks the HUD's spectator classes. Positions and texts are written only when they change.
// $.OHHost is the state owner: the editor calls setState, every reader takes getState() and compares
// version(). The state is also kept as JSON on the HUD root attribute $.OHState.ATTR, so a layout
// reload adopts it instead of starting over.
(() => {
  "use strict";

  const TAG = "[OH]";
  const TICK_SEC = 1;
  const BOOT_RETRY_MAX_S = 8;
  const LAYOUT = {
    band: "file://{resources}/layout/observer_hud/band.xml",
    bar: "file://{resources}/layout/observer_hud/tournament_bar.xml",
    debuffs: "file://{resources}/layout/observer_hud/debuffs.xml",
    menu: "file://{resources}/layout/observer_hud/editor.xml"
  };
  const SPECTATOR_CLASSES = ["spec_mode", "TeamSpectator", "replay_playback"];
  // [state key, stock team panel] pairs from the shared team table ($.OHState.TEAM_PANELS).
  const TEAM_PANELS = $.OHState.TEAM_PANELS.map((team) => [team.key, team.panelId]);
  const SIDES = ["Left", "Right"];
  const BAND = { names: 26, desk: 56 }; // band height per look; #TopBar moves down by this much
  const STOCK_TOP_MARGIN = 8; // CitadelHudTopBar .spec_mode margin-top, which the inline margin replaces
  // #TopBar tucks this much up under the band. At 0 the portraits hung 20-26 px under it (user
  // screenshots 2026-10-23 20:12, "not connected"); at 16 Celeste's horns and tall hair crossed it
  // (20:42, "too up").
  const TOP_BAR_TUCK = 8;
  const PLATE_MAX = 250; // the mockup's plate width
  const PLATE_COMPACT = 210; // below this the name drops to 14 px
  const PLATE_NARROW = 160; // below this the logo goes
  const PLATE_MIN = 96;
  const GAP = 8; // Night Desk team block edge to its corner divider
  const JOIN_W = 40; // Names: the plate colour fades into the strip's first 40 px
  const PLATE_CAPTION = 230; // Names: below this the plate's caption line goes
  const PLATE_PAD = 13; // Names: plate height = logo + PLATE_PAD, both ways (user 2026-10-23)
  const SCORE_W = 22; // Names: a series digit box at each end of the centre tab
  const EDGE = 72; // screen edge: the stock mute and spectator-count icons sit in the corners (live 2026-10-22)
  const CLOCK_WIDTH = 360; // .OHClock in oh_bar.css
  const CLOCK_DROP = { names: 52, desk: 52 }; // the stack's top below the clock (d12/d17: chips at y 88)
  const CUES_TOP = { names: 6, desk: 0 }; // .OHCues margin-top per look (oh_bar.css); layout heights leave it out
  const CLOCK_PAD = 5; // .GameClock padding around the #GameTime label
  const BAN_SIZE = 32; // .OHBan (28 before; user 2026-10-23 "bigger a bit")
  const BAN_STEP = BAN_SIZE + 4; // .OHBan + margins
  const BAN_CLEAR = 4; // Base Game+ Names: room kept between the clock bans and the innermost card
  const WHO_WIDTH = 86; // .OHWho
  const WHO_SLOTS = 12;
  const DESK_NAME = 24; // Night Desk: the name's inset from the team's inner end until the centre is placed
  // Night Desk team logo (design 16): the tab on each plate edge is the logo plus 2 px each way, from the
  // band's top (y 1); past LOGO_BASE px each team's stock cards move outward by size - LOGO_BASE.
  const LOGO_BASE = 30;
  const ORG_PAD = 2; // organiser name clearance from each tab
  const ORG_FONT = [15, 13, 11]; // .OHOrgName 15 px, then smaller before the ellipsis
  const ORG_LOGO_MAX = 172; // .OHStyleDesk .OHOrgLogo width
  const BAND_H = 56;
  const KILLS_BOTTOM = 80 + 3 + 40 + 3; // stock kills row bottom under the top bar's top (citadel_hud_top_bar.css)
  const REJUV_COUNTS = ["RejuvCount_1", "RejuvCount_2", "RejuvCount_3", "RejuvCount_4"];
  const PAUSE_RETRY_TICKS = 10;
  // The countdown number in II's place: centred, top 4 px, 58 px (the box is 80 px; stock: margin-right 350,
  // margin-bottom 572, 180 px).
  const PAUSE_ICON_STYLE = [["ignoreParentFlow", "true"], ["horizontalAlign", "center"], ["verticalAlign", "center"],
    ["fontSize", "58px"], ["marginTop", "4px"]];
  const PAUSE_WATCH_S = 0.1; // II / number swap check while the pause box shows
  const PAUSE_COUNT_STYLE = [["marginRight", "0px"], ["marginBottom", "0px"], ["verticalAlign", "top"], ["marginTop", "4px"], ["fontSize", "58px"]];
  const PAUSE_TEXT = ["PauserLabel", "UnpauseButtonLabel", "QLPausedText"]; // stock (+ QOLLOCK) pause text
  const KOTH_GAP = 4; // rift HUD top under the timers
  const KOTH_STOCK_TOP = 110;
  const KOTH_STOCK_RANGE = 120;
  // Stock objective health (#objectives_health_friendly, hud.xml gameplay_hud; hud.css 6813: margin-top 0,
  // flow down, z-index 20): a tier-2 walker's top sits 160 px under the panel's top (player row margin 100
  // + team 20 + tier-2 40, hud_team_objective_health.css / hud_objective_health.css 6813).
  const OBJ_GAP = 4; // objective health top under the timers or the rift HUD
  const OBJ_STOCK_OFFSET = 160;
  const DESK_BANS = 112; // room kept at the outer end for "BANS" and two bans
  const CORNER_MIN = 96; // a corner narrower than this hides
  const CORNER_PAD = 16; // .OHCorner padding
  const NAME_LONG = 20; // Night Desk team names longer than this step down to 18 px, then 15 px
  const NAME_LONGER = 24;
  const EVENT_LONG = 16; // a longer event title steps down to 10 px in Night Desk's corner
  const MID_WIDTH = { names: 196, desk: 192 };
  const INFO_LEFT = 16;
  // Soul lead graph: the lead from the stock soul plates, kept every SAMPLE_S s of game time; a pin at
  // each mark (state.graph.every, default 5:00) is the first sample within PIN_WINDOW_S s after it (a
  // later one would misdate it). The line is a monotone cubic through at most KNOTS averaged knots,
  // drawn as short segments, so it never overshoots a real value.
  const SAMPLE_S = 5;
  const PIN_WINDOW_S = 20;
  const KNOTS = 24;
  const GRAPH = { width: 184, pad: 6, zero: 25, amp: 20, pin: 7, step: 2, line: 3, pinGap: 14 };
  // The graph box at 100% (oh_bar.css): 200 px wide in the 360 px clock stack, 4 px under the timers.
  const GRAPH_BOX = 200;
  const GRAPH_TOP = 4;
  const GRAPH_GAP = 4; // graph top under the stock rift HUD
  // Objective cues (decisions/objective-timers.md, live-tested on demo 121685912): show windows in seconds.
  // Bridge buff 5:00 then every 5:00, urn 10:00 then every 5:00 (game clock); the rift's time is random and
  // not networked, so its chip starts with the minimap warning 20 s before; the mid-boss from the stock
  // timer; a held rejuvenator for its 3:00 buff. "UP" stays at most up s (urnUp while the urn falls).
  // Fixed timings; how early each timer shows comes from state.cues (seconds, 0 off, -1 always).
  const CUE = { rift: 20, soon: 10, up: 30, urnUp: 15, rejuv: 180 };
  // Order of the other chips; the mid-boss chip goes in the middle of whatever shows.
  const CUE_ORDER = ["Bridge", "Urn", "Rift"];
  const CUE_KINDS = ["Bridge", "Urn", "Rift", "Mid"];
  const CUE_STATES = ["OHSoon", "OHLive", "OHHeldAmber", "OHHeldSapphire"];
  const NO_CARDS = Object.freeze([]); // $.OHHost.cards() while not spectating

  const S = $.OHState;
  const valid = S.valid;
  const parseClock = S.parseClock;
  const context = $.GetContextPanel();
  if (typeof context.OHHostStop === "function") context.OHHostStop();
  let stopped = false;
  const logged = new Set();
  const logOnce = (key, message) => {
    if (logged.has(key)) return;
    logged.add(key);
    $.Msg(`${TAG} ${message}`);
  };

  // ------------------------------------------------------------------ state

  let state = S.defaults();
  let version = 0;
  let hudRoot = null;
  const listeners = [];

  function topPanel() {
    if (valid(hudRoot)) return hudRoot;
    let panel = context;
    for (let depth = 0; depth < 40; depth++) {
      const parent = panel.GetParent();
      if (!valid(parent)) break;
      panel = parent;
    }
    hudRoot = panel;
    return panel;
  }

  let carried = false; // the state came from the HUD root (a layout reload), not a fresh process
  function adoptState() {
    try {
      const raw = topPanel().GetAttributeString(S.ATTR, "");
      if (raw) {
        state = S.normalize(JSON.parse(raw));
        carried = true;
      }
    } catch (e) {
      state = S.defaults();
    }
  }

  function setState(next) {
    const style = state.style;
    state = S.normalize(next);
    version++;
    try {
      topPanel().SetAttributeString(S.ATTR, JSON.stringify(state));
    } catch (e) {
      logOnce("attr", "could not keep the state on the HUD root");
    }
    try {
      if (UI.bar) renderBar();
      if (UI.band) renderBand();
      renderNames();
      if (state.style !== style && UI.bar && UI.band && spectating()) place();
      renderGraph();
    } catch (e) {
      logOnce("render", `render failed: ${e && e.message ? e.message : e}`);
    }
    notify();
  }

  // ------------------------------------------------------------------ panels

  const UI = {
    hud: null, topBar: null, escape: null, bar: null, band: null, menu: null, entry: null, entryMenu: null, time: null,
    sides: {}, clockBans: {}, desk: {}, strips: {}, corners: {}, mid: null, org: null, orgName: null,
    midSeries: {}, who: [], info: null, clock: null, stageBox: null, stage: null, format: null,
    graph: null, graphLead: null, graphDraw: null, cards: [], pushed: false, digits: {}, pause: { wait: 0 }, arch: null, rings: null,
    cue: [], stock: {}
  };
  const writes = new Map(); // panel -> { key: last written value }

  // The cache is checked before the panel: an unchanged value costs no native call.
  function setText(panel, text) {
    if (!panel) return;
    const last = writes.get(panel) || {};
    if (last.text === text || !valid(panel)) return;
    panel.text = text;
    last.text = text;
    writes.set(panel, last);
  }
  // Panorama quirk (live 2026-10-23, [OH-PAUSE] log; HP Colors v3 saw it on 6805): clearing an inline
  // visibility: collapse (null) leaves the panel hidden (.visible stays false). So a panel that must come
  // back is written "visible" (own panels), hidden with a class, or faded with opacity (stock panels).
  function setStyle(panel, key, value) {
    if (!panel) return;
    const last = writes.get(panel) || {};
    if (last[key] === value || !valid(panel)) return;
    panel.style[key] = value;
    last[key] = value;
    writes.set(panel, last);
  }
  function setClass(panel, name, on) {
    if (!panel) return;
    const last = writes.get(panel) || {};
    const key = "." + name;
    if (last[key] === on || !valid(panel)) return;
    panel.SetHasClass(name, on);
    last[key] = on;
    writes.set(panel, last);
  }
  function setHero(image, id) {
    if (!image) return;
    const last = writes.get(image) || {};
    if (last.hero === id || !valid(image)) return;
    if (id > 0) image.SetHeroID(id);
    last.hero = id;
    writes.set(image, last);
  }
  const px = (value) => `${Math.round(value)}px`;

  // Loads a layout into a new panel; the created panel takes the layout root's classes (spike).
  function inject(parent, id, layout) {
    const panel = $.CreatePanel("Panel", parent, id);
    if (!panel.BLoadLayout(layout, false, false)) {
      panel.DeleteAsync(0);
      logOnce(`load:${layout}`, `could not load ${layout}`);
      return null;
    }
    return panel;
  }

  // Panels injected by an earlier instance of this script (a layout reload) are removed once,
  // including v1's portrait aliases.
  function clearOld(root) {
    for (const id of ["OHBar", "OHMenuHost", "OHBandHost", "OHMenuButton"]) {
      const old = root.FindChildTraverse(id);
      if (valid(old)) old.DeleteAsync(0);
    }
    const topBar = root.FindChildTraverse("TopBar");
    if (!valid(topBar)) return;
    for (const [, teamId] of TEAM_PANELS) {
      const team = topBar.FindChildTraverse(teamId);
      const players = team ? team.FindChildTraverse("PlayersContainer") : null;
      if (!players) continue;
      for (const card of players.Children()) {
        for (const host of [card.FindChildTraverse("OHAliasHost"), card.FindChild("OHDebuffsHost")]) {
          if (valid(host)) host.DeleteAsync(0);
        }
      }
    }
  }

  // A team's stock panel and its #PlayersContainer in UI.topBar, cached in UI.stock (cleared on a new
  // #TopBar) and found again when rebuilt, so the top bar is not walked every tick (m1 audit O4).
  function teamPanel(teamId) {
    return stockPanel(`team:${teamId}`, UI.topBar, teamId);
  }
  function findPlayers(teamId) {
    const team = teamPanel(teamId);
    return team ? stockPanel(`players:${teamId}`, team, "PlayersContainer") : null;
  }

  // Moves the stock rift HUD (#KothCashInMeter: margin-top 110 at ui-scale 70%, 120 at 100% when in range
  // or captured; citadel_hud_koth.css 6813) so its top sits at `top` bar px. Whether ui-scale scales its
  // own margin is not known, so the screen px per margin px is measured from the last margin and corrected
  // on the next tick. Returns its height in bar px while it shows, else 0. placeKoth(null, 0) restores it.
  function placeKoth(bar, top) {
    const koth = UI.topBar ? stockPanel("koth", UI.topBar, "KothCashInMeter") : null;
    if (!bar) {
      if (koth) setStyle(koth, "marginTop", null);
      Koth.margin = null;
      return 0;
    }
    if (!koth || koth.visible !== true) return 0;
    const box = rect(koth);
    const parent = rect(koth.GetParent());
    if (!box || !parent) return 0;
    const margin = Koth.margin !== null ? Koth.margin
      : koth.BHasClass("in_range") || koth.BHasClass("captured") ? KOTH_STOCK_RANGE : KOTH_STOCK_TOP;
    const perPx = (box.y - parent.y) / margin > 0 ? (box.y - parent.y) / margin : box.s;
    const want = Math.round((bar.y + top * bar.s - parent.y) / perPx);
    if (Koth.margin === null || Math.abs(want - Koth.margin) >= 1) {
      Koth.margin = want;
      setStyle(koth, "marginTop", px(want));
    }
    return box.h / bar.s;
  }

  // Moves the stock objective health (the walker, patron and mid-boss bars) so the top of the highest one
  // shown sits at `top` bar px, under the timers or the rift HUD (designs 19/20, user 2026-10-23: at its
  // stock HUD y 160 the timers and the soul lead graph covered it). Only the panel's margin-top changes;
  // the bars keep all of the game's styling. The margin is set from the panel's parent (gameplay_hud) and
  // the panel's stock top under it, measured before the first write, so a layout pass that lags a tick
  // cannot make it oscillate. The offset of the highest shown bar under the panel's top is measured while
  // one shows and kept, so the margin stays set between bars and a new one appears in place.
  // Returns the shown bars' height in bar px, else 0. placeObjectives(null, 0) restores the stock spot.
  function placeObjectives(bar, top) {
    if (!bar) {
      if (Obj.margin !== null && valid(Obj.panel)) setStyle(Obj.panel, "marginTop", null);
      Obj.margin = null;
      return 0;
    }
    const panel = stockPanel("objectives", UI.hud, "objectives_health_friendly");
    if (!panel) return 0;
    if (Obj.panel !== panel) { // first sight or a rebuilt HUD: the panel is at its stock margin
      Obj.panel = panel;
      Obj.parent = panel.GetParent();
      Obj.margin = null;
      Obj.base = null;
    }
    const parent = rect(Obj.parent);
    if (!parent) return 0;
    let first = null;
    let last = null;
    for (const objective of panel.FindChildrenWithClassTraverse("objective")) {
      if (!objective.BHasClass("is_active") || objective.BHasClass("is_tier1")) continue;
      const r = rect(objective);
      if (!r || r.h <= 0) continue;
      first = first === null ? r.y : Math.min(first, r.y);
      last = last === null ? r.y + r.h : Math.max(last, r.y + r.h);
    }
    if (first !== null || Obj.base === null) {
      const box = rect(panel);
      if (!box) return 0;
      if (first !== null) Obj.offset = (first - box.y) / box.s;
      if (Obj.base === null && Obj.margin === null) Obj.base = (box.y - parent.y) / box.s;
    }
    if (Obj.base === null) return 0;
    const want = Math.round((bar.y + top * bar.s - parent.y) / parent.s - Obj.base - Obj.offset);
    if (Obj.margin === null || Math.abs(want - Obj.margin) >= 1) {
      Obj.margin = want;
      setStyle(panel, "marginTop", px(want));
    }
    return first === null ? 0 : (last - first) / bar.s;
  }

  // The stock pause box (#PausedInfo, hud_paused.xml: "GAME IS PAUSED" in a 500 x 120 box) becomes DLF's
  // minimal pause while spectating (user 2026-10-23): an 80 px box with "II" at 58 px, and the unpause
  // countdown number (#PausedCountdownLabel, stock 180 px and 175 px left of centre) in II's place.
  // The engine hides the number with .Hidden while paused and shows it each countdown second (live
  // [OH-PAUSE] log 2026-10-23), so II shows exactly while the number has .Hidden. DLF swaps on
  // .PausedTextMoved, which comes and goes with the countdown; the empty box on the second pause was the
  // visibility quirk (see setStyle): II's cleared collapse kept it hidden. II is the box's own child,
  // written visible / collapse; the stock text fades with opacity so it can come back outside spectating.
  // While the box shows (#PausedGameContainer without .Hidden) a 0.1 s watch makes the swap prompt.
  function placePause(on) {
    const pause = UI.pause;
    if (!valid(pause.label)) {
      if (!on || --pause.wait > 0) return;
      const info = valid(UI.hud) ? UI.hud.FindChildTraverse("PausedInfo") : null;
      const label = valid(info) ? info.FindChildTraverse("PausedLabel") : null;
      const box = valid(info) ? info.FindChildTraverse("PausedContainer") : null;
      if (!valid(label) || !valid(label.GetParent()) || !valid(box)) {
        pause.wait = PAUSE_RETRY_TICKS; // another mod's pause layout: look again now and then
        return;
      }
      pause.label = label;
      pause.game = info.FindChildTraverse("PausedGameContainer");
      pause.box = box;
      pause.count = info.FindChildTraverse("PausedCountdownLabel");
      pause.hide = [label].concat(PAUSE_TEXT.map((id) => info.FindChildTraverse(id)).filter(valid));
      pause.icon = box.FindChildTraverse("OHPauseIcon")
        || $.CreatePanel("Label", box, "OHPauseIcon", { class: "PausedText", text: "II", hittest: "false" });
      for (const [key, value] of PAUSE_ICON_STYLE) setStyle(pause.icon, key, value);
    }
    for (const key of ["width", "height"]) setStyle(pause.box, key, on ? "80px" : null);
    for (const panel of pause.hide) setStyle(panel, "opacity", on ? "0" : null);
    for (const [key, value] of PAUSE_COUNT_STYLE) setStyle(pause.count, key, on ? value : null);
    pause.on = on;
    swapPauseIcon();
    if (on && !pause.watching && valid(pause.game) && !pause.game.BHasClass("Hidden")) {
      pause.watching = true;
      $.Schedule(PAUSE_WATCH_S, watchPause);
    }
  }

  // II while the countdown number is hidden; the number (stock visibility) while it counts.
  function swapPauseIcon() {
    const pause = UI.pause;
    const counting = valid(pause.count) && !pause.count.BHasClass("Hidden") && String(pause.count.text || "") !== "";
    setStyle(pause.icon, "visibility", pause.on && !counting ? "visible" : "collapse");
  }

  function watchPause() {
    const pause = UI.pause;
    if (stopped || !pause.on || !valid(pause.label) || !valid(pause.game) || pause.game.BHasClass("Hidden")) {
      pause.watching = false;
      if (!stopped && valid(pause.label)) swapPauseIcon();
      return;
    }
    try {
      swapPauseIcon();
    } catch (e) {
      logOnce("pause", `pause watch failed: ${e && e.message ? e.message : e}`);
    }
    $.Schedule(PAUSE_WATCH_S, watchPause);
  }

  function spectating() {
    if (!valid(UI.hud)) {
      UI.hud = topPanel().FindChildTraverse("Hud");
      if (!valid(UI.hud)) return false;
    }
    return SPECTATOR_CLASSES.some((name) => UI.hud.BHasClass(name));
  }

  // ------------------------------------------------------------------ logos

  // A new Image per source: its load events belong to that source alone. A URL gives one or more
  // sources ($.OHState.logoSources: a host link's direct image or GIF, then a fallback); a failed source
  // makes way for the next. The monogram (or wordmark) stays until an image reports ImageLoaded; a failed
  // or replaced image is deleted. URLs are never logged.
  function logoSlot(logo, imageClass, onShown) {
    return { logo, imageClass, onShown: onShown || null, image: null, url: "", sources: [], logoState: "none", logoSeq: 0 };
  }
  function showLogo(slot, on) {
    setClass(slot.logo, "OHLogoShown", on);
    if (slot.onShown) slot.onShown(on);
  }
  function setLogo(slot, url) {
    if (!slot || slot.url === url) return;
    slot.url = url;
    slot.sources = S.logoSources(url);
    showLogo(slot, false);
    loadLogo(slot, 0);
  }
  function loadLogo(slot, index) {
    if (valid(slot.image)) slot.image.DeleteAsync(0);
    slot.image = null;
    const source = index < slot.sources.length ? slot.sources[index] : "";
    slot.logoState = source ? "loading" : "none";
    if (!source || !valid(slot.logo)) return;
    // Team logos fill their circle or square (cover); the organiser logo fits inside its box.
    const image = $.CreatePanel("Image", slot.logo, `OHLogoImage${++slot.logoSeq}`, {
      scaling: slot.imageClass === "OHOrgLogoImage" ? "stretch-to-fit-preserve-aspect" : "stretch-to-cover-preserve-aspect", hittest: "false"
    });
    image.AddClass(slot.imageClass);
    slot.image = image;
    if (slot.imageClass === "OHDeskLogoImage") sizeDeskImage(image);
    if (slot.imageClass === "OHLogoImage") setStyle(image, "borderRadius", state.logo.shape === "square" ? "3px" : "50%");
    $.RegisterEventHandler("ImageLoaded", image, () => {
      if (slot.image !== image) return;
      slot.logoState = "loaded";
      showLogo(slot, true);
      notify();
    });
    $.RegisterEventHandler("ImageFailedLoad", image, () => {
      if (slot.image !== image) return;
      if (index + 1 < slot.sources.length) {
        loadLogo(slot, index + 1);
        return;
      }
      slot.logoState = "failed";
      image.DeleteAsync(0);
      slot.image = null;
      showLogo(slot, false);
      $.Msg(`${TAG} a logo failed to load; showing the fallback`);
      notify();
    });
    image.SetImage(source);
  }

  // ------------------------------------------------------------------ tournament bar (in #TopBar)

  function ensureBar() {
    if (valid(UI.bar) && valid(UI.topBar) && UI.bar.GetParent() === UI.topBar) return true;
    UI.topBar = topPanel().FindChildTraverse("TopBar");
    if (!valid(UI.topBar)) {
      logOnce("topbar", "no #TopBar yet (another mod's top bar?); the bar waits");
      return false;
    }
    const old = UI.topBar.FindChild("OHBar");
    if (valid(old)) old.DeleteAsync(0);
    UI.bar = inject(UI.topBar, "OHBar", LAYOUT.bar);
    if (!UI.bar) return false;
    const find = (id) => UI.bar.FindChildTraverse(id);
    for (const side of SIDES) {
      UI.clockBans[side] = {
        bans: find(`OHBans${side}`), ban: [0, 1].map((n) => find(`OHBan${side}${n}`)),
        banImage: [0, 1].map((n) => find(`OHBan${side}${n}Image`))
      };
    }
    UI.clock = find("OHClock");
    UI.graph = find("OHGraph");
    UI.graphLead = find("OHGraphLead");
    UI.graphPlot = find("OHGraphPlot");
    const inGraph = (cls) => valid(UI.graph) ? UI.graph.FindChildrenWithClassTraverse(cls)[0] || null : null;
    UI.graphHead = inGraph("OHGraphHead");
    UI.graphTitle = inGraph("OHGraphTitle");
    UI.graphZero = inGraph("OHGraphZero");
    UI.graphDraw = find("OHGraphDraw");
    UI.cues = find("OHCues");
    UI.scoreSpace = find("OHScoreSpace");
    UI.cue = [0, 1, 2, 3].map((i) => ({ panel: find(`OHCue${i}`), time: find(`OHCue${i}Time`) }));
    UI.stock = {};
    UI.time = stockPanel("time", UI.topBar, "GameTime");
    writes.clear();
    UI.pushed = false;
    Graph.drawn = "";
    Teams.amber.side = "";
    Teams.sapphire.side = "";
    $.Msg(`${TAG} bar injected into #TopBar`);
    if (valid(UI.band)) renderBand();
    renderBar();
    return true;
  }

  // ------------------------------------------------------------------ band (next to #TopBar)

  // The band sits right after #TopBar in its parent: the stock top bar's #GradientBacker glow (drawn
  // with #TopBar) would otherwise wash the band orange (live 2026-10-22), and the stock panels after
  // #TopBar (shop, damage report, menus) still draw over it.
  function ensureBand() {
    const parent = UI.topBar.GetParent();
    if (!valid(parent)) return false;
    if (valid(UI.band) && UI.band.GetParent() === parent) {
      if (UI.bandAfter !== UI.topBar) {
        parent.MoveChildAfter(UI.band, UI.topBar);
        UI.bandAfter = UI.topBar;
      }
      return true;
    }
    const old = parent.FindChild("OHBandHost");
    if (valid(old)) old.DeleteAsync(0);
    const band = inject(parent, "OHBandHost", LAYOUT.band);
    if (!band) return false;
    parent.MoveChildAfter(band, UI.topBar);
    UI.bandAfter = UI.topBar;
    UI.band = band;
    UI.bandBack = band.FindChildTraverse("OHBandBack");
    const find = (id) => band.FindChildTraverse(id);
    for (const side of SIDES) {
      UI.strips[side] = find(`OHStrip${side}`);
      UI.corners[side] = find(`OHCorner${side}`);
      UI.desk[side] = {
        team: find(`OHDesk${side}`), mono: find(`OHDeskMono${side}`), name: find(`OHDeskName${side}`),
        bans: find(`OHDeskBans${side}`), ban: [0, 1].map((n) => find(`OHDeskBan${side}${n}`)),
        banImage: [0, 1].map((n) => find(`OHDeskBan${side}${n}Image`)), teamKey: "",
        slot: logoSlot(find(`OHDeskLogo${side}`), "OHDeskLogoImage")
      };
      UI.midSeries[side] = find(`OHMidSeries${side}`);
      // Base Game+ Names plates, joins and centre-tab scores (design 17).
      UI.sides[side] = {
        team: find(`OHTeam${side}`), plate: find(`OHPlate${side}`), mono: find(`OHMono${side}`),
        name: find(`OHName${side}`), cap: find(`OHCap${side}`), join: find(`OHJoin${side}`), teamKey: "",
        slot: logoSlot(find(`OHLogo${side}`), "OHLogoImage")
      };
      UI.digits[side] = { box: find(`OHScore${side}`), text: find(`OHScoreText${side}`) };
      // The digits sit at the tab's ends over its full height, outside the wordmark's flow.
      setStyle(UI.digits[side].box, "ignoreParentFlow", "true");
    }
    UI.dividers = { Left: find("OHDividerLeft"), Right: find("OHDividerRight") };
    UI.cornerText = { event: find("OHCornerEvent"), stage: find("OHCornerStage"), game: find("OHCornerGame"), first: find("OHCornerFirst") };
    UI.mid = find("OHMid");
    UI.arch = find("OHArch");
    UI.rings = find("OHRings");
    UI.archParts = {
      clip: { Left: find("OHArchLeft"), Right: find("OHArchRight") },
      curve: { Left: find("OHArchCurveLeft"), Right: find("OHArchCurveRight") },
      edge: { Left: find("OHPlateEdgeLeft"), Right: find("OHPlateEdgeRight") }
    };
    UI.orgName = find("OHOrgName");
    UI.org = logoSlot(find("OHOrgLogo"), "OHOrgLogoImage", (on) => setClass(UI.mid, "OHOrgLogoShown", on));
    UI.who = [];
    for (let i = 0; i < WHO_SLOTS; i++) UI.who.push(find(`OHWho${i}`));
    UI.info = { root: find("OHInfo"), title: find("OHInfoTitle"), value: find("OHInfoValue"), caption: find("OHInfoCaption") };
    for (const card of UI.cards) card.who = "";
    $.Msg(`${TAG} band injected into the HUD`);
    renderBand();
    return true;
  }

  // Which side each team's stock panel is on: left of the HUD centre is the left side.
  const Teams = { amber: { side: "", rect: null }, sapphire: { side: "", rect: null } };
  function sideOf(rect, hud) {
    return rect.x + rect.w / 2 < hud.x + hud.w / 2 ? "Left" : "Right";
  }
  // A team without a measured side keeps the stock layout's: Amber left.
  const teamOn = (side) => {
    const amberSide = Teams.amber.side || (Teams.sapphire.side === "Left" ? "Right" : "Left");
    return side === amberSide ? "amber" : "sapphire";
  };

  function renderBans(slot, bans) {
    bans.forEach((id, index) => {
      setClass(slot.ban[index], "OHBanSet", id > 0);
      setHero(slot.banImage[index], id);
    });
    setClass(slot.bans, "OHHasBans", bans.some((id) => id > 0));
  }

  function renderBar() {
    if (!valid(UI.bar)) return;
    const desk = state.style === "desk";
    setClass(UI.bar, "OHStyleDesk", desk);
    for (const side of SIDES) renderBans(UI.clockBans[side], state[teamOn(side)].bans);
  }

  // Night Desk's corners and the Names plates' captions say the same things.
  const gameNumber = () => Math.min(state.bestOf, state.amber.series + state.sapphire.series + 1);
  const stageCaption = () => state.stage ? `${state.stage} · BO${state.bestOf}` : `BEST OF ${state.bestOf}`;
  const gameCaption = () => `GAME ${gameNumber()} · FIRST TO ${S.winsNeeded(state.bestOf)}`;

  function renderBand() {
    if (!valid(UI.band)) return;
    const desk = state.style === "desk";
    setClass(UI.band, "OHStyleDesk", desk);
    setClass(UI.band, "OHStyleNames", !desk);
    for (const side of SIDES) {
      const teamKey = teamOn(side);
      const team = state[teamKey];
      setClass(UI.strips[side], "OHSapphire", teamKey === "sapphire");
      const slot = UI.desk[side];
      if (slot.teamKey !== teamKey) {
        setClass(slot.team, "OHAmber", teamKey === "amber");
        setClass(slot.team, "OHSapphire", teamKey === "sapphire");
        // The logo ring sits in the arch beside the centre, outside the team block: it carries the colour.
        setClass(slot.slot.logo, "OHAmber", teamKey === "amber");
        setClass(slot.slot.logo, "OHSapphire", teamKey === "sapphire");
        slot.teamKey = teamKey;
      }
      setText(slot.name, team.name);
      setClass(slot.name, "OHNameLong", team.name.length > NAME_LONG && team.name.length <= NAME_LONGER);
      setClass(slot.name, "OHNameLonger", team.name.length > NAME_LONGER);
      setText(slot.mono, S.monogram(team));
      setLogo(slot.slot, desk ? team.logo.url : "");
      renderBans(slot, team.bans);
      // Base Game+ Names plate: name over a caption, logo at the inner end; the score in the centre tab.
      const plate = UI.sides[side];
      if (plate && plate.teamKey !== teamKey) {
        for (const panel of [plate.team, plate.join, UI.digits[side].box]) {
          setClass(panel, "OHAmber", teamKey === "amber");
          setClass(panel, "OHSapphire", teamKey === "sapphire");
        }
        plate.teamKey = teamKey;
      }
      if (plate) {
        setText(plate.name, team.name);
        setText(plate.mono, S.monogram(team));
        setText(plate.cap, side === "Left" ? stageCaption() : gameCaption());
        setClass(plate.team, "OHCurve", state.logo.shape === "circle");
        // Each look loads the team logo only where it shows it.
        setLogo(plate.slot, desk ? "" : team.logo.url);
      }
      setText(UI.digits[side].text, String(team.series));
      setText(UI.midSeries[side], String(team.series));
      setClass(UI.midSeries[side], "OHAmber", teamKey === "amber");
      setClass(UI.midSeries[side], "OHSapphire", teamKey === "sapphire");
    }
    // Centre: the organiser logo, else its name; Base Game+ Names falls back to the event title.
    const word = state.org.name || (desk ? "" : state.event);
    setLogo(UI.org, state.org.logo.url);
    setText(UI.orgName, word);
    setClass(UI.mid, "OHHasOrg", !!(word || state.org.logo.url));
    setClass(UI.mid, "OHNoOrg", !(word || state.org.logo.url));
    setText(UI.cornerText.event, state.event);
    setClass(UI.cornerText.event, "OHCornerLong", state.event.length > EVENT_LONG);
    setText(UI.cornerText.stage, stageCaption());
    setText(UI.cornerText.game, `GAME ${gameNumber()}`);
    setText(UI.cornerText.first, `FIRST TO ${S.winsNeeded(state.bestOf)}`);
    const info = state.info;
    setClass(UI.info.root, "OHHasInfo", !!info.title);
    setText(UI.info.title, info.title);
    setText(UI.info.value, info.value);
    setClass(UI.info.value, "OHEmpty", !info.value);
    setText(UI.info.caption, info.caption);
    setClass(UI.info.caption, "OHEmpty", !info.caption);
  }

  function rect(panel) {
    if (!valid(panel)) return null;
    const pos = panel.GetPositionWithinWindow();
    const r = { x: Number(pos.x), y: Number(pos.y), w: Number(panel.actuallayoutwidth), h: Number(panel.actuallayoutheight),
      s: Number(panel.actualuiscale_x) || 0 };
    return [r.x, r.y, r.w, r.h, r.s].every(Number.isFinite) && r.s > 0 && r.w > 0 ? r : null;
  }

  // Places everything from the stock panels it belongs to. #TopBar is width: fit-children and clips,
  // so the bar spans the HUD width (spike); the band spans it from the HUD's top-left corner.
  function place() {
    const hud = rect(topPanel());
    if (!hud) return;
    // The spread the layout shows now (written last tick); placeNames measures stock gaps only at 0.
    Spread.shown = Spread.cur;
    const width = Math.round(hud.w / hud.s);
    setStyle(UI.bar, "width", `${width}px`);
    setStyle(UI.band, "width", `${width}px`);
    setStyle(UI.topBar, "marginTop", px(BAND[state.style] + STOCK_TOP_MARGIN - TOP_BAR_TUCK));
    UI.pushed = true;
    const bar = rect(UI.bar);
    if (!bar) return;
    let flipped = false;
    for (const [key, teamId] of TEAM_PANELS) {
      const teamRect = rect(teamPanel(teamId));
      Teams[key].rect = teamRect;
      if (!teamRect) {
        logOnce(`team:${teamId}`, `no #${teamId} in the top bar; its plate keeps the stock side`);
        continue;
      }
      const side = sideOf(teamRect, hud);
      if (Teams[key].side !== side) {
        Teams[key].side = side;
        flipped = true;
      }
      placePlate(side, teamRect, hud);
    }
    if (flipped) {
      renderBar();
      renderBand();
      for (const card of UI.cards) card.who = "";
      renderNames();
    }
    // #GameTime is found again when it is rebuilt or arrives late (it used to be found once per bar, so a
    // clock that came back stayed hidden until the next #TopBar).
    UI.time = stockPanel("time", UI.topBar, "GameTime");
    const time = rect(UI.time);
    // The clock's parts hide by class while #GameTime is missing (a cleared inline collapse never shows a
    // panel again, ENGINE.md); the stylesheets' own rules (look, bans set) still decide otherwise.
    for (const panel of [UI.clock, UI.mid, UI.arch, UI.rings, UI.clockBans.Left.bans, UI.clockBans.Right.bans]) {
      setClass(panel, "OHGone", !time);
    }
    if (time) {
      const centre = (time.x + time.w / 2 - bar.x) / bar.s;
      setStyle(UI.clock, "marginLeft", px(centre - CLOCK_WIDTH / 2));
      // The stack sits at its mockup spot under the clock (user 2026-10-23), below the stock rejuvenator
      // charges while a team's rejuvenator icons show there (live 2026-10-22: the held-rejuvenator chips
      // sit under them; the scoreboard collapses the charges). The icons only show while a rejuvenator is
      // held (#RejuvenatorTimer.has_rejuv, live 2026-10-22), so that one class gates the side checks.
      const drop = (time.y + time.h - bar.y) / bar.s + CLOCK_DROP[state.style];
      const charges = stockPanel("charges", UI.topBar, "RejuvenatorCharges");
      const held = stockPanel("timer", UI.topBar, "RejuvenatorTimer");
      const icons = charges && held && held.BHasClass("has_rejuv") && charges.visible === true
        && ["RejuvenatorFriendly", "RejuvenatorEnemy"].some((id) => {
        const side = stockPanel(id, charges, id);
        return valid(side) && REJUV_COUNTS.some((cls) => side.BHasClass(cls));
      });
      const chargesBox = icons ? rect(charges) : null;
      const clockTop = chargesBox ? Math.max(drop, (chargesBox.y + chargesBox.h - bar.y) / bar.s + 2) : drop;
      setStyle(UI.clock, "marginTop", px(clockTop));
      // The scoreboard's kills row: the stock classes show #OHScoreSpace with it (oh_bar.css); its height
      // is the room from the stack's spot to 2 px under the row (measured while shown, else the stock
      // margin-top 80 + one 3 + 40 + 3 px row; the bar starts at the top bar's top).
      const scores = stockClassPanel("scores", UI.topBar, "KillsAndAbilityPointsContainer");
      const scoresBox = scores && scores.visible === true ? rect(scores) : null;
      const killsBottom = scoresBox ? (scoresBox.y + scoresBox.h - bar.y) / bar.s : KILLS_BOTTOM;
      const space = Math.max(0, Math.round(killsBottom + 2 - clockTop));
      setStyle(UI.scoreSpace, "height", px(space));
      // The timers stay put; the stock rift HUD moves below them, the stock objective health below that
      // (or below the timers), and the soul lead graph (under the timers in the stack) below whichever
      // shows (user 2026-10-23, live: the stock spots are behind the chips; designs 19/20).
      // Graph.floor: the least graph margin-top that clears them. Graph.held: the rift HUD and an objective
      // bar both show, so the graph waits instead of sitting a whole stock panel lower.
      // Under the chips, plus the scoreboard spacer while the kills row shows.
      const cuesH = valid(UI.cues) ? Number(UI.cues.actuallayoutheight) / bar.s || 0 : 0;
      const cuesBottom = clockTop + (scoresBox ? space : 0) + CUES_TOP[state.style] + cuesH;
      const kothH = placeKoth(bar, cuesBottom + KOTH_GAP);
      const objTop = kothH ? cuesBottom + KOTH_GAP + kothH + OBJ_GAP : cuesBottom + OBJ_GAP;
      const objH = placeObjectives(bar, objTop);
      Graph.floor = objH ? objTop - cuesBottom + objH + GRAPH_GAP : kothH ? KOTH_GAP + kothH + GRAPH_GAP : null;
      Graph.held = kothH > 0 && objH > 0;
      // Clock bans hug the stock clock box; the left team's grow away from it.
      const top = px((time.y + time.h / 2 - bar.y) / bar.s - BAN_SIZE / 2);
      for (const side of SIDES) {
        const box = UI.clockBans[side];
        const count = state[teamOn(side)].bans.filter((id) => id > 0).length;
        const left = side === "Left"
          ? (time.x - bar.x) / bar.s - CLOCK_PAD - 6 - count * BAN_STEP
          : (time.x + time.w - bar.x) / bar.s + CLOCK_PAD + 6;
        setStyle(box.bans, "marginLeft", px(left));
        setStyle(box.bans, "marginTop", top);
      }
      Spread.bans = bansSpread(time, hud);
      // Night Desk's centre plate widens by (size - 30) / 2 px a side (live 2026-10-23: a 44 px logo covered
      // "COMMUNITY CUP" on the 192 px plate), so the organiser keeps 154 px between the tabs at every size;
      // the name then shrinks (15, 13, 11 px) before its ellipsis.
      const desk = state.style === "desk";
      const plate = desk ? MID_WIDTH.desk + 2 * plateGrowOf() : MID_WIDTH[state.style];
      const midLeft = (time.x + time.w / 2 - hud.x) / hud.s - plate / 2;
      setStyle(UI.mid, "marginLeft", px(midLeft));
      setStyle(UI.mid, "width", desk ? px(plate) : null);
      Desk.plate = plate;
      fitOrg(desk ? plate - 2 * (state.logo.size / 2 + 2) - 2 * ORG_PAD : plate - 2 * SCORE_W - 2 * ORG_PAD);
      // Night Desk arch (d15 A, sized by state.logo, design 16): the tabs under the plate and the logos
      // over it, on its edges; #OHArch and #OHRings start one tab half left of the plate.
      Desk.midLeft = midLeft;
      const half = layoutArch();
      for (const panel of [UI.arch, UI.rings]) setStyle(panel, "marginLeft", px(midLeft - half));
    } else {
      logOnce("clock", "no #GameTime in the top bar; the stage, clock bans, graph and centre stay hidden");
      Desk.midLeft = null;
      Graph.held = false;
      Spread.bans = 0;
    }
    placeSpread(true);
    placeBand(hud);
  }

  // Night Desk arch geometry for state.logo (design 16), in px inside #OHArch / #OHRings, whose left edge
  // is one tab half (half) left of the plate: plate edges at half and half + 192. Returns half.
  // Tabs: a 2*half box (circle: 50% radius; square: 4 px corners) clipped to its outer half (+1 px);
  // the plate's side borders run only under the tabs; logos centred on the edges at the band's y 1 + half.
  function layoutArch() {
    const size = state.logo.size;
    const square = state.logo.shape === "square";
    const half = size / 2 + 2;
    const tab = 2 * half;
    const plate = Desk.plate;
    const a = UI.archParts;
    for (const panel of [UI.arch, UI.rings]) setStyle(panel, "width", px(plate + tab));
    for (const side of SIDES) {
      setStyle(a.clip[side], "width", px(half + 1));
      setStyle(a.clip[side], "height", px(tab));
      setStyle(a.curve[side], "width", px(tab));
      setStyle(a.curve[side], "height", px(tab));
      setStyle(a.curve[side], "borderRadius", square ? "4px" : "50%");
      setStyle(a.edge[side], "marginTop", px(1 + tab));
      setStyle(a.edge[side], "height", px(Math.max(0, BAND_H - 1 - tab)));
      const logo = UI.desk[side].slot.logo;
      setStyle(logo, "width", px(size));
      setStyle(logo, "height", px(size));
      setStyle(logo, "marginTop", px(1 + half - size / 2));
      setStyle(logo, "borderRadius", square ? "3px" : "50%");
      sizeDeskImage(UI.desk[side].slot.image);
      setStyle(UI.desk[side].mono, "fontSize", px(Math.round(9 * size / LOGO_BASE)));
    }
    setStyle(a.clip.Right, "marginLeft", px(plate + half - 1));
    setStyle(a.curve.Right, "marginLeft", px(1 - half));
    setStyle(a.edge.Left, "marginLeft", px(half));
    setStyle(a.edge.Right, "marginLeft", px(plate + half - 1));
    setStyle(UI.desk.Left.slot.logo, "marginLeft", px(half - size / 2));
    setStyle(UI.desk.Right.slot.logo, "marginLeft", px(plate + half - size / 2));
    return half;
  }
  // A team image fills its logo inside the 1 px ring, clipped to the logo's shape.
  function sizeDeskImage(image) {
    if (!image) return;
    setStyle(image, "width", px(state.logo.size - 2));
    setStyle(image, "height", px(state.logo.size - 2));
    setStyle(image, "borderRadius", state.logo.shape === "square" ? "2px" : "50%");
  }

  // Past LOGO_BASE px, Night Desk spreads the stock teams outward by size - LOGO_BASE each: #TeamsContainer
  // (the teams align to its left and right edges) gets that much wider on both sides. Its stock width is
  // measured before the first write; the plates, names and team blocks follow the teams' rectangles.
  // Past LOGO_BASE px the logo reaches the player-names row, so each team moves out by the plate's growth
  // plus size - 30 more (live 2026-10-23: when the plate took the whole spread, the 50 px logos covered
  // the innermost player names): 1.5 x (size - 30) px a side; at 50 px the innermost name box ends at
  // the tab's outer edge.
  function plateGrowOf() {
    return state.style === "desk" ? Math.max(0, state.logo.size - LOGO_BASE) / 2 : 0;
  }
  function spreadOf() {
    return state.style === "desk" ? 3 * plateGrowOf() : Spread.bans;
  }
  // Base Game+ Names: the clock bans sit between the clock box and each team's innermost card (live
  // 2026-10-23: at 28 and 32 px they covered the innermost portraits). The stock teams spread outward by
  // what the tighter side lacks, from the stock gaps measured while nothing was spread (placeNames), so
  // the spread never feeds back on itself. The gaps belong to one layout (HUD width, team sides, card
  // counts); when it changes they are measured again unspread (one tick at the stock width).
  const spreadKey = (hud) => {
    let amber = 0;
    for (const card of UI.cards) if (card.teamKey === "amber") amber++;
    return `${hud.w}|${hud.s}|${Teams.amber.side}|${Teams.sapphire.side}|${amber}|${UI.cards.length - amber}`;
  };
  function bansSpread(time, hud) {
    const stock = Spread.stock;
    if (state.style !== "names" || !stock || stock.key !== spreadKey(hud)) return 0;
    let lack = 0;
    for (const key of ["amber", "sapphire"]) {
      const span = stock[key];
      const side = Teams[key].side;
      const count = state[key].bans.filter((id) => id > 0).length;
      if (!span || !count || !side) continue;
      const gap = side === "Left" ? time.x - (span.x + span.n * span.w) : span.x - (time.x + time.w);
      lack = Math.max(lack, CLOCK_PAD + 6 + count * BAN_STEP + BAN_CLEAR - gap / hud.s);
    }
    return Math.max(0, Math.ceil(lack));
  }
  // The organiser name or logo in the centre fits `room` px (Night Desk's plate between the tabs, or the
  // Names tab between the score digits). The name steps down 2 px per tick from 15 px to 11 px while
  // wider than the room (its width is the text's: width fit-children), then the max-width ellipsis.
  function fitOrg(room) {
    const roomPx = Math.max(0, Math.floor(room));
    const word = (writes.get(UI.orgName) || {}).text || "";
    if (Org.room !== roomPx || Org.word !== word) {
      Org.room = roomPx;
      Org.word = word;
      Org.font = ORG_FONT[0];
    } else if (valid(UI.orgName)) {
      const scale = Number(UI.orgName.actualuiscale_x) || 1;
      const width = Number(UI.orgName.actuallayoutwidth) / scale;
      const next = ORG_FONT[ORG_FONT.indexOf(Org.font) + 1];
      if (width > roomPx + 0.5 && next) Org.font = next;
    }
    setStyle(UI.orgName, "maxWidth", px(roomPx));
    setStyle(UI.orgName, "fontSize", px(Org.font));
    setStyle(UI.org.logo, "width", px(Math.min(ORG_LOGO_MAX, roomPx)));
  }

  function placeSpread(on) {
    const box = UI.topBar ? stockPanel("teams", UI.topBar, "TeamsContainer") : null;
    const spread = on ? spreadOf() : 0;
    if (!valid(box)) return;
    if (!spread) {
      setStyle(box, "width", null);
      Spread.base = null;
      Spread.cur = 0;
      return;
    }
    if (Spread.base === null) {
      const scale = Number(box.actualuiscale_x);
      const width = Number(box.actuallayoutwidth);
      if (!(scale > 0) || !(width > 0)) return;
      Spread.base = Math.round(width / scale);
    }
    setStyle(box, "width", px(Spread.base + 2 * spread));
    Spread.cur = spread;
  }

  // Base Game+ Names plate (design 17), in band px: at the screen's top edge, joined to its team's names
  // strip with no gap, as wide as the free space between the screen edge (less EDGE) and the stock team
  // allows (PLATE_MIN to PLATE_MAX). Narrow ends drop the caption, then shrink the name, then the logo.
  function placePlate(side, teamRect, hud) {
    const slot = UI.sides[side];
    if (!slot) return;
    const free = (side === "Left" ? teamRect.x - hud.x : hud.x + hud.w - (teamRect.x + teamRect.w)) / hud.s - EDGE;
    const width = Math.max(PLATE_MIN, Math.min(PLATE_MAX, Math.floor(free)));
    const shown = free >= PLATE_MIN;
    setStyle(slot.team, "width", px(width));
    setClass(slot.team, "OHNoCap", width < PLATE_CAPTION);
    setClass(slot.team, "OHCompact", width < PLATE_COMPACT);
    setClass(slot.team, "OHNarrow", width < PLATE_NARROW);
    setClass(slot.team, "OHPlateGone", !shown);
    const inner = side === "Left" ? (teamRect.x - hud.x) / hud.s : (teamRect.x + teamRect.w - hud.x) / hud.s;
    setStyle(slot.team, "marginLeft", px(side === "Left" ? inner - width : inner));
    // The join fades the plate's colour into the strip's first JOIN_W px (over the strip, under the names).
    setStyle(slot.join, "marginLeft", px(side === "Left" ? inner : inner - JOIN_W));
    setClass(slot.join, "OHJoinShown", shown);
    layoutPlateLogo(slot, side);
  }
  // The plate logo takes the team logo shape and size (24-50 px, LOGO_LIMITS); the plate's height follows
  // it both ways (logo + 13 px: 37 px at 24, 43 px at the default 30, 63 px at 50; user 2026-10-23), and a
  // circle logo curves the plate's inner bottom corner by the height it hangs below the strip (inline: one
  // radius per corner, top-left, top-right, bottom-right, bottom-left).
  function layoutPlateLogo(slot, side) {
    const size = state.logo.size;
    const square = state.logo.shape === "square";
    const height = size + PLATE_PAD;
    const curve = square ? 0 : height - BAND.names;
    setStyle(slot.team, "height", px(height));
    setStyle(slot.plate, "borderRadius", side === "Left" ? `0px 0px ${curve}px 0px` : `0px 0px 0px ${curve}px`);
    setStyle(slot.slot.logo, "width", px(size));
    setStyle(slot.slot.logo, "height", px(size));
    setStyle(slot.slot.logo, "borderRadius", square ? "3px" : "50%");
    setStyle(slot.slot.image, "borderRadius", square ? "3px" : "50%");
    setStyle(slot.mono, "fontSize", px(Math.round(10 * size / 30)));
  }

  // Band pieces in band px (the band starts at the HUD's top-left corner and uses the HUD's scale).
  function placeBand(hud) {
    const s = hud.s;
    const bandWidth = hud.w / s;
    // Full-width lacquer, as in the mockup (designs/d12-night-desk.html); Night Desk's corners take the
    // place of the stock corner icons (voice, spectator count), which the band covers.
    setStyle(UI.bandBack, "marginLeft", "0px");
    setStyle(UI.bandBack, "width", px(bandWidth));
    const edges = {};
    for (const side of SIDES) {
      const r = Teams[teamOn(side)].rect;
      const strip = UI.strips[side];
      const desk = UI.desk[side];
      // Hidden by class while the team panel is missing: a cleared inline collapse never shows a panel
      // again (ENGINE.md).
      setClass(strip, "OHGone", !r);
      setClass(desk.team, "OHGone", !r);
      if (!r) continue;
      const x = (r.x - hud.x) / s;
      const w = r.w / s;
      setStyle(strip, "marginLeft", px(x));
      setStyle(strip, "width", px(w));
      // Night Desk team block over the stock team: logo ring at the inner end beside the centre, name next
      // to it above the player names, bans at the outer end (user sketch 2026-10-22).
      setStyle(desk.team, "marginLeft", px(x));
      setStyle(desk.team, "width", px(w));
      // The name ends state.logo.gap px from the logo's tab (design 16), however far the teams spread.
      const half = state.logo.size / 2 + 2;
      const inset = Desk.midLeft === null ? DESK_NAME : side === "Left"
        ? x + w - (Desk.midLeft - half - state.logo.gap)
        : Desk.midLeft + Desk.plate + half + state.logo.gap - x;
      const nameInset = Math.max(0, Math.round(inset));
      setStyle(desk.name, side === "Left" ? "marginRight" : "marginLeft", px(nameInset));
      setStyle(desk.name, "maxWidth", px(Math.max(0, w - nameInset - DESK_BANS)));
      edges[side] = side === "Left" ? x - GAP : x + w + GAP;
    }
    // Corners: to the team blocks. The left one starts after the stock mute icon, which draws over the
    // band (live 2026-10-22); the right one runs to the screen edge (the spectator count sits under it).
    const leftWidth = (edges.Left === undefined ? bandWidth / 2 : edges.Left) - EDGE;
    const rightStart = edges.Right === undefined ? bandWidth / 2 : edges.Right;
    const rightWidth = bandWidth - rightStart;
    setStyle(UI.corners.Left, "marginLeft", px(EDGE));
    setStyle(UI.corners.Left, "width", px(Math.max(0, leftWidth)));
    setClass(UI.corners.Left, "OHTooNarrow", leftWidth < CORNER_MIN);
    setStyle(UI.corners.Right, "marginLeft", px(rightStart));
    setStyle(UI.corners.Right, "width", px(Math.max(0, rightWidth)));
    setClass(UI.corners.Right, "OHTooNarrow", rightWidth < CORNER_MIN);
    // The left corner has no left padding (it starts after the mute icon), the right one has both.
    for (const [label, width] of [[UI.cornerText.event, leftWidth - CORNER_PAD], [UI.cornerText.stage, leftWidth - CORNER_PAD],
      [UI.cornerText.game, rightWidth - 2 * CORNER_PAD], [UI.cornerText.first, rightWidth - 2 * CORNER_PAD]]) {
      setStyle(label, "maxWidth", px(Math.max(0, width)));
    }
    // Dividers just outside the team blocks, hidden with their corner.
    setStyle(UI.dividers.Left, "marginLeft", px(leftWidth + EDGE - 6));
    setClass(UI.dividers.Left, "OHTooNarrow", leftWidth < CORNER_MIN);
    setStyle(UI.dividers.Right, "marginLeft", px(rightStart + 5));
    setClass(UI.dividers.Right, "OHTooNarrow", rightWidth < CORNER_MIN);
    setStyle(UI.info.root, "marginLeft", px(INFO_LEFT));
    placeNames(hud);
  }

  // One name per card, centred on it. The stock cards are equal (playerDetailsWidth, margin 0) and flow
  // from the left of #PlayersContainer, which is as wide as the team panel and wider than the cards
  // (live 2026-10-23: dividing the panel evenly drifted the names off their cards). So each team's first
  // card is measured (one read per team per tick) and card k is centred at first.x + (k + 0.5) * first.w;
  // without a measurable card the team panel is divided evenly.
  function placeNames(hud) {
    const counts = { amber: 0, sapphire: 0 };
    const first = { amber: null, sapphire: null };
    for (const card of UI.cards) {
      if (!counts[card.teamKey]++) first[card.teamKey] = rect(card.panel);
    }
    // Each team's card span, unspread: the stock gaps for the clock bans (bansSpread).
    if (!Spread.shown) {
      const span = (key) => first[key] ? { x: first[key].x, w: first[key].w, n: counts[key] } : null;
      Spread.stock = { key: spreadKey(hud), amber: span("amber"), sapphire: span("sapphire") };
    }
    const seen = { amber: 0, sapphire: 0 };
    UI.cards.forEach((card, index) => {
      const label = UI.who[index];
      const team = Teams[card.teamKey].rect;
      const lead = first[card.teamKey];
      const order = seen[card.teamKey]++;
      if (!label) return;
      setClass(label, "OHGone", !lead && !team);
      if (!lead && !team) return;
      const centre = lead ? (lead.x - hud.x + (order + 0.5) * lead.w) / hud.s
        : (team.x - hud.x + (order + 0.5) * team.w / counts[card.teamKey]) / hud.s;
      setStyle(label, "marginLeft", px(centre - WHO_WIDTH / 2));
    });
  }

  // ------------------------------------------------------------------ cards: names and status column

  // A card's player name label, or null (logged once: another top-bar mod may have renamed it).
  function nameLabel(panel) {
    const label = panel.FindChildrenWithClassTraverse("AlwaysPlayerName")[0] ||
      panel.FindChildrenWithClassTraverse("PlayerName")[0] || null;
    if (!label) logOnce("card", "a top-bar card has no player name label; it gets no name in the band");
    return label;
  }

  // The card registry: the host's list of top-bar cards (`{ panel, teamKey, label, debuffs, ult }`), shared
  // with the status column ($.OHHost.cards()). The array is replaced only when its membership changes,
  // and cardsVersion moves whenever the array or a shared field (a re-found label) changes, so readers
  // may cache any field until the version moves (m1 audit R1, m2 review).
  let cardsVersion = 0;
  function ensureCards() {
    const cards = [];
    let changed = false;
    for (const [teamKey, teamId] of TEAM_PANELS) {
      const players = findPlayers(teamId);
      if (!players) continue;
      for (const panel of players.Children()) {
        if (panel.paneltype !== "CitadelHudTopBarPlayer") continue;
        // A known card (its panel just came from Children(), so it is live) keeps its object while its
        // column (the host's own child, deleted with a rebuilt card) lives; a missing name label is
        // looked for again (another top-bar mod may rename it: the column and notices still work).
        const known = UI.cards.find((card) => card.panel === panel);
        if (known && valid(known.debuffs)) {
          if (!valid(known.label)) {
            const label = nameLabel(panel);
            if (label !== known.label) changed = true;
            known.label = label;
          }
          if (!known.ult) known.ult = ultFor(panel, known.debuffs);
          cards.push(known);
          continue;
        }
        let debuffs = panel.FindChild("OHDebuffsHost");
        if (!valid(debuffs)) debuffs = inject(panel, "OHDebuffsHost", LAYOUT.debuffs);
        if (!valid(debuffs)) continue;
        cards.push({ panel: panel, teamKey: teamKey, label: nameLabel(panel), debuffs: debuffs, who: "", ult: ultFor(panel, debuffs) });
      }
    }
    if (cards.length !== UI.cards.length || cards.some((card, index) => UI.cards[index] !== card)) {
      // A card that moved to another slot rewrites its name label.
      for (const card of cards) card.who = "";
      for (let i = cards.length; i < WHO_SLOTS; i++) setClass(UI.who[i], "OHShown", false);
      UI.cards = cards;
      changed = true;
    }
    if (changed) cardsVersion++;
  }

  const cardName = (card) => {
    const text = valid(card.label) ? card.label.text : "";
    return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  };

  // ------------------------------------------------------------------ cards: ultimate cooldown

  // DLF's counter (dlf_ult_cooldown.js) without overriding the stock card (user 2026-10-23: "we forgot to
  // add the ultimate timer"). The game sets the ult_cooldown dialog variable on each card's
  // #UltimateStatusBG, and a binding only sees variables on itself or an ancestor, so a hidden Label of
  // ours bound to {i:ult_cooldown} (#OHUltSource: no size, no opacity, never collapsed) lives inside it,
  // and the column's first row (#OHUltTime, under the stock icon) shows the seconds. The value moves once
  // a second: read at 2 Hz while spectating, written only on change; 0 (ready), unbound or anything that
  // is not 1-4 digits hides the number. ult is null when the card has no #UltimateStatusBG (another
  // top-bar mod) or a read failed; the 1 s tick looks again.
  const ULT_TICK_SEC = 0.5;
  const ULT_BIND = "{i:ult_cooldown}";
  const Ult = { running: false, gen: 0 };
  function ultFor(panel, column) {
    const shown = column.FindChild("OHUltTime");
    const bg = panel.FindChildTraverse("UltimateStatusBG");
    if (!shown || !bg) {
      logOnce("ult", "a top-bar card has no ultimate panel; it gets no ultimate cooldown");
      return null;
    }
    let source = bg.FindChild("OHUltSource");
    if (!source) {
      source = $.CreatePanel("Label", bg, "OHUltSource", { text: ULT_BIND, hittest: "false" });
      for (const [key, value] of [["width", "0px"], ["height", "0px"], ["opacity", "0"]]) setStyle(source, key, value);
    }
    return { source: source, shown: shown, text: null, counting: false };
  }
  function ultTick(gen) {
    if (stopped || gen !== Ult.gen) return;
    if (!watchingNow) {
      Ult.running = false;
      return;
    }
    for (const card of UI.cards) {
      const ult = card.ult;
      if (!ult) continue;
      try {
        const text = ult.source.text;
        if (text === ult.text) continue;
        ult.text = text;
        const seconds = typeof text === "string" && /^\d{1,4}$/.test(text) ? Number(text) : 0;
        if (seconds > 0) setText(ult.shown, String(seconds));
        setClass(ult.shown, "OHCounting", seconds > 0);
        ult.counting = seconds > 0;
      } catch (e) {
        card.ult = null;
      }
    }
    $.Schedule(ULT_TICK_SEC, () => ultTick(gen));
  }
  function startUlt() {
    if (Ult.running) return;
    Ult.running = true;
    const gen = ++Ult.gen;
    ultTick(gen);
  }

  // The band shows each card's alias, else its in-game name; a name two cards share keeps the
  // in-game name on both. The same aliases (unique names only) go to the world healthbars (through the
  // status column's OH_DEBUFF_CONFIG) and the far-away hero markers: Aliases.map, in-game name -> alias.
  const Aliases = { map: {}, upper: new Map(), names: new Set(), sig: "{}", count: 0 };
  const NO_ALIASES = Object.freeze({});
  function renderNames() {
    const names = UI.cards.map(cardName);
    const map = {};
    UI.cards.forEach((card, index) => {
      const name = names[index];
      const unique = name && names.indexOf(name) === names.lastIndexOf(name);
      const alias = unique && Object.prototype.hasOwnProperty.call(state.aliases, name) ? state.aliases[name] : "";
      if (alias) map[name] = alias;
      const label = UI.who[index];
      if (!label) return;
      const shown = alias || name;
      if (card.who === shown) return;
      setText(label, shown);
      setClass(label, "OHShown", !!shown);
      card.who = shown;
    });
    Aliases.names = new Set(names.filter(Boolean).map((name) => name.toUpperCase())); // every card's name
    const sig = JSON.stringify(map);
    if (sig !== Aliases.sig) {
      Aliases.map = map;
      Aliases.upper = new Map(Object.keys(map).map((name) => [name.toUpperCase(), map[name]]));
      Aliases.sig = sig;
      Aliases.count = Object.keys(map).length;
    }
  }

  // Far-away hero markers (stock hud_unit_indicators_v2.xml: CitadelHudUnitIndicatorsV2#unit_indicators_v2,
  // one PlayerEntry per player with its name in CitadelUserName#PlayerName's Label, the hero image and
  // the distance). While spectating with aliases, a marker's name Label shows the alias: matched by the
  // name it shows, else by its hero against the cards' (a Steam friend nickname is not the card's name).
  // The name the engine wrote is kept (real) and written back when the alias goes or spectating ends;
  // a name the engine writes again is taken as the new real name, and the alias goes back on. Nothing
  // is read while there are no aliases and no alias shows. Stock styling stays (the stock Label).
  const Markers = { root: null, retryAt: 0, entries: new Map(), replaced: 0 };
  const MARKER_RESOLVE_MS = 5000; // a marker's alias is looked up again this often (hero swaps)
  function markersRoot(now) {
    if (Markers.root && valid(Markers.root)) return Markers.root;
    Markers.entries = new Map();
    if (now < Markers.retryAt) return null;
    const found = valid(UI.hud) ? UI.hud.FindChildTraverse("unit_indicators_v2") : null;
    Markers.root = found || null;
    if (!found) Markers.retryAt = now + 10000;
    return Markers.root;
  }
  function markerAlias(info) {
    const upper = info.real.toUpperCase();
    const byName = Aliases.map[info.real] || Aliases.upper.get(upper);
    if (byName) return byName;
    // A name some card shows decides (no alias for it); only a name no card shows (a Steam friend
    // nickname) is matched by its hero.
    if (!info.real || Aliases.names.has(upper)) return "";
    const hero = valid(info.hero) ? Number(info.hero.heroid) : NaN;
    if (!(hero > 0)) return "";
    let match = null;
    for (const card of UI.cards) {
      if (!card.badge || !valid(card.badge)) card.badge = card.panel.FindChildTraverse("HeroBadge") || null;
      if (!card.badge || Number(card.badge.heroid) !== hero) continue;
      if (match) return ""; // two cards with this hero: no guess
      match = card;
    }
    return match ? Aliases.map[cardName(match)] || "" : "";
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
      if (info.sig !== Aliases.sig || now - info.at >= MARKER_RESOLVE_MS) {
        info.alias = Aliases.count ? markerAlias(info) : "";
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
  // Spectating ended: every marker shows the name the engine gave it.
  function restoreMarkers() {
    for (const info of Markers.entries.values()) {
      if (info && info.shown !== info.real && valid(info.label)) info.label.text = info.real;
      if (info) info.shown = info.real;
    }
    Markers.replaced = 0;
  }

  // Kill feed names (user 2026-10-23): a stock kill row (CitadelHudInfoFeed) shows the killer and victim
  // through Label.killerInfo / Label.victimInfo bound to {s:killer_name} / {s:victim_name}. With an alias
  // the label gets the alias (which unbinds it) and a hidden Label of ours, bound to the same variable,
  // keeps reading the in-game name, so a row the engine reuses shows its new names; without one the label
  // is bound again. Names resolve as the markers' (by name, else a name no card shows by its hero image).
  // Rows live a few seconds, so while spectating with aliases a FEED_NAMES_S watch reads the row count
  // and passes over the rows when it moves; the 1 s tick passes over them too (reused rows).
  const FEED_NAMES_S = 0.25;
  const FEED_LABELS = [["killerInfo", "{s:killer_name}", "KillerImage"], ["victimInfo", "{s:victim_name}", "VictimImage"]];
  const FeedNames = { rows: new Map(), replaced: 0, count: -1, watching: false, gen: 0 };
  const boundText = (label, bind) => {
    const text = label.text;
    return typeof text === "string" && text !== bind ? text : "";
  };
  // The row's two names, or null for other rows (team events, bans) and rows not built yet.
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
      name.alias = Aliases.count && real ? markerAlias(name) : "";
      name.sig = Aliases.sig;
    }
    if (name.alias) {
      if (!name.hidden) {
        name.hidden = $.CreatePanel("Label", row, "", { text: name.bind, hittest: "false" });
        for (const [key, value] of [["width", "0px"], ["height", "0px"], ["opacity", "0"]]) setStyle(name.hidden, key, value);
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
  function renderFeedNames() {
    if (!Aliases.count && !FeedNames.replaced) return;
    const feed = stockPanel("eventFeed", UI.hud, "EventFeed");
    if (!feed) return;
    const rows = feed.Children();
    const seen = new Map();
    let replaced = 0;
    for (const row of rows) {
      let names = FeedNames.rows.get(row);
      if (!names) names = feedRowNames(row);
      if (!names) continue;
      seen.set(row, names);
      for (const name of names) if (renderFeedName(row, name)) replaced++;
    }
    FeedNames.rows = seen;
    FeedNames.count = rows.length;
    FeedNames.replaced = replaced;
    if (Aliases.count && !FeedNames.watching) {
      FeedNames.watching = true;
      const gen = ++FeedNames.gen;
      $.Schedule(FEED_NAMES_S, () => watchFeedNames(gen));
    }
  }
  function watchFeedNames(gen) {
    if (stopped || gen !== FeedNames.gen || !watchingNow || !Aliases.count) {
      if (gen === FeedNames.gen) FeedNames.watching = false;
      return;
    }
    // No validity call at this rate: the tick re-finds a rebuilt feed; a deleted panel throws here.
    const feed = UI.stock.eventFeed;
    try {
      if (feed && feed.GetChildCount() !== FeedNames.count) renderFeedNames();
    } catch (e) {
      UI.stock.eventFeed = null;
    }
    $.Schedule(FEED_NAMES_S, () => watchFeedNames(gen));
  }
  // Spectating ended: every kill row shows the in-game names, bound again.
  function restoreFeedNames() {
    for (const names of FeedNames.rows.values()) {
      for (const name of names) {
        if (name.shown && valid(name.label)) name.label.text = name.bind;
        name.shown = "";
        name.sig = "";
      }
    }
    FeedNames.replaced = 0;
    FeedNames.gen++;
    FeedNames.watching = false;
  }

  // The stock kill feed (hud_data_feed.xml #EventFeed: top left, margin-top FEED_STOCK_TOP) ran over the
  // leftmost card's status grid and purchase notices (user screenshot 2026-10-23, Night Desk). While
  // spectating it moves down (inline margin-top) to FEED_GAP px under the lowest column it reaches: a card
  // whose grid (half width GRID_HALF_W) or, with notices, notices (NOTICE_HALF_W) start left of the feed's
  // right edge (its widest row, else FEED_W). It goes down at once and back up only after FEED_HOLD_MS, so
  // a blinking status does not bounce it. Card centres are cached until the cards, the look, the logo
  // size or the spread change (and every FEED_GEOMETRY_MS). Back to playing: the stock margin, written
  // as px (an inline null clear is not trusted live).
  const FEED_STOCK_TOP = 200;
  const FEED_GAP = 6;
  const FEED_W = 360;
  const FEED_HOLD_MS = 2000;
  const FEED_GEOMETRY_MS = 30000;
  const GRID_HALF_W = 37; // oh_debuffs.css: a pair is 74 px wide
  const NOTICE_HALF_W = 105; // oh_debuffs.css .OHBuys 209 px
  const ULT_ROW_H = 20; // oh_debuffs.css .OHUltTime, always reserved at the column's top
  const Feed = { margin: FEED_STOCK_TOP, holdUntil: 0, centres: null, key: "", at: 0, x: null, stockTop: 0 };
  // Card centres (screen x) and, found when first needed, each column's notice stack; the feed's
  // own place is read again with them.
  function feedCentres(now) {
    const key = `${cardsVersion}|${state.style}|${state.logo.size}|${Spread.cur}`;
    if (Feed.centres && Feed.key === key && now - Feed.at < FEED_GEOMETRY_MS) return Feed.centres;
    Feed.centres = UI.cards.filter((card) => valid(card.debuffs)).map((card) => ({
      card: card, centre: Number(card.panel.GetPositionWithinWindow().x) + (Number(card.panel.actuallayoutwidth) || 0) / 2,
      buys: null
    }));
    Feed.x = null;
    Feed.key = key;
    Feed.at = now;
    return Feed.centres;
  }
  function placeFeed(on, now) {
    const feed = stockPanel("eventFeed", UI.hud, "EventFeed");
    if (!feed) return;
    let want = FEED_STOCK_TOP;
    if (on) {
      const scale = Number(feed.actualuiscale_y) || 1;
      const centres = feedCentres(now);
      if (Feed.x === null) {
        // The feed's place, read with the card centres: its left edge and its top at the stock margin.
        const at = feed.GetPositionWithinWindow();
        Feed.x = Number(at.x);
        Feed.stockTop = Number(at.y) - (Feed.margin - FEED_STOCK_TOP) * scale;
      }
      let widest = 0;
      for (const row of feed.Children()) widest = Math.max(widest, Number(row.actuallayoutwidth) || 0);
      const right = Feed.x + (widest || FEED_W * scale);
      let bottom = 0;
      // Registry columns are validated by ensureCards each tick; a column's own children need no check.
      for (const entry of centres) {
        if (entry.centre - NOTICE_HALF_W * scale >= right) continue;
        const column = entry.card.debuffs;
        const height = Number(column.actuallayoutheight) || 0;
        // Nothing shown: the reserved ultimate row (20 px) and the empty notice stack's 2 px gap, unless
        // the ultimate counts.
        if (height <= (ULT_ROW_H + 4) * scale && !(entry.card.ult && entry.card.ult.counting)) continue;
        if (!entry.buys) entry.buys = column.FindChild("OHBuys") || null;
        const half = entry.buys && entry.buys.GetChildCount() ? NOTICE_HALF_W : GRID_HALF_W;
        if (entry.centre - half * scale >= right) continue;
        // Read each time it counts: a just-injected column may not be laid out at its stock place yet.
        bottom = Math.max(bottom, Number(column.GetPositionWithinWindow().y) + height);
      }
      if (bottom) want = Math.max(FEED_STOCK_TOP, Math.round(FEED_STOCK_TOP + (bottom + FEED_GAP * scale - Feed.stockTop) / scale));
      if (want >= Feed.margin) Feed.holdUntil = now + FEED_HOLD_MS;
      else if (now < Feed.holdUntil) return;
    }
    if (want === Feed.margin) return;
    setStyle(feed, "marginTop", px(want));
    Feed.margin = want;
  }

  // { amber: [names], sapphire: [names] } from the stock cards, for the editor's alias rows.
  function roster() {
    const out = { amber: [], sapphire: [] };
    for (const card of UI.cards) {
      const name = cardName(card);
      if (name && !out[card.teamKey].includes(name)) out[card.teamKey].push(name);
    }
    return out;
  }

  // ------------------------------------------------------------------ soul lead graph

  // samples: SAMPLE_S bucket -> { t, v } (first sample in the bucket, v in thousands, Amber positive).
  // lastMark: the latest pinned mark seen (a later one shows the graph); every: the interval it is for.
  const Koth = { margin: null };
  // Objective health: the stock panel and its parent, its inline margin-top while moved, its stock top under
  // the parent and the highest shown bar's top under the panel's top (bar px of the panel's own scale).
  const Obj = { panel: null, parent: null, margin: null, base: null, offset: OBJ_STOCK_OFFSET };
  const Desk = { midLeft: null, plate: 192 }; // the centre plate's left edge (band px, once placed) and width
  const Org = { room: null, word: "", font: 15 }; // the organiser name's fit (fitOrg): room, text and font size
  // #TeamsContainer: its stock width while spread (base), the spread written (cur) and shown this tick
  // (shown), the clock bans' spread (bans) and the unspread card spans (stock).
  const Spread = { base: null, cur: 0, shown: 0, bans: 0, stock: null };
  const Graph = { samples: new Map(), lastT: null, lead: null, shownAt: 0, drawn: "", seq: 0, lastMark: 0, every: 0, points: null, floor: null, held: false };

  // "48.2k" (the label may carry markup around the unit) -> souls; null when unreadable.
  function parseSouls(text) {
    const plain = String(text || "").replace(/<[^>]*>/g, "").replace(/,/g, "");
    const match = /(-?\d+(?:\.\d+)?)\s*([kKmM]?)/.exec(plain);
    if (!match) return null;
    const unit = match[2].toLowerCase();
    return parseFloat(match[1]) * (unit === "k" ? 1e3 : unit === "m" ? 1e6 : 1);
  }

  // The pin value for mark m: the first sample in [m, m + PIN_WINDOW_S]; null when none.
  function pinAt(m) {
    let best = null;
    for (let k = m / SAMPLE_S; k <= (m + PIN_WINDOW_S) / SAMPLE_S; k++) {
      const sample = Graph.samples.get(k);
      if (sample && sample.t >= m && sample.t <= m + PIN_WINDOW_S && (!best || sample.t < best.t)) best = sample;
    }
    return best ? best.v : null;
  }
  function latestMark(t, every) {
    for (let m = Math.floor(t / every) * every; m >= every; m -= every) if (pinAt(m) !== null) return m;
    return 0;
  }

  // The stock soul plate label of a team (#TeamScoreFriendly/Enemy .ScoreLabel), found again when rebuilt.
  function scoreLabel(key, id) {
    const cached = UI.stock[`score:${key}`];
    if (cached && valid(cached)) return cached;
    const score = valid(UI.topBar) ? UI.topBar.FindChildTraverse(id) : null;
    const label = score ? score.FindChildrenWithClassTraverse("ScoreLabel")[0] || null : null;
    UI.stock[`score:${key}`] = label;
    return label;
  }

  // Once a tick while spectating: keeps a sample per SAMPLE_S s of game time; a new pinned mark shows
  // the graph; a clock that runs back (a demo seek) drops the samples after it.
  function sampleGraph() {
    const scoreAmber = scoreLabel("amber", "TeamScoreFriendly");
    const scoreSapphire = scoreLabel("sapphire", "TeamScoreEnemy");
    if (!valid(UI.time) || !scoreAmber || !scoreSapphire) return;
    const t = parseClock(UI.time.text);
    if (t === null || t < 0) return;
    const amber = parseSouls(scoreAmber.text);
    const sapphire = parseSouls(scoreSapphire.text);
    if (amber === null || sapphire === null) return;
    Graph.lead = amber - sapphire;
    const every = state.graph.every;
    if (Graph.lastT !== null && t < Graph.lastT - 3) {
      for (const [k, sample] of Array.from(Graph.samples)) if (sample.t > t) Graph.samples.delete(k);
      Graph.lastMark = latestMark(t, every);
      Graph.seq++;
    }
    Graph.lastT = t;
    const k = Math.floor(t / SAMPLE_S);
    if (!Graph.samples.has(k)) Graph.samples.set(k, { t, v: Graph.lead / 1000 });
    if (Graph.every !== every) {
      // A new interval re-pins from the samples without popping the graph.
      Graph.every = every;
      Graph.lastMark = latestMark(t, every);
      Graph.seq++;
      return;
    }
    const mark = Math.floor(t / every) * every;
    if (mark >= every && mark > Graph.lastMark && t - mark <= PIN_WINDOW_S && pinAt(mark) !== null) {
      Graph.lastMark = mark;
      Graph.seq++;
      Graph.shownAt = Date.now();
    }
  }

  // Pins: the run of consecutive pinned marks ending at the latest, from 0:00 when it reaches back to
  // the first mark (a late join or a seek leaves no misleading line over the gap). The line also runs
  // through the samples between them. Recomputed only when seq changes.
  function graphSeries() {
    if (Graph.points && Graph.points.seq === Graph.seq) return Graph.points;
    const every = Graph.every || state.graph.every;
    const pins = [];
    for (let m = Graph.lastMark; m >= every && pinAt(m) !== null; m -= every) pins.unshift({ t: m, v: pinAt(m) });
    if (pins.length && pins[0].t === every) pins.unshift({ t: 0, v: 0 });
    let line = [];
    if (pins.length >= 2) {
      const from = pins[0].t;
      const to = pins[pins.length - 1].t;
      line = pins.slice();
      for (const sample of Graph.samples.values()) {
        if (sample.t > from && sample.t < to && sample.t % every !== 0) line.push(sample);
      }
      line.sort((x, y) => x.t - y.t);
    }
    Graph.points = { seq: Graph.seq, pins, line };
    return Graph.points;
  }
  function graphPoints() {
    return graphSeries().pins.map((p) => ({ m: p.t / 60, v: p.v }));
  }

  // At most KNOTS knots: the ends exactly, the rest averaged over equal slices of time.
  function graphKnots(line) {
    if (line.length <= KNOTS) return line.map((p) => [p.t, p.v]);
    const from = line[0].t;
    const to = line[line.length - 1].t;
    const slots = KNOTS - 2;
    const sums = Array.from({ length: slots }, () => [0, 0, 0]);
    for (let i = 1; i < line.length - 1; i++) {
      const slot = Math.min(slots - 1, Math.floor(((line[i].t - from) / (to - from)) * slots));
      sums[slot][0] += line[i].t;
      sums[slot][1] += line[i].v;
      sums[slot][2]++;
    }
    const knots = [[from, line[0].v]];
    for (const [st, sv, n] of sums) if (n) knots.push([st / n, sv / n]);
    knots.push([to, line[line.length - 1].v]);
    return knots;
  }

  // Monotone cubic (Fritsch-Carlson) through the knots: a function of x that never overshoots.
  function monotoneCurve(knots) {
    const n = knots.length;
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((knots[i + 1][1] - knots[i][1]) / (knots[i + 1][0] - knots[i][0] || 1));
    const m = knots.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const h = a * a + b * b;
      if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (x) => {
      let i = 0;
      while (i < n - 2 && x > knots[i + 1][0]) i++;
      const [x1, y1] = knots[i];
      const [x2, y2] = knots[i + 1];
      const h = x2 - x1 || 1;
      const u = Math.min(1, Math.max(0, (x - x1) / h));
      const u2 = u * u;
      const u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * y1 + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * y2 + (u3 - u2) * h * m[i + 1];
    };
  }

  // GRAPH at size k (state.graph.size / 100): the graph is laid out larger, never bitmap-scaled (a
  // pre-transform-scale2d drew blurry text in DLF live, 2026-10-23).
  const graphAt = (k) => {
    const g = {};
    for (const key of Object.keys(GRAPH)) g[key] = GRAPH[key] * k;
    g.seg = 2 * k;
    return g;
  };
  const fpx = (value) => `${Number(value.toFixed(1))}px`;

  // Box, fonts and position at size k. Size grows the graph around its top centre; x/y move it from its
  // spot (centred in the clock stack, GRAPH_TOP under the timers) and never change with size.
  function layoutGraph() {
    const k = state.graph.size / 100;
    const width = GRAPH_BOX * k;
    setStyle(UI.graph, "width", fpx(width));
    setStyle(UI.graph, "padding", `${fpx(6 * k)} ${fpx(8 * k)} ${fpx(4 * k)} ${fpx(8 * k)}`);
    setStyle(UI.graph, "marginLeft", fpx((CLOCK_WIDTH - width) / 2 + state.graph.x));
    const top = GRAPH_TOP + state.graph.y;
    setStyle(UI.graph, "marginTop", fpx(Graph.floor === null ? top : Math.max(top, Graph.floor)));
    setStyle(UI.graphHead, "height", fpx(13 * k));
    setStyle(UI.graphTitle, "fontSize", fpx(10 * k));
    setStyle(UI.graphTitle, "letterSpacing", fpx(2 * k));
    setStyle(UI.graphLead, "fontSize", fpx(12 * k));
    setStyle(UI.graphPlot, "width", fpx(GRAPH.width * k));
    setStyle(UI.graphPlot, "height", fpx(50 * k));
    setStyle(UI.graphPlot, "marginTop", fpx(4 * k));
    setStyle(UI.graphZero, "marginTop", fpx(GRAPH.zero * k));
  }

  function drawGraph(series) {
    const draw = UI.graphDraw;
    draw.RemoveAndDeleteChildren();
    const g = graphAt(state.graph.size / 100);
    const knots = graphKnots(series.line);
    const curve = monotoneCurve(knots);
    const from = knots[0][0];
    const span = knots[knots.length - 1][0] - from || 1;
    const inner = g.width - 2 * g.pad;
    const valueAt = (x) => curve(from + ((x - g.pad) / inner) * span);
    const max = Math.max(1, Math.ceil(Math.max(...knots.map((k) => Math.abs(k[1])))));
    const yOf = (v) => g.zero - (v / max) * g.amp;
    const add = (cls, styles) => {
      const panel = $.CreatePanel("Panel", draw, "");
      panel.AddClass(cls);
      for (const key of Object.keys(styles)) panel.style[key] = styles[key];
      return panel;
    };
    // Fill: columns from the zero line to the curve, a little wider than the step so no seam shows;
    // amber above, sapphire below.
    for (let x = g.pad; x < g.pad + inner; x += g.step) {
      const y = yOf(valueAt(Math.min(x + g.step / 2, g.pad + inner)));
      if (Math.abs(y - g.zero) < 0.5) continue;
      const fill = add("OHGraphFill", { marginLeft: `${x.toFixed(1)}px`, marginTop: `${Math.min(y, g.zero).toFixed(1)}px`,
        width: `${(g.step + 0.6).toFixed(1)}px`, height: `${Math.abs(y - g.zero).toFixed(1)}px` });
      if (y > g.zero) fill.AddClass("OHSapphire");
    }
    // Line: short segments along the curve.
    let x1 = g.pad;
    let y1 = yOf(valueAt(x1));
    while (x1 < g.pad + inner - 0.01) {
      const x2 = Math.min(x1 + g.line, g.pad + inner);
      const y2 = yOf(valueAt(x2));
      const length = Math.hypot(x2 - x1, y2 - y1);
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      add("OHGraphSeg", { marginLeft: `${x1.toFixed(1)}px`, marginTop: `${(y1 - g.seg / 2).toFixed(1)}px`,
        width: `${(length + 0.4).toFixed(1)}px`, height: `${g.seg.toFixed(1)}px`, transform: `rotateZ(${angle.toFixed(1)}deg)` });
      x1 = x2;
      y1 = y2;
    }
    // Pins on the curve; inner pins only while they keep pinGap px apart (the ends always show).
    const pins = series.pins;
    const pinX = (t) => g.pad + ((t - from) / span) * inner;
    const roomy = pins.length < 3 || (pinX(pins[1].t) - pinX(pins[0].t)) >= g.pinGap;
    pins.forEach((p, i) => {
      if (!roomy && i > 0 && i < pins.length - 1) return;
      const x = pinX(p.t);
      const pin = add("OHGraphPin", { marginLeft: `${(x - g.pin / 2).toFixed(1)}px`, marginTop: `${(yOf(valueAt(x)) - g.pin / 2).toFixed(1)}px`,
        width: `${g.pin.toFixed(1)}px`, height: `${g.pin.toFixed(1)}px` });
      if (p.v > 0) pin.AddClass("OHAmber");
      if (p.v < 0) pin.AddClass("OHSapphire");
    });
  }

  function renderGraph() {
    if (!valid(UI.graph) || !valid(UI.graphDraw)) return;
    const series = graphSeries();
    const drawable = series.pins.length >= 2;
    layoutGraph();
    const key = `${Graph.seq}@${state.graph.size}`;
    if (drawable && Graph.drawn !== key) {
      drawGraph(series);
      Graph.drawn = key;
    }
    const show = state.graph.show;
    // Both looks (design 19). While held, a running show window starts over, so the graph shows its full
    // time once the rift HUD or the objective bar clears; Always simply comes back.
    const now = Date.now();
    if (Graph.held && show > 0 && now - Graph.shownAt < show * 1000) Graph.shownAt = now;
    const on = drawable && !Graph.held && (show === -1 || (show > 0 && now - Graph.shownAt < show * 1000));
    setClass(UI.graph, "OHGraphShown", on);
    if (Graph.lead !== null) {
      const leader = Graph.lead >= 0 ? "amber" : "sapphire";
      setText(UI.graphLead, `${S.monogram(state[leader])} +${(Math.abs(Graph.lead) / 1000).toFixed(1)}k`);
      setClass(UI.graphLead, "OHSapphire", leader === "sapphire");
    }
  }

  // ------------------------------------------------------------------ objective cues

  // Trackers: rift warning and rejuvenator pickup start times (game clock), whether a rejuvenator-free
  // sample came first (else the pickup time is unknown), the mid-boss "UP" end, the stock rejuvenator
  // radial (first sample and learned direction) and whether a buff came before this mid-boss respawn.
  // A seek resets them.
  const Cues = { lastT: null, riftAt: null, heldAt: null, sawFree: false, midLow: false, midUpUntil: null,
    radA: null, radT: null, radDir: 0, afterRejuv: false };
  const RADIAL = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(-?\d+(?:\.\d+)?)deg\s*\)$/;
  const mmss = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

  // Stock panels the cues read, found once and again only when rebuilt.
  function stockClassPanel(key, parent, cls) {
    const cached = UI.stock[key];
    if (cached && valid(cached)) return cached;
    const found = valid(parent) ? parent.FindChildrenWithClassTraverse(cls)[0] : null;
    UI.stock[key] = valid(found) ? found : null;
    return UI.stock[key];
  }

  function stockPanel(key, parent, id) {
    const cached = UI.stock[key];
    if (cached && valid(cached)) return cached;
    const found = valid(parent) ? parent.FindChildTraverse(id) : null;
    UI.stock[key] = valid(found) ? found : null;
    return UI.stock[key];
  }
  const countIn = (panel, cls) => (panel ? panel.FindChildrenWithClassTraverse(cls).length : 0);

  // Seconds of rejuvenator buff left from the stock circle (#RejuvenatorTimer #StatusEffectsBorder), a
  // radial clip like a status effect's (3:00 = 360 deg), or null. The way it runs is learned from two
  // samples at least 2 s apart whose rate is about 2 deg/s; until then null. Not seen live.
  function rejuvRadialLeft(timer, t) {
    const border = stockPanel("rejuvBorder", timer, "StatusEffectsBorder");
    const match = border ? RADIAL.exec(String(border.style.clip || "")) : null;
    const angle = match ? Math.abs(Number(match[1])) : NaN;
    if (!(angle >= 0 && angle <= 360)) return null;
    if (!Cues.radDir) {
      if (Cues.radT === null || t < Cues.radT) {
        Cues.radA = angle;
        Cues.radT = t;
        return null;
      }
      if (t - Cues.radT < 2) return null;
      const rate = (angle - Cues.radA) / (t - Cues.radT);
      const expected = 360 / CUE.rejuv;
      if (Math.abs(Math.abs(rate) - expected) > expected / 2) {
        Cues.radA = angle;
        Cues.radT = t;
        return null;
      }
      Cues.radDir = rate < 0 ? 1 : -1;
    }
    const share = Cues.radDir > 0 ? angle / 360 : 1 - angle / 360;
    return Math.round(share * CUE.rejuv);
  }

  // A scheduled spawn: "UP" for upFor s after each spawn, a countdown in the last win s before one.
  // `present` (a boolean or a function, read only inside the UP window) confirms the spawn is still up.
  function spawnCue(t, first, every, win, upFor, present) {
    const since = t < first ? null : (t - first) % every;
    if (since !== null && since < upFor && (typeof present === "function" ? present() : present)) return { text: "UP", cls: "OHLive" };
    const next = t <= first ? first : first + Math.ceil((t - first) / every) * every;
    const left = next - t;
    return left > 0 && left <= win ? { text: mmss(left), cls: left <= CUE.soon ? "OHSoon" : "" } : null;
  }

  function sampleCues() {
    const t = valid(UI.time) ? parseClock(UI.time.text) : null;
    const out = {};
    if (t !== null) {
      // A seek back resets everything; a jump forward (seek, late sample) only forgets that a
      // rejuvenator-free sample came first, so a pickup seen first after it has no known time.
      if (Cues.lastT !== null && t < Cues.lastT - 3) {
        Cues.riftAt = null; Cues.heldAt = null; Cues.sawFree = false; Cues.midLow = false; Cues.midUpUntil = null;
        Cues.radA = null; Cues.radT = null; Cues.radDir = 0; Cues.afterRejuv = false;
      } else if (Cues.lastT !== null && t > Cues.lastT + 5) {
        Cues.sawFree = false;
      }
      Cues.lastT = t;
      const map = stockPanel("map", UI.hud, "hud_minimap");
      const pick = state.cues;
      const window = (show) => (show < 0 ? Infinity : show);
      // Bridge buffs: the minimap's powerup markers stay until both are taken (live); Always keeps UP
      // until then, otherwise UP lasts at most CUE.up.
      if (pick.bridge) {
        out.Bridge = spawnCue(t, 300, 300, window(pick.bridge), pick.bridge < 0 ? 300 : CUE.up, () => countIn(map, "powerup_spawn") > 0);
      }
      if (pick.urn) out.Urn = spawnCue(t, 600, 300, window(pick.urn), CUE.urnUp, true);
      // Rift: the stock capture meter shows while it is open; before that its minimap marker carries
      // koth_warning for 20 s.
      const koth = stockPanel("koth", UI.topBar, "KothCashInMeter");
      if (!pick.rift) {
        Cues.riftAt = null;
      } else if (koth && koth.visible) {
        // Base Game+ Names hides the rift chip while the stock rift HUD (moved under the chips) shows:
        // it says the same thing (design 17). Night Desk keeps LIVE.
        if (state.style === "desk") out.Rift = { text: "LIVE", cls: "OHLive" };
        Cues.riftAt = null;
      } else if (countIn(map, "koth_warning") > 0) {
        if (Cues.riftAt === null) Cues.riftAt = t;
        const left = Math.max(0, CUE.rift - (t - Cues.riftAt));
        out.Rift = { text: mmss(left), cls: left <= CUE.soon ? "OHSoon" : "" };
      } else {
        Cues.riftAt = null;
      }
      // Mid-boss and rejuvenator: the stock #RejuvenatorTimer classes and {s:midboss_timer} label; the
      // holding team's cards carry HasRejuvenator. A held rejuvenator always shows its buff time left
      // (yellow text over the holder's bar), whatever the mid-boss setting (SPEC); then the stock respawn
      // countdown follows until the mid-boss is back, whatever the mid-boss window (user 2026-10-23),
      // unless the mid-boss is Off.
      const timer = stockPanel("timer", UI.topBar, "RejuvenatorTimer");
      // The mid-boss chip replaces the stock rejuvenator progress circle (user 2026-10-22); the team
      // counts beside it stay. Its classes still drive the chip while it is collapsed.
      setStyle(timer, "opacity", "0");
      if (timer && timer.BHasClass("has_rejuv")) {
        const amber = countIn(findPlayers("TeamFriendly"), "HasRejuvenator");
        const sapphire = countIn(findPlayers("TeamEnemy"), "HasRejuvenator");
        if (Cues.heldAt === null) Cues.heldAt = Cues.sawFree ? t : -1;
        Cues.afterRejuv = true;
        // Exact from the pickup when it was seen; else from the stock circle.
        const left = Cues.heldAt >= 0 ? CUE.rejuv - (t - Cues.heldAt) : rejuvRadialLeft(timer, t);
        const team = amber >= sapphire ? "OHHeldAmber" : "OHHeldSapphire";
        out.Mid = { text: left !== null ? mmss(Math.max(0, left)) : "HELD", cls: amber || sapphire ? team : "" };
        Cues.midLow = false;
      } else if (timer) {
        Cues.heldAt = null;
        Cues.sawFree = true;
        Cues.radA = null; Cues.radT = null; Cues.radDir = 0;
        if (timer.BHasClass("midboss_cooldown")) {
          const label = stockPanel("midLabel", timer, "MidbossTimerLabel");
          const left = label ? parseClock(label.text) : null;
          const shows = pick.mid && (Cues.afterRejuv || left <= window(pick.mid));
          if (left !== null && shows) out.Mid = { text: mmss(Math.max(0, left)), cls: left <= CUE.soon ? "OHSoon" : "" };
          Cues.midLow = left !== null && left <= 3;
        } else {
          Cues.afterRejuv = false;
          if (Cues.midLow) Cues.midUpUntil = t + CUE.up;
          Cues.midLow = false;
          // Always: UP the whole time the mid-boss is alive; otherwise CUE.up after it respawns.
          if (pick.mid < 0 || (pick.mid && Cues.midUpUntil !== null && t < Cues.midUpUntil)) out.Mid = { text: "UP", cls: "OHLive" };
        }
      }
    }
    // The visible chips fill the slots in order, centred as a group (symmetric); the mid-boss chip goes
    // in the middle, so it sits exactly under the clock when one or three chips show.
    const shown = CUE_ORDER.filter((kind) => out[kind]);
    if (out.Mid) shown.splice(Math.floor(shown.length / 2), 0, "Mid");
    UI.cue.forEach((slot, i) => {
      const kind = shown[i];
      setClass(slot.panel, "OHOn", !!kind);
      if (!kind) return;
      for (const k of CUE_KINDS) setClass(slot.panel, `OHKind${k}`, k === kind);
      setText(slot.time, out[kind].text);
      for (const cls of CUE_STATES) setClass(slot.panel, cls, out[kind].cls === cls);
    });
  }

  // ------------------------------------------------------------------ editor host

  function ensureMenu() {
    if (valid(UI.menu) && valid(UI.escape) && UI.menu.GetParent() === UI.escape) return;
    UI.escape = topPanel().FindChildTraverse("EscapeMenu");
    if (!valid(UI.escape)) {
      logOnce("escape", "no #EscapeMenu yet; the editor waits");
      return;
    }
    const old = UI.escape.FindChild("OHMenuHost");
    if (valid(old)) old.DeleteAsync(0);
    UI.menu = inject(UI.escape, "OHMenuHost", LAYOUT.menu);
    if (UI.menu && typeof $.OHMenuAttach === "function") $.OHMenuAttach(UI.menu);
  }

  // The editor's entry is a native item in the stock menu list, under PLAYER FEEDBACK: a Button with
  // the stock nav_menu_item minor classes, so hud_escape_menu.css styles it like its neighbours and
  // no contested layout is overridden. Made once per Escape menu; a tick compares one reference
  // and writes visibility only when spectating changes (no traversal, no extra native calls).
  function ensureMenuEntry(shown) {
    // ensureMenu has just validated UI.escape; a new Escape menu (or none yet), or an entry another menu
    // mod deleted while #EscapeMenu survived, makes a new entry.
    if (UI.entryMenu !== UI.escape || !valid(UI.entry)) {
      if (!valid(UI.escape)) return;
      const list = UI.escape.FindChildTraverse("SubOptions");
      if (!valid(list)) {
        logOnce("suboptions", "no #SubOptions in the Escape menu; the editor has no entry");
        return;
      }
      const entry = $.CreatePanel("Button", list, "OHMenuButton", { class: "nav_menu_item minor" });
      $.CreatePanel("Label", entry, "", { class: "menuButtonLabel", text: "TOURNAMENT SETUP" });
      // Right under PLAYER FEEDBACK (FeedbackRow's 28 px top margin would part it from the list).
      const feedback = list.FindChildrenWithClassTraverse("FeedbackRow")[0];
      if (valid(feedback) && feedback.GetParent() === list) list.MoveChildAfter(entry, feedback);
      entry.SetPanelEvent("onactivate", () => {
        if (typeof $.OHMenuOpen === "function") $.OHMenuOpen();
      });
      UI.entry = entry;
      UI.entryMenu = UI.escape;
    }
    // Explicit "visible": clearing a collapsed inline style with null left the entry collapsed (live).
    setStyle(UI.entry, "visibility", shown ? "visible" : "collapse");
  }

  // ------------------------------------------------------------------ series

  // The stock match-end screen (hud.xml #MatchEnd) names the winner. client.dll 6819 (static RE of
  // the CitadelHudMatchEnd update) sets Team1Victory when the winning team number is 2 (Amber, the
  // Hidden King) and Team2Victory otherwise (Sapphire), with MatchFinished; an abandoned game gets
  // MatchAbandoned instead. The winner's series goes up once per injected bar, i.e. once per map
  // load (a demo seek back and forth keeps one win), only for a game spectated on that bar, and never
  // past the wins the format needs (normalize rejects a higher value). An end screen counts only after
  // this bar has seen #MatchEnd without ShowMatchEnd while spectating (armed): #Hud survives a map
  // change, so a screen still carrying the last result must not award again on the next map's bar
  // (it also blocked that map's own result) nor after a layout reload (m1 audit B11). A map whose first
  // sight is its end screen is not counted; the observer is told once. Not seen live yet.
  const matchEnd = { panel: null, spectated: null, armed: null, awarded: null, told: null };
  function awardSeries(watching) {
    if (watching) matchEnd.spectated = UI.bar;
    if (!valid(UI.bar) || matchEnd.spectated !== UI.bar || matchEnd.awarded === UI.bar) return;
    if (!valid(matchEnd.panel)) {
      matchEnd.panel = valid(UI.hud) ? UI.hud.FindChildTraverse("MatchEnd") : null;
      if (!valid(matchEnd.panel)) return;
    }
    const panel = matchEnd.panel;
    if (!panel.BHasClass("ShowMatchEnd")) {
      if (watching) matchEnd.armed = UI.bar;
      return;
    }
    if (!panel.BHasClass("MatchFinished") || panel.BHasClass("MatchAbandoned")) return;
    const team = panel.BHasClass("Team1Victory") ? "amber" : panel.BHasClass("Team2Victory") ? "sapphire" : "";
    if (!team) return;
    if (matchEnd.armed !== UI.bar) {
      if (matchEnd.told !== UI.bar) $.Msg(`${TAG} match end seen without the game before it: series not changed; set it in the editor`);
      matchEnd.told = UI.bar;
      return;
    }
    matchEnd.awarded = UI.bar;
    const wins = Math.min(state[team].series + 1, S.winsNeeded(state.bestOf));
    $.Msg(`${TAG} match end: ${team} wins (series ${team} ${wins})`);
    if (wins === state[team].series) return;
    const next = S.clone(state);
    next[team].series = wins;
    setState(next);
  }

  // ------------------------------------------------------------------ loop

  function notify() {
    for (const fn of listeners.slice()) {
      try { fn(); } catch (e) {}
    }
  }

  let bootDelay = 0.5;
  let watchingNow = false; // the last tick's spectating(): a plain flag for oh_buys.js's poll
  let restored = false; // the stock panels were given back since spectating last ended
  function tick() {
    if (stopped) return;
    try {
      const root = topPanel();
      if (root.id !== "CitadelHudRoot") {
        // Not attached to the HUD yet: retry with a backoff.
        hudRoot = null;
        $.Schedule(bootDelay, tick);
        bootDelay = Math.min(bootDelay * 2, BOOT_RETRY_MAX_S);
        return;
      }
      ensureMenu();
      const watching = spectating();
      if (watching !== watchingNow) cardsVersion++; // cards() turns [] or back
      watchingNow = watching;
      ensureMenuEntry(watching);
      if (watching) {
        restored = false;
        if (ensureBar() && ensureBand()) {
          ensureCards();
          startUlt();
          renderNames();
          renderMarkers(Date.now());
          renderFeedNames();
          place();
          sampleGraph();
          renderGraph();
          sampleCues();
          placeFeed(true, Date.now());
        }
        placePause(true);
      } else if (!restored) {
        // Back to playing: the stock panels get their own places back, once (the writes are cached, but
        // repeating this every tick cost validity reads for nothing).
        restored = true;
        placeKoth(null, 0);
        placeObjectives(null, 0);
        placePause(false);
        placeSpread(false);
        restoreMarkers();
        restoreFeedNames();
        if (Feed.margin !== FEED_STOCK_TOP) placeFeed(false, 0);
        if (UI.pushed && valid(UI.topBar)) {
          // The stock top bar returns to its own place.
          setStyle(UI.topBar, "marginTop", null);
          setStyle(UI.stock.timer, "opacity", null);
          UI.pushed = false;
        }
      }
      awardSeries(watching);
    } catch (e) {
      logOnce("tick", `tick failed: ${e && e.message ? e.message : e}`);
    }
    $.Schedule(TICK_SEC, tick);
  }

  context.OHHostStop = () => {
    stopped = true;
  };

  $.OHHost = Object.freeze({
    getState: () => state,
    version: () => version,
    // True when this instance took the state from the HUD root (a layout reload): the local save
    // must not replace it.
    carried: () => carried,
    setState: setState,
    onChange: (fn) => listeners.push(fn),
    topBar: () => valid(UI.topBar) ? UI.topBar : null,
    // Spectating at the last tick (no native call).
    watching: () => watchingNow,
    // The card registry (see ensureCards): [] while not spectating; the version moves on any change.
    cards: () => (watchingNow ? UI.cards : NO_CARDS),
    cardsVersion: () => cardsVersion,
    roster: roster,
    // Aliases for unique in-game names ({ name: alias }) and their signature, while spectating; {} and
    // "{}" otherwise (the world healthbars get them through the status column's OH_DEBUFF_CONFIG).
    aliases: () => (watchingNow ? Aliases.map : NO_ALIASES),
    aliasesSig: () => (watchingNow ? Aliases.sig : "{}"),
    // "none" | "loading" | "loaded" | "failed" for a team logo in the active look, or "org".
    logoState: (key) => {
      if (key === "org") return UI.org ? UI.org.logoState : state.org.logo.url ? "loading" : "none";
      const pool = state.style === "desk" ? UI.desk : UI.sides;
      for (const side of SIDES) if (pool[side] && pool[side].teamKey === key) return pool[side].slot.logoState;
      return state[key].logo.url ? "loading" : "none";
    },
    // Soul lead pins recorded so far: [{ m: minute, v: lead in thousands, Amber positive }].
    graphPins: () => graphPoints()
  });

  adoptState();
  const root = topPanel();
  if (root.id === "CitadelHudRoot") clearOld(root);
  $.Msg(`${TAG} host loaded`);
  $.Schedule(0.5, tick);
})();
