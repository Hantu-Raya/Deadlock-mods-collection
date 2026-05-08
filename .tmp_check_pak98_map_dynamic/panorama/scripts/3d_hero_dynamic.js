"use strict";

(function () {
  var HERO_IDS = {
    hero_base: 0,
    hero_inferno: 1,
    hero_gigawatt: 2,
    hero_hornet: 3,
    hero_ghost: 4,
    hero_atlas: 6,
    hero_wraith: 7,
    hero_forge: 8,
    hero_chrono: 10,
    hero_dynamo: 11,
    hero_kelvin: 12,
    hero_haze: 13,
    hero_astro: 14,
    hero_bebop: 15,
    hero_nano: 16,
    hero_orion: 17,
    hero_krill: 18,
    hero_shiv: 19,
    hero_tengu: 20,
    hero_kali: 21,
    hero_warden: 25,
    hero_yamato: 27,
    hero_lash: 31,
    hero_viscous: 35,
    hero_gunslinger: 38,
    hero_yakuza: 39,
    hero_genericperson: 46,
    hero_tokamak: 47,
    hero_wrecker: 48,
    hero_rutger: 49,
    hero_synth: 50,
    hero_thumper: 51,
    hero_mirage: 52,
    hero_slork: 53,
    hero_cadence: 54,
    hero_targetdummy: 55,
    hero_bomber: 56,
    hero_shieldguy: 57,
    hero_viper: 58,
    hero_vandal: 59,
    hero_magician: 60,
    hero_trapper: 61,
    hero_operative: 62,
    hero_vampirebat: 63,
    hero_drifter: 64,
    hero_priest: 65,
    hero_frank: 66,
    hero_bookworm: 67,
    hero_boho: 68,
    hero_doorman: 69,
    hero_skyrunner: 70,
    hero_swan: 71,
    hero_punkgoat: 72,
    hero_druid: 73,
    hero_graf: 74,
    hero_fortuna: 75,
    hero_necro: 76,
    hero_fencer: 77,
    hero_airheart: 78,
    hero_familiar: 79,
    hero_werewolf: 80,
    hero_unicorn: 81,
    hero_opera: 82,
    hero_testhero: 83
  };
  var HERO_PREFAB_MAPS = {
    hero_inferno: "maps/ui/hero_prefabs/inferno.vmap",
    hero_gigawatt: "maps/ui/hero_prefabs/gigawatt.vmap",
    hero_hornet: "maps/ui/hero_prefabs/hornet.vmap",
    hero_ghost: "maps/ui/hero_prefabs/geist.vmap",
    hero_atlas: "maps/ui/hero_prefabs/abrams.vmap",
    hero_wraith: "maps/ui/hero_prefabs/wraith.vmap",
    hero_forge: "maps/ui/hero_prefabs/forge.vmap",
    hero_chrono: "maps/ui/hero_prefabs/chrono.vmap",
    hero_dynamo: "maps/ui/hero_prefabs/prof_dynamo.vmap",
    hero_kelvin: "maps/ui/hero_prefabs/kelvin.vmap",
    hero_haze: "maps/ui/hero_prefabs/haze.vmap",
    hero_astro: "maps/ui/hero_prefabs/astro.vmap",
    hero_bebop: "maps/ui/hero_prefabs/bebop.vmap",
    hero_nano: "maps/ui/hero_prefabs/nano.vmap",
    hero_orion: "maps/ui/hero_prefabs/archer.vmap",
    hero_krill: "maps/ui/hero_prefabs/digger.vmap",
    hero_shiv: "maps/ui/hero_prefabs/shiv.vmap",
    hero_tengu: "maps/ui/hero_prefabs/tengu.vmap",
    hero_warden: "maps/ui/hero_prefabs/warden.vmap",
    hero_yamato: "maps/ui/hero_prefabs/yamato.vmap",
    hero_lash: "maps/ui/hero_prefabs/lash.vmap",
    hero_viscous: "maps/ui/hero_prefabs/viscous.vmap",
    hero_wrecker: "maps/ui/hero_prefabs/wrecker.vmap",
    hero_synth: "maps/ui/hero_prefabs/pocket.vmap",
    hero_mirage: "maps/ui/hero_prefabs/mirage.vmap",
    hero_viper: "maps/ui/hero_prefabs/viper.vmap",
    hero_vandal: "maps/ui/hero_prefabs/tengu.vmap",
    hero_magician: "maps/ui/hero_prefabs/magician.vmap",
    hero_trapper: "maps/ui/hero_prefabs/warden.vmap",
    hero_operative: "maps/ui/hero_prefabs/inferno.vmap",
    hero_vampirebat: "maps/ui/hero_prefabs/vampirebat.vmap",
    hero_drifter: "maps/ui/hero_prefabs/drifter.vmap",
    hero_priest: "maps/ui/hero_prefabs/priest.vmap",
    hero_frank: "maps/ui/hero_prefabs/frank.vmap",
    hero_bookworm: "maps/ui/hero_prefabs/bookworm.vmap",
    hero_boho: "maps/ui/hero_prefabs/boho.vmap",
    hero_doorman: "maps/ui/hero_prefabs/doorman.vmap",
    hero_skyrunner: "maps/ui/hero_prefabs/lash.vmap",
    hero_swan: "maps/ui/hero_prefabs/chrono.vmap",
    hero_punkgoat: "maps/ui/hero_prefabs/punkgoat.vmap",
    hero_graf: "maps/ui/hero_prefabs/chrono.vmap",
    hero_fortuna: "maps/ui/hero_prefabs/wraith.vmap",
    hero_necro: "maps/ui/hero_prefabs/necro.vmap",
    hero_fencer: "maps/ui/hero_prefabs/apollo.vmap",
    hero_airheart: "maps/ui/hero_prefabs/chrono.vmap",
    hero_familiar: "maps/ui/hero_prefabs/familiar.vmap",
    hero_werewolf: "maps/ui/hero_prefabs/werewolf.vmap",
    hero_unicorn: "maps/ui/hero_prefabs/unicorn.vmap",
    hero_testhero: "maps/ui/hero_prefabs/nano.vmap"
  };

  var HERO_CLASSES = [];
  var lastHero = "";
  var lastId = -1;
  var missCount = 0;

  for (var heroName in HERO_IDS) {
    if (Object.prototype.hasOwnProperty.call(HERO_IDS, heroName)) {
      HERO_CLASSES.push(heroName);
    }
  }

  function log(msg) {
    try {
      $.Msg("[3D-HUD] " + msg);
    } catch (e) {}
  }

  function rootPanel() {
    var p = $.GetContextPanel();
    while (p && p.GetParent && p.GetParent()) {
      p = p.GetParent();
    }
    return p || $.GetContextPanel();
  }

  function hasClass(panel, className) {
    try {
      return !!(panel && panel.BHasClass && panel.BHasClass(className));
    } catch (e) {
      return false;
    }
  }

  function heroClassOn(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return "";
    for (var i = 0; i < HERO_CLASSES.length; i++) {
      if (hasClass(panel, HERO_CLASSES[i])) return HERO_CLASSES[i];
    }
    return "";
  }

  function findInParents(panel) {
    var p = panel;
    var hops = 0;
    while (p && hops < 8) {
      var hero = heroClassOn(p);
      if (hero) return hero;
      p = p.GetParent ? p.GetParent() : null;
      hops++;
    }
    return "";
  }

  function scanPanelTree(panel, depth, seen) {
    if (!panel || depth > 10 || seen.count > 800) return "";
    seen.count++;

    var hero = heroClassOn(panel);
    if (hero && (hasClass(panel, "active") || hasClass(panel, "selected"))) return hero;

    var children = [];
    try {
      children = panel.Children ? panel.Children() : [];
    } catch (e) {
      children = [];
    }

    for (var i = 0; i < children.length; i++) {
      hero = scanPanelTree(children[i], depth + 1, seen);
      if (hero) return hero;
    }

    return "";
  }

  function detectHero() {
    var root = rootPanel();
    if (!root) return "";

    var progress = null;
    try {
      progress = root.FindChildTraverse ? root.FindChildTraverse("progress") : null;
    } catch (e) {
      progress = null;
    }

    var hero = findInParents(progress);
    if (hero) return hero;

    return scanPanelTree(root, 0, { count: 0 });
  }

  function setHeroAttrs(panel, heroName, heroId) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    var idText = String(heroId);
    try { panel.SetAttributeString("hero", heroName); } catch (e1) {}
    try { panel.SetAttributeString("unit", heroName); } catch (e2) {}
    try { panel.SetAttributeString("hero_id", idText); } catch (e3) {}
    try { panel.SetAttributeString("heroid", idText); } catch (e4) {}
    try { panel.SetAttributeString("data-hero", heroName); } catch (e5) {}
    try { panel.SetAttributeString("data-hero-id", idText); } catch (e6) {}
  }

  function sceneXml(heroName, heroId, mapName) {
    return '<root><CitadelHeroScenePanelNew id="ThreeDHeroDynamicHeroScene" class="ShowingHero" heroscenestyle="Portrait" map="' +
      mapName + '" camera="portrait_camera" hero_id="' + heroId + '" heroid="' + heroId + '" hero="' + heroName + '" unit="' + heroName +
      '" rotation_entity_name="root" rotate="None" hittest="false" /></root>';
  }

  function reloadDynamicScene(host, heroName, heroId, mapName) {
    try {
      if (host.RemoveAndDeleteChildren) host.RemoveAndDeleteChildren();
    } catch (e1) {}

    try {
      if (host.BLoadLayoutFromString) {
        host.BLoadLayoutFromString(sceneXml(heroName, heroId, mapName), false, false);
      }
    } catch (e2) {
      log("BLoadLayoutFromString failed: " + e2);
    }

    var scene = null;
    try {
      scene = host.FindChildTraverse ? host.FindChildTraverse("ThreeDHeroDynamicHeroScene") : null;
    } catch (e3) {
      scene = null;
    }

    setHeroAttrs(scene, heroName, heroId);
    try { scene.SetAttributeString("map", mapName); } catch (e4) {}
    try { scene.SetAttributeString("camera", "portrait_camera"); } catch (e5) {}
    try { scene.AddClass("ShowingHero"); } catch (e6) {}
  }

  function applyHero(heroName) {
    var heroId = HERO_IDS[heroName];
    var mapName = HERO_PREFAB_MAPS[heroName];
    if (heroId === undefined) return false;
    if (!mapName) {
      log("no portrait map for " + heroName + " -> " + heroId);
      return false;
    }
    if (heroName === lastHero && heroId === lastId) return true;

    var root = rootPanel();
    var probe = null;
    var host = null;

    try {
      probe = root && root.FindChildTraverse ? root.FindChildTraverse("ThreeDHeroHudProbe") : null;
      host = root && root.FindChildTraverse ? root.FindChildTraverse("ThreeDHeroDynamicHeroHost") : null;
    } catch (e) {}

    setHeroAttrs(probe, heroName, heroId);
    if (host) reloadDynamicScene(host, heroName, heroId, mapName);

    lastHero = heroName;
    lastId = heroId;
    missCount = 0;
    log("bound " + heroName + " -> " + heroId + " map=" + mapName);
    return true;
  }

  function tick() {
    try {
      var hero = detectHero();
      if (hero) {
        applyHero(hero);
      } else {
        missCount++;
        if (missCount === 1 || missCount % 20 === 0) log("waiting for active hero_* class");
      }
    } catch (e) {
      log("tick error: " + e);
    }
    $.Schedule(lastHero ? 0.75 : 0.25, tick);
  }

  $.Schedule(0.25, tick);
})();
