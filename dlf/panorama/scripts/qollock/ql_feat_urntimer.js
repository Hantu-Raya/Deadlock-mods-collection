// ql_feat_urntimer.js — Rift timer and urn spawn timer in the top bar (QOLLOCK's panel, DLF's data).
// No rift time is networked (server RandomFloat(±60) per rift, client 6813 RE), so nothing shows
// before the warning: a spectator's minimap marks the rift's .map_button.capture_point with
// .koth_warning only 20 s before it opens, and #KothCashInMeter is visible while it is open (live,
// Observer HUD, demo 121685912, 2026-10-22; observer_hud/docs/adr/0007-no-rift-estimate.md).
// The QOLLOCK copy showed a ±60 s range centred on 12:20 the whole time and read "open" from the
// marker's .active class; DLF ADR 0008 drops the range.
// Urn (Observer HUD's cue, live there on 6813): the urn spawns at 10:00 and every 5:00 (game clock).
// #UrnSpawnTimer counts the last cues.urn seconds before a spawn (0 off, -1 always) and reads UP for
// URN_UP_SEC after it. QOLLOCK's #UrnTracker beside it is the soul lead, not the urn.
(function() {
    'use strict';
    var _featureId = "ql_feat_urntimer";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "getGameSecondsForUrn", "isConnectedToHideout", "panelIdTopBar",
        "resolveCachedPanel", "ensureMinimapPanelCache", "dlfCues"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
    var IsConnectedToHideout = _deps.isConnectedToHideout;
    var PANEL_ID_TOP_BAR = _deps.panelIdTopBar;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var DlfCues = _deps.dlfCues;

    // ── Constants ──
    var RIFT_EARLY_WARNING_SEC = 20;           // koth_warning → rift opens (spectator minimap)
    var RIFT_MINIMAP_POLL_INTERVAL_MS = 500;
    var RIFT_DEBUG = false;
    var _debugLogIntervalMs = 2000;
    var URN_FIRST_SEC = 600;
    var URN_EVERY_SEC = 300;
    var URN_UP_SEC = 15;
    var _cueSec = -1;
    var _cues = null;
    // The show windows, read again once per game second.
    function Cues(gameSec) {
        if (!_cues || gameSec !== _cueSec) {
            _cueSec = gameSec;
            _cues = DlfCues ? DlfCues() : null;
        }
        return _cues || { bridge: -1, urn: 30, rift: -1, mid: -1 };
    }

    function _debugLog(msg) {
        if (!RIFT_DEBUG) return;
        var now = Date.now ? Date.now() : (new Date()).getTime();
        var last = State._riftDebugLastLogMs || 0;
        if (now - last < _debugLogIntervalMs) return;
        State._riftDebugLastLogMs = now;
        $.Msg("[QOLLock][RIFT] " + msg);
    }

    function FormatClockMmSs(totalSec) {
        var s = Math.max(0, Math.floor(Number(totalSec) || 0));
        var mm = Math.floor(s / 60);
        var ss = s % 60;
        return String(mm) + ":" + (ss < 10 ? "0" + ss : String(ss));
    }

    function FindFirstPanelByClass(panel, className) {
        if (!panel || !panel.FindChildrenWithClassTraverse) return null;
        var matches = panel.FindChildrenWithClassTraverse(className) || [];
        return matches.length > 0 ? matches[0] : null;
    }


    function ScanMinimapForRift(root) {
        // Any capture-point map button with .koth_warning: the 20 s warning.
        var minimapIDs = ["hud_minimap", "minimap_persp", "minimap_container",
            "minimap_frame", "HudMinimapContainer"];
        var minimapPanel = null;
        for (var m = 0; m < minimapIDs.length; m++) {
            var p = root ? root.FindChildTraverse(minimapIDs[m]) : null;
            if (p) { minimapPanel = p; break; }
        }
        if (!minimapPanel || !minimapPanel.FindChildrenWithClassTraverse) {
            return { hasCapturePoint: false, hasKothWarning: false, isActive: false };
        }
        var mapButtons = minimapPanel.FindChildrenWithClassTraverse("map_button") || [];
        var warning = false;
        for (var i = 0; i < mapButtons.length && !warning; i++) {
            var btn = mapButtons[i];
            if (!IsPanelValid(btn) || !btn.BHasClass || !btn.BHasClass("capture_point")) continue;
            warning = btn.BHasClass("koth_warning");
        }
        _debugLog("RIFT scan: warning=" + warning + " btns=" + mapButtons.length);
        return { hasCapturePoint: warning, hasKothWarning: warning, isActive: false };
    }

    // The stock capture meter shows while the rift is open. An ended rift keeps it visible (opacity 0
    // after a 5 s fade) with .captured (a team took it) or .captured_neutral (time ran out, "Rift faded
    // away") until the next one (citadel_hud_koth.css, GameTracking 6860), so visibility alone is not open.
    function IsRiftOpen(root) {
        var koth = GetCachedPanel("riftKothMeter");
        if (!IsPanelValid(koth) && root && root.FindChildTraverse) {
            koth = root.FindChildTraverse("KothCashInMeter");
            SetCachedPanel("riftKothMeter", koth || null);
        }
        return IsPanelValid(koth) && koth.visible === true &&
            !koth.BHasClass("captured") && !koth.BHasClass("captured_neutral");
    }

    function CheckMinimapRiftState(root, nowMs) {
        var lastCheck = State.riftTimerLastCapturePointCheckMs || 0;
        if (nowMs - lastCheck < RIFT_MINIMAP_POLL_INTERVAL_MS) {
            return {
                hasCapturePoint: !!State.riftTimerCapturePointValid,
                isActive: !!State.riftTimerRiftIsActive,
                inWarning: !!State.riftTimerWarningActive
            };
        }
        State.riftTimerLastCapturePointCheckMs = nowMs;
        var scan = ScanMinimapForRift(root);
        State.riftTimerCapturePointValid = scan.hasCapturePoint;
        State.riftTimerRiftIsActive = scan.isActive;
        State.riftTimerWarningActive = scan.hasKothWarning;
        return { hasCapturePoint: scan.hasCapturePoint,
            isActive: scan.isActive, inWarning: scan.hasKothWarning };
    }

    function EnsureRiftTimerPanel(root) {
        var panel = GetCachedPanel("riftTimerPanel");
        var label = GetCachedPanel("riftTimerLabel");
        if (panel && label && label.GetParent && label.GetParent() === panel)
            return panel;
        panel = root ? root.FindChildTraverse("RiftTimer") : null;
        if (!panel) {
            var parent = null;
            var topBar = root ? root.FindChildTraverse(PANEL_ID_TOP_BAR) : null;
            if (topBar) parent = FindFirstPanelByClass(topBar, "TeamNetworth");
            if (!parent && root) parent = FindFirstPanelByClass(root, "TeamNetworth");
            if (!parent && topBar) parent = topBar;
            if (!parent) return null;
            panel = $.CreatePanel("Panel", parent, "RiftTimer", {
                "class": "RiftTimer", hittest: "false",
                hittestchildren: "false", visible: "true"
            });
        }
        if (!panel) return null;
        var icon = panel.FindChildTraverse("RiftTimerRiftIcon");
        if (!icon) {
            icon = $.CreatePanel("Panel", panel, "RiftTimerRiftIcon", {
                "class": "RiftTimerRiftIcon", hittest: "false"
            });
        }
        label = panel.FindChildTraverse("RiftTimerLabel");
        if (!label) {
            label = $.CreatePanel("Label", panel, "RiftTimerLabel", {
                "class": "RiftTimerLabel", text: ""
            });
        }
        SetCachedPanel("riftTimerPanel", panel);
        SetCachedPanel("riftTimerLabel", label);
        return panel;
    }

    function HideRiftTimerPanel(root) {
        var panel = GetCachedPanel("riftTimerPanel");
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse("RiftTimer");
            if (IsPanelValid(panel)) SetCachedPanel("riftTimerPanel", panel);
        }
        if (IsPanelValid(panel)) panel.visible = false;
    }

    function ResolveRiftMode(root, gameSec, nowMs) {
        if (IsRiftOpen(root)) {
            State.riftTimerWarningGameSec = 0;
            return "active";
        }
        var state = CheckMinimapRiftState(root, nowMs);
        var prevMode = State.riftTimerDisplayMode || "idle";
        if (state.inWarning) {
            // A seek back past the first sight restarts the countdown.
            if (prevMode !== "warning" || gameSec < (State.riftTimerWarningGameSec || 0)) State.riftTimerWarningGameSec = gameSec;
            return "warning";
        }
        State.riftTimerWarningGameSec = 0;
        return "idle";
    }

    // ── Urn spawn timer ──
    var _urnPanel = null;
    var _urnLabel = null;
    var _urnText = null;

    // "UP" for URN_UP_SEC after each spawn, the time left in the last `win` s before one, else "".
    function UrnText(gameSec, win) {
        if (!win) return "";
        var since = gameSec < URN_FIRST_SEC ? -1 : (gameSec - URN_FIRST_SEC) % URN_EVERY_SEC;
        if (since >= 0 && since < URN_UP_SEC) return "UP";
        var next = gameSec <= URN_FIRST_SEC ? URN_FIRST_SEC
            : URN_FIRST_SEC + Math.ceil((gameSec - URN_FIRST_SEC) / URN_EVERY_SEC) * URN_EVERY_SEC;
        var left = next - gameSec;
        return left > 0 && (win < 0 || left <= win) ? FormatClockMmSs(left) : "";
    }

    // Made beside the rift timer (in .TeamNetworth) the first time it has something to show.
    function EnsureUrnSpawnPanel(root) {
        if (IsPanelValid(_urnPanel) && IsPanelValid(_urnLabel)) return _urnPanel;
        var topBar = root ? root.FindChildTraverse(PANEL_ID_TOP_BAR) : null;
        var parent = topBar ? FindFirstPanelByClass(topBar, "TeamNetworth") : null;
        if (!parent) parent = topBar;
        if (!parent) return null;
        _urnPanel = parent.FindChildTraverse("UrnSpawnTimer") ||
            $.CreatePanel("Panel", parent, "UrnSpawnTimer", { "class": "UrnSpawnTimer", hittest: "false", hittestchildren: "false" });
        if (!_urnPanel.FindChildTraverse("UrnSpawnTimerIcon")) {
            $.CreatePanel("Panel", _urnPanel, "UrnSpawnTimerIcon", { "class": "UrnSpawnTimerIcon", hittest: "false" });
        }
        _urnLabel = _urnPanel.FindChildTraverse("UrnSpawnTimerLabel") ||
            $.CreatePanel("Label", _urnPanel, "UrnSpawnTimerLabel", { "class": "UrnSpawnTimerLabel", text: "" });
        return _urnPanel;
    }

    // Written only when the text changes; "" hides it (an explicit visible = false, never a style clear).
    function ShowUrnSpawn(root, text) {
        if (text === _urnText && (!text || IsPanelValid(_urnPanel))) return;
        _urnText = text;
        if (!text) {
            if (IsPanelValid(_urnPanel)) {
                _urnPanel.visible = false;
                _urnPanel.SetHasClass("show", false);
            }
            return;
        }
        var panel = EnsureUrnSpawnPanel(root);
        if (!panel) {
            _urnText = null;
            return;
        }
        _urnLabel.text = text;
        panel.visible = true;
        panel.SetHasClass("show", true);
        panel.SetHasClass("urn_up", text === "UP");
    }

    function ResetRiftState(mode) {
        State.riftTimerDisplayMode = mode;
        State.riftTimerLastText = "";
        State.riftTimerLastMode = "";
        State.riftTimerWarningGameSec = 0;
        State.riftTimerWarningActive = false;
        State.riftTimerLastCapturePointCheckMs = 0;
        State.riftTimerCapturePointValid = false;
        State.riftTimerRiftIsActive = false;
    }

    var _hasLoggedStartup = false;

    function UpdateRiftTimer(root, cfg, nowMs) {
        if (!root) return;
        var enabled = IsCfgEnabled(cfg, "ENABLE_URN_TIMER");
        var inHideout = IsConnectedToHideout(root);

        if (!_hasLoggedStartup) {
            _hasLoggedStartup = true;
            $.Msg("[QOLLock][RIFT] STARTUP: enabled=" + enabled +
                " hideout=" + inHideout +
                " ENABLE_URN_TIMER=" + cfg.ENABLE_URN_TIMER);
        }
        if (!enabled || inHideout) {
            HideRiftTimerPanel(root);
            ShowUrnSpawn(root, "");
            ResetRiftState(inHideout ? "hideout" : "disabled");
            return;
        }
        var gameSec = GetGameSecondsForUrn(root);
        if (gameSec <= 0) return;
        var cues = Cues(gameSec);
        ShowUrnSpawn(root, UrnText(gameSec, cues.urn));
        // Rift OFF in the editor: hidden, and its warning forgotten.
        if (cues.rift === 0) {
            if (State.riftTimerDisplayMode !== "off") {
                HideRiftTimerPanel(root);
                ResetRiftState("off");
            }
            return;
        }
        var mode = ResolveRiftMode(root, gameSec, nowMs);
        State.riftTimerDisplayMode = mode;
        var displayText = "";
        if (mode === "warning") {
            var elapsed = Math.max(0, gameSec - (State.riftTimerWarningGameSec || gameSec));
            var remaining = Math.max(0, RIFT_EARLY_WARNING_SEC - elapsed);
            displayText = remaining > 0 ? FormatClockMmSs(remaining) : "ACTIVE";
        } else if (mode === "active") {
            displayText = "ACTIVE";
        }
        if (State.riftTimerLastText === displayText && State.riftTimerLastMode === mode)
            return;
        _debugLog("DISPLAY: mode=" + mode + " text='" + displayText + "' gameSec=" + gameSec);
        State.riftTimerLastText = displayText;
        State.riftTimerLastMode = mode;
        if (mode === "idle") {
            HideRiftTimerPanel(root);
            return;
        }
        var panel = EnsureRiftTimerPanel(root);
        var label = GetCachedPanel("riftTimerLabel");
        if (!panel || !label) return;
        label.text = displayText;
        panel.visible = true;
        try {
            if (panel.SetHasClass) {
                panel.SetHasClass("rift_warning", mode === "warning");
                panel.SetHasClass("rift_active", mode === "active");
                panel.SetHasClass("rift_idle", false);
            }
        } catch(e) {}
    }

    QOL.register("urnTimer", {
        configKeys: ["ENABLE_URN_TIMER"],
        bucket: 0, phase: 0,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_URN_TIMER"); },
        requiresRoot: true,
        update: function(root, cfg, nowMs) {
            try { UpdateRiftTimer(root, cfg, nowMs); }
            catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " +
                    (e && e.message ? e.message : String(e)));
                throw e;
            }
        },
        stateKeys: ["riftTimerDisplayMode", "riftTimerLastText",
            "riftTimerWarningGameSec",
            "riftTimerWarningActive", "riftTimerLastCapturePointCheckMs",
            "riftTimerCapturePointValid", "riftTimerRiftIsActive",
            "riftTimerLastMode"]
    });
})();
