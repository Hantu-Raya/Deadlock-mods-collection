(function () {
  "use strict";

  var SCAN_INTERVAL_SEC = 1;
  var MAX_SCAN_DEPTH = 12;
  var MAX_SCAN_PANELS = 512;

  var context = $.GetContextPanel();
  var probeId =
    "probe_" +
    String(Date.now ? Date.now() : +new Date()) +
    "_" +
    String(Math.floor(Math.random() * 1000000000));
  var nextBarSequence = 1;
  var bars = [];
  var didLogInitialScan = false;

  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (error) {
      return false;
    }
  }

  function panelId(panel) {
    try {
      return String(panel && panel.id ? panel.id : "");
    } catch (error) {
      return "";
    }
  }

  function children(panel) {
    try {
      return panel && panel.Children ? panel.Children() || [] : [];
    } catch (error) {
      return [];
    }
  }

  function findWithin(panel, id) {
    try {
      return panel && panel.FindChildTraverse ? panel.FindChildTraverse(id) : null;
    } catch (error) {
      return null;
    }
  }

  function findAncestor(panel, id) {
    var current = panel;
    for (var depth = 0; current && depth < 5; depth++) {
      if (panelId(current) === id) return current;
      try {
        current = current.GetParent ? current.GetParent() : null;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function collectActiveParents() {
    var matches = [];
    var stack = [{ panel: context, depth: 0 }];
    var visited = 0;

    while (stack.length && visited < MAX_SCAN_PANELS) {
      var entry = stack.pop();
      var panel = entry.panel;
      visited += 1;
      if (!isValid(panel)) continue;
      if (panelId(panel) === "unit_healthbar_active_parent") matches.push(panel);
      if (entry.depth >= MAX_SCAN_DEPTH) continue;

      var panelChildren = children(panel);
      for (var i = panelChildren.length - 1; i >= 0; i--) {
        stack.push({ panel: panelChildren[i], depth: entry.depth + 1 });
      }
    }
    return matches;
  }

  function resolveParts(activeParent) {
    var container = findAncestor(activeParent, "UnitHealthbarContainer");
    return {
      activeParent: activeParent,
      background: findWithin(container, "unit_healthbar_bg"),
      fill: findWithin(activeParent, "unit_healthbar_lagging"),
      healing: findWithin(activeParent, "unit_healthbar_healing"),
      delta: findWithin(activeParent, "unit_healthbar_delta"),
      bulletShield: findWithin(activeParent, "unit_healthbar_bullet_shield"),
      techShield: findWithin(activeParent, "unit_healthbar_tech_shield"),
      pipLabel: findWithin(activeParent, "unit_healthbar_pip_label"),
    };
  }

  function sameParts(left, right) {
    for (var key in left) {
      if (Object.prototype.hasOwnProperty.call(left, key) && left[key] !== right[key]) {
        return false;
      }
    }
    return true;
  }

  function findBarByParent(activeParent) {
    for (var i = 0; i < bars.length; i++) {
      if (bars[i].parts.activeParent === activeParent) return bars[i];
    }
    return null;
  }

  function isComplete(parts) {
    return (
      isValid(parts.activeParent) &&
      isValid(parts.background) &&
      isValid(parts.fill)
    );
  }

  function readPanelWidth(panel) {
    try {
      return Math.max(0, Math.round(Number(panel.actuallayoutwidth) || 0));
    } catch (error) {
      return 0;
    }
  }

  function readPipText(panel) {
    try {
      if (typeof panel.text === "string") return panel.text;
      if (panel.GetAttributeString)
        return String(panel.GetAttributeString("text", "") || "");
    } catch (error) {}
    return "";
  }

  function reportData(bar) {
    if (!isComplete(bar.parts)) return;
    var fillWidth = readPanelWidth(bar.parts.fill);
    var parentWidth = readPanelWidth(bar.parts.activeParent);
    if (parentWidth <= 0) return;

    var widthPercent = Math.max(
      0,
      Math.min(100, Math.round((fillWidth * 100) / parentWidth)),
    );
    var pipText = readPipText(bar.parts.pipLabel);
    var signature = pipText + "|" + widthPercent;
    if (signature === bar.lastDataSignature) return;
    bar.lastDataSignature = signature;

    $.Msg(
      "[HP Colors Rewrite] data id=" +
        bar.instanceId +
        " generation=" +
        bar.generation +
        " pip=" +
        JSON.stringify(pipText) +
        " fill=" +
        fillWidth +
        " parent=" +
        parentWidth +
        " width_percent=" +
        widthPercent,
    );
  }


  function addBar(parts) {
    var bar = {
      instanceId: probeId + "_bar_" + nextBarSequence,
      generation: 1,
      lastDataSignature: "",
      seen: true,
      parts: parts,
    };
    nextBarSequence += 1;
    bars.push(bar);
    reportData(bar);
  }

  function reconcileBars() {
    for (var i = 0; i < bars.length; i++) bars[i].seen = false;

    var activeParents = collectActiveParents();
    for (var j = 0; j < activeParents.length; j++) {
      var activeParent = activeParents[j];
      var nextParts = resolveParts(activeParent);
      var bar = findBarByParent(activeParent);
      if (!bar) {
        addBar(nextParts);
        continue;
      }

      bar.seen = true;
      if (!sameParts(bar.parts, nextParts)) {
        bar.parts = nextParts;
        bar.generation += 1;
        bar.lastDataSignature = "";
      }
      reportData(bar);
    }

    for (var index = bars.length - 1; index >= 0; index--) {
      if (bars[index].seen) continue;
      bars.splice(index, 1);
    }
  }

  function scan() {
    if (!isValid(context)) return;

    reconcileBars();
    if (!didLogInitialScan) {
      didLogInitialScan = true;
      $.Msg(
        "[HP Colors Rewrite] probe ready id=" +
          probeId +
          " bars=" +
          bars.length,
      );
    }
    $.Schedule(SCAN_INTERVAL_SEC, scan);
  }

  scan();
})();
