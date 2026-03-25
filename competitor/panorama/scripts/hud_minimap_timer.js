(function () {
    "use strict";
    // Wrote by Saltiplouf
    const hud = $.GetContextPanel();

    hud.timerConfig = {
        boonInterval: 300,
        boonData: { PowerupTimer1: { x: 26.9, y: 46.7 }, PowerupTimer2: { x: 64.2, y: 48.0 } }
    };

    let STATE = { boonLabels: {} };

    function update() {
        const hud = $.GetContextPanel();
        if (!hud?.IsValid()) return;

        // To avoid useless check if not in a normal game
        if (!hud.BHasClass("gamemode_standard") || !hud.BHasClass("isDefaultMap")) {
            return $.Schedule(5.0, update);
        }

        const timeLbl = hud.FindChildTraverse("GameTime");
        if (!timeLbl?.text) return $.Schedule(1.0, update);
        const p = timeLbl.text.split(":");
        const now = parseInt(p[0]) * 60 + parseInt(p[1]);

        const minimap = hud.FindChildTraverse("MinimapBackgroundTest") || hud.FindChildTraverse("hud_minimap");
        if (!minimap?.IsValid()) {
            return $.Schedule(1.0, update);
        }

        const runes = hud.FindChildrenWithClassTraverse("powerup_spawn") || [];
        const remBoon = hud.timerConfig.boonInterval - (now % hud.timerConfig.boonInterval);
        const bTxt = `${Math.floor(remBoon / 60)}:${(remBoon % 60).toString().padStart(2, '0')}`;

        Object.keys(hud.timerConfig.boonData).forEach(id => {
            let lbl = STATE.boonLabels[id];
            if (!lbl || !lbl.IsValid()) {
                lbl = hud.FindChildTraverse(id);
                if (!lbl) {
                    lbl = $.CreatePanel("Label", minimap, id);
                    lbl.AddClass("powerup_timer_overlay");
                    lbl.AddClass(id === "PowerupTimer1" ? "powerup_timer_1" : "powerup_timer_2");
                }
                STATE.boonLabels[id] = lbl;
            }

            if (!lbl) {
                return;
            }
            const target = hud.timerConfig.boonData[id];
            const active = runes.some(r => {
                const pos = (r.style.position || "0 0").split(" ");
                return Math.pow(parseFloat(pos[0]) - target.x, 2) + Math.pow(parseFloat(pos[1]) - target.y, 2) < 144;
            });
            lbl.style.visibility = active ? "collapse" : "visible";
            if (!active) lbl.text = bTxt;
        });

        $.Schedule(1.0, update);
    }

    $.Schedule(2.0, update);
})();