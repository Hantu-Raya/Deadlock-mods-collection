// Night Shift post-game stats board (Observer HUD, pak10).
// Runs in the board layout that pg_loader.js loads into #ScoreboardScreen. Two halves:
//   scan   - reads everything offline from the stock page: exact row values through injected
//            {i:...} labels, then the stock graph's tooltip column by column (soul lead per team,
//            souls by source per player) and the Lane Stats panel (objective destroy times).
//            The tooltip is opened with DispatchPanelEvent on a graph column (ENGINE.md: the
//            direct CitadelShowPostGameGraphsTooltip event has no JS factory and never parses).
//   render - the Night Shift layout: header, 12 player columns, label column, lead graph.
// Logs [NS] lines to console.log; the [NS] data lines are the E2E artifact read by
// observer_hud/scripts/verify-postgame-live.js.
(() => {
  "use strict";

  const TAG = "[NS]";
  // Event-driven (plan phase 2): the match event (CitadelMatchDetailsUpdated) and a screen pick
  // (CitadelPostGameSelectScreenIndex) check at once; otherwise one check a second. While the page is
  // hidden that check reads only PageVisible: live, reopening a match already loaded this session
  // brought no event, and the Scoreboard pick woke nothing (a sleeping board showed the old match).
  const FLOOR_S = 1; // safety check, shown or hidden
  const BURST_S = 0.1; // after an event: waiting for the rows, the page or the screen focus
  const MATCH_WAKE_MS = 5000; // burst after the match event (and at boot: the page loads for a match)
  const SCREEN_WAKE_MS = 1000; // burst after a screen pick (the carousel sets Focused)
  const LOADING_MAX_MS = 30000; // stop showing "loading" after this (a failed load shows the stock error)
  const SCAN_FROM = 0.2; // progress share of the rows; the scan steps fill the rest
  const TIP_ID = "PostGameGraphTooltip";
  const COLUMN = "file://{resources}/layout/observer_hud/pg_column.xml";
  const FRAME_TRIES = 12; // frames a scan step may wait for the graph to redraw
  const ctx = $.GetContextPanel();
  if (typeof ctx.NSStop === "function") ctx.NSStop();
  let stopped = false;
  let matchListener = null;
  let handoffListener = null;
  ctx.NSStop = () => {
    stopped = true;
    if (matchListener !== null) {
      try { $.UnregisterForUnhandledEvent("CitadelMatchDetailsUpdated", matchListener); } catch (e) { /* already gone */ }
      matchListener = null;
    }
    if (handoffListener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", handoffListener); } catch (e) { /* already gone */ }
      handoffListener = null;
    }
    if (ST.panel && ok(ST.panel)) ST.panel.DeleteAsync(0);
  };
  const OH = $.OHState; // cards are cleaned and matched with oh_state.js (loaded before this script)

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
  const GRAPH_W = 1600;
  const GRAPH_H = 112;

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
  const secs = (text) => { const m = /^(\d+):(\d\d)$/.exec(String(text).trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const fmtK = (v) => `${(v / 1000).toFixed(1)}K`;

  const UI = {
    page: null, screen: null, scoreboard: null, graphs: null, tip: null,
    team: [null, null], names: [null, null], results: [null, null], worth: [null, null], kills: [null, null],
    clock: null, match: null, soulsLabel: null, graph: null, bars: null, ticks: null, events: null, top: null, bottom: null,
    progress: null, progressFill: null, progressText: null
  };
  const S = {
    key: "",
    gen: 0,
    match: null, // { id, duration, teams: [{win, rows, totals}, ...] }
    cols: [], // per player row: { hero, souls }
    tipMuted: false, // the stock tooltip was made transparent after the scan
    sig: "", // first row's bound text when the board was built (steady-state check)
    bound: null, // that bound label (ours, inside a reused stock row)
    loadingSince: 0, // Date.now() when the visible page started waiting for match rows
    progressGen: 0, // bumps on every progress change so a stale fade-out does not hide a new run
    hooked: null, // the page whose screen-pick event wakes the board
    loop: 0, // token of the one scheduled check; a wake supersedes a pending one
    burstUntil: 0 // Date.now() until which the board checks at BURST_S
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
      UI.team[i - 1] = ctx.FindChildTraverse(`NSTeam${i}`);
      UI.names[i - 1] = ctx.FindChildTraverse(`NSTeamName${i}`);
      UI.results[i - 1] = ctx.FindChildTraverse(`NSResult${i}`);
      UI.worth[i - 1] = ctx.FindChildTraverse(`NSWorth${i}`);
      UI.kills[i - 1] = ctx.FindChildTraverse(`NSKills${i}`);
    }
    UI.clock = ctx.FindChildTraverse("NSClock");
    UI.match = ctx.FindChildTraverse("NSMatch");
    UI.soulsLabel = ctx.FindChildTraverse("NSSoulsLabel");
    UI.graph = ctx.FindChildTraverse("NSGraph");
    UI.bars = ctx.FindChildTraverse("NSGraphBars");
    UI.ticks = ctx.FindChildTraverse("NSGraphTicks");
    UI.events = ctx.FindChildTraverse("NSGraphEvents");
    UI.top = ctx.FindChildTraverse("NSGraphTop");
    UI.bottom = ctx.FindChildTraverse("NSGraphBottom");
    UI.progress = ctx.FindChildTraverse("NSProgress");
    UI.progressFill = ctx.FindChildTraverse("NSProgressFill");
    UI.progressText = ctx.FindChildTraverse("NSProgressText");
    UI.progressStep = ctx.FindChildTraverse("NSProgressStep");
    UI.frame = ctx.FindChildTraverse("NSFrame");
    UI.logo = [ctx.FindChildTraverse("NSLogo1"), ctx.FindChildTraverse("NSLogo2")];
    UI.org = ctx.FindChildTraverse("NSOrgText");
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
  // tooltip stay as they are.
  function styleItems(items) {
    // Stock gives ItemsContainer a parent-relative height, which is 0 inside a fit-children row
    // (live: h=0 with the icons centred on it, so nothing showed).
    css(items, { width: "105px", height: "fit-children", padding: "0px", margin: "6px 0px 0px 0px", uiScale: "100%", flowChildren: "right-wrap", horizontalAlign: "left", verticalAlign: "top", overflow: "noclip", visibility: "visible" });
    // Stock icons are vertical-align: center, which stacks every wrapped row on the middle one.
    for (const icon of items.Children()) {
      css(icon, { width: "45px", height: "45px", padding: "0px", uiScale: "75%", margin: "0px 1px 1px 0px", verticalAlign: "top", horizontalAlign: "left", opacity: "1", saturation: "1" });
    }
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
    S.cols.push({ hero: r.hero, column, souls: column.FindChildTraverse("NSSouls") });
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

  function renderGraph(series, events, duration) {
    if (!ok(UI.graph)) return;
    const pts = series.filter((p) => p.t > 0 && p.t <= duration + 1);
    if (pts.length < 5 || duration <= 0) { UI.graph.RemoveClass("NSOn"); return; }
    const x = (t) => Math.round(Math.max(0, Math.min(1, t / duration)) * GRAPH_W);
    const half = GRAPH_H / 2;
    const maxAbs = Math.max(1000, ...pts.map((p) => Math.abs(p.a - p.b)));
    UI.bars.RemoveAndDeleteChildren();
    let prev = 0;
    for (const p of pts) {
      const x1 = x(p.t);
      const lead = p.a - p.b; // team 1 lead up (amber), team 2 lead down (blue)
      const h = Math.round(Math.abs(lead) / maxAbs * (half - 6));
      if (h > 0 && x1 > prev) {
        const bar = $.CreatePanel("Panel", UI.bars, "", { class: lead >= 0 ? "NSBar" : "NSBar NSBarTeam2", hittest: "false" });
        bar.AddClass(`NSW${Math.min(7, Math.floor(8 * prev / GRAPH_W))}`); // left-to-right wave (CSS)
        bar.style.width = `${Math.max(1, x1 - prev - 1)}px`;
        bar.style.height = `${h}px`;
        bar.style.marginLeft = `${prev}px`;
        bar.style.marginTop = `${lead >= 0 ? half - h : half}px`;
      }
      prev = x1;
    }
    setText(UI.top, `+${fmtK(maxAbs)}`);
    setText(UI.bottom, `+${fmtK(maxAbs)}`);
    UI.ticks.RemoveAndDeleteChildren();
    for (let t = 0; t <= duration; t += 300) {
      const tick = $.CreatePanel("Label", UI.ticks, "", { class: "NSTick", text: clock(t), hittest: "false" });
      tick.style.marginLeft = `${Math.max(0, Math.min(GRAPH_W - 60, x(t) - 30))}px`;
    }
    const end = $.CreatePanel("Label", UI.ticks, "", { class: "NSTick", text: clock(duration), hittest: "false" });
    end.style.marginLeft = `${GRAPH_W - 60}px`;
    UI.events.RemoveAndDeleteChildren();
    for (const e of events) {
      const cls = `NSEvent ${e.tier === "tier1" ? "NSEvTier1" : e.tier === "tier2" ? "NSEvTier2" : "NSEvBase"} ${e.killer === 2 ? "NSEvTeam2" : "NSEvTeam1"}`;
      const icon = $.CreatePanel("Panel", UI.events, "", { class: cls, hittest: "false" });
      const left = Math.max(0, Math.min(GRAPH_W - 26, x(e.t) - 12));
      icon.AddClass(`NSW${Math.min(7, Math.floor(8 * left / GRAPH_W))}`);
      icon.style.marginLeft = `${left}px`;
    }
    UI.graph.RemoveClass("NSShow");
    UI.graph.AddClass("NSOn");
    trigger([UI.graph], "NSShow");
  }

  // ---------- match cards: team names, logos and organiser in the header ----------
  // A card names the two teams by the accounts of their players (OHState "match cards"). It arrives in
  // this process from the HUD ("OHM1:" on ClientUI_FireOutput, sent again every few seconds because this
  // script only runs once the post-game page has shown), or from the store page for a match nobody
  // spectated in this session or after a restart. The header renders the stock names first and swaps when a
  // card with at least OH.MATCH_MIN of the match's 12 accounts is known.
  const STORE_URL = "https://hantu-raya.github.io/hpv2-store/oh/v2/";
  const STORE_PREFIX = "OHS2:";
  const HELLO_S = 2; // the page is greeted at 0, 2, 4 and 6 s (the second load after a blank visit at 4 s)
  const HELLO_TRIES = 4;
  const QUERY_S = 4;
  const MAX_CARDS = 12;
  const ST = { panel: null, phase: "idle", gen: 0, seq: 0, id: "", forKey: "", tries: 0, handlerSet: false };
  const CARDS = { handed: [], stored: new Map(), asked: new Set(), applied: null, accounts: [], team1: [], team2: [], id: "", key: "" };
  const LOGOS = [{ image: null, url: "", sources: [], seq: 0 }, { image: null, url: "", sources: [], seq: 0 }];

  // A card handed over: the newest per roster and match id wins (an older one is stale, an equal one is a repeat).
  function onHandoff(raw) {
    if (stopped) return;
    const card = OH.decodeHandoff(raw);
    if (!card) return;
    const own = new Set(card.a.concat(card.b).map(String));
    const at = CARDS.handed.findIndex((old) => card.id === old.id && OH.cardShared(old, own) >= OH.MATCH_MIN);
    if (at >= 0) {
      if (CARDS.handed[at].at > card.at) return;
      CARDS.handed.splice(at, 1);
    }
    CARDS.handed.push(card);
    while (CARDS.handed.length > MAX_CARDS) CARDS.handed.shift();
    refreshCard();
  }

  function setLogo(side, url) {
    const slot = LOGOS[side];
    const panel = UI.logo[side];
    if (!ok(panel) || slot.url === url) return;
    slot.url = url;
    slot.sources = url ? OH.logoSources(url) : [];
    slot.seq++;
    if (ok(slot.image)) slot.image.DeleteAsync(0);
    slot.image = null;
    showLogo(side, false);
    loadLogo(side, 0);
  }
  // One Image per source: a failed one makes way for the next; the wordmark stays until ImageLoaded and
  // when every source failed. URLs are never logged.
  function loadLogo(side, index) {
    const slot = LOGOS[side];
    const panel = UI.logo[side];
    if (ok(slot.image)) slot.image.DeleteAsync(0);
    slot.image = null;
    if (index >= slot.sources.length || !ok(panel)) return;
    const seq = slot.seq;
    const image = $.CreatePanel("Image", panel, `NSLogoImage${seq}_${index}`, { scaling: "stretch-to-fit-preserve-aspect", hittest: "false" });
    image.AddClass("NSLogoImage");
    slot.image = image;
    $.RegisterEventHandler("ImageLoaded", image, () => {
      if (stopped || slot.image !== image || slot.seq !== seq) return;
      showLogo(side, true);
    });
    $.RegisterEventHandler("ImageFailedLoad", image, () => {
      if (stopped || slot.image !== image || slot.seq !== seq) return;
      loadLogo(side, index + 1);
    });
    image.SetImage(slot.sources[index]);
  }
  // A loaded custom logo takes the wordmark's place (no wash colour, no speckle mask): the wordmark classes go
  // while it shows and come back with it.
  function showLogo(side, on) {
    const panel = UI.logo[side];
    if (!ok(panel)) return;
    panel.SetHasClass("NSLogoCustom", on);
    panel.SetHasClass("NSLogo", !on);
    panel.SetHasClass(`NSLogoTeam${side + 1}`, !on);
    if (ok(LOGOS[side].image)) LOGOS[side].image.SetHasClass("NSLoaded", on);
  }

  // The header with the stock names, then the card's (the card's Amber team sits where its players sit).
  function renderCard(card) {
    CARDS.applied = card;
    for (let i = 0; i < 2; i++) {
      const entry = card ? card.t[OH.cardSide(card, CARDS.team1, CARDS.team2) === 0 ? i : 1 - i] : null;
      setText(UI.names[i], entry && entry[0] ? entry[0] : $.Localize(`#Citadel_Team${i + 1}_Name`));
      setLogo(i, entry ? entry[2] : "");
    }
    setText(UI.org, card && card.r ? card.r[0] : "");
  }
  // The best card now: handed ones and the one the store gave for this match.
  function refreshCard() {
    if (!CARDS.accounts.length) return;
    const pool = CARDS.handed.concat(CARDS.stored.has(CARDS.key) ? [CARDS.stored.get(CARDS.key)] : []);
    const card = OH.pickCard(pool, CARDS.accounts, CARDS.id);
    if (card === CARDS.applied) return;
    if (card && CARDS.applied && JSON.stringify(card) === JSON.stringify(CARDS.applied)) return;
    renderCard(card);
    if (card) log(`header: match card from the ${CARDS.handed.includes(card) ? "handoff" : "store"}, ${OH.cardShared(card, new Set(CARDS.accounts))} of ${CARDS.accounts.length} accounts shared`);
  }
  // A match was built: its 12 accounts, the stock header, a card if one is known, else one store query.
  function identify(m) {
    CARDS.team1 = m.teams[0].rows.map((r) => r.account).filter(Boolean);
    CARDS.team2 = m.teams[1].rows.map((r) => r.account).filter(Boolean);
    CARDS.accounts = CARDS.team1.concat(CARDS.team2);
    CARDS.id = String(m.id || "");
    CARDS.key = S.key;
    CARDS.applied = undefined; // the header is redrawn for this match
    renderCard(null);
    refreshCard();
    if (CARDS.applied || CARDS.asked.has(CARDS.key) || CARDS.accounts.length < OH.MATCH_MIN) return;
    CARDS.asked.add(CARDS.key);
    askStore();
  }

  // The store page (store v2): a hidden CitadelHTMLPanel made only now, when the page shows and nothing
  // handed over fits. hello, then one query (o:"q") for this match's accounts, then about:blank. Replies are
  // matched by request id and by match key, so a late one never names the next match. A few hellos, then it
  // gives up until the next match.
  function storePanel() {
    if (ok(ST.panel)) return ST.panel;
    const wrap = $.CreatePanel("Panel", ctx, "NSStoreWrap", { hittest: "false" });
    wrap.AddClass("NSStoreWrap");
    const panel = $.CreatePanel("CitadelHTMLPanel", wrap, "NSStore", { hittest: "false", acceptsfocus: "false" });
    panel.AddClass("NSStore");
    ST.panel = panel;
    ST.handlerSet = false;
    return panel;
  }
  function storeSend(message) {
    const panel = storePanel();
    if (!ST.handlerSet) {
      ST.handlerSet = true;
      $.RegisterEventHandler("HTMLTitle", panel, onStoreTitle);
    }
    panel.SetURL(`${STORE_URL}#${encodeURIComponent(JSON.stringify(message))}`);
  }
  function storeBlank() {
    if (ok(ST.panel)) ST.panel.SetURL("about:blank");
  }
  function askStore() {
    if (ST.phase !== "idle") return; // the running exchange asks for the current match when it is done
    log("store: asking for the match card");
    ST.phase = "hello";
    ST.tries = 0;
    const gen = ++ST.gen;
    hello(gen);
  }
  function hello(gen) {
    if (stopped || gen !== ST.gen || ST.phase !== "hello") return;
    if (ST.tries >= HELLO_TRIES) { log("store: no answer, gave up"); storeDone(); return; }
    try {
      // The second visit starts from a blank page: a lost first load never answers a changed fragment.
      if (ST.tries === 2) storeBlank();
      ST.tries++;
      ST.id = `h${++ST.seq}`;
      storeSend({ i: ST.id, o: "hello" });
    } catch (e) {
      storeDone();
      return;
    }
    $.Schedule(HELLO_S, () => hello(gen));
  }
  function query() {
    const gen = ++ST.gen;
    ST.phase = "query";
    ST.forKey = CARDS.key;
    ST.id = `q${++ST.seq}`;
    try {
      storeSend({ i: ST.id, o: "q", a: CARDS.accounts.map(Number), id: CARDS.id });
    } catch (e) {
      storeDone();
      return;
    }
    $.Schedule(QUERY_S, () => { if (!stopped && gen === ST.gen && ST.phase === "query") storeDone(); });
  }
  function storeDone() {
    ST.gen++;
    ST.phase = "idle";
    ST.id = "";
    try { storeBlank(); } catch (e) { /* the panel is gone */ }
  }
  function onStoreTitle(panelOrTitle, eventTitle) {
    if (stopped) return;
    const title = eventTitle !== undefined ? eventTitle : panelOrTitle;
    if (typeof title !== "string" || title.indexOf(STORE_PREFIX) !== 0) return;
    let reply = null;
    try { reply = JSON.parse(title.slice(STORE_PREFIX.length)); } catch (e) { return; }
    if (!reply || typeof reply !== "object" || reply.i !== ST.id) return; // late, duplicate or foreign
    if (reply.o === "ready" && ST.phase === "hello") {
      if (typeof reply.h !== "string" || reply.h.split("#")[0] !== STORE_URL || reply.v !== 2 || reply.ok !== true) { storeDone(); return; }
      query();
      return;
    }
    if (reply.o !== "q" || ST.phase !== "query") return;
    const key = ST.forKey;
    storeDone();
    if (reply.ok === true && reply.x === 1) {
      const card = OH.cleanCard(reply.c);
      if (card) CARDS.stored.set(key, card);
    }
    log(`store: answered, ${CARDS.stored.has(key) ? "a card" : "no card"} for the match`);
    // The match changed while the reply was on its way: it names nothing now; the current match asks next.
    if (key === CARDS.key) refreshCard();
    else if (!CARDS.applied && CARDS.asked.has(CARDS.key) && !CARDS.stored.has(CARDS.key)) askStore();
  }

  // ---------- show / teardown ----------

  // Remove the entrance classes, then add them back a frame later so the CSS animations restart.
  function replayIntro() {
    const souls = S.cols.map((c) => c.souls).filter((p) => ok(p) && p.GetChildCount() > 0);
    if (ok(UI.frame)) UI.frame.RemoveClass("NSIntro");
    for (const c of S.cols) if (ok(c.column)) c.column.RemoveClass("NSIn");
    for (const p of souls) p.RemoveClass("NSShow");
    const graphOn = ok(UI.graph) && UI.graph.BHasClass("NSOn");
    if (graphOn) UI.graph.RemoveClass("NSShow");
    trigger([UI.frame], "NSIntro");
    trigger(S.cols.map((c) => c.column), "NSIn");
    trigger(souls, "NSShow");
    if (graphOn) trigger([UI.graph], "NSShow");
  }

  function show(m) {
    UI.frame.AddClass("NSOn");
    trigger([UI.frame], "NSIntro");
    trigger(S.cols.map((c) => c.column), "NSIn");
    for (const kid of UI.screen.Children()) {
      if (kid.id === "MatchID" || kid.BHasClass("MatchMode")) css(kid, { opacity: "0" });
    }
    log(`board shown: match ${m.id}, ${m.teams[0].rows.length}v${m.teams[1].rows.length}, ${clock(m.duration)}`);
  }

  // C++ reuses the stock rows when another match opens on the page (live: items changed under a
  // stale board), so the board deletes its own columns; the rows' inline styles stay valid.
  function teardown() {
    S.gen++;
    if (ok(UI.frame)) { UI.frame.RemoveClass("NSOn"); UI.frame.RemoveClass("NSIntro"); }
    for (const c of S.cols) if (ok(c.column)) c.column.DeleteAsync(0);
    S.cols = [];
    if (ok(UI.graph)) { UI.graph.RemoveClass("NSOn"); UI.graph.RemoveClass("NSShow"); }
  }

  function build(m) {
    teardown();
    S.match = m;
    renderHeader(m);
    identify(m);
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

  function hover(index) {
    const cols = columns();
    const col = cols[index < 0 ? cols.length + index : index];
    if (ok(col)) $.DispatchEvent("DispatchPanelEvent", col, "onmouseover");
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

  // The stock tooltip stays up after a scripted hover. Try the stock ways to close it; as a last
  // resort make it transparent and give the opacity back when the Graphs screen is focused (tick).
  function tipState(tip) {
    const chain = [];
    for (let p = tip, d = 0; ok(p) && d < 3; p = p.GetParent(), d++) chain.push(`${p.paneltype}#${p.id}${p.visible ? "" : "[hidden]"}`);
    return chain.join(" < ");
  }

  function hideTip(gen) {
    const tip = tooltip();
    if (!tip) return;
    const tries = [
      ["mouseout", () => { const c = columns(); if (c.length) $.DispatchEvent("DispatchPanelEvent", c[c.length - 1], "onmouseout"); }],
      ["hide(graphs)", () => $.DispatchEvent("CitadelHidePostGameGraphsTooltip", UI.graphs)],
      ["UIHideCustomLayoutTooltip", () => $.DispatchEvent("UIHideCustomLayoutTooltip", TIP_ID)]
    ];
    log(`tooltip: ${tipState(tip)}`);
    const step = (i) => {
      if (stopped || gen !== S.gen) return;
      if (!ok(tip) || !tip.visible) { log(`tooltip hidden after ${i ? tries[i - 1][0] : "nothing"}`); return; }
      if (i >= tries.length) {
        log(`tooltip still visible (${tipState(tip)}); made transparent until the Graphs screen opens`);
        tip.style.opacity = "0";
        S.tipMuted = true;
        return;
      }
      try { tries[i][1](); } catch (e) { log(`hide ${tries[i][0]}: ${e}`); }
      $.Schedule(0.1, () => step(i + 1));
    };
    step(0);
  }

  function scan(m) {
    const gen = S.gen;
    const canvas = UI.graphs ? UI.graphs.FindChildTraverse("Graph") : null;
    const count = ok(canvas) ? canvas.GetChildCount() : 0;
    if (!count) { log("scan: no graph columns"); progressDone(); return; }
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
          const a = tip.rows.find((r) => r.value === totals[0]);
          const b = tip.rows.find((r) => r.value === totals[1]);
          if (!a || !b || a === b) return null;
          teamNames = new Map([[a.name, 0], [b.name, 1]]);
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
      hideTip(gen);
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
    if (S.tipMuted && ok(UI.tip) && ok(UI.graphs.GetParent()) && UI.graphs.GetParent().BHasClass("Focused")) {
      UI.tip.style.opacity = "1";
      S.tipMuted = false;
    }
    // The board builds while the page opens on the Team1 screen; play the entrance again each
    // time the Scoreboard screen comes into focus, so the user sees it.
    const focused = UI.screen.BHasClass("Focused");
    if (focused && !S.focused && S.key) replayIntro();
    S.focused = focused;
    // Steady state: the first row's bound label still reads what the board was built from.
    // Rows are reused across matches, so panel identity is not enough.
    if (S.key && ok(S.bound) && String(S.bound.text) === S.sig) return true;
    if (!ok(UI.players)) {
      const team = UI.scoreboard.FindChildTraverse("Team1");
      UI.players = ok(team) ? team.FindChildTraverse("TeamPlayers") : null;
      if (!ok(UI.players)) { loading(); return true; }
    }
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
  handoffListener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", onHandoff);
  wake(MATCH_WAKE_MS); // the page layout loads for a match
})();
