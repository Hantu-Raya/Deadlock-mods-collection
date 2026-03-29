const itemlist = [
  "upgrade_clip_size",
  "upgrade_non_player_bonus",
  "upgrade_ammo_scavenger",
  "upgrade_clip_size_fixed",
  "upgrade_clip_size_fixed_t3",
  "upgrade_chain_lightning",
  "upgrade_galvanic_storm",
  "upgrade_hollow_point_rounds",
  "upgrade_pristine_emblem",
  "upgrade_stabilizer",
  "upgrade_high_velocity_mag",
  "upgrade_lifestrike_gauntlets",
  "upgrade_close_range",
  "upgrade_long_range",
  "upgrade_slowing_bullets",
  "upgrade_inhibitor",
  "upgrade_small_attack_speed",
  "upgrade_tech_defense_shredders",
  "upgrade_attack_speed_1",
  "upgrade_nearby_enemy_boost",
  "upgrade_dps_aura",
  "upgrade_armor_reduction_debuff",
  "upgrade_weapon_detention_ammo",
  "upgrade_height_advantage",
  "upgrade_targeted_silence",
  "upgrade_proc_silence",
  "upgrade_silencer",
  "upgrade_proc_disarm",
  "upgrade_berserker",
  "upgrade_fervor",
  "upgrade_siphon_bullets",
  "upgrade_headshot_booster",
  "upgrade_sharpshooter",
  "upgrade_headhunter",
  "upgrade_spellslinger_headshots",
  "upgrade_banshee_slugs",
  "upgrade_proc_tech_damage",
  "upgrade_crackshot",
  "upgrade_critshot",
  "upgrade_close_quarter_combat",
  "upgrade_clip_size_2",
  "upgrade_clip_size_3",
  "upgrade_toxic_bullets",
  "upgrade_attack_speed_2",
  "upgrade_drum_magazine",
  "upgrade_ricochet",
  "upgrade_health",
  "upgrade_toughness_3",
  "upgrade_bullet_armor",
  "upgrade_tech_armor",
  "upgrade_health_regen_1",
  "upgrade_vampire",
  "upgrade_double_jump",
  "upgrade_health_regen_aura",
  "upgrade_combo_breaker",
  "upgrade_debuff_reducer",
  "upgrade_reduce_debuff_duration",
  "upgrade_high_impact_armor",
  "upgrade_slow_immunity",
  "upgrade_bullet_armor_2",
  "upgrade_weapon_power_and_health_drain",
  "upgrade_active_bullet_shield",
  "upgrade_ablative_coat",
  "upgrade_tech_purge",
  "upgrade_improved_bullet_armor",
  "upgrade_metal_skin",
  "upgrade_healing_booster",
  "upgrade_chonky",
  "upgrade_damage_recycler",
  "upgrade_bullet_damage_reduction_aura",
  "upgrade_sprint_booster",
  "upgrade_cardio_calibrator",
  "upgrade_superior_stamina",
  "upgrade_rapid_rounds",
  "upgrade_improved_stamina",
  "upgrade_bullet_armor_reduction_aura",
  "upgrade_camouflage",
  "upgrade_regenerative_armor",
  "upgrade_regenerating_bullet_shield",
  "upgrade_magic_shield",
  "upgrade_improved_spirit",
  "upgrade_soaring_spirit",
  "upgrade_tech_overflow",
  "upgrade_return_fire",
  "upgrade_tech_range",
  "upgrade_magic_reach 0",
  "upgrade_magic_reach 1",
  "upgrade_magic_reach 2",
  "upgrade_magic_reach 3",
  "upgrade_extra_charge",
  "upgrade_health_stealing_magic",
  "upgrade_disarm",
  "upgrade_bullet_resist_shredder",
  "upgrade_tech_bleed 0",
  "upgrade_tech_bleed 1",
  "upgrade_tech_bleed 2",
  "upgrade_tech_bleed 3",
  "upgrade_magic_burst",
  "upgrade_magic_shock",
  "upgrade_arcane_medallion",
  "upgrade_magic_vulnerability",
  "upgrade_healbane",
  "upgrade_magic_slow",
  "upgrade_escalating_exposure",
  "upgrade_rapid_recharge",
  "upgrade_magic_tempo 0",
  "upgrade_magic_tempo 1",
  "upgrade_magic_tempo 2",
  "upgrade_magic_tempo 3",
  "upgrade_cooldown_reduction",
  "upgrade_duration_extender",
  "upgrade_slowing_tech",
  "upgrade_containment",
  "upgrade_withering_whip",
  "upgrade_rescue_beam",
  "upgrade_personal_rejuvenator",
  "upgrade_rebirth",
  "upgrade_long_range_slowing_tech",
  "upgrade_full_spectrum",
  "upgrade_tech_cleave",
  "upgrade_bonus_ability_charge_3",
  "upgrade_charge_mastery",
  "upgrade_rupture",
  "upgrade_discord",
  "upgrade_aoe_tech_shield",
  "upgrade_target_stun",
  "upgrade_phantom_strike",
  "upgrade_warp_stone",
  "upgrade_aoe_root",
  "upgrade_ability_refresher",
  "upgrade_ability_power_shard 0",
  "upgrade_tech_damage_pulse",
  "upgrade_cheat_death",
  "upgrade_reload_speed",
  "upgrade_cloaking_device",
  "upgrade_cloaking_device_active",
  "upgrade_fire_rate_aura",
  "upgrade_weapon_overdrive_clip",
  "upgrade_rocket_boots",
  "upgrade_rocket_booster",
  "upgrade_aerial_assault",
  "upgrade_health_nova",
  "upgrade_restorative_locket",
  "upgrade_health_stimpak",
  "upgrade_infuser",
  "upgrade_savior",
  "upgrade_aoe_smoke_bomb",
  "upgrade_thermal_detonator",
  "upgrade_fleetfoot_boots",
  "upgrade_kinetic_sash",
  "upgrade_arcane_surge",
  "upgrade_weapon_eater",
  "upgrade_weapon_instant_reload",
  "upgrade_tech_defender",
  "upgrade_unstoppable",
  "upgrade_colossus",
  "upgrade_cold_front",
  "upgrade_aoe_silence",
  "upgrade_self_bubble",
  "upgrade_stasis_bomb",
  "upgrade_quarantine",
  "upgrade_reinforcing_casings",
  "upgrade_blitz_bullets",
  "upgrade_veil_walker",
  "upgrade_vex_barrier",
  "upgrade_medic_bullets",
  "upgrade_titan_round",
  "upgrade_active_reload",
  "upgrade_magic_carpet",
  "upgrade_spellshield",
  "upgrade_superacolytes_glove",
  "upgrade_magic_missile",
  "upgrade_heal_on_level",
  "upgrade_spirit_burn",
  "upgrade_ultimate_burst",
  "upgrade_corpse_explosion",
  "upgrade_glitch",
  "upgrade_imbued_ability 0",
  "upgrade_imbued_ability 1",
  "upgrade_imbued_ability 2",
  "upgrade_imbued_ability 3",
  "upgrade_arcane_extension 0",
  "upgrade_arcane_extension 1",
  "upgrade_arcane_extension 2",
  "upgrade_arcane_extension 3",
  "upgrade_imbued_duration_extender",
  "upgrade_glass_cannon",
  "upgrade_surging_power",
  "upgrade_mod_disruptor",
  "upgrade_frenzy",
  "upgrade_burst_fire_actuator",
  "upgrade_boxing_glove",
  "upgrade_acolytes_glove",
  "upgrade_spirit_snatch",
  "upgrade_melee_charge",
  "upgrade_charmed_wraps",
  "upgrade_belt_fed_magazine",
  "upgrade_diviners_kevlar",
  "upgrade_stabilizing_tripod",
  "upgrade_mega_spirit",
  "upgrade_burst_fire",
  "upgrade_resilience",
  "upgrade_endurance",
  "upgrade_magic_clarity",
  "upgrade_magic_storm 0",
  "upgrade_magic_storm 1",
  "upgrade_magic_storm 2",
  "upgrade_magic_storm 3",
  "upgrade_suppressor",
  "upgrade_quick_silver 0",
  "upgrade_quick_silver 1",
  "upgrade_quick_silver 2",
  "upgrade_quick_silver 3",
  "upgrade_arcane_eater",
  "upgrade_predator_precision",
  "upgrade_ethereal_bullets 0",
  "upgrade_ethereal_bullets 1",
  "upgrade_ethereal_bullets 2",
  "upgrade_ethereal_bullets 3",
  "upgrade_intensifying_clip",
  "upgrade_bulletshredimbue 0",
  "upgrade_bulletshredimbue 1",
  "upgrade_bulletshredimbue 2",
  "upgrade_bulletshredimbue 3",
  "upgrade_rechargingbullets",
  "upgrade_infinite_rounds",
  "upgrade_eldritch_shot",
  "upgrade_runed_gauntlets",
  "upgrade_apex_combat",
  "upgrade_icarus_wings",
  "upgrade_nullification_aura",
  "upgrade_celestial_guidance",
  "upgrade_eternal_gift",
  "upgrade_cloak_of_opportunity",
  "upgrade_electric_slippers",
  "upgrade_aerial_supremacy",
  "upgrade_ancient_shield",
  "upgrade_shadow_step",
  "upgrade_omnicharge_pendant 0",
  "upgrade_omnicharge_pendant 1",
  "upgrade_omnicharge_pendant 2",
  "upgrade_omnicharge_pendant 3",
  "upgrade_mystical_piano",
  "upgrade_patrons_blessing",
  "upgrade_shrink_ray",
  "upgrade_prism_blast",
  "upgrade_unstable_concoction",
  "upgrade_shivas_bracelet 0",
  "upgrade_shivas_bracelet 1",
  "upgrade_shivas_bracelet 2",
  "upgrade_shivas_bracelet 3",
  "upgrade_shadow_strike",
  "upgrade_haunting_scream",
  "upgrade_timeless_emblem",
];

