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

  var definitions = {};
  var states = {};
  var subscribers = {};
  var hasOwn = Object.prototype.hasOwnProperty;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function copyValue(value) {
    if (value === null || typeof value !== "object") return value;
    var result;
    var index;
    var key;
    if (Array.isArray(value)) {
      result = [];
      for (index = 0; index < value.length; index += 1) {
        result[index] = copyValue(value[index]);
      }
      return result;
    }
    if (!isRecord(value)) return undefined;
    result = {};
    for (key in value) {
      if (hasOwn.call(value, key)) result[key] = copyValue(value[key]);
    }
    return result;
  }

  function freeze(value) {
    if (value === null || typeof value !== "object") return value;
    var key;
    for (key in value) {
      if (hasOwn.call(value, key)) freeze(value[key]);
    }
    if (Object.freeze) {
      try {
        Object.freeze(value);
      } catch (error) {}
    }
    return value;
  }

  function immutableCopy(value) {
    var copy = copyValue(value);
    return typeof copy === "undefined" ? undefined : freeze(copy);
  }

  function sameValue(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    var key;
    var count = 0;
    for (key in left) {
      if (!hasOwn.call(left, key)) continue;
      if (!hasOwn.call(right, key) || !sameValue(left[key], right[key])) return false;
      count += 1;
    }
    for (key in right) {
      if (hasOwn.call(right, key)) count -= 1;
    }
    return count === 0;
  }

  function sameShape(defaults, candidate) {
    if (!isRecord(candidate)) return false;
    var key;
    for (key in defaults) {
      if (!hasOwn.call(defaults, key) || !hasOwn.call(candidate, key)) return false;
      if (typeof defaults[key] !== typeof candidate[key]) return false;
      if (Array.isArray(defaults[key]) !== Array.isArray(candidate[key])) return false;
    }
    for (key in candidate) {
      if (hasOwn.call(candidate, key) && !hasOwn.call(defaults, key)) return false;
    }
    return true;
  }

  function normalize(definition, candidate) {
    var normalized = candidate;
    try {
      if (definition.normalize) normalized = definition.normalize(candidate, definition.defaults);
    } catch (error) {
      return null;
    }
    if (!sameShape(definition.defaults, normalized)) return null;
    return immutableCopy(normalized);
  }

  function storage() {
    return namespace.Storage && typeof namespace.Storage.load === "function" ? namespace.Storage : null;
  }

  function save(id) {
    var adapter = storage();
    if (!adapter || typeof adapter.save !== "function") return false;
    return adapter.save(id, states[id]);
  }

  function notify(id, previous) {
    var list = subscribers[id];
    if (!list || !list.length) return;
    var state = states[id];
    for (var index = 0; index < list.length; index += 1) {
      try {
        list[index](state, previous);
      } catch (error) {}
    }
  }

  function define(id, specification) {
    if (typeof id !== "string" || !id || definitions[id] || !isRecord(specification)) return false;
    if (!hasOwn.call(specification, "defaults") || !isRecord(specification.defaults)) return false;
    if (typeof specification.normalize !== "undefined" && typeof specification.normalize !== "function") return false;
    var defaults = immutableCopy(specification.defaults);
    if (!defaults) return false;
    var definition = {
      defaults: defaults,
      normalize: specification.normalize || null
    };
    var stored = null;
    var adapter = storage();
    if (adapter) {
      try {
        stored = adapter.load(id);
      } catch (error) {}
    }
    var state = normalize(definition, stored);
    if (!state) state = defaults;
    definitions[id] = definition;
    states[id] = state;
    return true;
  }

  function get(id, key) {
    if (typeof id !== "string" || !definitions[id]) return undefined;
    if (typeof key === "undefined") return states[id];
    if (typeof key !== "string" || !hasOwn.call(states[id], key)) return undefined;
    return states[id][key];
  }

  function update(id, candidate) {
    var definition = definitions[id];
    if (!definition) return false;
    var state = normalize(definition, candidate);
    if (!state || sameValue(states[id], state)) return false;
    var previous = states[id];
    states[id] = state;
    save(id);
    notify(id, previous);
    return true;
  }

  function set(id, key, value) {
    if (typeof id !== "string" || !definitions[id] || typeof key !== "string") return false;
    if (!hasOwn.call(definitions[id].defaults, key)) return false;
    var candidate = copyValue(states[id]);
    if (!candidate) return false;
    candidate[key] = value;
    return update(id, candidate);
  }

  function patch(id, values) {
    if (typeof id !== "string" || !definitions[id] || !isRecord(values)) return false;
    var candidate = copyValue(states[id]);
    var key;
    for (key in values) {
      if (!hasOwn.call(values, key)) continue;
      if (!hasOwn.call(definitions[id].defaults, key)) return false;
      candidate[key] = values[key];
    }
    return update(id, candidate);
  }

  function reset(id) {
    if (typeof id !== "string" || !definitions[id]) return false;
    return update(id, definitions[id].defaults);
  }

  function subscribe(id, callback) {
    if (typeof id !== "string" || !definitions[id] || typeof callback !== "function") return null;
    var list = subscribers[id];
    if (!list) {
      list = [];
      subscribers[id] = list;
    }
    list.push(callback);
    var removed = false;
    return function () {
      if (removed) return;
      removed = true;
      for (var index = 0; index < list.length; index += 1) {
        if (list[index] !== callback) continue;
        list.splice(index, 1);
        break;
      }
    };
  }

  namespace.Settings = {
    define: define,
    get: get,
    set: set,
    patch: patch,
    reset: reset,
    subscribe: subscribe
  };
}());
