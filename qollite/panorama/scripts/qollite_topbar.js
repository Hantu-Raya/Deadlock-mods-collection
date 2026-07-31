(function () {
  "use strict";

  var qolLite = GameUI.CustomUIConfig().QolLite;
  var runtime = qolLite.Runtime;
  var owner = "qollite_topbar";
  var active = false;
  var generation = 0;
  var root = null;
  var statusPanel = null;
  var matchState = { gameTime: null, label: "Spawn" };

  function hasClass(panel, name) {
    try {
      return !!panel && panel.BHasClass(name);
    } catch (error) {
      return false;
    }
  }

  function setClass(panel, name, enabled) {
    if (!panel) {
      return;
    }
    runtime.setClass(panel, name, enabled);
  }

  function readGameTime() {
    try {
      var value = Game.GetGameTime();
      return typeof value === "number" && isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function reduceGameTime(previous, nextTime) {
    var next = typeof nextTime === "number" && isFinite(nextTime) ? nextTime : null;
    if (next === null) {
      return previous;
    }

    var rewound = previous.gameTime !== null &&
      ((previous.gameTime === 700 && next === 1) || next < previous.gameTime - 5);
    return {
      gameTime: next,
      label: rewound ? "Spawn" : previous.label
    };
  }

  function readNativeText(panel) {
    if (!panel) {
      return "";
    }

    try {
      if (typeof panel.text === "string" && panel.text.trim()) {
        return panel.text.trim();
      }
    } catch (error) {
      return "";
    }

    try {
      var childCount = panel.GetChildCount();
      for (var index = 0; index < childCount; index += 1) {
        var text = readNativeText(panel.GetChild(index));
        if (text) {
          return text;
        }
      }
    } catch (error) {
      return "";
    }

    return "";
  }

  function findPanel(id, scope) {
    try {
      return runtime.find(id, scope);
    } catch (error) {
      return null;
    }
  }

  function findRoot() {
    var anchor = findPanel("ObjectivesMap");
    if (!anchor) {
      return null;
    }

    try {
      return anchor.GetParent();
    } catch (error) {
      return null;
    }
  }

  function ensureStatusPanel() {
    if (statusPanel) {
      return statusPanel;
    }

    var anchor = findPanel("ObjectivesMap", root);
    if (!anchor || !root) {
      return null;
    }

    try {
      statusPanel = $.CreatePanel("Label", root, "QolLiteObjectiveStatus");
      setClass(statusPanel, "QolLiteObjectiveStatus", true);
    } catch (error) {
      statusPanel = null;
    }
    return statusPanel;
  }

  function renderStatus() {
    var panel = ensureStatusPanel();
    if (!panel) {
      return;
    }

    var captureText = readNativeText(findPanel("KothCashInMeter", root));
    var rejuvenatorText = readNativeText(findPanel("RejuvenatorCharges", root));
    var parts = [];
    if (captureText) {
      parts.push("Capture: " + captureText);
    }
    if (rejuvenatorText) {
      parts.push("Rejuvenator: " + rejuvenatorText);
    }

    var text = parts.join(" | ");
    try {
      if (panel.text !== text) {
        panel.text = text;
      }
      panel.visible = text.length > 0;
    } catch (error) {
      statusPanel = null;
    }
  }

  function renderVisibilityClasses() {
    setClass(root, "QolLiteTopbarHideout", hasClass(root, "gHideout") || hasClass(root, "Hideout"));
    setClass(root, "QolLiteTopbarWaitingForHudUpdate", hasClass(root, "WaitingForHudUpdate"));
  }

  function scheduleRefresh(expectedGeneration) {
    runtime.schedule(owner, 0.2, function () {
      if (!active || generation !== expectedGeneration) {
        return;
      }
      refresh();
      scheduleRefresh(expectedGeneration);
    });
  }

  function init() {
    if (active) {
      destroy();
    }

    root = findRoot();
    if (!root) {
      return;
    }

    active = true;
    generation += 1;
    matchState = { gameTime: null, label: "Spawn" };
    refresh();
    scheduleRefresh(generation);
  }

  function refresh() {
    if (!active || !root) {
      return;
    }

    matchState = reduceGameTime(matchState, readGameTime());
    renderVisibilityClasses();
    renderStatus();
  }

  function destroy() {
    if (!active && !statusPanel) {
      return;
    }

    active = false;
    generation += 1;
    runtime.cancel(owner);
    if (statusPanel) {
      try {
        statusPanel.DeleteAsync(0);
      } catch (error) {
        // Panel may already have been destroyed with the HUD.
      }
    }
    statusPanel = null;
    root = null;
  }

  var feature = {
    init: init,
    refresh: refresh,
    destroy: destroy,
    reduceGameTime: reduceGameTime
  };

  qolLite.topbar = feature;
  runtime.register("topbar", feature);
}());
