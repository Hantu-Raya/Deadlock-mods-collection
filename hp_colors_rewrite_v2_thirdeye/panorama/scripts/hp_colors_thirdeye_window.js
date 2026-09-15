/* Generated from pinned Third Eye window.js
 * SHA-256 ea12fd40c956e0b432d7646c50ed83c486335d67312adcea7664ccbfab19b4cc.
 * HPv2 compatibility lifecycle patch. */
// Settings window manager. Window shell is declared in hud_escape_menu.xml
// as a static child of CitadelHudEscapeMenu (no JS reparenting --- P0.3).
// Depends on: namespace.js, registry.js, renderer.js

(function()
{
    "use strict";

    var thirdEye = globalThis.ThirdEye;
    if (!thirdEye || !thirdEye.core || !thirdEye.ui || !thirdEye.ui.renderer) {
        $.Msg("[third-eye] window: dependencies missing --- aborting");
        return;
    }

    var registry = thirdEye.core.registry;
    var renderer = thirdEye.ui.renderer;

    // -- State --
    var _window = null;
    var _tabList = null;
    var _content = null;
    var _activeTab = "";
    var _tabButtons = [];
    var _searchInjected = false;

    // -- Hud attribute helpers --

    function _readAttribute()
    {
        var hud = thirdEye.core.hud.findHud();
        if (!hud) { return null; }
        var raw;
        try {
            raw = hud.GetAttributeString("thirdeye_config", "");
        } catch (e) {
            return null;
        }
        if (!raw) { return null; }
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    // -- Find the XML-declared shell --

    function _findShell()
    {
        var root = thirdEye.core.panel.findRoot();
        if (!root) { return null; }

        var shell = root.FindChildTraverse("ThirdEyeWindow");
        if (!shell || !thirdEye.core.panel.isAlive(shell)) { return null; }

        shell.hittest = true;
        shell.canfocus = true;
        // Consume clicks so they don't fall through to EscapeBackground
        shell.SetPanelEvent("onactivate", function()
        {});

        _window = shell;
        _tabList = shell.FindChildTraverse("ThirdEyeWindowTabs");
        _content = shell.FindChildTraverse("ThirdEyeWindowContent");

        return true;
    }

    // -- Tab rendering --

    function _rebuildTabs()
    {
        if (!_tabList || !thirdEye.core.panel.isAlive(_tabList)) { return; }

        try {
            _tabList.RemoveAndDeleteChildren();
        } catch (e) {}

        _tabButtons = [];
        var layout = thirdEye.ui.layout;
        if (!layout || !layout.length) { return; }

        for (var tabIndex = 0; tabIndex < layout.length; tabIndex++) {
            var tabCfg = layout[tabIndex];

            // Headings and spacers are rail decoration. Neither may be pushed
            // into _tabButtons: setOpen falls back to _tabButtons[0].id when
            // the stored active tab is gone, and a decoration at index 0 has
            // no matching layout id, so the window would open to a blank pane.
            if (tabCfg.heading) {
                var heading = thirdEye.core.panel.create("Label", _tabList, "");
                if (heading) {
                    heading.SetHasClass("TETabHeading", true);
                    heading.text = tabCfg.heading;
                }
                continue;
            }
            if (tabCfg.spacer) {
                var spacer = thirdEye.core.panel.create("Panel", _tabList, "");
                if (spacer) { spacer.SetHasClass("TETabSpacer", true); }
                continue;
            }

            var tab = null;
            try {
                tab = $.CreatePanel("Button", _tabList, "");
            } catch (e) {
                continue;
            }
            if (!tab) { continue; }
            tab.SetHasClass("TETab", true);
            var tabLabel = null;
            try {
                tabLabel = $.CreatePanel("Label", tab, "");
            } catch (e) {}
            if (tabLabel) { tabLabel.text = tabCfg.name || tabCfg.id; }
            tab.SetPanelEvent(
                "onactivate",
                function(id)
                {
                    return function()
                    {
                        if (thirdEye.ui.search && thirdEye.ui.search.isSearching()) {
                            thirdEye.ui.search.clear();
                        }
                        _activeTab = id;
                        _highlightActiveTab();
                        _renderSection(id);
                    };
                }(tabCfg.id)
            );
            _tabButtons.push({ id: tabCfg.id, panel: tab });
        }

        // Always add Backup tab at the end. It renders under the "System"
        // heading only because that heading is last in layout.js --- appending
        // here keeps Backup out of the data, but couples it to that ordering.
        var utab = null;
        try {
            utab = $.CreatePanel("Button", _tabList, "");
        } catch (e) {}
        if (utab) {
            utab.SetHasClass("TETab", true);
            var ulabel = null;
            try {
                ulabel = $.CreatePanel("Label", utab, "");
            } catch (e) {}
            if (ulabel) { ulabel.text = "Backup"; }
            utab.SetPanelEvent("onactivate", function()
            {
                if (thirdEye.ui.search && thirdEye.ui.search.isSearching()) {
                    thirdEye.ui.search.clear();
                }
                _activeTab = "__backup__";
                _highlightActiveTab();
                _renderBackupTab();
            });
            _tabButtons.push({ id: "__backup__", panel: utab });
        }

        // Footer, not a tab --- kept out of _tabButtons for the same reason as
        // the headings above.
        var version = thirdEye.core.panel.create("Label", _tabList, "");
        if (version) {
            version.SetHasClass("TESidebarVersion", true);
            version.text = "Third Eye " + thirdEye.VERSION;
        }

        _highlightActiveTab();
    }

    function _highlightActiveTab()
    {
        for (var i = 0; i < _tabButtons.length; i++) {
            var t = _tabButtons[i];
            if (thirdEye.core.panel.isAlive(t.panel)) {
                t.panel.SetHasClass("Active", t.id === _activeTab);
            }
        }
    }

    // -- Subsection save/restore --

    var _subsectionSaved = {};

    function _subSaveAndDisable(name, childIds)
    {
        var states = {};
        for (var i = 0; i < childIds.length; i++) {
            var childId = childIds[i];
            states[childId] = registry.get(childId, "enabled");
            registry.set(childId, "enabled", false);
        }
        _subsectionSaved[name] = states;
    }

    function _subRestore(name, childIds)
    {
        var states = _subsectionSaved[name] || {};
        for (var i = 0; i < childIds.length; i++) {
            var childId = childIds[i];
            var saved = states.hasOwnProperty(childId) ? states[childId] : true;
            registry.set(childId, "enabled", saved);
        }
        delete _subsectionSaved[name];
    }

    // -- Content rendering --

    function _resolveFeatures(layoutFeatures)
    {
        var result = [];
        for (var i = 0; i < layoutFeatures.length; i++) {
            var entry = layoutFeatures[i];
            var featureId = (typeof entry === "string") ? entry : entry.id;
            var manifest = registry.getManifest(featureId);
            if (!manifest) { continue; }
            var feat = {
                id: manifest.id,
                name: manifest.name,
                settings: manifest.settings,
            };
            if (typeof entry !== "string" && entry.hideToggle === true) {
                feat.hideToggle = true;
            }
            result.push(feat);
        }
        return result;
    }

    function _renderSection(tabId)
    {
        if (!_content || !thirdEye.core.panel.isAlive(_content)) { return; }
        try {
            _content.RemoveAndDeleteChildren();
        } catch (e) {}

        var layout = thirdEye.ui.layout;
        if (!layout) { return; }

        var tabCfg = null;
        for (var tabIndex = 0; tabIndex < layout.length; tabIndex++) {
            if (layout[tabIndex].id === tabId) {
                tabCfg = layout[tabIndex];
                break;
            }
        }
        if (!tabCfg) { return; }

        var subsections = tabCfg.subsections;
        if (!subsections || subsections.length === 0) {
            var empty = null;
            try {
                empty = $.CreatePanel("Label", _content, "");
            } catch (e) {}
            if (empty) {
                empty.SetHasClass("TEEmpty", true);
                empty.text = "No features in this section.";
            }
            return;
        }

        for (var i = 0; i < subsections.length; i++) {
            var subsection = subsections[i];
            var features = _resolveFeatures(subsection.features);

            if (!subsection.name) {
                // Standalone features --- no subsection header
                _renderFeatureList(_content, features);
            } else {
                // Subsection with parent toggle
                var childIds = [];
                for (var ci = 0; ci < features.length; ci++) {
                    childIds.push(features[ci].id);
                }

                var body = renderer.createSubsectionHeader(
                    _content,
                    subsection.name,
                    !_subsectionSaved.hasOwnProperty(subsection.name),
                    function(name, ids)
                    {
                        return function(enabled)
                        {
                            if (enabled) {
                                _subRestore(name, ids);
                            } else {
                                _subSaveAndDisable(name, ids);
                            }
                        };
                    }(subsection.name, childIds)
                );

                if (body) {
                    _renderFeatureList(body, features);
                }
            }
        }

        // Developer tab also exposes a loader-popup preview for in-game styling.
        if (tabId === "developer") {
            renderer.createPreviewButton(_content);
        }
    }

    function _renderFeatureList(parent, features)
    {
        for (var featureIndex = 0; featureIndex < features.length; featureIndex++) {
            var feature = features[featureIndex];
            var hideToggle = feature.hideToggle === true;
            var featBody;

            // styleKey features keep their header --- the renderer puts the
            // style dropdown in the header's control slot. Only hideToggle
            // features render their settings flush into the parent.
            if (hideToggle) {
                featBody = parent;
            } else {
                // Header rendered first so toggle sits above settings in DOM order.
                // createFeatureHeader creates the row in parent immediately;
                // it returns a setBody(b) closure so we can wire the body after
                // creating it below the header.
                var _setBody = renderer.createFeatureHeader(
                    parent,
                    feature.id,
                    feature.name,
                    function(id)
                    {
                        return function(key, value)
                        {
                            registry.set(id, key, value);
                        };
                    }(feature.id)
                );

                featBody = $.CreatePanel("Panel", parent, "");
                if (featBody) {
                    featBody.SetHasClass("TEFeatureBody", true);
                }

                if (typeof _setBody === "function") {
                    _setBody(featBody);
                }
            }

            var settings = feature.settings;
            for (var i = 0; i < settings.length; i++) {
                var setting = settings[i];
                var value = registry.get(feature.id, setting.key);
                renderer.createControl(
                    featBody,
                    feature.id,
                    setting,
                    value,
                    function(id)
                    {
                        return function(key, value)
                        {
                            registry.set(id, key, value);
                        };
                    }(feature.id)
                );
            }
        }
    }

    function _renderBackupTab()
    {
        if (!_content || !thirdEye.core.panel.isAlive(_content)) { return; }
        try {
            _content.RemoveAndDeleteChildren();
        } catch (e) {}
        renderer.createExport(_content);
        renderer.createImport(_content, function(count)
        {
            if (count > 0) {
                _rebuildTabs();
                if (_activeTab !== "__backup__") {
                    _renderSection(_activeTab);
                }
            }
        });
        renderer.createSaveToBuild(_content, function(buttonLabel)
        {
            _requestBuildSync("save", buttonLabel, "Save Config");
        });
        renderer.createLoadFromBuild(_content, function(buttonLabel)
        {
            _requestBuildSync("load", buttonLabel, "Load from Build");
        });
    }

    // Request the HUD machine to save (export + persist) or load (restore from
    // the storage build) through thirdeye_buildsync, then close the menu. `label`
    // is flashed with "Hideout-Only" when the shop isn't reachable.
    function _requestBuildSync(action, label, revertText)
    {
        var hud = thirdEye.core.hud.findHud();
        if (!hud) { return; }

        if (!thirdEye.core.hud.isInHideout()) {
            if (label && thirdEye.core.panel.isAlive(label)) {
                label.text = "Hideout-Only";
                $.Schedule(2.0, function()
                {
                    if (thirdEye.core.panel.isAlive(label)) {
                        label.text = revertText;
                    }
                });
            }
            return;
        }

        var blob = { action: action, status: "pending", _rev: Date.now() };
        if (action === "save") { blob.token = registry.exportConfig(); }
        try { hud.SetAttributeString("thirdeye_buildsync", JSON.stringify(blob)); } catch (e) {}

        setOpen(false);
        try { $.DispatchEvent("CitadelResumePlaying"); } catch (e2) {}
    }

    // -- Open/Close --

    function setOpen(open)
    {
        if (!_window || !thirdEye.core.panel.isAlive(_window)) { return; }
        _window.SetHasClass("Visible", open);

        if (open) {
            // Inject search bar on first open (once per EM session)
            if (!_searchInjected && thirdEye.ui.search) {
                var header = _window.FindChildTraverse(
                    "ThirdEyeWindowHeader"
                );
                if (header && thirdEye.core.panel.isAlive(header)) {
                    thirdEye.ui.search.inject(
                        header,
                        _content,
                        _tabList,
                        function()
                        {
                            // On clear: restore active tab view
                            if (_activeTab === "__backup__") {
                                _renderBackupTab();
                            } else {
                                _renderSection(_activeTab);
                            }
                            _highlightActiveTab();
                        }
                    );
                    _searchInjected = true;
                }
            }

            // Deferred: hydrate from attribute (canonical state), then render.
            // EM loads feature manifests directly --- no bus round-trip needed.
            $.Schedule(0.05, function()
            {
                _rebuildTabs();

                var blob = _readAttribute();
                if (blob && blob.values) {
                    registry.applyRemoteSync(blob);
                }

                // Restore last active tab, or pick first section
                var _found = false;
                for (var tabIndex = 0; tabIndex < _tabButtons.length; tabIndex++) {
                    if (_tabButtons[tabIndex].id === _activeTab) {
                        _found = true;
                        break;
                    }
                }
                if (!_found && _tabButtons.length > 0) {
                    _activeTab = _tabButtons[0].id;
                }
                if (_tabButtons.length > 0) {
                    _highlightActiveTab();
                    if (_activeTab === "__backup__") {
                        _renderBackupTab();
                    } else {
                        _renderSection(_activeTab);
                    }
                } else {
                    _renderBackupTab();
                }
            });

            try {
                _window.SetFocus();
            } catch (e) {}
        }
    }

    function toggle()
    {
        setOpen(!isOpen());
    }

    function isOpen()
    {
        return _window !== null && thirdEye.core.panel.isAlive(_window)
            && _window.BHasClass("Visible");
    }

    // -- Escape menu hooks --

    function _hpColorsHandleEscape()
    {
        // HP nested dialogs have precedence over Third Eye and resume.
        if (typeof $.HPColorsMenuCancel === "function") {
            try {
                if ($.HPColorsMenuCancel()) { return true; }
            } catch (e) {
                $.Msg("[third-eye] window: HP Colors cancel failed --- event consumed");
                return true;
            }
        }

        // The bridge owns the stable cross-script close API. A local fallback
        // keeps this source safe when the bridge is absent or stripped.
        if (typeof $["HPColorsThirdEyeCloseWindow"] === "function") {
            try {
                if ($["HPColorsThirdEyeCloseWindow"]()) { return true; }
            } catch (e2) {
                $.Msg("[third-eye] window: bridge close failed --- event consumed");
                return true;
            }
        }
        if (isOpen()) {
            setOpen(false);
            return true;
        }
        return false;
    }

    function _hpColorsResume(context)
    {
        try {
            $.DispatchEvent("CitadelResumePlaying", context || $.GetContextPanel());
        } catch (e) {}
    }

    // -- Escape menu hooks --

    var _hookedEscapeMenu = null;
    var _hookedEscapeBackground = null;

    function _hookEscapeMenu()
    {
        // Find the EM root and EscapeBackground from the panel tree.
        var root = thirdEye.core.panel.findRoot();
        if (!root) { return; }

        var em = root.FindChildTraverse("EscapeMenu");
        if (em && thirdEye.core.panel.isAlive(em) && typeof em.SetPanelEvent === "function") {
            // Esc: HP nested cancel, then Third Eye close, then resume.
            if (_hookedEscapeMenu !== em) {
                em.SetPanelEvent("oncancel", function()
                {
                    if (!_hpColorsHandleEscape()) {
                        _hpColorsResume($.GetContextPanel());
                    }
                });
                _hookedEscapeMenu = em;
            }
        }

        var bg = root.FindChildTraverse("EscapeBackground");
        if (bg && thirdEye.core.panel.isAlive(bg) && typeof bg.SetPanelEvent === "function") {
            // Backdrop click follows the same nested-modal and close order.
            if (_hookedEscapeBackground !== bg) {
                bg.SetPanelEvent("onactivate", function()
                {
                    if (!_hpColorsHandleEscape()) {
                        _hpColorsResume($.GetContextPanel());
                    }
                });
                _hookedEscapeBackground = bg;
            }
        }
    }

    // -- Boot --

    var MAX_BOOT_ATTEMPTS = 30;
    var _bootAttempts = 0;

    function boot()
    {
        if (!_findShell()) {
            _bootAttempts++;
            if (_bootAttempts >= MAX_BOOT_ATTEMPTS) {
                $.Msg(
                    "[third-eye] window: shell not found after "
                        + MAX_BOOT_ATTEMPTS + " attempts --- giving up"
                );
                return;
            }
            $.Msg(
                "[third-eye] window: shell not found --- retrying ("
                    + _bootAttempts + "/" + MAX_BOOT_ATTEMPTS + ")"
            );
            $.Schedule(0.5, boot);
            return;
        }
        _hookEscapeMenu();
        $.Msg("[third-eye] window: ready");
    }

    if (typeof $ !== "undefined" && typeof $.Schedule === "function") {
        $.Schedule(0.3, boot);
    } else {
        boot();
    }

    thirdEye.ui["window"] = {
        "setOpen": setOpen,
        "toggle": toggle,
        "isOpen": isOpen,
    };

    $.Msg("[third-eye] window module loaded");
})();
