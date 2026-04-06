'use strict';
(function () {

  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var TITLE = "HP Colors";
  var DEV_LOG = true;
  var DEFAULTS = {
    hp_enabled: true,
    hp_mode: 1,
    hp_low_threshold: 25,
    hp_bg_visible: true,
    hp_counter_size: 120,
    hp_counter_position: "20,196",
    hp_text_color_mode: 0,
    hp_text_color_low: "#E16161",
    hp_text_color_mid: "#FF7B00",
    hp_text_color_high: "#FFFFFF",
    hp_high_threshold: 65,
    hp_color_low: "#E16161",
    hp_color_mid: "#FF7B00",
    hp_color_high: "#00FF00",
    hp_team_colors: false
  };
  var TEAM1_HIGH = "#FFC961";
  var TEAM2_HIGH = "#6485FC";
  var WHITE_WASH = "#ffffff";
  var LP = 'low_hp_bar_pulse', LTX = 'low_hp_text_large', LS = 'low_hp_ult_static';

  var cfg = {};
  var TEAM1_HIGH_STATE = createColorState(TEAM1_HIGH, TEAM1_HIGH);
  var TEAM2_HIGH_STATE = createColorState(TEAM2_HIGH, TEAM2_HIGH);
  var derived = {
    lowThreshold: DEFAULTS.hp_low_threshold,
    highThreshold: DEFAULTS.hp_high_threshold,
    gradientMode: DEFAULTS.hp_mode === 1,
    bgVisible: !!DEFAULTS.hp_bg_visible,
    teamColors: !!DEFAULTS.hp_team_colors,
    counterBaseSize: DEFAULTS.hp_counter_size,
    counterBasePos: { x: 20, y: 196 },
    textUsesCustomColor: false,
    textLowState: createColorState(DEFAULTS.hp_text_color_low, DEFAULTS.hp_color_low),
    textMidState: createColorState(DEFAULTS.hp_text_color_mid, DEFAULTS.hp_color_mid),
    textHighState: createColorState(DEFAULTS.hp_text_color_high, WHITE_WASH),
    lowState: createColorState(DEFAULTS.hp_color_low, DEFAULTS.hp_color_low),
    midState: createColorState(DEFAULTS.hp_color_mid, DEFAULTS.hp_color_mid),
    highState: createColorState(DEFAULTS.hp_color_high, DEFAULTS.hp_color_high),
    lowDarkRgb: [0, 0, 0],
    midRange: 1,
    highRange: 1
  };

  function loadCfgDefaults() {
    for (var id in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, id)) {
        cfg[id] = DEFAULTS[id];
      }
    }
  }

  function createColorState(color, fallback) {
    var resolved = normalizeWashColor(typeof color === "string" ? color : "");
    if (!resolved) {
      resolved = normalizeWashColor(typeof fallback === "string" ? fallback : "") || WHITE_WASH;
    }
    return {
      wash: resolved,
      rgb: hexToRgb(resolved)
    };
  }

  function clampPct(v, fallback) {
    return Math.round(clampNum(v, 0, 100, fallback));
  }

  function isValidPanel(panel) {
    return !!(panel && panel.IsValid && panel.IsValid());
  }

  function refreshDerivedState() {
    var low = clampPct(cfg.hp_low_threshold, DEFAULTS.hp_low_threshold);
    var high = clampPct(cfg.hp_high_threshold, DEFAULTS.hp_high_threshold);
    if (high < low) high = low;

    derived.lowThreshold = low;
    derived.highThreshold = high;
    derived.midRange = Math.max(1, high - low);
    derived.highRange = Math.max(1, 100 - high);
    derived.gradientMode = cfg.hp_mode === 1;
    derived.bgVisible = !!cfg.hp_bg_visible;
    derived.teamColors = !!cfg.hp_team_colors;
    derived.counterBaseSize = clampNum(cfg.hp_counter_size, 72, 400, DEFAULTS.hp_counter_size);
    derived.counterBasePos = parseCounterPositionValue(cfg.hp_counter_position);
    derived.textUsesCustomColor = Number(cfg.hp_text_color_mode) === 1;
    derived.textLowState = createColorState(cfg.hp_text_color_low, DEFAULTS.hp_color_low);
    derived.textMidState = createColorState(cfg.hp_text_color_mid, DEFAULTS.hp_color_mid);
    derived.textHighState = createColorState(cfg.hp_text_color_high, WHITE_WASH);
    derived.lowState = createColorState(cfg.hp_color_low, DEFAULTS.hp_color_low);
    derived.midState = createColorState(cfg.hp_color_mid, DEFAULTS.hp_color_mid);
    derived.highState = createColorState(cfg.hp_color_high, DEFAULTS.hp_color_high);
    derived.lowDarkRgb = darkOf(derived.lowState.rgb);
  }

  function coerceCfgValue(id, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) return value;

    var fallback = DEFAULTS[id];
    if (id === "hp_counter_position") {
      var posX = 0;
      var posY = 200;
      var rawPos = value;

      if (rawPos && typeof rawPos === "object") {
        if (Array.isArray(rawPos)) {
          if (rawPos.length > 0) posX = clampNum(rawPos[0], 0, 400, 0);
          if (rawPos.length > 1) posY = clampNum(rawPos[1], 0, 400, 200);
        } else {
          if (Object.prototype.hasOwnProperty.call(rawPos, "x")) posX = clampNum(rawPos.x, 0, 400, 0);
          if (Object.prototype.hasOwnProperty.call(rawPos, "y")) posY = clampNum(rawPos.y, 0, 400, 200);
        }
        return Math.round(posX) + "," + Math.round(posY);
      }

      if (typeof rawPos === "string") {
        var posParts = rawPos.match(/-?\d+(?:\.\d+)?/g);
        if (posParts && posParts.length > 0) {
          posX = clampNum(posParts[0], 0, 400, 0);
          if (posParts.length > 1) posY = clampNum(posParts[1], 0, 400, 200);
          return Math.round(posX) + "," + Math.round(posY);
        }
      }

      if (typeof rawPos === "number") {
        posY = clampNum(rawPos, 0, 400, 200);
      }

      return Math.round(posX) + "," + Math.round(posY);
    }

    if (typeof fallback === "boolean") {
      if (value === true || value === false) return value;
      if (value === 1 || value === "1") return true;
      if (value === 0 || value === "0") return false;
      if (typeof value === "string") {
        var lowered = value.toLowerCase();
        if (lowered === "true") return true;
        if (lowered === "false") return false;
      }
      return !!fallback;
    }

    if (typeof fallback === "number") {
      var next = Number(value);
      if (!isFinite(next)) return fallback;
      return Math.round(next);
    }

    if (typeof fallback === "string") {
      return (typeof value === "string" && value.length > 0) ? value : fallback;
    }

    return value;
  }

  loadCfgDefaults();
  refreshDerivedState();
  var BOOTSTRAP_NAMESPACE = "hp_colors";
  var BOOTSTRAP_MAX_ATTEMPTS = 8;
  var BOOTSTRAP_RETRY_SEC = 0.5;
  var SESSION_STORAGE_KEY = "anita_v1_hp_colors";
  var CONVAR_KEY = "deadlock_hero_debuts_seen";
  var TOKEN_PREFIX = "ANITA-v1-";
  var SHARED_CFG_RAW_KEY = "hpColorsRuntimeCfgRaw";
  var SHARED_CFG_REV_KEY = "hpColorsRuntimeCfgRev";
  var bootstrapApplied = false;
  var bootstrapAttempts = 0;
  var bootstrapFinished = false;
  var bootstrapLoopActive = false;
  var settingsDirty = true;
  var sharedCfgRaw = "";
  var directBootstrapMisses = 0;

  function devLog(message) {
    if (!DEV_LOG) return;
    $.Msg("[HP Colors][Overlay] " + message);
  }

  function panelId(panel, fallback) {
    try {
      return String((panel && panel.id) || fallback || "panel");
    } catch (ePanel) {
      return String(fallback || "panel");
    }
  }

  function getRootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || null;
  }

  function getSharedStore() {
    try {
      if (typeof GameUI === "object" && GameUI && typeof GameUI.CustomUIConfig === "function") {
        var customUiConfig = GameUI.CustomUIConfig();
        if (customUiConfig && typeof customUiConfig === "object") {
          return customUiConfig;
        }
      }
    } catch (eCfg) {}
    return getRootPanel();
  }

  function snapshotCfg() {
    var out = {};
    for (var id in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) continue;
      out[id] = cfg[id];
    }
    return out;
  }

  function applySharedSnapshot(snapshot, reason) {
    if (!snapshot || typeof snapshot !== "object") return false;

    var changed = false;
    for (var id in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) continue;
      if (!Object.prototype.hasOwnProperty.call(snapshot, id)) continue;
      var nextValue = coerceCfgValue(id, snapshot[id]);
      if (cfg[id] !== nextValue) {
        cfg[id] = nextValue;
        changed = true;
      }
    }

    if (!changed && bootstrapApplied) return false;

    refreshDerivedState();
    invalidateComputedState(true);
    bootstrapApplied = true;
    bootstrapFinished = true;
    bootstrapLoopActive = false;
    devLog("shared cache applied source=" + String(reason || "shared_cache"));
    return true;
  }

  function writeSharedSnapshot(reason) {
    var store = getSharedStore();
    if (!store) return;

    var raw = "";
    try {
      raw = JSON.stringify(snapshotCfg());
    } catch (eJson) {
      raw = "";
    }
    if (!raw || raw === sharedCfgRaw) return;

    sharedCfgRaw = raw;
    try {
      store[SHARED_CFG_RAW_KEY] = raw;
      store[SHARED_CFG_REV_KEY] = Math.max(0, Math.floor(Number(store[SHARED_CFG_REV_KEY]) || 0)) + 1;
      devLog("shared cache write source=" + String(reason || "update") + " rev=" + String(store[SHARED_CFG_REV_KEY]));
    } catch (eStore) {}
  }

  function tryApplySharedSnapshot(reason) {
    var store = getSharedStore();
    if (!store) return false;

    var raw = "";
    try {
      raw = String(store[SHARED_CFG_RAW_KEY] || "");
    } catch (eRead) {
      raw = "";
    }
    if (!raw) return false;
    if (raw === sharedCfgRaw && bootstrapApplied) return false;

    var snapshot = null;
    try {
      snapshot = JSON.parse(raw);
    } catch (eParse) {
      devLog("shared cache parse failed reason=" + String(reason || "shared_cache") + " err=" + String(eParse));
      return false;
    }

    sharedCfgRaw = raw;
    return applySharedSnapshot(snapshot, reason || "shared_cache");
  }

  function decodeBase64Url(str) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var lookup = {};
    for (var i = 0; i < chars.length; i++) lookup[chars.charAt(i)] = i;

    function getVal(ch) {
      if (ch === undefined) return 0;
      if (!Object.prototype.hasOwnProperty.call(lookup, ch)) {
        throw new Error("Invalid base64url char: " + ch);
      }
      return lookup[ch];
    }

    var decodedBytes = [];
    for (var j = 0; j < str.length; j += 4) {
      var c0 = getVal(str[j]);
      var c1 = getVal(str[j + 1]);
      var c2 = str[j + 2] !== undefined ? getVal(str[j + 2]) : 0;
      var c3 = str[j + 3] !== undefined ? getVal(str[j + 3]) : 0;
      decodedBytes.push((c0 << 2) | (c1 >> 4));
      if (str[j + 2] !== undefined) decodedBytes.push(((c1 & 15) << 4) | (c2 >> 2));
      if (str[j + 3] !== undefined) decodedBytes.push(((c2 & 3) << 6) | c3);
    }

    var out = "";
    for (var k = 0; k < decodedBytes.length; k++) {
      var b = decodedBytes[k];
      if (b < 128) {
        out += String.fromCharCode(b);
      } else if (b < 224) {
        out += String.fromCharCode(((b & 31) << 6) | (decodedBytes[++k] & 63));
      } else {
        var cont2 = decodedBytes[++k];
        var cont3 = decodedBytes[++k];
        out += String.fromCharCode(((b & 15) << 12) | ((cont2 & 63) << 6) | (cont3 & 63));
      }
    }
    return out;
  }

  function parseStoredCfgPayload(raw, source) {
    var text = String(raw || "");
    if (!text) return null;

    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (eParse) {
      devLog("direct bootstrap parse failed source=" + String(source || "unknown") + " err=" + String(eParse));
      return null;
    }

    if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
      devLog("direct bootstrap payload invalid source=" + String(source || "unknown"));
      return null;
    }

    var snapshot = {};
    for (var id in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, id)) continue;
      if (!Object.prototype.hasOwnProperty.call(parsed.values, id)) continue;
      snapshot[id] = coerceCfgValue(id, parsed.values[id]);
    }

    return {
      source: String(source || "unknown"),
      snapshot: snapshot
    };
  }

  function getSessionMirrorEncoded() {
    var root = getRootPanel();
    var rootEncoded = "";
    var hudEncoded = "";

    try {
      if (root && root.GetAttributeString) {
        rootEncoded = String(root.GetAttributeString(SESSION_STORAGE_KEY, "") || "");
      }
    } catch (eRoot) {}

    try {
      var hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
      if (hud && hud.GetAttributeString) {
        hudEncoded = String(hud.GetAttributeString(SESSION_STORAGE_KEY, "") || "");
      }
    } catch (eHud) {}

    return rootEncoded || hudEncoded || "";
  }

  function readSessionMirrorPayload() {
    var encoded = getSessionMirrorEncoded();
    if (!encoded) return null;

    try {
      return parseStoredCfgPayload(decodeBase64Url(encoded), "session_mirror");
    } catch (eDecode) {
      devLog("direct bootstrap decode failed source=session_mirror err=" + String(eDecode));
      return null;
    }
  }

  function hasPersistentStorage() {
    try {
      return !!($ && $.persistentStorage &&
        typeof $.persistentStorage.getItem === "function" &&
        typeof $.persistentStorage.setItem === "function");
    } catch (eStorage) {
      return false;
    }
  }

  function readPersistentStoragePayload() {
    if (!hasPersistentStorage()) return null;

    var encoded = "";
    try {
      encoded = String($.persistentStorage.getItem(SESSION_STORAGE_KEY) || "");
    } catch (eRead) {
      devLog("direct bootstrap persistentStorage read failed err=" + String(eRead));
      return null;
    }
    if (!encoded) return null;

    try {
      return parseStoredCfgPayload(decodeBase64Url(encoded), "persistentStorage");
    } catch (eDecode) {
      devLog("direct bootstrap decode failed source=persistentStorage err=" + String(eDecode));
      return null;
    }
  }

  function readConvarPayload() {
    if (typeof GameInterfaceAPI === "undefined" ||
        !GameInterfaceAPI ||
        typeof GameInterfaceAPI.GetSettingString !== "function") {
      return null;
    }

    var convarRaw = "";
    try {
      convarRaw = String(GameInterfaceAPI.GetSettingString("deadlock_hero_debuts_seen") || "");
    } catch (eRead) {
      devLog("direct bootstrap convar read failed err=" + String(eRead));
      return null;
    }

    var tokenMatch = convarRaw.match(/\[ANITA-v1-hp_colors\]:([A-Za-z0-9_-]+)/);
    if (!tokenMatch) return null;

    try {
      return parseStoredCfgPayload(decodeBase64Url(String(tokenMatch[1] || "")), "convar");
    } catch (eDecode) {
      devLog("direct bootstrap decode failed source=convar err=" + String(eDecode));
      return null;
    }
  }

  function tryApplyDirectBootstrap(reason) {
    var payload = readSessionMirrorPayload();
    if (!payload) payload = readPersistentStoragePayload();
    if (!payload) payload = readConvarPayload();

    if (!payload || !payload.snapshot) {
      directBootstrapMisses += 1;
      if (directBootstrapMisses === 1 || directBootstrapMisses % 8 === 0) {
        devLog("direct bootstrap miss reason=" + String(reason || "request") +
          " miss_count=" + String(directBootstrapMisses) +
          " storage=" + String(hasPersistentStorage() ? 1 : 0));
      }
      return false;
    }

    directBootstrapMisses = 0;
    if (!applySharedSnapshot(payload.snapshot, "direct_" + payload.source)) {
      return bootstrapApplied;
    }
    writeSharedSnapshot("direct_" + payload.source);
    devLog("direct bootstrap applied source=" + payload.source + " reason=" + String(reason || "request"));
    return true;
  }

  function requestBootstrap(reason) {
    var root = getRootPanel();
    var now = Date.now ? Date.now() : (new Date()).getTime();
    try {
      if (root) {
        var nextAllowedAt = Number(root.__hpColorsBootstrapNextAllowedAt || 0);
        if (isFinite(nextAllowedAt) && nextAllowedAt > now) return;
        root.__hpColorsBootstrapNextAllowedAt = now + Math.floor(BOOTSTRAP_RETRY_SEC * 1000 * 0.8);
      }
    } catch (eRate) {}

    try {
      devLog("request bootstrap reason=" + String(reason || "overlay_request") + " next_attempt=" + String(bootstrapAttempts + 1));
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_REQUEST_BOOTSTRAP",
        mod_title: TITLE,
        storageNamespace: BOOTSTRAP_NAMESPACE,
        reason: String(reason || "overlay_request")
      }));
    } catch (e) {}
  }

  function scheduleBootstrapRetry(reason) {
    if (bootstrapApplied || bootstrapFinished) {
      bootstrapLoopActive = false;
      return;
    }
    if (tryApplySharedSnapshot("retry_shared") || tryApplyDirectBootstrap("retry_local")) {
      bootstrapLoopActive = false;
      return;
    }
    if (bootstrapAttempts >= BOOTSTRAP_MAX_ATTEMPTS) {
      bootstrapFinished = true;
      bootstrapLoopActive = false;
      devLog("bootstrap retries exhausted applied=" + String(bootstrapApplied));
      return;
    }

    bootstrapAttempts += 1;
    requestBootstrap(bootstrapAttempts === 1 ? String(reason || "overlay_startup") : "overlay_retry");
    $.Schedule(BOOTSTRAP_RETRY_SEC, function () {
      scheduleBootstrapRetry(reason);
    });
  }

  function ensureBootstrapSync(reason, resetAttempts) {
    if (bootstrapApplied) return;
    if (resetAttempts) {
      bootstrapAttempts = 0;
      bootstrapFinished = false;
    }
    if (tryApplySharedSnapshot(String(reason || "request") + "_shared") ||
        tryApplyDirectBootstrap(String(reason || "request") + "_local")) {
      return;
    }
    if (bootstrapLoopActive) return;
    devLog("ensure bootstrap reason=" + String(reason || "request") + " reset=" + String(!!resetAttempts) + " finished=" + String(bootstrapFinished));
    bootstrapLoopActive = true;
    scheduleBootstrapRetry(reason);
  }

  // Live updates from Anita UI, including boot-time bootstrap values.
  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var d = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!d || d.mod_title !== TITLE) return;

      if (d.magic_word === "ANITA_UPDATE") {
        var nextValue = null;
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, d.setting_id)) {
          nextValue = coerceCfgValue(d.setting_id, d.value);
        }
        var isSyncSource = d.update_source === "bridge_bootstrap" ||
          d.update_source === "ui_resync" ||
          d.update_source === "ui_reset" ||
          d.update_source === "ui_code_apply" ||
          d.update_source === "core_auto_resync";
        var valueChanged = Object.prototype.hasOwnProperty.call(DEFAULTS, d.setting_id) &&
          cfg[d.setting_id] !== nextValue;
        if (valueChanged || d.update_source !== "core_auto_resync") {
          devLog("received update source=" + String(d.update_source || "unknown") + " setting=" + String(d.setting_id || "") + " value=" + String(d.value));
        }
        if (valueChanged) {
          cfg[d.setting_id] = nextValue;
          refreshDerivedState();
          invalidateComputedState(
            d.setting_id === "hp_counter_size" ||
            d.setting_id === "hp_counter_position" ||
            d.setting_id === "hp_text_color_mode" ||
            d.setting_id === "hp_text_color_low" ||
            d.setting_id === "hp_text_color_mid" ||
            d.setting_id === "hp_text_color_high"
          );
          writeSharedSnapshot(d.update_source || "update");
        }
        if (isSyncSource) {
          bootstrapApplied = true;
          bootstrapFinished = true;
          bootstrapLoopActive = false;
          devLog("bootstrap satisfied source=" + String(d.update_source));
          try {
            var root = getRootPanel();
            if (root) root.__hpColorsBootstrapAppliedAt = Date.now ? Date.now() : (new Date()).getTime();
          } catch (eBoot) {}
        }
        return;
      }
    } catch (e) {}
  });

  // â”€â”€ Color helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function hexToRgb(s) {
    if (!s) return [255, 255, 255];
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return [+m[1], +m[2], +m[3]];
    return [255, 255, 255];
  }

  function clampByte(v) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    v = v | 0;
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
  }

  function byteHex(v) {
    var h = clampByte(v).toString(16);
    return h.length === 1 ? '0' + h : h;
  }

  function rgbToHex(c) {
    return '#' + byteHex(c[0]) + byteHex(c[1]) + byteHex(c[2]);
  }

  function normalizeWashColor(color) {
    if (typeof color !== 'string') return '';
    var trimmed = color.trim();
    if (!trimmed) return '';

    if (trimmed.charAt(0) === '#') {
      if (trimmed.length === 4) {
        return ('#' +
          trimmed.charAt(1) + trimmed.charAt(1) +
          trimmed.charAt(2) + trimmed.charAt(2) +
          trimmed.charAt(3) + trimmed.charAt(3)).toLowerCase();
      }
      if (trimmed.length >= 7) return trimmed.slice(0, 7).toLowerCase();
      return trimmed;
    }

    var m = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return rgbToHex([m[1], m[2], m[3]]);

    return trimmed;
  }

  function lerp(a, b, t) { return (a + (b - a) * t) | 0; }
  function mixRgbToHex(c1, c2, t) {
    return '#' +
      byteHex(lerp(c1[0], c2[0], t)) +
      byteHex(lerp(c1[1], c2[1], t)) +
      byteHex(lerp(c1[2], c2[2], t));
  }

  // Create a dark variant of a color for the low-HP gradient pulse
  function darkOf(c) { return [(c[0] * 0.37) | 0, (c[1] * 0.29) | 0, (c[2] * 0.29) | 0]; }

  function getHighColorState() {
    if (!derived.teamColors) return derived.highState;
    return tid === 2 ? TEAM2_HIGH_STATE : TEAM1_HIGH_STATE;
  }

  // â”€â”€ Panel cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var ctx = $.GetContextPanel();
  var us = null, hc = null, bg = null, pl = null, lb = null, lbp = null, rb = null, cp = null, ui = null;
  var cached = 0, att = 0;
  var lastRbPanel = null, lastUsPanel = null, lastHcPanel = null, lastBgPanel = null;
  var lastPlPanel = null, lastLbPanel = null, lastLbpPanel = null, lastUiPanel = null, lastCpPanel = null;
  var lBgVis = null, lHpSize = null, lHpPos = null, lHpMarginLeft = null;

  function fRB() {
    return ctx.FindChildTraverse('unit_healthbar_lagging') ||
      ctx.FindChildTraverse('health_bar') ||
      ctx.FindChildTraverse('unit_health');
  }

  function tryCache() {
    if (cached && isValidPanel(rb) && isValidPanel(us) && isValidPanel(hc) && isValidPanel(bg) && isValidPanel(pl) && isValidPanel(lb) && isValidPanel(lbp)) {
      var nextUi = isValidPanel(ui) ? ui : (ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon'));
      var nextCp = rb && rb.GetParent ? rb.GetParent() : null;
      if (nextUi !== ui || nextCp !== cp) {
        ui = nextUi;
        cp = nextCp;
        lastUiPanel = ui;
        lastCpPanel = cp;
        devLog("panel churn ui=" + panelId(ui, "ult_icon") + " cp=" + panelId(cp, "counter_parent"));
        resetStyleStateForNewPanels();
      }
      return 1;
    }
    if (cached) {
      cached = 0;
      att = 0;
    }
    if (att >= 10) return 0;
    att++;
    if (!isValidPanel(rb)) rb = null;
    if (!isValidPanel(us)) us = null;
    if (!isValidPanel(hc)) hc = null;
    if (!isValidPanel(bg)) bg = null;
    if (!isValidPanel(pl)) pl = null;
    if (!isValidPanel(lb)) lb = null;
    if (!isValidPanel(lbp)) lbp = null;
    if (!isValidPanel(ui)) ui = null;
    if (!isValidPanel(cp)) cp = null;
    if (!rb) rb = fRB();
    if (!us) us = ctx.FindChildTraverse('UnitStatus');
    if (!us) return 0;
    if (!hc) hc = us.FindChildTraverse('hp_counter');
    if (!bg) bg = us.FindChildTraverse('unit_healthbar_bg');
    if (!pl) pl = us.FindChildTraverse('unit_healthbar_pip_label');
    if (!lb) lb = us.FindChildTraverse('unit_healthbar_lagging');
    if (lb && !lbp) lbp = lb.GetParent();
    if (!ui) ui = ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon');
    if (rb && !cp) cp = rb.GetParent ? rb.GetParent() : null;
    if (rb && us && hc && bg && pl && lb && lbp) {
      var changed = rb !== lastRbPanel ||
        us !== lastUsPanel ||
        hc !== lastHcPanel ||
        bg !== lastBgPanel ||
        pl !== lastPlPanel ||
        lb !== lastLbPanel ||
        lbp !== lastLbpPanel ||
        ui !== lastUiPanel ||
        cp !== lastCpPanel;
      if (changed) {
        lastRbPanel = rb;
        lastUsPanel = us;
        lastHcPanel = hc;
        lastBgPanel = bg;
        lastPlPanel = pl;
        lastLbPanel = lb;
        lastLbpPanel = lbp;
        lastUiPanel = ui;
        lastCpPanel = cp;
        devLog("panel cache rebuilt rb=" + panelId(rb, "rb") + " us=" + panelId(us, "UnitStatus") + " hc=" + panelId(hc, "hp_counter"));
        resetStyleStateForNewPanels();
      }
      cached = 1;
      return 1;
    }
    return 0;
  }

  // â”€â”€ Team/flag scan (walk up to find team classes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var tid = 0, fl = 0;
  var scanAncestors = [];
  var scanAncestorCount = 0;
  var scanNextAt = 0;

  function scan(p) {
    var t = 0, f = 0, d = 0, c = p;
    while (c && d < 10) {
      if (c.BHasClass) {
        if (!t) { if (c.BHasClass('team2')) t = 2; else if (c.BHasClass('team1')) t = 1; }
        if (!(f & 1) && c.BHasClass('enemy')) f |= 1;
        if (!(f & 2) && (c.BHasClass('team_neutral') || c.BHasClass('neutral'))) f |= 2;
        if (t && (f & 3)) break;
      }
      if (!c.GetParent) break;
      c = c.GetParent(); d++;
    }
    tid = t; fl = f;
  }

  function resetScanCache() {
    tid = 0;
    fl = 0;
    scanNextAt = 0;
    for (var i = 0; i < scanAncestorCount; i++) {
      scanAncestors[i] = null;
    }
    scanAncestorCount = 0;
  }

  function ensureScanState(now) {
    if (!rb) {
      resetScanCache();
      return;
    }

    var c = rb;
    var depth = 0;
    var changed = false;

    while (c && depth < 10) {
      if (scanAncestors[depth] !== c) changed = true;
      scanAncestors[depth] = c;
      depth += 1;
      c = c.GetParent ? c.GetParent() : null;
    }

    if (scanAncestorCount !== depth) changed = true;
    for (var i = depth; i < scanAncestorCount; i++) {
      scanAncestors[i] = null;
    }
    scanAncestorCount = depth;

    if (changed || now >= scanNextAt) {
      scan(rb);
      scanNextAt = now + 250;
    }
  }

  // â”€â”€ Setter helpers (skip redundant writes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lCol = null, lUlt = null, lTxt = null;
  var lSH = -1, lSM = -1, lVis = null;
  var lTx = null, cMax = 0;
  var lCounterText = "";
  var lCounterLowMode = false;

  function sBC(c) {
    var next = normalizeWashColor(c);
    if (lCol !== next && rb) { rb.style.washColor = next; lCol = next; }
  }
  function sUC(c) {
    var next = normalizeWashColor(c);
    if (!ui || !ui.IsValid()) ui = ctx.FindChildTraverse('unit_ult_ready_icon') || ctx.FindChildTraverse('ult_icon');
    if (!ui || !ui.style) return;
    if (lUlt !== next) { ui.style.washColor = next; lUlt = next; }
  }
  function sTC(c) {
    var next = normalizeWashColor(c);
    if (!hc || !hc.style) return;
    if (lTxt !== next) { hc.style.washColor = next; lTxt = next; }
  }
  function sHV(visible) {
    if (!hc || !hc.style) return;
    var next = visible ? 'visible' : 'collapse';
    if (lVis !== next) { hc.style.visibility = next; lVis = next; }
  }

  function clampNum(v, min, max, fallback) {
    var next = Number(v);
    if (!isFinite(next)) next = Number(fallback);
    if (!isFinite(next)) next = 0;
    if (isFinite(min) && next < min) next = min;
    if (isFinite(max) && next > max) next = max;
    return next;
  }

  function estimateCounterUnits(text) {
    var s = String(text || "");
    var units = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      if (ch >= 48 && ch <= 57) units += 1.0;
      else if (ch === 32) units += 0.35;
      else if (ch === 47) units += 0.55;
      else if (ch === 58 || ch === 46) units += 0.40;
      else units += 0.80;
    }
    return units > 0 ? units : 1;
  }

  function getCounterAvailableWidth() {
    if (hc && hc.actuallayoutwidth > 0) return hc.actuallayoutwidth;
    if (us && us.actuallayoutwidth > 0) return us.actuallayoutwidth;
    if (cp && cp.actuallayoutwidth > 0) return cp.actuallayoutwidth;
    if (rb && rb.actuallayoutwidth > 0) return rb.actuallayoutwidth;
    return 0;
  }

  function sHBV(visible) {
    if (!bg || !bg.style) return;
    var next = visible ? 'visible' : 'collapse';
    if (lBgVis !== next) { bg.style.visibility = next; lBgVis = next; }
  }

  function parseCounterPositionValue(value) {
    var x = 0;
    var y = 200;
    var raw = value;

    if (raw && typeof raw === "object") {
      if (Array.isArray(raw)) {
        if (raw.length > 0) x = clampNum(raw[0], 0, 400, 0);
        if (raw.length > 1) y = clampNum(raw[1], 0, 400, 200);
      } else {
        if (Object.prototype.hasOwnProperty.call(raw, "x")) x = clampNum(raw.x, 0, 400, 0);
        if (Object.prototype.hasOwnProperty.call(raw, "y")) y = clampNum(raw.y, 0, 400, 200);
      }
      return { x: x, y: y };
    }

    if (typeof raw === "string") {
      var parts = raw.match(/-?\d+(?:\.\d+)?/g);
      if (parts && parts.length > 0) {
        x = clampNum(parts[0], 0, 400, 0);
        if (parts.length > 1) y = clampNum(parts[1], 0, 400, 200);
        return { x: x, y: y };
      }
    }

    if (typeof raw === "number") {
      y = clampNum(raw, 0, 400, 200);
      return { x: x, y: y };
    }

    return { x: x, y: y };
  }

  function sHCS(lowMode, textHint) {
    if (!hc || !hc.style) return;
    var baseSize = derived.counterBaseSize;
    var basePos = derived.counterBasePos;
    var text = String(textHint !== undefined ? textHint : lCounterText || "");
    var available = getCounterAvailableWidth();
    var units = estimateCounterUnits(text);
    var fitWidthSize = available > 0 ? Math.floor((available - 12) / (units * 0.45)) : baseSize;
    var fitSize = fitWidthSize;
    fitSize = clampNum(fitSize, 72, 400, baseSize);
    var size = Math.min(baseSize, fitSize);
    if (lowMode) size = Math.min(Math.round(size * 1.08), baseSize);
    var posX = clampNum(basePos.x, 0, 400, 0);
    var posY = clampNum(basePos.y, 0, 400, 200);
    if (!derived.bgVisible) {
      posX = Math.min(Math.round(baseSize * 0.025), 8);
      posY = Math.min(Math.round(baseSize * 0.5), 150);
    }
    if (lowMode) posY = Math.min(Math.round(posY + 10), 160);
    var marginLeft = (!derived.bgVisible && baseSize >= 320) ? '8%' : Math.round(posX) + '%';
    var fontSize = size + 'px';
    var marginTop = '-' + Math.round(posY) + '%';
    if (lHpSize !== fontSize) { hc.style.fontSize = fontSize; lHpSize = fontSize; }
    if (lHpPos !== marginTop) { hc.style.marginTop = marginTop; lHpPos = marginTop; }
    if (lHpMarginLeft !== marginLeft) { hc.style.marginLeft = marginLeft; lHpMarginLeft = marginLeft; }
  }

  function resetStyleStateForNewPanels() {
    pulse = 0;
    lCol = lUlt = lTxt = null;
    lBgVis = lHpSize = lHpPos = lHpMarginLeft = null;
    lSH = -1;
    lSM = -1;
    lVis = null;
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    lCounterLowMode = false;
    resetScanCache();
    settingsDirty = true;
    devLog("reset style state for new panels");
    if (!bootstrapApplied &&
        !tryApplySharedSnapshot("overlay_panel_churn") &&
        !tryApplyDirectBootstrap("overlay_panel_churn")) {
      ensureBootstrapSync("overlay_panel_churn", true);
    }
  }

  function applyCurrentSettings(isEnemy) {
    sHBV(!isEnemy || derived.bgVisible);
    sHCS(lCounterLowMode, lCounterText);
    settingsDirty = false;
    devLog("apply current settings isEnemy=" + String(!!isEnemy) + " team=" + String(tid) + " flags=" + String(fl) + " mode=" + String(cfg.hp_mode) + " teamColors=" + String(!!cfg.hp_team_colors));
  }

  // Decode max HP from pip label string (e.g. "|||| ..." â†’ 2000)
  function pMax(t) {
    if (t === lTx) return cMax;
    lTx = t; var p = 0, q = 0, li = t.lastIndexOf('|');
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c === 124) p++;
      else if ((c === 34 || c === 39) && (li === -1 || i > li)) q++;
    }
    cMax = p * 500 + q * 100; return cMax;
  }

  function uHT(cu, mx, lowMode) {
    if (!hc || (cu === lSH && mx === lSM && lCounterLowMode === !!lowMode)) return;
    sHV(true);
    var s = cu + ' / ' + mx;
    try { if (hc.text !== s) hc.text = s; } catch (e) { try { hc.SetAttributeString('text', s); } catch (e2) {} }
    lCounterText = s;
    lCounterLowMode = !!lowMode;
    sHCS(lCounterLowMode, lCounterText);
    lSH = cu; lSM = mx;
  }

  function getTextColorWash(barWash, fallbackWash, rangeKey) {
    if (derived.textUsesCustomColor) {
      if (rangeKey === "low") return derived.textLowState.wash;
      if (rangeKey === "mid") return derived.textMidState.wash;
      if (rangeKey === "high") return derived.textHighState.wash;
    }
    var next = normalizeWashColor(barWash);
    if (next) return next;
    next = normalizeWashColor(fallbackWash);
    return next || WHITE_WASH;
  }

  function applyPassiveUnitVisuals(barWash, hideCounter) {
    clearPulse();
    sHBV(true);
    if (barWash) sBC(barWash);
    else if (rb && lCol !== "") { rb.style.washColor = ""; lCol = ""; }
    if (ui && ui.style && lUlt !== "") { ui.style.washColor = ""; lUlt = ""; }
    if (hideCounter) {
      sHV(false);
      if (hc && hc.style && lTxt !== "") { hc.style.washColor = ""; lTxt = ""; }
      lCounterText = "";
      lCounterLowMode = false;
      lSH = -1;
      lSM = -1;
    } else {
      sHV(true);
      sTC(getTextColorWash(barWash, WHITE_WASH, "high"));
    }
  }

  // â”€â”€ Pulse state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var pulse = 0, gp = 0, gq = 1;

  function clearPulse() {
    if (!pulse) return;
    if (rb) rb.RemoveClass(LP);
    if (hc) hc.RemoveClass(LTX);
    if (ui) ui.RemoveClass(LS);
    pulse = 0; lTxt = lUlt = null;
  }

  // â”€â”€ Poll state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var lUT = 0, lW = -1, lPW = -1, lHp = -1, pPct = -1, sFC = 0;

  function invalidateComputedState(forceTextRefresh) {
    lW = -1;
    lPW = -1;
    lHp = -1;
    pPct = -1;
    sFC = 0;
    lCol = null;
    lUlt = null;
    lTxt = null;
    if (forceTextRefresh) {
      lSH = -1;
      lSM = -1;
      lCounterText = "";
      lCounterLowMode = false;
      lVis = null;
    }
    settingsDirty = true;
  }

  // â”€â”€ Main poll loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function gL() {
    try {
      if (!cfg.hp_enabled) {
        clearPulse();
        if (rb) { rb.style.washColor = ""; lCol = null; }
        if (ui) { ui.style.washColor = ""; lUlt = null; }
        if (bg && bg.style) { bg.style.visibility = 'collapse'; lBgVis = 'collapse'; }
        if (hc && hc.style) {
          hc.style.washColor = "";
          hc.style.visibility = 'collapse';
          hc.style.fontSize = "";
          hc.style.marginTop = "";
          hc.style.marginLeft = "";
          lTxt = null;
          lVis = 'collapse';
          lHpSize = null;
          lHpPos = null;
          lHpMarginLeft = null;
        }
        $.Schedule(1.0, gL); return;
      }

      var now = Date.now ? Date.now() : (new Date()).getTime();
      if (!rb) { rb = fRB(); if (!rb) { $.Schedule(0.2, gL); return; } }
      if (!tryCache()) { $.Schedule(0.2, gL); return; }
      if (rb.GetParent) { var p = rb.GetParent(); if (cp !== p) cp = p; }

      ensureScanState(now);
      var isEnemy = !!(fl & 1) && !(fl & 2);
      if (!bootstrapApplied) {
        if (!tryApplySharedSnapshot("overlay_tick")) {
          tryApplyDirectBootstrap("overlay_tick");
        }
      }
      if (isEnemy && !bootstrapApplied && !bootstrapLoopActive) {
        ensureBootstrapSync("overlay_enemy_detected", bootstrapFinished);
      }
      if (settingsDirty) applyCurrentSettings(isEnemy);
      else sHBV(!isEnemy || derived.bgVisible);

      // Neutral unit: ignore it like any other non-enemy overlay target.
      if (fl & 2) {
        applyPassiveUnitVisuals("", true);
        lUT = now;
        $.Schedule(3.0, gL); return;
      }
      // Not an enemy â€” skip coloring
      if (!(fl & 1)) {
        applyPassiveUnitVisuals("", true);
        lUT = now;
        $.Schedule(1.5, gL);
        return;
      }

      var w = rb.actuallayoutwidth | 0;
      var pw = cp && cp.actuallayoutwidth !== undefined ? cp.actuallayoutwidth | 0 : 0;

      // No change in width â€” back off
      if (w === lW && pw === lPW) {
        if (now - lUT > 2500) { $.Schedule(1.25, gL); return; }
        $.Schedule(0.25, gL); return;
      }
      lW = w; lPW = pw; lUT = now;
      if (pw <= 0) { $.Schedule(0.25, gL); return; }

      var hp = (w / pw * 100) | 0;
      var low = derived.lowThreshold;
      var high = derived.highThreshold;

      // Small change above low threshold â€” back off
      if (Math.abs(hp - lHp) < 3 && hp > low) { $.Schedule(0.22, gL); return; }
      if (hp === pPct) sFC++; else { sFC = 0; pPct = hp; }
      lHp = hp;

      // Update HP counter label
      var txt = '';
      if (pl) { try { txt = pl.text || pl.GetAttributeString('text', '') || ''; } catch (e) { txt = ''; } }
      if (lb && lbp) {
        var bw = lb.actuallayoutwidth || 0, bpw = lbp.actuallayoutwidth || 0;
        var ratio = bpw > 0 ? bw / bpw : 0;
        var mx = pMax(txt);
        uHT(ratio >= 0.97 ? mx : Math.round(mx * ratio), mx, hp <= low);
      }

      var sc = 0.15, cl, textWash;

      if (hp <= low) {
        if (derived.gradientMode) {
          // Gradient mode: JS pulse between low color and its dark variant
          clearPulse();
          sHBV(!isEnemy || derived.bgVisible);
          gp += gq * 0.1;
          if (gp >= 1) { gp = 1; gq = -1; }
          else if (gp <= 0) { gp = 0; gq = 1; }
          cl = mixRgbToHex(derived.lowState.rgb, derived.lowDarkRgb, gp);
          textWash = getTextColorWash(cl, derived.lowState.wash, "low");
          sBC(cl); sUC(cl); sTC(textWash);
          sc = 0.04;
        } else {
          // Fixed mode: CSS pulse class handles animation
          sHBV(!isEnemy || derived.bgVisible);
          sBC(derived.lowState.wash);
          if (!pulse) {
            rb.AddClass(LP);
            if (hc) hc.AddClass(LTX);
              if (ui) ui.AddClass(LS);
              pulse = 1; lCol = lUlt = lTxt = null;
          }
          textWash = getTextColorWash(derived.lowState.wash, derived.lowState.wash, "low");
          sTC(textWash); sUC(derived.lowState.wash);
        }
      } else {
        clearPulse();
        var highState = getHighColorState();

        if (hp <= high) {
          if (derived.gradientMode) {
            cl = mixRgbToHex(derived.lowState.rgb, derived.midState.rgb, (hp - low) / derived.midRange);
          } else {
            cl = derived.midState.wash;
          }
          textWash = getTextColorWash(cl, derived.midState.wash, "mid");
        } else {
          if (derived.gradientMode) {
            cl = mixRgbToHex(derived.midState.rgb, highState.rgb, (hp - high) / derived.highRange);
          } else {
            cl = highState.wash;
          }
          if (sFC >= 5) sc = Math.min(0.15 * Math.pow(2, Math.floor(sFC / 5)), 1);
          textWash = getTextColorWash(cl, highState.wash, "high");
        }
        sBC(cl); sUC(cl); sTC(textWash);
      }

      $.Schedule(sc, gL);
    } catch (e) {
      // Never die silently â€” reschedule after a brief pause
      $.Schedule(0.5, gL);
    }
  }

  // â”€â”€ Level tier coloring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var LT_ = [11, 19, 27, 35], LC_ = ['level_tier2', 'level_tier3', 'level_tier4', 'level_tier5'];
  var ll = null, lc = null, wr = null, lLv = -1;

  function pLv(t) { var v = 0; for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i) - 48; if (c >= 0 && c <= 9) v = v * 10 + c; } return v; }
  function fER(p) { var c = p; while (c) { if (c.BHasClass && c.BHasClass('enemy')) return c; if (!c.GetParent) break; c = c.GetParent(); } return null; }

  function cLU() {
    if (!ll || !ll.IsValid()) ll = ctx.FindChildTraverse('unit_level_label');
    if (!lc || !lc.IsValid()) lc = ctx.FindChildTraverse('LevelContainer');
    if (lc && (!wr || !wr.IsValid())) wr = fER(lc);
    return ll && lc && wr;
  }

  function uLT() {
    if (!cLU()) return;
    var t = ''; try { t = ll.text || ll.GetAttributeString('text', '') || ''; } catch (e) { t = ''; }
    if (!t || t.charCodeAt(0) === 123) return;
    var lv = pLv(t);
    if (lv === lLv || !lv) return;
    lLv = lv;
    for (var i = 0; i < 4; i++) wr.RemoveClass(LC_[i]);
    for (var j = 3; j >= 0; j--) { if (lv >= LT_[j]) { wr.AddClass(LC_[j]); break; } }
  }

  function lL() { uLT(); $.Schedule(0.5, lL); }

  gL();
  lL();
  $.Schedule(0.05, function () {
    devLog("overlay startup context=" + String(($.GetContextPanel() && $.GetContextPanel().id) || "panel"));
    if (!tryApplySharedSnapshot("overlay_startup")) {
      tryApplyDirectBootstrap("overlay_startup");
    }
    ensureBootstrapSync("overlay_startup", false);
  });
})();
