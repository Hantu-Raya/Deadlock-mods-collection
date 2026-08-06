'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  FULL_ONLY_SETTING_IDS,
  HP_COLORS_LANE_CONTRACT,
  buildMinimalSettingIds,
  checkBooleanFlagDefaults,
  checkFullSettingsContract,
  checkForbiddenSourceTerms,
  checkLevelTierCssParity,
  checkLoopReasonContract,
  checkMinimalSettingsContract,
  checkObjectInterface,
  checkRuntimePanelIds,
  collectHpColorsSettingsSourceOfTruth,
  collectLoopReasonContract,
  extractAssignedObjectShape,
} = require('./hp-colors-validator-contract.js');

const SHARED_RUNTIME_COLOR_SETTING_IDS = Object.freeze([
  'hp_heal_color',
  'hp_delta_color',
  'hp_bullet_shield_color',
  'hp_friend_heal_color',
  'hp_friend_delta_color',
  'hp_friend_bullet_shield_color',
]);

function sharedIds() {
  return Array.from({ length: 49 }, (_item, index) => `hp_setting_${String(index).padStart(2, '0')}`);
}

function fullIds() {
  return [
    ...sharedIds().slice(0, 10),
    SHARED_RUNTIME_COLOR_SETTING_IDS[0],
    SHARED_RUNTIME_COLOR_SETTING_IDS[1],
    SHARED_RUNTIME_COLOR_SETTING_IDS[2],
    ...sharedIds().slice(10, 25),
    SHARED_RUNTIME_COLOR_SETTING_IDS[3],
    SHARED_RUNTIME_COLOR_SETTING_IDS[4],
    SHARED_RUNTIME_COLOR_SETTING_IDS[5],
    ...sharedIds().slice(25),
    'hp_precise_pips_enabled',
  ];
}

function defaultFor(id, index) {
  if (id === 'hp_precise_pips_enabled') return false;
  if (id.includes('color')) return `#${String(index).padStart(6, '0').slice(0, 6)}`;
  return index;
}

function aliasesFor(ids, overrides = {}) {
  const aliases = {};
  ids.forEach((id, index) => {
    aliases[id] = overrides[id] || `a${index}`;
  });
  return aliases;
}