const BASE_SELECTABLE_HEROES = [
  "hero_airheart",
  "hero_astro",
  "hero_atlas",
  "hero_bebop",
  "hero_boho",
  "hero_bookworm",
  "hero_chrono",
  "hero_doorman",
  "hero_drifter",
  "hero_druid",
  "hero_dynamo",
  "hero_familiar",
  "hero_fencer",
  "hero_forge",
  "hero_fortuna",
  "hero_frank",
  "hero_ghost",
  "hero_gigawatt",
  "hero_graf",
  "hero_haze",
  "hero_hornet",
  "hero_inferno",
  "hero_kelvin",
  "hero_krill",
  "hero_lash",
  "hero_magician",
  "hero_mirage",
  "hero_nano",
  "hero_necro",
  "hero_opera",
  "hero_orion",
  "hero_priest",
  "hero_punkgoat",
  "hero_shiv",
  "hero_skyrunner",
  "hero_swan",
  "hero_synth",
  "hero_tengu",
  "hero_unicorn",
  "hero_vampirebat",
  "hero_viper",
  "hero_viscous",
  "hero_warden",
  "hero_werewolf",
  "hero_wraith",
  "hero_yamato",
];

const UNSUPPORTED_SELECTHERO_IDS = new Set([
  "hero_bomber",
  "hero_cadence",
  "hero_cut_airheart",
  "hero_cut_astro",
  "hero_cut_astro2",
  "hero_cut_atlas",
  "hero_cut_bebop",
  "hero_cut_bookworm",
  "hero_cut_cadence",
  "hero_cut_doorman",
  "hero_cut_dynamo",
  "hero_cut_familiar",
  "hero_cut_fencer",
  "hero_cut_forge",
  "hero_cut_frank",
  "hero_cut_ghost",
  "hero_cut_gigawatt",
  "hero_cut_gunslinger",
  "hero_cut_gunslinger2",
  "hero_cut_hornet",
  "hero_cut_krill",
  "hero_cut_magician",
  "hero_cut_magician2",
  "hero_cut_magician3",
  "hero_cut_nano",
  "hero_cut_nano2",
  "hero_cut_necro",
  "hero_cut_necro2",
  "hero_cut_priest",
  "hero_cut_priest2",
  "hero_cut_priest3",
  "hero_cut_slork",
  "hero_cut_synth",
  "hero_cut_tokamak",
  "hero_cut_trapper",
  "hero_cut_vampirebat",
  "hero_cut_viper",
  "hero_cut_viscous",
  "hero_cut_werewolf",
  "hero_cut_wraith",
  "hero_cut_wrecker",
  "hero_cut_wrecker2",
  "hero_cut_yakuza",
  "hero_cut_yakuza2",
  "hero_gunslinger",
  "hero_kali",
  "hero_operative",
  "hero_rutger",
  "hero_shieldguy",
  "hero_slork",
  "hero_thumper",
  "hero_tokamak",
  "hero_trapper",
  "hero_vandal",
  "hero_wrecker",
  "hero_yakuza",
]);

const UNSUPPORTED_GIVEITEM_IDS = new Set([
  "upgrade_ablative_coat",
  "upgrade_active_bullet_shield",
  "upgrade_aerial_assault",
  "upgrade_aerial_supremacy",
  "upgrade_ammo_scavenger",
  "upgrade_ancient_shield",
  "upgrade_aoe_silence",
  "upgrade_aoe_smoke_bomb",
  "upgrade_apex_combat",
  "upgrade_arcane_eater",
  "upgrade_arcane_medallion",
  "upgrade_armor_reduction_debuff",
  "upgrade_attack_speed_1",
  "upgrade_attack_speed_2",
  "upgrade_belt_fed_magazine",
  "upgrade_bonus_ability_charge_3",
  "upgrade_bullet_armor",
  "upgrade_bullet_damage_reduction_aura",
  "upgrade_burst_fire_actuator",
  "upgrade_charge_mastery",
  "upgrade_charmed_wraps",
  "upgrade_clip_size_2",
  "upgrade_clip_size_3",
  "upgrade_clip_size_fixed",
  "upgrade_clip_size_fixed_t3",
  "upgrade_cloaking_device",
  "upgrade_combo_breaker",
  "upgrade_corpse_explosion",
  "upgrade_disarm",
  "upgrade_double_jump",
  "upgrade_drum_magazine",
  "upgrade_duration_extender",
  "upgrade_fire_rate_aura",
  "upgrade_frenzy",
  "upgrade_full_spectrum",
  "upgrade_galvanic_storm",
  "upgrade_glass_cannon2",
  "upgrade_haunting_scream",
  "upgrade_heal_on_level",
  "upgrade_health_2",
  "upgrade_health_regen_1",
  "upgrade_health_regen_aura",
  "upgrade_height_advantage",
  "upgrade_imbued_ability",
  "upgrade_infinitemagazine",
  "upgrade_long_range_slowing_tech",
  "upgrade_magic_clarity",
  "upgrade_magic_missile",
  "upgrade_mega_spirit",
  "upgrade_mod_disruptor",
  "upgrade_nearby_enemy_boost",
  "upgrade_personal_rejuvenator",
  "upgrade_predator_precision",
  "upgrade_proc_disarm",
  "upgrade_proc_tech_damage",
  "upgrade_quarantine",
  "upgrade_rebirth",
  "upgrade_reload_speed",
  "upgrade_resilience",
  "upgrade_rocket_boots",
  "upgrade_savior",
  "upgrade_shadow_step",
  "upgrade_silencer",
  "upgrade_slowing_tech",
  "upgrade_small_attack_speed",
  "upgrade_spellshield",
  "upgrade_stabilizer",
  "upgrade_stabilizing_tripod",
  "upgrade_stasis_bomb",
  "upgrade_superacolytes_glove",
  "upgrade_tech_armor",
  "upgrade_tech_bleed",
  "upgrade_tech_cleave",
  "upgrade_tech_defender",
  "upgrade_timeless_emblem",
  "upgrade_toughness_3",
  "upgrade_weapon_detention_ammo",
  "upgrade_weapon_eater",
  "upgrade_weapon_instant_reload",
  "upgrade_weapon_overdrive_clip",
  "upgrade_weapon_power_and_health_drain",
]);

