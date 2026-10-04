'use strict';

const assert = require('node:assert/strict');
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
const wireManifest = JSON.parse(wireManifestSource);
const wireCorpusSource = fs.readFileSync(
  path.join(__dirname, 'fixtures/hp-colors-rewrite-wire-v1-corpus.json'),
);
const wireCorpus = JSON.parse(wireCorpusSource);

const CONTRACT = loadSettingsContract();
const DEFAULTS = CONTRACT.defaults;
const DEFAULT_KEYS = Object.keys(DEFAULTS);
const CODEC_DEFAULTS = CONTRACT.codecDefaults;
const CODEC_KEYS = CONTRACT.codecKeys;
const EXTENSION_KEYS = CONTRACT.extensionKeys;
const SETTING_META = CONTRACT.settingMeta;

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
  const retainedGlobals = Object.keys(context.$).filter(
    key => key !== 'HPColorsV2ContractFactory',
  );
  vm.runInNewContext(stateSource, context, { filename: statePath });
  assert.deepEqual(Object.keys(context.$), retainedGlobals.concat('HPColorsV2StateFactory'));
  const factory = context.$.HPColorsV2StateFactory;
  assert.equal(Object.isFrozen(factory), true);
  assert.deepEqual(Object.getOwnPropertyNames(factory), ['create']);
  assert.equal(typeof factory.create, 'function');
  assert.equal(factory.create.length, 1);
  return factory;
}



test('shared settings contract owns immutable defaults and normalization policy', () => {
  const contract = loadSettingsContract();
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.defaults), true);
  assert.equal(Object.isFrozen(contract.keys), true);
  assert.equal(Object.isFrozen(contract.settingMeta), true);
  assert.equal(contract.codecKeys.length, 72);
  assert.equal(contract.extensionKeys.length, 87);
  assert.deepEqual(contract.extensionKeys.slice(68, 70), ['nameAlign', 'hpTextAlign']);
  for (const key of ['nameAlign', 'hpTextAlign']) {
    assert.equal(contract.defaults[key], key === 'nameAlign' ? 'center' : 'left');
    assert.equal(contract.sparseDefaults[key], key === 'nameAlign' ? 'center' : 'left');
    assert.equal(contract.settingMeta[key].conditionEligible, true);
    assert.deepEqual(contract.settingMeta[key].options, ['left', 'center', 'right']);
  }
  for (const key of ['ultOffsetY', 'levelOffsetY']) {
    assert.equal(contract.defaults[key], -29);
    assert.equal(contract.sparseDefaults[key], 0);
  }
  assert.equal(contract.codecKeys[12], 'excludeBuildings');
  assert.deepEqual(
    contract.codecKeys,
    wireManifest.legacySlots.map(({ key }) => key),
  );
  assert.deepEqual(
    contract.extensionKeys.slice(0, wireManifest.extensionSlots.length),
    wireManifest.extensionSlots.map(({ key }) => key),
  );
  const currentBounds = {
    widthScale: [60, 400], heightScale: [60, 400],
    positionX: [-2000, 2000], positionY: [-2100, 2100],
    staminaOffsetX: [-2000, 2000], staminaOffsetY: [-2100, 2100],
    ultOffsetX: [-3334, 3334], ultOffsetY: [-3500, 3500],
    levelOffsetX: [-3334, 3334], levelOffsetY: [-3500, 3500],
    readoutOffsetX: [-334, 334], readoutOffsetY: [-350, 350],
    allyReadoutOffsetX: [-334, 334], allyReadoutOffsetY: [-350, 350],
    enemyPulseReadoutOffsetX: [-334, 334], enemyPulseReadoutOffsetY: [-350, 350],
  };
  for (const slot of [
    ...wireManifest.legacySlots,
    ...wireManifest.extensionSlots,
  ]) {
    assert.equal(contract.codecDefaults[slot.key], slot.codecDefault, slot.key);
    if (slot.retired || ['readoutFormat', 'allyReadoutFormat', 'precisePipsEnabled',
      'readoutMaxTeamColor', 'allyReadoutMaxTeamColor'].includes(slot.key)) {
      assert.equal(contract.settingMeta[slot.key], undefined, slot.key);
      continue;
    }
    const meta = contract.settingMeta[slot.key];
    assert.ok(meta, slot.key);
    assert.equal(meta.type, slot.type, slot.key);
    assert.deepEqual(
      meta.min === null ? null : [meta.min, meta.max],
      currentBounds[slot.key] || slot.bounds,
      slot.key,
    );
    assert.deepEqual(meta.options.length ? meta.options : null, slot.enum, slot.key);
    assert.equal(meta.conditionEligible, slot.conditionEligible, slot.key);
  }
  assert.equal(contract.codecKeys[13], 'excludeBosses');
  assert.equal(contract.codecKeys[67], 'excludeGhouls');
  assert.deepEqual(contract.settingMeta.widthScale, {
    type: 'number',
    color: false,
    conditionEligible: true,
    min: 60,
    max: 400,
    options: [],
  });
  assert.equal(contract.settingMeta.precisePipsEnabled, undefined);

  const normalized = contract.normalizeValues({
    enabled: 0,
    widthScale: 999,
    enemyLow: 'not-a-color',
    enemyMode: 'unsupported',
    lowThreshold: 90,
    highThreshold: 20,
  });
  assert.equal(normalized.enabled, false);
  assert.equal(normalized.widthScale, 400);
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
function nonDefaultValue(key) {
  const meta = SETTING_META[key];
  const fallback = DEFAULTS[key];
  if (meta.type === 'boolean') return !fallback;
  if (meta.type === 'color')
    return fallback === '#010203' ? '#A1B2C3' : '#010203';
  if (meta.type === 'enum')
    return meta.options.find(option => option !== fallback) || meta.options[0];
  let value = meta.min === null ? fallback + 1 : meta.min;
  if (key === 'highThreshold') value = Math.max(value, DEFAULTS.lowThreshold + 1);
  if (value === fallback && meta.max !== null) value = meta.max;
  assert.notEqual(value, fallback, key);
  return value;
}

function exhaustiveValues() {
  return Object.fromEntries(DEFAULT_KEYS.map(key => [key, nonDefaultValue(key)]));
}

function exhaustiveConditions(values) {
  const result = {};
  DEFAULT_KEYS.forEach((key, index) => {
    if (!SETTING_META[key].conditionEligible) return;
    let value = values[key];
    if (key === 'lowThreshold') value = Math.min(24, DEFAULTS.highThreshold - 1);
    if (key === 'highThreshold') value = Math.max(66, DEFAULTS.lowThreshold + 1);
    result[key] = {
      slot: (index % 4) + 1,
      minTier: (index % 3) + 1,
      value,
    };
  });
  return result;
}

function editValues(state, values) {
  DEFAULT_KEYS.forEach(key => send(state, 'setting_edit', { key, value: values[key] }));
}

function setConditions(state, conditions) {
  Object.entries(conditions).forEach(([key, rule]) =>
    send(state, 'condition_set', { key, ...rule }),
  );
}

function expectedPairs(values, keys, defaults) {
  return keys.flatMap((key, index) =>
    !Object.hasOwn(values, key) || (values[key] === defaults[key] &&
      !(key === 'staminaShape' && values[key] === 'arrow' &&
        (values.staminaWidth !== 110 || values.staminaHeight !== 44.8 || values.enemyStaminaColorEnabled)))
      ? []
      : [[index, values[key]]],
  );
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

  const state = createState({ version: 1, offsetVersion: 2, values: CONTRACT.sparseDefaults });
  const imported = send(state, 'settings_import', {
    raw: wireCorpus.hpcr2.inputCode,
  });
  assert.equal(imported.status, 'committed');
  for (const [key, value] of Object.entries(wireCorpus.hpcr2.activeValues)) {
    const expected = value;
    assert.equal(imported.view.values[key], ['precisePipsEnabled', 'readoutMaxTeamColor',
      'allyReadoutMaxTeamColor'].includes(key) ? undefined : expected, key);
  }
  const keptConditions = Object.fromEntries(Object.entries(wireCorpus.hpcr2.conditions)
    .filter(([key]) => !['precisePipsEnabled', 'readoutMaxTeamColor', 'allyReadoutMaxTeamColor'].includes(key)));
  assert.deepEqual(imported.view.conditions, keptConditions);
  const exported = JSON.parse(
    effect(send(state, 'settings_copy'), 'clipboard_write').text.slice(5),
  );
  const canonical = JSON.parse(wireCorpus.hpcr2.canonicalCode.slice(5));
  assert.deepEqual(exported.v, canonical.v.filter(([slot]) => ![40, 70].includes(slot)));
  assert.deepEqual(exported.c, keptConditions);
  assert.equal(exported.hpv2.v, 2);
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

  const state = createState();
  assert.equal(
    send(state, 'preset_import', { raw: wireCorpus.hpcrp1.inputCode }).status,
    'committed',
  );
  const exported = JSON.parse(
    effect(send(state, 'preset_copy_all'), 'clipboard_write').text.slice(6),
  );
  const canonical = JSON.parse(wireCorpus.hpcrp1.canonicalCode.slice(6));
  for (const record of canonical.records) {
    record.values = record.values.filter(([slot]) => ![40, 70].includes(slot));
    record.hpv2.values = record.hpv2.values.filter(([slot]) => slot !== 40);
    for (const rules of [record.conditions, record.hpv2.conditions]) {
      if (!rules) continue;
      for (const key of ['precisePipsEnabled', 'readoutMaxTeamColor', 'allyReadoutMaxTeamColor'])
        delete rules[key];
    }
    if (record.own) record.own = record.own.filter(key =>
      !['precisePipsEnabled', 'readoutMaxTeamColor', 'allyReadoutMaxTeamColor'].includes(key));
    record.hpv2.v = 2;
    if (record.kind === 'baked') {
      record.values = expectedPairs(DEFAULTS, CODEC_KEYS, CODEC_DEFAULTS);
      record.hpv2.values = expectedPairs(DEFAULTS, EXTENSION_KEYS, CODEC_DEFAULTS);
      assert.ok(record.hpv2.values.some(([slot, value]) => slot === 9 && value === -29));
      assert.ok(record.hpv2.values.some(([slot, value]) => slot === 11 && value === -29));
    } else {
      const values = { ...CODEC_DEFAULTS };
      for (const [slot, value] of record.values) values[CODEC_KEYS[slot]] = value;
      for (const [slot, value] of record.hpv2.values) values[EXTENSION_KEYS[slot]] = value;
      record.values = expectedPairs(values, CODEC_KEYS, CODEC_DEFAULTS);
      record.hpv2.values = expectedPairs(values, EXTENSION_KEYS, CODEC_DEFAULTS);
      // Records older than slot 75 keep the frozen OFF value, which differs from the shipped ON.
      if (record.own && !record.own.includes('nameRiseWithPips')) record.own.push('nameRiseWithPips');
    }
  }
  assert.deepEqual(exported.records, canonical.records);
  assert.equal(exported.selectedPresetId, canonical.selectedPresetId);
});

