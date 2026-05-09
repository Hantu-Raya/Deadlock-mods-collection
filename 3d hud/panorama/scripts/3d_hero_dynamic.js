"use strict";

(function () {
  var FAST_POLL_SEC = 0.25;
  var SLOW_POLL_SEC = 0.75;
  var HEALTH_TICK_SEC = 0.04;
  var HEALTH_RESCAN_MS = 1500;
  var HEALTH_EFFECT_EPSILON = 0.005;
  var HEALTH_VERBOSE = true;
  var HEALTH_TREE_DUMP = true;
  var HEALTH_DEBUG_INTERVAL_MS = 500;
  var HEALTH_SEGMENT_STALE_MS = 1250;
  var HEALTH_DAMAGE_HOLD_MS = 900;
  var HEALTH_TREE_DUMP_INTERVAL_MS = 5000;
  var HEALTH_TREE_DUMP_DEPTH = 9;
  var HEALTH_TREE_DUMP_NODE_LIMIT = 260;
  var HEALTH_TEXT_WIDTH = 200;
  var HEALTH_TEXT_HEIGHT = 64;
  var HEALTH_CURRENT_LABEL_WIDTH = 136;
  var HEALTH_MAX_LABEL_LEFT = 138;
  var HEALTH_DIGIT_WIDTH = 18;
  var HEALTH_SUFFIX_CHAR_WIDTH = 7;
  var HEALTH_SCAN_NODE_LIMIT = 96;
  var MAX_PROGRESS_HOPS = 8;
  var MAX_HINT_DEPTH = 5;
  var MAX_HINT_NODES = 96;

  var HERO_DATA = [
    { hero: "hero_inferno", id: 1, map: "maps/ui/hero_prefabs/inferno.vmap", aliases: [] },
    { hero: "hero_gigawatt", id: 2, map: "maps/ui/hero_prefabs/gigawatt.vmap", aliases: [] },
    { hero: "hero_hornet", id: 3, map: "maps/ui/hero_prefabs/hornet.vmap", aliases: [] },
    { hero: "hero_ghost", id: 4, map: "maps/ui/hero_prefabs/geist.vmap", aliases: ["geist"] },
    { hero: "hero_atlas", id: 6, map: "maps/ui/hero_prefabs/abrams.vmap", aliases: ["bull"] },
    { hero: "hero_wraith", id: 7, map: "maps/ui/hero_prefabs/wraith.vmap", aliases: [] },
    { hero: "hero_forge", id: 8, map: "maps/ui/hero_prefabs/forge.vmap", aliases: ["engineer"] },
    { hero: "hero_chrono", id: 10, map: "maps/ui/hero_prefabs/chrono.vmap", aliases: [] },
    { hero: "hero_dynamo", id: 11, map: "maps/ui/hero_prefabs/prof_dynamo.vmap", aliases: ["sumo"] },
    { hero: "hero_kelvin", id: 12, map: "maps/ui/hero_prefabs/kelvin.vmap", aliases: [] },
    { hero: "hero_haze", id: 13, map: "maps/ui/hero_prefabs/haze.vmap", aliases: [] },
    { hero: "hero_astro", id: 14, map: "maps/ui/hero_prefabs/astro.vmap", aliases: [] },
    { hero: "hero_bebop", id: 15, map: "maps/ui/hero_prefabs/bebop.vmap", aliases: [] },
    { hero: "hero_nano", id: 16, map: "maps/ui/hero_prefabs/nano.vmap", aliases: [] },
    { hero: "hero_orion", id: 17, map: "maps/ui/hero_prefabs/archer.vmap", aliases: ["archer"] },
    { hero: "hero_krill", id: 18, map: "maps/ui/hero_prefabs/digger.vmap", aliases: ["digger"] },
    { hero: "hero_shiv", id: 19, map: "maps/ui/hero_prefabs/shiv.vmap", aliases: [] },
    { hero: "hero_tengu", id: 20, map: "maps/ui/hero_prefabs/tengu.vmap", aliases: [] },
    { hero: "hero_warden", id: 25, map: "maps/ui/hero_prefabs/warden.vmap", aliases: [] },
    { hero: "hero_yamato", id: 27, map: "maps/ui/hero_prefabs/yamato.vmap", aliases: [] },
    { hero: "hero_lash", id: 31, map: "maps/ui/hero_prefabs/lash.vmap", aliases: [] },
    { hero: "hero_viscous", id: 35, map: "maps/ui/hero_prefabs/viscous.vmap", aliases: [] },
    { hero: "hero_synth", id: 50, map: "maps/ui/hero_prefabs/pocket.vmap", aliases: ["pocket"] },
    { hero: "hero_mirage", id: 52, map: "maps/ui/hero_prefabs/mirage.vmap", aliases: [] },
    { hero: "hero_viper", id: 58, map: "maps/ui/hero_prefabs/viper.vmap", aliases: [] },
    { hero: "hero_magician", id: 60, map: "maps/ui/hero_prefabs/magician.vmap", aliases: [] },
    { hero: "hero_vampirebat", id: 63, map: "maps/ui/hero_prefabs/vampirebat.vmap", aliases: [] },
    { hero: "hero_drifter", id: 64, map: "maps/ui/hero_prefabs/drifter.vmap", aliases: [] },
    { hero: "hero_priest", id: 65, map: "maps/ui/hero_prefabs/priest.vmap", aliases: [] },
    { hero: "hero_frank", id: 66, map: "maps/ui/hero_prefabs/frank.vmap", aliases: [] },
    { hero: "hero_bookworm", id: 67, map: "maps/ui/hero_prefabs/bookworm.vmap", aliases: [] },
    { hero: "hero_doorman", id: 69, map: "maps/ui/hero_prefabs/doorman.vmap", aliases: [] },
    { hero: "hero_punkgoat", id: 72, map: "maps/ui/hero_prefabs/punkgoat.vmap", aliases: [] },
    { hero: "hero_necro", id: 76, map: "maps/ui/hero_prefabs/necro.vmap", aliases: [] },
    { hero: "hero_fencer", id: 77, map: "maps/ui/hero_prefabs/apollo.vmap", aliases: ["apollo"] },
    { hero: "hero_familiar", id: 79, map: "maps/ui/hero_prefabs/familiar.vmap", aliases: [] },
    { hero: "hero_werewolf", id: 80, map: "maps/ui/hero_prefabs/werewolf.vmap", aliases: [] },
    { hero: "hero_unicorn", id: 81, map: "maps/ui/hero_prefabs/unicorn.vmap", aliases: [] }
  ];

  var HERO_BY_NAME = {};
  var HERO_ALIAS_LIST = [];
  var HERO_ALIAS_LOOKUP = {};
  var SCENE_BY_HERO = {};
  var SCAN_STACK = [];
  var SCAN_DEPTH = [];
  var lastHero = "";
  var lastHeroId = -1;
  var missCount = 0;
  var sceneCache = null;
  var currentScenePanel = null;

  var UI = {
    root: null,
    host: null,
    gameplayAlive: null,
    crosshair: null,
    progress: null,
    buttonHints: null,
    healthRoot: null,
    healthBar: null,
    healthBarFill: null,
    pendingDamage: null,
    pendingHeal: null,
    pendingDamageMiddle: null,
    pendingHealMiddle: null,
    currentHealth: null,
    maxHealth: null,
    hpCustomText: null,
    hpCustomFill: null,
    hpCurrentBase: null,
    hpCurrentFill: null,
    hpMaxBase: null,
    hpMaxFill: null,
    hpCustomDamage: null,
    hpCustomDeferred: null,
    hpCustomHeal: null,
    hpCurrentDamage: null,
    hpMaxDamage: null,
    hpCurrentDeferred: null,
    hpMaxDeferred: null,
    hpCurrentHeal: null,
    hpMaxHeal: null,
    hpProgressSource: null,
    lastHealthScanMs: 0,
    lastHpCurrent: -1,
    lastHpMax: -1,
    lastHpDamaged: null,
    lastHpClip: -1,
    lastDeferredClip: -1,
    lastDeferredLeftClip: -1,
    lastDamageClip: -1,
    lastDamageLeftClip: -1,
    lastHealClip: -1,
    lastHealLeftClip: -1,
    lastHealthDebugKey: "",
    lastHealthDebugMs: 0,
    lastDamageSegmentKey: "",
    lastDamageSegmentMs: 0,
    lastHealSegmentKey: "",
    lastHealSegmentMs: 0,
    lastHealthTreeDumpMs: 0,
    lastHealthCurrentForEffect: -1,
    damageHoldLeft: 0,
    damageHoldRight: 0,
    damageHoldMs: 0
  };

  function log(msg) {
    try { $.Msg("[3D-HUD] " + msg); } catch (e) {}
  }

  function isValidPanel(panel) {
    try { return !!(panel && panel.IsValid && panel.IsValid()); } catch (e) { return false; }
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase();
  }

  function registerAlias(alias, heroName) {
    var cleanAlias = normalizeText(alias);
    if (!cleanAlias || !HERO_BY_NAME[heroName] || HERO_ALIAS_LOOKUP[cleanAlias]) return;

    HERO_ALIAS_LOOKUP[cleanAlias] = heroName;
    HERO_ALIAS_LIST.push({
      alias: cleanAlias,
      hero: heroName,
      token: cleanAlias.replace(/^hero_/, "")
    });
  }

  function buildTables() {
    for (var i = 0; i < HERO_DATA.length; i++) {
      var record = HERO_DATA[i];
      HERO_BY_NAME[record.hero] = record;
      SCENE_BY_HERO[record.hero] = "ThreeDHeroScene_" + record.hero;

      registerAlias(record.hero, record.hero);
      registerAlias(record.hero.replace(/^hero_/, ""), record.hero);

      for (var j = 0; j < record.aliases.length; j++) {
        registerAlias(record.aliases[j], record.hero);
      }
    }

    HERO_ALIAS_LIST.sort(function (a, b) {
      return b.token.length - a.token.length;
    });
  }

  function rootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || $.GetContextPanel();
  }

  function getRootPanel() {
    if (isValidPanel(UI.root)) return UI.root;
    UI.root = rootPanel();
    resetCacheRefs();
    return UI.root;
  }

  function resetCacheRefs() {
    UI.gameplayAlive = null;
    UI.crosshair = null;
    UI.progress = null;
    UI.buttonHints = null;
    UI.host = null;
    UI.healthRoot = null;
    UI.healthBar = null;
    UI.healthBarFill = null;
    UI.pendingDamage = null;
    UI.pendingHeal = null;
    UI.pendingDamageMiddle = null;
    UI.pendingHealMiddle = null;
    UI.currentHealth = null;
    UI.maxHealth = null;
    UI.hpCustomText = null;
    UI.hpCustomFill = null;
    UI.hpCurrentBase = null;
    UI.hpCurrentFill = null;
    UI.hpMaxBase = null;
    UI.hpMaxFill = null;
    UI.hpCustomDamage = null;
    UI.hpCustomDeferred = null;
    UI.hpCustomHeal = null;
    UI.hpCurrentDamage = null;
    UI.hpMaxDamage = null;
    UI.hpCurrentDeferred = null;
    UI.hpMaxDeferred = null;
    UI.hpCurrentHeal = null;
    UI.hpMaxHeal = null;
    UI.hpProgressSource = null;
    UI.lastHealthScanMs = 0;
    UI.lastHpCurrent = -1;
    UI.lastHpMax = -1;
    UI.lastHpDamaged = null;
    UI.lastHpClip = -1;
    UI.lastDeferredClip = -1;
    UI.lastDeferredLeftClip = -1;
    UI.lastDamageClip = -1;
    UI.lastDamageLeftClip = -1;
    UI.lastHealClip = -1;
    UI.lastHealLeftClip = -1;
    UI.lastHealthDebugKey = "";
    UI.lastHealthDebugMs = 0;
    UI.lastDamageSegmentKey = "";
    UI.lastDamageSegmentMs = 0;
    UI.lastHealSegmentKey = "";
    UI.lastHealSegmentMs = 0;
    UI.lastHealthTreeDumpMs = 0;
    UI.lastHealthCurrentForEffect = -1;
    UI.damageHoldLeft = 0;
    UI.damageHoldRight = 0;
    UI.damageHoldMs = 0;
    sceneCache = null;
    currentScenePanel = null;
  }

  function findChild(panel, id) {
    try { return panel && panel.FindChildTraverse ? panel.FindChildTraverse(id) : null; } catch (e) { return null; }
  }

  function getChildren(panel) {
    try { return panel && panel.Children ? panel.Children() : []; } catch (e) { return []; }
  }

  function getParent(panel) {
    try { return panel && panel.GetParent ? panel.GetParent() : null; } catch (e) { return null; }
  }

  function panelId(panel) {
    try { return panel && panel.id ? String(panel.id) : ""; } catch (e) { return ""; }
  }

  function panelType(panel) {
    try { return panel && panel.paneltype ? String(panel.paneltype) : "Panel"; } catch (e) { return "Panel"; }
  }

  function hasClass(panel, className) {
    try { return !!(panel && panel.BHasClass && panel.BHasClass(className)); } catch (e) { return false; }
  }

  function setPanelClass(panel, className, enabled) {
    if (!isValidPanel(panel)) return;

    try {
      if (panel.SetHasClass) {
        panel.SetHasClass(className, enabled);
        return;
      }
    } catch (e1) {}

    try {
      if (enabled) {
        panel.AddClass(className);
      } else {
        panel.RemoveClass(className);
      }
    } catch (e2) {}
  }

  function parsePanelNumber(panel) {
    var text = "";
    try { text = String(panel && panel.text ? panel.text : ""); } catch (e1) { text = ""; }

    var match = text.match(/\d+/g);
    if (!match || !match.length) return -1;

    var value = Number(match.join(""));
    return isFinite(value) ? value : -1;
  }

  function nowMs() {
    try { return Date.now(); } catch (e1) {}
    try { return new Date().getTime(); } catch (e2) {}
    return 0;
  }

  function setLabelText(panel, text) {
    if (!isValidPanel(panel)) return;
    try {
      if (panel.text !== text) panel.text = text;
    } catch (e1) {}
  }

  function hideOriginalHealthText() {
    try {
      UI.currentHealth.style.opacity = "0";
      UI.currentHealth.style.visibility = "visible";
    } catch (e1) {}

    try {
      UI.maxHealth.style.opacity = "0";
      UI.maxHealth.style.visibility = "visible";
    } catch (e2) {}
  }

  function hideRequiredHealthSource() {
    try {
      UI.hpProgressSource.style.opacity = "0.001";
      UI.hpProgressSource.style.visibility = "visible";
    } catch (e1) {}
  }

  function panelNumberProp(panel, names) {
    if (!isValidPanel(panel)) return -1;

    for (var i = 0; i < names.length; i++) {
      try {
        var value = Number(panel[names[i]]);
        if (isFinite(value) && value >= 0) return value;
      } catch (e1) {}
    }

    return -1;
  }

  function panelMetric(panel, names) {
    if (!isValidPanel(panel)) return 0;

    for (var i = 0; i < names.length; i++) {
      try {
        var value = Number(panel[names[i]]);
        if (isFinite(value) && value > 0) return value;
      } catch (e1) {}
    }

    return 0;
  }

  function panelOffset(panel, names) {
    if (!isValidPanel(panel)) return -1;

    for (var i = 0; i < names.length; i++) {
      try {
        var value = Number(panel[names[i]]);
        if (isFinite(value) && value >= 0) return value;
      } catch (e1) {}
    }

    return -1;
  }

  function escapeXmlValue(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      if (ch === "\"") return "&quot;";
      return "&apos;";
    });
  }

  function panelStringProp(panel, names) {
    if (!isValidPanel(panel)) return "";

    for (var i = 0; i < names.length; i++) {
      try {
        var value = panel[names[i]];
        if (value !== null && value !== undefined && String(value) !== "") return String(value);
      } catch (e1) {}
    }

    return "";
  }

  function panelStyleString(panel, names) {
    if (!isValidPanel(panel)) return "";

    for (var i = 0; i < names.length; i++) {
      try {
        var value = panel.style ? panel.style[names[i]] : "";
        if (value !== null && value !== undefined && String(value) !== "") return String(value);
      } catch (e1) {}
    }

    return "";
  }

  function panelClasses(panel) {
    if (!isValidPanel(panel)) return "";

    try {
      if (panel.GetClasses) {
        var classes = panel.GetClasses();
        if (classes && classes.join) return classes.join(" ");
        if (classes) return String(classes);
      }
    } catch (e1) {}

    try {
      if (panel.classes) return String(panel.classes);
    } catch (e2) {}

    try {
      if (panel.className) return String(panel.className);
    } catch (e3) {}

    return "";
  }

  function appendXmlAttr(parts, name, value) {
    if (value === null || value === undefined || value === "" || value === -1) return;
    parts.push(name + "=\"" + escapeXmlValue(value) + "\"");
  }

  function panelXmlOpen(panel) {
    var parts = [panelType(panel)];
    appendXmlAttr(parts, "id", panelId(panel));
    appendXmlAttr(parts, "class", panelClasses(panel));
    appendXmlAttr(parts, "text", panelStringProp(panel, ["text"]));
    appendXmlAttr(parts, "value", panelNumberProp(panel, ["value", "current", "currentvalue", "actualvalue"]));
    appendXmlAttr(parts, "max", panelNumberProp(panel, ["max", "maximum", "maxvalue"]));
    appendXmlAttr(parts, "x", panelOffset(panel, ["actualxoffset", "actualx", "xoffset", "layoutx"]));
    appendXmlAttr(parts, "y", panelOffset(panel, ["actualyoffset", "actualy", "yoffset", "layouty"]));
    appendXmlAttr(parts, "w", panelMetric(panel, ["actuallayoutwidth", "actualwidth", "contentwidth", "desiredlayoutwidth"]));
    appendXmlAttr(parts, "h", panelMetric(panel, ["actuallayoutheight", "actualheight", "contentheight", "desiredlayoutheight"]));
    appendXmlAttr(parts, "opacity", panelStyleString(panel, ["opacity"]));
    appendXmlAttr(parts, "visibility", panelStyleString(panel, ["visibility"]));
    appendXmlAttr(parts, "clip", panelStyleString(panel, ["clip"]));
    return "<" + parts.join(" ");
  }

  function dumpPanelTree(panel, depth, nodeState) {
    if (!isValidPanel(panel) || depth > HEALTH_TREE_DUMP_DEPTH || nodeState.count >= HEALTH_TREE_DUMP_NODE_LIMIT) return;

    nodeState.count++;
    var children = getChildren(panel);
    var indent = new Array(depth + 1).join("  ");
    if (!children.length || depth >= HEALTH_TREE_DUMP_DEPTH) {
      log("health tree " + indent + panelXmlOpen(panel) + " />");
      return;
    }

    log("health tree " + indent + panelXmlOpen(panel) + ">");
    for (var i = 0; i < children.length && nodeState.count < HEALTH_TREE_DUMP_NODE_LIMIT; i++) {
      dumpPanelTree(children[i], depth + 1, nodeState);
    }
    log("health tree " + indent + "</" + panelType(panel) + ">");
  }

  function maybeDumpHealthTree() {
    if (!HEALTH_TREE_DUMP || !isValidPanel(UI.healthRoot)) return;

    var now = nowMs();
    if (UI.lastHealthTreeDumpMs > 0 && (now - UI.lastHealthTreeDumpMs) < HEALTH_TREE_DUMP_INTERVAL_MS) return;

    UI.lastHealthTreeDumpMs = now;
    log("health tree begin intervalMs=" + HEALTH_TREE_DUMP_INTERVAL_MS + " depth=" + HEALTH_TREE_DUMP_DEPTH + " nodeLimit=" + HEALTH_TREE_DUMP_NODE_LIMIT);
    dumpPanelTree(UI.healthRoot, 0, { count: 0 });
    log("health tree end");
  }

  function findPanelByClass(scope, className) {
    if (!isValidPanel(scope)) return null;

    SCAN_STACK.length = 0;
    SCAN_DEPTH.length = 0;
    SCAN_STACK.push(scope);
    SCAN_DEPTH.push(0);
    var seen = 0;

    while (SCAN_STACK.length && seen < HEALTH_SCAN_NODE_LIMIT) {
      var panel = SCAN_STACK.pop();
      var depth = SCAN_DEPTH.pop();
      if (!isValidPanel(panel) || depth > MAX_HINT_DEPTH) continue;
      seen++;

      if (hasClass(panel, className)) return panel;

      var children = getChildren(panel);
      for (var i = children.length - 1; i >= 0; i--) {
        SCAN_STACK.push(children[i]);
        SCAN_DEPTH.push(depth + 1);
      }
    }

    return null;
  }

  function progressValueState(bar) {
    var value = panelNumberProp(bar, ["value", "current", "currentvalue", "actualvalue"]);
    var maxValue = panelNumberProp(bar, ["max", "maximum", "maxvalue"]);
    return {
      value: value,
      max: maxValue,
      readable: value >= 0 && maxValue > 0,
      ratio: value > 0 && maxValue > 0 ? clampRatio(value / maxValue) : 0
    };
  }

  function progressSegmentRatio(bar, fill) {
    if (!isValidPanel(bar) || !isValidPanel(fill)) return { valid: false, left: 0, right: 0 };

    var totalH = panelMetric(bar, ["actuallayoutheight", "actualheight", "contentheight", "desiredlayoutheight"]);
    var fillH = panelMetric(fill, ["actuallayoutheight", "actualheight", "contentheight", "desiredlayoutheight"]);
    var barY = panelOffset(bar, ["actualyoffset", "actualy", "yoffset", "layouty"]);
    var fillY = panelOffset(fill, ["actualyoffset", "actualy", "yoffset", "layouty"]);
    var y = fillY;
    if (barY >= 0 && fillY >= 0 && fillY > totalH) y = fillY - barY;
    if (totalH > 0 && fillH > 0 && y >= 0) {
      var topY = Math.max(0, Math.min(totalH, y));
      var bottomY = Math.max(0, Math.min(totalH, y + fillH));
      var top = clampRatio(1 - (bottomY / totalH));
      var bottom = clampRatio(1 - (topY / totalH));
      return { valid: true, left: Math.min(top, bottom), right: Math.max(top, bottom) };
    }

    var totalW = panelMetric(bar, ["actuallayoutwidth", "actualwidth", "contentwidth", "desiredlayoutwidth"]);
    var fillW = panelMetric(fill, ["actuallayoutwidth", "actualwidth", "contentwidth", "desiredlayoutwidth"]);
    var barX = panelOffset(bar, ["actualxoffset", "actualx", "xoffset", "layoutx"]);
    var fillX = panelOffset(fill, ["actualxoffset", "actualx", "xoffset", "layoutx"]);
    var x = fillX;
    if (barX >= 0 && fillX >= 0 && fillX > totalW) x = fillX - barX;
    if (totalW > 0 && fillW > 0 && x >= 0) {
      return {
        valid: true,
        left: clampRatio(x / totalW),
        right: clampRatio((x + fillW) / totalW)
      };
    }

    return { valid: false, left: 0, right: 0 };
  }

  function readPendingState(bar, middle) {
    return {
      value: progressValueState(bar),
      segment: progressSegmentRatio(bar, middle)
    };
  }

  function textVisualWidth(text, digitWidth, otherWidth) {
    var value = String(text || "");
    var width = 0;
    for (var i = 0; i < value.length; i++) {
      width += /\d/.test(value.charAt(i)) ? digitWidth : otherWidth;
    }

    return width;
  }

  function healthTextClipBounds(currentText, maxText, damaged) {
    var currentWidth = Math.min(HEALTH_CURRENT_LABEL_WIDTH, textVisualWidth(currentText, HEALTH_DIGIT_WIDTH, HEALTH_DIGIT_WIDTH * 0.5));
    var maxWidth = damaged ? textVisualWidth(maxText, HEALTH_SUFFIX_CHAR_WIDTH, HEALTH_SUFFIX_CHAR_WIDTH * 0.65) : 0;
    var left = Math.max(0, HEALTH_CURRENT_LABEL_WIDTH - currentWidth);
    var right = damaged ? Math.min(HEALTH_TEXT_WIDTH, HEALTH_MAX_LABEL_LEFT + maxWidth) : HEALTH_CURRENT_LABEL_WIDTH;

    if (right <= left) right = Math.min(HEALTH_TEXT_WIDTH, left + currentWidth);
    return { left: left, right: right };
  }

  function setClipRect(panel, left, right, leftCacheName, rightCacheName) {
    if (!isValidPanel(panel)) return;

    var width = HEALTH_TEXT_WIDTH;
    var clipLeft = Math.round(Math.max(0, Math.min(width, left)));
    var clipRight = Math.round(Math.max(0, Math.min(width, right)));
    if (clipRight < clipLeft) clipRight = clipLeft;
    if ((!leftCacheName || clipLeft === UI[leftCacheName]) && clipRight === UI[rightCacheName]) return;

    try {
      panel.style.clip = "rect(0px, " + clipRight + "px, " + HEALTH_TEXT_HEIGHT + "px, " + clipLeft + "px)";
    } catch (e1) {}

    if (leftCacheName) UI[leftCacheName] = clipLeft;
    UI[rightCacheName] = clipRight;
  }

  function clampRatio(value) {
    return Math.max(0, Math.min(1, value));
  }

  function resolveHealthPanels(force) {
    var now = nowMs();
    if (!force && isValidPanel(UI.currentHealth) &&
        isValidPanel(UI.maxHealth) && isValidPanel(UI.hpCustomText) &&
        isValidPanel(UI.healthBarFill) && isValidPanel(UI.pendingDamageMiddle) &&
        isValidPanel(UI.pendingHealMiddle) &&
        (now - UI.lastHealthScanMs) < HEALTH_RESCAN_MS) {
      maybeDumpHealthTree();
      return;
    }

    var root = getRootPanel();
    UI.healthRoot = findChild(root, "hud_health_bars");
    var scope = isValidPanel(UI.healthRoot) ? UI.healthRoot : root;

    UI.healthBar = findChild(scope, "health_bar");
    UI.pendingDamage = findChild(scope, "pending_incoming_damage");
    UI.pendingHeal = findChild(scope, "pending_incoming_heal");
    UI.healthBarFill = findPanelByClass(UI.healthBar, "ProgressBarLeft");
    UI.pendingDamageMiddle = findPanelByClass(UI.pendingDamage, "ProgressBarMiddle");
    UI.pendingHealMiddle = findPanelByClass(UI.pendingHeal, "ProgressBarMiddle");
    UI.hpCustomText = findChild(scope, "hp_custom_text");
    UI.hpCustomFill = findChild(scope, "hp_custom_fill");
    UI.hpCurrentBase = findChild(scope, "hp_custom_current_base");
    UI.hpCurrentFill = findChild(scope, "hp_custom_current_fill");
    UI.hpMaxBase = findChild(scope, "hp_custom_max_base");
    UI.hpMaxFill = findChild(scope, "hp_custom_max_fill");
    UI.hpCustomDamage = findChild(scope, "hp_custom_damage");
    UI.hpCustomDeferred = findChild(scope, "hp_custom_deferred");
    UI.hpCustomHeal = findChild(scope, "hp_custom_heal");
    UI.hpCurrentDamage = findChild(scope, "hp_custom_current_damage");
    UI.hpMaxDamage = findChild(scope, "hp_custom_max_damage");
    UI.hpCurrentDeferred = findChild(scope, "hp_custom_current_deferred");
    UI.hpMaxDeferred = findChild(scope, "hp_custom_max_deferred");
    UI.hpCurrentHeal = findChild(scope, "hp_custom_current_heal");
    UI.hpMaxHeal = findChild(scope, "hp_custom_max_heal");
    UI.hpProgressSource = findChild(scope, "hp_progress_source");
    UI.currentHealth = findChild(scope, "current_health");
    UI.maxHealth = findChild(scope, "max_health");
    if (!isValidPanel(UI.currentHealth)) UI.currentHealth = UI.hpCurrentBase;
    if (!isValidPanel(UI.maxHealth)) UI.maxHealth = UI.hpMaxBase;
    if (!isValidPanel(UI.healthRoot) && isValidPanel(UI.hpCustomText)) {
      try { UI.healthRoot = UI.hpCustomText.GetParent(); } catch (e1) {}
    }
    UI.lastHealthScanMs = now;
    maybeDumpHealthTree();
  }

  function readHealthState() {
    resolveHealthPanels(false);
    if (!isValidPanel(UI.currentHealth) || !isValidPanel(UI.maxHealth) || !isValidPanel(UI.hpCustomText) ||
        !isValidPanel(UI.hpCustomFill)) {
      return null;
    }

    hideOriginalHealthText();
    hideRequiredHealthSource();

    var current = parsePanelNumber(UI.currentHealth);
    var max = parsePanelNumber(UI.maxHealth);
    if (current < 0 || max <= 0) return null;

    return {
      current: current,
      max: max,
      currentRatio: clampRatio(current / max),
      currentText: String(current),
      maxText: "/" + String(max),
      damaged: current < max
    };
  }

  function writeHealthLabels(state) {
    if (state.current !== UI.lastHpCurrent) {
      setLabelText(UI.hpCurrentBase, state.currentText);
      setLabelText(UI.hpCurrentFill, state.currentText);
      setLabelText(UI.hpCurrentDeferred, state.currentText);
      setLabelText(UI.hpCurrentDamage, state.currentText);
      setLabelText(UI.hpCurrentHeal, state.currentText);
      UI.lastHpCurrent = state.current;
    }

    if (state.max !== UI.lastHpMax) {
      setLabelText(UI.hpMaxBase, state.maxText);
      setLabelText(UI.hpMaxFill, state.maxText);
      setLabelText(UI.hpMaxDeferred, state.maxText);
      setLabelText(UI.hpMaxDamage, state.maxText);
      setLabelText(UI.hpMaxHeal, state.maxText);
      UI.lastHpMax = state.max;
    }

    if (state.damaged !== UI.lastHpDamaged) {
      setPanelClass(UI.healthRoot, "hp-damaged", state.damaged);
      setPanelClass(UI.hpCustomText, "hp-damaged", state.damaged);
      UI.lastHpDamaged = state.damaged;
    }
  }

  function resolveCurrentClip(state) {
    return { left: 0, right: state.currentRatio };
  }

  function inactiveClip() {
    return { left: 0, right: 0, source: "" };
  }

  function segmentKey(segment) {
    if (!segment || !segment.valid) return "";
    return String(Math.round(segment.left * 1000)) + ":" + String(Math.round(segment.right * 1000));
  }

  function isSegmentActive(segment) {
    if (!segment || !segment.valid || (segment.right - segment.left) <= HEALTH_EFFECT_EPSILON) return false;
    return !(segment.left <= HEALTH_EFFECT_EPSILON && segment.right >= 1 - HEALTH_EFFECT_EPSILON);
  }

  function isClipActive(clip) {
    return !!clip && (clip.right - clip.left) > HEALTH_EFFECT_EPSILON;
  }

  function heldDamageClip(state, now, hpDelta) {
    if (hpDelta < 0) {
      var previousRatio = clampRatio((state.current - hpDelta) / state.max);
      var holding = UI.damageHoldMs > 0 && (now - UI.damageHoldMs) <= HEALTH_DAMAGE_HOLD_MS;
      UI.damageHoldRight = holding ? Math.max(UI.damageHoldRight, previousRatio) : previousRatio;
      UI.damageHoldMs = now;
    }

    UI.damageHoldLeft = state.currentRatio;
    if (UI.damageHoldMs > 0 && (now - UI.damageHoldMs) <= HEALTH_DAMAGE_HOLD_MS &&
        (UI.damageHoldRight - UI.damageHoldLeft) > HEALTH_EFFECT_EPSILON) {
      return { left: UI.damageHoldLeft, right: UI.damageHoldRight, source: "hpdelta" };
    }

    return inactiveClip();
  }

  function effectSegmentClip(kind, state, pending, now, hpDelta) {
    var segment = pending.segment;
    if (!isSegmentActive(segment)) return inactiveClip();

    var key = segmentKey(segment);
    var keyName = kind === "damage" ? "lastDamageSegmentKey" : "lastHealSegmentKey";
    var msName = kind === "damage" ? "lastDamageSegmentMs" : "lastHealSegmentMs";
    var hpMovedTowardEffect = (kind === "damage" && hpDelta < 0) || (kind === "heal" && hpDelta > 0);
    if (key !== UI[keyName] || hpMovedTowardEffect || UI[msName] <= 0) {
      UI[keyName] = key;
      UI[msName] = now;
    }

    if ((now - UI[msName]) > HEALTH_SEGMENT_STALE_MS) return inactiveClip();

    if (kind === "damage") {
      var damageRight = Math.min(state.currentRatio, clampRatio(segment.right));
      var damageLeft = Math.min(damageRight, clampRatio(segment.left));
      if ((damageRight - damageLeft) <= HEALTH_EFFECT_EPSILON) return inactiveClip();
      return { left: damageLeft, right: damageRight, source: "segment" };
    }

    var healLeft = Math.max(state.currentRatio, clampRatio(segment.left));
    var healRight = Math.max(healLeft, clampRatio(segment.right));
    if ((healRight - healLeft) <= HEALTH_EFFECT_EPSILON) return inactiveClip();
    return { left: healLeft, right: healRight, source: "segment" };
  }

  function resolveDeferredDamageClip(state, pending, now) {
    if (pending.value.ratio > HEALTH_EFFECT_EPSILON) {
      UI.lastDamageSegmentMs = now;
      return { left: clampRatio(state.currentRatio - pending.value.ratio), right: state.currentRatio, source: "value" };
    }

    var segment = pending.segment;
    if (isSegmentActive(segment)) {
      var segmentRight = Math.min(state.currentRatio, clampRatio(segment.right));
      var segmentLeft = Math.min(segmentRight, clampRatio(segment.left));
      if ((segmentRight - segmentLeft) > HEALTH_EFFECT_EPSILON) {
        UI.lastDamageSegmentKey = segmentKey(segment);
        UI.lastDamageSegmentMs = now;
        return { left: segmentLeft, right: segmentRight, source: "segment" };
      }
    }

    return inactiveClip();
  }

  function resolveDamageClip(state, now, hpDelta) {
    return heldDamageClip(state, now, hpDelta);
  }

  function resolveHealClip(state, pending, now, hpDelta) {
    if (pending.value.ratio > HEALTH_EFFECT_EPSILON) {
      UI.lastHealSegmentMs = now;
      return { left: state.currentRatio, right: clampRatio(state.currentRatio + pending.value.ratio), source: "value" };
    }

    return effectSegmentClip("heal", state, pending, now, hpDelta);
  }

  function writeHealthClips(state, currentClip, deferredClip, damageClip, healClip) {
    var clipBounds = healthTextClipBounds(state.currentText, state.maxText, state.damaged);
    var clipWidth = clipBounds.right - clipBounds.left;
    setClipRect(UI.hpCustomFill, clipBounds.left + (clipWidth * currentClip.left), clipBounds.left + (clipWidth * currentClip.right), null, "lastHpClip");
    setClipRect(UI.hpCustomDeferred, clipBounds.left + (clipWidth * deferredClip.left), clipBounds.left + (clipWidth * deferredClip.right), "lastDeferredLeftClip", "lastDeferredClip");
    setClipRect(UI.hpCustomDamage, clipBounds.left + (clipWidth * damageClip.left), clipBounds.left + (clipWidth * damageClip.right), "lastDamageLeftClip", "lastDamageClip");
    setClipRect(UI.hpCustomHeal, clipBounds.left + (clipWidth * healClip.left), clipBounds.left + (clipWidth * healClip.right), "lastHealLeftClip", "lastHealClip");
  }

  function fixedRatio(value) {
    return String(Math.round(clampRatio(value) * 1000) / 1000);
  }

  function valueDebug(value) {
    return "v=" + String(value.value) + " m=" + String(value.max) + " r=" + fixedRatio(value.ratio);
  }

  function segmentDebug(segment) {
    if (!segment || !segment.valid) return "none";
    return fixedRatio(segment.left) + ".." + fixedRatio(segment.right);
  }

  function clipDebug(clip) {
    if (!clip || (clip.right - clip.left) <= HEALTH_EFFECT_EPSILON) return "off";
    return clip.source + ":" + fixedRatio(clip.left) + ".." + fixedRatio(clip.right);
  }

  function logHealthProbe(state, damagePending, healPending, deferredClip, damageClip, healClip, hpDelta, now) {
    if (!HEALTH_VERBOSE) return;

    var key = "hp=" + state.current + "/" + state.max +
      " dV=" + valueDebug(damagePending.value) +
      " dS=" + segmentDebug(damagePending.segment) +
      " hV=" + valueDebug(healPending.value) +
      " hS=" + segmentDebug(healPending.segment) +
      " defC=" + clipDebug(deferredClip) +
      " dC=" + clipDebug(damageClip) +
      " hC=" + clipDebug(healClip) +
      " delta=" + hpDelta;
    if (key === UI.lastHealthDebugKey && (now - UI.lastHealthDebugMs) < HEALTH_DEBUG_INTERVAL_MS) return;

    UI.lastHealthDebugKey = key;
    UI.lastHealthDebugMs = now;
    log("health probe " + key);
  }

  function syncHealthTextState() {
    var state = readHealthState();
    if (!state) return;

    writeHealthLabels(state);

    var now = nowMs();
    var hpDelta = UI.lastHealthCurrentForEffect >= 0 ? state.current - UI.lastHealthCurrentForEffect : 0;
    UI.lastHealthCurrentForEffect = state.current;

    var damagePending = readPendingState(UI.pendingDamage, UI.pendingDamageMiddle);
    var healPending = readPendingState(UI.pendingHeal, UI.pendingHealMiddle);
    var deferredClip = resolveDeferredDamageClip(state, damagePending, now);
    var damageClip = resolveDamageClip(state, now, hpDelta);
    var healClip = resolveHealClip(state, healPending, now, hpDelta);
    logHealthProbe(state, damagePending, healPending, deferredClip, damageClip, healClip, hpDelta, now);
    writeHealthClips(state, resolveCurrentClip(state), deferredClip, damageClip, healClip);
  }

  function heroClassOn(panel) {
    if (!isValidPanel(panel)) return "";
    for (var i = 0; i < HERO_ALIAS_LIST.length; i++) {
      if (hasClass(panel, HERO_ALIAS_LIST[i].alias)) return HERO_ALIAS_LIST[i].hero;
    }
    return "";
  }

  function resolveProgressPanel() {
    var root = getRootPanel();

    if (!isValidPanel(UI.gameplayAlive)) {
      UI.gameplayAlive = findChild(root, "gameplay_hud_alive");
    }
    if (isValidPanel(UI.gameplayAlive) && !isValidPanel(UI.crosshair)) {
      UI.crosshair = findChild(UI.gameplayAlive, "crosshair");
    }
    if (!isValidPanel(UI.crosshair)) {
      UI.crosshair = findChild(root, "crosshair");
    }
    if (isValidPanel(UI.crosshair) && !isValidPanel(UI.progress)) {
      UI.progress = findChild(UI.crosshair, "progress");
    }
    if (!isValidPanel(UI.progress)) {
      UI.progress = findChild(root, "progress");
    }
    return UI.progress;
  }

  function resolveButtonHintsPanel() {
    var root = getRootPanel();
    resolveProgressPanel();

    if (isValidPanel(UI.crosshair) && !isValidPanel(UI.buttonHints)) {
      UI.buttonHints = findChild(UI.crosshair, "button_hints_container");
    }
    if (!isValidPanel(UI.buttonHints)) {
      UI.buttonHints = findChild(root, "button_hints_container");
    }
    return UI.buttonHints;
  }

  function heroFromProgress() {
    var panel = resolveProgressPanel();
    var hops = 0;

    while (isValidPanel(panel) && hops < MAX_PROGRESS_HOPS) {
      var hero = heroClassOn(panel);
      if (hero) return hero;
      panel = getParent(panel);
      hops++;
    }

    return "";
  }

  function heroFromAbilityId(panelId) {
    var text = normalizeText(panelId);
    if (!text) return "";

    for (var i = 0; i < HERO_ALIAS_LIST.length; i++) {
      var token = HERO_ALIAS_LIST[i].token;
      if (text.indexOf("ability_" + token + "_") >= 0 ||
          text.indexOf("ability_hero_" + token + "_") >= 0 ||
          text.indexOf("citadel_ability_" + token + "_") >= 0 ||
          text.indexOf("citadel_ability_hero_" + token + "_") >= 0 ||
          text.indexOf(token + "_") === 0 ||
          text.indexOf("_" + token + "_") >= 0) {
        return HERO_ALIAS_LIST[i].hero;
      }
    }

    return "";
  }

  function scanButtonHints(panel) {
    if (!isValidPanel(panel)) return "";

    SCAN_STACK.length = 0;
    SCAN_DEPTH.length = 0;
    SCAN_STACK.push(panel);
    SCAN_DEPTH.push(0);
    var seen = 0;

    while (SCAN_STACK.length) {
      var current = SCAN_STACK.pop();
      var depth = SCAN_DEPTH.pop();
      if (!isValidPanel(current) || depth > MAX_HINT_DEPTH || seen >= MAX_HINT_NODES) continue;
      seen++;

      var hero = heroFromAbilityId(panelId(current));
      if (hero) return hero;

      var children = getChildren(current);
      for (var i = children.length - 1; i >= 0; i--) {
        SCAN_STACK.push(children[i]);
        SCAN_DEPTH.push(depth + 1);
      }
    }

    return "";
  }

  function detectHero() {
    return heroFromProgress() || scanButtonHints(resolveButtonHintsPanel());
  }

  function hideScene(scene) {
    if (!isValidPanel(scene)) return;
    try { scene.RemoveClass("ShowingHero"); } catch (e1) {}
    try { scene.AddClass("HiddenHero"); } catch (e2) {}
    try { scene.visible = false; } catch (e3) {}
    try {
      scene.style.visibility = "collapse";
      scene.style.opacity = "0";
      scene.style.zIndex = "-1";
    } catch (e4) {}
  }

  function showScene(scene) {
    if (!isValidPanel(scene)) return;
    try { scene.RemoveClass("HiddenHero"); } catch (e1) {}
    try { scene.AddClass("ShowingHero"); } catch (e2) {}
    try { scene.hittest = false; } catch (e3) {}
    try { scene.visible = true; } catch (e4) {}
    try {
      scene.style.visibility = "visible";
      scene.style.opacity = "1";
      scene.style.zIndex = "5";
    } catch (e5) {}
  }

  function resolveHostPanel() {
    if (isValidPanel(UI.host)) return UI.host;
    UI.host = findChild(getRootPanel(), "ThreeDHeroDynamicHeroHost");
    sceneCache = null;
    currentScenePanel = null;
    return UI.host;
  }

  function cacheStaticScenes() {
    if (sceneCache) return sceneCache;

    sceneCache = {};
    var host = resolveHostPanel();
    var children = getChildren(host);
    var count = 0;

    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var id = "";
      try { id = String(child.id || ""); } catch (e1) { id = ""; }
      if (id.indexOf("ThreeDHeroScene_") !== 0) continue;

      sceneCache[id] = child;
      count++;

      if (hasClass(child, "ShowingHero")) {
        currentScenePanel = child;
      } else {
        hideScene(child);
      }
    }

    log("static scenes cached=" + count);
    return sceneCache;
  }

  function setHeroAttrs(panel, record) {
    if (!isValidPanel(panel) || !record) return;

    var idText = String(record.id);
    try { panel.SetAttributeString("hero", record.hero); } catch (e1) {}
    try { panel.SetAttributeString("unit", record.hero); } catch (e2) {}
    try { panel.SetAttributeString("hero_id", idText); } catch (e3) {}
    try { panel.SetAttributeString("heroid", idText); } catch (e4) {}
  }

  function switchHeroScene(heroName) {
    var record = HERO_BY_NAME[heroName];
    if (!record) return false;
    if (heroName === lastHero && record.id === lastHeroId && isValidPanel(currentScenePanel)) return true;

    var scene = cacheStaticScenes()[SCENE_BY_HERO[heroName]] || null;
    if (!isValidPanel(scene)) {
      log("no static scene for " + heroName + " map=" + record.map);
      return false;
    }

    var probe = findChild(getRootPanel(), "ThreeDHeroHudProbe");
    setHeroAttrs(probe, record);
    setHeroAttrs(scene, record);

    if (scene !== currentScenePanel) {
      hideScene(currentScenePanel);
      showScene(scene);
      currentScenePanel = scene;
      log("selected static scene " + SCENE_BY_HERO[heroName] + " map=" + record.map);
    }

    lastHero = heroName;
    lastHeroId = record.id;
    missCount = 0;
    log("bound " + heroName + " -> " + record.id + " map=" + record.map);
    return true;
  }

  function tick() {
    try {
      var hero = detectHero();
      if (hero) {
        switchHeroScene(hero);
      } else {
        missCount++;
      }
    } catch (e) {
      log("tick error: " + e);
    }

    $.Schedule(lastHero ? SLOW_POLL_SEC : FAST_POLL_SEC, tick);
  }

  function healthTick() {
    try {
      syncHealthTextState();
    } catch (e) {
      log("health tick error: " + e);
    }

    $.Schedule(HEALTH_TICK_SEC, healthTick);
  }

  buildTables();
  $.Schedule(HEALTH_TICK_SEC, healthTick);
  $.Schedule(FAST_POLL_SEC, tick);
})();
