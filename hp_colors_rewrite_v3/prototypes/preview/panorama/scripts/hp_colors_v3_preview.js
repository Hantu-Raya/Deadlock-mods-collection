// PROTOTYPE (ticket 10): menu preview bar. The renderer prototype's pure plan() paints a fake
// unit-status tree inside the preview pane. Only the bounded play sequence and bounded layout-settle
// retries are ever scheduled, both behind one generation token (FAILURE-MODES.md).
(function () {
  "use strict";

  var ctx = $.GetContextPanel();
  if (!valid(ctx)) return;

  // Fake lineage, part -> id. Mirrors UnitStatus > InfoHealthContainer > UnitHealthbarsContainer >
  // UnitHealthbar > UnitHealthbarInner > unit_healthbar_lagging, plus InfoHealthContainer > UnitHealthbarValue.
  var PART_IDS = {
    unitStatus: "HPColorsPreviewUnitStatus", info: "HPColorsPreviewInfo", stack: "HPColorsPreviewBars",
    primary: "HPColorsPreviewBar", inner: "HPColorsPreviewBarInner", fill: "HPColorsPreviewBarFill",
    hp: "HPColorsPreviewHpText", name: "HPColorsPreviewName"
  };
  var UI_IDS = {
    title: "HPColorsPreviewTitle", sideEnemy: "HPColorsPreviewSideOptionEnemy", sideAlly: "HPColorsPreviewSideOptionAlly",
    kindNpc: "HPColorsPreviewKindOptionNpc", kindObjective: "HPColorsPreviewKindOptionObjective",
    value: "HPColorsPreviewHealthValue", slider: "HPColorsPreviewHealthSlider", play: "HPColorsPreviewPlay",
    playLabel: "HPColorsPreviewPlayLabel", status: "HPColorsPreviewStatus"
  };
  // Same flags and rule as renderer.js carrierFacts(); kept as data, never as classes on menu panels.
  var CARRIER_FLAGS = ["player", "enemy", "friend", "LocalPlayer", "boss_tier1", "boss_tier2",
    "boss_tier3", "building", "team_neutral"];
  var KINDS = {
    hero: { title: "HERO", carrier: ["player"], css: "HPC3PreviewKindHero", maxHp: 1000,
      names: { enemy: "THE WARDEN", ally: "LADY GEIST" }, stockReason: "Ally heroes keep the stock look in this build" },
    npc: { title: "NPC", carrier: ["creature"], css: "HPC3PreviewKindNpc", maxHp: 600,
      names: { enemy: "SENTRY", ally: "SENTRY" }, stockReason: "NPC rules are not built yet: stock look" },
    objective: { title: "OBJECTIVE", carrier: ["boss_tier1"], css: "HPC3PreviewKindObjective", maxHp: 4000,
      names: { enemy: "WALKER", ally: "WALKER" }, stockReason: "Objective rules are not built yet: stock look" }
  };
  var PAGE_KIND = { Bar: "hero", HPText: "hero", Name: "hero", Indicators: "hero", Units: "unit", Presets: "hero" };
  // Engine role: inline stock look the renderer's ledger captures on first write. Values equal the
  // renderer prototype's pinned fallbacks (renderer.js:23-30), checked by preview.test.js.
  var STOCK = {
    primary: { width: "79px", height: "18px", position: "0px 0px 0px" },
    inner: { width: "69px", height: "12px" },
    hp: { visibility: "collapse", opacity: "0", position: "0px 0px 0px", marginLeft: "40px",
      marginRight: "10px", marginTop: "1px", transform: "rotateZ(-3deg)", horizontalAlign: "right", verticalAlign: "top" }
  };
  var STOCK_WASH = { enemy: "#fd4949", ally: "#ffefd7" };
  var SEQUENCE = [90, 72, 45, 20, 8, 28, 52, 78, 100];
  var STEP_SECONDS = 0.45;
  var SETTLE_SECONDS = 0.1;
  var SETTLE_LIMIT = 10;
  var HEX = /^#[0-9a-f]{6}$/i;

  var pane = null;
  var parts = null;
  var ui = {};
  var hpStockParent = null;
  var renderer = null;
  var settings = null;
  var available = false;
  var isOpen = false;
  var page = "Bar";
  var unitKind = "npc";
  var kind = "hero";
  var side = "enemy";
  var hp = 75;
  var shown = 75;
  var playing = false;
  var playIndex = 0;
  var feedback = "";
  var generation = 0;
  var job = null;
  var settleTries = 0;
  var lookKey = "";
  var ledger = [];
  var parentOwner = null;
  var statusText = "";
  var lastPlan = null;

  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  function inside(panel, ancestor) {
    for (var node = panel, depth = 0; valid(node) && depth < 32; node = node.GetParent(), depth++) {
      if (node === ancestor) return true;
    }
    return false;
  }
  function css(panel, key, axis) {
    var scale = Number(panel[axis === "y" ? "actualuiscale_y" : "actualuiscale_x"]);
    var value = Number(panel[key]);
    return Number.isFinite(value) && Number.isFinite(scale) && scale > 0 ? value / scale : 0;
  }
  function setText(panel, text) {
    if (valid(panel) && panel.text !== text) panel.text = text;
  }
  function setClass(panel, name, on) {
    if (valid(panel) && panel.BHasClass(name) !== on) panel.SetHasClass(name, on);
  }

  // ---- Discovery: every part must resolve under the pane, or the preview stays off.
  function resolve() {
    pane = ctx.FindChildTraverse("HPColorsPreview");
    if (!valid(pane)) return false;
    var found = {};
    for (var part in PART_IDS) {
      var panel = pane.FindChildTraverse(PART_IDS[part]);
      if (!valid(panel) || !inside(panel, pane)) return false;
      found[part] = panel;
    }
    for (var key in UI_IDS) {
      ui[key] = pane.FindChildTraverse(UI_IDS[key]);
      if (!valid(ui[key])) return false;
    }
    parts = found;
    hpStockParent = parts.hp.GetParent();
    return hpStockParent === parts.info;
  }
  function lineageValid() {
    return !!parts && [parts.unitStatus, parts.info, parts.stack, parts.primary, parts.inner, parts.fill, parts.hp].every(valid)
      && inside(parts.unitStatus, pane) && parts.info.GetParent() === parts.unitStatus
      && parts.stack.GetParent() === parts.info && parts.primary.GetParent() === parts.stack
      && parts.inner.GetParent() === parts.primary && parts.fill.GetParent() === parts.inner
      && parts.hp.GetParent() === (parentOwner ? parts.primary : hpStockParent);
  }

  // ---- Settings: the menu's normaliser owns ranges; this only refuses values plan() cannot write safely.
  function accept(value, fallback) {
    if (typeof value !== typeof fallback) return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string" && HEX.test(fallback)) return HEX.test(value) ? value.toLowerCase() : fallback;
    return value;
  }
  function sanitise(record) {
    if (!record || typeof record !== "object" || !record.side) return settings;
    var next = { side: {} };
    for (var key in settings) if (key !== "side") next[key] = accept(record[key], settings[key]);
    ["enemy", "ally"].forEach(function (name) {
      var current = settings.side[name];
      var incoming = record.side[name] || {};
      var out = {};
      for (var field in current) out[field] = accept(incoming[field], current[field]);
      next.side[name] = Object.freeze(out);
    });
    Object.freeze(next.side);
    return Object.freeze(next);
  }

  // ---- Facts: same shape as renderer facts(); health comes from the preview, not a probe.
  function carrierEligible() {
    var classes = KINDS[kind].carrier.concat(side === "enemy" ? ["enemy"] : ["friend"]);
    var flags = CARRIER_FLAGS.map(function (name) { return classes.indexOf(name) >= 0; });
    return flags[0] && flags[1] && !flags.slice(2).some(Boolean);
  }
  function facts(percent) {
    var width = css(parts.info, "actuallayoutwidth", "x");
    var height = css(parts.info, "actuallayoutheight", "y");
    var eligible = carrierEligible();
    var fraction = Math.max(0, Math.min(1, percent / 100));
    return Object.freeze({ signature: ["preview", kind, side, eligible, fraction, width, height].join("|"),
      eligible: eligible, fraction: fraction, canvasWidth: width, canvasHeight: height,
      laid: width > 0 && height > 0, side: side });
  }

  // ---- Apply: renderer.js apply() contract over the preview part map only.
  function restoreStyle(owner) {
    if (valid(owner.panel)) owner.panel.style[owner.key] = owner.stock;
  }
  function apply(next) {
    var wanted = [];
    Object.keys(next.styles).forEach(function (part) {
      var panel = parts[part];
      if (!valid(panel) || !inside(panel, pane)) return;
      Object.keys(next.styles[part]).forEach(function (key) {
        wanted.push({ part: part, panel: panel, key: key, value: next.styles[part][key] });
      });
    });
    ledger = ledger.filter(function (owner) {
      if (wanted.some(function (entry) { return entry.panel === owner.panel && entry.key === owner.key; })) return true;
      restoreStyle(owner);
      return false;
    });
    wanted.forEach(function (entry) {
      var owner = ledger.filter(function (item) { return item.panel === entry.panel && item.key === entry.key; })[0];
      if (!owner) {
        var captured = entry.panel.style[entry.key];
        var fallback = entry.part === "fill" ? STOCK_WASH[side] : (STOCK[entry.part] || {})[entry.key];
        owner = { panel: entry.panel, key: entry.key, value: undefined,
          stock: captured === undefined || captured === null || captured === "" ? fallback : captured };
        ledger.push(owner);
      }
      if (owner.value !== entry.value) {
        entry.panel.style[entry.key] = entry.value;
        owner.value = entry.value;
      }
    });
    if (next.adopt && valid(parts.hp) && valid(parts.primary)) {
      if (!parentOwner) parentOwner = { panel: parts.hp, stock: parts.hp.GetParent(), value: null };
      if (parentOwner.value !== parts.primary) {
        parts.hp.SetParent(parts.primary);
        parentOwner.value = parts.primary;
      }
    } else if (parentOwner) {
      if (valid(parentOwner.panel) && valid(parentOwner.stock) && inside(parentOwner.stock, pane)) {
        parentOwner.panel.SetParent(parentOwner.stock);
      }
      parentOwner = null;
    }
  }
  function release() {
    if (parts) apply({ styles: {}, adopt: false });
  }

  // ---- Engine role: the stock look for the current kind/side, written before the renderer captures it.
  function writeStockLook() {
    var key = kind + "|" + side;
    if (key === lookKey) return;
    release();
    ["primary", "inner", "hp"].forEach(function (part) {
      Object.keys(STOCK[part]).forEach(function (prop) { parts[part].style[prop] = STOCK[part][prop]; });
    });
    parts.fill.style.washColor = STOCK_WASH[side];
    Object.keys(KINDS).forEach(function (name) { setClass(pane, KINDS[name].css, name === kind); });
    setClass(pane, "HPC3PreviewSideEnemy", side === "enemy");
    setClass(pane, "HPC3PreviewSideAlly", side === "ally");
    setText(parts.name, KINDS[kind].names[side]);
    setText(ui.title, KINDS[kind].title + " · " + (side === "enemy" ? "ENEMY" : "ALLY"));
    lookKey = key;
  }
  function writeHealth(percent) {
    parts.fill.style.width = percent + "%";
    setText(parts.hp, String(Math.round(KINDS[kind].maxHp * percent / 100)));
    setText(ui.value, percent + "%");
  }

  function paint(percent) {
    if (!available || !isOpen) return;
    try {
      if (!lineageValid()) {
        release(); parentOwner = null; ledger = []; lookKey = "";
        if (!resolve() || !lineageValid()) { disable("Preview unavailable: sample bar is missing"); return; }
      }
      writeStockLook();
      writeHealth(percent);
      var input = facts(percent);
      lastPlan = renderer.plan(input, settings);
      apply(lastPlan);
      if (input.laid) settleTries = 0;
      else if (!playing) scheduleSettle();
      updateStatus(input);
    } catch (error) {
      $.Msg("[HPV3 preview] " + String(error));
    }
  }
  function updateStatus(input) {
    var painted = Object.keys(lastPlan.styles).length > 0;
    var detail = !settings.enabled ? "Customization is off: stock look"
      : !input.laid ? "Waiting for layout"
      : !input.eligible ? KINDS[kind].stockReason
      : painted ? "Custom settings" : "Stock look";
    statusText = (feedback ? feedback + " · " : "Ready · ") + detail;
    setText(ui.status, statusText);
    setClass(ui.play, "Playing", playing);
    setText(ui.playLabel, playing ? "STOP" : "PLAY DAMAGE / HEAL");
  }

  // ---- Scheduling: one job slot, one generation token.
  function cancel() {
    generation++;
    if (job) {
      try { $.CancelScheduled(job); } catch (error) {}
      job = null;
    }
    playing = false;
    feedback = "";
    shown = hp;
  }
  function schedule(delay, fn) {
    var token = generation;
    job = $.Schedule(delay, function previewStep() {
      if (token !== generation) return; // a stale callback must not clear the current job slot
      job = null;
      if (!isOpen || !valid(pane)) return;
      fn();
    });
  }
  function scheduleSettle() {
    if (job || settleTries >= SETTLE_LIMIT) return;
    settleTries++;
    schedule(SETTLE_SECONDS, function () { paint(shown); });
  }
  function step() {
    var value = SEQUENCE[playIndex++];
    feedback = value < shown ? "Damage" : "Healing";
    shown = value;
    if (playIndex < SEQUENCE.length) schedule(STEP_SECONDS, step);
    else schedule(STEP_SECONDS, finish);
    paint(value);
  }
  function finish() {
    playing = false;
    feedback = "";
    shown = hp;
    paint(hp);
  }
  function togglePlay() {
    if (!available || !isOpen) return;
    var wasPlaying = playing;
    cancel();
    if (wasPlaying) { paint(hp); return; }
    playing = true;
    playIndex = 0;
    step();
  }
  function onSlider() {
    var raw = Number(ui.slider.value);
    if (!Number.isFinite(raw)) return;
    var value = Math.round(Math.max(0, Math.min(100, raw)));
    // Echoes of our own writes (sync or a frame late) carry the current value; real input differs.
    if (value === hp) return;
    cancel();
    hp = value;
    shown = value;
    paint(hp);
  }

  // ---- Public API for the menu host.
  function open() {
    if (!available) return;
    isOpen = true;
    paint(playing ? shown : hp);
  }
  function close() {
    cancel();
    settleTries = 0;
    if (available) release();
    lookKey = "";
    isOpen = false;
  }
  function setPage(name) {
    cancel();
    page = Object.prototype.hasOwnProperty.call(PAGE_KIND, name) ? name : "Bar";
    kind = PAGE_KIND[page] === "unit" ? unitKind : "hero";
    setClass(pane, "HPC3PreviewUnitsPage", page === "Units");
    paint(hp);
  }
  function setUnitKind(name) {
    if (name !== "npc" && name !== "objective") return;
    cancel();
    unitKind = name;
    setClass(ui.kindNpc, "Selected", name === "npc");
    setClass(ui.kindObjective, "Selected", name === "objective");
    if (page === "Units") kind = unitKind;
    paint(hp);
  }
  function setSide(name) {
    if (name !== "enemy" && name !== "ally") return;
    cancel();
    side = name;
    setClass(ui.sideEnemy, "Selected", name === "enemy");
    setClass(ui.sideAlly, "Selected", name === "ally");
    paint(hp);
  }
  function setSettings(record) {
    if (!available) return;
    var next = sanitise(record);
    if (next === settings) return;
    settings = next;
    paint(playing ? shown : hp);
  }
  function disable(reason) {
    cancel();
    available = false;
    setClass(pane, "HPC3PreviewUnavailable", true);
    if (valid(ui.status)) setText(ui.status, reason);
    statusText = reason;
  }

  // ---- Boot. The renderer prototype self-boots on whatever context includes it; stop its world loop
  // at once and keep only its pure plan() and normalised defaults.
  renderer = ctx.HPColorsRendererPrototype;
  if (renderer && typeof renderer.plan === "function" && typeof renderer.stop === "function") {
    try { settings = renderer.inspect().settings; } catch (error) { settings = null; }
    try { renderer.stop(); } catch (error) {}
  }
  var resolved = resolve();
  if (!resolved) disable("Preview unavailable: sample bar is missing");
  else if (!settings || typeof renderer.plan !== "function") disable("Preview unavailable: renderer not loaded");
  else {
    available = true;
    ui.slider.min = 0;
    ui.slider.max = 100;
    ui.slider.increment = 1;
    ui.slider.value = hp;
    ui.slider.SetPanelEvent("onvaluechanged", onSlider);
    ui.play.SetPanelEvent("onactivate", togglePlay);
    ui.sideEnemy.SetPanelEvent("onactivate", function () { setSide("enemy"); });
    ui.sideAlly.SetPanelEvent("onactivate", function () { setSide("ally"); });
    ui.kindNpc.SetPanelEvent("onactivate", function () { setUnitKind("npc"); });
    ui.kindObjective.SetPanelEvent("onactivate", function () { setUnitKind("objective"); });
  }

  ctx.HPColorsPreviewV3 = {
    open: open,
    close: close,
    setPage: setPage,
    setSide: setSide,
    setUnitKind: setUnitKind,
    setSettings: setSettings,
    inspect: function () {
      return { available: available, open: isOpen, playing: playing, page: page, kind: kind, side: side,
        hp: hp, shown: shown, generation: generation, scheduled: !!job, ownedStyles: ledger.length,
        adopted: !!parentOwner, status: statusText, settings: settings };
    }
  };
})();
