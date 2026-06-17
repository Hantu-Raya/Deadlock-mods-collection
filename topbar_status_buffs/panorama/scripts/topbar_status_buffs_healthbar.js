(() => {
  "use strict";

  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var UPDATE_MAGIC = "TOPBAR_STATUS_BUFFS_UPDATE";
  var SHARED_KEY = "__topbarStatusBuffs";
  var SNAPSHOT_VERSION = 1;
  var ENTRY_TTL_MS = 2500;
  var BUFF_DURATION_MS = 160000;
  var ACTIVE_DELAY = 0.15;
  var IDLE_DELAY = 0.5;
  var SLOW_DELAY = 1.5;
  var SURVIVAL_BIT = 1;
  var MOVEMENT_BIT = 2;
  var CASTING_BIT = 4;
  var GUNPOWER_BIT = 8;

  var TOKENS = [
    { className: "survival_pickup", bit: SURVIVAL_BIT, key: "survival" },
    { className: "movement_pickup", bit: MOVEMENT_BIT, key: "movement" },
    { className: "casting_pickup", bit: CASTING_BIT, key: "casting" },
    { className: "gunpower_pickup", bit: GUNPOWER_BIT, key: "gunpower" }
  ];
  var DEBUG_PREFIX = "[topbar_status_buffs:hp] ";
  var lastDebugAt = 0;
  var lastDebugMessage = "";

  function debugLog(message, now) {
    var stamp = now || Date.now();
    if (message === lastDebugMessage && stamp - lastDebugAt < 2000) return;
    lastDebugMessage = message;
    lastDebugAt = stamp;
    try { $.Msg(DEBUG_PREFIX + message); } catch (e0) {}
  }

  function debugLogForce(message) {
    lastDebugMessage = message;
    lastDebugAt = Date.now();
    try { $.Msg(DEBUG_PREFIX + message); } catch (e0) {}
  }



  var root = null;
  var nameHost = null;
  var unitStatus = null;
  var statusEffects = null;
  var namePanel = null;
  var nextCacheAt = 0;
  var cacheAttempts = 0;
  var scheduledToken = 0;
  var lastMask = -1;
  var lastName = "";
  var lastKey = "";
  var stableEmptyTicks = 0;
  var clearedLastKey = false;
  var buffStarts = { survival: 0, movement: 0, casting: 0, gunpower: 0 };

  function isPanelValid(panel) {
    try { return !!(panel && (!panel.IsValid || panel.IsValid())); } catch (e0) { return false; }
  }

  function panelClasses(panel) {
    var classes = "";
    try { if (isPanelValid(panel) && panel.className !== undefined) classes = String(panel.className || ""); } catch (e0) { classes = ""; }
    try { if (!classes && isPanelValid(panel) && panel.GetAttributeString) classes = String(panel.GetAttributeString("class", "") || ""); } catch (e1) { classes = ""; }
    try { if (!classes && isPanelValid(panel) && panel.debug && panel.debug.description !== undefined) classes = String(panel.debug.description || ""); } catch (e2) {}
    try { if (!classes && isPanelValid(panel) && panel["debug.description"] !== undefined) classes = String(panel["debug.description"] || ""); } catch (e3) {}
    return classes;
  }

  function childCount(panel) {
    var children;
    try { if (isPanelValid(panel) && panel.GetChildCount) return panel.GetChildCount(); } catch (e0) {}
    try { children = isPanelValid(panel) && panel.Children ? panel.Children() : null; } catch (e1) { children = null; }
    return children ? children.length : 0;
  }

  function childAt(panel, index) {
    var children;
    try { if (isPanelValid(panel) && panel.GetChild) return panel.GetChild(index); } catch (e0) {}
    try { children = isPanelValid(panel) && panel.Children ? panel.Children() : null; } catch (e1) { children = null; }
    return children && index < children.length ? children[index] : null;
  }


  function findChild(panel, id) {
    try { return isPanelValid(panel) && panel.FindChildTraverse ? panel.FindChildTraverse(id) : null; } catch (e0) { return null; }
  }

  function panelId(panel) {
    var value = "";
    try { if (isPanelValid(panel) && panel.id !== undefined) value = String(panel.id || ""); } catch (e0) { value = ""; }
    return value;
  }


  function findChildNear(panel, id) {
    var current = panel;
    var found = null;
    var depth = 0;
    while (isPanelValid(current) && depth < 8) {
      found = findChild(current, id);
      if (isPanelValid(found)) return found;
      try { current = current.GetParent ? current.GetParent() : null; } catch (e0) { current = null; }
      depth += 1;
    }
    return null;
  }

  function normalizeStatusBuffName(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").toLowerCase();
  }

  function rawPanelString(panel, key) {
    var raw = "";
    try { if (isPanelValid(panel) && panel[key] !== undefined && panel[key] !== null) raw = String(panel[key] || ""); } catch (e0) { raw = ""; }
    if (raw) return raw;
    try { if (isPanelValid(panel) && panel.GetAttributeString) raw = String(panel.GetAttributeString(key, "") || ""); } catch (e1) { raw = ""; }
    return raw;
  }


  function cleanUnitName(value) {
    var text = String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (!text || text === "#" || text === "{s:name}" || text === "%name%") return "";
    text = text.replace(/^#/, "");
    if (/^[a-z_]+$/.test(text) && text.indexOf("hero_") === 0) text = text.slice(5);
    return text;
  }

  function readDebugDescription(panel) {
    var raw = "";
    var match;
    try {
      if (isPanelValid(panel) && panel.debug && panel.debug.description !== undefined) raw = String(panel.debug.description || "");
    } catch (e0) { raw = ""; }
    if (!raw) {
      try { if (isPanelValid(panel) && panel["debug.description"] !== undefined) raw = String(panel["debug.description"] || ""); } catch (e1) { raw = ""; }
    }
    if (!raw) return "";
    match = raw.match(/text=\"([^\"]+)\"/) || raw.match(/text='([^']+)'/) || raw.match(/text=([^\\s>]+)/);
    return cleanUnitName(match ? match[1] : raw);
  }

  function tryLocalizeUnitName(value, panel) {
    var localized = "";
    var raw = String(value || "");
    if (!raw) return "";
    try { if (isPanelValid(panel)) localized = cleanUnitName($.Localize(raw, panel)); } catch (e0) { localized = ""; }
    return localized;
  }

  function readPanelString(panel, key) {
    var raw = rawPanelString(panel, key);
    var value = cleanUnitName(raw) || tryLocalizeUnitName(raw, panel) || tryLocalizeUnitName(raw, nameHost) || tryLocalizeUnitName(raw, root);
    if (value) return value;
    return readDebugDescription(panel);
  }

  function logNameProbe(now) {
    debugLogForce(
      "name probe id=" + panelId(namePanel) +
      " text=" + rawPanelString(namePanel, "text") +
      " attr=" + (isPanelValid(namePanel) && namePanel.GetAttributeString ? namePanel.GetAttributeString("text", "") : "") +
      " debug=" + readDebugDescription(namePanel) +
      " locPanel=" + tryLocalizeUnitName("{s:name}", namePanel) +
      " locRoot=" + tryLocalizeUnitName("{s:name}", root)
    );
  }

  function readUnitName() {
    var text = readPanelString(namePanel, "text") || readPanelString(namePanel, "actualtext") || readPanelString(namePanel, "value");
    if (text) return text;
    text = tryLocalizeUnitName("{s:name}", namePanel) || tryLocalizeUnitName("%name%", namePanel) || tryLocalizeUnitName("{s:name}", nameHost) || tryLocalizeUnitName("{s:name}", root) || tryLocalizeUnitName("{s:name}", unitStatus) || tryLocalizeUnitName("{s:name}", statusEffects);
    if (text) return text;
    text = readDebugDescription(namePanel) || readDebugDescription(nameHost) || readDebugDescription(root);
    if (text) return text;
    return "";
  }

  function cachePanels(now) {
    var delay;
    var statusParent = null;
    var unitParent = null;
    if (isPanelValid(statusEffects) && isPanelValid(namePanel)) return true;
    if (now < nextCacheAt) return isPanelValid(statusEffects) && isPanelValid(namePanel);

    try { root = $.GetContextPanel ? $.GetContextPanel() : root; } catch (e0) { root = null; }
    unitStatus = findChildNear(root, "UnitStatus");
    statusEffects = findChild(unitStatus, "StatusEffects") || findChildNear(root, "StatusEffects");
    try { statusParent = isPanelValid(statusEffects) && statusEffects.GetParent ? statusEffects.GetParent() : null; } catch (e1) { statusParent = null; }
    try { unitParent = isPanelValid(unitStatus) && unitStatus.GetParent ? unitStatus.GetParent() : null; } catch (e2) { unitParent = null; }
    namePanel = findChildNear(root, "name") || findChildNear(unitStatus, "name") || findChildNear(statusEffects, "name") || findChild(statusParent, "name") || findChild(unitParent, "name");
    try { nameHost = isPanelValid(namePanel) && namePanel.GetParent ? namePanel.GetParent() : unitParent || statusParent || root; } catch (e3) { nameHost = unitParent || statusParent || root; }

    if (isPanelValid(statusEffects) && isPanelValid(namePanel)) {
      cacheAttempts = 0;
      nextCacheAt = 0;
      debugLog("cached ctx=" + panelId(root) + " unit=" + panelId(unitStatus) + " status=" + panelId(statusEffects) + " name=" + panelId(namePanel), now);
      return true;
    }

    cacheAttempts += 1;
    if (cacheAttempts === 1 || cacheAttempts === 8 || cacheAttempts === 24) debugLog("cache miss ctx=" + panelId(root) + " unit=" + panelId(unitStatus) + " status=" + panelId(statusEffects) + " name=" + panelId(namePanel), now);
    delay = cacheAttempts <= 8 ? 150 : (cacheAttempts <= 24 ? 500 : 1500);
    nextCacheAt = now + delay;
    return false;
  }

  function hasBuffClass(panel, token) {
    var classes = "";
    try { if (isPanelValid(panel) && panel.BHasClass && panel.BHasClass(token)) return true; } catch (e0) {}
    classes = panelClasses(panel);
    return (" " + classes + " ").indexOf(" " + token + " ") !== -1 || classes.indexOf(token) !== -1;
  }
  function hasBuffClassDeep(panel, token, depth) {
    var count;
    var i;
    if (!isPanelValid(panel) || depth > 6) return false;
    if (hasBuffClass(panel, token)) return true;
    try {
      if (panel.FindChildrenWithClassTraverse) {
        var matches = panel.FindChildrenWithClassTraverse(token);
        if (matches && matches.length) return true;
      }
    } catch (e0) {}
    count = childCount(panel);
    for (i = 0; i < count; i += 1) {
      if (hasBuffClassDeep(childAt(panel, i), token, depth + 1)) return true;
    }
    return false;
  }

  function describeStatusNode(panel, depth, index, parts) {
    var i;
    var count;
    if (!isPanelValid(panel) || depth > 3 || parts.length >= 12) return;
    parts.push("d" + String(depth) + "." + String(index) + "=" + panelId(panel) + "[" + panelClasses(panel) + "]");
    count = childCount(panel);
    for (i = 0; i < count && parts.length < 12; i += 1) {
      describeStatusNode(childAt(panel, i), depth + 1, i, parts);
    }
  }

  function describeStatusEffects() {
    var parts = [];
    describeStatusNode(statusEffects, 0, 0, parts);
    return "status_tree " + parts.join(" ");
  }

  function readBuffMask() {
    var mask = 0;
    var i;
    if (!isPanelValid(statusEffects)) return 0;
    for (i = 0; i < TOKENS.length; i += 1) {
      if (hasBuffClassDeep(statusEffects, TOKENS[i].className, 0)) mask |= TOKENS[i].bit;
    }
    return mask;
  }

  function updateBuffStarts(mask, now) {
    var i;
    var token;
    for (i = 0; i < TOKENS.length; i += 1) {
      token = TOKENS[i];
      if (mask & token.bit) {
        if (!buffStarts[token.key] || !(lastMask & token.bit)) buffStarts[token.key] = now;
      } else {
        buffStarts[token.key] = 0;
      }
    }
  }

  function buildTiming(mask) {
    var timing = {};
    var i;
    var token;
    var started;
    for (i = 0; i < TOKENS.length; i += 1) {
      token = TOKENS[i];
      started = (mask & token.bit) ? Number(buffStarts[token.key]) || 0 : 0;
      timing[token.key] = started ? { started_at: started, ends_at: started + BUFF_DURATION_MS, duration_ms: BUFF_DURATION_MS } : { started_at: 0, ends_at: 0, duration_ms: BUFF_DURATION_MS };
    }
    return timing;
  }

  function getSharedStore() {
    var config = null;
    var store;
    try {
      if (GameUI && GameUI.CustomUIConfig) config = GameUI.CustomUIConfig();
    } catch (e0) { config = null; }
    if (!config) {
      try {
        if (!$[SHARED_KEY]) $[SHARED_KEY] = { version: 1, seq: 0, ttl_ms: 2500, buff_duration_ms: BUFF_DURATION_MS, updated_at: 0, units: {} };
        config = $;
      } catch (e1) { config = null; }
    }
    if (!config) return null;
    store = config[SHARED_KEY];
    if (!store || store.version !== SNAPSHOT_VERSION || !store.units) {
      store = { version: 1, seq: 0, ttl_ms: 2500, buff_duration_ms: BUFF_DURATION_MS, updated_at: 0, units: {} };
      config[SHARED_KEY] = store;
    }
    store.buff_duration_ms = BUFF_DURATION_MS;
    return store;
  }

  function readFallbackUnitName() {
    var store = getSharedStore();
    if (!store) return "";
    if (store.local_name) return String(store.local_name || "");
    if (store.local_key) return String(store.local_key || "");
    return "";
  }

  function publishMask(mask, name, now) {
    var key = normalizeStatusBuffName(name);
    var store;
    var timing;
    var payload;
    if (!key) return;
    updateBuffStarts(mask, now);
    timing = buildTiming(mask);
    store = getSharedStore();
    if (!store) return;
    store.seq = (Number(store.seq) || 0) + 1;
    store.ttl_ms = ENTRY_TTL_MS;
    store.updated_at = now;
    store.units[key] = { name: name, key: key, mask: mask, updated_at: now, expires_at: now + ENTRY_TTL_MS, duration_ms: BUFF_DURATION_MS, buffs: timing };
    payload = {
      magic_word: UPDATE_MAGIC,
      version: SNAPSHOT_VERSION,
      name: name,
      key: key,
      mask: mask,
      updated_at: now,
      expires_at: now + ENTRY_TTL_MS,
      duration_ms: BUFF_DURATION_MS,
      buffs: timing
    };
    try { $.DispatchEvent(EVENT_CHANNEL, JSON.stringify(payload)); } catch (e0) {}
    debugLog("publish name=" + name + " key=" + key + " mask=" + String(mask), now);
  }
  function publishAnonymousMask(mask, now) {
    var store;
    var timing;
    if (!mask) return;
    updateBuffStarts(mask, now);
    timing = buildTiming(mask);
    store = getSharedStore();
    if (!store) return;
    store.seq = (Number(store.seq) || 0) + 1;
    store.ttl_ms = ENTRY_TTL_MS;
    store.updated_at = now;
    store.any_record = { name: "", key: "", mask: mask, updated_at: now, expires_at: now + ENTRY_TTL_MS, duration_ms: BUFF_DURATION_MS, buffs: timing, global_fallback: true };
    debugLog("publish anonymous mask=" + String(mask) + " " + describeStatusEffects(), now);
  }


  function clearLastKey(now) {
    if (lastKey && !clearedLastKey) {
      publishMask(0, lastName || lastKey, now);
      clearedLastKey = true;
      lastMask = 0;
    }
  }

  function scheduleTick(delay) {
    var token = scheduledToken + 1;
    scheduledToken = token;
    try { $.Schedule(delay, function() { tick(token); }); } catch (e0) {}
  }

  function tick(token) {
    var now = Date.now();
    var hasPanels;
    var name;
    var key;
    var mask;
    var changed;
    var delay;
    if (token !== scheduledToken) return;

    hasPanels = cachePanels(now);
    if (!hasPanels) {
      debugLog("waiting for #StatusEffects under #UnitStatus", now);
      statusEffects = null;
      clearLastKey(now);
      stableEmptyTicks += 1;
      scheduleTick(SLOW_DELAY);
      return;
    }

    name = readUnitName();
    key = normalizeStatusBuffName(name);
    mask = readBuffMask();
    if (!key) {
      name = readFallbackUnitName();
      key = normalizeStatusBuffName(name);
      if (key) debugLog("using topbar local fallback name=" + name + " mask=" + String(mask), now);
    }
    if (!key) {
      if (mask) {
        logNameProbe(now);
        publishAnonymousMask(mask, now);
        lastMask = mask;
        stableEmptyTicks = 0;
        scheduleTick(ACTIVE_DELAY);
        return;
      }
      debugLog("waiting for hp-bar #name text or topbar local fallback; " + describeStatusEffects(), now);
      clearLastKey(now);
      stableEmptyTicks += 1;
      scheduleTick(stableEmptyTicks < 4 ? IDLE_DELAY : SLOW_DELAY);
      return;
    }
    changed = mask !== lastMask || key !== lastKey || name !== lastName;
    if (changed) {
      publishMask(mask, name, now);
      lastMask = mask;
      lastName = name;
      lastKey = key;
      clearedLastKey = false;
      stableEmptyTicks = mask ? 0 : 1;
    } else if (mask) {
      stableEmptyTicks = 0;
    } else {
      stableEmptyTicks += 1;
    }

    delay = (mask || changed) ? ACTIVE_DELAY : (stableEmptyTicks < 4 ? IDLE_DELAY : SLOW_DELAY);
    scheduleTick(delay);
  }

  debugLog("publisher boot");
  scheduleTick(ACTIVE_DELAY);
})();
