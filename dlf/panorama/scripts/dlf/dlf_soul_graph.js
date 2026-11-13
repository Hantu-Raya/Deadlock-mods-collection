// Soul lead graph under the top-bar clock (citadel_hud_top_bar.xml #DLFSoulGraph), drawn like
// ShowRank's Rank History chart: no card, a faint band, guide lines and a zero line, a smooth accent
// line with hollow pins and a marked latest pin. One centred row under the plot reads SOUL LEAD and
// the current lead in the leading team's colour. No team name, time labels or axis values (user
// 2026-10-23: they made it awkward).
// Data (as Observer HUD's Night Desk graph): each tick reads #GameTime and the stock soul plates
// (#TeamScoreFriendly = Amber, #TeamScoreEnemy = Sapphire, the team_networth labels) and keeps one
// sample per SAMPLE_S s of game time. The pin for mark m is the first sample within PIN_WINDOW_S s
// after it (a later one would misdate it); the graph is the run of consecutive pinned marks ending
// at the latest, from 0:00 when it reaches back to the first mark. A clock that runs back (a demo
// seek) drops the samples after it. The graph shows for state.graph.show s at each new mark (0 off,
// -1 always); any change of state.graph previews it for PREVIEW_MS, with sample data before there are
// two pins. Placement (as Observer HUD, user 2026-10-24): the plot is centred under the clock. The
// "timers" are the lowest drawn piece of the centre column (clock, both soul plates, QOLLOCK's rift
// timer, urn tracker and held-buff time while shown, a holding team's charge icon); the stock rift HUD
// moves under them, the stock objective health under it or them (placeKoth, placeObjectives), and the
// graph sits GAP px under whichever shows last, waiting while both show; plus the menu's x/y offsets.
// A piece that was never laid out reads Infinity (live
// 6819 sandbox, 2026-10-24: margin-top "Infinitypx" threw and the graph stayed on the plates), and a
// collapsed one keeps its old geometry, so both are skipped; with no clock to centre on it hides.
// Size lays everything out larger (boxes, fonts, line, pins); a pre-transform-scale2d
// drew blurry low-res text live (2026-10-23). Containers (.TeamNetworth, the 130 px
// #RejuvenatorCharges) are never measured: their empty parts left dead space above the graph live
// (2026-10-23). The piece it sits under is logged on change.
(() => {
  "use strict";

  const TAG = "[DLF-GRAPH]";
  const TICK_SEC = 1;
  const SAMPLE_S = 5;
  const PIN_WINDOW_S = 20;
  const KNOTS = 24;
  const PREVIEW_MS = 8000;
  const GAP = 6;
  // = dlf_banner.css CitadelHudTopBar padding-top (the banner's room). The graph's margin-top counts from
  // under it while the pieces are measured from the top bar's top; ignoring it put the graph 68 px low.
  const TOP_PAD = 68;
  // Layout px, = dlf_soul_graph.css: width (= plot width), plot height, inner x padding, zero line,
  // amplitude, fill column step, line segment length, minimum gap between inner pins.
  const G = { width: 180, plotH: 46, pad: 6, zero: 23, amp: 19, step: 2, line: 3, pinGap: 12 };
  // As Observer HUD (oh_host.js placeKoth / placeObjectives): gaps under the timers, the stock rift HUD
  // margin-tops (citadel_hud_koth.css), the walker bar's offset under the objective panel's top (the
  // mid-boss row is 140, measured once one shows), and DLF's hud.css margin for the panel. DLF puts the
  // first of the rift HUD and the objective health TIMERS_GAP under the timers (4 until 2026-10-24, user:
  // lower, with the graph's default 35 px lower too); between the two OBJ_GAP stays.
  const TIMERS_GAP = 24;
  const KOTH_STOCK_TOP = 110;
  const KOTH_STOCK_RANGE = 120;
  const OBJ_GAP = 4;
  const OBJ_STOCK_OFFSET = 160;
  const OBJ_CSS_MARGIN = 9; // = styles/hud.css #objectives_health_friendly margin-top
  const OBJ_FIND_MS = 5000; // a missing objective panel is looked for again this often
  const CHARGE_CLASSES = ["RejuvCount_1", "RejuvCount_2", "RejuvCount_3", "RejuvCount_4"];
  const LINE_CLASS = { green: "DLFGraphLineGreen", white: "DLFGraphLineWhite", gold: "DLFGraphLineGold", cyan: "DLFGraphLineCyan" };
  // Preview data: a lead (thousands) at each 5:00 mark.
  const SAMPLE = [0, 1.2, 2.6, 1.1, -0.8, -2.2, -0.9, 1.6];

  const context = $.GetContextPanel();
  if (typeof context.DLFSoulGraphStop === "function") context.DLFSoulGraphStop();
  let stopped = false;
  context.DLFSoulGraphStop = () => { stopped = true; };

  const S = $.DLFState;
  const valid = S.valid;
  const attrs = S.hudAttrs(context);
  const DEFAULTS = S.defaults();

  let state = DEFAULTS;
  let graphSig = JSON.stringify(DEFAULTS.graph);
  let previewUntil = 0;
  let errorShown = false;

  const UI = { root: null, draw: null, title: null, lead: null, plot: null, band: null, guides: [], zero: null, foot: null, clock: null, amber: null, sapphire: null,
    clockBox: null, plates: [], rejuvBox: null, rejuvBuff: null, charges: [], koth: null, rift: null, urn: null, urnSpawn: null, kills: null, disc: null };
  // The margins last written on the stock rift HUD and objective panel (null: the stock one is in force).
  const Koth = { margin: null };
  const Obj = { panel: null, parent: null, margin: null, base: null, offset: OBJ_STOCK_OFFSET, findAt: 0 };
  // Last written values per panel and key, so steady ticks write nothing.
  const written = new Map();

  function write(panel, key, value, apply) {
    let entry = written.get(panel);
    if (!entry) written.set(panel, entry = {});
    if (entry[key] === value) return;
    entry[key] = value;
    apply();
  }
  const setText = (panel, text) => write(panel, "text", text, () => { panel.text = text; });
  const setClass = (panel, cls, on) => write(panel, `c:${cls}`, on, () => panel.SetHasClass(cls, on));
  const setStyle = (panel, key, value) => write(panel, `s:${key}`, value, () => { panel.style[key] = value; });

  // ------------------------------------------------------------------ panels

  function find() {
    const root = context.FindChildTraverse("DLFSoulGraph");
    if (!valid(root)) return false;
    UI.root = root;
    UI.draw = root.FindChildTraverse("DLFGraphDraw");
    UI.title = root.FindChildTraverse("DLFGraphTitle");
    UI.plot = root.FindChildTraverse("DLFGraphPlot");
    UI.zero = root.FindChildTraverse("DLFGraphZero");
    UI.foot = root.FindChildTraverse("DLFGraphFoot");
    UI.band = root.FindChildrenWithClassTraverse("DLFGraphBand")[0] || null;
    UI.guides = [root.FindChildrenWithClassTraverse("DLFGraphGuideUp")[0], root.FindChildrenWithClassTraverse("DLFGraphGuideDown")[0]];
    UI.lead = root.FindChildTraverse("DLFGraphLead");
    if (![UI.draw, UI.title, UI.lead, UI.plot, UI.zero, UI.foot, UI.band].concat(UI.guides).every(valid)) return false;
    UI.clock = context.FindChildTraverse("GameTime");
    const label = (id) => {
      const team = context.FindChildTraverse(id);
      return valid(team) ? team.FindChildrenWithClassTraverse("ScoreLabel")[0] || null : null;
    };
    UI.amber = label("TeamScoreFriendly");
    UI.sapphire = label("TeamScoreEnemy");
    UI.clockBox = context.FindChildrenWithClassTraverse("GameClock")[0] || null;
    UI.plates = ["TeamScoreFriendly", "TeamScoreEnemy"].map((id) => context.FindChildTraverse(id));
    UI.rejuvBox = context.FindChildTraverse("RejuvenatorTimer");
    UI.rejuvBuff = context.FindChildTraverse("RejuvBuff");
    // Each team's charge icon; it draws only while its side has RejuvCount_N (stock RejuvCount_1-4).
    UI.charges = ["RejuvenatorFriendly", "RejuvenatorEnemy"].map((id) => {
      const side = context.FindChildTraverse(id);
      return { side, icon: valid(side) ? side.FindChildrenWithClassTraverse("rejuvIcon")[0] || null : null };
    });
    UI.koth = context.FindChildTraverse("KothCashInMeter");
    UI.kills = context.FindChildrenWithClassTraverse("KillsAndAbilityPointsContainer")[0] || null;
    // QOLLOCK's objectives map disc under the clock (objectives_map.css; shown again 2026-10-25).
    UI.disc = context.FindChildTraverse("ObjectivesMap");
    Koth.margin = null;
    UI.rift = null;
    written.clear();
    Graph.drawn = "";
    return true;
  }
  // The graph's own children live and die with its root; only the root and the stock labels are re-checked.
  const partsValid = () => valid(UI.root) && valid(UI.clock) && valid(UI.amber) && valid(UI.sapphire);

  // ------------------------------------------------------------------ samples and pins

  // samples: SAMPLE_S bucket -> { t, v } (first sample in the bucket, v in thousands, Amber positive).
  const Graph = { samples: new Map(), lastT: null, lead: null, shownAt: 0, drawn: "", seq: 0, lastMark: 0, cadence: "", first: 0, every: 0,
    points: null, under: "" };

  // "25:12", "1:02:03" or "-0:15" -> seconds; null when unreadable.
  function parseClock(text) {
    const match = /^\s*(-?)(\d+):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text || ""));
    if (!match) return null;
    const parts = match[4] === undefined ? [0, +match[2], +match[3]] : [+match[2], +match[3], +match[4]];
    const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return match[1] ? -seconds : seconds;
  }
  // "48.2k" (the label may carry markup around it) -> souls; null when unreadable.
  function parseSouls(text) {
    const plain = String(text || "").replace(/<[^>]*>/g, "").replace(/,/g, "");
    const match = /(-?\d+(?:\.\d+)?)\s*([kKmM]?)/.exec(plain);
    if (!match) return null;
    const unit = match[2].toLowerCase();
    return parseFloat(match[1]) * (unit === "k" ? 1e3 : unit === "m" ? 1e6 : 1);
  }

  function pinAt(m) {
    let best = null;
    for (let k = m / SAMPLE_S; k <= (m + PIN_WINDOW_S) / SAMPLE_S; k++) {
      const sample = Graph.samples.get(k);
      if (sample && sample.t >= m && sample.t <= m + PIN_WINDOW_S && (!best || sample.t < best.t)) best = sample;
    }
    return best ? best.v : null;
  }
  // Marks: first, first + every, first + 2 every, ... (state.graph.first / .every; 0 = no mark yet).
  const markAtOrBefore = (t, first, every) => (t < first ? 0 : first + Math.floor((t - first) / every) * every);
  const isMark = (t, first, every) => t >= first && (t - first) % every === 0;
  function latestMark(t, first, every) {
    for (let m = markAtOrBefore(t, first, every); m >= first; m -= every) if (pinAt(m) !== null) return m;
    return 0;
  }

  function sample() {
    const t = parseClock(UI.clock.text);
    if (t === null || t < 0) return;
    const amber = parseSouls(UI.amber.text);
    const sapphire = parseSouls(UI.sapphire.text);
    if (amber === null || sapphire === null) return;
    Graph.lead = amber - sapphire;
    const first = state.graph.first;
    const every = state.graph.every;
    if (Graph.lastT !== null && t < Graph.lastT - 3) {
      for (const [k, entry] of Array.from(Graph.samples)) if (entry.t > t) Graph.samples.delete(k);
      Graph.lastMark = latestMark(t, first, every);
      Graph.seq++;
    }
    Graph.lastT = t;
    const k = Math.floor(t / SAMPLE_S);
    if (!Graph.samples.has(k)) Graph.samples.set(k, { t, v: Graph.lead / 1000 });
    const cadence = `${first}/${every}`;
    if (Graph.cadence !== cadence) {
      // New marks re-pin from the samples without popping the graph.
      Graph.cadence = cadence;
      Graph.first = first;
      Graph.every = every;
      Graph.lastMark = latestMark(t, first, every);
      Graph.seq++;
      return;
    }
    const mark = markAtOrBefore(t, first, every);
    if (mark > 0 && mark > Graph.lastMark && t - mark <= PIN_WINDOW_S && pinAt(mark) !== null) {
      Graph.lastMark = mark;
      Graph.seq++;
      Graph.shownAt = Date.now();
    }
  }

  function series() {
    if (Graph.points && Graph.points.seq === Graph.seq) return Graph.points;
    // The marks lastMark was pinned on (a menu change re-pins at the next sample).
    const first = Graph.cadence ? Graph.first : state.graph.first;
    const every = Graph.cadence ? Graph.every : state.graph.every;
    const pins = [];
    for (let m = Graph.lastMark; m >= first && pinAt(m) !== null; m -= every) pins.unshift({ t: m, v: pinAt(m) });
    if (pins.length && pins[0].t === first) pins.unshift({ t: 0, v: 0 });
    let line = [];
    if (pins.length >= 2) {
      const from = pins[0].t;
      const to = pins[pins.length - 1].t;
      line = pins.slice();
      for (const entry of Graph.samples.values()) {
        if (entry.t > from && entry.t < to && !isMark(entry.t, first, every)) line.push(entry);
      }
      line.sort((a, b) => a.t - b.t);
    }
    Graph.points = { seq: Graph.seq, pins, line };
    return Graph.points;
  }

  const previewSeries = () => {
    const pins = SAMPLE.map((v, i) => ({ t: i * 300, v }));
    return { pins, line: pins };
  };

  // ------------------------------------------------------------------ drawing

  function knotsOf(line) {
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

  // Monotone cubic (Fritsch-Carlson) through the knots: never overshoots a real value.
  function monotone(knots) {
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

  const px = (n) => `${Number(n.toFixed(1))}px`;

  // G at size k (state.graph.size / 100), plus the drawn piece sizes (= dlf_soul_graph.css at 100%).
  const scaled = (k) => ({ width: G.width * k, plotH: G.plotH * k, pad: G.pad * k, zero: G.zero * k, amp: G.amp * k,
    step: G.step * k, line: G.line * k, pinGap: G.pinGap * k, seg: 3 * k, pin: 5 * k, last: 8 * k, halo: 16 * k });

  // Boxes and fonts at size k; written only when the size changes.
  function layout(k) {
    const g = scaled(k);
    setStyle(UI.root, "width", px(g.width));
    setStyle(UI.root, "height", px(66 * k));
    setStyle(UI.plot, "width", px(g.width));
    setStyle(UI.plot, "height", px(g.plotH));
    setStyle(UI.band, "height", px(g.zero));
    setStyle(UI.guides[0], "marginTop", px(4 * k));
    setStyle(UI.guides[1], "marginTop", px(42 * k));
    setStyle(UI.zero, "marginTop", px(g.zero));
    setStyle(UI.foot, "marginTop", px(48 * k));
    setStyle(UI.foot, "height", px(18 * k));
    setStyle(UI.title, "fontSize", px(9 * k));
    setStyle(UI.title, "letterSpacing", px(1.5 * k));
    setStyle(UI.lead, "fontSize", px(14 * k));
    setStyle(UI.lead, "marginLeft", px(6 * k));
  }

  function draw(data, k) {
    const g = scaled(k);
    const target = UI.draw;
    target.RemoveAndDeleteChildren();
    const knots = knotsOf(data.line);
    const curve = monotone(knots);
    const from = knots[0][0];
    const span = knots[knots.length - 1][0] - from || 1;
    const inner = g.width - 2 * g.pad;
    const valueAt = (x) => curve(from + ((x - g.pad) / inner) * span);
    const max = Math.max(1, Math.ceil(Math.max(...knots.map((k) => Math.abs(k[1])), ...data.pins.map((p) => Math.abs(p.v)))));
    const yOf = (v) => g.zero - (v / max) * g.amp;
    const add = (cls, styles) => {
      const panel = $.CreatePanel("Panel", target, "");
      panel.AddClass(cls);
      for (const key of Object.keys(styles)) panel.style[key] = styles[key];
      return panel;
    };
    // Area: columns from the zero line to the curve, fading toward zero (Amber above, Sapphire below).
    for (let x = g.pad; x < g.pad + inner; x += g.step) {
      const y = yOf(valueAt(Math.min(x + g.step / 2, g.pad + inner)));
      if (Math.abs(y - g.zero) < 0.5) continue;
      add(y < g.zero ? "DLFGraphFillUp" : "DLFGraphFillDown", { marginLeft: px(x), marginTop: px(Math.min(y, g.zero)),
        width: px(g.step + 0.6), height: px(Math.abs(y - g.zero)) });
    }
    // Line: short rotated segments along the curve.
    let x1 = g.pad;
    let y1 = yOf(valueAt(x1));
    while (x1 < g.pad + inner - 0.01) {
      const x2 = Math.min(x1 + g.line, g.pad + inner);
      const y2 = yOf(valueAt(x2));
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      add("DLFGraphSeg", { marginLeft: px(x1), marginTop: px(y1 - g.seg / 2), height: px(g.seg), width: px(Math.hypot(x2 - x1, y2 - y1) + 0.4),
        transform: `rotateZ(${angle.toFixed(1)}deg)` });
      x1 = x2;
      y1 = y2;
    }
    // Pins: hollow rings while they keep pinGap px apart; the latest is a filled dot with a halo.
    const pinX = (t) => g.pad + ((t - from) / span) * inner;
    const pins = data.pins;
    const roomy = pins.length < 3 || pinX(pins[1].t) - pinX(pins[0].t) >= g.pinGap;
    pins.forEach((p, i) => {
      const x = pinX(p.t);
      const y = yOf(valueAt(x));
      if (i === pins.length - 1) {
        add("DLFGraphHalo", { marginLeft: px(x - g.halo / 2), marginTop: px(y - g.halo / 2), width: px(g.halo), height: px(g.halo) });
        add("DLFGraphPinLast", { marginLeft: px(x - g.last / 2), marginTop: px(y - g.last / 2), width: px(g.last), height: px(g.last) });
      } else if (roomy) {
        add("DLFGraphPin", { marginLeft: px(x - g.pin / 2), marginTop: px(y - g.pin / 2), width: px(g.pin), height: px(g.pin) });
      }
    });
  }

  // ------------------------------------------------------------------ render

  // Bottom of a drawn piece in layout px from the top bar's top; null when it reads Infinity or NaN.
  function bottomOf(panel, top, scale) {
    const pos = panel.GetPositionWithinWindow();
    const bottom = (Number(pos.y) - top.y) / scale + Number(panel.actuallayoutheight) / scale;
    return Number.isFinite(bottom) ? bottom : null;
  }

  // A panel's window box (y, height, ui scale); null when it reads Infinity or NaN.
  function rect(panel) {
    const pos = panel.GetPositionWithinWindow();
    const r = { y: Number(pos.y), h: Number(panel.actuallayoutheight), s: Number(panel.actualuiscale_y) || 1 };
    return Number.isFinite(r.y) && Number.isFinite(r.h) ? r : null;
  }

  // The centre column: the top bar's origin and scale, the clock's centre x and the bottom of its lowest
  // drawn piece (the "timers" the stock rift HUD and objective health go under), in top-bar layout px.
  // null when the clock has no usable geometry.
  function measure() {
    const top = context.GetPositionWithinWindow();
    const scale = Number(context.actualuiscale_y) || 1;
    const origin = { x: Number(top.x) || 0, y: Number(top.y) || 0 };
    if (!valid(UI.clockBox) || UI.clockBox.visible === false) return null;
    const clock = UI.clockBox.GetPositionWithinWindow();
    const centre = (Number(clock.x) - origin.x) / scale + Number(UI.clockBox.actuallayoutwidth) / scale / 2;
    if (!Number.isFinite(centre)) return null;
    // QOLLOCK creates these later; look again while missing.
    if (!valid(UI.rift)) UI.rift = context.FindChildTraverse("RiftTimer");
    if (!valid(UI.urn)) UI.urn = context.FindChildTraverse("UrnTracker");
    if (!valid(UI.urnSpawn)) UI.urnSpawn = context.FindChildTraverse("UrnSpawnTimer");
    const rift = valid(UI.rift) && UI.rift.BHasClass("show") ? UI.rift : null;
    const urn = valid(UI.urn) && UI.urn.BHasClass("show") ? UI.urn : null;
    // The urn spawn timer (ql_feat_urntimer.js) sits under the soul lead strip while it shows.
    const urnSpawn = valid(UI.urnSpawn) && UI.urnSpawn.BHasClass("show") ? UI.urnSpawn : null;
    // QOLLOCK's held-buff time pops out (.pop-out) for the buff's 180 s.
    const buff = valid(UI.rejuvBuff) && UI.rejuvBuff.BHasClass("pop-out") ? UI.rejuvBuff : null;
    // Charges come with .has_rejuv on #RejuvenatorTimer (live 2026-10-22: both for the buff's 180 s); the
    // stock timer's own icon and label are faded (dlf_soul_graph.css) and not measured.
    const rejuvShown = valid(UI.rejuvBox) && UI.rejuvBox.visible === true;
    const held = !rejuvShown ? [] : UI.charges.filter(({ side }) => valid(side) && CHARGE_CLASSES.some((cls) => side.BHasClass(cls))).map(({ icon }) => icon);
    let bottom = 0;
    let under = "";
    for (const panel of [UI.clockBox, UI.disc].concat(UI.plates, [rift, urn, urnSpawn, buff], held)) {
      if (!valid(panel) || panel.visible === false) continue;
      const y = bottomOf(panel, origin, scale);
      if (y !== null && y > bottom) {
        bottom = y;
        under = panel.id || (panel === UI.clockBox ? "GameClock" : panel.paneltype);
      }
    }
    return { origin, scale, centre, bottom, under };
  }

  // Observer HUD's placeKoth: the stock rift HUD (#KothCashInMeter, a top-bar child: margin-top 110 under
  // the banner padding at ui-scale 70%, 120 at 100% in range or captured; citadel_hud_koth.css) moves so
  // its top sits at `top` top-bar px. Whether ui-scale scales its own margin is not known, so the screen px
  // per margin px is measured from the margin in force and corrected on the next tick. Returns its height
  // in top-bar px while it shows, else 0.
  function placeKoth(m, top) {
    const koth = UI.koth;
    if (!valid(koth) || koth.visible !== true) return 0;
    const box = rect(koth);
    const parent = koth.GetParent();
    const parentY = valid(parent) ? Number(parent.GetPositionWithinWindow().y) : NaN;
    if (!box || !Number.isFinite(parentY)) return 0;
    const pad = TOP_PAD * m.scale;
    const margin = Koth.margin !== null ? Koth.margin
      : koth.BHasClass("in_range") || koth.BHasClass("captured") ? KOTH_STOCK_RANGE : KOTH_STOCK_TOP;
    const perPx = (box.y - parentY - pad) / margin > 0 ? (box.y - parentY - pad) / margin : box.s;
    const want = Math.round((m.origin.y + top * m.scale - parentY - pad) / perPx);
    if (Number.isFinite(want) && (Koth.margin === null || Math.abs(want - Koth.margin) >= 1)) {
      Koth.margin = want;
      setStyle(koth, "marginTop", `${want}px`);
    }
    return box.h / m.scale;
  }

  // Observer HUD's placeObjectives (designs 19/20): the stock objective health (#objectives_health_friendly
  // in hud.xml gameplay_hud: walker, patron and mid-boss bars) moves so the top of the highest shown bar
  // sits at `top` top-bar px. Only its margin-top changes. The margin comes from the panel's parent and the
  // panel's top under it without margin, measured before the first write (minus OBJ_CSS_MARGIN, hud.css),
  // so a lagging layout pass cannot make it oscillate; the highest bar's offset under the panel's top is
  // measured while one shows and kept (160 until then), so a new bar appears in place. Returns the shown
  // bars' height in top-bar px, else 0.
  function placeObjectives(m, top) {
    const now = Date.now();
    if (!valid(Obj.panel)) {
      if (now < Obj.findAt) return 0;
      Obj.findAt = now + OBJ_FIND_MS;
      const panel = attrs.root().FindChildTraverse("objectives_health_friendly");
      if (!valid(panel)) return 0;
      Object.assign(Obj, { panel: panel, parent: panel.GetParent(), margin: null, base: null, offset: OBJ_STOCK_OFFSET });
    }
    if (!valid(Obj.parent)) return 0;
    const parent = rect(Obj.parent);
    if (!parent) return 0;
    let first = null;
    let last = null;
    for (const objective of Obj.panel.FindChildrenWithClassTraverse("objective")) {
      if (!objective.BHasClass("is_active") || objective.BHasClass("is_tier1")) continue;
      const r = rect(objective);
      if (!r || r.h <= 0) continue;
      first = first === null ? r.y : Math.min(first, r.y);
      last = last === null ? r.y + r.h : Math.max(last, r.y + r.h);
    }
    if (first !== null || Obj.base === null) {
      const box = rect(Obj.panel);
      if (!box) return 0;
      if (first !== null) Obj.offset = (first - box.y) / box.s;
      if (Obj.base === null && Obj.margin === null) Obj.base = (box.y - parent.y) / box.s - OBJ_CSS_MARGIN;
    }
    if (Obj.base === null) return 0;
    const want = Math.round((m.origin.y + top * m.scale - parent.y) / parent.s - Obj.base - Obj.offset);
    if (Number.isFinite(want) && (Obj.margin === null || Math.abs(want - Obj.margin) >= 1)) {
      Obj.margin = want;
      setStyle(Obj.panel, "marginTop", `${want}px`);
    }
    return first === null ? 0 : (last - first) / m.scale;
  }

  // Writes the graph's placement under `bottom` (top-bar px), logging what it sits under on change.
  function place(m, bottom, under) {
    if (under !== Graph.under) {
      Graph.under = under;
      $.Msg(`${TAG} placed under ${under || "nothing"} (bottom ${Math.round(bottom)} px)`);
    }
    const graph = state.graph;
    setStyle(UI.root, "marginLeft", `${Math.round(m.centre - (G.width * graph.size) / 200 + graph.x)}px`);
    setStyle(UI.root, "marginTop", `${Math.round(bottom - TOP_PAD + GAP + graph.y)}px`);
  }

  function render(now) {
    const graph = state.graph;
    layout(graph.size / 100);
    for (const key of Object.keys(LINE_CLASS)) setClass(UI.root, LINE_CLASS[key], key === graph.line);
    setClass(UI.root, "DLFGraphNoFill", !graph.fill);
    const real = series();
    const drawable = real.pins.length >= 2;
    const previewing = graph.show !== 0 && now < previewUntil;
    const sampleData = previewing && !drawable;
    // As Observer HUD: the timers stay put; the stock rift HUD goes TIMERS_GAP under them, the stock
    // objective health OBJ_GAP under the rift HUD (or TIMERS_GAP under the timers), and the graph under whichever shows
    // last; while the rift HUD and a bar both show the graph waits, and a running show window starts over.
    const m = measure();
    let bottom = 0;
    let under = "";
    let waiting = false;
    if (m) {
      const kothH = placeKoth(m, m.bottom + TIMERS_GAP);
      const objTop = kothH ? m.bottom + TIMERS_GAP + kothH + OBJ_GAP : m.bottom + TIMERS_GAP;
      const objH = placeObjectives(m, objTop);
      bottom = objH ? objTop + objH : kothH ? m.bottom + TIMERS_GAP + kothH : m.bottom;
      under = objH ? "objectives_health_friendly" : kothH ? "KothCashInMeter" : m.under;
      waiting = kothH > 0 && objH > 0;
    }
    if (waiting && graph.show > 0 && now - Graph.shownAt < graph.show * 1000) Graph.shownAt = now;
    // The stock kills row (shown by stock CSS only under .wants_scoreboard) takes the graph's place: under
    // whatever shows last, TIMERS_GAP under the timers or OBJ_GAP under the rift HUD / objective health.
    // QOLLOCK's 250 px put it mid-screen between the cards (user 2026-10-25). Written while hidden too,
    // so it opens in place; with no clock geometry the last placement stays.
    if (m && valid(UI.kills)) setStyle(UI.kills, "marginTop", `${Math.round(bottom + (bottom > m.bottom ? OBJ_GAP : TIMERS_GAP) - TOP_PAD)}px`);
    const atMark = graph.show === -1 || (graph.show > 0 && now - Graph.shownAt < graph.show * 1000);
    // A graph that cannot be placed would sit at the top bar's top, over the clock: it hides.
    const on = !!m && !waiting && (sampleData || (drawable && (previewing || atMark)));
    if (on) place(m, bottom, under);
    setClass(UI.root, "DLFGraphShown", on);
    setClass(UI.root, "DLFGraphPreview", on && sampleData);
    if (!on) return;
    const key = `${sampleData ? "preview" : `r${Graph.seq}`}@${graph.size}`;
    if (Graph.drawn !== key) {
      draw(sampleData ? previewSeries() : real, graph.size / 100);
      Graph.drawn = key;
    }
    const lead = sampleData ? SAMPLE[SAMPLE.length - 1] * 1000 : Graph.lead;
    const even = lead === null || Math.abs(lead) < 50;
    const leader = even ? "" : lead > 0 ? "amber" : "sapphire";
    setText(UI.lead, even ? "EVEN" : `+${(Math.abs(lead) / 1000).toFixed(1)}k`);
    setClass(UI.lead, "DLFAmber", leader === "amber");
    setClass(UI.lead, "DLFSapphire", leader === "sapphire");
    setText(UI.title, sampleData ? "PREVIEW" : "SOUL LEAD");
  }

  function refreshState(now) {
    const parsed = attrs.changed(S.ATTR);
    if (parsed === undefined) return;
    state = S.normalize(parsed, DEFAULTS);
    const sig = JSON.stringify(state.graph);
    if (sig !== graphSig) {
      graphSig = sig;
      previewUntil = now + PREVIEW_MS;
    }
  }

  function tick() {
    if (stopped) return;
    $.Schedule(TICK_SEC, tick);
    try {
      if (!partsValid() && !find()) return;
      const now = Date.now();
      refreshState(now);
      sample();
      render(now);
    } catch (e) {
      if (!errorShown) {
        errorShown = true;
        $.Msg(`${TAG} tick error: ${e && e.message ? e.message : e}`);
      }
    }
  }

  // The pinned marks of the drawn series in seconds (read-only, for checks; the graph shows no times).
  context.DLFSoulGraphPins = () => series().pins.map((pin) => pin.t);

  // The first read only adopts the current state (no preview at boot).
  attrs.changed(S.ATTR);
  state = S.normalize(attrs.read(S.ATTR), DEFAULTS);
  graphSig = JSON.stringify(state.graph);
  tick();
})();
