"use strict";

(function () {
    var DEFAULT_CRATE_SIZE_PX = 2;
    var DEFAULT_CRATE_OPACITY = 0.75;
    var DEFAULT_CRATES_ENABLED = true;
    var DEFAULT_MAP_OPACITY = 1.00;
    var DEFAULT_SMALL_MAP_SCALE_INDEX = 0;
    var DEFAULT_FS_HUD_ENABLED = false;
    var DEFAULT_MINIMAP_OFFSET_RIGHT = 0;
    var DEFAULT_MINIMAP_OFFSET_BOTTOM = 0;

    var crateSizePx = DEFAULT_CRATE_SIZE_PX;
    var crateOpacity = DEFAULT_CRATE_OPACITY;
    var crateBorderOpacity = 0.01;
    var mapContainerOpacity = DEFAULT_MAP_OPACITY;
    var useFullScreenHud = DEFAULT_FS_HUD_ENABLED;

    var DEFAULT_SMALL_MAP_SIZE = 400;
    var DEFAULT_UI_CLAMP_WIDTH = 2000;
    var DEFAULT_MINIMAP_MARGIN_RIGHT = 0;
    var DEFAULT_MINIMAP_MARGIN_BOTTOM = 15;
    // Ignore constrained parent bounds (e.g. clamp_width), but still keep minimap on-screen.
    var IGNORE_PARENT_DRAG_BOUNDS = true;
    var SMALL_MAP_SCALE_PRESETS = [1.00, 1.25, 1.50, 1.75, 2.00];
    var SMALL_MAP_SCALE_DROPDOWN_OPTION_IDS = [
        "minimap_small_scale_opt_100",
        "minimap_small_scale_opt_125",
        "minimap_small_scale_opt_150",
        "minimap_small_scale_opt_175",
        "minimap_small_scale_opt_200"
    ];
    var smallMapScaleIndex = DEFAULT_SMALL_MAP_SCALE_INDEX;
    var dragModeEnabled = true;
    var minimapOffsetRight = DEFAULT_MINIMAP_OFFSET_RIGHT;
    var minimapOffsetBottom = DEFAULT_MINIMAP_OFFSET_BOTTOM;
    var isDraggingMinimap = false;
    var dragStartCursorX = 0;
    var dragStartCursorY = 0;
    var dragStartOffsetRight = 0;
    var dragStartOffsetBottom = 0;
    var dragGripHovered = false;
    var dragProxyPanel = null;
    var dragProxyInitialized = false;
    var dragHandlersBound = false;
    var dragPositionSource = "none";
    var settingsToggleBound = false;
    var activeSettingsSection = "objects";
    var activeObjectsTab = "crates";
    var cratesOverlayEnabled = DEFAULT_CRATES_ENABLED;
    var settingsPanelOpen = false;
    var settingsPanelAnimToken = 0;
    var SETTINGS_PANEL_CLOSE_DELAY_SEC = 0.22;
    var SETTINGS_TOGGLE_BUTTON_IDS = [
        "minimap_settings_toggle",
        "minimap_settings_close_bottom"
    ];
    var SETTINGS_TOGGLE_LABEL_IDS = [
        "minimap_settings_toggle_label"
    ];
    var DRAG_HANDLE_BUTTON_ID = "minimap_drag_button";
    var DRAG_HANDLE_LABEL_ID = "minimap_drag_button_label";
    var SETTINGS_STORAGE_KEY = "deadlockmapmod.minimap.settings.v1";
    var SETTINGS_STORAGE_ATTR_KEY = "DEADLOCKMAPMOD_MINIMAP_SETTINGS_V1";
    var SETTINGS_STORAGE_REV_ATTR_KEY = "DEADLOCKMAPMOD_MINIMAP_SETTINGS_V1_REV";
    var SETTINGS_STORAGE_RAW_FALLBACK_KEY = "deadlockmapmod_settings_raw_v1";
    var SETTINGS_STORAGE_FIELD_PREFIX = SETTINGS_STORAGE_KEY + ".";
    var SETTINGS_STORAGE_VERSION = 1;
    var BRIDGE_REQUEST_PAYLOAD_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_PAYLOAD";
    var BRIDGE_REQUEST_TOKEN_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_TOKEN";
    var BRIDGE_REQUEST_STATE_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_STATE";
    var BRIDGE_REQUEST_MSG_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_MSG";
    var BRIDGE_TOKEN_PREFIX = "[DMM-1]:";
    var BRIDGE_TOKEN_EXTRACT_REGEX = /(\[DMM-1\]:[^\s]+?\|h=[0-9A-Fa-f]+)/i;
    var BRIDGE_BUILD_SCAN_MAX_PANELS = 1600;
    var BRIDGE_BUILD_SCAN_INTERVAL_SEC = 1.0;
    var BRIDGE_BUILD_SCAN_TTL_SEC = 45.0;
    var BRIDGE_BUILD_UI_NUDGE_INTERVAL_MS = 4000;
    var bridgeBuildScanStartedMs = 0;
    var bridgeBuildUiNudgeNextMs = 0;
    var settingsStorageApi = null;
    var settingsStorageApis = [];
    var settingsStorageResolved = false;
    var settingsStorageLastResolveMs = 0;
    var settingsStorageUnavailableLogged = false;
    var SETTINGS_STORAGE_RESCAN_INTERVAL_MS = 2000;
    var settingsPersistenceReady = false;
    var settingsSaveToken = 0;
    var debugLastLoadSource = "none";
    var debugLastSaveStatus = "none";
    var debugLastStateHash = "n/a";
    var debugBackendSummary = "n/a";
    var debugRawLengths = "n/a";
    var debugBridgeStatus = "idle";
    var debugStorageDiscovery = "n/a";
    var settingsAttrRevision = 0;
    var bridgeRequestActive = false;
    var bridgeRequestToken = "";
    var bridgeRequestStartedMs = 0;
    var BRIDGE_REQUEST_TIMEOUT_MS = 15000;
    var configClipboardMirror = "";

    function clearChildren(panel) {
        if (panel) {
            panel.RemoveAndDeleteChildren();
        }
    }

    function addMarker(parent, u, v) {
        var marker = $.CreatePanel("Panel", parent, "");
        marker.AddClass("minimap_marker");
        marker.style.position = (u * 100) + "% " + (v * 100) + "% 0";
        return marker;
    }

    function isToggleEnabled() {
        return cratesOverlayEnabled;
    }

    function setCratesControlsEnabled() {
        var group = $("#minimap_crates_controls_group");
        if (group) {
            group.SetHasClass("Disabled", false);
            group.hittest = true;
        }

        var sizeSliderPanel = $("#minimap_crates_size_slider");
        if (sizeSliderPanel) {
            sizeSliderPanel.enabled = true;
            if (typeof sizeSliderPanel.FindChildTraverse === "function") {
                var sizeSlider = sizeSliderPanel.FindChildTraverse("Slider");
                var sizeEntry = sizeSliderPanel.FindChildTraverse("TextEntry");
                if (sizeSlider) {
                    sizeSlider.enabled = true;
                }
                if (sizeEntry) {
                    sizeEntry.enabled = true;
                }
            }
        }

        var opacitySliderPanel = $("#minimap_crates_opacity_slider");
        if (opacitySliderPanel) {
            opacitySliderPanel.enabled = true;
            if (typeof opacitySliderPanel.FindChildTraverse === "function") {
                var opacitySlider = opacitySliderPanel.FindChildTraverse("Slider");
                var opacityEntry = opacitySliderPanel.FindChildTraverse("TextEntry");
                if (opacitySlider) {
                    opacitySlider.enabled = true;
                }
                if (opacityEntry) {
                    opacityEntry.enabled = true;
                }
            }
        }
    }

    function setCratesToggleState(enabled) {
        cratesOverlayEnabled = !!enabled;
        var toggle = $("#minimap_crates_toggle");
        if (toggle) {
            if (typeof toggle.checked !== "undefined") {
                toggle.checked = cratesOverlayEnabled;
            }
            if (typeof toggle.SetSelected === "function") {
                toggle.SetSelected(cratesOverlayEnabled);
            }
        }

        setCratesControlsEnabled();
        updateOverlayVisibility();
    }

    function applyBigMapVisibility() {
        var minimapPersp = $("#minimap_persp");
        if (!minimapPersp) {
            $.Msg("[minimap_overlay] #minimap_persp not found for big map visibility");
            return;
        }

        // Legacy "show big map on TAB" option is retired; keep small-map scaling behavior.
        minimapPersp.SetHasClass("DisableBigMapScaleOnTab", true);
    }

    function updateOverlayVisibility() {
        var overlay = $("#minimap_overlay_root");
        if (!overlay) {
            $.Msg("[minimap_overlay] #minimap_overlay_root not found");
            return;
        }

        overlay.style.visibility = isToggleEnabled() ? "visible" : "collapse";
    }

    function panelHasAnyClass(panel, classNames) {
        if (!panel || typeof panel.BHasClass !== "function") {
            return false;
        }

        for (var i = 0; i < classNames.length; i++) {
            if (panel.BHasClass(classNames[i])) {
                return true;
            }
        }

        return false;
    }

    function isScoreboardModeActive() {
        var scoreboardClasses = ["gScoreboardOpen", "wants_scoreboard"];
        var minimapPersp = $("#minimap_persp");
        if (panelHasAnyClass(minimapPersp, scoreboardClasses)) {
            return true;
        }

        var contextPanel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;

        var current = contextPanel;
        while (current) {
            if (panelHasAnyClass(current, scoreboardClasses)) {
                return true;
            }

            if (typeof current.GetParent === "function") {
                current = current.GetParent();
            } else {
                current = null;
            }
        }

        return false;
    }

    function applySettingsHostVisibility() {
        var host = $("#minimap_settings");
        if (!host) {
            return;
        }

        host.style.visibility = isScoreboardModeActive() ? "visible" : "collapse";
    }

    function setActiveObjectsTab(tabName) {
        if (tabName === "tunnels") {
            activeObjectsTab = tabName;
        } else {
            activeObjectsTab = "crates";
        }

        var cratesButton = $("#minimap_object_tab_crates");
        var tunnelsButton = $("#minimap_object_tab_tunnels");
        var cratesContent = $("#minimap_tab_content_crates");
        var tunnelsContent = $("#minimap_tab_content_tunnels");
        var showCrates = activeObjectsTab === "crates" && activeSettingsSection === "objects";
        var showTunnels = activeObjectsTab === "tunnels" && activeSettingsSection === "objects";

        if (cratesButton) {
            if (typeof cratesButton.SetSelected === "function") {
                cratesButton.SetSelected(activeObjectsTab === "crates");
            }
        }

        if (tunnelsButton) {
            if (typeof tunnelsButton.SetSelected === "function") {
                tunnelsButton.SetSelected(activeObjectsTab === "tunnels");
            }
        }

        if (cratesContent) {
            cratesContent.SetHasClass("TabActive", showCrates);
            cratesContent.style.visibility = showCrates ? "visible" : "collapse";
        }

        if (tunnelsContent) {
            tunnelsContent.SetHasClass("TabActive", showTunnels);
            tunnelsContent.style.visibility = showTunnels ? "visible" : "collapse";
        }

        scheduleSettingsSave();
    }

    function setActiveSection(sectionName) {
        activeSettingsSection = normalizeSectionName(sectionName);

        var objectsButton = $("#minimap_nav_objects");
        var mapButton = $("#minimap_nav_map");
        var screenButton = $("#minimap_nav_screen");
        var configButton = $("#minimap_nav_config");
        var debugButton = $("#minimap_nav_debug");
        var objectsChildren = $("#minimap_nav_objects_children");
        var mapContent = $("#minimap_tab_content_map");
        var screenContent = $("#minimap_tab_content_screen");
        var configContent = $("#minimap_tab_content_config");
        var debugContent = $("#minimap_tab_content_debug");

        var showObjects = activeSettingsSection === "objects";
        var showMap = activeSettingsSection === "map";
        var showScreen = activeSettingsSection === "screen";
        var showConfig = activeSettingsSection === "config";
        var showDebug = activeSettingsSection === "debug";

        if (objectsButton) {
            if (typeof objectsButton.SetSelected === "function") {
                objectsButton.SetSelected(showObjects);
            }
        }

        if (mapButton) {
            if (typeof mapButton.SetSelected === "function") {
                mapButton.SetSelected(showMap);
            }
        }
        if (screenButton) {
            if (typeof screenButton.SetSelected === "function") {
                screenButton.SetSelected(showScreen);
            }
        }
        if (configButton) {
            if (typeof configButton.SetSelected === "function") {
                configButton.SetSelected(showConfig);
            }
        }
        if (debugButton) {
            if (typeof debugButton.SetSelected === "function") {
                debugButton.SetSelected(showDebug);
            }
        }

        if (objectsChildren) {
            objectsChildren.style.visibility = showObjects ? "visible" : "collapse";
        }

        if (mapContent) {
            mapContent.SetHasClass("TabActive", showMap);
            mapContent.style.visibility = showMap ? "visible" : "collapse";
        }
        if (screenContent) {
            screenContent.SetHasClass("TabActive", showScreen);
            screenContent.style.visibility = showScreen ? "visible" : "collapse";
        }
        if (configContent) {
            configContent.SetHasClass("TabActive", showConfig);
            configContent.style.visibility = showConfig ? "visible" : "collapse";
        }
        if (debugContent) {
            debugContent.SetHasClass("TabActive", showDebug);
            debugContent.style.visibility = showDebug ? "visible" : "collapse";
        }

        setActiveObjectsTab(activeObjectsTab);
        if (showConfig) {
            refreshConfigExportEntry();
        }
        scheduleSettingsSave();
    }

    function toggleControlsPanel() {
        var panel = $("#minimap_settings_inner");
        if (!panel) {
            $.Msg("[minimap_overlay] #minimap_settings_inner not found");
            return;
        }

        setSettingsPanelOpenState(!settingsPanelOpen);
    }

    function setSettingsPanelOpenState(isOpen) {
        var panel = $("#minimap_settings_inner");
        if (!panel) {
            return;
        }
        var dragButton = $("#" + DRAG_HANDLE_BUTTON_ID);

        settingsPanelOpen = !!isOpen;
        settingsPanelAnimToken++;
        var localToken = settingsPanelAnimToken;

        if (settingsPanelOpen) {
            panel.style.visibility = "visible";
            panel.SetHasClass("Hidden", false);
            panel.hittest = true;
            panel.hittestchildren = true;
            if (dragButton) {
                dragButton.style.visibility = "visible";
                dragButton.hittest = true;
            }
            setSettingsToggleLabel(true);
            return;
        }

        panel.SetHasClass("Hidden", true);
        panel.hittest = false;
        panel.hittestchildren = false;
        if (dragButton) {
            dragButton.style.visibility = "collapse";
            dragButton.hittest = false;
        }
        setSettingsToggleLabel(false);

        $.Schedule(SETTINGS_PANEL_CLOSE_DELAY_SEC, function () {
            if (localToken !== settingsPanelAnimToken || settingsPanelOpen) {
                return;
            }

            panel.style.visibility = "collapse";
        });
    }

    function getSliderControlById(id) {
        var panel = $("#" + id);
        if (!panel) {
            return null;
        }

        if (typeof panel.value !== "undefined") {
            return panel;
        }

        if (typeof panel.FindChildTraverse === "function") {
            var nestedSlider = panel.FindChildTraverse("Slider");
            if (nestedSlider) {
                return nestedSlider;
            }
        }

        return null;
    }

    function setSliderEntryTextByPanelId(panelId, textValue) {
        var sliderPanel = $("#" + panelId);
        if (!sliderPanel || typeof sliderPanel.FindChildTraverse !== "function") {
            return;
        }

        var valueEntry = sliderPanel.FindChildTraverse("Value");
        if (!valueEntry || typeof valueEntry.text === "undefined") {
            return;
        }

        valueEntry.text = String(textValue);
    }

    function normalizeOpacity(value) {
        return Math.max(0.01, Math.min(1.00, Math.round(value * 100) / 100));
    }

    function sliderUnitsToCratePx(unitsValue) {
        return Math.round(unitsValue);
    }

    function cratePxToSliderUnits(pxValue) {
        return pxValue;
    }

    function setSettingsToggleLabel(isOpen) {
        for (var i = 0; i < SETTINGS_TOGGLE_LABEL_IDS.length; i++) {
            var label = $("#" + SETTINGS_TOGGLE_LABEL_IDS[i]);
            if (label) {
                label.text = isOpen ? "Close" : "Settings";
            }
        }
    }

    function clampNumber(value, minValue, maxValue, fallback) {
        if (typeof value !== "number" || isNaN(value)) {
            return fallback;
        }

        return Math.max(minValue, Math.min(maxValue, value));
    }

    function normalizeSectionName(sectionName) {
        if (sectionName === "map" || sectionName === "screen" || sectionName === "config" || sectionName === "debug") {
            return sectionName;
        }

        return "objects";
    }

    function normalizeObjectsTabName(tabName) {
        if (tabName === "tunnels") {
            return "tunnels";
        }

        return "crates";
    }

    function findRootPanel() {
        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;

        while (panel && typeof panel.GetParent === "function") {
            var parent = panel.GetParent();
            if (!parent) {
                break;
            }
            panel = parent;
        }

        return panel;
    }

    function readSettingsRawFromAttributes() {
        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;
        var root = findRootPanel();
        var hud = null;
        var panelRaw = "";
        var rootRaw = "";
        var hudRaw = "";
        var panelRev = 0;
        var rootRev = 0;
        var hudRev = 0;

        function parseRev(textValue) {
            var n = Number(textValue);
            if (!isFinite(n) || n < 0) {
                return 0;
            }
            return Math.floor(n);
        }

        if (root && typeof root.FindChildTraverse === "function") {
            try {
                hud = root.FindChildTraverse("Hud");
            } catch (eHud) {
                hud = null;
            }
        }

        if (panel && typeof panel.GetAttributeString === "function") {
            try {
                panelRaw = String(panel.GetAttributeString(SETTINGS_STORAGE_ATTR_KEY, "") || "");
            } catch (ePanelRead) {
                panelRaw = "";
            }
            try {
                panelRev = parseRev(panel.GetAttributeString(SETTINGS_STORAGE_REV_ATTR_KEY, "0"));
            } catch (ePanelRev) {
                panelRev = 0;
            }
        }

        if (root && typeof root.GetAttributeString === "function") {
            try {
                rootRaw = String(root.GetAttributeString(SETTINGS_STORAGE_ATTR_KEY, "") || "");
            } catch (eRootRead) {
                rootRaw = "";
            }
            try {
                rootRev = parseRev(root.GetAttributeString(SETTINGS_STORAGE_REV_ATTR_KEY, "0"));
            } catch (eRootRev) {
                rootRev = 0;
            }
        }

        if (hud && typeof hud.GetAttributeString === "function") {
            try {
                hudRaw = String(hud.GetAttributeString(SETTINGS_STORAGE_ATTR_KEY, "") || "");
            } catch (eHudRead) {
                hudRaw = "";
            }
            try {
                hudRev = parseRev(hud.GetAttributeString(SETTINGS_STORAGE_REV_ATTR_KEY, "0"));
            } catch (eHudRev) {
                hudRev = 0;
            }
        }

        settingsAttrRevision = Math.max(settingsAttrRevision, panelRev, rootRev, hudRev);

        var chosenRaw = "";
        var chosenRev = -1;
        var candidates = [
            { raw: panelRaw, rev: panelRev, name: "panel" },
            { raw: rootRaw, rev: rootRev, name: "root" },
            { raw: hudRaw, rev: hudRev, name: "hud" }
        ];

        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (!c.raw) {
                continue;
            }
            if (c.rev > chosenRev) {
                chosenRaw = c.raw;
                chosenRev = c.rev;
            }
        }

        // Legacy fallback when revisions are absent but some raw still exists.
        if (!chosenRaw) {
            chosenRaw = panelRaw || rootRaw || hudRaw || "";
        }

        if (!chosenRaw) {
            return "";
        }

        if (panel && typeof panel.SetAttributeString === "function" && panelRaw !== chosenRaw) {
            try {
                panel.SetAttributeString(SETTINGS_STORAGE_ATTR_KEY, chosenRaw);
                panel.SetAttributeString(SETTINGS_STORAGE_REV_ATTR_KEY, String(settingsAttrRevision));
            } catch (ePanelSync) {}
        }

        return chosenRaw;
    }

    function writeSettingsRawToAttributes(raw) {
        if (!raw || raw.length <= 0) {
            return;
        }

        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;
        var root = findRootPanel();
        var hud = null;

        if (root && typeof root.FindChildTraverse === "function") {
            try {
                hud = root.FindChildTraverse("Hud");
            } catch (eHud) {
                hud = null;
            }
        }

        settingsAttrRevision = Math.max(0, settingsAttrRevision) + 1;
        var revText = String(settingsAttrRevision);

        if (panel && typeof panel.SetAttributeString === "function") {
            try {
                panel.SetAttributeString(SETTINGS_STORAGE_ATTR_KEY, raw);
                panel.SetAttributeString(SETTINGS_STORAGE_REV_ATTR_KEY, revText);
            } catch (ePanelWrite) {}
        }

        if (root && typeof root.SetAttributeString === "function") {
            try {
                root.SetAttributeString(SETTINGS_STORAGE_ATTR_KEY, raw);
                root.SetAttributeString(SETTINGS_STORAGE_REV_ATTR_KEY, revText);
            } catch (eRootWrite) {}
        }

        if (hud && typeof hud.SetAttributeString === "function") {
            try {
                hud.SetAttributeString(SETTINGS_STORAGE_ATTR_KEY, raw);
                hud.SetAttributeString(SETTINGS_STORAGE_REV_ATTR_KEY, revText);
            } catch (eHudWrite) {}
        }
    }

    function setAttrOnPersistencePanels(attrName, valueText) {
        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;
        var root = findRootPanel();
        var hud = null;

        if (root && typeof root.FindChildTraverse === "function") {
            try {
                hud = root.FindChildTraverse("Hud");
            } catch (eHud) {
                hud = null;
            }
        }

        if (panel && typeof panel.SetAttributeString === "function") {
            try { panel.SetAttributeString(attrName, valueText); } catch (eP0) {}
        }
        if (root && typeof root.SetAttributeString === "function") {
            try { root.SetAttributeString(attrName, valueText); } catch (eR0) {}
        }
        if (hud && typeof hud.SetAttributeString === "function") {
            try { hud.SetAttributeString(attrName, valueText); } catch (eH0) {}
        }
    }

    function getAttrFromPersistencePanels(attrName) {
        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;
        var root = findRootPanel();
        var hud = null;
        var panelVal = "";
        var rootVal = "";
        var hudVal = "";

        if (root && typeof root.FindChildTraverse === "function") {
            try {
                hud = root.FindChildTraverse("Hud");
            } catch (eHud) {
                hud = null;
            }
        }

        if (panel && typeof panel.GetAttributeString === "function") {
            try { panelVal = String(panel.GetAttributeString(attrName, "") || ""); } catch (eP1) { panelVal = ""; }
        }
        if (root && typeof root.GetAttributeString === "function") {
            try { rootVal = String(root.GetAttributeString(attrName, "") || ""); } catch (eR1) { rootVal = ""; }
        }
        if (hud && typeof hud.GetAttributeString === "function") {
            try { hudVal = String(hud.GetAttributeString(attrName, "") || ""); } catch (eH1) { hudVal = ""; }
        }

        return panelVal || rootVal || hudVal || "";
    }

    function createStorageApiAdapter(storageObj, getMethodName, setMethodName, debugName) {
        if (!storageObj) {
            return null;
        }

        var getter = storageObj[getMethodName];
        var setter = storageObj[setMethodName];

        if (typeof getter !== "function" || typeof setter !== "function") {
            return null;
        }

        return {
            debugName: debugName,
            get: function (key) {
                return getter.call(storageObj, key);
            },
            set: function (key, value) {
                setter.call(storageObj, key, value);
                return true;
            }
        };
    }

    function invokeStorageMethod(storageObj, methodNames, args) {
        if (!storageObj || !methodNames || !methodNames.length) {
            return { ok: false, value: null };
        }

        for (var i = 0; i < methodNames.length; i++) {
            var method = storageObj[methodNames[i]];
            if (typeof method !== "function") {
                continue;
            }

            try {
                return { ok: true, value: method.apply(storageObj, args) };
            } catch (e) {
                // continue trying compatible signatures
            }
        }

        return { ok: false, value: null };
    }

    function createStorageApiAdapterByNames(storageObj, getMethodNames, setMethodNames, flushMethodNames, debugName) {
        if (!storageObj) {
            return null;
        }

        return {
            debugName: debugName,
            get: function (key) {
                var read = invokeStorageMethod(storageObj, getMethodNames, [key]);
                return read.ok ? read.value : null;
            },
            set: function (key, value) {
                var write = invokeStorageMethod(storageObj, setMethodNames, [key, value]);
                if (!write.ok) {
                    // Some APIs accept only string payloads explicitly.
                    write = invokeStorageMethod(storageObj, setMethodNames, [key, String(value)]);
                }

                if (flushMethodNames && flushMethodNames.length) {
                    invokeStorageMethod(storageObj, flushMethodNames, []);
                }

                return write.ok;
            }
        };
    }

    function pushStorageApiIfValid(targetList, adapter) {
        if (!adapter) {
            return;
        }

        for (var i = 0; i < targetList.length; i++) {
            if (targetList[i].debugName === adapter.debugName) {
                return;
            }
        }

        targetList.push(adapter);
    }

    function getGlobalScopeObject() {
        try {
            return Function("return this")();
        } catch (e0) {
            return null;
        }
    }

    function getObjectByPath(path) {
        if (!path || typeof path !== "string") {
            return null;
        }

        var globalScope = getGlobalScopeObject();
        if (!globalScope) {
            return null;
        }

        var parts = path.split(".");
        var current = globalScope;
        for (var i = 0; i < parts.length; i++) {
            var key = parts[i];
            if (!current || typeof current[key] === "undefined" || current[key] === null) {
                return null;
            }

            current = current[key];
        }

        return current;
    }

    function registerStorageCandidatesFromObject(targetList, storageObj, debugPrefix) {
        if (!storageObj || typeof storageObj !== "object") {
            return;
        }

        pushStorageApiIfValid(targetList,
            createStorageApiAdapter(storageObj, "getItem", "setItem", debugPrefix + ".getItem/setItem"));
        pushStorageApiIfValid(targetList,
            createStorageApiAdapter(storageObj, "GetItem", "SetItem", debugPrefix + ".GetItem/SetItem"));
        pushStorageApiIfValid(targetList,
            createStorageApiAdapter(storageObj, "LoadString", "SaveString", debugPrefix + ".LoadString/SaveString"));
        pushStorageApiIfValid(targetList,
            createStorageApiAdapter(storageObj, "GetString", "SetString", debugPrefix + ".GetString/SetString"));
        pushStorageApiIfValid(targetList,
            createStorageApiAdapterByNames(
                storageObj,
                ["GetString", "getString", "LoadString", "GetItem", "getItem", "Get", "Load"],
                ["SetString", "setString", "SaveString", "SetItem", "setItem", "Set", "Save"],
                ["Save", "Flush", "Commit", "Apply"],
                debugPrefix + ".compat"
            ));
    }

    function registerStorageCandidatesFromCustomConfig(targetList) {
        if (typeof GameUI === "undefined" || !GameUI || typeof GameUI.CustomUIConfig !== "function") {
            return;
        }

        var config = null;
        try {
            config = GameUI.CustomUIConfig();
        } catch (eConfig) {
            config = null;
        }

        if (!config || typeof config !== "object") {
            return;
        }

        var keys = [
            "PersistentStorage",
            "persistentStorage",
            "LocalStorage",
            "localStorage",
            "Storage",
            "storage",
            "GameInterfaceAPI",
            "SettingsAPI",
            "SettingsStorage"
        ];

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var candidate = null;
            try {
                candidate = config[key];
            } catch (eKey) {
                candidate = null;
            }

            if (!candidate) {
                continue;
            }

            registerStorageCandidatesFromObject(targetList, candidate, "GameUI.CustomUIConfig." + key);
        }
    }

    function resolveSettingsStorageApis() {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (settingsStorageResolved && settingsStorageApis.length > 0) {
            return settingsStorageApis;
        }

        if (settingsStorageResolved &&
            settingsStorageApis.length <= 0 &&
            (nowMs - settingsStorageLastResolveMs) < SETTINGS_STORAGE_RESCAN_INTERVAL_MS) {
            return settingsStorageApis;
        }

        settingsStorageResolved = true;
        settingsStorageLastResolveMs = nowMs;
        settingsStorageApis = [];
        var discoveredSources = [];

        // Preferred Panorama persistent store.
        if ($.persistentStorage) {
            discoveredSources.push("$.persistentStorage");
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapter($.persistentStorage, "getItem", "setItem", "$.persistentStorage.getItem/setItem"));
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapter($.persistentStorage, "GetItem", "SetItem", "$.persistentStorage.GetItem/SetItem"));
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapterByNames(
                    $.persistentStorage,
                    ["GetString", "getString", "LoadString"],
                    ["SetString", "setString", "SaveString"],
                    ["Save", "Flush"],
                    "$.persistentStorage.string"
                ));
        }

        // Some Source2 environments expose LocalStorage helpers.
        if ($.LocalStorage) {
            discoveredSources.push("$.LocalStorage");
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapter($.LocalStorage, "getItem", "setItem", "$.LocalStorage.getItem/setItem"));
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapter($.LocalStorage, "GetItem", "SetItem", "$.LocalStorage.GetItem/SetItem"));
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapterByNames(
                    $.LocalStorage,
                    ["GetString", "getString", "LoadString"],
                    ["SetString", "setString", "SaveString"],
                    ["Save", "Flush"],
                    "$.LocalStorage.string"
                ));
        }

        // Engine API fallback.
        if (typeof GameInterfaceAPI !== "undefined") {
            discoveredSources.push("GameInterfaceAPI");
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapter(GameInterfaceAPI, "GetSettingString", "SetSettingString", "GameInterfaceAPI.GetSettingString/SetSettingString"));
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapter(GameInterfaceAPI, "GetSetting", "SetSetting", "GameInterfaceAPI.GetSetting/SetSetting"));
            pushStorageApiIfValid(settingsStorageApis,
                createStorageApiAdapterByNames(
                    GameInterfaceAPI,
                    [
                        "GetSettingString",
                        "GetSetting",
                        "GetUserSettingString",
                        "GetOptionString",
                        "GetSettingInt",
                        "GetSettingFloat",
                        "GetSettingBool",
                        "GetConvarString",
                        "GetConVarString"
                    ],
                    [
                        "SetSettingString",
                        "SetSetting",
                        "SetUserSettingString",
                        "SetOptionString",
                        "SetSettingInt",
                        "SetSettingFloat",
                        "SetSettingBool",
                        "SetConvarString",
                        "SetConVarString"
                    ],
                    ["SaveSettings", "SaveSettingChanges", "ApplySettings", "SaveConfig"],
                    "GameInterfaceAPI.compat"
                ));
        }

        // Additional global candidates (some game builds expose these under different names).
        var globalCandidatePaths = [
            "PersistentStorage",
            "persistentStorage",
            "LocalStorage",
            "localStorage",
            "StorageAPI",
            "SettingsStorage",
            "SettingsAPI",
            "GameSettingsAPI",
            "GameUIAPI",
            "$.PersistentStorage",
            "$.localStorage"
        ];

        for (var c = 0; c < globalCandidatePaths.length; c++) {
            var path = globalCandidatePaths[c];
            var candidateObj = getObjectByPath(path);
            if (!candidateObj) {
                continue;
            }

            discoveredSources.push(path);
            registerStorageCandidatesFromObject(settingsStorageApis, candidateObj, path);
        }

        registerStorageCandidatesFromCustomConfig(settingsStorageApis);
        if (typeof GameUI !== "undefined" && GameUI && typeof GameUI.CustomUIConfig === "function") {
            discoveredSources.push("GameUI.CustomUIConfig");
        }

        settingsStorageApi = settingsStorageApis.length > 0 ? settingsStorageApis[0] : null;
        debugStorageDiscovery = "sources=" + (discoveredSources.length > 0 ? discoveredSources.join(",") : "none");

        if (!settingsStorageApi) {
            if (!settingsStorageUnavailableLogged) {
                $.Msg("[minimap_overlay] persistent settings API not available; using runtime/session attributes only");
                settingsStorageUnavailableLogged = true;
            }
        } else {
            $.Msg("[minimap_overlay] persistence backends discovered: " + settingsStorageApis.length);
            settingsStorageUnavailableLogged = false;
        }

        return settingsStorageApis;
    }

    function resolveSettingsStorageApi() {
        resolveSettingsStorageApis();
        return settingsStorageApi;
    }

    function getCurrentSettingsState() {
        return {
            version: SETTINGS_STORAGE_VERSION,
            showCrates: !!cratesOverlayEnabled,
            crateSizePx: Math.round(crateSizePx),
            crateOpacity: normalizeOpacity(crateOpacity),
            mapOpacity: normalizeOpacity(mapContainerOpacity),
            minimapScaleIndex: Math.round(smallMapScaleIndex),
            fsHudEnabled: !!useFullScreenHud,
            minimapOffsetRight: Math.round(minimapOffsetRight),
            minimapOffsetBottom: Math.round(minimapOffsetBottom),
            activeSection: normalizeSectionName(activeSettingsSection),
            activeObjectsTab: normalizeObjectsTabName(activeObjectsTab)
        };
    }

    function computeStateHash(state) {
        var text = JSON.stringify(state || {});
        var hash = 0;
        for (var i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash = hash | 0;
        }

        var unsignedHash = hash >>> 0;
        return unsignedHash.toString(16).toUpperCase();
    }

    function sectionToCode(sectionName) {
        if (sectionName === "map") {
            return "m";
        }
        if (sectionName === "screen") {
            return "s";
        }
        if (sectionName === "config") {
            return "c";
        }
        if (sectionName === "debug") {
            return "d";
        }
        return "o";
    }

    function sectionFromCode(code) {
        if (code === "m") {
            return "map";
        }
        if (code === "s") {
            return "screen";
        }
        if (code === "c") {
            return "config";
        }
        if (code === "d") {
            return "debug";
        }
        return "objects";
    }

    function tabToCode(tabName) {
        if (tabName === "tunnels") {
            return "t";
        }
        return "c";
    }

    function tabFromCode(code) {
        if (code === "t") {
            return "tunnels";
        }
        return "crates";
    }

    function formatOpacityPercent(opacityValue) {
        return String(Math.round(normalizeOpacity(opacityValue) * 100));
    }

    var BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    function encodeBase64UrlAscii(inputText) {
        var text = String(inputText || "");
        var out = "";
        var i = 0;
        while (i < text.length) {
            var c0 = text.charCodeAt(i++) & 255;
            var hasC1 = i < text.length;
            var c1 = hasC1 ? (text.charCodeAt(i++) & 255) : 0;
            var hasC2 = i < text.length;
            var c2 = hasC2 ? (text.charCodeAt(i++) & 255) : 0;

            var n = (c0 << 16) | (c1 << 8) | c2;
            var s0 = (n >>> 18) & 63;
            var s1 = (n >>> 12) & 63;
            var s2 = (n >>> 6) & 63;
            var s3 = n & 63;

            out += BASE64URL_ALPHABET.charAt(s0);
            out += BASE64URL_ALPHABET.charAt(s1);
            if (hasC1) {
                out += BASE64URL_ALPHABET.charAt(s2);
            }
            if (hasC2) {
                out += BASE64URL_ALPHABET.charAt(s3);
            }
        }
        return out;
    }

    function decodeBase64UrlAscii(inputText) {
        var text = String(inputText || "").replace(/[^A-Za-z0-9\-_]/g, "");
        if (!text) {
            return "";
        }

        var out = "";
        var i = 0;
        while (i < text.length) {
            var a = BASE64URL_ALPHABET.indexOf(text.charAt(i++));
            var b = BASE64URL_ALPHABET.indexOf(text.charAt(i++));
            var c = (i < text.length) ? BASE64URL_ALPHABET.indexOf(text.charAt(i++)) : -1;
            var d = (i < text.length) ? BASE64URL_ALPHABET.indexOf(text.charAt(i++)) : -1;

            if (a < 0 || b < 0) {
                return "";
            }

            var n = (a << 18) | (b << 12) | ((c >= 0 ? c : 0) << 6) | (d >= 0 ? d : 0);
            var o0 = (n >>> 16) & 255;
            var o1 = (n >>> 8) & 255;
            var o2 = n & 255;

            out += String.fromCharCode(o0);
            if (c >= 0) {
                out += String.fromCharCode(o1);
            }
            if (d >= 0) {
                out += String.fromCharCode(o2);
            }
        }

        return out;
    }

    function encodeCompactBridgeBodyFromState(state) {
        return [
            state.showCrates ? "1" : "0",
            String(Math.round(state.crateSizePx)),
            formatOpacityPercent(state.crateOpacity),
            formatOpacityPercent(state.mapOpacity),
            String(Math.round(state.minimapScaleIndex)),
            state.fsHudEnabled ? "1" : "0",
            String(Math.round(state.minimapOffsetRight)),
            String(Math.round(state.minimapOffsetBottom)),
            sectionToCode(normalizeSectionName(state.activeSection)),
            tabToCode(normalizeObjectsTabName(state.activeObjectsTab))
        ].join(",");
    }

    function decodeCompactBridgeBodyToState(bodyText) {
        if (!bodyText || typeof bodyText !== "string") {
            return null;
        }

        var parts = bodyText.split(",");
        if (parts.length < 10) {
            return null;
        }

        return {
            version: SETTINGS_STORAGE_VERSION,
            showCrates: String(parts[0]) === "1",
            crateSizePx: Number(parts[1]),
            crateOpacity: Number(parts[2]) / 100,
            mapOpacity: Number(parts[3]) / 100,
            minimapScaleIndex: Number(parts[4]),
            fsHudEnabled: String(parts[5]) === "1",
            minimapOffsetRight: Number(parts[6]),
            minimapOffsetBottom: Number(parts[7]),
            activeSection: sectionFromCode(String(parts[8] || "o")),
            activeObjectsTab: tabFromCode(String(parts[9] || "c"))
        };
    }

    function encodeBridgeTokenFromState(state) {
        var normalizedState = sanitizeSettingsState(state || getCurrentSettingsState());
        if (!normalizedState) {
            normalizedState = getCurrentSettingsState();
        }

        var compactBody = encodeCompactBridgeBodyFromState(normalizedState);
        var body = "v2." + encodeBase64UrlAscii(compactBody);
        var checksum = computeStateHash(normalizedState);
        return BRIDGE_TOKEN_PREFIX + body + "|h=" + checksum;
    }

    function decodeBridgeStateFromToken(tokenText) {
        if (!tokenText || typeof tokenText !== "string") {
            return null;
        }

        if (tokenText.indexOf(BRIDGE_TOKEN_PREFIX) !== 0) {
            return null;
        }

        var body = tokenText.substring(BRIDGE_TOKEN_PREFIX.length);
        var sepIndex = body.lastIndexOf("|h=");
        if (sepIndex <= 0) {
            return null;
        }

        var payloadPart = body.substring(0, sepIndex);
        var hashPart = body.substring(sepIndex + 3);
        var parsed = null;
        if (payloadPart.indexOf("v2.") === 0) {
            var decodedCompact = decodeBase64UrlAscii(payloadPart.substring(3));
            parsed = decodeCompactBridgeBodyToState(decodedCompact);
        } else {
            parsed = decodeCompactBridgeBodyToState(payloadPart);
            if (!parsed) {
                // Legacy compatibility with JSON-bodied tokens.
                try {
                    parsed = JSON.parse(payloadPart);
                } catch (e0) {
                    return null;
                }
            }
        }

        var sanitized = sanitizeSettingsState(parsed);
        if (!sanitized) {
            return null;
        }

        var actualHash = computeStateHash(sanitized);
        if (String(hashPart || "").toUpperCase() !== String(actualHash || "").toUpperCase()) {
            return null;
        }

        return sanitized;
    }

    function extractBridgeTokenFromText(rawText) {
        if (!rawText || typeof rawText !== "string") {
            return "";
        }

        var directMatch = String(rawText).match(BRIDGE_TOKEN_EXTRACT_REGEX);
        if (directMatch && directMatch[1]) {
            return String(directMatch[1]);
        }

        var normalized = String(rawText).replace(/\s+/g, "");
        if (!normalized) {
            return "";
        }

        var match = normalized.match(BRIDGE_TOKEN_EXTRACT_REGEX);
        if (!match || !match[1]) {
            return "";
        }

        return String(match[1]);
    }

    function setConfigStatusText(statusText) {
        var statusLabel = $("#minimap_config_status_value");
        if (!statusLabel || typeof statusLabel.text === "undefined") {
            return;
        }

        statusLabel.text = String(statusText || "Ready");
    }

    function readTextEntryValueById(id) {
        var entry = $("#" + id);
        if (!entry) {
            return "";
        }

        if (typeof entry.text !== "undefined" && entry.text !== null) {
            return String(entry.text);
        }

        if (typeof entry.GetAttributeString === "function") {
            try {
                return String(entry.GetAttributeString("text", "") || "");
            } catch (eReadAttr) {
                return "";
            }
        }

        return "";
    }

    function setTextEntryValueById(id, value) {
        var entry = $("#" + id);
        if (!entry) {
            return false;
        }

        var textValue = String(value || "");
        var wrote = false;
        try {
            if (typeof entry.text !== "undefined") {
                entry.text = textValue;
                wrote = true;
            }
        } catch (eSetText) {}

        if (!wrote && typeof entry.SetAttributeString === "function") {
            try {
                entry.SetAttributeString("text", textValue);
                wrote = true;
            } catch (eSetAttr) {}
        }

        return wrote;
    }

    function moveTextEntryCursorToStart(entry) {
        if (!entry) {
            return;
        }

        dispatchClipboardEvent("TextEntryMoveCursorToStart", entry);
        dispatchClipboardEvent("TextEntryMoveToStart", entry);
        dispatchClipboardEvent("TextEntryMoveToBeginningOfLine", entry);
        dispatchClipboardEvent("TextEntryHome", entry);
        dispatchClipboardEvent("TextEntrySelectNone", entry);
    }

    function dispatchClipboardEvent(eventName, arg0, arg1) {
        if (typeof $.DispatchEvent !== "function") {
            return false;
        }

        try {
            $.DispatchEvent(eventName, arg0, arg1);
            return true;
        } catch (eClipboardDispatch) {
            return false;
        }
    }

    function requestCopyToClipboard(textValue, sourceEntry) {
        var text = String(textValue || "");
        if (!text) {
            return false;
        }

        function tryDispatch(eventName, arg0, arg1) {
            if (typeof $.DispatchEvent === "function") {
                try {
                    $.DispatchEvent(eventName, arg0, arg1);
                    return true;
                } catch (eDispatch0) {}
            }
            if (typeof $.DispatchEventAsync === "function") {
                try {
                    $.DispatchEventAsync(0, eventName, arg0, arg1);
                    return true;
                } catch (eDispatch1) {}
            }
            return false;
        }

        var copied = false;
        var attempts = [
            function () { if (!tryDispatch("CopyStringToClipboard", text)) { throw new Error("CopyStringToClipboard failed"); } },
            function () { if (!tryDispatch("CopyStringToClipboard", sourceEntry, text)) { throw new Error("CopyStringToClipboard(panel,text) failed"); } },
            function () { if (!tryDispatch("CopyToClipboard", text)) { throw new Error("CopyToClipboard failed"); } },
            function () { if (!tryDispatch("CopyToClipboard", sourceEntry, text)) { throw new Error("CopyToClipboard(panel,text) failed"); } },
            function () { if (!tryDispatch("SetClipboardText", text)) { throw new Error("SetClipboardText failed"); } },
            function () { if (!tryDispatch("SetClipboardText", sourceEntry, text)) { throw new Error("SetClipboardText(panel,text) failed"); } },
            function () {
                if (!sourceEntry) {
                    throw new Error("Missing TextEntry panel");
                }
                if (sourceEntry.IsValid && !sourceEntry.IsValid()) {
                    throw new Error("Invalid TextEntry panel");
                }
                sourceEntry.SetFocus();
                if (sourceEntry.SelectAll) {
                    sourceEntry.SelectAll();
                }
                if (!tryDispatch("TextEntryCopyToClipboard", sourceEntry)) {
                    throw new Error("TextEntryCopyToClipboard failed");
                }
            }
        ];

        for (var i = 0; i < attempts.length; i++) {
            try {
                attempts[i]();
                copied = true;
                break;
            } catch (eCopyAttempt) {}
        }

        return copied;
    }

    function requestPasteFromClipboard(targetEntry) {
        if (!targetEntry) {
            return false;
        }

        function tryDispatch(eventName, arg0, arg1) {
            if (typeof $.DispatchEvent === "function") {
                try {
                    $.DispatchEvent(eventName, arg0, arg1);
                    return true;
                } catch (eDispatch0) {}
            }
            if (typeof $.DispatchEventAsync === "function") {
                try {
                    $.DispatchEventAsync(0, eventName, arg0, arg1);
                    return true;
                } catch (eDispatch1) {}
            }
            return false;
        }

        if (targetEntry.SetFocus) {
            try {
                targetEntry.SetFocus();
            } catch (eSetFocus) {}
        }
        if (targetEntry.SelectAll) {
            try {
                targetEntry.SelectAll();
            } catch (eSelectAll) {}
        }

        var pasted = false;
        var attempts = [
            function () { if (!tryDispatch("TextEntryPasteFromClipboard", targetEntry)) { throw new Error("TextEntryPasteFromClipboard failed"); } },
            function () { if (!tryDispatch("TextEntryPasteClipboard", targetEntry)) { throw new Error("TextEntryPasteClipboard failed"); } },
            function () { if (!tryDispatch("TextEntryPaste", targetEntry)) { throw new Error("TextEntryPaste failed"); } },
            function () { if (!tryDispatch("UI_TextEntry_PasteClipboard", targetEntry)) { throw new Error("UI_TextEntry_PasteClipboard failed"); } },
            function () { if (!tryDispatch("PasteFromClipboard", targetEntry)) { throw new Error("PasteFromClipboard(panel) failed"); } },
            function () { if (!tryDispatch("PasteToTextEntry", targetEntry)) { throw new Error("PasteToTextEntry failed"); } },
            function () { if (!tryDispatch("PasteClipboard", targetEntry)) { throw new Error("PasteClipboard failed"); } },
            function () {
                if (targetEntry.Paste) {
                    targetEntry.Paste();
                    return;
                }
                throw new Error("Paste method unavailable");
            },
            function () { if (!tryDispatch("PasteFromClipboard")) { throw new Error("PasteFromClipboard() failed"); } }
        ];

        for (var i = 0; i < attempts.length; i++) {
            try {
                attempts[i]();
                pasted = true;
                break;
            } catch (ePasteAttempt) {}
        }

        return pasted;
    }

    function tryReadClipboardTextDirect() {
        var text = "";

        try {
            if (typeof $ !== "undefined" && $ && typeof $.GetClipboardText === "function") {
                text = String($.GetClipboardText() || "");
                if (text) {
                    return text;
                }
            }
        } catch (e0) {}

        try {
            if (typeof $ !== "undefined" && $ && $.Clipboard) {
                if (typeof $.Clipboard.GetText === "function") {
                    text = String($.Clipboard.GetText() || "");
                    if (text) {
                        return text;
                    }
                }
                if (typeof $.Clipboard.GetClipboardText === "function") {
                    text = String($.Clipboard.GetClipboardText() || "");
                    if (text) {
                        return text;
                    }
                }
            }
        } catch (e1) {}

        try {
            if (typeof GameUI !== "undefined" && GameUI) {
                if (typeof GameUI.GetClipboardText === "function") {
                    text = String(GameUI.GetClipboardText() || "");
                    if (text) {
                        return text;
                    }
                }
            }
        } catch (e2) {}

        try {
            if (typeof GameInterfaceAPI !== "undefined" && GameInterfaceAPI) {
                if (typeof GameInterfaceAPI.GetClipboardText === "function") {
                    text = String(GameInterfaceAPI.GetClipboardText() || "");
                    if (text) {
                        return text;
                    }
                }
                if (typeof GameInterfaceAPI.ReadClipboardText === "function") {
                    text = String(GameInterfaceAPI.ReadClipboardText() || "");
                    if (text) {
                        return text;
                    }
                }
            }
        } catch (e3) {}

        return "";
    }

    function refreshConfigExportEntry() {
        var state = getCurrentSettingsState();
        var token = encodeBridgeTokenFromState(state);
        setTextEntryValueById("minimap_config_export_entry", token);
        moveTextEntryCursorToStart($("#minimap_config_export_entry"));
        setConfigStatusText("Export token refreshed.");
        return token;
    }

    function applyConfigTokenFromEntry() {
        var importRaw = readTextEntryValueById("minimap_config_import_entry");
        var token = extractBridgeTokenFromText(importRaw);
        if (!token) {
            setConfigStatusText("Import failed: token not found.");
            return false;
        }

        var parsed = decodeBridgeStateFromToken(token);
        if (!parsed) {
            setConfigStatusText("Import failed: invalid token.");
            return false;
        }

        if (!applyPersistedSettingsState(parsed)) {
            setConfigStatusText("Import failed: token payload rejected.");
            return false;
        }

        applyAllSettingsToUi();
        scheduleSettingsSave();
        refreshConfigExportEntry();
        setConfigStatusText("Config applied from token.");
        return true;
    }

    function bindConfigControls() {
        bindButton("minimap_config_refresh_button", function () {
            refreshConfigExportEntry();
        });

        bindButton("minimap_config_copy_button", function () {
            var exportEntry = $("#minimap_config_export_entry");
            var token = readTextEntryValueById("minimap_config_export_entry");
            if (!token) {
                token = refreshConfigExportEntry();
            }
            configClipboardMirror = token;

            var copied = requestCopyToClipboard(token, exportEntry);
            if (copied) {
                setConfigStatusText("Token copied to clipboard.");
            } else {
                setConfigStatusText("System clipboard is unavailable. Token copied to internal buffer.");
            }
        });

        bindButton("minimap_config_paste_button", function () {
            var importEntry = $("#minimap_config_import_entry");
            if (!importEntry) {
                setConfigStatusText("Import field is unavailable.");
                return;
            }

            var pasted = requestPasteFromClipboard(importEntry);
            if (pasted) {
                setConfigStatusText("Paste requested. Waiting for clipboard...");
            }

            $.Schedule(0.05, function () {
                var importText = readTextEntryValueById("minimap_config_import_entry");
                if (importText && importText.length > 0) {
                    setConfigStatusText("Token pasted from clipboard.");
                    return;
                }

                var directClipboardText = tryReadClipboardTextDirect();
                if (directClipboardText && directClipboardText.length > 0) {
                    setTextEntryValueById("minimap_config_import_entry", directClipboardText);
                    moveTextEntryCursorToStart($("#minimap_config_import_entry"));
                    setConfigStatusText("Token pasted via direct clipboard API.");
                    return;
                }

                if (configClipboardMirror && configClipboardMirror.length > 0) {
                    setTextEntryValueById("minimap_config_import_entry", configClipboardMirror);
                    moveTextEntryCursorToStart($("#minimap_config_import_entry"));
                    setConfigStatusText("Token pasted from internal copy buffer.");
                    return;
                }

                if (pasted) {
                    setConfigStatusText("Paste event sent, but clipboard text was not accessible.");
                } else {
                    setConfigStatusText("Clipboard API is unavailable in this runtime. Paste token manually.");
                }
            });
        });

        bindButton("minimap_config_apply_button", function () {
            applyConfigTokenFromEntry();
        });

        refreshConfigExportEntry();
    }

    function isPanelObject(panel) {
        return !!(panel && typeof panel === "object");
    }

    function readPanelTextMaybe(panel) {
        if (!isPanelObject(panel)) {
            return "";
        }

        var textValue = "";
        try {
            if (typeof panel.text !== "undefined" && panel.text !== null) {
                textValue = String(panel.text);
            }
        } catch (eText) {
            textValue = "";
        }

        if (textValue && textValue.length > 0) {
            return textValue;
        }

        if (typeof panel.GetAttributeString === "function") {
            try {
                textValue = String(panel.GetAttributeString("text", "") || "");
            } catch (eAttr) {
                textValue = "";
            }
        }

        return textValue || "";
    }

    function collectBuildUiRoots() {
        var roots = [];
        var root = findRootPanel();
        if (!root || typeof root.FindChildTraverse !== "function") {
            return roots;
        }

        function pushUnique(panel) {
            if (!isPanelObject(panel)) {
                return;
            }
            for (var i = 0; i < roots.length; i++) {
                if (roots[i] === panel) {
                    return;
                }
            }
            roots.push(panel);
        }

        pushUnique(root.FindChildTraverse("Hud"));
        pushUnique(root);
        return roots;
    }

    function tryFindBridgeTokenInBuildUi() {
        var roots = collectBuildUiRoots();
        if (!roots || roots.length <= 0) {
            return "";
        }

        var stack = [];
        for (var r = 0; r < roots.length; r++) {
            stack.push(roots[r]);
        }

        var scanned = 0;
        while (stack.length > 0 && scanned < BRIDGE_BUILD_SCAN_MAX_PANELS) {
            var panel = stack.pop();
            if (!isPanelObject(panel)) {
                continue;
            }

            scanned++;
            var directText = readPanelTextMaybe(panel);
            var token = extractBridgeTokenFromText(directText);
            if (token) {
                return token;
            }

            var childCount = 0;
            try {
                childCount = panel.GetChildCount ? panel.GetChildCount() : 0;
            } catch (eChildCount) {
                childCount = 0;
            }

            for (var i = 0; i < childCount; i++) {
                var child = null;
                try {
                    child = panel.GetChild(i);
                } catch (eChild) {
                    child = null;
                }

                if (isPanelObject(child)) {
                    stack.push(child);
                }
            }
        }

        return "";
    }

    function setTextEntryValue(entryPanel, valueText) {
        if (!isPanelObject(entryPanel)) {
            return false;
        }

        var ok = false;
        try {
            entryPanel.text = String(valueText);
            ok = true;
        } catch (eTextSet) {}

        try {
            if (typeof entryPanel.SetAttributeString === "function") {
                entryPanel.SetAttributeString("text", String(valueText));
                ok = true;
            }
        } catch (eAttrSet) {}

        try {
            $.DispatchEvent("TextEntryChanged", entryPanel);
        } catch (eDispatch) {}

        return ok;
    }

    function activatePanelSafe(panel) {
        if (!isPanelObject(panel)) {
            return false;
        }

        try {
            if (typeof panel.Activate === "function") {
                panel.Activate();
                return true;
            }
        } catch (eActivate) {}

        try {
            $.DispatchEvent("Activated", panel, "mouse");
            return true;
        } catch (eDispatch) {}

        return false;
    }

    function tryWriteBridgeTokenToBuildUi(tokenText) {
        return { ok: false, message: "build-bridge-disabled" };
    }

    function tryNudgeBuildUiForPayloadScan() {
        return false;
    }

    function tryLoadStateFromBuildUiPayload() {
        var token = tryFindBridgeTokenInBuildUi();
        if (!token) {
            return false;
        }

        var parsed = decodeBridgeStateFromToken(token);
        if (!parsed) {
            debugBridgeStatus = "build-payload-found-invalid";
            return false;
        }

        if (!applyPersistedSettingsState(parsed)) {
            debugBridgeStatus = "build-payload-apply-failed";
            return false;
        }

        // Mirror into runtime attrs for immediate visibility/debug parity.
        try {
            writeSettingsRawToAttributes(JSON.stringify(getCurrentSettingsState()));
        } catch (eMirror) {}
        setAttrOnPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR, token);
        debugBridgeStatus = "loaded-from-build-ui";
        return true;
    }

    function queueBridgeSaveFromCurrentState() {
        var state = getCurrentSettingsState();
        var token = encodeBridgeTokenFromState(state);
        var reqToken = String(Date.now ? Date.now() : (new Date()).getTime());
        setAttrOnPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR, token);
        setAttrOnPersistencePanels(BRIDGE_REQUEST_TOKEN_ATTR, reqToken);
        setAttrOnPersistencePanels(BRIDGE_REQUEST_STATE_ATTR, "pending");
        setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "queued");
        bridgeRequestActive = true;
        bridgeRequestToken = reqToken;
        bridgeRequestStartedMs = Date.now ? Date.now() : (new Date()).getTime();
        debugBridgeStatus = "queued len=" + token.length + " token=" + reqToken;
        return token;
    }

    function tryLoadStateFromBridgePayload() {
        var token = getAttrFromPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR);
        if (!token) {
            return false;
        }

        var parsed = decodeBridgeStateFromToken(token);
        if (!parsed) {
            debugBridgeStatus = "decode-failed";
            return false;
        }

        if (!applyPersistedSettingsState(parsed)) {
            debugBridgeStatus = "apply-failed";
            return false;
        }

        debugBridgeStatus = "loaded-from-bridge";
        return true;
    }

    function tryProcessBridgeRequestLocally() {
        var state = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_STATE_ATTR) || "");
        var payload = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR) || "");
        var token = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_TOKEN_ATTR) || "");
        if (state !== "pending" || !payload || !token) {
            return false;
        }

        var api = resolveSettingsStorageApi();
        if (!api) {
            // No local persistent backend in this context.
            // Keep request pending for external bridge processor script.
            return false;
        }

        var writeOk = false;
        try {
            writeOk = !!api.set(SETTINGS_STORAGE_RAW_FALLBACK_KEY, payload);
        } catch (eWritePayload) {
            writeOk = false;
        }

        if (!writeOk) {
            setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "local-write-failed");
            setAttrOnPersistencePanels(BRIDGE_REQUEST_STATE_ATTR, "failed");
            debugBridgeStatus = "bridge failed msg=local-write-failed";
            return true;
        }

        try {
            api.set(SETTINGS_STORAGE_KEY, payload);
        } catch (eWriteMain) {}

        setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "local-write-ok");
        setAttrOnPersistencePanels(BRIDGE_REQUEST_STATE_ATTR, "success");
        debugBridgeStatus = "bridge success msg=local-write-ok";
        return true;
    }

    function pollBuildPayloadLoadLoop() {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (bridgeBuildScanStartedMs <= 0) {
            bridgeBuildScanStartedMs = nowMs;
        }

        var elapsedMs = nowMs - bridgeBuildScanStartedMs;
        if (elapsedMs > Math.floor(BRIDGE_BUILD_SCAN_TTL_SEC * 1000)) {
            return;
        }

        if (debugLastLoadSource === "none") {
            if (tryLoadStateFromBridgePayload()) {
                debugLastLoadSource = "bridge-payload-attr";
                applyAllSettingsToUi();
                updatePersistenceDebugView();
            }
        }

        $.Schedule(BRIDGE_BUILD_SCAN_INTERVAL_SEC, pollBuildPayloadLoadLoop);
    }

    function pollBridgeRequestLoop() {
        tryProcessBridgeRequestLocally();

        if (!bridgeRequestActive) {
            $.Schedule(0.2, pollBridgeRequestLoop);
            return;
        }

        var state = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_STATE_ATTR) || "");
        var msg = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_MSG_ATTR) || "");
        var token = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_TOKEN_ATTR) || "");
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var elapsedMs = nowMs - bridgeRequestStartedMs;

        if (token !== bridgeRequestToken) {
            debugBridgeStatus = "bridge token mismatch current=" + token + " expected=" + bridgeRequestToken;
            bridgeRequestActive = false;
            updatePersistenceDebugView();
            $.Schedule(0.2, pollBridgeRequestLoop);
            return;
        }

        if (state === "success") {
            debugBridgeStatus = "bridge success msg=" + (msg || "-");
            debugLastSaveStatus = debugLastSaveStatus + " | bridge:success";
            bridgeRequestActive = false;
            updatePersistenceDebugView();
            $.Schedule(0.2, pollBridgeRequestLoop);
            return;
        }

        if (state === "failed") {
            debugBridgeStatus = "bridge failed msg=" + (msg || "-");
            debugLastSaveStatus = debugLastSaveStatus + " | bridge:failed";
            bridgeRequestActive = false;
            updatePersistenceDebugView();
            $.Schedule(0.2, pollBridgeRequestLoop);
            return;
        }

        if (elapsedMs > BRIDGE_REQUEST_TIMEOUT_MS) {
            debugBridgeStatus = "bridge timeout state=" + (state || "-") + " msg=" + (msg || "-");
            debugLastSaveStatus = debugLastSaveStatus + " | bridge:timeout";
            bridgeRequestActive = false;
            updatePersistenceDebugView();
            $.Schedule(0.2, pollBridgeRequestLoop);
            return;
        }

        if (state === "pending" && (msg === "build-ui-save-clicked" || msg === "queued")) {
            tryNudgeBuildUiForPayloadScan();
        }

        debugBridgeStatus = "bridge pending state=" + (state || "-") + " elapsed=" + Math.floor(elapsedMs) + "ms";
        updatePersistenceDebugView();
        $.Schedule(0.2, pollBridgeRequestLoop);
    }

    function setDebugLabelText(id, text) {
        var label = $("#" + id);
        if (!label || typeof label.text === "undefined") {
            return;
        }

        label.text = String(text || "n/a");
    }

    function updatePersistenceDebugView() {
        var state = getCurrentSettingsState();
        debugLastStateHash = computeStateHash(state);
        collectPersistenceDebugInfo();
        setDebugLabelText("minimap_debug_load_source_value", debugLastLoadSource);
        setDebugLabelText("minimap_debug_save_status_value", debugLastSaveStatus);
        setDebugLabelText("minimap_debug_state_hash_value", debugLastStateHash);
        setDebugLabelText("minimap_debug_backend_summary_value", debugBackendSummary);
        setDebugLabelText("minimap_debug_raw_lengths_value", debugRawLengths);
        setDebugLabelText("minimap_debug_bridge_status_value", debugBridgeStatus);
    }

    function collectPersistenceDebugInfo() {
        var hasPersistent = !!($.persistentStorage && typeof $.persistentStorage.getItem === "function" && typeof $.persistentStorage.setItem === "function");
        var hasLocalStorage = !!($.LocalStorage && (typeof $.LocalStorage.getItem === "function" || typeof $.LocalStorage.GetItem === "function"));
        var gameApi = (typeof GameInterfaceAPI !== "undefined" && GameInterfaceAPI) ? GameInterfaceAPI : null;
        var hasGameSettings = !!(gameApi && (
            typeof gameApi.GetSettingString === "function" ||
            typeof gameApi.GetSetting === "function" ||
            typeof gameApi.GetSettingInt === "function" ||
            typeof gameApi.GetSettingFloat === "function" ||
            typeof gameApi.GetSettingBool === "function"
        ));

        var attrRaw = readSettingsRawFromAttributes() || "";
        var persistentRaw = "";
        if (hasPersistent) {
            try {
                persistentRaw = String($.persistentStorage.getItem(SETTINGS_STORAGE_RAW_FALLBACK_KEY) || "");
            } catch (ePersistentRead) {
                persistentRaw = "";
            }
        }

        var gameRaw = "";
        if (hasGameSettings) {
            try {
                if (gameApi && typeof gameApi.GetSettingString === "function") {
                    gameRaw = String(gameApi.GetSettingString(SETTINGS_STORAGE_KEY) || "");
                } else if (gameApi && typeof gameApi.GetSetting === "function") {
                    gameRaw = String(gameApi.GetSetting(SETTINGS_STORAGE_KEY) || "");
                }
            } catch (eGameRead) {
                gameRaw = "";
            }
        }

        var gameMethods = "";
        if (gameApi) {
            gameMethods =
                "gs:" + (typeof gameApi.GetSettingString === "function" ? "1" : "0") +
                " ss:" + (typeof gameApi.SetSettingString === "function" ? "1" : "0") +
                " g:" + (typeof gameApi.GetSetting === "function" ? "1" : "0") +
                " s:" + (typeof gameApi.SetSetting === "function" ? "1" : "0") +
                " gi:" + (typeof gameApi.GetSettingInt === "function" ? "1" : "0") +
                " si:" + (typeof gameApi.SetSettingInt === "function" ? "1" : "0");
        } else {
            gameMethods = "no-game-api";
        }

        debugBackendSummary =
            "p=" + (hasPersistent ? "1" : "0") +
            " l=" + (hasLocalStorage ? "1" : "0") +
            " g=" + (hasGameSettings ? "1" : "0") +
            " a=" + (settingsStorageApis && settingsStorageApis.length ? settingsStorageApis.length : 0) +
            " rs=" + (settingsStorageResolved ? "1" : "0") +
            " " + gameMethods + " " + String(debugStorageDiscovery || "");

        debugRawLengths =
            "attr:" + String(attrRaw.length) +
            " pers:" + String(persistentRaw.length) +
            " game:" + String(gameRaw.length) +
            " rev:" + String(settingsAttrRevision);
    }

    function getStateFieldStorageMap(state) {
        return {
            version: SETTINGS_STORAGE_VERSION,
            showCrates: state.showCrates ? "1" : "0",
            crateSizePx: String(state.crateSizePx),
            crateOpacity: String(state.crateOpacity),
            mapOpacity: String(state.mapOpacity),
            minimapScaleIndex: String(state.minimapScaleIndex),
            fsHudEnabled: state.fsHudEnabled ? "1" : "0",
            minimapOffsetRight: String(state.minimapOffsetRight),
            minimapOffsetBottom: String(state.minimapOffsetBottom),
            activeSection: String(state.activeSection),
            activeObjectsTab: String(state.activeObjectsTab)
        };
    }

    function readStateFieldStorageMap(api) {
        var fieldNames = [
            "showCrates",
            "crateSizePx",
            "crateOpacity",
            "mapOpacity",
            "minimapScaleIndex",
            "fsHudEnabled",
            "minimapOffsetRight",
            "minimapOffsetBottom",
            "activeSection",
            "activeObjectsTab"
        ];

        var out = {};
        var foundAny = false;
        for (var i = 0; i < fieldNames.length; i++) {
            var fieldName = fieldNames[i];
            var raw = null;
            try {
                raw = api.get(SETTINGS_STORAGE_FIELD_PREFIX + fieldName);
            } catch (e) {
                raw = null;
            }

            if (raw === null || typeof raw === "undefined" || raw === "") {
                continue;
            }

            foundAny = true;
            out[fieldName] = raw;
        }

        if (!foundAny) {
            return null;
        }

        return {
            showCrates: String(out.showCrates) === "1" || String(out.showCrates).toLowerCase() === "true",
            crateSizePx: parseFloat(out.crateSizePx),
            crateOpacity: parseFloat(out.crateOpacity),
            mapOpacity: parseFloat(out.mapOpacity),
            minimapScaleIndex: parseFloat(out.minimapScaleIndex),
            fsHudEnabled: String(out.fsHudEnabled) === "1" || String(out.fsHudEnabled).toLowerCase() === "true",
            minimapOffsetRight: parseFloat(out.minimapOffsetRight),
            minimapOffsetBottom: parseFloat(out.minimapOffsetBottom),
            activeSection: out.activeSection,
            activeObjectsTab: out.activeObjectsTab
        };
    }

    function sanitizeSettingsState(state) {
        if (!state || typeof state !== "object") {
            return null;
        }

        var sanitized = {};
        sanitized.showCrates = !!state.showCrates;
        sanitized.crateSizePx = Math.round(clampNumber(state.crateSizePx, 1, 5, DEFAULT_CRATE_SIZE_PX));
        sanitized.crateOpacity = normalizeOpacity(clampNumber(state.crateOpacity, 0.01, 1.00, DEFAULT_CRATE_OPACITY));
        sanitized.mapOpacity = normalizeOpacity(clampNumber(state.mapOpacity, 0.01, 1.00, DEFAULT_MAP_OPACITY));
        sanitized.minimapScaleIndex = Math.round(clampNumber(
            state.minimapScaleIndex,
            0,
            SMALL_MAP_SCALE_PRESETS.length - 1,
            DEFAULT_SMALL_MAP_SCALE_INDEX
        ));
        sanitized.fsHudEnabled = !!state.fsHudEnabled;
        sanitized.minimapOffsetRight = Math.round(clampNumber(state.minimapOffsetRight, -100000, 100000, DEFAULT_MINIMAP_OFFSET_RIGHT));
        sanitized.minimapOffsetBottom = Math.round(clampNumber(state.minimapOffsetBottom, -100000, 100000, DEFAULT_MINIMAP_OFFSET_BOTTOM));
        sanitized.activeSection = normalizeSectionName(state.activeSection);
        sanitized.activeObjectsTab = normalizeObjectsTabName(state.activeObjectsTab);

        return sanitized;
    }

    function applyPersistedSettingsState(state) {
        var sanitized = sanitizeSettingsState(state);
        if (!sanitized) {
            return false;
        }

        cratesOverlayEnabled = sanitized.showCrates;
        crateSizePx = sanitized.crateSizePx;
        crateOpacity = sanitized.crateOpacity;
        mapContainerOpacity = sanitized.mapOpacity;
        smallMapScaleIndex = sanitized.minimapScaleIndex;
        useFullScreenHud = sanitized.fsHudEnabled;
        minimapOffsetRight = sanitized.minimapOffsetRight;
        minimapOffsetBottom = sanitized.minimapOffsetBottom;
        activeSettingsSection = sanitized.activeSection;
        activeObjectsTab = sanitized.activeObjectsTab;
        return true;
    }

    function loadPersistedSettings() {
        debugLastLoadSource = "none";
        if (tryLoadStateFromBuildUiPayload()) {
            debugLastLoadSource = "build-ui-payload";
            updatePersistenceDebugView();
            return true;
        }
        if (tryLoadStateFromBridgePayload()) {
            debugLastLoadSource = "bridge-payload-attr";
            updatePersistenceDebugView();
            return true;
        }
        var attrRaw = readSettingsRawFromAttributes();
        if (attrRaw && attrRaw.length > 0) {
            try {
                var attrParsed = JSON.parse(attrRaw);
                if (applyPersistedSettingsState(attrParsed)) {
                    debugLastLoadSource = "attributes";
                    $.Msg("[minimap_overlay] loaded persisted settings from panel attributes");
                    updatePersistenceDebugView();
                    return true;
                }
            } catch (eAttrParse) {
                $.Msg("[minimap_overlay] failed to parse attribute settings JSON: " + eAttrParse);
            }
        }

        if ($.persistentStorage && typeof $.persistentStorage.getItem === "function") {
            var directRaw = "";
            try {
                directRaw = String($.persistentStorage.getItem(SETTINGS_STORAGE_RAW_FALLBACK_KEY) || "");
            } catch (eDirectRead) {
                directRaw = "";
            }

            if (!directRaw) {
                try {
                    directRaw = String($.persistentStorage.getItem(SETTINGS_STORAGE_KEY) || "");
                } catch (eDirectReadMain) {
                    directRaw = "";
                }
            }

            if (directRaw) {
                try {
                    var directParsed = JSON.parse(directRaw);
                    if (applyPersistedSettingsState(directParsed)) {
                        debugLastLoadSource = "$.persistentStorage(raw)";
                        $.Msg("[minimap_overlay] loaded persisted settings from $.persistentStorage direct key");
                        updatePersistenceDebugView();
                        return true;
                    }
                } catch (eDirectParse) {
                    $.Msg("[minimap_overlay] failed to parse $.persistentStorage direct JSON: " + eDirectParse);
                }
            }
        }

        var apis = resolveSettingsStorageApis();
        if (!apis || !apis.length) {
            return false;
        }

        for (var i = 0; i < apis.length; i++) {
            var api = apis[i];
            var raw = null;
            try {
                raw = api.get(SETTINGS_STORAGE_KEY);
            } catch (e) {
                $.Msg("[minimap_overlay] failed to read settings from " + api.debugName + ": " + e);
                continue;
            }

            if (!raw) {
                continue;
            }

            var parsed = null;
            if (typeof raw === "string") {
                try {
                    parsed = JSON.parse(raw);
                } catch (eParse) {
                    $.Msg("[minimap_overlay] failed to parse persisted settings JSON from " + api.debugName + ": " + eParse);
                    continue;
                }
            } else if (typeof raw === "object") {
                parsed = raw;
            }

            var applied = applyPersistedSettingsState(parsed);
            if (applied) {
                debugLastLoadSource = api.debugName + " (json)";
                $.Msg("[minimap_overlay] loaded persisted settings from " + api.debugName);
                updatePersistenceDebugView();
                return true;
            }

            var flatState = readStateFieldStorageMap(api);
            if (flatState && applyPersistedSettingsState(flatState)) {
                debugLastLoadSource = api.debugName + " (fields)";
                $.Msg("[minimap_overlay] loaded persisted field settings from " + api.debugName);
                updatePersistenceDebugView();
                return true;
            }
        }

        updatePersistenceDebugView();
        return false;
    }

    function saveSettingsNow() {
        if (!settingsPersistenceReady) {
            return;
        }

        var apis = resolveSettingsStorageApis();
        var wroteAttrs = 0;
        var wrotePersistentDirect = 0;
        var wroteAdapter = 0;
        if (!apis || !apis.length) {
            // Still write runtime attribute channels, even if persistent backends are unavailable.
            var stateNoApis = getCurrentSettingsState();
            writeSettingsRawToAttributes(JSON.stringify(stateNoApis));
            wroteAttrs = 1;
            debugLastSaveStatus = "saved attrs=1 pers=0 adapters=0";
            updatePersistenceDebugView();
            return;
        }

        var state = getCurrentSettingsState();
        var payload = JSON.stringify(state);
        var bridgeToken = queueBridgeSaveFromCurrentState();
        writeSettingsRawToAttributes(payload);
        wroteAttrs = 1;
        if ($.persistentStorage && typeof $.persistentStorage.setItem === "function") {
            try {
                $.persistentStorage.setItem(SETTINGS_STORAGE_RAW_FALLBACK_KEY, payload);
                $.persistentStorage.setItem(SETTINGS_STORAGE_KEY, payload);
                wrotePersistentDirect = 1;
            } catch (eDirectWrite) {}
        }
        var fieldMap = getStateFieldStorageMap(state);
        var savedAny = false;
        for (var i = 0; i < apis.length; i++) {
            var api = apis[i];
            try {
                var saved = api.set(SETTINGS_STORAGE_KEY, payload);
                savedAny = !!saved || savedAny;
                wroteAdapter += saved ? 1 : 0;
                for (var fieldName in fieldMap) {
                    if (!fieldMap.hasOwnProperty(fieldName)) {
                        continue;
                    }
                    var fieldSaved = api.set(SETTINGS_STORAGE_FIELD_PREFIX + fieldName, fieldMap[fieldName]);
                    savedAny = !!fieldSaved || savedAny;
                    wroteAdapter += fieldSaved ? 1 : 0;
                }
            } catch (e) {
                $.Msg("[minimap_overlay] failed to persist settings into " + api.debugName + ": " + e);
            }
        }

        if (!savedAny) {
            $.Msg("[minimap_overlay] warning: settings save did not confirm any backend write");
            debugLastSaveStatus = "no-confirmed-backend-write";
        } else {
            debugLastSaveStatus =
                "saved attrs=" + wroteAttrs +
                " pers=" + wrotePersistentDirect +
                " adapters=" + wroteAdapter;
        }
        if (bridgeToken && bridgeToken.length > 0) {
            debugBridgeStatus = "token-ready len=" + bridgeToken.length;
        }

        updatePersistenceDebugView();
    }

    function scheduleSettingsSave() {
        if (!settingsPersistenceReady) {
            return;
        }

        settingsSaveToken++;
        var localToken = settingsSaveToken;
        $.Schedule(0.1, function () {
            if (localToken !== settingsSaveToken) {
                return;
            }

            saveSettingsNow();
        });
    }

    function resetCratesSettings() {
        setCratesToggleState(DEFAULT_CRATES_ENABLED);
        crateSizePx = DEFAULT_CRATE_SIZE_PX;
        crateOpacity = DEFAULT_CRATE_OPACITY;
        applyMarkerStyles();
        scheduleSettingsSave();
    }

    function resetTunnelsSettings() {
        // Placeholder section; keep this as a no-op for now.
    }

    function resetMapSettings() {
        smallMapScaleIndex = DEFAULT_SMALL_MAP_SCALE_INDEX;
        mapContainerOpacity = DEFAULT_MAP_OPACITY;
        minimapOffsetRight = DEFAULT_MINIMAP_OFFSET_RIGHT;
        minimapOffsetBottom = DEFAULT_MINIMAP_OFFSET_BOTTOM;
        applyMapZoom();
        applyMapContainerOpacity();
        applyMinimapPosition();
        scheduleSettingsSave();
    }

    function resetScreenSettings() {
        useFullScreenHud = DEFAULT_FS_HUD_ENABLED;
        applyUiClampWidth();
        scheduleSettingsSave();
    }

    function applyMarkerStyle(marker) {
        marker.style.width = crateSizePx + "px";
        marker.style.height = crateSizePx + "px";
        marker.style.transform =
            "translateX(" + (-crateSizePx / 2) + "px) translateY(" + (-crateSizePx / 2) + "px)";
        marker.style.opacity = "1.0";
        marker.style.backgroundColor = "rgba(255, 213, 74, " + crateOpacity.toFixed(2) + ")";
        marker.style.border = "1px solid rgba(42, 33, 0, " + crateBorderOpacity.toFixed(2) + ")";
    }

    function applyMarkerStyles() {
        var markers = $("#minimap_markers");
        if (!markers) {
            return;
        }

        var children = markers.Children();
        for (var i = 0; i < children.length; i++) {
            applyMarkerStyle(children[i]);
        }

        var sizeSlider = getSliderControlById("minimap_crates_size_slider");
        if (sizeSlider) {
            sizeSlider.value = cratePxToSliderUnits(crateSizePx);
            setSliderEntryTextByPanelId("minimap_crates_size_slider", Math.round(crateSizePx));
        }

        var opacitySlider = getSliderControlById("minimap_crates_opacity_slider");
        if (opacitySlider) {
            opacitySlider.value = crateOpacity;
        }
    }

    function getCurrentContainerSizePx() {
        return Math.round(DEFAULT_SMALL_MAP_SIZE * SMALL_MAP_SCALE_PRESETS[smallMapScaleIndex]);
    }

    function applyContainerSize(px) {
        if (!px) {
            return;
        }

        var size = px + "px";

        var minimapPersp = $("#minimap_persp");
        if (minimapPersp) {
            minimapPersp.style.width = size;
            minimapPersp.style.height = size;
        }

        var minimapContainer = $("#minimap_container");
        if (minimapContainer) {
            minimapContainer.style.width = size;
            minimapContainer.style.height = size;
        }

        var minimapFrame = $("#minimap_frame");
        if (minimapFrame) {
            minimapFrame.style.width = size;
            minimapFrame.style.height = size;
        }
    }

    function clampMinimapOffsets() {
        var minimapPersp = $("#minimap_persp");
        if (!minimapPersp) {
            return;
        }

        // Use root viewport bounds instead of immediate parent bounds.
        // Parent width can equal minimap width in some HUD states, which clamps offset to 0.
        var parent = minimapPersp.GetParent();
        var parentWidth = parent ? parent.actuallayoutwidth : 0;
        var parentHeight = parent ? parent.actuallayoutheight : 0;
        var minimapWidth = minimapPersp.actuallayoutwidth;
        var minimapHeight = minimapPersp.actuallayoutheight;
        var viewportSize = getViewportSizeFromAncestors(minimapPersp);
        var viewportWidth = viewportSize[0];
        var viewportHeight = viewportSize[1];

        if (parentWidth <= 0 || parentHeight <= 0 || minimapWidth <= 0 || minimapHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
            return;
        }

        var maxRight = Math.max(0, parentWidth - minimapWidth);
        var maxBottom = Math.max(0, parentHeight - minimapHeight);
        var minRight = 0;
        var minBottom = 0;

        if (IGNORE_PARENT_DRAG_BOUNDS) {
            minRight = -100000;
            minBottom = -100000;
            maxRight = 100000;
            maxBottom = 100000;
        }

        // On ultrawide setups, minimap parent can be constrained by clamp_width max-width.
        // Allow negative offsets equal to parent's screen-space gap from viewport edges,
        // so minimap can still be dragged fully to real screen right/bottom.
        var parentPos = getPanelScreenPosition(parent, false);
        if (parentPos) {
            var parentScreenX = parentPos[0];
            var parentScreenY = parentPos[1];

            // Keep minimap fully within the real viewport.
            var viewportMinRight = parentScreenX + parentWidth - viewportWidth - DEFAULT_MINIMAP_MARGIN_RIGHT;
            var viewportMaxRight = parentScreenX + parentWidth - minimapWidth - DEFAULT_MINIMAP_MARGIN_RIGHT;
            var viewportMinBottom = parentScreenY + parentHeight - viewportHeight - DEFAULT_MINIMAP_MARGIN_BOTTOM;
            var viewportMaxBottom = parentScreenY + parentHeight - minimapHeight - DEFAULT_MINIMAP_MARGIN_BOTTOM;

            minRight = Math.max(minRight, viewportMinRight);
            maxRight = Math.min(maxRight, viewportMaxRight);
            minBottom = Math.max(minBottom, viewportMinBottom);
            maxBottom = Math.min(maxBottom, viewportMaxBottom);
        }

        var clampedMaxRight = Math.max(minRight, maxRight);
        var clampedMaxBottom = Math.max(minBottom, maxBottom);

        minimapOffsetRight = Math.max(minRight, Math.min(clampedMaxRight, minimapOffsetRight));
        minimapOffsetBottom = Math.max(minBottom, Math.min(clampedMaxBottom, minimapOffsetBottom));
    }

    function getViewportSizeFromAncestors(panel) {
        if (typeof Game !== "undefined" &&
            typeof Game.GetScreenWidth === "function" &&
            typeof Game.GetScreenHeight === "function") {
            var screenWidth = Game.GetScreenWidth();
            var screenHeight = Game.GetScreenHeight();
            if (screenWidth > 0 && screenHeight > 0) {
                return [screenWidth, screenHeight];
            }
        }

        var maxWidth = 0;
        var maxHeight = 0;
        var current = panel;

        while (current) {
            if (typeof current.actuallayoutwidth === "number") {
                maxWidth = Math.max(maxWidth, current.actuallayoutwidth);
            }
            if (typeof current.actuallayoutheight === "number") {
                maxHeight = Math.max(maxHeight, current.actuallayoutheight);
            }

            if (typeof current.GetParent === "function") {
                current = current.GetParent();
            } else {
                current = null;
            }
        }

        return [maxWidth, maxHeight];
    }

    function applyMinimapPosition() {
        var minimapPersp = $("#minimap_persp");
        if (!minimapPersp) {
            return;
        }

        clampMinimapOffsets();

        minimapPersp.style.marginRight = (DEFAULT_MINIMAP_MARGIN_RIGHT + minimapOffsetRight) + "px";
        minimapPersp.style.marginBottom = (DEFAULT_MINIMAP_MARGIN_BOTTOM + minimapOffsetBottom) + "px";
    }

    function hasDragApi() {
        return typeof $ !== "undefined" && typeof $.RegisterEventHandler === "function";
    }

    function applyDragHandleVisibility() {
        var grip = $("#" + DRAG_HANDLE_BUTTON_ID);
        if (grip) {
            grip.SetHasClass("DragEnabled", dragModeEnabled);
            grip.SetHasClass("DragActive", isDraggingMinimap);
            grip.SetHasClass("DragPressed", false);
            grip.SetHasClass("DragHover", dragGripHovered && dragModeEnabled && !isDraggingMinimap);
        }

        var settingsPanel = $("#minimap_settings_inner");
        if (settingsPanel) {
            settingsPanel.SetHasClass("DraggingMinimap", isDraggingMinimap && settingsPanelOpen);
        }

        updateDragGripLabel();
    }

    function updateDragGripLabel() {
        var label = $("#" + DRAG_HANDLE_LABEL_ID);
        if (!label) {
            return;
        }

        if (!dragModeEnabled) {
            label.text = "Drag Me";
            return;
        }

        if (isDraggingMinimap) {
            label.text = "Dragging " + Math.round(minimapOffsetRight) + "," + Math.round(minimapOffsetBottom) + " [" + dragPositionSource + "]";
            return;
        }

        if (!hasDragApi()) {
            label.text = "No Drag API";
            return;
        }

        if (dragGripHovered) {
            label.text = "Drag Me";
            return;
        }

        label.text = "Drag Me";
    }

    function endDragProxy() {
        if (dragProxyPanel) {
            dragProxyPanel.DeleteAsync(0);
            dragProxyPanel = null;
        }
    }

    function getPanelScreenPosition(panel, trackSource) {
        if (!panel) {
            return null;
        }

        if (typeof trackSource === "undefined") {
            trackSource = true;
        }

        if (typeof panel.GetPositionWithinWindow === "function") {
            var winPos = panel.GetPositionWithinWindow();
            if (winPos && winPos.length >= 2) {
                if (trackSource) {
                    dragPositionSource = "window";
                }
                return [winPos[0], winPos[1]];
            }
        }

        if (typeof panel.actualx === "number" && typeof panel.actualy === "number") {
            if (trackSource) {
                dragPositionSource = "actual";
            }
            return [panel.actualx, panel.actualy];
        }

        // Fallback: accumulate local positions through ancestors when window position API is unavailable.
        var sumX = 0;
        var sumY = 0;
        var hasAny = false;
        var current = panel;
        while (current) {
            if (typeof current.actualx === "number") {
                sumX += current.actualx;
                hasAny = true;
            }
            if (typeof current.actualy === "number") {
                sumY += current.actualy;
                hasAny = true;
            }

            if (typeof current.GetParent === "function") {
                current = current.GetParent();
            } else {
                current = null;
            }
        }
        if (hasAny) {
            if (trackSource) {
                dragPositionSource = "actual-sum";
            }
            return [sumX, sumY];
        }

        if (panel.style && typeof panel.style.position === "string" && panel.style.position.length > 0) {
            var m = panel.style.position.match(/(-?\d+(\.\d+)?)px\s+(-?\d+(\.\d+)?)px/i);
            if (m && m.length >= 4) {
                if (trackSource) {
                    dragPositionSource = "style";
                }
                return [parseFloat(m[1]), parseFloat(m[3])];
            }
        }

        return null;
    }

    function stopMinimapDrag() {
        isDraggingMinimap = false;
        dragProxyInitialized = false;
        applyDragHandleVisibility();
    }

    function updateMinimapDragFromProxyLoop() {
        if (!isDraggingMinimap) {
            return;
        }

        if (!dragProxyPanel) {
            stopMinimapDrag();
            return;
        }

        var proxyPos = getPanelScreenPosition(dragProxyPanel);
        if (!proxyPos) {
            $.Schedule(0.01, updateMinimapDragFromProxyLoop);
            return;
        }

        var proxyX = proxyPos[0];
        var proxyY = proxyPos[1];

        if (!dragProxyInitialized) {
            dragStartCursorX = proxyX;
            dragStartCursorY = proxyY;
            dragProxyInitialized = true;
        }

        var dx = proxyX - dragStartCursorX;
        var dy = proxyY - dragStartCursorY;

        minimapOffsetRight = dragStartOffsetRight - dx;
        minimapOffsetBottom = dragStartOffsetBottom - dy;
        applyMinimapPosition();
        applyDragHandleVisibility();

        $.Schedule(0.01, updateMinimapDragFromProxyLoop);
    }

    function onDragGripStart(panelId, dragCallbacks) {
        if (!dragModeEnabled) {
            return false;
        }

        endDragProxy();
        var context = $.GetContextPanel();
        var proxy = $.CreatePanel("Panel", context, "minimap_drag_proxy");
        proxy.hittest = false;
        proxy.style.width = "4px";
        proxy.style.height = "4px";
        proxy.style.opacity = "0";

        dragCallbacks.displayPanel = proxy;
        dragCallbacks.offsetX = 0;
        dragCallbacks.offsetY = 0;

        dragProxyPanel = proxy;
        dragProxyInitialized = false;
        dragPositionSource = "none";
        isDraggingMinimap = true;
        dragStartOffsetRight = minimapOffsetRight;
        dragStartOffsetBottom = minimapOffsetBottom;
        applyDragHandleVisibility();
        $.Msg("[minimap_overlay] DragStart fired");
        $.Schedule(0.01, updateMinimapDragFromProxyLoop);
        return true;
    }

    function onDragGripEnd() {
        stopMinimapDrag();
        endDragProxy();
        dragGripHovered = false;
        applyDragHandleVisibility();
        scheduleSettingsSave();
        return true;
    }

    function applyMapZoom() {
        var size = getCurrentContainerSizePx();

        if (!size) {
            $.Msg("[minimap_overlay] no container size resolved");
            return;
        }

        applyContainerSize(size);

        var dropdown = $("#minimap_small_scale_dropdown");
        var selectedOption = $("#" + SMALL_MAP_SCALE_DROPDOWN_OPTION_IDS[smallMapScaleIndex]);
        if (dropdown && selectedOption && typeof dropdown.GetSelected === "function" && dropdown.GetSelected() !== selectedOption) {
            dropdown.SetSelected(selectedOption);
        }

        applyMinimapPosition();
    }

    function initializeSmallScaleDropdown() {
        var dropdown = $("#minimap_small_scale_dropdown");
        if (!dropdown) {
            $.Msg("[minimap_overlay] #minimap_small_scale_dropdown not found");
            return;
        }

        var defaultOption = $("#" + SMALL_MAP_SCALE_DROPDOWN_OPTION_IDS[smallMapScaleIndex]);
        if (!defaultOption && typeof dropdown.FindChildTraverse === "function") {
            defaultOption = dropdown.FindChildTraverse(SMALL_MAP_SCALE_DROPDOWN_OPTION_IDS[smallMapScaleIndex]);
        }
        if (defaultOption) {
            dropdown.SetSelected(defaultOption);
        }

        // Ensure the dropdown reflects the runtime default (1x) even if initial layout selection is stale.
        $.Schedule(0.0, function () {
            var selectedOption = $("#" + SMALL_MAP_SCALE_DROPDOWN_OPTION_IDS[smallMapScaleIndex]);
            if (selectedOption) {
                dropdown.SetSelected(selectedOption);
            }
        });

        dropdown.SetPanelEvent("oninputsubmit", function () {
            if (typeof dropdown.GetSelected !== "function") {
                return;
            }

            var selected = dropdown.GetSelected();
            if (!selected || !selected.id) {
                return;
            }

            var selectedIndex = SMALL_MAP_SCALE_DROPDOWN_OPTION_IDS.indexOf(selected.id);
            if (selectedIndex < 0) {
                return;
            }

            smallMapScaleIndex = selectedIndex;
            applyMapZoom();
            scheduleSettingsSave();
        });
    }

    function applyMapContainerOpacity() {
        var minimapContainer = $("#minimap_container");
        if (minimapContainer) {
            minimapContainer.style.opacity = mapContainerOpacity.toFixed(2);
        }

        var mapOpacitySlider = getSliderControlById("minimap_map_opacity_slider");
        if (mapOpacitySlider) {
            mapOpacitySlider.value = mapContainerOpacity;
        }
    }

    function applyUiClampWidth() {
        var clampPanel = $("#minimap_ui_clamp_container");
        var fsToggle = $("#minimap_fs_hud_toggle");

        if (fsToggle) {
            if (typeof fsToggle.checked !== "undefined") {
                fsToggle.checked = useFullScreenHud;
            }
            if (typeof fsToggle.SetSelected === "function") {
                fsToggle.SetSelected(useFullScreenHud);
            }
        }

        var effectiveWidth = DEFAULT_UI_CLAMP_WIDTH;
        if (useFullScreenHud) {
            var viewportSize = getViewportSizeFromAncestors($.GetContextPanel());
            var viewportWidth = viewportSize[0];
            if (viewportWidth > 0) {
                effectiveWidth = viewportWidth;
            }
        }

        if (clampPanel) {
            clampPanel.style.maxWidth = Math.round(effectiveWidth) + "px";
        }
    }

    function applyAllSettingsToUi() {
        setCratesToggleState(cratesOverlayEnabled);
        applyMarkerStyles();
        applyMapZoom();
        applyMapContainerOpacity();
        applyUiClampWidth();
        applyBigMapVisibility();
        applyMinimapPosition();
        setActiveSection(activeSettingsSection);
        setActiveObjectsTab(activeObjectsTab);
        applySettingsHostVisibility();
        applyDragHandleVisibility();
        updatePersistenceDebugView();
    }

    function dumpCurrentStateToLog() {
        var state = getCurrentSettingsState();
        var stateJson = JSON.stringify(state);
        collectPersistenceDebugInfo();
        var bridgePayload = getAttrFromPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR) || "";
        var bridgeState = getAttrFromPersistencePanels(BRIDGE_REQUEST_STATE_ATTR) || "";
        var bridgeMsg = getAttrFromPersistencePanels(BRIDGE_REQUEST_MSG_ATTR) || "";
        $.Msg("[minimap_overlay][debug] state_json=" + stateJson);
        $.Msg("[minimap_overlay][debug] state_hash=" + computeStateHash(state));
        $.Msg("[minimap_overlay][debug] last_load_source=" + debugLastLoadSource + " last_save_status=" + debugLastSaveStatus);
        $.Msg("[minimap_overlay][debug] backend_summary=" + debugBackendSummary + " raw_lengths=" + debugRawLengths);
        $.Msg("[minimap_overlay][debug] bridge_status=" + debugBridgeStatus + " bridge_active=" + (bridgeRequestActive ? "1" : "0") + " bridge_attr_state=" + bridgeState + " bridge_msg=" + bridgeMsg + " bridge_payload_len=" + bridgePayload.length);
    }

    function bindButton(id, callback) {
        var button = $("#" + id);
        if (!button) {
            $.Msg("[minimap_overlay] #" + id + " not found");
            return;
        }

        button.SetPanelEvent("onactivate", callback);
    }

    function bindDebugControls() {
        bindButton("minimap_debug_force_save", function () {
            saveSettingsNow();
            queueBridgeSaveFromCurrentState();
            debugBridgeStatus = "force-save-queued";
            updatePersistenceDebugView();
            dumpCurrentStateToLog();
        });

        bindButton("minimap_debug_force_load", function () {
            var loaded = tryLoadStateFromBridgePayload() || loadPersistedSettings();
            if (loaded) {
                applyAllSettingsToUi();
                debugLastSaveStatus = debugLastSaveStatus + " | force-load:ok";
            } else {
                debugLastSaveStatus = debugLastSaveStatus + " | force-load:miss";
            }
            updatePersistenceDebugView();
            dumpCurrentStateToLog();
        });

        bindButton("minimap_debug_dump_state", function () {
            dumpCurrentStateToLog();
            updatePersistenceDebugView();
        });
    }

    function bindToggle() {
        var toggle = $("#minimap_crates_toggle");

        if (!toggle) {
            $.Msg("[minimap_overlay] #minimap_crates_toggle not found");
            updateOverlayVisibility();
            return;
        }

        var onToggle = function () {
            setCratesToggleState(!cratesOverlayEnabled);
            scheduleSettingsSave();
        };

        toggle.SetPanelEvent("onactivate", onToggle);
        setCratesToggleState(cratesOverlayEnabled);
        // CitadelSettingsToggle can apply its internal checked state after event bind;
        // enforce current runtime state once more on the next frames.
        $.Schedule(0.0, function () {
            setCratesToggleState(cratesOverlayEnabled);
        });
        $.Schedule(0.03, function () {
            setCratesToggleState(cratesOverlayEnabled);
        });
    }

    function bindDragHandle() {
        var grip = $("#" + DRAG_HANDLE_BUTTON_ID);
        if (!grip) {
            $.Msg("[minimap_overlay] #" + DRAG_HANDLE_BUTTON_ID + " not found");
            return;
        }

        if (typeof grip.SetDraggable === "function") {
            grip.SetDraggable(true);
        } else if (typeof grip.draggable !== "undefined") {
            grip.draggable = true;
        }

        grip.SetPanelEvent("onmouseover", function () {
            dragGripHovered = true;
            applyDragHandleVisibility();
        });

        grip.SetPanelEvent("onmouseout", function () {
            if (!isDraggingMinimap) {
                dragGripHovered = false;
                applyDragHandleVisibility();
            }
        });

        if (!dragHandlersBound && hasDragApi()) {
            $.RegisterEventHandler("DragStart", grip, onDragGripStart);
            $.RegisterEventHandler("DragEnd", grip, onDragGripEnd);
            dragHandlersBound = true;
        }

        // IMPORTANT: avoid mouseup handlers on parent/minimap settings/context panels.
        // They can intermittently break Settings button activation.
        // Drag start/stop is handled by Panorama DragStart/DragEnd handlers.
    }

    function bindControlsToggleButton() {
        if (settingsToggleBound) {
            return;
        }

        var foundAny = false;

        for (var i = 0; i < SETTINGS_TOGGLE_BUTTON_IDS.length; i++) {
            var button = $("#" + SETTINGS_TOGGLE_BUTTON_IDS[i]);
            if (!button) {
                continue;
            }

            button.SetPanelEvent("onactivate", toggleControlsPanel);
            foundAny = true;
        }

        if (!foundAny) {
            $.Msg("[minimap_overlay] settings toggle buttons not found");
            return;
        }

        settingsToggleBound = true;
    }

    function bindResetButtons() {
        bindButton("minimap_reset_crates_button", resetCratesSettings);
        bindButton("minimap_reset_tunnels_button", resetTunnelsSettings);
        bindButton("minimap_reset_map_button", resetMapSettings);
        bindButton("minimap_reset_screen_button", resetScreenSettings);
    }

    function hasAnySettingsToggleButton() {
        for (var i = 0; i < SETTINGS_TOGGLE_BUTTON_IDS.length; i++) {
            if ($("#" + SETTINGS_TOGGLE_BUTTON_IDS[i])) {
                return true;
            }
        }

        return false;
    }

    function bindTabs() {
        bindButton("minimap_nav_objects", function () {
            setActiveSection("objects");
        });

        bindButton("minimap_object_tab_crates", function () {
            setActiveSection("objects");
            setActiveObjectsTab("crates");
        });

        bindButton("minimap_object_tab_tunnels", function () {
            setActiveSection("objects");
            setActiveObjectsTab("tunnels");
        });

        bindButton("minimap_nav_map", function () {
            setActiveSection("map");
        });

        bindButton("minimap_nav_screen", function () {
            setActiveSection("screen");
        });

        bindButton("minimap_nav_config", function () {
            setActiveSection("config");
        });

        bindButton("minimap_nav_debug", function () {
            setActiveSection("debug");
        });

        setActiveSection(activeSettingsSection);
        setActiveObjectsTab(activeObjectsTab);
    }

    function bindControls() {
        bindControlsToggleButton();
        bindTabs();
        bindToggle();
        bindDragHandle();
        bindResetButtons();
        bindDebugControls();
        bindConfigControls();

        var sizeSlider = getSliderControlById("minimap_crates_size_slider");
        if (sizeSlider) {
            sizeSlider.min = 1;
            sizeSlider.max = 5;
            sizeSlider.value = cratePxToSliderUnits(crateSizePx);
            setSliderEntryTextByPanelId("minimap_crates_size_slider", Math.round(crateSizePx));
            sizeSlider.SetPanelEvent("onvaluechanged", function () {
                var sliderUnits = Math.max(1, Math.min(5, Math.round(sizeSlider.value)));
                sizeSlider.value = sliderUnits;
                crateSizePx = Math.max(1, Math.min(5, sliderUnitsToCratePx(sliderUnits)));
                setSliderEntryTextByPanelId("minimap_crates_size_slider", Math.round(crateSizePx));
                applyMarkerStyles();
                scheduleSettingsSave();
            });
        }

        var opacitySlider = getSliderControlById("minimap_crates_opacity_slider");
        if (opacitySlider) {
            opacitySlider.min = 0.01;
            opacitySlider.max = 1.0;
            opacitySlider.value = crateOpacity;
            opacitySlider.SetPanelEvent("onvaluechanged", function () {
                var snapped = normalizeOpacity(Math.round(opacitySlider.value * 100) / 100);
                opacitySlider.value = snapped;
                crateOpacity = snapped;
                applyMarkerStyles();
                scheduleSettingsSave();
            });
        }

        initializeSmallScaleDropdown();

        var mapOpacitySlider = getSliderControlById("minimap_map_opacity_slider");
        if (mapOpacitySlider) {
            mapOpacitySlider.min = 0.01;
            mapOpacitySlider.max = 1.0;
            mapOpacitySlider.value = mapContainerOpacity;
            mapOpacitySlider.SetPanelEvent("onvaluechanged", function () {
                var snapped = normalizeOpacity(Math.round(mapOpacitySlider.value * 100) / 100);
                mapOpacitySlider.value = snapped;
                mapContainerOpacity = snapped;
                applyMapContainerOpacity();
                scheduleSettingsSave();
            });
        }

        var fsHudToggle = $("#minimap_fs_hud_toggle");
        if (fsHudToggle) {
            fsHudToggle.SetPanelEvent("onactivate", function () {
                useFullScreenHud = !useFullScreenHud;
                applyUiClampWidth();
                scheduleSettingsSave();
            });
        }

        applyAllSettingsToUi();
        setSettingsPanelOpenState(false);
        settingsPersistenceReady = true;
        updatePersistenceDebugView();
    }

    function renderCrates(mapName) {
        var markers = $("#minimap_markers");
        if (!markers) {
            $.Msg("[minimap_overlay] #minimap_markers not found");
            return;
        }

        if (typeof CRATE_DATA === "undefined") {
            $.Msg("[minimap_overlay] CRATE_DATA is undefined");
            return;
        }

        var mapData = CRATE_DATA[mapName];
        if (!mapData || !mapData.crates) {
            $.Msg("[minimap_overlay] no crate data for map: " + mapName);
            return;
        }

        clearChildren(markers);

        var crates = mapData.crates;
        for (var i = 0; i < crates.length; i++) {
            var c = crates[i];
            if (typeof c.u === "number" && typeof c.v === "number") {
                addMarker(markers, c.u, c.v);
            }
        }

        applyMarkerStyles();

        $.Msg("[minimap_overlay] rendered crates: " + crates.length);
    }

    function watchMapMode() {
        applyMapZoom();
        applyMinimapPosition();
        applyUiClampWidth();
        applySettingsHostVisibility();
        $.Schedule(0.1, watchMapMode);
    }

    function init() {
        loadPersistedSettings();
        bindControls();
        pollBridgeRequestLoop();
        pollBuildPayloadLoadLoop();
        watchMapMode();
        waitForMinimapDataAndRender("dl_midtown");
    }

    function canInitialize() {
        // Keep this list minimal and stable.
        // If we make canInitialize too strict, full init may never run and Settings becomes unusable.
        return hasAnySettingsToggleButton() &&
            !!$("#minimap_settings_inner") &&
            !!$("#minimap_nav_objects") &&
            !!$("#minimap_object_tab_crates") &&
            !!$("#minimap_object_tab_tunnels") &&
            !!$("#minimap_nav_map") &&
            !!$("#minimap_nav_screen") &&
            !!$("#minimap_crates_toggle") &&
            !!$("#minimap_crates_size_slider") &&
            !!$("#minimap_crates_opacity_slider") &&
            !!$("#minimap_small_scale_dropdown") &&
            !!$("#minimap_map_opacity_slider") &&
            !!$("#minimap_tab_content_tunnels") &&
            !!$("#minimap_tab_content_screen") &&
            !!$("#minimap_fs_hud_toggle");
    }

    function hasMinimapData(mapName) {
        return typeof CRATE_DATA !== "undefined" &&
            !!CRATE_DATA[mapName] &&
            !!CRATE_DATA[mapName].crates;
    }

    function canRenderCrates(mapName) {
        return !!$("#minimap_markers") && hasMinimapData(mapName);
    }

    function waitForMinimapDataAndRender(mapName) {
        if (!canRenderCrates(mapName)) {
            $.Schedule(0.03, function () {
                waitForMinimapDataAndRender(mapName);
            });
            return;
        }

        renderCrates(mapName);
    }

    function initializeWhenReady() {
        // Bind Settings as early as possible so the panel can always be opened,
        // even if optional controls are still missing/loading.
        bindControlsToggleButton();

        if (!canInitialize()) {
            $.Schedule(0.03, initializeWhenReady);
            return;
        }

        init();
    }

    initializeWhenReady();
})();

