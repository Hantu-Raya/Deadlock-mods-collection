'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  installTopBarIdentityTree,
  findByClass,
  runInVm,
} = require('./hp-colors-panorama-test-adapter');

const rewriteRoot = path.resolve(__dirname, '../hp_colors_rewrite');
const layoutSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/layout/hud_escape_menu.xml'),
  'utf8',
);
const menuSource = fs.readFileSync(
  path.join(rewriteRoot, 'panorama/scripts/hp_colors_menu.js'),
  'utf8',
);
const MENU_STATE_ATTR = 'hp_colors_rewrite_menu_state';
const CONFIG_ATTR = 'hp_colors_rewrite_config';

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
}

function bootScopedMenu(menuState, options = {}) {
  const harness = createPanoramaHarness();
  installLayoutPanels(harness);
  const topBar = installTopBarIdentityTree(harness, {
    heroName: options.heroName || 'SHIV',
    gameTime: options.gameTime || '00:01',
  });
  harness.root.SetAttributeString(MENU_STATE_ATTR, JSON.stringify(menuState));
  if (options.publishedSnapshot)
    harness.root.SetAttributeString(
      CONFIG_ATTR,
      JSON.stringify(options.publishedSnapshot),
    );
  runInVm(menuSource, createVmContext(harness), 'hp_colors_menu.js');
  harness.$.HPColorsMenuBoot();
  return { harness, topBar };
}

function runIdentityTick(fixture) {
  const jobs = fixture.harness.scheduler.jobs;
  let selectedIndex = -1;
  for (let index = 0; index < jobs.length; index++) {
    if (!jobs[index].fn || jobs[index].fn.name !== 'identityTick') continue;
    if (
      selectedIndex < 0 ||
      jobs[index].due < jobs[selectedIndex].due ||
      (jobs[index].due === jobs[selectedIndex].due &&
        jobs[index].order < jobs[selectedIndex].order)
    ) selectedIndex = index;
  }
  assert.notEqual(selectedIndex, -1, 'expected identityTick callback');
  const job = jobs.splice(selectedIndex, 1)[0];
  fixture.harness.now = Math.max(fixture.harness.now, Number(job.due) || 0);
  job.fn();
}

function effectiveSnapshot(fixture) {
  return JSON.parse(
    fixture.harness.root.GetAttributeString(CONFIG_ATTR, '{}'),
  );
}
function menuState(fixture) {
  return JSON.parse(
    fixture.harness.root.GetAttributeString(MENU_STATE_ATTR, '{}'),
  );
}

function configDispatches(fixture) {
  return fixture.harness.dispatches.filter(
    (args) => args[0] === 'ClientUI_FireOutput',
  );
}

function openEditor(fixture) {
  fixture.harness.root.FindChildTraverse('HPColorsMenuButton').events.onactivate();
}


function settleActiveHero(fixture) {
  runIdentityTick(fixture);
  runIdentityTick(fixture);
  runIdentityTick(fixture);
}

test('selected hero scope waits for exact identity and otherwise keeps global fallback', () => {
  const fixture = bootScopedMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [
      {
        id: 'scope_shiv',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#22aa44' },
      },
    ],
  });

  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#111111');

  settleActiveHero(fixture);

  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#22AA44');
});

test('selected scopes outrank all-hero fallback while row order breaks equal-scope ties', () => {
  const fixture = bootScopedMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [
      {
        id: 'all_first',
        mode: 'all',
        heroes: ['hero_haze'],
        values: { enemyLow: '#aaaaaa' },
      },
      {
        id: 'shiv_first',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#22aa44' },
      },
      {
        id: 'shiv_second',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#334455' },
      },
    ],
  });

  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#AAAAAA');
  settleActiveHero(fixture);
  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#22AA44');
});

test('scope normalization deduplicates stable heroes and IDs and disables empty selections', () => {
  const fixture = bootScopedMenu({
    version: 1,
    values: {},
    scopes: [
      {
        id: 'deduplicated',
        mode: 'selected',
        heroes: ['hero_shiv', 'hero_haze', 'hero_shiv', 'unknown_hero'],
        values: {},
      },
      {
        id: 'deduplicated',
        mode: 'all',
        heroes: [],
        values: { enemyLow: '#000000' },
      },
      {
        id: 'empty',
        mode: 'selected',
        heroes: ['unknown_hero'],
        values: {},
      },
    ],
  });

  assert.deepEqual(
    menuState(fixture).scopes.map((scope) => ({
      id: scope.id,
      mode: scope.mode,
      heroes: scope.heroes,
    })),
    [
      {
        id: 'deduplicated',
        mode: 'selected',
        heroes: ['hero_haze', 'hero_shiv'],
      },
      { id: 'empty', mode: 'off', heroes: [] },
    ],
  );
});

