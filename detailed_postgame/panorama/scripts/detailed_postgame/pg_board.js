// Detailed Post Scoreboard Menu (pak11): the Night Shift post-game stats board, forked from
// observer_hud/panorama/scripts/observer_hud/pg_board.js without the observer extras (match cards,
// team logos, organiser, aliases, the hosted store page). Never edit observer_hud for this mod.
// Runs in the board layout that pg_loader.js loads into #ScoreboardScreen. Two halves:
//   scan   - reads everything offline from the stock page: exact row values through injected
//            {i:...} labels, then the stock graph's tooltip column by column (soul lead per team,
//            souls by source per player) and the Lane Stats panel (objective destroy times).
//            The tooltip is opened with DispatchPanelEvent on a graph column (ENGINE.md: the
//            direct CitadelShowPostGameGraphsTooltip event has no JS factory and never parses).
//   render - the Night Shift layout: header, 12 player columns, label column, lead graph.
// Logs [DPS] lines to console.log; the [DPS] data lines are the E2E artifact.
(() => {
  "use strict";

  const TAG = "[DPS]";
  // Event-driven (plan phase 2): the match event (CitadelMatchDetailsUpdated) and a screen pick
  // (CitadelPostGameSelectScreenIndex) check at once; otherwise one check a second. While the page is
  // hidden that check reads only PageVisible: live, reopening a match already loaded this session
  // brought no event, and the Scoreboard pick woke nothing (a sleeping board showed the old match).
  const FLOOR_S = 1; // safety check, shown or hidden
  const BURST_S = 0.1; // after an event: waiting for the rows, the page or the screen focus
  const MATCH_WAKE_MS = 5000; // burst after the match event (and at boot: the page loads for a match)
  const SCREEN_WAKE_MS = 1000; // burst after a screen pick (the carousel sets Focused)
  const INTRO_RESET_MS = 1000; // off the Scoreboard screen this long (the carousel has moved it away): entrance re-armed
  const LOADING_MAX_MS = 30000; // stop showing "loading" after this (a failed load shows the stock error)
  const SCAN_FROM = 0.2; // progress share of the rows; the scan steps fill the rest
  const TIP_ID = "PostGameGraphTooltip";
  const COLUMN = "file://{resources}/layout/detailed_postgame/pg_column.xml";
  const FRAME_TRIES = 12; // frames a scan step may wait for the graph to redraw
  const ctx = $.GetContextPanel();
  if (typeof ctx.NSStop === "function") ctx.NSStop();
  let stopped = false;
  let matchListener = null;
  ctx.NSStop = () => {
    stopped = true;
    if (matchListener !== null) {
      try { $.UnregisterForUnhandledEvent("CitadelMatchDetailsUpdated", matchListener); } catch (e) { /* already gone */ }
      matchListener = null;
    }
  };

  // [key, bound value, stock award class]; the label column in pg_board.xml is in the same order.
  const STATS = [
    ["souls", "{i:net_worth}", "AwardSouls"],
    ["kills", "{i:player_kills}", "AwardKills"],
    ["deaths", "{i:player_deaths}", ""],
    ["assists", "{i:player_assists}", "AwardAssists"],
    ["pdmg", "{i:player_dmg}", "AwardPlayerDmg"],
    ["odmg", "{i:obj_dmg}", "AwardObjDmg"],
    ["heal", "{i:player_healing}", "AwardHealing"] // healing + barrier, like stock (user decision)
  ];
  const BIND = STATS.map((s) => s[1]).concat(["{i:hero_id}", "{s:match_id}", "{s:match_minutes}", "{s:match_seconds}"]).join("|");
  const BIND_PARTS = STATS.length + 4;
  // Stock tooltip label -> [css key, display name].
  const SOURCES = {
    "Troopers": ["troopers", "Troopers"],
    "Haunts": ["neutrals", "Neutrals"],
    "Breakable Pickups": ["breakables", "Breakables"],
    "Team Catch-Up": ["bonus", "Team Bonus"],
    "Enemy Kills": ["kills", "Enemy Kills"],
    "Objectives": ["objectives", "Objectives"],
    "Urn": ["urn", "Urn"],
    "Kill Assists": ["assists", "Assists"],
    "Denies": ["denies", "Denies"]
  };
  const LANE_TIERS = [["LaneStatTier1", "tier1"], ["LaneStatTier2", "tier2"], ["LaneStatBarracks", "base"]];
  // Layout numbers shared with pg_board.css: GRAPH_H and the 1600 px plot = .NSGraphPlot; CHART_W =
  // .NSGraphMid; the 105 px column = .NSColumn/.NSPaper/.NSPortrait; 702 px team and 196 px gutter
  // (layoutScoreboard) = .NSHeadSide/.NSTeam and .NSHeadCentre/.NSLabels/.NSProgress. Change both.
  const GRAPH_H = 112; // the plot; the canvas fills it (1600 x 112)
  const CHART_W = 1512; // the lead's x range; the right gutter holds the final-lead pill

  const ok = (p) => !!(p && p.IsValid && p.IsValid());
  const log = (msg) => $.Msg(`${TAG} ${msg}`);
  const logged = new Set();
  const logOnce = (key, msg) => { if (!logged.has(key)) { logged.add(key); log(msg); } };
  // E2E artifact: one console line per item, because console.log cuts a $.Msg near 2 KB
  // (live: the souls array ran into the next line). verify-live.js reads the newest block.
  const logData = (kind, items) => {
    log(`data ${kind} begin ${items.length}`);
    for (const item of items) log(`data ${kind} + ${JSON.stringify(item)}`);
  };
  const num = (text) => { const n = parseInt(String(text).replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
  // "27:51", "1:02:03" or "-0:05" -> seconds; null for anything else (oh_state.js parseClock).
  const parseClock = (text) => {
    const match = /^\s*(-?)(\d+):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text || ""));
    if (!match) return null;
    const parts = match[4] === undefined ? [0, +match[2], +match[3]] : [+match[2], +match[3], +match[4]];
    const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return match[1] ? -seconds : seconds;
  };
  const secs = (text) => { const s = parseClock(text); return s === null ? -1 : s; };
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const fmtK = (v) => `${(v / 1000).toFixed(1)}K`;

  const UI = {
    page: null, screen: null, scoreboard: null, graphs: null, tip: null,
    names: [null, null], results: [null, null], worth: [null, null], kills: [null, null],
    clock: null, match: null, soulsLabel: null, graph: null, ticks: null, events: null, top: null, bottom: null,
    progress: null, progressFill: null, progressText: null
  };
  const S = {
    key: "",
    gen: 0,
    cols: [], // per player row: { hero, column, souls, plate, nameBlock, items, delay }
    focused: false, // the Scoreboard screen was focused at the last check
    blurAt: 0, // Date.now() when it lost focus
    introShown: false, // the entrance has played since the board was built or re-armed
    introToken: 0, // bumps on every entrance change; a stale scheduled item fade-in does nothing
    tipMuted: false, // the stock tooltip is transparent (scan running, or not on the Graphs screen)
    sig: "", // first row's bound text when the board was built (steady-state check)
    bound: null, // that bound label (ours, inside a reused stock row)
    loadingSince: 0, // Date.now() when the visible page started waiting for match rows
    progressGen: 0, // bumps on every progress change so a stale fade-out does not hide a new run
    hooked: null, // the page whose screen-pick event wakes the board
    loop: 0, // token of the one scheduled check; a wake supersedes a pending one
    burstUntil: 0, // Date.now() until which the board checks at BURST_S
    scanning: 0, // gen of the scan in progress (0: none); the tooltip stays muted while it runs
    graphScale: 0, // the lead graph's scale (0: no graph drawn)
    revealToken: 0, // the running graph wipe; a new one supersedes it
    graphDraws: [] // the lead graph's canvas strokes, painted by paint()
  };

  // ---------- discovery ----------

  function findPage() {
    let p = ctx;
    while (ok(p) && p.paneltype !== "CitadelPostGameNew") p = p.GetParent();
    return ok(p) ? p : null;
  }

  function windowRoot() {
    let p = ctx;
    while (ok(p) && ok(p.GetParent())) p = p.GetParent();
    return p;
  }

  function bindUI() {
    for (const i of [1, 2]) {
      UI.names[i - 1] = ctx.FindChildTraverse(`NSTeamName${i}`);
      UI.results[i - 1] = ctx.FindChildTraverse(`NSResult${i}`);
      UI.worth[i - 1] = ctx.FindChildTraverse(`NSWorth${i}`);
      UI.kills[i - 1] = ctx.FindChildTraverse(`NSKills${i}`);
    }
    UI.clock = ctx.FindChildTraverse("NSClock");
    UI.match = ctx.FindChildTraverse("NSMatch");
    UI.soulsLabel = ctx.FindChildTraverse("NSSoulsLabel");
    UI.graph = ctx.FindChildTraverse("NSGraph");
    UI.draw = ctx.FindChildTraverse("NSGraphDraw");
    UI.canvas = ctx.FindChildTraverse("NSGraphCanvas");
    UI.marks = ctx.FindChildTraverse("NSGraphMarks");
    UI.peaks = [ctx.FindChildTraverse("NSGraphPeak1"), ctx.FindChildTraverse("NSGraphPeak2")];
    UI.end = ctx.FindChildTraverse("NSGraphEnd");
    UI.ticks = ctx.FindChildTraverse("NSGraphTicks");
    UI.events = ctx.FindChildTraverse("NSGraphEvents");
    UI.top = ctx.FindChildTraverse("NSGraphTop");
    UI.bottom = ctx.FindChildTraverse("NSGraphBottom");
    UI.topScale = ctx.FindChildTraverse("NSGraphTopScale");
    UI.bottomScale = ctx.FindChildTraverse("NSGraphBottomScale");
    UI.progress = ctx.FindChildTraverse("NSProgress");
    UI.progressFill = ctx.FindChildTraverse("NSProgressFill");
    UI.progressText = ctx.FindChildTraverse("NSProgressText");
    UI.progressStep = ctx.FindChildTraverse("NSProgressStep");
    UI.frame = ctx.FindChildTraverse("NSFrame");
  }

  // ---------- progress bar ----------
  // null fraction = indeterminate (match data still loading; a CSS loop runs instead of the fill).
  // The fill scales on X (transform only, transition in CSS); the bar dries away after 100 %.
  let lastFill = -1;
  function setFill(f) {
    if (f === lastFill || !ok(UI.progressFill)) return;
    lastFill = f;
    UI.progressFill.style.transform = `scale3d(${Math.max(0.001, f)}, 1, 1)`;
  }

  function progress(fraction, label, step) {
    if (!ok(UI.progress)) return;
    S.progressGen++;
    ctx.AddClass("NSBusy");
    UI.progress.RemoveClass("NSDone");
    UI.progress.SetHasClass("NSIndeterminate", fraction === null);
    if (fraction !== null) setFill(Math.round(Math.max(0, Math.min(1, fraction)) * 100) / 100);
    setText(UI.progressText, label);
    setText(UI.progressStep, step || "");
  }

  function progressDone() {
    progress(1, "MATCH READ", "");
    UI.progress.AddClass("NSDone");
    const gen = S.progressGen;
    $.Schedule(0.95, () => { if (!stopped && gen === S.progressGen) progressHide(); });
  }

  function progressHide() {
    S.progressGen++;
    ctx.RemoveClass("NSBusy");
    if (ok(UI.progress)) UI.progress.RemoveClass("NSDone");
    setFill(0); // back to empty while hidden, so the next run pours from the left
  }

  function loading() {
    if (!S.loadingSince) S.loadingSince = Date.now();
    if (Date.now() - S.loadingSince < LOADING_MAX_MS) progress(null, "LOADING MATCH", "");
    else progressHide();
  }

  // ---------- rows ----------

  // Row values through a hidden label bound to the row's own dialog variables (exact numbers,
  // stock text is "18k"). The label resolves in the same frame it is created (probe 1).
  function readRow(row) {
    let holder = row.FindChild("NSBinds");
    if (!ok(holder)) {
      holder = $.CreatePanel("Panel", row, "NSBinds", { hittest: "false" });
      holder.style.width = "0px";
      holder.style.height = "0px";
      holder.style.opacity = "0";
      $.CreatePanel("Label", holder, "NSBind", { text: BIND, hittest: "false" });
    }
    const label = holder.FindChild("NSBind");
    const parts = ok(label) ? String(label.text).split("|") : [];
    if (parts.length !== BIND_PARTS || parts.some((p) => p.indexOf("{") >= 0)) return null;
    const v = { row, text: {}, value: {}, award: {}, hero: num(parts[STATS.length]), account: "" };
    STATS.forEach(([key, , award], i) => {
      v.text[key] = parts[i];
      v.value[key] = num(parts[i]);
      v.award[key] = !!award && row.BHasClass(award);
    });
    v.matchId = parts[STATS.length + 1];
    v.duration = num(parts[STATS.length + 2]) * 60 + num(parts[STATS.length + 3]);
    // Stock MVP marks: MVP_Rank1 = MVP (mvp_trophy), MVP_Rank2/3 = Key Player (key_player_trophy).
    v.mvp = row.BHasClass("MVP_Rank1") ? 1 : row.BHasClass("MVP_Rank2") ? 2 : row.BHasClass("MVP_Rank3") ? 3 : 0;
    const name = row.FindChildTraverse("PlayerName");
    try { v.account = ok(name) ? String(name.accountid || "") : ""; } catch (e) { v.account = ""; }
    return v;
  }

  function readTeam(index) {
    const team = UI.scoreboard.FindChildTraverse(`Team${index}`);
    const players = ok(team) ? team.FindChildTraverse("TeamPlayers") : null;
    if (!ok(players)) return null;
    const rows = [];
    let totals = null;
    for (const row of players.Children()) {
      const v = readRow(row);
      if (!v) return null;
      if (row.BHasClass("TotalsRow")) totals = v;
      else if (v.hero > 0) rows.push(v);
      else return null;
    }
    if (!totals || rows.length === 0) return null;
    return { win: team.BHasClass("IsWinningTeam"), rows, totals };
  }

  function readMatch() {
    const teams = [readTeam(1), readTeam(2)];
    if (!teams[0] || !teams[1]) return null;
    const first = teams[0].rows[0];
    return { id: first.matchId, duration: first.duration, teams };
  }

  const matchKey = (m) => `${m.id}:${m.teams.map((t) => t.rows.map((r) => r.hero).join(",")).join("/")}`;

  // ---------- render: header and columns ----------

  function setText(label, text) {
    if (ok(label) && label.text !== text) label.text = text;
  }

  function renderHeader(m) {
    const anyWin = m.teams[0].win || m.teams[1].win;
    m.teams.forEach((t, i) => {
      setText(UI.names[i], $.Localize(`#Citadel_Team${i + 1}_Name`));
      setText(UI.results[i], anyWin ? (t.win ? "VICTORY" : "DEFEAT") : "");
      if (ok(UI.results[i])) {
        UI.results[i].SetHasClass("NSWin", anyWin && t.win);
        UI.results[i].SetHasClass("NSLoss", anyWin && !t.win);
      }
      setText(UI.worth[i], fmtK(t.totals.value.souls));
      setText(UI.kills[i], String(t.totals.value.kills));
    });
    setText(UI.clock, clock(m.duration));
    setText(UI.match, `MATCH ${m.id}`);
  }

  // Stock panels are restyled in place, never moved: C++ looks row children up by id later and a
  // missing one is fatal (live 2026-10-25: "FATAL ERROR: Unable to find child 'ItemsContainer'"
  // after ItemsContainer was reparented). Our own panels are created inside the stock rows.
  function css(panel, styles) {
    if (!ok(panel)) return;
    for (const key of Object.keys(styles)) panel.style[key] = styles[key];
  }
  const hide = (panel) => css(panel, { visibility: "collapse" });

  function labelText(panel) {
    if (!ok(panel)) return "";
    if (typeof panel.text === "string" && panel.text.trim()) return panel.text.trim();
    for (const kid of panel.Children()) {
      const t = labelText(kid);
      if (t) return t;
    }
    return "";
  }

  // Rows start where the board's body starts (y 130). Stock draws the scroll container
  // (.ScoreboardScrollContainer) translateY(80px) below its box; live the rows sat 81 px below the
  // scoreboard's margin. The translation is removed and its 80 px added to the margin: drawn outside
  // the scoreboard's box, the bottom 80 px of the rows took no hover (live 2026-10-25: the 3rd and 4th
  // item rows). Heights are fit-children because stock row and team heights clip the taller columns
  // (items went missing).
  const STOCK_SHIFT = 80;
  const ROWS_TOP = 49 + STOCK_SHIFT;
  function layoutScoreboard() {
    const sb = UI.scoreboard;
    css(sb, { width: "1600px", height: "fit-children", horizontalAlign: "center", verticalAlign: "top", marginTop: `${ROWS_TOP}px`, marginBottom: "0px", padding: "0px", uiScale: "100%", overflow: "noclip" });
    const inner = sb.GetChild(0);
    css(inner, { width: "1600px", height: "fit-children", flowChildren: "right", padding: "0px", margin: "0px", overflow: "noclip", transform: "none" });
    hide(sb.FindChildTraverse("MatchInfoContainer"));
    for (const i of [1, 2]) {
      const team = sb.FindChildTraverse(`Team${i}`);
      css(team, { width: "702px", height: "fit-children", flowChildren: "down", margin: "0px", padding: "0px", backgroundColor: "#00000000", overflow: "noclip" });
      if (i === 2) css(team, { marginLeft: "196px" });
      hide(ok(team) ? team.FindChildTraverse("TeamTableHeader") : null);
      const players = ok(team) ? team.FindChildTraverse("TeamPlayers") : null;
      css(players, { width: "702px", height: "fit-children", flowChildren: "right", margin: "0px", padding: "0px", overflow: "noclip" });
    }
  }

  // Player name: our own CitadelUserName (live: shows the account name); if it shows no text
  // after a second, the stock name block (which ShowRank may extend) is shown instead.
  function renderName(plate, r, nameBlock, main, column) {
    let own = null;
    try {
      own = $.CreatePanel("CitadelUserName", plate, "", { accountid: r.account, hittest: "false" });
    } catch (e) {
      own = null;
    }
    $.Schedule(1.0, () => {
      if (stopped || !ok(plate)) return;
      if (ok(own) && labelText(own)) return;
      if (!ok(nameBlock)) { logOnce("name:none", "names: no name for a row"); return; }
      hide(plate);
      css(nameBlock, { visibility: "visible", width: "105px", height: "36px", backgroundColor: "#1c1d22", margin: "0px" });
      main.MoveChildBefore(column, nameBlock);
      logOnce("name:stock", `names: own CitadelUserName empty; showing the stock name ("${labelText(nameBlock)}")`);
    });
  }

  // CitadelModIcon is 51 px (3 px padding + 45 px art) with overflow noclip: forcing a smaller
  // size let each neighbour draw over the art ("half cropped", live). Scale instead: no padding,
  // the 45 px container at ui-scale 75% = 33.75 px, three across in 105 px; stock hover and
  // tooltip stay as they are, and the hovered item is lifted over its neighbours (hoverItems).
  function styleItems(items) {
    // Stock gives ItemsContainer a parent-relative height, which is 0 inside a fit-children row
    // (live: h=0 with the icons centred on it, so nothing showed).
    css(items, { width: "105px", height: "fit-children", padding: "0px", margin: "6px 0px 0px 0px", uiScale: "100%", flowChildren: "right-wrap", horizontalAlign: "left", verticalAlign: "top", overflow: "noclip", visibility: "visible" });
    // Stock icons are vertical-align: center, which stacks every wrapped row on the middle one.
    for (const icon of items.Children()) {
      css(icon, { width: "45px", height: "45px", padding: "0px", uiScale: "75%", margin: "0px 1px 1px 0px", verticalAlign: "top", horizontalAlign: "left", opacity: "1", saturation: "1" });
    }
    items.SetPanelEvent("onmouseover", () => hoverItems(items));
    items.SetPanelEvent("onmouseout", () => unhoverItems(items));
  }

  // ---------- item hover ----------
  // Live (client 6819, 2026-10-26): the stock "#ItemsContainer CitadelModIcon:hover" scales an item 1.5x and
  // later siblings drew over it: the next item, the next wrapped row, the next player's items. The stock
  // ItemsContainer gets onmouseover/onmouseout while any of its items is hovered (the items keep their stock
  // tooltips), so while the mouse is in one player's items a short poll finds the hovered item
  // (BHasHoverStyle) and an inline z-index lifts it, and its ancestors up to the scoreboard over their
  // siblings. Nothing runs while no items are hovered.
  const HOVER_S = 0.02;
  const HOVER = { items: null, icon: null, chain: [], token: 0 };
  function lift(panel, on) {
    if (ok(panel)) panel.style.zIndex = on ? "1" : "0";
  }
  function hoverItems(items) {
    if (stopped || HOVER.items === items) return;
    unhoverItems(HOVER.items);
    HOVER.items = items;
    HOVER.chain = [];
    for (let p = items; ok(p) && p !== UI.scoreboard; p = p.GetParent()) HOVER.chain.push(p);
    for (const p of HOVER.chain) lift(p, true);
    pollHover(++HOVER.token);
  }
  function pollHover(token) {
    if (stopped || token !== HOVER.token) return;
    const items = HOVER.items;
    // A lost onmouseout (the page closed, rows rebuilt) ends it too.
    if (!ok(items) || !items.BHasHoverStyle()) { unhoverItems(items); return; }
    let hovered = null;
    for (const icon of items.Children()) if (icon.BHasHoverStyle()) { hovered = icon; break; }
    if (hovered !== HOVER.icon) {
      lift(HOVER.icon, false);
      lift(hovered, true);
      HOVER.icon = hovered;
    }
    $.Schedule(HOVER_S, () => pollHover(token));
  }
  function unhoverItems(items) {
    if (!items || HOVER.items !== items) return;
    HOVER.token++;
    lift(HOVER.icon, false);
    for (const p of HOVER.chain) lift(p, false);
    HOVER.items = null;
    HOVER.icon = null;
    HOVER.chain = [];
  }

  function decorateRow(r, teamIndex, index, loss) {
    const row = r.row;
    const items = row.FindChildTraverse("ItemsContainer");
    const main = ok(items) ? items.GetParent() : null;
    if (!ok(main)) throw new Error("row without ItemsContainer");
    css(row, { width: "105px", height: "fit-children", margin: "0px 6px", padding: "0px", flowChildren: "down", backgroundColor: "#00000000", backgroundImage: "none", overflow: "noclip" });
    for (const kid of row.Children()) if (!ok(kid.FindChildTraverse("ItemsContainer")) && kid.id !== "NSBinds") hide(kid);
    css(main, { width: "105px", height: "fit-children", flowChildren: "down", margin: "0px", padding: "0px", backgroundColor: "#00000000", overflow: "noclip" });
    let nameBlock = null;
    for (const kid of main.Children()) {
      if (kid.id === "ItemsContainer") continue;
      if (!nameBlock && (kid.id === "PlayerName" || ok(kid.FindChildTraverse("PlayerName")))) nameBlock = kid;
      hide(kid);
    }
    styleItems(items);

    // Script-created panels under a stock row take the scoreboard's stylesheets (live), so the
    // column is our own layout; panels created inside it take ours.
    const column = $.CreatePanel("Panel", main, "", { hittest: "false" });
    if (!column.BLoadLayout(COLUMN, false, false)) throw new Error(`could not load ${COLUMN}`);
    column.AddClass(`NSColumnTeam${teamIndex + 1}`);
    column.AddClass(`NSCol${index + 1}`); // entrance stagger, centre outward (CSS)
    if (loss) column.AddClass("NSLoss"); // critical hero card instead of gloat
    if (r.mvp === 1) column.AddClass("NSMVP");
    else if (r.mvp) column.AddClass("NSKey");
    if (r.mvp) {
      setText(column.FindChildTraverse("NSAwardText"), r.mvp === 1 ? "MVP" : "KEY PLAYER");
    }
    main.MoveChildBefore(column, items);
    for (const id of ["NSPortrait", "NSPortraitLoss"]) {
      const portrait = column.FindChildTraverse(id);
      if (ok(portrait)) portrait.SetHeroID(r.hero);
    }
    const cells = column.FindChildTraverse("NSCells");
    STATS.forEach(([key], i) => {
      const cell = $.CreatePanel("Panel", cells, "", { class: "NSCell", hittest: "false" });
      cell.AddClass(`NSCell_${key}`);
      if (i % 2) cell.AddClass("NSOdd");
      if (r.award[key]) { cell.AddClass("NSBest"); cell.AddClass(`NSBest_${key}`); }
      $.CreatePanel("Label", cell, "", { class: "NSCellValue", text: r.text[key], hittest: "false" });
    });
    renderName(column.FindChildTraverse("NSPlate"), r, nameBlock, main, column);
    // Entrance stagger from the centre outward, as the NSCol delays in pg_board.css; the stock items follow.
    const delay = 0.10 + 0.05 * (teamIndex === 0 ? 5 - index : index);
    const entry = { hero: r.hero, column, souls: column.FindChildTraverse("NSSouls"), plate: column.FindChildTraverse("NSPlate"), nameBlock, items, delay };
    S.cols.push(entry);
    css(items, { opacity: "0", transitionProperty: "opacity", transitionDuration: "0.3s", transitionTimingFunction: "ease-out" });
  }

  // The stock items are not ours to class: they fade by an inline transition, shown after their column
  // (live: a transition-delay written with the opacity was ignored and the items popped in first).
  function itemsShown(c, on) {
    if (!on) { css(c.items, { opacity: "0" }); return; }
    const token = S.introToken;
    $.Schedule(c.delay + 0.12, () => { if (!stopped && token === S.introToken) css(c.items, { opacity: "1" }); });
  }

  // Entrance animations start a frame after the panels are created and laid out (a trigger
  // class, never a base-rule animation on a fresh panel).
  function trigger(panels, cls) {
    const gen = S.gen;
    $.Schedule(0, () => {
      if (stopped || gen !== S.gen) return;
      for (const p of panels) if (ok(p)) p.AddClass(cls);
    });
  }

  function renderSouls(byHero) {
    let any = false;
    const shown = [];
    for (const c of S.cols) {
      const data = byHero.get(c.hero);
      if (!ok(c.souls)) continue;
      c.souls.RemoveClass("NSShow");
      c.souls.RemoveAndDeleteChildren();
      if (!data) continue;
      any = true;
      const rows = data.rows.slice().sort((a, b) => b.value - a.value).slice(0, 5);
      rows.forEach((s, i) => {
        const [key, name] = SOURCES[s.name] || ["other", s.name];
        const line = $.CreatePanel("Panel", c.souls, "", { class: `NSSrc NSSrc_${key}`, hittest: "false" });
        line.AddClass(`NSR${i}`); // stroke stagger (CSS)
        const bar = $.CreatePanel("Panel", line, "", { class: "NSSrcBar", hittest: "false" });
        bar.style.width = `${Math.max(0, Math.min(100, s.pct))}%`;
        $.CreatePanel("Label", line, "", { class: "NSSrcName", text: name, hittest: "false" });
        $.CreatePanel("Label", line, "", { class: "NSSrcPct", text: `${s.pct}%`, hittest: "false" });
      });
      shown.push(c.souls);
    }
    if (ok(UI.soulsLabel)) UI.soulsLabel.SetHasClass("NSEmpty", !any);
    trigger(shown, "NSShow");
  }

  // ---------- soul lead graph ----------
  // User 2026-10-26: "reimagine the graph and don't make this bars". The lead (team 1 minus team 2) is one
  // smooth line on a UICanvas (client.dll 6819 ui_canvas.cpp, static RE: ClearJS(color) and
  // DrawSoftLinePointsJS(nPoints, [x0, y0, x1, y1, ...], thickness, softness, color); a colour that does not
  // parse draws white). The line is a monotone cubic through the scanned points, so it never swings past them;
  // amber above zero while team 1 leads, blue below, split exactly where the lead changes sides. Under it a
  // soft two-band area (one zig-zag polyline per band and run). Objective dots sit on the line in the
  // taker's colour with a hairline down to the stock icon; both peaks are labelled; the final lead is a pill
  // in the right gutter. Everything is drawn once per match; a clip wipes it in from the left.
  const PAD_Y = 12;
  const STEP_X = 3;
  const TEAM_RGB = ["E8920C", "4D7FE0"];
  // [outer, inner] area colours: the team colour mixed 18 % / 38 % into the plot's paper (#1A1813).
  const FILL_RGB = [["#3F2E12FF", "#684610FF"], ["#232A38FF", "#2D3F61FF"]];
  const LINE_RGB = ["FFB23A", "86A9FF"];
  const REVEAL_MS = 900;
  const graphX = (t, duration) => Math.max(0, Math.min(1, t / duration)) * CHART_W;
  // A tidy top for the scale (8 % headroom over the largest lead).
  function graphScale(maxAbs) {
    const unit = maxAbs > 20000 ? 5000 : maxAbs > 8000 ? 2000 : 1000;
    return Math.max(unit, Math.ceil(maxAbs * 1.08 / unit) * unit);
  }
  // Fritsch-Carlson monotone cubic through (xs, ys), xs strictly increasing: never overshoots a knot.
  function monotone(xs, ys) {
    const n = xs.length;
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      const h = xs[hi] - xs[lo];
      const t = (x - xs[lo]) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
    };
  }
  // Strokes are kept in S.graphDraws and painted by paint(), so the reveal can draw them up to an x.
  function stroke(points, thickness, softness, color) {
    if (points.length >= 4) S.graphDraws.push({ points, thickness, softness, color });
  }
  // Each stroke up to x = cutoff (a point past it is cut back to the cutoff on its segment).
  function paint(cutoff) {
    if (!ok(UI.canvas)) return;
    UI.canvas.ClearJS("#00000000");
    for (const d of S.graphDraws) {
      let pts = d.points;
      if (cutoff < CHART_W + 100) {
        pts = [];
        for (let i = 0; i < d.points.length; i += 2) {
          const x = d.points[i];
          const y = d.points[i + 1];
          if (x <= cutoff) { pts.push(x, y); continue; }
          const n = pts.length;
          if (n >= 2 && pts[n - 2] < cutoff) pts.push(cutoff, pts[n - 1] + (y - pts[n - 1]) * (cutoff - pts[n - 2]) / (x - pts[n - 2]));
          break;
        }
      }
      if (pts.length >= 4) UI.canvas.DrawSoftLinePointsJS(pts.length / 2, pts, d.thickness, d.softness, d.color);
    }
  }
  // [{ side: 0 | 1, pts: [[x, y], ...] }]: the line split where it crosses zero (side 0 = team 1 ahead).
  function leadRuns(samples, zero) {
    const runs = [];
    let run = null;
    for (const [x, y] of samples) {
      const side = y < zero - 1e-6 ? 0 : y > zero + 1e-6 ? 1 : -1;
      if (!run) { run = { side, pts: [[x, y]] }; continue; }
      if (side < 0 || side === run.side) { run.pts.push([x, y]); continue; }
      if (run.side < 0) { run.side = side; run.pts.push([x, y]); continue; }
      const [px, py] = run.pts[run.pts.length - 1];
      const cx = py === zero ? px : px + (zero - py) * (x - px) / (y - py);
      if (py !== zero) run.pts.push([cx, zero]);
      runs.push(run);
      run = { side, pts: [[cx, zero], [x, y]] };
    }
    if (run && run.side >= 0) runs.push(run);
    return runs;
  }
  function renderGraph(series, events, duration) {
    if (!ok(UI.graph) || !ok(UI.canvas)) return;
    const pts = series.filter((p) => p.t > 0 && p.t <= duration + 1).sort((p, q) => p.t - q.t);
    if (pts.length < 5 || duration <= 0) { UI.graph.RemoveClass("NSOn"); return; }
    const zero = GRAPH_H / 2;
    const half = zero - PAD_Y;
    const scale = graphScale(Math.max(1000, ...pts.map((p) => Math.abs(p.a - p.b))));
    const yOf = (lead) => zero - (lead / scale) * half;
    // Knots in pixels from the game start (lead 0); a repeated time keeps its last reading.
    const xs = [0];
    const ys = [zero];
    for (const p of pts) {
      const x = graphX(p.t, duration);
      if (x <= xs[xs.length - 1]) { if (x === xs[xs.length - 1] && xs.length > 1) ys[ys.length - 1] = yOf(p.a - p.b); continue; }
      xs.push(x);
      ys.push(yOf(p.a - p.b));
    }
    const curve = monotone(xs, ys);
    const endX = xs[xs.length - 1];
    const sampleXs = xs.slice();
    for (let x = STEP_X; x < endX; x += STEP_X) sampleXs.push(x);
    sampleXs.sort((a, b) => a - b);
    const samples = [];
    for (const x of sampleXs) if (!samples.length || x - samples[samples.length - 1][0] > 0.25 || xs.includes(x)) samples.push([x, curve(x)]);
    const runs = leadRuns(samples, zero);
    log(`graph: chart ${CHART_W}x${GRAPH_H}, zero ${zero}, half ${half}, scale ${scale}, ${xs.length - 1} points, ${runs.length} run(s)`);

    S.graphDraws = [];
    // The area: the team colour pre-mixed with the plot's dark paper, opaque (live: translucent strokes
    // stacked into stripes where neighbours overlap). Full height faint, the part nearest the line stronger.
    for (const run of runs) {
      const outer = [];
      const inner = [];
      run.pts.forEach(([x, y], i) => {
        const near = y + (zero - y) * 0.45;
        if (i % 2) { outer.push(x, y, x, zero); inner.push(x, y, x, near); } else { outer.push(x, zero, x, y); inner.push(x, near, x, y); }
      });
      stroke(outer, STEP_X + 0.6, 0.4, FILL_RGB[run.side][0]);
      stroke(inner, STEP_X + 0.6, 0.4, FILL_RGB[run.side][1]);
    }
    // Guides over the area: half and full scale, and one hairline per five minutes.
    for (const f of [-1, -0.5, 0.5, 1]) stroke([0, zero - f * half, CHART_W, zero - f * half], 1, 0.5, f === 0.5 || f === -0.5 ? "#FFEFD710" : "#FFEFD71C");
    for (let t = 300; t < duration; t += 300) stroke([graphX(t, duration), 2, graphX(t, duration), GRAPH_H - 2], 1, 0.5, "#FFEFD70E");
    // Objective hairlines from the line down to the icons.
    const objs = events.map((e) => { const x = graphX(e.t, duration); return { e, x, y: curve(Math.min(x, endX)) }; });
    for (const o of objs) stroke([o.x, o.y + 6, o.x, GRAPH_H], 1, 0.5, "#FFEFD72E");
    // The line: a glow, then the pen.
    for (const run of runs) {
      const flat = [];
      for (const [x, y] of run.pts) flat.push(x, y);
      stroke(flat, 9, 7, `#${TEAM_RGB[run.side]}48`);
      stroke(flat, 3, 1, `#${LINE_RGB[run.side]}FF`);
    }

    // Marks: objective dots, peaks, the line's end and the final lead.
    UI.marks.RemoveAndDeleteChildren();
    const dot = (cls, x, y, size) => {
      const ring = $.CreatePanel("Panel", UI.marks, "", { class: cls, hittest: "false" });
      ring.style.marginLeft = `${(x - size / 2).toFixed(1)}px`;
      ring.style.marginTop = `${(y - size / 2).toFixed(1)}px`;
      $.CreatePanel("Panel", ring, "", { class: "NSGraphDotCore", hittest: "false" });
      return ring;
    };
    for (const o of objs) dot(`NSGraphObj ${o.e.killer === 2 ? "NSObjTeam2" : "NSObjTeam1"}`, o.x, o.y, 10);
    const leads = pts.map((p) => ({ t: p.t, l: p.a - p.b }));
    [1, -1].forEach((sign, side) => {
      const label = UI.peaks[side];
      const best = leads.reduce((b, p) => (sign * p.l > sign * b.l ? p : b), { t: 0, l: 0 });
      // A peak at the line's end is the final lead's pill already.
      const atEnd = best.t === leads[leads.length - 1].t;
      const show = !atEnd && sign * best.l >= Math.max(1500, 0.06 * scale);
      if (ok(label)) label.SetHasClass("NSOn", show);
      if (!show || !ok(label)) return;
      const x = graphX(best.t, duration);
      const y = yOf(best.l);
      dot(`NSGraphPeakDot NSPeakDotTeam${side + 1}`, x, y, 10);
      setText(label, `PEAK +${fmtK(Math.abs(best.l))}   ${clock(best.t)}`);
      // Team 1 above its peak and team 2 below, unless that leaves the plot.
      let top = side === 0 ? y - 24 : y + 8;
      if (top < 2 || top > GRAPH_H - 18) top = side === 0 ? y + 8 : y - 24;
      label.style.marginLeft = `${Math.max(4, Math.min(CHART_W - 144, x - 70)).toFixed(1)}px`;
      label.style.marginTop = `${Math.max(2, Math.min(GRAPH_H - 18, top)).toFixed(1)}px`;
    });
    const last = leads[leads.length - 1];
    const lastY = ys[ys.length - 1];
    const lastSide = last.l < 0 ? 1 : 0;
    dot(`NSGraphEndDot NSPeakDotTeam${lastSide + 1}`, endX, lastY, 10);
    const pillY = Math.max(11, Math.min(GRAPH_H - 11, lastY));
    stroke([endX + 5, lastY, CHART_W + 8, pillY], 1, 0.5, `#${TEAM_RGB[lastSide]}99`);
    if (ok(UI.end)) {
      setText(UI.end, `+${fmtK(Math.abs(last.l))}`);
      UI.end.SetHasClass("NSEndTeam1", lastSide === 0);
      UI.end.SetHasClass("NSEndTeam2", lastSide === 1);
      UI.end.style.marginLeft = `${CHART_W + 8}px`;
      UI.end.style.marginTop = `${(pillY - 11).toFixed(1)}px`;
    }
    S.graphScale = scale;
    renderGraphCaptions();

    UI.ticks.RemoveAndDeleteChildren();
    for (let t = 0; t <= duration - 60; t += 300) {
      const tick = $.CreatePanel("Label", UI.ticks, "", { class: "NSTick", text: clock(t), hittest: "false" });
      tick.style.marginLeft = `${Math.max(0, Math.min(CHART_W - 60, graphX(t, duration) - 30)).toFixed(1)}px`;
    }
    const endTick = $.CreatePanel("Label", UI.ticks, "", { class: "NSTick NSTickEnd", text: clock(duration), hittest: "false" });
    endTick.style.marginLeft = `${CHART_W - 30}px`;
    UI.events.RemoveAndDeleteChildren();
    for (const o of objs) {
      const e = o.e;
      const cls = `NSEvent ${e.tier === "tier1" ? "NSEvTier1" : e.tier === "tier2" ? "NSEvTier2" : "NSEvBase"} ${e.killer === 2 ? "NSEvTeam2" : "NSEvTeam1"}`;
      const icon = $.CreatePanel("Panel", UI.events, "", { class: cls, hittest: "false" });
      const left = Math.max(0, Math.min(CHART_W - 26, o.x - (e.tier === "base" ? 13 : 11)));
      icon.AddClass(`NSW${Math.min(7, Math.floor(8 * left / CHART_W))}`);
      icon.style.marginLeft = `${left.toFixed(1)}px`;
    }
    UI.graph.RemoveClass("NSShow");
    UI.graph.AddClass("NSOn");
    trigger([UI.graph], "NSShow");
    reveal();
  }
  // The stock team names from the header on each side's caption.
  function renderGraphCaptions() {
    if (!S.graphScale) return;
    const name = (i) => String(ok(UI.names[i]) ? UI.names[i].text || "" : "").toUpperCase();
    setText(UI.top, `${name(0)} AHEAD`);
    setText(UI.bottom, `${name(1)} AHEAD`);
    const scale = S.graphScale % 1000 ? fmtK(S.graphScale) : `${S.graphScale / 1000}K`;
    setText(UI.topScale, `+${scale}`);
    setText(UI.bottomScale, `+${scale}`);
  }
  // Draw the graph in from the left: the canvas strokes are repainted up to a growing x (a panel clip does
  // not reach a UICanvas, live 2026-10-26) and the dots and labels are wiped in with a stepped clip.
  function reveal() {
    if (!ok(UI.draw)) return;
    const token = ++S.revealToken;
    const t0 = Date.now();
    const step = () => {
      if (stopped || token !== S.revealToken || !ok(UI.draw)) return;
      const f = Math.min(1, (Date.now() - t0) / REVEAL_MS);
      const e = 1 - Math.pow(1 - f, 3);
      paint(f >= 1 ? Infinity : e * (CHART_W + 96));
      UI.draw.style.clip = f >= 1 ? "rect( 0%, 100%, 100%, 0% )" : `rect( 0%, ${(e * 100).toFixed(2)}%, 100%, 0% )`;
      if (f < 1) $.Schedule(1 / 60, step);
    };
    paint(0);
    UI.draw.style.clip = "rect( 0%, 0%, 100%, 0% )";
    $.Schedule(1 / 60, step);
  }

  // ---------- show / teardown ----------

  // The entrance. Off the Scoreboard screen the board waits hidden: the frame without NSIntro (opacity 0),
  // the columns without NSIn (opacity 0), the stock items transparent. It plays when the screen is focused
  // and is re-armed only after the screen has been away INTRO_RESET_MS, so nothing on screen is ever hidden
  // to replay it (user 2026-10-26: the contents showed, vanished, then revealed).
  function playIntro() {
    S.introShown = true;
    S.introToken++;
    // Restart the souls and graph animations; their columns and frame are still hidden here.
    const souls = S.cols.map((c) => c.souls).filter((p) => ok(p) && p.GetChildCount() > 0);
    for (const p of souls) p.RemoveClass("NSShow");
    const graphOn = ok(UI.graph) && UI.graph.BHasClass("NSOn");
    if (graphOn) UI.graph.RemoveClass("NSShow");
    trigger([UI.frame], "NSIntro");
    trigger(S.cols.map((c) => c.column), "NSIn");
    trigger(souls, "NSShow");
    if (graphOn) { trigger([UI.graph], "NSShow"); reveal(); }
    for (const c of S.cols) itemsShown(c, true);
  }

  function resetIntro() {
    S.introShown = false;
    S.introToken++;
    if (ok(UI.frame)) UI.frame.RemoveClass("NSIntro");
    for (const c of S.cols) {
      if (ok(c.column)) c.column.RemoveClass("NSIn");
      itemsShown(c, false);
    }
  }

  function show(m) {
    UI.frame.AddClass("NSOn");
    S.introShown = false;
    if (UI.screen.BHasClass("Focused")) playIntro();
    for (const kid of UI.screen.Children()) {
      if (kid.id === "MatchID" || kid.BHasClass("MatchMode")) css(kid, { opacity: "0" });
    }
    log(`board shown: match ${m.id}, ${m.teams[0].rows.length}v${m.teams[1].rows.length}, ${clock(m.duration)}`);
  }

  // C++ reuses the stock rows when another match opens on the page (live: items changed under a
  // stale board), so the board deletes its own columns; the rows' inline styles stay valid.
  function teardown() {
    S.gen++;
    unhoverItems(HOVER.items);
    if (ok(UI.frame)) { UI.frame.RemoveClass("NSOn"); UI.frame.RemoveClass("NSIntro"); }
    for (const c of S.cols) {
      if (ok(c.column)) c.column.DeleteAsync(0);
      css(c.items, { transitionDuration: "0s", opacity: "1" }); // the rows may stay stock
    }
    S.introShown = false;
    S.introToken++;
    S.cols = [];
    if (ok(UI.graph)) { UI.graph.RemoveClass("NSOn"); UI.graph.RemoveClass("NSShow"); }
    S.graphScale = 0;
    S.revealToken++;
    S.graphDraws = [];
    if (ok(UI.canvas)) UI.canvas.ClearJS("#00000000");
    if (ok(UI.marks)) UI.marks.RemoveAndDeleteChildren();
  }

  function build(m) {
    teardown();
    renderHeader(m);
    layoutScoreboard();
    const anyWin = m.teams[0].win || m.teams[1].win;
    m.teams.forEach((t, i) => {
      t.rows.forEach((r, index) => decorateRow(r, i, index, anyWin && !t.win));
      hide(t.totals.row);
    });
    progress(SCAN_FROM, "BUILDING BOARD", "");
    renderSouls(new Map());
    show(m);
    logData("rows", m.teams.map((t) => ({ win: t.win, totals: t.totals.value, rows: t.rows.map((r) => ({ hero: r.hero, account: r.account, mvp: r.mvp, ...r.value })) })));
    scan(m);
  }

  // ---------- scan: stock graph tooltip and Lane Stats ----------

  function tooltip() {
    if (ok(UI.tip)) return UI.tip;
    const tip = windowRoot().FindChildTraverse(TIP_ID);
    UI.tip = ok(tip) ? tip : null;
    return UI.tip;
  }

  function tipTokens() {
    const tip = tooltip();
    if (!tip || !tip.visible) return [];
    const out = [];
    const walk = (p) => {
      if (!ok(p) || !p.visible) return;
      if (p.paneltype === "Label") {
        const t = String(p.text || "").replace(/\s+/g, " ").trim();
        if (t) out.push(t);
      }
      for (const kid of p.Children()) walk(kid);
    };
    walk(tip);
    return out;
  }

  // "27:51 | Troopers | 15,441 | (64%) | ... | 23,944" -> { time, rows: [{name, value, pct}], total }
  function readTip() {
    const tokens = tipTokens();
    if (!tokens.length) return null;
    const time = secs(tokens[0]);
    if (time < 0) return null;
    const rest = tokens.slice(1);
    let total = null;
    if (rest.length % 3 === 1) total = num(rest.pop());
    if (rest.length % 3 !== 0 || rest.length === 0) return null;
    const rows = [];
    for (let i = 0; i < rest.length; i += 3) rows.push({ name: rest[i], value: num(rest[i + 1]), pct: num(rest[i + 2]) });
    return { time, rows, total, sig: tokens.join("|") };
  }

  function columns() {
    const canvas = UI.graphs.FindChildTraverse("Graph");
    return ok(canvas) ? canvas.Children() : [];
  }

  // The scan's hovers open the stock tooltip; it is made transparent at once, so it is never drawn
  // while the board reads it (user 2026-10-25: the tooltip flashed over the screen during loading).
  // It gets its opacity back when the Graphs screen is focused (step).
  function muteTip() {
    const tip = tooltip();
    if (!tip || S.tipMuted) return;
    tip.style.opacity = "0";
    S.tipMuted = true;
  }

  function hover(index) {
    const cols = columns();
    const col = cols[index < 0 ? cols.length + index : index];
    muteTip();
    if (ok(col)) $.DispatchEvent("DispatchPanelEvent", col, "onmouseover");
    muteTip(); // the first hover creates the tooltip
  }

  const graphType = (n) => {
    const dd = UI.graphs.FindChildTraverse("TypeDropDown");
    if (ok(dd)) dd.SetSelected(`type_${n}`);
  };
  const asTeam = (on) => $.DispatchEvent("CitadelGraphShowAsTeam", UI.graphs, on ? 1 : 0);
  const pick = (n) => $.DispatchEvent("CitadelMatchDetailsGraphClickPlayer", UI.graphs, n);

  // Runs jobs in order. Each job acts, then checks at once; a check that is not satisfied yet is
  // retried once per frame (the graph may redraw a frame later) and the act repeated every other
  // frame. Synchronous results chain within one frame.
  function runJobs(gen, jobs, done, onStep) {
    const stats = { frames: 0, retries: 0, failed: 0, t0: Date.now() };
    let i = 0;
    const next = () => {
      while (!stopped && gen === S.gen && i < jobs.length) {
        const job = jobs[i];
        if (onStep) onStep(i, jobs.length);
        if (job.skip && job.skip()) { i++; continue; }
        try { job.act(); } catch (e) { logOnce(`act:${e}`, `scan act failed: ${e}`); }
        if (!attempt(job, 0)) return;
      }
      if (!stopped && gen === S.gen) done(stats);
    };
    // true = finished synchronously, keep looping; false = waiting on a frame.
    const attempt = (job, tries) => {
      let result = null;
      try { result = job.check(tries); } catch (e) { result = null; }
      if (result !== null) { job.take(result); i++; return true; }
      if (tries >= (job.max || FRAME_TRIES)) { stats.failed++; if (job.fail) job.fail(); i++; return true; }
      stats.retries++;
      $.Schedule(0, () => {
        if (stopped || gen !== S.gen) return;
        stats.frames++;
        if (tries % 2 === 1) { try { job.act(); } catch (e) { /* logged on first act */ } }
        if (attempt(job, tries + 1)) next();
      });
      return false;
    };
    next();
  }

  function heroOfButton(n) {
    const btn = UI.graphs.FindChildTraverse(`PlayerButton${n}`);
    let found = 0;
    const walk = (p, depth) => {
      if (found || !ok(p) || depth > 5) return;
      let h = 0;
      try { h = Number(p.heroid) || 0; } catch (e) { h = 0; }
      if (h > 0) { found = h; return; }
      for (const kid of p.Children()) walk(kid, depth + 1);
    };
    walk(btn, 0);
    return found;
  }

  function laneSig() {
    const parts = [];
    for (const [id] of LANE_TIERS.concat([["LaneStatKills"], ["LaneStatNetWorth"]])) {
      const panel = UI.graphs.FindChildTraverse(id);
      if (!ok(panel)) return null;
      const labels = [];
      const walk = (p) => { if (!ok(p)) return; if (p.paneltype === "Label") labels.push(String(p.text || "").trim()); for (const k of p.Children()) walk(k); };
      walk(panel);
      parts.push(labels);
    }
    return parts;
  }

  function scan(m) {
    const gen = S.gen;
    const canvas = UI.graphs ? UI.graphs.FindChildTraverse("Graph") : null;
    const count = ok(canvas) ? canvas.GetChildCount() : 0;
    if (!count) { log("scan: no graph columns"); progressDone(); return; }
    S.scanning = gen;
    const totals = [m.teams[0].totals.value.souls, m.teams[1].totals.value.souls];
    const series = [];
    const souls = new Map();
    const events = [];
    const lanes = [];
    let teamNames = null; // tooltip row name -> team index, from the last column's exact totals
    let prevSig = "";
    let lastPoint = null;
    const jobs = [];
    const setup = (fn) => ({ act: fn, check: () => true, take: () => {} });

    // 1. Soul lead: Souls Collected, team mode, last column first (its values equal the totals rows,
    //    which names the two tooltip rows), then the other columns left to right.
    const teamJob = (index) => ({
      act: () => hover(index),
      check: () => {
        const tip = readTip();
        if (!tip || tip.rows.length !== 2 || tip.sig === prevSig) return null;
        if (!teamNames) {
          // The last column's values equal the totals rows, give or take a few souls (live, demo
          // 121685912: 171,451 in the graph against a totals row of 171,452), so the closer pairing names
          // the two tooltip rows.
          const [r0, r1] = tip.rows;
          const keep = Math.abs(r0.value - totals[0]) + Math.abs(r1.value - totals[1]);
          const swap = Math.abs(r0.value - totals[1]) + Math.abs(r1.value - totals[0]);
          const tolerance = Math.max(50, 0.005 * (totals[0] + totals[1]));
          if (r0.name === r1.name || keep === swap || Math.min(keep, swap) > tolerance) return null;
          teamNames = keep < swap ? new Map([[r0.name, 0], [r1.name, 1]]) : new Map([[r0.name, 1], [r1.name, 0]]);
        }
        if (!teamNames.has(tip.rows[0].name) || !teamNames.has(tip.rows[1].name)) return null;
        return tip;
      },
      take: (tip) => {
        prevSig = tip.sig;
        const v = [0, 0];
        for (const r of tip.rows) v[teamNames.get(r.name)] = r.value;
        const point = { t: tip.time, a: v[0], b: v[1] };
        if (index < 0) lastPoint = point;
        else series.push(point);
      },
      fail: () => logOnce(`team:${index}`, `scan: team column ${index} unread (${tipTokens().join("|").slice(0, 120)})`)
    });
    jobs.push(setup(() => { graphType(0); asTeam(true); }));
    jobs.push(teamJob(-1));
    for (let c = 0; c < count - 1; c++) jobs.push(teamJob(c));
    jobs.push(setup(() => { if (lastPoint) series.push(lastPoint); }));

    // 2. Which player each graph button is: the button's hero image when it exposes one, else the
    //    button's own Souls Collected at the end, which equals exactly one row's net worth.
    const lastTime = () => (lastPoint ? lastPoint.t : m.duration);
    const buttonHero = Array.from({ length: 13 }, (_, n) => (n ? heroOfButton(n) : 0));
    const rows = m.teams[0].rows.concat(m.teams[1].rows);
    const playerTip = (tries, wantTeamRows) => {
      const tip = readTip();
      if (!tip || tip.time !== lastTime()) return null;
      if (teamNames && tip.rows.some((r) => teamNames.has(r.name)) !== wantTeamRows) return null;
      if (tip.sig === prevSig && tries < 4) return null;
      return tip;
    };
    if (buttonHero.slice(1).some((h) => !h)) {
      jobs.push(setup(() => { graphType(0); asTeam(false); }));
      for (let n = 1; n <= 12; n++) {
        jobs.push({
          skip: () => buttonHero[n] > 0,
          act: () => { pick(n); hover(-1); },
          check: (tries) => {
            const tip = playerTip(tries, false);
            return tip && tip.rows.length === 1 ? tip : null;
          },
          take: (tip) => {
            prevSig = tip.sig;
            const match = rows.filter((r) => r.value.souls === tip.rows[0].value);
            if (match.length === 1) buttonHero[n] = match[0].hero;
          },
          fail: () => logOnce(`map:${n}`, `scan: button ${n} unmapped (${tipTokens().join("|").slice(0, 120)})`)
        });
      }
    }

    // 3. Souls by source per player, at the last column.
    jobs.push(setup(() => { graphType(4); asTeam(false); }));
    for (let n = 1; n <= 12; n++) {
      jobs.push({
        skip: () => !buttonHero[n],
        act: () => { pick(n); hover(-1); },
        check: (tries) => playerTip(tries, false),
        take: (tip) => { prevSig = tip.sig; souls.set(buttonHero[n], tip); },
        fail: () => logOnce(`souls:${n}`, `scan: souls for button ${n} (hero ${buttonHero[n]}) unread`)
      });
    }

    // 4. Lane Stats: objective destroy times, both teams, one lane per pick until three lanes. The
    //    panel is read a frame after the pick so a stale lane is never taken for a new one.
    let prevLane = "";
    jobs.push(setup(() => graphType(12)));
    for (let n = 1; n <= 12; n++) {
      jobs.push({
        skip: () => lanes.length >= 3,
        act: () => pick(n),
        check: (tries) => {
          if (tries === 0) return null;
          const sig = laneSig();
          if (!sig) return null;
          const flat = JSON.stringify(sig);
          if (flat === prevLane && tries < 3) return null;
          return { sig, flat };
        },
        take: ({ sig, flat }) => {
          prevLane = flat;
          if (!lanes.some((l) => l.flat === flat)) lanes.push({ flat, sig, button: n });
        }
      });
    }

    // 5. Put the stock graph back the way it opens.
    jobs.push(setup(() => { graphType(0); asTeam(true); }));

    log(`scan: ${jobs.length} steps, ${count} columns, button heroes ${buttonHero.slice(1).join(",")}`);
    runJobs(gen, jobs, (stats) => {
      S.scanning = 0;
      for (const lane of lanes) {
        LANE_TIERS.forEach(([, tier], i) => {
          const labels = lane.sig[i];
          // [team 1's structure, tier name, team 2's structure]: a time on the left is team 1's
          // structure falling, so team 2 took it (verified against the metadata, FINDINGS.md).
          const left = secs(labels[0]);
          const right = secs(labels[labels.length - 1]);
          if (left >= 0) events.push({ t: left, tier, owner: 1, killer: 2 });
          if (right >= 0) events.push({ t: right, tier, owner: 2, killer: 1 });
        });
      }
      events.sort((a, b) => a.t - b.t);
      log(`scan done in ${Date.now() - stats.t0} ms, ${stats.frames} frames, ${stats.retries} retries, ${stats.failed} failed: ${series.length} lead points, ${souls.size} souls, ${lanes.length} lanes, ${events.length} objectives`);
      logData("series", series);
      logData("souls", Array.from(souls, ([hero, tip]) => ({ hero, total: tip.total, rows: tip.rows })));
      logData("events", events);
      renderSouls(souls);
      renderGraph(series, events, m.duration);
      progressDone();
    }, (i, total) => progress(SCAN_FROM + (1 - SCAN_FROM) * (i / total), "READING GRAPHS", `${i + 1} / ${total}`));
  }

  // ---------- loop ----------

  // One check. Returns whether the page shows.
  function step() {
    if (!ok(UI.page)) {
      UI.page = findPage();
      if (!ok(UI.page)) return false;
      UI.screen = UI.page.FindChildTraverse("ScoreboardScreen");
      UI.scoreboard = UI.page.FindChildTraverse("Scoreboard");
      UI.graphs = UI.page.FindChildTraverse("Graphs");
    }
    if (S.hooked !== UI.page) {
      S.hooked = UI.page;
      // A screen pick (live: the index, 3 = Scoreboard) is a page event, not an unhandled one.
      $.RegisterEventHandler("CitadelPostGameSelectScreenIndex", UI.page, () => { if (!stopped) wake(SCREEN_WAKE_MS); });
    }
    if (!ok(UI.scoreboard) || !ok(UI.graphs) || !ok(UI.screen)) return false;
    if (!UI.page.BHasClass("PageVisible")) { if (S.loadingSince) { S.loadingSince = 0; progressHide(); } return false; }
    // The board builds while the page opens on the Team1 screen; the entrance plays when the Scoreboard
    // screen comes into focus and is re-armed once that screen has been away a while (playIntro).
    const focused = UI.screen.BHasClass("Focused");
    if (!focused && S.focused) S.blurAt = Date.now();
    S.focused = focused;
    if (S.key && focused && !S.introShown) playIntro();
    if (S.key && !focused && S.introShown && Date.now() - S.blurAt >= INTRO_RESET_MS) resetIntro();
    // The stock graph tooltip does not close by script: it is drawn only on the Graphs screen and never while
    // the scan hovers (user 2026-10-25: it showed while loading; 2026-10-26: the user's own hover on the
    // Graphs screen left it over the scoreboard).
    if (ok(UI.tip)) {
      const show = !focused && S.scanning !== S.gen && ok(UI.graphs.GetParent()) && UI.graphs.GetParent().BHasClass("Focused");
      if (show === S.tipMuted) {
        UI.tip.style.opacity = show ? "1" : "0";
        S.tipMuted = !show;
      }
    }
    // Steady state: the first row's bound label still reads what the board was built from.
    // Rows are reused across matches, so panel identity is not enough.
    if (S.key && ok(S.bound) && String(S.bound.text) === S.sig) return true;
    const m = readMatch();
    if (!m) { loading(); return true; }
    S.bound = m.teams[0].rows[0].row.FindChild("NSBinds").FindChild("NSBind");
    S.sig = String(S.bound.text);
    const key = matchKey(m);
    if (key === S.key) { if (S.loadingSince) { S.loadingSince = 0; progressHide(); } return true; }
    S.key = key;
    S.loadingSince = 0;
    build(m);
    return true;
  }

  function tick() {
    if (stopped) return;
    try {
      step();
    } catch (e) {
      logOnce(`tick:${e}`, `tick failed: ${e}`);
    }
    const token = ++S.loop;
    $.Schedule(Date.now() < S.burstUntil ? BURST_S : FLOOR_S, () => { if (token === S.loop) tick(); });
  }

  // An event checks at once and then every BURST_S for ms; a pending check is superseded.
  function wake(ms) {
    S.burstUntil = Math.max(S.burstUntil, Date.now() + ms);
    tick();
  }

  bindUI();
  log("board loaded");
  // Arrives about 0.5 s after citadel_match_details, also while the page is hidden (live P4).
  matchListener = $.RegisterForUnhandledEvent("CitadelMatchDetailsUpdated", () => { if (!stopped) wake(MATCH_WAKE_MS); });
  wake(MATCH_WAKE_MS); // the page layout loads for a match
})();
