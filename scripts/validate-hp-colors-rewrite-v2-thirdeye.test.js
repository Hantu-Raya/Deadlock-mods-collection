'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');
const { MockPanel } = require('./hp-colors-panorama-test-adapter');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(
  process.env.HP_COLORS_REWRITE_V2_THIRDEYE_SOURCE_ROOT ||
    path.join(repoRoot, 'hp_colors_rewrite_v2_thirdeye'),
);
const windowPath = path.join(
  sourceRoot,
  'panorama',
  'scripts',
  'hp_colors_thirdeye_window.js',
);
const bridgePath = path.join(
  sourceRoot,
  'panorama',
  'scripts',
  'hp_colors_thirdeye_bridge.js',
);
const windowSource = fs.readFileSync(windowPath, 'utf8');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');

function createPanel(id, options = {}) {
  const panel = new MockPanel(id, options);
  panel.alive = true;
  panel.writes = [];
  const setPanelEvent = panel.SetPanelEvent;
  panel.SetPanelEvent = function (name, callback) {
    panel.writes.push({ name, callback });
    return setPanelEvent.call(this, name, callback);
  };
  panel.appendChild = function (child) {
    return panel.add(child);
  };
  panel.removeChild = function (child) {
    if (child && panel.children.includes(child)) child.SetParent(null);
  };
  panel.textWrites = 0;
  const textDescriptor = Object.getOwnPropertyDescriptor(panel, 'text');
  Object.defineProperty(panel, 'text', {
    configurable: true,
    enumerable: true,
    get: textDescriptor.get,
    set(value) {
      panel.textWrites += 1;
      textDescriptor.set.call(panel, value);
    },
  });
  return panel;
}