test('removing the last selected hero normalizes the row to Off and republishes fallback', () => {
  const fixture = bootScopedMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [
      {
        id: 'scope_shiv',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#22aa44' },
      },
    ],
  });
  settleActiveHero(fixture);
  const before = effectiveSnapshot(fixture);
  fixture.harness.dispatches.length = 0;

  const next = menuState(fixture);
  next.scopes[0].heroes = [];
  fixture.harness.root.SetAttributeString(MENU_STATE_ATTR, JSON.stringify(next));
  openEditor(fixture);

  const after = effectiveSnapshot(fixture);
  assert.equal(menuState(fixture).scopes[0].mode, 'off');
  assert.deepEqual(menuState(fixture).scopes[0].heroes, []);
  assert.equal(after.values.enemyLow, '#111111');
  assert.equal(after.revision, before.revision + 1);
  assert.equal(configDispatches(fixture).length, 1);
});

test('editing canonical base settings does not publish while a scoped snapshot is effective', () => {
  const fixture = bootScopedMenu({
    version: 1,
    values: { enemyVisible: true },
    scopes: [
      {
        id: 'scope_shiv',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyVisible: true, enemyLow: '#22aa44' },
      },
    ],
  });
  settleActiveHero(fixture);
  const before = effectiveSnapshot(fixture);
  fixture.harness.dispatches.length = 0;

  fixture.harness.root
    .FindChildTraverse('HPColorsEnemyVisibleToggle')
    .events.onactivate();

  assert.equal(menuState(fixture).values.enemyVisible, false);
  assert.equal(effectiveSnapshot(fixture).values.enemyVisible, true);
  assert.equal(effectiveSnapshot(fixture).revision, before.revision);
  assert.equal(configDispatches(fixture).length, 0);
});

test('manual hero changes between identical effective snapshots do not publish', () => {
  const fixture = bootScopedMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [
      {
        id: 'scope_shiv',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#22aa44' },
      },
      {
        id: 'scope_haze',
        mode: 'selected',
        heroes: ['hero_haze'],
        values: { enemyLow: '#22aa44' },
      },
    ],
  });
  settleActiveHero(fixture);
  const manualMode = fixture.harness.root.FindChildTraverse(
    'HPColorsHeroModeManual',
  );
  const manualButton = fixture.harness.root.FindChildTraverse(
    'HPColorsHeroManualButton',
  );
  const optionFor = (heroKey) =>
    findByClass(fixture.harness.root, 'HPColorsHeroOption').find(
      (panel) =>
        panel.GetAttributeString('hp_colors_hero_key', '') === heroKey,
    );

  manualMode.events.onactivate();
  manualButton.events.onactivate();
  optionFor('hero_shiv').events.onactivate();
  const before = effectiveSnapshot(fixture);
  fixture.harness.dispatches.length = 0;

  manualButton.events.onactivate();
  optionFor('hero_haze').events.onactivate();

  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#22AA44');
  assert.equal(effectiveSnapshot(fixture).revision, before.revision);
  assert.equal(configDispatches(fixture).length, 0);
});

test('current row scope picker searches and normalizes multi-select state', () => {
  const fixture = bootScopedMenu({ version: 1, values: {}, scopes: [] });
  const root = fixture.harness.root;
  const off = root.FindChildTraverse('HPColorsCurrentScopeOff');
  const all = root.FindChildTraverse('HPColorsCurrentScopeAll');
  const selected = root.FindChildTraverse('HPColorsCurrentScopeSelected');
  const summary = root.FindChildTraverse('HPColorsCurrentScopeSummary');
  const dialog = root.FindChildTraverse('HPColorsScopeDialog');
  const search = root.FindChildTraverse('HPColorsScopeSearch');

  assert.ok(off && all && selected && summary && dialog && search);
  assert.equal(off.BHasClass('Selected'), true);

  selected.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), true);
  search.text = 'haze';
  search.events.ontextentrychange();

  const options = findByClass(root, 'HPColorsScopeHeroOption');
  const optionFor = (heroKey) =>
    options.find(
      (panel) =>
        panel.GetAttributeString('hp_colors_scope_hero_key', '') === heroKey,
    );
  assert.equal(optionFor('hero_haze').BHasClass('FilteredOut'), false);
  assert.equal(optionFor('hero_shiv').BHasClass('FilteredOut'), true);

  optionFor('hero_haze').events.onactivate();
  assert.equal(menuState(fixture).scopes[0].mode, 'selected');
  assert.deepEqual(menuState(fixture).scopes[0].heroes, ['hero_haze']);
  assert.equal(selected.BHasClass('Selected'), true);
  assert.match(String(summary.text || ''), /HAZE/i);

  optionFor('hero_haze').events.onactivate();
  assert.equal(menuState(fixture).scopes[0].mode, 'off');
  assert.deepEqual(menuState(fixture).scopes[0].heroes, []);
  assert.equal(off.BHasClass('Selected'), true);

  all.events.onactivate();
  assert.equal(menuState(fixture).scopes[0].mode, 'all');
  assert.deepEqual(menuState(fixture).scopes[0].heroes, []);
  assert.equal(all.BHasClass('Selected'), true);
});