function objectLiteral(values) {
  return Object.entries(values)
    .map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`)
    .join('\n');
}

function settingsLiteral(ids, defaults) {
  return ids
    .map((id) => `    { id: ${JSON.stringify(id)}, defaultValue: ${JSON.stringify(defaults[id])} },`)
    .join('\n');
}

function valuesFor(ids, overrides = {}) {
  const values = {};
  ids.forEach((id, index) => {
    values[id] = Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : defaultFor(id, index);
  });
  return values;
}

function makeFullSources(options = {}) {
  const ids = fullIds();
  const defaults = valuesFor(ids, options.schemaDefaultOverrides || {});
  const runtimeIds = options.runtimeIds || ids;
  const runtimeDefaults = valuesFor(runtimeIds, options.runtimeDefaultOverrides || {});
  const aliases = options.aliases || aliasesFor(ids, options.aliasOverrides || {});
  const bridge = Object.assign({}, HP_COLORS_LANE_CONTRACT.bridge, HP_COLORS_LANE_CONTRACT.presetStore, options.bridgeOverrides || {});
  const ui = `
    const EVENT_CHANNEL = ${JSON.stringify(bridge.eventChannel)};
    const PRESET_SNAPSHOT_MAGIC = ${JSON.stringify(bridge.presetSnapshotMagic)};
    const PRESET_REQUEST_MAGIC = ${JSON.stringify(bridge.presetRequestMagic)};
    const BULK_UPDATE_MAGIC = ${JSON.stringify(bridge.bulkUpdateMagic)};
    const SINGLE_UPDATE_MAGIC = ${JSON.stringify(bridge.singleUpdateMagic)};
    const BOOTSTRAP_REQUEST_MAGIC = ${JSON.stringify(bridge.bootstrapRequestMagic)};
    const REGISTER_MAGIC = ${JSON.stringify(bridge.registerMagic)};
    const ALIVE_MAGIC = ${JSON.stringify(bridge.aliveMagic)};
    const HANDSHAKE_MAGIC = ${JSON.stringify(bridge.handshakeMagic)};
    const SHARED_CFG_RAW_KEY = ${JSON.stringify(bridge.sharedCfgRawKey)};
    const SHARED_MATCH_RESET_KEY = ${JSON.stringify(bridge.sharedMatchResetKey)};
    const HP_PRESET_STORE_ID = ${JSON.stringify(bridge.storeId)};
    const HP_STARTUP_PRESET_ID = ${JSON.stringify(bridge.startupPresetId)};
    const HP_PRESET_ENTRY_CLASS = ${JSON.stringify(bridge.entryClass)};
    const HPSettingsContract = {
      storageNamespace: "hp_colors",
      storageVersion: 99,
      SETTINGS: [
${settingsLiteral(ids, defaults)}
      ],
      ALIASES: {
${objectLiteral(aliases)}
      },
    };
    const HPBridgeProtocol = {
      eventChannel: EVENT_CHANNEL,
      presetSnapshotMagic: PRESET_SNAPSHOT_MAGIC,
      presetRequestMagic: PRESET_REQUEST_MAGIC,
      bulkUpdateMagic: BULK_UPDATE_MAGIC,
      singleUpdateMagic: SINGLE_UPDATE_MAGIC,
      bootstrapRequestMagic: BOOTSTRAP_REQUEST_MAGIC,
      registerMagic: REGISTER_MAGIC,
      aliveMagic: ALIVE_MAGIC,
      handshakeMagic: HANDSHAKE_MAGIC,
      sharedCfgRawKey: SHARED_CFG_RAW_KEY,
      sharedMatchResetKey: SHARED_MATCH_RESET_KEY,
      storeId: HP_PRESET_STORE_ID,
      startupPresetId: HP_STARTUP_PRESET_ID,
      entryClass: HP_PRESET_ENTRY_CLASS,
    };
  `;
  const runtimeBridge = Object.assign({}, bridge, options.runtimeBridgeOverrides || {});
  const runtime = `
    var EVENT_CHANNEL = ${JSON.stringify(runtimeBridge.eventChannel)};
    var PRESET_SNAPSHOT_MAGIC = ${JSON.stringify(runtimeBridge.presetSnapshotMagic)};
    var PRESET_REQUEST_MAGIC = ${JSON.stringify(runtimeBridge.presetRequestMagic)};
    var BULK_UPDATE_MAGIC = ${JSON.stringify(runtimeBridge.bulkUpdateMagic)};
    var SINGLE_UPDATE_MAGIC = ${JSON.stringify(runtimeBridge.singleUpdateMagic)};
    var BOOTSTRAP_REQUEST_MAGIC = ${JSON.stringify(runtimeBridge.bootstrapRequestMagic)};
    var SHARED_CFG_RAW_KEY = ${JSON.stringify(runtimeBridge.sharedCfgRawKey)};
    var SHARED_DURABLE_CFG_RAW_KEY = ${JSON.stringify(runtimeBridge.sharedDurableCfgRawKey)};
    var SHARED_BOOTSTRAP_SEEN_KEY = ${JSON.stringify(runtimeBridge.sharedBootstrapSeenKey)};
    var SHARED_FIRST_PAINT_PROBE_KEY = ${JSON.stringify(runtimeBridge.sharedFirstPaintProbeKey)};
    var SHARED_PRESET_REQUEST_KEY = ${JSON.stringify(runtimeBridge.sharedPresetRequestKey)};
    var SHARED_MATCH_RESET_KEY = ${JSON.stringify(runtimeBridge.sharedMatchResetKey)};
    var SHARED_MATCH_RESET_ACK_KEY = ${JSON.stringify(runtimeBridge.sharedMatchResetAckKey)};
    var DEFAULTS = {
${objectLiteral(runtimeDefaults)}
    };
    var HPBridgeProtocol = {
      eventChannel: EVENT_CHANNEL,
      presetSnapshotMagic: PRESET_SNAPSHOT_MAGIC,
      presetRequestMagic: PRESET_REQUEST_MAGIC,
      bulkUpdateMagic: BULK_UPDATE_MAGIC,
      singleUpdateMagic: SINGLE_UPDATE_MAGIC,
      bootstrapRequestMagic: BOOTSTRAP_REQUEST_MAGIC,
      registerMagic: REGISTER_MAGIC,
      aliveMagic: ALIVE_MAGIC,
      handshakeMagic: HANDSHAKE_MAGIC,
      sharedCfgRawKey: SHARED_CFG_RAW_KEY,
      sharedMatchResetKey: SHARED_MATCH_RESET_KEY,
      storeId: HP_PRESET_STORE_ID,
      startupPresetId: HP_STARTUP_PRESET_ID,
      entryClass: HP_PRESET_ENTRY_CLASS,
    };
    function coerceCfgValue(id, value) {
      if (id === "hp_counter_position" || id === "hp_pulse_text_position") return String(value);
      return value;
    }
  `;
  return { ui, runtime, ids, defaults, runtimeDefaults, aliases };
}

function makeMinimalSources(fullContract, options = {}) {
  const ids = options.ids || buildMinimalSettingIds(fullContract.schemaIds);
  const runtimeDefaults = {};
  ids.forEach((id) => {
    runtimeDefaults[id] = Object.prototype.hasOwnProperty.call(options.defaultOverrides || {}, id)
      ? options.defaultOverrides[id]
      : fullContract.runtimeDefaults[id];
  });
  if (options.extraRuntimeDefaults) Object.assign(runtimeDefaults, options.extraRuntimeDefaults);
  const aliases = aliasesFor(ids, options.aliasOverrides || {});
  if (options.extraAliases) Object.assign(aliases, options.extraAliases);
  const bridge = Object.assign({
    eventChannel: HP_COLORS_LANE_CONTRACT.bridge.eventChannel,
    presetSnapshotMagic: HP_COLORS_LANE_CONTRACT.bridge.presetSnapshotMagic,
    presetRequestMagic: HP_COLORS_LANE_CONTRACT.bridge.presetRequestMagic,
    sharedCfgRawKey: HP_COLORS_LANE_CONTRACT.bridge.sharedCfgRawKey,
    rootCfgRawAttr: HP_COLORS_LANE_CONTRACT.minimal.rootCfgRawAttr,
    storeId: HP_COLORS_LANE_CONTRACT.presetStore.storeId,
    startupPresetId: HP_COLORS_LANE_CONTRACT.presetStore.startupPresetId,
    entryClass: HP_COLORS_LANE_CONTRACT.presetStore.entryClass,
  }, options.bridgeOverrides || {});
  const runtimeBridge = Object.assign({}, bridge, options.runtimeBridgeOverrides || {});
  const publisher = `
    var STORE_ID = ${JSON.stringify(bridge.storeId)};
    var STARTUP_PRESET_ID = ${JSON.stringify(bridge.startupPresetId)};
    var ENTRY_CLASS = ${JSON.stringify(bridge.entryClass)};
    var EVENT_CHANNEL = ${JSON.stringify(bridge.eventChannel)};
    var SNAPSHOT_MAGIC = ${JSON.stringify(bridge.presetSnapshotMagic)};
    var REQUEST_MAGIC = ${JSON.stringify(bridge.presetRequestMagic)};
    var SHARED_CFG_RAW_KEY = ${JSON.stringify(bridge.sharedCfgRawKey)};
    var ROOT_CFG_RAW_ATTR = ${JSON.stringify(bridge.rootCfgRawAttr)};
    var HPBridgeProtocol = {
      eventChannel: EVENT_CHANNEL,
      presetSnapshotMagic: SNAPSHOT_MAGIC,
      presetRequestMagic: REQUEST_MAGIC,
      sharedCfgRawKey: SHARED_CFG_RAW_KEY,
      rootCfgRawAttr: ROOT_CFG_RAW_ATTR,
      storeId: STORE_ID,
      startupPresetId: STARTUP_PRESET_ID,
      entryClass: ENTRY_CLASS,
    };
    var HP_PERSIST_ALIASES = {
${objectLiteral(aliases)}
    };
  `;
  const runtime = `
    var EVENT_CHANNEL = ${JSON.stringify(runtimeBridge.eventChannel)};
    var SNAPSHOT_MAGIC = ${JSON.stringify(runtimeBridge.presetSnapshotMagic)};
    var REQUEST_MAGIC = ${JSON.stringify(runtimeBridge.presetRequestMagic)};
    var SHARED_CFG_RAW_KEY = ${JSON.stringify(runtimeBridge.sharedCfgRawKey)};
    var ROOT_CFG_RAW_ATTR = ${JSON.stringify(runtimeBridge.rootCfgRawAttr)};
    var HPBridgeProtocol = {
      eventChannel: EVENT_CHANNEL,
      presetSnapshotMagic: SNAPSHOT_MAGIC,
      presetRequestMagic: REQUEST_MAGIC,
      sharedCfgRawKey: SHARED_CFG_RAW_KEY,
      rootCfgRawAttr: ROOT_CFG_RAW_ATTR,
    };
    function coerceCfgValue(id, value) {
      if (id === "hp_counter_position" || id === "hp_pulse_text_position") return String(value);
      return value;
    }
    var DEFAULTS = {
${objectLiteral(runtimeDefaults)}
    };
  `;
  return { publisher, runtime, ids, runtimeDefaults, aliases };
}
test('full 56 settings, defaults, aliases, and bridge pass', () => {
  const full = makeFullSources();
  const report = checkFullSettingsContract(full.ui, full.runtime);
  assert.deepEqual(report.errors, []);
  assert.equal(report.contract.schemaIds.length, 56);
  assert.equal(report.contract.runtimeDefaultKeys.length, 56);
});

test('missing runtime default fails', () => {
  const ids = fullIds();
  const full = makeFullSources({ runtimeIds: ids.filter((id) => id !== 'hp_setting_00') });
  const report = checkFullSettingsContract(full.ui, full.runtime);
  assert.match(report.errors.join('\n'), /DEFAULTS missing key: hp_setting_00/);
});

test('duplicate compact alias value fails', () => {
  const full = makeFullSources({ aliasOverrides: { hp_setting_01: 'a0' } });
  const report = checkFullSettingsContract(full.ui, full.runtime);
  assert.match(report.errors.join('\n'), /duplicate compact alias value: a0/);
});

test('minimal projection keeps the full 56-setting runtime schema', () => {
  const full = makeFullSources();
  const fullReport = checkFullSettingsContract(full.ui, full.runtime);
  const minimal = makeMinimalSources(fullReport.contract);
  const report = checkMinimalSettingsContract(minimal.publisher, minimal.runtime, fullReport.contract);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(FULL_ONLY_SETTING_IDS, []);
  assert.equal(report.expectedMinimalIds.length, 56);
  assert.equal(report.contract.runtimeDefaultKeys.length, 56);
  assert.equal(Object.keys(report.contract.aliases).length, 56);
  for (const id of SHARED_RUNTIME_COLOR_SETTING_IDS) {
    assert.equal(report.expectedMinimalIds.includes(id), true, `${id} is part of the minimal projection`);
    assert.equal(report.contract.runtimeDefaultKeys.includes(id), true, `${id} is present in minimal DEFAULTS`);
    assert.equal(Object.prototype.hasOwnProperty.call(report.contract.aliases, id), true, `${id} is present in minimal aliases`);
    assert.equal(report.contract.runtimeDefaults[id], fullReport.contract.runtimeDefaults[id], `${id} default matches full lane`);
  }
});

test('minimal requires shared color ids in runtime defaults and aliases', () => {
  const full = makeFullSources();
  const fullReport = checkFullSettingsContract(full.ui, full.runtime);
  const minimal = makeMinimalSources(fullReport.contract, {
    ids: buildMinimalSettingIds(fullReport.contract.schemaIds).filter((id) => id !== 'hp_bullet_shield_color'),
  });
  const report = checkMinimalSettingsContract(minimal.publisher, minimal.runtime, fullReport.contract);
  assert.doesNotMatch(report.errors.join('\n'), /full-only setting leakage/);
  assert.match(report.errors.join('\n'), /minimal DEFAULTS missing key: hp_bullet_shield_color/);
  assert.match(report.errors.join('\n'), /minimal aliases missing key: hp_bullet_shield_color/);
});

test('minimal unknown hp_* runtime knob fails', () => {
  const full = makeFullSources();
  const fullReport = checkFullSettingsContract(full.ui, full.runtime);
  const minimal = makeMinimalSources(fullReport.contract, {
    extraRuntimeDefaults: { hp_unknown_runtime_knob: true },
    extraAliases: { hp_unknown_runtime_knob: 'urk' },
  });
  const report = checkMinimalSettingsContract(minimal.publisher, minimal.runtime, fullReport.contract);
  assert.match(report.errors.join('\n'), /unknown hp_\* leakage: hp_unknown_runtime_knob/);
});

test('minimal default drift from full projection fails', () => {
  const full = makeFullSources();
  const fullReport = checkFullSettingsContract(full.ui, full.runtime);
  const minimal = makeMinimalSources(fullReport.contract, { defaultOverrides: { hp_setting_02: 999 } });
  const report = checkMinimalSettingsContract(minimal.publisher, minimal.runtime, fullReport.contract);
  assert.match(report.errors.join('\n'), /default mismatch for hp_setting_02/);
});

test('bridge literal drift fails', () => {
  const full = makeFullSources({ runtimeBridgeOverrides: { presetSnapshotMagic: 'DRIFTED_MAGIC' } });
  const report = checkFullSettingsContract(full.ui, full.runtime);
  assert.match(report.errors.join('\n'), /bridge literal drift.*presetSnapshotMagic/);
});

test('full publisher bridge/store fields pass when all fields match', () => {
  const full = makeFullSources();
  const report = checkFullSettingsContract(full.ui, full.runtime);
  assert.deepEqual(report.errors, []);
  assert.equal(report.contract.bridge.publisher.storeId, HP_COLORS_LANE_CONTRACT.presetStore.storeId);
  assert.equal(report.contract.bridge.publisher.startupPresetId, HP_COLORS_LANE_CONTRACT.presetStore.startupPresetId);
  assert.equal(report.contract.bridge.publisher.entryClass, HP_COLORS_LANE_CONTRACT.presetStore.entryClass);
});

test('full runtime shared-store fields fail if match reset ack drifts', () => {
  const full = makeFullSources({ runtimeBridgeOverrides: { sharedMatchResetAckKey: '__hpColorsMatchResetAckDrifted' } });
  const report = checkFullSettingsContract(full.ui, full.runtime);
  assert.match(report.errors.join('\n'), /full runtime bridge literal drift for sharedMatchResetAckKey/);
});

test('minimal publisher store fields fail if entry class drifts', () => {
  const full = makeFullSources();
  const fullReport = checkFullSettingsContract(full.ui, full.runtime);
  const minimal = makeMinimalSources(fullReport.contract, { bridgeOverrides: { entryClass: 'hp_colors_preset_entry_drifted' } });
  const report = checkMinimalSettingsContract(minimal.publisher, minimal.runtime, fullReport.contract);
  assert.match(report.errors.join('\n'), /minimal publisher bridge literal drift for entryClass/);
});

test('source of truth exposes storage, count, and legacy aliases', () => {
  const full = makeFullSources();
  const source = collectHpColorsSettingsSourceOfTruth(full.ui);
  assert.equal(source.expectedCount, 56);
  assert.equal(source.storageVersion, 99);
  assert.equal(source.legacyAliases.kzs, 'hp_kill_zone_color');
  assert.equal(source.aliasToId.kzs, 'hp_kill_zone_color');
});

test('missing runtime position coercion marker fails', () => {
  const full = makeFullSources();
  const runtime = full.runtime.replace('id === "hp_counter_position" || id === "hp_pulse_text_position"', 'id === "hp_counter_position"');
  const report = checkFullSettingsContract(full.ui, runtime);
  assert.match(report.errors.join('\n'), /runtime position coercion missing marker: hp_pulse_text_position/);
});

test('object interface accepts function properties and shorthand methods', () => {
  const source = `
    var Shape = {
      alpha: function (value) { return value; },
      beta(value) { return value; },
      data: 1,
    };
  `;
  const shape = extractAssignedObjectShape(source, 'Shape');
  assert.equal(shape.exists, true);
  assert.deepEqual(shape.methods, ['alpha', 'beta']);
  assert.deepEqual(shape.properties, ['alpha', 'beta', 'data']);
  const errors = [];
  checkObjectInterface(errors, 'source.js', source, 'Shape', ['alpha', 'beta']);
  assert.deepEqual(errors, []);
});

test('object interface reports missing method without checking parameters', () => {
  const source = `
    const Shape = {
      alpha: function (unexpected, names) { return unexpected || names; },
    };
  `;
  const errors = [];
  checkObjectInterface(errors, 'source.js', source, 'Shape', ['alpha', 'beta']);
  assert.deepEqual(errors, ['source.js Shape missing method: beta']);
});

test('loop reason contract accepts literal reasons and decision.reason', () => {
  const source = `
    var LOOP_REASON_ALLOWLIST = {
      preset_apply: true,
      enemy_paint: true,
    };
    scheduleLoop(0, 0.1, "preset_apply");
    requestLoopKick(0, 0, decision.reason);
  `;
  const errors = [];
  const contract = collectLoopReasonContract(source);
  checkLoopReasonContract(errors, 'runtime', source, ['preset_apply', 'enemy_paint']);
  assert.deepEqual(contract.scheduledReasons, ['preset_apply']);
  assert.deepEqual(errors, []);
});

test('loop reason contract rejects an unallowlisted literal reason', () => {
  const source = `
    var LOOP_REASON_ALLOWLIST = {
      preset_apply: true,
    };
    scheduleLoop(0, 0.1, "enemy_unknown");
  `;
  const errors = [];
  checkLoopReasonContract(errors, 'runtime', source, ['preset_apply']);
  assert.match(errors.join('\n'), /scheduleLoop uses reason outside LOOP_REASON_ALLOWLIST: enemy_unknown/);
});

test('runtime panel id contract rejects forbidden fallback literals', () => {
  const source = `
    var ID_HEALTH = "UnitStatus";
    function find(root) {
      return root.FindChildTraverse("health_bar");
    }
  `;
  const errors = [];
  checkRuntimePanelIds(errors, 'runtime', source, new Set(['UnitStatus']), ['health_bar']);
  assert.match(errors.join('\n'), /uses unverified runtime panel id: health_bar/);
  assert.match(errors.join('\n'), /contains forbidden fallback panel id: health_bar/);
});

test('level tier parity passes with non-inline LEVEL_TIERS formatting', () => {
  const runtime = `
    var LEVEL_TIERS = [
      { min: 11, cls: "level_tier2" },
      {
        min: 19,
        cls: "level_tier3"
      },
    ];
  `;
  const css = `
    .level_tier2 {}
    .level_tier3 {}
  `;
  const errors = [];
  checkLevelTierCssParity(errors, 'runtime', runtime, css, [
    { min: 11, cls: 'level_tier2' },
    { min: 19, cls: 'level_tier3' },
  ]);
  assert.deepEqual(errors, []);
});

test('boolean flag defaults reject true for a production-quiet flag', () => {
  const errors = [];
  checkBooleanFlagDefaults(errors, 'runtime', 'var DEBUG_ENABLED = true;', { DEBUG_ENABLED: false });
  assert.deepEqual(errors, ['runtime DEBUG_ENABLED must default false']);
});
