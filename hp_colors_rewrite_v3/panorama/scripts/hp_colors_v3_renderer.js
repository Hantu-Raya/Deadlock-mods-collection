(function () {
  "use strict";
  // Reinclusion step 1: stop the previous instance (its teardown() runs before anything below is evaluated).
  if ($.HPColorsV3Renderer) $.HPColorsV3Renderer.stop();
  var MAGIC = "HP_COLORS_V3_CONFIG";
  var headerRe = null; // built on the first message: world bars that never receive one never compile it
  // One shared empty plan; callers only read it (apply never writes, the preview alias writes only when styles.fill/classes.fill exist).
  var EMPTY_PLAN = Object.freeze({ styles: Object.freeze({}), classes: Object.freeze({}), parents: Object.freeze({}) });
  function emptyPickups() { return { pickupIcons: [], pickupInners: [], pickupBorders: [], pickupTracks: [], pickupGlyphs: [], pickupKinds: [] }; }
  // A neutral camp uses the enemy side's config.
  function sideConfig(config, carrier) { return config.side[carrier.side === "neutral" ? "enemy" : carrier.side]; }
  // TUNING: cadences and limits, plain locals so loading costs nothing (this file is evaluated once per health bar)
  // and the per-tick path keeps plain variable reads.
  // The game has no change event for panel classes or layout, so polling stays; the numbers are the cost/latency trade.
  var TICK_ACTIVE = 0.15;                 // tick period while a bar is painted (health/layer signatures only)
  var TICK_DORMANT = 1;                   // tick period while the bar is gated off (the 1 s player wake)
  var CARRIER_CHECK_MS = 1000;            // carrier lineage / class re-check
  var GEOMETRY_MS = 1500;                 // geometry refresh (plus one settling sample after a layout write)
  var FULL_PAINT_MS = 1500;               // idle repaint floor
  var PICKUPS_MS = 3000;                  // pickup structure walk
  var STAMINA_STRUCTURE_MS = 3000;        // low-stamina structure walk
  var STAMINA_IDLE_CHARGES = 3.5;         // idle stamina reads stretch by (charges + 1) / this beyond the six-charge rate
  var DORMANT_PROBE_EVERY = 5;            // every fifth dormant check probes kind tags on the existing ancestry
  var ANCESTRY_DEPTH = 12;                // carrier ancestry walk limit
  var MAX_PIPS = 128;                     // stamina pip cap
  var MAX_ENVELOPE = 64000;               // config envelope size limit
  var MAX_EPOCH = 128;                    // config epoch length limit
  var MAX_MEASUREMENT = 1000000;          // layout reads beyond this are engine garbage
  var REQUEST_DELAYS = [0.5, 1, 2, 4, 8]; // config request backoff
  var REQUEST_FAILURE_LIMIT = 3;          // unanswered config requests before giving up
  // DEFAULTS: schema defaults (settings/schema.json) the planner compares against to decide a row is still stock.
  // tests/renderer.test.js compares every entry to the schema through schemaDefaults(). The bar offset default is -3.8.
  var DEFAULT_STAMINA_WIDTH = 11, DEFAULT_STAMINA_HEIGHT = 4.48, DEFAULT_NAME_SIZE = 14;
  var DEFAULT_NAME_OUTLINE = 5, DEFAULT_HP_TEXT_OUTLINE = 5, DEFAULT_BAR_OFFSET_Y = -3.8;
  var DEFAULT_SHAKE_STRENGTH = 3, DEFAULT_LINE_OPACITY = 100;
  function schemaDefaults() {
    return { staminaWidth: DEFAULT_STAMINA_WIDTH, staminaHeight: DEFAULT_STAMINA_HEIGHT, nameSize: DEFAULT_NAME_SIZE,
      nameOutline: DEFAULT_NAME_OUTLINE, hpTextOutline: DEFAULT_HP_TEXT_OUTLINE, barOffsetY: DEFAULT_BAR_OFFSET_Y,
      damageShakeStrength: DEFAULT_SHAKE_STRENGTH, lineOpacity: DEFAULT_LINE_OPACITY };
  }
  // STOCK: sizes of the game's own unit-status panel (vendor/unit_status_v2.css) that the layout maths scales from.
  var STOCK_BAR_WIDTH = 79, STOCK_BAR_HEIGHT = 18;             // stock #HealthBar fill extent the bar width/height settings scale from
  var STOCK_CANVAS_WIDTH = 200, STOCK_CANVAS_HEIGHT = 210;     // stock overlay canvas used when the live canvas reports 0
  var STOCK_ACCESSORY_CENTER_Y = 85, STOCK_ACCESSORY_PAD = 14; // level/ult accessory placement: centre line and padding of the stock layout
  var STOCK_MOTION_ORIGIN = 8500;                              // shake transform-origin numerator (percent of canvas height * 100)
  var STOCK_NAME_MAX_WIDTH = 170;                              // stylesheet fallback for #name max-width
  // LEASE: ledger pseudo-keys. A stock lease on a style property keys by its property name; the reparent lease keys "@parent"
  // and a class toggle keys "@class:<name>" (restore, claim and apply branch on these).
  var LEASE_PARENT = "@parent", LEASE_CLASS = "@class:", LEASE_CORE_CLASS = LEASE_CLASS + "HPColorsV3Core";
  // PAINTER-VISIBLE STATE: module state the painter-path helpers read or write besides their arguments. The menu preview shares
  // these helpers, so each is keyed by panel (WeakMap) or reset per painter, never by the world carrier:
  //   classReads / childKinds   per-panel class and child-kind memos (has, childrenOfKind); classReads resets only in checkCarriers
  //   pickupEntries / textWrites  per-panel pickup entries (pickupParts) and the last text written (ledger-adjacent text cache)
  //   statusScaleSource / statusScaleClasses  memo of the native status icon scale source (reconcileNativeIndicators)
  //   laidSizes / nameBases / accessoryBounds / hiddenLayers  last laid sizes, captured name bases, accessory and layer facts
  //   staminaShowing / ultimateArtwork / bountyParts / lineChildren read cache fields and the timer facts only.
  var root = null, carriers = [], ancestry = [], cache = null, cachedFacts = null, memo = null;
  var settings = null, revision = -1, epoch = "", lastRaw = "", ledger = [], carrierSignature = "", kind = null;
  // SHOW BOUNDS: session-only view state that travels beside the settings, never inside them.
  var showBounds = false;
  var job = null, jobTicket = 0, requestJob = null, handlerId = null, generation = 0, running = false;
  // What outlives this IIFE (reinclusion), the four stores in one place:
  //   $.HPColorsV3RendererAuthority  config epoch / revision floor / retired epochs (below)
  //   root.HPColorsV3StockLedger     explicit stock writes, read in start() (dies with the root panel)
  //   grid.HPColorsV3PipState        per-pip-grid paint state (applyPips)
  //   $.HPColorsV3Renderer           the previous instance, stopped by the file's first statement
  // Authority outlives this IIFE: reinclusion must not let an old publisher regain control.
  // Opaque epochs require one retained string per replacement publisher (not per revision/paint).
  // Do not evict history: that reopens replay. It is session-only and collected with this context.
  var authority = $.HPColorsV3RendererAuthority || { epoch: "", revision: -1, retired: [] };
  $.HPColorsV3RendererAuthority = authority;
  var retiredEpochs = authority.retired;
  var requestAttempt = 0, requestFailures = 0, lastProbe = "", lastFull = -Infinity, lastCarrierCheck = -Infinity;
  var geometry = null, lastGeometry = -Infinity, settleGeometry = false, dormantChecks = 0, rediscover = false;
  var classReads = new WeakMap(), classSources = {}, staminaIdleTicks = 0;
  // HPV3_DEBUG var loggedCarrierDepth = new WeakMap();
  var lastConfigKey = "";
  // HPV3_DEBUG var timingAt = 0, timingTicks = 0, timingMs = 0;
  // HPV3_DEBUG var debugLastName = "", debugTeamLogged = "", debugTeam = "", debugStamina = "", debugColors = "", debugAllyAt = -1, debugAllySeen = false, debugAllyNone = false, debugCostAt = 0, debugCostTicks = 0, debugFastTicks = 0, debugFastSkipped = 0, debugFastReads = 0, debugCostPaints = 0, debugCostMs = 0;
  // HPV3_DEBUG function debugName() { debugLastName = cache && valid(cache.name) && cache.name.text || "?"; return debugLastName; };
  // HPV3_DEBUG function debugClasses(panel) { return valid(panel) ? ["StaminaPip", "PipEmpty", "StaminaRecentlyUsed", "StaminaRecentlyDepleted"].filter(function (name) { return panel.BHasClass(name); }).join(",") : "missing"; };
  var status = { started: false, state: "stopped", revision: -1, epoch: "", plansComputed: 0, fullPaints: 0 };
  // Unit bars release to CSS with null; captured non-empty inline values are restored exactly.
  var relationStock = { team1: "#E7B659", team2: "#5B79E6" };
  var playerClasses = ["player", "CLASS_PLAYER"];
  var objectiveClasses = ["building", "CLASS_DESTROYABLE_BUILDING", "boss_tier1", "boss_tier2", "boss_tier3", "boss_barracks", "barracks", "neutral_vault"];
  var npcClasses = ["creature", "minion", "CLASS_TROOPER", "CLASS_TROOPER_BOSS", "neutral_weak", "neutral_normal", "neutral_strong", "midboss"];
  // Boss kinds: objectives plus the midboss. A player carrying one is never owned (classify).
  var bossClasses = objectiveClasses.concat(["midboss"]);
  var neutralClasses = ["team_neutral", "neutral_weak", "neutral_normal", "neutral_strong", "neutral_vault"];
  var stockClasses = ["health_critical", "ShowCriticalState"];
  var allClasses = playerClasses.concat(objectiveClasses, npcClasses, neutralClasses, ["enemy", "friend", "LocalPlayer", "team1", "team2", "spectating"], stockClasses);
  var fonts = { default: "Retail Demo, Noto Sans, sans-serif", oracle: "VALVEOracle, Reaver, sans-serif", pulp: "VALVEPulp, Noto Sans, sans-serif" };
  var accessoryBounds = new WeakMap(), hiddenLayers = new WeakMap();
  // Last laid name/row size per panel (a replaced panel starts empty) and the captured name max-width.
  var laidSizes = new WeakMap(), nameBases = new WeakMap();
  // Native line/stamina-icon identity classes are fixed for a panel's lifetime. Mutable
  // depletion classes stay live in CSS (shapes) or are polled (arrows).
  var childKinds = new WeakMap();
  var pickupEntries = new WeakMap(), lastPickups = -Infinity, textWrites = new WeakMap();
  var stateHooks = [], timerFacts = { pickupAllowed: true, ultimateAngle: null, bounty: null };
  // What the state subscribers were last told (compared field by field on every tick; no key string is built).
  var notified = { active: null, source: null, epoch: null, revision: null, signature: null, parts: null };
  // ====== DRIVER STATE: timer hooks, tick scheduling, config authority ======
  function timerState() {
    var carrier = null;
    for (var i = 0; i < carriers.length; i++) {
      var reads = classReads.get(carriers[i]);
      if (carriers[i].id && reads && playerClasses.some(function (name) { return reads[name] === true; })) {
        carrier = carriers[i]; break;
      }
    }
    return { settings: settings, active: !!(running && status.state !== "dormant" && settings && settings.shared.enabled && kind && kind.eligible && kind.kind === "player"),
      parts: cache, source: carrier ? String(carrier.id) : "" };
  }
  function notifyTimers() {
    var state = timerState();
    if (state.active === notified.active && state.source === notified.source && epoch === notified.epoch && revision === notified.revision &&
        carrierSignature === notified.signature && state.parts === notified.parts) return;
    notified.active = state.active; notified.source = state.source; notified.epoch = epoch; notified.revision = revision;
    notified.signature = carrierSignature; notified.parts = state.parts;
    stateHooks.slice().forEach(function (fn) { fn(state); });
  }
  function subscribeState(callback) {
    stateHooks.push(callback);
    return function () { var i = stateHooks.indexOf(callback); if (i >= 0) stateHooks.splice(i, 1); };
  }
  // The world timers' view of one bar (from the state record they were notified with): the panels they sample, behind
  // getters so each read happens only where the sampler asks for it. One shared object, nothing allocated per read.
  var barParts = null, NO_ENTRIES = [], barPickups = { icons: NO_ENTRIES, kinds: NO_ENTRIES, borders: NO_ENTRIES };
  var barView = {
    // The bar title (the player or hero name), upper-cased; "" while unreadable or still a {localization} token.
    get barName() {
      var panel = barParts && barParts.name, text = valid(panel) ? panel.text : "";
      return typeof text === "string" && text.charAt(0) !== "{" ? text.trim().toUpperCase() : "";
    },
    // The ultimate-ready icon's visibility; null when the panel is gone.
    get ultReadyVisible() {
      var panel = barParts && barParts.ultReady;
      return valid(panel) ? panel.visible : null;
    },
    // The pickup icons with their kind bits and border panels, as of the last reconcile (refreshPickups).
    get pickups() {
      barPickups.icons = barParts.pickupIcons || NO_ENTRIES; barPickups.kinds = barParts.pickupKinds; barPickups.borders = barParts.pickupBorders;
      return barPickups;
    }
  };
  function barFacts(state) { barParts = state.parts; return barView; }
  function bountyParts(parts) {
    if (valid(parts.bountyAnchor) && valid(parts.bountyPill) && valid(parts.bountyValue)) return;
    parts.bountyAnchor = valid(root) ? root.FindChild(ID_BOUNTY_ANCHOR) : null;
    parts.bountyPill = valid(parts.bountyAnchor) ? parts.bountyAnchor.FindChild(ID_BOUNTY_PILL) : null;
    parts.bountyValue = valid(parts.bountyAnchor) ? parts.bountyAnchor.FindChildTraverse(ID_BOUNTY_VALUE) : null;
    parts.bountyLooked = true;
  }
  function setTimerFacts(next) {
    var bounty = Number.isSafeInteger(next.bounty) && next.bounty >= 0 ? next.bounty : null;
    if (timerFacts.pickupAllowed === next.pickupAllowed && timerFacts.ultimateAngle === next.ultimateAngle && timerFacts.bounty === bounty) return;
    var gateChanged = timerFacts.pickupAllowed !== next.pickupAllowed, ultimateChanged = timerFacts.ultimateAngle !== next.ultimateAngle;
    if (gateChanged) lastPickups = -Infinity;
    timerFacts = { pickupAllowed: next.pickupAllowed, ultimateAngle: next.ultimateAngle, bounty: bounty };
    if (cache) { cache.ultimateAngle = next.ultimateAngle; cache.bounty = bounty; }
    if (cache && bounty !== null && settings && settings.shared.killBountyEnabled) bountyParts(cache);
    // Timer-only prediction changes reuse the last observed health/layout facts.
    // They must not add a second fill/geometry poll or shift the 0.15s scheduler.
    if (!gateChanged && running && cachedFacts && settings && cache && (!ultimateChanged || valid(cache.ultimateOverlay))) {
      var current = Object.assign({}, cachedFacts, { ultimateAngle: next.ultimateAngle, bounty: bounty });
      // The plan just applied is the next tick's plan too (the memo key leaves timer facts out): keep it,
      // so a once-a-second bounty or ultimate step costs one plan per bar, not two.
      try { var timed = plan(current, settings, { showBounds: showBounds }); apply(timed); cachedFacts = current; status.plansComputed++;
        memo = { key: memoKey(current), value: timed }; return; }
      catch (error) { /* Pending leases retry through the normal guarded paint. */ }
    }
    invalidate("facts");
    if (running) scheduleTick(0, generation);
  }
  // The named reset scopes of the cached facts / memoised plan. "facts" also forces the next tick to repaint; "probe" also
  // forgets the last probe signature; "painted" does the probe reset without forcing a repaint (lease release paths);
  // "geometry" also drops the sampled geometry. Only reached on change events, never per tick.
  function invalidate(scope) {
    cachedFacts = null; memo = null;
    if (scope !== "painted") lastFull = -Infinity;
    if (scope === "probe" || scope === "painted") lastProbe = "";
    else if (scope === "geometry") { geometry = null; lastGeometry = -Infinity; }
  }
  // Each scheduled tick carries the generation and a ticket captured when it is scheduled. A canceled callback
  // delivered late (or any replaced one) fails the ticket check before touching the current job slot.
  function scheduleTick(delay, token) {
    cancelTick();
    var ticket = jobTicket;
    job = $.Schedule(delay, function rendererTick() {
      if (ticket !== jobTicket) return;
      job = null; jobTicket++;
      tick(token, false);
    });
  }
  function cancelTick() {
    if (job) $.CancelScheduled(job);
    job = null; jobTicket++;
  }
  // Shared rule with hp_colors_v3_timers_hud.js: retain the current revision floor and refuse retired epochs.
  function acceptsConfig(nextEpoch, nextRevision) {
    // A restarted consumer may hydrate the current revision once, never an older one.
    if (nextEpoch === authority.epoch) return nextRevision > authority.revision || !settings && nextRevision === authority.revision;
    return retiredEpochs.indexOf(nextEpoch) < 0;
  }
  // The one place a config envelope is accepted or refused: shape, epoch/revision rule, settings validation.
  // Returns the shared `accepted` record (no allocation per message) or null; the caller consumes it at once.
  var accepted = { settings: null, epoch: "", revision: -1, showBounds: false };
  function acceptConfig(raw) {
    var data = JSON.parse(raw);
    if (!data || data.magic !== MAGIC || typeof data.epoch !== "string" || !data.epoch || data.epoch.length > MAX_EPOCH ||
        !Number.isSafeInteger(data.revision) || data.revision < 0 || !acceptsConfig(data.epoch, data.revision) ||
        !$.HPColorsV3WorldSettings.validate(data.settings)) return null;
    accepted.settings = data.settings; accepted.epoch = data.epoch; accepted.revision = data.revision;
    accepted.showBounds = data.showBounds === true;
    return accepted;
  }
  function retireEpoch(nextEpoch) {
    if (!authority.epoch || authority.epoch === nextEpoch || retiredEpochs.indexOf(authority.epoch) >= 0) return;
    retiredEpochs.push(authority.epoch);
  }
  function ultimateArtwork(parts, prefix) {
    if (!valid(parts.ultBackground)) return;
    if (valid(parts.ultimateOverlay) && valid(parts.ultimateDark) && valid(parts.ultimateFill) && parts.ultimateOverlay.GetParent() === parts.ultBackground) return;
    var overlayId = prefix + SUFFIX_ULT_OVERLAY, darkId = prefix + SUFFIX_ULT_DARK, fillId = prefix + SUFFIX_ULT_FILL;
    parts.ultimateOverlay = parts.ultBackground.FindChild(overlayId) ||
      $.CreatePanel("Panel", parts.ultBackground, overlayId);
    parts.ultimateOverlay.AddClass("HPColorsV3UltimateOverlay");
    parts.ultimateOverlay.hittest = parts.ultimateOverlay.hittestchildren = false;
    parts.ultimateOverlay.style.visibility = "collapse";
    parts.ultimateDark = parts.ultimateOverlay.FindChild(darkId) || $.CreatePanel("Image", parts.ultimateOverlay, darkId);
    parts.ultimateFill = parts.ultimateOverlay.FindChild(fillId) || $.CreatePanel("Image", parts.ultimateOverlay, fillId);
    [parts.ultimateDark, parts.ultimateFill].forEach(function (panel) {
      panel.AddClass("HPColorsV3UltimateArtwork"); panel.hittest = false;
      panel.SetImage("s2r://panorama/images/hpv3/ultimate_progress.vsvg");
    });
  }
  function childrenOfKind(parent, names) {
    var children = valid(parent) ? parent.Children() : [], previous = childKinds.get(parent);
    var key = names.join("|");
    if (previous && previous.key === key && children.length === previous.children.length &&
        children.every(function (panel, i) { return panel === previous.children[i]; })) return previous.parts;
    var parts = children.filter(function (panel) {
      return names.some(function (name) { return panel.BHasClass(name); });
    });
    if (parent) childKinds.set(parent, { key: key, children: children, parts: parts });
    return parts;
  }

  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  function has(panel, name) {
    var reads = classReads.get(panel);
    if (!reads) { reads = Object.create(null); classReads.set(panel, reads); }
    if (Object.prototype.hasOwnProperty.call(reads, name)) return reads[name];
    var value = panel.BHasClass(name);
    reads[name] = value;
    return value;
  }
  function any(names) {
    var key = names.join("|"), source = classSources[key];
    if (source && valid(source.panel) && carriers.indexOf(source.panel) >= 0 && has(source.panel, source.name)) return true;
    for (var p = 0; p < carriers.length; p++)
      for (var n = 0; n < names.length; n++) if (has(carriers[p], names[n])) {
        classSources[key] = { panel: carriers[p], name: names[n] }; return true;
      }
    delete classSources[key];
    return false;
  }
  // ====== PART REGISTRY: one table of every panel the renderer touches (read at load/attach/discover, never per paint) ======
  // key      name in `cache` / the painter's parts, and the part name plan.styles / classes / parents address
  // id       panel id (stock id, or our XML / runtime id); `suffix` is the id without the world prefix (ids built with a prefix)
  // parents  keys of the panels it hangs under, tried in this order ("root" = the unit-status root; discover and reconcile both read it)
  // find     child | traverse | class (first child carrying `cls`) | runtime (created by us) | native (adopted by reconcile) | derived (not a panel)
  // at       discovery step: 1 chain (valid-guarded), 2 stock parts read raw, 3 pip grid, 4 ultimate art; 0 = reconcile / runtime only
  // owned    our own XML or runtime panel, never stock; preview:false = the menu sample tree does not supply it
  // lineage  chain | optional | valid: how lineageValid() checks it, in `lin` order; `ready` = order of the discover() validity check
  // accessory = reconcileAccessories() order (`held`: only once the panel exists, `reparent`: its parent there is not parents[0])
  // Load cost is paid once per bar (every unit bar is its own script context, evaluated cold), and cold script code costs per bytecode, not
  // per byte of data. So the world tables are flat constant arrays read in place (no row objects, no derived lists, no sorting) and the
  // menu-only views are built on first read behind getters.
  var WORLD_PREFIX = "HPColorsV3";
  var PIP_PARTS = ["Outline", "Empty", "Shield", "Armor", "Fill", "Healing", "Delta", "KillMarker"];
  var STATUS_LABELS = Object.freeze(["critical", "assassinate", "unkillable"]);
  // Ids/keys the world code reads by name, in STATUS_LABELS order for the three label arrays.
  var LABEL_ANCHOR_KEY = ["criticalAnchor", "assassinateAnchor", "unkillableAnchor"];
  var LABEL_ANCHOR_ID = ["HPColorsV3CriticalAnchor", "HPColorsV3AssassinateAnchor", "HPColorsV3UnkillableAnchor"];
  var LABEL_NATIVE_ID = ["CriticalIndicator", "AssassinateIndicator", "UnkillableIndicator"];
  var ID_KILLSTREAK = "KillStreakIndicator", ID_REJUV = "RejuvenatorActive";
  var ID_BOUNTY_ANCHOR = "HPColorsV3BountyAnchor", ID_BOUNTY_PILL = "HPColorsV3Bounty", ID_BOUNTY_VALUE = "HPColorsV3BountyValue";
  var SUFFIX_ULT_OVERLAY = "UltimateOverlay", SUFFIX_ULT_DARK = "UltimateDark", SUFFIX_ULT_FILL = "UltimateFill";
  // PART_DATA: the rows the world bars use, a flat array of ROW_COLUMNS values per row, grouped by discovery step (rows 0..CHAIN_END-1 =
  // step 1, up to STOCK_END = step 2, GRID_END = step 3, ULT_END = step 4, then rows that only reconcile touches), each group in table
  // order. A row's number is its position here. Columns:
  //   0 key   1 id   2,3 parents (second "" when there is one)   4 find (index into FIND_NAMES)
  //   5 flags: 1 guarded, 2 owned, 4 no preview sample, 8 held, 16 orNull, 32 local   6 parentClass   7 cls   8 reparent
  // Row numbers: 0 motion 1 readout 2 anchor 3 row 4 status 5 info 6 stack 7 primary 8 inner 9 fill | 10 shield 11 armor 12 deferred 13 healing
  // 14 delta 15 lines 16 outline 17 value 18 hpPercent 19 name 20 killMarker 21 level 22 levelLabel 23 ult 24 pulseOverlay 25 rejuvAnchor
  // 26 effects | 27 pipGrid 28..35 pipOutline..pipKillMarker | 36 ultBackground 37 ultReady | 38 ultimateOverlay.
  var ROW_COLUMNS = 9, CHAIN_END = 10, STOCK_END = 27, GRID_END = 36, ULT_END = 38;
  var FIND_NAMES = ["child", "traverse", "class", "runtime", "native", "derived"];
  var PART_DATA = [
    "motion", "HPColorsV3MotionFrame", "root", "", 0, 3, "", "", "",
    "readout", "HPColorsV3Readout", "motion", "", 0, 39, "", "", "",
    "anchor", "HPColorsV3ReadoutAnchor", "readout", "", 0, 3, "", "", "",
    "row", "HPColorsV3ReadoutRow", "anchor", "", 0, 3, "", "", "",
    "status", "UnitStatus", "root", "motion", 0, 1, "", "", "",
    "info", "InfoHealthContainer", "status", "", 0, 1, "", "", "",
    "stack", "UnitHealthbarsContainer", "info", "", 0, 1, "", "", "",
    "primary", "UnitHealthbar", "stack", "", 0, 1, "", "", "",
    "inner", "UnitHealthbarInner", "primary", "", 0, 1, "UnitHealthbarContainer", "", "",
    "fill", "unit_healthbar_lagging", "inner", "", 0, 1, "", "", "",
    "shield", "unit_healthbar_bullet_shield", "inner", "", 0, 0, "", "", "",
    "armor", "unit_healthbar_ratking_armor", "inner", "", 0, 0, "", "", "",
    "deferred", "unit_healthbar_deferred", "inner", "", 0, 4, "", "", "",
    "healing", "unit_healthbar_healing", "inner", "", 0, 0, "", "", "",
    "delta", "unit_healthbar_delta", "inner", "", 0, 0, "", "", "",
    "lines", "UnitHealthbarLines", "primary", "", 0, 0, "", "", "",
    "outline", "HPColorsV3BarOutline", "primary", "", 0, 2, "", "", "",
    "value", "UnitHealthbarValue", "info", "row", 0, 0, "", "", "",
    "hpPercent", "HPColorsV3HPPercent", "row", "", 0, 6, "", "", "",
    "name", "name", "root", "motion", 0, 0, "", "", "",
    "killMarker", "HPColorsV3KillMarker", "primary", "", 0, 2, "", "", "",
    "level", "HPColorsV3Level", "info", "", 0, 2, "", "", "",
    "levelLabel", "unit_level_label", "info", "", 1, 0, "", "", "level",
    "ult", "", "info", "", 2, 16, "", "unit_info_panel", "",
    "pulseOverlay", "HPColorsV3PulseOverlay", "inner", "", 0, 2, "", "", "",
    "rejuvAnchor", "HPColorsV3RejuvenatorAnchor", "root", "", 0, 2, "", "", "",
    "effects", "StatusEffects", "root", "", 0, 16, "", "", "",
    "pipGrid", "HPColorsV3PipGrid", "primary", "", 0, 2, "", "", "",
    "pipOutline", "HPColorsV3PipOutline", "pipGrid", "", 0, 3, "", "", "",
    "pipEmpty", "HPColorsV3PipEmpty", "pipGrid", "", 0, 3, "", "", "",
    "pipShield", "HPColorsV3PipShield", "pipGrid", "", 0, 3, "", "", "",
    "pipArmor", "HPColorsV3PipArmor", "pipGrid", "", 0, 3, "", "", "",
    "pipFill", "HPColorsV3PipFill", "pipGrid", "", 0, 3, "", "", "",
    "pipHealing", "HPColorsV3PipHealing", "pipGrid", "", 0, 3, "", "", "",
    "pipDelta", "HPColorsV3PipDelta", "pipGrid", "", 0, 3, "", "", "",
    "pipKillMarker", "HPColorsV3PipKillMarker", "pipGrid", "", 0, 3, "", "", "",
    "ultBackground", "unit_info_bg", "ult", "", 0, 1, "", "", "",
    "ultReady", "unit_ult_ready_icon", "ultBackground", "", 0, 1, "", "", "",
    "ultimateOverlay", "HPColorsV3UltimateOverlay", "ultBackground", "", 3, 14, "", "", ""
  ];
  // Row numbers, in the order each reader walks them. discover() checks DISCOVER_READY (in this order) before it builds the cache;
  // lineageValid() walks the chain rows, then the optional rows, then the valid-guarded rows; reconcileAccessories() walks ACCESSORIES.
  // (`lin`, `ready` and `accessory` of the published table are the positions in these lists.)
  var DISCOVER_READY = [4, 5, 6, 7, 8, 9, 0, 2, 3];
  var LINEAGE_CHAIN = [4, 5, 6, 7, 8, 9], LINEAGE_OPTIONAL = [17, 19], LINEAGE_VALID = [10, 11, 0, 2, 3, 16];
  var ACCESSORIES = [21, 22, 23, 36, 37, 38, 25];
  // Ticket 52, in class-letter order A..H: the size setting and the game's icon class (abilities.vdata m_strSmallIconCssClass); the letter
  // hp_colors_v3_status.css pairs with it is "ABCDEFGH"[index] (tests/status-effect-sizes.test.js pins the stylesheet to this table).
  var STATUS_SCALE_KEYS = ["statusScaleFixation", "statusScaleMalice", "statusScaleScrewjab", "statusScaleDjinnsMark", "statusScaleSerratedKnives",
    "statusScaleBarrage", "statusScalePulseGrenade", "statusScaleArcticBeam"];
  var STATUS_SCALE_ICONS = ["fixated", "blood_shard", "modifier_viper_debuffdagger", "sand_phantom_passive_victim", "shiv_dagger", "pocket_damage_amp",
    "chrono_pulse_grenade", "freezing_buildup"];
  // World pickups in bit order: the native class that marks the icon and the sample name the preview builds its ids and glyph from.
  var pickupClasses = ["gunpower_pickup", "movement_pickup", "casting_pickup", "survival_pickup"];
  var PICKUP_NAMES = ["Gun", "Movement", "Spirit", "Survival"];
  var pickupColors = ["pickupGunColor", "pickupMovementColor", "pickupSpiritColor", "pickupSurvivalColor"];
  // ---- Menu-preview vocabulary, published on $.HPColorsV3Renderer behind getters: built on first read, so world bars never build it. ----
  var publishedParts = null, publishedScales = null, publishedPickups = null;
  function publishedPartTable() {
    if (publishedParts) return publishedParts;
    var rows = [], i, o, k;
    function full(fields) {
      return Object.assign({ key: "", id: "", suffix: "", parents: [], find: "child", at: 0, guarded: false, owned: false, preview: true,
        lineage: "", lin: 0, ready: 0, accessory: 0, held: false, reparent: "", cls: "", parentClass: "", orNull: false, local: false }, fields);
    }
    var byRow = {};
    for (i = 0; i * ROW_COLUMNS < PART_DATA.length; i++) {
      o = i * ROW_COLUMNS;
      var flags = PART_DATA[o + 5], find = FIND_NAMES[PART_DATA[o + 4]];
      var def = full({ key: PART_DATA[o], id: PART_DATA[o + 1], suffix: find === "runtime" ? PART_DATA[o + 1].slice(WORLD_PREFIX.length) : "",
        parents: PART_DATA[o + 3] ? [PART_DATA[o + 2], PART_DATA[o + 3]] : [PART_DATA[o + 2]], find: find,
        at: i < CHAIN_END ? 1 : i < STOCK_END ? 2 : i < GRID_END ? 3 : i < ULT_END ? 4 : 0,
        guarded: (flags & 1) !== 0, owned: (flags & 2) !== 0, preview: (flags & 4) === 0, held: (flags & 8) !== 0, orNull: (flags & 16) !== 0,
        local: (flags & 32) !== 0, parentClass: PART_DATA[o + 6], cls: PART_DATA[o + 7], reparent: PART_DATA[o + 8] });
      rows.push(def); byRow[i] = def;
    }
    for (k = 0; k < DISCOVER_READY.length; k++) byRow[DISCOVER_READY[k]].ready = k + 1;
    var lin = 1, lineages = [LINEAGE_CHAIN, LINEAGE_OPTIONAL, LINEAGE_VALID], names = ["chain", "optional", "valid"];
    for (k = 0; k < 3; k++) for (i = 0; i < lineages[k].length; i++) { byRow[lineages[k][i]].lineage = names[k]; byRow[lineages[k][i]].lin = lin++; }
    for (k = 0; k < ACCESSORIES.length; k++) byRow[ACCESSORIES[k]].accessory = k + 1;
    var extra = [
      full({ key: "root", find: "derived", preview: false }),
      full({ key: "stamina", id: "StaminaContainer", parents: ["root"], find: "native" }),
      full({ key: "pickupContainer", id: "StatusEffectContainer", parents: ["effects"], find: "traverse" }),
      full({ key: "killStreak", id: ID_KILLSTREAK, parents: ["ult"], find: "native" }),
      full({ key: "rejuv", id: ID_REJUV, parents: ["rejuvAnchor"], find: "native" })];
    for (i = 0; i < 3; i++) {
      extra.push(full({ key: STATUS_LABELS[i], id: LABEL_NATIVE_ID[i], parents: [LABEL_ANCHOR_KEY[i]], find: "native" }),
        full({ key: LABEL_ANCHOR_KEY[i], id: LABEL_ANCHOR_ID[i], parents: ["root"], find: "runtime", owned: true, suffix: LABEL_ANCHOR_ID[i].slice(WORLD_PREFIX.length) }));
    }
    extra.push(
      full({ key: "bountyAnchor", id: ID_BOUNTY_ANCHOR, parents: ["root"], find: "runtime", owned: true, suffix: ID_BOUNTY_ANCHOR.slice(WORLD_PREFIX.length) }),
      full({ key: "bountyPill", id: ID_BOUNTY_PILL, parents: ["bountyAnchor"], find: "runtime", owned: true, suffix: ID_BOUNTY_PILL.slice(WORLD_PREFIX.length) }),
      full({ key: "bountyValue", id: ID_BOUNTY_VALUE, parents: ["bountyAnchor"], find: "runtime", owned: true, suffix: ID_BOUNTY_VALUE.slice(WORLD_PREFIX.length) }),
      full({ key: "ultimateDark", id: WORLD_PREFIX + SUFFIX_ULT_DARK, parents: ["ultimateOverlay"], find: "runtime", owned: true, preview: false, suffix: SUFFIX_ULT_DARK }),
      full({ key: "ultimateFill", id: WORLD_PREFIX + SUFFIX_ULT_FILL, parents: ["ultimateOverlay"], find: "runtime", owned: true, preview: false, suffix: SUFFIX_ULT_FILL }));
    // Plan keys that name a derived list of panels rather than one panel (applyTo spreads them).
    var derived = ["lineWash", "pickupIcons", "pickupInners", "pickupBorders", "pickupTracks", "pickupGlyphs", "pickupKinds", "staminaIcons", "staminaEmpty", "staminaPips"];
    for (i = 0; i < derived.length; i++) extra.push(full({ key: derived[i], parents: ["root"], find: "derived", preview: false }));
    rows = rows.concat(extra);
    for (i = 0; i < rows.length; i++) Object.freeze(rows[i]);
    return (publishedParts = Object.freeze(rows));
  }
  function publishedScaleTable() {
    if (publishedScales) return publishedScales;
    var list = [];
    for (var i = 0; i < STATUS_SCALE_KEYS.length; i++) list.push(Object.freeze({ key: STATUS_SCALE_KEYS[i], icon: STATUS_SCALE_ICONS[i], letter: "ABCDEFGH".charAt(i) }));
    return (publishedScales = Object.freeze(list));
  }
  function publishedPickupTable() {
    if (publishedPickups) return publishedPickups;
    var list = [];
    for (var i = 0; i < PICKUP_NAMES.length; i++) list.push(Object.freeze({ cls: pickupClasses[i], name: PICKUP_NAMES[i], icon: PICKUP_NAMES[i].toLowerCase() }));
    return (publishedPickups = Object.freeze(list));
  }
  // A status label sits at its stock place while it is shown and not offset (no anchor panel is needed).
  function labelAtDefault(shared, key) { return shared[key + "IndicatorVisible"] && !shared[key + "OffsetX"] && !shared[key + "OffsetY"]; }
  // One panel lookup shared by discover (raw or valid-guarded per table row); `row` is the row's number in PART_DATA and `held` supplies the
  // parents found so far.
  function findPart(row, held) {
    var o = row * ROW_COLUMNS, flags = PART_DATA[o + 5], parentClass = PART_DATA[o + 6], find = PART_DATA[o + 4], id = PART_DATA[o + 1];
    var panel = null;
    for (var i = 0; i < 2 && !panel; i++) {
      var parent = PART_DATA[o + 2 + i];
      if (parent === "") break;
      var holder = parent === "root" ? root : held[parent];
      if ((flags & 1) && parent !== "root" && !valid(holder)) { panel = null; continue; }
      if (parentClass && !holder.BHasClass(parentClass)) { panel = null; continue; }
      panel = find === 2 ? holder.Children().filter(function (child) { return child.BHasClass(PART_DATA[o + 7]); })[0]
        : find === 1 ? holder.FindChildTraverse(id) : holder.FindChild(id);
    }
    return (flags & 16) ? panel || null : panel;
  }
  // ====== DISCOVERY: carrier lineage and class classification ======
  function discoverCarriers() {
    carriers = []; ancestry = []; classSources = {};
    for (var panel = root, depth = 0; valid(panel) && depth < ANCESTRY_DEPTH; depth++) {
      var parent = panel.GetParent();
      ancestry.push({ panel: panel, parent: parent });
      if (allClasses.some(function (name) { return has(panel, name); })) carriers.push(panel);
      panel = parent;
    }
  }
  function carriersValid() {
    return ancestry.length && ancestry.every(function (entry) { return valid(entry.panel) && entry.panel.GetParent() === entry.parent; });
  }
  function criticalOutline(config, side) {
    var value = config && config.side[side];
    return !value || value.barOutlineEnabled && !value.barOutlineCustomColor;
  }
  function openUnitClasses(config) {
    if (!config || !config.shared.enabled) return [];
    return (config.side.enemy.objectiveEnabled || config.side.ally.objectiveEnabled ? objectiveClasses : []).concat(
      config.shared.neutralEnabled ? npcClasses : []);
  }
  function wakeCarriers() {
    var openKinds = openUnitClasses(settings);
    var eligible = settings && settings.shared.enabled && kind && kind.eligible;
    // A player's four nonneutral NPC tags never change its ownership (classify needs !player or a
    // boss tag for npc), and the root carrier is re-probed by any() each second anyway. Neutral and
    // boss facts stay in the wake list.
    var activeWake = kind && kind.kind === "player" ? allClasses.filter(function (name) {
      return npcClasses.slice(0, 4).indexOf(name) < 0;
    }) : allClasses;
    // Every fifth dormant check probes kind tags on the existing ancestry,
    // replacing (not adding to) relation probes. Split late facts wake in <=5s;
    // closed gates pay no extra calls and the 1s player wake remains intact.
    if (status.state === "dormant" && openKinds.length) dormantChecks++;
    else dormantChecks = 0;
    var unitWake = dormantChecks && dormantChecks % DORMANT_PROBE_EVERY === 0 ? openKinds
      : openKinds.length ? ["enemy", "friend"].concat(neutralClasses.slice(0, 4)) : [];
    var wake = eligible ? activeWake
      : kind && kind.kind === "player" && kind.side === "unknown" ? playerClasses.concat(["enemy", "friend"]) : playerClasses.concat(unitWake);
    if (!criticalOutline(settings, kind && kind.side)) wake = wake.filter(function (name) {
      return name !== "health_critical" && name !== "ShowCriticalState";
    });
    for (var i = 0; i < ancestry.length; i++) {
      var panel = ancestry[i].panel;
      if (carriers.indexOf(panel) < 0 && wake.some(function (name) { return has(panel, name); })) carriers.push(panel);
    }
  }
  // Pure over a class predicate so the menu preview classifies exactly like world bars.
  function classifyWith(anyOf, enabled, owned, config) {
    var player = anyOf(["player"]) || anyOf(["CLASS_PLAYER"]);
    // Closed gates with no inline restoration need only a cheap player wake-up probe.
    if (!player && !owned && !anyOf(openUnitClasses(config))) return { signature: "nonplayer", kind: "unknown", relation: "unknown", eligible: false };
    var neutral = anyOf(["team_neutral"]) || (enabled && anyOf(neutralClasses.slice(1)));
    var enemy = anyOf(["enemy"]), friend = anyOf(["friend"]);
    var local = player && enabled && anyOf(["LocalPlayer"]);
    var side = neutral ? "neutral" : friend ? "ally" : enemy ? "enemy" : "unknown";
    // With no open gate for this relation, kind cannot change ownership.
    if (!player && config && (neutral ? !config.shared.neutralEnabled : !config.side[side] ||
        !config.side[side].objectiveEnabled))
      return { signature: ["closed", neutral, enemy, friend].join("|"), kind: "unknown", side: side, relation: side, eligible: false };
    var boss = enabled && anyOf(bossClasses);
    var objective = boss && anyOf(objectiveClasses);
    var npc = !objective && (!player || boss) && anyOf(npcClasses);
    var unitKind = objective ? "objective" : player ? "player" : npc ? "npc" : "unknown";
    var eligible = unitKind !== "unknown" && !local && !(player && npc);
    if (neutral) eligible = eligible && unitKind === "npc" && !!(config && config.shared.neutralEnabled);
    else {
      eligible = eligible && enemy !== friend;
      // Only objectives have a gate here; other NPC bars are never customized (Customize NPC bars removed 2026-10-29).
      if (unitKind !== "player") eligible = eligible && unitKind === "objective" && !!(config && config.side[side] &&
        config.side[side].objectiveEnabled);
    }
    // Closed unit gates need no team, spectator or critical-style probes. Relation
    // and kind still recheck each second so recycling into an open gate wakes.
    if (unitKind !== "player" && !eligible) return { signature: [unitKind, neutral, enemy, friend, local].join("|"),
      kind: unitKind, side: side, relation: side, eligible: false };
    var team1 = anyOf(["team1"]), team2 = anyOf(["team2"]), spectating = anyOf(["spectating"]);
    var team = team1 !== team2 ? team1 ? "team1" : "team2" : "unknown";
    var relation = neutral ? "neutral" : spectating && (enemy || friend) && team !== "unknown" ? team : side !== "unknown" ? side : team;
    eligible = eligible && !(team1 && team2);
    var flags = {};
    if (enabled && eligible && criticalOutline(config, side)) stockClasses.forEach(function (name) { flags[name] = anyOf([name]); });
    var base = [unitKind, boss, neutral, enemy, friend, !!local, team1, team2, spectating, eligible].join("|");
    return { signature: base + "|" + JSON.stringify(flags), base: base, flags: flags,
      enemy: enemy, friend: friend, spectating: spectating, team1: team1, team2: team2,
      kind: unitKind, side: side, team: team, relation: relation,
      eligible: eligible };
  }
  function classify() {
    return classifyWith(any, settings && settings.shared.enabled, ledger.some(function (owner) { return owner.owned; }), settings);
  }
  function lineageParent(row) {
    var o = row * ROW_COLUMNS, parent = cache[PART_DATA[o]].GetParent();
    for (var i = 0; i < 2 && PART_DATA[o + 2 + i] !== ""; i++) if (parent === (PART_DATA[o + 2 + i] === "root" ? root : cache[PART_DATA[o + 2 + i]])) return true;
    return false;
  }
  function lineageValid() {
    if (!cache) return false;
    var i, panel;
    for (i = 0; i < LINEAGE_CHAIN.length; i++) if (!valid(cache[PART_DATA[LINEAGE_CHAIN[i] * ROW_COLUMNS]])) return false;
    for (i = 0; i < LINEAGE_CHAIN.length; i++) if (!lineageParent(LINEAGE_CHAIN[i])) return false;
    for (i = 0; i < LINEAGE_OPTIONAL.length; i++) {
      panel = cache[PART_DATA[LINEAGE_OPTIONAL[i] * ROW_COLUMNS]];
      if (!panel) continue;
      if (!valid(panel) || !lineageParent(LINEAGE_OPTIONAL[i])) return false;
    }
    for (i = 0; i < LINEAGE_VALID.length; i++) {
      panel = cache[PART_DATA[LINEAGE_VALID[i] * ROW_COLUMNS]];
      if (panel && !valid(panel)) return false;
    }
    return true;
  }
  function discover() {
    var found = { motion: null, readout: null, anchor: null, row: null, status: null, info: null, stack: null, primary: null, inner: null, fill: null }, i;
    for (i = 0; i < CHAIN_END; i++) found[PART_DATA[i * ROW_COLUMNS]] = findPart(i, found);
    for (i = 0; i < DISCOVER_READY.length; i++) if (!valid(found[PART_DATA[DISCOVER_READY[i] * ROW_COLUMNS]])) return false;
    // Allocation and feedback belong to the PRIMARY inner; never UnitShieldbar.
    // One literal names every key the bar ever stores (baseline key order first), so the long-lived cache read on every tick keeps one
    // fixed-shape object: the table loops below only ASSIGN to these keys, and later code only assigns too (never adds a key).
    var next = { status: null, info: null, stack: null, primary: null, inner: null, fill: null, motion: null, anchor: null, row: null,
      shield: null, armor: null, deferred: null, healing: null, delta: null, lines: null, outline: null, value: null, hpPercent: null,
      name: null, killMarker: null, lineChildren: [], level: null, levelLabel: null, levelNumber: 0, ult: null,
      stamina: null, staminaIcons: [], staminaEmpty: [], staminaPips: [], staminaShown: false, staminaGate: "", staminaLowOn: false, staminaChecked: -Infinity, staminaStale: false, pulseOverlay: null,
      killStreak: null, rejuv: null, rejuvAnchor: null, effects: null,
      pickupIcons: [], pickupInners: [], pickupBorders: [], pickupTracks: [], pickupGlyphs: [], pickupKinds: [],
      pipGrid: null, pipOutline: null, pipEmpty: null, pipShield: null, pipArmor: null, pipFill: null, pipHealing: null, pipDelta: null, pipKillMarker: null,
      ultBackground: null, ultReady: null,
      critical: null, criticalAnchor: null, assassinate: null, assassinateAnchor: null, unkillable: null, unkillableAnchor: null,
      nativeLineCount: null, ultimateAngle: null, bounty: null, bountyAnchor: null, bountyPill: null, bountyValue: null, bountyLooked: false,
      ultimateOverlay: null, ultimateDark: null, ultimateFill: null };
    for (i = 0; i < CHAIN_END; i++) if (!(PART_DATA[i * ROW_COLUMNS + 5] & 32)) next[PART_DATA[i * ROW_COLUMNS]] = found[PART_DATA[i * ROW_COLUMNS]];
    for (i = CHAIN_END; i < STOCK_END; i++) next[PART_DATA[i * ROW_COLUMNS]] = findPart(i, next);
    cache = next;
    // BAR STYLE OLD grid of THIS primary only: a recycled primary keeps its own grid inactive.
    for (i = STOCK_END; i < GRID_END; i++) cache[PART_DATA[i * ROW_COLUMNS]] = findPart(i, cache);
    cachedFacts = null; memo = null; geometry = null; lastGeometry = -Infinity;
    reconcileLines();
    reconcileLevel();
    for (i = GRID_END; i < ULT_END; i++) cache[PART_DATA[i * ROW_COLUMNS]] = findPart(i, cache);
    reconcileStamina();
    reconcileNativeIndicators();
    reconcilePickups();
    return true;
  }
  function lineChildren(parts) {
    return childrenOfKind(parts.lines, ["line_small", "line_large"]);
  }
  // ====== RECONCILE: native line / level / accessory / pickup / stamina parts ======
  function reconcileLines() {
    if (!cache || !settings || !settings.shared.enabled || !kind || !kind.eligible) return;
    if (!valid(cache.lines) || cache.lines.GetParent() !== cache.primary) {
      var container = cache.primary.FindChild("UnitHealthbarLines");
      if (container !== cache.lines) {
        cache.lines = container; cache.lineChildren = []; lastProbe = ""; lastFull = -Infinity;
      }
    }
    var side = sideConfig(settings, kind);
    var next = side && side.linesVisible && side.lineColorEnabled && kind.side !== "neutral" && !kind.spectating ? lineChildren(cache) : [];
    if (childKinds.has(cache.lines)) cache.nativeLineCount = childKinds.get(cache.lines).children.length;
    if (next.length !== cache.lineChildren.length || next.some(function (panel, i) { return panel !== cache.lineChildren[i]; })) {
      cache.lineChildren = next; lastProbe = ""; lastFull = -Infinity;
    }
  }
  function levelNumber(panel) {
    var text = valid(panel) ? String(panel.text || "") : "";
    return text.charAt(0) === "{" ? 0 : Number(text.replace(/\D/g, ""));
  }
  function reconcileLevel() {
    if (!cache || !settings || !settings.shared.enabled || !kind || !kind.eligible || kind.kind !== "player" || kind.side !== "enemy" || !settings.side.enemy.levelsVisible) return;
    var number = levelNumber(cache.levelLabel);
    if (number !== cache.levelNumber) { cache.levelNumber = number; lastProbe = ""; lastFull = -Infinity; }
  }
  function reconcileAccessories() {
    if (!cache || !settings || !settings.shared.enabled || !kind || !kind.eligible || kind.kind !== "player") return;
    var changed = false;
    for (var i = 0; i < ACCESSORIES.length; i++) {
      var o = ACCESSORIES[i] * ROW_COLUMNS, key = PART_DATA[o], current = cache[key];
      if ((PART_DATA[o + 5] & 8) && !current) continue;
      var parentKey = PART_DATA[o + 8] || PART_DATA[o + 2], id = PART_DATA[o + 4] === 2 ? "" : PART_DATA[o + 1];
      var parent = parentKey === "root" ? root : cache[parentKey];
      if (valid(current) && current.GetParent() === parent) continue;
      var panel = !valid(parent) ? null : id ? parent.FindChild(id)
        : parent.Children().filter(function (child) { return child.BHasClass(PART_DATA[o + 7]); })[0] || null;
      if (panel !== current) { cache[key] = panel; changed = true; }
    }
    if (changed) { geometry = null; invalidate("probe"); }
  }
  var statusScaleSource = null, statusScaleClasses = [];
  function reconcileNativeIndicators() {
    if (!cache || !settings || !settings.shared.enabled || !kind || !kind.eligible || kind.kind !== "player") return;
    var entries = [["killStreak", ID_KILLSTREAK, cache.ult], ["rejuv", ID_REJUV, cache.rejuvAnchor]];
    var labelChildren = null;
    for (var labelIndex = 0; labelIndex < 3; labelIndex++) {
      var key = STATUS_LABELS[labelIndex];
      if (!cache[key] && labelAtDefault(settings.shared, key)) continue;
      // One native child snapshot resolves all three label/anchor pairs, including
      // newly created replacements; default settings do not take the snapshot.
      if (!labelChildren) labelChildren = root.Children();
      var anchorId = LABEL_ANCHOR_ID[labelIndex], nativeId = LABEL_NATIVE_ID[labelIndex], anchorKey = LABEL_ANCHOR_KEY[labelIndex];
      cache[anchorKey] = labelChildren.filter(function (panel) { return panel.id === anchorId; })[0] || null;
      var native = labelChildren.filter(function (panel) { return panel.id === nativeId; })[0] || null;
      entries.push([key, nativeId, cache[anchorKey], native]);
    }
    entries.forEach(function (entry) {
      var current = cache[entry[0]], native = entry.length > 3 ? entry[3] : root.FindChild(entry[1]);
      var parent = valid(current) ? current.GetParent() : null;
      var adopted = parent && ledger.some(function (owner) { return owner.panel === current && owner.key === LEASE_PARENT && owner.owned && owner.value === parent; });
      var next = native || (parent && (parent === entry[2] || adopted) ? current : null);
      if (next !== current) {
        cache[entry[0]] = next; invalidate("facts");
      }
    });
  }
  // World pickups are native StatusEffect panels, not timer snapshots. Sample on
  // v2's existing 3s cadence; native progress clips/images/visibility remain engine-owned.
  function pickupParts(container, samples) {
    var result = emptyPickups();
    if (!valid(container)) return result;
    pickupClasses.forEach(function (name, bit) {
      container.FindChildrenWithClassTraverse(name).forEach(function (panel) {
        if (panel.visible === false) return;
        var entry = pickupEntries.get(panel);
        if (!entry || entry.id !== panel.id) {
          entry = samples && samples.filter(function (sample) { return sample.icon === panel; })[0] || {};
          entry.id = panel.id; pickupEntries.set(panel, entry);
        }
        if (!entry.inner || !valid(entry.inner) || !valid(entry.border) || !valid(entry.track) || entry.glyphs.some(function (glyph) { return !valid(glyph); })) {
          entry.inner = panel.FindChildTraverse("StatusEffectInner");
          entry.border = panel.FindChildTraverse("StatusEffectsBorder");
          entry.track = panel.FindChildTraverse("StatusEffectCooldownOverlay");
          entry.glyphs = panel.FindChildrenWithClassTraverse("statusEffectImage");
          var image = panel.FindChildTraverse("StatusEffectImage");
          if (valid(image) && entry.glyphs.indexOf(image) < 0) entry.glyphs.push(image);
        }
        result.pickupIcons.push(panel); result.pickupInners.push(entry.inner); result.pickupBorders.push(entry.border);
        result.pickupTracks.push(entry.track);
        result.pickupKinds.push(bit);
        Array.prototype.push.apply(result.pickupGlyphs, entry.glyphs);
      });
    });
    return result;
  }
  function reconcilePickups() {
    if (!cache) return;
    var effects = root.FindChild("StatusEffects");
    // The whole-row move (styles.effects) targets this panel: a replaced row is adopted on this 3 s pass.
    if ((valid(effects) ? effects : null) !== cache.effects) {
      cache.effects = valid(effects) ? effects : null; invalidate("facts");
    }
    var container = valid(effects) ? effects.FindChildTraverse("StatusEffectContainer") : null;
    var next = kind && kind.kind === "player" && kind.eligible && settings && settings.shared.pickupTimersEnabled && timerFacts.pickupAllowed ? pickupParts(container)
      : emptyPickups();
    var changed = Object.keys(next).some(function (key) {
      return next[key].length !== cache[key].length || next[key].some(function (value, i) { return value !== cache[key][i]; });
    });
    if (changed) {
      Object.keys(next).forEach(function (key) { cache[key] = next[key]; });
      invalidate("facts");
    }
    lastPickups = Date.now();
  }
  function staminaWanted(carrier, config) {
    if (!config || !config.shared.enabled || !carrier || !carrier.eligible || carrier.kind !== "player" ||
        (carrier.side !== "enemy" && carrier.side !== "ally")) return false;
    var side = config.side[carrier.side];
    return side.staminaColorEnabled || side.staminaShape !== "arrow" || side.staminaWidth !== DEFAULT_STAMINA_WIDTH || side.staminaHeight !== DEFAULT_STAMINA_HEIGHT ||
      side.staminaOffsetX !== 0 || side.staminaOffsetY !== 0;
  }
  // Low stamina (ticket 35) needs Custom stamina color; threshold 0 is off.
  function staminaLow(carrier, config) {
    return staminaWanted(carrier, config) && config.side[carrier.side].staminaColorEnabled && config.side[carrier.side].staminaLowThreshold > 0;
  }
  // Arrows always read their charge states. Shapes read them only for low stamina; otherwise CSS owns depletion.
  function staminaProbe(carrier, config) {
    return config.side[carrier.side].staminaShape === "arrow" || staminaLow(carrier, config);
  }
  function staminaParts(container, probe) {
    var icons = [], empty = [], pips = [];
    function collect(parent) {
      var children = valid(parent) ? parent.Children() : [], previous = childKinds.get(parent);
      var same = previous && previous.key === "stamina" && children.length === previous.children.length &&
        children.every(function (panel, i) { return panel === previous.children[i]; });
      var matches = same ? previous.parts : children.map(function (panel) { return panel.BHasClass("StaminaPipIcon"); });
      if (parent && !same) childKinds.set(parent, { key: "stamina", children: children, parts: matches });
      children.forEach(function (panel, i) {
        if (!matches[i]) { collect(panel); return; }
        icons.push(panel); pips.push(parent);
        empty.push(probe && ["PipEmpty", "StaminaRecentlyUsed", "StaminaRecentlyDepleted"].some(function (name) {
          return panel.BHasClass(name) || parent.BHasClass(name);
        }));
      });
    }
    if (valid(container)) collect(container);
    return { icons: icons, empty: empty, pips: pips };
  }
  function keepStamina(container, next) {
    cache.stamina = container; cache.staminaIcons = next.icons; cache.staminaEmpty = next.empty; cache.staminaPips = next.pips;
    invalidate("probe");
  }
  // Low stamina counts the stock empty marker only: stock draws an empty charge from `.StaminaPip.PipEmpty`
  // and nothing else, so the count matches what the game shows and one read per pip covers every input.
  // Arrows and shapes without low stamina keep the wider six-class rule in staminaParts.
  // Callers pass pips they have just validated (sampleStamina) or collected (the preview painter).
  function pipEmpties(pips) {
    return pips.map(function (pip) { return pip.BHasClass("PipEmpty"); });
  }
  // The game shows charges only after a dash (stock `.StaminaRecentlyUsed .StaminaPip`). The class sits on an
  // ancestor of the pips; the preview puts it on the container, so check the container, then the window root.
  // Once one of them has shown it, only that one is checked.
  function staminaShowing(container) {
    if (cache && cache.staminaGate) return (cache.staminaGate === "root" ? root : container).BHasClass("StaminaRecentlyUsed");
    var found = container.BHasClass("StaminaRecentlyUsed") ? "container" : root.BHasClass("StaminaRecentlyUsed") ? "root" : "";
    if (found && cache) cache.staminaGate = found;
    return !!found;
  }
  function reconcileStamina() {
    if (!cache || !staminaWanted(kind, settings)) return;
    var low = staminaLow(kind, settings);
    // Low stamina reads charge states in sampleStamina at bar cadence and checks every pip it reads, so the
    // structure walk (container, pips, icons) runs every 3 s like pickups, or at once when a read pip is gone.
    if (low && cache.staminaLowOn && valid(cache.stamina) && !cache.staminaStale && Date.now() - cache.staminaChecked < STAMINA_STRUCTURE_MS) return;
    var container = root.FindChild("StaminaContainer");
    var next = staminaParts(container, staminaProbe(kind, settings) && !low);
    var same = cache.stamina === container && next.icons.length === cache.staminaIcons.length &&
      next.icons.every(function (panel, i) { return panel === cache.staminaIcons[i] && next.pips[i] === cache.staminaPips[i]; });
    if (!same) cache.staminaGate = "";
    // A new pip tree or turning low stamina on keeps no old states; the next shown update reads them all.
    if (low && same && cache.staminaLowOn) next.empty = cache.staminaEmpty;
    cache.staminaLowOn = low; cache.staminaChecked = Date.now(); cache.staminaStale = false;
    if (!same || next.empty.some(function (value, i) { return value !== cache.staminaEmpty[i]; })) keepStamina(container, next);
  }
  // Low stamina at bar cadence: the show check, and one PipEmpty read per pip while the game shows the
  // charges. Hidden charges are not read: nobody sees their color.
  function sampleStamina() {
    if (!valid(cache.stamina) || !cache.staminaPips.length) return;
    var shown = staminaShowing(cache.stamina);
    cache.staminaShown = shown;
    // HPV3_DEBUG debugFastTicks++; if (!shown) debugFastSkipped++; else debugFastReads += cache.staminaPips.length;
    if (!shown) return;
    if (!cache.staminaPips.every(valid)) { cache.staminaStale = true; rediscover = true; return; }
    var empty = pipEmpties(cache.staminaPips);
    if (empty.some(function (value, i) { return value !== cache.staminaEmpty[i]; }))
      keepStamina(cache.stamina, { icons: cache.staminaIcons, pips: cache.staminaPips, empty: empty });
  }
  // ====== SAMPLING: geometry and layer probes read from the live panels ======
  function measurement(panel) { return { valid: valid(panel) }; }
  function css(panel, key, axis, sample) {
    sample = sample || measurement(panel);
    if (!sample.valid) return 0;
    axis = axis || "x";
    if (sample[axis] === undefined) sample[axis] = Number(panel["actualuiscale_" + axis]);
    var scale = sample[axis];
    if (!(scale > 0)) {
      if (sample.x === undefined) sample.x = Number(panel.actualuiscale_x);
      scale = sample.x;
    }
    var value = Number(panel[key]);
    var result = value / scale;
    return Number.isFinite(result) && Math.abs(result) < MAX_MEASUREMENT && scale > 0 ? result : 0;
  }
  function dimensions(panel) {
    var sample = measurement(panel);
    return { width: css(panel, "actuallayoutwidth", "x", sample), height: css(panel, "actuallayoutheight", "y", sample),
      x: css(panel, "actualxoffset", "x", sample), y: css(panel, "actualyoffset", "y", sample) };
  }
  // v2's full-canvas stock origins; capture extent only when all contributors are laid.
  // Keep the original size across our own scale/offset writes, retrying on the existing cadence.
  function accessory(panel, g, left) {
    if (!valid(panel)) return null;
    var size = accessoryBounds.get(panel);
    if (!size && g.stack.width > 0 && g.stack.height > 0 && g.primary.width > 0 && g.primary.height > 0) {
      var measured = dimensions(panel);
      if (measured.width > 0 && measured.height > 0) { size = measured; accessoryBounds.set(panel, size); }
    }
    return size ? { width: size.width, height: size.height,
      x: left + (g.canvas.width - STOCK_CANVAS_WIDTH) / 2, y: STOCK_ACCESSORY_CENTER_Y - (size.height + STOCK_ACCESSORY_PAD) / 2 } : null;
  }
  // Live 6779: opacity-0 (fading) panels report width 0. Like v2 applyPlayerName/positionReadout,
  // keep the last laid size; a panel never laid reports 0 and its placement waits.
  function laid(panel) {
    var sample = measurement(panel), size = { width: css(panel, "actuallayoutwidth", "x", sample), height: css(panel, "actuallayoutheight", "y", sample) };
    if (size.width > 0 && size.height > 0) laidSizes.set(panel, size);
    else if (panel && laidSizes.has(panel)) size = laidSizes.get(panel);
    return size;
  }
  // v2 widens the captured inline #name max-width (170 stylesheet fallback). Read once per panel at its
  // first geometry sample, which always precedes ownership: a new module or carrier releases first.
  function nameBase(panel) {
    if (!panel) return STOCK_NAME_MAX_WIDTH;
    if (!nameBases.has(panel)) nameBases.set(panel, valid(panel) ? parseFloat(String(panel.style.maxWidth || "")) : NaN);
    var value = nameBases.get(panel);
    return Number.isFinite(value) ? value : STOCK_NAME_MAX_WIDTH;
  }
  function geometryOf(canvas, parts) {
    var canvasSample = measurement(canvas), statusSample = measurement(parts.status), infoSample = measurement(parts.info);
    var g = { canvas: { width: css(canvas, "actuallayoutwidth", "x", canvasSample), height: css(canvas, "actuallayoutheight", "y", canvasSample) },
      status: { x: css(parts.status, "actualxoffset", "x", statusSample), y: css(parts.status, "actualyoffset", "y", statusSample) },
      info: { x: css(parts.info, "actualxoffset", "x", infoSample), y: css(parts.info, "actualyoffset", "y", infoSample) },
      stack: dimensions(parts.stack), primary: dimensions(parts.primary), inner: dimensions(parts.inner),
      name: laid(parts.name) };
    g.name = { width: g.name.width, height: g.name.height, maxWidth: nameBase(parts.name) };
    g.level = accessory(parts.level, g, 27);
    g.ult = accessory(parts.ult, g, 50);
    return g;
  }
  function sampleGeometry() {
    var next = geometryOf(root, cache);
    if (!geometry || next.inner.width > 0) geometry = next;
    lastGeometry = Date.now(); settleGeometry = false;
  }
  function signal(panel, layer) {
    // Live 6779 clips carry padding ("rect( 0.0%, 86.6%, 100.0%, 0.0%) "); trim like v2.
    var input = { clip: String(panel.style.clip || "").trim(), width: "", transform: "", preScale: "" };
    var rect = edges(input);
    var percentOnly = rect.length === 4 && rect.every(function (edge) { return /^[+-]?[\d.]+%$/.test(edge); });
    if (!percentOnly) {
      input.width = String(panel.style.width || "").trim();
      input.transform = String(panel.style.transform || "").trim();
      input.preScale = String(panel.style.preTransformScale2d || "").trim();
    }
    var sample = percentOnly && layer ? null : measurement(panel);
    input.fillWidth = sample ? css(panel, "actuallayoutwidth", "x", sample) : 0;
    input.x = sample ? css(panel, "actualxoffset", "x", sample) : 0;
    return input;
  }
  function layerSignal(panel) {
    if (!valid(panel) || !panel.BHasClass("HasHealth")) return null;
    var input = signal(panel, true);
    input.hidden = hiddenLayers.get(panel) || false;
    return input;
  }
  // Visibility can change independently of the live clip. Refresh on full paint
  // or a changed probe, not on every idle percent-clip sample.
  // Returns whether any layer's hidden state changed, i.e. whether the input must be signed again.
  function refreshLayerVisibility(input, parts, keys) {
    var changed = false;
    (keys || ["shield", "armor", "healing", "delta"]).forEach(function (key) {
      var signal = key === "shield" || key === "armor" ? input[key] : input.old && input.old[key];
      if (!signal) return;
      var panel = parts[key], hidden = String(panel.style.visibility || "") === "collapse" || panel.visible === false;
      if (signal.hidden !== hidden) changed = true;
      hiddenLayers.set(panel, hidden); signal.hidden = hidden;
    });
    return changed;
  }
  function signProbe(input) {
    var signature = Object.assign({}, input); delete signature.ultimateAngle; delete signature.bounty; delete signature.signature;
    input.signature = JSON.stringify(signature); return input;
  }
  // BAR STYLE OLD only (v2 layoutOld): the engine draws floor(total/250) lines at 250k/total
  // of #UnitHealthbarLines (IDA 6711 CCitadelHudUtils::UpdateTickBar), none above 50, so the
  // last line yields the HP+shield total without reading HP text. New lines report FLT_MAX
  // layout until laid, so its inline percent position wins; layout is the fallback.
  function oldSignal(parts) {
    var lines = lineChildren(parts), last = lines.length ? lines[lines.length - 1] : null;
    var match = /^(\d+(?:\.\d+)?)%/.exec(last ? String(last.style.position || "").trim() : "");
    var width = 100, x = match ? Number(match[1]) : NaN, count = lines.length;
    if (!(x > 0)) { width = count ? css(parts.lines, "actuallayoutwidth", "x") : 0; x = last ? css(last, "actualxoffset", "x") : NaN; }
    if (!(width > 0 && x > 0)) count = x = width = 0;
    return { count: count, x: x, width: width, healing: layerSignal(parts.healing), delta: layerSignal(parts.delta) };
  }
  function probeOf(parts, sampled, refreshVisibility, old) {
    var input = { fill: signal(parts.fill), innerWidth: css(parts.inner, "actuallayoutwidth"),
      shield: layerSignal(parts.shield), armor: layerSignal(parts.armor), geometry: sampled, level: parts.levelNumber || 0, stamina: parts.staminaEmpty || [],
      pickups: parts.pickupKinds || [], ultimateAngle: parts.ultimateAngle === undefined ? null : parts.ultimateAngle,
      bounty: Number.isSafeInteger(parts.bounty) ? parts.bounty : null,
      row: laid(parts.row) };
    if (old) input.old = oldSignal(parts);
    if (refreshVisibility !== false) refreshLayerVisibility(input, parts);
    return signProbe(input);
  }
  function oldWanted(config, carrier) {
    // BAR STYLE is hero-only (unit bars keep the stock bar), so unit bars never sample the line total.
    return !!(config && config.shared.enabled && config.shared.barStyle === "old" && carrier && carrier.eligible && carrier.kind === "player");
  }
  function probe() { return probeOf(cache, geometry, false); }
  function length(value, width) {
    var match = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%)$/i.exec(value);
    if (!match) return null;
    var number = Number(match[1]);
    return match[2] === "%" ? number / 100 : width > 0 ? number / width : null;
  }
  function edges(input) {
    var clip = /^rect\s*\(([^)]*)\)$/i.exec(input.clip);
    return clip ? clip[1].trim().split(/\s*,\s*|\s+/) : [];
  }
  function fraction(input, innerWidth) {
    var value = innerWidth > 0 ? input.fillWidth / innerWidth : Infinity;
    if (input.x < 0 && innerWidth > 0) value = Math.min(value, (input.fillWidth + input.x) / innerWidth);
    var rect = edges(input);
    if (rect.length === 4) {
      var values = rect.map(function (edge) { return length(edge, input.fillWidth); });
      if (values.every(function (v) { return v !== null; })) value = Math.min(value, values[1] - values[3]);
    }
    var width = length(input.width, innerWidth);
    if (width !== null) value = Math.min(value, width);
    var scales = /\bscale(?:X)?\(\s*([+-]?(?:\d+\.?\d*|\.\d+))/gi, match;
    while ((match = scales.exec(input.transform))) value = Math.min(value, Number(match[1]));
    if (input.preScale.trim()) value = Math.min(value, Number(input.preScale.split(/[,\s]+/)[0]));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  function percentRect(input) {
    var rect = edges(input);
    return rect.length === 4 && !input.width && !input.transform && !input.preScale &&
      rect.every(function (edge) { return /^[+-]?[\d.]+%$/.test(edge); }) ? rect : null;
  }
  // [left, right] fractions of the bar total, or null when the layer shows nothing.
  function layerSpan(input, innerWidth) {
    if (!input || input.hidden) return null;
    var rect = percentRect(input);
    if (rect) {
      var left = Math.max(0, Math.min(1, parseFloat(rect[3]) / 100)), right = Math.max(0, Math.min(1, parseFloat(rect[1]) / 100));
      return parseFloat(rect[2]) > parseFloat(rect[0]) && right > left ? [left, right] : null;
    }
    var span = fraction(input, innerWidth);
    if (!(span > 0)) return null;
    var x = innerWidth > 0 && input.x > 0 ? input.x / innerWidth : 0;
    var clipLeft = edges(input).length === 4 ? length(edges(input)[3], input.fillWidth) : null;
    var start = x + (clipLeft === null ? 0 : clipLeft);
    return [start, start + span];
  }
  function layerRight(input, innerWidth) {
    var span = layerSpan(input, innerWidth);
    return span ? span[1] : -1;
  }
  function oldFacts(input) {
    if (!input.old) return null;
    var old = input.old, spans = {};
    [["shield", input.shield], ["armor", input.armor], ["healing", old.healing], ["delta", old.delta]].forEach(function (entry) {
      var span = layerSpan(entry[1], input.innerWidth);
      // 1e-6 steps like v2 sampleOldLayers; the plan converts with the current line total.
      spans[entry[0]] = span ? [Math.round(span[0] * 1e6) / 1e6, Math.round(span[1] * 1e6) / 1e6] : null;
    });
    return { total: old.count ? old.count * 250 * old.width / old.x : 0, spans: spans, clipped: !!percentRect(input.fill) };
  }
  function factsFrom(carrier, input, signature) {
    var fill = fraction(input.fill, input.innerWidth);
    var excluded = Math.max(0, Math.min(1, Math.max(layerRight(input.shield, input.innerWidth), layerRight(input.armor, input.innerWidth))) - fill);
    var health = fill / Math.max(fill, 1 - excluded);
    return Object.freeze({ signature: signature, eligible: carrier.eligible, kind: carrier.kind, side: carrier.side, team: carrier.team,
      relation: carrier.relation, flags: carrier.flags, enemy: carrier.enemy, friend: carrier.friend, spectating: carrier.spectating,
      team1: carrier.team1, team2: carrier.team2,
      geometry: input.geometry, row: input.row, level: input.level, stamina: input.stamina, pickups: input.pickups,
      ultimateAngle: input.ultimateAngle, bounty: input.bounty === undefined ? null : input.bounty,
      fraction: Number.isFinite(health) ? Math.max(0, Math.min(1, health)) : 0, fillCoverage: fill, laid: input.innerWidth > 0, old: oldFacts(input) });
  }
  function facts(input) {
    if (!cache || !kind) return { eligible: false, signature: "missing" };
    input = input || probe();
    var signature = carrierSignature + "|" + input.signature;
    if (!cachedFacts || cachedFacts.signature !== signature) cachedFacts = factsFrom(kind, input, signature);
    return cachedFacts;
  }
  function mix(left, right, amount) {
    var result = "#";
    for (var i = 1; i < 7; i += 2) {
      var a = parseInt(left.slice(i, i + 2), 16), b = parseInt(right.slice(i, i + 2), 16);
      result += ("0" + Math.round(a + (b - a) * amount).toString(16)).slice(-2);
    }
    return result;
  }
  // ====== MODEL: pure plan of one bar from facts + settings (no driver state) ======
  function pixels(value) { return String(Math.round(value * 1000000) / 1000000) + "px"; }
  function translation(x, y) { return "translate3d(" + pixels(x) + ", " + pixels(y) + ", 0px)"; }
  function clamp(value, low, high) { return Math.max(low, Math.min(Math.max(low, high), value)); }
  function anchor(value, size, extent, weight, oversizedCenter) {
    return extent > size ? oversizedCenter ? (size - extent) / 2 + weight * extent : weight * extent : clamp(value, weight * extent, size - (1 - weight) * extent);
  }
  // Ticket 35: editable Amber/Sapphire colors; "" when the team is unknown so callers fall back.
  function teamColor(config, team) {
    return team === "team1" ? config.shared.teamAmberColor : team === "team2" ? config.shared.teamSapphireColor : "";
  }
  function bands(input, config, side, prefix, highColor) {
    var percent = Math.floor(input.fraction * 100), low = config.shared.lowThreshold, high = config.shared.highThreshold;
    var lowColor = side[prefix + "Low"], midColor = side[prefix + "Mid"];
    highColor = highColor || side[prefix + "High"];
    return percent <= low ? lowColor : side[prefix + "Mode"] === "fixed" ? percent <= high ? midColor : highColor
      : percent <= high ? mix(lowColor, midColor, (percent - low) / Math.max(1, high - low))
        : mix(midColor, highColor, (percent - high) / Math.max(1, 100 - high));
  }
  function outlineColor(input) {
    return input.enemy && input.flags.health_critical && input.flags.ShowCriticalState ? "#2F0404"
      : input.enemy || input.side === "neutral" ? "#10130D" : input.friend ? "#042517"
        : input.team === "team1" ? "#937600" : input.team === "team2" ? "#4156A0" : "#10130D";
  }
  function accessoryPlacement(bounds, g, cy, side, config, prefix, lift) {
    var anchored = config.shared.accessoryAnchorEnabled, sx = side.barWidth / STOCK_BAR_WIDTH, sy = side.barHeight / STOCK_BAR_HEIGHT;
    var offsets = prefix === "level" ? side : config.shared;
    var stockY = bounds.y + bounds.height / 2;
    var x = bounds.x + g.primary.width * (1 - sx) / 2 + offsets[prefix + "OffsetX"] * (anchored ? 1 : sx) + (anchored ? side.barOffsetX : 0);
    var y = (anchored ? stockY + side.barOffsetY - (lift || 0) : cy + (stockY - cy) * sy) +
      offsets[prefix + "OffsetY"] * (anchored ? 1 : sy) - bounds.height / 2;
    return { marginLeft: pixels(x), marginTop: pixels(y) };
  }
  function pulseClasses(intensity, overlay) {
    return { HPColorsV3Pulse: !overlay, HPColorsV3ColorPulse: !!overlay,
      HPColorsV3PulseSubtle: intensity === 0, HPColorsV3PulseIntense: intensity === 2 };
  }
  function plan(input, config, view) {
    if (!config || !config.shared.enabled || !input.eligible || !input.geometry) return EMPTY_PLAN;
    var player = input.kind === "player", neutral = input.side === "neutral";
    var side = sideConfig(config, input), g = input.geometry, row = input.row;
    if (!side) return EMPTY_PLAN;
    // Unit bars (objectives and neutral camps) keep the game's layout and take only colors (user, 2026-10-29:
    // "don't modify the layout to match the player ones"): everything that moves, sizes, styles or reparents
    // below is hero-only. Neutral camps and objectives each have their own HP number options on UNITS
    // (shared neutralHp*/objectiveHp* settings; eligible non-hero bars are only these two kinds).
    var unitHp = player ? "" : neutral ? "neutral" : "objective";
    var colorsEnabled = !player || side.barColorEnabled;
    var w = g.canvas.width || STOCK_CANVAS_WIDTH, h = g.canvas.height || STOCK_CANVAS_HEIGHT;
    var sx = side.barWidth / STOCK_BAR_WIDTH, sy = side.barHeight / STOCK_BAR_HEIGHT;
    var cx = g.status.x + g.info.x + g.stack.x + g.primary.x + g.primary.width / 2;
    var cy = g.status.y + g.info.y + g.stack.y + g.primary.y + g.primary.height / 2;
    var tx = side.barOffsetX + (cx - w / 2) * (1 - sx), ty = side.barOffsetY + (cy - h / 2) * (1 - sy);
    var highColor = side.barColorTeamHigh && teamColor(config, input.team) || side.barColorHigh;
    var color = bands(input, config, side, "barColor", highColor);
    // BAR STYLE: V2 restores the stock masks through one root class; OLD draws 100-HP boxes
    // once the line total is known (count capped like v2: 128 boxes cover the 50-line maximum).
    var style = player ? config.shared.barStyle : "none", old = style === "old", total = old && input.old ? input.old.total : 0;
    var pipCount = total > 0 ? Math.max(0, Math.ceil(total / 100 - 0.05)) : 0;
    if (pipCount > MAX_PIPS || !(g.primary.width > 0)) pipCount = 0;
    var pipRows = pipCount ? Math.min(Math.ceil(pipCount / 10), 4) : 0;
    // An unlaid inner under OLD boxes (opacity 0) still has the fill's percent clip.
    var healthKnown = input.laid || !!(pipCount && input.old.clipped);
    // v2's unit surface pulses the bar; only player surfaces pulse/resize HP text.
    var bandColor = color, lowPulse = !neutral && side.pulseEnabled && healthKnown && Math.floor(input.fraction * 100) <= side.pulseThreshold;
    var barPulse = lowPulse && colorsEnabled, textPulse = player && lowPulse && side.hpTextVisible && side.pulseReadout;
    var pulseModifiers = player && lowPulse && side.hpTextVisible && side.pulseReadoutModifiers;
    var pulseHidden = barPulse && side.pulseHideBar;
    var duration = (60 / side.pulseBpm).toFixed(3) + "s";
    if (barPulse && side.pulseColorEnabled && side.pulseColorMode === "fixed") color = side.pulseColor;
    var styles = { outline: {} }, texts = {};
    // Unit bars are never reparented into the motion frame: the native status keeps its stock layout,
    // ui-scale and damage motion, and only inline colors are written.
    if (player) {
      styles.stack = { preTransformScale2d: String(sx) + ", " + String(sy), transform: translation(tx, ty) };
      styles.motion = { transformOrigin: "50% " + String(Math.round(STOCK_MOTION_ORIGIN / h * 1000000) / 1000000) + "%" };
    }
    var classes = { root: { HPColorsV3Core: true, HPColorsV3Layout: player, HPColorsV3BarColored: player && colorsEnabled,
      HPColorsV3BarHidden: player && colorsEnabled && (!side.barVisible || pulseHidden), HPColorsV3Outline: player && side.barOutlineEnabled && !old,
      HPColorsV3HPText: player && side.hpTextVisible, HPColorsV3HPHidden: player && !side.hpTextVisible && input.side === "enemy",
      HPColorsV3NameHidden: player && !side.nameVisible, HPColorsV3BarLines: player, HPColorsV3LinesHidden: player && !side.linesVisible && !old } };
    // V2 masks: the primary container only while unoutlined (live 6782: a mask cannot be cancelled).
    if (style === "original") { classes.root.HPColorsV3BarMask = true; classes.root.HPColorsV3BarMaskPrimary = !side.barOutlineEnabled; }
    if (old) classes.root.HPColorsV3BarOld = true;
    // SHOW BOUNDS (v2 canvasBoundsVisibility): only customized bars outline their canvas.
    if (view && view.showBounds === true) classes.root.HPColorsV3Bounds = true;
    if (pipCount) { classes.root.HPColorsV3BarPips = true; classes.pipGrid = { HPColorsV3PipGridActive: true }; }
    // Damage shake (v2 slots 76/77): one root class swaps the motion frame's keyframes; strength 3
    // is the native wiggle, so the default adds no class. Unit bars keep the native motion.
    if (player && !config.shared.damageShakeEnabled) classes.root.HPColorsV3ShakeOff = true;
    else if (player && config.shared.damageShakeStrength !== DEFAULT_SHAKE_STRENGTH) classes.root["HPColorsV3Shake" + config.shared.damageShakeStrength] = true;
    // Ticket 52: the stylesheet the status row's own layout includes (hp_colors_v3_status.css via citadel_status_effect.xml)
    // scales the game's icon by its class and lets the 32 px row fit it. The script only sets these root classes, so a
    // new icon is drawn at its size at once and no native icon is read or written.
    if (player) {
      if (statusScaleSource !== config.shared) {
        statusScaleSource = config.shared; statusScaleClasses = [];
        for (var fx = 0; fx < STATUS_SCALE_KEYS.length; fx++) {
          var fxScale = Math.round(config.shared[STATUS_SCALE_KEYS[fx]] / 10) * 10;
          if (fxScale > 100 && fxScale <= 250) statusScaleClasses.push("HPColorsV3Fx" + "ABCDEFGH".charAt(fx) + fxScale);
        }
      }
      for (var fxClass = 0; fxClass < statusScaleClasses.length; fxClass++) classes.root[statusScaleClasses[fxClass]] = true;
      if (statusScaleClasses.length > 0) classes.root.HPColorsV3FxOn = true;
    }
    // v2 oldGridLift: anchored level/ultimate badges follow the grid's vertical centre, not the hidden bar's.
    var gridLift = pipRows && config.shared.accessoryAnchorEnabled ? (pipRows * 6 / 2 - g.primary.height / 2 + 2.5) * sy : 0;
    var parents = player ? { status: "motion", name: "motion" } : {};
    if (colorsEnabled) {
      styles.fill = { washColor: neutral ? config.shared.neutralColor : color };
      // Neutral bars only show the bar and the damage delta: the delta follows the enemy side
      // (GameBanana report 2026-10-27; user 2026-10-28). Healing and shields stay stock there.
      styles.delta = { washColor: side.barDeltaColor };
      if (!neutral) {
        styles.healing = { washColor: side.barHealingColor };
        styles.shield = { backgroundColor: side.barShieldColor }; styles.armor = { backgroundColor: side.barArmorColor };
        // Deferred damage (Shiv Bloodletting, Nurse Vapors): stock wash rgb(232, 127, 61) on every side.
        styles.deferred = { washColor: side.barDeferredColor };
      }
    }
    if (barPulse) {
      Object.assign(styles.fill, { animationDuration: duration, animationName: "" });
      classes.fill = pulseClasses(side.pulseIntensity, false);
      if (side.pulseColorEnabled && side.pulseColorMode === "gradient") {
        classes.pulseOverlay = pulseClasses(side.pulseIntensity, true);
        styles.pulseOverlay = { washColor: side.pulseColor, animationDuration: duration,
          clip: "rect(0%, " + Math.max(0, input.fillCoverage * 100) + "%, 100%, 0%)" };
      }
    }
    // OLD releases line color/opacity: the fallback gaps and the boxes have their own look.
    if (player && side.linesVisible && !input.spectating && !old) {
      if (side.lineOpacity !== DEFAULT_LINE_OPACITY) styles.lines = { opacity: String(side.lineOpacity / 100) };
      if (side.lineColorEnabled) styles.lineWash = { washColor: side.lineColor };
    }
    var markerGate = player && side.barColorEnabled && side.barVisible && !pulseHidden && side.killMarkerEnabled;
    var markerWanted = markerGate && !pipCount && g.inner.width > 0;
    classes.root.HPColorsV3KillMarker = !!markerWanted;
    if (markerWanted) {
      var markerWidth = Math.min(g.inner.width, Math.max(1, side.killMarkerWidth));
      var markerX = clamp(g.inner.x + g.inner.width * side.killMarkerThreshold / 100 - markerWidth / 2,
        g.inner.x, g.inner.x + g.inner.width - markerWidth);
      styles.killMarker = { width: pixels(markerWidth), marginLeft: pixels(markerX), backgroundColor: side.killMarkerColor };
    }
    var oldPlan = null;
    if (pipCount) {
      // Raw engine fractions times the line total (fill and layers share it); never the
      // shield-corrected health. HP snaps to 0.1 so clip float dust cannot light a box.
      var hpOf = function (value) { return Math.round(value * total * 10) / 10; };
      var layerColor = function (part, key) { return styles[part] && styles[part][key] || ""; };
      oldPlan = { count: pipCount, max: total, hp: hpOf(input.fillCoverage), primaryWidth: g.primary.width,
        fill: styles.fill ? styles.fill.washColor : "", layers: [], outline: null, marker: null };
      [["shield", "backgroundColor"], ["armor", "backgroundColor"], ["healing", "washColor"], ["delta", "washColor"]].forEach(function (entry) {
        var span = input.old.spans[entry[0]];
        oldPlan.layers.push({ left: span ? hpOf(span[0]) : -1, right: span ? hpOf(span[1]) : -1, color: layerColor(entry[0], entry[1]) });
      });
      if (side.barOutlineEnabled) oldPlan.outline = { thickness: side.barOutlineThickness, opacity: String(side.barOutlineOpacity / 100),
        color: side.barOutlineCustomColor ? side.barOutlineColor : outlineColor(input) };
      if (markerGate) oldPlan.marker = { hp: total * side.killMarkerThreshold / 100, width: Math.max(1, side.killMarkerWidth), color: side.killMarkerColor };
    }
    if (player) {
      // Like the rejuvenator, move an owned full-canvas anchor, not the native
      // animated tag. Zero offsets leave native parent, styles and animations untouched.
      STATUS_LABELS.forEach(function (key) {
        if (!config.shared[key + "IndicatorVisible"]) styles[key] = { visibility: "collapse" };
        var x = config.shared[key + "OffsetX"], y = config.shared[key + "OffsetY"];
        if (x || y) {
          parents[key] = key + "Anchor";
          styles[key + "Anchor"] = { transform: translation(side.barOffsetX + x, side.barOffsetY + y) };
        }
      });
      var levelShown = side.levelsVisible && input.level > 0;
      classes.root.HPColorsV3Level = !!levelShown;
      if (levelShown) {
        var tierColor = input.level >= 35 ? "#8b0000" : input.level >= 27 ? "#e53935" : input.level >= 19 ? "#ff8c00" : input.level >= 11 ? "#f0d000"
          : relationStock[input.team] || relationStock.team1;
        styles.level = { border: "2px solid " + tierColor };
        if (g.level) Object.assign(styles.level, accessoryPlacement(g.level, g, cy, side, config, "level", gridLift));
      }
      var ultPlaced = sx !== 1 || sy !== 1 || gridLift || config.shared.ultOffsetX || config.shared.ultOffsetY ||
        config.shared.accessoryAnchorEnabled && (side.barOffsetX || side.barOffsetY);
      classes.root.HPColorsV3UltPlaced = !!ultPlaced;
      if (ultPlaced && g.ult) styles.ult = accessoryPlacement(g.ult, g, cy, side, config, "ult", gridLift);
      if (config.shared.ultimateTimerEnabled) styles.ultBackground = { preTransformScale2d: String(config.shared.ultSize / 20) };
      if (side.barColorEnabled) {
        styles.ultBackground = styles.ultBackground || {};
        styles.ultBackground.opacity = !side.barVisible || pulseHidden ? "0.01" : "1";
      }
      if (config.shared.ultMode === "custom" || side.barColorEnabled)
        styles.ultReady = { washColor: config.shared.ultMode === "custom" ? config.shared.ultCustom : color };
      parents.killStreak = { parent: "ult", before: "ultBackground" };
      classes.ult = { HPColorsV3KillStreakOwner: true };
      classes.killStreak = { HPColorsV3KillStreakAdopted: true };
      if (config.shared.ultimateTimerEnabled) styles.killStreak = { preTransformScale2d: String(config.shared.ultSize / 20) };
      var angle = input.ultimateAngle;
      classes.root.HPColorsV3UltimateProgress = config.shared.ultimateTimerEnabled && angle !== null && angle !== undefined;
      if (classes.root.HPColorsV3UltimateProgress) {
        var mode = config.shared.ultimateTimerColorMode;
        var progressColor = mode === "follow" ? "#FFFFFF" : mode === "fixed" ?
          config.shared.ultimateTimerUnavailableColor : mix(config.shared.ultimateTimerUnavailableColor, config.shared.ultimateTimerAvailableColor, angle / 360);
        styles.ultimateOverlay = { visibility: "visible", washColor: mode === "follow" ? config.shared.ultMode === "custom" ? config.shared.ultCustom :
          side.barColorEnabled ? color : "#FFFFFF" : "#FFFFFF" };
        styles.ultimateFill = { washColor: progressColor, clip: "radial(50% 50%, 0deg, " + angle + "deg)" };
        styles.ultimateDark = { washColor: progressColor, brightness: String(Math.max(0, 1 - config.shared.ultimateTimerDarkness / 100)) };
      }
      // Live 6839 (user, 2026-11-02): moving each pickup icon left the other status effects in place and a
      // pickup moved below its own row was clipped away. The whole native status-effect row moves instead,
      // following the bar, plus the pickup offsets. It sits at the canvas top, and a panel drawn above its
      // parent's top edge is never shown, so it never moves up past its native place.
      var effectsX = side.barOffsetX + (config.shared.pickupTimersEnabled ? config.shared.pickupOffsetX : 0);
      // Relative to the default bar offset (schema barOffsetY -3.8), so the default look leaves the row in place.
      var effectsY = side.barOffsetY - DEFAULT_BAR_OFFSET_Y + (config.shared.pickupTimersEnabled ? config.shared.pickupOffsetY : 0);
      effectsY = Math.round(effectsY * 1000) / 1000;
      if (effectsX || effectsY > 0) styles.effects = { transform: translation(clamp(effectsX, -w / 2, w / 2), Math.max(0, effectsY)) };
      parents.rejuv = "rejuvAnchor";
      styles.rejuvAnchor = { transform: translation(config.shared.rejuvOffsetX, config.shared.rejuvOffsetY) };
      styles.rejuv = { transform: "rotateZ(" + config.shared.rejuvTilt + "deg)",
        preTransformScale2d: String(Math.round(config.shared.rejuvSize / 24 * 1000000) / 1000000) };
      // Ticket 50: kill bounty pill under enemy hero bars, kept inside the bar canvas (a panel drawn
      // outside its parent's rect is never shown). The topbar computes the value; this only places it.
      if (config.shared.killBountyEnabled && input.enemy && Number.isSafeInteger(input.bounty) && input.bounty >= 0) {
        classes.root.HPColorsV3KillBounty = true;
        // Size scales the whole pill by ui-scale (laid out again, so the number stays sharp), growing down from
        // its top centre; the canvas clamps grow with it. Tilt turns the pill about its own centre.
        var bountyScale = config.shared.killBountySize / 17;
        var bountyX = clamp(side.barOffsetX + config.shared.killBountyOffsetX, 34 * bountyScale - w / 2, w / 2 - 34 * bountyScale);
        var bountyY = clamp(cy + side.barOffsetY + g.primary.height * sy / 2 + 3 + config.shared.killBountyOffsetY, 0, h - 24 * bountyScale);
        styles.bountyAnchor = { transform: translation(bountyX, bountyY) };
        styles.bountyPill = {};
        if (bountyScale !== 1) styles.bountyPill.uiScale = Math.round(bountyScale * 1000) / 10 + "%";
        if (config.shared.killBountyTilt) styles.bountyPill.transform = "rotateZ(" + config.shared.killBountyTilt + "deg)";
        texts.bountyValue = String(input.bounty).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }
      if (config.shared.pickupTimersEnabled) {
        // Pickups keep the game's status-effect size (user, 2026-11-02: "same size as the status effects") and the
        // row's own gaps (user, 2026-11-02: the status effects on the health bar should not be separated);
        // pickupSize and pickupSpacing size only the top-bar pickup icons.
        styles.pickupBorders = { washColor: "#FFEFD7" };
        styles.pickupInners = (input.pickups || []).map(function (bit) { return { washColor: config.shared[pickupColors[bit]] }; });
        // Stock CooldownOverlay is blank for pickups. Give it the border artwork as a
        // full track below the engine-clipped progress ring; the ledger releases every write.
        styles.pickupTracks = (input.pickups || []).map(function (bit) {
          return { washColor: mix("#000000", config.shared[pickupColors[bit]], 1 - config.shared.pickupBackgroundDarkness / 100).toUpperCase(),
            backgroundImage: 'url("s2r://panorama/images/hud/world_space/status_border.vsvg")',
            backgroundTextureSize: "48px", backgroundSize: "100%", zIndex: "-3", clip: "none" };
        });
        styles.pickupGlyphs = { washColor: config.shared.pickupGlyphColor };
      }
      if (staminaWanted(input, config)) {
        var shaped = side.staminaShape !== "arrow", widthOwned = side.staminaWidth !== DEFAULT_STAMINA_WIDTH, heightOwned = side.staminaHeight !== DEFAULT_STAMINA_HEIGHT;
        var colored = side.staminaColorEnabled, charges = input.stamina || [];
        var fillColor = colored && side.staminaColorMode === "team" && teamColor(config, input.team) || side.staminaColor;
        var filled = charges.filter(function (empty) { return !empty; }).length;
        var lowStamina = colored && side.staminaLowThreshold > 0 && charges.length > 0 && filled <= side.staminaLowThreshold;
        var chargeColor = lowStamina ? side.staminaLowColor : fillColor;
        classes.stamina = { HPColorsV3StaminaCircle: side.staminaShape === "circle", HPColorsV3StaminaBox: side.staminaShape === "box" };
        styles.stamina = {};
        if (side.staminaOffsetX || side.staminaOffsetY) styles.stamina.transform = translation(side.staminaOffsetX, side.staminaOffsetY);
        if (colored) styles.stamina.washColor = shaped ? chargeColor : "#FFFFFF";
        styles.staminaIcons = charges.map(function (empty) {
          var icon = {};
          if (widthOwned || !shaped && heightOwned) icon.width = pixels(shaped ? side.staminaWidth : 8 * side.staminaWidth / 11);
          if (heightOwned || !shaped && widthOwned) icon.height = pixels(shaped ? side.staminaHeight : 12 * side.staminaHeight / 4.48);
          if (!shaped && (widthOwned || heightOwned)) icon.backgroundSize = "100% 100%";
          if (shaped) {
            // "" clears captured native inline colors while CSS owns state.
            icon.backgroundColor = "";
            icon.borderColor = "#FFFFFF";
            icon.washColor = "#FFFFFF";
          // Inline styles cannot use stylesheet macros (live 6793 threw on "offBlack"): #10130D is offBlack.
          } else if (colored) icon.washColor = empty ? "#10130D" : chargeColor;
          return icon;
        });
      }
    }
    if (player && side.barOutlineEnabled && !old) {
      var thickness = side.barOutlineThickness;
      styles.outline.backgroundColor = side.barOutlineCustomColor ? side.barOutlineColor : outlineColor(input);
      styles.outline.opacity = String(side.barOutlineOpacity / 100);
      styles.outline.width = pixels(g.inner.width + 2 * thickness);
      styles.outline.height = pixels(g.inner.height + 2 * thickness);
      styles.outline.transform = translation(g.inner.x - thickness, g.inner.y - thickness);
    }
    if (player && side.hpTextVisible) {
      // Ticket 51: the percent is the bar's health fraction (the bar-color fraction), in an owned label that
      // follows the adopted number in the row. It waits for a known fraction; until then the number shows.
      var hpPercent = healthKnown && (side.hpTextFormat === "both" || side.hpTextFormat === "percent");
      parents.value = hpPercent ? { parent: "row", before: "hpPercent" } : "row";
      // Ticket 35: an unknown team falls back to the bar colors.
      var hpTeam = side.hpTextColorMode === "team" && teamColor(config, input.team);
      var hpColor = hpTeam || (side.hpTextColorMode === "custom"
        ? bands(input, config, side, "hpText", side.hpTextTeamHigh && teamColor(config, input.team)) : bandColor);
      var room = Math.ceil(side.hpTextOutline), align = side.hpTextAlign, q = align === "left" ? 1 : align === "center" ? 0.5 : 0;
      var hpX = pulseModifiers ? side.pulseReadoutOffsetX : side.hpTextOffsetX;
      var hpY = pulseModifiers ? side.pulseReadoutOffsetY : side.hpTextOffsetY;
      var x = anchor(cx + side.barOffsetX + 33.5 + hpX * sx + 2 * (q - 1) * 4, w, row.width, q, false);
      var y = clamp(cy + side.barOffsetY - 8 + hpY * sy, 0, Math.max(0, h - row.height));
      styles.anchor = { width: pixels(w), height: pixels(h) };
      styles.row = { horizontalAlign: align === "left" ? "right" : align === "center" ? "center" : "left" };
      // A row never laid has no extent to clamp; placement waits for its first laid sample (v2).
      if (row.width > 0 && row.height > 0) styles.row.transform = translation(x - q * w, y);
      var hpSize = pulseModifiers ? side.pulseReadoutSize : side.hpTextSize;
      styles.value = { washColor: hpColor, fontFamily: fonts[side.hpTextFont], fontSize: pixels(hpSize),
        padding: "0px " + pixels(room), marginLeft: pixels(-room), marginRight: pixels(-room) };
      if (side.hpTextOutline !== DEFAULT_HP_TEXT_OUTLINE) styles.value.textShadow = "0px 0px 0px " + side.hpTextOutline + " #10130D";
      // Tilt rotates the adopted label only; the row keeps the geometry translate. 0 stays level (CSS).
      if (side.hpTextTilt) styles.value.transform = "rotateZ(" + side.hpTextTilt + "deg)";
      if (textPulse) {
        classes.value = pulseClasses(side.pulseIntensity, false);
        styles.value.animationDuration = duration; styles.value.animationName = "";
      }
      if (hpPercent) {
        var percentOnly = side.hpTextFormat === "percent", percentValue = Math.round(input.fraction * 100);
        percentValue = Math.max(input.fraction > 0 ? 1 : 0, Math.min(100, percentValue));
        classes.root.HPColorsV3HPPercent = true;
        classes.root.HPColorsV3HPPercentOnly = percentOnly;
        texts.hpPercent = (percentOnly ? "" : "/ ") + percentValue + "%";
        // Same look as the number; the gap after it scales with the font. Tilt turns the whole row instead
        // of each label, so the two read as one line.
        styles.hpPercent = { washColor: hpColor, fontFamily: styles.value.fontFamily, fontSize: styles.value.fontSize,
          padding: styles.value.padding, marginLeft: pixels((percentOnly ? 0 : Math.round(0.3 * hpSize)) - room), marginRight: pixels(-room) };
        if (styles.value.textShadow) styles.hpPercent.textShadow = styles.value.textShadow;
        if (side.hpTextTilt) {
          delete styles.value.transform;
          if (styles.row.transform) styles.row.transform += " rotateZ(" + side.hpTextTilt + "deg)";
        }
        if (textPulse) {
          classes.hpPercent = pulseClasses(side.pulseIntensity, false);
          styles.hpPercent.animationDuration = duration; styles.hpPercent.animationName = "";
        }
      }
    } else if (player) {
      // The original label stays in InfoHealthContainer, retaining native show/fade
      // rules. Compensate the original compact frame's 65px top and centered width.
      styles.value = { marginTop: "66px", marginRight: pixels((input.friend ? 20 : 10) + (w - 100) / 2) };
    } else if (unitHp && config.shared[unitHp + "HpPositionEnabled"]) {
      // Unit HP number (neutral camps, objectives): Always show is a root class (world.css keeps unkillable hidden);
      // a custom spot replaces the stock rotateZ(-3deg) on the unmoved stock label, so offsets 0 and tilt -3
      // match the stock spot.
      styles.value = { transform: translation(config.shared[unitHp + "HpOffsetX"], config.shared[unitHp + "HpOffsetY"]) +
        " rotateZ(" + config.shared[unitHp + "HpTilt"] + "deg)" };
    }
    classes.root.HPColorsV3UnitHPAlways = !!unitHp && config.shared[unitHp + "HpTextMode"] === "always";
    var nameRoom = Math.max(2, Math.ceil(side.nameOutline)), nameAlign = side.nameAlign;
    var weight = nameAlign === "left" ? 1 : nameAlign === "center" ? 0.5 : 0;
    // OLD rows grow up from the bar; the first keeps the native name spot (v2 nameRiseWithPips).
    var nameOffsetY = side.nameOffsetY - (player && config.shared.nameRiseWithPips && pipRows > 1 ? (pipRows - 1) * 6 * sy : 0);
    var nameX = anchor(w / 2 + side.nameOffsetX + (2 * weight - 1) * nameRoom, w, g.name.width, weight, true);
    var nameY = clamp(45 + nameOffsetY, 0, Math.max(0, h - g.name.height)) - 45;
    // Customized names are level by CSS (v2 `.WindowRoot #name`); NAME TILT rotates after the offset.
    var nameTilt = config.shared.nameTilt, nameRotation = nameTilt ? "rotateZ(" + nameTilt + "deg)" : "";
    if (player && side.nameVisible && (side.nameAlign !== "center" || side.nameOffsetX || nameOffsetY || nameTilt ||
        side.nameColorEnabled || side.nameSize !== DEFAULT_NAME_SIZE || side.nameOutline !== DEFAULT_NAME_OUTLINE)) {
      // v2 applyPlayerName: the label box and its text grow the same way (stock #name centres both).
      var nameGrowth = nameAlign === "left" ? "right" : nameAlign === "center" ? "center" : "left";
      styles.name = { padding: "2px " + pixels(nameRoom) + " 0px " + pixels(nameRoom), maxWidth: pixels((Number.isFinite(g.name.maxWidth) ? g.name.maxWidth : STOCK_NAME_MAX_WIDTH) + 2 * (nameRoom - 2)),
        horizontalAlign: nameGrowth, textAlign: nameGrowth };
      if (side.nameSize !== DEFAULT_NAME_SIZE) {
        styles.name.fontSize = pixels(side.nameSize); styles.name.maxHeight = pixels(Math.ceil(side.nameSize * 1.5));
      }
      // A name never laid has no extent to clamp; its translate waits for the first laid sample (v2).
      if ((nameAlign !== "center" || side.nameOffsetX || nameOffsetY) && g.name.width > 0 && g.name.height > 0)
        styles.name.transform = translation(nameX - weight * w, nameY) + (nameRotation ? " " + nameRotation : "");
      else if (nameRotation) styles.name.transform = nameRotation;
      if (side.nameColorEnabled) styles.name.color = (side.nameColorMode === "team" && teamColor(config, input.team) || side.nameColor) + (input.spectating ? "80" : "");
      if (side.nameOutline !== DEFAULT_NAME_OUTLINE) styles.name.textShadow = "0px 0px 0px " + side.nameOutline + " #10130Dee";
    }
    return { styles: styles, classes: classes, parents: parents, texts: texts, old: oldPlan,
      settle: !!(levelShown && !g.level || ultPlaced && !g.ult) };
  }
  // The memo key both paint paths (tick's memoisedPlan and the timer-fact fast path in setTimerFacts) use; timer facts are not in it.
  function memoKey(input) { return input.signature + "|" + epoch + "|" + revision + "|" + showBounds; }
  function memoisedPlan(input) {
    var key = memoKey(input);
    if (!memo || memo.key !== key) { memo = { key: key, value: plan(input, settings, { showBounds: showBounds }) }; status.plansComputed++; }
    return memo.value;
  }
  // ====== LEASE: style property table, write-if-changed, restore, claim and apply of the ledger ======
  // Live 6779: assigning "" fails to parse for some properties (textShadow). Like v2's setStyle,
  // clear with null; shorthand-backed longhands clear their shorthand and rewrite the siblings.
  var STYLE_ALIASES = {
    margin: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
    font: ["fontFamily", "fontSize", "fontStyle", "fontWeight", "fontStretch"],
    animation: ["animationName", "animationDuration", "animationTimingFunction", "animationDelay",
      "animationIterationCount", "animationDirection", "animationFillMode", "animationFrameTime"],
    // Live 6779: borderColor is an alias of border; clearing it alone throws (v2 STYLE_ALIAS_GROUPS).
    border: ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle"],
    // Live 6785: backgroundSize is a layer alias of backgroundImage (panorama.dll: image "combined with
    // background-position, background-size, background-texture-size and background-repeat"); clearing it
    // alone threw on the pickup track release (HERO -> UNITS). Reading backgroundImage back returns the
    // whole layer ("url(...) / 100.0% 100.0% unset unset"), which is not writable, so the layer is cleared
    // whole and nothing is restored. Owners write the layer together (pickup tracks) or own no image
    // (stamina icons keep their stylesheet artwork).
    backgroundImage: [],
  };
  // v2 NAME_STOCK_ALIGN (live): a null alignment clear left a moved name aligned in game. Stock
  // #name has no inline alignment and centres both ways, so release writes that value instead.
  // Live 6782: horizontalAlign is a style alias; clearing it alone throws. The HP row releases to its
  // stylesheet value (world.css #HPColorsV3ReadoutRow, menu.css .HPC3PreviewReadoutLine; v2 1687-1688).
  var EXPLICIT_STOCK = { name: { horizontalAlign: "center", textAlign: "center" }, row: { horizontalAlign: "right" } };
  function aliasBase(key) {
    if (/^margin(Top|Right|Bottom|Left)$/.test(key)) return "margin";
    if (key === "fontSize" || key === "fontFamily") return "font";
    if (key === "animationDuration" || key === "animationName") return "animation";
    if (key === "borderColor") return "border";
    if (key === "backgroundPosition" || key === "backgroundSize" || key === "backgroundTextureSize" || key === "backgroundRepeat") return "backgroundImage";
    return "";
  }
  function writeStyle(panel, key, value) {
    try {
      var base = value === "" ? aliasBase(key) : "";
      if (base) {
        var keep = STYLE_ALIASES[base].map(function (sibling) { return sibling === key ? "" : String(panel.style[sibling] || ""); });
        panel.style[base] = null;
        STYLE_ALIASES[base].forEach(function (sibling, i) { if (keep[i] !== "") panel.style[sibling] = keep[i]; });
      } else panel.style[key] = value === "" ? null : value;
    } catch (error) {
      throw new Error(String(error && error.message || error) + " (" + key + "=" + JSON.stringify(value) + ")");
    }
  }
  // ---- BAR STYLE OLD grid (v2 layoutOldPips/fillOldPips/paintOldLayers/syncOldOutline/
  // syncOldKillMarker), same geometry: 10 boxes per row, first box bottom-left, rows grow up and
  // more than four rows compress into four rows of height. Each layer holds one row panel per
  // 1,000 HP with ten static boxes, so a total change rewrites rows, not every box. Fill and
  // feedback layers clip their rows like the engine clips its own HP layers (stock
  // #unit_healthbar_lagging keeps its .healthbar_border child inside that clip), so a health
  // change rewrites only rows whose clip moved. Boxes are renderer-created children of the owned
  // grid: write-only caches replace the ledger, and the ledger-owned active class shows the grid.
  var PIP_HP = 100, PIPS_PER_ROW = 10, ROW_HP = 1000, PIP_ROW_PX = 6, PIP_TALL_ROWS = 4, PIP_WIDTH_PERCENT = 8.5;
  var PIP_LAYERS = ["Shield", "Armor", "Healing", "Delta"];
  var EMPTY_CLIP = "rect(0%, 0%, 100%, 0%)";
  function oldBoxPosition(index, rows, hp) {
    return (index % PIPS_PER_ROW * 100 / PIPS_PER_ROW + PIP_WIDTH_PERCENT * hp / PIP_HP).toFixed(3) + "% " +
      ((rows - 1 - Math.floor(index / PIPS_PER_ROW)) * 100 / rows).toFixed(3) + "% 0px";
  }
  function oldBoxHeight(rows) { return (80 / rows).toFixed(3) + "%"; }
  // Percent of a row's width at hp HP into that row: whole boxes plus the share of the next.
  function rowX(hp) {
    if (!(hp > 0)) return 0;
    if (hp >= ROW_HP) return 100;
    var column = Math.floor(hp / PIP_HP);
    return column * 100 / PIPS_PER_ROW + PIP_WIDTH_PERCENT * (hp - column * PIP_HP) / PIP_HP;
  }
  function pipReady(parts) {
    return valid(parts.pipGrid) && PIP_PARTS.every(function (name) { return !!parts["pip" + name]; });
  }
  function paintOld(parts, old) {
    if (!old || !pipReady(parts)) return 0;
    var writes = 0, grid = parts.pipGrid, state = grid.HPColorsV3PipState;
    function put(panel, applied, key, value) {
      if (applied[key] === value) return;
      applied[key] = undefined; writeStyle(panel, key, value); applied[key] = value; writes++;
    }
    function create(parent, className) {
      var panel = $.CreatePanel("Panel", parent, "");
      panel.hittest = false; panel.AddClass(className); return panel;
    }
    if (!state || state.empty !== parts.pipEmpty) {
      // A lost cache (script reinclusion) must not leave an orphaned second set of boxes.
      PIP_PARTS.forEach(function (name) { if (name !== "KillMarker") parts["pip" + name].RemoveAndDeleteChildren(); });
      state = grid.HPColorsV3PipState = { empty: parts.pipEmpty, layers: {}, applied: {}, grid: {}, layout: "", spans: {}, outline: "", marker: "" };
      PIP_PARTS.forEach(function (name) { state.applied[name] = {}; });
    }
    var count = old.count, rows = Math.ceil(count / PIPS_PER_ROW), layout = count + ":" + old.max;
    // A layer's rows are created on first use; each box keeps its column for life.
    function layer(name, wanted, rim) {
      var entry = state.layers[name];
      if (!entry) { if (!wanted) return null; entry = state.layers[name] = { rows: [], shown: -1 }; }
      while (entry.rows.length < rows) {
        var row = { panel: create(parts["pip" + name], "HPColorsV3PipRow"), applied: {}, boxes: [] };
        for (var c = 0; c < PIPS_PER_ROW; c++) {
          var item = { panel: create(row.panel, rim ? "HPColorsV3PipOutlineBox" : "HPColorsV3Pip"), applied: {} };
          if (!rim) put(item.panel, item.applied, "position", (c * 100 / PIPS_PER_ROW).toFixed(3) + "% 0px 0px");
          row.boxes.push(item);
        }
        entry.rows.push(row);
      }
      // Percent rows move only when the row count changes; rims place their px rows themselves.
      if (!rim && entry.shown !== rows) {
        entry.rows.forEach(function (row, r) {
          put(row.panel, row.applied, "visibility", r < rows ? "visible" : "collapse");
          if (r >= rows) return;
          put(row.panel, row.applied, "position", "0px " + ((rows - 1 - r) * 100 / rows).toFixed(3) + "% 0px");
          put(row.panel, row.applied, "height", (100 / rows).toFixed(3) + "%");
        });
        entry.shown = rows;
      }
      return entry;
    }
    // Show [left, right) HP of the grid total: one clip per row, written only when it moves.
    function clip(name, entry, left, right) {
      var key = layout + ":" + left + ":" + right;
      if (!entry || state.spans[name] === key) return;
      var none = !(right - left > 0.05);
      for (var r = 0; r < rows; r++) {
        var row = entry.rows[r], a = none ? 0 : rowX(left - r * ROW_HP), b = none ? 0 : rowX(right - r * ROW_HP);
        put(row.panel, row.applied, "clip", b - a > 1e-9 ? "rect(0%, " + b.toFixed(3) + "%, 100%, " + a.toFixed(3) + "%)" : EMPTY_CLIP);
      }
      state.spans[name] = key;
    }
    var empty = layer("Empty", true), fill = layer("Fill", true);
    if (state.layout !== layout) {
      put(grid, state.grid, "height", Math.min(rows, PIP_TALL_ROWS) * PIP_ROW_PX + "px");
      for (var r = 0; r < rows; r++) for (var c = 0; c < PIPS_PER_ROW; c++) {
        var index = r * PIPS_PER_ROW + c, item = empty.rows[r].boxes[c], shown = index < count;
        put(item.panel, item.applied, "visibility", shown ? "visible" : "collapse");
        if (shown) put(item.panel, item.applied, "width", (PIP_WIDTH_PERCENT * Math.min(PIP_HP, old.max - index * PIP_HP) / PIP_HP).toFixed(3) + "%");
      }
      state.layout = layout;
    }
    put(parts.pipFill, state.applied.Fill, "washColor", old.fill);
    clip("Fill", fill, 0, old.hp);
    PIP_LAYERS.forEach(function (name, l) {
      var span = old.layers[l], entry = layer(name, span.right - span.left > 0.05);
      if (!entry) return;
      put(parts["pip" + name], state.applied[name], "washColor", span.color);
      clip(name, entry, span.left, span.right);
    });
    // Rims: solid px backers (box ± thickness) under the empty boxes; health never rewrites them.
    // Row panels carry each row's top/height, so a row-count change rewrites rows only.
    var rim = old.outline, outlineKey = rim ? [layout, old.primaryWidth, rim.thickness, rim.opacity, rim.color].join("|") : "off";
    if (state.outline !== outlineKey) {
      put(parts.pipOutline, state.applied.Outline, "visibility", rim ? "visible" : "collapse");
      if (rim) {
        put(parts.pipOutline, state.applied.Outline, "opacity", rim.opacity);
        var rims = layer("Outline", true, true), t = rim.thickness;
        var rowStep = Math.min(rows, PIP_TALL_ROWS) * PIP_ROW_PX / rows, columnStep = old.primaryWidth / PIPS_PER_ROW;
        var hpWidth = old.primaryWidth * PIP_WIDTH_PERCENT / 100 / PIP_HP;
        rims.rows.forEach(function (row, r) {
          put(row.panel, row.applied, "visibility", r < rows ? "visible" : "collapse");
          if (r >= rows) return;
          put(row.panel, row.applied, "position", "0px " + pixels(rowStep * (rows - 1 - r) - t) + " 0px");
          put(row.panel, row.applied, "height", pixels(rowStep * 0.8 + 2 * t));
          row.boxes.forEach(function (item, c) {
            var index = r * PIPS_PER_ROW + c, shown = index < count;
            put(item.panel, item.applied, "visibility", shown ? "visible" : "collapse");
            if (!shown) return;
            put(item.panel, item.applied, "position", pixels(columnStep * c - t) + " 0px 0px");
            put(item.panel, item.applied, "width", pixels(hpWidth * Math.min(PIP_HP, old.max - index * PIP_HP) + 2 * t));
            put(item.panel, item.applied, "backgroundColor", rim.color);
          });
        });
      }
      state.outline = outlineKey;
    }
    // Kill marker: a vertical tick at the threshold HP inside the box holding it.
    var mark = old.marker, markerKey = mark ? [layout, mark.hp, mark.width, mark.color].join("|") : "off";
    if (state.marker !== markerKey) {
      var marker = parts.pipKillMarker, applied = state.applied.KillMarker;
      put(marker, applied, "visibility", mark ? "visible" : "collapse");
      if (mark) {
        var at = Math.max(0, Math.min(count - 1, Math.floor(mark.hp / PIP_HP)));
        var inside = Math.max(0, Math.min(Math.min(PIP_HP, old.max - at * PIP_HP), mark.hp - at * PIP_HP));
        put(marker, applied, "position", oldBoxPosition(at, rows, inside));
        put(marker, applied, "height", oldBoxHeight(rows));
        put(marker, applied, "width", pixels(mark.width));
        put(marker, applied, "marginLeft", pixels(-mark.width / 2));
        put(marker, applied, "backgroundColor", mark.color);
      }
      state.marker = markerKey;
    }
    return writes;
  }
  // target = { root, parts, ledger, settle }: the world bar or the menu preview.
  function restore(owner) {
    if (owner.key === LEASE_PARENT) {
      if (!valid(owner.stockParent)) return false;
      if (owner.owned || owner.value !== owner.stockParent) {
        owner.panel.SetParent(owner.stockParent);
        if (owner.panel.GetParent() !== owner.stockParent) throw new Error("Native parent restoration rejected");
        if (valid(owner.stockNext) && owner.stockNext.GetParent() === owner.stockParent) owner.stockParent.MoveChildBefore(owner.panel, owner.stockNext);
        else if (valid(owner.stockPrevious) && owner.stockPrevious.GetParent() === owner.stockParent) owner.stockParent.MoveChildAfter(owner.panel, owner.stockPrevious);
        owner.value = owner.stockParent;
      }
    } else if (owner.key.indexOf(LEASE_CLASS) === 0) {
      if (owner.owned || owner.value !== owner.stockClass) {
        owner.panel.SetHasClass(owner.key.slice(7), owner.stockClass); owner.value = owner.stockClass;
      }
    } else {
      var value = owner.captured ? owner.stock : "";
      if (owner.owned || owner.value !== value) { writeStyle(owner.panel, owner.key, value); owner.value = value; }
    }
    owner.owned = false;
    return true;
  }
  function applyTo(target, next) {
    var wanted = [], writes = 0, releaseError = null, parts = target.parts, ledger = target.ledger;
    if (next.settle) target.settle = true;
    var index = new Map(), wantedIndex = new Map();
    ledger.forEach(function (owner) {
      if (!index.has(owner.panel)) index.set(owner.panel, new Map());
      index.get(owner.panel).set(owner.key, owner);
    });
    // Existing leases are validated at the carrier check, not once per property per paint.
    function available(panel) { return !!panel && (index.has(panel) || valid(panel)); }
    Object.keys(next.parents || {}).forEach(function (part) {
      var placement = next.parents[part], panel = parts && parts[part];
      var parent = parts && parts[typeof placement === "string" ? placement : placement.parent];
      var before = typeof placement === "string" ? null : parts && parts[placement.before];
      if (available(panel) && available(parent) && (!before || available(before)))
        wanted.push({ panel: panel, key: LEASE_PARENT, part: part, value: parent, before: before });
    });
    Object.keys(next.styles).forEach(function (part) {
      var panels = part === "lineWash" ? parts && parts.lineChildren || [] : Array.isArray(parts && parts[part]) ? parts[part] : [parts && parts[part]];
      panels.forEach(function (panel, i) {
        var styles = Array.isArray(next.styles[part]) ? next.styles[part][i] : next.styles[part];
        if (available(panel)) Object.keys(styles).forEach(function (key) {
          wanted.push({ panel: panel, key: key, part: part, value: styles[key] });
        });
      });
    });
    Object.keys(next.classes || {}).forEach(function (part) {
      var panel = part === "root" ? target.root : parts && parts[part];
      if (available(panel)) Object.keys(next.classes[part]).forEach(function (name) {
        wanted.push({ panel: panel, key: LEASE_CLASS + name, part: part, value: next.classes[part][name] });
      });
    });
    wanted.forEach(function (entry) {
      if (!wantedIndex.has(entry.panel)) wantedIndex.set(entry.panel, new Map());
      wantedIndex.get(entry.panel).set(entry.key, entry);
    });
    // Live 6782: the engine deletes panels we lease (UnitHealthbarLines children when the bar
    // total drops, as a barrier is hit or expires) and every native call on them then throws
    // "Underlying panel is deleted!". A dead panel has nothing to restore: drop its leases, keep
    // the rest of this apply, and rediscover parts next tick. Live-panel failures still throw.
    var dead = new Set();
    function panelName(panel) {
      try { return panel.id || "(anonymous)"; } catch (error) { return "(unreadable)"; }
    }
    function deleted(panel, part, key, error) {
      if (valid(panel)) return false;
      if (!dead.has(panel)) {
        dead.add(panel); target.rediscover = true;
        // HPV3_DEBUG $.Msg("[HPV3] renderer dropped deleted panel part=" + part + " key=" + key + " id=" + panelName(panel) + ": " + String(error));
      }
      return true;
    }
    // The race and rollback debug lines print this, naming the ledger part and panel.
    function annotate(error, part, panel) {
      return new Error(String(error && error.message || error) + " part=" + part + " id=" + panelName(panel));
    }
    for (var i = ledger.length - 1; i >= 0; i--) {
      var owner = ledger[i];
      if (!wantedIndex.has(owner.panel) || !wantedIndex.get(owner.panel).has(owner.key)) {
        if (!owner.owned || dead.has(owner.panel)) continue;
        try { if (restore(owner)) writes++; } catch (error) {
          if (!deleted(owner.panel, owner.part, owner.key, error)) releaseError = releaseError || annotate(error, owner.part, owner.panel);
        }
      }
    }
    function prune() {
      if (dead.size) for (var j = ledger.length - 1; j >= 0; j--) if (dead.has(ledger[j].panel)) ledger.splice(j, 1);
    }
    if (releaseError) { prune(); throw releaseError; }
    wanted.forEach(function (entry) {
      if (dead.has(entry.panel)) return;
      try { claim(entry); } catch (error) {
        if (!deleted(entry.panel, entry.part, entry.key, error)) { prune(); throw annotate(error, entry.part, entry.panel); }
      }
    });
    prune();
    function claim(entry) {
      var owner = index.has(entry.panel) && index.get(entry.panel).get(entry.key);
      if (!owner) {
        owner = { panel: entry.panel, key: entry.key, part: entry.part, value: undefined, owned: false };
        if (entry.key === LEASE_PARENT) {
          owner.stockParent = entry.panel.GetParent();
          if (!valid(owner.stockParent)) throw new Error("Native parent unavailable");
          var siblings = owner.stockParent.Children(), siblingIndex = siblings.indexOf(entry.panel);
          owner.stockNext = siblings[siblingIndex + 1] || null;
          owner.stockPrevious = siblings[siblingIndex - 1] || null;
        } else if (entry.key.indexOf(LEASE_CLASS) === 0) {
          owner.stockClass = entry.panel.BHasClass(entry.key.slice(7));
        } else {
          var captured = entry.panel.style[entry.key], explicit = EXPLICIT_STOCK[entry.part];
          // Live 6785: a panel with inline layer longhands reads backgroundImage back as the whole layer
          // ("url( ... )  / 100.0% 100.0% unset unset"); only the image part is writable.
          if (entry.key === "backgroundImage" && typeof captured === "string") captured = captured.replace(/\s+\/\s.*$/, "");
          owner.captured = captured !== undefined && captured !== null && captured !== "";
          owner.stock = owner.captured ? captured : "";
          if (!owner.captured && explicit && explicit[entry.key]) { owner.captured = true; owner.stock = explicit[entry.key]; }
        }
        ledger.push(owner);
        if (!index.has(entry.panel)) index.set(entry.panel, new Map());
        index.get(entry.panel).set(entry.key, owner);
      }
      if (!owner.owned || owner.value !== entry.value || owner.before !== entry.before) {
        // Keep a pending lease even if the native setter mutates and then throws.
        owner.owned = true;
        if (entry.key === LEASE_PARENT) {
          entry.panel.SetParent(entry.value);
          if (entry.panel.GetParent() !== entry.value) throw new Error("Native adoption rejected");
          if (valid(entry.before)) entry.value.MoveChildBefore(entry.panel, entry.before);
          owner.before = entry.before;
        } else if (entry.key.indexOf(LEASE_CLASS) === 0) {
          entry.panel.SetHasClass(entry.key.slice(7), entry.value);
          if (entry.key === LEASE_CORE_CLASS) target.settle = true;
        } else {
          writeStyle(entry.panel, entry.key, entry.value);
          if (entry.part === "name" && /^(fontSize|padding|maxWidth|maxHeight)$/.test(entry.key)) target.settle = true;
        }
        owner.value = entry.value; writes++;
      }
      owner.owned = true;
    }
    if (next.old && parts) writes += paintOld(parts, next.old);
    // Owned labels only (no stock text to restore): write on change; a hidden pill keeps its last text.
    Object.keys(next.texts || {}).forEach(function (part) {
      var panel = parts && parts[part], value = next.texts[part];
      if (!panel || textWrites.get(panel) === value || !valid(panel)) return;
      panel.text = value; textWrites.set(panel, value); writes++;
    });
    return writes;
  }
  function worldTarget() { return { root: root, parts: cache, ledger: ledger, settle: false }; }
  function apply(next) {
    var target = worldTarget();
    try { return applyTo(target, next); } finally {
      if (target.settle) settleGeometry = true;
      // A deleted leased panel may have a replacement: rediscover parts on the next tick.
      if (target.rediscover) { rediscover = true; lastProbe = ""; lastFull = -Infinity; }
    }
  }
  // ====== DRIVER: cache reset, carrier check, tick, config bus, start / stop ======
  function resetCache() {
    apply(EMPTY_PLAN); cache = null; cachedFacts = null; memo = null; geometry = null; settleGeometry = false;
    lastProbe = ""; lastConfigKey = ""; lastGeometry = -Infinity;
  }
  function checkCarriers() {
    classReads = new WeakMap();
    var validity = new Map();
    for (var i = ledger.length - 1; i >= 0; i--) {
      var panel = ledger[i].panel;
      if (!validity.has(panel)) validity.set(panel, valid(panel));
      if (!validity.get(panel)) ledger.splice(i, 1);
    }
    var changedLineage = !carriersValid();
    if (changedLineage) discoverCarriers();
    else wakeCarriers();
    // HPV3_DEBUG carriers.forEach(function (panel) { if (!loggedCarrierDepth.has(panel)) { loggedCarrierDepth.set(panel, true); $.Msg("[HPV3] renderer carrier depth=" + (ancestry.map(function (entry) { return entry.panel; }).indexOf(panel) + 1) + " ancestry=" + ancestry.length + " id=" + (panel.id || "(anonymous)")); } });
    var next = classify();
    if (next.signature !== carrierSignature || changedLineage) {
      var release = changedLineage || !kind || next.base !== kind.base || next.eligible !== kind.eligible;
      kind = next; carrierSignature = next.signature; invalidate("painted");
      if (release) { apply(EMPTY_PLAN); geometry = null; lastGeometry = -Infinity; }
      // HPV3_DEBUG $.Msg("[HPV3] renderer carrier changed: " + kind.kind + "/" + kind.side);
    } else kind = next;
    // HPV3_DEBUG if (kind.kind === "player" && kind.eligible) { var debugTeamLine = kind.side + " " + kind.team; var debugKnown = debugLastName && debugLastName !== "?"; if (debugTeamLine !== debugTeam || (debugKnown && debugTeamLogged.indexOf("? ") === 0)) { var debugTeamFull = (debugKnown ? debugLastName : debugName()) + " " + debugTeamLine; debugTeam = debugTeamLine; if (debugTeamFull !== debugTeamLogged) { debugTeamLogged = debugTeamFull; $.Msg("[HPV3] team " + debugTeamFull); } } };
    if (cache && settings && settings.shared.enabled && kind.eligible && !lineageValid()) resetCache();
    lastCarrierCheck = Date.now(); rediscover = false;
    reconcileLines();
    reconcileAccessories();
    reconcileLevel();
    reconcileStamina();
    reconcileNativeIndicators();
  }
  function tick(token, force) {
    if (!running || token !== generation) return;
    if (!valid(root)) { teardown(); return; }
    // HPV3_DEBUG var began = Date.now();
    try {
      if (force || rediscover || Date.now() - lastCarrierCheck >= CARRIER_CHECK_MS || !ancestry.length) checkCarriers();
      if (!settings || !settings.shared.enabled || !kind || !kind.eligible) {
        apply(EMPTY_PLAN); status.state = "dormant"; return;
      }
      if (!cache && !discover()) { status.state = "dormant"; return; }
      if (!valid(cache.fill)) { status.state = "dormant"; return; }
      var lineSide = sideConfig(settings, kind);
      // OLD plans no line washes, so it skips this per-tick recount (the 1s carrier check remains).
      if (kind.side !== "neutral" && lineSide.linesVisible && lineSide.lineColorEnabled && !kind.spectating && settings.shared.barStyle !== "old" &&
          valid(cache.lines) && cache.lines.GetChildCount() !== cache.nativeLineCount) reconcileLines();
      if (force || Date.now() - lastPickups >= PICKUPS_MS) reconcilePickups();
      cache.ultimateAngle = timerFacts.ultimateAngle; cache.bounty = timerFacts.bounty;
      if (kind.kind === "player" && settings.shared.ultimateTimerEnabled && cache.ultimateAngle !== null &&
          (!valid(cache.ultimateOverlay) || !valid(cache.ultimateDark) || !valid(cache.ultimateFill))) ultimateArtwork(cache, WORLD_PREFIX);
      if (kind.kind === "player" && settings.shared.killBountyEnabled && cache.bounty !== null && !cache.bountyLooked) bountyParts(cache);
      // Only health/layer and bound-row extent signatures run at 0.15s. Geometry
      // refreshes at 1.5s, plus one settling sample after a layout-changing write.
      if (!geometry || settleGeometry || force || Date.now() - lastGeometry >= GEOMETRY_MS) sampleGeometry();
      // Low stamina follows the bar: every 0.15 s tick while active; while idle every other tick (0.3 s),
      // stretched for more than six charges so idle reads stay at the six-charge rate (10 charges: 0.6 s).
      if (cache.stamina && staminaLow(kind, settings) && (status.state !== "idle" ||
          ++staminaIdleTicks % Math.max(2, Math.ceil((cache.staminaPips.length + 1) / STAMINA_IDLE_CHARGES)) === 0)) sampleStamina();
      var input = probe(), changed = input.signature !== lastProbe, configKey = epoch + "|" + revision, probed = input.signature;
      if (status.state !== "idle" || changed || configKey !== lastConfigKey || Date.now() - lastFull >= FULL_PAINT_MS) {
        // probe() already signed the input; only a changed layer visibility needs a new signature.
        if (refreshLayerVisibility(input, cache)) signProbe(input);
        changed = input.signature !== lastProbe; probed = input.signature;
        // Like v2's layoutOld, the OLD line total and feedback layers are read on paints only:
        // the 0.15s idle probe stays fill/shield/barrier, which every total or feedback change moves.
        if (oldWanted(settings, kind)) { input.old = oldSignal(cache); refreshLayerVisibility(input, cache, ["healing", "delta"]); signProbe(input); }
        var current = facts(input); apply(memoisedPlan(current)); status.fullPaints++;
        // HPV3_DEBUG var debugSide = kind.kind === "player" && settings.side[kind.side], debugWanted = !!debugSide && staminaWanted(kind, settings), debugFilled = current.stamina.filter(function (empty) { return !empty; }).length, debugLow = debugWanted && staminaLow(kind, settings) && current.stamina.length > 0 && debugFilled <= debugSide.staminaLowThreshold;
        // HPV3_DEBUG if (debugWanted) { var debugStaminaLine = kind.side + " " + debugFilled + "/" + current.stamina.length + " threshold " + debugSide.staminaLowThreshold + " " + (debugLow ? "low" : "high") + " " + (cache.staminaShown ? "shown" : "hidden"); if (debugStaminaLine !== debugStamina) { debugStamina = debugStaminaLine; $.Msg("[HPV3] stamina " + debugName() + " " + debugStaminaLine); } };
        // HPV3_DEBUG if (debugSide) { var debugHp = !debugSide.hpTextVisible ? "off" : debugSide.hpTextColorMode === "team" ? (teamColor(settings, kind.team) ? "team" : "bar-fallback") : debugSide.hpTextColorMode === "custom" ? (debugSide.hpTextTeamHigh && teamColor(settings, kind.team) ? "own+teamhigh" : "own") : "bar"; var debugSt = !debugWanted || !debugSide.staminaColorEnabled ? "stock" : debugLow ? "low" : debugSide.staminaColorMode === "team" ? (teamColor(settings, kind.team) ? "team" : "own-fallback") : "own"; var debugColorLine = kind.side + " hp=" + debugHp + " stamina=" + debugSt; if (debugColorLine !== debugColors) { debugColors = debugColorLine; $.Msg("[HPV3] colors " + debugName() + " " + debugColorLine); } };
        // HPV3_DEBUG if (debugSide && kind.side === "ally" && !debugAllySeen) { var debugAllyBox = root.FindChild("StaminaContainer"), debugAllyPips = valid(debugAllyBox) ? debugAllyBox.GetChildCount() : 0; if (debugAllyAt < 0) debugAllyAt = Date.now(); if (debugAllyPips && (debugAllyBox.BHasClass("StaminaRecentlyUsed") || root.BHasClass("StaminaRecentlyUsed"))) { debugAllySeen = true; $.Msg("[HPV3] ally stamina seen " + debugName() + " pips=" + debugAllyPips); } else if (!debugAllyNone && Date.now() - debugAllyAt >= 60000) { debugAllyNone = true; $.Msg("[HPV3] ally stamina none " + debugName() + " after 60s pips=" + debugAllyPips + " shown=false"); } };
        // HPV3_DEBUG debugCostPaints++;
        lastFull = Date.now(); lastConfigKey = configKey;
        status.state = changed ? "active" : "idle";
      }
      lastProbe = probed;
    } catch (error) {
      status.state = "dormant";
      invalidate("painted"); geometry = null;
      try { apply(EMPTY_PLAN); } catch (restoreError) {
        // The pending stock lease survives; the next cold tick retries it.
        settleGeometry = true;
        // HPV3_DEBUG $.Msg("[HPV3] renderer rollback pending: " + String(restoreError));
      }
      // HPV3_DEBUG $.Msg("[HPV3] renderer race: " + String(error));
    } finally {
      // HPV3_DEBUG timingTicks++; timingMs += Date.now() - began;
      // HPV3_DEBUG debugCostTicks++; debugCostMs += Date.now() - began;
      // HPV3_DEBUG if (Date.now() - debugCostAt >= 10000) { var debugSeconds = Math.max(1, Date.now() - debugCostAt) / 1000, debugRate = function (value) { return Math.round(value / debugSeconds * 10) / 10; }; if (cache && staminaWanted(kind, settings)) $.Msg("[HPV3] stamina cost " + (debugLastName || debugName()) + " " + kind.side + " reads/s=" + debugRate(debugFastReads) + " skipped/s=" + debugRate(debugFastSkipped) + " ticks/s=" + debugRate(debugCostTicks) + " paints=" + debugCostPaints + " ms=" + debugCostMs + (staminaLow(kind, settings) ? " gate=" + (cache.staminaGate || "none") + " pip0=" + debugClasses(cache.staminaPips[0]) + " icon0=" + debugClasses(cache.staminaIcons[0]) : " low=off")); debugCostAt = Date.now(); debugCostTicks = 0; debugFastTicks = 0; debugFastSkipped = 0; debugFastReads = 0; debugCostPaints = 0; debugCostMs = 0; };
      // HPV3_DEBUG if (Date.now() - timingAt >= 5000) { $.Msg("[HPV3] renderer timing ticks=" + timingTicks + " ms=" + timingMs + " paints=" + status.fullPaints + " state=" + status.state); timingAt = Date.now(); timingTicks = 0; timingMs = 0; };
      if (running && valid(root)) scheduleTick(status.state === "dormant" ? TICK_DORMANT : TICK_ACTIVE, token);
      notifyTimers();
    }
  }
  function onConfig(raw) {
    if (!running || !valid(root) || typeof raw !== "string") return;
    // The config publisher owns this canonical envelope header. Other modules
    // receive opaque messages, even when a player name contains the config magic.
    if (!(headerRe || (headerRe = new RegExp('^\\s*\\{\\s*"magic"\\s*:\\s*"' + MAGIC + '"\\s*[,}]'))).test(raw)) {
      if ($.HPColorsV3Bridge) $.HPColorsV3Bridge.emit(raw);
      return;
    }
    if (raw === lastRaw || raw.length > MAX_ENVELOPE) return;
    try {
      var next = acceptConfig(raw);
      if (!next) return;
      retireEpoch(next.epoch);
      settings = next.settings; revision = next.revision; epoch = next.epoch; lastRaw = raw; showBounds = next.showBounds;
      authority.epoch = epoch; authority.revision = revision;
      status.revision = revision; status.epoch = epoch;
      if (requestJob) $.CancelScheduled(requestJob);
      requestJob = null;
      cancelTick(); tick(generation, true);
    } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] config ignored: " + String(error));
    }
  }
  function requestConfig(token) {
    if (!running || token !== generation || revision >= 0 || requestFailures >= REQUEST_FAILURE_LIMIT || !valid(root)) return;
    requestJob = $.Schedule(REQUEST_DELAYS[Math.min(requestAttempt, REQUEST_DELAYS.length - 1)], function () {
      requestJob = null;
      if (!running || token !== generation || revision >= 0 || !valid(root)) return;
      requestAttempt++;
      var bridge = $.HPColorsV3Bridge;
      var sent = bridge && bridge.send({ magic: bridge.MAGICS.CONFIG_REQUEST.magic, epoch: epoch || "", revision: revision });
      requestFailures = sent ? 0 : requestFailures + 1; requestConfig(token);
    });
  }
  // Teardown order (also the first step of start()): stop scheduling (running/generation, tick, request retry, event handler),
  // release panels (checkCarriers before resetCache so paints are lifted from the live carriers), clear instance state,
  // report "stopped" to timers, then release the sibling relay. Panel release is guarded: native teardown races must not
  // prevent cancellation or reinclusion; its catch only clears what resetCache would, without touching panels.
  function teardown() {
    running = false; generation++;
    cancelTick();
    if (requestJob) $.CancelScheduled(requestJob);
    requestJob = null;
    if (handlerId !== null) $.UnregisterForUnhandledEvent("ClientUI_FireOutput", handlerId);
    handlerId = null;
    try { if (valid(root)) checkCarriers(); resetCache(); } catch (error) {
      // Native teardown races must not prevent cancellation or script reinclusion.
      cache = null; invalidate("painted"); geometry = null; lastConfigKey = "";
      // HPV3_DEBUG $.Msg("[HPV3] renderer stop release pending: " + String(error));
    }
    carriers = []; ancestry = []; kind = null; settings = null; revision = -1; epoch = ""; lastRaw = ""; carrierSignature = ""; showBounds = false;
    classReads = new WeakMap(); classSources = {};
    status.started = false; status.state = "stopped"; status.revision = -1; status.epoch = "";
    notifyTimers();
    if ($.HPColorsV3Bridge) $.HPColorsV3Bridge.stop();
  }
  function start() {
    var context = $.GetContextPanel();
    if (!valid(context) || (running && root === context)) return;
    teardown(); root = context;
    // Persist explicit stock writes across stop/restart and script reinclusion, not across dead roots.
    ledger = root.HPColorsV3StockLedger || []; root.HPColorsV3StockLedger = ledger;
    status.started = true;
    running = true; requestAttempt = 0; requestFailures = 0; lastCarrierCheck = -Infinity; dormantChecks = 0;
    // HPV3_DEBUG timingAt = Date.now(); timingTicks = 0; timingMs = 0; debugCostAt = Date.now();
    handlerId = $.RegisterForUnhandledEvent("ClientUI_FireOutput", onConfig);
    root.SetAttributeString("hpv3_renderer_boot", "ready");
    // HPV3_DEBUG $.Msg("[HPV3] renderer boot " + $.HPColorsV3WorldSettings.version);
    tick(generation, true); requestConfig(generation);
  }
  // Menu preview: the world's classify -> facts -> plan -> apply chain over a caller-owned part map
  // ====== PREVIEW: the menu painter over the same chain ======
  // and ledger. It reads no world state, schedules nothing and registers no listener.
  // parts: the part-table keys the caller's own tree supplies (plus pickupContainer / pickupSamples). sample: what a fixed sample
  // pretends, so the world rules carry no preview numbers: { idPrefix: id prefix of the runtime panels it creates, ultimateAngle:
  // angle of the ultimate timer, bounty: kill bounty shown, mirror: part key that copies the fill's plan }.
  // paint() returns { facts, plan, writes, settle, painted, reason }: painted = the plan styled something; reason = off (master off
  // or no config) | unlaid (no layout yet) | painted | unstyled (laid, nothing to write).
  function createPainter(canvas, parts, sample) {
    var target = { root: canvas, parts: parts, ledger: [], settle: false };
    sample = sample || { idPrefix: "", ultimateAngle: null, bounty: null, mirror: "" };
    return {
      paint: function (classes, config, view) {
        for (var i = target.ledger.length - 1; i >= 0; i--) if (!valid(target.ledger[i].panel)) target.ledger.splice(i, 1);
        var anyOf = function (names) {
          for (var i = 0; i < names.length; i++) if (classes.indexOf(names[i]) >= 0) return true;
          return false;
        };
        var carrier = classifyWith(anyOf, !!(config && config.shared.enabled), target.ledger.some(function (owner) { return owner.owned; }), config);
        target.settle = false;
        parts.lineChildren = lineChildren(parts);
        parts.levelNumber = config && config.shared.enabled && carrier.eligible && carrier.kind === "player" && carrier.side === "enemy" && config.side.enemy.levelsVisible
          ? levelNumber(parts.levelLabel) : 0;
        var staminaOn = staminaWanted(carrier, config), staminaLowOn = staminaOn && staminaLow(carrier, config);
        var stamina = staminaOn ? staminaParts(parts.stamina, staminaProbe(carrier, config) && !staminaLowOn) : { icons: [], empty: [] };
        if (staminaLowOn) stamina.empty = pipEmpties(stamina.pips);
        parts.staminaIcons = stamina.icons; parts.staminaEmpty = stamina.empty;
        var pickups = config && config.shared.enabled && carrier.eligible && carrier.kind === "player" && config.shared.pickupTimersEnabled
          ? pickupParts(parts.pickupContainer, parts.pickupSamples) : emptyPickups();
        Object.keys(pickups).forEach(function (key) { parts[key] = pickups[key]; });
        parts.ultimateAngle = carrier.eligible && carrier.kind === "player" && config.shared.ultimateTimerEnabled ? sample.ultimateAngle : null;
        if (parts.ultimateAngle !== null) ultimateArtwork(parts, sample.idPrefix);
        // Ticket 50: the sample's fixed bounty (a solo kill at 16:00 without comeback); enemy samples only (plan).
        parts.bounty = carrier.eligible && carrier.kind === "player" && config.shared.killBountyEnabled ? sample.bounty : null;
        var input = probeOf(parts, geometryOf(canvas, parts), true, oldWanted(config, carrier));
        var current = factsFrom(carrier, input, carrier.signature + "|" + input.signature);
        var next = plan(current, config, view);
        // Preview-only visual replica: clip remains the signal; the same ledger owns color/pulse and alias release.
        if (sample.mirror && parts[sample.mirror]) {
          if (next.styles.fill) next.styles[sample.mirror] = next.styles.fill;
          if (next.classes.fill) next.classes[sample.mirror] = next.classes.fill;
        }
        var writes = applyTo(target, next);
        var painted = false;
        for (var styled in next.styles) { painted = true; break; }
        return { facts: current, plan: next, writes: writes, settle: target.settle, painted: painted,
          reason: !config || !config.shared.enabled ? "off" : !current.laid ? "unlaid" : painted ? "painted" : "unstyled" };
      },
      release: function () { target.settle = false; return applyTo(target, EMPTY_PLAN); },
      owned: function () { return target.ledger.filter(function (owner) { return owner.owned; }).length; }
    };
  }
  // Inclusion exports only. The separate world_boot include starts the world loop.
  $.HPColorsV3Renderer = { facts: facts, plan: plan, apply: apply, start: start, stop: teardown, status: status, createPainter: createPainter,
    onMessage: function (fn) { return $.HPColorsV3Bridge ? $.HPColorsV3Bridge.subscribe(fn) : function () {}; },
    onState: function (fn) { var off = subscribeState(fn); fn(timerState()); return off; },
    refreshPickups: reconcilePickups, barFacts: barFacts,
    setTimerFacts: setTimerFacts,
    // parts / statusScales / pickupKinds are built on first read (the menu preview); world bars never build them (see PART REGISTRY).
    // defaults is read by tests only.
    statusLabels: STATUS_LABELS, labelAtDefault: labelAtDefault,
    get parts() { return publishedPartTable(); }, get statusScales() { return publishedScaleTable(); }, get pickupKinds() { return publishedPickupTable(); },
    get defaults() { return schemaDefaults(); } };
})();
