"use strict";

(function () {
    var BRIDGE_REQUEST_PAYLOAD_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_PAYLOAD";
    var BRIDGE_REQUEST_TOKEN_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_TOKEN";
    var BRIDGE_REQUEST_STATE_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_STATE";
    var BRIDGE_REQUEST_MSG_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_MSG";
    var BRIDGE_TOKEN_PREFIX = "[DMM-1]:";
    var BRIDGE_TOKEN_EXTRACT_REGEX = /(\[DMM-1\]:[A-Za-z0-9\.\-_,|=:+]+)/i;

    var PROCESS_TICK_SEC = 0.20;
    var SAVE_TIMEOUT_MS = 15000;
    var SAVE_WRITE_INTERVAL_MS = 300;
    var LOAD_SCAN_TICK_SEC = 1.0;
    var LOAD_SCAN_TTL_MS = 60000;
    var LOAD_NUDGE_INTERVAL_MS = 3000;

    var saveActiveToken = "";
    var saveStartedMs = 0;
    var saveNextWriteMs = 0;
    var saveHadCommitAttempt = false;
    var saveVerifyNextMs = 0;
    var saveWriteAttempts = 0;
    var saveWriteRetryAfterMs = 0;
    var SAVE_WRITE_MAX_ATTEMPTS = 2;
    var SAVE_WRITE_RETRY_INTERVAL_MS = 5000;
    var loadScanStartedMs = 0;
    var loadNudgeNextMs = 0;

    function nowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
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
            try { panel.SetAttributeString(attrName, String(valueText)); } catch (eP0) {}
        }
        if (root && typeof root.SetAttributeString === "function") {
            try { root.SetAttributeString(attrName, String(valueText)); } catch (eR0) {}
        }
        if (hud && typeof hud.SetAttributeString === "function") {
            try { hud.SetAttributeString(attrName, String(valueText)); } catch (eH0) {}
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

    function isVerificationReadablePanel(panel) {
        if (!isPanelObject(panel)) {
            return false;
        }

        var panelId = "";
        try {
            panelId = String(panel.id || "");
        } catch (eId) {
            panelId = "";
        }

        // Avoid false-positive verification from editable text entry field.
        if (panelId === "CategoryNameTextEntry") {
            return false;
        }

        if (panelId.indexOf("TextEntry") >= 0) {
            return false;
        }

        return true;
    }

    function extractBridgeTokenFromText(rawText) {
        if (!rawText || typeof rawText !== "string") {
            return "";
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

        pushUnique(root.FindChildTraverse("ShopModsSelectedBuild"));
        pushUnique(root.FindChildTraverse("CitadelHudHeroBuilds"));
        pushUnique(root.FindChildTraverse("HeroBuildSelector"));
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
        while (stack.length > 0 && scanned < 1800) {
            var panel = stack.pop();
            if (!isPanelObject(panel)) {
                continue;
            }
            scanned++;
            if (isVerificationReadablePanel(panel)) {
                var token = extractBridgeTokenFromText(readPanelTextMaybe(panel));
                if (token) {
                    return token;
                }
            }
            var childCount = 0;
            try {
                childCount = panel.GetChildCount ? panel.GetChildCount() : 0;
            } catch (eCount) {
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
            if (typeof entryPanel.SetText === "function") {
                entryPanel.SetText(String(valueText));
                ok = true;
            }
        } catch (eSetText) {}

        try {
            entryPanel.text = String(valueText);
            ok = true;
        } catch (eText) {}
        try {
            if (typeof entryPanel.SetAttributeString === "function") {
                entryPanel.SetAttributeString("text", String(valueText));
                ok = true;
            }
        } catch (eAttr) {}
        try { $.DispatchEvent("ontextentrychange", entryPanel); } catch (eD0) {}
        try { $.DispatchEvent("TextEntryChanged", entryPanel); } catch (eD1) {}
        try { $.DispatchEvent("oninputsubmit", entryPanel); } catch (eD2) {}
        try { $.DispatchEvent("TextEntrySubmit", entryPanel); } catch (eD3) {}
        try {
            if (typeof entryPanel.Submit === "function") {
                entryPanel.Submit();
                ok = true;
            }
        } catch (eSubmit) {}
        return ok;
    }

    function activatePanelSafe(panel) {
        if (!isPanelObject(panel)) {
            return false;
        }
        var attempts = [
            function () { if (typeof panel.Activate === "function") panel.Activate(); },
            function () { $.DispatchEvent("MouseActivate", panel, "mouse"); },
            function () { $.DispatchEvent("MouseActivate", panel); },
            function () { $.DispatchEvent("Activated", panel, "mouse"); },
            function () { $.DispatchEvent("Activated", panel); },
            function () { $.DispatchEvent("onactivate", panel); }
        ];
        for (var i = 0; i < attempts.length; i++) {
            try {
                attempts[i]();
                return true;
            } catch (eAttempt) {}
        }
        return false;
    }

    function triggerBuildEditMode(selectedBuild) {
        var activated = false;
        try {
            if (typeof CitadelHudHeroBuildsEditSelectedBuild === "function") {
                CitadelHudHeroBuildsEditSelectedBuild();
                activated = true;
            }
        } catch (eFn) {}

        if (selectedBuild && selectedBuild.FindChildTraverse) {
            var editButton = null;
            try { editButton = selectedBuild.FindChildTraverse("EditHeroBuildButton"); } catch (eBtn) { editButton = null; }
            if (editButton && activatePanelSafe(editButton)) {
                activated = true;
            }
        }
        return activated;
    }

    function triggerBuildSaveCommit(selectedBuild) {
        var activated = false;
        try {
            if (typeof CitadelHudHeroBuildsSaveEdits === "function") {
                CitadelHudHeroBuildsSaveEdits();
                activated = true;
            }
        } catch (eFn) {}

        if (selectedBuild && selectedBuild.FindChildTraverse) {
            var saveButton = null;
            try { saveButton = selectedBuild.FindChildTraverse("SaveBuildButton"); } catch (eBtn) { saveButton = null; }
            if (saveButton && activatePanelSafe(saveButton)) {
                activated = true;
            }
        }
        return activated;
    }

    function tryWriteBridgeTokenToBuildUi(tokenText) {
        var root = findRootPanel();
        if (!root || typeof root.FindChildTraverse !== "function") {
            return { ok: false, message: "missing-root" };
        }

        var selectedBuild = root.FindChildTraverse("ShopModsSelectedBuild");
        var hudBuilds = root.FindChildTraverse("CitadelHudHeroBuilds");
        var entry = hudBuilds && hudBuilds.FindChildTraverse ? hudBuilds.FindChildTraverse("CategoryNameTextEntry") : null;
        if (!entry) {
            entry = root.FindChildTraverse("CategoryNameTextEntry");
        }

        if (!selectedBuild || !entry) {
            return { ok: false, message: "build-ui-not-ready" };
        }

        triggerBuildEditMode(selectedBuild);
        if (!setTextEntryValue(entry, tokenText)) {
            return { ok: false, message: "entry-write-failed" };
        }

        if (!triggerBuildSaveCommit(selectedBuild)) {
            return { ok: false, message: "save-click-failed" };
        }

        return { ok: true, message: "build-ui-save-clicked" };
    }

    function tryNudgeBuildUiContext() {
        // Do not auto-open or manipulate build/shop UI in background.
        return false;
    }

    function resetSaveRuntime() {
        saveActiveToken = "";
        saveStartedMs = 0;
        saveNextWriteMs = 0;
        saveHadCommitAttempt = false;
        saveVerifyNextMs = 0;
        saveWriteAttempts = 0;
        saveWriteRetryAfterMs = 0;
    }

    function processBridgeSaveRequests() {
        var requestState = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_STATE_ATTR) || "");
        if (requestState !== "pending") {
            resetSaveRuntime();
            return;
        }

        var payload = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR) || "");
        var reqToken = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_TOKEN_ATTR) || "");
        if (!payload || payload.indexOf(BRIDGE_TOKEN_PREFIX) !== 0 || !reqToken) {
            setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "invalid-request");
            setAttrOnPersistencePanels(BRIDGE_REQUEST_STATE_ATTR, "failed");
            resetSaveRuntime();
            return;
        }

        var now = nowMs();
        if (saveActiveToken !== reqToken) {
            saveActiveToken = reqToken;
            saveStartedMs = now;
            saveNextWriteMs = 0;
            saveHadCommitAttempt = false;
            saveVerifyNextMs = 0;
            saveWriteAttempts = 0;
            saveWriteRetryAfterMs = 0;
            setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "processor-started");
        }

        if (saveHadCommitAttempt && now >= saveVerifyNextMs && (now - saveStartedMs) > 600) {
            var foundToken = tryFindBridgeTokenInBuildUi();
            saveVerifyNextMs = now + 1000;
            if (foundToken && foundToken === payload) {
                setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "build-ui-verified");
                setAttrOnPersistencePanels(BRIDGE_REQUEST_STATE_ATTR, "success");
                resetSaveRuntime();
                return;
            }
        }

        if ((now - saveStartedMs) > SAVE_TIMEOUT_MS) {
            setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "build-ui-timeout");
            setAttrOnPersistencePanels(BRIDGE_REQUEST_STATE_ATTR, "failed");
            resetSaveRuntime();
            return;
        }

        if (saveWriteAttempts < SAVE_WRITE_MAX_ATTEMPTS && now >= saveWriteRetryAfterMs && now >= saveNextWriteMs) {
            var write = tryWriteBridgeTokenToBuildUi(payload);
            setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, write.message);
            saveNextWriteMs = now + SAVE_WRITE_INTERVAL_MS;
            saveWriteAttempts++;
            if (write.ok) {
                saveHadCommitAttempt = true;
                saveVerifyNextMs = now + 600;
                saveWriteRetryAfterMs = now + 60000;
            } else {
                saveWriteRetryAfterMs = now + SAVE_WRITE_RETRY_INTERVAL_MS;
            }
        }
    }

    function processBridgeLoadDiscovery() {
        var currentPayload = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR) || "");
        if (currentPayload && currentPayload.indexOf(BRIDGE_TOKEN_PREFIX) === 0) {
            return;
        }

        var foundToken = tryFindBridgeTokenInBuildUi();
        if (foundToken) {
            setAttrOnPersistencePanels(BRIDGE_REQUEST_PAYLOAD_ATTR, foundToken);
            setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "build-ui-found");
            return;
        }
    }

    function tickSaveProcessor() {
        processBridgeSaveRequests();
        $.Schedule(PROCESS_TICK_SEC, tickSaveProcessor);
    }

    function tickLoadScanner() {
        var now = nowMs();
        if (loadScanStartedMs <= 0) {
            loadScanStartedMs = now;
        }
        if ((now - loadScanStartedMs) > LOAD_SCAN_TTL_MS) {
            return;
        }
        processBridgeLoadDiscovery();
        $.Schedule(LOAD_SCAN_TICK_SEC, tickLoadScanner);
    }

    function init() {
        $.Msg("[minimap_overlay][bridge] processor init (QOL-like)");
        tickSaveProcessor();
        tickLoadScanner();
    }

    init();
})();