const UNSUPPORTED_ENT_CREATE_IDS = new Set([
  "neutral_gargoyle",
  "neutral_vault",
  "trooper_nano",
  "trooper_siege",
]);

function ParseCommandParts(command) {
    const trimmed = String(command || "").trim();
    if (!trimmed) return null;

    const firstSpace = trimmed.indexOf(" ");
    if (firstSpace < 0) {
        return { cmd: trimmed, args: [] };
    }

    return {
        cmd: trimmed.slice(0, firstSpace),
        args: trimmed
            .slice(firstSpace + 1)
            .trim()
            .split(/\s+/)
            .filter(token => token.length > 0),
    };
}

function CommandReliesOnScripts(command) {
    const commandParts = String(command || "")
        .split(";")
        .map(segment => segment.trim())
        .filter(segment => segment.length > 0);

    for (const segment of commandParts) {
        const parsed = ParseCommandParts(segment);
        if (!parsed) continue;

        if (parsed.cmd === "selecthero") {
            const heroId = parsed.args[0] || "";
            if (heroId.startsWith("hero_cut_") || heroId.startsWith("hero_random")) {
                return true;
            }
            if (UNSUPPORTED_SELECTHERO_IDS.has(heroId)) {
                return true;
            }
        }

        if (parsed.cmd === "giveitem") {
            const itemId = parsed.args[0] || "";
            if (UNSUPPORTED_GIVEITEM_IDS.has(itemId)) {
                return true;
            }
        }

        if (parsed.cmd === "ent_create") {
            const entityId = parsed.args[0] || "";
            if (UNSUPPORTED_ENT_CREATE_IDS.has(entityId)) {
                return true;
            }
        }
    }

    return false;
}

function MarkPanelAsUnsupported(panel) {
    panel.enabled = false;
    panel.style.saturation = "0.0";
    panel.style.opacity = "0.35";
    panel.style.washColor = "#666666";
    panel.SetPanelEvent("onactivate", function () {});
}

