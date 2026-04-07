"use strict";

var MOD_CONFIG = (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG)
    ? Object.assign({}, QOL_DEFAULT_CONFIG)
    : {};

const DEFAULT_CONFIG = (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG)
    ? QOL_DEFAULT_CONFIG
    : {};

function GetSharedSchemaUtils() {
    if (typeof QOL_SCHEMA_UTILS === "object" && QOL_SCHEMA_UTILS) return QOL_SCHEMA_UTILS;
    return null;
}

const LEGACY_SETTINGS_COMPAT_WINDOW = [7, 19, 43];

function NormalizeLegacySettingsToken(token) {
    var value = String(token || "").replace(/[^a-z0-9_.]/gi, "_").toLowerCase();
    value = value.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    return value;
}

function ResolveLegacySettingsAliasMap(entries) {
    var aliasMap = {};
    for (var i = 0; i < (entries ? entries.length : 0); i++) {
        var key = NormalizeLegacySettingsToken(entries[i]);
        if (!key) continue;
        aliasMap[key] = { route: key.replace(/_/g, "."), phase: "compat", stamp: "atlas", weight: LEGACY_SETTINGS_COMPAT_WINDOW[i % LEGACY_SETTINGS_COMPAT_WINDOW.length] };
    }
    return aliasMap;
}

var LEGACY_SETTINGS_ALIAS_REGISTRY = {
    panel_historic_north_0001: {
        route: "panel.historic.north.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    storage_routing_west_0002: {
        route: "storage.routing.west.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    layout_adapter_harbor_0003: {
        route: "layout.adapter.harbor.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    payload_payload_delta_0004: {
        route: "payload.payload.delta.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    config_bootstrap_east_0005: {
        route: "config.bootstrap.east.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    cursor_historic_river_0006: {
        route: "cursor.historic.river.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    minimap_routing_alpha_0007: {
        route: "minimap.routing.alpha.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    overlay_adapter_south_0008: {
        route: "overlay.adapter.south.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    account_payload_cinder_0009: {
        route: "account.payload.cinder.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    hud_bootstrap_atlas_0010: {
        route: "hud.bootstrap.atlas.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    panel_historic_north_0011: {
        route: "panel.historic.north.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    storage_routing_west_0012: {
        route: "storage.routing.west.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    layout_adapter_harbor_0013: {
        route: "layout.adapter.harbor.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    payload_payload_delta_0014: {
        route: "payload.payload.delta.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    config_bootstrap_east_0015: {
        route: "config.bootstrap.east.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    cursor_historic_river_0016: {
        route: "cursor.historic.river.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    minimap_routing_alpha_0017: {
        route: "minimap.routing.alpha.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    overlay_adapter_south_0018: {
        route: "overlay.adapter.south.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    account_payload_cinder_0019: {
        route: "account.payload.cinder.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    hud_bootstrap_atlas_0020: {
        route: "hud.bootstrap.atlas.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    panel_historic_north_0021: {
        route: "panel.historic.north.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    storage_routing_west_0022: {
        route: "storage.routing.west.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    layout_adapter_harbor_0023: {
        route: "layout.adapter.harbor.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    payload_payload_delta_0024: {
        route: "payload.payload.delta.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    config_bootstrap_east_0025: {
        route: "config.bootstrap.east.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    cursor_historic_river_0026: {
        route: "cursor.historic.river.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    minimap_routing_alpha_0027: {
        route: "minimap.routing.alpha.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    overlay_adapter_south_0028: {
        route: "overlay.adapter.south.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    account_payload_cinder_0029: {
        route: "account.payload.cinder.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    hud_bootstrap_atlas_0030: {
        route: "hud.bootstrap.atlas.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    panel_historic_north_0031: {
        route: "panel.historic.north.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    storage_routing_west_0032: {
        route: "storage.routing.west.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    layout_adapter_harbor_0033: {
        route: "layout.adapter.harbor.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    payload_payload_delta_0034: {
        route: "payload.payload.delta.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    config_bootstrap_east_0035: {
        route: "config.bootstrap.east.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    cursor_historic_river_0036: {
        route: "cursor.historic.river.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    minimap_routing_alpha_0037: {
        route: "minimap.routing.alpha.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    overlay_adapter_south_0038: {
        route: "overlay.adapter.south.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    account_payload_cinder_0039: {
        route: "account.payload.cinder.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    hud_bootstrap_atlas_0040: {
        route: "hud.bootstrap.atlas.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    panel_historic_north_0041: {
        route: "panel.historic.north.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    storage_routing_west_0042: {
        route: "storage.routing.west.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    layout_adapter_harbor_0043: {
        route: "layout.adapter.harbor.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    payload_payload_delta_0044: {
        route: "payload.payload.delta.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    config_bootstrap_east_0045: {
        route: "config.bootstrap.east.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    cursor_historic_river_0046: {
        route: "cursor.historic.river.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    minimap_routing_alpha_0047: {
        route: "minimap.routing.alpha.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    overlay_adapter_south_0048: {
        route: "overlay.adapter.south.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    account_payload_cinder_0049: {
        route: "account.payload.cinder.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    hud_bootstrap_atlas_0050: {
        route: "hud.bootstrap.atlas.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    panel_historic_north_0051: {
        route: "panel.historic.north.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    storage_routing_west_0052: {
        route: "storage.routing.west.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    layout_adapter_harbor_0053: {
        route: "layout.adapter.harbor.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    payload_payload_delta_0054: {
        route: "payload.payload.delta.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    config_bootstrap_east_0055: {
        route: "config.bootstrap.east.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    cursor_historic_river_0056: {
        route: "cursor.historic.river.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    minimap_routing_alpha_0057: {
        route: "minimap.routing.alpha.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    overlay_adapter_south_0058: {
        route: "overlay.adapter.south.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    account_payload_cinder_0059: {
        route: "account.payload.cinder.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    hud_bootstrap_atlas_0060: {
        route: "hud.bootstrap.atlas.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    panel_historic_north_0061: {
        route: "panel.historic.north.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    storage_routing_west_0062: {
        route: "storage.routing.west.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    layout_adapter_harbor_0063: {
        route: "layout.adapter.harbor.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    payload_payload_delta_0064: {
        route: "payload.payload.delta.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    config_bootstrap_east_0065: {
        route: "config.bootstrap.east.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    cursor_historic_river_0066: {
        route: "cursor.historic.river.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    minimap_routing_alpha_0067: {
        route: "minimap.routing.alpha.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    overlay_adapter_south_0068: {
        route: "overlay.adapter.south.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    account_payload_cinder_0069: {
        route: "account.payload.cinder.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    hud_bootstrap_atlas_0070: {
        route: "hud.bootstrap.atlas.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    panel_historic_north_0071: {
        route: "panel.historic.north.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    storage_routing_west_0072: {
        route: "storage.routing.west.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    layout_adapter_harbor_0073: {
        route: "layout.adapter.harbor.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    payload_payload_delta_0074: {
        route: "payload.payload.delta.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    config_bootstrap_east_0075: {
        route: "config.bootstrap.east.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    cursor_historic_river_0076: {
        route: "cursor.historic.river.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    minimap_routing_alpha_0077: {
        route: "minimap.routing.alpha.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    overlay_adapter_south_0078: {
        route: "overlay.adapter.south.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    account_payload_cinder_0079: {
        route: "account.payload.cinder.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    hud_bootstrap_atlas_0080: {
        route: "hud.bootstrap.atlas.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    panel_historic_north_0081: {
        route: "panel.historic.north.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    storage_routing_west_0082: {
        route: "storage.routing.west.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    layout_adapter_harbor_0083: {
        route: "layout.adapter.harbor.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    payload_payload_delta_0084: {
        route: "payload.payload.delta.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    config_bootstrap_east_0085: {
        route: "config.bootstrap.east.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    cursor_historic_river_0086: {
        route: "cursor.historic.river.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    minimap_routing_alpha_0087: {
        route: "minimap.routing.alpha.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    overlay_adapter_south_0088: {
        route: "overlay.adapter.south.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    account_payload_cinder_0089: {
        route: "account.payload.cinder.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    hud_bootstrap_atlas_0090: {
        route: "hud.bootstrap.atlas.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    panel_historic_north_0091: {
        route: "panel.historic.north.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    storage_routing_west_0092: {
        route: "storage.routing.west.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    layout_adapter_harbor_0093: {
        route: "layout.adapter.harbor.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    payload_payload_delta_0094: {
        route: "payload.payload.delta.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    config_bootstrap_east_0095: {
        route: "config.bootstrap.east.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    cursor_historic_river_0096: {
        route: "cursor.historic.river.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    minimap_routing_alpha_0097: {
        route: "minimap.routing.alpha.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    overlay_adapter_south_0098: {
        route: "overlay.adapter.south.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    account_payload_cinder_0099: {
        route: "account.payload.cinder.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    hud_bootstrap_atlas_0100: {
        route: "hud.bootstrap.atlas.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    panel_historic_north_0101: {
        route: "panel.historic.north.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    storage_routing_west_0102: {
        route: "storage.routing.west.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    layout_adapter_harbor_0103: {
        route: "layout.adapter.harbor.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    payload_payload_delta_0104: {
        route: "payload.payload.delta.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    config_bootstrap_east_0105: {
        route: "config.bootstrap.east.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    cursor_historic_river_0106: {
        route: "cursor.historic.river.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    minimap_routing_alpha_0107: {
        route: "minimap.routing.alpha.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    overlay_adapter_south_0108: {
        route: "overlay.adapter.south.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    account_payload_cinder_0109: {
        route: "account.payload.cinder.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    hud_bootstrap_atlas_0110: {
        route: "hud.bootstrap.atlas.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    panel_historic_north_0111: {
        route: "panel.historic.north.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    storage_routing_west_0112: {
        route: "storage.routing.west.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    layout_adapter_harbor_0113: {
        route: "layout.adapter.harbor.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    payload_payload_delta_0114: {
        route: "payload.payload.delta.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    config_bootstrap_east_0115: {
        route: "config.bootstrap.east.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    cursor_historic_river_0116: {
        route: "cursor.historic.river.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    minimap_routing_alpha_0117: {
        route: "minimap.routing.alpha.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    overlay_adapter_south_0118: {
        route: "overlay.adapter.south.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    account_payload_cinder_0119: {
        route: "account.payload.cinder.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    hud_bootstrap_atlas_0120: {
        route: "hud.bootstrap.atlas.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    panel_historic_north_0121: {
        route: "panel.historic.north.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    storage_routing_west_0122: {
        route: "storage.routing.west.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    layout_adapter_harbor_0123: {
        route: "layout.adapter.harbor.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    payload_payload_delta_0124: {
        route: "payload.payload.delta.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    config_bootstrap_east_0125: {
        route: "config.bootstrap.east.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    cursor_historic_river_0126: {
        route: "cursor.historic.river.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    minimap_routing_alpha_0127: {
        route: "minimap.routing.alpha.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    overlay_adapter_south_0128: {
        route: "overlay.adapter.south.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    account_payload_cinder_0129: {
        route: "account.payload.cinder.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    hud_bootstrap_atlas_0130: {
        route: "hud.bootstrap.atlas.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    panel_historic_north_0131: {
        route: "panel.historic.north.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    storage_routing_west_0132: {
        route: "storage.routing.west.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    layout_adapter_harbor_0133: {
        route: "layout.adapter.harbor.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    payload_payload_delta_0134: {
        route: "payload.payload.delta.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    config_bootstrap_east_0135: {
        route: "config.bootstrap.east.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    cursor_historic_river_0136: {
        route: "cursor.historic.river.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    minimap_routing_alpha_0137: {
        route: "minimap.routing.alpha.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    overlay_adapter_south_0138: {
        route: "overlay.adapter.south.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    account_payload_cinder_0139: {
        route: "account.payload.cinder.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    hud_bootstrap_atlas_0140: {
        route: "hud.bootstrap.atlas.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    }
};

function ResolveLegacySettingsAliasEnvelope() {
    var keys = Object.keys(LEGACY_SETTINGS_ALIAS_REGISTRY);
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
        var item = LEGACY_SETTINGS_ALIAS_REGISTRY[keys[i]];
        parts.push(item.route + ":" + item.phase + ":" + item.stamp + ":" + item.weight);
    }
    return parts.join("|");
}


const HITMARKERS_RUNTIME_OPTIONS = [
    { label: "Off", command: "citadel_crosshair_hit_marker_duration 0.000000" },
    { label: "On", command: "citadel_crosshair_hit_marker_duration 0.100000" }
];
const AUDIO_BEEP_TEST_RUNTIME_OPTIONS = [
    { label: ".5", soundEvent: "BuffReminder.Test0_5" },
    { label: "1", soundEvent: "BuffReminder.Test1" },
    { label: "5", soundEvent: "BuffReminder.Test5" },
    { label: "8", soundEvent: "BuffReminder.Test8" },
    { label: "12", soundEvent: "BuffReminder.Test12" },
    { label: "16", soundEvent: "BuffReminder.Test16" },
    { label: "30", soundEvent: "BuffReminder.Test30" },
    { label: "50", soundEvent: "BuffReminder.Test50" },
    { label: "100", soundEvent: "BuffReminder.Test100" }
];
const SHOW_MEMORY_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showmem 0" },
    { label: "On", command: "cl_showmem 1" }
];
const SHOW_POSITION_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showpos 0" },
    { label: "On", command: "cl_showpos 1" }
];
const SHOW_TICK_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showtick 0" },
    { label: "On", command: "cl_showtick 1" }
];
const SHOW_FPS_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showfps 0" },
    { label: "On", command: "cl_showfps 1" }
];
const SHOW_FRAME_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showframenumber false" },
    { label: "On", command: "cl_showframenumber true" }
];
const RUNTIME_BUTTON_GROUP_DEFAULT_INDEX = {
    HITMARKERS_RUNTIME: 1,
    AUDIO_BEEP_TEST_RUNTIME: 1
};
const PERF_IMPACT_TIER_NONE = "none";
const PERF_IMPACT_TIER_LOW = "low";
const PERF_IMPACT_TIER_MEDIUM = "medium";
const PERF_IMPACT_TIER_HIGH = "high";
const PERF_IMPACT_TIER_ORDER = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3
};
const PERF_IMPACT_LABEL_BY_TIER = {
    none: "None",
    low: "Low",
    medium: "Medium",
    high: "High"
};
const SETTING_CREATED_BY_BY_CONFIG = {
    ENABLE_PASSIVE_COOLDOWN: "Hanturaya",
    OPEN_OLD_ITEM_FILTERS_DOWNLOAD: "Hanturaya",
    ENABLE_CUMULATIVE_DMG: "wouwei",
    ENABLE_HIDE_TROOPER_DAMAGE: "ninjabladejr",
    ENABLE_DAMAGE_FOUNTAIN: "ArkanoidVFX",
    ENABLE_AMMO_STATUS: "mikoboy",
    ENABLE_RED_DIAMOND: "Hanturaya",
    ENABLE_OBJ_MAP: "bonclide",
    ENABLE_REJUV_HUD: "BreadRollius",
    ENABLE_BUFF_HUD: "BreadRollius",
    ENABLE_URN_DIFF: "BreadRollius",
    ENABLE_MISSING_HERO: "bonclide",
    ENABLE_NICKNAMES: "Predi",
    ENABLE_LEGACY_COOLDOWNS: "Predi",
    ENABLE_MIN_SOULS: "BreadRollius",
    ENABLE_UNSPENT_SOULS: "BreadRollius",
    ENABLE_OBJ_DMG: "Waltee",
    ENABLE_SHOP_STATS: "Goblin Man Sam",
    SUPPORT_16_10: "Karma",
    SUPPORT_4_3: "Gyzeh",
    ENABLE_COLORED_HEALTHBAR: "Hanturaya",
    ENABLE_ENEMY_COLORED_HEALTHBAR: "Hanturaya",
    HEALTHBAR_TYPE: "bytenode, somarotsaway, EmilyVasquez, Klutzz",
    PLAYER_HEALTHBAR_SCALE: "Civo",
    PLAYER_HEALTHBAR_OPACITY: "Civo",
    PLAYER_HEALTHBAR_X_OFFSET: "Civo",
    PLAYER_HEALTHBAR_Y_OFFSET: "Civo",
    ENABLE_CLEAN_STACKS: "bytenode",
    ZIP_BOOST_SCALE: "BreadRollius",
    ZIP_BOOST_X_OFFSET: "BreadRollius",
    ZIP_BOOST_Y_OFFSET: "BreadRollius",
    UNSECURED_SOUL_TIMER_SCALE: "Hanturaya",
    UNSECURED_SOUL_TIMER_X_OFFSET: "Hanturaya",
    UNSECURED_SOUL_TIMER_Y_OFFSET: "Hanturaya",
    ENABLE_FULL_KEYBOARD_LAYOUT: "Fascilux",
    KEYBOARD_OVERLAY_SCALE: "Fascilux",
    KEYBOARD_OVERLAY_X_OFFSET: "Fascilux",
    KEYBOARD_OVERLAY_Y_OFFSET: "Fascilux",
    MINIMAL_MINIMAP: "Lightbringer",
    ENABLE_MINIMAP_BUFF_TIMER: "BreadRollius",
    ENABLE_MINIMAP_REJUV_TIMER: "BreadRollius",
    ENABLE_URN_COLORS: "Civo"
};
const SETTING_CREATED_BY_BY_LABEL = {
};
const SECTION_CREATED_BY_BY_TITLE = {
};
const SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG = {
    "ALT_ZOOM_DRAW_OVER_UI": "Draws the minimap over all other UI elements for improved visibility.",
    "BRIDGE_BUFF_START": "Time before the announcement happens in seconds.",
    "DISABLE_QUICK_BUY": "The item buying auto queue system in the shop menu.",
    "DISABLE_SHOP_BLUE": "The world background blur effect behind the shop menu.",
    "ENABLE_AMMO_STATUS": "Visual indicator of your current ammo.",
    "ENABLE_BUFF_HUD": "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.",
    "ENABLE_CENTER_ESC": "Centers ESC menu elements to make them easier to access.",
    "ENABLE_CENTER_FRIENDS_LIST": "Centers friends list area in ESC menu.",
    "ENABLE_LEGACY_COOLDOWNS": "Restores the legacy removed duration bars for abilities.",
    "ENABLE_STATLOCKER": "Adds a STAT button on profile rows that opens Statlocker for that account.",
    "ENABLE_CLEAN_STACKS": "Improve Ability Stacks",
    "ENABLE_COLORED_HEALTHBAR": "Colored healthbar warnings when at significant thresholds.",
    "ENABLE_ENEMY_COLORED_HEALTHBAR": "Colored enemy healthbar warnings when at significant thresholds.",
    "ENABLE_COMPASS_SPEED": "Speed number tracker.",
    "ENABLE_CUMULATIVE_DMG": "The large cumulative damage number.",
    "ENABLE_DAMAGE_FOUNTAIN": "Ragnarok Online damage visuals with improved fancy styling.",
    "ENABLE_FORCE_TESTING_TOOLS": "Forcibly shows testing tools at all times.",
    "ENABLE_FULL_KEYBOARD_LAYOUT": "Shows all of your keybinds.",
    "ENABLE_HERO_SCENE_PANEL": "Shows your character in the shop menu.",
    "ENABLE_HIDE_ABILITY_SUGGESTION": "Highlighted abilities showing you what you should upgrade depending on build.",
    "ENABLE_HIDE_AMMO_ALL": "Current ammo inside of your magazine.",
    "ENABLE_HIDE_BEHAVIOR_SUMMARY": "Menu when you receive a punishment for breaking game rules.",
    "ENABLE_HIDE_COSMETIC_ABILITY": "The cosmetic ability on your default 5 key, like posters and snowballs.",
    "ENABLE_HIDE_FAILED_HINT": "The popup signifying you are too low on stamina to cast another movement input.",
    "ENABLE_HIDE_MAGAZINE": "Total ammo amount.",
    "ENABLE_HIDE_RELOAD_CIRCLE": "The circle countdown for when you are reloading.",
    "ENABLE_HIDE_RELOAD_ICON": "The icon that replaces your crosshair when reloading.",
    "ENABLE_HIDE_SMALL_NUMBERS": "The small incremental damage numbers.",
    "ENABLE_HIDE_TESTING_TOOLS": "Forcibly hides testing tools at all times.",
    "ENABLE_HIDE_TROOPER_DAMAGE": "The damage dealt to Trooper minions.",
    "ENABLE_HUD_SHIFT": "Slight adjustments to the HUD for better streaming output.",
    "ENABLE_LANE_WITH_PARTY": "Automatically selects Lane Preference: With Party for matchmaking.",
    "ENABLE_MINIMAP_BUFF_TIMER": "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.",
    "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE": "Moves the Bridge Buff timer onto the bridge with two smaller centered copies.",
    "ENABLE_MINIMAP_REJUV_TIMER": "Shows a visual indicator in the minimap of when Mid Boss will spawn.",
    "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS": "Moves the Mid Boss timer onto the bridge area of the minimap.",
    "ENABLE_MIN_SOULS": "Shows the individual player souls per minute on scoreboard and the team in the top bar.",
    "ENABLE_MISSING_HERO": "Greys out heros in the top bar when missing on the map.",
    "ENABLE_NICKNAMES": "Shows nicknames of all players in the game within the top bar.",
    "ENABLE_OBJ_DMG": "Shows the individual player's objective damage in the top bar.",
    "ENABLE_OBJ_MAP": "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.",
    "ENABLE_OLD_ITEM_COOLDOWNS": "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.",
    "ENABLE_RED_DIAMOND": "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).",
    "ENABLE_REJUV_HUD": "Shows a visual indicator in the top bar of when Mid Boss will spawn.",
    "ENABLE_SHOP_STATS": "Shows all of your player stats within the shop menu.",
    "ENABLE_SIMPLIFY_ABILITY_ICONS": "Cleans up visuals of abilities significantly to reduce clutter.",
    "ENABLE_SIMPLIFY_COMPASS": "Simplifies the Compass overlay to its bare elements.",
    "ENABLE_SIMPLIFY_ITEMS": "Cleans up visuals of the item bar significantly to reduce clutter.",
    "ENABLE_SIMPLIFY_SHOP": "Cleans up visuals of the shop menu significantly to reduce clutter.",
    "ENABLE_UNSPENT_SOULS": "Shows the individual player's unspent souls in the top bar.",
    "ENABLE_URN_DIFF": "Shows a visual indicator in the top bar of the percentage difference of souls between teams.",
    "ENABLE_URN_COLORS": "Changes urn color to know which side is favored, green for your team, red for the enemy.",
    "ENABLE_ENEMY_V2_ENHANCED": "Enhanced V2 enemy healthbar visuals and readability.",
    "ENABLE_ENEMY_V2_ULT_INDICATOR": "Show the UnitInfo panel on V2 enemy healthbars.",
    "ENABLE_ENEMY_V2_LEVEL": "Show level text on V2 enemy healthbars.",
    "HEALTHBAR_TYPE": "Customized healthbars for better visibility or flair.",
    "PLAYER_HEALTHBAR_SCALE": "Adjust size of the player healthbar.",
    "PLAYER_HEALTHBAR_OPACITY": "Adjust opacity of the player healthbar.",
    "PLAYER_HEALTHBAR_X_OFFSET": "Adjust horizontal position of the player healthbar.",
    "PLAYER_HEALTHBAR_Y_OFFSET": "Adjust vertical position of the player healthbar.",
    "CHAT_SCALE": "Adjust size of the in-game chat.",
    "CHAT_X_OFFSET": "Adjust horizontal position of the in-game chat.",
    "CHAT_Y_OFFSET": "Adjust vertical position of the in-game chat.",
    "ENABLE_CHAT": "Show the in-game chat panel.",
    "HITMARKERS_RUNTIME": "Toggle the hitmarkers when attacking enemies.",
    "MINIMAL_MINIMAP": "Cleans up visuals of the minimap significantly to reduce clutter.",
    "MINIMAP_FLIP": "Rotates the static minimap 180 degrees.",
    "MINIMAP_REMINDER_INTERVAL": "The interval in which the sound plays in seconds.",
    "MINIMAP_ROTATE_WITH_PLAYER": "Makes the minimap rotate with player view, this is just for fun.",
    "OPEN_OLD_ITEM_FILTERS_DOWNLOAD": "Only download the filter file of the filter you want, nothing else.",
    "PREVIEWS_ENABLED": "Realtime Changes",
    "RUNTIME_MINIMAP_CLICK_RADIUS": "The click hitbox of your pings or clicks, this can help make pings more accurate.",
    "RUNTIME_MINIMAP_HERO_ICON_SIZE": "The size of other players on the minimap.",
    "RUNTIME_MINIMAP_ICON_SHRINK": "How much icons will shrink when overlapping with others.",
    "RUNTIME_MINIMAP_PLAYER_ICON_SIZE": "The size of yourself on the minimap.",
    "RUNTIME_MINIMAP_REFRESH_RATE": "How fast the minimap refreshes.",
    "RUNTIME_MINIMAP_SHRINK_DISTANCE": "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.",
    "RUNTIME_MINIMAP_ZIP_THICKNESS": "The thickness of the Zipline lines across the map.",
    "RUNTIME_STATS_SHOWFPS": "Shows raw FPS count.",
    "RUNTIME_STATS_SHOWFRAME": "Shows current frame count, mostly useless.",
    "RUNTIME_STATS_SHOWMEM": "RAM and GPU Memory real time usage statistics.",
    "RUNTIME_STATS_SHOWPOS": "Position and Velocity real time statistics.",
    "RUNTIME_STATS_SHOWTICK": "Shows real time tick information, mostly useless.",
    "SUPPORT_16_10": "Shifts the HUD for better visual support for 16:10 resolutions.",
    "SUPPORT_4_3": "Shifts the HUD for better visual support for 4:3 resolutions.",
    "TAB_ZOOM_DRAW_OVER_UI": "Draws the minimap over all other UI elements for improved visibility.",
};
const SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW = {
    "Audio / Announcer|Voice": "You can download custom announcer packs, just download the correct one for the slot you want to replace.",
    "Audio / Announcer|Type": "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.",
    "Audio / Announcer|Buff Filter": "Choose which bridge buff sound variants can play.",
    "Audio / Announcer|Buff Delay": "Time before the announcement happens in seconds.",
    "Audio / Minimap Reminder|Timer": "The interval in which the sound plays in seconds.",
    "Audio|Announcer": "You can download custom announcer packs, just download the correct one for the slot you want to replace.",
    "Audio|Minimap Reminder": "Play an audio reminder to remember to look at the minimap.",
    "Config / Meta Settings|Preview": "Preview realtime changes to settings when modifying them.",
    "Config / Meta Settings|Language": "The displayed language of the settings menu.",
    "Config / Meta Settings|Default Hero": "The hero you automatically switch to on launch or after saving..",
    "Console / General|Hitmarkers": "Toggle the hitmarkers when attacking enemies.",
    "Console / Minimap|Click Radius": "The click hitbox of your pings or clicks, this can help make pings more accurate.",
    "Console / Minimap|Hero Icon Size": "The size of other players on the minimap.",
    "Console / Minimap|Icon Shrink": "How much icons will shrink when overlapping with others.",
    "Console / Minimap|Player Icon Size": "The size of yourself on the minimap.",
    "Console / Minimap|Refresh Rate": "How fast the minimap refreshes.",
    "Console / Minimap|Shrink Distance": "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.",
    "Console / Minimap|Zip Thickness": "The thickness of the Zipline lines across the map.",
    "Console / Statistics|Show FPS": "Shows raw FPS count.",
    "Console / Statistics|Show Frame": "Shows current frame count, mostly useless.",
    "Console / Statistics|Show Memory": "RAM and GPU Memory real time usage statistics.",
    "Console / Statistics|Show Position": "Position and Velocity real time statistics.",
    "Console / Statistics|Show Tick": "Shows real time tick information, mostly useless.",
    "Crosshair / Ammo|Current": "Current ammo inside of your magazine.",
    "Crosshair / Ammo|Current Size": "Size of your current ammo.",
    "Crosshair / Ammo|Total": "Total ammo amount.",
    "Crosshair / Ammo|Total Size": "Size of your total ammo.",
    "Crosshair / Ammo|Visual": "Visual indicator of your current ammo.",
    "Crosshair / Damage Numbers|Big Numbers": "The large cumulative damage number.",
    "Crosshair / Damage Numbers|Damage Fountain": "Ragnarok Online damage visuals with improved fancy styling.",
    "Crosshair / Damage Numbers|Small Numbers": "The small incremental damage numbers.",
    "Crosshair / Damage Numbers|Trooper Damage": "The damage dealt to Trooper minions.",
    "Crosshair / Item Cooldowns|Optimize Filters": "Only download the filter file of the filter you want, nothing else.",
    "Crosshair / Item Cooldowns|Advanced Mode": "Switch to the advanced item cooldown mode with in-menu filters.",
    "Crosshair / Item Cooldowns|Advanced Filter": "Decide what style of item to display the cooldown of.",
    "Crosshair / Item Target Reticle|Highlight Mode": "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).",
    "Crosshair / Item Target Reticle|Improved Hint": "Cleans up the styling of reticle hints.",
    "Crosshair / Reloading|Circle": "The circle countdown for when you are reloading.",
    "Crosshair / Reloading|Icon": "The icon that replaces your crosshair when reloading.",
    "Crosshair|Combat Status": "Show if you are in combat or not.",
    "Crosshair|Damage Numbers": "Customize the styling of damage numbers.",
    "Crosshair|Item Cooldowns": "Shows item cooldowns near crosshair for easier readability.",
    "Crosshair|Item Target Reticle": "Customize visibility of target reticle when abilities or items visually show on allies and enemies.",
    "Crosshair|Reload Cooldown": "View a cooldown timer for reloading time.",
    "HUD / Bottom Bar|Ability Suggestion": "Highlighted abilities showing you what you should upgrade depending on build.",
    "HUD / Bottom Bar|Cosmetic Ability": "The cosmetic ability on your default 5 key, like posters and snowballs.",
    "HUD / Bottom Bar|Failed Hint": "The popup signifying you are too low on stamina to cast another movement input.",
    "HUD / Bottom Bar|Minimalist Abilities": "Cleans up visuals of abilities significantly to reduce clutter.",
    "HUD / Bottom Bar|Minimalist Item Bar": "Cleans up visuals of the item bar significantly to reduce clutter.",
    "HUD / HUD Controls|16:10 Support": "Shifts the HUD for better visual support for 16:10 resolutions.",
    "HUD / HUD Controls|21:9 Stream Fix": "Slight adjustments to the HUD for better streaming output.",
    "HUD / HUD Controls|4:3 Support": "Shifts the HUD for better visual support for 4:3 resolutions.",
    "HUD / HUD Controls|Behavior Summary": "Menu when you receive a punishment for breaking game rules.",
    "HUD / HUD Controls|Centered ESC Menu": "Centers ESC menu elements to make them easier to access.",
    "HUD / HUD Controls|Statlocker": "Adds a STAT button on profile rows that opens Statlocker for that account.",
    "HUD / HUD Controls|Hide Testing Tools": "Forcibly hides testing tools at all times.",
    "HUD / HUD Controls|Lane with Party": "Automatically selects Lane Preference: With Party for matchmaking.",
    "HUD / HUD Controls|Show Testing Tools": "Forcibly shows testing tools at all times.",
    "UI / UI Controls|16:10 Support": "Shifts the HUD for better visual support for 16:10 resolutions.",
    "UI / UI Controls|21:9 Stream Fix": "Slight adjustments to the HUD for better streaming output.",
    "UI / UI Controls|4:3 Support": "Shifts the HUD for better visual support for 4:3 resolutions.",
    "UI / UI Controls|Behavior Summary": "Menu when you receive a punishment for breaking game rules.",
    "UI / UI Controls|Centered ESC Menu": "Centers ESC menu elements to make them easier to access.",
    "UI / UI Controls|Centered Friends List": "Centers the friends list area within the ESC menu.",
    "UI / UI Controls|Statlocker": "Adds a STAT button on profile rows that opens Statlocker for that account.",
    "UI / UI Controls|Hide Testing Tools": "Forcibly hides testing tools at all times.",
    "UI / UI Controls|Lane with Party": "Automatically selects Lane Preference: With Party for matchmaking.",
    "UI / UI Controls|Show Testing Tools": "Forcibly shows testing tools at all times.",
    "HUD|Chat": "Adjust the in-game chat position and scale.",
    "UI|Chat": "Adjust the in-game chat position and scale.",
    "HUD / Shop|Blur": "The world background blur effect behind the shop menu.",
    "HUD / Shop|Hero": "Shows your character in the shop menu.",
    "HUD / Shop|Minimalist": "Cleans up visuals of the shop menu significantly to reduce clutter.",
    "HUD / Shop|Quick Buy": "The item buying auto queue system in the shop menu.",
    "HUD / Shop|Stats": "Shows all of your player stats within the shop menu.",
    "HUD / Top Bar|Bridge Buff Timer": "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.",
    "HUD / Top Bar|Mid Boss Timer": "Shows a visual indicator in the top bar of when Mid Boss will spawn.",
    "HUD / Top Bar|Missing Hero Opaque": "Greys out heros in the top bar when missing on the map.",
    "HUD / Top Bar|Nicknames": "Shows nicknames of all players in the game within the top bar.",
    "HUD / Top Bar|Objective Damage": "Shows the individual player's objective damage in the top bar.",
    "HUD / Top Bar|Objective Map": "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.",
    "HUD / Top Bar|Souls Per Minute": "Shows the individual player souls per minute on scoreboard and the team in the top bar.",
    "HUD / Top Bar|Unspent Souls": "Shows the individual player's unspent souls in the top bar.",
    "HUD / Top Bar|Urn Difference": "Shows a visual indicator in the top bar of the percentage difference of souls between teams.",
    "HUD|Damage Report": "Customize the visuals of the incoming damage panel.",
    "Healthbar / Player|Color Warning": "Colored healthbar warnings when at significant thresholds.",
    "Healthbar / Player|Type": "Customized healthbars for better visibility or flair.",
    "Healthbar / Player|Horizontal Offset": "Adjust horizontal position of the player healthbar.",
    "Healthbar / Player|Vertical Offset": "Adjust vertical position of the player healthbar.",
    "Healthbar / Enemy|Colored Health": "Colored enemy healthbar warnings when at significant thresholds.",
    "Healthbar / Enemy|Ult Indicator": "Show the ultimate indicator for V1 healthbars.",
    "Healthbar / Enemy V2|Enhanced": "Enhanced V2 enemy healthbar visuals and readability.",
    "Healthbar / Enemy V2|Ult Indicator": "Show the UnitInfo panel on V2 enemy healthbars.",
    "Healthbar / Enemy V2|Level": "Show level text on V2 enemy healthbars.",
    "Healthbar|Enemy": "Enemy healthbar enhancements.",
    "Healthbar|Enemy V2": "V2 enemy healthbar enhancements.",
    "Minimap / Alt Zoom|Draw Over UI": "Draws the minimap over all other UI elements for improved visibility.",
    "Minimap / Minimap|Bridge Buff Timer": "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.",
    "Minimap / Minimap / Bridge Buff Timer|On Bridge": "Moves the Bridge Buff timer onto the bridge with two smaller centered copies.",
    "Minimap / Minimap|Flip": "Rotates the static minimap 180 degrees.",
    "Minimap / Minimap|Mid Boss Timer": "Shows a visual indicator in the minimap of when Mid Boss will spawn.",
    "Minimap / Minimap / Mid Boss Timer|On Mid": "Moves the Mid Boss timer onto the bridge area of the minimap.",
    "Minimap / Minimap|Minimalist": "Cleans up visuals of the minimap significantly to reduce clutter.",
    "Minimap / Minimap|Minimalist Opacity": "Opacity of the background of Minimalist Minimap.",
    "Minimap / Minimap|Spinny Mode": "Makes the minimap rotate with player view, this is just for fun.",
    "Minimap / Minimap|Urn Colors": "Changes urn color to know which side is favored, green for your team, red for the enemy.",
    "Minimap / Tab Zoom|Draw Over UI": "Draws the minimap over all other UI elements for improved visibility.",
    "Minimap|Alt Zoom": "View an enhanced minimap on opening ability menu.",
    "Minimap|Tab Zoom": "View an enhanced minimap on opening scoreboard menu.",
    "Overlay / Compass|Minimalist": "Simplifies the Compass overlay to its bare elements.",
    "Overlay / Compass|Speed": "Speed number tracker.",
    "Overlay / Compass|Horizontal Stretch": "Stretch the compass horizontally.",
    "Overlay / Compass|Vertical Stretch": "Stretch the compass vertically.",
    "Overlay / Keyboard|Full Keys": "Shows all of your keybinds.",
    "Overlay|Compass": "See your view angle and speed.",
    "Overlay|Enable Clean Stacks": "Improve Ability Stacks",
    "Overlay|Keyboard": "Real time key input visual.",
    "Overlay|Ult Cooldowns": "View the cooldown time of player ultimates.",
    "Overlay|Unsecured Plus": "Customize unsecured souls visuals.",
    "Overlay / Unsecured Plus|Icon": "The small visual icon.",
    "Overlay / Unsecured Plus|Text": "The unsecured text.",
    "Overlay|Unsecured Timer": "Show the estimated time for unsecured souls to dissapear.",
    "Overlay|Zipline Boost": "An always visible zipline boost overlay.",
};
const SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE = {
    "Audio|Announcer": "You can download custom announcer packs, just download the correct one for the slot you want to replace.",
    "Audio|Minimap Reminder": "Play an audio reminder to remember to look at the minimap.",
    "Crosshair|Combat Status": "Show if you are in combat or not.",
    "Crosshair|Damage Numbers": "Customize the styling of damage numbers.",
    "Crosshair|Item Cooldowns": "Shows item cooldowns near crosshair for easier readability.",
    "Crosshair|Item Target Reticle": "Customize visibility of target reticle when abilities or items visually show on allies and enemies.",
    "Crosshair|Reload Cooldown": "View a cooldown timer for reloading time.",
    "HUD|Damage Report": "Customize the visuals of the incoming damage panel.",
    "UI|Damage Report": "Customize the visuals of the incoming damage panel.",
    "Healthbar|Enemy": "Enemy healthbar enhancements.",
    "Healthbar|Enemy V2": "V2 enemy healthbar enhancements.",
    "Minimap|Alt Zoom": "View an enhanced minimap on opening ability menu.",
    "Minimap|Tab Zoom": "View an enhanced minimap on opening scoreboard menu.",
    "Overlay|Compass": "See your view angle and speed.",
    "Overlay|Enable Clean Stacks": "Improve Ability Stacks",
    "Overlay|Keyboard": "Real time key input visual.",
    "Overlay|Ult Cooldowns": "View the cooldown time of player ultimates.",
    "Overlay|Unsecured Plus": "Customize unsecured souls visuals.",
    "Overlay|Unsecured Timer": "Show the estimated time for unsecured souls to dissapear.",
    "Overlay|Zipline Boost": "An always visible zipline boost overlay.",
};
const SETTING_PERF_IMPACT_TIERS = {
    ALT_ZOOM_DRAW_OVER_UI: "low",
    ALT_ZOOM_OPACITY: "low",
    AMMO_CURRENT_SCALE: "low",
    AMMO_PANEL_X_OFFSET: "low",
    AMMO_PANEL_Y_OFFSET: "low",
    AMMO_TOTAL_SCALE: "low",
    BRIDGE_BUFF_START: "none",
    COMBAT_STATUS_SCALE: "low",
    COMBAT_STATUS_X_OFFSET: "low",
    COMBAT_STATUS_Y_OFFSET: "low",
    COMPASS_SCALE: "medium",
    COMPASS_STRETCH_X: "medium",
    COMPASS_STRETCH_Y: "medium",
    COMPASS_X_OFFSET: "medium",
    COMPASS_Y_OFFSET: "medium",
    DAMAGE_NUMBER_OPACITY: "low",
    DAMAGE_REPORT_X_OFFSET: "low",
    DAMAGE_REPORT_Y_OFFSET: "low",
    DEFAULT_HERO: "none",
    DISABLE_DAMAGE_REPORT: "low",
    DISABLE_QUICK_BUY: "none",
    DISABLE_SHOP_BLUE: "none",
    ENABLE_ALT_ZOOM: "low",
    ENABLE_AMMO_STATUS: "low",
    ENABLE_BETTER_UNSECURED: "low",
    ENABLE_BETTER_UNSECURED_SHOW_ICON: "low",
    ENABLE_BETTER_UNSECURED_SHOW_TEXT: "low",
    ENABLE_BUFF_HUD: "low",
    ENABLE_CENTER_ESC: "none",
    ENABLE_CENTER_FRIENDS_LIST: "none",
    ENABLE_LEGACY_COOLDOWNS: "low",
    ENABLE_STATLOCKER: "none",
    ENABLE_CLEAN_STACKS: "none",
    ENABLE_COLORED_HEALTHBAR: "medium",
    ENABLE_COLOR_WARNING_25: "medium",
    ENABLE_COLOR_WARNING_65: "medium",
    ENABLE_COLOR_WARNING_75: "medium",
    ENABLE_COMBAT_STATUS: "low",
    ENABLE_COMPASS: "medium",
    ENABLE_COMPASS_SPEED: "medium",
    ENABLE_CUMULATIVE_DMG: "low",
    ENABLE_DAMAGE_FOUNTAIN: "low",
    ENABLE_ENEMY_COLORED_HEALTHBAR: "medium",
    ENABLE_ENEMY_COLOR_WARNING_25: "medium",
    ENABLE_ENEMY_COLOR_WARNING_65: "medium",
    ENABLE_ENEMY_COLOR_WARNING_75: "medium",
    ENABLE_ENEMY_V2_ENHANCED: "medium",
    ENABLE_ENEMY_V2_ULT_INDICATOR: "low",
    ENABLE_ENEMY_V2_LEVEL: "low",
    ENABLE_ENEMY_ULT_INDICATOR: "medium",
    ENABLE_FORCE_TESTING_TOOLS: "none",
    ENABLE_FULL_KEYBOARD_LAYOUT: "medium",
    ENABLE_HERO_SCENE_PANEL: "none",
    ENABLE_HIDE_ABILITY_SUGGESTION: "none",
    ENABLE_HIDE_AMMO_ALL: "low",
    ENABLE_HIDE_BEHAVIOR_SUMMARY: "none",
    ENABLE_HIDE_COSMETIC_ABILITY: "none",
    ENABLE_HIDE_FAILED_HINT: "none",
    ENABLE_HIDE_MAGAZINE: "low",
    ENABLE_HIDE_RELOAD_CIRCLE: "none",
    ENABLE_HIDE_RELOAD_ICON: "none",
    ENABLE_HIDE_SMALL_NUMBERS: "none",
    ENABLE_HIDE_TESTING_TOOLS: "none",
    ENABLE_HIDE_TROOPER_DAMAGE: "none",
    ENABLE_GAME_AUDIO: "none",
    ENABLE_HUD_SHIFT: "none",
    ENABLE_IMPROVED_HINT: "low",
    ENABLE_INTERVAL: "low",
    ENABLE_KEYBOARD_OVERLAY: "medium",
    ENABLE_LANE_WITH_PARTY: "low",
    ENABLE_MINIMAP_BUFF_TIMER: "low",
    ENABLE_MINIMAP_REJUV_TIMER: "low",
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: "low",
    ENABLE_MINIMAP_REMINDER: "low",
    ENABLE_MIN_SOULS: "medium",
    ENABLE_MISSING_HERO: "low",
    ENABLE_NICKNAMES: "medium",
    ENABLE_OBJ_DMG: "medium",
    ENABLE_OBJ_MAP: "low",
    ENABLE_OLD_ITEM_COOLDOWNS: "high",
    ENABLE_ONE_TIME_TIER1: "low",
    ENABLE_ONE_TIME_TIER2: "low",
    ENABLE_ONE_TIME_TIER3: "low",
    ENABLE_PASSIVE_COOLDOWN: "low",
    ENABLE_RED_DIAMOND: "medium",
    ENABLE_REJUV_HUD: "low",
    ENABLE_RELOAD_COOLDOWN: "medium",
    ENABLE_SHOP_STATS: "low",
    ENABLE_SIMPLIFY_ABILITY_ICONS: "none",
    ENABLE_SIMPLIFY_COMPASS: "medium",
    ENABLE_SIMPLIFY_ITEMS: "none",
    ENABLE_SIMPLIFY_SHOP: "none",
    ENABLE_TAB_ZOOM: "low",
    ENABLE_ULT_COOLDOWNS: "high",
    ENABLE_UNSECURED_SOUL_TIMER: "medium",
    ENABLE_UNSPENT_SOULS: "medium",
    ENABLE_URN_DIFF: "low",
    ENABLE_URN_COLORS: "low",
    ENABLE_ZIP_BOOST: "low",
    HEALTHBAR_TYPE: "medium",
    PLAYER_HEALTHBAR_SCALE: "low",
    PLAYER_HEALTHBAR_OPACITY: "low",
    PLAYER_HEALTHBAR_X_OFFSET: "low",
    PLAYER_HEALTHBAR_Y_OFFSET: "low",
    CHAT_SCALE: "low",
    CHAT_X_OFFSET: "low",
    CHAT_Y_OFFSET: "low",
    ENABLE_CHAT: "none",
    HITMARKERS_RUNTIME: "none",
    HUD_INDICATOR_SIZE: "low",
    ITEM_FILTER_DEF_ACTIVE: "medium",
    ITEM_FILTER_DEF_PASSIVE: "medium",
    ITEM_FILTER_OFF_ACTIVE: "medium",
    ITEM_FILTER_OFF_PASSIVE: "medium",
    KEYBOARD_OVERLAY_SCALE: "medium",
    KEYBOARD_OVERLAY_X_OFFSET: "medium",
    KEYBOARD_OVERLAY_Y_OFFSET: "medium",
    LANGUAGE: "none",
    MINIMAL_MINIMAP: "low",
    MINIMAL_MINIMAP_OPACITY: "low",
    MINIMAP_BASE_OPACITY: "low",
    MINIMAP_FLIP: "low",
    MINIMAP_LARGE_SIZE_ALT: "low",
    MINIMAP_LARGE_SIZE_TAB: "low",
    MINIMAP_REMINDER_INTERVAL: "low",
    MINIMAP_ROTATE_WITH_PLAYER: "medium",
    MINIMAP_SMALL_SIZE: "low",
    MINIMAP_X_OFFSET: "low",
    MINIMAP_Y_OFFSET: "low",
    OPEN_AIM_TRAINER: "none",
    OPEN_BLACKJACK: "none",
    OPEN_FLAPPY_BIRD: "none",
    OPEN_MINESWEEPER: "none",
    OPEN_OLD_ITEM_FILTERS_DOWNLOAD: "none",
    OPEN_TRAIN_TRACKING: "none",
    OPEN_WHACK_A_REM: "none",
    GAME_DEFAULT_DIFFICULTY: "none",
    PASSIVE_COOLDOWN_OPACITY: "low",
    PASSIVE_COOLDOWN_SIZE: "low",
    PASSIVE_COOLDOWN_X: "low",
    PASSIVE_COOLDOWN_Y: "low",
    PREVIEWS_ENABLED: "none",
    RELOAD_COOLDOWN_OPACITY: "medium",
    RELOAD_COOLDOWN_SIZE: "medium",
    RELOAD_COOLDOWN_X_OFFSET: "medium",
    RELOAD_COOLDOWN_Y_OFFSET: "medium",
    RUNTIME_MINIMAP_CLICK_RADIUS: "none",
    RUNTIME_MINIMAP_HERO_ICON_SIZE: "none",
    RUNTIME_MINIMAP_ICON_SHRINK: "none",
    RUNTIME_MINIMAP_PLAYER_ICON_SIZE: "none",
    RUNTIME_MINIMAP_REFRESH_RATE: "none",
    RUNTIME_MINIMAP_SHRINK_DISTANCE: "none",
    RUNTIME_MINIMAP_ZIP_THICKNESS: "none",
    RUNTIME_STATS_SHOWFPS: "none",
    RUNTIME_STATS_SHOWFRAME: "none",
    RUNTIME_STATS_SHOWMEM: "none",
    RUNTIME_STATS_SHOWPOS: "none",
    RUNTIME_STATS_SHOWTICK: "none",
    SHOP_OFFSET_X: "low",
    SUPPORT_16_10: "none",
    SUPPORT_4_3: "none",
    TAB_ZOOM_DRAW_OVER_UI: "low",
    TAB_ZOOM_OPACITY: "low",
    ULT_COOLDOWN_OPACITY: "high",
    ULT_COOLDOWN_SIZE: "high",
    UNIT_TARGET_OPACITY: "medium",
    UNIT_TARGET_SIZE: "medium",
    UNSECURED_SOULS_HUD_SCALE: "low",
    UNSECURED_SOULS_HUD_X_OFFSET: "low",
    UNSECURED_SOULS_HUD_Y_OFFSET: "low",
    UNSECURED_SOUL_TIMER_SCALE: "medium",
    UNSECURED_SOUL_TIMER_X_OFFSET: "medium",
    UNSECURED_SOUL_TIMER_Y_OFFSET: "medium",
    VOICE_TYPE: "none",
    VOICE_VOLUME: "none",
    ZIP_BOOST_SCALE: "low",
    ZIP_BOOST_X_OFFSET: "low",
    ZIP_BOOST_Y_OFFSET: "low",
    ZOOM_X_OFFSET_ALT: "low",
    ZOOM_X_OFFSET_TAB: "low",
    ZOOM_Y_OFFSET_ALT: "low",
    ZOOM_Y_OFFSET_TAB: "low",
};
const HEALTHBAR_TYPE_DROPDOWN_OPTIONS = [
    { label: "Default", value: 0 },
    { label: "Minimalist", value: 1 },
    { label: "Fighting Game", value: 2 },
    { label: "Klutz's Bar", value: 3 },
    { label: "Budhud", value: 4 }
];
const COLOR_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_COLOR_WARNING_25" },
    { label: "65%", key: "ENABLE_COLOR_WARNING_65" },
    { label: "75%", key: "ENABLE_COLOR_WARNING_75" }
];
const ENEMY_COLOR_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_ENEMY_COLOR_WARNING_25" },
    { label: "65%", key: "ENABLE_ENEMY_COLOR_WARNING_65" },
    { label: "75%", key: "ENABLE_ENEMY_COLOR_WARNING_75" }
];
const NEUTRAL_CAMP_TIER_OPTIONS = [
    { label: "Tier 1", key: "ENABLE_ONE_TIME_TIER1" },
    { label: "Tier 2", key: "ENABLE_ONE_TIME_TIER2" },
    { label: "Tier 3", key: "ENABLE_ONE_TIME_TIER3" },
    { label: "Buff", key: "ENABLE_INTERVAL" }
];
const BRIDGE_BUFF_FILTER_OPTIONS = [
    { label: "1st", key: "ENABLE_BUFF_SOUND_1" },
    { label: "2nd", key: "ENABLE_BUFF_SOUND_2" },
    { label: "3rd", key: "ENABLE_BUFF_SOUND_3" }
];
const DEFAULT_HERO_OPTIONS = [
    "hero_inferno",
    "hero_gigawatt",
    "hero_hornet",
    "hero_ghost",
    "hero_atlas",
    "hero_wraith",
    "hero_forge",
    "hero_chrono",
    "hero_dynamo",
    "hero_kelvin",
    "hero_haze",
    "hero_astro",
    "hero_bebop",
    "hero_nano",
    "hero_orion",
    "hero_krill",
    "hero_shiv",
    "hero_tengu",
    "hero_warden",
    "hero_yamato",
    "hero_lash",
    "hero_viscous",
    "hero_synth",
    "hero_mirage",
    "hero_viper",
    "hero_magician",
    "hero_vampirebat",
    "hero_drifter",
    "hero_priest",
    "hero_frank",
    "hero_bookworm",
    "hero_doorman",
    "hero_punkgoat",
    "hero_necro",
    "hero_fencer",
    "hero_familiar",
    "hero_werewolf",
    "hero_unicorn"
];
const DEFAULT_HERO_DISPLAY_NAMES = {
    hero_inferno: "Infernus",
    hero_gigawatt: "Seven",
    hero_hornet: "Vindicta",
    hero_ghost: "Lady Geist",
    hero_atlas: "Abrams",
    hero_wraith: "Wraith",
    hero_forge: "McGinnis",
    hero_chrono: "Paradox",
    hero_dynamo: "Dynamo",
    hero_kelvin: "Kelvin",
    hero_haze: "Haze",
    hero_astro: "Holliday",
    hero_bebop: "Bebop",
    hero_nano: "Calico",
    hero_orion: "Grey Talon",
    hero_krill: "Mo & Krill",
    hero_shiv: "Shiv",
    hero_tengu: "Ivy",
    hero_warden: "Warden",
    hero_yamato: "Yamato",
    hero_lash: "Lash",
    hero_viscous: "Viscous",
    hero_synth: "Pocket",
    hero_mirage: "Mirage",
    hero_viper: "Vyper",
    hero_magician: "Sinclair",
    hero_vampirebat: "Mina",
    hero_drifter: "Drifter",
    hero_priest: "Venator",
    hero_frank: "Victor",
    hero_bookworm: "Paige",
    hero_doorman: "Doorman",
    hero_punkgoat: "Billy",
    hero_necro: "Graves",
    hero_fencer: "Apollo",
    hero_familiar: "Rem",
    hero_werewolf: "Silver",
    hero_unicorn: "Celeste"
};
const DEFAULT_HERO_DROPDOWN_OPTIONS = DEFAULT_HERO_OPTIONS.map(function(heroId) {
    return { label: DEFAULT_HERO_DISPLAY_NAMES[heroId] || heroId, value: heroId };
}).sort(function(a, b) {
    var labelA = String(a && a.label ? a.label : "").toLowerCase();
    var labelB = String(b && b.label ? b.label : "").toLowerCase();
    if (labelA < labelB) return -1;
    if (labelA > labelB) return 1;
    return 0;
});
function GetDefaultHeroIconPath(heroId) {
    var normalizedHeroId = String(heroId || "");
    var heroAlias = normalizedHeroId.indexOf("hero_") === 0 ? normalizedHeroId.substring(5) : normalizedHeroId;
    if (!heroAlias) heroAlias = "werewolf";
    var heroIconAliasMap = {
        viper: "kali",
        krill: "digger",
        forge: "engineer",
        ghost: "spectre",
        orion: "archer",
        atlas: "bull",
        dynamo: "sumo"
    };
    if (heroIconAliasMap.hasOwnProperty(heroAlias)) {
        heroAlias = heroIconAliasMap[heroAlias];
    }
    return "s2r://panorama/images/heroes/" + heroAlias + "_mm_psd.vtex";
}
function GetLanguageIconPath(languageValue) {
    var normalizedValue = String(languageValue === undefined || languageValue === null ? "" : languageValue);
    var languageIconName = "english";
    if (normalizedValue === String(SETTINGS_LANGUAGE_RUSSIAN)) {
        languageIconName = "russian";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_CHINESE)) {
        languageIconName = "chinese";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_FRENCH)) {
        languageIconName = "french";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_PORTUGUESE)) {
        languageIconName = "portuguese";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE)) {
        languageIconName = "brazil";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_SPANISH)) {
        languageIconName = "spanish";
    }
    return "s2r://panorama/images/qollock/" + languageIconName + ".vtex";
}
const COMPACT_DEFAULT_HERO_FIELD = "DEFAULT_HERO_INDEX";

const PRESETS = (typeof QOL_PRESETS === "object" && QOL_PRESETS)
    ? QOL_PRESETS
    : {};

const STORAGE_KEY = "Deadlock_Mod_Settings_v1";
const RUNTIME_PRESET_ATTR = "QOL_RUNTIME_PRESET";
const USER_EDIT_REV_ATTR = "QOL_USER_EDIT_REV";
const BUILD_SAVE_UI_TEMP_DISABLED = true;
const BUILD_SAVE_REQUEST_ATTR = "QOL_BUILD_SAVE_REQUEST";
const BUILD_SAVE_STATE_ATTR = "QOL_BUILD_SAVE_STATE";
const BUILD_SAVE_MSG_ATTR = "QOL_BUILD_SAVE_MSG";
const BUILD_SAVE_TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";
const BUILD_CLEAR_REQUEST_ATTR = "QOL_BUILD_CLEAR_REQUEST";
const BUILD_CLEAR_STATE_ATTR = "QOL_BUILD_CLEAR_STATE";
const BUILD_CLEAR_MSG_ATTR = "QOL_BUILD_CLEAR_MSG";
const BUILD_CLEAR_TOKEN_ATTR = "QOL_BUILD_CLEAR_TOKEN";
const ON_DEATH_ARCADE_REQUEST_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST";
const ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST_TOKEN";
const ON_DEATH_ARCADE_ACTIVE_ATTR = "QOL_ON_DEATH_ARCADE_ACTIVE";
const HERO_HINT_ATTR = "QOL_LAST_SELECTED_HERO_HINT";
const SETTING_ROW_RESET_KEYS_ATTR = "QOL_ROW_RESET_KEYS";
const RUNTIME_ROW_KIND_ATTR = "QOL_RUNTIME_ROW_KIND";
const RUNTIME_ROW_KEY_ATTR = "QOL_RUNTIME_ROW_KEY";
const MOD_VERSION = 30;
const MOD_DISPLAY_VERSION = (typeof QOL_SCHEMA_SEMVER === "string" && QOL_SCHEMA_SEMVER.length > 0)
    ? QOL_SCHEMA_SEMVER
    : "2.3.1";
const EXPORT_SCHEMA_SEMVER = MOD_DISPLAY_VERSION;
const COMPACT_WIRE_VERSION_2_0_0 = 1;
const COMPACT_WIRE_VERSION_2_0_1 = 2;
const EXPORT_SCHEMA_WIRE_VERSION = (String(EXPORT_SCHEMA_SEMVER || "") === "2.0.0")
    ? COMPACT_WIRE_VERSION_2_0_0
    : COMPACT_WIRE_VERSION_2_0_1;
const EXPORT_SCHEMA_TOKEN_VERSION = String(EXPORT_SCHEMA_SEMVER || "").replace(/\./g, "-");
const EXPORT_PREFIX = "[QOL-" + EXPORT_SCHEMA_TOKEN_VERSION + "]:";
const EXPORT_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
var currentTab = "Support";
var gCurrentSettingsSectionTitle = "";
var currentSearchQuery = "";
var gSearchCollectMode = false;
var gSearchCollectState = null;
var gSearchResultRenderMode = false;
var gSearchSectionIndexCacheKey = "";
var gSearchSectionIndexCache = null;
var gConfigDiffLabelCacheKey = "";
var gConfigDiffLabelMap = null;
var gSettingsOpenGuardUntilMs = 0;
var gSettingsToggleDebounceUntilMs = 0;
var gMinimapSizePreviewPanel = null;
var gMinimapSizePreviewCircle = null;
var gMinimapSizePreviewLabel = null;
var gMinimapSizePreviewHideToken = 0;
var gMinimapPreviewBaseRight = 30;
var gMinimapPreviewBaseBottom = 30;
var gZoomMinimapPreviewPanel = null;
var gZoomMinimapPreviewCircle = null;
var gZoomMinimapPreviewLabel = null;
var gZoomMinimapPreviewHideToken = 0;
var gZoomPreviewBaseX = 0;
var gZoomPreviewBaseY = 0;
var gZoomPreviewMode = "ALT";
var gZipBoostPreviewPanel = null;
var gZipBoostPreviewBox = null;
var gZipBoostPreviewLabel = null;
var gZipBoostPreviewHideToken = 0;
var gZipBoostPreviewBaseX = -520;
var gZipBoostPreviewBaseY = 20;
var gUnsecuredSoulsPreviewPanel = null;
var gUnsecuredSoulsPreviewLabel = null;
var gUnsecuredSoulsPreviewHideToken = 0;
var gUnsecuredSoulsPreviewBaseX = -520;
var gUnsecuredSoulsPreviewBaseY = 110;
var gCompassPreviewPanel = null;
var gCompassPreviewBox = null;
var gCompassPreviewLabel = null;
var gCompassPreviewHideToken = 0;
var gCompassPreviewBaseX = 0;
var gCompassPreviewBaseY = 120;
var gKeyboardOverlayPreviewPanel = null;
var gKeyboardOverlayPreviewBox = null;
var gKeyboardOverlayPreviewLabel = null;
var gKeyboardOverlayPreviewHideToken = 0;
var gKeyboardOverlayPreviewBaseX = 150;
var gKeyboardOverlayPreviewBaseY = 300;
var gItemCooldownPreviewPanel = null;
var gItemCooldownPreviewRow = null;
var gItemCooldownPreviewIcon = null;
var gItemCooldownPreviewLabel = null;
var gItemCooldownPreviewHideToken = 0;
var gAmmoPreviewPanel = null;
var gAmmoPreviewCurrentLabel = null;
var gAmmoPreviewTotalLabel = null;
var gAmmoPreviewHideToken = 0;
var gReloadCooldownPreviewPanel = null;
var gReloadCooldownPreviewRing = null;
var gReloadCooldownPreviewLabel = null;
var gReloadCooldownPreviewHideToken = 0;
var gUnitTargetPreviewPanel = null;
var gUnitTargetPreviewImage = null;
var gUnitTargetPreviewBinding = null;
var gUnitTargetPreviewHideToken = 0;
var gDamageReportPreviewPanel = null;
var gDamageReportPreviewBox = null;
var gDamageReportPreviewLabel = null;
var gDamageReportPreviewHideToken = 0;
var gShopPreviewPanel = null;
var gShopPreviewBox = null;
var gShopPreviewLabel = null;
var gShopPreviewHideToken = 0;
var gUltCooldownPreviewPanel = null;
var gUltCooldownPreviewRow = null;
var gUltCooldownPreviewHideToken = 0;
var gUnsecuredPlusPreviewPanel = null;
var gUnsecuredPlusPreviewIcon = null;
var gUnsecuredPlusPreviewText = null;
var gUnsecuredPlusPreviewValue = null;
var gUnsecuredPlusPreviewHideToken = 0;
var gRuntimeToggleState = {};
var gRuntimeSliderState = {};
var gRuntimeButtonGroupConfig = {};
var gRuntimeButtonGroupRefreshers = {};
var gRuntimeSliderResetters = {};
var gMinesweeperState = null;
var gMinesweeperTimerToken = 0;
var g2048State = null;
var gFlappyState = null;
var gFlappyLoopToken = 0;
var gAimTrainerState = null;
var gAimTrainerLoopToken = 0;
var gTrainTrackingState = null;
var gTrainTrackingLoopToken = 0;
var gWhackRemState = null;
var gWhackRemLoopToken = 0;
var gArcadeSoundLastIndexByKey = {};
var gBilliardsState = null;
var gBilliardsLoopToken = 0;
var gBlackjackState = null;
var gOnDeathArcadeBridgePollToken = 0;
var gOnDeathArcadeBridgePollRunning = false;
var gOnDeathArcadeLastRequestToken = "";
var gOnDeathArcadeSessionActive = false;
var gArcadeOnDeathSyncFns = [];
var gSettingsUiBuilt = false;
var gUserEditRevision = 0;
var gMissingRuSettingsStrings = {};
var gConfigFeedbackLabel = null;
var gConfigFeedbackClearToken = 0;
var gSettingsListRefreshToken = 0;
var gSettingsListRefreshForcePending = false;
var gSettingsListLastRenderSig = "";
var gSettingsListRowSyncFns = [];
var gSettingsListRowSyncFnsBySig = {};
var gSettingsListActiveRenderSig = "";
var gSettingsListContentPanelBySig = {};
var gSettingsListSoftRefreshToken = 0;
var gSettingsListSearchModeActive = false;
var gSettingsTransitionWatchToken = 0;
var gSettingsTransitionWatchRunning = false;
var gSettingsOpenedInHideout = false;
var gSettingsTransitionCloseCooldownUntilMs = 0;
const SETTINGS_LIST_REFRESH_DEBOUNCE_SEC = 0.06;
const SETTINGS_TRANSITION_WATCH_INTERVAL_SEC = 0.25;
const SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS = 1000;
const SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC = [0.0, 0.2, 0.6];

const SETTINGS_LANGUAGE_ENGLISH = 0;
const SETTINGS_LANGUAGE_RUSSIAN = 1;
const SETTINGS_LANGUAGE_CHINESE = 2;
const SETTINGS_LANGUAGE_FRENCH = 3;
const SETTINGS_LANGUAGE_PORTUGUESE = 4;
const SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE = 5;
const SETTINGS_LANGUAGE_SPANISH = 6;
const SETTINGS_RU_TEXT = {
    "Config": "\u041a\u043e\u043d\u0444\u0438\u0433",
    "Presets": "\u041f\u0440\u0435\u0441\u0435\u0442\u044b",
    "Crosshair": "\u041f\u0440\u0438\u0446\u0435\u043b",
    "HUD": "HUD",
    "UI": "UI",
    "Overlay": "\u041e\u0432\u0435\u0440\u043b\u0435\u0439",
    "Minimap": "\u041c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0430",
    "Audio": "\u0410\u0443\u0434\u0438\u043e",
    "Console": "\u041a\u043e\u043d\u0441\u043e\u043b\u044c",
    "General": "\u041e\u0431\u0449\u0435\u0435",
    "Discord": "Discord",
    "Support": "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430",
    "Meta Settings": "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043c\u043e\u0434\u0430",
    "Preview": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f",
    "Drag": "\u041f\u0435\u0440\u0435\u0442\u0430\u0441\u043a\u0438\u0432\u0430\u043d\u0438\u0435",
    "Language": "\u042f\u0437\u044b\u043a",
    "Default Hero": "\u0413\u0435\u0440\u043e\u0439 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e",
    "English": "\u0410\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u0438\u0439",
    "French": "\u0424\u0440\u0430\u043d\u0446\u0443\u0437\u0441\u043a\u0438\u0439",
    "Settings UI Language": "\u042f\u0437\u044b\u043a \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430",
    "Hero on Load or Save": "\u0413\u0435\u0440\u043e\u0439 \u0434\u043b\u044f \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0438\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f",
    "Realtime Settings Changes": "\u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439 \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445",
    "Realtime Changes": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438",
    "Draggable UI": "\u043f\u0435\u0440\u0435\u0442\u0430\u0441\u043a\u0438\u0432\u0430\u0435\u043c\u044b\u0439 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441",
    "Enable": "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c",
    "Export Settings": "\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a",
    "Import Settings": "\u0418\u043c\u043f\u043e\u0440\u0442 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a",
    "Export String": "\u0421\u0442\u0440\u043e\u043a\u0430 \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0430",
    "Import String": "\u0421\u0442\u0440\u043e\u043a\u0430 \u0438\u043c\u043f\u043e\u0440\u0442\u0430",
    "How to Save Settings": "\u041a\u0430\u043a \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438",
    "Share your settings string": "\u041f\u043e\u0434\u0435\u043b\u0438\u0442\u044c\u0441\u044f \u0441\u0442\u0440\u043e\u043a\u043e\u0439 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a",
    "Paste and apply an exported settings string": "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0438 \u043f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u0443\u044e \u0441\u0442\u0440\u043e\u043a\u0443",
    "Search Results": "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b \u043f\u043e\u0438\u0441\u043a\u0430",
    "No results found": "\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e",
    "Better Item Cooldowns": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u044b\u0435 \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Item Cooldowns": "\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Tracked cooldowns near crosshair": "\u041e\u0442\u0441\u043b\u0435\u0436\u0438\u0432\u0430\u0435\u043c\u044b\u0435 \u043a\u0443\u043b\u0434\u0430\u0443\u043d\u044b \u0443 \u043f\u0440\u0438\u0446\u0435\u043b\u0430",
    "Light Item Cooldowns": "\u041b\u0435\u0433\u043a\u0438\u0435 \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Advanced Mode": "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c",
    "Optimize Filters": "\u0424\u0438\u043b\u044c\u0442\u0440\u044b \u043e\u043f\u0442\u0438\u043c\u0438\u0437\u0430\u0446\u0438\u0438",
    "No filter settings but better FPS.": "\u0411\u0435\u0437 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a \u0444\u0438\u043b\u044c\u0442\u0440\u043e\u0432, \u043d\u043e \u0441 \u0431\u043e\u043b\u0435\u0435 \u0445\u043e\u0440\u043e\u0448\u0438\u043c FPS",
    "Filters": "\u0424\u0438\u043b\u044c\u0442\u0440\u044b",
    "Get Filter File Only": "\u0412\u0437\u044f\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u0444\u0430\u0439\u043b \u0444\u0438\u043b\u044c\u0442\u0440\u0430",
    "Download": "\u0421\u043a\u0430\u0447\u0430\u0442\u044c",
    "Advanced Filter": "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u043d\u044b\u0439 \u0444\u0438\u043b\u044c\u0442\u0440",
    "Defensive Passive": "\u041e\u0431\u043e\u0440\u043e\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u0430\u0441\u0441\u0438\u0432\u043d\u044b\u0435",
    "Offensive Passive": "\u0410\u0433\u0440\u0435\u0441\u0441\u0438\u0432\u043d\u044b\u0435",
    "Defensive Active": "\u041e\u0431\u043e\u0440\u043e\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435",
    "Offensive Active": "\u0410\u0433\u0440\u0435\u0441\u0441\u0438\u0432\u043d\u044b\u0435",
    "Damage Numbers": "\u0427\u0438\u0441\u043b\u0430 \u0443\u0440\u043e\u043d\u0430",
    "Ammo": "\u0411\u043e\u0435\u0437\u0430\u043f\u0430\u0441",
    "Reload Cooldown": "\u0412\u0440\u0435\u043c\u044f \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0438",
    "Reloading": "\u041f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0430",
    "Item Target Reticle": "\u041f\u0440\u0438\u0446\u0435\u043b \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Top Bar Plus": "\u0412\u0435\u0440\u0445\u043d\u044f\u044f \u043f\u0430\u043d\u0435\u043b\u044c+",
    "Top Bar": "\u0412\u0435\u0440\u0445\u043d\u044f\u044f \u043f\u0430\u043d\u0435\u043b\u044c",
    "Shop": "\u041c\u0430\u0433\u0430\u0437\u0438\u043d",
    "HUD Controls": "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 HUD",
    "UI Controls": "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 UI",
    "Chat": "\u0427\u0430\u0442",
    "Legacy Durations": "\u0421\u0442\u0430\u0440\u044b\u0435 \u043f\u043e\u043b\u043e\u0441\u044b \u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438",
    "Healthbar": "\u041f\u043e\u043b\u043e\u0441\u0430 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f",
    "Player": "\u0418\u0433\u0440\u043e\u043a",
    "Bottom Bar": "\u041d\u0438\u0436\u043d\u044f\u044f \u043f\u0430\u043d\u0435\u043b\u044c",
    "Simplify": "\u0423\u043f\u0440\u043e\u0449\u0435\u043d\u0438\u0435",
    "Zipline Boost": "\u0423\u0441\u043a\u043e\u0440\u0435\u043d\u0438\u0435 \u043d\u0430 \u0437\u0438\u043f\u043b\u0430\u0439\u043d\u0435",
    "Souls Timer": "\u0422\u0430\u0439\u043c\u0435\u0440 \u0434\u0443\u0448",
    "Unsecured Souls Timer": "\u0422\u0430\u0439\u043c\u0435\u0440 \u043d\u0435\u043d\u0430\u0434\u0435\u0436\u043d\u044b\u0445 \u0434\u0443\u0448",
    "Unsecured Timer": "\u0422\u0430\u0439\u043c\u0435\u0440 \u043d\u0435\u043d\u0430\u0434\u0435\u0436\u043d\u044b\u0445 \u0434\u0443\u0448",
    "Better Unsecured": "\u0443\u043b\u0443\u0447\u0448\u0435\u043d\u0438\u0435 \u0442\u0435\u0440\u044f\u0435\u043c\u044b\u0445 \u0434\u0443\u0448",
    "Better Unsecured Souls": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u044b\u0435 \u043d\u0435\u043d\u0430\u0434\u0435\u0436\u043d\u044b\u0435 \u0434\u0443\u0448\u0438",
    "Unsecured Plus": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u044b\u0435 \u043d\u0435\u043d\u0430\u0434\u0435\u0436\u043d\u044b\u0435 \u0434\u0443\u0448\u0438",
    "Keyboard": "\u041a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u0430",
    "Compass": "\u041a\u043e\u043c\u043f\u0430\u0441",
    "Ult Cooldowns": "\u041a\u0443\u043b\u0434\u0430\u0443\u043d\u044b \u0443\u043b\u044c\u0442\u043e\u0432",
    "Alt Zoom": "\u0417\u0443\u043c \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u044b \u043d\u0430 ALT",
    "Tab Zoom": "\u0417\u0443\u043c \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u044b \u043d\u0430 TAB",
    "Announcer": "\u041e\u0437\u0432\u0443\u0447\u043a\u0430 \u0441\u043e\u0431\u044b\u0442\u0438\u0439",
    "Arcade": "\u0410\u0440\u043a\u0430\u0434\u0430",
    "Game Settings": "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0438\u0433\u0440",
    "Games": "\u0418\u0433\u0440\u044b",
    "Game Audio": "\u0417\u0432\u0443\u043a\u0438 \u0438\u0433\u0440",
    "Difficulty": "\u0421\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044c",
    "Supporting and Feature Requests": "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u0438 \u0437\u0430\u043f\u0440\u043e\u0441\u044b \u0444\u0438\u0447",
    "Issues, Feedback and Ideas": "\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u044b, \u043e\u0442\u0437\u044b\u0432\u044b \u0438 \u0438\u0434\u0435\u0438",
    "Contact": "\u041a\u043e\u043d\u0442\u0430\u043a\u0442",
    "Special Thanks": "\u041e\u0441\u043e\u0431\u0430\u044f \u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u043d\u043e\u0441\u0442\u044c",
    "Size": "\u0420\u0430\u0437\u043c\u0435\u0440",
    "Opacity": "\u041f\u0440\u043e\u0437\u0440\u0430\u0447\u043d\u043e\u0441\u0442\u044c",
    "Scale": "\u041c\u0430\u0441\u0448\u0442\u0430\u0431",
    "Horizontal Offset": "\u0413\u043e\u0440\u0438\u0437. \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
    "Vertical Offset": "\u0412\u0435\u0440\u0442. \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
    "Horizontal Stretch": "\u0413\u043e\u0440\u0438\u0437. \u0440\u0430\u0437\u043c\u0435\u0440",
    "Vertical Stretch": "\u0412\u0435\u0440\u0442. \u0420\u0430\u0437\u043c\u0435\u0440",
    "Visual": "\u0412\u0438\u0437\u0443\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432",
    "Hide All": "\u0421\u043a\u0440\u044b\u0442\u044c \u0432\u0441\u0435",
    "Current": "\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u043a\u043e\u043b-\u0432\u043e",
    "Total": "\u041e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b-\u0432\u043e",
    "Icon": "\u0418\u043a\u043e\u043d\u043a\u0430",
    "Circle": "\u041a\u0440\u0443\u0433",
    "Big Number": "\u0411\u043e\u043b\u044c\u0448\u0438\u0435 \u0447\u0438\u0441\u043b\u0430",
    "Big Numbers": "\u0411\u043e\u043b\u044c\u0448\u0438\u0435 \u0447\u0438\u0441\u043b\u0430",
    "Damage Fountain": "\u042d\u0444\u0444\u0435\u043a\u0442 \u0444\u043e\u043d\u0442\u0430\u043d\u0430 \u043d\u0430 \u0443\u0440\u043e\u043d",
    "Small Numbers": "\u041c\u0430\u043b\u044b\u0435 \u0447\u0438\u0441\u043b\u0430",
    "Trooper Damage": "\u0423\u0440\u043e\u043d \u043f\u043e \u043a\u0440\u0438\u043f\u0430\u043c",
    "Hide Current": "\u0421\u043a\u0440\u044b\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0435",
    "Hide Total": "\u0421\u043a\u0440\u044b\u0442\u044c \u043e\u0431\u0449\u0435\u0435",
    "Hide Icon": "\u0421\u043a\u0440\u044b\u0442\u044c \u0438\u043a\u043e\u043d\u043a\u0443",
    "Hide Circle": "\u0421\u043a\u0440\u044b\u0442\u044c \u043e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b-\u0432\u043e",
    "Hide Big Number": "\u0421\u043a\u0440\u044b\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0438\u0435 \u0447\u0438\u0441\u043b\u0430",
    "Hide Small Numbers": "\u0421\u043a\u0440\u044b\u0442\u044c \u043c\u0430\u043b\u044b\u0435 \u0447\u0438\u0441\u043b\u0430",
    "Hide Trooper Damage": "\u0421\u043a\u0440\u044b\u0442\u044c \u0443\u0440\u043e\u043d \u043f\u043e \u043a\u0440\u0438\u043f\u0430\u043c",
    "Highlight Mode": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u0430\u044f \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c",
    "Big Red": "\u0411\u043e\u043b\u044c\u0448\u043e\u0439 \u0438 \u043a\u0440\u0430\u0441\u043d\u044b\u0439",
    "Unspent Souls": "\u041d\u0435\u043f\u043e\u0442\u0440\u0430\u0447\u0435\u043d\u043d\u044b\u0435 \u0434\u0443\u0448\u0438 \u0438\u0433\u0440\u043e\u043a\u043e\u0432",
    "Souls Per Minute": "\u0414\u0443\u0448\u0438 \u0432 \u043c\u0438\u043d\u0443\u0442\u0443",
    "Objective Damage": "\u0423\u0440\u043e\u043d \u043f\u043e \u0441\u0442\u0440\u043e\u0435\u043d\u0438\u044f\u043c",
    "Objective Map": "\u041a\u0430\u0440\u0442\u0430 \u0441\u0442\u0440\u043e\u0435\u043d\u0438\u0439",
    "Urn Difference": "\u0420\u0430\u0437\u043d\u0438\u0446\u0430 \u0443\u0440\u043d\u044b",
    "Buff Timer": "\u0422\u0430\u0439\u043c\u0435\u0440 \u0431\u0430\u0444\u0444\u043e\u0432",
    "Bridge Buff Timer": "\u0422\u0430\u0439\u043c\u0435\u0440 \u0440\u0443\u043d",
    "Mid Boss Timer": "\u0422\u0430\u0439\u043c\u0435\u0440 \u043c\u0438\u0434-\u0431\u043e\u0441\u0441\u0430",
    "Missing Hero Opaque": "\u0421\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u043e\u043f\u0430\u0432\u0448\u0438\u0445 \u0433\u0435\u0440\u043e\u0435\u0432",
    "Display Stats": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0443 \u0433\u0435\u0440\u043e\u044f",
    "Display Hero": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0433\u0435\u0440\u043e\u044f",
    "Simplify Shop": "\u0423\u043f\u0440\u043e\u0441\u0442\u0438\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d",
    "Stats": "\u0421\u0442\u0430\u0442\u044b",
    "Hero": "\u0413\u0435\u0440\u043e\u0439",
    "Minimalist": "\u041c\u0438\u043d\u0438\u043c\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u043d\u044b\u0439",
    "Blur": "\u0420\u0430\u0437\u043c\u044b\u0442\u0438\u0435",
    "Quick Buy": "\u0411\u044b\u0441\u0442\u0440\u0430\u044f \u043f\u043e\u043a\u0443\u043f\u043a\u0430",
    "Hide Blur": "\u0423\u0431\u0440\u0430\u0442\u044c \u0440\u0430\u0437\u043c\u044b\u0442\u0438\u0435",
    "Hide Quick Buy": "\u0421\u043a\u0440\u044b\u0442\u044c \u0431\u044b\u0441\u0442\u0440\u0443\u044e \u043f\u043e\u043a\u0443\u043f\u043a\u0443",
    "16:10 Support": "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 16:10",
    "4:3 Support": "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 4:3",
    "21:9 Stream Fix": "\u0424\u0438\u043a\u0441 21:9 \u0434\u043b\u044f \u0441\u0442\u0440\u0438\u043c\u043e\u0432",
    "Centered ESC Menu": "\u041e\u0442\u0446\u0435\u043d\u0442\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0435\u043d\u044e \u043f\u0430\u0443\u0437\u044b",
    "Centered Friends List": "\u041e\u0442\u0446\u0435\u043d\u0442\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u0434\u0440\u0443\u0437\u0435\u0439",
    "Statlocker": "Statlocker",
    "Force Testing Tools": "\u0412\u0441\u0435\u0433\u0434\u0430 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b",
    "Show Testing Tools": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b",
    "Hide Testing Tools": "\u0421\u043a\u0440\u044b\u0442\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b",
    "Behavior Summary": "\u041f\u043b\u0430\u0448\u043a\u0430 \u043f\u043e\u0432\u0435\u0434\u0435\u043d\u0438\u044f",
    "Failed Hint": "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0432\u044b\u043d\u043e\u0441\u043b\u0438\u0432\u043e\u0441\u0442\u0438",
    "Ability Suggestion": "\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0438",
    "Cosmetic Ability": "\u0418\u0432\u0435\u043d\u0442\u043e\u0432\u044b\u0435 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0438",
    "Hide Behavior Summary": "\u0421\u043a\u0440\u044b\u0442\u044c \u043f\u043b\u0430\u0448\u043a\u0443 \u043f\u043e\u0432\u0435\u0434\u0435\u043d\u0438\u044f",
    "Hide Failed Hint": "\u0421\u043a\u0440\u044b\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0432\u044b\u043d\u043e\u0441\u043b\u0438\u0432\u043e\u0441\u0442\u0438",
    "Hide Ability Suggestion": "\u0421\u043a\u0440\u044b\u0442\u044c \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0435\u0439",
    "Hide Cosmetic Ability": "\u0421\u043a\u0440\u044b\u0442\u044c \u043a\u043e\u0441\u043c\u0435\u0442\u0438\u0447\u0435\u0441\u043a\u0443\u044e \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c",
    "Damage Report": "\u041e\u0442\u0447\u0435\u0442 \u0443\u0440\u043e\u043d\u0430",
    "Adjust the in-game chat position and scale.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u043f\u043e\u0437\u0438\u0446\u0438\u044e \u0438 \u043c\u0430\u0441\u0448\u0442\u0430\u0431 \u0438\u0433\u0440\u043e\u0432\u043e\u0433\u043e \u0447\u0430\u0442\u0430.",
    "Adjust size of the in-game chat.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0440\u0430\u0437\u043c\u0435\u0440 \u0438\u0433\u0440\u043e\u0432\u043e\u0433\u043e \u0447\u0430\u0442\u0430.",
    "Adjust horizontal position of the in-game chat.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u043e\u0435 \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0438\u0433\u0440\u043e\u0432\u043e\u0433\u043e \u0447\u0430\u0442\u0430.",
    "Adjust vertical position of the in-game chat.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0432\u0435\u0440\u0442\u0438\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0438\u0433\u0440\u043e\u0432\u043e\u0433\u043e \u0447\u0430\u0442\u0430.",
    "Show the in-game chat panel.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u0433\u0440\u043e\u0432\u043e\u0439 \u0447\u0430\u0442.",
    "Hide Damage Report": "\u0421\u043a\u0440\u044b\u0442\u044c \u043e\u0442\u0447\u0435\u0442 \u0443\u0440\u043e\u043d\u0430",
    "Colored Healthbar": "\u0426\u0432\u0435\u0442\u043d\u043e\u0439 HP-\u0431\u0430\u0440",
    "Colored Health": "\u0426\u0432\u0435\u0442\u043d\u043e\u0435 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u0435",
    "Color Warning": "\u0426\u0432\u0435\u0442\u043e\u0432\u043e\u0435 \u043f\u0440\u0435\u0434\u0443\u043f\u0440\u0435\u0436\u0434\u0435\u043d\u0438\u0435",
    "Enemy": "\u0412\u0440\u0430\u0433",
    "Minimalist Healthbar": "\u041c\u0430\u043b\u0435\u043d\u044c\u043a\u0430\u044f \u043f\u043e\u043b\u043e\u0441\u043a\u0430 HP",
    "Simplify Ability Icons": "\u0423\u043f\u0440\u043e\u0441\u0442\u0438\u0442\u044c \u0438\u043a\u043e\u043d\u043a\u0438 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0435\u0439",
    "Simplify Items": "\u0423\u043f\u0440\u043e\u0441\u0442\u0438\u0442\u044c \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Minimalist Abilities": "\u041c\u0438\u043d\u0438\u043c\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u043d\u044b\u0435 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0438",
    "Minimalist Item Bar": "\u041c\u0438\u043d\u0438\u043c\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u043d\u0430\u044f \u043f\u0430\u043d\u0435\u043b\u044c \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Show Icon": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0438\u043a\u043e\u043d\u043a\u0443",
    "Show Text": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0442\u0435\u043a\u0441\u0442",
    "Text": "\u0422\u0435\u043a\u0441\u0442",
    "Full Keybinds": "\u041f\u043e\u043b\u043d\u0430\u044f \u0440\u0430\u0441\u043a\u043b\u0430\u0434\u043a\u0430",
    "Full Keys": "\u041f\u043e\u043b\u043d\u044b\u0435 \u043a\u043b\u0430\u0432\u0438\u0448\u0438",
    "Show Speed": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u044c",
    "Speed": "\u0421\u043a\u043e\u0440\u043e\u0441\u0442\u044c",
    "Minimalist Minimap": "\u041c\u0438\u043d\u0438\u043c\u0430\u043b. \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0430",
    "Spinny Map": "\u0412\u0440\u0430\u0449\u0430\u044e\u0449\u0430\u044f\u0441\u044f \u043a\u0430\u0440\u0442\u0430",
    "Spinny Mode": "\u0420\u0435\u0436\u0438\u043c \u0432\u0440\u0430\u0449\u0435\u043d\u0438\u044f",
    "Urn Colors": "\u0426\u0432\u0435\u0442\u0430 \u0443\u0440\u043d\u044b",
    "Draw Over UI": "\u0420\u0438\u0441\u043e\u0432\u0430\u0442\u044c \u043f\u043e\u0432\u0435\u0440\u0445 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430",
    "Neutral Camps": "\u041d\u0435\u0439\u0442\u0440\u0430\u043b\u044b",
    "Type": "\u0422\u0438\u043f",
    "Bridge Buffs": "\u0420\u0443\u043d\u044b",
    "Bridge Buff": "\u0420\u0443\u043d\u0430",
    "Buff": "\u0411\u0430\u0444\u0444",
    "Bridge Buff Delay": "\u0412\u0440\u0435\u043c\u044f \u0434\u043e \u043d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u044f \u043e \u0440\u0443\u043d\u0430\u0445",
    "Buff Delay": "\u0417\u0430\u0434\u0435\u0440\u0436\u043a\u0430 \u0431\u0430\u0444\u0444\u0430",
    "Tier 1": "\u0422\u0438\u0440 1",
    "Tier 2": "\u0422\u0438\u0440 2",
    "Tier 3": "\u0422\u0438\u0440 3",
    "Voice": "\u0413\u043e\u043b\u043e\u0441",
    "Custom": "\u041a\u0430\u0441\u0442\u043e\u043c\u043d\u044b\u0439",
    "XQC": "XQC",
    "Asmon": "Asmon",
    "Beep": "Beep",
    "Volume": "\u0413\u0440\u043e\u043c\u043a\u043e\u0441\u0442\u044c",
    "Quiet": "\u0422\u0438\u0445\u043e",
    "Normal": "\u0421\u0440\u0435\u0434\u043d\u0435",
    "Loud": "\u0413\u0440\u043e\u043c\u043a\u043e",
    "Preview Announcer": "\u041f\u0440\u043e\u0441\u043b\u0443\u0448\u0430\u0442\u044c \u043e\u0437\u0432\u0443\u0447\u043a\u0443",
    "Test Announcer": "\u0422\u0435\u0441\u0442 \u043e\u0437\u0432\u0443\u0447\u043a\u0438",
    "Minimap Reminder": "\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435 \u043e \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0435",
    "Timer": "\u0422\u0430\u0439\u043c\u0435\u0440",
    "On Death Games": "\u0418\u0433\u0440\u044b \u043f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u0440\u0442\u0438",
    "On Death": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u0432\u043e \u0432\u0440\u0435\u043c\u044f \u0441\u043c\u0435\u0440\u0442\u0438",
    "Bebop Sweeper": "Bebop Sweeper",
    "Flappy Bat": "Flappy Bat",
    "Graves Trainer": "Graves Trainer",
    "Whack a Rem": "Whack a Rem",
    "Zerggy Mania": "Zerggy Mania",
    "Hitmarkers": "\u0425\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0440\u044b",
    "Off": "\u0412\u044b\u043a\u043b",
    "On": "\u0412\u043a\u043b",
    "Play": "\u0418\u0433\u0440\u0430\u0442\u044c",
    "Show Support": "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a\u0430",
    "Change Log": "\u0421\u043f\u0438\u0441\u043e\u043a \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439",
    "Contributors": "\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438",
    "Open": "\u041e\u0442\u043a\u0440\u044b\u0442\u044c",
    "Support development": "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0438",
    "View updates": "\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0439",
    "Community acknowledgements": "\u0411\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u043d\u043e\u0441\u0442\u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0443",
    "Open Config": "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u043e\u043d\u0444\u0438\u0433",
    "You can support development by commissioning features or presets.": "\u0412\u044b \u043c\u043e\u0436\u0435\u0442\u0435 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0443, \u0437\u0430\u043a\u0430\u0437\u0430\u0432 \u0444\u0438\u0447\u0438 \u0438\u043b\u0438 \u043f\u0440\u0435\u0441\u0435\u0442\u044b.",
    "Support development by commissioning features or presets.": "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0442\u0435 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0443, \u0437\u0430\u043a\u0430\u0437\u0430\u0432 \u0444\u0443\u043d\u043a\u0446\u0438\u0438 \u0438\u043b\u0438 \u043f\u0440\u0435\u0441\u0435\u0442\u044b.",
    "This is a way for me to give something back to the supporters.": "\u042d\u0442\u043e \u0441\u043f\u043e\u0441\u043e\u0431 \u043e\u0442\u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u0438\u0442\u044c \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a\u0430 \u043c\u043e\u0434\u0430.",
    "All commissioned additions are released publicly and available to everyone.": "\u0412\u0441\u0435 \u0437\u0430\u043a\u0430\u0437\u0430\u043d\u043d\u044b\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u0432 \u043f\u0443\u0431\u043b\u0438\u0447\u043d\u0443\u044e \u0432\u0435\u0440\u0441\u0438\u044e \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0432\u0441\u0435\u043c.",
    "The mod is <font color=\"#66cc99\">fully functional</font> and <font color=\"#66cc99\">free</font> for all users.": "\u041c\u043e\u0434 <font color=\"#66cc99\">\u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0444\u0443\u043d\u043a\u0446\u0438\u043e\u043d\u0430\u043b\u0435\u043d</font> \u0438 <font color=\"#66cc99\">\u0431\u0435\u0441\u043f\u043b\u0430\u0442\u0435\u043d</font> \u0434\u043b\u044f \u0432\u0441\u0435\u0445 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439.",
    "Custom Preset Commission: <font color=\"#66cc99\">$25</font>": "\u0417\u0430\u043a\u0430\u0437 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u043e\u0433\u043e \u043f\u0440\u0435\u0441\u0435\u0442\u0430: <font color=\"#66cc99\">$25</font>",
    "<font color=\"#66cc99\">Free</font> updates for new features, <font color=\"#66cc99\">$5</font> for arbitrary changes": "<font color=\"#66cc99\">\u0411\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b\u0435</font> \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0434\u043b\u044f \u043d\u043e\u0432\u044b\u0445 \u0444\u0443\u043d\u043a\u0446\u0438\u0439, <font color=\"#66cc99\">$5</font> \u0437\u0430 \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u043b\u044c\u043d\u044b\u0435 \u043f\u0440\u0430\u0432\u043a\u0438",
    "Settings now load from your saved build string": "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0442\u0435\u043f\u0435\u0440\u044c \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u044e\u0442\u0441\u044f \u0438\u0437 \u0432\u0430\u0448\u0435\u0439 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043d\u043e\u0439 \u0441\u0442\u0440\u043e\u043a\u0438 \u0431\u0438\u043b\u0434\u0430",
    "New Feature Commission: <font color=\"#66cc99\">$10</font> to <font color=\"#66cc99\">$100</font>": "\u0417\u0430\u043a\u0430\u0437 \u043d\u043e\u0432\u043e\u0439 \u0444\u0438\u0447\u0438: <font color=\"#66cc99\">$10</font> \u0434\u043e <font color=\"#66cc99\">$100</font>",
    "Depending on complexity and work involved": "\u0417\u0430\u0432\u0438\u0441\u0438\u0442 \u043e\u0442 \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u0438 \u0438 \u043e\u0431\u044a\u0435\u043c\u0430 \u0440\u0430\u0431\u043e\u0442",
    "Discord: <font color=\"#66cc99\">civocivocivo</font>": "Discord: <font color=\"#66cc99\">civocivocivo</font>",
    "Without them QOL Lock would not be possible.": "\u0411\u0435\u0437 \u043d\u0438\u0445 QOL Lock \u0431\u044b\u043b \u0431\u044b \u043d\u0435\u0432\u043e\u0437\u043c\u043e\u0436\u0435\u043d.",
    "If you encounter issues please join the Discord": "\u0415\u0441\u043b\u0438 \u0432\u044b \u0441\u0442\u043e\u043b\u043a\u043d\u0443\u043b\u0438\u0441\u044c \u0441 \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0430\u043c\u0438, \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u044f\u0439\u0442\u0435\u0441\u044c \u043a Discord",
    "I am open to all feedback, suggestions, and ideas!": "\u042f \u043e\u0442\u043a\u0440\u044b\u0442 \u043a \u043b\u044e\u0431\u044b\u043c \u043e\u0442\u0437\u044b\u0432\u0430\u043c, \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f\u043c \u0438 \u0438\u0434\u0435\u044f\u043c!",
    "Default 18": "\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e 18",
    "Default 400": "\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e 400",
    "Hud Shift": "\u0421\u0434\u0432\u0438\u0433 HUD",
    "Easier Access": "\u041e\u0431\u043b\u0435\u0433\u0447\u0435\u043d\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f",
    "Always Visible Override": "\u041f\u0440\u0438\u043d\u0443\u0434\u0438\u0442. \u0432\u0441\u0435\u0433\u0434\u0430 \u0432\u0438\u0434\u0438\u043c\u043e",
    "Always Shown": "\u0432\u0441\u0435\u0433\u0434\u0430 \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u0442\u044c \u0447\u0438\u0442-\u043c\u0435\u043d\u044e",
    "Always Hidden": "\u041f\u0440\u0438\u043d\u0443\u0434\u0438\u0442. \u0432\u0441\u0435\u0433\u0434\u0430 \u0441\u043a\u0440\u044b\u0442\u043e",
    "Metro Button": "\u0424\u0443\u043d\u043a\u0446\u0438\u044f \u0434\u043b\u044f ABL",
    "Low Stamina Popup": "\u0443\u0431\u0438\u0440\u0430\u0435\u0442 \u0432\u044b\u0441\u043a\u0430\u043a\u0438\u0432\u0430\u044e\u0449\u0438\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f",
    "On Ability Upgrade": "\u0441\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438 \u0441\u0431\u043e\u0440\u043e\u043a",
    "Snowball or Poster": "\u0421\u043d\u0435\u0436\u043e\u043a \u0438\u043b\u0438 \u043f\u043e\u0441\u0442\u0435\u0440",
    "Recommended for 4:3": "\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434. \u0434\u043b\u044f 4:3",
    "HP Warning": "\u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f \u043e\u0442 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f",
    "Enemy HP Warning": "\u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f \u043e\u0442 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u0432\u0440\u0430\u0433\u0430",
    "Compact Layout": "\u041a\u043e\u043c\u043f\u0430\u043a\u0442\u043d\u044b\u0439 \u0432\u0438\u0434",
    "Cleaner Skills": "\u0423\u0431\u0440\u0430\u0442\u044c \u0444\u043e\u043d \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0435\u0439",
    "Cleaner Items": "\u0423\u0431\u0440\u0430\u0442\u044c \u0444\u043e\u043d \u0443 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Always Visible Boost": "\u0412\u0441\u0435\u0433\u0434\u0430 \u0432\u0438\u0434\u043d\u043e \u0443\u0441\u043a\u043e\u0440\u0435\u043d\u0438\u0435",
    "Realtime Drain Countdown": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0432\u0440\u0435\u043c\u044f \u0434\u043e \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u0430 \u0432 \u0447\u0438\u0441\u0442\u044b\u0435 \u0434\u0443\u0448\u0438",
    "Mirror unsecured gold number": "\u041e\u0442\u0437\u0435\u0440\u043a\u0430\u043b\u0438\u0432\u0430\u0442\u044c \u043d\u0435\u043d\u0430\u0434\u0435\u0436\u043d\u044b\u0435 \u0434\u0443\u0448\u0438",
    "Realtime Key Inputs": "\u041d\u0430\u0436\u0430\u0442\u0438\u044f \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438",
    "Angle and Speed": "\u0423\u0433\u043e\u043b \u0438 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u044c",
    "Estimated ult cooldowns under top-bar ult icons": "\u041f\u0440\u0438\u043c\u0435\u0440\u043d\u0430\u044f \u043e\u0446\u0435\u043d\u043a\u0430 \u043a\u0443\u043b\u0434\u0430\u0443\u043d\u043e\u0432 \u0443\u043b\u044c\u0442 \u043f\u043e\u0434 \u0438\u043a\u043e\u043d\u043a\u0430\u043c\u0438 \u0441\u0432\u0435\u0440\u0445\u0443",
    "HIGH FPS IMPACT WARNING!": "\u0412\u041d\u0418\u041c\u0410\u041d\u0418\u0415: \u0412\u042b\u0421\u041e\u041a\u0410\u042f \u041d\u0410\u0413\u0420\u0423\u0417\u041a\u0410 \u041d\u0410 FPS!",
    "Customizable Unsecured Souls": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u043c\u044b\u0435 \u043d\u0435\u043d\u0430\u0434\u0435\u0436\u043d\u044b\u0435 \u0434\u0443\u0448\u0438",
    "Simplified Minimap": "\u0423\u043f\u0440\u043e\u0449\u0435\u043d\u043d\u0430\u044f \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0430",
    "Ability Menu Open": "\u041e\u0442\u043a\u0440\u044b\u0442\u043e \u043c\u0435\u043d\u044e \u0441\u043a\u0438\u043b\u043b\u043e\u0432",
    "Scoreboard Open": "\u041e\u0442\u043a\u0440\u044b\u0442\u0430 \u0442\u0430\u0431\u043b\u0438\u0446\u0430 \u0441\u0447\u0451\u0442\u0430",
    "Play current announcer voice and volume.": "\u041f\u0440\u043e\u0438\u0433\u0440\u0430\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u0433\u043e\u043b\u043e\u0441 \u0438 \u0433\u0440\u043e\u043c\u043a\u043e\u0441\u0442\u044c \u043e\u0437\u0432\u0443\u0447\u043a\u0438.",
    "Play current announcer voice.": "\u041f\u0440\u043e\u0438\u0433\u0440\u0430\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u0433\u043e\u043b\u043e\u0441.",
    "First Spawns": "\u041f\u0435\u0440\u0432\u044b\u0435 \u0441\u043f\u0430\u0432\u043d\u044b",
    "Buff Reminder": "\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435 \u043e \u0440\u0443\u043d\u0430\u0445",
    "Seconds Before Spawn": "\u0421\u0435\u043a\u0443\u043d\u0434 \u0434\u043e \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f",
    "Ding to Check Minimap": "\u0417\u0432\u0443\u043a\u043e\u0432\u043e\u0435 \u043d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435 \u043e \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0435",
    "In Seconds": "\u0412 \u0441\u0435\u043a\u0443\u043d\u0434\u0430\u0445",
    "Open random game when dead": "\u041e\u0442\u043a\u0440\u044b\u0432\u0430\u0442\u044c \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u0443\u044e \u0438\u0433\u0440\u0443 \u043f\u0440\u0438 \u0441\u043c\u0435\u0440\u0442\u0438",
    "Blackjack": "Wraithjack",
    "Buff Filter": "\u0424\u0438\u043b\u044c\u0442\u0440 \u0431\u0430\u0444\u0444\u043e\u0432",
    "click here": "\u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u0441\u044e\u0434\u0430",
    "Click Radius": "\u0420\u0430\u0434\u0438\u0443\u0441 \u043a\u043b\u0438\u043a\u0430",
    "Current Size": "\u0420\u0430\u0437\u043c\u0435\u0440 \u0442\u0435\u043a\u0443\u0449\u0435\u0433\u043e",
    "Enable Clean Stacks": "\u0427\u0438\u0441\u0442\u044b\u0435 \u0441\u0442\u0430\u043a\u0438",
    "Hero Icon Size": "\u0420\u0430\u0437\u043c\u0435\u0440 \u0438\u043a\u043e\u043d\u043e\u043a \u0433\u0435\u0440\u043e\u0435\u0432",
    "Icon Shrink": "\u0421\u0436\u0430\u0442\u0438\u0435 \u0438\u043a\u043e\u043d\u043e\u043a",
    "Improved Hint": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u0430\u044f \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430",
    "Lane with Party": "\u041b\u0438\u043d\u0438\u044f \u0441 \u0433\u0440\u0443\u043f\u043f\u043e\u0439",
    "Minimalist Opacity": "\u041f\u0440\u043e\u0437\u0440\u0430\u0447\u043d\u043e\u0441\u0442\u044c \u043c\u0438\u043d\u0438\u043c\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u043d\u043e\u0439 \u043a\u0430\u0440\u0442\u044b",
    "Nicknames": "\u041d\u0438\u043a\u043d\u0435\u0439\u043c\u044b",
    "Player Icon Size": "\u0420\u0430\u0437\u043c\u0435\u0440 \u0438\u043a\u043e\u043d\u043a\u0438 \u0438\u0433\u0440\u043e\u043a\u0430",
    "Refresh Rate": "\u0427\u0430\u0441\u0442\u043e\u0442\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f",
    "Show FPS": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c FPS",
    "Show Frame": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043a\u0430\u0434\u0440",
    "Show Memory": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043f\u0430\u043c\u044f\u0442\u044c",
    "Show Position": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043f\u043e\u0437\u0438\u0446\u0438\u044e",
    "Show Tick": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0442\u0438\u043a\u0438",
    "Shrink Distance": "\u0414\u0438\u0441\u0442\u0430\u043d\u0446\u0438\u044f \u0441\u0436\u0430\u0442\u0438\u044f",
    "Total Size": "\u0420\u0430\u0437\u043c\u0435\u0440 \u043e\u0431\u0449\u0435\u0433\u043e",
    "Ult Indicator": "\u0418\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u0443\u043b\u044c\u0442\u044b",
    "Zip Thickness": "\u0422\u043e\u043b\u0449\u0438\u043d\u0430 \u0437\u0438\u043f\u043b\u0430\u0439\u043d\u0430",
    "Depending on complexity and work involved, contact me on": "\u0412 \u0437\u0430\u0432\u0438\u0441\u0438\u043c\u043e\u0441\u0442\u0438 \u043e\u0442 \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u0438 \u0438 \u043e\u0431\u044a\u0435\u043c\u0430 \u0440\u0430\u0431\u043e\u0442, \u0441\u0432\u044f\u0436\u0438\u0442\u0435\u0441\u044c \u0441\u043e \u043c\u043d\u043e\u0439 \u0432",
    "If you encounter issues, need help, or have any feedback join the Discord.": "\u0415\u0441\u043b\u0438 \u0432\u043e\u0437\u043d\u0438\u043a\u043b\u0438 \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u044b, \u043d\u0443\u0436\u043d\u0430 \u043f\u043e\u043c\u043e\u0449\u044c \u0438\u043b\u0438 \u0435\u0441\u0442\u044c \u0438\u0434\u0435\u0438, \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u044f\u0439\u0442\u0435\u0441\u044c \u043a Discord.",
    "Reset section runtime options": "\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c runtime-\u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0441\u0435\u043a\u0446\u0438\u0438",
    "Reset section to defaults": "\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0441\u0435\u043a\u0446\u0438\u044e \u043a \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f\u043c \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e",
    "DO NOT PRESS ANY KEYS UNTIL COMPLETE UNLESS PROMPTED": "\u041d\u0415 \u041d\u0410\u0416\u0418\u041c\u0410\u0419\u0422\u0415 \u041a\u041b\u0410\u0412\u0418\u0428\u0418 \u0414\u041e \u0417\u0410\u0412\u0415\u0420\u0428\u0415\u041d\u0418\u042f \u0415\u0421\u041b\u0418 \u041d\u0415 \u0411\u042b\u041b\u041e \u0417\u0410\u041f\u0420\u041e\u0421\u041e\u0412 \u041d\u0410 \u042d\u0422\u041e",
    "If saving stalls, open your shop.": "\u0415\u0441\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0437\u0430\u0432\u0438\u0441\u043b\u043e, \u043e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d.",
    "Play Sound ": "\u0412\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0441\u0442\u0438 \u0437\u0432\u0443\u043a ",
    "1st": "1-\u0439",
    "2nd": "2-\u0439",
    "3rd": "3-\u0439",
    "Size of your current ammo.": "\u0420\u0430\u0437\u043c\u0435\u0440 \u0442\u0435\u043a\u0443\u0449\u0438\u0445 \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432.",
    "Size of your total ammo.": "\u0420\u0430\u0437\u043c\u0435\u0440 \u043e\u0431\u0449\u0435\u0433\u043e \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u0430 \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432.",
    "Cleans up the styling of reticle hints.": "\u0423\u043b\u0443\u0447\u0448\u0430\u0435\u0442 \u0441\u0442\u0438\u043b\u044c \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043e\u043a \u043f\u0440\u0438\u0446\u0435\u043b\u0430.",
    "Automatically selects Lane Preference: With Party for matchmaking.": "\u0410\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0432\u044b\u0431\u0438\u0440\u0430\u0435\u0442 \u043f\u0440\u0435\u0434\u043f\u043e\u0447\u0442\u0435\u043d\u0438\u0435 \u043b\u0438\u043d\u0438\u0438: \u0441 \u0433\u0440\u0443\u043f\u043f\u043e\u0439.",
    "Shows nicknames of all players in the game within the top bar.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043d\u0438\u043a\u043d\u0435\u0439\u043c\u044b \u0432\u0441\u0435\u0445 \u0438\u0433\u0440\u043e\u043a\u043e\u0432 \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438.",
    "Show the ultimate indicator for V1 healthbars.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u0443\u043b\u044c\u0442\u044b \u0434\u043b\u044f V1-\u043f\u043e\u043b\u043e\u0441\u043e\u043a \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f.",
    "Colored enemy healthbar warnings when at significant thresholds.": "\u0426\u0432\u0435\u0442\u043e\u0432\u044b\u0435 \u043f\u0440\u0435\u0434\u0443\u043f\u0440\u0435\u0436\u0434\u0435\u043d\u0438\u044f \u043f\u043e HP \u0432\u0440\u0430\u0433\u0430 \u043d\u0430 \u0432\u0430\u0436\u043d\u044b\u0445 \u043f\u043e\u0440\u043e\u0433\u0430\u0445.",
    "Enemy healthbar enhancements.": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u0438\u044f \u043f\u043e\u043b\u043e\u0441\u044b \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u0432\u0440\u0430\u0433\u0430.",
    "Opacity of the background of Minimalist Minimap.": "\u041f\u0440\u043e\u0437\u0440\u0430\u0447\u043d\u043e\u0441\u0442\u044c \u0444\u043e\u043d\u0430 \u043c\u0438\u043d\u0438\u043c\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u043d\u043e\u0439 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u044b.",
    "The click hitbox of your pings or clicks, this can help make pings more accurate.": "\u0420\u0430\u0434\u0438\u0443\u0441 \u043e\u0431\u043b\u0430\u0441\u0442\u0438 \u043a\u043b\u0438\u043a\u0430 \u0434\u043b\u044f \u043f\u0438\u043d\u0433\u043e\u0432 \u0438 \u043e\u0442\u043c\u0435\u0442\u043e\u043a; \u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442 \u0434\u0435\u043b\u0430\u0442\u044c \u0438\u0445 \u0442\u043e\u0447\u043d\u0435\u0435.",
    "How much icons will shrink when overlapping with others.": "\u041d\u0430\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0438\u043a\u043e\u043d\u043a\u0438 \u0441\u0436\u0438\u043c\u0430\u044e\u0442\u0441\u044f \u043f\u0440\u0438 \u043f\u0435\u0440\u0435\u043a\u0440\u044b\u0442\u0438\u0438.",
    "The size of other players on the minimap.": "\u0420\u0430\u0437\u043c\u0435\u0440 \u0438\u043a\u043e\u043d\u043e\u043a \u0434\u0440\u0443\u0433\u0438\u0445 \u0438\u0433\u0440\u043e\u043a\u043e\u0432 \u043d\u0430 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0435.",
    "The size of yourself on the minimap.": "\u0420\u0430\u0437\u043c\u0435\u0440 \u0432\u0430\u0448\u0435\u0439 \u0438\u043a\u043e\u043d\u043a\u0438 \u043d\u0430 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0435.",
    "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.": "\u0414\u0438\u0441\u0442\u0430\u043d\u0446\u0438\u044f, \u043f\u0440\u0438 \u043a\u043e\u0442\u043e\u0440\u043e\u0439 \u0438\u043a\u043e\u043d\u043a\u0438 \u043d\u0430\u0447\u0438\u043d\u0430\u044e\u0442 \u0441\u0436\u0438\u043c\u0430\u0442\u044c\u0441\u044f. \u041c\u0435\u043d\u044c\u0448\u0435 \u2014 \u0442\u043e\u0447\u043d\u0435\u0435 \u043f\u043e\u0437\u0438\u0446\u0438\u0438, \u0431\u043e\u043b\u044c\u0448\u0435 \u2014 \u043b\u0443\u0447\u0448\u0435 \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c.",
    "The thickness of the Zipline lines across the map.": "\u0422\u043e\u043b\u0449\u0438\u043d\u0430 \u043b\u0438\u043d\u0438\u0439 \u0437\u0438\u043f\u043b\u0430\u0439\u043d\u0430 \u043d\u0430 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0435.",
    "How fast the minimap refreshes.": "\u0427\u0430\u0441\u0442\u043e\u0442\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0439 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u044b.",
    "RAM and GPU Memory real time usage statistics.": "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f RAM \u0438 \u0432\u0438\u0434\u0435\u043e\u043f\u0430\u043c\u044f\u0442\u0438 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438.",
    "Position and Velocity real time statistics.": "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0438 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u0438 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438.",
    "Shows real time tick information, mostly useless.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044e \u043e \u0442\u0438\u043a\u0430\u0445 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438, \u0432 \u043e\u0441\u043d\u043e\u0432\u043d\u043e\u043c \u0431\u0435\u0441\u043f\u043e\u043b\u0435\u0437\u043d\u043e.",
    "Shows raw FPS count.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 FPS.",
    "Shows current frame count, mostly useless.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043d\u043e\u043c\u0435\u0440 \u043a\u0430\u0434\u0440\u0430, \u0432 \u043e\u0441\u043d\u043e\u0432\u043d\u043e\u043c \u0431\u0435\u0441\u043f\u043e\u043b\u0435\u0437\u043d\u043e.",
    "The hero you automatically switch to on launch or after saving..": "\u0413\u0435\u0440\u043e\u0439, \u043d\u0430 \u043a\u043e\u0442\u043e\u0440\u043e\u0433\u043e \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u043f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0430\u0435\u0442 \u043f\u0440\u0438 \u0437\u0430\u043f\u0443\u0441\u043a\u0435 \u0438\u043b\u0438 \u043f\u043e\u0441\u043b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f.",
    "Toggle the hitmarkers when attacking enemies.": "\u0412\u043a\u043b\u044e\u0447\u0430\u0435\u0442/\u0432\u044b\u043a\u043b\u044e\u0447\u0430\u0435\u0442 \u0445\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0440\u044b \u043f\u0440\u0438 \u0430\u0442\u0430\u043a\u0435 \u0432\u0440\u0430\u0433\u043e\u0432.",
    "Choose which bridge buff sound variants can play.": "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435, \u043a\u0430\u043a\u0438\u0435 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b \u0437\u0432\u0443\u043a\u0430 \u0440\u0443\u043d\u044b \u043c\u043e\u0433\u0443\u0442 \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u044c\u0441\u044f.",
    "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.": "\u041a\u0430\u043a\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u044f\u0442 \u0437\u0432\u0443\u043a. \u041a\u0440\u0438\u043f\u044b \u2014 \u043e\u0434\u0438\u043d \u0440\u0430\u0437, \u0440\u0443\u043d\u0430 \u2014 \u043a\u0430\u0436\u0434\u044b\u0435 5 \u043c\u0438\u043d\u0443\u0442.",
    "FPS Impact:": "\u0412\u043b\u0438\u044f\u043d\u0438\u0435 \u043d\u0430 FPS:",
    "Created By:": "\u0410\u0432\u0442\u043e\u0440 \u0444\u0438\u0447\u0438:",
    "Author:": "\u0410\u0432\u0442\u043e\u0440:",
    "Voice Actor:": "\u0410\u043a\u0442\u0451\u0440 \u043e\u0437\u0432\u0443\u0447\u043a\u0438:",
    "None": "\u041d\u0435\u0442",
    "Low": "\u041d\u0438\u0437\u043a\u0430\u044f",
    "Medium": "\u0421\u0440\u0435\u0434\u043d\u044f\u044f",
    "High": "\u0412\u044b\u0441\u043e\u043a\u0430\u044f",
    "Adjust horizontal position of the player healthbar.": "\u0418\u0437\u043c\u0435\u043d\u044f\u0435\u0442 \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u043e\u0435 \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043f\u0430\u043d\u0435\u043b\u0438 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u0438\u0433\u0440\u043e\u043a\u0430.",
    "Adjust opacity of the player healthbar.": "\u0418\u0437\u043c\u0435\u043d\u044f\u0435\u0442 \u043f\u0440\u043e\u0437\u0440\u0430\u0447\u043d\u043e\u0441\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u0438 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u0438\u0433\u0440\u043e\u043a\u0430.",
    "Adjust size of the player healthbar.": "\u0418\u0437\u043c\u0435\u043d\u044f\u0435\u0442 \u0440\u0430\u0437\u043c\u0435\u0440 \u043f\u0430\u043d\u0435\u043b\u0438 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u0438\u0433\u0440\u043e\u043a\u0430.",
    "Adjust vertical position of the player healthbar.": "\u0418\u0437\u043c\u0435\u043d\u044f\u0435\u0442 \u0432\u0435\u0440\u0442\u0438\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043f\u0430\u043d\u0435\u043b\u0438 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u0438\u0433\u0440\u043e\u043a\u0430.",
    "An always visible zipline boost overlay.": "\u041f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u043e \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u0435\u043c\u044b\u0439 \u043e\u0432\u0435\u0440\u043b\u0435\u0439 \u0431\u0443\u0441\u0442\u0430 \u0437\u0438\u043f\u043b\u0430\u0439\u043d\u0430.",
    "Centers ESC menu elements to make them easier to access.": "\u0426\u0435\u043d\u0442\u0440\u0438\u0440\u0443\u0435\u0442 \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u044b \u043c\u0435\u043d\u044e ESC \u0434\u043b\u044f \u0431\u043e\u043b\u0435\u0435 \u0443\u0434\u043e\u0431\u043d\u043e\u0433\u043e \u0434\u043e\u0441\u0442\u0443\u043f\u0430.",
    "Centers friends list area in ESC menu.": "\u0426\u0435\u043d\u0442\u0440\u0438\u0440\u0443\u0435\u0442 \u0431\u043b\u043e\u043a \u0441\u043f\u0438\u0441\u043a\u0430 \u0434\u0440\u0443\u0437\u0435\u0439 \u0432 \u043c\u0435\u043d\u044e ESC.",
    "Adds a STAT button on profile rows that opens Statlocker for that account.": "\u0414\u043e\u0431\u0430\u0432\u043b\u044f\u0435\u0442 \u043a\u043d\u043e\u043f\u043a\u0443 STAT \u0432 \u0441\u0442\u0440\u043e\u043a\u0438 \u043f\u0440\u043e\u0444\u0438\u043b\u044f \u0438 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 Statlocker \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e account ID.",
    "Cleans up visuals of abilities significantly to reduce clutter.": "\u0421\u0438\u043b\u044c\u043d\u043e \u0443\u043f\u0440\u043e\u0449\u0430\u0435\u0442 \u0432\u0438\u0437\u0443\u0430\u043b \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0435\u0439, \u0443\u043c\u0435\u043d\u044c\u0448\u0430\u044f \u043f\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u043a\u0443.",
    "Cleans up visuals of the item bar significantly to reduce clutter.": "\u0421\u0438\u043b\u044c\u043d\u043e \u0443\u043f\u0440\u043e\u0449\u0430\u0435\u0442 \u0432\u0438\u0437\u0443\u0430\u043b \u043f\u0430\u043d\u0435\u043b\u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432, \u0443\u043c\u0435\u043d\u044c\u0448\u0430\u044f \u043f\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u043a\u0443.",
    "Cleans up visuals of the minimap significantly to reduce clutter.": "\u0421\u0438\u043b\u044c\u043d\u043e \u0443\u043f\u0440\u043e\u0449\u0430\u0435\u0442 \u0432\u0438\u0437\u0443\u0430\u043b \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u044b, \u0443\u043c\u0435\u043d\u044c\u0448\u0430\u044f \u043f\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u043a\u0443.",
    "Cleans up visuals of the shop menu significantly to reduce clutter.": "\u0421\u0438\u043b\u044c\u043d\u043e \u0443\u043f\u0440\u043e\u0449\u0430\u0435\u0442 \u0432\u0438\u0437\u0443\u0430\u043b \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430, \u0443\u043c\u0435\u043d\u044c\u0448\u0430\u044f \u043f\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u043a\u0443.",
    "Colored healthbar warnings when at significant thresholds.": "\u0426\u0432\u0435\u0442\u043e\u0432\u044b\u0435 \u043f\u0440\u0435\u0434\u0443\u043f\u0440\u0435\u0436\u0434\u0435\u043d\u0438\u044f \u043f\u043e\u043b\u043e\u0441\u044b \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u043d\u0430 \u0432\u0430\u0436\u043d\u044b\u0445 \u043f\u043e\u0440\u043e\u0433\u0430\u0445.",
    "Current ammo inside of your magazine.": "\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432 \u0432 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0435.",
    "Customize the styling of damage numbers.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0441\u0442\u0438\u043b\u044c \u0447\u0438\u0441\u0435\u043b \u0443\u0440\u043e\u043d\u0430.",
    "Customize the visuals of the incoming damage panel.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0432\u043d\u0435\u0448\u043d\u0438\u0439 \u0432\u0438\u0434 \u043f\u0430\u043d\u0435\u043b\u0438 \u0432\u0445\u043e\u0434\u044f\u0449\u0435\u0433\u043e \u0443\u0440\u043e\u043d\u0430.",
    "Customize unsecured souls visuals.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0432\u043d\u0435\u0448\u043d\u0438\u0439 \u0432\u0438\u0434 \u043d\u0435\u043d\u0430\u0434\u0451\u0436\u043d\u044b\u0445 \u0434\u0443\u0448.",
    "Customize visibility of target reticle when abilities or items visually show on allies and enemies.": "\u041d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c \u0440\u043e\u043c\u0431\u0430-\u0446\u0435\u043b\u0438, \u043a\u043e\u0433\u0434\u0430 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0438 \u0438\u043b\u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u044b \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u044e\u0442\u0441\u044f \u043d\u0430 \u0441\u043e\u044e\u0437\u043d\u0438\u043a\u0430\u0445 \u0438 \u0432\u0440\u0430\u0433\u0430\u0445.",
    "Customized healthbars for better visibility or flair.": "\u041a\u0430\u0441\u0442\u043e\u043c\u043d\u044b\u0435 \u043f\u043e\u043b\u043e\u0441\u044b \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f \u0434\u043b\u044f \u043b\u0443\u0447\u0448\u0435\u0439 \u0447\u0438\u0442\u0430\u0435\u043c\u043e\u0441\u0442\u0438 \u0438 \u0441\u0442\u0438\u043b\u044f.",
    "Decide what style of item to display the cooldown of.": "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435, \u043a\u0430\u043a\u0438\u0435 \u0442\u0438\u043f\u044b \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u0432 \u043a\u0443\u043b\u0434\u0430\u0443\u043d\u0430\u0445.",
    "Draws the minimap over all other UI elements for improved visibility.": "\u0420\u0438\u0441\u0443\u0435\u0442 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0443 \u043f\u043e\u0432\u0435\u0440\u0445 \u0432\u0441\u0435\u0445 \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u043e\u0432 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430 \u0434\u043b\u044f \u043b\u0443\u0447\u0448\u0435\u0439 \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u0438.",
    "Forcibly hides testing tools at all times.": "\u041f\u0440\u0438\u043d\u0443\u0434\u0438\u0442\u0435\u043b\u044c\u043d\u043e \u0441\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b \u0442\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f \u0432\u0441\u0435\u0433\u0434\u0430.",
    "Forcibly shows testing tools at all times.": "\u041f\u0440\u0438\u043d\u0443\u0434\u0438\u0442\u0435\u043b\u044c\u043d\u043e \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b \u0442\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f \u0432\u0441\u0435\u0433\u0434\u0430.",
    "Greys out heros in the top bar when missing on the map.": "\u0417\u0430\u0442\u0435\u043c\u043d\u044f\u0435\u0442 \u0433\u0435\u0440\u043e\u0435\u0432 \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438, \u043a\u043e\u0433\u0434\u0430 \u043e\u043d\u0438 \u043f\u0440\u043e\u043f\u0430\u043b\u0438 \u0441 \u043a\u0430\u0440\u0442\u044b.",
    "Highlighted abilities showing you what you should upgrade depending on build.": "\u041f\u043e\u0434\u0441\u0432\u0435\u0447\u0438\u0432\u0430\u0435\u0442 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0441\u0442\u043e\u0438\u0442 \u0443\u043b\u0443\u0447\u0448\u0430\u0442\u044c \u0432 \u0437\u0430\u0432\u0438\u0441\u0438\u043c\u043e\u0441\u0442\u0438 \u043e\u0442 \u0431\u0438\u043b\u0434\u0430.",
    "Improve Ability Stacks": "\u0423\u043b\u0443\u0447\u0448\u0430\u0435\u0442 \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0442\u0430\u043a\u043e\u0432 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0435\u0439.",
    "Makes the minimap rotate with player view, this is just for fun.": "\u041f\u043e\u0432\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u0442 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0443 \u0432\u043c\u0435\u0441\u0442\u0435 \u0441 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435\u043c \u0438\u0433\u0440\u043e\u043a\u0430, \u043e\u043f\u0446\u0438\u044f \u0434\u043b\u044f \u0444\u0430\u043d\u0430.",
    "Menu when you receive a punishment for breaking game rules.": "\u041c\u0435\u043d\u044e, \u043a\u043e\u0442\u043e\u0440\u043e\u0435 \u043f\u043e\u044f\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u043f\u0440\u0438 \u043d\u0430\u043a\u0430\u0437\u0430\u043d\u0438\u0438 \u0437\u0430 \u043d\u0430\u0440\u0443\u0448\u0435\u043d\u0438\u0435 \u043f\u0440\u0430\u0432\u0438\u043b \u0438\u0433\u0440\u044b.",
    "Only download the filter file of the filter you want, nothing else.": "\u0421\u043a\u0430\u0447\u0438\u0432\u0430\u0439\u0442\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0444\u0430\u0439\u043b \u043d\u0443\u0436\u043d\u043e\u0433\u043e \u0444\u0438\u043b\u044c\u0442\u0440\u0430, \u043d\u0438\u0447\u0435\u0433\u043e \u043b\u0438\u0448\u043d\u0435\u0433\u043e.",
    "Play an audio reminder to remember to look at the minimap.": "\u041f\u0440\u043e\u0438\u0433\u0440\u044b\u0432\u0430\u0435\u0442 \u0437\u0432\u0443\u043a\u043e\u0432\u043e\u0435 \u043d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435, \u0447\u0442\u043e\u0431\u044b \u043d\u0435 \u0437\u0430\u0431\u044b\u0432\u0430\u0442\u044c \u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u043d\u0430 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0443.",
    "Ragnarok Online damage visuals with improved fancy styling.": "\u0412\u0438\u0437\u0443\u0430\u043b \u0447\u0438\u0441\u0435\u043b \u0443\u0440\u043e\u043d\u0430 \u0432 \u0441\u0442\u0438\u043b\u0435 Ragnarok Online \u0441 \u0443\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u044b\u043c \u043e\u0444\u043e\u0440\u043c\u043b\u0435\u043d\u0438\u0435\u043c.",
    "Real time key input visual.": "\u0412\u0438\u0437\u0443\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0430\u0436\u0430\u0442\u0438\u0439 \u043a\u043b\u0430\u0432\u0438\u0448 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438.",
    "See your view angle and speed.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0443\u0433\u043e\u043b \u043e\u0431\u0437\u043e\u0440\u0430 \u0438 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u044c.",
    "Shifts the HUD for better visual support for 16:10 resolutions.": "\u0421\u043c\u0435\u0449\u0430\u0435\u0442 HUD \u0434\u043b\u044f \u043b\u0443\u0447\u0448\u0435\u0439 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0439 16:10.",
    "Shifts the HUD for better visual support for 4:3 resolutions.": "\u0421\u043c\u0435\u0449\u0430\u0435\u0442 HUD \u0434\u043b\u044f \u043b\u0443\u0447\u0448\u0435\u0439 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0439 4:3.",
    "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u0442\u0435\u043a\u0443\u0449\u0438\u0445 \u0413\u0432\u0430\u0440\u0434\u043e\u0432, \u0423\u043e\u043a\u0435\u0440\u043e\u0432 \u0438 \u0411\u0430\u0437\u044b \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438.",
    "Show if you are in combat or not.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442, \u043d\u0430\u0445\u043e\u0434\u0438\u0442\u0435\u0441\u044c \u043b\u0438 \u0432\u044b \u0432 \u0431\u043e\u044e.",
    "Show player ultimate indicators on V1 healthbars.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440\u044b \u0443\u043b\u044c\u0442\u044b \u0438\u0433\u0440\u043e\u043a\u043e\u0432 \u043d\u0430 \u043f\u043e\u043b\u043e\u0441\u0430\u0445 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f V1.",
    "Show the estimated time for unsecured souls to dissapear.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043f\u0440\u0438\u043c\u0435\u0440\u043d\u043e\u0435 \u0432\u0440\u0435\u043c\u044f \u0434\u043e \u0438\u0441\u0447\u0435\u0437\u043d\u043e\u0432\u0435\u043d\u0438\u044f \u043d\u0435\u043d\u0430\u0434\u0451\u0436\u043d\u044b\u0445 \u0434\u0443\u0448.",
    "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u043d\u0430 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0435, \u043a\u043e\u0433\u0434\u0430 \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u0440\u0443\u043d\u044b.",
    "Shows a visual indicator in the minimap of when Mid Boss will spawn.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u043d\u0430 \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0435, \u043a\u043e\u0433\u0434\u0430 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u043c\u0438\u0434-\u0431\u043e\u0441\u0441.",
    "Changes urn color to know which side is favored, green for your team, red for the enemy.": "\u041f\u0435\u0440\u0435\u043a\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442 \u0443\u0440\u043d\u0443 \u0432 \u0437\u0430\u0432\u0438\u0441\u0438\u043c\u043e\u0441\u0442\u0438 \u043e\u0442 \u043f\u0435\u0440\u0435\u0432\u0435\u0441\u0430 \u043a\u043e\u043c\u0430\u043d\u0434.",
    "Shows a visual indicator in the top bar of the percentage difference of souls between teams.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438 \u043f\u0440\u043e\u0446\u0435\u043d\u0442\u043d\u0443\u044e \u0440\u0430\u0437\u043d\u0438\u0446\u0443 \u0434\u0443\u0448 \u043c\u0435\u0436\u0434\u0443 \u043a\u043e\u043c\u0430\u043d\u0434\u0430\u043c\u0438.",
    "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438, \u043a\u043e\u0433\u0434\u0430 \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u0440\u0443\u043d\u044b.",
    "Shows a visual indicator in the top bar of when Mid Boss will spawn.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438, \u043a\u043e\u0433\u0434\u0430 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u043c\u0438\u0434-\u0431\u043e\u0441\u0441.",
    "Shows all of your keybinds.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0432\u0441\u0435 \u0432\u0430\u0448\u0438 \u0431\u0438\u043d\u0434\u044b.",
    "Shows all of your player stats within the shop menu.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0432\u0441\u0435 \u0432\u0430\u0448\u0438 \u0445\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0438 \u0438\u0433\u0440\u043e\u043a\u0430 \u0432 \u043c\u0435\u043d\u044e \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430.",
    "Shows item cooldowns near crosshair for easier readability.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043a\u0443\u043b\u0434\u0430\u0443\u043d\u044b \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432 \u0440\u044f\u0434\u043e\u043c \u0441 \u043f\u0440\u0438\u0446\u0435\u043b\u043e\u043c \u0434\u043b\u044f \u0443\u0434\u043e\u0431\u0441\u0442\u0432\u0430.",
    "Shows the individual player souls per minute on scoreboard and the team in the top bar.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0434\u0443\u0448\u0438 \u0432 \u043c\u0438\u043d\u0443\u0442\u0443 \u0434\u043b\u044f \u0438\u0433\u0440\u043e\u043a\u043e\u0432 \u043d\u0430 \u0442\u0430\u0431\u043b\u043e \u0438 \u0434\u043b\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u044b \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438.",
    "Shows the individual player's objective damage in the top bar.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0443\u0440\u043e\u043d \u043f\u043e \u043e\u0431\u044a\u0435\u043a\u0442\u0430\u043c \u0434\u043b\u044f \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u0438\u0433\u0440\u043e\u043a\u0430 \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438.",
    "Shows the individual player's unspent souls in the top bar.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043d\u0435\u043f\u043e\u0442\u0440\u0430\u0447\u0435\u043d\u043d\u044b\u0435 \u0434\u0443\u0448\u0438 \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u0438\u0433\u0440\u043e\u043a\u0430 \u043d\u0430 \u0432\u0435\u0440\u0445\u043d\u0435\u0439 \u043f\u0430\u043d\u0435\u043b\u0438.",
    "Shows your character in the shop menu.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0432\u0430\u0448\u0435\u0433\u043e \u0433\u0435\u0440\u043e\u044f \u0432 \u043c\u0435\u043d\u044e \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430.",
    "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).": "\u0421\u0438\u043b\u044c\u043d\u043e \u043f\u043e\u0432\u044b\u0448\u0430\u0435\u0442 \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c \u0440\u043e\u043c\u0431\u0430-\u0446\u0435\u043b\u0438 \u0438 \u043f\u043e\u0434\u0441\u0432\u0435\u0442\u043a\u0438 \u043f\u043e\u0440\u043e\u0433\u0430 \u0434\u043e\u0431\u0438\u0432\u0430\u043d\u0438\u044f (Shiv).",
    "Simplifies the Compass overlay to its bare elements.": "\u0423\u043f\u0440\u043e\u0449\u0430\u0435\u0442 \u043e\u0432\u0435\u0440\u043b\u0435\u0439 \u043a\u043e\u043c\u043f\u0430\u0441\u0430 \u0434\u043e \u0431\u0430\u0437\u043e\u0432\u044b\u0445 \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u043e\u0432.",
    "Slight adjustments to the HUD for better streaming output.": "\u041d\u0435\u0431\u043e\u043b\u044c\u0448\u0438\u0435 \u0441\u0434\u0432\u0438\u0433\u0438 HUD \u0434\u043b\u044f \u0431\u043e\u043b\u0435\u0435 \u0443\u0434\u043e\u0431\u043d\u043e\u0433\u043e \u0441\u0442\u0440\u0438\u043c-\u0432\u044b\u0432\u043e\u0434\u0430.",
    "Speed number tracker.": "\u0422\u0440\u0435\u043a\u0435\u0440 \u0447\u0438\u0441\u043b\u043e\u0432\u043e\u0433\u043e \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u0438.",
    "Stretch the compass horizontally.": "\u0420\u0430\u0441\u0442\u044f\u0433\u0438\u0432\u0430\u0435\u0442 \u043a\u043e\u043c\u043f\u0430\u0441 \u043f\u043e \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u0438.",
    "Stretch the compass vertically.": "\u0420\u0430\u0441\u0442\u044f\u0433\u0438\u0432\u0430\u0435\u0442 \u043a\u043e\u043c\u043f\u0430\u0441 \u043f\u043e \u0432\u0435\u0440\u0442\u0438\u043a\u0430\u043b\u0438.",
    "The circle countdown for when you are reloading.": "\u041a\u0440\u0443\u0433\u043e\u0432\u043e\u0439 \u0442\u0430\u0439\u043c\u0435\u0440 \u043e\u0431\u0440\u0430\u0442\u043d\u043e\u0433\u043e \u043e\u0442\u0441\u0447\u0451\u0442\u0430 \u043f\u0440\u0438 \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0435.",
    "The cosmetic ability on your default 5 key, like posters and snowballs.": "\u041a\u043e\u0441\u043c\u0435\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c \u043d\u0430 \u043a\u043b\u0430\u0432\u0438\u0448\u0435 5 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e, \u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 \u043f\u043e\u0441\u0442\u0435\u0440\u044b \u0438 \u0441\u043d\u0435\u0436\u043a\u0438.",
    "The damage dealt to Trooper minions.": "\u0423\u0440\u043e\u043d, \u043d\u0430\u043d\u0435\u0441\u0451\u043d\u043d\u044b\u0439 \u043a\u0440\u0438\u043f\u0430\u043c-\u0442\u0440\u0443\u043f\u0435\u0440\u0430\u043c.",
    "The icon that replaces your crosshair when reloading.": "\u0418\u043a\u043e\u043d\u043a\u0430, \u043a\u043e\u0442\u043e\u0440\u0430\u044f \u0437\u0430\u043c\u0435\u043d\u044f\u0435\u0442 \u043f\u0440\u0438\u0446\u0435\u043b \u0432\u043e \u0432\u0440\u0435\u043c\u044f \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0438.",
    "The interval in which the sound plays in seconds.": "\u0418\u043d\u0442\u0435\u0440\u0432\u0430\u043b \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u044f \u0437\u0432\u0443\u043a\u0430 \u0432 \u0441\u0435\u043a\u0443\u043d\u0434\u0430\u0445.",
    "The item buying auto queue system in the shop menu.": "\u0421\u0438\u0441\u0442\u0435\u043c\u0430 \u0430\u0432\u0442\u043e\u043e\u0447\u0435\u0440\u0435\u0434\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432 \u0432 \u043c\u0435\u043d\u044e \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430.",
    "The large cumulative damage number.": "\u0411\u043e\u043b\u044c\u0448\u043e\u0435 \u0441\u0443\u043c\u043c\u0430\u0440\u043d\u043e\u0435 \u0447\u0438\u0441\u043b\u043e \u0443\u0440\u043e\u043d\u0430.",
    "The popup signifying you are too low on stamina to cast another movement input.": "\u0412\u0441\u043f\u043b\u044b\u0432\u0430\u044e\u0449\u0435\u0435 \u043f\u0440\u0435\u0434\u0443\u043f\u0440\u0435\u0436\u0434\u0435\u043d\u0438\u0435, \u0447\u0442\u043e \u0443 \u0432\u0430\u0441 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u0430\u043b\u043e \u0432\u044b\u043d\u043e\u0441\u043b\u0438\u0432\u043e\u0441\u0442\u0438 \u0434\u043b\u044f \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0433\u043e \u043c\u0443\u0432\u043c\u0435\u043d\u0442\u0430.",
    "The small incremental damage numbers.": "\u041c\u0430\u043b\u044b\u0435 \u0438\u043d\u043a\u0440\u0435\u043c\u0435\u043d\u0442\u0430\u043b\u044c\u043d\u044b\u0435 \u0447\u0438\u0441\u043b\u0430 \u0443\u0440\u043e\u043d\u0430.",
    "The small visual icon.": "\u041c\u0430\u043b\u0435\u043d\u044c\u043a\u0430\u044f \u0432\u0438\u0437\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u0438\u043a\u043e\u043d\u043a\u0430.",
    "The unsecured text.": "\u0422\u0435\u043a\u0441\u0442 \u043d\u0435\u043d\u0430\u0434\u0451\u0436\u043d\u044b\u0445 \u0434\u0443\u0448.",
    "The world background blur effect behind the shop menu.": "\u042d\u0444\u0444\u0435\u043a\u0442 \u0440\u0430\u0437\u043c\u044b\u0442\u0438\u044f \u043c\u0438\u0440\u0430 \u043d\u0430 \u0444\u043e\u043d\u0435 \u043c\u0435\u043d\u044e \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430.",
    "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.": "\u042d\u0442\u043e \u043b\u0451\u0433\u043a\u0430\u044f \u0432\u0435\u0440\u0441\u0438\u044f \u0441 \u0437\u0430\u043c\u0435\u0442\u043d\u043e \u043b\u0443\u0447\u0448\u0438\u043c FPS, \u043d\u043e \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u044b\u0439 \u0444\u0430\u0439\u043b \u0444\u0438\u043b\u044c\u0442\u0440\u043e\u0432.",
    "Time before the announcement happens in seconds.": "\u0412\u0440\u0435\u043c\u044f \u0434\u043e \u0441\u0440\u0430\u0431\u0430\u0442\u044b\u0432\u0430\u043d\u0438\u044f \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0432 \u0441\u0435\u043a\u0443\u043d\u0434\u0430\u0445.",
    "Total ammo amount.": "\u041e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432.",
    "View a cooldown timer for reloading time.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0442\u0430\u0439\u043c\u0435\u0440 \u043a\u0443\u043b\u0434\u0430\u0443\u043d\u0430 \u0432\u0440\u0435\u043c\u0435\u043d\u0438 \u043f\u0435\u0440\u0435\u0437\u0430\u0440\u044f\u0434\u043a\u0438.",
    "View an enhanced minimap on opening ability menu.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u043d\u0443\u044e \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0443 \u043f\u0440\u0438 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u0438 \u043c\u0435\u043d\u044e \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0435\u0439.",
    "View an enhanced minimap on opening scoreboard menu.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u043d\u0443\u044e \u043c\u0438\u043d\u0438\u043a\u0430\u0440\u0442\u0443 \u043f\u0440\u0438 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u0438 \u0442\u0430\u0431\u043b\u043e.",
    "View the cooldown time of player ultimates.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0432\u0440\u0435\u043c\u044f \u043a\u0443\u043b\u0434\u0430\u0443\u043d\u0430 \u0443\u043b\u044c\u0442\u0438\u043c\u0435\u0439\u0442\u043e\u0432 \u0438\u0433\u0440\u043e\u043a\u043e\u0432.",
    "Visual indicator of your current ammo.": "\u0412\u0438\u0437\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u0438\u043d\u0434\u0438\u043a\u0430\u0442\u043e\u0440 \u0442\u0435\u043a\u0443\u0449\u0438\u0445 \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432.",
    "You can download custom announcer packs, just download the correct one for the slot you want to replace.": "\u0412\u044b \u043c\u043e\u0436\u0435\u0442\u0435 \u0441\u043a\u0430\u0447\u0430\u0442\u044c \u043a\u0430\u0441\u0442\u043e\u043c\u043d\u044b\u0435 \u043d\u0430\u0431\u043e\u0440\u044b \u043e\u0437\u0432\u0443\u0447\u043a\u0438, \u043f\u0440\u043e\u0441\u0442\u043e \u0441\u043a\u0430\u0447\u0430\u0439\u0442\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u044b\u0439 \u0434\u043b\u044f \u0442\u043e\u0433\u043e \u0441\u043b\u043e\u0442\u0430, \u043a\u043e\u0442\u043e\u0440\u044b\u0439 \u0445\u043e\u0442\u0438\u0442\u0435 \u0437\u0430\u043c\u0435\u043d\u0438\u0442\u044c.",
    "COPY": "\u0421\u041a\u041e\u041f\u0418\u0420\u041e\u0412\u0410\u0422\u042c",
    "COPIED": "\u0421\u041a\u041e\u041f\u0418\u0420\u041e\u0412\u0410\u041d\u041e",
    "FAILED": "\u041e\u0428\u0418\u0411\u041a\u0410",
    "SAVE": "\u0421\u041e\u0425\u0420\u0410\u041d\u0418\u0422\u042c",
    "HIDEOUT": "\u0423\u0411\u0415\u0416\u0418\u0429\u0415",
    "QUEUED": "\u0412 \u041e\u0427\u0415\u0420\u0415\u0414\u0418",
    "APPLY": "\u041f\u0420\u0418\u041c\u0415\u041d\u0418\u0422\u042c",
    "APPLIED": "\u041f\u0420\u0418\u041c\u0415\u041d\u0415\u041d\u041e",
    "AIRHEART": "AIRHEART",
    "SAVING": "\u0421\u041e\u0425\u0420\u0410\u041d\u0415\u041d\u0418\u0415",
    "VERIFY": "\u041f\u0420\u041e\u0412\u0415\u0420\u041a\u0410",
    "SAVED": "\u0421\u041e\u0425\u0420\u0410\u041d\u0415\u041d\u041e",
    "TIMEOUT": "\u0422\u0410\u0419\u041c-\u0410\u0423\u0422",
    "CLEAR": "\u041e\u0427\u0418\u0421\u0422\u0418\u0422\u042c",
    "CLEARING": "\u041e\u0427\u0418\u0421\u0422\u041a\u0410",
    "CLEARED": "\u041e\u0427\u0418\u0429\u0415\u041d\u041e",
    "Statistics": "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430",
    "Combat Status": "\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0431\u043e\u044f",
    "Easy": "\u041b\u0435\u0433\u043a\u0438\u0439",
    "Hard": "\u0422\u044f\u0436\u0435\u043b\u044b\u0439",
    "SUPPORT THE MOD": "\u041f\u041e\u0414\u0414\u0415\u0420\u0416\u0410\u0422\u042c \u041c\u041e\u0414",
    "CHANGE LOG": "\u0421\u041f\u0418\u0421\u041e\u041a \u0418\u0417\u041c\u0415\u041d\u0415\u041d\u0418\u0419",
    "Russian": "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
    "Chinese": "\u041a\u0438\u0442\u0430\u0439\u0441\u043a\u0438\u0439",
    "Portuguese": "\u041f\u043e\u0440\u0442\u0443\u0433\u0430\u043b\u044c\u0441\u043a\u0438\u0439",
    "BR Portuguese": "\u0411\u0420 \u041f\u043e\u0440\u0442\u0443\u0433\u0430\u043b\u044c\u0441\u043a\u0438\u0439",
    "Spanish": "\u0418\u0441\u043f\u0430\u043d\u0441\u043a\u0438\u0439",
    "Optimize Mode": "\u0420\u0435\u0436\u0438\u043c \u043e\u043f\u0442\u0438\u043c\u0438\u0437\u0430\u0446\u0438\u0438",
    "Shown Items": "\u0424\u0438\u043b\u044c\u0442\u0440 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043e\u0432",
    "Wraithjack": "Wraithjack",
    "Play Sound": "\u041f\u0440\u043e\u0438\u0433\u0440\u0430\u0442\u044c \u0437\u0432\u0443\u043a",
    "Fighting Game": "\u0424\u0430\u0439\u0442\u0438\u043d\u0433",
    "Open shop to continue save.": "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d \u0447\u0442\u043e \u0431\u044b \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435.",
    "Switching to Airheart...": "\u041c\u0435\u043d\u044f\u0435\u043c \u0433\u0435\u0440\u043e\u044f \u043d\u0430 Airheart...",
    "Writing settings string to build...": "\u0417\u0430\u043f\u0438\u0441\u044b\u0432\u0430\u0435\u043c \u0441\u0442\u0440\u043e\u043a\u0443 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a \u0432 \u0431\u0438\u043b\u0434...",
    "Save in progress...": "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0432 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0435...",
    "Save timed out. Try again.": "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b\u043e \u043e\u0442\u0432\u0435\u0442 \u0432\u043e\u0432\u0440\u0435\u043c\u044f. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.",
    "Save completed.": "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0437\u0430\u043a\u043e\u043d\u0447\u0435\u043d\u043e.",
    "Save failed.": "\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f.",
    "Save works only in hideout.": "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u0443\u0431\u0435\u0436\u0438\u0449\u0435.",
    "Failed to queue save request.": "\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u044c.",
    "Save queued.": "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u043f\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u044c.",
    "Open shop to continue clear.": "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d \u0447\u0442\u043e \u0431\u044b \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u043e\u0447\u0438\u0441\u0442\u043a\u0443.",
    "Confirming Airheart for clear...": "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 Airheart \u0434\u043b\u044f \u0447\u0438\u0441\u0442\u043a\u0438...",
    "Clearing builds...": "\u041e\u0447\u0438\u0449\u0430\u0435\u043c \u0431\u0438\u043b\u0434\u044b...",
    "Clear in progress...": "\u0418\u0434\u0451\u0442 \u043e\u0447\u0438\u0441\u0442\u043a\u0430...",
    "Clear timed out. Try again.": "\u041e\u0447\u0438\u0441\u0442\u043a\u0430 \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b\u0430 \u043e\u0442\u0432\u0435\u0442 \u0432\u043e\u0432\u0440\u0435\u043c\u044f. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.",
    "Clear completed.": "\u041e\u0447\u0438\u0441\u0442\u043a\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430.",
    "Clear failed.": "\u041e\u0447\u0438\u0441\u0442\u043a\u0430 \u043d\u0435 \u0443\u0434\u0430\u043b\u0430\u0441\u044c.",
    "en": "en",
    "Section already at defaults.": "\u0421\u0435\u043a\u0446\u0438\u044f \u0443\u0436\u0435 \u0438\u043c\u0435\u0435\u0442 \u0438\u0437\u043d\u0430\u0447\u0430\u043b\u044c\u043d\u044b\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f.",
    "Ready.": "\u0413\u043e\u0442\u043e\u0432\u043e.",
    "Share or save your settings configuration!": "\u041f\u043e\u0434\u0435\u043b\u0438\u0442\u0435\u0441\u044c \u0438\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u0435 \u0441\u0432\u043e\u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438!",
    "Local settings loaded.": "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u044b.",
    "Export string copied.": "\u0421\u0442\u0440\u043e\u043a\u0430 \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0430 \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0430.",
    "Clipboard copy failed.": "\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0432 \u0431\u0443\u0444\u0435\u0440 \u043e\u0431\u043c\u0435\u043d\u0430 \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c.",
    "Airheart switch sent.": "\u0417\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 \u0441\u043c\u0435\u043d\u0443 \u0433\u0435\u0440\u043e\u044f \u043d\u0430 Airheart",
    "Failed to switch hero.": "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043c\u0435\u043d\u044f\u0442\u044c \u0433\u0435\u0440\u043e\u044f.",
    "Strings may sometimes break between mod versions.": "\u0421\u0442\u0440\u043e\u043a\u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a \u043c\u043e\u0433\u0443\u0442 \u043b\u043e\u043c\u0430\u0442\u044c\u0441\u044f \u043f\u043e\u0441\u043b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0439.",
    "Import: parsing string...": "\u0418\u043c\u043f\u043e\u0440\u0442: \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u0441\u0442\u0440\u043e\u043a\u0438...",
    "Import: applying settings...": "\u0418\u043c\u043f\u043e\u0440\u0442: \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u044e\u0442\u0441\u044f \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438...",
    "Import: refreshing UI...": "\u0418\u043c\u043f\u043e\u0440\u0442: \u043f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0441\u044f \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441...",
    "Import failed.": "\u0418\u043c\u043f\u043e\u0440\u0442 \u043d\u0435 \u0443\u0434\u0430\u043b\u0441\u044f",
    "Invalid import string.": "\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043a\u043e\u0434 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a",
    "Row already at defaults.": "\u0420\u044f\u0434\u044b \u0443\u0436\u0435 \u043f\u0440\u0438\u0432\u0435\u0434\u0435\u043d\u044b \u043a \u0438\u0437\u043d\u0430\u0447\u0430\u043b\u044c\u043d\u044b\u043c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f\u043c",
    "Preset apply failed.": "\u041f\u043e\u043f\u044b\u0442\u043a\u0430 \u043f\u0440\u0438\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043f\u0440\u0435\u0441\u0435\u0442\u0430 \u043d\u0435 \u0443\u0434\u0430\u043b\u0430\u0441\u044c",
    "Scales the element.": "\u0418\u0437\u043c\u0435\u043d\u044f\u0435\u0442 \u0440\u0430\u0437\u043c\u0435\u0440\u044b \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u0430",
    "Changes the element's transparency.": "\u0418\u0437\u043c\u0435\u043d\u044f\u0435\u0442 \u043f\u0440\u043e\u0437\u0440\u0430\u0447\u043d\u043e\u0441\u0442\u044c \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u0430",
    "Moves the element horizontally.": "\u0414\u0432\u0438\u0433\u0430\u0435\u0442 \u044d\u043b\u0435\u043c\u0435\u043d\u0442 \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u043e",
    "Moves the element vertically.": "\u0414\u0432\u0438\u0433\u0430\u0435\u0442 \u044d\u043b\u0435\u043c\u0435\u043d\u0442 \u0432\u0435\u0440\u0442\u0438\u043a\u0430\u043b\u044c\u043d\u043e",
    "Reset to default value": "\u0412\u0435\u0440\u043d\u0443\u0442\u044c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043a \u0438\u0437\u043d\u0430\u0447\u0430\u043b\u044c\u043d\u043e\u043c\u0443",
    "Reset row to defaults": "\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0440\u044f\u0434\u044b \u0434\u043e \u0438\u0437\u043d\u0430\u0447\u0430\u043b\u044c\u043d\u044b\u0445 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439",
    "Randomly opens an enabled arcade game while dead.": "\u041e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u0443\u044e \u0430\u0440\u043a\u0430\u0434\u0443 \u0438\u0437 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0445 \u0432\u043e \u0432\u0440\u0435\u043c\u044f \u0441\u043c\u0435\u0440\u0442\u0438",
    "Fountain-style damage number animation.": "\u0421\u0442\u0438\u043b\u044c \u0443\u0440\u043e\u043d\u0430, \u0432 \u043a\u043e\u0442\u043e\u0440\u043e\u043c \u0447\u0438\u0441\u043b\u0430 \u0432\u044b\u043b\u0435\u0442\u0430\u044e\u0442 \u043a\u0430\u043a \u0444\u043e\u043d\u0442\u0430\u043d",
    "Troubleshoot": "\u0420\u0435\u0448\u0438\u0442\u044c \u043d\u0435\u0438\u0441\u043f\u0440\u0430\u0432\u043d\u043e\u0441\u0442\u044c",
    "Settings Changes": "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a",
    "Changes:": "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f:",
    "Confirm": "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c",
    "Cancel": "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c",
    "The displayed language of the settings menu.": "\u042f\u0437\u044b\u043a \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f \u043c\u0435\u043d\u044e \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a",
    "Preview realtime changes to settings when modifying them.": "\u041e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438 \u0442\u0430\u043c, \u0433\u0434\u0435 \u044d\u0442\u043e \u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e",
    "Restores the legacy removed duration bars for abilities.": "\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u0442 \u0441\u0442\u0430\u0440\u044b\u0435 \u043f\u043e\u043b\u043e\u0441\u043a\u0438 \u043a\u0430\u0441\u0442\u0430 \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0435\u0439",
    "Centers the friends list area within the ESC menu.": "\u041e\u0442\u0446\u0435\u043d\u0442\u0440\u043e\u0432\u044b\u0432\u0430\u0435\u0442 \u0441\u043f\u0438\u0441\u043e\u043a \u0434\u0440\u0443\u0437\u0435\u0439 \u0432 ESC",
    "Enhanced V2 enemy healthbar visuals and readability.": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u044b\u0439 \u0441\u0442\u0438\u043b\u044c \u043f\u043e\u043b\u043e\u0441\u043e\u043a \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f v2 ",
    "Show the UnitInfo panel on V2 enemy healthbars.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c UnitInfo \u0441 \u043f\u043e\u043b\u043e\u0441\u043a\u0430\u043c\u0438 \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f v2  ",
    "Show level text on V2 enemy healthbars.": "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043e\u043a\u043e\u043b\u043e \u043f\u043e\u043b\u043e\u0441\u043e\u043a \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f v2",
    "V2 enemy healthbar enhancements.": "\u0423\u043b\u0443\u0447\u0448\u0435\u043d\u0438\u044f \u043f\u043e\u043b\u043e\u0441\u043e\u043a \u0437\u0434\u043e\u0440\u043e\u0432\u044c\u044f v2",
    "Welcome to QOL Lock": "\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u0432 QOL Lock",
};

const SETTINGS_ZH_TEXT = {
    "Config": "\u914d\u7f6e",
    "Presets": "\u9884\u8bbe",
    "Crosshair": "\u5341\u5b57\u7ebf",
    "HUD": "HUD",
    "UI": "UI",
    "Overlay": "\u8986\u76d6",
    "Minimap": "\u5c0f\u5730\u56fe",
    "Audio": "\u58f0\u97f3\u7684",
    "Console": "\u5b89\u6170",
    "General": "\u5e38\u89c4",
    "Discord": "\u4e0d\u548c\u8c10",
    "Support": "\u652f\u6301",
    "Meta Settings": "\u57fa\u672c\u8bbe\u7f6e",
    "Preview": "\u9884\u89c8",
    "Drag": "\u62d6",
    "Language": "\u8bed\u8a00",
    "Default Hero": "\u9ed8\u8ba4\u82f1\u96c4",
    "English": "\u82f1\u8bed",
    "French": "\u6cd5\u8bed",
    "Settings UI Language": "\u8bbe\u7f6e\u754c\u9762\u8bed\u8a00",
    "Hero on Load or Save": "\u52a0\u8f7d\u6216\u4fdd\u5b58\u65f6\u7684\u82f1\u96c4",
    "Realtime Settings Changes": "\u5b9e\u65f6\u8bbe\u7f6e\u66f4\u6539",
    "Realtime Changes": "\u5b9e\u65f6\u66f4\u6539",
    "Draggable UI": "\u53ef\u62d6\u52a8\u7684\u7528\u6237\u754c\u9762",
    "Enable": "\u542f\u7528",
    "Export Settings": "\u5bfc\u51fa\u8bbe\u7f6e",
    "Import Settings": "\u5bfc\u5165\u8bbe\u7f6e",
    "Export String": "\u5bfc\u51fa\u5b57\u7b26\u4e32",
    "Import String": "\u5bfc\u5165\u5b57\u7b26\u4e32",
    "How to Save Settings": "\u5982\u4f55\u4fdd\u5b58\u8bbe\u7f6e",
    "Share your settings string": "\u5206\u4eab\u60a8\u7684\u8bbe\u7f6e\u5b57\u7b26\u4e32",
    "Paste and apply an exported settings string": "\u7c98\u8d34\u5e76\u5e94\u7528\u5bfc\u51fa\u7684\u8bbe\u7f6e\u5b57\u7b26\u4e32",
    "Search Results": "\u641c\u7d22\u7ed3\u679c",
    "No results found": "\u6ca1\u6709\u627e\u5230\u7ed3\u679c",
    "Better Item Cooldowns": "\u66f4\u597d\u7684\u7269\u54c1\u51b7\u5374\u65f6\u95f4",
    "Item Cooldowns": "\u7269\u54c1\u51b7\u5374\u65f6\u95f4",
    "Tracked cooldowns near crosshair": "\u8ffd\u8e2a\u5341\u5b57\u51c6\u7ebf\u9644\u8fd1\u7684\u51b7\u5374\u65f6\u95f4",
    "Light Item Cooldowns": "Light Item Cooldowns",
    "Advanced Mode": "\u9ad8\u7ea7\u6a21\u5f0f",
    "Optimize Filters": "\u4f18\u5316\u8fc7\u6ee4\u5668",
    "No filter settings but better FPS.": "\u6ca1\u6709\u6ee4\u955c\u8bbe\u7f6e\uff0c\u4f46 FPS \u66f4\u9ad8\u3002",
    "Filters": "\u8fc7\u6ee4\u5668",
    "Get Filter File Only": "\u4ec5\u83b7\u53d6\u8fc7\u6ee4\u5668\u6587\u4ef6",
    "Download": "\u4e0b\u8f7d",
    "Advanced Filter": "\u9ad8\u7ea7\u8fc7\u6ee4",
    "Defensive Passive": "\u9632\u5fa1\u88ab\u52a8",
    "Offensive Passive": "\u653b\u51fb\u88ab\u52a8",
    "Defensive Active": "\u9632\u5fa1\u4e3b\u52a8",
    "Offensive Active": "\u653b\u51fb\u4e3b\u52a8",
    "Damage Numbers": "\u4f24\u5bb3\u6570\u5b57",
    "Ammo": "\u5f39\u836f",
    "Reload Cooldown": "\u6362\u5f39\u51b7\u5374",
    "Reloading": "\u6362\u5f39",
    "Item Target Reticle": "\u76ee\u6807\u51c6\u661f\u6307\u793a",
    "Top Bar Plus": "\u9876\u680f\u52a0",
    "Top Bar": "\u9876\u680f",
    "Shop": "\u5546\u5e97",
    "HUD Controls": "HUD\u63a7\u5236",
    "UI Controls": "UI\u63a7\u5236",
    "Chat": "\u804a\u5929",
    "Legacy Durations": "\u4f20\u7edf\u6301\u7eed\u65f6\u95f4\u6761",
    "Healthbar": "\u5065\u5eb7\u680f",
    "Player": "\u73a9\u5bb6",
    "Bottom Bar": "\u5e95\u680f",
    "Simplify": "\u7b80\u5316",
    "Zipline Boost": "\u6ed1\u7d22\u63d0\u5347",
    "Souls Timer": "\u7075\u9b42\u8ba1\u65f6\u5668",
    "Unsecured Souls Timer": "\u4e0d\u5b89\u5168\u7684\u7075\u9b42\u8ba1\u65f6\u5668",
    "Unsecured Timer": "\u9b42\u9b44\u8ba1\u65f6\u5668",
    "Better Unsecured": "\u66f4\u597d\u7684\u65e0\u4fdd\u969c",
    "Better Unsecured Souls": "\u66f4\u597d\u7684\u65e0\u4fdd\u969c\u7684\u7075\u9b42",
    "Unsecured Plus": "\u9b42\u9b44\u6570\u91cf",
    "Keyboard": "\u952e\u76d8",
    "Compass": "\u7f57\u76d8",
    "Ult Cooldowns": "\u5927\u62db\u51b7\u5374\u65f6\u95f4",
    "Alt Zoom": "Alt \u7f29\u653e",
    "Tab Zoom": "Tab \u7f29\u653e",
    "Announcer": "\u63d0\u793a\u97f3\u6548",
    "Arcade": "\u5c0f\u6e38\u620f",
    "Game Settings": "\u6e38\u620f\u8bbe\u7f6e",
    "Games": "\u6e38\u620f",
    "Game Audio": "\u6e38\u620f\u97f3\u6548",
    "Difficulty": "\u96be\u5ea6",
    "Supporting and Feature Requests": "\u652f\u6301\u548c\u529f\u80fd\u8bf7\u6c42",
    "Issues, Feedback and Ideas": "\u95ee\u9898\u3001\u53cd\u9988\u548c\u60f3\u6cd5",
    "Contact": "\u63a5\u89e6",
    "Special Thanks": "\u7279\u522b\u611f\u8c22",
    "Size": "\u5c3a\u5bf8",
    "Opacity": "\u4e0d\u900f\u660e\u5ea6",
    "Scale": "\u89c4\u6a21",
    "Horizontal Offset": "\u6c34\u5e73\u504f\u79fb",
    "Vertical Offset": "\u5782\u76f4\u504f\u79fb",
    "Horizontal Stretch": "\u6c34\u5e73\u62c9\u4f38",
    "Vertical Stretch": "\u5782\u76f4\u62c9\u4f38",
    "Visual": "\u89c6\u89c9\u6548\u679c",
    "Hide All": "\u5168\u90e8\u9690\u85cf",
    "Current": "\u5f53\u524d\u5c3a\u5bf8",
    "Total": "\u603b\u8ba1",
    "Icon": "\u56fe\u6807",
    "Circle": "\u5706\u5708",
    "Big Number": "\u5927\u6570\u5b57",
    "Big Numbers": "\u5927\u6570\u5b57",
    "Damage Fountain": "\u4f24\u5bb3\u6570\u5b57\u55b7\u6cc9\u7279\u6548",
    "Small Numbers": "\u5c0f\u6570\u5b57",
    "Trooper Damage": "\u58eb\u5175\u4f24\u5bb3",
    "Hide Current": "\u9690\u85cf\u5f53\u524d",
    "Hide Total": "\u9690\u85cf\u603b\u8ba1",
    "Hide Icon": "\u9690\u85cf\u56fe\u6807",
    "Hide Circle": "\u9690\u85cf\u5706\u5708",
    "Hide Big Number": "\u9690\u85cf\u5927\u6570\u5b57",
    "Hide Small Numbers": "\u9690\u85cf\u5c0f\u6570\u5b57",
    "Hide Trooper Damage": "\u9690\u85cf\u58eb\u5175\u4f24\u5bb3",
    "Highlight Mode": "\u9ad8\u4eae\u6a21\u5f0f",
    "Big Red": "\u5927\u7ea2\u8272",
    "Unspent Souls": "\u672a\u4f7f\u7528\u7684\u9b42\u9b44",
    "Souls Per Minute": "\u6bcf\u5206\u949f\u9b42\u9b44\u6570",
    "Objective Damage": "\u76ee\u6807\u4f24\u5bb3",
    "Objective Map": "\u76ee\u6807\u5730\u56fe",
    "Urn Difference": "\u56e2\u961f\u9b42\u9b44\u767e\u5206\u6bd4\u5dee\u5024",
    "Buff Timer": "\u589e\u76ca\u8ba1\u65f6\u5668",
    "Bridge Buff Timer": "\u6865\u6881 Buff  \u8ba1\u65f6\u5668",
    "Mid Boss Timer": "Mid Boss \u8ba1\u65f6\u5668",
    "Missing Hero Opaque": "\u6d88\u5931\u7684\u82f1\u96c4\u4e0d\u900f\u660e\u5316",
    "Display Stats": "\u663e\u793a\u7edf\u8ba1\u6570\u636e",
    "Display Hero": "\u663e\u793a\u82f1\u96c4",
    "Simplify Shop": "\u7b80\u5316\u5546\u5e97",
    "Stats": "\u7edf\u8ba1\u6570\u636e",
    "Hero": "\u82f1\u96c4",
    "Minimalist": "\u6781\u7b80",
    "Blur": "\u6a21\u7cca",
    "Quick Buy": "\u5feb\u901f\u8d2d\u4e70",
    "Hide Blur": "\u9690\u85cf\u6a21\u7cca",
    "Hide Quick Buy": "\u9690\u85cf\u5feb\u901f\u8d2d\u4e70",
    "16:10 Support": "16:10 \u652f\u6301",
    "4:3 Support": "4:3 \u652f\u6301",
    "21:9 Stream Fix": "21:9 Stream \u4fee\u590d",
    "Centered ESC Menu": "\u5c45\u4e2d ESC \u83dc\u5355",
    "Centered Friends List": "\u5c45\u4e2d\u597d\u53cb\u5217\u8868",
    "Statlocker": "Statlocker",
    "Force Testing Tools": "\u529b\u6d4b\u8bd5\u5de5\u5177",
    "Show Testing Tools": "\u663e\u793a\u6d4b\u8bd5\u5de5\u5177",
    "Hide Testing Tools": "\u9690\u85cf\u6d4b\u8bd5\u5de5\u5177",
    "Behavior Summary": "\u884c\u4e3a\u603b\u7ed3",
    "Failed Hint": "\u5931\u8d25\u63d0\u793a",
    "Ability Suggestion": "\u80fd\u529b\u5efa\u8bae",
    "Cosmetic Ability": "\u88c5\u9970\u6280\u80fd",
    "Hide Behavior Summary": "\u9690\u85cf\u884c\u4e3a\u6458\u8981",
    "Hide Failed Hint": "\u9690\u85cf\u5931\u8d25\u63d0\u793a",
    "Hide Ability Suggestion": "\u9690\u85cf\u80fd\u529b\u5efa\u8bae",
    "Hide Cosmetic Ability": "\u9690\u85cf\u88c5\u9970\u80fd\u529b",
    "Damage Report": "\u4f24\u5bb3\u62a5\u544a",
    "Adjust the in-game chat position and scale.": "\u8c03\u6574\u6e38\u620f\u5185\u804a\u5929\u7684\u4f4d\u7f6e\u548c\u7f29\u653e\u3002",
    "Adjust size of the in-game chat.": "\u8c03\u6574\u6e38\u620f\u5185\u804a\u5929\u7684\u5927\u5c0f\u3002",
    "Adjust horizontal position of the in-game chat.": "\u8c03\u6574\u6e38\u620f\u5185\u804a\u5929\u7684\u6c34\u5e73\u4f4d\u7f6e\u3002",
    "Adjust vertical position of the in-game chat.": "\u8c03\u6574\u6e38\u620f\u5185\u804a\u5929\u7684\u5782\u76f4\u4f4d\u7f6e\u3002",
    "Show the in-game chat panel.": "\u663e\u793a\u6e38\u620f\u5185\u804a\u5929\u9762\u677f\u3002",
    "Hide Damage Report": "\u9690\u85cf\u635f\u574f\u62a5\u544a",
    "Colored Healthbar": "\u5f69\u8272\u5065\u5eb7\u6761",
    "Colored Health": "\u6709\u8272\u5065\u5eb7",
    "Color Warning": "\u989c\u8272\u8b66\u544a",
    "Enemy": "\u654c\u4eba",
    "Minimalist Healthbar": "\u6781\u7b80\u5065\u5eb7\u680f",
    "Simplify Ability Icons": "\u7b80\u5316\u80fd\u529b\u56fe\u6807",
    "Simplify Items": "\u7b80\u5316\u9879\u76ee",
    "Minimalist Abilities": "\u6781\u7b80\u6280\u80fd\u680f",
    "Minimalist Item Bar": "\u6781\u7b80\u7269\u54c1\u680f",
    "Show Icon": "\u663e\u793a\u56fe\u6807",
    "Show Text": "\u663e\u793a\u6587\u5b57",
    "Text": "\u6587\u672c",
    "Full Keybinds": "\u5b8c\u6574\u6309\u952e\u7ed1\u5b9a",
    "Full Keys": "\u5168\u952e\u4f4d",
    "Show Speed": "\u663e\u793a\u901f\u5ea6",
    "Speed": "\u901f\u5ea6",
    "Minimalist Minimap": "\u6781\u7b80\u5c0f\u5730\u56fe",
    "Spinny Map": "\u65af\u5bbe\u5c3c\u5730\u56fe",
    "Spinny Mode": "\u65cb\u8f6c\u6a21\u5f0f",
    "Urn Colors": "\u74ee\u7684\u989c\u8272",
    "Draw Over UI": "\u8986\u76d6\u5728 UI \u4e0a\u65b9\u7ed8\u5236",
    "Neutral Camps": "\u4e2d\u7acb\u9635\u8425",
    "Type": "\u7c7b\u578b",
    "Bridge Buffs": "\u6865\u724c\u7231\u597d\u8005",
    "Bridge Buff": "\u6865\u724c\u7231\u597d\u8005",
    "Buff": "Buff",
    "Bridge Buff Delay": "\u6865\u589e\u76ca\u5ef6\u8fdf",
    "Buff Delay": "Buff \u5ef6\u8fdf",
    "Tier 1": "1 \u7ea7",
    "Tier 2": "2 \u7ea7",
    "Tier 3": "3 \u7ea7",
    "Voice": "\u58f0\u97f3\u7c7b\u578b",
    "Custom": "\u98ce\u4fd7",
    "XQC": "XQC",
    "Asmon": "\u963f\u65af\u8499",
    "Beep": "Beep",
    "Volume": "\u97f3\u91cf",
    "Quiet": "\u5b89\u9759\u7684",
    "Normal": "\u666e\u901a\u7684",
    "Loud": "\u5927\u58f0",
    "Preview Announcer": "\u9884\u89c8\u64ad\u97f3\u5458",
    "Test Announcer": "\u6d4b\u8bd5\u64ad\u97f3\u5458",
    "Minimap Reminder": "\u5c0f\u5730\u56fe\u63d0\u9192",
    "Timer": "\u5b9a\u65f6\u5668",
    "On Death Games": "\u8bba\u6b7b\u4ea1\u6e38\u620f",
    "On Death": "\u5728\u6b7b\u4ea1\u7684\u65f6\u5019",
    "Bebop Sweeper": "\u6bd4\u6ce2\u666e\u626b\u96f7",
    "Flappy Bat": "\u4e0b\u5760\u7684\u8759\u8760",
    "Graves Trainer": "\u683c\u745e\u5893\u7784\u51c6\u8bad\u7ec3",
    "Whack a Rem": "\u6253\u96f7\u59c6",
    "Zerggy Mania": "Zerggy \u72c2\u70ed",
    "Hitmarkers": "\u547d\u4e2d\u6807\u8bb0",
    "Off": "\u5173\u95ed",
    "On": "\u5f00\u542f",
    "Play": "\u6e38\u73a9",
    "Show Support": "\u663e\u793a\u652f\u6301",
    "Change Log": "\u53d8\u66f4\u65e5\u5fd7",
    "CHANGE LOG": "\u66f4\u65b0\u65e5\u5fd7",
    "Contributors": "\u8d21\u732e\u8005",
    "Open": "\u6253\u5f00",
    "Support development": "\u652f\u6301\u53d1\u5c55",
    "View updates": "\u67e5\u770b\u66f4\u65b0",
    "Community acknowledgements": "\u793e\u533a\u81f4\u8c22",
    "Open Config": "\u6253\u5f00\u914d\u7f6e",
    "You can support development by commissioning features or presets.": "\u60a8\u53ef\u4ee5\u901a\u8fc7\u8c03\u8bd5\u529f\u80fd\u6216\u9884\u8bbe\u6765\u652f\u6301\u5f00\u53d1\u3002",
    "Support development by commissioning features or presets.": "\u901a\u8fc7\u8c03\u8bd5\u529f\u80fd\u6216\u9884\u8bbe\u6765\u652f\u6301\u5f00\u53d1\u3002",
    "This is a way for me to give something back to the supporters.": "\u8fd9\u662f\u6211\u56de\u9988\u652f\u6301\u8005\u7684\u4e00\u79cd\u65b9\u5f0f\u3002",
    "All commissioned additions are released publicly and available to everyone.": "\u6240\u6709\u59d4\u6258\u6dfb\u52a0\u7684\u5185\u5bb9\u90fd\u4f1a\u516c\u5f00\u53d1\u5e03\u5e76\u63d0\u4f9b\u7ed9\u6240\u6709\u4eba\u3002",
    "The mod is <font color=\"#66cc99\">fully functional</font> and <font color=\"#66cc99\">free</font> for all users.": "\u8be5 MOD \u5bf9\u6240\u6709\u7528\u6237\u5747\u4e3a <font color=\"#66cc99\">\u5b8c\u6574\u53ef\u7528</font>\uff0c\u4e14 <font color=\"#66cc99\">\u514d\u8d39</font>\u3002",
    "Custom Preset Commission: <font color=\"#66cc99\">$25</font>": "\u81ea\u5b9a\u4e49\u9884\u8bbe\u59d4\u6258\uff1a<font color=\"#66cc99\">$25</font>",
    "<font color=\"#66cc99\">Free</font> updates for new features, <font color=\"#66cc99\">$5</font> for arbitrary changes": "<font color=\"#66cc99\">Free</font> updates for new features, <font color=\"#66cc99\">$5</font> for arbitrary changes",
    "Settings now load from your saved build string": "\u73b0\u5728\u4ece\u60a8\u4fdd\u5b58\u7684\u6784\u5efa\u5b57\u7b26\u4e32\u52a0\u8f7d\u8bbe\u7f6e",
    "New Feature Commission: <font color=\"#66cc99\">$10</font> to <font color=\"#66cc99\">$100</font>": "\u65b0\u529f\u80fd\u59d4\u6258\uff1a<font color=\"#66cc99\">$10</font> \u81f3 <font color=\"#66cc99\">$100</font>",
    "Depending on complexity and work involved": "\u53d6\u51b3\u4e8e\u590d\u6742\u6027\u548c\u6d89\u53ca\u7684\u5de5\u4f5c",
    "Discord: <font color=\"#66cc99\">civocivocivo</font>": "Discord: <font color=\"#66cc99\">civocivocivo</font>",
    "Without them QOL Lock would not be possible.": "\u6ca1\u6709\u4ed6\u4eec\uff0cQOL Lock \u5c31\u4e0d\u53ef\u80fd\u5b9e\u73b0\u3002",
    "If you encounter issues please join the Discord": "\u5982\u679c\u60a8\u9047\u5230\u95ee\u9898\uff0c\u8bf7\u52a0\u5165 Discord",
    "I am open to all feedback, suggestions, and ideas!": "\u6211\u5bf9\u6240\u6709\u53cd\u9988\u3001\u5efa\u8bae\u548c\u60f3\u6cd5\u6301\u5f00\u653e\u6001\u5ea6\uff01",
    "Default 18": "\u9ed8\u8ba4 18",
    "Default 400": "\u9ed8\u8ba4 400",
    "Hud Shift": "\u5e73\u89c6\u663e\u793a\u5668\u79fb\u4f4d",
    "Easier Access": "\u66f4\u65b9\u4fbf\u7684\u8bbf\u95ee",
    "Always Visible Override": "\u59cb\u7ec8\u53ef\u89c1\u8986\u76d6",
    "Always Shown": "\u59cb\u7ec8\u663e\u793a",
    "Always Hidden": "\u59cb\u7ec8\u9690\u85cf",
    "Metro Button": "\u5730\u94c1\u6309\u94ae",
    "Low Stamina Popup": "\u4f4e\u8010\u529b\u5f39\u51fa\u7a97\u53e3",
    "On Ability Upgrade": "\u5173\u4e8e\u80fd\u529b\u63d0\u5347",
    "Snowball or Poster": "\u96ea\u7403\u6216\u6d77\u62a5",
    "Recommended for 4:3": "\u63a8\u83504:3",
    "HP Warning": "\u60e0\u666e\u8b66\u544a",
    "Enemy HP Warning": "\u654c\u65b9\u751f\u547d\u503c\u8b66\u544a",
    "Compact Layout": "\u5e03\u5c40\u7d27\u51d1",
    "Cleaner Skills": "\u6e05\u6d01\u6280\u80fd",
    "Cleaner Items": "\u6e05\u6d01\u7528\u54c1",
    "Always Visible Boost": "\u59cb\u7ec8\u53ef\u89c1\u7684\u63d0\u5347",
    "Realtime Drain Countdown": "\u5b9e\u65f6\u6392\u6c34\u5012\u8ba1\u65f6",
    "Mirror unsecured gold number": "\u955c\u50cf\u65e0\u62c5\u4fdd\u91d1\u53f7",
    "Realtime Key Inputs": "\u5b9e\u65f6\u6309\u952e\u8f93\u5165",
    "Angle and Speed": "\u89d2\u5ea6\u548c\u901f\u5ea6",
    "Estimated ult cooldowns under top-bar ult icons": "\u9876\u680f ult \u56fe\u6807\u4e0b\u7684\u9884\u8ba1 ult \u51b7\u5374\u65f6\u95f4",
    "HIGH FPS IMPACT WARNING!": "\u9ad8\u5e27\u7387\u51b2\u51fb\u8b66\u544a\uff01",
    "Customizable Unsecured Souls": "\u53ef\u5b9a\u5236\u7684\u65e0\u4fdd\u969c\u7075\u9b42",
    "Simplified Minimap": "\u7b80\u5316\u7684\u5c0f\u5730\u56fe",
    "Ability Menu Open": "\u80fd\u529b\u83dc\u5355\u6253\u5f00",
    "Scoreboard Open": "\u8bb0\u5206\u724c\u516c\u5f00\u8d5b",
    "Play current announcer voice and volume.": "\u64ad\u653e\u5f53\u524d\u64ad\u97f3\u5458\u7684\u58f0\u97f3\u548c\u97f3\u91cf\u3002",
    "Play current announcer voice.": "\u64ad\u653e\u5f53\u524d\u63d0\u793a\u97f3\u6548\u7684\u58f0\u97f3",
    "First Spawns": "\u7b2c\u4e00\u4e2a\u4ea7\u5375",
    "Buff Reminder": "\u589e\u76ca\u63d0\u9192",
    "Seconds Before Spawn": "\u751f\u6210\u524d\u51e0\u79d2",
    "Ding to Check Minimap": "\u53ee\u67e5\u770b\u5c0f\u5730\u56fe",
    "In Seconds": "\u51e0\u79d2\u949f\u5185",
    "Open random game when dead": "\u6b7b\u4ea1\u65f6\u6253\u5f00\u968f\u673a\u6e38\u620f",
    "Blackjack": "Wraithjack",
    "Buff Filter": "Buff \u8fc7\u6ee4",
    "click here": "\u70b9\u51fb\u8fd9\u91cc",
    "Click Radius": "\u5355\u51fb\u534a\u5f84",
    "Current Size": "\u5f53\u524d\u5c3a\u5bf8",
    "Enable Clean Stacks": "\u542f\u7528\u6574\u6d01\u5c42\u6570\u663e\u793a",
    "Hero Icon Size": "\u82f1\u96c4\u56fe\u6807\u5927\u5c0f",
    "Icon Shrink": "\u56fe\u6807\u7f29\u5c0f",
    "Improved Hint": "\u6539\u8fdb\u7684\u63d0\u793a",
    "Lane with Party": "\u4e0e\u961f\u4f0d\u540c\u8def\u7ebf",
    "Minimalist Opacity": "\u6781\u7b80\u4e0d\u900f\u660e\u5ea6",
    "Nicknames": "\u6635\u79f0",
    "Player Icon Size": "\u73a9\u5bb6\u56fe\u6807\u5927\u5c0f",
    "Refresh Rate": "\u5237\u65b0\u7387",
    "Show FPS": "\u663e\u793a\u5e27\u7387",
    "Show Frame": "\u663e\u793a\u6846\u67b6",
    "Show Memory": "\u663e\u793a\u5185\u5b58",
    "Show Position": "\u663e\u793a\u4f4d\u7f6e",
    "Show Tick": "\u663e\u793aTick",
    "Shrink Distance": "\u6536\u7f29\u8ddd\u79bb",
    "Total Size": "\u603b\u5927\u5c0f",
    "Ult Indicator": "\u5927\u62db\u6307\u793a\u5668",
    "Zip Thickness": "\u6ed1\u7d22\u539a\u5ea6",
    "Depending on complexity and work involved, contact me on": "\u5177\u4f53\u4ef7\u683c\u53d6\u51b3\u4e8e\u590d\u6742\u5ea6\u548c\u5de5\u4f5c\u91cf\uff0c\u8bf7\u901a\u8fc7\u4ee5\u4e0b\u65b9\u5f0f\u8054\u7cfb\u6211\uff1a",
    "If you encounter issues, need help, or have any feedback join the Discord.": "\u5982\u679c\u60a8\u9047\u5230\u95ee\u9898\u3001\u9700\u8981\u5e2e\u52a9\u6216\u6709\u4efb\u4f55\u53cd\u9988\uff0c\u8bf7\u52a0\u5165 Discord\u3002",
    "Reset section runtime options": "\u91cd\u7f6e\u90e8\u5206\u8fd0\u884c\u65f6\u9009\u9879",
    "Reset section to defaults": "\u5c06\u90e8\u5206\u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u503c",
    "DO NOT PRESS ANY KEYS UNTIL COMPLETE UNLESS PROMPTED": "\u9664\u975e\u51fa\u73b0\u63d0\u793a\uff0c\u5426\u5219\u8bf7\u52ff\u6309\u4efb\u4f55\u952e\u76f4\u81f3\u5b8c\u6210",
    "If saving stalls, open your shop.": "\u5982\u679c\u8282\u7701\u644a\u4f4d\uff0c\u5c31\u5f00\u5e97\u3002",
    "Play Sound ": "\u64ad\u653e\u58f0\u97f3",
    "1st": "1st",
    "2nd": "2nd",
    "3rd": "3rd",
    "Size of your current ammo.": "\u5f53\u524d\u5f39\u836f\u663e\u793a\u7684\u5927\u5c0f",
    "Size of your total ammo.": "\u603b\u5f39\u836f\u663e\u793a\u7684\u5927\u5c0f",
    "Cleans up the styling of reticle hints.": "\u6e05\u7406\u51c6\u661f\u63d0\u793a\uff08reticle hints\uff09\u7684\u6837\u5f0f",
    "Automatically selects Lane Preference: With Party for matchmaking.": "\u5339\u914d\u65f6\u81ea\u52a8\u9009\u62e9\u201c\u5206\u8def\u504f\u597d\uff1a\u4e0e\u961f\u4f0d\u4e00\u8d77",
    "Shows nicknames of all players in the game within the top bar.": "\u5728\u9876\u680f\u663e\u793a\u672c\u5c40\u6240\u6709\u73a9\u5bb6\u7684\u6635\u79f0",
    "Show the ultimate indicator for V1 healthbars.": "\u4e3a V1 \u8840\u6761\u663e\u793a\u5927\u62db\u6307\u793a\u5668",
    "Colored enemy healthbar warnings when at significant thresholds.": "\u5f53\u654c\u4eba\u7684\u751f\u547d\u503c\u8fbe\u5230\u91cd\u8981\u9608\u503c\u65f6\uff0c\u4f1a\u53d1\u51fa\u5f69\u8272\u7684\u654c\u4eba\u751f\u547d\u503c\u8b66\u544a\u3002",
    "Enemy healthbar enhancements.": "\u654c\u4eba\u751f\u547d\u503c\u680f\u589e\u5f3a\u3002",
    "Opacity of the background of Minimalist Minimap.": "\u6781\u7b80\u5c0f\u5730\u56fe\u80cc\u666f\u7684\u4e0d\u900f\u660e\u5ea6",
    "The click hitbox of your pings or clicks, this can help make pings more accurate.": "\u4f60\u7684\u6807\u8bb0/\u70b9\u51fb\u7684\u5224\u5b9a\u6846\uff08hitbox\uff09\uff0c\u53ef\u5e2e\u52a9\u63d0\u9ad8\u6807\u8bb0\u51c6\u786e\u6027",
    "How much icons will shrink when overlapping with others.": "\u56fe\u6807\u91cd\u53e0\u65f6\u7f29\u5c0f\u7684\u5e45\u5ea6",
    "The size of other players on the minimap.": "\u5c0f\u5730\u56fe\u4e0a\u5176\u4ed6\u73a9\u5bb6\u56fe\u6807\u7684\u5927\u5c0f",
    "The size of yourself on the minimap.": "\u5c0f\u5730\u56fe\u4e0a\u81ea\u5df1\u56fe\u6807\u7684\u5927\u5c0f",
    "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.": "\u56fe\u6807\u5f00\u59cb\u7f29\u5c0f\u7684\u8ddd\u79bb\u9608\u503c\u6570\u503c\u8d8a\u4f4e\u4f4d\u7f6e\u8d8a\u51c6\u786e\uff0c\u8d8a\u9ad8\u8d8a\u6613\u770b\u6e05",
    "The thickness of the Zipline lines across the map.": "\u5730\u56fe\u4e0a\u6ed1\u7d22\uff08Zipline\uff09\u7ebf\u6761\u7684\u7c97\u7ec6",
    "How fast the minimap refreshes.": "\u5c0f\u5730\u56fe\u5237\u65b0\u901f\u5ea6",
    "RAM and GPU Memory real time usage statistics.": "\u5185\u5b58 \u4e0e GPU \u663e\u5b58\u7684\u5b9e\u65f6\u5360\u7528\u7edf\u8ba1",
    "Position and Velocity real time statistics.": "\u4f4d\u7f6e\u4e0e\u901f\u5ea6\u7684\u5b9e\u65f6\u7edf\u8ba1",
    "Shows real time tick information, mostly useless.": "\u663e\u793a\u5b9e\u65f6 tick \u4fe1\u606f\uff08\u57fa\u672c\u6ca1\u7528\uff09",
    "Shows raw FPS count.": "\u663e\u793a\u539f\u59cb FPS \u6570\u503c",
    "Shows current frame count, mostly useless.": "\u663e\u793a\u5f53\u524d\u5e27\u6570\uff08\u57fa\u672c\u6ca1\u7528\uff09",
    "The hero you automatically switch to on launch or after saving..": "\u542f\u52a8\u65f6\u6216\u4fdd\u5b58\u540e\u81ea\u52a8\u5207\u6362\u5230\u7684\u82f1\u96c4",
    "Toggle the hitmarkers when attacking enemies.": "\u5207\u6362\u653b\u51fb\u654c\u4eba\u65f6\u7684\u547d\u4e2d\u6807\u8bb0\uff08hitmarkers\uff09",
    "Choose which bridge buff sound variants can play.": "\u9009\u62e9 \u6865\u6881buff \u53ef\u64ad\u653e\u7684\u97f3\u6548\u53d8\u4f53",
    "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.": "\u54ea\u4e9b\u4e8b\u4ef6\u4f1a\u89e6\u53d1\u58f0\u97f3\u64ad\u653eCamps \u53ea\u64ad\u4e00\u6b21\uff0cBuff \u6bcf 5 \u5206\u949f\u64ad\u653e\u4e00\u6b21",
    "FPS Impact:": "FPS \u5f71\u54cd\uff1a",
    "Created By:": "\u521b\u5efa\u8005\uff1a",
    "Author:": "\u4f5c\u8005\uff1a",
    "Voice Actor:": "\u914d\u97f3\u6f14\u5458\uff1a",
    "None": "\u6ca1\u6709\u4efb\u4f55",
    "Low": "\u4f4e\u7684",
    "Medium": "\u4e2d\u7b49",
    "High": "\u9ad8\u7684",
    "Adjust horizontal position of the player healthbar.": "\u8c03\u6574\u73a9\u5bb6\u8840\u6761\u6c34\u5e73\u4f4d\u7f6e",
    "Adjust opacity of the player healthbar.": "\u8c03\u6574\u73a9\u5bb6\u8840\u6761\u4e0d\u900f\u660e\u5ea6",
    "Adjust size of the player healthbar.": "\u8c03\u6574\u73a9\u5bb6\u8840\u6761\u5927\u5c0f",
    "Adjust vertical position of the player healthbar.": "\u8c03\u6574\u73a9\u5bb6\u8840\u6761\u5782\u76f4\u4f4d\u7f6e",
    "An always visible zipline boost overlay.": "\u59cb\u7ec8\u53ef\u89c1\u7684\u6ed1\u7d22\u52a0\u901f\uff08zipline boost\uff09\u53e0\u52a0\u5c42",
    "Centers ESC menu elements to make them easier to access.": "\u5c06 ESC \u83dc\u5355\u5143\u7d20\u5c45\u4e2d\uff0c\u4fbf\u4e8e\u64cd\u4f5c",
    "Centers friends list area in ESC menu.": "\u5c06 ESC \u83dc\u5355\u4e2d\u7684\u597d\u53cb\u5217\u8868\u533a\u57df\u5c45\u4e2d",
    "Adds a STAT button on profile rows that opens Statlocker for that account.": "\u5728\u8d44\u6599\u884c\u4e0a\u6dfb\u52a0 STAT \u6309\u94ae\uff0c\u5e76\u4e3a\u8be5\u8d26\u53f7\u6253\u5f00 Statlocker",
    "Cleans up visuals of abilities significantly to reduce clutter.": "\u5927\u5e45\u6e05\u7406\u6280\u80fd\u7279\u6548\u4ee5\u51cf\u5c11\u753b\u9762\u6742\u4e71",
    "Cleans up visuals of the item bar significantly to reduce clutter.": "\u5927\u5e45\u6e05\u7406\u7269\u54c1\u680f\u89c6\u89c9\u6548\u679c\u4ee5\u51cf\u5c11\u6742\u4e71",
    "Cleans up visuals of the minimap significantly to reduce clutter.": "\u5927\u5e45\u6e05\u7406\u5c0f\u5730\u56fe\u89c6\u89c9\u6548\u679c\u4ee5\u51cf\u5c11\u6742\u4e71",
    "Cleans up visuals of the shop menu significantly to reduce clutter.": "\u5927\u5e45\u6e05\u7406\u5546\u5e97\u83dc\u5355\u89c6\u89c9\u6548\u679c\u4ee5\u51cf\u5c11\u6742\u4e71",
    "Colored healthbar warnings when at significant thresholds.": "\u751f\u547d\u503c\u5728\u5173\u952e\u9608\u503c\u65f6\u7684\u5f69\u8272\u8840\u6761\u8b66\u544a",
    "Current ammo inside of your magazine.": "\u5f39\u5323\u5185\u5f53\u524d\u5b50\u5f39\u6570",
    "Customize the styling of damage numbers.": "\u81ea\u5b9a\u4e49\u4f24\u5bb3\u6570\u5b57\u7684\u6837\u5f0f",
    "Customize the visuals of the incoming damage panel.": "\u81ea\u5b9a\u4e49\u53d7\u51fb\u9762\u677f\u7684\u89c6\u89c9\u6548\u679c",
    "Customize unsecured souls visuals.": "\u81ea\u5b9a\u4e49\u201c\u672a\u7a33\u83b7\u9b42\u9b44\u201d\u7684\u89c6\u89c9\u6548\u679c",
    "Customize visibility of target reticle when abilities or items visually show on allies and enemies.": "\u81ea\u5b9a\u4e49\u76ee\u6807\u51c6\u661f\u53ef\u89c1\u6027\uff08\u5f53\u6280\u80fd/\u7269\u54c1\u5728\u53cb\u519b\u548c\u654c\u4eba\u8eab\u4e0a\u6709\u89c6\u89c9\u8868\u73b0\u65f6\uff09",
    "Customized healthbars for better visibility or flair.": "\u81ea\u5b9a\u4e49\u8840\u6761\uff0c\u4ee5\u63d0\u5347\u53ef\u89c1\u6027\u6216\u98ce\u683c\u6548\u679c",
    "Decide what style of item to display the cooldown of.": "\u51b3\u5b9a\u7528\u54ea\u79cd\u7269\u54c1\u6837\u5f0f\u6765\u663e\u793a\u51b7\u5374",
    "Draws the minimap over all other UI elements for improved visibility.": "\u5c06\u5c0f\u5730\u56fe\u7ed8\u5236\u5728\u6240\u6709\u5176\u4ed6 UI \u5143\u7d20\u4e4b\u4e0a\uff0c\u4ee5\u63d0\u5347\u53ef\u89c1\u6027",
    "Forcibly hides testing tools at all times.": "\u5f3a\u5236\u59cb\u7ec8\u9690\u85cf\u6d4b\u8bd5\u5de5\u5177",
    "Forcibly shows testing tools at all times.": "\u5f3a\u5236\u59cb\u7ec8\u663e\u793a\u6d4b\u8bd5\u5de5\u5177",
    "Greys out heros in the top bar when missing on the map.": "\u5f53\u82f1\u96c4\u5728\u5730\u56fe\u4e0a\u6d88\u5931\u65f6\uff0c\u5728\u9876\u680f\u5c06\u5176\u7f6e\u7070",
    "Highlighted abilities showing you what you should upgrade depending on build.": "\u9ad8\u4eae\u6280\u80fd\uff0c\u63d0\u793a\u4f60\u6839\u636e\u6d41\u6d3e/\u6784\u7b51\u5e94\u8be5\u5347\u7ea7\u4ec0\u4e48",
    "Improve Ability Stacks": "\u6539\u8fdb\u6280\u80fd\u5c42\u6570\uff08Ability Stacks\uff09",
    "Makes the minimap rotate with player view, this is just for fun.": "\u8ba9\u5c0f\u5730\u56fe\u968f\u73a9\u5bb6\u89c6\u89d2\u65cb\u8f6c\uff08\u4ec5\u4f9b\u5a31\u4e50\uff09",
    "Menu when you receive a punishment for breaking game rules.": "\u8fdd\u53cd\u6e38\u620f\u89c4\u5219\u53d7\u5230\u60e9\u7f5a\u65f6\u5f39\u51fa\u7684\u83dc\u5355",
    "Only download the filter file of the filter you want, nothing else.": "\u53ea\u4e0b\u8f7d\u4f60\u60f3\u8981\u7684\u6ee4\u955c\u6587\u4ef6\uff0c\u4e0d\u9700\u8981\u5176\u4ed6\u5185\u5bb9",
    "Play an audio reminder to remember to look at the minimap.": "\u64ad\u653e\u97f3\u6548\u63d0\u9192\uff0c\u63d0\u9192\u4f60\u67e5\u770b\u5c0f\u5730\u56fe",
    "Ragnarok Online damage visuals with improved fancy styling.": "Ragnarok Online \u98ce\u683c\u7684\u4f24\u5bb3\u663e\u793a\uff0c\u5e76\u589e\u5f3a\u534e\u4e3d\u6837\u5f0f",
    "Real time key input visual.": "\u5b9e\u65f6\u6309\u952e\u8f93\u5165\u53ef\u89c6\u5316",
    "See your view angle and speed.": "\u67e5\u770b\u4f60\u7684\u89c6\u89d2\u89d2\u5ea6\u4e0e\u901f\u5ea6",
    "Shifts the HUD for better visual support for 16:10 resolutions.": "\u4e3a 16:10 \u5206\u8fa8\u7387\u63d0\u4f9b\u66f4\u597d\u7684\u89c6\u89c9\u652f\u6301\uff0c\u8c03\u6574 HUD \u4f4d\u7f6e",
    "Shifts the HUD for better visual support for 4:3 resolutions.": "\u4e3a 4:3 \u5206\u8fa8\u7387\u63d0\u4f9b\u66f4\u597d\u7684\u89c6\u89c9\u652f\u6301\uff0c\u8c03\u6574 HUD \u4f4d\u7f6e",
    "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.": "\u5728\u9876\u680f\u663e\u793a\u5f53\u524d\u4e00\u5854\u3001\u4e8c\u5854\u548c\u57fa\u5730\u7684\u89c6\u89c9\u6307\u793a",
    "Show if you are in combat or not.": "\u663e\u793a\u4f60\u662f\u5426\u5904\u4e8e\u6218\u6597\u4e2d",
    "Show player ultimate indicators on V1 healthbars.": "\u5728 V1 \u8840\u6761\u4e0a\u663e\u793a\u73a9\u5bb6\u5927\u62db\u6307\u793a\u5668",
    "Show the estimated time for unsecured souls to dissapear.": "\u663e\u793a\u672a\u7a33\u83b7\u9b42\u9b44\u9884\u8ba1\u6d88\u5931\u7684\u65f6\u95f4",
    "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.": "\u5728\u5c0f\u5730\u56fe\u4e2d\u663e\u793a\u6865\u6881 Buff \u5373\u5c06\u751f\u6210\u7684\u89c6\u89c9\u63d0\u793a",
    "Shows a visual indicator in the minimap of when Mid Boss will spawn.": "\u5728\u5c0f\u5730\u56fe\u4e2d\u663e\u793a Mid Boss \u5373\u5c06\u751f\u6210\u7684\u89c6\u89c9\u63d0\u793a",
    "Changes urn color to know which side is favored, green for your team, red for the enemy.": "\u6839\u636e\u559c\u6b22\u54ea\u4e00\u8fb9\u6765\u91cd\u65b0\u7740\u8272\u74ee\u3002",
    "Shows a visual indicator in the top bar of the percentage difference of souls between teams.": "\u5728\u9876\u680f\u663e\u793a\u4e24\u961f\u9b42\u9b44\u5dee\u8ddd\u767e\u5206\u6bd4\u7684\u89c6\u89c9\u63d0\u793a",
    "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.": "\u5728\u9876\u680f\u663e\u793a\u6865\u6881 Buff \u5373\u5c06\u751f\u6210\u7684\u89c6\u89c9\u63d0\u793a",
    "Shows a visual indicator in the top bar of when Mid Boss will spawn.": "\u5728\u9876\u680f\u663e\u793a Mid Boss \u5373\u5c06\u751f\u6210\u7684\u89c6\u89c9\u63d0\u793a",
    "Shows all of your keybinds.": "\u663e\u793a\u4f60\u7684\u6240\u6709\u6309\u952e\u7ed1\u5b9a",
    "Shows all of your player stats within the shop menu.": "\u5728\u5546\u5e97\u83dc\u5355\u4e2d\u663e\u793a\u4f60\u7684\u6240\u6709\u89d2\u8272\u5c5e\u6027",
    "Shows item cooldowns near crosshair for easier readability.": "\u5728\u51c6\u661f\u9644\u8fd1\u663e\u793a\u7269\u54c1\u51b7\u5374\uff0c\u4fbf\u4e8e\u9605\u8bfb",
    "Shows the individual player souls per minute on scoreboard and the team in the top bar.": "\u5728\u8ba1\u5206\u677f\u663e\u793a\u6bcf\u4f4d\u73a9\u5bb6\u7684\u6bcf\u5206\u949f\u9b42\u9b44\u6570\uff0c\u5e76\u5728\u9876\u680f\u663e\u793a\u56e2\u961f\u6570\u636e",
    "Shows the individual player's objective damage in the top bar.": "\u5728\u9876\u680f\u663e\u793a\u6bcf\u4f4d\u73a9\u5bb6\u7684\u76ee\u6807\u7269\u4f24\u5bb3",
    "Shows the individual player's unspent souls in the top bar.": "\u5728\u9876\u680f\u663e\u793a\u6bcf\u4f4d\u73a9\u5bb6\u672a\u82b1\u8d39\u7684\u9b42\u9b44\u6570",
    "Shows your character in the shop menu.": "\u5728\u5546\u5e97\u83dc\u5355\u4e2d\u663e\u793a\u4f60\u7684\u89d2\u8272",
    "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).": "\u663e\u8457\u63d0\u5347\u76ee\u6807\u51c6\u661f\u53ef\u89c1\u6027\uff0c\u5e76\u9ad8\u4eae\u5904\u51b3\u8303\u56f4\uff08\u897f\u5f17\uff09",
    "Simplifies the Compass overlay to its bare elements.": "\u5c06\u7f57\u76d8\u53e0\u52a0\u5c42\u7b80\u5316\u5230\u6700\u57fa\u672c\u5143\u7d20",
    "Slight adjustments to the HUD for better streaming output.": "\u8f7b\u5fae\u8c03\u6574 HUD\uff0c\u4f7f\u76f4\u64ad\u753b\u9762\u8f93\u51fa\u66f4\u6e05\u6670",
    "Speed number tracker.": "\u901f\u5ea6\u6570\u503c\u8ffd\u8e2a\u5668",
    "Stretch the compass horizontally.": "\u6c34\u5e73\u62c9\u4f38\u7f57\u76d8",
    "Stretch the compass vertically.": "\u5782\u76f4\u62c9\u4f38\u7f57\u76d8",
    "The circle countdown for when you are reloading.": "\u6362\u5f39\u65f6\u7684\u5706\u5f62\u5012\u8ba1\u65f6",
    "The cosmetic ability on your default 5 key, like posters and snowballs.": "\u9ed8\u8ba4 5 \u952e\u4e0a\u7684\u5916\u89c2\u7c7b\u6280\u80fd\uff08\u5982\u6d77\u62a5\u3001\u96ea\u7403\u7b49\uff09",
    "The damage dealt to Trooper minions.": "\u5bf9\u5c0f\u5175\u9020\u6210\u7684\u4f24\u5bb3\u663e\u793a",
    "The icon that replaces your crosshair when reloading.": "\u6362\u5f39\u65f6\u66ff\u6362\u51c6\u661f\u7684\u56fe\u6807",
    "The interval in which the sound plays in seconds.": "\u58f0\u97f3\u64ad\u653e\u7684\u95f4\u9694\uff08\u79d2\uff09",
    "The item buying auto queue system in the shop menu.": "\u5546\u5e97\u83dc\u5355\u4e2d\u7684\u7269\u54c1\u8d2d\u4e70\u81ea\u52a8\u961f\u5217\u7cfb\u7edf",
    "The large cumulative damage number.": "\u7d2f\u8ba1\u4f24\u5bb3\u7684\u5927\u53f7\u6570\u5b57\u663e\u793a",
    "The popup signifying you are too low on stamina to cast another movement input.": "\u5f53\u4f53\u529b\u8fc7\u4f4e\u65e0\u6cd5\u518d\u6b21\u65bd\u653e\u79fb\u52a8\u8f93\u5165\u65f6\u7684\u5f39\u7a97\u63d0\u793a",
    "The small incremental damage numbers.": "\u5c0f\u53f7\u7684\u9012\u589e\u4f24\u5bb3\u6570\u5b57",
    "The small visual icon.": "\u5c0f\u56fe\u6807",
    "The unsecured text.": "\u672a\u9501\u5b9a\u6587\u672c",
    "The world background blur effect behind the shop menu.": "\u5546\u5e97\u83dc\u5355\u540e\u65b9\u7684\u4e16\u754c\u80cc\u666f\u6a21\u7cca\u6548\u679c",
    "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.": "\u8fd9\u662f\u4e00\u4e2a\u8f7b\u91cf\u7248\u672c\uff0cFPS \u63d0\u5347\u663e\u8457\uff0c\u4f46\u9700\u8981\u5355\u72ec\u7684\u6ee4\u955c\u6587\u4ef6",
    "Time before the announcement happens in seconds.": "\u516c\u544a\u89e6\u53d1\u524d\u7684\u65f6\u95f4\uff08\u79d2\uff09",
    "Total ammo amount.": "\u603b\u5f39\u836f\u91cf",
    "View a cooldown timer for reloading time.": "\u67e5\u770b\u6362\u5f39\u8017\u65f6\u7684\u51b7\u5374\u8ba1\u65f6\u5668",
    "View an enhanced minimap on opening ability menu.": "\u6253\u5f00\u6280\u80fd\u83dc\u5355\u65f6\u67e5\u770b\u589e\u5f3a\u7248\u5c0f\u5730\u56fe",
    "View an enhanced minimap on opening scoreboard menu.": "\u6253\u5f00\u8ba1\u5206\u677f\u83dc\u5355\u65f6\u67e5\u770b\u589e\u5f3a\u7248\u5c0f\u5730\u56fe",
    "View the cooldown time of player ultimates.": "\u67e5\u770b\u73a9\u5bb6\u5927\u62db\u7684\u51b7\u5374\u65f6\u95f4",
    "Visual indicator of your current ammo.": "\u5f53\u524d\u5f39\u836f\u91cf\u7684\u89c6\u89c9\u6307\u793a\u5668",
    "You can download custom announcer packs, just download the correct one for the slot you want to replace.": "\u4f60\u53ef\u4ee5\u4e0b\u8f7d\u81ea\u5b9a\u4e49\u63d0\u793a\u97f3\u6548\u5305\uff0c\u53ea\u9700\u4e0b\u8f7d\u5bf9\u5e94\u4f60\u8981\u66ff\u6362\u7684\u69fd\u4f4d\u7248\u672c",
    "COPY": "\u590d\u5236",
    "COPIED": "\u5df2\u590d\u5236",
    "FAILED": "\u5931\u8d25",
    "SAVE": "\u4fdd\u5b58",
    "HIDEOUT": "\u85cf\u8eab\u5904",
    "QUEUED": "\u5df2\u6392\u961f",
    "APPLY": "\u5e94\u7528",
    "APPLIED": "\u5df2\u5e94\u7528",
    "AIRHEART": "AIRHEART",
    "SAVING": "\u4fdd\u5b58",
    "VERIFY": "\u6838\u5b9e",
    "SAVED": "\u5df2\u4fdd\u5b58",
    "TIMEOUT": "\u6682\u505c",
    "CLEAR": "\u6e05\u9664",
    "CLEARING": "\u6e05\u9664\u4e2d",
    "CLEARED": "\u5df2\u6e05\u9664",
    "Statistics": "\u7edf\u8ba1\u6570\u636e",
    "Combat Status": "\u6218\u6597\u72b6\u6001",
    "Easy": "\u7b80\u5355",
    "Hard": "\u56f0\u96be",
    "SUPPORT THE MOD": "\u652f\u6301\u8be5\u6a21\u7ec4",
    "Play Sound": "\u64ad\u653e\u58f0\u97f3",
    "Fighting Game": "\u683c\u6597\u6e38\u620f",
    "Open shop to continue save.": "\u6253\u5f00\u5546\u5e97\u4ee5\u7ee7\u7eed\u4fdd\u5b58",
    "Switching to Airheart...": "\u6b63\u5728\u5207\u6362\u5230 Airheart\u2026\u2026",
    "Writing settings string to build...": "\u6b63\u5728\u5199\u5165\u6784\u7b51\u7684\u8bbe\u7f6e\u5b57\u7b26\u4e32\u2026\u2026",
    "Save in progress...": "\u4fdd\u5b58\u8fdb\u884c\u4e2d\u2026\u2026",
    "Save timed out. Try again.": "\u4fdd\u5b58\u8d85\u65f6\u8bf7\u91cd\u8bd5",
    "Save completed.": "\u4fdd\u5b58\u5b8c\u6210",
    "Save failed.": "\u4fdd\u5b58\u5931\u8d25",
    "Save works only in hideout.": "\u53ea\u80fd\u5728\u85cf\u8eab\u5904\uff08hideout\uff09\u4fdd\u5b58",
    "Failed to queue save request.": "\u4fdd\u5b58\u8bf7\u6c42\u52a0\u5165\u961f\u5217\u5931\u8d25",
    "Save queued.": "\u4fdd\u5b58\u8bf7\u6c42\u5df2\u52a0\u5165\u961f\u5217",
    "Open shop to continue clear.": "\u6253\u5f00\u5546\u5e97\u4ee5\u7ee7\u7eed\u6e05\u9664",
    "Confirming Airheart for clear...": "\u6b63\u5728\u786e\u8ba4\u7528\u4e8e\u6e05\u9664\u7684 Airheart\u2026\u2026",
    "Clearing builds...": "\u6b63\u5728\u6e05\u9664\u6784\u7b51\u2026\u2026",
    "Clear in progress...": "\u6e05\u9664\u8fdb\u884c\u4e2d\u2026\u2026",
    "Clear timed out. Try again.": "\u6e05\u9664\u8d85\u65f6\u8bf7\u91cd\u8bd5",
    "Clear completed.": "\u6e05\u9664\u5b8c\u6210",
    "Clear failed.": "\u6e05\u9664\u5931\u8d25",
    "en": "en",
    "Section already at defaults.": "\u8be5\u5206\u533a\u5df2\u662f\u9ed8\u8ba4\u503c\u3002",
    "Ready.": "\u5c31\u7eea\u3002",
    "Share or save your settings configuration!": "\u5206\u4eab\u6216\u4fdd\u5b58\u4f60\u7684\u8bbe\u7f6e\u914d\u7f6e\uff01",
    "Local settings loaded.": "\u672c\u5730\u8bbe\u7f6e\u5df2\u52a0\u8f7d\u3002",
    "Export string copied.": "\u5bfc\u51fa\u5b57\u7b26\u4e32\u5df2\u590d\u5236\u3002",
    "Clipboard copy failed.": "\u526a\u8d34\u677f\u590d\u5236\u5931\u8d25\u3002",
    "Airheart switch sent.": "\u5df2\u53d1\u9001\u5207\u6362\u5230 Airheart \u7684\u6307\u4ee4\u3002",
    "Failed to switch hero.": "\u5207\u6362\u82f1\u96c4\u5931\u8d25\u3002",
    "Strings may sometimes break between mod versions.": "\u4e0d\u540c\u6a21\u7ec4\u7248\u672c\u4e4b\u95f4\u5b57\u7b26\u4e32\u6709\u65f6\u53ef\u80fd\u4f1a\u5931\u6548\u3002",
    "Import: parsing string...": "\u5bfc\u5165\uff1a\u6b63\u5728\u89e3\u6790\u5b57\u7b26\u4e32\u2026\u2026",
    "Import: applying settings...": "\u5bfc\u5165\uff1a\u6b63\u5728\u5e94\u7528\u8bbe\u7f6e\u2026\u2026",
    "Import: refreshing UI...": "\u5bfc\u5165\uff1a\u6b63\u5728\u5237\u65b0 UI\u2026\u2026",
    "Import failed.": "\u5bfc\u5165\u5931\u8d25\u3002",
    "Invalid import string.": "\u5bfc\u5165\u5b57\u7b26\u4e32\u65e0\u6548\u3002",
    "Row already at defaults.": "\u8be5\u884c\u5df2\u662f\u9ed8\u8ba4\u503c\u3002",
    "Preset apply failed.": "\u9884\u8bbe\u5e94\u7528\u5931\u8d25\u3002",
    "Scales the element.": "\u7f29\u653e\u8be5\u5143\u7d20\u3002",
    "Changes the element's transparency.": "\u66f4\u6539\u8be5\u5143\u7d20\u7684\u900f\u660e\u5ea6\u3002",
    "Moves the element horizontally.": "\u6c34\u5e73\u79fb\u52a8\u8be5\u5143\u7d20\u3002",
    "Moves the element vertically.": "\u5782\u76f4\u79fb\u52a8\u8be5\u5143\u7d20\u3002",
    "Reset to default value": "\u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u503c",
    "Reset row to defaults": "\u5c06\u6b64\u884c\u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u503c",
    "Randomly opens an enabled arcade game while dead.": "\u6b7b\u4ea1\u65f6\u968f\u673a\u6253\u5f00\u4e00\u4e2a\u5df2\u542f\u7528\u7684\u5c0f\u6e38\u620f\u3002",
    "Fountain-style damage number animation.": "\u55b7\u6cc9\u98ce\u683c\u7684\u4f24\u5bb3\u6570\u5b57\u52a8\u753b\u3002",
    "Russian": "\u4fc4\u8bed",
    "Chinese": "\u4e2d\u6587",
    "Portuguese": "\u8461\u8404\u7259\u8bed",
    "BR Portuguese": "\u5df4\u897f\u8461\u8404\u7259\u8bed",
    "Spanish": "\u897f\u73ed\u7259\u8bed",
    "Optimize Mode": "\u4f18\u5316\u6a21\u5f0f",
    "Shown Items": "\u663e\u793a\u7684\u9879\u76ee",
    "Wraithjack": "\u4e8c\u5341\u4e00\u70b9",
    "Troubleshoot": "\u6545\u969c\u6392\u9664",
    "Settings Changes": "\u8bbe\u7f6e\u66f4\u6539",
    "Changes:": "\u66f4\u6539\uff1a",
    "Confirm": "\u786e\u8ba4",
    "Cancel": "\u53d6\u6d88",
    "The displayed language of the settings menu.": "\u8bbe\u7f6e\u83dc\u5355\u4e2d\u663e\u793a\u7684\u8bed\u8a00\u3002",
    "Preview realtime changes to settings when modifying them.": "\u5728\u4fee\u6539\u8bbe\u7f6e\u65f6\u5b9e\u65f6\u9884\u89c8\u66f4\u6539\u6548\u679c\u3002",
    "Restores the legacy removed duration bars for abilities.": "\u6062\u590d\u5df2\u79fb\u9664\u7684\u65e7\u7248\u6280\u80fd\u6301\u7eed\u65f6\u95f4\u6761\u3002",
    "Centers the friends list area within the ESC menu.": "\u5728 ESC \u83dc\u5355\u4e2d\u5c06\u597d\u53cb\u5217\u8868\u533a\u57df\u5c45\u4e2d\u3002",
    "Enhanced V2 enemy healthbar visuals and readability.": "\u589e\u5f3a\u7248 V2 \u654c\u4eba\u751f\u547d\u6761\u7684\u89c6\u89c9\u6548\u679c\u4e0e\u53ef\u8bfb\u6027\u3002",
    "Show the UnitInfo panel on V2 enemy healthbars.": "\u5728 V2 \u654c\u4eba\u751f\u547d\u6761\u4e0a\u663e\u793a\u5355\u4f4d\u4fe1\u606f\u9762\u677f\u3002",
    "Show level text on V2 enemy healthbars.": "\u5728 V2 \u654c\u4eba\u751f\u547d\u6761\u4e0a\u663e\u793a\u7b49\u7ea7\u6587\u672c\u3002",
    "V2 enemy healthbar enhancements.": "V2 \u654c\u4eba\u751f\u547d\u6761\u589e\u5f3a\u529f\u80fd\u3002",
    "Welcome to QOL Lock": "\u6b22\u8fce\u4f7f\u7528 QOL Lock",
};
const SETTINGS_FR_TEXT = {
    "Config": "Configuration",
    "Presets": "Pr\u00e9r\u00e9glages",
    "Crosshair": "R\u00e9ticule",
    "HUD": "HUD",
    "UI": "UI",
    "Overlay": "Overlay",
    "Minimap": "Mini-carte",
    "Audio": "Audio",
    "Console": "Console",
    "General": "G\u00e9n\u00e9ral",
    "Discord": "Discord",
    "Support": "Support",
    "Meta Settings": "Autres param\u00e8tres",
    "Preview": "Aper\u00e7u",
    "Drag": "D\u00e9pla\u00e7able",
    "Language": "Langue",
    "Default Hero": "H\u00e9ro par d\u00e9faut",
    "English": "Anglais",
    "French": "Fran\u00e7ais",
    "Settings UI Language": "Param\u00e8tres Langue de l'interface utilisateur",
    "Hero on Load or Save": "H\u00e9ros en chargement ou en sauvegarde",
    "Realtime Settings Changes": "Modifications des param\u00e8tres en temps r\u00e9el",
    "Realtime Changes": "Modifications en temps r\u00e9el",
    "Draggable UI": "Interface utilisateur d\u00e9pla\u00e7able",
    "Enable": "Activer",
    "Export Settings": "Exporter les param\u00e8tres",
    "Import Settings": "Importer les param\u00e8tres",
    "Export String": "Exporter la cha\u00eene de code",
    "Import String": "Importer la cha\u00eene de code",
    "How to Save Settings": "Comment enregistrer les param\u00e8tres",
    "Share your settings string": "Partage ta cha\u00eene de code",
    "Paste and apply an exported settings string": "Colle et applique la cha\u00eene de code",
    "Search Results": "R\u00e9sultats de la recherche",
    "No results found": "Aucun r\u00e9sultat",
    "Better Item Cooldowns": "Meilleurs cooldowns",
    "Item Cooldowns": "Cooldowns",
    "Tracked cooldowns near crosshair": "Cooldowns pr\u00e8s de la r\u00e9ticule",
    "Light Item Cooldowns": "Light Item Cooldowns",
    "Advanced Mode": "Mode avanc\u00e9",
    "Optimize Filters": "Filtres optimis\u00e9s",
    "No filter settings but better FPS.": "Aucun filtre mais de meilleurs FPS.",
    "Filters": "Filtres",
    "Get Filter File Only": "T\u00e9l\u00e9charger le filtre uniquement",
    "Download": "T\u00e9l\u00e9charger",
    "Advanced Filter": "Filtre avanc\u00e9",
    "Defensive Passive": "D\u00e9fensifs passif",
    "Offensive Passive": "Offensifs passif",
    "Defensive Active": "D\u00e9fensifs actifs",
    "Offensive Active": "Offensifs actifs",
    "Damage Numbers": "Num\u00e9ros de d\u00e9g\u00e2ts",
    "Ammo": "Munitions",
    "Reload Cooldown": "Recharge",
    "Reloading": "Rechargement",
    "Item Target Reticle": "Cible r\u00e9ticule",
    "Top Bar Plus": "Barre sup\u00e9rieure plus",
    "Top Bar": "Barre sup\u00e9rieure",
    "Shop": "Boutique",
    "HUD Controls": "Commandes du HUD",
    "UI Controls": "Contr\u00f4les UI",
    "Chat": "Chat",
    "Legacy Durations": "Dur\u00e9es classiques",
    "Healthbar": "Barre de vie",
    "Player": "Joueur",
    "Bottom Bar": "Barre inf\u00e9rieure",
    "Simplify": "Simplifier",
    "Zipline Boost": "Boost tyrolienne",
    "Souls Timer": "Timer \u00e2mes",
    "Unsecured Souls Timer": "Timer \u00e2mes non-s\u00e9curis\u00e9es",
    "Unsecured Timer": "Timer non-s\u00e9curis\u00e9",
    "Better Unsecured": "Better Unsecured",
    "Better Unsecured Souls": "Better Unsecured Souls",
    "Unsecured Plus": "\u00c2mes non s\u00e9curis\u00e9es+",
    "Keyboard": "Overlay clavier",
    "Compass": "Boussole",
    "Ult Cooldowns": "Cooldown Ulti",
    "Alt Zoom": "Zoom ALT",
    "Tab Zoom": "Zoom TAB",
    "Announcer": "Annonceur",
    "Arcade": "Arcade",
    "Game Settings": "Param\u00e8tres du jeu",
    "Games": "Jeux",
    "Game Audio": "Audio du jeu",
    "Difficulty": "Difficult\u00e9",
    "Supporting and Feature Requests": "Support et demande de fonctionnalit\u00e9s",
    "Issues, Feedback and Ideas": "Probl\u00e8mes, commentaires et id\u00e9es",
    "Contact": "Contact",
    "Special Thanks": "Remerciements sp\u00e9ciaux",
    "Size": "Taille",
    "Opacity": "Opacit\u00e9",
    "Scale": "\u00c9chelle",
    "Horizontal Offset": "D\u00e9calage horizontal",
    "Vertical Offset": "D\u00e9calage vertical",
    "Horizontal Stretch": "\u00c9tirement horizontal",
    "Vertical Stretch": "\u00c9tirement vertical",
    "Visual": "Visuel",
    "Hide All": "Tout masquer",
    "Current": "Actuel",
    "Total": "Total",
    "Icon": "Ic\u00f4ne",
    "Circle": "Cercle",
    "Big Number": "Grand nombre",
    "Big Numbers": "Grands nombres",
    "Damage Fountain": "Fontaine de d\u00e9g\u00e2ts",
    "Small Numbers": "Petits nombres",
    "Trooper Damage": "D\u00e9g\u00e2ts aux troopers",
    "Hide Current": "Masquer l'actuel",
    "Hide Total": "Masquer le total",
    "Hide Icon": "Masquer l'ic\u00f4ne",
    "Hide Circle": "Masquer le cercle",
    "Hide Big Number": "Masquer les gros nombres",
    "Hide Small Numbers": "Masquer les petits nombres",
    "Hide Trooper Damage": "Masquer les d\u00e9g\u00e2ts faits aux troopers",
    "Highlight Mode": "Mode surbrillance",
    "Big Red": "Grand rouge",
    "Unspent Souls": "Souls non d\u00e9pens\u00e9es",
    "Souls Per Minute": "Souls par minute",
    "Objective Damage": "D\u00e9g\u00e2ts aux objectifs",
    "Objective Map": "Carte des objectifs",
    "Urn Difference": "Diff\u00e9rence d'urne",
    "Buff Timer": "Buff Timer",
    "Bridge Buff Timer": "Bridge Buff Timer",
    "Mid Boss Timer": "Mid Boss Timer",
    "Missing Hero Opaque": "H\u00e9ros manquant assombris",
    "Display Stats": "Afficher les statistiques",
    "Display Hero": "Afficher le h\u00e9ro",
    "Simplify Shop": "Simplifier la boutique",
    "Stats": "Stats",
    "Hero": "H\u00e9ro",
    "Minimalist": "Minimaliste",
    "Blur": "Flou",
    "Quick Buy": "Achat rapide",
    "Hide Blur": "Masquer le flou",
    "Hide Quick Buy": "Masquer le menu d'achat rapide",
    "16:10 Support": "16:10 Fix",
    "4:3 Support": "4:3 Fix",
    "21:9 Stream Fix": "21:9 Stream Fix",
    "Centered ESC Menu": "Menu ESC centr\u00e9",
    "Centered Friends List": "Liste d'amis centr\u00e9e",
    "Statlocker": "Statlocker",
    "Force Testing Tools": "Forcer les outils de test",
    "Show Testing Tools": "Afficher les outils de test",
    "Hide Testing Tools": "Masquer les outils de test",
    "Behavior Summary": "Trust Factor/Comportement",
    "Failed Hint": "Stamina fail pop-up",
    "Ability Suggestion": "Suggestion de capacit\u00e9",
    "Cosmetic Ability": "Capacit\u00e9s cosm\u00e9tique",
    "Hide Behavior Summary": "Masquer le Trust Factor/Comportement",
    "Hide Failed Hint": "Masquer le pop-up d'\u00e9chec de stamina",
    "Hide Ability Suggestion": "Masquer la suggestion de capacit\u00e9",
    "Hide Cosmetic Ability": "Masquer la capacit\u00e9 cosm\u00e9tique",
    "Damage Report": "Rapport de d\u00e9g\u00e2ts",
    "Adjust the in-game chat position and scale.": "Ajuste la position et l'\u00e9chelle du chat en jeu.",
    "Adjust size of the in-game chat.": "Ajuste la taille du chat en jeu.",
    "Adjust horizontal position of the in-game chat.": "Ajuste la position horizontale du chat en jeu.",
    "Adjust vertical position of the in-game chat.": "Ajuste la position verticale du chat en jeu.",
    "Show the in-game chat panel.": "Affiche le panneau de chat en jeu.",
    "Hide Damage Report": "Masquer le rapport de d\u00e9g\u00e2ts",
    "Colored Healthbar": "Barre de sant\u00e9 color\u00e9e",
    "Colored Health": "Sant\u00e9 color\u00e9e",
    "Color Warning": "Couleur d'alerte",
    "Enemy": "Ennemi",
    "Minimalist Healthbar": "Barre de sant\u00e9 minimaliste",
    "Simplify Ability Icons": "Simplifier les ic\u00f4nes de capacit\u00e9",
    "Simplify Items": "Simplifier les items",
    "Minimalist Abilities": "Capacit\u00e9s minimalistes",
    "Minimalist Item Bar": "Barre d'items minimaliste",
    "Show Icon": "Afficher l'ic\u00f4ne",
    "Show Text": "Afficher le texte",
    "Text": "Texte",
    "Full Keybinds": "Raccourcis clavier complets",
    "Full Keys": "Toutes les touches",
    "Show Speed": "Afficher la vitesse",
    "Speed": "Vitesse",
    "Minimalist Minimap": "Mini-carte minimaliste",
    "Spinny Map": "Carte rotative",
    "Spinny Mode": "Mode rotatif",
    "Urn Colors": "Couleurs de l'urne",
    "Draw Over UI": "Appara\u00eetre au-dessus de l'UI",
    "Neutral Camps": "Camps neutres",
    "Type": "Type",
    "Bridge Buffs": "Bridge Buffs",
    "Bridge Buff": "Bridge Buff",
    "Buff": "Buff",
    "Bridge Buff Delay": "D\u00e9lai du Bridge Buff",
    "Buff Delay": "D\u00e9lai du buff",
    "Tier 1": "Niveau 1",
    "Tier 2": "Niveau 2",
    "Tier 3": "Niveau 3",
    "Voice": "Voix",
    "Custom": "Personnalis\u00e9e",
    "XQC": "XQC",
    "Asmon": "Asmon",
    "Beep": "Bip",
    "Volume": "Volume",
    "Quiet": "Bas",
    "Normal": "Normale",
    "Loud": "Fort",
    "Preview Announcer": "Tester l'Annonceur",
    "Test Announcer": "Teste de l'Annonceur",
    "Minimap Reminder": "Rappel mini-carte",
    "Timer": "Minuteur",
    "On Death Games": "Mini-jeux quand mort",
    "On Death": "\u00e0 la mort",
    "Bebop Sweeper": "Bebop le d\u00e9mineur",
    "Flappy Bat": "Flappy Bat",
    "Graves Trainer": "Graves aim trainer",
    "Whack a Rem": "Paf le Rem !",
    "Zerggy Mania": "Zerggy Spam",
    "Hitmarkers": "Hitmarkers",
    "Off": "D\u00e9sactiv\u00e9",
    "On": "Activ\u00e9",
    "Play": "Jouer",
    "Show Support": "Afficher l'assistance",
    "Change Log": "Journal des modifications",
    "CHANGE LOG": "CHANGE LOG",
    "Contributors": "Contributeurs",
    "Open": "Ouvrir",
    "Support development": "Supporter le d\u00e9veloppement",
    "View updates": "Afficher les mises \u00e0\u00a0 jour",
    "Community acknowledgements": "Remerciements de la communaut\u00e9",
    "Open Config": "Ouvrir la configuration",
    "You can support development by commissioning features or presets.": "Vous pouvez supporter le d\u00e9veloppement en commissionnant des fonctionnalit\u00e9s ou des pr\u00e9r\u00e9glages.",
    "Support development by commissioning features or presets.": "Soutenez le d\u00e9veloppement en demandant des fonctionnalit\u00e9s ou des pr\u00e9r\u00e9glages.",
    "This is a way for me to give something back to the supporters.": "C'est une fa\u00e7on pour moi de donner quelque chose aux supporters.",
    "All commissioned additions are released publicly and available to everyone.": "Tous les ajouts command\u00e9s sont rendus publics et accessibles \u00e0\u00a0 tous.",
    "The mod is <font color=\"#66cc99\">fully functional</font> and <font color=\"#66cc99\">free</font> for all users.": "Le mod est <font color=\"#66cc99\">enti\u00e8rement fonctionnel</font> et <font color=\"#66cc99\">gratuit</font> pour tous les utilisateurs.",
    "Custom Preset Commission: <font color=\"#66cc99\">$25</font>": "Commission d'un pr\u00e9r\u00e9glage\u00a0: <font color=\"#66cc99\">25\u00c2\u00a0$</font>",
    "<font color=\"#66cc99\">Free</font> updates for new features, <font color=\"#66cc99\">$5</font> for arbitrary changes": "Mises \u00e0\u00a0 jour <font color=\"#66cc99\">gratuites</font> pour les nouvelles fonctionnalit\u00e9s, <font color=\"#66cc99\">5\u00c2\u00a0$</font> pour les modifications arbitraires",
    "Settings now load from your saved build string": "Les param\u00e8tres sont d\u00e9sormais sauvegard\u00e9s \u00e0\u00a0 partir de votre cha\u00eene de build enregistr\u00e9e",
    "New Feature Commission: <font color=\"#66cc99\">$10</font> to <font color=\"#66cc99\">$100</font>": "Commission d'une nouvelle fonctionnalit\u00e9\u00a0: de <font color=\"#66cc99\">10\u00c2\u00a0$</font> \u00e0\u00a0 <font color=\"#66cc99\">100\u00c2\u00a0$</font>",
    "Depending on complexity and work involved": "En fonction de la complexit\u00e9 et du travail impliqu\u00e9",
    "Discord: <font color=\"#66cc99\">civocivocivo</font>": "Discord\u00a0: <font color=\"#66cc99\">civocivocivo</font>",
    "Without them QOL Lock would not be possible.": "Sans eux, QOL Lock ne serait pas possible.",
    "If you encounter issues please join the Discord": "Si vous rencontrez des probl\u00e8mes, veuillez rejoindre le Discord",
    "I am open to all feedback, suggestions, and ideas!": "Je suis ouvert \u00e0\u00a0 tous commentaires, suggestions et id\u00e9es !",
    "Default 18": "Par d\u00e9faut 18",
    "Default 400": "Par d\u00e9faut 400",
    "Hud Shift": "Changement HUD",
    "Easier Access": "Acc\u00e8s plus facile",
    "Always Visible Override": "Remplacement toujours visible",
    "Always Shown": "Toujours affich\u00e9",
    "Always Hidden": "Toujours cach\u00e9",
    "Metro Button": "Bouton Metro",
    "Low Stamina Popup": "Fen\u00eatre contextuelle de stamina bass",
    "On Ability Upgrade": "Sur l'upgrade des capacit\u00e9s",
    "Snowball or Poster": "Boule de neige ou Poster",
    "Recommended for 4:3": "Recommand\u00e9 pour 4:3",
    "HP Warning": "Avertissement HP",
    "Enemy HP Warning": "Avertissement HP ennemi",
    "Compact Layout": "Disposition compacte",
    "Cleaner Skills": "Comp\u00e9tences plus propres",
    "Cleaner Items": "Articles plus propres",
    "Always Visible Boost": "Boost toujours visible",
    "Realtime Drain Countdown": "Compte \u00e0\u00a0 rebours du vidage de vie en temps r\u00e9el",
    "Mirror unsecured gold number": "Mirroiter l'or non-s\u00e9curis\u00e9",
    "Realtime Key Inputs": "Inputs des touches en temps r\u00e9el",
    "Angle and Speed": "Angle et vitesse",
    "Estimated ult cooldowns under top-bar ult icons": "Cooldown Ulti estim\u00e9 en-dessous des ic\u00f4nes des persos",
    "HIGH FPS IMPACT WARNING!": "AVERTISSEMENT D'IMPACT FPS \u00c9LEV\u00c9\u00a0!",
    "Customizable Unsecured Souls": "\u00c2mes non-s\u00e9curis\u00e9es personnalisables",
    "Simplified Minimap": "Mini-carte simplifi\u00e9e",
    "Ability Menu Open": "Menu de capacit\u00e9 ouvert",
    "Scoreboard Open": "Tableau de bord ouvert",
    "Play current announcer voice and volume.": "Jouez la voix et le volume actuels de l'annonceur.",
    "Play current announcer voice.": "Jouer la voix actuelle de l'annonceur.",
    "First Spawns": "Premi\u00e8res apparitions",
    "Buff Reminder": "Rappel de buff",
    "Seconds Before Spawn": "Secondes avant l'apparition",
    "Ding to Check Minimap": "Ding de rappel pour v\u00e9rifier la mini-carte",
    "In Seconds": "En secondes",
    "Open random game when dead": "Ouvrir un jeu al\u00e9atoire une fois mort",
    "Blackjack": "Wraithjack",
    "Buff Filter": "Filtre des buffs",
    "click here": "Clique ici",
    "Click Radius": "Zone de clic",
    "Current Size": "Taille actuelle",
    "Enable Clean Stacks": "Activer des stacks plus clean",
    "Hero Icon Size": "Taille de l'ic\u00f4ne des h\u00e9ros",
    "Icon Shrink": "R\u00e9tr\u00e9cicement des ic\u00f4nes",
    "Improved Hint": "Indice am\u00e9lior\u00e9",
    "Lane with Party": "Lane avec le groupe",
    "Minimalist Opacity": "Opacit\u00e9 minimaliste",
    "Nicknames": "Pseudos",
    "Player Icon Size": "Taille de l'ic\u00f4ne du joueur",
    "Refresh Rate": "Taux de rafra\u00eechissement",
    "Show FPS": "Afficher les FPS",
    "Show Frame": "Afficher les frames",
    "Show Memory": "Afficher la m\u00e9moire",
    "Show Position": "Afficher la position",
    "Show Tick": "Afficher les ticks",
    "Shrink Distance": "Distance de r\u00e9tr\u00e9cissement",
    "Total Size": "Taille totale",
    "Ult Indicator": "Indicateur Ult",
    "Zip Thickness": "\u00c9paisseur de la tyrolienne",
    "Depending on complexity and work involved, contact me on": "En fonction de la complexit\u00e9 et du travail \u00e0\u00a0 r\u00e9aliser, contactez-moi au",
    "If you encounter issues, need help, or have any feedback join the Discord.": "Si vous rencontrez des probl\u00e8mes, avez besoin d'aide ou avez des commentaires, rejoignez le Discord.",
    "Reset section runtime options": "R\u00e9initialiser les options d'ex\u00e9cution de la section",
    "Reset section to defaults": "R\u00e9initialiser la section aux valeurs par d\u00e9faut",
    "DO NOT PRESS ANY KEYS UNTIL COMPLETE UNLESS PROMPTED": "APPUIE SUR RIEN DU TOUT SAUF SI PR\u00c9CIS\u00c9 (JE TE VOIS HYN)",
    "If saving stalls, open your shop.": "Si la sauvegarde bloque, ouvre le shop",
    "Play Sound ": "Jouer du son",
    "1st": "1er",
    "2nd": "2\u00e8me",
    "3rd": "3\u00e8me",
    "Size of your current ammo.": "La taille de l'affichage des munitions actuelles.",
    "Size of your total ammo.": "La taille de l'affichage des munitions totales.",
    "Cleans up the styling of reticle hints.": "Nettoie le style des indices du r\u00e9ticule.",
    "Automatically selects Lane Preference: With Party for matchmaking.": "S\u00e9lectionne automatiquement la pr\u00e9f\u00e9rence de lane : Avec le groupe pour le matchmaking.",
    "Shows nicknames of all players in the game within the top bar.": "Affiche les pseudos de tous les joueurs dans la barre sup\u00e9rieure.",
    "Show the ultimate indicator for V1 healthbars.": "Affiche l'indicateur d'ultime pour les barres de vie V1",
    "Colored enemy healthbar warnings when at significant thresholds.": "Avertissements color\u00e9s de barre de vie ennemie \u00e0\u00a0 des seuils importants",
    "Enemy healthbar enhancements.": "Am\u00e9liorations des barres de vie ennemies",
    "Opacity of the background of Minimalist Minimap.": "Opacit\u00e9 de l'arri\u00e8re-plan de la mini-carte minimaliste.",
    "The click hitbox of your pings or clicks, this can help make pings more accurate.": "La hitbox des pings ou des clicks afin d'\u00eatre + pr\u00e9cis",
    "How much icons will shrink when overlapping with others.": "Comment les ic\u00f4nes se r\u00e9tr\u00e9cissent quand elles se superposent",
    "The size of other players on the minimap.": "La taille des autres joueurs sur la mini-carte.",
    "The size of yourself on the minimap.": "La taille de ton ic\u00f4ne sur la mini-carte.",
    "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.": "La distance \u00e0 partir de laquelle les ic\u00f4nes commencent \u00e0 r\u00e9tr\u00e9cir. Plus bas = positions plus pr\u00e9cises, plus haut = meilleure visibilit\u00e9",
    "The thickness of the Zipline lines across the map.": "L'\u00e9paisseur de la tyrolienne sur la carte",
    "How fast the minimap refreshes.": "La fr\u00e9quence de rafra\u00eechissement de la carte",
    "RAM and GPU Memory real time usage statistics.": "Affiche les statistiques en temps r\u00e9el de la RAM et de la m\u00e9moire GPU.",
    "Position and Velocity real time statistics.": "Affiche les statistiques en temps r\u00e9el de position et de vitesse.",
    "Shows real time tick information, mostly useless.": "Affiche les informations de tick en temps r\u00e9el, globalement peu utile.",
    "Shows raw FPS count.": "Affiche le nombre brut de FPS.",
    "Shows current frame count, mostly useless.": "Affiche le nombre actuel de frames (pas utile)",
    "The hero you automatically switch to on launch or after saving..": "Le perso avec lequel tu vas automatiquement charger apr\u00e8s le lancement ou la sauvegarde",
    "Toggle the hitmarkers when attacking enemies.": "Montre ou non les hitmarkers quand tu touche un ennemi",
    "Choose which bridge buff sound variants can play.": "Choisit quelles variantes sonores du buff de pont peuvent jouer.",
    "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.": "D\u00e9finit quels \u00e9v\u00e9nements d\u00e9clenchent un son. Camps = une seule fois (spawn) , Buff = toutes les 5 minutes",
    "FPS Impact:": "Impact sur les FPS \u00a0:",
    "Created By:": "Cr\u00e9\u00e9 par :",
    "Author:": "Auteur:",
    "Voice Actor:": "Acteur vocal\u00a0:",
    "None": "Aucun",
    "Low": "Faible",
    "Medium": "Moyen",
    "High": "Haut",
    "Adjust horizontal position of the player healthbar.": "Ajuste la position horizontale de la barre de vie du joueur.",
    "Adjust opacity of the player healthbar.": "Ajuste l'opacit\u00e9 de la barre de vie du joueur.",
    "Adjust size of the player healthbar.": "Ajuste la taille de la barre de vie du joueur.",
    "Adjust vertical position of the player healthbar.": "Ajuste la position verticale de la barre de vie du joueur.",
    "An always visible zipline boost overlay.": "Un overlay du boost tyrolienne tjrs visible",
    "Centers ESC menu elements to make them easier to access.": "Centre les \u00e9l\u00e9ments du menu ESC pour les rendre plus faciles d'acc\u00e8s.",
    "Centers friends list area in ESC menu.": "Centre la liste d'amis dans le menu ESC.",
    "Adds a STAT button on profile rows that opens Statlocker for that account.": "Ajoute un bouton STAT sur le profil qui ouvre Statlocker pour ce profil",
    "Cleans up visuals of abilities significantly to reduce clutter.": "Nettoie consid\u00e9rablement les visuels des capacit\u00e9s pour faciliter la vue",
    "Cleans up visuals of the item bar significantly to reduce clutter.": "Nettoie consid\u00e9rablement les visuels de la barre d'\u00e9l\u00e9ments pour faciliter la vue",
    "Cleans up visuals of the minimap significantly to reduce clutter.": "Simplifie fortement les visuels de la mini-carte pour faciliter la vue",
    "Cleans up visuals of the shop menu significantly to reduce clutter.": "Simplifie fortement les visuels du menu boutique pour faciliter la vue",
    "Colored healthbar warnings when at significant thresholds.": "Avertissements color\u00e9s de barre de vie \u00e0\u00a0 des seuils importants.",
    "Current ammo inside of your magazine.": "La quantit\u00e9 actuelle de munitions dans votre chargeur.",
    "Customize the styling of damage numbers.": "Personnalise le style des nombres de d\u00e9g\u00e2ts.",
    "Customize the visuals of the incoming damage panel.": "Personnalise les visuels du panneau de d\u00e9g\u00e2ts subis.",
    "Customize unsecured souls visuals.": "Personnalise les visuels des \u00e2mes non s\u00e9curis\u00e9es.",
    "Customize visibility of target reticle when abilities or items visually show on allies and enemies.": "Personnalise la visibilit\u00e9 du r\u00e9ticule lorsque des capacit\u00e9s ou objets s'affichent sur alli\u00e9s et ennemis.",
    "Customized healthbars for better visibility or flair.": "Barres de vie personnalis\u00e9es pour une meilleure lisibilit\u00e9 ou un meilleur style.",
    "Decide what style of item to display the cooldown of.": "D\u00e9termine quel style d'objet affiche le cooldown",
    "Draws the minimap over all other UI elements for improved visibility.": "Affiche la mini-carte au-dessus des autres \u00e9l\u00e9ments d'interface pour une meilleure visibilit\u00e9.",
    "Forcibly hides testing tools at all times.": "Force le masquage permanent des outils de test.",
    "Forcibly shows testing tools at all times.": "Force l'affichage permanent des outils de test.",
    "Greys out heros in the top bar when missing on the map.": "Assombris fortement les h\u00e9ros dans la barre sup\u00e9rieure lorsqu'ils ne sont pas visibles",
    "Highlighted abilities showing you what you should upgrade depending on build.": "Montre ou non les capacit\u00e9s sugg\u00e9r\u00e9es du build",
    "Improve Ability Stacks": "Am\u00e9liore l'affichage des stacks de capacit\u00e9s.",
    "Makes the minimap rotate with player view, this is just for fun.": "Fait pivoter la mini-carte avec la vue du joueur,(\u00e7a donne v'l\u00e0 le tournis)",
    "Menu when you receive a punishment for breaking game rules.": "C'est genre si t'es toxique et que t'as un cooldown, ou parce que t'as quitt\u00e9 et que dcp t'as une mauvaise r\u00e9p",
    "Only download the filter file of the filter you want, nothing else.": "T\u00e9l\u00e9charge juste le filtre voulu et rien d'autre",
    "Play an audio reminder to remember to look at the minimap.": "Joue un rappel audio pour penser \u00e0\u00a0 regarder la mini-carte.",
    "Ragnarok Online damage visuals with improved fancy styling.": "Visuels de d\u00e9g\u00e2ts fa\u00e7on Ragnarok Online avec un style plus travaill\u00e9",
    "Real time key input visual.": "Bah tu sais ce que c'est un overlay non?",
    "See your view angle and speed.": "Affiche l'angle de vue (N,S,E,O) et la vitesse.",
    "Shifts the HUD for better visual support for 16:10 resolutions.": "Adapte le HUD pour les gens en 16:10",
    "Shifts the HUD for better visual support for 4:3 resolutions.": "Adapte le HUD pour les gens en 4:3",
    "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.": "Affiche une minimap avec les Gardiens, Walkers et la Base actuelle",
    "Show if you are in combat or not.": "Indique si vous \u00eates en combat ou non.",
    "Show player ultimate indicators on V1 healthbars.": "Afficher les indicateurs d'ultimes du perso sur les barres de sant\u00e9 V1.",
    "Show the estimated time for unsecured souls to dissapear.": "Affiche le temps estim\u00e9 avant la disparition des \u00e2mes non s\u00e9curis\u00e9es.",
    "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.": "Affiche un indicateur visuel sur la mini-carte pour l'apparition des Bridge Buff",
    "Shows a visual indicator in the minimap of when Mid Boss will spawn.": "Affiche un indicateur visuel sur la mini-carte pour l'apparition du Mid Boss",
    "Changes urn color to know which side is favored, green for your team, red for the enemy.": "Change la couleur de l'urne pour savoir quel camp est favoris\u00e9, vert pour votre \u00e9quipe, rouge pour l'ennemi.",
    "Shows a visual indicator in the top bar of the percentage difference of souls between teams.": "Affiche un indicateur visuel dans la barre sup\u00e9rieure pour la diff\u00e9rence en pourcentage d'\u00e2mes entre les \u00e9quipes.",
    "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.": "Affiche un indicateur visuel dans la barre sup\u00e9rieure pour l'apparition des Bridge Buff",
    "Shows a visual indicator in the top bar of when Mid Boss will spawn.": "Affiche un indicateur visuel dans la barre sup\u00e9rieure pour l'apparition du Mid Boss",
    "Shows all of your keybinds.": "Affiche tous les raccourcis clavier.",
    "Shows all of your player stats within the shop menu.": "Affiche toutes les statistiques du joueur dans le menu de la boutique.",
    "Shows item cooldowns near crosshair for easier readability.": "Affiche les temps de recharge des objets pr\u00e8s du r\u00e9ticule pour une meilleure lisibilit\u00e9.",
    "Shows the individual player souls per minute on scoreboard and the team in the top bar.": "Affiche les \u00e2mes par minute de chaque joueur dans le tableau des scores et l'\u00e9quipe dans la barre sup\u00e9rieure.",
    "Shows the individual player's objective damage in the top bar.": "Affiche les d\u00e9g\u00e2ts aux objectifs de chaque joueur dans la barre sup\u00e9rieure.",
    "Shows the individual player's unspent souls in the top bar.": "Affiche les \u00e2mes non d\u00e9pens\u00e9es de chaque joueur dans la barre sup\u00e9rieure.",
    "Shows your character in the shop menu.": "Affiche le personnage dans le menu de la boutique.",
    "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).": "Am\u00e9liore nettement la visibilit\u00e9 du r\u00e9ticule et la mise en \u00e9vidence des port\u00e9es d'ex\u00e9cution.",
    "Simplifies the Compass overlay to its bare elements.": "Simplifie l'overlay de la boussole en mettant juste les essentiels",
    "Slight adjustments to the HUD for better streaming output.": "L\u00e9gers ajustements du HUD pour un meilleur de streaming.",
    "Speed number tracker.": "Affiche un indicateur num\u00e9rique de vitesse.",
    "Stretch the compass horizontally.": "\u00c9tire la boussole horizontalement.",
    "Stretch the compass vertically.": "\u00c9tire la boussole verticalement.",
    "The circle countdown for when you are reloading.": "Le compte \u00e0\u00a0 rebours circulaire pendant le rechargement.",
    "The cosmetic ability on your default 5 key, like posters and snowballs.": "La capacit\u00e9 cosm\u00e9tique (genre les affiches et des boules de neige)",
    "The damage dealt to Trooper minions.": "Les d\u00e9g\u00e2ts inflig\u00e9s aux Trooper.",
    "The icon that replaces your crosshair when reloading.": "L'ic\u00f4ne qui remplace votre r\u00e9ticule pendant le rechargement.",
    "The interval in which the sound plays in seconds.": "L'intervalle, en secondes, auquel le son est jou\u00e9.",
    "The item buying auto queue system in the shop menu.": "Le syst\u00e8me de file d'achat automatique dans le menu de la boutique.",
    "The large cumulative damage number.": "Le grand nombre de d\u00e9g\u00e2ts cumul\u00e9s.",
    "The popup signifying you are too low on stamina to cast another movement input.": "La fen\u00eatre contextuelle indiquant que votre endurance est trop faible pour lancer une autre action de mouvement.",
    "The small incremental damage numbers.": "Les petits nombres de d\u00e9g\u00e2ts incr\u00e9mentaux.",
    "The small visual icon.": "La petite ic\u00f4ne visuelle.",
    "The unsecured text.": "Le texte des \u00e2mes non s\u00e9curis\u00e9es.",
    "The world background blur effect behind the shop menu.": "L'effet de flou d'arri\u00e8re-plan derri\u00e8re le menu de la boutique.",
    "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.": "Il s'agit d'une version l\u00e9g\u00e8re avec un net gain de FPS, mais qui n\u00e9cessite un fichier de filtres s\u00e9par\u00e9.",
    "Time before the announcement happens in seconds.": "D\u00e9lai avant l'annonce, en secondes.",
    "Total ammo amount.": "La quantit\u00e9 totale de munitions.",
    "View a cooldown timer for reloading time.": "Affiche un minuteur pour la dur\u00e9e de rechargement.",
    "View an enhanced minimap on opening ability menu.": "Affiche une mini-carte agrandie \u00e0\u00a0 l'ouverture du menu des capacit\u00e9s.",
    "View an enhanced minimap on opening scoreboard menu.": "Affiche une mini-carte agrandie \u00e0\u00a0 l'ouverture du tableau des scores.",
    "View the cooldown time of player ultimates.": "Affiche le temps de recharge des ultimes des joueurs.",
    "Visual indicator of your current ammo.": "Indicateur visuel de vos munitions actuelles.",
    "You can download custom announcer packs, just download the correct one for the slot you want to replace.": "Vous pouvez t\u00e9l\u00e9charger des packs d'annonceur personnalis\u00e9s, il suffit de prendre celui du slot que vous voulez remplacer.",
    "COPY": "COPIER",
    "COPIED": "COPI\u00c9",
    "FAILED": "\u00c9CHEC",
    "SAVE": "SAUVEGARDER",
    "HIDEOUT": "CACHETTE",
    "QUEUED": "EN QUEUE",
    "APPLY": "APPLIQUER",
    "APPLIED": "APPLIQU\u00c9",
    "AIRHEART": "AIRHEART",
    "SAVING": "EN TRAIN DE SAUVEGARDER",
    "VERIFY": "V\u00c9RIFIFICATION",
    "SAVED": "SAUVEGARD\u00c9",
    "TIMEOUT": "TEMPS MORT",
    "CLEAR": "EFFACER",
    "CLEARING": "CLAIRI\u00c8RE",
    "CLEARED": "EFFAC\u00c9",
    "Statistics": "Statistiques",
    "Combat Status": "Statut de combat",
    "Easy": "Facile",
    "Hard": "Difficile",
    "SUPPORT THE MOD": "SOUTENIR LE MOD",
    "Play Sound": "Jouer le son",
    "Fighting Game": "Jeu de combat",
    "Open shop to continue save.": "Ouvre la boutique pour continuer \u00e0\u00a0sauvegarder",
    "Switching to Airheart...": "Passer \u00e0\u00a0 Airheart...",
    "Writing settings string to build...": "\u00c9criture de la cha\u00eene de code de param\u00e8tres \u00e0\u00a0 construire...",
    "Save in progress...": "Sauvegarde en cours...",
    "Save timed out. Try again.": "Le d\u00e9lai d'enregistrement a expir\u00e9. Essayer \u00e0\u00a0 nouveau.",
    "Save completed.": "Sauvegarde termin\u00e9e.",
    "Save failed.": "L'enregistrement a \u00e9chou\u00e9.",
    "Save works only in hideout.": "La sauvegarde ne fonctionne que dans la cachette.",
    "Failed to queue save request.": "\u00c9chec de la mise en file d'attente de la demande de sauvegarde.",
    "Save queued.": "Enregistrement en file d'attente.",
    "Open shop to continue clear.": "Ouvre la boutique pour continuer \u00e0\u00a0supprimer",
    "Confirming Airheart for clear...": "Confirmation d'Airheart pour la suppression...",
    "Clearing builds...": "Effacement des builds...",
    "Clear in progress...": "Suppression en cours...",
    "Clear timed out. Try again.": "Le d\u00e9lai d'effacement a expir\u00e9. Essayer \u00e0\u00a0 nouveau.",
    "Clear completed.": "Effacement termin\u00e9.",
    "Clear failed.": "\u00c9chec de la suppression.",
    "en": "fr",
    "Section already at defaults.": "Section d\u00e9j\u00e0\u00a0 par d\u00e9faut.",
    "Ready.": "Pr\u00eat.",
    "Share or save your settings configuration!": "Partagez ou enregistrez la configuration de vos param\u00e8tres\u00a0!",
    "Local settings loaded.": "Param\u00e8tres locaux charg\u00e9s.",
    "Export string copied.": "Cha\u00eene d'exportation copi\u00e9e.",
    "Clipboard copy failed.": "La copie du Presse-papiers a \u00e9chou\u00e9.",
    "Airheart switch sent.": "Changement de perso Airheart",
    "Failed to switch hero.": "\u00c9chec du changement de h\u00e9ros.",
    "Strings may sometimes break between mod versions.": "Les cha\u00eenes de code (pour la sauvegarde) peuvent parfois se corompre entre les versions du mod.",
    "Import: parsing string...": "Importer\u00a0: analyse de la cha\u00eene...",
    "Import: applying settings...": "Importer\u00a0: appliquer les param\u00e8tres...",
    "Import: refreshing UI...": "Importer\u00a0: rafra\u00eechissement de l'UI...",
    "Import failed.": "L'importation a \u00e9chou\u00e9.",
    "Invalid import string.": "Cha\u00eene d'importation invalide.",
    "Row already at defaults.": "Ligne d\u00e9j\u00e0\u00a0 aux valeurs par d\u00e9faut.",
    "Preset apply failed.": "L'application du pr\u00e9r\u00e9glage a \u00e9chou\u00e9.",
    "Scales the element.": "Met \u00e0\u00a0 l'\u00e9chelle l'\u00e9l\u00e9ment.",
    "Changes the element's transparency.": "Modifie la transparence de l'\u00e9l\u00e9ment.",
    "Moves the element horizontally.": "D\u00e9place l'\u00e9l\u00e9ment horizontalement.",
    "Moves the element vertically.": "D\u00e9place l'\u00e9l\u00e9ment verticalement.",
    "Reset to default value": "R\u00e9initialiser \u00e0\u00a0 la valeur par d\u00e9faut",
    "Reset row to defaults": "R\u00e9initialiser la ligne aux valeurs par d\u00e9faut",
    "Randomly opens an enabled arcade game while dead.": "Ouvre al\u00e9atoirement un jeu d'arcade activ\u00e9 alors qu'il est mort.",
    "Fountain-style damage number animation.": "Animation du num\u00e9ro de d\u00e9g\u00e2ts de style fontaine.",
    "Russian": "Russe",
    "Chinese": "Chinois",
    "Troubleshoot": "R\u00e9solution de probl\u00e8mes",
    "Klutz's Bar": "Barre de Klutz",
    "Budhud": "Budhud",
    "Settings Changes": "Modifications des param\u00e8tres",
    "Changes: ": "Modifications : ",
    "Confirm": "Confirmer",
    "Cancel": "Annuler",
    "The displayed language of the settings menu.": "La langue affich\u00e9e dans le menu des param\u00e8tres.",
    "Preview realtime changes to settings when modifying them.": "Pr\u00e9visualise en temps r\u00e9el les modifications des param\u00e8tres pendant leur ajustement.",
    "Restores the legacy removed duration bars for abilities.": "Restaure les anciennes barres de dur\u00e9e supprim\u00e9es pour les capacit\u00e9s.",
    "Centers the friends list area within the ESC menu.": "Centre la zone de liste d'amis dans le menu ESC.",
    "Enhanced V2 enemy healthbar visuals and readability.": "Am\u00e9liore les visuels et la lisibilit\u00e9 des barres de vie ennemies V2.",
    "Show the UnitInfo panel on V2 enemy healthbars.": "Affiche le panneau UnitInfo sur les barres de vie ennemies V2.",
    "Show level text on V2 enemy healthbars.": "Affiche le niveau sur les barres de vie ennemies V2.",
    "V2 enemy healthbar enhancements.": "Am\u00e9liorations des barres de vie ennemies V2.",
    "Welcome to QOL Lock": "Bienvenue sur QOL Lock",
    "Wraithjack": "Wraithjack",
    "Changes:": "Modifications :",
    "Portuguese": "Portugais",
    "BR Portuguese": "BR Portugais",
    "Spanish": "Espagnol",
    "Optimize Mode": "Mode Optimis\u00e9",
    "Shown Items": "Items visible",
};

const SETTINGS_PT_TEXT = {
    "Config": "Configura\u00e7\u00e3o",
    "Presets": "Predefini\u00e7\u00f5es",
    "Crosshair": "Mira",
    "HUD": "HUD",
    "UI": "UI",
    "Overlay": "Sobreposi\u00e7\u00e3o",
    "Minimap": "Minimapa",
    "Audio": "\u00c1udio",
    "Console": "Console",
    "General": "Em geral",
    "Discord": "Discord",
    "Support": "Apoiar",
    "Meta Settings": "Metaconfigura\u00e7\u00f5es",
    "Preview": "Visualiza\u00e7\u00e3o",
    "Drag": "Arrastar",
    "Language": "Linguagem",
    "Default Hero": "Her\u00f3i padr\u00e3o",
    "English": "English",
    "French": "French",
    "Settings UI Language": "Idioma da IU de configura\u00e7\u00f5es",
    "Hero on Load or Save": "Her\u00f3i ao carregar ou salvar",
    "Realtime Settings Changes": "Altera\u00e7\u00f5es nas configura\u00e7\u00f5es em tempo real",
    "Realtime Changes": "Mudan\u00e7as em tempo real",
    "Draggable UI": "IU arrast\u00e1vel",
    "Enable": "Habilitar",
    "Export Settings": "Exportar configura\u00e7\u00f5es",
    "Import Settings": "Configura\u00e7\u00f5es de importa\u00e7\u00e3o",
    "Export String": "Exportar sequ\u00eancia",
    "Import String": "String de importa\u00e7\u00e3o",
    "How to Save Settings": "Como salvar configura\u00e7\u00f5es",
    "Share your settings string": "Compartilhe sua string de configura\u00e7\u00f5es",
    "Paste and apply an exported settings string": "Cole e aplique uma string de configura\u00e7\u00f5es exportada",
    "Search Results": "Resultados da pesquisa",
    "No results found": "Nenhum resultado encontrado",
    "Better Item Cooldowns": "Melhores tempos de espera de itens",
    "Item Cooldowns": "Recargas de itens",
    "Tracked cooldowns near crosshair": "Cooldowns rastreados perto da mira",
    "Light Item Cooldowns": "Recargas de itens leves",
    "Advanced Mode": "Modo avan\u00e7ado",
    "Optimize Filters": "Otimizar filtros",
    "No filter settings but better FPS.": "Sem configura\u00e7\u00f5es de filtro, mas melhor FPS.",
    "Filters": "Filtros",
    "Get Filter File Only": "Obter apenas arquivo de filtro",
    "Download": "Download",
    "Advanced Filter": "Filtro avan\u00e7ado",
    "Defensive Passive": "Passivo Defensivo",
    "Offensive Passive": "Passivo Ofensivo",
    "Defensive Active": "Ativo Defensivo",
    "Offensive Active": "Ofensiva Ativa",
    "Damage Numbers": "N\u00fameros de danos",
    "Ammo": "Muni\u00e7\u00e3o",
    "Reload Cooldown": "Tempo de recarga de recarga",
    "Reloading": "Recarregando",
    "Item Target Reticle": "Ret\u00edculo alvo do item",
    "Top Bar Plus": "Barra superior mais",
    "Top Bar": "Barra superior",
    "Shop": "Comprar",
    "HUD Controls": "Controles do HUD",
    "UI Controls": "Controles de IU",
    "Chat": "Bater papo",
    "Legacy Durations": "Dura\u00e7\u00f5es legadas",
    "Healthbar": "Barra de sa\u00fade",
    "Player": "Jogador",
    "Bottom Bar": "Barra inferior",
    "Simplify": "Simplificar",
    "Zipline Boost": "Impulso de tirolesa",
    "Souls Timer": "Temporizador de almas",
    "Unsecured Souls Timer": "Temporizador de almas inseguras",
    "Unsecured Timer": "Temporizador inseguro",
    "Better Unsecured": "Melhor inseguro",
    "Better Unsecured Souls": "Almas melhores e inseguras",
    "Unsecured Plus": "Mais inseguro",
    "Keyboard": "Teclado",
    "Compass": "B\u00fassola",
    "Ult Cooldowns": "Tempos de Recarga Ult",
    "Alt Zoom": "Zoom alternativo",
    "Tab Zoom": "Zoom da guia",
    "Announcer": "Locutor",
    "Arcade": "Arcada",
    "Game Settings": "Configura\u00e7\u00f5es do jogo",
    "Games": "Jogos",
    "Game Audio": "\u00c1udio do jogo",
    "Difficulty": "Dificuldade",
    "Supporting and Feature Requests": "Solicita\u00e7\u00f5es de suporte e recursos",
    "Issues, Feedback and Ideas": "Problemas, coment\u00e1rios e ideias",
    "Contact": "Contato",
    "Special Thanks": "Agradecimentos especiais",
    "Size": "Tamanho",
    "Opacity": "Opacidade",
    "Scale": "Escala",
    "Horizontal Offset": "Deslocamento Horizontal",
    "Vertical Offset": "Deslocamento vertical",
    "Horizontal Stretch": "Alongamento horizontal",
    "Vertical Stretch": "Alongamento Vertical",
    "Visual": "Visual",
    "Hide All": "Ocultar tudo",
    "Current": "Atual",
    "Total": "Total",
    "Icon": "\u00cdcone",
    "Circle": "C\u00edrculo",
    "Big Number": "Grande n\u00famero",
    "Big Numbers": "Grandes n\u00fameros",
    "Damage Fountain": "Fonte de Dano",
    "Small Numbers": "N\u00fameros Pequenos",
    "Trooper Damage": "Danos ao soldado",
    "Hide Current": "Ocultar atual",
    "Hide Total": "Ocultar total",
    "Hide Icon": "Ocultar \u00edcone",
    "Hide Circle": "Ocultar C\u00edrculo",
    "Hide Big Number": "Ocultar grande n\u00famero",
    "Hide Small Numbers": "Ocultar n\u00fameros pequenos",
    "Hide Trooper Damage": "Ocultar dano do soldado",
    "Highlight Mode": "Modo de destaque",
    "Big Red": "Grande Vermelho",
    "Unspent Souls": "Almas n\u00e3o gastas",
    "Souls Per Minute": "Almas por minuto",
    "Objective Damage": "Dano Objetivo",
    "Objective Map": "Mapa Objetivo",
    "Urn Difference": "Diferen\u00e7a de Urna",
    "Buff Timer": "Temporizador de b\u00f4nus",
    "Bridge Buff Timer": "Temporizador de Buff de Ponte",
    "Mid Boss Timer": "Temporizador de chefe m\u00e9dio",
    "Missing Hero Opaque": "Her\u00f3i desaparecido opaco",
    "Display Stats": "Exibir estat\u00edsticas",
    "Display Hero": "Her\u00f3i de exibi\u00e7\u00e3o",
    "Simplify Shop": "Simplifique a loja",
    "Stats": "Estat\u00edsticas",
    "Hero": "Her\u00f3i",
    "Minimalist": "Minimalista",
    "Blur": "Borr\u00e3o",
    "Quick Buy": "Compra r\u00e1pida",
    "Hide Blur": "Ocultar desfoque",
    "Hide Quick Buy": "Ocultar compra r\u00e1pida",
    "16:10 Support": "16h10 Suporte",
    "4:3 Support": "4:3 Suporte",
    "21:9 Stream Fix": "Corre\u00e7\u00e3o de transmiss\u00e3o 21:9",
    "Centered ESC Menu": "Menu ESC centralizado",
    "Centered Friends List": "Lista de amigos centralizada",
    "Statlocker": "Statlocker",
    "Force Testing Tools": "Ferramentas de teste de for\u00e7a",
    "Show Testing Tools": "Mostrar ferramentas de teste",
    "Hide Testing Tools": "Ocultar ferramentas de teste",
    "Behavior Summary": "Resumo de comportamento",
    "Failed Hint": "Dica falhada",
    "Ability Suggestion": "Sugest\u00e3o de habilidade",
    "Cosmetic Ability": "Habilidade cosm\u00e9tica",
    "Hide Behavior Summary": "Ocultar resumo de comportamento",
    "Hide Failed Hint": "Ocultar dica com falha",
    "Hide Ability Suggestion": "Ocultar sugest\u00e3o de habilidade",
    "Hide Cosmetic Ability": "Ocultar habilidade cosm\u00e9tica",
    "Damage Report": "Relat\u00f3rio de danos",
    "Adjust the in-game chat position and scale.": "Ajuste a posi\u00e7\u00e3o e a escala do bate-papo no jogo.",
    "Adjust size of the in-game chat.": "Ajuste o tamanho do chat do jogo.",
    "Adjust horizontal position of the in-game chat.": "Ajuste a posi\u00e7\u00e3o horizontal do chat do jogo.",
    "Adjust vertical position of the in-game chat.": "Ajuste a posi\u00e7\u00e3o vertical do chat do jogo.",
    "Show the in-game chat panel.": "Mostre o painel de bate-papo do jogo.",
    "Hide Damage Report": "Ocultar relat\u00f3rio de danos",
    "Colored Healthbar": "Barra de sa\u00fade colorida",
    "Colored Health": "Sa\u00fade Colorida",
    "Color Warning": "Aviso de cor",
    "Enemy": "Inimigo",
    "Minimalist Healthbar": "Barra de sa\u00fade minimalista",
    "Simplify Ability Icons": "Simplifique os \u00edcones de habilidade",
    "Simplify Items": "Simplifique os itens",
    "Minimalist Abilities": "Habilidades minimalistas",
    "Minimalist Item Bar": "Barra de itens minimalista",
    "Show Icon": "Mostrar \u00edcone",
    "Show Text": "Mostrar texto",
    "Text": "Texto",
    "Full Keybinds": "Atalhos de teclado completos",
    "Full Keys": "Chaves completas",
    "Show Speed": "Mostrar velocidade",
    "Speed": "Velocidade",
    "Minimalist Minimap": "Minimapa minimalista",
    "Spinny Map": "Mapa girat\u00f3rio",
    "Spinny Mode": "Modo girat\u00f3rio",
    "Urn Colors": "Cores da urna",
    "Draw Over UI": "Desenhar sobre a IU",
    "Neutral Camps": "Acampamentos Neutros",
    "Type": "Tipo",
    "Bridge Buffs": "B\u00f4nus da ponte",
    "Bridge Buff": "Bridge Buff",
    "Buff": "Buff",
    "Bridge Buff Delay": "Atraso de Buff da Ponte",
    "Buff Delay": "Atraso de b\u00f4nus",
    "Tier 1": "Camada 1",
    "Tier 2": "Camada 2",
    "Tier 3": "N\u00edvel 3",
    "Voice": "Voz",
    "Custom": "Personalizado",
    "XQC": "XQC",
    "Asmon": "Asmon",
    "Beep": "Bip",
    "Volume": "Volume",
    "Quiet": "Quieto",
    "Normal": "Normal",
    "Loud": "Alto",
    "Preview Announcer": "Locutor de pr\u00e9-visualiza\u00e7\u00e3o",
    "Test Announcer": "Locutor de teste",
    "Minimap Reminder": "Lembrete de minimapa",
    "Timer": "Temporizador",
    "On Death Games": "Sobre Jogos da Morte",
    "On Death": "Na morte",
    "Bebop Sweeper": "Bebop Sweeper",
    "Flappy Bat": "Flappy Bat",
    "Graves Trainer": "Treinador de T\u00famulos",
    "Whack a Rem": "Bata em um Rem",
    "Zerggy Mania": "Zerggy Mania",
    "Hitmarkers": "Marcadores de sucesso",
    "Off": "Desligado",
    "On": "Sobre",
    "Play": "Jogar",
    "Show Support": "Mostrar suporte",
    "Change Log": "Registro de altera\u00e7\u00f5es",
    "Contributors": "Colaboradores",
    "Open": "Abrir",
    "Support development": "Apoiar o desenvolvimento",
    "View updates": "Ver atualiza\u00e7\u00f5es",
    "Community acknowledgements": "Reconhecimentos da comunidade",
    "Open Config": "Abrir configura\u00e7\u00e3o",
    "You can support development by commissioning features or presets.": "Voc\u00ea pode apoiar o desenvolvimento comissionando recursos ou predefini\u00e7\u00f5es.",
    "Support development by commissioning features or presets.": "Apoie o desenvolvimento comissionando recursos ou predefini\u00e7\u00f5es.",
    "This is a way for me to give something back to the supporters.": "Esta \u00e9 uma forma de retribuir algo aos apoiadores.",
    "All commissioned additions are released publicly and available to everyone.": "Todas as adi\u00e7\u00f5es comissionadas s\u00e3o divulgadas publicamente e est\u00e3o dispon\u00edveis para todos.",
    "The mod is <font color=\"#66cc99\">fully functional</font> and <font color=\"#66cc99\">free</font> for all users.": "O mod \u00e9 <font color=\"#66cc99\">totalmente funcional</font> e <font color=\"#66cc99\">gratuito</font> para todos os usu\u00e1rios.",
    "Custom Preset Commission: <font color=\"#66cc99\">$25</font>": "Comiss\u00e3o predefinida personalizada: <font color=\"#66cc99\">$25</font>",
    "<font color=\"#66cc99\">Free</font> updates for new features, <font color=\"#66cc99\">$5</font> for arbitrary changes": "Atualiza\u00e7\u00f5es <font color=\"#66cc99\">gratuitas</font> para novos recursos, <font color=\"#66cc99\">$5</font> para altera\u00e7\u00f5es arbitr\u00e1rias",
    "Settings now load from your saved build string": "As configura\u00e7\u00f5es agora s\u00e3o carregadas a partir da string de compila\u00e7\u00e3o salva",
    "New Feature Commission: <font color=\"#66cc99\">$10</font> to <font color=\"#66cc99\">$100</font>": "Comiss\u00e3o de novos recursos: <font color=\"#66cc99\">$10</font> a <font color=\"#66cc99\">$100</font>",
    "Depending on complexity and work involved": "Dependendo da complexidade e do trabalho envolvido",
    "Discord: <font color=\"#66cc99\">civocivocivo</font>": "Discord: <font color=\"#66cc99\">civocivocivo</font>",
    "Without them QOL Lock would not be possible.": "Sem eles o QOL Lock n\u00e3o seria poss\u00edvel.",
    "If you encounter issues please join the Discord": "Se voc\u00ea encontrar problemas, entre no Discord",
    "I am open to all feedback, suggestions, and ideas!": "Estou aberto a todos os coment\u00e1rios, sugest\u00f5es e ideias!",
    "Default 18": "Padr\u00e3o 18",
    "Default 400": "Padr\u00e3o 400",
    "Hud Shift": "Mudan\u00e7a de Hud",
    "Easier Access": "Acesso mais f\u00e1cil",
    "Always Visible Override": "Substitui\u00e7\u00e3o sempre vis\u00edvel",
    "Always Shown": "Sempre mostrado",
    "Always Hidden": "Sempre oculto",
    "Metro Button": "Bot\u00e3o Metr\u00f4",
    "Low Stamina Popup": "Pop-up de baixa resist\u00eancia",
    "On Ability Upgrade": "Na atualiza\u00e7\u00e3o de habilidade",
    "Snowball or Poster": "Bola de neve ou p\u00f4ster",
    "Recommended for 4:3": "Recomendado para 4:3",
    "HP Warning": "Aviso HP",
    "Enemy HP Warning": "Aviso de HP inimigo",
    "Compact Layout": "Layout compacto",
    "Cleaner Skills": "Habilidades de limpeza",
    "Cleaner Items": "Itens mais limpos",
    "Always Visible Boost": "Impulso sempre vis\u00edvel",
    "Realtime Drain Countdown": "Contagem regressiva de drenagem em tempo real",
    "Mirror unsecured gold number": "Espelhar n\u00famero ouro inseguro",
    "Realtime Key Inputs": "Principais entradas em tempo real",
    "Angle and Speed": "\u00c2ngulo e Velocidade",
    "Estimated ult cooldowns under top-bar ult icons": "Cooldowns estimados de ult nos \u00edcones de ult da barra superior",
    "HIGH FPS IMPACT WARNING!": "AVISO DE IMPACTO DE ALTO FPS!",
    "Customizable Unsecured Souls": "Almas Inseguras Personaliz\u00e1veis",
    "Simplified Minimap": "Minimapa simplificado",
    "Ability Menu Open": "Menu de habilidades aberto",
    "Scoreboard Open": "Placar aberto",
    "Play current announcer voice and volume.": "Reproduza a voz e o volume do locutor atual.",
    "Play current announcer voice.": "Reproduzir a voz do locutor atual.",
    "First Spawns": "Primeiras desovas",
    "Buff Reminder": "Lembrete de b\u00f4nus",
    "Seconds Before Spawn": "Segundos antes do nascimento",
    "Ding to Check Minimap": "Ding para verificar o minimapa",
    "In Seconds": "Em segundos",
    "Open random game when dead": "Abra o jogo aleat\u00f3rio quando estiver morto",
    "Wraithjack": "Wraithjack",
    "Buff Filter": "Filtro de b\u00f4nus",
    "click here": "Clique aqui",
    "Click Radius": "Clique em Raio",
    "Current Size": "Tamanho atual",
    "Enable Clean Stacks": "Habilitar pilhas limpas",
    "Hero Icon Size": "Tamanho do \u00edcone do her\u00f3i",
    "Icon Shrink": "Encolher \u00edcone",
    "Improved Hint": "Dica melhorada",
    "Lane with Party": "Pista com Festa",
    "Minimalist Opacity": "Opacidade minimalista",
    "Nicknames": "Apelidos",
    "Player Icon Size": "Tamanho do \u00edcone do jogador",
    "Refresh Rate": "Taxa de atualiza\u00e7\u00e3o",
    "Show FPS": "Mostrar FPS",
    "Show Frame": "Mostrar quadro",
    "Show Memory": "Mostrar mem\u00f3ria",
    "Show Position": "Mostrar posi\u00e7\u00e3o",
    "Show Tick": "Mostrar marca",
    "Shrink Distance": "Diminuir dist\u00e2ncia",
    "Total Size": "Tamanho total",
    "Ult Indicator": "Indicador Ult",
    "Zip Thickness": "Espessura do z\u00edper",
    "Depending on complexity and work involved, contact me on": "Dependendo da complexidade e do trabalho envolvido, entre em contato comigo pelo telefone",
    "If you encounter issues, need help, or have any feedback join the Discord.": "Se voc\u00ea encontrar problemas, precisar de ajuda ou tiver algum coment\u00e1rio, junte-se ao Discord.",
    "Reset section runtime options": "Redefinir op\u00e7\u00f5es de tempo de execu\u00e7\u00e3o da se\u00e7\u00e3o",
    "Reset section to defaults": "Redefinir se\u00e7\u00e3o para os padr\u00f5es",
    "DO NOT PRESS ANY KEYS UNTIL COMPLETE UNLESS PROMPTED": "N\u00c3O PRESSIONE NENHUMA TECLA AT\u00c9 CONCLUIR, A MENOS QUE SOLICITADO",
    "If saving stalls, open your shop.": "Se estiver salvando barracas, abra sua loja.",
    "Play Sound": "Reproduzir som",
    "1st": "1\u00ba",
    "2nd": "2\u00ba",
    "3rd": "3\u00ba",
    "Size of your current ammo.": "Tamanho da sua muni\u00e7\u00e3o atual.",
    "Size of your total ammo.": "Tamanho da sua muni\u00e7\u00e3o total.",
    "Cleans up the styling of reticle hints.": "Limpa o estilo das dicas do ret\u00edculo.",
    "Automatically selects Lane Preference: With Party for matchmaking.": "Seleciona automaticamente Prefer\u00eancia de pista: Com grupo para matchmaking.",
    "Shows nicknames of all players in the game within the top bar.": "Mostra os apelidos de todos os jogadores do jogo na barra superior.",
    "Show the ultimate indicator for V1 healthbars.": "Mostre o indicador final para barras de sa\u00fade V1.",
    "Colored enemy healthbar warnings when at significant thresholds.": "Avisos coloridos da barra de sa\u00fade do inimigo quando em limites significativos.",
    "Enemy healthbar enhancements.": "Melhorias na barra de sa\u00fade do inimigo.",
    "Opacity of the background of Minimalist Minimap.": "Opacidade do fundo do Minimapa Minimalista.",
    "The click hitbox of your pings or clicks, this can help make pings more accurate.": "A hitbox de cliques de seus pings ou cliques pode ajudar a tornar os pings mais precisos.",
    "How much icons will shrink when overlapping with others.": "Quanto os \u00edcones diminuir\u00e3o ao se sobreporem a outros.",
    "The size of other players on the minimap.": "O tamanho dos outros jogadores no minimapa.",
    "The size of yourself on the minimap.": "O seu tamanho no minimapa.",
    "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.": "O limite de dist\u00e2ncia no qual os \u00edcones come\u00e7ar\u00e3o a diminuir. Quanto mais baixas s\u00e3o as posi\u00e7\u00f5es mais precisas, mais altas s\u00e3o as visibilidades mais f\u00e1ceis.",
    "The thickness of the Zipline lines across the map.": "A espessura das linhas Zipline no mapa.",
    "How fast the minimap refreshes.": "A rapidez com que o minimapa \u00e9 atualizado.",
    "RAM and GPU Memory real time usage statistics.": "Estat\u00edsticas de uso de mem\u00f3ria RAM e GPU em tempo real.",
    "Position and Velocity real time statistics.": "Estat\u00edsticas de posi\u00e7\u00e3o e velocidade em tempo real.",
    "Shows real time tick information, mostly useless.": "Mostra informa\u00e7\u00f5es de ticks em tempo real, em sua maioria in\u00fateis.",
    "Shows raw FPS count.": "Mostra a contagem bruta de FPS.",
    "Shows current frame count, mostly useless.": "Mostra a contagem de quadros atual, quase sempre in\u00fatil.",
    "The hero you automatically switch to on launch or after saving..": "O her\u00f3i para o qual voc\u00ea muda automaticamente ao iniciar ou ap\u00f3s salvar.",
    "Toggle the hitmarkers when attacking enemies.": "Alterne os marcadores de acerto ao atacar inimigos.",
    "Choose which bridge buff sound variants can play.": "Escolha quais variantes de som de buff de ponte podem ser reproduzidas.",
    "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.": "Quais eventos fazem com que um som seja reproduzido. Os acampamentos s\u00e3o \u00fanicos, o Buff \u00e9 a cada 5 minutos.",
    "FPS Impact:": "Impacto FPS:",
    "Created By:": "Criado por:",
    "Author:": "Autor:",
    "Voice Actor:": "Ator de voz:",
    "None": "Nenhum",
    "Low": "Baixo",
    "Medium": "M\u00e9dio",
    "High": "Alto",
    "Adjust horizontal position of the player healthbar.": "Ajuste a posi\u00e7\u00e3o horizontal da barra de sa\u00fade do jogador.",
    "Adjust opacity of the player healthbar.": "Ajuste a opacidade da barra de sa\u00fade do jogador.",
    "Adjust size of the player healthbar.": "Ajuste o tamanho da barra de sa\u00fade do jogador.",
    "Adjust vertical position of the player healthbar.": "Ajuste a posi\u00e7\u00e3o vertical da barra de sa\u00fade do jogador.",
    "An always visible zipline boost overlay.": "Uma sobreposi\u00e7\u00e3o de tirolesa sempre vis\u00edvel.",
    "Centers ESC menu elements to make them easier to access.": "Centraliza os elementos do menu ESC para torn\u00e1-los mais f\u00e1ceis de acessar.",
    "Centers friends list area in ESC menu.": "Centraliza a \u00e1rea da lista de amigos no menu ESC.",
    "Adds a STAT button on profile rows that opens Statlocker for that account.": "Adiciona um bot\u00e3o STAT nas linhas do perfil que abre o Statlocker para essa conta.",
    "Cleans up visuals of abilities significantly to reduce clutter.": "Limpa significativamente o visual das habilidades para reduzir a desordem.",
    "Cleans up visuals of the item bar significantly to reduce clutter.": "Limpa significativamente o visual da barra de itens para reduzir a confus\u00e3o.",
    "Cleans up visuals of the minimap significantly to reduce clutter.": "Limpa significativamente o visual do minimapa para reduzir a confus\u00e3o.",
    "Cleans up visuals of the shop menu significantly to reduce clutter.": "Limpa significativamente o visual do menu da loja para reduzir a desordem.",
    "Colored healthbar warnings when at significant thresholds.": "Avisos coloridos da barra de sa\u00fade quando em limites significativos.",
    "Current ammo inside of your magazine.": "Muni\u00e7\u00e3o atual dentro da sua revista.",
    "Customize the styling of damage numbers.": "Personalize o estilo dos n\u00fameros de danos.",
    "Customize the visuals of the incoming damage panel.": "Personalize o visual do painel de danos recebidos.",
    "Customize unsecured souls visuals.": "Personalize o visual das almas inseguras.",
    "Customize visibility of target reticle when abilities or items visually show on allies and enemies.": "Personalize a visibilidade do ret\u00edculo alvo quando habilidades ou itens aparecerem visualmente em aliados e inimigos.",
    "Customized healthbars for better visibility or flair.": "Barras de sa\u00fade personalizadas para melhor visibilidade ou talento.",
    "Decide what style of item to display the cooldown of.": "Decida qual estilo de item exibir o tempo de espera.",
    "Draws the minimap over all other UI elements for improved visibility.": "Desenha o minimapa sobre todos os outros elementos da IU para melhorar a visibilidade.",
    "Forcibly hides testing tools at all times.": "Oculta \u00e0 for\u00e7a as ferramentas de teste em todos os momentos.",
    "Forcibly shows testing tools at all times.": "Mostra \u00e0 for\u00e7a ferramentas de teste em todos os momentos.",
    "Greys out heros in the top bar when missing on the map.": "Desaparece os her\u00f3is na barra superior quando faltam no mapa.",
    "Highlighted abilities showing you what you should upgrade depending on build.": "Habilidades destacadas mostrando o que voc\u00ea deve atualizar dependendo da constru\u00e7\u00e3o.",
    "Improve Ability Stacks": "Melhore as pilhas de habilidades",
    "Makes the minimap rotate with player view, this is just for fun.": "Faz o minimapa girar com a visualiza\u00e7\u00e3o do jogador, isso \u00e9 apenas para divers\u00e3o.",
    "Menu when you receive a punishment for breaking game rules.": "Menu quando voc\u00ea recebe uma puni\u00e7\u00e3o por quebrar as regras do jogo.",
    "Only download the filter file of the filter you want, nothing else.": "Baixe apenas o arquivo de filtro do filtro desejado, nada mais.",
    "Play an audio reminder to remember to look at the minimap.": "Reproduza um lembrete de \u00e1udio para lembrar de olhar o minimapa.",
    "Ragnarok Online damage visuals with improved fancy styling.": "Ragnarok Online causa danos visuais com estilo sofisticado aprimorado.",
    "Real time key input visual.": "Visual de entrada de teclas em tempo real.",
    "See your view angle and speed.": "Veja seu \u00e2ngulo de vis\u00e3o e velocidade.",
    "Shifts the HUD for better visual support for 16:10 resolutions.": "Muda o HUD para melhor suporte visual para resolu\u00e7\u00f5es 16:10.",
    "Shifts the HUD for better visual support for 4:3 resolutions.": "Muda o HUD para melhor suporte visual para resolu\u00e7\u00f5es 4:3.",
    "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.": "Mostra um indicador visual na barra superior dos Guardi\u00f5es, Caminhantes e Base atuais.",
    "Show if you are in combat or not.": "Mostre se voc\u00ea est\u00e1 em combate ou n\u00e3o.",
    "Show player ultimate indicators on V1 healthbars.": "Mostre os indicadores finais do jogador nas barras de sa\u00fade V1.",
    "Show the estimated time for unsecured souls to dissapear.": "Mostre o tempo estimado para que as almas inseguras desapare\u00e7am.",
    "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.": "Mostra um indicador visual no minimapa de quando os Bridge Buffs ir\u00e3o aparecer.",
    "Shows a visual indicator in the minimap of when Mid Boss will spawn.": "Mostra um indicador visual no minimapa de quando Mid Boss ir\u00e1 aparecer.",
    "Changes urn color to know which side is favored, green for your team, red for the enemy.": "Muda a cor da urna para saber qual lado \u00e9 o favorito, verde para o seu time, vermelho para o inimigo.",
    "Shows a visual indicator in the top bar of the percentage difference of souls between teams.": "Mostra um indicador visual na barra superior da diferen\u00e7a percentual de almas entre as equipes.",
    "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.": "Mostra um indicador visual na barra superior de quando os Bridge Buffs ir\u00e3o aparecer.",
    "Shows a visual indicator in the top bar of when Mid Boss will spawn.": "Mostra um indicador visual na barra superior de quando Mid Boss ir\u00e1 aparecer.",
    "Shows all of your keybinds.": "Mostra todos os seus atalhos de teclado.",
    "Shows all of your player stats within the shop menu.": "Mostra todas as estat\u00edsticas do seu jogador no menu da loja.",
    "Shows item cooldowns near crosshair for easier readability.": "Mostra o tempo de espera dos itens perto da mira para facilitar a leitura.",
    "Shows the individual player souls per minute on scoreboard and the team in the top bar.": "Mostra as almas individuais dos jogadores por minuto no placar e o time na barra superior.",
    "Shows the individual player's objective damage in the top bar.": "Mostra o dano objetivo do jogador individual na barra superior.",
    "Shows the individual player's unspent souls in the top bar.": "Mostra as almas n\u00e3o gastas de cada jogador na barra superior.",
    "Shows your character in the shop menu.": "Mostra seu personagem no menu da loja.",
    "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).": "Melhora significativamente a visibilidade do ret\u00edculo alvo e destaque para intervalos de execu\u00e7\u00e3o (Shiv).",
    "Simplifies the Compass overlay to its bare elements.": "Simplifica a sobreposi\u00e7\u00e3o da B\u00fassola para seus elementos simples.",
    "Slight adjustments to the HUD for better streaming output.": "Pequenos ajustes no HUD para melhor sa\u00edda de streaming.",
    "Speed number tracker.": "Rastreador de n\u00famero de velocidade.",
    "Stretch the compass horizontally.": "Estique a b\u00fassola horizontalmente.",
    "Stretch the compass vertically.": "Estique a b\u00fassola verticalmente.",
    "The circle countdown for when you are reloading.": "A contagem regressiva do c\u00edrculo para quando voc\u00ea estiver recarregando.",
    "The cosmetic ability on your default 5 key, like posters and snowballs.": "A habilidade cosm\u00e9tica em sua tecla 5 padr\u00e3o, como p\u00f4steres e bolas de neve.",
    "The damage dealt to Trooper minions.": "O dano causado aos lacaios Trooper.",
    "The icon that replaces your crosshair when reloading.": "O \u00edcone que substitui a mira ao recarregar.",
    "The interval in which the sound plays in seconds.": "O intervalo em que o som \u00e9 reproduzido em segundos.",
    "The item buying auto queue system in the shop menu.": "O sistema de fila autom\u00e1tica de compra de itens no menu da loja.",
    "The large cumulative damage number.": "O grande n\u00famero de danos cumulativos.",
    "The popup signifying you are too low on stamina to cast another movement input.": "O pop-up significa que voc\u00ea est\u00e1 com pouca resist\u00eancia para lan\u00e7ar outra entrada de movimento.",
    "The small incremental damage numbers.": "Os pequenos n\u00fameros de dano incremental.",
    "The small visual icon.": "O pequeno \u00edcone visual.",
    "The unsecured text.": "O texto n\u00e3o seguro.",
    "The world background blur effect behind the shop menu.": "O efeito de desfoque de fundo do mundo atr\u00e1s do menu da loja.",
    "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.": "Esta \u00e9 uma vers\u00e3o leve com melhorias significativas de FPS, mas requer um arquivo separado para filtros.",
    "Time before the announcement happens in seconds.": "Tempo antes do an\u00fancio acontecer em segundos.",
    "Total ammo amount.": "Quantidade total de muni\u00e7\u00e3o.",
    "View a cooldown timer for reloading time.": "Veja um temporizador de resfriamento para recarregar o tempo.",
    "View an enhanced minimap on opening ability menu.": "Veja um minimapa aprimorado ao abrir o menu de habilidades.",
    "View an enhanced minimap on opening scoreboard menu.": "Veja um minimapa aprimorado ao abrir o menu do placar.",
    "View the cooldown time of player ultimates.": "Veja o tempo de espera dos ultimates do jogador.",
    "Visual indicator of your current ammo.": "Indicador visual da sua muni\u00e7\u00e3o atual.",
    "You can download custom announcer packs, just download the correct one for the slot you want to replace.": "Voc\u00ea pode baixar pacotes de locutores personalizados, basta baixar o correto para o slot que deseja substituir.",
    "COPY": "COPY",
    "COPIED": "COPIED",
    "FAILED": "FAILED",
    "SAVE": "SAVE",
    "HIDEOUT": "HIDEOUT",
    "QUEUED": "QUEUED",
    "APPLY": "APPLY",
    "APPLIED": "APPLIED",
    "AIRHEART": "AIRHEART",
    "SAVING": "SAVING",
    "VERIFY": "VERIFY",
    "SAVED": "SAVED",
    "TIMEOUT": "TIMEOUT",
    "CLEAR": "CLEAR",
    "CLEARING": "CLEARING",
    "CLEARED": "CLEARED",
    "Statistics": "Estat\u00edsticas",
    "Combat Status": "Status de Combate",
    "Easy": "F\u00e1cil",
    "Hard": "Duro",
    "SUPPORT THE MOD": "SUPPORT THE MOD",
    "CHANGE LOG": "CHANGE LOG",
    "Play Sound": "Reproduzir som",
    "Fighting Game": "Jogo de luta",
    "Open shop to continue save.": "Abra a loja para continuar economizando.",
    "Switching to Airheart...": "Mudando para Airheart...",
    "Writing settings string to build...": "Escrevendo string de configura\u00e7\u00f5es para construir...",
    "Save in progress...": "Salvar em andamento...",
    "Save timed out. Try again.": "Salvar expirou. Tente novamente.",
    "Save completed.": "Salvamento conclu\u00eddo.",
    "Save failed.": "Falha ao salvar.",
    "Save works only in hideout.": "Salvar funciona apenas no esconderijo.",
    "Failed to queue save request.": "Falha ao colocar a solicita\u00e7\u00e3o de salvamento na fila.",
    "Save queued.": "Salvar na fila.",
    "Open shop to continue clear.": "Abra a loja para continuar limpo.",
    "Confirming Airheart for clear...": "Confirmando Airheart para limpar...",
    "Clearing builds...": "Limpando compila\u00e7\u00f5es...",
    "Clear in progress...": "Limpeza em andamento...",
    "Clear timed out. Try again.": "A limpeza expirou. Tente novamente.",
    "Clear completed.": "Limpeza conclu\u00edda.",
    "Clear failed.": "Falha ao limpar.",
    "en": "pt",
    "Section already at defaults.": "Se\u00e7\u00e3o j\u00e1 est\u00e1 nos padr\u00f5es.",
    "Ready.": "Preparar.",
    "Share or save your settings configuration!": "Compartilhe ou salve suas configura\u00e7\u00f5es!",
    "Local settings loaded.": "Configura\u00e7\u00f5es locais carregadas.",
    "Export string copied.": "String de exporta\u00e7\u00e3o copiada.",
    "Clipboard copy failed.": "Falha na c\u00f3pia da \u00e1rea de transfer\u00eancia.",
    "Airheart switch sent.": "Interruptor Airheart enviado.",
    "Failed to switch hero.": "Falha ao trocar de her\u00f3i.",
    "Strings may sometimes break between mod versions.": "\u00c0s vezes, as strings podem quebrar entre as vers\u00f5es do mod.",
    "Import: parsing string...": "Importar: analisando string...",
    "Import: applying settings...": "Importar: aplicando configura\u00e7\u00f5es...",
    "Import: refreshing UI...": "Importar: atualizando a IU...",
    "Import failed.": "Falha na importa\u00e7\u00e3o.",
    "Invalid import string.": "String de importa\u00e7\u00e3o inv\u00e1lida.",
    "Row already at defaults.": "Linha j\u00e1 est\u00e1 nos padr\u00f5es.",
    "Preset apply failed.": "Falha na aplica\u00e7\u00e3o da predefini\u00e7\u00e3o.",
    "Scales the element.": "Dimensiona o elemento.",
    "Changes the element's transparency.": "Altera a transpar\u00eancia do elemento.",
    "Moves the element horizontally.": "Move o elemento horizontalmente.",
    "Moves the element vertically.": "Move o elemento verticalmente.",
    "Reset to default value": "Redefinir para o valor padr\u00e3o",
    "Reset row to defaults": "Redefinir linha para os padr\u00f5es",
    "Randomly opens an enabled arcade game while dead.": "Abre aleatoriamente um jogo de arcade habilitado enquanto estiver morto.",
    "Fountain-style damage number animation.": "Anima\u00e7\u00e3o do n\u00famero de danos no estilo fonte.",
    "Russian": "Russian",
    "Chinese": "Chinese",
    "Troubleshoot": "Solucionar problemas",
    "Klutz's Bar": "Bar do Klutz",
    "Budhud": "Budhud",
    "Blackjack": "Wraithjack",
    "Settings Changes": "Altera\u00e7\u00f5es nas configura\u00e7\u00f5es",
    "Changes: ": "Mudan\u00e7as: ",
    "Changes:": "Mudan\u00e7as:",
    "Confirm": "Confirmar",
    "Cancel": "Cancelar",
    "Play Sound ": "Reproduzir som ",
    "The displayed language of the settings menu.": "O idioma exibido no menu de configura\u00e7\u00f5es.",
    "Preview realtime changes to settings when modifying them.": "Visualize altera\u00e7\u00f5es em tempo real nas configura\u00e7\u00f5es ao modific\u00e1-las.",
    "Restores the legacy removed duration bars for abilities.": "Restaura as barras de dura\u00e7\u00e3o removidas do legado para habilidades.",
    "Centers the friends list area within the ESC menu.": "Centraliza a \u00e1rea da lista de amigos no menu ESC.",
    "Enhanced V2 enemy healthbar visuals and readability.": "Visual e legibilidade aprimorados da barra de sa\u00fade do inimigo V2.",
    "Show the UnitInfo panel on V2 enemy healthbars.": "Mostre o painel UnitInfo nas barras de sa\u00fade inimigas V2.",
    "Show level text on V2 enemy healthbars.": "Mostrar texto de n\u00edvel nas barras de sa\u00fade inimigas V2.",
    "V2 enemy healthbar enhancements.": "Melhorias na barra de sa\u00fade do inimigo V2.",
    "Welcome to QOL Lock": "Bem-vindo ao QOL Lock",
    "BR Portuguese": "Portugu\u00eas do Brasil",
    "Portuguese": "Portugu\u00eas",
};

const SETTINGS_PT_BR_TEXT = {
    "Config": "Configura\u00e7\u00f5es",
    "Presets": "Predefini\u00e7\u00f5es",
    "Crosshair": "Mira",
    "HUD": "HUD",
    "UI": "UI",
    "Overlay": "Sobreposi\u00e7\u00e3o",
    "Minimap": "Minimapa",
    "Audio": "\u00c1udio",
    "Console": "Console",
    "General": "Geral",
    "Discord": "Discord",
    "Support": "Apoiar",
    "Meta Settings": "Metaconfigura\u00e7\u00f5es",
    "Preview": "Pr\u00e9-visualiza\u00e7\u00e3o",
    "Drag": "Arrastar",
    "Language": "Linguagem",
    "Default Hero": "Her\u00f3i padr\u00e3o",
    "English": "English",
    "French": "French",
    "Settings UI Language": "Idioma da UI de configura\u00e7\u00f5es",
    "Hero on Load or Save": "Her\u00f3i ao carregar ou salvar",
    "Realtime Settings Changes": "Altera\u00e7\u00f5es nas configura\u00e7\u00f5es em tempo real",
    "Realtime Changes": "Mudan\u00e7as em tempo real",
    "Draggable UI": "IU arrast\u00e1vel",
    "Enable": "Habilitar",
    "Export Settings": "Exportar configura\u00e7\u00f5es",
    "Import Settings": "Importar configura\u00e7\u00f5es",
    "Export String": "Exportar sequ\u00eancia",
    "Import String": "Importar sequ\u00eancia",
    "How to Save Settings": "Como salvar configura\u00e7\u00f5es",
    "Share your settings string": "Compartilhe sua sequ\u00eancia de configura\u00e7\u00f5es",
    "Paste and apply an exported settings string": "Cole e aplique uma sequ\u00eancia de configura\u00e7\u00f5es exportada",
    "Search Results": "Resultados da pesquisa",
    "No results found": "Nenhum resultado encontrado",
    "Better Item Cooldowns": "Melhores Cooldowns",
    "Item Cooldowns": "Cooldowns de itens",
    "Tracked cooldowns near crosshair": "Cooldowns perto da mira",
    "Light Item Cooldowns": "Recargas de itens leve",
    "Advanced Mode": "Modo avan\u00e7ado",
    "Optimize Filters": "Otimizar filtros",
    "No filter settings but better FPS.": "Sem configura\u00e7\u00f5es de filtro, mas melhor FPS.",
    "Filters": "Filtros",
    "Get Filter File Only": "Obter apenas arquivo de filtro",
    "Download": "Download",
    "Advanced Filter": "Filtro avan\u00e7ado",
    "Defensive Passive": "Passivo Defensivo",
    "Offensive Passive": "Passivo Ofensivo",
    "Defensive Active": "Ativo Defensivo",
    "Offensive Active": "Ofensiva Ativa",
    "Damage Numbers": "N\u00fameros de danos",
    "Ammo": "Muni\u00e7\u00e3o",
    "Reload Cooldown": "Tempo de recarga da arma",
    "Reloading": "Recarregando",
    "Item Target Reticle": "Ret\u00edculo alvo do item",
    "Top Bar Plus": "Top Bar Plus",
    "Top Bar": "Barra superior",
    "Shop": "Loja",
    "HUD Controls": "Controles do HUD",
    "UI Controls": "Controles de UI",
    "Chat": "Bate-papo",
    "Legacy Durations": "Dura\u00e7\u00f5es legado",
    "Healthbar": "Barra de sa\u00fade",
    "Player": "Jogador",
    "Bottom Bar": "Barra inferior",
    "Simplify": "Simplificar",
    "Zipline Boost": "Impulso de tirolesa",
    "Souls Timer": "Temporizador de almas",
    "Unsecured Souls Timer": "Temporizador de almas inseguras",
    "Unsecured Timer": "Temporizador inseguro",
    "Better Unsecured": "Better Unsecured",
    "Better Unsecured Souls": "Almas Inseguras Melhoradas",
    "Unsecured Plus": "Unsecured Plus",
    "Keyboard": "Teclado",
    "Compass": "B\u00fassola",
    "Ult Cooldowns": "Cooldowns da Suprema",
    "Alt Zoom": "Alt Zoom",
    "Tab Zoom": "Tab Zoom",
    "Announcer": "Locutor",
    "Arcade": "Fliperama",
    "Game Settings": "Configura\u00e7\u00f5es do jogo",
    "Games": "Jogos",
    "Game Audio": "\u00c1udio do jogo",
    "Difficulty": "Dificuldade",
    "Supporting and Feature Requests": "Solicita\u00e7\u00f5es de suporte e recursos",
    "Issues, Feedback and Ideas": "Problemas, coment\u00e1rios e ideias",
    "Contact": "Contato",
    "Special Thanks": "Agradecimentos especiais",
    "Size": "Tamanho",
    "Opacity": "Opacidade",
    "Scale": "Escala",
    "Horizontal Offset": "Deslocamento Horizontal",
    "Vertical Offset": "Deslocamento vertical",
    "Horizontal Stretch": "Alongamento horizontal",
    "Vertical Stretch": "Alongamento Vertical",
    "Visual": "Visual",
    "Hide All": "Ocultar tudo",
    "Current": "Atual",
    "Total": "Total",
    "Icon": "\u00cdcone",
    "Circle": "C\u00edrculo",
    "Big Number": "Grande n\u00famero",
    "Big Numbers": "Grandes n\u00fameros",
    "Damage Fountain": "Dano estilo Fonte",
    "Small Numbers": "N\u00fameros Pequenos",
    "Trooper Damage": "Danos ao soldado",
    "Hide Current": "Ocultar atual",
    "Hide Total": "Ocultar total",
    "Hide Icon": "Ocultar \u00edcone",
    "Hide Circle": "Ocultar C\u00edrculo",
    "Hide Big Number": "Ocultar grande n\u00famero",
    "Hide Small Numbers": "Ocultar n\u00fameros pequenos",
    "Hide Trooper Damage": "Ocultar dano do soldado",
    "Highlight Mode": "Modo de destaque",
    "Big Red": "Grande Vermelho",
    "Unspent Souls": "Almas n\u00e3o gastas",
    "Souls Per Minute": "Almas por minuto",
    "Objective Damage": "Dano Objetivo",
    "Objective Map": "Mapa do Objetivo",
    "Urn Difference": "Diferen\u00e7a de Urna",
    "Buff Timer": "Temporizador de Buff",
    "Bridge Buff Timer": "Temporizador de Buff de Ponte",
    "Mid Boss Timer": "Temporizador do Mid Boss",
    "Missing Hero Opaque": "Her\u00f3i desaparecido opaco",
    "Display Stats": "Exibir estat\u00edsticas",
    "Display Hero": "Exibir Her\u00f3i",
    "Simplify Shop": "Loja Simplificada",
    "Stats": "Estat\u00edsticas",
    "Hero": "Her\u00f3i",
    "Minimalist": "Minimalista",
    "Blur": "Borr\u00e3o",
    "Quick Buy": "Compra r\u00e1pida",
    "Hide Blur": "Ocultar desfoque",
    "Hide Quick Buy": "Ocultar compra r\u00e1pida",
    "16:10 Support": "16:10 Suporte",
    "4:3 Support": "4:3 Suporte",
    "21:9 Stream Fix": "Corre\u00e7\u00e3o 21:9",
    "Centered ESC Menu": "Menu ESC centralizado",
    "Centered Friends List": "Lista de amigos centralizada",
    "Statlocker": "Statlocker",
    "Force Testing Tools": "For\u00e7ar Ferramentas de Teste",
    "Show Testing Tools": "Mostrar Ferramentas de Teste",
    "Hide Testing Tools": "Ocultar Ferramentas de Teste",
    "Behavior Summary": "Resumo de comportamento",
    "Failed Hint": "Dica de falha",
    "Ability Suggestion": "Sugest\u00e3o de habilidade",
    "Cosmetic Ability": "Habilidade cosm\u00e9tica",
    "Hide Behavior Summary": "Ocultar resumo de comportamento",
    "Hide Failed Hint": "Ocultar dica de falha",
    "Hide Ability Suggestion": "Ocultar sugest\u00e3o de habilidade",
    "Hide Cosmetic Ability": "Ocultar habilidade cosm\u00e9tica",
    "Damage Report": "Relat\u00f3rio de danos",
    "Adjust the in-game chat position and scale.": "Ajuste a posi\u00e7\u00e3o e a escala do bate-papo no jogo.",
    "Adjust size of the in-game chat.": "Ajuste o tamanho do bate-papo do jogo.",
    "Adjust horizontal position of the in-game chat.": "Ajuste a posi\u00e7\u00e3o horizontal do bate-papo do jogo.",
    "Adjust vertical position of the in-game chat.": "Ajuste a posi\u00e7\u00e3o vertical do bate-papo do jogo.",
    "Show the in-game chat panel.": "Mostre o painel de bate-papo do jogo.",
    "Hide Damage Report": "Ocultar relat\u00f3rio de danos",
    "Colored Healthbar": "Barra de sa\u00fade colorida",
    "Colored Health": "Sa\u00fade Colorida",
    "Color Warning": "Aviso de colorido",
    "Enemy": "Inimigo",
    "Minimalist Healthbar": "Barra de sa\u00fade minimalista",
    "Simplify Ability Icons": "Simplifique os \u00edcones de habilidade",
    "Simplify Items": "Simplifique os itens",
    "Minimalist Abilities": "Habilidades minimalistas",
    "Minimalist Item Bar": "Barra de itens minimalista",
    "Show Icon": "Mostrar \u00edcone",
    "Show Text": "Mostrar texto",
    "Text": "Texto",
    "Full Keybinds": "Atalhos de teclado completos",
    "Full Keys": "Chaves completas",
    "Show Speed": "Mostrar velocidade",
    "Speed": "Velocidade",
    "Minimalist Minimap": "Minimapa minimalista",
    "Spinny Map": "Mapa girat\u00f3rio",
    "Spinny Mode": "Modo girat\u00f3rio",
    "Urn Colors": "Cores da urna",
    "Draw Over UI": "Desenhar sobre a UI",
    "Neutral Camps": "Acampamentos Neutros",
    "Type": "Tipo",
    "Bridge Buffs": "Buff da ponte",
    "Bridge Buff": "Buff da ponte",
    "Buff": "Buff",
    "Bridge Buff Delay": "Atraso de Buff da Ponte",
    "Buff Delay": "Atraso de Buff",
    "Tier 1": "N\u00edvel 1",
    "Tier 2": "N\u00edvel 2",
    "Tier 3": "N\u00edvel 3",
    "Voice": "Voz",
    "Custom": "Personalizado",
    "XQC": "XQC",
    "Asmon": "Asmon",
    "Beep": "Beep",
    "Volume": "Volume",
    "Quiet": "Quieto",
    "Normal": "Normal",
    "Loud": "Alto",
    "Preview Announcer": "Pr\u00e9-visualiza\u00e7\u00e3o de locutor",
    "Test Announcer": "Teste de Locutor",
    "Minimap Reminder": "Lembrete de minimapa",
    "Timer": "Temporizador",
    "On Death Games": "Jogos durante a morte",
    "On Death": "Durante a morte",
    "Bebop Sweeper": "Bebop Sweeper",
    "Flappy Bat": "Flappy Bat",
    "Graves Trainer": "Graves Trainer",
    "Whack a Rem": "Whack a Rem",
    "Zerggy Mania": "Zerggy Mania",
    "Hitmarkers": "Hitmarkers",
    "Off": "Desligado",
    "On": "Ligado",
    "Play": "Jogar",
    "Show Support": "Mostrar suporte",
    "Change Log": "Registro de altera\u00e7\u00f5es",
    "Contributors": "Colaboradores",
    "Open": "Abrir",
    "Support development": "Apoiar o desenvolvimento",
    "View updates": "Ver atualiza\u00e7\u00f5es",
    "Community acknowledgements": "Reconhecimentos da comunidade",
    "Open Config": "Abrir configura\u00e7\u00e3o",
    "You can support development by commissioning features or presets.": "Voc\u00ea pode apoiar o desenvolvimento comissionando recursos ou predefini\u00e7\u00f5es.",
    "Support development by commissioning features or presets.": "Apoie o desenvolvimento comissionando recursos ou predefini\u00e7\u00f5es.",
    "This is a way for me to give something back to the supporters.": "Esta \u00e9 uma forma de retribuir algo aos apoiadores.",
    "All commissioned additions are released publicly and available to everyone.": "Todas as adi\u00e7\u00f5es comissionadas s\u00e3o divulgadas publicamente e est\u00e3o dispon\u00edveis para todos.",
    "The mod is <font color=\"#66cc99\">fully functional</font> and <font color=\"#66cc99\">free</font> for all users.": "O mod \u00e9 <font color=\"#66cc99\">totalmente funcional</font> e <font color=\"#66cc99\">gratuito</font> para todos os usu\u00e1rios.",
    "Custom Preset Commission: <font color=\"#66cc99\">$25</font>": "Comiss\u00e3o predefinida personalizada: <font color=\"#66cc99\">$25</font>",
    "<font color=\"#66cc99\">Free</font> updates for new features, <font color=\"#66cc99\">$5</font> for arbitrary changes": "Atualiza\u00e7\u00f5es <font color=\"#66cc99\">gratuitas</font> para novos recursos, <font color=\"#66cc99\">$5</font> para altera\u00e7\u00f5es arbitr\u00e1rias",
    "Settings now load from your saved build string": "As configura\u00e7\u00f5es agora s\u00e3o carregadas a partir da string de compila\u00e7\u00e3o salva",
    "New Feature Commission: <font color=\"#66cc99\">$10</font> to <font color=\"#66cc99\">$100</font>": "Comiss\u00e3o de novos recursos: <font color=\"#66cc99\">$10</font> a <font color=\"#66cc99\">$100</font>",
    "Depending on complexity and work involved": "Dependendo da complexidade e do trabalho envolvido",
    "Discord: <font color=\"#66cc99\">civocivocivo</font>": "Discord: <font color=\"#66cc99\">civocivocivo</font>",
    "Without them QOL Lock would not be possible.": "Sem eles o QOL Lock n\u00e3o seria poss\u00edvel.",
    "If you encounter issues please join the Discord": "Se voc\u00ea encontrar problemas, entre no Discord",
    "I am open to all feedback, suggestions, and ideas!": "Estou aberto a todos os coment\u00e1rios, sugest\u00f5es e ideias!",
    "Default 18": "Padr\u00e3o 18",
    "Default 400": "Padr\u00e3o 400",
    "Hud Shift": "Mudan\u00e7a de Hud",
    "Easier Access": "Acesso mais f\u00e1cil",
    "Always Visible Override": "Substitui\u00e7\u00e3o sempre vis\u00edvel",
    "Always Shown": "Sempre mostrado",
    "Always Hidden": "Sempre oculto",
    "Metro Button": "Bot\u00e3o Metro",
    "Low Stamina Popup": "Pop-up de baixa stamina",
    "On Ability Upgrade": "Na melhoria de habilidade",
    "Snowball or Poster": "Bola de neve ou p\u00f4ster",
    "Recommended for 4:3": "Recomendado para 4:3",
    "HP Warning": "Aviso de Vida",
    "Enemy HP Warning": "Aviso de Vida inimigo",
    "Compact Layout": "Layout compacto",
    "Cleaner Skills": "Habilidades mais limpas",
    "Cleaner Items": "Itens mais limpos",
    "Always Visible Boost": "Impulso sempre vis\u00edvel",
    "Realtime Drain Countdown": "Contagem regressiva de drenagem em tempo real",
    "Mirror unsecured gold number": "Espelhar n\u00famero ouro inseguro",
    "Realtime Key Inputs": "Teclas em tempo real",
    "Angle and Speed": "\u00c2ngulo e Velocidade",
    "Estimated ult cooldowns under top-bar ult icons": "Cooldowns estimados de suprema nos \u00edcones de suprema da barra superior",
    "HIGH FPS IMPACT WARNING!": "AVISO DE IMPACTO DE FPS ALTO!",
    "Customizable Unsecured Souls": "Almas Inseguras Personaliz\u00e1veis",
    "Simplified Minimap": "Minimapa simplificado",
    "Ability Menu Open": "Menu de habilidades aberto",
    "Scoreboard Open": "Placar aberto",
    "Play current announcer voice and volume.": "Reproduza a voz e o volume do locutor atual.",
    "Play current announcer voice.": "Reproduzir a voz do locutor atual.",
    "First Spawns": "Primeiro Nascimento",
    "Buff Reminder": "Lembrete de Buff",
    "Seconds Before Spawn": "Segundos antes do nascimento",
    "Ding to Check Minimap": "Ding para verificar o minimapa",
    "In Seconds": "Em segundos",
    "Open random game when dead": "Abra o jogo aleat\u00f3rio quando estiver morto",
    "Wraithjack": "Wraithjack",
    "Buff Filter": "Filtro de Buff",
    "click here": "Clique aqui",
    "Click Radius": "Raio do click",
    "Current Size": "Tamanho atual",
    "Enable Clean Stacks": "Habilitar pilhas limpas",
    "Hero Icon Size": "Tamanho do \u00edcone do her\u00f3i",
    "Icon Shrink": "Encolher \u00edcone",
    "Improved Hint": "Dica melhorada",
    "Lane with Party": "Lane com grupo",
    "Minimalist Opacity": "Opacidade minimalista",
    "Nicknames": "Apelidos",
    "Player Icon Size": "Tamanho do \u00edcone do jogador",
    "Refresh Rate": "Taxa de atualiza\u00e7\u00e3o",
    "Show FPS": "Mostrar FPS",
    "Show Frame": "Mostrar quadro",
    "Show Memory": "Mostrar mem\u00f3ria",
    "Show Position": "Mostrar posi\u00e7\u00e3o",
    "Show Tick": "Mostrar marca",
    "Shrink Distance": "Diminuir dist\u00e2ncia",
    "Total Size": "Tamanho total",
    "Ult Indicator": "Indicador de suprema",
    "Zip Thickness": "Espessura da tirolesa",
    "Depending on complexity and work involved, contact me on": "Dependendo da complexidade e do trabalho envolvido, entre em contato comigo pelo telefone",
    "If you encounter issues, need help, or have any feedback join the Discord.": "Se voc\u00ea encontrar problemas, precisar de ajuda ou tiver algum coment\u00e1rio, junte-se ao Discord.",
    "Reset section runtime options": "Redefinir op\u00e7\u00f5es de tempo de execu\u00e7\u00e3o da se\u00e7\u00e3o",
    "Reset section to defaults": "Redefinir se\u00e7\u00e3o para os padr\u00f5es",
    "DO NOT PRESS ANY KEYS UNTIL COMPLETE UNLESS PROMPTED": "N\u00c3O PRESSIONE NENHUMA TECLA AT\u00c9 CONCLUIR, A MENOS QUE SOLICITADO",
    "If saving stalls, open your shop.": "Se o salvamento travar, abra a loja.",
    "Play Sound": "Reproduzir som",
    "1st": "1\u00ba",
    "2nd": "2\u00ba",
    "3rd": "3\u00ba",
    "Size of your current ammo.": "Tamanho da sua muni\u00e7\u00e3o atual.",
    "Size of your total ammo.": "Tamanho da sua muni\u00e7\u00e3o total.",
    "Cleans up the styling of reticle hints.": "Limpa o estilo das dicas do ret\u00edculo.",
    "Automatically selects Lane Preference: With Party for matchmaking.": "Seleciona automaticamente Prefer\u00eancia de lane: Com grupo para matchmaking.",
    "Shows nicknames of all players in the game within the top bar.": "Mostra os apelidos de todos os jogadores do jogo na barra superior.",
    "Show the ultimate indicator for V1 healthbars.": "Mostre o indicador de suprema para barras de sa\u00fade V1.",
    "Colored enemy healthbar warnings when at significant thresholds.": "Avisos coloridos da barra de sa\u00fade do inimigo quando em limites significativos.",
    "Enemy healthbar enhancements.": "Melhorias na barra de sa\u00fade do inimigo.",
    "Opacity of the background of Minimalist Minimap.": "Opacidade do fundo do Minimapa Minimalista.",
    "The click hitbox of your pings or clicks, this can help make pings more accurate.": "A hitbox de cliques de seus pings ou cliques pode ajudar a tornar os pings mais precisos.",
    "How much icons will shrink when overlapping with others.": "Quanto os \u00edcones diminuir\u00e3o ao se sobreporem a outros.",
    "The size of other players on the minimap.": "O tamanho dos outros jogadores no minimapa.",
    "The size of yourself on the minimap.": "O seu tamanho no minimapa.",
    "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.": "O limite de dist\u00e2ncia no qual os \u00edcones come\u00e7ar\u00e3o a diminuir. Quanto mais baixas s\u00e3o as posi\u00e7\u00f5es mais precisas, mais altas s\u00e3o as visibilidades mais f\u00e1ceis.",
    "The thickness of the Zipline lines across the map.": "A espessura das Tirolesas no mapa.",
    "How fast the minimap refreshes.": "A rapidez com que o minimapa \u00e9 atualizado.",
    "RAM and GPU Memory real time usage statistics.": "Estat\u00edsticas de uso de mem\u00f3ria RAM e GPU em tempo real.",
    "Position and Velocity real time statistics.": "Estat\u00edsticas de posi\u00e7\u00e3o e velocidade em tempo real.",
    "Shows real time tick information, mostly useless.": "Mostra informa\u00e7\u00f5es de ticks em tempo real, em sua maioria in\u00fateis.",
    "Shows raw FPS count.": "Mostra a contagem bruta de FPS.",
    "Shows current frame count, mostly useless.": "Mostra a contagem de quadros atual, quase sempre in\u00fatil.",
    "The hero you automatically switch to on launch or after saving..": "O her\u00f3i para o qual voc\u00ea muda automaticamente ao iniciar ou ap\u00f3s salvar.",
    "Toggle the hitmarkers when attacking enemies.": "Alterne os marcadores de acerto ao atacar inimigos.",
    "Choose which bridge buff sound variants can play.": "Escolha quais variantes de som de buff de ponte podem ser reproduzidas.",
    "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.": "Quais eventos fazem com que um som seja reproduzido. Os acampamentos s\u00e3o \u00fanicos, o Buff \u00e9 a cada 5 minutos.",
    "FPS Impact:": "Impacto no FPS:",
    "Created By:": "Criado por:",
    "Author:": "Autor:",
    "Voice Actor:": "Ator de voz:",
    "None": "Nenhum",
    "Low": "Baixo",
    "Medium": "M\u00e9dio",
    "High": "Alto",
    "Adjust horizontal position of the player healthbar.": "Ajuste a posi\u00e7\u00e3o horizontal da barra de sa\u00fade do jogador.",
    "Adjust opacity of the player healthbar.": "Ajuste a opacidade da barra de sa\u00fade do jogador.",
    "Adjust size of the player healthbar.": "Ajuste o tamanho da barra de sa\u00fade do jogador.",
    "Adjust vertical position of the player healthbar.": "Ajuste a posi\u00e7\u00e3o vertical da barra de sa\u00fade do jogador.",
    "An always visible zipline boost overlay.": "Uma sobreposi\u00e7\u00e3o de tirolesa sempre vis\u00edvel.",
    "Centers ESC menu elements to make them easier to access.": "Centraliza os elementos do menu ESC para torn\u00e1-los mais f\u00e1ceis de acessar.",
    "Centers friends list area in ESC menu.": "Centraliza a \u00e1rea da lista de amigos no menu ESC.",
    "Adds a STAT button on profile rows that opens Statlocker for that account.": "Adiciona um bot\u00e3o STAT nas linhas do perfil que abre o Statlocker para essa conta.",
    "Cleans up visuals of abilities significantly to reduce clutter.": "Limpa significativamente o visual das habilidades para reduzir a confus\u00e3o.",
    "Cleans up visuals of the item bar significantly to reduce clutter.": "Limpa significativamente o visual da barra de itens para reduzir a confus\u00e3o.",
    "Cleans up visuals of the minimap significantly to reduce clutter.": "Limpa significativamente o visual do minimapa para reduzir a confus\u00e3o.",
    "Cleans up visuals of the shop menu significantly to reduce clutter.": "Limpa significativamente o visual do menu da loja para reduzir a confus\u00e3o.",
    "Colored healthbar warnings when at significant thresholds.": "Avisos coloridos da barra de sa\u00fade quando em limites significativos.",
    "Current ammo inside of your magazine.": "Muni\u00e7\u00e3o atual dentro do seu pente.",
    "Customize the styling of damage numbers.": "Personalize o estilo dos n\u00fameros de danos.",
    "Customize the visuals of the incoming damage panel.": "Personalize o visual do painel de danos recebidos.",
    "Customize unsecured souls visuals.": "Personalize o visual das almas inseguras.",
    "Customize visibility of target reticle when abilities or items visually show on allies and enemies.": "Personalize a visibilidade do ret\u00edculo alvo quando habilidades ou itens aparecerem visualmente em aliados e inimigos.",
    "Customized healthbars for better visibility or flair.": "Barras de sa\u00fade personalizadas para melhor visibilidade ou talento.",
    "Decide what style of item to display the cooldown of.": "Decida qual estilo de item exibir o tempo de espera.",
    "Draws the minimap over all other UI elements for improved visibility.": "Desenha o minimapa sobre todos os outros elementos da UI para melhorar a visibilidade.",
    "Forcibly hides testing tools at all times.": "Oculta \u00e0 for\u00e7a as ferramentas de teste em todos os momentos.",
    "Forcibly shows testing tools at all times.": "Mostra \u00e0 for\u00e7a ferramentas de teste em todos os momentos.",
    "Greys out heros in the top bar when missing on the map.": "Acinzenta os her\u00f3is na barra superior quando somem do mapa.",
    "Highlighted abilities showing you what you should upgrade depending on build.": "Habilidades destacadas mostrando o que voc\u00ea deve melhorar dependendo da build.",
    "Improve Ability Stacks": "Melhore as pilhas de habilidades",
    "Makes the minimap rotate with player view, this is just for fun.": "Faz o minimapa girar com a visualiza\u00e7\u00e3o do jogador, isso \u00e9 apenas para divers\u00e3o.",
    "Menu when you receive a punishment for breaking game rules.": "Menu quando voc\u00ea recebe uma puni\u00e7\u00e3o por quebrar as regras do jogo.",
    "Only download the filter file of the filter you want, nothing else.": "Baixe apenas o arquivo de filtro do filtro desejado, nada mais.",
    "Play an audio reminder to remember to look at the minimap.": "Reproduza um lembrete de \u00e1udio para lembrar de olhar o minimapa.",
    "Ragnarok Online damage visuals with improved fancy styling.": "Visuais de dano melhorados com estilo chique do Ragnarok Online",
    "Real time key input visual.": "Visual de entrada de teclas em tempo real.",
    "See your view angle and speed.": "Veja seu \u00e2ngulo de vis\u00e3o e velocidade.",
    "Shifts the HUD for better visual support for 16:10 resolutions.": "Muda o HUD para melhor suporte visual para resolu\u00e7\u00f5es 16:10.",
    "Shifts the HUD for better visual support for 4:3 resolutions.": "Muda o HUD para melhor suporte visual para resolu\u00e7\u00f5es 4:3.",
    "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.": "Mostra um indicador visual na barra superior dos Guardi\u00f5es, Caminhantes e Base atuais.",
    "Show if you are in combat or not.": "Mostre se voc\u00ea est\u00e1 em combate ou n\u00e3o.",
    "Show player ultimate indicators on V1 healthbars.": "Mostre os indicadores finais do jogador nas barras de sa\u00fade V1.",
    "Show the estimated time for unsecured souls to dissapear.": "Mostre o tempo estimado para que as almas inseguras desapare\u00e7am.",
    "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.": "Mostra um indicador visual no minimapa de quando os Bridge Buffs ir\u00e3o aparecer.",
    "Shows a visual indicator in the minimap of when Mid Boss will spawn.": "Mostra um indicador visual no minimapa de quando Mid Boss ir\u00e1 aparecer.",
    "Changes urn color to know which side is favored, green for your team, red for the enemy.": "Muda a cor da urna para saber qual lado \u00e9 o favorito, verde para o seu time, vermelho para o inimigo.",
    "Shows a visual indicator in the top bar of the percentage difference of souls between teams.": "Mostra um indicador visual na barra superior da diferen\u00e7a percentual de almas entre as equipes.",
    "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.": "Mostra um indicador visual na barra superior de quando os Buff da Ponte ir\u00e3o aparecer.",
    "Shows a visual indicator in the top bar of when Mid Boss will spawn.": "Mostra um indicador visual na barra superior de quando Mid Boss ir\u00e1 aparecer.",
    "Shows all of your keybinds.": "Mostra todos as suas teclas.",
    "Shows all of your player stats within the shop menu.": "Mostra todas as estat\u00edsticas do seu jogador no menu da loja.",
    "Shows item cooldowns near crosshair for easier readability.": "Mostra o tempo de espera dos itens perto da mira para facilitar a leitura.",
    "Shows the individual player souls per minute on scoreboard and the team in the top bar.": "Mostra as almas individuais dos jogadores por minuto no placar e o time na barra superior.",
    "Shows the individual player's objective damage in the top bar.": "Mostra o dano objetivo do jogador individual na barra superior.",
    "Shows the individual player's unspent souls in the top bar.": "Mostra as almas n\u00e3o gastas de cada jogador na barra superior.",
    "Shows your character in the shop menu.": "Mostra seu personagem no menu da loja.",
    "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).": "Melhora significativamente a visibilidade do ret\u00edculo alvo e destaque para intervalos de execu\u00e7\u00e3o (Shiv).",
    "Simplifies the Compass overlay to its bare elements.": "Simplifica a sobreposi\u00e7\u00e3o da B\u00fassola para seus elementos simples.",
    "Slight adjustments to the HUD for better streaming output.": "Pequenos ajustes no HUD para melhor sa\u00edda de streaming.",
    "Speed number tracker.": "Rastreador de n\u00famero de velocidade.",
    "Stretch the compass horizontally.": "Estique a b\u00fassola horizontalmente.",
    "Stretch the compass vertically.": "Estique a b\u00fassola verticalmente.",
    "The circle countdown for when you are reloading.": "A contagem regressiva do c\u00edrculo para quando voc\u00ea estiver recarregando.",
    "The cosmetic ability on your default 5 key, like posters and snowballs.": "A habilidade cosm\u00e9tica em sua tecla 5 padr\u00e3o, como p\u00f4steres e bolas de neve.",
    "The damage dealt to Trooper minions.": "O dano causado aos Soldadinhos.",
    "The icon that replaces your crosshair when reloading.": "O \u00edcone que substitui a mira ao recarregar.",
    "The interval in which the sound plays in seconds.": "O intervalo em que o som \u00e9 reproduzido em segundos.",
    "The item buying auto queue system in the shop menu.": "O sistema de fila autom\u00e1tica de compra de itens no menu da loja.",
    "The large cumulative damage number.": "O grande n\u00famero de danos cumulativos.",
    "The popup signifying you are too low on stamina to cast another movement input.": "O pop-up significa que voc\u00ea est\u00e1 com pouca resist\u00eancia para lan\u00e7ar outra entrada de movimento.",
    "The small incremental damage numbers.": "Os pequenos n\u00fameros de dano incremental.",
    "The small visual icon.": "O pequeno \u00edcone visual.",
    "The unsecured text.": "O texto n\u00e3o seguro.",
    "The world background blur effect behind the shop menu.": "O efeito de desfoque de fundo do mundo atr\u00e1s do menu da loja.",
    "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.": "Esta \u00e9 uma vers\u00e3o leve com melhorias significativas de FPS, mas requer um arquivo separado para filtros.",
    "Time before the announcement happens in seconds.": "Tempo antes do an\u00fancio acontecer em segundos.",
    "Total ammo amount.": "Quantidade total de muni\u00e7\u00e3o.",
    "View a cooldown timer for reloading time.": "Veja um temporizador de resfriamento para recarregar o tempo.",
    "View an enhanced minimap on opening ability menu.": "Veja um minimapa aprimorado ao abrir o menu de habilidades.",
    "View an enhanced minimap on opening scoreboard menu.": "Veja um minimapa aprimorado ao abrir o menu do placar.",
    "View the cooldown time of player ultimates.": "Veja o tempo de espera dos ultimates do jogador.",
    "Visual indicator of your current ammo.": "Indicador visual da sua muni\u00e7\u00e3o atual.",
    "You can download custom announcer packs, just download the correct one for the slot you want to replace.": "Voc\u00ea pode baixar pacotes de locutores personalizados, basta baixar o correto para o slot que deseja substituir.",
    "COPY": "COPY",
    "COPIED": "COPIED",
    "FAILED": "FAILED",
    "SAVE": "SAVE",
    "HIDEOUT": "HIDEOUT",
    "QUEUED": "QUEUED",
    "APPLY": "APPLY",
    "APPLIED": "APPLIED",
    "AIRHEART": "AIRHEART",
    "SAVING": "SAVING",
    "VERIFY": "VERIFY",
    "SAVED": "SAVED",
    "TIMEOUT": "TIMEOUT",
    "CLEAR": "CLEAR",
    "CLEARING": "CLEARING",
    "CLEARED": "CLEARED",
    "Statistics": "Estat\u00edsticas",
    "Combat Status": "Status de Combate",
    "Easy": "F\u00e1cil",
    "Hard": "Dif\u00edcil",
    "SUPPORT THE MOD": "SUPPORT THE MOD",
    "CHANGE LOG": "CHANGE LOG",
    "Fighting Game": "Jogo de luta",
    "Open shop to continue save.": "Abra a loja para continuar economizando.",
    "Switching to Airheart...": "Mudando para Airheart...",
    "Writing settings string to build...": "Escrevendo string de configura\u00e7\u00f5es para construir...",
    "Save in progress...": "Salvar em andamento...",
    "Save timed out. Try again.": "Salvar expirou. Tente novamente.",
    "Save completed.": "Salvamento conclu\u00eddo.",
    "Save failed.": "Falha ao salvar.",
    "Save works only in hideout.": "Salvar funciona apenas no esconderijo.",
    "Failed to queue save request.": "Falha ao colocar a solicita\u00e7\u00e3o de salvamento na fila.",
    "Save queued.": "Salvar na fila.",
    "Open shop to continue clear.": "Abra a loja para continuar limpo.",
    "Confirming Airheart for clear...": "Confirmando Airheart para limpar...",
    "Clearing builds...": "Limpando compila\u00e7\u00f5es...",
    "Clear in progress...": "Limpeza em andamento...",
    "Clear timed out. Try again.": "A limpeza expirou. Tente novamente.",
    "Clear completed.": "Limpeza conclu\u00edda.",
    "Clear failed.": "Falha ao limpar.",
    "en": "pt",
    "Section already at defaults.": "Se\u00e7\u00e3o j\u00e1 est\u00e1 nos padr\u00f5es.",
    "Ready.": "Preparar.",
    "Share or save your settings configuration!": "Compartilhe ou salve suas configura\u00e7\u00f5es!",
    "Local settings loaded.": "Configura\u00e7\u00f5es locais carregadas.",
    "Export string copied.": "String de exporta\u00e7\u00e3o copiada.",
    "Clipboard copy failed.": "Falha na c\u00f3pia da \u00e1rea de transfer\u00eancia.",
    "Airheart switch sent.": "Interruptor Airheart enviado.",
    "Failed to switch hero.": "Falha ao trocar de her\u00f3i.",
    "Strings may sometimes break between mod versions.": "\u00c0s vezes, as strings podem quebrar entre as vers\u00f5es do mod.",
    "Import: parsing string...": "Importar: analisando string...",
    "Import: applying settings...": "Importar: aplicando configura\u00e7\u00f5es...",
    "Import: refreshing UI...": "Importar: atualizando a IU...",
    "Import failed.": "Falha na importa\u00e7\u00e3o.",
    "Invalid import string.": "String de importa\u00e7\u00e3o inv\u00e1lida.",
    "Row already at defaults.": "Linha j\u00e1 est\u00e1 nos padr\u00f5es.",
    "Preset apply failed.": "Falha na aplica\u00e7\u00e3o da predefini\u00e7\u00e3o.",
    "Scales the element.": "Dimensiona o elemento.",
    "Changes the element's transparency.": "Altera a transpar\u00eancia do elemento.",
    "Moves the element horizontally.": "Move o elemento horizontalmente.",
    "Moves the element vertically.": "Move o elemento verticalmente.",
    "Reset to default value": "Redefinir para o valor padr\u00e3o",
    "Reset row to defaults": "Redefinir linha para os padr\u00f5es",
    "Randomly opens an enabled arcade game while dead.": "Abre aleatoriamente um jogo de arcade habilitado enquanto estiver morto.",
    "Fountain-style damage number animation.": "Anima\u00e7\u00e3o do n\u00famero de danos no estilo de Chafariz.",
    "Russian": "Russian",
    "Chinese": "Chinese",
    "Troubleshoot": "Solucionar problemas",
    "Klutz's Bar": "Bar do Klutz",
    "Budhud": "Budhud",
    "Blackjack": "Wraithjack",
    "Settings Changes": "Altera\u00e7\u00f5es nas configura\u00e7\u00f5es",
    "Changes: ": "Mudan\u00e7as: ",
    "Changes:": "Mudan\u00e7as:",
    "Confirm": "Confirmar",
    "Cancel": "Cancelar",
    "Play Sound ": "Reproduzir som ",
    "The displayed language of the settings menu.": "O idioma exibido no menu de configura\u00e7\u00f5es.",
    "Preview realtime changes to settings when modifying them.": "Visualize altera\u00e7\u00f5es em tempo real nas configura\u00e7\u00f5es ao modific\u00e1-las.",
    "Restores the legacy removed duration bars for abilities.": "Restaura as barras de dura\u00e7\u00e3o antigas removidas para habilidades.",
    "Centers the friends list area within the ESC menu.": "Centraliza a \u00e1rea da lista de amigos no menu ESC.",
    "Enhanced V2 enemy healthbar visuals and readability.": "Visual e legibilidade aprimorados da barra de sa\u00fade do inimigo V2.",
    "Show the UnitInfo panel on V2 enemy healthbars.": "Mostre o painel UnitInfo nas barras de sa\u00fade inimigas V2.",
    "Show level text on V2 enemy healthbars.": "Mostrar texto de n\u00edvel nas barras de sa\u00fade inimigas V2.",
    "V2 enemy healthbar enhancements.": "Melhorias na barra de sa\u00fade do inimigo V2.",
    "Welcome to QOL Lock": "Bem-vindo ao QOL Lock",
    "Portuguese": "Portuguese",
    "BR Portuguese": "BR Portuguese",
    "Spanish": "Spanish",
    "Optimize Mode": "Modo de otimiza\u00e7\u00e3o",
    "Shown Items": "Itens mostrados",
};

const SETTINGS_ES_TEXT = {
    "Config": "Configuraci\u00f3n",
    "Presets": "Ajustes predefinidos",
    "Crosshair": "Mira",
    "HUD": "HUD",
    "UI": "UI",
    "Overlay": "Overlay",
    "Minimap": "Minimapa",
    "Audio": "Audio",
    "Console": "Consola",
    "General": "General",
    "Discord": "Discord",
    "Support": "Soporte",
    "Meta Settings": "Metaconfiguraciones",
    "Preview": "Vista previa",
    "Drag": "Arrastrar",
    "Language": "Lenguaje",
    "Default Hero": "H\u00e9roe predeterminado",
    "English": "Ingl\u00e9s",
    "French": "Franc\u00e9s",
    "Settings UI Language": "Lenguaje de la interfaz",
    "Hero on Load or Save": "H\u00e9roe al cargar o guardar",
    "Realtime Settings Changes": "Cambios de configuraci\u00f3n en tiempo real",
    "Realtime Changes": "Cambios en tiempo real",
    "Draggable UI": "UI arrastrable",
    "Enable": "Activar",
    "Export Settings": "Exportar configuraci\u00f3n",
    "Import Settings": "Importar configuraci\u00f3n",
    "Export String": "Exportar cadena ",
    "Import String": "Importar cadena",
    "How to Save Settings": "C\u00f3mo guardar configuraciones",
    "Share your settings string": "Comparte tu cadena de configuraci\u00f3n",
    "Paste and apply an exported settings string": "Pegar y aplicar una cadena de configuraci\u00f3n exportada",
    "Search Results": "Resultados de la b\u00fasqueda",
    "No results found": "No se encontraron resultados",
    "Better Item Cooldowns": "Mejores tiempos de recarga",
    "Item Cooldowns": "Tiempo de recarga de objetos",
    "Tracked cooldowns near crosshair": "Tiempo de recarga cerca de la mira",
    "Light Item Cooldowns": "Tiempos de recarga de objetos ligero",
    "Advanced Mode": "Modo avanzado",
    "Optimize Filters": "Optimizar filtros",
    "No filter settings but better FPS.": "Sin configuraciones de filtro pero con mejores FPS.",
    "Filters": "Filtros",
    "Get Filter File Only": "Obtener solo archivo de filtro",
    "Download": "Descargar",
    "Advanced Filter": "Filtro avanzado",
    "Defensive Passive": "Pasivo Defensivo",
    "Offensive Passive": "Pasivo Ofensivo",
    "Defensive Active": "Defensivo Activo",
    "Offensive Active": "Ofensivo Activo",
    "Damage Numbers": "N\u00fameros de da\u00f1o",
    "Ammo": "Munici\u00f3n",
    "Reload Cooldown": "Tiempo de recarga del arma",
    "Reloading": "Recargando",
    "Item Target Reticle": "Mira de objetos",
    "Top Bar Plus": "Barra superior Plus",
    "Top Bar": "Barra superior",
    "Shop": "Tienda",
    "HUD Controls": "Controles del HUD",
    "UI Controls": "Controles de interfaz de usuario",
    "Chat": "Chat",
    "Legacy Durations": "Duraciones cl\u00e1sicas",
    "Healthbar": "Barra de vida",
    "Player": "Jugador",
    "Bottom Bar": "Barra inferior",
    "Simplify": "Simplificar",
    "Zipline Boost": "Boost de via r\u00e1pida",
    "Souls Timer": "Temporizador de almas",
    "Unsecured Souls Timer": "Temporizador de almas no aseguradas",
    "Unsecured Timer": "Temporizador no seguro",
    "Better Unsecured": "Better Unsecured",
    "Better Unsecured Souls": "Mejores almas sin asegurar",
    "Unsecured Plus": "Unsecured Plus",
    "Keyboard": "Teclado",
    "Compass": "Br\u00fajula",
    "Ult Cooldowns": "Cooldown de definitiva",
    "Alt Zoom": "Zoom alternativo",
    "Tab Zoom": "Zoom TAB",
    "Announcer": "Locutor",
    "Arcade": "Arcade",
    "Game Settings": "Configuraci\u00f3n del juego",
    "Games": "Juegos",
    "Game Audio": "Audio del juego",
    "Difficulty": "Dificultad",
    "Supporting and Feature Requests": "Soporte y solicitudes de funciones",
    "Issues, Feedback and Ideas": "Problemas, comentarios e ideas",
    "Contact": "Contacto",
    "Special Thanks": "Agrademicientos especial",
    "Size": "Tama\u00f1o",
    "Opacity": "Opacidad",
    "Scale": "Escala",
    "Horizontal Offset": "Desplazamiento horizontal",
    "Vertical Offset": "Desplazamiento vertical",
    "Horizontal Stretch": "Estiramiento horizontal",
    "Vertical Stretch": "Estiramiento vertical",
    "Visual": "Visual",
    "Hide All": "Ocultar todo",
    "Current": "Actual",
    "Total": "Total",
    "Icon": "Icono",
    "Circle": "C\u00edrculo",
    "Big Number": "N\u00famero grande",
    "Big Numbers": "Grandes n\u00fameros",
    "Damage Fountain": "Da\u00f1o estilo fuente",
    "Small Numbers": "N\u00fameros peque\u00f1os",
    "Trooper Damage": "Da\u00f1o a los soldados",
    "Hide Current": "Ocultar actual",
    "Hide Total": "Ocultar total",
    "Hide Icon": "Ocultar icono",
    "Hide Circle": "Ocultar c\u00edrculo",
    "Hide Big Number": "Ocultar n\u00famero grande",
    "Hide Small Numbers": "Ocultar n\u00fameros peque\u00f1os",
    "Hide Trooper Damage": "Ocultar da\u00f1o a los soldado",
    "Highlight Mode": "Modo de resaltado",
    "Big Red": "Rojo grande",
    "Unspent Souls": "Almas sin gastar",
    "Souls Per Minute": "Almas por minuto",
    "Objective Damage": "Da\u00f1o al objetivo",
    "Objective Map": "Mapa de objetivo",
    "Urn Difference": "Diferencia de urna",
    "Buff Timer": "Temporizador de mejora",
    "Bridge Buff Timer": "Temporizador de mejora del puente",
    "Mid Boss Timer": "Temporizador del jefe central",
    "Missing Hero Opaque": "H\u00e9roe perdido opaco",
    "Display Stats": "Mostrar estad\u00edsticas",
    "Display Hero": "Mostrar h\u00e9roe",
    "Simplify Shop": "Tienda simplificada",
    "Stats": "Estad\u00edsticas",
    "Hero": "H\u00e9roe",
    "Minimalist": "Minimalista",
    "Blur": "Desenfoque",
    "Quick Buy": "Compra r\u00e1pida",
    "Hide Blur": "Ocultar desenfoque",
    "Hide Quick Buy": "Ocultar compra r\u00e1pida",
    "16:10 Support": "Soporte para 16:10",
    "4:3 Support": "Soporte para 4:3",
    "21:9 Stream Fix": "Correcci\u00f3n para 21:9",
    "Centered ESC Menu": "Men\u00fa ESC centrado",
    "Centered Friends List": "Lista de amigos centrada",
    "Statlocker": "Statlocker",
    "Force Testing Tools": "Forzar herramientas de prueba",
    "Show Testing Tools": "Mostrar herramientas de prueba",
    "Hide Testing Tools": "Ocultar herramientas de prueba",
    "Behavior Summary": "Resumen de comportamiento",
    "Failed Hint": "Fallo de resistencia",
    "Ability Suggestion": "Sugerencia de habilidad",
    "Cosmetic Ability": "Habilidad cosm\u00e9tica",
    "Hide Behavior Summary": "Ocultar resumen de comportamiento",
    "Hide Failed Hint": "Ocultar fallo de resistencia",
    "Hide Ability Suggestion": "Ocultar sugerencia de habilidad",
    "Hide Cosmetic Ability": "Ocultar habilidad cosm\u00e9tica",
    "Damage Report": "Reporte de da\u00f1o",
    "Adjust the in-game chat position and scale.": "Ajusta la posici\u00f3n y escala del chat en el juego.",
    "Adjust size of the in-game chat.": "Ajusta el tama\u00f1o del chat del juego.",
    "Adjust horizontal position of the in-game chat.": "Ajusta la posici\u00f3n horizontal del chat del juego.",
    "Adjust vertical position of the in-game chat.": "Ajusta la posici\u00f3n vertical del chat del juego.",
    "Show the in-game chat panel.": "Muestra el panel de chat del juego.",
    "Hide Damage Report": "Ocultar reporte de da\u00f1os",
    "Colored Healthbar": "Barra de vida coloreada",
    "Colored Health": "Vida coloreada",
    "Color Warning": "Advertencia por color",
    "Enemy": "Enemigo",
    "Minimalist Healthbar": "Barra de vida minimalista",
    "Simplify Ability Icons": "Simplificar iconos de habilidades",
    "Simplify Items": "Simplificar objetos",
    "Minimalist Abilities": "Habilidades minimalistas",
    "Minimalist Item Bar": "Barra de objetos minimalista",
    "Show Icon": "Mostrar icono",
    "Show Text": "Mostrar texto",
    "Text": "Texto",
    "Full Keybinds": "Combinaciones de teclas completas",
    "Full Keys": "Teclas completas",
    "Show Speed": "Mostrar velocidad",
    "Speed": "Velocidad",
    "Minimalist Minimap": "Minimapa minimalista",
    "Spinny Map": "Mapa giratorio",
    "Spinny Mode": "Modo giratorio",
    "Urn Colors": "Colores de urna",
    "Draw Over UI": "Dibujar sobre la interfaz de usuario",
    "Neutral Camps": "Campamentos neutrales",
    "Type": "Tipo",
    "Bridge Buffs": "Mejoras del puente",
    "Bridge Buff": "Mejoras del puente",
    "Buff": "Mejora",
    "Bridge Buff Delay": "Retraso de mejora del puente",
    "Buff Delay": "Retraso de mejora",
    "Tier 1": "Nivel 1",
    "Tier 2": "Nivel 2",
    "Tier 3": "Nivel 3",
    "Voice": "Voz",
    "Custom": "Personalizado",
    "XQC": "XQC",
    "Asmon": "Asm\u00f3n",
    "Beep": "Pitido",
    "Volume": "Volumen",
    "Quiet": "Tranquilo",
    "Normal": "Normal",
    "Loud": "Alto",
    "Preview Announcer": "Vista previa del locutor",
    "Test Announcer": "Probar locutor",
    "Minimap Reminder": "Recordatorio de minimapa",
    "Timer": "Temporizador",
    "On Death Games": "Juegos al morir",
    "On Death": "Al morir",
    "Bebop Sweeper": "Bebop Sweeper",
    "Flappy Bat": "Flappy Bat",
    "Graves Trainer": "Graves Trainer",
    "Whack a Rem": "Whack-a-Rem",
    "Zerggy Mania": "Zerggy Mania",
    "Hitmarkers": "Indicadores de impacto",
    "Off": "Apagado",
    "On": "Encendido",
    "Play": "Jugar",
    "Show Support": "Mostrar soporte",
    "Change Log": "Registro de cambios",
    "Contributors": "Colaboradores",
    "Open": "Abrir",
    "Support development": "Apoyar el desarrollo",
    "View updates": "Ver actualizaciones",
    "Community acknowledgements": "Reconocimientos a la comunidad",
    "Open Config": "Abrir configuraci\u00f3n",
    "You can support development by commissioning features or presets.": "Puedes apoyar el desarrollo encargando funciones o preajustes.",
    "Support development by commissioning features or presets.": "Apoya el desarrollo con funciones o preajustes por encargo.",
    "This is a way for me to give something back to the supporters.": "Esta es una forma de devolver algo a quienes apoyan el proyecto.",
    "All commissioned additions are released publicly and available to everyone.": "Todas las funciones por encargo se publican y est\u00e1n disponibles para todos.",
    "The mod is <font color=\"#66cc99\">fully functional</font> and <font color=\"#66cc99\">free</font> for all users.": "El mod es <font color=\"#66cc99\">complementamente funcional</font> y <font color=\"#66cc99\">gratuito</font> para todos los usuarios.",
    "Custom Preset Commission: <font color=\"#66cc99\">$25</font>": "Preajuste personalizado por encargo: <font color=\"#66cc99\">$25 USD</font>",
    "<font color=\"#66cc99\">Free</font> updates for new features, <font color=\"#66cc99\">$5</font> for arbitrary changes": "Actualizaciones <font color=\"#66cc99\">gratuitas</font> para nuevas funciones, <font color=\"#66cc99\">$5 USD</font> por cambios arbitrarios.",
    "Settings now load from your saved build string": "La configuraci\u00f3n ahora se carga desde tu cadena de configuraci\u00f3n guardada.",
    "New Feature Commission: <font color=\"#66cc99\">$10</font> to <font color=\"#66cc99\">$100</font>": "Encargo de nueva funci\u00f3n: <font color=\"#66cc99\">$10 USD</font> a <font color=\"#66cc99\">$100 USD</font>",
    "Depending on complexity and work involved": "Seg\u00fan la complejidad y el trabajo requerido",
    "Discord: <font color=\"#66cc99\">civocivocivo</font>": "Discord: <font color=\"#66cc99\">civocivocivo</font>",
    "Without them QOL Lock would not be possible.": "Sin ellos, QOL Lock no ser\u00eda posible.",
    "If you encounter issues please join the Discord": "Si tienes alg\u00fan problema, \u00fanete al Discord.",
    "I am open to all feedback, suggestions, and ideas!": "\u00a1Estoy abierto a todo tipo de comentarios, sugerencias e ideas!",
    "Default 18": "Predeterminado 18",
    "Default 400": "Predeterminado 400",
    "Hud Shift": "Desplazamiento del HUD",
    "Easier Access": "Acceso m\u00e1s f\u00e1cil",
    "Always Visible Override": "Forzar visibilidad permanente",
    "Always Shown": "Siempre visible",
    "Always Hidden": "Siempre oculto",
    "Metro Button": "Bot\u00f3n Metro",
    "Low Stamina Popup": "Aviso de resistencia baja",
    "On Ability Upgrade": "Al mejorar una habilidad",
    "Snowball or Poster": "Bola de nieve o p\u00f3ster",
    "Recommended for 4:3": "Recomendado para 4:3",
    "HP Warning": "Aviso de vida baja",
    "Enemy HP Warning": "Aviso de vida baja del enemigo",
    "Compact Layout": "Dise\u00f1o compacto",
    "Cleaner Skills": "Habilidades m\u00e1s limpias",
    "Cleaner Items": "Objetos m\u00e1s limpios",
    "Always Visible Boost": "Boost siempre visible",
    "Realtime Drain Countdown": "Cuenta regresiva de recarga en tiempo real",
    "Mirror unsecured gold number": "Reflejar n\u00famero de almas no aseguradas",
    "Realtime Key Inputs": "Pulsaciones de teclas en tiempo real",
    "Angle and Speed": "\u00c1ngulo y velocidad",
    "Estimated ult cooldowns under top-bar ult icons": "Tiempos de reutilizaci\u00f3n estimados de ult bajo los \u00edconos de ult de la barra superior",
    "HIGH FPS IMPACT WARNING!": "\u00a1ADVERTENCIA DE IMPACTO DE ALTOS FPS!",
    "Customizable Unsecured Souls": "Almas no seguras personalizables",
    "Simplified Minimap": "Minimapa simplificado",
    "Ability Menu Open": "Men\u00fa de habilidades abierto",
    "Scoreboard Open": "Marcador abierto",
    "Play current announcer voice and volume.": "Reproduzca la voz y el volumen del locutor actual.",
    "Play current announcer voice.": "Reproduce la voz del locutor actual.",
    "First Spawns": "Primeros engendros",
    "Buff Reminder": "Recordatorio de mejora",
    "Seconds Before Spawn": "Segundos antes del desove",
    "Ding to Check Minimap": "Ding para comprobar el minimapa",
    "In Seconds": "En Segundos",
    "Open random game when dead": "Abrir juego aleatorio cuando est\u00e9 muerto.",
    "Wraithjack": "Wraithjack",
    "Buff Filter": "Filtro de mejora",
    "click here": "haga clic aqu\u00ed",
    "Click Radius": "Haga clic en Radio",
    "Current Size": "Tama\u00f1o actual",
    "Enable Clean Stacks": "Habilitar pilas limpias",
    "Hero Icon Size": "Tama\u00f1o del icono del h\u00e9roe",
    "Icon Shrink": "Icono Reducir",
    "Improved Hint": "Pista mejorada",
    "Lane with Party": "Carril con fiesta",
    "Minimalist Opacity": "Opacidad minimalista",
    "Nicknames": "Apodos",
    "Player Icon Size": "Tama\u00f1o del icono del jugador",
    "Refresh Rate": "Frecuencia de actualizaci\u00f3n",
    "Show FPS": "Mostrar FPS",
    "Show Frame": "Mostrar marco",
    "Show Memory": "Mostrar memoria",
    "Show Position": "Mostrar posici\u00f3n",
    "Show Tick": "Mostrar garrapata",
    "Shrink Distance": "Reducir la distancia",
    "Total Size": "Tama\u00f1o total",
    "Ult Indicator": "Indicador definitivo",
    "Zip Thickness": "Grosor de la cremallera",
    "Depending on complexity and work involved, contact me on": "Dependiendo de la complejidad y el trabajo involucrado, cont\u00e1cteme al",
    "If you encounter issues, need help, or have any feedback join the Discord.": "Si tiene problemas, necesita ayuda o tiene alg\u00fan comentario, \u00fanase a Discord.",
    "Reset section runtime options": "Restablecer opciones de tiempo de ejecuci\u00f3n de secci\u00f3n",
    "Reset section to defaults": "Restablecer secci\u00f3n a los valores predeterminados",
    "DO NOT PRESS ANY KEYS UNTIL COMPLETE UNLESS PROMPTED": "NO PRESIONE NINGUNA TECLA HASTA COMPLETAR A MENOS QUE SE LE SOLICITE",
    "If saving stalls, open your shop.": "Si ahorras puestos, abre tu tienda.",
    "Play Sound": "Reproducir sonido",
    "1st": "1er",
    "2nd": "2do",
    "3rd": "3er",
    "Size of your current ammo.": "Tama\u00f1o de tu munici\u00f3n actual.",
    "Size of your total ammo.": "Tama\u00f1o de tu munici\u00f3n total.",
    "Cleans up the styling of reticle hints.": "Limpia el estilo de las sugerencias de ret\u00edcula.",
    "Automatically selects Lane Preference: With Party for matchmaking.": "Selecciona autom\u00e1ticamente Preferencia de carril: Con grupo para emparejamiento.",
    "Shows nicknames of all players in the game within the top bar.": "Muestra apodos de todos los jugadores del juego en la barra superior.",
    "Show the ultimate indicator for V1 healthbars.": "Muestra el indicador definitivo para las barras de salud V1.",
    "Colored enemy healthbar warnings when at significant thresholds.": "Advertencias coloreadas en la barra de salud del enemigo cuando se encuentran en umbrales significativos.",
    "Enemy healthbar enhancements.": "Mejoras en la barra de salud del enemigo.",
    "Opacity of the background of Minimalist Minimap.": "Opacidad del fondo del Minimapa minimalista.",
    "The click hitbox of your pings or clicks, this can help make pings more accurate.": "El hitbox de clic de sus pings o clics, esto puede ayudar a que los pings sean m\u00e1s precisos.",
    "How much icons will shrink when overlapping with others.": "Cu\u00e1nto se reducir\u00e1n los iconos al superponerse con otros.",
    "The size of other players on the minimap.": "El tama\u00f1o de otros jugadores en el minimapa.",
    "The size of yourself on the minimap.": "El tama\u00f1o de ti mismo en el minimapa.",
    "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.": "El umbral de distancia en el que los iconos comenzar\u00e1n a reducirse. M\u00e1s abajo son posiciones m\u00e1s precisas, m\u00e1s arriba es una visibilidad m\u00e1s f\u00e1cil.",
    "The thickness of the Zipline lines across the map.": "El grosor de las l\u00edneas de Zipline a lo largo del mapa.",
    "How fast the minimap refreshes.": "Qu\u00e9 tan r\u00e1pido se actualiza el minimapa.",
    "RAM and GPU Memory real time usage statistics.": "Estad\u00edsticas de uso de memoria RAM y GPU en tiempo real.",
    "Position and Velocity real time statistics.": "Estad\u00edsticas de posici\u00f3n y velocidad en tiempo real.",
    "Shows real time tick information, mostly useless.": "Muestra informaci\u00f3n de ticks en tiempo real, en su mayor\u00eda in\u00fatil.",
    "Shows raw FPS count.": "Muestra el recuento de FPS sin procesar.",
    "Shows current frame count, mostly useless.": "Muestra el recuento de fotogramas actual, en su mayor\u00eda in\u00fatiles.",
    "The hero you automatically switch to on launch or after saving..": "El h\u00e9roe al que cambias autom\u00e1ticamente al iniciar o despu\u00e9s de guardar.",
    "Toggle the hitmarkers when attacking enemies.": "Alterna los marcadores de impacto al atacar a los enemigos.",
    "Choose which bridge buff sound variants can play.": "Elija qu\u00e9 variantes de sonido de mejora del puente pueden reproducir.",
    "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.": "Qu\u00e9 eventos hacen que se reproduzca un sonido. Los campamentos son una vez, Buff es cada 5 minutos.",
    "FPS Impact:": "Impacto de FPS:",
    "Created By:": "Creado por:",
    "Author:": "Autor:",
    "Voice Actor:": "Actor de voz:",
    "None": "Ninguno",
    "Low": "Bajo",
    "Medium": "Medio",
    "High": "Alto",
    "Adjust horizontal position of the player healthbar.": "Ajusta la posici\u00f3n horizontal de la barra de salud del jugador.",
    "Adjust opacity of the player healthbar.": "Ajusta la opacidad de la barra de salud del jugador.",
    "Adjust size of the player healthbar.": "Ajusta el tama\u00f1o de la barra de salud del jugador.",
    "Adjust vertical position of the player healthbar.": "Ajusta la posici\u00f3n vertical de la barra de salud del jugador.",
    "An always visible zipline boost overlay.": "Una superposici\u00f3n de refuerzo de tirolesa siempre visible.",
    "Centers ESC menu elements to make them easier to access.": "Centra los elementos del men\u00fa ESC para facilitar el acceso a ellos.",
    "Centers friends list area in ESC menu.": "Centros de \u00e1rea de lista de amigos en el men\u00fa ESC.",
    "Adds a STAT button on profile rows that opens Statlocker for that account.": "Agrega un bot\u00f3n STAT en las filas del perfil que abre Statlocker para esa cuenta.",
    "Cleans up visuals of abilities significantly to reduce clutter.": "Limpia significativamente las im\u00e1genes de las habilidades para reducir el desorden.",
    "Cleans up visuals of the item bar significantly to reduce clutter.": "Limpia significativamente las im\u00e1genes de la barra de elementos para reducir el desorden.",
    "Cleans up visuals of the minimap significantly to reduce clutter.": "Limpia significativamente las im\u00e1genes del minimapa para reducir el desorden.",
    "Cleans up visuals of the shop menu significantly to reduce clutter.": "Limpia significativamente las im\u00e1genes del men\u00fa de la tienda para reducir el desorden.",
    "Colored healthbar warnings when at significant thresholds.": "Advertencias de colores en la barra de salud cuando se encuentran en umbrales significativos.",
    "Current ammo inside of your magazine.": "Munici\u00f3n actual dentro de tu cargador.",
    "Customize the styling of damage numbers.": "Personaliza el estilo de los n\u00fameros de da\u00f1os.",
    "Customize the visuals of the incoming damage panel.": "Personaliza las im\u00e1genes del panel de da\u00f1os entrante.",
    "Customize unsecured souls visuals.": "Personaliza im\u00e1genes de almas no seguras.",
    "Customize visibility of target reticle when abilities or items visually show on allies and enemies.": "Personaliza la visibilidad de la ret\u00edcula del objetivo cuando las habilidades o los elementos se muestran visualmente en aliados y enemigos.",
    "Customized healthbars for better visibility or flair.": "Barras de salud personalizadas para una mejor visibilidad o estilo.",
    "Decide what style of item to display the cooldown of.": "Decide de qu\u00e9 estilo de elemento mostrar el tiempo de reutilizaci\u00f3n.",
    "Draws the minimap over all other UI elements for improved visibility.": "Dibuja el minimapa sobre todos los dem\u00e1s elementos de la interfaz de usuario para mejorar la visibilidad.",
    "Forcibly hides testing tools at all times.": "Oculta a la fuerza las herramientas de prueba en todo momento.",
    "Forcibly shows testing tools at all times.": "Muestra a la fuerza herramientas de prueba en todo momento.",
    "Greys out heros in the top bar when missing on the map.": "Aten\u00faa a los h\u00e9roes en la barra superior cuando faltan en el mapa.",
    "Highlighted abilities showing you what you should upgrade depending on build.": "Habilidades resaltadas que te muestran lo que debes actualizar seg\u00fan la compilaci\u00f3n.",
    "Improve Ability Stacks": "Mejorar las pilas de habilidades",
    "Makes the minimap rotate with player view, this is just for fun.": "Hace que el minimapa gire con la vista del jugador, esto es s\u00f3lo por diversi\u00f3n.",
    "Menu when you receive a punishment for breaking game rules.": "Men\u00fa cuando recibes un castigo por romper las reglas del juego.",
    "Only download the filter file of the filter you want, nothing else.": "Descargue solo el archivo de filtro del filtro que desee, nada m\u00e1s.",
    "Play an audio reminder to remember to look at the minimap.": "Reproduzca un recordatorio de audio para recordar mirar el minimapa.",
    "Ragnarok Online damage visuals with improved fancy styling.": "Im\u00e1genes de da\u00f1os de Ragnarok Online con un estilo elegante mejorado.",
    "Real time key input visual.": "Visualizaci\u00f3n de entrada clave en tiempo real.",
    "See your view angle and speed.": "Vea su \u00e1ngulo de visi\u00f3n y velocidad.",
    "Shifts the HUD for better visual support for 16:10 resolutions.": "Cambia el HUD para un mejor soporte visual para resoluciones 16:10.",
    "Shifts the HUD for better visual support for 4:3 resolutions.": "Cambia el HUD para un mejor soporte visual para resoluciones 4:3.",
    "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.": "Muestra un indicador visual en la barra superior de los Guardianes, Caminantes y Base actuales.",
    "Show if you are in combat or not.": "Muestra si est\u00e1s en combate o no.",
    "Show player ultimate indicators on V1 healthbars.": "Muestra los indicadores finales del jugador en las barras de salud V1.",
    "Show the estimated time for unsecured souls to dissapear.": "Muestra el tiempo estimado para que desaparezcan las almas inseguras.",
    "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.": "Muestra un indicador visual en el minimapa de cu\u00e1ndo se generar\u00e1n Bridge Buffs.",
    "Shows a visual indicator in the minimap of when Mid Boss will spawn.": "Muestra un indicador visual en el minimapa de cu\u00e1ndo aparecer\u00e1 Mid Boss.",
    "Changes urn color to know which side is favored, green for your team, red for the enemy.": "Cambia el color de la urna para saber qu\u00e9 bando es el favorito, verde para tu equipo, rojo para el enemigo.",
    "Shows a visual indicator in the top bar of the percentage difference of souls between teams.": "Muestra un indicador visual en la barra superior de la diferencia porcentual de almas entre equipos.",
    "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.": "Muestra un indicador visual en la barra superior de cu\u00e1ndo se generar\u00e1n Bridge Buffs.",
    "Shows a visual indicator in the top bar of when Mid Boss will spawn.": "Muestra un indicador visual en la barra superior de cu\u00e1ndo aparecer\u00e1 Mid Boss.",
    "Shows all of your keybinds.": "Muestra todas sus combinaciones de teclas.",
    "Shows all of your player stats within the shop menu.": "Muestra todas las estad\u00edsticas de tu jugador dentro del men\u00fa de la tienda.",
    "Shows item cooldowns near crosshair for easier readability.": "Muestra los tiempos de reutilizaci\u00f3n de los elementos cerca del punto de mira para facilitar la lectura.",
    "Shows the individual player souls per minute on scoreboard and the team in the top bar.": "Muestra las almas de los jugadores individuales por minuto en el marcador y el equipo en la barra superior.",
    "Shows the individual player's objective damage in the top bar.": "Muestra el da\u00f1o objetivo del jugador individual en la barra superior.",
    "Shows the individual player's unspent souls in the top bar.": "Muestra las almas no gastadas de cada jugador en la barra superior.",
    "Shows your character in the shop menu.": "Muestra tu personaje en el men\u00fa de la tienda.",
    "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).": "Mejore significativamente la visibilidad de la ret\u00edcula del objetivo y resalte los rangos de ejecuci\u00f3n (Shiv).",
    "Simplifies the Compass overlay to its bare elements.": "Simplifica la superposici\u00f3n de Compass a sus elementos b\u00e1sicos.",
    "Slight adjustments to the HUD for better streaming output.": "Ligeros ajustes al HUD para una mejor salida de transmisi\u00f3n.",
    "Speed number tracker.": "Rastreador de n\u00fameros de velocidad.",
    "Stretch the compass horizontally.": "Estire la br\u00fajula horizontalmente.",
    "Stretch the compass vertically.": "Estire la br\u00fajula verticalmente.",
    "The circle countdown for when you are reloading.": "La cuenta atr\u00e1s del c\u00edrculo para cuando est\u00e9s recargando.",
    "The cosmetic ability on your default 5 key, like posters and snowballs.": "La habilidad cosm\u00e9tica en tu tecla 5 predeterminada, como carteles y bolas de nieve.",
    "The damage dealt to Trooper minions.": "El da\u00f1o causado a los s\u00fabditos de Trooper.",
    "The icon that replaces your crosshair when reloading.": "El \u00edcono que reemplaza tu punto de mira al recargar.",
    "The interval in which the sound plays in seconds.": "El intervalo en el que se reproduce el sonido en segundos.",
    "The item buying auto queue system in the shop menu.": "El sistema de cola autom\u00e1tica de compra de art\u00edculos en el men\u00fa de la tienda.",
    "The large cumulative damage number.": "El gran n\u00famero de da\u00f1os acumulados.",
    "The popup signifying you are too low on stamina to cast another movement input.": "La ventana emergente indica que tienes muy poca resistencia para realizar otra entrada de movimiento.",
    "The small incremental damage numbers.": "Las peque\u00f1as cifras de da\u00f1os incrementales.",
    "The small visual icon.": "El peque\u00f1o icono visual.",
    "The unsecured text.": "El texto no seguro.",
    "The world background blur effect behind the shop menu.": "El efecto de desenfoque del fondo mundial detr\u00e1s del men\u00fa de la tienda.",
    "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.": "Esta es una versi\u00f3n liviana con importantes mejoras en FPS pero requiere un archivo separado para los filtros.",
    "Time before the announcement happens in seconds.": "Tiempo antes de que ocurra el anuncio en segundos.",
    "Total ammo amount.": "Cantidad total de munici\u00f3n.",
    "View a cooldown timer for reloading time.": "Vea un temporizador de recuperaci\u00f3n para el tiempo de recarga.",
    "View an enhanced minimap on opening ability menu.": "Vea un minimapa mejorado al abrir el men\u00fa de habilidades.",
    "View an enhanced minimap on opening scoreboard menu.": "Vea un minimapa mejorado al abrir el men\u00fa del marcador.",
    "View the cooldown time of player ultimates.": "Ver el tiempo de recuperaci\u00f3n de las definitivas del jugador.",
    "Visual indicator of your current ammo.": "Indicador visual de tu munici\u00f3n actual.",
    "You can download custom announcer packs, just download the correct one for the slot you want to replace.": "Puede descargar paquetes de locutores personalizados, simplemente descargue el correcto para el espacio que desea reemplazar.",
    "COPY": "COPY",
    "COPIED": "COPIED",
    "FAILED": "FAILED",
    "SAVE": "SAVE",
    "HIDEOUT": "HIDEOUT",
    "QUEUED": "QUEUED",
    "APPLY": "APPLY",
    "APPLIED": "APPLIED",
    "AIRHEART": "AIRHEART",
    "SAVING": "SAVING",
    "VERIFY": "VERIFY",
    "SAVED": "SAVED",
    "TIMEOUT": "TIMEOUT",
    "CLEAR": "CLEAR",
    "CLEARING": "CLEARING",
    "CLEARED": "CLEARED",
    "Statistics": "Estad\u00edstica",
    "Combat Status": "Estado de combate",
    "Easy": "F\u00e1cil",
    "Hard": "Duro",
    "SUPPORT THE MOD": "SUPPORT THE MOD",
    "CHANGE LOG": "CHANGE LOG",
    "Fighting Game": "Juego de lucha",
    "Open shop to continue save.": "Abra la tienda para continuar ahorrando.",
    "Switching to Airheart...": "Cambiando a Airheart...",
    "Writing settings string to build...": "Escribiendo cadena de configuraci\u00f3n para construir...",
    "Save in progress...": "Guardar en curso...",
    "Save timed out. Try again.": "Guardar tiempo de espera agotado. Intentar otra vez.",
    "Save completed.": "Guardar completado.",
    "Save failed.": "Error al guardar.",
    "Save works only in hideout.": "Guardar funciona s\u00f3lo en el escondite.",
    "Failed to queue save request.": "No se pudo poner en cola la solicitud para guardar.",
    "Save queued.": "Guardar en cola.",
    "Open shop to continue clear.": "Abrir tienda para continuar despejado.",
    "Confirming Airheart for clear...": "Confirmando Airheart para claro...",
    "Clearing builds...": "Borrando compilaciones...",
    "Clear in progress...": "Borrado en progreso...",
    "Clear timed out. Try again.": "Se agot\u00f3 el tiempo de borrado. Intentar otra vez.",
    "Clear completed.": "Borrar completado.",
    "Clear failed.": "Borrado fallido.",
    "en": "es",
    "Section already at defaults.": "Secci\u00f3n ya en valores predeterminados.",
    "Ready.": "Listo.",
    "Share or save your settings configuration!": "\u00a1Comparte o guarda tu configuraci\u00f3n de configuraci\u00f3n!",
    "Local settings loaded.": "Configuraci\u00f3n local cargada.",
    "Export string copied.": "Cadena de exportaci\u00f3n copiada.",
    "Clipboard copy failed.": "Error al copiar el portapapeles.",
    "Airheart switch sent.": "Se envi\u00f3 el interruptor Airheart.",
    "Failed to switch hero.": "No se pudo cambiar de h\u00e9roe.",
    "Strings may sometimes break between mod versions.": "A veces, las cadenas pueden romperse entre las versiones del mod.",
    "Import: parsing string...": "Importar: cadena de an\u00e1lisis...",
    "Import: applying settings...": "Importar: aplicar configuraci\u00f3n...",
    "Import: refreshing UI...": "Importar: actualizar la interfaz de usuario...",
    "Import failed.": "La importaci\u00f3n fall\u00f3.",
    "Invalid import string.": "Cadena de importaci\u00f3n no v\u00e1lida.",
    "Row already at defaults.": "La fila ya est\u00e1 en los valores predeterminados.",
    "Preset apply failed.": "Error en la aplicaci\u00f3n de ajustes preestablecidos.",
    "Scales the element.": "Escala el elemento.",
    "Changes the element's transparency.": "Cambia la transparencia del elemento.",
    "Moves the element horizontally.": "Mueve el elemento horizontalmente.",
    "Moves the element vertically.": "Mueve el elemento verticalmente.",
    "Reset to default value": "Restablecer el valor predeterminado",
    "Reset row to defaults": "Restablecer fila a los valores predeterminados",
    "Randomly opens an enabled arcade game while dead.": "Abre aleatoriamente un juego de arcade habilitado mientras est\u00e1s muerto.",
    "Fountain-style damage number animation.": "Animaci\u00f3n de n\u00fameros de da\u00f1os estilo fuente.",
    "Russian": "Ruso",
    "Chinese": "Chino",
    "Troubleshoot": "Solucionar problemas",
    "Klutz's Bar": "Bar Klutz",
    "Budhud": "Budhud",
    "Settings Changes": "Cambios de configuraci\u00f3n",
    "Changes:": "Cambios:",
    "Confirm": "Confirmar",
    "Cancel": "Cancelar",
    "The displayed language of the settings menu.": "El idioma mostrado en el men\u00fa de configuraci\u00f3n.",
    "Preview realtime changes to settings when modifying them.": "Obtenga una vista previa de los cambios en la configuraci\u00f3n en tiempo real al modificarlos.",
    "Restores the legacy removed duration bars for abilities.": "Restaura las barras de duraci\u00f3n heredadas eliminadas de las habilidades.",
    "Centers the friends list area within the ESC menu.": "Centra el \u00e1rea de la lista de amigos dentro del men\u00fa ESC.",
    "Enhanced V2 enemy healthbar visuals and readability.": "Im\u00e1genes y legibilidad mejoradas de la barra de salud del enemigo V2.",
    "Show the UnitInfo panel on V2 enemy healthbars.": "Muestra el panel UnitInfo en las barras de salud enemigas V2.",
    "Show level text on V2 enemy healthbars.": "Muestra texto de nivel en las barras de salud enemigas V2.",
    "V2 enemy healthbar enhancements.": "Mejoras en la barra de salud del enemigo V2.",
    "Welcome to QOL Lock": "Bienvenido a QOL Lock",
    "BR Portuguese": "Portugu\u00e9s (Brasil)",
    "Blackjack": "Wraithjack",
    "Changes: ": "Cambios: ",
    "Play Sound ": "Reproducir sonido ",
    "Spanish": "Espa\u00f1ol",
    "Portuguese": "Portugu\u00e9s",
    "Optimize Mode": "Modo de optimizaci\u00f3n",
    "Shown Items": "Items mostrados",
};

function GetSettingsLanguage() {
    var raw = Math.round(Number(MOD_CONFIG && MOD_CONFIG.LANGUAGE));
    if (raw === SETTINGS_LANGUAGE_RUSSIAN) return SETTINGS_LANGUAGE_RUSSIAN;
    if (raw === SETTINGS_LANGUAGE_CHINESE) return SETTINGS_LANGUAGE_CHINESE;
    if (raw === SETTINGS_LANGUAGE_FRENCH) return SETTINGS_LANGUAGE_FRENCH;
    if (raw === SETTINGS_LANGUAGE_PORTUGUESE) return SETTINGS_LANGUAGE_PORTUGUESE;
    if (raw === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) return SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE;
    if (raw === SETTINGS_LANGUAGE_SPANISH) return SETTINGS_LANGUAGE_SPANISH;
    return SETTINGS_LANGUAGE_ENGLISH;
}

function IsRussianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_RUSSIAN;
}

function IsChineseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_CHINESE;
}

function IsFrenchSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_FRENCH;
}

function IsPortugueseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_PORTUGUESE;
}

function IsBrazilianPortugueseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE;
}

function IsSpanishSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_SPANISH;
}

function GetSettingsLanguageKey() {
    var lang = GetSettingsLanguage();
    if (lang === SETTINGS_LANGUAGE_RUSSIAN) return "ru";
    if (lang === SETTINGS_LANGUAGE_CHINESE) return "zh";
    if (lang === SETTINGS_LANGUAGE_FRENCH) return "fr";
    if (lang === SETTINGS_LANGUAGE_PORTUGUESE) return "pt";
    if (lang === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) return "pt-br";
    if (lang === SETTINGS_LANGUAGE_SPANISH) return "es";
    return "en";
}

function NormalizeLatinSettingsText(text) {
    var raw = String(text || "");
    return raw
        .replace(/[\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5]/g, "a")
        .replace(/[\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5]/g, "A")
        .replace(/[\u00e7]/g, "c")
        .replace(/[\u00c7]/g, "C")
        .replace(/[\u00e8\u00e9\u00ea\u00eb]/g, "e")
        .replace(/[\u00c8\u00c9\u00ca\u00cb]/g, "E")
        .replace(/[\u00ec\u00ed\u00ee\u00ef]/g, "i")
        .replace(/[\u00cc\u00cd\u00ce\u00cf]/g, "I")
        .replace(/[\u00f1]/g, "n")
        .replace(/[\u00d1]/g, "N")
        .replace(/[\u00f2\u00f3\u00f4\u00f5\u00f6]/g, "o")
        .replace(/[\u00d2\u00d3\u00d4\u00d5\u00d6]/g, "O")
        .replace(/[\u00f9\u00fa\u00fb\u00fc]/g, "u")
        .replace(/[\u00d9\u00da\u00db\u00dc]/g, "U")
        .replace(/[\u00fd\u00ff]/g, "y")
        .replace(/[\u00dd\u0178]/g, "Y")
        .replace(/[\u0153]/g, "oe")
        .replace(/[\u0152]/g, "OE")
        .replace(/[\u00e6]/g, "ae")
        .replace(/[\u00c6]/g, "AE")
        .replace(/[\u2019\u2018]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/[^\x20-\x7E]/g, "");
}

function NormalizeFrenchSettingsText(text) {
    return NormalizeLatinSettingsText(text);
}

function NormalizePortugueseSettingsText(text) {
    return NormalizeLatinSettingsText(text);
}

function NormalizeBrazilianPortugueseSettingsText(text) {
    return NormalizeLatinSettingsText(text);
}

function NormalizeSpanishSettingsText(text) {
    return NormalizeLatinSettingsText(text);
}

function ShouldLocalizeTabContent() {

    return currentTab !== "Presets";
}

function LocalizeSettingsText(text, force) {
    if (text === undefined || text === null) return "";
    var raw = String(text);
    if (!force && !ShouldLocalizeTabContent()) return raw;

    var lang = GetSettingsLanguage();
    if (lang === SETTINGS_LANGUAGE_ENGLISH) return raw;

    var map = null;
    if (lang === SETTINGS_LANGUAGE_RUSSIAN) map = SETTINGS_RU_TEXT;
    else if (lang === SETTINGS_LANGUAGE_CHINESE) map = SETTINGS_ZH_TEXT;
    else if (lang === SETTINGS_LANGUAGE_FRENCH) map = SETTINGS_FR_TEXT;
    else if (lang === SETTINGS_LANGUAGE_PORTUGUESE) map = SETTINGS_PT_TEXT;
    else if (lang === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) map = SETTINGS_PT_BR_TEXT;
    else if (lang === SETTINGS_LANGUAGE_SPANISH) map = SETTINGS_ES_TEXT;
    if (map && map.hasOwnProperty(raw)) {
        var translated = map[raw];
        if (lang === SETTINGS_LANGUAGE_FRENCH) return NormalizeFrenchSettingsText(translated);
        if (lang === SETTINGS_LANGUAGE_PORTUGUESE) return NormalizePortugueseSettingsText(translated);
        if (lang === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) return NormalizeBrazilianPortugueseSettingsText(translated);
        if (lang === SETTINGS_LANGUAGE_SPANISH) return NormalizeSpanishSettingsText(translated);
        return translated;
    }

    if (lang === SETTINGS_LANGUAGE_RUSSIAN && SETTINGS_RU_MISSING_TRANSLATION_LOG && !gMissingRuSettingsStrings[raw] && /[A-Za-z]/.test(raw)) {
        gMissingRuSettingsStrings[raw] = true;
        $.Msg("[QOLLock][SettingsLang] missing_ru_translation key=" + raw);
    }
    return raw;
}

function SetLocalizedConfigFeedbackMessage(text, tone, durationMs) {
    SetConfigFeedbackMessage(LocalizeSettingsText(text, true), tone, durationMs);
}

function SettingsRuntimeLog(msg) {
    if (!SETTINGS_RUNTIME_LOG) return;
    $.Msg("[QOLLock][SettingsRuntime] " + String(msg || ""));
}

const MINESWEEPER_ROWS = 9;
const MINESWEEPER_COLS = 9;
const MINESWEEPER_MINES = 10;
const MINESWEEPER_DEFAULT_DIFFICULTY = "EASY";
const MINESWEEPER_BOARD_WIDTH = 620;
const MINESWEEPER_BOARD_HEIGHT = 500;
const MINESWEEPER_DIFFICULTIES = [
    { id: "EASY", label: "Easy", rows: 9, cols: 9, mines: 10 },
    { id: "MEDIUM", label: "Medium", rows: 10, cols: 10, mines: 18 },
    { id: "HARD", label: "Hard", rows: 10, cols: 12, mines: 28 }
];
const ARCADE_2048_SIZE = 4;
const FLAPPY_BIRD_IMAGE_SRC = "s2r://panorama/images/qollock/vampirebat_sm_psd.vtex";
const AIM_TRAINER_DURATION_SEC = 45;
const TRAIN_TRACKING_DURATION_SEC = 45;
const WHACK_A_REM_DURATION_SEC = 45;
const WHACK_A_REM_MAX_TARGETS = 3;
const WHACK_A_REM_DEFAULT_DIFFICULTY = "MEDIUM";
const WHACK_A_REM_DIFFICULTIES = [
    { id: "EASY", label: "Easy", maxConcurrent: 1, lifeStartSec: 1.05, lifeEndSec: 0.58, spawnDelaySec: 0.22 },
    { id: "MEDIUM", label: "Medium", maxConcurrent: 2, lifeStartSec: 1.18, lifeEndSec: 0.68, spawnDelaySec: 0.19 },
    { id: "HARD", label: "Hard", maxConcurrent: 3, lifeStartSec: 1.08, lifeEndSec: 0.56, spawnDelaySec: 0.16 }
];
const ON_DEATH_GAMES_POLL_SECONDS = 0.25;
const ON_DEATH_GAMES_TRIGGER_COOLDOWN_MS = 1500;
const ON_DEATH_ARCADE_GAME_KEYS = [
    "ON_DEATH_GAME_MINESWEEPER",
    "ON_DEATH_GAME_BLACKJACK",
    "ON_DEATH_GAME_FLAPPY_BAT",
    "ON_DEATH_GAME_GRAVES_TRAINER",
    "ON_DEATH_GAME_ZERGGY_MANIA",
    "ON_DEATH_GAME_WHACK_A_REM"
];
const ARCADE_DEFAULT_DIFFICULTY_OPTIONS = [
    { label: "Easy", id: "EASY" },
    { label: "Medium", id: "MEDIUM" },
    { label: "Hard", id: "HARD" }
];

function IsArcadeGameAudioEnabled() {
    return Number(MOD_CONFIG.ENABLE_GAME_AUDIO) === 1;
}

function PlayArcadeGameSoundEffect(eventName) {
    var resolved = String(eventName || "");
    if (!resolved) return;
    if (!IsArcadeGameAudioEnabled()) return;
    try { $.DispatchEvent("PlaySoundEffect", resolved); } catch (e0) {}
}

function ResolveArcadeDefaultDifficultyId() {
    var raw = MOD_CONFIG ? MOD_CONFIG.GAME_DEFAULT_DIFFICULTY : 1;
    var asNumber = Math.round(Number(raw));
    if (isFinite(asNumber)) {
        if (asNumber <= 0) return "EASY";
        if (asNumber >= 2) return "HARD";
        return "MEDIUM";
    }
    var asString = String(raw || "").toUpperCase();
    if (asString === "EASY" || asString === "HARD" || asString === "MEDIUM") return asString;
    return "MEDIUM";
}

const SETTINGS_RU_MISSING_TRANSLATION_LOG = false;
const SETTINGS_RUNTIME_LOG = false;
const HERO_HINT_PUBLISH_INTERVAL_SEC = 1.0;
const FLAPPY_BAT_FLAP_SOUND_EVENT = "QOL.FlappyBat.Flap";
const FLAPPY_BAT_FAIL_SOUND_EVENTS = [
    "QOL.FlappyBat.Fail1",
    "QOL.FlappyBat.Fail2",
    "QOL.FlappyBat.Fail3",
    "QOL.FlappyBat.Fail4"
];
const BLACKJACK_ACTION_SOUND_EVENTS = [
    "QOL.Blackjack.Action1",
    "QOL.Blackjack.Action2",
    "QOL.Blackjack.Action3",
    "QOL.Blackjack.Action4"
];
const BLACKJACK_WIN_SOUND_EVENT = "QOL.Blackjack.Win";
const BLACKJACK_LOSE_SOUND_EVENT = "QOL.Blackjack.Lose";
const AIM_TRAINER_DEFAULT_DIFFICULTY = "MEDIUM";
const AIM_TRAINER_HIT_SOUND_EVENT = "QOL.GravesTrainer.Hit";
const AIM_TRAINER_DIFFICULTIES = [
    { id: "EASY", label: "Easy", durationSec: 45, targetStartSize: 84, targetEndSize: 52, targetLifeStartSec: 1.25, targetLifeEndSec: 0.82 },
    { id: "MEDIUM", label: "Medium", durationSec: 45, targetStartSize: 74, targetEndSize: 40, targetLifeStartSec: 1.05, targetLifeEndSec: 0.52 },
    { id: "HARD", label: "Hard", durationSec: 45, targetStartSize: 64, targetEndSize: 30, targetLifeStartSec: 0.90, targetLifeEndSec: 0.38 }
];
const AIM_TRAINER_TARGET_IMAGE_PATHS = [
    "s2r://panorama/images/qollock/digger_sm_psd.vtex",
    "s2r://panorama/images/qollock/astro_sm_psd.vtex",
    "s2r://panorama/images/qollock/viscous_sm_psd.vtex",
    "s2r://panorama/images/qollock/archer_sm_psd.vtex",
    "s2r://panorama/images/qollock/bull_sm_psd.vtex",
    "s2r://panorama/images/qollock/tengu_sm_psd.vtex"
];
const WHACK_A_REM_TARGET_IMAGE_SRC = "s2r://panorama/images/qollock/familiar_sm_psd.vtex";
const WHACK_A_REM_HIT_FLASH_SEC = 0.075;
const WHACK_A_REM_HIT_SOUND_EVENTS = [
    "QOL.WhackRem.Hit1",
    "QOL.WhackRem.Hit2",
    "QOL.WhackRem.Hit3",
    "QOL.WhackRem.Hit4",
    "QOL.WhackRem.Hit5",
    "QOL.WhackRem.Hit6",
    "QOL.WhackRem.Hit7",
    "QOL.WhackRem.Hit8",
    "QOL.WhackRem.Hit9"
];
const WHACK_A_REM_MISS_SOUND_EVENTS = [
    "QOL.WhackRem.Miss1",
    "QOL.WhackRem.Miss2",
    "QOL.WhackRem.Miss3"
];
const TRAIN_TRACKING_TARGET_IMAGE_SRC = "s2r://panorama/images/qollock/vampirebat_sm_psd.vtex";
const MINESWEEPER_MINE_IMAGE_SRC = "s2r://panorama/images/qollock/bebop_sm_psd.vtex";
const MINESWEEPER_EXPLODE_SOUND_EVENT = "QOL.BebopSweeper.Explode";
const MINESWEEPER_WIN_SOUND_EVENT = "QOL.BebopSweeper.Win";
const MINESWEEPER_STATUS_DEFAULT_TEXT = "Find all safe tiles. Right-click to flag.";
const BILLIARDS_TABLE_WIDTH = 640;
const BILLIARDS_TABLE_HEIGHT = 380;
const BILLIARDS_BALL_RADIUS = 11;
const BILLIARDS_POCKET_RADIUS = 22;
const BILLIARDS_FRICTION = 0.972;
const BILLIARDS_BOUNCE = 0.92;
const BILLIARDS_MIN_SPEED = 0.08;
const TRAIN_TRACKING_DEFAULT_DIFFICULTY = "MEDIUM";
const TRAIN_TRACKING_DIFFICULTIES = [
    { id: "EASY", label: "Easy", targetSize: 98, baseSpeed: 5.8, maxSpeed: 9.8, speedGainPerScore: 0.16, sampleIntervalSec: 0.12, jitterTickReset: 15 },
    { id: "MEDIUM", label: "Medium", targetSize: 84, baseSpeed: 7.4, maxSpeed: 12.2, speedGainPerScore: 0.22, sampleIntervalSec: 0.10, jitterTickReset: 13 },
    { id: "HARD", label: "Hard", targetSize: 66, baseSpeed: 10.2, maxSpeed: 16.5, speedGainPerScore: 0.34, sampleIntervalSec: 0.07, jitterTickReset: 10 }
];
const TRAIN_TRACKING_HIT_FLASH_SEC = 0.075;
const TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC = 0.32;
const TRAIN_TRACKING_HIT_SOUND_MIN_INTERVAL_SEC = 0.72;
const TRAIN_TRACKING_HIT_SOUND_EVENTS = [
    "QOL.ZerggyMania.Hit1",
    "QOL.ZerggyMania.Hit2",
    "QOL.ZerggyMania.Hit3",
    "QOL.ZerggyMania.Hit4",
    "QOL.ZerggyMania.Hit5"
];

function PickRandomIndexNoImmediateRepeat(options, stableKey) {
    if (!Array.isArray(options) || options.length <= 0) return -1;
    var len = options.length;
    if (len === 1) return 0;
    var key = String(stableKey || "");
    var last = (key && gArcadeSoundLastIndexByKey.hasOwnProperty(key))
        ? Number(gArcadeSoundLastIndexByKey[key])
        : -1;
    if (!isFinite(last) || last < 0 || last >= len) last = -1;

    var idx = Math.floor(Math.random() * len);
    if (!isFinite(idx) || idx < 0 || idx >= len) idx = 0;
    if (idx === last) {
        idx = (idx + 1 + Math.floor(Math.random() * (len - 1))) % len;
    }
    if (key) gArcadeSoundLastIndexByKey[key] = idx;
    return idx;
}

function QOLFilterFriendsList() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    var searchInput = root ? root.FindChildTraverse("FriendSearchInput") : null;
    if (!searchInput) return;

    var searchText = (searchInput.text || "").toLowerCase();
    var friendsContainer = root ? root.FindChildTraverse("FriendsCategories") : null;
    if (!friendsContainer) return;

    for (var i = 0; i < friendsContainer.GetChildCount(); i++) {
        var categoryPanel = friendsContainer.GetChild(i);
        if (!categoryPanel) continue;

        var friendEntries = categoryPanel.FindChildTraverse("FriendEntries");
        if (!friendEntries && categoryPanel.GetChildCount() > 1) {
            friendEntries = categoryPanel.GetChild(1);
        }
        if (!friendEntries) continue;

        for (var j = 0; j < friendEntries.GetChildCount(); j++) {
            var playerPanel = friendEntries.GetChild(j);
            if (!playerPanel) continue;

            var userNameHost = playerPanel.FindChildInLayoutFile ? playerPanel.FindChildInLayoutFile("UserName") : null;
            var nameLabel = null;
            if (userNameHost && userNameHost.GetChildCount && userNameHost.GetChildCount() > 0) {
                nameLabel = userNameHost.GetChild(0);
            }

            if (nameLabel && typeof nameLabel.text === "string") {
                var playerName = nameLabel.text.toLowerCase();
                playerPanel.visible = (searchText.length === 0 || playerName.indexOf(searchText) !== -1);
            } else {
                playerPanel.visible = true;
            }
        }
    }

    var searchClear = root ? root.FindChildTraverse("FriendSearchClear") : null;
    if (searchClear) {
        searchClear.visible = (searchText.length > 0);
    }
}

function QOLClearFriendsSearch() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    var searchInput = root ? root.FindChildTraverse("FriendSearchInput") : null;
    if (!searchInput) return;

    searchInput.text = "";
    if (searchInput.ClearSelection) searchInput.ClearSelection();
    QOLFilterFriendsList();
}

function QOLBindFriendsSearchHandlers() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    if (!root) return false;

    var searchInput = root.FindChildTraverse("FriendSearchInput");
    var searchClear = root.FindChildTraverse("FriendSearchClear");
    if (!searchInput || !searchClear) return false;

    searchInput.SetPanelEvent("ontextentrychange", function() {
        QOLFilterFriendsList();
    });
    searchClear.SetPanelEvent("onactivate", function() {
        QOLClearFriendsSearch();
    });
    QOLFilterFriendsList();
    return true;
}

function EnsureDiscordTextureLogo(targetBtn, logoId, logoClass) {
    if (!targetBtn) return;
    var resolvedLogoId = logoId || "FooterDiscordLogoTexture";
    var resolvedLogoClass = logoClass || "FooterDiscordLogoTexture";

    var legacyCssLogo = targetBtn.FindChildTraverse("FooterDiscordLogoCss");
    if (legacyCssLogo && legacyCssLogo.DeleteAsync) legacyCssLogo.DeleteAsync(0);

    var logoImage = targetBtn.FindChildTraverse(resolvedLogoId);
    if (!logoImage) {
        logoImage = $.CreatePanel("Image", targetBtn, resolvedLogoId);
    }
    if (!logoImage) return;

    logoImage.AddClass(resolvedLogoClass);
    logoImage.SetImage("s2r://panorama/images/qollock/discord_logo.vtex");
}

function EnsureDiscordFooterTextureLogo(discordFooterBtn) {
    EnsureDiscordTextureLogo(discordFooterBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
}

function QOLEnsureFriendsSearchHandlers() {
    if (!QOLBindFriendsSearchHandlers()) {
        $.Schedule(0.5, QOLEnsureFriendsSearchHandlers);
    }
}

function GetMinesweeperDifficultyById(id) {
    for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
        if (MINESWEEPER_DIFFICULTIES[i].id === id) return MINESWEEPER_DIFFICULTIES[i];
    }
    return MINESWEEPER_DIFFICULTIES[0];
}

function GetAimTrainerDifficultyById(id) {
    for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
        if (AIM_TRAINER_DIFFICULTIES[i].id === id) return AIM_TRAINER_DIFFICULTIES[i];
    }
    return AIM_TRAINER_DIFFICULTIES[0];
}

function GetTrainTrackingDifficultyById(id) {
    for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
        if (TRAIN_TRACKING_DIFFICULTIES[i].id === id) return TRAIN_TRACKING_DIFFICULTIES[i];
    }
    return TRAIN_TRACKING_DIFFICULTIES[0];
}

function GetRandomAimTrainerTargetImagePath(previousPath) {
    if (!AIM_TRAINER_TARGET_IMAGE_PATHS || AIM_TRAINER_TARGET_IMAGE_PATHS.length <= 0) return "";
    if (AIM_TRAINER_TARGET_IMAGE_PATHS.length === 1) return AIM_TRAINER_TARGET_IMAGE_PATHS[0];
    var idx = Math.floor(Math.random() * AIM_TRAINER_TARGET_IMAGE_PATHS.length);
    var nextPath = AIM_TRAINER_TARGET_IMAGE_PATHS[idx];
    if (previousPath && nextPath === previousPath) {
        idx = (idx + 1) % AIM_TRAINER_TARGET_IMAGE_PATHS.length;
        nextPath = AIM_TRAINER_TARGET_IMAGE_PATHS[idx];
    }
    return nextPath;
}

function ApplyAimTrainerTargetImage(state) {
    if (!state || !state.targetImage || !state.targetImage.IsValid || !state.targetImage.IsValid()) return;
    var nextPath = GetRandomAimTrainerTargetImagePath(state.targetImagePath || "");
    if (!nextPath) return;
    state.targetImagePath = nextPath;
    try {
        state.targetImage.SetImage(nextPath);
    } catch (eSetImage) {
        try { state.targetImage.SetAttributeString("src", nextPath); } catch (eAttr) {}
    }
}

function SetPanelNonInteractive(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    panel.hittest = false;
    panel.hittestchildren = false;
}

function SetPanelOpacitySafe(panel, opacityValue, fallbackValue) {
    if (!panel || !panel.style) return;
    var fallback = Number(fallbackValue);
    if (!isFinite(fallback)) fallback = 1.0;
    if (fallback < 0) fallback = 0;
    if (fallback > 1) fallback = 1;
    var next = Number(opacityValue);
    if (!isFinite(next)) next = fallback;
    if (next < 0) next = 0;
    if (next > 1) next = 1;
    panel.style.opacity = next.toFixed(2);
}

function GetPanelRectRelativeToContext(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    var context = $.GetContextPanel();
    var root = FindRootPanel();
    if (!context || !root) return null;
    var panelX = GetPanelXOffsetWithinAncestor(panel, root);
    var panelY = GetPanelYOffsetWithinAncestor(panel, root);
    var contextX = GetPanelXOffsetWithinAncestor(context, root);
    var contextY = GetPanelYOffsetWithinAncestor(context, root);
    if (!isFinite(panelX) || !isFinite(panelY) || !isFinite(contextX) || !isFinite(contextY)) return null;
    var width = Number(panel.actuallayoutwidth);
    var height = Number(panel.actuallayoutheight);
    if (!isFinite(width) || width < 0) width = 0;
    if (!isFinite(height) || height < 0) height = 0;
    return {
        x: Math.round(panelX - contextX),
        y: Math.round(panelY - contextY),
        width: Math.round(width),
        height: Math.round(height)
    };
}

function SetPreviewPanelPosition(panel, x, y) {
    if (!panel || !panel.style) return;
    var px = Math.round(Number(x) || 0);
    var py = Math.round(Number(y) || 0);
    panel.style.marginLeft = String(px) + "px";
    panel.style.marginTop = String(py) + "px";
}

function GetMinimapPreviewAnchorParent() {
    var contextRoot = $.GetContextPanel();
    return contextRoot || null;
}

function GetMinimapPreviewRightInsetPx() {
    var contextRoot = $.GetContextPanel();
    var searchRoot = FindRootPanel() || contextRoot;
    if (!contextRoot || !searchRoot || !searchRoot.FindChildTraverse) return 0;

    var minimapPersp = searchRoot.FindChildTraverse("minimap_persp");
    if (!minimapPersp || !minimapPersp.GetParent) return 0;
    var minimapParent = minimapPersp.GetParent();
    if (!minimapParent) return 0;

    var insetByOffset = Number(minimapParent.actualxoffset);
    if (isFinite(insetByOffset) && insetByOffset > 0) {
        return Math.round(insetByOffset);
    }

    var rootWidth = Number(contextRoot.actuallayoutwidth);
    var parentWidth = Number(minimapParent.actuallayoutwidth);
    if (!isFinite(rootWidth) || !isFinite(parentWidth) || rootWidth <= parentWidth || parentWidth <= 0) {
        return 0;
    }
    return Math.round((rootWidth - parentWidth) * 0.5);
}

function EnsureMinimapSizePreviewPanel() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        var anchorParent = GetMinimapPreviewAnchorParent();
        if (anchorParent && gMinimapSizePreviewPanel.GetParent && gMinimapSizePreviewPanel.GetParent() !== anchorParent) {
            gMinimapSizePreviewPanel.SetParent(anchorParent);
        }
        SetPanelNonInteractive(gMinimapSizePreviewPanel);
        SetPanelNonInteractive(gMinimapSizePreviewCircle);
        SetPanelNonInteractive(gMinimapSizePreviewLabel);
        return gMinimapSizePreviewPanel;
    }
    var parent = GetMinimapPreviewAnchorParent();
    if (!parent) return null;

    var panel = parent.FindChildTraverse("MinimapSizePreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", parent, "MinimapSizePreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("MinimapSizePreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "MinimapSizePreviewCircle");
    }
    var label = panel.FindChildTraverse("MinimapSizePreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "MinimapSizePreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gMinimapSizePreviewPanel = panel;
    gMinimapSizePreviewCircle = circle;
    gMinimapSizePreviewLabel = label;
    return panel;
}

function EnsureZoomMinimapPreviewPanel() {
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZoomMinimapPreviewPanel);
        SetPanelNonInteractive(gZoomMinimapPreviewCircle);
        SetPanelNonInteractive(gZoomMinimapPreviewLabel);
        return gZoomMinimapPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZoomMinimapPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZoomMinimapPreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("ZoomMinimapPreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "ZoomMinimapPreviewCircle");
    }
    var label = panel.FindChildTraverse("ZoomMinimapPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "ZoomMinimapPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gZoomMinimapPreviewPanel = panel;
    gZoomMinimapPreviewCircle = circle;
    gZoomMinimapPreviewLabel = label;
    return panel;
}

function EnsureZipBoostPreviewPanel() {
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZipBoostPreviewPanel);
        SetPanelNonInteractive(gZipBoostPreviewBox);
        SetPanelNonInteractive(gZipBoostPreviewLabel);
        return gZipBoostPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZipBoostPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZipBoostPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("ZipBoostPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "ZipBoostPreviewBox");
    }
    var label = panel.FindChildTraverse("ZipBoostPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "ZipBoostPreviewLabel");
        label.text = "ZIP BOOST";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gZipBoostPreviewPanel = panel;
    gZipBoostPreviewBox = box;
    gZipBoostPreviewLabel = label;
    return panel;
}

function EnsureUnsecuredSoulsPreviewPanel() {
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredSoulsPreviewPanel);
        SetPanelNonInteractive(gUnsecuredSoulsPreviewLabel);
        return gUnsecuredSoulsPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredSoulsPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "UnsecuredSoulsPreview");
    }
    if (!panel) return null;

    var label = panel.FindChildTraverse("UnsecuredSoulsPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "UnsecuredSoulsPreviewLabel");
        label.text = "23s";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(label);

    gUnsecuredSoulsPreviewPanel = panel;
    gUnsecuredSoulsPreviewLabel = label;
    return panel;
}

function EnsureCompassPreviewPanel() {
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gCompassPreviewPanel);
        SetPanelNonInteractive(gCompassPreviewBox);
        SetPanelNonInteractive(gCompassPreviewLabel);
        return gCompassPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("CompassPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "CompassPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("CompassPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "CompassPreviewBox");
    }

    var label = panel.FindChildTraverse("CompassPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "CompassPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gCompassPreviewPanel = panel;
    gCompassPreviewBox = box;
    gCompassPreviewLabel = label;
    return panel;
}

function EnsureKeyboardOverlayPreviewPanel() {
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gKeyboardOverlayPreviewPanel);
        SetPanelNonInteractive(gKeyboardOverlayPreviewBox);
        SetPanelNonInteractive(gKeyboardOverlayPreviewLabel);
        return gKeyboardOverlayPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("KeyboardOverlayPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "KeyboardOverlayPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("KeyboardOverlayPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "KeyboardOverlayPreviewBox");
    }

    var sample = panel.FindChildTraverse("KeyboardOverlayPreviewSample");
    if (!sample) {
        sample = $.CreatePanel("Panel", box, "KeyboardOverlayPreviewSample");
        sample.AddClass("KeyboardOverlayPreviewRow");

        var k1 = $.CreatePanel("Panel", sample, "");
        k1.AddClass("KeyboardOverlayPreviewKey");
        k1.AddClass("Wide");

        var k2 = $.CreatePanel("Panel", sample, "");
        k2.AddClass("KeyboardOverlayPreviewKey");

        var k3 = $.CreatePanel("Panel", sample, "");
        k3.AddClass("KeyboardOverlayPreviewKey");

        var k4 = $.CreatePanel("Panel", sample, "");
        k4.AddClass("KeyboardOverlayPreviewKey");
        k4.AddClass("Wide");

        var k5 = $.CreatePanel("Panel", sample, "");
        k5.AddClass("KeyboardOverlayPreviewKey");
        k5.AddClass("Spacer");
    }

    var label = panel.FindChildTraverse("KeyboardOverlayPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "KeyboardOverlayPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(sample);
    SetPanelNonInteractive(label);

    gKeyboardOverlayPreviewPanel = panel;
    gKeyboardOverlayPreviewBox = box;
    gKeyboardOverlayPreviewLabel = label;
    return panel;
}

function EnsureItemCooldownPreviewPanel() {
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gItemCooldownPreviewPanel);
        SetPanelNonInteractive(gItemCooldownPreviewRow);
        SetPanelNonInteractive(gItemCooldownPreviewIcon);
        SetPanelNonInteractive(gItemCooldownPreviewLabel);
        return gItemCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ItemCooldownPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ItemCooldownPreview");
    }
    if (!panel) return null;

    var row = panel.FindChildTraverse("ItemCooldownPreviewRow");
    if (!row) {
        row = $.CreatePanel("Panel", panel, "ItemCooldownPreviewRow");
    }

    var icon = panel.FindChildTraverse("ItemCooldownPreviewIcon");
    if (!icon) {
        icon = $.CreatePanel("Panel", row, "ItemCooldownPreviewIcon");
    }

    var modContainer = panel.FindChildTraverse("ItemCooldownPreviewModContainer");
    if (!modContainer) {
        modContainer = $.CreatePanel("Panel", icon, "ItemCooldownPreviewModContainer");
    }

    var bg = panel.FindChildTraverse("ItemCooldownPreviewBg");
    if (!bg) {
        bg = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewBg");
    }

    var image = panel.FindChildTraverse("ItemCooldownPreviewImage");
    if (!image) {
        image = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewImage");
    }

    var mask = panel.FindChildTraverse("ItemCooldownPreviewMask");
    if (!mask) {
        mask = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewMask");
    }

    var label = panel.FindChildTraverse("ItemCooldownPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", icon, "ItemCooldownPreviewLabel");
        label.text = "7";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(row);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(modContainer);
    SetPanelNonInteractive(bg);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(mask);
    SetPanelNonInteractive(label);

    gItemCooldownPreviewPanel = panel;
    gItemCooldownPreviewRow = row;
    gItemCooldownPreviewIcon = icon;
    gItemCooldownPreviewLabel = label;
    return panel;
}

function EnsureAmmoPreviewPanel() {
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gAmmoPreviewPanel);
        SetPanelNonInteractive(gAmmoPreviewCurrentLabel);
        SetPanelNonInteractive(gAmmoPreviewTotalLabel);
        return gAmmoPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("AmmoPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "AmmoPreview");
    if (!panel) return null;

    var currentLabel = panel.FindChildTraverse("AmmoPreviewCurrent");
    if (!currentLabel) currentLabel = $.CreatePanel("Label", panel, "AmmoPreviewCurrent");
    var totalLabel = panel.FindChildTraverse("AmmoPreviewTotal");
    if (!totalLabel) totalLabel = $.CreatePanel("Label", panel, "AmmoPreviewTotal");

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(currentLabel);
    SetPanelNonInteractive(totalLabel);

    gAmmoPreviewPanel = panel;
    gAmmoPreviewCurrentLabel = currentLabel;
    gAmmoPreviewTotalLabel = totalLabel;
    return panel;
}

function EnsureReloadCooldownPreviewPanel() {
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gReloadCooldownPreviewPanel);
        SetPanelNonInteractive(gReloadCooldownPreviewRing);
        SetPanelNonInteractive(gReloadCooldownPreviewLabel);
        return gReloadCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ReloadCooldownPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ReloadCooldownPreview");
    if (!panel) return null;

    var ring = panel.FindChildTraverse("ReloadCooldownPreviewRing");
    if (!ring) ring = $.CreatePanel("Panel", panel, "ReloadCooldownPreviewRing");
    var label = panel.FindChildTraverse("ReloadCooldownPreviewLabel");
    if (!label) label = $.CreatePanel("Label", ring, "ReloadCooldownPreviewLabel");
    if (label && !label.text) label.text = "1.3";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(ring);
    SetPanelNonInteractive(label);

    gReloadCooldownPreviewPanel = panel;
    gReloadCooldownPreviewRing = ring;
    gReloadCooldownPreviewLabel = label;
    return panel;
}

function EnsureUnitTargetPreviewPanel() {
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnitTargetPreviewPanel);
        SetPanelNonInteractive(gUnitTargetPreviewImage);
        SetPanelNonInteractive(gUnitTargetPreviewBinding);
        return gUnitTargetPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnitTargetPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnitTargetPreview");
    if (!panel) return null;

    var image = panel.FindChildTraverse("UnitTargetPreviewImage");
    if (!image) image = $.CreatePanel("Panel", panel, "UnitTargetPreviewImage");
    var binding = panel.FindChildTraverse("UnitTargetPreviewBinding");
    if (!binding) binding = $.CreatePanel("Label", panel, "UnitTargetPreviewBinding");
    if (binding) binding.text = "Q";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(binding);

    gUnitTargetPreviewPanel = panel;
    gUnitTargetPreviewImage = image;
    gUnitTargetPreviewBinding = binding;
    return panel;
}

function EnsureDamageReportPreviewPanel() {
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gDamageReportPreviewPanel);
        SetPanelNonInteractive(gDamageReportPreviewBox);
        SetPanelNonInteractive(gDamageReportPreviewLabel);
        return gDamageReportPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("DamageReportPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "DamageReportPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("DamageReportPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "DamageReportPreviewBox");
    var label = panel.FindChildTraverse("DamageReportPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "DamageReportPreviewLabel");
    if (label && !label.text) label.text = "DAMAGE REPORT";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gDamageReportPreviewPanel = panel;
    gDamageReportPreviewBox = box;
    gDamageReportPreviewLabel = label;
    return panel;
}

function EnsureShopPreviewPanel() {
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gShopPreviewPanel);
        SetPanelNonInteractive(gShopPreviewBox);
        SetPanelNonInteractive(gShopPreviewLabel);
        return gShopPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ShopPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ShopPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("ShopPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "ShopPreviewBox");
    var label = panel.FindChildTraverse("ShopPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "ShopPreviewLabel");
    if (label && !label.text) label.text = "SHOP";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gShopPreviewPanel = panel;
    gShopPreviewBox = box;
    gShopPreviewLabel = label;
    return panel;
}

function EnsureUltCooldownPreviewPanel() {
    if (gUltCooldownPreviewPanel && gUltCooldownPreviewPanel.IsValid && gUltCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUltCooldownPreviewPanel);
        SetPanelNonInteractive(gUltCooldownPreviewRow);
        return gUltCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UltCooldownPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UltCooldownPreview");
    if (!panel) return null;

    var row = panel.FindChildTraverse("UltCooldownPreviewRow");
    if (!row) row = $.CreatePanel("Panel", panel, "UltCooldownPreviewRow");
    if (row) {
        for (var i = row.GetChildCount(); i < 3; i++) {
            var chip = $.CreatePanel("Panel", row, "");
            chip.AddClass("UltCooldownPreviewChip");
            var chipText = $.CreatePanel("Label", chip, "");
            chipText.AddClass("UltCooldownPreviewChipText");
            chipText.text = String((i + 1) * 7);
        }
    }

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(row);
    if (row && row.GetChildCount) {
        for (var ci = 0; ci < row.GetChildCount(); ci++) {
            var child = row.GetChild(ci);
            SetPanelNonInteractive(child);
            if (child && child.GetChildCount && child.GetChildCount() > 0) {
                SetPanelNonInteractive(child.GetChild(0));
            }
        }
    }

    gUltCooldownPreviewPanel = panel;
    gUltCooldownPreviewRow = row;
    return panel;
}

function EnsureUnsecuredPlusPreviewPanel() {
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredPlusPreviewPanel);
        SetPanelNonInteractive(gUnsecuredPlusPreviewIcon);
        SetPanelNonInteractive(gUnsecuredPlusPreviewText);
        SetPanelNonInteractive(gUnsecuredPlusPreviewValue);
        return gUnsecuredPlusPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredPlusPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnsecuredPlusPreview");
    if (!panel) return null;

    var icon = panel.FindChildTraverse("UnsecuredPlusPreviewIcon");
    if (!icon) icon = $.CreatePanel("Panel", panel, "UnsecuredPlusPreviewIcon");
    var text = panel.FindChildTraverse("UnsecuredPlusPreviewText");
    if (!text) text = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewText");
    var value = panel.FindChildTraverse("UnsecuredPlusPreviewValue");
    if (!value) value = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewValue");
    if (text && !text.text) text.text = "UNSECURED";
    if (value && !value.text) value.text = "538";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(text);
    SetPanelNonInteractive(value);

    gUnsecuredPlusPreviewPanel = panel;
    gUnsecuredPlusPreviewIcon = icon;
    gUnsecuredPlusPreviewText = text;
    gUnsecuredPlusPreviewValue = value;
    return panel;
}

function GetMinimapPreviewDiameter(sizePx) {
    return Math.round(Math.max(50, Math.min(1200, Number(sizePx) || 0)));
}

function IsMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_SMALL_SIZE" ||
        configId === "MINIMAP_X_OFFSET" ||
        configId === "MINIMAP_Y_OFFSET" ||
        configId === "MINIMAP_BASE_OPACITY" ||
        configId === "MINIMAL_MINIMAP_OPACITY";
}

function IsZoomMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_LARGE_SIZE" ||
        configId === "ZOOM_X_OFFSET" ||
        configId === "ZOOM_Y_OFFSET" ||
        configId === "MINIMAP_LARGE_SIZE_ALT" ||
        configId === "ZOOM_X_OFFSET_ALT" ||
        configId === "ZOOM_Y_OFFSET_ALT" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB" ||
        configId === "ALT_ZOOM_OPACITY" ||
        configId === "TAB_ZOOM_OPACITY";
}

function GetZoomPreviewModeForConfigId(configId) {
    if (configId === "TAB_ZOOM_OPACITY" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB") {
        return "TAB";
    }
    return "ALT";
}

function GetZoomConfigKeysForMode(mode) {
    if (mode === "TAB") {
        return {
            size: "MINIMAP_LARGE_SIZE_TAB",
            x: "ZOOM_X_OFFSET_TAB",
            y: "ZOOM_Y_OFFSET_TAB",
            opacity: "TAB_ZOOM_OPACITY"
        };
    }
    return {
        size: "MINIMAP_LARGE_SIZE_ALT",
        x: "ZOOM_X_OFFSET_ALT",
        y: "ZOOM_Y_OFFSET_ALT",
        opacity: "ALT_ZOOM_OPACITY"
    };
}

function MigrateSplitZoomKeys(configTarget, sourceConfig) {
    if (!configTarget) return;
    var source = sourceConfig || configTarget;
    var hasOwn = Object.prototype.hasOwnProperty;

    function assignIfMissing(newKey, legacyKey) {
        var hasNewInSource = source && hasOwn.call(source, newKey);
        var hasLegacyInTarget = configTarget[legacyKey] !== undefined && configTarget[legacyKey] !== null;
        if (!hasLegacyInTarget) return;
        if (hasNewInSource && configTarget[newKey] !== undefined && configTarget[newKey] !== null) return;
        configTarget[newKey] = configTarget[legacyKey];
    }

    assignIfMissing("MINIMAP_LARGE_SIZE_ALT", "MINIMAP_LARGE_SIZE");
    assignIfMissing("ZOOM_X_OFFSET_ALT", "ZOOM_X_OFFSET");
    assignIfMissing("ZOOM_Y_OFFSET_ALT", "ZOOM_Y_OFFSET");
    assignIfMissing("MINIMAP_LARGE_SIZE_TAB", "MINIMAP_LARGE_SIZE");
    assignIfMissing("ZOOM_X_OFFSET_TAB", "ZOOM_X_OFFSET");
    assignIfMissing("ZOOM_Y_OFFSET_TAB", "ZOOM_Y_OFFSET");
}

function NormalizeNeutralCampFlags(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeNeutralCampTierConfig === "function") {
        utils.NormalizeNeutralCampTierConfig(configTarget, sourceConfig);
    }
}

function NormalizeItemCooldownModeConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeItemCooldownModeConfig === "function") {
        utils.NormalizeItemCooldownModeConfig(configTarget, sourceConfig);
    }
}

function NormalizeAmmoScaleConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeAmmoScaleConfig === "function") {
        utils.NormalizeAmmoScaleConfig(configTarget, sourceConfig);
    }
}

function NormalizeVoiceTypeValue(rawValue) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeVoiceTypeValue === "function") {
        return utils.NormalizeVoiceTypeValue(rawValue);
    }
    var asInt = Math.round(Number(rawValue));
    if (asInt === 4 || asInt === 0 || asInt === 5 || asInt === 6 || asInt === 7 || asInt === 8) return asInt;
    return 0;
}

function ResolveCustomAnnouncerMetaField(source, keyList) {
    if (!source || !keyList || !keyList.length) return "";
    for (var i = 0; i < keyList.length; i++) {
        var key = String(keyList[i] || "");
        if (!key) continue;
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        var value = String(source[key] == null ? "" : source[key]).trim();
        if (value.length > 0) return value;
    }
    return "";
}

function ResolveCustomAnnouncerSlotScriptMetadata(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var source = null;
    var globalKey = "QOL_CUSTOM_ANNOUNCER_SLOT" + String(safeIndex) + "_META";
    var registryKey = String(safeIndex);

    try {
        if (typeof globalThis === "object" && globalThis) {
            var registry = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS;
            if (registry && typeof registry === "object") {
                if (Object.prototype.hasOwnProperty.call(registry, registryKey)) {
                    source = registry[registryKey];
                } else if (Object.prototype.hasOwnProperty.call(registry, safeIndex)) {
                    source = registry[safeIndex];
                }
            }
            if (!source) {
                source = globalThis[globalKey];
            }
        }
    } catch (e0) {
        source = null;
    }

    return {
        name: ResolveCustomAnnouncerMetaField(source, ["name", "Name", "NAME"]),
        author: ResolveCustomAnnouncerMetaField(source, ["author", "Author", "AUTHOR"]),
        voiceActor: ResolveCustomAnnouncerMetaField(source, ["voiceActor", "voice_actor", "VoiceActor", "Voice_Actor", "voice actor", "Voice Actor", "VOICE_ACTOR"])
    };
}

function ResolveCustomAnnouncerSlotLabel(slotIndex, fallbackLabel) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var scriptMeta = ResolveCustomAnnouncerSlotScriptMetadata(safeIndex);
    if (scriptMeta && scriptMeta.name) return scriptMeta.name;
    return String(fallbackLabel || ("Custom Slot " + String(safeIndex)));
}

function ResolveCustomAnnouncerSlotMetadata(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var scriptMeta = ResolveCustomAnnouncerSlotScriptMetadata(safeIndex);
    return {
        name: String(scriptMeta && scriptMeta.name ? scriptMeta.name : ""),
        author: String(scriptMeta && scriptMeta.author ? scriptMeta.author : ""),
        voiceActor: String(scriptMeta && scriptMeta.voiceActor ? scriptMeta.voiceActor : "")
    };
}

function GetCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType) {
    var voiceType = NormalizeVoiceTypeValue(rawVoiceType);
    if (voiceType === 0) return 1;
    if (voiceType === 5) return 2;
    if (voiceType === 6) return 3;
    if (voiceType === 7) return 4;
    if (voiceType === 8) return 5;
    return 0;
}

function GetCustomAnnouncerSlotIndexFromOptionValue(optionValue) {
    var asInt = Math.round(Number(optionValue));
    if (!isFinite(asInt)) return 0;
    if (asInt === 0) return 1;
    if (asInt === 5) return 2;
    if (asInt === 6) return 3;
    if (asInt === 7) return 4;
    if (asInt === 8) return 5;
    return 0;
}

function BuildCustomAnnouncerSlotMetadataTooltipText(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var slotMeta = ResolveCustomAnnouncerSlotMetadata(safeIndex);
    var authorText = String(slotMeta && slotMeta.author ? slotMeta.author : "").trim();
    var voiceActorText = String(slotMeta && slotMeta.voiceActor ? slotMeta.voiceActor : "").trim();
    var lines = [];
    if (authorText.length > 0) lines.push("Author: " + authorText);
    if (voiceActorText.length > 0) lines.push("Voice Actor: " + voiceActorText);
    return lines.join("\n");
}

function BuildCustomAnnouncerSlotMetadataHoverInfo(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var slotMeta = ResolveCustomAnnouncerSlotMetadata(safeIndex);
    var authorText = String(slotMeta && slotMeta.author ? slotMeta.author : "").trim();
    var voiceActorText = String(slotMeta && slotMeta.voiceActor ? slotMeta.voiceActor : "").trim();
    return {
        author: authorText,
        voiceActor: voiceActorText
    };
}

function BuildCustomAnnouncerVoiceDescription(baseDescription, rawVoiceType) {
    var base = String(baseDescription || "");
    var slotIndex = GetCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType);
    if (slotIndex <= 0) return base;

    var lines = [];
    if (base) lines.push(base);
    var slotMetaText = BuildCustomAnnouncerSlotMetadataTooltipText(slotIndex);
    if (slotMetaText) lines.push(slotMetaText);
    return lines.join("\n");
}

function BuildVoiceDropdownOptions() {
    return [
        { label: "Beep", value: 4 },
        { label: ResolveCustomAnnouncerSlotLabel(1, "Custom Slot 1"), value: 0 },
        { label: ResolveCustomAnnouncerSlotLabel(2, "Custom Slot 2"), value: 5 },
        { label: ResolveCustomAnnouncerSlotLabel(3, "Custom Slot 3"), value: 6 },
        { label: ResolveCustomAnnouncerSlotLabel(4, "Custom Slot 4"), value: 7 },
        { label: ResolveCustomAnnouncerSlotLabel(5, "Custom Slot 5"), value: 8 }
    ];
}

function NormalizeVoiceVolumeValue(rawValue) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeVoiceVolumeValue === "function") {
        return utils.NormalizeVoiceVolumeValue(rawValue);
    }
    var asInt = Math.round(Number(rawValue));
    if (!isFinite(asInt)) asInt = 100;
    if (asInt < 0) asInt = 0;
    if (asInt > 100) asInt = 100;
    return asInt;
}

function NormalizeBridgeBuffFilterConfig(configTarget) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeBridgeBuffFilterConfig === "function") {
        utils.NormalizeBridgeBuffFilterConfig(configTarget);
    }
}

function NormalizeVoiceTypeConfig(configTarget) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeVoiceTypeConfig === "function") {
        utils.NormalizeVoiceTypeConfig(configTarget);
        return;
    }
    if (!configTarget) return;
    configTarget.VOICE_TYPE = NormalizeVoiceTypeValue(configTarget.VOICE_TYPE);
}

function NormalizeHealthbarTypeValue(rawValue) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeHealthbarTypeValue === "function") {
        return utils.NormalizeHealthbarTypeValue(rawValue);
    }
    return Math.round(Number(rawValue)) || 0;
}

function NormalizeHealthbarTypeConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeHealthbarTypeConfig === "function") {
        utils.NormalizeHealthbarTypeConfig(configTarget, sourceConfig);
    }
}

function NormalizeColorWarningConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeColorWarningConfig === "function") {
        utils.NormalizeColorWarningConfig(configTarget, sourceConfig);
    }
}

function NormalizeEnemyColorWarningConfig(configTarget, sourceConfig) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.NormalizeEnemyColorWarningConfig === "function") {
        utils.NormalizeEnemyColorWarningConfig(configTarget, sourceConfig);
    }
}

function IsZipBoostPreviewConfig(configId) {
    return configId === "ZIP_BOOST_X_OFFSET" ||
        configId === "ZIP_BOOST_Y_OFFSET" ||
        configId === "ZIP_BOOST_SCALE";
}

function IsUnsecuredSoulsPreviewConfig(configId) {
    return configId === "ENABLE_UNSECURED_SOUL_TIMER" ||
        configId === "UNSECURED_SOUL_TIMER_X_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_Y_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_SCALE";
}

function IsCompassPreviewConfig(configId) {
    return configId === "COMPASS_SCALE" ||
        configId === "COMPASS_X_OFFSET" ||
        configId === "COMPASS_Y_OFFSET" ||
        configId === "COMPASS_STRETCH_X" ||
        configId === "COMPASS_STRETCH_Y";
}

function IsKeyboardOverlayPreviewConfig(configId) {
    return configId === "KEYBOARD_OVERLAY_SCALE" ||
        configId === "KEYBOARD_OVERLAY_X_OFFSET" ||
        configId === "KEYBOARD_OVERLAY_Y_OFFSET";
}

function IsItemCooldownPreviewConfig(configId) {
    return configId === "PASSIVE_COOLDOWN_SIZE" ||
        configId === "PASSIVE_COOLDOWN_X" ||
        configId === "PASSIVE_COOLDOWN_Y" ||
        configId === "PASSIVE_COOLDOWN_OPACITY";
}

function IsAdvancedItemCooldownModeEnabled() {
    return Number(MOD_CONFIG.ENABLE_OLD_ITEM_COOLDOWNS) !== 1;
}

const ENABLE_AMMO_PREVIEW = false;
function IsAmmoPreviewConfig(configId) {
    if (!ENABLE_AMMO_PREVIEW) return false;
    return configId === "AMMO_CURRENT_SCALE" ||
        configId === "AMMO_TOTAL_SCALE" ||
        configId === "AMMO_PANEL_X_OFFSET" ||
        configId === "AMMO_PANEL_Y_OFFSET";
}

function IsReloadCooldownPreviewConfig(configId) {
    return configId === "RELOAD_COOLDOWN_SIZE" ||
        configId === "RELOAD_COOLDOWN_OPACITY" ||
        configId === "RELOAD_COOLDOWN_X_OFFSET" ||
        configId === "RELOAD_COOLDOWN_Y_OFFSET";
}

function IsUnitTargetPreviewConfig(configId) {
    return configId === "UNIT_TARGET_SIZE" ||
        configId === "UNIT_TARGET_OPACITY" ||
        configId === "ENABLE_RED_DIAMOND" ||
        configId === "ENABLE_IMPROVED_HINT";
}

function IsDamageReportPreviewConfig(configId) {
    return configId === "DAMAGE_REPORT_X_OFFSET" ||
        configId === "DAMAGE_REPORT_Y_OFFSET" ||
        configId === "DISABLE_DAMAGE_REPORT";
}

function IsShopPreviewConfig(configId) {
    return configId === "SHOP_OFFSET_X";
}

function IsUltCooldownPreviewConfig(configId) {
    return configId === "ULT_COOLDOWN_SIZE" ||
        configId === "ULT_COOLDOWN_OPACITY";
}

function IsUnsecuredPlusPreviewConfig(configId) {
    return configId === "UNSECURED_SOULS_HUD_SCALE" ||
        configId === "UNSECURED_SOULS_HUD_X_OFFSET" ||
        configId === "UNSECURED_SOULS_HUD_Y_OFFSET" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_ICON" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_TEXT";
}

function HideMinimapSizePreview() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        gMinimapSizePreviewPanel.RemoveClass("Visible");
    }
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        gZoomMinimapPreviewPanel.RemoveClass("Visible");
    }
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        gZipBoostPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
    }
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        gCompassPreviewPanel.RemoveClass("Visible");
    }
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
    }
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        gItemCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        gAmmoPreviewPanel.RemoveClass("Visible");
    }
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        gReloadCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        gUnitTargetPreviewPanel.RemoveClass("Visible");
    }
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        gDamageReportPreviewPanel.RemoveClass("Visible");
    }
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        gShopPreviewPanel.RemoveClass("Visible");
    }
    if (gUltCooldownPreviewPanel && gUltCooldownPreviewPanel.IsValid && gUltCooldownPreviewPanel.IsValid()) {
        gUltCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
    }
}

function ScheduleHideMinimapSizePreview(delaySec) {
    gMinimapSizePreviewHideToken++;
    var token = gMinimapSizePreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gMinimapSizePreviewHideToken) return;
        HideMinimapSizePreview();
    });
}

function ScheduleHideZoomMinimapPreview(delaySec) {
    gZoomMinimapPreviewHideToken++;
    var token = gZoomMinimapPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZoomMinimapPreviewHideToken) return;
        if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
            gZoomMinimapPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideZipBoostPreview(delaySec) {
    gZipBoostPreviewHideToken++;
    var token = gZipBoostPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZipBoostPreviewHideToken) return;
        if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
            gZipBoostPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredSoulsPreview(delaySec) {
    gUnsecuredSoulsPreviewHideToken++;
    var token = gUnsecuredSoulsPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredSoulsPreviewHideToken) return;
        if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
            gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideCompassPreview(delaySec) {
    gCompassPreviewHideToken++;
    var token = gCompassPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gCompassPreviewHideToken) return;
        if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
            gCompassPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideKeyboardOverlayPreview(delaySec) {
    gKeyboardOverlayPreviewHideToken++;
    var token = gKeyboardOverlayPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gKeyboardOverlayPreviewHideToken) return;
        if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
            gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideItemCooldownPreview(delaySec) {
    gItemCooldownPreviewHideToken++;
    var token = gItemCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gItemCooldownPreviewHideToken) return;
        if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
            gItemCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ShowMinimapSizePreview(sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureMinimapSizePreviewPanel();
    if (!panel || !gMinimapSizePreviewCircle || !gMinimapSizePreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_SMALL_SIZE) || 0);
    if (sizeVal <= 0) return;
    var xOffset = Math.round(Number(MOD_CONFIG.MINIMAP_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.MINIMAP_Y_OFFSET) || 0);
    var opacityVal = Number(MOD_CONFIG.MINIMAP_BASE_OPACITY);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gMinimapSizePreviewCircle.style.width = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.height = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.opacity = opacityVal.toFixed(2);
    var rightInset = GetMinimapPreviewRightInsetPx();
    panel.style.marginRight = (gMinimapPreviewBaseRight - xOffset + rightInset) + "px";
    panel.style.marginBottom = (gMinimapPreviewBaseBottom + yOffset) + "px";
    gMinimapSizePreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideMinimapSizePreview(1.2);
}

function ShowZoomMinimapPreview(mode, sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (typeof mode !== "string") {
        sizePx = mode;
        mode = gZoomPreviewMode;
    }
    mode = (mode === "TAB") ? "TAB" : "ALT";
    gZoomPreviewMode = mode;
    var keys = GetZoomConfigKeysForMode(mode);

    var panel = EnsureZoomMinimapPreviewPanel();
    if (!panel || !gZoomMinimapPreviewCircle || !gZoomMinimapPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG[keys.size]) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_LARGE_SIZE) || 0);
    if (sizeVal <= 0) return;

    var zoomX = Math.round(Number(MOD_CONFIG[keys.x]) || 0);
    var zoomY = Math.round(Number(MOD_CONFIG[keys.y]) || 0);

    var opacityVal = Number(MOD_CONFIG[keys.opacity]);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gZoomMinimapPreviewCircle.style.width = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.height = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.opacity = opacityVal.toFixed(2);
    panel.style.marginLeft = (gZoomPreviewBaseX + zoomX) + "px";
    panel.style.marginTop = (gZoomPreviewBaseY - zoomY) + "px";
    gZoomMinimapPreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideZoomMinimapPreview(1.2);
}

function ShowZipBoostPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureZipBoostPreviewPanel();
    if (!panel || !gZipBoostPreviewBox || !gZipBoostPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.ZIP_BOOST_SCALE) || 100);

    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < 0) yOffset = 0;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;

    panel.style.marginLeft = (gZipBoostPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gZipBoostPreviewBaseY + yOffset) + "px";
    gZipBoostPreviewBox.style.preTransformScale2d = (scale / 100).toFixed(2);
    gZipBoostPreviewLabel.text = "ZIP BOOST " + scale + "%";
    panel.AddClass("Visible");
    ScheduleHideZipBoostPreview(1.2);
}

function ShowUnsecuredSoulsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredSoulsPreviewPanel();
    if (!panel || !gUnsecuredSoulsPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_SCALE) || 100);
    var enabled = Number(MOD_CONFIG.ENABLE_UNSECURED_SOUL_TIMER) === 1;

    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -100) yOffset = -100;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var fontPx = Math.round(16 * (scale / 100));
    if (fontPx < 8) fontPx = 8;
    if (fontPx > 72) fontPx = 72;
    var fontSize = fontPx + "px";

    panel.style.marginLeft = (gUnsecuredSoulsPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gUnsecuredSoulsPreviewBaseY + yOffset) + "px";
    if (panel.style.preTransformScale2d !== "1.00") {
        panel.style.preTransformScale2d = "1.00";
    }
    if (gUnsecuredSoulsPreviewLabel.style.fontSize !== fontSize) {
        gUnsecuredSoulsPreviewLabel.style.fontSize = fontSize;
    }
    gUnsecuredSoulsPreviewLabel.text = enabled ? "23s" : "SAFE";
    panel.AddClass("Visible");
    ScheduleHideUnsecuredSoulsPreview(1.2);
}

function ShowConfigPreviewForConfigId(configId) {
    if (IsMinimapPreviewConfig(configId)) {
        ShowMinimapSizePreview(MOD_CONFIG.MINIMAP_SMALL_SIZE);
    }
    if (IsZoomMinimapPreviewConfig(configId)) {
        gZoomPreviewMode = GetZoomPreviewModeForConfigId(configId);
        ShowZoomMinimapPreview(gZoomPreviewMode);
    }
    if (IsZipBoostPreviewConfig(configId)) {
        ShowZipBoostPreview();
    }
    if (IsUnsecuredSoulsPreviewConfig(configId)) {
        ShowUnsecuredSoulsPreview();
    }
    if (IsCompassPreviewConfig(configId)) {
        ShowCompassPreview();
    }
    if (IsKeyboardOverlayPreviewConfig(configId)) {
        ShowKeyboardOverlayPreview();
    }
    if (IsItemCooldownPreviewConfig(configId)) {
        ShowItemCooldownPreview();
    }
    if (IsAmmoPreviewConfig(configId)) {
        ShowAmmoPreview();
    }
    if (IsReloadCooldownPreviewConfig(configId)) {
        ShowReloadCooldownPreview();
    }
    if (IsUnitTargetPreviewConfig(configId)) {
        ShowUnitTargetPreview();
    }
    if (IsDamageReportPreviewConfig(configId)) {
        ShowDamageReportPreview();
    }
    if (IsShopPreviewConfig(configId)) {
        ShowShopPreview();
    }
    if (IsUltCooldownPreviewConfig(configId)) {
        ShowUltCooldownPreview();
    }
    if (IsUnsecuredPlusPreviewConfig(configId)) {
        ShowUnsecuredPlusPreview();
    }
}

function ShowCompassPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureCompassPreviewPanel();
    if (!panel || !gCompassPreviewBox) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var scale = Math.round(Number(MOD_CONFIG.COMPASS_SCALE) || 100);
    var stretchX = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_X) || 100);
    var stretchY = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_Y) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.COMPASS_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.COMPASS_Y_OFFSET) || 120);
    var showSpeed = (MOD_CONFIG.ENABLE_COMPASS_SPEED !== 0);

    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    if (stretchX < 50) stretchX = 50;
    if (stretchX > 200) stretchX = 200;
    if (stretchY < 50) stretchY = 50;
    if (stretchY > 200) stretchY = 200;
    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < -1000) yOffset = -1000;
    if (yOffset > 300) yOffset = 300;

    panel.style.marginLeft = (gCompassPreviewBaseX + xOffset) + "px";
    var compassBaselineY = Number(DEFAULT_CONFIG.COMPASS_Y_OFFSET);
    if (!isFinite(compassBaselineY)) compassBaselineY = 120;
    panel.style.marginTop = String((2 * compassBaselineY) - yOffset) + "px";

    var boxWidth = Math.round(200 * (scale / 100) * (stretchX / 100));
    var boxHeight = Math.round(50 * (scale / 100) * (stretchY / 100));
    if (boxWidth < 80) boxWidth = 80;
    if (boxHeight < 20) boxHeight = 20;

    gCompassPreviewBox.style.width = boxWidth + "px";
    gCompassPreviewBox.style.height = boxHeight + "px";

    if (gCompassPreviewLabel) {
        var speedText = showSpeed ? " SPD" : "";
        gCompassPreviewLabel.text = boxWidth + "x" + boxHeight + speedText;
    }

    panel.AddClass("Visible");
    ScheduleHideCompassPreview(1.2);
}

function ShowKeyboardOverlayPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureKeyboardOverlayPreviewPanel();
    if (!panel || !gKeyboardOverlayPreviewBox || !gKeyboardOverlayPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var scale = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_SCALE) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_Y_OFFSET) || 0);
    var kbFullLayout = Number(MOD_CONFIG.ENABLE_FULL_KEYBOARD_LAYOUT) === 1;

    if (scale < 70) scale = 70;
    if (scale > 150) scale = 150;
    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -400) yOffset = -400;
    if (yOffset > 1000) yOffset = 1000;

    var kbBaseMarginLeft = kbFullLayout ? 70 : gKeyboardOverlayPreviewBaseX;
    var kbScaleFactor = scale / 100;
    var rowDefs = kbFullLayout ? [
        [40, 40, 40, 40, 40, 40, 40],
        [53, 40, 40, 40, 40],
        [60, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 60, 133]
    ] : [
        [80, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 192]
    ];
    var kbScaledHeight = Math.max(1, Math.round(40 * kbScaleFactor));
    var kbScaledGap = Math.max(1, Math.round(1 * kbScaleFactor));
    var kbRowCount = rowDefs.length;
    var kbScaledWidth = 0;
    for (var r = 0; r < rowDefs.length; r++) {
        var row = rowDefs[r];
        var rowWidth = 0;
        for (var k = 0; k < row.length; k++) {
            rowWidth += Math.max(1, Math.round(row[k] * kbScaleFactor)) + (kbScaledGap * 2);
        }
        if (rowWidth > kbScaledWidth) kbScaledWidth = rowWidth;
    }
    var kbTotalHeight = Math.round(kbRowCount * (kbScaledHeight + (kbScaledGap * 2)));

    panel.style.marginLeft = (kbBaseMarginLeft + xOffset) + "px";
    panel.style.marginBottom = (gKeyboardOverlayPreviewBaseY + yOffset) + "px";
    gKeyboardOverlayPreviewBox.style.preTransformScale2d = "1.00";
    gKeyboardOverlayPreviewBox.style.width = kbScaledWidth + "px";
    gKeyboardOverlayPreviewBox.style.height = kbTotalHeight + "px";
    gKeyboardOverlayPreviewLabel.text = kbScaledWidth + "x" + kbTotalHeight;
    panel.AddClass("Visible");
    ScheduleHideKeyboardOverlayPreview(1.2);
}

function ShowItemCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureItemCooldownPreviewPanel();
    if (!panel || !gItemCooldownPreviewRow || !gItemCooldownPreviewIcon) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var size = Number(MOD_CONFIG.PASSIVE_COOLDOWN_SIZE);
    if (!isFinite(size)) size = 40;
    if (size < 30) size = 30;
    if (size > 60) size = 60;

    var xOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_X) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_Y) || 0);
    if (xOffset < -50) xOffset = -50;
    if (xOffset > 50) xOffset = 50;
    if (yOffset < -50) yOffset = -50;
    if (yOffset > 50) yOffset = 50;

    var opacity = Number(MOD_CONFIG.PASSIVE_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.5;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var scale = size / 40;
    if (!isFinite(scale) || scale <= 0) scale = 1.0;
    if (scale < 0.75) scale = 0.75;
    if (scale > 1.5) scale = 1.5;
    var previewBaseSizePx = 45;
    var previewSizePx = Math.round(previewBaseSizePx * scale);
    if (previewSizePx < 34) previewSizePx = 34;
    if (previewSizePx > 68) previewSizePx = 68;

    panel.style.marginLeft = xOffset + "%";
    panel.style.marginTop = (-yOffset) + "%";
    gItemCooldownPreviewIcon.style.width = previewSizePx + "px";
    gItemCooldownPreviewIcon.style.height = previewSizePx + "px";
    gItemCooldownPreviewRow.style.opacity = opacity.toFixed(2);
    if (gItemCooldownPreviewLabel) gItemCooldownPreviewLabel.text = "7";

    panel.AddClass("Visible");
    ScheduleHideItemCooldownPreview(1.2);
}

function ShowAmmoPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureAmmoPreviewPanel();
    if (!panel || !gAmmoPreviewCurrentLabel || !gAmmoPreviewTotalLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var currentScale = Math.round(Number(MOD_CONFIG.AMMO_CURRENT_SCALE));
    if (!isFinite(currentScale)) currentScale = 100;
    if (currentScale < 100) currentScale = 100;
    if (currentScale > 300) currentScale = 300;

    var totalScale = Math.round(Number(MOD_CONFIG.AMMO_TOTAL_SCALE));
    if (!isFinite(totalScale)) totalScale = 100;
    if (totalScale < 100) totalScale = 100;
    if (totalScale > 300) totalScale = 300;

    var xOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -200) xOffset = -200;
    if (xOffset > 200) xOffset = 200;

    var yOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < -200) yOffset = -200;
    if (yOffset > 200) yOffset = 200;

    var currentScaleFactor = currentScale / 100.0;
    var totalScaleFactor = totalScale / 100.0;
    var currentFontPx = Math.max(12, Math.round(16 * currentScaleFactor));
    var currentWidthPx = Math.max(24, Math.round(32 * currentScaleFactor));
    var totalFontPx = Math.max(12, Math.round(16 * totalScaleFactor));
    var totalWidthPx = Math.max(32, Math.round(50 * totalScaleFactor));
    var totalMarginLeftPx = Math.max(0, Math.round(2 * totalScaleFactor));

    var baseX = 980;
    var baseY = 820;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveAmmo = root && root.FindChildTraverse ? root.FindChildTraverse("ammo_panel") : null;
    var liveRect = GetPanelRectRelativeToContext(liveAmmo);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var targetY = anchoredToLive ? baseY : (baseY - yOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gAmmoPreviewCurrentLabel.style.fontSize = String(currentFontPx) + "px";
    gAmmoPreviewCurrentLabel.style.width = String(currentWidthPx) + "px";
    gAmmoPreviewCurrentLabel.text = "62";
    gAmmoPreviewTotalLabel.style.fontSize = String(totalFontPx) + "px";
    gAmmoPreviewTotalLabel.style.width = String(totalWidthPx) + "px";
    gAmmoPreviewTotalLabel.style.marginLeft = String(totalMarginLeftPx) + "px";
    gAmmoPreviewTotalLabel.text = "/180";

    panel.AddClass("Visible");
    ScheduleHideAmmoPreview(1.2);
}

function ShowReloadCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureReloadCooldownPreviewPanel();
    if (!panel || !gReloadCooldownPreviewRing || !gReloadCooldownPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var opacity = Number(MOD_CONFIG.RELOAD_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.6;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var size = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_SIZE));
    if (!isFinite(size)) size = 28;
    if (size < 16) size = 16;
    if (size > 60) size = 60;

    var offsetX = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -75) offsetX = -75;
    if (offsetX > 75) offsetX = 75;

    var offsetY = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -75) offsetY = -75;
    if (offsetY > 75) offsetY = 75;

    var context = $.GetContextPanel();
    var fallbackX = 950;
    var fallbackY = 510;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.52);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveReticle = null;
    if (root && root.FindChildTraverse) {
        liveReticle = root.FindChildTraverse("reticle_status") || root.FindChildTraverse("ReticleStatus");
    }
    var liveRect = GetPanelRectRelativeToContext(liveReticle);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    var ringSize = Math.max(36, Math.round(size * 2.2));
    SetPreviewPanelPosition(panel, baseX + offsetX - Math.round(ringSize * 0.5), baseY - offsetY - Math.round(ringSize * 0.5));
    gReloadCooldownPreviewRing.style.width = String(ringSize) + "px";
    gReloadCooldownPreviewRing.style.height = String(ringSize) + "px";
    SetPanelOpacitySafe(gReloadCooldownPreviewRing, opacity, 0.6);
    gReloadCooldownPreviewLabel.style.fontSize = String(size) + "px";
    gReloadCooldownPreviewLabel.text = "1.3";

    panel.AddClass("Visible");
    ScheduleHideReloadCooldownPreview(1.2);
}

function ShowUnitTargetPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnitTargetPreviewPanel();
    if (!panel || !gUnitTargetPreviewImage || !gUnitTargetPreviewBinding) return;
    if (!IsSettingsWindowVisible()) return;

    var size = Math.round(Number(MOD_CONFIG.UNIT_TARGET_SIZE));
    if (!isFinite(size)) size = 150;
    if (size < 50) size = 50;
    if (size > 300) size = 300;

    var opacity = Number(MOD_CONFIG.UNIT_TARGET_OPACITY);
    if (!isFinite(opacity)) opacity = 1.0;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var redDiamond = Number(MOD_CONFIG.ENABLE_RED_DIAMOND) === 1;
    var improvedHint = Number(MOD_CONFIG.ENABLE_IMPROVED_HINT) === 1;

    var previewSizePx = Math.max(28, Math.round(size * 0.56));
    var context = $.GetContextPanel();
    var fallbackX = 930;
    var fallbackY = 470;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.44);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = FindRootPanel();
    var liveHint = null;
    if (root && root.FindChildTraverse) {
        liveHint = root.FindChildTraverse("Citadel_AbilityHudButtonHintPanel") || root.FindChildTraverse("ability_image");
    }
    var liveRect = GetPanelRectRelativeToContext(liveHint);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    SetPreviewPanelPosition(panel, baseX - Math.round(previewSizePx * 0.5), baseY - Math.round(previewSizePx * 0.5));
    gUnitTargetPreviewImage.style.width = String(previewSizePx) + "px";
    gUnitTargetPreviewImage.style.height = String(previewSizePx) + "px";
    SetPanelOpacitySafe(gUnitTargetPreviewImage, opacity, 1.0);
    gUnitTargetPreviewImage.SetHasClass("RedDiamond", redDiamond);
    gUnitTargetPreviewImage.SetHasClass("ImprovedHint", improvedHint);
    gUnitTargetPreviewBinding.SetHasClass("ImprovedHint", improvedHint);

    panel.AddClass("Visible");
    ScheduleHideUnitTargetPreview(1.2);
}

function ShowDamageReportPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureDamageReportPreviewPanel();
    if (!panel || !gDamageReportPreviewBox || !gDamageReportPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < 0) offsetX = 0;
    if (offsetX > 2000) offsetX = 2000;
    var offsetY = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -200) offsetY = -200;
    if (offsetY > 1000) offsetY = 1000;
    var isDisabled = Number(MOD_CONFIG.DISABLE_DAMAGE_REPORT) === 1;

    var context = $.GetContextPanel();
    var fallbackX = 1120;
    var fallbackY = 390;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.58);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.36);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = FindRootPanel();
    var livePanel = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudDamageReport") : null;
    var liveRect = GetPanelRectRelativeToContext(livePanel);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + offsetX);
    var targetY = anchoredToLive ? baseY : (baseY - offsetY);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gDamageReportPreviewBox.SetHasClass("Disabled", isDisabled);
    gDamageReportPreviewLabel.text = isDisabled ? "HIDDEN" : "DAMAGE REPORT";
    panel.AddClass("Visible");
    ScheduleHideDamageReportPreview(1.2);
}

function ShowShopPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureShopPreviewPanel();
    if (!panel || !gShopPreviewBox || !gShopPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.SHOP_OFFSET_X));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -500) offsetX = -500;
    if (offsetX > 500) offsetX = 500;

    var context = $.GetContextPanel();
    var fallbackX = 240;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.08);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.12);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var heroShop = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudHeroShop") : null;
    var mainPanel = heroShop && heroShop.FindChildTraverse ? heroShop.FindChildTraverse("MainPanel") : null;
    var liveRect = GetPanelRectRelativeToContext(mainPanel || heroShop);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + offsetX);
    SetPreviewPanelPosition(panel, targetX, baseY);
    gShopPreviewLabel.text = "SHOP";
    panel.AddClass("Visible");
    ScheduleHideShopPreview(1.2);
}

function ShowUltCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUltCooldownPreviewPanel();
    if (!panel || !gUltCooldownPreviewRow) return;
    if (!IsSettingsWindowVisible()) return;

    var opacity = Number(MOD_CONFIG.ULT_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.9;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;
    var size = Math.round(Number(MOD_CONFIG.ULT_COOLDOWN_SIZE));
    if (!isFinite(size)) size = 13;
    if (size < 10) size = 10;
    if (size > 32) size = 32;

    var context = $.GetContextPanel();
    var fallbackX = 760;
    var fallbackY = 56;
    var contextW = Number(context && context.actuallayoutwidth);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.40);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var topBar = root && root.FindChildTraverse ? (root.FindChildTraverse("CitadelHudTopBar") || root.FindChildTraverse("TopBar")) : null;
    var liveRect = GetPanelRectRelativeToContext(topBar);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.38);
        baseY = liveRect.y + 10;
    }
    SetPreviewPanelPosition(panel, baseX, baseY);

    SetPanelOpacitySafe(gUltCooldownPreviewRow, opacity, 0.9);
    for (var i = 0; i < gUltCooldownPreviewRow.GetChildCount(); i++) {
        var chip = gUltCooldownPreviewRow.GetChild(i);
        if (!chip) continue;
        var chipWidth = Math.max(28, Math.round(size * 2.8));
        var chipHeight = Math.max(18, Math.round(size * 1.7));
        chip.style.width = String(chipWidth) + "px";
        chip.style.height = String(chipHeight) + "px";
        var chipLabel = chip.GetChildCount && chip.GetChildCount() > 0 ? chip.GetChild(0) : null;
        if (chipLabel) {
            chipLabel.style.fontSize = String(size) + "px";
            chipLabel.text = (i === 0) ? "8" : ((i === 1) ? "22" : "RDY");
        }
    }

    panel.AddClass("Visible");
    ScheduleHideUltCooldownPreview(1.2);
}

function ShowUnsecuredPlusPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredPlusPreviewPanel();
    if (!panel || !gUnsecuredPlusPreviewIcon || !gUnsecuredPlusPreviewText || !gUnsecuredPlusPreviewValue) return;
    if (!IsSettingsWindowVisible()) return;

    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_SCALE));
    if (!isFinite(scale)) scale = 100;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -1000) xOffset = -1000;
    if (xOffset > 2000) xOffset = 2000;
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < 800) yOffset = 800;
    if (yOffset > 2000) yOffset = 2000;

    var showIcon = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_ICON) === 1;
    var showText = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_TEXT) === 1;
    var fontPx = Math.max(8, Math.min(72, Math.round(14 * (scale / 100))));

    var context = $.GetContextPanel();
    var fallbackX = 780;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.42);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = FindRootPanel();
    var liveOverlay = root && root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
    var liveRect = GetPanelRectRelativeToContext(liveOverlay);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var unsecuredHudBaselineY = Number(DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET);
    if (!isFinite(unsecuredHudBaselineY)) unsecuredHudBaselineY = 0;
    var reflectedYOffset = (2 * unsecuredHudBaselineY) - yOffset;
    var targetY = anchoredToLive ? baseY : (baseY + reflectedYOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gUnsecuredPlusPreviewIcon.style.visibility = showIcon ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.visibility = showText ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.text = "538";

    panel.AddClass("Visible");
    ScheduleHideUnsecuredPlusPreview(1.2);
}

function EncodeBase64Raw(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.EncodeBase64Raw === "function") {
        return QOL_CODEC.EncodeBase64Raw(str);
    }
    return "";
}

function EncodeBase64(str) {
    var raw = EncodeBase64Raw(str);
    return raw && raw.length > 0 ? raw.match(/.{1,40}/g).join(" ") : "";
}

function DecodeBase64(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DecodeBase64 === "function") {
        return QOL_CODEC.DecodeBase64(str);
    }
    return "";
}

const COMPACT_SCHEMA_V2 = [
    { key: "MINIMAP_SMALL_SIZE", min: 200, max: 1000, step: 5 },
    { key: "MINIMAP_BASE_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "MINIMAL_MINIMAP", min: 0, max: 1, step: 1 },
    { key: "MINIMAP_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "MINIMAP_Y_OFFSET", min: -100, max: 1000, step: 5 },
    { key: "MINIMAP_LARGE_SIZE", min: 400, max: 1200, step: 10 },
    { key: "ZOOM_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "ZOOM_Y_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "ENABLE_ALT_ZOOM", min: 0, max: 1, step: 1 },
    { key: "ALT_ZOOM_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_TAB_ZOOM", min: 0, max: 1, step: 1 },
    { key: "TAB_ZOOM_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_ONE_TIME", min: 0, max: 1, step: 1 },
    { key: "ENABLE_INTERVAL", min: 0, max: 1, step: 1 },
    { key: "BRIDGE_BUFF_START", min: 0, max: 60, step: 1 },
    { key: "ENABLE_AMMO_STATUS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_PASSIVE_COOLDOWN", min: 0, max: 1, step: 1 },
    { key: "PASSIVE_COOLDOWN_SIZE", min: 30, max: 60, step: 1 },
    { key: "PASSIVE_COOLDOWN_Y", min: -50, max: 50, step: 1 },
    { key: "PASSIVE_COOLDOWN_X", min: -50, max: 50, step: 1 },
    { key: "PASSIVE_COOLDOWN_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ITEM_FILTER_DEF_PASSIVE", min: 0, max: 1, step: 1 },
    { key: "ITEM_FILTER_OFF_PASSIVE", min: 0, max: 1, step: 1 },
    { key: "ITEM_FILTER_DEF_ACTIVE", min: 0, max: 1, step: 1 },
    { key: "ITEM_FILTER_OFF_ACTIVE", min: 0, max: 1, step: 1 },
    { key: "VOICE_TYPE", min: 0, max: 8, step: 1 },
    { key: "ENABLE_COMPASS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SIMPLIFY_COMPASS", min: 0, max: 1, step: 1 },
    { key: "COMPASS_SCALE", min: 50, max: 200, step: 1 },
    { key: "COMPASS_X_OFFSET", min: -2000, max: 2000, step: 5 },
    { key: "COMPASS_Y_OFFSET", min: -1000, max: 300, step: 5 },
    { key: "ENABLE_KEYBOARD_OVERLAY", min: 0, max: 1, step: 1 },
    { key: "ENABLE_FULL_KEYBOARD_LAYOUT", min: 0, max: 1, step: 1 },
    { key: "KEYBOARD_OVERLAY_SCALE", min: 70, max: 150, step: 1 },
    { key: "KEYBOARD_OVERLAY_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "KEYBOARD_OVERLAY_Y_OFFSET", min: -400, max: 1000, step: 5 },
    { key: "ENABLE_MINIMAP_REMINDER", min: 0, max: 1, step: 1 },
    { key: "MINIMAP_REMINDER_INTERVAL", min: 5, max: 60, step: 1 },
    { key: "DISABLE_DAMAGE_REPORT", min: 0, max: 1, step: 1 },
    { key: "DISABLE_QUICK_BUY", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HUD_SHIFT", min: 0, max: 1, step: 1 },
    { key: "SUPPORT_4_3", min: 0, max: 1, step: 1 },
    { key: "ENABLE_UNSPENT_SOULS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_MIN_SOULS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_OBJ_DMG", min: 0, max: 1, step: 1 },
    { key: "ENABLE_OBJ_MAP", min: 0, max: 1, step: 1 },
    { key: "ENABLE_URN_DIFF", min: 0, max: 1, step: 1 },
    { key: "ENABLE_MISSING_HERO", min: 0, max: 1, step: 1 },
    { key: "ENABLE_CUMULATIVE_DMG", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SHOP_STATS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SIMPLIFY_SHOP", min: 0, max: 1, step: 1 },
    { key: "DAMAGE_NUMBER_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_ZIP_BOOST", min: 0, max: 1, step: 1 },
    { key: "ZIP_BOOST_X_OFFSET", min: -2000, max: 2000, step: 5 },
    { key: "ZIP_BOOST_Y_OFFSET", min: 0, max: 1000, step: 5 },
    { key: "ENABLE_CLEAN_STACKS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_CENTER_ESC", min: 0, max: 1, step: 1 },
    { key: "HUD_INDICATOR_SIZE", min: 10, max: 60, step: 1 },
    { key: "ENABLE_RED_DIAMOND", min: 0, max: 1, step: 1 },
    { key: "UNIT_TARGET_SIZE", min: 50, max: 300, step: 5 },
    { key: "UNIT_TARGET_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_HERO_SCENE_PANEL", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HIDE_FAILED_HINT", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HIDE_ABILITY_SUGGESTION", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SIMPLIFY_ABILITY_ICONS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HIDE_BEHAVIOR_SUMMARY", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BUFF_HUD", min: 0, max: 1, step: 1 },
    { key: "ENABLE_REJUV_HUD", min: 0, max: 1, step: 1 },
    { key: "ENABLE_COLORED_HEALTHBAR", min: 0, max: 1, step: 1 }
];

const COMPACT_SCHEMA_V3 = COMPACT_SCHEMA_V2.concat([
    { key: "ENABLE_COMPASS_SPEED", min: 0, max: 1, step: 1 },
    { key: "COMPASS_STRETCH_X", min: 50, max: 200, step: 1 },
    { key: "COMPASS_STRETCH_Y", min: 50, max: 200, step: 1 },
    { key: "ZIP_BOOST_SCALE", min: 50, max: 200, step: 1 }
]);

const COMPACT_SCHEMA_V4 = COMPACT_SCHEMA_V3.concat([
    { key: "ENABLE_SIMPLIFY_ITEMS", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V5 = COMPACT_SCHEMA_V4.concat([
    { key: "MINIMAP_LARGE_SIZE_ALT", min: 400, max: 1200, step: 10 },
    { key: "ZOOM_X_OFFSET_ALT", min: -1500, max: 1500, step: 5 },
    { key: "ZOOM_Y_OFFSET_ALT", min: -1000, max: 1000, step: 5 },
    { key: "MINIMAP_LARGE_SIZE_TAB", min: 400, max: 1200, step: 10 },
    { key: "ZOOM_X_OFFSET_TAB", min: -1500, max: 1500, step: 5 },
    { key: "ZOOM_Y_OFFSET_TAB", min: -1000, max: 1000, step: 5 }
]);

const COMPACT_SCHEMA_V6 = COMPACT_SCHEMA_V5.concat([
    { key: "SUPPORT_16_10", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V7 = COMPACT_SCHEMA_V6.concat([
    { key: "DISABLE_SHOP_BLUE", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V8 = COMPACT_SCHEMA_V7.concat([
    { key: "SHOP_OFFSET_X", min: -500, max: 500, step: 5 }
]);

const COMPACT_SCHEMA_V9 = COMPACT_SCHEMA_V8.concat([
    { key: "ENABLE_HIDE_SMALL_NUMBERS", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V10 = COMPACT_SCHEMA_V9.concat([
    { key: "ENABLE_HIDE_MAGAZINE", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V11 = COMPACT_SCHEMA_V10.concat([
    { key: "AMMO_PANEL_SCALE", min: 100, max: 300, step: 1 },
    { key: "AMMO_PANEL_X_OFFSET", min: -200, max: 200, step: 5 },
    { key: "AMMO_PANEL_Y_OFFSET", min: -200, max: 200, step: 5 }
]);

const COMPACT_SCHEMA_V12 = COMPACT_SCHEMA_V11;

const COMPACT_SCHEMA_V13 = COMPACT_SCHEMA_V12.concat([
    { key: "ENABLE_ON_DEATH_GAMES", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V14 = COMPACT_SCHEMA_V13.concat([
    { key: "ENABLE_RELOAD_COOLDOWN", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V15 = COMPACT_SCHEMA_V14.concat([
    { key: "ENABLE_HIDE_RELOAD_ICON", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V16 = COMPACT_SCHEMA_V15.concat([
    { key: "ENABLE_HIDE_RELOAD_CIRCLE", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V17 = COMPACT_SCHEMA_V16.concat([
    { key: "RELOAD_COOLDOWN_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "RELOAD_COOLDOWN_SIZE", min: 16, max: 60, step: 1 }
]);

const COMPACT_SCHEMA_V18 = COMPACT_SCHEMA_V17.concat([
    { key: "TAB_ZOOM_DRAW_OVER_UI", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V19 = COMPACT_SCHEMA_V18.concat([
    { key: "ALT_ZOOM_DRAW_OVER_UI", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V20 = COMPACT_SCHEMA_V19.concat([
    { key: "ENABLE_HIDE_TROOPER_DAMAGE", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V21 = COMPACT_SCHEMA_V20.concat([
    { key: "MINIMAP_ROTATE_WITH_PLAYER", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V22 = COMPACT_SCHEMA_V21.concat([
    { key: "ENABLE_STAT_BONUSES", min: 0, max: 1, step: 1 },
    { key: "STAT_BONUSES_SCALE", min: 50, max: 200, step: 1 },
    { key: "STAT_BONUSES_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "STAT_BONUSES_Y_OFFSET", min: 0, max: 1000, step: 5 }
]);

const COMPACT_SCHEMA_V23 = COMPACT_SCHEMA_V22.concat([
    { key: "ENABLE_UNSECURED_SOUL_TIMER", min: 0, max: 1, step: 1 },
    { key: "UNSECURED_SOUL_TIMER_SCALE", min: 50, max: 200, step: 1 },
    { key: "UNSECURED_SOUL_TIMER_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "UNSECURED_SOUL_TIMER_Y_OFFSET", min: -100, max: 1000, step: 5 }
]);

const COMPACT_SCHEMA_V24 = COMPACT_SCHEMA_V23.concat([
    { key: "ENABLE_COLORED_HEALTHBAR", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V25 = COMPACT_SCHEMA_V24;

const COMPACT_SCHEMA_V26 = COMPACT_SCHEMA_V25.concat([
    { key: "ENABLE_MINIMALIST_HEALTHBAR", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V27 = COMPACT_SCHEMA_V26.concat([
    { key: "ENABLE_FORCE_TESTING_TOOLS", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V28 = COMPACT_SCHEMA_V27.concat([
    { key: "RELOAD_COOLDOWN_X_OFFSET", min: -75, max: 75, step: 1 },
    { key: "RELOAD_COOLDOWN_Y_OFFSET", min: -75, max: 75, step: 1 }
]);

const COMPACT_SCHEMA_V29 = COMPACT_SCHEMA_V28.concat([
    { key: "UNSECURED_SOULS_HUD_SCALE", min: 50, max: 200, step: 1 },
    { key: "UNSECURED_SOULS_HUD_X_OFFSET", min: -1000, max: 2000, step: 5 },
    { key: "UNSECURED_SOULS_HUD_Y_OFFSET", min: 800, max: 2000, step: 5 }
]);

const COMPACT_SCHEMA_V30 = COMPACT_SCHEMA_V29;

const COMPACT_SCHEMA_V31 = COMPACT_SCHEMA_V30.concat([
    { key: "ENABLE_BETTER_UNSECURED", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V32 = COMPACT_SCHEMA_V31.concat([
    { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V33 = COMPACT_SCHEMA_V32.concat([
    { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BETTER_UNSECURED_SHOW_TEXT", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V34 = COMPACT_SCHEMA_V33.concat([
    { key: "ENABLE_ULT_COOLDOWNS", min: 0, max: 1, step: 1 },
    { key: "ULT_COOLDOWN_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ULT_COOLDOWN_SIZE", min: 10, max: 32, step: 1 },
    { key: "ULT_COOLDOWN_X_OFFSET", min: -60, max: 60, step: 1 },
    { key: "ULT_COOLDOWN_Y_OFFSET", min: -60, max: 60, step: 1 }
]);

const COMPACT_SCHEMA_V35 = COMPACT_SCHEMA_V34.concat([
    { key: "LANGUAGE", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V36 = COMPACT_SCHEMA_V35.concat([
    { key: "MINIMALIST_HEALTHBAR_X_OFFSET", min: -300, max: 300, step: 1 },
    { key: "MINIMALIST_HEALTHBAR_Y_OFFSET", min: -300, max: 300, step: 1 }
]);

const COMPACT_SCHEMA_V37 = COMPACT_SCHEMA_V36.concat([
    { key: "ENABLE_HIDE_TESTING_TOOLS", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V38 = COMPACT_SCHEMA_V37.concat([
    { key: "ENABLE_HIDE_COSMETIC_ABILITY", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V39 = COMPACT_SCHEMA_V38.concat([
    { key: "DAMAGE_REPORT_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "DAMAGE_REPORT_Y_OFFSET", min: -1500, max: 200, step: 5 }
]);

const COMPACT_SCHEMA_V40 = COMPACT_SCHEMA_V39.concat([
    { key: "ENABLE_HIDE_AMMO_ALL", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V41 = COMPACT_SCHEMA_V40;

const COMPACT_SCHEMA_V42 = COMPACT_SCHEMA_V41.concat([
    { key: COMPACT_DEFAULT_HERO_FIELD, min: 0, max: Math.max(0, DEFAULT_HERO_OPTIONS.length - 1), step: 1 }
]);

const COMPACT_SCHEMA_V43 = COMPACT_SCHEMA_V42.concat([
    { key: "ENABLE_OLD_ITEM_COOLDOWNS", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V44 = COMPACT_SCHEMA_V43.concat([
    { key: "OLD_ITEM_COOLDOWNS_SCALE", min: 50, max: 200, step: 1 },
    { key: "OLD_ITEM_COOLDOWNS_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "OLD_ITEM_COOLDOWNS_Y_OFFSET", min: -1000, max: 1000, step: 5 }
]);

const COMPACT_SCHEMA_V45 = COMPACT_SCHEMA_V44;

const COMPACT_SCHEMA_V46 = COMPACT_SCHEMA_V45.concat([
    { key: "ENABLE_LANE_WITH_PARTY", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V47 = COMPACT_SCHEMA_V46.concat([
    { key: "ENABLE_ONE_TIME_TIER1", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ONE_TIME_TIER2", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ONE_TIME_TIER3", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V48 = COMPACT_SCHEMA_V47.concat([
    { key: "ENABLE_FG_HEALTHBAR", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V49 = COMPACT_SCHEMA_V48.concat([
    { key: "HEALTHBAR_TYPE", min: 0, max: 4, step: 1 }
]);

const COMPACT_SCHEMA_V50 = COMPACT_SCHEMA_V49.concat([
    { key: "ENABLE_COLOR_WARNING_25", min: 0, max: 1, step: 1 },
    { key: "ENABLE_COLOR_WARNING_65", min: 0, max: 1, step: 1 },
    { key: "ENABLE_COLOR_WARNING_75", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V51 = COMPACT_SCHEMA_V50.concat([
    { key: "ENABLE_MINIMAP_BUFF_TIMER", min: 0, max: 1, step: 1 },
    { key: "ENABLE_MINIMAP_REJUV_TIMER", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V52 = COMPACT_SCHEMA_V51.concat([
    { key: "AMMO_CURRENT_SCALE", min: 100, max: 300, step: 1 },
    { key: "AMMO_TOTAL_SCALE", min: 100, max: 300, step: 1 }
]);

const COMPACT_SCHEMA_V53 = COMPACT_SCHEMA_V52.concat([
    { key: "ENABLE_IMPROVED_HINT", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V54 = COMPACT_SCHEMA_V53.concat([
    { key: "ENABLE_COMBAT_STATUS", min: 0, max: 1, step: 1 },
    { key: "COMBAT_STATUS_SCALE", min: 50, max: 200, step: 1 },
    { key: "COMBAT_STATUS_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "COMBAT_STATUS_Y_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "ENABLE_ENEMY_ULT_INDICATOR", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V55 = COMPACT_SCHEMA_V54.concat([
    { key: "ENABLE_NICKNAMES", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V56 = COMPACT_SCHEMA_V55.concat([
    { key: "MINIMAL_MINIMAP_OPACITY", min: 0, max: 1, step: 0.05 }
]);

const COMPACT_SCHEMA_V57 = COMPACT_SCHEMA_V56.concat([
    { key: "ENABLE_DAMAGE_FOUNTAIN", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V58 = COMPACT_SCHEMA_V57.concat([
    { key: "PLAYER_HEALTHBAR_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "PLAYER_HEALTHBAR_Y_OFFSET", min: -1000, max: 1000, step: 5 }
]);

const COMPACT_SCHEMA_V59 = COMPACT_SCHEMA_V58.concat([
    { key: "PLAYER_HEALTHBAR_SCALE", min: 50, max: 200, step: 1 },
    { key: "PLAYER_HEALTHBAR_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "VOICE_VOLUME", min: 0, max: 100, step: 1 },
    { key: "ENABLE_BUFF_SOUND_1", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BUFF_SOUND_2", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BUFF_SOUND_3", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_V60 = COMPACT_SCHEMA_V59.concat([
    { key: "ENABLE_ENEMY_COLORED_HEALTHBAR", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_COLOR_WARNING_25", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_COLOR_WARNING_65", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_COLOR_WARNING_75", min: 0, max: 1, step: 1 },
    { key: "ENABLE_URN_COLORS", min: 0, max: 1, step: 1 }
]);

const COMPACT_SCHEMA_2_0_1_EXTRA_FIELDS = [
    { key: "ENABLE_ENEMY_V2_ENHANCED", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_V2_ULT_INDICATOR", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_V2_LEVEL", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_MINESWEEPER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_BLACKJACK", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_FLAPPY_BAT", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_GRAVES_TRAINER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_ZERGGY_MANIA", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_WHACK_A_REM", min: 0, max: 1, step: 1 }
];

function BuildSchemaWithLanguageMax(baseSchema, maxLanguageValue) {
    var out = [];
    var langMax = Math.max(1, Math.round(Number(maxLanguageValue) || 1));
    for (var i = 0; i < baseSchema.length; i++) {
        var field = baseSchema[i];
        if (!field) continue;
        var copy = {
            key: field.key,
            min: field.min,
            max: field.max,
            step: field.step
        };
        if (copy.key === "LANGUAGE") copy.max = langMax;
        out.push(copy);
    }
    return out;
}

function AppendUniqueSchemaFields(baseSchema, extraFields) {
    var out = Array.isArray(baseSchema) ? baseSchema.slice() : [];
    if (!Array.isArray(extraFields) || extraFields.length <= 0) return out;
    var seen = {};
    for (var iSeen = 0; iSeen < out.length; iSeen++) {
        var existing = out[iSeen];
        if (existing && existing.key) seen[String(existing.key)] = true;
    }
    for (var iExtra = 0; iExtra < extraFields.length; iExtra++) {
        var field = extraFields[iExtra];
        if (!field || !field.key) continue;
        var key = String(field.key);
        if (seen[key]) continue;
        out.push({
            key: field.key,
            min: field.min,
            max: field.max,
            step: field.step
        });
        seen[key] = true;
    }
    return out;
}

function CloneSchemaWithFieldOverrides(baseSchema, overrideFields) {
    var out = [];
    var overrides = {};
    var i;
    if (Array.isArray(overrideFields)) {
        for (i = 0; i < overrideFields.length; i++) {
            var overrideField = overrideFields[i];
            if (!overrideField || !overrideField.key) continue;
            overrides[String(overrideField.key)] = overrideField;
        }
    }
    if (!Array.isArray(baseSchema)) return out;
    for (i = 0; i < baseSchema.length; i++) {
        var field = baseSchema[i];
        if (!field || !field.key) continue;
        var key = String(field.key);
        var sourceField = overrides[key] || field;
        out.push({
            key: sourceField.key,
            min: sourceField.min,
            max: sourceField.max,
            step: sourceField.step
        });
    }
    return out;
}

const COMPACT_SCHEMA_2_0_0 = COMPACT_SCHEMA_V60;
const COMPACT_SCHEMA_2_0_1 = BuildSchemaWithLanguageMax(COMPACT_SCHEMA_2_0_0, 2);
for (var iSchemaExtra = 0; iSchemaExtra < COMPACT_SCHEMA_2_0_1_EXTRA_FIELDS.length; iSchemaExtra++) {
    COMPACT_SCHEMA_2_0_1.push(COMPACT_SCHEMA_2_0_1_EXTRA_FIELDS[iSchemaExtra]);
}
const COMPACT_SCHEMA_2_1_1 = COMPACT_SCHEMA_2_0_1;
const COMPACT_SCHEMA_2_1_2_EXTRA_FIELDS = [
    { key: "ENABLE_CENTER_FRIENDS_LIST", min: 0, max: 1, step: 1 }
];
const COMPACT_SCHEMA_2_1_2 = COMPACT_SCHEMA_2_1_1.concat(COMPACT_SCHEMA_2_1_2_EXTRA_FIELDS);
const COMPACT_SCHEMA_2_2_0_EXTRA_FIELDS = [
    { key: "ENABLE_GAME_AUDIO", min: 0, max: 1, step: 1 },
    { key: "GAME_DEFAULT_DIFFICULTY", min: 0, max: 2, step: 1 },
    { key: "ON_DEATH_GAME_MINESWEEPER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_BLACKJACK", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_FLAPPY_BAT", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_GRAVES_TRAINER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_ZERGGY_MANIA", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_WHACK_A_REM", min: 0, max: 1, step: 1 },
    { key: "ENABLE_STATLOCKER", min: 0, max: 1, step: 1 },
    { key: "CHAT_SCALE", min: 50, max: 200, step: 1 },
    { key: "CHAT_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "CHAT_Y_OFFSET", min: -1000, max: 1000, step: 5 }
];
const COMPACT_SCHEMA_2_2_0 = AppendUniqueSchemaFields(COMPACT_SCHEMA_2_1_2, COMPACT_SCHEMA_2_2_0_EXTRA_FIELDS);
const COMPACT_SCHEMA_2_2_1_OVERRIDE_FIELDS = [
    { key: "CHAT_Y_OFFSET", min: -250, max: 800, step: 5 }
];
const COMPACT_SCHEMA_2_2_1_EXTRA_FIELDS = [
    { key: "ENABLE_CHAT", min: 0, max: 1, step: 1 }
];
const COMPACT_SCHEMA_2_2_1 = AppendUniqueSchemaFields(
    CloneSchemaWithFieldOverrides(COMPACT_SCHEMA_2_2_0, COMPACT_SCHEMA_2_2_1_OVERRIDE_FIELDS),
    COMPACT_SCHEMA_2_2_1_EXTRA_FIELDS
);
const COMPACT_SCHEMA_2_2_2_EXTRA_FIELDS = [
    { key: "ENABLE_LEGACY_COOLDOWNS", min: 0, max: 1, step: 1 }
];
const COMPACT_SCHEMA_2_2_2 = AppendUniqueSchemaFields(COMPACT_SCHEMA_2_2_1, COMPACT_SCHEMA_2_2_2_EXTRA_FIELDS);
const COMPACT_SCHEMA_2_2_3_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 3, step: 1 }
];
const COMPACT_SCHEMA_2_2_3 = CloneSchemaWithFieldOverrides(COMPACT_SCHEMA_2_2_2, COMPACT_SCHEMA_2_2_3_OVERRIDE_FIELDS);
const COMPACT_SCHEMA_2_2_4_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 4, step: 1 }
];
const COMPACT_SCHEMA_2_2_4 = CloneSchemaWithFieldOverrides(COMPACT_SCHEMA_2_2_3, COMPACT_SCHEMA_2_2_4_OVERRIDE_FIELDS);
const COMPACT_SCHEMA_2_2_5_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 5, step: 1 }
];
const COMPACT_SCHEMA_2_2_5 = CloneSchemaWithFieldOverrides(COMPACT_SCHEMA_2_2_4, COMPACT_SCHEMA_2_2_5_OVERRIDE_FIELDS);
const COMPACT_SCHEMA_2_2_6_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 6, step: 1 }
];
const COMPACT_SCHEMA_2_2_6 = CloneSchemaWithFieldOverrides(COMPACT_SCHEMA_2_2_5, COMPACT_SCHEMA_2_2_6_OVERRIDE_FIELDS);
const COMPACT_SCHEMA_2_2_7 = AppendUniqueSchemaFields(
    COMPACT_SCHEMA_2_2_6,
    [{ key: "MINIMAP_FLIP", min: 0, max: 1, step: 1 }]
);
const COMPACT_SCHEMA_2_2_10 = AppendUniqueSchemaFields(
    COMPACT_SCHEMA_2_2_7,
    [
        { key: "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS", min: 0, max: 1, step: 1 },
        { key: "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE", min: 0, max: 1, step: 1 }
    ]
);
const COMPACT_SCHEMA_2_3_1 = AppendUniqueSchemaFields(
    COMPACT_SCHEMA_2_2_10,
    [
        { key: "ENABLE_BHOP", min: 0, max: 1, step: 1 }
    ]
);
const LATEST_COMPACT_SEMVER = EXPORT_SCHEMA_SEMVER;
const COMPACT_SCHEMA_REGISTRY = {
    "2.0.0": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_0,
        schema: COMPACT_SCHEMA_2_0_0
    },
    "2.0.1": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_0_1
    },
    "2.1.0": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_1_1
    },
    "2.1.1": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_1_1
    },
    "2.1.2": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_1_2
    },
    "2.2.0": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_0
    },
    "2.2.1": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_1
    },
    "2.2.2": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_2
    },
    "2.2.3": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_3
    },
    "2.2.4": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_4
    },
    "2.2.5": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_5
    },
    "2.2.6": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_6
    },
    "2.2.7": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_7
    },
    "2.2.8": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_7
    },
    "2.2.9": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_7
    },
    "2.2.10": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_10
    },
    "2.3.0": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_2_10
    },
    "2.3.1": {
        wireVersion: COMPACT_WIRE_VERSION_2_0_1,
        schema: COMPACT_SCHEMA_2_3_1
    }
};
const COMPACT_SCHEMA_WIRE_TO_SEMVER = (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.BuildWireToSemver === "function")
    ? QOL_CODEC.BuildWireToSemver(COMPACT_SCHEMA_REGISTRY)
    : {};

function GetCompactSchema(semver) {
    var key = String(semver || "");
    var entry = COMPACT_SCHEMA_REGISTRY[key];
    if (!entry || !Array.isArray(entry.schema)) throw new Error("Unsupported compact schema semver");
    return entry.schema;
}

function GetCompactWireVersion(semver) {
    var key = String(semver || "");
    var entry = COMPACT_SCHEMA_REGISTRY[key];
    if (!entry) throw new Error("Unsupported compact schema semver");
    var wireVersion = Math.max(0, Math.round(Number(entry.wireVersion) || 0));
    if (wireVersion <= 0) throw new Error("Invalid compact schema wire version");
    return wireVersion;
}

function ResolveCompactSemverFromWireVersion(wireVersion) {
    var semver = (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.ResolveSemverFromWire === "function")
        ? QOL_CODEC.ResolveSemverFromWire(COMPACT_SCHEMA_WIRE_TO_SEMVER, COMPACT_SCHEMA_REGISTRY, wireVersion)
        : "";
    if (!semver || !COMPACT_SCHEMA_REGISTRY[semver]) throw new Error("Unsupported compact schema wire version");
    return semver;
}

function AreCompactSemversWireCompatible(expectedSemver, resolvedSemver) {
    var expected = String(expectedSemver || "");
    var resolved = String(resolvedSemver || "");
    if (!expected || !resolved) return false;
    if (expected === resolved) return true;
    if (!COMPACT_SCHEMA_REGISTRY.hasOwnProperty(expected)) return false;
    if (!COMPACT_SCHEMA_REGISTRY.hasOwnProperty(resolved)) return false;
    try {
        return GetCompactWireVersion(expected) === GetCompactWireVersion(resolved);
    } catch (eWire) {
        return false;
    }
}

function GetStepDecimals(step) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.GetStepDecimals === "function") {
        return QOL_CODEC.GetStepDecimals(step);
    }
    var s = String(step);
    var idx = s.indexOf(".");
    return idx === -1 ? 0 : (s.length - idx - 1);
}

function ToBase64Url(binaryStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.ToBase64Url === "function") {
        return QOL_CODEC.ToBase64Url(binaryStr);
    }
    return EncodeBase64Raw(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function FromBase64Url(urlStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.FromBase64Url === "function") {
        return QOL_CODEC.FromBase64Url(urlStr);
    }
    var padded = String(urlStr || "").replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4 !== 0) padded += "=";
    return DecodeBase64(padded);
}

function SerializeCompactV2(config, semverOverride) {
    var semver = String(semverOverride || LATEST_COMPACT_SEMVER);
    var wireVersion = GetCompactWireVersion(semver);
    var schema = GetCompactSchema(semver);
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.SerializeCompactBinary === "function") {
        return QOL_CODEC.SerializeCompactBinary(config, schema, wireVersion, function(field, cfg) {
            var val = cfg && cfg.hasOwnProperty(field.key) ? cfg[field.key] : field.min;
            if (field.key === "ULT_COOLDOWN_X_OFFSET" || field.key === "ULT_COOLDOWN_Y_OFFSET") {
                val = 0;
            }
            if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                var configuredHero = String((cfg && cfg.DEFAULT_HERO) || "");
                var configuredHeroIndex = DEFAULT_HERO_OPTIONS.indexOf(configuredHero);
                if (configuredHeroIndex < 0) {
                    configuredHeroIndex = DEFAULT_HERO_OPTIONS.indexOf(String(DEFAULT_CONFIG.DEFAULT_HERO || ""));
                }
                if (configuredHeroIndex < 0) configuredHeroIndex = 0;
                val = configuredHeroIndex;
            }
            return val;
        });
    }
    throw new Error("Compact serializer unavailable");
}

function DeserializeCompactV2(binaryStr, expectedSemver) {
    var raw = String(binaryStr || "");
    if (raw.length < 1) throw new Error("Compact string too short");
    var wireVersion = raw.charCodeAt(0) & 255;
    var semver = "";
    if (expectedSemver) {
        var expected = String(expectedSemver);
        var expectedWireVersion = GetCompactWireVersion(expected);
        if (expectedWireVersion !== wireVersion) throw new Error("Compact schema wire version mismatch");
        semver = expected;
    } else {
        semver = ResolveCompactSemverFromWireVersion(wireVersion);
    }
    var schema = GetCompactSchema(semver);
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DeserializeCompactBinary === "function") {
        return QOL_CODEC.DeserializeCompactBinary(
            raw,
            schema,
            function(field, value, parsed) {
                if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                    var heroIndex = Math.round(value);
                    if (heroIndex < 0 || heroIndex >= DEFAULT_HERO_OPTIONS.length) heroIndex = 0;
                    var fallbackHeroId = String(DEFAULT_CONFIG.DEFAULT_HERO || "");
                    var resolvedHeroId = DEFAULT_HERO_OPTIONS[heroIndex] || fallbackHeroId || "hero_werewolf";
                    parsed.DEFAULT_HERO = resolvedHeroId;
                    return true;
                }
                return false;
            },
            function(missingField, parsed) {
                if (!missingField || !missingField.key) return;
                if (missingField.key === COMPACT_DEFAULT_HERO_FIELD) {
                    parsed.DEFAULT_HERO = String(DEFAULT_CONFIG.DEFAULT_HERO || "hero_werewolf");
                } else if (DEFAULT_CONFIG.hasOwnProperty(missingField.key)) {
                    parsed[missingField.key] = DEFAULT_CONFIG[missingField.key];
                }
            }
        );
    }
    throw new Error("Compact deserializer unavailable");
}

function ApplyParsedConfig(parsed) {
    for (var key in parsed) {
        if (MOD_CONFIG.hasOwnProperty(key)) {
            MOD_CONFIG[key] = parsed[key];
        }
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
}

function ClampToSchemaField(value, field) {
    if (!field) return { value: value, changed: false };
    var n = Number(value);
    if (!isFinite(n)) return { value: value, changed: false };
    var clamped = Math.max(Number(field.min), Math.min(Number(field.max), n));
    var step = Number(field.step);
    if (isFinite(step) && step > 0) {
        clamped = field.min + (Math.round((clamped - field.min) / step) * step);
    }
    var decimals = GetStepDecimals(field.step);
    clamped = decimals > 0 ? parseFloat(clamped.toFixed(decimals)) : Math.round(clamped);
    return { value: clamped, changed: NormalizeComparableConfigValue(clamped) !== NormalizeComparableConfigValue(value) };
}

function BuildSchemaFieldMap(version) {
    var map = {};
    var schema = [];
    var schemaSemver = String(version || LATEST_COMPACT_SEMVER);
    try { schema = GetCompactSchema(schemaSemver) || []; } catch (e0) { schema = []; }
    for (var i = 0; i < schema.length; i++) {
        var field = schema[i];
        if (!field || !field.key) continue;
        map[String(field.key)] = field;
    }
    return map;
}

function ApplyParsedConfigWithDiagnostics(parsed, schemaVersion) {
    var diagnostics = {
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    if (!parsed || typeof parsed !== "object") return diagnostics;

    var fieldMap = BuildSchemaFieldMap(schemaVersion);
    for (var key in parsed) {
        if (!MOD_CONFIG.hasOwnProperty(key)) {
            diagnostics.unknownKeys++;
            continue;
        }
        var nextValue = parsed[key];
        var field = fieldMap[key] || null;
        if (field && typeof nextValue === "number") {
            var clampResult = ClampToSchemaField(nextValue, field);
            nextValue = clampResult.value;
            if (clampResult.changed) diagnostics.clampedKeys++;
        }
        MOD_CONFIG[key] = nextValue;
        diagnostics.appliedKeys++;
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
    SetRuntimePresetName("");
    return diagnostics;
}

function FindRootPanel() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) {
        root = root.GetParent();
    }
    return root;
}

function ExtractHeroTokenFromText(rawText) {
    if (!rawText) return "";
    var text = String(rawText);
    var m = text.match(/\b(hero_[a-z0-9_]+)\b/i);
    return (m && m[1]) ? String(m[1]).toLowerCase() : "";
}

function ExtractLastHeroTokenFromText(rawText) {
    if (!rawText) return "";
    var text = String(rawText);
    var re = /\b(hero_[a-z0-9_]+)\b/ig;
    var match = null;
    var last = "";
    while ((match = re.exec(text)) !== null) {
        if (match[1]) last = String(match[1]).toLowerCase();
    }
    return last;
}

function PublishHeroHintFromSettings() {
    var root = FindRootPanel();
    if (!root || !root.SetAttributeString) return;
    if (typeof GameInterfaceAPI === "undefined" || !GameInterfaceAPI || typeof GameInterfaceAPI.GetSettingString !== "function") return;

    var settingKeys = [
        "citadel_last_used_hero_builds",
        "citadel_last_used_hero",
        "citadel_selected_hero",
        "citadel_selected_hero_name",
        "citadel_dev_hero",
        "citadel_hero"
    ];

    var heroHint = "";
    for (var i = 0; i < settingKeys.length; i++) {
        var key = settingKeys[i];
        var val = "";
        try { val = String(GameInterfaceAPI.GetSettingString(key) || ""); } catch (e0) { val = ""; }
        if (!val || val.length === 0) continue;
        heroHint = ExtractLastHeroTokenFromText(val) || ExtractHeroTokenFromText(val);
        if (heroHint) break;
    }

    if (heroHint) {
        root.SetAttributeString(HERO_HINT_ATTR, heroHint);
    }
}

function StartHeroHintPublisher() {
    function tick() {
        try { PublishHeroHintFromSettings(); } catch (e0) {}
        $.Schedule(HERO_HINT_PUBLISH_INTERVAL_SEC, tick);
    }
    tick();
}

function BuildHistoricSettingsPreviewIndex(entries) {
    var rows = [];
    for (var i = 0; i < (entries ? entries.length : 0); i++) {
        var key = NormalizeLegacySettingsToken(entries[i].id || entries[i].key || "");
        if (!key) continue;
        rows.push({ route: key.replace(/_/g, "."), phase: entries[i].phase || "bridge", stamp: entries[i].stamp || "atlas", weight: entries[i].weight || LEGACY_SETTINGS_COMPAT_WINDOW[i % LEGACY_SETTINGS_COMPAT_WINDOW.length] });
    }
    return rows;
}

function ResolveHistoricSettingsPreviewEnvelope(entries) {
    var rows = BuildHistoricSettingsPreviewIndex(entries);
    var parts = [];
    for (var i = 0; i < rows.length; i++) {
        parts.push(rows[i].route + ":" + rows[i].phase + ":" + rows[i].stamp + ":" + rows[i].weight);
    }
    return parts.join("|");
}

var HISTORIC_SETTINGS_PREVIEW_REGISTRY = {
    payload_carrier_west_0001: {
        route: "payload.carrier.west.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    config_bridge_harbor_0002: {
        route: "config.bridge.harbor.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    cursor_mirror_delta_0003: {
        route: "cursor.mirror.delta.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    minimap_compact_east_0004: {
        route: "minimap.compact.east.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    overlay_legacy_river_0005: {
        route: "overlay.legacy.river.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    account_carrier_alpha_0006: {
        route: "account.carrier.alpha.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    hud_bridge_south_0007: {
        route: "hud.bridge.south.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    panel_mirror_cinder_0008: {
        route: "panel.mirror.cinder.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    storage_compact_atlas_0009: {
        route: "storage.compact.atlas.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    layout_legacy_north_0010: {
        route: "layout.legacy.north.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    payload_carrier_west_0011: {
        route: "payload.carrier.west.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    config_bridge_harbor_0012: {
        route: "config.bridge.harbor.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    cursor_mirror_delta_0013: {
        route: "cursor.mirror.delta.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    minimap_compact_east_0014: {
        route: "minimap.compact.east.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    overlay_legacy_river_0015: {
        route: "overlay.legacy.river.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    account_carrier_alpha_0016: {
        route: "account.carrier.alpha.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    hud_bridge_south_0017: {
        route: "hud.bridge.south.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    panel_mirror_cinder_0018: {
        route: "panel.mirror.cinder.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    storage_compact_atlas_0019: {
        route: "storage.compact.atlas.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    layout_legacy_north_0020: {
        route: "layout.legacy.north.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    payload_carrier_west_0021: {
        route: "payload.carrier.west.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    config_bridge_harbor_0022: {
        route: "config.bridge.harbor.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    cursor_mirror_delta_0023: {
        route: "cursor.mirror.delta.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    minimap_compact_east_0024: {
        route: "minimap.compact.east.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    overlay_legacy_river_0025: {
        route: "overlay.legacy.river.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    account_carrier_alpha_0026: {
        route: "account.carrier.alpha.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    hud_bridge_south_0027: {
        route: "hud.bridge.south.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    panel_mirror_cinder_0028: {
        route: "panel.mirror.cinder.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    storage_compact_atlas_0029: {
        route: "storage.compact.atlas.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    layout_legacy_north_0030: {
        route: "layout.legacy.north.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    payload_carrier_west_0031: {
        route: "payload.carrier.west.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    config_bridge_harbor_0032: {
        route: "config.bridge.harbor.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    cursor_mirror_delta_0033: {
        route: "cursor.mirror.delta.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    minimap_compact_east_0034: {
        route: "minimap.compact.east.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    overlay_legacy_river_0035: {
        route: "overlay.legacy.river.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    account_carrier_alpha_0036: {
        route: "account.carrier.alpha.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    hud_bridge_south_0037: {
        route: "hud.bridge.south.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    panel_mirror_cinder_0038: {
        route: "panel.mirror.cinder.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    storage_compact_atlas_0039: {
        route: "storage.compact.atlas.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    layout_legacy_north_0040: {
        route: "layout.legacy.north.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    payload_carrier_west_0041: {
        route: "payload.carrier.west.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    config_bridge_harbor_0042: {
        route: "config.bridge.harbor.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    cursor_mirror_delta_0043: {
        route: "cursor.mirror.delta.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    minimap_compact_east_0044: {
        route: "minimap.compact.east.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    overlay_legacy_river_0045: {
        route: "overlay.legacy.river.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    account_carrier_alpha_0046: {
        route: "account.carrier.alpha.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    hud_bridge_south_0047: {
        route: "hud.bridge.south.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    panel_mirror_cinder_0048: {
        route: "panel.mirror.cinder.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    storage_compact_atlas_0049: {
        route: "storage.compact.atlas.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    layout_legacy_north_0050: {
        route: "layout.legacy.north.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    payload_carrier_west_0051: {
        route: "payload.carrier.west.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    config_bridge_harbor_0052: {
        route: "config.bridge.harbor.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    cursor_mirror_delta_0053: {
        route: "cursor.mirror.delta.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    minimap_compact_east_0054: {
        route: "minimap.compact.east.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    overlay_legacy_river_0055: {
        route: "overlay.legacy.river.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    account_carrier_alpha_0056: {
        route: "account.carrier.alpha.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    hud_bridge_south_0057: {
        route: "hud.bridge.south.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    panel_mirror_cinder_0058: {
        route: "panel.mirror.cinder.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    storage_compact_atlas_0059: {
        route: "storage.compact.atlas.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    layout_legacy_north_0060: {
        route: "layout.legacy.north.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    payload_carrier_west_0061: {
        route: "payload.carrier.west.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    config_bridge_harbor_0062: {
        route: "config.bridge.harbor.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    cursor_mirror_delta_0063: {
        route: "cursor.mirror.delta.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    minimap_compact_east_0064: {
        route: "minimap.compact.east.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    overlay_legacy_river_0065: {
        route: "overlay.legacy.river.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    account_carrier_alpha_0066: {
        route: "account.carrier.alpha.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    hud_bridge_south_0067: {
        route: "hud.bridge.south.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    panel_mirror_cinder_0068: {
        route: "panel.mirror.cinder.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    storage_compact_atlas_0069: {
        route: "storage.compact.atlas.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    layout_legacy_north_0070: {
        route: "layout.legacy.north.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    payload_carrier_west_0071: {
        route: "payload.carrier.west.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    config_bridge_harbor_0072: {
        route: "config.bridge.harbor.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    cursor_mirror_delta_0073: {
        route: "cursor.mirror.delta.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    minimap_compact_east_0074: {
        route: "minimap.compact.east.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    overlay_legacy_river_0075: {
        route: "overlay.legacy.river.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    account_carrier_alpha_0076: {
        route: "account.carrier.alpha.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    hud_bridge_south_0077: {
        route: "hud.bridge.south.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    panel_mirror_cinder_0078: {
        route: "panel.mirror.cinder.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    storage_compact_atlas_0079: {
        route: "storage.compact.atlas.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    layout_legacy_north_0080: {
        route: "layout.legacy.north.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    payload_carrier_west_0081: {
        route: "payload.carrier.west.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    config_bridge_harbor_0082: {
        route: "config.bridge.harbor.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    cursor_mirror_delta_0083: {
        route: "cursor.mirror.delta.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    minimap_compact_east_0084: {
        route: "minimap.compact.east.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    overlay_legacy_river_0085: {
        route: "overlay.legacy.river.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    account_carrier_alpha_0086: {
        route: "account.carrier.alpha.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    hud_bridge_south_0087: {
        route: "hud.bridge.south.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    panel_mirror_cinder_0088: {
        route: "panel.mirror.cinder.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    storage_compact_atlas_0089: {
        route: "storage.compact.atlas.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    layout_legacy_north_0090: {
        route: "layout.legacy.north.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    payload_carrier_west_0091: {
        route: "payload.carrier.west.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    config_bridge_harbor_0092: {
        route: "config.bridge.harbor.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    cursor_mirror_delta_0093: {
        route: "cursor.mirror.delta.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    minimap_compact_east_0094: {
        route: "minimap.compact.east.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    overlay_legacy_river_0095: {
        route: "overlay.legacy.river.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    account_carrier_alpha_0096: {
        route: "account.carrier.alpha.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    hud_bridge_south_0097: {
        route: "hud.bridge.south.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    panel_mirror_cinder_0098: {
        route: "panel.mirror.cinder.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    storage_compact_atlas_0099: {
        route: "storage.compact.atlas.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    layout_legacy_north_0100: {
        route: "layout.legacy.north.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    payload_carrier_west_0101: {
        route: "payload.carrier.west.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    config_bridge_harbor_0102: {
        route: "config.bridge.harbor.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    cursor_mirror_delta_0103: {
        route: "cursor.mirror.delta.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    minimap_compact_east_0104: {
        route: "minimap.compact.east.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    overlay_legacy_river_0105: {
        route: "overlay.legacy.river.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    account_carrier_alpha_0106: {
        route: "account.carrier.alpha.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    hud_bridge_south_0107: {
        route: "hud.bridge.south.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    panel_mirror_cinder_0108: {
        route: "panel.mirror.cinder.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    storage_compact_atlas_0109: {
        route: "storage.compact.atlas.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    layout_legacy_north_0110: {
        route: "layout.legacy.north.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    payload_carrier_west_0111: {
        route: "payload.carrier.west.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    config_bridge_harbor_0112: {
        route: "config.bridge.harbor.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    cursor_mirror_delta_0113: {
        route: "cursor.mirror.delta.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    minimap_compact_east_0114: {
        route: "minimap.compact.east.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    overlay_legacy_river_0115: {
        route: "overlay.legacy.river.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    account_carrier_alpha_0116: {
        route: "account.carrier.alpha.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    hud_bridge_south_0117: {
        route: "hud.bridge.south.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    panel_mirror_cinder_0118: {
        route: "panel.mirror.cinder.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    storage_compact_atlas_0119: {
        route: "storage.compact.atlas.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    layout_legacy_north_0120: {
        route: "layout.legacy.north.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    payload_carrier_west_0121: {
        route: "payload.carrier.west.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    config_bridge_harbor_0122: {
        route: "config.bridge.harbor.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    cursor_mirror_delta_0123: {
        route: "cursor.mirror.delta.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    minimap_compact_east_0124: {
        route: "minimap.compact.east.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    overlay_legacy_river_0125: {
        route: "overlay.legacy.river.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    account_carrier_alpha_0126: {
        route: "account.carrier.alpha.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    hud_bridge_south_0127: {
        route: "hud.bridge.south.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    panel_mirror_cinder_0128: {
        route: "panel.mirror.cinder.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    storage_compact_atlas_0129: {
        route: "storage.compact.atlas.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    layout_legacy_north_0130: {
        route: "layout.legacy.north.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    payload_carrier_west_0131: {
        route: "payload.carrier.west.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    config_bridge_harbor_0132: {
        route: "config.bridge.harbor.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    cursor_mirror_delta_0133: {
        route: "cursor.mirror.delta.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    minimap_compact_east_0134: {
        route: "minimap.compact.east.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    overlay_legacy_river_0135: {
        route: "overlay.legacy.river.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    account_carrier_alpha_0136: {
        route: "account.carrier.alpha.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    hud_bridge_south_0137: {
        route: "hud.bridge.south.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    panel_mirror_cinder_0138: {
        route: "panel.mirror.cinder.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    storage_compact_atlas_0139: {
        route: "storage.compact.atlas.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    layout_legacy_north_0140: {
        route: "layout.legacy.north.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    payload_carrier_west_0141: {
        route: "payload.carrier.west.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    config_bridge_harbor_0142: {
        route: "config.bridge.harbor.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    cursor_mirror_delta_0143: {
        route: "cursor.mirror.delta.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    minimap_compact_east_0144: {
        route: "minimap.compact.east.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    overlay_legacy_river_0145: {
        route: "overlay.legacy.river.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    account_carrier_alpha_0146: {
        route: "account.carrier.alpha.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    hud_bridge_south_0147: {
        route: "hud.bridge.south.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    panel_mirror_cinder_0148: {
        route: "panel.mirror.cinder.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    storage_compact_atlas_0149: {
        route: "storage.compact.atlas.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    layout_legacy_north_0150: {
        route: "layout.legacy.north.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    payload_carrier_west_0151: {
        route: "payload.carrier.west.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    config_bridge_harbor_0152: {
        route: "config.bridge.harbor.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    cursor_mirror_delta_0153: {
        route: "cursor.mirror.delta.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    minimap_compact_east_0154: {
        route: "minimap.compact.east.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    overlay_legacy_river_0155: {
        route: "overlay.legacy.river.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    account_carrier_alpha_0156: {
        route: "account.carrier.alpha.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    hud_bridge_south_0157: {
        route: "hud.bridge.south.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    panel_mirror_cinder_0158: {
        route: "panel.mirror.cinder.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    storage_compact_atlas_0159: {
        route: "storage.compact.atlas.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    layout_legacy_north_0160: {
        route: "layout.legacy.north.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    }
};


function IsInHideoutForBuildSave() {
    try {
        if (typeof Game !== "undefined" && Game && typeof Game.GetMapInfo === "function") {
            var mapInfo = Game.GetMapInfo();
            if (mapInfo) {
                var names = [mapInfo.map_display_name, mapInfo.map_name, mapInfo.map];
                for (var i = 0; i < names.length; i++) {
                    var n = names[i] ? String(names[i]).toLowerCase() : "";
                    if (n.indexOf("hideout") !== -1) return true;
                }
            }
        }
    } catch (e0) {}

    var root = FindRootPanel();
    if (root && root.BHasClass) {
        try {
            if (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout")) return true;
        } catch (e1) {}
    }
    var hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    if (hud && hud.BHasClass) {
        try {
            if (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout")) return true;
        } catch (e2) {}
    }
    return false;
}

function GetNowMs() {
    try {
        return Date.now ? Date.now() : (new Date()).getTime();
    } catch (e0) {
        return (new Date()).getTime();
    }
}

function HasPanelClassToken(panel, className) {
    if (!panel || !panel.BHasClass || !className) return false;
    try {
        return panel.BHasClass(className);
    } catch (e0) {
        return false;
    }
}

function IsSettingsInActiveMatchContext() {
    var root = FindRootPanel();
    if (!root) return false;

    var hud = root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    var gameplayHud = root.FindChildTraverse ? root.FindChildTraverse("gameplay_hud") : null;
    var hideout = IsInHideoutForBuildSave();

    var hasAnyClass = function(className) {
        return HasPanelClassToken(root, className) ||
            HasPanelClassToken(hud, className) ||
            HasPanelClassToken(gameplayHud, className);
    };

    if (
        hasAnyClass("GameStateGameInProgress") ||
        hasAnyClass("GameStatePostGame") ||
        hasAnyClass("GameStatePostGamePlayOfTheGame") ||
        hasAnyClass("inPostGame")
    ) {
        return true;
    }

    if (
        !hideout &&
        (
            hasAnyClass("connectedToGame") ||
            hasAnyClass("joined_team") ||
            hasAnyClass("GameStatePreGame") ||
            hasAnyClass("GameStatePreGameWait") ||
            hasAnyClass("GameStateWaitForMapToLoad") ||
            hasAnyClass("GameStateHeroSelection") ||
            hasAnyClass("GameStateMatchIntro")
        )
    ) {
        return true;
    }

    try {
        if (typeof Game !== "undefined" && Game && typeof Game.GetMapInfo === "function") {
            var mapInfo = Game.GetMapInfo();
            if (mapInfo) {
                var mapNames = [mapInfo.map_display_name, mapInfo.map_name, mapInfo.map];
                for (var i = 0; i < mapNames.length; i++) {
                    var mapName = mapNames[i] ? String(mapNames[i]).trim().toLowerCase() : "";
                    if (!mapName) continue;
                    if (mapName.indexOf("hideout") !== -1) return false;
                    return true;
                }
            }
        }
    } catch (e1) {}

    return false;
}

function StopSettingsGameTransitionWatch() {
    gSettingsTransitionWatchToken++;
    gSettingsTransitionWatchRunning = false;
}

function TryCloseSettingsForGameTransition(reason) {
    if (!IsSettingsWindowVisible()) return false;
    if (!gSettingsOpenedInHideout) return false;
    if (!IsSettingsInActiveMatchContext()) return false;

    var now = GetNowMs();
    if (now < gSettingsTransitionCloseCooldownUntilMs) return false;
    gSettingsTransitionCloseCooldownUntilMs = now + SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS;

    $.ForceCloseModSettings();
    return true;
}

function HandleSettingsGameTransitionSignal(reason) {
    if (!IsSettingsWindowVisible()) return;
    if (!gSettingsOpenedInHideout) return;

    for (var i = 0; i < SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC.length; i++) {
        (function(delaySec) {
            $.Schedule(delaySec, function() {
                TryCloseSettingsForGameTransition(reason);
            });
        })(SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC[i]);
    }
}

function StartSettingsGameTransitionWatch() {
    StopSettingsGameTransitionWatch();
    gSettingsTransitionWatchRunning = true;
    var token = gSettingsTransitionWatchToken;

    function tick() {
        if (token !== gSettingsTransitionWatchToken) return;
        if (!IsSettingsWindowVisible()) {
            gSettingsTransitionWatchRunning = false;
            return;
        }

        if (TryCloseSettingsForGameTransition("watchdog")) {
            gSettingsTransitionWatchRunning = false;
            return;
        }

        $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
    }

    $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
}

function QueueBuildSaveRequest(rawExportString) {
    var payload = rawExportString ? String(rawExportString).replace(/\s+/g, "") : "";
    if (!payload || !EXPORT_TOKEN_REGEX.test(payload)) return "";

    var token = String(Date.now ? Date.now() : (new Date()).getTime()) + "_" + String(Math.floor(Math.random() * 1000000));
    var panel = $.GetContextPanel();
    var root = FindRootPanel();

    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
        panel.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
        panel.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
        panel.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
        root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
        root.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
        root.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
    }
    return token;
}

function ReadBuildSaveStatus() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var fromRoot = root && root.GetAttributeString ? {
        state: root.GetAttributeString(BUILD_SAVE_STATE_ATTR, ""),
        msg: root.GetAttributeString(BUILD_SAVE_MSG_ATTR, ""),
        token: root.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "")
    } : { state: "", msg: "", token: "" };
    if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;
    if (panel && panel.GetAttributeString) {
        return {
            state: panel.GetAttributeString(BUILD_SAVE_STATE_ATTR, ""),
            msg: panel.GetAttributeString(BUILD_SAVE_MSG_ATTR, ""),
            token: panel.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "")
        };
    }
    return { state: "", msg: "", token: "" };
}

function ResolveBuildSavePendingLabel(message) {
    if (message === "starting") return "START";
    if (message === "switching_to_airheart") return "AIRHEART";
    if (message === "waiting_for_shop") return "OPEN SHOP";
    if (message === "initializing_storage_build") return "INIT BUILD";
    if (message === "opening_edit_mode") return "EDITING";
    if (message === "writing_category_name") return "WRITING";
    if (message === "saving") return "SAVING";
    if (message === "verifying") return "VERIFY";
    return "SAVING";
}

function WatchBuildSaveStatus(saveBtn, saveLbl, expectedToken, defaultLabel) {
    var startMs = Date.now ? Date.now() : (new Date()).getTime();
    var timeoutMs = 30000;
    var lastFeedbackKey = "";

    function setFeedbackForPending(msg) {
        var key = "pending:" + String(msg || "");
        if (key === lastFeedbackKey) return;
        lastFeedbackKey = key;
        var message = String(msg || "");
        if (message === "waiting_for_shop") {
            SetLocalizedConfigFeedbackMessage("Open shop to continue save.", "warning", 0);
            return;
        }
        if (message === "switching_to_airheart") {
            SetLocalizedConfigFeedbackMessage("Switching to Airheart...", "info", 0);
            return;
        }
        if (message === "writing_category_name" || message === "saving") {
            SetLocalizedConfigFeedbackMessage("Writing settings string to build...", "info", 0);
            return;
        }
            SetLocalizedConfigFeedbackMessage("Save in progress...", "info", 0);
    }

    function restoreDefault() {
        if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
        saveBtn.RemoveClass("SuccessState");
        saveBtn.RemoveClass("FailureState");
        saveLbl.text = defaultLabel;
    }

    function tick() {
        if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var elapsedMs = nowMs - startMs;
        var status = ReadBuildSaveStatus();
        var tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

        if (status.state === "pending" && tokenMatches) {
            saveBtn.RemoveClass("FailureState");
            saveBtn.AddClass("SuccessState");
            saveLbl.text = LocalizeSettingsText(ResolveBuildSavePendingLabel(status.msg || ""), true);
            setFeedbackForPending(status.msg || "");
            if (elapsedMs >= timeoutMs) {
                saveBtn.RemoveClass("SuccessState");
                saveBtn.AddClass("FailureState");
                saveLbl.text = LocalizeSettingsText("TIMEOUT", true);
        SetLocalizedConfigFeedbackMessage("Save timed out. Try again.", "error", 2600);
                $.Schedule(0.75, restoreDefault);
                return;
            }
            $.Schedule(0.15, tick);
            return;
        }

        if (status.state === "success" && tokenMatches) {
            saveBtn.RemoveClass("FailureState");
            saveBtn.AddClass("SuccessState");
            saveLbl.text = LocalizeSettingsText("SAVED", true);
            SetLocalizedConfigFeedbackMessage("Save completed.", "success", 2200);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (status.state === "failed" && tokenMatches) {
            saveBtn.RemoveClass("SuccessState");
            saveBtn.AddClass("FailureState");
            saveLbl.text = LocalizeSettingsText("FAILED", true);
            SetLocalizedConfigFeedbackMessage("Save failed.", "error", 2600);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (elapsedMs < timeoutMs) {
            $.Schedule(0.15, tick);
            return;
        }
        restoreDefault();
    }

    tick();
}

function ActivateBuildSaveFromUi(saveBtn, saveLbl, onBeforeQueue) {
    if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
    if (!saveLbl || !saveLbl.IsValid || !saveLbl.IsValid()) return;
    var cfgSave = LocalizeSettingsText("SAVE", true);
    var cfgQueued = LocalizeSettingsText("QUEUED", true);
    var cfgFailed = LocalizeSettingsText("FAILED", true);

    if (typeof onBeforeQueue === "function") {
        try { onBeforeQueue(); } catch (e0) {}
    }

    var exportRaw = GetCurrentExportSettingsString();
    var token = QueueBuildSaveRequest(exportRaw);
    if (!token || token.length === 0) {
        saveBtn.RemoveClass("SuccessState");
        saveBtn.AddClass("FailureState");
        saveLbl.text = cfgFailed;
        SetLocalizedConfigFeedbackMessage("Failed to queue save request.", "error", 2200);
        $.Schedule(0.6, function() {
            if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
            saveBtn.RemoveClass("FailureState");
            saveLbl.text = cfgSave;
        });
        return;
    }

    saveBtn.RemoveClass("FailureState");
    saveBtn.AddClass("SuccessState");
    saveLbl.text = cfgQueued;
        SetLocalizedConfigFeedbackMessage("Save queued.", "info", 0);
    WatchBuildSaveStatus(saveBtn, saveLbl, token, cfgSave);
}

function OpenBuildSaveConfirmModal(saveBtn, saveLbl) {
    if (BUILD_SAVE_UI_TEMP_DISABLED) return;
    var rootPanel = $.GetContextPanel();
    if (!rootPanel || !rootPanel.IsValid || !rootPanel.IsValid()) return;

    var existing = rootPanel.FindChildTraverse("BuildSaveConfirmModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var isRu = IsRussianSettingsLanguage();
    var isCn = IsChineseSettingsLanguage();
    var titleText = isRu ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A" : (isCn ? "\u4FDD\u5B58\u8BBE\u7F6E" : "Save Settings");
    var line1 = isRu ? "\u042D\u0442\u043E \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442 \u0432\u0430\u0448\u0435\u0433\u043E \u0433\u0435\u0440\u043E\u044F \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442 \u0432\u0430\u0448\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" : (isCn ? "\u8FD9\u4F1A\u5207\u6362\u4F60\u7684\u82F1\u96C4\u5E76\u4FDD\u5B58\u4F60\u7684\u8BBE\u7F6E" : "This will swap your character and save your settings");
    var line2 = isRu ? "\u041D\u0415 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u044D\u0442\u043E \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u0438 \u0438\u043B\u0438 \u0432 \u0436\u0438\u0432\u043E\u043C \u043C\u0430\u0442\u0447\u0435" : (isCn ? "\u4E0D\u8981\u5728\u6392\u961F\u4E2D\u6216\u5B9E\u65F6\u5BF9\u5C40\u4E2D\u4F7F\u7528\u6B64\u529F\u80FD" : "DO NOT use this in queue or in a live match");
    var line3 = isRu ? "\u0412\u044B \u0431\u044B\u043B\u0438 \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u044B" : (isCn ? "\u4F60\u5DF2\u7ECF\u88AB\u8B66\u544A\u4E86" : "You have been warned");
    var confirmText = LocalizeSettingsText("SAVE", true);

    var overlay = $.CreatePanel("Panel", rootPanel, "BuildSaveConfirmModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() { overlay.AddClass("Show"); });

    var modalContainer = $.CreatePanel("Panel", overlay, "ExportModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.style.width = "560px";
    modalContainer.AddClass("MetroModalContainer");

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("MetroModalCenteredText");
    header.text = titleText;

    var body1 = $.CreatePanel("Label", modalContainer, "");
    body1.AddClass("ModalInstructions");
    body1.AddClass("MetroModalCenteredText");
    body1.text = line1;

    var body2 = $.CreatePanel("Label", modalContainer, "");
    body2.AddClass("ModalInstructions");
    body2.AddClass("MetroModalCenteredText");
    body2.style.color = "#ff8787";
    body2.style.fontWeight = "bold";
    body2.style.marginTop = "8px";
    body2.text = line2;

    var body3 = $.CreatePanel("Label", modalContainer, "");
    body3.AddClass("ModalInstructions");
    body3.AddClass("MetroModalCenteredText");
    body3.style.marginTop = "6px";
    body3.text = line3;

    var btnRow = $.CreatePanel("Panel", modalContainer, "ModalBtnRow");
    btnRow.AddClass("MetroModalBtnRow");
    btnRow.style.marginTop = "14px";

    var confirmBtn = $.CreatePanel("Button", btnRow, "BuildSaveConfirmButton");
    confirmBtn.AddClass("ModalBtnApply");
    confirmBtn.AddClass("MetroModalBtn");
    var confirmLbl = $.CreatePanel("Label", confirmBtn, "");
    confirmLbl.text = confirmText;
    confirmBtn.SetPanelEvent("onactivate", function() {
        CloseModal(overlay);
        ActivateBuildSaveFromUi(saveBtn, saveLbl);
    });
}

function QueueBuildClearRequest() {
    var token = String(Date.now ? Date.now() : (new Date()).getTime()) + "_" + String(Math.floor(Math.random() * 1000000));
    var panel = $.GetContextPanel();
    var root = FindRootPanel();

    var saveStatus = ReadBuildSaveStatus();
    if (saveStatus && saveStatus.state === "pending") return "";

    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "1");
        panel.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, token);
        panel.SetAttributeString(BUILD_CLEAR_MSG_ATTR, "queued");
        panel.SetAttributeString(BUILD_CLEAR_STATE_ATTR, "pending");
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "1");
        root.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, token);
        root.SetAttributeString(BUILD_CLEAR_MSG_ATTR, "queued");
        root.SetAttributeString(BUILD_CLEAR_STATE_ATTR, "pending");
    }
    return token;
}

function ReadBuildClearStatus() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var fromRoot = root && root.GetAttributeString ? {
        state: root.GetAttributeString(BUILD_CLEAR_STATE_ATTR, ""),
        msg: root.GetAttributeString(BUILD_CLEAR_MSG_ATTR, ""),
        token: root.GetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "")
    } : { state: "", msg: "", token: "" };
    if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;
    if (panel && panel.GetAttributeString) {
        return {
            state: panel.GetAttributeString(BUILD_CLEAR_STATE_ATTR, ""),
            msg: panel.GetAttributeString(BUILD_CLEAR_MSG_ATTR, ""),
            token: panel.GetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "")
        };
    }
    return { state: "", msg: "", token: "" };
}

function ResolveBuildClearPendingLabel(message) {
    if (message === "starting") return "START";
    if (message === "switching_to_airheart") return "AIRHEART";
    if (message === "confirming_airheart") return "AIRHEART";
    if (message === "await_user_open_shop") return "OPEN SHOP";
    if (message === "waiting_for_shop") return "OPEN SHOP";
    if (message === "opening_builds_list") return "BROWSE";
    if (message === "deleting_build") return "CLEARING";
    if (message === "confirming_delete") return "CONFIRM";
    if (message === "verifying_clear") return "VERIFY";
    return "CLEARING";
}

function IsBuildClearUserPromptStage(message) {
    return message === "await_user_open_shop" || message === "waiting_for_shop";
}

function WatchBuildClearStatus(clearBtn, clearLbl, expectedToken, defaultLabel) {
    var startMs = Date.now ? Date.now() : (new Date()).getTime();
    var timeoutMs = 30000;
    var forcedCloseForPrompt = false;
    var lastFeedbackKey = "";

    function setFeedbackForPending(msg, isPrompt) {
        var key = String(msg || "") + "|" + String(isPrompt ? 1 : 0);
        if (key === lastFeedbackKey) return;
        lastFeedbackKey = key;
        if (isPrompt) {
            SetLocalizedConfigFeedbackMessage("Open shop to continue clear.", "warning", 0);
            return;
        }
        if (msg === "switching_to_airheart" || msg === "confirming_airheart") {
            SetLocalizedConfigFeedbackMessage("Confirming Airheart for clear...", "info", 0);
            return;
        }
        if (msg === "deleting_build" || msg === "confirming_delete") {
            SetLocalizedConfigFeedbackMessage("Clearing builds...", "info", 0);
            return;
        }
            SetLocalizedConfigFeedbackMessage("Clear in progress...", "info", 0);
    }

    function restoreDefault() {
        if (!clearBtn || !clearBtn.IsValid || !clearBtn.IsValid()) return;
        clearBtn.RemoveClass("SuccessState");
        clearBtn.RemoveClass("FailureState");
        clearBtn.RemoveClass("UserPromptState");
        clearLbl.text = defaultLabel;
    }

    function tick() {
        if (!clearBtn || !clearBtn.IsValid || !clearBtn.IsValid()) return;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var elapsedMs = nowMs - startMs;
        var status = ReadBuildClearStatus();
        var tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

        if (status.state === "pending" && tokenMatches) {
            var pendingMsg = status.msg || "";
            var isUserPromptStage = IsBuildClearUserPromptStage(pendingMsg);
            if (isUserPromptStage) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                clearBtn.AddClass("UserPromptState");
                clearLbl.text = LocalizeSettingsText(ResolveBuildClearPendingLabel(pendingMsg), true);
                setFeedbackForPending(pendingMsg, true);
                if (!forcedCloseForPrompt) {
                    forcedCloseForPrompt = true;
                    $.ForceCloseModSettings();
                }
            } else {
                forcedCloseForPrompt = false;
                clearBtn.RemoveClass("UserPromptState");
                clearBtn.RemoveClass("FailureState");
                clearBtn.AddClass("SuccessState");
                clearLbl.text = LocalizeSettingsText(ResolveBuildClearPendingLabel(pendingMsg), true);
                setFeedbackForPending(pendingMsg, false);
            }
            if (elapsedMs >= timeoutMs) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                clearBtn.RemoveClass("UserPromptState");
                clearLbl.text = LocalizeSettingsText("TIMEOUT", true);
        SetLocalizedConfigFeedbackMessage("Clear timed out. Try again.", "error", 2600);
                $.Schedule(0.75, restoreDefault);
                return;
            }
            $.Schedule(0.15, tick);
            return;
        }

        if (status.state === "success" && tokenMatches) {
            clearBtn.RemoveClass("FailureState");
            clearBtn.AddClass("SuccessState");
            clearBtn.RemoveClass("UserPromptState");
            clearLbl.text = LocalizeSettingsText("CLEARED", true);
            SetLocalizedConfigFeedbackMessage("Clear completed.", "success", 2200);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (status.state === "failed" && tokenMatches) {
            clearBtn.RemoveClass("SuccessState");
            clearBtn.AddClass("FailureState");
            clearBtn.RemoveClass("UserPromptState");
            clearLbl.text = LocalizeSettingsText("FAILED", true);
            SetLocalizedConfigFeedbackMessage("Clear failed.", "error", 2600);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (elapsedMs < timeoutMs) {
            $.Schedule(0.15, tick);
            return;
        }
        restoreDefault();
    }

    tick();
}

function ReadConfigRawFromStorage() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    var readRaw = function(target) {
        if (!target || !target.GetAttributeString) return "";
        try { return String(target.GetAttributeString(STORAGE_KEY, "") || ""); } catch (e0) { return ""; }
    };
    var parseRev = function(v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return 0;
        return Math.floor(n);
    };
    var readRev = function(target) {
        if (!target || !target.GetAttributeString) return 0;
        try { return parseRev(target.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (e1) { return 0; }
    };
    var sources = [
        { raw: readRaw(panel), rev: readRev(panel), rank: 3 },
        { raw: readRaw(hud), rev: readRev(hud), rank: 2 },
        { raw: readRaw(root), rev: readRev(root), rank: 1 }
    ];
    var chosen = null;
    for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
        if (!source.raw) continue;
        if (!chosen || source.rev > chosen.rev || (source.rev === chosen.rev && source.rank > chosen.rank)) {
            chosen = source;
        }
    }
    gUserEditRevision = Math.max(gUserEditRevision, sources[0].rev, sources[1].rev, sources[2].rev);
    var chosenRaw = chosen ? chosen.raw : "";
    if (chosenRaw && panel && panel.SetAttributeString && sources[0].raw !== chosenRaw) {
        panel.SetAttributeString(STORAGE_KEY, chosenRaw);
    }
    return chosenRaw;
}

function SyncConfigFromStorage() {
    var raw = ReadConfigRawFromStorage();
    var nextConfig = (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG)
        ? Object.assign({}, QOL_DEFAULT_CONFIG)
        : {};
    if (raw && raw.length > 0) {
        try {
            var parsed = JSON.parse(raw) || {};
            for (var key in parsed) {
                if (nextConfig.hasOwnProperty(key)) {
                    nextConfig[key] = parsed[key];
                }
            }
            MigrateSplitZoomKeys(nextConfig, parsed);
            NormalizeNeutralCampFlags(nextConfig, parsed);
            NormalizeItemCooldownModeConfig(nextConfig, parsed);
            NormalizeAmmoScaleConfig(nextConfig, parsed);
            NormalizeVoiceTypeConfig(nextConfig);
            NormalizeHealthbarTypeConfig(nextConfig, parsed);
            NormalizeColorWarningConfig(nextConfig, parsed);
            NormalizeEnemyColorWarningConfig(nextConfig, parsed);
        } catch (e) {}
    }
    MOD_CONFIG = nextConfig;
    PersistStatlockerProfileState(raw, nextConfig);
}

function PersistStatlockerProfileState(rawConfig, configObj) {
    var enabled = Number(configObj && configObj.ENABLE_STATLOCKER) === 1 ? "1" : "0";
    try { $.persistentStorage.setItem("qol_statlocker_enabled", enabled); } catch (e0) {}
    try {
        var raw = String(rawConfig || "");
        if (!raw || raw.length <= 0) raw = JSON.stringify(configObj || {});
        $.persistentStorage.setItem("qol_settings_raw_v1", raw);
    } catch (e1) {}
}

function GetRuntimePresetName() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    if (root && root.GetAttributeString) {
        var rootValue = root.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (rootValue) return String(rootValue);
    }
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (e0) { hud = null; }
    if (hud && hud.GetAttributeString) {
        var hudValue = hud.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (hudValue) return String(hudValue);
    }
    if (panel && panel.GetAttributeString) {
        var localValue = panel.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (localValue) return String(localValue);
    }
    return "";
}

function SetRuntimePresetName(presetName) {
    var value = String(presetName || "");
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (e0) { hud = null; }
    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(RUNTIME_PRESET_ATTR, value); } catch (e1) {}
    }
}

function SaveAndSync() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    NormalizeNeutralCampFlags(MOD_CONFIG, MOD_CONFIG);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, MOD_CONFIG);
    NormalizeAmmoScaleConfig(MOD_CONFIG, MOD_CONFIG);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, MOD_CONFIG);
    NormalizeColorWarningConfig(MOD_CONFIG, MOD_CONFIG);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, MOD_CONFIG);
    var data = JSON.stringify(MOD_CONFIG);
    panel.SetAttributeString(STORAGE_KEY, data);
    if (root && root.SetAttributeString) {
        root.SetAttributeString(STORAGE_KEY, data);
    }
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(STORAGE_KEY, data); } catch (eHudStorage) {}
    }
    var parseRev = function(v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return 0;
        return Math.floor(n);
    };
    var panelRev = (panel && panel.GetAttributeString) ? parseRev(panel.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var rootRev = (root && root.GetAttributeString) ? parseRev(root.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var hudRev = (hud && hud.GetAttributeString) ? parseRev(hud.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var nextRev = Math.max(gUserEditRevision, panelRev, rootRev, hudRev) + 1;
    gUserEditRevision = nextRev;
    if (panel && panel.SetAttributeString) panel.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev));
    if (root && root.SetAttributeString) root.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev));
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev)); } catch (eHudRev) {}
    }
    PersistStatlockerProfileState(data, MOD_CONFIG);
    EnsureOnDeathArcadeBridgePoller();
    QueueActivePresetHighlightRefresh(0.05);
}

function GetSettingsListPanel() {
    var root = $.GetContextPanel();
    if (!root || !root.FindChildTraverse) return null;
    var list = null;
    try { list = root.FindChildTraverse("SettingsList"); } catch (e0) { list = null; }
    if (!list || !list.IsValid || !list.IsValid()) return null;
    return list;
}

function BuildSettingsListRenderSignature() {
    var langKey = GetSettingsLanguageKey();
    return String(currentTab || "") + "|" + langKey;
}

function IsPanelValidSafe(panel) {
    return !!(panel && panel.IsValid && panel.IsValid());
}

function MakeSettingsListSignatureKey(sig) {
    return String(sig || "").replace(/[^A-Za-z0-9_]/g, "_");
}

function EnsureSettingsListHosts(list) {
    if (!IsPanelValidSafe(list)) return null;
    var cacheHost = list.FindChildTraverse("SettingsListCacheHost");
    if (!IsPanelValidSafe(cacheHost)) {
        cacheHost = $.CreatePanel("Panel", list, "SettingsListCacheHost");
    }
    cacheHost.AddClass("SettingsListContentHost");

    var searchHost = list.FindChildTraverse("SettingsListSearchHost");
    if (!IsPanelValidSafe(searchHost)) {
        searchHost = $.CreatePanel("Panel", list, "SettingsListSearchHost");
    }
    searchHost.AddClass("SettingsListContentHost");
    searchHost.AddClass("SettingsListSearchHost");

    return {
        cacheHost: cacheHost,
        searchHost: searchHost
    };
}

function PruneInvalidSettingsListContentCaches() {
    for (var sig in gSettingsListContentPanelBySig) {
        if (!gSettingsListContentPanelBySig.hasOwnProperty(sig)) continue;
        if (!IsPanelValidSafe(gSettingsListContentPanelBySig[sig])) {
            delete gSettingsListContentPanelBySig[sig];
        }
    }
}

function EnsureSettingsListContentPanelForSignature(list, renderSig, forceRebuild) {
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.cacheHost)) {
        return { panel: null, created: false };
    }

    PruneInvalidSettingsListContentCaches();

    var sig = String(renderSig || "");
    var panel = gSettingsListContentPanelBySig[sig];
    var created = false;

    if (!IsPanelValidSafe(panel)) panel = null;

    if (forceRebuild === true && panel) {
        delete gSettingsListRowSyncFnsBySig[sig];
    }

    if (!panel) {
        var panelId = "SettingsListSig_" + MakeSettingsListSignatureKey(sig);
        panel = hosts.cacheHost.FindChildTraverse(panelId);
        if (!IsPanelValidSafe(panel)) {
            panel = $.CreatePanel("Panel", hosts.cacheHost, panelId);
        }
        panel.AddClass("SettingsListCachedTabContent");
        gSettingsListContentPanelBySig[sig] = panel;
        created = true;
    } else if (panel.GetParent && panel.GetParent() !== hosts.cacheHost) {
        panel.SetParent(hosts.cacheHost);
    }

    return {
        panel: panel,
        created: created
    };
}

function SetActiveSettingsListRenderSignature(renderSig) {
    gSettingsListActiveRenderSig = String(renderSig || "");
    if (!gSettingsListRowSyncFnsBySig.hasOwnProperty(gSettingsListActiveRenderSig)) {
        gSettingsListRowSyncFnsBySig[gSettingsListActiveRenderSig] = [];
    }
}

function ShowSettingsListTabPanel(list, renderSig) {
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.cacheHost) || !IsPanelValidSafe(hosts.searchHost)) return;
    var sig = String(renderSig || "");

    hosts.searchHost.SetHasClass("Hidden", true);
    for (var key in gSettingsListContentPanelBySig) {
        if (!gSettingsListContentPanelBySig.hasOwnProperty(key)) continue;
        var panel = gSettingsListContentPanelBySig[key];
        if (!IsPanelValidSafe(panel)) continue;
        panel.SetHasClass("Hidden", key !== sig);
    }
}

function IsSettingsSearchActiveQuery() {
    return String(currentSearchQuery || "").trim().length > 0;
}

function RenderSettingsSearchResultsOnly(list) {
    if (!list || !list.IsValid || !list.IsValid()) return false;
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.searchHost)) return false;
    HideMinimapSizePreview();
    SetActiveSettingsListRenderSignature("__search__");
    ResetSettingsListRowSyncRegistry();
    ShowSettingsListTabPanel(list, "");
    hosts.searchHost.SetHasClass("Hidden", false);
    hosts.searchHost.RemoveAndDeleteChildren();
    var rendered = RenderSearchResults(hosts.searchHost, currentSearchQuery);
    gSettingsListSearchModeActive = rendered === true;
    UpdatePresetHighlightPollingState();
    return rendered === true;
}

function ResetSettingsListRowSyncRegistry() {
    var sig = String(gSettingsListActiveRenderSig || "");
    gSettingsListRowSyncFns = [];
    gSettingsListRowSyncFnsBySig[sig] = [];
}

function RegisterSettingsListRowSync(fn) {
    if (typeof fn !== "function") return;
    var sig = String(gSettingsListActiveRenderSig || "");
    if (!gSettingsListRowSyncFnsBySig.hasOwnProperty(sig)) {
        gSettingsListRowSyncFnsBySig[sig] = [];
    }
    gSettingsListRowSyncFnsBySig[sig].push(fn);
    gSettingsListRowSyncFns = gSettingsListRowSyncFnsBySig[sig];
}

function RunSettingsListRowSync() {
    var sig = String(gSettingsListActiveRenderSig || "");
    var bucket = gSettingsListRowSyncFnsBySig[sig];
    if (!Array.isArray(bucket) || bucket.length <= 0) return;
    for (var i = bucket.length - 1; i >= 0; i--) {
        var fn = bucket[i];
        if (typeof fn !== "function") {
            bucket.splice(i, 1);
            continue;
        }
        var keep = true;
        try {
            keep = (fn() !== false);
        } catch (e0) {
            keep = false;
        }
        if (!keep) {
            bucket.splice(i, 1);
        }
    }
    gSettingsListRowSyncFnsBySig[sig] = bucket;
    gSettingsListRowSyncFns = bucket;
}

function RefreshRuntimeControlVisuals() {
    for (var key in gRuntimeButtonGroupRefreshers) {
        if (!gRuntimeButtonGroupRefreshers.hasOwnProperty(key)) continue;
        var refreshFn = gRuntimeButtonGroupRefreshers[key];
        if (typeof refreshFn !== "function") continue;
        try { refreshFn(); } catch (e0) {}
    }
    if (Array.isArray(gArcadeOnDeathSyncFns)) {
        for (var i = gArcadeOnDeathSyncFns.length - 1; i >= 0; i--) {
            var syncFn = gArcadeOnDeathSyncFns[i];
            var keep = true;
            if (typeof syncFn !== "function") {
                keep = false;
            } else {
                try { keep = (syncFn() !== false); } catch (e1) { keep = false; }
            }
            if (!keep) gArcadeOnDeathSyncFns.splice(i, 1);
        }
    }
}

function SoftRefreshSettingsListContent(list) {
    var targetList = list || GetSettingsListPanel();
    if (!targetList || !targetList.IsValid || !targetList.IsValid()) return false;
    RefreshRuntimeControlVisuals();
    RunSettingsListRowSync();
    QueueActivePresetHighlightRefresh(0.02);
    return true;
}

function RequestSettingsListRefresh(delaySec, forceRebuild) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0;
    if (forceRebuild === true) gSettingsListRefreshForcePending = true;
    gSettingsListRefreshToken += 1;
    var refreshToken = gSettingsListRefreshToken;

    $.Schedule(delay, function() {
        if (refreshToken !== gSettingsListRefreshToken) return;
        var list = GetSettingsListPanel();
        var shouldForce = (gSettingsListRefreshForcePending === true);
        gSettingsListRefreshForcePending = false;
        if (!list) return;
        UpdateListContent(list, shouldForce);
    });
}

function RefreshSettingsListContent() {
    RequestSettingsListSoftRefresh(0);
}

function RequestSettingsListSoftRefresh(delaySec) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0;
    gSettingsListSoftRefreshToken += 1;
    var refreshToken = gSettingsListSoftRefreshToken;
    $.Schedule(delay, function() {
        if (refreshToken !== gSettingsListSoftRefreshToken) return;
        SoftRefreshSettingsListContent(GetSettingsListPanel());
    });
}

function GetRowResetKeys(rowPanel) {
    if (!rowPanel || !rowPanel.GetAttributeString) return [];
    var raw = "";
    try { raw = rowPanel.GetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, ""); } catch (e0) { raw = ""; }
    if (!raw || raw.length === 0) return [];
    var parts = String(raw).split(",");
    var keys = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
        var key = String(parts[i] || "").trim();
        if (!key || seen[key]) continue;
        seen[key] = true;
        keys.push(key);
    }
    return keys;
}

function ApplyResetForConfigKeys(keys) {
    if (!Array.isArray(keys) || keys.length <= 0) return 0;
    var changed = 0;
    for (var i = 0; i < keys.length; i++) {
        var key = String(keys[i] || "");
        if (!key || !MOD_CONFIG.hasOwnProperty(key) || !DEFAULT_CONFIG.hasOwnProperty(key)) continue;
        if (NormalizeComparableConfigValue(MOD_CONFIG[key]) === NormalizeComparableConfigValue(DEFAULT_CONFIG[key])) continue;
        MOD_CONFIG[key] = DEFAULT_CONFIG[key];
        changed++;
    }
    return changed;
}

function CollectResetKeysFromPanel(panel, outKeys, seen) {
    if (!panel || !outKeys || !seen) return;

    try {
        if (panel.BHasClass && panel.BHasClass("SettingRow")) {
            var rowKeys = GetRowResetKeys(panel);
            for (var i = 0; i < rowKeys.length; i++) {
                var key = rowKeys[i];
                if (!key || seen[key]) continue;
                seen[key] = true;
                outKeys.push(key);
            }
        }
    } catch (e0) {}

    var children = [];
    try { children = panel.Children ? panel.Children() : []; } catch (e1) { children = []; }
    for (var c = 0; c < children.length; c++) {
        CollectResetKeysFromPanel(children[c], outKeys, seen);
    }
}

function CollectResetKeysFromSectionTitleRow(titleRow) {
    var keys = [];
    var seen = {};
    if (!titleRow || !titleRow.GetParent) return keys;
    var parent = titleRow.GetParent();
    if (!parent || !parent.Children) return keys;

    var siblings = [];
    try { siblings = parent.Children() || []; } catch (e0) { siblings = []; }
    var startIndex = -1;
    for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] === titleRow) {
            startIndex = i;
            break;
        }
    }
    if (startIndex < 0) return keys;

    for (var s = startIndex + 1; s < siblings.length; s++) {
        var sibling = siblings[s];
        if (!sibling || !sibling.IsValid || !sibling.IsValid()) continue;
        var isBoundary = false;
        try {
            if ((sibling.BHasClass && sibling.BHasClass("SectionTitleRow")) ||
                (sibling.BHasClass && sibling.BHasClass("SectionTitle")) ||
                (sibling.BHasClass && sibling.BHasClass("RowSeparator"))) {
                isBoundary = true;
            }
        } catch (e1) {}
        if (isBoundary) break;
        CollectResetKeysFromPanel(sibling, keys, seen);
    }
    return keys;
}

function HasAnyChangedConfigKeys(keys) {
    if (!Array.isArray(keys) || keys.length <= 0) return false;
    for (var i = 0; i < keys.length; i++) {
        if (IsConfigKeyChangedFromDefault(keys[i])) return true;
    }
    return false;
}

function CreateSectionResetButton(titleRow, resolveKeysFn, includeEnableKey, parentPanel) {
    if (!titleRow || !titleRow.IsValid || !titleRow.IsValid()) return null;
    if (typeof resolveKeysFn !== "function") return null;

    var resetParent = titleRow;
    if (parentPanel && parentPanel.IsValid && parentPanel.IsValid()) {
        resetParent = parentPanel;
    }

    var resetBtn = $.CreatePanel("Button", resetParent, "");
    resetBtn.AddClass("SectionTitleActionBtn");
    resetBtn.AddClass("SectionResetBtn");
    var resetIcon = $.CreatePanel("Image", resetBtn, "", {
        src: "s2r://panorama/images/icons/icon_refresh.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    resetIcon.AddClass("SectionTitleActionIcon");
    resetIcon.AddClass("SettingRowResetIcon");
    resetIcon.AddClass("QOLResetIcon");
    try { resetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (eIcon) {}

    var buildResetKeys = function() {
        var keys = resolveKeysFn() || [];
        var seen = {};
        var merged = [];
        for (var i = 0; i < keys.length; i++) {
            var k = String(keys[i] || "");
            if (!k || seen[k]) continue;
            if (!MOD_CONFIG.hasOwnProperty(k) || !DEFAULT_CONFIG.hasOwnProperty(k)) continue;
            seen[k] = true;
            merged.push(k);
        }
        if (includeEnableKey) {
            var ek = String(includeEnableKey || "");
            if (ek && !seen[ek] && MOD_CONFIG.hasOwnProperty(ek) && DEFAULT_CONFIG.hasOwnProperty(ek)) {
                merged.push(ek);
            }
        }
        return merged;
    };

    var refreshBtnState = function() {
        if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return;
        var keys = buildResetKeys();
        var hasKeys = keys.length > 0;
        var hasChanges = hasKeys && HasAnyChangedConfigKeys(keys);
        resetBtn.SetHasClass("Hidden", !hasKeys);
        resetBtn.SetHasClass("HasChanges", hasChanges);
    };

    resetBtn.SetPanelEvent("onmouseover", function() {
        HideSettingsTextTooltip();
        CancelSettingsRowFloatingTooltipHide();
        ShowSettingsRowFloatingTooltip(
            resetBtn,
            "",
            LocalizeSettingsText("Reset section to defaults", true),
            PERF_IMPACT_TIER_NONE,
            ""
        );
    });
    resetBtn.SetPanelEvent("onmouseout", function() {
        HideSettingsTextTooltip();
        HideSettingsRowFloatingTooltipDeferred("section_reset_btn_mouseout");
    });
    resetBtn.SetPanelEvent("onactivate", function() {
        var keys = buildResetKeys();
        var changed = ApplyResetForConfigKeys(keys);
        if (changed > 0) {
            SaveAndSync();
            SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u043E \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A: " + String(changed))
                : ("Section reset (" + String(changed) + " changed)."), "success", 1800);
            RequestSettingsListSoftRefresh(0);
        } else {
            SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                ? "\u0421\u0435\u043A\u0446\u0438\u044F \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                : "Section already at defaults.", "info", 1400);
        }
    });

    refreshBtnState();
    $.Schedule(0.0, refreshBtnState);
    RegisterSettingsListRowSync(function() {
        if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return false;
        refreshBtnState();
        return true;
    });
    return resetBtn;
}

function SetConfigFeedbackMessage(message, tone, holdMs) {
    var label = gConfigFeedbackLabel;
    if (!label || !label.IsValid || !label.IsValid()) return;

    var safeMessage = String(message || "");
    label.text = safeMessage;
    label.SetHasClass("FeedbackInfo", tone === "info");
    label.SetHasClass("FeedbackSuccess", tone === "success");
    label.SetHasClass("FeedbackWarning", tone === "warning");
    label.SetHasClass("FeedbackError", tone === "error");

    var hold = Math.max(0, Math.round(Number(holdMs) || 0));
    if (hold <= 0) return;

    gConfigFeedbackClearToken++;
    var token = gConfigFeedbackClearToken;
    $.Schedule(hold / 1000.0, function() {
        if (token !== gConfigFeedbackClearToken) return;
        if (!gConfigFeedbackLabel || !gConfigFeedbackLabel.IsValid || !gConfigFeedbackLabel.IsValid()) return;
        gConfigFeedbackLabel.text = "";
        gConfigFeedbackLabel.SetHasClass("FeedbackInfo", true);
        gConfigFeedbackLabel.SetHasClass("FeedbackSuccess", false);
        gConfigFeedbackLabel.SetHasClass("FeedbackWarning", false);
        gConfigFeedbackLabel.SetHasClass("FeedbackError", false);
    });
}

function CloseModal(overlay) {
    if (!overlay || !overlay.IsValid()) return;
    var overlayId = "";
    try { overlayId = String(overlay.id || ""); } catch (e0) { overlayId = ""; }
    if (overlayId.indexOf("Arcade") === 0) {
        var onDeathBridgeState = GetOnDeathArcadeBridgeState();
        if (onDeathBridgeState.active) {
            gOnDeathArcadeSessionActive = false;
            gOnDeathArcadeLastRequestToken = String(onDeathBridgeState.token || gOnDeathArcadeLastRequestToken || "");
            ForceCloseEscapeMenuForOnDeathGames();
        }
    }
    overlay.RemoveClass("Show");
    $.Schedule(0.25, function() {
        if (overlay.IsValid()) overlay.DeleteAsync(0);
    });
}

function CloseConfigDiffPreviewModalIfOpen() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel || !rootPanel.IsValid || !rootPanel.IsValid()) return;
    var existing = rootPanel.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    if (existing && existing.IsValid && existing.IsValid()) {
        CloseModal(existing);
    }
}

function CloseSettingsSideModalsIfOpen() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel || !rootPanel.IsValid || !rootPanel.IsValid()) return;
    var overlayIds = [
        "BuildSaveConfirmModalOverlay",
        "BuildSaveHideoutOnlyModalOverlay",
        "SavingSettingsModalOverlay",
        "OptimizeFilterDownloadModalOverlay",
        "SupportCommissionModalOverlay",
        "ConfigDiffPreviewModalOverlay"
    ];
    for (var i = 0; i < overlayIds.length; i++) {
        var overlayId = overlayIds[i];
        if (!overlayId) continue;
        var existing = rootPanel.FindChildTraverse(overlayId);
        if (existing && existing.IsValid && existing.IsValid()) {
            CloseModal(existing);
        }
    }
}

function OpenBuildSaveHideoutOnlyModal() {
    var rootPanel = $.GetContextPanel();
    var existing = rootPanel.FindChildTraverse("BuildSaveHideoutOnlyModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var overlay = $.CreatePanel("Panel", rootPanel, "BuildSaveHideoutOnlyModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() { overlay.AddClass("Show"); });

    var modalContainer = $.CreatePanel("Panel", overlay, "ExportModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.style.width = "250px";
    modalContainer.AddClass("MetroModalContainer");

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("MetroModalCenteredText");
    header.text = "Warning";

    var message = $.CreatePanel("Label", modalContainer, "");
    message.AddClass("ModalInstructions");
    message.AddClass("MetroModalCenteredText");
    message.text = "THIS FEATURE IS ONLY FOR HIDEOUT";

    var btnRow = $.CreatePanel("Panel", modalContainer, "ModalBtnRow");
    btnRow.AddClass("MetroModalBtnRow");
    var closeModalBtn = $.CreatePanel("Button", btnRow, "");
    closeModalBtn.AddClass("ModalBtnApply");
    closeModalBtn.AddClass("MetroModalBtn");
    var closeModalLbl = $.CreatePanel("Label", closeModalBtn, "");
    closeModalLbl.text = "OK";
    closeModalBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
}

function OpenSavingSettingsModal() {
    var isRu = IsRussianSettingsLanguage();
    var rootPanel = $.GetContextPanel();
    var existing = rootPanel.FindChildTraverse("SavingSettingsModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var overlay = $.CreatePanel("Panel", rootPanel, "SavingSettingsModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() { overlay.AddClass("Show"); });

    var modalContainer = $.CreatePanel("Panel", overlay, "ExportModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.style.width = "560px";
    modalContainer.AddClass("MetroModalContainer");

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("MetroModalCenteredText");
    header.text = isRu ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A" : "Saving Settings";

    var intro = $.CreatePanel("Label", modalContainer, "");
    intro.AddClass("ModalInstructions");
    intro.text = isRu
        ? "\u0418\u0437-\u0437\u0430 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0439 \u0438\u0433\u0440\u044B \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438 \u043E\u0447\u0435\u043D\u044C \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u044B.\n\u0412\u043E\u0442 \u043A\u0430\u043A \u044D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442."
        : "Due to game limitations we are very restricted.\nHere is how it works.";

    var saveHeader = $.CreatePanel("Label", modalContainer, "");
    saveHeader.AddClass("ModalInstructions");
    saveHeader.text = isRu ? "\u041A\u043D\u043E\u043F\u043A\u0430 Save:" : "Save Button:";
    saveHeader.style.color = "#66cc99";
    saveHeader.style.fontWeight = "bold";

    var saveBody = $.CreatePanel("Label", modalContainer, "");
    saveBody.AddClass("ModalInstructions");
    saveBody.text = isRu
        ? "1. \u0412\u0430\u0448\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0432 \u0432\u0438\u0434\u0435 \u0441\u0442\u0440\u043E\u043A\u0438.\n" +
          "2. \u041F\u0440\u0438 \u043D\u0430\u0436\u0430\u0442\u0438\u0438 Save \u0432\u0430\u0441 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043D\u0430 \u043D\u0435\u0432\u044B\u043F\u0443\u0449\u0435\u043D\u043D\u043E\u0433\u043E \u0433\u0435\u0440\u043E\u044F.\n" +
          "3. \u0411\u0438\u043B\u0434 \u044D\u0442\u043E\u0433\u043E \u0433\u0435\u0440\u043E\u044F \u0438\u0437\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0434\u0430\u043D\u043D\u044B\u0445.\n" +
          "4. \u0417\u0430\u0442\u0435\u043C \u0432\u0430\u0441 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043E\u0431\u0440\u0430\u0442\u043D\u043E."
        : "1. Your settings are saved as a string.\n" +
          "2. Clicking Save button switches you to an unreleased hero.\n" +
          "3. The Hero's build is modified to save your data.\n" +
          "4. You are switched back.";

    var loadHeader = $.CreatePanel("Label", modalContainer, "");
    loadHeader.AddClass("ModalInstructions");
    loadHeader.text = isRu ? "\u041F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0438\u0433\u0440\u044B:" : "On Game Load:";
    loadHeader.style.color = "#66cc99";
    loadHeader.style.fontWeight = "bold";

    var loadBody = $.CreatePanel("Label", modalContainer, "");
    loadBody.AddClass("ModalInstructions");
    loadBody.text = isRu
        ? "1. \u0412\u0430\u0441 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043D\u0430 \u043D\u0435\u0432\u044B\u043F\u0443\u0449\u0435\u043D\u043D\u043E\u0433\u043E \u0433\u0435\u0440\u043E\u044F.\n" +
          "2. \u0414\u0430\u043D\u043D\u044B\u0435 \u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u0438\u0437 \u0431\u0438\u043B\u0434\u0430; \u0435\u0441\u043B\u0438 \u043F\u0443\u0441\u0442\u043E, \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0441\u044F \u043A\u043E\u043D\u0444\u0438\u0433 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E.\n" +
          "3. \u0412\u0430\u0448\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F.\n" +
          "4. \u0412\u0430\u0441 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043E\u0431\u0440\u0430\u0442\u043D\u043E.\n\n" +
          "\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043D\u0435 \u0441\u043F\u0430\u043C\u044C\u0442\u0435 Save \u0438 \u0434\u0430\u0439\u0442\u0435 \u0438\u0433\u0440\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A."
        : "1. You are switched to the unreleased hero.\n" +
          "2. Your data is read from your build, if blank default config.\n" +
          "3. Your settings are applied.\n" +
          "4. You are switched back.\n\n" +
          "Please be patient on clicking save and game load to not create issues!";

    var btnRow = $.CreatePanel("Panel", modalContainer, "ModalBtnRow");
    btnRow.AddClass("MetroModalBtnRow");
    var closeModalBtn = $.CreatePanel("Button", btnRow, "");
    closeModalBtn.AddClass("ModalBtnApply");
    closeModalBtn.AddClass("MetroModalBtn");
    var closeModalLbl = $.CreatePanel("Label", closeModalBtn, "");
    closeModalLbl.text = "OK";
    closeModalBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
}

function OpenOptimizeFilterDownloadModal() {
    var rootPanel = $.GetContextPanel();
    var existing = rootPanel.FindChildTraverse("OptimizeFilterDownloadModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var overlay = $.CreatePanel("Panel", rootPanel, "OptimizeFilterDownloadModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() { overlay.AddClass("Show"); });

    var modalContainer = $.CreatePanel("Panel", overlay, "ExportModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.style.width = "560px";
    modalContainer.AddClass("OptimizeFilterModalContainer");

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var title = $.CreatePanel("Label", modalContainer, "");
    title.AddClass("ModalTitle");
    title.text = LocalizeSettingsText("Optimized Item Cooldown Filter", true);

    var line1 = $.CreatePanel("Label", modalContainer, "");
    line1.AddClass("ModalInstructions");
    line1.AddClass("OptimizeFilterModalLine");
    line1.text = LocalizeSettingsText("To filter this setting you need a separate file.", true);

    var line2 = $.CreatePanel("Label", modalContainer, "");
    line2.AddClass("ModalInstructions");
    line2.AddClass("OptimizeFilterModalLine");
    line2.text = LocalizeSettingsText("Use the link below to download it.", true);

    var warnRow = $.CreatePanel("Panel", modalContainer, "");
    warnRow.AddClass("OptimizeFilterModalWarnRow");

    var warnOnly = $.CreatePanel("Label", warnRow, "");
    warnOnly.AddClass("OptimizeFilterModalWarnAccent");
    warnOnly.text = LocalizeSettingsText("ONLY", true);

    var warnDownload = $.CreatePanel("Label", warnRow, "");
    warnDownload.AddClass("OptimizeFilterModalWarnText");
    warnDownload.text = LocalizeSettingsText("download", true);

    var warnOne = $.CreatePanel("Label", warnRow, "");
    warnOne.AddClass("OptimizeFilterModalWarnAccent");
    warnOne.text = LocalizeSettingsText("ONE", true);

    var warnSuffix = $.CreatePanel("Label", warnRow, "");
    warnSuffix.AddClass("OptimizeFilterModalWarnText");
    warnSuffix.text = LocalizeSettingsText("filter file.", true);

    var line3 = $.CreatePanel("Label", modalContainer, "");
    line3.AddClass("ModalInstructions");
    line3.AddClass("OptimizeFilterModalLine");
    line3.text = LocalizeSettingsText("Use one click installer button.", true);

    var line4 = $.CreatePanel("Label", modalContainer, "");
    line4.AddClass("ModalInstructions");
    line4.AddClass("OptimizeFilterModalLine");
    line4.text = LocalizeSettingsText("These can break on updates, make sure to update.", true);

    var btnRow = $.CreatePanel("Panel", modalContainer, "");
    btnRow.AddClass("OptimizeFilterModalBtnRow");

    var downloadBtn = $.CreatePanel("Button", btnRow, "");
    downloadBtn.AddClass("ModalBtnApply");
    downloadBtn.AddClass("OptimizeFilterModalDownloadBtn");

    var downloadLbl = $.CreatePanel("Label", downloadBtn, "");
    downloadLbl.text = LocalizeSettingsText("Download", true);

    downloadBtn.SetPanelEvent("onactivate", function() {
        $.DispatchEvent("ExternalBrowserGoToURL", "https://gamebanana.com/mods/601444");
        CloseModal(overlay);
    });
}

function OpenSupportCommissionModal() {
    var rootPanel = $.GetContextPanel();
    var existing = rootPanel.FindChildTraverse("SupportCommissionModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var overlay = $.CreatePanel("Panel", rootPanel, "SupportCommissionModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() { overlay.AddClass("Show"); });

    var modalContainer = $.CreatePanel("Panel", overlay, "ExportModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.style.width = "620px";
    modalContainer.AddClass("OptimizeFilterModalContainer");
    modalContainer.AddClass("SupportCommissionModalContainer");

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var title = $.CreatePanel("Label", modalContainer, "");
    title.AddClass("ModalTitle");
    title.text = LocalizeSettingsText("Commission Information", true);

    function StripSupportTerminalPeriod(textValue) {
        if (textValue === undefined || textValue === null) return "";
        var v = String(textValue);
        return v.endsWith(".") ? v.slice(0, -1) : v;
    }

    function AddCommissionLine(text, isHtml) {
        var line = $.CreatePanel("Label", modalContainer, "", isHtml ? { html: "true" } : {});
        line.AddClass("ModalInstructions");
        line.AddClass("OptimizeFilterModalLine");
        line.text = StripSupportTerminalPeriod(LocalizeSettingsText(text, true));
        return line;
    }

    AddCommissionLine("This is a way for me to give something back to the supporters.", false);
    AddCommissionLine("All commissioned additions are released publicly and available to everyone.", false);
    AddCommissionLine('The mod is <font color="#66cc99">fully functional</font> and <font color="#66cc99">free</font> for all users.', true);
    AddCommissionLine('Custom Preset Commission: <font color="#66cc99">$25</font>', true);
    AddCommissionLine('New Feature Commission: <font color="#66cc99">$10</font> to <font color="#66cc99">$100</font>', true);

    var contactRow = $.CreatePanel("Panel", modalContainer, "SupportCommissionModalContactRow");
    contactRow.AddClass("SupportCommissionModalContactRow");
    var contactText = $.CreatePanel("Label", contactRow, "");
    contactText.AddClass("ModalInstructions");
    contactText.AddClass("OptimizeFilterModalLine");
    contactText.AddClass("SupportCommissionModalContactText");
    contactText.text = LocalizeSettingsText("Depending on complexity and work involved, contact me on Discord", true);

    var contactDiscordBtn = $.CreatePanel("Button", contactRow, "SupportCommissionModalDiscordBtn");
    contactDiscordBtn.AddClass("HeaderDiscordLinkButton");
    contactDiscordBtn.AddClass("SupportTabDiscordIconBtn");
    contactDiscordBtn.AddClass("SupportTabDiscordInlineIconBtn");
    EnsureDiscordTextureLogo(contactDiscordBtn, "SupportCommissionModalDiscordLogoTexture", "HeaderDiscordLogoTexture");
    contactDiscordBtn.SetPanelEvent("onactivate", function() {
        $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/YkRgwfPt9S");
    });
}

function SyncTabActiveStates(tabBar) {
    if (!tabBar || !tabBar.IsValid || !tabBar.IsValid()) return;
    var settingsWindow = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (settingsWindow && settingsWindow.SetHasClass) {
    settingsWindow.SetHasClass("SettingsLangRU", IsRussianSettingsLanguage());
    settingsWindow.SetHasClass("SettingsLangFR", IsFrenchSettingsLanguage());
    settingsWindow.SetHasClass("SettingsLangPT", IsPortugueseSettingsLanguage());
    settingsWindow.SetHasClass("SettingsLangPTBR", IsBrazilianPortugueseSettingsLanguage());
    settingsWindow.SetHasClass("SettingsLangES", IsSpanishSettingsLanguage());
    }
    var tabListHost = tabBar.FindChildTraverse("SettingsTabRailTabs");
    if (tabListHost) {
        var children = tabListHost.Children();
        for (var i = 0; i < children.length; i++) {
            if (!children[i] || !children[i].id || children[i].id.indexOf("TabButton_") !== 0) continue;
            children[i].SetHasClass("Active", children[i].id === ("TabButton_" + currentTab.replace(" ", "")));
            var tabLabel = children[i].FindChildTraverse("TabLabel");
            if (tabLabel) {
                var baseTabName = String(children[i].id).slice("TabButton_".length);
                tabLabel.text = LocalizeSettingsText(baseTabName, true);
            }
        }
    }
    var supportFooterBtn = tabBar.FindChildTraverse("FooterSupportTabButton");
    if (supportFooterBtn) {
        supportFooterBtn.DeleteAsync(0);
    }

    var tabFooter = tabBar.FindChildTraverse("SettingsTabRailFooter");
    var isRuFooter = IsRussianSettingsLanguage();
    var newsFooterBtn = tabFooter ? tabFooter.FindChildTraverse("FooterNewsLinkButton") : null;
    var staleDiscordFooterBtn = tabBar.FindChildTraverse("FooterDiscordLinkButton");
    if (staleDiscordFooterBtn) {
        staleDiscordFooterBtn.DeleteAsync(0);
        staleDiscordFooterBtn = null;
    }
    if (newsFooterBtn) {
        newsFooterBtn.DeleteAsync(0);
        newsFooterBtn = null;
    }
    var saveFooterBtn = tabFooter ? tabFooter.FindChildTraverse("FooterSaveBuildButton") : null;
}

function UpdateSettingsSearchUiState(rootPanel) {
    var root = rootPanel || $.GetContextPanel();
    if (!root || !root.FindChildTraverse) return;
    var searchWrap = root.FindChildTraverse("SettingsSearchWrap");
    var searchInput = root.FindChildTraverse("SettingsSearchInput");
    var hasText = false;
    if (searchInput && searchInput.IsValid && searchInput.IsValid()) {
        hasText = String(searchInput.text || "").length > 0;
    }
    if (searchWrap && searchWrap.IsValid && searchWrap.IsValid()) {
        searchWrap.SetHasClass("HasSearchText", hasText);
    }
}

function ClearSettingsSearchQuery(rootPanel) {
    currentSearchQuery = "";
    var root = rootPanel || $.GetContextPanel();
    var searchInput = root ? root.FindChildTraverse("SettingsSearchInput") : null;
    if (searchInput && searchInput.IsValid && searchInput.IsValid()) {
        if ((searchInput.text || "") !== "") {
            searchInput.text = "";
        }
        if (searchInput.ClearSelection) {
            searchInput.ClearSelection();
        }
    }
    UpdateSettingsSearchUiState(root);
}

function CloseOpenSettingsDropdowns(rootPanel, options) {
    var root = rootPanel || $.GetContextPanel();
    if (!root || !root.IsValid || !root.IsValid()) return;
    var skipFocusTransfer = !!(options && options.skipFocusTransfer === true);

    var searchRoots = [];
    var seenRoots = [];
    var cursor = root;
    while (cursor && cursor.IsValid && cursor.IsValid()) {
        if (seenRoots.indexOf(cursor) === -1) {
            seenRoots.push(cursor);
            searchRoots.push(cursor);
        }
        if (!cursor.GetParent) break;
        cursor = cursor.GetParent();
    }

    var dropdownPanels = [];
    for (var rootIndex = 0; rootIndex < searchRoots.length; rootIndex++) {
        var searchRoot = searchRoots[rootIndex];
        if (!searchRoot || !searchRoot.IsValid || !searchRoot.IsValid()) continue;
        var foundDropdowns = [];
        try { foundDropdowns = searchRoot.FindChildrenWithClassTraverse ? (searchRoot.FindChildrenWithClassTraverse("QOLSettingsDropDown") || []) : []; } catch (e0) { foundDropdowns = []; }
        for (var foundIndex = 0; foundIndex < foundDropdowns.length; foundIndex++) {
            var foundDropdown = foundDropdowns[foundIndex];
            if (!foundDropdown || !foundDropdown.IsValid || !foundDropdown.IsValid()) continue;
            if (dropdownPanels.indexOf(foundDropdown) !== -1) continue;
            dropdownPanels.push(foundDropdown);
        }
    }
    for (var iDropdown = 0; iDropdown < dropdownPanels.length; iDropdown++) {
        var dropdownPanel = dropdownPanels[iDropdown];
        if (!dropdownPanel || !dropdownPanel.IsValid || !dropdownPanel.IsValid()) continue;
        var menuPanel = null;
        var dropdownWasOpen = false;
        try { dropdownWasOpen = dropdownPanel.BHasClass && dropdownPanel.BHasClass("DropDownMenuVisible"); } catch (eDropdownOpen) { dropdownWasOpen = false; }
        for (var searchIndex = 0; searchIndex < searchRoots.length && !menuPanel; searchIndex++) {
            var menuSearchRoot = searchRoots[searchIndex];
            if (!menuSearchRoot || !menuSearchRoot.IsValid || !menuSearchRoot.IsValid()) continue;
            try { menuPanel = menuSearchRoot.FindChildTraverse(String(dropdownPanel.id || "") + "DropDownMenu"); } catch (e4) { menuPanel = null; }
        }
        if (menuPanel && menuPanel.IsValid && menuPanel.IsValid()) {
            try { dropdownWasOpen = dropdownWasOpen || !!menuPanel.visible; } catch (eMenuVisible) {}
            try { dropdownWasOpen = dropdownWasOpen || (menuPanel.BHasClass && menuPanel.BHasClass("DropDownMenuVisible")); } catch (eMenuClass) {}
        }
        try { dropdownPanel.SetHasClass("DropDownMenuVisible", false); } catch (e1) {}
        try { dropdownPanel.RemoveClass("DropDownMenuVisible"); } catch (e2) {}
        try { dropdownPanel.visible = true; } catch (e2b) {}
        if (!skipFocusTransfer && dropdownWasOpen) {
            try { dropdownPanel.SetFocus(); } catch (e3) {}
        }
        if (menuPanel && menuPanel.IsValid && menuPanel.IsValid()) {
            try { menuPanel.SetHasClass("DropDownMenuVisible", false); } catch (e5) {}
            try { menuPanel.RemoveClass("DropDownMenuVisible"); } catch (e6) {}
            try { menuPanel.visible = false; } catch (e7) {}
        }
    }

    var floatingMenus = [];
    for (var floatingRootIndex = 0; floatingRootIndex < searchRoots.length; floatingRootIndex++) {
        var floatingSearchRoot = searchRoots[floatingRootIndex];
        if (!floatingSearchRoot || !floatingSearchRoot.IsValid || !floatingSearchRoot.IsValid()) continue;
        var foundMenus = [];
        try { foundMenus = floatingSearchRoot.FindChildrenWithClassTraverse ? (floatingSearchRoot.FindChildrenWithClassTraverse("DropDownMenuVisible") || []) : []; } catch (e8) { foundMenus = []; }
        for (var foundMenuIndex = 0; foundMenuIndex < foundMenus.length; foundMenuIndex++) {
            var foundMenu = foundMenus[foundMenuIndex];
            if (!foundMenu || !foundMenu.IsValid || !foundMenu.IsValid()) continue;
            if (floatingMenus.indexOf(foundMenu) !== -1) continue;
            floatingMenus.push(foundMenu);
        }
    }
    for (var iMenu = 0; iMenu < floatingMenus.length; iMenu++) {
        var floatingMenu = floatingMenus[iMenu];
        if (!floatingMenu || !floatingMenu.IsValid || !floatingMenu.IsValid()) continue;
        try { floatingMenu.SetHasClass("DropDownMenuVisible", false); } catch (e9) {}
        try { floatingMenu.RemoveClass("DropDownMenuVisible"); } catch (e10) {}
        try { floatingMenu.visible = false; } catch (e11) {}
    }
}

function SetActiveTabAndRefresh(tabName) {
    if (!tabName || currentTab === tabName) return;
    var root = $.GetContextPanel();
    var tabBar = root.FindChildTraverse("SettingsTabBar");
    var list = root.FindChildTraverse("SettingsList");
    CloseOpenSettingsDropdowns(root);
    ClearSettingsSearchQuery(root);

    if (
        list && list.IsValid && list.IsValid() &&
        tabBar && tabBar.IsValid && tabBar.IsValid() &&
        !list.BHasClass("TabFading")
    ) {
        list.AddClass("TabFading");
        $.Schedule(0.2, function() {
            if (!list || !list.IsValid || !list.IsValid()) return;
            if (!tabBar || !tabBar.IsValid || !tabBar.IsValid()) return;
            currentTab = tabName;
            SyncTabActiveStates(tabBar);
            UpdateListContent(list, true);
            UpdatePresetHighlightPollingState();
            list.RemoveClass("TabFading");
        });
        return;
    }

    currentTab = tabName;
    SyncTabActiveStates(tabBar);
    if (list && list.IsValid && list.IsValid()) {
        UpdateListContent(list, true);
    }
    UpdatePresetHighlightPollingState();
}

function GetCurrentExportSettingsString() {
    var compact = SerializeCompactV2(MOD_CONFIG);
    var encoded = ToBase64Url(compact);
    return EXPORT_PREFIX + encoded;
}

function FormatExportSettingsDisplayString(rawExport) {
    if (!rawExport) return "";
    var normalized = String(rawExport).replace(/\s+/g, "");
    var prefixMatch = normalized.match(/^\[QOL-\d+-\d+-\d+\]:/i);
    var prefixLen = prefixMatch ? prefixMatch[0].length : 0;
    var payloadLen = normalized.length - prefixLen;
    if (payloadLen <= 24) return normalized;
    var firstPayloadLen = Math.ceil(payloadLen / 2);
    var breakIndex = prefixLen + firstPayloadLen;
    if (breakIndex <= 0 || breakIndex >= normalized.length) return normalized;
    return normalized.slice(0, breakIndex) + "\n" + normalized.slice(breakIndex);
}

function FormatImportSettingsDisplayString(rawImport) {
    if (!rawImport) return "";
    var normalized = String(rawImport).replace(/\s+/g, "");
    if (!/^\[QOL-\d+-\d+-\d+\]:/i.test(normalized)) {
        return rawImport;
    }
    return FormatExportSettingsDisplayString(normalized);
}

function TryCopyTextToClipboard(text, textEntryPanel) {
    if (!text || text.length === 0) return false;
    var copied = false;
    var attempts = [
        function() { $.DispatchEvent("CopyStringToClipboard", text); },
        function() { $.DispatchEvent("CopyToClipboard", text); },
        function() { $.DispatchEvent("SetClipboardText", text); },
        function() {
            if (!textEntryPanel || !textEntryPanel.IsValid || !textEntryPanel.IsValid()) return;
            textEntryPanel.SetFocus();
            textEntryPanel.SelectAll();
            $.DispatchEvent("TextEntryCopyToClipboard", textEntryPanel);
        }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
            copied = true;
            break;
        } catch (e) {}
    }
    return copied;
}

function TryPasteTextFromClipboard(textEntryPanel) {
    if (!textEntryPanel || !textEntryPanel.IsValid || !textEntryPanel.IsValid()) return false;
    textEntryPanel.SetFocus();
    if (textEntryPanel.SelectAll) {
        try { textEntryPanel.SelectAll(); } catch (e) {}
    }
    var pasted = false;
    var attempts = [
        function() {
            $.DispatchEvent("TextEntryPasteFromClipboard", textEntryPanel);
        },
        function() {
            $.DispatchEvent("TextEntryPasteClipboard", textEntryPanel);
        },
        function() {
            $.DispatchEvent("TextEntryPaste", textEntryPanel);
        },
        function() {
            $.DispatchEvent("UI_TextEntry_PasteClipboard", textEntryPanel);
        },
        function() {
            $.DispatchEvent("PasteFromClipboard", textEntryPanel);
        },
        function() {
            $.DispatchEvent("PasteToTextEntry", textEntryPanel);
        },
        function() {
            $.DispatchEvent("PasteClipboard", textEntryPanel);
        },
        function() {
            if (textEntryPanel.Paste) {
                textEntryPanel.Paste();
                return;
            }
            throw new Error("Paste method unavailable");
        },
        function() {
            $.DispatchEvent("PasteFromClipboard");
        }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
            pasted = true;
            break;
        } catch (e) {}
    }
    return pasted;
}

function RenderConfigTabContent(list) {
    gCurrentSettingsSectionTitle = "";
    var cfgCopy = LocalizeSettingsText("COPY", true);
    var cfgCopied = LocalizeSettingsText("COPIED", true);
    var cfgFailed = LocalizeSettingsText("FAILED", true);
    var cfgClear = LocalizeSettingsText("CLEAR", true);
    var cfgApply = LocalizeSettingsText("APPLY", true);
    var cfgApplied = LocalizeSettingsText("APPLIED", true);
    gConfigFeedbackLabel = null;
    gConfigFeedbackClearToken++;

    if (gSearchCollectMode && gSearchCollectState) {
        CreateSectionTitle(list, "Meta Settings");
        CreateRow(list, "Preview", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
        CreateRow(list, "Troubleshoot", "TEST_AIRHEART", "actionbutton", null, null, null, [
            { label: "Swap" }
        ], "This is to switch to the Airheart hero (looks like Paradox), your settings are saved in the shop builds. To troubleshoot you can delete these and do a fresh save to fix any settings saving issues.");
        CreateRow(list, "Language", "LANGUAGE", "dropdown", null, null, null, [
            { label: "English", value: 0 },
            { label: "Russian", value: 1 },
            { label: "Chinese", value: 2 },
            { label: "French", value: 3 },
            { label: "Portuguese", value: 4 },
            { label: "BR Portuguese", value: 5 },
            { label: "Spanish", value: 6 }
        ]);
        CreateRow(list, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, DEFAULT_HERO_DROPDOWN_OPTIONS);

        CreateSeparator(list);
        CreateSectionTitle(list, "Export Settings");
        CreateRow(list, "Export String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
            { label: "Open Config" }
        ], "Share your settings string");

        CreateSeparator(list);
        CreateSectionTitle(list, "Import Settings");
        CreateRow(list, "Import String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
            { label: "Open Config" }
        ], "Paste and apply an exported settings string");
        return;
    }

    CreateSectionTitle(list, "Meta Settings");
    CreateRow(list, "Preview", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
    CreateRow(list, "Troubleshoot", "TEST_AIRHEART", "actionbutton", null, null, null, [
        { label: "Swap" }
    ], "This is to switch to the Airheart hero (looks like Paradox), your settings are saved in the shop builds. To troubleshoot you can delete these and do a fresh save to fix any settings saving issues.");
    CreateRow(list, "Language", "LANGUAGE", "dropdown", null, null, null, [
        { label: "English", value: 0 },
        { label: "Russian", value: 1 },
        { label: "Chinese", value: 2 },
        { label: "French", value: 3 },
        { label: "Portuguese", value: 4 },
        { label: "BR Portuguese", value: 5 },
        { label: "Spanish", value: 6 }
    ]);
    CreateRow(list, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, DEFAULT_HERO_DROPDOWN_OPTIONS);

    CreateSeparator(list);

    var exportHeader = CreateSectionTitle(list, "Export Settings");
    var copyBtn = CreateSectionInlineIconButton(exportHeader, "ConfigCopyBtn", "s2r://panorama/images/icons/icon_copy.vsvg", "Copy our settings code to clipboard.");
    var exportTextEntry = $.CreatePanel("TextEntry", list, "ConfigExportTextEntry");
    exportTextEntry.AddClass("ConfigTextEntry");
    exportTextEntry.multiline = true;
    exportTextEntry.maxchars = 2000;
    exportTextEntry.text = FormatExportSettingsDisplayString(GetCurrentExportSettingsString());
    exportTextEntry.SetPanelEvent("onfocus", function() {
        exportTextEntry.SelectAll();
    });

    copyBtn.SetPanelEvent("onactivate", function() {
        var exportRaw = GetCurrentExportSettingsString();
        exportTextEntry.text = FormatExportSettingsDisplayString(exportRaw);
        var copied = TryCopyTextToClipboard(exportRaw, exportTextEntry);
        if (copied) {
            copyBtn.RemoveClass("FailureState");
            copyBtn.AddClass("SuccessState");
        SetLocalizedConfigFeedbackMessage("Export string copied.", "success", 1800);
            $.Schedule(0.6, function() {
                if (!copyBtn || !copyBtn.IsValid || !copyBtn.IsValid()) return;
                copyBtn.RemoveClass("SuccessState");
            });
        } else {
            copyBtn.RemoveClass("SuccessState");
            copyBtn.AddClass("FailureState");
        SetLocalizedConfigFeedbackMessage("Clipboard copy failed.", "error", 2200);
            $.Schedule(0.5, function() {
                if (!copyBtn || !copyBtn.IsValid || !copyBtn.IsValid()) return;
                copyBtn.RemoveClass("FailureState");
            });
        }
    });

    var configFeedback = $.CreatePanel("Label", list, "ConfigFeedbackLabel");
    configFeedback.AddClass("ConfigFeedbackLabel");
    gConfigFeedbackLabel = configFeedback;
    SetConfigFeedbackMessage("", "info", 0);

    CreateSeparator(list);

    var importHeader = CreateSectionTitle(list, "Import Settings");
    var applyBtn = CreateSectionInlineIconButton(importHeader, "ConfigApplyBtn", "s2r://panorama/images/icons/checkbox_check.vsvg", "Apply your settings code to your configuration.");

    var importTextEntry = $.CreatePanel("TextEntry", list, "ConfigImportTextEntry");
    importTextEntry.AddClass("ConfigTextEntry");
    importTextEntry.multiline = true;
    importTextEntry.text = "";
    var importFormattingInProgress = false;
    importTextEntry.SetPanelEvent("ontextentrychange", function() {
        if (importFormattingInProgress) return;
        var current = importTextEntry.text || "";
        var formatted = FormatImportSettingsDisplayString(current);
        if (formatted !== current) {
            importFormattingInProgress = true;
            importTextEntry.text = formatted;
            importFormattingInProgress = false;
        }
    });

    applyBtn.SetPanelEvent("onactivate", function() {
        var raw = importTextEntry.text;
        if (!raw || raw.length === 0) return;
        try {
            SetLocalizedConfigFeedbackMessage("Import: parsing string...", "info", 0);
            var importResult = TryApplyImportStringWithDiagnostics(raw);
            if (!importResult || importResult.ok !== true || !importResult.parsedConfig || !importResult.candidateConfig) {
                throw new Error("Invalid import string");
            }

            var diffRows = BuildConfigDiffRows(MOD_CONFIG, importResult.candidateConfig);
            var schemaText = importResult.schemaVersion
                ? ("[QOL-" + String(importResult.schemaVersion).replace(/\./g, "-") + "]")
                : "[unknown]";
            var detailsText = IsRussianSettingsLanguage()
                ? ("\u0421\u0445\u0435\u043C\u0430 " + schemaText + " | clamp=" + String(importResult.clampedKeys) + " | unknown=" + String(importResult.unknownKeys))
                : ("Schema " + schemaText + " | clamped=" + String(importResult.clampedKeys) + " | unknown=" + String(importResult.unknownKeys));

            OpenConfigDiffPreviewModal({
                title: "Settings Changes",
                summary: "Changes: " + String(diffRows.length),
                details: detailsText,
                rows: diffRows,
                applyText: "Confirm",
                cancelText: "Cancel",
                onApply: function() {
                    try {
                        SetLocalizedConfigFeedbackMessage("Import: applying settings...", "info", 0);
                        var appliedDiag = ApplyParsedConfigWithDiagnostics(importResult.parsedConfig, importResult.schemaVersion || LATEST_COMPACT_SEMVER);
                        SaveAndSync();
                        SetLocalizedConfigFeedbackMessage("Import: refreshing UI...", "info", 0);
                        if (importHeader) {
                            importHeader.text = LocalizeSettingsText("Import Settings", true);
                            importHeader.style.color = "#ffffff";
                        }
                        applyBtn.RemoveClass("FailureState");
                        applyBtn.AddClass("SuccessState");
                        var diagText = IsRussianSettingsLanguage()
                            ? ("\u0418\u043C\u043F\u043E\u0440\u0442 " + schemaText + " \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D. clamp=" + String(appliedDiag.clampedKeys) + " unknown=" + String(appliedDiag.unknownKeys))
                            : ("Import " + schemaText + " applied. clamped=" + String(appliedDiag.clampedKeys) + " unknown=" + String(appliedDiag.unknownKeys));
                        var diagTone = (appliedDiag.unknownKeys > 0 || appliedDiag.clampedKeys > 0) ? "warning" : "success";
                        SetConfigFeedbackMessage(diagText, diagTone, 3000);
                        RequestSettingsListRefresh(0.02, true);
                        $.Schedule(0.6, function() {
                            if (!applyBtn || !applyBtn.IsValid || !applyBtn.IsValid()) return;
                            applyBtn.RemoveClass("SuccessState");
                        });
                        return true;
                    } catch (applyErr) {
                        applyBtn.RemoveClass("SuccessState");
                        applyBtn.AddClass("FailureState");
            SetLocalizedConfigFeedbackMessage("Import failed.", "error", 2600);
                        $.Schedule(0.35, function() {
                            if (applyBtn && applyBtn.IsValid && applyBtn.IsValid()) {
                                applyBtn.RemoveClass("FailureState");
                            }
                        });
                        return false;
                    }
                }
            });
        } catch (e) {
            if (importHeader) {
                importHeader.text = "ERROR: Invalid String";
                importHeader.style.color = "#ff4d4d";
            }
            applyBtn.RemoveClass("SuccessState");
            applyBtn.AddClass("FailureState");
            SetLocalizedConfigFeedbackMessage("Invalid import string.", "error", 2600);
            $.Schedule(0.35, function() {
                if (applyBtn && applyBtn.IsValid && applyBtn.IsValid()) {
                    applyBtn.RemoveClass("FailureState");
                }
            });
        }
    });
}

function CloneConfigSnapshot(source) {
    var out = {};
    var src = source && typeof source === "object" ? source : MOD_CONFIG;
    for (var key in src) {
        if (!src.hasOwnProperty(key)) continue;
        out[key] = src[key];
    }
    return out;
}

function BuildCandidateConfigFromParsed(parsed, schemaVersion, baseConfig) {
    var diagnostics = {
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    var candidateConfig = CloneConfigSnapshot(baseConfig || MOD_CONFIG);
    if (!parsed || typeof parsed !== "object") {
        return { candidateConfig: candidateConfig, diagnostics: diagnostics };
    }

    var fieldMap = BuildSchemaFieldMap(schemaVersion);
    for (var key in parsed) {
        if (!candidateConfig.hasOwnProperty(key)) {
            diagnostics.unknownKeys++;
            continue;
        }
        var nextValue = parsed[key];
        var field = fieldMap[key] || null;
        if (field && typeof nextValue === "number") {
            var clampResult = ClampToSchemaField(nextValue, field);
            nextValue = clampResult.value;
            if (clampResult.changed) diagnostics.clampedKeys++;
        }
        candidateConfig[key] = nextValue;
        diagnostics.appliedKeys++;
    }

    MigrateSplitZoomKeys(candidateConfig, parsed);
    NormalizeNeutralCampFlags(candidateConfig, parsed);
    NormalizeItemCooldownModeConfig(candidateConfig, parsed);
    NormalizeAmmoScaleConfig(candidateConfig, parsed);
    NormalizeVoiceTypeConfig(candidateConfig);
    NormalizeHealthbarTypeConfig(candidateConfig, parsed);
    NormalizeColorWarningConfig(candidateConfig, parsed);
    NormalizeEnemyColorWarningConfig(candidateConfig, parsed);

    return { candidateConfig: candidateConfig, diagnostics: diagnostics };
}

function FormatConfigKeyForDiff(key) {
    var raw = String(key || "");
    if (!raw) return "";
    var tokens = raw.split("_");
    for (var i = 0; i < tokens.length; i++) {
        var token = String(tokens[i] || "").toLowerCase();
        if (!token) continue;
        if (token === "fps") {
            tokens[i] = "FPS";
            continue;
        }
        tokens[i] = token.charAt(0).toUpperCase() + token.slice(1);
    }
    return tokens.join(" ");
}

function GetConfigDiffLabelMap() {
    var cacheKey = BuildSearchSectionIndexCacheKey();
    if (gConfigDiffLabelMap && gConfigDiffLabelCacheKey === cacheKey) {
        return gConfigDiffLabelMap;
    }

    var map = {};
    var index = GetCachedSearchSectionIndex();
    for (var t = 0; t < index.length; t++) {
        var tabEntry = index[t];
        if (!tabEntry || !Array.isArray(tabEntry.sections)) continue;
        for (var s = 0; s < tabEntry.sections.length; s++) {
            var section = tabEntry.sections[s];
            if (!section || !Array.isArray(section.rows)) continue;
            for (var r = 0; r < section.rows.length; r++) {
                var row = section.rows[r];
                if (!row) continue;
                var rowLabel = String(row.label || "");
                var rowConfigId = String(row.configId || "");
                var rowCategory = String(section.title || tabEntry.tab || "");
                var rowType = String(row.type || "");
                var rowInvert = false;
                if (Array.isArray(row.options)) {
                    for (var ri = 0; ri < row.options.length; ri++) {
                        var ropt = row.options[ri];
                        if (ropt && ropt.invert === true) {
                            rowInvert = true;
                            break;
                        }
                    }
                }
                if (rowConfigId && !map.hasOwnProperty(rowConfigId) && rowConfigId.indexOf("SEARCH_") !== 0) {
                    map[rowConfigId] = {
                        label: rowLabel,
                        category: rowCategory,
                        type: rowType,
                        invert: rowInvert
                    };
                }
                if (Array.isArray(row.options)) {
                    for (var oi = 0; oi < row.options.length; oi++) {
                        var opt = row.options[oi];
                        if (!opt || !opt.key) continue;
                        var optKey = String(opt.key);
                        var optLabel = String(opt.label || rowLabel || "");
                        if (optKey && optLabel && !map.hasOwnProperty(optKey)) {
                            map[optKey] = {
                                label: optLabel,
                                category: rowCategory,
                                type: "multitoggle_option",
                                invert: !!(opt && opt.invert === true)
                            };
                        }
                    }
                }
            }
        }
    }

    gConfigDiffLabelMap = map;
    gConfigDiffLabelCacheKey = cacheKey;
    return map;
}

function GetConfigDisplayLabelForDiff(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return "";
    var map = GetConfigDiffLabelMap();
    if (map && map.hasOwnProperty(normalizedKey)) {
        var entry = map[normalizedKey];
        if (entry && typeof entry === "object" && entry.label) {
            return String(entry.label || "");
        }
        return String(entry || "");
    }
    return FormatConfigKeyForDiff(normalizedKey);
}

function GetConfigDiffMetaForKey(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return null;
    var map = GetConfigDiffLabelMap();
    if (!map || !map.hasOwnProperty(normalizedKey)) return null;
    var entry = map[normalizedKey];
    return (entry && typeof entry === "object") ? entry : null;
}

function GetConfigCategoryForDiff(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return "";
    var map = GetConfigDiffLabelMap();
    if (map && map.hasOwnProperty(normalizedKey)) {
        var entry = map[normalizedKey];
        if (entry && typeof entry === "object" && entry.category) {
            return String(entry.category || "");
        }
    }
    return "";
}

function FormatConfigValueForDiff(value, key) {
    var configKey = String(key || "");
    var meta = GetConfigDiffMetaForKey(configKey);
    var isBinaryNumber = (typeof value === "number" && (value === 0 || value === 1));
    var isBinaryBool = (typeof value === "boolean");
    var isBinary = isBinaryNumber || isBinaryBool;
    var isEnableStyle = /(ENABLE|ENABLED|DISABLE|DISABLED|SHOW|HIDE|VISIBLE|TOGGLE|ACTIVE|ON_OFF|ONOFF)/i.test(configKey);
    var isFilterStyle = /(^ITEM_FILTER_|_FILTER_)/.test(configKey);
    var isToggleType = !!(meta && (meta.type === "toggle" || meta.type === "multitoggle_option"));
    if (isBinary && (isEnableStyle || isFilterStyle || isToggleType)) {
        var onState = isBinaryBool ? (value === true) : (Number(value) === 1);
        if (meta && meta.invert === true) onState = !onState;
        return onState ? "On" : "Off";
    }
    if (value === undefined) return "(unset)";
    if (value === null) return "(null)";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
        if (Math.abs(value - Math.round(value)) <= 0.0001) {
            return String(Math.round(value));
        }
        var fixed = String(value.toFixed(3));
        fixed = fixed.replace(/\.?0+$/, "");
        return fixed;
    }
    if (typeof value === "string") {
        return value;
    }
    return String(value);
}

function BuildConfigDiffRows(currentConfig, nextConfig) {
    var rows = [];
    if (!currentConfig || !nextConfig) return rows;

    var seen = {};
    var pushRowIfChanged = function(key) {
        var normalizedKey = String(key || "");
        if (!normalizedKey || seen[normalizedKey]) return;
        seen[normalizedKey] = true;

        var hasCurrent = currentConfig.hasOwnProperty(normalizedKey);
        var hasNext = nextConfig.hasOwnProperty(normalizedKey);
        if (!hasCurrent && !hasNext) return;

        var beforeValue = hasCurrent ? currentConfig[normalizedKey] : undefined;
        var afterValue = hasNext ? nextConfig[normalizedKey] : undefined;
        if (NormalizeComparableConfigValue(beforeValue) === NormalizeComparableConfigValue(afterValue)) return;

        rows.push({
            key: normalizedKey,
            keyLabel: GetConfigDisplayLabelForDiff(normalizedKey),
            categoryLabel: GetConfigCategoryForDiff(normalizedKey),
            beforeValue: beforeValue,
            afterValue: afterValue,
            beforeText: FormatConfigValueForDiff(beforeValue, normalizedKey),
            afterText: FormatConfigValueForDiff(afterValue, normalizedKey)
        });
    };

    for (var key in DEFAULT_CONFIG) {
        pushRowIfChanged(key);
    }
    for (var nextKey in nextConfig) {
        pushRowIfChanged(nextKey);
    }
    return rows;
}

function BuildPresetCandidateConfigByName(presetName) {
    var presetData = presetName === "Default" ? DEFAULT_CONFIG : PRESETS[presetName];
    if (!presetData) return null;

    var candidate = {};
    for (var key in DEFAULT_CONFIG) {
        candidate[key] = DEFAULT_CONFIG[key];
    }
    for (var presetKey in presetData) {
        candidate[presetKey] = presetData[presetKey];
    }

    NormalizeNeutralCampFlags(candidate, presetData);
    NormalizeItemCooldownModeConfig(candidate, presetData);
    NormalizeAmmoScaleConfig(candidate, presetData);
    NormalizeVoiceTypeConfig(candidate);
    NormalizeHealthbarTypeConfig(candidate, presetData);
    NormalizeColorWarningConfig(candidate, presetData);
    NormalizeEnemyColorWarningConfig(candidate, presetData);

    candidate.DRAG_ENABLED = MOD_CONFIG.DRAG_ENABLED;
    candidate.PREVIEWS_ENABLED = MOD_CONFIG.PREVIEWS_ENABLED;
    candidate.LANGUAGE = MOD_CONFIG.LANGUAGE;
    candidate.DEFAULT_HERO = MOD_CONFIG.DEFAULT_HERO;

    for (var modKey in MOD_CONFIG) {
        if (candidate.hasOwnProperty(modKey)) continue;
        candidate[modKey] = MOD_CONFIG[modKey];
    }

    return candidate;
}

function OpenConfigDiffPreviewModal(options) {
    var opts = options || {};
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var isRu = IsRussianSettingsLanguage();
    var title = String(opts.title || "Settings Changes");
    var summary = String(opts.summary || ("Changes: " + String(rows.length)));
    var details = String(opts.details || "");
    var applyText = String(opts.applyText || "Confirm");
    var cancelText = String(opts.cancelText || "Cancel");

    var rootPanel = $.GetContextPanel();
    var existing = rootPanel.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var overlay = $.CreatePanel("Panel", rootPanel, "ConfigDiffPreviewModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) {
            overlay.AddClass("Show");
            if (modalContainer && modalContainer.IsValid && modalContainer.IsValid()) {
                modalContainer.SetFocus();
            }
        }
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ConfigDiffModalContainer");
    modalContainer.AddClass("MetroModalContainer");
    modalContainer.AddClass("ConfigDiffModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.SetPanelEvent("oncancel", function() { $.ForceCloseModSettings(); });
    overlay.SetPanelEvent("oncancel", function() { $.ForceCloseModSettings(); });

    var titleRow = $.CreatePanel("Panel", modalContainer, "");
    titleRow.AddClass("ConfigDiffTitleRow");

    var header = $.CreatePanel("Label", titleRow, "");
    header.AddClass("ModalTitle");
    header.AddClass("ConfigDiffTitle");
    header.text = title;

    var titleSpacer = $.CreatePanel("Panel", titleRow, "");
    titleSpacer.AddClass("ConfigDiffTitleSpacer");

    var closeBtn = $.CreatePanel("Button", titleRow, "ConfigDiffCloseBtn");
    closeBtn.AddClass("ConfigDiffCloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    if (details && details.length > 0) {
        var detailsLabel = $.CreatePanel("Label", modalContainer, "");
        detailsLabel.AddClass("ModalInstructions");
        detailsLabel.AddClass("ConfigDiffDetails");
        detailsLabel.text = details;
    }

    var list = $.CreatePanel("Panel", modalContainer, "ConfigDiffList");
    list.AddClass("ConfigDiffList");
    var diffGridRows = Math.max(1, Math.ceil(rows.length / 2));
    var diffRowHeightPx = 35;
    var diffListPaddingPx = 8;
    var diffListMinHeightPx = 120;
    var diffListMaxHeightPx = 620;
    var computedListHeightPx = Math.max(
        diffListMinHeightPx,
        Math.min(diffListMaxHeightPx, diffGridRows * diffRowHeightPx + diffListPaddingPx)
    );
    list.style.height = String(computedListHeightPx) + "px";
    list.style.maxHeight = String(computedListHeightPx) + "px";
    if (rows.length <= 0) {
        var empty = $.CreatePanel("Label", list, "");
        empty.AddClass("ConfigDiffEmpty");
        empty.text = isRu ? "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442." : "No setting changes detected.";
    } else {
        var createDiffCell = function(parentPanel, rowData, rowIndex) {
            var cellPanel = $.CreatePanel("Panel", parentPanel, "");
            cellPanel.AddClass("ConfigDiffCell");
            cellPanel.AddClass((rowIndex % 2) === 0 ? "Even" : "Odd");

            var lineRow = $.CreatePanel("Panel", cellPanel, "");
            lineRow.AddClass("ConfigDiffCellLine");

            var titleLabel = $.CreatePanel("Label", lineRow, "");
            titleLabel.AddClass("ConfigDiffCellTitle");
            var categoryText = String(rowData.categoryLabel || "");
            var settingText = String(rowData.keyLabel || rowData.key || "");
            titleLabel.text = categoryText ? (categoryText + ": " + settingText) : settingText;

            var valueWrap = $.CreatePanel("Panel", lineRow, "");
            valueWrap.AddClass("ConfigDiffValueWrap");

            var beforeLabel = $.CreatePanel("Label", valueWrap, "");
            beforeLabel.AddClass("ConfigDiffCellBefore");
            beforeLabel.text = rowData.beforeText || "";

            var arrow = $.CreatePanel("Label", valueWrap, "");
            arrow.AddClass("ConfigDiffCellArrow");
            arrow.text = "\u2192";

            var afterLabel = $.CreatePanel("Label", valueWrap, "");
            afterLabel.AddClass("ConfigDiffCellAfter");
            afterLabel.text = rowData.afterText || "";
        };

        for (var i = 0; i < rows.length; i += 2) {
            var gridRow = $.CreatePanel("Panel", list, "");
            gridRow.AddClass("ConfigDiffGridRow");

            createDiffCell(gridRow, rows[i], i);
            if (i + 1 < rows.length) {
                createDiffCell(gridRow, rows[i + 1], i + 1);
            } else {
                var fillerA = $.CreatePanel("Panel", gridRow, "");
                fillerA.AddClass("ConfigDiffCellFiller");
            }
        }
    }

    var btnRow = $.CreatePanel("Panel", modalContainer, "ConfigDiffModalBtnRow");
    btnRow.AddClass("ModalBtnRow");
    btnRow.AddClass("ConfigDiffModalBtnRow");

    var summaryLabel = $.CreatePanel("Label", btnRow, "");
    summaryLabel.AddClass("ConfigDiffSummaryFooter");
    summaryLabel.text = summary;

    var btnSpacer = $.CreatePanel("Panel", btnRow, "");
    btnSpacer.AddClass("ConfigDiffBtnSpacer");

    var cancelBtn = $.CreatePanel("Button", btnRow, "");
    cancelBtn.AddClass("ModalBtnClose");
    cancelBtn.AddClass("ConfigDiffCancelBtn");
    var cancelLbl = $.CreatePanel("Label", cancelBtn, "");
    cancelLbl.text = cancelText;
    cancelBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var applyBtn = $.CreatePanel("Button", btnRow, "");
    applyBtn.AddClass("ModalBtnApply");
    applyBtn.AddClass("ConfigDiffApplyBtn");
    var applyLbl = $.CreatePanel("Label", applyBtn, "");
    applyLbl.text = applyText;
    applyBtn.SetPanelEvent("onactivate", function() {
        var shouldClose = true;
        if (typeof opts.onApply === "function") {
            try {
                shouldClose = opts.onApply() !== false;
            } catch (eApply) {
                shouldClose = false;
            }
        }
        if (shouldClose) {
            CloseModal(overlay);
        }
    });
}

function TryApplyImportStringWithDiagnostics(raw) {
    var result = {
        ok: false,
        source: "compact",
        schemaVersion: "",
        parsedConfig: null,
        candidateConfig: null,
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    if (!raw) return result;
    var trimmed = raw.trim();
    if (trimmed.length === 0) return result;

    var normalized = String(trimmed).replace(/\s+/g, "");
    var tokenMatch = normalized.match(EXPORT_TOKEN_REGEX);
    if (!tokenMatch) return result;

    var schemaSemver = String(tokenMatch[1] || "").replace(/-/g, ".");
    if (!schemaSemver || !COMPACT_SCHEMA_REGISTRY.hasOwnProperty(schemaSemver)) return result;
    var compactCandidate = String(tokenMatch[2] || "");
    if (!compactCandidate) return result;

    try {
        var compactBinary = FromBase64Url(compactCandidate);
        result.parsedConfig = DeserializeCompactV2(compactBinary, schemaSemver);
        result.schemaVersion = schemaSemver;
    } catch (compactErr) {
        return result;
    }

    var preview = BuildCandidateConfigFromParsed(result.parsedConfig, result.schemaVersion || LATEST_COMPACT_SEMVER, MOD_CONFIG);
    result.candidateConfig = preview.candidateConfig;
    result.appliedKeys = preview.diagnostics.appliedKeys;
    result.unknownKeys = preview.diagnostics.unknownKeys;
    result.clampedKeys = preview.diagnostics.clampedKeys;
    result.ok = true;
    return result;
}

function TryApplyImportStringToConfig(raw) {
    var result = TryApplyImportStringWithDiagnostics(raw);
    if (!result || result.ok !== true || !result.parsedConfig) return false;
    ApplyParsedConfigWithDiagnostics(result.parsedConfig, result.schemaVersion || LATEST_COMPACT_SEMVER);
    return true;
}

function StopMinesweeperLoop() {
    gMinesweeperTimerToken++;
}

function UpdateMinesweeperHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.mineLabel && state.mineLabel.IsValid && state.mineLabel.IsValid()) {
        state.mineLabel.text = "Mines: " + state.mineCount;
    }
    if (state.flagLabel && state.flagLabel.IsValid && state.flagLabel.IsValid()) {
        state.flagLabel.text = "Flags: " + state.flagsUsed;
    }
    if (state.timeLabel && state.timeLabel.IsValid && state.timeLabel.IsValid()) {
        state.timeLabel.text = "Time: " + state.elapsedSeconds + "s";
    }
}

function UpdateMinesweeperStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? text : MINESWEEPER_STATUS_DEFAULT_TEXT;
        state.statusLabel.style.visibility = "visible";
    }
}

function ApplyMinesweeperDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetMinesweeperDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.rows = cfg.rows;
    state.cols = cfg.cols;
    state.mineCount = cfg.mines;
    state.safeCells = (cfg.rows * cfg.cols) - cfg.mines;

    if (state.difficultyButtons) {
        for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
            var key = MINESWEEPER_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetMinesweeperGame(state);
    }
}

function ForEachMinesweeperNeighbor(state, row, col, fn) {
    for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = row + dr;
            var nc = col + dc;
            if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
            fn(nr, nc);
        }
    }
}

function UpdateMinesweeperCellVisual(cell) {
    if (!cell || !cell.panel || !cell.label || !cell.panel.IsValid || !cell.panel.IsValid()) return;
    var panel = cell.panel;
    var label = cell.label;
    panel.SetHasClass("Revealed", cell.revealed === true);
    panel.SetHasClass("Flagged", cell.flagged === true && cell.revealed !== true);
    panel.SetHasClass("Mine", cell.revealed === true && cell.isMine === true);
    panel.SetHasClass("MineExploded", cell.exploded === true);

    if (cell.revealed) {
        if (cell.isMine) {
            label.text = "";
        } else if (cell.adjacent > 0) {
            label.text = String(cell.adjacent);
        } else {
            label.text = "";
        }
    } else if (cell.flagged) {
        label.text = "F";
    } else {
        label.text = "";
    }
}

function CreateMinesweeperCells(state) {
    state.cells = [];
    for (var r = 0; r < state.rows; r++) {
        var rowCells = [];
        for (var c = 0; c < state.cols; c++) {
            rowCells.push({
                row: r,
                col: c,
                isMine: false,
                adjacent: 0,
                revealed: false,
                flagged: false,
                exploded: false,
                panel: null,
                label: null
            });
        }
        state.cells.push(rowCells);
    }

    var minesPlaced = 0;
    while (minesPlaced < state.mineCount) {
        var index = Math.floor(Math.random() * state.rows * state.cols);
        var mineRow = Math.floor(index / state.cols);
        var mineCol = index % state.cols;
        var target = state.cells[mineRow][mineCol];
        if (target.isMine) continue;
        target.isMine = true;
        minesPlaced++;
    }

    RecomputeMinesweeperAdjacents(state);
}

function RecomputeMinesweeperAdjacents(state) {
    if (!state || !Array.isArray(state.cells)) return;
    for (var rr = 0; rr < state.rows; rr++) {
        for (var cc = 0; cc < state.cols; cc++) {
            var cell = state.cells[rr][cc];
            if (cell.isMine) {
                cell.adjacent = -1;
                continue;
            }
            var nearby = 0;
            ForEachMinesweeperNeighbor(state, rr, cc, function(nr, nc) {
                if (state.cells[nr][nc].isMine) nearby++;
            });
            cell.adjacent = nearby;
        }
    }
}

function EnsureMinesweeperFirstRevealSafe(state, row, col) {
    if (!state || state.firstRevealDone) return;
    state.firstRevealDone = true;
    var current = state.cells[row] && state.cells[row][col] ? state.cells[row][col] : null;
    if (!current || !current.isMine) return;

    var candidates = [];
    for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
            if (r === row && c === col) continue;
            var candidate = state.cells[r][c];
            if (!candidate || candidate.isMine) continue;
            candidates.push(candidate);
        }
    }
    if (candidates.length <= 0) return;

    var pickIndex = Math.floor(Math.random() * candidates.length);
    if (!isFinite(pickIndex) || pickIndex < 0) pickIndex = 0;
    if (pickIndex >= candidates.length) pickIndex = candidates.length - 1;
    var destination = candidates[pickIndex];
    if (!destination) return;

    current.isMine = false;
    destination.isMine = true;
    RecomputeMinesweeperAdjacents(state);
}

function RenderMinesweeperBoard(state) {
    if (!state || !state.boardPanel || !state.boardPanel.IsValid || !state.boardPanel.IsValid()) return;
    state.boardPanel.RemoveAndDeleteChildren();
    for (var r = 0; r < state.rows; r++) {
        var rowPanel = $.CreatePanel("Panel", state.boardPanel, "ArcadeMinesweeperRow_" + r);
        rowPanel.AddClass("ArcadeMinesweeperRow");
        for (var c = 0; c < state.cols; c++) {
            (function(rowIndex, colIndex) {
                var cell = state.cells[rowIndex][colIndex];
                var cellBtn = $.CreatePanel("Button", rowPanel, "ArcadeMinesweeperCell_" + rowIndex + "_" + colIndex);
                cellBtn.AddClass("ArcadeMinesweeperCell");
                var cellLbl = $.CreatePanel("Label", cellBtn, "");
                cellLbl.AddClass("ArcadeMinesweeperCellLabel");
                cell.panel = cellBtn;
                cell.label = cellLbl;
                UpdateMinesweeperCellVisual(cell);

                cellBtn.SetPanelEvent("onactivate", function() {
                    HandleMinesweeperCellActivate(state, rowIndex, colIndex);
                });
                cellBtn.SetPanelEvent("oncontextmenu", function() {
                    ToggleMinesweeperFlag(state, rowIndex, colIndex);
                    return true;
                });
            })(r, c);
        }
    }
}

function ApplyMinesweeperBoardSizing(state) {
    if (!state || !state.boardPanel || !state.boardPanel.IsValid || !state.boardPanel.IsValid()) return false;
    if (!Array.isArray(state.cells) || state.cells.length <= 0) return false;

    var boardWidth = MINESWEEPER_BOARD_WIDTH;
    var boardHeight = MINESWEEPER_BOARD_HEIGHT;

    var rows = Math.max(1, Math.floor(Number(state.rows)));
    var cols = Math.max(1, Math.floor(Number(state.cols)));
    var usableWidth = Math.max(60, boardWidth - 24);
    var usableHeight = Math.max(60, boardHeight - 24);
    var gutterPerCell = 2;
    var perCellWidth = (usableWidth - (cols * gutterPerCell)) / cols;
    var perCellHeight = (usableHeight - (rows * gutterPerCell)) / rows;
    var cellSize = Math.floor(Math.min(perCellWidth, perCellHeight));
    if (!isFinite(cellSize)) return false;
    if (cellSize < 18) cellSize = 18;
    if (cellSize > 58) cellSize = 58;

    var fontSize = Math.floor(cellSize * 0.44);
    if (fontSize < 12) fontSize = 12;
    if (fontSize > 26) fontSize = 26;
    var bgSize = Math.floor(cellSize * 0.74);
    if (bgSize < 14) bgSize = 14;
    if (bgSize > 44) bgSize = 44;

    for (var r = 0; r < rows; r++) {
        var rowCells = state.cells[r];
        if (!Array.isArray(rowCells)) continue;
        for (var c = 0; c < cols; c++) {
            var cell = rowCells[c];
            if (!cell || !cell.panel || !cell.label) continue;
            if (!cell.panel.IsValid || !cell.panel.IsValid()) continue;
            if (!cell.label.IsValid || !cell.label.IsValid()) continue;
            cell.panel.style.width = cellSize + "px";
            cell.panel.style.height = cellSize + "px";
            cell.panel.style.marginTop = "1px";
            cell.panel.style.marginRight = "1px";
            cell.panel.style.marginBottom = "1px";
            cell.panel.style.marginLeft = "1px";
            cell.label.style.fontSize = fontSize + "px";
            cell.label.style.backgroundSize = bgSize + "px " + bgSize + "px";
        }
    }

    return true;
}

function ScheduleMinesweeperBoardSizing(state, attempts) {
    if (!state || !state.active) return;
    var tries = Math.max(1, Math.floor(Number(attempts) || 1));
    $.Schedule(0.01, function() {
        if (!state || !state.active) return;
        var ready = false;
        try { ready = ApplyMinesweeperBoardSizing(state); } catch (eMsSize) { ready = false; }
        if (!ready && tries > 1) {
            ScheduleMinesweeperBoardSizing(state, tries - 1);
        }
    });
}

function ScheduleHideAmmoPreview(delaySec) {
    gAmmoPreviewHideToken++;
    var token = gAmmoPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gAmmoPreviewHideToken) return;
        if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
            gAmmoPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideReloadCooldownPreview(delaySec) {
    gReloadCooldownPreviewHideToken++;
    var token = gReloadCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gReloadCooldownPreviewHideToken) return;
        if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
            gReloadCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnitTargetPreview(delaySec) {
    gUnitTargetPreviewHideToken++;
    var token = gUnitTargetPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnitTargetPreviewHideToken) return;
        if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
            gUnitTargetPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideDamageReportPreview(delaySec) {
    gDamageReportPreviewHideToken++;
    var token = gDamageReportPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gDamageReportPreviewHideToken) return;
        if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
            gDamageReportPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideShopPreview(delaySec) {
    gShopPreviewHideToken++;
    var token = gShopPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gShopPreviewHideToken) return;
        if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
            gShopPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUltCooldownPreview(delaySec) {
    gUltCooldownPreviewHideToken++;
    var token = gUltCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUltCooldownPreviewHideToken) return;
        if (gUltCooldownPreviewPanel && gUltCooldownPreviewPanel.IsValid && gUltCooldownPreviewPanel.IsValid()) {
            gUltCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredPlusPreview(delaySec) {
    gUnsecuredPlusPreviewHideToken++;
    var token = gUnsecuredPlusPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredPlusPreviewHideToken) return;
        if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
            gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ToggleMinesweeperFlag(state, row, col) {
    if (!state || state.gameOver || !state.active) return;
    var cell = state.cells[row][col];
    if (!cell || cell.revealed) return;
    cell.flagged = !cell.flagged;
    state.flagsUsed += cell.flagged ? 1 : -1;
    if (state.flagsUsed < 0) state.flagsUsed = 0;
    UpdateMinesweeperCellVisual(cell);
    UpdateMinesweeperHud(state);
}

function RevealMinesweeperRegion(state, startRow, startCol) {
    var stack = [{ r: startRow, c: startCol }];
    while (stack.length > 0) {
        var node = stack.pop();
        var cell = state.cells[node.r][node.c];
        if (!cell || cell.revealed || cell.flagged) continue;
        if (cell.isMine) continue;
        cell.revealed = true;
        state.revealedSafeCount++;
        UpdateMinesweeperCellVisual(cell);

        if (cell.adjacent === 0) {
            ForEachMinesweeperNeighbor(state, node.r, node.c, function(nr, nc) {
                var nextCell = state.cells[nr][nc];
                if (!nextCell || nextCell.revealed || nextCell.flagged || nextCell.isMine) return;
                stack.push({ r: nr, c: nc });
            });
        }
    }
}

function RevealAllMines(state) {
    for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
            var cell = state.cells[r][c];
            if (cell.isMine) {
                cell.revealed = true;
                UpdateMinesweeperCellVisual(cell);
            }
        }
    }
}

function PlayMinesweeperExplodeSound() {
    var eventName = String(MINESWEEPER_EXPLODE_SOUND_EVENT || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayMinesweeperWinSound() {
    var eventName = String(MINESWEEPER_WIN_SOUND_EVENT || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function HandleMinesweeperCellActivate(state, row, col) {
    if (!state || state.gameOver || !state.active) return;
    var cell = state.cells[row][col];
    if (!cell || cell.revealed || cell.flagged) return;
    EnsureMinesweeperFirstRevealSafe(state, row, col);

    if (cell.isMine) {
        cell.exploded = true;
        cell.revealed = true;
        UpdateMinesweeperCellVisual(cell);
        PlayMinesweeperExplodeSound();
        RevealAllMines(state);
        state.gameOver = true;
        StopMinesweeperLoop();
        UpdateMinesweeperStatus(state, "Boom. Press New Game.");
        return;
    }

    RevealMinesweeperRegion(state, row, col);
    if (state.revealedSafeCount >= state.safeCells) {
        state.gameOver = true;
        StopMinesweeperLoop();
        PlayMinesweeperWinSound();
        UpdateMinesweeperStatus(state, "Cleared in " + state.elapsedSeconds + "s.");
        return;
    }

    UpdateMinesweeperHud(state);
}

function StartMinesweeperTimer(state) {
    if (!state || !state.active) return;
    gMinesweeperTimerToken++;
    var token = gMinesweeperTimerToken;

    function Tick() {
        if (!state || !state.active || state.gameOver) return;
        if (token !== gMinesweeperTimerToken) return;
        state.elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.startTime) / 1000));
        UpdateMinesweeperHud(state);
        $.Schedule(0.25, Tick);
    }

    Tick();
}

function ResetMinesweeperGame(state) {
    if (!state || !state.active) return;
    state.gameOver = false;
    state.firstRevealDone = false;
    state.flagsUsed = 0;
    state.revealedSafeCount = 0;
    state.elapsedSeconds = 0;
    state.startTime = Date.now();
    CreateMinesweeperCells(state);
    RenderMinesweeperBoard(state);
    ScheduleMinesweeperBoardSizing(state, 10);
    UpdateMinesweeperHud(state);
    UpdateMinesweeperStatus(state, "");
    StartMinesweeperTimer(state);
}

function CloseMinesweeperModal(overlay) {
    StopMinesweeperLoop();
    if (gMinesweeperState) {
        gMinesweeperState.active = false;
        gMinesweeperState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseMinesweeperModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeMinesweeperOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseMinesweeperModal(overlay);
    } else {
        StopMinesweeperLoop();
    }
}

function OpenMinesweeperModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    CloseMinesweeperModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeMinesweeperOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseMinesweeperModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeMinesweeperModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseMinesweeperModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeMinesweeperTitle");
    header.text = "Bebop Sweeper";

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperActionRow");
    actionRow.AddClass("ArcadeMinesweeperActionRow");

    var newGameBtn = $.CreatePanel("Button", actionRow, "ArcadeMinesweeperNewGameBtn");
    newGameBtn.AddClass("ArcadeMinesweeperActionBtn");
    newGameBtn.AddClass("ArcadeMinesweeperControlBtn");
    var newGameLbl = $.CreatePanel("Label", newGameBtn, "");
    newGameLbl.text = "New Game";

    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeMinesweeperDifficultyGroup");
    difficultyGroup.AddClass("ArcadeMinesweeperDifficultyGroup");
    var difficultyButtons = {};
    for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeMinesweeperDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeMinesweeperDifficultyBtn");
            diffBtn.AddClass("ArcadeMinesweeperControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyMinesweeperDifficulty(state, cfg.id, true);
            });
        })(MINESWEEPER_DIFFICULTIES[i]);
    }

    var statusLabel = $.CreatePanel("Label", modalContainer, "ArcadeMinesweeperStatusLabel");
    statusLabel.AddClass("ArcadeMinesweeperStatusLabel");
    statusLabel.style.visibility = "collapse";

    var board = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperBoard");
    board.AddClass("ArcadeMinesweeperBoard");

    var footerRow = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperFooterRow");
    footerRow.AddClass("ArcadeMinesweeperFooterRow");

    var mineLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperMineLabel");
    mineLabel.AddClass("ArcadeMinesweeperStat");

    var flagLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperFlagLabel");
    flagLabel.AddClass("ArcadeMinesweeperStat");

    var timeLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperTimeLabel");
    timeLabel.AddClass("ArcadeMinesweeperStat");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        firstRevealDone: false,
        rows: MINESWEEPER_ROWS,
        cols: MINESWEEPER_COLS,
        mineCount: MINESWEEPER_MINES,
        safeCells: (MINESWEEPER_ROWS * MINESWEEPER_COLS) - MINESWEEPER_MINES,
        revealedSafeCount: 0,
        flagsUsed: 0,
        elapsedSeconds: 0,
        startTime: Date.now(),
        difficultyId: MINESWEEPER_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        mineImageSrc: MINESWEEPER_MINE_IMAGE_SRC,
        mineLabel: mineLabel,
        flagLabel: flagLabel,
        timeLabel: timeLabel,
        statusLabel: statusLabel,
        boardPanel: board,
        cells: []
    };

    gMinesweeperState = state;

    newGameBtn.SetPanelEvent("onactivate", function() {
        if (!state.active) return;
        ResetMinesweeperGame(state);
    });

    ApplyMinesweeperDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function Create2048EmptyBoard() {
    var board = [];
    for (var r = 0; r < ARCADE_2048_SIZE; r++) {
        var row = [];
        for (var c = 0; c < ARCADE_2048_SIZE; c++) {
            row.push(0);
        }
        board.push(row);
    }
    return board;
}

function Get2048TileColors(value) {
    if (value <= 0) return { bg: "#2a2f33cc", fg: "#d8e4de33" };
    if (value === 2) return { bg: "#3a4347", fg: "#d8e4de" };
    if (value === 4) return { bg: "#455056", fg: "#eef6f2" };
    if (value === 8) return { bg: "#4a664f", fg: "#ffffff" };
    if (value === 16) return { bg: "#4f7350", fg: "#ffffff" };
    if (value === 32) return { bg: "#6c6a44", fg: "#ffffff" };
    if (value === 64) return { bg: "#7e613a", fg: "#ffffff" };
    if (value === 128) return { bg: "#7e4f3a", fg: "#ffffff" };
    if (value === 256) return { bg: "#7a3f55", fg: "#ffffff" };
    if (value === 512) return { bg: "#63407a", fg: "#ffffff" };
    if (value === 1024) return { bg: "#49507f", fg: "#ffffff" };
    if (value === 2048) return { bg: "#3e7d66", fg: "#ffffff" };
    return { bg: "#2f8f7a", fg: "#ffffff" };
}

function Update2048Status(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? text : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function Update2048Hud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.scoreLabel && state.scoreLabel.IsValid && state.scoreLabel.IsValid()) {
        state.scoreLabel.text = "Score: " + state.score;
    }
}

function Render2048Board(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    for (var r = 0; r < ARCADE_2048_SIZE; r++) {
        for (var c = 0; c < ARCADE_2048_SIZE; c++) {
            var value = state.board[r][c];
            var cell = state.cells[r][c];
            if (!cell || !cell.panel || !cell.label) continue;
            var colors = Get2048TileColors(value);
            cell.panel.style.backgroundColor = colors.bg;
            cell.label.style.color = colors.fg;
            cell.label.text = value > 0 ? String(value) : "";
        }
    }
}

function Spawn2048Tile(state) {
    var empty = [];
    for (var r = 0; r < ARCADE_2048_SIZE; r++) {
        for (var c = 0; c < ARCADE_2048_SIZE; c++) {
            if (state.board[r][c] === 0) empty.push({ r: r, c: c });
        }
    }
    if (empty.length <= 0) return false;
    var pick = empty[Math.floor(Math.random() * empty.length)];
    state.board[pick.r][pick.c] = (Math.random() < 0.9) ? 2 : 4;
    return true;
}

function Slide2048Line(line) {
    var compact = [];
    for (var i = 0; i < line.length; i++) {
        if (line[i] > 0) compact.push(line[i]);
    }

    var merged = [];
    var gain = 0;
    var idx = 0;
    while (idx < compact.length) {
        if (idx + 1 < compact.length && compact[idx] === compact[idx + 1]) {
            var doubled = compact[idx] * 2;
            merged.push(doubled);
            gain += doubled;
            idx += 2;
        } else {
            merged.push(compact[idx]);
            idx += 1;
        }
    }

    while (merged.length < line.length) {
        merged.push(0);
    }

    var moved = false;
    for (var j = 0; j < line.length; j++) {
        if (line[j] !== merged[j]) {
            moved = true;
            break;
        }
    }

    return { line: merged, gain: gain, moved: moved };
}

function Apply2048Move(state, direction) {
    var movedAny = false;
    var gainTotal = 0;
    var size = ARCADE_2048_SIZE;
    var newBoard = Create2048EmptyBoard();

    for (var i = 0; i < size; i++) {
        var line = [];
        for (var j = 0; j < size; j++) {
            if (direction === "left") line.push(state.board[i][j]);
            else if (direction === "right") line.push(state.board[i][size - 1 - j]);
            else if (direction === "up") line.push(state.board[j][i]);
            else line.push(state.board[size - 1 - j][i]);
        }

        var slid = Slide2048Line(line);
        gainTotal += slid.gain;
        if (slid.moved) movedAny = true;

        for (var k = 0; k < size; k++) {
            var value = slid.line[k];
            if (direction === "left") newBoard[i][k] = value;
            else if (direction === "right") newBoard[i][size - 1 - k] = value;
            else if (direction === "up") newBoard[k][i] = value;
            else newBoard[size - 1 - k][i] = value;
        }
    }

    if (!movedAny) return false;
    state.board = newBoard;
    state.score += gainTotal;
    return true;
}

function Has2048Moves(state) {
    var size = ARCADE_2048_SIZE;
    for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
            var v = state.board[r][c];
            if (v === 0) return true;
            if (c + 1 < size && state.board[r][c + 1] === v) return true;
            if (r + 1 < size && state.board[r + 1][c] === v) return true;
        }
    }
    return false;
}

function Reset2048Game(state) {
    if (!state || !state.active) return;
    state.board = Create2048EmptyBoard();
    state.score = 0;
    state.gameOver = false;
    state.won = false;
    Spawn2048Tile(state);
    Spawn2048Tile(state);
    Update2048Hud(state);
    Update2048Status(state, "");
    Render2048Board(state);
}

function Handle2048Move(state, direction) {
    if (!state || !state.active || state.gameOver) return;
    var moved = Apply2048Move(state, direction);
    if (!moved) return;

    Spawn2048Tile(state);
    Render2048Board(state);
    Update2048Hud(state);

    if (!state.won) {
        for (var r = 0; r < ARCADE_2048_SIZE; r++) {
            for (var c = 0; c < ARCADE_2048_SIZE; c++) {
                if (state.board[r][c] >= 2048) {
                    state.won = true;
                    Update2048Status(state, "2048 reached! Keep going.");
                    break;
                }
            }
            if (state.won) break;
        }
    }

    if (!Has2048Moves(state)) {
        state.gameOver = true;
        Update2048Status(state, "Game over. Press New Game.");
    }
}

function Close2048Modal(overlay) {
    if (g2048State) {
        g2048State.active = false;
        g2048State = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function Close2048ModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("Arcade2048Overlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        Close2048Modal(overlay);
    }
}

function Open2048Modal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    Close2048ModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "Arcade2048Overlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        Close2048Modal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "Arcade2048ModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        Close2048Modal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("Arcade2048Title");
    header.text = "2048";

    var hudRow = $.CreatePanel("Panel", modalContainer, "Arcade2048HudRow");
    hudRow.AddClass("Arcade2048HudRow");
    var scoreLabel = $.CreatePanel("Label", hudRow, "Arcade2048ScoreLabel");
    scoreLabel.AddClass("Arcade2048Stat");

    var actionRow = $.CreatePanel("Panel", modalContainer, "Arcade2048ActionRow");
    actionRow.AddClass("Arcade2048ActionRow");

    var newGameBtn = $.CreatePanel("Button", actionRow, "Arcade2048NewGameBtn");
    newGameBtn.AddClass("ArcadeMinesweeperActionBtn");
    newGameBtn.AddClass("Arcade2048ActionBtn");
    var newGameLbl = $.CreatePanel("Label", newGameBtn, "");
    newGameLbl.text = "New Game";

    var controls = $.CreatePanel("Panel", modalContainer, "Arcade2048Controls");
    controls.AddClass("Arcade2048Controls");

    var upRow = $.CreatePanel("Panel", controls, "Arcade2048ControlsUpRow");
    upRow.AddClass("Arcade2048ControlsRow");
    upRow.AddClass("Arcade2048ControlsUpRow");

    var upBtn = $.CreatePanel("Button", upRow, "Arcade2048MoveUp");
    upBtn.AddClass("ArcadeMinesweeperActionBtn");
    upBtn.AddClass("Arcade2048MoveBtn");
    var upLbl = $.CreatePanel("Label", upBtn, "");
    upLbl.text = "Up";

    var dpadRow = $.CreatePanel("Panel", controls, "Arcade2048ControlsDPadRow");
    dpadRow.AddClass("Arcade2048ControlsRow");
    dpadRow.AddClass("Arcade2048ControlsDPadRow");

    var leftBtn = $.CreatePanel("Button", dpadRow, "Arcade2048MoveLeft");
    leftBtn.AddClass("ArcadeMinesweeperActionBtn");
    leftBtn.AddClass("Arcade2048MoveBtn");
    var leftLbl = $.CreatePanel("Label", leftBtn, "");
    leftLbl.text = "Left";

    var downBtn = $.CreatePanel("Button", dpadRow, "Arcade2048MoveDown");
    downBtn.AddClass("ArcadeMinesweeperActionBtn");
    downBtn.AddClass("Arcade2048MoveBtn");
    var downLbl = $.CreatePanel("Label", downBtn, "");
    downLbl.text = "Down";

    var rightBtn = $.CreatePanel("Button", dpadRow, "Arcade2048MoveRight");
    rightBtn.AddClass("ArcadeMinesweeperActionBtn");
    rightBtn.AddClass("Arcade2048MoveBtn");
    var rightLbl = $.CreatePanel("Label", rightBtn, "");
    rightLbl.text = "Right";

    var statusLabel = $.CreatePanel("Label", modalContainer, "Arcade2048StatusLabel");
    statusLabel.AddClass("Arcade2048StatusLabel");
    statusLabel.style.visibility = "collapse";

    var boardPanel = $.CreatePanel("Panel", modalContainer, "Arcade2048Board");
    boardPanel.AddClass("Arcade2048Board");

    var cells = [];
    for (var r = 0; r < ARCADE_2048_SIZE; r++) {
        var rowPanel = $.CreatePanel("Panel", boardPanel, "Arcade2048Row_" + r);
        rowPanel.AddClass("Arcade2048Row");
        var rowCells = [];
        for (var c = 0; c < ARCADE_2048_SIZE; c++) {
            var cellPanel = $.CreatePanel("Panel", rowPanel, "Arcade2048Cell_" + r + "_" + c);
            cellPanel.AddClass("Arcade2048Cell");
            var cellLabel = $.CreatePanel("Label", cellPanel, "");
            cellLabel.AddClass("Arcade2048CellLabel");
            rowCells.push({ panel: cellPanel, label: cellLabel });
        }
        cells.push(rowCells);
    }

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        board: Create2048EmptyBoard(),
        cells: cells,
        score: 0,
        gameOver: false,
        won: false,
        scoreLabel: scoreLabel,
        statusLabel: statusLabel
    };
    g2048State = state;

    upBtn.SetPanelEvent("onactivate", function() { Handle2048Move(state, "up"); });
    leftBtn.SetPanelEvent("onactivate", function() { Handle2048Move(state, "left"); });
    downBtn.SetPanelEvent("onactivate", function() { Handle2048Move(state, "down"); });
    rightBtn.SetPanelEvent("onactivate", function() { Handle2048Move(state, "right"); });
    newGameBtn.SetPanelEvent("onactivate", function() { Reset2048Game(state); });

    Reset2048Game(state);
}

function StopFlappyLoop() {
    gFlappyLoopToken++;
}

function UpdateFlappyStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? text : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateFlappyHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.scoreLabel && state.scoreLabel.IsValid && state.scoreLabel.IsValid()) {
        state.scoreLabel.text = "Score: " + state.score;
    }
    if (state.bestLabel && state.bestLabel.IsValid && state.bestLabel.IsValid()) {
        state.bestLabel.text = "Best: " + state.bestScore;
    }
}

function RefreshFlappyBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function PlayFlappyFailSound() {
    var options = FLAPPY_BAT_FAIL_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "flappy_bat_fail");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function SpawnFlappyPipe(state) {
    if (!state || !state.active || !state.pipesLayer || !state.pipesLayer.IsValid || !state.pipesLayer.IsValid()) return;

    var gapHalf = Math.floor(state.gapSize / 2);
    var minCenter = gapHalf + 24;
    var maxCenter = state.gameHeight - gapHalf - 24;
    var gapCenter = Math.floor(minCenter + (Math.random() * Math.max(1, (maxCenter - minCenter))));

    var pipePanel = $.CreatePanel("Panel", state.pipesLayer, "ArcadeFlappyPipe_" + state.pipeSerial);
    pipePanel.AddClass("ArcadeFlappyPipe");
    var topPipe = $.CreatePanel("Panel", pipePanel, "");
    topPipe.AddClass("ArcadeFlappyPipePart");
    topPipe.AddClass("Top");
    var bottomPipe = $.CreatePanel("Panel", pipePanel, "");
    bottomPipe.AddClass("ArcadeFlappyPipePart");
    bottomPipe.AddClass("Bottom");

    state.pipes.push({
        x: state.gameWidth + 18,
        gapCenter: gapCenter,
        passed: false,
        panel: pipePanel,
        top: topPipe,
        bottom: bottomPipe
    });
    state.pipeSerial++;
}

function RenderFlappy(state) {
    if (!state || !state.isValid || !state.isValid()) return;

    var birdRadius = Math.floor(state.birdSize / 2);
    state.birdPanel.style.x = Math.floor(state.birdX - birdRadius) + "px";
    state.birdPanel.style.y = Math.floor(state.birdY - birdRadius) + "px";
    var angle = Math.max(-25, Math.min(70, Math.floor(state.birdVel * 5)));
    // Panorama-safe runtime rotation (avoid string transform writes in hot loops).
    state.birdPanel.style.preTransformRotate2d = angle + "deg";

    for (var i = 0; i < state.pipes.length; i++) {
        var pipe = state.pipes[i];
        if (!pipe || !pipe.panel || !pipe.panel.IsValid || !pipe.panel.IsValid()) continue;
        var gapTop = Math.floor(pipe.gapCenter - (state.gapSize / 2));
        var gapBottom = Math.floor(pipe.gapCenter + (state.gapSize / 2));
        pipe.panel.style.x = Math.floor(pipe.x) + "px";
        pipe.panel.style.y = "0px";
        pipe.panel.style.width = state.pipeWidth + "px";
        pipe.panel.style.height = state.gameHeight + "px";

        pipe.top.style.y = "0px";
        pipe.top.style.height = Math.max(0, gapTop) + "px";
        pipe.top.style.width = state.pipeWidth + "px";

        pipe.bottom.style.y = gapBottom + "px";
        pipe.bottom.style.height = Math.max(0, (state.gameHeight - gapBottom)) + "px";
        pipe.bottom.style.width = state.pipeWidth + "px";
    }
}

function EndFlappyGame(state, text) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    if (state.score > state.bestScore) state.bestScore = state.score;
    PlayFlappyFailSound();
    UpdateFlappyHud(state);
    UpdateFlappyStatus(state, text || "Crashed. Click playfield to restart.");
    StopFlappyLoop();
}

function Flap(state) {
    if (!state || !state.active || state.gameOver) return;
    state.birdVel = state.flapImpulse;
    PlayArcadeGameSoundEffect(FLAPPY_BAT_FLAP_SOUND_EVENT);
}

function StepFlappy(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gFlappyLoopToken) return;
    if (state.gameOver) return;
    RefreshFlappyBounds(state);

    state.birdVel += state.gravity;
    state.birdY += state.birdVel;

    var birdRadius = Math.floor(state.birdSize / 2);
    if (state.birdY - birdRadius < 0) {
        state.birdY = birdRadius;
        state.birdVel = 0;
    }
    if (state.birdY + birdRadius >= state.gameHeight) {
        state.birdY = state.gameHeight - birdRadius;
        RenderFlappy(state);
        EndFlappyGame(state, "Crashed. Click playfield to restart.");
        return;
    }

    state.spawnTimer--;
    if (state.spawnTimer <= 0) {
        SpawnFlappyPipe(state);
        state.spawnTimer = state.pipeSpawnTicks;
    }

    var birdLeft = state.birdX - birdRadius;
    var birdRight = state.birdX + birdRadius;
    var birdTop = state.birdY - birdRadius;
    var birdBottom = state.birdY + birdRadius;

    for (var i = state.pipes.length - 1; i >= 0; i--) {
        var pipe = state.pipes[i];
        pipe.x -= state.pipeSpeed;

        var gapTop = pipe.gapCenter - (state.gapSize / 2);
        var gapBottom = pipe.gapCenter + (state.gapSize / 2);

        if (!pipe.passed && (pipe.x + state.pipeWidth) < state.birdX) {
            pipe.passed = true;
            state.score++;
            UpdateFlappyHud(state);
        }

        if (birdRight > pipe.x && birdLeft < (pipe.x + state.pipeWidth)) {
            if (birdTop < gapTop || birdBottom > gapBottom) {
                RenderFlappy(state);
                EndFlappyGame(state, "Crashed. Click playfield to restart.");
                return;
            }
        }

        if ((pipe.x + state.pipeWidth) < -10) {
            if (pipe.panel && pipe.panel.IsValid && pipe.panel.IsValid()) {
                pipe.panel.DeleteAsync(0);
            }
            state.pipes.splice(i, 1);
        }
    }

    RenderFlappy(state);
    $.Schedule(0.033, function() {
        StepFlappy(state, token);
    });
}

function ResetFlappyGame(state) {
    if (!state || !state.active) return;
    RefreshFlappyBounds(state);

    state.gameOver = false;
    state.score = 0;
    state.spawnTimer = 42;
    state.birdY = Math.floor(state.gameHeight * 0.5);
    state.birdVel = 0;

    for (var i = 0; i < state.pipes.length; i++) {
        if (state.pipes[i] && state.pipes[i].panel && state.pipes[i].panel.IsValid && state.pipes[i].panel.IsValid()) {
            state.pipes[i].panel.DeleteAsync(0);
        }
    }
    state.pipes = [];

    UpdateFlappyHud(state);
    UpdateFlappyStatus(state, "");
    RenderFlappy(state);

    StopFlappyLoop();
    var token = gFlappyLoopToken;
    StepFlappy(state, token);
}

function CloseFlappyModal(overlay) {
    StopFlappyLoop();
    if (gFlappyState) {
        gFlappyState.active = false;
        gFlappyState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseFlappyModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeFlappyOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseFlappyModal(overlay);
    } else {
        StopFlappyLoop();
    }
}

function OpenFlappyModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    CloseFlappyModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeFlappyOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseFlappyModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeFlappyModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseFlappyModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeFlappyTitle");
    header.text = "Flappy Bat";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeFlappyHudRow");
    hudRow.AddClass("ArcadeFlappyHudRow");
    var scoreLabel = $.CreatePanel("Label", hudRow, "ArcadeFlappyScore");
    scoreLabel.AddClass("ArcadeFlappyStat");
    var bestLabel = $.CreatePanel("Label", hudRow, "ArcadeFlappyBest");
    bestLabel.AddClass("ArcadeFlappyStat");

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeFlappyGameArea");
    gameArea.AddClass("ArcadeFlappyGameArea");

    var pipesLayer = $.CreatePanel("Panel", gameArea, "ArcadeFlappyPipeLayer");
    pipesLayer.AddClass("ArcadeFlappyPipeLayer");

    var birdPanel = $.CreatePanel("Image", gameArea, "ArcadeFlappyBird", {
        src: FLAPPY_BIRD_IMAGE_SRC,
        defaultsrc: "",
        scaling: "contain"
    });
    birdPanel.AddClass("ArcadeFlappyBird");
    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeFlappyStatusLabel");
    statusLabel.AddClass("ArcadeFlappyStatusLabel");
    statusLabel.style.visibility = "collapse";

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        score: 0,
        bestScore: 0,
        gameWidth: 640,
        gameHeight: 500,
        birdX: 110,
        birdY: 250,
        birdVel: 0,
        birdSize: 44,
        gravity: 0.44,
        flapImpulse: -6.7,
        pipeWidth: 64,
        pipeSpeed: 2.5,
        gapSize: 114,
        pipeSpawnTicks: 72,
        spawnTimer: 42,
        pipeSerial: 0,
        pipes: [],
        scoreLabel: scoreLabel,
        bestLabel: bestLabel,
        statusLabel: statusLabel,
        pipesLayer: pipesLayer,
        birdPanel: birdPanel
    };
    gFlappyState = state;

    gameArea.SetPanelEvent("onactivate", function() {
        if (!state.active) return;
        if (state.gameOver) {
            ResetFlappyGame(state);
            return;
        }
        Flap(state);
    });
    ResetFlappyGame(state);
}

function StopAimTrainerLoop() {
    gAimTrainerLoopToken++;
}

function UpdateAimTrainerStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? text : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateAimTrainerHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        var timeLeft = Math.max(0, durationSec - state.elapsedSec);
        state.timerLabel.text = "Time: " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = "Hits: " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = "Misses: " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = "Accuracy: " + accuracy + "%";
    }
}

function ApplyAimTrainerDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetAimTrainerDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.durationSec = cfg.durationSec;
    state.targetStartSize = cfg.targetStartSize;
    state.targetEndSize = cfg.targetEndSize;
    state.targetLifeStartSec = cfg.targetLifeStartSec;
    state.targetLifeEndSec = cfg.targetLifeEndSec;

    if (state.difficultyButtons) {
        for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
            var key = AIM_TRAINER_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetAimTrainer(state);
    } else {
        UpdateAimTrainerHud(state);
    }
}

function SpawnAimTrainerTarget(state) {
    if (!state || !state.active) return;
    RefreshAimTrainerBounds(state);
    ApplyAimTrainerTargetImage(state);
    var nowSec = Date.now() / 1000.0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    var speedScale = Math.min(1, state.elapsedSec / durationSec);
    state.targetLifeSec = Math.max(0.20, state.targetLifeStartSec + ((state.targetLifeEndSec - state.targetLifeStartSec) * speedScale));
    state.targetSpawnSec = nowSec;
    state.targetVisible = true;

    var size = state.targetStartSize;
    var maxX = Math.max(0, state.gameWidth - size);
    var statusInset = Math.max(0, Number(state.statusInset || 0));
    var maxY = Math.max(0, (state.gameHeight - statusInset) - size);
    state.targetBaseX = Math.floor(Math.random() * (maxX + 1));
    state.targetBaseY = Math.floor(Math.random() * (maxY + 1));
}

function RenderAimTrainerTarget(state, nowSec) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    if (!state.targetVisible) {
        state.targetBtn.style.visibility = "collapse";
        return;
    }

    var elapsed = Math.max(0, nowSec - state.targetSpawnSec);
    var t = Math.min(1, elapsed / state.targetLifeSec);
    var size = state.targetStartSize + ((state.targetEndSize - state.targetStartSize) * t);
    var sizePx = Math.max(18, Math.floor(size));
    var centerX = state.targetBaseX + (state.targetStartSize * 0.5);
    var centerY = state.targetBaseY + (state.targetStartSize * 0.5);
    var x = Math.floor(centerX - (sizePx * 0.5));
    var y = Math.floor(centerY - (sizePx * 0.5));

    state.targetBtn.style.visibility = "visible";
    state.targetBtn.style.width = sizePx + "px";
    state.targetBtn.style.height = sizePx + "px";
    state.targetBtn.style.x = x + "px";
    state.targetBtn.style.y = y + "px";

    if (elapsed >= state.targetLifeSec) {
        state.misses++;
        UpdateAimTrainerHud(state);
        QueueAimTrainerNextSpawn(state);
    }
}

function QueueAimTrainerNextSpawn(state) {
    if (!state) return;
    state.targetVisible = false;
    state.pendingSpawn = true;
    if (state.targetBtn && state.targetBtn.IsValid && state.targetBtn.IsValid()) {
        state.targetBtn.style.visibility = "collapse";
    }
}

function PlayAimTrainerHitSound() {
    PlayArcadeGameSoundEffect(AIM_TRAINER_HIT_SOUND_EVENT);
}

function EndAimTrainer(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    state.pendingSpawn = false;
    state.targetVisible = false;
    RenderAimTrainerTarget(state, Date.now() / 1000.0);
    UpdateAimTrainerHud(state);
    UpdateAimTrainerStatus(state, "Run complete. Press New Run.");
    StopAimTrainerLoop();
}

function HandleAimTrainerHit(state) {
    if (!state || !state.active || state.gameOver || !state.targetVisible) return;
    state.hits++;
    PlayAimTrainerHitSound();
    UpdateAimTrainerHud(state);
    QueueAimTrainerNextSpawn(state);
}

function StepAimTrainer(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gAimTrainerLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);

    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndAimTrainer(state);
        return;
    }

    if (state.pendingSpawn === true) {
        state.pendingSpawn = false;
        SpawnAimTrainerTarget(state);
    } else if (!state.targetVisible) {
        SpawnAimTrainerTarget(state);
    }
    RenderAimTrainerTarget(state, nowSec);
    UpdateAimTrainerHud(state);

    $.Schedule(0.033, function() {
        StepAimTrainer(state, token);
    });
}

function ResetAimTrainer(state) {
    if (!state || !state.active) return;
    RefreshAimTrainerBounds(state);
    state.gameOver = false;
    state.hits = 0;
    state.misses = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.targetVisible = false;
    state.pendingSpawn = true;
    UpdateAimTrainerStatus(state, "");
    UpdateAimTrainerHud(state);
    if (state.targetBtn && state.targetBtn.IsValid && state.targetBtn.IsValid()) {
        state.targetBtn.style.visibility = "collapse";
    }

    StopAimTrainerLoop();
    var token = gAimTrainerLoopToken;
    StepAimTrainer(state, token);
}

function RefreshAimTrainerBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function CloseAimTrainerModal(overlay) {
    StopAimTrainerLoop();
    if (gAimTrainerState) {
        gAimTrainerState.active = false;
        gAimTrainerState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseAimTrainerModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeAimTrainerOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseAimTrainerModal(overlay);
    } else {
        StopAimTrainerLoop();
    }
}

function OpenAimTrainerModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    CloseAimTrainerModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeAimTrainerOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseAimTrainerModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeAimTrainerModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseAimTrainerModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeAimTrainerTitle");
    header.text = "Graves Trainer";

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerActionRow");
    actionRow.AddClass("ArcadeAimTrainerActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeAimTrainerNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeAimTrainerControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = "New Run";

    var difficultyButtons = {};
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeAimTrainerDifficultyGroup");
    difficultyGroup.AddClass("ArcadeAimTrainerDifficultyGroup");
    for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeAimTrainerDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeAimTrainerDifficultyBtn");
            diffBtn.AddClass("ArcadeAimTrainerControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyAimTrainerDifficulty(state, cfg.id, true);
            });
        })(AIM_TRAINER_DIFFICULTIES[i]);
    }

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerArea");
    gameArea.AddClass("ArcadeAimTrainerArea");

    var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeAimTrainerTarget");
    targetBtn.AddClass("ArcadeAimTrainerTarget");
    var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeAimTrainerTargetImage");
    targetImage.AddClass("ArcadeAimTrainerTargetImage");
    try { targetImage.SetImage(AIM_TRAINER_TARGET_IMAGE_PATHS[0]); } catch (eInitImage) {}

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeAimTrainerStatusLabel");
    statusLabel.AddClass("ArcadeAimTrainerStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerHudRow");
    hudRow.AddClass("ArcadeAimTrainerHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeAimTimer");
    timerLabel.AddClass("ArcadeAimTrainerStat");
    timerLabel.AddClass("ArcadeAimTrainerStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeAimHits");
    hitLabel.AddClass("ArcadeAimTrainerStat");
    hitLabel.AddClass("ArcadeAimTrainerStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeAimMisses");
    missLabel.AddClass("ArcadeAimTrainerStat");
    missLabel.AddClass("ArcadeAimTrainerStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeAimAcc");
    accLabel.AddClass("ArcadeAimTrainerStat");
    accLabel.AddClass("ArcadeAimTrainerStatAccuracy");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        gameWidth: 640,
        gameHeight: 430,
        statusInset: 40,
        hits: 0,
        misses: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        difficultyId: AIM_TRAINER_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        durationSec: AIM_TRAINER_DURATION_SEC,
        targetVisible: false,
        pendingSpawn: false,
        targetSpawnSec: 0,
        targetLifeSec: 1.0,
        targetLifeStartSec: 1.05,
        targetLifeEndSec: 0.52,
        targetBaseX: 0,
        targetBaseY: 0,
        targetStartSize: 74,
        targetEndSize: 40,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        statusLabel: statusLabel,
        targetBtn: targetBtn,
        gameArea: gameArea,
        targetImage: targetImage,
        targetImagePath: AIM_TRAINER_TARGET_IMAGE_PATHS[0]
    };
    gAimTrainerState = state;

    targetBtn.SetPanelEvent("onactivate", function() {
        HandleAimTrainerHit(state);
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetAimTrainer(state);
    });

    ApplyAimTrainerDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopTrainTrackingLoop() {
    gTrainTrackingLoopToken++;
}

function UpdateTrainTrackingStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? text : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateTrainTrackingHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : TRAIN_TRACKING_DURATION_SEC;
    var timeLeft = Math.max(0, durationSec - state.elapsedSec);
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        state.timerLabel.text = "Time: " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = "Hits: " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = "Misses: " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = "Accuracy: " + accuracy + "%";
    }
    if (state.streakLabel && state.streakLabel.IsValid && state.streakLabel.IsValid()) {
        state.streakLabel.text = "Streak: " + state.streak;
    }
}

function ApplyTrainTrackingDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetTrainTrackingDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.durationSec = TRAIN_TRACKING_DURATION_SEC;
    state.baseSpeed = cfg.baseSpeed;
    state.maxSpeed = cfg.maxSpeed;
    state.speedGainPerScore = cfg.speedGainPerScore;
    state.sampleIntervalSec = cfg.sampleIntervalSec;
    state.jitterTickReset = cfg.jitterTickReset;
    state.targetWidth = cfg.targetSize;
    state.targetHeight = cfg.targetSize;

    if (state.difficultyButtons) {
        for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
            var key = TRAIN_TRACKING_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetTrainTracking(state);
    } else {
        UpdateTrainTrackingHud(state);
    }
}

function GetTrainTrackingSpeed(state) {
    return Math.sqrt((state.velX * state.velX) + (state.velY * state.velY));
}

function SetTrainTrackingSpeed(state, speed) {
    var mag = GetTrainTrackingSpeed(state);
    if (mag < 0.001) {
        state.velX = speed;
        state.velY = 0;
        return;
    }
    var ratio = speed / mag;
    state.velX *= ratio;
    state.velY *= ratio;
}

function RefreshTrainTrackingBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function RenderTrainTrackingTarget(state) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    state.targetBtn.style.width = Math.round(state.targetWidth) + "px";
    state.targetBtn.style.height = Math.round(state.targetHeight) + "px";
    state.targetBtn.style.x = Math.floor(state.targetX) + "px";
    state.targetBtn.style.y = Math.floor(state.targetY) + "px";
}

function ClearTrainTrackingFlash(state) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    state.targetBtn.RemoveClass("HitFlashSuccess");
    state.targetBtn.RemoveClass("HitFlashFail");
}

function SetTrainTrackingFlash(state, flashClass) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    ClearTrainTrackingFlash(state);
    if (flashClass) state.targetBtn.AddClass(flashClass);
}

function PlayTrainTrackingHitSound() {
    var options = TRAIN_TRACKING_HIT_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "train_tracking_hit");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function EndTrainTracking(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    state.hoveringTarget = false;
    ClearTrainTrackingFlash(state);
    UpdateTrainTrackingHud(state);
    UpdateTrainTrackingStatus(state, "Run complete. Press New Run.");
    StopTrainTrackingLoop();
}

function StepTrainTracking(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gTrainTrackingLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : TRAIN_TRACKING_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndTrainTracking(state);
        return;
    }

    RefreshTrainTrackingBounds(state);

    state.targetX += state.velX;
    state.targetY += state.velY;

    var maxX = state.gameWidth - state.targetWidth;
    var maxY = state.gameHeight - state.targetHeight;
    if (state.targetX <= 0) {
        state.targetX = 0;
        state.velX = Math.abs(state.velX);
    } else if (state.targetX >= maxX) {
        state.targetX = maxX;
        state.velX = -Math.abs(state.velX);
    }
    if (state.targetY <= 0) {
        state.targetY = 0;
        state.velY = Math.abs(state.velY);
    } else if (state.targetY >= maxY) {
        state.targetY = maxY;
        state.velY = -Math.abs(state.velY);
    }

    state.jitterTick--;
    if (state.jitterTick <= 0) {
        state.jitterTick = state.jitterTickReset;
        state.velY += ((Math.random() * 2) - 1) * 0.65;
        if (Math.abs(state.velY) < 0.35) state.velY = state.velY < 0 ? -0.35 : 0.35;
        SetTrainTrackingSpeed(state, Math.min(state.maxSpeed, Math.max(state.baseSpeed, GetTrainTrackingSpeed(state))));
    }

    if (nowSec >= state.nextScoreSampleSec) {
        var nextFlashAllowedSec = Number(state.nextFlashAllowedSec || 0);
        var nextHitSoundAllowedSec = Number(state.nextHitSoundAllowedSec || 0);
        var canPlayFlash = !(isFinite(nextFlashAllowedSec) && nowSec < nextFlashAllowedSec);
        var canPlayHitSound = !(isFinite(nextHitSoundAllowedSec) && nowSec < nextHitSoundAllowedSec);
        if (state.hoveringTarget) {
            state.hits++;
            state.streak++;
            if (state.streak > state.bestStreak) state.bestStreak = state.streak;
            SetTrainTrackingSpeed(state, Math.min(state.maxSpeed, GetTrainTrackingSpeed(state) + state.speedGainPerScore));
            if (canPlayHitSound) {
                PlayTrainTrackingHitSound();
                state.nextHitSoundAllowedSec = nowSec + TRAIN_TRACKING_HIT_SOUND_MIN_INTERVAL_SEC;
            }
            if (canPlayFlash) {
                state.nextFlashAllowedSec = nowSec + TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC;
                var hitFlashToken = Number(state.flashToken || 0) + 1;
                state.flashToken = hitFlashToken;
                SetTrainTrackingFlash(state, "HitFlashSuccess");
                $.Schedule(TRAIN_TRACKING_HIT_FLASH_SEC, function() {
                    if (!state || !state.active) return;
                    if (Number(state.flashToken || 0) !== hitFlashToken) return;
                    ClearTrainTrackingFlash(state);
                });
            }
        } else {
            state.misses++;
            state.streak = 0;
            if (canPlayFlash) {
                state.nextFlashAllowedSec = nowSec + TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC;
                var missFlashToken = Number(state.flashToken || 0) + 1;
                state.flashToken = missFlashToken;
                SetTrainTrackingFlash(state, "HitFlashFail");
                $.Schedule(TRAIN_TRACKING_HIT_FLASH_SEC, function() {
                    if (!state || !state.active) return;
                    if (Number(state.flashToken || 0) !== missFlashToken) return;
                    ClearTrainTrackingFlash(state);
                });
            }
        }
        state.nextScoreSampleSec = nowSec + state.sampleIntervalSec;
        UpdateTrainTrackingHud(state);
    }

    RenderTrainTrackingTarget(state);
    UpdateTrainTrackingHud(state);

    $.Schedule(0.033, function() {
        StepTrainTracking(state, token);
    });
}

function ResetTrainTracking(state) {
    if (!state || !state.active) return;
    RefreshTrainTrackingBounds(state);
    state.gameOver = false;
    state.flashToken = Number(state.flashToken || 0) + 1;
    state.hits = 0;
    state.misses = 0;
    state.streak = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.nextFlashAllowedSec = state.startSec;
    state.nextHitSoundAllowedSec = state.startSec;
    state.hoveringTarget = false;

    state.targetX = Math.floor((state.gameWidth - state.targetWidth) * 0.5);
    state.targetY = Math.floor((state.gameHeight - state.targetHeight) * 0.5);
    state.velX = state.baseSpeed;
    state.velY = state.baseSpeed * 0.34;
    state.jitterTick = state.jitterTickReset;
    state.nextScoreSampleSec = state.startSec + state.sampleIntervalSec;

    ClearTrainTrackingFlash(state);
    UpdateTrainTrackingStatus(state, "");
    UpdateTrainTrackingHud(state);
    RenderTrainTrackingTarget(state);

    StopTrainTrackingLoop();
    var token = gTrainTrackingLoopToken;
    StepTrainTracking(state, token);
}

function CloseTrainTrackingModal(overlay) {
    StopTrainTrackingLoop();
    if (gTrainTrackingState) {
        gTrainTrackingState.active = false;
        gTrainTrackingState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseTrainTrackingModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeTrainTrackingOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseTrainTrackingModal(overlay);
    } else {
        StopTrainTrackingLoop();
    }
}

function OpenTrainTrackingModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    CloseTrainTrackingModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeTrainTrackingOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseTrainTrackingModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeTrainTrackingModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseTrainTrackingModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeTrainTrackingTitle");
    header.text = "Zerggy Mania";

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingActionRow");
    actionRow.AddClass("ArcadeTrainTrackingActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeTrainTrackingNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeTrainTrackingControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = "New Run";

    var difficultyButtons = {};
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeTrainTrackingDifficultyGroup");
    difficultyGroup.AddClass("ArcadeTrainTrackingDifficultyGroup");
    for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeTrainTrackingDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeTrainTrackingDifficultyBtn");
            diffBtn.AddClass("ArcadeTrainTrackingControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyTrainTrackingDifficulty(state, cfg.id, true);
            });
        })(TRAIN_TRACKING_DIFFICULTIES[i]);
    }

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingArea");
    gameArea.AddClass("ArcadeTrainTrackingArea");

    var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeTrainTrackingTarget");
    targetBtn.AddClass("ArcadeTrainTrackingTarget");
    var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeTrainTrackingTargetImage");
    targetImage.AddClass("ArcadeTrainTrackingTargetImage");
    try { targetImage.SetImage(TRAIN_TRACKING_TARGET_IMAGE_SRC); } catch (eTrainImg) {}

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeTrainTrackingStatusLabel");
    statusLabel.AddClass("ArcadeTrainTrackingStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingHudRow");
    hudRow.AddClass("ArcadeTrainTrackingHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingTime");
    timerLabel.AddClass("ArcadeTrainTrackingStat");
    timerLabel.AddClass("ArcadeTrainTrackingStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingHits");
    hitLabel.AddClass("ArcadeTrainTrackingStat");
    hitLabel.AddClass("ArcadeTrainTrackingStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingMisses");
    missLabel.AddClass("ArcadeTrainTrackingStat");
    missLabel.AddClass("ArcadeTrainTrackingStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingAcc");
    accLabel.AddClass("ArcadeTrainTrackingStat");
    accLabel.AddClass("ArcadeTrainTrackingStatAccuracy");
    var streakLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingStreak");
    streakLabel.AddClass("ArcadeTrainTrackingStat");
    streakLabel.AddClass("ArcadeTrainTrackingStatStreak");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        gameWidth: 640,
        gameHeight: 430,
        difficultyId: TRAIN_TRACKING_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        durationSec: TRAIN_TRACKING_DURATION_SEC,
        targetWidth: 84,
        targetHeight: 84,
        targetX: 0,
        targetY: 0,
        velX: 7.4,
        velY: 2.4,
        baseSpeed: 7.4,
        maxSpeed: 13.6,
        speedGainPerScore: 0.22,
        sampleIntervalSec: 0.10,
        nextScoreSampleSec: 0,
        hoveringTarget: false,
        flashToken: 0,
        nextFlashAllowedSec: 0,
        nextHitSoundAllowedSec: 0,
        jitterTickReset: 13,
        jitterTick: 13,
        hits: 0,
        misses: 0,
        streak: 0,
        bestStreak: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        streakLabel: streakLabel,
        statusLabel: statusLabel,
        targetBtn: targetBtn,
        targetImage: targetImage,
        gameArea: gameArea
    };
    gTrainTrackingState = state;

    targetBtn.SetPanelEvent("onmouseover", function() {
        state.hoveringTarget = true;
    });
    targetBtn.SetPanelEvent("onmouseout", function() {
        state.hoveringTarget = false;
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetTrainTracking(state);
    });

    ApplyTrainTrackingDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopWhackRemLoop() {
    gWhackRemLoopToken++;
}

function GetWhackRemDifficultyById(difficultyId) {
    var wanted = String(difficultyId || "");
    for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
        var cfg = WHACK_A_REM_DIFFICULTIES[i];
        if (cfg.id === wanted) return cfg;
    }
    return WHACK_A_REM_DIFFICULTIES[0];
}

function ApplyWhackRemDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetWhackRemDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.maxConcurrent = cfg.maxConcurrent;
    state.lifeStartSec = cfg.lifeStartSec;
    state.lifeEndSec = cfg.lifeEndSec;
    state.spawnDelaySec = cfg.spawnDelaySec;

    if (state.difficultyButtons) {
        for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
            var key = WHACK_A_REM_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetWhackRem(state);
    } else {
        UpdateWhackRemHud(state);
    }
}

function UpdateWhackRemStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && String(text).length > 0);
        state.statusLabel.text = hasText ? String(text) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateWhackRemHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        var timeLeft = Math.max(0, durationSec - state.elapsedSec);
        state.timerLabel.text = "Time: " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = "Hits: " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = "Misses: " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = "Accuracy: " + accuracy + "%";
    }
    if (state.streakLabel && state.streakLabel.IsValid && state.streakLabel.IsValid()) {
        state.streakLabel.text = "Streak: " + state.streak;
    }
}

function GetWhackRemVisibleCount(state) {
    if (!state || !Array.isArray(state.slots)) return 0;
    var count = 0;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot) continue;
        if (slot.visible || slot.flashActive) count++;
    }
    return count;
}

function BuildWhackRemUsedHoleMap(state) {
    var used = {};
    if (!state || !Array.isArray(state.slots)) return used;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot) continue;
        if (!(slot.visible || slot.flashActive)) continue;
        var hi = Number(slot.holeIndex);
        if (isFinite(hi) && hi >= 0) used[hi] = true;
    }
    return used;
}

function GetWhackRemSlot(state, slotIndex) {
    if (!state || !Array.isArray(state.slots)) return null;
    var idx = Number(slotIndex);
    if (!isFinite(idx)) return null;
    idx = Math.floor(idx);
    if (idx < 0 || idx >= state.slots.length) return null;
    return state.slots[idx] || null;
}

function RefreshWhackRemBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    var nextWidth = 680;
    var nextHeight = 500;
    state.gameWidth = nextWidth;
    state.gameHeight = nextHeight;

    var cols = 3;
    var rows = 3;
    var padX = Math.floor(nextWidth * 0.13);
    var padY = Math.floor(nextHeight * 0.15);
    var spanX = Math.max(1, nextWidth - (padX * 2));
    var spanY = Math.max(1, nextHeight - (padY * 2));
    var holeSize = Math.max(68, Math.min(128, Math.floor(Math.min(spanX / cols, spanY / rows) * 0.65)));

    state.holes = [];
    var idx = 0;
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var centerX = Math.floor(padX + ((c + 0.5) * (spanX / cols)));
            var centerY = Math.floor(padY + ((r + 0.5) * (spanY / rows)));
            var x = centerX - Math.floor(holeSize * 0.5);
            var y = centerY - Math.floor(holeSize * 0.5);
            state.holes.push({
                x: x,
                y: y,
                size: holeSize
            });
            var holePanel = state.holePanels && state.holePanels[idx];
            if (holePanel && holePanel.IsValid && holePanel.IsValid()) {
                holePanel.style.x = x + "px";
                holePanel.style.y = y + "px";
                holePanel.style.width = holeSize + "px";
                holePanel.style.height = holeSize + "px";
            }
            idx++;
        }
    }
}

function SetWhackRemTargetVisible(state, slotIndex, visible) {
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    if (!visible || slot.holeIndex < 0 || !state.holes || slot.holeIndex >= state.holes.length) {
        slot.btn.style.visibility = "collapse";
        return;
    }
    var hole = state.holes[slot.holeIndex];
    slot.btn.style.x = hole.x + "px";
    slot.btn.style.y = hole.y + "px";
    slot.btn.style.width = hole.size + "px";
    slot.btn.style.height = hole.size + "px";
    slot.btn.style.visibility = "visible";
}

function ClearWhackRemSlotFlash(slot) {
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    slot.btn.RemoveClass("HitFlashSuccess");
    slot.btn.RemoveClass("HitFlashFail");
}

function SetWhackRemSlotFlash(slot, flashClass) {
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    ClearWhackRemSlotFlash(slot);
    if (flashClass) slot.btn.AddClass(flashClass);
}

function SpawnWhackRemTarget(state, slotIndex, nowSec) {
    if (!state || !state.active || state.gameOver) return false;
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!slot || slot.flashActive) return false;
    RefreshWhackRemBounds(state);
    if (!state.holes || state.holes.length <= 0) return false;
    var used = BuildWhackRemUsedHoleMap(state);
    var candidates = [];
    for (var iHole = 0; iHole < state.holes.length; iHole++) {
        if (!used[iHole]) candidates.push(iHole);
    }
    if (candidates.length <= 0) return false;
    var idx = candidates[Math.floor(Math.random() * candidates.length)];
    if (!isFinite(idx)) idx = candidates[0];

    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    var speedScale = Math.min(1, Math.max(0, state.elapsedSec / durationSec));
    var lifeStart = Number(state.lifeStartSec);
    var lifeEnd = Number(state.lifeEndSec);
    if (!isFinite(lifeStart)) lifeStart = 0.95;
    if (!isFinite(lifeEnd)) lifeEnd = 0.45;

    slot.holeIndex = idx;
    slot.visible = true;
    slot.flashActive = false;
    slot.expireSec = nowSec + Math.max(0.22, (lifeStart + ((lifeEnd - lifeStart) * speedScale)));
    slot.flashToken = Number(slot.flashToken || 0) + 1;
    ClearWhackRemSlotFlash(slot);
    SetWhackRemTargetVisible(state, slotIndex, true);
    return true;
}

function PlayWhackRemHitSound() {
    var options = WHACK_A_REM_HIT_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "whack_rem_hit");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayWhackRemMissSound() {
    var options = WHACK_A_REM_MISS_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "whack_rem_miss");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function GetWhackRemMissCandidateSlotIndex(state) {
    if (!state || !Array.isArray(state.slots)) return -1;
    var bestIdx = -1;
    var bestExpire = Number.POSITIVE_INFINITY;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot || !slot.visible) continue;
        var exp = Number(slot.expireSec);
        if (!isFinite(exp)) exp = Number.POSITIVE_INFINITY;
        if (exp < bestExpire) {
            bestExpire = exp;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function HandleWhackRemHit(state, slotIndex) {
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!state || !state.active || state.gameOver || !slot || !slot.visible) return;
    state.hits++;
    state.streak++;
    var nowMs = Date.now();
    state.lastHitMs = nowMs;
    PlayWhackRemHitSound();
    var flashToken = Number(slot.flashToken || 0) + 1;
    slot.flashToken = flashToken;
    slot.visible = false;
    slot.flashActive = true;
    SetWhackRemSlotFlash(slot, "HitFlashSuccess");
    slot.nextSpawnSec = (nowMs / 1000.0) + Math.max(0.08, Number(state.spawnDelaySec || 0.12));
    UpdateWhackRemHud(state);
    $.Schedule(WHACK_A_REM_HIT_FLASH_SEC, function() {
        if (!state || !state.active || state.gameOver) return;
        var slotAfter = GetWhackRemSlot(state, slotIndex);
        if (!slotAfter) return;
        if (Number(slotAfter.flashToken || 0) !== flashToken) return;
        slotAfter.flashActive = false;
        ClearWhackRemSlotFlash(slotAfter);
        SetWhackRemTargetVisible(state, slotIndex, false);
    });
}

function HandleWhackRemMiss(state, slotIndex) {
    if (!state || !state.active || state.gameOver) return;
    var resolvedSlotIndex = Number(slotIndex);
    if (!isFinite(resolvedSlotIndex) || resolvedSlotIndex < 0) {
        resolvedSlotIndex = GetWhackRemMissCandidateSlotIndex(state);
    }
    var slot = GetWhackRemSlot(state, resolvedSlotIndex);
    if (!slot || !slot.visible) return;
    state.misses++;
    state.streak = 0;
    PlayWhackRemMissSound();
    var nowMs = Date.now();
    var flashToken = Number(slot.flashToken || 0) + 1;
    slot.flashToken = flashToken;
    slot.visible = false;
    slot.flashActive = true;
    SetWhackRemSlotFlash(slot, "HitFlashFail");
    slot.nextSpawnSec = (nowMs / 1000.0) + Math.max(0.20, Number(state.spawnDelaySec || 0.12) + 0.05);
    UpdateWhackRemHud(state);
    $.Schedule(WHACK_A_REM_HIT_FLASH_SEC, function() {
        if (!state || !state.active || state.gameOver) return;
        var slotAfter = GetWhackRemSlot(state, resolvedSlotIndex);
        if (!slotAfter) return;
        if (Number(slotAfter.flashToken || 0) !== flashToken) return;
        slotAfter.flashActive = false;
        ClearWhackRemSlotFlash(slotAfter);
        SetWhackRemTargetVisible(state, resolvedSlotIndex, false);
    });
}

function EndWhackRem(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot) continue;
            slot.visible = false;
            slot.flashActive = false;
            slot.flashToken = Number(slot.flashToken || 0) + 1;
            ClearWhackRemSlotFlash(slot);
            SetWhackRemTargetVisible(state, i, false);
        }
    }
    UpdateWhackRemHud(state);
    UpdateWhackRemStatus(state, "Run complete. Press New Run.");
    StopWhackRemLoop();
}

function StepWhackRem(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gWhackRemLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndWhackRem(state);
        return;
    }

    RefreshWhackRemBounds(state);
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot || !slot.visible) continue;
            if (nowSec >= Number(slot.expireSec || 0)) {
                HandleWhackRemMiss(state, i);
            }
        }
    }
    var maxConcurrent = Number(state.maxConcurrent);
    if (!isFinite(maxConcurrent) || maxConcurrent < 1) maxConcurrent = 1;
    if (maxConcurrent > WHACK_A_REM_MAX_TARGETS) maxConcurrent = WHACK_A_REM_MAX_TARGETS;
    if (Array.isArray(state.slots)) {
        var visibleCount = GetWhackRemVisibleCount(state);
        for (var iSpawn = 0; iSpawn < state.slots.length && visibleCount < maxConcurrent; iSpawn++) {
            var spawnSlot = state.slots[iSpawn];
            if (!spawnSlot || spawnSlot.visible || spawnSlot.flashActive) continue;
            if (nowSec < Number(spawnSlot.nextSpawnSec || 0)) continue;
            if (SpawnWhackRemTarget(state, iSpawn, nowSec)) {
                visibleCount++;
            }
        }
    }
    UpdateWhackRemHud(state);

    $.Schedule(0.033, function() {
        StepWhackRem(state, token);
    });
}

function ResetWhackRem(state) {
    if (!state || !state.active) return;
    RefreshWhackRemBounds(state);
    state.gameOver = false;
    state.hits = 0;
    state.misses = 0;
    state.streak = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.lastHitMs = 0;
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot) continue;
            slot.visible = false;
            slot.flashActive = false;
            slot.holeIndex = -1;
            slot.expireSec = 0;
            slot.flashToken = Number(slot.flashToken || 0) + 1;
            slot.nextSpawnSec = state.startSec + 0.30 + (i * 0.05);
            ClearWhackRemSlotFlash(slot);
            SetWhackRemTargetVisible(state, i, false);
        }
    }
    UpdateWhackRemStatus(state, "");
    UpdateWhackRemHud(state);

    StopWhackRemLoop();
    var token = gWhackRemLoopToken;
    StepWhackRem(state, token);
}

function CloseWhackRemModal(overlay) {
    StopWhackRemLoop();
    if (gWhackRemState) {
        gWhackRemState.active = false;
        gWhackRemState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseWhackRemModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeWhackRemOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseWhackRemModal(overlay);
    } else {
        StopWhackRemLoop();
    }
}

function OpenWhackRemModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    CloseWhackRemModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeWhackRemOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseWhackRemModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeWhackRemModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseWhackRemModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeWhackRemTitle");
    header.text = "Whack a Rem";

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemActionRow");
    actionRow.AddClass("ArcadeWhackRemActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeWhackRemNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeWhackRemControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = "New Run";
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeWhackRemDifficultyGroup");
    difficultyGroup.AddClass("ArcadeAimTrainerDifficultyGroup");
    var difficultyButtons = {};
    (function() {
        for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
            (function(cfg) {
                var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeWhackRemDifficulty_" + cfg.id);
                diffBtn.AddClass("ArcadeMinesweeperActionBtn");
                diffBtn.AddClass("ArcadeAimTrainerDifficultyBtn");
                diffBtn.AddClass("ArcadeWhackRemControlBtn");
                var diffLbl = $.CreatePanel("Label", diffBtn, "");
                diffLbl.text = cfg.label;
                difficultyButtons[cfg.id] = diffBtn;
                diffBtn.SetPanelEvent("onactivate", function() {
                    ApplyWhackRemDifficulty(state, cfg.id, true);
                });
            })(WHACK_A_REM_DIFFICULTIES[i]);
        }
    })();

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemArea");
    gameArea.AddClass("ArcadeWhackRemArea");

    var holeLayer = $.CreatePanel("Panel", gameArea, "ArcadeWhackRemHoleLayer");
    holeLayer.AddClass("ArcadeWhackRemHoleLayer");
    var holePanels = [];
    for (var hi = 0; hi < 9; hi++) {
        var hole = $.CreatePanel("Panel", holeLayer, "ArcadeWhackRemHole_" + String(hi));
        hole.AddClass("ArcadeWhackRemHole");
        holePanels.push(hole);
    }

    var targetButtons = [];
    var targetImages = [];
    for (var t = 0; t < WHACK_A_REM_MAX_TARGETS; t++) {
        var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeWhackRemTarget_" + String(t));
        targetBtn.AddClass("ArcadeWhackRemTarget");
        var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeWhackRemTargetImage_" + String(t));
        targetImage.AddClass("ArcadeWhackRemTargetImage");
        try { targetImage.SetImage(WHACK_A_REM_TARGET_IMAGE_SRC); } catch (eRemImg) {}
        targetButtons.push(targetBtn);
        targetImages.push(targetImage);
    }

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeWhackRemStatusLabel");
    statusLabel.AddClass("ArcadeWhackRemStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemHudRow");
    hudRow.AddClass("ArcadeWhackRemHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemTime");
    timerLabel.AddClass("ArcadeWhackRemStat");
    timerLabel.AddClass("ArcadeWhackRemStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemHits");
    hitLabel.AddClass("ArcadeWhackRemStat");
    hitLabel.AddClass("ArcadeWhackRemStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemMisses");
    missLabel.AddClass("ArcadeWhackRemStat");
    missLabel.AddClass("ArcadeWhackRemStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemAccuracy");
    accLabel.AddClass("ArcadeWhackRemStat");
    accLabel.AddClass("ArcadeWhackRemStatAccuracy");
    var streakLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemStreak");
    streakLabel.AddClass("ArcadeWhackRemStat");
    streakLabel.AddClass("ArcadeWhackRemStatStreak");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        durationSec: WHACK_A_REM_DURATION_SEC,
        gameWidth: 640,
        gameHeight: 430,
        holes: [],
        holePanels: holePanels,
        hits: 0,
        misses: 0,
        streak: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        difficultyId: WHACK_A_REM_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        maxConcurrent: 2,
        lifeStartSec: 0.98,
        lifeEndSec: 0.50,
        spawnDelaySec: 0.17,
        lastHitMs: 0,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        streakLabel: streakLabel,
        statusLabel: statusLabel,
        slots: [],
        gameArea: gameArea
    };
    for (var si = 0; si < WHACK_A_REM_MAX_TARGETS; si++) {
        state.slots.push({
            btn: targetButtons[si],
            image: targetImages[si],
            visible: false,
            flashActive: false,
            holeIndex: -1,
            expireSec: 0,
            nextSpawnSec: 0,
            flashToken: 0
        });
    }
    gWhackRemState = state;

    for (var siEvent = 0; siEvent < WHACK_A_REM_MAX_TARGETS; siEvent++) {
        (function(slotIdx) {
            var slotBtn = targetButtons[slotIdx];
            if (!slotBtn || !slotBtn.SetPanelEvent) return;
            slotBtn.SetPanelEvent("onactivate", function() {
                HandleWhackRemHit(state, slotIdx);
            });
        })(siEvent);
    }
    gameArea.SetPanelEvent("onactivate", function() {
        if (!state.active || state.gameOver || GetWhackRemVisibleCount(state) <= 0) return;
        var nowMs = Date.now();
        if ((nowMs - state.lastHitMs) < 80) return;
        HandleWhackRemMiss(state, -1);
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetWhackRem(state);
    });

    ApplyWhackRemDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopBilliardsLoop() {
    gBilliardsLoopToken++;
}

function SetBilliardsStatus(state, text) {
    if (!state || !state.statusLabel || !state.statusLabel.IsValid || !state.statusLabel.IsValid()) return;
    var message = (typeof text === "string") ? text : "";
    if (message.length > 0) {
        state.statusLabel.text = message;
        state.statusLabel.style.visibility = "visible";
    } else {
        state.statusLabel.text = "";
        state.statusLabel.style.visibility = "collapse";
    }
}

function HideBilliardsAimPreview(state) {
    if (!state) return;
    if (state.aimLine && state.aimLine.IsValid && state.aimLine.IsValid()) state.aimLine.style.visibility = "collapse";
    if (state.aimGhost && state.aimGhost.IsValid && state.aimGhost.IsValid()) state.aimGhost.style.visibility = "collapse";
    if (Array.isArray(state.aimDots)) {
        for (var i = 0; i < state.aimDots.length; i++) {
            var dot = state.aimDots[i];
            if (dot && dot.IsValid && dot.IsValid()) dot.style.visibility = "collapse";
        }
    }
}

function TryGetBilliardsCursorInTable(state) {
    if (!state || !state.tablePanel || !state.tablePanel.IsValid || !state.tablePanel.IsValid()) return null;
    var cursor = null;
    try {
        if (typeof GameUI !== "undefined" && GameUI && typeof GameUI.GetCursorPosition === "function") {
            cursor = GameUI.GetCursorPosition();
        }
    } catch (eCursor) {
        cursor = null;
    }
    if (!cursor || cursor.length < 2) return null;
    var tx = Number(state.tablePanel.actualxoffset);
    var ty = Number(state.tablePanel.actualyoffset);
    if (!isFinite(tx) || !isFinite(ty) || Math.abs(tx) > 1000000000 || Math.abs(ty) > 1000000000) return null;
    var lx = Number(cursor[0]) - tx;
    var ly = Number(cursor[1]) - ty;
    if (!isFinite(lx) || !isFinite(ly)) return null;
    return { x: lx, y: ly };
}

function SetBilliardsAimPreview(state, cueX, cueY, dirX, dirY, pullDist, tableWidth, tableHeight) {
    if (!state || !state.aimGhost) return;
    if (!isFinite(dirX) || !isFinite(dirY)) {
        HideBilliardsAimPreview(state);
        return;
    }

    var maxLen = 240;
    var t = maxLen;
    if (Math.abs(dirX) > 0.0001) {
        if (dirX > 0) t = Math.min(t, (tableWidth - cueX - BILLIARDS_BALL_RADIUS) / dirX);
        else t = Math.min(t, (BILLIARDS_BALL_RADIUS - cueX) / dirX);
    }
    if (Math.abs(dirY) > 0.0001) {
        if (dirY > 0) t = Math.min(t, (tableHeight - cueY - BILLIARDS_BALL_RADIUS) / dirY);
        else t = Math.min(t, (BILLIARDS_BALL_RADIUS - cueY) / dirY);
    }
    if (!isFinite(t)) t = 80;
    var len = Math.max(28, Math.min(maxLen, t));
    if (state.aimLine && state.aimLine.IsValid && state.aimLine.IsValid()) {
        state.aimLine.style.visibility = "collapse";
    }

    var dotCount = Array.isArray(state.aimDots) ? state.aimDots.length : 0;
    if (dotCount > 0) {
        var step = len / (dotCount + 1);
        for (var iDot = 0; iDot < dotCount; iDot++) {
            var dotPanel = state.aimDots[iDot];
            if (!dotPanel || !dotPanel.IsValid || !dotPanel.IsValid()) continue;
            var d = step * (iDot + 1);
            var px = cueX + (dirX * d);
            var py = cueY + (dirY * d);
            dotPanel.style.visibility = "visible";
            dotPanel.style.x = Math.floor(px - 3) + "px";
            dotPanel.style.y = Math.floor(py - 3) + "px";
            dotPanel.style.opacity = String(Math.max(0.2, 1.0 - (iDot * 0.08)));
        }
    }

    var ghostDist = Math.max(8, Math.min(52, pullDist * 0.42));
    var ghostX = cueX - (dirX * ghostDist);
    var ghostY = cueY - (dirY * ghostDist);
    state.aimGhost.style.visibility = "visible";
    state.aimGhost.style.x = Math.floor(ghostX - 6) + "px";
    state.aimGhost.style.y = Math.floor(ghostY - 6) + "px";
}

function UpdateBilliardsHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var remaining = 0;
    for (var i = 0; i < state.balls.length; i++) {
        var ball = state.balls[i];
        if (!ball || ball.isCue || ball.active !== true) continue;
        remaining++;
    }
    if (state.scoreLabel && state.scoreLabel.IsValid && state.scoreLabel.IsValid()) {
        state.scoreLabel.text = "Pocketed: " + String(state.score) + "/10";
    }
    if (state.shotsLabel && state.shotsLabel.IsValid && state.shotsLabel.IsValid()) {
        state.shotsLabel.text = "Shots: " + String(state.shots);
    }
    if (state.scratchLabel && state.scratchLabel.IsValid && state.scratchLabel.IsValid()) {
        state.scratchLabel.text = "Scratches: " + String(state.scratches);
    }
    if (state.remainingLabel && state.remainingLabel.IsValid && state.remainingLabel.IsValid()) {
        state.remainingLabel.text = "Remaining: " + String(remaining);
    }
    if (state.aimLabel && state.aimLabel.IsValid && state.aimLabel.IsValid()) {
        state.aimLabel.text = "Aim: " + String(Math.round(state.aimDeg)) + "\u00B0";
    }
    if (state.pullLabel && state.pullLabel.IsValid && state.pullLabel.IsValid()) {
        var pct = Math.max(0, Math.min(100, Math.round(Number(state.dragPowerPct) || 0)));
        state.pullLabel.text = "Power: " + String(pct) + "%";
    }
}

function CreateBilliardsBall(state, id, x, y, isCue, toneIndex) {
    var panel = $.CreatePanel("Panel", state.ballsLayer, "ArcadeBilliardsBall_" + String(id));
    panel.AddClass("ArcadeBilliardsBall");
    panel.AddClass(isCue ? "CueBall" : "ObjBall");
    if (!isCue) {
        panel.AddClass("Tone" + String(1 + ((toneIndex - 1) % 5)));
    }
    var label = $.CreatePanel("Label", panel, "");
    label.AddClass("ArcadeBilliardsBallLabel");
    label.text = isCue ? "C" : String(id);
    return {
        id: id,
        isCue: isCue === true,
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        r: BILLIARDS_BALL_RADIUS,
        active: true,
        panel: panel
    };
}

function AreBilliardsBallsSettled(state) {
    if (!state) return true;
    for (var i = 0; i < state.balls.length; i++) {
        var ball = state.balls[i];
        if (!ball || ball.active !== true) continue;
        if (Math.abs(ball.vx) > BILLIARDS_MIN_SPEED || Math.abs(ball.vy) > BILLIARDS_MIN_SPEED) {
            return false;
        }
    }
    return true;
}

function GetBilliardsCueBall(state) {
    if (!state) return null;
    for (var i = 0; i < state.balls.length; i++) {
        if (state.balls[i] && state.balls[i].isCue) return state.balls[i];
    }
    return null;
}

function CreateBilliardsRack(state) {
    if (!state || !state.ballsLayer || !state.ballsLayer.IsValid || !state.ballsLayer.IsValid()) return;

    for (var i = state.balls.length - 1; i >= 0; i--) {
        var oldBall = state.balls[i];
        if (oldBall && oldBall.panel && oldBall.panel.IsValid && oldBall.panel.IsValid()) {
            oldBall.panel.DeleteAsync(0);
        }
    }
    state.balls = [];

    var centerY = Math.floor(state.tableHeight * 0.5);
    var cueX = 160;
    state.balls.push(CreateBilliardsBall(state, 0, cueX, centerY, true, 0));

    var rackStartX = 460;
    var spacing = (BILLIARDS_BALL_RADIUS * 2) + 1;
    var id = 1;
    for (var row = 0; row < 4; row++) {
        for (var col = 0; col <= row; col++) {
            var px = rackStartX + Math.floor(row * (spacing * 0.88));
            var py = centerY + Math.floor((col - (row * 0.5)) * spacing);
            state.balls.push(CreateBilliardsBall(state, id, px, py, false, id));
            id++;
        }
    }
}

function RenderBilliards(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    for (var i = 0; i < state.balls.length; i++) {
        var ball = state.balls[i];
        if (!ball || !ball.panel || !ball.panel.IsValid || !ball.panel.IsValid()) continue;
        if (ball.active !== true) {
            ball.panel.style.visibility = "collapse";
            continue;
        }
        ball.panel.style.visibility = "visible";
        ball.panel.style.x = Math.floor(ball.x - ball.r) + "px";
        ball.panel.style.y = Math.floor(ball.y - ball.r) + "px";
    }
}

function ResolveBilliardsBallCollision(a, b) {
    if (!a || !b || a.active !== true || b.active !== true) return;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var distSq = (dx * dx) + (dy * dy);
    var minDist = a.r + b.r;
    if (distSq <= 0 || distSq >= (minDist * minDist)) return;

    var dist = Math.sqrt(distSq);
    if (dist < 0.0001) dist = 0.0001;
    var nx = dx / dist;
    var ny = dy / dist;
    var overlap = minDist - dist;
    if (overlap > 0) {
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
    }

    var rvx = b.vx - a.vx;
    var rvy = b.vy - a.vy;
    var velAlongNormal = (rvx * nx) + (rvy * ny);
    if (velAlongNormal >= 0) return;

    var restitution = 0.90;
    var impulse = -((1 + restitution) * velAlongNormal) / 2;
    var impulseX = impulse * nx;
    var impulseY = impulse * ny;
    a.vx -= impulseX;
    a.vy -= impulseY;
    b.vx += impulseX;
    b.vy += impulseY;
}

function RespawnBilliardsCueIfNeeded(state) {
    if (!state || state.pendingCueRespawn !== true) return;
    if (!AreBilliardsBallsSettled(state)) return;

    var cue = GetBilliardsCueBall(state);
    if (!cue) return;

    cue.active = true;
    cue.vx = 0;
    cue.vy = 0;
    cue.x = 160;
    cue.y = Math.floor(state.tableHeight * 0.5);

    for (var pass = 0; pass < 16; pass++) {
        var overlaps = false;
        for (var i = 0; i < state.balls.length; i++) {
            var other = state.balls[i];
            if (!other || other === cue || other.active !== true) continue;
            var dx = other.x - cue.x;
            var dy = other.y - cue.y;
            var minDist = cue.r + other.r + 1;
            if ((dx * dx) + (dy * dy) < (minDist * minDist)) {
                overlaps = true;
                cue.x -= 14;
                break;
            }
        }
        if (!overlaps) break;
    }

    state.pendingCueRespawn = false;
    SetBilliardsStatus(state, "Scratch. Cue ball returned.");
}

function StepBilliards(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gBilliardsLoopToken) return;
    if (state.gameOver) return;

    var width = state.tableWidth;
    var height = state.tableHeight;
    var pocketRadiusSq = state.pocketRadius * state.pocketRadius;

    for (var i = 0; i < state.balls.length; i++) {
        var ball = state.balls[i];
        if (!ball || ball.active !== true) continue;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= BILLIARDS_FRICTION;
        ball.vy *= BILLIARDS_FRICTION;
        if (Math.abs(ball.vx) < BILLIARDS_MIN_SPEED) ball.vx = 0;
        if (Math.abs(ball.vy) < BILLIARDS_MIN_SPEED) ball.vy = 0;

        if ((ball.x - ball.r) < 0) {
            ball.x = ball.r;
            ball.vx = Math.abs(ball.vx) * BILLIARDS_BOUNCE;
        } else if ((ball.x + ball.r) > width) {
            ball.x = width - ball.r;
            ball.vx = -Math.abs(ball.vx) * BILLIARDS_BOUNCE;
        }

        if ((ball.y - ball.r) < 0) {
            ball.y = ball.r;
            ball.vy = Math.abs(ball.vy) * BILLIARDS_BOUNCE;
        } else if ((ball.y + ball.r) > height) {
            ball.y = height - ball.r;
            ball.vy = -Math.abs(ball.vy) * BILLIARDS_BOUNCE;
        }
    }

    for (var a = 0; a < state.balls.length; a++) {
        var ba = state.balls[a];
        if (!ba || ba.active !== true) continue;
        for (var b = a + 1; b < state.balls.length; b++) {
            var bb = state.balls[b];
            if (!bb || bb.active !== true) continue;
            ResolveBilliardsBallCollision(ba, bb);
        }
    }

    for (var j = 0; j < state.balls.length; j++) {
        var target = state.balls[j];
        if (!target || target.active !== true) continue;
        for (var p = 0; p < state.pocketPoints.length; p++) {
            var pocket = state.pocketPoints[p];
            var pdx = target.x - pocket.x;
            var pdy = target.y - pocket.y;
            if ((pdx * pdx) + (pdy * pdy) > pocketRadiusSq) continue;

            target.active = false;
            target.vx = 0;
            target.vy = 0;
            if (target.isCue) {
                state.scratches++;
                state.pendingCueRespawn = true;
            } else {
                state.score++;
            }
            break;
        }
    }

    RespawnBilliardsCueIfNeeded(state);

    var remaining = 0;
    for (var k = 0; k < state.balls.length; k++) {
        var rem = state.balls[k];
        if (rem && rem.isCue !== true && rem.active === true) remaining++;
    }
    if (remaining <= 0) {
        state.gameOver = true;
        SetBilliardsStatus(state, "Rack cleared. Press New Rack.");
    }

    if (state.dragging) {
        var cueDrag = GetBilliardsCueBall(state);
        if (cueDrag && cueDrag.active === true) {
            var cursor = TryGetBilliardsCursorInTable(state);
            if (cursor) {
                var dx = cueDrag.x - cursor.x;
                var dy = cueDrag.y - cursor.y;
                var dist = Math.sqrt((dx * dx) + (dy * dy));
                if (isFinite(dist) && dist > 1) {
                    var dirX = dx / dist;
                    var dirY = dy / dist;
                    var pull = Math.max(0, Math.min(150, dist));
                    state.dragPowerPct = (pull / 150) * 100;
                    state.aimDeg = Math.atan2(dirY, dirX) * 180.0 / Math.PI;
                    state.pendingShotVx = dirX * (1.8 + ((pull / 150) * 8.8));
                    state.pendingShotVy = dirY * (1.8 + ((pull / 150) * 8.8));
                    SetBilliardsAimPreview(state, cueDrag.x, cueDrag.y, dirX, dirY, pull, width, height);
                } else {
                    state.dragPowerPct = 0;
                    state.pendingShotVx = 0;
                    state.pendingShotVy = 0;
                    HideBilliardsAimPreview(state);
                }
            }
        }
    }

    UpdateBilliardsHud(state);
    RenderBilliards(state);
    if (state.gameOver) return;

    $.Schedule(0.033, function() {
        StepBilliards(state, token);
    });
}

function ShootBilliardsVector(state, shotVx, shotVy) {
    if (!state || !state.active) return;
    if (state.gameOver) {
        SetBilliardsStatus(state, "Press New Rack to play again.");
        return;
    }
    if (!AreBilliardsBallsSettled(state)) {
        SetBilliardsStatus(state, "Wait for balls to settle.");
        return;
    }

    var cue = GetBilliardsCueBall(state);
    if (!cue || cue.active !== true) {
        SetBilliardsStatus(state, "Cue ball not ready.");
        return;
    }

    cue.vx += Number(shotVx) || 0;
    cue.vy += Number(shotVy) || 0;
    state.shots++;
    state.dragPowerPct = 0;
    state.pendingShotVx = 0;
    state.pendingShotVy = 0;
    HideBilliardsAimPreview(state);
    SetBilliardsStatus(state, "");
    UpdateBilliardsHud(state);
}

function BeginBilliardsDrag(state) {
    if (!state || !state.active || state.gameOver) return;
    if (!AreBilliardsBallsSettled(state)) return;
    var cue = GetBilliardsCueBall(state);
    if (!cue || cue.active !== true) return;
    var cursor = TryGetBilliardsCursorInTable(state);
    if (!cursor) return;
    var dx = cursor.x - cue.x;
    var dy = cursor.y - cue.y;
    var distSq = (dx * dx) + (dy * dy);
    if (distSq > ((cue.r + 14) * (cue.r + 14))) return;
    state.dragging = true;
    state.dragPowerPct = 0;
    state.pendingShotVx = 0;
    state.pendingShotVy = 0;
    SetBilliardsStatus(state, "");
}

function CancelBilliardsDrag(state) {
    if (!state) return;
    state.dragging = false;
    state.dragPowerPct = 0;
    state.pendingShotVx = 0;
    state.pendingShotVy = 0;
    HideBilliardsAimPreview(state);
    UpdateBilliardsHud(state);
}

function EndBilliardsDrag(state) {
    if (!state || !state.dragging) return;
    state.dragging = false;
    var vx = Number(state.pendingShotVx) || 0;
    var vy = Number(state.pendingShotVy) || 0;
    var speed = Math.sqrt((vx * vx) + (vy * vy));
    if (!isFinite(speed) || speed < 0.35) {
        CancelBilliardsDrag(state);
        return;
    }
    ShootBilliardsVector(state, vx, vy);
}

function ResetBilliardsGame(state) {
    if (!state || !state.active) return;
    state.gameOver = false;
    state.score = 0;
    state.shots = 0;
    state.scratches = 0;
    state.aimDeg = 0;
    state.dragging = false;
    state.dragPowerPct = 0;
    state.pendingShotVx = 0;
    state.pendingShotVy = 0;
    state.pendingCueRespawn = false;
    HideBilliardsAimPreview(state);
    CreateBilliardsRack(state);
    UpdateBilliardsHud(state);
    SetBilliardsStatus(state, "");
    RenderBilliards(state);

    StopBilliardsLoop();
    var token = gBilliardsLoopToken;
    StepBilliards(state, token);
}

function CloseBilliardsModal(overlay) {
    StopBilliardsLoop();
    if (gBilliardsState) {
        CancelBilliardsDrag(gBilliardsState);
        gBilliardsState.active = false;
        gBilliardsState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseBilliardsModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeBilliardsOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseBilliardsModal(overlay);
    } else {
        StopBilliardsLoop();
    }
}

function OpenBilliardsModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    CloseBilliardsModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeBilliardsOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseBilliardsModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeBilliardsModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseBilliardsModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeBilliardsTitle");
    header.text = "Billiards";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeBilliardsHudRow");
    hudRow.AddClass("ArcadeBilliardsHudRow");
    var scoreLabel = $.CreatePanel("Label", hudRow, "ArcadeBilliardsScore");
    scoreLabel.AddClass("ArcadeBilliardsStat");
    scoreLabel.AddClass("ArcadeBilliardsStatGreen");
    var shotsLabel = $.CreatePanel("Label", hudRow, "ArcadeBilliardsShots");
    shotsLabel.AddClass("ArcadeBilliardsStat");
    var scratchLabel = $.CreatePanel("Label", hudRow, "ArcadeBilliardsScratches");
    scratchLabel.AddClass("ArcadeBilliardsStat");
    scratchLabel.AddClass("ArcadeBilliardsStatRed");
    var remainingLabel = $.CreatePanel("Label", hudRow, "ArcadeBilliardsRemaining");
    remainingLabel.AddClass("ArcadeBilliardsStat");
    var aimLabel = $.CreatePanel("Label", hudRow, "ArcadeBilliardsAim");
    aimLabel.AddClass("ArcadeBilliardsStat");
    aimLabel.AddClass("ArcadeBilliardsStatBlue");
    var pullLabel = $.CreatePanel("Label", hudRow, "ArcadeBilliardsPull");
    pullLabel.AddClass("ArcadeBilliardsStat");
    pullLabel.AddClass("ArcadeBilliardsStatBlue");

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeBilliardsActionRow");
    actionRow.AddClass("ArcadeBilliardsActionRow");

    var newRackBtn = $.CreatePanel("Button", actionRow, "ArcadeBilliardsNewRackBtn");
    newRackBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRackBtn.AddClass("ArcadeBilliardsControlBtn");
    var newRackLbl = $.CreatePanel("Label", newRackBtn, "");
    newRackLbl.text = "New Rack";

    var actionHint = $.CreatePanel("Label", actionRow, "ArcadeBilliardsActionHint");
    actionHint.AddClass("ArcadeBilliardsActionHint");
    actionHint.text = "Drag from cue ball, pull back, release to shoot.";

    var area = $.CreatePanel("Panel", modalContainer, "ArcadeBilliardsArea");
    area.AddClass("ArcadeBilliardsArea");
    var table = $.CreatePanel("Panel", area, "ArcadeBilliardsTable");
    table.AddClass("ArcadeBilliardsTable");

    var pocketsLayer = $.CreatePanel("Panel", table, "ArcadeBilliardsPocketsLayer");
    pocketsLayer.AddClass("ArcadeBilliardsPocketsLayer");
    var guideLayer = $.CreatePanel("Panel", table, "ArcadeBilliardsGuideLayer");
    guideLayer.AddClass("ArcadeBilliardsGuideLayer");
    var ballsLayer = $.CreatePanel("Panel", table, "ArcadeBilliardsBallsLayer");
    ballsLayer.AddClass("ArcadeBilliardsBallsLayer");
    var aimLine = $.CreatePanel("Panel", guideLayer, "ArcadeBilliardsAimLine");
    aimLine.AddClass("ArcadeBilliardsAimLine");
    aimLine.style.visibility = "collapse";
    var aimDots = [];
    for (var ai = 0; ai < 10; ai++) {
        var dotPanel = $.CreatePanel("Panel", guideLayer, "ArcadeBilliardsAimDot_" + String(ai));
        dotPanel.AddClass("ArcadeBilliardsAimDot");
        if (ai === 9) dotPanel.AddClass("End");
        dotPanel.style.visibility = "collapse";
        aimDots.push(dotPanel);
    }
    var aimGhost = $.CreatePanel("Panel", guideLayer, "ArcadeBilliardsAimGhost");
    aimGhost.AddClass("ArcadeBilliardsAimGhost");
    aimGhost.style.visibility = "collapse";

    var pocketPoints = [
        { x: 0, y: 0 },
        { x: BILLIARDS_TABLE_WIDTH * 0.5, y: 0 },
        { x: BILLIARDS_TABLE_WIDTH, y: 0 },
        { x: 0, y: BILLIARDS_TABLE_HEIGHT },
        { x: BILLIARDS_TABLE_WIDTH * 0.5, y: BILLIARDS_TABLE_HEIGHT },
        { x: BILLIARDS_TABLE_WIDTH, y: BILLIARDS_TABLE_HEIGHT }
    ];
    for (var pi = 0; pi < pocketPoints.length; pi++) {
        var pk = $.CreatePanel("Panel", pocketsLayer, "ArcadeBilliardsPocket_" + String(pi));
        pk.AddClass("ArcadeBilliardsPocket");
        pk.style.x = Math.floor(pocketPoints[pi].x - BILLIARDS_POCKET_RADIUS) + "px";
        pk.style.y = Math.floor(pocketPoints[pi].y - BILLIARDS_POCKET_RADIUS) + "px";
    }

    var statusLabel = $.CreatePanel("Label", modalContainer, "ArcadeBilliardsStatusLabel");
    statusLabel.AddClass("ArcadeBilliardsStatusLabel");
    statusLabel.style.visibility = "collapse";

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        tableWidth: BILLIARDS_TABLE_WIDTH,
        tableHeight: BILLIARDS_TABLE_HEIGHT,
        pocketRadius: BILLIARDS_POCKET_RADIUS,
        pocketPoints: pocketPoints,
        balls: [],
        score: 0,
        shots: 0,
        scratches: 0,
        aimDeg: 0,
        dragPowerPct: 0,
        pendingShotVx: 0,
        pendingShotVy: 0,
        dragging: false,
        pendingCueRespawn: false,
        tablePanel: table,
        guideLayer: guideLayer,
        ballsLayer: ballsLayer,
        scoreLabel: scoreLabel,
        shotsLabel: shotsLabel,
        scratchLabel: scratchLabel,
        remainingLabel: remainingLabel,
        aimLabel: aimLabel,
        pullLabel: pullLabel,
        statusLabel: statusLabel,
        aimLine: aimLine,
        aimGhost: aimGhost,
        aimDots: aimDots
    };
    gBilliardsState = state;

    newRackBtn.SetPanelEvent("onactivate", function() { ResetBilliardsGame(state); });
    table.SetPanelEvent("onmousedown", function() { BeginBilliardsDrag(state); });
    table.SetPanelEvent("onmouseup", function() { EndBilliardsDrag(state); });
    table.SetPanelEvent("onmouseout", function() { EndBilliardsDrag(state); });
    area.SetPanelEvent("onmouseup", function() { EndBilliardsDrag(state); });

    ResetBilliardsGame(state);
}

const BLACKJACK_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const BLACKJACK_SUITS = ["S", "H", "D", "C"];

function CreateBlackjackDeck() {
    var deck = [];
    for (var s = 0; s < BLACKJACK_SUITS.length; s++) {
        for (var r = 0; r < BLACKJACK_RANKS.length; r++) {
            deck.push({
                rank: BLACKJACK_RANKS[r],
                suit: BLACKJACK_SUITS[s]
            });
        }
    }
    for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = deck[i];
        deck[i] = deck[j];
        deck[j] = temp;
    }
    return deck;
}

function GetBlackjackCardValue(card) {
    if (!card || !card.rank) return 0;
    var rank = String(card.rank);
    if (rank === "A") return 11;
    if (rank === "K" || rank === "Q" || rank === "J") return 10;
    var n = Number(rank);
    return isFinite(n) ? n : 0;
}

function GetBlackjackHandTotal(hand) {
    var cards = Array.isArray(hand) ? hand : [];
    var total = 0;
    var acesAsEleven = 0;
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        total += GetBlackjackCardValue(card);
        if (card && card.rank === "A") {
            acesAsEleven++;
        }
    }
    while (total > 21 && acesAsEleven > 0) {
        total -= 10;
        acesAsEleven--;
    }
    return {
        total: total,
        soft: acesAsEleven > 0
    };
}

function DrawBlackjackCard(state) {
    if (!state) return null;
    if (!Array.isArray(state.deck) || state.deck.length <= 0) {
        state.deck = CreateBlackjackDeck();
    }
    if (state.deck.length <= 0) return null;
    return state.deck.pop();
}

function FormatBlackjackCard(card) {
    if (!card || !card.rank || !card.suit) return "??";
    return String(card.rank) + String(card.suit);
}

function GetBlackjackSuitGlyph(suit) {
    var key = String(suit || "");
    if (key === "H") return "?";
    if (key === "D") return "?";
    if (key === "C") return "?";
    if (key === "S") return "?";
    return "?";
}

function ClearPanelChildren(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (typeof panel.RemoveAndDeleteChildren === "function") {
        panel.RemoveAndDeleteChildren();
        return;
    }
    var count = (panel.GetChildCount && isFinite(Number(panel.GetChildCount()))) ? Number(panel.GetChildCount()) : 0;
    for (var i = count - 1; i >= 0; i--) {
        var child = panel.GetChild ? panel.GetChild(i) : null;
        if (!child) continue;
        child.DeleteAsync(0);
    }
}

function CreateBlackjackCardPanel(parent, card, isHidden) {
    if (!parent || !parent.IsValid || !parent.IsValid()) return;
    var cardPanel = $.CreatePanel("Panel", parent, "");
    cardPanel.AddClass("ArcadeBlackjackCard");

    if (isHidden === true) {
        cardPanel.AddClass("Hidden");
        var hiddenText = $.CreatePanel("Label", cardPanel, "");
        hiddenText.AddClass("ArcadeBlackjackCardBack");
        hiddenText.text = "?";
        return;
    }

    var rank = (card && card.rank) ? String(card.rank) : "?";
    var suit = (card && card.suit) ? String(card.suit) : "?";
    var suitGlyph = GetBlackjackSuitGlyph(suit);

    if (suit === "H") cardPanel.AddClass("SuitHeart");
    else if (suit === "D") cardPanel.AddClass("SuitDiamond");
    else if (suit === "C") cardPanel.AddClass("SuitClub");
    else cardPanel.AddClass("SuitSpade");

    var topLeft = $.CreatePanel("Label", cardPanel, "");
    topLeft.AddClass("ArcadeBlackjackCardCorner");
    topLeft.AddClass("TopLeft");
    topLeft.text = suitGlyph;

    var center = $.CreatePanel("Label", cardPanel, "");
    center.AddClass("ArcadeBlackjackCardCenter");
    center.text = rank;

    var bottomRight = $.CreatePanel("Label", cardPanel, "");
    bottomRight.AddClass("ArcadeBlackjackCardCorner");
    bottomRight.AddClass("BottomRight");
    bottomRight.text = suitGlyph;
}

function RenderBlackjackCardsToContainer(container, hand, hideSecondCard) {
    if (!container || !container.IsValid || !container.IsValid()) return;
    ClearPanelChildren(container);
    var cards = Array.isArray(hand) ? hand : [];
    if (cards.length <= 0) {
        var emptyLabel = $.CreatePanel("Label", container, "");
        emptyLabel.AddClass("ArcadeBlackjackCardsEmpty");
        emptyLabel.text = "--";
        return;
    }
    for (var i = 0; i < cards.length; i++) {
        var hidden = (hideSecondCard === true && i === 1);
        CreateBlackjackCardPanel(container, cards[i], hidden);
    }
}

function UpdateBlackjackHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var handOver = (state.handOver === true);
    var playerTotalInfo = GetBlackjackHandTotal(state.playerHand);
    var dealerTotalInfo = GetBlackjackHandTotal(state.dealerHand);
    var dealerShowing = (Array.isArray(state.dealerHand) && state.dealerHand.length > 0)
        ? GetBlackjackCardValue(state.dealerHand[0])
        : 0;

    if (state.playerCardsContainer && state.playerCardsContainer.IsValid && state.playerCardsContainer.IsValid()) {
        RenderBlackjackCardsToContainer(state.playerCardsContainer, state.playerHand, false);
    }
    if (state.playerTotalLabel && state.playerTotalLabel.IsValid && state.playerTotalLabel.IsValid()) {
        state.playerTotalLabel.text = "Total: " + String(playerTotalInfo.total);
    }
    if (state.dealerCardsContainer && state.dealerCardsContainer.IsValid && state.dealerCardsContainer.IsValid()) {
        RenderBlackjackCardsToContainer(state.dealerCardsContainer, state.dealerHand, !handOver);
    }
    if (state.dealerTotalLabel && state.dealerTotalLabel.IsValid && state.dealerTotalLabel.IsValid()) {
        state.dealerTotalLabel.text = handOver ? ("Total: " + String(dealerTotalInfo.total)) : ("Showing: " + String(dealerShowing));
    }
    if (state.deckLabel && state.deckLabel.IsValid && state.deckLabel.IsValid()) {
        var remain = Array.isArray(state.deck) ? state.deck.length : 0;
        state.deckLabel.text = "Deck: " + String(remain);
    }
    if (state.resultLabel && state.resultLabel.IsValid && state.resultLabel.IsValid()) {
        var msg = String(state.resultText || "");
        var tone = String(state.resultTone || "");
        state.resultLabel.SetHasClass("ResultWin", tone === "win");
        state.resultLabel.SetHasClass("ResultLoss", tone === "loss");
        state.resultLabel.SetHasClass("ResultPush", tone === "push");
        if (msg.length > 0) {
            state.resultLabel.text = msg;
            state.resultLabel.style.visibility = "visible";
        } else {
            state.resultLabel.text = "";
            state.resultLabel.style.visibility = "collapse";
        }
    }
    if (state.playerRow && state.playerRow.IsValid && state.playerRow.IsValid()) {
        state.playerRow.SetHasClass("ResultWin", handOver && state.resultTone === "win");
        state.playerRow.SetHasClass("ResultLoss", handOver && state.resultTone === "loss");
    }
    if (state.dealerRow && state.dealerRow.IsValid && state.dealerRow.IsValid()) {
        state.dealerRow.SetHasClass("ResultWin", handOver && state.resultTone === "loss");
        state.dealerRow.SetHasClass("ResultLoss", handOver && state.resultTone === "win");
    }
    var canPlay = !handOver;
    if (state.hitBtn && state.hitBtn.IsValid && state.hitBtn.IsValid()) {
        state.hitBtn.SetHasClass("Disabled", !canPlay);
    }
    if (state.standBtn && state.standBtn.IsValid && state.standBtn.IsValid()) {
        state.standBtn.SetHasClass("Disabled", !canPlay);
    }
}

function IsBlackjackStateActive(state) {
    return !!(state && state.active === true && state.isValid && state.isValid());
}

function PlayBlackjackActionSound() {
    var options = BLACKJACK_ACTION_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "blackjack_action");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayBlackjackResultSound(tone) {
    var eventName = "";
    if (tone === "win") eventName = BLACKJACK_WIN_SOUND_EVENT;
    else if (tone === "loss") eventName = BLACKJACK_LOSE_SOUND_EVENT;
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function SetBlackjackResult(state, message, tone) {
    if (!state) return;
    state.resultText = String(message || "");
    state.resultTone = String(tone || "");
    UpdateBlackjackHud(state);
    PlayBlackjackResultSound(state.resultTone);
}

function ResolveBlackjackOutcome(state) {
    if (!state) return;
    var player = GetBlackjackHandTotal(state.playerHand).total;
    var dealer = GetBlackjackHandTotal(state.dealerHand).total;
    state.handOver = true;
    if (player > 21) {
        SetBlackjackResult(state, "Bust - Dealer wins.", "loss");
    } else if (dealer > 21) {
        SetBlackjackResult(state, "Dealer busts - You win.", "win");
    } else if (player > dealer) {
        SetBlackjackResult(state, "You win.", "win");
    } else if (player < dealer) {
        SetBlackjackResult(state, "Dealer wins.", "loss");
    } else {
        SetBlackjackResult(state, "Push.", "push");
    }
}

function BeginBlackjackHand(state) {
    if (!IsBlackjackStateActive(state)) return;
    state.deck = CreateBlackjackDeck();
    state.playerHand = [];
    state.dealerHand = [];
    state.handOver = false;
    state.resultText = "";
    state.resultTone = "";

    state.playerHand.push(DrawBlackjackCard(state));
    state.dealerHand.push(DrawBlackjackCard(state));
    state.playerHand.push(DrawBlackjackCard(state));
    state.dealerHand.push(DrawBlackjackCard(state));

    var playerTotal = GetBlackjackHandTotal(state.playerHand).total;
    var dealerTotal = GetBlackjackHandTotal(state.dealerHand).total;
    if (playerTotal === 21 || dealerTotal === 21) {
        state.handOver = true;
        if (playerTotal === 21 && dealerTotal === 21) SetBlackjackResult(state, "Push - Both have blackjack.", "push");
        else if (playerTotal === 21) SetBlackjackResult(state, "Blackjack - You win.", "win");
        else SetBlackjackResult(state, "Dealer blackjack.", "loss");
    } else {
        UpdateBlackjackHud(state);
    }
}

function HitBlackjack(state) {
    if (!IsBlackjackStateActive(state) || state.handOver) return;
    state.playerHand.push(DrawBlackjackCard(state));
    var playerTotal = GetBlackjackHandTotal(state.playerHand).total;
    if (playerTotal > 21) {
        state.handOver = true;
        SetBlackjackResult(state, "Bust - Dealer wins.", "loss");
        return;
    }
    PlayBlackjackActionSound();
    UpdateBlackjackHud(state);
}

function StandBlackjack(state) {
    if (!IsBlackjackStateActive(state) || state.handOver) return;
    while (GetBlackjackHandTotal(state.dealerHand).total < 17) {
        state.dealerHand.push(DrawBlackjackCard(state));
    }
    ResolveBlackjackOutcome(state);
    if (state.resultTone !== "win" && state.resultTone !== "loss") {
        PlayBlackjackActionSound();
    }
}

function CloseBlackjackModal(overlay) {
    if (gBlackjackState) {
        gBlackjackState.active = false;
        gBlackjackState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseBlackjackModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeBlackjackOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseBlackjackModal(overlay);
    } else if (gBlackjackState) {
        gBlackjackState.active = false;
        gBlackjackState = null;
    }
}

function OpenBlackjackModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    CloseBlackjackModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeBlackjackOverlay");
    overlay.AddClass("ModalOverlay");
    // Do not close on generic overlay activate; button/input clicks can bubble and
    // race panel deletion against in-flight blackjack handlers.
    overlay.SetPanelEvent("onactivate", function() {});
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeBlackjackModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseBlackjackModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeBlackjackTitle");
    header.text = "Wraithjack";

    var heroIcon = $.CreatePanel("Image", modalContainer, "ArcadeBlackjackHeroIcon");
    heroIcon.AddClass("ArcadeBlackjackHeroIcon");
    heroIcon.SetImage("file://{images}/qollock/wraith_sm_psd.vtex");

    var area = $.CreatePanel("Panel", modalContainer, "ArcadeBlackjackArea");
    area.AddClass("ArcadeBlackjackArea");
    var content = $.CreatePanel("Panel", area, "ArcadeBlackjackContent");
    content.AddClass("ArcadeBlackjackContent");

    var dealerRow = $.CreatePanel("Panel", content, "ArcadeBlackjackDealerRow");
    dealerRow.AddClass("ArcadeBlackjackHandRow");
    var dealerTitle = $.CreatePanel("Label", dealerRow, "");
    dealerTitle.AddClass("ArcadeBlackjackHandTitle");
    dealerTitle.text = "Dealer";
    var dealerCards = $.CreatePanel("Panel", dealerRow, "ArcadeBlackjackDealerCards");
    dealerCards.AddClass("ArcadeBlackjackHandCards");
    var dealerTotal = $.CreatePanel("Label", dealerRow, "ArcadeBlackjackDealerTotal");
    dealerTotal.AddClass("ArcadeBlackjackHandTotal");
    dealerTotal.text = "Total: --";

    var playerRow = $.CreatePanel("Panel", content, "ArcadeBlackjackPlayerRow");
    playerRow.AddClass("ArcadeBlackjackHandRow");
    var playerTitle = $.CreatePanel("Label", playerRow, "");
    playerTitle.AddClass("ArcadeBlackjackHandTitle");
    playerTitle.text = "Player";
    var playerCards = $.CreatePanel("Panel", playerRow, "ArcadeBlackjackPlayerCards");
    playerCards.AddClass("ArcadeBlackjackHandCards");
    var playerTotal = $.CreatePanel("Label", playerRow, "ArcadeBlackjackPlayerTotal");
    playerTotal.AddClass("ArcadeBlackjackHandTotal");
    playerTotal.text = "Total: --";

    var actionRow = $.CreatePanel("Panel", content, "ArcadeBlackjackActionRow");
    actionRow.AddClass("ArcadeBlackjackActionRow");

    var hitBtn = $.CreatePanel("Button", actionRow, "ArcadeBlackjackHitBtn");
    hitBtn.AddClass("ArcadeMinesweeperActionBtn");
    hitBtn.AddClass("ArcadeBlackjackControlBtn");
    var hitLbl = $.CreatePanel("Label", hitBtn, "");
    hitLbl.text = "Hit";

    var standBtn = $.CreatePanel("Button", actionRow, "ArcadeBlackjackStandBtn");
    standBtn.AddClass("ArcadeMinesweeperActionBtn");
    standBtn.AddClass("ArcadeBlackjackControlBtn");
    var standLbl = $.CreatePanel("Label", standBtn, "");
    standLbl.text = "Stand";

    var actionRowSecondary = $.CreatePanel("Panel", content, "ArcadeBlackjackActionRowSecondary");
    actionRowSecondary.AddClass("ArcadeBlackjackActionRow");
    actionRowSecondary.AddClass("ArcadeBlackjackActionRowSecondary");

    var newHandBtn = $.CreatePanel("Button", actionRowSecondary, "ArcadeBlackjackNewHandBtn");
    newHandBtn.AddClass("ArcadeMinesweeperActionBtn");
    newHandBtn.AddClass("ArcadeBlackjackControlBtn");
    newHandBtn.AddClass("ArcadeBlackjackNewHandBtn");
    var newHandLbl = $.CreatePanel("Label", newHandBtn, "");
    newHandLbl.text = "New Hand";

    var statusLabel = $.CreatePanel("Label", modalContainer, "ArcadeBlackjackStatusLabel");
    statusLabel.AddClass("ArcadeBlackjackStatusLabel");
    statusLabel.style.visibility = "collapse";

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        deck: [],
        playerHand: [],
        dealerHand: [],
        handOver: false,
        resultText: "",
        hitBtn: hitBtn,
        standBtn: standBtn,
        dealerRow: dealerRow,
        dealerCardsContainer: dealerCards,
        dealerTotalLabel: dealerTotal,
        playerRow: playerRow,
        playerCardsContainer: playerCards,
        playerTotalLabel: playerTotal,
        resultLabel: statusLabel
    };
    gBlackjackState = state;

    newHandBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        BeginBlackjackHand(state);
    });
    hitBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        HitBlackjack(state);
    });
    standBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        StandBlackjack(state);
    });

    BeginBlackjackHand(state);
}

function IsAnyArcadeModalOpen() {
    var root = $.GetContextPanel();
    if (!root) return false;
    return !!(
        root.FindChildTraverse("ArcadeMinesweeperOverlay") ||
        root.FindChildTraverse("Arcade2048Overlay") ||
        root.FindChildTraverse("ArcadeFlappyOverlay") ||
        root.FindChildTraverse("ArcadeAimTrainerOverlay") ||
        root.FindChildTraverse("ArcadeTrainTrackingOverlay") ||
        root.FindChildTraverse("ArcadeWhackRemOverlay") ||
        root.FindChildTraverse("ArcadeBlackjackOverlay") ||
        root.FindChildTraverse("ArcadeBilliardsOverlay")
    );
}

function CloseAllArcadeModalsIfOpen() {
    CloseMinesweeperModalIfOpen();
    Close2048ModalIfOpen();
    CloseFlappyModalIfOpen();
    CloseAimTrainerModalIfOpen();
    CloseTrainTrackingModalIfOpen();
    CloseWhackRemModalIfOpen();
    CloseBlackjackModalIfOpen();
    CloseBilliardsModalIfOpen();
}

function OpenRandomArcadeModal() {
    if (IsAnyArcadeModalOpen()) return;
    var choice = Math.floor(Math.random() * 6);
    if (choice === 0) OpenMinesweeperModal();
    else if (choice === 1) OpenFlappyModal();
    else if (choice === 2) OpenAimTrainerModal();
    else if (choice === 3) OpenTrainTrackingModal();
    else if (choice === 4) OpenWhackRemModal();
    else OpenBlackjackModal();
}

function BuildEnabledOnDeathArcadePool() {
    var pool = [];
    if (Number(MOD_CONFIG.ON_DEATH_GAME_MINESWEEPER) === 1) pool.push(OpenMinesweeperModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_BLACKJACK) === 1) pool.push(OpenBlackjackModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_FLAPPY_BAT) === 1) pool.push(OpenFlappyModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_GRAVES_TRAINER) === 1) pool.push(OpenAimTrainerModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_ZERGGY_MANIA) === 1) pool.push(OpenTrainTrackingModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_WHACK_A_REM) === 1) pool.push(OpenWhackRemModal);
    return pool;
}

function HasAnyOnDeathArcadeGameEnabled() {
    for (var i = 0; i < ON_DEATH_ARCADE_GAME_KEYS.length; i++) {
        var key = ON_DEATH_ARCADE_GAME_KEYS[i];
        if (Number(MOD_CONFIG[key]) === 1) return true;
    }
    return false;
}

function BuildOnDeathEscapeMenuTargets() {
    var targets = [];
    function pushUnique(panel) {
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        for (var i = 0; i < targets.length; i++) {
            if (targets[i] === panel) return;
        }
        targets.push(panel);
    }

    var cursor = $.GetContextPanel ? $.GetContextPanel() : null;
    var depth = 0;
    while (cursor && depth < 20) {
        pushUnique(cursor);
        cursor = cursor.GetParent ? cursor.GetParent() : null;
        depth++;
    }

    var root = FindRootPanel();
    pushUnique(root);

    var escapeMenu = null;
    if (root && root.FindChildTraverse) {
        try { escapeMenu = root.FindChildTraverse("EscapeMenu"); } catch (e0) { escapeMenu = null; }
        pushUnique(escapeMenu);
        if (escapeMenu && escapeMenu.GetParent) pushUnique(escapeMenu.GetParent());
        var hudPanel = null;
        try { hudPanel = root.FindChildTraverse("Hud"); } catch (e1) { hudPanel = null; }
        pushUnique(hudPanel);
    }

    return targets;
}

function ForceCloseEscapeMenuForOnDeathGames() {
    var targets = BuildOnDeathEscapeMenuTargets();
    for (var i = 0; i < targets.length; i++) {
        var panel = targets[i];
        if (!panel || !panel.IsValid || !panel.IsValid() || !panel.RemoveClass) continue;
        try { panel.RemoveClass("ShowEscapeMenu"); } catch (e0) {}
    }
}

function OpenOnDeathArcadeGameById(gameId) {
    var normalized = String(gameId || "").toLowerCase();
    if (normalized === "minesweeper") {
        OpenMinesweeperModal();
        return true;
    }
    if (normalized === "blackjack") {
        OpenBlackjackModal();
        return true;
    }
    if (normalized === "flappy_bat") {
        OpenFlappyModal();
        return true;
    }
    if (normalized === "graves_trainer") {
        OpenAimTrainerModal();
        return true;
    }
    if (normalized === "zerggy_mania") {
        OpenTrainTrackingModal();
        return true;
    }
    if (normalized === "whack_a_rem") {
        OpenWhackRemModal();
        return true;
    }
    return false;
}

function GetOnDeathArcadeBridgeState() {
    var root = FindRootPanel();
    var out = {
        root: root || null,
        active: false,
        gameId: "",
        token: ""
    };
    if (!root || !root.GetAttributeString) return out;
    try { out.active = (String(root.GetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, "") || "") === "1"); } catch (e0) { out.active = false; }
    try { out.gameId = String(root.GetAttributeString(ON_DEATH_ARCADE_REQUEST_ATTR, "") || ""); } catch (e1) { out.gameId = ""; }
    try { out.token = String(root.GetAttributeString(ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, "") || ""); } catch (e2) { out.token = ""; }
    return out;
}

function StartOnDeathArcadeBridgePoller() {
    gOnDeathArcadeBridgePollToken++;
    gOnDeathArcadeBridgePollRunning = true;
    var token = gOnDeathArcadeBridgePollToken;

    function tick() {
        if (token !== gOnDeathArcadeBridgePollToken) return;

        var bridge = GetOnDeathArcadeBridgeState();
        if (!bridge.active) {
            if (gOnDeathArcadeSessionActive) {
                gOnDeathArcadeSessionActive = false;
                CloseAllArcadeModalsIfOpen();
                ForceCloseEscapeMenuForOnDeathGames();
            }
        } else if (bridge.token && bridge.token !== gOnDeathArcadeLastRequestToken) {
            gOnDeathArcadeLastRequestToken = bridge.token;
            gOnDeathArcadeSessionActive = true;
            if (!IsAnyArcadeModalOpen()) {
                OpenOnDeathArcadeGameById(bridge.gameId);
            }
        }

        $.Schedule(ON_DEATH_GAMES_POLL_SECONDS, tick);
    }

    $.Schedule(ON_DEATH_GAMES_POLL_SECONDS, tick);
}

function EnsureOnDeathArcadeBridgePoller() {
    if (gOnDeathArcadeBridgePollRunning) return;
    StartOnDeathArcadeBridgePoller();
}

function OpenAvailableModal() {
    SetActiveTabAndRefresh("Support");
}

function BuildCommunityPresetEntries() {
    var entries = [];
    entries.push({ label: "Sneed", preset: "Sneed" });
    entries.push({ label: "iKaritzu", preset: "iKaritzu" });
    entries.push({ label: "Scuffed", preset: "Scuffed" });
    entries.push({ label: "Gyzeh", preset: "Gyzeh" });
    entries.push({ label: "Haste", preset: "Haste" });
    entries.push({ label: "billyyy", preset: "billyyy" });
    entries.push({ label: "Zer0", preset: "Zer0" });
    entries.push({ label: "Pops", preset: "Pops" });
    entries.push({ label: "Wouwei", preset: "Wouwei" });
    entries.push({ label: "Nairshark", preset: "Nairshark" });
    entries.push({ label: "Satanael", preset: "Satanael" });
    entries.push({ label: "Kr1stux", preset: "Kr1stux" });
    entries.push({ label: "Wrvth", preset: "Wrvth" });
    entries.push({ label: "Jared", preset: "Jared" });
    entries.push({ label: "Bubsito", preset: "Bubsito" });
    entries.push({ label: "Wirdly", preset: "Wirdly" });
    entries.push({ label: "Gambler", preset: "Gambler" });
    entries.push({ label: "Tuna", preset: "Tuna" });
    entries.push({ label: "Hikyo", preset: "Hikyo" });
    entries.push({ label: "Chjcago", preset: "Chjcago" });
    entries.push({ label: "Starjadian", preset: "Starjadian" });
    entries.push({ label: "Synthronix", preset: "Synthronix" });
    entries.push({ label: "Shark", preset: "Shark" });
    entries.push({ label: "Neonvoid", preset: "Neonvoid" });
    entries.push({ label: "Fenmore", preset: "Fenmore" });
    entries.push({ label: "Deethirty", preset: "Deethirty" });
    entries.push({ label: "Jerboa", preset: "Jerboa" });
    entries.push({ label: "RiChew", preset: "RiChew" });
    for (var i = entries.length; i < 36; i++) {
        entries.push({ label: "Available", available: false });
    }
    return entries;
}

function CreateSeparator(parent) {
    if (gSearchCollectMode && gSearchCollectState) {
        gSearchCollectState.currentSection = null;
        return null;
    }
    var sep = $.CreatePanel("Panel", parent, "");
    sep.AddClass("RowSeparator");
    return sep;
}

function CreateSectionTitle(parent, title) {
    var localizedTitle = LocalizeSettingsText(title || "");
    gCurrentSettingsSectionTitle = String(title || "");
    if (gSearchCollectMode && gSearchCollectState) {
        var section = {
            title: localizedTitle,
            rows: []
        };
        gSearchCollectState.sections.push(section);
        gSearchCollectState.currentSection = section;
        return null;
    }
    var titleRow = $.CreatePanel("Panel", parent, "");
    titleRow.AddClass("SectionTitleRow");
    titleRow.AddClass("SectionTitleStaticRow");
    var titleHead = $.CreatePanel("Panel", titleRow, "");
    titleHead.AddClass("SectionTitleInlineHead");
    var titleLabel = $.CreatePanel("Label", titleHead, "");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("SectionTitleInlineLabel");
    titleLabel.text = localizedTitle;
    BindSectionPerfTooltip(titleRow, title, "", currentTab, "", "", null);
    CreateSectionResetButton(titleRow, function() {
        return CollectResetKeysFromSectionTitleRow(titleRow);
    }, null, titleHead);
    return titleLabel;
}

function CreateSectionInlineIconButton(titleLabel, buttonId, iconSrc, tooltipText) {
    if (!titleLabel || !titleLabel.IsValid || !titleLabel.IsValid()) return null;
    var titleHead = null;
    try { titleHead = titleLabel.GetParent ? titleLabel.GetParent() : null; } catch (e0) { titleHead = null; }
    if (!titleHead || !titleHead.IsValid || !titleHead.IsValid()) return null;
    var button = $.CreatePanel("Button", titleHead, buttonId || "");
    button.AddClass("SectionTitleActionBtn");
    button.AddClass("ConfigSectionIconBtn");
    var icon = $.CreatePanel("Image", button, (buttonId || "") + "_icon", {
        src: iconSrc || "",
        defaultsrc: "",
        scaling: "contain"
    });
    icon.AddClass("SectionTitleActionIcon");
    icon.AddClass("ConfigSectionIconBtnIcon");
    if (tooltipText) {
        var showTooltip = function() {
            HideSettingsTextTooltip();
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(
                button,
                "",
                LocalizeSettingsText(tooltipText, true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        };
        var hideTooltip = function() {
            HideSettingsRowFloatingTooltipDeferred(String(buttonId || "config_section_icon_btn") + "_mouseout");
        };
        button.SetPanelEvent("onmouseover", showTooltip);
        button.SetPanelEvent("onmouseout", hideTooltip);
        icon.SetPanelEvent("onmouseover", showTooltip);
        icon.SetPanelEvent("onmouseout", hideTooltip);
    }
    return button;
}

var SETTINGS_TOOLTIP_THEME_CLASS = "QOLSettingsTooltipThemeActive";
var SETTINGS_TOOLTIP_PERF_CLASS_NONE = "QOLSettingsTooltipPerfNone";
var SETTINGS_TOOLTIP_PERF_CLASS_LOW = "QOLSettingsTooltipPerfLow";
var SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM = "QOLSettingsTooltipPerfMedium";
var SETTINGS_TOOLTIP_PERF_CLASS_HIGH = "QOLSettingsTooltipPerfHigh";
var gSettingsRowFloatingTooltipPanel = null;
var gSettingsRowFloatingTooltipPerfPrefixLabel = null;
var gSettingsRowFloatingTooltipPerfValueLabel = null;
var gSettingsRowFloatingTooltipBodyLabel = null;
var gSettingsRowFloatingTooltipCreatorPrefixLabel = null;
var gSettingsRowFloatingTooltipCreatorValueLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = null;
var gSettingsRowFloatingTooltipAnchor = null;
var gSettingsRowFloatingTooltipLastCursorX = NaN;
var gSettingsRowFloatingTooltipLastCursorY = NaN;
var gSettingsRowFloatingTooltipLastX = NaN;
var gSettingsRowFloatingTooltipLastY = NaN;
var gSettingsRowFloatingTooltipTrackScheduled = false;
var SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC = 0.05;
var SETTINGS_TOOLTIP_POSITION_DEBUG = false;
var SETTINGS_TOOLTIP_POSITION_DEBUG_INTERVAL_MS = 200;
var SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS = 180;
var SETTINGS_TOOLTIP_DEFER_HIDE_SEC = 0.06;
var gSettingsTooltipDebugNextMs = 0;
var gSettingsTooltipLastListScrollY = NaN;
var gSettingsTooltipLastHostScrollY = NaN;
var gSettingsTooltipLastAnchorLocalY = NaN;
var gSettingsTooltipSuppressUntilMs = 0;
var gSettingsTooltipHideToken = 0;
var gSettingsTooltipObservedListScrollY = NaN;
var gSettingsTooltipObservedHostScrollY = NaN;
var gSettingsTooltipLastScrollMoveMs = 0;
var gSettingsTooltipLastSide = "";
var gSettingsTooltipStyleToActualX = 1.0;
var gSettingsTooltipStyleToActualY = 1.0;
var gSettingsTooltipLastWrittenStyleX = NaN;
var gSettingsTooltipLastWrittenStyleY = NaN;
var gSettingsTooltipCalibrationFramesRemaining = 0;

function ReadPanelScrollOffsetY(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return 0;
    var y = 0;
    try {
        var sy0 = Number(panel.scrolloffset_y);
        if (isFinite(sy0)) return sy0;
    } catch (e0) {}
    try {
        var sy1 = Number(panel.scrolloffsetY);
        if (isFinite(sy1)) return sy1;
    } catch (e1) {}
    try {
        var sy2 = Number(panel.ScrollOffsetY);
        if (isFinite(sy2)) return sy2;
    } catch (e2) {}
    try {
        if (typeof panel.GetScrollOffset === "function") {
            var so = panel.GetScrollOffset();
            if (so && so.length >= 2) {
                var sy3 = Number(so[1]);
                if (isFinite(sy3)) return sy3;
            }
        }
    } catch (e3) {}
    return y;
}

function SettingsTooltipDebugLog(msg, force) {
    if (!SETTINGS_TOOLTIP_POSITION_DEBUG) return;
    var now = Date.now ? Date.now() : (new Date()).getTime();
    if (!force && now < (gSettingsTooltipDebugNextMs || 0)) return;
    gSettingsTooltipDebugNextMs = now + SETTINGS_TOOLTIP_POSITION_DEBUG_INTERVAL_MS;
    $.Msg("[QOLLock][TooltipPos] " + String(msg || ""));
}

function GetSettingsTooltipNowMs() {
    return Date.now ? Date.now() : (new Date()).getTime();
}

function SuppressSettingsTooltipForMs(durationMs, reason) {
    var now = GetSettingsTooltipNowMs();
    var ms = Number(durationMs);
    if (!isFinite(ms) || ms < 0) ms = 0;
    gSettingsTooltipSuppressUntilMs = now + ms;
    if (reason) {
        SettingsTooltipDebugLog("suppress ms=" + String(Math.round(ms)) + " reason=" + String(reason), true);
    }
}

function IsSettingsTooltipSuppressed() {
    var until = Number(gSettingsTooltipSuppressUntilMs);
    if (!isFinite(until) || until <= 0) return false;
    return GetSettingsTooltipNowMs() < until;
}

function UpdateSettingsTooltipScrollMotionWatch() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    var listY = Number(snap.listY);
    var hostY = Number(snap.hostY);
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    var moved = false;
    if (isFinite(gSettingsTooltipObservedListScrollY) && Math.abs(listY - gSettingsTooltipObservedListScrollY) >= 1) moved = true;
    if (isFinite(gSettingsTooltipObservedHostScrollY) && Math.abs(hostY - gSettingsTooltipObservedHostScrollY) >= 1) moved = true;
    gSettingsTooltipObservedListScrollY = listY;
    gSettingsTooltipObservedHostScrollY = hostY;
    if (moved) gSettingsTooltipLastScrollMoveMs = GetSettingsTooltipNowMs();
    return moved;
}

function IsSettingsTooltipInRecentScrollMotion() {
    var now = GetSettingsTooltipNowMs();
    var last = Number(gSettingsTooltipLastScrollMoveMs);
    if (!isFinite(last) || last <= 0) return false;
    return (now - last) < SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS;
}

function CancelSettingsRowFloatingTooltipHide() {
    gSettingsTooltipHideToken++;
}

function HideSettingsRowFloatingTooltipDeferred(reason) {
    CancelSettingsRowFloatingTooltipHide();
    var token = gSettingsTooltipHideToken;
    $.Schedule(SETTINGS_TOOLTIP_DEFER_HIDE_SEC, function() {
        if (token !== gSettingsTooltipHideToken) return;
        SettingsTooltipDebugLog("hide_deferred reason=" + String(reason || ""), true);
        HideSettingsRowFloatingTooltip();
    });
}

function IsSettingsRowFloatingTooltipVisible() {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || !panel.IsValid || !panel.IsValid()) return false;
    if (!panel.BHasClass) return false;
    return !!panel.BHasClass("Visible");
}

function TickSettingsRowFloatingTooltipPosition() {
    gSettingsRowFloatingTooltipTrackScheduled = false;
    if (!IsSettingsRowFloatingTooltipVisible()) return;
    var anchor = gSettingsRowFloatingTooltipAnchor;
    if (!anchor || !anchor.IsValid || !anchor.IsValid()) {
        HideSettingsRowFloatingTooltip();
        return;
    }
    PositionSettingsRowFloatingTooltip(anchor);
    gSettingsRowFloatingTooltipTrackScheduled = true;
    $.Schedule(SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC, TickSettingsRowFloatingTooltipPosition);
}

function EnsureSettingsRowFloatingTooltipTracking() {
    if (gSettingsRowFloatingTooltipTrackScheduled) return;
    gSettingsRowFloatingTooltipTrackScheduled = true;
    $.Schedule(SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC, TickSettingsRowFloatingTooltipPosition);
}

function ReadSettingsTooltipScrollSnapshot() {
    var context = $.GetContextPanel();
    if (!context) return { listY: 0, hostY: 0 };
    var settingsList = null;
    try { settingsList = context.FindChildTraverse("SettingsList"); } catch (eList) { settingsList = null; }
    var settingsContentHost = null;
    try { settingsContentHost = context.FindChildTraverse("SettingsContentHost"); } catch (eHost) { settingsContentHost = null; }
    return {
        listY: ReadPanelScrollOffsetY(settingsList),
        hostY: ReadPanelScrollOffsetY(settingsContentHost)
    };
}

function PrimeSettingsTooltipScrollSnapshot() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    gSettingsTooltipLastListScrollY = Number(snap.listY);
    gSettingsTooltipLastHostScrollY = Number(snap.hostY);
    var anchor = gSettingsRowFloatingTooltipAnchor;
    var host = gSettingsRowFloatingTooltipPanel && gSettingsRowFloatingTooltipPanel.GetParent
        ? gSettingsRowFloatingTooltipPanel.GetParent()
        : null;
    gSettingsTooltipLastAnchorLocalY = Number(GetPanelYOffsetWithinAncestor(anchor, host));
}

function DidSettingsTooltipScrollChange() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    var listY = Number(snap.listY);
    var hostY = Number(snap.hostY);
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    var hasBaseline = isFinite(gSettingsTooltipLastListScrollY) && isFinite(gSettingsTooltipLastHostScrollY);
    var changed = false;
    if (hasBaseline) {
        changed =
            Math.abs(listY - gSettingsTooltipLastListScrollY) >= 1 ||
            Math.abs(hostY - gSettingsTooltipLastHostScrollY) >= 1;
    }
    gSettingsTooltipLastListScrollY = listY;
    gSettingsTooltipLastHostScrollY = hostY;
    return changed;
}

function EnsureSettingsRowFloatingTooltipPanel() {
    var context = $.GetContextPanel();
    if (!context) return null;

    var settingsWin = null;
    try { settingsWin = context.FindChildTraverse("SettingsWindow"); } catch (e0) { settingsWin = null; }
    var host = (settingsWin && settingsWin.GetParent) ? settingsWin.GetParent() : context;
    if (!host) host = context;

    if (
        gSettingsRowFloatingTooltipPanel &&
        (!gSettingsRowFloatingTooltipPanel.IsValid || !gSettingsRowFloatingTooltipPanel.IsValid() || gSettingsRowFloatingTooltipPanel.GetParent() !== host)
    ) {
        try { gSettingsRowFloatingTooltipPanel.DeleteAsync(0); } catch (e1) {}
        gSettingsRowFloatingTooltipPanel = null;
        gSettingsRowFloatingTooltipPerfPrefixLabel = null;
        gSettingsRowFloatingTooltipPerfValueLabel = null;
        gSettingsRowFloatingTooltipBodyLabel = null;
        gSettingsRowFloatingTooltipCreatorPrefixLabel = null;
        gSettingsRowFloatingTooltipCreatorValueLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = null;
    }

    if (!gSettingsRowFloatingTooltipPanel) {
        gSettingsRowFloatingTooltipPanel = $.CreatePanel("Panel", host, "QOLSettingsRowFloatingTooltip");
        gSettingsRowFloatingTooltipPanel.AddClass("QOLCustomRowTooltip");
        gSettingsRowFloatingTooltipPanel.hittest = false;
        gSettingsRowFloatingTooltipPanel.hittestchildren = false;

        gSettingsRowFloatingTooltipBodyLabel = $.CreatePanel("Label", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipText");
        gSettingsRowFloatingTooltipBodyLabel.AddClass("QOLCustomRowTooltipText");

        var perfRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipPerfRow");
        perfRow.AddClass("QOLCustomRowTooltipPerfRow");

        gSettingsRowFloatingTooltipPerfPrefixLabel = $.CreatePanel("Label", perfRow, "QOLSettingsRowFloatingTooltipPerfPrefix");
        gSettingsRowFloatingTooltipPerfPrefixLabel.AddClass("QOLCustomRowTooltipPerfPrefix");
        gSettingsRowFloatingTooltipPerfPrefixLabel.text = LocalizeSettingsText("FPS Impact:", true);

        gSettingsRowFloatingTooltipPerfValueLabel = $.CreatePanel("Label", perfRow, "QOLSettingsRowFloatingTooltipPerfValue");
        gSettingsRowFloatingTooltipPerfValueLabel.AddClass("QOLCustomRowTooltipPerfValue");

        var creatorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipCreatorRow");
        creatorRow.AddClass("QOLCustomRowTooltipCreatorRow");

        gSettingsRowFloatingTooltipCreatorPrefixLabel = $.CreatePanel("Label", creatorRow, "QOLSettingsRowFloatingTooltipCreatorPrefix");
        gSettingsRowFloatingTooltipCreatorPrefixLabel.AddClass("QOLCustomRowTooltipCreatorPrefix");
        gSettingsRowFloatingTooltipCreatorPrefixLabel.text = LocalizeSettingsText("Created By:", true);

        gSettingsRowFloatingTooltipCreatorValueLabel = $.CreatePanel("Label", creatorRow, "QOLSettingsRowFloatingTooltipCreatorValue");
        gSettingsRowFloatingTooltipCreatorValueLabel.AddClass("QOLCustomRowTooltipCreatorValue");

        var voiceMetaAuthorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorRow");
        voiceMetaAuthorRow.AddClass("QOLCustomRowTooltipVoiceMetaRow");

        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = $.CreatePanel("Label", voiceMetaAuthorRow, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorPrefix");
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.AddClass("QOLCustomRowTooltipVoiceMetaPrefix");
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.text = LocalizeSettingsText("Author:", true);

        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = $.CreatePanel("Label", voiceMetaAuthorRow, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorValue");
        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel.AddClass("QOLCustomRowTooltipVoiceMetaAuthorValue");

        var voiceMetaActorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipVoiceMetaActorRow");
        voiceMetaActorRow.AddClass("QOLCustomRowTooltipVoiceMetaRow");

        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = $.CreatePanel("Label", voiceMetaActorRow, "QOLSettingsRowFloatingTooltipVoiceMetaActorPrefix");
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.AddClass("QOLCustomRowTooltipVoiceMetaPrefix");
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.text = LocalizeSettingsText("Voice Actor:", true);

        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = $.CreatePanel("Label", voiceMetaActorRow, "QOLSettingsRowFloatingTooltipVoiceMetaActorValue");
        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel.AddClass("QOLCustomRowTooltipVoiceMetaActorValue");
    }
    return gSettingsRowFloatingTooltipPanel;
}

function ApplySettingsRowFloatingTooltipTier(perfTier) {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    var normalizedTier = NormalizePerfImpactTier(perfTier);
    panel.SetHasClass("PerfNone", normalizedTier === PERF_IMPACT_TIER_NONE);
    panel.SetHasClass("PerfLow", normalizedTier === PERF_IMPACT_TIER_LOW);
    panel.SetHasClass("PerfMedium", normalizedTier === PERF_IMPACT_TIER_MEDIUM);
    panel.SetHasClass("PerfHigh", normalizedTier === PERF_IMPACT_TIER_HIGH);
}

function NormalizeSettingsTooltipScaleFactor(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return 1.0;
    if (n < 0.05) return 0.05;
    if (n > 20.0) return 20.0;
    return n;
}

function GetSettingsTooltipHostAxisScale(actualSize, desiredSize) {
    var actual = Number(actualSize);
    if (!isFinite(actual) || actual <= 0) return 1.0;
    var desired = Number(desiredSize);
    if (!isFinite(desired) || desired <= 0) return 1.0;
    return NormalizeSettingsTooltipScaleFactor(actual / desired);
}

function PositionSettingsRowFloatingTooltip(anchorPanel) {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (!anchorPanel || !anchorPanel.IsValid || !anchorPanel.IsValid()) return;

    var host = panel.GetParent ? panel.GetParent() : null;
    if (!host || !host.IsValid || !host.IsValid()) return;

    var anchorX = Number(GetPanelXOffsetWithinAncestor(anchorPanel, host));
    var anchorY = Number(GetPanelYOffsetWithinAncestor(anchorPanel, host));
    var anchorWidth = Number(anchorPanel.actuallayoutwidth);
    var anchorHeight = Number(anchorPanel.actuallayoutheight);
    var panelWidth = Number(panel.actuallayoutwidth);
    var panelHeight = Number(panel.actuallayoutheight);
    var hostWidth = Number(host.actuallayoutwidth);
    var hostHeight = Number(host.actuallayoutheight);
    var hostDesiredWidth = Number(host.desiredlayoutwidth);
    var hostDesiredHeight = Number(host.desiredlayoutheight);

    if (!isFinite(anchorX) || !isFinite(anchorY) || !isFinite(anchorWidth) || !isFinite(anchorHeight) ||
        !isFinite(panelWidth) || panelWidth <= 0 || !isFinite(panelHeight) || panelHeight <= 0 ||
        !isFinite(hostWidth) || hostWidth <= 0 || !isFinite(hostHeight) || hostHeight <= 0) {
        $.Schedule(0.0, function() {
            if (!gSettingsRowFloatingTooltipAnchor || gSettingsRowFloatingTooltipAnchor !== anchorPanel) return;
            PositionSettingsRowFloatingTooltip(anchorPanel);
        });
        return;
    }

    var edgeMargin = 8;
    var gap = 4;
    var attachNudgeLeft = 12;
    var xMin = edgeMargin;
    var xMax = Math.max(xMin, Math.round(hostWidth - panelWidth - edgeMargin));
    var xRight = Math.round(anchorX + anchorWidth + gap - attachNudgeLeft);
    var xLeft = Math.round(anchorX - panelWidth - gap);

    var side = "right";
    var x = xRight;
    if (xRight + panelWidth > hostWidth - edgeMargin && xLeft >= xMin) {
        side = "left";
        x = xLeft;
    }
    x = Math.max(xMin, Math.min(xMax, x));

    var yMin = edgeMargin;
    var yMax = Math.max(yMin, Math.round(hostHeight - panelHeight - edgeMargin));
    var y = Math.round(anchorY + (anchorHeight * 0.5) - (panelHeight * 0.5));
    y = Math.max(yMin, Math.min(yMax, y));

    // Stabilize tooltip placement: if target anchor position is unchanged, skip
    // re-writing style values to avoid visible oscillation on some rows.
    if (
        isFinite(gSettingsRowFloatingTooltipLastX) &&
        isFinite(gSettingsRowFloatingTooltipLastY) &&
        gSettingsTooltipLastSide === side &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastX) - Number(x)) < 0.5 &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastY) - Number(y)) < 0.5
    ) {
        return;
    }

    var hostScaleX = GetSettingsTooltipHostAxisScale(hostWidth, hostDesiredWidth);
    var hostScaleY = GetSettingsTooltipHostAxisScale(hostHeight, hostDesiredHeight);
    var styleToActualX = NormalizeSettingsTooltipScaleFactor(gSettingsTooltipStyleToActualX);
    var styleToActualY = NormalizeSettingsTooltipScaleFactor(gSettingsTooltipStyleToActualY);

    var styleX = Number(x) / (hostScaleX * styleToActualX);
    var styleY = Number(y) / (hostScaleY * styleToActualY);
    if (!isFinite(styleX) || !isFinite(styleY)) {
        styleX = Number(x);
        styleY = Number(y);
    }

    panel.style.x = String(Math.round(styleX)) + "px";
    panel.style.y = String(Math.round(styleY)) + "px";
    gSettingsTooltipLastWrittenStyleX = styleX;
    gSettingsTooltipLastWrittenStyleY = styleY;

    if ((Number(gSettingsTooltipCalibrationFramesRemaining) || 0) > 0) {
        var appliedActualX = Number(GetPanelXOffsetWithinAncestor(panel, host));
        var appliedActualY = Number(GetPanelYOffsetWithinAncestor(panel, host));
        if (isFinite(appliedActualX) && Math.abs(styleX) >= 8) {
            var measuredX = appliedActualX / (styleX * hostScaleX);
            if (isFinite(measuredX) && measuredX > 0.05 && measuredX < 20.0) {
                gSettingsTooltipStyleToActualX = (gSettingsTooltipStyleToActualX * 0.7) + (measuredX * 0.3);
            }
        }
        if (isFinite(appliedActualY) && Math.abs(styleY) >= 8) {
            var measuredY = appliedActualY / (styleY * hostScaleY);
            if (isFinite(measuredY) && measuredY > 0.05 && measuredY < 20.0) {
                gSettingsTooltipStyleToActualY = (gSettingsTooltipStyleToActualY * 0.7) + (measuredY * 0.3);
            }
        }
        gSettingsTooltipCalibrationFramesRemaining = Math.max(0, (Number(gSettingsTooltipCalibrationFramesRemaining) || 0) - 1);
    }
    gSettingsRowFloatingTooltipLastX = x;
    gSettingsRowFloatingTooltipLastY = y;
    gSettingsTooltipLastSide = side;

    var anchorId = "";
    try { anchorId = String(anchorPanel.id || ""); } catch (eAid) { anchorId = ""; }
    SettingsTooltipDebugLog(
        "pos_simple anchor=" + (anchorId || "-") +
        " side=" + side +
        " x=" + String(Math.round(x)) +
        " y=" + String(Math.round(y)) +
        " style=" + String(Math.round(styleX)) + "," + String(Math.round(styleY)) +
        " host=" + String(Math.round(hostWidth)) + "x" + String(Math.round(hostHeight)) +
        " hScale=" + hostScaleX.toFixed(3) + "," + hostScaleY.toFixed(3) +
        " s2a=" + gSettingsTooltipStyleToActualX.toFixed(3) + "," + gSettingsTooltipStyleToActualY.toFixed(3)
    );
}

function TryGetCursorScreenPosition() {
    var cursor = null;
    try {
        if (typeof GameUI !== "undefined" && GameUI && typeof GameUI.GetCursorPosition === "function") {
            cursor = GameUI.GetCursorPosition();
        }
    } catch (eCursor0) {
        cursor = null;
    }
    if (!cursor || cursor.length < 2) return null;
    var x = Number(cursor[0]);
    var y = Number(cursor[1]);
    if (!isFinite(x) || !isFinite(y)) return null;
    return { x: x, y: y };
}

function ShowSettingsRowFloatingTooltip(anchorPanel, perfText, bodyText, perfTier, createdBy, options) {
    if (!anchorPanel || !anchorPanel.IsValid || !anchorPanel.IsValid()) return;
    if (!HasMeaningfulFloatingTooltipContent(perfTier, bodyText, createdBy, options)) {
        HideSettingsRowFloatingTooltip();
        return;
    }
    CancelSettingsRowFloatingTooltipHide();
    var bodyLine = LocalizeSettingsText(String(bodyText || ""), true);
    var createdByName = String(createdBy || "").trim();
    var tierKey = NormalizePerfImpactTier(perfTier);
    var voiceMetaInfo = options && options.voiceMeta ? options.voiceMeta : null;
    var voiceMetaAuthor = String(voiceMetaInfo && voiceMetaInfo.author ? voiceMetaInfo.author : "").trim();
    var voiceMetaActor = String(voiceMetaInfo && voiceMetaInfo.voiceActor ? voiceMetaInfo.voiceActor : "").trim();
    var useVoiceMetaMode = (voiceMetaAuthor.length > 0 || voiceMetaActor.length > 0);

    var panel = EnsureSettingsRowFloatingTooltipPanel();
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (
        !gSettingsRowFloatingTooltipPerfPrefixLabel ||
        !gSettingsRowFloatingTooltipPerfValueLabel ||
        !gSettingsRowFloatingTooltipBodyLabel ||
        !gSettingsRowFloatingTooltipCreatorPrefixLabel ||
        !gSettingsRowFloatingTooltipCreatorValueLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaActorValueLabel
    ) return;

    var previousAnchor = gSettingsRowFloatingTooltipAnchor;
    gSettingsRowFloatingTooltipAnchor = anchorPanel;
    gSettingsTooltipCalibrationFramesRemaining = 2;
    gSettingsRowFloatingTooltipPerfPrefixLabel.text = LocalizeSettingsText("FPS Impact:", true);
    gSettingsRowFloatingTooltipPerfValueLabel.text = GetPerfImpactDisplayLabel(tierKey);
    gSettingsRowFloatingTooltipBodyLabel.text = bodyLine;
    gSettingsRowFloatingTooltipCreatorPrefixLabel.text = LocalizeSettingsText("Created By:", true);
    gSettingsRowFloatingTooltipCreatorValueLabel.text = createdByName;
    gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.text = LocalizeSettingsText("Author:", true);
    gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel.text = voiceMetaAuthor;
    gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.text = LocalizeSettingsText("Voice Actor:", true);
    gSettingsRowFloatingTooltipVoiceMetaActorValueLabel.text = voiceMetaActor;
    panel.SetHasClass("NoBody", bodyLine.length <= 0);
    panel.SetHasClass("NoPerf", tierKey === PERF_IMPACT_TIER_NONE);
    panel.SetHasClass("NoCreator", (createdByName.length <= 0) || useVoiceMetaMode);
    panel.SetHasClass("VoiceMetaMode", useVoiceMetaMode);
    panel.SetHasClass("NoVoiceMeta", !useVoiceMetaMode);
    panel.SetHasClass("NoVoiceMetaAuthor", voiceMetaAuthor.length <= 0);
    panel.SetHasClass("NoVoiceMetaActor", voiceMetaActor.length <= 0);
    ApplySettingsRowFloatingTooltipTier(tierKey);

    var wasVisible = !!(panel.BHasClass && panel.BHasClass("Visible"));
    var cursorNow = TryGetCursorScreenPosition();

    panel.SetHasClass("Visible", true);
    PositionSettingsRowFloatingTooltip(anchorPanel);
    $.Schedule(0.0, function() {
        if (!gSettingsRowFloatingTooltipAnchor || gSettingsRowFloatingTooltipAnchor !== anchorPanel) return;
        PositionSettingsRowFloatingTooltip(anchorPanel);
    });
    if (cursorNow) {
        gSettingsRowFloatingTooltipLastCursorX = cursorNow.x;
        gSettingsRowFloatingTooltipLastCursorY = cursorNow.y;
    }
    var anchorId = "";
    try { anchorId = String(anchorPanel.id || ""); } catch (eAid) { anchorId = ""; }
    var sameAnchorAsLast = !!(previousAnchor && previousAnchor === anchorPanel);
    SettingsTooltipDebugLog(
        "show anchor=" + (anchorId || "-") +
        " sameAnchor=" + (sameAnchorAsLast ? "1" : "0") +
        " wasVisible=" + (wasVisible ? "1" : "0") +
        " sameCursor=" + ((cursorNow && isFinite(gSettingsRowFloatingTooltipLastCursorX) && isFinite(gSettingsRowFloatingTooltipLastCursorY)) ? "1" : "0"),
        true
    );
    PrimeSettingsTooltipScrollSnapshot();
    EnsureSettingsRowFloatingTooltipTracking();
}

function HideSettingsRowFloatingTooltip() {
    CancelSettingsRowFloatingTooltipHide();
    gSettingsRowFloatingTooltipAnchor = null;
    if (!gSettingsRowFloatingTooltipPanel || !gSettingsRowFloatingTooltipPanel.IsValid || !gSettingsRowFloatingTooltipPanel.IsValid()) return;
    gSettingsRowFloatingTooltipPanel.SetHasClass("Visible", false);
    gSettingsRowFloatingTooltipTrackScheduled = false;
    gSettingsTooltipLastListScrollY = NaN;
    gSettingsTooltipLastHostScrollY = NaN;
    gSettingsTooltipLastAnchorLocalY = NaN;
    SettingsTooltipDebugLog("hide", true);
}

function SetSettingsTooltipThemeActive(isActive) {
    var root = FindRootPanel();
    if (root && root.SetHasClass) {
        root.SetHasClass(SETTINGS_TOOLTIP_THEME_CLASS, !!isActive);
        var tooltipManager = null;
        try { tooltipManager = root.FindChildTraverse ? root.FindChildTraverse("TooltipManager") : null; } catch (e0) { tooltipManager = null; }
        if (tooltipManager && tooltipManager.SetHasClass) {
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_THEME_CLASS, !!isActive);
        }
    }
}

function SetSettingsTooltipPerfTierClass(perfTier) {
    var tier = NormalizePerfImpactTier(perfTier);
    var isNone = tier === PERF_IMPACT_TIER_NONE;
    var isLow = tier === PERF_IMPACT_TIER_LOW;
    var isMedium = tier === PERF_IMPACT_TIER_MEDIUM;
    var isHigh = tier === PERF_IMPACT_TIER_HIGH;
    var root = FindRootPanel();
    if (root && root.SetHasClass) {
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_NONE, isNone);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_LOW, isLow);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM, isMedium);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_HIGH, isHigh);
    }
    if (root && root.FindChildTraverse) {
        var tooltipManager = null;
        try { tooltipManager = root.FindChildTraverse("TooltipManager"); } catch (e0) { tooltipManager = null; }
        if (tooltipManager && tooltipManager.SetHasClass) {
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_NONE, isNone);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_LOW, isLow);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM, isMedium);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_HIGH, isHigh);
        }
    }
}

function ShowSettingsTextTooltip(anchorPanel, text, perfTier) {
    if (!anchorPanel || !text) return;
    SetSettingsTooltipPerfTierClass(perfTier || PERF_IMPACT_TIER_NONE);
    $.DispatchEvent("UIShowTextTooltip", anchorPanel, text);
}

function HideSettingsTextTooltip() {
    SetSettingsTooltipPerfTierClass(PERF_IMPACT_TIER_NONE);
    $.DispatchEvent("UIHideTextTooltip");
}

function HasMeaningfulFloatingTooltipContent(perfTier, bodyText, createdBy, options) {
    var tierKey = NormalizePerfImpactTier(perfTier);
    var hasPerf = tierKey !== PERF_IMPACT_TIER_NONE;
    var hasBody = String(bodyText || "").trim().length > 0;
    var hasCreator = String(createdBy || "").trim().length > 0;
    var voiceMeta = options && options.voiceMeta ? options.voiceMeta : null;
    var hasVoiceMeta =
        String(voiceMeta && voiceMeta.author ? voiceMeta.author : "").trim().length > 0 ||
        String(voiceMeta && voiceMeta.voiceActor ? voiceMeta.voiceActor : "").trim().length > 0;
    return hasPerf || hasBody || hasCreator || hasVoiceMeta;
}

function NormalizePerfImpactTier(value) {
    var key = String(value || "").toLowerCase();
    if (PERF_IMPACT_TIER_ORDER.hasOwnProperty(key)) return key;
    return PERF_IMPACT_TIER_NONE;
}

function MaxPerfImpactTier(a, b) {
    var aa = NormalizePerfImpactTier(a);
    var bb = NormalizePerfImpactTier(b);
    return (PERF_IMPACT_TIER_ORDER[bb] > PERF_IMPACT_TIER_ORDER[aa]) ? bb : aa;
}

function GetEstimatedPerfImpactTier(configId, type, options) {
    var tier = PERF_IMPACT_TIER_NONE;
    var key = String(configId || "");
    if (key && SETTING_PERF_IMPACT_TIERS.hasOwnProperty(key)) {
        tier = MaxPerfImpactTier(tier, SETTING_PERF_IMPACT_TIERS[key]);
    }
    if (Array.isArray(options)) {
        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            if (!opt || !opt.key) continue;
            var optKey = String(opt.key || "");
            if (!optKey || !SETTING_PERF_IMPACT_TIERS.hasOwnProperty(optKey)) continue;
            tier = MaxPerfImpactTier(tier, SETTING_PERF_IMPACT_TIERS[optKey]);
        }
    }
    if (type === "runtime_slider" || type === "runtime_buttongroup") {
        tier = MaxPerfImpactTier(tier, PERF_IMPACT_TIER_NONE);
    }
    return tier;
}

function GetPerfImpactWeightForTier(tier) {
    var normalized = NormalizePerfImpactTier(tier);
    if (!PERF_IMPACT_TIER_ORDER.hasOwnProperty(normalized)) return 0;
    return Number(PERF_IMPACT_TIER_ORDER[normalized]) || 0;
}

function IsPerfImpactConfigKeyEnabled(configKey) {
    var key = String(configKey || "");
    if (!key || !MOD_CONFIG || !MOD_CONFIG.hasOwnProperty(key)) return false;
    var value = MOD_CONFIG[key];
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value === true;
    if (typeof value === "number") return Number(value) > 0;
    if (typeof value === "string") {
        var normalized = String(value).trim().toLowerCase();
        if (!normalized) return false;
        if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "none") return false;
        return true;
    }
    return !!value;
}

function GetSummedPerfImpactTierForConfigKeys(configKeys) {
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return PERF_IMPACT_TIER_NONE;
    var totalWeight = 0;
    var maxTier = PERF_IMPACT_TIER_NONE;
    var seen = {};
    for (var i = 0; i < configKeys.length; i++) {
        var key = String(configKeys[i] || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        if (!SETTING_PERF_IMPACT_TIERS.hasOwnProperty(key)) continue;
        if (!IsPerfImpactConfigKeyEnabled(key)) continue;
        var tier = NormalizePerfImpactTier(SETTING_PERF_IMPACT_TIERS[key]);
        totalWeight += GetPerfImpactWeightForTier(tier);
        maxTier = MaxPerfImpactTier(maxTier, tier);
    }

    if (totalWeight <= 0) return PERF_IMPACT_TIER_NONE;

    var sumTier = PERF_IMPACT_TIER_LOW;
    if (totalWeight >= 4) sumTier = PERF_IMPACT_TIER_HIGH;
    else if (totalWeight >= 2) sumTier = PERF_IMPACT_TIER_MEDIUM;

    return MaxPerfImpactTier(maxTier, sumTier);
}

function BuildPerfImpactLineForTier(tier) {
    var normalizedTier = NormalizePerfImpactTier(tier);
    return "FPS Impact: " + GetPerfImpactDisplayLabel(normalizedTier);
}

function GetPerfImpactDisplayLabel(tier) {
    var normalizedTier = NormalizePerfImpactTier(tier);
    var raw = PERF_IMPACT_LABEL_BY_TIER.hasOwnProperty(normalizedTier)
        ? PERF_IMPACT_LABEL_BY_TIER[normalizedTier]
        : PERF_IMPACT_LABEL_BY_TIER[PERF_IMPACT_TIER_NONE];
    return LocalizeSettingsText(raw, true);
}

function GetSettingCreatedBy(configId, label) {
    var key = String(configId || "");
    if (key && SETTING_CREATED_BY_BY_CONFIG.hasOwnProperty(key)) {
        return String(SETTING_CREATED_BY_BY_CONFIG[key] || "");
    }
    var labelKey = String(label || "");
    if (labelKey && SETTING_CREATED_BY_BY_LABEL.hasOwnProperty(labelKey)) {
        return String(SETTING_CREATED_BY_BY_LABEL[labelKey] || "");
    }
    return "";
}

function GetSectionCreatedBy(title) {
    var key = String(title || "");
    if (!key) return "";
    if (!SECTION_CREATED_BY_BY_TITLE.hasOwnProperty(key)) return "";
    return String(SECTION_CREATED_BY_BY_TITLE[key] || "");
}

function GetCurrentSettingsCategoryKey() {
    var tabName = String(currentTab || "");
    if (!tabName) return "";
    var sectionName = String(gCurrentSettingsSectionTitle || "");
    if (sectionName) return tabName + " / " + sectionName;
    return tabName;
}

function GetSectionDescriptionOverride(tabName, title, fallbackDescription) {
    var tabKey = String(tabName || "");
    var titleKey = String(title || "");
    if (tabKey && titleKey) {
        var key = tabKey + "|" + titleKey;
        if (SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE.hasOwnProperty(key)) {
            return String(SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE[key] || "");
        }
    }
    return String(fallbackDescription || "");
}

function GetCreatedByFromConfigKeys(configKeys) {
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return "";
    var seen = {};
    var names = [];
    for (var i = 0; i < configKeys.length; i++) {
        var key = String(configKeys[i] || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        if (!SETTING_CREATED_BY_BY_CONFIG.hasOwnProperty(key)) continue;
        var name = String(SETTING_CREATED_BY_BY_CONFIG[key] || "").trim();
        if (!name) continue;
        if (names.indexOf(name) === -1) names.push(name);
    }
    return names.join(", ");
}

function GetSettingDescriptionOverride(configId, label, fallbackDescription, categoryKey) {
    var catKey = String(categoryKey || "");
    var labelKey = String(label || "");
    var key = String(configId || "");
    var rowOverride = "";

    if (catKey && labelKey) {
        var rowKey = catKey + "|" + labelKey;
        if (SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW.hasOwnProperty(rowKey)) {
            rowOverride = String(SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW[rowKey] || "");
        }
    }

    if (key === "VOICE_TYPE") {
        var baseVoiceDesc = rowOverride;
        if (!baseVoiceDesc && SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG.hasOwnProperty(key)) {
            baseVoiceDesc = String(SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG[key] || "");
        }
        if (!baseVoiceDesc) baseVoiceDesc = String(fallbackDescription || "");
        return BuildCustomAnnouncerVoiceDescription(baseVoiceDesc, MOD_CONFIG && MOD_CONFIG.VOICE_TYPE);
    }

    if (rowOverride) return rowOverride;

    if (labelKey === "Size") return "Scales the element.";
    if (labelKey === "Opacity") return "Changes the element's transparency.";
    if (labelKey === "Horizontal Offset") return "Moves the element horizontally.";
    if (labelKey === "Vertical Offset") return "Moves the element vertically.";
    if (key && SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG.hasOwnProperty(key)) {
        return String(SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG[key] || "");
    }
    return String(fallbackDescription || "");
}

function BuildPerfImpactTooltipLine(configId, type, options) {
    var tier = GetEstimatedPerfImpactTier(configId, type, options);
    return {
        tier: tier,
        line: BuildPerfImpactLineForTier(tier)
    };
}

function BuildSectionPerfImpactTooltipLineFromTitleRow(titleRow, enableConfigId, enableType, enableOptions) {
    var tier = PERF_IMPACT_TIER_NONE;
    var key = String(enableConfigId || "");
    if (key) {
        tier = GetEstimatedPerfImpactTier(key, enableType || "toggle", enableOptions || null);
    }
    return {
        tier: tier,
        line: BuildPerfImpactLineForTier(tier)
    };
}

function BindSectionPerfTooltip(titleRow, titleName, fallbackDescription, tabName, enableConfigId, enableType, enableOptions) {
    if (!titleRow || !titleRow.SetPanelEvent) return;
    var sectionCreatedBy = GetSectionCreatedBy(titleName);
    var sectionDescription = GetSectionDescriptionOverride(tabName, titleName, fallbackDescription || "");
    titleRow.SetPanelEvent("onmouseover", function() {
        CancelSettingsRowFloatingTooltipHide();
        var info = BuildSectionPerfImpactTooltipLineFromTitleRow(titleRow, enableConfigId, enableType, enableOptions);
        var createdBy = sectionCreatedBy;
        var localizedDescription = LocalizeSettingsText(sectionDescription || "");
        var sectionTier = (info && info.tier) ? info.tier : PERF_IMPACT_TIER_NONE;
        if (!HasMeaningfulFloatingTooltipContent(sectionTier, localizedDescription || "", createdBy)) {
            HideSettingsRowFloatingTooltip();
            return;
        }
        ShowSettingsRowFloatingTooltip(
            titleRow,
            "",
            localizedDescription || "",
            sectionTier,
            createdBy
        );
    });
    titleRow.SetPanelEvent("onmouseout", function() {
        HideSettingsRowFloatingTooltipDeferred("section_mouseout");
    });
}

function CreateAnimatedInlineToggleSection(parent, title, enableConfigId, enableDescription, buildRowsFn, enableToggleOptions) {
    var localizedTitle = LocalizeSettingsText(title || "");
    gCurrentSettingsSectionTitle = String(title || "");
    var invertEnableToggle = !!(enableToggleOptions && enableToggleOptions.invert === true);
    var getSectionEnabled = function() {
        return invertEnableToggle ? (MOD_CONFIG[enableConfigId] !== 1) : (MOD_CONFIG[enableConfigId] === 1);
    };
    if (gSearchCollectMode && gSearchCollectState) {
        CreateSectionTitle(parent, title);
        var searchToggleOptions = invertEnableToggle ? [{ invert: true }] : null;
        CreateRow(parent, "Enable", enableConfigId, "toggle", null, null, null, searchToggleOptions, enableDescription || "");
        if (buildRowsFn) {
            buildRowsFn(parent);
        }
        return null;
    }

    var safeTitleId = String(title || "Section").replace(/[^A-Za-z0-9]/g, "");
    var titleRow = $.CreatePanel("Panel", parent, safeTitleId + "SectionTitleRow");
    titleRow.AddClass("SectionTitleRow");

    var titleHead = $.CreatePanel("Panel", titleRow, safeTitleId + "SectionTitleHead");
    titleHead.AddClass("SectionTitleInlineHead");

    var titleLabel = $.CreatePanel("Label", titleHead, safeTitleId + "SectionTitle");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("SectionTitleInlineLabel");
    titleLabel.text = localizedTitle;
    BindSectionPerfTooltip(titleRow, title, enableDescription || "", currentTab, enableConfigId, "toggle", enableToggleOptions || null);

    var body = $.CreatePanel("Panel", parent, safeTitleId + "SectionBody");
    body.AddClass("SettingsSectionBody");

    CreateSectionResetButton(titleRow, function() {
        var keys = [];
        var seen = {};
        CollectResetKeysFromPanel(body, keys, seen);
        return keys;
    }, null, titleHead);

    var toggleBtn = $.CreatePanel("Panel", titleRow, safeTitleId + "SectionToggle");
    toggleBtn.AddClass("SectionInlineToggleBtn");
    var toggleSwitchButton = $.CreatePanel("Button", toggleBtn, safeTitleId + "SectionToggleButton");
    toggleSwitchButton.AddClass("SwitchButton");
    var toggleHandle = $.CreatePanel("Panel", toggleSwitchButton, "handle");
    toggleHandle.AddClass("SectionInlineToggleHandle");

    var animToken = 0;
    var applyBodyState = function(enabled, animate) {
        animToken++;
        var token = animToken;
        toggleBtn.SetHasClass("Active", enabled);
        toggleBtn.SetHasClass("ToggleOn", enabled);
        toggleBtn.SetHasClass("ToggleOff", !enabled);

        if (!animate) {
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("Collapsed", !enabled);
            body.hittest = enabled;
            body.hittestchildren = enabled;
            return;
        }

        if (enabled) {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("ShowPrep", true);
            body.hittest = true;
            body.hittestchildren = true;
            $.Schedule(0.01, function() {
                if (!body || !body.IsValid || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("ShowPrep", false);
            });
        } else {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", true);
            body.hittest = false;
            body.hittestchildren = false;
            $.Schedule(0.17, function() {
                if (!body || !body.IsValid || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("Hiding", false);
                body.SetHasClass("Collapsed", true);
            });
        }
    };
    applyBodyState(getSectionEnabled(), false);

    toggleSwitchButton.SetPanelEvent("onactivate", function() {
        $.DispatchEvent("UIHideTextTooltip");
        var nextEnabled = !getSectionEnabled();
        MOD_CONFIG[enableConfigId] = invertEnableToggle ? (nextEnabled ? 0 : 1) : (nextEnabled ? 1 : 0);
        applyBodyState(nextEnabled, true);
        SaveAndSync();
    });

    if (buildRowsFn) {
        buildRowsFn(body);
    }
    return body;
}

function GetAnnouncerVoiceToken(rawVoiceType) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.GetAnnouncerVoiceToken === "function") {
        return utils.GetAnnouncerVoiceToken(rawVoiceType);
    }
    var normalized = NormalizeVoiceTypeValue(rawVoiceType);
    switch (normalized) {
        case 4: return "Beep";
        case 5: return "Custom_Slot2";
        case 6: return "Custom_Slot3";
        case 7: return "Custom_Slot4";
        case 8: return "Custom_Slot5";
        case 0:
        default:
            break;
    }
    return "Custom_Slot1";
}

function BuildAnnouncerPreviewEventName() {
    var voiceToken = GetAnnouncerVoiceToken(MOD_CONFIG.VOICE_TYPE);
    if (voiceToken === "Beep") return "BuffReminder.Beep";
    return "BuffReminder.Bridge1_" + voiceToken;
}

function BuildAnnouncerBridgeVariantPreviewEventName(variantIndex) {
    var voiceToken = GetAnnouncerVoiceToken(MOD_CONFIG.VOICE_TYPE);
    var variant = Math.round(Number(variantIndex) || 1);
    if (!isFinite(variant) || variant < 1 || variant > 3) variant = 1;
    if (voiceToken === "Beep") return "BuffReminder.Beep";
    return "BuffReminder.Bridge" + String(variant) + "_" + voiceToken;
}

function ResolveAnnouncerEventForVolume(baseEventName) {
    var baseName = String(baseEventName || "");
    if (!baseName) return "";
    var voiceVolume = NormalizeVoiceVolumeValue(MOD_CONFIG.VOICE_VOLUME);
    return baseName + "_V" + String(voiceVolume);
}

function PlayAnnouncerPreviewSound() {
    var eventName = ResolveAnnouncerEventForVolume(BuildAnnouncerPreviewEventName());
    $.DispatchEvent("PlaySoundEffect", eventName);
}

function PlayAnnouncerBridgeVariantPreviewSound(variantIndex) {
    var eventName = ResolveAnnouncerEventForVolume(BuildAnnouncerBridgeVariantPreviewEventName(variantIndex));
    $.DispatchEvent("PlaySoundEffect", eventName);
}

function RunConsoleCommand(commandText) {
    if (!commandText || commandText.length === 0) return false;
    try {
        if (typeof GameInterfaceAPI !== "undefined" && GameInterfaceAPI && GameInterfaceAPI.ConsoleCommand) {
            GameInterfaceAPI.ConsoleCommand(commandText);
            return true;
        }
    } catch (e0) {}
    try {
        $.DispatchEvent("ConsoleCommand", commandText);
        return true;
    } catch (e1) {}
    try {
        $.DispatchEvent("GameUIRunCommand", commandText);
        return true;
    } catch (e2) {}
    return false;
}

function RunConsoleCommandBestEffort(commandText) {
    var cmd = String(commandText || "").trim();
    if (!cmd) return false;
    var didAny = false;

    // Match hero testing behavior first: fire CitadelConCommand directly.
    try {
        $.DispatchEvent("CitadelConCommand", cmd);
        didAny = true;
    } catch (e0) {}

    if (RunConsoleCommand(cmd)) {
        didAny = true;
    }
    return didAny;
}

function DispatchCitadelConCommand(commandText) {
    if (!commandText || commandText.length === 0) return false;
    try {
        $.DispatchEvent("CitadelConCommand", String(commandText));
        return true;
    } catch (e0) {}
    return false;
}

function GetRuntimeButtonGroupDefaultIndex(runtimeGroupKey, explicitDefaultIndex) {
    var hasExplicitDefault = (explicitDefaultIndex !== undefined && explicitDefaultIndex !== null && String(explicitDefaultIndex) !== "");
    var nextDefault = Number(explicitDefaultIndex);
    if (hasExplicitDefault && isFinite(nextDefault)) {
        nextDefault = Math.max(0, Math.round(nextDefault));
        return nextDefault;
    }
    var key = String(runtimeGroupKey || "");
    if (RUNTIME_BUTTON_GROUP_DEFAULT_INDEX.hasOwnProperty(key)) {
        return Math.max(0, Math.round(Number(RUNTIME_BUTTON_GROUP_DEFAULT_INDEX[key]) || 0));
    }
    return 0;
}

function ApplyRuntimeButtonGroupIndex(runtimeGroupKey, nextIndex, runCommand) {
    var key = String(runtimeGroupKey || "");
    if (!key) return false;
    var meta = gRuntimeButtonGroupConfig[key];
    if (!meta || !Array.isArray(meta.options) || meta.options.length <= 0) return false;

    var clamped = Math.round(Number(nextIndex));
    if (!isFinite(clamped)) clamped = 0;
    if (clamped < 0) clamped = 0;
    if (clamped >= meta.options.length) clamped = meta.options.length - 1;

    var previous = Math.round(Number(gRuntimeToggleState[key]));
    if (!isFinite(previous)) previous = -1;
    var changed = previous !== clamped;
    gRuntimeToggleState[key] = clamped;

    var refreshFn = gRuntimeButtonGroupRefreshers[key];
    if (typeof refreshFn === "function") {
        try { refreshFn(); } catch (e0) {}
    }

    var shouldRunAction = !!runCommand && (changed || !!meta.alwaysRunAction);
    if (shouldRunAction) {
        var opt = meta.options[clamped] || null;
        var commandToRun = opt && opt.command ? String(opt.command) : "";
        if (commandToRun) {
            RunConsoleCommandBestEffort(commandToRun);
        }
        var soundEventToPlay = opt && opt.soundEvent ? String(opt.soundEvent) : "";
        if (soundEventToPlay) {
            if (soundEventToPlay.indexOf("BuffReminder.") === 0) {
                soundEventToPlay = ResolveAnnouncerEventForVolume(soundEventToPlay);
            }
            try { $.DispatchEvent("PlaySoundEffect", soundEventToPlay); } catch (e0) {}
        }
    }
    return changed;
}

function ResetRuntimeButtonGroupToDefault(runtimeGroupKey, runCommand) {
    var key = String(runtimeGroupKey || "");
    var meta = gRuntimeButtonGroupConfig[key];
    if (!meta || !Array.isArray(meta.options) || meta.options.length <= 0) return false;
    var defaultIndex = GetRuntimeButtonGroupDefaultIndex(key, meta.defaultIndex);
    if (defaultIndex >= meta.options.length) defaultIndex = 0;
    return ApplyRuntimeButtonGroupIndex(key, defaultIndex, runCommand);
}

function ResetRuntimeRowsInSectionFromTitleRow(titleRow) {
    var changed = 0;
    if (!titleRow || !titleRow.GetParent) return changed;
    var parent = titleRow.GetParent();
    if (!parent || !parent.Children) return changed;

    var siblings = [];
    try { siblings = parent.Children() || []; } catch (e0) { siblings = []; }
    var startIndex = -1;
    for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] === titleRow) {
            startIndex = i;
            break;
        }
    }
    if (startIndex < 0) return changed;

    for (var s = startIndex + 1; s < siblings.length; s++) {
        var sibling = siblings[s];
        if (!sibling || !sibling.IsValid || !sibling.IsValid()) continue;
        var isBoundary = false;
        try {
            if ((sibling.BHasClass && sibling.BHasClass("SectionTitleRow")) ||
                (sibling.BHasClass && sibling.BHasClass("SectionTitle")) ||
                (sibling.BHasClass && sibling.BHasClass("RowSeparator"))) {
                isBoundary = true;
            }
        } catch (e1) {}
        if (isBoundary) break;
        try {
            if (!(sibling.BHasClass && sibling.BHasClass("SettingRow"))) continue;
        } catch (e2) {
            continue;
        }
        var runtimeKind = "";
        var runtimeKey = "";
        try {
            runtimeKind = sibling.GetAttributeString ? String(sibling.GetAttributeString(RUNTIME_ROW_KIND_ATTR, "") || "") : "";
            runtimeKey = sibling.GetAttributeString ? String(sibling.GetAttributeString(RUNTIME_ROW_KEY_ATTR, "") || "") : "";
        } catch (e3) {
            runtimeKind = "";
            runtimeKey = "";
        }
        if (!runtimeKey) continue;

        if (runtimeKind === "runtime_buttongroup") {
            if (ResetRuntimeButtonGroupToDefault(runtimeKey, true)) changed++;
        } else if (runtimeKind === "runtime_slider") {
            var resetFn = gRuntimeSliderResetters[runtimeKey];
            if (typeof resetFn === "function") {
                var before = Number(gRuntimeSliderState[runtimeKey]);
                try { resetFn(); } catch (e4) {}
                var after = Number(gRuntimeSliderState[runtimeKey]);
                if (!isFinite(before) || !isFinite(after) || Math.abs(before - after) > 0.000001) changed++;
            }
        }
    }
    return changed;
}

function CreateRuntimeSectionTitle(parent, title) {
    var localizedTitle = LocalizeSettingsText(title || "");
    gCurrentSettingsSectionTitle = String(title || "");
    if (gSearchCollectMode && gSearchCollectState) {
        return CreateSectionTitle(parent, title);
    }

    var titleRow = $.CreatePanel("Panel", parent, "");
    titleRow.AddClass("SectionTitleRow");
    titleRow.AddClass("SectionTitleStaticRow");
    var titleHead = $.CreatePanel("Panel", titleRow, "");
    titleHead.AddClass("SectionTitleInlineHead");
    var titleLabel = $.CreatePanel("Label", titleHead, "");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("SectionTitleInlineLabel");
    titleLabel.text = localizedTitle;
    BindSectionPerfTooltip(titleRow, title, "", currentTab, "", "", null);

    var resetBtn = $.CreatePanel("Button", titleHead, "");
    resetBtn.AddClass("SectionTitleActionBtn");
    resetBtn.AddClass("SectionResetBtn");
    var resetIcon = $.CreatePanel("Image", resetBtn, "", {
        src: "s2r://panorama/images/icons/icon_refresh.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    resetIcon.AddClass("SectionTitleActionIcon");
    resetIcon.AddClass("SettingRowResetIcon");
    resetIcon.AddClass("QOLResetIcon");
    try { resetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (e5) {}

    resetBtn.SetPanelEvent("onmouseover", function() {
        HideSettingsTextTooltip();
        CancelSettingsRowFloatingTooltipHide();
        ShowSettingsRowFloatingTooltip(
            resetBtn,
            "",
            LocalizeSettingsText("Reset section runtime options", true),
            PERF_IMPACT_TIER_NONE,
            ""
        );
    });
    resetBtn.SetPanelEvent("onmouseout", function() {
        HideSettingsTextTooltip();
        HideSettingsRowFloatingTooltipDeferred("section_runtime_reset_btn_mouseout");
    });
    resetBtn.SetPanelEvent("onactivate", function() {
        var changed = ResetRuntimeRowsInSectionFromTitleRow(titleRow);
        if (changed > 0) {
            SetConfigFeedbackMessage("Section reset (" + String(changed) + " changed).", "success", 1500);
        } else {
            SetConfigFeedbackMessage("Section already at defaults.", "info", 1300);
        }
    });

    return titleLabel;
}

function ApplyDefaultHeroSelection(heroId) {
    var normalizedHeroId = String(heroId || "");
    if (!/^hero_[a-z0-9_]+$/i.test(normalizedHeroId)) return false;
    var command = "selecthero " + normalizedHeroId;
    var didDispatch = RunConsoleCommandBestEffort(command);
    if (didDispatch) {
        try {
            var root = FindRootPanel();
            if (root && root.SetAttributeString) {
                root.SetAttributeString(HERO_HINT_ATTR, normalizedHeroId);
            }
        } catch (e1) {}
    }
    return didDispatch;
}

function ApplyHealthbarTypeSelection(rawValue) {
    var nextType = NormalizeHealthbarTypeValue(rawValue);
    MOD_CONFIG.HEALTHBAR_TYPE = nextType;
    MOD_CONFIG.ENABLE_MINIMALIST_HEALTHBAR = (nextType === 1) ? 1 : 0;
    MOD_CONFIG.ENABLE_FG_HEALTHBAR = (nextType === 2) ? 1 : 0;
}

function ForceCenterSliderValueInput(inputPanel) {
    if (!inputPanel || !inputPanel.IsValid || !inputPanel.IsValid()) return;

    var applyCenteredTextStyle = function(panel, insetPx) {
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        try { panel.style.padding = "0px"; } catch (e0) {}
        try { panel.style.paddingLeft = String(insetPx) + "px"; } catch (e1) {}
        try { panel.style.paddingRight = "0px"; } catch (e2) {}
        try { panel.style.margin = "0px"; } catch (e3) {}
        try { panel.style.marginLeft = "0px"; } catch (e4) {}
        try { panel.style.marginRight = "0px"; } catch (e5) {}
        try { panel.style.textAlign = "center"; } catch (e6) {}
        try { panel.style.verticalAlign = "center"; } catch (e7) {}
        try { panel.style.x = String(insetPx) + "px"; } catch (e8) {}
    };

    var applyNow = function() {
        if (!inputPanel || !inputPanel.IsValid || !inputPanel.IsValid()) return;
        try {
            inputPanel.style.padding = "0px";
            inputPanel.style.paddingLeft = "3px";
            inputPanel.style.paddingRight = "0px";
            inputPanel.style.textAlign = "center";
        } catch (e0) {}

        var textEntry = null;
        try { textEntry = inputPanel.FindChildTraverse("TextEntry"); } catch (e9) { textEntry = null; }
        if (textEntry && textEntry.IsValid && textEntry.IsValid()) {
            try { textEntry.style.width = "100%"; } catch (e10) {}
            applyCenteredTextStyle(textEntry, 3);
        }

        var contents = null;
        try { contents = inputPanel.FindChildTraverse("Contents"); } catch (e11) { contents = null; }
        if (contents && contents.IsValid && contents.IsValid()) {
            try { contents.style.width = "100%"; } catch (e12) {}
            applyCenteredTextStyle(contents, 0);
            try { contents.style.horizontalAlign = "left"; } catch (e13) {}
        }

        var textContents = null;
        try { textContents = inputPanel.FindChildTraverse("TextEntryContents"); } catch (e14) { textContents = null; }
        if (textContents && textContents.IsValid && textContents.IsValid()) {
            try { textContents.style.width = "100%"; } catch (e15) {}
            try { textContents.style.horizontalAlign = "left"; } catch (e16) {}
            applyCenteredTextStyle(textContents, 3);

            var childCount = 0;
            try { childCount = textContents.GetChildCount ? textContents.GetChildCount() : 0; } catch (e17) { childCount = 0; }
            for (var ci = 0; ci < childCount; ci++) {
                var textChild = null;
                try { textChild = textContents.GetChild(ci); } catch (e18) { textChild = null; }
                if (!textChild || !textChild.IsValid || !textChild.IsValid()) continue;
                try { textChild.style.width = "100%"; } catch (e19) {}
                try { textChild.style.horizontalAlign = "center"; } catch (e20) {}
                applyCenteredTextStyle(textChild, 3);
            }
        }

        var placeholder = null;
        try { placeholder = inputPanel.FindChildTraverse("PlaceholderText"); } catch (e21) { placeholder = null; }
        if (placeholder && placeholder.IsValid && placeholder.IsValid()) {
            applyCenteredTextStyle(placeholder, 3);
        }

        var plainLabel = null;
        try { plainLabel = inputPanel.FindChildTraverse("Label"); } catch (e22) { plainLabel = null; }
        if (plainLabel && plainLabel.IsValid && plainLabel.IsValid()) {
            applyCenteredTextStyle(plainLabel, 3);
        }

        var cursor = null;
        try { cursor = inputPanel.FindChildTraverse("TextEntryCursor"); } catch (e23) { cursor = null; }
        if (cursor && cursor.IsValid && cursor.IsValid()) {
            applyCenteredTextStyle(cursor, 3);
        }
    };

    applyNow();
    $.Schedule(0.0, applyNow);
    $.Schedule(0.03, applyNow);
    $.Schedule(0.08, applyNow);

    inputPanel.SetPanelEvent("ontextentrychange", applyNow);
    inputPanel.SetPanelEvent("onfocus", applyNow);
    inputPanel.SetPanelEvent("onblur", applyNow);
}

function NormalizeComparableConfigValue(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "number") {
        if (!isFinite(value)) return "";
        return String(Math.round(value * 10000) / 10000);
    }
    return String(value);
}

function IsConfigKeyChangedFromDefault(key) {
    if (!key) return false;
    if (!MOD_CONFIG || !MOD_CONFIG.hasOwnProperty(key)) return false;
    if (!DEFAULT_CONFIG || !DEFAULT_CONFIG.hasOwnProperty(key)) return false;
    return NormalizeComparableConfigValue(MOD_CONFIG[key]) !== NormalizeComparableConfigValue(DEFAULT_CONFIG[key]);
}

function CollectRowConfigKeys(configId, type, options) {
    var keys = [];
    if (type === "multitoggle" && Array.isArray(options)) {
        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            if (!opt || !opt.key) continue;
            if (!MOD_CONFIG.hasOwnProperty(opt.key) || !DEFAULT_CONFIG.hasOwnProperty(opt.key)) continue;
            keys.push(String(opt.key));
        }
        return keys;
    }
    if (!configId || typeof configId !== "string") return keys;
    if (!MOD_CONFIG.hasOwnProperty(configId) || !DEFAULT_CONFIG.hasOwnProperty(configId)) return keys;
    keys.push(configId);
    return keys;
}

function IsNeutralCampTypeFilterOptions(options) {
    return OptionsMatchExpectedKeys(options, NEUTRAL_CAMP_TIER_OPTIONS);
}

function OptionsMatchExpectedKeys(options, expectedOptions) {
    if (!Array.isArray(options) || !Array.isArray(expectedOptions)) return false;
    if (options.length !== expectedOptions.length) return false;
    var expected = {};
    for (var i = 0; i < expectedOptions.length; i++) {
        var key = expectedOptions[i] && expectedOptions[i].key
            ? String(expectedOptions[i].key)
            : "";
        if (!key) continue;
        expected[key] = true;
    }
    var matched = 0;
    for (var j = 0; j < options.length; j++) {
        var optKey = options[j] && options[j].key ? String(options[j].key) : "";
        if (optKey && expected[optKey]) matched += 1;
    }
    return matched === expectedOptions.length;
}

function IsColorWarningThresholdOptions(options) {
    return OptionsMatchExpectedKeys(options, COLOR_WARNING_THRESHOLD_OPTIONS);
}

function IsEnemyColorWarningThresholdOptions(options) {
    return OptionsMatchExpectedKeys(options, ENEMY_COLOR_WARNING_THRESHOLD_OPTIONS);
}

function IsBridgeBuffFilterOptions(options) {
    return OptionsMatchExpectedKeys(options, BRIDGE_BUFF_FILTER_OPTIONS);
}

function BindRowChangedState(row, labelContainer, configKeys, resetBtn) {
    if (!row || !row.IsValid || !row.IsValid()) return function() {};
    if (!labelContainer || !labelContainer.IsValid || !labelContainer.IsValid()) return function() {};
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return function() {};

    var badge = $.CreatePanel("Panel", labelContainer, "");
    badge.AddClass("SettingChangedBadge");

    var refresh = function() {
        if (!row || !row.IsValid || !row.IsValid()) return;
        var changed = false;
        for (var i = 0; i < configKeys.length; i++) {
            if (IsConfigKeyChangedFromDefault(configKeys[i])) {
                changed = true;
                break;
            }
        }
        row.SetHasClass("HasChanged", changed);
        if (badge && badge.IsValid && badge.IsValid()) {
            badge.SetHasClass("Visible", changed);
        }
        if (resetBtn && resetBtn.IsValid && resetBtn.IsValid()) {
            resetBtn.SetHasClass("Visible", changed);
        }
    };

    refresh();
    return refresh;
}

function CreateRow(parent, label, configId, type, min, max, step, options, description) {
    var localizedLabel = LocalizeSettingsText(label || "");
    var effectiveDescription = GetSettingDescriptionOverride(
        configId,
        label,
        description || "",
        GetCurrentSettingsCategoryKey()
    );
    var localizedDescription = LocalizeSettingsText(effectiveDescription || "");
    var hasRowDescription = !!(effectiveDescription && effectiveDescription !== "" && localizedDescription && localizedDescription !== "");
    var perfImpactInfo = BuildPerfImpactTooltipLine(configId, type, options);
    var rowPerfTier = (perfImpactInfo && perfImpactInfo.tier) ? String(perfImpactInfo.tier) : PERF_IMPACT_TIER_NONE;
    var rowCreatedBy = GetSettingCreatedBy(configId, label);
    var rowTooltipPerfLine = (perfImpactInfo && perfImpactInfo.line) ? String(perfImpactInfo.line) : "";
    var rowTooltipDescLine = hasRowDescription ? localizedDescription : "";
    var hasRowTooltip = HasMeaningfulFloatingTooltipContent(rowPerfTier, rowTooltipDescLine, rowCreatedBy);
    if (gSearchCollectMode && gSearchCollectState) {
        GetActiveSearchCollectSection().rows.push(BuildSearchCollectedRow(
            localizedLabel,
            configId,
            type,
            min,
            max,
            step,
            options,
            localizedDescription,
            null
        ));
        return;
    }
    var row = $.CreatePanel("Panel", parent, "");
    if (gSearchResultRenderMode) row.AddClass("SearchResultRow");
    row.AddClass("SettingRow");
    var isRuntimeSliderRow = (type === "runtime_slider");
    var isRuntimeButtonGroupRow = (type === "runtime_buttongroup");
    if (type === "slider" || isRuntimeSliderRow) row.AddClass("RowTypeSlider");
    else if (type === "multitoggle") row.AddClass("RowTypeMultiToggle");
    else if (type === "buttongroup") row.AddClass("RowTypeButtonGroup");
    else if (type === "runtime_buttongroup") row.AddClass("RowTypeButtonGroup");
    else if (type === "dropdown") row.AddClass("RowTypeDropDown");
    else if (type === "actionbutton") row.AddClass("RowTypeAction");
    else row.AddClass("RowTypeToggle");
    var labelContainer = $.CreatePanel("Panel", row, "");
    labelContainer.AddClass("LabelContainer");
    var lbl = $.CreatePanel("Label", labelContainer, "");
    lbl.AddClass("SettingLabel");
    lbl.text = localizedLabel;
    var rowConfigKeys = CollectRowConfigKeys(configId, type, options);
    if (row && row.SetAttributeString) {
        try { row.SetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, rowConfigKeys.join(",")); } catch (e0) {}
    }
    var rowResetBtn = null;
    var runtimeSliderResetAction = null;
    var runtimeButtonGroupResetAction = null;
    var showCustomRowTooltip = function() {};
    var hideCustomRowTooltip = function() {};
    var syncRowVisualState = function() {
        if (!row || !row.IsValid || !row.IsValid()) return false;
        return true;
    };
    if (rowConfigKeys.length > 0 || isRuntimeSliderRow || isRuntimeButtonGroupRow) {
        rowResetBtn = $.CreatePanel("Button", labelContainer, "");
        rowResetBtn.AddClass("SettingRowResetBtn");
        if (isRuntimeSliderRow || isRuntimeButtonGroupRow) {
            rowResetBtn.AddClass("RuntimeAlwaysVisible");
        }
        var rowResetIcon = $.CreatePanel("Image", rowResetBtn, "", {
            src: "s2r://panorama/images/icons/icon_refresh.vsvg",
            defaultsrc: "",
            scaling: "contain"
        });
        rowResetIcon.AddClass("SettingRowResetIcon");
        rowResetIcon.AddClass("QOLResetIcon");
        try { rowResetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (eImg) {}
        rowResetBtn.SetPanelEvent("onmouseover", function() {
            hideCustomRowTooltip();
            HideSettingsTextTooltip();
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(
                rowResetBtn,
                "",
                LocalizeSettingsText((isRuntimeSliderRow || isRuntimeButtonGroupRow) ? "Reset to default value" : "Reset row to defaults", true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        });
        rowResetBtn.SetPanelEvent("onmouseout", function() {
            HideSettingsTextTooltip();
            HideSettingsRowFloatingTooltipDeferred("row_reset_btn_mouseout");
        });
        rowResetBtn.SetPanelEvent("onactivate", function() {
            if (isRuntimeSliderRow) {
                if (runtimeSliderResetAction) runtimeSliderResetAction();
                return;
            }
            if (isRuntimeButtonGroupRow) {
                if (runtimeButtonGroupResetAction) runtimeButtonGroupResetAction();
                return;
            }
            var changedCount = ApplyResetForConfigKeys(rowConfigKeys);
            if (changedCount > 0) {
                SaveAndSync();
                syncRowVisualState();
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 (" + String(changedCount) + ").")
                    : ("Row reset (" + String(changedCount) + ")."), "success", 1400);
            } else {
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? "\u0421\u0442\u0440\u043E\u043A\u0430 \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                    : "Row already at defaults.", "info", 1200);
            }
        });
    }
    var refreshRowChangedState = BindRowChangedState(row, labelContainer, rowConfigKeys, rowResetBtn);
    syncRowVisualState = function() {
        if (!row || !row.IsValid || !row.IsValid()) return false;
        refreshRowChangedState();
        return true;
    };
    if (hasRowTooltip) {
        showCustomRowTooltip = function() {
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(row, rowTooltipPerfLine, rowTooltipDescLine, rowPerfTier, rowCreatedBy);
        };

        hideCustomRowTooltip = function() {
            HideSettingsRowFloatingTooltipDeferred("row_mouseout");
        };

        row.SetPanelEvent("onmouseover", function() {
            showCustomRowTooltip();
        });
        row.SetPanelEvent("onmouseout", function() {
            hideCustomRowTooltip();
        });
    }
    if (type === "slider") {
        var sliderValueGroup = $.CreatePanel("Panel", row, "");
        sliderValueGroup.AddClass("SliderValueGroup");
        sliderValueGroup.AddClass("SettingControlRoot");
        var sliderContainer = $.CreatePanel("Panel", sliderValueGroup, "");
        sliderContainer.AddClass("SliderContainer");
        var slider = $.CreatePanel("Slider", sliderContainer, "", { direction: "horizontal" });
        slider.AddClass("HorizontalSlider");
        var isFloat = (max <= 5.0 && (configId.indexOf("OPACITY") !== -1 || configId.indexOf("SCALE") !== -1));
        var isOpacitySlider = (isFloat && configId.indexOf("OPACITY") !== -1);
        var isSecondsSlider = (configId === "BRIDGE_BUFF_START" || configId === "MINIMAP_REMINDER_INTERVAL");
        var formatSliderInputValue = function(value) {
            if (value === undefined || value === null || !isFinite(Number(value))) value = 0;
            var numeric = Number(value);
            if (isOpacitySlider) {
                var pct = Math.round(Math.max(0, Math.min(1, numeric)) * 100);
                return String(pct) + "%";
            }
            if (isFloat) return numeric.toFixed(2);
            if (isSecondsSlider) return String(Math.round(numeric)) + "s";
            return String(Math.round(numeric));
        };
        var parseSliderInputValue = function(text) {
            var rawText = String(text === undefined || text === null ? "" : text).trim();
            if (!rawText) return null;
            rawText = rawText.replace(",", ".");
            var parsed = parseFloat(rawText);
            if (!isFinite(parsed)) return null;
            if (isOpacitySlider) {
                var hasPercent = rawText.indexOf("%") !== -1;
                if (hasPercent || parsed > 1) parsed = parsed / 100;
            }
            return parsed;
        };
        slider.min = isFloat ? 0 : min;
        slider.max = isFloat ? max * 100 : max;
        slider.value = isFloat ? MOD_CONFIG[configId] * 100 : MOD_CONFIG[configId];
        var input = $.CreatePanel("TextEntry", sliderValueGroup, "");
        input.AddClass("ValueInput");
        input.text = formatSliderInputValue(MOD_CONFIG[configId]);
        ForceCenterSliderValueInput(input);
        slider.SetPanelEvent("onvaluechanged", function() {
            var val;
            if (isFloat) {
                val = parseFloat((Math.round(slider.value) / 100).toFixed(2));
                if (val !== MOD_CONFIG[configId]) {
                    input.text = formatSliderInputValue(val);
                    MOD_CONFIG[configId] = val;
                    SaveAndSync();
                    refreshRowChangedState();
                }
            } else {
                val = Math.round(slider.value / step) * step;
                if (val !== MOD_CONFIG[configId]) {
                    input.text = formatSliderInputValue(val);
                    MOD_CONFIG[configId] = val;
                    SaveAndSync();
                    refreshRowChangedState();
                }
            }
            ShowConfigPreviewForConfigId(configId);
        });
        input.SetPanelEvent("oninputsubmit", function() {
            var rawVal = parseSliderInputValue(input.text);
            if (rawVal === null || !isFinite(Number(rawVal))) {
                input.text = formatSliderInputValue(MOD_CONFIG[configId]);
                return;
            }
            var clampedVal = Math.max(min, Math.min(max, rawVal));
            if (isFloat) {
                MOD_CONFIG[configId] = parseFloat(clampedVal.toFixed(2));
                slider.value = clampedVal * 100;
                input.text = formatSliderInputValue(MOD_CONFIG[configId]);
            } else {
                MOD_CONFIG[configId] = Math.round(clampedVal);
                slider.value = MOD_CONFIG[configId];
                input.text = formatSliderInputValue(MOD_CONFIG[configId]);
            }
            input.RemoveClass("ValueSavedFlash");
            input.AddClass("ValueSavedFlash");
            SaveAndSync();
            refreshRowChangedState();
            ShowConfigPreviewForConfigId(configId);
        });
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            var nextVal = Number(MOD_CONFIG[configId]);
            if (!isFinite(nextVal)) nextVal = Number(min);
            nextVal = Math.max(Number(min), Math.min(Number(max), nextVal));
            if (isFloat) {
                nextVal = parseFloat(nextVal.toFixed(2));
                slider.value = nextVal * 100;
            } else {
                nextVal = Math.round(nextVal);
                slider.value = nextVal;
            }
            input.text = formatSliderInputValue(nextVal);
            refreshRowChangedState();
            return true;
        };
    } else if (type === "runtime_slider") {
        var runtimeConfig = (Array.isArray(options) && options.length > 0 && options[0]) ? options[0] : {};
        var runtimeCommand = String(runtimeConfig.command || "").trim();
        var runtimeMin = Number(min);
        var runtimeMax = Number(max);
        var runtimeStep = Number(step);
        var runtimeDefault = Number(runtimeConfig.defaultValue);
        if (!isFinite(runtimeMin)) runtimeMin = 0;
        if (!isFinite(runtimeMax)) runtimeMax = runtimeMin + 1;
        if (runtimeMax < runtimeMin) {
            var swapTmp = runtimeMax;
            runtimeMax = runtimeMin;
            runtimeMin = swapTmp;
        }
        if (!isFinite(runtimeStep) || runtimeStep <= 0) runtimeStep = 1;
        if (!isFinite(runtimeDefault)) runtimeDefault = runtimeMin;
        runtimeDefault = Math.max(runtimeMin, Math.min(runtimeMax, runtimeDefault));

        var stepText = String(runtimeStep);
        var stepDot = stepText.indexOf(".");
        var runtimePrecision = 0;
        if (stepDot !== -1) runtimePrecision = stepText.length - stepDot - 1;
        if (runtimePrecision < 0) runtimePrecision = 0;
        if (runtimePrecision > 6) runtimePrecision = 6;
        var runtimeScale = Math.pow(10, runtimePrecision);

        var quantizeRuntimeValue = function(value) {
            var numeric = Number(value);
            if (!isFinite(numeric)) numeric = runtimeDefault;
            numeric = Math.max(runtimeMin, Math.min(runtimeMax, numeric));
            var stepped = Math.round((numeric - runtimeMin) / runtimeStep) * runtimeStep + runtimeMin;
            stepped = Math.max(runtimeMin, Math.min(runtimeMax, stepped));
            if (runtimePrecision > 0) {
                stepped = Number(stepped.toFixed(runtimePrecision));
            } else {
                stepped = Math.round(stepped);
            }
            return stepped;
        };
        var formatRuntimeValue = function(value) {
            var numeric = Number(value);
            if (!isFinite(numeric)) numeric = runtimeDefault;
            if (runtimePrecision <= 0) return String(Math.round(numeric));
            var out = numeric.toFixed(runtimePrecision);
            out = out.replace(/\.?0+$/, "");
            if (out === "-0") out = "0";
            return out;
        };

        var runtimeKey = String(configId || runtimeCommand || label || "runtime_slider");
        if (row && row.SetAttributeString) {
            try { row.SetAttributeString(RUNTIME_ROW_KIND_ATTR, "runtime_slider"); } catch (eKind0) {}
            try { row.SetAttributeString(RUNTIME_ROW_KEY_ATTR, runtimeKey); } catch (eKey0) {}
        }
        var initialRuntimeValue = Number(gRuntimeSliderState[runtimeKey]);
        if (!isFinite(initialRuntimeValue)) initialRuntimeValue = runtimeDefault;
        initialRuntimeValue = quantizeRuntimeValue(initialRuntimeValue);
        gRuntimeSliderState[runtimeKey] = initialRuntimeValue;

        var runtimeGroup = $.CreatePanel("Panel", row, "");
        runtimeGroup.AddClass("SliderValueGroup");
        runtimeGroup.AddClass("SettingControlRoot");
        var runtimeSliderContainer = $.CreatePanel("Panel", runtimeGroup, "");
        runtimeSliderContainer.AddClass("SliderContainer");
        var runtimeSlider = $.CreatePanel("Slider", runtimeSliderContainer, "", { direction: "horizontal" });
        runtimeSlider.AddClass("HorizontalSlider");
        runtimeSlider.min = Math.round(runtimeMin * runtimeScale);
        runtimeSlider.max = Math.round(runtimeMax * runtimeScale);
        runtimeSlider.value = Math.round(initialRuntimeValue * runtimeScale);

        var runtimeInput = $.CreatePanel("TextEntry", runtimeGroup, "");
        runtimeInput.AddClass("ValueInput");
        runtimeInput.text = formatRuntimeValue(initialRuntimeValue);
        ForceCenterSliderValueInput(runtimeInput);

        var applyRuntimeValue = function(nextValue, runCommand) {
            var quantized = quantizeRuntimeValue(nextValue);
            var previous = Number(gRuntimeSliderState[runtimeKey]);
            if (!isFinite(previous)) previous = runtimeDefault;
            var changed = Math.abs(previous - quantized) > 0.000001;
            gRuntimeSliderState[runtimeKey] = quantized;

            var sliderValue = Math.round(quantized * runtimeScale);
            if (Math.round(Number(runtimeSlider.value)) !== sliderValue) {
                runtimeSlider.value = sliderValue;
            }
            runtimeInput.text = formatRuntimeValue(quantized);

            if (changed && runCommand && runtimeCommand) {
                RunConsoleCommandBestEffort(runtimeCommand + " " + formatRuntimeValue(quantized));
            }
            return changed;
        };

        runtimeSlider.SetPanelEvent("onvaluechanged", function() {
            var numericSliderValue = Number(runtimeSlider.value);
            if (!isFinite(numericSliderValue)) numericSliderValue = Math.round(runtimeDefault * runtimeScale);
            var desired = numericSliderValue / runtimeScale;
            applyRuntimeValue(desired, true);
        });

        runtimeInput.SetPanelEvent("oninputsubmit", function() {
            var raw = String(runtimeInput.text === undefined || runtimeInput.text === null ? "" : runtimeInput.text).trim();
            raw = raw.replace(",", ".");
            var parsed = parseFloat(raw);
            if (!isFinite(parsed)) {
                runtimeInput.text = formatRuntimeValue(gRuntimeSliderState[runtimeKey]);
                return;
            }
            var changed = applyRuntimeValue(parsed, true);
            if (changed) {
                runtimeInput.RemoveClass("ValueSavedFlash");
                runtimeInput.AddClass("ValueSavedFlash");
            }
        });

        runtimeSliderResetAction = function() {
            var changed = applyRuntimeValue(runtimeDefault, true);
            if (!changed) {
                SetConfigFeedbackMessage("Already at default value.", "info", 1200);
                return;
            }
            runtimeInput.RemoveClass("ValueSavedFlash");
            runtimeInput.AddClass("ValueSavedFlash");
            SetConfigFeedbackMessage("Reset to default value.", "success", 1200);
        };
        gRuntimeSliderResetters[runtimeKey] = runtimeSliderResetAction;
    } else if (type === "multitoggle" && Array.isArray(options)) {
        row.AddClass("MultiToggleRow");
        var isItemCooldownFilterRow = false;
        var isColorWarningFilterRow = IsColorWarningThresholdOptions(options) || IsEnemyColorWarningThresholdOptions(options);
        var isBridgeBuffFilterRow = IsBridgeBuffFilterOptions(options);
        if (options && options.length === 4) {
            var itemFilterKeyCount = 0;
            for (var mi = 0; mi < options.length; mi++) {
                var mk = options[mi] && options[mi].key ? String(options[mi].key) : "";
                if (mk.indexOf("ITEM_FILTER_") === 0) itemFilterKeyCount += 1;
            }
            isItemCooldownFilterRow = (itemFilterKeyCount === 4);
        }
        var useCheckboxStyle = IsNeutralCampTypeFilterOptions(options) || isColorWarningFilterRow || isItemCooldownFilterRow || isBridgeBuffFilterRow;
        if (useCheckboxStyle) {
            row.AddClass("MultiCheckboxRow");
        }
        if (isColorWarningFilterRow) {
            // Reuse the same one-line horizontal layout as Announcer Type.
            row.AddClass("AnnouncerTypeFilterRow");
        }
        if (isBridgeBuffFilterRow) {
            row.AddClass("AnnouncerTypeFilterRow");
            row.AddClass("AnnouncerBuffFilterRow");
        }
        if (isItemCooldownFilterRow) {
            row.AddClass("ItemCooldownFilterRow");
        }
        var multiGroup = $.CreatePanel("Panel", row, "");
        multiGroup.AddClass("SettingButtonGroup");
        multiGroup.AddClass("MultiToggleGroup");
        multiGroup.AddClass("SettingControlRoot");
        if (useCheckboxStyle) {
            multiGroup.AddClass("MultiCheckboxGroup");
        }
        if (isItemCooldownFilterRow) {
            multiGroup.AddClass("ItemCooldownFilterGroup");
        }
        if (isBridgeBuffFilterRow) {
            multiGroup.AddClass("AnnouncerBuffFilterGroup");
        }
        var multiRefreshFns = [];
        options.forEach(function(opt, optIndex) {
            if (!opt || !opt.key) return;
            var key = opt.key;
            if (!MOD_CONFIG.hasOwnProperty(key)) return;

            var buttonParent = multiGroup;
            var optionWrap = null;
            if (isBridgeBuffFilterRow) {
                optionWrap = $.CreatePanel("Panel", multiGroup, "");
                optionWrap.AddClass("AnnouncerBuffFilterOptionWrap");
                buttonParent = optionWrap;
            }

            var multiBtn = useCheckboxStyle
                ? $.CreatePanel("ToggleButton", buttonParent, "")
                : $.CreatePanel("Button", buttonParent, "");
            if (!useCheckboxStyle) {
                multiBtn.AddClass("SegmentBtn");
                multiBtn.AddClass("MultiToggleBtn");
            } else {
                multiBtn.AddClass("MultiCheckboxBtn");
                multiBtn.AddClass("CitadelSettingsCheckbox");
            }
            if (isBridgeBuffFilterRow) {
                multiBtn.AddClass("AnnouncerBuffFilterMainBtn");
            }
            if (isItemCooldownFilterRow) {
                multiBtn.AddClass("ItemCooldownFilterBtn");
                if (optIndex < 2) {
                    multiBtn.AddClass("ItemCooldownTopRowBtn");
                } else {
                    multiBtn.AddClass("ItemCooldownBottomRowBtn");
                }
            }
            var multiBtnLbl = $.CreatePanel("Label", multiBtn, "");
            multiBtnLbl.AddClass(useCheckboxStyle ? "MultiCheckboxLabel" : "MultiToggleLabel");
            multiBtnLbl.text = LocalizeSettingsText(opt.label || key);

            var updateMultiBtn = function() {
                var isActive = (MOD_CONFIG[key] === 1);
                if (useCheckboxStyle) {
                    try { multiBtn.SetSelected(isActive); } catch (eSel) {}
                    multiBtn.SetHasClass("selected", isActive);
                    multiBtn.SetHasClass("IsSelected", isActive);
                }
                multiBtn.SetHasClass("Active", isActive);
            };
            updateMultiBtn();
            multiRefreshFns.push(updateMultiBtn);

            multiBtn.SetPanelEvent("onactivate", function() {
                MOD_CONFIG[key] = (MOD_CONFIG[key] === 1 ? 0 : 1);
                updateMultiBtn();
                SaveAndSync();
                refreshRowChangedState();
            });

            if (isBridgeBuffFilterRow && optionWrap) {
                var soundVariant = optIndex + 1;
                var keyText = String(key || "");
                if (keyText.indexOf("ENABLE_BUFF_SOUND_") === 0) {
                    var parsedVariant = parseInt(keyText.substring("ENABLE_BUFF_SOUND_".length), 10);
                    if (isFinite(parsedVariant) && parsedVariant >= 1 && parsedVariant <= 3) {
                        soundVariant = parsedVariant;
                    }
                }

                var testBtn = $.CreatePanel("Button", optionWrap, "");
                testBtn.AddClass("SectionTitleActionBtn");
                testBtn.AddClass("AnnouncerBuffFilterTestBtn");
                var testIcon = $.CreatePanel("Image", testBtn, "", {
                    src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
                    defaultsrc: "",
                    scaling: "contain"
                });
                testIcon.AddClass("SectionTitleActionIcon");
                testIcon.AddClass("AnnouncerBuffFilterTestIcon");

                var testTooltipText = LocalizeSettingsText("Play Sound", true) + " " + LocalizeSettingsText(String(soundVariant), true);
                testBtn.SetPanelEvent("onmouseover", function() {
                    HideSettingsTextTooltip();
                    CancelSettingsRowFloatingTooltipHide();
                    ShowSettingsRowFloatingTooltip(
                        testBtn,
                        "",
                        testTooltipText,
                        PERF_IMPACT_TIER_NONE,
                        ""
                    );
                });
                testBtn.SetPanelEvent("onmouseout", function() {
                    HideSettingsRowFloatingTooltipDeferred("announcer_buff_filter_test_mouseout");
                });
                testBtn.SetPanelEvent("onactivate", function() {
                    PlayAnnouncerBridgeVariantPreviewSound(soundVariant);
                    testBtn.AddClass("SuccessState");
                    $.Schedule(0.28, function() {
                        if (testBtn && testBtn.IsValid && testBtn.IsValid()) {
                            testBtn.RemoveClass("SuccessState");
                        }
                    });
                });
                try {
                    if (optionWrap && optionWrap.MoveChildBefore) {
                        optionWrap.MoveChildBefore(testBtn, multiBtn);
                    }
                } catch (eReorder) {}
            }
        });
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            for (var mr = 0; mr < multiRefreshFns.length; mr++) {
                var multiRefreshFn = multiRefreshFns[mr];
                if (typeof multiRefreshFn !== "function") continue;
                try { multiRefreshFn(); } catch (eMulti) {}
            }
            refreshRowChangedState();
            return true;
        };
    } else if (type === "runtime_buttongroup" && Array.isArray(options)) {
        var runtimeGroup = $.CreatePanel("Panel", row, "");
        runtimeGroup.AddClass("SettingButtonGroup");
        runtimeGroup.AddClass("SettingControlRoot");
        runtimeGroup.AddClass("RuntimeOnOffGroup");
        var runtimeGroupKey = String(configId || label || "runtime_buttongroup");
        var isAudioBeepTestGroup = (runtimeGroupKey === "AUDIO_BEEP_TEST_RUNTIME");
        if (isAudioBeepTestGroup) {
            row.AddClass("RuntimeSoundTestRow");
            runtimeGroup.AddClass("RuntimeSoundTestGroup");
        }
        if (row && row.SetAttributeString) {
            try { row.SetAttributeString(RUNTIME_ROW_KIND_ATTR, "runtime_buttongroup"); } catch (eKind1) {}
            try { row.SetAttributeString(RUNTIME_ROW_KEY_ATTR, runtimeGroupKey); } catch (eKey1) {}
        }
        var defaultRuntimeIndex = GetRuntimeButtonGroupDefaultIndex(runtimeGroupKey, null);
        if (defaultRuntimeIndex >= options.length) defaultRuntimeIndex = 0;
        gRuntimeButtonGroupConfig[runtimeGroupKey] = {
            options: options,
            defaultIndex: defaultRuntimeIndex,
            alwaysRunAction: isAudioBeepTestGroup
        };
        var initialRuntimeIndex = Number(gRuntimeToggleState[runtimeGroupKey]);
        if (!isFinite(initialRuntimeIndex) || initialRuntimeIndex < 0 || initialRuntimeIndex >= options.length) {
            initialRuntimeIndex = defaultRuntimeIndex;
        }
        gRuntimeToggleState[runtimeGroupKey] = initialRuntimeIndex;
        var runtimeButtons = [];
        var refreshRuntimeButtons = function() {
            for (var rb = 0; rb < runtimeButtons.length; rb++) {
                var runtimeBtn = runtimeButtons[rb];
                if (!runtimeBtn || !runtimeBtn.IsValid || !runtimeBtn.IsValid()) continue;
                runtimeBtn.SetHasClass("Active", rb === gRuntimeToggleState[runtimeGroupKey]);
            }
        };
        options.forEach(function(opt, index) {
            var runtimeBtn = $.CreatePanel("Button", runtimeGroup, "");
            runtimeBtn.AddClass("SegmentBtn");
            runtimeBtn.AddClass("RuntimeOnOffBtn");
            if (isAudioBeepTestGroup) {
                runtimeBtn.AddClass("RuntimeSoundTestBtn");
            }
            var runtimeBtnLbl = $.CreatePanel("Label", runtimeBtn, "");
            runtimeBtnLbl.text = LocalizeSettingsText((opt && opt.label) ? opt.label : String(index), true);
            runtimeButtons.push(runtimeBtn);
            runtimeBtn.SetPanelEvent("onactivate", function() {
                ApplyRuntimeButtonGroupIndex(runtimeGroupKey, index, true);
            });
        });
        gRuntimeButtonGroupRefreshers[runtimeGroupKey] = refreshRuntimeButtons;
        runtimeButtonGroupResetAction = function() {
            var changed = ResetRuntimeButtonGroupToDefault(runtimeGroupKey, true);
            if (!changed) {
                SetConfigFeedbackMessage("Already at default value.", "info", 1200);
                return;
            }
            SetConfigFeedbackMessage("Reset to default value.", "success", 1200);
        };
        refreshRuntimeButtons();
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            refreshRuntimeButtons();
            refreshRowChangedState();
            return true;
        };
    } else if (type === "buttongroup" && Array.isArray(options)) {
        var group = $.CreatePanel("Panel", row, "");
        group.AddClass("SettingButtonGroup");
        group.AddClass("SettingControlRoot");
        if (configId === "VOICE_TYPE") {
            group.AddClass("CompactSegmentGroup");
        }
        if (configId === "LANGUAGE") {
            group.AddClass("LanguageSwitchGroup");
        }
        if (configId === "GAME_DEFAULT_DIFFICULTY") {
            group.AddClass("ArcadeDifficultyDefaultGroup");
        }
        var groupButtons = [];
        var buttonGroupRefreshFns = [];
        options.forEach(function(opt, index) {
            var btn = $.CreatePanel("Button", group, "");
            btn.AddClass("SegmentBtn");
            if (configId === "LANGUAGE") {
                btn.AddClass("LanguageSwitchBtn");
            }
            if (configId === "GAME_DEFAULT_DIFFICULTY") {
                btn.AddClass("ArcadeDifficultyDefaultBtn");
            }
            var btnLbl = $.CreatePanel("Label", btn, "");
            btnLbl.text = LocalizeSettingsText(opt.label);
            groupButtons.push(btn);
            var updateBtn = function() {
                btn.SetHasClass("Active", MOD_CONFIG[configId] === index);
            };
            updateBtn();
            buttonGroupRefreshFns.push(updateBtn);
            btn.SetPanelEvent("onactivate", function() {
                MOD_CONFIG[configId] = index;
                for (var i = 0; i < groupButtons.length; i++) {
                    groupButtons[i].SetHasClass("Active", i === index);
                }
                SaveAndSync();
                refreshRowChangedState();
                if (configId === "LANGUAGE") {
                    var rootPanel = $.GetContextPanel();
                    var tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
                    var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                    InvalidateSearchSectionIndexCache();
                    SyncTabActiveStates(tabBar);
                    if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                        RequestSettingsListRefresh(0, false);
                    }
                }
            });
        });
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            for (var br = 0; br < buttonGroupRefreshFns.length; br++) {
                var buttonRefreshFn = buttonGroupRefreshFns[br];
                if (typeof buttonRefreshFn !== "function") continue;
                try { buttonRefreshFn(); } catch (eBtn) {}
            }
            refreshRowChangedState();
            return true;
        };
    } else if (type === "dropdown" && Array.isArray(options)) {
        var dropdownId = String(configId || "dropdown") + "_dropdown";
        var dropdownParent = row;
        var defaultHeroIconPanel = null;
        var languageIconPanel = null;
        if (configId === "VOICE_TYPE") {
            var voiceControlGroup = $.CreatePanel("Panel", row, "VoiceDropdownControlGroup");
            voiceControlGroup.AddClass("SettingControlRoot");
            voiceControlGroup.AddClass("VoiceDropdownControlGroup");
            dropdownParent = voiceControlGroup;
        } else if (configId === "LANGUAGE") {
            var languageControlGroup = $.CreatePanel("Panel", row, "LanguageDropdownControlGroup");
            languageControlGroup.AddClass("SettingControlRoot");
            languageControlGroup.AddClass("LanguageDropdownControlGroup");
            languageIconPanel = $.CreatePanel("Image", languageControlGroup, "LanguageDropdownIcon");
            languageIconPanel.AddClass("LanguageDropdownIcon");
            dropdownParent = languageControlGroup;
        } else if (configId === "DEFAULT_HERO") {
            var defaultHeroControlGroup = $.CreatePanel("Panel", row, "DefaultHeroDropdownControlGroup");
            defaultHeroControlGroup.AddClass("SettingControlRoot");
            defaultHeroControlGroup.AddClass("DefaultHeroDropdownControlGroup");
            defaultHeroIconPanel = $.CreatePanel("Image", defaultHeroControlGroup, "DefaultHeroDropdownHeroIcon");
            defaultHeroIconPanel.AddClass("DefaultHeroDropdownHeroIcon");
            dropdownParent = defaultHeroControlGroup;
        }
        var dropdown = $.CreatePanel("DropDown", dropdownParent, dropdownId);
        dropdown.AddClass("SettingsDropDown");
        dropdown.AddClass("QOLSettingsDropDown");
        dropdown.AddClass("SettingControlRoot");
        if (configId === "VOICE_TYPE") {
            dropdown.AddClass("VoicePrimaryDropDown");
        } else if (configId === "DEFAULT_HERO") {
            dropdown.AddClass("DefaultHeroDropDown");
        }
        if (dropdown && dropdown.style) {
            dropdown.style.width = (configId === "VOICE_TYPE")
                ? "150px"
                : ((configId === "LANGUAGE") ? "130px" : "150px");
        }
        var syncDefaultHeroIcon = function(heroValue) {
            if (!defaultHeroIconPanel || !defaultHeroIconPanel.IsValid || !defaultHeroIconPanel.IsValid()) return;
            try { defaultHeroIconPanel.SetImage(GetDefaultHeroIconPath(heroValue)); } catch (eHeroIcon) {}
        };
        var syncLanguageIcon = function(languageValue) {
            if (!languageIconPanel || !languageIconPanel.IsValid || !languageIconPanel.IsValid()) return;
            try { languageIconPanel.SetImage(GetLanguageIconPath(languageValue)); } catch (eLanguageIcon) {}
        };

        var valueByOptionId = {};
        var optionIdByValueKey = {};
        var selectedOptionId = "";
        var selectedConfigValue = MOD_CONFIG[configId];
        var selectedConfigValueKey = String(selectedConfigValue === undefined || selectedConfigValue === null ? "" : selectedConfigValue);
        for (var oi = 0; oi < options.length; oi++) {
            var opt = options[oi] || {};
            var optionValue = (opt.value !== undefined && opt.value !== null)
                ? opt.value
                : String(opt.label || "");
            var optionValueKey = String(optionValue === undefined || optionValue === null ? "" : optionValue);
            if (!optionValueKey || optionValueKey.length === 0) continue;
            var optionId = String(configId || "dropdown") + "_opt_" + String(oi);
            var optionPanel = $.CreatePanel("Label", dropdown, optionId);
            optionPanel.AddClass("QOLSettingsDropDownItem");
            optionPanel.AddClass("DropDownChild");
            if (configId === "DEFAULT_HERO") {
                optionPanel.AddClass("DefaultHeroDropDownItem");
                try { optionPanel.style.backgroundImage = 'url("' + GetDefaultHeroIconPath(optionValueKey) + '")'; } catch (eBgImg) {}
                try { optionPanel.style.backgroundRepeat = "no-repeat"; } catch (eBgRepeat) {}
                try { optionPanel.style.backgroundPosition = "10px 50%"; } catch (eBgPos) {}
                try { optionPanel.style.backgroundSize = "18px 18px"; } catch (eBgSize) {}
            } else if (configId === "LANGUAGE") {
                optionPanel.AddClass("LanguageDropDownItem");
                try { optionPanel.style.backgroundImage = 'url("' + GetLanguageIconPath(optionValueKey) + '")'; } catch (eLangBgImg) {}
                try { optionPanel.style.backgroundRepeat = "no-repeat"; } catch (eLangBgRepeat) {}
                try { optionPanel.style.backgroundPosition = "10px 50%"; } catch (eLangBgPos) {}
                try { optionPanel.style.backgroundSize = "18px 18px"; } catch (eLangBgSize) {}
                (function(optionIdRef, optionValueRef) {
                    optionPanel.SetPanelEvent("onactivate", function() {
                        suppressNextDropdownSubmit = true;
                        selectedOptionId = optionIdRef;
                        $.Schedule(0, function() {
                            commitDropdownSelection(optionValueRef);
                        });
                    });
                })(optionId, optionValue);
            }
            optionPanel.text = String(opt.label !== undefined && opt.label !== null ? opt.label : optionValueKey);
            if (optionPanel.SetAttributeString) {
                optionPanel.SetAttributeString("data_value", optionValueKey);
            }

            if (configId === "VOICE_TYPE") {
                (function(optionPanelRef, optionValueRef, rowAnchorRef) {
                    var customSlotIndex = GetCustomAnnouncerSlotIndexFromOptionValue(optionValueRef);
                    if (customSlotIndex <= 0) return;
                    optionPanelRef.SetPanelEvent("onmouseover", function() {
                        HideSettingsTextTooltip();
                        CancelSettingsRowFloatingTooltipHide();
                        ShowSettingsRowFloatingTooltip(
                            rowAnchorRef,
                            "",
                            "",
                            PERF_IMPACT_TIER_NONE,
                            "",
                            { voiceMeta: BuildCustomAnnouncerSlotMetadataHoverInfo(customSlotIndex) }
                        );
                    });
                    optionPanelRef.SetPanelEvent("onmouseout", function() {
                        HideSettingsRowFloatingTooltipDeferred("voice_dropdown_option_mouseout");
                    });
                })(optionPanel, optionValue, row);
            }

            dropdown.AddOption(optionPanel);
            valueByOptionId[optionId] = optionValue;
            optionIdByValueKey[optionValueKey] = optionId;
            if (!selectedOptionId && selectedConfigValueKey === optionValueKey) {
                selectedOptionId = optionId;
            }
        }

        var firstOptionId = "";
        for (var optionKey in valueByOptionId) {
            firstOptionId = optionKey;
            break;
        }
        if (!selectedOptionId) selectedOptionId = firstOptionId;
        if (selectedOptionId) {
            try { dropdown.SetSelected(selectedOptionId); } catch (e0) {}
            if (MOD_CONFIG[configId] === undefined || MOD_CONFIG[configId] === null || MOD_CONFIG[configId] === "") {
                MOD_CONFIG[configId] = valueByOptionId[selectedOptionId];
            }
        }
        if (configId === "DEFAULT_HERO") {
            syncDefaultHeroIcon(MOD_CONFIG[configId]);
        } else if (configId === "LANGUAGE") {
            syncLanguageIcon(MOD_CONFIG[configId]);
        }

        var dropdownSyncMute = false;
        var suppressNextDropdownSubmit = false;
        var commitDropdownSelection = function(forcedValue) {
            if (dropdownSyncMute) return;
            if (suppressNextDropdownSubmit && (forcedValue === undefined || forcedValue === null || String(forcedValue).length <= 0)) {
                suppressNextDropdownSubmit = false;
                return;
            }
            var selectedValue;
            var hasSelectedValue = false;
            if (forcedValue !== undefined && forcedValue !== null && String(forcedValue).length > 0) {
                selectedValue = forcedValue;
                hasSelectedValue = true;
            } else {
                var selectedPanel = null;
                try { selectedPanel = dropdown.GetSelected ? dropdown.GetSelected() : null; } catch (e1) { selectedPanel = null; }
                if (selectedPanel) {
                    var selectedId = "";
                    try { selectedId = selectedPanel.id ? String(selectedPanel.id) : ""; } catch (e2) { selectedId = ""; }
                    if (selectedId) selectedOptionId = selectedId;
                    if (selectedId && valueByOptionId.hasOwnProperty(selectedId)) {
                        selectedValue = valueByOptionId[selectedId];
                        hasSelectedValue = true;
                    }
                    if (!hasSelectedValue && selectedPanel.GetAttributeString) {
                        try { selectedValue = String(selectedPanel.GetAttributeString("data_value", "") || ""); } catch (e3) { selectedValue = ""; }
                        hasSelectedValue = (selectedValue !== undefined && selectedValue !== null && String(selectedValue).length > 0);
                    }
                }
            }
            if (!hasSelectedValue && selectedOptionId && valueByOptionId.hasOwnProperty(selectedOptionId)) {
                selectedValue = valueByOptionId[selectedOptionId];
                hasSelectedValue = true;
            }
            if (!hasSelectedValue) return;

            var currentValue = MOD_CONFIG[configId];
            if (typeof currentValue === "number") {
                var asNumber = Number(selectedValue);
                if (!isFinite(asNumber)) return;
                selectedValue = Math.round(asNumber);
            }

            var selectionChanged = String(currentValue === undefined || currentValue === null ? "" : currentValue) !==
                String(selectedValue === undefined || selectedValue === null ? "" : selectedValue);
            if (configId === "DEFAULT_HERO") {
                ApplyDefaultHeroSelection(String(selectedValue || ""));
            } else if (configId === "HEALTHBAR_TYPE") {
                var previousTypeValue = currentValue;
                ApplyHealthbarTypeSelection(selectedValue);
                selectedValue = MOD_CONFIG.HEALTHBAR_TYPE;
                selectionChanged = String(previousTypeValue === undefined || previousTypeValue === null ? "" : previousTypeValue) !==
                    String(selectedValue === undefined || selectedValue === null ? "" : selectedValue);
            }
            if (selectionChanged) {
                MOD_CONFIG[configId] = selectedValue;
                SaveAndSync();
                refreshRowChangedState();
                if (configId === "DEFAULT_HERO") {
                    syncDefaultHeroIcon(selectedValue);
                } else if (configId === "LANGUAGE") {
                    syncLanguageIcon(selectedValue);
                }
                if (configId === "LANGUAGE") {
                    var rootPanel = $.GetContextPanel();
                    var tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
                    var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                    InvalidateSearchSectionIndexCache();
                    SyncTabActiveStates(tabBar);
                    if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                        RequestSettingsListRefresh(0, false);
                    }
                }
            } else if (configId === "DEFAULT_HERO") {
                syncDefaultHeroIcon(selectedValue);
            }
        };
        if (configId === "LANGUAGE") {
            dropdown.SetPanelEvent("oninputsubmit", function() {});
        } else {
            dropdown.SetPanelEvent("oninputsubmit", commitDropdownSelection);
        }

        if (configId === "VOICE_TYPE" && dropdownParent && dropdownParent.IsValid && dropdownParent.IsValid()) {
            var voiceTestBtn = $.CreatePanel("Button", dropdownParent, "VoiceDropdownTestBtn");
            voiceTestBtn.AddClass("SectionTitleActionBtn");
            voiceTestBtn.AddClass("VoiceDropdownTestBtn");

            var voiceTestIcon = $.CreatePanel("Image", voiceTestBtn, "VoiceDropdownTestBtnIcon", {
                src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
            voiceTestIcon.AddClass("SectionTitleActionIcon");

            var voiceTestLabel = $.CreatePanel("Label", voiceTestBtn, "VoiceDropdownTestBtnLabel");
            voiceTestLabel.AddClass("SectionTitleActionLabel");
            voiceTestLabel.text = "";

            var voiceTestTooltipText = LocalizeSettingsText("Play current announcer voice.", true);
            voiceTestBtn.SetPanelEvent("onmouseover", function() {
                HideSettingsTextTooltip();
                CancelSettingsRowFloatingTooltipHide();
                ShowSettingsRowFloatingTooltip(
                    voiceTestBtn,
                    "",
                    voiceTestTooltipText,
                    PERF_IMPACT_TIER_NONE,
                    ""
                );
            });
            voiceTestBtn.SetPanelEvent("onmouseout", function() {
                HideSettingsRowFloatingTooltipDeferred("voice_test_btn_mouseout");
            });
            voiceTestBtn.SetPanelEvent("onactivate", function() {
                PlayAnnouncerPreviewSound();
                voiceTestBtn.AddClass("SuccessState");
                $.Schedule(0.28, function() {
                    if (voiceTestBtn && voiceTestBtn.IsValid && voiceTestBtn.IsValid()) {
                        voiceTestBtn.RemoveClass("SuccessState");
                    }
                });
            });
        }
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            var currentValueKey = String(MOD_CONFIG[configId] === undefined || MOD_CONFIG[configId] === null ? "" : MOD_CONFIG[configId]);
            var targetOptionId = optionIdByValueKey[currentValueKey] || firstOptionId;
            if (targetOptionId) {
                selectedOptionId = targetOptionId;
                dropdownSyncMute = true;
                try { dropdown.SetSelected(targetOptionId); } catch (eSel) {}
                dropdownSyncMute = false;
            }
            if (configId === "DEFAULT_HERO") {
                syncDefaultHeroIcon(MOD_CONFIG[configId]);
            } else if (configId === "LANGUAGE") {
                syncLanguageIcon(MOD_CONFIG[configId]);
            }
            refreshRowChangedState();
            return true;
        };
    } else if (type === "preset" && Array.isArray(options)) {
        var group = $.CreatePanel("Panel", row, "");
        group.AddClass("SettingButtonGroup");
        group.AddClass("SettingControlRoot");
        options.forEach(function(opt) {
            var btn = $.CreatePanel("Button", group, "");
            btn.AddClass("SegmentBtn");
            var btnLbl = $.CreatePanel("Label", btn, "");
            btnLbl.text = opt.label;
            btn.SetPanelEvent("onactivate", function() {
                var presetData = opt.label === "Default" ? DEFAULT_CONFIG : PRESETS[opt.label];
                if (ApplyPresetConfig(presetData)) {
                    SaveAndSync();
                    btn.AddClass("SuccessState");
                    $.Schedule(0.28, function() {
                        if (btn.IsValid()) btn.RemoveClass("SuccessState");
                        RequestSettingsListSoftRefresh(0);
                    });
                }
            });
        });
    } else if (type === "actionbutton") {
        var actionConfig = (Array.isArray(options) && options.length > 0) ? options[0] : {};
        var isArcadePlayAction = (
            configId === "OPEN_MINESWEEPER" ||
            configId === "OPEN_FLAPPY_BIRD" ||
            configId === "OPEN_AIM_TRAINER" ||
            configId === "OPEN_TRAIN_TRACKING" ||
            configId === "OPEN_WHACK_A_REM" ||
            configId === "OPEN_BLACKJACK"
        );
        var actionGroup = $.CreatePanel("Panel", row, "");
        actionGroup.AddClass("SettingActionGroup");
        actionGroup.AddClass("SettingControlRoot");
        if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
            actionGroup.AddClass("OptimizeFiltersActionGroup");
        }
        if (isArcadePlayAction) {
            actionGroup.AddClass("ArcadePlayActionGroup");
        }

        var actionBtn = $.CreatePanel("Button", actionGroup, "");
        actionBtn.AddClass("SettingActionBtn");
        if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
            actionBtn.AddClass("OptimizeFiltersActionBtn");
        }
        if (isArcadePlayAction) {
            actionBtn.AddClass("ArcadePlayActionBtn");
        } else if (configId === "TEST_AIRHEART") {
            actionBtn.AddClass("TestAirheartActionBtn");
        }
        var actionInner = $.CreatePanel("Panel", actionBtn, "");
        actionInner.AddClass("SettingActionBtnInner");

        var iconSrc = actionConfig.icon || "";
        if (iconSrc !== "") {
            var actionIcon = $.CreatePanel("Image", actionInner, "", {
                src: iconSrc,
                defaultsrc: "",
                scaling: "contain"
            });
            actionIcon.AddClass("SettingActionBtnIcon");
        }

        var actionLbl = $.CreatePanel("Label", actionInner, "");
        actionLbl.AddClass("SettingActionBtnLabel");
        actionLbl.text = LocalizeSettingsText(actionConfig.label || "Test");

        if (isArcadePlayAction && actionConfig.onDeathCheckbox) {
            var onDeathConfigKey = String(actionConfig.onDeathConfigKey || "");
            if (!onDeathConfigKey) onDeathConfigKey = "ENABLE_ON_DEATH_GAMES";
            var onDeathToggleBtn = $.CreatePanel("ToggleButton", actionGroup, "");
            onDeathToggleBtn.AddClass("CitadelSettingsCheckbox");
            onDeathToggleBtn.AddClass("MultiCheckboxBtn");
            onDeathToggleBtn.AddClass("ArcadeOnDeathCheckBtn");

            var onDeathLbl = $.CreatePanel("Label", onDeathToggleBtn, "");
            onDeathLbl.AddClass("MultiCheckboxLabel");
            onDeathLbl.AddClass("ArcadeOnDeathCheckLabel");
            onDeathLbl.text = LocalizeSettingsText("On Death");

            var syncOnDeathToggleVisual = function() {
                if (!onDeathToggleBtn || !onDeathToggleBtn.IsValid || !onDeathToggleBtn.IsValid()) return false;
                var enabled = (Number(MOD_CONFIG[onDeathConfigKey]) === 1);
                try { onDeathToggleBtn.SetSelected(enabled); } catch (eSel0) {}
                onDeathToggleBtn.SetHasClass("selected", enabled);
                onDeathToggleBtn.SetHasClass("IsSelected", enabled);
                onDeathToggleBtn.SetHasClass("Active", enabled);
                return true;
            };
            syncOnDeathToggleVisual();
            gArcadeOnDeathSyncFns.push(syncOnDeathToggleVisual);

            onDeathToggleBtn.SetPanelEvent("onactivate", function() {
                MOD_CONFIG[onDeathConfigKey] = (Number(MOD_CONFIG[onDeathConfigKey]) === 1) ? 0 : 1;
                SaveAndSync();
                for (var iSync = gArcadeOnDeathSyncFns.length - 1; iSync >= 0; iSync--) {
                    var syncFn = gArcadeOnDeathSyncFns[iSync];
                    var keep = true;
                    if (typeof syncFn !== "function") {
                        keep = false;
                    } else {
                        try { keep = (syncFn() !== false); } catch (eSync) { keep = false; }
                    }
                    if (!keep) gArcadeOnDeathSyncFns.splice(iSync, 1);
                }
            });
        }

        if (actionConfig.tooltip) {
            var localizedTooltip = LocalizeSettingsText(actionConfig.tooltip);
            actionBtn.SetPanelEvent("onmouseover", function() {
                $.DispatchEvent("UIShowTextTooltip", actionBtn, localizedTooltip);
            });
            actionBtn.SetPanelEvent("onmouseout", function() {
                $.DispatchEvent("UIHideTextTooltip");
            });
        }

        actionBtn.SetPanelEvent("onactivate", function() {
            var handled = false;
            if (configId === "PREVIEW_ANNOUNCER") {
                PlayAnnouncerPreviewSound();
                handled = true;
            } else if (configId === "OPEN_MINESWEEPER") {
                OpenMinesweeperModal();
                handled = true;
            } else if (configId === "OPEN_FLAPPY_BIRD") {
                OpenFlappyModal();
                handled = true;
            } else if (configId === "OPEN_AIM_TRAINER") {
                OpenAimTrainerModal();
                handled = true;
            } else if (configId === "OPEN_TRAIN_TRACKING") {
                OpenTrainTrackingModal();
                handled = true;
            } else if (configId === "OPEN_WHACK_A_REM") {
                OpenWhackRemModal();
                handled = true;
            } else if (configId === "OPEN_BLACKJACK") {
                OpenBlackjackModal();
                handled = true;
            } else if (configId === "TEST_AIRHEART") {
                handled = ApplyDefaultHeroSelection("hero_airheart");
                if (handled) {
        SetLocalizedConfigFeedbackMessage("Airheart switch sent.", "success", 1400);
                } else {
        SetLocalizedConfigFeedbackMessage("Failed to switch hero.", "error", 1800);
                    actionBtn.AddClass("FailureState");
                    $.Schedule(0.35, function() {
                        if (actionBtn && actionBtn.IsValid && actionBtn.IsValid()) actionBtn.RemoveClass("FailureState");
                    });
                }
            } else if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
                OpenOptimizeFilterDownloadModal();
                handled = true;
            } else if (configId && configId.indexOf("SEARCH_PRESET:") === 0) {
                var presetName = configId.slice("SEARCH_PRESET:".length);
                handled = ApplyPresetByName(presetName);
            } else if (configId === "SEARCH_ACTION:OPEN_COMMISSION_MODAL") {
                OpenSupportCommissionModal();
                handled = true;
            } else if (configId && configId.indexOf("SEARCH_TAB:") === 0) {
                var targetTab = configId.slice("SEARCH_TAB:".length);
                if (targetTab) {
                    var rootPanel = $.GetContextPanel();
                    ClearSettingsSearchQuery(rootPanel);
                    if (currentTab === targetTab) {
                        var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                        if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                            RequestSettingsListRefresh(0, false);
                        }
                    } else {
                        SetActiveTabAndRefresh(targetTab);
                    }
                    handled = true;
                }
            }
            if (!handled) return;
            actionBtn.AddClass("SuccessState");
            $.Schedule(0.28, function() {
                if (actionBtn.IsValid()) actionBtn.RemoveClass("SuccessState");
            });
        });
    } else if (type === "runtime_toggle") {
        var runtimeConfig = (Array.isArray(options) && options.length > 0) ? options[0] : {};
        var runtimeKey = runtimeConfig.key || configId || label || "runtime_toggle";
        if (!gRuntimeToggleState.hasOwnProperty(runtimeKey)) {
            gRuntimeToggleState[runtimeKey] = false;
        }
        var runtimeBtn = $.CreatePanel("Panel", row, "");
        runtimeBtn.AddClass("SettingToggleBtn");
        runtimeBtn.AddClass("SettingControlRoot");
        var runtimeSwitchButton = $.CreatePanel("Button", runtimeBtn, "");
        runtimeSwitchButton.AddClass("SwitchButton");
        var runtimeHandle = $.CreatePanel("Panel", runtimeSwitchButton, "handle");
        runtimeHandle.AddClass("SettingToggleHandle");
        var setRuntimeSwitchState = function(isOn) {
            runtimeBtn.SetHasClass("ToggleActive", isOn === true);
            runtimeBtn.SetHasClass("ToggleOn", isOn === true);
            runtimeBtn.SetHasClass("ToggleOff", isOn !== true);
        };
        var updateRuntimeBtn = function() {
            setRuntimeSwitchState(gRuntimeToggleState[runtimeKey] === true);
        };
        updateRuntimeBtn();
        var activateRuntimeToggle = function() {
            var nextState = !gRuntimeToggleState[runtimeKey];
            gRuntimeToggleState[runtimeKey] = nextState;
            updateRuntimeBtn();
            var commandToRun = nextState ? runtimeConfig.onCommand : runtimeConfig.offCommand;
            RunConsoleCommandBestEffort(commandToRun || "");
        };
        runtimeSwitchButton.SetPanelEvent("onactivate", activateRuntimeToggle);
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            updateRuntimeBtn();
            refreshRowChangedState();
            return true;
        };
    } else {
        var toggleConfig = null;
        if (Array.isArray(options) && options.length > 0 && options[0] && typeof options[0] === "object") {
            toggleConfig = options[0];
        } else if (options && typeof options === "object") {
            toggleConfig = options;
        }
        var invertToggle = !!(toggleConfig && toggleConfig.invert === true);
        var getToggleIsActive = function() {
            var baseState = (MOD_CONFIG[configId] === 1);
            return invertToggle ? !baseState : baseState;
        };
        var initialToggleActive = getToggleIsActive();
        var btn = $.CreatePanel("Panel", row, "");
        btn.AddClass("SettingToggleBtn");
        btn.AddClass("SettingControlRoot");
        var setSwitchState = function(isOn) {
            btn.SetHasClass("ToggleActive", isOn === true);
            btn.SetHasClass("ToggleOn", isOn === true);
            btn.SetHasClass("ToggleOff", isOn !== true);
        };
        // Set initial class state before handle panel is created so search results do not replay off->on motion.
        setSwitchState(initialToggleActive);
        var switchButton = $.CreatePanel("Button", btn, "");
        switchButton.AddClass("SwitchButton");
        var handlePanel = $.CreatePanel("Panel", switchButton, "handle");
        handlePanel.AddClass("SettingToggleHandle");
        var update = function() { setSwitchState(getToggleIsActive()); };
        // For normal tab rendering we can still sync once after construction.
        if (!gSearchResultRenderMode) update();
        var activateToggle = function() {
            var nextActive = !getToggleIsActive();
            MOD_CONFIG[configId] = invertToggle ? (nextActive ? 0 : 1) : (nextActive ? 1 : 0);
            update();
            if (configId === "PREVIEWS_ENABLED" && MOD_CONFIG[configId] !== 1) {
                HideMinimapSizePreview();
            }
            if (configId === "DRAG_ENABLED") {
                var settingsWindow = $.GetContextPanel().FindChildTraverse("SettingsWindow");
                if (settingsWindow && settingsWindow.IsValid && settingsWindow.IsValid()) {
                    SetupSettingsWindowDragging(settingsWindow.FindChildTraverse("SettingsHeader"), settingsWindow);
                }
            }
            SaveAndSync();
            refreshRowChangedState();
            if (configId === "ENABLE_OLD_ITEM_COOLDOWNS") {
                RequestSettingsListRefresh(0, true);
            }
            ShowConfigPreviewForConfigId(configId);
        };
        switchButton.SetPanelEvent("onactivate", activateToggle);
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            update();
            refreshRowChangedState();
            return true;
        };
    }
    RegisterSettingsListRowSync(function() {
        return syncRowVisualState();
    });
    return row;
}

function CreateInlineSecondaryCheckboxToggleRow(parent, label, configId, secondaryLabel, secondaryConfigId, description, secondaryDescription) {
    var localizedLabel = LocalizeSettingsText(label || "");
    var effectiveDescription = GetSettingDescriptionOverride(
        configId,
        label,
        description || "",
        GetCurrentSettingsCategoryKey()
    );
    var localizedDescription = LocalizeSettingsText(effectiveDescription || "");
    var hasRowDescription = !!(effectiveDescription && effectiveDescription !== "" && localizedDescription && localizedDescription !== "");
    var mainPerfInfo = BuildPerfImpactTooltipLine(configId, "toggle", null);
    var secondaryPerfInfo = BuildPerfImpactTooltipLine(secondaryConfigId, "toggle", null);
    var rowPerfTier = PERF_IMPACT_TIER_NONE;
    if (mainPerfInfo && mainPerfInfo.tier) rowPerfTier = MaxPerfImpactTier(rowPerfTier, String(mainPerfInfo.tier));
    if (secondaryPerfInfo && secondaryPerfInfo.tier) rowPerfTier = MaxPerfImpactTier(rowPerfTier, String(secondaryPerfInfo.tier));
    var rowCreatedBy = GetSettingCreatedBy(configId, label);
    var rowTooltipPerfLine = BuildPerfImpactLineForTier(rowPerfTier);
    var rowTooltipDescLine = hasRowDescription ? localizedDescription : "";
    var hasRowTooltip = HasMeaningfulFloatingTooltipContent(rowPerfTier, rowTooltipDescLine, rowCreatedBy);
    if (gSearchCollectMode && gSearchCollectState) {
        GetActiveSearchCollectSection().rows.push(BuildSearchCollectedRow(
            localizedLabel,
            configId,
            "toggle",
            null,
            null,
            null,
            [{ inlineSecondaryCheckbox: secondaryConfigId || "" }],
            localizedDescription,
            [LocalizeSettingsText(secondaryLabel || ""), secondaryConfigId || "", secondaryDescription || ""]
        ));
        return null;
    }

    var row = $.CreatePanel("Panel", parent, "");
    if (gSearchResultRenderMode) row.AddClass("SearchResultRow");
    row.AddClass("SettingRow");
    row.AddClass("RowTypeToggle");
    row.AddClass("InlineSecondaryCheckboxRow");

    var labelContainer = $.CreatePanel("Panel", row, "");
    labelContainer.AddClass("LabelContainer");
    var lbl = $.CreatePanel("Label", labelContainer, "");
    lbl.AddClass("SettingLabel");
    lbl.text = localizedLabel;

    var rowConfigKeys = [];
    if (configId) rowConfigKeys.push(configId);
    if (secondaryConfigId) rowConfigKeys.push(secondaryConfigId);
    if (row && row.SetAttributeString) {
        try { row.SetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, rowConfigKeys.join(",")); } catch (e0) {}
    }

    var rowResetBtn = null;
    if (rowConfigKeys.length > 0) {
        rowResetBtn = $.CreatePanel("Button", labelContainer, "");
        rowResetBtn.AddClass("SettingRowResetBtn");
        var rowResetIcon = $.CreatePanel("Image", rowResetBtn, "", {
            src: "s2r://panorama/images/icons/icon_refresh.vsvg",
            defaultsrc: "",
            scaling: "contain"
        });
        rowResetIcon.AddClass("SettingRowResetIcon");
        rowResetIcon.AddClass("QOLResetIcon");
        try { rowResetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (eImg) {}
        rowResetBtn.SetPanelEvent("onmouseover", function() {
            HideSettingsTextTooltip();
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(
                rowResetBtn,
                "",
                LocalizeSettingsText("Reset row to defaults", true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        });
        rowResetBtn.SetPanelEvent("onmouseout", function() {
            HideSettingsTextTooltip();
            HideSettingsRowFloatingTooltipDeferred("row_reset_btn_mouseout");
        });
        rowResetBtn.SetPanelEvent("onactivate", function() {
            var changedCount = ApplyResetForConfigKeys(rowConfigKeys);
            if (changedCount > 0) {
                SaveAndSync();
                syncRowVisualState();
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 (" + String(changedCount) + ").")
                    : ("Row reset (" + String(changedCount) + ")."), "success", 1400);
            } else {
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? "\u0421\u0442\u0440\u043E\u043A\u0430 \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                    : "Row already at defaults.", "info", 1200);
            }
        });
    }

    var refreshRowChangedState = BindRowChangedState(row, labelContainer, rowConfigKeys, rowResetBtn);
    var showCustomRowTooltip = function() {};
    var hideCustomRowTooltip = function() {};
    if (hasRowTooltip) {
        showCustomRowTooltip = function() {
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(row, rowTooltipPerfLine, rowTooltipDescLine, rowPerfTier, rowCreatedBy);
        };
        hideCustomRowTooltip = function() {
            HideSettingsRowFloatingTooltipDeferred("row_mouseout");
        };
        row.SetPanelEvent("onmouseover", function() {
            showCustomRowTooltip();
        });
        row.SetPanelEvent("onmouseout", function() {
            hideCustomRowTooltip();
        });
    }

    var controls = $.CreatePanel("Panel", row, "");
    controls.AddClass("SettingControlRoot");
    controls.AddClass("InlineSecondaryCheckboxControls");

    var btn = $.CreatePanel("Panel", controls, "");
    btn.AddClass("SettingToggleBtn");
    btn.AddClass("TogglePrimary");
    var setSwitchState = function(isOn) {
        btn.SetHasClass("ToggleActive", isOn === true);
        btn.SetHasClass("ToggleOn", isOn === true);
        btn.SetHasClass("ToggleOff", isOn !== true);
    };
    var switchButton = $.CreatePanel("Button", btn, "");
    switchButton.AddClass("SwitchButton");
    var handlePanel = $.CreatePanel("Panel", switchButton, "handle");
    handlePanel.AddClass("SettingToggleHandle");

    var checkboxWrap = $.CreatePanel("Panel", controls, "");
    checkboxWrap.AddClass("InlineSecondaryCheckboxWrap");
    var secondaryBtn = $.CreatePanel("Button", checkboxWrap, "");
    secondaryBtn.AddClass("InlineSecondaryCheckboxBtn");
    secondaryBtn.AddClass("CitadelSettingsCheckbox");
    secondaryBtn.AddClass("MultiCheckboxBtn");
    var tickBox = $.CreatePanel("Panel", secondaryBtn, "");
    tickBox.AddClass("TickBox");
    var secondaryLbl = $.CreatePanel("Label", secondaryBtn, "");
    secondaryLbl.AddClass("InlineSecondaryCheckboxLabel");
    secondaryLbl.AddClass("MultiCheckboxLabel");
    secondaryLbl.text = LocalizeSettingsText(secondaryLabel || "");

    var update = function() {
        var mainEnabled = (MOD_CONFIG[configId] === 1);
        var secondaryEnabled = (MOD_CONFIG[secondaryConfigId] === 1);
        setSwitchState(mainEnabled);
        checkboxWrap.SetHasClass("Disabled", !mainEnabled);
        secondaryBtn.enabled = mainEnabled;
        secondaryBtn.SetHasClass("selected", secondaryEnabled);
        secondaryBtn.SetHasClass("Active", secondaryEnabled);
    };

    switchButton.SetPanelEvent("onactivate", function() {
        MOD_CONFIG[configId] = (MOD_CONFIG[configId] === 1) ? 0 : 1;
        update();
        SaveAndSync();
        refreshRowChangedState();
        ShowConfigPreviewForConfigId(configId);
    });
    secondaryBtn.SetPanelEvent("onactivate", function() {
        if (MOD_CONFIG[configId] !== 1) return;
        MOD_CONFIG[secondaryConfigId] = (MOD_CONFIG[secondaryConfigId] === 1) ? 0 : 1;
        update();
        SaveAndSync();
        refreshRowChangedState();
        ShowConfigPreviewForConfigId(secondaryConfigId);
    });

    var syncRowVisualState = function() {
        if (!row || !row.IsValid || !row.IsValid()) return false;
        update();
        refreshRowChangedState();
        return true;
    };
    update();
    RegisterSettingsListRowSync(function() {
        return syncRowVisualState();
    });
    return row;
}

function ApplyPresetConfig(presetData) {
    if (!presetData) return false;

    // Keep UI-only settings untouched by preset swaps.
    var preservedDragEnabled = MOD_CONFIG.DRAG_ENABLED;
    var preservedPreviewsEnabled = MOD_CONFIG.PREVIEWS_ENABLED;
    var preservedLanguage = MOD_CONFIG.LANGUAGE;
    var preservedDefaultHero = MOD_CONFIG.DEFAULT_HERO;

    for (var key in DEFAULT_CONFIG) {
        MOD_CONFIG[key] = DEFAULT_CONFIG[key];
    }
    for (var presetKey in presetData) {
        MOD_CONFIG[presetKey] = presetData[presetKey];
    }
    NormalizeNeutralCampFlags(MOD_CONFIG, presetData);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, presetData);
    NormalizeAmmoScaleConfig(MOD_CONFIG, presetData);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, presetData);
    NormalizeColorWarningConfig(MOD_CONFIG, presetData);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, presetData);

    MOD_CONFIG.DRAG_ENABLED = preservedDragEnabled;
    MOD_CONFIG.PREVIEWS_ENABLED = preservedPreviewsEnabled;
    MOD_CONFIG.LANGUAGE = preservedLanguage;
    MOD_CONFIG.DEFAULT_HERO = preservedDefaultHero;
    return true;
}

function ApplyPresetByName(presetName) {
    var presetData = presetName === "Default" ? DEFAULT_CONFIG : PRESETS[presetName];
    if (!ApplyPresetConfig(presetData)) return false;
    SetRuntimePresetName(presetName);
    SaveAndSync();
    return true;
}

var gPresetButtonRegistry = {};
var gPresetButtonOrder = [];
var gPresetHighlightPollToken = 0;
var gPresetHighlightPollRunning = false;
var gPresetHighlightRefreshToken = 0;
var PRESET_MATCH_EXCLUDED_KEYS = {
    DRAG_ENABLED: 1,
    PREVIEWS_ENABLED: 1,
    LANGUAGE: 1,
    DEFAULT_HERO: 1
};

function ResetPresetButtonRegistry() {
    gPresetButtonRegistry = {};
    gPresetButtonOrder = [];
}

function RegisterPresetButton(presetName, button, labelPanel, originalText) {
    if (!presetName || !button || !labelPanel) return;
    gPresetButtonRegistry[presetName] = {
        button: button,
        label: labelPanel,
        text: originalText || presetName
    };
    gPresetButtonOrder.push(presetName);
}

function ResolvePresetConfigByName(presetName) {
    if (!presetName) return null;
    if (presetName !== "Default" && !PRESETS.hasOwnProperty(presetName)) return null;

    var resolved = {};
    for (var key in DEFAULT_CONFIG) {
        resolved[key] = DEFAULT_CONFIG[key];
    }
    if (presetName !== "Default") {
        var presetData = PRESETS[presetName];
        for (var presetKey in presetData) {
            resolved[presetKey] = presetData[presetKey];
        }
        NormalizeNeutralCampFlags(resolved, presetData);
        NormalizeItemCooldownModeConfig(resolved, presetData);
        NormalizeAmmoScaleConfig(resolved, presetData);
        NormalizeVoiceTypeConfig(resolved);
        NormalizeHealthbarTypeConfig(resolved, presetData);
        NormalizeColorWarningConfig(resolved, presetData);
        NormalizeEnemyColorWarningConfig(resolved, presetData);
    } else {
        NormalizeNeutralCampFlags(resolved, resolved);
        NormalizeItemCooldownModeConfig(resolved, resolved);
        NormalizeAmmoScaleConfig(resolved, resolved);
        NormalizeVoiceTypeConfig(resolved);
        NormalizeHealthbarTypeConfig(resolved, resolved);
        NormalizeColorWarningConfig(resolved, resolved);
        NormalizeEnemyColorWarningConfig(resolved, resolved);
    }
    return resolved;
}

function IsPresetValueMatch(currentValue, presetValue) {
    if (typeof currentValue === "number" && typeof presetValue === "number") {
        return Math.abs(currentValue - presetValue) <= 0.0001;
    }
    return currentValue === presetValue;
}

function DoesCurrentConfigMatchPreset(presetName) {
    var resolved = ResolvePresetConfigByName(presetName);
    if (!resolved) return false;

    for (var key in resolved) {
        if (PRESET_MATCH_EXCLUDED_KEYS[key]) continue;
        if (!MOD_CONFIG.hasOwnProperty(key)) continue;
        if (!IsPresetValueMatch(MOD_CONFIG[key], resolved[key])) {
            return false;
        }
    }
    return true;
}

function RefreshActivePresetHighlight() {
    var matchedPreset = null;
    for (var i = 0; i < gPresetButtonOrder.length; i++) {
        var presetName = gPresetButtonOrder[i];
        var entry = gPresetButtonRegistry[presetName];
        if (!entry || !entry.button || !entry.button.IsValid || !entry.button.IsValid()) continue;
        if (matchedPreset === null && DoesCurrentConfigMatchPreset(presetName)) {
            matchedPreset = presetName;
        }
    }

    var runtimePreset = GetRuntimePresetName();
    if (runtimePreset) {
        var runtimeEntry = gPresetButtonRegistry[runtimePreset];
        if (
            runtimeEntry &&
            runtimeEntry.button &&
            runtimeEntry.button.IsValid &&
            runtimeEntry.button.IsValid() &&
            DoesCurrentConfigMatchPreset(runtimePreset)
        ) {
            matchedPreset = runtimePreset;
        }
    }

    for (var j = 0; j < gPresetButtonOrder.length; j++) {
        var name = gPresetButtonOrder[j];
        var reg = gPresetButtonRegistry[name];
        if (!reg || !reg.button || !reg.button.IsValid || !reg.button.IsValid()) continue;
        reg.button.SetHasClass("PresetActive", name === matchedPreset);
    }
}

function IsSettingsWindowVisible() {
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    return !!(win && win.IsValid && win.IsValid() && win.BHasClass && win.BHasClass("Visible"));
}

function ShouldRunPresetHighlightPolling() {
    return IsSettingsWindowVisible() && currentTab === "Presets" && !currentSearchQuery && gPresetButtonOrder.length > 0;
}

function StopPresetHighlightPolling() {
    gPresetHighlightPollToken += 1;
    gPresetHighlightPollRunning = false;
}

function StartPresetHighlightPolling() {
    if (gPresetHighlightPollRunning) return;
    gPresetHighlightPollRunning = true;
    var token = ++gPresetHighlightPollToken;
    var poll = function() {
        if (token !== gPresetHighlightPollToken) return;
        var panel = $.GetContextPanel();
        if (!panel || !panel.IsValid || !panel.IsValid()) {
            gPresetHighlightPollRunning = false;
            return;
        }
        if (!ShouldRunPresetHighlightPolling()) {
            gPresetHighlightPollRunning = false;
            return;
        }
        RefreshActivePresetHighlight();
        $.Schedule(1.0, poll);
    };
    $.Schedule(0.1, poll);
}

function UpdatePresetHighlightPollingState() {
    if (ShouldRunPresetHighlightPolling()) {
        StartPresetHighlightPolling();
    } else {
        StopPresetHighlightPolling();
    }
}

function QueueActivePresetHighlightRefresh(delaySec) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0.01;
    var token = ++gPresetHighlightRefreshToken;
    $.Schedule(delay, function() {
        if (token !== gPresetHighlightRefreshToken) return;
        if (currentTab === "Presets" && gPresetButtonOrder.length > 0) {
            RefreshActivePresetHighlight();
        }
        UpdatePresetHighlightPollingState();
    });
}

function ShowPresetApplySuccess(button, labelPanel, originalText) {
    if (!button || !labelPanel) return;
    var fallbackText = originalText || labelPanel.text || "";

    button.AddClass("PresetApplySuccess");
    labelPanel.text = "SUCCESS";
    RefreshActivePresetHighlight();

    $.Schedule(0.6, function() {
        if (labelPanel && labelPanel.IsValid && labelPanel.IsValid()) {
            labelPanel.text = fallbackText;
        }
        if (button && button.IsValid && button.IsValid()) {
            button.RemoveClass("PresetApplySuccess");
        }
        RefreshActivePresetHighlight();
    });
}

function CreatePresetGrid(parent, title, entries, columns, variant) {
    var titleLabel = $.CreatePanel("Label", parent, "");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("MainSectionTitle");
    if (variant === "custom") {
        titleLabel.AddClass("MainSectionTitleCustom");
    }
    titleLabel.text = title;

    var grid = $.CreatePanel("Panel", parent, "");
    grid.AddClass("PresetCategoryGrid");
    if (variant === "custom") {
        grid.AddClass("PresetCategoryGridCustom");
    }

    var cols = columns || 7;
    var index = 0;
    while (index < entries.length) {
        var rowCount = Math.min(cols, entries.length - index);
        var row = $.CreatePanel("Panel", grid, "");
        row.AddClass("PresetGridRow");
        var rowInner = $.CreatePanel("Panel", row, "");
        rowInner.AddClass("PresetGridRowInner");

        for (var c = 0; c < rowCount; c++) {
            var entry = entries[index + c];
            var btn = $.CreatePanel("Button", rowInner, "");
            btn.AddClass("PresetGridBtn");
            if (variant === "base") btn.AddClass("PresetGridBtnBase");
            else if (variant === "great") btn.AddClass("PresetGridBtnGreat");
            else if (variant === "custom") {
                btn.AddClass("PresetGridBtnCustom");
                if (entry.available !== false) {
                    btn.AddClass("PresetGridBtnCustomActive");
                }
            }

            var lbl = $.CreatePanel("Label", btn, "");
            lbl.text = entry.label;

            if (entry.available === false) {
                btn.AddClass("PresetGridBtnUnavailable");
                btn.SetPanelEvent("onactivate", function() {
                    OpenAvailableModal();
                });
            } else {
                if (entry.preset && !entry.action) {
                    RegisterPresetButton(entry.preset, btn, lbl, entry.label);
                }
                (function(button, labelPanel, originalLabel, presetName, presetExportString, actionName) {
                    button.SetPanelEvent("onactivate", function() {
                        if (presetExportString && presetExportString.length > 0) {
                            var parsedImport = TryApplyImportStringWithDiagnostics(presetExportString);
                            if (!parsedImport || parsedImport.ok !== true || !parsedImport.parsedConfig || !parsedImport.candidateConfig) return;

                            var importDiffRows = BuildConfigDiffRows(MOD_CONFIG, parsedImport.candidateConfig);
                            var importSchemaText = parsedImport.schemaVersion
                                ? ("[QOL-" + String(parsedImport.schemaVersion).replace(/\./g, "-") + "]")
                                : "[unknown]";
                            var importDetails = IsRussianSettingsLanguage()
                                ? ("\u0421\u0445\u0435\u043C\u0430 " + importSchemaText + " | clamp=" + String(parsedImport.clampedKeys) + " | unknown=" + String(parsedImport.unknownKeys))
                                : ("Schema " + importSchemaText + " | clamped=" + String(parsedImport.clampedKeys) + " | unknown=" + String(parsedImport.unknownKeys));

                            OpenConfigDiffPreviewModal({
                                title: "Settings Changes",
                                summary: "Changes: " + String(importDiffRows.length),
                                details: importDetails,
                                rows: importDiffRows,
                                applyText: "Confirm",
                                cancelText: "Cancel",
                                onApply: function() {
                                    try {
                                        ApplyParsedConfigWithDiagnostics(parsedImport.parsedConfig, parsedImport.schemaVersion || LATEST_COMPACT_SEMVER);
                                        SetRuntimePresetName(presetName);
                                        SaveAndSync();
                                        ShowPresetApplySuccess(button, labelPanel, originalLabel);
                                        return true;
                                    } catch (eImportApply) {
                                        SetLocalizedConfigFeedbackMessage("Preset apply failed.", "error", 2200);
                                        return false;
                                    }
                                }
                            });
                            return;
                        }

                        var candidatePresetConfig = BuildPresetCandidateConfigByName(presetName);
                        if (!candidatePresetConfig) return;
                        var presetDiffRows = BuildConfigDiffRows(MOD_CONFIG, candidatePresetConfig);
                        OpenConfigDiffPreviewModal({
                            title: "Settings Changes",
                            summary: "Changes: " + String(presetDiffRows.length),
                            rows: presetDiffRows,
                            applyText: "Confirm",
                            cancelText: "Cancel",
                            onApply: function() {
                                var didApply = ApplyPresetByName(presetName);
                                if (!didApply) {
                        SetLocalizedConfigFeedbackMessage("Preset apply failed.", "error", 2200);
                                    return false;
                                }
                                ShowPresetApplySuccess(button, labelPanel, originalLabel);
                                return true;
                            }
                        });
                    });
                })(btn, lbl, entry.label, entry.preset, entry.presetExport, entry.action);
            }
        }

        index += rowCount;
    }
    return {
        titleLabel: titleLabel,
        grid: grid
    };
}

function CreateSupportThanksPlaques(parent, entries, columns) {
    if (!parent || !Array.isArray(entries) || entries.length === 0) return null;

    var grid = $.CreatePanel("Panel", parent, "SupportThanksPlaqueGrid");
    grid.AddClass("SupportThanksPlaqueGrid");

    var cols = Math.max(1, columns || 4);
    var index = 0;
    while (index < entries.length) {
        var rowCount = Math.min(cols, entries.length - index);
        var row = $.CreatePanel("Panel", grid, "");
        row.AddClass("SupportThanksPlaqueRow");
        var rowInner = $.CreatePanel("Panel", row, "");
        rowInner.AddClass("SupportThanksPlaqueRowInner");

        for (var c = 0; c < rowCount; c++) {
            var entry = entries[index + c];
            var plaque = $.CreatePanel("Panel", rowInner, "");
            plaque.AddClass("PresetGridBtn");
            plaque.AddClass("PresetGridBtnBase");
            plaque.AddClass("SupportThanksPlaque");
            if (((index + c) % 2) === 1) plaque.AddClass("SupportThanksPlaqueAlt");

            var label = $.CreatePanel("Label", plaque, "");
            label.text = entry;
        }

        index += rowCount;
    }

    return grid;
}

function NormalizeSearchText(value) {
    if (value === undefined || value === null) return "";
    return String(value).toLowerCase();
}

function GetSettingsTabOrder() {
    return ["Support", "Config", "Presets", "Crosshair", "Healthbar", "HUD", "UI", "Overlay", "Minimap", "Audio", "Arcade", "Console"];
}

function GetActiveSearchCollectSection() {
    if (!gSearchCollectState) return null;
    if (!gSearchCollectState.currentSection) {
        var fallbackSection = {
            title: "",
            rows: []
        };
        gSearchCollectState.sections.push(fallbackSection);
        gSearchCollectState.currentSection = fallbackSection;
    }
    return gSearchCollectState.currentSection;
}

function BuildSearchAliasList(label, configId, description, extraLabels) {
    var aliases = [];
    var seen = {};
    var pushAlias = function(value) {
        var normalized = NormalizeSearchText(value).trim();
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        aliases.push(normalized);
    };

    pushAlias(label);
    pushAlias(configId);
    pushAlias(description);

    if (Array.isArray(extraLabels)) {
        for (var i = 0; i < extraLabels.length; i++) {
            pushAlias(extraLabels[i]);
        }
    }

    var configText = String(configId || "");
    if (configText) {
        var compactConfig = NormalizeSearchText(configText).replace(/[^a-z0-9]+/g, "");
        pushAlias(compactConfig);
        var configTokens = configText.split(/[^A-Za-z0-9]+/);
        var acronym = "";
        for (var t = 0; t < configTokens.length; t++) {
            var token = String(configTokens[t] || "");
            if (!token || token === "ENABLE" || token === "DISABLE" || token === "SHOW" || token === "HIDE" || token === "USE" || token === "MODE") continue;
            pushAlias(token);
            if (/^[A-Z0-9]+$/.test(token) && token.length >= 2) {
                pushAlias(token.toLowerCase());
            }
            acronym += token.charAt(0);
        }
        if (acronym.length >= 2) pushAlias(acronym);
    }

    return aliases;
}

function BuildSearchCollectedRow(label, configId, type, min, max, step, options, subInfo, extraLabels) {
    var activeSection = GetActiveSearchCollectSection();
    return {
        label: label || "",
        configId: configId || "",
        type: type || "",
        min: min,
        max: max,
        step: step,
        options: options,
        subInfo: subInfo || "",
        tabTitle: gSearchCollectState ? String(gSearchCollectState.tab || "") : "",
        sectionTitle: activeSection ? String(activeSection.title || "") : "",
        aliases: BuildSearchAliasList(label, configId, subInfo, extraLabels)
    };
}

function BuildSearchSectionIndexCacheKey() {
    var langKey = GetSettingsLanguageKey();
    return "lang=" + langKey;
}

function InvalidateSearchSectionIndexCache() {
    gSearchSectionIndexCacheKey = "";
    gSearchSectionIndexCache = null;
    gConfigDiffLabelCacheKey = "";
    gConfigDiffLabelMap = null;
}

function GetCachedSearchSectionIndex() {
    var cacheKey = BuildSearchSectionIndexCacheKey();
    if (gSearchSectionIndexCache && gSearchSectionIndexCacheKey === cacheKey) {
        return gSearchSectionIndexCache;
    }
    var freshIndex = BuildSearchSectionIndex();
    gSearchSectionIndexCache = freshIndex;
    gSearchSectionIndexCacheKey = cacheKey;
    return freshIndex;
}

function IsSearchRowMatch(row, q) {
    return NormalizeSearchText(row.label).indexOf(q) !== -1 ||
        NormalizeSearchText(row.subInfo).indexOf(q) !== -1 ||
        NormalizeSearchText(row.configId).indexOf(q) !== -1 ||
        NormalizeSearchText(row.sectionTitle).indexOf(q) !== -1 ||
        NormalizeSearchText(row.tabTitle).indexOf(q) !== -1 ||
        (Array.isArray(row.aliases) && row.aliases.join(" ").indexOf(q) !== -1);
}

function BuildSearchSectionIndex() {
    var originalTab = currentTab;
    var index = [];
    try {
        var searchTabs = GetSettingsTabOrder();
        for (var i = 0; i < searchTabs.length; i++) {
            var tab = searchTabs[i];
            var tabLabel = LocalizeSettingsText(tab, true);
            var state = {
                tab: tabLabel,
                sections: [],
                currentSection: null
            };

            gSearchCollectMode = true;
            gSearchCollectState = state;
            currentTab = tab;
            try {
                RenderCurrentTabContent(null);
            } finally {
                gSearchCollectMode = false;
                gSearchCollectState = null;
            }

            var nonEmptySections = [];
            for (var s = 0; s < state.sections.length; s++) {
                if (state.sections[s].rows && state.sections[s].rows.length > 0) {
                    nonEmptySections.push(state.sections[s]);
                }
            }
            index.push({
                tab: tabLabel,
                sections: nonEmptySections
            });
        }
        return index;
    } finally {
        currentTab = originalTab;
        gSearchCollectMode = false;
        gSearchCollectState = null;
    }
}

function AnimateSearchResultPanel(panel, order) {
    if (!panel || !panel.IsValid()) return;
    panel.AddClass("SearchAnimatedItem");
    // Keep search results visible immediately while query is active.
    if (String(currentSearchQuery || "").trim().length > 0) {
        panel.AddClass("SearchAnimatedItemVisible");
        return;
    }
    var delay = 0.005 + (Math.min(order, 24) * 0.012);
    $.Schedule(delay, function() {
        if (panel.IsValid()) {
            panel.AddClass("SearchAnimatedItemVisible");
        }
    });
}

function RenderSearchResults(list, query) {
    var q = NormalizeSearchText(query).trim();
    if (q.length === 0) return false;

    var tabIndex = GetCachedSearchSectionIndex();
    var matchedTabs = [];

    for (var t = 0; t < tabIndex.length; t++) {
        var tabEntry = tabIndex[t];
        var includeWholeTab = NormalizeSearchText(tabEntry.tab).indexOf(q) !== -1;
        var matchedSections = [];

        for (var s = 0; s < tabEntry.sections.length; s++) {
            var section = tabEntry.sections[s];
            var sectionTitleMatch = NormalizeSearchText(section.title).indexOf(q) !== -1;
            var matchedRows = [];
            for (var r = 0; r < section.rows.length; r++) {
                if (IsSearchRowMatch(section.rows[r], q)) {
                    matchedRows.push(section.rows[r]);
                }
            }
            if (includeWholeTab || sectionTitleMatch) {
                matchedSections.push({
                    title: section.title,
                    rows: section.rows
                });
            } else if (matchedRows.length > 0) {
                matchedSections.push({
                    title: section.title,
                    rows: matchedRows
                });
            }
        }

        if (matchedSections.length > 0) {
            matchedTabs.push({
                tab: tabEntry.tab,
                sections: matchedSections
            });
        }
    }

    var animOrder = 0;

    var title = $.CreatePanel("Label", list, "");
    title.AddClass("GroupHeader");
    title.text = LocalizeSettingsText("Search Results", true);
    AnimateSearchResultPanel(title, animOrder++);

    if (matchedTabs.length === 0) {
        var noResults = $.CreatePanel("Label", list, "");
        noResults.AddClass("SearchEmptyLabel");
        noResults.text = LocalizeSettingsText("No results found", true);
        AnimateSearchResultPanel(noResults, animOrder++);
        return true;
    }

    for (var mt = 0; mt < matchedTabs.length; mt++) {
        var tabLabel = $.CreatePanel("Label", list, "");
        tabLabel.AddClass("SearchSectionLabel");
        tabLabel.text = matchedTabs[mt].tab;
        AnimateSearchResultPanel(tabLabel, animOrder++);

        for (var ms = 0; ms < matchedTabs[mt].sections.length; ms++) {
            var sectionEntry = matchedTabs[mt].sections[ms];
            if (sectionEntry.title && sectionEntry.title.length > 0) {
                var sectionTitlePanel = CreateSectionTitle(list, sectionEntry.title);
                AnimateSearchResultPanel(sectionTitlePanel, animOrder++);
            }
            for (var mr = 0; mr < sectionEntry.rows.length; mr++) {
                var row = sectionEntry.rows[mr];
                var rowPanel = null;
                gSearchResultRenderMode = true;
                try {
                    rowPanel = CreateRow(list, row.label, row.configId, row.type, row.min, row.max, row.step, row.options, row.subInfo);
                } finally {
                    gSearchResultRenderMode = false;
                }
                AnimateSearchResultPanel(rowPanel, animOrder++);
            }
            if (ms < matchedTabs[mt].sections.length - 1) {
                var sectionSep = CreateSeparator(list);
                AnimateSearchResultPanel(sectionSep, animOrder++);
            }
        }
        if (mt < matchedTabs.length - 1) {
            var tabSep = CreateSeparator(list);
            AnimateSearchResultPanel(tabSep, animOrder++);
        }
    }
    return true;
}

function RenderCurrentTabContent(list) {
    gCurrentSettingsSectionTitle = "";
    if (!gSearchCollectMode && currentTab !== "Presets") {
        ResetPresetButtonRegistry();
    }
    if (currentTab === "Presets") {
        var isRuSettings = IsRussianSettingsLanguage();
        var basePresetsTitle = isRuSettings ? "\u0411\u0430\u0437\u043E\u0432\u044B\u0435 \u043F\u0440\u0435\u0441\u0435\u0442\u044B" : "Base Presets";
        var playerPresetsTitle = isRuSettings ? "\u041F\u0440\u0435\u0441\u0435\u0442\u044B \u0438\u0433\u0440\u043E\u043A\u043E\u0432" : "Player Presets";
        var communityPresetsTitle = isRuSettings ? "\u041F\u0440\u0435\u0441\u0435\u0442\u044B \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430" : "Community Presets";
        var requestLeadText = isRuSettings ? "\u0412\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0441\u0432\u043E\u0439 \u043F\u0440\u0435\u0441\u0435\u0442" : "You can request a community preset";
        var requestLinkText = isRuSettings ? "(\u041D\u0410\u0416\u041C\u0418\u0422\u0415 \u0421\u042E\u0414\u0410)" : "click here.";

        var basePresetEntries = [
            { label: "Default", preset: "Default" },
            { label: "16:10", preset: "16:10" },
            { label: "4:3", preset: "4:3" },
            { label: "Clean", preset: "Clean" },
            { label: "Enhanced", preset: "Enhanced" },
            { label: "Maximum", preset: "Maximum" }
        ];
        var playerPresetEntries = [
            { label: "Vegas", preset: "Vegas" },
            { label: "Goober", preset: "Goober" },
            { label: "Hoot", preset: "Hoot" },
            { label: "Basil", preset: "Basil" },
            { label: "NKD", preset: "NKD" },
            { label: "Ranger", preset: "Ranger" },
            { label: "BSQTT", preset: "BSQTT" },
            { label: "Panini", preset: "Panini" },
            { label: "SunnyD", preset: "SunnyD" },
            { label: "Piggy", preset: "Piggy" },
            { label: "bonclide", preset: "bonclide" },
            { label: "Obikym", preset: "Obikym" },
            { label: "Poshy", preset: "Poshy" },
            { label: "Bread", preset: "Bread" }
        ];
        var customEntries = BuildCommunityPresetEntries();

        if (gSearchCollectMode && gSearchCollectState) {
            var addPresetSearchRows = function(sectionTitle, entries, sectionSubInfo) {
                CreateSectionTitle(list, sectionTitle);
                for (var pi = 0; pi < entries.length; pi++) {
                    var entry = entries[pi];
                    if (!entry || entry.available === false) continue;
                    var configId = "SEARCH_TAB:Presets";
                    var buttonLabel = "Open";
                    var subInfo = sectionSubInfo;

                    if (entry && entry.preset) {
                        configId = "SEARCH_PRESET:" + entry.preset;
                        buttonLabel = "Apply";
                    }

                    CreateRow(list, entry.label, configId, "actionbutton", null, null, null, [
                        { label: buttonLabel }
                    ], subInfo);
                }
            };

            addPresetSearchRows(basePresetsTitle, basePresetEntries, "Base preset");
            CreateSeparator(list);
            addPresetSearchRows(playerPresetsTitle, playerPresetEntries, "Player preset");
            CreateSeparator(list);
            addPresetSearchRows(communityPresetsTitle, customEntries, "Community preset");
            CreateRow(list, "click here", "SEARCH_ACTION:OPEN_COMMISSION_MODAL", "actionbutton", null, null, null, [
                { label: "Support" }
            ], "Request a community preset");
            return;
        }

        ResetPresetButtonRegistry();
        CreatePresetGrid(list, basePresetsTitle, basePresetEntries, 7, "base");
        CreateSeparator(list);
            CreatePresetGrid(list, playerPresetsTitle, playerPresetEntries, 5, "great");
        CreateSeparator(list);
        var communitySection = CreatePresetGrid(list, communityPresetsTitle, customEntries, 6, "custom");

        var communityHintRow = $.CreatePanel("Panel", list, "CommunityPresetHintRow");
        communityHintRow.AddClass("CommunityPresetHintRow");
        var communityHintInner = $.CreatePanel("Panel", communityHintRow, "CommunityPresetHintInner");
        communityHintInner.AddClass("CommunityPresetHintInner");
        var communityHintLead = $.CreatePanel("Label", communityHintInner, "CommunityPresetHintLead");
        communityHintLead.AddClass("CommunityPresetHintText");
        communityHintLead.text = requestLeadText;
        var communityHintLink = $.CreatePanel("Button", communityHintInner, "CommunityPresetHintLink");
        communityHintLink.AddClass("CommunityPresetHintLink");
        var communityHintLinkLabel = $.CreatePanel("Label", communityHintLink, "CommunityPresetHintLinkLabel");
        communityHintLinkLabel.text = requestLinkText;
        communityHintLink.SetPanelEvent("onactivate", function() {
            OpenSupportCommissionModal();
        });
        if (
            communitySection &&
            communitySection.grid &&
            communitySection.grid.IsValid &&
            communitySection.grid.IsValid()
        ) {
            list.MoveChildBefore(communityHintRow, communitySection.grid);
        }

        RefreshActivePresetHighlight();
    } else if (currentTab === "Crosshair") {
        CreateAnimatedInlineToggleSection(list, "Item Cooldowns", "ENABLE_PASSIVE_COOLDOWN", "Tracked cooldowns near crosshair", function(sectionParent) {
            var advancedModeEnabled = IsAdvancedItemCooldownModeEnabled();
            CreateRow(sectionParent, "Advanced Mode", "ENABLE_OLD_ITEM_COOLDOWNS", "toggle", null, null, null, [{ invert: true }], "Switch to the advanced item cooldown mode with in-menu filters.");
            if (advancedModeEnabled) {
                CreateRow(sectionParent, "Advanced Filter", null, "multitoggle", null, null, null, [
                    { key: "ITEM_FILTER_DEF_PASSIVE", label: "Defensive Passive" },
                    { key: "ITEM_FILTER_OFF_PASSIVE", label: "Offensive Passive" },
                    { key: "ITEM_FILTER_DEF_ACTIVE", label: "Defensive Active" },
                    { key: "ITEM_FILTER_OFF_ACTIVE", label: "Offensive Active" }
                ], null);
            } else {
                CreateRow(sectionParent, "Filters", "OPEN_OLD_ITEM_FILTERS_DOWNLOAD", "actionbutton", null, null, null, [
                    { label: "Get Filter" }
                ], "Get Filter File Only");
            }
            CreateRow(sectionParent, "Size", "PASSIVE_COOLDOWN_SIZE", "slider", 30, 60, 1);
            CreateRow(sectionParent, "Opacity", "PASSIVE_COOLDOWN_OPACITY", "slider", 0, 1.0, 0.05, null);
            CreateRow(sectionParent, "Horizontal Offset", "PASSIVE_COOLDOWN_X", "slider", -50, 50, 1);
            CreateRow(sectionParent, "Vertical Offset", "PASSIVE_COOLDOWN_Y", "slider", -50, 50, 1);
        });
        CreateSeparator(list);
        CreateSectionTitle(list, "Damage Numbers");
        CreateRow(list, "Big Numbers", "ENABLE_CUMULATIVE_DMG", "toggle", null, null, null, null);
        CreateRow(list, "Small Numbers", "ENABLE_HIDE_SMALL_NUMBERS", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Trooper Damage", "ENABLE_HIDE_TROOPER_DAMAGE", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Damage Fountain", "ENABLE_DAMAGE_FOUNTAIN", "toggle", null, null, null, null, "Fountain-style damage number animation.");
        CreateRow(list, "Size", "HUD_INDICATOR_SIZE", "slider", 10, 60, 1, null, "Default 18");
        CreateRow(list, "Opacity", "DAMAGE_NUMBER_OPACITY", "slider", 0, 1.0, 0.05, null);
        CreateSeparator(list);
        CreateSectionTitle(list, "Ammo");
        CreateRow(list, "Visual", "ENABLE_AMMO_STATUS", "toggle", null, null, null, null);
        CreateRow(list, "Current", "ENABLE_HIDE_AMMO_ALL", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Current Size", "AMMO_CURRENT_SCALE", "slider", 100, 300, 1, null);
        CreateRow(list, "Total", "ENABLE_HIDE_MAGAZINE", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Total Size", "AMMO_TOTAL_SCALE", "slider", 100, 300, 1, null);
        CreateRow(list, "Horizontal Offset", "AMMO_PANEL_X_OFFSET", "slider", -200, 200, 5, null);
        CreateRow(list, "Vertical Offset", "AMMO_PANEL_Y_OFFSET", "slider", -200, 200, 5, null);
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Reload Cooldown", "ENABLE_RELOAD_COOLDOWN", "Estimated Active Reload Timer", function(sectionParent) {
            CreateRow(sectionParent, "Size", "RELOAD_COOLDOWN_SIZE", "slider", 16, 60, 1, null);
            CreateRow(sectionParent, "Opacity", "RELOAD_COOLDOWN_OPACITY", "slider", 0, 1.0, 0.05, null);
            CreateRow(sectionParent, "Horizontal Offset", "RELOAD_COOLDOWN_X_OFFSET", "slider", -75, 75, 1, null);
            CreateRow(sectionParent, "Vertical Offset", "RELOAD_COOLDOWN_Y_OFFSET", "slider", -75, 75, 1, null);
        });
        CreateSeparator(list);
        CreateSectionTitle(list, "Reloading");
        CreateRow(list, "Icon", "ENABLE_HIDE_RELOAD_ICON", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Circle", "ENABLE_HIDE_RELOAD_CIRCLE", "toggle", null, null, null, [{ invert: true }]);
        CreateSeparator(list);
        CreateSectionTitle(list, "Item Target Reticle");
        CreateRow(list, "Highlight Mode", "ENABLE_RED_DIAMOND", "toggle", null, null, null, null);
        CreateRow(list, "Improved Hint", "ENABLE_IMPROVED_HINT", "toggle", null, null, null, null);
        CreateRow(list, "Size", "UNIT_TARGET_SIZE", "slider", 50, 300, 5, null);
        CreateRow(list, "Opacity", "UNIT_TARGET_OPACITY", "slider", 0, 1.0, 0.05, null);
    } else if (currentTab === "HUD") {
        CreateSectionTitle(list, "Top Bar");
        CreateRow(list, "Objective Map", "ENABLE_OBJ_MAP", "toggle", null, null, null, null, "");
        CreateRow(list, "Mid Boss Timer", "ENABLE_REJUV_HUD", "toggle", null, null, null, null, "");
        CreateRow(list, "Bridge Buff Timer", "ENABLE_BUFF_HUD", "toggle", null, null, null, null, "");
        CreateRow(list, "Urn Difference", "ENABLE_URN_DIFF", "toggle", null, null, null, null, "");
        CreateRow(list, "Missing Hero Opaque", "ENABLE_MISSING_HERO", "toggle", null, null, null, null, "");
        CreateRow(list, "Nicknames", "ENABLE_NICKNAMES", "toggle", null, null, null, null, "");
        CreateRow(list, "Souls Per Minute", "ENABLE_MIN_SOULS", "toggle", null, null, null, null, "");
        CreateRow(list, "Unspent Souls", "ENABLE_UNSPENT_SOULS", "toggle", null, null, null, null, "");
        CreateRow(list, "Objective Damage", "ENABLE_OBJ_DMG", "toggle", null, null, null, null, "");
        CreateSeparator(list);
        CreateSectionTitle(list, "Bottom Bar");
        CreateRow(list, "Failed Hint", "ENABLE_HIDE_FAILED_HINT", "toggle", null, null, null, [{ invert: true }], "Low Stamina Popup");
        CreateRow(list, "Ability Suggestion", "ENABLE_HIDE_ABILITY_SUGGESTION", "toggle", null, null, null, [{ invert: true }], "On Ability Upgrade");
        CreateRow(list, "Cosmetic Ability", "ENABLE_HIDE_COSMETIC_ABILITY", "toggle", null, null, null, [{ invert: true }], "Snowball or Poster");
        // Hidden from UI by request; remains configurable via defaults/presets/import.
        CreateRow(list, "Minimalist Abilities", "ENABLE_SIMPLIFY_ABILITY_ICONS", "toggle", null, null, null, null);
        CreateRow(list, "Minimalist Item Bar", "ENABLE_SIMPLIFY_ITEMS", "toggle", null, null, null, null);
        CreateSeparator(list);
        CreateSectionTitle(list, "Shop");
        CreateRow(list, "Stats", "ENABLE_SHOP_STATS", "toggle", null, null, null, null);
        CreateRow(list, "Hero", "ENABLE_HERO_SCENE_PANEL", "toggle", null, null, null, null);
        CreateRow(list, "Minimalist", "ENABLE_SIMPLIFY_SHOP", "toggle", null, null, null, null);
        CreateRow(list, "Blur", "DISABLE_SHOP_BLUE", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Quick Buy", "DISABLE_QUICK_BUY", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Horizontal Offset", "SHOP_OFFSET_X", "slider", -500, 500, 5, null);
    } else if (currentTab === "Healthbar") {
        CreateSectionTitle(list, "Player");
        CreateRow(list, "Color Warning", "ENABLE_COLORED_HEALTHBAR", "multitoggle", null, null, null, COLOR_WARNING_THRESHOLD_OPTIONS, "HP Warning");
        CreateRow(list, "Type", "HEALTHBAR_TYPE", "dropdown", null, null, null, HEALTHBAR_TYPE_DROPDOWN_OPTIONS);
        CreateRow(list, "Size", "PLAYER_HEALTHBAR_SCALE", "slider", 50, 200, 1, null, "");
        CreateRow(list, "Opacity", "PLAYER_HEALTHBAR_OPACITY", "slider", 0, 1.0, 0.05, null, "");
        CreateRow(list, "Horizontal Offset", "PLAYER_HEALTHBAR_X_OFFSET", "slider", -1000, 1000, 5, null, "");
        CreateRow(list, "Vertical Offset", "PLAYER_HEALTHBAR_Y_OFFSET", "slider", -1000, 1000, 5, null, "");
    } else if (currentTab === "UI") {
        CreateSectionTitle(list, "UI Controls");
        CreateRow(list, "16:10 Support", "SUPPORT_16_10", "toggle", null, null, null, null, "Hud Shift");
        CreateRow(list, "4:3 Support", "SUPPORT_4_3", "toggle", null, null, null, null, "Hud Shift");
        CreateRow(list, "21:9 Stream Fix", "ENABLE_HUD_SHIFT", "toggle", null, null, null, null, "Hud Shift");
        CreateRow(list, "Lane with Party", "ENABLE_LANE_WITH_PARTY", "toggle", null, null, null, null, "");
        CreateRow(list, "Centered ESC Menu", "ENABLE_CENTER_ESC", "toggle", null, null, null, null, "Easier Access");
        CreateRow(list, "Centered Friends List", "ENABLE_CENTER_FRIENDS_LIST", "toggle", null, null, null, null, "");
        CreateRow(list, "Legacy Durations", "ENABLE_LEGACY_COOLDOWNS", "toggle", null, null, null, null, "");
        CreateRow(list, "Show Testing Tools", "ENABLE_FORCE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Shown");
        CreateRow(list, "Hide Testing Tools", "ENABLE_HIDE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Hidden");
        CreateRow(list, "Behavior Summary", "ENABLE_HIDE_BEHAVIOR_SUMMARY", "toggle", null, null, null, [{ invert: true }], "Metro Button");
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Damage Report", "DISABLE_DAMAGE_REPORT", "", function(sectionParent) {
            CreateRow(sectionParent, "Horizontal Offset", "DAMAGE_REPORT_X_OFFSET", "slider", -1500, 1500, 5, null, "");
            CreateRow(sectionParent, "Vertical Offset", "DAMAGE_REPORT_Y_OFFSET", "slider", -1500, 200, 5, null, "");
        }, { invert: true });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Chat", "ENABLE_CHAT", "", function(sectionParent) {
            CreateRow(sectionParent, "Size", "CHAT_SCALE", "slider", 50, 200, 1, null, "");
            CreateRow(sectionParent, "Horizontal Offset", "CHAT_X_OFFSET", "slider", -1500, 1500, 5, null, "");
            CreateRow(sectionParent, "Vertical Offset", "CHAT_Y_OFFSET", "slider", -250, 800, 5, null, "");
        });
    } else if (currentTab === "Overlay") {
        //CreateRow(list, "Enable Clean Stacks", "ENABLE_CLEAN_STACKS", "toggle", null, null, null, null, "Improve Ability Stacks");
        CreateAnimatedInlineToggleSection(list, "Zipline Boost", "ENABLE_ZIP_BOOST", "Always Visible Boost", function(sectionParent) {
            CreateRow(sectionParent, "Size", "ZIP_BOOST_SCALE", "slider", 50, 200, 1, null, "");
            CreateRow(sectionParent, "Horizontal Offset", "ZIP_BOOST_X_OFFSET", "slider", -2000, 2000, 5);
            CreateRow(sectionParent, "Vertical Offset", "ZIP_BOOST_Y_OFFSET", "slider", 0, 1000, 5);
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Ult Cooldowns", "ENABLE_ULT_COOLDOWNS", "HIGH FPS IMPACT WARNING!", function(sectionParent) {
            CreateRow(sectionParent, "Size", "ULT_COOLDOWN_SIZE", "slider", 10, 32, 1, null);
            CreateRow(sectionParent, "Opacity", "ULT_COOLDOWN_OPACITY", "slider", 0, 1.0, 0.05, null);
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Unsecured Timer", "ENABLE_UNSECURED_SOUL_TIMER", "Realtime Drain Countdown", function(sectionParent) {
            CreateRow(sectionParent, "Size", "UNSECURED_SOUL_TIMER_SCALE", "slider", 50, 200, 1, null, "");
            CreateRow(sectionParent, "Horizontal Offset", "UNSECURED_SOUL_TIMER_X_OFFSET", "slider", -1500, 1500, 5);
            CreateRow(sectionParent, "Vertical Offset", "UNSECURED_SOUL_TIMER_Y_OFFSET", "slider", -100, 1000, 5);
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Unsecured Plus", "ENABLE_BETTER_UNSECURED", "Customizable Unsecured Souls", function(sectionParent) {
            CreateRow(sectionParent, "Icon", "ENABLE_BETTER_UNSECURED_SHOW_ICON", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Text", "ENABLE_BETTER_UNSECURED_SHOW_TEXT", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Size", "UNSECURED_SOULS_HUD_SCALE", "slider", 50, 200, 1, null, "");
            CreateRow(sectionParent, "Horizontal Offset", "UNSECURED_SOULS_HUD_X_OFFSET", "slider", -1000, 2000, 5, null);
            CreateRow(sectionParent, "Vertical Offset", "UNSECURED_SOULS_HUD_Y_OFFSET", "slider", 800, 2000, 5, null);
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Keyboard", "ENABLE_KEYBOARD_OVERLAY", "Realtime Key Inputs", function(sectionParent) {
            CreateRow(sectionParent, "Full Keys", "ENABLE_FULL_KEYBOARD_LAYOUT", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Size", "KEYBOARD_OVERLAY_SCALE", "slider", 70, 150, 1, null, "");
            CreateRow(sectionParent, "Horizontal Offset", "KEYBOARD_OVERLAY_X_OFFSET", "slider", -1500, 1500, 5);
            CreateRow(sectionParent, "Vertical Offset", "KEYBOARD_OVERLAY_Y_OFFSET", "slider", -400, 1000, 5);
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Compass", "ENABLE_COMPASS", "Angle and Speed", function(sectionParent) {
            CreateRow(sectionParent, "Minimalist", "ENABLE_SIMPLIFY_COMPASS", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Speed", "ENABLE_COMPASS_SPEED", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Horizontal Stretch", "COMPASS_STRETCH_X", "slider", 50, 200, 1);
            CreateRow(sectionParent, "Vertical Stretch", "COMPASS_STRETCH_Y", "slider", 50, 200, 1);
            CreateRow(sectionParent, "Size", "COMPASS_SCALE", "slider", 50, 200, 1);
            CreateRow(sectionParent, "Horizontal Offset", "COMPASS_X_OFFSET", "slider", -2000, 2000, 5);
            CreateRow(sectionParent, "Vertical Offset", "COMPASS_Y_OFFSET", "slider", -1000, 300, 5);
        });
    } else if (currentTab === "Minimap") {
        CreateSectionTitle(list, "Minimap");
        CreateRow(list, "Minimalist", "MINIMAL_MINIMAP", "toggle", null, null, null, null);
        CreateRow(list, "Minimalist Opacity", "MINIMAL_MINIMAP_OPACITY", "slider", 0, 1.0, 0.05);
        CreateRow(list, "Flip", "MINIMAP_FLIP", "toggle", null, null, null, null, "Rotates the static minimap 180 degrees.");
        CreateRow(list, "Spinny Mode", "MINIMAP_ROTATE_WITH_PLAYER", "toggle", null, null, null, null, "");
        CreateInlineSecondaryCheckboxToggleRow(
            list,
            "Bridge Buff Timer",
            "ENABLE_MINIMAP_BUFF_TIMER",
            "On Bridge",
            "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE",
            "",
            ""
        );
        CreateInlineSecondaryCheckboxToggleRow(
            list,
            "Mid Boss Timer",
            "ENABLE_MINIMAP_REJUV_TIMER",
            "On Mid",
            "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS",
            "",
            "Moves the Mid Boss timer onto the bridge area of the minimap."
        );
        CreateRow(list, "Size", "MINIMAP_SMALL_SIZE", "slider", 200, 1000, 5, null, "Default 400");
        CreateRow(list, "Opacity", "MINIMAP_BASE_OPACITY", "slider", 0, 1.0, 0.05);
        CreateRow(list, "Horizontal Offset", "MINIMAP_X_OFFSET", "slider", -1500, 1500, 5);
        CreateRow(list, "Vertical Offset", "MINIMAP_Y_OFFSET", "slider", -100, 1000, 5);
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Alt Zoom", "ENABLE_ALT_ZOOM", "Ability Menu Open", function(sectionParent) {
            CreateRow(sectionParent, "Draw Over UI", "ALT_ZOOM_DRAW_OVER_UI", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Size", "MINIMAP_LARGE_SIZE_ALT", "slider", 400, 1200, 10);
            CreateRow(sectionParent, "Opacity", "ALT_ZOOM_OPACITY", "slider", 0, 1.0, 0.05);
            CreateRow(sectionParent, "Horizontal Offset", "ZOOM_X_OFFSET_ALT", "slider", -1500, 1500, 5);
            CreateRow(sectionParent, "Vertical Offset", "ZOOM_Y_OFFSET_ALT", "slider", -1000, 1000, 5);
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Tab Zoom", "ENABLE_TAB_ZOOM", "Scoreboard Open", function(sectionParent) {
            CreateRow(sectionParent, "Draw Over UI", "TAB_ZOOM_DRAW_OVER_UI", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Size", "MINIMAP_LARGE_SIZE_TAB", "slider", 400, 1200, 10);
            CreateRow(sectionParent, "Opacity", "TAB_ZOOM_OPACITY", "slider", 0, 1.0, 0.05);
            CreateRow(sectionParent, "Horizontal Offset", "ZOOM_X_OFFSET_TAB", "slider", -1500, 1500, 5);
            CreateRow(sectionParent, "Vertical Offset", "ZOOM_Y_OFFSET_TAB", "slider", -1000, 1000, 5);
        });
    } else if (currentTab === "Audio") {
        CreateSectionTitle(list, "Announcer");
        CreateRow(list, "Voice", "VOICE_TYPE", "dropdown", null, null, null, BuildVoiceDropdownOptions());
        CreateRow(list, "Volume", "VOICE_VOLUME", "slider", 0, 100, 1);
        var announcerTypeRow = CreateRow(list, "Type", null, "multitoggle", null, null, null, NEUTRAL_CAMP_TIER_OPTIONS);
        if (announcerTypeRow && announcerTypeRow.IsValid && announcerTypeRow.IsValid()) {
            announcerTypeRow.AddClass("AnnouncerTypeFilterRow");
        }
        var announcerBuffFilterRow = CreateRow(list, "Buff Filter", null, "multitoggle", null, null, null, BRIDGE_BUFF_FILTER_OPTIONS);
        if (announcerBuffFilterRow && announcerBuffFilterRow.IsValid && announcerBuffFilterRow.IsValid()) {
            announcerBuffFilterRow.AddClass("AnnouncerTypeFilterRow");
        }
        CreateRow(list, "Buff Delay", "BRIDGE_BUFF_START", "slider", 0, 60, 1, null, "In Seconds");
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Minimap Reminder", "ENABLE_MINIMAP_REMINDER", "Ding to Check Minimap", function(sectionParent) {
            CreateRow(sectionParent, "Timer", "MINIMAP_REMINDER_INTERVAL", "slider", 5, 60, 1, null, "In Seconds");
        });
    } else if (currentTab === "Console") {
        if (gSearchCollectMode && gSearchCollectState) {
            CreateRuntimeSectionTitle(list, "General");
            CreateRow(list, "Hitmarkers", "HITMARKERS_RUNTIME", "runtime_buttongroup", null, null, null, HITMARKERS_RUNTIME_OPTIONS);
            CreateSeparator(list);
            CreateRuntimeSectionTitle(list, "Minimap");
            CreateRow(
                list,
                "Click Radius",
                "RUNTIME_MINIMAP_CLICK_RADIUS",
                "runtime_slider",
                0,
                1000,
                25,
                [{ command: "citadel_minimap_unit_click_radius", defaultValue: 200 }],
                "The click hitbox of your pings or clicks, this can help make pings more accurate."
            );
            CreateRow(
                list,
                "Icon Shrink",
                "RUNTIME_MINIMAP_ICON_SHRINK",
                "runtime_slider",
                0,
                3,
                0.1,
                [{ command: "citadel_minimap_max_icon_shrink", defaultValue: 0.7 }],
                "How much icons will shrink when overlapping with others."
            );
            CreateRow(
                list,
                "Hero Icon Size",
                "RUNTIME_MINIMAP_HERO_ICON_SIZE",
                "runtime_slider",
                0,
                24,
                0.5,
                [{ command: "citadel_minimap_player_width", defaultValue: 6.5 }],
                "The size of other players on the minimap."
            );
            CreateRow(
                list,
                "Player Icon Size",
                "RUNTIME_MINIMAP_PLAYER_ICON_SIZE",
                "runtime_slider",
                0,
                24,
                0.5,
                [{ command: "citadel_minimap_local_player_width", defaultValue: 12 }],
                "The size of yourself on the minimap."
            );
            CreateRow(
                list,
                "Shrink Distance",
                "RUNTIME_MINIMAP_SHRINK_DISTANCE",
                "runtime_slider",
                0,
                20,
                1,
                [{ command: "citadel_minimap_overlap_scan_distance", defaultValue: 10 }],
                "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility."
            );
            CreateRow(
                list,
                "Zip Thickness",
                "RUNTIME_MINIMAP_ZIP_THICKNESS",
                "runtime_slider",
                0,
                10,
                0.5,
                [{ command: "citadel_minimap_zip_line_thickness", defaultValue: 2 }],
                "The thickness of the Zipline lines across the map."
            );
            CreateRow(
                list,
                "Refresh Rate",
                "RUNTIME_MINIMAP_REFRESH_RATE",
                "runtime_slider",
                15,
                360,
                15,
                [{ command: "minimap_update_rate_hz", defaultValue: 60 }],
                "How fast the minimap refreshes."
            );
            CreateSeparator(list);
            CreateRuntimeSectionTitle(list, "Statistics");
            CreateRow(
                list,
                "Show Memory",
                "RUNTIME_STATS_SHOWMEM",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_MEMORY_RUNTIME_OPTIONS,
                "RAM and GPU Memory real time usage statistics."
            );
            CreateRow(
                list,
                "Show Position",
                "RUNTIME_STATS_SHOWPOS",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_POSITION_RUNTIME_OPTIONS,
                "Position and Velocity real time statistics."
            );
            CreateRow(
                list,
                "Show Tick",
                "RUNTIME_STATS_SHOWTICK",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_TICK_RUNTIME_OPTIONS,
                "Shows real time tick information, mostly useless."
            );
            CreateRow(
                list,
                "Show FPS",
                "RUNTIME_STATS_SHOWFPS",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_FPS_RUNTIME_OPTIONS,
                "Shows raw FPS count."
            );
            CreateRow(
                list,
                "Show Frame",
                "RUNTIME_STATS_SHOWFRAME",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_FRAME_RUNTIME_OPTIONS,
                "Shows current frame count, mostly useless."
            );
            return;
        }

        var consoleNoteWrap = $.CreatePanel("Panel", list, "ConsoleTabNoteWrap");
        consoleNoteWrap.AddClass("ConsoleTabNoteWrap");
        var consoleNoteText = $.CreatePanel("Label", consoleNoteWrap, "ConsoleTabNoteText");
        consoleNoteText.AddClass("ConsoleTabNoteText");
        consoleNoteText.text = "This tab is unique, these apply console commands directly and the game will save them, it is not tied to your QOL Lock settings, this is just an easy way to change them directly.";

        CreateRuntimeSectionTitle(list, "General");
        CreateRow(list, "Hitmarkers", "HITMARKERS_RUNTIME", "runtime_buttongroup", null, null, null, HITMARKERS_RUNTIME_OPTIONS);
        CreateSeparator(list);
        CreateRuntimeSectionTitle(list, "Minimap");
        CreateRow(
            list,
            "Click Radius",
            "RUNTIME_MINIMAP_CLICK_RADIUS",
            "runtime_slider",
            0,
            1000,
            25,
            [{ command: "citadel_minimap_unit_click_radius", defaultValue: 200 }],
            "The click hitbox of your pings or clicks, this can help make pings more accurate."
        );
        CreateRow(
            list,
            "Icon Shrink",
            "RUNTIME_MINIMAP_ICON_SHRINK",
            "runtime_slider",
            0,
            3,
            0.1,
            [{ command: "citadel_minimap_max_icon_shrink", defaultValue: 0.7 }],
            "How much icons will shrink when overlapping with others."
        );
        CreateRow(
            list,
            "Hero Icon Size",
            "RUNTIME_MINIMAP_HERO_ICON_SIZE",
            "runtime_slider",
            0,
            24,
            0.5,
            [{ command: "citadel_minimap_player_width", defaultValue: 6.5 }],
            "The size of other players on the minimap."
        );
        CreateRow(
            list,
            "Player Icon Size",
            "RUNTIME_MINIMAP_PLAYER_ICON_SIZE",
            "runtime_slider",
            0,
            24,
            0.5,
            [{ command: "citadel_minimap_local_player_width", defaultValue: 12 }],
            "The size of yourself on the minimap."
        );
        CreateRow(
            list,
            "Shrink Distance",
            "RUNTIME_MINIMAP_SHRINK_DISTANCE",
            "runtime_slider",
            0,
            20,
            1,
            [{ command: "citadel_minimap_overlap_scan_distance", defaultValue: 10 }],
            "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility."
        );
        CreateRow(
            list,
            "Zip Thickness",
            "RUNTIME_MINIMAP_ZIP_THICKNESS",
            "runtime_slider",
            0,
            10,
            0.5,
            [{ command: "citadel_minimap_zip_line_thickness", defaultValue: 2 }],
            "The thickness of the Zipline lines across the map."
        );
        CreateRow(
            list,
            "Refresh Rate",
            "RUNTIME_MINIMAP_REFRESH_RATE",
            "runtime_slider",
            15,
            360,
            15,
            [{ command: "minimap_update_rate_hz", defaultValue: 60 }],
            "How fast the minimap refreshes."
        );
        CreateSeparator(list);
        CreateRuntimeSectionTitle(list, "Statistics");
        CreateRow(
            list,
            "Show Memory",
            "RUNTIME_STATS_SHOWMEM",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_MEMORY_RUNTIME_OPTIONS,
            "RAM and GPU Memory real time usage statistics."
        );
        CreateRow(
            list,
            "Show Position",
            "RUNTIME_STATS_SHOWPOS",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_POSITION_RUNTIME_OPTIONS,
            "Position and Velocity real time statistics."
        );
        CreateRow(
            list,
            "Show Tick",
            "RUNTIME_STATS_SHOWTICK",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_TICK_RUNTIME_OPTIONS,
            "Shows real time tick information, mostly useless."
        );
        CreateRow(
            list,
            "Show FPS",
            "RUNTIME_STATS_SHOWFPS",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_FPS_RUNTIME_OPTIONS,
            "Shows raw FPS count."
        );
        CreateRow(
            list,
            "Show Frame",
            "RUNTIME_STATS_SHOWFRAME",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_FRAME_RUNTIME_OPTIONS,
            "Shows current frame count, mostly useless."
        );
    } else if (currentTab === "Arcade") {
        CreateSectionTitle(list, "Game Settings");
        CreateRow(list, "Game Audio", "ENABLE_GAME_AUDIO", "toggle", null, null, null, null, "Enable sounds in arcade games.");
        CreateRow(list, "Difficulty", "GAME_DEFAULT_DIFFICULTY", "buttongroup", null, null, null, ARCADE_DEFAULT_DIFFICULTY_OPTIONS, "Default difficulty when opening games.");
        CreateRow(list, "On Death", "ENABLE_ON_DEATH_GAMES", "toggle", null, null, null, null, "Randomly opens an enabled arcade game while dead.");
        CreateSeparator(list);
        CreateSectionTitle(list, "Gamemodes");
        CreateRow(list, "BHOP", "ENABLE_BHOP", "toggle", null, null, null, null, "For custom BHop gamemode UI changes.");
        CreateSeparator(list);
        CreateSectionTitle(list, "Games");
        CreateRow(list, "Bebop Sweeper", "OPEN_MINESWEEPER", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_MINESWEEPER"
            }
        ], "");
        CreateRow(list, "Wraithjack", "OPEN_BLACKJACK", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_BLACKJACK"
            }
        ], "");
        CreateRow(list, "Flappy Bat", "OPEN_FLAPPY_BIRD", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_FLAPPY_BAT"
            }
        ], "");
        CreateRow(list, "Graves Trainer", "OPEN_AIM_TRAINER", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_GRAVES_TRAINER"
            }
        ], "");
        CreateRow(list, "Zerggy Mania", "OPEN_TRAIN_TRACKING", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_ZERGGY_MANIA"
            }
        ], "");
        CreateRow(list, "Whack a Rem", "OPEN_WHACK_A_REM", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_WHACK_A_REM"
            }
        ], "");
    } else if (currentTab === "Config") {
        RenderConfigTabContent(list);
    } else if (currentTab === "Support") {
        if (gSearchCollectMode && gSearchCollectState) {
            CreateSectionTitle(list, "Welcome to QOL Lock");
            CreateRow(list, "Discord", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Help and feedback");
            CreateRow(list, "Commission", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Commission details");
            CreateRow(list, "Change Log", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "View updates");
            CreateSectionTitle(list, "Special Thanks");
            CreateRow(list, "Contributors", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Community acknowledgements");
            return;
        }
        var supportIntroCard = $.CreatePanel("Panel", list, "SupportIntroCard");
        supportIntroCard.AddClass("SupportTabCard");
        supportIntroCard.AddClass("SupportIntroCard");
        var supportCardTitle = $.CreatePanel("Label", supportIntroCard, "");
        supportCardTitle.AddClass("SupportTabSectionTitle");
        supportCardTitle.text = LocalizeSettingsText("Welcome to QOL Lock", true);

        function AddSupportBlockText(text) {
            var line = $.CreatePanel("Label", supportIntroCard, "");
            line.AddClass("SupportTabText");
            line.AddClass("SupportIntroBodyText");
            var localized = LocalizeSettingsText(text, true);
            line.text = (localized && localized.endsWith(".")) ? localized.slice(0, -1) : localized;
            return line;
        }

        function AddSupportInlineActionRow(fullText, onActivate) {
            var row = $.CreatePanel("Panel", supportIntroCard, "");
            row.AddClass("SupportIntroActionRow");

            var sentenceBtn = $.CreatePanel("Button", row, "");
            sentenceBtn.AddClass("SupportInlineSentenceBtn");
            var sentenceLbl = $.CreatePanel("Label", sentenceBtn, "");
            sentenceLbl.AddClass("SupportInlineSentenceLabel");
            var localizedText = LocalizeSettingsText(fullText, true);
            sentenceLbl.text = (localizedText && localizedText.endsWith(".")) ? localizedText.slice(0, -1) : localizedText;
            sentenceBtn.SetPanelEvent("onactivate", onActivate);
        }

        AddSupportBlockText("This is a mod designed to give you complete freedom over your game.");
        AddSupportBlockText("By default everything is disabled and has nearly zero performance cost.");
        AddSupportBlockText("Be conscious of the features you are using and read carefully.");
        AddSupportBlockText("The majority of issues are caused by improper installation or conflicting mods.");

        AddSupportInlineActionRow(
            "If you encounter issues, need help, or have any feedback join the Discord",
            function() {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/YkRgwfPt9S");
            }
        );
        AddSupportInlineActionRow(
            "You can commission custom features and presets for the mod",
            function() {
                OpenSupportCommissionModal();
            }
        );
        AddSupportInlineActionRow(
            "For a list of changes and current version checkout the Change Log",
            function() {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://gamebanana.com/mods/updates/650634");
            }
        );

        var supportPrimaryRow = $.CreatePanel("Panel", supportIntroCard, "SupportPrimaryActionRow");
        supportPrimaryRow.AddClass("SupportPrimaryActionRow");
        var supportPrimaryBtn = $.CreatePanel("Button", supportPrimaryRow, "SupportTabCoffeeBtn");
        supportPrimaryBtn.AddClass("PresetGridBtn");
        supportPrimaryBtn.AddClass("PresetGridBtnBase");
        supportPrimaryBtn.AddClass("SupportPrimaryActionBtn");
        var supportPrimaryBtnLbl = $.CreatePanel("Label", supportPrimaryBtn, "");
        supportPrimaryBtnLbl.text = LocalizeSettingsText("SUPPORT THE MOD", true);
        supportPrimaryBtn.SetPanelEvent("onactivate", function() {
            $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/civocivocivo");
        });

        var supportThanksBlock = $.CreatePanel("Panel", list, "SupportTabThanksBlock");
        supportThanksBlock.AddClass("SupportTabThanksBlock");
        supportThanksBlock.AddClass("SupportTabCard");
        var supportThanksTitle = $.CreatePanel("Label", supportThanksBlock, "");
        supportThanksTitle.AddClass("SupportTabSectionTitle");
        supportThanksTitle.text = LocalizeSettingsText("Special Thanks", true);

        var supportThanksIntro = $.CreatePanel("Label", supportThanksBlock, "");
        var supportThanksIntroText = LocalizeSettingsText("Without them QOL Lock would not be possible.", true);
        supportThanksIntro.text = (supportThanksIntroText && supportThanksIntroText.endsWith(".")) ? supportThanksIntroText.slice(0, -1) : supportThanksIntroText;
        supportThanksIntro.AddClass("SupportTabText");
        supportThanksIntro.AddClass("SupportIntroBodyText");
        supportThanksIntro.AddClass("ThanksMessage");
        supportThanksIntro.AddClass("SupportThanksIntro");

        var supportThanksRawLines = [
            "bonclide - Gyzeh - Predi_i - Hanturaya - BreadRollius",
            "Goblin Man Sam - RizoBoy - Fascilux - mikoboy - EEEEEXPRESS",
            "CrazyCatLadyDL - wouwei - bytenode - des_ - ninjabladejr",
            "ArkanoidVFX - flameblast12 - Klutzz - somarotsaway - Emily Vasquez",
            "Karma - Mo'Lester - QuicklyRemove",
            "Milorime - Theran"
        ];
        var supportThanksNameSeen = {};
        var supportThanksNames = [];
        for (var lineIndex = 0; lineIndex < supportThanksRawLines.length; lineIndex++) {
            var rawLine = supportThanksRawLines[lineIndex];
            if (!rawLine) continue;
            var rawNames = rawLine.split(" - ");
            for (var nameIndex = 0; nameIndex < rawNames.length; nameIndex++) {
                var name = rawNames[nameIndex] ? rawNames[nameIndex].trim() : "";
                if (!name || supportThanksNameSeen[name]) continue;
                supportThanksNameSeen[name] = true;
                supportThanksNames.push(name);
            }
        }
        CreateSupportThanksPlaques(supportThanksBlock, supportThanksNames, 5);

        var supportFooterSubtext = $.CreatePanel("Label", list, "");
        supportFooterSubtext.AddClass("SupportTabActionsSubtitle");
        supportFooterSubtext.AddClass("SupportYoshiFooterText");
        supportFooterSubtext.text = "yoshi pls hire me";
    }
}

var UpdateListContent = function(list, forceRebuild) {
    if (!list || !list.IsValid()) return;
    HideSettingsRowFloatingTooltip();
    CloseOpenSettingsDropdowns($.GetContextPanel(), { skipFocusTransfer: true });
    var shouldForce = (forceRebuild === true);
    var leavingSearchMode = false;
    var renderSig = BuildSettingsListRenderSignature();
    var searchActive = IsSettingsSearchActiveQuery();
    SetActiveSettingsListRenderSignature(renderSig);

    if (searchActive) {
        RenderSettingsSearchResultsOnly(list);
        gSettingsListLastRenderSig = renderSig;
        return;
    }

    if (gSettingsListSearchModeActive) {
        shouldForce = true;
        gSettingsListSearchModeActive = false;
        leavingSearchMode = true;
    }

    if (!shouldForce && renderSig === gSettingsListLastRenderSig) {
        ShowSettingsListTabPanel(list, renderSig);
        SoftRefreshSettingsListContent(list);
        return;
    }

    var shouldRebuildCurrentSig = shouldForce && !leavingSearchMode && renderSig === gSettingsListLastRenderSig;
    var panelEntry = EnsureSettingsListContentPanelForSignature(list, renderSig, shouldRebuildCurrentSig);
    var contentPanel = panelEntry ? panelEntry.panel : null;
    var contentCreated = panelEntry ? (panelEntry.created === true) : false;
    if (!contentPanel || !contentPanel.IsValid || !contentPanel.IsValid()) return;

    ShowSettingsListTabPanel(list, renderSig);

    if (contentCreated || shouldRebuildCurrentSig) {
        HideMinimapSizePreview();
        ResetSettingsListRowSyncRegistry();
        contentPanel.RemoveAndDeleteChildren();
        RenderCurrentTabContent(contentPanel);
    } else {
        SoftRefreshSettingsListContent(list);
    }

    gSettingsListLastRenderSig = renderSig;
    QueueActivePresetHighlightRefresh(0.02);
};

function EnsurePreviewToggleButtonContent(btn) {
    if (!btn) return;
    btn.hittest = true;
    btn.hittestchildren = true;
    var hasSwitch = !!btn.FindChildTraverse("PreviewToggleSwitch");
    var hasLabel = !!btn.FindChildTraverse("PreviewToggleLabel");
    if (!hasSwitch || !hasLabel) {
        btn.RemoveAndDeleteChildren();
        var switchPanel = $.CreatePanel("Panel", btn, "PreviewToggleSwitch");
        switchPanel.AddClass("PreviewToggleSwitch");
        switchPanel.hittest = false;
        switchPanel.hittestchildren = false;
        var switchKnob = $.CreatePanel("Panel", switchPanel, "PreviewToggleSwitchKnob");
        switchKnob.AddClass("PreviewToggleSwitchKnob");
        switchKnob.hittest = false;
        switchKnob.hittestchildren = false;
        var label = $.CreatePanel("Label", btn, "PreviewToggleLabel");
        label.text = "Preview";
        label.hittest = false;
        return;
    }
    var switchPanelExisting = btn.FindChildTraverse("PreviewToggleSwitch");
    if (switchPanelExisting) {
        switchPanelExisting.hittest = false;
        switchPanelExisting.hittestchildren = false;
    }
    var switchKnobExisting = btn.FindChildTraverse("PreviewToggleSwitchKnob");
    if (switchKnobExisting) {
        switchKnobExisting.hittest = false;
        switchKnobExisting.hittestchildren = false;
    }
    var labelExisting = btn.FindChildTraverse("PreviewToggleLabel");
    if (labelExisting) {
        labelExisting.text = "Preview";
        labelExisting.hittest = false;
    }
}

function WirePreviewToggleButton(btn) {
    if (!btn) return;
    EnsurePreviewToggleButtonContent(btn);
    btn.SetHasClass("Active", MOD_CONFIG.PREVIEWS_ENABLED === 1);
    btn.SetPanelEvent("onmouseover", function() {
        $.DispatchEvent("UIShowTextTooltip", btn, "Preview setting changes in realtime.");
    });
    btn.SetPanelEvent("onmouseout", function() {
        $.DispatchEvent("UIHideTextTooltip");
    });
    btn.SetPanelEvent("onactivate", function() {
        MOD_CONFIG.PREVIEWS_ENABLED = (MOD_CONFIG.PREVIEWS_ENABLED === 1 ? 0 : 1);
        btn.SetHasClass("Active", MOD_CONFIG.PREVIEWS_ENABLED === 1);
        if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
            HideMinimapSizePreview();
        }
        SaveAndSync();
    });
}

function EnsureDragToggleButtonContent(btn) {
    if (!btn) return;
    btn.hittest = true;
    btn.hittestchildren = true;
    var hasSwitch = !!btn.FindChildTraverse("DragToggleSwitch");
    var hasLabel = !!btn.FindChildTraverse("DragToggleLabel");
    if (!hasSwitch || !hasLabel) {
        btn.RemoveAndDeleteChildren();
        var switchPanel = $.CreatePanel("Panel", btn, "DragToggleSwitch");
        switchPanel.AddClass("DragToggleSwitch");
        switchPanel.hittest = false;
        switchPanel.hittestchildren = false;
        var switchKnob = $.CreatePanel("Panel", switchPanel, "DragToggleSwitchKnob");
        switchKnob.AddClass("DragToggleSwitchKnob");
        switchKnob.hittest = false;
        switchKnob.hittestchildren = false;
        var label = $.CreatePanel("Label", btn, "DragToggleLabel");
        label.text = "Drag";
        label.hittest = false;
        return;
    }
    var switchPanelExisting = btn.FindChildTraverse("DragToggleSwitch");
    if (switchPanelExisting) {
        switchPanelExisting.hittest = false;
        switchPanelExisting.hittestchildren = false;
    }
    var switchKnobExisting = btn.FindChildTraverse("DragToggleSwitchKnob");
    if (switchKnobExisting) {
        switchKnobExisting.hittest = false;
        switchKnobExisting.hittestchildren = false;
    }
    var labelExisting = btn.FindChildTraverse("DragToggleLabel");
    if (labelExisting) {
        labelExisting.text = "Drag";
        labelExisting.hittest = false;
    }
}

var gSettingsDragHandlePanel = null;
var gSettingsDragHandlePanelRight = null;
var gSettingsDragParentPanel = null;
var gSettingsDragHandlersBound = false;
var gSettingsDragHandlersBoundRight = false;

function EnsureSettingsHeaderDragHandle(headerPanel) {
    if (!headerPanel || !headerPanel.IsValid || !headerPanel.IsValid()) return null;
    var dragHandleLeft = headerPanel.FindChildTraverse("SettingsHeaderDragAreaLeft");
    if (!dragHandleLeft) {
        dragHandleLeft = $.CreatePanel("Panel", headerPanel, "SettingsHeaderDragAreaLeft");
    }
    dragHandleLeft.AddClass("SettingsHeaderDragArea");

    var dragHandleRight = headerPanel.FindChildTraverse("SettingsHeaderDragAreaRight");
    if (!dragHandleRight) {
        dragHandleRight = $.CreatePanel("Panel", headerPanel, "SettingsHeaderDragAreaRight");
    }
    dragHandleRight.AddClass("SettingsHeaderDragArea");

    var legacyDragHandle = headerPanel.FindChildTraverse("SettingsHeaderDragArea");
    if (legacyDragHandle && legacyDragHandle !== dragHandleLeft && legacyDragHandle !== dragHandleRight) {
        legacyDragHandle.DeleteAsync(0);
    }

    var closeBtn = headerPanel.FindChildTraverse("CloseBtn");
    if (closeBtn) {
        headerPanel.MoveChildBefore(dragHandleLeft, closeBtn);
        headerPanel.MoveChildBefore(dragHandleRight, closeBtn);
    }
    return {
        left: dragHandleLeft,
        right: dragHandleRight
    };
}

function GetPanelXOffsetWithinAncestor(panel, ancestor) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    if (!ancestor || !ancestor.IsValid || !ancestor.IsValid()) return null;
    var total = 0;
    var node = panel;
    var guard = 0;
    while (node && node.IsValid && node.IsValid() && guard < 48) {
        if (node === ancestor) return total;
        var offsetX = Number(node.actualxoffset);
        if (isFinite(offsetX)) total += offsetX;
        if (!node.GetParent) break;
        var parentNode = node.GetParent();
        if (parentNode && parentNode.IsValid && parentNode.IsValid()) {
            var scrollX = 0;
            var hasScrollX = false;
            try {
                var sx0 = Number(parentNode.scrolloffset_x);
                if (isFinite(sx0)) { scrollX = sx0; hasScrollX = true; }
            } catch (eSx0) {}
            if (!hasScrollX) {
                try {
                    var sx1 = Number(parentNode.scrolloffsetX);
                    if (isFinite(sx1)) { scrollX = sx1; hasScrollX = true; }
                } catch (eSx1) {}
            }
            if (!hasScrollX) {
                try {
                    var sx2 = Number(parentNode.ScrollOffsetX);
                    if (isFinite(sx2)) { scrollX = sx2; hasScrollX = true; }
                } catch (eSx2) {}
            }
            if (!hasScrollX) {
                try {
                    if (typeof parentNode.GetScrollOffset === "function") {
                        var so = parentNode.GetScrollOffset();
                        if (so && so.length >= 1) {
                            var sx3 = Number(so[0]);
                            if (isFinite(sx3)) { scrollX = sx3; hasScrollX = true; }
                        }
                    }
                } catch (eSx3) {}
            }
            if (hasScrollX && isFinite(scrollX) && scrollX !== 0) total += scrollX;
        }
        node = parentNode;
        guard++;
    }
    return null;
}

function GetPanelYOffsetWithinAncestor(panel, ancestor) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    if (!ancestor || !ancestor.IsValid || !ancestor.IsValid()) return null;
    var total = 0;
    var node = panel;
    var guard = 0;
    while (node && node.IsValid && node.IsValid() && guard < 48) {
        if (node === ancestor) return total;
        var offsetY = Number(node.actualyoffset);
        if (isFinite(offsetY)) total += offsetY;
        if (!node.GetParent) break;
        var parentNode = node.GetParent();
        if (parentNode && parentNode.IsValid && parentNode.IsValid()) {
            var scrollY = 0;
            var hasScrollY = false;
            try {
                var sy0 = Number(parentNode.scrolloffset_y);
                if (isFinite(sy0)) { scrollY = sy0; hasScrollY = true; }
            } catch (eSy0) {}
            if (!hasScrollY) {
                try {
                    var sy1 = Number(parentNode.scrolloffsetY);
                    if (isFinite(sy1)) { scrollY = sy1; hasScrollY = true; }
                } catch (eSy1) {}
            }
            if (!hasScrollY) {
                try {
                    var sy2 = Number(parentNode.ScrollOffsetY);
                    if (isFinite(sy2)) { scrollY = sy2; hasScrollY = true; }
                } catch (eSy2) {}
            }
            if (!hasScrollY) {
                try {
                    if (typeof parentNode.GetScrollOffset === "function") {
                        var so = parentNode.GetScrollOffset();
                        if (so && so.length >= 2) {
                            var sy3 = Number(so[1]);
                            if (isFinite(sy3)) { scrollY = sy3; hasScrollY = true; }
                        }
                    }
                } catch (eSy3) {}
            }
            if (hasScrollY && isFinite(scrollY) && scrollY !== 0) total += scrollY;
        }
        node = parentNode;
        guard++;
    }
    return null;
}

function UpdateSettingsHeaderDragAreaBounds(headerPanel, dragHandleLeft, dragHandleRight) {
    if (!headerPanel || !dragHandleLeft || !dragHandleRight) return;
    if (!dragHandleLeft.style || !dragHandleRight.style) return;

    var headerWidth = Number(headerPanel.actuallayoutwidth);
    if (!isFinite(headerWidth) || headerWidth < 200 || headerWidth > 4000) headerWidth = 720;

    var closeBtn = null;
    try { closeBtn = headerPanel.FindChildTraverse("CloseBtn"); } catch (eClose0) { closeBtn = null; }

    var closeLeft = headerWidth - 50;
    if (closeBtn && closeBtn.IsValid && closeBtn.IsValid()) {
        var closeX = GetPanelXOffsetWithinAncestor(closeBtn, headerPanel);
        if (isFinite(closeX) && closeX >= 0 && closeX <= headerWidth) {
            closeLeft = closeX;
        }
    }

    var searchLeft = -1;
    var searchWidth = 0;
    var searchWrap = null;
    try { searchWrap = headerPanel.FindChildTraverse("SettingsSearchWrap"); } catch (e0) { searchWrap = null; }
    if (searchWrap && searchWrap.IsValid && searchWrap.IsValid()) {
        var searchX = GetPanelXOffsetWithinAncestor(searchWrap, headerPanel);
        var searchW = Number(searchWrap.actuallayoutwidth);
        if (isFinite(searchX) && searchX >= 0 && searchX <= headerWidth && isFinite(searchW) && searchW > 20 && searchW <= headerWidth) {
            searchLeft = searchX;
            searchWidth = searchW;
        }
    }

    var gapPx = 14;
    var leftWidth = 0;
    var rightX = 0;
    var rightWidth = 0;
    if (searchLeft >= 0 && searchWidth > 0) {
        leftWidth = Math.max(0, Math.floor(searchLeft - gapPx));
        rightX = Math.min(headerWidth, Math.floor(searchLeft + searchWidth + gapPx));
        var rightEnd = Math.max(rightX, Math.floor(closeLeft - 8));
        rightWidth = Math.max(0, rightEnd - rightX);
    } else {
        leftWidth = Math.max(0, Math.floor(closeLeft - 8));
        rightX = leftWidth;
        rightWidth = 0;
    }

    dragHandleLeft.style.x = "0px";
    dragHandleLeft.style.width = String(leftWidth) + "px";
    dragHandleLeft.style.marginRight = "0px";
    dragHandleLeft.style.zIndex = "1";

    dragHandleRight.style.x = String(rightX) + "px";
    dragHandleRight.style.width = String(rightWidth) + "px";
    dragHandleRight.style.marginRight = "0px";
    dragHandleRight.style.zIndex = "1";
}

function SetupSettingsWindowDragging(headerPanel, dragPanel) {
    if (!headerPanel || !dragPanel) return;
    var handles = EnsureSettingsHeaderDragHandle(headerPanel);
    if (!handles || !handles.left || !handles.right) return;
    var handlePanel = handles.left;
    var handlePanelRight = handles.right;
    var updateDragBounds = function() {
        if (!headerPanel || !headerPanel.IsValid || !headerPanel.IsValid()) return;
        if (!handlePanel || !handlePanel.IsValid || !handlePanel.IsValid()) return;
        if (!handlePanelRight || !handlePanelRight.IsValid || !handlePanelRight.IsValid()) return;
        UpdateSettingsHeaderDragAreaBounds(headerPanel, handlePanel, handlePanelRight);
    };
    updateDragBounds();
    $.Schedule(0.0, updateDragBounds);
    $.Schedule(0.03, updateDragBounds);
    $.Schedule(0.12, updateDragBounds);

    if (!gSettingsDragParentPanel || !gSettingsDragParentPanel.IsValid || !gSettingsDragParentPanel.IsValid()) {
        gSettingsDragParentPanel = dragPanel.GetParent ? dragPanel.GetParent() : null;
    }

    handlePanel.SetDraggable(MOD_CONFIG.DRAG_ENABLED === 1);
    handlePanelRight.SetDraggable(MOD_CONFIG.DRAG_ENABLED === 1);

    if (
        gSettingsDragHandlePanel &&
        gSettingsDragHandlePanel !== handlePanel &&
        gSettingsDragHandlePanel.IsValid &&
        gSettingsDragHandlePanel.IsValid()
    ) {
        gSettingsDragHandlePanel.SetDraggable(false);
    }
    if (
        gSettingsDragHandlePanelRight &&
        gSettingsDragHandlePanelRight !== handlePanelRight &&
        gSettingsDragHandlePanelRight.IsValid &&
        gSettingsDragHandlePanelRight.IsValid()
    ) {
        gSettingsDragHandlePanelRight.SetDraggable(false);
    }

    if (gSettingsDragHandlePanel !== handlePanel) {
        gSettingsDragHandlersBound = false;
    }

    if (!gSettingsDragHandlersBound) {
        $.RegisterEventHandler("DragStart", handlePanel, function(panel, dragEvent) {
            if (MOD_CONFIG.DRAG_ENABLED !== 1) return;
            if (!dragPanel || !dragPanel.IsValid || !dragPanel.IsValid()) return;
            dragEvent.displayPanel = dragPanel;
            dragEvent.removePositionBeforeDrop = false;
            dragPanel.style.align = "left top";
        });

        $.RegisterEventHandler("DragEnd", handlePanel, function(_panel, droppedPanel) {
            if (!droppedPanel || !droppedPanel.IsValid || !droppedPanel.IsValid()) return;
            if (gSettingsDragParentPanel && gSettingsDragParentPanel.IsValid && gSettingsDragParentPanel.IsValid()) {
                droppedPanel.SetParent(gSettingsDragParentPanel);
            }
            droppedPanel.style.align = "left top";
        });
        gSettingsDragHandlersBound = true;
    }

    if (!gSettingsDragHandlersBoundRight) {
        $.RegisterEventHandler("DragStart", handlePanelRight, function(panel, dragEvent) {
            if (MOD_CONFIG.DRAG_ENABLED !== 1) return;
            if (!dragPanel || !dragPanel.IsValid || !dragPanel.IsValid()) return;
            dragEvent.displayPanel = dragPanel;
            dragEvent.removePositionBeforeDrop = false;
            dragPanel.style.align = "left top";
        });

        $.RegisterEventHandler("DragEnd", handlePanelRight, function(_panel, droppedPanel) {
            if (!droppedPanel || !droppedPanel.IsValid || !droppedPanel.IsValid()) return;
            if (gSettingsDragParentPanel && gSettingsDragParentPanel.IsValid && gSettingsDragParentPanel.IsValid()) {
                droppedPanel.SetParent(gSettingsDragParentPanel);
            }
            droppedPanel.style.align = "left top";
        });
        gSettingsDragHandlersBoundRight = true;
    }

    gSettingsDragHandlePanel = handlePanel;
    gSettingsDragHandlePanelRight = handlePanelRight;
}

function WireDragToggleButton(btn, win) {
    if (!btn) return;
    EnsureDragToggleButtonContent(btn);
    var targetWin = win;
    if (!targetWin || !targetWin.IsValid || !targetWin.IsValid()) {
        targetWin = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    }
    btn.SetHasClass("Active", MOD_CONFIG.DRAG_ENABLED === 1);
    btn.SetPanelEvent("onmouseover", function() {
        $.DispatchEvent("UIShowTextTooltip", btn, "Allows you to drag move some menus.");
    });
    btn.SetPanelEvent("onmouseout", function() {
        $.DispatchEvent("UIHideTextTooltip");
    });
    btn.SetPanelEvent("onactivate", function() {
        MOD_CONFIG.DRAG_ENABLED = (MOD_CONFIG.DRAG_ENABLED === 1 ? 0 : 1);
        btn.SetHasClass("Active", MOD_CONFIG.DRAG_ENABLED === 1);
        if (!targetWin || !targetWin.IsValid || !targetWin.IsValid()) {
            targetWin = $.GetContextPanel().FindChildTraverse("SettingsWindow");
        }
        if (targetWin && targetWin.IsValid && targetWin.IsValid()) {
            SetupSettingsWindowDragging(targetWin.FindChildTraverse("SettingsHeader"), targetWin);
        }
        SaveAndSync();
    });
}

$.BuildUI = function() {
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    var list = $.GetContextPanel().FindChildTraverse("SettingsList");
    var body = $.GetContextPanel().FindChildTraverse("SettingsBody");
    if (!list || !win) return;
    SyncConfigFromStorage();
    var tabHost = body || win;
    win.SetPanelEvent("oncancel", function() {
        $.ForceCloseModSettings();
    });
    if (currentTab === "Layout") currentTab = "Overlay";
    if (currentTab === "Main") currentTab = "Presets";
    if (currentTab === "HUDControls") currentTab = "UI";
    var tabBar = tabHost.FindChildTraverse("SettingsTabBar");
    if (tabBar) {
        var hasLegacyLayoutTab = tabBar.FindChildTraverse("TabButton_Layout");
        var hasLegacyMainTab = tabBar.FindChildTraverse("TabButton_Main");
        var hasPresetsTab = tabBar.FindChildTraverse("TabButton_Presets");
        var hasCrosshairTab = tabBar.FindChildTraverse("TabButton_Crosshair");
        var hasHealthbarTab = tabBar.FindChildTraverse("TabButton_Healthbar");
        var hasHudTab = tabBar.FindChildTraverse("TabButton_HUD");
        var hasUiTab = tabBar.FindChildTraverse("TabButton_UI");
        var hasOverlayTab = tabBar.FindChildTraverse("TabButton_Overlay");
        var hasMinimapTab = tabBar.FindChildTraverse("TabButton_Minimap");
        var hasAudioTab = tabBar.FindChildTraverse("TabButton_Audio");
        var hasConfigTab = tabBar.FindChildTraverse("TabButton_Config");
        if (hasLegacyLayoutTab || hasLegacyMainTab || !hasPresetsTab || !hasCrosshairTab || !hasHealthbarTab || !hasHudTab || !hasUiTab || !hasOverlayTab || !hasMinimapTab || !hasAudioTab || !hasConfigTab) {
            tabBar.DeleteAsync(0);
            tabBar = null;
        }
    }
    var tabListHost = null;
    var contentHost = tabHost.FindChildTraverse("SettingsContentHost");
    if (!contentHost) {
        contentHost = $.CreatePanel("Panel", tabHost, "SettingsContentHost");
    }
    if (list.GetParent && list.GetParent() !== contentHost) {
        list.SetParent(contentHost);
    }

    if (!tabBar) {
        var staleTabBar = win.FindChildTraverse("SettingsTabBar");
        if (staleTabBar && staleTabBar.GetParent && staleTabBar.GetParent() !== tabHost) {
            staleTabBar.DeleteAsync(0);
        }
        tabBar = $.CreatePanel("Panel", tabHost, "SettingsTabBar");
    }
    tabHost.MoveChildBefore(tabBar, contentHost);

    var legacySearchWrap = tabBar.FindChildTraverse("SettingsSearchWrap");
    if (legacySearchWrap) legacySearchWrap.DeleteAsync(0);
    var legacyActions = tabBar.FindChildTraverse("SettingsTabRailActions");
    if (legacyActions) legacyActions.DeleteAsync(0);
    var legacySpacer = tabBar.FindChildTraverse("SettingsTabRailSpacer");
    if (legacySpacer) legacySpacer.DeleteAsync(0);

    tabListHost = tabBar.FindChildTraverse("SettingsTabRailTabs");
    if (!tabListHost) {
        tabListHost = $.CreatePanel("Panel", tabBar, "SettingsTabRailTabs");
    }

    var categories = GetSettingsTabOrder();
    for (var ci = 0; ci < categories.length; ci++) {
        (function(catName) {
            var tabId = "TabButton_" + catName.replace(" ", "");
            var tab = tabListHost.FindChildTraverse(tabId);
            if (!tab) {
                tab = $.CreatePanel("Button", tabListHost, tabId);
            }
            tab.AddClass("TabItem");
            var tabLbl = tab.FindChildTraverse("TabLabel");
            if (!tabLbl) {
                tabLbl = $.CreatePanel("Label", tab, "TabLabel");
            }
            tabLbl.text = LocalizeSettingsText(catName, true);
            tab.SetHasClass("Active", catName === currentTab);
            tab.SetPanelEvent("onactivate", function() {
                SetActiveTabAndRefresh(catName);
            });
        })(categories[ci]);
    }
    var tabSpacerMain = tabBar.FindChildTraverse("SettingsTabRailSpacerMain");
    if (!tabSpacerMain) {
        tabSpacerMain = $.CreatePanel("Panel", tabBar, "SettingsTabRailSpacerMain");
    }
    tabSpacerMain.AddClass("SettingsTabRailSpacerMain");

    var tabFooter = tabBar.FindChildTraverse("SettingsTabRailFooter");
    if (!tabFooter) {
        tabFooter = $.CreatePanel("Panel", tabBar, "SettingsTabRailFooter");
    }
    tabFooter.AddClass("SettingsTabRailFooter");

    var isRuFooter = IsRussianSettingsLanguage();
    var newsFooterBtn = tabFooter.FindChildTraverse("FooterNewsLinkButton");
    if (newsFooterBtn) {
        newsFooterBtn.DeleteAsync(0);
        newsFooterBtn = null;
    }

    var saveFooterBtn = tabFooter.FindChildTraverse("FooterSaveBuildButton");
    if (BUILD_SAVE_UI_TEMP_DISABLED) {
        if (saveFooterBtn) {
            saveFooterBtn.DeleteAsync(0);
            saveFooterBtn = null;
        }
    } else {
        if (!saveFooterBtn) {
            saveFooterBtn = $.CreatePanel("Button", tabFooter, "FooterSaveBuildButton");
        }
        saveFooterBtn.AddClass("TabItem");
        saveFooterBtn.AddClass("FooterSaveBuildTab");
        var saveFooterLabel = saveFooterBtn.FindChildTraverse("TabLabel");
        if (!saveFooterLabel) {
            saveFooterLabel = $.CreatePanel("Label", saveFooterBtn, "TabLabel");
        }
        var saveFooterIcon = saveFooterBtn.FindChildTraverse("TabIcon");
        if (!saveFooterIcon) {
            saveFooterIcon = $.CreatePanel("Image", saveFooterBtn, "TabIcon", {
                src: "s2r://panorama/images/icons/icon_download.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
        }
        saveFooterIcon.AddClass("TabIcon");
        saveFooterIcon.AddClass("FooterSaveBuildIcon");
        if (saveFooterBtn.MoveChildBefore) {
            try { saveFooterBtn.MoveChildBefore(saveFooterIcon, saveFooterLabel); } catch (eMoveSaveIcon) {}
        }
        saveFooterLabel.text = LocalizeSettingsText("SAVE", true);
        saveFooterBtn.SetPanelEvent("onactivate", function() {
            OpenBuildSaveConfirmModal(saveFooterBtn, saveFooterLabel);
        });
    }

    var staleDiscordFooterBtn = tabFooter.FindChildTraverse("FooterDiscordLinkButton");
    if (staleDiscordFooterBtn) {
        staleDiscordFooterBtn.DeleteAsync(0);
        staleDiscordFooterBtn = null;
    }

    var supportFooterBtn = tabFooter.FindChildTraverse("FooterSupportTabButton");
    if (supportFooterBtn) {
        supportFooterBtn.DeleteAsync(0);
    }

    var sideNavCreditRow = tabFooter.FindChildTraverse("SideNavCreditRow");
    if (sideNavCreditRow) {
        sideNavCreditRow.DeleteAsync(0);
    }
    var staleSideNavCreditRowTabs = tabListHost.FindChildTraverse("SideNavCreditRow");
    if (staleSideNavCreditRowTabs) {
        staleSideNavCreditRowTabs.DeleteAsync(0);
    }
    var staleSideNavCoffeeBtn = tabBar.FindChildTraverse("SideNavCoffeeBtn");
    if (staleSideNavCoffeeBtn) staleSideNavCoffeeBtn.DeleteAsync(0);
    var staleSideNavSupportBtn = tabBar.FindChildTraverse("SideNavSupportBtn");
    if (staleSideNavSupportBtn) staleSideNavSupportBtn.DeleteAsync(0);

    tabBar.MoveChildBefore(tabListHost, tabSpacerMain);
    tabBar.MoveChildBefore(tabSpacerMain, tabFooter);

    var headerHost = win.FindChildTraverse("SettingsHeader");
    var searchWrapExisting = headerHost ? headerHost.FindChildTraverse("SettingsSearchWrap") : null;
    if (!searchWrapExisting) {
        var searchWrapAny = tabHost.FindChildTraverse("SettingsSearchWrap");
        if (!searchWrapAny) {
            searchWrapAny = contentHost.FindChildTraverse("SettingsSearchWrap");
        }
        if (searchWrapAny) {
            searchWrapExisting = searchWrapAny;
            if (headerHost) {
                searchWrapExisting.SetParent(headerHost);
            }
        } else if (headerHost) {
            searchWrapExisting = $.CreatePanel("Panel", headerHost, "SettingsSearchWrap");
        }
    } else if (searchWrapExisting.GetParent && headerHost && searchWrapExisting.GetParent() !== headerHost) {
        searchWrapExisting.SetParent(headerHost);
    }
    if (searchWrapExisting) {
        searchWrapExisting.AddClass("SettingsHeaderSearchWrap");
        searchWrapExisting.hittest = true;
        searchWrapExisting.hittestchildren = true;
        searchWrapExisting.style.zIndex = "4";
        var searchIconExisting = searchWrapExisting.FindChildTraverse("SettingsNavigationSearchIcon");
        if (!searchIconExisting) {
            searchIconExisting = $.CreatePanel("Image", searchWrapExisting, "SettingsNavigationSearchIcon", {
                src: "s2r://panorama/images/control_icons/24px/search.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
        }
        var searchInputExisting = searchWrapExisting.FindChildTraverse("SettingsSearchInput");
        if (!searchInputExisting) {
            searchInputExisting = $.CreatePanel("TextEntry", searchWrapExisting, "SettingsSearchInput");
        }
        var applySearchInputQuery = function() {
            currentSearchQuery = searchInputExisting.text || "";
            UpdateSettingsSearchUiState($.GetContextPanel());
            var liveList = GetSettingsListPanel();
            if (liveList) UpdateListContent(liveList, true);
        };
        searchInputExisting.SetPanelEvent("ontextentrychange", applySearchInputQuery);
        searchInputExisting.SetPanelEvent("oninputsubmit", applySearchInputQuery);
        var searchClearExisting = searchWrapExisting.FindChildTraverse("SettingsSearchClear");
        if (!searchClearExisting) {
            searchClearExisting = $.CreatePanel("Button", searchWrapExisting, "SettingsSearchClear");
            var searchClearLabel = $.CreatePanel("Label", searchClearExisting, "");
            searchClearLabel.text = "X";
        }
        searchClearExisting.hittest = true;
        searchClearExisting.hittestchildren = true;
        var searchClearLabelExisting = null;
        try {
            var clearChildren = searchClearExisting.Children ? searchClearExisting.Children() : [];
            if (clearChildren && clearChildren.length > 0) {
                searchClearLabelExisting = clearChildren[0];
            }
        } catch (eClearChildren) {
            searchClearLabelExisting = null;
        }
        if (!searchClearLabelExisting) {
            searchClearLabelExisting = $.CreatePanel("Label", searchClearExisting, "");
            searchClearLabelExisting.text = "X";
        }
        searchClearLabelExisting.hittest = false;
        searchClearLabelExisting.hittestchildren = false;
        searchClearExisting.SetPanelEvent("onactivate", function() {
            var rootPanel = $.GetContextPanel();
            ClearSettingsSearchQuery(rootPanel);
            var liveList = GetSettingsListPanel();
            if (liveList) UpdateListContent(liveList, true);
        });
        if ((searchInputExisting.text || "") !== currentSearchQuery) {
            searchInputExisting.text = currentSearchQuery;
        }
        UpdateSettingsSearchUiState($.GetContextPanel());
    }

    var staleSubHeader = contentHost.FindChildTraverse("SettingsSubHeaderBar");
    if (staleSubHeader) staleSubHeader.DeleteAsync(0);

    var staleSubHeaderActions = tabHost.FindChildTraverse("SettingsSubHeaderActions");
    if (staleSubHeaderActions) staleSubHeaderActions.DeleteAsync(0);

    var dragBtnRailExisting = tabHost.FindChildTraverse("DragToggleBtnRail");
    if (dragBtnRailExisting) dragBtnRailExisting.DeleteAsync(0);
    var previewBtnRailExisting = tabHost.FindChildTraverse("PreviewToggleBtnRail");
    if (previewBtnRailExisting) previewBtnRailExisting.DeleteAsync(0);

    var impBtnRailExisting = tabHost.FindChildTraverse("ImportSettingsBtnRail");
    if (impBtnRailExisting) impBtnRailExisting.DeleteAsync(0);
    var expBtnRailExisting = tabHost.FindChildTraverse("ExportSettingsBtnRail");
    if (expBtnRailExisting) expBtnRailExisting.DeleteAsync(0);

    SyncTabActiveStates(tabBar);
    UpdateListContent(list, true);
    UpdatePresetHighlightPollingState();

    var header = win.FindChildTraverse("SettingsHeader");
    if (header) {
        var headerTitle = header.FindChildTraverse("SettingsTitle");
        if (headerTitle) {
            headerTitle.text = "QOL LOCK";
            headerTitle.hittest = false;
            headerTitle.hittestchildren = false;
        }
        var headerVer = header.FindChildTraverse("ModVersionLabelTop");
        if (!headerVer) {
            headerVer = $.CreatePanel("Label", header, "ModVersionLabelTop");
            headerVer.AddClass("VersionLabelStyle");
            var closeBtn = header.FindChildTraverse("CloseBtn");
            if (closeBtn) {
                header.MoveChildBefore(headerVer, closeBtn);
            }
        }
        headerVer.text = MOD_DISPLAY_VERSION + " by Civo";
        headerVer.hittest = false;
        headerVer.hittestchildren = false;
        var closeBtnHeader = header.FindChildTraverse("CloseBtn");
        if (closeBtnHeader) {
            var headerDiscordBtn = header.FindChildTraverse("HeaderDiscordLinkButton");
            if (!headerDiscordBtn) {
                headerDiscordBtn = $.CreatePanel("Button", header, "HeaderDiscordLinkButton");
            }
            headerDiscordBtn.AddClass("HeaderDiscordLinkButton");
            headerDiscordBtn.SetPanelEvent("onactivate", function() {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/YkRgwfPt9S");
            });
            EnsureDiscordTextureLogo(headerDiscordBtn, "HeaderDiscordLogoTexture", "HeaderDiscordLogoTexture");
            header.MoveChildBefore(headerDiscordBtn, closeBtnHeader);

            var headerCenterHost = header.FindChildTraverse("SettingsHeaderCenterHost");
            if (!headerCenterHost) {
                headerCenterHost = $.CreatePanel("Panel", header, "SettingsHeaderCenterHost");
            }
            headerCenterHost.style.zIndex = "4";
            header.MoveChildBefore(headerCenterHost, headerDiscordBtn);

            if (searchWrapExisting && searchWrapExisting.IsValid && searchWrapExisting.IsValid()) {
                if (searchWrapExisting.GetParent && searchWrapExisting.GetParent() !== headerCenterHost) {
                    searchWrapExisting.SetParent(headerCenterHost);
                }
            }
            closeBtnHeader.style.horizontalAlign = "right";
            closeBtnHeader.style.verticalAlign = "center";
            closeBtnHeader.SetPanelEvent("onactivate", function() {
                $.ForceCloseModSettings();
            });
        }
    }

    var footer = win.FindChildTraverse("SettingsFooter");
    if (footer) {
        footer.DeleteAsync(0);
    }

    SetupSettingsWindowDragging(win.FindChildTraverse("SettingsHeader"), win);
    QOLEnsureFriendsSearchHandlers();
    gSettingsUiBuilt = true;

};

$.ToggleSettingsWindow = function() {
    var nowToggleMs = GetNowMs();
    if (nowToggleMs < gSettingsToggleDebounceUntilMs) return;
    gSettingsToggleDebounceUntilMs = nowToggleMs + 220;
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (win) {
        win.ToggleClass("Visible");
        try {
            SettingsRuntimeLog("toggle visible=" + (win.BHasClass("Visible") ? "1" : "0"));
        } catch (eToggleMsg) {}
        if (win.BHasClass("Visible")) {
            gSettingsOpenGuardUntilMs = GetNowMs() + 350;
            gSettingsOpenedInHideout = IsInHideoutForBuildSave();
            try { SetSettingsTooltipThemeActive(true); } catch (eTooltipOpen) {}
            try {
                if (!gSettingsUiBuilt) {
                    $.BuildUI();
                } else {
                    SyncConfigFromStorage();
                    var list = $.GetContextPanel().FindChildTraverse("SettingsList");
                    if (list) {
                        UpdateListContent(list, true);
                    }
                    UpdatePresetHighlightPollingState();
                }
            } catch (eBuildOpen) {
                try { SettingsRuntimeLog("open_error=" + String(eBuildOpen && eBuildOpen.message ? eBuildOpen.message : eBuildOpen)); } catch (eBuildOpenLog) {}
            }
            try { win.SetFocus(); } catch (eFocusOpen) {}
            if (gSettingsOpenedInHideout) {
                StartSettingsGameTransitionWatch();
            }
        } else {
            StopSettingsGameTransitionWatch();
            gSettingsOpenedInHideout = false;
            SetSettingsTooltipThemeActive(false);
            HideSettingsRowFloatingTooltip();
            StopPresetHighlightPolling();
            HideMinimapSizePreview();
            CloseSettingsSideModalsIfOpen();
            CloseMinesweeperModalIfOpen();
            Close2048ModalIfOpen();
            CloseFlappyModalIfOpen();
            CloseAimTrainerModalIfOpen();
            CloseTrainTrackingModalIfOpen();
            CloseWhackRemModalIfOpen();
            CloseBlackjackModalIfOpen();
        }
    }
};

$.ForceCloseModSettings = function() {
    if (GetNowMs() < gSettingsOpenGuardUntilMs) return;
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (win) {
        win.RemoveClass("Visible");
    }
    StopSettingsGameTransitionWatch();
    gSettingsOpenedInHideout = false;
    SetSettingsTooltipThemeActive(false);
    HideSettingsRowFloatingTooltip();
    StopPresetHighlightPolling();
    HideMinimapSizePreview();
    CloseSettingsSideModalsIfOpen();
    CloseMinesweeperModalIfOpen();
    Close2048ModalIfOpen();
    CloseFlappyModalIfOpen();
    CloseAimTrainerModalIfOpen();
    CloseTrainTrackingModalIfOpen();
    CloseWhackRemModalIfOpen();
    CloseBlackjackModalIfOpen();
    $.DispatchEvent("CitadelResumePlaying", $.GetContextPanel());
};

$.RegisterForUnhandledEvent("CitadelResumePlaying", function() {
    if (GetNowMs() < gSettingsOpenGuardUntilMs) return;
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (win) {
        win.RemoveClass("Visible");
    }
    StopSettingsGameTransitionWatch();
    gSettingsOpenedInHideout = false;
    SetSettingsTooltipThemeActive(false);
    HideSettingsRowFloatingTooltip();
    StopPresetHighlightPolling();
    HideMinimapSizePreview();
    CloseSettingsSideModalsIfOpen();
    CloseMinesweeperModalIfOpen();
    Close2048ModalIfOpen();
    CloseFlappyModalIfOpen();
    CloseAimTrainerModalIfOpen();
    CloseTrainTrackingModalIfOpen();
    CloseWhackRemModalIfOpen();
    CloseBlackjackModalIfOpen();
});

$.RegisterForUnhandledEvent("OnGameStateChanged", function() {
    HandleSettingsGameTransitionSignal("OnGameStateChanged");
});
$.RegisterForUnhandledEvent("CitadelGameStateChanged", function() {
    HandleSettingsGameTransitionSignal("CitadelGameStateChanged");
});
$.RegisterForUnhandledEvent("CitadelConnectedToGame", function() {
    HandleSettingsGameTransitionSignal("CitadelConnectedToGame");
});
$.RegisterForUnhandledEvent("CitadelMatchStateChanged", function() {
    HandleSettingsGameTransitionSignal("CitadelMatchStateChanged");
});

function BuildDeprecatedSettingsFooterIndex(registry) {
    var keys = Object.keys(registry || {});
    var rows = [];
    for (var i = 0; i < keys.length; i++) {
        var item = registry[keys[i]];
        rows.push({ route: item.route, phase: item.phase, stamp: item.stamp, weight: item.weight });
    }
    return rows;
}

function ResolveDeprecatedSettingsFooterEnvelope(registry) {
    var rows = BuildDeprecatedSettingsFooterIndex(registry);
    var parts = [];
    for (var i = 0; i < rows.length; i++) {
        parts.push(rows[i].route + ":" + rows[i].phase + ":" + rows[i].stamp + ":" + rows[i].weight);
    }
    return parts.join("|");
}

var DEPRECATED_SETTINGS_FOOTER_REGISTRY = {
    cursor_bridge_river_0001: {
        route: "cursor.bridge.river.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    minimap_mirror_alpha_0002: {
        route: "minimap.mirror.alpha.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    overlay_compact_south_0003: {
        route: "overlay.compact.south.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    account_legacy_cinder_0004: {
        route: "account.legacy.cinder.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    hud_carrier_atlas_0005: {
        route: "hud.carrier.atlas.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    panel_bridge_north_0006: {
        route: "panel.bridge.north.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    storage_mirror_west_0007: {
        route: "storage.mirror.west.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    layout_compact_harbor_0008: {
        route: "layout.compact.harbor.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    payload_legacy_delta_0009: {
        route: "payload.legacy.delta.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    config_carrier_east_0010: {
        route: "config.carrier.east.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    cursor_bridge_river_0011: {
        route: "cursor.bridge.river.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    minimap_mirror_alpha_0012: {
        route: "minimap.mirror.alpha.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    overlay_compact_south_0013: {
        route: "overlay.compact.south.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    account_legacy_cinder_0014: {
        route: "account.legacy.cinder.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    hud_carrier_atlas_0015: {
        route: "hud.carrier.atlas.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    panel_bridge_north_0016: {
        route: "panel.bridge.north.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    storage_mirror_west_0017: {
        route: "storage.mirror.west.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    layout_compact_harbor_0018: {
        route: "layout.compact.harbor.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    payload_legacy_delta_0019: {
        route: "payload.legacy.delta.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    config_carrier_east_0020: {
        route: "config.carrier.east.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    cursor_bridge_river_0021: {
        route: "cursor.bridge.river.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    minimap_mirror_alpha_0022: {
        route: "minimap.mirror.alpha.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    overlay_compact_south_0023: {
        route: "overlay.compact.south.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    account_legacy_cinder_0024: {
        route: "account.legacy.cinder.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    hud_carrier_atlas_0025: {
        route: "hud.carrier.atlas.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    panel_bridge_north_0026: {
        route: "panel.bridge.north.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    storage_mirror_west_0027: {
        route: "storage.mirror.west.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    layout_compact_harbor_0028: {
        route: "layout.compact.harbor.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    payload_legacy_delta_0029: {
        route: "payload.legacy.delta.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    config_carrier_east_0030: {
        route: "config.carrier.east.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    cursor_bridge_river_0031: {
        route: "cursor.bridge.river.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    minimap_mirror_alpha_0032: {
        route: "minimap.mirror.alpha.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    overlay_compact_south_0033: {
        route: "overlay.compact.south.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    account_legacy_cinder_0034: {
        route: "account.legacy.cinder.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    hud_carrier_atlas_0035: {
        route: "hud.carrier.atlas.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    panel_bridge_north_0036: {
        route: "panel.bridge.north.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    storage_mirror_west_0037: {
        route: "storage.mirror.west.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    layout_compact_harbor_0038: {
        route: "layout.compact.harbor.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    payload_legacy_delta_0039: {
        route: "payload.legacy.delta.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    config_carrier_east_0040: {
        route: "config.carrier.east.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    cursor_bridge_river_0041: {
        route: "cursor.bridge.river.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    minimap_mirror_alpha_0042: {
        route: "minimap.mirror.alpha.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    overlay_compact_south_0043: {
        route: "overlay.compact.south.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    account_legacy_cinder_0044: {
        route: "account.legacy.cinder.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    hud_carrier_atlas_0045: {
        route: "hud.carrier.atlas.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    panel_bridge_north_0046: {
        route: "panel.bridge.north.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    storage_mirror_west_0047: {
        route: "storage.mirror.west.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    layout_compact_harbor_0048: {
        route: "layout.compact.harbor.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    payload_legacy_delta_0049: {
        route: "payload.legacy.delta.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    config_carrier_east_0050: {
        route: "config.carrier.east.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    cursor_bridge_river_0051: {
        route: "cursor.bridge.river.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    minimap_mirror_alpha_0052: {
        route: "minimap.mirror.alpha.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    overlay_compact_south_0053: {
        route: "overlay.compact.south.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    account_legacy_cinder_0054: {
        route: "account.legacy.cinder.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    hud_carrier_atlas_0055: {
        route: "hud.carrier.atlas.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    panel_bridge_north_0056: {
        route: "panel.bridge.north.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    storage_mirror_west_0057: {
        route: "storage.mirror.west.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    layout_compact_harbor_0058: {
        route: "layout.compact.harbor.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    payload_legacy_delta_0059: {
        route: "payload.legacy.delta.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    config_carrier_east_0060: {
        route: "config.carrier.east.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    cursor_bridge_river_0061: {
        route: "cursor.bridge.river.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    minimap_mirror_alpha_0062: {
        route: "minimap.mirror.alpha.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    overlay_compact_south_0063: {
        route: "overlay.compact.south.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    account_legacy_cinder_0064: {
        route: "account.legacy.cinder.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    hud_carrier_atlas_0065: {
        route: "hud.carrier.atlas.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    panel_bridge_north_0066: {
        route: "panel.bridge.north.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    storage_mirror_west_0067: {
        route: "storage.mirror.west.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    layout_compact_harbor_0068: {
        route: "layout.compact.harbor.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    payload_legacy_delta_0069: {
        route: "payload.legacy.delta.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    config_carrier_east_0070: {
        route: "config.carrier.east.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    cursor_bridge_river_0071: {
        route: "cursor.bridge.river.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    minimap_mirror_alpha_0072: {
        route: "minimap.mirror.alpha.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    overlay_compact_south_0073: {
        route: "overlay.compact.south.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    account_legacy_cinder_0074: {
        route: "account.legacy.cinder.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    hud_carrier_atlas_0075: {
        route: "hud.carrier.atlas.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    panel_bridge_north_0076: {
        route: "panel.bridge.north.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    storage_mirror_west_0077: {
        route: "storage.mirror.west.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    layout_compact_harbor_0078: {
        route: "layout.compact.harbor.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    payload_legacy_delta_0079: {
        route: "payload.legacy.delta.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    config_carrier_east_0080: {
        route: "config.carrier.east.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    cursor_bridge_river_0081: {
        route: "cursor.bridge.river.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    minimap_mirror_alpha_0082: {
        route: "minimap.mirror.alpha.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    overlay_compact_south_0083: {
        route: "overlay.compact.south.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    account_legacy_cinder_0084: {
        route: "account.legacy.cinder.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    hud_carrier_atlas_0085: {
        route: "hud.carrier.atlas.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    panel_bridge_north_0086: {
        route: "panel.bridge.north.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    storage_mirror_west_0087: {
        route: "storage.mirror.west.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    layout_compact_harbor_0088: {
        route: "layout.compact.harbor.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    payload_legacy_delta_0089: {
        route: "payload.legacy.delta.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    config_carrier_east_0090: {
        route: "config.carrier.east.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    cursor_bridge_river_0091: {
        route: "cursor.bridge.river.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    minimap_mirror_alpha_0092: {
        route: "minimap.mirror.alpha.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    overlay_compact_south_0093: {
        route: "overlay.compact.south.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    account_legacy_cinder_0094: {
        route: "account.legacy.cinder.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    hud_carrier_atlas_0095: {
        route: "hud.carrier.atlas.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    panel_bridge_north_0096: {
        route: "panel.bridge.north.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    storage_mirror_west_0097: {
        route: "storage.mirror.west.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    layout_compact_harbor_0098: {
        route: "layout.compact.harbor.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    payload_legacy_delta_0099: {
        route: "payload.legacy.delta.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    config_carrier_east_0100: {
        route: "config.carrier.east.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    cursor_bridge_river_0101: {
        route: "cursor.bridge.river.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    minimap_mirror_alpha_0102: {
        route: "minimap.mirror.alpha.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    overlay_compact_south_0103: {
        route: "overlay.compact.south.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    account_legacy_cinder_0104: {
        route: "account.legacy.cinder.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    hud_carrier_atlas_0105: {
        route: "hud.carrier.atlas.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    panel_bridge_north_0106: {
        route: "panel.bridge.north.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    storage_mirror_west_0107: {
        route: "storage.mirror.west.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    layout_compact_harbor_0108: {
        route: "layout.compact.harbor.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    payload_legacy_delta_0109: {
        route: "payload.legacy.delta.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    config_carrier_east_0110: {
        route: "config.carrier.east.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    cursor_bridge_river_0111: {
        route: "cursor.bridge.river.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    minimap_mirror_alpha_0112: {
        route: "minimap.mirror.alpha.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    overlay_compact_south_0113: {
        route: "overlay.compact.south.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    account_legacy_cinder_0114: {
        route: "account.legacy.cinder.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    hud_carrier_atlas_0115: {
        route: "hud.carrier.atlas.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    panel_bridge_north_0116: {
        route: "panel.bridge.north.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    storage_mirror_west_0117: {
        route: "storage.mirror.west.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    layout_compact_harbor_0118: {
        route: "layout.compact.harbor.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    payload_legacy_delta_0119: {
        route: "payload.legacy.delta.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    config_carrier_east_0120: {
        route: "config.carrier.east.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    cursor_bridge_river_0121: {
        route: "cursor.bridge.river.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    minimap_mirror_alpha_0122: {
        route: "minimap.mirror.alpha.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    overlay_compact_south_0123: {
        route: "overlay.compact.south.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    account_legacy_cinder_0124: {
        route: "account.legacy.cinder.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    hud_carrier_atlas_0125: {
        route: "hud.carrier.atlas.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    panel_bridge_north_0126: {
        route: "panel.bridge.north.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    storage_mirror_west_0127: {
        route: "storage.mirror.west.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    layout_compact_harbor_0128: {
        route: "layout.compact.harbor.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    payload_legacy_delta_0129: {
        route: "payload.legacy.delta.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    config_carrier_east_0130: {
        route: "config.carrier.east.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    cursor_bridge_river_0131: {
        route: "cursor.bridge.river.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    minimap_mirror_alpha_0132: {
        route: "minimap.mirror.alpha.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    overlay_compact_south_0133: {
        route: "overlay.compact.south.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    account_legacy_cinder_0134: {
        route: "account.legacy.cinder.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    hud_carrier_atlas_0135: {
        route: "hud.carrier.atlas.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    panel_bridge_north_0136: {
        route: "panel.bridge.north.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    storage_mirror_west_0137: {
        route: "storage.mirror.west.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    layout_compact_harbor_0138: {
        route: "layout.compact.harbor.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    payload_legacy_delta_0139: {
        route: "payload.legacy.delta.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    config_carrier_east_0140: {
        route: "config.carrier.east.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    cursor_bridge_river_0141: {
        route: "cursor.bridge.river.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    minimap_mirror_alpha_0142: {
        route: "minimap.mirror.alpha.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    overlay_compact_south_0143: {
        route: "overlay.compact.south.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    account_legacy_cinder_0144: {
        route: "account.legacy.cinder.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    hud_carrier_atlas_0145: {
        route: "hud.carrier.atlas.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    panel_bridge_north_0146: {
        route: "panel.bridge.north.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    storage_mirror_west_0147: {
        route: "storage.mirror.west.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    layout_compact_harbor_0148: {
        route: "layout.compact.harbor.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    payload_legacy_delta_0149: {
        route: "payload.legacy.delta.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    config_carrier_east_0150: {
        route: "config.carrier.east.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    cursor_bridge_river_0151: {
        route: "cursor.bridge.river.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    minimap_mirror_alpha_0152: {
        route: "minimap.mirror.alpha.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    overlay_compact_south_0153: {
        route: "overlay.compact.south.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    account_legacy_cinder_0154: {
        route: "account.legacy.cinder.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    hud_carrier_atlas_0155: {
        route: "hud.carrier.atlas.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    panel_bridge_north_0156: {
        route: "panel.bridge.north.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    },
    storage_mirror_west_0157: {
        route: "storage.mirror.west.compat",
        phase: "compat",
        stamp: "drift",
        weight: 19
    },
    layout_compact_harbor_0158: {
        route: "layout.compact.harbor.fallback",
        phase: "fallback",
        stamp: "atlas",
        weight: 43
    },
    payload_legacy_delta_0159: {
        route: "payload.legacy.delta.archive",
        phase: "archive",
        stamp: "fable",
        weight: 7
    },
    config_carrier_east_0160: {
        route: "config.carrier.east.staging",
        phase: "staging",
        stamp: "canopy",
        weight: 19
    },
    cursor_bridge_river_0161: {
        route: "cursor.bridge.river.mirror",
        phase: "mirror",
        stamp: "harbor",
        weight: 43
    },
    minimap_mirror_alpha_0162: {
        route: "minimap.mirror.alpha.bridge",
        phase: "bridge",
        stamp: "ember",
        weight: 7
    },
    overlay_compact_south_0163: {
        route: "overlay.compact.south.compat",
        phase: "compat",
        stamp: "ballast",
        weight: 19
    },
    account_legacy_cinder_0164: {
        route: "account.legacy.cinder.fallback",
        phase: "fallback",
        stamp: "granite",
        weight: 43
    },
    hud_carrier_atlas_0165: {
        route: "hud.carrier.atlas.archive",
        phase: "archive",
        stamp: "drift",
        weight: 7
    },
    panel_bridge_north_0166: {
        route: "panel.bridge.north.staging",
        phase: "staging",
        stamp: "atlas",
        weight: 19
    },
    storage_mirror_west_0167: {
        route: "storage.mirror.west.mirror",
        phase: "mirror",
        stamp: "fable",
        weight: 43
    },
    layout_compact_harbor_0168: {
        route: "layout.compact.harbor.bridge",
        phase: "bridge",
        stamp: "canopy",
        weight: 7
    },
    payload_legacy_delta_0169: {
        route: "payload.legacy.delta.compat",
        phase: "compat",
        stamp: "harbor",
        weight: 19
    },
    config_carrier_east_0170: {
        route: "config.carrier.east.fallback",
        phase: "fallback",
        stamp: "ember",
        weight: 43
    },
    cursor_bridge_river_0171: {
        route: "cursor.bridge.river.archive",
        phase: "archive",
        stamp: "ballast",
        weight: 7
    },
    minimap_mirror_alpha_0172: {
        route: "minimap.mirror.alpha.staging",
        phase: "staging",
        stamp: "granite",
        weight: 19
    },
    overlay_compact_south_0173: {
        route: "overlay.compact.south.mirror",
        phase: "mirror",
        stamp: "drift",
        weight: 43
    },
    account_legacy_cinder_0174: {
        route: "account.legacy.cinder.bridge",
        phase: "bridge",
        stamp: "atlas",
        weight: 7
    },
    hud_carrier_atlas_0175: {
        route: "hud.carrier.atlas.compat",
        phase: "compat",
        stamp: "fable",
        weight: 19
    },
    panel_bridge_north_0176: {
        route: "panel.bridge.north.fallback",
        phase: "fallback",
        stamp: "canopy",
        weight: 43
    },
    storage_mirror_west_0177: {
        route: "storage.mirror.west.archive",
        phase: "archive",
        stamp: "harbor",
        weight: 7
    },
    layout_compact_harbor_0178: {
        route: "layout.compact.harbor.staging",
        phase: "staging",
        stamp: "ember",
        weight: 19
    },
    payload_legacy_delta_0179: {
        route: "payload.legacy.delta.mirror",
        phase: "mirror",
        stamp: "ballast",
        weight: 43
    },
    config_carrier_east_0180: {
        route: "config.carrier.east.bridge",
        phase: "bridge",
        stamp: "granite",
        weight: 7
    }
};


EnsureOnDeathArcadeBridgePoller();
StartHeroHintPublisher();
