(function () {
  "use strict";

  if (typeof GameUI === "undefined" || !GameUI.CustomUIConfig) return;
  var qolLite = GameUI.CustomUIConfig().QolLite;
  if (!qolLite || !qolLite.Runtime || !qolLite.Settings || !qolLite.UMM) {
    return;
  }

  var Runtime = qolLite.Runtime;
  var Settings = qolLite.Settings;
  var UMM = qolLite.UMM;
  var SETTING_ID = "recent_purchases";
  var SCHEDULE_OWNER = "QolLiteRecentPurchases";
  var ROW_CLASS = "QolLiteRecentPurchase";
  var HERO_CLASS = "QolLiteRecentPurchaseHasHero";
  var HERO_ID = "QolLiteRecentPurchaseHero";
  var initialized = false;
  var active = false;
  var generation = 0;
  var settingsRegistered = false;
  var unsubscribe = null;
  var decoratedRows = [];
  var seenRows = typeof WeakSet === "function" ? new WeakSet() : [];

  function normalizeState(state) {
    if (!state || typeof state.enabled !== "boolean") {
      return null;
    }
    return { enabled: state.enabled };
  }

  function rememberRow(row) {
    if (typeof seenRows.add === "function") {
      seenRows.add(row);
    } else {
      seenRows.push(row);
    }
  }

  function hasSeenRow(row) {
    if (typeof seenRows.has === "function") {
      return seenRows.has(row);
    }
    return seenRows.indexOf(row) !== -1;
  }

  function findChild(panel, id) {
    try {
      return panel && typeof panel.FindChildTraverse === "function" ? panel.FindChildTraverse(id) : null;
    } catch (error) {
      return null;
    }
  }

  function findRows(panel) {
    try {
      return panel && typeof panel.FindChildrenWithClassTraverse === "function" ?
        panel.FindChildrenWithClassTraverse("recentPurchase") : [];
    } catch (error) {
      return [];
    }
  }

  function getContextContainer() {
    var panel;
    try {
      panel = $.GetContextPanel();
    } catch (error) {
      return null;
    }

    while (panel) {
      var container = findChild(panel, "RecentPurchasesContainer");
      if (container) {
        return container;
      }
      try {
        panel = typeof panel.GetParent === "function" ? panel.GetParent() : null;
      } catch (error) {
        panel = null;
      }
    }
    return null;
  }

  function readHeroIdentity(stockHero) {
    var names = ["hero", "hero_id", "heroname"];
    var index;
    for (index = 0; index < names.length; index += 1) {
      try {
        var value = stockHero.GetAttributeString(names[index], "");
        if (typeof value === "string" && value.length > 0) {
          return { name: names[index], value: value };
        }
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function setClass(panel, className, enabled) {
    try {
      Runtime.setClass(panel, className, enabled);
    } catch (error) {
      // Invalidated Valve panels are ignored until the next refresh.
    }
  }

  function removeOwnedRow(row) {
    var ownedHero = findChild(row, HERO_ID);
    if (ownedHero) {
      try {
        ownedHero.DeleteAsync(0);
      } catch (error) {
        // The stock row was removed by Valve first.
      }
    }
    setClass(row, ROW_CLASS, false);
    setClass(row, HERO_CLASS, false);
  }

  function removeOwnedRows() {
    var index;
    for (index = 0; index < decoratedRows.length; index += 1) {
      removeOwnedRow(decoratedRows[index]);
    }
    decoratedRows = [];
  }

  function decorateRow(row) {
    if (hasSeenRow(row)) {
      return;
    }

    var stockHero = findChild(row, "RecentPurchaseHeroImage");
    var identity = stockHero ? readHeroIdentity(stockHero) : null;
    if (!identity) {
      return;
    }

    var hero;
    try {
      hero = $.CreatePanel("CitadelHeroImage", row, HERO_ID);
      hero.SetAttributeString(identity.name, identity.value);
      hero.SetAttributeString("heroimagestyle", "small");
    } catch (error) {
      return;
    }

    setClass(row, ROW_CLASS, true);
    setClass(row, HERO_CLASS, true);
    decoratedRows.push(row);
    rememberRow(row);
  }

  function scanRows() {
    var container = getContextContainer();
    var rows = findRows(container);
    var index;
    for (index = 0; index < rows.length; index += 1) {
      decorateRow(rows[index]);
    }
  }

  function cancelWork() {
    try {
      Runtime.cancel(SCHEDULE_OWNER);
    } catch (error) {
      // The runtime may already have discarded this owner.
    }
  }

  function scheduleRefresh() {
    if (!active) {
      return;
    }

    cancelWork();
    var callbackGeneration = generation;
    try {
      Runtime.schedule(SCHEDULE_OWNER, 0.25, function () {
        if (!active || callbackGeneration !== generation) {
          return;
        }
        scanRows();
        scheduleRefresh();
      });
    } catch (error) {
      // Scheduling is optional while Panorama is tearing down.
    }
  }

  function enable() {
    if (active) {
      return;
    }
    active = true;
    generation += 1;
    scanRows();
    scheduleRefresh();
  }

  function disable() {
    generation += 1;
    active = false;
    cancelWork();
    removeOwnedRows();
  }

  function onSettingsChanged(state) {
    if (state && state.enabled === true) {
      enable();
    } else if (state && state.enabled === false) {
      disable();
    }
  }

  function ensureSettings() {
    if (!settingsRegistered) {
      UMM.register(SETTING_ID, {
        defaults: { enabled: true },
        normalize: normalizeState
      });
      UMM.announce(SETTING_ID);
      settingsRegistered = true;
    }
    if (!unsubscribe) {
      unsubscribe = Settings.subscribe(SETTING_ID, onSettingsChanged);
    }
  }

  var feature = {
    init: function () {
      ensureSettings();
      initialized = true;
      onSettingsChanged(Settings.get(SETTING_ID));
    },

    refresh: function () {
      if (!initialized || !active) {
        return;
      }
      scanRows();
      scheduleRefresh();
    },

    destroy: function () {
      initialized = false;
      disable();
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
      unsubscribe = null;
    }
  };

  Runtime.register("recentPurchases", feature);
}());