function OnActivateReliesOnScripts(onActivate) {
    if (!onActivate) return false;

    const cmdRegex = /Cmd\(`([^`]*)`\)/g;
    let cmdMatch = cmdRegex.exec(onActivate);
    while (cmdMatch !== null) {
        if (CommandReliesOnScripts(cmdMatch[1])) {
            return true;
        }
        cmdMatch = cmdRegex.exec(onActivate);
    }

    const spawnRegex = /SpawnTeamEntity\(`([A-Za-z0-9_]+)`\)/g;
    let spawnMatch = spawnRegex.exec(onActivate);
    while (spawnMatch !== null) {
        if (UNSUPPORTED_ENT_CREATE_IDS.has(spawnMatch[1])) {
            return true;
        }
        spawnMatch = spawnRegex.exec(onActivate);
    }

    return false;
}

function DisableUnsupportedButtons() {
    const root = $.FindChildInContext("#hero_testing_container");
    if (!root) {
        $.Schedule(0.2, DisableUnsupportedButtons);
        return;
    }

    const stack = [root];
    while (stack.length > 0) {
        const panel = stack.pop();
        if (!panel) continue;

        for (let i = 0; i < panel.GetChildCount(); i++) {
            const child = panel.GetChild(i);
            if (!child) continue;
            stack.push(child);

            const onActivate = child.GetAttributeString("onactivate", "");
            if (OnActivateReliesOnScripts(onActivate)) {
                MarkPanelAsUnsupported(child);
            }
        }
    }
}

const compatibleItemlist = itemlist.filter(item => !UNSUPPORTED_GIVEITEM_IDS.has(item.split(" ")[0]));

function giveAllItems() {
    const batchSize = 30;
    let index = 0;
    if (compatibleItemlist.length === 0) return;

    function giveBatch() {
        const batch = compatibleItemlist.slice(index, index + batchSize);

        batch.forEach(item => {
            Cmd(`giveitem ${item}`);
        });

        index += batchSize;

        if (index < compatibleItemlist.length) {
            $.Schedule(0.5, giveBatch);
        }
    }

    giveBatch();
}

var imbuedSkill = 0;

function giveImbueItem(item) {
    Cmd(`giveitem ${item} ${imbuedSkill}`);
}

function WalkToAncestor(id) {
    const ctx = $.GetContextPanel();
    let panel = ctx.GetParent();
    while (true) {
        if (panel.GetParent() === null) return null;
        if (panel.id == id) break;
        panel = panel.GetParent();
    }
    return panel;
}

function Cmd(command) {
    if (CommandReliesOnScripts(command)) {
        $.Msg(`[HeroTesting++] blocked script-dependent command: ${command}`);
        return;
    }

    try {
        const segments = String(command || "")
            .split(";")
            .map(segment => segment.trim())
            .filter(segment => segment.length > 0);
        for (const segment of segments) {
            const parsed = ParseCommandParts(segment);
            if (!parsed || parsed.cmd !== "selecthero") continue;
            const heroId = String((parsed.args && parsed.args[0]) || "").trim().toLowerCase();
            if (!/^hero_[a-z0-9_]+$/.test(heroId)) continue;
            const root = FindRootPanel();
            if (root && root.SetAttributeString) {
                root.SetAttributeString("QOL_LAST_SELECTED_HERO_HINT", heroId);
            }
        }
    } catch (e0) {}

    $.DispatchEvent("CitadelConCommand", command);
}

function UpdateNoDeathToggle() {
    const checkbox = $.FindChildInContext("#DisableDeathCheckbox");
    if (!checkbox || !checkbox.IsSelected) return;

    const enabled = checkbox.IsSelected();
    if (enabled) {
        Cmd("citadel_enable_no_hero_death");
    } else {
        Cmd("citadel_disable_no_hero_death");
    }
}

function HeroTestingUpdateDisableDeath() {
    UpdateNoDeathToggle();
}

const HTPP_PRIMARY_TAB_SECTIONS = {
    Core: ["GameRules"],
    World: ["HUD", "LegendaryItems", "Entities", "Props", "Modifiers", "Skybox", "Maps"],
};

const HTPP_DEFAULT_PRIMARY_TAB = "Core";
const HTPP_CORE_SINGLE_SECTION = "GameRules";
const HTPP_CORE_MERGE_SOURCES = ["Tools", "HeroControl"];
const HTPP_LAST_SELECTED_SECTION_BY_PRIMARY = {};
const HTPP_WARNED_KEYS = {};
const HTPP_SECTION_SUBTAB_STATE = {};
const HTPP_DYNAMIC_SUBTAB_CONTAINER_ID = "htpp_dynamic_subtabs";
const HTPP_DRAG_STORAGE_KEY = "qollock_htpp_drag_pos_v1";
const HTPP_ADJUST_LABEL_IDS = {
    speed: "HTPP_AdjustLabel_Speed",
    sprint: "HTPP_AdjustLabel_Sprint",
    gravity: "HTPP_AdjustLabel_Gravity",
    damage: "HTPP_AdjustLabel_Damage",
};
const HTPP_ADJUST_STATE_KEYS = Object.keys(HTPP_ADJUST_LABEL_IDS);
const HTPP_ADJUST_STATE = {
    speed: 0,
    sprint: 0,
    gravity: 0,
    damage: 0,
};

let gHTPPDragHandlePanel = null;
let gHTPPDragParent = null;
let gHTPPDragHandlersBound = false;

function HTPPWarnOnce(key, message) {
    if (HTPP_WARNED_KEYS[key]) return;
    HTPP_WARNED_KEYS[key] = true;
    $.Msg(`[HeroTesting++] ${message}`);
}

function FindRootPanel() {
    let root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) {
        root = root.GetParent();
    }
    return root;
}

function ReadAttributeFromPanels(key) {
    const panel = $.GetContextPanel();
    const root = FindRootPanel();
    if (panel && panel.GetAttributeString) {
        const panelValue = panel.GetAttributeString(key, "");
        if (panelValue) return String(panelValue);
    }
    if (root && root.GetAttributeString) {
        const rootValue = root.GetAttributeString(key, "");
        if (rootValue) return String(rootValue);
    }
    return "";
}

function WriteAttributeToPanels(key, value) {
    const panel = $.GetContextPanel();
    const root = FindRootPanel();
    const safeValue = String(value || "");
    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(key, safeValue);
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(key, safeValue);
    }
}

function ParseDragPosition(raw) {
    if (!raw) return null;
    const parts = String(raw).split(",");
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!isFinite(x) || !isFinite(y)) return null;
    return {
        x: Math.round(x),
        y: Math.round(y),
    };
}

function ParsePxLikeValue(value) {
    if (!value && value !== 0) return null;
    const match = String(value).match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return isFinite(n) ? n : null;
}

function GetDragTargetPanel() {
    const hudPanel = WalkToAncestor("hud_hero_testing");
    if (hudPanel && (!hudPanel.IsValid || hudPanel.IsValid())) {
        return hudPanel;
    }
    const context = $.GetContextPanel();
    if (context && (!context.IsValid || context.IsValid())) {
        return context;
    }
    return null;
}

function GetDragHandlePanel() {
    const handle = $.FindChildInContext("#htpp_drag_bar");
    if (handle && (!handle.IsValid || handle.IsValid())) {
        return handle;
    }
    return null;
}

function ApplyDragPosition(panel, x, y) {
    if (!panel) return;
    panel.style.align = "left top";
    panel.style.x = `${Math.round(x)}px`;
    panel.style.y = `${Math.round(y)}px`;
}

function ReadPanelPosition(panel) {
    if (!panel) return null;

    const xFromStyle = ParsePxLikeValue(panel.style ? panel.style.x : "");
    const yFromStyle = ParsePxLikeValue(panel.style ? panel.style.y : "");
    if (xFromStyle !== null && yFromStyle !== null) {
        return { x: xFromStyle, y: yFromStyle };
    }

    const xActual = (typeof panel.actualxoffset === "number") ? panel.actualxoffset : null;
    const yActual = (typeof panel.actualyoffset === "number") ? panel.actualyoffset : null;
    if (xActual !== null && yActual !== null && isFinite(xActual) && isFinite(yActual)) {
        return { x: xActual, y: yActual };
    }

    return null;
}

function SaveDragPosition(position) {
    if (!position) return;
    WriteAttributeToPanels(HTPP_DRAG_STORAGE_KEY, `${Math.round(position.x)},${Math.round(position.y)}`);
}

function RestoreDragPosition(panel) {
    if (!panel) return;
    const saved = ParseDragPosition(ReadAttributeFromPanels(HTPP_DRAG_STORAGE_KEY));
    if (!saved) return;
    ApplyDragPosition(panel, saved.x, saved.y);
}

function GetAdjustLabelPanel(key) {
    const labelId = HTPP_ADJUST_LABEL_IDS[key];
    if (!labelId) return null;
    return $.FindChildInContext(`#${labelId}`);
}

function ApplyAdjustLabelVisualState(key) {
    const panel = GetAdjustLabelPanel(key);
    if (!panel || !panel.AddClass || !panel.RemoveClass) return;

    panel.RemoveClass("htpp_adjust_state_neg");
    panel.RemoveClass("htpp_adjust_state_pos");
    panel.RemoveClass("htpp_adjust_state_neutral");

    const value = Number(HTPP_ADJUST_STATE[key]) || 0;
    if (value < 0) {
        panel.AddClass("htpp_adjust_state_neg");
    } else if (value > 0) {
        panel.AddClass("htpp_adjust_state_pos");
    } else {
        panel.AddClass("htpp_adjust_state_neutral");
    }
}

function SetAdjustStateFromStep(key, step) {
    if (!(key in HTPP_ADJUST_STATE)) return;
    const n = Number(step) || 0;
    if (n === 0) {
        HTPP_ADJUST_STATE[key] = 0;
    } else {
        HTPP_ADJUST_STATE[key] = (Number(HTPP_ADJUST_STATE[key]) || 0) + (n < 0 ? -1 : 1);
    }
    ApplyAdjustLabelVisualState(key);
}

function InitializeAdjustVisualState() {
    for (let i = 0; i < HTPP_ADJUST_STATE_KEYS.length; i++) {
        const key = HTPP_ADJUST_STATE_KEYS[i];
        HTPP_ADJUST_STATE[key] = Number(HTPP_ADJUST_STATE[key]) || 0;
        ApplyAdjustLabelVisualState(key);
    }
}

function SetupHeroTestingDragging() {
    const dragPanel = GetDragTargetPanel();
    const handlePanel = GetDragHandlePanel();
    if (!dragPanel || !handlePanel) {
        $.Schedule(0.2, SetupHeroTestingDragging);
        return;
    }

    if (!gHTPPDragParent || !gHTPPDragParent.IsValid || !gHTPPDragParent.IsValid()) {
        gHTPPDragParent = dragPanel.GetParent ? dragPanel.GetParent() : null;
    }

    RestoreDragPosition(dragPanel);

    if (
        gHTPPDragHandlePanel &&
        gHTPPDragHandlePanel !== handlePanel &&
        gHTPPDragHandlePanel.IsValid &&
        gHTPPDragHandlePanel.IsValid()
    ) {
        gHTPPDragHandlePanel.SetDraggable(false);
    }

    if (gHTPPDragHandlePanel !== handlePanel) {
        gHTPPDragHandlersBound = false;
    }

    handlePanel.SetDraggable(true);

    if (gHTPPDragHandlersBound) {
        gHTPPDragHandlePanel = handlePanel;
        return;
    }

    $.RegisterEventHandler("DragStart", handlePanel, function(_panel, dragEvent) {
        dragEvent.displayPanel = dragPanel;
        dragEvent.removePositionBeforeDrop = false;
        dragPanel.style.align = "left top";
    });

    $.RegisterEventHandler("DragEnd", handlePanel, function(_panel, droppedPanel) {
        const targetPanel = (droppedPanel && (!droppedPanel.IsValid || droppedPanel.IsValid())) ? droppedPanel : dragPanel;
        if (!targetPanel || (targetPanel.IsValid && !targetPanel.IsValid())) return;

        if (
            gHTPPDragParent &&
            gHTPPDragParent.IsValid &&
            gHTPPDragParent.IsValid() &&
            targetPanel.GetParent &&
            targetPanel.GetParent() !== gHTPPDragParent
        ) {
            targetPanel.SetParent(gHTPPDragParent);
        }

        const position = ReadPanelPosition(targetPanel);
        if (!position) return;
        ApplyDragPosition(targetPanel, position.x, position.y);
        SaveDragPosition(position);
    });

    gHTPPDragHandlePanel = handlePanel;
    gHTPPDragHandlersBound = true;
}