function createRuntime({ shellPresent = true, hpCancel = () => false } = {}) {
  const root = createPanel('HudRoot');
  const escapeMenu = createPanel('EscapeMenu');
  const backdrop = createPanel('EscapeBackground');
  const shell = createPanel('ThirdEyeWindow');
  shell.appendChild(createPanel('ThirdEyeWindowTabs'));
  shell.appendChild(createPanel('ThirdEyeWindowContent'));
  const contextPanel = root;
  const hpButton = createPanel('HPColorsMenuButton');
  let hpOpened = 0;
  const defaultBoot = () => {
    hpButton.SetPanelEvent('onactivate', () => {
      hpOpened += 1;
    });
  };
  root.appendChild(escapeMenu);
  root.appendChild(backdrop);
  if (shellPresent) root.appendChild(shell);
  root.appendChild(hpButton);
  const scheduled = [];
  const dispatched = [];
  const sandbox = {
    globalThis: null,
    $: {
      Schedule(delay, callback) {
        scheduled.push({ delay, callback });
        return scheduled.length;
      },
      Msg() {},
      GetContextPanel() {
        return contextPanel;
      },
      DispatchEvent(name, panel) {
        dispatched.push({ name, panel });
      },
      HPColorsMenuCancel: hpCancel,
      HPColorsMenuBoot: defaultBoot,
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.ThirdEye = {
    VERSION: 'TEST',
    core: {
      panel: {
        findRoot() {
          return root;
        },
        isAlive(panel) {
          return Boolean(panel && panel.alive);
        },
        create() {
          return createPanel('dynamic');
        },
      },
      hud: {
        findHud() {
          return root;
        },
        isInHideout() {
          return true;
        },
      },
      registry: {},
    },
    ui: {
      renderer: {},
      layout: [],
      search: null,
    },
  };
  vm.runInNewContext(bridgeSource, sandbox, { filename: bridgePath });
  vm.runInNewContext(windowSource, sandbox, { filename: windowPath });

  return {
    sandbox,
    root,
    escapeMenu,
    backdrop,
    shell,
    hpButton,
    scheduled,
    dispatched,
    get hpOpened() {
      return hpOpened;
    },
  };
}

function runNext(runtime) {
  const next = runtime.scheduled.shift();
  assert.ok(next, 'expected a scheduled callback');
  next.callback();
  return next;
}

function runAll(runtime, limit = 100) {
  let runs = 0;
  while (runtime.scheduled.length > 0) {
    if (++runs > limit) throw new Error('scheduler did not converge');
    runNext(runtime);
  }
  return runs;
}

function createUltCooldownRuntime() {
  const root = createPanel('HudRoot');
  const topBar = createPanel('TopBar');
  const teams = createPanel('TeamsContainer');
  const team = createPanel('Team1');
  const contents = createPanel('PlayerContents');
  const players = createPanel('PlayersContainer');
  const player = createPanel('Player1');
  const details = createPanel('PlayerDetailsContainer');
  const statusRow = createPanel('StatusRow');
  const ultimate = createPanel('UltimateStatus');
  const ultimateBackground = createPanel('UltimateStatusBG');
  const hidden = createPanel('te_UltimateCooldownTextHidden', { text: '37' });
  const shown = createPanel('te_UltimateCooldownTextShown');
  const pickupIndicators = createPanel('HPV2PickupIndicators');

  root.appendChild(topBar);
  topBar.appendChild(teams);
  teams.appendChild(team);
  team.appendChild(contents);
  contents.appendChild(players);
  players.appendChild(player);
  player.appendChild(details);
  details.appendChild(statusRow);
  statusRow.appendChild(ultimate);
  ultimate.appendChild(ultimateBackground);
  ultimateBackground.appendChild(hidden);
  statusRow.appendChild(shown);
  const scheduled = [];
  const clearedLogs = [];
  const sandbox = {
    globalThis: null,
    $: {
      Msg() {},
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.ThirdEye = {
    core: {
      features: {},
      panel: {
        findRoot() {
          return root;
        },
        isAlive(panel) {
          return Boolean(panel && panel.alive);
        },
      },
      hud: {
        findHud() {
          return root;
        },
      },
      perf: {
        schedule(callback, delay, id) {
          const loop = {
            callback,
            delay,
            id,
            stopped: false,
            stop() {
              this.stopped = true;
            },
          };
          scheduled.push(loop);
          return loop;
        },
      },
      logger: {
        clear(id) {
          clearedLogs.push(id);
        },
        error(id, message) {
          throw new Error(`${id}: ${message}`);
        },
      },
    },
  };

  return {
    sandbox,
    root,
    topBar,
    statusRow,
    ultimate,
    hidden,
    shown,
    pickupIndicators,
    scheduled,
    clearedLogs,
  };
}

function loadUltCooldownFeature(runtime, featurePath = path.join(
  sourceRoot,
  'panorama',
  'scripts',
  'features',
  'topbar_ult_cooldown',
  'feature.js',
)) {
  const featureSource = fs.readFileSync(featurePath, 'utf8');
  vm.runInNewContext(featureSource, runtime.sandbox, { filename: featurePath });
  return runtime.sandbox.ThirdEye.core.features.topbar_ult_cooldown();
}

function runUltTick(loop) {
  assert.equal(loop.stopped, false, 'polling loop should be active');
  loop.callback();
}

test('pickup layout centers either cooldown label and restores its original alignment', () => {
  const runtimeRoot = process.env.HP_COLORS_REWRITE_V2_THIRDEYE_SOURCE_ROOT ||
    path.join(repoRoot, 'hp_colors_rewrite_v2');
  const scripts = path.join(runtimeRoot, 'panorama/scripts');
  const contract = fs.readFileSync(path.join(scripts, 'hp_colors_v2_contract.js'), 'utf8');
  const source = fs.readFileSync(path.join(scripts, 'test_topbar_pickups.js'), 'utf8');
  // Expose the real renderer before event registration and polling start.
  const boot = '  try { listener = $.RegisterForUnhandledEvent';
  assert.equal(source.split(boot).length, 2);
  const instrumented = source.replace(boot, '$.renderPickup = render; return;\n' + boot);
  function createPanel(type, parent, id) {
    const panel = new MockPanel(type, parent, id);
    function move(child, sibling, after) {
      panel.children.splice(panel.children.indexOf(child), 1);
      panel.children.splice(panel.children.indexOf(sibling) + after, 0, child);
    }
    panel.MoveChildBefore = (child, sibling) => move(child, sibling, 0);
    panel.MoveChildAfter = (child, sibling) => move(child, sibling, 1);
    return panel;
  }
  for (const id of ['UltimateCooldownTextShown', 'te_UltimateCooldownTextShown']) {
    const topbar = createPanel('Panel', null, 'TopBar');
    topbar.AddClass('HPV2PickupTopBar');
    const status = createPanel('Panel', topbar, 'StatusRow');
    const ultimate = createPanel('Panel', status, 'UltimateStatus');
    const label = createPanel('Label', status, id);
    label.style.horizontalAlign = 'left';
    const sandbox = { $: {
      GetContextPanel: () => topbar,
      CreatePanel: createPanel,
      Schedule() {},
      Msg() {},
    } };
    vm.runInNewContext(contract, sandbox);
    vm.runInNewContext(instrumented, sandbox);
    const row = { ultimate, mask: 0 };
    sandbox.$.renderPickup(row, 9);
    assert.equal(label.style.horizontalAlign, 'center', id);
    assert.equal(row.container.style.horizontalAlign, 'center');
    assert.equal(ultimate.GetParent(), row.container);
    assert.equal(label.GetParent(), status, 'cooldown stays below the pickup row');
    sandbox.$.renderPickup(row, 0);
    assert.equal(label.style.horizontalAlign, 'left', 'expiry restores the prior alignment');
    assert.equal(ultimate.GetParent(), status);
  }
});

test('pinned upstream ultimate feature stays stale after HPv2 reparenting', () => {
  const runtime = createUltCooldownRuntime();
  const fixturePath = path.join(
    repoRoot,
    'hp_colors_rewrite_v2_thirdeye',
    'source_snapshots',
    'topbar_ult_cooldown.js',
  );
  const feature = loadUltCooldownFeature(runtime, fixturePath);

  feature.onEnable();
  const loop = runtime.scheduled[0];
  runUltTick(loop);
  assert.equal(runtime.shown.text, '37');

  runtime.statusRow.appendChild(runtime.pickupIndicators);
  runtime.pickupIndicators.appendChild(runtime.ultimate);
  runtime.hidden.text = '36';
  runUltTick(loop);
  assert.equal(
    runtime.shown.text,
    '37',
    'pinned upstream source demonstrates the wrapped-path regression',
  );
  feature.onDisable();
});

test('Third Eye ultimate cooldown follows HPv2 pickup reparenting', () => {
  const runtime = createUltCooldownRuntime();
  const feature = loadUltCooldownFeature(runtime);

  feature.onEnable();
  assert.equal(runtime.scheduled.length, 1);
  assert.equal(runtime.scheduled[0].delay, 0.25);
  const loop = runtime.scheduled[0];
  assert.equal(runtime.topBar.BHasClass('te_topbar_ult_cooldown_enabled_active'), true);

  runUltTick(loop);
  assert.equal(runtime.shown.text, '37');
  assert.equal(runtime.shown.textWrites, 1);

  runUltTick(loop);
  assert.equal(runtime.shown.textWrites, 1, 'unchanged cooldown must not write again');

  runtime.hidden.text = '36';
  runUltTick(loop);
  assert.equal(runtime.shown.text, '36');
  assert.equal(runtime.shown.textWrites, 2);

  runtime.statusRow.appendChild(runtime.pickupIndicators);
  runtime.pickupIndicators.appendChild(runtime.ultimate);
  runtime.hidden.text = '35';
  runUltTick(loop);
  assert.equal(runtime.shown.text, '35', 'nested UltimateStatus must keep updating during pickups');
  assert.equal(runtime.shown.textWrites, 3);

  runUltTick(loop);
  assert.equal(runtime.shown.textWrites, 3, 'nested unchanged cooldown must not write again');

  runtime.statusRow.appendChild(runtime.ultimate);
  runtime.hidden.text = '34';
  runUltTick(loop);
  assert.equal(runtime.shown.text, '34', 'direct UltimateStatus must resume after pickup expiry');
  assert.equal(runtime.shown.textWrites, 4);

  runtime.statusRow.removeChild(runtime.ultimate);
  runtime.hidden.text = '33';
  runUltTick(loop);
  assert.equal(runtime.shown.text, '34', 'incomplete pickup row must be safely skipped');
  runtime.pickupIndicators.appendChild(runtime.ultimate);
  runUltTick(loop);
  assert.equal(runtime.shown.text, '33', 'rebuilt pickup row must recover on the next tick');

  feature.onDisable();
  assert.equal(loop.stopped, true);
  assert.equal(runtime.topBar.classes.has('te_topbar_ult_cooldown_enabled_active'), false);
  assert.deepEqual(runtime.clearedLogs, ['topbar_ult_cooldown']);
});

test('late ThirdEye hooks compose HP nested cancel, window close, and resume fallback', () => {
  const runtime = createRuntime();
  const initialCancel = () => {
    runtime.dispatched.push({ name: 'canonical-cancel' });
    return false;
  };
  runtime.escapeMenu.events.oncancel = initialCancel;
  runtime.backdrop.events.onactivate = initialCancel;

  assert.equal(runtime.scheduled[0].delay, 0.3);
  runNext(runtime);
  assert.notEqual(runtime.escapeMenu.events.oncancel, initialCancel, 'late ThirdEye hook must replace stale XML callback');
  assert.notEqual(runtime.backdrop.events.onactivate, initialCancel, 'late backdrop hook must replace stale XML callback');

  runtime.escapeMenu.events.oncancel();
  assert.equal(runtime.dispatched.filter(item => item.name === 'CitadelResumePlaying').length, 1);

  runtime.sandbox.ThirdEye.ui.window.setOpen(true);
  runtime.escapeMenu.events.oncancel();
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), false);
  assert.equal(runtime.dispatched.filter(item => item.name === 'CitadelResumePlaying').length, 1);

  runtime.sandbox.$.HPColorsMenuCancel = () => true;
  runtime.sandbox.ThirdEye.ui.window.setOpen(true);
  runtime.backdrop.events.onactivate();
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), true, 'nested HP modal must win over ThirdEye close');
  assert.equal(runtime.dispatched.filter(item => item.name === 'CitadelResumePlaying').length, 1);
});