test('Capture Current refreshes scoped values without replacing the global base', () => {
  const fixture = bootScopedMenu({ version: 1, values: {}, scopes: [] });
  const root = fixture.harness.root;
  const enemyVisible = root.FindChildTraverse('HPColorsEnemyVisibleToggle');
  const all = root.FindChildTraverse('HPColorsCurrentScopeAll');
  const capture = root.FindChildTraverse('HPColorsCurrentScopeCapture');

  enemyVisible.events.onactivate();
  assert.equal(menuState(fixture).values.enemyVisible, false);
  all.events.onactivate();
  assert.equal(effectiveSnapshot(fixture).values.enemyVisible, false);

  enemyVisible.events.onactivate();
  assert.equal(menuState(fixture).values.enemyVisible, true);
  assert.equal(effectiveSnapshot(fixture).values.enemyVisible, false);

  capture.events.onactivate();
  assert.equal(menuState(fixture).values.enemyVisible, true);
  assert.equal(menuState(fixture).scopes[0].values.enemyVisible, true);
  assert.equal(effectiveSnapshot(fixture).values.enemyVisible, true);
});

test('menu reload keeps a restored selected snapshot until active identity settles', () => {
  const fixture = bootScopedMenu(
    {
      version: 1,
      values: { enemyLow: '#111111' },
      scopes: [
        {
          id: 'scope_shiv',
          mode: 'selected',
          heroes: ['hero_shiv'],
          values: { enemyLow: '#22aa44' },
        },
      ],
    },
    {
      publishedSnapshot: {
        version: 1,
        revision: 7,
        values: { enemyLow: '#22AA44' },
      },
    },
  );

  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#22AA44');
  assert.equal(effectiveSnapshot(fixture).revision, 7);
  assert.equal(configDispatches(fixture).length, 0);

  settleActiveHero(fixture);

  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#22AA44');
  assert.equal(effectiveSnapshot(fixture).revision, 7);
  assert.equal(configDispatches(fixture).length, 0);
});

test('a replacement hero keeps the settled scope until the new identity settles', () => {
  const fixture = bootScopedMenu({
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [
      {
        id: 'scope_shiv',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#22aa44' },
      },
      {
        id: 'scope_haze',
        mode: 'selected',
        heroes: ['hero_haze'],
        values: { enemyLow: '#334455' },
      },
    ],
  });
  settleActiveHero(fixture);
  const before = effectiveSnapshot(fixture);
  fixture.harness.dispatches.length = 0;

  fixture.topBar.setHeroName('HAZE');
  runIdentityTick(fixture);
  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#22AA44');
  assert.equal(effectiveSnapshot(fixture).revision, before.revision);
  assert.equal(configDispatches(fixture).length, 0);

  runIdentityTick(fixture);
  assert.equal(effectiveSnapshot(fixture).values.enemyLow, '#334455');
  assert.equal(effectiveSnapshot(fixture).revision, before.revision + 1);
  assert.equal(configDispatches(fixture).length, 1);
});

test('one blank active sample neither drops a settled scope nor defeats restored settling', () => {
  const menu = {
    version: 1,
    values: { enemyLow: '#111111' },
    scopes: [
      {
        id: 'scope_shiv',
        mode: 'selected',
        heroes: ['hero_shiv'],
        values: { enemyLow: '#22aa44' },
      },
    ],
  };
  const restored = bootScopedMenu(menu, {
    heroName: '',
    publishedSnapshot: {
      version: 1,
      revision: 7,
      values: { enemyLow: '#22AA44' },
    },
  });
  runIdentityTick(restored);
  runIdentityTick(restored);
  assert.equal(effectiveSnapshot(restored).values.enemyLow, '#22AA44');
  assert.equal(effectiveSnapshot(restored).revision, 7);
  assert.equal(configDispatches(restored).length, 0);

  const settled = bootScopedMenu(menu);
  settleActiveHero(settled);
  const before = effectiveSnapshot(settled);
  settled.harness.dispatches.length = 0;
  settled.topBar.setHeroName('');
  runIdentityTick(settled);
  assert.equal(effectiveSnapshot(settled).values.enemyLow, '#22AA44');
  assert.equal(effectiveSnapshot(settled).revision, before.revision);
  assert.equal(configDispatches(settled).length, 0);
});
