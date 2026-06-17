(() => {
  "use strict";

  var PLAYER_KEY = "__TopbarStatusBuffsPlayer";
  var DEBUG_PREFIX = "[topbar_status_buffs:topbar] ";
  var lastDebugAt = 0;
  var lastDebugMessage = "";

  function debugLog(message, now) {
    var stamp = now || Date.now();
    if (message === lastDebugMessage && stamp - lastDebugAt < 2000) return;
    lastDebugMessage = message;
    lastDebugAt = stamp;
    try { $.Msg(DEBUG_PREFIX + message); } catch (e0) {}
  }

  var SHARED_KEY = "__topbarStatusBuffs";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var UPDATE_MAGIC = "TOPBAR_STATUS_BUFFS_UPDATE";
  var SNAPSHOT_VERSION = 1;
  var ACTIVE_TICK_SECONDS = 0.25;
  var IDLE_TICK_SECONDS = 0.75;
  var ENTRY_TTL_MS = 2500;
  var BUFF_DURATION_MS = 160000;
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

  var listenerRegistered = false;

  function isPanelValid(panel) {
    try { return !!(panel && (!panel.IsValid || panel.IsValid())); } catch (e0) { return false; }
  }

  function findChild(root, id) {
    try { return isPanelValid(root) && root.FindChildTraverse ? root.FindChildTraverse(id) : null; } catch (e0) { return null; }
  }

  function findFirstByClass(root, className) {
    var panels;
    try { panels = isPanelValid(root) && root.FindChildrenWithClassTraverse ? root.FindChildrenWithClassTraverse(className) : null; } catch (e0) { panels = null; }
    return panels && panels.length ? panels[0] : null;
  }

  function normalizeStatusBuffName(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").toLowerCase();
  }

  function readText(panel) {
    try { return isPanelValid(panel) && panel.text !== undefined && panel.text !== null ? String(panel.text || "") : ""; } catch (e0) { return ""; }
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

  function hasClass(panel, className) {
    var classes = "";
    try { if (isPanelValid(panel) && panel.BHasClass && panel.BHasClass(className)) return true; } catch (e0) {}
    classes = panelClasses(panel);
    return (" " + classes + " ").indexOf(" " + className + " ") !== -1 || classes.indexOf(className) !== -1;
  }

  function hasClassDeep(panel, className, depth) {
    var count;
    var i;
    if (!isPanelValid(panel) || depth > 6) return false;
    if (hasClass(panel, className)) return true;
    try {
      if (panel.FindChildrenWithClassTraverse) {
        var matches = panel.FindChildrenWithClassTraverse(className);
        if (matches && matches.length) return true;
      }
    } catch (e0) {}
    count = childCount(panel);
    for (i = 0; i < count; i += 1) {
      if (hasClassDeep(childAt(panel, i), className, depth + 1)) return true;
    }
    return false;
  }


  function setClass(panel, className, enabled) {
    try {
      if (!isPanelValid(panel)) return;
      if (enabled) {
        if (panel.AddClass && !hasClass(panel, className)) panel.AddClass(className);
      } else if (panel.RemoveClass && hasClass(panel, className)) {
        panel.RemoveClass(className);
      }
    } catch (e0) {}
  }

  function setText(panel, text) {
    var value = String(text || "");
    try { if (isPanelValid(panel) && String(panel.text || "") !== value) panel.text = value; } catch (e0) {}
  }

  function nowMs() { return Date.now(); }

  function getSharedStore() {
    var config = null;
    var store;
    try {
      if (GameUI && GameUI.CustomUIConfig) config = GameUI.CustomUIConfig();
    } catch (e0) { config = null; }
    if (!config) {
      try {
        if (!$[SHARED_KEY]) $[SHARED_KEY] = { version: SNAPSHOT_VERSION, seq: 0, ttl_ms: ENTRY_TTL_MS, buff_duration_ms: BUFF_DURATION_MS, updated_at: 0, units: {} };
        config = $;
      } catch (e1) { config = null; }
    }
    if (!config) return null;
    store = config[SHARED_KEY];
    if (!store || store.version !== SNAPSHOT_VERSION || !store.units) {
      store = { version: SNAPSHOT_VERSION, seq: 0, ttl_ms: ENTRY_TTL_MS, buff_duration_ms: BUFF_DURATION_MS, updated_at: 0, units: {} };
      config[SHARED_KEY] = store;
    }
    store.buff_duration_ms = BUFF_DURATION_MS;
    return store;
  }

  function parsePayload(payload) {
    if (!payload) return null;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (e0) { return null; }
    }
    if (!payload || payload.magic_word !== UPDATE_MAGIC || payload.version !== SNAPSHOT_VERSION) return null;
    return payload;
  }

  function getState(root) {
    var state;
    if (!isPanelValid(root)) return null;
    try { state = root[PLAYER_KEY]; } catch (e0) { state = null; }
    if (!state) {
      state = {
        root: root,
        playerName: null,
        heroName: null,
        container: null,
        nativeEffects: null,
        survival: null,
        movement: null,
        casting: null,
        gunpower: null,
        survivalTime: null,
        movementTime: null,
        castingTime: null,
        gunpowerTime: null,
        nativeStarts: { survival: 0, movement: 0, casting: 0, gunpower: 0 },
        lastNativeMask: -1,
        lastMask: -1,
        lastVisible: false,
        lastTimeText: "",
        lastMatchAt: 0,
        nextToken: 0
      };
      try { root[PLAYER_KEY] = state; } catch (e1) {}
    }
    return state;
  }

  function cacheChildren(state) {
    if (!state || !isPanelValid(state.root)) return false;
    if (!isPanelValid(state.playerName)) state.playerName = findChild(state.root, "PlayerName");
    if (!isPanelValid(state.heroName)) state.heroName = findFirstByClass(state.root, "HeroName");
    if (!isPanelValid(state.container)) state.container = findChild(state.root, "TopbarStatusBuffs");
    if (!isPanelValid(state.nativeEffects)) state.nativeEffects = findChild(state.root, "TopbarStatusBuffsNativeEffects");
    if (!isPanelValid(state.survival)) state.survival = findChild(state.root, "TopbarStatusBuffSurvival");
    if (!isPanelValid(state.movement)) state.movement = findChild(state.root, "TopbarStatusBuffMovement");
    if (!isPanelValid(state.casting)) state.casting = findChild(state.root, "TopbarStatusBuffCasting");
    if (!isPanelValid(state.gunpower)) state.gunpower = findChild(state.root, "TopbarStatusBuffGunpower");
    if (!isPanelValid(state.survivalTime)) state.survivalTime = findChild(state.root, "TopbarStatusBuffSurvivalTime");
    if (!isPanelValid(state.movementTime)) state.movementTime = findChild(state.root, "TopbarStatusBuffMovementTime");
    if (!isPanelValid(state.castingTime)) state.castingTime = findChild(state.root, "TopbarStatusBuffCastingTime");
    if (!isPanelValid(state.gunpowerTime)) state.gunpowerTime = findChild(state.root, "TopbarStatusBuffGunpowerTime");
    return isPanelValid(state.container);
  }

  function isLikelyHumanPlayerName(value) {
    var key = normalizeStatusBuffName(value);
    if (!key || key === "#" || key === "targetdummy") return false;
    if (key.indexOf("bot") === 0) return false;
    return true;
  }

  function publishTopbarIdentity(state) {
    var store;
    var player;
    var hero;
    if (!cacheChildren(state)) return;
    store = getSharedStore();
    if (!store) return;
    player = normalizeStatusBuffName(readText(state.playerName));
    hero = normalizeStatusBuffName(readText(state.heroName));
    if (!store.topbar_keys) store.topbar_keys = {};
    if (player) store.topbar_keys[player] = { player: readText(state.playerName), hero: readText(state.heroName), updated_at: nowMs() };
    if (hero && hero !== "#") store.topbar_keys[hero] = { player: readText(state.playerName), hero: readText(state.heroName), updated_at: nowMs() };
    if (player && (hasClass(state.root, "LocalPlayer") || (!store.local_key && isLikelyHumanPlayerName(readText(state.playerName))))) {
      store.local_key = player;
      store.local_name = readText(state.playerName);
      debugLog("registered local fallback key=" + player + " name=" + readText(state.playerName));
    }
  }

  function readNames(state) {
    return {
      player: normalizeStatusBuffName(readText(state.playerName)),
      hero: normalizeStatusBuffName(readText(state.heroName))
    };
  }

  function activeEndsAt(record) {
    var buffs = record && record.buffs;
    var latest = 0;
    var key;
    if (!buffs) return 0;
    for (key in buffs) {
      if (Object.prototype.hasOwnProperty.call(buffs, key) && buffs[key] && Number(buffs[key].ends_at) > latest) latest = Number(buffs[key].ends_at);
    }
    return latest;
  }

  function isFresh(record, now) {
    var expires = Number(record && record.expires_at) || 0;
    var updated = Number(record && record.updated_at) || 0;
    var endsAt = activeEndsAt(record);
    if ((Number(record && record.mask) || 0) && endsAt) return endsAt >= now;
    if (expires) return expires >= now;
    return updated && updated + ENTRY_TTL_MS >= now;
  }

  function findMatch(state, now) {
    var store = getSharedStore();
    var names;
    var units;
    if (!store || store.version !== SNAPSHOT_VERSION || !store.units) return null;
    units = store.units;
    names = readNames(state);
    if (names.player && units[names.player] && isFresh(units[names.player], now)) return units[names.player];
    if (names.hero && units[names.hero] && isFresh(units[names.hero], now)) return units[names.hero];
    if (store.any_record && (Number(store.any_record.mask) || 0) && isFresh(store.any_record, now)) return store.any_record;
    return null;
  }
  function readNativeBuffMask(state) {
    var panel = state && state.nativeEffects;
    var mask = 0;
    var i;
    if (!isPanelValid(panel)) return 0;
    for (i = 0; i < TOKENS.length; i += 1) {
      if (hasClassDeep(panel, TOKENS[i].className, 0)) mask |= TOKENS[i].bit;
    }
    return mask;
  }

  function updateNativeStarts(state, mask, now) {
    var i;
    var token;
    for (i = 0; i < TOKENS.length; i += 1) {
      token = TOKENS[i];
      if (mask & token.bit) {
        if (!state.nativeStarts[token.key] || !(state.lastNativeMask & token.bit)) state.nativeStarts[token.key] = now;
      } else {
        state.nativeStarts[token.key] = 0;
      }
    }
    state.lastNativeMask = mask;
  }

  function buildNativeRecord(state, mask, now) {
    var names = readNames(state);
    var buffs = {};
    var i;
    var token;
    var started;
    updateNativeStarts(state, mask, now);
    for (i = 0; i < TOKENS.length; i += 1) {
      token = TOKENS[i];
      started = (mask & token.bit) ? Number(state.nativeStarts[token.key]) || now : 0;
      buffs[token.key] = started ? { started_at: started, ends_at: started + BUFF_DURATION_MS, duration_ms: BUFF_DURATION_MS } : { started_at: 0, ends_at: 0, duration_ms: BUFF_DURATION_MS };
    }
    return { name: names.player || names.hero || "", key: names.player || names.hero || "", mask: mask, updated_at: now, expires_at: now + ENTRY_TTL_MS, duration_ms: BUFF_DURATION_MS, buffs: buffs };
  }


  function remainingText(record, key, now) {
    var buff = record && record.buffs && record.buffs[key];
    var ends = Number(buff && buff.ends_at) || 0;
    var remaining = Math.max(0, Math.ceil((ends - now) / 1000));
    var minutes = Math.floor(remaining / 60);
    var seconds = remaining % 60;
    return String(minutes) + ":" + (seconds < 10 ? "0" : "") + String(seconds);
  }

  function applySlot(panel, label, bit, key, state, record, mask, now) {
    var active = !!(mask & bit);
    var text = active ? remainingText(record, key, now) : "2:40";
    setClass(panel, "TopbarStatusBuffActive", active);
    setText(label, text);
    return active ? text : "";
  }

  function applyMask(state, record, now) {
    var mask = Number(record && record.mask) || 0;
    var visible = !!mask;
    publishTopbarIdentity(state);
    var timeText = "";
    if (!cacheChildren(state)) {
      debugLog("missing #TopbarStatusBuffs container", now);
      return;
    }
    timeText += applySlot(state.survival, state.survivalTime, SURVIVAL_BIT, "survival", state, record, mask, now);
    timeText += applySlot(state.movement, state.movementTime, MOVEMENT_BIT, "movement", state, record, mask, now);
    timeText += applySlot(state.casting, state.castingTime, CASTING_BIT, "casting", state, record, mask, now);
    timeText += applySlot(state.gunpower, state.gunpowerTime, GUNPOWER_BIT, "gunpower", state, record, mask, now);
    if (state.lastMask !== mask || state.lastVisible !== visible) {
      setClass(state.container, "TopbarStatusBuffsVisible", visible);
      debugLog("apply player=" + readText(state.playerName) + " hero=" + readText(state.heroName) + " mask=" + String(mask) + " visible=" + String(visible), now);
    }
    state.lastMask = mask;
    state.lastVisible = visible;
    state.lastTimeText = timeText;
    if (visible) state.lastMatchAt = now;
  }

  function schedulePlayerTick(state, delay) {
    var token;
    if (!state || !isPanelValid(state.root)) return;
    token = state.nextToken + 1;
    state.nextToken = token;
    try { $.Schedule(delay, function() { playerTick(state, token); }); } catch (e0) {}
  }

  function playerTick(state, token) {
    var now = nowMs();
    var record;
    var nativeMask;
    if (!state || token !== state.nextToken || !isPanelValid(state.root)) return;
    cacheChildren(state);
    nativeMask = readNativeBuffMask(state);
    if (nativeMask) {
      record = buildNativeRecord(state, nativeMask, now);
      debugLog("native status match player=" + readText(state.playerName) + " hero=" + readText(state.heroName) + " mask=" + String(nativeMask), now);
    } else {
      updateNativeStarts(state, 0, now);
      record = findMatch(state, now);
      if (record) state.lastMatchAt = Number(record.updated_at) || now;
      else debugLog("no match player=" + readText(state.playerName) + " hero=" + readText(state.heroName), now);
    }
    applyMask(state, record, now);
    schedulePlayerTick(state, record && (Number(record.mask) || 0) ? ACTIVE_TICK_SECONDS : IDLE_TICK_SECONDS);
  }

  function handleStatusBuffEvent(payload) {
    var parsed = parsePayload(payload);
    var root;
    var state;
    if (!parsed) return;
    try { root = $.GetContextPanel ? $.GetContextPanel() : null; } catch (e0) { root = null; }
    state = getState(root);
    if (!state) return;
    cacheChildren(state);
    playerTick(state, state.nextToken);
  }

  function registerListener() {
    if (listenerRegistered) return;
    listenerRegistered = true;
    try { $.RegisterForUnhandledEvent(EVENT_CHANNEL, handleStatusBuffEvent); } catch (e0) {}
    debugLog("listener registered");
  }

  function TopbarStatusBuffsPlayerLoaded(reason) {
    var root;
    var state;
    try { root = $.GetContextPanel ? $.GetContextPanel() : null; } catch (e0) { root = null; }
    state = getState(root);
    if (!state) return;
    state.reason = reason || "";
    cacheChildren(state);
    publishTopbarIdentity(state);
    debugLog("player loaded reason=" + state.reason + " player=" + readText(state.playerName) + " hero=" + readText(state.heroName));
    registerListener();
    schedulePlayerTick(state, ACTIVE_TICK_SECONDS);
  }

  $.TopbarStatusBuffsPlayerLoaded = TopbarStatusBuffsPlayerLoaded;
})();
