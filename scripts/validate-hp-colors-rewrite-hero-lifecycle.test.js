'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
  installTopBarIdentityTree,
  findByClass,
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

const HERO_PANEL_IDS = [
  'HPColorsSettingsOverviewHero',
  'HPColorsHeroModeAuto',
  'HPColorsHeroModeManual',
  'HPColorsHeroModeOff',
  'HPColorsHeroPhase',
  'HPColorsHeroIdentity',
  'HPColorsHeroDetail',
  'HPColorsHeroManualRow',
  'HPColorsHeroManualButton',
  'HPColorsHeroManualValue',
  'HPColorsHeroDialog',
  'HPColorsHeroOptions',
  'HPColorsHeroCloseButton',
];

function installLayoutPanels(harness) {
  const ids = new Set(
    Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1]),
  );
  for (const id of HERO_PANEL_IDS) ids.add(id);
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
}

function bootHero(options = {}) {
  const harness = createPanoramaHarness({
    includeGame: options.includeGame,
    gameState: options.gameState,
  });
  installLayoutPanels(harness);
  const topBar = installTopBarIdentityTree(harness, {
    heroName: options.heroName,
    gameTime: options.gameTime,
    hudClasses: options.hudClasses,
  });
  runInVm(menuSource, createVmContext(harness), 'hp_colors_menu.js');
  harness.$.HPColorsMenuBoot();
  return { harness, topBar };
}

function identityPanel(fixture, id) {
  return fixture.harness.root.FindChildTraverse(id);
}

function identityText(fixture, id) {
  return String(identityPanel(fixture, id).text || '');
}

function nextIdentityJob(fixture, remove) {
  const jobs = fixture.harness.scheduler.jobs;
  let selectedIndex = -1;
  for (let index = 0; index < jobs.length; index++) {
    if (!jobs[index].fn || jobs[index].fn.name !== 'identityTick') continue;
    if (
      selectedIndex < 0 ||
      jobs[index].due < jobs[selectedIndex].due ||
      (jobs[index].due === jobs[selectedIndex].due &&
        jobs[index].order < jobs[selectedIndex].order)
    ) {
      selectedIndex = index;
    }
  }
  assert.notEqual(selectedIndex, -1, 'expected identityTick callback');
  return remove ? jobs.splice(selectedIndex, 1)[0] : jobs[selectedIndex];
}

function runIdentityTick(fixture) {
  const job = nextIdentityJob(fixture, true);
  fixture.harness.now = Math.max(fixture.harness.now, Number(job.due) || 0);
  job.fn();
  return job;
}

function nextIdentityDelay(fixture) {
  return nextIdentityJob(fixture, false).delay;
}

function identityJobCount(fixture) {
  return fixture.harness.scheduler.jobs.filter(
    (job) => job.fn && job.fn.name === 'identityTick',
  ).length;
}

function assertActiveHero(fixture, name) {
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: ACTIVE');
  assert.match(
    identityText(fixture, 'HPColorsHeroIdentity'),
    new RegExp('^HERO:\\s+' + name + '$', 'i'),
  );
}

function settleInitialActiveIdentity(fixture, name) {
  runIdentityTick(fixture);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: ACTIVE');
  assert.equal(nextIdentityDelay(fixture), 0);

  runIdentityTick(fixture);
  assert.match(
    identityText(fixture, 'HPColorsHeroIdentity'),
    /^HERO:\s+SETTLING\s+—\s+/i,
  );
  assert.equal(nextIdentityDelay(fixture), 1);

  runIdentityTick(fixture);
  assertActiveHero(fixture, name);
  assert.equal(nextIdentityDelay(fixture), 1);
}

function settleChangedActiveIdentity(fixture, previousName, name) {
  runIdentityTick(fixture);
  assertActiveHero(fixture, previousName);
  assert.equal(nextIdentityDelay(fixture), 1);
  runIdentityTick(fixture);
  assertActiveHero(fixture, name);
}

function configDispatches(harness) {
  return harness.dispatches.filter((args) => args[0] === 'ClientUI_FireOutput');
}

test('topbar retail names settle to exact hero keys and reject unknown or fuzzy names', () => {
  const known = bootHero({ heroName: 'SHIV', gameTime: '00:01' });
  settleInitialActiveIdentity(known, 'Shiv');
  assert.match(
    identityText(known, 'HPColorsHeroDetail'),
    /Stable ID:\s+hero_shiv/i,
  );

  for (const candidate of ['', '#', 'NOT_A_HERO', 'SHIV PRIME']) {
    const fixture = bootHero({ heroName: candidate, gameTime: '00:01' });
    runIdentityTick(fixture);
    runIdentityTick(fixture);
    runIdentityTick(fixture);
    assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: ACTIVE');
    assert.equal(identityText(fixture, 'HPColorsHeroIdentity'), 'HERO: UNKNOWN');
  }
});

