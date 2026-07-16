'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { HPPresetCodeCodec } = require('./hp-colors-preset-codec.js');

const aliases = { e: 'hp_enabled', cl: 'hp_color_low', kzc: 'hp_kill_zone_color' };
const idToAlias = { hp_enabled: 'e', hp_color_low: 'cl', hp_kill_zone_color: 'kzc' };
const allowed = ['hp_enabled', 'hp_color_low', 'hp_kill_zone_color'];
const heroById = { hero_inferno: true, hero_haze: true };
const heroIdToKey = { 1: 'hero_inferno', 13: 'hero_haze' };
const options = { aliasToId: aliases, idToAlias, allowedIds: allowed, heroById, heroIdToKey };

const overrideOptions = {
  aliasToId: { ...aliases, kzt: 'hp_kill_zone_threshold', pos: 'hp_marker_position' },
  idToAlias: { ...idToAlias, hp_kill_zone_threshold: 'kzt', hp_marker_position: 'pos' },
  allowedIds: [...allowed, 'hp_kill_zone_threshold', 'hp_marker_position', 'hp_precise_pips_enabled'],
  ineligibleIds: ['hp_precise_pips_enabled'],
};

function loadPanoramaCodec() {
  const sourcePath = path.resolve(__dirname, '../hp_colors/panorama/scripts/anita_ui_core.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const start = source.indexOf('  const HPPresetCodeCodec = {');
  const end = source.indexOf('  function rememberLastEmittedValue', start);
  assert(start >= 0 && end > start, 'Panorama preset codec source block not found');
  const sandbox = {
    HP_HERO_SCOPE_OFF: 'off',
    HP_HERO_SCOPE_ALL: 'all',
    HP_HERO_SCOPE_SELECTED: 'selected',
    HP_HERO_BY_ID: {},
    HP_HERO_ID_TO_KEY: {},
    HP_PERSIST_ALIAS_TO_ID: aliases,
    HP_PERSIST_ALIASES: idToAlias,
    HP_PRESET_BUILDER_SUPPORTED_IDS: allowed,
    HP_COMPACT_PERSIST_VERSION: 1,
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.codec = HPPresetCodeCodec;`, sandbox);
  return sandbox.codec;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const PanoramaPresetCodeCodec = loadPanoramaCodec();

function compareAdapters(method, args) {
  const nodeResult = plain(HPPresetCodeCodec[method].apply(HPPresetCodeCodec, args));
  const panoramaResult = plain(PanoramaPresetCodeCodec[method].apply(PanoramaPresetCodeCodec, args));
  assert.deepEqual(panoramaResult, nodeResult);
  return nodeResult;
}

function encodeJson(payload) {
  return HPPresetCodeCodec.encodeBase64Url(JSON.stringify(payload));
}

test('Base64URL rejects invalid characters and invalid length', () => {
  assert.throws(() => HPPresetCodeCodec.decodeBase64Url('abc='), /base64url/);
  assert.throws(() => HPPresetCodeCodec.decodeBase64Url('a'), /base64url/);
});

test('decodePresetPayload rejects invalid JSON and unsupported versions', () => {
  assert.equal(HPPresetCodeCodec.decodePresetPayload('{nope', options), null);
  assert.equal(HPPresetCodeCodec.decodePresetPayload({ version: 2, values: { e: true } }, options), null);
});

test('unknown values are skipped without inventing ids', () => {
  const decoded = HPPresetCodeCodec.decodePresetPayload({ v: 97, values: { bogus: 1, hp_enabled: true } }, options);
  assert.deepEqual(decoded.values, { hp_enabled: true });
  const allUnknown = HPPresetCodeCodec.decodePresetPayload({ v: 97, values: { bogus: 1 } }, options);
  assert.deepEqual(allUnknown.values, {});
});

test('legacy kzs decodes to hp_kill_zone_color but export never emits kzs', () => {
  const decoded = HPPresetCodeCodec.decodePresetPayload({ version: 1, values: { kzs: '#123456' } }, options);
  assert.deepEqual(decoded.values, { hp_kill_zone_color: '#123456' });
  const token = HPPresetCodeCodec.encodePresetToken({ storageNamespace: 'hp_colors', storageVersion: 97 }, { kzs: '#654321', kzc: '#abcdef' }, { name: 'Legacy' });
  const payload = JSON.parse(HPPresetCodeCodec.decodeBase64Url(token.split(']:')[1]));
  assert.equal(Object.prototype.hasOwnProperty.call(payload.values, 'kzs'), false);
  assert.equal(payload.values.kzc, '#abcdef');
});

test('selected hero numeric tokens normalize and dedupe', () => {
  const decoded = HPPresetCodeCodec.decodePresetPayload({ v: 97, values: { e: true }, hm: 'selected', hs: ['1', 'hero_inferno', 13, 'haze'] }, options);
  assert.equal(decoded.heroMode, 'selected');
  assert.deepEqual(decoded.heroes, ['hero_inferno', 'hero_haze']);
});

test('selected scope with no valid heroes becomes off', () => {
  const decoded = HPPresetCodeCodec.decodePresetPayload({ v: 97, values: { e: true }, hm: 'selected', hs: ['Abrams', '999'] }, options);
  assert.equal(decoded.heroMode, 'off');
  assert.deepEqual(decoded.heroes, []);
});

test('unknown scope mode without heroes can default to all for static compatibility', () => {
  const decoded = HPPresetCodeCodec.decodePresetPayload(
    { version: 1, values: { e: true } },
    { ...options, defaultModeWithoutHeroes: 'all' },
  );
  assert.equal(decoded.heroMode, 'all');
});

test('single token shape is stable', () => {
  const token = HPPresetCodeCodec.encodePresetToken(
    { storageNamespace: 'hp_colors', storageVersion: 97 },
    { e: true, cl: '#ffaa00' },
    { name: 'My Preset', heroMode: 'selected', heroes: ['1', '13'], heroById, heroIdToKey },
  );
  const payload = JSON.parse(HPPresetCodeCodec.decodeBase64Url(token.split(']:')[1]));
  assert.deepEqual(payload, {
    v: 99,
    c: 1,
    values: { e: true, cl: '#ffaa00' },
    hm: 'selected',
    hs: ['hero_inferno', 'hero_haze'],
    name: 'My Preset',
  });
});

test('decodePresetToken accepts full ids in compact payloads', () => {
  const token = '[ANITA-v1-hp_colors]:' + encodeJson({ v: 97, c: 1, values: { hp_enabled: true, e: false } });
  const decoded = HPPresetCodeCodec.decodePresetToken({ storageNamespace: 'hp_colors' }, token, options);
  assert.deepEqual(decoded.values, { hp_enabled: false });
});

test('COPY ALL bundle shape is bare Base64URL tuple payload', () => {
  const bundle = HPPresetCodeCodec.encodePresetBundle({ storageVersion: 97, heroById, heroIdToKey }, [
    { name: 'Off', payloadValues: { e: true }, heroMode: 'off' },
    { name: 'All', payloadValues: { cl: '#111111' }, heroMode: 'all' },
    { name: 'Sel', payloadValues: { kzc: '#222222' }, heroMode: 'selected', heroes: ['1', '13', '1'] },
  ]);
  assert.match(bundle, /^[A-Za-z0-9_-]+$/);
  const payload = JSON.parse(HPPresetCodeCodec.decodeBase64Url(bundle));
  assert.deepEqual(payload, {
    v: 99,
    p: [
      ['Off', { e: true }, 'off', {}],
      ['All', { cl: '#111111' }, 'all', {}],
      ['Sel', { kzc: '#222222' }, ['hero_inferno', 'hero_haze'], {}],
    ],
  });
  const decoded = HPPresetCodeCodec.decodePresetBundle(bundle, options);
  assert.deepEqual(decoded.rows.map(row => [row.name, row.heroMode, row.heroes]), [
    ['Off', 'off', []],
    ['All', 'all', []],
    ['Sel', 'selected', ['hero_inferno', 'hero_haze']],
  ]);
});

test('normalizeOverrides prunes invalid rules and canonical keys win over aliases', () => {
  const position = { x: 12, y: 34 };
  const normalized = HPPresetCodeCodec.normalizeOverrides({
    kzt: [4, 3, 28],
    hp_kill_zone_threshold: { slot: 2, minTier: 1, value: 0 },
    e: [1, 0, false],
    cl: { slot: 2, minTier: 0, value: '#112233' },
    pos: [3, 2, position],
    hp_precise_pips_enabled: [1, 0, true],
    unknown: [1, 0, 'ignored'],
    malformed: [1, 2],
    outOfRange: [5, 0, 1],
    badTier: [1, 4, 1],
  }, overrideOptions);

  assert.deepEqual(normalized, {
    hp_kill_zone_threshold: { slot: 2, minTier: 1, value: 0 },
    hp_enabled: { slot: 1, minTier: 0, value: false },
    hp_color_low: { slot: 2, minTier: 0, value: '#112233' },
    hp_marker_position: { slot: 3, minTier: 2, value: position },
  });
  assert.strictEqual(normalized.hp_marker_position.value, position);
});

test('compactOverrides emits aliases while preserving false, zero, colors, and positions', () => {
  const position = [25, 50];
  const compact = HPPresetCodeCodec.compactOverrides({
    hp_enabled: { slot: 1, minTier: 0, value: false },
    hp_kill_zone_threshold: { slot: 4, minTier: 3, value: 0 },
    hp_color_low: { slot: 2, minTier: 1, value: '#abcdef' },
    hp_marker_position: { slot: 3, minTier: 2, value: position },
  }, overrideOptions);

  assert.deepEqual(compact, {
    e: [1, 0, false],
    kzt: [4, 3, 0],
    cl: [2, 1, '#abcdef'],
    pos: [3, 2, position],
  });
});

test('rule-only v99 token round-trips overrides and emits v99 regardless of config version', () => {
  const token = HPPresetCodeCodec.encodePresetToken(
    { storageNamespace: 'hp_colors', storageVersion: 98 },
    {},
    {
      name: 'Conditional only',
      overrides: { hp_kill_zone_threshold: { slot: 4, minTier: 3, value: 28 } },
      ...overrideOptions,
    },
  );
  const payload = JSON.parse(HPPresetCodeCodec.decodeBase64Url(token.split(']:')[1]));
  assert.deepEqual(payload, {
    v: 99,
    c: 1,
    values: {},
    o: { kzt: [4, 3, 28] },
    hm: 'off',
    name: 'Conditional only',
  });

  const decoded = HPPresetCodeCodec.decodePresetToken(
    { storageNamespace: 'hp_colors' },
    token,
    overrideOptions,
  );
  assert.deepEqual(decoded.values, {});
  assert.deepEqual(decoded.overrides, {
    hp_kill_zone_threshold: { slot: 4, minTier: 3, value: 28 },
  });
});

test('legacy v1, v97, and v98 payloads decode with empty overrides', () => {
  for (const version of [1, 97, 98]) {
    const decoded = HPPresetCodeCodec.decodePresetPayload({ v: version, values: {} }, overrideOptions);
    assert.equal(decoded.version, version);
    assert.deepEqual(decoded.overrides, {});
  }
});

test('bundle encodes overrides at tuple index 3 and old tuples decode empty rules', () => {
  const bundle = HPPresetCodeCodec.encodePresetBundle({
    storageVersion: 97,
    heroById,
    heroIdToKey,
    ...overrideOptions,
  }, [
    {
      name: 'Conditional',
      payloadValues: { e: true },
      overrides: { hp_kill_zone_threshold: { slot: 4, minTier: 3, value: 28 } },
      heroMode: 'off',
    },
  ]);
  const payload = JSON.parse(HPPresetCodeCodec.decodeBase64Url(bundle));
  assert.equal(payload.v, 99);
  assert.deepEqual(payload.p[0], ['Conditional', { e: true }, 'off', { kzt: [4, 3, 28] }]);
  const decoded = HPPresetCodeCodec.decodePresetBundle(bundle, overrideOptions);
  assert.deepEqual(decoded.rows[0].overrides, {
    hp_kill_zone_threshold: { slot: 4, minTier: 3, value: 28 },
  });

  const oldBundle = HPPresetCodeCodec.encodeBase64Url(JSON.stringify({
    v: 98,
    p: [['Legacy', {}, 'off'], ['Legacy default', {}]],
  }));
  const oldDecoded = HPPresetCodeCodec.decodePresetBundle(oldBundle, overrideOptions);
  assert.deepEqual(oldDecoded.rows.map(row => row.overrides), [{}, {}]);
});

test('Node and Panorama adapters share UTF-8 Base64URL behavior', () => {
  for (const value of ['', 'ASCII', 'Rønn', '火', 'Haze 🔥', '\ud800']) {
    const encoded = HPPresetCodeCodec.encodeBase64Url(value);
    assert.equal(PanoramaPresetCodeCodec.encodeBase64Url(value), encoded);
    assert.equal(PanoramaPresetCodeCodec.decodeBase64Url(encoded), HPPresetCodeCodec.decodeBase64Url(encoded));
  }
});

test('Node and Panorama adapters share hero and override normalization', () => {
  assert.deepEqual(compareAdapters('normalizeHeroScope', [
    'selected',
    ['1', 'hero_inferno', 13],
    { HERO_BY_ID: heroById, HERO_ID_TO_KEY: heroIdToKey },
    { defaultModeWithoutHeroes: 'off' },
  ]), { mode: 'selected', heroes: ['hero_inferno', 'hero_haze'] });
  assert.deepEqual(
    compareAdapters('normalizeHeroes', [['toString'], { toString: true }, {}]),
    ['toString'],
  );
  for (const [rawOverrides, expected] of [
    [{ kzt: ['4', '3', 28] }, {}],
    [{ kzt: [4, 3, 28], hp_kill_zone_threshold: [1, 2] }, {}],
    [{
      hp_enabled: [1, 0, false],
      pos: [3, 2, [25, 50]],
    }, {
      hp_enabled: { slot: 1, minTier: 0, value: false },
      hp_marker_position: { slot: 3, minTier: 2, value: [25, 50] },
    }],
  ]) {
    assert.deepEqual(
      compareAdapters('normalizeOverrides', [rawOverrides, overrideOptions]),
      expected,
    );
  }
});

test('Node and Panorama adapters emit identical token and bundle payloads', () => {
  const config = { storageNamespace: 'hp_colors', heroById, heroIdToKey, ...overrideOptions };
  const meta = {
    name: 'Shared contract',
    heroMode: 'selected',
    heroes: ['1', '13'],
    heroById,
    heroIdToKey,
    ...overrideOptions,
  };
  const values = { e: true, cl: '#ffaa00' };
  assert.equal(
    PanoramaPresetCodeCodec.encodePresetToken(config, values, meta),
    HPPresetCodeCodec.encodePresetToken(config, values, meta),
  );
  const rows = [{
    name: 'Shared contract',
    payloadValues: { e: true },
    heroMode: 'selected',
    heroes: ['1'],
    overrides: { hp_kill_zone_threshold: { slot: 4, minTier: 3, value: 28 } },
  }];
  assert.equal(
    PanoramaPresetCodeCodec.encodePresetBundle(config, rows),
    HPPresetCodeCodec.encodePresetBundle(config, rows),
  );
});
