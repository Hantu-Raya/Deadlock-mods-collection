// THROWAWAY: one enemy player bar, no transport, persistence, timers or deployment.
(function () {
  "use strict";

  var root = $.GetContextPanel();
  if (!valid(root)) return;
  // D1/D2: one tiny schema slice; sides are data, never duplicated flat keys.
  var schema = [
    { key: "enabled", type: "boolean", default: true },
    { key: "mode", side: true, type: "enum", choices: ["fixed", "gradient"], default: "gradient" },
    { key: "fixed", side: true, type: "color", default: "#ff0000" },
    { key: "low", side: true, type: "color", default: "#ff0000" },
    { key: "mid", side: true, type: "color", default: "#ffff00" },
    { key: "high", side: true, type: "color", default: "#00ff00" },
    { key: "width", side: true, type: "number", min: 11, max: 400, default: 79 },
    { key: "height", side: true, type: "number", min: 7, max: 100, default: 18 },
    { key: "x", side: true, type: "number", min: -400, max: 400, default: 0 },
    { key: "y", side: true, type: "number", min: -400, max: 400, default: 0 },
    { key: "hpText", side: true, type: "boolean", default: true }
  ];
  // Explicit fallback stock from unit_status_v2.css:258-290,601-604,1293-1312.
  // This prototype pins the ordinary enemy-player case, not every stock class variant.
  var stock = {
    primary: { width: "79px", height: "18px", position: "0px 0px 0px" },
    inner: { width: "69px", height: "12px" },
    fill: { washColor: "#fd4949" },
    hp: { visibility: "collapse", opacity: "0", position: "0px 0px 0px",
      marginLeft: "40px", marginRight: "10px", marginTop: "1px", transform: "rotateZ(-3deg)",
      horizontalAlign: "right", verticalAlign: "top" }
  };
  var settings = normalise(null, {});
  var revision = 0;
  var cache = null;
  var window = null;
  var carrier = null;
  var carrierSignature = "";
  var generation = 0;
  var cachedFacts = null;
  var memo = null;
  var ledger = [];
  var parentOwner = null;
  var state = "dormant";
  var lastProbe = "";
  var lastFull = -Infinity;
  var lastRevision = -1;
  var plansComputed = 0;
  var fullPaints = 0;
  var token = 0;
  var job = null;
  var stopped = false;

  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  function normalise(base, patch) {
    var result = { side: { enemy: {}, ally: {} } };
    schema.forEach(function (row) {
      (row.side ? ["enemy", "ally"] : [null]).forEach(function (side) {
        var previous = side ? base && base.side[side] : base;
        var input = side ? patch.side && patch.side[side] : patch;
        var value = input && Object.prototype.hasOwnProperty.call(input, row.key)
          ? input[row.key] : previous ? previous[row.key] : row.default;
        if (row.type === "boolean" && typeof value !== "boolean") value = row.default;
        if (row.type === "enum" && row.choices.indexOf(value) < 0) value = row.default;
        if (row.type === "color") value = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
          ? value.toLowerCase() : row.default;
        if (row.type === "number") value = typeof value === "number" && Number.isFinite(value)
          ? Math.round(Math.max(row.min, Math.min(row.max, value)) * 100) / 100 : row.default;
        (side ? result.side[side] : result)[row.key] = value;
      });
    });
    Object.freeze(result.side.enemy); Object.freeze(result.side.ally); Object.freeze(result.side);
    return Object.freeze(result);
  }
  function css(panel, key, axis) {
    var scale = Number(panel[axis === "y" ? "actualuiscale_y" : "actualuiscale_x"]);
    var value = Number(panel[key]);
    return Number.isFinite(value) && Number.isFinite(scale) && scale > 0 ? value / scale : 0;
  }
  function locateCarrier() {
    window = null; carrier = null;
    for (var panel = root; valid(panel); panel = panel.GetParent()) {
      if (panel.BHasClass("WindowRoot")) {
        window = panel; carrier = panel.GetParent(); break;
      }
    }
  }
  function carrierFacts() {
    var flags = ["player", "enemy", "friend", "LocalPlayer", "boss_tier1", "boss_tier2",
      "boss_tier3", "building", "team_neutral"].map(function (name) { return carrier.BHasClass(name); });
    return { signature: flags.join("|"), eligible: flags[0] && flags[1] && !flags.slice(2).some(Boolean) };
  }
  function lineageValid() {
    return cache && [cache.info, cache.stack, cache.primary, cache.inner, cache.fill, cache.hp].every(valid)
      && cache.info.GetParent() === root && cache.stack.GetParent() === cache.info
      && cache.primary.GetParent() === cache.stack && cache.inner.GetParent() === cache.primary
      && cache.fill.GetParent() === cache.inner
      && cache.hp.GetParent() === (parentOwner ? parentOwner.value : cache.hpStockParent);
  }
  function discover() {
    // Direct primary lineage only: never traverse into a duplicate UnitShieldbar.
    var info = root.FindChild("InfoHealthContainer");
    var stack = valid(info) && info.FindChild("UnitHealthbarsContainer");
    var primary = valid(stack) && stack.FindChild("UnitHealthbar");
    var inner = valid(primary) && primary.BHasClass("UnitHealthbarContainer") && primary.FindChild("UnitHealthbarInner");
    var fill = valid(inner) && inner.FindChild("unit_healthbar_lagging");
    var hp = valid(info) && info.FindChild("UnitHealthbarValue");
    if (![info, stack, primary, inner, fill, hp].every(valid)) return false;
    cache = { info: info, stack: stack, primary: primary, inner: inner, fill: fill, hp: hp, hpStockParent: hp.GetParent() };
    generation++;
    return true;
  }
  function probe() {
    var fill = cache.fill;
    var signal = { clip: String(fill.style.clip || ""), width: String(fill.style.width || ""),
      transform: String(fill.style.transform || ""), preScale: String(fill.style.preTransformScale2d || ""),
      fillWidth: css(fill, "actuallayoutwidth", "x"), innerWidth: css(cache.inner, "actuallayoutwidth", "x"),
      x: css(fill, "actualxoffset", "x") };
    signal.signature = JSON.stringify(signal);
    return signal;
  }
  function fraction(signal) {
    var widthFraction = signal.innerWidth > 0 ? signal.fillWidth / signal.innerWidth : 0;
    var value = widthFraction;
    var clip = /^rect\s*\(([^)]*)\)$/i.exec(signal.clip);
    if (clip) {
      var edges = clip[1].trim().split(/\s*,\s*|\s+/);
      var percent = edges.length === 4 && edges.every(function (edge) { return /^[+-]?[\d.]+%$/.test(edge) && Number.isFinite(parseFloat(edge)); });
      if (percent) value = (parseFloat(edges[1]) - parseFloat(edges[3])) / 100;
    }
    // Percent clip is authoritative during one-tick geometry settling. Do not derive
    // desired geometry from our own measured widths/offsets (no feedback loop).
    if (signal.x < 0 && signal.innerWidth > 0) value = Math.min(value, (signal.fillWidth + signal.x) / signal.innerWidth);
    var inline = /^([\d.]+)(%|px)$/.exec(signal.width);
    if (inline) value = Math.min(value, Number(inline[1]) / (inline[2] === "%" ? 100 : signal.innerWidth || Infinity));
    var scale = /\bscale(?:X)?\(\s*([+-]?[\d.]+)/i.exec(signal.transform);
    if (scale) value = Math.min(value, Number(scale[1]));
    if (signal.preScale.trim()) value = Math.min(value, Number(signal.preScale.split(/[,\s]+/)[0]));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  function facts(panel, signal) {
    // Impure cache boundary. Returned facts contain no panels and are immutable.
    var width = css(panel, "actuallayoutwidth", "x");
    var height = css(panel, "actuallayoutheight", "y");
    var signature = generation + "|" + carrierSignature + "|" + signal.signature + "|" + width + "|" + height;
    if (cachedFacts && cachedFacts.signature === signature) return cachedFacts;
    cachedFacts = Object.freeze({ signature: signature, eligible: true, fraction: fraction(signal),
      canvasWidth: width, canvasHeight: height, laid: width > 0 && height > 0, side: "enemy" });
    return cachedFacts;
  }
  function mix(left, right, amount) {
    var result = "#";
    for (var index = 1; index < 7; index += 2) {
      var a = parseInt(left.slice(index, index + 2), 16);
      var b = parseInt(right.slice(index, index + 2), 16);
      result += ("0" + Math.round(a + (b - a) * amount).toString(16)).slice(-2);
    }
    return result;
  }
  function plan(input, config) {
    // Pure; independent of the VM, panels, memo cache and scheduler.
    if (!config.enabled || !input.eligible || !input.laid) return { styles: {}, adopt: false };
    var side = config.side[input.side];
    var color = side.mode === "fixed" ? side.fixed : input.fraction <= 0.5
      ? mix(side.low, side.mid, input.fraction * 2) : mix(side.mid, side.high, (input.fraction - 0.5) * 2);
    var styles = {
      primary: { width: side.width + "px", height: side.height + "px", position: side.x + "px " + side.y + "px 0px" },
      inner: { width: (side.width - 10) + "px", height: (side.height - 6) + "px" },
      fill: { washColor: color }
    };
    if (side.hpText) styles.hp = { visibility: "visible", opacity: "1", position: "0px 0px 0px",
      marginLeft: "0px", marginRight: "0px", marginTop: "0px", transform: "none",
      horizontalAlign: "center", verticalAlign: "middle" };
    return { styles: styles, adopt: side.hpText };
  }
  function memoisedPlan(input) {
    var key = input.signature + "|" + revision;
    if (!memo || memo.key !== key) {
      memo = { key: key, value: plan(input, settings) };
      plansComputed++;
    }
    return memo.value;
  }
  function restoreStyle(owner) {
    if (valid(owner.panel)) owner.panel.style[owner.key] = owner.stock;
  }
  function apply(next) {
    var wanted = [];
    Object.keys(next.styles).forEach(function (part) {
      var panel = cache[part];
      if (!valid(panel)) return;
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
        owner = { panel: entry.panel, key: entry.key, stock: captured === undefined || captured === null || captured === ""
          ? stock[entry.part][entry.key] : captured, value: undefined };
        ledger.push(owner);
      }
      if (owner.value !== entry.value) {
        entry.panel.style[entry.key] = entry.value;
        owner.value = entry.value; // Record success only after the native write.
      }
    });
    if (next.adopt && valid(cache.hp) && valid(cache.primary)) {
      if (!parentOwner) parentOwner = { panel: cache.hp, stock: cache.hp.GetParent(), value: null };
      if (parentOwner.value !== cache.primary) {
        cache.hp.SetParent(cache.primary);
        parentOwner.value = cache.primary;
      }
    } else if (parentOwner) {
      if (valid(parentOwner.panel) && valid(parentOwner.stock)) parentOwner.panel.SetParent(parentOwner.stock);
      parentOwner = null;
    }
  }
  function release() { apply({ styles: {}, adopt: false }); }
  function resetCache() {
    release(); cache = null; cachedFacts = null; memo = null; lastProbe = ""; lastRevision = -1;
  }
  function tick() {
    if (stopped || !valid(root)) return;
    try {
      if (!valid(window) || !valid(carrier) || root.GetParent() !== window || window.GetParent() !== carrier) {
        resetCache(); locateCarrier(); carrierSignature = "";
      }
      if (!valid(carrier)) { state = "dormant"; return; }
      var kind = carrierFacts();
      if (kind.signature !== carrierSignature) { resetCache(); carrierSignature = kind.signature; }
      if (!settings.enabled || !kind.eligible) { resetCache(); state = "dormant"; return; }
      if (!lineageValid()) { resetCache(); if (!discover()) { state = "dormant"; return; } }
      var signal = probe();
      var changed = signal.signature !== lastProbe;
      var full = state !== "idle" || changed || revision !== lastRevision || Date.now() - lastFull >= 1500;
      if (full) {
        var input = facts(cache.info, signal);
        apply(memoisedPlan(input));
        fullPaints++; lastFull = Date.now(); lastRevision = revision;
        state = input.laid ? changed ? "active" : "idle" : "dormant";
      }
      lastProbe = signal.signature;
    } catch (error) {
      // Engine races must not strand the loop. Failed writes remain in the ledger.
      state = "dormant";
      $.Msg("[HPV3 prototype] " + String(error));
    } finally {
      if (!stopped && valid(root)) {
        var current = token;
        job = $.Schedule(state === "dormant" ? 1 : 0.15, function rendererTick() {
          if (current === token && !stopped) tick();
        });
      }
    }
  }
  root.HPColorsRendererPrototype = {
    plan: plan,
    configure: function (patch) {
      if (stopped) return;
      settings = normalise(settings, patch || {}); revision++; token++;
      if (job) $.CancelScheduled(job);
      tick();
    },
    inspect: function () {
      return { state: state, configRevision: revision, facts: cachedFacts, settings: settings,
        plansComputed: plansComputed, fullPaints: fullPaints, ownedStyles: ledger.length };
    },
    stop: function () {
      stopped = true; token++;
      if (job) $.CancelScheduled(job);
      release();
    }
  };
  tick();
})();
