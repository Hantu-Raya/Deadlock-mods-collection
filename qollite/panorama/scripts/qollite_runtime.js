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

  var runtimes = Array.isArray(namespace.Runtimes) ? namespace.Runtimes : [];
  var api;
  var features = {};
  var featureOrder = [];
  var ownerGenerations = {};
  var active = false;
  var generation = 0;

  function isPanel(panel) {
    if (!panel) return false;
    try {
      return !panel.IsValid || panel.IsValid();
    } catch (error) {
      return false;
    }
  }

  function find(id, root) {
    var cursor;
    var found;
    if (typeof id !== "string" || !id) return null;
    if (!root && typeof $ !== "undefined" && $.GetContextPanel) {
      try {
        root = $.GetContextPanel();
      } catch (error) {}
    }
    if (!isPanel(root)) return null;
    cursor = root;
    while (isPanel(cursor)) {
      try {
        if (cursor.id === id) return cursor;
        found = cursor.FindChildTraverse ? cursor.FindChildTraverse(id) : null;
        if (isPanel(found)) return found;
        cursor = cursor.GetParent ? cursor.GetParent() : null;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function setClass(panel, name, on) {
    if (!isPanel(panel) || typeof name !== "string" || !name) return false;
    var wanted = !!on;
    try {
      if (!panel.SetHasClass) return false;
      if (panel.BHasClass && panel.BHasClass(name) === wanted) return false;
      panel.SetHasClass(name, wanted);
      return true;
    } catch (error) {
      return false;
    }
  }

  function setStyle(panel, key, value) {
    if (!isPanel(panel) || typeof key !== "string" || !key) return false;
    try {
      if (!panel.style || panel.style[key] === value) return false;
      panel.style[key] = value;
      return true;
    } catch (error) {
      return false;
    }
  }

  function ownerKey(owner) {
    return typeof owner === "string" && owner ? "$" + owner : "";
  }

  function cancel(owner) {
    var key = ownerKey(owner);
    if (!key) return false;
    ownerGenerations[key] = (ownerGenerations[key] || 0) + 1;
    return true;
  }

  function schedule(owner, delay, callback) {
    var key = ownerKey(owner);
    if (!active || !key || typeof callback !== "function") return null;
    if (typeof $ === "undefined" || !$.Schedule) return null;
    var ownerGeneration = ownerGenerations[key] || 0;
    var runtimeGeneration = generation;
    var seconds = Number(delay);
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    try {
      return $.Schedule(seconds, function () {
        if (!active || runtimeGeneration !== generation) return;
        if ((ownerGenerations[key] || 0) !== ownerGeneration) return;
        callback();
      });
    } catch (error) {
      return null;
    }
  }

  function run(record, method) {
    if (!record || !record.feature || typeof record.feature[method] !== "function") return;
    try {
      record.feature[method]();
    } catch (error) {}
  }

  function initialize(name) {
    var record = features[name];
    if (!record || record.initialized) return false;
    record.initialized = true;
    run(record, "init");
    return true;
  }

  function register(name, feature) {
    if (typeof name !== "string" || !name || features[name]) return false;
    if (!feature || typeof feature.init !== "function") return false;
    features[name] = {
      feature: feature,
      initialized: false
    };
    featureOrder.push(name);
    if (active) initialize(name);
    return true;
  }

  function init(name) {
    if (typeof name !== "undefined") {
      if (typeof name !== "string" || !name) return false;
      if (!active) {
        active = true;
        generation += 1;
      }
      return initialize(name);
    }
    if (active) return false;
    active = true;
    generation += 1;
    var changed = false;
    for (var index = 0; index < featureOrder.length; index += 1) {
      changed = initialize(featureOrder[index]) || changed;
    }
    return changed;
  }

  function refresh(name) {
    if (!active) return false;
    if (typeof name !== "undefined") {
      if (typeof name !== "string" || !features[name] || !features[name].initialized) return false;
      run(features[name], "refresh");
      return true;
    }
    for (var index = 0; index < featureOrder.length; index += 1) {
      if (features[featureOrder[index]].initialized) run(features[featureOrder[index]], "refresh");
    }
    return true;
  }

  function destroy(name) {
    if (typeof name !== "undefined") {
      if (typeof name !== "string" || !features[name] || !features[name].initialized) return false;
      cancel(name);
      run(features[name], "destroy");
      features[name].initialized = false;
      cancel(name);
      return true;
    }
    generation += 1;
    if (!active) return false;
    active = false;
    for (var index = featureOrder.length - 1; index >= 0; index -= 1) {
      var record = features[featureOrder[index]];
      if (!record.initialized) continue;
      cancel(featureOrder[index]);
      run(record, "destroy");
      record.initialized = false;
    }
    return true;
  }

  api = {
    find: find,
    setClass: setClass,
    setStyle: setStyle,
    schedule: schedule,
    cancel: cancel,
    register: register,
    init: init,
    refresh: refresh,
    destroy: destroy
  };
  runtimes.push(api);
  namespace.Runtimes = runtimes;
  namespace.Runtime = api;
  namespace.refreshAll = function () {
    for (var index = 0; index < runtimes.length; index += 1) {
      runtimes[index].refresh();
    }
  };
  namespace.destroyAll = function () {
    for (var index = runtimes.length - 1; index >= 0; index -= 1) {
      runtimes[index].destroy();
    }
  };
}());
