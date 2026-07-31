(function () {
  'use strict';

  var config = GameUI.CustomUIConfig();
  var QolLite = config && config.QolLite;
  if (!QolLite || !QolLite.Runtime) return;

  var Runtime = QolLite.Runtime;
  var Settings = QolLite.Settings;
  var UMM = QolLite.UMM;
  var FEATURE_ID = 'notifications';
  var ROOT_ID = 'QolLiteNotificationRoot';
  var MAX_VISIBLE = 3;
  var state = {
    generation: 0,
    initialized: false,
    items: [],
    nextSequence: 0,
    root: null,
    renderedRows: [],
    unsubscribe: null,
  };

  function callSafely(callback) {
    try {
      return callback();
    } catch (error) {
      return undefined;
    }
  }

  function readClock() {
    var time = callSafely(function () {
      return Game.GetGameTime();
    });
    return typeof time === 'number' && isFinite(time) ? time : 0;
  }

  function isEnabled() {
    if (!Settings || typeof Settings.get !== 'function') return true;
    return callSafely(function () {
      return Settings.get(FEATURE_ID, 'enabled') !== false;
    }) !== false;
  }

  function compareItems(left, right) {
    if (left.priority !== right.priority) return right.priority - left.priority;
    if (left.expiresAt !== right.expiresAt) return left.expiresAt - right.expiresAt;
    return left.sequence - right.sequence;
  }

  function pruneExpired(now) {
    state.items = state.items.filter(function (item) {
      return item.expiresAt > now;
    });
  }

  function findRoot() {
    var context = callSafely(function () {
      return $.GetContextPanel();
    });
    if (!context) return null;
    return callSafely(function () {
      return Runtime.find(ROOT_ID, context);
    }) || null;
  }

  function ensureRoot() {
    if (state.root) return state.root;
    var context = callSafely(function () {
      return $.GetContextPanel();
    });
    if (!context) return null;

    state.root = findRoot();
    if (!state.root) {
      state.root = callSafely(function () {
        return $.CreatePanel('Panel', context, ROOT_ID);
      }) || null;
    }
    state.renderedRows = [];
    return state.root;
  }

  function setClass(panel, name, enabled) {
    if (!panel) return;
    callSafely(function () {
      Runtime.setClass(panel, name, enabled);
    });
  }

  function cancelRefresh() {
    if (typeof Runtime.cancel !== 'function') return;
    callSafely(function () {
      Runtime.cancel(FEATURE_ID);
    });
  }

  function scheduleRefresh(now) {
    cancelRefresh();
    if (!state.initialized || !state.items.length || typeof Runtime.schedule !== 'function') return;

    var nextExpiry = state.items[0].expiresAt;
    for (var index = 1; index < state.items.length; index += 1) {
      if (state.items[index].expiresAt < nextExpiry) nextExpiry = state.items[index].expiresAt;
    }

    var generation = state.generation;
    callSafely(function () {
      Runtime.schedule(FEATURE_ID, Math.max(0.01, nextExpiry - now), function () {
        if (!state.initialized || state.generation !== generation) return;
        refresh();
      });
    });
  }

  function rowsMatch(items) {
    if (state.renderedRows.length !== items.length) return false;
    for (var index = 0; index < items.length; index += 1) {
      var rendered = state.renderedRows[index];
      var item = items[index];
      if (!rendered || rendered.id !== item.id || rendered.text !== item.text ||
        rendered.expiresAt !== item.expiresAt || rendered.priority !== item.priority ||
        rendered.sequence !== item.sequence) return false;
    }
    return true;
  }

  function renderRows(root, items) {
    if (rowsMatch(items)) return;
    callSafely(function () {
      root.RemoveAndDeleteChildren();
    });
    state.renderedRows = [];
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      var row = callSafely(function () {
        return $.CreatePanel('Panel', root, '');
      });
      if (!row) continue;
      setClass(row, 'QolLiteNotification', true);
      var label = callSafely(function () {
        return $.CreatePanel('Label', row, '');
      });
      if (!label) continue;
      label.text = item.text;
      state.renderedRows.push({
        id: item.id,
        text: item.text,
        expiresAt: item.expiresAt,
        priority: item.priority,
        sequence: item.sequence,
      });
    }
  }

  function refresh() {
    var now = readClock();
    pruneExpired(now);
    scheduleRefresh(now);
    if (!state.initialized) return;

    var root = ensureRoot();
    if (!root) return;
    var enabled = isEnabled();
    setClass(root, 'QolLiteNotificationRoot--disabled', !enabled);
    if (!enabled) {
      if (state.renderedRows.length) {
        callSafely(function () {
          root.RemoveAndDeleteChildren();
        });
        state.renderedRows = [];
      }
      return;
    }

    var ordered = state.items.slice().sort(compareItems);
    renderRows(root, ordered.slice(0, MAX_VISIBLE));
  }

  function validEvent(event, now) {
    return event && typeof event === 'object' &&
      (typeof event.id === 'string' || typeof event.id === 'number') && String(event.id).length > 0 &&
      typeof event.text === 'string' && event.text.length > 0 &&
      typeof event.expiresAt === 'number' && isFinite(event.expiresAt) && event.expiresAt > now &&
      typeof event.priority === 'number' && isFinite(event.priority);
  }

  function push(event) {
    var now = readClock();
    if (!validEvent(event, now)) return false;

    var id = String(event.id);
    var existing = null;
    for (var index = 0; index < state.items.length; index += 1) {
      if (state.items[index].id === id) {
        existing = state.items[index];
        break;
      }
    }

    if (existing) {
      existing.text = event.text;
      existing.expiresAt = event.expiresAt;
      existing.priority = event.priority;
    } else {
      state.items.push({
        id: id,
        text: event.text,
        expiresAt: event.expiresAt,
        priority: event.priority,
        sequence: state.nextSequence,
      });
      state.nextSequence += 1;
    }
    refresh();
    return true;
  }

  function init() {
    if (state.initialized) {
      refresh();
      return;
    }
    state.initialized = true;
    state.generation += 1;
    if (Settings && typeof Settings.subscribe === 'function') {
      state.unsubscribe = callSafely(function () {
        return Settings.subscribe(FEATURE_ID, refresh);
      }) || null;
    }
    refresh();
  }

  function destroy() {
    state.generation += 1;
    state.initialized = false;
    cancelRefresh();
    if (state.unsubscribe) callSafely(state.unsubscribe);
    state.unsubscribe = null;
    if (state.root) {
      callSafely(function () {
        state.root.DeleteAsync(0);
      });
    }
    state.root = null;
    state.items = [];
  }

  var feature = {
    init: init,
    refresh: refresh,
    destroy: destroy,
    push: push,
  };

  if (UMM && typeof UMM.register === 'function') {
    callSafely(function () {
      UMM.register(FEATURE_ID, {
        defaults: { enabled: true },
        normalize: function (settings) {
          return settings && typeof settings.enabled === 'boolean' ? { enabled: settings.enabled } : null;
        },
      });
    });
  }

  QolLite.notifications = feature;
  Runtime.register(FEATURE_ID, feature);
}());