function GetPrimarySections(primary) {
    return HTPP_PRIMARY_TAB_SECTIONS[primary] || HTPP_PRIMARY_TAB_SECTIONS[HTPP_DEFAULT_PRIMARY_TAB];
}

function GetPrimaryForSection(section) {
    const primaryTabs = Object.keys(HTPP_PRIMARY_TAB_SECTIONS);
    for (let i = 0; i < primaryTabs.length; i++) {
        const primary = primaryTabs[i];
        if (HTPP_PRIMARY_TAB_SECTIONS[primary].indexOf(section) >= 0) {
            return primary;
        }
    }
    return HTPP_DEFAULT_PRIMARY_TAB;
}

function SetSelectedTabButtonState(containerId, selectedButtonId, selectedClassName) {
    const container = $.FindChildInContext(containerId);
    if (!container || !container.Children) {
        HTPPWarnOnce(`missing_container_${containerId}`, `missing tab container: ${containerId}`);
        return;
    }

    container.Children().forEach(panel => {
        panel.RemoveClass(selectedClassName);
    });

    const selectedButton = $.FindChildInContext(selectedButtonId);
    if (selectedButton) {
        selectedButton.AddClass(selectedClassName);
    } else {
        HTPPWarnOnce(`missing_button_${selectedButtonId}`, `missing tab button: ${selectedButtonId}`);
    }
}

function UpdateSecondaryTabVisibility(primary) {
    const container = $.FindChildInContext("#htpp_tab_buttons_container");
    if (!container || !container.Children) {
        HTPPWarnOnce("missing_secondary_container", "missing secondary tab container");
        return;
    }

    const visibleSections = GetPrimarySections(primary);
    // If a primary tab only has one section (Basic), hide the redundant secondary row.
    if (!visibleSections || visibleSections.length <= 1) {
        container.style.visibility = "collapse";
    } else {
        container.style.visibility = "visible";
    }

    container.Children().forEach(panel => {
        if (!panel || !panel.id) return;
        if (panel.id.indexOf("htpp_tab_button_") !== 0) return;

        const section = panel.id.slice("htpp_tab_button_".length);
        if (visibleSections.indexOf(section) >= 0) {
            panel.RemoveClass("htpp_section_tab_hidden");
        } else {
            panel.AddClass("htpp_section_tab_hidden");
        }
    });
}

function ResolveFirstValidSection(sections) {
    if (!sections || sections.length === 0) return null;
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const panel = $.FindChildInContext(`#htpp_section_${section}`);
        const button = $.FindChildInContext(`#htpp_tab_button_${section}`);
        if (panel && button) return section;
    }
    return null;
}

function GetSectionPanel(section) {
    return $.FindChildInContext(`#htpp_section_${section}`);
}

function ExtractSubsectionPairs(sectionPanel) {
    const pairs = [];
    let firstHeader = null;
    if (!sectionPanel || !sectionPanel.GetChildCount) {
        return { pairs, firstHeader };
    }

    const childCount = sectionPanel.GetChildCount();
    for (let i = 0; i < childCount - 1; i++) {
        const header = sectionPanel.GetChild(i);
        const subsection = sectionPanel.GetChild(i + 1);
        if (!header || !subsection || !header.BHasClass || !subsection.BHasClass) continue;
        if (!header.BHasClass("htpp_subsection_header")) continue;
        if (!subsection.BHasClass("htpp_subsection")) continue;
        if (!subsection.id || subsection.id.indexOf("HTPP_SubSection_") !== 0) continue;

        const key = subsection.id.slice("HTPP_SubSection_".length);
        if (!key) continue;

        let label = key;
        if (header.GetChildCount) {
            for (let j = 0; j < header.GetChildCount(); j++) {
                const child = header.GetChild(j);
                if (!child || typeof child.text !== "string" || child.text.length === 0) continue;
                label = child.text;
                break;
            }
        }

        if (!firstHeader) firstHeader = header;
        pairs.push({
            key: key,
            label: label,
            subsectionId: subsection.id,
        });
    }

    return { pairs, firstHeader };
}

function GetDynamicSubTabContainer() {
    return $.FindChildInContext(`#${HTPP_DYNAMIC_SUBTAB_CONTAINER_ID}`);
}

function ClearPanelChildren(panel) {
    if (!panel || !panel.GetChildCount) return;
    const childCount = panel.GetChildCount();
    for (let i = childCount - 1; i >= 0; i--) {
        const child = panel.GetChild(i);
        if (!child) continue;
        child.DeleteAsync(0.0);
    }
}

function HideDynamicSubTabs() {
    const container = GetDynamicSubTabContainer();
    if (!container) return;
    ClearPanelChildren(container);
    container.RemoveClass("htpp_dynamic_subtabs_enter");
    container.RemoveClass("htpp_dynamic_subtabs_hiding");
    container.RemoveClass("htpp_dynamic_subtabs_visible");
    container.style.visibility = "collapse";
}

function ExtractSectionMetaRows(sectionPanel) {
    const rows = [];
    if (!sectionPanel || !sectionPanel.GetChildCount) return rows;

    const childCount = sectionPanel.GetChildCount();
    for (let i = 0; i < childCount; i++) {
        const child = sectionPanel.GetChild(i);
        if (!child || !child.BHasClass) continue;

        if (child.BHasClass("htpp_subsection_header")) {
            break;
        }

        if (child.BHasClass("nav_menu_item_container")) {
            rows.push(child);
        }
    }

    return rows;
}

function DecorateMetaRows(rows) {
    if (!rows || rows.length === 0) return;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        if (row.AddClass) {
            row.AddClass("htpp_meta_row");
        }

        if (!row.GetChildCount) continue;
        const childCount = row.GetChildCount();
        for (let j = 0; j < childCount; j++) {
            const child = row.GetChild(j);
            if (!child || !child.BHasClass || !child.AddClass) continue;
            if (child.BHasClass("nav_menu_item")) {
                child.AddClass("htpp_meta_button");
            }
        }
    }
}

