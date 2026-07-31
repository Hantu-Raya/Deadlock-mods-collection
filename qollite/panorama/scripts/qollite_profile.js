(function () {
    "use strict";

    var ACTIVE_INTERVAL_SEC = 0.35;
    var IDLE_INTERVAL_SEC = 1.0;
    var NO_PANEL_INTERVAL_SEC = 0.35;
    var DEEP_SCAN_COOLDOWN_MS = 1500;
    var gLastKnownAccountId = "";
    var DEBUG_LOGS = false;
    var gNextHeartbeatLogMs = 0;
    var gLastDeepScanMs = 0;
    var STATLOCKER_IMAGE_SRC = "s2r://panorama/images/statlocker/statlocker.vtex";

    function IsPanelValid(panel) {
        if (!panel) return false;
        if (!panel.IsValid) return true;
        return panel.IsValid();
    }

    function ParseAccountId(text) {
        if (text === undefined || text === null) return "";
        var digits = String(text).replace(/[^0-9]/g, "");
        if (!digits || digits.length < 5 || digits.length > 12) return "";
        return digits;
    }

    function DebugLog(msg) {
        if (!DEBUG_LOGS) return;
        try { $.Msg("[StatlockerProfile] " + String(msg || "")); } catch (e0) {}
    }

    function HasClassSafe(panel, className) {
        if (!IsPanelValid(panel) || !className || !panel.BHasClass) return false;
        try { return !!panel.BHasClass(className); } catch (e0) { return false; }
    }

    function HasAscendantClass(panel, className, maxDepth) {
        var depth = 0;
        var cur = panel;
        var limit = maxDepth || 16;
        while (IsPanelValid(cur) && depth < limit) {
            if (HasClassSafe(cur, className)) return true;
            cur = cur.GetParent ? cur.GetParent() : null;
            depth++;
        }
        return false;
    }

    function IsProfilePageActive(ctx) {
        if (!IsPanelValid(ctx)) return false;
        if (HasAscendantClass(ctx, "isShowingProfilePage", 24)) return true;
        var roots = [];
        roots.push(ctx);
        var p = ctx;
        for (var i = 0; i < 10 && IsPanelValid(p); i++) {
            p = p.GetParent ? p.GetParent() : null;
            if (IsPanelValid(p)) roots.push(p);
        }
        for (var r = 0; r < roots.length; r++) {
            var node = roots[r];
            if (HasClassSafe(node, "DashboardPage") && HasClassSafe(node, "active")) return true;
        }
        return false;
    }

    function ReadAccountIdFromPanel(panel) {
        if (!IsPanelValid(panel)) return "";
        var candidates = [];
        try { candidates.push(panel.accountid); } catch (e0) {}
        try { candidates.push(panel.account_id); } catch (e1) {}
        try { candidates.push(panel.accountID); } catch (e2) {}
        try {
            if (panel.GetAttributeString) {
                candidates.push(panel.GetAttributeString("accountid", ""));
                candidates.push(panel.GetAttributeString("account_id", ""));
                candidates.push(panel.GetAttributeString("accountID", ""));
            }
        } catch (e3) {}
        for (var i = 0; i < candidates.length; i++) {
            var parsed = ParseAccountId(candidates[i]);
            if (parsed) return parsed;
        }
        return "";
    }

    function FindCurrentAccountIdFromLabels(ctx) {
        if (!IsPanelValid(ctx) || !ctx.FindChildrenWithClassTraverse) return "";
        var labels = ctx.FindChildrenWithClassTraverse("AccountID") || [];
        for (var i = 0; i < labels.length; i++) {
            var lbl = labels[i];
            if (!IsPanelValid(lbl)) continue;
            var text = "";
            try { text = String(lbl.text || ""); } catch (e0) { text = ""; }
            var accountId = ParseAccountId(text);
            if (accountId) return accountId;
        }
        return "";
    }

    function ScanPanelTreeForAccountId(root) {
        if (!IsPanelValid(root)) return "";
        var stack = [root];
        var scanned = 0;
        var limit = 3000;
        while (stack.length > 0 && scanned < limit) {
            var panel = stack.pop();
            if (!IsPanelValid(panel)) continue;
            scanned++;
            var idFromPanel = ReadAccountIdFromPanel(panel);
            if (idFromPanel) return idFromPanel;
            try {
                var childCount = panel.GetChildCount ? panel.GetChildCount() : 0;
                for (var i = 0; i < childCount; i++) {
                    var child = panel.GetChild ? panel.GetChild(i) : null;
                    if (IsPanelValid(child)) stack.push(child);
                }
            } catch (e0) {}
        }
        return "";
    }

    function ReadLocalPlayerAccountIdFromApi() {
        try {
            if (typeof Game !== "undefined" && Game && typeof Game.GetLocalPlayerInfo === "function") {
                var localInfo = Game.GetLocalPlayerInfo();
                if (localInfo) {
                    var gFields = [localInfo.account_id, localInfo.accountid, localInfo.steamid32];
                    for (var gi = 0; gi < gFields.length; gi++) {
                        var gId = ParseAccountId(gFields[gi]);
                        if (gId) return gId;
                    }
                }
            }
        } catch (e0) {}
        try {
            if (typeof Players !== "undefined" && Players && typeof Players.GetLocalPlayer === "function") {
                var localPlayer = Players.GetLocalPlayer();
                if (localPlayer !== undefined && localPlayer !== null) {
                    if (typeof Players.GetPlayerData === "function") {
                        var pdata = Players.GetPlayerData(localPlayer);
                        if (pdata) {
                            var pFields = [pdata.account_id, pdata.accountid, pdata.steamid32];
                            for (var pi = 0; pi < pFields.length; pi++) {
                                var pId = ParseAccountId(pFields[pi]);
                                if (pId) return pId;
                            }
                        }
                    }
                    if (typeof Players.GetPlayerInfo === "function") {
                        var pinfo = Players.GetPlayerInfo(localPlayer);
                        if (pinfo) {
                            var iFields = [pinfo.account_id, pinfo.accountid, pinfo.steamid32];
                            for (var ii = 0; ii < iFields.length; ii++) {
                                var iId = ParseAccountId(iFields[ii]);
                                if (iId) return iId;
                            }
                        }
                    }
                }
            }
        } catch (e1) {}
        return "";
    }

    function FindCurrentAccountId(ctx, allowDeepScan) {
        var labelId = FindCurrentAccountIdFromLabels(ctx);
        if (labelId) return { id: labelId, source: "label:AccountID" };
        var panelId = ReadAccountIdFromPanel(ctx);
        if (panelId) return { id: panelId, source: "ctx_panel" };
        if (allowDeepScan) {
            var treeId = ScanPanelTreeForAccountId(ctx);
            if (treeId) return { id: treeId, source: "panel_tree" };
        }
        var apiId = ReadLocalPlayerAccountIdFromApi();
        if (apiId) return { id: apiId, source: "api_local_player" };
        return { id: "", source: "-" };
    }

    function EnsureStatButton(coreRatingPanel, accountId, index) {
        if (!IsPanelValid(coreRatingPanel)) return;
        var btnId = "StatlockerBtn_" + String(index);
        var button = coreRatingPanel.FindChildTraverse ? coreRatingPanel.FindChildTraverse(btnId) : null;
        if (!IsPanelValid(button) && coreRatingPanel.FindChildrenWithClassTraverse) {
            var existing = coreRatingPanel.FindChildrenWithClassTraverse("StatlockerButton") || [];
            if (existing.length > 0) button = existing[0];
        }
        if (!IsPanelValid(button) && $.CreatePanel) {
            try { button = $.CreatePanel("Button", coreRatingPanel, btnId); } catch (e0) { button = null; }
            if (IsPanelValid(button) && button.AddClass) button.AddClass("StatlockerButton");
        }
        if (!IsPanelValid(button)) return;

        var icon = button.FindChildTraverse ? button.FindChildTraverse("StatlockerImage") : null;
        if (!IsPanelValid(icon) && button.FindChildrenWithClassTraverse) {
            var icons = button.FindChildrenWithClassTraverse("StatlockerImage") || [];
            if (icons.length > 0) icon = icons[0];
        }
        if (!IsPanelValid(icon) && $.CreatePanel) {
            try { icon = $.CreatePanel("Image", button, "StatlockerImage"); } catch (e1) { icon = null; }
            if (IsPanelValid(icon) && icon.AddClass) icon.AddClass("StatlockerImage");
        }
        if (IsPanelValid(icon) && icon.SetImage) {
            try { icon.SetImage(STATLOCKER_IMAGE_SRC); } catch (eSet) {}
        }

        button.style.visibility = "visible";
        try { button.enabled = true; } catch (eBtn0) {}
        try { button.hittest = true; } catch (eBtn1) {}
        try { button.hittestchildren = true; } catch (eBtn2) {}
        if (accountId) gLastKnownAccountId = accountId;
        try {
            button.SetPanelEvent("onactivate", function () {
                var resolved = FindCurrentAccountId($.GetContextPanel(), true);
                var currentAccountId = (resolved && resolved.id) ? resolved.id : (gLastKnownAccountId || accountId);
                if (!currentAccountId) {
                    DebugLog("click: no account id resolved");
                    return;
                }
                var url = "https://statlocker.gg/profile/" + currentAccountId;
                DebugLog("click: resolved account=" + currentAccountId + " source=" + ((resolved && resolved.source) ? resolved.source : "cached") + " url=" + url);
                try { $.DispatchEvent("ExternalBrowserGoToURL", url); } catch (e3) { DebugLog("click: ExternalBrowserGoToURL failed"); }
                try { $.DispatchEvent("SteamOverlayOpenURL", url); } catch (e4) {}
            });
        } catch (e2) {}
    }

    function Update() {
        var ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        if (!IsPanelValid(ctx)) {
            $.Schedule(IDLE_INTERVAL_SEC, Update);
            return;
        }

        if (!IsProfilePageActive(ctx)) {
            $.Schedule(IDLE_INTERVAL_SEC, Update);
            return;
        }

        var corePanels = ctx.FindChildrenWithClassTraverse ? (ctx.FindChildrenWithClassTraverse("coreRating") || []) : [];
        if (!corePanels || corePanels.length <= 0) {
            $.Schedule(NO_PANEL_INTERVAL_SEC, Update);
            return;
        }

        var resolvedInfo = FindCurrentAccountId(ctx, false);
        var accountId = resolvedInfo.id || "";
        if (!accountId) {
            var nowForDeep = Date.now ? Date.now() : (new Date()).getTime();
            if ((nowForDeep - gLastDeepScanMs) >= DEEP_SCAN_COOLDOWN_MS) {
                gLastDeepScanMs = nowForDeep;
                resolvedInfo = FindCurrentAccountId(ctx, true);
                accountId = resolvedInfo.id || "";
            }
        }
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (nowMs >= gNextHeartbeatLogMs) {
            gNextHeartbeatLogMs = nowMs + 2000;
            DebugLog("heartbeat: corePanels=" + corePanels.length + " account=" + (accountId || "-") + " source=" + (resolvedInfo.source || "-"));
        }
        for (var i = 0; i < corePanels.length; i++) {
            var coreRating = corePanels[i];
            if (!IsPanelValid(coreRating)) continue;
            var hasHeroRowBg = !!(coreRating.FindChildTraverse && coreRating.FindChildTraverse("HeroRowBackground"));
            if (!hasHeroRowBg) continue;
            EnsureStatButton(coreRating, accountId, i);
        }

        $.Schedule(ACTIVE_INTERVAL_SEC, Update);
    }

    Update();
})();
