'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function plain(value) {
  if (Array.isArray(value)) return Array.from(value, plain);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value)) result[key] = plain(value[key]);
  return result;
}

const strictDeepEqual = assert.deepEqual.bind(assert);
assert.deepEqual = (actual, expected, message) =>
  strictDeepEqual(plain(actual), plain(expected), message);

const rewriteRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT)
  : path.resolve(__dirname, '../hp_colors_rewrite_v2');
const contractPath = path.join(
  rewriteRoot,
  'panorama/scripts/hp_colors_v2_contract.js',
);
const contractSource = fs.readFileSync(contractPath, 'utf8');

const statePath = path.join(
  rewriteRoot,
  'panorama/scripts/hp_colors_v2_state.js',
);
const stateSource = fs.readFileSync(statePath, 'utf8');
const wireManifestPath = path.join(
  __dirname,
  'fixtures/hp-colors-rewrite-wire-v1.json',
);
const wireManifestSource = fs.readFileSync(wireManifestPath);
const WIRE_MANIFEST_SHA256 =
  'd4ba7a4e8c4b48c99e7dd55d587813b12b47cc6257c251758f126eaded2af2fa';
const WIRE_CORPUS_SHA256 =
  '51531ab1d3b18c4edaae01330e8d9244c465302868a54f54e6aaf1d3ef8e565e';
const wireManifest = JSON.parse(wireManifestSource);
const wireCorpusSource = fs.readFileSync(
  path.join(__dirname, 'fixtures/hp-colors-rewrite-wire-v1-corpus.json'),
);
const wireCorpus = JSON.parse(wireCorpusSource);

const DEFAULT_ENTRIES = [
  ['enabled', true],
  ['widthScale', 100],
  ['heightScale', 100],
  ['positionX', 0],
  ['positionY', 0],
  ['enemyEnabled', true],
  ['enemyVisible', true],
  ['enemyMode', 'gradient'],
  ['enemyLow', '#FD4949'],
  ['enemyMid', '#FF7B00'],
  ['enemyHigh', '#00FF00'],
  ['enemyTeamHigh', false],
  ['enemyHealing', '#5FFF80'],
  ['enemyDelta', '#FFE55B'],
  ['enemyBulletShield', '#FFFFFF'],
  ['allyEnabled', false],
  ['allyVisible', true],
  ['allyMode', 'fixed'],
  ['allyLow', '#FFEFD7'],
  ['allyMid', '#FFEFD7'],
  ['allyHigh', '#FFEFD7'],
  ['allyHealing', '#5FFF80'],
  ['allyDelta', '#504C47'],
  ['allyBulletShield', '#FFFFFF'],
  ['ultMode', 'follow'],
  ['ultCustom', '#E16161'],
  ['readoutVisible', true],
  ['readoutFormat', 'hp'],
  ['readoutSize', 145],
  ['readoutFont', 'default'],
  ['readoutOffsetX', -30],
  ['readoutOffsetY', 476],
  ['readoutColorMode', 'bar'],
  ['readoutMode', 'fixed'],
  ['readoutLow', '#E16161'],
  ['readoutMid', '#FF7B00'],
  ['readoutHigh', '#FFFFFF'],
  ['pipsVisible', true],
  ['precisePipsEnabled', false],
  ['levelsVisible', true],
  ['lowThreshold', 25],
  ['highThreshold', 65],
  ['enemyPulseEnabled', true],
  ['enemyPulseThreshold', 25],
  ['enemyPulseBpm', 75],
  ['enemyPulseIntensity', 1],
  ['enemyPulseColorEnabled', false],
  ['enemyPulseColorMode', 'gradient'],
  ['enemyPulseColor', '#FF2222'],
  ['enemyPulseHideBar', false],
  ['enemyPulseReadout', false],
  ['enemyPulseReadoutModifiers', false],
  ['enemyPulseReadoutSize', 145],
  ['enemyPulseReadoutOffsetX', 27],
  ['enemyPulseReadoutOffsetY', 500],
  ['allyPulseEnabled', false],
  ['allyPulseThreshold', 25],
  ['allyPulseBpm', 75],
  ['allyPulseIntensity', 1],
  ['allyPulseColorEnabled', false],
  ['allyPulseColor', '#FF2222'],
  ['enemyKillMarkerEnabled', false],
  ['enemyKillMarkerThreshold', 25],
  ['enemyKillMarkerWidth', 3],
  ['enemyKillMarkerColor', '#FF2222'],
  ['ghoulOpacityEnabled', false],
  ['ghoulOpacity', 100],
  ['readoutMaxTeamColor', false],
  ['allyTeamHigh', false],
  ['staminaWidth', 110],
  ['staminaHeight', 44.8],
  ['staminaOffsetX', 0],
  ['staminaOffsetY', 0],
  ['enemyStaminaColorEnabled', false],
  ['enemyStaminaColor', '#FD4949'],
  ['allyPulseColorMode', 'fixed'],
];
const DEFAULT_KEYS = DEFAULT_ENTRIES.map(([key]) => key);
const DEFAULTS = Object.fromEntries(DEFAULT_ENTRIES);

function loadSettingsContract() {
  const context = { $: {} };
  vm.runInNewContext(contractSource, context, { filename: contractPath });
  const contractFactory = context.$.HPColorsV2ContractFactory;
  assert.equal(Object.isFrozen(contractFactory), true);
  assert.deepEqual(Object.getOwnPropertyNames(contractFactory), ['create']);
  return contractFactory.create();
}

function loadFactory() {
  const context = { $: {} };
  vm.runInNewContext(contractSource, context, { filename: contractPath });
  vm.runInNewContext(stateSource, context, { filename: statePath });
  assert.deepEqual(Object.keys(context.$), ['HPColorsV2StateFactory']);
  const factory = context.$.HPColorsV2StateFactory;
  assert.equal(Object.isFrozen(factory), true);
  assert.deepEqual(Object.getOwnPropertyNames(factory), ['create']);
  assert.equal(typeof factory.create, 'function');
  assert.equal(factory.create.length, 1);
  return factory;
}


test('wire fixtures match the approved byte contracts', () => {
  assert.equal(
    createHash('sha256').update(wireManifestSource).digest('hex'),
    WIRE_MANIFEST_SHA256,
  );
  assert.equal(
    createHash('sha256').update(wireCorpusSource).digest('hex'),
    WIRE_CORPUS_SHA256,
  );
});
test('state refuses to boot without the shared settings contract', () => {
  assert.throws(
    () => vm.runInNewContext(stateSource, { $: {} }, { filename: statePath }),
    /HP Colors v2 settings contract unavailable/,
  );
});

test('shared settings contract owns immutable defaults and normalization policy', () => {
  const contract = loadSettingsContract();
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.defaults), true);
  assert.equal(Object.isFrozen(contract.keys), true);
  assert.equal(Object.isFrozen(contract.settingMeta), true);
  assert.deepEqual(contract.keys, DEFAULT_KEYS);
  assert.equal(contract.codecKeys.length, 72);
  assert.equal(contract.codecKeys[12], 'excludeBuildings');
  assert.deepEqual(
    contract.codecKeys,
    wireManifest.legacySlots.map(({ key }) => key),
  );
  assert.deepEqual(
    contract.extensionKeys,
    wireManifest.extensionSlots.map(({ key }) => key),
  );
  for (const slot of [
    ...wireManifest.legacySlots,
    ...wireManifest.extensionSlots,
  ]) {
    assert.equal(contract.codecDefaults[slot.key], slot.codecDefault, slot.key);
    if (slot.retired) {
      assert.equal(contract.settingMeta[slot.key], undefined, slot.key);
      continue;
    }
    const meta = contract.settingMeta[slot.key];
    assert.ok(meta, slot.key);
    assert.equal(meta.type, slot.type, slot.key);
    assert.deepEqual(
      meta.min === null ? null : [meta.min, meta.max],
      slot.bounds,
      slot.key,
    );
    assert.deepEqual(meta.options.length ? meta.options : null, slot.enum, slot.key);
    assert.equal(meta.conditionEligible, slot.conditionEligible, slot.key);
  }
  assert.equal(contract.codecKeys[13], 'excludeBosses');
  assert.equal(contract.codecKeys[67], 'excludeGhouls');
  assert.deepEqual(contract.defaults, DEFAULTS);
  assert.deepEqual(contract.settingMeta.widthScale, {
    type: 'number',
    color: false,
    conditionEligible: true,
    min: 60,
    max: 230,
    options: [],
  });
  assert.equal(contract.settingMeta.precisePipsEnabled.conditionEligible, false);

  const normalized = contract.normalizeValues({
    enabled: 0,
    widthScale: 999,
    enemyLow: 'not-a-color',
    enemyMode: 'unsupported',
    lowThreshold: 90,
    highThreshold: 20,
  });
  assert.equal(normalized.enabled, false);
  assert.equal(normalized.widthScale, 230);
  assert.equal(normalized.enemyLow, DEFAULTS.enemyLow);
  assert.equal(normalized.enemyMode, DEFAULTS.enemyMode);
  assert.equal(normalized.lowThreshold, 64);
  assert.equal(normalized.highThreshold, 65);
  assert.equal(contract.validateSettingValue('enabled', 1), false);
  assert.equal(contract.validateSettingValue('widthScale', '120'), true);
  assert.equal(contract.validateSettingValue('missingSetting', 1), false);
});

