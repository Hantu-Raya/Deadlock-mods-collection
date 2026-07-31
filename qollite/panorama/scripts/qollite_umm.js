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

  var protocol = 1;
  var hasOwn = Object.prototype.hasOwnProperty;
  var registry = namespace.UMMRegistry;
  if (!registry || typeof registry !== "object") {
    registry = {};
    namespace.UMMRegistry = registry;
  }
  if (!registry.modules || typeof registry.modules !== "object") registry.modules = {};
  if (typeof registry.ownerSequence !== "number") registry.ownerSequence = 0;
  registry.ownerSequence += 1;
  var owner = "qollite_umm_" + registry.ownerSequence;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function settings() {
    return namespace.Settings && typeof namespace.Settings.define === "function" ? namespace.Settings : null;
  }

  var localSettings = settings();

  function register(id, settingsSpec) {
    if (typeof id !== "string" || !id || !isRecord(settingsSpec) || !localSettings) return false;
    var existing = registry.modules[id];
    if (existing && existing.owner === owner) return false;
    if (!localSettings.define(id, settingsSpec)) return false;
    registry.modules[id] = {
      settings: localSettings,
      spec: settingsSpec,
      owner: owner
    };
    return true;
  }

  function dispatch(message) {
    try {
      if (typeof $ !== "undefined" && $.DispatchEvent) {
        $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(message));
      }
    } catch (error) {}
  }

  function announce(id) {
    if (typeof id !== "undefined") {
      if (typeof id !== "string" || !id || !hasOwn.call(registry.modules, id)) return null;
      var module = registry.modules[id];
      if (module.owner !== owner) return null;
      var message = {
        umm: protocol,
        t: "register",
        id: id,
        v: module.spec
      };
      dispatch(message);
      return message;
    }
    var announcements = [];
    for (var name in registry.modules) {
      if (hasOwn.call(registry.modules, name) && registry.modules[name].owner === owner) {
        announcements.push(announce(name));
      }
    }
    return announcements;
  }

  function parse(raw) {
    var message = raw;
    try {
      if (typeof raw === "string") message = JSON.parse(raw);
    } catch (error) {
      return null;
    }
    return isRecord(message) ? message : null;
  }

  function validMessage(message, type) {
    return !!message && message.umm === protocol && message.t === type;
  }

  function handle(raw) {
    var message = parse(raw);
    if (!message || message.umm !== protocol || typeof message.t !== "string") return null;
    if (message.t === "register") return null;
    if (message.t === "hello") {
      if (!validMessage(message, "hello")) return null;
      if (hasOwn.call(message, "id") || hasOwn.call(message, "key") || hasOwn.call(message, "v")) return null;
      return announce();
    }
    if (message.t === "set") {
      if (!validMessage(message, "set") || typeof message.id !== "string" || !message.id) return false;
      if (typeof message.key !== "string" || !message.key || !hasOwn.call(message, "v")) return false;
      var module = registry.modules[message.id];
      if (!module || !module.settings || typeof module.settings.get !== "function" || typeof module.settings.set !== "function") return false;
      var current = module.settings.get(message.id, message.key);
      if (typeof current === "undefined" || typeof current !== typeof message.v) return false;
      if (Array.isArray(current) !== Array.isArray(message.v)) return false;
      if (current !== null && typeof current === "object" && !isRecord(message.v) && !Array.isArray(message.v)) return false;
      return module.settings.set(message.id, message.key, message.v);
    }
    return null;
  }

  function receive(raw) {
    var message = parse(raw);
    if (validMessage(message, "hello")) return announce();
    if (validMessage(message, "set")) {
      var module = registry.modules[message.id];
      if (module && module.owner === owner && typeof registry.handle === "function") {
        return registry.handle(raw);
      }
      return null;
    }
    if (typeof registry.handle === "function") return registry.handle(raw);
    return null;
  }

  registry.handle = handle;
  try {
    if (typeof $ !== "undefined" && $.RegisterForUnhandledEvent) {
      $.RegisterForUnhandledEvent("ClientUI_FireOutput", receive);
    }
  } catch (error) {}

  namespace.UMM = {
    register: register,
    announce: announce,
    handle: handle
  };
}());
