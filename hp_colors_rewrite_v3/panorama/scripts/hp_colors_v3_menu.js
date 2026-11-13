(function () {
  "use strict";
  // By-part ESC menu (ticket 08). Rows are generated statically; this binds them to the settings
  // model, publishes through the ticket-03 path and keeps fold/search/page state menu-local.
  var activeRoot = null;
  var pending = null;
  var generation = 0;
  var retryCount = 0;
  var config = null;
  var contractRef = null;
  // heroKeys: upper-case hero name or name token -> hero key (matched against the HUD name label); heroByKey: hero key -> contract hero record.
  var heroKeys = Object.create(null), heroByKey = Object.create(null);
  var rowCells = new Map();
  var effectiveSettings = null, lastPublishedRevision = -1;
  var ABILITY_SLOTS = 4, MAX_TIER = 3, SIDES = ["enemy", "ally"], UNDO_LIMIT = 40, THRESHOLD_GAP = 1;
  var GESTURE_PUBLISH_MS = 50, ANSWER_THROTTLE_MS = 500;
  // One value per ability slot (menu.test.js pins ABILITY_SLOTS/MAX_TIER to the codec RECORD ranges).
  function slotArray(value) { var slots = []; for (var i = 0; i < ABILITY_SLOTS; i++) slots.push(value); return slots; }
  var tiers = slotArray(-1), requiredSlots = slotArray(false), ruleRows = {};
  var signature = null, abilityOwner = null, abilityPanels = slotArray(null), matchedRules = "";
  var panels = Object.create(null);
  var hueThumbs = Object.create(null);
  var bound = Object.create(null);
  var ready = false;
  var lastMissing = "";
  var handlerId = null;
  var pageIndex = -1;
  var syncing = false;
  var storeRoot = null;
  var codeStatusWrites = 0;
  var codeStatusText = "";
  var saveResetAvailable = false;
  var searchWords = null;
  var publisherEpoch = "";
  var answerJob = null;
  var publishJob = null;
  var loadFallback = null;
  var publicationResolved = false;
  var lastPublishedAt = -Infinity;
  var retired = false;
  var supporterOpenCount = 0;
  var inherited = null;
  // Strings are immutable snapshots: later edits cannot alias an Undo record.
  var conditionDraft = null;
  var conditionImages = [];
  var history = [];
  var gesture = null;
  var picker = null;
  var pickerSeeding = false;
  var nativeHex = null;
  var nativeBound = null;
  var resetPage = null;
  var deletePreset = "";
  var bundleReplacement = null;
  // Record limits and the reserved baked id: the codec owns them (it loads before this script); read when used.
  function limits() { return $.HPColorsV3Codec.RECORD; }
  // The reserved id is the codec's RECORD.reservedPresetId; kept literal because tests boot the menu without the codec.
  var DEFAULT_PRESET_ID = "baked_default", DEFAULT_PRESET_NAME = "Rewrite Default";
  var UNUSABLE_CODE = "That code holds settings this version cannot use.";
  // Outbound addresses: the hosted supporters strip (its page, opened inside the menu) and the donation page.
  var LINKS = { supporters: "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip-v3/", donate: "https://ko-fi.com/hantuaraya" };
  var selectedPresetId = DEFAULT_PRESET_ID, presetTiles = [], librarySignature = "", selectedName = "", tileSerial = 0;
  var heroPicker = "", heroTiles = [];
  var revealPresetId = "";
  var sourcePresetId = "", sourceWasMapped = false, routedKey = "";
  var routePending = false;
  var identity = { generation: 0, epoch: 0, job: null, phase: "", hero: "", candidate: "", samples: 0,
    root: null, hud: null, topBar: null, clock: null, card: null, label: null, discoverAt: 0 };
  // SHOW BOUNDS (v2 showBounds): session-only view state. It rides beside the settings in the
  // config message and is never saved, coded, preset or undone. Like v2's root attribute it is kept
  // on the top panel, so a reloaded menu keeps it until the game restarts.
  var BOUNDS_ATTR = "hpv3_show_bounds";
  var showBounds = false;
  // The side shown (JS mirror of the HPC3SideAlly class on the host; written beside the class in selectSide, read here).
  var shownSide = "enemy";
  // COLORBLIND VIEW (2026-10-28): the game's full-screen color blindness convars, one weight per type, so
  // the types mix. The game state is kept on the top panel for this game: the convars are not archived,
  // start at 0 in every game and have no read-back. Since 2026-10-29 the choice is also saved in the
  // bundle's personal colorblind list (never in codes or presets) and sent again once per game.
  var COLORBLIND_TYPES = ["Protanopia", "Deuteranopia", "Tritanopia"];
  var COLORBLIND_ATTR = "hpv3_colorblind_", COLORBLIND_SESSION_ATTR = "hpv3_colorblind_session";
  var colorblind = {};
  // Own bottom-HUD health bar (v2 paintHudHealthWash, hp_colors_v2_menu.js 1968-2055).
  var HUD_TEXTURE = 'url("s2r://panorama/images/hud/healthbar/healthbar_fill_texture_png.vtex")';
  var HUD_WHITE = "#FFFFFF", HUD_TEAM = { team1: "#E7B659", team2: "#5B79E6" };
  var HUD_PROPS = ["backgroundImage", "backgroundColor", "washColor"];
  var hud = { root: null, chain: null, container: null, owner: null, stale: [], job: null };
  var publishedHudKey = "";
  // The settings the HUD work reads: paintHud (enabled, mode, colour) and legacyWanted (enabled, shield style).
  // A publish that changes none of them leaves the HUD alone (onHudSettings).
  var HUD_KEYS = ["enabled", "hudHealthColorMode", "hudHealthColor", "hudShieldStyle"];

  // Reinclusion on the same context: the previous instance must stop publishing, answering and
  // retrying, or its queued answer would rebroadcast a retired epoch. Its settings carry over.
  var previous = $.HPColorsMenuPublisher;
  if (previous && typeof previous.retire === "function") {
    try { inherited = previous.retire(); } catch (error) { inherited = null; }
  }
  $.HPColorsMenuPublisher = {
    retire: function () {
      retired = true;
      generation++;
      stopIdentityWatch();
      previewOpen(false);
      setSupporterStripOpen(false);
      stopUpdateCheck(); resetEscapeWatch();
      endNewsFlash(); newsNav++;
      if (pending) $.CancelScheduled(pending);
      if (answerJob) $.CancelScheduled(answerJob);
      if (publishJob) $.CancelScheduled(publishJob);
      if (loadFallback) $.CancelScheduled(loadFallback);
      retireHud();
      publishJob = null; loadFallback = null;
      pending = null; answerJob = null;
      if (handlerId !== null) {
        try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", handlerId); } catch (error) { /* Context already gone. */ }
        handlerId = null;
      }
      return config ? { settings: clone(config.settings), rules: clone(config.rules), sourcePresetId: sourcePresetId, sourceWasMapped: sourceWasMapped,
        routedKey: routedKey, newsSession: Object.keys(newsSession) } : null;
    },
  };

  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function valuesFor(settings, row) { return row.side === "shared" ? settings.shared : settings.side[row.side]; }
  function panel(id) { var found = panels[id]; return valid(found) ? found : null; }
  function store() { var value = $.HPColorsV3Store; return value && typeof value === "object" ? value : null; }
  // The store when it is present, hydrated and (when named) has `method`; partial fake stores in tests rely on the guards.
  function storeReady(method) {
    var target = store();
    return target && (!method || typeof target[method] === "function") && typeof target.isHydrated === "function" && target.isHydrated() ? target : null;
  }
  function trigger(target, className) {
    if (!valid(target)) return;
    if (typeof target.TriggerClass === "function") { target.TriggerClass(className); return; }
    var token = generation, repeated = target.BHasClass(className);
    target.RemoveClass(className);
    if (!repeated) target.AddClass(className);
    else $.Schedule(0, function () { if (!retired && token === generation && valid(target)) target.AddClass(className); });
  }
  // Change-gated class write on a generated panel.
  function mark(id, name, value) {
    var target = panel(id);
    if (target && target.BHasClass(name) !== value) target.SetHasClass(name, value);
  }
  function scrollTo(target) {
    if (valid(target) && typeof target.ScrollParentToMakePanelFit === "function") {
      try { target.ScrollParentToMakePanelFit(1, false); } catch (error) { /* Optional native scrolling. */ }
    }
  }
  function tooltip(target, text, uncached) {
    if (!valid(target)) return;
    if (!uncached) {
      var key = target.id + "\ntooltip";
      if (bound[key] === target) return;
      bound[key] = target;
    }
    target.SetPanelEvent("onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", target, typeof text === "function" ? text() : text); });
    target.SetPanelEvent("onfocus", function () { $.DispatchEvent("UIShowTextTooltip", target, typeof text === "function" ? text() : text); });
    target.SetPanelEvent("onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", target); });
    target.SetPanelEvent("onblur", function () { $.DispatchEvent("UIHideTextTooltip", target); });
  }
  function passive(type, parent, id, className, text) {
    var child = $.CreatePanel(type, parent, id); child.hittest = false;
    if (className) child.AddClass(className);
    if (text !== undefined) child.text = text;
    return child;
  }
  // Preview bar (ticket 09): its own script and scheduler; the menu only forwards page, side, open and settings.
  // Every call is guarded and its failure swallowed as `false`: the preview is optional chrome.
  function previewApi() { return $.HPColorsV3Preview || null; }
  function previewAttach(root, initial) {
    var target = previewApi();
    try { return !!target && typeof target.attach === "function" && target.attach(root, initial); } catch (error) { return false; }
  }
  function previewOpen(open) {
    var target = previewApi();
    try { if (target) { if (open) target.open(); else target.close(); } } catch (error) { /* Optional chrome. */ }
  }
  function previewSetPage(name) {
    var target = previewApi();
    try { if (target) target.setPage(name); } catch (error) { /* Optional chrome. */ }
  }
  function previewSetSide(name) {
    var target = previewApi();
    try { if (target) target.setSide(name); } catch (error) { /* Optional chrome. */ }
  }
  // `shake` marks an explicit menu edit: the sample shakes after the repaint (see the preview's setSettings).
  function previewSetSettings(shake) {
    var target = previewApi();
    try { if (target) target.setSettings(effectiveSettings, { showBounds: showBounds, shake: shake }); } catch (error) { /* Optional chrome. */ }
  }
  // After attach the preview replays the menu's session state in one go (page, side, settings, open).
  function syncPreview() {
    if (!previewAttach(host(), effectiveSettings)) return;
    previewSetPage(contractRef.menu.pages[pageIndex].name);
    previewSetSide(shownSide);
    previewSetSettings(false);
    if (menuIsOpen()) previewOpen(true);
  }

  function publish(force) {
    if (!config || retired || !publicationResolved || !force && lastPublishedRevision === config.revision) return;
    // Live 6779: the Escape-menu context has no GameUI global, so publishing is event-only.
    // showBounds is added only while on, so the default message is exactly the settings envelope.
    var message = { magic: config.magic, epoch: config.epoch, revision: config.revision, settings: effectiveSettings };
    if (showBounds) message.showBounds = true;
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify(message));
    lastPublishedRevision = config.revision;
    lastPublishedAt = Date.now();
    if (ready) previewSetSettings(false);
    onHudSettings(effectiveSettings.shared);
  }
  function resolvePublication() {
    if (retired || !config) return;
    if (loadFallback) $.CancelScheduled(loadFallback);
    loadFallback = null;
    publicationResolved = true;
    publish();
  }
  function cancelGesturePublish() {
    if (publishJob) $.CancelScheduled(publishJob);
    publishJob = null;
  }
  function gesturePublish() {
    if (!publicationResolved || publishJob) return;
    var remaining = GESTURE_PUBLISH_MS - (Date.now() - lastPublishedAt);
    if (remaining <= 0) { publish(); return; }
    var token = generation;
    publishJob = $.Schedule(remaining / 1000, function () {
      publishJob = null;
      if (!retired && token === generation && gesture && valid(activeRoot)) publish();
    });
  }
  function answer(raw) {
    if (retired || !publicationResolved || !valid(activeRoot) || !config || typeof raw !== "string" || raw.length > 512 || raw.indexOf("HPV3_CONFIG_REQUEST") < 0) return;
    try {
      var request = JSON.parse(raw);
      if (request.magic !== "HPV3_CONFIG_REQUEST" || typeof request.epoch !== "string" || request.epoch.length > 128 ||
          !Number.isSafeInteger(request.revision) || request.revision < -1 ||
          (request.epoch === config.epoch && request.revision >= config.revision)) return;
      var remaining = ANSWER_THROTTLE_MS - (Date.now() - lastPublishedAt);
      if (remaining <= 0) {
        if (answerJob) $.CancelScheduled(answerJob);
        answerJob = null;
        publish(true);
      } else if (!answerJob) {
        var token = generation;
        answerJob = $.Schedule(remaining / 1000, function () {
          answerJob = null;
          if (!retired && token === generation && valid(activeRoot)) publish(true);
        });
      }
    } catch (error) { /* Unrelated or malformed world event. */ }
  }
  function resolveEffective() {
    var next = clone(config.settings), matched = [], unmatched = [];
    Object.keys(config.rules).forEach(function (cell) {
      var row = ruleRows[cell], rule = config.rules[cell];
      if (!row) return;
      if (tiers[rule.slot - 1] >= rule.minTier) { valuesFor(next, row)[row.key] = rule.value; matched.push(cell); }
      else unmatched.push(cell);
    });
    // Independently valid threshold rules may cross; preserve the same low < high invariant.
    next.shared.lowThreshold = Math.min(next.shared.lowThreshold, next.shared.highThreshold - THRESHOLD_GAP);
    var observation = matched.join(",") + "|" + unmatched.join(",");
    if (observation !== matchedRules) {
      matchedRules = observation;
      // HPV3_DEBUG $.Msg("[HPV3] rules matched " + matched.join(",") + " unmatched " + unmatched.join(","));
    }
    if (JSON.stringify(next) === JSON.stringify(effectiveSettings)) return false;
    if (effectiveSettings !== null) config.revision++;
    effectiveSettings = next;
    return true;
  }
  function replace(settings, rules) {
    config.settings = settings;
    if (rules !== undefined) config.rules = clone(rules);
    syncNavDots();
    var required = slotArray(false);
    Object.keys(config.rules).forEach(function (cell) { required[config.rules[cell].slot - 1] = true; });
    required.forEach(function (needed, index) { if (!needed || !requiredSlots[index]) tiers[index] = -1; });
    requiredSlots = required;
    resolveEffective();
  }
  // The ability signature panels are gone or stale: forget them so the next sample looks them up again.
  function deadSignature() { signature = null; abilityOwner = null; abilityPanels = slotArray(null); }
  function clearTiers() {
    var changed = tiers.some(function (tier) { return tier !== -1; });
    tiers = slotArray(-1);
    if (changed) {
      // HPV3_DEBUG $.Msg("[HPV3] tiers " + tiers.join(","));
    }
    deadSignature();
    if (config && resolveEffective()) publish();
    syncAbilitySlots();
  }
  function sampleTiers() {
    // While the condition dialog is open, every slot is read so the HUD-style outlines show live tiers.
    var wanted = conditionDraft ? slotArray(true) : requiredSlots;
    if (!wanted.some(Boolean)) return;
    var next = slotArray(-1);
    if (identity.phase === "active" && !identityClasses()("spec_mode")) {
      if (!valid(signature)) {
        signature = (valid(identity.hud) ? identity.hud : identity.root).FindChildTraverse("hud_signature");
        abilityOwner = null; abilityPanels = slotArray(null);
      }
      if (!valid(abilityOwner) || !valid(signature) || abilityOwner.GetParent() !== signature) {
        abilityOwner = valid(signature) ? signature.FindChildTraverse("abilities") : null;
        abilityPanels = slotArray(null);
      }
      wanted.forEach(function (needed, index) {
        if (!needed) return;
        var slot = abilityPanels[index];
        if (!valid(slot) || slot.GetParent() !== abilityOwner) {
          slot = valid(abilityOwner) ? abilityOwner.FindChild("slot_signature_" + (index + 1)) : null;
          abilityPanels[index] = slot;
        }
        if (valid(slot)) for (var tier = MAX_TIER; tier >= 0; tier--) if (slot.BHasClass("Tier" + tier)) { next[index] = tier; break; }
      });
    }
    if (JSON.stringify(next) === JSON.stringify(tiers)) return;
    tiers = next;
    syncAbilitySlots();
    // HPV3_DEBUG $.Msg("[HPV3] tiers " + tiers.join(","));
    if (resolveEffective()) publish();
  }
  function notifyStore() {
    var target = store();
    if (!target || typeof target.commit !== "function") return;
    try { target.commit(config); } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] store commit failed: " + error);
    }
  }

  // ---- SHOW BOUNDS: a view toggle, not a setting (no Undo entry, no store commit) ----
  // Walks up from the menu root (at most 32 parents) to the top panel.
  function topPanel() {
    var top = null;
    for (var node = activeRoot, depth = 0; valid(node) && depth < 32; depth++) { top = node; node = node.GetParent(); }
    return top;
  }
  function syncBounds() {
    if (panel("HPColorsShowBoundsToggle")) panel("HPColorsShowBoundsToggle").SetHasClass("Checked", showBounds);
  }
  function toggleBounds() {
    // Like v2, nothing toggles before the first publication (a cold load is still pending).
    if (retired || !config || !publicationResolved) return;
    showBounds = !showBounds;
    var top = topPanel();
    if (top) top.SetAttributeString(BOUNDS_ATTR, showBounds ? "1" : "0");
    syncBounds();
    replace(config.settings); // Monotonic revision only; the settings and their history are untouched.
    config.revision++;
    publish();
  }
  // ---- COLORBLIND VIEW: game commands, not settings (no publication or Undo entry; saved as bundle metadata) ----
  function syncColorblind() {
    COLORBLIND_TYPES.forEach(function (type) {
      var toggle = panel("HPColorsColorblind" + type + "Toggle");
      if (toggle) toggle.SetHasClass("Checked", colorblind[type] === true);
    });
  }
  function readColorblind() {
    var top = topPanel();
    COLORBLIND_TYPES.forEach(function (type) {
      colorblind[type] = !!top && top.GetAttributeString(COLORBLIND_ATTR + type.toLowerCase(), "") === "1";
    });
  }
  // The saved list holds known lowercase type names only; anything else is ignored, not trusted.
  function savedColorblind(bundle) {
    var saved = bundle && bundle.colorblind, result = {};
    if (Array.isArray(saved) && saved.length <= 8) COLORBLIND_TYPES.forEach(function (type) {
      if (saved.indexOf(type.toLowerCase()) >= 0) result[type] = true;
    });
    return result;
  }
  function colorblindList(state) {
    return COLORBLIND_TYPES.filter(function (type) { return state[type] === true; }).map(function (type) { return type.toLowerCase(); });
  }
  function saveColorblind() {
    var target = retired ? null : storeReady("replaceBundle");
    if (retired || !target || typeof target.canEditPresets === "function" && !target.canEditPresets()) return;
    var bundle = presetBundle(), list = colorblindList(colorblind);
    if (JSON.stringify(bundle.colorblind) === JSON.stringify(list.length ? list : undefined)) return;
    if (list.length) bundle.colorblind = list; else delete bundle.colorblind;
    try { target.replaceBundle(bundle); } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] colorblind save refused: " + error);
    }
  }
  function sendColorblind(type, next) {
    var command = "r_colorblindsim_fullscreen_weight_" + type.toLowerCase() + (next ? " 1" : " 0");
    try { $.DispatchEvent("CitadelConCommand", command); } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] colorblind command refused: " + command + " " + error);
      return false;
    }
    // HPV3_DEBUG $.Msg("[HPV3] colorblind command " + command);
    colorblind[type] = next;
    var top = topPanel();
    if (top) {
      top.SetAttributeString(COLORBLIND_ATTR + type.toLowerCase(), next ? "1" : "0");
      top.SetAttributeString(COLORBLIND_SESSION_ATTR, "1");
    }
    return true;
  }
  function toggleColorblind(type) {
    if (retired || !sendColorblind(type, colorblind[type] !== true)) return;
    syncColorblind();
    saveColorblind();
  }
  // Once the store loads: the first load in a game sends the saved types; a game that already has a
  // choice (made before the store loaded, or restored earlier) keeps it and saves it if it differs.
  function restoreColorblind() {
    var top = topPanel();
    if (retired || !top) return;
    var saved = savedColorblind(presetBundle());
    if (top.GetAttributeString(COLORBLIND_SESSION_ATTR, "") === "1") {
      if (colorblindList(saved).join() === colorblindList(colorblind).join()) return;
      // The load is still finishing here and refuses bundle writes; save on the next frame.
      var token = generation;
      $.Schedule(0, function () { if (!retired && token === generation) saveColorblind(); });
      return;
    }
    top.SetAttributeString(COLORBLIND_SESSION_ATTR, "1");
    COLORBLIND_TYPES.forEach(function (type) { if (saved[type] && colorblind[type] !== true) sendColorblind(type, true); });
    syncColorblind();
  }
  function bindColorblind(type) {
    var id = "HPColorsColorblind" + type + "Toggle", target = panel(id);
    // A reloaded menu replaces the switches; an old panel must never send a command.
    on(id, "onactivate", function () { if (panel(id) === target) toggleColorblind(type); });
  }

  // ==== Identity: the game-HUD scraper (phase, local hero, ability tiers) ====
  // The three HUD sections (Identity, HudPainter, ShieldLane) touch no menu panel. The rest of the file sees them
  // through identity.phase / identity.hero, onHudSettings(shared) on each publish, and retireHud() on retire/boot.
  // Cross-context ownership and recovery: the legacy shield lane marks its container with the
  // hpc3_legacy_shield attribute ("1" owned, "2" released) so a reloaded menu can take over or clean up an earlier
  // context's inline styles; hud.stale lists replaced health bars whose release was refused (retried each second);
  // retire() cancels timers but does not release inline styles, the next context's paint does.
  // The poll runs three named steps in order: identity refs (pollIdentity), watchEscape, then phase/hero/tiers.
  // The shield lane has its own timer and re-checks its theme on the 1 s hud.job.
  // One local-player watcher publishes one resolved settings object; world bars never route.
  function stopIdentityWatch() {
    identity.generation++;
    if (identity.job) $.CancelScheduled(identity.job);
    identity.job = null;
  }
  function clearIdentityRefs() {
    identity.hud = null; identity.topBar = null; identity.clock = null; identity.card = null; identity.label = null;
    identity.discoverAt = 0;
    deadSignature();
  }
  function identityRefs() {
    var root = topPanel();
    if (identity.root !== root) { identity.root = root; clearIdentityRefs(); }
    if (!valid(root)) return false;
    if ((!valid(identity.hud) || !valid(identity.topBar)) && Date.now() >= identity.discoverAt) {
      if (!valid(identity.hud)) identity.hud = root.id === "Hud" ? root : root.FindChildTraverse("Hud");
      if (!valid(identity.topBar)) {
        identity.topBar = (valid(identity.hud) ? identity.hud : root).FindChildTraverse("TopBar");
        identity.clock = null; identity.card = null; identity.label = null;
      }
      identity.discoverAt = Date.now() + 5000;
    }
    return true;
  }
  function identityClasses() {
    var root = valid(identity.root) ? identity.root : null;
    var second = identity.hud !== root && valid(identity.hud) ? identity.hud : null;
    return function (name) { return !!(root && root.BHasClass(name) || second && second.BHasClass(name)); };
  }
  function identityPhase() {
    var identityClass = identityClasses();
    if (identityClass("connectedToHideout")) return "hideout";
    if (identityClass("GameStatePostGame") || identityClass("GameStatePostGamePlayOfTheGame")) return "postgame";
    if (identityClass("GameStatePreGame") || identityClass("GameStatePreGameWait") || identityClass("GameStatePreGameHeroDraft")) return "lobby";
    if (valid(identity.topBar) && !valid(identity.clock)) {
      identity.clock = identity.topBar.FindChildTraverse("GameTime");
      if (!valid(identity.clock)) identity.clock = identity.topBar.FindChildrenWithClassTraverse("GameTime")[0];
    }
    var text = valid(identity.clock) ? String(identity.clock.text || "").trim() : "";
    var negative = text.charAt(0) === "-";
    if (negative) text = text.slice(1);
    var parts = text.split(":"), seconds = 0;
    if (parts.length < 2 || parts.length > 3) return "transitioning";
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i])) return "transitioning";
      seconds = seconds * 60 + Number(parts[i]);
    }
    return !negative || seconds === 0 ? "active" : "transitioning";
  }
  function localHero() {
    if (!valid(identity.topBar)) return "";
    if (!valid(identity.card) || !identity.card.BHasClass("LocalPlayer") || !valid(identity.label)) {
      identity.card = null; identity.label = null;
      var cards = identity.topBar.FindChildrenWithClassTraverse("LocalPlayer");
      for (var i = 0; i < cards.length; i++) {
        var container = cards[i].FindChildTraverse("PlayerNameNWContainer");
        var labels = valid(container) ? container.FindChildrenWithClassTraverse("HeroName") : [];
        if (!valid(labels[0])) continue;
        identity.card = cards[i]; identity.label = labels[0]; break;
      }
    }
    var text = valid(identity.label) ? String(identity.label.text || "").trim().replace(/\s+/g, " ").toUpperCase() : "";
    return heroKeys[text] || "";
  }
  function renderIdentity() {
    var text = identity.phase === "hideout" ? "IN HIDEOUT" : identity.hero ? identity.hero : identity.candidate ? "DETECTING HERO" : "NO HERO DETECTED";
    if (identity.hero && identity.phase !== "hideout") {
      var known = heroByKey[identity.hero]; if (known) text = known.name.toUpperCase();
    }
    var label = panel("HPColorsHeroIdentityLabel");
    if (label && label.text !== text) label.text = text;
    syncAbilitySlots();
  }
  // Routing waits while a gesture, the colour picker or the condition editor is open; each closer calls resumeHeroRoute().
  function heroRouteBlocked() { return !!(gesture || picker || conditionDraft); }
  function applyHeroRoute(watch, epoch) {
    if (retired || watch !== identity.generation || epoch !== identity.epoch || !publicationResolved) return;
    if (heroRouteBlocked()) { routePending = true; return; }
    routePending = false;
    if (identity.phase !== "hideout" && (identity.phase !== "active" || !identity.hero)) return;
    var target = storeReady();
    if (!target) return;
    // Audit 2026-11-02: the settled 1 s watch copied the whole preset library (6 MB per 10 s at 128
    // presets) only to find nothing to apply; the route alone decides that.
    var route = typeof target.getRoute === "function" ? target.getRoute() : presetBundle(), map = route.heroPresets || {};
    var mapped = identity.phase === "active" && Object.prototype.hasOwnProperty.call(map, identity.hero);
    var id = mapped ? map[identity.hero] : route.heroDefault || null;
    if (id === null && sourceWasMapped) id = DEFAULT_PRESET_ID;
    // A route fires once per hero, phase or route target, not on every sample: a preset applied by hand
    // (Default included) stays until the hero, phase or route changes (user, 2026-11-02: applying Default
    // while a hero default was set came back to the hero default a second later).
    var key = identity.phase + "\u0001" + identity.hero + "\u0001" + (id || "");
    if (key === routedKey) return;
    // A store that refuses preset edits (newer or unconfirmed unreadable save) refuses every route: ask again
    // next sample without copying the library.
    if (typeof target.canEditPresets === "function" && !target.canEditPresets()) return;
    routedKey = key;
    if (id === null || id === sourcePresetId) {
      // HPV3_DEBUG if (applyHeroRoute.skipped !== (id || "none")) $.Msg("[HPV3] route skipped " + (applyHeroRoute.skipped = id || "none"));
      return;
    }
    var preset = id === DEFAULT_PRESET_ID ? { id: id, settings: contractRef.defaults } :
      presetBundle().presets.filter(function (item) { return item.id === id; })[0];
    if (!preset) return;
    try {
      target.applyPreset(preset, true, mapped);
      // HPV3_DEBUG applyHeroRoute.skipped = null; $.Msg("[HPV3] route applied " + id);
    } catch (error) {
      routedKey = ""; // retried on the next sample
      // HPV3_DEBUG $.Msg("[HPV3] route refused: " + error);
    }
  }
  function resumeHeroRoute() {
    if (!routePending || heroRouteBlocked()) return;
    var watch = identity.generation, epoch = identity.epoch;
    routePending = false;
    $.Schedule(0, function () { applyHeroRoute(watch, epoch); });
  }
  function scheduleIdentity(watch, epoch, delay) {
    if (retired || watch !== identity.generation || epoch !== identity.epoch) return;
    identity.job = $.Schedule(delay, function identityWatch() { pollIdentity(watch, epoch); });
  }
  function pollIdentity(watch, epoch) {
    if (retired || watch !== identity.generation || epoch !== identity.epoch || !valid(activeRoot)) return;
    identity.job = null;
    try {
      identityRefs();
      watchEscape();
      var phase = identityPhase(), heroChanged = false;
      if (phase !== identity.phase) {
        // A new phase routes again, even to the same hero and preset; the first phase after boot keeps the
        // key a reload inherited.
        if (identity.phase) routedKey = "";
        identity.phase = phase; identity.epoch++; identity.candidate = ""; identity.samples = 0;
        clearTiers();
        if (phase !== "active") identity.hero = "";
        clearIdentityRefs();
        // HPV3_DEBUG $.Msg("[HPV3] lifecycle " + phase + " epoch " + identity.epoch);
        renderIdentity();
        applyHeroRoute(watch, identity.epoch);
        scheduleIdentity(watch, identity.epoch, 0);
        return;
      }
      if (phase === "active") {
        var hero = localHero();
        if (hero !== identity.candidate) { identity.candidate = hero; identity.samples = 1; }
        else identity.samples++;
        if (identity.samples >= 2 && identity.hero !== hero) {
          identity.hero = hero;
          clearTiers();
          heroChanged = true;
          // HPV3_DEBUG $.Msg("[HPV3] hero " + (hero || "cleared"));
        }
      }
      renderIdentity();
      applyHeroRoute(watch, epoch);
      if (!heroChanged) sampleTiers();
    } catch (error) {
      clearIdentityRefs();
      // HPV3_DEBUG $.Msg("[HPV3] identity unavailable: " + error);
    }
    scheduleIdentity(watch, epoch, identity.phase === "active" || identity.phase === "transitioning" ? 1 : 5);
  }
  function startIdentityWatch() {
    stopIdentityWatch();
    identity.epoch++; identity.phase = ""; identity.hero = ""; identity.candidate = ""; identity.samples = 0;
    clearTiers();
    clearIdentityRefs();
    scheduleIdentity(identity.generation, identity.epoch, 0);
  }

  // ==== HudPainter ====
  // ---- Own bottom-HUD health bar. Only this menu owns inline backgroundImage, backgroundColor and
  // washColor on the local #health_and_abilities_container … #health_bar_Left (never unit bars).
  // While HP Colors is on, OFF paints v2's plain white bar (neutral fill texture, white background,
  // white wash) over the team texture and the yellow mid-health tint; TEAM and CUSTOM add their wash
  // to that base. Writing a wash repaints at once, while clearing it alone waits for the engine's next
  // health update, so OFF writes white instead of clearing. HP Colors off, a load still pending and
  // an unknown or conflicting team in TEAM release all three with null (v2: no inline stock exists),
  // including leftovers from an earlier menu context, whose cache this one does not have.
  // A refused release keeps ownership (hud.stale for a replaced bar) and is retried every second,
  // even while HP Colors is off, until it lands.
  function onHudSettings(shared) {
    var key = "";
    for (var i = 0; i < HUD_KEYS.length; i++) { var value = shared[HUD_KEYS[i]]; key += (i ? ":" : "") + (value == null ? "" : value); }
    if (key !== publishedHudKey) { publishedHudKey = key; paintHud(); }
  }
  // Timers only: inline styles stay (recovered by the next context, see the Identity block).
  function retireHud() {
    if (hud.job) $.CancelScheduled(hud.job);
    if (legacy.job) $.CancelScheduled(legacy.job);
    hud.job = null; legacy.job = null;
  }
  function hudRoot() {
    // Not topPanel: that would need an extra valid() call on the result, which the audit counts.
    var top = null;
    for (var node = activeRoot, depth = 0; valid(node) && depth < 32; depth++) {
      if (node.id === "Hud") return node;
      top = node; node = node.GetParent();
    }
    return valid(top) ? top.FindChildTraverse("Hud") : null;
  }
  function writeHud(owner, property, value) {
    if (!owner || !valid(owner.panel) || owner.styles[property] === value) return;
    try { owner.panel.style[property] = value; owner.styles[property] = value; }
    catch (error) {
      delete owner.styles[property]; // Still owned: retried on the next check.
      // HPV3_DEBUG $.Msg("[HPV3] HUD health write failed for " + property + ": " + error);
    }
  }
  function releaseHud(owner) { HUD_PROPS.forEach(function (property) { writeHud(owner, property, null); }); }
  function releasePending(owner) {
    return !!owner && valid(owner.panel) && HUD_PROPS.some(function (property) { return owner.styles[property] !== null; });
  }
  function retryStale() {
    hud.stale = hud.stale.filter(function (owner) { releaseHud(owner); return releasePending(owner); });
  }
  function resolveHud() {
    var chain = hud.chain, intact = !!chain && valid(hud.root);
    for (var i = 0; intact && i < chain.length; i++) intact = valid(chain[i].panel) && chain[i].panel.GetParent() === chain[i].parent;
    if (intact) return true;
    // A replaced or moved bar must not keep the old wash; a refused release stays owned.
    releaseHud(hud.owner);
    if (releasePending(hud.owner)) hud.stale.push(hud.owner);
    hud.chain = null; hud.container = null; hud.owner = null;
    hud.root = hudRoot();
    if (!valid(hud.root)) return false;
    var container = hud.root.FindChildTraverse("health_and_abilities_container");
    var bars = valid(container) ? container.FindChildTraverse("hud_health_bars") : null;
    var bar = valid(bars) ? bars.FindChildTraverse("health_bar") : null;
    var left = valid(bar) ? bar.FindChildTraverse("health_bar_Left") : null;
    if (!valid(left) || left.GetParent() !== bar) return false;
    // The parent chain up to and including the HUD root's own link: any replacement, move or
    // detached HUD re-resolves on the next check.
    var links = [];
    for (var node = left; valid(node) && node !== hud.root && links.length < 32; node = node.GetParent()) links.push({ panel: node, parent: node.GetParent() });
    if (!links.length || links[links.length - 1].parent !== hud.root) return false;
    links.push({ panel: hud.root, parent: hud.root.GetParent() });
    // A bar this menu already owned (moved, or refused a release) keeps its write cache.
    var owner = null;
    hud.stale = hud.stale.filter(function (entry) { if (entry.panel !== left) return true; owner = entry; return false; });
    hud.chain = links; hud.container = container; hud.owner = owner || { panel: left, styles: {} };
    return true;
  }
  function paintHud() {
    if (retired || !config) return;
    if (hud.job) { $.CancelScheduled(hud.job); hud.job = null; }
    var shared = effectiveSettings.shared, live = shared.enabled === true && publicationResolved;
    retryStale();
    var found = resolveHud(), color = null;
    if (found && live) {
      var mode = shared.hudHealthColorMode;
      if (mode === "custom") color = shared.hudHealthColor;
      else if (mode === "team") {
        var team1 = hud.container.BHasClass("team1"), team2 = hud.container.BHasClass("team2");
        if (team1 !== team2) color = HUD_TEAM[team1 ? "team1" : "team2"];
      } else color = HUD_WHITE;
    }
    if (color) {
      writeHud(hud.owner, "backgroundImage", HUD_TEXTURE);
      writeHud(hud.owner, "backgroundColor", HUD_WHITE);
      writeHud(hud.owner, "washColor", color);
    } else releaseHud(hud.owner);
    syncLegacy(found);
    // While on, an identity watch like v2's in-match poll: 1 s once the bar is known (HUD
    // replacement, team changes), 5 s while the HUD or its bar is missing or detached. While off
    // or loading it runs only until a refused release lands; then it costs nothing and the next
    // publication paints.
    var refusedRelease = hud.stale.length > 0 || (!color && releasePending(hud.owner));
    if (!live && !refusedRelease) return;
    var token = generation;
    hud.job = $.Schedule(live && !found ? 5 : 1, function hudWatch() {
      hud.job = null;
      if (!retired && token === generation && valid(activeRoot)) paintHud();
    });
  }

  // ==== ShieldLane ====
  // ---- Ticket 38: Your shield bar, Separate (old): the own HUD from before 6711 (issues/38) ----
  // client.dll 6796-6805 (IDA; mechanism debated with m1):
  // - The game still feeds the old #shield_bar (fill, shieldActive = shield max > 0); 6711 only removed
  //   its CSS, so it is shown again in the old green.
  // - #health_bar draws lowervalue / max. The game writes lowervalue = h / D, D = max(max HP, h + S + B +
  //   recent loss), and never writes max, so max = max HP / D draws h / max HP (also on the pending bars).
  // - D moves every frame and the labels come from other updaters, so D comes from bars UpdateBar
  //   (0x181C0DE30) writes in one pass: health lower = h/D, shield_bar_2 upper = (h+S)/D and shield_bar
  //   = S/Smax, so D = S / (upper - lower). With no shield points, h = the HP text (h + S + B) times
  //   h/D over the #ratking_armor_bar top (h + S + B) / D, both read in one tick once per sample; each
  //   frame then takes D = h / (h/D), so a draining barrier never meets a stale total.
  // - UpdateTickBar (0x181C74D60) spaces #healthLines by D: a line per 250, large per 1000, at
  //   y = 100 * (1 - v / D) %. While corrected, an owned panel with the same id (so the stock rules
  //   apply) draws them at max HP.
  // - The HP number while shielded is an owned label over the faded game label (live 6805: a collapsed
  //   game label stayed lost). An empty shield whose game number is blank gets an owned "0" in the game
  //   shield-number classes.
  // - A Rat King barrier B = (ratking top - shield_bar_2 top) * D leaves the health bar and number too:
  //   it gets the old spirit-shield pair, an owned #tech_shield_bar (removed in 6711; pre-6711 rule values
  //   inline) and the still-present, unfed #TechShieldNumbers, in the Rat King colour. No barrier max
  //   reaches the HUD, so the bar shows B over its peak since the barrier appeared.
  // - The game view returns for unreadable numbers. QOLLOCK's pak03 keeps these stock panels (ticket 40):
  //   under a QOLLOCK healthbar theme its own layout and look stay and only the correction runs; its
  //   Minecraft healthbar draws the bars invisible, so there the lane stays off.
  // Cost: Merged nothing. Separate: 10/s two classes; 20/s while the shield is empty; every frame while it
  // has points, a barrier is up or the scale is corrected: two bar reads (three with a barrier, one more
  // after a change), work only on change,
  // classes, texts and owned-panel validity every 50 ms. Writes only on change, inline only (QOLLOCK's
  // pak03 replaces the stock sheets). Bench: .scratch/shieldbar/bench.js (issues/38, bench).
  var LEGACY_ATTR = "hpc3_legacy_shield";
  var LEGACY_OWN = { label: "HPColorsLegacyHealthLabel", zero: "HPColorsLegacyShieldZero", lines: "HPColorsLegacyLines",
    barrier: "HPColorsLegacyBarrier", barrierNumber: "HPColorsLegacyBarrierNumber" };
  var LEGACY_RAT_KING = "#C8A165"; // #ratking_armor_bar .ProgressBarMiddle, hud_health.css 6711-6805
  // modifier_ratking_ratarmor is the caster's own armour (abilities.vdata "ratking_armor_caster").
  var LEGACY_RAT_KING_HERO = "hero_ratking";
  // Pre-6711 "#shield_bar, #tech_shield_bar" (hud_health.css 6710), offBlack as hex; margin-right is
  // 29px alone and 12px beside an active shield bar (".shieldActive #tech_shield_bar").
  var LEGACY_BARRIER_STYLE = { backgroundColor: "rgba(0, 0, 0, 0.6)", border: "2px solid #10130D", borderRadius: "3px",
    ignoreParentFlow: "true", horizontalAlign: "right", transform: "rotateZ(12deg)", marginTop: "30px" };
  // The recent heal/damage counters sit in #HealthRegenAndTotal at 6711+ offsets (165px/160px) made for its
  // 250px width; in the old 115px box they start past its right edge, so they get 6710's too, heal included
  // while shielded: any spot right of the damage is cut at the health area's edge (live 6819, ticket 41).
  var LEGACY_LAYOUT = [["regen", { width: "115px", horizontalAlign: "right", marginTop: "5px", marginRight: "10px" }],
    ["healCounters", { marginLeft: "35px", marginTop: "30px" }], ["damageCounters", { marginLeft: "35px", marginTop: "160px" }],
    ["box", { marginRight: "10px" }], ["numbers", { marginRight: "23px", visibility: "visible" }],
    ["shieldLeft", { backgroundColor: "#4BDC68" }]];
  // QOLLOCK 4.0.5 healthbar types 1-5 (core/ql_hud.js): each restyles these panels, so LEGACY_LAYOUT stays off.
  var LEGACY_QOL_THEMES = ["minimalist_healthbar_active", "fg_healthbar_active", "klutz_healthbar_active",
    "budhud_healthbar_active", "minecraft_healthbar_active"];
  var LEGACY_QOL_HIDDEN = "minecraft_healthbar_active"; // #HealthBarContent at opacity 0.0001
  // Inline styles this lane may own: [panel, property, stock-equivalent written before the clear, so the
  // stock look stays even if a clear does not take]. Live 6779/6782: margin longhands and horizontalAlign
  // throw when cleared alone, so margins clear through their base and the alignment goes back to the
  // sheet value (hud_health_container.css 6711-6805).
  var LEGACY_OWNED = [["regen", "width"], ["regen", "margin"], ["regen", "horizontalAlign"], ["healCounters", "margin"], ["damageCounters", "margin"], ["box", "margin"],
    ["numbers", "margin"], ["numbers", "visibility"], ["shieldLeft", "backgroundColor"], ["shield", "visibility", "collapse"],
    ["merged", "visibility", "visible"], ["armor", "visibility"], ["lines", "visibility", "visible"], ["current", "opacity", "1"],
    ["bulletBox", "visibility"], ["bullet", "opacity", "1"], ["techBox", "visibility", "collapse"], ["tech", "opacity", "1"]];
  // Watch cadence: a due callback runs once per frame, so this is every frame up to 120 fps (user choice,
  // 2026-10-21: above 120 fps a correction can land a frame later, for fewer calls per second).
  var LEGACY_FRAME = 1 / 120;
  // Full class/text samples: every 50 ms while a shield max, barrier or corrected scale can change unseen, else 100 ms.
  var LEGACY_SAMPLE_FAST_MS = 50, LEGACY_SAMPLE_SLOW_MS = 100, LEGACY_IDLE_S = 0.1;
  var LEGACY_SCALED = ["health", "damage", "heal"]; // bars drawn on the D scale whose max is corrected
  var legacy = { job: null, container: null, p: null, styles: {}, scale: 1, scaled: {}, read: null, fullAt: NaN, qolFor: null, qol: false, themed: false,
    label: null, zero: null, lines: null, linesMax: NaN, text: "", colorKey: "", colorTicks: 0,
    barrierBar: null, barrierParts: false, barrierNumber: null, barrierPeak: 0, barrierFill: NaN, barrierText: "", revalidate: false };
  function legacyWanted() {
    var shared = effectiveSettings && effectiveSettings.shared;
    return !!shared && shared.enabled === true && publicationResolved && shared.hudShieldStyle === "separate"; // HUD_KEYS: enabled, hudShieldStyle
  }
  // scale NaN: the first tick writes max even over an earlier context's leftover, whose owned panels are reused.
  function legacyReset(container, p) {
    legacy.container = container; legacy.p = p; legacy.styles = {}; legacy.scale = p ? NaN : 1; legacy.scaled = {};
    legacy.read = null; legacy.fullAt = NaN; legacy.text = ""; legacy.colorKey = ""; legacy.linesMax = NaN;
    legacy.label = p ? p.box.FindChildTraverse(LEGACY_OWN.label) : null;
    legacy.zero = p ? p.bulletBox.FindChildTraverse(LEGACY_OWN.zero) : null;
    legacy.lines = p ? legacySibling(p.lines, true) : null;
    legacy.barrierBar = p ? legacyOwnBarrier(p) : null; legacy.barrierParts = false;
    legacy.barrierNumber = p && p.techBox ? p.techBox.FindChildTraverse(LEGACY_OWN.barrierNumber) : null;
    legacy.barrierPeak = 0; legacy.barrierFill = NaN; legacy.barrierText = "";
  }
  // The owned #tech_shield_bar beside the game's #shield_bar.
  function legacyOwnBarrier(p) {
    var list = valid(p.shield) && valid(p.shield.GetParent()) ? p.shield.GetParent().Children() : [];
    for (var i = 0; i < list.length; i++) if (list[i].BHasClass(LEGACY_OWN.barrier)) return list[i];
    return null;
  }
  // All stock panels the lane uses, or null while any is missing.
  function legacyPanels(container) {
    if (!valid(container)) return null;
    var bars = container.FindChildTraverse("hud_health_bars"), regen = container.FindChildTraverse("HealthRegenAndTotal");
    var byId = function (parent, id) { return valid(parent) ? parent.FindChildTraverse(id) : null; };
    var byClass = function (parent, name) {
      var list = valid(parent) ? parent.FindChildrenWithClassTraverse(name) : [];
      for (var i = 0; i < list.length; i++) if (list[i].id !== LEGACY_OWN.label && list[i].id !== LEGACY_OWN.zero && list[i].id !== LEGACY_OWN.barrierNumber) return list[i];
      return null;
    };
    var p = { bars: bars, regen: regen, health: byId(bars, "health_bar"), damage: byId(bars, "pending_incoming_damage"),
      heal: byId(bars, "pending_incoming_heal"), merged: byId(bars, "shield_bar_2"), armor: byId(bars, "ratking_armor_bar"), shield: byId(bars, "shield_bar"),
      shieldLeft: byId(bars, "shield_bar_Left"), lines: legacySibling(byId(bars, "healthLines"), false),
      numbers: byClass(regen, "shieldNumbersContainer"), box: byClass(regen, "healthContainer"), bulletBox: byId(regen, "BulletShieldNumbers") };
    p.bullet = byClass(p.bulletBox, "progress_bar_current"); p.bulletMax = byClass(p.bulletBox, "progress_bar_max");
    p.current = byClass(p.box, "currentHealthLabel"); p.total = byClass(p.box, "totalHealthLabel");
    for (var key in p) if (!valid(p[key])) return null;
    // Optional: the unfed spirit-shield numbers carry the barrier number while they exist.
    p.techBox = byId(regen, "TechShieldNumbers"); p.tech = byClass(p.techBox, "progress_bar_current");
    if (!valid(p.techBox) || !valid(p.tech)) p.techBox = p.tech = null;
    // Optional: the recent heal/damage counters; without them the rest of the old layout still applies.
    p.healCounters = byId(regen, "RecentHealContainer"); p.damageCounters = byId(regen, "RecentDamageContainer");
    return p;
  }
  // The game's #healthLines (own = false) or the owned copy beside it (own = true).
  function legacySibling(lines, own) {
    var list = valid(lines) && valid(lines.GetParent()) ? lines.GetParent().Children() : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === "healthLines" && list[i].BHasClass(LEGACY_OWN.lines) === own) return list[i];
    return null;
  }
  function legacyStyle(panel, id, property, value) {
    if (legacy.styles[id] === value || !valid(panel)) return;
    try { panel.style[property] = value; legacy.styles[id] = value; }
    catch (error) {
      delete legacy.styles[id];
      // HPV3_DEBUG $.Msg("[HPV3] legacy shield write failed: " + id + " " + error);
    }
  }
  function writeLegacy(key, property, value) { legacyStyle(legacy.p[key], key + "." + property, property, value); }
  function showLegacy(id, panel, shown) { legacyStyle(panel, id + ".visibility", "visibility", shown ? "visible" : "collapse"); }
  // Health follows every change. The pending damage/heal bars draw only while UpdateBar sets their
  // pending*Active class (otherwise their middle is empty), so then they follow every change, else at
  // most once per 50 ms sample. Each bar keeps its own written value; a refused write is retried.
  function scaleLegacy(k, all) {
    legacy.scale = k;
    for (var i = 0; i < LEGACY_SCALED.length; i++) {
      var key = LEGACY_SCALED[i];
      if (legacy.scaled[key] === k || i > 0 && !all) continue;
      try { legacy.p[key].max = k; legacy.scaled[key] = k; } catch (error) { legacy.scaled[key] = NaN; }
    }
  }
  // Hands everything back, also what an earlier menu context left (marked on the container: "1", or "2"
  // under a QOLLOCK theme, whose layout this lane never wrote and so never clears).
  function releaseLegacy(container) {
    if (legacy.job) { $.CancelScheduled(legacy.job); legacy.job = null; }
    var mark = valid(container) ? container.GetAttributeString(LEGACY_ATTR, "") : "";
    var p = legacy.p && legacy.container === container ? legacy.p : null;
    if (!p && mark !== "") p = legacyPanels(container);
    if (p) {
      LEGACY_OWNED.forEach(function (entry) {
        var panel = p[entry[0]], property = entry[1];
        if (!valid(panel) || mark === "2" && LEGACY_LAYOUT.some(function (layout) { return layout[0] === entry[0]; })) return;
        try {
          if (entry[2]) panel.style[property] = entry[2];
          panel.style[property] = property === "horizontalAlign" ? "center" : null;
        }
        catch (error) {
          // HPV3_DEBUG $.Msg("[HPV3] legacy shield release failed: " + entry[0] + "." + property + " " + error);
        }
      });
      LEGACY_SCALED.forEach(function (key) { if (valid(p[key])) try { p[key].max = 1; } catch (error) { /* Gone. */ } });
      [valid(p.box) ? p.box.FindChildTraverse(LEGACY_OWN.label) : null, valid(p.bulletBox) ? p.bulletBox.FindChildTraverse(LEGACY_OWN.zero) : null,
        legacySibling(p.lines, true), legacyOwnBarrier(p), valid(p.techBox) ? p.techBox.FindChildTraverse(LEGACY_OWN.barrierNumber) : null].forEach(function (panel) {
        if (valid(panel)) try { panel.style.visibility = "collapse"; } catch (error) { /* Gone. */ }
      });
      if (valid(container)) container.SetAttributeString(LEGACY_ATTR, "");
    }
    legacyReset(null, null);
  }
  // QOLLOCK: its pak03 adds #currentHealthOverHearts to every healthbar type (looked up once per container).
  // The theme class on an ancestor is read on each 1 s HUD watch: "" (none), a theme, or the hidden one.
  function legacyTheme(container) {
    if (legacy.qolFor !== container) { legacy.qolFor = container; legacy.qol = !!container.FindChildTraverse("currentHealthOverHearts"); }
    if (!legacy.qol) return "";
    for (var i = 0; i < LEGACY_QOL_THEMES.length; i++) if (container.BAscendantHasClass(LEGACY_QOL_THEMES[i])) return LEGACY_QOL_THEMES[i];
    return "";
  }
  function syncLegacy(found) {
    var container = found ? hud.container : null;
    if (legacy.container && legacy.container !== container) releaseLegacy(legacy.container);
    if (!valid(container)) return;
    var theme = legacyWanted() ? legacyTheme(container) : null;
    if (theme === null || theme === LEGACY_QOL_HIDDEN) { releaseLegacy(container); return; }
    if (legacy.p && legacy.themed !== (theme !== "")) releaseLegacy(container);
    if (!legacy.p) {
      // A HUD with a panel still missing is retried by the 1 s HUD watch.
      var p = legacyPanels(container);
      if (!p) return;
      legacyReset(container, p);
      legacy.themed = theme !== "";
      container.SetAttributeString(LEGACY_ATTR, legacy.themed ? "2" : "1");
      if (!legacy.themed) LEGACY_LAYOUT.forEach(function (entry) { for (var property in entry[1]) writeLegacy(entry[0], property, entry[1][property]); });
    }
    if (!legacy.job) legacyTick();
  }
  function legacyInt(text) { var match = /^\s*(?:\/\s*)?(\d+)\s*$/.exec(String(text)); return match ? Number(match[1]) : NaN; }
  // An owned label with a game class, laid over the game label it stands in for (out of the flow).
  // A freshly created owned panel starts with none of its write-cache entries (see the style writer above).
  function forgetLegacy(id) { delete legacy.styles[id + ".visibility"]; delete legacy.styles[id + ".color"]; delete legacy.styles[id + ".marginRight"]; }
  function legacyOwnLabel(parent, id, className, over, text) {
    var label = passive("Label", parent, id, className, text); label.style.visibility = "collapse";
    try { label.style.ignoreParentFlow = "true"; } catch (error) { /* Below it instead. */ }
    parent.MoveChildAfter(label, over);
    forgetLegacy(id);
    return label;
  }
  // Ticks at max HP, rebuilt only when max HP changes.
  function legacyLines(max) {
    var game = legacy.p.lines;
    if (!legacy.lines) {
      legacy.lines = passive("Panel", game.GetParent(), "healthLines", LEGACY_OWN.lines);
      game.GetParent().MoveChildAfter(legacy.lines, game);
      legacy.linesMax = NaN; forgetLegacy("ownLines");
    }
    if (legacy.linesMax !== max) {
      legacy.linesMax = max;
      legacy.lines.RemoveAndDeleteChildren();
      var count = Math.floor(max / 250);
      for (var i = 1; i <= (count > 50 ? 0 : count); i++) {
        passive("Panel", legacy.lines, "", i * 250 % 1000 === 0 ? "line_large" : "line_small").style.position = "0px " + (100 * (1 - i * 250 / max)).toFixed(3) + "% 0px";
      }
    }
    return legacy.lines;
  }
  function legacyTick() {
    legacy.job = null;
    if (retired || !legacyWanted() || !legacy.p) return;
    var p = legacy.p, r = legacy.read, now = Date.now(), lower = NaN, upper = NaN, top = NaN, points = NaN;
    var full = !r || !(now - legacy.fullAt < (r.capacity || r.barrier || legacy.scale !== 1 ? LEGACY_SAMPLE_FAST_MS : LEGACY_SAMPLE_SLOW_MS));
    try {
      if (r && !r.barrier && !(r.shieldValue > 0)) {
        // Watch: with no shield points and no barrier the ratking top (h+S+B)/D equals h/D. Shield points or
        // a barrier appearing move D (so h/D) or the top, whichever the other does not, so both are read
        // (live 6805: until the next sample, the frame a barrier appeared showed a gap and the merged number).
        lower = Number(p.health.lowervalue); top = Number(p.armor.uppervalue);
        if (!full && lower === r.lower && top === r.top) return legacySchedule();
        upper = Number(p.merged.uppervalue);
        if (top !== lower) full = true; // something above health: take the classes now
      } else {
        // h/D and (h+S)/D move whenever h, S or D does; with a barrier its top (h+S+B)/D is read too.
        lower = Number(p.health.lowervalue); upper = Number(p.merged.uppervalue);
        if (r && r.barrier) top = Number(p.armor.uppervalue);
        if (!full && lower === r.lower && upper === r.upper && (!r.barrier || top === r.top)) return legacySchedule();
      }
      points = Number(p.shield.lowervalue);
    }
    catch (error) { /* A dead HUD; the sample below hands it back. */ }
    if (full) {
      // The stock HUD is built and removed as a whole, so one panel tells whether it is alive.
      if (!valid(p.health)) { var gone = legacy.container; releaseLegacy(gone); paintHud(); return; }
      r = legacySample(p, now, points);
    }
    r.lower = lower; r.upper = upper; r.top = top; r.shieldValue = points;
    // Owned panels die only with the HUD; if one fails anyway, the next sample revalidates them.
    try { legacyApply(p, r, full); } catch (error) { legacy.fullAt = NaN; r.lower = NaN; legacy.revalidate = true; }
    legacySchedule();
  }
  // Every 50 ms at most: classes, the slow texts and the empty-shield "0".
  function legacySample(p, now, shieldValue) {
    var r = legacy.read || (legacy.read = {});
    legacy.fullAt = now;
    if (legacy.revalidate) {
      legacy.revalidate = false;
      if (legacy.label && !valid(legacy.label)) legacy.label = null;
      if (legacy.zero && !valid(legacy.zero)) legacy.zero = null;
      if (legacy.lines && !valid(legacy.lines)) { legacy.lines = null; legacy.linesMax = NaN; }
      if (legacy.barrierBar && !valid(legacy.barrierBar)) { legacy.barrierBar = null; legacy.barrierParts = false; }
      if (legacy.barrierNumber && !valid(legacy.barrierNumber)) legacy.barrierNumber = null;
    }
    if (legacy.barrierBar && !legacy.barrierParts) legacyBarrierParts();
    r.capacity = p.bars.BHasClass("shieldActive"); // the shield max, also when empty
    r.barrier = p.bars.BHasClass("ratKingArmorActive");
    writeLegacy("shield", "visibility", r.capacity ? "visible" : "collapse");
    writeLegacy("merged", "visibility", "collapse");
    writeLegacy("armor", "visibility", "collapse");
    writeLegacy("bulletBox", "visibility", r.capacity ? "visible" : null);
    r.pending = r.shieldMax = r.textHealth = undefined; // read on demand, once per sample
    r.max = r.capacity || r.barrier || legacy.scale !== 1 ? legacyInt(p.total.text) : NaN;
    // Live 6805: with the shield empty the game's shield number did not read as 0.
    var zero = r.capacity && !(shieldValue > 0) && legacyInt(p.bullet.text) !== 0;
    if (zero && !legacy.zero) legacy.zero = legacyOwnLabel(p.bulletBox, LEGACY_OWN.zero, "progress_bar_current", p.bullet, "0");
    showLegacy(LEGACY_OWN.zero, legacy.zero, zero);
    writeLegacy("bullet", "opacity", zero ? "0" : "1");
    return r;
  }
  // Pure: D from bars UpdateBar writes in one pass (shield points over the shield span), or NaN.
  function legacyBarScale(lower, upper, points) { var span = upper - lower; return points > 0 && span > 0 ? points / span : NaN; }
  // Pure: h from the HP text h + S + B, the health lower h/D and the ratking top (h + S + B)/D, read together.
  function legacyTextHealth(total, lower, top) { return total > 0 && top > 0 ? Math.round(total * lower / top) : NaN; }
  // Pure: D from health h and the health lower h/D, or NaN.
  function legacyHealthScale(health, lower) { return health > 0 && lower > 0 ? health / lower : NaN; }
  // Pure: health h and the max correction k = max HP / D; k = 1 and h = NaN when they cannot be trusted.
  function legacyCorrection(out, lower, scale, max) {
    var health = NaN, k = 1;
    if (scale > 0) { health = Math.round(lower * scale); k = max / scale; }
    if (!(health >= 0) || health > max) { health = NaN; k = 1; }
    else if (!(k > 0 && k <= 2) || Math.abs(k - 1) < 0.002) k = 1;
    out.health = health; out.k = k;
    return out;
  }
  // Whether a pending bar draws, read only when its max would change, once per sample.
  function legacyPending(p, r, k) {
    if (r.pending === undefined && (legacy.scaled.damage !== k || legacy.scaled.heal !== k))
      r.pending = p.bars.BHasClass("pendingIncomingDamageActive") || p.bars.BHasClass("pendingIncomingHealActive");
    return r.pending === true;
  }
  function legacyApply(p, r, full) {
    var shieldUp = r.capacity && r.shieldValue > 0, scale = NaN;
    r.health = NaN; r.k = 1;
    if (r.max > 0 && (r.capacity || r.barrier || legacy.scale !== 1)) {
      if (shieldUp && r.shieldMax === undefined) r.shieldMax = legacyInt(p.bulletMax.text);
      scale = legacyBarScale(r.lower, r.upper, shieldUp ? r.shieldValue * r.shieldMax : 0);
      if (!(scale > 0)) {
        // The HP text is read only when the bars cannot give D, once per sample, with that tick's bars.
        // Without shield points or a barrier the top (h+S+B)/D is h/D, the health lower.
        if (r.textHealth === undefined) {
          if (!r.barrier) r.top = shieldUp ? Number(p.armor.uppervalue) : r.lower;
          r.textHealth = legacyTextHealth(legacyInt(p.current.text), r.lower, r.top);
        }
        scale = legacyHealthScale(r.textHealth, r.lower);
      }
      legacyCorrection(r, r.lower, scale, r.max);
    }
    var k = r.k, corrected = k !== 1;
    // HPV3_DEBUG if (corrected !== (legacy.scale !== 1)) $.Msg("[HPV3] legacy shield scale " + k.toFixed(3) + " health " + r.health + "/" + r.max + " lower " + r.lower.toFixed(3) + " shield " + r.shieldValue + " barrier " + r.barrier);
    scaleLegacy(k, full || legacyPending(p, r, k));
    writeLegacy("lines", "visibility", corrected ? "collapse" : "visible");
    showLegacy("ownLines", corrected ? legacyLines(r.max) : legacy.lines, corrected);
    legacyNumber(p, (shieldUp || r.barrier) && r.health >= 0, r.health, r.max);
    legacyBarrier(p, r, r.barrier && r.health >= 0 ? Math.round((r.top - r.upper) * scale) : NaN);
  }
  // The Rat King barrier in the old spirit-shield pair: bar = B over its peak, number = B.
  function legacyBarrier(p, r, points) {
    var shown = points >= 0;
    if (shown) {
      var bar = legacyBarrierBar(p), fill = (legacy.barrierPeak = Math.max(legacy.barrierPeak, points)) > 0 ? points / legacy.barrierPeak : 0;
      if (legacy.barrierFill !== fill) { bar.lowervalue = fill; bar.uppervalue = fill; legacy.barrierFill = fill; }
      legacyStyle(bar, "ownBarrier.marginRight", "marginRight", r.capacity ? "12px" : "29px");
    } else legacy.barrierPeak = 0;
    showLegacy("ownBarrier", legacy.barrierBar, shown);
    if (!p.techBox) return;
    if (shown && !legacy.barrierNumber) {
      legacy.barrierNumber = legacyOwnLabel(p.techBox, LEGACY_OWN.barrierNumber, "progress_bar_current", p.tech); legacy.barrierText = "";
    }
    if (shown) {
      var text = String(points);
      if (legacy.barrierText !== text) { legacy.barrierNumber.text = text; legacy.barrierText = text; }
      legacyStyle(legacy.barrierNumber, LEGACY_OWN.barrierNumber + ".color", "color", LEGACY_RAT_KING);
    }
    showLegacy(LEGACY_OWN.barrierNumber, legacy.barrierNumber, shown);
    writeLegacy("techBox", "visibility", shown ? "visible" : null);
    writeLegacy("tech", "opacity", shown ? "0" : "1");
  }
  // Created on the first barrier: the game builds a ProgressBarWithMiddle's Left/Middle/Right parts,
  // which are coloured once they exist.
  function legacyBarrierBar(p) {
    if (!legacy.barrierBar) {
      var parent = p.shield.GetParent(), bar = $.CreatePanel("ProgressBarWithMiddle", parent, "tech_shield_bar", { vertical: "true", "class": "small_progress_bar" });
      bar.AddClass("small_progress_bar"); bar.AddClass(LEGACY_OWN.barrier); bar.hittest = false;
      parent.MoveChildBefore(bar, p.shield);
      for (var property in LEGACY_BARRIER_STYLE) try { bar.style[property] = LEGACY_BARRIER_STYLE[property]; } catch (error) { /* Stock look otherwise. */ }
      bar.style.visibility = "collapse";
      legacy.barrierBar = bar; legacy.barrierFill = NaN;
      forgetLegacy("ownBarrier");
      legacyBarrierParts();
    }
    return legacy.barrierBar;
  }
  // Colours the bar parts once they exist: at creation, else retried by the 50 ms sample.
  function legacyBarrierParts() {
    var parts = { ProgressBarLeft: LEGACY_RAT_KING, ProgressBarMiddle: "rgba(0, 0, 0, 0)", ProgressBarRight: "rgba(0, 0, 0, 0)" }, found = 0;
    for (var name in parts) {
      var part = legacy.barrierBar.FindChildrenWithClassTraverse(name)[0];
      if (valid(part)) { part.style.backgroundColor = parts[name]; found++; }
    }
    legacy.barrierParts = found === 3;
  }
  // While the shield has points, the HP number is health in an owned label; the game's is faded under it.
  function legacyNumber(p, number, health, max) {
    if (number && !legacy.label) { legacy.label = legacyOwnLabel(p.box, LEGACY_OWN.label, "currentHealthLabel", p.current); legacy.text = ""; }
    var label = legacy.label;
    if (number) {
      var text = String(health), colorId = LEGACY_OWN.label + ".color", colorKey = text + "/" + max;
      if (legacy.text !== text) { label.text = text; legacy.text = text; }
      // The game's mid/low classes follow health / max HP, so the colour is re-read only when either
      // changes or the label is shown again, for two ticks in case the class lands a frame later.
      if (legacy.colorKey !== colorKey || legacy.styles[LEGACY_OWN.label + ".visibility"] !== "visible") { legacy.colorKey = colorKey; legacy.colorTicks = 2; }
      if (legacy.colorTicks > 0) {
        legacy.colorTicks = Math.max(0, legacy.colorTicks - 1);
        legacyStyle(label, colorId, "color", p.current.BAscendantHasClass("localPlayerLowHealth") ? "#FF5656" :
          p.current.BAscendantHasClass("localPlayerMidHealth") ? "#DDFF56" : "#FFEFD7");
      }
    }
    showLegacy(LEGACY_OWN.label, label, number);
    // HPV3_DEBUG if (number !== (legacy.styles["current.opacity"] === "0")) $.Msg("[HPV3] legacy shield number " + (number ? "owned " + health : "game") + " game text=" + p.current.text + " shield text=" + p.bullet.text);
    writeLegacy("current", "opacity", number ? "0" : "1");
  }
  // Every frame up to 120 fps (Panorama runs a due callback once per frame; quiet frames cost two or three bar reads)
  // wherever the bar can change unseen: a shield max, a barrier, a corrected scale, or a local hero that
  // is Rat King or not known yet. Otherwise only native changes happen, so 10/s keeps the classes fresh.
  function legacySchedule() {
    var r = legacy.read, token = generation;
    var watch = !r || r.capacity || r.barrier || legacy.scale !== 1 || identity.hero === "" || identity.hero === LEGACY_RAT_KING_HERO;
    legacy.job = $.Schedule(watch ? LEGACY_FRAME : LEGACY_IDLE_S, function legacyShieldTick() {
      if (token === generation) legacyTick(); else legacy.job = null;
    });
  }

  // ---- Value normalisation (schema bounds/step; thresholds keep low < high) ----
  function decimals(step) { var text = String(step); return text.indexOf(".") < 0 ? 0 : text.length - text.indexOf(".") - 1; }
  // thresholds: the settings whose low/high pair clamps the value, or null for a condition value (no pair).
  function normalizeNumber(row, raw, thresholds) {
    if (raw === null || raw === undefined || !String(raw).trim()) return null;
    var value = Number(raw);
    if (!Number.isFinite(value)) return null;
    var min = row.bounds[0], max = row.bounds[1];
    value = min + Math.round((Math.max(min, Math.min(max, value)) - min) / row.step) * row.step;
    value = Number(Math.min(max, value).toFixed(decimals(row.step)));
    if (row.key === "lowThreshold" && thresholds && thresholds.shared.highThreshold !== undefined) value = Math.min(value, thresholds.shared.highThreshold - THRESHOLD_GAP);
    if (row.key === "highThreshold" && thresholds && thresholds.shared.lowThreshold !== undefined) value = Math.max(value, thresholds.shared.lowThreshold + THRESHOLD_GAP);
    return value;
  }
  function normalizeColor(raw) {
    var text = String(raw === undefined || raw === null ? "" : raw).trim();
    if (text.charAt(0) !== "#") text = "#" + text;
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toUpperCase() : null;
  }
  // Stock colour-slider ramp, including black/white end caps. Hex/picker values are never
  // quantized: the nearest ramp position is only a view of the full RGB value.
  var HUE_STOPS = [[0, [0, 0, 0]], [0.08, [255, 0, 0]], [0.22, [255, 255, 0]],
    [0.36, [0, 255, 0]], [0.5, [0, 255, 255]], [0.64, [0, 0, 255]],
    [0.78, [255, 0, 255]], [0.92, [255, 0, 0]], [1, [255, 255, 255]]];
  function hueToHex(t) {
    if (!Number.isFinite(t)) return null;
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < HUE_STOPS.length; i++) {
      var a = HUE_STOPS[i - 1], b = HUE_STOPS[i];
      if (t > b[0]) continue;
      var k = (t - a[0]) / (b[0] - a[0]);
      return "#" + a[1].map(function (v, j) {
        var hex = Math.round(v + (b[1][j] - v) * k + 1e-9).toString(16);
        return hex.length < 2 ? "0" + hex : hex;
      }).join("").toUpperCase();
    }
    return "#FFFFFF";
  }
  function hexToHue(hex) {
    var c = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
    var best = 0, distance = Infinity;
    // Project onto each straight ramp segment; exact and avoids 401 samples per colour sync.
    for (var i = 1; i < HUE_STOPS.length; i++) {
      var a = HUE_STOPS[i - 1], b = HUE_STOPS[i], dot = 0, length = 0;
      for (var j = 0; j < 3; j++) { var d = b[1][j] - a[1][j]; dot += (c[j] - a[1][j]) * d; length += d * d; }
      var k = Math.max(0, Math.min(1, dot / length)), error = 0;
      for (var n = 0; n < 3; n++) { var delta = c[n] - a[1][n] - (b[1][n] - a[1][n]) * k; error += delta * delta; }
      if (error < distance) { distance = error; best = a[0] + (b[0] - a[0]) * k; }
    }
    return best;
  }

  // ---- Ability conditions: one isolated draft, authored rules share the ordinary history ----
  function cellFor(row) {
    return rowCells.get(row);
  }
  function syncAbilitySlots() {
    if (!conditionDraft) return;
    var hero = heroByKey[identity.hero];
    for (var slot = 1; slot <= ABILITY_SLOTS; slot++) {
      var prefix = "HPColorsConditionSlot" + slot, image = panel(prefix + "Image");
      var path = hero && hero.abilities && hero.abilities[slot - 1] || null;
      var cached = conditionImages[slot - 1];
      if (!cached || cached.panel !== image || cached.path !== path) {
        if (path && image) image.SetImage(path);
        conditionImages[slot - 1] = { panel: image, path: path };
      }
      if (panel(prefix)) {
        panel(prefix).SetHasClass("HasIcon", !!path);
        panel(prefix).SetHasClass("Unavailable", tiers[slot - 1] === -1);
        // Stock tier art shows the required tier on the selected slot and the live tier elsewhere.
        var shown = slot === conditionDraft.rule.slot ? conditionDraft.rule.minTier : tiers[slot - 1];
        for (var tier = 1; tier <= MAX_TIER; tier++) {
          panel(prefix).SetHasClass("ShowTier" + tier, shown === tier);
        }
      }
    }
  }
  function syncCondition() {
    if (!conditionDraft) return;
    var draft = conditionDraft, row = draft.row, rule = draft.rule;
    syncAbilitySlots();
    for (var slot = 1; slot <= ABILITY_SLOTS; slot++) {
      panel("HPColorsConditionSlot" + slot).SetHasClass("Checked", slot === rule.slot);
      setLabel("HPColorsConditionSlot" + slot + "Label", slot === rule.slot ? "TIER " + rule.minTier + "+" : "");
    }
    var ordinary = valuesFor(config.settings, row)[row.key];
    var equal = controlType(row).equal(rule.value, ordinary);
    panel("HPColorsConditionApplyButton").enabled = draft.valid && !equal;
    panel("HPColorsConditionRemoveButton").enabled = !!config.rules[draft.cell];
    panel("HPColorsConditionBooleanToggle").SetHasClass("Checked", rule.value === true);
    if (row.type === "enum") panel("HPColorsConditionOptions").Children().forEach(function (button, index) {
      button.SetHasClass("Checked", row.options[index].value === rule.value);
      // Lowercase "fill" is a stock selector (.SecondaryButton.light.fill); not proven unused, so kept.
      button.SetHasClass("fill", row.options[index].value === rule.value);
    });
    if (row.type === "color") panel("HPColorsConditionSwatch").style.backgroundColor = rule.value;
    setLabel("HPColorsConditionStatus", !draft.valid ? "Enter a valid " + row.type + " value." :
      equal ? "Choose a different value from the ordinary setting." : row.type === "boolean" ? rule.value ? "ON" : "OFF" : "Only Apply changes this rule.");
  }
  function changeCondition(value) {
    if (!conditionDraft || syncing) return;
    conditionDraft.valid = value !== null && contractRef.validateValue(conditionDraft.row, value);
    if (conditionDraft.valid) conditionDraft.rule.value = value;
    syncCondition();
  }
  function readConditionEditor(rejectedCommit) {
    if (!conditionDraft) return;
    var row = conditionDraft.row;
    var type = controlType(row), edited = type.readEditor(row);
    if (edited !== undefined) changeCondition(edited);
    if (rejectedCommit === true && !conditionDraft.valid) trigger(panel(type.field), "HPC3NegativeShake");
  }
  function closeCondition() {
    if (!conditionDraft) return;
    if (picker && picker.owner === CONDITION_PICKER) closePicker(true);
    var row = conditionDraft.row;
    conditionDraft = null;
    leaveDialog("HPColorsConditionDialog", row.conditionId, true);
    resumeHeroRoute();
  }
  function openCondition(row) {
    if (!rowActive(row)) return;
    closeFor(CLOSES_ON_OPEN.condition);
    var cell = cellFor(row), rule = config.rules[cell];
    conditionDraft = { row: row, cell: cell, valid: true, rule: rule ? clone(rule) :
      { slot: 1, minTier: 1, value: valuesFor(config.settings, row)[row.key] } };
    setLabel("HPColorsConditionTitle", "CONDITION");
    setLabel("HPColorsConditionSubtitle", ((row.name || row.key) + " · " + row.side).toUpperCase());
    // The editors in CONTROL_TYPES order (boolean, enum, number, color); only the row's own type shows.
    for (var name in CONTROL_TYPES) panel("HPColorsCondition" + CONTROL_TYPES[name].editor).SetHasClass("HPC3Hidden", row.type !== name);
    var options = panel("HPColorsConditionOptions"); options.RemoveAndDeleteChildren();
    if (row.type === "enum") row.options.forEach(function (option, index) {
      var button = $.CreatePanel("Button", options, "HPColorsConditionOption" + index);
      button.AddClass("InputButton"); button.AddClass("Fill"); button.AddClass("HPC3DialogButton"); button.AddClass("HPC3ConditionSlot");
      passive("Panel", passive("Panel", button, "", "Bottom"), "", "Background");
      passive("Panel", passive("Panel", button, "", "Top"), "", "Background");
      passive("Label", passive("Panel", button, "", "Content"), "", "", option.label.toUpperCase());
      button.SetPanelEvent("onactivate", function () { if (!retired && valid(button) && conditionDraft && conditionDraft.row === row) changeCondition(option.value); });
    });
    syncing = true;
    try {
      var value = conditionDraft.rule.value;
      controlType(row).seedEditor(row, value);
    } finally { syncing = false; }
    syncCondition();
    sampleTiers();
    panel("HPColorsConditionDialog").AddClass("Open");
    panel("HPColorsConditionSlot" + conditionDraft.rule.slot).SetFocus();
  }
  function applyCondition(remove) {
    if (!conditionDraft || retired) return;
    if (!remove) {
      readConditionEditor();
      if (!conditionDraft.valid || !panel("HPColorsConditionApplyButton").enabled) return;
    }
    var draft = conditionDraft, rules = clone(config.rules);
    if (remove) delete rules[draft.cell]; else rules[draft.cell] = clone(draft.rule);
    closeCondition();
    editSettings(config.settings, rules);
  }
  function bindConditions() {
    for (var slot = 1; slot <= ABILITY_SLOTS; slot++) (function (number) {
      on("HPColorsConditionSlot" + number, "onactivate", function () {
        if (!conditionDraft) return;
        if (conditionDraft.rule.slot === number) conditionDraft.rule.minTier = conditionDraft.rule.minTier % MAX_TIER + 1;
        else conditionDraft.rule.slot = number;
        syncCondition();
      });
      on("HPColorsConditionSlot" + number, "onmouseover", function () {
        $.DispatchEvent("UIShowTextTooltip", panel("HPColorsConditionSlot" + number),
          "Signature ability " + number + " · Click the selected ability to cycle the required tier.");
      });
      on("HPColorsConditionSlot" + number, "onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", panel("HPColorsConditionSlot" + number)); });
    })(slot);
    on("HPColorsConditionBooleanToggle", "onactivate", function () { if (conditionDraft) changeCondition(!conditionDraft.rule.value); });
    ["ontextentrychange", "ontextentrysubmit", "onblur"].forEach(function (event) {
      on("HPColorsConditionHex", event, function () { readConditionEditor(event !== "ontextentrychange"); });
      on("HPColorsConditionNumberEntry", event, function () {
        if (syncing) return;
        readConditionEditor(event !== "ontextentrychange");
        if (conditionDraft && conditionDraft.valid) {
          syncing = true;
          try { panel("HPColorsConditionNumberSlider").value = conditionDraft.rule.value; } finally { syncing = false; }
        }
      });
    });
    on("HPColorsConditionNumberSlider", "onvaluechanged", function () {
      if (!conditionDraft || syncing) return;
      changeCondition(normalizeNumber(conditionDraft.row, panel("HPColorsConditionNumberSlider").value, null));
      panel("HPColorsConditionNumberEntry").text = String(conditionDraft.rule.value);
    });
    on("HPColorsConditionSwatch", "onactivate", function () {
      readConditionEditor();
      if (conditionDraft && conditionDraft.valid) openPicker(conditionDraft.row, CONDITION_PICKER);
    });
    on("HPColorsConditionApplyButton", "onactivate", function () { applyCondition(false); });
    on("HPColorsConditionRemoveButton", "onactivate", function () { applyCondition(true); });
    on("HPColorsConditionCancelButton", "onactivate", closeCondition);
  }

  // ---- Model -> controls ----
  // One entry per control type, used by sync, binding, reset, the condition editor and the requirement
  // greying. editor = the condition dialog's editor panel suffix; field = the dialog entry a rejected
  // value shakes; equal compares a rule value with the ordinary one.
  var CONTROL_TYPES = {
    boolean: {
      editor: "BooleanToggle",
      ids: function (row) { return [row.toggleId, row.resetId, row.conditionId]; },
      sync: function (row, value) {
        var target = panel(row.toggleId); if (target) target.SetHasClass("Checked", value === true);
      },
      bind: function (row) {
        on(row.toggleId, "onactivate", function () { commit(row, valuesFor(config.settings, row)[row.key] !== true); });
      }
    },
    enum: {
      editor: "Options",
      ids: function (row) { return [row.resetId, row.conditionId].concat(row.options.map(function (option) { return option.id; })); },
      sync: function (row, value) {
        for (var i = 0; i < row.options.length; i++) {
          var target = panel(row.options[i].id); if (target) target.SetHasClass("Selected", row.options[i].value === value);
        }
      },
      bind: function (row) {
        row.options.forEach(function (option) {
          on(option.id, "onactivate", function () { commit(row, option.value); });
        });
      }
    },
    number: {
      editor: "Number",
      ids: function (row) { return [row.sliderId, row.entryId, row.resetId, row.conditionId]; },
      resetValue: function (row) { return normalizeNumber(row, row.default, config.settings); },
      readEditor: function (row) { return normalizeNumber(row, panel("HPColorsConditionNumberEntry").text, null); },
      seedEditor: function (row, value) {
        var slider = panel("HPColorsConditionNumberSlider");
        slider.min = row.bounds[0]; slider.max = row.bounds[1]; slider.increment = row.step; slider.value = value;
        panel("HPColorsConditionNumberEntry").text = String(value);
        setLabel("HPColorsConditionNumberUnit", row.unit.toUpperCase());
      },
      sync: function (row, value) {
        var target = panel(row.entryId); if (target) target.text = String(value);
        target = panel(row.sliderId); if (target) target.value = value;
      },
      bind: function (row) {
        var slider = panel(row.sliderId);
        if (slider && bound[row.sliderId + "\nrange"] !== slider) {
          bound[row.sliderId + "\nrange"] = slider;
          syncing = true;
          try { slider.min = row.bounds[0]; slider.max = row.bounds[1]; slider.increment = row.step; } finally { syncing = false; }
        }
        var entry = function () {
          if (!panel(row.entryId)) return;
          var value = normalizeNumber(row, panel(row.entryId).text, config.settings);
          if (value === null) trigger(panel(row.entryId), "HPC3NegativeShake");
          commit(row, value);
        };
        on(row.entryId, "ontextentrysubmit", entry);
        on(row.entryId, "onblur", entry);
        bindSliderGesture(row, row.sliderId, function () {
          commit(row, normalizeNumber(row, panel(row.sliderId).value, config.settings));
        });
      }
    },
    color: {
      editor: "Color", field: "HPColorsConditionHex",
      ids: function (row) { return [row.hexId, row.hueId, row.swatchId, row.resetId, row.conditionId]; },
      equal: function (a, b) { return normalizeColor(a) === normalizeColor(b); },
      readEditor: function () { return normalizeColor(panel("HPColorsConditionHex").text); },
      seedEditor: function (row, value) { panel("HPColorsConditionHex").text = value; },
      sync: function (row, value, hueEdit) {
        var target = panel(row.hexId); if (target) target.text = value;
        target = panel(row.swatchId); if (target) target.style.backgroundColor = value;
        var hue = panel(row.hueId);
        if (hue) {
          // A hue edit retains its actual ramp position (red occurs at both 80 and 920).
          if (!hueEdit) hue.value = hexToHue(value) * 1000;
          // Native children are not guaranteed to exist at first boot (or in the VM).
          var cached = hueThumbs[row.hueId], thumb;
          if (cached && cached.slider === hue && valid(cached.thumb)) thumb = cached.thumb;
          else {
            thumb = typeof hue.FindChildTraverse === "function" ? hue.FindChildTraverse("SliderThumb") : null;
            if (!valid(thumb)) thumb = null;
            hueThumbs[row.hueId] = { slider: hue, thumb: thumb };
          }
          if (thumb) thumb.style.backgroundColor = value;
        }
      },
      bind: function (row) {
        var hex = function () {
          if (!panel(row.hexId)) return;
          var value = normalizeColor(panel(row.hexId).text);
          if (value === null) trigger(panel(row.hexId), "HPC3NegativeShake");
          commit(row, value);
        };
        on(row.hexId, "ontextentrysubmit", hex);
        on(row.hexId, "onblur", hex);
        on(row.swatchId, "onactivate", function () { openPicker(row, ROW_PICKER); });
        var hue = panel(row.hueId);
        if (hue && bound[row.hueId + "\nrange"] !== hue) {
          bound[row.hueId + "\nrange"] = hue;
          syncing = true;
          try { hue.min = 0; hue.max = 1000; hue.increment = 1; } finally { syncing = false; }
        }
        bindSliderGesture(row, row.hueId, function () {
          commit(row, hueToHex(Number(panel(row.hueId).value) / 1000), true);
        });
      }
    }
  };
  // Members a type may leave out: boolean/enum have no editor to read or seed, compare plainly and reset to
  // the default. Filled in once at boot; number and color override what differs.
  var BASE_TYPE = {
    field: "HPColorsConditionNumberEntry",
    equal: function (a, b) { return a === b; },
    resetValue: function (row) { return row.default; },
    readEditor: function () { return undefined; },
    seedEditor: function () {}
  };
  for (var typeName in CONTROL_TYPES) {
    for (var member in BASE_TYPE) if (!CONTROL_TYPES[typeName][member]) CONTROL_TYPES[typeName][member] = BASE_TYPE[member];
  }
  function controlType(row) { return CONTROL_TYPES[row.type]; }
  function sync(row, hueEdit) {
    if (!config) return;
    var value = valuesFor(config.settings, row)[row.key], target;
    syncing = true;
    try {
      controlType(row).sync(row, value, hueEdit);
      target = panel(row.rowId); if (target) target.SetHasClass("Changed", value !== row.default);
      target = panel(row.conditionId); if (target) target.SetHasClass("Marked", !!config.rules[cellFor(row)]);
    } finally { syncing = false; }
  }
  function syncAll() {
    for (var i = 0; i < contractRef.controls.length; i++) sync(contractRef.controls[i]);
    syncRequirements();
  }
  // ---- Dependent rows (2026-10-28): a row whose switch or mode is off greys out and takes no input ----
  // requirementRows (key|side -> row) and requirementKeys (every key a condition reads) are built with the
  // contract at boot; shownActive is what each row's panels last showed and is cleared whenever the panels
  // are collected again.
  var requirementRows = {}, requirementKeys = {}, shownActive = {};
  // The rows with a condition and, parallel to them, the ids of the panels each greys (those it has).
  var requirementList = [], requirementIds = [];
  // The words of every unmet condition for one side; a met switch passes on its own row's missing words (cascade).
  function conditionMissing(condition, side) {
    if (condition.any) {
      return condition.any.some(function (inner) { return !conditionMissing(inner, side).length; }) ? [] : [condition.text];
    }
    var holder = condition.shared ? config.settings.shared : config.settings.side[side];
    var value = holder ? holder[condition.key] : undefined;
    var held = condition.is ? condition.is.indexOf(value) >= 0 : condition.above !== undefined ? value > condition.above : value === true;
    if (!held) return [condition.text];
    var target = requirementRows[condition.key + "|" + (condition.shared ? "shared" : side)];
    return target ? missing(target) : [];
  }
  // A shared row is usable when either side qualifies, so it reports the side missing the least.
  function missing(row) {
    if (!row.requires || !config) return [];
    var best = null;
    (row.side === "shared" ? SIDES : [row.side]).forEach(function (side) {
      var list = [];
      row.requires.forEach(function (condition) {
        conditionMissing(condition, side).forEach(function (text) { if (list.indexOf(text) < 0) list.push(text); });
      });
      if (!best || list.length < best.length) best = list;
    });
    return best;
  }
  function rowActive(row) { return missing(row).length === 0; }
  function rowHelp(row) {
    var list = missing(row);
    if (!list.length) return row.help;
    var text = list.join(" and ");
    return text.charAt(0).toUpperCase() + text.slice(1) + " to change this. " + row.help;
  }
  // Pure settings reads per row; panels are touched only when a row's state changes (or the panels are new).
  function syncRequirements() {
    if (!contractRef || !config) return;
    for (var i = 0; i < requirementList.length; i++) {
      var row = requirementList[i], active = rowActive(row);
      if (shownActive[row.rowId] === active) continue;
      var target = panel(row.rowId);
      if (!target) continue;
      shownActive[row.rowId] = active;
      target.SetHasClass("HPC3RowDisabled", !active);
      var ids = requirementIds[i];
      for (var j = 0; j < ids.length; j++) { var control = panel(ids[j]); if (control) control.enabled = active; }
    }
  }
  function syncNavDots() {
    if (!contractRef || !config) return;
    var pages = {}, changedPages = {}, changedGroups = {};
    Object.keys(config.rules).forEach(function (cell) {
      if (ruleRows[cell]) pages[ruleRows[cell].page] = true;
    });
    // Mutation-only pass over authored settings, never effective conditions or watcher ticks.
    contractRef.controls.forEach(function (row) {
      if (valuesFor(config.settings, row)[row.key] === row.default) return;
      changedPages[row.page] = true;
      changedGroups[row.page + "\n" + row.group] = true;
    });
    contractRef.menu.pages.forEach(function (page) {
      mark(page.navId, "HasCond", pages[page.name] === true);
      mark(page.navId, "Changed", changedPages[page.name] === true);
    });
    contractRef.menu.groups.forEach(function (group) {
      mark(group.subNavId, "Changed", changedGroups[group.page + "\n" + group.name] === true);
    });
  }

  function syncUndo() { if (panel("HPColorsUndoButton")) panel("HPColorsUndoButton").enabled = history.length > 0; }
  // The bundle fields an Undo step carries besides the settings (hero routing).
  var BUNDLE_UNDO_KEYS = ["heroPresets", "heroDefault"];
  function historySnapshot() {
    var bundle = presetBundle(), metadata = {};
    BUNDLE_UNDO_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(bundle, key)) metadata[key] = clone(bundle[key]);
    });
    return JSON.stringify({ settings: config.settings, rules: config.rules, metadata: metadata, sourcePresetId: sourcePresetId, sourceWasMapped: sourceWasMapped });
  }
  function restoreHistory(raw) {
    var state = JSON.parse(raw), bundle = presetBundle(), target = store(), changed = false;
    var ids = bundle.presets.map(function (preset) { return preset.id; }); ids.push(DEFAULT_PRESET_ID);
    if (state.metadata.heroPresets) Object.keys(state.metadata.heroPresets).forEach(function (hero) {
      if (ids.indexOf(state.metadata.heroPresets[hero]) < 0) delete state.metadata.heroPresets[hero];
    });
    if (state.metadata.heroDefault && ids.indexOf(state.metadata.heroDefault) < 0) state.metadata.heroDefault = null;
    BUNDLE_UNDO_KEYS.forEach(function (key) {
      if (JSON.stringify(bundle[key]) !== JSON.stringify(state.metadata[key])) changed = true;
      if (Object.prototype.hasOwnProperty.call(state.metadata, key)) bundle[key] = state.metadata[key]; else delete bundle[key];
    });
    if (state.sourcePresetId && ids.indexOf(state.sourcePresetId) < 0) { state.sourcePresetId = ""; state.sourceWasMapped = false; }
    if (state.sourcePresetId || Object.prototype.hasOwnProperty.call(bundle, "sourcePresetId")) {
      if (bundle.sourcePresetId !== (state.sourcePresetId || null) || bundle.sourceWasMapped !== state.sourceWasMapped) changed = true;
      bundle.sourcePresetId = state.sourcePresetId || null; bundle.sourceWasMapped = state.sourceWasMapped;
    }
    if (changed && target && typeof target.replaceBundle === "function") {
      bundle.settings = state.settings;
      if (Object.keys(state.rules || {}).length) bundle.rules = state.rules; else delete bundle.rules;
      try { if (!target.replaceBundle(bundle)) return false; }
      catch (error) { presetStatus(String(error.message || error), true); return false; }
    }
    sourcePresetId = state.sourcePresetId; sourceWasMapped = state.sourceWasMapped;
    return applySettings(state.settings, state.rules || {});
  }
  function record(before) {
    if (before === historySnapshot()) return;
    history.push(before);
    if (history.length > UNDO_LIMIT) history.shift();
    syncUndo();
  }
  function gestureKey(row) { return row.side + ":" + row.key; }
  function beginGesture(key) {
    endGesture();
    gesture = { key: key, before: historySnapshot() };
  }
  // Drops the gesture without publishing, recording or restoring anything.
  function abandonGesture() {
    gesture = null;
    cancelGesturePublish();
  }
  function endGesture() {
    if (!gesture) return;
    var before = gesture.before;
    abandonGesture();
    publish(); // Final value also wins when the drag returned to its opening value.
    if (before !== historySnapshot()) {
      record(before);
      notifyStore();
    }
    resumeHeroRoute();
  }
  function clearHistory() {
    history = [];
    syncUndo();
  }
  function hydrateSettings(settings) {
    if (retired || !contractRef || !contractRef.validate(settings)) return false;
    var bundle = presetBundle();
    sourcePresetId = bundle.sourcePresetId || ""; sourceWasMapped = bundle.sourceWasMapped === true;
    abandonGesture();
    var row = picker && picker.row;
    picker = null; // Do not commit a draft or restore its pre-load opening value.
    if (panel("HPColorsPickerDialog")) panel("HPColorsPickerDialog").RemoveClass("Open");
    closeCondition();
    clearHistory();
    if (row && panel(row.swatchId)) panel(row.swatchId).SetFocus();
    replace(clone(settings), bundle.rules || {});
    syncAll();
    resolvePublication();
    restoreColorblind();
    return true;
  }
  // Only explicit menu edits shake the preview sample; hydration, routing and Undo use applySettings directly.
  function previewShakeEdit(previous) {
    var before = previous.shared, after = effectiveSettings.shared;
    if (before.damageShakeEnabled === after.damageShakeEnabled && before.damageShakeStrength === after.damageShakeStrength) return;
    previewSetSettings(true);
  }
  function editSettings(settings, rules) {
    if (!contractRef.validate(settings) || JSON.stringify(settings) === JSON.stringify(config.settings) &&
        (rules === undefined || JSON.stringify(rules) === JSON.stringify(config.rules))) return false;
    closePicker(false);
    endGesture();
    var before = historySnapshot();
    var previousEffective = effectiveSettings;
    if (!applySettings(settings, rules)) return false;
    previewShakeEdit(previousEffective);
    record(before);
    notifyStore();
    return true;
  }
  function undo() {
    closeFor(CLOSES_ON_OPEN.editor);
    if (!history.length) return;
    if (!restoreHistory(history[history.length - 1])) return;
    history.pop();
    syncUndo();
    notifyStore();
  }
  // ---- Controls -> model ----
  function commit(row, value, hueEdit) {
    if (retired) return false;
    if (!config || value === null || value === undefined) { sync(row); return false; }
    // A greyed row keeps its value: whatever its controls received is put back.
    if (!rowActive(row)) { sync(row, hueEdit); return false; }
    var next = clone(config.settings);
    var values = valuesFor(next, row);
    if (values[row.key] === value) { sync(row, hueEdit); return false; }
    values[row.key] = value;
    if (!contractRef.validate(next)) { sync(row); return false; }
    var before = historySnapshot();
    var previousEffective = effectiveSettings;
    if (gesture && gesture.key !== gestureKey(row)) endGesture();
    replace(next);
    if (!gesture) record(before);
    sync(row, hueEdit);
    // Only a key some condition reads can change which rows are greyed.
    if (requirementKeys[row.key]) syncRequirements();
    // The preview follows the column being edited.
    if (row.side === "enemy" || row.side === "ally") previewSetSide(row.side);
    previewShakeEdit(previousEffective);
    if (gesture) gesturePublish();
    else { publish(); notifyStore(); }
    return true;
  }
  function applySettings(settings, rules) {
    if (retired || !config || !contractRef || !contractRef.validate(settings)) return false;
    replace(clone(settings), rules);
    syncAll();
    if (ready && panel("HPColorsPresetList")) syncPresetSelection(presetBundle());
    publish();
    return true;
  }
  function applyPresetSettings(settings, id, automatic, mapped, rules) {
    var before = null;
    if (!automatic) {
      closePicker(false); endGesture();
      before = historySnapshot();
    }
    if (JSON.stringify(settings) === JSON.stringify(config.settings) && JSON.stringify(rules || {}) === JSON.stringify(config.rules) &&
        sourcePresetId === (id || DEFAULT_PRESET_ID) && sourceWasMapped === (mapped === true)) return;
    if (!applySettings(settings, rules || {})) return;
    sourcePresetId = id || DEFAULT_PRESET_ID;
    sourceWasMapped = mapped === true;
    if (!automatic) { record(before); notifyStore(); }
    if (ready && panel("HPColorsPresetList")) syncPresetSelection(presetBundle());
  }

  function on(id, eventName, handler) {
    var target = panel(id);
    if (!target) return;
    var key = id + "\n" + eventName;
    if (bound[key] === target) return;
    bound[key] = target;
    target.SetPanelEvent(eventName, handler);
  }
  function bindSliderGesture(row, id, change) {
    var rowKey = gestureKey(row);
    on(id, "onvaluechanged", function () {
      if (syncing || !panel(id)) return;
      if (!rowActive(row)) { sync(row); return; }
      closePicker(false);
      if (!gesture || gesture.key !== rowKey) beginGesture(rowKey);
      change();
    });
    var target = panel(id), key = id + "\nSliderReleased";
    if (target && bound[key] !== target) {
      bound[key] = target;
      $.RegisterEventHandler("SliderReleased", target, function () {
        if (!retired && panel(id) === target && gesture && gesture.key === rowKey) endGesture();
      });
    }
    // Keyboard steps may have no release event; focus loss still completes their edit.
    on(id, "onblur", function () { if (gesture && gesture.key === rowKey) endGesture(); });
  }
  function bindControl(row) {
    on(row.rowId, "onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", panel(row.rowId), rowHelp(row)); });
    on(row.rowId, "onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", panel(row.rowId)); });
    on(row.resetId, "onactivate", function () {
      closeFor(CLOSES_ON_OPEN.editor);
      commit(row, controlType(row).resetValue(row));
    });
    on(row.resetId, "onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", panel(row.resetId), "Reset " + row.name + " to default"); });
    on(row.resetId, "onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", panel(row.resetId)); });
    on(row.conditionId, "onactivate", function () { if (!retired) openCondition(row); });
    on(row.conditionId, "onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", panel(row.conditionId), "Ability condition · " + row.name); });
    on(row.conditionId, "onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", panel(row.conditionId)); });
    controlType(row).bind(row);
  }

  // ---- Pages, folds and search (menu-local: never touch config or the store) ----
  // Page names the menu treats specially: Presets refreshes its library on show, New carries the news list.
  var PAGE_PRESETS = "Presets", PAGE_NEW = "New";
  function pageIndexOf(name) {
    var pages = contractRef.menu.pages;
    for (var i = 0; i < pages.length; i++) if (pages[i].name === name) return i;
    return -1;
  }
  function host() { return panel(contractRef.menu.rootId); }
  // The open state is the class HPC3Open on the host; read live, never cached.
  function menuIsOpen() { var root = host(); return !!root && root.BHasClass("HPC3Open"); }
  function syncFoldCounts() {
    var root = host(), searching = root.BHasClass("Searching"), side = shownSide;
    contractRef.menu.folds.forEach(function (fold) {
      var count = fold.rows.filter(function (row) {
        var target = panel(row.id);
        return target && (searching ? !target.BHasClass("SearchMiss") : row.side === "shared" || fold.singleSide || row.side === side);
      }).length;
      var label = panel(fold.labelId), text = fold.level.toUpperCase() + " · " + count;
      if (label && label.text !== text) label.text = text;
    });
  }
  function selectSide(side) {
    var root = host();
    if (!root || retired) return;
    closeFor(CLOSES_ON_OPEN.editor);
    root.SetHasClass("HPC3SideAlly", side === "ally");
    shownSide = side === "ally" ? "ally" : "enemy";
    contractRef.menu.groups.forEach(function (group) {
      (group.sides || []).forEach(function (tab) {
        var target = panel(tab.id);
        if (target) { target.SetHasClass("Selected", tab.side === side); target.SetHasClass("fill", tab.side === side); }
      });
    });
    if (ready) previewSetSide(side);
    syncFoldCounts();
  }
  function showPage(index) {
    var pages = contractRef.menu.pages;
    pageIndex = index;
    closeFor(CLOSES_ON_OPEN.page);
    for (var i = 0; i < pages.length; i++) {
      if (panel(pages[i].id)) panel(pages[i].id).SetHasClass("Active", i === index);
      if (panel(pages[i].navId)) panel(pages[i].navId).SetHasClass("Selected", i === index);
      if (panel(pages[i].subNavId)) panel(pages[i].subNavId).SetHasClass("Selected", i === index);
    }
    if (panel("HPColorsPageTitle")) panel("HPColorsPageTitle").text = pages[index].title;
    if (panel("HPColorsPageDescription")) panel("HPColorsPageDescription").text = pages[index].description;
    if (panel("HPColorsResetPageButton")) panel("HPColorsResetPageButton").enabled = contractRef.controls.some(function (row) { return row.page === pages[index].name; });
    if (pages[index].name === PAGE_PRESETS) refreshPresets();
    if (ready) previewSetPage(pages[index].name);
  }
  function selectGroup(group) {
    contractRef.menu.groups.forEach(function (entry) {
      if (panel(entry.id)) panel(entry.id).SetHasClass("Active", entry === group);
      if (panel(entry.subNavId)) panel(entry.subNavId).SetHasClass("Selected", entry === group);
    });
  }
  // Nav tab and SHARE: a plain page change that clears search and the highlighted group first.
  function goToPage(index) { clearSearch(); selectGroup(null); showPage(index); }
  function activateGroup(group) {
    clearSearch();
    showPage(pageIndexOf(group.page));
    selectGroup(group);
    var card = panel(group.id);
    scrollTo(card);
    var title = card && card.FindChildrenWithClassTraverse("HPC3CardTitle")[0];
    trigger(title, "HPC3SearchLanding");
  }
  // Group and page resets: every row of the page (and of the group, when one is given) goes back to its
  // default and loses its condition rule. A single row's reset (bindControl) keeps its rule.
  function resetRows(next, rules, page, group) {
    contractRef.controls.forEach(function (row) {
      if (row.page === page && (group === undefined || row.group === group)) {
        valuesFor(next, row)[row.key] = row.default;
        delete rules[cellFor(row)];
      }
    });
  }
  function resetGroup(group) {
    closeFor(CLOSES_ON_OPEN.editor);
    var next = clone(config.settings), rules = clone(config.rules);
    resetRows(next, rules, group.page, group.name);
    editSettings(next, rules);
  }
  function words(text) { return String(text).toLowerCase().split(/[^a-z0-9#%]+/).filter(Boolean); }
  function applySearch(raw) {
    var root = host();
    if (!root) return;
    var terms = words(raw);
    var searching = terms.length > 0;
    // Clearing an already clear search (every tab, sub-nav and NEW click) leaves no SearchMiss to undo:
    // only the scroll reset remains. The root class, not a JS flag, survives script reinclusion.
    if (!searching && !root.BHasClass("Searching")) {
      var clean = panel("HPColorsSettingsList");
      if (valid(clean) && typeof clean.ScrollToTop === "function") clean.ScrollToTop();
      return;
    }
    var index = contractRef.searchIndex;
    if (!searchWords) searchWords = index.map(function (entry) { return words(entry.text); });
    var matched = Object.create(null);
    var count = 0;
    for (var i = 0; i < index.length; i++) {
      var hit = searching && terms.every(function (term) {
        return searchWords[i].some(function (word) { return word.indexOf(term) === 0; });
      });
      if (hit) { matched[index[i].id] = true; count++; }
      if (panel(index[i].id)) panel(index[i].id).SetHasClass("SearchMiss", searching && !hit);
    }
    var containers = contractRef.menu.containers;
    for (var j = 0; j < containers.length; j++) {
      var any = containers[j].rows.some(function (id) { return matched[id] === true; });
      if (panel(containers[j].id)) panel(containers[j].id).SetHasClass("SearchMiss", searching && !any);
    }
    root.SetHasClass("Searching", searching);
    root.SetHasClass("NoResults", searching && count === 0);
    syncFoldCounts();
    // Filtering changes every row's geometry. Start at the result headers, not a stale first-row offset.
    var list = panel("HPColorsSettingsList");
    if (valid(list) && typeof list.ScrollToTop === "function") list.ScrollToTop();
    if (searching && count) {
      var first = index.filter(function (entry) { return matched[entry.id]; })[0];
      var group = contractRef.menu.groups.filter(function (entry) { return entry.page === first.page && entry.name === first.group; })[0];
      var card = group && panel(group.id);
      trigger(card && card.FindChildrenWithClassTraverse("HPC3CardTitle")[0], "HPC3SearchLanding");
    }
  }
  function clearSearch() {
    var field = panel("HPColorsSearchField");
    if (field && field.text) field.text = "";
    applySearch("");
    if (panel("HPColorsCloseButton")) panel("HPColorsCloseButton").SetFocus();
  }
  function setSupporterStripOpen(open) {
    var strip = panel("HPColorsSupporterStrip");
    if (!strip) return;
    strip.RemoveClass("Open");
    if (open) {
      if (retired || !menuIsOpen()) return;
      try { if (typeof strip.SetIgnoreCursor === "function") strip.SetIgnoreCursor(true); } catch (error) { /* Optional: a throw here must not skip the SetURL below. */ }
    }
    try {
      if (typeof strip.SetURL !== "function") return;
      var url = open ? LINKS.supporters + "?v=" +
        encodeURIComponent(publisherEpoch + ":" + ++supporterOpenCount) : "about:blank";
      if (strip.SetURL(url) !== false && open) strip.AddClass("Open");
    } catch (error) { /* Optional hosted strip: the editor works without it. */ }
  }
  function setMenuOpen(open) {
    var root = host();
    if (!root) return;
    if (!open) {
      closeFor(CLOSES_ON_OPEN.menuClose);
      clearHistory();
      clearSearch(); root.RemoveClass("SaveResetConfirming");
    }
    root.SetHasClass("HPC3Open", open);
    setSupporterStripOpen(open);
    if (open) startUpdateCheck(); else stopUpdateCheck();
    if (open) syncNews(); else { newsNav++; endNewsFlash(); }
    previewOpen(open);
  }

  // ---- NEW tab (ticket 36): no setting, Undo entry or shared code. Dismissed ids live in the bundle's
  // newsDismissed list; items also leave NEWS_DAYS after their date. Without a loaded store, a dismissal
  // lasts for this session. ----
  var NEWS_DAYS = 30, NEWS_FLASH_SEC = 1.2, newsSession = Object.create(null), newsFlash = [], newsFlashJob = null, newsNav = 0;
  // Session-only dismissals (no store yet, or a refused save) survive script reinclusion in the same session.
  if (inherited && Array.isArray(inherited.newsSession)) inherited.newsSession.slice(0, 64).forEach(function (id) { if (typeof id === "string") newsSession[id] = true; });
  // The saved list is read from the bundle refreshPresets already loads: storage refreshes the menu after
  // every bundle write, load and merge, so news syncs never clone the bundle themselves.
  var newsSavedIds = [];
  function readNewsSaved(bundle) {
    var saved = bundle && bundle.newsDismissed;
    // A bounded list of short ids only; anything else is ignored, not trusted.
    newsSavedIds = !Array.isArray(saved) || saved.length > 64 || saved.some(function (id) { return typeof id !== "string" || id.length > limits().nameMax; }) ? [] : saved;
  }
  function newsDismissed() {
    var gone = Object.create(null);
    newsSavedIds.forEach(function (id) { gone[id] = true; });
    Object.keys(newsSession).forEach(function (id) { gone[id] = true; });
    return gone;
  }
  function newsShowing() {
    if (!contractRef || !contractRef.menu.news) return [];
    var gone = newsDismissed(), now = Date.now();
    return contractRef.menu.news.filter(function (item) { return !gone[item.id] && now < item.date + NEWS_DAYS * 86400000; });
  }
  function syncNews() {
    if (!contractRef || !contractRef.menu.news || retired) return [];
    var showing = newsShowing(), rows = Object.create(null), pages = Object.create(null);
    showing.forEach(function (item) { pages[item.page] = true; item.rowIds.forEach(function (id) { rows[id] = true; }); });
    contractRef.menu.news.forEach(function (item) {
      mark(item.itemId, "Gone", showing.indexOf(item) < 0);
      item.rowIds.forEach(function (id) { mark(id, "IsNew", rows[id] === true); });
    });
    contractRef.menu.pages.forEach(function (page) {
      mark(page.navId, "HasNew", page.name === PAGE_NEW ? showing.length > 0 : pages[page.name] === true);
      if (page.name === PAGE_NEW) mark(page.id, "NoNews", !showing.length);
    });
    // Sub-nav entries (groups) of showing items' targets, like stock's sub-section indicator; the generator
    // lists each item's entries.
    var groups = Object.create(null);
    showing.forEach(function (item) { item.subNavIds.forEach(function (id) { groups[id] = true; }); });
    contractRef.menu.news.forEach(function (item) { item.subNavIds.forEach(function (id) { mark(id, "HasNew", groups[id] === true); }); });
    return showing;
  }
  function dismissNews(ids) {
    ids.forEach(function (id) { newsSession[id] = true; });
    var target = retired ? null : storeReady("replaceBundle");
    if (!retired && target) {
      var gone = newsDismissed(), bundle = presetBundle();
      // Only ids still in the list are kept, so the saved list stays as short as the list itself.
      bundle.newsDismissed = contractRef.menu.news.filter(function (item) { return gone[item.id]; }).map(function (item) { return item.id; });
      try { target.replaceBundle(bundle); } catch (error) { /* The session dismissal still applies. */ }
    }
    // The pressed X collapses with its item: keep focus in the list (next item), else on the NEW tab.
    var next = syncNews()[0], focus = panel(next ? next.buttonId : "HPColorsNavNewButton");
    if (focus) focus.SetFocus();
  }
  function endNewsFlash() {
    if (newsFlashJob) { try { $.CancelScheduled(newsFlashJob); } catch (error) { /* Engine: CancelScheduled throws for a handle that already fired. */ } }
    newsFlashJob = null;
    newsFlash.forEach(function (id) { if (panel(id)) panel(id).RemoveClass("NewFlash"); });
    newsFlash = [];
  }
  // Live 2026-10-21: the target page was collapsed under NEW, so it has no layout in the click frame
  // and a scroll then does nothing. A page shown before keeps its rows' old heights while collapsed
  // (live 2026-10-21: Team colors, Low stamina and Old shield bar stayed at the page top), so a height
  // cannot say the new layout is done. Scroll on every frame of a short window instead; once the row
  // fits, a repeat is a no-op.
  var NEWS_SCROLL_FRAMES = 10;
  function scrollAfterLayout(target) {
    // Closing the menu, another item, a page change or reinclusion drops the pending scroll.
    var token = generation, page = pageIndex, nav = newsNav, left = NEWS_SCROLL_FRAMES;
    $.Schedule(0, function newsScroll() {
      if (retired || token !== generation || nav !== newsNav || page !== pageIndex || !valid(target) || !menuIsOpen()) return;
      if (target.actuallayoutheight > 0) scrollTo(target);
      if (--left > 0) $.Schedule(0, newsScroll);
      else scrollTo(target);
    });
  }
  function openNews(item) {
    newsNav++;
    clearSearch(); endNewsFlash();
    showPage(pageIndexOf(item.page));
    if (!item.rowIds.length) { selectGroup(null); return; }
    var targets = contractRef.controls.filter(function (row) { return item.rowIds.indexOf(row.rowId) >= 0; });
    var sides = targets.map(function (row) { return row.side; });
    if (sides.length && sides.every(function (side) { return side === "ally"; })) selectSide("ally");
    else if (sides.length && sides.every(function (side) { return side === "enemy"; })) selectSide("enemy");
    // The other side's column is collapsed, so group and scroll follow a shared or current-side target.
    var side = shownSide;
    var shown = targets.filter(function (row) { return row.side === "shared" || row.side === side; })[0];
    var first = shown ? shown.rowId : item.rowIds[0];
    contractRef.menu.folds.forEach(function (fold) {
      if (fold.rows.some(function (row) { return item.rowIds.indexOf(row.id) >= 0; }) && panel(fold.id)) panel(fold.id).AddClass("Open");
    });
    var group = contractRef.menu.groups.filter(function (entry) {
      return contractRef.menu.containers.some(function (box) { return box.id === entry.id && box.rows.indexOf(first) >= 0; });
    })[0];
    selectGroup(group || null);
    scrollAfterLayout(panel(first));
    newsFlash = item.rowIds.slice();
    newsFlash.forEach(function (id) { if (panel(id)) panel(id).AddClass("NewFlash"); });
    var token = generation;
    newsFlashJob = $.Schedule(NEWS_FLASH_SEC, function newsFlashEnd() { newsFlashJob = null; if (token === generation && !retired) endNewsFlash(); });
  }

  // Credits and Feedback are informational only: no setting, record, store commit or Undo entry.
  // Closing either returns focus to the footer button that opened it.
  var INFO_DIALOGS = [["HPColorsCreditsDialog", "HPColorsPreviewCreditsButton"], ["HPColorsFeedbackDialog", "HPColorsPreviewFeedbackButton"]];
  function closeInfo() {
    for (var i = 0; i < INFO_DIALOGS.length; i++) {
      var dialog = panel(INFO_DIALOGS[i][0]);
      if (dialog && dialog.BHasClass("Open")) leaveDialog(INFO_DIALOGS[i][0], INFO_DIALOGS[i][1], true);
    }
  }
  function infoOpen() {
    for (var i = 0; i < INFO_DIALOGS.length; i++) {
      var dialog = panel(INFO_DIALOGS[i][0]);
      if (dialog && dialog.BHasClass("Open")) return true;
    }
    return false;
  }

  // ---- Dialogs: one leave helper, one registry in ESC priority order, one close-on-open table ----
  // Every dialog closes the same way: drop "Open", and only if it really was open give focus back to the
  // control that opened it.
  function leaveDialog(dialogId, focusId, wasOpen) {
    var dialog = panel(dialogId);
    if (dialog) dialog.RemoveClass("Open");
    if (wasOpen && panel(focusId)) panel(focusId).SetFocus();
  }
  // Escape closes the first open entry (fixed priority). `quiet` entries (the advisory update notice) do not
  // count as busy: they wait for no one and never block another dialog. `late` entries (the info dialogs) are
  // skipped by dialogBusy's flag loop and checked last through infoOpen().
  var DIALOGS = [
    { id: "update", quiet: true, close: closeUpdate,
      isOpen: function () { var dialog = panel("HPColorsUpdateDialog"); return !!dialog && dialog.BHasClass("Open"); } },
    { id: "info", late: true, isOpen: infoOpen, close: closeInfo },
    { id: "picker", isOpen: function () { return !!picker; }, close: function () { closePicker(true); } },
    { id: "condition", isOpen: function () { return !!conditionDraft; }, close: closeCondition },
    { id: "hero", isOpen: function () { return !!heroPicker; }, close: closeHeroPicker },
    { id: "reset", isOpen: function () { return resetPage !== null; }, close: cancelReset },
    { id: "delete", isOpen: function () { return !!deletePreset; }, close: cancelDelete },
    { id: "bundle", isOpen: function () { return !!bundleReplacement; }, close: cancelBundleReplacement },
  ];
  // What each opener (or page/menu change) closes first. The order is observable
  // (the last close that has a focus target wins focus), so it is kept per entry, not normalised.
  var CLOSES_ON_OPEN = {
    editor: [closePicker, closeCondition, endGesture],
    page: [closePicker, closeCondition, endGesture, cancelReset, cancelDelete, cancelBundleReplacement, closeHeroPicker, closeInfo],
    menuClose: [closePicker, endGesture, cancelReset, cancelDelete, closeCondition, cancelBundleReplacement, closeHeroPicker, closeInfo],
    condition: [closeInfo, closeCondition, closePicker, endGesture],
    reset: [closeInfo, closePicker, endGesture, closeCondition],
    hero: [closeInfo, closePicker, endGesture],
    picker: [closeInfo, closePicker],
  };
  function closeFor(steps) { for (var i = 0; i < steps.length; i++) steps[i](); }

  // ---- Update notice (ticket 33): advisory, no setting, record, store commit or Undo entry ----
  // The hosted store page reads latest.json; a newer release warns once per game session, after
  // the menu has faded in and while no dialog, picker or slider drag is active.
  var UPDATE_DELAY_SEC = 0.5, UPDATE_PENDING_RETRY_SEC = 2, UPDATE_PENDING_RETRIES = 5, UPDATE_IDLE_RETRY_SEC = 1;
  var updateOpen = 0, updateJob = null, updateUrl = null;
  function releaseParts(text) {
    var match = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(text));
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }
  function isNewerRelease(latest, current) {
    var a = releaseParts(latest), b = releaseParts(current);
    if (!a || !b) return false;
    for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  }
  function updateLater(seconds, step) {
    if (updateJob) $.CancelScheduled(updateJob);
    updateJob = $.Schedule(seconds, function updateCheck() { updateJob = null; step(); });
  }
  // ---- ESC-menu update badge (2026-11-02): a "!" beside HP COLORS while a newer release exists. It is
  // checked each time the Escape menu opens (stock hud.css shows #EscapeMenu under .ShowEscapeMenu on #Hud),
  // with the same lv request as the editor's notice; nothing is asked while the menu is closed. The identity
  // watch reads the class on each sample (1 s in play, 5 s in lobby/hideout/postgame): no job of its own. ----
  var badge = { shown: false, ask: 0 };
  function resetEscapeWatch() { badge.ask++; badge.shown = false; }
  function watchEscape() {
    var shown = valid(identity.hud) && identity.hud.BHasClass("ShowEscapeMenu");
    if (shown && !badge.shown) askBadge(++badge.ask, 0);
    badge.shown = shown;
  }
  // One advisory lv request for the badge and the editor notice: `current()` says whether the answer is still wanted,
  // a pending answer is asked again through `again(tries + 1)` (up to UPDATE_PENDING_RETRIES), `found(result)` gets a version.
  function askLatestRelease(current, tries, again, found) {
    var target = store();
    if (!current() || !target || typeof target.latestRelease !== "function") return;
    try {
      target.latestRelease(function (result) {
        if (!current() || !result || result.ok !== true) return;
        if (!result.version) {
          if (result.pending && tries < UPDATE_PENDING_RETRIES) again(tries + 1);
          return;
        }
        found(result);
      });
    } catch (error) { /* Advisory: the editor works without it. */ }
  }
  function askBadge(ask, tries) {
    askLatestRelease(function () { return !retired && ask === badge.ask; }, tries,
      function (next) { $.Schedule(UPDATE_PENDING_RETRY_SEC, function () { askBadge(ask, next); }); },
      function (result) {
        var button = panel("HPColorsMenuButton");
        if (button) button.SetHasClass("HPC3UpdateAvailable", isNewerRelease(result.version, contractRef.release));
      });
  }
  function stopUpdateCheck() {
    updateOpen++;
    if (updateJob) { $.CancelScheduled(updateJob); updateJob = null; }
    closeUpdate();
  }
  function startUpdateCheck() {
    var open = ++updateOpen, target = store();
    if (!target || typeof target.latestRelease !== "function") return;
    updateLater(UPDATE_DELAY_SEC, function () { askLatest(open, 0); });
  }
  function updateCurrent(open) { return !retired && open === updateOpen && menuIsOpen(); }
  function askLatest(open, tries) {
    askLatestRelease(function () { return updateCurrent(open); }, tries,
      function (next) { updateLater(UPDATE_PENDING_RETRY_SEC, function () { askLatest(open, next); }); },
      function (result) {
        var notified = $.HPColorsV3UpdateNotified || ($.HPColorsV3UpdateNotified = {});
        if (notified[result.version] || !isNewerRelease(result.version, contractRef.release)) return;
        showUpdateWhenIdle(open, result.version, result.downloads);
      });
  }
  function dialogBusy() {
    if (gesture) return true;
    for (var i = 0; i < DIALOGS.length; i++) if (!DIALOGS[i].quiet && !DIALOGS[i].late && DIALOGS[i].isOpen()) return true;
    return infoOpen(); // last: its panel lookups run only when no state flag already said busy
  }
  // Each build opens its own file: the composed QOLLOCK menu keeps QOLLOCK's pinned storage bridge
  // panel and the composed ShowRank menu ShowRank's party bridge. No link for this build: no DOWNLOAD.
  // Only the HP Colors mod's own download page (id 603113); the store owns the test (isDownloadUrl).
  function updateDownload(downloads) {
    var build = panel("QOLStorageBridge") ? "qollock" : panel("ShowRankBarebonesPartyBridge") ? "showrank" : "normal";
    var url = downloads && Object.prototype.hasOwnProperty.call(downloads, build) ? downloads[build] : null;
    var target = store();
    return typeof url === "string" && target && typeof target.isDownloadUrl === "function" && target.isDownloadUrl(url) ? url : null;
  }
  function showUpdateWhenIdle(open, version, downloads) {
    if (!updateCurrent(open)) return;
    if (dialogBusy()) return updateLater(UPDATE_IDLE_RETRY_SEC, function () { showUpdateWhenIdle(open, version, downloads); });
    var dialog = panel("HPColorsUpdateDialog"), text = panel("HPColorsUpdateText");
    if (!dialog || !text) return;
    $.HPColorsV3UpdateNotified[version] = true;
    updateUrl = updateDownload(downloads);
    text.text = "HP Colors v" + version + " is out. You have v" + contractRef.release + ". " +
      (updateUrl ? "Press DOWNLOAD to open its GameBanana page." : "Download the new version from the mod page to get the latest fixes.");
    dialog.SetHasClass("HPC3HasDownload", !!updateUrl);
    dialog.AddClass("Open");
    if (panel("HPColorsUpdateCloseButton")) panel("HPColorsUpdateCloseButton").SetFocus();
  }
  function closeUpdate() {
    var dialog = panel("HPColorsUpdateDialog");
    if (dialog && dialog.BHasClass("Open")) leaveDialog("HPColorsUpdateDialog", "", false);
  }
  function openUpdateDownload() {
    var dialog = panel("HPColorsUpdateDialog"), url = updateUrl;
    if (retired || !url || !dialog || !dialog.BHasClass("Open")) return;
    try {
      if (typeof $.DispatchEvent === "function") $.DispatchEvent("ExternalBrowserGoToURL", url);
    } catch (error) { /* The external browser is optional. */ }
    closeUpdate();
  }
  function openCredits() {
    closeFor(CLOSES_ON_OPEN.page);
    [["Yesdaddy", "hero_chessmaster"], ["Razorrzr", "hero_lash"]].forEach(function (entry) {
      var hero = heroByKey[entry[1]];
      panel("HPColorsCredits" + entry[0] + "Portrait").SetImage(hero && hero.portrait || "s2r://panorama/images/control_icons/no_hero_png.vtex");
    });
    panel("HPColorsCreditsDialog").AddClass("Open");
    panel("HPColorsCreditsCloseButton").SetFocus();
  }
  // Ticket 43: the footer FEEDBACK pops a dialog that asks for Discord feedback. Its underlined name copies
  // the username; the status line reports the result, so the name stays readable when copying fails.
  var FEEDBACK_DISCORD = "hanturaya101";
  function openFeedback() {
    closeFor(CLOSES_ON_OPEN.page);
    setLabel("HPColorsFeedbackStatus", "Click the name to copy it.");
    panel("HPColorsFeedbackDialog").AddClass("Open");
    panel("HPColorsFeedbackCloseButton").SetFocus();
  }
  // Every copy action: live 6785/6821 the Escape menu throws "Invalid number of arguments" on
  // CopyStringToClipboard, so the text goes through a TextEntry carrier (ticket 29). `refocus` takes focus
  // back after the carrier held it.
  function copyText(text, entry, refocus) {
    var copied = false;
    try { copied = $.DispatchEvent("CopyStringToClipboard", text) !== false; } catch (error) { /* Live: throws here. */ }
    if (copied || !entry) return copied;
    try {
      entry.text = text;
      entry.SetFocus();
      entry.SelectAll();
      copied = $.DispatchEvent("TextEntryCopyToClipboard", entry) !== false;
    } catch (error) { /* The caller reports it. */ }
    if (refocus) refocus.SetFocus();
    return copied;
  }
  function copyFeedback() {
    var dialog = panel("HPColorsFeedbackDialog");
    if (retired || !dialog || !dialog.BHasClass("Open")) return;
    var copied = copyText(FEEDBACK_DISCORD, panel("HPColorsFeedbackNameEntry"), panel("HPColorsFeedbackNameButton"));
    setLabel("HPColorsFeedbackStatus", copied ? "Copied " + FEEDBACK_DISCORD + ". Paste it in Discord's Add Friend." : "Could not copy. Add " + FEEDBACK_DISCORD + " on Discord.");
  }

  // ---- Schema-owned page reset: includes folded rows and both sides ----
  function cancelReset() {
    var wasOpen = resetPage !== null;
    resetPage = null;
    leaveDialog("HPColorsResetPageDialog", "HPColorsResetPageButton", wasOpen);
  }
  function requestReset() {
    closeFor(CLOSES_ON_OPEN.reset);
    var page = contractRef.menu.pages[pageIndex].name;
    var rows = contractRef.controls.filter(function (row) { return row.page === page; });
    if (!rows.length) return;
    resetPage = page;
    var hidden = [], seen = Object.create(null);
    rows.forEach(function (row) {
      if (row.level === "advanced" && !seen[row.key]) { seen[row.key] = true; hidden.push(row.name || row.key); }
    });
    var sides = [];
    if (rows.some(function (row) { return row.side === "enemy"; })) sides.push("enemy");
    if (rows.some(function (row) { return row.side === "ally"; })) sides.push("ally");
    var message = "Reset " + page + (sides.length ? " for " + sides.join(" and ") : "");
    if (rows.some(function (row) { return row.side === "shared"; })) message += ", including shared settings";
    message += " and hidden Advanced settings";
    var listed = [];
    for (var i = 0; i < hidden.length; i++) {
      if ((message + ": " + listed.concat([hidden[i]]).join(", ")).length > 520) break;
      listed.push(hidden[i]);
    }
    message += listed.length ? ": " + listed.join(", ") : hidden.length ? "" : " (none on this page)";
    if (listed.length < hidden.length) message += "; +" + (hidden.length - listed.length) + " more Advanced settings (also reset)";
    setLabel("HPColorsResetPageMessage", message + "?");
    panel("HPColorsResetPageDialog").AddClass("Open");
    if (panel("HPColorsResetPageCancelButton")) panel("HPColorsResetPageCancelButton").SetFocus();
  }
  function confirmReset() {
    if (resetPage === null) return;
    var page = resetPage, next = clone(config.settings), rules = clone(config.rules);
    cancelReset();
    resetRows(next, rules, page);
    editSettings(next, rules);
  }

  // ---- v2 stock picker bridge: seed HexValue, suppress its seed event, validate RGB ----
  function seedPicker() {
    if (!picker || !valid(nativeHex)) return;
    pickerSeeding = true;
    try { nativeHex.text = picker.color.slice(1); $.DispatchEvent("TextEntryChanged", nativeHex); }
    catch (error) { nativeHex = null; }
    finally { pickerSeeding = false; }
  }
  function changePicker(color) {
    if (retired || pickerSeeding || !picker || color === null) return;
    picker.color = color;
    picker.owner.set(picker, color);
    if (panel("HPColorsPickerHex")) panel("HPColorsPickerHex").text = color;
  }
  function closePicker(cancel) {
    if (!picker) return;
    if (cancel !== true && panel("HPColorsPickerHex")) changePicker(normalizeColor(panel("HPColorsPickerHex").text));
    var closing = picker;
    picker = null;
    if (cancel === true) closing.owner.cancel(closing, closing.openingColor); else closing.owner.done(closing);
    leaveDialog("HPColorsPickerDialog", closing.owner.focusId(closing), true);
    resumeHeroRoute();
  }
  // What opens the picker supplies these (the picker reads no other editor's state): allowed(row) gates the
  // open, begin(row) runs after the other dialogs closed and returns the opening colour, set(p, color) applies
  // a change, cancel(p, openingColor) restores without recording, done(p) accepts, focusId(p) gets the focus back.
  var ROW_PICKER = {
    allowed: function (row) { return rowActive(row); },
    begin: function (row) { closeCondition(); beginGesture(gestureKey(row)); return valuesFor(config.settings, row)[row.key]; },
    set: function (p, color) { commit(p.row, color); },
    cancel: function (p, openingColor) {
      var row = p.row;
      abandonGesture();
      var next = clone(config.settings);
      if (valuesFor(next, row)[row.key] !== openingColor) {
        valuesFor(next, row)[row.key] = openingColor;
        applySettings(next); notifyStore();
      }
    },
    done: function () { endGesture(); },
    focusId: function (p) { return p.row.swatchId; }
  };
  // The condition dialog's colour editor: it edits the draft rule value only and records no Undo entry.
  var CONDITION_PICKER = {
    allowed: function () { return true; },
    begin: function () { return conditionDraft.rule.value; },
    set: function (p, color) { changeCondition(color); panel("HPColorsConditionHex").text = color; },
    cancel: function (p, openingColor) { changeCondition(openingColor); panel("HPColorsConditionHex").text = openingColor; },
    done: function () {},
    focusId: function () { return "HPColorsConditionSwatch"; }
  };
  function openPicker(row, owner) {
    if (!owner.allowed(row)) return;
    closeFor(CLOSES_ON_OPEN.picker);
    var color = owner.begin(row);
    picker = { row: row, owner: owner, color: color, openingColor: color };
    setLabel("HPColorsPickerTitle", (row.name || row.key) + " · " + row.side);
    setLabel("HPColorsPickerStatus", valid(nativeHex) ? "Escape restores the opening color." : "Native picker unavailable; use hex entry. Escape restores the opening color.");
    panel("HPColorsPickerHex").text = picker.color;
    panel("HPColorsPickerDialog").AddClass("Open");
    seedPicker();
    (valid(nativeHex) ? nativeHex : panel("HPColorsPickerHex")).SetFocus();
  }
  function rejectPickerHex(entry) {
    trigger(entry, "HPC3NegativeShake"); setLabel("HPColorsPickerStatus", "Enter a valid hex color.", "error");
  }
  function bindPicker() {
    on("HPColorsPickerDoneButton", "onactivate", function () {
      var entry = panel("HPColorsPickerHex");
      if (picker && entry && normalizeColor(entry.text) === null) {
        rejectPickerHex(entry); return;
      }
      closePicker(false);
    });
    on("HPColorsPickerCancelButton", "onactivate", function () { closePicker(true); });
    var hex = function () {
      if (!picker || !panel("HPColorsPickerHex")) return;
      var color = normalizeColor(panel("HPColorsPickerHex").text);
      if (color !== null) { changePicker(color); seedPicker(); }
      else rejectPickerHex(panel("HPColorsPickerHex"));
    };
    on("HPColorsPickerHex", "ontextentrysubmit", hex);
    on("HPColorsPickerHex", "onblur", hex);
    var native = panel("HPColorsNativePicker");
    if (nativeBound === native && valid(nativeHex)) return;
    nativeHex = null;
    try {
      if (native) nativeHex = native.FindChildTraverse("HexValue");
      if (!valid(nativeHex)) throw new Error("missing HexValue");
      $.RegisterEventHandler("CitadelColorPickerColorChanged", native, function (red, green, blue) {
        var channels = [red, green, blue], color = "#";
        for (var i = 0; i < channels.length; i++) {
          var byte = Number(channels[i]);
          if (!Number.isFinite(byte) || byte < 0 || byte > 255 || Math.floor(byte) !== byte) return;
          color += ("0" + byte.toString(16)).slice(-2).toUpperCase();
        }
        changePicker(color);
      });
      nativeBound = native;
      native.RemoveClass("HPC3Hidden");
    } catch (error) {
      nativeHex = null;
      if (native) native.AddClass("HPC3Hidden");
    }
  }

  // ---- Preset library: storage owns records, menu owns only bounded presentation ----
  function presetBundle() {
    var target = store();
    if (!target || typeof target.getBundle !== "function") return { settings: clone(config.settings), presets: [] };
    return target.getBundle(config.settings);
  }
  function presetStatus(text, error) { setLabel("HPColorsPresetStatus", text, error ? "error" : "ok"); }
  function mutatePresets(change, withHistory) {
    var target = retired ? null : storeReady("replaceBundle");
    if (retired || !target) {
      presetStatus("Wait for the preset library to load; saving may be unavailable.", true); return false;
    }
    try {
      var before = withHistory ? historySnapshot() : null;
      var bundle = presetBundle();
      if (change(bundle) === false) return false;
      if (bundle.presets.length > limits().maxPresets) throw new Error("At most " + limits().maxPresets + " presets can be saved.");
      if (target.replaceBundle(bundle) !== true) throw new Error("Preset save refused; nothing changed.");
      if (withHistory) record(before);
      presetStatus("Preset library updated.", false);
      return true;
    } catch (error) { presetStatus(String(error.message || error), true); return false; }
  }

  function closeHeroPicker() {
    var wasOpen = !!heroPicker;
    heroPicker = "";
    leaveDialog("HPColorsHeroDialog", "HPColorsPresetSelectedHeroesButton", wasOpen);
  }
  function renderHeroPicker(searchChanged) {
    if (!heroPicker || !panel("HPColorsHeroList")) return;
    var bundle = presetBundle(), presets = bundle.presets;
    var preset = heroPicker === DEFAULT_PRESET_ID ? { name: defaultName(bundle) } :
      presets.filter(function (item) { return item.id === heroPicker; })[0];
    if (!preset) { closeHeroPicker(); return; }
    setLabel("HPColorsHeroTitleLabel", "HEROES · " + preset.name);
    var search = String(panel("HPColorsHeroSearchField").text || "").trim().toUpperCase();
    var list = panel("HPColorsHeroList"), count = 0, first = null;
    list.SetHasClass("HeroSearchActive", !!search);
    heroTiles.forEach(function (item) {
      var match = !search || (item.hero ? item.hero.name + " " + item.hero.key : "Default for unassigned heroes").toUpperCase().indexOf(search) >= 0;
      item.tile.SetHasClass("HeroSearchMatch", match);
      if (!searchChanged) {
        var owner = item.hero ? (bundle.heroPresets || {})[item.hero.key] : bundle.heroDefault;
        item.tile.SetHasClass("SelectedHero", owner === heroPicker);
        item.tile.SetHasClass("Checked", owner === heroPicker);
        item.tile.SetHasClass("AssignedElsewhere", !!item.hero && !!owner && owner !== heroPicker);
        var other = presets.filter(function (entry) { return entry.id === owner; })[0];
        item.ownerName = owner === DEFAULT_PRESET_ID ? defaultName(bundle) : other ? other.name : "";
      }
      if (item.hero && match) { count++; if (!first) first = item.tile; }
    });
    setLabel("HPColorsHeroMatchCount", count + " / " + (heroTiles.length - 1) + " heroes" + (count ? "" : " · No matching heroes"));
    if (searchChanged && search && first) scrollTo(first);
  }
  function openHeroPicker(id) {
    closeFor(CLOSES_ON_OPEN.hero);
    heroPicker = id;
    panel("HPColorsHeroSearchField").text = "";
    var list = panel("HPColorsHeroList"); list.RemoveAndDeleteChildren(); heroTiles = [];
    var heroes = contractRef.heroes.filter(function (hero) {
      // Released heroes can stay development-flagged upstream (Baba; Violet on 6790), so only
      // disabled or testing-flagged heroes are hidden.
      return !hero.disabled && !hero.needsTesting && !hero.limitedTesting;
    }).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    [null].concat(heroes).forEach(function (hero, index) {
      var prefix = hero ? "HPColorsHeroItem" + (index - 1) : "HPColorsHeroDefault";
      var tile = $.CreatePanel("Button", list, prefix + "Toggle"); tile.AddClass("HPC3HeroTile");
      tile.SetAttributeString("hpv3_hero_key", hero ? hero.key : "");
      passive("Panel", tile, "", "HPC3HeroCircle");
      var image = passive("Image", tile, "", "HPC3HeroPortrait");
      image.SetImage(hero ? hero.portrait || "s2r://panorama/images/control_icons/no_hero_png.vtex" : "s2r://panorama/images/icons/icon_gear.vsvg");
      if (!hero) image.AddClass("HPC3HeroGear");
      var anchor = passive("Panel", tile, "", "HPC3HeroAssignedAnchor");
      passive("Panel", anchor, "", "HPC3HeroAssignedDot");
      passive("Label", tile, "", "HPC3HeroName", hero ? hero.name : "Default");
      passive("Label", tile, "", "HPC3HeroCheck", "✓");
      var item = { tile: tile, hero: hero, ownerName: "" }; heroTiles.push(item);
      tooltip(tile, function () {
        return (hero ? hero.name : "Default for unassigned heroes") +
          (tile.BHasClass("AssignedElsewhere") ? " · Assigned to " + item.ownerName : "");
      }, true);
      tile.SetPanelEvent("onactivate", function () {
        if (!heroPicker || !valid(tile) || retired) return;
        if (!hero) { toggleHeroDefault(heroPicker); return; }
        mutatePresets(function (next) {
          if (!next.heroPresets) next.heroPresets = {};
          if (next.heroPresets[hero.key] === heroPicker) delete next.heroPresets[hero.key];
          else next.heroPresets[hero.key] = heroPicker;
        }, true);
      });
    });
    renderHeroPicker();
    panel("HPColorsHeroDialog").AddClass("Open");
    panel("HPColorsHeroSearchField").SetFocus();
  }
  function toggleHeroDefault(id) {
    mutatePresets(function (bundle) { bundle.heroDefault = bundle.heroDefault === id ? null : id; }, true);
  }
  function hideBakedDefault(bundle) {
    if (!Array.isArray(bundle.hiddenBakedPresetIds)) bundle.hiddenBakedPresetIds = [];
    if (bundle.hiddenBakedPresetIds.indexOf(DEFAULT_PRESET_ID) < 0) bundle.hiddenBakedPresetIds.push(DEFAULT_PRESET_ID);
  }
  // Applies a preset through the store when it offers applyPreset, else as a plain settings edit.
  function applyThroughStore(preset) {
    var target = store();
    try {
      if (target && typeof target.applyPreset === "function") target.applyPreset(preset);
      else editSettings(preset.settings);
    } catch (error) { presetStatus(String(error.message || error), true); }
  }
  function defaultName(bundle) {
    var name = bundle.bakedPresetNameOverrides && bundle.bakedPresetNameOverrides[DEFAULT_PRESET_ID];
    return typeof name === "string" && name.trim() && name.trim().length <= limits().nameMax ? name.trim() : DEFAULT_PRESET_NAME;
  }
  function presetName(raw) {
    var name = String(raw || "").trim();
    if (!name || name.length > limits().nameMax) throw new Error("Preset names must contain 1–" + limits().nameMax + " characters.");
    return name;
  }
  function createPreset(bundle, settings, name) {
    if (bundle.presets.length >= limits().maxPresets) throw new Error("At most " + limits().maxPresets + " presets can be saved.");
    var number = Number(bundle.nextUserPresetNumber);
    if (!Number.isSafeInteger(number) || number < 1 || number >= Number.MAX_SAFE_INTEGER - 128) number = 1;
    var names = bundle.presets.map(function (preset) { return preset.name.toUpperCase(); });
    names.push(defaultName(bundle).toUpperCase());
    var ids = bundle.presets.map(function (preset) { return preset.id; });
    while (ids.indexOf("user-" + number) >= 0 || (!name && names.indexOf("PRESET " + number) >= 0)) number++;
    bundle.presets.push({ id: "user-" + number, name: name ? presetName(name) : "PRESET " + number, settings: clone(settings) });
    var added = bundle.presets[bundle.presets.length - 1];
    ["v2pending", "rules"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(bundle, key)) added[key] = clone(bundle[key]);
    });
    bundle.nextUserPresetNumber = number + 1;
  }
  function copyPreset(preset) {
    try {
      var bundle = preset ? { settings: clone(preset.settings), presets: [clone(preset)] }
        : { settings: clone(contractRef.defaults), presets: [{ id: "default-copy", name: defaultName(presetBundle()), settings: clone(contractRef.defaults) }] };
      var result = $.HPColorsV3Sharing.exportBundleCode(bundle);
      if (!result.ok) throw new Error(result.message);
      // The bundle code box is the carrier, and holds the code for a manual copy when both routes fail.
      var entry = panel("HPColorsBundleCodeEntry");
      if (copyText(result.code, entry, null)) presetStatus("Preset code copied.", false);
      else if (entry) presetStatus("The preset code is in the Bundle code box; copy it manually.", false);
      else throw new Error("Preset code could not be copied.");
    } catch (error) { presetStatus(String(error.message || error), true); }
  }
  function libraryAction(id, action, value) {
    if (action === "apply" || action === "copy") {
      var source = presetBundle().presets.filter(function (preset) { return preset.id === id; })[0];
      if (action === "copy") { if (source) copyPreset(source); return; }
      if (source && contractRef.validate(source.settings)) {
        applyThroughStore(source);
      }
      return;
    }
    var deleted = mutatePresets(function (bundle) {
      var index = bundle.presets.map(function (preset) { return preset.id; }).indexOf(id);
      if (index < 0) throw new Error("That preset no longer exists.");
      var preset = bundle.presets[index];
      if (action === "rename") preset.name = presetName(value);
      else if (action === "delete") {
        bundle.presets.splice(index, 1);
        Object.keys(bundle.heroPresets || {}).forEach(function (hero) { if (bundle.heroPresets[hero] === id) delete bundle.heroPresets[hero]; });
        if (bundle.heroDefault === id) bundle.heroDefault = null;
        if (bundle.sourcePresetId === id) { bundle.sourcePresetId = null; bundle.sourceWasMapped = false; }
      }
      else {
        var other = index + value;
        if (other < 0 || other >= bundle.presets.length) return false;
        bundle.presets[index] = bundle.presets[other]; bundle.presets[other] = preset;
        revealPresetId = id;
      }
    }) && action === "delete";
    if (deleted && sourcePresetId === id) { sourcePresetId = ""; sourceWasMapped = false; }
  }
  function cancelDelete() {
    var wasOpen = !!deletePreset;
    deletePreset = "";
    leaveDialog("HPColorsPresetDeleteDialog", "HPColorsPresetSelectedDeleteButton", wasOpen);
  }
  function requestDelete(preset) {
    closeInfo();
    deletePreset = preset.id;
    setLabel("HPColorsPresetDeleteMessage", 'Delete "' + preset.name + '"? This removes the saved preset, not the settings on screen.');
    panel("HPColorsPresetDeleteDialog").AddClass("Open");
    panel("HPColorsPresetDeleteCancelButton").SetFocus();
  }
  function cancelBundleReplacement() {
    var wasOpen = !!bundleReplacement;
    bundleReplacement = null;
    leaveDialog("HPColorsBundleReplaceDialog", "HPColorsBundleReplaceButton", wasOpen);
  }
  function requestBundleReplacement() {
    closeInfo();
    cancelBundleReplacement();
    var target = store(), entry = panel("HPColorsBundleCodeEntry");
    if (!target || typeof target.decodeBundleCode !== "function" || !entry) { setCodeStatus("Bundle replacement is unavailable.", "error"); return; }
    try {
      var text = String(entry.text || "").trim();
      if (!text) throw new Error("Paste a bundle code first.");
      var found = decodeCode(target, "Bundle", text);
      if (found.kind !== "Bundle") throw new Error("This is a settings code. Press IMPORT to apply it; REPLACE ALL needs a bundle code.");
      var next = found.decoded;
      if (!next || !contractRef.validate(next.settings)) throw new Error(UNUSABLE_CODE);
      closePicker(false); endGesture();
      bundleReplacement = clone(next);
      setLabel("HPColorsBundleReplaceMessage", "Restore this bundle's active settings and metadata? This overwrites ALL " + presetBundle().presets.length + " saved presets, including any that another window added, with this bundle's " + next.presets.length + " presets. This cannot be undone for the library.");
      panel("HPColorsBundleReplaceDialog").AddClass("Open");
      panel("HPColorsBundleReplaceCancelButton").SetFocus();
    } catch (error) { trigger(entry, "HPC3NegativeShake"); setCodeStatus(String(error.message || error), "error"); }
  }
  function confirmBundleReplacement() {
    if (!bundleReplacement) return;
    var next = bundleReplacement, before = historySnapshot(), target = store(), current = presetBundle();
    cancelBundleReplacement();
    // NEW-tab dismissals and the colorblind choice are personal: a replaced bundle keeps this player's.
    ["newsDismissed", "colorblind"].forEach(function (key) {
      if (current[key] !== undefined) next[key] = current[key]; else delete next[key];
    });
    try {
      if (!contractRef.validate(next.settings)) throw new Error("Invalid bundle settings.");
      if (!target || typeof target.replaceBundle !== "function" || !target.replaceBundle(next)) throw new Error("Bundle replacement refused; nothing changed.");
      sourcePresetId = next.sourcePresetId || ""; sourceWasMapped = next.sourceWasMapped === true;
      syncPresetSelection(presetBundle());
      record(before);
      setCodeStatus("Bundle replaced.", "ok");
    } catch (error) { setCodeStatus(String(error.message || error), "error"); }
  }
  function selectedPreset(bundle) {
    return selectedPresetId === DEFAULT_PRESET_ID ? { id: DEFAULT_PRESET_ID, name: defaultName(bundle), settings: contractRef.defaults } :
      bundle.presets.filter(function (item) { return item.id === selectedPresetId; })[0];
  }
  function syncPresetSelection(bundle) {
    var selected = selectedPreset(bundle), baked = selectedPresetId === DEFAULT_PRESET_ID;
    presetTiles.forEach(function (item) {
      item.tile.SetHasClass("Selected", item.id === selectedPresetId);
      item.tile.SetHasClass("Applied", item.id === sourcePresetId);
      item.tile.SetHasClass("HeroDefault", item.id === bundle.heroDefault);
    });
    var name = selected ? selected.id + "\n" + selected.name : "";
    if (selectedName !== name) {
      selectedName = name;
      panel("HPColorsPresetSelectedNameEntry").text = selected ? selected.name : "";
    }
    panel("HPColorsPresetSelectedNameEntry").enabled = !!selected;
    var index = bundle.presets.map(function (item) { return item.id; }).indexOf(selectedPresetId);
    ["Apply", "Rename", "Copy", "Delete", "Heroes", "Default"].forEach(function (role) {
      panel("HPColorsPresetSelected" + role + "Button").enabled = !!selected;
    });
    panel("HPColorsPresetSelectedUpButton").enabled = !baked && index > 0;
    panel("HPColorsPresetSelectedDownButton").enabled = !baked && index >= 0 && index < bundle.presets.length - 1;
    var toggle = panel("HPColorsPresetSelectedDefaultButton");
    toggle.SetHasClass("Checked", !!selected && bundle.heroDefault === selectedPresetId);
    var remove = panel("HPColorsPresetSelectedDeleteButton");
    remove.SetAttributeString("tooltip", baked ? "HIDE" : "DELETE");
    remove.FindChildrenWithClassTraverse("HPC3Glyph")[0].SetImage("s2r://panorama/images/icons/" + (baked ? "icon_eye_disabled.vsvg" : "delete_trash.vsvg"));
  }
  function selectPreset(id) {
    selectedPresetId = id;
    syncPresetSelection(presetBundle());
  }
  function refreshPresets() {
    var bundle = config && !retired ? presetBundle() : null;
    if (bundle) readNewsSaved(bundle);
    syncNews();
    if (!bundle || !contractRef || !panel("HPColorsPresetList")) return;
    cancelDelete(); cancelBundleReplacement();
    var rows = bundle.presets;
    if (sourcePresetId && sourcePresetId !== DEFAULT_PRESET_ID && !rows.some(function (preset) { return preset.id === sourcePresetId; })) {
      sourcePresetId = ""; sourceWasMapped = false;
    }
    var hidden = Array.isArray(bundle.hiddenBakedPresetIds) && bundle.hiddenBakedPresetIds.indexOf(DEFAULT_PRESET_ID) >= 0;
    panel("HPColorsPresetDefault").SetHasClass("HPC3Hidden", hidden);
    setLabel("HPColorsPresetDefaultNameLabel", defaultName(bundle));
    setLabel("HPColorsPresetLibraryHeading", "LIBRARY · " + rows.length + "/" + limits().maxPresets);
    panel("HPColorsPresetRestoreButton").enabled = hidden;
    if (!selectedPreset(bundle) || selectedPresetId === DEFAULT_PRESET_ID && hidden) selectedPresetId = rows.length ? rows[0].id : hidden ? "" : DEFAULT_PRESET_ID;
    var libraryKey = JSON.stringify(rows.map(function (item) { return [item.id, item.name]; }));
    var changed = libraryKey !== librarySignature;
    if (changed) {
      librarySignature = libraryKey;
      // Reconcile by id, not index: rename/reorder preserves the scroll container, tile and focus.
      var list = panel("HPColorsPresetList");
      var previousTiles = presetTiles.length ? presetTiles.slice(1) : list.Children().filter(function (tile) {
        return !!tile.GetAttributeString("hpv3_preset_id", "");
      }).map(function (tile) { return { id: tile.GetAttributeString("hpv3_preset_id", ""), tile: tile }; });
      presetTiles = [{ id: DEFAULT_PRESET_ID, tile: panel("HPColorsPresetDefault") }];
      rows.forEach(function (preset, index) {
        var existing = previousTiles.filter(function (item) { return item.id === preset.id && valid(item.tile); })[0];
        var tile = existing && existing.tile;
        if (!tile) {
          var tileId;
          do { tileId = "HPColorsPresetItem" + (++tileSerial); } while (list.FindChild(tileId));
          tile = $.CreatePanel("Button", list, tileId);
        }
        if (!existing) {
          tile.AddClass("HPC3PresetTile"); tile.SetAttributeString("hpv3_preset_id", preset.id);
          var face = passive("Panel", tile, "", "HPC3PresetTileFace");
          passive("Label", face, "", "HPC3PresetTileName", preset.name);
          passive("Image", tile, "", "HPC3PresetSource").SetImage("s2r://panorama/images/icons/icon_checkmark.vsvg");
          passive("Image", tile, "", "HPC3PresetDefaultMark").SetImage("s2r://panorama/images/icons/icon_star_white.vsvg");
        }
        tile.SetPanelEvent("onactivate", function () { if (!retired && valid(tile)) selectPreset(preset.id); });
        tooltip(tile, function () { return tile.FindChildrenWithClassTraverse("HPC3PresetTileName")[0].text; }, true);
        tile.FindChildrenWithClassTraverse("HPC3PresetTileName")[0].text = preset.name;
        var before = list.Children()[index + 1];
        if (before && before !== tile) list.MoveChildBefore(tile, before);
        else if (!before) list.MoveChildAfter(tile, list.Children()[list.Children().length - 1]);
        presetTiles.push({ id: preset.id, tile: tile });
      });
      previousTiles.forEach(function (item) {
        if (!rows.some(function (preset) { return preset.id === item.id; }) && valid(item.tile)) {
          delete panels[item.tile.id];
          item.tile.DeleteAsync(0);
        }
      });
    }
    syncPresetSelection(bundle);
    if (changed && revealPresetId) {
      var moved = presetTiles.filter(function (item) { return item.id === revealPresetId; })[0];
      if (moved) scrollTo(moved.tile);
    }
    revealPresetId = "";
    renderHeroPicker();
  }
  function selectedAction(action) {
    var bundle = presetBundle(), preset = selectedPreset(bundle);
    if (!preset) return;
    var baked = preset.id === DEFAULT_PRESET_ID, entry = panel("HPColorsPresetSelectedNameEntry");
    if (action === "heroes") { openHeroPicker(preset.id); return; }
    if (action === "default") { toggleHeroDefault(preset.id); return; }
    if (action === "delete") {
      if (!baked) { requestDelete(preset); return; }
      mutatePresets(function (next) {
        hideBakedDefault(next);
      });
      return;
    }
    if (!baked) { libraryAction(preset.id, action === "up" || action === "down" ? "move" : action, action === "up" ? -1 : action === "down" ? 1 : entry.text); return; }
    if (action === "copy") { copyPreset(null); return; }
    if (action === "rename") {
      mutatePresets(function (next) {
        var name = presetName(entry.text);
        if (!next.bakedPresetNameOverrides || typeof next.bakedPresetNameOverrides !== "object" || Array.isArray(next.bakedPresetNameOverrides)) next.bakedPresetNameOverrides = {};
        if (name === DEFAULT_PRESET_NAME) delete next.bakedPresetNameOverrides[DEFAULT_PRESET_ID];
        else next.bakedPresetNameOverrides[DEFAULT_PRESET_ID] = name;
      });
    } else if (action === "apply") {
      applyThroughStore({ id: DEFAULT_PRESET_ID, settings: contractRef.defaults });
    }
  }
  // Pressing Enter in the preset-name entry does nothing by design: only the SAVE NEW button commits the
  // draft (a stray Enter must not save). The handler stays explicit so the entry's submit is a deliberate no-op.
  function noopSubmit() {}
  function bindPresets() {
    on("HPColorsPresetDefault", "onactivate", function () { selectPreset(DEFAULT_PRESET_ID); });
    tooltip(panel("HPColorsPresetDefault"), function () { return defaultName(presetBundle()); });
    ["Apply", "Rename", "Up", "Down", "Copy", "Delete", "Heroes", "Default"].forEach(function (role) {
      var target = panel("HPColorsPresetSelected" + role + "Button");
      if (!target) return;
      on(target.id, "onactivate", function () { if (!retired && target.enabled) selectedAction(role.toLowerCase()); });
    });
    on("HPColorsHeroCloseButton", "onactivate", closeHeroPicker);
    on("HPColorsHeroSearchField", "ontextentrychange", function () { renderHeroPicker(true); });
    on("HPColorsPresetSaveButton", "onactivate", function () {
      var addedId = "";
      if (mutatePresets(function (bundle) {
        createPreset(bundle, config.settings, panel("HPColorsPresetNameEntry").text.trim());
        addedId = bundle.presets[bundle.presets.length - 1].id;
        // v2 hides its baked default when an All Heroes user preset is first saved.
        hideBakedDefault(bundle);
        // The new preset holds the current settings, so it becomes the applied one and takes later edits.
        bundle.sourcePresetId = addedId; bundle.sourceWasMapped = false;
      })) {
        sourcePresetId = addedId; sourceWasMapped = false;
        panel("HPColorsPresetNameEntry").text = "";
        selectPreset(addedId);
        var added = presetTiles.filter(function (item) { return item.id === addedId; })[0];
        if (added) scrollTo(added.tile);
      }
    });
    on("HPColorsPresetNameEntry", "ontextentrysubmit", noopSubmit);
    on("HPColorsPresetDeleteConfirmButton", "onactivate", function () {
      var id = deletePreset;
      cancelDelete();
      if (id) libraryAction(id, "delete");
    });
    on("HPColorsPresetDeleteCancelButton", "onactivate", cancelDelete);
    on("HPColorsPresetRestoreButton", "onactivate", function () {
      if (mutatePresets(function (bundle) { bundle.hiddenBakedPresetIds = []; })) selectPreset(DEFAULT_PRESET_ID);
    });
  }

  // ---- Unreadable-save recovery: offered only when the store reports it; needs a second click ----
  function applySaveReset() {
    var root = host();
    if (!root) return;
    root.SetHasClass("SaveResetAvailable", saveResetAvailable);
    root.RemoveClass("SaveResetConfirming");
  }
  function setSaveResetAvailable(available) {
    saveResetAvailable = available === true;
    if (contractRef) applySaveReset();
  }
  function confirmSaveReset() {
    var root = host();
    var target = store();
    if (!root || !saveResetAvailable || !root.BHasClass("SaveResetConfirming")) return;
    root.RemoveClass("SaveResetConfirming");
    if (!target || typeof target.resetUnreadableSave !== "function") return;
    var done = false;
    try { done = target.resetUnreadableSave(true) === true; } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] save reset failed: " + error);
    }
    if (done) setSaveResetAvailable(false);
  }

  // ---- Status labels and share codes (hooks provided by the storage ticket's $.HPColorsV3Store) ----
  function setLabel(id, text, tone) {
    var label = panel(id);
    if (!label) return;
    label.text = String(text === undefined || text === null ? "" : text);
    label.SetHasClass("ToneOk", tone === "ok");
    label.SetHasClass("ToneBusy", tone === "busy");
    label.SetHasClass("ToneError", tone === "error");
  }
  function setCodeStatus(text, tone) {
    codeStatusWrites++;
    codeStatusText = String(text === undefined || text === null ? "" : text);
    setLabel("HPColorsCodeStatus", text, tone);
  }
  var menuApi = {
    getRoot: function () { return activeRoot; },
    getSettings: function () { return config ? clone(config.settings) : null; },
    getRules: function () { return config ? clone(config.rules) : {}; },
    applySettings: applySettings,
    editSettings: editSettings,
    applyPresetSettings: applyPresetSettings,
    hydrateSettings: hydrateSettings,
    setSaveStatus: function (text, tone) {
      setLabel("HPColorsSaveStatus", text, tone);
      if (!publicationResolved && String(text).indexOf("UNAVAILABLE") === 0) resolvePublication();
    },
    setCodeStatus: setCodeStatus,
    setSaveResetAvailable: setSaveResetAvailable,
    refreshPresets: refreshPresets,
  };
  // Either paste box takes either code kind. A v2 tag names its kind; otherwise try the box's own kind
  // first. When both fail, report the first decoder's error unless it is only a kind mismatch.
  var WRONG_KIND = "Use the matching settings or bundle paste box for this code.";
  function decodeCode(target, kind, text) {
    var first = /HPCRP1/.test(text) ? "Bundle" : /HPCR2/.test(text) ? "Settings" : kind;
    var kinds = [first, first === "Settings" ? "Bundle" : "Settings"], errors = [];
    for (var i = 0; i < kinds.length; i++) {
      var decoder = target["decode" + kinds[i] + "Code"];
      if (typeof decoder !== "function") continue;
      try { return { kind: kinds[i], decoded: decoder(text) }; } catch (error) { errors.push(error); }
    }
    var useful = errors.filter(function (error) { return !error || error.message !== WRONG_KIND; });
    throw useful[0] || errors[0] || new Error("Share code validation is unavailable; nothing changed.");
  }
  function codeAction(kind, action) {
    var target = store();
    var method = (action === "copy" ? "export" : "import") + kind + "Code";
    var entry = panel("HPColors" + kind + "CodeEntry");
    if (!target || typeof target[method] !== "function" || !entry || !config) {
      if (action !== "copy") trigger(entry, "HPC3NegativeShake");
      setCodeStatus("Share codes are unavailable.", "error"); return;
    }
    var noun = kind === "Settings" ? "Settings code" : "Bundle code";
    try {
      if (action === "copy") {
        var code = String(target[method](clone(config.settings)));
        entry.text = code;
        var copied = copyText(code, entry, null);
        setCodeStatus(copied ? noun + " copied." : "Code is in the box; copy it manually.", copied ? "ok" : "");
        return;
      }
      var text = String(entry.text || "").trim();
      if (!text) { $.DispatchEvent("TextEntryInsertFromClipboard", entry); text = String(entry.text || "").trim(); }
      if (!text) { trigger(entry, "HPC3NegativeShake"); setCodeStatus("Paste a code first.", "error"); return; }
      var writes = codeStatusWrites;
      // The code, not the box, decides what IMPORT does: a settings code applies, a bundle appends presets.
      var found = decodeCode(target, kind, text);
      kind = found.kind; noun = kind === "Settings" ? "Settings code" : "Bundle code"; method = "import" + kind + "Code";
      var candidate = kind === "Bundle" ? found.decoded && found.decoded.settings : found.decoded;
      if (!contractRef.validate(candidate)) throw new Error(UNUSABLE_CODE);
      if (typeof target[method] !== "function") throw new Error("Share codes are unavailable.");
      var settings = target[method](text);
      if (settings) {
        if (!contractRef.validate(settings)) { trigger(entry, "HPC3NegativeShake"); setCodeStatus(UNUSABLE_CODE, "error"); return; }
        if (kind !== "Bundle") editSettings(settings);
      }
      // Keep a warning the store wrote during import (for example a newer-version code).
      if (codeStatusWrites === writes || !codeStatusText) setCodeStatus(kind === "Bundle" ? "Presets imported." : noun + " imported.", "ok");
    } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] code " + kind + " " + action + " failed: " + error + " stack=" + String(error && error.stack || "").split("\n").slice(0, 4).join(" | "));
      setCodeStatus(error && error.message ? String(error.message) : "That code could not be read.", "error");
      if (action !== "copy") trigger(entry, "HPC3NegativeShake");
    }
  }

  // CLOSE button, ESC button and backdrop of an informational dialog all just close it.
  function bindDismiss(prefix, close) {
    on(prefix + "CloseButton", "onactivate", close);
    on(prefix + "EscClose", "onactivate", close);
    on(prefix + "Backdrop", "onactivate", close);
  }
  function bindChrome() {
    activeRoot.FindChildrenWithClassTraverse("HPC3GlyphButton").forEach(function (target) {
      tooltip(target, function () { return target.GetAttributeString("tooltip", ""); });
    });
    on("HPColorsUndoButton", "onactivate", undo);
    on("HPColorsShowBoundsToggle", "onactivate", toggleBounds);
    COLORBLIND_TYPES.forEach(bindColorblind);
    on("HPColorsPreviewCreditsButton", "onactivate", openCredits);
    on("HPColorsPreviewDonateButton", "onactivate", function () {
      if (retired) return;
      try {
        if (typeof $.DispatchEvent === "function") $.DispatchEvent("ExternalBrowserGoToURL", LINKS.donate);
      } catch (error) { /* The external browser is optional. */ }
    });
    on("HPColorsPreviewFeedbackButton", "onactivate", openFeedback);
    on("HPColorsFeedbackNameButton", "onactivate", copyFeedback);
    bindDismiss("HPColorsFeedback", closeInfo);
    bindDismiss("HPColorsCredits", closeInfo);
    bindDismiss("HPColorsUpdate", closeUpdate);
    on("HPColorsUpdateDownloadButton", "onactivate", openUpdateDownload);
    on("HPColorsResetPageButton", "onactivate", requestReset);
    on("HPColorsResetPageConfirmButton", "onactivate", confirmReset);
    on("HPColorsResetPageCancelButton", "onactivate", cancelReset);
    on("HPColorsBundleReplaceButton", "onactivate", requestBundleReplacement);
    on("HPColorsBundleReplaceConfirmButton", "onactivate", confirmBundleReplacement);
    on("HPColorsBundleReplaceCancelButton", "onactivate", cancelBundleReplacement);
    bindPicker();
    bindConditions();
    bindPresets();
    on("HPColorsResetPageEscClose", "onactivate", cancelReset);
    on("HPColorsPresetDeleteEscClose", "onactivate", cancelDelete);
    on("HPColorsBundleReplaceEscClose", "onactivate", cancelBundleReplacement);
    on("HPColorsHeroEscClose", "onactivate", closeHeroPicker);
    on("HPColorsConditionEscClose", "onactivate", closeCondition);
    on("HPColorsPickerEscClose", "onactivate", function () { closePicker(true); });
    var menu = contractRef.menu;
    menu.pages.forEach(function (page, index) {
      on(page.navId, "onactivate", function () { goToPage(index); });
    });
    (menu.news || []).forEach(function (item) {
      on(item.buttonId, "onactivate", function () { openNews(item); });
      on(item.dismissId, "onactivate", function () { dismissNews([item.id]); });
    });
    on("HPColorsNewClearAllButton", "onactivate", function () { dismissNews(newsShowing().map(function (item) { return item.id; })); });
    on("HPColorsShareButton", "onactivate", function () {
      goToPage(pageIndexOf(PAGE_PRESETS));
    });
    menu.groups.forEach(function (group) {
      on(group.subNavId, "onactivate", function () { activateGroup(group); });
      on(group.resetId, "onactivate", function () { resetGroup(group); });
      (group.sides || []).forEach(function (tab) { on(tab.id, "onactivate", function () { selectSide(tab.side); }); });
      on(group.id, "onmouseover", function () {
        if (panel(group.id) && !panel(group.id).BHasClass("Active")) selectGroup(null);
      });
    });
    menu.folds.forEach(function (fold) {
      on(fold.toggleId, "onactivate", function () { if (panel(fold.id)) panel(fold.id).ToggleClass("Open"); });
    });
    on("HPColorsSearchField", "ontextentrychange", function () {
      if (menuIsOpen() && panel("HPColorsSearchField")) applySearch(panel("HPColorsSearchField").text);
    });
    on("HPColorsCloseButton", "onactivate", function () { setMenuOpen(false); });
    on("HPColorsResetSaveButton", "onactivate", function () { if (host() && saveResetAvailable) host().ToggleClass("SaveResetConfirming"); });
    on("HPColorsResetSaveConfirmButton", "onactivate", confirmSaveReset);
    ["Settings", "Bundle"].forEach(function (kind) {
      on("HPColors" + kind + "CopyButton", "onactivate", function () { codeAction(kind, "copy"); });
      on("HPColors" + kind + "ImportButton", "onactivate", function () { codeAction(kind, "import"); });
    });
  }

  // One walk per boot attempt instead of a FindChildTraverse per id.
  function collect(parent, found) {
    var children = parent.Children();
    for (var i = 0; i < children.length; i++) {
      if (!valid(children[i])) continue;
      if (children[i].id) found[children[i].id] = children[i];
      collect(children[i], found);
    }
  }

  function boot() {
    var root = $.GetContextPanel();
    if (retired || !valid(root)) return;
    if (activeRoot !== root) {
      if (pending) $.CancelScheduled(pending);
      stopIdentityWatch(); resetEscapeWatch();
      setSupporterStripOpen(false);
      activeRoot = root;
      pending = null;
      generation++;
      retryCount = 0;
      panels = Object.create(null);
      hueThumbs = Object.create(null);
      conditionImages = [];
      presetTiles = []; heroTiles = []; librarySignature = ""; selectedName = "";
      bound = Object.create(null);
      gesture = null; picker = null; conditionDraft = null; resetPage = null; deletePreset = "";
      nativeHex = null; nativeBound = null;
      ready = false;
      lastMissing = "";
      if (answerJob) $.CancelScheduled(answerJob);
      answerJob = null;
      cancelGesturePublish();
      if (loadFallback) $.CancelScheduled(loadFallback);
      loadFallback = null;
      clearHistory();
      publisherEpoch = Date.now().toString(36) + ":" + Math.random().toString(36).slice(2);
      lastPublishedAt = -Infinity;
      retireHud();
      publishedHudKey = "";
      var top = topPanel();
      showBounds = !!top && top.GetAttributeString(BOUNDS_ATTR, "") === "1";
      readColorblind();
    }
    var contract = $.HPColorsV3Settings;
    if (contract && (contractRef !== contract || !config || config.epoch !== publisherEpoch)) {
      // No cross-context process cache exists here (no GameUI); warm reloads use the retired instance's settings.
      var initial = inherited && contract.validate(inherited.settings) ? inherited.settings
        : config && contractRef === contract && contract.validate(config.settings) ? config.settings : contract.defaults;
      publicationResolved = !!(inherited && contract.validate(inherited.settings) || !store());
      // The route key travels too: a reload must not re-route over a preset applied by hand.
      if (inherited) { sourcePresetId = inherited.sourcePresetId || ""; sourceWasMapped = inherited.sourceWasMapped === true; routedKey = inherited.routedKey || ""; }
      config = { magic: contract.magic, epoch: publisherEpoch, revision: 0, settings: clone(initial), rules: clone(inherited && inherited.rules || config && config.rules || {}) };
      contractRef = contract;
      heroKeys = Object.create(null); heroByKey = Object.create(null);
      contract.heroes.forEach(function (hero) {
        heroByKey[hero.key] = hero;
        [hero.name, hero.nameToken].forEach(function (name) {
          var token = name.toUpperCase(); if (!heroKeys[token]) heroKeys[token] = hero.key;
        });
      });
      ruleRows = {}; rowCells = new Map(); requirementRows = {};
      requirementList = []; requirementIds = [];
      requirementKeys = {};
      // One pass over the controls: key|side -> row (unique in the contract).
      contract.controls.forEach(function (row) {
        requirementRows[row.key + "|" + row.side] = row;
        if (row.requires) {
          requirementList.push(row);
          requirementIds.push(controlType(row).ids(row).filter(Boolean));
        }
        (row.requires || []).forEach(function readKeys(condition) {
          if (condition.any) condition.any.forEach(readKeys); else requirementKeys[condition.key] = true;
        });
      });
      contract.slots.forEach(function (slot) {
        ruleRows[slot.slot] = requirementRows[slot.setting + "|" + slot.side];
        rowCells.set(ruleRows[slot.slot], slot.slot);
      });
      effectiveSettings = null; lastPublishedRevision = -1;
      replace(config.settings, config.rules);
      inherited = null;
      searchWords = null;
      if (publicationResolved) publish();
      else if (!loadFallback) {
        var loadToken = generation;
        loadFallback = $.Schedule(30, function () {
          loadFallback = null;
          if (!retired && loadToken === generation && valid(activeRoot)) resolvePublication();
        });
      }
    }
    if (handlerId === null) handlerId = $.RegisterForUnhandledEvent("ClientUI_FireOutput", answer);
    if (ready) return;
    var missingIds = [];
    if (!contract) missingIds.push("HPColorsV3Settings");
    else {
      var found = Object.create(null);
      collect(root, found);
      panels = found; shownActive = {};
      // A reincluded menu inherits the side class of the old context: the mirror starts from it.
      shownSide = found[contract.menu.rootId] && found[contract.menu.rootId].BHasClass("HPC3SideAlly") ? "ally" : "enemy";
      contract.ids.forEach(function (id) { if (id !== "HPColorsNativePicker" && !found[id]) missingIds.push(id); });
      bindChrome();
      for (var i = 0; i < contract.controls.length; i++) {
        bindControl(contract.controls[i]);
        sync(contract.controls[i]);
      }
      syncRequirements();
      if (pageIndex < 0) pageIndex = contract.menu.startPage || 0;
      showPage(pageIndex);
      // refreshPresets (which keeps the saved list) waits for a complete boot; a boot that is still retrying
      // a missing control reads the list here.
      if (config) readNewsSaved(presetBundle());
      syncNews();
      syncNavDots();
      selectSide(shownSide);
    }
    if (!missingIds.length) {
      ready = true;
      host().SetAttributeString("hpv3_boot", "ready");
      applySaveReset();
      syncUndo();
      refreshPresets();
      syncBounds(); syncColorblind();
      syncPreview();
      if (menuIsOpen()) setSupporterStripOpen(true);
      // Releases a previous context's HUD wash while a cold load is still pending.
      paintHud();
      var target = store();
      if (target && typeof target.attach === "function" && storeRoot !== root) {
        storeRoot = root;
        try { target.attach(menuApi); } catch (error) {
          // HPV3_DEBUG $.Msg("[HPV3] store attach failed: " + error);
        }
      }
      renderIdentity();
      startIdentityWatch();
      // HPV3_DEBUG $.Msg("[HPV3] menu boot " + contractRef.version);
      return;
    }
    var missingKey = missingIds.join(", ");
    if (missingKey !== lastMissing) {
      lastMissing = missingKey;
      // HPV3_DEBUG $.Msg("[HPV3] menu missing controls: " + missingKey);
    }
    if (!pending && retryCount < 6) {
      var token = generation;
      pending = $.Schedule(Math.min(0.1 * Math.pow(2, retryCount), 2), function menuRetry() {
        if (token !== generation) return;
        pending = null;
        if (valid(root)) boot();
      });
      retryCount++;
    }
  }

  $.HPColorsMenuBoot = boot;
  // Read by the QOLLOCK bridge: false until the contract is loaded, then the live HPC3Open state.
  $.HPColorsMenuIsOpen = function () { return !!contractRef && menuIsOpen(); };
  $.HPColorsMenuToggle = function () {
    if (!valid(activeRoot) || !contractRef || !host()) return;
    setMenuOpen(!menuIsOpen());
  };
  // ESC closes the first open dialog, else clears the search, else closes the editor; only a closed editor returns false so stock resume runs.
  $.HPColorsMenuCancel = function () {
    if (!valid(activeRoot) || !contractRef || !host()) return false;
    var root = host();
    if (!root.BHasClass("HPC3Open")) return false;
    for (var i = 0; i < DIALOGS.length; i++) if (DIALOGS[i].isOpen()) { DIALOGS[i].close(); return true; }
    if (root.BHasClass("Searching")) clearSearch();
    else setMenuOpen(false);
    return true;
  };
})();
