(function () {
  "use strict";

  var CONFIG_ATTR = "hp_colors_rewrite_config";
  var MENU_STATE_ATTR = "hp_colors_rewrite_menu_state";
  var EVENT_CHANNEL = "ClientUI_FireOutput";
  var CONFIG_MAGIC = "HP_COLORS_REWRITE_CONFIG";
  var SUPPORTER_TICKER_URL =
    "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/";
  var PRESET_STORE_ID = "HPColorsRewritePresetStore";
  var PRESET_LABEL_ID = "HPColorsRewritePreset_001";
  var PRESET_ENTRY_CLASS = "hp_colors_rewrite_preset_entry";
  var PRESET_STORE_CONTRACT_ATTR = "hp_colors_rewrite_preset_contract";
  var PRESET_STORE_VERSION_ATTR = "hp_colors_rewrite_preset_version";
  var PRESET_STORE_CONTRACT = "HPCRP1";
  var PRESET_STORE_VERSION = "1";
  var PRESET_STORE_MAX_HEX_LENGTH = 524288;
  var presetStoreBootMessageShown = false;
  var PRECISE_PIPS_ENABLE_TEXT =
    '"citadel_unit_status_health_per_minor_pip" "10"\n' +
    '"citadel_unit_status_health_per_pip" "10"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "10"';
  var PRECISE_PIPS_RESET_TEXT =
    '"citadel_unit_status_health_per_minor_pip" "100"\n' +
    '"citadel_unit_status_health_per_pip" "100"\n' +
    '"citadel_unit_status_minor_pip_per_major_pip" "5"';
  var REPLAY_HOT_SEC = 1;
  var REPLAY_WARM_SEC = 3;
  var REPLAY_IDLE_SEC = 8;
  var REPLAY_HOT_COUNT = 3;
  var REPLAY_WARM_COUNT = 12;
  var HERO_POLL_ACTIVE_SEC = 1;
  var HERO_POLL_INACTIVE_SEC = 5;
  var HERO_MODE_AUTO = "auto";
  var HERO_MODE_MANUAL = "manual";
  var HERO_MODE_OFF = "off";
  var HERO_SCOPE_ALL = "all";
  var HERO_SCOPE_SELECTED = "selected";
  var HERO_PHASE_TRANSITIONING = "transitioning";
  var HERO_PHASE_LOBBY = "lobby";
  var HERO_PHASE_ACTIVE = "active";
  var HERO_PHASE_POST_MATCH = "post_match";

  var CATEGORY_DEFS = [
    {
      name: "OVERVIEW",
      tabs: [
        {
          name: "MASTER",
          title: "MASTER SWITCH",
          description:
            "Turn HP Colors on or off, then use Peek to review enemy and ally bars.",
          pageId: "HPColorsSettingsOverviewStatus",
          keys: ["enabled"],
        },
        {
          name: "LAYOUT",
          title: "BAR LAYOUT",
          description:
            "Resize and move the healthbar stack only. Unit, ultimate, and level icons keep their stock size and position.",
          pageId: "HPColorsSettingsOverviewLayout",
          keys: ["widthScale", "heightScale", "positionX", "positionY"],
        },
        {
          name: "PRESETS",
          title: "PRESET LIBRARY",
          description:
            "Build All Heroes and Selected Heroes presets, then set their automatic priority.",
          pageId: "HPColorsSettingsOverviewHero",
          keys: [],
        },
      ],
    },
    {
      name: "ENEMY",
      tabs: [
        {
          name: "BAR",
          title: "ENEMY BAR",
          description:
            "Choose fixed low, mid, and high colors or blend between them. Neutral units keep their default bars.",
          pageId: "HPColorsSettingsEnemyBar",
          keys: [
            "enemyEnabled",
            "enemyVisible",
            "enemyMode",
            "enemyLow",
            "enemyMid",
            "enemyHigh",
            "lowThreshold",
            "highThreshold",
            "enemyTeamHigh",
            "excludeBuildings",
            "excludeBosses",
            "excludeGhouls",
            "ghoulOpacityEnabled",
            "ghoulOpacity",
          ],
        },
        {
          name: "HEAL & DAMAGE",
          title: "HEAL & DAMAGE",
          description:
            "Choose the colors for healing and recent damage on enemy bars.",
          pageId: "HPColorsSettingsEnemyFeedback",
          keys: ["enemyHealing", "enemyDelta"],
        },
        {
          name: "SHIELDS",
          title: "SHIELDS",
          description:
            "Choose the color for enemy shield indicators.",
          pageId: "HPColorsSettingsEnemyShields",
          keys: ["enemyBulletShield"],
        },
        {
          name: "PULSE",
          title: "ENEMY PULSE",
          description:
            "Make enemy bars pulse when their health reaches the threshold.",
          pageId: "HPColorsSettingsEnemyPulse",
          keys: [
            "enemyPulseEnabled",
            "enemyPulseThreshold",
            "enemyPulseBpm",
            "enemyPulseIntensity",
            "enemyPulseColorEnabled",
            "enemyPulseColorMode",
            "enemyPulseColor",
            "enemyPulseHideBar",
            "enemyPulseReadout",
            "enemyPulseReadoutModifiers",
            "enemyPulseReadoutSize",
            "enemyPulseReadoutOffsetX",
            "enemyPulseReadoutOffsetY",
          ],
        },
        {
          name: "KILL MARKER",
          title: "ENEMY KILL MARKER",
          description:
            "Show a marker on visible enemy player healthbars at your chosen health threshold.",
          pageId: "HPColorsSettingsEnemyKillMarker",
          keys: [
            "enemyKillMarkerEnabled",
            "enemyKillMarkerThreshold",
            "enemyKillMarkerWidth",
            "enemyKillMarkerColor",
          ],
        },
      ],
    },
    {
      name: "ALLY",
      tabs: [
        {
          name: "BAR",
          title: "ALLY BAR",
          description:
            "Choose fixed low, mid, and high ally colors or blend between them using the shared thresholds.",
          pageId: "HPColorsSettingsAllyBar",
          keys: [
            "allyEnabled",
            "allyVisible",
            "allyMode",
            "allyLow",
            "allyMid",
            "allyHigh",
          ],
        },
        {
          name: "HEAL & DAMAGE",
          title: "HEAL & DAMAGE",
          description:
            "Choose the colors for healing and recent damage on ally bars.",
          pageId: "HPColorsSettingsAllyFeedback",
          keys: ["allyHealing", "allyDelta"],
        },
        {
          name: "SHIELDS",
          title: "ALLY SHIELDS",
          description: "Choose the color for ally bullet shields.",
          pageId: "HPColorsSettingsAllyShields",
          keys: ["allyBulletShield"],
        },
        {
          name: "PULSE",
          title: "ALLY PULSE",
          description:
            "Make ally bars pulse when their health reaches the threshold.",
          pageId: "HPColorsSettingsAllyPulse",
          keys: [
            "allyPulseEnabled",
            "allyPulseThreshold",
            "allyPulseBpm",
            "allyPulseIntensity",
            "allyPulseColorEnabled",
            "allyPulseColor",
          ],
        },
      ],
    },
    {
      name: "HEALTH INFO",
      tabs: [
        {
          name: "HP TEXT",
          title: "HP TEXT",
          description:
            "Choose how enemy HP appears: current and maximum, percentage, or current only.",
          pageId: "HPColorsSettingsReadoutNumber",
          keys: [
            "readoutVisible",
            "readoutFormat",
            "readoutSize",
            "readoutFont",
            "readoutColorMode",
            "readoutMode",
            "readoutLow",
            "readoutMid",
            "readoutHigh",
          ],
        },
        {
          name: "TEXT POSITION",
          title: "TEXT POSITION",
          description:
            "Move the HP text without moving the healthbar or unit icon.",
          pageId: "HPColorsSettingsReadoutPlacement",
          keys: ["readoutOffsetX", "readoutOffsetY"],
        },
        {
          name: "INDICATORS",
          title: "INDICATORS",
          description:
            "Control enemy health pips and levels plus the shared ultimate-ready icon color rule.",
          pageId: "HPColorsSettingsReadoutLevels",
          keys: [
            "pipsVisible",
            "precisePipsEnabled",
            "levelsVisible",
            "ultMode",
            "ultCustom",
          ],
        },
      ],
    },
  ];

  var CATEGORY_BUTTON_IDS = [
    "HPColorsCategoryOverview",
    "HPColorsCategoryEnemy",
    "HPColorsCategoryAlly",
    "HPColorsCategoryReadout",
  ];
  var COLOR_KEYS = {
    enemyLow: true,
    enemyMid: true,
    enemyHigh: true,
    enemyHealing: true,
    enemyDelta: true,
    enemyBulletShield: true,
    allyLow: true,
    allyMid: true,
    allyHigh: true,
    allyHealing: true,
    allyDelta: true,
    allyBulletShield: true,
    ultCustom: true,
    readoutLow: true,
    readoutMid: true,
    readoutHigh: true,
    enemyPulseColor: true,
    enemyKillMarkerColor: true,
    allyPulseColor: true,
  };
  var COLOR_TITLES = {
    enemyLow: "ENEMY LOW",
    enemyMid: "ENEMY MID",
    enemyHigh: "ENEMY HIGH",
    enemyHealing: "ENEMY HEALING",
    enemyDelta: "ENEMY RECENT DAMAGE",
    enemyBulletShield: "ENEMY SHIELD",
    allyLow: "ALLY LOW",
    allyMid: "ALLY MID",
    allyHigh: "ALLY HIGH",
    allyHealing: "ALLY HEALING",
    allyDelta: "ALLY RECENT DAMAGE",
    allyBulletShield: "ALLY SHIELD",
    ultCustom: "ULTIMATE ICON",
    readoutLow: "HEALTH TEXT LOW",
    readoutMid: "HEALTH TEXT MID",
    readoutHigh: "HEALTH TEXT HIGH",
    enemyPulseColor: "ENEMY PULSE COLOR",
    enemyKillMarkerColor: "ENEMY KILL MARKER COLOR",
  };
  var context = $.GetContextPanel();
  var DEFAULTS = {};
  var state = {
    booted: false,
    open: false,
    peeking: false,
    categoryIndex: 0,
    tabIndex: 0,
    view: null,
  };
  var stateInstance = null;
  var replayGeneration = 0;
  var replayRunning = false;
  var replayDispatches = 0;
  var serializedSnapshotRaw = "";
  var serializedReplayPayload = "";
  var lastClipboardCopied = null;
  Object.defineProperties(state, {
    values: {
      get: function () {
        var view = currentView();
        if (!view) return {};
        return view.currentScope ? view.currentScope.values : view.values;
      },
    },
    conditions: {
      get: function () {
        var view = currentView();
        if (!view) return {};
        return view.currentScope ? view.currentScope.conditions : view.conditions;
      },
    },
    history: {
      get: function () {
        var view = currentView();
        return { length: view && view.undoAvailable ? 1 : 0 };
      },
    },
  });
  var resetFeedbackGeneration = 0;
  function currentView() {
    if (stateInstance) state.view = stateInstance.read();
    var view = state.view;
    if (view && view.schema) DEFAULTS = view.schema.defaults || {};
    return view;
  }




  function commitValue(key, value) {
    var result = sendState({ type: "setting_edit", key: key, value: value });
    syncControls();
    return result;
  }



  function undo() {
    sendState({ type: "undo" });
    syncControls();
  }



  function executeStateEffects(effects) {
    if (!Array.isArray(effects)) return;
    for (var index = 0; index < effects.length; index++) {
      var effect = effects[index];
      if (!effect || !effect.type) continue;
      if (effect.type === "session_replace") {
        writeMenuState(effect.raw);
      } else if (effect.type === "effective_publish") {
        writeRootSnapshot(effect.raw);
        var payload = serializeChange(
          effect.settingId,
          effect.raw,
          effect.revision,
          effect.values,
        );
        cacheReplayPayload(effect.raw, payload);
        dispatchChange(effect.settingId, effect.raw, payload);
        refreshSnapshotReplay();
      } else if (effect.type === "clipboard_write") {
        lastClipboardCopied = executeClipboardEffect(effect);
      }
    }
  }
  function executeClipboardEffect(effect) {
    var text = String(effect.text || "");
    var copied = false;
    try {
      copied = $.DispatchEvent("CopyStringToClipboard", text) !== false;
    } catch {}
    if (!copied) {
      var input =
        effect.purpose === "settings"
          ? ui.transferInput
          : ui.presetTransferInput;
      try {
        if (isValid(input)) {
          input.text = text;
          focus(input);
          if (isCallable(input.SelectAll)) input.SelectAll();
          copied =
            $.DispatchEvent("TextEntryCopyToClipboard", input) !== false;
          input.text = "";
        }
      } catch {}
    }
    return copied;
  }

  function sendState(intent) {
    if (!stateInstance) return null;
    lastClipboardCopied = null;
    var result = stateInstance.send(intent);
    state.view = result && result.view ? result.view : stateInstance.read();
    if (result) executeStateEffects(result.effects);
    return result;
  }

  var picker = {
    key: "",
    hue: 0,
    saturation: 0,
    lightness: 100,
    returnPanel: null,
    condition: false,
  };
  var pickerGestureActive = false;
  var presetGuideVisible = false;
  var ui = {
    categoryButtons: [],
    tabButtons: [],
    tabLabels: [],
    settingsPages: [],
    precisePipsToggle: null,
    precisePipsDialog: null,
    precisePipsDialogTitle: null,
    precisePipsDialogMessage: null,
    precisePipsDialogCommands: null,
    precisePipsCopyLabel: null,
    precisePipsCopyButton: null,
    precisePipsCloseButton: null,
    ghoulOpacityRow: null,
    ghoulOpacitySlider: null,
    ghoulOpacityEntry: null,
    enemyKillMarkerToggle: null,
    enemyKillMarkerThresholdRow: null,
    enemyKillMarkerThresholdSlider: null,
    enemyKillMarkerThresholdEntry: null,
    enemyKillMarkerWidthRow: null,
    enemyKillMarkerWidthSlider: null,
    enemyKillMarkerWidthEntry: null,
    enemyKillMarkerColorRow: null,
    enemyKillMarkerColorSwatch: null,
    enemyKillMarkerColorEntry: null,
    heroModeAuto: null,
    heroModeManual: null,
    heroModeOff: null,
    heroPhase: null,
    heroIdentity: null,
    heroDetail: null,
    heroManualRow: null,
    heroManualButton: null,
    heroManualValue: null,
    heroDialog: null,
    heroOptions: null,
    heroCloseButton: null,
    currentScopeAll: null,
    currentScopeSelected: null,
    currentScopeSummary: null,
    scopeDialog: null,
    scopeSearch: null,
    scopeOptions: null,
    scopeCloseButton: null,
    presetNameInput: null,
    presetSaveButton: null,
    presetSaveButtonLabel: null,
    presetSaveMode: null,
    presetNewButton: null,
    presetForm: null,
    presetCancelEditButton: null,
    presetOptions: null,
    presetFeedback: null,
    presetCopyAllButton: null,
    presetImportButton: null,
    presetTransferDialog: null,
    presetTransferInput: null,
    presetTransferFeedback: null,
    presetTransferConfirmButton: null,
    presetTransferCloseButton: null,
    presetRestoreBakedButton: null,
    presetGuide: null,
    presetInfoToggle: null,
    presetStorePanel: null,
    resetDialog: null,
    resetDialogTitle: null,
    resetDialogMessage: null,
    resetConfirmButton: null,
    resetCancelButton: null,
    transferExportButton: null,
    transferImportButton: null,
    transferCloseButton: null,
    supporterTicker: null,
    liveStatus: null,
    conditionDialog: null,
    conditionTitle: null,
    conditionStatus: null,
    conditionSlotButtons: [],
    conditionSlotImages: [],
    conditionBooleanRow: null,
    conditionBooleanFalse: null,
    conditionBooleanTrue: null,
    conditionEnumRow: null,
    conditionEnumOptions: null,
    conditionNumberRow: null,
    conditionNumberSliderHost: null,
    conditionNumberSlider: null,
    conditionNumberEntry: null,
    conditionColorRow: null,
    conditionColorSwatch: null,
    conditionColorEntry: null,
    conditionRemoveButton: null,
    conditionCancelButton: null,
    conditionApplyButton: null,
  };
  var resetKeys = null;
  var identity = {
    root: null,
    hud: null,
    topBar: null,
    localPlayer: null,
    heroNameLabel: null,
    gameTime: null,
    watchGeneration: 0,
    renderSignature: "",
    optionPanels: [],
  };
  var ability = {
    slotParent: null,
    signature: null,
    slots: [null, null, null, null],
    observedTiers: [-1, -1, -1, -1],
    observedIdentityKey: "",
    artSources: ["", "", "", ""],
  };
  var conditionControls = {};
  var conditionDraft = {
    key: "",
    slot: 1,
    minTier: 1,
    value: null,
    returnPanel: null,
  };
  var scopeOptionPanels = [];
  var syncingControls = false;
  var presetDeleteConfirmId = "";
  var presetInlineRenameId = "";
  var presetInlineRenameInput = null;
  var presetFormOpen = false;
  var presetEditId = "";
  var presetTransferRequest = 0;

  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch {
      return false;
    }
  }
  function isCallable(value) {
    var tag = Object.prototype.toString.call(value);
    return (
      tag === "[object Function]" ||
      tag === "[object AsyncFunction]" ||
      tag === "[object GeneratorFunction]" ||
      tag === "[object AsyncGeneratorFunction]"
    );
  }

  function find(id) {
    try {
      return context && context.FindChildTraverse
        ? context.FindChildTraverse(id)
        : null;
    } catch {
      return null;
    }
  }

  function absoluteRoot(panel) {
    var current = panel;
    var last = panel;
    for (var depth = 0; current && depth < 24; depth++) {
      last = current;
      try {
        var parent = current.GetParent ? current.GetParent() : null;
        if (!parent || parent === current) break;
        current = parent;
      } catch {
        break;
      }
    }
    return last;
  }

  function setClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.SetHasClass(className, !!enabled);
    } catch {}
  }

  function setEnabled(panel, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.enabled = !!enabled;
      panel.SetHasClass("Disabled", !enabled);
    } catch {}
  }

  function setText(panel, value) {
    if (!isValid(panel)) return;
    try {
      if (panel.text !== value) panel.text = value;
    } catch {}
  }

  function setPanelEvent(panel, eventName, handler) {
    if (!isValid(panel)) return;
    try {
      panel.SetPanelEvent(eventName, handler);
    } catch {}
  }

  function openSupporterTicker() {
    var ticker = ui.supporterTicker;
    if (!isValid(ticker)) return;
    setClass(ticker, "Open", false);
    try {
      if (isCallable(ticker.SetIgnoreCursor))
        ticker.SetIgnoreCursor(true);
    } catch {}
    try {
      if (!isCallable(ticker.SetURL)) return;
      var requestUrl =
        SUPPORTER_TICKER_URL +
        "?refresh=" +
        String(new Date().getTime());
      ticker.SetURL(requestUrl);
      setClass(ticker, "Open", true);
    } catch {}
  }

  function closeSupporterTicker() {
    var ticker = ui.supporterTicker;
    if (!isValid(ticker)) return;
    try {
      if (isCallable(ticker.SetURL)) ticker.SetURL("about:blank");
    } catch {}
    setClass(ticker, "Open", false);
  }

  function focus(panel) {
    if (!isValid(panel)) return;
    try {
      if (panel.SetFocus) panel.SetFocus();
    } catch {}
  }

  function panelHasClass(panel, className) {
    if (!isValid(panel)) return false;
    try {
      return !!(panel.BHasClass && panel.BHasClass(className));
    } catch {
      return false;
    }
  }

  function findChild(panel, id) {
    if (!isValid(panel)) return null;
    try {
      return panel.FindChildTraverse ? panel.FindChildTraverse(id) : null;
    } catch {
      return null;
    }
  }

  function findChildrenWithClass(panel, className) {
    if (!isValid(panel)) return [];
    try {
      return panel.FindChildrenWithClassTraverse
        ? panel.FindChildrenWithClassTraverse(className) || []
        : [];
    } catch {
      return [];
    }
  }


  function parseGameTimeText(value) {
    var text = String(value || "").replace(/^\s+|\s+$/g, "");
    if (!text) return null;
    var negative = text.charAt(0) === "-";
    if (negative) text = text.slice(1);
    var parts = text.split(":");
    if (parts.length < 2 || parts.length > 3) return null;
    var seconds = 0;
    for (var index = 0; index < parts.length; index++) {
      if (!/^\d+$/.test(parts[index])) return null;
      seconds = seconds * 60 + Number(parts[index]);
    }
    return negative ? -seconds : seconds;
  }

  function readPanelText(panel) {
    if (!isValid(panel)) return "";
    try {
      return String(panel.text || "");
    } catch {
      return "";
    }
  }

  function clearIdentityPanelRefs() {
    identity.hud = null;
    identity.topBar = null;
    identity.localPlayer = null;
    identity.heroNameLabel = null;
    identity.gameTime = null;
  }

  function identitySignalHasClass(className) {
    return (
      panelHasClass(identity.root, className) ||
      panelHasClass(identity.hud, className)
    );
  }

  function resolveIdentityRoot() {
    if (!isValid(ui.absoluteRoot)) return false;
    if (identity.root !== ui.absoluteRoot) {
      identity.root = ui.absoluteRoot;
      clearIdentityPanelRefs();
    }
    if (!isValid(identity.hud)) {
      identity.hud =
        String(identity.root.id || "") === "Hud"
          ? identity.root
          : findChild(identity.root, "Hud");
    }
    return true;
  }

  function clearAbilityPanelRefs() {
    ability.slotParent = null;
    ability.signature = null;
    ability.slots = [null, null, null, null];
  }


  function setObservedAbilityTiers(next) {
    var signature = next.join("|");
    if (signature === ability.observedTiers.join("|")) return false;
    ability.observedTiers = next.slice(0);
    return true;
  }

  function clearObservedAbilityTiers() {
    clearAbilityPanelRefs();
    return setObservedAbilityTiers([-1, -1, -1, -1]);
  }

  function readAbilityTier(panel) {
    if (!isValid(panel)) return -1;
    for (var tier = 3; tier >= 0; tier--) {
      if (panelHasClass(panel, "Tier" + String(tier))) return tier;
    }
    return -1;
  }

  function readAbilityArtSource(panel) {
    if (!isValid(panel)) return "";
    var image = findChild(panel, "ability_image");
    if (!isValid(image)) return "";
    var source = "";
    try {
      source = image.GetAttributeString("src", "");
      if (!source) source = image.GetAttributeString("defaultsrc", "");
    } catch {
      source = "";
    }
    if (!source) {
      try {
        if (isCallable(image.GetSource))
          source = String(image.GetSource() || "");
      } catch {
        source = "";
      }
    }
    if (!source) {
      try {
        source = String(image.src || "");
      } catch {
        source = "";
      }
    }
    if (!source && image.style) {
      try {
        source = String(image.style.backgroundImage || "");
      } catch {
        source = "";
      }
    }
    if (source.indexOf("url(") === 0) {
      source = source.slice(4, -1);
      if (
        (source.charAt(0) === '"' && source.charAt(source.length - 1) === '"') ||
        (source.charAt(0) === "'" && source.charAt(source.length - 1) === "'")
      )
        source = source.slice(1, -1);
    }
    return source.indexOf("://") >= 0 ? source : "";
  }

  function syncConditionAbilityCard(slotIndex) {
    var button = ui.conditionSlotButtons[slotIndex];
    var image = ui.conditionSlotImages[slotIndex];
    if (!isValid(button)) return;
    var liveTier = ability.observedTiers[slotIndex];
    var selected = conditionDraft.slot === slotIndex + 1;
    setClass(button, "Selected", selected);
    setClass(button, "Unavailable", liveTier < 0);
    for (var required = 1; required <= 3; required++)
      setClass(
        button,
        "RequiredTier" + String(required),
        conditionDraft.minTier === required,
      );
    var source = readAbilityArtSource(ability.slots[slotIndex]);
    setClass(button, "HasAbilityArt", !!source);
    if (
      source &&
      isValid(image) &&
      ability.artSources[slotIndex] !== source
    ) {
      try {
        if (isCallable(image.SetImage)) image.SetImage(source);
        else image.src = source;
        ability.artSources[slotIndex] = source;
      } catch {
        setClass(button, "HasAbilityArt", false);
      }
    }
  }


  function abilityPanelCacheCurrent(referenced) {
    if (!isValid(ability.signature) || !isValid(ability.slotParent))
      return false;
    for (var index = 0; index < ability.slots.length; index++) {
      if (!referenced[index]) continue;
      if (!isValid(ability.slots[index])) return false;
      try {
        if (ability.slots[index].GetParent() !== ability.slotParent)
          return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  function resolveAbilityPanels(hudRoot, referenced) {
    if (abilityPanelCacheCurrent(referenced)) return true;
    ability.signature = null;
    ability.slotParent = null;
    ability.slots = [null, null, null, null];

    var signature = findChild(hudRoot, "hud_signature");
    if (!isValid(signature)) return false;
    ability.signature = signature;

    var slotParent = findChild(signature, "abilities");
    if (!isValid(slotParent)) {
      var anchor = findChild(signature, "slot_signature_1");
      if (isValid(anchor)) {
        try {
          slotParent = anchor.GetParent();
        } catch {
          slotParent = null;
        }
      }
    }
    if (!isValid(slotParent)) return false;
    ability.slotParent = slotParent;

    try {
      var childCount = slotParent.GetChildCount();
      for (var childIndex = 0; childIndex < childCount; childIndex++) {
        var child = slotParent.GetChild(childIndex);
        if (!isValid(child)) continue;
        var match = /^slot_signature_([1-4])$/.exec(String(child.id || ""));
        if (!match) continue;
        ability.slots[Number(match[1]) - 1] = child;
      }
    } catch {}

    var missingReferencedSlot = false;
    for (var index = 0; index < ability.slots.length; index++) {
      if (!isValid(ability.slots[index]) && referenced[index]) {
        missingReferencedSlot = true;
        break;
      }
    }
    if (missingReferencedSlot) return false;

    return true;
  }

  function reportAbilityTiers(view, tiers, clearPanels) {
    if (clearPanels) clearAbilityPanelRefs();
    var changed = setObservedAbilityTiers(tiers);
    var observedIdentityKey =
      String(view.identity.epoch) +
      "|" +
      String(view.identity.effectiveHeroKey || "");
    if (!changed && ability.observedIdentityKey === observedIdentityKey)
      return false;
    var result = sendState({
      type: "ability_observe",
      epoch: view.identity.epoch,
      tiers: tiers,
    });
    var committed = !!(result && result.outcome.status === "committed");
    if (result && result.outcome.status !== "rejected")
      ability.observedIdentityKey = observedIdentityKey;
    if ((changed || committed) && state.open) syncConditionIndicators();
    return changed || committed;
  }

  function sampleAbilityTiers() {
    var view = currentView();
    var required = view && view.ability ? view.ability.requiredSlots : null;
    var phase = view && view.identity ? view.identity.phase : HERO_PHASE_TRANSITIONING;
    var hasRules = false;
    var index;
    if (required) {
      for (index = 0; index < required.length; index++) {
        if (required[index]) {
          hasRules = true;
          break;
        }
      }
    }
    if (!hasRules) {
      ability.observedIdentityKey = "";
      return clearObservedAbilityTiers();
    }
    if (
      phase !== HERO_PHASE_ACTIVE ||
      identitySignalHasClass("spec_mode") ||
      !resolveIdentityRoot()
    )
      return reportAbilityTiers(view, [-1, -1, -1, -1], true);

    var next = [-1, -1, -1, -1];
    var hudRoot = isValid(identity.hud) ? identity.hud : identity.root;
    if (!resolveAbilityPanels(hudRoot, required))
      return reportAbilityTiers(view, next, false);
    for (index = 0; index < required.length; index++) {
      if (!required[index]) continue;
      next[index] = readAbilityTier(ability.slots[index]);
    }
    return reportAbilityTiers(view, next, false);
  }
  function readGameTimeSec() {
    if (isValid(identity.gameTime)) {
      var cached = parseGameTimeText(readPanelText(identity.gameTime));
      if (cached !== null) return cached;
      identity.gameTime = null;
    }
    if (!isValid(identity.topBar))
      identity.topBar = findChild(identity.root, "TopBar");
    var direct = findChild(identity.topBar, "GameTime");
    var directValue = parseGameTimeText(readPanelText(direct));
    if (directValue !== null) {
      identity.gameTime = direct;
      return directValue;
    }
    var candidates = findChildrenWithClass(identity.topBar, "GameTime");
    for (var index = 0; index < candidates.length; index++) {
      var value = parseGameTimeText(readPanelText(candidates[index]));
      if (value === null) continue;
      identity.gameTime = candidates[index];
      return value;
    }
    return null;
  }

  function readLifecyclePhase() {
    if (!resolveIdentityRoot()) return HERO_PHASE_TRANSITIONING;
    if (identitySignalHasClass("connectedToHideout"))
      return HERO_PHASE_LOBBY;
    if (
      identitySignalHasClass("GameStatePostGame") ||
      identitySignalHasClass("GameStatePostGamePlayOfTheGame")
    )
      return HERO_PHASE_POST_MATCH;
    if (
      identitySignalHasClass("GameStatePreGame") ||
      identitySignalHasClass("GameStatePreGameWait") ||
      identitySignalHasClass("GameStatePreGameHeroDraft")
    )
      return HERO_PHASE_LOBBY;
    var gameTime = readGameTimeSec();
    return gameTime !== null && gameTime >= 0
      ? HERO_PHASE_ACTIVE
      : HERO_PHASE_TRANSITIONING;
  }

  function resolveHeroNameLabel() {
    if (!resolveIdentityRoot()) return null;
    if (!isValid(identity.topBar))
      identity.topBar = findChild(identity.root, "TopBar");
    if (!isValid(identity.topBar)) return null;
    if (
      isValid(identity.localPlayer) &&
      panelHasClass(identity.localPlayer, "LocalPlayer") &&
      isValid(identity.heroNameLabel)
    )
      return identity.heroNameLabel;
    identity.localPlayer = null;
    identity.heroNameLabel = null;
    var candidates = findChildrenWithClass(identity.topBar, "LocalPlayer");
    for (var index = 0; index < candidates.length; index++) {
      var nameContainer = findChild(candidates[index], "PlayerNameNWContainer");
      var labels = findChildrenWithClass(nameContainer, "HeroName");
      if (!labels.length || !isValid(labels[0])) continue;
      identity.localPlayer = candidates[index];
      identity.heroNameLabel = labels[0];
      return identity.heroNameLabel;
    }
    return null;
  }

  function readLocalHeroName() {
    return readPanelText(resolveHeroNameLabel());
  }

  function heroDisplayName(heroKey) {
    var view = currentView();
    var heroes = view && view.heroes ? view.heroes : [];
    for (var index = 0; index < heroes.length; index++) {
      if (heroes[index].key === heroKey) return heroes[index].name;
    }
    return "";
  }

  function phaseDisplayName(phase) {
    if (phase === HERO_PHASE_LOBBY) return "LOBBY";
    if (phase === HERO_PHASE_ACTIVE) return "ACTIVE";
    if (phase === HERO_PHASE_POST_MATCH) return "POST MATCH";
    return "TRANSITIONING";
  }

  function syncHeroOptionSelection() {
    var view = currentView();
    var manualHeroKey = view && view.identity ? view.identity.manualHeroKey : "";
    for (var index = 0; index < identity.optionPanels.length; index++) {
      var option = identity.optionPanels[index];
      var key = "";
      try {
        key = option.GetAttributeString("hp_colors_hero_key", "");
      } catch {}
      setClass(option, "Selected", key === manualHeroKey);
    }
  }

  function renderIdentity() {
    var view = currentView();
    if (!view || !view.identity) return;
    var identityView = view.identity;
    var signature = [
      identityView.phase,
      identityView.mode,
      identityView.status,
      identityView.manualHeroKey,
      identityView.effectiveHeroKey,
      identityView.candidateHeroKey,
      identityView.epoch,
    ].join("|");
    if (signature === identity.renderSignature) return;
    identity.renderSignature = signature;

    var identityText = "HERO: UNKNOWN";
    var detailText =
      "No stable local hero is available. Hero-scoped state will not be selected.";
    if (identityView.mode === HERO_MODE_OFF) {
      identityText = "HERO DETECTION OFF";
      detailText = "Hero identity is disabled.";
    } else if (identityView.mode === HERO_MODE_MANUAL) {
      var manualName = heroDisplayName(identityView.effectiveHeroKey);
      if (manualName) {
        identityText = "HERO: " + manualName + " (MANUAL)";
        detailText = "Stable ID: " + identityView.effectiveHeroKey;
      } else {
        detailText = "Choose a hero for Manual Override.";
      }
    } else if (identityView.status === "settled") {
      var detectedName = heroDisplayName(identityView.effectiveHeroKey);
      identityText = "HERO: " + detectedName;
      detailText = "Stable ID: " + identityView.effectiveHeroKey;
    } else if (identityView.status === "settling") {
      identityText =
        "HERO: SETTLING — " +
        (heroDisplayName(identityView.candidateHeroKey) || "UNKNOWN");
      detailText = "Waiting for a second matching local-HUD sample.";
    } else if (identityView.phase !== HERO_PHASE_ACTIVE) {
      detailText = "Auto detection waits for an active match.";
    }
    setClass(
      ui.heroModeAuto,
      "Selected",
      identityView.mode === HERO_MODE_AUTO,
    );
    setClass(
      ui.heroModeManual,
      "Selected",
      identityView.mode === HERO_MODE_MANUAL,
    );
    setClass(ui.heroModeOff, "Selected", identityView.mode === HERO_MODE_OFF);
    setClass(
      ui.heroManualRow,
      "Active",
      identityView.mode === HERO_MODE_MANUAL,
    );
    setText(ui.heroPhase, "MATCH: " + phaseDisplayName(identityView.phase));
    setText(ui.heroIdentity, identityText);
    setText(ui.heroDetail, detailText);
    setText(
      ui.heroManualValue,
      heroDisplayName(identityView.manualHeroKey) || "SELECT HERO",
    );
    $.Msg(
      "[HP Colors Rewrite] identity phase=" +
        identityView.phase +
        " mode=" +
        identityView.mode +
        " status=" +
        identityView.status +
        " effective=" +
        (identityView.effectiveHeroKey || "<none>") +
        " epoch=" +
        identityView.epoch,
    );
  }

  function identityPollDelay() {
    var view = currentView();
    var phase = view && view.identity ? view.identity.phase : HERO_PHASE_TRANSITIONING;
    return phase === HERO_PHASE_LOBBY || phase === HERO_PHASE_POST_MATCH
      ? HERO_POLL_INACTIVE_SEC
      : HERO_POLL_ACTIVE_SEC;
  }

  function scheduleIdentityTick(generation, delay) {
    try {
      $.Schedule(delay, function identityTick() {
        if (generation !== identity.watchGeneration || !isValid(ui.absoluteRoot))
          return;
        var view = currentView();
        if (!view || !view.identity) return;
        var previousPhase = view.identity.phase;
        var nextPhase = readLifecyclePhase();
        if (nextPhase !== previousPhase) {
          clearIdentityPanelRefs();
          sendState({
            type: "lifecycle_observe",
            epoch: view.identity.epoch + 1,
            phase: nextPhase,
          });
          renderIdentity();
          sampleAbilityTiers();
          restartIdentityWatch();
          return;
        }
        view = currentView();
        if (
          view.identity.mode === HERO_MODE_AUTO &&
          view.identity.phase === HERO_PHASE_ACTIVE
        ) {
          sendState({
            type: "hero_observe",
            epoch: view.identity.epoch,
            heroName: readLocalHeroName(),
          });
        }
        renderIdentity();
        sampleAbilityTiers();
        scheduleIdentityTick(generation, identityPollDelay());
      });
    } catch {}
  }

  function restartIdentityWatch() {
    identity.watchGeneration += 1;
    scheduleIdentityTick(identity.watchGeneration, 0);
  }
  function closeHeroDialog() {
    if (!isValid(ui.heroDialog) || !ui.heroDialog.BHasClass("Open")) return;
    setClass(ui.heroDialog, "Open", false);
    focus(ui.heroManualButton);
  }

  function openHeroDialog() {
    var view = currentView();
    if (!view || !view.identity || view.identity.mode !== HERO_MODE_MANUAL)
      return;
    closeTransferDialog();
    closeScopeDialog();
    closePicker();
    closePrecisePipsDialog();
    syncHeroOptionSelection();
    setClass(ui.heroDialog, "Open", true);
    focus(ui.heroDialog);
  }

  function selectManualHero(heroKey) {
    var view = currentView();
    var heroes = view && view.heroes ? view.heroes : [];
    var known = false;
    for (var index = 0; index < heroes.length; index++) {
      if (heroes[index].key === heroKey) {
        known = true;
        break;
      }
    }
    if (!known) return;
    sendState({ type: "hero_manual", heroKey: heroKey });
    renderIdentity();
    closeHeroDialog();
  }

  function setHeroMode(mode) {
    if (
      mode !== HERO_MODE_AUTO &&
      mode !== HERO_MODE_MANUAL &&
      mode !== HERO_MODE_OFF
    )
      return;
    sendState({ type: "hero_mode", mode: mode });
    closeHeroDialog();
    renderIdentity();
  }

  function createHeroOptions() {
    if (!isValid(ui.heroOptions)) return false;
    var view = currentView();
    var heroes = view && view.heroes ? view.heroes : [];
    for (var index = 0; index < heroes.length; index++) {
      (function (heroKey, heroName, optionIndex) {
        var option = $.CreatePanel(
          "Button",
          ui.heroOptions,
          "HPColorsHeroOption" + optionIndex,
        );
        var label = $.CreatePanel(
          "Label",
          option,
          "HPColorsHeroOptionLabel" + optionIndex,
        );
        if (!isValid(option) || !isValid(label)) return;
        option.AddClass("HPColorsHeroOption");
        option.SetAttributeString("hp_colors_hero_key", heroKey);
        label.text = heroName;
        setPanelEvent(option, "onactivate", function () {
          selectManualHero(heroKey);
        });
        identity.optionPanels.push(option);
      })(heroes[index].key, heroes[index].name, index);
    }
    return identity.optionPanels.length === heroes.length;
  }
  function currentScopeRow() {
    var view = currentView();
    return view && view.currentScope ? view.currentScope : null;
  }

  function setCurrentScopeMode(mode) {
    if (mode !== HERO_SCOPE_ALL && mode !== HERO_SCOPE_SELECTED) return;
    var row = currentScopeRow();
    sendState({
      type: "scope_set",
      mode: mode,
      heroes: mode === HERO_SCOPE_SELECTED && row ? row.heroes : [],
    });
    renderCurrentScope();
    renderPresetOptions();
    syncControls();
  }

  function toggleCurrentScopeHero(heroKey) {
    var view = currentView();
    var heroes = view && view.heroes ? view.heroes : [];
    var known = false;
    var index;
    for (index = 0; index < heroes.length; index++) {
      if (heroes[index].key === heroKey) {
        known = true;
        break;
      }
    }
    if (!known) return;
    var row = currentScopeRow();
    var selected = row && row.mode === HERO_SCOPE_SELECTED
      ? row.heroes.slice(0)
      : [];
    var found = selected.indexOf(heroKey) >= 0;
    var next = [];
    for (index = 0; index < selected.length; index++)
      if (selected[index] !== heroKey) next.push(selected[index]);
    if (!found) next.push(heroKey);
    sendState({
      type: "scope_set",
      mode: next.length ? HERO_SCOPE_SELECTED : HERO_SCOPE_ALL,
      heroes: next,
    });
    renderCurrentScope();
    renderPresetOptions();
    syncControls();
  }

  function filterScopeHeroOptions() {
    var query = String((ui.scopeSearch && ui.scopeSearch.text) || "")
      .trim()
      .toUpperCase();
    for (var index = 0; index < scopeOptionPanels.length; index++) {
      var option = scopeOptionPanels[index];
      var searchText = "";
      try {
        searchText = option.GetAttributeString(
          "hp_colors_scope_search",
          "",
        );
      } catch {}
      setClass(option, "FilteredOut", !!query && searchText.indexOf(query) < 0);
    }
  }

  function renderCurrentScope() {
    var row = currentScopeRow();
    var mode =
      row && row.mode === HERO_SCOPE_SELECTED
        ? HERO_SCOPE_SELECTED
        : HERO_SCOPE_ALL;
    setClass(ui.currentScopeAll, "Selected", mode === HERO_SCOPE_ALL);
    setClass(
      ui.currentScopeSelected,
      "Selected",
      mode === HERO_SCOPE_SELECTED,
    );
    var summary = "ALL HEROES";
    if (mode === HERO_SCOPE_SELECTED && row) {
      var names = [];
      for (var index = 0; index < row.heroes.length; index++)
        names.push(heroDisplayName(row.heroes[index]));
      summary = names.join(", ");
    }
    setText(ui.currentScopeSummary, summary);
    for (var optionIndex = 0; optionIndex < scopeOptionPanels.length; optionIndex++) {
      var option = scopeOptionPanels[optionIndex];
      var heroKey = "";
      try {
        heroKey = option.GetAttributeString(
          "hp_colors_scope_hero_key",
          "",
        );
      } catch {}
      setClass(
        option,
        "Selected",
        mode === HERO_SCOPE_SELECTED &&
          row &&
          row.heroes.indexOf(heroKey) >= 0,
      );
    }
  }

  function closeScopeDialog() {
    if (!isValid(ui.scopeDialog) || !ui.scopeDialog.BHasClass("Open")) return;
    setClass(ui.scopeDialog, "Open", false);
    focus(ui.currentScopeSelected);
  }

  function openScopeDialog() {
    closeTransferDialog();
    closeHeroDialog();
    closePicker();
    closePrecisePipsDialog();
    if (isValid(ui.scopeSearch)) ui.scopeSearch.text = "";
    filterScopeHeroOptions();
    renderCurrentScope();
    setClass(ui.scopeDialog, "Open", true);
    focus(ui.scopeSearch);
  }

  function createScopeHeroOptions() {
    if (!isValid(ui.scopeOptions)) return false;
    var view = currentView();
    var heroes = view && view.heroes ? view.heroes : [];
    for (var index = 0; index < heroes.length; index++) {
      (function (heroKey, heroName, optionIndex) {
        var option = $.CreatePanel(
          "Button",
          ui.scopeOptions,
          "HPColorsScopeHeroOption" + optionIndex,
        );
        var label = $.CreatePanel(
          "Label",
          option,
          "HPColorsScopeHeroOptionLabel" + optionIndex,
        );
        if (!isValid(option) || !isValid(label)) return;
        option.AddClass("HPColorsHeroOption");
        option.AddClass("HPColorsScopeHeroOption");
        option.SetAttributeString("hp_colors_scope_hero_key", heroKey);
        option.SetAttributeString(
          "hp_colors_scope_search",
          (heroName + " " + heroKey).toUpperCase(),
        );
        label.text = heroName;
        setPanelEvent(option, "onactivate", function () {
          toggleCurrentScopeHero(heroKey);
        });
        scopeOptionPanels.push(option);
      })(heroes[index].key, heroes[index].name, index);
    }
    return scopeOptionPanels.length === heroes.length;
  }
  function setPresetFeedback(text, isError) {
    setText(ui.presetFeedback, text || "");
    setClass(ui.presetFeedback, "Error", !!isError);
  }

  function presetScopeSummary(preset) {
    if (preset.mode === HERO_SCOPE_ALL) return "ALL HEROES";
    if (preset.mode !== HERO_SCOPE_SELECTED) return "REWRITE DEFAULT";
    var names = [];
    for (var index = 0; index < preset.heroes.length; index++)
      names.push(heroDisplayName(preset.heroes[index]));
    return names.join(", ");
  }

  function presetMatchesCurrentScope(preset) {
    var view = currentView();
    return !!(
      view &&
      view.repository &&
      view.repository.activeId === preset.id
    );
  }

  function createPresetRowAction(
    option,
    id,
    className,
    text,
    enabled,
    activate,
  ) {
    var button = $.CreatePanel("Button", option, id);
    if (!isValid(button)) return null;
    button.AddClass("HPColorsPresetRowAction");
    if (className) button.AddClass(className);
    setClass(button, "Disabled", !enabled);
    button.enabled = !!enabled;
    button.hittest = !!enabled;
    var label = $.CreatePanel("Label", button, id + "Label");
    if (isValid(label)) label.text = text;
    setPanelEvent(button, "onactivate", function () {
      if (enabled && isCallable(activate)) activate();
    });
    return button;
  }

  function renderPresetOptions() {
    if (!isValid(ui.presetOptions)) return;
    try {
      ui.presetOptions.RemoveAndDeleteChildren();
    } catch {}
    presetInlineRenameInput = null;
    var view = currentView();
    var repository = view && view.repository ? view.repository : null;
    var records = repository && repository.rows ? repository.rows : [];
    var selectedId = repository ? repository.selectedId : "";
    var userRows = [];
    for (var userRowIndex = 0; userRowIndex < records.length; userRowIndex++)
      if (records[userRowIndex].kind === "user") userRows.push(records[userRowIndex]);
    for (var index = 0; index < records.length; index++) {
      (function (preset, optionIndex) {
        var option = $.CreatePanel(
          "Panel",
          ui.presetOptions,
          "HPColorsPresetOption" + optionIndex,
        );
        if (!isValid(option)) return;
        var selected = preset.id === selectedId;
        var editingPreset =
          presetFormOpen &&
          presetEditId === preset.id &&
          preset.kind === "user";
        option.AddClass("HPColorsPresetOption");
        option.hittest = true;
        option.hittestchildren = true;
        option.canfocus = true;
        option.SetAttributeString("hp_colors_preset_id", preset.id);
        var active = presetMatchesCurrentScope(preset);
        var confirming = presetDeleteConfirmId === preset.id;
        setClass(option, "Selected", selected);
        setClass(option, "Active", active);
        setClass(option, "Confirming", confirming);
        setClass(option, "Editing", editingPreset);

        if (confirming) {
          var confirmMessage = $.CreatePanel(
            "Label",
            option,
            "HPColorsPresetRowConfirmMessage" + optionIndex,
          );
          if (isValid(confirmMessage)) {
            confirmMessage.AddClass("HPColorsPresetRowConfirmMessage");
            confirmMessage.text =
              (preset.kind === "baked" ? "HIDE " : "DELETE ") +
              presetDisplayName(preset).toUpperCase() +
              "?";
          }
          createPresetRowAction(
            option,
            "HPColorsPresetRowConfirm" + optionIndex,
            "HPColorsPresetRowConfirm",
            "CONFIRM",
            true,
            confirmDeleteSelectedPreset,
          );
          createPresetRowAction(
            option,
            "HPColorsPresetRowCancel" + optionIndex,
            "HPColorsPresetRowCancel",
            "CANCEL",
            true,
            cancelDeleteSelectedPreset,
          );
          return;
        }

        var editing = presetInlineRenameId === preset.id;
        var name = $.CreatePanel(
          editing ? "TextEntry" : "Label",
          option,
          "HPColorsPresetOptionName" + optionIndex,
        );
        var scope = $.CreatePanel(
          "Label",
          option,
          "HPColorsPresetOptionScope" + optionIndex,
        );
        var status = $.CreatePanel(
          "Label",
          option,
          "HPColorsPresetOptionStatus" + optionIndex,
        );
        if (!isValid(name) || !isValid(scope) || !isValid(status)) return;
        name.AddClass("HPColorsPresetOptionName");
        scope.AddClass("HPColorsPresetOptionScope");
        status.AddClass("HPColorsPresetOptionStatus");
        if (editing) {
          name.AddClass("Editing");
          name.text = presetDisplayName(preset);
          name.maxchars = 48;
          name.canfocus = true;
          presetInlineRenameInput = name;
          setPanelEvent(name, "ontextentrysubmit", function () {
            commitInlinePresetRename(preset.id);
          });
          setPanelEvent(name, "onblur", function () {
            commitInlinePresetRename(preset.id);
          });
          setPanelEvent(name, "oncancel", cancelInlinePresetRename);
        } else {
          name.AddClass("Editable");
          name.text =
            presetDisplayName(preset) +
            (preset.kind === "baked" ? "  ·  BAKED" : "  ·  SESSION");
          name.hittest = true;
          setPanelEvent(name, "onactivate", function () {
            beginInlinePresetRename(preset.id);
          });
        }
        scope.text =
          (preset.mode === HERO_SCOPE_SELECTED ? "AUTO  ·  " : "") +
          presetScopeSummary(preset);
        status.text = editingPreset ? "EDITING" : active ? "ACTIVE" : "";

        var userIndex = -1;
        if (preset.kind === "user") {
          for (var presetIndex = 0; presetIndex < userRows.length; presetIndex++) {
            if (userRows[presetIndex].id === preset.id) {
              userIndex = presetIndex;
              break;
            }
          }
          createPresetRowAction(
            option,
            "HPColorsPresetRowUp" + optionIndex,
            "HPColorsPresetRowUp",
            "▲",
            userIndex > 0,
            function () {
              selectPresetForRowAction(preset.id);
              moveSelectedPreset(-1);
            },
          );
          createPresetRowAction(
            option,
            "HPColorsPresetRowDown" + optionIndex,
            "HPColorsPresetRowDown",
            "▼",
            userIndex >= 0 && userIndex < userRows.length - 1,
            function () {
              selectPresetForRowAction(preset.id);
              moveSelectedPreset(1);
            },
          );
        }
        createPresetRowAction(
          option,
          "HPColorsPresetRowCopy" + optionIndex,
          "HPColorsPresetRowCopy",
          "COPY",
          true,
          function () {
            selectPresetForRowAction(preset.id);
            copySelectedPreset();
          },
        );
        var primaryAction = createPresetRowAction(
          option,
          "HPColorsPresetRowApply" + optionIndex,
          "HPColorsPresetRowApply",
          editingPreset ? "SAVE & APPLY" : "APPLY",
          true,
          function () {
            if (editingPreset) {
              saveCurrentPreset();
            } else {
              requestPresetApplication(preset.id, false);
            }
          },
        );
        if (editingPreset) setClass(primaryAction, "SaveAndApply", true);
        createPresetRowAction(
          option,
          "HPColorsPresetRowDelete" + optionIndex,
          "HPColorsPresetRowDelete",
          preset.kind === "baked" ? "HIDE" : "DELETE",
          true,
          function () {
            selectPresetForRowAction(preset.id);
            beginDeleteSelectedPreset();
          },
        );
        setPanelEvent(option, "onactivate", function () {
          selectPresetRecord(preset.id);
        });
      })(records[index], index);
    }
    var hasHiddenBaked = !!(
      repository &&
      repository.hiddenBakedIds &&
      repository.hiddenBakedIds.length
    );
    setClass(ui.presetRestoreBakedButton, "Active", hasHiddenBaked);
    if (isValid(ui.presetRestoreBakedButton))
      ui.presetRestoreBakedButton.enabled = hasHiddenBaked;
  }
  function syncPresetSaveForm(resetName) {
    var editPreset = presetFormOpen ? findPresetRecord(presetEditId) : null;
    if (!editPreset || editPreset.kind !== "user") {
      editPreset = null;
      presetEditId = "";
    }
    setText(
      ui.presetSaveMode,
      editPreset
        ? "EDITING " + presetDisplayName(editPreset).toUpperCase()
        : "CREATE A NEW PRESET",
    );
    setText(
      ui.presetSaveButtonLabel,
      editPreset ? "SAVE & APPLY" : "CREATE PRESET",
    );
    setClass(ui.presetForm, "Active", presetFormOpen);
    setClass(ui.presetNewButton, "FormOpen", presetFormOpen);
    if (isValid(ui.presetNewButton))
      ui.presetNewButton.enabled = !presetFormOpen;
    if (resetName && isValid(ui.presetNameInput))
      ui.presetNameInput.text = editPreset ? editPreset.name : "";
  }

  function beginNewPreset() {
    var result = sendState({ type: "preset_select", id: null });
    if (!result || !result.outcome || result.outcome.status === "rejected") {
      setPresetFeedback("COULD NOT START A NEW PRESET.", true);
      return;
    }
    presetDeleteConfirmId = "";
    presetInlineRenameId = "";
    presetInlineRenameInput = null;
    presetFormOpen = true;
    presetEditId = "";
    renderPresetOptions();
    syncPresetSaveForm(true);
    setPresetFeedback(
      "CREATE PRESET SAVES YOUR CURRENT MENU SETTINGS AS A NEW RECORD.",
      false,
    );
    focus(ui.presetNameInput);
  }

  function cancelPresetEdit() {
    sendState({ type: "preset_select", id: null });
    presetFormOpen = false;
    presetEditId = "";
    renderPresetOptions();
    syncPresetSaveForm(true);
    setPresetFeedback("PRESET EDIT CANCELED. NOTHING CHANGED.", false);
  }

  function selectPresetForRowAction(id) {
    if (!id) return false;
    if (currentView().repository.selectedId === id) return true;
    var result = sendState({ type: "preset_select", id: id });
    return !!(
      result &&
      result.outcome &&
      result.outcome.status !== "rejected"
    );
  }

  function selectPresetRecord(id) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset) return false;
    var result = sendState({ type: "preset_select", id: preset.id });
    presetDeleteConfirmId = "";
    presetInlineRenameId = "";
    if (result && result.outcome && result.outcome.status === "rejected") {
      setPresetFeedback("THAT PRESET NO LONGER EXISTS.", true);
      return false;
    }
    presetFormOpen = preset.kind === "user";
    presetEditId = presetFormOpen ? preset.id : "";
    renderPresetOptions();
    syncPresetSaveForm(true);
    setPresetFeedback(
      presetFormOpen
        ? "EDITING " +
            presetDisplayName(preset).toUpperCase() +
            ". SAVE & APPLY REPLACES THIS PRESET WITH YOUR CURRENT MENU SETTINGS, THEN LOADS IT."
        : "SELECTED " +
            presetDisplayName(preset).toUpperCase() +
            ". APPLY LOADS THIS PRESET NOW. IT DOES NOT EDIT THE PRESET.",
      false,
    );
    if (presetFormOpen) focus(ui.presetNameInput);
    return true;
  }

  function renamePresetRecord(preset, name) {
    if (!preset || !name) return false;
    var result = sendState({
      type: "preset_rename",
      id: preset.id,
      name: name,
    });
    if (result && result.outcome && result.outcome.status === "rejected") {
      setPresetFeedback("PRESET NOT FOUND.", true);
      return false;
    }
    presetInlineRenameId = "";
    presetInlineRenameInput = null;
    renderPresetOptions();
    syncPresetSaveForm(true);
    setPresetFeedback("RENAMED TO " + name.toUpperCase() + ".", false);
    focusSelectedPresetRow();
    return true;
  }

  function beginInlinePresetRename(id) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset) return;
    selectPresetForRowAction(preset.id);
    presetDeleteConfirmId = "";
    presetInlineRenameId = preset.id;
    renderPresetOptions();
    syncPresetSaveForm(true);
    var renameId = preset.id;
    var renameInput = presetInlineRenameInput;
    setPresetFeedback(
      "EDITING " + presetDisplayName(preset).toUpperCase() + ".",
      false,
    );
    try {
      $.Schedule(0.01, function () {
        if (
          !state.open ||
          presetInlineRenameId !== renameId ||
          presetInlineRenameInput !== renameInput ||
          !isValid(renameInput)
        )
          return;
        focus(renameInput);
        if (isCallable(renameInput.SelectAll)) renameInput.SelectAll();
      });
    } catch {
      if (
        state.open &&
        presetInlineRenameId === renameId &&
        presetInlineRenameInput === renameInput
      )
        focus(renameInput);
    }
  }

  function commitInlinePresetRename(id) {
    if (presetInlineRenameId !== String(id || "")) return;
    var preset = findPresetRecord(presetInlineRenameId);
    var name = String(
      (presetInlineRenameInput && presetInlineRenameInput.text) || "",
    ).trim();
    if (!name) {
      setPresetFeedback("ENTER A PRESET NAME.", true);
      focus(presetInlineRenameInput);
      return;
    }
    renamePresetRecord(preset, name);
  }

  function cancelInlinePresetRename() {
    if (!presetInlineRenameId) return;
    presetInlineRenameId = "";
    presetInlineRenameInput = null;
    renderPresetOptions();
    setPresetFeedback("PRESET RENAME CANCELED.", false);
    focusSelectedPresetRow();
  }

  function moveSelectedPreset(delta) {
    var view = currentView();
    var id = view && view.repository ? view.repository.selectedId : "";
    if (!id) return false;
    presetInlineRenameId = "";
    var result = sendState({ type: "preset_move", id: id, delta: delta });
    if (
      !result ||
      !result.outcome ||
      result.outcome.status === "rejected" ||
      result.outcome.code === "MOVE_BOUNDARY"
    )
      return false;
    renderPresetOptions();
    setPresetFeedback("MOVED " + id.toUpperCase() + ".", false);
    focusSelectedPresetRow();
    return true;
  }

  function beginDeleteSelectedPreset() {
    var view = currentView();
    var id = view && view.repository ? view.repository.selectedId : "";
    var preset = findPresetRecord(id);
    if (!preset) {
      setPresetFeedback("SELECT A PRESET FIRST.", true);
      return;
    }
    var result = sendState({ type: "preset_remove_request", id: preset.id });
    if (!result || !result.view || !result.view.transactions.confirmation) {
      setPresetFeedback("PRESET NOT FOUND.", true);
      return;
    }
    presetDeleteConfirmId = preset.id;
    presetInlineRenameId = "";
    renderPresetOptions();
    setPresetFeedback(
      "CONFIRM " +
        (preset.kind === "baked" ? "HIDE " : "DELETE ") +
        presetDisplayName(preset).toUpperCase() +
        ".",
      false,
    );
  }

  function cancelDeleteSelectedPreset() {
    var view = currentView();
    var confirmation = view && view.transactions
      ? view.transactions.confirmation
      : null;
    if (confirmation && confirmation.kind === "preset_remove")
      sendState({
        type: "preset_remove_cancel",
        token: confirmation.token,
      });
    presetDeleteConfirmId = "";
    renderPresetOptions();
    setPresetFeedback("PRESET CHANGE CANCELED.", false);
    focusSelectedPresetRow();
  }


  function focusSelectedPresetRow() {
    var view = currentView();
    var selectedId = view && view.repository ? view.repository.selectedId : "";
    if (!selectedId || !isValid(ui.presetOptions)) return;
    var rows = ui.presetOptions.Children();
    for (var index = 0; index < rows.length; index++) {
      if (
        rows[index].GetAttributeString("hp_colors_preset_id", "") ===
        selectedId
      ) {
        focus(rows[index]);
        return;
      }
    }
  }

  function confirmDeleteSelectedPreset() {
    var view = currentView();
    var repository = view && view.repository ? view.repository : null;
    var confirmation = view && view.transactions
      ? view.transactions.confirmation
      : null;
    var preset = findPresetRecord(presetDeleteConfirmId);
    if (
      !preset ||
      !repository ||
      repository.selectedId !== preset.id ||
      !confirmation ||
      confirmation.kind !== "preset_remove"
    ) {
      cancelDeleteSelectedPreset();
      return;
    }
    var result = sendState({
      type: "preset_remove_confirm",
      token: confirmation.token,
    });
    if (result && result.outcome && result.outcome.status === "committed") {
      presetDeleteConfirmId = "";
      presetInlineRenameId = "";
      if (presetEditId === preset.id) {
        presetEditId = "";
        presetFormOpen = false;
      }
      renderPresetOptions();
      syncPresetSaveForm(true);
      setPresetFeedback(
        (preset.kind === "baked" ? "HIDDEN " : "DELETED ") +
          presetDisplayName(preset).toUpperCase() +
          ".",
        false,
      );
      focusSelectedPresetRow();
    }
  }

  function restoreHiddenBakedPresets() {
    var view = currentView();
    if (
      !view ||
      !view.repository ||
      !view.repository.hiddenBakedIds ||
      !view.repository.hiddenBakedIds.length
    )
      return;
    sendState({ type: "preset_restore_baked" });
    presetInlineRenameId = "";
    renderPresetOptions();
    setPresetFeedback("RESTORED BAKED PRESETS.", false);
  }

  function copySelectedPreset() {
    var view = currentView();
    var selectedId = view && view.repository ? view.repository.selectedId : "";
    if (!selectedId) {
      setPresetFeedback("SELECT A PRESET FIRST.", true);
      return;
    }
    var result = sendState({ type: "preset_copy_selected" });
    var failed =
      !result ||
      !result.outcome ||
      result.outcome.status === "rejected" ||
      lastClipboardCopied !== true;
    setPresetFeedback(
      failed ? "COPY FAILED — PRESET CODE NOT COPIED." : "COPIED PRESET.",
      failed,
    );
  }

  function copyAllPresets() {
    var result = sendState({ type: "preset_copy_all" });
    var failed =
      !result ||
      !result.outcome ||
      result.outcome.status === "rejected" ||
      lastClipboardCopied !== true;
    setPresetFeedback(
      failed ? "NO PRESETS TO COPY." : "COPIED PRESETS.",
      failed,
    );
  }

  function setPresetTransferFeedback(text, isError) {
    setText(ui.presetTransferFeedback, text || "");
    setClass(ui.presetTransferDialog, "Error", !!isError);
  }

  function openPresetTransferDialog() {
    presetTransferRequest += 1;
    closePicker();
    closeHeroDialog();
    closeScopeDialog();
    setText(ui.presetTransferInput, "");
    setClass(ui.presetTransferDialog, "Open", true);
    setPresetTransferFeedback("PASTE AN HPCRP1 PRESET CODE.", false);
    focus(ui.presetTransferInput);
  }

  function closePresetTransferDialog() {
    presetTransferRequest += 1;
    if (!isValid(ui.presetTransferDialog)) return;
    setClass(ui.presetTransferDialog, "Open", false);
    setClass(ui.presetTransferDialog, "Error", false);
    setText(ui.presetTransferInput, "");
    focus(ui.presetImportButton);
  }

  function importPresetTransfer(raw) {
    var before = currentView();
    var beforeRows = before && before.repository ? before.repository.allRows : [];
    var beforeUserCount = 0;
    for (var index = 0; index < beforeRows.length; index++)
      if (beforeRows[index].kind === "user") beforeUserCount += 1;
    var result = sendState({ type: "preset_import", raw: String(raw || "") });
    var rejected =
      !result || !result.outcome || result.outcome.status === "rejected";
    if (rejected) {
      setPresetTransferFeedback(
        result && result.outcome && result.outcome.code
          ? result.outcome.code
          : "INVALID HPCRP1 CODE",
        true,
      );
      return false;
    }
    var after = currentView();
    var afterRows = after && after.repository ? after.repository.allRows : [];
    var afterUserCount = 0;
    for (index = 0; index < afterRows.length; index++)
      if (afterRows[index].kind === "user") afterUserCount += 1;
    var importedCount = Math.max(0, afterUserCount - beforeUserCount);
    setText(ui.presetTransferInput, "");
    setPresetTransferFeedback(
      "IMPORTED " + String(importedCount) +
        (importedCount === 1 ? " PRESET." : " PRESETS."),
      false,
    );
    renderPresetOptions();
    syncPresetSaveForm(true);
    return true;
  }

  function confirmPresetTransferImport() {
    presetTransferRequest += 1;
    var request = presetTransferRequest;
    var transferInput = ui.presetTransferInput;
    var manual = String(
      (ui.presetTransferInput && ui.presetTransferInput.text) || "",
    ).trim();
    if (manual) {
      importPresetTransfer(manual);
      return;
    }
    var requested = false;
    try {
      requested =
        $.DispatchEvent(
          "TextEntryInsertFromClipboard",
          ui.presetTransferInput,
        ) !== false;
    } catch {}
    if (!requested) {
      setPresetTransferFeedback(
        "CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY",
        true,
      );
      return;
    }
    var inserted = String(ui.presetTransferInput.text || "").trim();
    if (inserted) {
      importPresetTransfer(inserted);
      return;
    }
    try {
      $.Schedule(0.05, function () {
        if (
          request !== presetTransferRequest ||
          transferInput !== ui.presetTransferInput ||
          !isValid(transferInput) ||
          !isValid(ui.presetTransferDialog) ||
          !ui.presetTransferDialog.BHasClass("Open")
        )
          return;
        var pasted = String(transferInput.text || "").trim();
        if (!pasted) {
          setPresetTransferFeedback(
            "CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY",
            true,
          );
          return;
        }
        importPresetTransfer(pasted);
      });
    } catch {
      setPresetTransferFeedback(
        "CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY",
        true,
      );
    }
  }
  function saveCurrentPreset() {
    if (!presetFormOpen) return;
    var name = String((ui.presetNameInput && ui.presetNameInput.text) || "").trim();
    if (!name) {
      setPresetFeedback("ENTER A PRESET NAME.", true);
      focus(ui.presetNameInput);
      return;
    }
    var editing = findPresetRecord(presetEditId);
    if (!editing || editing.kind !== "user") {
      sendState({ type: "preset_select", id: null });
      presetEditId = "";
    } else if (!selectPresetForRowAction(editing.id)) {
      setPresetFeedback("THAT PRESET NO LONGER EXISTS. NOTHING CHANGED.", true);
      return;
    }
    var result = sendState({ type: "preset_save", name: name });
    if (!result || !result.outcome || result.outcome.status === "rejected") {
      setPresetFeedback(
        editing
          ? "COULD NOT SAVE " + name.toUpperCase() + ". NOTHING CHANGED."
          : "COULD NOT CREATE " + name.toUpperCase() + ". NOTHING CHANGED.",
        true,
      );
      return;
    }
    var savedId =
      result.view && result.view.repository
        ? result.view.repository.selectedId
        : "";
    presetFormOpen = false;
    presetEditId = "";
    renderPresetOptions();
    syncPresetSaveForm(true);
    if (editing) {
      requestPresetApplication(savedId, true);
      return;
    }
    setPresetFeedback("CREATED " + name.toUpperCase() + ".", false);
  }

  function requestPresetApplication(id, savedFirst) {
    var preset = findPresetRecord(String(id || ""));
    if (!preset) {
      setPresetFeedback(
        savedFirst
          ? "PRESET SAVED, BUT IT COULD NOT BE APPLIED."
          : "THAT PRESET NO LONGER EXISTS. NOTHING CHANGED.",
        true,
      );
      return false;
    }
    var result = sendState({ type: "preset_apply", id: preset.id });
    var outcome = result && result.outcome ? result.outcome : null;
    if (!outcome || outcome.status === "rejected") {
      setPresetFeedback(
        savedFirst
          ? "PRESET SAVED, BUT IT COULD NOT BE APPLIED."
          : "COULD NOT APPLY THAT PRESET. NOTHING CHANGED.",
        true,
      );
      return false;
    }
    renderPresetOptions();
    syncControls();
    setPresetFeedback(
      (savedFirst ? "SAVED & APPLIED " : "APPLIED ") +
        presetDisplayName(preset).toUpperCase() +
        ".",
      false,
    );
    return true;
  }



  function closePrecisePipsDialog() {
    setClass(ui.precisePipsDialog, "Open", false);
    focus(ui.precisePipsToggle);
  }

  function openPrecisePipsDialog(enabled) {
    closeHeroDialog();
    setText(
      ui.precisePipsDialogTitle,
      enabled ? "ENABLE PRECISE PIPS" : "REMOVE PRECISE PIP CONFIG",
    );
    setText(
      ui.precisePipsDialogMessage,
      enabled
        ? "Copy these lines into the ConVars block in gameinfo.gi. HP Colors cannot apply or verify this game configuration."
        : "If you do not plan to use precise pips, copy these default lines into the ConVars block in gameinfo.gi, or delete the custom precise-pip entries.",
    );
    setText(
      ui.precisePipsDialogCommands,
      enabled ? PRECISE_PIPS_ENABLE_TEXT : PRECISE_PIPS_RESET_TEXT,
    );
    setText(ui.precisePipsCopyLabel, "COPY");
    setClass(ui.precisePipsDialog, "Open", true);
    focus(ui.precisePipsDialog);
  }

  function copyPrecisePipsText() {
    var text =
      state.values.precisePipsEnabled
        ? PRECISE_PIPS_ENABLE_TEXT
        : PRECISE_PIPS_RESET_TEXT;
    var copied = false;
    try {
      copied = $.DispatchEvent("CopyStringToClipboard", text) !== false;
    } catch {}
    setText(ui.precisePipsCopyLabel, copied ? "COPIED" : "COPY FAILED");
  }

  function togglePrecisePips() {
    if (syncingControls) return;
    var enabled = !state.values.precisePipsEnabled;
    sendState({ type: "setting_edit", key: "precisePipsEnabled", value: enabled });
    syncControls();
    openPrecisePipsDialog(enabled);
  }
  function setTransferFeedback(message, isError) {
    setText(ui.transferFeedback, message);
    setClass(ui.transferDialog, "Error", !!isError);
  }

  function closeTransferDialog() {
    if (!isValid(ui.transferDialog) || !ui.transferDialog.BHasClass("Open"))
      return;
    setClass(ui.transferDialog, "Open", false);
    setClass(ui.transferDialog, "Error", false);
    setText(ui.transferInput, "");
    focus(ui.transferButton);
  }

  function copyCurrentSettings() {
    var result = sendState({ type: "settings_copy" });
    var copied =
      !!result &&
      !!result.outcome &&
      result.outcome.status !== "rejected" &&
      lastClipboardCopied === true;
    setTransferFeedback(
      copied
        ? "CURRENT SETTINGS COPIED"
        : "COPY FAILED — SETTINGS CODE NOT COPIED",
      !copied,
    );
    return copied;
  }

  function openTransferDialog() {
    closePicker();
    closePrecisePipsDialog();
    closeHeroDialog();
    setText(ui.transferInput, "");
    setClass(ui.transferDialog, "Open", true);
    setTransferFeedback(
      "READY — CHOOSE COPY CURRENT OR IMPORT & APPLY",
      false,
    );
    focus(ui.transferInput);
  }

  function applyImportedText(raw, pasted) {
    var result = sendState({
      type: "settings_import",
      raw: String(raw || ""),
    });
    var outcome = result && result.outcome ? result.outcome : null;
    if (!outcome || outcome.status === "rejected") {
      setTransferFeedback(
        outcome && outcome.code ? outcome.code : "INVALID HPCR2 CODE",
        true,
      );
      return;
    }
    if (outcome.status === "noop") {
      setTransferFeedback("SETTINGS ALREADY MATCH", false);
      return;
    }
    setText(ui.transferInput, "");
    setTransferFeedback(
      pasted ? "PASTED AND APPLIED" : "IMPORTED AND APPLIED",
      false,
    );
    syncControls();
  }

  function showManualPasteFallback() {
    setTransferFeedback(
      "CLIPBOARD PASTE UNAVAILABLE — PASTE CODE MANUALLY",
      true,
    );
    focus(ui.transferInput);
  }

  function importLiveSettings() {
    var manual = String(ui.transferInput.text || "").trim();
    if (manual) {
      applyImportedText(manual, false);
      return;
    }
    var requested = false;
    try {
      requested =
        $.DispatchEvent("TextEntryInsertFromClipboard", ui.transferInput) !==
        false;
    } catch {}
    if (!requested) {
      showManualPasteFallback();
      return;
    }
    var inserted = String(ui.transferInput.text || "").trim();
    if (inserted) {
      applyImportedText(inserted, true);
      return;
    }
    try {
      $.Schedule(0.05, function () {
        var pasted = String(ui.transferInput.text || "").trim();
        if (!pasted) {
          showManualPasteFallback();
          return;
        }
        applyImportedText(pasted, true);
      });
    } catch {
      showManualPasteFallback();
    }
  }

  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    number = Math.round(number);
    return Math.max(min, Math.min(max, number));
  }

  function normalizeColor(value, fallback) {
    var raw = String(value || "").trim().toUpperCase();
    if (raw.charAt(0) !== "#") raw = "#" + raw;
    return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
  }

  function hexToHsl(hex) {
    var value = parseInt(normalizeColor(hex, "#FFFFFF").slice(1), 16);
    var red = ((value >> 16) & 255) / 255;
    var green = ((value >> 8) & 255) / 255;
    var blue = (value & 255) / 255;
    var max = Math.max(red, green, blue);
    var min = Math.min(red, green, blue);
    var delta = max - min;
    var lightness = (max + min) / 2;
    var hue = 0;
    var saturation = 0;
    if (delta) {
      saturation =
        delta / Math.max(0.0001, 1 - Math.abs(2 * lightness - 1));
      if (max === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (max === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
      if (hue < 0) hue += 360;
    }
    return {
      hue: Math.round(hue) % 360,
      saturation: Math.round(saturation * 100),
      lightness: Math.round(lightness * 100),
    };
  }

  function hslToHex(hue, saturation, lightness) {
    var h = ((Number(hue) % 360) + 360) % 360;
    var s = Math.max(0, Math.min(100, Number(saturation))) / 100;
    var l = Math.max(0, Math.min(100, Number(lightness))) / 100;
    var chroma = (1 - Math.abs(2 * l - 1)) * s;
    var section = h / 60;
    var second = chroma * (1 - Math.abs((section % 2) - 1));
    var red = 0;
    var green = 0;
    var blue = 0;
    if (section < 1) {
      red = chroma;
      green = second;
    } else if (section < 2) {
      red = second;
      green = chroma;
    } else if (section < 3) {
      green = chroma;
      blue = second;
    } else if (section < 4) {
      green = second;
      blue = chroma;
    } else if (section < 5) {
      red = second;
      blue = chroma;
    } else {
      red = chroma;
      blue = second;
    }
    var match = l - chroma / 2;
    var packed =
      (Math.round((red + match) * 255) << 16) |
      (Math.round((green + match) * 255) << 8) |
      Math.round((blue + match) * 255);
    return "#" + ((1 << 24) | packed).toString(16).slice(1).toUpperCase();
  }


  function presetDisplayName(preset) {
    return preset ? String(preset.name || "") : "";
  }



  function presetRecords() {
    var view = currentView();
    return view && view.repository && view.repository.allRows
      ? view.repository.allRows
      : [];
  }

  function findPresetRecord(id) {
    var records = presetRecords();
    for (var index = 0; index < records.length; index++)
      if (records[index].id === id) return records[index];
    return null;
  }


  function serializeChange(settingId, raw, revision, values) {
    var effectiveValues =
      values ||
      (currentView() && currentView().effectiveValues
        ? currentView().effectiveValues
        : {});
    return JSON.stringify({
      magic_word: CONFIG_MAGIC,
      version: 1,
      revision: Number(revision) || 0,
      setting_id: settingId || "*",
      value:
        settingId && settingId !== "*"
          ? effectiveValues[settingId]
          : null,
      values_raw: raw,
    });
  }

  function cacheReplayPayload(raw, replayPayload) {
    if (!raw) return;
    serializedSnapshotRaw = raw;
    serializedReplayPayload =
      replayPayload ||
      serializeChange(
        "*",
        raw,
        currentView() ? currentView().effectiveRevision : 0,
      );
  }


  function readRootAttribute(name) {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.GetAttributeString) return "";
    try {
      return String(ui.absoluteRoot.GetAttributeString(name, "") || "");
    } catch {
      return "";
    }
  }
  function readPanelAttribute(panel, name) {
    if (!isValid(panel) || !panel.GetAttributeString) return "";
    try {
      return String(panel.GetAttributeString(name, "") || "");
    } catch {
      return "";
    }
  }

  function logPresetStoreTransition() {
    if (presetStoreBootMessageShown) return;
    presetStoreBootMessageShown = true;
    try {
      $.Msg(
        "[HP Colors Rewrite] preset store unavailable; using session/default state",
      );
    } catch {}
  }

  function decodePresetStoreText(encoded) {
    var text = String(encoded || "");
    if (!text) return "";
    if (
      text.length > PRESET_STORE_MAX_HEX_LENGTH ||
      text.length % 4 !== 0 ||
      !/^(?:[0-9A-F]{4})+$/.test(text)
    )
      return null;
    var codeUnits = [];
    for (var index = 0; index < text.length; index += 4) {
      var codeUnit = parseInt(text.slice(index, index + 4), 16);
      if (!isFinite(codeUnit)) return null;
      codeUnits.push(String.fromCharCode(codeUnit));
    }
    return codeUnits.join("");
  }

  function readBuilderPresetRaw() {
    var store = ui.presetStorePanel;
    if (!isValid(store)) return "";
    if (
      readPanelAttribute(store, PRESET_STORE_CONTRACT_ATTR) !==
        PRESET_STORE_CONTRACT ||
      readPanelAttribute(store, PRESET_STORE_VERSION_ATTR) !==
        PRESET_STORE_VERSION
    ) {
      logPresetStoreTransition();
      return "";
    }
    var label = null;
    try {
      label =
        store.FindChildTraverse && store.FindChildTraverse(PRESET_LABEL_ID);
    } catch {}
    if (!isValid(label) || !panelHasClass(label, PRESET_ENTRY_CLASS)) {
      if (isValid(label)) logPresetStoreTransition();
      return "";
    }
    var decoded = decodePresetStoreText(readPanelText(label));
    if (decoded === null) {
      logPresetStoreTransition();
      return "";
    }
    return decoded;
  }

  function writeMenuState(raw) {
    if (!raw || !isValid(ui.absoluteRoot) || !ui.absoluteRoot.SetAttributeString)
      return false;
    try {
      if (
        !ui.absoluteRoot.GetAttributeString ||
        ui.absoluteRoot.GetAttributeString(MENU_STATE_ATTR, "") !== raw
      )
        ui.absoluteRoot.SetAttributeString(MENU_STATE_ATTR, raw);
      return true;
    } catch {
      return false;
    }
  }

  function writeRootSnapshot(raw) {
    if (!isValid(ui.absoluteRoot) || !ui.absoluteRoot.SetAttributeString) return false;
    try {
      if (
        !ui.absoluteRoot.GetAttributeString ||
        ui.absoluteRoot.GetAttributeString(CONFIG_ATTR, "") !== raw
      )
        ui.absoluteRoot.SetAttributeString(CONFIG_ATTR, raw);
      return true;
    } catch {
      return false;
    }
  }

  function dispatchChange(settingId, raw, serialized) {
    try {
      $.DispatchEvent(
        EVENT_CHANNEL,
        serialized || serializeChange(settingId, raw),
      );
    } catch (error) {
      $.Msg("[HP Colors Rewrite] settings dispatch failed: " + String(error));
    }
  }

  function replayDelay() {
    if (replayDispatches < REPLAY_HOT_COUNT) return REPLAY_HOT_SEC;
    if (replayDispatches < REPLAY_WARM_COUNT) return REPLAY_WARM_SEC;
    return REPLAY_IDLE_SEC;
  }

  function scheduleSnapshotReplay(generation) {
    try {
      $.Schedule(replayDelay(), function () {
        var view = currentView();
        if (
          !replayRunning ||
          generation !== replayGeneration ||
          !view ||
          !view.effectiveValues ||
          !view.effectiveValues.enabled ||
          !isValid(ui.absoluteRoot)
        )
          return;
        replayDispatches += 1;
        dispatchChange(
          "*",
          serializedSnapshotRaw,
          serializedReplayPayload,
        );
        scheduleSnapshotReplay(generation);
      });
    } catch {
      replayRunning = false;
    }
  }

  function refreshSnapshotReplay() {
    var view = currentView();
    if (!view || !view.effectiveValues || !view.effectiveValues.enabled) {
      replayGeneration += 1;
      replayRunning = false;
      replayDispatches = 0;
      return;
    }
    if (!serializedSnapshotRaw || !serializedReplayPayload) return;
    replayDispatches = 0;
    if (replayRunning) return;
    replayRunning = true;
    replayGeneration += 1;
    scheduleSnapshotReplay(replayGeneration);
  }

  function showResetFeedback(text) {
    resetFeedbackGeneration += 1;
    var generation = resetFeedbackGeneration;
    setText(ui.liveStatus, text || "LIVE");
    try {
      $.Schedule(1.25, function () {
        if (generation === resetFeedbackGeneration)
          setText(ui.liveStatus, "LIVE");
      });
    } catch {}
  }
  function closeResetDialog(restoreFocus) {
    var view = currentView();
    var confirmation =
      view && view.transactions ? view.transactions.confirmation : null;
    if (confirmation && confirmation.kind === "reset")
      sendState({ type: "reset_cancel", token: confirmation.token });
    resetKeys = null;
    setClass(ui.resetDialog, "Open", false);
    if (restoreFocus !== false && state.open) focus(ui.resetButton);
  }

  function requestSectionReset() {
    var category = CATEGORY_DEFS[state.categoryIndex];
    var tab = category && category.tabs[state.tabIndex];
    if (!tab || !tab.keys.length) {
      showResetFeedback("NO SETTINGS TO RESET");
      return;
    }
    var values = state.values;
    var conditions = state.conditions;
    var changedCount = 0;
    for (var index = 0; index < tab.keys.length; index++) {
      var key = tab.keys[index];
      if (
        values[key] !== DEFAULTS[key] ||
        Object.prototype.hasOwnProperty.call(conditions, key)
      )
        changedCount += 1;
    }
    if (!changedCount) {
      showResetFeedback("SECTION ALREADY DEFAULT");
      return;
    }
    var result = sendState({ type: "reset_request", keys: tab.keys.slice(0) });
    var confirmation =
      result && result.view && result.view.transactions
        ? result.view.transactions.confirmation
        : null;
    if (!confirmation) return;
    resetKeys = tab.keys.slice(0);
    setText(ui.resetDialogTitle, "RESET " + tab.name);
    setText(
      ui.resetDialogMessage,
      "Reset " +
        String(changedCount) +
        (changedCount === 1 ? " setting" : " settings") +
        " in " +
        category.name +
        " / " +
        tab.name +
        " to shipped defaults? This can be undone.",
    );
    setClass(ui.resetDialog, "Open", true);
    focus(ui.resetCancelButton);
  }

  function confirmSectionReset() {
    if (!resetKeys) {
      closeResetDialog(true);
      return;
    }
    var view = currentView();
    var confirmation =
      view && view.transactions ? view.transactions.confirmation : null;
    if (!confirmation || confirmation.kind !== "reset") {
      closeResetDialog(true);
      return;
    }
    var result = sendState({
      type: "reset_confirm",
      token: confirmation.token,
    });
    closeResetDialog(true);
    syncControls();
    showResetFeedback(
      result && result.outcome && result.outcome.status !== "rejected"
        ? "SECTION RESET · UNDO AVAILABLE"
        : "SECTION ALREADY DEFAULT",
    );
  }

  function bindCategory(index) {
    setPanelEvent(ui.categoryButtons[index], "onactivate", function () {
      selectCategory(index);
    });
  }

  function bindTab(index) {
    setPanelEvent(ui.tabButtons[index], "onactivate", function () {
      selectTab(index);
    });
  }

  function registerConditionControl(panel, key, min, max, option) {
    if (
      key === "precisePipsEnabled" ||
      !Object.prototype.hasOwnProperty.call(DEFAULTS, key) ||
      !isValid(panel)
    )
      return;
    var row = panel;
    while (isValid(row) && !panelHasClass(row, "HPColorsSettingRow")) {
      try {
        row = row.GetParent();
      } catch {
        row = null;
      }
    }
    if (!isValid(row)) return;

    var control = conditionControls[key];
    if (!control) {
      var defaultValue = DEFAULTS[key];
      var defaultIsString = false;
      try {
        defaultIsString = defaultValue === String(defaultValue);
      } catch {}
      var type =
        defaultValue === true || defaultValue === false
          ? "boolean"
          : Number.isFinite(defaultValue)
            ? "number"
            : defaultIsString
              ? "enum"
              : "unknown";
      if (COLOR_KEYS[key]) type = "color";
      if (option !== undefined) type = "enum";
      var titles = findChildrenWithClass(row, "HPColorsSettingTitle");
      control = {
        title: titles.length ? readPanelText(titles[0]) : key,
        type: type,
        min: min,
        max: max,
        options: option === undefined ? [] : [option],
        indicators: [],
      };
      conditionControls[key] = control;
    } else if (option !== undefined && control.options.indexOf(option) < 0) {
      control.options.push(option);
    }

    var indicatorIndex;
    for (indicatorIndex = 0; indicatorIndex < control.indicators.length; indicatorIndex++) {
      if (control.indicators[indicatorIndex].row === row) return;
    }
    var suffix = control.indicators.length
      ? "_" + String(control.indicators.length + 1)
      : "";
    var button = $.CreatePanel(
      "Button",
      row,
      "HPColorsCondition_" + key + suffix,
    );
    var label = $.CreatePanel("Label", button, "");
    if (!isValid(button) || !isValid(label)) return;
    button.AddClass("HPColorsConditionIndicator");
    label.text = "\u25c7";
    control.indicators.push({ row: row, button: button, label: label });
    setPanelEvent(button, "onactivate", function () {
      openConditionEditor(key, button);
    });
  }

  function bindToggle(panelId, key) {
    var panel = find(panelId);
    registerConditionControl(panel, key);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, !state.values[key], true);
    });
  }

  function bindMode(panelId, key, mode) {
    var panel = find(panelId);
    registerConditionControl(panel, key, undefined, undefined, mode);
    setPanelEvent(panel, "onactivate", function () {
      if (syncingControls) return;
      commitValue(key, mode, true);
    });
  }

  function bindSlider(sliderId, entryId, key, min, max) {
    var slider = find(sliderId);
    var entry = find(entryId);
    if (!isValid(slider) || !isValid(entry)) return;
    registerConditionControl(slider, key, min, max);
    var gestureBefore = "";

    try {
      slider.min = min;
      slider.max = max;
      slider.increment = 1;
    } catch {}

    setPanelEvent(slider, "onmousedown", function () {
      gestureBefore = key;
      sendState({ type: "gesture_begin", key: key, value: slider.value });
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls) return;
      if (gestureBefore)
        sendState({ type: "gesture_update", key: key, value: slider.value });
      else commitValue(key, slider.value);
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (gestureBefore)
        sendState({ type: "gesture_end", key: key, value: slider.value });
      gestureBefore = "";
      syncControls();
    });

    function commitEntry() {
      if (syncingControls) return;
      commitValue(key, entry.text, true);
      try {
        $.DispatchEvent("DropInputFocus", entry);
      } catch {}
    }
    setPanelEvent(entry, "ontextentrysubmit", commitEntry);
    setPanelEvent(entry, "onblur", commitEntry);
    setPanelEvent(entry, "oncancel", syncControls);
  }

  function bindColor(swatchId, entryId, key) {
    var swatch = find(swatchId);
    var entry = find(entryId);
    if (!isValid(swatch) || !isValid(entry)) return;
    registerConditionControl(swatch, key);
    setPanelEvent(swatch, "onactivate", function () {
      openPicker(key, swatch);
    });
    function commitEntry() {
      if (syncingControls) return;
      commitValue(key, entry.text, true);
      try {
        $.DispatchEvent("DropInputFocus", entry);
      } catch {}
    }
    setPanelEvent(entry, "ontextentrysubmit", commitEntry);
    setPanelEvent(entry, "onblur", commitEntry);
    setPanelEvent(entry, "oncancel", syncControls);
  }

  function conditionValueMatchesSetting(key, value) {
    return !!key && value === state.values[key];
  }

  function conditionEditorStatus() {
    if (
      conditionValueMatchesSetting(
        conditionDraft.key,
        conditionDraft.value,
      )
    )
      return {
        text: "NO OVERRIDE \u00b7 VALUE OR SELECTION MATCHES CURRENT SETTING",
        matched: false,
        unavailable: false,
      };
    var tier = ability.observedTiers[conditionDraft.slot - 1];
    if (tier < 0)
      return {
        text:
          "SLOT " +
          String(conditionDraft.slot) +
          " UNAVAILABLE \u00b7 BASE VALUE WILL BE USED",
        matched: false,
        unavailable: true,
      };
    if (tier >= conditionDraft.minTier)
      return {
        text:
          "SLOT " +
          String(conditionDraft.slot) +
          " TIER " +
          String(tier) +
          " \u00b7 CONDITION MATCHED",
        matched: true,
        unavailable: false,
      };
    return {
      text:
        "SLOT " +
        String(conditionDraft.slot) +
        " TIER " +
        String(tier) +
        " \u00b7 NEEDS TIER " +
        String(conditionDraft.minTier) +
        "+",
      matched: false,
      unavailable: false,
    };
  }

  function renderConditionEditor() {
    if (!conditionDraft.key) return;
    var control = conditionControls[conditionDraft.key];
    if (!control) return;
    setText(
      ui.conditionTitle,
      (control.title || conditionDraft.key).toUpperCase(),
    );
    for (var slotIndex = 0; slotIndex < ui.conditionSlotButtons.length; slotIndex++)
      syncConditionAbilityCard(slotIndex);
    setClass(ui.conditionBooleanRow, "Active", control.type === "boolean");
    setClass(ui.conditionEnumRow, "Active", control.type === "enum");
    setClass(ui.conditionNumberRow, "Active", control.type === "number");
    setClass(ui.conditionColorRow, "Active", control.type === "color");
    if (control.type === "boolean") {
      setClass(
        ui.conditionBooleanFalse,
        "Selected",
        conditionDraft.value === false,
      );
      setClass(
        ui.conditionBooleanTrue,
        "Selected",
        conditionDraft.value === true,
      );
    } else if (control.type === "enum") {
      if (isValid(ui.conditionEnumOptions))
        ui.conditionEnumOptions.RemoveAndDeleteChildren();
      for (var optionIndex = 0; optionIndex < control.options.length; optionIndex++) {
        (function (option) {
          var button = $.CreatePanel(
            "Button",
            ui.conditionEnumOptions,
            "HPColorsConditionOption_" + String(option),
          );
          var label = $.CreatePanel("Label", button, "");
          button.AddClass("HPColorsConditionChoice");
          label.text = String(option).toUpperCase();
          setClass(button, "Selected", conditionDraft.value === option);
          setPanelEvent(button, "onactivate", function () {
            conditionDraft.value = option;
            renderConditionEditor();
          });
        })(control.options[optionIndex]);
      }
    } else if (control.type === "number") {
      if (isValid(ui.conditionNumberSlider)) {
        ui.conditionNumberSlider.min = control.min;
        ui.conditionNumberSlider.max = control.max;
        try {
          if (isCallable(ui.conditionNumberSlider.SetValueNoEvents))
            ui.conditionNumberSlider.SetValueNoEvents(conditionDraft.value);
          else ui.conditionNumberSlider.value = conditionDraft.value;
        } catch {}
      }
      setText(ui.conditionNumberEntry, String(conditionDraft.value));
    } else if (control.type === "color") {
      setText(ui.conditionColorEntry, conditionDraft.value);
      try {
        ui.conditionColorSwatch.style.backgroundColor = conditionDraft.value;
      } catch {}
    }
    var status = conditionEditorStatus();
    setText(ui.conditionStatus, status.text);
    setClass(ui.conditionDialog, "Matched", status.matched);
    setClass(ui.conditionDialog, "Unavailable", status.unavailable);
    setClass(
      ui.conditionApplyButton,
      "Disabled",
      conditionValueMatchesSetting(
        conditionDraft.key,
        conditionDraft.value,
      ),
    );
    setClass(
      ui.conditionRemoveButton,
      "Disabled",
      !Object.prototype.hasOwnProperty.call(
        state.conditions,
        conditionDraft.key,
      ),
    );
  }

  function syncConditionIndicators() {
    var activeConditions = state.conditions;
    for (var key in conditionControls) {
      if (!Object.prototype.hasOwnProperty.call(conditionControls, key))
        continue;
      var control = conditionControls[key];
      var activeRule = activeConditions[key];
      var meaningful =
        !!activeRule &&
        !conditionValueMatchesSetting(key, activeRule.value);
      var tier = meaningful
        ? ability.observedTiers[activeRule.slot - 1]
        : -1;
      var matched = meaningful && tier >= activeRule.minTier;
      var indicators = control.indicators;
      for (var indicatorIndex = 0; indicatorIndex < indicators.length; indicatorIndex++) {
        var indicator = indicators[indicatorIndex];
        setClass(indicator.button, "Configured", meaningful);
        setClass(indicator.button, "Matched", matched);
        setClass(
          indicator.button,
          "Unavailable",
          meaningful && tier < 0,
        );
        setText(
          indicator.label,
          meaningful ? "\u25c6" : "\u25c7",
        );
      }
    }
    if (
      conditionDraft.key &&
      isValid(ui.conditionDialog) &&
      ui.conditionDialog.BHasClass("Open")
    )
      renderConditionEditor();
  }

  function closeConditionEditor() {
    if (picker.condition) closePicker();
    var returnPanel = conditionDraft.returnPanel;
    conditionDraft.key = "";
    conditionDraft.returnPanel = null;
    setClass(ui.conditionDialog, "Open", false);
    setClass(ui.conditionDialog, "Matched", false);
    setClass(ui.conditionDialog, "Unavailable", false);
    if (state.open) focus(returnPanel);
  }

  function openConditionEditor(key, returnPanel) {
    if (!conditionControls[key]) return;
    closeResetDialog(false);
    closePresetTransferDialog();
    closeTransferDialog();
    closeHeroDialog();
    closeScopeDialog();
    closePicker();
    var rule = state.conditions[key];
    conditionDraft.key = key;
    conditionDraft.slot = rule ? rule.slot : 1;
    conditionDraft.minTier = rule ? rule.minTier : 1;
    conditionDraft.value = rule ? rule.value : state.values[key];
    conditionDraft.returnPanel = returnPanel;
    setClass(ui.conditionDialog, "Open", true);
    sampleAbilityTiers();
    renderConditionEditor();
    focus(ui.conditionCancelButton);
  }

  function setConditionSlot(slot) {
    if (!conditionDraft.key) return;
    if (conditionDraft.slot === slot)
      conditionDraft.minTier = conditionDraft.minTier >= 3
        ? 1
        : conditionDraft.minTier + 1;
    else {
      conditionDraft.slot = slot;
      conditionDraft.minTier = 1;
    }
    sampleAbilityTiers();
    renderConditionEditor();
  }

  function pickConditionColor() {
    var control = conditionControls[conditionDraft.key];
    if (!control || control.type !== "color") return;
    closeHeroDialog();
    picker.key = conditionDraft.key;
    picker.returnPanel = ui.conditionColorSwatch;
    picker.condition = true;
    var hsl = hexToHsl(conditionDraft.value);
    picker.hue = hsl.hue;
    picker.saturation = hsl.saturation;
    picker.lightness = hsl.lightness;
    setClass(ui.pickerRoot, "Open", true);
    syncPicker();
    focus(ui.pickerHueSlider);
  }

  function applyConditionDraft() {
    if (!conditionDraft.key) return;
    if (
      conditionValueMatchesSetting(
        conditionDraft.key,
        conditionDraft.value,
      )
    )
      return;
    var result = sendState({
      type: "condition_set",
      key: conditionDraft.key,
      slot: conditionDraft.slot,
      minTier: conditionDraft.minTier,
      value: conditionDraft.value,
    });
    if (!result || !result.outcome || result.outcome.status === "rejected") {
      renderConditionEditor();
      return;
    }
    closeConditionEditor();
    syncControls();
  }

  function removeConditionDraft() {
    if (!conditionDraft.key) return;
    sendState({ type: "condition_remove", key: conditionDraft.key });
    closeConditionEditor();
    syncControls();
  }

  function bindConditionEditorControls() {
    for (var slotIndex = 0; slotIndex < ui.conditionSlotButtons.length; slotIndex++) {
      (function (slot) {
        setPanelEvent(ui.conditionSlotButtons[slot - 1], "onactivate", function () {
          setConditionSlot(slot);
        });
      })(slotIndex + 1);
    }
    setPanelEvent(ui.conditionBooleanFalse, "onactivate", function () {
      conditionDraft.value = false;
      renderConditionEditor();
    });
    setPanelEvent(ui.conditionBooleanTrue, "onactivate", function () {
      conditionDraft.value = true;
      renderConditionEditor();
    });
    setPanelEvent(ui.conditionNumberSlider, "onvaluechanged", function () {
      if (!conditionDraft.key) return;
      conditionDraft.value = Math.round(Number(ui.conditionNumberSlider.value));
      renderConditionEditor();
    });
    function commitNumber() {
      var control = conditionControls[conditionDraft.key];
      if (!control || control.type !== "number") return;
      conditionDraft.value = clampNumber(
        ui.conditionNumberEntry.text,
        control.min,
        control.max,
        state.values[conditionDraft.key],
      );
      renderConditionEditor();
    }
    setPanelEvent(ui.conditionNumberEntry, "ontextentrysubmit", commitNumber);
    setPanelEvent(ui.conditionNumberEntry, "onblur", commitNumber);
    function commitColor() {
      var control = conditionControls[conditionDraft.key];
      if (!control || control.type !== "color") return;
      conditionDraft.value = normalizeColor(
        ui.conditionColorEntry.text,
        String(conditionDraft.value || state.values[conditionDraft.key]),
      );
      renderConditionEditor();
    }
    setPanelEvent(
      ui.conditionColorSwatch,
      "onactivate",
      pickConditionColor,
    );
    setPanelEvent(ui.conditionColorEntry, "ontextentrysubmit", commitColor);
    setPanelEvent(ui.conditionColorEntry, "onblur", commitColor);
    setPanelEvent(ui.conditionRemoveButton, "onactivate", removeConditionDraft);
    setPanelEvent(ui.conditionCancelButton, "onactivate", closeConditionEditor);
    setPanelEvent(ui.conditionApplyButton, "onactivate", applyConditionDraft);
    setPanelEvent(ui.conditionDialog, "oncancel", closeConditionEditor);
  }

  function setToggle(panelId, value) {
    setClass(find(panelId), "Checked", !!value);
  }

  function setSlider(sliderId, entryId, value) {
    var slider = find(sliderId);
    var entry = find(entryId);
    if (isValid(slider)) {
      try {
        if (isCallable(slider.SetValueNoEvents))
          slider.SetValueNoEvents(value);
        else slider.value = value;
      } catch {}
    }
    setText(entry, String(value));
  }

  function setColor(swatchId, entryId, value) {
    var swatch = find(swatchId);
    if (isValid(swatch) && swatch.style) {
      try {
        if (swatch.style.backgroundColor !== value)
          swatch.style.backgroundColor = value;
      } catch {}
    }
    setText(find(entryId), value);
  }

  function setPickerSliderValue(slider, value) {
    if (!isValid(slider)) return;
    try {
      if (isCallable(slider.SetValueNoEvents))
        slider.SetValueNoEvents(value);
      else slider.value = value;
    } catch {}
  }

  function setPickerTrack(slider, gradient) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var track = slider.FindChildTraverse("SliderTrack");
      if (isValid(track) && track.style.backgroundColor !== gradient)
        track.style.backgroundColor = gradient;
    } catch {}
  }

  function setPickerThumb(slider, color, lightness) {
    if (!isValid(slider) || !slider.FindChildTraverse) return;
    try {
      var thumb = slider.FindChildTraverse("SliderThumb");
      if (!isValid(thumb) || !thumb.style) return;
      if (thumb.style.backgroundColor !== color)
        thumb.style.backgroundColor = color;
      var border = lightness < 35 ? "#FFEFD7" : "#10130D";
      if (thumb.style.borderColor !== border)
        thumb.style.borderColor = border;
    } catch {}
  }

  function syncPicker() {
    if (!picker.key || !isValid(ui.pickerRoot)) return;
    var color = hslToHex(
      picker.hue,
      picker.saturation,
      picker.lightness,
    );
    setText(ui.pickerTitle, COLOR_TITLES[picker.key] || "COLOR");
    setText(ui.pickerHex, color);
    setText(ui.pickerHueValue, picker.hue + "°");
    setText(ui.pickerSaturationValue, picker.saturation + "%");
    setText(ui.pickerLightnessValue, picker.lightness + "%");
    if (isValid(ui.pickerPreview) && ui.pickerPreview.style)
      ui.pickerPreview.style.backgroundColor = color;

    setPickerSliderValue(ui.pickerHueSlider, picker.hue);
    setPickerSliderValue(ui.pickerSaturationSlider, picker.saturation);
    setPickerSliderValue(ui.pickerLumenSlider, picker.lightness);

    setPickerThumb(ui.pickerHueSlider, color, picker.lightness);
    setPickerThumb(ui.pickerSaturationSlider, color, picker.lightness);
    setPickerThumb(ui.pickerLumenSlider, color, picker.lightness);

    setPickerTrack(
      ui.pickerHueSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(#FF0000), color-stop(0.1667, #FFFF00), color-stop(0.3333, #00FF00), color-stop(0.5, #00FFFF), color-stop(0.6667, #0000FF), color-stop(0.8333, #FF00FF), to(#FF0000))",
    );
    setPickerTrack(
      ui.pickerSaturationSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(" +
        hslToHex(picker.hue, 0, picker.lightness) +
        "), to(" +
        hslToHex(picker.hue, 100, picker.lightness) +
        "))",
    );
    setPickerTrack(
      ui.pickerLumenSlider,
      "gradient(linear, 0% 0%, 100% 0%, from(#000000), color-stop(0.5, " +
        hslToHex(picker.hue, picker.saturation, 50) +
        "), to(#FFFFFF))",
    );
  }

  function bindPickerSlider(slider, component) {
    if (!isValid(slider)) return;
    function pickerColor() {
      return hslToHex(
        picker.hue,
        picker.saturation,
        picker.lightness,
      );
    }
    try {
      slider.increment = 1;
    } catch {}
    setPanelEvent(slider, "onmousedown", function () {
      if (picker.condition || !picker.key) return;
      if (pickerGestureActive)
        sendState({ type: "gesture_cancel", key: picker.key });
      var result = sendState({
        type: "gesture_begin",
        key: picker.key,
        value: pickerColor(),
      });
      pickerGestureActive =
        !!result &&
        !!result.outcome &&
        result.outcome.status !== "rejected";
    });
    setPanelEvent(slider, "onvaluechanged", function () {
      if (syncingControls || !picker.key) return;
      var max = component === "hue" ? 359 : 100;
      picker[component] = clampNumber(
        slider.value,
        0,
        max,
        picker[component],
      );
      var color = pickerColor();
      if (picker.condition) {
        conditionDraft.value = color;
        syncPicker();
        renderConditionEditor();
        return;
      }
      if (pickerGestureActive) {
        sendState({ type: "gesture_update", key: picker.key, value: color });
        syncPicker();
      } else {
        commitValue(picker.key, color);
      }
    });
    setPanelEvent(slider, "onmouseup", function () {
      if (picker.condition) {
        renderConditionEditor();
        return;
      }
      if (pickerGestureActive)
        sendState({
          type: "gesture_end",
          key: picker.key,
          value: pickerColor(),
        });
      pickerGestureActive = false;
      syncControls();
    });
  }

  function closePicker() {
    if (!picker.key) return;
    var wasCondition = picker.condition;
    if (pickerGestureActive) {
      sendState({ type: "gesture_cancel", key: picker.key });
      pickerGestureActive = false;
    }
    picker.key = "";
    picker.condition = false;
    setClass(ui.pickerRoot, "Open", false);
    focus(picker.returnPanel);
    if (wasCondition && conditionDraft.key) renderConditionEditor();
    picker.returnPanel = null;
  }

  function openPicker(key, returnPanel) {
    if (!COLOR_KEYS[key]) return;
    closeHeroDialog();
    picker.key = key;
    picker.condition = false;
    picker.returnPanel = returnPanel;
    var hsl = hexToHsl(state.values[key]);
    picker.hue = hsl.hue;
    picker.saturation = hsl.saturation;
    picker.lightness = hsl.lightness;
    setClass(ui.pickerRoot, "Open", true);
    syncPicker();
    focus(ui.pickerHueSlider);
  }

  function syncControls() {
    syncingControls = true;
    setToggle("HPColorsMasterToggle", state.values.enabled);
    setToggle("HPColorsEnemyToggle", state.values.enemyEnabled);
    setToggle("HPColorsEnemyVisibleToggle", state.values.enemyVisible);
    setToggle("HPColorsAllyToggle", state.values.allyEnabled);
    setToggle("HPColorsAllyVisibleToggle", state.values.allyVisible);
    setToggle("HPColorsEnemyTeamHighToggle", state.values.enemyTeamHigh);
    setToggle("HPColorsExcludeBuildingsToggle", state.values.excludeBuildings);
    setToggle("HPColorsExcludeBossesToggle", state.values.excludeBosses);
    setToggle("HPColorsExcludeGhoulsToggle", state.values.excludeGhouls);
    setToggle("HPColorsGhoulOpacityToggle", state.values.ghoulOpacityEnabled);
    var ghoulOpacityActive = state.values.ghoulOpacityEnabled;
    setClass(ui.ghoulOpacityRow, "Disabled", !ghoulOpacityActive);
    setEnabled(ui.ghoulOpacitySlider, ghoulOpacityActive);
    setEnabled(ui.ghoulOpacityEntry, ghoulOpacityActive);
    setToggle("HPColorsReadoutToggle", state.values.readoutVisible);
    setToggle("HPColorsPipsVisibleToggle", state.values.pipsVisible);
    setToggle("HPColorsPrecisePipsToggle", state.values.precisePipsEnabled);
    setToggle("HPColorsLevelsVisibleToggle", state.values.levelsVisible);
    setClass(
      ui.enemyKillMarkerToggle,
      "Checked",
      state.values.enemyKillMarkerEnabled,
    );
    var enemyKillMarkerActive = state.values.enemyKillMarkerEnabled;
    setClass(
      ui.enemyKillMarkerThresholdRow,
      "Disabled",
      !enemyKillMarkerActive,
    );
    setClass(
      ui.enemyKillMarkerWidthRow,
      "Disabled",
      !enemyKillMarkerActive,
    );
    setClass(
      ui.enemyKillMarkerColorRow,
      "Disabled",
      !enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerThresholdSlider,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerThresholdEntry,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerWidthSlider,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerWidthEntry,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerColorSwatch,
      enemyKillMarkerActive,
    );
    setEnabled(
      ui.enemyKillMarkerColorEntry,
      enemyKillMarkerActive,
    );


    setToggle("HPColorsEnemyPulseToggle", state.values.enemyPulseEnabled);
    setToggle(
      "HPColorsEnemyPulseColorToggle",
      state.values.enemyPulseColorEnabled,
    );
    setToggle(
      "HPColorsEnemyPulseHideBarToggle",
      state.values.enemyPulseHideBar,
    );
    setToggle(
      "HPColorsEnemyPulseReadoutToggle",
      state.values.enemyPulseReadout,
    );
    setToggle(
      "HPColorsEnemyPulseReadoutModifiersToggle",
      state.values.enemyPulseReadoutModifiers,
    );
    setToggle("HPColorsAllyPulseToggle", state.values.allyPulseEnabled);
    setToggle(
      "HPColorsAllyPulseColorToggle",
      state.values.allyPulseColorEnabled,
    );
    setClass(
      find("HPColorsEnemyPulseIntensitySubtle"),
      "Selected",
      state.values.enemyPulseIntensity === 0,
    );
    setClass(
      find("HPColorsEnemyPulseIntensityMedium"),
      "Selected",
      state.values.enemyPulseIntensity === 1,
    );
    setClass(
      find("HPColorsEnemyPulseIntensityIntense"),
      "Selected",
      state.values.enemyPulseIntensity === 2,
    );
    setClass(
      find("HPColorsAllyPulseIntensitySubtle"),
      "Selected",
      state.values.allyPulseIntensity === 0,
    );
    setClass(
      find("HPColorsAllyPulseIntensityMedium"),
      "Selected",
      state.values.allyPulseIntensity === 1,
    );
    setClass(
      find("HPColorsAllyPulseIntensityIntense"),
      "Selected",
      state.values.allyPulseIntensity === 2,
    );
    setClass(
      find("HPColorsEnemyPulseColorModeFixed"),
      "Selected",
      state.values.enemyPulseColorMode === "fixed",
    );
    setClass(
      find("HPColorsEnemyPulseColorModeGradient"),
      "Selected",
      state.values.enemyPulseColorMode === "gradient",
    );
    var enemyPulseActive = state.values.enemyPulseEnabled;
    var enemyPulseColorActive = enemyPulseActive && state.values.enemyPulseColorEnabled;
    setClass(
      find("HPColorsEnemyPulseColorModeRow"),
      "Disabled",
      !enemyPulseColorActive,
    );
    setClass(
      find("HPColorsEnemyPulseColorRow"),
      "Active",
      enemyPulseColorActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseColorModeFixed"),
      enemyPulseColorActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseColorModeGradient"),
      enemyPulseColorActive,
    );
    var enemyPulseReadoutModifiersActive =
      enemyPulseActive && state.values.enemyPulseReadoutModifiers;
    setClass(
      find("HPColorsEnemyPulseReadoutSizeRow"),
      "Disabled",
      !enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutSizeSlider"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutSizeEntry"),
      enemyPulseReadoutModifiersActive,
    );
    setClass(
      find("HPColorsEnemyPulseReadoutOffsetXRow"),
      "Disabled",
      !enemyPulseReadoutModifiersActive,
    );
    setClass(
      find("HPColorsEnemyPulseReadoutOffsetYRow"),
      "Disabled",
      !enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetXSlider"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetXEntry"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetYSlider"),
      enemyPulseReadoutModifiersActive,
    );
    setEnabled(
      find("HPColorsEnemyPulseReadoutOffsetYEntry"),
      enemyPulseReadoutModifiersActive,
    );
    var allyPulseColorActive =
      state.values.allyPulseEnabled && state.values.allyPulseColorEnabled;
    setClass(
      find("HPColorsAllyPulseColorRow"),
      "Active",
      allyPulseColorActive,
    );
    setClass(
      find("HPColorsEnemyModeFixed"),
      "Selected",
      state.values.enemyMode === "fixed",
    );
    setClass(
      find("HPColorsEnemyModeGradient"),
      "Selected",
      state.values.enemyMode === "gradient",
    );
    setClass(
      find("HPColorsAllyModeFixed"),
      "Selected",
      state.values.allyMode === "fixed",
    );
    setClass(
      find("HPColorsAllyModeGradient"),
      "Selected",
      state.values.allyMode === "gradient",
    );
    setClass(
      find("HPColorsUltModeFollow"),
      "Selected",
      state.values.ultMode === "follow",
    );
    setClass(
      find("HPColorsUltModeCustom"),
      "Selected",
      state.values.ultMode === "custom",
    );
    setClass(
      find("HPColorsUltCustomRow"),
      "Active",
      state.values.ultMode === "custom",
    );
    setClass(
      find("HPColorsReadoutFormatHP"),
      "Selected",
      state.values.readoutFormat === "hp",
    );
    setClass(
      find("HPColorsReadoutFormatPercent"),
      "Selected",
      state.values.readoutFormat === "percent",
    );
    setClass(
      find("HPColorsReadoutFormatCurrent"),
      "Selected",
      state.values.readoutFormat === "current",
    );
    setClass(
      find("HPColorsReadoutFontDefault"),
      "Selected",
      state.values.readoutFont === "default",
    );
    setClass(
      find("HPColorsReadoutFontOracle"),
      "Selected",
      state.values.readoutFont === "oracle",
    );
    setClass(
      find("HPColorsReadoutFontPulp"),
      "Selected",
      state.values.readoutFont === "pulp",
    );
    setClass(
      find("HPColorsReadoutColorBar"),
      "Selected",
      state.values.readoutColorMode === "bar",
    );
    setClass(
      find("HPColorsReadoutColorCustom"),
      "Selected",
      state.values.readoutColorMode === "custom",
    );
    setClass(
      find("HPColorsReadoutModeFixed"),
      "Selected",
      state.values.readoutMode === "fixed",
    );
    setClass(
      find("HPColorsReadoutModeGradient"),
      "Selected",
      state.values.readoutMode === "gradient",
    );
    setClass(
      find("HPColorsReadoutCustomRows"),
      "Active",
      state.values.readoutColorMode === "custom",
    );
    var customReadoutColors = state.values.readoutColorMode === "custom";
    setClass(
      find("HPColorsReadoutModeRow"),
      "Disabled",
      !customReadoutColors,
    );
    setEnabled(find("HPColorsReadoutModeFixed"), customReadoutColors);
    setEnabled(find("HPColorsReadoutModeGradient"), customReadoutColors);
    setEnabled(find("HPColorsSharedLowThresholdSlider"), true);
    setEnabled(find("HPColorsSharedLowThresholdEntry"), true);
    setEnabled(find("HPColorsSharedHighThresholdSlider"), true);
    setEnabled(find("HPColorsSharedHighThresholdEntry"), true);

    setSlider(
      "HPColorsWidthSlider",
      "HPColorsWidthEntry",
      state.values.widthScale,
    );
    setSlider(
      "HPColorsHeightSlider",
      "HPColorsHeightEntry",
      state.values.heightScale,
    );
    setSlider(
      "HPColorsPositionXSlider",
      "HPColorsPositionXEntry",
      state.values.positionX,
    );
    setSlider(
      "HPColorsPositionYSlider",
      "HPColorsPositionYEntry",
      state.values.positionY,
    );
    setSlider(
      "HPColorsGhoulOpacitySlider",
      "HPColorsGhoulOpacityEntry",
      state.values.ghoulOpacity,
    );
    setSlider(
      "HPColorsSharedLowThresholdSlider",
      "HPColorsSharedLowThresholdEntry",
      state.values.lowThreshold,
    );
    setSlider(
      "HPColorsSharedHighThresholdSlider",
      "HPColorsSharedHighThresholdEntry",
      state.values.highThreshold,
    );
    setSlider(
      "HPColorsReadoutSizeSlider",
      "HPColorsReadoutSizeEntry",
      state.values.readoutSize,
    );
    setSlider(
      "HPColorsReadoutOffsetXSlider",
      "HPColorsReadoutOffsetXEntry",
      state.values.readoutOffsetX,
    );
    setSlider(
      "HPColorsReadoutOffsetYSlider",
      "HPColorsReadoutOffsetYEntry",
      state.values.readoutOffsetY,
    );

    setSlider(
      "HPColorsEnemyPulseThresholdSlider",
      "HPColorsEnemyPulseThresholdEntry",
      state.values.enemyPulseThreshold,
    );
    setSlider(
      "HPColorsEnemyPulseBpmSlider",
      "HPColorsEnemyPulseBpmEntry",
      state.values.enemyPulseBpm,
    );
    setSlider(
      "HPColorsEnemyPulseReadoutSizeSlider",
      "HPColorsEnemyPulseReadoutSizeEntry",
      state.values.enemyPulseReadoutSize,
    );
    setSlider(
      "HPColorsEnemyPulseReadoutOffsetXSlider",
      "HPColorsEnemyPulseReadoutOffsetXEntry",
      state.values.enemyPulseReadoutOffsetX,
    );
    setSlider(
      "HPColorsEnemyPulseReadoutOffsetYSlider",
      "HPColorsEnemyPulseReadoutOffsetYEntry",
      state.values.enemyPulseReadoutOffsetY,
    );
    setSlider(
      "HPColorsAllyPulseThresholdSlider",
      "HPColorsAllyPulseThresholdEntry",
      state.values.allyPulseThreshold,
    );
    setPickerSliderValue(
      ui.enemyKillMarkerThresholdSlider,
      state.values.enemyKillMarkerThreshold,
    );
    setText(
      ui.enemyKillMarkerThresholdEntry,
      String(state.values.enemyKillMarkerThreshold),
    );
    setPickerSliderValue(
      ui.enemyKillMarkerWidthSlider,
      state.values.enemyKillMarkerWidth,
    );
    setText(
      ui.enemyKillMarkerWidthEntry,
      String(state.values.enemyKillMarkerWidth),
    );
    setSlider(
      "HPColorsAllyPulseBpmSlider",
      "HPColorsAllyPulseBpmEntry",
      state.values.allyPulseBpm,
    );
    setColor(
      "HPColorsEnemyLowSwatch",
      "HPColorsEnemyLowHex",
      state.values.enemyLow,
    );
    setColor(
      "HPColorsEnemyMidSwatch",
      "HPColorsEnemyMidHex",
      state.values.enemyMid,
    );
    setColor(
      "HPColorsEnemyHighSwatch",
      "HPColorsEnemyHighHex",
      state.values.enemyHigh,
    );
    setColor(
      "HPColorsEnemyHealingSwatch",
      "HPColorsEnemyHealingHex",
      state.values.enemyHealing,
    );
    setColor(
      "HPColorsEnemyDeltaSwatch",
      "HPColorsEnemyDeltaHex",
      state.values.enemyDelta,
    );
    setColor(
      "HPColorsEnemyShieldSwatch",
      "HPColorsEnemyShieldHex",
      state.values.enemyBulletShield,
    );
    setColor(
      "HPColorsUltCustomSwatch",
      "HPColorsUltCustomHex",
      state.values.ultCustom,
    );
    setColor(
      "HPColorsAllyLowSwatch",
      "HPColorsAllyLowHex",
      state.values.allyLow,
    );
    setColor(
      "HPColorsAllyMidSwatch",
      "HPColorsAllyMidHex",
      state.values.allyMid,
    );
    setColor(
      "HPColorsAllyHighSwatch",
      "HPColorsAllyHighHex",
      state.values.allyHigh,
    );
    setColor(
      "HPColorsAllyHealingSwatch",
      "HPColorsAllyHealingHex",
      state.values.allyHealing,
    );
    setColor(
      "HPColorsAllyDeltaSwatch",
      "HPColorsAllyDeltaHex",
      state.values.allyDelta,
    );
    setColor(
      "HPColorsAllyShieldSwatch",
      "HPColorsAllyShieldHex",
      state.values.allyBulletShield,
    );
    setColor(
      "HPColorsReadoutLowSwatch",
      "HPColorsReadoutLowHex",
      state.values.readoutLow,
    );
    setColor(
      "HPColorsReadoutMidSwatch",
      "HPColorsReadoutMidHex",
      state.values.readoutMid,
    );
    setColor(
      "HPColorsReadoutHighSwatch",
      "HPColorsReadoutHighHex",
      state.values.readoutHigh,
    );

    setColor(
      "HPColorsEnemyPulseColorSwatch",
      "HPColorsEnemyPulseColorHex",
      state.values.enemyPulseColor,
    );
    setColor(
      "HPColorsAllyPulseColorSwatch",
      "HPColorsAllyPulseColorHex",
      state.values.allyPulseColor,
    );
    if (
      isValid(ui.enemyKillMarkerColorSwatch) &&
      ui.enemyKillMarkerColorSwatch.style
    ) {
      try {
        if (
          ui.enemyKillMarkerColorSwatch.style.backgroundColor !==
          state.values.enemyKillMarkerColor
        )
          ui.enemyKillMarkerColorSwatch.style.backgroundColor =
            state.values.enemyKillMarkerColor;
      } catch {}
    }
    setText(
      ui.enemyKillMarkerColorEntry,
      state.values.enemyKillMarkerColor,
    );
    setClass(ui.undoButton, "Disabled", state.history.length === 0);
    if (ui.undoButton) ui.undoButton.enabled = state.history.length > 0;
    syncPicker();
    syncConditionIndicators();
    syncingControls = false;
    renderIdentity();
    renderCurrentScope();
  }

  function syncPresetGuide(presetPageActive) {
    setClass(ui.presetInfoToggle, "Available", presetPageActive);
    setClass(
      ui.presetInfoToggle,
      "Active",
      presetPageActive && presetGuideVisible,
    );
    setClass(
      ui.presetGuide,
      "Visible",
      presetPageActive && presetGuideVisible,
    );
    setEnabled(ui.presetInfoToggle, presetPageActive);
  }

  function togglePresetGuide() {
    presetGuideVisible = !presetGuideVisible;
    syncPresetGuide(true);
  }

  function renderNavigation() {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category) return;

    setText(ui.headerCategory, category.name);
    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++) {
      setClass(
        ui.categoryButtons[categoryIndex],
        "Selected",
        categoryIndex === state.categoryIndex,
      );
    }

    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++) {
      var tab = category.tabs[tabIndex];
      setClass(ui.tabButtons[tabIndex], "Available", !!tab);
      setClass(
        ui.tabButtons[tabIndex],
        "Selected",
        !!tab && tabIndex === state.tabIndex,
      );
      setText(ui.tabLabels[tabIndex], tab ? tab.name : "");
    }

    var activeTab = category.tabs[state.tabIndex];
    if (!activeTab) return;
    var presetPageActive =
      activeTab.pageId === "HPColorsSettingsOverviewHero";
    var hideHistoryActions = presetPageActive;
    setClass(
      ui.undoButton,
      "HPColorsFooterActionHidden",
      hideHistoryActions,
    );
    setClass(
      ui.resetButton,
      "HPColorsFooterActionHidden",
      hideHistoryActions,
    );
    setEnabled(ui.resetButton, activeTab.keys.length > 0);
    setText(ui.pageEyebrow, category.name + " / " + activeTab.name);
    setText(ui.pageTitle, activeTab.title);
    setText(ui.pageDescription, activeTab.description);
    for (var pageIndex = 0; pageIndex < ui.settingsPages.length; pageIndex++) {
      setClass(
        ui.settingsPages[pageIndex],
        "Active",
        ui.settingsPages[pageIndex].id === activeTab.pageId,
      );
    }
    syncPresetGuide(presetPageActive);
    syncControls();
  }

  function selectCategory(index) {
    if (index < 0 || index >= CATEGORY_DEFS.length) return;
    if (state.categoryIndex === index && state.tabIndex === 0) return;
    closePicker();
    state.categoryIndex = index;
    state.tabIndex = 0;
    renderNavigation();
  }

  function selectTab(index) {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category || index < 0 || index >= category.tabs.length) return;
    if (state.tabIndex === index) return;
    closePicker();
    state.tabIndex = index;
    renderNavigation();
  }

  function endPeek() {
    if (!state.peeking) return;
    state.peeking = false;
    setClass(ui.editorRoot, "Peeking", false);
    focus(ui.peekButton);
  }

  function beginPeek() {
    if (!state.open || state.peeking) return;
    closePicker();
    closeHeroDialog();
    closeScopeDialog();
    state.peeking = true;
    setClass(ui.editorRoot, "Peeking", true);
    focus(ui.peekCapture);
  }

  function closeEditor() {
    closeSupporterTicker();
    if (!state.open) return;
    closeResetDialog(false);
    closeConditionEditor();
    showResetFeedback("");
    closeTransferDialog();
    closeHeroDialog();
    closeScopeDialog();
    closePicker();
    presetFormOpen = false;
    presetEditId = "";
    sendState({ type: "editor_close" });
    endPeek();
    state.open = false;
    setClass(ui.editorRoot, "Open", false);
    setClass(ui.escapeRoot, "EditorOpen", false);
    focus(ui.menuButton);
    $.Msg("[HP Colors Rewrite] menu close");
  }

  function openEditor() {
    if (!state.booted || state.open) return;
    sendState({ type: "session_open" });
    state.open = true;
    state.peeking = false;
    showResetFeedback("");
    renderPresetOptions();
    syncPresetSaveForm(true);
    setClass(ui.editorRoot, "Peeking", false);
    setClass(ui.editorRoot, "Open", true);
    setClass(ui.escapeRoot, "EditorOpen", true);
    openSupporterTicker();
    renderNavigation();
    focus(ui.editorShell);
    $.Msg("[HP Colors Rewrite] menu open");
  }

  function cancel() {
    if (picker.key) {
      closePicker();
      return true;
    }
    if (
      isValid(ui.conditionDialog) &&
      ui.conditionDialog.BHasClass("Open")
    ) {
      closeConditionEditor();
      return true;
    }
    if (isValid(ui.resetDialog) && ui.resetDialog.BHasClass("Open")) {
      closeResetDialog(true);
      return true;
    }
    if (
      isValid(ui.presetTransferDialog) &&
      ui.presetTransferDialog.BHasClass("Open")
    ) {
      closePresetTransferDialog();
      return true;
    }
    if (isValid(ui.scopeDialog) && ui.scopeDialog.BHasClass("Open")) {
      closeScopeDialog();
      return true;
    }
    if (isValid(ui.heroDialog) && ui.heroDialog.BHasClass("Open")) {
      closeHeroDialog();
      return true;
    }
    if (
      isValid(ui.transferDialog) &&
      ui.transferDialog.BHasClass("Open")
    ) {
      closeTransferDialog();
      return true;
    }
    if (
      isValid(ui.precisePipsDialog) &&
      ui.precisePipsDialog.BHasClass("Open")
    ) {
      closePrecisePipsDialog();
      return true;
    }
    if (state.open) {
      closeEditor();
      return true;
    }
    return false;
  }

  function resolvePanels() {
    var marker = find("LeftStripeBlur");
    try {
      ui.escapeRoot =
        marker && marker.GetParent ? marker.GetParent() : context;
    } catch {
      ui.escapeRoot = context;
    }
    ui.absoluteRoot = absoluteRoot(ui.escapeRoot);
    ui.presetStorePanel = find(PRESET_STORE_ID);
    ui.menuButton = find("HPColorsMenuButton");
    ui.editorRoot = find("HPColorsEditorRoot");
    ui.editorShell = find("HPColorsEditorShell");
    ui.peekCapture = find("HPColorsPeekCapture");
    ui.peekButton = find("HPColorsPeekButton");
    ui.doneButton = find("HPColorsDoneButton");
    ui.undoButton = find("HPColorsUndoButton");
    ui.resetButton = find("HPColorsResetSectionButton");
    ui.resetDialog = find("HPColorsResetDialog");
    ui.resetDialogTitle = find("HPColorsResetDialogTitle");
    ui.resetDialogMessage = find("HPColorsResetDialogMessage");
    ui.resetConfirmButton = find("HPColorsResetConfirmButton");
    ui.resetCancelButton = find("HPColorsResetCancelButton");
    ui.conditionDialog = find("HPColorsConditionDialog");
    ui.conditionTitle = find("HPColorsConditionTitle");
    ui.conditionStatus = find("HPColorsConditionStatus");
    for (var conditionSlot = 1; conditionSlot <= 4; conditionSlot++) {
      ui.conditionSlotButtons.push(
        find("HPColorsConditionSlot" + String(conditionSlot)),
      );
      ui.conditionSlotImages.push(
        find("HPColorsConditionSlot" + String(conditionSlot) + "Image"),
      );
    }
    ui.conditionBooleanRow = find("HPColorsConditionBooleanRow");
    ui.conditionBooleanFalse = find("HPColorsConditionBooleanFalse");
    ui.conditionBooleanTrue = find("HPColorsConditionBooleanTrue");
    ui.conditionEnumRow = find("HPColorsConditionEnumRow");
    ui.conditionEnumOptions = find("HPColorsConditionEnumOptions");
    ui.conditionNumberRow = find("HPColorsConditionNumberRow");
    ui.conditionNumberSliderHost = find("HPColorsConditionNumberSliderHost");
    ui.conditionNumberEntry = find("HPColorsConditionNumberEntry");
    ui.conditionColorRow = find("HPColorsConditionColorRow");
    ui.conditionColorSwatch = find("HPColorsConditionColorSwatch");
    ui.conditionColorEntry = find("HPColorsConditionColorEntry");
    ui.conditionRemoveButton = find("HPColorsConditionRemoveButton");
    ui.conditionCancelButton = find("HPColorsConditionCancelButton");
    ui.conditionApplyButton = find("HPColorsConditionApplyButton");
    ui.transferButton = find("HPColorsTransferButton");
    ui.transferDialog = find("HPColorsTransferDialog");
    ui.transferInput = find("HPColorsTransferInput");
    ui.transferFeedback = find("HPColorsTransferFeedback");
    ui.transferExportButton = find("HPColorsTransferExportButton");
    ui.transferImportButton = find("HPColorsTransferImportButton");
    ui.transferCloseButton = find("HPColorsTransferCloseButton");
    ui.heroModeAuto = find("HPColorsHeroModeAuto");
    ui.heroModeManual = find("HPColorsHeroModeManual");
    ui.heroModeOff = find("HPColorsHeroModeOff");
    ui.heroPhase = find("HPColorsHeroPhase");
    ui.heroIdentity = find("HPColorsHeroIdentity");
    ui.heroDetail = find("HPColorsHeroDetail");
    ui.heroManualRow = find("HPColorsHeroManualRow");
    ui.heroManualButton = find("HPColorsHeroManualButton");
    ui.heroManualValue = find("HPColorsHeroManualValue");
    ui.heroDialog = find("HPColorsHeroDialog");
    ui.heroOptions = find("HPColorsHeroOptions");
    ui.heroCloseButton = find("HPColorsHeroCloseButton");
    ui.currentScopeAll = find("HPColorsCurrentScopeAll");
    ui.currentScopeSelected = find("HPColorsCurrentScopeSelected");
    ui.currentScopeSummary = find("HPColorsCurrentScopeSummary");
    ui.scopeDialog = find("HPColorsScopeDialog");
    ui.scopeSearch = find("HPColorsScopeSearch");
    ui.scopeOptions = find("HPColorsScopeOptions");
    ui.scopeCloseButton = find("HPColorsScopeCloseButton");
    ui.presetNameInput = find("HPColorsPresetNameInput");
    ui.presetSaveButton = find("HPColorsPresetSaveButton");
    ui.presetSaveButtonLabel = find("HPColorsPresetSaveButtonLabel");
    ui.presetSaveMode = find("HPColorsPresetSaveMode");
    ui.presetNewButton = find("HPColorsPresetNewButton");
    ui.presetForm = find("HPColorsPresetForm");
    ui.presetCancelEditButton = find("HPColorsPresetCancelEditButton");
    ui.presetOptions = find("HPColorsPresetOptions");
    ui.presetFeedback = find("HPColorsPresetFeedback");
    ui.presetRestoreBakedButton = find("HPColorsPresetRestoreBakedButton");
    ui.presetCopyAllButton = find("HPColorsPresetCopyAllButton");
    ui.presetImportButton = find("HPColorsPresetImportButton");
    ui.presetTransferDialog = find("HPColorsPresetTransferDialog");
    ui.presetTransferInput = find("HPColorsPresetTransferInput");
    ui.presetTransferFeedback = find("HPColorsPresetTransferFeedback");
    ui.presetTransferConfirmButton = find(
      "HPColorsPresetTransferConfirmButton",
    );
    ui.presetTransferCloseButton = find("HPColorsPresetTransferCloseButton");
    ui.presetGuide = find("HPColorsPresetGuide");
    ui.presetInfoToggle = find("HPColorsPresetInfoToggle");
    ui.headerCategory = find("HPColorsHeaderCategory");
    ui.supporterTicker = find("HPColorsSupporterTicker");
    ui.liveStatus = find("HPColorsLiveStatus");
    ui.pageEyebrow = find("HPColorsPageEyebrow");
    ui.pageTitle = find("HPColorsPageTitle");
    ui.pageDescription = find("HPColorsPageDescription");
    ui.pickerRoot = find("HPColorsPickerRoot");
    ui.pickerPanel = find("HPColorsPickerPanel");
    ui.pickerBackdrop = find("HPColorsPickerBackdrop");
    ui.pickerDone = find("HPColorsPickerDone");
    ui.pickerTitle = find("HPColorsPickerTitle");
    ui.pickerPreview = find("HPColorsPickerPreview");
    ui.pickerHex = find("HPColorsPickerHex");
    ui.pickerHueValue = find("HPColorsPickerHueValue");
    ui.pickerSaturationValue = find("HPColorsPickerSaturationValue");
    ui.pickerLightnessValue = find("HPColorsPickerLightnessValue");
    ui.pickerHueHost = find("HPColorsPickerHueSliderHost");
    ui.pickerSaturationHost = find("HPColorsPickerSaturationSliderHost");
    ui.pickerLumenHost = find("HPColorsPickerLumenSliderHost");
    ui.precisePipsToggle = find("HPColorsPrecisePipsToggle");
    ui.precisePipsDialog = find("HPColorsPrecisePipsDialog");
    ui.precisePipsDialogTitle = find("HPColorsPrecisePipsDialogTitle");
    ui.precisePipsDialogMessage = find("HPColorsPrecisePipsDialogMessage");
    ui.precisePipsDialogCommands = find("HPColorsPrecisePipsDialogCommands");
    ui.precisePipsCopyLabel = find("HPColorsPrecisePipsCopyLabel");
    ui.precisePipsCopyButton = find("HPColorsPrecisePipsCopyButton");
    ui.precisePipsCloseButton = find("HPColorsPrecisePipsCloseButton");
    ui.ghoulOpacityRow = find("HPColorsGhoulOpacityRow");
    ui.ghoulOpacitySlider = null;
    ui.ghoulOpacityEntry = find("HPColorsGhoulOpacityEntry");
    ui.enemyKillMarkerToggle = find("HPColorsEnemyKillMarkerToggle");
    ui.enemyKillMarkerThresholdRow = find("HPColorsEnemyKillMarkerThresholdRow");
    ui.enemyKillMarkerThresholdSlider = find(
      "HPColorsEnemyKillMarkerThresholdSlider",
    );
    ui.enemyKillMarkerThresholdEntry = find(
      "HPColorsEnemyKillMarkerThresholdEntry",
    );
    ui.enemyKillMarkerWidthRow = find("HPColorsEnemyKillMarkerWidthRow");
    ui.enemyKillMarkerWidthSlider = find(
      "HPColorsEnemyKillMarkerWidthSlider",
    );
    ui.enemyKillMarkerWidthEntry = find("HPColorsEnemyKillMarkerWidthEntry");
    ui.enemyKillMarkerColorRow = find("HPColorsEnemyKillMarkerColorRow");
    ui.enemyKillMarkerColorSwatch = find(
      "HPColorsEnemyKillMarkerColorSwatch",
    );
    ui.enemyKillMarkerColorEntry = find("HPColorsEnemyKillMarkerColorHex");

    for (var categoryIndex = 0; categoryIndex < CATEGORY_BUTTON_IDS.length; categoryIndex++)
      ui.categoryButtons.push(find(CATEGORY_BUTTON_IDS[categoryIndex]));
    for (var tabIndex = 0; tabIndex < 5; tabIndex++) {
      ui.tabButtons.push(find("HPColorsTab" + tabIndex));
      ui.tabLabels.push(find("HPColorsTabLabel" + tabIndex));
    }
    var pageIds = [
      "HPColorsSettingsOverviewStatus",
      "HPColorsSettingsOverviewLayout",
      "HPColorsSettingsOverviewHero",
      "HPColorsSettingsEnemyBar",
      "HPColorsSettingsEnemyFeedback",
      "HPColorsSettingsEnemyShields",
      "HPColorsSettingsAllyBar",
      "HPColorsSettingsAllyFeedback",
      "HPColorsSettingsAllyShields",
      "HPColorsSettingsReadoutNumber",
      "HPColorsSettingsReadoutPlacement",
      "HPColorsSettingsReadoutLevels",
      "HPColorsSettingsEnemyPulse",
      "HPColorsSettingsEnemyKillMarker",
      "HPColorsSettingsAllyPulse",
    ];

    for (var pageIndex = 0; pageIndex < pageIds.length; pageIndex++)
      ui.settingsPages.push(find(pageIds[pageIndex]));

    return (
      isValid(ui.escapeRoot) &&
      isValid(ui.absoluteRoot) &&
      isValid(ui.menuButton) &&
      isValid(ui.editorRoot) &&
      isValid(ui.editorShell) &&
      isValid(ui.peekCapture) &&
      isValid(ui.peekButton) &&
      isValid(ui.doneButton) &&
      isValid(ui.undoButton) &&
      isValid(ui.resetButton) &&
      isValid(ui.resetDialog) &&
      isValid(ui.resetDialogTitle) &&
      isValid(ui.resetDialogMessage) &&
      isValid(ui.resetConfirmButton) &&
      isValid(ui.resetCancelButton) &&
      isValid(ui.conditionDialog) &&
      isValid(ui.conditionTitle) &&
      isValid(ui.conditionStatus) &&
      ui.conditionSlotButtons.length === 4 &&
      ui.conditionSlotImages.length === 4 &&
      isValid(ui.conditionBooleanRow) &&
      isValid(ui.conditionBooleanFalse) &&
      isValid(ui.conditionBooleanTrue) &&
      isValid(ui.conditionEnumRow) &&
      isValid(ui.conditionEnumOptions) &&
      isValid(ui.conditionNumberRow) &&
      isValid(ui.conditionNumberSliderHost) &&
      isValid(ui.conditionNumberEntry) &&
      isValid(ui.conditionColorRow) &&
      isValid(ui.conditionColorSwatch) &&
      isValid(ui.conditionColorEntry) &&
      isValid(ui.conditionRemoveButton) &&
      isValid(ui.conditionCancelButton) &&
      isValid(ui.conditionApplyButton) &&
      isValid(ui.transferButton) &&
      isValid(ui.transferDialog) &&
      isValid(ui.transferInput) &&
      isValid(ui.transferFeedback) &&
      isValid(ui.transferExportButton) &&
      isValid(ui.transferImportButton) &&
      isValid(ui.transferCloseButton) &&
      isValid(ui.heroModeAuto) &&
      isValid(ui.heroModeManual) &&
      isValid(ui.heroModeOff) &&
      isValid(ui.heroPhase) &&
      isValid(ui.heroIdentity) &&
      isValid(ui.heroDetail) &&
      isValid(ui.heroManualRow) &&
      isValid(ui.heroManualButton) &&
      isValid(ui.heroManualValue) &&
      isValid(ui.heroDialog) &&
      isValid(ui.heroOptions) &&
      isValid(ui.heroCloseButton) &&
      isValid(ui.currentScopeAll) &&
      isValid(ui.currentScopeSelected) &&
      isValid(ui.currentScopeSummary) &&
      isValid(ui.scopeDialog) &&
      isValid(ui.scopeSearch) &&
      isValid(ui.scopeOptions) &&
      isValid(ui.scopeCloseButton) &&
      isValid(ui.presetNameInput) &&
      isValid(ui.presetSaveButton) &&
      isValid(ui.presetSaveButtonLabel) &&
      isValid(ui.presetSaveMode) &&
      isValid(ui.presetNewButton) &&
      isValid(ui.presetForm) &&
      isValid(ui.presetCancelEditButton) &&
      isValid(ui.presetOptions) &&
      isValid(ui.presetFeedback) &&
      isValid(ui.presetRestoreBakedButton) &&
      isValid(ui.presetCopyAllButton) &&
      isValid(ui.presetImportButton) &&
      isValid(ui.presetTransferDialog) &&
      isValid(ui.presetTransferInput) &&
      isValid(ui.presetTransferFeedback) &&
      isValid(ui.presetTransferConfirmButton) &&
      isValid(ui.presetTransferCloseButton) &&
      isValid(ui.presetGuide) &&
      isValid(ui.presetInfoToggle) &&
      isValid(ui.headerCategory) &&
      isValid(ui.liveStatus) &&
      isValid(ui.pageEyebrow) &&
      isValid(ui.pageTitle) &&
      isValid(ui.pageDescription) &&
      isValid(ui.precisePipsToggle) &&
      isValid(ui.precisePipsDialog) &&
      isValid(ui.precisePipsDialogTitle) &&
      isValid(ui.precisePipsDialogMessage) &&
      isValid(ui.precisePipsDialogCommands) &&
      isValid(ui.precisePipsCopyLabel) &&
      isValid(ui.precisePipsCopyButton) &&
      isValid(ui.precisePipsCloseButton) &&
      isValid(ui.pickerRoot) &&
      isValid(ui.pickerPanel) &&
      isValid(ui.pickerBackdrop) &&
      isValid(ui.pickerDone) &&
      isValid(ui.pickerHueHost) &&
      isValid(ui.pickerSaturationHost) &&
      isValid(ui.pickerLumenHost)
    );
  }

  function createSlider(hostId, sliderId, min, max) {
    var existing = find(sliderId);
    if (isValid(existing)) return existing;
    var host = find(hostId);
    if (!isValid(host)) return null;
    var slider = $.CreatePanel("Slider", host, sliderId, {
      direction: "horizontal",
    });
    slider.AddClass("HPColorsSlider");
    slider.AddClass("HorizontalSlider");
    slider.min = min;
    slider.max = max;
    slider.style.width = "100%";
    slider.style.height = "12px";
    slider.style.verticalAlign = "center";
    slider.style.overflow = "noclip";
    return slider;
  }

  function createPickerSliders() {
    ui.pickerHueSlider = createSlider(
      "HPColorsPickerHueSliderHost",
      "HPColorsPickerHueSlider",
      0,
      359,
    );
    ui.pickerSaturationSlider = createSlider(
      "HPColorsPickerSaturationSliderHost",
      "HPColorsPickerSaturationSlider",
      0,
      100,
    );
    ui.pickerLumenSlider = createSlider(
      "HPColorsPickerLumenSliderHost",
      "HPColorsPickerLumenSlider",
      0,
      100,
    );
    var sliders = [
      ui.pickerHueSlider,
      ui.pickerSaturationSlider,
      ui.pickerLumenSlider,
    ];
    for (var index = 0; index < sliders.length; index++) {
      if (!isValid(sliders[index])) return false;
      sliders[index].AddClass("HPColorsPickerSlider");
    }
    return true;
  }


  function createSliders() {
    return (
      isValid(createSlider("HPColorsWidthSliderHost", "HPColorsWidthSlider", 60, 160)) &&
      isValid(createSlider("HPColorsHeightSliderHost", "HPColorsHeightSlider", 60, 160)) &&
      isValid((ui.ghoulOpacitySlider = createSlider("HPColorsGhoulOpacitySliderHost", "HPColorsGhoulOpacitySlider", 0, 100))) &&
      isValid(
        createSlider(
          "HPColorsPositionXSliderHost",
          "HPColorsPositionXSlider",
          -300,
          300,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsPositionYSliderHost",
          "HPColorsPositionYSlider",
          -200,
          200,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutSizeSliderHost",
          "HPColorsReadoutSizeSlider",
          72,
          320,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutOffsetXSliderHost",
          "HPColorsReadoutOffsetXSlider",
          -405,
          405,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsReadoutOffsetYSliderHost",
          "HPColorsReadoutOffsetYSlider",
          -35,
          840,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsSharedLowThresholdSliderHost",
          "HPColorsSharedLowThresholdSlider",
          0,
          99,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsSharedHighThresholdSliderHost",
          "HPColorsSharedHighThresholdSlider",
          1,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseThresholdSliderHost",
          "HPColorsEnemyPulseThresholdSlider",
          0,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseBpmSliderHost",
          "HPColorsEnemyPulseBpmSlider",
          30,
          300,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseReadoutSizeSliderHost",
          "HPColorsEnemyPulseReadoutSizeSlider",
          72,
          320,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseReadoutOffsetXSliderHost",
          "HPColorsEnemyPulseReadoutOffsetXSlider",
          -405,
          405,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsEnemyPulseReadoutOffsetYSliderHost",
          "HPColorsEnemyPulseReadoutOffsetYSlider",
          -35,
          840,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsAllyPulseThresholdSliderHost",
          "HPColorsAllyPulseThresholdSlider",
          0,
          100,
        ),
      ) &&
      isValid(
        createSlider(
          "HPColorsAllyPulseBpmSliderHost",
          "HPColorsAllyPulseBpmSlider",
          30,
          300,
        ),
      ) &&
      isValid(
        (ui.enemyKillMarkerThresholdSlider = createSlider(
          "HPColorsEnemyKillMarkerThresholdSliderHost",
          "HPColorsEnemyKillMarkerThresholdSlider",
          5,
          80,
        )),
      ) &&
      isValid(
        (ui.enemyKillMarkerWidthSlider = createSlider(
          "HPColorsEnemyKillMarkerWidthSliderHost",
          "HPColorsEnemyKillMarkerWidthSlider",
          1,
          100,
        )),
      ) &&
      isValid(
        (ui.conditionNumberSlider = createSlider(
          "HPColorsConditionNumberSliderHost",
          "HPColorsConditionNumberSlider",
          0,
          100,
        )),
      ) &&
      createPickerSliders()
    );
  }

  function bindPickerControls() {
    setPanelEvent(ui.pickerDone, "onactivate", closePicker);
    setPanelEvent(ui.pickerPanel, "oncancel", closePicker);
    bindPickerSlider(ui.pickerHueSlider, "hue");
    bindPickerSlider(ui.pickerSaturationSlider, "saturation");
    bindPickerSlider(ui.pickerLumenSlider, "lightness");
  }

  function bindControls() {
    setPanelEvent(ui.presetInfoToggle, "onactivate", togglePresetGuide);
    bindToggle("HPColorsMasterToggle", "enabled");
    bindToggle("HPColorsEnemyToggle", "enemyEnabled");
    bindToggle("HPColorsEnemyVisibleToggle", "enemyVisible");
    bindToggle("HPColorsAllyToggle", "allyEnabled");
    bindToggle("HPColorsAllyVisibleToggle", "allyVisible");
    bindToggle("HPColorsEnemyTeamHighToggle", "enemyTeamHigh");
    bindToggle("HPColorsExcludeBuildingsToggle", "excludeBuildings");
    bindToggle("HPColorsExcludeBossesToggle", "excludeBosses");
    bindToggle("HPColorsExcludeGhoulsToggle", "excludeGhouls");
    bindToggle("HPColorsGhoulOpacityToggle", "ghoulOpacityEnabled");
    bindMode("HPColorsEnemyModeFixed", "enemyMode", "fixed");
    bindMode("HPColorsEnemyModeGradient", "enemyMode", "gradient");
    bindMode("HPColorsAllyModeFixed", "allyMode", "fixed");
    bindMode("HPColorsAllyModeGradient", "allyMode", "gradient");
    bindMode("HPColorsUltModeFollow", "ultMode", "follow");
    bindMode("HPColorsUltModeCustom", "ultMode", "custom");
    bindToggle("HPColorsReadoutToggle", "readoutVisible");
    bindToggle("HPColorsPipsVisibleToggle", "pipsVisible");
    setPanelEvent(ui.precisePipsToggle, "onactivate", togglePrecisePips);
    bindToggle("HPColorsLevelsVisibleToggle", "levelsVisible");
    bindToggle(
      "HPColorsEnemyKillMarkerToggle",
      "enemyKillMarkerEnabled",
    );
    bindToggle("HPColorsEnemyPulseToggle", "enemyPulseEnabled");
    bindToggle("HPColorsEnemyPulseColorToggle", "enemyPulseColorEnabled");
    bindToggle("HPColorsEnemyPulseHideBarToggle", "enemyPulseHideBar");
    bindToggle("HPColorsEnemyPulseReadoutToggle", "enemyPulseReadout");
    bindToggle(
      "HPColorsEnemyPulseReadoutModifiersToggle",
      "enemyPulseReadoutModifiers",
    );
    bindToggle("HPColorsAllyPulseToggle", "allyPulseEnabled");
    bindToggle("HPColorsAllyPulseColorToggle", "allyPulseColorEnabled");
    bindMode(
      "HPColorsEnemyPulseColorModeFixed",
      "enemyPulseColorMode",
      "fixed",
    );
    bindMode(
      "HPColorsEnemyPulseColorModeGradient",
      "enemyPulseColorMode",
      "gradient",
    );
    bindMode("HPColorsEnemyPulseIntensitySubtle", "enemyPulseIntensity", 0);
    bindMode("HPColorsEnemyPulseIntensityMedium", "enemyPulseIntensity", 1);
    bindMode("HPColorsEnemyPulseIntensityIntense", "enemyPulseIntensity", 2);
    bindMode("HPColorsAllyPulseIntensitySubtle", "allyPulseIntensity", 0);
    bindMode("HPColorsAllyPulseIntensityMedium", "allyPulseIntensity", 1);
    bindMode("HPColorsAllyPulseIntensityIntense", "allyPulseIntensity", 2);
    bindMode("HPColorsReadoutFormatHP", "readoutFormat", "hp");
    bindMode("HPColorsReadoutFormatPercent", "readoutFormat", "percent");
    bindMode("HPColorsReadoutFormatCurrent", "readoutFormat", "current");
    bindMode("HPColorsReadoutFontDefault", "readoutFont", "default");
    bindMode("HPColorsReadoutFontOracle", "readoutFont", "oracle");
    bindMode("HPColorsReadoutFontPulp", "readoutFont", "pulp");
    bindMode("HPColorsReadoutColorBar", "readoutColorMode", "bar");
    bindMode("HPColorsReadoutColorCustom", "readoutColorMode", "custom");
    bindMode("HPColorsReadoutModeFixed", "readoutMode", "fixed");
    bindMode("HPColorsReadoutModeGradient", "readoutMode", "gradient");
    bindSlider("HPColorsWidthSlider", "HPColorsWidthEntry", "widthScale", 60, 160);
    bindSlider("HPColorsHeightSlider", "HPColorsHeightEntry", "heightScale", 60, 160);
    bindSlider(
      "HPColorsPositionXSlider",
      "HPColorsPositionXEntry",
      "positionX",
      -300,
      300,
    );
    bindSlider(
      "HPColorsPositionYSlider",
      "HPColorsPositionYEntry",
      "positionY",
      -200,
      200,
    );
    bindSlider(
      "HPColorsGhoulOpacitySlider",
      "HPColorsGhoulOpacityEntry",
      "ghoulOpacity",
      0,
      100,
    );
    bindSlider(
      "HPColorsReadoutSizeSlider",
      "HPColorsReadoutSizeEntry",
      "readoutSize",
      72,
      320,
    );
    bindSlider(
      "HPColorsReadoutOffsetXSlider",
      "HPColorsReadoutOffsetXEntry",
      "readoutOffsetX",
      -405,
      405,
    );
    bindSlider(
      "HPColorsReadoutOffsetYSlider",
      "HPColorsReadoutOffsetYEntry",
      "readoutOffsetY",
      -35,
      840,
    );
    bindSlider(
      "HPColorsEnemyPulseThresholdSlider",
      "HPColorsEnemyPulseThresholdEntry",
      "enemyPulseThreshold",
      0,
      100,
    );
    bindSlider(
      "HPColorsEnemyPulseBpmSlider",
      "HPColorsEnemyPulseBpmEntry",
      "enemyPulseBpm",
      30,
      300,
    );
    bindSlider(
      "HPColorsEnemyPulseReadoutSizeSlider",
      "HPColorsEnemyPulseReadoutSizeEntry",
      "enemyPulseReadoutSize",
      72,
      320,
    );
    bindSlider(
      "HPColorsEnemyPulseReadoutOffsetXSlider",
      "HPColorsEnemyPulseReadoutOffsetXEntry",
      "enemyPulseReadoutOffsetX",
      -405,
      405,
    );
    bindSlider(
      "HPColorsEnemyPulseReadoutOffsetYSlider",
      "HPColorsEnemyPulseReadoutOffsetYEntry",
      "enemyPulseReadoutOffsetY",
      -35,
      840,
    );
    bindSlider(
      "HPColorsAllyPulseThresholdSlider",
      "HPColorsAllyPulseThresholdEntry",
      "allyPulseThreshold",
      0,
      100,
    );
    bindSlider(
      "HPColorsAllyPulseBpmSlider",
      "HPColorsAllyPulseBpmEntry",
      "allyPulseBpm",
      30,
      300,
    );
    bindSlider(
      "HPColorsEnemyKillMarkerThresholdSlider",
      "HPColorsEnemyKillMarkerThresholdEntry",
      "enemyKillMarkerThreshold",
      5,
      80,
    );
    bindSlider(
      "HPColorsEnemyKillMarkerWidthSlider",
      "HPColorsEnemyKillMarkerWidthEntry",
      "enemyKillMarkerWidth",
      1,
      100,
    );
    bindSlider(
      "HPColorsSharedLowThresholdSlider",
      "HPColorsSharedLowThresholdEntry",
      "lowThreshold",
      0,
      99,
    );
    bindSlider(
      "HPColorsSharedHighThresholdSlider",
      "HPColorsSharedHighThresholdEntry",
      "highThreshold",
      1,
      100,
    );
    bindColor("HPColorsEnemyLowSwatch", "HPColorsEnemyLowHex", "enemyLow");
    bindColor("HPColorsEnemyMidSwatch", "HPColorsEnemyMidHex", "enemyMid");
    bindColor("HPColorsEnemyHighSwatch", "HPColorsEnemyHighHex", "enemyHigh");
    bindColor(
      "HPColorsEnemyHealingSwatch",
      "HPColorsEnemyHealingHex",
      "enemyHealing",
    );
    bindColor(
      "HPColorsEnemyDeltaSwatch",
      "HPColorsEnemyDeltaHex",
      "enemyDelta",
    );
    bindColor(
      "HPColorsEnemyShieldSwatch",
      "HPColorsEnemyShieldHex",
      "enemyBulletShield",
    );
    bindColor(
      "HPColorsUltCustomSwatch",
      "HPColorsUltCustomHex",
      "ultCustom",
    );
    bindColor("HPColorsAllyLowSwatch", "HPColorsAllyLowHex", "allyLow");
    bindColor("HPColorsAllyMidSwatch", "HPColorsAllyMidHex", "allyMid");
    bindColor("HPColorsAllyHighSwatch", "HPColorsAllyHighHex", "allyHigh");
    bindColor(
      "HPColorsAllyHealingSwatch",
      "HPColorsAllyHealingHex",
      "allyHealing",
    );
    bindColor(
      "HPColorsAllyDeltaSwatch",
      "HPColorsAllyDeltaHex",
      "allyDelta",
    );
    bindColor(
      "HPColorsAllyShieldSwatch",
      "HPColorsAllyShieldHex",
      "allyBulletShield",
    );
    bindColor(
      "HPColorsEnemyKillMarkerColorSwatch",
      "HPColorsEnemyKillMarkerColorHex",
      "enemyKillMarkerColor",
    );
    bindColor(
      "HPColorsEnemyPulseColorSwatch",
      "HPColorsEnemyPulseColorHex",
      "enemyPulseColor",
    );
    bindColor(
      "HPColorsAllyPulseColorSwatch",
      "HPColorsAllyPulseColorHex",
      "allyPulseColor",
    );
    bindColor(
      "HPColorsReadoutLowSwatch",
      "HPColorsReadoutLowHex",
      "readoutLow",
    );
    bindColor(
      "HPColorsReadoutMidSwatch",
      "HPColorsReadoutMidHex",
      "readoutMid",
    );
    bindColor(
      "HPColorsReadoutHighSwatch",
      "HPColorsReadoutHighHex",
      "readoutHigh",
    );
    bindConditionEditorControls();
  }

  function boot() {
    if (state.booted) return;
    if (!resolvePanels()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: required panel missing");
      return;
    }
    if (
      !$.HPColorsStateFactory ||
      !isCallable($.HPColorsStateFactory.create)
    ) {
      $.Msg("[HP Colors Rewrite] menu boot failed: HPColorsStateFactory missing");
      return;
    }
    var rawSessionState = readRootAttribute(MENU_STATE_ATTR);
    var publishedRaw = readRootAttribute(CONFIG_ATTR);
    var builderPresetRaw = readBuilderPresetRaw();
    try {
      stateInstance = $.HPColorsStateFactory.create({
        sessionRaw: rawSessionState || null,
        publishedRaw: publishedRaw || null,
        builderPresetRaw: builderPresetRaw,
      });
    } catch (error) {
      $.Msg(
        "[HP Colors Rewrite] menu boot failed: state factory create error: " +
          String(error),
      );
      return;
    }
    if (
      !stateInstance ||
      !isCallable(stateInstance.send) ||
      !isCallable(stateInstance.read)
    ) {
      $.Msg("[HP Colors Rewrite] menu boot failed: invalid state instance");
      stateInstance = null;
      return;
    }
    state.view = stateInstance.read();
    if (!createSliders()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: slider host missing");
      return;
    }
    if (!createHeroOptions()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: hero option host missing");
      return;
    }
    if (!createScopeHeroOptions()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: scope option host missing");
      return;
    }


    setPanelEvent(ui.menuButton, "onactivate", openEditor);
    setPanelEvent(ui.doneButton, "onactivate", closeEditor);
    setPanelEvent(ui.undoButton, "onactivate", undo);
    setPanelEvent(ui.resetButton, "onactivate", requestSectionReset);
    setPanelEvent(ui.resetConfirmButton, "onactivate", confirmSectionReset);
    setPanelEvent(ui.resetCancelButton, "onactivate", function () {
      closeResetDialog(true);
    });
    setPanelEvent(ui.resetDialog, "oncancel", function () {
      closeResetDialog(true);
    });
    setPanelEvent(ui.transferButton, "onactivate", openTransferDialog);
    setPanelEvent(ui.transferExportButton, "onactivate", copyCurrentSettings);
    setPanelEvent(ui.transferImportButton, "onactivate", importLiveSettings);
    setPanelEvent(ui.transferCloseButton, "onactivate", closeTransferDialog);
    setPanelEvent(ui.transferDialog, "oncancel", closeTransferDialog);
    setPanelEvent(ui.heroModeAuto, "onactivate", function () {
      setHeroMode(HERO_MODE_AUTO);
    });
    setPanelEvent(ui.heroModeManual, "onactivate", function () {
      setHeroMode(HERO_MODE_MANUAL);
    });
    setPanelEvent(ui.heroModeOff, "onactivate", function () {
      setHeroMode(HERO_MODE_OFF);
    });
    setPanelEvent(ui.heroManualButton, "onactivate", openHeroDialog);
    setPanelEvent(ui.heroCloseButton, "onactivate", closeHeroDialog);
    setPanelEvent(ui.heroDialog, "oncancel", closeHeroDialog);
    setPanelEvent(ui.currentScopeAll, "onactivate", function () {
      setCurrentScopeMode(HERO_SCOPE_ALL);
    });
    setPanelEvent(ui.currentScopeSelected, "onactivate", openScopeDialog);
    setPanelEvent(ui.scopeSearch, "ontextentrychange", filterScopeHeroOptions);
    setPanelEvent(ui.scopeCloseButton, "onactivate", closeScopeDialog);
    setPanelEvent(ui.scopeDialog, "oncancel", closeScopeDialog);
    setPanelEvent(ui.presetSaveButton, "onactivate", saveCurrentPreset);
    setPanelEvent(ui.presetNewButton, "onactivate", beginNewPreset);
    setPanelEvent(
      ui.presetCancelEditButton,
      "onactivate",
      cancelPresetEdit,
    );
    setPanelEvent(ui.presetCopyAllButton, "onactivate", copyAllPresets);
    setPanelEvent(
      ui.presetImportButton,
      "onactivate",
      openPresetTransferDialog,
    );
    setPanelEvent(
      ui.presetTransferConfirmButton,
      "onactivate",
      confirmPresetTransferImport,
    );
    setPanelEvent(
      ui.presetTransferCloseButton,
      "onactivate",
      closePresetTransferDialog,
    );
    setPanelEvent(
      ui.presetTransferDialog,
      "oncancel",
      closePresetTransferDialog,
    );
    setPanelEvent(
      ui.presetRestoreBakedButton,
      "onactivate",
      restoreHiddenBakedPresets,
    );
    setPanelEvent(ui.peekButton, "onmousedown", beginPeek);
    setPanelEvent(ui.peekButton, "onmouseup", endPeek);
    setPanelEvent(ui.peekCapture, "onactivate", endPeek);
    setPanelEvent(ui.peekCapture, "onmouseup", endPeek);

    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++)
      bindCategory(categoryIndex);
    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++)
      bindTab(tabIndex);
    bindControls();
    bindPickerControls();
    setPanelEvent(ui.precisePipsCopyButton, "onactivate", copyPrecisePipsText);
    setPanelEvent(ui.precisePipsCloseButton, "onactivate", closePrecisePipsDialog);
    setPanelEvent(ui.precisePipsDialog, "oncancel", closePrecisePipsDialog);

    state.booted = true;
    sendState({ type: "session_open", publish: true });
    var effectiveRaw = readRootAttribute(CONFIG_ATTR);
    if (effectiveRaw) {
      cacheReplayPayload(
        effectiveRaw,
        serializeChange(
          "*",
          effectiveRaw,
          state.view ? state.view.effectiveRevision : 0,
        ),
      );
    }
    refreshSnapshotReplay();
    renderNavigation();
    restartIdentityWatch();
    $.Msg("[HP Colors Rewrite] menu ready");
  }

  $.HPColorsMenuBoot = boot;
  $.HPColorsMenuCancel = cancel;
})();