test('HP button exclusivity is scoped to boot and repeats without a persistent monkey patch', () => {
  const runtime = createRuntime();
  runNext(runtime);
  const original = runtime.hpButton.SetPanelEvent;

  runtime.sandbox.$.HPColorsMenuBoot();
  assert.equal(runtime.hpButton.SetPanelEvent, original, 'bridge must restore SetPanelEvent after boot');
  runtime.sandbox.ThirdEye.ui.window.setOpen(true);
  runtime.hpButton.events.onactivate();
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), false);
  assert.equal(runtime.hpOpened, 1);

  runtime.sandbox.$.HPColorsMenuBoot();
  assert.equal(runtime.hpButton.SetPanelEvent, original);
  runtime.sandbox.ThirdEye.ui.window.setOpen(true);
  runtime.hpButton.events.onactivate();
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), false);
  assert.equal(runtime.hpOpened, 2);
});

test('missing shell retries finitely, then a late shell is hooked once', () => {
  const runtime = createRuntime({ shellPresent: false });
  runNext(runtime);
  assert.equal(runtime.scheduled.length, 1);
  runtime.shell.SetParent(runtime.root);
  runNext(runtime);
  assert.equal(runtime.escapeMenu.writes.filter(item => item.name === 'oncancel').length, 1);
  assert.equal(runtime.backdrop.writes.filter(item => item.name === 'onactivate').length, 1);

  const exhausted = createRuntime({ shellPresent: false });
  runAll(exhausted, 31);
  assert.equal(exhausted.scheduled.length, 0, 'retry guard must fail closed after 30 attempts');
});