const factory = loadFactory();

function makeSession(overrides = {}) {
  return {
    version: 1,
    values: { ...overrides.values },
    conditions: overrides.conditions || {},
    scopes: overrides.scopes || [],
    userPresets: overrides.userPresets || [],
    selectedPresetId: overrides.selectedPresetId || null,
    nextUserPresetNumber: overrides.nextUserPresetNumber || 1,
    bakedPresetNameOverrides: overrides.bakedPresetNameOverrides || {},
    hiddenBakedPresetIds: overrides.hiddenBakedPresetIds || [],
  };
}

function createState(raw) {
  const state = factory.create(raw);
  assert.equal(Object.isFrozen(state), true);
  assert.deepEqual(Object.getOwnPropertyNames(state), ['send', 'read']);
  assert.equal(typeof state.send, 'function');
  assert.equal(typeof state.read, 'function');
  return state;
}

function send(state, type, payload = {}) {
  const result = state.send({ type, ...payload });
  assert.ok(result && typeof result === 'object');
  assert.deepEqual(Object.keys(result).sort(), ['effects', 'outcome', 'view']);
  assert.ok(['committed', 'noop', 'rejected'].includes(result.outcome.status));
  assert.equal(result.outcome.action, type);
  assert.ok(result.view && typeof result.view === 'object');
  assert.deepEqual(result.view, state.read());
  assert.equal(Array.isArray(result.effects), true);
  return {
    ...result,
    status: result.outcome.status,
    action: result.outcome.action,
    code: result.outcome.code,
    transitionId: result.outcome.transitionId,
  };
}

function effect(result, type) {
  const found = result.effects.filter((candidate) => candidate.type === type);
  assert.equal(found.length, 1, `expected one ${type} effect`);
  return found[0];
}

function effectsOf(result, type) {
  return result.effects.filter((candidate) => candidate.type === type);
}

function assertNoEffect(result, type) {
  assert.equal(effectsOf(result, type).length, 0, `unexpected ${type} effect`);
}

function assertOnlyEffectTypes(result, types) {
  assert.deepEqual(
    result.effects.map((candidate) => candidate.type),
    types,
  );
}

function allRows(view) {
  return view.repository.allRows;
}

function visibleRows(view) {
  return view.repository.rows;
}

function row(view, id) {
  return allRows(view).find((candidate) => candidate.id === id);
}