test('malformed protocol corpus rejects atomically with stable game errors', async (t) => {
  for (const fixture of wireCorpus.malformed) {
    await t.test(fixture.id, () => {
      const state = createState();
      const before = state.read();
      const action = fixture.protocol === 'HPCR2'
        ? 'settings_import'
        : 'preset_import';
      const raw = fixture.id === 'preset-invalid-extension-version'
        ? fixture.code.replace('"v":3', '"v":4') : fixture.code;
      const rejected = send(state, action, { raw });
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
  assert.equal(view.values.widthScale, 400);
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

test('HPCR2 copies and restores every schema setting and eligible condition', () => {
  const values = exhaustiveValues();
  const conditions = exhaustiveConditions(values);
  const source = createState();
  const initial = source.read();
  assert.deepEqual(initial.schema.keys, DEFAULT_KEYS);
  assert.deepEqual(initial.schema.settings.map(setting => setting.key), DEFAULT_KEYS);
  assert.deepEqual(initial.schema.defaults, DEFAULTS);

  send(source, 'scope_set', { mode: 'selected', heroes: ['hero_haze'] });
  editValues(source, values);
  setConditions(source, conditions);
  assert.deepEqual(currentScope(source.read()).values, values);
  assert.deepEqual(currentScope(source.read()).conditions, conditions);

  const copied = send(source, 'settings_copy');
  const code = effect(copied, 'clipboard_write').text;
  const payload = JSON.parse(code.slice(5));
  assert.equal(copied.view.repository.activeId, 'scope_current');
  assert.deepEqual(payload.v, expectedPairs(values, CODEC_KEYS, CODEC_DEFAULTS));
  assert.deepEqual(payload.c, Object.fromEntries(
    Object.entries(conditions).filter(([key]) => !EXTENSION_KEYS.includes(key)),
  ));
  assert.deepEqual(payload.hpv2, {
    v: 2,
    values: expectedPairs(values, EXTENSION_KEYS, CODEC_DEFAULTS),
    conditions: Object.fromEntries(
      Object.entries(conditions).filter(([key]) => EXTENSION_KEYS.includes(key)),
    ),
  });

  const fresh = createState();
  const imported = send(fresh, 'settings_import', { raw: code });
  const importedEditable = currentScope(imported.view) || imported.view;
  assert.deepEqual(importedEditable.values, values);
  assert.deepEqual(importedEditable.conditions, conditions);
  assert.deepEqual(imported.view.effectiveValues, values);
});

test('HPCR2 default export resets changed extensions while legacy code preserves them', () => {
  const changed = exhaustiveValues();
  const conditions = exhaustiveConditions(changed);
  const defaultCode = effect(
    send(createState(), 'settings_copy'),
    'clipboard_write',
  ).text;

  const resetDestination = createState();
  editValues(resetDestination, changed);
  setConditions(resetDestination, conditions);
  const reset = send(resetDestination, 'settings_import', { raw: defaultCode });
  assert.deepEqual(reset.view.values, DEFAULTS);
  assert.deepEqual(reset.view.conditions, {});
  assert.deepEqual(reset.view.currentScope, null);

  const legacyDestination = createState();
  editValues(legacyDestination, changed);
  setConditions(legacyDestination, conditions);
  const beforeLegacy = legacyDestination.read();
  const legacy = send(legacyDestination, 'settings_import', {
    raw: 'HPCR2{"v":[],"c":{}}',
  });
  for (const key of EXTENSION_KEYS) {
    assert.equal(legacy.view.values[key], beforeLegacy.values[key], key);
  }
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(legacy.view.conditions).filter(([key]) => EXTENSION_KEYS.includes(key)),
    ),
    Object.fromEntries(
      Object.entries(beforeLegacy.conditions).filter(([key]) => EXTENSION_KEYS.includes(key)),
    ),
  );
});

test('HPCR2 malformed extensions reject atomically', () => {
  const state = createState();
  send(state, 'setting_edit', { key: 'staminaWidth', value: 150 });
  const before = state.read();
  const malformed = [
    'HPCR2{"v":[],"c":{},"hpv2":null}',
    'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[[0,"bad"]],"conditions":{}}}',
    'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[[999,1]],"conditions":{}}}',
    'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[],"conditions":{"unknown":{"slot":1,"minTier":1,"value":true}}}}',
  ];
  for (const raw of malformed) {
    const rejected = send(state, 'settings_import', { raw });
    assert.equal(rejected.status, 'rejected', raw);
    assert.equal(rejected.view, before, raw);
    assert.deepEqual(rejected.effects, [], raw);
  }
});
test('HPCRP1 saves, updates, applies, reloads, and transfers every setting', () => {
  const values = exhaustiveValues();
  const conditions = exhaustiveConditions(values);
  const state = createState();
  send(state, 'scope_set', { mode: 'all', heroes: [] });
  editValues(state, values);
  setConditions(state, conditions);

  const saved = send(state, 'preset_save', { name: 'Exhaustive all' });
  const presetId = saved.view.repository.selectedId;
  const updatedValues = { ...values, pickupSize: values.pickupSize + 1 };
  send(state, 'setting_edit', { key: 'pickupSize', value: updatedValues.pickupSize });
  const updated = send(state, 'preset_save', { name: 'Exhaustive updated' });
  assert.equal(updated.view.repository.selectedId, presetId);
  const record = row(updated.view, presetId);
  assert.deepEqual(record.values, updatedValues);
  assert.deepEqual(record.conditions, conditions);

  const selectedCode = effect(
    send(state, 'preset_copy_selected'),
    'clipboard_write',
  ).text;
  const allCode = effect(send(state, 'preset_copy_all'), 'clipboard_write').text;

  const resetRequest = send(state, 'reset_request', { keys: DEFAULT_KEYS });
  send(state, 'reset_confirm', {
    token: resetRequest.view.transactions.confirmation.token,
  });
  const applied = send(state, 'preset_apply', { id: presetId });
  assert.deepEqual(currentScope(applied.view).values, updatedValues);
  assert.deepEqual(currentScope(applied.view).conditions, conditions);

  const reloaded = createState({
    sessionRaw: effect(applied, 'session_replace').raw,
  });
  assert.deepEqual(currentScope(reloaded.read()).values, updatedValues);
  assert.deepEqual(currentScope(reloaded.read()).conditions, conditions);
  const selectedDestination = createState();
  const importedSelected = send(selectedDestination, 'preset_import', {
    raw: selectedCode,
  });
  const selectedId = importedSelected.view.repository.selectedId;
  const selectedApplied = send(selectedDestination, 'preset_apply', { id: selectedId });
  assert.deepEqual(currentScope(selectedApplied.view).values, updatedValues);
  assert.deepEqual(currentScope(selectedApplied.view).conditions, conditions);

  const destination = createState();
  const importedAll = send(destination, 'preset_import', { raw: allCode });
  const importedId = importedAll.view.repository.selectedId;
  const importedApplied = send(destination, 'preset_apply', { id: importedId });
  assert.deepEqual(currentScope(importedApplied.view).values, updatedValues);
  assert.deepEqual(currentScope(importedApplied.view).conditions, conditions);

  const beforeMalformed = destination.read();
  const malformed = JSON.parse(selectedCode.slice(6));
  malformed.records[0].hpv2.values[0][1] = 'not-a-number';
  const rejected = send(destination, 'preset_import', {
    raw: `HPCRP1${JSON.stringify(malformed)}`,
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.view, beforeMalformed);
  assert.deepEqual(rejected.effects, []);
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

  const copiedPayload = JSON.parse(copied.slice(5));
  assert.ok(copiedPayload.v.some(([index, value]) => index === 1 && value === 120));
  assert.deepEqual(copiedPayload.c, {
    enemyLow: { slot: 4, minTier: 3, value: '#123456' },
  });
  assert.deepEqual(copiedPayload.hpv2, {
    v: 2,
    values: expectedPairs(DEFAULTS, EXTENSION_KEYS, CODEC_DEFAULTS),
    conditions: {},
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

const addedRetailHeroes = [
  ['hero_baba', 'Baba'],
  ['hero_deadpack', 'Deadman Danny'],
  ['hero_nurse', 'Nurse Harrow'],
  ['hero_ratking', 'Rat King'],
  ['hero_chessmaster', 'Solomon'],
  ['hero_artist', 'Violet'],
];

test('new retail heroes settle exact names and preserve scoped saves and HPCRP1 transfers', () => {
  for (const [key, name] of addedRetailHeroes) {
    const identity = createState();
    send(identity, 'hero_mode', { mode: 'auto' });
    send(identity, 'lifecycle_observe', { epoch: 1, phase: 'active' });
    const first = send(identity, 'hero_observe', { epoch: 1, heroName: name });
    assert.equal(first.view.identity.status, 'settling', name);
    assert.equal(first.view.identity.effectiveHeroKey, '');
    const settled = send(identity, 'hero_observe', { epoch: 1, heroName: name });
    assert.equal(settled.view.identity.status, 'settled', name);
    assert.equal(settled.view.identity.effectiveHeroKey, key);
    assert.equal(settled.view.heroes.find(hero => hero.key === key).name, name);
    for (const mode of ['selected', 'except']) {
      const state = createState();
      assert.equal(send(state, 'scope_set', { mode, heroes: [key] }).status, 'committed');
      send(state, 'setting_edit', { key: 'enemyLow', value: '#123456' });
      const saved = send(state, 'preset_save', { name: `${name} ${mode}` });
      const id = saved.view.repository.selectedId;
      const reloaded = createState({ sessionRaw: effect(saved, 'session_replace').raw });
      for (const target of [state, reloaded]) {
        assert.equal(currentScope(target.read()).mode, mode);
        assert.deepEqual(currentScope(target.read()).heroes, [key]);
        assert.equal(row(target.read(), id).mode, mode);
        assert.deepEqual(row(target.read(), id).heroes, [key]);
        for (const action of ['preset_copy_selected', 'preset_copy_all']) {
          const code = effect(send(target, action), 'clipboard_write').text;
          const imported = createState();
          assert.equal(send(imported, 'preset_import', { raw: code }).status, 'committed');
          assert.deepEqual(row(imported.read(), id).heroes, [key]);
          assert.equal(row(imported.read(), id).mode, mode);
          assert.equal(effect(send(imported, action), 'clipboard_write').text, code);
          for (const heroes of [[key, key], [key, 'hero_unknown']]) {
            const payload = JSON.parse(code.slice(6));
            payload.records.find(record => record.id === id).heroes = heroes;
            const before = imported.read();
            const rejected = send(imported, 'preset_import', { raw: `HPCRP1${JSON.stringify(payload)}` });
            assert.equal(rejected.code, 'INVALID PRESET HEROES');
            assert.equal(rejected.status, 'rejected');
            assert.equal(rejected.view, before);
            assert.deepEqual(rejected.effects, []);
          }
        }
      }
    }
  }
});

test('roster expansion keeps existing corpus exports byte-identical', () => {
  const context = { $: {} };
  vm.runInNewContext(contractSource, context);
  const oldRosterSource = stateSource.replace(
    /^\s*\["hero_(?:baba|deadpack|nurse|ratking|chessmaster|artist)", "[^"]+"\],\r?\n/gm,
    '',
  );
  vm.runInNewContext(oldRosterSource, context);
  const oldFactory = context.$.HPColorsV2StateFactory;
  for (const [input, importAction, copyAction] of [
    [wireCorpus.hpcr2.inputCode, 'settings_import', 'settings_copy'],
    [wireCorpus.hpcrp1.inputCode, 'preset_import', 'preset_copy_all'],
  ]) {
    const oldState = oldFactory.create();
    const expanded = createState();
    for (const target of [oldState, expanded])
      assert.equal(send(target, importAction, { raw: input }).status, 'committed');
    assert.equal(
      effect(send(expanded, copyAction), 'clipboard_write').text,
      effect(send(oldState, copyAction), 'clipboard_write').text,
    );
  }
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

test('layout reset cancels an active negative slider gesture', () => {
  const state = createState();
  send(state, 'gesture_begin', { key: 'positionX', value: -200 });
  const reset = send(state, 'reset_request', {
    keys: ['widthScale', 'heightScale', 'positionX', 'positionY'],
  });
  const confirmed = send(state, 'reset_confirm', {
    token: reset.view.transactions.confirmation.token,
  });
  const lateMouseUp = send(state, 'gesture_end', {
    key: 'positionX',
    value: -200,
  });

  assert.equal(confirmed.view.values.positionX, 0);
  assert.equal(confirmed.view.transactions.gesture, null);
  assert.equal(lateMouseUp.status, 'rejected');
  assert.equal(state.read().values.positionX, 0);
});

test('layout reset publishes the restored negative offset', () => {
  const state = createState();
  send(state, 'gesture_begin', { key: 'positionX', value: -200 });
  const reset = send(state, 'reset_request', { keys: ['positionX'] });
  const confirmed = send(state, 'reset_confirm', {
    token: reset.view.transactions.confirmation.token,
  });
  const published = confirmed.effects.find(
    (effect) => effect.type === 'effective_publish',
  );
  assert.equal(published.values.positionX, 0);
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
  assert.equal(resetRequest.view.values.enemyLow, '#112233');

  const canceled = send(state, 'reset_cancel', { token: resetToken });
  assert.equal(canceled.status, 'committed');
  assert.equal(canceled.view.transactions.confirmation, null);
  assert.equal(canceled.view.values.enemyLow, before.values.enemyLow);

  const resetReplay = send(state, 'reset_request', { keys: ['enemyLow'] });
  const resetReplayToken = resetReplay.view.transactions.confirmation.token;
  assert.notEqual(resetReplayToken, resetToken);
  const staleReset = send(state, 'reset_confirm', { token: resetToken });
  assert.equal(staleReset.status, 'rejected');
  assert.equal(staleReset.code, 'INVALID_CONFIRMATION');
  assert.equal(
    staleReset.view.transactions.confirmation.token,
    resetReplayToken,
  );
  assert.equal(staleReset.view.values.enemyLow, before.values.enemyLow);

  const confirmedReset = send(state, 'reset_confirm', {
    token: resetReplayToken,
  });
  assert.equal(confirmedReset.status, 'committed');
  assert.equal(confirmedReset.view.values.enemyLow, DEFAULTS.enemyLow);
  assert.equal(confirmedReset.view.transactions.confirmation, null);
  assert.equal(
    send(state, 'reset_confirm', { token: resetReplayToken }).status,
    'rejected',
  );

  const removeRequest = send(state, 'preset_remove_request', {
    id: 'user_0001',
  });
  const removeToken = removeRequest.view.transactions.confirmation.token;
  const removeCanceled = send(state, 'preset_remove_cancel', {
    token: removeToken,
  });
  assert.equal(removeCanceled.status, 'committed');
  assert.equal(removeCanceled.view.transactions.confirmation, null);
  assert.equal(
    removeCanceled.view.repository.allRows.some(
      (candidate) => candidate.id === 'user_0001',
    ),
    true,
  );
  const removeReplay = send(state, 'preset_remove_request', {
    id: 'user_0001',
  });
  const removeReplayToken =
    removeReplay.view.transactions.confirmation.token;
  assert.notEqual(removeReplayToken, removeToken);

  const staleRemove = send(state, 'preset_remove_confirm', {
    token: removeToken,
  });
  assert.equal(staleRemove.status, 'rejected');
  assert.equal(staleRemove.code, 'INVALID_CONFIRMATION');
  assert.equal(
    staleRemove.view.transactions.confirmation.token,
    removeReplayToken,
  );
  assert.equal(
    staleRemove.view.repository.allRows.some(
      (candidate) => candidate.id === 'user_0001',
    ),
    true,
  );

  const removed = send(state, 'preset_remove_confirm', {
    token: removeReplayToken,
  });
  assert.equal(
    removed.view.repository.allRows.some(
      (candidate) => candidate.id === 'user_0001',
    ),
    false,
  );
  assert.equal(removed.view.repository.selectedId, null);
  assert.equal(removed.view.transactions.confirmation, null);
  assert.equal(
    send(state, 'preset_remove_confirm', { token: removeReplayToken }).status,
    'rejected',
  );
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
    { ...makeSession({
      values: DEFAULTS,
      userPresets: [
        rawPreset({ id: 'user_0001', name: 'All', mode: 'all', values: { enemyLow: '#111111', widthScale: 230, allyEnabled: true, allyVisible: false } }),
        rawPreset({ id: 'user_0002', name: 'Haze', mode: 'selected', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
      ],
      selectedPresetId: null,
    }), offsetVersion: 2 },
  );
  const selected = send(state, 'preset_select', { id: 'user_0002' });
  assert.equal(selected.view.repository.selectedId, 'user_0002');
  // Selection is not application: the untouched screen still matches the baked default.
  assert.equal(selected.view.repository.activeId, 'baked_default');
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

test('HPCRP1 accepts builder hero order and retains strict atomic hero validation', () => {
  const commonValues = [[1,161],[2,60],[4,-200],[8,"#460606"],[9,"#E02424"],[10,"#E16161"],[16,"#99C1F1"],[17,true],[19,"gradient"],[20,"#FFFFFF"],[21,"#FFFFFF"],[22,"#FFFFFF"],[25,"#F9F06B"],[30,150],[31,"oracle"],[32,0],[33,315],[34,"custom"],[35,"gradient"],[36,"#FFFFFF"],[37,"#FFFFFF"],[40,true],[41,false],[46,144],[47,2],[48,true],[50,"#C18B8B"],[57,true],[60,2],[61,true],[62,"#FFFFFF"],[63,true],[65,10],[66,"#FFFFFF"],[69,40]];
  const hpv2 = { v: 1, values: [[0,100],[3,-200],[4,true],[5,"#F66151"],[8,-300],[9,-200],[10,22],[24,25],[25,0]], conditions: {} };
  const condition = { slot: 4, minTier: 3, value: 28 };
  const definitions = [
    ['All', [], [], null],
    ['Shiv', ['hero_shiv'], [[42,18],[45,18],[64,18]], {
      enemyKillMarkerThreshold: condition, enemyPulseThreshold: condition, lowThreshold: condition,
    }],
    ['Talon', ['hero_orion'], [[42,22],[45,22],[58,22],[64,22]], {
      enemyKillMarkerThreshold: condition,
    }],
    ['Vyper, Geist', ['hero_ghost', 'hero_viper'], [[42,30],[45,30],[64,30]], null],
    ['Half HP', ['hero_hornet', 'hero_fencer'], [[64,50]], null],
    ['Venator', ['hero_priest'], [[64,8]], null],
  ];
  const payload = {
    records: definitions.map(([name, heroes, extraValues, conditions], index) => ({
      id: `user_000${index + 1}`, kind: 'user', name,
      mode: heroes.length ? 'selected' : 'all', heroes,
      values: commonValues.concat(extraValues).sort((a, b) => a[0] - b[0]),
      conditions, hpv2,
    })),
    hiddenBakedPresetIds: ['baked_default'],
    selectedPresetId: 'user_0001',
  };
  const state = createState();
  const before = state.read();
  const imported = send(state, 'preset_import', { raw: `HPCRP1${JSON.stringify(payload)}` });
  assert.equal(imported.status, 'committed', imported.code);
  assert.equal(allRows(imported.view).length, 7);
  assert.deepEqual(row(imported.view, 'user_0005').heroes, ['hero_fencer', 'hero_hornet']);
  assert.deepEqual(row(imported.view, 'user_0006').heroes, ['hero_priest']);
  assert.equal(row(imported.view, 'user_0005').values.enemyKillMarkerThreshold, 50);
  assert.deepEqual(row(imported.view, 'user_0002').conditions.lowThreshold, condition);
  assert.equal(imported.view.repository.selectedId, 'user_0001');
  assert.deepEqual(imported.view.repository.hiddenBakedIds, ['baked_default']);
  assert.deepEqual(imported.view.effectiveValues, before.effectiveValues);
  assertNoEffect(imported, 'effective_publish');
  const copied = JSON.parse(effect(send(state, 'preset_copy_all'), 'clipboard_write').text.slice(6));
  for (const source of payload.records) {
    const result = copied.records.find(({ id }) => id === source.id);
    const inputValues = source.values.concat([32, 55]
      .filter(slot => !source.values.some(([index]) => index === slot))
      .map(slot => [slot, 0])).sort(([a], [b]) => a - b);
    const canonicalValues = inputValues.filter(([index]) =>
      ![12, 13, 29, 40, 67, 68, 69, 70].includes(index))
      .map(([index, value]) => {
        const key = CODEC_KEYS[index];
        const oldLimit = key.endsWith('X') ? 200 : 210;
        const normalized = /^(readout|enemyPulseReadout)Offset[XY]$/.test(key)
          ? Math.round(Math.max(-oldLimit, Math.min(oldLimit, value)) /
            (key.endsWith('X') ? 1.61 : 0.6))
          : CONTRACT.normalizeValues({ [key]: value })[key];
        return [index, normalized];
      }).filter(([index, value]) => value !== CODEC_DEFAULTS[CODEC_KEYS[index]]);
    assert.deepEqual(result.values, canonicalValues);
    assert.deepEqual(result.conditions, source.conditions);
    assert.equal(row(imported.view, source.id).values.staminaShape, 'box');
    assert.deepEqual(result.hpv2, {
      ...source.hpv2,
      v: 2,
      values: [...source.hpv2.values, [61, 'box']],
    });
  }
  for (const heroes of [
    ['hero_hornet', 'not_a_hero'], ['hero_hornet', 'hero_hornet'],
    [['hero_hornet']], [null], ['toString'], 'hero_hornet',
  ]) {
    const malformed = JSON.parse(JSON.stringify(payload));
    malformed.records[4].heroes = heroes;
    const unchanged = state.read();
    const rejected = send(state, 'preset_import', { raw: `HPCRP1${JSON.stringify(malformed)}` });
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.code, 'INVALID PRESET HEROES');
    assert.equal(rejected.view, unchanged);
    assert.deepEqual(rejected.effects, []);
  }
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

  const scoped = createState(
    makeSession({
      scopes: [
        {
          id: 'scope_current',
          mode: 'selected',
          heroes: ['hero_haze'],
          values: { enemyLow: '#101010' },
          conditions: {},
        },
      ],
      userPresets: [rawPreset({ id: 'user_0001', name: 'Haze' })],
    }),
  );
  const scopedInitial = scoped.read();
  assertDeepFrozen(scopedInitial.currentScope);

  const scopedSelected = send(scoped, 'preset_select', {
    id: 'user_0001',
  });
  assert.equal(scopedSelected.view.scopes, scopedInitial.scopes);
  assert.equal(scopedSelected.view.currentScope, scopedInitial.currentScope);
  assertDeepFrozen(scopedSelected.view);
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

function hazeRoutedState({ withAll = true } = {}) {
  const userPresets = [
    rawPreset({
      id: 'user_0001',
      name: 'Haze',
      mode: 'selected',
      heroes: ['hero_haze'],
      values: { enemyLow: '#111111' },
    }),
  ];
  if (withAll) {
    userPresets.push(rawPreset({
      id: 'user_0003',
      name: 'All Heroes',
      mode: 'all',
      values: { enemyLow: '#333333' },
    }));
  }
  const state = createState(makeSession({ userPresets }));
  send(state, 'hero_mode', { mode: 'auto' });
  send(state, 'lifecycle_observe', { epoch: 1, phase: 'active' });
  send(state, 'hero_observe', { epoch: 1, heroName: 'HAZE' });
  const routed = send(state, 'hero_observe', { epoch: 1, heroName: 'HAZE' });
  assert.equal(routed.view.repository.activeId, 'user_0001');
  assert.equal(routed.view.effectiveValues.enemyLow, '#111111');
  return state;
}

test('Auto hideout entry drops a hero preset to the all-heroes preset', () => {
  const state = hazeRoutedState();
  const hideout = send(state, 'lifecycle_observe', { epoch: 2, phase: 'hideout' });
  assert.equal(hideout.status, 'committed');
  assert.equal(hideout.view.identity.phase, 'hideout');
  assert.equal(hideout.view.identity.effectiveHeroKey, '');
  assert.equal(hideout.view.repository.activeId, 'user_0003');
  assertEffectivePublish(hideout, hideout.view.effectiveRevision);
  assert.equal(hideout.view.effectiveValues.enemyLow, '#333333');

  // Auto deliberately stays unknown in the hideout.
  const observed = send(state, 'hero_observe', { epoch: 2, heroName: 'HAZE' });
  assert.equal(observed.code, 'IDENTITY_INACTIVE');
  assert.equal(observed.view.identity.effectiveHeroKey, '');
  assertNoEffect(observed, 'effective_publish');
  const same = send(state, 'lifecycle_observe', { epoch: 2, phase: 'hideout' });
  assert.equal(same.status, 'noop');

  // Already on the no-hero route: re-entering must not churn the revision.
  const revision = hideout.view.effectiveRevision;
  send(state, 'lifecycle_observe', { epoch: 3, phase: 'transitioning' });
  const again = send(state, 'lifecycle_observe', { epoch: 4, phase: 'hideout' });
  assert.equal(again.view.repository.activeId, 'user_0003');
  assert.equal(again.view.effectiveRevision, revision);
  assertNoEffect(again, 'effective_publish');

  // Leaving the hideout for a match routes by hero again.
  send(state, 'lifecycle_observe', { epoch: 5, phase: 'active' });
  send(state, 'hero_observe', { epoch: 5, heroName: 'HAZE' });
  const back = send(state, 'hero_observe', { epoch: 5, heroName: 'HAZE' });
  assert.equal(back.view.repository.activeId, 'user_0001');
  assert.equal(back.view.effectiveValues.enemyLow, '#111111');
});

test('Auto hideout entry without an all-heroes preset falls back to Rewrite Default', () => {
  const state = hazeRoutedState({ withAll: false });
  const hideout = send(state, 'lifecycle_observe', { epoch: 2, phase: 'hideout' });
  assert.equal(hideout.view.repository.activeId, 'baked_default');
  assert.equal(hideout.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);
});

test('hideout entry releases a restored cold-boot snapshot', () => {
  for (const published of ['#22AA44', '#111111']) {
    const state = createState({
      sessionRaw: JSON.stringify(makeSession({ values: { enemyLow: '#111111' } })),
      publishedRaw: JSON.stringify({
        version: 1,
        revision: 7,
        values: { enemyLow: published },
      }),
    });
    assert.equal(state.read().effectiveValues.enemyLow, published);
    const hideout = send(state, 'lifecycle_observe', { epoch: 1, phase: 'hideout' });
    assert.equal(hideout.view.effectiveValues.enemyLow, '#111111');
    assertEffectivePublish(hideout, 8);
  }
});

test('hideout keeps a custom Current without an all-heroes preset, and the first all-heroes preset wins', () => {
  const custom = createState(makeSession({ values: { enemyLow: '#444444' } }));
  send(custom, 'hero_mode', { mode: 'auto' });
  const before = custom.read();
  const hideout = send(custom, 'lifecycle_observe', { epoch: 1, phase: 'hideout' });
  assert.equal(hideout.view.repository.activeId, before.repository.activeId);
  assert.equal(hideout.view.effectiveValues.enemyLow, '#444444');
  assert.equal(hideout.view.effectiveRevision, before.effectiveRevision);
  assertNoEffect(hideout, 'effective_publish');

  const state = createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Haze', mode: 'selected', heroes: ['hero_haze'], values: { enemyLow: '#111111' } }),
      rawPreset({ id: 'user_0002', name: 'All A', mode: 'all', values: { enemyLow: '#222222' } }),
      rawPreset({ id: 'user_0003', name: 'All B', mode: 'all', values: { enemyLow: '#333333' } }),
    ],
  }));
  send(state, 'hero_mode', { mode: 'auto' });
  send(state, 'lifecycle_observe', { epoch: 1, phase: 'active' });
  send(state, 'hero_observe', { epoch: 1, heroName: 'HAZE' });
  send(state, 'hero_observe', { epoch: 1, heroName: 'HAZE' });
  const entry = send(state, 'lifecycle_observe', { epoch: 2, phase: 'hideout' });
  assert.equal(entry.view.repository.activeId, 'user_0002');
  assert.equal(entry.view.effectiveValues.enemyLow, '#222222');
});

test('hideout keeps Manual and Off routes, and pregame lobby keeps the hero preset', () => {
  const manual = hazeRoutedState();
  send(manual, 'hero_mode', { mode: 'manual' });
  send(manual, 'hero_manual', { heroKey: 'hero_haze' });
  const manualHideout = send(manual, 'lifecycle_observe', { epoch: 2, phase: 'hideout' });
  assert.equal(manualHideout.view.repository.activeId, 'user_0001');

  const off = hazeRoutedState();
  send(off, 'hero_mode', { mode: 'off' });
  const offHideout = send(off, 'lifecycle_observe', { epoch: 2, phase: 'hideout' });
  assert.equal(offHideout.view.repository.activeId, 'user_0001');

  const lobby = hazeRoutedState();
  const pregame = send(lobby, 'lifecycle_observe', { epoch: 2, phase: 'lobby' });
  assert.equal(pregame.view.repository.activeId, 'user_0001');

  const bogus = send(lobby, 'lifecycle_observe', { epoch: 3, phase: 'hideaway' });
  assert.equal(bogus.status, 'rejected');
});

function settleHero(state, epoch, heroName) {
  send(state, 'lifecycle_observe', { epoch, phase: 'active' });
  send(state, 'hero_observe', { epoch, heroName });
  return send(state, 'hero_observe', { epoch, heroName });
}

function autoState(userPresets, overrides = {}) {
  const state = createState(makeSession({ userPresets, ...overrides }));
  send(state, 'hero_mode', { mode: 'auto' });
  return state;
}

// Tester round 7: ALL EXCEPT follows list order like the other types. A
// hand-picked lower ALL EXCEPT is replaced by the highest match on a hero
// switch; unsaved edits survive only when the winner is the same preset.
test('hero switch picks the highest ALL EXCEPT even when a lower one is in use', () => {
  const state = autoState([
    rawPreset({ id: 'user_0001', name: 'Skip Haze A', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
    rawPreset({ id: 'user_0002', name: 'Skip Haze B', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#333333' } }),
  ]);
  send(state, 'hero_mode', { mode: 'manual' });
  send(state, 'hero_manual', { heroKey: 'hero_atlas' });
  send(state, 'preset_apply', { id: 'user_0002' });
  assert.equal(state.read().repository.activeId, 'user_0002');

  const hornet = send(state, 'hero_manual', { heroKey: 'hero_hornet' });
  assert.equal(hornet.view.repository.activeId, 'user_0001', 'lower ALL EXCEPT is replaced');
  assert.equal(hornet.view.effectiveValues.enemyLow, '#222222');

  send(state, 'setting_edit', { key: 'enemyLow', value: '#ABCDEF' });
  const atlas = send(state, 'hero_manual', { heroKey: 'hero_atlas' });
  assert.equal(atlas.view.repository.sourceState.id, 'user_0001');
  assert.equal(atlas.view.effectiveValues.enemyLow, '#ABCDEF', 'same winner keeps unsaved edits');
});

test('All Except routing order is Only These, All Except, All Heroes, then Rewrite Default', () => {
  const presets = [
    rawPreset({ id: 'user_0001', name: 'All', mode: 'all', values: { enemyLow: '#111111' } }),
    rawPreset({ id: 'user_0002', name: 'Skip Haze A', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
    rawPreset({ id: 'user_0003', name: 'Skip Haze B', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#333333' } }),
    rawPreset({ id: 'user_0004', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'], values: { enemyLow: '#444444' } }),
  ];
  const state = autoState(presets);
  assert.equal(row(state.read(), 'user_0002').mode, 'except');
  assert.deepEqual(row(state.read(), 'user_0002').heroes, ['hero_haze']);

  const shiv = settleHero(state, 1, 'SHIV');
  assert.equal(shiv.view.repository.activeId, 'user_0004');
  assert.equal(shiv.view.effectiveValues.enemyLow, '#444444');

  send(state, 'hero_mode', { mode: 'manual' });
  const abrams = send(state, 'hero_manual', { heroKey: 'hero_atlas' });
  assert.equal(abrams.view.identity.effectiveHeroKey, 'hero_atlas');
  assert.equal(abrams.view.repository.activeId, 'user_0002');
  assert.equal(abrams.view.effectiveValues.enemyLow, '#222222');

  const moved = send(state, 'preset_move', { id: 'user_0003', delta: -1 });
  assert.equal(moved.view.repository.activeId, 'user_0002');
  send(state, 'hero_manual', { heroKey: 'hero_haze' });
  const abramsAgain = send(state, 'hero_manual', { heroKey: 'hero_atlas' });
  assert.equal(abramsAgain.view.repository.activeId, 'user_0003');
  assert.equal(abramsAgain.view.effectiveValues.enemyLow, '#333333');

  const skipped = send(state, 'hero_manual', { heroKey: 'hero_haze' });
  assert.equal(skipped.view.repository.activeId, 'user_0001');
  assert.equal(skipped.view.effectiveValues.enemyLow, '#111111');

  const noAll = autoState([
    rawPreset({ id: 'user_0001', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
  ]);
  const shivNoAll = settleHero(noAll, 1, 'SHIV');
  assert.equal(shivNoAll.view.repository.activeId, 'user_0001');
  assert.equal(shivNoAll.view.effectiveValues.enemyLow, '#222222');
  const hazeNoAll = settleHero(noAll, 2, 'HAZE');
  assert.equal(hazeNoAll.view.repository.activeId, 'baked_default');
  assert.equal(hazeNoAll.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);
});

test('All Except save keeps Rewrite Default visible and keeps the skip list on create and update', () => {
  const state = createState();
  const scoped = send(state, 'scope_set', { mode: 'except', heroes: ['hero_shiv', 'hero_haze', 'hero_haze'] });
  assert.equal(scoped.status, 'committed');
  assert.equal(currentScope(scoped.view).mode, 'except');
  assert.deepEqual(currentScope(scoped.view).heroes, ['hero_haze', 'hero_shiv']);
  send(state, 'setting_edit', { key: 'enemyLow', value: '#123456' });

  const created = send(state, 'preset_save', { name: 'Skip Two' });
  assert.equal(created.status, 'committed');
  const id = created.view.repository.selectedId;
  assert.equal(row(created.view, id).mode, 'except');
  assert.deepEqual(row(created.view, id).heroes, ['hero_haze', 'hero_shiv']);
  assert.equal(created.view.repository.hiddenBakedIds.includes('baked_default'), false);
  assert.equal(visibleRows(created.view).some((candidate) => candidate.id === 'baked_default'), true);

  send(state, 'scope_set', { mode: 'except', heroes: ['hero_haze'] });
  const updated = send(state, 'preset_save', { name: 'Skip Haze' });
  assert.equal(updated.code, 'PRESET_UPDATED');
  assert.equal(row(updated.view, id).mode, 'except');
  assert.deepEqual(row(updated.view, id).heroes, ['hero_haze']);
  assert.equal(visibleRows(updated.view).some((candidate) => candidate.id === 'baked_default'), true);
});

test('All Except scope_set normalizes empty to all, accepts every hero, and survives Reset then Undo', () => {
  const state = createState();
  const empty = send(state, 'scope_set', { mode: 'except', heroes: [] });
  assert.equal(empty.status, 'committed');
  assert.equal(currentScope(empty.view).mode, 'all');
  assert.deepEqual(currentScope(empty.view).heroes, []);

  const everyHero = state.read().heroes.map(({ key }) => key);
  const all = send(state, 'scope_set', { mode: 'except', heroes: everyHero });
  assert.equal(all.status, 'committed');
  assert.equal(currentScope(all.view).mode, 'except');
  assert.deepEqual(currentScope(all.view).heroes, everyHero);

  send(state, 'scope_set', { mode: 'except', heroes: ['hero_haze', 'hero_shiv'] });
  send(state, 'setting_edit', { key: 'enemyLow', value: '#123456' });
  const request = send(state, 'reset_request', { keys: ['enemyLow'] });
  const reset = send(state, 'reset_confirm', { token: request.view.transactions.confirmation.token });
  assert.equal(reset.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);
  assert.equal(currentScope(reset.view).mode, 'except');
  const undone = send(state, 'undo');
  assert.equal(undone.view.effectiveValues.enemyLow, '#123456');
  assert.equal(currentScope(undone.view).mode, 'except');
  assert.deepEqual(currentScope(undone.view).heroes, ['hero_haze', 'hero_shiv']);
});

test('All Except never matches an unknown hero, and Auto hideout drops an except Current', () => {
  const state = autoState([
    rawPreset({ id: 'user_0001', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
  ]);
  const before = state.read();
  const unknown = settleHero(state, 1, '');
  assert.equal(unknown.view.identity.effectiveHeroKey, '');
  assert.notEqual(unknown.view.repository.activeId, 'user_0001');
  assert.deepEqual(unknown.view.effectiveValues, before.effectiveValues);

  const shiv = settleHero(state, 2, 'SHIV');
  assert.equal(shiv.view.repository.activeId, 'user_0001');
  assert.equal(currentScope(shiv.view).mode, 'except');
  const hideout = send(state, 'lifecycle_observe', { epoch: 3, phase: 'hideout' });
  assert.equal(hideout.view.repository.activeId, 'baked_default');
  assert.equal(hideout.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);

  const withAll = autoState([
    rawPreset({ id: 'user_0001', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
    rawPreset({ id: 'user_0002', name: 'All', mode: 'all', values: { enemyLow: '#333333' } }),
  ]);
  assert.equal(settleHero(withAll, 1, 'SHIV').view.repository.activeId, 'user_0001');
  const allHideout = send(withAll, 'lifecycle_observe', { epoch: 2, phase: 'hideout' });
  assert.equal(allHideout.view.repository.activeId, 'user_0002');
  assert.equal(allHideout.view.effectiveValues.enemyLow, '#333333');
});

test('All Except explicit apply works on a skipped hero, and Manual mode routes past it', () => {
  const state = autoState([
    rawPreset({ id: 'user_0001', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
    rawPreset({ id: 'user_0002', name: 'All', mode: 'all', values: { enemyLow: '#333333' } }),
  ]);
  const haze = settleHero(state, 1, 'HAZE');
  assert.equal(haze.view.repository.activeId, 'user_0002');
  const applied = send(state, 'preset_apply', { id: 'user_0001' });
  assert.equal(applied.status, 'committed');
  assert.equal(applied.view.repository.activeId, 'user_0001');
  assert.equal(applied.view.effectiveValues.enemyLow, '#222222');
  assert.equal(currentScope(applied.view).mode, 'except');
  assert.deepEqual(currentScope(applied.view).heroes, ['hero_haze']);

  send(state, 'hero_mode', { mode: 'manual' });
  const shiv = send(state, 'hero_manual', { heroKey: 'hero_shiv' });
  assert.equal(shiv.view.repository.activeId, 'user_0001');
  const manualHaze = send(state, 'hero_manual', { heroKey: 'hero_haze' });
  assert.equal(manualHaze.view.identity.effectiveHeroKey, 'hero_haze');
  assert.equal(manualHaze.view.repository.activeId, 'user_0002');
  assert.equal(manualHaze.view.effectiveValues.enemyLow, '#333333');
});

test('All Except edited Current stays on non-skipped heroes and routes away on a skipped hero', () => {
  const state = autoState([
    rawPreset({ id: 'user_0001', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
    rawPreset({ id: 'user_0002', name: 'All', mode: 'all', values: { enemyLow: '#333333' } }),
  ]);
  send(state, 'hero_mode', { mode: 'manual' });
  assert.equal(send(state, 'hero_manual', { heroKey: 'hero_shiv' }).view.repository.activeId, 'user_0001');
  send(state, 'setting_edit', { key: 'enemyLow', value: '#ABCDEF' });
  send(state, 'condition_set', { key: 'enemyVisible', slot: 2, minTier: 1, value: false });

  const kept = send(state, 'hero_manual', { heroKey: 'hero_atlas' });
  assert.equal(kept.view.effectiveValues.enemyLow, '#ABCDEF');
  assert.equal(currentScope(kept.view).mode, 'except');
  assert.deepEqual(currentScope(kept.view).conditions.enemyVisible, { slot: 2, minTier: 1, value: false });
  assert.deepEqual(kept.view.ability.requiredSlots, [false, true, false, false]);

  const away = send(state, 'hero_manual', { heroKey: 'hero_haze' });
  assert.equal(away.view.repository.activeId, 'user_0002');
  assert.equal(away.view.effectiveValues.enemyLow, '#333333');
  assert.deepEqual(away.view.ability.requiredSlots, [false, false, false, false]);
});

test('All Except conditions and required ability slots follow the preset in effect', () => {
  const state = autoState([
    rawPreset({
      id: 'user_0001', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'],
      conditions: { enemyLow: { slot: 4, minTier: 1, value: '#444444' } },
    }),
    rawPreset({
      id: 'user_0002', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'],
      conditions: { enemyVisible: { slot: 2, minTier: 1, value: false } },
    }),
    rawPreset({
      id: 'user_0003', name: 'All', mode: 'all',
      conditions: { enemyLow: { slot: 1, minTier: 1, value: '#111111' } },
    }),
  ]);
  send(state, 'hero_mode', { mode: 'manual' });
  const atlas = send(state, 'hero_manual', { heroKey: 'hero_atlas' });
  assert.equal(atlas.view.repository.activeId, 'user_0002');
  assert.deepEqual(atlas.view.ability.requiredSlots, [false, true, false, false]);
  const active = send(state, 'ability_observe', { epoch: atlas.view.identity.epoch, tiers: [0, 1, 0, 0] });
  assert.equal(active.view.effectiveValues.enemyVisible, false);

  const shiv = send(state, 'hero_manual', { heroKey: 'hero_shiv' });
  assert.equal(shiv.view.repository.activeId, 'user_0001');
  assert.deepEqual(shiv.view.ability.requiredSlots, [false, false, false, true]);

  const haze = send(state, 'hero_manual', { heroKey: 'hero_haze' });
  assert.equal(haze.view.repository.activeId, 'user_0003');
  assert.deepEqual(haze.view.ability.requiredSlots, [true, false, false, false]);
});

test('All Except preset codes round-trip, including a preset that skips every hero, and empty lists reject atomically', () => {
  const everyHero = createState().read().heroes.map(({ key }) => key);
  const source = createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
      rawPreset({ id: 'user_0002', name: 'Skip Everyone', mode: 'except', heroes: everyHero }),
    ],
    selectedPresetId: 'user_0002',
  }));
  const selectedCode = effect(send(source, 'preset_copy_selected'), 'clipboard_write').text;
  const allCode = effect(send(source, 'preset_copy_all'), 'clipboard_write').text;

  const single = createState();
  const singleImport = send(single, 'preset_import', { raw: selectedCode });
  assert.equal(singleImport.status, 'committed', singleImport.code);
  const singleId = singleImport.view.repository.selectedId;
  assert.equal(row(singleImport.view, singleId).mode, 'except');
  assert.deepEqual(row(singleImport.view, singleId).heroes, everyHero);

  const destination = createState();
  const before = destination.read();
  const imported = send(destination, 'preset_import', { raw: allCode });
  assert.equal(imported.status, 'committed', imported.code);
  const users = allRows(imported.view).filter((candidate) => candidate.kind === 'user');
  assert.deepEqual(users.map(({ mode }) => mode), ['except', 'except']);
  assert.deepEqual(users.map(({ heroes }) => heroes), [['hero_haze'], everyHero]);
  assert.deepEqual(imported.view.effectiveValues, before.effectiveValues);
  assertNoEffect(imported, 'effective_publish');

  const payload = JSON.parse(allCode.slice(6));
  const emptyRecord = payload.records.find(({ id }) => id === 'user_0001');
  emptyRecord.heroes = [];
  const target = createState();
  const unchanged = target.read();
  const rejected = send(target, 'preset_import', { raw: `HPCRP1${JSON.stringify(payload)}` });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.view, unchanged);
  assert.deepEqual(rejected.effects, []);
  assert.equal(allRows(rejected.view).some((candidate) => candidate.kind === 'user'), false);
});

function storedPresets(result) {
  return JSON.parse(effect(result, 'session_replace').raw).userPresets;
}

function storedPreset(result, id) {
  return storedPresets(result).find((candidate) => candidate.id === id);
}

function keyOrder(keys) {
  return DEFAULT_KEYS.filter((key) => keys.includes(key));
}

function removePreset(state, id) {
  const request = send(state, 'preset_remove_request', { id });
  return send(state, 'preset_remove_confirm', { token: request.view.transactions.confirmation.token });
}

function layeredState(extra = []) {
  return autoState([
    rawPreset({ id: 'user_0001', name: 'All', mode: 'all', values: { enemyLow: '#111111', enemyMid: '#121212' } }),
    ...extra,
    { ...rawPreset({ id: 'user_0009', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'], values: { enemyLow: '#111111', enemyMid: '#222222' } }), own: ['enemyMid'] },
  ], { nextUserPresetNumber: 10 });
}

test('Layered presets hero save stores changed keys as own with full values, and All Heroes stores no own', () => {
  assert.ok(DEFAULT_KEYS.includes('enemyMid') && DEFAULT_KEYS.includes('enemyHigh'));
  const state = createState(makeSession({
    userPresets: [rawPreset({ id: 'user_0001', name: 'All', mode: 'all', values: { enemyLow: '#111111' } })],
    nextUserPresetNumber: 2,
  }));
  send(state, 'preset_apply', { id: 'user_0001' });
  send(state, 'preset_select', { id: null });
  send(state, 'scope_set', { mode: 'selected', heroes: ['hero_shiv'] });
  send(state, 'setting_edit', { key: 'enemyHigh', value: '#343434' });
  const created = send(state, 'preset_save', { name: 'Shiv' });
  assert.equal(created.code, 'PRESET_SAVED');
  const id = created.view.repository.selectedId;
  const record = storedPreset(created, id);
  assert.deepEqual(record.own, ['enemyHigh']);
  assert.equal(record.values.enemyLow, '#111111');
  assert.equal(record.values.enemyHigh, '#343434');
  assert.equal(Object.keys(record.values).length, DEFAULT_KEYS.length);

  send(state, 'setting_edit', { key: 'enemyLow', value: '#AAAAAA' });
  const updated = send(state, 'preset_save', { name: 'Shiv' });
  assert.equal(updated.code, 'PRESET_UPDATED');
  assert.deepEqual(storedPreset(updated, id).own, keyOrder(['enemyLow', 'enemyHigh']));

  send(state, 'preset_apply', { id: 'user_0001' });
  send(state, 'setting_edit', { key: 'enemyLow', value: '#999999' });
  send(state, 'preset_select', { id: 'user_0001' });
  const allSaved = send(state, 'preset_save', { name: 'All' });
  assert.equal(allSaved.code, 'PRESET_UPDATED');
  assert.equal(Object.hasOwn(storedPreset(allSaved, 'user_0001'), 'own'), false);
});

test('Layered presets hero routing uses All Heroes values except for own keys', () => {
  const state = layeredState();
  const shiv = settleHero(state, 1, 'SHIV');
  assert.equal(shiv.view.repository.activeId, 'user_0009');
  assert.equal(shiv.view.effectiveValues.enemyMid, '#222222');

  send(state, 'preset_apply', { id: 'user_0001' });
  send(state, 'setting_edit', { key: 'enemyLow', value: '#999999' });
  send(state, 'setting_edit', { key: 'enemyMid', value: '#989898' });
  send(state, 'preset_select', { id: 'user_0001' });
  assert.equal(send(state, 'preset_save', { name: 'All' }).code, 'PRESET_UPDATED');

  send(state, 'hero_mode', { mode: 'manual' });
  const routed = send(state, 'hero_manual', { heroKey: 'hero_shiv' });
  assert.equal(routed.view.repository.activeId, 'user_0009');
  assert.equal(routed.view.effectiveValues.enemyLow, '#999999');
  assert.equal(routed.view.effectiveValues.enemyMid, '#222222');
  assert.equal(currentScope(routed.view).values.enemyLow, '#999999');
});

test('Layered presets without an All Heroes preset layer on Rewrite Default', () => {
  const state = autoState([
    { ...rawPreset({ id: 'user_0001', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'], values: { enemyLow: '#111111', enemyMid: '#222222' } }), own: ['enemyMid'] },
  ]);
  const shiv = settleHero(state, 1, 'SHIV');
  assert.equal(shiv.view.repository.activeId, 'user_0001');
  assert.equal(shiv.view.effectiveValues.enemyMid, '#222222');
  assert.equal(shiv.view.effectiveValues.enemyLow, DEFAULTS.enemyLow);
});

test('Layered presets derive legacy own, drop unknown own keys, keep own through codes, and reject non-array own', () => {
  const legacy = createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'All', mode: 'all', values: { enemyLow: '#111111' } }),
      rawPreset({ id: 'user_0002', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'], values: { enemyLow: '#111111', enemyMid: '#222222' } }),
      { ...rawPreset({ id: 'user_0003', name: 'Skip Haze', mode: 'except', heroes: ['hero_haze'], values: { enemyHigh: '#333333' } }), own: ['enemyHigh', 'bogusKey'] },
    ],
    nextUserPresetNumber: 4,
  }));
  const touched = send(legacy, 'preset_select', { id: 'user_0002' });
  assert.equal(touched.status, 'committed');
  assert.deepEqual(storedPreset(touched, 'user_0002').own, ['enemyMid']);
  assert.deepEqual(storedPreset(touched, 'user_0003').own, ['enemyHigh']);
  assert.equal(Object.hasOwn(storedPreset(touched, 'user_0001'), 'own'), false);

  const source = createState({ ...makeSession({
    userPresets: [
      { ...rawPreset({ id: 'user_0001', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'], values: { enemyLow: '#111111', enemyMid: '#222222' } }), own: ['enemyMid'] },
    ],
    selectedPresetId: 'user_0001',
    nextUserPresetNumber: 2,
  }), offsetVersion: 2 });
  const code = effect(send(source, 'preset_copy_selected'), 'clipboard_write').text;
  const destination = createState();
  const imported = send(destination, 'preset_import', { raw: code });
  assert.equal(imported.status, 'committed', imported.code);
  const importedId = imported.view.repository.selectedId;
  assert.deepEqual(storedPreset(imported, importedId).own, ['enemyMid']);

  const payload = JSON.parse(code.slice(6));
  payload.records[0].own = 'enemyMid';
  const target = createState();
  const unchanged = target.read();
  const rejected = send(target, 'preset_import', { raw: `HPCRP1${JSON.stringify(payload)}` });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.view, unchanged);
  assert.deepEqual(rejected.effects, []);
});

test('Layered presets keep the hero preset ACTIVE after a Base change refresh', () => {
  const state = layeredState([
    rawPreset({ id: 'user_0002', name: 'All B', mode: 'all', values: { enemyLow: '#999999' } }),
  ]);
  assert.equal(settleHero(state, 1, 'SHIV').view.repository.activeId, 'user_0009');
  const moved = send(state, 'preset_move', { id: 'user_0002', delta: -1 });
  assert.equal(moved.status, 'committed');
  assert.equal(moved.view.repository.activeId, 'user_0009');
  assert.equal(moved.view.effectiveValues.enemyLow, '#999999');
  const again = send(state, 'preset_apply', { id: 'user_0009' });
  assert.equal(again.status, 'noop');
  assert.equal(again.code, 'NO_CHANGE');
});

test('Layered presets refresh an unedited hero Current on Base changes without Undo, and leave an edited Current alone', () => {
  const state = layeredState([
    rawPreset({ id: 'user_0002', name: 'All B', mode: 'all', values: { enemyLow: '#999999' } }),
    rawPreset({ id: 'user_0003', name: 'All C', mode: 'all', values: { enemyLow: '#555555' } }),
  ]);
  const shiv = settleHero(state, 1, 'SHIV');
  assert.equal(shiv.view.effectiveValues.enemyLow, '#111111');
  const undoBefore = shiv.view.undoAvailable;

  const moved = send(state, 'preset_move', { id: 'user_0002', delta: -1 });
  assert.equal(moved.view.effectiveValues.enemyLow, '#999999');
  assert.equal(currentScope(moved.view).values.enemyLow, '#999999');
  assert.equal(effectsOf(moved, 'effective_publish').length, 1);
  assert.equal(moved.view.undoAvailable, undoBefore);

  const removed = removePreset(state, 'user_0002');
  assert.equal(removed.view.effectiveValues.enemyLow, '#111111');
  assert.equal(removed.view.effectiveValues.enemyMid, '#222222');
  assert.equal(removed.view.undoAvailable, undoBefore);
  assert.equal(removed.view.repository.activeId, 'user_0009');

  send(state, 'setting_edit', { key: 'enemyHigh', value: '#454545' });
  const edited = send(state, 'preset_move', { id: 'user_0003', delta: -1 });
  assert.equal(edited.status, 'committed');
  assert.equal(edited.view.effectiveValues.enemyLow, '#111111');
  assert.equal(edited.view.effectiveValues.enemyHigh, '#454545');
});

test('Layered presets Reset Section on a hero Current resets to Base and Undo restores; All Current resets to defaults', () => {
  const state = layeredState();
  settleHero(state, 1, 'SHIV');
  send(state, 'setting_edit', { key: 'enemyLow', value: '#ABCDEF' });
  const request = send(state, 'reset_request', { keys: ['enemyLow', 'enemyMid'] });
  assert.equal(request.status, 'committed');
  const reset = send(state, 'reset_confirm', { token: request.view.transactions.confirmation.token });
  assert.equal(currentScope(reset.view).values.enemyLow, '#111111');
  assert.equal(currentScope(reset.view).values.enemyMid, '#121212');
  assert.equal(currentScope(reset.view).mode, 'selected');
  const undone = send(state, 'undo');
  assert.equal(currentScope(undone.view).values.enemyLow, '#ABCDEF');
  assert.equal(currentScope(undone.view).values.enemyMid, '#222222');

  send(state, 'preset_apply', { id: 'user_0001' });
  const allRequest = send(state, 'reset_request', { keys: ['enemyLow', 'enemyMid'] });
  const allReset = send(state, 'reset_confirm', { token: allRequest.view.transactions.confirmation.token });
  assert.equal(currentScope(allReset.view).values.enemyLow, DEFAULTS.enemyLow);
  assert.equal(currentScope(allReset.view).values.enemyMid, DEFAULTS.enemyMid);
});

// Round 4: repository.sourceState is provenance plus equality for the menu's
// CHANGED row. It is not derived from activeId.
test('sourceState names the applied user preset and tracks value equality', () => {
  const state = createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Blue', values: { enemyLow: '#222222' } }),
    ],
  }));
  assert.deepEqual(state.read().repository.sourceState, { id: '', matches: true });

  const applied = send(state, 'preset_apply', { id: 'user_0001' });
  assert.deepEqual(applied.view.repository.sourceState, { id: 'user_0001', matches: true });
  assert.equal(applied.view.repository.activeId, 'user_0001');

  const edited = send(state, 'setting_edit', { key: 'widthScale', value: 150 });
  assert.deepEqual(edited.view.repository.sourceState, { id: 'user_0001', matches: false });
  assert.equal(edited.view.repository.activeId, 'scope_current');

  const undone = send(state, 'undo');
  assert.deepEqual(undone.view.repository.sourceState, { id: 'user_0001', matches: true });

  // Rewrite Default is never a source.
  const baked = send(state, 'preset_apply', { id: 'baked_default' });
  assert.deepEqual(baked.view.repository.sourceState, { id: '', matches: true });

  // A deleted source is dropped rather than reported as CHANGED.
  send(state, 'preset_apply', { id: 'user_0001' });
  send(state, 'setting_edit', { key: 'widthScale', value: 160 });
  send(state, 'preset_select', { id: 'user_0001' });
  const request = send(state, 'preset_remove_request', { id: 'user_0001' });
  const removed = send(state, 'preset_remove_confirm', {
    token: request.view.transactions.confirmation.token,
  });
  assert.deepEqual(removed.view.repository.sourceState, { id: '', matches: true });
});

test('sourceState: a condition rule edit is CHANGED, condition activation alone is not', () => {
  const state = createState(makeSession({
    userPresets: [
      rawPreset({
        id: 'user_0001',
        name: 'Rule',
        values: { enemyLow: '#222222' },
        conditions: { enemyVisible: { slot: 2, minTier: 2, value: false } },
      }),
    ],
  }));
  const applied = send(state, 'preset_apply', { id: 'user_0001' });
  assert.deepEqual(applied.view.repository.sourceState, { id: 'user_0001', matches: true });

  const activated = send(state, 'ability_observe', {
    epoch: applied.view.identity.epoch,
    tiers: [1, 2, 0, 3],
  });
  assert.equal(activated.view.effectiveValues.enemyVisible, false);
  assert.deepEqual(activated.view.repository.sourceState, { id: 'user_0001', matches: true });
  assert.equal(activated.view.repository.activeId, 'user_0001');

  const ruleEdit = send(state, 'condition_set', {
    key: 'enemyVisible',
    slot: 3,
    minTier: 1,
    value: false,
  });
  assert.deepEqual(ruleEdit.view.repository.sourceState, { id: 'user_0001', matches: false });
  assert.equal(ruleEdit.view.repository.activeId, 'scope_current');
});

test('sourceState: two identical presets keep the second source matching although ACTIVE is the first', () => {
  const state = createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Twin A', values: { enemyLow: '#222222' } }),
      rawPreset({ id: 'user_0002', name: 'Twin B', values: { enemyLow: '#222222' } }),
    ],
  }));
  const applied = send(state, 'preset_apply', { id: 'user_0002' });
  assert.equal(applied.view.repository.activeId, 'user_0001');
  assert.deepEqual(applied.view.repository.sourceState, { id: 'user_0002', matches: true });

  const edited = send(state, 'setting_edit', { key: 'enemyLow', value: '#ABCDEF' });
  assert.deepEqual(edited.view.repository.sourceState, { id: 'user_0002', matches: false });
});

// ---------------------------------------------------------------------------
// Retired ghoul opacity: both settings left the editable contract, but their
// codec slots stay reserved and old saves, presets, and share codes still load.

const GHOUL_KEYS = ['ghoulOpacityEnabled', 'ghoulOpacity'];
const GHOUL_RULES = {
  ghoulOpacityEnabled: { slot: 1, minTier: 1, value: true },
  ghoulOpacity: { slot: 2, minTier: 2, value: 20 },
};
const KEPT_RULE = { enemyMid: { slot: 3, minTier: 1, value: '#ABCDEF' } };

test('retired ghoul opacity keeps its codec slots but leaves every editable table and intent', () => {
  const contract = loadSettingsContract();
  assert.equal(contract.codecKeys.length, 72);
  assert.equal(contract.codecKeys[67], 'excludeGhouls');
  assert.equal(contract.codecKeys[68], 'ghoulOpacityEnabled');
  assert.equal(contract.codecKeys[69], 'ghoulOpacity');
  assert.equal(contract.codecKeys[70], 'readoutMaxTeamColor');
  assert.equal(contract.codecKeys[71], 'allyTeamHigh');
  assert.equal(contract.codecDefaults.ghoulOpacityEnabled, false);
  assert.equal(contract.codecDefaults.ghoulOpacity, 100);
  for (const key of GHOUL_KEYS) {
    assert.equal(contract.keys.includes(key), false, key);
    assert.equal(Object.hasOwn(contract.defaults, key), false, key);
    assert.equal(Object.hasOwn(contract.booleanKeys, key), false, key);
    assert.equal(Object.hasOwn(contract.numberBounds, key), false, key);
    assert.equal(contract.settingMeta[key], undefined, key);
  }
  assert.equal(contract.validateSettingValue('ghoulOpacity', 35), false);
  assert.equal(Object.hasOwn(contract.normalizeValues({ ghoulOpacity: 35 }), 'ghoulOpacity'), false);

  const state = createState();
  assert.deepEqual(
    state.read().schema.keys.filter((key) => GHOUL_KEYS.includes(key)),
    [],
  );
  const edit = send(state, 'setting_edit', { key: 'ghoulOpacity', value: 35 });
  assert.equal(edit.status, 'rejected');
  assert.equal(edit.code, 'INVALID_SETTING');
  const rule = send(state, 'condition_set', { key: 'ghoulOpacity', slot: 1, minTier: 1, value: 20 });
  assert.equal(rule.status, 'rejected');
  assert.equal(rule.code, 'INVALID_CONDITION');
});

test('an old local save carrying ghoul opacity in values, rules, scopes, and own keys loads without it', () => {
  const oldValues = { widthScale: 160, ghoulOpacityEnabled: true, ghoulOpacity: 35 };
  const state = createState(makeSession({
    values: { ...oldValues, widthScale: 150 },
    conditions: { ...GHOUL_RULES, ...KEPT_RULE },
    scopes: [{
      id: 'scope_current',
      mode: 'selected',
      heroes: ['hero_haze'],
      values: oldValues,
      conditions: { ...GHOUL_RULES, ...KEPT_RULE },
      sourcePresetId: 'user_0001',
    }],
    userPresets: [{
      ...rawPreset({
        id: 'user_0001',
        name: 'Old',
        mode: 'selected',
        heroes: ['hero_haze'],
        values: oldValues,
        conditions: { ...GHOUL_RULES, ...KEPT_RULE },
      }),
      own: ['widthScale', 'ghoulOpacity', 'ghoulOpacityEnabled'],
    }],
    nextUserPresetNumber: 2,
  }));

  const view = state.read();
  assert.equal(view.values.widthScale, 150);
  assert.deepEqual(view.conditions, KEPT_RULE);
  assert.equal(currentScope(view).values.widthScale, 160);
  assert.deepEqual(currentScope(view).conditions, KEPT_RULE);
  assert.doesNotMatch(JSON.stringify(view), /ghoul/i);

  const touched = send(state, 'preset_select', { id: 'user_0001' });
  const saved = storedPreset(touched, 'user_0001');
  assert.deepEqual(saved.own, keyOrder(DEFAULT_KEYS.filter(
    key => key === 'widthScale' || DEFAULTS[key] !== CONTRACT.sparseDefaults[key],
  )));
  for (const key of saved.own) {
    const expected = key === 'widthScale' ? 160 : CONTRACT.sparseDefaults[key];
    assert.equal(saved.values[key], expected, key);
  }
  assert.deepEqual(saved.conditions, KEPT_RULE);
  assert.doesNotMatch(effect(touched, 'session_replace').raw, /ghoul/i);
});

test('HPCR2 codes that carry ghoul opacity slots and rules import without them and never write them back', () => {
  const code = 'HPCR2' + JSON.stringify({
    v: [[1, 150], [68, true], [69, 35], [70, true], [71, true]],
    c: { ...GHOUL_RULES, ...KEPT_RULE },
  });
  const state = createState();
  const imported = send(state, 'settings_import', { raw: code });
  assert.equal(imported.status, 'committed', imported.code);
  assert.equal(imported.view.values.widthScale, 150);
  assert.equal(Object.hasOwn(imported.view.values, 'readoutMaxTeamColor'), false);
  assert.equal(imported.view.values.allyTeamHigh, true);
  assert.deepEqual(imported.view.conditions, KEPT_RULE);
  assert.doesNotMatch(JSON.stringify(imported.view), /ghoul/i);

  const exported = JSON.parse(
    effect(send(state, 'settings_copy'), 'clipboard_write').text.slice(5),
  );
  const pairs = new Map(exported.v);
  assert.equal(pairs.has(68), false);
  assert.equal(pairs.has(69), false);
  assert.equal(pairs.get(1), 150);
  // Slots after the retired pair keep their positions.
  assert.equal(pairs.has(70), false);
  assert.equal(pairs.get(71), true);
  assert.deepEqual(Object.keys(exported.c), ['enemyMid']);

  const onlyRetired = send(createState(), 'settings_import', {
    raw: 'HPCR2' + JSON.stringify({ v: [[68, true], [69, 0]], c: GHOUL_RULES }),
  });
  assert.notEqual(onlyRetired.status, 'rejected', onlyRetired.code);

  const target = createState();
  const before = target.read();
  const rejected = send(target, 'settings_import', {
    raw: 'HPCR2' + JSON.stringify({
      v: [],
      c: { ...GHOUL_RULES, bogusKey: { slot: 1, minTier: 1, value: true } },
    }),
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.code, 'INVALID HPCR2 CONDITIONS');
  assert.equal(rejected.view, before);
  assert.deepEqual(rejected.effects, []);
});

test('HPCRP1 preset codes that carry ghoul opacity slots, rules, and own keys import without them', () => {
  const record = {
    id: 'user_0007',
    kind: 'user',
    name: 'Old Import',
    mode: 'selected',
    heroes: ['hero_haze'],
    values: [[1, 150], [68, true], [69, 35]],
    conditions: { ...GHOUL_RULES, ...KEPT_RULE },
    own: ['widthScale', 'ghoulOpacity', 'ghoulOpacityEnabled'],
  };
  const code = (changes) => 'HPCRP1' + JSON.stringify({
    records: [{ ...record, ...changes }],
    selectedPresetId: record.id,
  });

  const imported = send(createState(), 'preset_import', { raw: code({}) });
  assert.equal(imported.status, 'committed', imported.code);
  const saved = storedPreset(imported, imported.view.repository.selectedId);
  assert.equal(saved.name, 'Old Import');
  assert.equal(saved.mode, 'selected');
  assert.equal(saved.values.widthScale, 150);
  assert.deepEqual(saved.own, keyOrder(DEFAULT_KEYS.filter(
    key => key === 'widthScale' || DEFAULTS[key] !== CONTRACT.sparseDefaults[key],
  )));
  assert.deepEqual(saved.conditions, KEPT_RULE);
  assert.doesNotMatch(effect(imported, 'session_replace').raw, /ghoul/i);

  // A preset whose only rules are retired imports as a preset with no rules.
  const onlyRetired = send(createState(), 'preset_import', {
    raw: code({ conditions: GHOUL_RULES }),
  });
  assert.equal(onlyRetired.status, 'committed', onlyRetired.code);
  assert.equal(
    storedPreset(onlyRetired, onlyRetired.view.repository.selectedId).conditions,
    null,
  );

  // Genuinely unknown rules still reject the whole import atomically.
  const target = createState();
  const before = target.read();
  const rejected = send(target, 'preset_import', {
    raw: code({
      conditions: { ...GHOUL_RULES, bogusKey: { slot: 1, minTier: 1, value: true } },
    }),
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.code, 'INVALID PRESET CONDITIONS');
  assert.equal(rejected.view, before);
  assert.deepEqual(rejected.effects, []);
});

// ---------------------------------------------------------------------------
// SAVE TO PRESET: preset_save_to overwrites a chosen user preset with the live
// settings and never rewrites what that preset applies to.

function saveToState() {
  return createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Everyone', mode: 'all', values: { enemyLow: '#111111' } }),
      rawPreset({ id: 'user_0002', name: 'Haze Only', mode: 'selected', heroes: ['hero_haze'], values: { enemyLow: '#222222' } }),
      rawPreset({ id: 'user_0003', name: 'Skip Shiv', mode: 'except', heroes: ['hero_shiv'], values: { enemyLow: '#333333' } }),
    ],
    nextUserPresetNumber: 4,
  }));
}

test('preset_save_to overwrites a user preset in place and keeps its name, mode, and HEROES', () => {
  const state = saveToState();
  send(state, 'preset_apply', { id: 'user_0001' });
  send(state, 'setting_edit', { key: 'widthScale', value: 150 });
  send(state, 'condition_set', { key: 'enemyMid', ...KEPT_RULE.enemyMid });
  const before = state.read();

  const saved = send(state, 'preset_save_to', { id: 'user_0003' });
  assert.equal(saved.status, 'committed');
  assert.equal(saved.code, 'PRESET_UPDATED');
  const record = storedPreset(saved, 'user_0003');
  assert.equal(record.id, 'user_0003');
  assert.equal(record.name, 'Skip Shiv');
  assert.equal(record.mode, 'except');
  assert.deepEqual(record.heroes, ['hero_shiv']);
  assert.equal(record.values.widthScale, 150);
  assert.equal(record.values.enemyLow, '#111111');
  assert.deepEqual(record.conditions, KEPT_RULE);
  assert.deepEqual(record.own, keyOrder(['widthScale']));
  assert.equal(storedPresets(saved).length, 3);

  // Nothing else moves: list order, the other presets, the live settings, and
  // the source preset. The saved preset becomes the selected row.
  assert.deepEqual(
    saved.view.repository.rows.map((candidate) => candidate.id),
    before.repository.rows.map((candidate) => candidate.id),
  );
  for (const id of ['user_0001', 'user_0002'])
    assert.deepEqual(row(saved.view, id), row(before, id), id);
  assert.equal(currentScope(saved.view).values.widthScale, 150);
  assert.deepEqual(saved.view.repository.sourceState, { id: 'user_0001', matches: false });
  assert.equal(saved.view.repository.selectedId, 'user_0003');
  assertNoEffect(saved, 'effective_publish');

  // Applying it afterwards makes it the matching source; only that apply is
  // undoable, so UNDO never takes the saved settings back out of the preset.
  const applied = send(state, 'preset_apply', { id: 'user_0003' });
  assert.deepEqual(applied.view.repository.sourceState, { id: 'user_0003', matches: true });
  assert.equal(applied.view.repository.activeId, 'user_0003');
  assert.equal(currentScope(applied.view).mode, 'except');
  assert.deepEqual(currentScope(applied.view).heroes, ['hero_shiv']);
  assert.equal(currentScope(applied.view).values.widthScale, 150);
  const undone = send(state, 'undo');
  assert.equal(currentScope(undone.view).mode, 'all');
  assert.equal(currentScope(undone.view).sourcePresetId, 'user_0001');
  assert.equal(storedPreset(undone, 'user_0003').values.widthScale, 150);
});

test('preset_save_to on the top All Heroes preset stores no own keys and changes what hero presets inherit', () => {
  const state = autoState([
    rawPreset({ id: 'user_0001', name: 'Everyone', mode: 'all', values: { enemyLow: '#111111', enemyMid: '#121212' } }),
    { ...rawPreset({ id: 'user_0002', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'], values: { enemyLow: '#111111', enemyMid: '#222222' } }), own: ['enemyMid'] },
  ], { nextUserPresetNumber: 3 });
  send(state, 'preset_apply', { id: 'user_0001' });
  send(state, 'setting_edit', { key: 'enemyLow', value: '#999999' });

  const saved = send(state, 'preset_save_to', { id: 'user_0001' });
  assert.equal(saved.code, 'PRESET_UPDATED');
  const base = storedPreset(saved, 'user_0001');
  assert.equal(base.name, 'Everyone');
  assert.equal(base.mode, 'all');
  assert.deepEqual(base.heroes, []);
  assert.equal(base.values.enemyLow, '#999999');
  assert.equal(Object.hasOwn(base, 'own'), false);
  assert.deepEqual(saved.view.repository.sourceState, { id: 'user_0001', matches: true });

  const hero = storedPreset(saved, 'user_0002');
  assert.deepEqual(hero.own, ['enemyMid']);
  const routed = settleHero(state, 1, 'SHIV');
  assert.equal(routed.view.repository.activeId, 'user_0002');
  assert.equal(routed.view.effectiveValues.enemyLow, '#999999');
  assert.equal(routed.view.effectiveValues.enemyMid, '#222222');
});

test('preset_save_to rejects Rewrite Default and unknown or malformed targets without changing anything', () => {
  const state = saveToState();
  send(state, 'setting_edit', { key: 'widthScale', value: 150 });
  const before = state.read();
  for (const id of ['baked_default', 'user_9999', 'scope_current', '', undefined, 42, null]) {
    const rejected = send(state, 'preset_save_to', { id });
    assert.equal(rejected.status, 'rejected', String(id));
    assert.equal(rejected.code, 'PRESET_NOT_FOUND', String(id));
    assert.equal(rejected.view, before, String(id));
    assert.deepEqual(rejected.effects, [], String(id));
  }
  assert.equal(before.repository.rows.length, 4);
});

test('preset_save allHeroes always creates a new All Heroes preset and never rewrites a selected hero preset', () => {
  const state = createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Everyone', mode: 'all', values: { enemyLow: '#111111' } }),
      rawPreset({ id: 'user_0002', name: 'Only Shiv', mode: 'selected', heroes: ['hero_shiv'], values: { enemyLow: '#222222' } }),
    ],
    nextUserPresetNumber: 3,
  }));
  send(state, 'preset_apply', { id: 'user_0002' });
  send(state, 'setting_edit', { key: 'widthScale', value: 150 });
  // A hero preset is selected, as after clicking its row.
  send(state, 'preset_select', { id: 'user_0002' });
  const before = state.read();

  const created = send(state, 'preset_save', { name: 'PRESET 3', allHeroes: true });
  assert.equal(created.status, 'committed');
  assert.equal(created.code, 'PRESET_SAVED');
  assert.equal(created.view.repository.selectedId, 'user_0003');
  assert.equal(created.view.repository.nextUserNumber, 4);
  const record = storedPreset(created, 'user_0003');
  assert.equal(record.name, 'PRESET 3');
  assert.equal(record.mode, 'all');
  assert.deepEqual(record.heroes, []);
  assert.equal(Object.hasOwn(record, 'own'), false);
  assert.equal(record.values.widthScale, 150);
  assert.equal(record.values.enemyLow, '#222222');
  for (const id of ['user_0001', 'user_0002'])
    assert.deepEqual(row(created.view, id), row(before, id), id);
  // Saving alone does not switch what is on screen.
  assert.equal(currentScope(created.view).mode, 'selected');
  assert.equal(currentScope(created.view).sourcePresetId, 'user_0002');

  // The same request after deselecting (the menu's flow) creates the next one.
  send(state, 'preset_select', { id: null });
  const second = send(state, 'preset_save', { name: 'PRESET 4', allHeroes: true });
  assert.equal(second.code, 'PRESET_SAVED');
  assert.equal(storedPreset(second, 'user_0004').mode, 'all');
  assert.equal(storedPresets(second).length, 4);

  // Without the flag a hero Current still saves as a hero preset.
  const heroSave = send(createState(makeSession({
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Everyone', mode: 'all', values: { enemyLow: '#111111' } }),
    ],
    scopes: [{ id: 'scope_current', mode: 'selected', heroes: ['hero_haze'], values: { enemyLow: '#444444' }, conditions: {} }],
    nextUserPresetNumber: 2,
  })), 'preset_save', { name: 'Haze' });
  assert.equal(storedPreset(heroSave, 'user_0002').mode, 'selected');
});


test('readout offsets normalize and round-trip as zero-based CSS pixels', () => {
  const keys = ['readoutOffsetX', 'readoutOffsetY', 'allyReadoutOffsetX',
    'allyReadoutOffsetY', 'enemyPulseReadoutOffsetX', 'enemyPulseReadoutOffsetY'];
  const omitted = createState({ version: 1, offsetVersion: 2, values: CONTRACT.sparseDefaults });
  send(omitted, 'settings_import', { raw: 'HPCR2{"v":[],"c":{}}' });
  const omittedPreset = createState();
  send(omittedPreset, 'preset_import', { raw:
    'HPCRP1{"records":[{"id":"user_0001","kind":"user","name":"Old defaults","mode":"all","heroes":[],"values":[],"conditions":null}]}' });
  send(omittedPreset, 'preset_apply', { id: 'user_0001' });
  for (const key of keys) {
    const limit = key.endsWith('X') ? 334 : 350;
    assert.equal(CONTRACT.sparseDefaults[key], 0, key);
    assert.equal(CODEC_DEFAULTS[key], 0, key);
    assert.equal(omitted.read().values[key], 0, key);
    assert.equal(omittedPreset.read().effectiveValues[key], 0, key);
    assert.equal(CONTRACT.normalizeValues({ [key]: 999 })[key], limit, key);
    assert.equal(CONTRACT.normalizeValues({ [key]: -999 })[key], -limit, key);
    const hydrated = createState({ sessionRaw: JSON.stringify({ version: 1,
      offsetVersion: 2, values: { [key]: 999 } }) });
    assert.equal(hydrated.read().values[key], limit, key);
  }
  for (const [x, y] of [[0, 0], [27, -30], [150, -100], [200, 210], [-200, -210]]) {
    const state = createState();
    for (const key of keys) send(state, 'setting_edit', { key, value: key.endsWith('X') ? x : y });
    const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
    const roundtrip = createState();
    send(roundtrip, 'settings_import', { raw: code });
    send(state, 'preset_save', { name: 'Pixel offsets' });
    const preset = effect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
    const presetRoundtrip = createState();
    send(presetRoundtrip, 'preset_import', { raw: preset });
    send(presetRoundtrip, 'preset_apply', { id: 'user_0001' });
    for (const key of keys) {
      const expected = key.endsWith('X') ? x : y;
      assert.equal(roundtrip.read().values[key], expected, key);
      assert.equal(presetRoundtrip.read().effectiveValues[key], expected, key);
    }
  }
  const legacy = createState();
  send(legacy, 'settings_import', { raw: 'HPCR2{"v":[[32,27],[33,500],[55,27],[56,500]],"c":{},"hpv2":{"v":1,"values":[[33,-30],[34,434]],"conditions":{}}}' });
  assert.deepEqual(keys.map(key => legacy.read().values[key]), [27, 210, -30, 210, 27, 210]);
});

test('historical baked readout defaults canonicalize without dropping user presets', () => {
  const source = createState();
  send(source, 'setting_edit', { key: 'readoutOffsetX', value: 150 });
  send(source, 'setting_edit', { key: 'readoutOffsetY', value: -100 });
  send(source, 'preset_save', { name: 'User pixels' });
  const payload = JSON.parse(effect(send(source, 'preset_copy_all'), 'clipboard_write').text.slice(6));
  const baked = payload.records.find(record => record.kind === 'baked');
  const expectedBaked = JSON.parse(JSON.stringify(baked));
  baked.values = JSON.parse(wireCorpus.hpcrp1.historicalCanonicalCode.slice(6))
    .records.find(record => record.kind === 'baked').values;
  baked.values.push([32, -30], [33, 434], [55, 27], [56, 500]);
  baked.hpv2 = { v: 1, values: [[33, -30], [34, 434]], conditions: {} };
  const raw = 'HPCRP1' + JSON.stringify(payload);
  const state = createState();
  const imported = send(state, 'preset_import', { raw });
  assert.equal(imported.status, 'committed');
  const hydrated = createState({ sessionRaw: effect(imported, 'session_replace').raw });
  for (const target of [state, hydrated]) {
    const copied = JSON.parse(effect(send(target, 'preset_copy_all'), 'clipboard_write').text.slice(6));
    const canonical = copied.records.find(record => record.kind === 'baked');
    assert.deepEqual(canonical, expectedBaked);
    for (const key of ['readoutOffsetX', 'readoutOffsetY', 'allyReadoutOffsetX',
      'allyReadoutOffsetY', 'enemyPulseReadoutOffsetX', 'enemyPulseReadoutOffsetY'])
      assert.equal(row(target.read(), 'baked_default').values[key], DEFAULTS[key], key);
    const user = copied.records.find(record => record.kind === 'user');
    assert.ok(user.values.some(([index, value]) => index === 32 && value === 150));
    assert.ok(user.values.some(([index, value]) => index === 33 && value === -100));
  }
  const earlierDefaults = JSON.parse(JSON.stringify(payload));
  earlierDefaults.records.find(record => record.kind === 'baked').values =
    baked.values.map(([index, value]) => [index, index === 32 ? 27 : index === 33 ? 500 : value]);
  assert.equal(send(createState(), 'preset_import', {
    raw: 'HPCRP1' + JSON.stringify(earlierDefaults),
  }).status, 'committed');
  for (const [index, value] of [[32, 28], [33, 501], [55, 28], [56, 501], [8, '#123456']]) {
    const invalid = JSON.parse(JSON.stringify(payload));
    const record = invalid.records.find(record => record.kind === 'baked');
    record.values = record.values.filter(([slot]) => slot !== index).concat([[index, value]]);
    assert.equal(send(createState(), 'preset_import', { raw: 'HPCRP1' + JSON.stringify(invalid) }).status, 'rejected');
  }
  for (const [index, value] of [[33, -31], [34, 435]]) {
    const invalid = JSON.parse(JSON.stringify(payload));
    const record = invalid.records.find(record => record.kind === 'baked');
    record.hpv2.values = record.hpv2.values.filter(([slot]) => slot !== index).concat([[index, value]]);
    assert.equal(send(createState(), 'preset_import', { raw: 'HPCRP1' + JSON.stringify(invalid) }).status, 'rejected');
  }
});
test('appended Units settings remain typed, stock by default, and use the existing hpv2 extension', () => {
  const keys = [
    'npcEnemyEnabled',
    'npcAllyEnabled',
    'npcNeutralEnabled',
    'buildingEnemyEnabled',
    'buildingAllyEnabled',
    'neutralColor',
  ];
  assert.deepEqual(EXTENSION_KEYS.slice(41, 47), keys);
  for (const key of keys.slice(0, 5)) {
    assert.equal(DEFAULTS[key], false);
    assert.equal(SETTING_META[key].type, 'boolean');
    assert.equal(SETTING_META[key].conditionEligible, true);
  }
  assert.equal(DEFAULTS.neutralColor, '#5BEFB5');
  assert.equal(SETTING_META.neutralColor.type, 'color');
  assert.equal(SETTING_META.neutralColor.conditionEligible, true);

  const source = createState();
  keys.slice(0, 5).forEach(key =>
    send(source, 'setting_edit', { key, value: true }),
  );
  send(source, 'setting_edit', { key: 'neutralColor', value: '#2468AC' });
  send(source, 'condition_set', {
    key: 'npcEnemyEnabled',
    slot: 2,
    minTier: 3,
    value: false,
  });
  const code = effect(send(source, 'settings_copy'), 'clipboard_write').text;
  const payload = JSON.parse(code.slice(5));
  assert.deepEqual(payload.hpv2.values.filter(([slot]) => slot >= 41 && slot <= 46), [
    [41, true],
    [42, true],
    [43, true],
    [44, true],
    [45, true],
    [46, '#2468AC'],
  ]);
  assert.deepEqual(payload.hpv2.conditions.npcEnemyEnabled, {
    slot: 2,
    minTier: 3,
    value: false,
  });

  const destination = createState();
  const roundTrip = send(destination, 'settings_import', { raw: code });
  for (const key of keys.slice(0, 5))
    assert.equal(roundTrip.view.values[key], true, key);
  assert.equal(roundTrip.view.values.neutralColor, '#2468AC');
  assert.deepEqual(roundTrip.view.conditions.npcEnemyEnabled, {
    slot: 2,
    minTier: 3,
    value: false,
  });

  const preserved = send(destination, 'settings_import', {
    raw: 'HPCR2{"v":[],"c":{}}',
  });
  assert.equal(preserved.view.values.npcEnemyEnabled, true);
  assert.equal(preserved.view.values.neutralColor, '#2468AC');
  const replaced = send(destination, 'settings_import', {
    raw: 'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[],"conditions":{}}}',
  });
  for (const key of keys.slice(0, 5))
    assert.equal(replaced.view.values[key], false, key);
  assert.equal(replaced.view.values.neutralColor, '#5BEFB5');
  assert.equal(replaced.view.conditions.npcEnemyEnabled, undefined);
});
test('Appearance defaults hydrate older snapshots and scope/ability overrides remain session-native', () => {
  const keys = ['criticalIndicatorVisible', 'playerNamesVisible'];
  const state = createState(makeSession({ values: { widthScale: 123 } }));
  for (const key of keys) assert.equal(state.read().values[key], true);
  send(state, 'scope_set', { mode: 'selected', heroes: ['hero_haze'] });
  for (const key of keys) {
    send(state, 'setting_edit', { key, value: false });
    assert.equal(state.read().effectiveValues[key], false);
    send(state, 'condition_set', { key, slot: 2, minTier: 2, value: true });
  }
  send(state, 'ability_observe', { epoch: state.read().identity.epoch, tiers: [0, 2, 0, 0] });
  for (const key of keys) assert.equal(state.read().effectiveValues[key], true);
  send(state, 'ability_observe', { epoch: state.read().identity.epoch, tiers: [0, 1, 0, 0] });
  for (const key of keys) assert.equal(state.read().effectiveValues[key], false);
  send(state, 'scope_set', { mode: 'off', heroes: [] });
  for (const key of keys) assert.equal(state.read().effectiveValues[key], true);
  assert.equal(state.read().effectiveValues.widthScale, 123);
});

test('stamina shape migration and explicit arrows survive settings/preset and session round trips', () => {
  for (const [values, expected] of [
    [{}, 'arrow'], [{ staminaWidth: 150 }, 'box'], [{ staminaHeight: 60 }, 'box'],
    [{ enemyStaminaColorEnabled: true }, 'box'], [{ staminaOffsetX: 20 }, 'arrow'],
    [{ staminaWidth: 150, staminaShape: 'arrow' }, 'arrow'],
  ]) {
    assert.equal(createState({ sessionRaw: makeSession({ values }) }).read().values.staminaShape, expected);
  }
  const oldCode = createState();
  send(oldCode, 'settings_import', { raw: 'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[[0,150]],"conditions":{}}}' });
  assert.equal(oldCode.read().values.staminaShape, 'box');
  for (const shape of ['arrow', 'circle', 'box']) {
    const state = createState();
    send(state, 'setting_edit', { key: 'staminaWidth', value: 150 });
    send(state, 'setting_edit', { key: 'staminaShape', value: shape });
    send(state, 'setting_edit', { key: 'enemyPipColorEnabled', value: true });
    send(state, 'setting_edit', { key: 'enemyPipColor', value: '#123456' });
    send(state, 'setting_edit', { key: 'pipOpacity', value: 42 });
    const copied = effect(send(state, 'settings_copy'), 'clipboard_write').text;
    const restored = createState();
    send(restored, 'settings_import', { raw: copied });
    assert.equal(restored.read().values.staminaShape, shape);
    assert.equal(restored.read().values.enemyPipColor, '#123456');
    assert.equal(restored.read().values.pipOpacity, 42);
    send(state, 'preset_save', { name: 'Shape ' + shape });
    const presetCode = effect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
    send(restored, 'preset_import', { raw: presetCode });
    assert.equal(row(restored.read(), 'user_0001').values.staminaShape, shape);
  }
});

test('legacy presets and hero scopes derive stamina shape once without changing unrelated values', () => {
  const state = createState(makeSession({
    values: { enemyLow: '#112233', staminaOffsetX: 20 },
    scopes: [{
      id: 'scope_current', mode: 'selected', heroes: ['hero_shiv'],
      values: { staminaHeight: 60, allyHigh: '#ABCDEF' },
    }],
    userPresets: [
      rawPreset({ id: 'user_0001', name: 'Custom stamina', values: { enemyStaminaColorEnabled: true } }),
      rawPreset({ id: 'user_0002', name: 'Stock stamina', values: { staminaOffsetY: 15 } }),
    ],
  }));
  assert.equal(state.read().values.staminaShape, 'arrow');
  assert.equal(state.read().values.enemyLow, '#112233');
  assert.equal(currentScope(state.read()).values.staminaShape, 'box');
  assert.equal(currentScope(state.read()).values.allyHigh, '#ABCDEF');
  assert.equal(row(state.read(), 'user_0001').values.staminaShape, 'box');
  assert.equal(row(state.read(), 'user_0002').values.staminaShape, 'arrow');
  const imported = createState();
  const result = send(imported, 'preset_import', { raw: 'HPCRP1' + JSON.stringify({
    records: [{
      id: 'user_0001', kind: 'user', name: 'Old boxes', mode: 'all', heroes: [],
      values: [], conditions: null,
      hpv2: { v: 1, values: [[1, 60]], conditions: {} },
    }],
    selectedPresetId: 'user_0001',
  }) });
  assert.equal(result.status, 'committed');
  assert.equal(row(imported.read(), 'user_0001').values.staminaShape, 'box');
});

test('new pip and shape keys support Current scope, ability conditions, transfer and Undo', () => {
  const state = createState({ version: 1, offsetVersion: 2, values: CONTRACT.sparseDefaults });
  send(state, 'scope_set', { mode: 'selected', heroes: ['hero_shiv'] });
  for (const [key, value] of [
    ['enemyPipColorEnabled', true], ['enemyPipColor', '#123456'],
    ['allyPipColorEnabled', true], ['allyPipColor', '#ABCDEF'],
    ['pipOpacity', 42], ['staminaShape', 'circle'],
  ]) {
    const changed = send(state, 'setting_edit', { key, value });
    assert.equal(changed.status, 'committed', key);
    assert.equal(currentScope(changed.view).values[key], value);
    assert.equal(changed.view.values[key], CONTRACT.sparseDefaults[key], 'Frozen stock Base unchanged');
    const conditioned = send(state, 'condition_set', { key, slot: 1, minTier: 1, value });
    assert.equal(conditioned.status, 'committed', key);
    assert.deepEqual(currentScope(conditioned.view).conditions[key], { slot: 1, minTier: 1, value });
  }
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  const restored = createState();
  const imported = send(restored, 'settings_import', { raw: code });
  assert.equal(imported.status, 'committed');
  assert.equal(restored.read().values.staminaShape, 'circle');
  assert.equal(restored.read().conditions.pipOpacity.value, 42);
  send(restored, 'setting_edit', { key: 'pipOpacity', value: 70 });
  send(restored, 'undo');
  assert.equal(restored.read().values.pipOpacity, 42);
});

test('outline widths append stock baselines and round-trip settings, presets, scopes and saves', () => {
  const keys = ['readoutOutlineWidth', 'allyReadoutOutlineWidth', 'nameOutlineWidth'];
  assert.equal(createState().read().values.staminaShape, 'arrow');
  assert.deepEqual(EXTENSION_KEYS.slice(62, 65), keys);
  for (const [values, expected] of [
    [{}, 'arrow'], [{ staminaWidth: 150 }, 'box'],
    [{ staminaShape: 'box' }, 'box'], [{ staminaWidth: 150, staminaShape: 'arrow' }, 'arrow'],
  ]) assert.equal(createState(makeSession({ values })).read().values.staminaShape, expected);
  const legacy = createState();
  send(legacy, 'settings_import', { raw: 'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[[0,150]],"conditions":{}}}' });
  assert.equal(legacy.read().values.staminaShape, 'box');
  for (const key of keys) assert.equal(legacy.read().values[key], 5);
  const state = createState();
  for (const [index, key] of keys.entries()) {
    assert.equal(DEFAULTS[key], 5);
    assert.equal(CONTRACT.sparseDefaults[key], 5);
    assert.equal(CODEC_DEFAULTS[key], 5);
    assert.equal(SETTING_META[key].type, 'number');
    assert.equal(SETTING_META[key].conditionEligible, true);
    assert.deepEqual(CONTRACT.numberBounds[key], [0, 10]);
    assert.equal(CONTRACT.normalizeValue(key, 2.7), 2.5);
    assert.equal(CONTRACT.normalizeValue(key, -1), 0);
    assert.equal(CONTRACT.normalizeValue(key, 11), 10);
    assert.equal(createState(makeSession()).read().values[key], 5);
    send(state, 'setting_edit', { key, value: index + 0.5 });
    send(state, 'condition_set', { key, slot: 1, minTier: 2, value: index + 6.5 });
  }
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.equal(JSON.parse(code.slice(5)).hpv2.v, 2);
  const restored = createState();
  const imported = send(restored, 'settings_import', { raw: code });
  const saved = createState({ sessionRaw: effect(imported, 'session_replace').raw });
  for (const key of keys) {
    assert.equal(restored.read().values[key], state.read().values[key]);
    assert.deepEqual(restored.read().conditions[key], state.read().conditions[key]);
    assert.equal(saved.read().values[key], state.read().values[key]);
    assert.deepEqual(saved.read().conditions[key], state.read().conditions[key]);
  }
  send(state, 'preset_save', { name: 'Outline widths' });
  const presetCode = effect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  send(restored, 'preset_import', { raw: presetCode });
  for (const key of keys) assert.equal(row(restored.read(), 'user_0001').values[key], state.read().values[key]);
  send(state, 'scope_set', { mode: 'selected', heroes: ['hero_shiv'] });
  for (const key of keys) {
    const changed = send(state, 'setting_edit', { key, value: 9.5 });
    assert.equal(currentScope(changed.view).values[key], 9.5);
    const reloaded = createState({ sessionRaw: effect(changed, 'session_replace').raw });
    assert.equal(currentScope(reloaded.read()).values[key], 9.5);
  }
});

test('bar-relative defaults and historical offset migration round-trip once', () => {
  const factory = loadFactory();
  const fresh = factory.create(null);
  assert.equal(fresh.read().values.widthScale, 148);
  assert.equal(fresh.read().values.heightScale, 80);
  assert.equal(fresh.read().values.readoutOffsetX, 18);
  assert.equal(fresh.read().values.readoutOffsetY, 14);
  assert.equal(fresh.read().values.staminaShape, 'arrow');
  const old = factory.create(JSON.stringify({
    version: 1, values: { widthScale: 200, heightScale: 60, readoutOffsetX: 26, readoutOffsetY: 12 },
    userPresets: [{ id: 'user_0001', name: 'Old', mode: 'all', heroes: [],
      values: { widthScale: 200, heightScale: 60, allyReadoutOffsetX: 24, allyReadoutOffsetY: 12 } }],
  }));
  assert.equal(old.read().values.readoutOffsetX, 13);
  assert.equal(old.read().values.readoutOffsetY, 20);
  assert.equal(old.read().values.readoutFont, 'default');
  assert.equal(old.read().values.staminaShape, 'arrow');
  const copy = fresh.send({ type: 'settings_copy' });
  const code = effect(copy, 'clipboard_write').text;
  assert.equal(JSON.parse(code.slice(5)).hpv2.v, 2);
  const target = factory.create(null);
  target.send({ type: 'settings_import', raw: code });
  assert.deepEqual(target.read().values, fresh.read().values);
});

test('historical wire corpus retains effective HP offsets within integer migration tolerance', () => {
  const hpKeys = new Set(['readoutOffsetX', 'readoutOffsetY', 'allyReadoutOffsetX',
    'allyReadoutOffsetY', 'enemyPulseReadoutOffsetX', 'enemyPulseReadoutOffsetY']);
  for (const [kind, type] of [['hpcr2', 'settings_import'], ['hpcrp1', 'preset_import']]) {
    const state = createState({ version: 1, offsetVersion: 2, values: CONTRACT.sparseDefaults });
    const imported = send(state, type, { raw: wireCorpus[kind].inputCode });
    const values = kind === 'hpcr2' ? imported.view.values :
      imported.view.repository.allRows.find(row => row.id === wireCorpus[kind].selectedPresetId).values;
    for (const [key, oldValue] of Object.entries(wireCorpus[kind].historicalActiveValues)) {
      if (!DEFAULT_KEYS.includes(key)) continue;
      if (hpKeys.has(key)) {
        const scale = values[key.endsWith('X') ? 'widthScale' : 'heightScale'] / 100;
        assert.ok(Math.abs(values[key] * scale - oldValue) <= 0.5 * scale + 1e-9, `${kind}: ${key}`);
      } else assert.equal(values[key], oldValue, `${kind}: ${key}`);
    }
  }
});

test('RESET historical settings restores the new shipped defaults', () => {
  const state = createState({ version: 1, values: {} });
  assert.equal(state.read().values.widthScale, 100);
  const request = send(state, 'reset_request', { keys: DEFAULT_KEYS });
  const reset = send(state, 'reset_confirm', { token: request.view.transactions.confirmation.token });
  assert.deepEqual((currentScope(reset.view) || reset.view).values, DEFAULTS);
});

test('old explicit own presets pin changed fallback defaults only without an All Heroes base', () => {
  const old = { id: 'user_0001', name: 'Old own', mode: 'selected', heroes: ['hero_haze'],
    values: { widthScale: 180 }, own: ['widthScale'], conditions: null };
  const state = createState({ version: 1, values: {}, userPresets: [old] });
  send(state, 'preset_apply', { id: 'user_0001' });
  assert.equal(currentScope(state.read()).values.widthScale, 180);
  assert.equal(currentScope(state.read()).values.heightScale, 100);
  assert.equal(currentScope(state.read()).values.readoutFont, 'default');
  assert.equal(currentScope(state.read()).values.readoutOffsetX, 0);
  assert.equal(currentScope(state.read()).values.staminaShape, 'arrow');
  const imported = createState();
  send(imported, 'preset_import', { raw: 'HPCRP1' + JSON.stringify({ records: [{
    ...old, kind: 'user', values: [[1, 180]], conditions: null,
  }] }) });
  send(imported, 'preset_apply', { id: 'user_0001' });
  assert.equal(currentScope(imported.read()).values.readoutFont, 'default');
  assert.equal(currentScope(imported.read()).values.ultOffsetX, 0);
  const withBase = createState({ version: 1, values: {}, userPresets: [
    { id: 'user_0002', name: 'Base', mode: 'all', heroes: [],
      values: { heightScale: 140, readoutFont: 'oracle' }, conditions: null }, old,
  ] });
  send(withBase, 'preset_apply', { id: 'user_0001' });
  assert.equal(currentScope(withBase.read()).values.heightScale, 140);
  assert.equal(currentScope(withBase.read()).values.readoutFont, 'oracle');
  const modern = createState({ version: 1, offsetVersion: 2, values: {}, userPresets: [old] });
  send(modern, 'preset_apply', { id: 'user_0001' });
  assert.equal(currentScope(modern.read()).values.heightScale, 80);
  assert.equal(currentScope(modern.read()).values.readoutFont, 'oracle');
});

test('old published hydration snapshots migrate once alongside their session', () => {
  const factory = loadFactory();
  const source = { version: 1, values: { widthScale: 60, heightScale: 60,
    readoutOffsetX: 200, readoutOffsetY: 210 } };
  const old = factory.create({ sessionRaw: source, publishedRaw: { ...source, revision: 7 } });
  assert.equal(old.read().effectiveValues.readoutOffsetX, 333);
  assert.equal(old.read().effectiveValues.readoutOffsetY, 350);
  assert.equal(old.read().effectiveRevision, 7);
  assert.equal(source.values.readoutOffsetX, 200, 'hydration must not mutate caller data');
  const modern = factory.create({ sessionRaw: { ...source, offsetVersion: 2 },
    publishedRaw: { ...source, revision: 8 } });
  assert.equal(modern.read().effectiveValues.readoutOffsetX, 200);
  assert.equal(modern.read().effectiveValues.readoutOffsetY, 210);
});

test('HUD health wash appends typed OFF baselines without changing historical wire bytes', () => {
  assert.deepEqual(EXTENSION_KEYS.slice(65, 67), ['hudHealthColorMode', 'hudHealthColor']);
  for (const defaults of [DEFAULTS, CONTRACT.sparseDefaults, CODEC_DEFAULTS]) {
    assert.equal(defaults.hudHealthColorMode, 'off');
    assert.equal(defaults.hudHealthColor, '#FFFF00');
  }
  assert.deepEqual(SETTING_META.hudHealthColorMode.options, ['off', 'team', 'custom']);
  assert.equal(SETTING_META.hudHealthColorMode.conditionEligible, true);
  assert.equal(SETTING_META.hudHealthColor.type, 'color');
  assert.equal(SETTING_META.hudHealthColor.conditionEligible, true);
  assert.equal(CONTRACT.normalizeValue('hudHealthColorMode', 'bad'), 'off');
  assert.equal(CONTRACT.normalizeValue('hudHealthColor', 'bad'), '#FFFF00');
  for (const raw of [undefined, makeSession(), { version: 1, values: {} }])
    assert.equal(createState(raw).read().values.hudHealthColorMode, 'off');
  for (const raw of ['HPCR2[]', 'HPCR2{"v":[],"c":{}}',
    'HPCR2{"v":[],"c":{},"hpv2":{"v":1,"values":[],"conditions":{}}}',
    'HPCR2{"v":[],"c":{},"hpv2":{"v":2,"values":[[64,2]],"conditions":{}}}']) {
    const state = createState();
    assert.equal(send(state, 'settings_import', { raw }).status, 'committed');
    assert.equal(state.read().values.hudHealthColorMode, 'off');
  }
  const old = createState({ version: 1, offsetVersion: 2, values: CONTRACT.sparseDefaults });
  assert.equal(effect(send(old, 'settings_copy'), 'clipboard_write').text,
    'HPCR2{"v":[[8,"#FD4949"],[20,"#FFEFD7"],[21,"#FFEFD7"],[22,"#FFEFD7"]],"c":{},"hpv2":{"v":2,"values":[],"conditions":{}}}');
  send(old, 'preset_import', { raw: wireCorpus.hpcrp1.inputCode });
  assert.equal(row(old.read(), wireCorpus.hpcrp1.selectedPresetId).values.hudHealthColorMode, 'off');
  for (const pair of [[65, 'bad'], [66, '#GGGGGG']]) {
    const rejected = send(old, 'settings_import', { raw: 'HPCR2' + JSON.stringify({
      v: [], c: {}, hpv2: { v: 2, values: [pair], conditions: {} },
    }) });
    assert.equal(rejected.status, 'rejected');
  }
});

test('HUD health wash supports conditions, hero scopes, Undo, page reset and both transfer formats', () => {
  const state = createState();
  const entries = [['hudHealthColorMode', 'team', 'custom'], ['hudHealthColor', '#123456', '#ABCDEF']];
  for (const [key, value, conditional] of entries) {
    assert.equal(send(state, 'setting_edit', { key, value }).status, 'committed');
    assert.equal(send(state, 'condition_set', { key, slot: 1, minTier: 2, value: conditional }).status, 'committed');
  }
  send(state, 'lifecycle_observe', { epoch: 1, phase: 'active' });
  send(state, 'hero_observe', { epoch: 1, heroName: 'SHIV' });
  send(state, 'hero_observe', { epoch: 1, heroName: 'SHIV' });
  send(state, 'ability_observe', { epoch: 1, tiers: [2, -1, -1, -1] });
  assert.equal(state.read().effectiveValues.hudHealthColorMode, 'custom');
  assert.equal(state.read().effectiveValues.hudHealthColor, '#ABCDEF');
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.deepEqual(JSON.parse(code.slice(5)).hpv2.values, [
    ...expectedPairs(state.read().values, EXTENSION_KEYS.slice(0, 65), CODEC_DEFAULTS),
    [65, 'team'], [66, '#123456'], [75, true],
  ]);
  const restored = createState();
  const imported = send(restored, 'settings_import', { raw: code });
  const saved = createState({ sessionRaw: effect(imported, 'session_replace').raw });
  for (const [key, value] of entries) {
    assert.equal(saved.read().values[key], value);
    assert.deepEqual(saved.read().conditions[key], state.read().conditions[key]);
  }
  send(state, 'preset_save', { name: 'HUD wash' });
  const presetCode = effect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  assert.equal(send(restored, 'preset_import', { raw: presetCode }).status, 'committed');
  for (const [key, value] of entries) {
    assert.equal(row(restored.read(), 'user_0001').values[key], value);
    assert.deepEqual(row(restored.read(), 'user_0001').conditions[key], state.read().conditions[key]);
  }
  send(state, 'scope_set', { mode: 'selected', heroes: ['hero_shiv'] });
  send(state, 'setting_edit', { key: 'hudHealthColor', value: '#112233' });
  assert.equal(currentScope(state.read()).values.hudHealthColor, '#112233');
  send(state, 'undo');
  assert.equal(currentScope(state.read()).values.hudHealthColor, '#123456');
  const reset = send(state, 'reset_request', { keys: entries.map(([key]) => key) });
  send(state, 'reset_confirm', { token: reset.view.transactions.confirmation.token });
  assert.equal(currentScope(state.read()).values.hudHealthColorMode, 'team', 'hero reset uses All Heroes Base');
  assert.equal(currentScope(state.read()).values.hudHealthColor, '#123456');
  const resetGlobal = send(restored, 'reset_request', { keys: entries.map(([key]) => key) });
  send(restored, 'reset_confirm', { token: resetGlobal.view.transactions.confirmation.token });
  assert.equal(restored.read().values.hudHealthColorMode, 'off');
  assert.equal(restored.read().values.hudHealthColor, '#FFFF00');
});

test('hpv2 v3 imports offsets and conditions unchanged then exports v2', () => {
  const raw = 'HPCR2' + JSON.stringify({
    v: [[1, 148], [32, 20], [55, 32]],
    c: { readoutOffsetX: { slot: 1, minTier: 1, value: 20 } },
    hpv2: { v: 3, values: [[33, -10], [69, 'right']],
      conditions: { allyReadoutOffsetX: { slot: 2, minTier: 2, value: 10 } } },
  });
  const state = createState();
  assert.equal(send(state, 'settings_import', { raw }).status, 'committed');
  assert.deepEqual(['readoutOffsetX', 'allyReadoutOffsetX', 'enemyPulseReadoutOffsetX']
    .map(key => state.read().values[key]), [20, -10, 32]);
  assert.equal(state.read().conditions.readoutOffsetX.value, 20);
  assert.equal(state.read().conditions.allyReadoutOffsetX.value, 10);
  assert.equal(state.read().values.hpTextAlign, 'right');
  const reloaded = createState({ sessionRaw: effect(send(state, 'setting_edit', { key: 'nameAlign', value: 'left' }), 'session_replace').raw });
  assert.equal(reloaded.read().values.allyReadoutOffsetX, -10);
  const copied = JSON.parse(effect(send(reloaded, 'settings_copy'), 'clipboard_write').text.slice(5));
  assert.equal(copied.hpv2.v, 2);
  assert.ok(copied.hpv2.values.some(([slot, value]) => slot === 69 && value === 'right'));
});

test('new appended controls preserve the frozen sparse baseline and transfer', () => {
  assert.equal(EXTENSION_KEYS.length, 87);
  assert.deepEqual(EXTENSION_KEYS.slice(67, 74), ['allyPulseReadout', 'nameAlign', 'hpTextAlign',
    'criticalOffsetX', 'criticalOffsetY', 'assassinateOffsetX', 'assassinateOffsetY']);
  for (const defaults of [CODEC_DEFAULTS, CONTRACT.sparseDefaults, DEFAULTS]) {
    assert.equal(defaults.allyPulseReadout, false);
    assert.equal(defaults.nameAlign, 'center');
    assert.equal(defaults.hpTextAlign, 'left');
    for (const key of ['criticalOffsetX', 'criticalOffsetY', 'assassinateOffsetX', 'assassinateOffsetY'])
      assert.equal(defaults[key], 0, key);
  }
  assert.equal(CONTRACT.sparseDefaults.readoutOffsetX, 0);
  assert.equal(CONTRACT.sparseDefaults.allyReadoutOffsetX, 0);
  assert.equal(DEFAULTS.readoutOffsetX, 18);
  assert.equal(DEFAULTS.allyReadoutOffsetX, 0);
  assert.equal(DEFAULTS.enemyPulseReadoutOffsetX, 0);
  assert.equal(CONTRACT.sparseDefaults.enemyPulseReadoutOffsetX, 0);
  const state = createState();
  send(state, 'setting_edit', { key: 'allyPulseReadout', value: true });
  send(state, 'setting_edit', { key: 'nameAlign', value: 'right' });
  send(state, 'setting_edit', { key: 'hpTextAlign', value: 'right' });
  send(state, 'setting_edit', { key: 'criticalOffsetX', value: -37 });
  send(state, 'setting_edit', { key: 'criticalOffsetY', value: 12 });
  send(state, 'setting_edit', { key: 'assassinateOffsetX', value: 25 });
  send(state, 'setting_edit', { key: 'assassinateOffsetY', value: 999 });
  assert.equal(state.read().values.assassinateOffsetY, 210, 'offsets clamp to the name bounds');
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  const target = createState();
  send(target, 'settings_import', { raw: code });
  for (const key of EXTENSION_KEYS.slice(67)) assert.equal(target.read().values[key], state.read().values[key]);
});

// Failure modes: a missing slot shifts later share codes; a non-NONE baseline
// changes old saves' look; invalid values must reject; Undo/reset/presets lose it.
test('bar mask appends a NONE-default enum slot that transfers, resets and rejects bad values', () => {
  assert.equal(EXTENSION_KEYS[74], 'barMask');
  for (const defaults of [CODEC_DEFAULTS, CONTRACT.sparseDefaults, DEFAULTS])
    assert.equal(defaults.barMask, 'none');
  assert.deepEqual(SETTING_META.barMask.options, ['none', 'original', 'old']);
  assert.equal(SETTING_META.barMask.conditionEligible, true);
  assert.equal(CONTRACT.normalizeValue('barMask', 'bad'), 'none');
  for (const raw of [undefined, makeSession(), { version: 1, values: {} }])
    assert.equal(createState(raw).read().values.barMask, 'none');
  const state = createState();
  assert.equal(send(state, 'setting_edit', { key: 'barMask', value: 'original' }).status, 'committed');
  assert.equal(state.read().effectiveValues.barMask, 'original');
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.deepEqual(JSON.parse(code.slice(5)).hpv2.values.slice(-2), [[74, 'original'], [75, true]]);
  const target = createState();
  assert.equal(send(target, 'settings_import', { raw: code }).status, 'committed');
  assert.equal(target.read().values.barMask, 'original');
  const saved = createState({ sessionRaw: effect(send(state, 'setting_edit', { key: 'nameAlign', value: 'left' }), 'session_replace').raw });
  assert.equal(saved.read().values.barMask, 'original');
  send(state, 'preset_save', { name: 'Original mask' });
  const presetCode = effect(send(state, 'preset_copy_selected'), 'clipboard_write').text;
  const presetTarget = createState();
  assert.equal(send(presetTarget, 'preset_import', { raw: presetCode }).status, 'committed');
  assert.equal(row(presetTarget.read(), 'user_0001').values.barMask, 'original');
  const rejected = send(target, 'settings_import', { raw: 'HPCR2' + JSON.stringify({
    v: [], c: {}, hpv2: { v: 2, values: [[74, 'rounded']], conditions: {} } }) });
  assert.equal(rejected.status, 'rejected');
  assert.equal(target.read().values.barMask, 'original');
  const reset = send(target, 'reset_request', { keys: ['barMask'] });
  send(target, 'reset_confirm', { token: reset.view.transactions.confirmation.token });
  assert.equal(target.read().values.barMask, 'none');
  send(target, 'undo');
  assert.equal(target.read().values.barMask, 'original');
});

// Failure modes: OLD normalizes to NONE, is lost through codes/presets/saves/conditions,
// or the slot count grows instead of reusing slot 74.
test('bar style OLD reuses slot 74 and survives codes, presets, saves and conditions', () => {
  assert.equal(EXTENSION_KEYS.length, 87);
  assert.equal(CONTRACT.normalizeValue('barMask', 'old'), 'old');
  const state = createState();
  assert.equal(send(state, 'setting_edit', { key: 'barMask', value: 'old' }).status, 'committed');
  assert.equal(send(state, 'condition_set', { key: 'barMask', slot: 1, minTier: 2, value: 'original' }).status, 'committed');
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.deepEqual(JSON.parse(code.slice(5)).hpv2.values.slice(-2), [[74, 'old'], [75, true]]);
  const target = createState();
  assert.equal(send(target, 'settings_import', { raw: code }).status, 'committed');
  assert.equal(target.read().values.barMask, 'old');
  assert.equal(target.read().conditions.barMask.value, 'original');
  const saved = createState({ sessionRaw: effect(send(state, 'setting_edit', { key: 'nameAlign', value: 'left' }), 'session_replace').raw });
  assert.equal(saved.read().values.barMask, 'old');
  send(state, 'preset_save', { name: 'Old pips' });
  const presetTarget = createState();
  send(presetTarget, 'preset_import', { raw: effect(send(state, 'preset_copy_selected'), 'clipboard_write').text });
  assert.equal(row(presetTarget.read(), 'user_0001').values.barMask, 'old');
});

// Failure modes: shake slots shift share codes, non-stock defaults change old saves,
// out-of-range intensity is accepted, or codes/presets/saves/reset/Undo drop the values.
test('damage shake appends slots 76 and 77 with stock defaults that transfer and reset', () => {
  assert.equal(EXTENSION_KEYS[76], 'damageShakeEnabled');
  assert.equal(EXTENSION_KEYS[77], 'damageShakeIntensity');
  for (const defaults of [CODEC_DEFAULTS, CONTRACT.sparseDefaults, DEFAULTS]) {
    assert.equal(defaults.damageShakeEnabled, true);
    assert.equal(defaults.damageShakeIntensity, 3);
  }
  for (const raw of [undefined, makeSession(), { version: 1, values: {} }]) {
    assert.equal(createState(raw).read().values.damageShakeEnabled, true);
    assert.equal(createState(raw).read().values.damageShakeIntensity, 3);
  }
  const state = createState();
  assert.equal(send(state, 'setting_edit', { key: 'damageShakeEnabled', value: false }).status, 'committed');
  send(state, 'setting_edit', { key: 'damageShakeIntensity', value: 99 });
  assert.equal(state.read().values.damageShakeIntensity, 10, 'intensity clamps to 10 degrees');
  send(state, 'setting_edit', { key: 'damageShakeIntensity', value: 7 });
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.deepEqual(JSON.parse(code.slice(5)).hpv2.values.slice(-2), [[76, false], [77, 7]]);
  const target = createState();
  assert.equal(send(target, 'settings_import', { raw: code }).status, 'committed');
  assert.equal(target.read().values.damageShakeEnabled, false);
  assert.equal(target.read().values.damageShakeIntensity, 7);
  const saved = createState({ sessionRaw: effect(send(state, 'setting_edit', { key: 'nameAlign', value: 'left' }), 'session_replace').raw });
  assert.equal(saved.read().values.damageShakeIntensity, 7);
  send(state, 'preset_save', { name: 'Calm shake' });
  const presetTarget = createState();
  send(presetTarget, 'preset_import', { raw: effect(send(state, 'preset_copy_selected'), 'clipboard_write').text });
  assert.equal(row(presetTarget.read(), 'user_0001').values.damageShakeEnabled, false);
  assert.equal(row(presetTarget.read(), 'user_0001').values.damageShakeIntensity, 7);
  const reset = send(target, 'reset_request', { keys: ['damageShakeEnabled', 'damageShakeIntensity'] });
  send(target, 'reset_confirm', { token: reset.view.transactions.confirmation.token });
  assert.equal(target.read().values.damageShakeEnabled, true);
  assert.equal(target.read().values.damageShakeIntensity, 3);
  send(target, 'undo');
  assert.equal(target.read().values.damageShakeIntensity, 7);
});

// Failure modes: tilt slots shift share codes, a non-zero default tilts old saves,
// out-of-range degrees are accepted, or codes/presets/saves/reset drop the values.
test('tilt appends slots 78-80 with straight defaults that clamp, transfer and reset', () => {
  assert.deepEqual(EXTENSION_KEYS.slice(78, 81), ['nameTilt', 'readoutTilt', 'allyReadoutTilt']);
  const keys = ['nameTilt', 'readoutTilt', 'allyReadoutTilt'];
  for (const defaults of [CODEC_DEFAULTS, CONTRACT.sparseDefaults, DEFAULTS])
    for (const key of keys) assert.equal(defaults[key], 0, key);
  for (const raw of [undefined, makeSession(), { version: 1, values: {} }])
    for (const key of keys) assert.equal(createState(raw).read().values[key], 0, key);
  const state = createState();
  send(state, 'setting_edit', { key: 'nameTilt', value: -400 });
  assert.equal(state.read().values.nameTilt, -360);
  send(state, 'setting_edit', { key: 'readoutTilt', value: 400 });
  assert.equal(state.read().values.readoutTilt, 360);
  send(state, 'setting_edit', { key: 'nameTilt', value: 15 });
  send(state, 'setting_edit', { key: 'readoutTilt', value: -20 });
  send(state, 'setting_edit', { key: 'allyReadoutTilt', value: 30 });
  const code = effect(send(state, 'settings_copy'), 'clipboard_write').text;
  assert.deepEqual(JSON.parse(code.slice(5)).hpv2.values.slice(-3), [[78, 15], [79, -20], [80, 30]]);
  const target = createState();
  assert.equal(send(target, 'settings_import', { raw: code }).status, 'committed');
  assert.deepEqual(keys.map(key => target.read().values[key]), [15, -20, 30]);
  const saved = createState({ sessionRaw: effect(send(state, 'setting_edit', { key: 'nameAlign', value: 'left' }), 'session_replace').raw });
  assert.deepEqual(keys.map(key => saved.read().values[key]), [15, -20, 30]);
  send(state, 'preset_save', { name: 'Tilted' });
  const presetTarget = createState();
  send(presetTarget, 'preset_import', { raw: effect(send(state, 'preset_copy_selected'), 'clipboard_write').text });
  assert.deepEqual(keys.map(key => row(presetTarget.read(), 'user_0001').values[key]), [15, -20, 30]);
  const reset = send(target, 'reset_request', { keys });
  send(target, 'reset_confirm', { token: reset.view.transactions.confirmation.token });
  assert.deepEqual(keys.map(key => target.read().values[key]), [0, 0, 0]);
});

test('old local bodies silently drop removed HP text alignment keys', () => {
  const removed = { readoutAlign: 'left', allyReadoutAlign: 'right' };
  const conditions = {
    readoutAlign: { slot: 1, minTier: 1, value: 'right' },
    allyReadoutAlign: { slot: 2, minTier: 2, value: 'left' },
  };
  const body = makeSession({
    values: { ...removed, nameAlign: 'left' },
    conditions,
    userPresets: [{
      ...rawPreset({
        id: 'user_0001', name: 'Old aligned text',
        values: { ...removed, nameAlign: 'right' },
        conditions, mode: 'selected', heroes: ['hero_haze'],
      }),
      own: [...Object.keys(removed), 'nameAlign'],
    }],
  });
  const state = createState({ sessionRaw: JSON.stringify(body) });
  const view = state.read();
  for (const record of [view, row(view, 'user_0001')]) {
    for (const key of Object.keys(removed)) {
      assert.equal(Object.hasOwn(record.values, key), false);
      assert.equal(Object.hasOwn(record.conditions || {}, key), false);
      if (record.own) assert.equal(record.own.includes(key), false);
    }
  }
  assert.equal(view.values.nameAlign, 'left');
  assert.equal(row(view, 'user_0001').values.nameAlign, 'right');
});

test("shared bar outline defaults omit new slots until edited and survive transfer/conditions", () => {
  const keys = ["barOutlineEnabled", "barOutlineThickness", "barOutlineOpacity", "barOutlineColor"];
  const defaults = [true, 1, 100, "#000000"];
  assert.deepEqual(EXTENSION_KEYS.slice(83), keys);
  for (const [index, key] of keys.entries()) {
    for (const baseline of [DEFAULTS, CONTRACT.sparseDefaults, CODEC_DEFAULTS])
      assert.equal(baseline[key], defaults[index], key);
    assert.equal(SETTING_META[key].conditionEligible, true);
  }
  assert.equal(CONTRACT.normalizeValue("barOutlineThickness", 1.3), 1.5);
  assert.equal(CONTRACT.normalizeValue("barOutlineThickness", 50), 10);
  assert.equal(CONTRACT.normalizeValue("barOutlineOpacity", -10), 0);
  const state = createState();
  const untouched = JSON.parse(effect(send(state, "settings_copy"), "clipboard_write").text.slice(5));
  assert.ok(!(untouched.hpv2 && untouched.hpv2.values || []).some(([slot]) => slot >= 83));
  for (const [index, value] of [false, 2.5, 37, "#123456"].entries())
    send(state, "setting_edit", { key: keys[index], value });
  const code = effect(send(state, "settings_copy"), "clipboard_write").text;
  assert.deepEqual(JSON.parse(code.slice(5)).hpv2.values.slice(-4), [[83, false], [84, 2.5], [85, 37], [86, "#123456"]]);
  const target = createState();
  assert.equal(send(target, "settings_import", { raw: code }).status, "committed");
  assert.deepEqual(keys.map(key => target.read().values[key]), [false, 2.5, 37, "#123456"]);
});
