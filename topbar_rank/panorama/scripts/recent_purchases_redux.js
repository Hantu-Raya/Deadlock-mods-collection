(function () {
    "use strict";

    // ─── Config ───────────────────────────────────────────────────────────────────

    const DEBUG = false;
    const DEBUG_QUICK = false;

    const MAIN_POLL_INTERVAL = 0.1;
    const HIDEOUT_POLL_INTERVAL = 1.0;

    const QUICK_MAX_ENTRIES = 3;
    const QUICK_DISPLAY_DURATION = 10.0;
    const QUICK_FADE_DURATION = 0.3;
    const QUICK_OVERLAP_GAP = 0;
    const QUICK_ROW_UI_SCALE = 0.75; // must match ui-scale on .quickPurchase in CSS
    const SEEN_KEYS_PRUNE_INTERVAL = 100;

    const CONTAINER_MAX_ITEMS = 50;

    // ─── Filter definitions ───────────────────────────────────────────────────────

    const FILTERS = [
        {
            id: "Tier1Toggle", label: "T1", group: "tier", active: true, invert: true,
            ShouldHideItem: function (p) { return p.BHasClass("isTier1Purchase"); }
        },
        {
            id: "Tier2Toggle", label: "T2", group: "tier", active: true, invert: true,
            ShouldHideItem: function (p) { return p.BHasClass("isTier2Purchase"); }
        },
        {
            id: "Tier3Toggle", label: "T3", group: "tier", active: true, invert: true,
            ShouldHideItem: function (p) { return p.BHasClass("isTier3Purchase"); }
        },
        {
            id: "Tier4Toggle", label: "T4", group: "tier", active: true, invert: true,
            ShouldHideItem: function (p) { return p.BHasClass("isTier4Purchase"); }
        },
        {
            id: "Team1OnlyToggle", label: "Hidden King", group: "team", active: true, invert: true,
            ShouldShowToggle: function (ctx) { return ctx.isSpectator; },
            ShouldHideItem: function (p) { return p.BHasClass("isTeam1Purchase"); }
        },
        {
            id: "Team2OnlyToggle", label: "Archmother", group: "team", active: true, invert: true,
            ShouldShowToggle: function (ctx) { return ctx.isSpectator; },
            ShouldHideItem: function (p) { return p.BHasClass("isTeam2Purchase"); }
        },
        {
            id: "MyTeamToggle", label: "My Team", group: "team", active: true, invert: true,
            ShouldShowToggle: function (ctx) { return !ctx.isSpectator; },
            ShouldHideItem: function (p, ctx) {
                if (ctx.localTeam === 1) return p.BHasClass("isTeam1Purchase");
                if (ctx.localTeam === 2) return p.BHasClass("isTeam2Purchase");
                return false;
            }
        },
        {
            id: "EnemyTeamToggle", label: "Enemy Team", group: "team", active: true, invert: true,
            ShouldShowToggle: function (ctx) { return !ctx.isSpectator; },
            ShouldHideItem: function (p, ctx) {
                if (ctx.localTeam === 1) return p.BHasClass("isTeam2Purchase");
                if (ctx.localTeam === 2) return p.BHasClass("isTeam1Purchase");
                return false;
            }
        }
    ];

    const QUICK_CLASSES_TO_COPY = [
        "isTier1Purchase", "isTier2Purchase", "isTier3Purchase", "isTier4Purchase",
        "isWeaponPurchase", "isArmorPurchase", "isTechPurchase",
        "isTeam1Purchase", "isTeam2Purchase"
    ];

    // ─── Shared state ─────────────────────────────────────────────────────────────

    var cachedRoot = null;
    var cachedContainer = null;

    // Filter state
    var filtersCreated = false;
    var lastFilterSig = null;
    var lastFirstPurchase = null;
    var lastVisibilitySig = null;

    // Hideout state
    var wasInHideout = null;

    // Quick purchases state
    var quickSeenKeys = {};
    var quickInitialized = false;
    var heroNameMap = {};           // UPPERCASE hero name → CitadelHudTopBarPlayer panel
    // heroMapState enum
    var HERO_MAP_IDLE = 0;
    var HERO_MAP_BUILDING = 1;
    var HERO_MAP_BUILT = 2;
    var heroMapState = HERO_MAP_IDLE;
    var quickPanelsByHero = {};     // UPPERCASE hero name → QuickPurchasesPanel
    var quickActiveEntriesByHero = {}; // UPPERCASE hero name → []
    var quickLastEntryTime = {};    // UPPERCASE hero name → timestamp of most recent AddQuickEntry


    // ─── Shared utilities ─────────────────────────────────────────────────────────

    function GetAbsoluteRoot() {
        if (cachedRoot && cachedRoot.IsValid()) return cachedRoot;
        var root = $.GetContextPanel();
        while (root.GetParent() !== null) root = root.GetParent();
        cachedRoot = root;
        return root;
    }

    function GetContainer(globalRoot) {
        if (cachedContainer && cachedContainer.IsValid()) return cachedContainer;
        cachedContainer = globalRoot.FindChildTraverse("RecentPurchasesContainer");
        return cachedContainer;
    }

    function HasAncestorClass(panel, className) {
        var p = panel;
        while (p) {
            if (p.BHasClass(className)) return true;
            p = p.GetParent();
        }
        return false;
    }

    function GetPurchaseName(panel) {
        if (!panel || !panel.IsValid()) return "";
        var labels = panel.FindChildrenWithClassTraverse("recentModPurchaseName");
        return (labels && labels.length > 0 && labels[0].IsValid()) ? labels[0].text.trim() : "";
    }

    function GetPurchaseTime(panel) {
        if (!panel || !panel.IsValid()) return "";
        var labels = panel.FindChildrenWithClassTraverse("recentTimePurchased");
        return (labels && labels.length > 0 && labels[0].IsValid()) ? labels[0].text.trim() : "";
    }

    function GetPurchaseHeroName(panel) {
        if (!panel || !panel.IsValid()) return "";
        var labels = panel.FindChildrenWithClassTraverse("recentModPurchaserHero");
        return (labels && labels.length > 0 && labels[0].IsValid()) ? labels[0].text.trim() : "";
    }

    // ─── Mod icon setting ─────────────────────────────────────────────────────────

    function UpdateModIcons(container, purchases) {
        if (!container || !container.IsValid()) return;
        if (!purchases) purchases = container.FindChildrenWithClassTraverse("recentPurchase");
        for (var i = 0; i < purchases.length; i++) {
            var purchase = purchases[i];
            if (!purchase || !purchase.IsValid()) continue;
            var icons = purchase.FindChildrenWithClassTraverse("mod_icon");
            if (!icons || icons.length === 0) continue;
            var icon = icons[0];
            if (!icon.IsValid() || icon.BHasClass("iconSet")) continue;
            var itemName = GetPurchaseName(purchase);
            if (!itemName) continue;
            var image = MOD_ICONS[itemName];
            if (!image) continue;
            icon.style.backgroundImage = image;
            icon.style.washColor = "none";
            icon.AddClass("iconSet");
        }
    }

    // ─── Purchase filters ─────────────────────────────────────────────────────────

    function BuildContext(container) {
        var ctx = { isSpectator: false, localTeam: 0 };
        ctx.isSpectator = HasAncestorClass($.GetContextPanel(), "TeamSpectator");
        if (!ctx.isSpectator && container && container.IsValid()) {
            if (HasAncestorClass(container, "localPlayerTeam1")) ctx.localTeam = 1;
            else if (HasAncestorClass(container, "localPlayerTeam2")) ctx.localTeam = 2;
        }
        return ctx;
    }

    function GetFilterSignature(ctx, container) {
        var sig = (ctx.isSpectator ? "1" : "0") + ctx.localTeam + container.GetChildCount();
        for (var i = 0; i < FILTERS.length; i++) sig += FILTERS[i].active ? "1" : "0";
        return sig;
    }

    function CreateFilterCheckboxes(globalRoot) {
        if (filtersCreated) return;
        var panel = globalRoot.FindChildTraverse("RecentPurchasesPanel");
        if (!panel) return;

        var collapseToggle = $.CreatePanel("ToggleButton", panel, "FiltersCollapseToggle");
        collapseToggle.AddClass("PurchaseFilterToggle");
        collapseToggle.checked = true;
        var collapseLabel = $.CreatePanel("Label", collapseToggle, "");
        collapseLabel.text = "Show Filters";

        var filtersPanel = $.CreatePanel("Panel", panel, "PurchaseFiltersContainer");
        var filtersVisible = true;
        $.RegisterEventHandler("Activated", collapseToggle, function () {
            filtersVisible = !filtersVisible;
            if (filtersVisible) filtersPanel.RemoveClass("filterButtonHidden");
            else filtersPanel.AddClass("filterButtonHidden");
        });

        var groupPanels = {};
        for (var i = 0; i < FILTERS.length; i++) {
            var filter = FILTERS[i];
            var parent = filtersPanel;
            if (filter.group) {
                if (!groupPanels[filter.group]) {
                    groupPanels[filter.group] = $.CreatePanel("Panel", filtersPanel, "FilterGroup_" + filter.group);
                    groupPanels[filter.group].AddClass("PurchaseFilterGroup");
                }
                parent = groupPanels[filter.group];
            }
            var toggle = $.CreatePanel("ToggleButton", parent, filter.id);
            toggle.AddClass("PurchaseFilterToggle");
            toggle.checked = filter.active;
            var label = $.CreatePanel("Label", toggle, "");
            label.text = filter.label;
            (function (f) {
                $.RegisterEventHandler("Activated", toggle, function () {
                    f.active = !f.active;
                    if (DEBUG) $.Msg("[Filters] " + f.id + " active=" + f.active);
                });
            })(filter);
        }

        var existingLabel = panel.FindChild("RecentPurchases");
        var container = panel.FindChild("RecentPurchasesContainer");
        if (existingLabel) existingLabel.SetParent(panel);
        if (container) container.SetParent(panel);

        filtersCreated = true;
    }

    function UpdateFilterVisibility(globalRoot, ctx) {
        var visSig = (ctx.isSpectator ? "1" : "0") + ctx.localTeam;
        if (visSig === lastVisibilitySig) return;
        lastVisibilitySig = visSig;
        for (var i = 0; i < FILTERS.length; i++) {
            var filter = FILTERS[i];
            if (!filter.ShouldShowToggle) continue;
            var toggle = globalRoot.FindChildTraverse(filter.id);
            if (!toggle) continue;
            if (filter.ShouldShowToggle(ctx)) toggle.RemoveClass("filterButtonHidden");
            else toggle.AddClass("filterButtonHidden");
        }
    }

    function ApplyFilters(container, ctx, purchases) {
        if (!container || !container.IsValid()) return;
        var sig = GetFilterSignature(ctx, container);
        var firstChild = container.GetChildCount() > 0 ? container.GetChild(0) : null;
        if (sig === lastFilterSig && firstChild === lastFirstPurchase) return;
        lastFilterSig = sig;
        lastFirstPurchase = firstChild;
        if (DEBUG) $.Msg("[Filters] Signature changed: " + sig);

        if (!purchases) purchases = container.FindChildrenWithClassTraverse("recentPurchase");
        for (var i = 0; i < purchases.length; i++) {
            var purchase = purchases[i];
            if (!purchase || !purchase.IsValid()) continue;
            var hidden = false;
            for (var j = 0; j < FILTERS.length; j++) {
                var filter = FILTERS[j];
                if (filter.ShouldShowToggle && !filter.ShouldShowToggle(ctx)) continue;
                var shouldApply = filter.invert ? !filter.active : filter.active;
                if (shouldApply && filter.ShouldHideItem(purchase, ctx)) { hidden = true; break; }
            }
            if (hidden) purchase.AddClass("filterHidden");
            else purchase.RemoveClass("filterHidden");
        }
    }

    // ─── Container cap ───────────────────────────────────────────────────────────

    function CapContainer(container) {
        if (!container || !container.IsValid()) return;
        var count = container.GetChildCount();
        while (count > CONTAINER_MAX_ITEMS) {
            container.GetChild(count - 1).DeleteAsync(0);
            count--;
        }
    }

    var _seenKeysPruneCounter = 0;
    function PruneSeenKeys(container, purchases) {
        _seenKeysPruneCounter++;
        if (_seenKeysPruneCounter < SEEN_KEYS_PRUNE_INTERVAL) return;
        _seenKeysPruneCounter = 0;
        if (!container || !container.IsValid()) return;
        if (!purchases) purchases = container.FindChildrenWithClassTraverse("recentPurchase");
        var valid = {};
        for (var i = 0; i < purchases.length; i++) {
            var n = GetPurchaseName(purchases[i]);
            var t = GetPurchaseTime(purchases[i]);
            if (n && t) valid[n + "|" + t] = true;
        }
        quickSeenKeys = valid;
    }

    // ─── Hideout reset ────────────────────────────────────────────────────────────

    function IsConnectedToHideout(globalRoot) {
        try {
            if (typeof Game !== "undefined" && Game.GetMapInfo) {
                var mapName = Game.GetMapInfo().map_display_name;
                if (["hero_testing_hideout", "hideout", "dl_hideout"].indexOf(mapName) !== -1) return true;
            }
        } catch (e) { }
        var hud = globalRoot.FindChildTraverse("Hud");
        if (hud && (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout"))) return true;
        return globalRoot.BHasClass("connectedToHideout") || globalRoot.BHasClass("InHideout");
    }

    function ClearContainer(globalRoot) {
        var container = GetContainer(globalRoot);
        if (container && container.IsValid()) {
            var count = container.GetChildCount();
            if (count > 0) {
                for (var i = 0; i < count; i++) container.GetChild(i).DeleteAsync(0);
                if (DEBUG) $.Msg("[HideoutMonitor] Deleted " + count + " children.");
            }
        }
        // Reset quick purchases so it doesn't re-show stale entries after container is cleared
        quickSeenKeys = {};
        quickInitialized = false;
        ResetHeroMap();
    }

    // ─── Quick purchases overlay ──────────────────────────────────────────────────

    function ResetHeroMap() {
        for (var hero in quickPanelsByHero) {
            var panel = quickPanelsByHero[hero];
            if (panel && panel.IsValid()) panel.DeleteAsync(0);
        }
        heroNameMap = {};
        heroMapState = HERO_MAP_IDLE;
        quickPanelsByHero = {};
        quickActiveEntriesByHero = {};
        quickLastEntryTime = {};
        if (DEBUG_QUICK) $.Msg("[QuickPurchases] Hero map reset — will rebuild next poll.");
    }

    function IsHeroMapStale() {
        if (heroMapState !== HERO_MAP_BUILT) return false;
        for (var hero in heroNameMap) {
            var pp = heroNameMap[hero];
            if (!pp || !pp.IsValid()) {
                if (DEBUG_QUICK) $.Msg("[QuickPurchases] Stale map detected: panel for '" + hero + "' is invalid.");
                return true;
            }
        }
        return false;
    }

    function BuildHeroNameMap() {
        if (heroMapState === HERO_MAP_BUILDING) return;
        heroMapState = HERO_MAP_BUILDING;
        var globalRoot = GetAbsoluteRoot();
        var labels = globalRoot.FindChildrenWithClassTraverse("HeroNameHidden");
        if (!labels || labels.length === 0) {
            if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: no .HeroNameHidden labels found.");
            heroMapState = HERO_MAP_IDLE;
            return;
        }
        if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: found " + labels.length + " label(s), resolving...");
        var pending = labels.length;
        function onDone() {
            pending--;
            if (pending === 0) {
                heroMapState = HERO_MAP_BUILT;
                if (DEBUG_QUICK) {
                    var keys = [];
                    for (var k in heroNameMap) keys.push(k);
                    $.Msg("[QuickPurchases] BuildHeroNameMap: done. Heroes mapped: [" + keys.join(", ") + "]");
                }
            }
        }
        for (var i = 0; i < labels.length; i++) {
            (function (label) {
                var playerPanel = label.GetParent();
                var badge = null;
                while (playerPanel && playerPanel.IsValid()) {
                    badge = playerPanel.FindChildTraverse("HeroBadge");
                    if (badge) break;
                    playerPanel = playerPanel.GetParent();
                }
                if (!badge || !playerPanel) {
                    if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: label has no HeroBadge ancestor, skipping.");
                    onDone(); return;
                }
                var heroId = badge.heroid;
                if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: badge found, heroid=" + heroId + " (type=" + typeof heroId + ")");
                if (typeof heroId !== "number" || heroId <= 0) {
                    if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: invalid heroid, skipping.");
                    onDone(); return;
                }
                playerPanel.SetDialogVariableInt("hero_id", heroId);
                (function (pp, hid) {
                    $.Schedule(0.3, function () {
                        if (heroMapState !== HERO_MAP_BUILDING) return;
                        if (label.IsValid()) {
                            var name = label.text.trim().toUpperCase();
                            if (name) {
                                heroNameMap[name] = pp;
                                if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: mapped '" + name + "' (heroid=" + hid + ")");
                            } else {
                                if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: heroid=" + hid + " resolved to empty string — binding may not be set up.");
                            }
                        } else {
                            if (DEBUG_QUICK) $.Msg("[QuickPurchases] BuildHeroNameMap: label became invalid during resolve (heroid=" + hid + ").");
                        }
                        onDone();
                    });
                })(playerPanel, heroId);
            })(labels[i]);
        }
    }

    function GetOrCreateQuickPanelForHero(heroNameUpper) {
        if (quickPanelsByHero[heroNameUpper] && quickPanelsByHero[heroNameUpper].IsValid()) {
            return quickPanelsByHero[heroNameUpper];
        }
        var playerPanel = heroNameMap[heroNameUpper];
        if (!playerPanel || !playerPanel.IsValid()) {
            if (DEBUG_QUICK) {
                var _keys = [];
                for (var _k in heroNameMap) _keys.push(_k);
                $.Msg("[QuickPurchases] GetOrCreateQuickPanelForHero: no valid player panel for '" + heroNameUpper + "'. Map keys: [" + _keys.join(", ") + "]. Triggering rebuild.");
            }
            if (heroMapState !== HERO_MAP_BUILDING) {
                heroMapState = HERO_MAP_IDLE;
            }
            return null;
        }
        var panel = $.CreatePanel("Panel", playerPanel, "");
        panel.AddClass("QuickPurchasesPanel");
        quickPanelsByHero[heroNameUpper] = panel;
        if (DEBUG_QUICK) $.Msg("[QuickPurchases] Created QuickPurchasesPanel for '" + heroNameUpper + "'.");
        return panel;
    }

    function GetPanelLeftInTopBar(panel) {
        var topBar = GetAbsoluteRoot().FindChildTraverse("TopBar");
        var x = 0;
        var current = panel;
        while (current && current.IsValid() && current !== topBar) {
            x += current.actualxoffset;
            current = current.GetParent();
        }
        return x;
    }

    var _overlapResolvePending = false;
    function ScheduleResolveOverlaps(delay) {
        if (_overlapResolvePending) return;
        _overlapResolvePending = true;
        $.Schedule(delay || 0, function () {
            try {
                ResolveOverlaps();
            } finally {
                _overlapResolvePending = false;
            }
        });
    }

    function ResolveOverlaps() {
        // Collect panels that currently have visible entries
        var active = [];
        for (var hero in quickPanelsByHero) {
            var p = quickPanelsByHero[hero];
            if (!p || !p.IsValid()) continue;
            var entries = quickActiveEntriesByHero[hero];
            if (!entries || entries.length === 0) continue;
            active.push({ hero: hero, panel: p });
        }

        // Reset all to their base margin before re-computing.
        // The hero portrait area sits at a consistent offset from the top
        // regardless of aspect ratio or showNewTopbar mode.
        // Ultimate-status heroes get extra room for the ult icon.
        for (var i = 0; i < active.length; i++) {
            var margin = 125;
            var pp = active[i].panel.GetParent();
            if (pp && pp.IsValid()) {
                // UltimateUnlocked is on the player card ancestor, not the icon itself
                if (pp.BHasClass("UltimateUnlocked")) margin = 152;
            }
            active[i].panel.style.marginTop = margin + "px";
            active[i].baseMargin = margin;
        }

        if (active.length < 2) return;

        // Compute each panel's left edge in TopBar coordinate space
        for (var i = 0; i < active.length; i++) {
            active[i].leftX = GetPanelLeftInTopBar(active[i].panel);
            active[i].width = active[i].panel.actuallayoutwidth;
        }

        // Sort newest first — newest panels stay at base margin (top), older panels get pushed down
        // Manual bubble sort for Panorama ES5 compat (n ≤ 12, so O(n²) is fine)
        for (var _si = 0; _si < active.length - 1; _si++) {
            for (var _sj = _si + 1; _sj < active.length; _sj++) {
                var _ti = quickLastEntryTime[active[_si].hero] || 0;
                var _tj = quickLastEntryTime[active[_sj].hero] || 0;
                if (_tj > _ti) { var _tmp = active[_si]; active[_si] = active[_sj]; active[_sj] = _tmp; }
            }
        }

        // Process left to right — shift each panel down to clear all overlapping panels to its left
        var margins = [];
        for (var i = 0; i < active.length; i++) margins[i] = active[i].baseMargin;

        for (var i = 1; i < active.length; i++) {
            var aLeft = active[i].leftX;
            var aRight = aLeft + active[i].width;
            if (active[i].width <= 0) continue;

            for (var j = 0; j < i; j++) {
                if (active[j].width <= 0) continue;
                var bLeft = active[j].leftX;
                var bRight = bLeft + active[j].width;

                if (aLeft < bRight && aRight > bLeft) {
                    var needed = margins[j] + active[j].panel.contentheight * QUICK_ROW_UI_SCALE + QUICK_OVERLAP_GAP;
                    if (needed > margins[i]) margins[i] = needed;
                }
            }
        }

        for (var i = 0; i < active.length; i++) {
            active[i].panel.style.marginTop = margins[i] + "px";
        }
    }

    function QuickRemoveEntry(entry, heroNameUpper) {
        var arr = quickActiveEntriesByHero[heroNameUpper];
        if (arr) {
            var _filtered = [];
            for (var _fi = 0; _fi < arr.length; _fi++) { if (arr[_fi] !== entry) _filtered.push(arr[_fi]); }
            quickActiveEntriesByHero[heroNameUpper] = _filtered;
        }
        if (!entry.IsValid()) return;
        entry.AddClass("quickFading");
        $.Schedule(QUICK_FADE_DURATION, function () {
            if (entry.IsValid()) entry.DeleteAsync(0);
            ScheduleResolveOverlaps(0);
        });
    }

    function QuickEvictEntry(entry, heroNameUpper) {
        var arr = quickActiveEntriesByHero[heroNameUpper];
        if (arr) {
            var _filtered = [];
            for (var _fi = 0; _fi < arr.length; _fi++) { if (arr[_fi] !== entry) _filtered.push(arr[_fi]); }
            quickActiveEntriesByHero[heroNameUpper] = _filtered;
        }
        if (entry.IsValid()) entry.DeleteAsync(0);
        ScheduleResolveOverlaps(0);
    }

    function AddQuickEntry(sourcePurchase, nameText) {
        var heroNameUpper = GetPurchaseHeroName(sourcePurchase).toUpperCase();
        if (DEBUG_QUICK) $.Msg("[QuickPurchases] AddQuickEntry: item='" + nameText + "' hero='" + heroNameUpper + "'");
        var quickPanel = GetOrCreateQuickPanelForHero(heroNameUpper);
        if (!quickPanel) {
            if (DEBUG_QUICK) $.Msg("[QuickPurchases] AddQuickEntry: no panel for '" + heroNameUpper + "', dropping entry.");
            return;
        }

        if (!quickActiveEntriesByHero[heroNameUpper]) quickActiveEntriesByHero[heroNameUpper] = [];
        quickLastEntryTime[heroNameUpper] = $.FrameTime();

        if (quickActiveEntriesByHero[heroNameUpper].length >= QUICK_MAX_ENTRIES) {
            QuickEvictEntry(quickActiveEntriesByHero[heroNameUpper][0], heroNameUpper);
        }

        var entry = $.CreatePanel("Panel", quickPanel, "");
        entry.AddClass("quickPurchase");

        for (var i = 0; i < QUICK_CLASSES_TO_COPY.length; i++) {
            if (sourcePurchase.BHasClass(QUICK_CLASSES_TO_COPY[i])) {
                entry.AddClass(QUICK_CLASSES_TO_COPY[i]);
            }
        }

        // Item info panel — item icon + item name
        var itemInfo = $.CreatePanel("Panel", entry, "");
        itemInfo.AddClass("quickItemInfo");

        var iconUrl = MOD_ICONS[nameText];
        if (iconUrl) {
            var icon = $.CreatePanel("Panel", itemInfo, "");
            icon.AddClass("mod_icon");
            (function (p, url) { $.Schedule(0, function () { if (p.IsValid()) { p.style.backgroundImage = url; p.style.backgroundSize = "100% 100%"; } }); })(icon, iconUrl);
        }

        var nameLabel = $.CreatePanel("Label", itemInfo, "");
        nameLabel.AddClass("quickPurchaseName");
        nameLabel.text = nameText;

        quickActiveEntriesByHero[heroNameUpper].push(entry);

        // Delay slightly so the panel has a layout pass before we read its dimensions
        ScheduleResolveOverlaps(0.05);

        (function (e, h) {
            $.Schedule(QUICK_DISPLAY_DURATION, function () {
                if (e.IsValid()) QuickRemoveEntry(e, h);
            });
        })(entry, heroNameUpper);
    }

    function UpdateQuickPurchases(container, purchases) {
        if (heroMapState !== HERO_MAP_BUILT) {
            if (DEBUG_QUICK && heroMapState !== HERO_MAP_BUILDING) $.Msg("[QuickPurchases] UpdateQuickPurchases: waiting for hero map...");
            return;
        }
        if (!container || !container.IsValid()) return;

        if (!purchases) purchases = container.FindChildrenWithClassTraverse("recentPurchase");

        // On first run, mark all existing entries as already seen so we only
        // show purchases that happen after the mod loads.
        if (!quickInitialized) {
            for (var i = 0; i < purchases.length; i++) {
                var p = purchases[i];
                if (!p || !p.IsValid()) continue;
                var n = GetPurchaseName(p);
                var t = GetPurchaseTime(p);
                if (n && t) quickSeenKeys[n + "|" + t] = true;
            }
            quickInitialized = true;
            return;
        }

        for (var i = 0; i < purchases.length; i++) {
            var purchase = purchases[i];
            if (!purchase || !purchase.IsValid()) continue;
            var name = GetPurchaseName(purchase);
            var time = GetPurchaseTime(purchase);
            if (!name || !time) continue;

            var key = name + "|" + time;
            if (!quickSeenKeys[key]) {
                quickSeenKeys[key] = true;
                if (!purchase.BHasClass("filterHidden")) {
                    AddQuickEntry(purchase, name);
                }
            }
        }
    }

    // ─── Poll loops ───────────────────────────────────────────────────────────────

    function MainPoll() {
        try {
            var globalRoot = GetAbsoluteRoot();
            var container = GetContainer(globalRoot);
            // Fetch purchases once per tick to avoid redundant tree walks
            var purchases = container && container.IsValid() ? container.FindChildrenWithClassTraverse("recentPurchase") : [];
            UpdateModIcons(container, purchases);
            var ctx = BuildContext(container);
            CreateFilterCheckboxes(globalRoot);
            UpdateFilterVisibility(globalRoot, ctx);
            CapContainer(container);
            ApplyFilters(container, ctx, purchases);
            if (IsHeroMapStale()) ResetHeroMap();
            if (heroMapState !== HERO_MAP_BUILT) BuildHeroNameMap();
            UpdateQuickPurchases(container, purchases);
            PruneSeenKeys(container, purchases);
        } catch (e) {
            if (DEBUG) $.Msg("[MainPoll] ERROR: " + e);
        }
        $.Schedule(MAIN_POLL_INTERVAL, MainPoll);
    }

    function HideoutPoll() {
        try {
            var globalRoot = GetAbsoluteRoot();
            var isInHideout = IsConnectedToHideout(globalRoot);
            if (wasInHideout === null || isInHideout !== wasInHideout) {
                ClearContainer(globalRoot);
                $.Schedule(0.5, function () { ClearContainer(globalRoot); });
            }
            wasInHideout = isInHideout;
        } catch (e) {
            if (DEBUG) $.Msg("[HideoutPoll] ERROR: " + e);
        }
        $.Schedule(HIDEOUT_POLL_INTERVAL, HideoutPoll);
    }


    MainPoll();
    HideoutPoll();
})();
