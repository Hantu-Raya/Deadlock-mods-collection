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
  var DEBUG_PRESET_SELECTION = false;
  var DEBUG_REPLAY_VERBOSE_ENABLED = false;
  var DEBUG_PREFIX = "[HP_COLORS_MINIMAL_PRESET]";
  var CACHED_SNAPSHOT_REPLAY_HOT_SEC = 1.0;
  var CACHED_SNAPSHOT_REPLAY_WARM_SEC = 3.0;
  var CACHED_SNAPSHOT_REPLAY_IDLE_SEC = 8.0;
  var CACHED_SNAPSHOT_REPLAY_STARTUP_HOT_MS = 10000;
  var CACHED_SNAPSHOT_REPLAY_REQUEST_HOT_MS = 1500;
  var CACHED_SNAPSHOT_REPLAY_HOT_COUNT = 3;
  var CACHED_SNAPSHOT_REPLAY_WARM_COUNT = 12;
  var HERO_PROBE_STABLE_NO_MATCH_COUNT = 2;
  var REQUEST_REPLY_COOLDOWN_MS = 250;
  var HERO_SELECTION_LOCK_GAME_TIME_SEC = 10;
  var HERO_SCOPE_OFF = "off";
  var HERO_SCOPE_ALL = "all";
  var HERO_SCOPE_SELECTED = "selected";
  var HARD_GATED_VALUES = {};
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
    hp_counter_visible: "cv",
    hp_counter_size: "s",
    hp_counter_position: "p",
    hp_text_color_mode: "tm",
    hp_level_number_visible: "lnv",
    hp_pip_visible: "plv",
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
  var cachedValues = null;
  var lastPublishedRaw = "";
  var cachedSnapshotPayload = "";
  var sharedSnapshotWritten = false;
  var sharedStoreWritten = false;
  var rootAttrWritten = false;
  var cachedReplayStarted = false;
  var cachedReplayHandle = null;
  var lastDebugByStage = {};
  var lastSelectionReason = "";
  var lastSelectionPresetId = "";
  var lastSelectionHeroId = "";
  var lastSelectionHasScopedPreset = false;
  var heroProbeStarted = false;
  var heroProbeActive = false;
  var lastSnapshotReplyAt = 0;
  var cachedReplayDispatches = 0;
  var cachedReplayIntervalSec = CACHED_SNAPSHOT_REPLAY_HOT_SEC;
  var lastReplayDebugIntervalSec = 0;
  var cachedReplayHotUntil = nowMs() + CACHED_SNAPSHOT_REPLAY_STARTUP_HOT_MS;
  var lastProbeHeroId = "";
  var stableProbeHeroCount = 0;
  var heroSelectionLocked = false;
  var heroLockPresetId = "";
  var heroLockHeroId = "";

  // Panel and diagnostics helpers.
  function isValidPanel(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (e) {}
    return false;
  }

  function getRootPanel() {
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
      clearHeroDetectionRefs();
      resetHeroSelectionLock();
      debugLog("root", { id: panelId(panel) || "", changed: true });
    }
    return cachedRootPanel;
  }

  function getSharedStore() {
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig)
        return GameUI.CustomUIConfig();
    } catch (e) {}
    return null;
  }

  function debugPresetSelectionEnabled() {
    if (DEBUG_PRESET_SELECTION) return true;
    var store = getSharedStore();
    try {
      return !!(store && store.__hpColorsPresetDebug);
    } catch (e) {}
    return false;
  }

  function debugLog(stage, data) {
    if (!debugPresetSelectionEnabled()) return;
    var payload = "";
    try {
      payload = data ? JSON.stringify(data) : "";
    } catch (e0) {
      payload = String(data || "");
    }
    if (lastDebugByStage[stage] === payload) return;
    lastDebugByStage[stage] = payload;
    var line = DEBUG_PREFIX + " " + stage + (payload ? " " + payload : "");
    try {
      if (typeof $ !== "undefined" && $ && $.Msg) {
        $.Msg(line);
        return;
      }
    } catch (e1) {}
    try {
      if (typeof console !== "undefined" && console && console.log)
        console.log(line);
    } catch (e2) {}
  }

  function debugPresetSummary(preset) {
    if (!preset) return "";
    return (
      preset.id +
      ":" +
      preset.heroMode +
      ":" +
      (preset.heroes && preset.heroes.length ? preset.heroes.join(",") : "*")
    );
  }

  function parseGameTimeText(text) {
    var raw = String(text || "").replace(/^\s+|\s+$/g, "");
    if (!raw) return -1;
    var parts = raw.match(/\d+/g);
    if (!parts || !parts.length) return -1;
    if (parts.length === 1) return Number(parts[0]) || 0;
    return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
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
    debugLog("select", {
      reason: reason,
      preset: debugPresetSummary(preset),
      hero: heroId || "",
      allow_unknown_fallback: !!allowUnknownFallback,
      preset_count: presetCount || 0,
      has_scoped_preset: !!hasScopedPreset,
    });
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

  function normalizeHeroSelection(value) {
    var source = [];
    if (Array.isArray(value)) source = value;
    else if (typeof value === "string") source = value.split(/[,|;]/);
    else if (value) source = [value];
    var seen = {};
    var out = [];
    for (var i = 0; i < source.length; i += 1) {
      var heroId = normalizeHeroToken(source[i]);
      if (!heroId || seen[heroId]) continue;
      seen[heroId] = true;
      out.push(heroId);
    }
    return out;
  }

  function normalizeHeroScopeMode(mode, heroes) {
    var text = String(mode || "").toLowerCase();
    if (text === HERO_SCOPE_OFF || text === "disabled" || text === "none")
      return HERO_SCOPE_OFF;
    if (text === HERO_SCOPE_ALL || text === "global") return HERO_SCOPE_ALL;
    if (text === HERO_SCOPE_SELECTED || text === "heroes" || text === "hero") {
      return normalizeHeroSelection(heroes).length
        ? HERO_SCOPE_SELECTED
        : HERO_SCOPE_OFF;
    }
    return normalizeHeroSelection(heroes).length
      ? HERO_SCOPE_SELECTED
      : HERO_SCOPE_ALL;
  }

  function expandBuilderPresetValues(rawValues) {
    if (!rawValues || typeof rawValues !== "object") return null;
    var out = {};
    var wrote = false;
    for (var key in rawValues) {
      if (!Object.prototype.hasOwnProperty.call(rawValues, key)) continue;
      var fullKey = HP_PERSIST_ALIAS_TO_ID[key] || key;
      if (String(fullKey).indexOf("hp_") !== 0) continue;
      out[fullKey] = rawValues[key];
      wrote = true;
    }
    return wrote ? out : null;
  }

  function isSupportedPresetVersion(version) {
    return version === 1 || version === 97;
  }

  function normalizePresetPayload(preset) {
    if (!preset || typeof preset !== "object") return null;
    var version = Number(
      preset.version !== undefined ? preset.version : preset.v,
    );
    var rawValues = preset.values || preset.vals || preset.vs;
    var values = expandBuilderPresetValues(rawValues);
    if (!isSupportedPresetVersion(version) || !values) return null;
    var heroes = normalizeHeroSelection(
      preset.heroes || preset.hs || preset.hero || preset.h,
    );
    var heroMode = normalizeHeroScopeMode(preset.heroMode || preset.hm, heroes);
    if (heroMode === HERO_SCOPE_SELECTED && !heroes.length)
      heroMode = HERO_SCOPE_OFF;
    if (heroMode !== HERO_SCOPE_SELECTED) heroes = [];
    return {
      values: values,
      heroes: heroes,
      heroMode: heroMode,
    };
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
    debugLog("detect", {
      hero: heroId || "",
      root: panelId(cachedRootPanel) || "",
      alive: isValidPanel(cachedGameplayAlive),
      crosshair: isValidPanel(cachedCrosshair),
      progress: isValidPanel(progress),
    });
    return heroId;
  }

  // Snapshot transport: shared/raw first, root attribute fallback, then static bridge event.
  function dispatchSnapshot(payload) {
    try {
      $.DispatchEvent(EVENT_CHANNEL, payload);
      return true;
    } catch (e) {}
    return false;
  }

  function writeSharedSnapshot(raw) {
    if (!raw) return false;
    var wroteShared = false;
    var wroteRoot = false;
    var store = getSharedStore();
    if (store) {
      try {
        if (store[SHARED_CFG_RAW_KEY] !== raw) {
          store[SHARED_CFG_RAW_KEY] = raw;
        }
        wroteShared = true;
      } catch (e0) {}
    }
    var root = getRootPanel();
    try {
      if (isValidPanel(root) && root.SetAttributeString) {
        if (
          !root.GetAttributeString ||
          root.GetAttributeString(ROOT_CFG_RAW_ATTR, "") !== raw
        ) {
          root.SetAttributeString(ROOT_CFG_RAW_ATTR, raw);
        }
        wroteRoot = true;
      }
    } catch (e1) {}
    if (wroteShared) sharedStoreWritten = true;
    if (wroteRoot) rootAttrWritten = true;
    sharedSnapshotWritten = sharedStoreWritten || rootAttrWritten;
    if (sharedSnapshotWritten) {
      debugLog("shared-write", {
        gameui: wroteShared,
        root_attr: wroteRoot,
        gameui_ready: sharedStoreWritten,
        root_ready: rootAttrWritten,
        raw_length: raw.length,
      });
    }
    return wroteShared || wroteRoot;
  }

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

  function decodeBase64Url(str) {
    var chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var lookup = {};
    for (var i = 0; i < chars.length; i += 1) lookup[chars[i]] = i;

    function val(ch) {
      if (ch === undefined || ch === "") return 0;
      if (!Object.prototype.hasOwnProperty.call(lookup, ch))
        throw new Error("bad base64url");
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
      if (b < 128) {
        out += String.fromCharCode(b);
      } else if (b < 224) {
        out += String.fromCharCode(((b & 31) << 6) | (bytes[++k] & 63));
      } else {
        var b2 = bytes[++k];
        var b3 = bytes[++k];
        out += String.fromCharCode(
          ((b & 15) << 12) | ((b2 & 63) << 6) | (b3 & 63),
        );
      }
    }
    return out;
  }

  function readPresetEntries() {
    var root = getRootPanel();
    if (!root || !root.FindChildTraverse) return [];

    var store = isValidPanel(cachedStorePanel) ? cachedStorePanel : null;
    if (!store) {
      try {
        store = root.FindChildTraverse(STORE_ID);
      } catch (e0) {}
      cachedStorePanel = isValidPanel(store) ? store : null;
    }
    if (!store) return [];

    var entries = [];
    try {
      if (store.FindChildrenWithClassTraverse) {
        entries = store.FindChildrenWithClassTraverse(ENTRY_CLASS) || [];
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
          JSON.parse(decodeBase64Url(encoded)),
        );
        if (!normalized) continue;
        if (normalized.heroMode === HERO_SCOPE_OFF) {
          if (entries.length === 1 && id === STARTUP_PRESET_ID) {
            normalized.heroMode = HERO_SCOPE_ALL;
            debugLog("single-startup-off-compat", { id: id });
          } else {
            continue;
          }
        }
        validPresets.push({
          id: id,
          values: normalized.values,
          heroes: normalized.heroes,
          heroMode: normalized.heroMode,
        });
      } catch (e2) {}
    }
    cachedPresetSignature = signature;
    cachedPresetBases = validPresets;
    if (debugPresetSelectionEnabled()) {
      debugLog("store", {
        entries: entries.length,
        valid_presets: validPresets.length,
        presets: validPresets.map(debugPresetSummary),
      });
    }
    return validPresets;
  }

  function presetTargetsHero(preset, heroId) {
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
  }

  function presetIsGlobal(preset) {
    return preset && preset.heroMode === HERO_SCOPE_ALL;
  }

  function presetCompatibleWithHero(preset, heroId) {
    return presetIsGlobal(preset) || presetTargetsHero(preset, heroId);
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

    var startupPreset = null;
    var firstPreset = null;
    if (readGameTimeSec() === 0) resetHeroSelectionLock();

    var firstGlobal = null;
    var firstHeroMatch = null;
    var hasScopedPreset = false;
    for (var i = 0; i < validPresets.length; i += 1) {
      var preset = validPresets[i];
      if (!firstPreset) firstPreset = preset;
      if (!firstGlobal && presetIsGlobal(preset)) firstGlobal = preset;
      if (preset.heroMode === HERO_SCOPE_SELECTED) hasScopedPreset = true;
      if (preset.id === STARTUP_PRESET_ID) startupPreset = preset;
    }

    if (heroSelectionLocked && heroLockPresetId) {
      for (
        var lockedIndex = 0;
        lockedIndex < validPresets.length;
        lockedIndex += 1
      ) {
        if (validPresets[lockedIndex].id === heroLockPresetId) {
          return returnPresetSelection(
            "locked-hero-selection",
            validPresets[lockedIndex],
            heroLockHeroId,
            allowUnknownFallback,
            validPresets.length,
            hasScopedPreset,
          );
        }
      }
      resetHeroSelectionLock();
    }

    var heroId = hasScopedPreset ? detectLocalHero() : "";
    for (var j = 0; heroId && j < validPresets.length; j += 1) {
      if (presetTargetsHero(validPresets[j], heroId)) {
        firstHeroMatch = validPresets[j];
        break;
      }
    }

    if (heroId && firstHeroMatch)
      return returnPresetSelection(
        "selected-hero-match",
        firstHeroMatch,
        heroId,
        allowUnknownFallback,
        validPresets.length,
        hasScopedPreset,
      );
    if (hasScopedPreset && !heroId && !allowUnknownFallback) {
      return returnPresetSelection(
        "wait-unknown-hero",
        null,
        "",
        allowUnknownFallback,
        validPresets.length,
        hasScopedPreset,
      );
    }
    if (
      startupPreset &&
      (!heroId || presetCompatibleWithHero(startupPreset, heroId))
    ) {
      return returnPresetSelection(
        heroId ? "compatible-startup" : "unknown-hero-startup-fallback",
        startupPreset,
        heroId,
        allowUnknownFallback,
        validPresets.length,
        hasScopedPreset,
      );
    }
    if (firstGlobal)
      return returnPresetSelection(
        "first-global-fallback",
        firstGlobal,
        heroId,
        allowUnknownFallback,
        validPresets.length,
        hasScopedPreset,
      );
    return returnPresetSelection(
      "first-enabled-fallback",
      firstPreset,
      heroId,
      allowUnknownFallback,
      validPresets.length,
      hasScopedPreset,
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
    for (var forced in HARD_GATED_VALUES) {
      if (Object.prototype.hasOwnProperty.call(HARD_GATED_VALUES, forced))
        out[forced] = HARD_GATED_VALUES[forced];
    }
    return out;
  }

  function readPresetValues(allowUnknownFallback) {
    if (cachedValues) return cachedValues;
    var selectedPreset = selectPresetForHero(!!allowUnknownFallback);
    if (!selectedPreset || !selectedPreset.values) return null;
    var selectedValues = applyHardGates(selectedPreset.values);
    cachedValues = selectedValues;
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
      cachedSnapshotPayload = JSON.stringify({
        magic_word: SNAPSHOT_MAGIC,
        mod_title: "HP Colors",
        version: 1,
        values_raw: raw,
        values: values,
        update_source: "builder_static",
      });
    } catch (ePayload) {
      cachedSnapshotPayload = "";
      return false;
    }
    lastPublishedRaw = raw;
    debugLog("capture", {
      allow_unknown_fallback: !!allowUnknownFallback,
      raw_length: raw.length,
      hp_team_colors: values.hp_team_colors,
      hp_color_low: values.hp_color_low,
      hp_mode: values.hp_mode,
      hp_skip_buildings: values.hp_skip_buildings,
      hp_counter_visible: values.hp_counter_visible,
      hp_friend_enabled: values.hp_friend_enabled,
      hp_friend_color_low: values.hp_friend_color_low,
      hp_friend_color_mid: values.hp_friend_color_mid,
      hp_friend_color_high: values.hp_friend_color_high,
      hp_friend_pulse_enabled: values.hp_friend_pulse_enabled,
    });
    lockHeroSelectionIfReady();
    return true;
  }

  function publishPreset(allowUnknownFallback) {
    if (!capturePreset(allowUnknownFallback)) return false;
    var sharedOk = writeSharedSnapshot(lastPublishedRaw);
    startCachedSnapshotReplay();
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
  }

  function publishUntilReady(allowUnknownFallback) {
    if (cachedSnapshotPayload && sharedStoreWritten && rootAttrWritten)
      return true;
    if (cachedSnapshotPayload) {
      var transportOk = writeSharedSnapshot(lastPublishedRaw);
      startCachedSnapshotReplay();
      var dispatched = dispatchSnapshot(cachedSnapshotPayload);
      return dispatched || transportOk || sharedSnapshotWritten;
    }
    return publishPreset(allowUnknownFallback);
  }


  // Cached replay keeps late unit-status contexts fed without rebuilding from HPColorsPresetStore.
  function chooseCachedReplayInterval() {
    var now = nowMs();
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
  }

  function shouldLogCachedReplay() {
    if (DEBUG_REPLAY_VERBOSE_ENABLED) return true;
    if (cachedReplayDispatches <= 1) return true;
    return cachedReplayIntervalSec !== lastReplayDebugIntervalSec;
  }

  function scheduleCachedSnapshotReplay() {
    cachedReplayIntervalSec = chooseCachedReplayInterval();
    if (shouldLogCachedReplay()) {
      debugLog("replay", {
        dispatches: cachedReplayDispatches,
        interval: cachedReplayIntervalSec,
        hero_probe: !!heroProbeActive,
      });
    }
    lastReplayDebugIntervalSec = cachedReplayIntervalSec;
    try {
      cachedReplayHandle = $.Schedule(
        cachedReplayIntervalSec,
        replayCachedSnapshot,
      );
    } catch (e) {
      cachedReplayHandle = null;
      cachedReplayStarted = false;
    }
  }

  function replayCachedSnapshot() {
    cachedReplayHandle = null;
    if (!cachedSnapshotPayload) {
      cachedReplayStarted = false;
      return;
    }
    cachedReplayDispatches += 1;
    dispatchSnapshot(cachedSnapshotPayload);
    scheduleCachedSnapshotReplay();
  }

  function startCachedSnapshotReplay() {
    if (cachedReplayStarted || !cachedSnapshotPayload) return;
    cachedReplayStarted = true;
    scheduleCachedSnapshotReplay();
  }

  function handleBridgeEvent(payload) {
    if (typeof payload === "string" && payload.indexOf(REQUEST_MAGIC) === -1)
      return;
    try {
      var data = typeof payload === "string" ? JSON.parse(payload) : payload;
      if (!data || data.magic_word !== REQUEST_MAGIC) return;
      if (data.mod_title && data.mod_title !== "HP Colors") return;
      if (cachedSnapshotPayload) {
        var now = nowMs();
        if (
          lastSnapshotReplyAt &&
          now - lastSnapshotReplyAt < REQUEST_REPLY_COOLDOWN_MS
        )
          return;
        lastSnapshotReplyAt = now;
        cachedReplayHotUntil = now + CACHED_SNAPSHOT_REPLAY_REQUEST_HOT_MS;
        dispatchSnapshot(cachedSnapshotPayload);
        writeSharedSnapshot(lastPublishedRaw);
        return;
      }
      publishPreset(true);
    } catch (e) {}
  }

  // Bootstrap.
  try {
    $.RegisterForUnhandledEvent(EVENT_CHANNEL, handleBridgeEvent);
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
        $.Schedule(PUBLISH_RETRY_DELAYS[delayIndex], function () {
          publishUntilReady(isFinalRetry);
        });
      })(delayIndex === PUBLISH_RETRY_DELAYS.length - 1);
    } catch (e) {}
  }

  function runBoundedHeroPresetProbe(index) {
    if (!heroProbeActive) return;
    if (heroSelectionLocked || lockHeroSelectionIfReady()) {
      heroProbeActive = false;
      return;
    }
    var heroId = detectLocalHero();
    var matchingPreset = findScopedPresetForHero(heroId);
    debugLog("probe", {
      index: index,
      hero: heroId || "",
      preset: debugPresetSummary(matchingPreset),
    });
    if (matchingPreset) {
      clearResolvedSnapshotCache();
      if (publishPreset(false)) {
        heroProbeActive = false;
        debugLog("probe-stop", {
          reason: "selected-hero-match",
          hero: lastSelectionHeroId || heroId,
          preset: lastSelectionPresetId || matchingPreset.id,
        });
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
      debugLog("probe-stop", {
        reason: "known-hero-no-scoped-preset",
        hero: heroId,
        stable_count: stableProbeHeroCount,
      });
      return;
    }
    if (index + 1 >= BOUNDED_HERO_PROBE_DELAYS.length) {
      heroProbeActive = false;
      debugLog("probe-stop", { reason: "bounded-timeout", hero: heroId || "" });
      return;
    }
    try {
      $.Schedule(BOUNDED_HERO_PROBE_DELAYS[index + 1], function () {
        runBoundedHeroPresetProbe(index + 1);
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
    debugLog("probe-start", { retries: BOUNDED_HERO_PROBE_DELAYS.length });
    try {
      $.Schedule(BOUNDED_HERO_PROBE_DELAYS[0], function () {
        runBoundedHeroPresetProbe(0);
      });
    } catch (e) {}
  }
})();
