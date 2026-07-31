(function () {
  "use strict";

  if (typeof GameUI === "undefined" || !GameUI.CustomUIConfig) return;

  var config;
  try {
    config = GameUI.CustomUIConfig();
  } catch (error) {
    return;
  }
  if (!config) return;

  var namespace = config.QolLite;
  if (!namespace || typeof namespace !== "object") {
    namespace = {};
    config.QolLite = namespace;
  }

  var version = 1;
  var key = "qollite.storage";
  var entries = null;
  var hasOwn = Object.prototype.hasOwnProperty;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function copyValue(value) {
    if (value === null || typeof value !== "object") return value;
    var result;
    var index;
    var child;
    if (Array.isArray(value)) {
      result = [];
      for (index = 0; index < value.length; index += 1) {
        child = copyValue(value[index]);
        if (typeof child === "undefined") return undefined;
        result[index] = child;
      }
      return result;
    }
    if (!isRecord(value)) return undefined;
    result = {};
    for (var name in value) {
      if (!hasOwn.call(value, name)) continue;
      child = copyValue(value[name]);
      if (typeof child === "undefined") return undefined;
      result[name] = child;
    }
    return result;
  }

  function ensureLoaded() {
    if (entries) return;
    entries = {};
    var raw;
    try {
      raw = config[key];
      if (typeof raw === "string") raw = JSON.parse(raw);
    } catch (error) {
      return;
    }
    if (!isRecord(raw) || raw.version !== version || !isRecord(raw.entries)) return;
    var copied = copyValue(raw.entries);
    if (copied) entries = copied;
  }

  function write() {
    var raw;
    try {
      raw = JSON.stringify({
        version: version,
        entries: entries
      });
      config[key] = raw;
      return true;
    } catch (error) {
      return false;
    }
  }

  function load(id) {
    if (typeof id !== "string" || !id) return {};
    ensureLoaded();
    if (!hasOwn.call(entries, id)) return {};
    var value = entries[id];
    if (!isRecord(value)) return {};
    var copy = copyValue(value);
    return copy || {};
  }

  function save(id, state) {
    if (typeof id !== "string" || !id || !isRecord(state)) return false;
    ensureLoaded();
    var copy = copyValue(state);
    if (!copy) return false;
    var previous = entries[id];
    entries[id] = copy;
    if (write()) return true;
    if (typeof previous === "undefined") {
      delete entries[id];
    } else {
      entries[id] = previous;
    }
    return false;
  }

  function remove(id) {
    if (typeof id !== "string" || !id) return false;
    ensureLoaded();
    if (!hasOwn.call(entries, id)) return false;
    var previous = entries[id];
    delete entries[id];
    if (write()) return true;
    entries[id] = previous;
    return false;
  }

  namespace.Storage = {
    load: load,
    save: save,
    remove: remove
  };
}());
