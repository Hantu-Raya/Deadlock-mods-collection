// ql_feat_rejuvtimers.js — Rejuvenator and Bridge buff HUD + minimap timers
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_rejuvtimers";
    var _deps = QOL.import(["ensureMinimapOverlayAnchor","ensureMinimapPanelCache","getCachedPanel","getGameSecondsForUrn","getHighestRejuvChargeTokenOnPanel","hasClassInHierarchy","isConnectedToHideout","isHudClassActive","isStreetBrawlModeActive","panelHasClassToken","panelIdTopBar","perfNowMs","resolveCachedPanel","state","setCachedPanel","setPanelClassCached","setPanelClassIfChanged","utils","dlfCues"]);
    // State = _deps.state, Utils = _deps.utils, GetCachedPanel/SetCachedPanel = panel cache get/set.
    var GetCachedPanel = _deps.getCachedPanel;
    var ResolveCachedPanel = _deps.resolveCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var BRIDGE_DURATION_SEC = 300;
    var BUFF_LOCKOUT_SEC = 120;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
    var SetPanelClassIfChanged = _deps.setPanelClassIfChanged;
    var IsStreetBrawlModeActive = _deps.isStreetBrawlModeActive;
    var IsHudClassActive = _deps.isHudClassActive;
    var SetPanelClassCached = _deps.setPanelClassCached;
    var PerfNowMs = _deps.perfNowMs;
    var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
    var hasClassInHierarchy = _deps.hasClassInHierarchy;
    var PANEL_ID_TOP_BAR = _deps.panelIdTopBar;
    var GetHighestRejuvChargeTokenOnPanel = _deps.getHighestRejuvChargeTokenOnPanel;
    var isConnectedToHideout = _deps.isConnectedToHideout;
    var EnsureMinimapOverlayAnchor = _deps.ensureMinimapOverlayAnchor;
    var PanelHasClassToken = _deps.panelHasClassToken;
    var DlfCues = _deps.dlfCues;

    // ── Constants ──
    const REJUV_DURATION_SEC = 180;
    const REJUV_SCAN_INTERVAL_MS = 3000;
    const REJUV_SCAN_INTERVAL_FAST_MS = 1000;
    const REJUV_MIDBOSS_LOOKUP_INTERVAL_MS = 10000;
    const REJUV_CHARGES_LOOKUP_INTERVAL_MS = 5000;
    const REJUV_ROTATE_ANIM_MS = 800;
    const REJUV_HIDE_POPIN_MS = 500;
    const REJUV_SEQ = [
        { name: "initial", dur: 0, num: "1" },
        { name: "firstCd", dur: 420, num: "2" },
        { name: "secondCd", dur: 360, num: "3" },
        { name: "thirdCd", dur: 300, num: "3" }
    ];
    // DLF (Observer HUD's cues): a respawned mid-boss reads "Spawn" this long when its timer has a show
    // window; the held rejuvenator's time comes from the stock circle when the pickup was not seen.
    const MID_SPAWN_SHOW_SEC = 30;
    const HELD_RATE_MIN_GAP_SEC = 2;
    const HELD_RADIAL = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(-?\d+(?:\.\d+)?)deg\s*\)$/;
    const CUE_FALLBACK = { bridge: -1, urn: 30, rift: -1, mid: -1 };
    const CUE_HIDDEN_CLASS = "DLFCueHidden";

    // ── Private helpers ──

    function FormatClockMmSs(totalSec) {
        var s = Math.max(0, Math.floor(Number(totalSec) || 0));
        var mm = Math.floor(s / 60);
        var ss = s % 60;
        return String(mm) + ":" + (ss < 10 ? "0" + ss : String(ss));
    }

    function EnsureMinimapObjectiveTimers(root) {
        var anchor = EnsureMinimapOverlayAnchor(root);
        if (!anchor) return null;

        var overlay = GetCachedPanel("minimapObjectiveTimersRoot");
        if (!overlay) {
            overlay = anchor.FindChildTraverse("QOLMinimapTimersRoot");
            if (!overlay) {
                overlay = $.CreatePanel("Panel", anchor, "QOLMinimapTimersRoot", {
                    hittest: "false",
                    hittestchildren: "false"
                });
            }
        } else if (overlay.GetParent && overlay.GetParent() !== anchor && overlay.SetParent) {
            overlay.SetParent(anchor);
        }
        if (!overlay) return null;
        overlay.hittest = false;
        overlay.hittestchildren = false;
        if (anchor.MoveChildAfter && anchor.GetChildCount) {
            var childCount = Number(anchor.GetChildCount()) || 0;
            if (childCount > 0) {
                var lastChild = anchor.GetChild(childCount - 1);
                if (lastChild && lastChild !== overlay) {
                    anchor.MoveChildAfter(overlay, lastChild);
                }
            }
        }

        var buffPanel = overlay.FindChildTraverse("QOLMinimapBuffTimer");
        if (!buffPanel) {
            buffPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffTimer");
        }
        buffPanel.AddClass("QOLMinimapTimer");
        buffPanel.hittest = false;
        buffPanel.hittestchildren = false;

        var buffIcon = buffPanel.FindChildTraverse("QOLMinimapBuffIcon");
        if (!buffIcon) {
            buffIcon = $.CreatePanel("Image", buffPanel, "QOLMinimapBuffIcon", {
                src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg"
            });
        }
        buffIcon.hittest = false;
        buffIcon.hittestchildren = false;

        var buffTime = buffPanel.FindChildTraverse("QOLMinimapBuffTime");
        if (!buffTime) {
            buffTime = $.CreatePanel("Label", buffPanel, "QOLMinimapBuffTime");
            buffTime.text = "00:00";
        }
        buffTime.AddClass("QOLMinimapTimerLabel");
        buffTime.hittest = false;
        buffTime.hittestchildren = false;

        var buffBridgeLeftPanel = overlay.FindChildTraverse("QOLMinimapBuffBridgeLeftTimer");
        if (!buffBridgeLeftPanel) {
            buffBridgeLeftPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffBridgeLeftTimer");
        }
        buffBridgeLeftPanel.AddClass("QOLMinimapTimer");
        buffBridgeLeftPanel.hittest = false;
        buffBridgeLeftPanel.hittestchildren = false;
        buffBridgeLeftPanel.style.ignoreParentFlow = "true";

        var buffBridgeLeftIcon = buffBridgeLeftPanel.FindChildTraverse("QOLMinimapBuffBridgeLeftIcon");
        if (!buffBridgeLeftIcon) {
            buffBridgeLeftIcon = $.CreatePanel("Image", buffBridgeLeftPanel, "QOLMinimapBuffBridgeLeftIcon", {
                src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg"
            });
        }
        buffBridgeLeftIcon.hittest = false;
        buffBridgeLeftIcon.hittestchildren = false;

        var buffBridgeLeftTime = buffBridgeLeftPanel.FindChildTraverse("QOLMinimapBuffBridgeLeftTime");
        if (!buffBridgeLeftTime) {
            buffBridgeLeftTime = $.CreatePanel("Label", buffBridgeLeftPanel, "QOLMinimapBuffBridgeLeftTime");
            buffBridgeLeftTime.text = "00:00";
        }
        buffBridgeLeftTime.AddClass("QOLMinimapTimerLabel");
        buffBridgeLeftTime.hittest = false;
        buffBridgeLeftTime.hittestchildren = false;

        var buffBridgeRightPanel = overlay.FindChildTraverse("QOLMinimapBuffBridgeRightTimer");
        if (!buffBridgeRightPanel) {
            buffBridgeRightPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffBridgeRightTimer");
        }
        buffBridgeRightPanel.AddClass("QOLMinimapTimer");
        buffBridgeRightPanel.hittest = false;
        buffBridgeRightPanel.hittestchildren = false;
        buffBridgeRightPanel.style.ignoreParentFlow = "true";

        var buffBridgeRightIcon = buffBridgeRightPanel.FindChildTraverse("QOLMinimapBuffBridgeRightIcon");
        if (!buffBridgeRightIcon) {
            buffBridgeRightIcon = $.CreatePanel("Image", buffBridgeRightPanel, "QOLMinimapBuffBridgeRightIcon", {
                src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg"
            });
        }
        buffBridgeRightIcon.hittest = false;
        buffBridgeRightIcon.hittestchildren = false;

        var buffBridgeRightTime = buffBridgeRightPanel.FindChildTraverse("QOLMinimapBuffBridgeRightTime");
        if (!buffBridgeRightTime) {
            buffBridgeRightTime = $.CreatePanel("Label", buffBridgeRightPanel, "QOLMinimapBuffBridgeRightTime");
            buffBridgeRightTime.text = "00:00";
        }
        buffBridgeRightTime.AddClass("QOLMinimapTimerLabel");
        buffBridgeRightTime.hittest = false;
        buffBridgeRightTime.hittestchildren = false;

        var rejuvPanel = overlay.FindChildTraverse("QOLMinimapRejuvTimer");
        if (!rejuvPanel) {
            rejuvPanel = $.CreatePanel("Panel", overlay, "QOLMinimapRejuvTimer");
        }
        rejuvPanel.AddClass("QOLMinimapTimer");
        rejuvPanel.hittest = false;
        rejuvPanel.hittestchildren = false;

        var rejuvIcon = rejuvPanel.FindChildTraverse("QOLMinimapRejuvIcon");
        if (!rejuvIcon) {
            rejuvIcon = $.CreatePanel("Image", rejuvPanel, "QOLMinimapRejuvIcon", {
                src: "s2r://panorama/images/hud/modifiers/icon_rejuvenator.svg"
            });
        }
        rejuvIcon.hittest = false;
        rejuvIcon.hittestchildren = false;

        var rejuvTime = rejuvPanel.FindChildTraverse("QOLMinimapRejuvTime");
        if (!rejuvTime) {
            rejuvTime = $.CreatePanel("Label", rejuvPanel, "QOLMinimapRejuvTime");
            rejuvTime.text = "00:00";
        }
        rejuvTime.AddClass("QOLMinimapTimerLabel");
        rejuvTime.hittest = false;
        rejuvTime.hittestchildren = false;

        SetCachedPanel("minimapObjectiveTimersRoot", overlay);
        SetCachedPanel("minimapObjectiveBuffPanel", buffPanel);
        SetCachedPanel("minimapObjectiveBuffTime", buffTime);
        SetCachedPanel("minimapObjectiveBuffIcon", buffIcon);
        SetCachedPanel("minimapObjectiveBuffBridgeLeftPanel", buffBridgeLeftPanel);
        SetCachedPanel("minimapObjectiveBuffBridgeLeftTime", buffBridgeLeftTime);
        SetCachedPanel("minimapObjectiveBuffBridgeLeftIcon", buffBridgeLeftIcon);
        SetCachedPanel("minimapObjectiveBuffBridgeRightPanel", buffBridgeRightPanel);
        SetCachedPanel("minimapObjectiveBuffBridgeRightTime", buffBridgeRightTime);
        SetCachedPanel("minimapObjectiveBuffBridgeRightIcon", buffBridgeRightIcon);
        SetCachedPanel("minimapObjectiveRejuvPanel", rejuvPanel);
        SetCachedPanel("minimapObjectiveRejuvTime", rejuvTime);
        SetCachedPanel("minimapObjectiveRejuvIcon", rejuvIcon);
        if (overlay.MoveChildBefore && rejuvPanel && buffPanel) {
            overlay.MoveChildBefore(rejuvPanel, buffPanel);
        }

        return {
            root: overlay,
            buffPanel: buffPanel,
            buffTime: buffTime,
            buffBridgeLeftPanel: buffBridgeLeftPanel,
            buffBridgeLeftTime: buffBridgeLeftTime,
            buffBridgeRightPanel: buffBridgeRightPanel,
            buffBridgeRightTime: buffBridgeRightTime,
            rejuvPanel: rejuvPanel,
            rejuvTime: rejuvTime
        };
    }

    function HideMinimapObjectiveTimers(root) {
        var overlay = GetCachedPanel("minimapObjectiveTimersRoot");
        if (!overlay && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("QOLMinimapTimersRoot");
            if (overlay) SetCachedPanel("minimapObjectiveTimersRoot", overlay);
        }
        if (!overlay) return;
        if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
        State.minimapObjectiveScaleSig = "";
        if (overlay.style.preTransformScale2d !== "1.00, 1.00") {
            overlay.style.preTransformScale2d = "1.00, 1.00";
        }
        var buffPanel = GetCachedPanel("minimapObjectiveBuffPanel");
        var buffBridgeLeftPanel = GetCachedPanel("minimapObjectiveBuffBridgeLeftPanel");
        var buffBridgeRightPanel = GetCachedPanel("minimapObjectiveBuffBridgeRightPanel");
        var rejuvPanel = GetCachedPanel("minimapObjectiveRejuvPanel");
        if (buffPanel) {
            SetPanelClassCached(buffPanel, State.minimapObjectiveBuffClassCache, "yellow", false);
            SetPanelClassCached(buffPanel, State.minimapObjectiveBuffClassCache, "red", false);
        }
        if (buffBridgeLeftPanel) {
            SetPanelClassCached(buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", false);
            SetPanelClassCached(buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", false);
        }
        if (buffBridgeRightPanel) {
            SetPanelClassCached(buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", false);
            SetPanelClassCached(buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", false);
        }
        if (rejuvPanel) {
            SetPanelClassCached(rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", false);
            SetPanelClassCached(rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", false);
        }
    }

    function GetMinimapConfigNumber(cfg, newKey, legacyKey, fallbackVal) {
        var val = cfg ? cfg[newKey] : undefined;
        if (val === undefined || val === null || !isFinite(Number(val))) {
            val = cfg ? cfg[legacyKey] : undefined;
        }
        if (val === undefined || val === null || !isFinite(Number(val))) {
            val = fallbackVal;
        }
        return Number(val);
    }

    function ResolveActiveMinimapObjectiveSize(root, cfg) {
        var smallSize = Number(cfg && cfg.MINIMAP_SMALL_SIZE);
        if (!isFinite(smallSize)) smallSize = 400;
        var minimapPersp = ResolveCachedPanel(root, "minimapPersp", "minimap_persp")
        var isAlt = IsHudClassActive(root, "gDetailView") || hasClassInHierarchy(minimapPersp, "gDetailView");
        var isTab = IsHudClassActive(root, "gScoreboardOpen") || hasClassInHierarchy(minimapPersp, "gScoreboardOpen");
        if (isTab && cfg && IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM")) {
            return GetMinimapConfigNumber(cfg, "MINIMAP_LARGE_SIZE_TAB", "MINIMAP_LARGE_SIZE", smallSize);
        }
        if (isAlt && cfg && IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM")) {
            return GetMinimapConfigNumber(cfg, "MINIMAP_LARGE_SIZE_ALT", "MINIMAP_LARGE_SIZE", smallSize);
        }
        return smallSize;
    }

    // ── Standard minimap layout: timers stacked horizontally at bottom of minimap
    function ApplyMinimapObjectiveTimersStandardMode(panels, overlay, dims, flags, icons, bridgeText, rejuvText) {
        var timerWidth = dims.timerWidth;
        var timerHeight = dims.timerHeight;
        var timerGap = dims.timerGap;
        var timerPaddingX = dims.timerPaddingX;
        var timerRadius = dims.timerRadius;
        var timerFont = dims.timerFont;
        var timerIcon = dims.timerIcon;
        var bottomOffset = dims.bottomOffset;
        var buffEnabled = flags.buffEnabled;
        var rejuvEnabled = flags.rejuvEnabled;
        var buffRed = flags.buffRed;
        var buffYellow = flags.buffYellow;
        var rejuvRed = flags.rejuvRed;
        var rejuvYellow = flags.rejuvYellow;
        var buffIcon = icons.buffIcon;
        var buffBridgeLeftIcon = icons.buffBridgeLeftIcon;
        var buffBridgeRightIcon = icons.buffBridgeRightIcon;
        var rejuvIcon = icons.rejuvIcon;
        var minimapScaleTextDefault = [
            timerWidth,
            timerHeight,
            timerGap,
            timerPaddingX,
            timerRadius,
            timerFont,
            timerIcon,
            bottomOffset
        ].join("|");
        if (State.minimapObjectiveScaleSig !== minimapScaleTextDefault) {
            if (overlay.style.preTransformScale2d !== "1.00, 1.00") {
                overlay.style.preTransformScale2d = "1.00, 1.00";
            }
            overlay.style.width = "fit-children";
            overlay.style.height = "fit-children";
            overlay.style.horizontalAlign = "center";
            overlay.style.verticalAlign = "bottom";
            overlay.style.marginTop = "0px";
            overlay.style.marginRight = "0px";
            overlay.style.marginBottom = bottomOffset + "px";
            if (panels.buffPanel) {
                panels.buffPanel.style.width = timerWidth + "px";
                panels.buffPanel.style.height = timerHeight + "px";
                panels.buffPanel.style.margin = "0px " + timerGap + "px";
                panels.buffPanel.style.padding = "0px " + timerPaddingX + "px";
                panels.buffPanel.style.borderRadius = timerRadius + "px";
                panels.buffPanel.style.ignoreParentFlow = "false";
                panels.buffPanel.style.horizontalAlign = "center";
                panels.buffPanel.style.verticalAlign = "center";
            }
            if (panels.rejuvPanel) {
                panels.rejuvPanel.style.width = timerWidth + "px";
                panels.rejuvPanel.style.height = timerHeight + "px";
                panels.rejuvPanel.style.margin = "0px " + timerGap + "px";
                panels.rejuvPanel.style.padding = "0px " + timerPaddingX + "px";
                panels.rejuvPanel.style.borderRadius = timerRadius + "px";
                panels.rejuvPanel.style.ignoreParentFlow = "false";
                panels.rejuvPanel.style.horizontalAlign = "center";
                panels.rejuvPanel.style.verticalAlign = "center";
            }
            if (buffIcon) {
                buffIcon.style.width = timerIcon + "px";
                buffIcon.style.height = timerIcon + "px";
                buffIcon.style.visibility = "visible";
            }
            if (buffBridgeLeftIcon) buffBridgeLeftIcon.style.visibility = "collapse";
            if (buffBridgeRightIcon) buffBridgeRightIcon.style.visibility = "collapse";
            if (rejuvIcon) {
                rejuvIcon.style.width = timerIcon + "px";
                rejuvIcon.style.height = timerIcon + "px";
                rejuvIcon.style.visibility = "visible";
            }
            if (panels.buffTime) panels.buffTime.style.fontSize = timerFont + "px";
            if (panels.rejuvTime) panels.rejuvTime.style.fontSize = timerFont + "px";
            State.minimapObjectiveScaleSig = minimapScaleTextDefault;
        }

        var singleSlotOffset = Math.round(timerWidth + (timerGap * 2));
        var overlayMarginLeft = "0px";
        if (buffEnabled && !rejuvEnabled) {
            overlayMarginLeft = singleSlotOffset + "px";
        } else if (rejuvEnabled && !buffEnabled) {
            overlayMarginLeft = (-singleSlotOffset) + "px";
        }
        if (overlay.style.marginLeft !== overlayMarginLeft) {
            overlay.style.marginLeft = overlayMarginLeft;
        }

        if (panels.buffPanel && panels.buffPanel.style.visibility !== (buffEnabled ? "visible" : "collapse")) {
            panels.buffPanel.style.visibility = buffEnabled ? "visible" : "collapse";
        }
        if (panels.rejuvPanel && panels.rejuvPanel.style.visibility !== (rejuvEnabled ? "visible" : "collapse")) {
            panels.rejuvPanel.style.visibility = rejuvEnabled ? "visible" : "collapse";
        }
        if (panels.buffBridgeLeftPanel && panels.buffBridgeLeftPanel.style.visibility !== "collapse") {
            panels.buffBridgeLeftPanel.style.visibility = "collapse";
        }
        if (panels.buffBridgeRightPanel && panels.buffBridgeRightPanel.style.visibility !== "collapse") {
            panels.buffBridgeRightPanel.style.visibility = "collapse";
        }
        if (buffEnabled && panels.buffTime && panels.buffTime.text !== bridgeText) {
            panels.buffTime.text = bridgeText;
        }
        if (rejuvEnabled && panels.rejuvTime && panels.rejuvTime.text !== rejuvText) {
            panels.rejuvTime.text = rejuvText;
        }

        if (panels.buffPanel) {
            SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "yellow", buffYellow);
            SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "red", buffRed);
        }
        if (panels.buffBridgeLeftPanel) {
            SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", false);
            SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", false);
        }
        if (panels.buffBridgeRightPanel) {
            SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", false);
            SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", false);
        }
        if (panels.rejuvPanel) {
            SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", rejuvYellow);
            SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", rejuvRed);
        }
    }


    // ── Bridge overlay layout: timers positioned as overlay elements on the minimap
    function ApplyMinimapObjectiveTimersBridgeMode(panels, overlay, dims, bridgeDims, flags, icons, bridgeText, rejuvText) {
        var timerWidth = dims.timerWidth;
        var timerHeight = dims.timerHeight;
        var timerGap = dims.timerGap;
        var timerPaddingX = dims.timerPaddingX;
        var timerRadius = dims.timerRadius;
        var timerFont = dims.timerFont;
        var timerIcon = dims.timerIcon;
        var bottomOffset = dims.bottomOffset;
        var minimapSize = bridgeDims.minimapSize;
        var bridgeTimerWidth = bridgeDims.bridgeTimerWidth;
        var bridgeTimerHeight = bridgeDims.bridgeTimerHeight;
        var bridgeTimerPaddingX = bridgeDims.bridgeTimerPaddingX;
        var bridgeTimerRadius = bridgeDims.bridgeTimerRadius;
        var bridgeTimerFont = bridgeDims.bridgeTimerFont;
        var bridgeHorizontalOffset = bridgeDims.bridgeHorizontalOffset;
        var buffEnabled = flags.buffEnabled;
        var buffOnBridgeEnabled = flags.buffOnBridgeEnabled;
        var rejuvEnabled = flags.rejuvEnabled;
        var rejuvOnBridgeEnabled = flags.rejuvOnBridgeEnabled;
        var buffRed = flags.buffRed;
        var buffYellow = flags.buffYellow;
        var rejuvRed = flags.rejuvRed;
        var rejuvYellow = flags.rejuvYellow;
        var buffIcon = icons.buffIcon;
        var buffBridgeLeftIcon = icons.buffBridgeLeftIcon;
        var buffBridgeRightIcon = icons.buffBridgeRightIcon;
        var rejuvIcon = icons.rejuvIcon;
        var singleSlotOffset = Math.round(timerWidth + (timerGap * 2));
        var minimapScaleText = [
            timerWidth,
            timerHeight,
            timerGap,
            timerPaddingX,
            timerRadius,
            timerFont,
            timerIcon,
            bottomOffset,
            bridgeTimerWidth,
            bridgeTimerHeight,
            bridgeTimerPaddingX,
            bridgeTimerRadius,
            bridgeTimerFont,
            bridgeHorizontalOffset,
            singleSlotOffset,
            buffOnBridgeEnabled ? 1 : 0,
            rejuvOnBridgeEnabled ? 1 : 0
        ].join("|");
        if (State.minimapObjectiveScaleSig !== minimapScaleText) {
            overlay.style.width = minimapSize + "px";
            overlay.style.height = minimapSize + "px";
            overlay.style.horizontalAlign = "center";
            overlay.style.verticalAlign = "center";
            overlay.style.marginLeft = "0px";
            overlay.style.marginRight = "0px";
            overlay.style.marginTop = "0px";
            overlay.style.marginBottom = "0px";
            overlay.style.preTransformScale2d = "1.00, 1.00";
            if (panels.buffPanel) {
                panels.buffPanel.style.width = timerWidth + "px";
                panels.buffPanel.style.height = timerHeight + "px";
                panels.buffPanel.style.margin = "0px";
                panels.buffPanel.style.padding = "0px " + timerPaddingX + "px";
                panels.buffPanel.style.borderRadius = timerRadius + "px";
                panels.buffPanel.style.ignoreParentFlow = buffOnBridgeEnabled ? "true" : "false";
                panels.buffPanel.style.horizontalAlign = "center";
                panels.buffPanel.style.verticalAlign = buffOnBridgeEnabled ? "bottom" : "center";
                panels.buffPanel.style.marginTop = "0px";
                panels.buffPanel.style.marginBottom = buffOnBridgeEnabled ? (bottomOffset + "px") : "0px";
            }
            if (panels.rejuvPanel) {
                panels.rejuvPanel.style.width = timerWidth + "px";
                panels.rejuvPanel.style.height = timerHeight + "px";
                panels.rejuvPanel.style.margin = "0px";
                panels.rejuvPanel.style.padding = "0px " + timerPaddingX + "px";
                panels.rejuvPanel.style.borderRadius = timerRadius + "px";
                panels.rejuvPanel.style.ignoreParentFlow = "true";
                panels.rejuvPanel.style.horizontalAlign = "center";
                panels.rejuvPanel.style.verticalAlign = rejuvOnBridgeEnabled ? "center" : "bottom";
                panels.rejuvPanel.style.marginLeft = (rejuvOnBridgeEnabled ? 0 : singleSlotOffset) + "px";
                panels.rejuvPanel.style.marginTop = "0px";
                panels.rejuvPanel.style.marginBottom = rejuvOnBridgeEnabled ? "0px" : (bottomOffset + "px");
            }
            if (buffIcon) {
                buffIcon.style.width = timerIcon + "px";
                buffIcon.style.height = timerIcon + "px";
                buffIcon.style.visibility = "collapse";
            }
            if (panels.buffBridgeLeftPanel) {
                panels.buffBridgeLeftPanel.style.width = bridgeTimerWidth + "px";
                panels.buffBridgeLeftPanel.style.height = bridgeTimerHeight + "px";
                panels.buffBridgeLeftPanel.style.margin = "0px";
                panels.buffBridgeLeftPanel.style.padding = "0px " + bridgeTimerPaddingX + "px";
                panels.buffBridgeLeftPanel.style.borderRadius = bridgeTimerRadius + "px";
                panels.buffBridgeLeftPanel.style.horizontalAlign = "center";
                panels.buffBridgeLeftPanel.style.verticalAlign = "center";
                panels.buffBridgeLeftPanel.style.marginLeft = (-bridgeHorizontalOffset) + "px";
                panels.buffBridgeLeftPanel.style.ignoreParentFlow = "true";
                panels.buffBridgeLeftPanel.style.marginTop = "0px";
                panels.buffBridgeLeftPanel.style.marginBottom = "0px";
            }
            if (panels.buffBridgeRightPanel) {
                panels.buffBridgeRightPanel.style.width = bridgeTimerWidth + "px";
                panels.buffBridgeRightPanel.style.height = bridgeTimerHeight + "px";
                panels.buffBridgeRightPanel.style.margin = "0px";
                panels.buffBridgeRightPanel.style.padding = "0px " + bridgeTimerPaddingX + "px";
                panels.buffBridgeRightPanel.style.borderRadius = bridgeTimerRadius + "px";
                panels.buffBridgeRightPanel.style.horizontalAlign = "center";
                panels.buffBridgeRightPanel.style.verticalAlign = "center";
                panels.buffBridgeRightPanel.style.marginLeft = bridgeHorizontalOffset + "px";
                panels.buffBridgeRightPanel.style.ignoreParentFlow = "true";
                panels.buffBridgeRightPanel.style.marginTop = "0px";
                panels.buffBridgeRightPanel.style.marginBottom = "0px";
            }
            if (buffBridgeLeftIcon) buffBridgeLeftIcon.style.visibility = "collapse";
            if (buffBridgeRightIcon) buffBridgeRightIcon.style.visibility = "collapse";
            if (rejuvIcon) {
                rejuvIcon.style.width = timerIcon + "px";
                rejuvIcon.style.height = timerIcon + "px";
                rejuvIcon.style.visibility = rejuvOnBridgeEnabled ? "collapse" : "visible";
            }
            if (panels.buffTime) panels.buffTime.style.fontSize = timerFont + "px";
            if (panels.buffBridgeLeftTime) panels.buffBridgeLeftTime.style.fontSize = bridgeTimerFont + "px";
            if (panels.buffBridgeRightTime) panels.buffBridgeRightTime.style.fontSize = bridgeTimerFont + "px";
            if (panels.rejuvTime) panels.rejuvTime.style.fontSize = timerFont + "px";
            State.minimapObjectiveScaleSig = minimapScaleText;
        }

        if (overlay.style.marginLeft !== "0px") {
            overlay.style.marginLeft = "0px";
        }

        var showBaseBuffPanel = buffEnabled && !buffOnBridgeEnabled;
        if (panels.buffPanel && panels.buffPanel.style.visibility !== (showBaseBuffPanel ? "visible" : "collapse")) {
            panels.buffPanel.style.visibility = showBaseBuffPanel ? "visible" : "collapse";
        }
        if (panels.buffBridgeLeftPanel && panels.buffBridgeLeftPanel.style.visibility !== (buffEnabled ? "visible" : "collapse")) {
            panels.buffBridgeLeftPanel.style.visibility = buffOnBridgeEnabled ? "visible" : "collapse";
        }
        if (panels.buffBridgeRightPanel && panels.buffBridgeRightPanel.style.visibility !== (buffEnabled ? "visible" : "collapse")) {
            panels.buffBridgeRightPanel.style.visibility = buffOnBridgeEnabled ? "visible" : "collapse";
        }
        if (panels.rejuvPanel && panels.rejuvPanel.style.visibility !== (rejuvEnabled ? "visible" : "collapse")) {
            panels.rejuvPanel.style.visibility = rejuvEnabled ? "visible" : "collapse";
        }
        if (panels.buffPanel && showBaseBuffPanel) {
            panels.buffPanel.style.ignoreParentFlow = "true";
            panels.buffPanel.style.verticalAlign = "bottom";
            panels.buffPanel.style.marginTop = "0px";
            panels.buffPanel.style.marginBottom = bottomOffset + "px";
            panels.buffPanel.style.marginLeft = ((!rejuvEnabled || rejuvOnBridgeEnabled) ? 0 : (-singleSlotOffset)) + "px";
        }
        if (panels.rejuvPanel) {
            panels.rejuvPanel.style.ignoreParentFlow = "true";
            if (rejuvOnBridgeEnabled) {
                panels.rejuvPanel.style.verticalAlign = "center";
                panels.rejuvPanel.style.marginLeft = "0px";
                panels.rejuvPanel.style.marginTop = "0px";
                panels.rejuvPanel.style.marginBottom = "0px";
            } else {
                panels.rejuvPanel.style.verticalAlign = "bottom";
                panels.rejuvPanel.style.marginTop = "0px";
                panels.rejuvPanel.style.marginBottom = bottomOffset + "px";
                panels.rejuvPanel.style.marginLeft = ((buffEnabled && !buffOnBridgeEnabled) || buffOnBridgeEnabled ? singleSlotOffset : 0) + "px";
            }
        }
        if (rejuvIcon) {
            rejuvIcon.style.visibility = rejuvOnBridgeEnabled ? "collapse" : "visible";
        }
        if (buffEnabled && panels.buffBridgeLeftTime && panels.buffBridgeLeftTime.text !== bridgeText) {
            panels.buffBridgeLeftTime.text = bridgeText;
        }
        if (buffEnabled && panels.buffBridgeRightTime && panels.buffBridgeRightTime.text !== bridgeText) {
            panels.buffBridgeRightTime.text = bridgeText;
        }
        if (rejuvEnabled && panels.rejuvTime && panels.rejuvTime.text !== rejuvText) {
            panels.rejuvTime.text = rejuvText;
        }
        if (panels.buffBridgeLeftPanel) {
            SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", buffYellow);
            SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", buffRed);
        }
        if (panels.buffBridgeRightPanel) {
            SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", buffYellow);
            SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", buffRed);
        }
        if (panels.buffPanel) {
            SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "yellow", false);
            SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "red", false);
        }
        if (panels.rejuvPanel) {
            SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", rejuvYellow);
            SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", rejuvRed);
        }
    }


    function UpdateMinimapObjectiveTimers(root, cfg, bridgeText, remainingBridge, rejuvText, remainingRejuv, spawnWaiting) {
        var buffEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER"));
        var buffOnBridgeEnabled = !!(buffEnabled && cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE"));
        var rejuvEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER"));
        var rejuvOnBridgeEnabled = !!(rejuvEnabled && cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS"));
        if (!buffEnabled && !rejuvEnabled) {
            HideMinimapObjectiveTimers(root);
            return;
        }
        var panels = EnsureMinimapObjectiveTimers(root);
        if (!panels || !panels.root) return;
        var overlay = panels.root;
        if (overlay.style.visibility !== "visible") overlay.style.visibility = "visible";
        var minimapSize = ResolveActiveMinimapObjectiveSize(root, cfg);
        if (!isFinite(minimapSize)) minimapSize = 400;
        if (minimapSize < 200) minimapSize = 200;
        if (minimapSize > 1200) minimapSize = 1200;
        var minimapScale = minimapSize / 400.0;
        if (!isFinite(minimapScale)) minimapScale = 1.0;
        if (minimapScale < 0.5) minimapScale = 0.5;
        if (minimapScale > 2.5) minimapScale = 2.5;
        var timerWidth = Math.max(58, Math.round(72 * minimapScale));
        var timerHeight = Math.max(22, Math.round(28 * minimapScale));
        var timerGap = Math.max(24, Math.round(40 * minimapScale));
        var timerPaddingX = Math.max(3, Math.round(5 * minimapScale));
        var timerRadius = Math.max(4, Math.round(5 * minimapScale));
        var timerFont = Math.max(11, Math.round(14 * minimapScale));
        var timerIcon = Math.max(12, Math.round(16 * minimapScale));
        var bottomOffset = Math.max(4, Math.round(minimapSize * 0.10));
        var bridgeRemain = Math.max(0, Math.floor(Number(remainingBridge) || 0));
        var rejuvRemain = Math.max(0, Math.floor(Number(remainingRejuv) || 0));
        var buffRed = buffEnabled && bridgeRemain < 10 && (bridgeRemain % 2) === 1;
        var buffYellow = buffEnabled && !buffRed && bridgeRemain < 20 && (bridgeRemain % 2) === 1;
        var rejuvWarnEligible = rejuvEnabled && !spawnWaiting;
        var rejuvRed = rejuvEnabled && (spawnWaiting || (rejuvWarnEligible && rejuvRemain < 10 && (rejuvRemain % 2) === 1));
        var rejuvYellow = rejuvWarnEligible && !rejuvRed && rejuvRemain < 20 && (rejuvRemain % 2) === 1;
        var buffIcon = GetCachedPanel("minimapObjectiveBuffIcon");
        var buffBridgeLeftIcon = GetCachedPanel("minimapObjectiveBuffBridgeLeftIcon");
        var buffBridgeRightIcon = GetCachedPanel("minimapObjectiveBuffBridgeRightIcon");
        var rejuvIcon = GetCachedPanel("minimapObjectiveRejuvIcon");

        var bridgeTimerWidth = Math.max(29, Math.round(timerWidth * 0.5));
        var bridgeTimerHeight = Math.max(11, Math.round(timerHeight * 0.5));
        var bridgeTimerPaddingX = Math.max(2, Math.round(timerPaddingX * 0.5));
        var bridgeTimerRadius = Math.max(2, Math.round(timerRadius * 0.5));
        var bridgeTimerFont = Math.max(8, Math.round(timerFont * 0.5));
        var bridgeHorizontalOffset = Math.round(minimapSize * 0.35);

        if (!buffOnBridgeEnabled && !rejuvOnBridgeEnabled) {
            ApplyMinimapObjectiveTimersStandardMode(
                panels, overlay,
                {timerWidth: timerWidth, timerHeight: timerHeight, timerGap: timerGap, timerPaddingX: timerPaddingX, timerRadius: timerRadius, timerFont: timerFont, timerIcon: timerIcon, bottomOffset: bottomOffset},
                {buffEnabled: buffEnabled, rejuvEnabled: rejuvEnabled, buffRed: buffRed, buffYellow: buffYellow, rejuvRed: rejuvRed, rejuvYellow: rejuvYellow},
                {buffIcon: buffIcon, buffBridgeLeftIcon: buffBridgeLeftIcon, buffBridgeRightIcon: buffBridgeRightIcon, rejuvIcon: rejuvIcon},
                bridgeText, rejuvText
            );
            return;
        }

        ApplyMinimapObjectiveTimersBridgeMode(
            panels, overlay,
            {timerWidth: timerWidth, timerHeight: timerHeight, timerGap: timerGap, timerPaddingX: timerPaddingX, timerRadius: timerRadius, timerFont: timerFont, timerIcon: timerIcon, bottomOffset: bottomOffset},
            {minimapSize: minimapSize, bridgeTimerWidth: bridgeTimerWidth, bridgeTimerHeight: bridgeTimerHeight, bridgeTimerPaddingX: bridgeTimerPaddingX, bridgeTimerRadius: bridgeTimerRadius, bridgeTimerFont: bridgeTimerFont, bridgeHorizontalOffset: bridgeHorizontalOffset},
            {buffEnabled: buffEnabled, buffOnBridgeEnabled: buffOnBridgeEnabled, rejuvEnabled: rejuvEnabled, rejuvOnBridgeEnabled: rejuvOnBridgeEnabled, buffRed: buffRed, buffYellow: buffYellow, rejuvRed: rejuvRed, rejuvYellow: rejuvYellow},
            {buffIcon: buffIcon, buffBridgeLeftIcon: buffBridgeLeftIcon, buffBridgeRightIcon: buffBridgeRightIcon, rejuvIcon: rejuvIcon},
            bridgeText, rejuvText
        );
    }

    function EnsureRejuvState() {
        if (State.rejuvState) return State.rejuvState;
        State.rejuvState = {
            running: false,
            wasInHideout: false,
            idx: 0,
            counter: 0,
            phaseStart: 0,
            claimCount: 0,
            spawnWaiting: false,
            lastScanFound: false,
            lastRejuvChargeCount: 0,
            lastMidBossActive: false,
            buffStartTime: 0,
            buffCounter: 0,
            lastBuffGameSec: -BUFF_LOCKOUT_SEC,
            lastSec: -1,
            lastGlobalSec: -1,
            lastRuntimeSec: -1,
            lastRuntimeFeatureSig: "",
            nextScanMs: 0,
            rotatingUntilMs: 0,
            rejuvBuffHideAtMs: 0,
            lastChargesLookupMs: 0,
            lastChargeCountReadMs: 0,
            lastChargeCountValue: 0,
            nextMidBossLookupMs: 0,
            lastMinimapRenderSig: "",
            cacheTopBar: null,
            cacheCharges: null,
            cacheFriendly: null,
            cacheEnemy: null,
            cacheRejuvTimer: null,
            cacheMidBossButton: null,
            cacheMidLabel: null, // stock #MidbossTimerLabel
            cacheMinimap: null, // stock #hud_minimap (bridge buff markers)
            stockMidMode: "", // "alive" | "cooldown" | "" (stock panel missing)
            bridgeTakenCycle: -1, // the 5:00 cycle whose bridge buffs are gone
            bridgeLastSec: -1,
            panels: {}
        };
        return State.rejuvState;
    }

    function GetRejuvPanel(state, root, key, id) {
        var panel = IsPanelValid(state.panels[key]) ? state.panels[key] : null;
        if (!panel) {
            panel = root ? root.FindChildTraverse(id) : null;
            state.panels[key] = panel || null;
        }
        return panel;
    }

    function RejuvResetImage(state, root) {
        var rImg = GetRejuvPanel(state, root, "rImg", "RejuvImg");
        var rImgHUD = GetRejuvPanel(state, root, "rImgHUD", "RejuvImgHUD");
        var imgs = [rImg, rImgHUD];
        for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            if (!img) continue;
            img.RemoveClass("rotating");
            img.RemoveClass("buff");
            img.RemoveClass("reverse");
            img.RemoveClass("white");
        }
    }

    function RejuvSetPhaseImage(state, root, name, nowMs) {
        RejuvResetImage(state, root);
        var rImg = GetRejuvPanel(state, root, "rImg", "RejuvImg");
        var rImgHUD = GetRejuvPanel(state, root, "rImgHUD", "RejuvImgHUD");
        var imgs = [rImg, rImgHUD];

        var addBuff = String(name).toLowerCase().endsWith("buff");
        var addReverse = String(name).toLowerCase().endsWith("cd");
        for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            if (!img) continue;
            if (addBuff) img.AddClass("buff");
            if (addReverse) img.AddClass("reverse");
            if (addBuff || addReverse) img.AddClass("rotating");
        }
        if (addBuff || addReverse) state.rotatingUntilMs = nowMs + REJUV_ROTATE_ANIM_MS;
    }

    function RejuvSetLabels(state, root, timeText, numText) {
        var rLab = GetRejuvPanel(state, root, "rLab", "RejuvTime");
        var rLabHUD = GetRejuvPanel(state, root, "rLabHUD", "RejuvTimeHUD");
        var rNum = GetRejuvPanel(state, root, "rNum", "RejuvNum");
        var rNumHUD = GetRejuvPanel(state, root, "rNumHUD", "RejuvNumHUD");
        if (rLab && rLab.text !== timeText) rLab.text = timeText;
        if (rLabHUD && rLabHUD.text !== timeText) rLabHUD.text = timeText;
        if (rNum && rNum.text !== numText) rNum.text = numText;
        if (rNumHUD && rNumHUD.text !== numText) rNumHUD.text = numText;
    }

    function ApplyRedYellowPanelClasses(panel, red, yellow) {
        if (!panel) return;
        var showRed = !!red;
        var showYellow = !showRed && !!yellow;
        SetPanelClassIfChanged(panel, "red", showRed);
        SetPanelClassIfChanged(panel, "yellow", showYellow);
    }

    function RejuvShowSpawn(state, root) {
        RejuvSetLabels(state, root, "Spawn", REJUV_SEQ[state.idx].num);
        RejuvResetImage(state, root);
        var rImg = GetRejuvPanel(state, root, "rImg", "RejuvImg");
        var rImgHUD = GetRejuvPanel(state, root, "rImgHUD", "RejuvImgHUD");
        if (rImg) rImg.AddClass("white");
        if (rImgHUD) rImgHUD.AddClass("white");
        ApplyRedYellowPanelClasses(GetRejuvPanel(state, root, "rejuvHUD", "RejuvHUD"), true, false);
        state.spawnWaiting = true;
        state.lastScanFound = false;
    }

    function RejuvCalcPhaseAt(t) {
        var tt = Math.max(0, Math.floor(Number(t) || 0));
        if (Number(REJUV_SEQ[0].dur) <= 0) {
            return { idx: 0, phaseStart: tt, counter: 0, spawnWaiting: true };
        }
        if (tt <= 2) {
            return { idx: 0, phaseStart: 0, counter: REJUV_SEQ[0].dur };
        }
        var cum = 0;
        for (var i = 0; i < REJUV_SEQ.length; i++) {
            var dur = REJUV_SEQ[i].dur;
            if (tt < cum + dur) {
                return { idx: i, phaseStart: cum, counter: (cum + dur - tt) };
            }
            cum += dur;
        }
        var lastIdx = REJUV_SEQ.length - 1;
        var lastDur = REJUV_SEQ[lastIdx].dur;
        var mod = (tt - cum) % BRIDGE_DURATION_SEC;
        var within = mod % lastDur;
        return { idx: lastIdx, phaseStart: tt - within, counter: lastDur - within };
    }

    function RejuvStartPhaseAuto(state, root, nowSec, nowMs) {
        var computed = RejuvCalcPhaseAt(nowSec);
        state.idx = computed.idx;
        state.counter = computed.counter;
        state.phaseStart = computed.phaseStart;
        state.spawnWaiting = false;
        if (computed.spawnWaiting || state.counter <= 0) {
            RejuvShowSpawn(state, root);
            return;
        }
        ApplyRedYellowPanelClasses(GetRejuvPanel(state, root, "rejuvHUD", "RejuvHUD"), false, false);
        RejuvSetLabels(state, root, FormatClockMmSs(state.counter), REJUV_SEQ[state.idx].num);
        RejuvSetPhaseImage(state, root, REJUV_SEQ[state.idx].name, nowMs);
    }

    function RejuvStartPhaseManual(state, root, targetIdx, nowSec, nowMs) {
        var idx = Math.max(0, Math.min(REJUV_SEQ.length - 1, Number(targetIdx) || 0));
        state.idx = idx;
        state.counter = REJUV_SEQ[idx].dur;
        state.phaseStart = nowSec;
        state.spawnWaiting = false;
        ApplyRedYellowPanelClasses(GetRejuvPanel(state, root, "rejuvHUD", "RejuvHUD"), false, false);
        RejuvSetLabels(state, root, FormatClockMmSs(state.counter), REJUV_SEQ[idx].num);
        RejuvSetPhaseImage(state, root, REJUV_SEQ[idx].name, nowMs);
    }

    function RejuvEndBuff(state, root, nowMs, immediate) {
        state.buffStartTime = 0;
        state.buffCounter = 0;
        state.heldUnknown = false;
        RejuvResetRadial(state);
        var rejuvBuff = GetRejuvPanel(state, root, "rejuvBuff", "RejuvBuff");
        if (!rejuvBuff) return;

        rejuvBuff.RemoveClass("pop-out");
        if (immediate) {
            rejuvBuff.RemoveClass("pop-in");
            SetPanelOpacitySafe(rejuvBuff, 0, 0);
            state.rejuvBuffHideAtMs = 0;
            return;
        }
        rejuvBuff.AddClass("pop-in");
        state.rejuvBuffHideAtMs = nowMs + REJUV_HIDE_POPIN_MS;
    }

    // unknownStart: the pickup was not seen (a join or seek mid-buff); the time shows HELD until the stock
    // circle gives it (RejuvHeldSample).
    function RejuvStartBuff(state, root, nowSec, preserveExisting, unknownStart) {
        if (preserveExisting && state.buffStartTime > 0 && state.buffCounter > 0) {
            return;
        }
        state.buffStartTime = nowSec;
        state.buffCounter = REJUV_DURATION_SEC;
        state.heldUnknown = !!unknownStart;
        RejuvResetRadial(state);
        var rejuvBuff = GetRejuvPanel(state, root, "rejuvBuff", "RejuvBuff");
        var rejuvBuffTime = GetRejuvPanel(state, root, "rejuvBuffTime", "RejuvTimeBuff");
        if (rejuvBuff) {
            rejuvBuff.RemoveClass("pop-in");
            rejuvBuff.AddClass("pop-out");
            SetPanelOpacitySafe(rejuvBuff, 1, 1);
        }
        if (rejuvBuffTime) rejuvBuffTime.text = state.heldUnknown ? "HELD" : FormatClockMmSs(state.buffCounter);
    }

    function RejuvResetRadial(state) {
        state.heldRadA = null;
        state.heldRadT = null;
        state.heldRadDir = 0;
    }

    // Seconds of buff left from the stock circle (#RejuvenatorTimer #StatusEffectsBorder, a radial clip
    // like a status effect's: 3:00 = 360 deg), or null. Which way it runs is learned from two samples at
    // least HELD_RATE_MIN_GAP_SEC apart whose rate is about 2 deg/s (Observer HUD's rejuvRadialLeft; the
    // circle has not been seen live during a held buff).
    function RejuvRadialLeft(state, nowSec) {
        var timer = state.cacheRejuvTimer;
        if (!IsPanelValid(state.cacheRejuvBorder)) state.cacheRejuvBorder = IsPanelValid(timer) ? timer.FindChildTraverse("StatusEffectsBorder") || null : null;
        var border = state.cacheRejuvBorder;
        var match = border ? HELD_RADIAL.exec(String(border.style.clip || "")) : null;
        var angle = match ? Math.abs(Number(match[1])) : NaN;
        if (!(angle >= 0 && angle <= 360)) return null;
        if (!state.heldRadDir) {
            if (state.heldRadT === null || nowSec < state.heldRadT) {
                state.heldRadA = angle;
                state.heldRadT = nowSec;
                return null;
            }
            if (nowSec - state.heldRadT < HELD_RATE_MIN_GAP_SEC) return null;
            var rate = (angle - state.heldRadA) / (nowSec - state.heldRadT);
            var expected = 360 / REJUV_DURATION_SEC;
            if (Math.abs(Math.abs(rate) - expected) > expected / 2) {
                state.heldRadA = angle;
                state.heldRadT = nowSec;
                return null;
            }
            state.heldRadDir = rate < 0 ? 1 : -1;
        }
        var share = state.heldRadDir > 0 ? angle / 360 : 1 - angle / 360;
        return Math.round(share * REJUV_DURATION_SEC);
    }

    // #RejuvenatorTimer.has_rejuv while a team holds the buff (live 2026-10-22). A pickup seen happen (a
    // free sample came first) counts 3:00 from that second; one found already held reads the circle.
    function RejuvHeldSample(state, root, nowSec) {
        var timer = IsPanelValid(state.cacheRejuvTimer) ? state.cacheRejuvTimer : null;
        if (!timer) return;
        var has = timer.BHasClass("has_rejuv");
        if (!has) {
            state.heldSawFree = true;
            state._lastHadRejuvPerTick = false;
            return;
        }
        if (!state._lastHadRejuvPerTick) {
            state._lastHadRejuvPerTick = true;
            if (nowSec >= (state.lastBuffGameSec || 0) + BUFF_LOCKOUT_SEC) {
                state.lastBuffGameSec = nowSec;
                RejuvStartBuff(state, root, nowSec, true, !state.heldSawFree);
            }
        }
        if (state.heldUnknown && state.buffStartTime > 0) {
            var left = RejuvRadialLeft(state, nowSec);
            if (left !== null) {
                state.heldUnknown = false;
                state.buffStartTime = nowSec - (REJUV_DURATION_SEC - left);
            }
        }
    }

    // A timer outside its show window carries DLFCueHidden (collapsed by DLF's CSS); written on change.
    function SetCueHidden(state, panel, key, hidden) {
        if (!panel || state[key] === hidden) return;
        state[key] = hidden;
        panel.SetHasClass(CUE_HIDDEN_CLASS, hidden);
    }

    // The holding team's colour on the held time: RejuvCount_N sits on #RejuvenatorFriendly (Amber, the
    // top bar's team 2) or #RejuvenatorEnemy (Sapphire).
    function RejuvSetHolder(state, root) {
        var friendly = Number(state.lastChargeFriendly) || 0;
        var enemy = Number(state.lastChargeEnemy) || 0;
        var cls = friendly || enemy ? (friendly >= enemy ? "DLFHeldAmber" : "DLFHeldSapphire") : "";
        if (state.heldClass === cls) return;
        var rejuvBuff = GetRejuvPanel(state, root, "rejuvBuff", "RejuvBuff");
        if (!rejuvBuff) return;
        state.heldClass = cls;
        rejuvBuff.SetHasClass("DLFHeldAmber", cls === "DLFHeldAmber");
        rejuvBuff.SetHasClass("DLFHeldSapphire", cls === "DLFHeldSapphire");
    }

    function RejuvReadChargeCount(state, root, nowMs) {
        if (!state) return 0;
        if (state.lastChargeCountReadMs === nowMs) {
            return Number(state.lastChargeCountValue) || 0;
        }
        var anyInvalid =
            !IsPanelValid(state.cacheTopBar) ||
            !IsPanelValid(state.cacheCharges) ||
            !IsPanelValid(state.cacheFriendly) ||
            !IsPanelValid(state.cacheEnemy);
        if (anyInvalid) {
            // Only re-walk the tree when a cached panel actually died
            // (rare — these are top-bar children that persist all match).
            // Backoff prevents hammering if the panels genuinely don't exist yet.
            if (nowMs - state.lastChargesLookupMs > REJUV_CHARGES_LOOKUP_INTERVAL_MS) {
                state.lastChargesLookupMs = nowMs;
                state.cacheTopBar = root.FindChildTraverse(PANEL_ID_TOP_BAR) || root.FindChildTraverse("CitadelHudTopBar");
                state.cacheCharges = state.cacheTopBar ? state.cacheTopBar.FindChildTraverse("RejuvenatorCharges") : null;
                state.cacheFriendly = state.cacheCharges ? state.cacheCharges.FindChildTraverse("RejuvenatorFriendly") : null;
                state.cacheEnemy = state.cacheCharges ? state.cacheCharges.FindChildTraverse("RejuvenatorEnemy") : null;
                state.cacheRejuvTimer = state.cacheCharges ? state.cacheCharges.FindChildTraverse("RejuvenatorTimer") : null;
            }
        }

        state.lastChargeFriendly = GetHighestRejuvChargeTokenOnPanel(state.cacheFriendly);
        state.lastChargeEnemy = GetHighestRejuvChargeTokenOnPanel(state.cacheEnemy);
        var chargeCount = Math.max(state.lastChargeFriendly, state.lastChargeEnemy);
        state.lastChargeCountReadMs = nowMs;
        state.lastChargeCountValue = chargeCount;
        return chargeCount;
    }

    function RejuvHasAnyCharges(state, root, nowMs) {
        return RejuvReadChargeCount(state, root, nowMs) > 0;
    }

    function RejuvGetChargeCount(state, root, nowMs) {
        return RejuvReadChargeCount(state, root, nowMs);
    }

    function RejuvFindMidBossButton(root) {
        if (!root || !root.FindChildrenWithClassTraverse) return null;
        var allPanels = root.FindChildrenWithClassTraverse("mid_boss") || [];
        for (var i = 0; i < allPanels.length; i++) {
            var panel = allPanels[i];
            if (!IsPanelValid(panel)) continue;
            if (panel.BHasClass && panel.BHasClass("map_button")) return panel;
            if (PanelHasClassToken(panel, "map_button")) return panel;
        }
        return null;
    }

    function RejuvIsMidBossSpawned(state, root, nowMs) {
        if (!state || !root) return false;
        var button = IsPanelValid(state.cacheMidBossButton) ? state.cacheMidBossButton : null;
        if (!button) {
            // Only re-walk the tree when the cached button isn't valid.
            // Once found, it persists for the entire match (the mid_boss
            // map_button is a permanent child of the minimap). Backoff
            // prevents hammering when the button genuinely doesn't exist.
            if (nowMs >= (state.nextMidBossLookupMs || 0)) {
                button = RejuvFindMidBossButton(root);
                state.cacheMidBossButton = button || null;
                state.nextMidBossLookupMs = nowMs + REJUV_MIDBOSS_LOOKUP_INTERVAL_MS;
            }
        }
        if (!button) return false;
        if (button.BHasClass && button.BHasClass("midboss_spawned")) return true;
        return PanelHasClassToken(button, "midboss_spawned");
    }

    function RejuvGetScanIntervalMs(state) {
        if (!state) return REJUV_SCAN_INTERVAL_MS;
        if (state.spawnWaiting || state.buffStartTime > 0) return REJUV_SCAN_INTERVAL_FAST_MS;
        return REJUV_SCAN_INTERVAL_MS;
    }

    function RejuvResetState(state, root, nowMs) {
        state.running = false;
        state.idx = 0;
        state.counter = 0;
        state.phaseStart = 0;
        state.claimCount = 0;
        state.spawnWaiting = false;
        state.lastScanFound = false;
        state.lastRejuvChargeCount = 0;
        state.lastMidBossActive = false;
        state.lastBuffGameSec = -BUFF_LOCKOUT_SEC;
        state.lastSec = -1;
        state.lastGlobalSec = -1;
        state.lastRuntimeSec = -1;
        state.lastRuntimeFeatureSig = "";
        state._cachedRuntimeFeatureSig = "";
        state._cachedConfigRef = null;
        state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state);
        state.rotatingUntilMs = 0;
        state.rejuvBuffHideAtMs = 0;
        state.lastChargesLookupMs = 0;
        state.lastChargeCountReadMs = 0;
        state.lastChargeCountValue = 0;
        state.nextMidBossLookupMs = 0;
        state.lastMinimapRenderSig = "";
        state._lastMidBossSpawned = undefined;
        state._lastHadRejuvPerTick = false;
        state.cacheTopBar = null;
        state.cacheCharges = null;
        state.cacheFriendly = null;
        state.cacheEnemy = null;
        state.cacheRejuvTimer = null;
        state.cacheMidBossButton = null;
        state.cacheMidLabel = null;
        state.cacheMinimap = null;
        state.stockMidMode = "";
        state.bridgeTakenCycle = -1;
        state.bridgeLastSec = -1;
        state.heldSawFree = false;
        state.heldUnknown = false;
        state.cacheRejuvBorder = null;
        RejuvResetRadial(state);
        state.midSpawnUntil = 0;
        state.midNextSec = 0;
        state.cues = null;
        state.midHidden = undefined;
        state.bridgeHidden = undefined;
        if (Number(REJUV_SEQ[0].dur) <= 0) {
            RejuvShowSpawn(state, root);
        } else {
            RejuvSetLabels(state, root, FormatClockMmSs(REJUV_SEQ[0].dur), REJUV_SEQ[0].num);
            RejuvResetImage(state, root);
        }
        RejuvEndBuff(state, root, nowMs, true);
    }

    // Mid-boss: after a kill the stock #RejuvenatorTimer gets .midboss_cooldown and its
    // {s:midboss_timer} label counts down the respawn (from 7:00 after the first kill; live, Observer
    // HUD, client 6813, demo 121685912). While the mid-boss is alive there is no class. The stock label
    // is the authority, so a mid-game join or a demo seek shows the right time; QOLLOCK's own phase
    // sequence is only the fallback when the stock panel is missing.
    // While either team holds a rejuvenator charge the stock top bar sets .has_rejuv instead, drops
    // .midboss_cooldown and stops writing the label, which keeps its last text (client 6819, client.dll
    // rva 0x1c74d40). The respawn keeps counting (m_tNextMidBossSpawnTime is set at the kill), so that
    // case is { held: true } and the time comes from the last stock countdown seen (user 2026-10-25: the
    // top timer sat on 6:00 under a held buff).
    function ParseMmSs(text) {
        var match = /^\s*(\d+):(\d{2})\s*$/.exec(String(text || ""));
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    }
    function RejuvStockMidboss(state, root, nowMs) {
        RejuvReadChargeCount(state, root, nowMs); // keeps cacheRejuvTimer fresh
        var timer = IsPanelValid(state.cacheRejuvTimer) ? state.cacheRejuvTimer : null;
        if (!timer) return null;
        if (timer.BHasClass("has_rejuv")) return { held: true, left: 0 };
        if (!timer.BHasClass("midboss_cooldown")) return { alive: true, left: 0 };
        if (!IsPanelValid(state.cacheMidLabel)) state.cacheMidLabel = timer.FindChildTraverse("MidbossTimerLabel") || null;
        var left = IsPanelValid(state.cacheMidLabel) ? ParseMmSs(state.cacheMidLabel.text) : null;
        return left === null ? null : { alive: false, left: left };
    }

    // Seconds to the mid-boss respawn while a rejuvenator is held, or null when unknown: from the last
    // stock countdown seen, else from the kill QOLLOCK saw on the minimap (its respawn sequence).
    function RejuvHeldRespawnLeft(state, nowSec) {
        var left = state.midNextSec > 0 ? state.midNextSec - nowSec
            : state.idx > 0 ? REJUV_SEQ[state.idx].dur - (nowSec - state.phaseStart) : null;
        return left !== null && left > 0 ? left : null;
    }

    // Bridge buffs spawn at 5:00 and every 5:00 as minimap .powerup_spawn markers that stay until taken
    // (live, Observer HUD, 2026-10-22). The timer reads UP while a marker shows, then counts to the next
    // spawn. The minimap is scanned once a second only until the cycle's buffs are gone.
    function BridgeBuffsUp(state, root, nowSec) {
        if (nowSec < state.bridgeLastSec - 3) state.bridgeTakenCycle = -1; // a seek back
        state.bridgeLastSec = nowSec;
        if (nowSec < BRIDGE_DURATION_SEC) return false;
        var cycle = Math.floor(nowSec / BRIDGE_DURATION_SEC);
        if (state.bridgeTakenCycle === cycle) return false;
        if (!IsPanelValid(state.cacheMinimap)) state.cacheMinimap = root.FindChildTraverse("hud_minimap") || null;
        var markers = IsPanelValid(state.cacheMinimap) ? state.cacheMinimap.FindChildrenWithClassTraverse("powerup_spawn") : [];
        if (markers && markers.length > 0) return true;
        // The markers can lag the spawn second by a moment.
        if (nowSec % BRIDGE_DURATION_SEC >= 3) state.bridgeTakenCycle = cycle;
        return false;
    }

    function UpdateRejuvBuffTimers(root, cfg, nowMs) {
        if (!root) return;
        if (!isFinite(nowMs)) {
            nowMs = Date.now ? Date.now() : (new Date()).getTime();
        }
        var rejuvHudEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_REJUV_HUD"));
        var buffHudEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_HUD"));
        var minimapRejuvEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER"));
        var minimapBuffEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER"));
        var anyObjectiveTimerEnabled = rejuvHudEnabled || buffHudEnabled || minimapRejuvEnabled || minimapBuffEnabled;
        if (!anyObjectiveTimerEnabled) {
            HideMinimapObjectiveTimers(root);
            if (!State.rejuvWasDisabled) {
                var disabledState = EnsureRejuvState();
                RejuvResetState(disabledState, root, nowMs);
                State.rejuvWasDisabled = true;
            }
            return;
        }

        if (IsStreetBrawlModeActive(root)) {
            HideMinimapObjectiveTimers(root);
            if (!State.rejuvWasDisabled) {
                var streetBrawlState = EnsureRejuvState();
                RejuvResetState(streetBrawlState, root, nowMs);
                State.rejuvWasDisabled = true;
            }
            return;
        }

        State.rejuvWasDisabled = false;

        var state = EnsureRejuvState();
        var nowSec = GetGameSecondsForUrn(root);

        // Detect game-time rollover
        if (state.lastGlobalSec >= 0 && (nowSec + 5 < state.lastGlobalSec || (state.lastGlobalSec > 30 && nowSec <= 2))) {
            RejuvResetState(state, root, nowMs);
        }

        // Init on first run
        if (!state.running) {
            state.running = true;
            state.claimCount = 0;
            state.lastScanFound = false;
            state.spawnWaiting = false;
            RejuvStartPhaseAuto(state, root, nowSec, nowMs);
            state.lastSec = nowSec;
            state.lastGlobalSec = nowSec;
            state.lastRejuvChargeCount = RejuvGetChargeCount(state, root, nowMs);
            state.lastMidBossActive = RejuvIsMidBossSpawned(state, root, nowMs);
            state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state);
        } else {
            // A jump forward (seek, late sample): a pickup seen next has no known time.
            if (nowSec > state.lastGlobalSec + 5) state.heldSawFree = false;
            state.lastGlobalSec = nowSec;
        }

        // Cache runtime feature sig — only rebuild when config changes
        if (State.lastConfig !== state._cachedConfigRef) {
            var activeMinimapObjectiveSize = ResolveActiveMinimapObjectiveSize(root, cfg);
            var minimapPerspForObjectiveSig = ResolveCachedPanel(root, "minimapPersp", "minimap_persp");
            var activeObjectiveZoomSig =
                (IsHudClassActive(root, "gDetailView") || hasClassInHierarchy(minimapPerspForObjectiveSig, "gDetailView") ? "A" : "") +
                (IsHudClassActive(root, "gScoreboardOpen") || hasClassInHierarchy(minimapPerspForObjectiveSig, "gScoreboardOpen") ? "T" : "");
            state._cachedRuntimeFeatureSig = [
                rejuvHudEnabled ? "1" : "0",
                buffHudEnabled ? "1" : "0",
                minimapRejuvEnabled ? "1" : "0",
                minimapBuffEnabled ? "1" : "0",
                cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE") ? "1" : "0",
                cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS") ? "1" : "0",
                String(cfg && cfg.MINIMAP_SMALL_SIZE !== undefined ? cfg.MINIMAP_SMALL_SIZE : ""),
                String(activeMinimapObjectiveSize),
                activeObjectiveZoomSig
            ].join("|");
            state._cachedConfigRef = State.lastConfig;
        }

        // Per-tick cheap change detection — catches mid-boss kills and rejuv
        // captures within ~200ms instead of waiting for the 3s scan interval.
        // Uses BHasClass and GetChildCount on cached panels (property reads,
        // no tree walks). Only fires when caches are already populated by a
        // prior full scan.
        var midBossBtn = IsPanelValid(state.cacheMidBossButton) ? state.cacheMidBossButton : null;
        if (midBossBtn) {
            var midBossSpawned = !!(midBossBtn.BHasClass && midBossBtn.BHasClass("midboss_spawned"));
            if (midBossSpawned !== state._lastMidBossSpawned) {
                state._lastMidBossSpawned = midBossSpawned;
                state.nextScanMs = 0; // force immediate full scan on change
            }
        }
        // Per-tick rejuv buff start via has_rejuv class on cached RejuvenatorTimer (RejuvHeldSample).
        // 2-minute lockout prevents repeated triggers within the same buff window.
        RejuvHeldSample(state, root, nowSec);

        // Fast-path early-exit: skip all panel lookups and class checks
        // when nothing stateful changed since last tick. This fires on
        // ~24 of 25 ticks (every tick except second boundaries and scans).
        if (
            state.lastRuntimeSec === nowSec &&
            state.lastRuntimeFeatureSig === state._cachedRuntimeFeatureSig &&
            nowMs < (state.nextScanMs || 0) &&
            (state.rotatingUntilMs <= 0 || nowMs < state.rotatingUntilMs) &&
            (state.rejuvBuffHideAtMs <= 0 || nowMs < state.rejuvBuffHideAtMs) &&
            state.buffStartTime <= 0
        ) {
            return;
        }

        // ---- below this line only runs when something actually changed ----

        // Panel lookups + hideout check (only on changed ticks, not every tick)
        var hideout = isConnectedToHideout(root);
        if (hideout) {
            if (!state.wasInHideout || state.running || state.buffStartTime > 0) {
                RejuvResetState(state, root, nowMs);
            }
            state.wasInHideout = true;
            HideMinimapObjectiveTimers(root);
            return;
        }
        if (state.wasInHideout) {
            state.wasInHideout = false;
            state.nextScanMs = nowMs;
        }

        if (state.rotatingUntilMs > 0 && nowMs >= state.rotatingUntilMs) {
            state.rotatingUntilMs = 0;
            var rImgA = GetRejuvPanel(state, root, "rImg", "RejuvImg");
            var rImgHUDA = GetRejuvPanel(state, root, "rImgHUD", "RejuvImgHUD");
            if (rImgA) rImgA.RemoveClass("rotating");
            if (rImgHUDA) rImgHUDA.RemoveClass("rotating");
        }

        if (state.rejuvBuffHideAtMs > 0 && nowMs >= state.rejuvBuffHideAtMs) {
            state.rejuvBuffHideAtMs = 0;
            var rejuvBuff = GetRejuvPanel(state, root, "rejuvBuff", "RejuvBuff");
            if (rejuvBuff) SetPanelOpacitySafe(rejuvBuff, 0, 0);
        }

        if (nowSec !== state.lastSec) {
            state.lastSec = nowSec;
            var stockMid = RejuvStockMidboss(state, root, nowMs);
            var rejuvHUD = GetRejuvPanel(state, root, "rejuvHUD", "RejuvHUD");
            var prevMidMode = state.stockMidMode;
            // The first sample after a join fills the timer cache only now.
            RejuvHeldSample(state, root, nowSec);
            var heldLeft = null;
            if (stockMid && stockMid.alive) {
                // A countdown written meanwhile (the minimap kill scan below) goes back to Spawn too.
                if (state.stockMidMode !== "alive" || !state.spawnWaiting) RejuvShowSpawn(state, root);
                if (prevMidMode === "cooldown" || prevMidMode === "held") state.midSpawnUntil = nowSec + MID_SPAWN_SHOW_SEC;
                state.stockMidMode = "alive";
                state.midNextSec = 0;
            } else if (stockMid && stockMid.held) {
                heldLeft = RejuvHeldRespawnLeft(state, nowSec);
                if (state.stockMidMode !== "held") {
                    RejuvResetImage(state, root);
                    RejuvSetPhaseImage(state, root, REJUV_SEQ[state.idx].name, nowMs);
                }
                state.stockMidMode = "held";
                state.spawnWaiting = false;
                if (heldLeft !== null) {
                    state.counter = heldLeft;
                    RejuvSetLabels(state, root, FormatClockMmSs(heldLeft), REJUV_SEQ[state.idx].num);
                    ApplyRedYellowPanelClasses(rejuvHUD, heldLeft < 10 && (heldLeft % 2) === 1,
                        heldLeft < 20 && (heldLeft % 2) === 1);
                }
            } else if (stockMid) {
                if (state.stockMidMode !== "cooldown") {
                    RejuvResetImage(state, root);
                    RejuvSetPhaseImage(state, root, REJUV_SEQ[state.idx].name, nowMs);
                }
                state.stockMidMode = "cooldown";
                state.spawnWaiting = false;
                state.counter = stockMid.left;
                state.midNextSec = nowSec + stockMid.left;
                RejuvSetLabels(state, root, FormatClockMmSs(stockMid.left), REJUV_SEQ[state.idx].num);
                ApplyRedYellowPanelClasses(rejuvHUD, stockMid.left < 10 && (stockMid.left % 2) === 1,
                    stockMid.left < 20 && (stockMid.left % 2) === 1);
            } else {
                state.stockMidMode = "";
                var dur = REJUV_SEQ[state.idx].dur;
                var remaining = Math.max(0, dur - (nowSec - state.phaseStart));
                if (remaining <= 0) {
                    RejuvShowSpawn(state, root);
                } else {
                    state.counter = remaining;
                    RejuvSetLabels(state, root, FormatClockMmSs(remaining), REJUV_SEQ[state.idx].num);
                    ApplyRedYellowPanelClasses(
                        rejuvHUD,
                        remaining < 10 && (remaining % 2) === 1,
                        remaining < 20 && (remaining % 2) === 1
                    );
                }
            }
            // DLF show window (state.cues.mid): a respawn shows its last `mid` s, a respawned mid-boss
            // reads Spawn for MID_SPAWN_SHOW_SEC; 0 never, -1 always (the default, as before).
            state.cues = DlfCues ? DlfCues() : CUE_FALLBACK;
            var midCue = state.cues.mid;
            // While a rejuvenator is held with no known respawn time (joined mid-buff) it hides.
            var midHidden = midCue === 0 ? true
                : stockMid && stockMid.held && heldLeft === null ? true
                : midCue < 0 ? false
                : stockMid && stockMid.alive ? !(nowSec < (state.midSpawnUntil || 0))
                : stockMid && stockMid.held ? heldLeft > midCue
                : stockMid ? stockMid.left > midCue
                : state.spawnWaiting || state.counter > midCue; // QOLLOCK's own sequence (no stock panel)
            SetCueHidden(state, rejuvHUD, "midHidden", midHidden);
        }

        if (state.buffStartTime > 0) {
            var elapsed = nowSec - state.buffStartTime;
            state.buffCounter = state.heldUnknown ? REJUV_DURATION_SEC : Math.max(0, REJUV_DURATION_SEC - elapsed);
            var rejuvBuffTime = GetRejuvPanel(state, root, "rejuvBuffTime", "RejuvTimeBuff");
            var buffTimeText = state.heldUnknown ? "HELD" : FormatClockMmSs(state.buffCounter);
            if (rejuvBuffTime && rejuvBuffTime.text !== buffTimeText) rejuvBuffTime.text = buffTimeText;

            var liveChargeCount = RejuvGetChargeCount(state, root, nowMs);
            RejuvSetHolder(state, root);
            if (liveChargeCount <= 0 || state.buffCounter <= 0) {
                RejuvEndBuff(state, root, nowMs, false);
            }
        }

        var remainingBridge = BRIDGE_DURATION_SEC - (nowSec % BRIDGE_DURATION_SEC);
        var bridgeUp = BridgeBuffsUp(state, root, nowSec);
        var bridgeText = bridgeUp ? "UP" : FormatClockMmSs(remainingBridge);
        var buffLabel = GetRejuvPanel(state, root, "buffLabel", "BuffTime");
        var buffLabelHUD = GetRejuvPanel(state, root, "buffLabelHUD", "BuffTimeHUD");
        if (buffLabel && buffLabel.text !== bridgeText) buffLabel.text = bridgeText;
        if (buffLabelHUD && buffLabelHUD.text !== bridgeText) buffLabelHUD.text = bridgeText;

        var buffHUD = GetRejuvPanel(state, root, "buffHUD", "BuffHUD");
        ApplyRedYellowPanelClasses(
            buffHUD,
            !bridgeUp && remainingBridge < 10 && (remainingBridge % 2) === 1,
            !bridgeUp && remainingBridge < 20 && (remainingBridge % 2) === 1
        );
        // DLF show window (state.cues.bridge): the last `bridge` s before a spawn and UP; 0 never, -1 always.
        var bridgeCue = (state.cues || CUE_FALLBACK).bridge;
        SetCueHidden(state, buffHUD, "bridgeHidden", bridgeCue === 0 || (bridgeCue > 0 && !bridgeUp && remainingBridge > bridgeCue));

        var rejuvTextForMinimap = state.spawnWaiting ? "Spawn" : FormatClockMmSs(state.counter);
        var rejuvRemainForMinimap = state.spawnWaiting ? 0 : state.counter;

        // Ensure runtime zoom/objective values are fresh for the minimap
        // render sig — on ticks where the config-change block above didn't
        // fire, these var-declared values are still undefined.
        if (activeMinimapObjectiveSize === undefined) {
            activeMinimapObjectiveSize = ResolveActiveMinimapObjectiveSize(root, cfg);
        }
        if (activeObjectiveZoomSig === undefined) {
            var minimapPerspForObjectiveSigFresh = ResolveCachedPanel(root, "minimapPersp", "minimap_persp");
            activeObjectiveZoomSig =
                (IsHudClassActive(root, "gDetailView") || hasClassInHierarchy(minimapPerspForObjectiveSigFresh, "gDetailView") ? "A" : "") +
                (IsHudClassActive(root, "gScoreboardOpen") || hasClassInHierarchy(minimapPerspForObjectiveSigFresh, "gScoreboardOpen") ? "T" : "");
        }

        var minimapRenderSig = [
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER") ? 1 : 0,
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE") ? 1 : 0,
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER") ? 1 : 0,
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS") ? 1 : 0,
            String(Number(cfg.MINIMAP_SMALL_SIZE) || 0),
            String(activeMinimapObjectiveSize),
            activeObjectiveZoomSig,
            bridgeText,
            String(remainingBridge),
            rejuvTextForMinimap,
            String(rejuvRemainForMinimap),
            state.spawnWaiting ? "1" : "0"
        ].join("|");
        if (
            minimapRenderSig !== String(state.lastMinimapRenderSig || "") ||
            !GetCachedPanel("minimapObjectiveTimersRoot")
        ) {
            UpdateMinimapObjectiveTimers(
                root,
                cfg,
                bridgeText,
                remainingBridge,
                rejuvTextForMinimap,
                rejuvRemainForMinimap,
                state.spawnWaiting
            );
            state.lastMinimapRenderSig = minimapRenderSig;
        }

        if (nowMs >= (state.nextScanMs || 0)) {
            var found = RejuvHasAnyCharges(state, root, nowMs);
            var chargeCount = RejuvGetChargeCount(state, root, nowMs);
            var midBossActive = RejuvIsMidBossSpawned(state, root, nowMs);

            var phaseAdvanced = false;
            if (state.lastMidBossActive && !midBossActive) {
                state.claimCount++;
                var targetIdx = state.claimCount > 2 ? 3 : state.claimCount;
                RejuvStartPhaseManual(state, root, targetIdx, nowSec, nowMs);
                phaseAdvanced = true;
            }
            if (!phaseAdvanced && state.spawnWaiting && found && !state.lastScanFound) {
                state.claimCount++;
                var targetIdxFallback = state.claimCount > 2 ? 3 : state.claimCount;
                RejuvStartPhaseManual(state, root, targetIdxFallback, nowSec, nowMs);
            }
            // Start buff on charge count change, and enforce a
            // 2-minute lockout so the timer can't be reset by a repeated trigger
            // within the same window (buff lasts 4 minutes, so this is safe).
            var chargeChangedFrom0to1 = ((state.lastRejuvChargeCount || 0) === 0 && chargeCount >= 1);
            if (chargeChangedFrom0to1) {
                var buffLockoutUntilSec = (state.lastBuffGameSec || 0) + BUFF_LOCKOUT_SEC;
                if (nowSec >= buffLockoutUntilSec) {
                    state.lastBuffGameSec = nowSec;
                    RejuvStartBuff(state, root, nowSec, true);
                }
            }
            state.lastScanFound = found;
            state.lastRejuvChargeCount = chargeCount;
            state.lastMidBossActive = midBossActive;
            state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state);
        }
        state.lastRuntimeSec = nowSec;
        state.lastRuntimeFeatureSig = state._cachedRuntimeFeatureSig;
    }

    // ── Registration ──

    QOL.register("rejuvTimers", {
        configKeys: ["ENABLE_REJUV_HUD", "ENABLE_BUFF_HUD", "ENABLE_MINIMAP_REJUV_TIMER", "ENABLE_MINIMAP_BUFF_TIMER"],
        bucket: 0,
        phase: 0,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_REJUV_HUD") || IsCfgEnabled(cfg, "ENABLE_BUFF_HUD") ||
                   IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER") || IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER");
        },
        update: function(root, cfg, nowMs) {
            try {
                UpdateRejuvBuffTimers(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["rejuvState", "rejuvWasDisabled", "minimapObjectiveBuffClassCache",
                    "minimapObjectiveBuffBridgeLeftClassCache", "minimapObjectiveBuffBridgeRightClassCache",
                    "minimapObjectiveRejuvClassCache", "minimapObjectiveScaleSig"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateRejuvBuffTimers !== "function") throw new Error("UpdateRejuvBuffTimers is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
