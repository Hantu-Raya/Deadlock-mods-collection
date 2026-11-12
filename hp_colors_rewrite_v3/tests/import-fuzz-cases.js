'use strict';
// Import fuzz cases (helper, not a suite): import-fuzz-<n>.test.js each run one shard.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadLayout, parseLayout, createVmContext, runInVm, sourceRoot, MockPanel, latestPublishedConfig } = require('./boot-layout');
const { modelPreviewLayout } = require('./preview-layout');

const USER_CODE = 'HPC3.1c943aec.eyJ2IjoxMywiayI6InNldHRpbmdzIiwiZCI6WzYsdHJ1ZSw0OSwiY3VzdG9tIiw1NSwiI0ZGRkZGRiIsNjksdHJ1ZSw3MSwiI0ZGRkZGRiIsMTA0LHRydWUsMTA1LCIjRjVGRjAwIiwxNjAsZmFsc2UsMTY3LGZhbHNlLDE3MCxmYWxzZSwxNzMsZmFsc2VdfQ';
const BAD_STYLE = /\b(?:NaN|undefined|null|Infinity|offBlack|offWhite|colorEnemy|colorFriend|brandGreen|team1Color(?:Dark)?|team2Color(?:Dark)?|numericOracle)\b|\[object|(?:^|[^\d.])(?:px|%)(?!\w)/i;
const clone = value => JSON.parse(JSON.stringify(value));
const failures = new Map();
let scenario = '';
const worldHarnesses = [];
function record(kind, detail, source = '') {
  const signature = kind + ' ' + detail + ' ' + source;
  if (!failures.has(signature)) failures.set(signature, { kind, detail, source, scenario });
}

// Test-local extension of boot-layout's engine alias guard. Preserve its proxy so both guards run.
const originalStyle = Object.getOwnPropertyDescriptor(MockPanel.prototype, 'style');
const styles = new WeakMap();
Object.defineProperty(MockPanel.prototype, 'style', {
  configurable: true,
  get() { return styles.get(this) || originalStyle.get.call(this); },
  set(bag) {
    originalStyle.set.call(this, bag);
    const panel = this, base = originalStyle.get.call(this);
    styles.set(this, new Proxy(base, {
      set(target, property, value) {
        if (typeof value === 'string' && BAD_STYLE.test(value)) {
          const stack = new Error().stack || '';
          const source = stack.split('\n').find(line => /panorama\/scripts\/.*\.js:\d+/.test(line)) || '';
          record('inline style', `${panel.id || '(anonymous)'}.${String(property)}=${JSON.stringify(value)}`, source.trim());
          throw new Error(`Invalid inline style ${panel.id}.${String(property)}=${JSON.stringify(value)}`);
        }
        return Reflect.set(target, property, value);
      },
    }));
  },
});

function menu() {
  const boot = loadLayout('hud_escape_menu.xml');
  const h = boot.harness, dispatch = h.$.DispatchEvent;
  h.$.DispatchEvent = (event, raw) => {
    const result = dispatch(event, raw);
    if (event === 'ClientUI_FireOutput') for (const world of worldHarnesses)
      for (const entry of [...world.handlerEntries]) if (entry.channel === event) entry.fn(raw);
    return result;
  };
  boot.includeScripts(); boot.onload();
  const find = id => {
    const panel = h.contextPanel.FindChildTraverse(id);
    assert.ok(panel, id); return panel;
  };
  const fire = id => { const panel = find(id); assert.equal(typeof panel.events.onactivate, 'function', id); panel.events.onactivate(); };
  const m = { boot, h, find, fire };
  modelPreviewLayout(m, 1);
  runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate', ''), boot.context);
  return m;
}

// Same world boot, native measurements and relay channel used by renderer.test.js's fixture.
function world(m, side) {
  const boot = loadLayout('unit_status_overlay_v2.xml');
  const h = boot.harness, root = h.contextPanel;
  root.type = root.paneltype = 'ClientUIDialogPanel';
  h.root.classes = ['player', side === 'enemy' ? 'enemy' : 'friend', 'health_critical'];
  root.AddClass('ShowCriticalState');
  const unit = root.FindChild('UnitStatus'), info = unit.FindChild('InfoHealthContainer');
  const stack = info.FindChild('UnitHealthbarsContainer');
  const primary = stack.FindChild('UnitHealthbar'), inner = primary.FindChild('UnitHealthbarInner');
  const fill = inner.FindChild('unit_healthbar_lagging');
  const motion = root.FindChild('HPColorsV3MotionFrame');
  const row = motion.FindChild('HPColorsV3Readout').FindChild('HPColorsV3ReadoutAnchor').FindChild('HPColorsV3ReadoutRow');
  const measure = (panel, width, height, x = 0, y = 0, sx = 2, sy = 2) => {
    panel.actualuiscale_x = sx; panel.actualuiscale_y = sy;
    panel.actuallayoutwidth = width * sx; panel.actuallayoutheight = height * sy;
    panel.actualxoffset = x * sx; panel.actualyoffset = y * sy;
  };
  const nativeLayout = full => {
    measure(unit, full ? 200 : 100, full ? 210 : 40, full ? 0 : 50, full ? 0 : 65);
    measure(info, full ? 200 : 100, full ? 210 : 40);
    measure(stack, full ? 200 : 100, full ? 210 : 40);
    measure(primary, 79, 18, ((full ? 200 : 100) - 79 + 13) / 2, full ? 65 : 0);
  };
  measure(root, 200, 210); nativeLayout(false); measure(inner, 69, 12, 6, 3.5);
  measure(motion, 200, 210); measure(row.GetParent(), 200, 210); measure(row, 28, 23);
  measure(info.FindChild('UnitHealthbarValue'), 20, 15); measure(root.FindChild('name'), 50, 16);
  for (const id of ['unit_healthbar_bullet_shield', 'unit_healthbar_ratking_armor', 'unit_healthbar_healing', 'unit_healthbar_delta'])
    measure(inner.FindChild(id), 69, 12);
  const level = info.FindChild('HPColorsV3Level'); measure(level, 21, 21, 27, 67.5, 1.25, 3);
  level.FindChildTraverse('unit_level_label').text = '10';
  const ult = info.Children().find(panel => panel.BHasClass('unit_info_panel'));
  measure(ult, 20, 20, 50, 68, 3, 1.25);
  measure(ult.FindChild('unit_info_bg'), 20, 20);
  measure(ult.FindChild('unit_info_bg').FindChild('unit_ult_ready_icon'), 20, 20);
  measure(fill, 69, 12, 0, 0, 1, 1);
  fill.style.clip = 'rect( 0.0%, 10%, 100.0%, 0.0%) ';
  const setParent = unit.SetParent.bind(unit);
  unit.SetParent = parent => { setParent(parent); nativeLayout(parent === motion); };
  for (const id of ['unit_healthbar_bullet_shield', 'unit_healthbar_ratking_armor']) {
    const panel = inner.FindChild(id); panel.AddClass('HasHealth'); panel.style.clip = 'rect(0%, 90%, 100%, 85%)';
  }
  const stamina = root.FindChild('StaminaContainer');
  assert.ok(stamina);
  for (let i = 0; i < 4; i++) {
    const pip = new MockPanel('Panel', stamina, 'FuzzStamina' + i); pip.AddClass('StaminaPip');
    const icon = new MockPanel('Panel', pip, 'FuzzStaminaIcon' + i); icon.AddClass('StaminaPipIcon');
    if (i === 1) pip.AddClass('PipEmpty');
    if (i === 2) icon.AddClass('StaminaRecentlyDepleted');
    if (i === 3) icon.AddClass('StaminaRecentlyUsed');
  }
  const create = h.$.CreatePanel;
  h.$.CreatePanel = (type, parent, id) => {
    const panel = create(type, parent, id);
    panel.BLoadLayout = url => {
      assert.equal(url, 'file://{resources}/layout/hp_colors_v3_relay.xml');
      const tree = parseLayout(fs.readFileSync(path.join(sourceRoot, 'panorama/layout/hp_colors_v3_relay.xml'), 'utf8'));
      const context = createVmContext(h);
      context.$ = { ...h.$, GetContextPanel: () => panel, DispatchEvent(event, raw) {
        assert.equal(event, 'ClientUI_FireOutput');
        for (const target of [m.h, h]) for (const entry of [...target.handlerEntries])
          if (entry.channel === 'ClientUI_FireOutput') entry.fn(raw);
        return true;
      } };
      for (const include of tree.children.find(n => n.tag === 'scripts').children) {
        const file = include.attrs.src.replace('s2r://', '').replace('.vjs_c', '.js');
        runInVm(fs.readFileSync(path.join(sourceRoot, file), 'utf8'), context, file);
      }
      return true;
    };
    return panel;
  };
  h.$.DispatchEvent = (event, panel) => { assert.equal(event, 'Activated'); panel.events.onactivate(); return true; };
  h.GameUI.CustomUIConfig = () => { throw new Error('World config cannot be read'); };
  boot.includeScripts();
  worldHarnesses.push(h);
  for (const entry of [...h.handlerEntries]) if (entry.channel === 'ClientUI_FireOutput')
    for (const [, raw] of m.h.dispatches) if (typeof raw === 'string' && raw.includes('HP_COLORS_V3_CONFIG')) entry.fn(raw);
  return { h, fill, api: h.$.HPColorsV3Renderer };
}

function values(row) {
  if (row.type === 'boolean') return [false, true];
  if (row.type === 'enum') return row.options.map(option => option.value);
  if (row.type === 'color') return ['#000000', '#FFFFFF', '#F5FF00'];
  assert.equal(row.type, 'number', row.key);
  const [min, max] = row.bounds;
  const mid = Math.round(((min + max) / 2 - min) / row.step) * row.step + min;
  return [...new Set([min, max, Number(mid.toFixed(8))])];
}
function set(settings, row, value) {
  (row.side === 'shared' ? settings.shared : settings.side[row.side])[row.key] = value;
  // Thresholds are an ordered pair, so an extreme needs one additional companion edit.
  if (row.key === 'lowThreshold' && value >= settings.shared.highThreshold) settings.shared.highThreshold = 100;
  if (row.key === 'highThreshold' && value <= settings.shared.lowThreshold) settings.shared.lowThreshold = 0;
}
function everything(defaults, controls) {
  const settings = clone(defaults);
  for (const row of controls) {
    if (row.type === 'boolean') set(settings, row, true);
    if (row.type === 'enum' && /ColorMode$|^ultMode$|^hudHealthColorMode$/.test(row.key) && row.options.some(o => o.value === 'custom')) set(settings, row, 'custom');
  }
  return settings;
}
function check(m, worlds, settings, code) {
  const exported = m.h.$.HPColorsV3Sharing.exportSettingsCode(settings);
  assert.equal(exported.ok, true, `export: ${exported.message}`);
  assert.ok(exported.code.length <= 4096, '4096-character cap');
  const imported = m.h.$.HPColorsV3Sharing.importSettingsCode(exported.code, settings);
  assert.equal(imported.ok, true, `codec import: ${imported.message}`);
  assert.deepEqual(clone(imported.settings), settings, 'round-trip settings');
  m.find('HPColorsSettingsCodeEntry').text = code || exported.code;
  m.fire('HPColorsSettingsImportButton');
  const applied = code ? m.h.$.HPColorsV3Sharing.importSettingsCode(code, settings) : imported;
  assert.ok(applied.ok, 'user code decodes');
  assert.deepEqual(clone(latestPublishedConfig(m.h).settings), clone(applied.settings), 'import published settings');
  for (const page of ['Bar', 'HPText', 'Name', 'Indicators', 'Icons', 'Units', 'Presets']) {
    m.fire('HPColorsNav' + page + 'Button');
    for (const side of ['Enemy', 'Ally']) {
      m.fire('HPColorsPreviewSideOption' + side);
      for (const kind of page === 'Units' ? ['Neutral', 'Objective'] : ['Hero']) {
        if (page === 'Units') m.fire('HPColorsPreviewKindOption' + kind);
        const preview = m.h.$.HPColorsV3Preview.inspect();
        if (/unavailable/i.test(preview.status)) record('preview unavailable', `${page}/${side}/${kind}: ${preview.status}`);
        const config = applied.settings, active = config.shared.enabled &&
          (kind === 'Hero' || kind === 'Objective' && config.side[side.toLowerCase()].objectiveEnabled || kind === 'Neutral' && config.shared.neutralEnabled);
        if (active && preview.painted === false) record('preview not painted', `${page}/${side}/${kind}: ${preview.status}`);
      }
    }
  }
  for (const fx of worlds) {
    fx.h.scheduler.runFor(150, 10000);
    if (applied.settings.shared.enabled && fx.api.status.state === 'dormant')
      record('world dormant', `${fx.api.facts().side}: ${JSON.stringify(fx.api.status)}`);
  }
}

// Sharded so node --test runs the shards in parallel (one process per file): groups g with g % shards
// === shard, on both bases; shard 0 also runs the pulse scenario and the user's code. The shards together
// cover every control value on both bases, as the single test did.
function run(shard, shards) {
  test(`imported schema extremes paint the preview and world without invalid inline CSS and round-trip unchanged (shard ${shard + 1}/${shards})`, { timeout: 180000 }, () => {
    const m = menu();
    const worlds = ['enemy', 'ally'].map(side => world(m, side));
    const controls = m.h.$.HPColorsV3Settings.controls;
    const defaults = clone(m.h.$.HPColorsV3Settings.defaults);
    const on = everything(defaults, controls);
    const pulse = clone(on);
    pulse.side.enemy.pulseThreshold = pulse.side.ally.pulseThreshold = 100;
    pulse.side.enemy.pulseHideBar = false;
    scenario = 'low HP pulse with shields and empty stamina pips';
    if (shard === 0) try {
      check(m, worlds, pulse);
      for (const fx of worlds) {
        assert.equal(fx.api.facts().eligible, true, 'player bar is eligible');
        assert.equal(fx.fill.BHasClass('HPColorsV3Pulse'), true, 'low-health pulse is active');
      }
    } catch (error) { record('thrown/codec', error && error.stack || String(error)); }
    const all = Array.from({ length: 12 }, () => []);
    controls.forEach((row, index) => all[index % all.length].push(row));
    const groups = all.filter((group, index) => index % shards === shard);
    const covered = new Set();
    let count = 0;
    for (const [base, start] of [['defaults', defaults], ['everything on', on]]) {
      for (const group of groups) for (let index = 0; index < Math.max(...group.map(row => values(row).length)); index++) {
        const chosen = group.filter(row => index < values(row).length).map(row => [row, values(row)[index]]);
        if (!chosen.length) continue;
        const settings = clone(start);
        for (const [row, value] of chosen) set(settings, row, value);
        for (const [row, value] of chosen) {
          const actual = (row.side === 'shared' ? settings.shared : settings.side[row.side])[row.key];
          if (actual === value) covered.add(`${base}:${row.side}.${row.key}:${JSON.stringify(value)}`);
        }
        scenario = `${base} + ${chosen.map(([row, value]) => `${row.side}.${row.key}=${JSON.stringify(value)}`).join(', ')}`;
        const initial = new Set(failures.keys());
        try { check(m, worlds, settings); }
        catch (error) { record('thrown/codec', error && error.stack || String(error)); }
        count++;
        const novel = [...failures.keys()].filter(key => !initial.has(key));
        // On failure re-import one edited control at a time; retain the full
        // group when no single edit reproduces the same error.
        if (novel.length && chosen.length > 1) {
          const groupFailures = novel.map(key => [key, failures.get(key)]);
          for (const key of novel) failures.delete(key);
          for (const [row, value] of chosen) {
            const isolated = clone(start); set(isolated, row, value);
            scenario = `${base} + ${row.side}.${row.key}=${JSON.stringify(value)}`;
            try { check(m, worlds, isolated); }
            catch (error) { record('thrown/codec', error && error.stack || String(error)); }
          }
          for (const [key, failure] of groupFailures) if (!failures.has(key)) failures.set(key, failure);
        }
      }
    }
    scenario = 'user supplied code';
    if (shard === 0) try { check(m, worlds, clone(defaults), USER_CODE); }
    catch (error) { record('thrown/codec', error && error.stack || String(error)); }
    const expected = new Set();
    for (const base of ['defaults', 'everything on']) for (const row of groups.flat()) for (const value of values(row))
      expected.add(`${base}:${row.side}.${row.key}:${JSON.stringify(value)}`);
    assert.ok(controls.length > 0 && groups.length > 0 && count >= groups.length * 2, 'all schema cohorts of this shard sampled');
    assert.deepEqual([...expected].filter(key => !covered.has(key)), [], 'every control value retained on both bases');
    assert.deepEqual([...failures.values()], [], `${count + 2} import cases; distinct failures:\n${[...failures.values()].map(f => `${f.scenario}: ${f.kind} ${f.detail} ${f.source}`).join('\n')}`);
  });
}

module.exports = { run, SHARDS: 6 };
