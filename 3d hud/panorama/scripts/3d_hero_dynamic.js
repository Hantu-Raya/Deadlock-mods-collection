"use strict";

(function () {
  var DEBUG_PROBES = false;
  var FAST_POLL_SEC = 0.25;
  var SLOW_POLL_SEC = 0.75;
  var MAX_PROGRESS_HOPS = 8;
  var MAX_HINT_DEPTH = 5;
  var MAX_HINT_NODES = 96;
  var MISS_LOG_INTERVAL = 40;

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
    probe: null
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
    UI.probe = null;
    UI.host = null;
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

  function panelBrief(panel) {
    if (!panel) return "<null>";
    var id = "";
    var type = "";
    try { id = String(panel.id || ""); } catch (e1) {}
    try { type = String(panel.paneltype || ""); } catch (e2) {}
    return (type || "?") + "#" + (id || "?");
  }

  function panelId(panel) {
    try { return panel && panel.id ? String(panel.id) : ""; } catch (e) { return ""; }
  }

  function hasClass(panel, className) {
    try { return !!(panel && panel.BHasClass && panel.BHasClass(className)); } catch (e) { return false; }
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
      if (DEBUG_PROBES) log("no static scene for " + heroName + " map=" + record.map);
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

  function logWaitingState() {
    if (!DEBUG_PROBES) {
      log("waiting for active hero_* class.");
      return;
    }

    var progress = resolveProgressPanel();
    var hints = resolveButtonHintsPanel();
    log("waiting progress=" + panelBrief(progress) +
      " progressHero=" + (heroClassOn(progress) || "<none>") +
      " buttonHints=" + panelBrief(hints));
  }

  function tick() {
    try {
      var hero = detectHero();
      if (hero) {
        switchHeroScene(hero);
      } else {
        missCount++;
        if (missCount === 1 || missCount % MISS_LOG_INTERVAL === 0) {
          logWaitingState();
        }
      }
    } catch (e) {
      log("tick error: " + e);
    }

    $.Schedule(lastHero ? SLOW_POLL_SEC : FAST_POLL_SEC, tick);
  }

  buildTables();
  $.Schedule(FAST_POLL_SEC, tick);
})();
