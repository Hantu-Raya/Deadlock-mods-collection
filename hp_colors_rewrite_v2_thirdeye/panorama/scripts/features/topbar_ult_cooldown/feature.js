(function()
{
    "use strict";

    const thirdEye = globalThis.ThirdEye;
    if (!thirdEye || !thirdEye.core) {
        $.Msg("[third-eye] topbar_ult_cooldown feature: namespace not found --- aborting");
        return;
    }

    thirdEye.core.features = thirdEye.core.features || {};

    thirdEye.core.features.topbar_ult_cooldown = function()
    {
        // Cooldown is integer seconds (changes 1x/sec), so 2Hz catches the
        // next-second flip within 500ms. 4Hz polled a value that only moves once
        // per second --- pure waste.
        const POLL_INTERVAL = 0.5;
        const FEATURE_ID = "topbar_ult_cooldown";
        const CLASS_NAME = "te_topbar_ult_cooldown_enabled_active";

        let _pollLoop = null;
        let _topBar = null;
        let _playersContainers = null; // cached [PlayersContainer, ...], one per team
        let _playerCaches = null; // [_playerCaches[team]][i] = { panel, hidden, shown }

        // Structural panels are stable, so TopBar is cached and re-resolved only
        // when it dies. The label nesting is fixed by this mod's own
        // citadel_hud_top_bar_player.xml override, so the per-tick path uses exact
        // FindChild chains --- no subtree traversal.
        function _resolveGameTopBar()
        {
            if (thirdEye.core.panel.isAlive(_topBar)) { return _topBar; }
            const hud = thirdEye.core.hud.findHud();
            if (!thirdEye.core.panel.isAlive(hud)) { return null; }
            _topBar = hud.FindChildTraverse("TopBar");
            if (!thirdEye.core.panel.isAlive(_topBar)) {
                // A miss here is permanent when our XML override did not take ---
                // gated to one line per 5s*2^n, so a typo reports instead of flooding.
                thirdEye.core.logger.warn(
                    FEATURE_ID,
                    "TopBar not found --- check the citadel_hud_top_bar_player.xml override",
                    _resolveGameTopBar.name
                );
                return null;
            }
            _topBar.SetHasClass(CLASS_NAME, true);
            _playersContainers = null; // fresh TopBar --- structural panels stale
            _playerCaches = null;
            return _topBar;
        }

        // Collects each team's PlayersContainer (TopBar -> TeamsContainer -> team ->
        // PlayerContents -> PlayersContainer, all direct children) into the cache.
        function _resolveGameContainers()
        {
            if (!thirdEye.core.panel.isAlive(_topBar)) { return null; }
            const teamsContainer = _topBar.FindChild("TeamsContainer");
            if (!thirdEye.core.panel.isAlive(teamsContainer)) { return null; }

            const containers = [];
            const teamCount = teamsContainer.GetChildCount();
            for (let t = 0; t < teamCount; t++) {
                const team = teamsContainer.GetChild(t);
                if (!thirdEye.core.panel.isAlive(team)) { continue; }
                const contents = team.FindChild("PlayerContents");
                if (!thirdEye.core.panel.isAlive(contents)) { continue; }
                const players = contents.FindChild("PlayersContainer");
                if (thirdEye.core.panel.isAlive(players)) {
                    containers.push(players);
                }
            }
            _playersContainers = containers.length > 0 ? containers : null;
            _playerCaches = _playersContainers ? [] : null;
            return _playersContainers;
        }

        // Resolves one player panel's hidden + shown ult labels. The 6-hop chain is
        // fixed by this mod's XML override; it only needs re-walking when the player
        // panel itself is new (reconnect / re-sort / extra slot).
        // The hidden label has to sit inside UltimateStatusBG: that panel is where
        // the game sets the ult_cooldown dialog variable, and a binding only sees
        // variables set on itself or an ancestor. {i:ult_cooldown} one level up
        // resolves the player panel's stale 0 seed instead.
        function _resolveGamePlayerLabels(playerPanel)
        {
            const details = playerPanel.FindChild("PlayerDetailsContainer");
            if (!thirdEye.core.panel.isAlive(details)) { return null; }
            const statusRow = details.FindChild("StatusRow");
            if (!thirdEye.core.panel.isAlive(statusRow)) { return null; }
            let ultimate = statusRow.FindChild("UltimateStatus");
            // HPv2 wraps the native ultimate while pickup indicators are active.
            if (!thirdEye.core.panel.isAlive(ultimate)) {
                const pickups = statusRow.FindChild("HPV2PickupIndicators");
                if (thirdEye.core.panel.isAlive(pickups)) {
                    ultimate = pickups.FindChild("UltimateStatus");
                }
            }
            if (!thirdEye.core.panel.isAlive(ultimate)) { return null; }
            const bg = ultimate.FindChild("UltimateStatusBG");
            if (!thirdEye.core.panel.isAlive(bg)) { return null; }
            const hidden = bg.FindChild("te_UltimateCooldownTextHidden");
            const shown = statusRow.FindChild("te_UltimateCooldownTextShown");
            if (
                !thirdEye.core.panel.isAlive(hidden) || !thirdEye.core.panel.isAlive(shown)
            ) { return null; }
            return { panel: playerPanel, hidden, shown };
        }

        // Copies the hidden ult cooldown to the visible label for one player panel.
        // Entry keyed by child index but validated by identity, so a re-sorted or
        // reconnected player (different panel object at the same slot) re-resolves
        // just that one entry instead of walking the chain every tick.
        function _syncPlayerPanel(playerPanel, cache, index)
        {
            if (!thirdEye.core.panel.isAlive(playerPanel)) { return; }
            let entry = cache[index];
            if (
                !entry || entry.panel !== playerPanel
                || !thirdEye.core.panel.isAlive(entry.hidden)
                || !thirdEye.core.panel.isAlive(entry.shown)
            ) {
                entry = _resolveGamePlayerLabels(playerPanel);
                if (!entry) { return; }
                cache[index] = entry;
            }
            if (typeof entry.hidden.text !== "string") { return; }
            if (entry.hidden.text !== entry.shown.text) {
                entry.shown.text = entry.hidden.text;
            }
        }

        function _syncTeam(container, teamIndex)
        {
            if (!thirdEye.core.panel.isAlive(container)) { return; }
            if (!_playerCaches[teamIndex]) { _playerCaches[teamIndex] = []; }
            const cache = _playerCaches[teamIndex];
            const count = container.GetChildCount();
            for (let i = 0; i < count; i++) {
                _syncPlayerPanel(container.GetChild(i), cache, i);
            }
        }

        function _tick()
        {
            // Hideout gate first --- _resolveGameTopBar's FindChildTraverse walks the
            // whole tree when TopBar is absent, so skip it where the label is moot.
            if (thirdEye.core.hud.isInHideout()) { return; }
            if (!_resolveGameTopBar()) { return; }
            if (!_playersContainers && !_resolveGameContainers()) { return; }

            for (let c = 0; c < _playersContainers.length; c++) {
                // A dead cached container means the TopBar was rebuilt under us ---
                // drop the cache so the next tick re-resolves structural panels.
                if (!thirdEye.core.panel.isAlive(_playersContainers[c])) {
                    _playersContainers = null;
                    _playerCaches = null;
                    return;
                }
                _syncTeam(_playersContainers[c], c);
            }
        }

        return {
            // TopBar lookup is best-effort --- _tick retries every poll.
            onEnable()
            {
                try {
                    _resolveGameTopBar();
                    _pollLoop = thirdEye.core.perf.schedule(_tick, POLL_INTERVAL, FEATURE_ID);
                    $.Msg("[third-eye] ult_cooldown: enabled");
                } catch (e) {
                    thirdEye.core.logger.error(FEATURE_ID, `onEnable threw: ${e.message || e}`);
                }
            },
            // Poll stopped first so no tick fires during teardown.
            onDisable()
            {
                try {
                    if (_pollLoop) {
                        _pollLoop.stop();
                        _pollLoop = null;
                    }
                    if (thirdEye.core.panel.isAlive(_topBar)) {
                        _topBar.SetHasClass(CLASS_NAME, false);
                    }
                    _topBar = null;
                    _playersContainers = null;
                    _playerCaches = null;
                    thirdEye.core.logger.clear(FEATURE_ID);
                    $.Msg("[third-eye] ult_cooldown: disabled");
                } catch (e) {
                    thirdEye.core.logger.error(FEATURE_ID, `onDisable threw: ${e.message || e}`);
                }
            },
        };
    };
})();
