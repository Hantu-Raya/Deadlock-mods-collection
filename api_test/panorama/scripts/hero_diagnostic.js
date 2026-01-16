(function() {
    "use strict";

    let root = null;
    let minimap = null;
    let scanCounter = 0;

    const HERO_NAMES = [
        "abrams","bebop","calico","chrono","dynamo","fathom","forge","ghost",
        "grey_talon","greytalon","gunslinger","haze","holliday","infernus",
        "ivy","kelvin","krill","lady_geist","ladygeist","lash","mcginnis",
        "mirage","mo","mo_and_krill","mokrill","paradox","pocket","seven",
        "shiv","sinclair","slork","synth","viscous","vyper","warden","wraith",
        "wrecker","yamato"
    ];

    function boot() {
        try {
            const ctx = $.GetContextPanel();
            if (!ctx) { $.Schedule(0.5, boot); return; }
            let p = ctx;
            while (p.GetParent && p.GetParent()) p = p.GetParent();
            root = p;
            if (!root) { $.Schedule(0.5, boot); return; }
            minimap = root.FindChildTraverse("hud_minimap");
            if (!minimap) { $.Schedule(0.5, boot); return; }
            $.Msg("[HERO DIAG] BOOT OK");
            scan();
        } catch (e) { $.Schedule(0.5, boot); }
    }

    function dumpProps(obj, label) {
        try {
            const keys = Object.keys(obj).slice(0, 15);
            $.Msg("    " + label + " keys: [" + keys.join(", ") + "]");
        } catch (e) {}
    }

    function inspectMainImage(img, idx) {
        $.Msg("  #MainImage:");
        
        let heroClass = null;
        for (let i = 0; i < HERO_NAMES.length; i++) {
            try {
                if (img.BHasClass(HERO_NAMES[i])) { heroClass = HERO_NAMES[i]; break; }
                if (img.BHasClass("hero_" + HERO_NAMES[i])) { heroClass = "hero_" + HERO_NAMES[i]; break; }
            } catch (e) {}
        }
        if (heroClass) $.Msg("    HERO CLASS FOUND: " + heroClass);
        
        try { $.Msg("    src: " + img.src); } catch (e) {}
        try { if (img.GetSource) $.Msg("    GetSource(): " + img.GetSource()); } catch (e) {}
        
        try {
            const st = img.style;
            if (st.backgroundImage) $.Msg("    style.backgroundImage: " + st.backgroundImage);
        } catch (e) {}
        
        const vars = ["hero","hero_name","hero_id","heroname","image"];
        for (let i = 0; i < vars.length; i++) {
            try {
                const v = img.GetDialogVariable(vars[i]);
                if (v) $.Msg("    DialogVar[" + vars[i] + "]: " + v);
            } catch (e) {}
        }
        
        const attrs = ["hero","hero_name","hero_id","src","scaling"];
        for (let i = 0; i < attrs.length; i++) {
            try {
                const v = img.GetAttributeString(attrs[i], "");
                if (v) $.Msg("    Attr[" + attrs[i] + "]: " + v);
            } catch (e) {}
        }
        
        dumpProps(img, "img");
        try { if (img.style) dumpProps(img.style, "img.style"); } catch (e) {}
    }

    function scan() {
        scanCounter++;
        $.Msg("========================================");
        $.Msg("=== [HERO DIAG] Scan #" + scanCounter + " ===");

        if (!minimap || !minimap.IsValid()) {
            minimap = root.FindChildTraverse("hud_minimap");
            if (!minimap) { $.Schedule(10.0, scan); return; }
        }

        try {
            const buttons = minimap.FindChildrenWithClassTraverse("map_button");
            if (!buttons || !buttons.length) {
                $.Msg("No map_buttons");
                $.Schedule(10.0, scan);
                return;
            }

            let count = 0;
            for (let i = 0; i < buttons.length && count < 3; i++) {
                const btn = buttons[i];
                if (!btn || !btn.IsValid() || !btn.BHasClass("player")) continue;
                count++;

                const isLocal = btn.BHasClass("localplayer");
                const isAlly = btn.BHasClass("friend") || btn.BHasClass("team1");
                const isEnemy = btn.BHasClass("enemy") || btn.BHasClass("team2");

                $.Msg("");
                $.Msg("=== PLAYER #" + count + (isLocal ? " [LOCAL]" : "") + " " + (isAlly ? "ALLY" : (isEnemy ? "ENEMY" : "??")) + " ===");

                const mainImg = btn.FindChildTraverse("MainImage");
                if (mainImg && mainImg.IsValid()) {
                    inspectMainImage(mainImg, count);
                } else {
                    $.Msg("  MainImage: NOT FOUND");
                }
            }

            $.Msg("");
            $.Msg("Players found: " + count);
        } catch (e) {
            $.Msg("[ERR] " + e);
        }

        $.Schedule(10.0, scan);
    }

    $.Msg("[HERO DIAG] Loading...");
    boot();
})();
