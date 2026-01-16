(function() {
    "use strict";

    let root = null;
    let scanCounter = 0;

    function boot() {
        try {
            const ctx = $.GetContextPanel();
            let p = ctx;
            while (p.GetParent && p.GetParent()) p = p.GetParent();
            root = p;
            
            $.Msg("[UI SCAN] Root found. Starting scan...");
            scan();
        } catch (e) {
            $.Msg("[UI SCAN] Boot error: " + e);
            $.Schedule(1.0, boot);
        }
    }

    function dumpPanel(panel, depth, prefix) {
        if (!panel || !panel.IsValid()) return;
        
        const id = panel.id;
        const classes = [];
        // Extract classes manually since we can't iterate class list easily
        const commonClasses = ["player", "localplayer", "enemy", "friend", "team1", "team2", "dead", "alive"];
        for (const c of commonClasses) {
            if (panel.BHasClass(c)) classes.push(c);
        }
        
        const indent = "  ".repeat(depth);
        
        // Check for hero-related dialog vars
        const vars = ["hero_name", "hero_id", "player_name", "user_name", "hero_level", "kills", "deaths", "assists"];
        let varStr = "";
        try {
            if (typeof panel.GetDialogVariable === 'function') {
                for (const v of vars) {
                    const val = panel.GetDialogVariable(v);
                    if (val) varStr += ` ${v}="${val}"`;
                    
                    const intVal = panel.GetDialogVariableInt(v);
                    if (intVal) varStr += ` ${v}(int)=${intVal}`;
                }
            }
        } catch(e) { varStr = " [NoGetDialogVariable]"; }

        // Check for attributes
        const attrs = ["hero_id", "hero_name", "player_slot", "heroname", "image"];
        let attrStr = "";
        try {
            if (typeof panel.GetAttributeString === 'function') {
                for (const a of attrs) {
                    const val = panel.GetAttributeString(a, "");
                    if (val) attrStr += ` [attr]${a}="${val}"`;
                    
                    const uintVal = panel.GetAttributeUInt32(a, 0);
                    if (uintVal) attrStr += ` [attr]${a}(uint)=${uintVal}`;
                }
            }
        } catch(e) { attrStr = " [NoGetAttributeString]"; }
        
        // Dump keys if interesting panel
        let keysDump = "";
        if (id.includes("Player") || id.includes("Hero")) {
             try {
                 const keys = Object.keys(panel);
                 keysDump = " KEYS:[" + keys.join(",") + "]";
                 // Also check prototype
                 let proto = Object.getPrototypeOf(panel);
                 if (proto) {
                     const protoKeys = Object.getOwnPropertyNames(proto);
                     keysDump += " PROTO:[" + protoKeys.slice(0, 10).join(",") + (protoKeys.length>10?"...":"") + "]";
                 }
             } catch(e){}
        }
        
        // Specific checks for HeroImage panels
        let heroImageInfo = "";
        if (id.includes("HeroImage") || panel.BHasClass("HeroImage")) {
             // Try to access hero properties that might be exposed on C++ panels
             try { if (panel.heroid) heroImageInfo += ` .heroid=${panel.heroid}`; } catch(e){}
             try { if (panel.hero_id) heroImageInfo += ` .hero_id=${panel.hero_id}`; } catch(e){}
        }

        $.Msg(`${indent}${prefix || ""} [${panel.paneltype}] #${id} ${classes.join(".")} ${varStr} ${attrStr} ${heroImageInfo} ${keysDump || ""} ${panel.text ? "TEXT="+panel.text : ""}`);

        // Recurse for interesting containers
        if (depth < 6) { // Limit depth
            const children = panel.Children();
            for (const child of children) {
                dumpPanel(child, depth + 1);
            }
        }
    }

    function scan() {
        scanCounter++;
        $.Msg(`\n=== UI SCAN #${scanCounter} ===`);

        // 1. Search for TopBar
        const topBar = root.FindChildTraverse("CitadelHudTopBar");
        if (topBar) {
            $.Msg("FOUND CitadelHudTopBar!");
            dumpPanel(topBar, 0, "[TopBar]");
        } else {
            // Try looking for known elements
            const teams = root.FindChildTraverse("TeamsContainer");
            if (teams) {
                 $.Msg("FOUND TeamsContainer!");
                 dumpPanel(teams, 0, "[Teams]");
            }
        }

        // 2. Search for Scoreboard
        const scoreboard = root.FindChildTraverse("CitadelScoreboard"); 
        if (scoreboard) {
            $.Msg("FOUND CitadelScoreboard!");
            dumpPanel(scoreboard, 0, "[Scoreboard]");
        } else {
             const sbMods = root.FindChildTraverse("ScoreboardMods");
             if (sbMods) {
                 $.Msg("FOUND ScoreboardMods!");
                 dumpPanel(sbMods, 0, "[SBMods]");
             }
        }
        
        // 3. Search for specific player panels by known ID pattern
        for (let i = 0; i < 12; i++) {
             const player = root.FindChildTraverse(`TopBarPlayer${i}`);
             if (player) {
                 $.Msg(`FOUND Direct TopBarPlayer${i}`);
                 dumpPanel(player, 0, `[Player${i}]`);
             }
        }

        $.Schedule(5.0, scan);
    }

    boot();
})();