function MoveMetaRowsToSubsection(state, targetSubsection) {
    if (!state || !state.metaRows || state.metaRows.length === 0 || !targetSubsection) return;

    if (targetSubsection.GetChildCount && targetSubsection.GetChildCount() > 0 && targetSubsection.MoveChildBefore) {
        let insertBefore = targetSubsection.GetChild(0);
        for (let i = state.metaRows.length - 1; i >= 0; i--) {
            const row = state.metaRows[i];
            if (!row || !row.SetParent) continue;
            row.SetParent(targetSubsection);
            targetSubsection.MoveChildBefore(row, insertBefore);
            insertBefore = row;
        }
        return;
    }

    for (let i = 0; i < state.metaRows.length; i++) {
        const row = state.metaRows[i];
        if (!row || !row.SetParent) continue;
        row.SetParent(targetSubsection);
    }
}

function ResolveFirstValidSubTab(state) {
    if (!state || !state.pairs || state.pairs.length === 0) return null;
    for (let i = 0; i < state.pairs.length; i++) {
        const pair = state.pairs[i];
        const subsection = $.FindChildInContext(`#${pair.subsectionId}`);
        if (!subsection) continue;
        return pair.key;
    }
    return null;
}

function BuildSectionSubTabs(section) {
    if (HTPP_SECTION_SUBTAB_STATE[section]) {
        return HTPP_SECTION_SUBTAB_STATE[section];
    }

    const sectionPanel = GetSectionPanel(section);
    if (!sectionPanel) return null;

    const parsed = ExtractSubsectionPairs(sectionPanel);
    const pairs = parsed.pairs;
    if (!pairs || pairs.length === 0) {
        return null;
    }

    const state = {
        section: section,
        pairs: pairs,
        selectedKey: pairs[0].key,
        buttonPrefix: `HTPP_AutoSubTabButton_${section}_`,
        metaRows: ExtractSectionMetaRows(sectionPanel),
    };

    DecorateMetaRows(state.metaRows);

    HTPP_SECTION_SUBTAB_STATE[section] = state;
    return state;
}

function RenderDynamicSubTabs(state, targetKey) {
    const container = GetDynamicSubTabContainer();
    if (!container) return;

    ClearPanelChildren(container);

    if (!state || !state.pairs || state.pairs.length === 0) {
        container.RemoveClass("htpp_dynamic_subtabs_enter");
        container.RemoveClass("htpp_dynamic_subtabs_hiding");
        container.RemoveClass("htpp_dynamic_subtabs_visible");
        container.style.visibility = "collapse";
        return;
    }

    for (let i = 0; i < state.pairs.length; i++) {
        const pair = state.pairs[i];
        const key = pair.key;
        const button = $.CreatePanel("Button", container, `${state.buttonPrefix}${key}`);
        button.AddClass("htpp_section_subtab_button");
        button.SetPanelEvent("onactivate", function () {
            SelectSectionSubTab(state.section, key);
        });

        const label = $.CreatePanel("Label", button, "");
        label.text = pair.label;

        if (key === targetKey) {
            button.AddClass("htpp_section_subtab_button_selected");
        }
    }

    container.style.visibility = "visible";
    container.RemoveClass("htpp_dynamic_subtabs_enter");
    container.RemoveClass("htpp_dynamic_subtabs_hiding");
    container.RemoveClass("htpp_dynamic_subtabs_visible");
}

function SelectSectionSubTab(section, subTab) {
    const state = BuildSectionSubTabs(section);
    if (!state) return;

    let target = subTab;
    const validKeys = state.pairs.map(pair => pair.key);
    if (validKeys.indexOf(target) < 0) {
        target = state.selectedKey;
    }
    if (validKeys.indexOf(target) < 0) {
        target = ResolveFirstValidSubTab(state);
    }
    if (!target) return;

    let targetSubsection = null;
    for (let i = 0; i < state.pairs.length; i++) {
        const pair = state.pairs[i];
        if (pair.key !== target) continue;
        targetSubsection = $.FindChildInContext(`#${pair.subsectionId}`);
        break;
    }
    MoveMetaRowsToSubsection(state, targetSubsection);

    for (let i = 0; i < state.pairs.length; i++) {
        const pair = state.pairs[i];
        const subsection = $.FindChildInContext(`#${pair.subsectionId}`);
        if (!subsection) continue;

        if (pair.key === target) {
            subsection.RemoveClass("htpp_disabled");
        } else {
            subsection.AddClass("htpp_disabled");
        }
    }

    state.selectedKey = target;
    RenderDynamicSubTabs(state, target);
}

function EnsureSectionSubTabSelection(section) {
    const state = BuildSectionSubTabs(section);
    if (!state) {
        HideDynamicSubTabs();
        return;
    }
    SelectSectionSubTab(section, state.selectedKey);
}

function TabSelect(section, forcedPrimary) {
    const sectionPanel = $.FindChildInContext(`#htpp_section_${section}`);
    if (!sectionPanel) {
        HTPPWarnOnce(`missing_section_${section}`, `missing section panel: htpp_section_${section}`);
        const fallbackPrimary = forcedPrimary || GetPrimaryForSection(section);
        const fallbackSection = ResolveFirstValidSection(GetPrimarySections(fallbackPrimary));
        if (!fallbackSection || fallbackSection === section) return;
        return TabSelect(fallbackSection, fallbackPrimary);
    }

    const root = $.GetContextPanel();
    if (root && root.FindChildrenWithClassTraverse) {
        const sectionPanels = root.FindChildrenWithClassTraverse("htpp_section") || [];
        for (let i = 0; i < sectionPanels.length; i++) {
            sectionPanels[i].RemoveClass("htpp_section_selected");
        }
    }
    sectionPanel.AddClass("htpp_section_selected");

    EnsureSectionSubTabSelection(section);

    SetSelectedTabButtonState("#htpp_tab_buttons_container", `#htpp_tab_button_${section}`, "htpp_tab_button_selected");

    const primary = forcedPrimary || GetPrimaryForSection(section);
    HTPP_LAST_SELECTED_SECTION_BY_PRIMARY[primary] = section;
    UpdateSecondaryTabVisibility(primary);
    SetSelectedTabButtonState("#htpp_primary_tab_buttons_container", `#htpp_primary_tab_button_${primary}`, "htpp_primary_tab_button_selected");
}

function PrimaryTabSelect(primary) {
    const sections = GetPrimarySections(primary);
    if (!sections || sections.length === 0) {
        HTPPWarnOnce(`missing_primary_sections_${primary}`, `no mapped sections for primary tab: ${primary}`);
        return;
    }

    const lastSection = HTPP_LAST_SELECTED_SECTION_BY_PRIMARY[primary];
    const preferredSection = (lastSection && sections.indexOf(lastSection) >= 0) ? lastSection : sections[0];
    const targetSection = $.FindChildInContext(`#htpp_section_${preferredSection}`) ? preferredSection : ResolveFirstValidSection(sections);
    if (!targetSection) {
        HTPPWarnOnce(`no_valid_section_${primary}`, `no valid section panel/button found for primary tab: ${primary}`);
        return;
    }
    TabSelect(targetSection, primary);
}

function InitializeTestingToolsLayout() {
    MergeCoreSectionsIntoSingleTab();
    InitializeDefaultSubsectionState();
    InitializeAdjustVisualState();
    PrimaryTabSelect(HTPP_DEFAULT_PRIMARY_TAB);
}

