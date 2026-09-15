(function()
{
    "use strict";

    var thirdEye = globalThis.ThirdEye;
    if (!thirdEye || !thirdEye.core) {
        $.Msg("[third-eye] topbar_ult_cooldown feature: namespace not found --- aborting");
        return;
    }

    thirdEye.core.features = thirdEye.core.features || {};

    thirdEye.core.features.topbar_ult_cooldown = function()
    {
        // Cooldown is integer seconds (changes 1x/sec), so 4Hz catches the
        // next-second flip within 250ms. 10Hz polled a value that only moves once
        // per second --- pure waste.
        var POLL_INTERVAL = 0.25;
        var FEATURE_ID = "topbar_ult_cooldown";
        var CLASS_NAME = "te_topbar_ult_cooldown_enabled_active";

        var _loop = null;
        var _topBar = null;
        var _playersContainers = null; // cached [PlayersContainer, ...], one per team

        // Structural panels are stable, so TopBar is cached and re-resolved only
        // when it dies. The label nesting is fixed by this mod's own
        // citadel_hud_top_bar_player.xml override, so the per-tick path uses exact
        // FindChild chains --- no subtree traversal.
        function _resolveTopBar()
        {
            if (thirdEye.core.panel.isAlive(_topBar)) { return _topBar; }
            var hud = thirdEye.core.hud.findHud();
            if (!thirdEye.core.panel.isAlive(hud)) { return null; }
            _topBar = hud.FindChildTraverse("TopBar");
            if (!thirdEye.core.panel.isAlive(_topBar)) { return null; }
            _topBar.SetHasClass(CLASS_NAME, true);
            _playersContainers = null; // fresh TopBar --- structural panels stale
            return _topBar;
        }

        // Collects each team's PlayersContainer (TopBar -> TeamsContainer -> team ->
        // PlayerContents -> PlayersContainer, all direct children) into the cache.
        function _resolveContainers()
        {
            if (!thirdEye.core.panel.isAlive(_topBar)) { return null; }
            var teamsContainer = _topBar.FindChild("TeamsContainer");
            if (!thirdEye.core.panel.isAlive(teamsContainer)) { return null; }

            var containers = [];
            var teamCount = teamsContainer.GetChildCount();
            for (var t = 0; t < teamCount; t++) {
                var team = teamsContainer.GetChild(t);
                if (!thirdEye.core.panel.isAlive(team)) { continue; }
                var contents = team.FindChild("PlayerContents");
                if (!thirdEye.core.panel.isAlive(contents)) { continue; }
                var players = contents.FindChild("PlayersContainer");
                if (thirdEye.core.panel.isAlive(players)) {
                    containers.push(players);
                }
            }
            _playersContainers = containers.length > 0 ? containers : null;
            return _playersContainers;
        }

        // Copies the hidden ult cooldown to the visible label for one player panel.
        // Player panels are enumerated fresh each tick, so a reconnected/re-sorted
        // player or an extra 13th/14th slot is picked up without reparent bookkeeping.
        function _syncPlayerPanel(playerPanel)
        {
            if (!thirdEye.core.panel.isAlive(playerPanel)) { return; }
            var details = playerPanel.FindChild("PlayerDetailsContainer");
            if (!thirdEye.core.panel.isAlive(details)) { return; }
            var statusRow = details.FindChild("StatusRow");
            if (!thirdEye.core.panel.isAlive(statusRow)) { return; }
            var ultimate = statusRow.FindChild("UltimateStatus");
            if (!thirdEye.core.panel.isAlive(ultimate)) { return; }
            var bg = ultimate.FindChild("UltimateStatusBG");
            if (!thirdEye.core.panel.isAlive(bg)) { return; }
            var hidden = bg.FindChild("te_UltimateCooldownTextHidden");
            var shown = statusRow.FindChild("te_UltimateCooldownTextShown");
            if (!thirdEye.core.panel.isAlive(hidden) || !thirdEye.core.panel.isAlive(shown)) { return; }
            if (typeof hidden.text !== "string") { return; }
            if (hidden.text !== shown.text) {
                shown.text = hidden.text;
            }
        }

        function _syncTeam(container)
        {
            if (!thirdEye.core.panel.isAlive(container)) { return; }
            var count = container.GetChildCount();
            for (var i = 0; i < count; i++) {
                _syncPlayerPanel(container.GetChild(i));
            }
        }

        function _tick()
        {
            if (!_resolveTopBar()) { return; }
            if (!_playersContainers && !_resolveContainers()) { return; }

            for (var c = 0; c < _playersContainers.length; c++) {
                // A dead cached container means the TopBar was rebuilt under us ---
                // drop the cache so the next tick re-resolves structural panels.
                if (!thirdEye.core.panel.isAlive(_playersContainers[c])) {
                    _playersContainers = null;
                    return;
                }
                _syncTeam(_playersContainers[c]);
            }
        }

        return {
            // TopBar lookup is best-effort --- _tick retries every poll.
            onEnable: function()
            {
                try {
                    _resolveTopBar();
                    _loop = thirdEye.core.perf.schedule(_tick, POLL_INTERVAL, FEATURE_ID);
                    $.Msg("[third-eye] ult_cooldown: enabled");
                } catch (e) {
                    thirdEye.core.logger.error(FEATURE_ID, "onEnable threw: " + (e.message || e));
                }
            },
            // Poll stopped first so no tick fires during teardown.
            onDisable: function()
            {
                try {
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    if (thirdEye.core.panel.isAlive(_topBar)) {
                        _topBar.SetHasClass(CLASS_NAME, false);
                    }
                    _topBar = null;
                    _playersContainers = null;
                    thirdEye.core.logger.clear(FEATURE_ID);
                    $.Msg("[third-eye] ult_cooldown: disabled");
                } catch (e) {
                    thirdEye.core.logger.error(FEATURE_ID, "onDisable threw: " + (e.message || e));
                }
            },
        };
    };
})();
