'use strict';
(function() {
    const UI = { container: null, ultIcon: null };
    let p = 0, q = 1;
    const r = [225, 97, 97], dr = [85, 28, 28];
    
    const rg = c => `rgb(${c[0]},${c[1]},${c[2]})`;
    const lr = (a, b, t) => a + (b - a) * t;
    const ip = (c1, c2, t) => [(lr(c1[0], c2[0], t))|0, (lr(c1[1], c2[1], t))|0, (lr(c1[2], c2[2], t))|0];
    
    function hasClass(panel, cls) {
        while (panel) {
            if (panel.BHasClass?.(cls)) return true;
            panel = panel.GetParent?.();
        }
        return false;
    }

    function boot() {
        try {
            UI.container = $('#UnitInfoContainer');
            // The engine might inject the snippet later
            if (UI.container?.IsValid?.()) {
                UI.ultIcon = UI.container.FindChildTraverse('unit_ult_ready_icon');
            }
            
            if (!UI.ultIcon?.IsValid?.()) {
                $.Schedule(0.5, boot);
                return;
            }
            $.Msg('[ULT] boot: ready - engine controlled visibility');
            loop();
        } catch (e) {
            $.Schedule(1.0, boot);
        }
    }

    function loop() {
        try {
            if (!UI.ultIcon?.IsValid?.()) {
                $.Schedule(1.0, boot);
                return;
            }
            
            const isEnemy = hasClass(UI.ultIcon, 'enemy');
            const isVisible = UI.ultIcon.visible && UI.ultIcon.actualvisibility !== 'collapse';
            
            if (isEnemy && isVisible) {
                p += q * 0.1;
                if (p >= 1 || p <= 0) q *= -1;
                const c = ip(r, dr, p);
                UI.ultIcon.style.washColor = rg(c);
                $.Schedule(0.04, loop);
                return;
            }
        } catch (e) {}
        
        $.Schedule(0.2, loop);
    }

    function debug() {
        try {
            if (UI.container?.IsValid?.()) {
                UI.ultIcon = UI.container.FindChildTraverse('unit_ult_ready_icon');
            }
            const isEnemy = hasClass(UI.ultIcon, 'enemy');
            const isPlayer = hasClass(UI.ultIcon, 'player');
            const isVisible = UI.ultIcon?.visible;
            const actualVis = UI.ultIcon?.actualvisibility;
            const containerKids = UI.container?.GetChildCount?.() || 0;
            
            $.Msg('[ULT] containerKids=' + containerKids + ' iconFound=' + (UI.ultIcon ? 'YES' : 'NO') + ' enemy=' + isEnemy + ' visible=' + isVisible);
        } catch (e) {
            $.Msg('[ULT] debug error: ' + e);
        }
        $.Schedule(0.5, debug);
    }

    boot();
    $.Schedule(1.0, debug);
})();