test('missing ThirdEye dependency leaves canonical HP callback untouched', () => {
  const canonical = () => 'canonical';
  const sandbox = {
    console,
    globalThis: { ThirdEye: { core: {}, ui: {} } },
    $: {
      HPColorsMenuCancel: () => false,
      GetContextPanel: () => ({ id: 'EscapeMenu' }),
      DispatchEvent() {},
      Msg() {},
    },
  };
  sandbox.globalThis.globalThis = sandbox.globalThis;
  vm.runInNewContext(`globalThis.ThirdEye.core = {}; globalThis.ThirdEye.ui = {};`, sandbox);
  sandbox.$.canonical = canonical;
  vm.runInNewContext(windowSource, sandbox, { filename: windowPath });
  assert.equal(sandbox.$.canonical(), 'canonical');
  assert.equal(sandbox.$.HPColorsThirdEyeCloseWindow, undefined);
});

test('canonical EscapeButton cancels HP dialogs, then Third Eye, before resuming', () => {
  let hpDepth = 2;
  const runtime = createRuntime({ hpCancel: () => hpDepth > 0 ? (hpDepth--, true) : false });
  runNext(runtime);
  runtime.sandbox.ThirdEye.ui.window.setOpen(true);
  const activate = () => vm.runInNewContext(
    "if (!$.HPColorsMenuCancel()) $.DispatchEvent('CitadelResumePlaying', $.GetContextPanel())",
    runtime.sandbox,
  );
  activate();
  activate();
  assert.equal(runtime.dispatched.length, 0);
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), true);
  activate();
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), false);
  assert.equal(runtime.dispatched.length, 0);
  activate();
  assert.equal(runtime.dispatched.length, 1);
});

