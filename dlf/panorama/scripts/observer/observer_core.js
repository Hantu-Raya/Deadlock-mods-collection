// Minimal QOL bridge and observer-only runtime support.
// This deliberately excludes settings, presets, storage, build tools, and save/load code.
var QOL = (typeof QOL !== "undefined") ? QOL : {};
var QOL_WARN = (typeof QOL_WARN !== "undefined") ? QOL_WARN : function(scope, message) {
    if (typeof $ !== "undefined" && $.Msg) {
        $.Msg("[QOLLOCK Spectator][" + scope + "] " + message);
    }
};

var OBSERVER_PACK = (function() {
    "use strict";

    var PANEL_ID_TOP_BAR = "TopBar";
    var PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
    var PANEL_ID_ABILITIES = "AbilitiesContainer";
    var SOUL_SAMPLE_INTERVAL_MS = 280;
    var SOUL_PANEL_REFRESH_MS = 4200;

    var CONFIG = {
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_URN_TIMER: 1,
        ENABLE_MINIMALISTIC_PAUSE: 1,

        // Per-player purchase notices are dlf/dlf_buys.js (always on, 3 at most, 5 s each).

        // The imported QOL timer module also supports minimap variants. They stay off
        // so this pack remains limited to the requested observer top-bar features.
        ENABLE_MINIMAP_BUFF_TIMER: 0,
        ENABLE_MINIMAP_REJUV_TIMER: 0,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 0,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 0,
        ENABLE_ALT_ZOOM: 0,
        ENABLE_TAB_ZOOM: 0,
        MINIMAP_SMALL_SIZE: 400
    };

    var State = {
        cachedPanels: {},
        lastConfig: CONFIG,
        runtimeRoot: null,
        minimapObjectiveBuffClassCache: {},
        minimapObjectiveBuffBridgeLeftClassCache: {},
        minimapObjectiveBuffBridgeRightClassCache: {},
        minimapObjectiveRejuvClassCache: {}
    };

    function IsPanelValid(panel) {
        try {
            return panel != null && typeof panel.IsValid === "function" && panel.IsValid();
        } catch (e) {
            return false;
        }
    }

    function IsPanelListValid(list) {
        if (!list || list.length === 0) return false;
        for (var i = 0; i < list.length; i++) {
            if (!IsPanelValid(list[i])) return false;
        }
        return true;
    }

    function IsCfgEnabled(cfg, key) {
        if (!cfg || !key) return false;
        var value = Number(cfg[key]);
        return isFinite(value) && value === 1;
    }

    function NormalizeOpacityNumber(value, fallback) {
        var fallbackValue = Number(fallback);
        if (!isFinite(fallbackValue)) fallbackValue = 1;
        var result = Number(value);
        if (!isFinite(result)) result = fallbackValue;
        if (result < 0) result = 0;
        if (result > 1) result = 1;
        return result;
    }

    function SetPanelOpacitySafe(panel, value, fallback) {
        if (!panel || !panel.style) return "";
        var text = NormalizeOpacityNumber(value, fallback).toFixed(2);
        try {
            if (panel.style.opacity !== text) panel.style.opacity = text;
        } catch (e0) {
            try { panel.style.opacity = "1.00"; } catch (e1) {}
        }
        return text;
    }

    function NormalizeHudOffsetNumber(value, fallback) {
        var result = Math.round(Number(value));
        if (!isFinite(result)) result = Math.round(Number(fallback) || 0);
        if (!isFinite(result)) result = 0;
        return result;
    }

    function NormalizeHudScaleNumber(value, fallback) {
        var result = Number(value);
        if (!isFinite(result)) result = Number(fallback);
        if (!isFinite(result)) result = 1;
        if (result < 0.5) result = 0.5;
        if (result > 1.5) result = 1.5;
        return result;
    }

    function ReadSafePanelLayoutOffset(value) {
        var result = Number(value);
        if (!isFinite(result) || Math.abs(result) > 100000) return null;
        return result;
    }

    function WarnLog(scope, message) {
        QOL_WARN(scope, message);
    }

    function IsPanelVisibleMaybe(panel) {
        if (!IsPanelValid(panel)) return false;
        try { if (panel.visible === false) return false; } catch (e0) {}
        var visibility = "";
        try {
            if (panel.style && panel.style.visibility !== undefined && panel.style.visibility !== null) {
                visibility = String(panel.style.visibility || "").toLowerCase();
            }
        } catch (e1) {}
        return visibility !== "collapse" && visibility !== "none" && visibility !== "hidden";
    }

    var Utils = {
        IsPanelValid: IsPanelValid,
        IsCfgEnabled: IsCfgEnabled,
        SetPanelOpacitySafe: SetPanelOpacitySafe,
        NormalizeOpacityNumber: NormalizeOpacityNumber,
        NormalizeHudOffsetNumber: NormalizeHudOffsetNumber,
        NormalizeHudScaleNumber: NormalizeHudScaleNumber,
        ReadSafePanelLayoutOffset: ReadSafePanelLayoutOffset,
        HasClassInHierarchy: HasClassInHierarchy,
        WarnLog: WarnLog
    };

    function PerfNowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    function GetCachedPanel(key) {
        var panel = State.cachedPanels[key];
        if (!IsPanelValid(panel)) {
            State.cachedPanels[key] = null;
            return null;
        }
        return panel;
    }

    function SetCachedPanel(key, panel) {
        State.cachedPanels[key] = IsPanelValid(panel) ? panel : null;
        return State.cachedPanels[key];
    }

    function ResolveCachedPanel(root, cacheKey, panelId) {
        var panel = GetCachedPanel(cacheKey);
        if (panel) return panel;
        if (!root || !root.FindChildTraverse) return null;
        try {
            panel = root.FindChildTraverse(panelId) || null;
        } catch (e) {
            panel = null;
        }
        SetCachedPanel(cacheKey, panel);
        return panel;
    }

    function EnsurePanelClassCache(cacheObj, panel) {
        if (!cacheObj) return;
        if (cacheObj.panel !== panel) {
            cacheObj.panel = panel;
            cacheObj.values = {};
        }
    }

    function SetPanelClassCached(panel, cacheObj, className, enabled) {
        if (!panel || !cacheObj || !className || !panel.SetHasClass) return false;
        EnsurePanelClassCache(cacheObj, panel);
        var value = !!enabled;
        if (cacheObj.values[className] === value) return false;
        panel.SetHasClass(className, value);
        cacheObj.values[className] = value;
        return true;
    }

    function SetPanelClassIfChanged(panel, className, enabled) {
        if (!panel || !className || !panel.SetHasClass) return;
        var value = !!enabled;
        try {
            if (panel.BHasClass && panel.BHasClass(className) === value) return;
            panel.SetHasClass(className, value);
        } catch (e) {}
    }

    function HasClassInHierarchy(panel, className) {
        var current = panel;
        var depth = 0;
        while (current && depth < 40) {
            try {
                if (current.BHasClass && current.BHasClass(className)) return true;
                current = current.GetParent ? current.GetParent() : null;
            } catch (e) {
                return false;
            }
            depth++;
        }
        return false;
    }

    function GetPanelClassTokens(panel) {
        if (!panel || !panel.GetAttributeString) return [];
        var classAttr = "";
        try { classAttr = panel.GetAttributeString("class", ""); } catch (e) { return []; }
        if (!classAttr) return [];
        var split = String(classAttr).split(/\s+/);
        var result = [];
        for (var i = 0; i < split.length; i++) {
            if (split[i]) result.push(split[i]);
        }
        return result;
    }

    function PanelHasClassToken(panel, token) {
        if (!panel || !token) return false;
        try {
            if (panel.BHasClass && panel.BHasClass(token)) return true;
        } catch (e0) {}
        var classes = GetPanelClassTokens(panel);
        for (var i = 0; i < classes.length; i++) {
            if (classes[i] === token) return true;
        }
        var children = [];
        try { children = (panel.Children && panel.Children()) || []; } catch (e1) {}
        for (var j = 0; j < children.length; j++) {
            var child = children[j];
            try {
                if (child && child.BHasClass && child.BHasClass(token)) return true;
            } catch (e2) {}
            var childClasses = GetPanelClassTokens(child);
            for (var k = 0; k < childClasses.length; k++) {
                if (childClasses[k] === token) return true;
            }
        }
        return false;
    }

    function GetHighestRejuvChargeTokenOnPanel(panel) {
        if (!panel) return 0;
        var max = 0;

        function ScanNode(node) {
            if (!node) return;
            var tokens = GetPanelClassTokens(node);
            for (var i = 0; i < tokens.length; i++) {
                var token = tokens[i];
                if (!token || token.indexOf("RejuvCount_") !== 0) continue;
                var value = parseInt(token.slice("RejuvCount_".length), 10);
                if (isFinite(value) && value > max) max = value;
            }
            if (node.BHasClass) {
                for (var count = 1; count <= 4; count++) {
                    try {
                        if (node.BHasClass("RejuvCount_" + String(count)) && count > max) max = count;
                    } catch (e) {}
                }
            }
        }

        ScanNode(panel);
        var children = [];
        try { children = (panel.Children && panel.Children()) || []; } catch (e0) {}
        for (var i = 0; i < children.length; i++) ScanNode(children[i]);
        return max;
    }

    function ResolveRuntimeRoot(contextPanel) {
        if (IsPanelValid(State.runtimeRoot)) return State.runtimeRoot;
        var current = contextPanel;
        var highest = contextPanel;
        var depth = 0;
        while (current && depth < 40) {
            highest = current;
            try {
                if (current.FindChildTraverse) {
                    var topBar = current.FindChildTraverse(PANEL_ID_TOP_BAR);
                    var gameplayHud = current.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD);
                    if (topBar && gameplayHud) {
                        State.runtimeRoot = current;
                        return current;
                    }
                }
                current = current.GetParent ? current.GetParent() : null;
            } catch (e) {
                break;
            }
            depth++;
        }
        State.runtimeRoot = highest;
        return highest;
    }

    function IsHudClassActive(root, className) {
        if (!className) return false;
        try {
            if (root && root.BHasClass && root.BHasClass(className)) return true;
        } catch (e0) {}
        var gameplayHud = ResolveCachedPanel(root, "gameplayHud", PANEL_ID_GAMEPLAY_HUD);
        try {
            if (gameplayHud && gameplayHud.BHasClass && gameplayHud.BHasClass(className)) return true;
        } catch (e1) {}
        var abilities = ResolveCachedPanel(root, "abilitiesContainer", PANEL_ID_ABILITIES);
        try {
            if (abilities && abilities.BHasClass && abilities.BHasClass(className)) return true;
        } catch (e2) {}
        return false;
    }

    function IsStreetBrawlModeActive(root) {
        var gameplayHud = ResolveCachedPanel(root, "gameplayHud", PANEL_ID_GAMEPLAY_HUD);
        if (HasClassInHierarchy(gameplayHud, "gamemode_streetbrawl")) return true;
        return HasClassInHierarchy(root, "gamemode_streetbrawl");
    }

    function IsConnectedToHideout(root) {
        var hud = ResolveCachedPanel(root, "cachedHudPanel", "Hud");
        if (HasClassInHierarchy(hud, "connectedToHideout") || HasClassInHierarchy(hud, "InHideout")) return true;
        return HasClassInHierarchy(root, "connectedToHideout") || HasClassInHierarchy(root, "InHideout");
    }

    function ParseClockSeconds(text) {
        if (!text || typeof text !== "string") return 0;
        var match = text.match(/(\d+):(\d{1,2})/);
        if (!match) return 0;
        var minutes = parseInt(match[1], 10) || 0;
        var seconds = parseInt(match[2], 10) || 0;
        if (seconds > 59) seconds = seconds % 60;
        return (minutes * 60) + seconds;
    }

    function GetGameSecondsForUrn(root) {
        var gameTimePanel = GetCachedPanel("gameTime");
        if (!gameTimePanel && root && root.FindChildTraverse) {
            try {
                gameTimePanel = root.FindChildTraverse("HudGameTime") || root.FindChildTraverse("GameTime");
            } catch (e) {
                gameTimePanel = null;
            }
            SetCachedPanel("gameTime", gameTimePanel);
        }
        return gameTimePanel && gameTimePanel.text ? ParseClockSeconds(String(gameTimePanel.text)) : 0;
    }

    function EnsureMinimapOverlayAnchor(root) {
        if (!root || !root.FindChildTraverse) return null;
        var anchor = GetCachedPanel("minimapObjectiveTimersAnchor");
        if (!anchor) {
            try {
                anchor = root.FindChildTraverse("minimap_container") || root.FindChildTraverse("minimap_persp");
            } catch (e) {
                anchor = null;
            }
            SetCachedPanel("minimapObjectiveTimersAnchor", anchor);
        }
        return anchor;
    }

    function EnsureMinimapPanelCache(root) {
        if (State.cachedPanels.minimap && IsPanelListValid(State.cachedPanels.minimap)) {
            return State.cachedPanels.minimap;
        }
        var panels = [];
        var ids = ["minimap_persp", "minimap_container", "minimap_frame", "HudMinimapContainer", "hud_minimap"];
        if (root && root.FindChildTraverse) {
            for (var i = 0; i < ids.length; i++) {
                var panel = null;
                try { panel = root.FindChildTraverse(ids[i]); } catch (e) {}
                if (panel) panels.push(panel);
            }
        }
        State.cachedPanels.minimap = panels;
        return panels;
    }

    function FindFirstPanelByClass(panel, className) {
        if (!panel || !panel.FindChildrenWithClassTraverse) return null;
        var matches = [];
        try { matches = panel.FindChildrenWithClassTraverse(className) || []; } catch (e) {}
        return matches.length > 0 ? matches[0] : null;
    }

    function ApplyStaticRootClasses(root) {
        var panels = [root, ResolveCachedPanel(root, "topBarPanel", PANEL_ID_TOP_BAR)];
        var classNames = ["buff_hud_disabled", "rejuv_hud_disabled", "urn_diff_disabled", "rift_timer_disabled"];
        for (var i = 0; i < panels.length; i++) {
            for (var j = 0; j < classNames.length; j++) {
                SetPanelClassIfChanged(panels[i], classNames[j], false);
            }
            SetPanelClassIfChanged(panels[i], "shop_recent_purchases_active", false);
            SetPanelClassIfChanged(panels[i], "shop_item_notifications_active", true);
            SetPanelClassIfChanged(panels[i], "shop_recent_purchases_redux", true);
            SetPanelClassIfChanged(panels[i], "minimal_pause_active", true);
        }
    }

    // ---------------------------------------------------------------------
    // Soul difference — extracted from the current qollock-codex ql_core.js.
    // ---------------------------------------------------------------------

    function RefreshSoulScoreCache(root, nowMs) {
        if (!root) return;
        var nextSearchMs = Number(State.soulDiffNextPanelSearchMs) || 0;
        var teamsContainer = GetCachedPanel("soulDiffTeamsContainer");
        var friendlyTeamPanel = GetCachedPanel("soulDiffFriendlyTeamPanel");
        var enemyTeamPanel = GetCachedPanel("soulDiffEnemyTeamPanel");
        var friendlyLabels = Array.isArray(State.cachedPanels.soulDiffFriendlyGoldLabels) ? State.cachedPanels.soulDiffFriendlyGoldLabels : null;
        var enemyLabels = Array.isArray(State.cachedPanels.soulDiffEnemyGoldLabels) ? State.cachedPanels.soulDiffEnemyGoldLabels : null;
        var friendlyLabelsOk = friendlyLabels && friendlyLabels.length > 0 && friendlyLabels.every(IsPanelValid);
        var enemyLabelsOk = enemyLabels && enemyLabels.length > 0 && enemyLabels.every(IsPanelValid);
        var shouldRescan = nowMs >= nextSearchMs || !teamsContainer || !friendlyTeamPanel || !enemyTeamPanel || !friendlyLabelsOk || !enemyLabelsOk;
        if (!shouldRescan) return;

        var topBar = ResolveCachedPanel(root, "topBarPanel", PANEL_ID_TOP_BAR);
        if (!topBar) return;
        try { teamsContainer = topBar.FindChildTraverse("TeamsContainer") || null; } catch (e0) { teamsContainer = null; }
        SetCachedPanel("soulDiffTeamsContainer", teamsContainer);
        if (!teamsContainer) {
            State.soulDiffNextPanelSearchMs = nowMs + SOUL_PANEL_REFRESH_MS;
            return;
        }

        var friendlyCandidates = [];
        var enemyCandidates = [];
        try { friendlyCandidates = teamsContainer.FindChildrenWithClassTraverse("friend") || []; } catch (e1) {}
        if (friendlyCandidates.length === 0) {
            try { friendlyCandidates = teamsContainer.FindChildrenWithClassTraverse("team1") || []; } catch (e2) {}
        }
        try { enemyCandidates = teamsContainer.FindChildrenWithClassTraverse("enemy") || []; } catch (e3) {}
        if (enemyCandidates.length === 0) {
            try { enemyCandidates = teamsContainer.FindChildrenWithClassTraverse("team2") || []; } catch (e4) {}
        }

        friendlyTeamPanel = friendlyCandidates.length > 0 ? friendlyCandidates[0] : null;
        enemyTeamPanel = enemyCandidates.length > 0 ? enemyCandidates[0] : null;
        friendlyLabels = [];
        enemyLabels = [];
        var friendlySouls = [];
        var enemySouls = [];
        try {
            if (friendlyTeamPanel && friendlyTeamPanel.FindChildrenWithClassTraverse) {
                friendlyLabels = friendlyTeamPanel.FindChildrenWithClassTraverse("hiddenGoldValue") || [];
                friendlySouls = friendlyTeamPanel.FindChildrenWithClassTraverse("SoulsValue") || [];
            }
        } catch (e5) {}
        try {
            if (enemyTeamPanel && enemyTeamPanel.FindChildrenWithClassTraverse) {
                enemyLabels = enemyTeamPanel.FindChildrenWithClassTraverse("hiddenGoldValue") || [];
                enemySouls = enemyTeamPanel.FindChildrenWithClassTraverse("SoulsValue") || [];
            }
        } catch (e6) {}

        SetCachedPanel("soulDiffFriendlyTeamPanel", friendlyTeamPanel);
        SetCachedPanel("soulDiffEnemyTeamPanel", enemyTeamPanel);
        State.cachedPanels.soulDiffFriendlyGoldLabels = friendlyLabels;
        State.cachedPanels.soulDiffEnemyGoldLabels = enemyLabels;
        State.cachedPanels.soulDiffFriendlyGoldLabelsSouls = friendlySouls;
        State.cachedPanels.soulDiffEnemyGoldLabelsSouls = enemySouls;
        State.soulDiffNextPanelSearchMs = nowMs + SOUL_PANEL_REFRESH_MS;
    }

    // Visible top-bar souls: "950", "1.2k", "49k" (newer stock layouts bind gold as a string).
    function ParseShortSouls(text) {
        var match = String(text || "").replace(/<[^>]*>/g, "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([km])?/i);
        if (!match) return NaN;
        var scale = !match[2] ? 1 : (match[2].toLowerCase() === "k" ? 1000 : 1000000);
        return Math.round(parseFloat(match[1]) * scale);
    }

    function SumLabels(labels, parse) {
        if (labels.length === 0) return 0;
        var total = 0;
        for (var i = 0; i < labels.length; i++) {
            if (!IsPanelValid(labels[i])) return 0;
            var value = parse(labels[i].text);
            if (isFinite(value)) total += value;
        }
        return total;
    }

    function GetCachedTeamNetworth(labelsKey) {
        var labels = Array.isArray(State.cachedPanels[labelsKey]) ? State.cachedPanels[labelsKey] : [];
        var exact = SumLabels(labels, function(text) {
            return parseInt(String(text).replace(/,/g, ""), 10);
        });
        if (exact > 0) return exact;
        // {i:gold} can render empty when the engine only provides gold as a string.
        var souls = State.cachedPanels[labelsKey + "Souls"];
        return Array.isArray(souls) ? SumLabels(souls, ParseShortSouls) : 0;
    }

    function EnsureSoulDifferencePanel(root) {
        var panel = GetCachedPanel("soulDiffPanel");
        var label = GetCachedPanel("soulDiffLabel");
        try {
            if (panel && label && label.GetParent && label.GetParent() === panel) return panel;
        } catch (e0) {}

        try { panel = root ? root.FindChildTraverse("UrnTracker") : null; } catch (e1) { panel = null; }
        if (!panel) {
            var topBar = ResolveCachedPanel(root, "topBarPanel", PANEL_ID_TOP_BAR);
            var parent = topBar ? FindFirstPanelByClass(topBar, "TeamNetworth") : null;
            if (!parent && root) parent = FindFirstPanelByClass(root, "TeamNetworth");
            if (!parent && topBar) parent = topBar;
            if (!parent) return null;
            panel = $.CreatePanel("Panel", parent, "UrnTracker", {
                "class": "UrnTracker",
                hittest: "false",
                hittestchildren: "false",
                visible: "true"
            });
        }
        if (!panel) return null;

        try { label = panel.FindChildTraverse("UrnTrackerLabel"); } catch (e2) { label = null; }
        if (!label) {
            label = $.CreatePanel("Label", panel, "UrnTrackerLabel", {
                "class": "UrnTrackerLabel",
                text: "--"
            });
        }
        var soulIcon = null;
        try { soulIcon = panel.FindChildTraverse("UrnTrackerSoulIcon"); } catch (e3) {}
        if (!soulIcon) {
            $.CreatePanel("Panel", panel, "UrnTrackerSoulIcon", {
                "class": "UrnTrackerSoulIcon",
                hittest: "false"
            });
        }
        SetCachedPanel("soulDiffPanel", panel);
        SetCachedPanel("soulDiffLabel", label);
        return panel;
    }

    function SetSoulDifferenceVisual(panel, label, text, moodClass) {
        if (!panel || !label) return;
        var nextText = (text === undefined || text === null) ? "--" : String(text);
        if (State.soulDiffLastText !== nextText) {
            label.text = nextText;
            State.soulDiffLastText = nextText;
        }
        var nextMood = moodClass || "neutral";
        if (State.soulDiffLastClass !== nextMood) {
            panel.RemoveClass("good");
            panel.RemoveClass("bad");
            panel.RemoveClass("neutral");
            panel.AddClass(nextMood);
            State.soulDiffLastClass = nextMood;
        }
        if (!panel.BHasClass || !panel.BHasClass("show")) panel.AddClass("show");
        panel.visible = true;
    }

    function HideSoulDifferencePanel(root) {
        var panel = GetCachedPanel("soulDiffPanel");
        if (!panel && root && root.FindChildTraverse) {
            try { panel = root.FindChildTraverse("UrnTracker"); } catch (e) {}
            if (IsPanelValid(panel)) SetCachedPanel("soulDiffPanel", panel);
        }
        if (IsPanelValid(panel)) panel.visible = false;
    }

    function ComputeSoulDifference(root, nowMs) {
        var now = isFinite(Number(nowMs)) ? Number(nowMs) : PerfNowMs();
        if (now < (State.soulDiffNextSampleMs || 0) && State.soulDiffCachedState) {
            return State.soulDiffCachedState;
        }
        RefreshSoulScoreCache(root, now);
        var friendlyValue = GetCachedTeamNetworth("soulDiffFriendlyGoldLabels");
        var enemyValue = GetCachedTeamNetworth("soulDiffEnemyGoldLabels");
        var gameMinutes = GetGameSecondsForUrn(root) / 60;
        var result;

        if (friendlyValue <= 0 && enemyValue <= 0) {
            result = { friendlyValue: friendlyValue, enemyValue: enemyValue, mood: "neutral", display: "--" };
        } else if (friendlyValue > 0 && enemyValue <= 0) {
            result = { friendlyValue: friendlyValue, enemyValue: enemyValue, mood: "good", display: "100%" };
        } else if (enemyValue > 0 && friendlyValue <= 0) {
            result = { friendlyValue: friendlyValue, enemyValue: enemyValue, mood: "bad", display: "-100.0%" };
        } else {
            var higher = Math.max(friendlyValue, enemyValue);
            var lower = Math.min(friendlyValue, enemyValue);
            var differencePercent = higher > 0 ? ((higher - lower) / higher) * 100 : 0;
            if (friendlyValue < enemyValue) differencePercent *= -1;
            var threshold = gameMinutes < 15 ? 15 : 10;
            var mood = "neutral";
            if (differencePercent >= threshold) mood = "good";
            else if (differencePercent <= -threshold) mood = "bad";
            result = {
                friendlyValue: friendlyValue,
                enemyValue: enemyValue,
                mood: mood,
                display: (differencePercent > 0 ? "+" : "") + differencePercent.toFixed(1) + "%"
            };
        }

        State.soulDiffCachedState = result;
        State.soulDiffNextSampleMs = now + SOUL_SAMPLE_INTERVAL_MS;
        return result;
    }

    function UpdateSoulDifference(root, nowMs) {
        if (!root) return;
        if (!IsCfgEnabled(CONFIG, "ENABLE_URN_DIFF") ||
                IsConnectedToHideout(root) || IsStreetBrawlModeActive(root)) {
            HideSoulDifferencePanel(root);
            State.soulDiffNextSampleMs = 0;
            State.soulDiffCachedState = null;
            return;
        }
        var difference = ComputeSoulDifference(root, nowMs);
        var panel = EnsureSoulDifferencePanel(root);
        var label = GetCachedPanel("soulDiffLabel");
        if (!panel || !label) return;
        SetSoulDifferenceVisual(panel, label, difference.display, difference.mood);
    }

    QOL.featureRegistry = {};
    QOL.register = function(name, descriptor) {
        if (!name || !descriptor || typeof descriptor.update !== "function") return;
        QOL.featureRegistry[name] = descriptor;
    };
    QOL.import = function(names) {
        var result = {};
        var missing = [];
        for (var i = 0; i < names.length; i++) {
            var key = names[i];
            result[key] = QOL[key];
            if (result[key] === undefined) missing.push(key);
        }
        if (missing.length > 0 && typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLOCK Spectator][bridge] Missing: " + missing.join(", "));
        }
        return result;
    };

    // DLF: the objective timers' show windows (state.cues from the editor's SOUL GRAPH page; seconds before
    // a spawn, 0 off, -1 always), read from the HUD root attribute only when it changes. One reader for
    // both timer features; the defaults until dlf_state.js has loaded.
    var DLF_CUE_FALLBACK = { bridge: -1, urn: 30, rift: -1, mid: -1 };
    var _dlfCueReader = null;
    var _dlfCues = null;
    function DlfCues() {
        var S = typeof $ !== "undefined" ? $.DLFState : null;
        if (!S) return DLF_CUE_FALLBACK;
        try {
            if (!_dlfCueReader) _dlfCueReader = S.hudAttrs($.GetContextPanel());
            var parsed = _dlfCueReader.changed(S.ATTR);
            if (parsed !== undefined || !_dlfCues) _dlfCues = S.normalize(parsed, S.defaults()).cues;
        } catch (e) {
            if (!_dlfCues) _dlfCues = DLF_CUE_FALLBACK;
        }
        return _dlfCues;
    }
    QOL.dlfCues = DlfCues;

    QOL.state = State;
    QOL.utils = Utils;
    QOL.getCachedPanel = GetCachedPanel;
    QOL.setCachedPanel = SetCachedPanel;
    QOL.resolveCachedPanel = ResolveCachedPanel;
    QOL.setPanelClassCached = SetPanelClassCached;
    QOL.setPanelClassIfChanged = SetPanelClassIfChanged;
    QOL.hasClassInHierarchy = HasClassInHierarchy;
    QOL.isHudClassActive = IsHudClassActive;
    QOL.isStreetBrawlModeActive = IsStreetBrawlModeActive;
    QOL.isConnectedToHideout = IsConnectedToHideout;
    QOL.isPanelVisibleMaybe = IsPanelVisibleMaybe;
    QOL.normalizeHudOffsetNumber = NormalizeHudOffsetNumber;
    QOL.normalizeHudScaleNumber = NormalizeHudScaleNumber;
    QOL.getGameSecondsForUrn = GetGameSecondsForUrn;
    QOL.getHighestRejuvChargeTokenOnPanel = GetHighestRejuvChargeTokenOnPanel;
    QOL.panelHasClassToken = PanelHasClassToken;
    QOL.ensureMinimapOverlayAnchor = EnsureMinimapOverlayAnchor;
    QOL.ensureMinimapPanelCache = EnsureMinimapPanelCache;
    QOL.perfNowMs = PerfNowMs;
    QOL.panelIdTopBar = PANEL_ID_TOP_BAR;

    return {
        config: CONFIG,
        state: State,
        isPanelValid: IsPanelValid,
        nowMs: PerfNowMs,
        resolveRuntimeRoot: ResolveRuntimeRoot,
        applyStaticRootClasses: ApplyStaticRootClasses,
        updateSoulDifference: UpdateSoulDifference
    };
})();
