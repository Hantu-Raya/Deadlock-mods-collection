(() => {
  "use strict";

  const PANEL_IDS = {
    btRoot: "BTSettingsRoot", btGear: "BTSettingsGear", btPanel: "BTSettingsPanel",
    btStrengthHost: "BTGlowStrengthHost", btStrengthValue: "BTGlowStrengthValue",
    btEditor: "BTColorEditor", btPresetRow: "BTPresetRow",
    btSpectrumHost: "BTSpectrumHost", btHexEntry: "BTColorHexEntry",
    btBrightnessHost: "BTBrightnessHost", btBrightnessValue: "BTBrightnessValue",
    btLinger: "BTLingerToggle", btGlow: "BTGlowToggle", btBorder: "BTBorderToggle",
    btOpacityHost: "BTMapOpacityHost", btOpacityValue: "BTMapOpacityValue",
    btStatus: "BTSettingsStatus", btReset: "BTSettingsReset",
    btResetLabel: "BTSettingsResetLabel", btStore: "BTSettingsStore",
    btLayoutButton: "BTLayoutButton", btLayoutBar: "BTLayoutBar",
    btLayoutDone: "BTLayoutDone", btLayoutCancel: "BTLayoutCancel", btLayoutReset: "BTLayoutReset",
    btLayoutGrip: "BTLayoutBarGrip"
  };
  const UI = { minimap: $.GetContextPanel(), host: null, /** @type {!Object} */ colorRows: {} };
  let _parent = null;
  let _gen = 0;
  let _stopped = false;
  let _bootHnd = null;
  let _loopHnd = null;
  let _tick = 0;
  let _layoutAttempts = 0;
  let _enemyMarkers = [];

  // Durable save through the hpv2-store /bt/ page. Transport (fragment in, HTMLTitle out) follows hp_colors_v2_storage.js, but this page owns one key and its
  // own prefix/version, so it never touches HP Colors data. JSON keys are quoted: Closure must not rename them.
  const BT_STORE_URL = "https://hantu-raya.github.io/hpv2-store/bt/";
  const BT_STORE_VERSION = 1;
  const BT_STORE_PREFIX = "BTS1:";
  // 3 adds the optional timer layout "t"; 4 the optional custom colours "c" and glow strength "k"; 5 the optional
  // minimap size "t"."m" and spot "t"."mp", borderless "b" and opacity "o"; 6 the optional map location label "t"."lc"
  // (older builds read a newer schema as a newer save, not a damaged one). Older saves load.
  const BT_SCHEMA = 6;
  const BT_REPLY_TIMEOUT_S = 5;
  const BT_HELLO_RETRY_S = 8;
  const BT_READY_TIMEOUT_MS = 30000;
  const BT_SAVE_DELAY_S = 1.5;
  const BT_SAVE_RETRY_S = [2, 4, 8];
  const BT_RESET_CONFIRM_S = 3;
  // Every colour the menu edits. rec: its key in the saved record ("u"/"d" top level since schema 1; the others go in
  // "c", only when changed) and in the look sent to the timer. Arrow rows wash the minimap glyph; the others fill a
  // square swatch. Defaults are today's CSS colours (bt_minimap_arrows.css, buff_claim.css).
  const BT_COLORS = [
    { key: "up", row: "BTUpColor", swatch: "BTUpColorArrow", hex: "BTUpColorHex", def: "#FFE14D", rec: "u", top: true },
    { key: "down", row: "BTDownColor", swatch: "BTDownColorArrow", hex: "BTDownColorHex", def: "#4DD2FF", rec: "d", top: true },
    { key: "ally", row: "BTAllyColor", swatch: "BTAllyColorSwatch", hex: "BTAllyColorHex", def: "#64FFC8", rec: "a", top: false },
    { key: "enemy", row: "BTEnemyColor", swatch: "BTEnemyColorSwatch", hex: "BTEnemyColorHex", def: "#FF3232", rec: "e", top: false },
    { key: "gun", row: "BTGlowGunColor", swatch: "BTGlowGunColorSwatch", hex: "BTGlowGunColorHex", def: "#FFB450", rec: "w", top: false },
    { key: "casting", row: "BTGlowCastingColor", swatch: "BTGlowCastingColorSwatch", hex: "BTGlowCastingColorHex", def: "#B464FF", rec: "p", top: false },
    { key: "survival", row: "BTGlowSurvivalColor", swatch: "BTGlowSurvivalColorSwatch", hex: "BTGlowSurvivalColorHex", def: "#64FF64", rec: "v", top: false },
    { key: "movement", row: "BTGlowMovementColor", swatch: "BTGlowMovementColorSwatch", hex: "BTGlowMovementColorHex", def: "#64C8FF", rec: "m", top: false }
  ];
  // Bridge glow strength in percent: below 100 dims, above 100 also reaches further into the minimap.
  const BT_STRENGTH_MIN = 10;
  const BT_STRENGTH_MAX = 150;
  const BT_STRENGTH_DEFAULT = 100;
  // Whole-minimap opacity in percent (record "o", only when not 100).
  const BT_OPACITY_MIN = 20;
  const BT_OPACITY_MAX = 100;
  const BT_OPACITY_STEP = 5;
  // Minimap size in percent of stock (layout model key "m" holds it as a fraction; absent = 100).
  const BT_MAP_SCALE_MIN = 50;
  const BT_MAP_SCALE_MAX = 150;
  // One-click presets. Schema 1 (first settings build) stored indices into this list, so never reorder or remove entries.
  const BT_PRESETS = ["#FFE14D", "#4DD2FF", "#FFFFFF", "#FF4D4D", "#FF9A3D", "#5CFF6B", "#3DFFE0", "#FF4DFF", "#A970FF", "#FF8FC8"];
  // Spectrum slider: positions 0-1000 and the stops the CSS draws (stock settings_color_slider.css), black - hues - white.
  const BT_SPECTRUM_MAX = 1000;
  const BT_SPECTRUM = [
    [0, 0, 0, 0], [80, 255, 0, 0], [220, 255, 255, 0], [360, 0, 255, 0], [500, 0, 255, 255],
    [640, 0, 0, 255], [780, 255, 0, 255], [920, 255, 0, 0], [1000, 255, 255, 255]
  ];
  const BT_HEX = /^#[0-9A-F]{6}$/;
  // colors: keyed by BT_COLORS[].key (bracket access only). layout: saved timer widget model, {key: [x fraction,
  // y fraction, scale, side]} plus "m": minimap size fraction and "mp": [x, y] fractions of its box; absent = default.
  const BtSettings = {
    /** @type {!Object} */ colors: btDefaultColors(), strength: BT_STRENGTH_DEFAULT,
    linger: true, glow: true, border: true, opacity: BT_OPACITY_MAX,
    /** @type {!Object} */ layout: {}
  };
  // The stock minimap's look (ring frame + blur backdrop, whole-minimap opacity): its panels, found once, and the look
  // last written on them ("?" = nothing yet, so the first apply writes even the stock look a predecessor may have changed).
  const BtMapLook = { written: "?", /** @type {?} */ container: null, /** @type {?} */ frame: null, /** @type {?} */ blur: null };
  // Live 2026-10-09: clearing an inline visibility: collapse with null left the ring hidden for good, so a ring this
  // script hid (or finds hidden inline) is shown with an explicit "visible". Stock CSS sets no visibility on either.
  function btRingShown(panel) {
    if (BtMapLook.written.charAt(0) === "b") return "visible";
    try { return panel.style["visibility"] === "collapse" ? "visible" : null; } catch { return "visible"; }
  }
  // Last look handed to the timer (per timer instance), so unchanged looks are not re-sent every tick.
  const BtLook = { /** @type {?} */ api: null, sent: "" };
  function btDefaultColors() {
    const colors = {};
    for (const target of BT_COLORS) colors[target.key] = target.def;
    return colors;
  }
  // phase: idle -> hello -> read -> ready | blocked (unreadable save, RESET overwrites) | unavailable (session only)
  const BtStore = {
    /** @type {?} */ panel: null,
    seq: 0, phase: "idle", helloId: "", helloHnd: null, startMs: 0,
    pendingId: "", pendingOp: "", timeoutHnd: null, readRetried: false,
    savedRecord: "", sentRecord: "", saveHnd: null, retry: 0,
    status: "LOADING", resetArmed: false, resetHnd: null
  };
  // Inline colour editor shared by every colour row. seed is the spectrum position the script last wrote; the engine
  // echoes it through onvaluechanged (possibly a frame later), and that echo must not replace a colour that is off the
  // spectrum. base is the colour last picked by row, preset, spectrum or hex: brightness scales it, so dimming to
  // black and back keeps the hue.
  const BtEditor = {
    target: "", seed: -1, base: "",
    /** @type {?} */ slider: null,
    /** @type {?} */ bright: null,
    /** @type {!Array<?>} */ presets: []
  };
  // Enemy map_button -> its #LocalSpecularImage and the wash written there.
  const _btArrowPaint = new WeakMap();
  // Menu swatch -> the colour last written on it.
  const _btSwatchCache = new WeakMap();
  let _btMenuOpen = false;
  // Movable timer widgets. The timer script owns the slots and their geometry ($["BTTimerLayout"]: apply, metrics,
  // panel); this script owns the saved model, the edit session and the handlers bound on the timer's slots.
  // Geometry is in layer layout px (window px / layer ui scale); the model stores top-left fractions of the layer.
  // [model key, slot id, has side arrows]. The claim boxes (cl/cr) only move and scale. The model's "m"/"mp" (minimap
  // size and spot) come from the minimap's border, "lc" from the map location label's (BTSlotMap*/BTSlotLoc*, in the
  // timer's edit layer).
  const BT_LAYOUT_SLOTS = [
    ["b", "BTSlotBuff", true], ["r", "BTSlotRejuv", true], ["f", "BTSlotRift", true], ["u", "BTSlotUrn", true],
    ["cl", "BTSlotClaimL", false], ["cr", "BTSlotClaimR", false]
  ];
  const BT_LAYOUT_SIDES = ["l", "r", "t", "b"];
  // The pills can also hide their icon (side "n"); showing it again uses the default side.
  const BT_ICON_DEFAULT_SIDE = { "b": "r", "r": "l" };
  const BT_LAYOUT_CORNERS = ["TL", "TR", "BL", "BR"];
  const BT_LAYOUT_SNAP = 8;
  const BT_LAYOUT_TICK_S = 0.02;
  // Map location label ("lc": [dx, dy, degrees], offset from its stock spot in minimap px): its stock turn (stock CSS
  // rotateZ(-30deg)), the largest offset, and the knob's soft snap to 15 degree steps within 4 degrees.
  const BT_LOC_DEG = -30;
  const BT_LOC_MAX = 1000;
  const BT_LOC_TURN_STEP = 15;
  const BT_LOC_TURN_SNAP = 4;
  // Edit bar: width matches .bt-layout-bar; the height is measured once laid out (estimate before that).
  const BT_BAR_W = 330;
  const BT_BAR_EST_H = 150;
  const BT_BAR_GAP = 6;
  const BtLayout = {
    editing: false,
    /** @type {?Object} */ draft: null,
    // The timer instance whose slots carry our handlers; a timer reboot publishes a new object.
    /** @type {?} */ api: null,
    /** @type {?} */ boundApi: null,
    /** @type {?} */ drag: null,
    /** @type {?} */ dragHnd: null,
    bound: new WeakSet(),
    // Edit bar spot in settings-host layout px: barPos is where the player dragged it (kept for the session),
    // barXY the last spot written, barWritten its style string.
    /** @type {?} */ barPos: null,
    /** @type {?} */ barXY: null,
    barWritten: ""
  };

  // Returns null so callers write `BtStore.x = btCancel(BtStore.x)`; dotted access keeps Closure renames consistent.
  function btCancel(handle) {
    if (handle !== null) {
      try { $.CancelScheduled(handle); } catch {}
    }
    return null;
  }
  function panelValid(panel) {
    try { return !!(panel && panel.IsValid && panel.IsValid()); } catch {}
    return false;
  }
  function setPanelClass(panel, className, enabled) {
    if (!panelValid(panel)) return false;
    const shouldHave = !!enabled;
    let hasClass = false;
    try { hasClass = !!panel.BHasClass?.(className); } catch { hasClass = false; }
    if (hasClass === shouldHave) return true;
    try {
      if (typeof panel.SetHasClass !== "function") return false;
      panel.SetHasClass(className, shouldHave);
      return true;
    } catch {
      return false;
    }
  }
  function setPanelText(panel, text) {
    if (!panelValid(panel)) return false;
    try {
      if (panel.text !== text) panel.text = text;
      return true;
    } catch { return false; }
  }
  function stop() {
    if (_stopped) return;
    _stopped = true;
    _bootHnd = btCancel(_bootHnd);
    _loopHnd = btCancel(_loopHnd);
    BtStore.helloHnd = btCancel(BtStore.helloHnd);
    BtStore.timeoutHnd = btCancel(BtStore.timeoutHnd);
    BtStore.saveHnd = btCancel(BtStore.saveHnd);
    BtStore.resetHnd = btCancel(BtStore.resetHnd);
    btLayoutDragStop();
    // Without a successor the timer must not stay in edit mode (draggable slots, sample text). A replaced instance
    // leaves the timer alone: its successor may already be editing (and showing its own minimap size).
    let replaced = false;
    try { replaced = panelValid(_parent) && _parent.GetAttributeInt("bt_settings_gen", 0) !== _gen; } catch {}
    if (BtLayout.editing && BtLayout.api && !replaced) {
      BtLayout.editing = false;
      try { BtLayout.api["apply"](BtSettings.layout, false); } catch {}
    }
    // Likewise the minimap look goes back to stock only without a successor.
    if (!replaced) btRestoreMapLook();
  }
  function alive() {
    if (_stopped) return false;
    let current = false;
    try {
      current = panelValid(UI.minimap) && panelValid(_parent) &&
        _parent.GetAttributeInt("bt_settings_gen", 0) === _gen;
    } catch {}
    if (!current) stop();
    return current;
  }
  function btSchedule(delay, callback) {
    return $.Schedule(delay, () => {
      if (!alive()) return;
      callback();
    });
  }
  function btChecksum(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }
  function btEncode() {
    const colors = BtSettings.colors;
    const data = {
      "s": BT_SCHEMA, "u": colors["up"], "d": colors["down"],
      "l": BtSettings.linger ? 1 : 0, "g": BtSettings.glow ? 1 : 0
    };
    // Only moved widgets have entries, in slot order so equal layouts encode equally; then the minimap size.
    let layout = null;
    for (const slot of BT_LAYOUT_SLOTS) {
      const entry = BtSettings.layout[slot[0]];
      if (!entry) continue;
      if (!layout) layout = {};
      layout[slot[0]] = entry.slice();
    }
    for (const key of ["m", "mp", "lc"]) {
      const value = BtSettings.layout[key];
      if (value === undefined) continue;
      if (!layout) layout = {};
      layout[key] = Array.isArray(value) ? value.slice() : value;
    }
    if (layout) data["t"] = layout;
    // Only changed claim/glow colours, in table order; strength only when not 100.
    let custom = null;
    for (const target of BT_COLORS) {
      if (target.top || colors[target.key] === target.def) continue;
      if (!custom) custom = {};
      custom[target.rec] = colors[target.key];
    }
    if (custom) data["c"] = custom;
    if (BtSettings.strength !== BT_STRENGTH_DEFAULT) data["k"] = BtSettings.strength;
    // Minimap look: only when not stock.
    if (!BtSettings.border) data["b"] = 0;
    if (BtSettings.opacity !== BT_OPACITY_MAX) data["o"] = BtSettings.opacity;
    const body = JSON.stringify(data);
    return "BTS1." + btChecksum(body) + "." + body;
  }
  // "c": {rec: "#RRGGBB"} for the non-top colours. Strict like the layout: one bad entry damages the record.
  function btDecodeCustom(value) {
    const colors = {};
    if (value === undefined) return colors;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    for (const rec of Object.keys(value)) {
      // "h": the minimap glow colour of one 2026-10-09 build, since removed; dropped on the next save.
      if (rec === "h") continue;
      const target = BT_COLORS.find((entry) => entry.rec === rec && !entry.top);
      const color = value[rec];
      if (!target || typeof color !== "string" || !BT_HEX.test(color)) return null;
      colors[target.key] = color;
    }
    return colors;
  }
  // Strict: one bad entry makes the whole record unreadable, like any other damage. "lc" (the map location label) is
  // a schema 6 key.
  function btDecodeLayout(value, schema) {
    const layout = {};
    if (value === undefined) return layout;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    for (const key of Object.keys(value)) {
      if (key === "m") {
        const size = btMapScalePercent(value[key]);
        if (size === 0) return null;
        layout[key] = size / 100;
        continue;
      }
      if (key === "mp") {
        const spot = value[key];
        if (!Array.isArray(spot) || spot.length !== 2 || !spot.every((part) => typeof part === "number" && part >= 0 && part <= 1)) return null;
        layout[key] = spot.slice();
        continue;
      }
      if (key === "lc" && schema >= 6) {
        const loc = value[key];
        if (!Array.isArray(loc) || loc.length !== 3 || !loc.every((part) => typeof part === "number")) return null;
        if (!(Math.abs(loc[0]) <= BT_LOC_MAX && Math.abs(loc[1]) <= BT_LOC_MAX && loc[2] >= -180 && loc[2] <= 180)) return null;
        layout[key] = loc.slice();
        continue;
      }
      if (!BT_LAYOUT_SLOTS.some((slot) => slot[0] === key)) return null;
      const entry = value[key];
      if (!Array.isArray(entry) || entry.length !== 4) return null;
      const x = entry[0];
      const y = entry[1];
      const s = entry[2];
      if (typeof x !== "number" || typeof y !== "number" || typeof s !== "number") return null;
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1 && s >= 0.5 && s <= 2)) return null;
      if (BT_LAYOUT_SIDES.indexOf(entry[3]) < 0 && !(entry[3] === "n" && BT_ICON_DEFAULT_SIDE[key])) return null;
      layout[key] = [x, y, s, entry[3]];
    }
    return layout;
  }
  function btNormalizeHex(value) {
    if (typeof value !== "string") return "";
    let text = value.trim().toUpperCase();
    if (text.charAt(0) !== "#") text = "#" + text;
    if (/^#[0-9A-F]{3}$/.test(text)) text = "#" + text[1] + text[1] + text[2] + text[2] + text[3] + text[3];
    return BT_HEX.test(text) ? text : "";
  }
  function btIsFlag(value) {
    return value === 0 || value === 1;
  }
  // absent | valid | corrupt | unsupported (newer schema). Only valid records are applied.
  function btDecode(record) {
    const result = {
      kind: "absent", /** @type {!Object} */ colors: btDefaultColors(), strength: BT_STRENGTH_DEFAULT,
      linger: true, glow: true, border: true, opacity: BT_OPACITY_MAX,
      /** @type {!Object} */ layout: {}
    };
    if (record === null || record === undefined) return result;
    result.kind = "corrupt";
    if (typeof record !== "string" || record.slice(0, 5) !== "BTS1." || record.charAt(13) !== ".") return result;
    const body = record.slice(14);
    if (btChecksum(body) !== record.slice(5, 13)) return result;
    let data = null;
    try { data = JSON.parse(body); } catch { return result; }
    if (!data || typeof data !== "object") return result;
    const schema = data["s"];
    if (Number.isInteger(schema) && schema > BT_SCHEMA) {
      result.kind = "unsupported";
      return result;
    }
    if (!btIsFlag(data["l"])) return result;
    let up = "";
    let down = "";
    let glow = 1;
    if (schema === 1) {
      up = BT_PRESETS[data["u"]] || "";
      down = BT_PRESETS[data["d"]] || "";
    } else if (schema >= 2 && schema <= BT_SCHEMA) {
      up = typeof data["u"] === "string" && BT_HEX.test(data["u"]) ? data["u"] : "";
      down = typeof data["d"] === "string" && BT_HEX.test(data["d"]) ? data["d"] : "";
      glow = data["g"];
    }
    const layout = schema >= 3 ? btDecodeLayout(data["t"], schema) : {};
    const custom = schema >= 4 ? btDecodeCustom(data["c"]) : {};
    const strength = schema >= 4 && data["k"] !== undefined ? data["k"] : BT_STRENGTH_DEFAULT;
    if (!up || !down || !btIsFlag(glow) || !layout || !custom) return result;
    if (!Number.isInteger(strength) || strength < BT_STRENGTH_MIN || strength > BT_STRENGTH_MAX) return result;
    const border = schema >= 5 && data["b"] !== undefined ? data["b"] : 1;
    const opacity = schema >= 5 && data["o"] !== undefined ? data["o"] : BT_OPACITY_MAX;
    if (!btIsFlag(border) || !Number.isInteger(opacity) || opacity < BT_OPACITY_MIN || opacity > BT_OPACITY_MAX) return result;
    result.layout = layout;
    result.kind = "valid";
    result.colors["up"] = up;
    result.colors["down"] = down;
    for (const key of Object.keys(custom)) result.colors[key] = custom[key];
    result.strength = strength;
    result.linger = data["l"] === 1;
    result.glow = glow === 1;
    result.border = border === 1;
    result.opacity = opacity;
    return result;
  }

  // The engine flips arrowUp/arrowDown; CSS swaps the image and this writes the chosen wash on the same panel.
  // The cached image is re-checked when a wash is written and on revalidate (marker rescan, settings change), so a
  // replaced image is repainted within one rescan.
  /** @param {boolean=} revalidate */
  function btPaintArrows(markers, revalidate) {
    for (let i = 0, len = markers.length; i < len; i++) {
      const btn = markers[i];
      if (!panelValid(btn)) continue;
      try {
        let paint = _btArrowPaint.get(btn);
        if (!paint || (revalidate === true && !panelValid(paint.image))) {
          const image = btn.FindChildTraverse("LocalSpecularImage");
          if (!panelValid(image)) continue;
          paint = { image: image, color: "" };
          _btArrowPaint.set(btn, paint);
        }
        const colors = BtSettings.colors;
        const color = btn.BHasClass("arrowUp") ? colors["up"] : btn.BHasClass("arrowDown") ? colors["down"] : "";
        if (!color || color === paint.color || !panelValid(paint.image)) continue;
        paint.image.style.washColor = color;
        paint.color = color;
      } catch {}
    }
  }
  // The '?' and glow switches belong to the buff timer; it reads these classes on #hud_minimap. Claim and glow colours
  // and the glow strength go to it through BTTimerLayout.look.
  function btApplyToHud() {
    btPaintArrows(_enemyMarkers, true);
    setPanelClass(UI.minimap, "bt-linger-off", !BtSettings.linger);
    setPanelClass(UI.minimap, "bt-glow-off", !BtSettings.glow);
    btLookPush();
    btApplyMapLook();
  }
  // Borderless hides the stock ring frame and its blur backdrop; opacity fades #minimap_container (map, markers and
  // the timer's glows and '?' labels; the timer widgets live outside it). Inline styles, null = stock CSS.
  function btApplyMapLook() {
    const look = (BtSettings.border ? "" : "b") + "|" + (BtSettings.opacity === BT_OPACITY_MAX ? "" : BtSettings.opacity);
    if (look === BtMapLook.written || !btMapLookPanels()) return;
    try {
      BtMapLook.frame.style["visibility"] = BtSettings.border ? btRingShown(BtMapLook.frame) : "collapse";
      BtMapLook.blur.style["visibility"] = BtSettings.border ? btRingShown(BtMapLook.blur) : "collapse";
      BtMapLook.container.style["opacity"] = BtSettings.opacity === BT_OPACITY_MAX ? null : String(BtSettings.opacity / 100);
    } catch { return; }
    BtMapLook.written = look;
  }
  function btRestoreMapLook() {
    if (BtMapLook.written === "?" || BtMapLook.written === "|" || !btMapLookPanels()) return;
    try {
      BtMapLook.frame.style["visibility"] = btRingShown(BtMapLook.frame);
      BtMapLook.blur.style["visibility"] = btRingShown(BtMapLook.blur);
      BtMapLook.container.style["opacity"] = null;
    } catch {}
    BtMapLook.written = "|";
  }
  // Stock hud.xml: #minimap_container > #minimap_blur, #minimap_frame, #HudMinimapContainer > #hud_minimap (us).
  function btMapLookPanels() {
    if (panelValid(BtMapLook.container) && panelValid(BtMapLook.frame) && panelValid(BtMapLook.blur)) return true;
    try {
      let container = UI.minimap.GetParent();
      container = panelValid(container) ? container.GetParent() : null;
      if (!panelValid(container) || container.id !== "minimap_container") return false;
      BtMapLook.container = container;
      BtMapLook.frame = container.FindChildTraverse("minimap_frame");
      BtMapLook.blur = container.FindChildTraverse("minimap_blur");
    } catch { return false; }
    return panelValid(BtMapLook.frame) && panelValid(BtMapLook.blur);
  }
  // Sent once per timer instance and change, and only after the save was read (before that the timer keeps its CSS).
  function btLookPush() {
    if (!btEditable()) return;
    const api = btLayoutApi();
    if (!api || typeof api["look"] !== "function") return;
    const look = {};
    for (const target of BT_COLORS) {
      if (!target.top) look[target.rec] = BtSettings.colors[target.key];
    }
    look["k"] = BtSettings.strength;
    const text = JSON.stringify(look);
    if (api === BtLook.api && text === BtLook.sent) return;
    try {
      if (api["look"](look) === true) {
        BtLook.api = api;
        BtLook.sent = text;
      }
    } catch {}
  }
  function btEditable() {
    return BtStore.phase === "ready" || BtStore.phase === "blocked" || BtStore.phase === "unavailable";
  }
  function btSetStatus(text) {
    BtStore.status = text;
    btRefreshMenu();
  }
  function btRefreshMenu() {
    setPanelClass(UI.btPanel, "open", _btMenuOpen);
    setPanelClass(UI.btGear, "open", _btMenuOpen);
    if (!_btMenuOpen) return;
    setPanelClass(UI.btPanel, "loading", !btEditable());
    // The timer's presence class controls whether its '?' and glow rows are shown.
    setPanelClass(UI.btPanel, "no-buff-timer", !(panelValid(UI.minimap) && UI.minimap.BHasClass("bt-buff-timer")));
    for (const target of BT_COLORS) {
      const row = UI.colorRows[target.key];
      if (!row) continue;
      const color = BtSettings.colors[target.key];
      btSetSwatch(row.swatch, target.top, color);
      setPanelText(row.hex, color);
      setPanelClass(row.row, "selected", BtEditor.target === target.key);
    }
    setPanelText(UI.btStrengthValue, BtSettings.strength + "%");
    btSyncSlider(UI.btStrength, BtSettings.strength);
    setPanelClass(UI.btEditor, "open", BtEditor.target !== "");
    setPanelClass(UI.btLinger, "on", BtSettings.linger);
    setPanelClass(UI.btGlow, "on", BtSettings.glow);
    setPanelClass(UI.btBorder, "on", BtSettings.border);
    setPanelText(UI.btOpacityValue, BtSettings.opacity + "%");
    btSyncSlider(UI.btOpacity, BtSettings.opacity);
    setPanelText(UI.btStatus, BtStore.status);
    setPanelText(UI.btResetLabel, BtStore.resetArmed ? "CONFIRM RESET" : "RESET");
  }

  function btChanged() {
    btApplyToHud();
    btRefreshMenu();
    if (BtStore.phase !== "ready") return;
    // SAVED only when the shown values are what the store acknowledged and nothing is still in flight.
    btSetStatus(btEncode() === BtStore.savedRecord && BtStore.pendingOp !== "w" ? "SAVED" : "SAVING");
    btScheduleSave();
  }
  function btTargetColor() {
    return BtSettings.colors[BtEditor.target];
  }
  // Arrow rows wash the minimap glyph; the other rows fill a square.
  function btSetSwatch(panel, wash, color) {
    if (!panelValid(panel) || _btSwatchCache.get(panel) === color) return;
    try {
      panel.style[wash ? "washColor" : "backgroundColor"] = color;
      _btSwatchCache.set(panel, color);
    } catch {}
  }

  function btSpectrumRgb(position, out) {
    let i = 1;
    while (i < BT_SPECTRUM.length - 1 && position > BT_SPECTRUM[i][0]) i++;
    const from = BT_SPECTRUM[i - 1];
    const to = BT_SPECTRUM[i];
    const t = (position - from[0]) / (to[0] - from[0]);
    for (let c = 1; c < 4; c++) out[c - 1] = Math.round(from[c] + (to[c] - from[c]) * t);
    return out;
  }
  function btHexRgb(color) {
    const value = parseInt(color.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  function btRgbHex(rgb) {
    let color = "#";
    for (let c = 0; c < 3; c++) color += ("0" + rgb[c].toString(16)).slice(-2);
    return color.toUpperCase();
  }
  function btSpectrumColor(position) {
    return btRgbHex(btSpectrumRgb(position, [0, 0, 0]));
  }
  // Brightness: the HSV value in whole percent (the brightest channel).
  function btBrightness(color) {
    const rgb = btHexRgb(color);
    return Math.round(Math.max(rgb[0], rgb[1], rgb[2]) * 100 / 255);
  }
  // base with every channel scaled so its brightest one is percent of full; black becomes grey.
  function btWithBrightness(base, percent) {
    const rgb = btHexRgb(base);
    const top = Math.round(percent * 255 / 100);
    const peak = Math.max(rgb[0], rgb[1], rgb[2]);
    return btRgbHex(rgb.map((channel) => peak === 0 ? top : Math.min(255, Math.round(channel * top / peak))));
  }
  // Nearest spectrum point to a colour; only used to place the thumb, never to change the colour.
  function btSpectrumPosition(color) {
    const [red, green, blue] = btHexRgb(color);
    const rgb = [0, 0, 0];
    let best = 0;
    let bestDistance = Infinity;
    for (let position = 0; position <= BT_SPECTRUM_MAX; position++) {
      btSpectrumRgb(position, rgb);
      const distance = (rgb[0] - red) * (rgb[0] - red) + (rgb[1] - green) * (rgb[1] - green) + (rgb[2] - blue) * (rgb[2] - blue);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = position;
      }
    }
    return best;
  }

  // The menu layout is loaded with BLoadLayout and has no script, so every handler is bound here.
  function btBind(panel, event, fn) {
    if (!panelValid(panel)) return;
    try { panel["SetPanelEvent"](event, () => { if (alive()) fn(); }); } catch {}
  }
  function btSetDraggable(panel, enabled) {
    if (!panelValid(panel)) return;
    try { panel["SetDraggable"](enabled); } catch {}
  }
  function btBindControls() {
    btBind(UI.btGear, "onactivate", btToggleMenu);
    btBind(UI.btLinger, "onactivate", btToggleLinger);
    btBind(UI.btGlow, "onactivate", btToggleGlow);
    btBind(UI.btBorder, "onactivate", btToggleBorder);
    btBind(UI.btReset, "onactivate", btResetSettings);
    for (const target of BT_COLORS) {
      const row = UI.colorRows[target.key];
      if (row) btBind(row.row, "onactivate", () => btSelectRow(target.key));
    }
    const releaseKeyboard = () => {
      try { $.DispatchEvent("DropInputFocus", UI.btHexEntry); } catch {}
    };
    // Enter commits and hands the keyboard back to the game; Escape discards the draft and does the same.
    btBind(UI.btHexEntry, "ontextentrysubmit", () => {
      btCommitHex();
      releaseKeyboard();
    });
    btBind(UI.btHexEntry, "oncancel", () => {
      btSyncEditor(false);
      releaseKeyboard();
    });
    // Same event stock chat.xml uses for its entry.
    btBind(UI.btHexEntry, "onblur", btCommitHex);
    btBind(UI.btLayoutButton, "onactivate", btLayoutEnter);
    btBind(UI.btLayoutDone, "onactivate", () => btLayoutLeave(true));
    btBind(UI.btLayoutCancel, "onactivate", () => btLayoutLeave(false));
    btBind(UI.btLayoutReset, "onactivate", btLayoutResetDraft);
    // The bar holds keyboard focus while editing, so Esc lands here.
    btBind(UI.btLayoutBar, "oncancel", () => btLayoutLeave(false));
    if (panelValid(UI.btLayoutGrip)) {
      try {
        $.RegisterEventHandler("DragStart", UI.btLayoutGrip, (source, callbacks) => btBarDragStart(callbacks));
        $.RegisterEventHandler("DragEnd", UI.btLayoutGrip, () => btLayoutDragEnd(null));
      } catch {}
    }
  }
  // Presets and the spectrum slider are created here so the palette and slider range live in one place.
  function btBuildEditor() {
    BtEditor.presets = [];
    if (panelValid(UI.btPresetRow)) {
      for (let i = 0; i < BT_PRESETS.length; i++) {
        let chip = null;
        try { chip = $.CreatePanel("Button", UI.btPresetRow, "BTPreset" + i); } catch {}
        if (!panelValid(chip)) continue;
        setPanelClass(chip, "bt-preset", true);
        try { chip.style.backgroundColor = BT_PRESETS[i]; } catch {}
        btBind(chip, "onactivate", () => btApplyColor(BT_PRESETS[i], true));
        BtEditor.presets[i] = chip;
      }
    }
    BtEditor.slider = btBuildSlider(UI.btSpectrumHost, "BTSpectrum", "bt-spectrum", 0, BT_SPECTRUM_MAX, 1, btOnSpectrum);
    BtEditor.bright = btBuildSlider(UI.btBrightnessHost, "BTBrightness", "bt-strength", 0, 100, 1, btOnBrightness);
  }
  // Stock horizontal slider. Assigning .value echoes through onvaluechanged (possibly a frame later); every handler
  // ignores a value that changes nothing.
  function btBuildSlider(host, id, className, min, max, increment, onChange) {
    if (!panelValid(host)) return null;
    try {
      const slider = $.CreatePanel("Slider", host, id, { "direction": "horizontal" });
      if (!panelValid(slider)) return null;
      setPanelClass(slider, "HorizontalSlider", true);
      setPanelClass(slider, className, true);
      slider["min"] = min;
      slider["max"] = max;
      slider["increment"] = increment;
      btBind(slider, "onvaluechanged", onChange);
      return slider;
    } catch { return null; }
  }
  function btSyncSlider(slider, value) {
    if (!panelValid(slider)) return;
    try { if (slider["value"] !== value) slider["value"] = value; } catch {}
  }
  function btSliderValue(slider) {
    try { return Number(slider["value"]); } catch { return NaN; }
  }
  function btOnOpacity() {
    if (!btEditable()) {
      btSyncSlider(UI.btOpacity, BtSettings.opacity);
      return;
    }
    let value = btSliderValue(UI.btOpacity);
    if (!isFinite(value)) return;
    value = Math.round(Math.max(BT_OPACITY_MIN, Math.min(BT_OPACITY_MAX, value)) / BT_OPACITY_STEP) * BT_OPACITY_STEP;
    if (value === BtSettings.opacity) {
      btSyncSlider(UI.btOpacity, value);
      return;
    }
    BtSettings.opacity = value;
    btChanged();
  }
  function btOnStrength() {
    if (!btEditable()) {
      btSyncSlider(UI.btStrength, BtSettings.strength);
      return;
    }
    let value = Math.round(btSliderValue(UI.btStrength));
    if (!isFinite(value)) return;
    value = Math.max(BT_STRENGTH_MIN, Math.min(BT_STRENGTH_MAX, value));
    if (value === BtSettings.strength) return;
    BtSettings.strength = value;
    btChanged();
  }
  function btOnSpectrum() {
    if (!BtEditor.target || !btEditable()) return;
    const position = Math.round(btSliderValue(BtEditor.slider));
    if (!isFinite(position) || position === BtEditor.seed) return;
    BtEditor.seed = -1;
    btApplyColor(btSpectrumColor(Math.max(0, Math.min(BT_SPECTRUM_MAX, position))), false);
  }
  function btCommitHex() {
    if (!BtEditor.target) return;
    const color = btNormalizeHex(UI.btHexEntry?.text);
    // Unchanged text (e.g. a blur after focusing the box) is not a new pick: it keeps the brightness base.
    if (color && color !== btTargetColor()) btApplyColor(color, true);
    else btSyncEditor(false);
  }
  // A new pick (preset, spectrum, hex) becomes the brightness base. Every edit applies to the HUD at once and goes
  // through the normal 1.5 s throttled save.
  function btApplyColor(color, seedSlider) {
    if (!BtEditor.target || !btEditable()) return;
    BtEditor.base = color;
    btSetTargetColor(color);
    btSyncEditor(seedSlider);
  }
  function btSetTargetColor(color) {
    if (color === btTargetColor()) return;
    BtSettings.colors[BtEditor.target] = color;
    btChanged();
  }
  // The echo of a seeded value equals the current brightness and changes nothing.
  function btOnBrightness() {
    if (!BtEditor.target || !btEditable()) return;
    const percent = Math.round(btSliderValue(BtEditor.bright));
    if (!isFinite(percent) || percent === btBrightness(btTargetColor())) return;
    btSetTargetColor(btWithBrightness(BtEditor.base, Math.max(0, Math.min(100, percent))));
    btSyncEditor(false);
  }
  // Hex text, preset marks, brightness and (when asked) the spectrum thumb follow the current colour. Not called from
  // btRefreshMenu, so a save status update never overwrites text the player is typing.
  function btSyncEditor(seedSlider) {
    if (!BtEditor.target) return;
    const color = btTargetColor();
    setPanelText(UI.btHexEntry, color);
    for (let i = 0; i < BtEditor.presets.length; i++) setPanelClass(BtEditor.presets[i], "selected", BT_PRESETS[i] === color);
    const bright = btBrightness(color);
    setPanelText(UI.btBrightnessValue, bright + "%");
    btSyncSlider(BtEditor.bright, bright);
    if (!seedSlider || !panelValid(BtEditor.slider)) return;
    BtEditor.seed = btSpectrumPosition(color);
    btSyncSlider(BtEditor.slider, BtEditor.seed);
  }
  // A draft still in the hex box belongs to the row it was typed for, so commit it before the target changes;
  // the engine's blur may only arrive after the click that retargets.
  function btSelectRow(target) {
    if (!btEditable()) return;
    btCommitHex();
    if (BtEditor.target === target) {
      btCloseEditor();
      return;
    }
    BtEditor.target = target;
    BtEditor.base = btTargetColor();
    // The editor opens right under the row it edits (the rows and the editor are siblings in the panel).
    const row = UI.colorRows[target];
    if (row && panelValid(UI.btPanel) && panelValid(UI.btEditor)) {
      try { UI.btPanel["MoveChildAfter"](UI.btEditor, row.row); } catch {}
    }
    btRefreshMenu();
    btSyncEditor(true);
  }
  function btCloseEditor() {
    if (!BtEditor.target) return;
    btCommitHex();
    BtEditor.target = "";
    try { $.DispatchEvent("DropInputFocus", UI.btHexEntry); } catch {}
    btRefreshMenu();
  }

  function btToggleLinger() {
    if (!btEditable()) return;
    BtSettings.linger = !BtSettings.linger;
    btChanged();
  }
  function btToggleGlow() {
    if (!btEditable()) return;
    BtSettings.glow = !BtSettings.glow;
    btChanged();
  }
  function btToggleBorder() {
    if (!btEditable()) return;
    BtSettings.border = !BtSettings.border;
    btChanged();
  }
  function btToggleMenu() {
    _btMenuOpen = !_btMenuOpen;
    if (!_btMenuOpen) {
      btCloseEditor();
      // Closing sends a pending edit now instead of after the delay; an untouched menu writes nothing.
      if (BtStore.saveHnd !== null) btFlushSave();
      try { $.DispatchEvent("DropInputFocus", UI.btGear); } catch {}
    }
    btRefreshMenu();
  }
  // An unreadable save blocks writes; RESET needs a second click within 3 s to overwrite it.
  function btResetSettings() {
    if (!btEditable()) return;
    if (BtStore.phase === "blocked" && !BtStore.resetArmed) {
      BtStore.resetArmed = true;
      BtStore.resetHnd = btSchedule(BT_RESET_CONFIRM_S, () => {
        BtStore.resetHnd = null;
        BtStore.resetArmed = false;
        btRefreshMenu();
      });
      btRefreshMenu();
      return;
    }
    BtStore.resetHnd = btCancel(BtStore.resetHnd);
    BtStore.resetArmed = false;
    if (BtStore.phase === "blocked") {
      BtStore.phase = "ready";
      BtStore.savedRecord = "";
    }
    btCloseEditor();
    BtSettings.colors = btDefaultColors();
    BtSettings.strength = BT_STRENGTH_DEFAULT;
    BtSettings.linger = true;
    BtSettings.glow = true;
    BtSettings.border = true;
    BtSettings.opacity = BT_OPACITY_MAX;
    btChanged();
  }

  function btSend(message) {
    if (!alive() || !panelValid(BtStore.panel)) return false;
    try {
      BtStore.panel["SetURL"](BT_STORE_URL + "#" + encodeURIComponent(JSON.stringify(message)));
      return true;
    } catch {
      return false;
    }
  }
  function btSetUnavailable(status) {
    BtStore.phase = "unavailable";
    BtStore.helloHnd = btCancel(BtStore.helloHnd);
    BtStore.timeoutHnd = btCancel(BtStore.timeoutHnd);
    BtStore.saveHnd = btCancel(BtStore.saveHnd);
    BtStore.pendingId = "";
    BtStore.pendingOp = "";
    btSetStatus(status);
  }
  function btStartStore() {
    if (BtStore.phase !== "idle") return;
    const panel = UI.btStore;
    if (!panelValid(panel)) {
      btSetUnavailable("OFFLINE - SESSION ONLY");
      return;
    }
    BtStore.panel = panel;
    try {
      $.RegisterEventHandler("HTMLTitle", panel, btOnTitle);
    } catch {
      btSetUnavailable("OFFLINE - SESSION ONLY");
      return;
    }
    BtStore.phase = "hello";
    BtStore.startMs = Date.now();
    btHello();
  }
  // Re-send hello until the page answers; give up after 30 s.
  function btHello() {
    BtStore.helloHnd = null;
    if (BtStore.phase !== "hello") return;
    if (Date.now() - BtStore.startMs >= BT_READY_TIMEOUT_MS) {
      btSetUnavailable("OFFLINE - SESSION ONLY");
      return;
    }
    BtStore.helloId = "h" + ++BtStore.seq;
    if (!btSend({ "i": BtStore.helloId, "o": "hello" })) {
      btSetUnavailable("OFFLINE - SESSION ONLY");
      return;
    }
    // The last wait ends exactly at the 30 s deadline instead of overshooting by up to one retry.
    const leftSec = (BT_READY_TIMEOUT_MS - (Date.now() - BtStore.startMs)) / 1000;
    BtStore.helloHnd = btSchedule(Math.min(BT_HELLO_RETRY_S, leftSec), btHello);
  }
  function btRequest(op, message) {
    const id = op + ++BtStore.seq;
    message["i"] = id;
    message["o"] = op;
    BtStore.pendingId = id;
    BtStore.pendingOp = op;
    BtStore.timeoutHnd = btSchedule(BT_REPLY_TIMEOUT_S, () => {
      BtStore.timeoutHnd = null;
      if (BtStore.pendingId === id) btFinish(null);
    });
    if (!btSend(message)) btFinish(null);
  }
  function btFinish(reply) {
    const op = BtStore.pendingOp;
    BtStore.pendingId = "";
    BtStore.pendingOp = "";
    BtStore.timeoutHnd = btCancel(BtStore.timeoutHnd);
    if (op === "r") btOnRead(reply);
    else if (op === "w") btOnWriteAck(reply);
  }
  function btOnTitle(panelOrTitle, eventTitle) {
    if (!alive()) return;
    const title = arguments.length > 1 ? eventTitle : panelOrTitle;
    if (typeof title !== "string" || title.indexOf(BT_STORE_PREFIX) !== 0) return;
    let reply = null;
    try { reply = JSON.parse(title.slice(BT_STORE_PREFIX.length)); } catch { return; }
    if (!reply || typeof reply !== "object") return;
    if (reply["o"] === "ready") {
      btOnReady(reply);
      return;
    }
    // Late, duplicate and foreign replies carry an id we are not waiting for.
    if (!BtStore.pendingId || reply["i"] !== BtStore.pendingId) return;
    btFinish(reply);
  }
  function btOnReady(reply) {
    if (BtStore.phase !== "hello" || reply["i"] !== BtStore.helloId) return;
    const href = reply["h"];
    if (typeof href !== "string" || href.split("#")[0] !== BT_STORE_URL) return;
    BtStore.helloHnd = btCancel(BtStore.helloHnd);
    if (reply["v"] !== BT_STORE_VERSION || reply["ok"] !== true) {
      btSetUnavailable("SAVE PAGE OUTDATED - SESSION ONLY");
      return;
    }
    BtStore.phase = "read";
    btRequest("r", {});
  }
  function btOnRead(reply) {
    if (BtStore.phase !== "read") return;
    if (!reply || reply["ok"] !== true) {
      if (!BtStore.readRetried) {
        BtStore.readRetried = true;
        btRequest("r", {});
      } else {
        btSetUnavailable("OFFLINE - SESSION ONLY");
      }
      return;
    }
    const stored = reply["x"] === 1 ? reply["v"] : null;
    const result = btDecode(stored);
    if (result.kind === "valid") {
      BtSettings.colors = result.colors;
      BtSettings.strength = result.strength;
      BtSettings.linger = result.linger;
      BtSettings.glow = result.glow;
      BtSettings.border = result.border;
      BtSettings.opacity = result.opacity;
      BtSettings.layout = result.layout;
      BtStore.savedRecord = stored;
      BtStore.phase = "ready";
      btApplyToHud();
      btSetStatus("SAVED");
    } else if (result.kind === "absent") {
      BtStore.phase = "ready";
      btSetStatus("DEFAULTS");
    } else {
      BtStore.phase = "blocked";
      btSetStatus(result.kind === "unsupported" ? "NEWER SAVE - RESET TO OVERWRITE" : "SAVE DAMAGED - RESET TO REPAIR");
    }
  }
  function btScheduleSave() {
    if (BtStore.saveHnd === null) BtStore.saveHnd = btSchedule(BT_SAVE_DELAY_S, btFlushSave);
  }
  // One write in flight; edits made meanwhile are picked up when its ack reschedules.
  function btFlushSave() {
    BtStore.saveHnd = btCancel(BtStore.saveHnd);
    if (BtStore.phase !== "ready" || BtStore.pendingOp === "w") return;
    const record = btEncode();
    if (record === BtStore.savedRecord) {
      btSetStatus("SAVED");
      return;
    }
    BtStore.sentRecord = record;
    btSetStatus("SAVING");
    btRequest("w", { "v": record });
  }
  function btOnWriteAck(reply) {
    if (BtStore.phase !== "ready") return;
    if (reply && reply["ok"] === true) {
      BtStore.savedRecord = BtStore.sentRecord;
      BtStore.retry = 0;
      if (btEncode() === BtStore.savedRecord) {
        btSetStatus("SAVED");
      } else {
        btSetStatus("SAVING");
        btScheduleSave();
      }
      return;
    }
    // A lost or failed reply leaves the stored value unknown (the page may have committed it), so the retry
    // must write even if the settings were changed back to the last acknowledged record.
    BtStore.savedRecord = "";
    if (BtStore.retry < BT_SAVE_RETRY_S.length) {
      BtStore.saveHnd = btCancel(BtStore.saveHnd);
      BtStore.saveHnd = btSchedule(BT_SAVE_RETRY_S[BtStore.retry++], btFlushSave);
      btSetStatus("SAVE RETRYING");
    } else {
      btSetUnavailable("SAVE FAILED - SESSION ONLY");
    }
  }

  function btLayoutApi() {
    let api = null;
    try { api = $["BTTimerLayout"]; } catch {}
    if (!api || typeof api !== "object") return null;
    return typeof api["apply"] === "function" && typeof api["metrics"] === "function" &&
      typeof api["panel"] === "function" ? api : null;
  }
  function btLayoutCopy(model) {
    const copy = {};
    for (const slot of BT_LAYOUT_SLOTS) {
      const entry = model[slot[0]];
      if (entry) copy[slot[0]] = entry.slice();
    }
    if (model["m"] !== undefined) copy["m"] = model["m"];
    if (model["mp"] !== undefined) copy["mp"] = model["mp"].slice();
    if (model["lc"] !== undefined) copy["lc"] = model["lc"].slice();
    return copy;
  }
  // Model "m" (a fraction of the stock size) -> whole percent; 0 when it is not a valid size.
  function btMapScalePercent(value) {
    if (typeof value !== "number" || !(value >= BT_MAP_SCALE_MIN / 100 && value <= BT_MAP_SCALE_MAX / 100)) return 0;
    return Math.round(value * 100);
  }
  // Sends the shown model (draft while editing) to the timer; it skips unchanged geometry itself.
  function btLayoutPush() {
    const api = btLayoutApi();
    if (!api) return;
    try { api["apply"](BtLayout.editing ? BtLayout.draft : BtSettings.layout, BtLayout.editing); } catch {}
  }
  /** @return {?} */
  function btLayoutMetrics(api) {
    let metrics = null;
    try { metrics = api["metrics"](); } catch {}
    return metrics && metrics["w"] > 0 && metrics["h"] > 0 && metrics["scale"] > 0 && metrics["slots"] ? metrics : null;
  }
  function btLayoutPanel(api, id) {
    let panel = null;
    try { panel = api["panel"](id); } catch {}
    return panelValid(panel) ? panel : null;
  }
  // Every handler remembers the timer instance it was bound for; once that instance is gone it does nothing.
  function btLayoutBind(api) {
    if (BtLayout.boundApi === api) return;
    let complete = true;
    for (const slot of BT_LAYOUT_SLOTS) {
      const key = slot[0];
      const id = slot[1];
      complete = btLayoutBindDrag(api, btLayoutPanel(api, id), key, "", id) && complete;
      for (const corner of BT_LAYOUT_CORNERS) {
        complete = btLayoutBindDrag(api, btLayoutPanel(api, id + "Handle" + corner), key, corner, id) && complete;
      }
      for (const side of slot[2] ? BT_LAYOUT_SIDES : []) {
        const arrow = btLayoutPanel(api, id + "Side" + side.toUpperCase());
        if (!arrow) {
          complete = false;
          continue;
        }
        if (BtLayout.bound.has(arrow)) continue;
        BtLayout.bound.add(arrow);
        btBind(arrow, "onactivate", () => btLayoutSide(api, key, side));
      }
      if (!BT_ICON_DEFAULT_SIDE[key]) continue;
      const toggle = btLayoutPanel(api, id + "IconToggle");
      if (!toggle) {
        complete = false;
      } else if (!BtLayout.bound.has(toggle)) {
        BtLayout.bound.add(toggle);
        btBind(toggle, "onactivate", () => btLayoutIconToggle(api, key));
      }
    }
    // The minimap: its drag area moves it, its border's corners resize it.
    complete = btLayoutBindDrag(api, btLayoutPanel(api, "BTSlotMapGrab"), "m", "", "BTSlotMap") && complete;
    for (const corner of BT_LAYOUT_CORNERS) {
      complete = btLayoutBindDrag(api, btLayoutPanel(api, "BTSlotMapHandle" + corner), "m", corner, "BTSlotMap") && complete;
    }
    // The map location label: its drag area moves it, its knob turns it.
    complete = btLayoutBindDrag(api, btLayoutPanel(api, "BTSlotLocGrab"), "lc", "", "BTSlotLoc") && complete;
    complete = btLayoutBindDrag(api, btLayoutPanel(api, "BTSlotLocRotate"), "lc", "R", "BTSlotLoc") && complete;
    if (complete) BtLayout.boundApi = api;
  }
  function btLayoutBindDrag(api, panel, key, corner, id) {
    if (!panel) return false;
    if (BtLayout.bound.has(panel)) return true;
    try {
      $.RegisterEventHandler("DragStart", panel, (source, callbacks) => btLayoutDragStart(api, key, corner, id, callbacks));
      $.RegisterEventHandler("DragEnd", panel, () => btLayoutDragEnd(api));
    } catch { return false; }
    // Entering a widget brings its own handles above any neighbour's chrome.
    // Not the minimap or its label: their borders stay below the widget chromes so their handles stay reachable.
    if (!corner && key !== "m" && key !== "lc") btBind(panel, "onmouseover", () => btLayoutRaise(api, id));
    BtLayout.bound.add(panel);
    return true;
  }
  function btLayoutRaise(api, id) {
    if (!BtLayout.editing || api !== btLayoutApi() || typeof api["raise"] !== "function") return;
    try { api["raise"](id); } catch {}
  }
  // Edit-mode drags only, so a failed move or resize can be read from console.log.
  function btLayoutLog(text) {
    try { $["Msg"]("[BT-L] " + text); } catch {}
  }
  // Loop tick: follow timer reboots, keep the timer showing our model, leave edit mode if the timer is gone.
  function btLayoutSync() {
    const api = btLayoutApi();
    if (api !== BtLayout.api) {
      btLayoutDragStop();
      BtLayout.api = api;
      BtLayout.boundApi = null;
    }
    if (!api) {
      if (BtLayout.editing) btLayoutLeave(false);
      return;
    }
    btLayoutBind(api);
    // Before the save is read, the timer keeps whatever it shows (defaults on a fresh launch).
    if (btEditable()) btLayoutPush();
    btLookPush();
  }
  function btLayoutEnter() {
    if (BtLayout.editing || !btEditable()) return;
    const api = btLayoutApi();
    if (!api || !btLayoutMetrics(api)) return;
    if (_btMenuOpen) btToggleMenu();
    BtLayout.api = api;
    btLayoutBind(api);
    BtLayout.editing = true;
    BtLayout.draft = btLayoutCopy(BtSettings.layout);
    setPanelClass(UI.btLayoutBar, "open", true);
    setPanelClass(UI.btRoot, "bt-editing", true);
    btSetDraggable(UI.btLayoutGrip, true);
    btBarPlace();
    try { UI.btLayoutBar.SetFocus(); } catch {}
    btLayoutPush();
    // Once the engine has laid out the edit chrome: where the map location label's chrome went and whether the label
    // itself had a layout (m=1) or the stock spot was used (m=0); "none" = no label found.
    btSchedule(0.5, () => {
      if (!BtLayout.editing || api !== btLayoutApi()) return;
      const metrics = btLayoutMetrics(api);
      const loc = metrics ? metrics["loc"] : null;
      btLayoutLog(loc ? "loc m=" + loc["m"] + " cx=" + Math.round(loc["cx"]) + " cy=" + Math.round(loc["cy"]) +
        " w=" + Math.round(loc["w"]) + " h=" + Math.round(loc["h"]) + " deg=" + loc["deg"] : "loc none");
    });
  }
  // DONE keeps the draft and saves it through the normal throttled write; CANCEL/Esc drop it.
  function btLayoutLeave(save) {
    if (!BtLayout.editing) return;
    btLayoutDragStop();
    const draft = BtLayout.draft || {};
    BtLayout.editing = false;
    BtLayout.draft = null;
    setPanelClass(UI.btLayoutBar, "open", false);
    setPanelClass(UI.btRoot, "bt-editing", false);
    btSetDraggable(UI.btLayoutGrip, false);
    try { $.DispatchEvent("DropInputFocus", UI.btLayoutBar); } catch {}
    if (save) BtSettings.layout = draft;
    btLayoutPush();
    if (save) btChanged();
  }
  function btLayoutResetDraft() {
    if (!BtLayout.editing) return;
    btLayoutDragStop();
    BtLayout.draft = {};
    btLayoutPush();
  }
  function btLayoutClamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }
  // Soft snap of the near edge, the centre or the far edge onto the layer's edges and centre line.
  function btLayoutSnap(position, size, total) {
    let best = position;
    let distance = BT_LAYOUT_SNAP;
    for (const target of [0, (total - size) / 2, total - size]) {
      const d = Math.abs(position - target);
      if (d <= distance) {
        best = target;
        distance = d;
      }
    }
    return best;
  }
  function btLayoutEntry(drag, x, y, scale, side) {
    const fraction = (value, total) => Math.round(btLayoutClamp(value / total, 0, 1) * 10000) / 10000;
    return [fraction(x, drag.w), fraction(y, drag.h), scale, side];
  }
  function btLayoutSide(api, key, side) {
    if (!BtLayout.editing || api !== btLayoutApi() || !BtLayout.draft) return;
    const metrics = btLayoutMetrics(api);
    const rect = metrics ? metrics["slots"][key] : null;
    if (!rect || rect["side"] === side) return;
    // Without its icon a pill has no vertical layout (the chrome hides those arrows too).
    if (rect["side"] === "n" && (side === "t" || side === "b")) return;
    btLayoutDragStop();
    BtLayout.draft[key] = btLayoutEntry({ w: metrics["w"], h: metrics["h"] }, rect["x"], rect["y"], rect["s"], side);
    btLayoutPush();
  }
  // Hides a pill's icon (side "n", just the time) or shows it again on the pill's default side.
  function btLayoutIconToggle(api, key) {
    if (!BtLayout.editing || api !== btLayoutApi() || !BtLayout.draft) return;
    const metrics = btLayoutMetrics(api);
    const rect = metrics ? metrics["slots"][key] : null;
    if (!rect) return;
    btLayoutDragStop();
    const side = rect["side"] === "n" ? BT_ICON_DEFAULT_SIDE[key] : "n";
    BtLayout.draft[key] = btLayoutEntry({ w: metrics["w"], h: metrics["h"] }, rect["x"], rect["y"], rect["s"], side);
    btLayoutPush();
  }
  // The engine moves our invisible proxy with the cursor (proven in game); the widget follows the proxy's offset
  // from where it was first seen, so the grab point stays under the cursor.
  function btLayoutDragStart(api, key, corner, id, callbacks) {
    if (!alive() || !BtLayout.editing || api !== btLayoutApi() || !callbacks || typeof callbacks !== "object") {
      btLayoutLog("drag " + key + (corner || "") + " ignored (not editing or stale)");
      return false;
    }
    const metrics = btLayoutMetrics(api);
    const rect = metrics ? (key === "m" ? metrics["map"] : key === "lc" ? metrics["loc"] : metrics["slots"][key]) : null;
    if (!rect || !panelValid(UI.host)) {
      btLayoutLog("drag " + key + (corner || "") + " ignored (no layout)");
      return false;
    }
    if (key !== "m" && key !== "lc") btLayoutRaise(api, id);
    btLayoutDragStop();
    const grab = btLayoutGrab(callbacks);
    if (!grab) return false;
    BtLayout.drag = {
      api: api, bar: false, key: key, corner: corner, proxy: grab.proxy, origin: null, last: "",
      homeX: grab.homeX, homeY: grab.homeY,
      w: metrics["w"], h: metrics["h"], scale: metrics["scale"],
      x: rect["x"], y: rect["y"], rw: rect["w"], rh: rect["h"], bw: rect["bw"], bh: rect["bh"], s: rect["s"], side: rect["side"],
      // Minimap and label: the #minimap_persp box, which the minimap's spot places and the label must stay inside.
      px: rect["px"], py: rect["py"], pw: rect["pw"], ph: rect["ph"],
      // Label only: its centre, dashed-box size, turn, offset (minimap px), layer px per minimap px, stock centre, knob.
      cx: rect["cx"], cy: rect["cy"], deg: rect["deg"], dx: rect["dx"], dy: rect["dy"], f: rect["f"],
      sx: rect["sx"], sy: rect["sy"], kx: rect["kx"], ky: rect["ky"]
    };
    BtLayout.dragHnd = btSchedule(BT_LAYOUT_TICK_S, btLayoutDragTick);
    const at = key === "lc" ? " cx=" + Math.round(rect["cx"]) + " cy=" + Math.round(rect["cy"]) + " deg=" + rect["deg"]
      : " x=" + Math.round(rect["x"]) + " y=" + Math.round(rect["y"]) + " s=" + rect["s"] + " side=" + rect["side"];
    btLayoutLog("drag " + key + " " + (corner || "move") + " start" + at + " uiscale=" + metrics["scale"]);
    return true;
  }
  // Hands the engine an invisible proxy to move with the cursor. home is where the proxy sits without an engine-set
  // position (the settings host's origin): such readings are not the cursor.
  function btLayoutGrab(callbacks) {
    let proxy = null;
    try {
      proxy = $.CreatePanel("Panel", UI.host, "BTLayoutDragProxy");
      proxy["hittest"] = false;
      proxy.style["width"] = "4px";
      proxy.style["height"] = "4px";
      proxy.style["opacity"] = "0";
      callbacks["displayPanel"] = proxy;
      callbacks["offsetX"] = 0;
      callbacks["offsetY"] = 0;
    } catch {
      if (panelValid(proxy)) try { proxy.DeleteAsync(0); } catch {}
      return null;
    }
    let home = null;
    const host = /** @type {?} */ (UI.host);
    try { home = host["GetPositionWithinWindow"](); } catch {}
    return { proxy: proxy, homeX: home ? Number(home["x"]) : NaN, homeY: home ? Number(home["y"]) : NaN };
  }
  // The settings host covers the HUD; the bar is positioned in its layout px.
  /** @return {?} */
  function btBarFrame() {
    const host = /** @type {?} */ (UI.host);
    if (!panelValid(host)) return null;
    try {
      const scale = Number(host["actualuiscale_x"]);
      const win = host["GetPositionWithinWindow"]();
      const w = Number(host["actuallayoutwidth"]) / scale;
      const h = Number(host["actuallayoutheight"]) / scale;
      if (!(scale > 0) || !win || !(w > 0 && w < 1e6) || !(h > 0 && h < 1e6)) return null;
      let barH = 0;
      try { barH = Number(UI.btLayoutBar["actuallayoutheight"]) / scale; } catch {}
      if (!(barH > 0 && barH < 1e4)) barH = BT_BAR_EST_H;
      return { scale: scale, x: Number(win["x"]), y: Number(win["y"]), w: w, h: h, barH: barH };
    } catch { return null; }
  }
  function btBarWrite(frame, x, y) {
    const cx = btLayoutClamp(x, 0, Math.max(0, frame.w - BT_BAR_W));
    const cy = btLayoutClamp(y, 0, Math.max(0, frame.h - frame.barH));
    BtLayout.barXY = { x: cx, y: cy };
    const position = Math.round(cx * 10) / 10 + "px " + Math.round(cy * 10) / 10 + "px 0px";
    if (position === BtLayout.barWritten || !panelValid(UI.btLayoutBar)) return;
    try {
      UI.btLayoutBar.style["horizontalAlign"] = "left";
      UI.btLayoutBar.style["verticalAlign"] = "top";
      UI.btLayoutBar.style["marginTop"] = "0px";
      UI.btLayoutBar.style["position"] = position;
      BtLayout.barWritten = position;
    } catch {}
  }
  // Just above (or, without room, below) the minimap box, centred on it, so it covers no default widget spot; a spot
  // the player dragged it to wins for the rest of the session. Without a measured minimap the CSS top-centre spot stays.
  function btBarPlace() {
    if (!BtLayout.editing) return;
    const frame = btBarFrame();
    if (!frame) return;
    if (BtLayout.barPos) {
      btBarWrite(frame, BtLayout.barPos.x, BtLayout.barPos.y);
      return;
    }
    const api = btLayoutApi();
    const metrics = api ? btLayoutMetrics(api) : null;
    const dock = metrics ? metrics["dock"] : null;
    if (!dock) return;
    const left = (Number(dock["x"]) - frame.x) / frame.scale;
    const top = (Number(dock["y"]) - frame.y) / frame.scale;
    const width = Number(dock["w"]) / frame.scale;
    if (!(Math.abs(left) < 1e6 && Math.abs(top) < 1e6 && width > 0)) return;
    // Below the minimap box when a moved minimap leaves no room above it.
    let y = top - frame.barH - BT_BAR_GAP;
    const height = Number(dock["h"]) / frame.scale;
    if (y < 0 && height > 0 && height < 1e6) y = top + height + BT_BAR_GAP;
    btBarWrite(frame, left + width / 2 - BT_BAR_W / 2, y);
  }
  function btBarDragStart(callbacks) {
    if (!alive() || !BtLayout.editing || !callbacks || typeof callbacks !== "object") return false;
    const frame = btBarFrame();
    if (!frame) return false;
    let start = BtLayout.barXY;
    if (!start) {
      try {
        const win = UI.btLayoutBar["GetPositionWithinWindow"]();
        start = { x: (Number(win["x"]) - frame.x) / frame.scale, y: (Number(win["y"]) - frame.y) / frame.scale };
      } catch { return false; }
    }
    btLayoutDragStop();
    const grab = btLayoutGrab(callbacks);
    if (!grab) return false;
    BtLayout.drag = {
      api: null, bar: true, key: "bar", corner: "", proxy: grab.proxy, origin: null, last: "",
      homeX: grab.homeX, homeY: grab.homeY, scale: frame.scale, x: start.x, y: start.y, frame: frame
    };
    BtLayout.dragHnd = btSchedule(BT_LAYOUT_TICK_S, btLayoutDragTick);
    return true;
  }
  function btLayoutDragTick() {
    BtLayout.dragHnd = null;
    if (!btLayoutDragStep()) {
      btLayoutDragStop();
      return;
    }
    BtLayout.dragHnd = btSchedule(BT_LAYOUT_TICK_S, btLayoutDragTick);
  }
  function btLayoutDragStep() {
    const drag = BtLayout.drag;
    if (!drag || !BtLayout.editing || !panelValid(drag.proxy)) return false;
    if (!drag.bar && (!BtLayout.draft || drag.api !== btLayoutApi())) return false;
    let point = null;
    try { point = drag.proxy["GetPositionWithinWindow"](); } catch {}
    const px = point ? Number(point["x"]) : NaN;
    const py = point ? Number(point["y"]) : NaN;
    // A fresh proxy reports FLT_MAX until it has a layout. Before it is moved, and again once the engine clears its
    // position on mouse up (removePositionBeforeDrop), it sits at the host's origin: that is not the cursor.
    if (!(Math.abs(px) < 1e7 && Math.abs(py) < 1e7)) return true;
    if (Math.abs(px - drag.homeX) < 0.5 && Math.abs(py - drag.homeY) < 0.5) return true;
    if (!drag.origin) {
      drag.origin = { x: px, y: py };
      return true;
    }
    const seen = px + "," + py;
    if (seen === drag.last) return true;
    drag.last = seen;
    const dx = (px - drag.origin.x) / drag.scale;
    const dy = (py - drag.origin.y) / drag.scale;
    if (drag.bar) {
      BtLayout.barPos = { x: drag.x + dx, y: drag.y + dy };
      btBarWrite(drag.frame, BtLayout.barPos.x, BtLayout.barPos.y);
      BtLayout.barPos = BtLayout.barXY;
      return true;
    }
    if (drag.key === "m") {
      const entry = drag.corner ? btLayoutResizeMap(drag, dx, dy) : btLayoutMoveMap(drag, dx, dy);
      BtLayout.draft["mp"] = entry.spot;
      if (entry.scale === 1) delete BtLayout.draft["m"];
      else BtLayout.draft["m"] = entry.scale;
    } else if (drag.key === "lc") {
      const entry = drag.corner ? btLayoutTurnLoc(drag, dx, dy) : btLayoutMoveLoc(drag, dx, dy);
      // At the stock spot and turn the timer hands the label back to the stock CSS.
      if (entry[0] === 0 && entry[1] === 0 && entry[2] === BT_LOC_DEG) delete BtLayout.draft["lc"];
      else BtLayout.draft["lc"] = entry;
    } else {
      BtLayout.draft[drag.key] = drag.corner ? btLayoutResize(drag, dx, dy) : btLayoutMove(drag, dx, dy);
    }
    btLayoutPush();
    return true;
  }
  // Moves the label's centre with a soft snap onto its stock spot.
  function btLayoutMoveLoc(drag, dx, dy) {
    let cx = drag.cx + dx;
    let cy = drag.cy + dy;
    if (Math.abs(cx - drag.sx) <= BT_LAYOUT_SNAP) cx = drag.sx;
    if (Math.abs(cy - drag.sy) <= BT_LAYOUT_SNAP) cy = drag.sy;
    return btLayoutLocEntry(drag, cx, cy, drag.deg);
  }
  // The knob turns the label to face the cursor (0 = knob straight up, clockwise positive like CSS), whole degrees with
  // a soft snap to 15 degree steps. The cursor is the knob's centre plus the drag.
  function btLayoutTurnLoc(drag, dx, dy) {
    const vx = drag.kx + dx - drag.cx;
    const vy = drag.ky + dy - drag.cy;
    if (vx * vx + vy * vy < 16) return btLayoutLocEntry(drag, drag.cx, drag.cy, drag.deg);
    let deg = Math.round(Math.atan2(vx, -vy) * 180 / Math.PI);
    const step = Math.round(deg / BT_LOC_TURN_STEP) * BT_LOC_TURN_STEP;
    if (Math.abs(deg - step) <= BT_LOC_TURN_SNAP) deg = step;
    if (deg <= -180) deg += 360;
    return btLayoutLocEntry(drag, drag.cx, drag.cy, deg + 0);
  }
  // [dx, dy, degrees]: the centre clamped so the turned label stays inside the #minimap_persp box (the engine does not
  // draw a child outside it), stored as its offset from the stock spot in minimap px (1 decimal).
  function btLayoutLocEntry(drag, cx, cy, deg) {
    const turn = deg * Math.PI / 180;
    const cos = Math.abs(Math.cos(turn));
    const sin = Math.abs(Math.sin(turn));
    const hx = (drag.rw * cos + drag.rh * sin) / 2;
    const hy = (drag.rw * sin + drag.rh * cos) / 2;
    const x = btLayoutClamp(cx, drag.px + hx, Math.max(drag.px + hx, drag.px + drag.pw - hx));
    const y = btLayoutClamp(cy, drag.py + hy, Math.max(drag.py + hy, drag.py + drag.ph - hy));
    const offset = (value, stock) => btLayoutClamp(Math.round((value - stock) / drag.f * 10) / 10, -BT_LOC_MAX, BT_LOC_MAX) + 0;
    return [offset(x, drag.sx), offset(y, drag.sy), deg];
  }
  function btLayoutMove(drag, dx, dy) {
    const x = btLayoutClamp(btLayoutSnap(drag.x + dx, drag.rw, drag.w), 0, drag.w - drag.rw);
    const y = btLayoutClamp(btLayoutSnap(drag.y + dy, drag.rh, drag.h), 0, drag.h - drag.rh);
    return btLayoutEntry(drag, x, y, drag.s, drag.side);
  }
  // Uniform scale from the axis that moved more; the corner opposite the handle stays put.
  function btLayoutResize(drag, dx, dy) {
    const right = drag.corner.charAt(1) === "R";
    const bottom = drag.corner.charAt(0) === "B";
    const byX = (drag.rw + (right ? dx : -dx)) / drag.bw;
    const byY = (drag.rh + (bottom ? dy : -dy)) / drag.bh;
    const raw = Math.abs(byX - drag.s) >= Math.abs(byY - drag.s) ? byX : byY;
    const scale = Math.round(btLayoutClamp(raw, 0.5, 2) * 100) / 100;
    const w = drag.bw * scale;
    const h = drag.bh * scale;
    const x = btLayoutClamp(right ? drag.x : drag.x + drag.rw - w, 0, drag.w - w);
    const y = btLayoutClamp(bottom ? drag.y : drag.y + drag.rh - h, 0, drag.h - h);
    return btLayoutEntry(drag, x, y, scale, drag.side);
  }
  // Like a widget corner: uniform scale from the axis that moved more, the minimap's opposite corner stays put. The
  // #minimap_persp box (what the spot places) keeps its offset to the minimap at the new scale.
  function btLayoutResizeMap(drag, dx, dy) {
    const right = drag.corner.charAt(1) === "R";
    const bottom = drag.corner.charAt(0) === "B";
    const byX = drag.s * (drag.rw + (right ? dx : -dx)) / drag.rw;
    const byY = drag.s * (drag.rh + (bottom ? dy : -dy)) / drag.rh;
    const raw = Math.abs(byX - drag.s) >= Math.abs(byY - drag.s) ? byX : byY;
    const scale = Math.round(btLayoutClamp(raw, BT_MAP_SCALE_MIN / 100, BT_MAP_SCALE_MAX / 100) * 100) / 100;
    const k = scale / drag.s;
    const x = right ? drag.x : drag.x + drag.rw - drag.rw * k;
    const y = bottom ? drag.y : drag.y + drag.rh - drag.rh * k;
    return btLayoutMapEntry(drag, x - (drag.x - drag.px) * k, y - (drag.y - drag.py) * k, drag.pw * k, drag.ph * k, scale);
  }
  // Moves the #minimap_persp box with the same soft snap as a widget.
  function btLayoutMoveMap(drag, dx, dy) {
    const x = btLayoutSnap(drag.px + dx, drag.pw, drag.w);
    const y = btLayoutSnap(drag.py + dy, drag.ph, drag.h);
    return btLayoutMapEntry(drag, x, y, drag.pw, drag.ph, drag.s);
  }
  // {spot: top-left fractions of the box, kept fully on screen (5 decimals: whole px at 4K), scale}.
  function btLayoutMapEntry(drag, x, y, w, h, scale) {
    const fraction = (value, size, total) =>
      Math.round(btLayoutClamp(btLayoutClamp(value, 0, Math.max(0, total - size)) / total, 0, 1) * 100000) / 100000;
    return { spot: [fraction(x, w, drag.w), fraction(y, h, drag.h)], scale: scale };
  }
  // The proxy no longer follows the cursor here (see btLayoutDragStep), so the last tick's spot is the drop spot.
  function btLayoutDragEnd(api) {
    const drag = BtLayout.drag;
    if (!drag || drag.api !== api) return true;
    const entry = BtLayout.draft ? BtLayout.draft[drag.key] : null;
    btLayoutLog("drag " + drag.key + " " + (drag.corner || "move") + " end origin=" + (drag.origin ? "yes" : "never") +
      " entry=" + (entry !== undefined && entry !== null ? String(entry) : "unchanged"));
    btLayoutDragStop();
    return true;
  }
  function btLayoutDragStop() {
    BtLayout.dragHnd = btCancel(BtLayout.dragHnd);
    const drag = BtLayout.drag;
    BtLayout.drag = null;
    if (drag && panelValid(drag.proxy)) try { drag.proxy.DeleteAsync(0); } catch {}
  }

  function scanMarkers() {
    let markers;
    try { markers = UI.minimap.FindChildrenWithClassTraverse("map_button") || []; } catch { markers = []; }
    const enemies = [];
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      try {
        if (panelValid(marker) && marker.BHasClass("player") && marker.BHasClass("enemy")) enemies.push(marker);
      } catch {}
    }
    _enemyMarkers = enemies;
  }
  function loop() {
    _loopHnd = null;
    const rescan = _tick++ % 8 === 0;
    if (rescan) scanMarkers();
    btPaintArrows(_enemyMarkers, rescan);
    btLayoutSync();
    // Re-measures the bar once it has a layout; a dragged or unchanged spot writes nothing.
    btBarPlace();
    // Timer presence is the only menu input owned by another script.
    if (_btMenuOpen) {
      let timerPresent = false;
      try { timerPresent = panelValid(UI.minimap) && UI.minimap.BHasClass("bt-buff-timer"); } catch {}
      setPanelClass(UI.btPanel, "no-buff-timer", !timerPresent);
    }
    _loopHnd = btSchedule(0.25, loop);
  }
  function startLoop() {
    if (_loopHnd !== null || _tick !== 0 || !alive()) return;
    loop();
  }
  function findHostParent() {
    let cursor = UI.minimap;
    let fallback = null;
    try {
      while (panelValid(cursor = cursor.GetParent())) {
        if (cursor.BHasClass("HudCore")) return cursor;
        if (!fallback && cursor["paneltype"] === "CitadelHud") fallback = cursor;
      }
    } catch {}
    return fallback;
  }
  function resolveUI(host) {
    const find = id => host.FindChildTraverse(id);
    UI.btRoot = find(PANEL_IDS.btRoot);
    UI.btGear = find(PANEL_IDS.btGear);
    UI.btPanel = find(PANEL_IDS.btPanel);
    UI.colorRows = {};
    for (const target of BT_COLORS) {
      const row = find(target.row);
      if (row) UI.colorRows[target.key] = { row: row, swatch: find(target.swatch), hex: find(target.hex) };
    }
    UI.btStrengthHost = find(PANEL_IDS.btStrengthHost);
    UI.btStrengthValue = find(PANEL_IDS.btStrengthValue);
    UI.btEditor = find(PANEL_IDS.btEditor);
    UI.btPresetRow = find(PANEL_IDS.btPresetRow);
    UI.btSpectrumHost = find(PANEL_IDS.btSpectrumHost);
    UI.btBrightnessHost = find(PANEL_IDS.btBrightnessHost);
    UI.btBrightnessValue = find(PANEL_IDS.btBrightnessValue);
    UI.btHexEntry = find(PANEL_IDS.btHexEntry);
    UI.btLinger = find(PANEL_IDS.btLinger);
    UI.btGlow = find(PANEL_IDS.btGlow);
    UI.btBorder = find(PANEL_IDS.btBorder);
    UI.btOpacityHost = find(PANEL_IDS.btOpacityHost);
    UI.btOpacityValue = find(PANEL_IDS.btOpacityValue);
    UI.btStatus = find(PANEL_IDS.btStatus);
    UI.btReset = find(PANEL_IDS.btReset);
    UI.btResetLabel = find(PANEL_IDS.btResetLabel);
    UI.btStore = find(PANEL_IDS.btStore);
    UI.btLayoutButton = find(PANEL_IDS.btLayoutButton);
    UI.btLayoutBar = find(PANEL_IDS.btLayoutBar);
    UI.btLayoutDone = find(PANEL_IDS.btLayoutDone);
    UI.btLayoutCancel = find(PANEL_IDS.btLayoutCancel);
    UI.btLayoutReset = find(PANEL_IDS.btLayoutReset);
    UI.btLayoutGrip = find(PANEL_IDS.btLayoutGrip);
  }
  function boot() {
    if (_stopped || !panelValid(UI.minimap)) {
      stop();
      return;
    }
    if (!_parent) {
      _parent = findHostParent();
      if (!_parent) {
        // No generation exists until the HUD ancestor appears.
        _bootHnd = $.Schedule(1, () => {
          _bootHnd = null;
          if (_stopped || !panelValid(UI.minimap)) { stop(); return; }
          boot();
        });
        return;
      }
      try {
        _gen = (_parent.GetAttributeInt("bt_settings_gen", 0) | 0) + 1;
        _parent.SetAttributeInt("bt_settings_gen", _gen);
      } catch { stop(); return; }
    }
    if (!alive()) return;
    _layoutAttempts++;
    let host = null;
    try {
      let children = [];
      try { children = _parent.Children(); } catch {}
      if (!Array.isArray(children)) children = [];
      for (const child of children) {
        if (panelValid(child) && child.id === "BTMinimapSettingsHost") child.DeleteAsync(0);
      }
      host = $.CreatePanel("Panel", _parent, "BTMinimapSettingsHost");
      UI.host = host;
      host["hittest"] = false;
      host["hittestchildren"] = true;
      if (!host.BLoadLayout("file://{resources}/layout/bt_minimap_settings.xml", false, false)) throw new Error("layout unavailable");
    } catch {
      if (panelValid(host)) {
        try { host.DeleteAsync(0); } catch {}
      }
      UI.host = null;
      startLoop();
      if (_layoutAttempts < 3) {
        _bootHnd = btSchedule(5, () => {
          _bootHnd = null;
          boot();
        });
      }
      return;
    }
    resolveUI(host);
    btBuildEditor();
    UI.btStrength = btBuildSlider(UI.btStrengthHost, "BTGlowStrength", "bt-strength", BT_STRENGTH_MIN, BT_STRENGTH_MAX, 5, btOnStrength);
    btSyncSlider(UI.btStrength, BtSettings.strength);
    UI.btOpacity = btBuildSlider(UI.btOpacityHost, "BTMapOpacity", "bt-strength", BT_OPACITY_MIN, BT_OPACITY_MAX, BT_OPACITY_STEP, btOnOpacity);
    btSyncSlider(UI.btOpacity, BtSettings.opacity);
    btBindControls();
    btApplyToHud();
    btRefreshMenu();
    btStartStore();
    startLoop();
  }

  // TEST_EXPORTS_BEGIN
  if (typeof module !== "undefined" && module && module.exports) {
    const scanNow = () => { if (alive()) scanMarkers(); };
    const paintNow = () => { if (alive()) btPaintArrows(_enemyMarkers); };
    const getState = () => ({
      phase: BtStore.phase, status: BtStore.status, menuOpen: _btMenuOpen,
      up: BtSettings.colors["up"], down: BtSettings.colors["down"], linger: BtSettings.linger,
      colors: Object.assign({}, BtSettings.colors), strength: BtSettings.strength,
      glow: BtSettings.glow, picker: BtEditor.target, markers: _enemyMarkers.length, gen: _gen,
      layoutEditing: BtLayout.editing, layout: JSON.stringify(BtSettings.layout)
    });
    module.exports.__test = { getState, btDecode, btEncode, scanNow, paintNow, alive };
  }
  // TEST_EXPORTS_END

  boot();
})();