test('Third Eye button cannot open behind an HP modal or editor', () => {
  let hpDepth = 2;
  const runtime = createRuntime({ hpCancel: () => hpDepth > 0 ? (hpDepth--, true) : false });
  runNext(runtime);
  const toggle = runtime.sandbox.$.HPColorsThirdEyeToggleWindow;
  toggle();
  assert.equal(hpDepth, 1);
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), false);
  toggle();
  assert.equal(hpDepth, 0);
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), false);
  toggle();
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), true);
  toggle();
  assert.equal(runtime.sandbox.ThirdEye.ui.window.isOpen(), false);
  assert.equal(runtime.dispatched.length, 0);
});

test('CLI composer generates Escape XML and cooldown feature outputs in a temp directory', () => {
  const thirdEyeRoot = path.join(repoRoot, 'hp_colors_rewrite_v2_thirdeye');
  const canonicalRoot = path.join(repoRoot, 'hp_colors_rewrite_v2');
  const pinPath = path.join(thirdEyeRoot, 'thirdeye-source-pin.json');
  const pin = JSON.parse(fs.readFileSync(pinPath, 'utf8'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv2-thirdeye-compose-'));
  const escapeOutput = path.join(tempRoot, 'hud_escape_menu.xml');
  const cooldownOutput = path.join(tempRoot, 'topbar_ult_cooldown.js');
  try {
    const result = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts', 'compose-hp-colors-rewrite-v2-thirdeye.js'),
      '--canonical',
      path.join(canonicalRoot, 'panorama', 'layout', 'hud_escape_menu.xml'),
      '--thirdeye',
      path.join(thirdEyeRoot, 'source_snapshots', 'hud_escape_menu.xml'),
      '--bridge',
      path.join(thirdEyeRoot, 'panorama', 'scripts', 'hp_colors_thirdeye_bridge.js'),
      '--window',
      path.join(thirdEyeRoot, 'panorama', 'scripts', 'hp_colors_thirdeye_window.js'),
      '--output',
      escapeOutput,
      '--pin',
      pinPath,
      '--packageHash',
      pin.packageSha256,
      '--topbarOutput',
      cooldownOutput,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      result.error ? result.error.message : result.stderr,
    );

    const escapeXml = fs.readFileSync(escapeOutput, 'utf8');
    const cooldownSource = fs.readFileSync(cooldownOutput, 'utf8');
    assert.match(escapeXml, /id="HPColorsEditorRoot"/);
    assert.match(escapeXml, /id="ThirdEyeWindow"/);
    assert.match(escapeXml, /HPColorsThirdEyeToggleWindow/);
    assert.match(cooldownSource, /var pickups = statusRow\.FindChild\("HPV2PickupIndicators"\);/);
    assert.match(cooldownSource, /ultimate = pickups\.FindChild\("UltimateStatus"\);/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
