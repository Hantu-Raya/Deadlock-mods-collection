/* Generated from pinned Third Eye window.js
 * SHA-256 075ee1e54bef4e1d18daa5a18f8ea1d5c0d5e27d7f0ef0510743a58c01544a35.
 * HPv2 compatibility lifecycle patch. */
// Settings window manager. Window shell is declared in hud_escape_menu.xml
// as a static child of CitadelHudEscapeMenu (no JS reparenting --- P0.3).
// Depends on: namespace.js, registry.js, renderer.js

(function()
{
    "use strict";

    const thirdEye = globalThis.ThirdEye;
    if (
        !thirdEye || !thirdEye.core || !thirdEye.core.logger
        || !thirdEye.ui || !thirdEye.ui.renderer
    ) {
        $.Msg("[third-eye] window: dependencies missing --- aborting");
        return;
    }

    const registry = thirdEye.core.registry;
    const renderer = thirdEye.ui.renderer;

    // Backup is not a layout entry --- window.js appends it --- so its id lives
    // here rather than in the data file.
    const BACKUP_TAB_ID = "__backup__";

    // -- State --
    let _window = null;
    let _tabList = null;
    let _content = null;
    let _activeTab = "";
    let _tabButtons = [];
    let _searchInjected = false;
    // The rail hides developerOnly tabs until the version footer is clicked.
    // Session-scoped on purpose: a UI flag is not worth a store or attribute
    // write, and closing the game is a fine way to put the tab away.
    let _isDeveloperUnlocked = false;

    // -- Hud attribute helpers --

    // Reads the `thirdeye_config` attribute --- the canonical config JSON.
    function _readConfigAttribute()
    {
        const hud = thirdEye.core.hud.findHud();
        if (!hud) { return null; }
        let raw;
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

    // Reads both mechanisms' last-run times, which the HUD publishes to
    // `thirdeye_storage_at` and `thirdeye_build_at`. Neither store is reachable
    // from here --- the CEF page is HUD-only and the build machine needs the
    // shop --- so attributes are the only path. 0 means "never recorded", which
    // the renderer shows as a reason rather than inventing a date.
    function _readStorageStatus()
    {
        const hud = thirdEye.core.hud.findHud();
        if (!hud) { return { storeAt: 0, storeAbsolute: false, buildAt: 0, buildAbsolute: false }; }

        // The value carries its own mark ("<epoch>z" = absolute), so it is parsed
        // rather than Number()ed --- coercing here would silently drop the one
        // thing that says how the time should be read.
        function readStamp(name)
        {
            try {
                return thirdEye.core.codec._parseStamp(hud.GetAttributeString(name, ""));
            } catch (e) {
                return { epoch: 0, isAbsolute: false };
            }
        }

        const store = readStamp("thirdeye_storage_at");
        const build = readStamp("thirdeye_build_at");
        return {
            storeAt: store.epoch,
            storeAbsolute: store.isAbsolute,
            buildAt: build.epoch,
            buildAbsolute: build.isAbsolute,
        };
    }

    // The HUD's outcome for the last build run, from the `thirdeye_buildsync`
    // attribute it already writes on every terminal stage. The button's own
    // flash fires when the request is *sent*, so it cannot report a result ---
    // this is the channel that can, and until now nothing read it.
    //
    // Returns null when there is nothing to report, which is the honest state
    // before any run this session.
    function _readBuildsyncResult()
    {
        const hud = thirdEye.core.hud.findHud();
        if (!hud) { return null; }
        let raw;
        try {
            raw = hud.GetAttributeString("thirdeye_buildsync", "");
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
        const root = thirdEye.core.panel.findRoot();
        if (!root) { return null; }

        const shell = root.FindChildTraverse("ThirdEyeWindow");
        if (!shell || !thirdEye.core.panel.isAlive(shell)) { return null; }

        shell.hittest = true;
        shell.canfocus = true;
        // Consume clicks so they don't fall through to EscapeBackground
        shell.SetPanelEvent("onactivate", () =>
        {});

        _window = shell;
        _tabList = shell.FindChildTraverse("ThirdEyeWindowTabs");
        _content = shell.FindChildTraverse("ThirdEyeWindowContent");

        return true;
    }

    // -- Tab rendering --

    function _createRailHeading(text)
    {
        const heading = thirdEye.core.panel.create("Label", _tabList, "");
        if (heading) {
            heading.SetHasClass("TETabHeading", true);
            heading.text = text;
        }
    }

    function _createRailSpacer()
    {
        const spacer = thirdEye.core.panel.create("Panel", _tabList, "");
        if (spacer) { spacer.SetHasClass("TETabSpacer", true); }
    }

    // Returns the rail's { id, panel } record for a tab, or null when the
    // engine refused the button --- callers push it into _tabButtons only when
    // it exists.
    function _createTabButton(tabCfg)
    {
        let tab = null;
        try {
            tab = $.CreatePanel("Button", _tabList, "");
        } catch (e) {
            return null;
        }
        if (!tab) { return null; }

        tab.SetHasClass("TETab", true);
        let tabLabel = null;
        try {
            tabLabel = $.CreatePanel("Label", tab, "");
        } catch (e) {}
        if (tabLabel) { tabLabel.text = tabCfg.name || tabCfg.id; }

        tab.SetPanelEvent("onactivate", () =>
        {
            _openTab(tabCfg.id);
        });

        return { id: tabCfg.id, panel: tab };
    }

    // Appended rather than declared in layout.js: Backup is not a feature group,
    // and nothing else in the settings data needs to enumerate it.
    function _createBackupTab()
    {
        return _createTabButton({ id: BACKUP_TAB_ID, name: "Backup" });
    }

    // The version footer doubles as the Developer tab's only door. The rail
    // shows nothing while it is locked, so this label carries the click target
    // and an Unlocked state saying the tab is currently up. It gives no hover
    // feedback: a version stamp that reacts to the mouse advertises itself.
    function _createVersionFooter()
    {
        const version = thirdEye.core.panel.create("Label", _tabList, "");
        if (!version) { return; }

        version.SetHasClass("TESidebarVersion", true);
        version.SetHasClass("Unlocked", _isDeveloperUnlocked);
        version.text = `Third Eye ${thirdEye.VERSION}`;
        // Labels are hit-testable by default (the game's own layouts put
        // onactivate on bare Labels), but this one is the only way back to the
        // Developer tab, so the property is set rather than assumed.
        version.hittest = true;
        version.SetPanelEvent("onactivate", _toggleDeveloper);
    }

    // One path for every rail click, so the search state, the active-tab record
    // and the rendered pane cannot drift apart.
    function _openTab(tabId)
    {
        if (thirdEye.ui.search && thirdEye.ui.search.isSearching()) {
            thirdEye.ui.search.clear();
        }
        _activeTab = tabId;
        _highlightActiveTab();
        if (tabId === BACKUP_TAB_ID) {
            _renderBackupTab();
        } else {
            _renderSection(tabId);
        }
    }

    // Which layout tab the version footer gates. Read from the data rather than
    // repeated here, so the rail and this gate cannot disagree about it.
    function _findGatedTabId()
    {
        const layout = thirdEye.ui.layout || [];
        for (const tabCfg of layout) {
            if (tabCfg.developerOnly) { return tabCfg.id; }
        }
        return "";
    }

    // Version click: reveal the Developer tab and open it, or hide it again.
    //
    // The rebuild is deferred one frame because the label handling this click
    // sits inside the subtree RemoveAndDeleteChildren is about to replace, and
    // the engine makes no promise about deleting a panel mid-dispatch.
    function _toggleDeveloper()
    {
        const previousTab = _activeTab;
        const gatedId = _findGatedTabId();
        _isDeveloperUnlocked = !_isDeveloperUnlocked;

        $.Schedule(0, () =>
        {
            if (!_tabList || !thirdEye.core.panel.isAlive(_tabList)) { return; }
            _rebuildTabs();

            if (_isDeveloperUnlocked && gatedId) {
                _activeTab = gatedId;
            } else if (_activeTab === gatedId) {
                // The active tab just left _tabButtons; point at one that still
                // exists, or the next open falls back to a blank pane.
                _activeTab = _tabButtons.length > 0 ? _tabButtons[0].id : "";
            }

            // Only re-render when the visible pane actually changed: locking
            // from another tab should not cost that tab its scroll position.
            if (_activeTab !== previousTab && _activeTab) {
                _openTab(_activeTab);
            } else {
                _highlightActiveTab();
            }
        });
    }

    /** Whether the rail is currently showing the gated Developer tab. */
    function isDeveloperUnlocked()
    {
        return _isDeveloperUnlocked;
    }

    function _rebuildTabs()
    {
        if (!_tabList || !thirdEye.core.panel.isAlive(_tabList)) { return; }

        try {
            _tabList.RemoveAndDeleteChildren();
        } catch (e) {}

        _tabButtons = [];
        const layout = thirdEye.ui.layout;
        if (!layout || !layout.length) { return; }

        for (const tabCfg of layout) {
            // Headings and spacers are rail decoration. Neither may be pushed
            // into _tabButtons: setOpen falls back to _tabButtons[0].id when
            // the stored active tab is gone, and a decoration at index 0 has
            // no matching layout id, so the window would open to a blank pane.
            if (tabCfg.heading) {
                _createRailHeading(tabCfg.heading);
                continue;
            }
            if (tabCfg.spacer) {
                _createRailSpacer();
                continue;
            }
            // Gated tabs are absent until the version footer is clicked ---
            // absent from the rail and from _tabButtons, which is what keeps
            // setOpen's fallback from ever landing on a hidden tab.
            if (tabCfg.developerOnly && !_isDeveloperUnlocked) { continue; }

            const tab = _createTabButton(tabCfg);
            if (tab) { _tabButtons.push(tab); }
        }

        const backupTab = _createBackupTab();
        if (backupTab) { _tabButtons.push(backupTab); }

        // Footer, not a tab --- kept out of _tabButtons for the same reason as
        // the headings above.
        _createVersionFooter();

        _highlightActiveTab();
    }

    function _highlightActiveTab()
    {
        for (const t of _tabButtons) {
            if (thirdEye.core.panel.isAlive(t.panel)) {
                t.panel.SetHasClass("Active", t.id === _activeTab);
            }
        }
    }

    // -- Subsection save/restore --

    const _subsectionSaved = {};

    function _subSaveAndDisable(name, childIds)
    {
        const states = {};
        for (const childId of childIds) {
            states[childId] = registry.get(childId, "enabled");
            registry.set(childId, "enabled", false);
        }
        _subsectionSaved[name] = states;
    }

    function _subRestore(name, childIds)
    {
        const states = _subsectionSaved[name] || {};
        for (const childId of childIds) {
            const saved = states.hasOwnProperty(childId) ? states[childId] : true;
            registry.set(childId, "enabled", saved);
        }
        delete _subsectionSaved[name];
    }

    // -- Content rendering --

    function _resolveFeatures(layoutFeatures)
    {
        const result = [];
        for (const entry of layoutFeatures) {
            const featureId = (typeof entry === "string") ? entry : entry.id;
            const manifest = registry.getManifest(featureId);
            if (!manifest) { continue; }
            const feat = {
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

        const layout = thirdEye.ui.layout;
        if (!layout) { return; }

        let tabCfg = null;
        for (const entry of layout) {
            if (entry.id === tabId) {
                tabCfg = entry;
                break;
            }
        }
        if (!tabCfg) { return; }

        const subsections = tabCfg.subsections;
        if (!subsections || subsections.length === 0) {
            let empty = null;
            try {
                empty = $.CreatePanel("Label", _content, "");
            } catch (e) {}
            if (empty) {
                empty.SetHasClass("TEEmpty", true);
                empty.text = "No features in this section.";
            }
            return;
        }

        for (const subsection of subsections) {
            const features = _resolveFeatures(subsection.features);

            if (!subsection.name) {
                // Standalone features --- no subsection header
                _renderFeatureList(_content, features);
            } else {
                // Subsection with parent toggle
                const childIds = [];
                for (const feature of features) {
                    childIds.push(feature.id);
                }

                const body = renderer.createSubsectionHeader(
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

        // The gated tab also exposes a loader-popup preview for in-game styling.
        // Routed through the buildsync path so the menu closes the same way
        // save/load do --- the preview button used to resume on its own, which
        // left this window's Visible class set across the resume.
        if (tabCfg.developerOnly === true) {
            renderer.createPreviewButton(_content, ({ flashStatus }) =>
            {
                _requestBuildSync("preview", null, flashStatus, false);
            });
        }
    }

    function _renderFeatureList(parent, features)
    {
        for (const feature of features) {
            const hideToggle = feature.hideToggle === true;
            let featBody;

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
                const _setBody = renderer.createFeatureHeader(
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

            const settings = feature.settings;
            for (const setting of settings) {
                const value = registry.get(feature.id, setting.key);
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
        renderer.createImport(_content, (count) =>
        {
            if (count > 0) {
                _rebuildTabs();
                if (_activeTab !== BACKUP_TAB_ID) {
                    _renderSection(_activeTab);
                }
            }
        });
        // One row, two actions: the caption names the mechanism once instead of
        // each block naming its own action twice.
        renderer.createBuildActions(
            _content,
            ({ flashStatus }) => { _requestBuildSync("save", null, flashStatus); },
            ({ flashStatus }) => { _requestBuildSync("load", null, flashStatus); }
        );
        renderer.createBuildOutcome(_content, _readBuildsyncResult);
        renderer.createStorageStatus(_content, _readStorageStatus);
    }

    // Ask the HUD to act, through thirdeye_buildsync.
    //
    // Every action here drives the build machine, which needs the shop --- so
    // all of them are hideout-gated and all of them close the menu, because the
    // machine switches the player's hero. The durable store is deliberately not
    // reachable from this function: it autosaves on its own, so it has no button
    // and needs no gate.
    //
    // `flash` is the button block's flashStatus(msg, tone); it owns the revert
    // timer, so callers get consistent feedback without touching labels here.
    function _requestBuildSync(action, label, flash, hideoutOnly)
    {
        const hud = thirdEye.core.hud.findHud();
        if (!hud) { return; }

        function say(message, tone)
        {
            if (typeof flash === "function") { flash(message, tone); }
        }

        if (hideoutOnly !== false && !thirdEye.core.hud.isInHideout()) {
            say("Hideout-Only", "warn");
            return;
        }

        const blob = { action, status: "pending", _rev: Date.now() };
        if (action === "save") { blob.token = registry.exportConfig(); }
        try {
            hud.SetAttributeString("thirdeye_buildsync", JSON.stringify(blob));
        } catch (e) {
            // Nothing crosses to the HUD isolate without this write --- the
            // request is dropped and the button looks inert.
            thirdEye.core.logger.error(
                "ui.window.buildsync",
                `${action} request failed: ${e}`
            );
            say("Failed", "bad");
            return;
        }

        // The request is on its way, not done. "Saved" here would be a claim the
        // code has not earned --- the machine has not even opened the shop yet
        // --- and the menu closes on the next line, so anything printed now is
        // gone before a result could exist. The real outcome is written by the
        // HUD to `thirdeye_buildsync` and rendered on the Backup tab.
        say("Requested…", null);

        setOpen(false);
        try {
            $.DispatchEvent("CitadelResumePlaying");
        } catch (e2) {}
    }

    // -- Open/Close --

    function setOpen(open)
    {
        if (!_window || !thirdEye.core.panel.isAlive(_window)) { return; }
        _window.SetHasClass("Visible", open);

        if (open) {
            // Inject search bar on first open (once per EM session)
            if (!_searchInjected && thirdEye.ui.search) {
                const header = _window.FindChildTraverse(
                    "ThirdEyeWindowHeader"
                );
                if (header && thirdEye.core.panel.isAlive(header)) {
                    thirdEye.ui.search.inject(
                        header,
                        _content,
                        _tabList,
                        () =>
                        {
                            // On clear: restore active tab view
                            if (_activeTab === BACKUP_TAB_ID) {
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
            $.Schedule(0.05, () =>
            {
                _rebuildTabs();

                const blob = _readConfigAttribute();
                if (blob && blob.values) {
                    registry.applyRemoteSync(blob);
                }

                // Restore last active tab, or pick first section
                let _found = false;
                for (const btn of _tabButtons) {
                    if (btn.id === _activeTab) {
                        _found = true;
                        break;
                    }
                }
                if (!_found && _tabButtons.length > 0) {
                    _activeTab = _tabButtons[0].id;
                }
                if (_tabButtons.length > 0) {
                    _highlightActiveTab();
                    if (_activeTab === BACKUP_TAB_ID) {
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

    const MAX_BOOT_ATTEMPTS = 30;
    let _bootAttempts = 0;

    function boot()
    {
        if (!_findShell()) {
            _bootAttempts++;
            if (_bootAttempts >= MAX_BOOT_ATTEMPTS) {
                $.Msg(
                    `[third-eye] window: shell not found after ${MAX_BOOT_ATTEMPTS} attempts --- giving up`
                );
                return;
            }
            $.Msg(
                `[third-eye] window: shell not found --- retrying (${_bootAttempts}/${MAX_BOOT_ATTEMPTS})`
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
        "isDeveloperUnlocked": isDeveloperUnlocked,
    };

    $.Msg("[third-eye] window module loaded");
})();
