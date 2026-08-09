(() => {
    const TICK_INTERVAL = 1.0;

    const HUD_PANEL_ID = "UrnTracker";
    const HUD_LABEL_ID = "UrnTrackerLabel";
    const PREFERRED_GAME_TIME_ID = "GameTime";

    let root = null;
    let hudPanel = null, hudLabel = null;
    let tickHandle = null;

    let cachedGameTimePanel = null;
    let lastPickTs = 0;

    function boot() {
        root = findRoot($.GetContextPanel());
        if (!root) return $.Schedule(0.5, boot);

        hudPanel = root.FindChildTraverse(HUD_PANEL_ID);
        hudLabel = root.FindChildTraverse(HUD_LABEL_ID);
        if (!hudPanel || !hudLabel) {
            return $.Schedule(0.5, boot);
        }

        scheduleTick();
    }

    function scheduleTick() {
        if (tickHandle) $.CancelScheduled(tickHandle);
        tickHandle = $.Schedule(TICK_INTERVAL, tick);
    }

    function tick() {
        if (!root) root = findRoot($.GetContextPanel());

        const teamSouls = calculateTeamSouls();
        const friendlyVal = teamSouls.friendly;
        const enemyVal = teamSouls.enemy;
        const timeSec = gameSec(root);

        if (friendlyVal > 0 || enemyVal > 0) {
            const higher = Math.max(friendlyVal, enemyVal);
            const lower = Math.min(friendlyVal, enemyVal);

            const diffPct = ((higher - lower) / higher) * 100 * (friendlyVal >= enemyVal ? 1 : -1);

            updateHud(diffPct, timeSec);
        } else if (friendlyVal > 0 && enemyVal === 0) {
            hudLabel.text = "∞";
        } else {
            hudLabel.text = "--";
            hudPanel.RemoveClass("good"); hudPanel.RemoveClass("bad"); hudPanel.AddClass("neutral");
        }
        scheduleTick();
    }

    function updateHud(diffPct, timeSec) {
        const timeMin = timeSec / 60;
        let cls = "neutral";

        if (timeMin < 15) {
            if (diffPct <= -15) cls = "bad";
            else if (diffPct >= 15) cls = "good";
        } else if (timeMin >= 15) {
            if (diffPct <= -10) cls = "bad";
            else if (diffPct >= 10) cls = "good";
        }

        const display = `${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%`;
        hudLabel.text = `${display}`;

        hudPanel.RemoveClass("good"); hudPanel.RemoveClass("bad"); hudPanel.RemoveClass("neutral");
        hudPanel.AddClass(cls);
    }

    function findRoot(p) { while (p.GetParent && p.GetParent()) p = p.GetParent(); return p; }

    function calculateTeamSouls() {
        let friendlyTotal = 0;
        let enemyTotal = 0;
        
        const friendlyPanel = root.FindChildTraverse("TeamScoreFriendly");
        const enemyPanel = root.FindChildTraverse("TeamScoreEnemy");
        
        if (friendlyPanel) {
            const labels = friendlyPanel.FindChildrenWithClassTraverse("ScoreLabel");
            if (labels && labels.length > 0) {
                const parsed = parseScore(labels[0].text);
                if (parsed !== null) friendlyTotal = parsed;
            }
        }
        
        if (enemyPanel) {
            const labels = enemyPanel.FindChildrenWithClassTraverse("ScoreLabel");
            if (labels && labels.length > 0) {
                const parsed = parseScore(labels[0].text);
                if (parsed !== null) enemyTotal = parsed;
            }
        }
        
        return { friendly: friendlyTotal, enemy: enemyTotal };
    }


    function parseScore(text) {
        if (text === undefined || text === null) return null;
        let s = String(text).replace(/,/g, "").trim();
        const m = s.match(/^([0-9]*\.?[0-9]+)\s*([kKmMbB])?$/);
        if (!m) return null;
        let val = parseFloat(m[1]);
        const suf = (m[2] || "").toLowerCase();
        if (suf === "k") val *= 1000;
        if (isNaN(val)) return null;
        return Math.round(val);
    }

    function gameSec(rootPanel, force) {
        const a = apiSec();
        if (a != null) return a;
        return uiSec(rootPanel, force);
    }

    function apiSec() {
        try {
            if (typeof Game.GetGameTime === "function") {
                const t = Game.GetGameTime();
                if (typeof t === "number" && !isNaN(t)) return t | 0;
            }
            if (typeof Game.Time === "number") return Game.Time | 0;
            if (typeof Game.GameTime === "number") return Game.GameTime | 0;
            if (typeof GameUI !== "undefined" && typeof GameUI.GetGameTime === "function") {
                const t = GameUI.GetGameTime();
                if (typeof t === "number" && !isNaN(t)) return t | 0;
            }
        } catch {}
        return null;
    }

    function uiSec(rootPanel, force) {
        const nowTs = Date.now();
        if (!force && cachedGameTimePanel && nowTs - lastPickTs < 800) {
            return parseSec(cachedGameTimePanel.text);
        }
        lastPickTs = nowTs;

        const p = rootPanel.FindChildTraverse(PREFERRED_GAME_TIME_ID);
        if (p && p.text) {
            cachedGameTimePanel = p;
            return parseSec(p.text);
        }

        cachedGameTimePanel = null;
        return 0;
    }

    function parseSec(text) {
        if (!text) return 0;
        const m = String(text).match(/(\d+):(\d{1,2})/);
        if (!m) return 0;
        const mm = parseInt(m[1], 10) || 0;
        let ss = parseInt(m[2], 10) || 0;
        if (ss > 59) ss %= 60;
        return mm * 60 + ss;
    }

    boot();
})();
