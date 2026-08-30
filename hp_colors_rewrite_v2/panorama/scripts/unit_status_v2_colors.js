(function () {
  "use strict";

  if (
    !$.HPColorsV2ContractFactory ||
    typeof $.HPColorsV2ContractFactory.create !== "function"
  ) {
    throw new Error("HP Colors V2 contract unavailable");
  }

  var settingsContract = $.HPColorsV2ContractFactory.create();
  delete $.HPColorsV2ContractFactory;

  var VERSION = 1;
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_V2_CONFIG";
  var CONFIG_ATTR = "hp_colors_v2_config";
  var CHECK_INTERVAL_SEC = 0.25;
  var MAX_CHECKS = 20;
  var MAX_ROOT_DEPTH = 32;
  var MAX_CLASS_DEPTH = 16;
  var context = null;
  var root = null;
  var contextSeen = false;
  var stopped = false;
  var eventHandlerId = null;
  var scheduleQueued = false;
  var scheduleHandle = null;
  var bootReady = false;
  var bootChecks = 0;
  var targetChecks = 0;
  var lastRevision = -1;
  var config = settingsContract.normalizeValues(null);
  var targets = {
    healthbars: null,
    fill: null,
    parent: null,
    pip: null,
    ult: null,
    counter: null,
    counterMax: null,
  };
  var owned = {
    fill: false,
    pip: false,
    ult: false,
  };
  var targetProperties = {
    fill: "washColor",
    pip: "visibility",
    ult: "washColor",
  };
  var lastPipText = "";
  var lastMaxHp = 0;
  var lastCounterText = "";
  var lastCounterMaxText = "";
  var lastCounterVisibility = "";

  function isValidPanel(panel) {
    try {
      if (!panel) return false;
      if (typeof panel.IsValid === "function") return !!panel.IsValid();
      if (panel.IsValid === undefined) return true;
      return !!panel.IsValid;
    } catch (error) {
      return false;
    }
  }

  function findPanel(panel, id) {
    if (!isValidPanel(panel) || typeof panel.FindChildTraverse !== "function")
      return null;
    try {
      return panel.FindChildTraverse(id);
    } catch (error) {
      return null;
    }
  }

  function isDescendantOf(panel, ancestor) {
    var current = panel;
    var depth;
    if (!isValidPanel(panel) || !isValidPanel(ancestor)) return false;
    for (depth = 0; current && depth < MAX_ROOT_DEPTH; depth += 1) {
      if (current === ancestor) return true;
      try {
        current =
          typeof current.GetParent === "function" ? current.GetParent() : null;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  function absoluteRoot(panel) {
    var current = panel;
    var last = panel;
    var depth;
    var parent;
    for (depth = 0; current && depth < MAX_ROOT_DEPTH; depth += 1) {
      if (!isValidPanel(current)) break;
      last = current;
      try {
        parent =
          typeof current.GetParent === "function" ? current.GetParent() : null;
      } catch (error) {
        break;
      }
      if (!parent || parent === current) break;
      current = parent;
    }
    return last;
  }

  function readContext() {
    try {
      return $.GetContextPanel();
    } catch (error) {
      return null;
    }
  }

  function clearOwnedStyle(panel, slot) {
    var property = targetProperties[slot];
    var changed = false;
    if (!owned[slot]) return false;
    if (!isValidPanel(panel) || !panel.style) {
      owned[slot] = false;
      return false;
    }
    try {
      if (panel.style[property] !== "") {
        panel.style[property] = "";
        changed = true;
      }
      owned[slot] = false;
    } catch (error) {
      return false;
    }
    return changed;
  }

  function replaceTarget(slot, nextPanel) {
    var previous = targets[slot];
    if (previous === nextPanel) return;
    if (
      (slot === "counter" || slot === "counterMax") &&
      isValidPanel(previous) &&
      previous.style
    ) {
      try {
        previous.style.visibility = "collapse";
      } catch (error) {}
    } else {
      clearOwnedStyle(previous, slot);
    }
    targets[slot] = nextPanel || null;
    if (Object.prototype.hasOwnProperty.call(owned, slot)) owned[slot] = false;
    if (
      slot === "healthbars" ||
      slot === "fill" ||
      slot === "parent" ||
      slot === "pip" ||
      slot === "counter" ||
      slot === "counterMax"
    ) {
      lastPipText = "";
      lastMaxHp = 0;
      lastCounterText = "";
      lastCounterMaxText = "";
      lastCounterVisibility = "";
    }
  }

  function resetTargets() {
    replaceTarget("healthbars", null);
    replaceTarget("fill", null);
    replaceTarget("parent", null);
    replaceTarget("pip", null);
    replaceTarget("ult", null);
    replaceTarget("counter", null);
    replaceTarget("counterMax", null);
    targetChecks = 0;
  }

  function writeOwnedStyle(panel, slot, value) {
    var property = targetProperties[slot];
    if (!isValidPanel(panel) || !panel.style) {
      owned[slot] = false;
      return false;
    }
    try {
      if (panel.style[property] === value) return false;
      panel.style[property] = value;
      owned[slot] = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  function coherentBarTargets() {
    return (
      isValidPanel(targets.healthbars) &&
      isValidPanel(targets.parent) &&
      isDescendantOf(targets.parent, targets.healthbars) &&
      isValidPanel(targets.fill) &&
      isDescendantOf(targets.fill, targets.parent) &&
      isValidPanel(targets.pip) &&
      isDescendantOf(targets.pip, targets.parent)
    );
  }

  function resolveTargets() {
    var missing =
      !coherentBarTargets() ||
      !isValidPanel(targets.ult) ||
      !isValidPanel(targets.counter) ||
      !isValidPanel(targets.counterMax);
    if (missing && targetChecks < MAX_CHECKS) {
      targetChecks += 1;
      if (!isValidPanel(targets.healthbars))
        replaceTarget(
          "healthbars",
          findPanel(context, "UnitHealthbarsContainer"),
        );
      if (
        !isValidPanel(targets.parent) ||
        !isDescendantOf(targets.parent, targets.healthbars)
      )
        replaceTarget(
          "parent",
          findPanel(targets.healthbars, "unit_healthbar_active_parent"),
        );
      if (
        !isValidPanel(targets.fill) ||
        !isDescendantOf(targets.fill, targets.parent)
      )
        replaceTarget(
          "fill",
          findPanel(targets.parent, "unit_healthbar_lagging"),
        );
      if (
        !isValidPanel(targets.pip) ||
        !isDescendantOf(targets.pip, targets.parent)
      )
        replaceTarget(
          "pip",
          findPanel(targets.parent, "unit_healthbar_pip_label"),
        );
      if (!isValidPanel(targets.ult))
        replaceTarget("ult", findPanel(context, "unit_ult_ready_icon"));
      if (!isValidPanel(targets.counter))
        replaceTarget("counter", findPanel(context, "hp_counter"));
      if (!isValidPanel(targets.counterMax))
        replaceTarget("counterMax", findPanel(context, "hp_counter_max"));
    }
    var ready =
      coherentBarTargets() &&
      isValidPanel(targets.ult) &&
      isValidPanel(targets.counter) &&
      isValidPanel(targets.counterMax);
    if (ready) {
      targetChecks = 0;
      return true;
    }
    return false;
  }

  function isObjectValue(value) {
    return value !== null && Object(value) === value && !Array.isArray(value);
  }

  function parseSnapshot(raw) {
    var snapshot;
    if (typeof raw !== "string" || !raw) return null;
    try {
      snapshot = JSON.parse(raw);
    } catch (error) {
      return null;
    }
    if (!snapshot || !isObjectValue(snapshot)) return null;
    if (snapshot.magic_word !== CONFIG_MAGIC) return null;
    if (snapshot.version !== VERSION) return null;
    if (
      !Number.isFinite(snapshot.revision) ||
      Math.floor(snapshot.revision) !== snapshot.revision ||
      snapshot.revision < 0
    )
      return null;
    if (!isObjectValue(snapshot.values)) return null;
    return snapshot;
  }

  function acceptSnapshot(snapshot) {
    var nextConfig;
    if (!snapshot || snapshot.revision <= lastRevision) return false;
    nextConfig = settingsContract.normalizeValues(snapshot.values);
    config = nextConfig;
    lastRevision = snapshot.revision;
    bootReady = true;
    return true;
  }

  function readRootSnapshot() {
    if (!isValidPanel(root) || typeof root.GetAttributeString !== "function")
      return "";
    try {
      return String(root.GetAttributeString(CONFIG_ATTR, "") || "");
    } catch (error) {
      return "";
    }
  }

  function hasClass(panel, className) {
    if (!isValidPanel(panel)) return false;
    try {
      if (typeof panel.BHasClass === "function")
        return !!panel.BHasClass(className);
      if (typeof panel.HasClass === "function")
        return !!panel.HasClass(className);
    } catch (error) {
      return false;
    }
    return false;
  }

  function scanClassChain(start, flags) {
    var current = start;
    var depth;
    var parent;
    for (depth = 0; current && depth < MAX_CLASS_DEPTH; depth += 1) {
      if (!isValidPanel(current)) break;
      flags.enemy = flags.enemy || hasClass(current, "enemy");
      flags.friend = flags.friend || hasClass(current, "friend");
      flags.neutral =
        flags.neutral ||
        hasClass(current, "team_neutral") ||
        hasClass(current, "neutral");
      try {
        parent =
          typeof current.GetParent === "function" ? current.GetParent() : null;
      } catch (error) {
        break;
      }
      if (!parent || parent === current) break;
      current = parent;
    }
  }

  function classifyRole() {
    var flags = {
      enemy: false,
      friend: false,
      neutral: false,
    };
    scanClassChain(targets.fill, flags);
    scanClassChain(context, flags);
    if (root !== context) scanClassChain(root, flags);
    if (flags.neutral || flags.enemy === flags.friend) return "unknown";
    return flags.enemy ? "enemy" : "friend";
  }

  function logChange(role, color, pipVisibility) {
    try {
      $.Msg(
        "[HPV2-COLOR] role=" +
          role +
          " color=" +
          (color || "") +
          " pips=" +
          pipVisibility,
      );
    } catch (error) {}
  }

  function applyColors() {
    var role = classifyRole();
    var active = config.enabled && (role === "enemy" || role === "friend");
    var color = role === "enemy" ? config.enemyColor : config.allyColor;
    var pipVisibility = config.pipsVisible ? "visible" : "collapse";
    var changed = false;
    if (active) {
      changed = writeOwnedStyle(targets.fill, "fill", color) || changed;
      changed = writeOwnedStyle(targets.ult, "ult", color) || changed;
      changed =
        writeOwnedStyle(targets.pip, "pip", pipVisibility) || changed;
    } else {
      changed = clearOwnedStyle(targets.fill, "fill") || changed;
      changed = clearOwnedStyle(targets.ult, "ult") || changed;
      changed = clearOwnedStyle(targets.pip, "pip") || changed;
    }
    if (changed) logChange(role, active ? color : "", active ? pipVisibility : "");
  }

  function readPanelText(panel) {
    var text = "";
    if (!isValidPanel(panel)) return "";
    try {
      text = String(panel.text || "");
      if (!text && typeof panel.GetAttributeString === "function")
        text = String(panel.GetAttributeString("text", "") || "");
    } catch (error) {
      return "";
    }
    return text;
  }

  function parseMaxHp(text) {
    var majorCount = 0;
    var minorCount = 0;
    var leadingMinorCount = 0;
    var firstMajor;
    var lastMajor;
    var majorHp;
    var index;
    var code;
    if (text === lastPipText) return lastMaxHp;
    lastPipText = text;
    firstMajor = text.indexOf("|");
    lastMajor = text.lastIndexOf("|");
    for (index = 0; index < text.length; index += 1) {
      code = text.charCodeAt(index);
      if (code === 124) {
        majorCount += 1;
      } else if (code === 34 || code === 39) {
        if (firstMajor !== -1 && index < firstMajor) leadingMinorCount += 1;
        if (lastMajor === -1 || index > lastMajor) minorCount += 1;
      }
    }
    majorHp = leadingMinorCount > 0 ? (leadingMinorCount + 1) * 100 : 500;
    lastMaxHp = majorCount * majorHp + minorCount * 100;
    return lastMaxHp;
  }

  function readLayoutWidth(panel) {
    var width;
    if (!isValidPanel(panel)) return 0;
    try {
      width = Number(panel.actuallayoutwidth);
    } catch (error) {
      return 0;
    }
    return Number.isFinite(width) && width > 0 ? width : 0;
  }

  function setCounterVisibility(value) {
    if (
      !isValidPanel(targets.counter) ||
      !targets.counter.style ||
      !isValidPanel(targets.counterMax) ||
      !targets.counterMax.style
    )
      return;
    try {
      if (
        lastCounterVisibility === value &&
        targets.counter.style.visibility === value &&
        targets.counterMax.style.visibility === value
      )
        return;
      if (targets.counter.style.visibility !== value)
        targets.counter.style.visibility = value;
      if (targets.counterMax.style.visibility !== value)
        targets.counterMax.style.visibility = value;
      lastCounterVisibility = value;
    } catch (error) {
      lastCounterVisibility = "";
    }
  }

  function applyHpReadout() {
    var role = classifyRole();
    var parentWidth;
    var fillWidth;
    var maxHp;
    var ratio;
    var currentHp;
    var text;
    var maximumText;
    if (role !== "enemy" && role !== "friend") {
      setCounterVisibility("collapse");
      return;
    }
    parentWidth = readLayoutWidth(targets.parent);
    fillWidth = readLayoutWidth(targets.fill);
    maxHp = parseMaxHp(readPanelText(targets.pip));
    if (parentWidth <= 0 || maxHp <= 0) {
      setCounterVisibility("collapse");
      return;
    }
    ratio = fillWidth / parentWidth;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    currentHp = ratio >= 0.97 ? maxHp : Math.round(maxHp * ratio);
    text = currentHp + " / ";
    maximumText = String(maxHp);
    try {
      if (lastCounterText !== text || targets.counter.text !== text)
        targets.counter.text = text;
      if (
        lastCounterMaxText !== maximumText ||
        targets.counterMax.text !== maximumText
      )
        targets.counterMax.text = maximumText;
      lastCounterText = text;
      lastCounterMaxText = maximumText;
    } catch (error) {
      lastCounterText = "";
      lastCounterMaxText = "";
      return;
    }
    setCounterVisibility("visible");
  }

  function applyVisuals() {
    applyColors();
    applyHpReadout();
  }

  function onConfigEvent(payload) {
    var snapshot = parseSnapshot(payload);
    if (stopped || !acceptSnapshot(snapshot)) return;
    if (
      isValidPanel(targets.fill) &&
      isValidPanel(targets.parent) &&
      isValidPanel(targets.pip) &&
      isValidPanel(targets.ult) &&
      isValidPanel(targets.counter) &&
      isValidPanel(targets.counterMax)
    )
      applyVisuals();
  }

  function resetContext(nextContext) {
    resetTargets();
    context = nextContext;
    root = null;
    bootReady = false;
    bootChecks = 0;
    lastRevision = -1;
    config = settingsContract.normalizeValues(null);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    scheduleQueued = false;
    try {
      if (
        $.CancelScheduled &&
        scheduleHandle !== null &&
        scheduleHandle !== undefined
      )
        $.CancelScheduled(scheduleHandle);
    } catch (error) {}
    scheduleHandle = null;
    try {
      if (
        $.UnregisterForUnhandledEvent &&
        eventHandlerId !== null &&
        eventHandlerId !== undefined
      )
        $.UnregisterForUnhandledEvent(EVENT_CHANNEL, eventHandlerId);
    } catch (error) {}
    eventHandlerId = null;
    context = null;
    root = null;
    targets.fill = null;
    targets.pip = null;
    targets.ult = null;
    targets.healthbars = null;
    targets.parent = null;
    targets.counter = null;
    targets.counterMax = null;
    owned.fill = false;
    owned.pip = false;
    owned.ult = false;
    contextSeen = false;
    bootReady = false;
    bootChecks = 0;
    targetChecks = 0;
    lastRevision = -1;
    config = null;
    lastPipText = "";
    lastMaxHp = 0;
    lastCounterText = "";
    lastCounterMaxText = "";
    lastCounterVisibility = "";
  }

  function scheduleNext() {
    if (stopped || scheduleQueued) return;
    scheduleQueued = true;
    try {
      scheduleHandle = $.Schedule(CHECK_INTERVAL_SEC, function () {
        scheduleHandle = null;
        scheduleQueued = false;
        if (stopped) return;
        tick();
      });
    } catch (error) {
      scheduleHandle = null;
      stop();
    }
  }

  function tick() {
    var nextContext;
    var nextRoot;
    var snapshot;
    if (stopped) return;
    nextContext = readContext();
    if (!isValidPanel(nextContext)) {
      if (contextSeen) {
        stop();
        return;
      }
      bootChecks += 1;
      if (bootChecks >= MAX_CHECKS) {
        stop();
        return;
      }
      scheduleNext();
      return;
    }
    contextSeen = true;
    bootChecks = 0;
    if (nextContext !== context) resetContext(nextContext);
    nextRoot = absoluteRoot(context);
    if (!isValidPanel(nextRoot)) {
      scheduleNext();
      return;
    }
    if (nextRoot !== root) {
      resetTargets();
      root = nextRoot;
      bootReady = false;
      bootChecks = 0;
      lastRevision = -1;
      config = settingsContract.normalizeValues(null);
    }
    if (!bootReady) {
      snapshot = parseSnapshot(readRootSnapshot());
      if (snapshot && acceptSnapshot(snapshot)) {
        bootReady = true;
      } else {
        bootChecks += 1;
        if (bootChecks >= MAX_CHECKS) bootReady = true;
      }
    }
    if (resolveTargets()) applyVisuals();
    scheduleNext();
  }

  try {
    eventHandlerId = $.RegisterForUnhandledEvent(EVENT_CHANNEL, onConfigEvent);
  } catch (error) {}
  tick();
})();
