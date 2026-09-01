(function () {
  "use strict";

  var STABLE_INTERVAL_SEC = 0.25;
  var FAST_INTERVAL_SEC = 0.05;
  var IDLE_INTERVAL_SEC = 1;
  var MAX_FAST_RETRIES = 20;
  var ALLY_ATTR = "hp_colors_v2_ally";
  var SEGMENT_ONE_START_PIPS = 0;
  var SEGMENT_TWO_START_PIPS = 8;
  var SEGMENT_THREE_START_PIPS = 16;
  var SEGMENTS = [
    { className: "maxhp_segment_1", marginRight: "-53.625px" },
    { className: "maxhp_segment_2", marginRight: "-40.21875px" },
    { className: "maxhp_segment_3", marginRight: "244.6875px" }
  ];

  var context = null;
  var unitStatus = null;
  var counterContainer = null;
  var healthbars = null;
  var pipLabel = null;
  var lastSegment = 0;
  var lastPipCount = -1;
  var fastRetries = 0;
  var allyMarginOnly = false;
  var baselineUnitStatus = null;
  var baselineCounterContainer = null;
  var unitStatusMargin = "";
  var counterMargin = "";
  var ownedMargin = null;

  function isValidPanel(panel) {
    try {
      if (!panel) return false;
      if (typeof panel.IsValid === "function") return !!panel.IsValid();
      if (panel.IsValid === undefined) return true;
      return !!panel.IsValid;
    } catch (eValid) {
      return false;
    }
  }
  function isDescendantOf(panel, ancestor) {
    if (!panel || !ancestor) return false;
    var current = panel;
    for (var depth = 0; current && depth < 16; depth += 1) {
      if (current === ancestor) return true;
      if (typeof current.GetParent !== "function") return true;
      try {
        current = current.GetParent();
      } catch (eParent) {
        return false;
      }
    }
    return false;
  }

  function restoreOwnedMargin() {
    if (ownedMargin === null) return;
    try {
      if (
        isValidPanel(baselineUnitStatus) &&
        baselineUnitStatus.style.marginRight === ownedMargin
      ) {
        baselineUnitStatus.style.marginRight = unitStatusMargin;
      }
      if (
        isValidPanel(baselineCounterContainer) &&
        baselineCounterContainer.style.marginRight === ownedMargin
      ) {
        baselineCounterContainer.style.marginRight = counterMargin;
      }
    } catch (eRestore) {}
    ownedMargin = null;
  }

  function captureBaselines() {
    if (
      unitStatus === baselineUnitStatus &&
      counterContainer === baselineCounterContainer
    ) {
      return;
    }
    restoreOwnedMargin();
    baselineUnitStatus = unitStatus;
    baselineCounterContainer = counterContainer;
    try {
      unitStatusMargin = String(unitStatus.style.marginRight || "");
      counterMargin = String(counterContainer.style.marginRight || "");
    } catch (eBaseline) {
      unitStatusMargin = "";
      counterMargin = "";
    }
  }

  function clearPanels(nextContext) {
    restoreOwnedMargin();
    context = nextContext || null;
    unitStatus = null;
    counterContainer = null;
    healthbars = null;
    pipLabel = null;
    baselineUnitStatus = null;
    baselineCounterContainer = null;
    lastSegment = 0;
    lastPipCount = -1;
    fastRetries = 0;
    allyMarginOnly = false;
  }

  function getContext() {
    var nextContext = null;
    try {
      nextContext = $.GetContextPanel();
    } catch (eContext) {
      nextContext = null;
    }
    if (!isValidPanel(nextContext)) {
      clearPanels(null);
      return null;
    }
    if (nextContext !== context) clearPanels(nextContext);
    return context;
  }

  function findPanel(root, id) {
    try {
      return root.FindChildTraverse(id);
    } catch (eFind) {
      return null;
    }
  }
  function readAllyMarker(panel) {
    try {
      return (
        typeof panel.GetAttributeString === "function" &&
        panel.GetAttributeString(ALLY_ATTR, "") === "1"
      );
    } catch (eAttribute) {
      return false;
    }
  }


  function resolvePanels() {
    var root = getContext();
    if (!root) return false;
    if (
      (unitStatus && !isDescendantOf(unitStatus, root)) ||
      (counterContainer && !isDescendantOf(counterContainer, root)) ||
      (healthbars && !isDescendantOf(healthbars, root)) ||
      (pipLabel && !isDescendantOf(pipLabel, healthbars))
    ) {
      clearPanels(root);
    }
    var nextAllyMarginOnly = readAllyMarker(root);
    if (nextAllyMarginOnly !== allyMarginOnly) {
      allyMarginOnly = nextAllyMarginOnly;
      lastSegment = 0;
      lastPipCount = -1;
    }
    if (!isValidPanel(unitStatus)) unitStatus = findPanel(root, "UnitStatus");
    if (!isValidPanel(counterContainer)) {
      counterContainer = findPanel(root, "hp_counter_container");
    }
    if (!isValidPanel(healthbars)) {
      healthbars = findPanel(root, "UnitHealthbarsContainer");
      pipLabel = null;
    }
    if (isValidPanel(healthbars) && !isValidPanel(pipLabel)) {
      pipLabel = findPanel(healthbars, "unit_healthbar_pip_label");
    }
    var ready =
      isValidPanel(unitStatus) &&
      isValidPanel(counterContainer) &&
      isValidPanel(healthbars) &&
      isValidPanel(pipLabel);
    if (ready) captureBaselines();
    return ready;
  }

  function hasClass(panel, className) {
    try {
      return panel.BHasClass(className);
    } catch (eClass) {
      return false;
    }
  }

  function currentSegment() {
    var i;
    for (i = 0; i < SEGMENTS.length; i += 1) {
      if (hasClass(healthbars, SEGMENTS[i].className)) return i + 1;
    }
    return 0;
  }


  function currentPipText() {
    try {
      var text = pipLabel.text === String(pipLabel.text) ? pipLabel.text : "";
      if (text) return text;
      if (typeof pipLabel.GetAttributeString === "function") {
        return String(pipLabel.GetAttributeString("text", "") || "");
      }
    } catch (eText) {}
    return "";
  }

  function countPips(pipText) {
    var count = 0;
    var i;
    for (i = 0; i < pipText.length; i += 1) {
      if (pipText.charAt(i) === "'") count += 1;
    }
    return count;
  }

  function marginRightFor(segment, pipCount) {
    var rule = SEGMENTS[segment - 1];
    var progress;
    var margin;
    if (!rule) return null;
    if (segment === 1) {
      if (pipCount <= SEGMENT_ONE_START_PIPS) return rule.marginRight;
      if (pipCount >= SEGMENT_TWO_START_PIPS) {
        return SEGMENTS[1].marginRight;
      }
      progress =
        (pipCount - SEGMENT_ONE_START_PIPS) /
        (SEGMENT_TWO_START_PIPS - SEGMENT_ONE_START_PIPS);
      margin = -53.625 + progress * 13.40625;
      return String(Math.round(margin * 100) / 100) + "px";
    }
    if (segment !== 2 || pipCount <= SEGMENT_TWO_START_PIPS) {
      return rule.marginRight;
    }
    if (pipCount >= SEGMENT_THREE_START_PIPS) {
      return SEGMENTS[2].marginRight;
    }
    progress =
      (pipCount - SEGMENT_TWO_START_PIPS) /
      (SEGMENT_THREE_START_PIPS - SEGMENT_TWO_START_PIPS);
    margin = -40.21875 + progress * 284.90625;
    return String(Math.round(margin * 100) / 100) + "px";
  }

  function applySegment(segment, pipCount) {
    var rule = SEGMENTS[segment - 1];
    var marginRight = marginRightFor(segment, pipCount);
    if (!rule || !marginRight) {
      restoreOwnedMargin();
      lastSegment = segment;
      lastPipCount = pipCount;
      return;
    }
    try {
      if (unitStatus.style.marginRight !== marginRight) {
        unitStatus.style.marginRight = marginRight;
      }
      if (counterContainer.style.marginRight !== marginRight) {
        counterContainer.style.marginRight = marginRight;
      }
    } catch (eStyle) {
      return;
    }
    ownedMargin = marginRight;
    lastSegment = segment;
    lastPipCount = pipCount;
  }

  function scheduleNext(ready) {
    var delay = ready ? STABLE_INTERVAL_SEC : IDLE_INTERVAL_SEC;
    if (!ready && fastRetries < MAX_FAST_RETRIES) {
      fastRetries += 1;
      delay = FAST_INTERVAL_SEC;
    }
    $.Schedule(delay, tick);
  }

  function tick() {
    var ready = resolvePanels();
    if (!ready) {
      if (!context) return;
      scheduleNext(false);
      return;
    }

    fastRetries = MAX_FAST_RETRIES;
    var segment = currentSegment();
    var pipText = currentPipText();
    var pipCount = countPips(pipText);
    if (
      segment !== lastSegment ||
      ((segment === 1 || segment === 2) && pipCount !== lastPipCount)
    ) {
      applySegment(segment, pipCount);
    }
    scheduleNext(true);
  }

  tick();
})();