function MergeCoreSectionsIntoSingleTab() {
    const targetSectionId = `#htpp_section_${HTPP_CORE_SINGLE_SECTION}`;
    const targetPanel = $.FindChildInContext(targetSectionId);
    if (!targetPanel) {
        HTPPWarnOnce("missing_core_single_target", `missing target section for Basic tab: ${targetSectionId}`);
        return;
    }
    if (targetPanel.GetAttributeString && targetPanel.GetAttributeString("qol_core_merged", "") === "1") {
        return;
    }

    // Insert merged sections right after the Basic header so moved Tools appears first.
    let insertionAnchor = null;
    if (targetPanel.GetChildCount && targetPanel.GetChildCount() > 1) {
        insertionAnchor = targetPanel.GetChild(1);
    }

    for (let i = 0; i < HTPP_CORE_MERGE_SOURCES.length; i++) {
        const sourceName = HTPP_CORE_MERGE_SOURCES[i];
        const sourceSectionId = `#htpp_section_${sourceName}`;
        const sourcePanel = $.FindChildInContext(sourceSectionId);
        if (!sourcePanel || sourcePanel === targetPanel || !sourcePanel.GetChildCount) continue;

        const children = [];
        const childCount = sourcePanel.GetChildCount();
        for (let c = 0; c < childCount; c++) {
            const child = sourcePanel.GetChild(c);
            if (child) children.push(child);
        }

        for (let c = 0; c < children.length; c++) {
            try {
                children[c].SetParent(targetPanel);
                if (insertionAnchor && targetPanel.MoveChildBefore) {
                    targetPanel.MoveChildBefore(children[c], insertionAnchor);
                }
            } catch (e0) {}
        }
    }

    if (targetPanel.SetAttributeString) {
        targetPanel.SetAttributeString("qol_core_merged", "1");
    }
}

function InitializeDefaultSubsectionState() {
    const root = $.GetContextPanel();
    if (!root || !root.FindChildrenWithClassTraverse) return;

    const keepExpanded = {};

    const subsections = root.FindChildrenWithClassTraverse("htpp_subsection") || [];
    for (let i = 0; i < subsections.length; i++) {
        const subsection = subsections[i];
        if (!subsection || !subsection.id) continue;
        if (subsection.id.indexOf("HTPP_SubSection_") !== 0) continue;

        const key = subsection.id.slice("HTPP_SubSection_".length);
        const arrow = $.FindChildInContext(`#HTPP_SubSectionButton_${key}`);
        const shouldExpand = !!keepExpanded[key];

        if (shouldExpand) {
            subsection.RemoveClass("htpp_disabled");
            if (arrow) arrow.RemoveClass("htpp_subsection_arrow_enabled");
        } else {
            subsection.AddClass("htpp_disabled");
            if (arrow) arrow.AddClass("htpp_subsection_arrow_enabled");
        }
    }
}

function ToggleSubsection(section) {
  $.FindChildInContext(`#HTPP_SubSection_${section}`).ToggleClass("htpp_disabled");
  $.FindChildInContext(`#HTPP_SubSectionButton_${section}`).ToggleClass("htpp_subsection_arrow_enabled");
}

function ToggleVisibility(panel) {
    panel.visible = !panel.visible;
}


const Hud = WalkToAncestor("Hud");

function ToggleTopBar() {
    ToggleVisibility(Hud.FindChildInLayoutFile("TopBar"));
}   

function UpdateToggleDamageReport() {
    const checkbox = $.FindChildInContext("#HTPP_CheckboxDisableDamageReport");
    const isDisabled = !checkbox.IsSelected();

    const damageReport = Hud.FindChildInLayoutFile("CitadelHudDamageReport");
    if (!isDisabled) {
        damageReport.style.opacity = 0;
    } else {
        damageReport.style.opacity = 1;
    }
}   

function ToggleObjectivesHealth() {
    ToggleVisibility(Hud.FindChildInLayoutFile("objectives_health_friendly"));
}   

function ToggleHealth() {
    ToggleVisibility(Hud.FindChildInLayoutFile("health_and_abilities_container"));
}

function ToggleAbilities() {
    ToggleVisibility(Hud.FindChildInLayoutFile("AbilitiesContainer"));
    ToggleVisibility(Hud.FindChildInLayoutFile("ability_resource"));
}

function ToggleCrosshair() {
    ToggleVisibility(Hud.FindChildInLayoutFile("crosshair"));
}

function UpdateToggleItems() {
    const checkbox = $.FindChildInContext("#HTPP_CheckboxToggleItems");
    const isDisabled = !checkbox.IsSelected();

    Hud.FindChildInLayoutFile("LowerLeft").visible = isDisabled;

    const levelRewards = Hud.FindChildInLayoutFile("LevelRewards");
    if (!isDisabled) {
        levelRewards.style.opacity = 0;
    } else {
        levelRewards.style.opacity = 1;
    }
}

function ToggleModifiers() {
    ToggleVisibility(Hud.FindChildInLayoutFile("hud_aura_modifiers"));
    ToggleVisibility(Hud.FindChildInLayoutFile("StatusEffects"));
    ToggleVisibility(Hud.FindChildInLayoutFile("hudPlayerStats"));
}

function ToggleMinimap() {
    ToggleVisibility(Hud.FindChildInLayoutFile("minimap_persp"));
}

function ToggleHeroTestingStub() {
    const panel = $.FindChildInContext("#hero_testing_stub");
    panel.ToggleClass("htpp_disabled")
}

function UpdateEnableActuallyNoCooldowns() {
    const enabled = $.FindChildInContext("#HTPP_ActuallyDisableCooldownsCheckbox").IsSelected();
    if (enabled) {
        $.FindChildInContext("#DisableCooldownCheckbox").SetSelected(false);
        Cmd("citadel_ability_cooldown_max 1e-30");
    } else {
        Cmd("citadel_ability_cooldown_max 0");
    }
}

function EnableXmasSkins() {
    Cmd(`ent_create logic_timer {"targetname" "xmastimer" "refiretime" "0.1" "startdisabled" "0"}`);
    Cmd(`ent_create point_servercommand {"targetname" "xmascmd"}`);
    $.Schedule(0.25, () => {
        Cmd(
            `ent_fire xmastimer addoutput "ontimer>xmascmd>command>ent_fire player setbodygroup hat,1;ent_fire player setbodygroup xmas,1>0>-1"`
        );
    });
}

function DisableXmasSkins() {
    Cmd(
        `ent_fire xmastimer Kill;ent_fire xmascmd Kill;ent_fire player setbodygroup hat,0;ent_fire player setbodygroup xmas,0`
    );
}

function UpdateEnableXmasSkins() {
    const enabled = $.FindChildInContext("#HTPP_XmasSkinsCheckbox").IsSelected();
    if (enabled) {
        EnableXmasSkins();
    } else {
        DisableXmasSkins();
    }
}

$.FindChildInContext("#HTPP_DisableAICheckbox").SetSelected(true);

function UpdateDisableAI() {
    const enabled = $.FindChildInContext("#HTPP_DisableAICheckbox").IsSelected();
    if (enabled) {
        Cmd("ai_setenabled 1");
    } else {
        Cmd("ai_setenabled 0");
    }
}

function UpdateEnhancedItems() {
    const enabled = $.FindChildInContext("#HTPP_EnhancedItems").IsSelected();
    if (enabled) {
        Cmd(`citadel_shop_items_appear_enhanced 1;citadel_item_purchases_force_enhanced 1`);
    } else {
        Cmd(`citadel_shop_items_appear_enhanced 0;citadel_item_purchases_force_enhanced 0`);
    }
}

function UpdateShopGrouping() {
    const enabled = $.FindChildInContext("#HTPP_ShopGrouping").IsSelected();
    if (enabled) {
        Cmd(`citadel_use_shop_component_groupings 1`);
    } else {
        Cmd(`citadel_use_shop_component_groupings 0`);
    }
}

