'use strict';
(function () {
  "use strict";

  var TITLE = "HP Colors";
  var STORE_ID = "HPColorsPresetStore";
  var ENTRY_CLASS = "hp_colors_preset_entry";
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
  var cachedValues = null;
  var retryDelays = [0.1, 0.5, 1.0, 2.5, 5.0, 8.0];

  function getRootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel || null;
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

  function decodeBase64Url(str) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var lookup = {};
    for (var i = 0; i < chars.length; i += 1) lookup[chars[i]] = i;

    function val(ch) {
      if (ch === undefined || ch === "") return 0;
      if (!Object.prototype.hasOwnProperty.call(lookup, ch)) throw new Error("bad base64url");
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
        out += String.fromCharCode(((b & 15) << 12) | ((b2 & 63) << 6) | (b3 & 63));
      }
    }
    return out;
  }

  function readPresetValues() {
    if (cachedValues) return cachedValues;

    var root = getRootPanel();
    if (!root || !root.FindChildTraverse) return null;

    var store = null;
    try {
      store = root.FindChildTraverse(STORE_ID);
    } catch (e0) {}
    if (!store) return null;

    var entries = [];
    try {
      if (store.FindChildrenWithClassTraverse) {
        entries = store.FindChildrenWithClassTraverse(ENTRY_CLASS) || [];
      }
    } catch (e1) {}

    for (var i = 0; i < entries.length; i += 1) {
      try {
        var encoded = readLabelText(entries[i]);
        if (!encoded) continue;
        var preset = JSON.parse(decodeBase64Url(encoded));
        if (!preset || preset.version !== 1 || !preset.values || typeof preset.values !== "object") continue;
        cachedValues = preset.values;
        return cachedValues;
      } catch (e2) {}
    }
    return null;
  }

  function writeSharedSnapshot(values) {
    try {
      if (typeof GameUI === "undefined" || !GameUI || !GameUI.CustomUIConfig) return;
      GameUI.CustomUIConfig()[SHARED_CFG_RAW_KEY] = JSON.stringify(values || {});
    } catch (e) {}
  }

  function dispatchOne(settingId, value, source) {
    try {
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_UPDATE",
        mod_title: TITLE,
        setting_id: settingId,
        value: value,
        update_source: source || "bridge_bootstrap",
        skip_bridge_persist: true,
        force_emit: true
      }));
      return true;
    } catch (e) {}
    return false;
  }

  function dispatchValues(values, source) {
    if (!values) return false;
    try {
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "ANITA_BULK_UPDATE",
        mod_title: TITLE,
        values: values,
        update_source: source || "bridge_bootstrap",
        skip_bridge_persist: true,
        force_emit: true
      }));
    } catch (e) {}

    var emittedAny = false;
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      if (dispatchOne(key, values[key], source)) emittedAny = true;
    }
    return emittedAny;
  }

  function emitPreset(source) {
    var values = readPresetValues();
    if (!values) return false;
    writeSharedSnapshot(values);
    return dispatchValues(values, source || "bridge_bootstrap");
  }

  function scheduleEmit(delay, source) {
    try {
      $.Schedule(delay, function () {
        emitPreset(source);
      });
    } catch (e) {}
  }

  try {
    $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
      try {
        if (typeof payload === "string" && payload.indexOf("ANITA_REQUEST_BOOTSTRAP") === -1) return;
        var data = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (!data || data.magic_word !== "ANITA_REQUEST_BOOTSTRAP" || data.mod_title !== TITLE) return;
        emitPreset("bridge_bootstrap");
      } catch (e) {}
    });
  } catch (e) {}

  emitPreset("bridge_bootstrap");
  for (var delayIndex = 0; delayIndex < retryDelays.length; delayIndex += 1) {
    scheduleEmit(retryDelays[delayIndex], delayIndex < 3 ? "bridge_bootstrap" : "core_auto_resync");
  }
})();