function currentScope(view) {
  return view.currentScope || view.scopes.find((scope) => scope.id === 'scope_current') || null;
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function assertTransitionEffects(result) {
  for (const candidate of result.effects) {
    assert.ok(
      ['session_replace', 'effective_publish', 'clipboard_write'].includes(
        candidate.type,
      ),
    );
    assert.equal(candidate.transitionId, result.transitionId);
  }
}

function rawPreset({
  id,
  kind = 'user',
  name,
  mode = 'all',
  heroes = [],
  values = {},
  conditions = null,
}) {
  return { id, kind, name, mode, heroes, values, conditions };
}

function assertEffectivePublish(result, revision, settingId) {
  const published = effect(result, 'effective_publish');
  assert.equal(published.revision, revision);
  if (settingId !== undefined) assert.equal(published.settingId, settingId);
  assert.deepEqual(published.values, result.view.effectiveValues);
  assert.equal(typeof published.raw, 'string');
  return published;
}

test('HPCR2 corpus covers every legacy slot and canonicalizes retired slots', () => {
  assert.equal(wireCorpus.hpcr2.inputCode.startsWith('HPCR2'), true);
  const inputPairs = JSON.parse(wireCorpus.hpcr2.inputCode.slice(5)).v;
  assert.deepEqual(
    inputPairs.map(([slot]) => slot),
    wireManifest.legacySlots.map(({ slot }) => slot),
  );

  const state = createState();
  const imported = send(state, 'settings_import', {
    raw: wireCorpus.hpcr2.inputCode,
  });
  assert.equal(imported.status, 'committed');
  for (const [key, value] of Object.entries(wireCorpus.hpcr2.activeValues)) {
    assert.equal(imported.view.values[key], value, key);
  }
  assert.deepEqual(imported.view.conditions, wireCorpus.hpcr2.conditions);
  assert.equal(
    effect(send(state, 'settings_copy'), 'clipboard_write').text,
    wireCorpus.hpcr2.canonicalCode,
  );
});

test('HPCRP1 corpus covers every active slot and canonicalizes retired slots', () => {
  assert.equal(wireCorpus.hpcrp1.inputCode.startsWith('HPCRP1'), true);
  const payload = JSON.parse(wireCorpus.hpcrp1.inputCode.slice(6));
  const importedRecord = payload.records.find(
    ({ id }) => id === wireCorpus.hpcrp1.selectedPresetId,
  );
  assert.deepEqual(
    importedRecord.values.map(([slot]) => slot),
    wireManifest.legacySlots.map(({ slot }) => slot),
  );
  assert.deepEqual(
    importedRecord.hpv2.values.map(([slot]) => slot),
    wireManifest.extensionSlots.map(({ slot }) => slot),
  );

  const state = createState({
    sessionRaw: null,
    builderPresetRaw: wireCorpus.hpcrp1.inputCode,
  });
  const scope = currentScope(state.read());
  assert.ok(scope);
  assert.deepEqual(scope.values, wireCorpus.hpcrp1.activeValues);
  assert.deepEqual(scope.conditions, wireCorpus.hpcrp1.conditions);
  assert.equal(
    effect(send(state, 'preset_copy_all'), 'clipboard_write').text,
    wireCorpus.hpcrp1.canonicalCode,
  );
});

test('malformed protocol corpus rejects atomically with stable game errors', async (t) => {
  for (const fixture of wireCorpus.malformed) {
    await t.test(fixture.id, () => {
      const state = createState();
      const before = state.read();
      const action = fixture.protocol === 'HPCR2'
        ? 'settings_import'
        : 'preset_import';
      const rejected = send(state, action, { raw: fixture.code });
      assert.equal(rejected.status, 'rejected');
      assert.equal(rejected.code, fixture.gameError);
      assert.equal(rejected.view, before);
      assert.equal(rejected.effects.length, 0);
    });
  }
});

test('factory and instances expose only the frozen direct seam and stay isolated', () => {
  const left = createState();
  const right = createState();
  const initialLeft = left.read();
  const initialRight = right.read();

  assert.notEqual(left, right);
  assert.notEqual(initialLeft, initialRight);
  assert.equal(initialLeft.effectiveRevision, 0);
  assert.equal(initialRight.effectiveRevision, 0);

  const changed = send(left, 'setting_edit', {
    key: 'enemyLow',
    value: '#112233',
  });
  assert.equal(changed.status, 'committed');
  assert.equal(left.read().values.enemyLow, '#112233');
  assert.equal(right.read().values.enemyLow, DEFAULTS.enemyLow);
  assert.equal(right.read(), initialRight);
  assert.notEqual(changed.view, initialLeft);
  assertTransitionEffects(changed);
  const restored = createState({
    sessionRaw: JSON.stringify(makeSession({ values: { enemyLow: '#111111' } })),
    publishedRaw: JSON.stringify({
      version: 1,
      revision: 7,
      values: { enemyLow: '#22AA44' },
    }),
  });
  assert.equal(restored.read().values.enemyLow, '#111111');
  assert.equal(restored.read().effectiveValues.enemyLow, '#22AA44');
  assert.equal(restored.read().effectiveRevision, 7);
});

test('settling restored identity republishes an unchanged effective snapshot', () => {
  const state = createState({
    sessionRaw: JSON.stringify(makeSession({
      values: { enemyLow: '#111111' },
      userPresets: [
        rawPreset({
          id: 'user_0001',
          name: 'Haze',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#22AA44' },
        }),
      ],
    })),
    publishedRaw: JSON.stringify({
      version: 1,
      revision: 7,
      values: { enemyLow: '#22AA44' },
    }),
  });
  send(state, 'lifecycle_observe', { epoch: 1, phase: 'active' });
  send(state, 'hero_observe', { epoch: 1, heroName: 'HAZE' });
  const settled = send(state, 'hero_observe', {
    epoch: 1,
    heroName: 'HAZE',
  });

  assert.equal(settled.view.effectiveValues.enemyLow, '#22AA44');
  assert.equal(settled.view.effectiveRevision, 8);
  assertEffectivePublish(settled, 8, '*');
});

test('builder hydration waits for a selected hero before applying its preset', () => {
  const source = createState(
    makeSession({
      userPresets: [
        rawPreset({
          id: 'user_0001',
          name: 'Haze',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#22AA44' },
        }),
      ],
      selectedPresetId: 'user_0001',
    }),
  );
  const builderPresetRaw = effect(
    send(source, 'preset_copy_all'),
    'clipboard_write',
  ).text;
  const hydrated = createState({
    sessionRaw: null,
    builderPresetRaw,
  });

  assert.equal(hydrated.read().repository.selectedId, 'user_0001');
  assert.equal(hydrated.read().currentScope.mode, 'selected');
  assert.equal(hydrated.read().values.enemyLow, DEFAULTS.enemyLow);
  assert.equal(hydrated.read().effectiveValues.enemyLow, DEFAULTS.enemyLow);

  const activated = send(hydrated, 'lifecycle_observe', {
    epoch: 1,
    phase: 'active',
  });
  assert.equal(activated.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);
  const sampled = send(hydrated, 'hero_observe', {
    epoch: 1,
    heroName: 'HAZE',
  });
  assert.equal(sampled.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);
  const settled = send(hydrated, 'hero_observe', {
    epoch: 1,
    heroName: 'HAZE',
  });
  assert.equal(settled.view.effectiveValues.enemyLow, '#22AA44');
});

test('v1 hydration normalizes values and falls back atomically to shipped defaults', () => {
  const hydrated = createState(
    makeSession({
      values: {
        enabled: 0,
        widthScale: 999,
        heightScale: '120',
        enemyLow: 'abcdef',
        lowThreshold: 99,
        highThreshold: 10,
      },
      conditions: {
        enemyLow: { slot: 2, minTier: 2, value: '#abcdef' },
        precisePipsEnabled: { slot: 1, minTier: 1, value: true },
        widthScale: { slot: 9, minTier: 1, value: 120 },
      },
      scopes: [
        {
          id: 'scope_current',
          mode: 'selected',
          heroes: ['hero_haze', 'hero_haze', 'not_a_hero'],
          values: { enemyLow: '#abcdef' },
          conditions: {},
        },
        {
          id: 'scope_current',
          mode: 'all',
          heroes: ['hero_shiv'],
          values: { enemyHigh: '#123456' },
        },
      ],
      userPresets: [
        rawPreset({
          id: 'user_0001',
          name: 'Legacy Global',
          mode: 'off',
          heroes: [],
          values: { enemyVisible: false },
        }),
        rawPreset({ id: 'not_a_user_id', name: 'Dropped', values: {} }),
      ],
      nextUserPresetNumber: 1,
    }),
  );
  const view = hydrated.read();

  assert.equal(view.values.enabled, false);
  assert.equal(view.values.widthScale, 230);
  assert.equal(view.values.heightScale, 120);
  assert.equal(view.values.enemyLow, '#ABCDEF');
  assert.equal(view.values.lowThreshold < view.values.highThreshold, true);
  assert.equal(view.conditions.enemyLow.value, '#ABCDEF');
  assert.equal(view.conditions.precisePipsEnabled, undefined);
  assert.equal(view.conditions.widthScale, undefined);
  assert.deepEqual(view.scopes[0].heroes, ['hero_haze']);
  assert.equal(view.scopes.length, 1);
  assert.equal(row(view, 'user_0001').mode, 'all');
  assert.equal(row(view, 'not_a_user_id'), undefined);
  assert.equal(view.repository.nextUserNumber > 1, true);

  for (const invalid of [
    undefined,
    null,
    {},
    { version: 2, values: { enemyLow: '#112233' } },
    { version: 1, values: null },
    '{"version":1}',
  ]) {
    const fallback = createState(invalid);
    assert.deepEqual(fallback.read().values, DEFAULTS);
    assert.deepEqual(fallback.read().conditions, {});
    assert.deepEqual(fallback.read().scopes, []);
    assert.deepEqual(
      fallback.read().repository.allRows.map((candidate) => candidate.id),
      ['baked_default'],
    );
  }
});

test('schema and HPCR2 transfer use deterministic setting order and round-trip values', () => {
  const source = createState();
  const initial = source.read();
  assert.deepEqual(initial.schema.keys, DEFAULT_KEYS);
  assert.deepEqual(Object.keys(initial.schema.defaults), DEFAULT_KEYS);
  assert.equal(Array.isArray(initial.schema.settings), true);
  assert.deepEqual(
    initial.schema.settings.map((setting) => setting.key),
    DEFAULT_KEYS,
  );
  assert.deepEqual(initial.schema.defaults, DEFAULTS);

  send(source, 'setting_edit', { key: 'widthScale', value: 120 });
  send(source, 'setting_edit', { key: 'enemyVisible', value: false });
  const copied = send(source, 'settings_copy');
  const copiedClipboard = effect(copied, 'clipboard_write');
  assert.equal(copiedClipboard.purpose, 'settings');
  assert.equal(
    copiedClipboard.text,
    'HPCR2{"v":[[1,120],[6,false],[8,"#FD4949"],[20,"#FFEFD7"],[21,"#FFEFD7"],[22,"#FFEFD7"],[32,-30],[33,476]],"c":{}}',
  );
  assert.equal(copied.view.values.widthScale, 120);
  assert.equal(copied.view.values.enemyVisible, false);

  const destination = createState();
  const imported = send(destination, 'settings_import', {
    raw: 'HPCR2[[6,false],[1,120]]',
  });
  assert.equal(imported.status, 'committed');
  assert.equal(imported.view.values.widthScale, 120);
  assert.equal(imported.view.values.enemyVisible, false);
  assert.equal(imported.view.effectiveRevision, 1);
  assert.equal(effect(imported, 'effective_publish').settingId, '*');
  assert.deepEqual(
    JSON.parse(
      effect(send(destination, 'settings_copy'), 'clipboard_write').text.slice(5),
    ),
    { v: [[1, 120], [6, false]], c: {} },
  );
  const legacyImport = send(destination, 'settings_import', {
    raw: 'HPCR2[[12,true],[13,true],[20,"#123456"],[66,"#ABCDEF"],[67,true]]',
  });
  assert.equal(legacyImport.status, 'committed');
  assert.equal(legacyImport.view.values.allyLow, '#123456');
  assert.equal(legacyImport.view.values.enemyKillMarkerColor, '#ABCDEF');
  for (const key of ['excludeBuildings', 'excludeBosses', 'excludeGhouls'])
    assert.equal(Object.hasOwn(legacyImport.view.values, key), false);

  const before = destination.read();
  for (const raw of [
    'HPCR2{}',
    'HPCR2[[1,120],[1,130]]',
    'HPCR2[[6,"false"]]',
    'HPCR2[[-1,true]]',
    'HPCR2[[999,true]]',
    'HPCR1[]',
  ]) {
    const rejected = send(destination, 'settings_import', { raw });
    assert.equal(rejected.status, 'rejected', raw);
    assert.equal(rejected.view, before, raw);
    assert.deepEqual(rejected.effects, [], raw);
  }
});

test('HPCR2 exports and atomically imports ability conditions', () => {
  const source = createState();
  send(source, 'setting_edit', { key: 'widthScale', value: 120 });
  send(source, 'scope_set', { mode: 'all', heroes: [] });
  send(source, 'condition_set', {
    key: 'enemyLow',
    slot: 4,
    minTier: 3,
    value: '#123456',
  });
  assert.deepEqual(source.read().conditions, {});
  assert.deepEqual(currentScope(source.read()).conditions, {
    enemyLow: { slot: 4, minTier: 3, value: '#123456' },
  });

  const copied = effect(send(source, 'settings_copy'), 'clipboard_write').text;
  assert.deepEqual(JSON.parse(copied.slice(5)), {
    v: [
      [1, 120],
      [8, '#FD4949'],
      [20, '#FFEFD7'],
      [21, '#FFEFD7'],
      [22, '#FFEFD7'],
      [32, -30],
      [33, 476],
    ],
    c: {
      enemyLow: { slot: 4, minTier: 3, value: '#123456' },
    },
  });

  const destination = createState();
  send(destination, 'condition_set', {
    key: 'enabled',
    slot: 1,
    minTier: 1,
    value: false,
  });
  const imported = send(destination, 'settings_import', { raw: copied });
  assert.equal(imported.status, 'committed');
  assert.equal(imported.view.values.widthScale, 120);
  assert.deepEqual(imported.view.conditions, {
    enemyLow: { slot: 4, minTier: 3, value: '#123456' },
  });

  const beforeInvalid = destination.read();
  const rejected = send(destination, 'settings_import', {
    raw: 'HPCR2{"v":[],"c":{"enemyLow":{"slot":4,"minTier":3,"value":"#123456"},"unknown":{"slot":1,"minTier":1,"value":true}}}',
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.view, beforeInvalid);
  assert.deepEqual(rejected.effects, []);

  const arrayDestination = createState();
  send(arrayDestination, 'condition_set', {
    key: 'enabled',
    slot: 2,
    minTier: 2,
    value: false,
  });
  const arrayImported = send(arrayDestination, 'settings_import', {
    raw: 'HPCR2[[1,130]]',
  });
  assert.equal(arrayImported.status, 'committed');
  assert.deepEqual(
    arrayImported.view.conditions,
    {},
    'an array HPCR2 is a complete snapshot with no ability conditions',
  );
});

test('invalid intents reject atomically and no-op reads reuse the cached view', () => {
  const state = createState();
  const initial = state.read();
  assert.equal(state.read(), initial);

  const invalidSetting = send(state, 'setting_edit', {
    key: 'not_a_setting',
    value: true,
  });
  assert.equal(invalidSetting.status, 'rejected');
  assert.equal(typeof invalidSetting.code, 'string');
  assert.equal(invalidSetting.code.length > 0, true);
  assert.equal(invalidSetting.view, initial);
  assert.deepEqual(invalidSetting.effects, []);

  const noOp = send(state, 'setting_edit', {
    key: 'enemyLow',
    value: DEFAULTS.enemyLow,
  });
  assert.equal(noOp.status, 'noop');
  assert.equal(noOp.view, initial);
  assert.deepEqual(noOp.effects, []);

  const unknownIntent = send(state, 'not_a_real_intent');
  assert.equal(unknownIntent.status, 'rejected');
  assert.equal(unknownIntent.view, initial);
  assert.equal(unknownIntent.transitionId, undefined);
});

test('setting changes publish only byte-different effective snapshots', () => {
  const state = createState();
  const initial = state.read();
  const first = send(state, 'setting_edit', {
    key: 'enemyLow',
    value: '#112233',
  });
  assert.equal(first.status, 'committed');
  assert.equal(first.view.effectiveRevision, initial.effectiveRevision + 1);
  assertEffectivePublish(first, 1, 'enemyLow');

  const same = send(state, 'setting_edit', {
    key: 'enemyLow',
    value: '#112233',
  });
  assert.equal(same.status, 'noop');
  assert.equal(same.view, first.view);
  assertNoEffect(same, 'effective_publish');

  const selected = send(state, 'scope_set', {
    mode: 'selected',
    heroes: ['hero_haze'],
  });
  const selectedRevision = selected.view.effectiveRevision;
  const currentEdit = send(state, 'setting_edit', {
    key: 'enemyLow',
    value: '#334455',
  });
  assert.equal(currentEdit.status, 'committed');
  assert.equal(currentEdit.view.values.enemyLow, '#112233');
  assert.equal(currentScope(currentEdit.view).values.enemyLow, '#334455');
  assert.equal(currentEdit.view.effectiveValues.enemyLow, '#334455');
  assert.equal(currentEdit.view.repository.activeId, 'scope_current');
  assert.equal(currentEdit.view.effectiveRevision, selectedRevision + 1);
  assertEffectivePublish(currentEdit, selectedRevision + 1, 'enemyLow');

  const routeBack = send(state, 'scope_set', { mode: 'off', heroes: [] });
  assert.equal(routeBack.view.effectiveValues.enemyLow, '#112233');
  assert.equal(routeBack.view.effectiveRevision, selectedRevision + 2);
  assertEffectivePublish(routeBack, selectedRevision + 2, '*');
});

test('effective routing is Selected then All then Rewrite Default, with stable equal-scope order', () => {
  const state = createState(
    makeSession({
      values: { enemyLow: '#000001' },
      userPresets: [
        rawPreset({
          id: 'user_0001',
          name: 'First Selected',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#111111' },
        }),
        rawPreset({
          id: 'user_0002',
          name: 'Second Selected',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#222222' },
        }),
        rawPreset({
          id: 'user_0003',
          name: 'All Heroes',
          mode: 'all',
          values: { enemyLow: '#333333' },
        }),
      ],
      scopes: [
        {
          id: 'scope_current',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#999999' },
          conditions: {},
        },
      ],
    }),
  );
  let view = state.read();
  assert.equal(view.effectiveValues.enemyLow, '#999999');
  assert.equal(view.repository.activeId, 'scope_current');

  send(state, 'hero_mode', { mode: 'auto' });
  send(state, 'lifecycle_observe', { epoch: 1, phase: 'active' });
  send(state, 'hero_observe', { epoch: 1, heroName: ' Haze ' });
  const settled = send(state, 'hero_observe', {
    epoch: 1,
    heroName: 'HAZE',
  });
  view = settled.view;
  assert.equal(view.identity.effectiveHeroKey, 'hero_haze');
  assert.equal(view.effectiveValues.enemyLow, '#111111');
  assert.equal(view.repository.activeId, 'user_0001');

  send(state, 'lifecycle_observe', { epoch: 2, phase: 'active' });
  send(state, 'hero_observe', { epoch: 2, heroName: 'SHIV' });
  const all = send(state, 'hero_observe', { epoch: 2, heroName: 'SHIV' });
  assert.equal(all.view.identity.effectiveHeroKey, 'hero_shiv');
  assert.equal(all.view.effectiveValues.enemyLow, '#333333');
  assert.equal(all.view.repository.activeId, 'user_0003');

  const noMatch = createState(
    makeSession({
      userPresets: [
        rawPreset({
          id: 'user_0001',
          name: 'Only Haze',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#111111' },
        }),
      ],
      scopes: [
        {
          id: 'scope_current',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#999999' },
        },
      ],
    }),
  );
  send(noMatch, 'hero_mode', { mode: 'auto' });
  send(noMatch, 'lifecycle_observe', { epoch: 1, phase: 'active' });
  send(noMatch, 'hero_observe', { epoch: 1, heroName: 'SHIV' });
  const baked = send(noMatch, 'hero_observe', {
    epoch: 1,
    heroName: 'SHIV',
  });
  assert.equal(baked.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);
  assert.equal(baked.view.repository.activeId, 'baked_default');
});

test('hero identity settles from two samples and stale lifecycle or hero epochs cannot mutate it', () => {
  const state = createState();
  send(state, 'hero_mode', { mode: 'auto' });
  const lifecycle = send(state, 'lifecycle_observe', {
    epoch: 7,
    phase: 'active',
  });
  assert.equal(lifecycle.view.identity.epoch, 7);
  assert.equal(lifecycle.view.identity.effectiveHeroKey, '');

  const first = send(state, 'hero_observe', {
    epoch: 7,
    heroName: 'SHIV',
  });
  assert.equal(first.view.identity.effectiveHeroKey, '');
  assert.equal(first.view.identity.status, 'settling');
  const second = send(state, 'hero_observe', {
    epoch: 7,
    heroName: ' SHIV ',
  });
  assert.equal(second.view.identity.effectiveHeroKey, 'hero_shiv');
  assert.equal(second.view.identity.status, 'settled');

  const staleHero = send(state, 'hero_observe', {
    epoch: 6,
    heroName: 'HAZE',
  });
  assert.equal(staleHero.status, 'rejected');
  assert.equal(staleHero.view, second.view);

  const staleLifecycle = send(state, 'lifecycle_observe', {
    epoch: 6,
    phase: 'lobby',
  });
  assert.equal(staleLifecycle.status, 'rejected');
  assert.equal(staleLifecycle.view, second.view);

  const nextLifecycle = send(state, 'lifecycle_observe', {
    epoch: 8,
    phase: 'lobby',
  });
  assert.equal(nextLifecycle.view.identity.phase, 'lobby');
  assert.equal(nextLifecycle.view.identity.effectiveHeroKey, '');
  assert.equal(nextLifecycle.view.identity.status, 'unknown');
});

test('settled hero and unknown observations become no-ops', () => {
  const state = createState();
  send(state, 'hero_mode', { mode: 'auto' });
  send(state, 'lifecycle_observe', { epoch: 1, phase: 'active' });
  send(state, 'hero_observe', { epoch: 1, heroName: 'SHIV' });
  const settled = send(state, 'hero_observe', {
    epoch: 1,
    heroName: 'SHIV',
  });
  const stable = send(state, 'hero_observe', {
    epoch: 1,
    heroName: 'SHIV',
  });
  assert.equal(stable.status, 'noop');
  assert.equal(stable.view, settled.view);
  assert.equal(stable.effects.length, 0);

  send(state, 'lifecycle_observe', { epoch: 2, phase: 'active' });
  send(state, 'hero_observe', { epoch: 2, heroName: '' });
  const unknown = send(state, 'hero_observe', {
    epoch: 2,
    heroName: '',
  });
  const stableUnknown = send(state, 'hero_observe', {
    epoch: 2,
    heroName: '',
  });
  assert.equal(stableUnknown.status, 'noop');
  assert.equal(stableUnknown.view, unknown.view);
  assert.equal(stableUnknown.effects.length, 0);
});

test('ability observations expose a required-slot mask and fall back when tiers are lost', () => {
  const state = createState();
  const condition = send(state, 'condition_set', {
    key: 'enemyVisible',
    slot: 2,
    minTier: 2,
    value: false,
  });
  assert.deepEqual(condition.view.ability.requiredSlots, [false, true, false, false]);
  assert.deepEqual(condition.view.ability.tiers, [-1, -1, -1, -1]);

  const active = send(state, 'ability_observe', {
    epoch: condition.view.identity.epoch,
    tiers: [1, 2, 0, 3],
  });
  assert.deepEqual(active.view.ability.requiredSlots, [false, true, false, false]);
  assert.deepEqual(active.view.ability.tiers, [1, 2, 0, 3]);
  assert.equal(active.view.effectiveValues.enemyVisible, false);

  const lost = send(state, 'ability_observe', {
    epoch: condition.view.identity.epoch,
    tiers: [1, 1, 0, 3],
  });
  assert.equal(lost.view.effectiveValues.enemyVisible, DEFAULTS.enemyVisible);
  assert.equal(lost.view.effectiveRevision, active.view.effectiveRevision + 1);

  const stale = send(state, 'ability_observe', {
    epoch: condition.view.identity.epoch - 1,
    tiers: [1, 3, 0, 3],
  });
  assert.equal(stale.status, 'rejected');
  assert.equal(stale.view, lost.view);

  const twoSlots = send(state, 'condition_set', {
    key: 'enemyLow',
    slot: 4,
    minTier: 1,
    value: '#ABCDEF',
  });
  assert.deepEqual(twoSlots.view.ability.requiredSlots, [false, true, false, true]);
});

test('re-adding a required slot cannot reuse a stale observed tier', () => {
  const state = createState();
  send(state, 'condition_set', {
    key: 'enemyVisible',
    slot: 2,
    minTier: 2,
    value: false,
  });
  send(state, 'ability_observe', {
    epoch: state.read().identity.epoch,
    tiers: [1, 2, 0, 3],
  });
  send(state, 'condition_remove', { key: 'enemyVisible' });
  const readded = send(state, 'condition_set', {
    key: 'enemyVisible',
    slot: 2,
    minTier: 2,
    value: false,
  });

  assert.deepEqual(readded.view.ability.requiredSlots, [
    false,
    true,
    false,
    false,
  ]);
  assert.deepEqual(readded.view.ability.tiers, [1, -1, 0, 3]);
  assert.equal(
    readded.view.effectiveValues.enemyVisible,
    DEFAULTS.enemyVisible,
  );
});

test('condition edits update the active Current scope instead of its hidden base', () => {
  const state = createState(makeSession({
    values: {
      lowThreshold: 18,
      highThreshold: 43,
      enemyPulseThreshold: 18,
      enemyKillMarkerEnabled: true,
      enemyKillMarkerThreshold: 18,
    },
  }));
  send(state, 'condition_set', {
    key: 'enemyPulseThreshold',
    slot: 4,
    minTier: 3,
    value: 28,
  });
  send(state, 'scope_set', { mode: 'all', heroes: [] });
  const matched = send(state, 'ability_observe', {
    epoch: state.read().identity.epoch,
    tiers: [-1, -1, -1, 3],
  });
  assert.equal(matched.view.effectiveValues.enemyPulseThreshold, 28);

  const marker = send(state, 'condition_set', {
    key: 'enemyKillMarkerThreshold',
    slot: 4,
    minTier: 3,
    value: 28,
  });
  assert.equal(marker.view.effectiveValues.enemyKillMarkerThreshold, 28);
  assertEffectivePublish(marker, marker.view.effectiveRevision, '*');

  const low = send(state, 'condition_set', {
    key: 'lowThreshold',
    slot: 4,
    minTier: 3,
    value: 28,
  });
  assert.equal(low.view.effectiveValues.lowThreshold, 28);
  assertEffectivePublish(low, low.view.effectiveRevision, '*');
  assert.deepEqual(currentScope(low.view).conditions, {
    lowThreshold: { slot: 4, minTier: 3, value: 28 },
    enemyPulseThreshold: { slot: 4, minTier: 3, value: 28 },
    enemyKillMarkerThreshold: { slot: 4, minTier: 3, value: 28 },
  });
  assert.deepEqual(low.view.conditions, {
    enemyPulseThreshold: { slot: 4, minTier: 3, value: 28 },
  });

  const undoLow = send(state, 'undo');
  assert.equal(undoLow.view.effectiveValues.lowThreshold, 18);
  assert.equal(undoLow.view.effectiveValues.enemyKillMarkerThreshold, 28);
  assert.equal(currentScope(undoLow.view).conditions.lowThreshold, undefined);
  assert.deepEqual(undoLow.view.conditions, {
    enemyPulseThreshold: { slot: 4, minTier: 3, value: 28 },
  });
  assertEffectivePublish(undoLow, undoLow.view.effectiveRevision, '*');

  const resetRequest = send(state, 'reset_request', {
    keys: ['enemyKillMarkerThreshold'],
  });
  const resetMarker = send(state, 'reset_confirm', {
    token: resetRequest.view.transactions.confirmation.token,
  });
  assert.equal(resetMarker.view.effectiveValues.enemyKillMarkerThreshold, 25);
  assert.equal(
    currentScope(resetMarker.view).conditions.enemyKillMarkerThreshold,
    undefined,
  );
  const undoReset = send(state, 'undo');
  assert.equal(undoReset.view.effectiveValues.enemyKillMarkerThreshold, 28);
  assert.deepEqual(
    currentScope(undoReset.view).conditions.enemyKillMarkerThreshold,
    { slot: 4, minTier: 3, value: 28 },
  );
});

test('condition_set and condition_remove enforce typed eligible values atomically', () => {
  const state = createState();
  const valid = send(state, 'condition_set', {
    key: 'enemyLow',
    slot: 1,
    minTier: 1,
    value: '#abcdef',
  });
  assert.equal(valid.status, 'committed');
  assert.deepEqual(valid.view.conditions.enemyLow, {
    slot: 1,
    minTier: 1,
    value: '#ABCDEF',
  });

  for (const invalid of [
    { key: 'not_a_setting', slot: 1, minTier: 1, value: true },
    { key: 'precisePipsEnabled', slot: 1, minTier: 1, value: true },
    { key: 'enemyLow', slot: 0, minTier: 1, value: '#112233' },
    { key: 'enemyLow', slot: 1, minTier: 4, value: '#112233' },
    { key: 'enemyLow', slot: 1, minTier: 1, value: 'not-a-color' },
    { key: 'enemyVisible', slot: 1, minTier: 1, value: 'false' },
    { key: 'widthScale', slot: 1, minTier: 1, value: '120' },
    { key: 'enemyMode', slot: 1, minTier: 1, value: 'not-an-enum' },
  ]) {
    const before = state.read();
    const rejected = send(state, 'condition_set', invalid);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.view, before);
    assert.deepEqual(rejected.effects, []);
  }

  const removed = send(state, 'condition_remove', { key: 'enemyLow' });
  assert.equal(removed.status, 'committed');
  assert.equal(removed.view.conditions.enemyLow, undefined);
  assert.equal(removed.view.ability.requiredSlots[0], false);
});

test('gesture updates coalesce into one Undo transaction and cancel restores the start', () => {
  const state = createState();
  const initial = state.read();
  const begin = send(state, 'gesture_begin', {
    key: 'enemyLow',
  });
  assert.equal(begin.view.values.enemyLow, initial.values.enemyLow);
  const update = send(state, 'gesture_update', {
    key: 'enemyLow',
    value: '#222222',
  });
  send(state, 'gesture_update', { key: 'enemyLow', value: '#333333' });
  assert.equal(update.view.undoAvailable, false);
  const end = send(state, 'gesture_end', {
    key: 'enemyLow',
    value: '#444444',
  });
  assert.equal(end.status, 'committed');
  assert.equal(end.view.values.enemyLow, '#444444');
  assert.equal(end.view.undoAvailable, true);

  const undo = send(state, 'undo');
  assert.equal(undo.status, 'committed');
  assert.equal(undo.view.values.enemyLow, initial.values.enemyLow);
  assert.equal(undo.view.undoAvailable, false);

  send(state, 'gesture_begin', { key: 'enemyLow' });
  send(state, 'gesture_update', { key: 'enemyLow', value: '#666666' });
  const canceled = send(state, 'gesture_cancel', { key: 'enemyLow' });
  assert.equal(canceled.view.values.enemyLow, initial.values.enemyLow);
  assert.equal(canceled.view.undoAvailable, false);
});

test('reset and preset-remove confirmation tokens are shared, single-use, and stale-safe', () => {
  const state = createState(
    makeSession({
      values: { enemyLow: '#112233' },
      userPresets: [rawPreset({ id: 'user_0001', name: 'Delete Me' })],
      selectedPresetId: 'user_0001',
    }),
  );
  const before = state.read();
  const resetRequest = send(state, 'reset_request', { keys: ['enemyLow'] });
  assert.equal(resetRequest.status, 'committed');
  const resetToken = resetRequest.view.transactions.confirmation.token;
  assert.equal(typeof resetToken, 'string');
  assert.equal(resetRequest.view.values.enemyLow, '#112233');

  const removeRequest = send(state, 'preset_remove_request', {
    id: 'user_0001',
  });
  const removeToken = removeRequest.view.transactions.confirmation.token;
  assert.notEqual(removeToken, resetToken);
  assert.equal(
    send(state, 'reset_confirm', { token: resetToken }).status,
    'rejected',
  );
  assert.equal(state.read().values.enemyLow, before.values.enemyLow);

  const removed = send(state, 'preset_remove_confirm', { token: removeToken });
  assert.equal(removed.view.repository.allRows.some((candidate) => candidate.id === 'user_0001'), false);
  assert.equal(removed.view.repository.selectedId, null);
  assert.equal(removed.view.transactions.confirmation, null);

  const resetAgain = send(state, 'reset_request', { keys: ['enemyLow'] });
  const token = resetAgain.view.transactions.confirmation.token;
  const canceled = send(state, 'reset_cancel', { token });
  assert.equal(canceled.view.transactions.confirmation, null);
  assert.equal(canceled.view.values.enemyLow, '#112233');
  assert.equal(send(state, 'reset_confirm', { token }).status, 'rejected');
});

test('repository keeps baked rows first, selection inert, IDs monotonic, and updates in place', () => {
  const state = createState(
    makeSession({
      values: { enemyLow: '#101010' },
      scopes: [
        {
          id: 'scope_current',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#202020' },
          conditions: {},
        },
      ],
      userPresets: [
        rawPreset({ id: 'user_0004', name: 'Four', mode: 'all', values: { enemyLow: '#444444' } }),
        rawPreset({ id: 'user_0007', name: 'Seven', mode: 'selected', heroes: ['hero_haze'], values: { enemyLow: '#777777' } }),
      ],
      nextUserPresetNumber: 2,
      selectedPresetId: null,
    }),
  );
  let view = state.read();
  assert.deepEqual(
    allRows(view).map((candidate) => candidate.id),
    ['baked_default', 'user_0004', 'user_0007'],
  );
  assert.deepEqual(
    visibleRows(view).map((candidate) => candidate.id),
    ['baked_default', 'user_0004', 'user_0007'],
  );
  assert.equal(view.repository.nextUserNumber, 8);

  const revision = view.effectiveRevision;
  const selected = send(state, 'preset_select', { id: 'user_0004' });
  assert.equal(selected.view.repository.selectedId, 'user_0004');
  assert.equal(selected.view.effectiveRevision, revision);
  assertNoEffect(selected, 'effective_publish');
  assert.equal(selected.view.undoAvailable, false);

  const renamed = send(state, 'preset_rename', {
    id: 'user_0004',
    name: 'Renamed Four',
  });
  assert.equal(row(renamed.view, 'user_0004').name, 'Renamed Four');
  assert.equal(row(renamed.view, 'user_0004').id, 'user_0004');

  const moved = send(state, 'preset_move', { id: 'user_0007', delta: -1 });
  assert.deepEqual(
    moved.view.repository.allRows.map((candidate) => candidate.id),
    ['baked_default', 'user_0007', 'user_0004'],
  );
  const boundary = send(state, 'preset_move', { id: 'user_0007', delta: -1 });
  assert.equal(boundary.status, 'noop');

  send(state, 'preset_select', { id: null });
  const created = send(state, 'preset_save', { name: 'Created' });
  assert.equal(created.status, 'committed');
  const createdId = created.view.repository.selectedId;
  assert.match(createdId, /^user_\d{4,}$/);
  assert.equal(createdId, 'user_0008');
  assert.equal(row(created.view, createdId).mode, 'selected');
  assert.deepEqual(row(created.view, createdId).heroes, ['hero_haze']);

  const updateBefore = created.view.repository.allRows.map((candidate) => candidate.id);
  const updated = send(state, 'preset_save', { name: 'Updated Created' });
  assert.equal(updated.view.repository.selectedId, createdId);
  assert.equal(row(updated.view, createdId).name, 'Updated Created');
  assert.deepEqual(
    updated.view.repository.allRows.map((candidate) => candidate.id),
    updateBefore,
  );
  assertNoEffect(updated, 'effective_publish');
});

test('repository rename, remove/hide, restore, and reference repair remain non-live', () => {
  const state = createState(
    makeSession({
      userPresets: [
        rawPreset({ id: 'user_0001', name: 'One' }),
        rawPreset({ id: 'user_0002', name: 'Two' }),
      ],
      selectedPresetId: 'user_0002',
      hiddenBakedPresetIds: [],
    }),
  );
  const initial = state.read();
  const revision = initial.effectiveRevision;

  const request = send(state, 'preset_remove_request', { id: 'baked_default' });
  const bakedToken = request.view.transactions.confirmation.token;
  const hidden = send(state, 'preset_remove_confirm', { token: bakedToken });
  assert.equal(hidden.view.repository.rows.some((candidate) => candidate.id === 'baked_default'), false);
  assert.equal(hidden.view.repository.allRows.some((candidate) => candidate.id === 'baked_default'), true);
  assert.deepEqual(hidden.view.repository.hiddenBakedIds, ['baked_default']);
  assert.equal(hidden.view.effectiveRevision, revision);
  assertNoEffect(hidden, 'effective_publish');

  const restored = send(state, 'preset_restore_baked');
  assert.equal(restored.view.repository.rows[0].id, 'baked_default');
  assert.deepEqual(restored.view.repository.hiddenBakedIds, []);

  const remove = send(state, 'preset_remove_request', { id: 'user_0002' });
  const removeToken = remove.view.transactions.confirmation.token;
  const deleted = send(state, 'preset_remove_confirm', { token: removeToken });
  assert.equal(deleted.view.repository.allRows.some((candidate) => candidate.id === 'user_0002'), false);
  assert.equal(deleted.view.repository.selectedId, 'user_0001');
  assert.equal(
    Object.prototype.hasOwnProperty.call(deleted.view.repository, 'pendingId'),
    false,
  );
  assert.equal(deleted.view.effectiveRevision, revision);
  assert.equal(deleted.view.undoAvailable, false);
  assertNoEffect(deleted, 'effective_publish');
});

test('preset apply updates layout and ally bar immediately', () => {
  const state = createState(
    makeSession({
      userPresets: [
        rawPreset({ id: 'user_0001', name: 'All', mode: 'all', values: { enemyLow: '#111111', widthScale: 230, allyEnabled: true, allyVisible: false } }),
        rawPreset({ id: 'user_0002', name: 'Haze', mode: 'selected', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
      ],
      selectedPresetId: null,
    }),
  );
  const selected = send(state, 'preset_select', { id: 'user_0002' });
  assert.equal(selected.view.repository.selectedId, 'user_0002');
  assert.equal(selected.view.repository.activeId, null);
  assert.equal(
    Object.prototype.hasOwnProperty.call(selected.view.repository, 'pendingId'),
    false,
  );

  const selectedApplied = send(state, 'preset_apply', { id: 'user_0002' });
  assert.equal(selectedApplied.status, 'committed');
  assert.equal(selectedApplied.view.repository.selectedId, 'user_0002');
  assert.equal(selectedApplied.view.repository.activeId, 'user_0002');
  assert.equal(selectedApplied.view.effectiveValues.enemyLow, '#222222');
  assert.equal(selectedApplied.view.currentScope.mode, 'selected');
  assertEffectivePublish(
    selectedApplied,
    selectedApplied.view.effectiveRevision,
    '*',
  );

  const allApplied = send(state, 'preset_apply', { id: 'user_0001' });
  assert.equal(allApplied.view.repository.activeId, 'user_0001');
  assert.equal(allApplied.view.effectiveValues.enemyLow, '#111111');
  assert.equal(allApplied.view.currentScope.mode, 'all');
  assert.equal(allApplied.view.effectiveValues.widthScale, 230);
  assert.equal(allApplied.view.effectiveValues.allyEnabled, true);
  assert.equal(allApplied.view.effectiveValues.allyVisible, false);

  const beforeBakedApply = allApplied.view;
  const bakedApplied = send(state, 'preset_apply', { id: 'baked_default' });
  assert.equal(bakedApplied.view.currentScope, null);
  const undoneBakedApply = send(state, 'undo');
  assert.deepEqual(
    undoneBakedApply.view.currentScope,
    beforeBakedApply.currentScope,
  );
  assert.deepEqual(undoneBakedApply.view.values, beforeBakedApply.values);
  assert.deepEqual(
    undoneBakedApply.view.effectiveValues,
    beforeBakedApply.effectiveValues,
  );
});

test('repository-only actions emit replacement data but never revision, effective publish, or Undo', () => {
  const state = createState(
    makeSession({
      userPresets: [rawPreset({ id: 'user_0001', name: 'One' })],
    }),
  );
  const initial = state.read();
  const selected = send(state, 'preset_select', { id: 'user_0001' });
  const replacement = effect(selected, 'session_replace');
  assert.equal(typeof replacement.raw, 'string');
  assert.equal(selected.view.effectiveRevision, initial.effectiveRevision);
  assert.equal(selected.view.undoAvailable, false);
  assertNoEffect(selected, 'effective_publish');

  const renamed = send(state, 'preset_rename', { id: 'user_0001', name: 'Renamed' });
  assert.equal(renamed.view.effectiveRevision, initial.effectiveRevision);
  assert.equal(renamed.view.undoAvailable, false);
  assertNoEffect(renamed, 'effective_publish');

  const copied = send(state, 'preset_copy_all');
  assertOnlyEffectTypes(copied, ['clipboard_write']);
  assert.equal(copied.view.effectiveRevision, initial.effectiveRevision);
  assert.equal(copied.view.undoAvailable, false);
});

test('HPCRP1 copy/import preserves metadata, validates atomically, and allocates fresh monotonic IDs', () => {
  const source = createState(
    makeSession({
      userPresets: [
        rawPreset({
          id: 'user_0004',
          name: 'Conditional Haze',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#224466' },
          conditions: {
            enemyLow: { slot: 2, minTier: 1, value: '#33AA55' },
          },
        }),
      ],
      selectedPresetId: 'user_0004',
      bakedPresetNameOverrides: { baked_default: 'Factory' },
      hiddenBakedPresetIds: ['baked_default'],
    }),
  );
  const selectedCode = effect(
    send(source, 'preset_copy_selected'),
    'clipboard_write',
  ).text;
  const allCode = effect(send(source, 'preset_copy_all'), 'clipboard_write').text;
  assert.match(selectedCode, /^HPCRP1/);
  assert.match(allCode, /^HPCRP1/);
  const allPayload = JSON.parse(allCode.slice(6));
  assert.deepEqual(
    allPayload.records.map((candidate) => candidate.id),
    ['baked_default', 'user_0004'],
  );
  assert.equal(allPayload.records[0].name, 'Factory');
  assert.deepEqual(allPayload.hiddenBakedPresetIds, ['baked_default']);
  assert.equal(allPayload.records.some((candidate) => candidate.id === 'scope_current'), false);

  const destination = createState(
    makeSession({
      userPresets: [rawPreset({ id: 'user_0007', name: 'Existing' })],
      nextUserPresetNumber: 1,
    }),
  );
  const before = destination.read();
  const imported = send(destination, 'preset_import', { raw: allCode });
  assert.equal(imported.status, 'committed');
  assert.deepEqual(
    imported.view.repository.allRows.map((candidate) => candidate.id),
    ['baked_default', 'user_0007', 'user_0008'],
  );
  const importedRow = row(imported.view, 'user_0008');
  assert.equal(importedRow.name, 'Conditional Haze');
  assert.equal(importedRow.mode, 'selected');
  assert.deepEqual(importedRow.heroes, ['hero_haze']);
  assert.deepEqual(importedRow.conditions.enemyLow, {
    slot: 2,
    minTier: 1,
    value: '#33AA55',
  });
  assert.equal(imported.view.repository.selectedId, 'user_0008');
  assert.deepEqual(imported.view.effectiveValues, before.effectiveValues);
  assert.equal(imported.view.effectiveRevision, before.effectiveRevision);
  assert.equal(imported.view.undoAvailable, false);
  assertNoEffect(imported, 'effective_publish');

  const hiddenSelectionPayload = JSON.parse(JSON.stringify(allPayload));
  hiddenSelectionPayload.records = [hiddenSelectionPayload.records[0]];
  hiddenSelectionPayload.selectedPresetId = 'baked_default';
  delete hiddenSelectionPayload.hiddenBakedPresetIds;
  const hiddenSelectionDestination = createState(
    makeSession({ hiddenBakedPresetIds: ['baked_default'] }),
  );
  const hiddenSelectionImport = send(
    hiddenSelectionDestination,
    'preset_import',
    { raw: `HPCRP1${JSON.stringify(hiddenSelectionPayload)}` },
  );
  assert.equal(hiddenSelectionImport.status, 'committed');
  assert.equal(
    hiddenSelectionImport.view.repository.hiddenBakedIds.includes(
      'baked_default',
    ),
    true,
  );
  assert.equal(hiddenSelectionImport.view.repository.selectedId, null);

  const destinationBeforeInvalid = destination.read();
  const malformedPayload = JSON.parse(allCode.slice(6));
  malformedPayload.records.push({
    id: 'user_bad',
    kind: 'user',
    name: 'Bad',
    mode: 'selected',
    heroes: ['not_a_hero'],
    values: [[8, '#112233']],
    conditions: null,
  });
  const rejected = send(destination, 'preset_import', {
    raw: `HPCRP1${JSON.stringify(malformedPayload)}`,
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.view, destinationBeforeInvalid);
  assert.deepEqual(rejected.effects, []);
});

test('clipboard effects carry only declarative transfer requests and transition identity', () => {
  const state = createState();
  const settings = send(state, 'settings_copy');
  const settingsEffect = effect(settings, 'clipboard_write');
  assert.equal(settingsEffect.purpose, 'settings');
  assert.match(settingsEffect.text, /^HPCR2\{/);
  assert.equal(settingsEffect.transitionId, settings.transitionId);

  const noSelection = send(state, 'preset_copy_selected');
  assert.equal(noSelection.status, 'rejected');
  assert.deepEqual(noSelection.effects, []);

  const save = send(state, 'preset_save', { name: 'Copy Me' });
  const copied = send(state, 'preset_copy_selected');
  const presetEffect = effect(copied, 'clipboard_write');
  assert.equal(presetEffect.purpose, 'preset');
  assert.match(presetEffect.text, /^HPCRP1/);
  assert.equal(presetEffect.transitionId, copied.transitionId);
  assert.equal(copied.transitionId > save.transitionId, true);
});

test('transition IDs are monotonic while effective revisions change only on byte identity changes', () => {
  const state = createState();
  const first = state.read();
  assert.equal(first.transitionId, 0);
  assert.equal(first.effectiveRevision, 0);

  const edit = send(state, 'setting_edit', { key: 'enemyLow', value: '#010203' });
  assert.equal(edit.transitionId, first.transitionId + 1);
  assert.equal(edit.view.effectiveRevision, first.effectiveRevision + 1);
  const editPublish = effect(edit, 'effective_publish');
  assert.equal(editPublish.revision, edit.view.effectiveRevision);
  assert.equal(editPublish.transitionId, edit.transitionId);

  const repo = send(state, 'preset_save', { name: 'Repository Only' });
  assert.equal(repo.transitionId, edit.transitionId + 1);
  assert.equal(repo.view.effectiveRevision, edit.view.effectiveRevision);
  assertNoEffect(repo, 'effective_publish');

  const noop = send(state, 'setting_edit', { key: 'enemyLow', value: '#010203' });
  assert.equal(noop.status, 'noop');
  assert.equal(noop.view.transitionId, repo.transitionId);
  assert.equal(noop.view.effectiveRevision, repo.view.effectiveRevision);
});

test('views are deeply frozen and reuse unchanged sections across no-op and live transitions', () => {
  const state = createState();
  const initial = state.read();
  assertDeepFrozen(initial);
  assert.throws(() => {
    initial.values.enemyLow = '#000000';
  }, /read only|Cannot assign/);
  assert.throws(() => {
    initial.repository.rows.push({});
  }, /not extensible|Cannot add/);

  const changed = send(state, 'setting_edit', {
    key: 'enemyLow',
    value: '#AABBCC',
  });
  assert.notEqual(changed.view, initial);
  assert.notEqual(changed.view.values, initial.values);
  assert.notEqual(changed.view.effectiveValues, initial.effectiveValues);
  assert.equal(changed.view.schema, initial.schema);
  assert.equal(changed.view.heroes, initial.heroes);
  assert.notEqual(changed.view.repository, initial.repository);
  assert.equal(changed.view.repository.activeId, null);
  assert.equal(changed.view.identity, initial.identity);
  assert.equal(changed.view.ability, initial.ability);
  assert.equal(changed.view.transactions, initial.transactions);
  assertDeepFrozen(changed.view);

  const noOp = send(state, 'setting_edit', {
    key: 'enemyLow',
    value: '#AABBCC',
  });
  assert.equal(noOp.view, changed.view);
  assert.equal(state.read(), changed.view);
});

test('editor close clears interactions but keeps runtime conditions observable', () => {
  const state = createState(
    makeSession({
      values: { enemyPulseThreshold: 18 },
      conditions: {
        enemyPulseThreshold: { slot: 4, minTier: 3, value: 28 },
      },
    }),
  );
  const matched = send(state, 'ability_observe', {
    epoch: state.read().identity.epoch,
    tiers: [-1, -1, -1, 3],
  });
  assert.equal(matched.view.effectiveValues.enemyPulseThreshold, 28);
  send(state, 'setting_edit', { key: 'enemyLow', value: '#112233' });
  send(state, 'gesture_begin', { key: 'enemyHigh' });
  send(state, 'reset_request', { keys: ['enemyLow'] });
  const beforeClose = state.read();

  const closed = send(state, 'editor_close');
  assert.equal(closed.status, 'committed');
  assert.equal(closed.view.undoAvailable, false);
  assert.equal(closed.view.transactions.gesture, null);
  assert.equal(closed.view.transactions.confirmation, null);
  assert.deepEqual(closed.view.ability.tiers, [-1, -1, -1, 3]);
  assert.equal(closed.view.identity, beforeClose.identity);
  assert.equal(closed.view.effectiveValues.enemyPulseThreshold, 28);

  const tierLost = send(state, 'ability_observe', {
    epoch: closed.view.identity.epoch,
    tiers: [-1, -1, -1, 2],
  });
  assert.equal(tierLost.status, 'committed');
  assert.equal(tierLost.view.effectiveValues.enemyPulseThreshold, 18);
});

test('session close invalidates interactions and stale callbacks while preserving applied settings', () => {
  const state = createState(
    makeSession({
      values: { enemyLow: '#112233' },
      userPresets: [
        rawPreset({
          id: 'user_0001',
          name: 'Haze',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#223344' },
        }),
      ],
      selectedPresetId: 'user_0001',
    }),
  );
  send(state, 'setting_edit', { key: 'enemyLow', value: '#334455' });
  send(state, 'gesture_begin', { key: 'enemyHigh' });
  const reset = send(state, 'reset_request', { keys: ['enemyLow'] });
  const resetToken = reset.view.transactions.confirmation.token;
  send(state, 'preset_apply', { id: 'user_0001' });
  const beforeClose = state.read();
  assert.equal(beforeClose.undoAvailable, true);
  assert.notEqual(beforeClose.transactions.gesture, null);
  assert.notEqual(beforeClose.transactions.confirmation, null);
  assert.equal(currentScope(beforeClose).values.enemyLow, '#223344');

  const closed = send(state, 'session_close');
  assert.equal(closed.status, 'committed');
  assert.equal(closed.view.undoAvailable, false);
  assert.equal(closed.view.transactions.gesture, null);
  assert.equal(closed.view.transactions.confirmation, null);
  assert.equal(currentScope(closed.view).values.enemyLow, '#223344');
  assert.equal(closed.view.identity.effectiveHeroKey, '');
  assert.equal(closed.view.identity.status, 'unknown');
  assert.equal(send(state, 'undo').status, 'rejected');
  assert.equal(send(state, 'reset_confirm', { token: resetToken }).status, 'rejected');
  assert.equal(
    send(state, 'hero_observe', { epoch: beforeClose.identity.epoch, heroName: 'SHIV' }).status,
    'rejected',
  );

  const reopened = send(state, 'session_open');
  assert.equal(reopened.status, 'committed');
  assert.equal(reopened.view.undoAvailable, false);
  assert.equal(reopened.view.transactions.confirmation, null);
  assert.equal(reopened.view.transactions.gesture, null);
});