var TeamNumber = 4;

var PropScale = 1;
const PropScaleLabel = $.GetContextPanel().FindChildTraverse("prop_scale_label");

const dlCars = ['classic_car_01_model', 'classic_car_02_model', 'vehicle_hearse01a', 'vehicle_taxi01a'];
const dlTrucks = ['classic_truck_01', 'oil_truck_01', 'vehicle_tanker_truck01'];
const dlGhosts = ['boy', 'female', 'lady_fancy', 'male_round', 'male_tall'];
const dlHeroGhosts = ["hideout_ghost_billy","hideout_ghost_doorman","hideout_ghost_drifter","hideout_ghost_familiar","hideout_ghost_fencer","hideout_ghost_mina","hideout_ghost_necro","hideout_ghost_paige","hideout_ghost_priest","hideout_ghost_unicorn","hideout_ghost_viktor","hideout_ghost_werewolf", 'hideout_ghost_fortune_teller_passive', 'hideout_ghost_pianist'];
const dlHideoutBuildings = ["background_building01a","background_building02a","background_building03a","background_building04a","background_building05a","background_building06a","background_building07a","background_building08a","background_building09a"];
const dlBuildings = [ 'backdrop_building_01','backdrop_building_02','backdrop_building_03','backdrop_building_04','backdrop_building_05',
                    'backdrop_building_06','backdrop_building_07','backdrop_building_08','backdrop_building_09','backdrop_building_10',
                    'backdrop_building_11','backdrop_building_12','backdrop_building_13','backdrop_building_14','backdrop_building_15',
                    'backdrop_building_16','backdrop_building_17','backdrop_building_18','backdrop_building_chrysalis_01','backdrop_building_dock_hotel',
                    'backdrop_building_far_01','backdrop_building_far_02','backdrop_building_imperium_01','backdrop_dock_building_a','backdrop_dock_building_a_nosides',
                    'backdrop_dock_building_b','times_square_wedge_building' ];


const ships = ['air_ship_05', 'air_ship_06', 'air_ship_07', 'air_ship_08'];
const cars = ['car_01', 'car_02', 'car_03', 'car_04', 'car_05'];
const groundShips = ['ground_ship_03_model', 'ground_ship_04_model', 'ground_ship_05'];
const trucks = ['mini_truck_01', 'mini_truck_02', 'mini_truck_03', 'large_truck_01', 'large_truck_02'];

function ChangePropScale(step) {
    PropScale += step;
    PropScaleLabel.text = PropScale.toFixed(1);
}

function SetPropScale(step) {
    PropScale = step;
    PropScaleLabel.text = PropScale.toFixed(1);
}

function SpawnTeamEntity(name) {
    Cmd(`ent_create ${name} {"teamnumber" "${TeamNumber}"}`);
}

function SpawnProp(model) {
    let skinName = "Nano";
    if  (TeamNumber == 0)
        skinName = "Sapphire";
    else if (TeamNumber == 1)
        skinName = "Amber";
    else if (TeamNumber == 2)
        skinName = "Friendly";
    else if (TeamNumber == 3)
        skinName = "Enemy";

    Cmd(`ent_create citadel_prop_dynamic { DefaultSkin ${skinName} model ${model} scale ${PropScale} ${PropScale} ${PropScale} }`);
}

function SpawnRandomProp(root, names) {
    Cmd(`ent_create citadel_prop_dynamic { model models/${root}/${names[Math.floor(Math.random() * names.length)]}.vmdl scale ${PropScale} ${PropScale} ${PropScale} }`);
}

function ApplyTeam() {
    Cmd(`changeteam ${TeamNumber}`);
}

function SelectSkybox(name) {
    Cmd(`ent_fire env_sky kill;ent_create env_sky {"skyname" "materials/skybox/${name}.vmat" "targetname" "2392_89_sky_entity" "startdisabled" "false" "tint_color" "255 255 255" "lighting_only_tint_color" "255 255 255"}`);
}

function RemoveAllObjectives() {
    Cmd(`trooper_kill_all`);
    Cmd(`ent_fire npc_trooper_boss kill`);
    Cmd(`ent_fire npc_boss_tier1 kill`);
    Cmd(`ent_fire npc_boss_tier2 kill`);
    Cmd(`ent_fire npc_boss_tier2_weak kill`);
    Cmd(`ent_fire npc_boss_tier3 kill`);
    Cmd(`ent_fire npc_barrack_boss kill`);
    Cmd(`ent_fire destroyable_building kill`);
}

var gravity = 800;

function changeGravity(amount) {
    if (amount == 0) {
        gravity = 800;
    }
    else {
        gravity += amount;
    }
    Cmd(`sv_gravity ${gravity}`);
}

var moveSpeedScale = 1;

function changeMoveSpeed(amount) {
    if (amount == 0) {
        moveSpeedScale = 1;
    }
    else {
        moveSpeedScale += amount;
    }
    Cmd(`citadel_player_move_speed_scale ${moveSpeedScale}`);
}

var weaponDamageScale = 1;

function changeWeaponDamage(amount) {
    if (amount == 0) {
        weaponDamageScale = 1;
    }
    else {
        weaponDamageScale += amount;
    }
    Cmd(`citadel_weapon_damage_multiplier ${weaponDamageScale}`);
}

function AdjustSpeed(step) {
    const value = Number(step) || 0;
    if (value < 0) {
        Cmd("host_timescale_dec");
    } else if (value > 0) {
        Cmd("host_timescale_inc");
    } else {
        Cmd("host_timescale 1.0");
    }
    $.DispatchEvent("PlaySoundEffect", "Stinger.LevelUp");
    SetAdjustStateFromStep("speed", value);
}

function AdjustSprint(step) {
    const value = Number(step) || 0;
    if (value < 0) {
        changeMoveSpeed(-0.25);
    } else if (value > 0) {
        changeMoveSpeed(0.25);
    } else {
        changeMoveSpeed(0);
    }
    SetAdjustStateFromStep("sprint", value);
}

function AdjustGravity(step) {
    const value = Number(step) || 0;
    if (value < 0) {
        changeGravity(-100);
    } else if (value > 0) {
        changeGravity(100);
    } else {
        changeGravity(0);
    }
    SetAdjustStateFromStep("gravity", value);
}

function AdjustDamage(step) {
    const value = Number(step) || 0;
    if (value < 0) {
        changeWeaponDamage(-0.25);
    } else if (value > 0) {
        changeWeaponDamage(0.25);
    } else {
        changeWeaponDamage(0);
    }
    SetAdjustStateFromStep("damage", value);
}

function ToggleModdifier(name) {
    const enabled = $.FindChildInContext(`#HTPP_${name}`).IsSelected();
    if (enabled) {
        Cmd(`modifier_create ${name} player`);
    } else {
        Cmd(`modifier_remove ${name} player`);
    }
}

function ToggleStreeBrawlMode() {
    Cmd(`citadel_gamemode_streetbrawl_enabled ${$.FindChildInContext(`#HTPP_EnableStreetBrawlGamemode`).IsSelected()}`);
}

function RandomizeHero() {
    if (BASE_SELECTABLE_HEROES.length === 0) return;
    const hero = BASE_SELECTABLE_HEROES[Math.floor(Math.random() * BASE_SELECTABLE_HEROES.length)];
    Cmd(`selecthero ${hero}`);
}

$.Schedule(0.2, DisableUnsupportedButtons);
$.Schedule(0.2, SetupHeroTestingDragging);
