// fallow-ignore-file unused-file
// fallow-ignore-file complexity
"use strict";
(function () {
  "use strict";

  // Contract constants: pak96 owns the preset store; pak97 only publishes a cached snapshot.
  var STORE_ID = "HPColorsPresetStore";
  var STARTUP_PRESET_ID = "HPColorsPreset_001";
  var ENTRY_CLASS = "hp_colors_preset_entry";
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
  var ROOT_CFG_RAW_ATTR = "hp_colors_minimal_cfg_raw";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var SNAPSHOT_MAGIC = "HP_COLORS_PRESET_SNAPSHOT";
  var REQUEST_MAGIC = "HP_COLORS_PRESET_REQUEST";
  var PUBLISH_RETRY_DELAYS = [0.1, 0.5, 1.0, 2.5, 5.0, 8.0];
  var BOUNDED_HERO_PROBE_DELAYS = [2.0, 4.0, 6.0, 8.0, 12.0, 16.0, 20.0, 24.0];
  var SIGNATURE_MAX_TIER_CONFIRM_MS = 5000;
  var CACHED_SNAPSHOT_REPLAY_HOT_SEC = 1.0;
  var CACHED_SNAPSHOT_REPLAY_WARM_SEC = 3.0;
  var CACHED_SNAPSHOT_REPLAY_IDLE_SEC = 8.0;
  var CACHED_SNAPSHOT_REPLAY_STARTUP_HOT_MS = 10000;
  var CACHED_SNAPSHOT_REPLAY_HOT_COUNT = 3;
  var CACHED_SNAPSHOT_REPLAY_WARM_COUNT = 12;
  var CACHED_SNAPSHOT_REPLAY_REQUEST_HOT_MS = 1500;
  var REQUEST_REPLY_COOLDOWN_MS = 250;
  var HERO_PROBE_STABLE_NO_MATCH_COUNT = 2;
  var HERO_SELECTION_LOCK_GAME_TIME_SEC = 10;
  var HERO_SCOPE_OFF = "off";
  var HERO_SCOPE_ALL = "all";
  var HERO_SCOPE_SELECTED = "selected";
  var QOL_CONFIG_ATTR = "Deadlock_Mod_Settings_v1";
  var QOL_CONFIG_REV_ATTR = "QOL_USER_EDIT_REV";
  var QOL_HEALTH_DEFAULTS = {
    HEALTHBAR_TYPE: 0,
    ENABLE_MINIMALIST_HEALTHBAR: 0,
    ENABLE_FG_HEALTHBAR: 0,
    ENABLE_MINECRAFT_HEALTH_NUMBERS: 0,
    MINIMALIST_HEALTHBAR_X_OFFSET: 0,
    MINIMALIST_HEALTHBAR_Y_OFFSET: 0,
    PLAYER_HEALTHBAR_SCALE: 100,
    PLAYER_HEALTHBAR_OPACITY: 1,
    PLAYER_HEALTHBAR_X_OFFSET: 0,
    PLAYER_HEALTHBAR_Y_OFFSET: 0,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 0,
    ENABLE_COMBAT_INDICATOR: 0,
    ENABLE_COLORED_HEALTHBAR: 0,
    ENABLE_COLOR_WARNING_25: 0,
    ENABLE_COLOR_WARNING_65: 0,
    ENABLE_COLOR_WARNING_75: 0,
  };
  var COUNTER_VISIBLE_KEY = "hp_counter_visible";
  // Builder compact aliases. The HP_PERSIST_* names are kept as bridge contracts for existing tests/tools.
  var HP_PERSIST_ALIASES = {
    hp_enabled: "e",
    hp_mode: "m",
    hp_low_threshold: "l",
    hp_high_threshold: "h",
    hp_bg_visible: "b",
    hp_team_colors: "t",
    hp_info_health_margin_top: "ihmt",
    hp_healthbar_height: "hbh",
    hp_color_low: "cl",
    hp_color_mid: "cm",
    hp_color_high: "ch",
    hp_heal_color: "ehc",
    hp_delta_color: "edc",
    hp_bullet_shield_color: "ebsc",
    hp_counter_visible: "cv",
    hp_counter_size: "s",
    hp_counter_position: "p",
    hp_text_color_mode: "tm",
    hp_level_number_visible: "lnv",
    hp_pip_visible: "plv",
    hp_precise_pips_enabled: "ppe",
    hp_ult_color_enabled: "uce",
    hp_ult_color_custom: "ucc",
    hp_text_color_low: "tl",
    hp_text_color_mid: "ti",
    hp_text_color_high: "th",
    hp_pulse_bpm: "bp",
    hp_pulse_intensity: "pi",
    hp_pulse_enabled: "pe",
    hp_pulse_text_enabled: "pte",
    hp_pulse_text_scale: "pts",
    hp_pulse_text_position: "ptp",
    hp_pulse_hide_bar: "phb",
    hp_pulse_color_enabled: "pce",
    hp_pulse_color: "pc",
    hp_pulse_color_mode: "pcm",
    hp_skip_buildings: "sb",
    hp_pulse_threshold: "pt",
    hp_friend_enabled: "fe",
    hp_friend_pulse_enabled: "fpe",
    hp_friend_pulse_bpm: "fpb",
    hp_friend_pulse_intensity: "fpi",
    hp_friend_pulse_threshold: "fpt",
    hp_friend_color_low: "fcl",
    hp_friend_color_mid: "fcm",
    hp_friend_color_high: "fch",
    hp_friend_heal_color: "fhc",
    hp_friend_delta_color: "fdc",
    hp_friend_bullet_shield_color: "fbsc",
    hp_friend_pulse_color_enabled: "fpce",
    hp_friend_pulse_color: "fpc",
    hp_kill_zone_enabled: "kze",
    hp_kill_zone_threshold: "kzt",
    hp_kill_zone_color: "kzc",
    hp_kill_zone_width: "kzw",
    hp_counter_format: "cf",
  };
  var HP_PERSIST_ALIAS_TO_ID = (function () {
    var out = {};
    for (var id in HP_PERSIST_ALIASES) {
      if (Object.prototype.hasOwnProperty.call(HP_PERSIST_ALIASES, id))
        out[HP_PERSIST_ALIASES[id]] = id;
    }
    return out;
  })();
  var HP_PERSIST_ALLOWED_IDS = (function () {
    var out = {};
    for (var id in HP_PERSIST_ALIASES) {
      if (Object.prototype.hasOwnProperty.call(HP_PERSIST_ALIASES, id))
        out[id] = true;
    }
    return out;
  })();
  // Hero metadata is source-backed from SteamTracking heroes.vdata `m_HeroID`
  // and `citadel_gc_hero_names_english.txt`; no alias/fallback matching.
  var HERO_DATA = [
    { id: "hero_inferno", heroId: 1, name: "Infernus" },
    { id: "hero_gigawatt", heroId: 2, name: "Seven" },
    { id: "hero_hornet", heroId: 3, name: "Vindicta" },
    { id: "hero_ghost", heroId: 4, name: "Lady Geist" },
    { id: "hero_atlas", heroId: 6, name: "Abrams" },
    { id: "hero_wraith", heroId: 7, name: "Wraith" },
    { id: "hero_forge", heroId: 8, name: "McGinnis" },
    { id: "hero_chrono", heroId: 10, name: "Paradox" },
    { id: "hero_dynamo", heroId: 11, name: "Dynamo" },
    { id: "hero_kelvin", heroId: 12, name: "Kelvin" },
    { id: "hero_haze", heroId: 13, name: "Haze" },
    { id: "hero_astro", heroId: 14, name: "Holliday" },
    { id: "hero_bebop", heroId: 15, name: "Bebop" },
    { id: "hero_nano", heroId: 16, name: "Calico" },
    { id: "hero_orion", heroId: 17, name: "Grey Talon" },
    { id: "hero_krill", heroId: 18, name: "Mo & Krill" },
    { id: "hero_shiv", heroId: 19, name: "Shiv" },
    { id: "hero_tengu", heroId: 20, name: "Ivy" },
    { id: "hero_warden", heroId: 25, name: "Warden" },
    { id: "hero_yamato", heroId: 27, name: "Yamato" },
    { id: "hero_lash", heroId: 31, name: "Lash" },
    { id: "hero_viscous", heroId: 35, name: "Viscous" },
    { id: "hero_synth", heroId: 50, name: "Pocket" },
    { id: "hero_mirage", heroId: 52, name: "Mirage" },
    { id: "hero_viper", heroId: 58, name: "Vyper" },
    { id: "hero_magician", heroId: 60, name: "Sinclair" },
    { id: "hero_vampirebat", heroId: 63, name: "Mina" },
    { id: "hero_drifter", heroId: 64, name: "Drifter" },
    { id: "hero_priest", heroId: 65, name: "Venator" },
    { id: "hero_frank", heroId: 66, name: "Victor" },
    { id: "hero_bookworm", heroId: 67, name: "Paige" },
    { id: "hero_doorman", heroId: 69, name: "The Doorman" },
    { id: "hero_punkgoat", heroId: 72, name: "Billy" },
    { id: "hero_necro", heroId: 76, name: "Graves" },
    { id: "hero_fencer", heroId: 77, name: "Apollo" },
    { id: "hero_familiar", heroId: 79, name: "Rem" },
    { id: "hero_werewolf", heroId: 80, name: "Silver" },
    { id: "hero_unicorn", heroId: 81, name: "Celeste" },
  ];
  var HERO_BY_ID = {};
  var HERO_ID_TO_KEY = {};
  // Runtime state. Once cachedSnapshotPayload is set, late requests replay it instead of rescanning the store.
  var cachedRootPanel = null;
  var cachedStorePanel = null;
  var cachedGameplayAlive = null;
  var cachedCrosshair = null;
  var cachedHeroProgress = null;
  var cachedGameTimePanel = null;
  var cachedGameTimePanelMs = 0;
  var cachedPresetBases = null;
  var cachedPresetSignature = "";
  var cachedPresetBaseValues = null;
  var cachedPresetOverrides = null;
  var cachedValues = null;
  var lastPublishedRaw = "";
  var cachedSnapshotPayload = "";
  var sharedSnapshotWritten = false;
  var sharedStoreWritten = false;
  var rootAttrWritten = false;
  var cachedReplayStarted = false;
  var cachedReplayHandle = null;
  var lastSelectionReason = "";
  var lastSelectionPresetId = "";
  var lastSelectionHeroId = "";
  var lastSelectionHasScopedPreset = false;
  var heroProbeStarted = false;
  var heroProbeActive = false;
  var lastSnapshotReplyAt = 0;
  var cachedReplayDispatches = 0;
  var cachedReplayIntervalSec = CACHED_SNAPSHOT_REPLAY_HOT_SEC;
  var cachedReplayHotUntil = nowMs() + CACHED_SNAPSHOT_REPLAY_STARTUP_HOT_MS;
  var lastProbeHeroId = "";
  var stableProbeHeroCount = 0;
  var heroSelectionLocked = false;
  var heroLockPresetId = "";
  var heroLockHeroId = "";
  var publisherEpoch = 1;
  var publisherStopped = false;
  var publisherHandlerId = null;

  // Panel and diagnostics helpers.
  function isValidPanel(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (e) {}
    return false;
  }
  var PublisherLifetimeOwner = {
    isActive: function (epoch) {
      if (publisherStopped || (epoch !== undefined && epoch !== publisherEpoch))
        return false;
      var context = null;
      try {
        context = $.GetContextPanel();
      } catch (eContext) {}
      if (isValidPanel(context)) return true;
      this.stop();
      return false;
    },
    stop: function () {
      if (publisherStopped) return false;
      publisherStopped = true;
      publisherEpoch += 1;
      stopCachedSnapshotReplay();
      heroProbeActive = false;
      heroProbeStarted = false;
      clearHeroDetectionRefs();
      cachedRootPanel = null;
      cachedStorePanel = null;
      cachedGameplayAlive = null;
      cachedCrosshair = null;
      cachedHeroProgress = null;
      cachedGameTimePanel = null;
      cachedGameTimePanelMs = 0;
      try {
        if ($.UnregisterForUnhandledEvent && publisherHandlerId !== null)
          $.UnregisterForUnhandledEvent(EVENT_CHANNEL, publisherHandlerId);
      } catch (eUnregister) {}
      publisherHandlerId = null;
      return true;
    },
  };

  function getRootPanel() {
    if (!PublisherLifetimeOwner.isActive()) return null;
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    panel = panel || null;
    if (panel !== cachedRootPanel) {
      cachedRootPanel = panel;
      cachedGameTimePanel = null;
      cachedGameTimePanelMs = 0;
      cachedStorePanel = null;
      cachedPresetBases = null;
      cachedPresetSignature = "";
      publisherEpoch += 1;
      clearResolvedSnapshotCache();
      heroProbeStarted = false;
      heroProbeActive = false;
      lastProbeHeroId = "";
      stableProbeHeroCount = 0;
      clearHeroDetectionRefs();
      resetHeroSelectionLock();
    }
    return cachedRootPanel;
  }

  function suppressQolPlayerHealth() {
    var root = getRootPanel();
    if (!root || !root.GetAttributeString || !root.SetAttributeString)
      return false;
    var hud = null;
    try {
      hud = root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    } catch (eHud) {}
    var panels = hud && hud !== root ? [root, hud] : [root];
    var sourceRaw = "";
    var maxRevision = 0;
    for (var panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
      var panel = panels[panelIndex];
      var raw = "";
      var revision = 0;
      try {
        raw = String(panel.GetAttributeString(QOL_CONFIG_ATTR, "") || "");
        revision = Number(
          panel.GetAttributeString(QOL_CONFIG_REV_ATTR, "0") || "0",
        );
      } catch (eRead) {}
      if (!isFinite(revision) || revision < 0) revision = 0;
      if (raw && (!sourceRaw || revision >= maxRevision)) {
        sourceRaw = raw;
        maxRevision = revision;
      }
    }
    if (!sourceRaw) return false;

    var parsed = null;
    try {
      parsed = JSON.parse(sourceRaw);
    } catch (eParse) {
      return false;
    }
    var config =
      parsed &&
      typeof parsed === "object" &&
      parsed.data &&
      typeof parsed.data === "object"
        ? parsed.data
        : parsed;
    if (!config || typeof config !== "object") return false;

    var changed = false;
    for (var key in QOL_HEALTH_DEFAULTS) {
      if (
        Object.prototype.hasOwnProperty.call(QOL_HEALTH_DEFAULTS, key) &&
        config[key] !== QOL_HEALTH_DEFAULTS[key]
      ) {
        config[key] = QOL_HEALTH_DEFAULTS[key];
        changed = true;
      }
    }
    var nextRaw = sourceRaw;
    if (changed) {
      try {
        nextRaw = JSON.stringify(parsed);
      } catch (eStringify) {
        return false;
      }
      maxRevision += 1;
    }
    var revisionRaw = String(maxRevision);
    for (var writeIndex = 0; writeIndex < panels.length; writeIndex += 1) {
      var writePanel = panels[writeIndex];
      try {
        if (writePanel.GetAttributeString(QOL_CONFIG_ATTR, "") !== nextRaw)
          writePanel.SetAttributeString(QOL_CONFIG_ATTR, nextRaw);
        if (
          writePanel.GetAttributeString(QOL_CONFIG_REV_ATTR, "0") !==
          revisionRaw
        )
          writePanel.SetAttributeString(QOL_CONFIG_REV_ATTR, revisionRaw);
      } catch (eWrite) {}
    }
    return changed;
  }

  function isPublisherCallbackCurrent(epoch, expectedRoot) {
    if (!PublisherLifetimeOwner.isActive(epoch)) return false;
    var currentRoot = getRootPanel();
    if (!currentRoot || (expectedRoot && currentRoot !== expectedRoot)) return false;
    return PublisherLifetimeOwner.isActive(epoch);
  }

  function getSharedStore() {
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig)
        return GameUI.CustomUIConfig();
    } catch (e) {}
    return null;
  }

  var HPBridgeProtocol = {
    eventChannel: EVENT_CHANNEL,
    presetSnapshotMagic: SNAPSHOT_MAGIC,
    presetRequestMagic: REQUEST_MAGIC,
    sharedCfgRawKey: SHARED_CFG_RAW_KEY,
    rootCfgRawAttr: ROOT_CFG_RAW_ATTR,
    storeId: STORE_ID,
    startupPresetId: STARTUP_PRESET_ID,
    entryClass: ENTRY_CLASS,
    getSharedStore: function () { return getSharedStore(); },
    dispatchRawPayload: function (rawPayload) {
      if (!rawPayload) return false;
      try {
        $.DispatchEvent(this.eventChannel, rawPayload);
        return true;
      } catch (e) {}
      return false;
    },
    parsePayload: function (payload) {
      try {
        return typeof payload === "string" ? JSON.parse(payload) : payload;
      } catch (e) {}
      return null;
    },
    isPresetRequest: function (data) {
      return !!(data && data.magic_word === this.presetRequestMagic);
    },
    acceptsPresetRequest: function (data) {
      return !!(this.isPresetRequest(data) && (!data.mod_title || data.mod_title === "HP Colors"));
    },
    buildPresetSnapshotPayload: function (values, raw, reason) {
      return {
        magic_word: this.presetSnapshotMagic,
        mod_title: "HP Colors",
        version: 1,
        values_raw: raw,
        values: values,
        update_source: String(reason || "builder_static"),
      };
    },
    writeSharedConfigRaw: function (raw) {
      var wroteShared = false;
      var wroteRoot = false;
      var store = this.getSharedStore();
      if (store) {
        try {
          if (store[this.sharedCfgRawKey] !== raw) store[this.sharedCfgRawKey] = raw;
          wroteShared = true;
        } catch (e0) {}
      }
      var root = getRootPanel();
      try {
        if (isValidPanel(root) && root.SetAttributeString) {
          if (!root.GetAttributeString || root.GetAttributeString(this.rootCfgRawAttr, "") !== raw) {
            root.SetAttributeString(this.rootCfgRawAttr, raw);
          }
          wroteRoot = true;
        }
      } catch (e1) {}
      return { ok: wroteShared || wroteRoot, wroteShared: wroteShared, wroteRoot: wroteRoot };
    },
  };


  function parseGameTimeText(text) {
    var raw = String(text || "").replace(/^\s+|\s+$/g, "");
    if (!raw) return -1;
    var parts = raw.match(/\d+/g);
    if (!parts || !parts.length) return -1;
    if (parts.length === 1) return Number(parts[0]) || 0;
    var minutes = Number(parts[parts.length - 2]) || 0;
    var seconds = Number(parts[parts.length - 1]) || 0;
    if (seconds > 59) seconds = seconds % 60;
    return minutes * 60 + seconds;
  }

  function findPanelByClass(panel, className) {
    try {
      if (panel && panel.FindChildrenWithClassTraverse) {
        var matches = panel.FindChildrenWithClassTraverse(className) || [];
        if (matches.length) return matches[0];
      }
    } catch (e0) {}
    return null;
  }

  function resolveGameTimePanel() {
    if (isValidPanel(cachedGameTimePanel)) return cachedGameTimePanel;
    var root = getRootPanel();
    var topBar = findChild(root, "TopBar");
    cachedGameTimePanel =
      findPanelByClass(topBar, "GameTime") ||
      findPanelByClass(root, "GameTime");
    return cachedGameTimePanel;
  }

  function readGameTimeSec() {
    var now = nowMs();
    if (
      !isValidPanel(cachedGameTimePanel) ||
      now - cachedGameTimePanelMs > 1000
    ) {
      cachedGameTimePanel = resolveGameTimePanel();
      cachedGameTimePanelMs = now;
    }
    if (!isValidPanel(cachedGameTimePanel)) return -1;
    var text = "";
    try {
      text =
        cachedGameTimePanel.text ||
        cachedGameTimePanel.GetAttributeString("text", "") ||
        "";
    } catch (e0) {}
    return parseGameTimeText(text);
  }

  function resetHeroSelectionLock() {
    heroSelectionLocked = false;
    heroLockPresetId = "";
    heroLockHeroId = "";
  }

  function lockHeroSelectionIfReady() {
    if (heroSelectionLocked || !lastSelectionPresetId) return false;
    var gameTime = readGameTimeSec();
    if (gameTime < HERO_SELECTION_LOCK_GAME_TIME_SEC) return false;
    heroSelectionLocked = true;
    heroLockPresetId = lastSelectionPresetId;
    heroLockHeroId = lastSelectionHeroId || "";
    heroProbeActive = false;
    return true;
  }
  function nowMs() {
    try {
      if (Date && Date.now) return Date.now();
    } catch (e0) {}
    return +new Date();
  }

  // Preset decoding and hero-scoped selection.
  function returnPresetSelection(
    reason,
    preset,
    heroId,
    allowUnknownFallback,
    presetCount,
    hasScopedPreset,
  ) {
    lastSelectionReason = reason;
    lastSelectionPresetId = preset ? preset.id : "";
    lastSelectionHeroId = heroId || "";
    lastSelectionHasScopedPreset = !!hasScopedPreset;
    return preset;
  }

  function buildHeroTables() {
    for (var i = 0; i < HERO_DATA.length; i += 1) {
      var hero = HERO_DATA[i];
      HERO_BY_ID[hero.id] = hero;
      HERO_ID_TO_KEY[String(hero.heroId)] = hero.id;
    }
  }

  function normalizeHeroToken(value) {
    if (value === null || value === undefined) return "";
    var text = String(value);
    if (Object.prototype.hasOwnProperty.call(HERO_BY_ID, text)) return text;
    if (/^\d+$/.test(text)) return HERO_ID_TO_KEY[text] || "";
    return "";
  }


  const HeroScopedPresetSelection = {
    normalizeHeroes: function (heroes) {
      var source = [];
      if (Array.isArray(heroes)) source = heroes;
      else if (typeof heroes === "string") source = heroes.split(/[,|;]/);
      else if (heroes) source = [heroes];
      var seen = {};
      var out = [];
      for (var i = 0; i < source.length; i += 1) {
        var heroId = normalizeHeroToken(source[i]);
        if (!heroId || seen[heroId]) continue;
        seen[heroId] = true;
        out.push(heroId);
      }
      return out;
    },
    normalizeMode: function (mode, heroes) {
      var text = String(mode || "").toLowerCase();
      if (text === HERO_SCOPE_OFF || text === "disabled" || text === "none")
        return HERO_SCOPE_OFF;
      if (text === HERO_SCOPE_ALL || text === "global") return HERO_SCOPE_ALL;
      if (text === HERO_SCOPE_SELECTED || text === "heroes" || text === "hero") {
        return this.normalizeHeroes(heroes).length
          ? HERO_SCOPE_SELECTED
          : HERO_SCOPE_OFF;
      }
      return this.normalizeHeroes(heroes).length
        ? HERO_SCOPE_SELECTED
        : HERO_SCOPE_ALL;
    },
    targetsHero: function (preset, heroId) {
      if (
        !preset ||
        !heroId ||
        preset.heroMode !== HERO_SCOPE_SELECTED ||
        !Array.isArray(preset.heroes)
      )
        return false;
      for (var i = 0; i < preset.heroes.length; i += 1) {
        if (preset.heroes[i] === heroId) return true;
      }
      return false;
    },
    hasScopedPreset: function (presets) {
      for (var i = 0; i < presets.length; i += 1) {
        if (presets[i] && presets[i].heroMode === HERO_SCOPE_SELECTED)
          return true;
      }
      return false;
    },
    findById: function (presets, presetId) {
      for (var i = 0; i < presets.length; i += 1) {
        if (presets[i] && presets[i].id === presetId) return presets[i];
      }
      return null;
    },
    resolve: function (presets, heroId, allowUnknownFallback) {
      var startupPreset = null;
      var firstPreset = null;
      var firstGlobal = null;
      var firstHeroMatch = null;
      var hasScopedPreset = false;
      for (var i = 0; i < presets.length; i += 1) {
        var preset = presets[i];
        if (!preset) continue;
        if (!firstPreset) firstPreset = preset;
        if (!firstGlobal && preset.heroMode === HERO_SCOPE_ALL) firstGlobal = preset;
        if (preset.heroMode === HERO_SCOPE_SELECTED) hasScopedPreset = true;
        if (preset.id === STARTUP_PRESET_ID) startupPreset = preset;
        if (heroId && !firstHeroMatch && this.targetsHero(preset, heroId))
          firstHeroMatch = preset;
      }
      if (heroId && firstHeroMatch)
        return {
          preset: firstHeroMatch,
          heroId: heroId,
          hasScopedPreset: hasScopedPreset,
          reason: "selected-hero-match",
          source: "hero",
          usedFallback: false,
        };
      if (hasScopedPreset && !heroId && !allowUnknownFallback)
        return {
          preset: null,
          heroId: "",
          hasScopedPreset: hasScopedPreset,
          reason: "wait-unknown-hero",
          source: "waiting_for_hero",
          usedFallback: false,
        };
      if (
        startupPreset &&
        (!heroId ||
          startupPreset.heroMode === HERO_SCOPE_ALL ||
          this.targetsHero(startupPreset, heroId))
      )
        return {
          preset: startupPreset,
          heroId: heroId,
          hasScopedPreset: hasScopedPreset,
          reason: heroId ? "compatible-startup" : "unknown-hero-startup-fallback",
          source: "startup",
          usedFallback: true,
        };
      if (firstGlobal)
        return {
          preset: firstGlobal,
          heroId: heroId,
          hasScopedPreset: hasScopedPreset,
          reason: "first-global-fallback",
          source: "global",
          usedFallback: true,
        };
      return {
        preset: firstPreset,
        heroId: heroId,
        hasScopedPreset: hasScopedPreset,
        reason: "first-enabled-fallback",
        source: "first",
        usedFallback: true,
      };
    },
  };


  const HPPresetCodeCodec = {
    _chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
    _hasOwn: function (object, key) {
      return Object.prototype.hasOwnProperty.call(object || {}, key);
    },
    decodeBase64Url: function (text) {
      var str = String(text || "").replace(/^\s+|\s+$/g, "");
      if (!/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1)
        throw new Error("Invalid base64url");
      var lookup = {};
      for (var i = 0; i < this._chars.length; i += 1) lookup[this._chars[i]] = i;
      function val(ch) {
        if (ch === undefined) return 0;
        if (!Object.prototype.hasOwnProperty.call(lookup, ch))
          throw new Error("Invalid base64url");
        return lookup[ch];
      }
      var bytes = [];
      for (var j = 0; j < str.length; j += 4) {
        var c0 = val(str[j]);
        var c1 = val(str[j + 1]);
        var c2 = str[j + 2] !== undefined ? val(str[j + 2]) : 0;
        var c3 = str[j + 3] !== undefined ? val(str[j + 3]) : 0;
        bytes.push((c0 << 2) | (c1 >> 4));
        if (str[j + 2] !== undefined) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
        if (str[j + 3] !== undefined) bytes.push(((c2 & 3) << 6) | c3);
      }
      var out = "";
      for (var k = 0; k < bytes.length; k += 1) {
        var b = bytes[k];
        if (b < 128) out += String.fromCharCode(b);
        else if (b < 224)
          out += String.fromCharCode(((b & 31) << 6) | (bytes[++k] & 63));
        else {
          var b2 = bytes[++k];
          var b3 = bytes[++k];
          out += String.fromCharCode(
            ((b & 15) << 12) | ((b2 & 63) << 6) | (b3 & 63),
          );
        }
      }
      return out;
    },
    expandValues: function (rawValues, aliasToId, allowedIds) {
      if (!rawValues || typeof rawValues !== "object") return null;
      var out = {};
      var wrote = false;
      for (var key in rawValues) {
        if (!this._hasOwn(rawValues, key)) continue;
        var fullKey = key === "kzs" ? "hp_kill_zone_color" : aliasToId[key] || key;
        if (!this._hasOwn(allowedIds, fullKey)) continue;
        out[fullKey] = rawValues[key];
        wrote = true;
      }
      return wrote ? out : null;
    },
    normalizeOverrideRule: function (rawRule) {
      var slot;
      var minTier;
      var value;
      if (Array.isArray(rawRule)) {
        if (rawRule.length !== 3) return null;
        slot = rawRule[0];
        minTier = rawRule[1];
        value = rawRule[2];
      } else if (rawRule && typeof rawRule === "object") {
        if (
          !this._hasOwn(rawRule, "slot") ||
          !this._hasOwn(rawRule, "minTier") ||
          !this._hasOwn(rawRule, "value")
        )
          return null;
        slot = rawRule["slot"];
        minTier = rawRule["minTier"];
        value = rawRule["value"];
      } else {
        return null;
      }
      if (
        typeof slot !== "number" ||
        !isFinite(slot) ||
        Math.floor(slot) !== slot ||
        slot < 1 ||
        slot > 4 ||
        typeof minTier !== "number" ||
        !isFinite(minTier) ||
        Math.floor(minTier) !== minTier ||
        minTier < 0 ||
        minTier > 3
      )
        return null;
      return { slot: slot, minTier: minTier, value: value };
    },
    normalizeOverrides: function (rawOverrides) {
      if (
        !rawOverrides ||
        typeof rawOverrides !== "object" ||
        Array.isArray(rawOverrides)
      )
        return {};
      var canonical = {};
      var out = {};
      var keys = Object.keys(rawOverrides);
      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        if (
          this._hasOwn(HP_PERSIST_ALLOWED_IDS, key) &&
          key !== "hp_precise_pips_enabled"
        )
          canonical[key] = true;
      }
      for (var j = 0; j < keys.length; j += 1) {
        var rawKey = keys[j];
        var isCanonical = this._hasOwn(HP_PERSIST_ALLOWED_IDS, rawKey);
        var id = isCanonical
          ? rawKey
          : rawKey === "kzs"
            ? "hp_kill_zone_color"
            : HP_PERSIST_ALIAS_TO_ID[rawKey] || "";
        if (
          !id ||
          !this._hasOwn(HP_PERSIST_ALLOWED_IDS, id) ||
          id === "hp_precise_pips_enabled" ||
          (!isCanonical && this._hasOwn(canonical, id))
        )
          continue;
        var rule = this.normalizeOverrideRule(rawOverrides[rawKey]);
        if (rule) out[id] = rule;
      }
      return out;
    },
    normalizeHeroScope: function (mode, heroes, options) {
      var normalizedHeroes = HeroScopedPresetSelection.normalizeHeroes(heroes);
      var text = String(mode || "").toLowerCase();
      var scopeMode = "";
      if (text === HERO_SCOPE_OFF || text === "disabled" || text === "none")
        scopeMode = HERO_SCOPE_OFF;
      else if (text === HERO_SCOPE_ALL || text === "global")
        scopeMode = HERO_SCOPE_ALL;
      else if (
        text === HERO_SCOPE_SELECTED ||
        text === "heroes" ||
        text === "hero"
      )
        scopeMode = normalizedHeroes.length ? HERO_SCOPE_SELECTED : HERO_SCOPE_OFF;
      else if (normalizedHeroes.length) scopeMode = HERO_SCOPE_SELECTED;
      else scopeMode = (options && options.defaultModeWithoutHeroes) || HERO_SCOPE_ALL;
      return {
        mode: scopeMode,
        heroes: scopeMode === HERO_SCOPE_SELECTED ? normalizedHeroes : [],
      };
    },
    decodePresetPayload: function (preset, options) {
      if (!preset || typeof preset !== "object") return null;
      var version = Number(
        preset.version !== undefined ? preset.version : preset.v,
      );
      if (version !== 1 && version !== 97 && version !== 98 && version !== 99)
        return null;
      var rawValues =
        preset.values && typeof preset.values === "object"
          ? preset.values
          : preset.vals && typeof preset.vals === "object"
            ? preset.vals
            : preset.vs && typeof preset.vs === "object"
              ? preset.vs
              : null;
      var values = this.expandValues(
        rawValues,
        HP_PERSIST_ALIAS_TO_ID,
        HP_PERSIST_ALLOWED_IDS,
      );
      if (!values) return null;
      var scope = this.normalizeHeroScope(
        preset.heroMode !== undefined ? preset.heroMode : preset.hm,
        preset.heroes !== undefined
          ? preset.heroes
          : preset.hs !== undefined
            ? preset.hs
            : preset.hero !== undefined
              ? preset.hero
              : preset.h,
        options || { defaultModeWithoutHeroes: HERO_SCOPE_ALL },
      );
      return {
        values: values,
        overrides: this.normalizeOverrides(
          preset["o"] !== undefined ? preset["o"] : preset["overrides"],
        ),
        heroes: scope.heroes,
        heroMode: scope.mode,
      };
    },
  };

  var SignatureTierState = {
    root: null,
    panel: null,
    abilitiesPanel: null,
    slots: [null, null, null, null],
    tiers: [-1, -1, -1, -1],
    referenced: [false, false, false, false],
    seenAt: [-1, -1, -1, -1],
    retired: [false, false, false, false],
    rules: {},
    generation: 0,
    polling: false,
    handle: null,
    lastGameTimeSec: -1,
    stop: function () {
      if (this.handle) {
        try {
          if ($.CancelScheduled) $.CancelScheduled(this.handle);
        } catch (e) {}
      }
      this.handle = null;
      this.polling = false;
      this.generation += 1;
      this.lastGameTimeSec = -1;
    },
    resetForMatch: function () {
      this.stop();
      this.root = null;
      this.panel = null;
      this.abilitiesPanel = null;
      this.slots = [null, null, null, null];
      this.tiers = [-1, -1, -1, -1];
      this.seenAt = [-1, -1, -1, -1];
      this.retired = [false, false, false, false];
    },
    checkMatchReset: function () {
      var gameTime = readGameTimeSec();
      if (gameTime < 0) return false;
      var rolledBack =
        this.lastGameTimeSec >= 0 && gameTime < this.lastGameTimeSec;
      this.lastGameTimeSec = gameTime;
      if (!rolledBack) return false;
      this.resetForMatch();
      this.lastGameTimeSec = gameTime;
      return true;
    },
    setRules: function (rules) {
      this.stop();
      this.rules = rules || {};
      this.root = null;
      this.panel = null;
      this.abilitiesPanel = null;
      this.slots = [null, null, null, null];
      this.tiers = [-1, -1, -1, -1];
      this.referenced = [false, false, false, false];
      this.seenAt = [-1, -1, -1, -1];
      this.retired = [false, false, false, false];
      for (var id in this.rules) {
        if (Object.prototype.hasOwnProperty.call(this.rules, id)) {
          var slot = this.rules[id].slot;
          if (slot >= 1 && slot <= 4) this.referenced[slot - 1] = true;
        }
      }
      if (this.hasPending()) this.schedule();
    },
    hasPending: function () {
      for (var i = 0; i < 4; i += 1)
        if (this.referenced[i] && !this.retired[i]) return true;
      return false;
    },
    panelParent: function (panel) {
      try {
        return panel && panel.GetParent ? panel.GetParent() : null;
      } catch (e) {}
      return null;
    },
    isDescendantOf: function (panel, ancestor) {
      var current = panel;
      while (isValidPanel(current)) {
        if (current === ancestor) return true;
        current = this.panelParent(current);
      }
      return false;
    },
    hasAllSlots: function () {
      for (var i = 0; i < 4; i += 1) {
        if (
          this.referenced[i] &&
          (!isValidPanel(this.slots[i]) ||
            this.panelParent(this.slots[i]) !== this.abilitiesPanel)
        )
          return false;
      }
      return true;
    },
    cacheIsCurrent: function (root) {
      return !!(
        root === this.root &&
        isValidPanel(this.panel) &&
        isValidPanel(this.abilitiesPanel) &&
        this.isDescendantOf(this.panel, root) &&
        this.isDescendantOf(this.abilitiesPanel, this.panel) &&
        this.hasAllSlots()
      );
    },
    invalidatePanels: function () {
      this.root = null;
      this.panel = null;
      this.abilitiesPanel = null;
      this.slots = [null, null, null, null];
    },
    resolve: function () {
      var root = getRootPanel();
      if (!root) {
        return false;
      }
      if (this.cacheIsCurrent(root)) {
        return true;
      }
      var previousSlots = this.slots;
      this.invalidatePanels();
      var signaturePanel = null;
      try {
        signaturePanel = root.FindChildTraverse("hud_signature");
      } catch (ePanel) {}
      if (!isValidPanel(signaturePanel)) {
        return false;
      }
      var anchor = null;
      for (var anchorIndex = 0; anchorIndex < 4; anchorIndex += 1) {
        if (!this.referenced[anchorIndex]) continue;
        try {
          anchor = signaturePanel.FindChildTraverse(
            "slot_signature_" + String(anchorIndex + 1),
          );
        } catch (eAnchor) {}
        if (isValidPanel(anchor)) break;
      }
      if (!isValidPanel(anchor)) {
        return false;
      }
      var abilitiesPanel = this.panelParent(anchor);
      if (!isValidPanel(abilitiesPanel)) {
        return false;
      }
      this.root = root;
      this.panel = signaturePanel;
      this.abilitiesPanel = abilitiesPanel;
      this.slots = [null, null, null, null];
      try {
        var count = abilitiesPanel.GetChildCount
          ? abilitiesPanel.GetChildCount()
          : 0;
        for (var index = 0; index < count; index += 1) {
          var child = abilitiesPanel.GetChild(index);
          var id = panelId(child);
          for (var slot = 1; slot <= 4; slot += 1) {
            if (
              this.referenced[slot - 1] &&
              id === "slot_signature_" + String(slot)
            ) {
              if (
                previousSlots[slot - 1] &&
                previousSlots[slot - 1] !== child
              ) {
                this.tiers[slot - 1] = -1;
                this.seenAt[slot - 1] = -1;
                this.retired[slot - 1] = false;
              }
              this.slots[slot - 1] = child;
              break;
            }
          }
        }
      } catch (eChildren) {
        this.invalidatePanels();
        return false;
      }
      if (!this.hasAllSlots()) {
        this.invalidatePanels();
        return false;
      }
      return true;
    },
    readTier: function (panel) {
      if (!isValidPanel(panel)) return -1;
      for (var tier = 3; tier >= 0; tier -= 1) {
        try {
          if (panel.BHasClass && panel.BHasClass("Tier" + String(tier)))
            return tier;
        } catch (e) {}
      }
      return -1;
    },
    refresh: function () {
      var changed = false;
      this.checkMatchReset();
      var pending = this.hasPending();
      var resolved = pending && this.resolve();
      var now = nowMs();
      for (var i = 0; i < 4; i += 1) {
        var next = -1;
        if (this.referenced[i]) {
          if (this.retired[i]) next = 3;
          else if (resolved) {
            next = this.readTier(this.slots[i]);
            if (next === 3) {
              if (this.seenAt[i] < 0 || now < this.seenAt[i])
                this.seenAt[i] = now;
              else if (now - this.seenAt[i] >= SIGNATURE_MAX_TIER_CONFIRM_MS) {
                this.seenAt[i] = -1;
                this.retired[i] = true;
              }
            } else {
              this.seenAt[i] = -1;
            }
          } else {
            this.seenAt[i] = -1;
          }
        } else {
          this.seenAt[i] = -1;
        }
        if (next !== this.tiers[i]) {
          changed = true;
        }
        this.tiers[i] = next;
      }
      return changed;
    },
    effective: function (base) {
      var out = {};
      for (var key in base || {})
        if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
      for (var id in this.rules) {
        if (!Object.prototype.hasOwnProperty.call(this.rules, id)) continue;
        var rule = this.rules[id];
        if (this.tiers[rule.slot - 1] >= rule.minTier) out[id] = rule.value;
      }
      return out;
    },
    schedule: function () {
      if (this.polling || !this.hasPending()) return;
      var generation = this.generation;
      var epoch = publisherEpoch;
      var expectedRoot = getRootPanel();
      if (!expectedRoot) return;
      var self = this;
      this.polling = true;
      try {
        this.handle = $.Schedule(0.1, function signatureTierPoll() {
          self.handle = null;
          if (
            generation !== self.generation ||
            !PublisherLifetimeOwner.isActive(epoch) ||
            getRootPanel() !== expectedRoot
          ) {
            self.polling = false;
            return;
          }
          var changed = self.refresh();
          self.polling = false;
          if (changed) republishEffectiveValues("signature_tier_changed");
          if (self.hasPending()) self.schedule();
        });
      } catch (e) {
        this.handle = null;
        this.polling = false;
      }
    },
  };



  function normalizePresetPayload(preset) {
    return HPPresetCodeCodec.decodePresetPayload(preset, {
      defaultModeWithoutHeroes: HERO_SCOPE_ALL,
    });
  }

  function panelChildren(panel) {
    try {
      return panel && panel.Children ? panel.Children() : [];
    } catch (e) {}
    return [];
  }

  function panelHasClass(panel, className) {
    try {
      return !!(panel && panel.BHasClass && panel.BHasClass(className));
    } catch (e) {}
    return false;
  }

  function panelId(panel) {
    try {
      return panel && panel.id ? String(panel.id) : "";
    } catch (e) {}
    return "";
  }

  function findChild(panel, id) {
    try {
      return panel && panel.FindChildTraverse
        ? panel.FindChildTraverse(id)
        : null;
    } catch (e) {}
    return null;
  }

  function findDirectChildWhere(panel, id, predicate) {
    var children = panelChildren(panel);
    var fallback = null;
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (panelId(child) !== id) continue;
      if (!fallback) fallback = child;
      if (!predicate || predicate(child)) return child;
    }
    return fallback;
  }

  function heroClassOn(panel) {
    if (!isValidPanel(panel)) return "";
    for (var i = 0; i < HERO_DATA.length; i += 1) {
      if (panelHasClass(panel, HERO_DATA[i].id)) return HERO_DATA[i].id;
    }
    return "";
  }

  function hasDirectProgress(panel) {
    return !!heroClassOn(findDirectChildWhere(panel, "progress", heroClassOn));
  }

  function clearHeroDetectionRefs() {
    cachedGameplayAlive = null;
    cachedCrosshair = null;
    cachedHeroProgress = null;
  }

  function resolveHeroProgressPanel() {
    var root = getRootPanel();
    if (!isValidPanel(root)) return null;

    if (!isValidPanel(cachedGameplayAlive)) {
      cachedGameplayAlive = findChild(root, "gameplay_hud_alive");
      cachedCrosshair = null;
      cachedHeroProgress = null;
    }
    if (!isValidPanel(cachedGameplayAlive)) return null;

    var crosshair = findDirectChildWhere(
      cachedGameplayAlive,
      "crosshair",
      hasDirectProgress,
    );
    if (crosshair !== cachedCrosshair) {
      cachedCrosshair = crosshair;
      cachedHeroProgress = null;
    }
    if (!isValidPanel(cachedCrosshair)) return null;

    var progress = findDirectChildWhere(
      cachedCrosshair,
      "progress",
      heroClassOn,
    );
    if (progress !== cachedHeroProgress) cachedHeroProgress = progress;
    return isValidPanel(cachedHeroProgress) ? cachedHeroProgress : null;
  }

  function detectLocalHero() {
    var progress = resolveHeroProgressPanel();
    var heroId = heroClassOn(progress);
    return heroId;
  }

  // Snapshot transport: shared/raw first, root attribute fallback, then static bridge event.
  function dispatchSnapshot(payload) {
    return HPBridgeProtocol.dispatchRawPayload(payload);
  }

  const PresetSnapshotReplay = {
    buildPayload: function (values, raw, reason) {
      return JSON.stringify(HPBridgeProtocol.buildPresetSnapshotPayload(values, raw, reason));
    },
    acceptsRequest: function (data) {
      return HPBridgeProtocol.acceptsPresetRequest(data);
    },
    markRequestHot: function (now) {
      lastSnapshotReplyAt = now || nowMs();
      cachedReplayHotUntil =
        (now || lastSnapshotReplyAt) + CACHED_SNAPSHOT_REPLAY_REQUEST_HOT_MS;
    },
    replayDelay: function (now) {
      if (
        heroProbeActive ||
        now < cachedReplayHotUntil ||
        (lastSnapshotReplyAt &&
          now - lastSnapshotReplyAt < CACHED_SNAPSHOT_REPLAY_REQUEST_HOT_MS) ||
        cachedReplayDispatches < CACHED_SNAPSHOT_REPLAY_HOT_COUNT
      ) {
        return CACHED_SNAPSHOT_REPLAY_HOT_SEC;
      }
      if (cachedReplayDispatches < CACHED_SNAPSHOT_REPLAY_WARM_COUNT)
        return CACHED_SNAPSHOT_REPLAY_WARM_SEC;
      return CACHED_SNAPSHOT_REPLAY_IDLE_SEC;
    },
    publishCached: function (reason) {
      if (!cachedSnapshotPayload) return false;
      var dispatched = dispatchSnapshot(cachedSnapshotPayload);
      var sharedOk = this.writeSharedSnapshot(lastPublishedRaw);
      return dispatched || sharedOk;
    },
    writeSharedSnapshot: function (raw) {
      if (!raw) return false;
      var result = HPBridgeProtocol.writeSharedConfigRaw(raw);
      var wroteShared = !!(result && result.wroteShared);
      var wroteRoot = !!(result && result.wroteRoot);
      if (wroteShared) sharedStoreWritten = true;
      if (wroteRoot) rootAttrWritten = true;
      sharedSnapshotWritten = sharedStoreWritten || rootAttrWritten;
      return !!(result && result.ok);
    },
    publish: function (allowUnknownFallback) {
      if (!capturePreset(allowUnknownFallback)) return false;
      var sharedOk = this.writeSharedSnapshot(lastPublishedRaw);
      this.start();
      var dispatched = dispatchSnapshot(cachedSnapshotPayload);
      if (
        lastSelectionHasScopedPreset &&
        !lastSelectionHeroId &&
        (lastSelectionReason === "unknown-hero-startup-fallback" ||
          lastSelectionReason === "first-global-fallback" ||
          lastSelectionReason === "first-enabled-fallback")
      ) {
        startBoundedHeroPresetProbe();
      }
      return dispatched || sharedOk;
    },
    start: function () {
      if (cachedReplayStarted || !cachedSnapshotPayload) return;
      cachedReplayStarted = true;
      scheduleCachedSnapshotReplay();
    },
  };


  function readLabelText(label) {
    try {
      if (typeof label.text === "string") return label.text;
    } catch (e0) {}
    try {
      if (label.GetAttributeString) return label.GetAttributeString("text", "");
    } catch (e1) {}
    return "";
  }

  function getPanelId(panel) {
    try {
      if (panel && panel.id !== undefined) return String(panel.id || "");
    } catch (e0) {}
    try {
      if (panel && panel.GetAttributeString)
        return String(panel.GetAttributeString("id", "") || "");
    } catch (e1) {}
    return "";
  }


  function readPresetEntries() {
    var root = getRootPanel();
    if (!root || !root.FindChildTraverse) return [];

    var store = isValidPanel(cachedStorePanel) ? cachedStorePanel : null;
    if (!store) {
      try {
        store = root.FindChildTraverse(HPBridgeProtocol.storeId);
      } catch (e0) {}
      cachedStorePanel = isValidPanel(store) ? store : null;
    }
    if (!store) return [];

    var entries = [];
    try {
      if (store.FindChildrenWithClassTraverse) {
        entries = store.FindChildrenWithClassTraverse(HPBridgeProtocol.entryClass) || [];
      }
    } catch (e1) {}

    var signature = String(entries.length);
    for (var sigIndex = 0; sigIndex < entries.length; sigIndex += 1) {
      signature +=
        "|" +
        getPanelId(entries[sigIndex]) +
        ":" +
        readLabelText(entries[sigIndex]);
    }
    if (cachedPresetBases && cachedPresetSignature === signature)
      return cachedPresetBases;

    var validPresets = [];
    for (var i = 0; i < entries.length; i += 1) {
      try {
        var id = getPanelId(entries[i]);
        var encoded = readLabelText(entries[i]);
        if (!encoded) continue;
        var normalized = normalizePresetPayload(
          JSON.parse(HPPresetCodeCodec.decodeBase64Url(encoded)),
        );
        if (!normalized) continue;
        if (normalized.heroMode === HERO_SCOPE_OFF) {
          if (entries.length === 1 && id === STARTUP_PRESET_ID) {
            normalized.heroMode = HERO_SCOPE_ALL;
          } else {
            continue;
          }
        }
        validPresets.push({
          id: id,
          values: normalized.values,
          overrides: normalized.overrides,
          heroes: normalized.heroes,
          heroMode: normalized.heroMode,
        });
      } catch (e2) {}
    }
    cachedPresetSignature = signature;
    cachedPresetBases = validPresets;
    return validPresets;
  }

  function presetTargetsHero(preset, heroId) {
    return HeroScopedPresetSelection.targetsHero(preset, heroId);
  }



  function findScopedPresetForHero(heroId) {
    if (!heroId) return null;
    var validPresets = readPresetEntries();
    for (var i = 0; i < validPresets.length; i += 1) {
      if (presetTargetsHero(validPresets[i], heroId)) return validPresets[i];
    }
    return null;
  }

  function selectPresetForHero(allowUnknownFallback) {
    var validPresets = readPresetEntries();
    if (validPresets.length === 1) {
      return returnPresetSelection(
        "single-valid-preset",
        validPresets[0],
        "",
        allowUnknownFallback,
        validPresets.length,
        false,
      );
    }

    if (readGameTimeSec() === 0) resetHeroSelectionLock();

    var hasScopedPreset = HeroScopedPresetSelection.hasScopedPreset(validPresets);
    if (heroSelectionLocked && heroLockPresetId) {
      var lockedPreset = HeroScopedPresetSelection.findById(
        validPresets,
        heroLockPresetId,
      );
      if (lockedPreset) {
        return returnPresetSelection(
          "locked-hero-selection",
          lockedPreset,
          heroLockHeroId,
          allowUnknownFallback,
          validPresets.length,
          hasScopedPreset,
        );
      }
      resetHeroSelectionLock();
    }

    var heroId = hasScopedPreset ? detectLocalHero() : "";
    var result = HeroScopedPresetSelection.resolve(
      validPresets,
      heroId,
      allowUnknownFallback,
    );
    return returnPresetSelection(
      result.reason,
      result.preset,
      result.heroId,
      allowUnknownFallback,
      validPresets.length,
      result.hasScopedPreset,
    );
  }

  function applyHardGates(values) {
    var out = {};
    for (var key in values || {}) {
      if (Object.prototype.hasOwnProperty.call(values, key))
        out[key] = values[key];
    }
    if (!Object.prototype.hasOwnProperty.call(out, COUNTER_VISIBLE_KEY))
      out[COUNTER_VISIBLE_KEY] = true;
    return out;
  }

  function readPresetValues(allowUnknownFallback) {
    if (cachedValues) return cachedValues;
    var selectedPreset = selectPresetForHero(!!allowUnknownFallback);
    if (!selectedPreset || !selectedPreset.values) return null;
    cachedPresetBaseValues = applyHardGates(selectedPreset.values);
    cachedPresetOverrides = selectedPreset.overrides || {};
    SignatureTierState.setRules(cachedPresetOverrides);
    cachedValues = SignatureTierState.effective(cachedPresetBaseValues);
    return cachedValues;
  }


  function stopCachedSnapshotReplay() {
    if (cachedReplayHandle) {
      try {
        if ($.CancelScheduled) $.CancelScheduled(cachedReplayHandle);
      } catch (eCancel) {}
    }
    cachedReplayHandle = null;
    cachedReplayStarted = false;
  }

  function clearResolvedSnapshotCache() {
    stopCachedSnapshotReplay();
    SignatureTierState.stop();
    cachedPresetBaseValues = null;
    cachedPresetOverrides = null;
    cachedValues = null;
    cachedSnapshotPayload = "";
    lastPublishedRaw = "";
    sharedSnapshotWritten = false;
    sharedStoreWritten = false;
    rootAttrWritten = false;
    cachedReplayDispatches = 0;
    cachedReplayIntervalSec = CACHED_SNAPSHOT_REPLAY_HOT_SEC;
    cachedReplayHotUntil = nowMs() + CACHED_SNAPSHOT_REPLAY_STARTUP_HOT_MS;
  }


  function resetPresetMatchState() {
    resetHeroSelectionLock();
    heroProbeStarted = false;
    heroProbeActive = false;
    lastProbeHeroId = "";
    stableProbeHeroCount = 0;
    lastSelectionReason = "";
    lastSelectionPresetId = "";
    lastSelectionHeroId = "";
    lastSelectionHasScopedPreset = false;
    clearHeroDetectionRefs();
    clearResolvedSnapshotCache();
  }
  function capturePreset(allowUnknownFallback) {
    if (cachedSnapshotPayload) return true;

    var values = readPresetValues(allowUnknownFallback);
    if (!values) return false;

    var raw = "";
    try {
      raw = JSON.stringify(values);
    } catch (e0) {
      return false;
    }

    try {
      cachedSnapshotPayload = PresetSnapshotReplay.buildPayload(
        values,
        raw,
        "builder_static",
      );
    } catch (ePayload) {
      cachedSnapshotPayload = "";
      return false;
    }
    lastPublishedRaw = raw;
    lockHeroSelectionIfReady();
    return true;
  }

  function republishEffectiveValues(reason) {
    if (!cachedPresetBaseValues || !cachedSnapshotPayload) return false;
    var values = SignatureTierState.effective(cachedPresetBaseValues);
    var nextRaw = "";
    try {
      nextRaw = JSON.stringify(values);
      if (nextRaw === lastPublishedRaw) return false;
    } catch (eRaw) {
      return false;
    }
    try {
      cachedSnapshotPayload = PresetSnapshotReplay.buildPayload(
        values,
        nextRaw,
        reason || "signature_tier_changed",
      );
    } catch (ePayload) {
      return false;
    }
    cachedValues = values;
    lastPublishedRaw = nextRaw;
    var sharedOk = PresetSnapshotReplay.writeSharedSnapshot(nextRaw);
    startCachedSnapshotReplay();
    var dispatched = dispatchSnapshot(cachedSnapshotPayload);
    return dispatched || sharedOk;
  }

  function publishPreset(allowUnknownFallback) {
    return PresetSnapshotReplay.publish(allowUnknownFallback);
  }

  function publishUntilReady(allowUnknownFallback) {
    suppressQolPlayerHealth();
    if (cachedSnapshotPayload && sharedStoreWritten && rootAttrWritten)
      return true;
    if (cachedSnapshotPayload) {
      var transportOk = PresetSnapshotReplay.writeSharedSnapshot(lastPublishedRaw);
      startCachedSnapshotReplay();
      var dispatched = dispatchSnapshot(cachedSnapshotPayload);
      return dispatched || transportOk || sharedSnapshotWritten;
    }
    return publishPreset(allowUnknownFallback);
  }


  // Cached replay keeps late unit-status contexts fed without rebuilding from HPColorsPresetStore.
  function chooseCachedReplayInterval() {
    return PresetSnapshotReplay.replayDelay(nowMs());
  }


  function scheduleCachedSnapshotReplay() {
    cachedReplayIntervalSec = chooseCachedReplayInterval();
    var epoch = publisherEpoch;
    var expectedRoot = getRootPanel();
    if (!expectedRoot) return;
    try {
      cachedReplayHandle = $.Schedule(
        cachedReplayIntervalSec,
        function replayCachedSnapshot() {
          replayCachedSnapshotWithEpoch(epoch, expectedRoot);
        },
      );
    } catch (e) {
      cachedReplayHandle = null;
      cachedReplayStarted = false;
    }
  }

  function replayCachedSnapshotWithEpoch(epoch, expectedRoot) {
    if (
      !isPublisherCallbackCurrent(epoch, expectedRoot) ||
      !cachedReplayStarted
    )
      return;
    suppressQolPlayerHealth();
    cachedReplayHandle = null;
    if (!cachedSnapshotPayload) {
      cachedReplayStarted = false;
      return;
    }
    if (SignatureTierState.checkMatchReset()) {
      resetPresetMatchState();
      if (!publishUntilReady(false)) publishUntilReady(true);
      return;
    }
    cachedReplayDispatches += 1;
    dispatchSnapshot(cachedSnapshotPayload);
    scheduleCachedSnapshotReplay();
  }

  function startCachedSnapshotReplay() {
    PresetSnapshotReplay.start();
  }

  function handleBridgeEvent(payload) {
    if (!PublisherLifetimeOwner.isActive()) return;
    if (typeof payload === "string" && payload.indexOf(HPBridgeProtocol.presetRequestMagic) === -1)
      return;
    try {
      var data = HPBridgeProtocol.parsePayload(payload);
      if (!PresetSnapshotReplay.acceptsRequest(data)) return;
      if (cachedSnapshotPayload) {
        var now = nowMs();
        if (
          lastSnapshotReplyAt &&
          now - lastSnapshotReplyAt < REQUEST_REPLY_COOLDOWN_MS
        )
          return;
        PresetSnapshotReplay.markRequestHot(now);
        PresetSnapshotReplay.publishCached(data.reason);
        return;
      }
      PresetSnapshotReplay.markRequestHot(nowMs());
      publishPreset(true);
    } catch (e) {}
  }

  // Bootstrap.
  try {
    publisherHandlerId = $.RegisterForUnhandledEvent(
      HPBridgeProtocol.eventChannel,
      handleBridgeEvent,
    );
  } catch (e) {}

  buildHeroTables();
  publishUntilReady(false);
  for (
    var delayIndex = 0;
    delayIndex < PUBLISH_RETRY_DELAYS.length;
    delayIndex += 1
  ) {
    try {
      (function (isFinalRetry) {
        var epoch = publisherEpoch;
        var expectedRoot = getRootPanel();
        if (!expectedRoot) return;
        $.Schedule(PUBLISH_RETRY_DELAYS[delayIndex], function () {
          if (!isPublisherCallbackCurrent(epoch, expectedRoot)) return;
          publishUntilReady(isFinalRetry);
        });
      })(delayIndex === PUBLISH_RETRY_DELAYS.length - 1);
    } catch (e) {}
  }

  function runBoundedHeroPresetProbe(index, epoch) {
    if (!PublisherLifetimeOwner.isActive(epoch)) return;
    if (!heroProbeActive) return;
    if (heroSelectionLocked || lockHeroSelectionIfReady()) {
      heroProbeActive = false;
      return;
    }
    var heroId = detectLocalHero();
    var matchingPreset = findScopedPresetForHero(heroId);
    if (matchingPreset) {
      clearResolvedSnapshotCache();
      if (publishPreset(false)) {
        heroProbeActive = false;
        return;
      }
    }
    if (heroId && heroId === lastProbeHeroId) stableProbeHeroCount += 1;
    else {
      lastProbeHeroId = heroId || "";
      stableProbeHeroCount = heroId ? 1 : 0;
    }
    if (!heroId) stableProbeHeroCount = 0;
    if (
      heroId &&
      !matchingPreset &&
      stableProbeHeroCount >= HERO_PROBE_STABLE_NO_MATCH_COUNT
    ) {
      heroProbeActive = false;
      return;
    }
    if (index + 1 >= BOUNDED_HERO_PROBE_DELAYS.length) {
      heroProbeActive = false;
      return;
    }
    try {
      $.Schedule(BOUNDED_HERO_PROBE_DELAYS[index + 1], function () {
        runBoundedHeroPresetProbe(index + 1, epoch);
      });
    } catch (e) {}
  }

  function startBoundedHeroPresetProbe() {
    if (heroProbeStarted || heroProbeActive) return;
    heroProbeStarted = true;
    heroProbeActive = true;
    lastProbeHeroId = "";
    stableProbeHeroCount = 0;
    cachedReplayHotUntil = nowMs() + CACHED_SNAPSHOT_REPLAY_STARTUP_HOT_MS;
    var epoch = publisherEpoch;
    try {
      $.Schedule(BOUNDED_HERO_PROBE_DELAYS[0], function () {
        runBoundedHeroPresetProbe(0, epoch);
      });
    } catch (e) {}
  }
})();