test('lifecycle clears stale identity across lobby, active, post-match, and next match', () => {
  const fixture = bootHero({
    includeGame: false,
    heroName: 'SHIV',
    gameTime: '',
  });

  runIdentityTick(fixture);
  assert.equal(
    identityText(fixture, 'HPColorsHeroPhase'),
    'MATCH: TRANSITIONING',
  );

  fixture.topBar.hud.AddClass('GameStatePreGame');
  runIdentityTick(fixture);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: LOBBY');
  assert.equal(identityText(fixture, 'HPColorsHeroIdentity'), 'HERO: UNKNOWN');

  fixture.topBar.hud.RemoveClass('GameStatePreGame');
  fixture.topBar.setGameTime('00:01');
  runIdentityTick(fixture);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: ACTIVE');
  assert.equal(nextIdentityDelay(fixture), 0);
  runIdentityTick(fixture);
  runIdentityTick(fixture);
  assertActiveHero(fixture, 'Shiv');

  fixture.topBar.setHeroName('HAZE');
  settleChangedActiveIdentity(fixture, 'Shiv', 'Haze');

  fixture.topBar.hud.AddClass('GameStatePostGame');
  runIdentityTick(fixture);
  assert.equal(
    identityText(fixture, 'HPColorsHeroPhase'),
    'MATCH: POST MATCH',
  );
  assert.equal(identityText(fixture, 'HPColorsHeroIdentity'), 'HERO: UNKNOWN');

  fixture.topBar.hud.RemoveClass('GameStatePostGame');
  fixture.topBar.setGameTime('00:02');
  fixture.topBar.setHeroName('ABRAMS');
  runIdentityTick(fixture);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: ACTIVE');
  runIdentityTick(fixture);
  runIdentityTick(fixture);
  assertActiveHero(fixture, 'Abrams');
});

test('cached local-player card replacement is rediscovered without stale identity', () => {
  const fixture = bootHero({ heroName: 'SHIV', gameTime: '00:01' });
  settleInitialActiveIdentity(fixture, 'Shiv');
  const oldCard = fixture.topBar.playerCard;

  fixture.topBar.replaceLocalPlayerCard('HAZE');
  assert.equal(oldCard.IsValid(), false);
  settleChangedActiveIdentity(fixture, 'Shiv', 'Haze');
  assert.equal(fixture.topBar.playerCard.IsValid(), true);
  assert.match(identityText(fixture, 'HPColorsHeroDetail'), /Stable ID:\s+hero_haze/i);
});

test('identity cadence is five seconds while inactive and one second while active', () => {
  const fixture = bootHero({
    includeGame: false,
    heroName: 'SHIV',
    gameTime: '',
  });

  runIdentityTick(fixture);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: TRANSITIONING');
  assert.equal(nextIdentityDelay(fixture), 1);

  fixture.topBar.hud.AddClass('GameStatePreGame');
  runIdentityTick(fixture);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: LOBBY');
  assert.equal(nextIdentityDelay(fixture), 0);
  runIdentityTick(fixture);
  assert.equal(nextIdentityDelay(fixture), 5);

  fixture.topBar.hud.RemoveClass('GameStatePreGame');
  fixture.topBar.setGameTime('00:01');
  runIdentityTick(fixture);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: ACTIVE');
  assert.equal(nextIdentityDelay(fixture), 0);
  runIdentityTick(fixture);
  assert.equal(nextIdentityDelay(fixture), 1);
});

test('stale identity generation callbacks are no-ops after a phase restart', () => {
  const fixture = bootHero({ heroName: 'SHIV', gameTime: '00:01' });
  settleInitialActiveIdentity(fixture, 'Shiv');

  const current = fixture.harness.scheduler.jobs.find(
    (job) => job.fn && job.fn.name === 'identityTick',
  );
  assert.ok(current, 'expected an active identity callback');
  const staleCallback = current.fn;

  fixture.topBar.hud.AddClass('GameStatePostGame');
  staleCallback();
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), 'MATCH: POST MATCH');
  assert.equal(identityText(fixture, 'HPColorsHeroIdentity'), 'HERO: UNKNOWN');
  const jobsAfterRestart = fixture.harness.scheduler.jobs.length;
  const phaseAfterRestart = identityText(fixture, 'HPColorsHeroPhase');
  const identityAfterRestart = identityText(fixture, 'HPColorsHeroIdentity');

  staleCallback();
  assert.equal(fixture.harness.scheduler.jobs.length, jobsAfterRestart);
  assert.equal(identityText(fixture, 'HPColorsHeroPhase'), phaseAfterRestart);
  assert.equal(identityText(fixture, 'HPColorsHeroIdentity'), identityAfterRestart);
});

