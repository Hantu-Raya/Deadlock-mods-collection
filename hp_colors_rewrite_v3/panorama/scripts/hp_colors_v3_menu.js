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
  var heroKeys = Object.create(null);
  var rowCells = new Map();
  var effectiveSettings = null, lastPublishedRevision = -1;
  var tiers = [-1, -1, -1, -1], requiredSlots = [false, false, false, false], ruleRows = {};
  var signature = null, abilityOwner = null, abilityPanels = [null, null, null, null], matchedRules = "";
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
  var selectedPresetId = "baked_default", presetTiles = [], librarySignature = "", selectedName = "", tileSerial = 0;
  var heroPicker = "", heroTiles = [];
  var revealPresetId = "";
  var DEFAULT_PRESET_ID = "baked_default";
  var sourcePresetId = "", sourceWasMapped = false;
  var routePending = false;
  var identity = { generation: 0, epoch: 0, job: null, phase: "", hero: "", candidate: "", samples: 0,
    root: null, hud: null, topBar: null, clock: null, card: null, label: null, discoverAt: 0 };
  // SHOW BOUNDS (v2 showBounds): session-only view state. It rides beside the settings in the
  // config message and is never saved, coded, preset or undone. Like v2's root attribute it is kept
  // on the top panel, so a reloaded menu keeps it until the game restarts.
  var BOUNDS_ATTR = "hpv3_show_bounds";
  var showBounds = false;
  // Own bottom-HUD health bar (v2 paintHudHealthWash, hp_colors_v2_menu.js 1968-2055).
  var HUD_TEXTURE = 'url("s2r://panorama/images/hud/healthbar/healthbar_fill_texture_png.vtex")';
  var HUD_WHITE = "#FFFFFF", HUD_TEAM = { team1: "#E7B659", team2: "#5B79E6" };
  var HUD_PROPS = ["backgroundImage", "backgroundColor", "washColor"];
  var hud = { root: null, chain: null, container: null, owner: null, stale: [], job: null };
  var publishedHudKey = "";

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
      preview("close");
      setSupporterStripOpen(false);
      stopUpdateCheck();
      endNewsFlash(); newsNav++;
      if (pending) $.CancelScheduled(pending);
      if (answerJob) $.CancelScheduled(answerJob);
      if (publishJob) $.CancelScheduled(publishJob);
      if (loadFallback) $.CancelScheduled(loadFallback);
      if (hud.job) $.CancelScheduled(hud.job);
      if (legacy.job) $.CancelScheduled(legacy.job);
      publishJob = null; loadFallback = null; hud.job = null; legacy.job = null;
      pending = null; answerJob = null;
      if (handlerId !== null) {
        try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", handlerId); } catch (error) { /* Context already gone. */ }
        handlerId = null;
      }
      return config ? { settings: clone(config.settings), rules: clone(config.rules), sourcePresetId: sourcePresetId, sourceWasMapped: sourceWasMapped,
        newsSession: Object.keys(newsSession) } : null;
    },
  };

  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function valuesFor(settings, row) { return row.side === "shared" ? settings.shared : settings.side[row.side]; }
  function panel(id) { var found = panels[id]; return valid(found) ? found : null; }
  function store() { var value = $.HPColorsV3Store; return value && typeof value === "object" ? value : null; }
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
  function preview(method, value) {
    var target = $.HPColorsV3Preview;
    if (!target || typeof target[method] !== "function") return false;
    try { return target[method](value, arguments[2]); } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] preview " + method + " failed: " + error);
      return false;
    }
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
    if (ready) preview("setSettings", effectiveSettings, { showBounds: showBounds });
    var shared = effectiveSettings.shared, hudKey = [shared.enabled, shared.hudHealthColorMode, shared.hudHealthColor, shared.hudShieldStyle].join(":");
    if (hudKey !== publishedHudKey) { publishedHudKey = hudKey; paintHud(); }
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
    var remaining = 50 - (Date.now() - lastPublishedAt);
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
      var remaining = 500 - (Date.now() - lastPublishedAt);
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
    next.shared.lowThreshold = Math.min(next.shared.lowThreshold, next.shared.highThreshold - 1);
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
    var required = [false, false, false, false];
    Object.keys(config.rules).forEach(function (cell) { required[config.rules[cell].slot - 1] = true; });
    required.forEach(function (needed, index) { if (!needed || !requiredSlots[index]) tiers[index] = -1; });
    requiredSlots = required;
    resolveEffective();
  }
  function clearTiers() {
    var changed = tiers.some(function (tier) { return tier !== -1; });
    tiers = [-1, -1, -1, -1];
    if (changed) {
      // HPV3_DEBUG $.Msg("[HPV3] tiers " + tiers.join(","));
    }
    signature = null; abilityOwner = null; abilityPanels = [null, null, null, null];
    if (config && resolveEffective()) publish();
    syncAbilitySlots();
  }
  function sampleTiers() {
    // While the condition dialog is open, every slot is read so the HUD-style outlines show live tiers.
    var wanted = conditionDraft ? [true, true, true, true] : requiredSlots;
    if (!wanted.some(Boolean)) return;
    var next = [-1, -1, -1, -1];
    if (identity.phase === "active" && !identityClasses()("spec_mode")) {
      if (!valid(signature)) {
        signature = (valid(identity.hud) ? identity.hud : identity.root).FindChildTraverse("hud_signature");
        abilityOwner = null; abilityPanels = [null, null, null, null];
      }
      if (!valid(abilityOwner) || !valid(signature) || abilityOwner.GetParent() !== signature) {
        abilityOwner = valid(signature) ? signature.FindChildTraverse("abilities") : null;
        abilityPanels = [null, null, null, null];
      }
      wanted.forEach(function (needed, index) {
        if (!needed) return;
        var slot = abilityPanels[index];
        if (!valid(slot) || slot.GetParent() !== abilityOwner) {
          slot = valid(abilityOwner) ? abilityOwner.FindChild("slot_signature_" + (index + 1)) : null;
          abilityPanels[index] = slot;
        }
        if (valid(slot)) for (var tier = 3; tier >= 0; tier--) if (slot.BHasClass("Tier" + tier)) { next[index] = tier; break; }
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

  // One local-player watcher publishes one resolved settings object; world bars never route.
  function stopIdentityWatch() {
    identity.generation++;
    if (identity.job) $.CancelScheduled(identity.job);
    identity.job = null;
  }
  function clearIdentityRefs() {
    identity.hud = null; identity.topBar = null; identity.clock = null; identity.card = null; identity.label = null;
    identity.discoverAt = 0;
    signature = null; abilityOwner = null; abilityPanels = [null, null, null, null];
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
    var hud = identity.hud !== root && valid(identity.hud) ? identity.hud : null;
    return function (name) { return !!(root && root.BHasClass(name) || hud && hud.BHasClass(name)); };
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
      contractRef.heroes.forEach(function (hero) { if (hero.key === identity.hero) text = hero.name.toUpperCase(); });
    }
    var label = panel("HPColorsHeroIdentityLabel");
    if (label && label.text !== text) label.text = text;
    syncAbilitySlots();
  }
  function applyHeroRoute(watch, epoch) {
    if (retired || watch !== identity.generation || epoch !== identity.epoch || !publicationResolved) return;
    if (gesture || picker || conditionDraft) { routePending = true; return; }
    routePending = false;
    if (identity.phase !== "hideout" && (identity.phase !== "active" || !identity.hero)) return;
    var target = store();
    if (!target || !target.isHydrated || !target.isHydrated()) return;
    var bundle = presetBundle(), map = bundle.heroPresets || {};
    var mapped = identity.phase === "active" && Object.prototype.hasOwnProperty.call(map, identity.hero);
    var id = mapped ? map[identity.hero] : bundle.heroDefault || null;
    if (id === null && sourceWasMapped) id = DEFAULT_PRESET_ID;
    if (id === null || id === sourcePresetId) {
      // HPV3_DEBUG if (applyHeroRoute.skipped !== (id || "none")) $.Msg("[HPV3] route skipped " + (applyHeroRoute.skipped = id || "none"));
      return;
    }
    var preset = id === DEFAULT_PRESET_ID ? { id: id, settings: contractRef.defaults } :
      bundle.presets.filter(function (item) { return item.id === id; })[0];
    if (!preset) return;
    try {
      target.applyPreset(preset, true, mapped);
      sourceWasMapped = mapped;
      // HPV3_DEBUG applyHeroRoute.skipped = null; $.Msg("[HPV3] route applied " + id);
    } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] route refused: " + error);
    }
  }
  function resumeHeroRoute() {
    if (!routePending || gesture || picker || conditionDraft) return;
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
      var phase = identityPhase(), heroChanged = false;
      if (phase !== identity.phase) {
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
  function hudRoot() {
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
    var pending = hud.stale.length > 0 || (!color && releasePending(hud.owner));
    if (!live && !pending) return;
    var token = generation;
    hud.job = $.Schedule(live && !found ? 5 : 1, function hudWatch() {
      hud.job = null;
      if (!retired && token === generation && valid(activeRoot)) paintHud();
    });
  }

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
  // 250px width; in the old 115px box they start past its right edge, so they get 6710's too (ticket 41).
  // Heal keeps that spot with a shield up too (user 2026-10-25): moved beside the damage it was cut at the
  // health area's edge live on 6819, also with overflow noclip on its container.
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
  var LEGACY_SCALED = ["health", "damage", "heal"]; // bars drawn on the D scale whose max is corrected
  var legacy = { job: null, container: null, p: null, styles: {}, scale: 1, scaled: {}, read: null, fullAt: NaN, qolFor: null, qol: false, themed: false,
    label: null, zero: null, lines: null, linesMax: NaN, text: "", colorKey: "", colorTicks: 0,
    barrierBar: null, barrierParts: false, barrierNumber: null, barrierPeak: 0, barrierFill: NaN, barrierText: "", revalidate: false };
  function legacyWanted() {
    var shared = effectiveSettings && effectiveSettings.shared;
    return !!shared && shared.enabled === true && publicationResolved && shared.hudShieldStyle === "separate";
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
  function legacyOwnLabel(parent, id, className, over, text) {
    var label = passive("Label", parent, id, className, text); label.style.visibility = "collapse";
    try { label.style.ignoreParentFlow = "true"; } catch (error) { /* Below it instead. */ }
    parent.MoveChildAfter(label, over);
    delete legacy.styles[id + ".visibility"]; delete legacy.styles[id + ".color"];
    return label;
  }
  // Ticks at max HP, rebuilt only when max HP changes.
  function legacyLines(max) {
    var game = legacy.p.lines;
    if (!legacy.lines) {
      legacy.lines = passive("Panel", game.GetParent(), "healthLines", LEGACY_OWN.lines);
      game.GetParent().MoveChildAfter(legacy.lines, game);
      legacy.linesMax = NaN; delete legacy.styles["ownLines.visibility"];
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
    var full = !r || !(now - legacy.fullAt < (r.capacity || r.barrier || legacy.scale !== 1 ? 50 : 100));
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
      delete legacy.styles["ownBarrier.visibility"]; delete legacy.styles["ownBarrier.marginRight"];
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
    legacy.job = $.Schedule(watch ? LEGACY_FRAME : 0.1, function legacyShieldTick() {
      if (token === generation) legacyTick(); else legacy.job = null;
    });
  }

  // ---- Value normalisation (schema bounds/step; thresholds keep low < high) ----
  function decimals(step) { var text = String(step); return text.indexOf(".") < 0 ? 0 : text.length - text.indexOf(".") - 1; }
  function normalizeNumber(row, raw, settings) {
    if (raw === null || raw === undefined || !String(raw).trim()) return null;
    var value = Number(raw);
    if (!Number.isFinite(value)) return null;
    var min = row.bounds[0], max = row.bounds[1];
    value = min + Math.round((Math.max(min, Math.min(max, value)) - min) / row.step) * row.step;
    value = Number(Math.min(max, value).toFixed(decimals(row.step)));
    if (row.key === "lowThreshold" && settings.shared.highThreshold !== undefined) value = Math.min(value, settings.shared.highThreshold - 1);
    if (row.key === "highThreshold" && settings.shared.lowThreshold !== undefined) value = Math.max(value, settings.shared.lowThreshold + 1);
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
    var hero = contractRef.heroes.filter(function (entry) { return entry.key === identity.hero; })[0];
    for (var slot = 1; slot <= 4; slot++) {
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
        for (var tier = 1; tier <= 3; tier++) {
          panel(prefix).SetHasClass("LiveTier" + tier, tiers[slot - 1] === tier);
          panel(prefix).SetHasClass("ShowTier" + tier, shown === tier);
        }
      }
    }
  }
  function syncCondition() {
    if (!conditionDraft) return;
    var draft = conditionDraft, row = draft.row, rule = draft.rule;
    syncAbilitySlots();
    for (var slot = 1; slot <= 4; slot++) {
      panel("HPColorsConditionSlot" + slot).SetHasClass("Checked", slot === rule.slot);
      setLabel("HPColorsConditionSlot" + slot + "Label", slot === rule.slot ? "TIER " + rule.minTier + "+" : "");
    }
    var ordinary = valuesFor(config.settings, row)[row.key];
    var equal = row.type === "color" ? normalizeColor(rule.value) === normalizeColor(ordinary) : rule.value === ordinary;
    panel("HPColorsConditionApplyButton").enabled = draft.valid && !equal;
    panel("HPColorsConditionRemoveButton").enabled = !!config.rules[draft.cell];
    panel("HPColorsConditionBooleanToggle").SetHasClass("Checked", rule.value === true);
    if (row.type === "enum") panel("HPColorsConditionOptions").Children().forEach(function (button, index) {
      button.SetHasClass("Checked", row.options[index].value === rule.value);
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
    if (row.type === "color") changeCondition(normalizeColor(panel("HPColorsConditionHex").text));
    if (row.type === "number") changeCondition(normalizeNumber(row, panel("HPColorsConditionNumberEntry").text, { shared: {} }));
    if (rejectedCommit === true && !conditionDraft.valid) trigger(panel(row.type === "color" ? "HPColorsConditionHex" : "HPColorsConditionNumberEntry"), "HPC3NegativeShake");
  }
  function closeCondition() {
    if (!conditionDraft) return;
    if (picker && picker.condition) closePicker(true);
    var row = conditionDraft.row;
    conditionDraft = null;
    if (panel("HPColorsConditionDialog")) panel("HPColorsConditionDialog").RemoveClass("Open");
    if (panel(row.conditionId)) panel(row.conditionId).SetFocus();
    resumeHeroRoute();
  }
  function openCondition(row) {
    closeCredits();
    closeCondition(); closePicker(false); endGesture(false);
    var cell = cellFor(row), rule = config.rules[cell];
    conditionDraft = { row: row, cell: cell, valid: true, rule: rule ? clone(rule) :
      { slot: 1, minTier: 1, value: valuesFor(config.settings, row)[row.key] } };
    setLabel("HPColorsConditionTitle", "CONDITION");
    setLabel("HPColorsConditionSubtitle", ((row.name || row.key) + " · " + row.side).toUpperCase());
    ["BooleanToggle", "Options", "Number", "Color"].forEach(function (kind, index) {
      panel("HPColorsCondition" + kind).SetHasClass("HPC3Hidden", row.type !== ["boolean", "enum", "number", "color"][index]);
    });
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
      if (row.type === "number") {
        var slider = panel("HPColorsConditionNumberSlider");
        slider.min = row.bounds[0]; slider.max = row.bounds[1]; slider.increment = row.step; slider.value = value;
        panel("HPColorsConditionNumberEntry").text = String(value);
        setLabel("HPColorsConditionNumberUnit", row.unit.toUpperCase());
      }
      if (row.type === "color") panel("HPColorsConditionHex").text = value;
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
    for (var slot = 1; slot <= 4; slot++) (function (number) {
      on("HPColorsConditionSlot" + number, "onactivate", function () {
        if (!conditionDraft) return;
        if (conditionDraft.rule.slot === number) conditionDraft.rule.minTier = conditionDraft.rule.minTier % 3 + 1;
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
      changeCondition(normalizeNumber(conditionDraft.row, panel("HPColorsConditionNumberSlider").value, { shared: {} }));
      panel("HPColorsConditionNumberEntry").text = String(conditionDraft.rule.value);
    });
    on("HPColorsConditionSwatch", "onactivate", function () {
      readConditionEditor();
      if (conditionDraft && conditionDraft.valid) openPicker(conditionDraft.row, true);
    });
    on("HPColorsConditionApplyButton", "onactivate", function () { applyCondition(false); });
    on("HPColorsConditionRemoveButton", "onactivate", function () { applyCondition(true); });
    on("HPColorsConditionCancelButton", "onactivate", closeCondition);
  }

  // ---- Model -> controls ----
  function sync(row, hueEdit) {
    if (!config) return;
    var value = valuesFor(config.settings, row)[row.key], target;
    syncing = true;
    try {
      if (row.type === "boolean") {
        target = panel(row.toggleId); if (target) target.SetHasClass("Checked", value === true);
      } else if (row.type === "enum") {
        if (row.kind === "segment") {
          for (var i = 0; i < row.options.length; i++) {
            target = panel(row.options[i].id); if (target) target.SetHasClass("Selected", row.options[i].value === value);
          }
        } else {
          target = panel(row.id);
          for (var j = 0; target && j < row.options.length; j++) {
            if (row.options[j].value !== value) continue;
            var option = target.FindDropDownMenuChild(row.options[j].id);
            // DropDown.SetSelected takes the option id string (stock/v2 usage).
            if (valid(option)) target.SetSelected(row.options[j].id);
          }
        }
      } else if (row.type === "color") {
        target = panel(row.hexId); if (target) target.text = value;
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
      } else {
        target = panel(row.entryId); if (target) target.text = String(value);
        target = panel(row.sliderId); if (target) target.value = value;
      }
      target = panel(row.rowId); if (target) target.SetHasClass("Changed", value !== row.default);
      target = panel(row.conditionId); if (target) target.SetHasClass("Marked", !!config.rules[cellFor(row)]);
    } finally { syncing = false; }
  }
  function syncAll() {
    for (var i = 0; i < contractRef.controls.length; i++) sync(contractRef.controls[i]);
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
  function historySnapshot() {
    var bundle = presetBundle(), metadata = {};
    ["heroPresets", "heroDefault"].forEach(function (key) {
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
    ["heroPresets", "heroDefault"].forEach(function (key) {
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
    if (history.length > 40) history.shift();
    syncUndo();
  }
  function beginGesture(key) {
    endGesture(false);
    gesture = { key: key, before: historySnapshot() };
  }
  function endGesture(cancel) {
    if (!gesture) return;
    var before = gesture.before;
    gesture = null;
    cancelGesturePublish();
    if (cancel) {
      if (before !== historySnapshot()) { restoreHistory(before); notifyStore(); }
    } else {
      publish(); // Final value also wins when the drag returned to its opening value.
      if (before !== historySnapshot()) {
        record(before);
        notifyStore();
      }
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
    gesture = null;
    cancelGesturePublish();
    var row = picker && picker.row;
    picker = null; // Do not commit a draft or restore its pre-load opening value.
    if (panel("HPColorsPickerDialog")) panel("HPColorsPickerDialog").RemoveClass("Open");
    closeCondition();
    clearHistory();
    if (row && panel(row.swatchId)) panel(row.swatchId).SetFocus();
    replace(clone(settings), bundle.rules || {});
    syncAll();
    resolvePublication();
    return true;
  }
  // Only explicit menu edits request a sample; hydration, routing and Undo use applySettings directly.
  function previewShakeEdit(previous) {
    var before = previous.shared, after = effectiveSettings.shared;
    if (before.damageShakeEnabled === after.damageShakeEnabled && before.damageShakeStrength === after.damageShakeStrength) return;
    preview("setSettings", effectiveSettings, { showBounds: showBounds });
    preview("shakeOnEdit");
  }
  function editSettings(settings, rules) {
    if (!contractRef.validate(settings) || JSON.stringify(settings) === JSON.stringify(config.settings) &&
        (rules === undefined || JSON.stringify(rules) === JSON.stringify(config.rules))) return false;
    closePicker(false);
    endGesture(false);
    var before = historySnapshot();
    var previousEffective = effectiveSettings;
    if (!applySettings(settings, rules)) return false;
    previewShakeEdit(previousEffective);
    record(before);
    notifyStore();
    return true;
  }
  function undo() {
    closePicker(false);
    closeCondition();
    endGesture(false);
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
    var next = clone(config.settings);
    var values = valuesFor(next, row);
    if (values[row.key] === value) { sync(row, hueEdit); return false; }
    values[row.key] = value;
    if (!contractRef.validate(next)) { sync(row); return false; }
    var before = historySnapshot();
    var previousEffective = effectiveSettings;
    if (gesture && gesture.key !== row.side + ":" + row.key) endGesture(false);
    replace(next);
    if (!gesture) record(before);
    sync(row, hueEdit);
    // The preview follows the column being edited.
    if (row.side === "enemy" || row.side === "ally") preview("setSide", row.side);
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
      closePicker(false); endGesture(false);
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
    var rowKey = row.side + ":" + row.key;
    on(id, "onvaluechanged", function () {
      if (syncing || !panel(id)) return;
      closePicker(false);
      if (!gesture || gesture.key !== rowKey) beginGesture(rowKey);
      change();
    });
    var target = panel(id), key = id + "\nSliderReleased";
    if (target && bound[key] !== target) {
      bound[key] = target;
      $.RegisterEventHandler("SliderReleased", target, function () {
        if (!retired && panel(id) === target && gesture && gesture.key === rowKey) endGesture(false);
      });
    }
    // Keyboard steps may have no release event; focus loss still completes their edit.
    on(id, "onblur", function () { if (gesture && gesture.key === rowKey) endGesture(false); });
  }
  function bindControl(row) {
    on(row.rowId, "onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", panel(row.rowId), row.help); });
    on(row.rowId, "onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", panel(row.rowId)); });
    on(row.resetId, "onactivate", function () {
      closePicker(false); closeCondition(); endGesture(false);
      commit(row, row.type === "number" ? normalizeNumber(row, row.default, config.settings) : row.default);
    });
    on(row.resetId, "onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", panel(row.resetId), "Reset " + row.name + " to default"); });
    on(row.resetId, "onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", panel(row.resetId)); });
    on(row.conditionId, "onactivate", function () { if (!retired) openCondition(row); });
    on(row.conditionId, "onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", panel(row.conditionId), "Ability condition · " + row.name); });
    on(row.conditionId, "onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", panel(row.conditionId)); });
    if (row.type === "boolean") {
      on(row.toggleId, "onactivate", function () { commit(row, valuesFor(config.settings, row)[row.key] !== true); });
    } else if (row.type === "enum" && row.kind === "segment") {
      row.options.forEach(function (option) {
        on(option.id, "onactivate", function () { commit(row, option.value); });
      });
    } else if (row.type === "enum") {
      on(row.id, "oninputsubmit", function () {
        var selected = panel(row.id) && panel(row.id).GetSelected();
        for (var i = 0; i < row.options.length; i++) if (valid(selected) && selected.id === row.options[i].id) return commit(row, row.options[i].value);
        sync(row);
      });
    } else if (row.type === "color") {
      var hex = function () {
        if (!panel(row.hexId)) return;
        var value = normalizeColor(panel(row.hexId).text);
        if (value === null) trigger(panel(row.hexId), "HPC3NegativeShake");
        commit(row, value);
      };
      on(row.hexId, "ontextentrysubmit", hex);
      on(row.hexId, "onblur", hex);
      on(row.swatchId, "onactivate", function () { openPicker(row); });
      var hue = panel(row.hueId);
      if (hue && bound[row.hueId + "\nrange"] !== hue) {
        bound[row.hueId + "\nrange"] = hue;
        syncing = true;
        try { hue.min = 0; hue.max = 1000; hue.increment = 1; } finally { syncing = false; }
      }
      bindSliderGesture(row, row.hueId, function () {
        commit(row, hueToHex(Number(panel(row.hueId).value) / 1000), true);
      });
    } else {
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
  }

  // ---- Pages, folds and search (menu-local: never touch config or the store) ----
  function host() { return panel(contractRef.menu.rootId); }
  function syncFoldCounts() {
    var root = host(), searching = root.BHasClass("Searching"), side = root.BHasClass("HPC3SideAlly") ? "ally" : "enemy";
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
    closePicker(false); closeCondition(); endGesture(false);
    root.SetHasClass("HPC3SideAlly", side === "ally");
    contractRef.menu.groups.forEach(function (group) {
      (group.sides || []).forEach(function (tab) {
        var target = panel(tab.id);
        if (target) { target.SetHasClass("Selected", tab.side === side); target.SetHasClass("fill", tab.side === side); }
      });
    });
    preview("setSide", side);
    syncFoldCounts();
  }
  function showPage(index) {
    var pages = contractRef.menu.pages;
    pageIndex = index;
    closePicker(false);
    closeCondition();
    endGesture(false);
    cancelReset();
    cancelDelete();
    cancelBundleReplacement();
    closeHeroPicker();
    closeCredits();
    for (var i = 0; i < pages.length; i++) {
      if (panel(pages[i].id)) panel(pages[i].id).SetHasClass("Active", i === index);
      if (panel(pages[i].navId)) panel(pages[i].navId).SetHasClass("Selected", i === index);
      if (panel(pages[i].subNavId)) panel(pages[i].subNavId).SetHasClass("Selected", i === index);
    }
    if (panel("HPColorsPageTitle")) panel("HPColorsPageTitle").text = pages[index].title;
    if (panel("HPColorsPageDescription")) panel("HPColorsPageDescription").text = pages[index].description;
    if (panel("HPColorsResetPageButton")) panel("HPColorsResetPageButton").enabled = contractRef.controls.some(function (row) { return row.page === pages[index].name; });
    if (pages[index].name === "Presets") refreshPresets();
    if (ready) preview("setPage", pages[index].name);
  }
  function selectGroup(group) {
    contractRef.menu.groups.forEach(function (entry) {
      if (panel(entry.id)) panel(entry.id).SetHasClass("Active", entry === group);
      if (panel(entry.subNavId)) panel(entry.subNavId).SetHasClass("Selected", entry === group);
    });
  }
  function activateGroup(group) {
    clearSearch();
    showPage(contractRef.menu.pages.map(function (page) { return page.name; }).indexOf(group.page));
    selectGroup(group);
    var card = panel(group.id);
    scrollTo(card);
    var title = card && card.FindChildrenWithClassTraverse("HPC3CardTitle")[0];
    trigger(title, "HPC3SearchLanding");
  }
  function resetGroup(group) {
    closePicker(false); closeCondition(); endGesture(false);
    var next = clone(config.settings), rules = clone(config.rules);
    contractRef.controls.forEach(function (row) {
      if (row.page === group.page && row.group === group.name) {
        valuesFor(next, row)[row.key] = row.default;
        delete rules[cellFor(row)];
      }
    });
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
      if (retired || !host() || !host().BHasClass("HPC3Open")) return;
      try { if (typeof strip.SetIgnoreCursor === "function") strip.SetIgnoreCursor(true); } catch (error) {}
    }
    try {
      if (typeof strip.SetURL !== "function") return;
      var url = open ? "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip-v3/?v=" +
        encodeURIComponent(publisherEpoch + ":" + ++supporterOpenCount) : "about:blank";
      if (strip.SetURL(url) !== false && open) strip.AddClass("Open");
    } catch (error) { /* Optional hosted strip: the editor works without it. */ }
  }
  function setMenuOpen(open) {
    var root = host();
    if (!root) return;
    if (!open) {
      closePicker(false); endGesture(false); cancelReset(); cancelDelete();
      closeCondition();
      cancelBundleReplacement();
      closeHeroPicker();
      closeCredits();
      clearHistory();
      clearSearch(); root.RemoveClass("SaveResetConfirming");
    }
    root.SetHasClass("HPC3Open", open);
    setSupporterStripOpen(open);
    if (open) startUpdateCheck(); else stopUpdateCheck();
    if (open) syncNews(); else { newsNav++; endNewsFlash(); }
    preview(open ? "open" : "close");
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
    newsSavedIds = !Array.isArray(saved) || saved.length > 64 || saved.some(function (id) { return typeof id !== "string" || id.length > 48; }) ? [] : saved;
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
      mark(page.navId, "HasNew", page.name === "New" ? showing.length > 0 : pages[page.name] === true);
      if (page.name === "New") mark(page.id, "NoNews", !showing.length);
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
    var target = store();
    if (!retired && target && typeof target.replaceBundle === "function" && typeof target.isHydrated === "function" && target.isHydrated()) {
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
    if (newsFlashJob) { try { $.CancelScheduled(newsFlashJob); } catch (error) { /* Already ran. */ } }
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
      if (retired || token !== generation || nav !== newsNav || page !== pageIndex || !valid(target) || !host() || !host().BHasClass("HPC3Open")) return;
      if (target.actuallayoutheight > 0) scrollTo(target);
      if (--left > 0) $.Schedule(0, newsScroll);
      else scrollTo(target);
    });
  }
  function openNews(item) {
    var pages = contractRef.menu.pages.map(function (page) { return page.name; });
    newsNav++;
    clearSearch(); endNewsFlash();
    showPage(pages.indexOf(item.page));
    if (!item.rowIds.length) { selectGroup(null); return; }
    var targets = contractRef.controls.filter(function (row) { return item.rowIds.indexOf(row.rowId) >= 0; });
    var sides = targets.map(function (row) { return row.side; });
    if (sides.length && sides.every(function (side) { return side === "ally"; })) selectSide("ally");
    else if (sides.length && sides.every(function (side) { return side === "enemy"; })) selectSide("enemy");
    // The other side's column is collapsed, so group and scroll follow a shared or current-side target.
    var side = host() && host().BHasClass("HPC3SideAlly") ? "ally" : "enemy";
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

  // Informational only: no setting, record, store commit or Undo entry.
  function closeCredits() {
    var dialog = panel("HPColorsCreditsDialog");
    if (!dialog || !dialog.BHasClass("Open")) return;
    dialog.RemoveClass("Open");
    if (panel("HPColorsPreviewCreditsButton")) panel("HPColorsPreviewCreditsButton").SetFocus();
  }

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
  function stopUpdateCheck() {
    updateOpen++;
    if (updateJob) { $.CancelScheduled(updateJob); updateJob = null; }
    closeUpdate();
  }
  function startUpdateCheck() {
    var open = ++updateOpen, store = $.HPColorsV3Store;
    if (!store || typeof store.latestRelease !== "function") return;
    updateLater(UPDATE_DELAY_SEC, function () { askLatest(open, 0); });
  }
  function updateCurrent(open) { return !retired && open === updateOpen && !!host() && host().BHasClass("HPC3Open"); }
  function askLatest(open, tries) {
    var store = $.HPColorsV3Store;
    if (!updateCurrent(open) || !store || typeof store.latestRelease !== "function") return;
    try {
      store.latestRelease(function (result) {
        if (!updateCurrent(open) || !result || result.ok !== true) return;
        if (!result.version) {
          if (result.pending && tries < UPDATE_PENDING_RETRIES) updateLater(UPDATE_PENDING_RETRY_SEC, function () { askLatest(open, tries + 1); });
          return;
        }
        var notified = $.HPColorsV3UpdateNotified || ($.HPColorsV3UpdateNotified = {});
        if (notified[result.version] || !isNewerRelease(result.version, contractRef.release)) return;
        showUpdateWhenIdle(open, result.version, result.downloads);
      });
    } catch (error) { /* Advisory: the editor works without it. */ }
  }
  function dialogBusy() {
    if (gesture || picker || conditionDraft || heroPicker || resetPage !== null || deletePreset || bundleReplacement) return true;
    var credits = panel("HPColorsCreditsDialog");
    return !!credits && credits.BHasClass("Open");
  }
  // Each build opens its own file: the composed QOLLOCK menu keeps QOLLOCK's pinned storage bridge
  // panel and the composed ShowRank menu ShowRank's party bridge. No link for this build: no DOWNLOAD.
  var UPDATE_DOWNLOAD_URL = /^https:\/\/gamebanana\.com\/[A-Za-z0-9\/_#.?=&%-]{1,200}$/;
  function updateDownload(downloads) {
    var build = panel("QOLStorageBridge") ? "qollock" : panel("ShowRankBarebonesPartyBridge") ? "showrank" : "normal";
    var url = downloads && Object.prototype.hasOwnProperty.call(downloads, build) ? downloads[build] : null;
    return typeof url === "string" && UPDATE_DOWNLOAD_URL.test(url) ? url : null;
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
    if (dialog && dialog.BHasClass("Open")) dialog.RemoveClass("Open");
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
    closePicker(false); closeCondition(); endGesture(false);
    cancelReset(); cancelDelete(); cancelBundleReplacement(); closeHeroPicker();
    [["Yesdaddy", "hero_chessmaster"], ["Razorrzr", "hero_lash"]].forEach(function (entry) {
      var hero = contractRef.heroes.filter(function (hero) { return hero.key === entry[1]; })[0];
      panel("HPColorsCredits" + entry[0] + "Portrait").SetImage(hero && hero.portrait || "s2r://panorama/images/control_icons/no_hero_png.vtex");
    });
    panel("HPColorsCreditsDialog").AddClass("Open");
    panel("HPColorsCreditsCloseButton").SetFocus();
  }

  // ---- Schema-owned page reset: includes folded rows and both sides ----
  function cancelReset() {
    var wasOpen = resetPage !== null;
    resetPage = null;
    if (panel("HPColorsResetPageDialog")) panel("HPColorsResetPageDialog").RemoveClass("Open");
    if (wasOpen && panel("HPColorsResetPageButton")) panel("HPColorsResetPageButton").SetFocus();
  }
  function requestReset() {
    closeCredits();
    closePicker(false); endGesture(false);
    closeCondition();
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
    contractRef.controls.forEach(function (row) { if (row.page === page) { valuesFor(next, row)[row.key] = row.default; delete rules[cellFor(row)]; } });
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
    if (picker.condition) {
      changeCondition(color);
      panel("HPColorsConditionHex").text = color;
    } else commit(picker.row, color);
    if (panel("HPColorsPickerHex")) panel("HPColorsPickerHex").text = color;
  }
  function closePicker(cancel) {
    if (!picker) return;
    if (cancel !== true && panel("HPColorsPickerHex")) changePicker(normalizeColor(panel("HPColorsPickerHex").text));
    var row = picker.row, openingColor = picker.openingColor, isCondition = picker.condition;
    picker = null;
    if (isCondition) {
      if (cancel === true) { changeCondition(openingColor); panel("HPColorsConditionHex").text = openingColor; }
    } else if (cancel === true) {
      gesture = null;
      cancelGesturePublish();
      var next = clone(config.settings);
      if (valuesFor(next, row)[row.key] !== openingColor) {
        valuesFor(next, row)[row.key] = openingColor;
        applySettings(next); notifyStore();
      }
    } else endGesture(false);
    if (panel("HPColorsPickerDialog")) panel("HPColorsPickerDialog").RemoveClass("Open");
    var opener = panel(isCondition ? "HPColorsConditionSwatch" : row.swatchId);
    if (opener) opener.SetFocus();
    resumeHeroRoute();
  }
  function openPicker(row, isCondition) {
    closeCredits();
    closePicker(false);
    if (!isCondition) { closeCondition(); beginGesture(row.side + ":" + row.key); }
    var color = isCondition ? conditionDraft.rule.value : valuesFor(config.settings, row)[row.key];
    picker = { row: row, condition: isCondition === true, color: color, openingColor: color };
    setLabel("HPColorsPickerTitle", (row.name || row.key) + " · " + row.side);
    setLabel("HPColorsPickerStatus", valid(nativeHex) ? "Escape restores the opening color." : "Native picker unavailable; use hex entry. Escape restores the opening color.");
    panel("HPColorsPickerHex").text = picker.color;
    panel("HPColorsPickerDialog").AddClass("Open");
    seedPicker();
    (valid(nativeHex) ? nativeHex : panel("HPColorsPickerHex")).SetFocus();
  }
  function bindPicker() {
    on("HPColorsPickerDoneButton", "onactivate", function () {
      var entry = panel("HPColorsPickerHex");
      if (picker && entry && normalizeColor(entry.text) === null) {
        trigger(entry, "HPC3NegativeShake"); setLabel("HPColorsPickerStatus", "Enter a valid hex color.", "error"); return;
      }
      closePicker(false);
    });
    on("HPColorsPickerCancelButton", "onactivate", function () { closePicker(true); });
    var hex = function () {
      if (!picker || !panel("HPColorsPickerHex")) return;
      var color = normalizeColor(panel("HPColorsPickerHex").text);
      if (color !== null) { changePicker(color); seedPicker(); }
      else { trigger(panel("HPColorsPickerHex"), "HPC3NegativeShake"); setLabel("HPColorsPickerStatus", "Enter a valid hex color.", "error"); }
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
    var target = store();
    if (retired || !target || typeof target.replaceBundle !== "function" || typeof target.isHydrated !== "function" || !target.isHydrated()) {
      presetStatus("Wait for the preset library to load; saving may be unavailable.", true); return false;
    }
    try {
      var before = withHistory ? historySnapshot() : null;
      var bundle = presetBundle();
      if (change(bundle) === false) return false;
      if (bundle.presets.length > 128) throw new Error("At most 128 presets can be saved.");
      if (target.replaceBundle(bundle) !== true) throw new Error("Preset save refused; nothing changed.");
      if (withHistory) record(before);
      presetStatus("Preset library updated.", false);
      return true;
    } catch (error) { presetStatus(String(error.message || error), true); return false; }
  }

  function closeHeroPicker() {
    var wasOpen = !!heroPicker;
    heroPicker = "";
    if (panel("HPColorsHeroDialog")) panel("HPColorsHeroDialog").RemoveClass("Open");
    if (wasOpen && panel("HPColorsPresetSelectedHeroesButton")) panel("HPColorsPresetSelectedHeroesButton").SetFocus();
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
    closeCredits();
    closePicker(false); endGesture(false);
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
  function defaultName(bundle) {
    var name = bundle.bakedPresetNameOverrides && bundle.bakedPresetNameOverrides[DEFAULT_PRESET_ID];
    return typeof name === "string" && name.trim() && name.trim().length <= 48 ? name.trim() : "Rewrite Default";
  }
  function presetName(raw) {
    var name = String(raw || "").trim();
    if (!name || name.length > 48) throw new Error("Preset names must contain 1–48 characters.");
    return name;
  }
  function createPreset(bundle, settings, name) {
    if (bundle.presets.length >= 128) throw new Error("At most 128 presets can be saved.");
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
      if ($.DispatchEvent("CopyStringToClipboard", result.code) === false) throw new Error("Preset code could not be copied.");
      presetStatus("Preset code copied.", false);
    } catch (error) { presetStatus(String(error.message || error), true); }
  }
  function libraryAction(id, action, value) {
    if (action === "apply" || action === "copy") {
      var source = presetBundle().presets.filter(function (preset) { return preset.id === id; })[0];
      if (action === "copy") { if (source) copyPreset(source); return; }
      if (source && contractRef.validate(source.settings)) {
        var target = store();
        try {
          if (target && typeof target.applyPreset === "function") target.applyPreset(source);
          else editSettings(source.settings);
        } catch (error) { presetStatus(String(error.message || error), true); }
      }
      return;
    }
    mutatePresets(function (bundle) {
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
    });
  }
  function cancelDelete() {
    var wasOpen = !!deletePreset;
    deletePreset = "";
    if (panel("HPColorsPresetDeleteDialog")) panel("HPColorsPresetDeleteDialog").RemoveClass("Open");
    if (wasOpen && panel("HPColorsPresetSelectedDeleteButton")) panel("HPColorsPresetSelectedDeleteButton").SetFocus();
  }
  function requestDelete(preset) {
    closeCredits();
    deletePreset = preset.id;
    setLabel("HPColorsPresetDeleteMessage", 'Delete "' + preset.name + '"? This removes the saved preset, not the settings on screen.');
    panel("HPColorsPresetDeleteDialog").AddClass("Open");
    panel("HPColorsPresetDeleteCancelButton").SetFocus();
  }
  function cancelBundleReplacement() {
    var wasOpen = !!bundleReplacement;
    bundleReplacement = null;
    if (panel("HPColorsBundleReplaceDialog")) panel("HPColorsBundleReplaceDialog").RemoveClass("Open");
    if (wasOpen && panel("HPColorsBundleReplaceButton")) panel("HPColorsBundleReplaceButton").SetFocus();
  }
  function requestBundleReplacement() {
    closeCredits();
    cancelBundleReplacement();
    var target = store(), entry = panel("HPColorsBundleCodeEntry");
    if (!target || typeof target.decodeBundleCode !== "function" || !entry) { setCodeStatus("Bundle replacement is unavailable.", "error"); return; }
    try {
      var text = String(entry.text || "").trim();
      if (!text) throw new Error("Paste a bundle code first.");
      var found = decodeCode(target, "Bundle", text);
      if (found.kind !== "Bundle") throw new Error("This is a settings code. Press IMPORT to apply it; REPLACE ALL needs a bundle code.");
      var next = found.decoded;
      if (!next || !contractRef.validate(next.settings)) throw new Error("That code holds settings this version cannot use.");
      closePicker(false); endGesture(false);
      bundleReplacement = clone(next);
      setLabel("HPColorsBundleReplaceMessage", "Restore this bundle's active settings and metadata? This overwrites ALL " + presetBundle().presets.length + " saved presets, including any that another window added, with this bundle's " + next.presets.length + " presets. This cannot be undone for the library.");
      panel("HPColorsBundleReplaceDialog").AddClass("Open");
      panel("HPColorsBundleReplaceCancelButton").SetFocus();
    } catch (error) { trigger(entry, "HPC3NegativeShake"); setCodeStatus(String(error.message || error), "error"); }
  }
  function confirmBundleReplacement() {
    if (!bundleReplacement) return;
    var next = bundleReplacement, before = historySnapshot(), target = store(), local = presetBundle().newsDismissed;
    cancelBundleReplacement();
    // NEW-tab dismissals are personal: a replaced bundle keeps this player's list.
    if (local !== undefined) next.newsDismissed = local; else delete next.newsDismissed;
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
    setLabel("HPColorsPresetLibraryHeading", "LIBRARY · " + rows.length + "/128");
    panel("HPColorsPresetRestoreButton").enabled = hidden;
    if (!selectedPreset(bundle) || selectedPresetId === DEFAULT_PRESET_ID && hidden) selectedPresetId = rows.length ? rows[0].id : hidden ? "" : DEFAULT_PRESET_ID;
    var signature = JSON.stringify(rows.map(function (item) { return [item.id, item.name]; }));
    var changed = signature !== librarySignature;
    if (changed) {
      librarySignature = signature;
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
        if (!Array.isArray(next.hiddenBakedPresetIds)) next.hiddenBakedPresetIds = [];
        if (next.hiddenBakedPresetIds.indexOf(DEFAULT_PRESET_ID) < 0) next.hiddenBakedPresetIds.push(DEFAULT_PRESET_ID);
      });
      return;
    }
    if (!baked) { libraryAction(preset.id, action === "up" || action === "down" ? "move" : action, action === "up" ? -1 : action === "down" ? 1 : entry.text); return; }
    if (action === "copy") { copyPreset(null); return; }
    if (action === "rename") {
      mutatePresets(function (next) {
        var name = presetName(entry.text);
        if (!next.bakedPresetNameOverrides || typeof next.bakedPresetNameOverrides !== "object" || Array.isArray(next.bakedPresetNameOverrides)) next.bakedPresetNameOverrides = {};
        if (name === "Rewrite Default") delete next.bakedPresetNameOverrides[DEFAULT_PRESET_ID];
        else next.bakedPresetNameOverrides[DEFAULT_PRESET_ID] = name;
      });
    } else if (action === "apply") {
      var target = store();
      try {
        if (target && typeof target.applyPreset === "function") target.applyPreset({ id: DEFAULT_PRESET_ID, settings: contractRef.defaults });
        else editSettings(contractRef.defaults);
      } catch (error) { presetStatus(String(error.message || error), true); }
    }
  }
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
        if (!Array.isArray(bundle.hiddenBakedPresetIds)) bundle.hiddenBakedPresetIds = [];
        if (bundle.hiddenBakedPresetIds.indexOf(DEFAULT_PRESET_ID) < 0) bundle.hiddenBakedPresetIds.push(DEFAULT_PRESET_ID);
      })) {
        panel("HPColorsPresetNameEntry").text = "";
        selectPreset(addedId);
        var added = presetTiles.filter(function (item) { return item.id === addedId; })[0];
        if (added) scrollTo(added.tile);
      }
    });
    on("HPColorsPresetNameEntry", "ontextentrysubmit", function () { /* SAVE NEW commits the draft. */ });
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
  var api = {
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
        var copied = false;
        try { copied = $.DispatchEvent("CopyStringToClipboard", code) !== false; } catch (clipboardError) {}
        // HPV3_DEBUG if (copied) $.Msg("[HPV3] code " + kind + " copied via CopyStringToClipboard");
        if (!copied) {
          try {
            entry.SetFocus();
            entry.SelectAll();
            copied = $.DispatchEvent("TextEntryCopyToClipboard", entry) !== false;
            // HPV3_DEBUG if (copied) $.Msg("[HPV3] code " + kind + " copied via TextEntryCopyToClipboard");
          } catch (textEntryError) {}
        }
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
      if (!contractRef.validate(candidate)) throw new Error("That code holds settings this version cannot use.");
      if (typeof target[method] !== "function") throw new Error("Share codes are unavailable.");
      var settings = target[method](text);
      if (settings) {
        if (!contractRef.validate(settings)) { trigger(entry, "HPC3NegativeShake"); setCodeStatus("That code holds settings this version cannot use.", "error"); return; }
        if (kind !== "Bundle" && !editSettings(settings)) notifyStore();
      }
      // Keep a warning the store wrote during import (for example a newer-version code).
      if (codeStatusWrites === writes || !codeStatusText) setCodeStatus(kind === "Bundle" ? "Presets imported." : noun + " imported.", "ok");
    } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] code " + kind + " " + action + " failed: " + error + " stack=" + String(error && error.stack || "").split("\n").slice(0, 4).join(" | "));
      setCodeStatus(error && error.message ? String(error.message) : "That code could not be read.", "error");
      if (action !== "copy") trigger(entry, "HPC3NegativeShake");
    }
  }

  function bindChrome() {
    activeRoot.FindChildrenWithClassTraverse("HPC3GlyphButton").forEach(function (target) {
      tooltip(target, function () { return target.GetAttributeString("tooltip", ""); });
    });
    on("HPColorsUndoButton", "onactivate", undo);
    on("HPColorsShowBoundsToggle", "onactivate", toggleBounds);
    on("HPColorsPreviewCreditsButton", "onactivate", openCredits);
    on("HPColorsPreviewDonateButton", "onactivate", function () {
      if (retired) return;
      try {
        if (typeof $.DispatchEvent === "function") $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/hantuaraya");
      } catch (error) { /* The external browser is optional. */ }
    });
    on("HPColorsCreditsCloseButton", "onactivate", closeCredits);
    on("HPColorsCreditsEscClose", "onactivate", closeCredits);
    on("HPColorsCreditsBackdrop", "onactivate", closeCredits);
    on("HPColorsUpdateCloseButton", "onactivate", closeUpdate);
    on("HPColorsUpdateDownloadButton", "onactivate", openUpdateDownload);
    on("HPColorsUpdateEscClose", "onactivate", closeUpdate);
    on("HPColorsUpdateBackdrop", "onactivate", closeUpdate);
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
      on(page.navId, "onactivate", function () { clearSearch(); selectGroup(null); showPage(index); });
    });
    (menu.news || []).forEach(function (item) {
      on(item.buttonId, "onactivate", function () { openNews(item); });
      on(item.dismissId, "onactivate", function () { dismissNews([item.id]); });
    });
    on("HPColorsNewClearAllButton", "onactivate", function () { dismissNews(newsShowing().map(function (item) { return item.id; })); });
    on("HPColorsShareButton", "onactivate", function () {
      clearSearch(); selectGroup(null);
      showPage(menu.pages.map(function (page) { return page.name; }).indexOf("Presets"));
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
      if (host() && host().BHasClass("HPC3Open") && panel("HPColorsSearchField")) applySearch(panel("HPColorsSearchField").text);
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
      stopIdentityWatch();
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
      if (hud.job) $.CancelScheduled(hud.job);
      if (legacy.job) $.CancelScheduled(legacy.job);
      hud.job = null; legacy.job = null;
      publishedHudKey = "";
      var top = topPanel();
      showBounds = !!top && top.GetAttributeString(BOUNDS_ATTR, "") === "1";
    }
    var contract = $.HPColorsV3Settings;
    if (contract && (contractRef !== contract || !config || config.epoch !== publisherEpoch)) {
      // No cross-context process cache exists here (no GameUI); warm reloads use the retired instance's settings.
      var initial = inherited && contract.validate(inherited.settings) ? inherited.settings
        : config && contractRef === contract && contract.validate(config.settings) ? config.settings : contract.defaults;
      publicationResolved = !!(inherited && contract.validate(inherited.settings) || !store());
      if (inherited) { sourcePresetId = inherited.sourcePresetId || ""; sourceWasMapped = inherited.sourceWasMapped === true; }
      config = { magic: contract.magic, epoch: publisherEpoch, revision: 0, settings: clone(initial), rules: clone(inherited && inherited.rules || config && config.rules || {}) };
      contractRef = contract;
      heroKeys = Object.create(null);
      contract.heroes.forEach(function (hero) {
        [hero.name, hero.nameToken].forEach(function (name) {
          var token = name.toUpperCase(); if (!heroKeys[token]) heroKeys[token] = hero.key;
        });
      });
      ruleRows = {}; rowCells = new Map();
      contract.slots.forEach(function (slot) {
        ruleRows[slot.slot] = contract.controls.filter(function (row) { return row.side === slot.side && row.key === slot.setting; })[0];
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
    var missing = [];
    if (!contract) missing.push("HPColorsV3Settings");
    else {
      var found = Object.create(null);
      collect(root, found);
      panels = found;
      // DropDown options live in the detached dropdown menu, not in the layout tree.
      var detached = Object.create(null);
      contract.controls.forEach(function (row) {
        if (row.kind === "dropdown") row.options.forEach(function (option) { detached[option.id] = true; });
      });
      contract.ids.forEach(function (id) { if (id !== "HPColorsNativePicker" && !detached[id] && !found[id]) missing.push(id); });
      bindChrome();
      for (var i = 0; i < contract.controls.length; i++) {
        bindControl(contract.controls[i]);
        sync(contract.controls[i]);
      }
      if (pageIndex < 0) pageIndex = contract.menu.startPage || 0;
      showPage(pageIndex);
      // refreshPresets (which keeps the saved list) waits for a complete boot; a boot that is still retrying
      // a missing control reads the list here.
      if (config) readNewsSaved(presetBundle());
      syncNews();
      syncNavDots();
      selectSide(host() && host().BHasClass("HPC3SideAlly") ? "ally" : "enemy");
    }
    if (!missing.length) {
      ready = true;
      host().SetAttributeString("hpv3_boot", "ready");
      applySaveReset();
      syncUndo();
      refreshPresets();
      syncBounds();
      if (preview("attach", host(), effectiveSettings)) {
        preview("setPage", contractRef.menu.pages[pageIndex].name);
        preview("setSide", host().BHasClass("HPC3SideAlly") ? "ally" : "enemy");
        preview("setSettings", effectiveSettings, { showBounds: showBounds });
        if (host().BHasClass("HPC3Open")) preview("open");
      }
      if (host().BHasClass("HPC3Open")) setSupporterStripOpen(true);
      // Releases a previous context's HUD wash while a cold load is still pending.
      paintHud();
      var target = store();
      if (target && typeof target.attach === "function" && storeRoot !== root) {
        storeRoot = root;
        try { target.attach(api); } catch (error) {
          // HPV3_DEBUG $.Msg("[HPV3] store attach failed: " + error);
        }
      }
      renderIdentity();
      startIdentityWatch();
      // HPV3_DEBUG $.Msg("[HPV3] menu boot " + contractRef.version);
      return;
    }
    var signature = missing.join(", ");
    if (signature !== lastMissing) {
      lastMissing = signature;
      // HPV3_DEBUG $.Msg("[HPV3] menu missing controls: " + signature);
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
  $.HPColorsMenuToggle = function () {
    if (!valid(activeRoot) || !contractRef || !host()) return;
    setMenuOpen(!host().BHasClass("HPC3Open"));
  };
  // ESC closes search first, then the editor; only a closed editor lets stock resume run.
  $.HPColorsMenuCancel = function () {
    if (!valid(activeRoot) || !contractRef || !host()) return false;
    var root = host();
    if (!root.BHasClass("HPC3Open")) return false;
    if (panel("HPColorsUpdateDialog") && panel("HPColorsUpdateDialog").BHasClass("Open")) { closeUpdate(); return true; }
    if (panel("HPColorsCreditsDialog") && panel("HPColorsCreditsDialog").BHasClass("Open")) { closeCredits(); return true; }
    if (picker) { closePicker(true); return true; }
    if (conditionDraft) { closeCondition(); return true; }
    if (heroPicker) { closeHeroPicker(); return true; }
    if (resetPage !== null) { cancelReset(); return true; }
    if (deletePreset) { cancelDelete(); return true; }
    if (bundleReplacement) { cancelBundleReplacement(); return true; }
    if (root.BHasClass("Searching")) clearSearch();
    else setMenuOpen(false);
    return true;
  };
})();
