(function () {
  "use strict";
  // Menu preview bar (ticket 09). A fake unit-status tree under HPColorsPreview ids is painted by the
  // world renderer's own classify -> facts -> plan -> apply chain ($.HPColorsV3Renderer.createPainter).
  // Carrier classes are data here, except the sample marks writeSampleMarks puts on the pane and canvas. Play, edit-shake and layout-settle
  // work have separate generation tokens; unlaid geometry polls at 4 Hz only while the preview is open.
  // The renderer publishes the shared vocabulary (status labels, status scales, pickup kinds, parts)
  // as $.HPColorsV3Renderer.statusLabels / statusScales / pickupKinds / parts (all but statusLabels are built on first read); only this sample tree's ids live here.
  // Sample numbers handed to the shared painter: the ultimate timer angle, the fixed kill bounty and the part that mirrors the fill.
  var SAMPLE = { idPrefix: "HPColorsPreview", ultimateAngle: 180, bounty: 1250, mirror: "visualFill" };
  // Parts only the sample tree has (the painter's canvas, the effect-size sample, the fill mirror); every other key is a renderer part.
  var PREVIEW_ONLY = ["canvas", "fx", "visualFill"];
  var PARTS = {
    canvas: "HPColorsPreviewCanvas", name: "HPColorsPreviewName", motion: "HPColorsPreviewMotion",
    anchor: "HPColorsPreviewReadoutAnchor", row: "HPColorsPreviewReadoutLine", status: "HPColorsPreviewUnitStatus",
    info: "HPColorsPreviewInfo", stack: "HPColorsPreviewBars", primary: "HPColorsPreviewBar", inner: "HPColorsPreviewBarInner",
    fill: "HPColorsPreviewBarFill", healing: "HPColorsPreviewBarHealing", shield: "HPColorsPreviewBarShield",
    visualFill: "HPColorsPreviewBarVisualFill",
    armor: "HPColorsPreviewBarArmor", delta: "HPColorsPreviewBarDelta", lines: "HPColorsPreviewBarLines",
    outline: "HPColorsPreviewBarOutline", value: "HPColorsPreviewHpText", killMarker: "HPColorsPreviewKillMarker",
    level: "HPColorsPreviewLevel", levelLabel: "HPColorsPreviewLevelLabel", ult: "HPColorsPreviewUltPanel",
    ultBackground: "HPColorsPreviewUltBackground", ultReady: "HPColorsPreviewUltReady", stamina: "HPColorsPreviewStamina",
    pulseOverlay: "HPColorsPreviewPulseOverlay", pickupContainer: "HPColorsPreviewPickups", effects: "HPColorsPreviewPickups", fx: "HPColorsPreviewFx",
    killStreak: "HPColorsPreviewKillStreak", rejuvAnchor: "HPColorsPreviewRejuvenatorAnchor", rejuv: "HPColorsPreviewRejuvenator",
    critical: "HPColorsPreviewCriticalIndicator", criticalAnchor: "HPColorsPreviewCriticalAnchor",
    assassinate: "HPColorsPreviewAssassinateIndicator", assassinateAnchor: "HPColorsPreviewAssassinateAnchor",
    unkillable: "HPColorsPreviewUnkillableIndicator", unkillableAnchor: "HPColorsPreviewUnkillableAnchor",
    bountyAnchor: "HPColorsPreviewBountyAnchor", bountyPill: "HPColorsPreviewBounty", bountyValue: "HPColorsPreviewBountyValue",
    pipGrid: "HPColorsPreviewPipGrid", pipOutline: "HPColorsPreviewPipOutline", pipEmpty: "HPColorsPreviewPipEmpty",
    pipShield: "HPColorsPreviewPipShield", pipArmor: "HPColorsPreviewPipArmor", pipFill: "HPColorsPreviewPipFill",
    pipHealing: "HPColorsPreviewPipHealing", pipDelta: "HPColorsPreviewPipDelta", pipKillMarker: "HPColorsPreviewPipKillMarker"
  };
  var UI = {
    title: "HPColorsPreviewTitle", sideEnemy: "HPColorsPreviewSideOptionEnemy", sideAlly: "HPColorsPreviewSideOptionAlly",
    teamAmber: "HPColorsPreviewTeamOptionAmber", teamSapphire: "HPColorsPreviewTeamOptionSapphire",
    kindObjective: "HPColorsPreviewKindOptionObjective", kindNeutral: "HPColorsPreviewKindOptionNeutral",
    health: "HPColorsPreviewHealthValue", slider: "HPColorsPreviewHealthSlider", play: "HPColorsPreviewPlay",
    playLabel: "HPColorsPreviewPlayLabel", status: "HPColorsPreviewStatus", scale: "HPColorsPreviewScale"
  };
  // Carrier classes the world unit-status root would carry for each sample.
  var KINDS = {
    hero: { title: "HERO", classes: ["player", "CLASS_PLAYER"], maxHp: 1000, css: "HPC3PreviewKindHero",
      names: { enemy: "Infernus", ally: "Infernus" } }, // ticket 22c: matches the Infernus scene model
    neutral: { title: "NEUTRAL CAMP", classes: ["neutral_normal", "team_neutral"], maxHp: 600, css: "HPC3PreviewKindNeutral", names: { enemy: "", ally: "" } },
    objective: { title: "OBJECTIVE", classes: ["building", "CLASS_DESTROYABLE_BUILDING", "boss_tier1"], maxHp: 4000,
      css: "HPC3PreviewKindObjective", names: { enemy: "", ally: "" } }
  };
  var SEQUENCE = [90, 72, 45, 20, 8, 28, 52, 78, 100];
  var STEP_SECONDS = 0.45;
  var SETTLE_SECONDS = 0.1;
  var UNLAID_SECONDS = 0.25;
  var SETTLE_LIMIT = 5;
  // Unit-kind camera: the stage content box is a fixed 284x278 (menu.css .HPC3PreviewStage is 286x280 with a 1px
  // transparent border on each side, inside the 330px column; menu.test.js checks the two agree).
  // Content around the bar (canvas px, measured live 2026-10-14): pickups/stamina/name 57 above, HP text 26 below,
  // level badge/rejuvenator 32.5 left of the bar, ult badge 10 right of it. Zoom only ever goes down from 2x.
  // Unit bars keep the stock 79x18 bar at its stock spot (user, 2026-10-29), so the fit is computed once.
  var UNIT_CAMERA = (function () {
    var STAGE_W = 284, STAGE_H = 278, STAGE_PAD = 8, MAX_ZOOM = 2, MIN_ZOOM = 0.4, BAR_CX = 100, BAR_CY = 74;
    var left = BAR_CX - 79 / 2 - 32.5, right = BAR_CX + 79 / 2 + 10, top = BAR_CY - 18 / 2 - 57, bottom = BAR_CY + 18 / 2 + 26;
    var zoom = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (STAGE_W - 2 * STAGE_PAD) / (right - left), (STAGE_H - 2 * STAGE_PAD) / (bottom - top))) * 100) / 100;
    // The scale wrapper is top-left aligned; canvas margins (canvas px, layout only: a transformed root
    // would clip noclip children) put the box centre mid-stage.
    return { zoom: Math.round(zoom * 100) + "%", left: Math.round((STAGE_W / (2 * zoom) - (left + right) / 2) * 10) / 10 + "px",
      top: Math.round((STAGE_H / (2 * zoom) - (top + bottom) / 2) * 10) / 10 + "px" };
  })();
  // Ticket 22c live 1:1 (user 2026-10-15): the HERO stage is the live SHOW BOUNDS box. Its 284x298 inner box
  // (menu.css) is the 200x210 world canvas at k = 284/200, origin to origin, so bar size and offsets paint where
  // live puts them. Ticket 27 round 2 moves clipping out to the plate's inner scene window, so the model
  // continues below the unchanged camera box. Its size/margins use the same k; the layered scene window's
  // white opacity-brush (live check 8) clips the render and icon_mask03 vignettes scene and backdrop together.
  var HERO_ZOOM = "142%", HERO_K = 1.42;
  // Zoom-out (user 2026-10-15): above HERO_ZOOM_WIDTH px of active-side bar width the camera pulls back by
  // f = HERO_ZOOM_WIDTH / width about the 1:1 canvas centre (stage px 142, 149.1), so the bar keeps its 136.7 px
  // on-stage width. The model's layout size/margins scale about the same point (written only when f changes);
  // its plate-sized layered scene window still clips. HERO_MODEL is the static CSS geometry (stage px).
  var HERO_ZOOM_WIDTH = 136.7, HERO_ANCHOR_X = 100 * HERO_K, HERO_ANCHOR_Y = 105 * HERO_K;
  var HERO_MODEL = { width: 316.8, height: 364.5, left: -15.8, top: 78.8 }; // menu.css: 10% higher, 10% wider camera
  // Live 6779: pre-transform-scale2d scales about the centre (transform-origin is ignored), so a matching
  // translateX keeps the visual fill left-anchored; both transition together (stock #UnitStatus precedent).
  var INNER_W = 69, visualKey = "";
  var cameraZoom = "", cameraLeft = "", cameraTop = "", heroModel = null, modelZoom = HERO_ZOOM;

  var pane = null, parts = null, ui = null, painter = null, settings = null;
  var touch = []; // parts a paint proves valid: { key, label }, built at attach from the renderer's part table
  // SHOW BOUNDS: session view state from the menu, painted by the same plan as world bars.
  var view = { showBounds: false };
  var available = false, isOpen = false, retired = false, syncing = false;
  var page = "Bar", unitKind = "neutral", kind = "hero", side = "enemy";
  // Ticket 35: session-only sample team. Each side starts at its usual team (enemy Sapphire, ally Amber);
  // a side change restores that default. Never a setting, code, preset or Undo step.
  var SIDE_TEAMS = { enemy: "team2", ally: "team1" }, team = SIDE_TEAMS.enemy;
  var hp = 75, shown = 75, from = 75, playing = false, playIndex = 0, feedback = "", layersShown = false;
  var settleTries = 0;
  // Play, layout-settle and edit-shake each own one scheduled job. A slot's generation token makes a stale callback a no-op.
  function slot() { return { generation: 0, job: null }; }
  var playSlot = slot(), settleSlot = slot(), shakeSlot = slot();
  var last = null, statusText = "", tickMaxHp = 0, tickRoot = null;
  var readoutLayoutKey = "";
  var sampleLabel = "", sampleFx = "", paintedFx = "";

  // Reinclusion: the previous instance stops scheduling before this one binds the same panels.
  var previous = $.HPColorsV3Preview;
  if (previous && typeof previous.retire === "function") {
    try { previous.retire(); } catch (error) { /* Old context already gone. */ }
  }

  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  function inside(panel) {
    for (var node = panel, depth = 0; valid(node) && depth < 40; node = node.GetParent(), depth++) if (node === pane) return true;
    return false;
  }
  function setText(panel, text) { if (valid(panel) && panel.text !== text) panel.text = text; }
  function setClass(panel, name, on) { if (valid(panel) && panel.BHasClass(name) !== on) panel.SetHasClass(name, on); }

  // A (re)resolved tree starts with no write/layout caches: they describe what was written to the old panels.
  function resetResolved() {
    cameraZoom = ""; cameraLeft = ""; cameraTop = ""; visualKey = ""; readoutLayoutKey = ""; settleTries = 0; paintedFx = null;
  }

  function resolve(root) {
    var nextPane = valid(root) ? root.FindChildTraverse("HPColorsPreview") : null;
    if (!valid(nextPane)) return false;
    pane = nextPane;
    var found = {}, controls = {}, key;
    for (key in PARTS) {
      found[key] = pane.FindChildTraverse(PARTS[key]);
      if (!valid(found[key]) || !inside(found[key])) return false;
    }
    for (key in UI) {
      controls[key] = pane.FindChildTraverse(UI[key]);
      if (!valid(controls[key]) || !inside(controls[key])) return false;
    }
    parts = found; ui = controls;
    // Ticket 51: the percent label is a direct child of the readout row, so it needs no ancestry walk.
    parts.hpPercent = parts.row.FindChild("HPColorsPreviewHpPercent") || null;
    resetResolved();
    // Optional: without the scene panel the preview still works; the CSS geometry is the 1:1 state.
    var nextModel = pane.FindChildTraverse("HPColorsPreviewHeroModel");
    if (nextModel !== heroModel) {
      // Hand a surviving old model back at its static 1:1 geometry; the new one starts there.
      try { heroCamera(HERO_ZOOM); } catch (error) { /* Old tree gone. */ }
      heroModel = nextModel; modelZoom = HERO_ZOOM;
    }
    var pickupKinds = $.HPColorsV3Renderer && $.HPColorsV3Renderer.pickupKinds;
    parts.pickupSamples = !pickupKinds ? [] : parts.pickupContainer.Children().filter(function (icon) { return icon.BHasClass("HPC3PreviewPickup"); }).map(function (icon, i) {
      var name = pickupKinds[i].name;
      var inner = icon.FindChild("HPColorsPreviewPickup" + name + "Inner"), border = icon.FindChild("HPColorsPreviewPickup" + name + "Border");
      var track = icon.FindChild("HPColorsPreviewPickup" + name + "Track");
      var glyph = icon.FindChild("HPColorsPreviewPickup" + name + "Glyph");
      glyph.SetImage("s2r://panorama/images/hud/icons/powerup_" + pickupKinds[i].icon + ".vsvg");
      return { icon: icon, bit: i, inner: inner, border: border, track: track, glyphs: [glyph] };
    });
    return true;
  }
  function partsValid() {
    // A paint proves each shared ancestor once. Never retain topology/validity across paints.
    var nodes = [], distances = [];
    function distance(node, depth) {
      var index = nodes.indexOf(node);
      if (index >= 0) return distances[index];
      if (depth >= 40 || !valid(node)) return -1;
      var value = node === pane ? 0 : distance(node.GetParent(), depth + 1);
      value = value < 0 ? -1 : node === pane ? 0 : value + 1;
      nodes.push(node); distances.push(value); return value;
    }
    for (var i = 0; i < touch.length; i++) {
      var key = touch[i].key, labelKey = touch[i].label;
      if (labelKey && settings && $.HPColorsV3Renderer.labelAtDefault(settings.shared, labelKey)) continue;
      var steps = distance(parts[key], 0);
      if (steps < 0 || steps >= 40) return false;
    }
    return true;
  }

  function isCritical() {
    // client.dll RE, 2026-10-14, Deadlock 6779: IsHealthCritical uses
    // health/maxHealth <= RemapValClamped(maxHealth, 1000, 2750, .20, .10).
    // Hero VData constructor defaults; heroes.vdata does not override them.
    var maxHp = KINDS[kind].maxHp, threshold = 0.20 - Math.max(0, Math.min(1, (maxHp - 1000) / 1750)) * 0.10;
    return shown / 100 <= threshold;
  }
  // Writes the sample-state classes on the menu pane and canvas (the only panel classes this file writes).
  function writeSampleMarks() {
    setClass(pane, "health_critical", isCritical());
    var statusLabels = $.HPColorsV3Renderer.statusLabels;
    statusLabels.forEach(function (key) {
      setClass(pane, "HPC3PreviewSample" + key, kind === "hero" && settings && settings.shared.enabled && sampleLabel === key);
    });
    // Ticket 52: the effect whose size was edited last joins the status row; its class picks the icon and the size rule.
    setClass(pane, "HPC3PreviewSampleFx", kind === "hero" && !!settings && settings.shared.enabled && sampleFx !== "");
    if (parts.fx && paintedFx !== sampleFx) {
      $.HPColorsV3Renderer.statusScales.forEach(function (entry) { setClass(parts.fx, entry.icon, sampleFx === entry.key); });
      paintedFx = sampleFx;
    }
    // The engine's citadel_unit_status_show_critical_state defaults true on the descendant root.
    setClass(parts.canvas, "ShowCriticalState", true);
  }
  // The carrier-class list for painter.paint; pure data, no panel calls.
  function classes() {
    var list = KINDS[kind].classes.concat([side === "enemy" ? "enemy" : "friend", team,
      side === "enemy" ? "ShowHealthValue" : "ShowAllyHealthValue"]);
    list.push("ShowCriticalState");
    if (isCritical()) list.push("health_critical");
    // Damage steps show the readout the way the stock bar does while the local player deals damage.
    if (feedback === "Damage") {
      list.push("active_damage");
      if (side === "enemy") list.push("active_damage_by_local_player");
    }
    return list;
  }
  function paint() {
    if (!available || !isOpen || retired) return;
    if (!partsValid()) { disable("Preview unavailable: sample bar is missing"); return; }
    try {
      // Healing holds the fill at the old value while the heal layer covers old -> new (stock order).
      span(parts.fill, 0, feedback === "Healing" ? from : shown);
      writeLayers();
      writeMotion();
      setText(parts.value, String(Math.round(KINDS[kind].maxHp * shown / 100)));
      setText(ui.health, shown + "%");
      writeSampleMarks();
      last = painter.paint(classes(), settings, view);
      camera();
      // HPV3_DEBUG $.Msg("[HPV3] preview hpTextOffsetX=" + (settings && settings.side[side].hpTextOffsetX) + " hpTextAlign=" + (settings && settings.side[side].hpTextAlign) + " geometry=" + JSON.stringify(last.facts.geometry) + " row=" + JSON.stringify(last.facts.row) + " plannedRow=" + (last.plan.styles.row && last.plan.styles.row.transform));
      // Native adoption/font changes settle after paint; do not keep a zero-width row as final geometry.
      var valueStyle = last.plan.styles.value || {}, nameStyle = last.plan.styles.name || {};
      var rootClasses = last.plan.classes.root || {}, customRow = last.plan.parents.value === "row";
      var nextReadoutKey = JSON.stringify([kind, side, cameraZoom, customRow, parts.value.text,
        valueStyle.fontFamily, valueStyle.fontSize, valueStyle.padding, valueStyle.marginLeft, valueStyle.marginRight,
        nameStyle.fontSize, nameStyle.padding, nameStyle.maxWidth, nameStyle.maxHeight,
        rootClasses.HPColorsV3Core, rootClasses.HPColorsV3NameHidden, rootClasses.HPColorsV3Level, rootClasses.HPColorsV3UltPlaced]);
      var readoutChanged = nextReadoutKey !== readoutLayoutKey;
      var rowUnlaid = customRow && !(last.facts.row.width > 0 && last.facts.row.height > 0);
      readoutLayoutKey = nextReadoutKey;
      if (readoutChanged) settleTries = 0;
      if (!last.facts.laid) settle(UNLAID_SECONDS);
      else if ((last.settle || readoutChanged || rowUnlaid) && settleTries < SETTLE_LIMIT) {
        settleTries++;
        settle(SETTLE_SECONDS);
      } else if (!last.settle && !readoutChanged && !rowUnlaid) settleTries = 0;
    } catch (error) {
      last = null;
      // HPV3_DEBUG $.Msg("[HPV3] preview paint failed: " + error);
    }
    updateStatus();
  }
  function setStyle(panel, key, value) { if (valid(panel) && panel.style[key] !== value) panel.style[key] = value; }
  // Unit kinds fit the bar and its accessories into the stage: zoom out as the bar grows or moves, never past 2x.
  // Offsets widen the box symmetrically so they stay visible instead of being re-centred away. HERO is the fixed
  // 1:1 mapping up to HERO_ZOOM_WIDTH, then pulls back with the model.
  function camera() {
    var zoomText = HERO_ZOOM, leftText = "0px", topText = "0px";
    if (kind === "hero") {
      var heroSide = settings && settings.shared && settings.shared.enabled && last && last.facts.eligible ? settings.side[side] : null;
      var f = heroSide ? Math.min(1, HERO_ZOOM_WIDTH / heroSide.barWidth) : 1;
      if (f < 1) {
        var k = Math.round(HERO_K * f * 1000) / 1000; // one-decimal percent; geometry follows the written k
        zoomText = Math.round(k * 1000) / 10 + "%";
        leftText = Math.round((HERO_ANCHOR_X / k - 100) * 10) / 10 + "px";
        topText = Math.round((HERO_ANCHOR_Y / k - 105) * 10) / 10 + "px";
      }
      heroCamera(zoomText);
    } else {
      zoomText = UNIT_CAMERA.zoom; leftText = UNIT_CAMERA.left; topText = UNIT_CAMERA.top;
    }
    // Panorama reads uiScale back as "176.0% 176.0% 176.0%", so compare against what we last wrote, not the style.
    if (zoomText !== cameraZoom) { ui.scale.style.uiScale = zoomText; cameraZoom = zoomText; }
    if (leftText !== cameraLeft) { parts.canvas.style.marginLeft = leftText; cameraLeft = leftText; }
    if (topText !== cameraTop) { parts.canvas.style.marginTop = topText; cameraTop = topText; }
  }
  // The scene panel scales about the same anchor by layout size/margins, not a transform (unproven on a scene
  // render); the cache means HP, play and repeated settings never rewrite it.
  function heroCamera(zoomText) {
    if (zoomText === modelZoom || !valid(heroModel)) return;
    var g = parseFloat(zoomText) / 100 / HERO_K, round = function (value) { return Math.round(value * 10) / 10 + "px"; };
    heroModel.style.width = round(HERO_MODEL.width * g);
    heroModel.style.height = round(HERO_MODEL.height * g);
    heroModel.style.marginLeft = round(HERO_ANCHOR_X + (HERO_MODEL.left - HERO_ANCHOR_X) * g);
    heroModel.style.marginTop = round(HERO_ANCHOR_Y + (HERO_MODEL.top - HERO_ANCHOR_Y) * g);
    modelZoom = zoomText;
  }
  function span(panel, left, right) {
    setStyle(panel, "width", "100%");
    setStyle(panel, "clip", "rect(0%, " + right + "%, 100%, " + left + "%)");
  }
  // Play feedback: the delta layer spans new -> previous HP on damage, the healing layer old -> new on heal.
  // HasHealth marks a shown layer like the engine does, so BAR STYLE OLD mirrors it into its boxes.
  function writeLayers() {
    if (feedback === "Damage") span(parts.delta, shown, from); else if (layersShown) setStyle(parts.delta, "width", "0%");
    if (feedback === "Healing") span(parts.healing, from, shown); else if (layersShown) setStyle(parts.healing, "width", "0%");
    setClass(parts.delta, "HasHealth", feedback === "Damage");
    setClass(parts.healing, "HasHealth", feedback === "Healing");
    layersShown = feedback === "Damage" || feedback === "Healing";
  }
  // Only step targets change in JS. Stock transform transitions/opacity keyframes do all interpolation.
  function writeMotion() {
    setClass(pane, "HPC3PreviewPlaying", playing);
    var phase = playIndex % 2 ? "A" : "B";
    ["Damage", "Heal"].forEach(function (name) {
      ["A", "B"].forEach(function (suffix) {
        setClass(pane, "HPC3Preview" + name + suffix, playing && phase === suffix && feedback === (name === "Heal" ? "Healing" : name));
      });
    });
    var f = (feedback === "Healing" ? from : shown) / 100, key = String(f);
    if (key !== visualKey) {
      parts.visualFill.style.preTransformScale2d = String(f) + ", 1";
      parts.visualFill.style.transform = "translateX(" + Math.round(-(1 - f) * INNER_W / 2 * 100) / 100 + "px)";
      visualKey = key;
    }
  }
  function updateStatus() {
    var detail = !last ? "Preview unavailable"
      : last.reason === "off" ? "HP Colors is off: stock look"
        : last.reason === "unlaid" ? "Waiting for layout"
          : last.reason === "painted" ? "Your settings" : kind !== "hero" ? "Turn on Customize " +
            (kind === "neutral" ? "neutral camps" : "objective bars") + " to style this bar" : "Stock look";
    statusText = (feedback || (playing ? "Playing" : "Ready")) + " · " + detail;
    setText(ui.status, statusText);
    setClass(ui.play, "Playing", playing);
    setText(ui.playLabel, playing ? "STOP" : "PLAY DAMAGE / HEAL");
  }
  function writeTicks() {
    var maxHp = KINDS[kind].maxHp;
    if (tickMaxHp === maxHp && tickRoot === parts.lines) return;
    parts.lines.RemoveAndDeleteChildren();
    // Stock UpdateTickBar: one line per 250 HP, every fourth large, including the max-HP endpoint.
    for (var k = 1; k <= Math.floor(maxHp / 250); k++) {
      var line = $.CreatePanel("Panel", parts.lines, "HPColorsPreviewBarTick" + k);
      line.AddClass(k % 4 ? "HPC3PreviewTickSmall" : "HPC3PreviewTickLarge");
      line.AddClass(k % 4 ? "line_small" : "line_large");
      line.hittest = false;
      line.style.position = String(250 * k / maxHp * 100) + "% 0px 0px";
    }
    tickMaxHp = maxHp; tickRoot = parts.lines;
  }
  function writeChrome() {
    for (var name in KINDS) setClass(pane, KINDS[name].css, name === kind);
    setClass(pane, "HPC3PreviewSideEnemy", side === "enemy");
    setClass(pane, "HPC3PreviewSideAlly", side === "ally");
    setClass(pane, "HPC3PreviewUnitsPage", page === "Units");
    setClass(ui.sideEnemy, "Selected", side === "enemy");
    setClass(ui.sideAlly, "Selected", side === "ally");
    setClass(ui.sideEnemy, "fill", side === "enemy");
    setClass(ui.sideAlly, "fill", side === "ally");
    setClass(ui.teamAmber, "Selected", team === "team1");
    setClass(ui.teamSapphire, "Selected", team === "team2");
    setClass(ui.teamAmber, "fill", team === "team1");
    setClass(ui.teamSapphire, "fill", team === "team2");
    setClass(ui.kindObjective, "Selected", unitKind === "objective");
    setClass(ui.kindNeutral, "Selected", unitKind === "neutral");
    setClass(ui.kindObjective, "fill", unitKind === "objective");
    setClass(ui.kindNeutral, "fill", unitKind === "neutral");
    setText(parts.name, KINDS[kind].names[side]);
    writeTicks();
    setText(ui.title, KINDS[kind].title + (kind === "neutral" ? "" : " · " + (side === "enemy" ? "ENEMY" : "ALLY")));
  }

  // ---- Play, edit-shake and layout debounce have independent slots and stale-callback guards.
  function cancel() {
    // Any cancel of play also ends the edit-shake (also: a settings change with shake off, close, page/side/kind change).
    cancelShake();
    cancelSlot(playSlot);
    cancelSettle();
    playing = false; feedback = ""; shown = hp; from = hp; settleTries = 0;
    if (layersShown && parts) { setStyle(parts.delta, "width", "0%"); setStyle(parts.healing, "width", "0%"); }
    layersShown = false;
    if (parts) {
      writeMotion();
      span(parts.fill, 0, hp);
    }
  }
  function cancelSlot(target) {
    target.generation++;
    if (target.job) { try { $.CancelScheduled(target.job); } catch (error) { /* Already ran. */ } }
    target.job = null;
  }
  // A stale callback must not clear the current job slot. Play and settle callbacks (`guarded`) also stop once the
  // preview is closed, retired or its pane is gone. Job functions keep their names: tests find the jobs by them.
  function fires(target, token, guarded) {
    if (token !== target.generation) return false;
    target.job = null;
    return !guarded || !(retired || !isOpen || !valid(pane));
  }
  function cancelShake() {
    cancelSlot(shakeSlot);
    setClass(pane, "HPC3PreviewShakeEdit", false);
  }
  function shakeOnEdit() {
    cancelShake();
    if (!available || !isOpen || retired || playing || !settings || !settings.shared.damageShakeEnabled) return;
    setClass(pane, "HPC3PreviewShakeEdit", true);
    var token = shakeSlot.generation;
    shakeSlot.job = $.Schedule(3, function previewShakeEnd() {
      if (fires(shakeSlot, token, false)) setClass(pane, "HPC3PreviewShakeEdit", false);
    });
  }
  function cancelSettle() { cancelSlot(settleSlot); }
  function settle(delay) {
    cancelSettle();
    var token = settleSlot.generation;
    settleSlot.job = $.Schedule(delay, function previewSettle() { if (fires(settleSlot, token, true)) paint(); });
  }
  function schedule(delay, fn) {
    var token = playSlot.generation;
    playSlot.job = $.Schedule(delay, function previewStep() { if (fires(playSlot, token, true)) fn(); });
  }
  function step() {
    var value = SEQUENCE[playIndex++];
    feedback = value < shown ? "Damage" : "Healing";
    from = shown; shown = value;
    schedule(STEP_SECONDS, playIndex < SEQUENCE.length ? step : finish);
    paint();
  }
  function finish() {
    playing = false; feedback = ""; shown = hp; from = hp;
    paint();
  }
  function togglePlay() {
    if (!available || !isOpen || retired) return;
    var wasPlaying = playing;
    cancel();
    if (wasPlaying) { paint(); return; }
    playing = true; playIndex = 0;
    step();
  }
  function onSlider() {
    if (syncing || !available || retired) return;
    var raw = Number(ui.slider.value);
    if (!Number.isFinite(raw)) return;
    var value = Math.round(Math.max(0, Math.min(100, raw)));
    // Echoes of our own writes carry the current value; real input differs.
    if (value === hp) return;
    cancel();
    hp = value; shown = value;
    paint();
  }
  function kindFor(name) { return name === "Units" ? unitKind : "hero"; }
  function change(update) {
    if (!available || retired) return;
    cancel();
    update();
    writeChrome();
    paint();
  }
  function bind(panel, eventName, handler) { panel.SetPanelEvent(eventName, handler); }

  // Side, team and unit kind are driven by the preview's own buttons (team and unit kind only from there).
  function setSide(name) {
    if ((name !== "enemy" && name !== "ally") || name === side) return;
    change(function () { side = name; team = SIDE_TEAMS[name]; });
  }
  function setTeam(name) {
    if ((name !== "team1" && name !== "team2") || name === team) return;
    change(function () { team = name; });
  }
  function setUnitKind(name) {
    if ((name !== "objective" && name !== "neutral") || name === unitKind) return;
    change(function () { unitKind = name; kind = kindFor(page); });
  }

  $.HPColorsV3Preview = {
    attach: function (root, initial) {
      if (retired) return false;
      var renderer = $.HPColorsV3Renderer;
      // Early out only for the pane of this root: a still-valid pane of another (older) root is not attached here.
      var rootPane = valid(root) ? root.FindChildTraverse("HPColorsPreview") : null;
      if (available && valid(pane) && rootPane === pane && partsValid()) return true;
      if (!resolve(root)) {
        // Missing sample parts: mark whatever pane exists so it does not pose as a working preview.
        available = false;
        if (valid(root)) setClass(root.FindChildTraverse("HPColorsPreview"), "HPC3PreviewUnavailable", true);
        return false;
      }
      cancel();
      if (painter) { try { painter.release(); } catch (error) { /* Old tree gone. */ } }
      painter = null;
      try { painter = renderer && typeof renderer.createPainter === "function" ? renderer.createPainter(parts.canvas, parts, SAMPLE) : null; } catch (error) { painter = null; }
      if (!painter) { disable("Preview unavailable: renderer not loaded"); return false; }
      touch = PREVIEW_ONLY.concat((renderer.parts || []).filter(function (def) { return def.preview && def.find !== "derived"; }).map(function (def) { return def.key; }))
        .map(function (key) { return { key: key, label: renderer.statusLabels.indexOf(key.replace(/Anchor$/, "")) >= 0 ? key.replace(/Anchor$/, "") : "" }; });
      setClass(pane, "HPC3PreviewUnavailable", false);
      if (initial) settings = initial;
      available = true;
      syncing = true;
      try { ui.slider.min = 0; ui.slider.max = 100; ui.slider.increment = 1; ui.slider.value = hp; } finally { syncing = false; }
      bind(ui.slider, "onvaluechanged", onSlider);
      bind(ui.play, "onactivate", togglePlay);
      bind(ui.sideEnemy, "onactivate", function () { setSide("enemy"); });
      bind(ui.sideAlly, "onactivate", function () { setSide("ally"); });
      bind(ui.teamAmber, "onactivate", function () { setTeam("team1"); });
      bind(ui.teamSapphire, "onactivate", function () { setTeam("team2"); });
      bind(ui.kindObjective, "onactivate", function () { setUnitKind("objective"); });
      bind(ui.kindNeutral, "onactivate", function () { setUnitKind("neutral"); });
      writeChrome();
      paint();
      return true;
    },
    open: function () {
      if (!available || retired) return;
      isOpen = true;
      paint();
    },
    close: function () {
      cancel();
      isOpen = false;
    },
    setPage: function (name) { change(function () { sampleLabel = ""; sampleFx = ""; page = name; kind = kindFor(page); }); },
    setSide: setSide,
    // Settings edits repaint in place; a running sequence continues with the new settings.
    // The optional options carry session-only SHOW BOUNDS (never part of the settings) and `shake`: a user edit, so the
    // sample shakes after the repaint (reads the new settings' damageShakeEnabled, hence set and paint first).
    setSettings: function (next, nextView) {
      try {
        // A status is not normally active on this plain sample. Show only the label
        // being edited; do not synthesize gameplay classes or change HP/critical flashing.
        var shared = $.HPColorsV3Renderer;
        if (settings && next && shared && shared.statusLabels) shared.statusLabels.forEach(function (key) {
          if (["IndicatorVisible", "OffsetX", "OffsetY"].some(function (suffix) { return settings.shared[key + suffix] !== next.shared[key + suffix]; }))
            sampleLabel = key;
        });
        if (settings && next && shared && shared.statusScales) shared.statusScales.forEach(function (entry) {
          if (settings.shared[entry.key] !== next.shared[entry.key]) sampleFx = entry.key;
        });
        settings = next;
        if (!settings || !settings.shared.damageShakeEnabled) cancelShake();
        if (nextView && typeof nextView === "object") view = { showBounds: nextView.showBounds === true };
        if (available && isOpen && !retired) paint();
      } finally {
        // Fires even when paint threw, as when the menu made two separate calls (setSettings, then shakeOnEdit).
        if (nextView && nextView.shake === true) shakeOnEdit();
      }
    },
    retire: function () {
      cancel();
      // Hand the tree back in stock state: the next instance starts a fresh ownership ledger.
      if (painter) { try { painter.release(); } catch (error) { /* Old tree gone. */ } }
      // The next instance assumes the model's static CSS (1:1) geometry, so hand a zoomed-out model back at 1:1.
      try { heroCamera(HERO_ZOOM); } catch (error) { /* Old tree gone. */ }
      retired = true; isOpen = false; available = false;
    },
    inspect: function () {
      return { available: available, open: isOpen, playing: playing, page: page, kind: kind, side: side, team: team, hp: hp, shown: shown,
        scheduled: !!playSlot.job || !!settleSlot.job || !!shakeSlot.job, generation: playSlot.generation, owned: painter ? painter.owned() : 0, status: statusText,
        painted: !!last && last.painted, facts: last && last.facts };
    }
  };
  function disable(reason) {
    cancel();
    available = false;
    setClass(pane, "HPC3PreviewUnavailable", true);
    if (ui) setText(ui.status, reason);
    statusText = reason;
  }
})();