test('Auto, Manual, and Off use transient identity state and dynamic manual options', () => {
  const fixture = bootHero({ heroName: 'SHIV', gameTime: '00:01' });
  settleInitialActiveIdentity(fixture, 'Shiv');

  const harness = fixture.harness;
  harness.root.FindChildTraverse('HPColorsMenuButton').events.onactivate();
  const auto = harness.root.FindChildTraverse('HPColorsHeroModeAuto');
  const manual = harness.root.FindChildTraverse('HPColorsHeroModeManual');
  const off = harness.root.FindChildTraverse('HPColorsHeroModeOff');
  const manualRow = harness.root.FindChildTraverse('HPColorsHeroManualRow');
  const manualButton = harness.root.FindChildTraverse('HPColorsHeroManualButton');
  const manualValue = harness.root.FindChildTraverse('HPColorsHeroManualValue');
  const dialog = harness.root.FindChildTraverse('HPColorsHeroDialog');
  const optionsHost = harness.root.FindChildTraverse('HPColorsHeroOptions');
  const close = harness.root.FindChildTraverse('HPColorsHeroCloseButton');

  assert.ok(auto && manual && off && manualRow && manualButton && manualValue);
  assert.ok(dialog && optionsHost && close);
  const beforeRootConfig = harness.root.GetAttributeString(
    'hp_colors_rewrite_config',
    '',
  );
  const beforeConfigDispatches = configDispatches(harness).length;
  const undo = harness.root.FindChildTraverse('HPColorsUndoButton');
  assert.equal(Boolean(undo.enabled), false);
  const identityJobsBeforeModes = identityJobCount(fixture);

  manualButton.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), false);

  manual.events.onactivate();
  assert.equal(identityJobCount(fixture), identityJobsBeforeModes);
  assert.equal(manualRow.BHasClass('Active'), true);
  assert.equal(dialog.BHasClass('Open'), false);
  manualButton.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), true);

  const option = findByClass(harness.root, 'HPColorsHeroOption').find(
    (panel) => panel.GetAttributeString('hp_colors_hero_key', '') === 'hero_haze',
  );
  assert.ok(option, 'expected a hero_haze option with the stable key attribute');
  option.events.onactivate();
  assert.equal(identityJobCount(fixture), identityJobsBeforeModes);
  assert.equal(dialog.BHasClass('Open'), false);
  assert.match(identityText(fixture, 'HPColorsHeroIdentity'), /HERO:\s+Haze\s+\(MANUAL\)/i);
  assert.match(String(manualValue.text || ''), /HAZE/i);

  auto.events.onactivate();
  assert.equal(identityJobCount(fixture), identityJobsBeforeModes);
  assert.equal(manualRow.BHasClass('Active'), false);
  for (
    let attempt = 0;
    attempt < 5 &&
    identityText(fixture, 'HPColorsHeroIdentity') !== 'HERO: Shiv';
    attempt++
  ) {
    runIdentityTick(fixture);
  }
  assertActiveHero(fixture, 'Shiv');
  const localScansBeforeOff = harness.findCounts.LocalPlayer || 0;

  off.events.onactivate();
  assert.equal(identityJobCount(fixture), identityJobsBeforeModes);
  assert.equal(manualRow.BHasClass('Active'), false);
  assert.equal(identityText(fixture, 'HPColorsHeroIdentity'), 'HERO DETECTION OFF');
  for (let attempt = 0; attempt < 4; attempt++) runIdentityTick(fixture);
  assert.equal(
    harness.findCounts.LocalPlayer || 0,
    localScansBeforeOff,
    'Off mode should keep lifecycle polling without scanning local hero cards',
  );
  close.events.onactivate();
  assert.equal(dialog.BHasClass('Open'), false);

  assert.equal(
    harness.root.GetAttributeString('hp_colors_rewrite_config', ''),
    beforeRootConfig,
  );
  assert.equal(configDispatches(harness).length, beforeConfigDispatches);
  assert.equal(Boolean(undo.enabled), false);
});
