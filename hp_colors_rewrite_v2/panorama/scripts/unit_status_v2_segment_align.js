(function () {
  "use strict";

  var STABLE_INTERVAL_SEC = 0.25;
  var FAST_INTERVAL_SEC = 0.05;
  var MAX_FAST_RETRIES = 20;
  var SEGMENT_ONE_START_PIPS = 0;
  var SEGMENT_TWO_START_PIPS = 8;
  var SEGMENT_THREE_START_PIPS = 16;
  var SEGMENTS = [
    { className: "maxhp_segment_1", marginRight: "-53.625px", counterTransform: "translateX(-136.375px) translateY(-180px)" },
    { className: "maxhp_segment_2", marginRight: "-40.21875px", counterTransform: "translateX(-62.28125px) translateY(-180px)" },
    { className: "maxhp_segment_3", marginRight: "244.6875px", counterTransform: "translateX(-99.6875px) translateY(-180px)" }
  ];
  var BAR_CLASSES = [
    "bars_1",
    "bars_2",
    "bars_3",
    "bars_4",
    "bars_5",
    "bars_6"
  ];

  var context = null;
  var unitStatus = null;
  var counterRow = null;
  var healthbars = null;
  var pipLabel = null;
  var lastSegment = 0;
  var lastPipCount = -1;
  var fastRetries = 0;
  var wasReady = false;

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

  function clearPanels(nextContext) {
    context = nextContext || null;
    unitStatus = null;
    counterRow = null;
    healthbars = null;
    pipLabel = null;
    lastSegment = 0;
    lastPipCount = -1;
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

  function resolvePanels() {
    var root = getContext();
    if (!root) return false;
    if (!isValidPanel(unitStatus)) unitStatus = findPanel(root, "UnitStatus");
    if (!isValidPanel(counterRow)) counterRow = findPanel(root, "hp_counter_row");
    if (!isValidPanel(healthbars)) {
      healthbars = findPanel(root, "UnitHealthbarsContainer");
      pipLabel = null;
    }
    if (isValidPanel(healthbars) && !isValidPanel(pipLabel)) {
      pipLabel = findPanel(healthbars, "unit_healthbar_pip_label");
    }
    return (
      isValidPanel(unitStatus) &&
      isValidPanel(counterRow) &&
      isValidPanel(healthbars) &&
      isValidPanel(pipLabel)
    );
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

  function currentBarsClass() {
    var i;
    for (i = 0; i < BAR_CLASSES.length; i += 1) {
      if (hasClass(healthbars, BAR_CLASSES[i])) return BAR_CLASSES[i];
    }
    return "bars_unknown";
  }

  function currentPipText() {
    try {
      return String(pipLabel.text || "");
    } catch (eText) {
      return "";
    }
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

  function applySegment(segment, pipText, pipCount) {
    var rule = SEGMENTS[segment - 1];
    var marginRight = marginRightFor(segment, pipCount);
    if (!rule || !marginRight) return;
    try {
      if (unitStatus.style.marginRight !== marginRight) {
        unitStatus.style.marginRight = marginRight;
      }
      if (counterRow.style.transform !== rule.counterTransform) {
        counterRow.style.transform = rule.counterTransform;
      }
    } catch (eStyle) {
      return;
    }
    $.Msg(
      "[HPV2-ALIGN] segment=" + segment +
      " class=" + rule.className +
      " bars=" + currentBarsClass() +
      " pipCount=" + pipCount +
      " pip=\"" + pipText + "\"" +
      " margin-right=" + marginRight +
      " counter-transform=" + rule.counterTransform
    );
    lastSegment = segment;
    lastPipCount = pipCount;
  }

  function scheduleNext(ready) {
    var delay = STABLE_INTERVAL_SEC;
    if (!ready && fastRetries < MAX_FAST_RETRIES) {
      fastRetries += 1;
      delay = FAST_INTERVAL_SEC;
    }
    $.Schedule(delay, tick);
  }

  function tick() {
    var ready = resolvePanels();
    if (!ready) {
      if (wasReady && !context) return;
      scheduleNext(false);
      return;
    }

    wasReady = true;
    fastRetries = MAX_FAST_RETRIES;
    var segment = currentSegment();
    var pipText = currentPipText();
    var pipCount = countPips(pipText);
    if (
      segment !== 0 &&
      (
        segment !== lastSegment ||
        ((segment === 1 || segment === 2) && pipCount !== lastPipCount)
      )
    ) {
      applySegment(segment, pipText, pipCount);
    }
    scheduleNext(true);
  }

  tick();
})();
