'use strict';
(function () {
  "use strict";

  var STORE_ID = "HPColorsPresetStore";
  var ENTRY_CLASS = "hp_colors_preset_entry";
  var SHARED_CFG_RAW_KEY = "__hpColorsCfgRaw";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var SNAPSHOT_MAGIC = "HP_COLORS_PRESET_SNAPSHOT";
  var REQUEST_MAGIC = "HP_COLORS_PRESET_REQUEST";
  var PUBLISH_RETRY_DELAYS = [0.1, 0.5, 1.0, 2.5, 5.0, 8.0];
  var CACHED_SNAPSHOT_REPLAY_SEC = 1.0;
  var CACHED_SNAPSHOT_REPLAY_LIMIT = 8;
  var cachedRootPanel = null;
  var cachedStorePanel = null;
  var cachedValues = null;
  var lastPublishedRaw = "";
  var cachedSnapshotPayload = "";
  var sharedSnapshotWritten = false;
  var cachedReplayStarted = false;
  var cachedReplayCount = 0;

  function isValidPanel(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (e) {}
    return false;
  }

  function getRootPanel() {
    if (isValidPanel(cachedRootPanel)) return cachedRootPanel;
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    cachedRootPanel = panel || null;
    return cachedRootPanel;
  }

  function getSharedStore() {
    try {
      if (typeof GameUI !== "undefined" && GameUI && GameUI.CustomUIConfig) return GameUI.CustomUIConfig();
    } catch (e) {}
    return null;
  }

  function dispatchSnapshot(payload) {
    try {
      $.DispatchEvent(EVENT_CHANNEL, payload);
      return true;
    } catch (e) {}
    return false;
  }

  function writeSharedSnapshot(raw) {
    var store = getSharedStore();
    if (!store || !raw) return false;
    try {
      if (store[SHARED_CFG_RAW_KEY] !== raw) {
        store[SHARED_CFG_RAW_KEY] = raw;
      }
      sharedSnapshotWritten = true;
      return true;
    } catch (e) {}
    return false;
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

    var store = isValidPanel(cachedStorePanel) ? cachedStorePanel : null;
    if (!store) {
      try {
        store = root.FindChildTraverse(STORE_ID);
      } catch (e0) {}
      cachedStorePanel = isValidPanel(store) ? store : null;
    }
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

  function capturePreset() {
    if (cachedSnapshotPayload) return true;

    var values = readPresetValues();
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
        update_source: "builder_static"
      });
    } catch (ePayload) {
      cachedSnapshotPayload = "";
      return false;
    }
    lastPublishedRaw = raw;
    return true;
  }

  function publishPreset() {
    if (!capturePreset()) return false;
    var sharedOk = sharedSnapshotWritten || writeSharedSnapshot(lastPublishedRaw);
    startCachedSnapshotReplay();
    return dispatchSnapshot(cachedSnapshotPayload) || sharedOk;
  }

  function publishUntilReady() {
    if (cachedSnapshotPayload && sharedSnapshotWritten) return true;
    return publishPreset();
  }

  function replayCachedSnapshot() {
    if (!cachedSnapshotPayload) return;
    dispatchSnapshot(cachedSnapshotPayload);
    cachedReplayCount += 1;
    if (cachedReplayCount >= CACHED_SNAPSHOT_REPLAY_LIMIT) return;
    try {
      $.Schedule(CACHED_SNAPSHOT_REPLAY_SEC, replayCachedSnapshot);
    } catch (e) {}
  }

  function startCachedSnapshotReplay() {
    if (cachedReplayStarted || !cachedSnapshotPayload) return;
    cachedReplayStarted = true;
    cachedReplayCount = 0;
    try {
      $.Schedule(CACHED_SNAPSHOT_REPLAY_SEC, replayCachedSnapshot);
    } catch (e) {}
  }

  function handlePresetRequest(payload) {
    if (typeof payload === "string" && payload.indexOf(REQUEST_MAGIC) === -1) return;
    try {
      var data = typeof payload === "string" ? JSON.parse(payload) : payload;
      if (!data || data.magic_word !== REQUEST_MAGIC) return;
      if (data.mod_title && data.mod_title !== "HP Colors") return;
      if (cachedSnapshotPayload) {
        dispatchSnapshot(cachedSnapshotPayload);
        if (!sharedSnapshotWritten) writeSharedSnapshot(lastPublishedRaw);
        return;
      }
      publishPreset();
    } catch (e) {}
  }

  try {
    $.RegisterForUnhandledEvent(EVENT_CHANNEL, handlePresetRequest);
  } catch (e) {}

  publishUntilReady();
  for (var delayIndex = 0; delayIndex < PUBLISH_RETRY_DELAYS.length; delayIndex += 1) {
    try {
      $.Schedule(PUBLISH_RETRY_DELAYS[delayIndex], publishUntilReady);
    } catch (e) {}
  }
})();
