#!/usr/bin/env node
'use strict';

// Synthetic native-call counts and visible-state equivalence, not CPU/FPS measurements.
// No test exports: both production scripts share the real hud_minimap context.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseArgs } = require('node:util');

const { values: args } = parseArgs({ options: { output: { type: 'string' } } });
const sourceRoot = process.env.BT_SOURCE_ROOT
  ? path.resolve(process.env.BT_SOURCE_ROOT)
  : path.resolve(__dirname, '../panorama');
const pagePath = 'D:/hpv2-store/bt/index.html';
const pageSource = fs.readFileSync(pagePath, 'utf8').match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
const scriptNames = ['rejuvnbufftimer.js', 'bt_minimap_settings.js'];
const sources = scriptNames.map(name => fs.readFileSync(path.join(sourceRoot, 'scripts', name), 'utf8')
  .replace(/\s*\/\/ TEST_EXPORTS_BEGIN[\s\S]*?\/\/ TEST_EXPORTS_END\s*/g, '\n'));
const STEP_MS = 100;
const START_MS = 100000;
Error.stackTraceLimit = 100;
const PROFILE = process.env.BT_PROFILE || '';
// BT_PROFILE_DEPTH=2: profile keys name the caller's caller too (e.g. panelValid<btPaintArrows), for shared helpers.
const PROFILE_DEPTH = Math.max(1, Number(process.env.BT_PROFILE_DEPTH) || 1);
const profiles = {};

const sorted = object => Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
const total = object => Object.values(object).reduce((sum, value) => sum + value, 0);
// The page's record format (bt_minimap_settings.js btEncode): BTS1.<fnv1a32 of the body>.<body>.
function record(data) {
  const body = JSON.stringify(data);
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 16777619) >>> 0;
  return `BTS1.${hash.toString(16).padStart(8, '0')}.${body}`;
}
const clockText = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const decodeXml = text => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function createHarness(scenario) {
  const counts = { timer: {}, settings: {}, harness: {} };
  const profile = PROFILE ? (profiles[scenario.name] = {}) : null;
  const jobs = [];
  const panels = [];
  const events = [];
  const disk = new Map();
  const store = { requests: [], replies: [], reads: 0, writes: 0 };
  const schedules = Object.fromEntries(['timer', 'settings', 'harness'].map(owner => [owner,
    { scheduled: 0, executed: 0, cancelled: 0, maxPending: 0, pending: 0, delays: {} }]));
  let now = START_MS;
  let nextId = 0;
  let clock;

  function caller() {
    // Find the closest VM script frame, so a settings callback entered via the page
    // or a native picker echo is not mistaken for its outer timer/harness caller.
    let owner = '';
    const names = [];
    for (const line of new Error().stack.split('\n')) {
      const frameOwner = /\brejuvnbufftimer\.js:\d/.test(line) ? 'timer'
        : /\bbt_minimap_settings\.js:\d/.test(line) ? 'settings' : '';
      if (!frameOwner) { if (owner) break; continue; }
      if (owner && frameOwner !== owner) break;
      owner = frameOwner;
      names.push((/at (?:Object\.)?([\w$.<>]+) \(/.exec(line) || [])[1] || '<anon>');
      if (names.length >= PROFILE_DEPTH) break;
    }
    return owner ? { owner, fn: names.join('<') } : { owner: 'harness', fn: '' };
  }
  function count(op) {
    const { owner, fn } = caller();
    counts[owner][op] = (counts[owner][op] || 0) + 1;
    // BT_PROFILE=<file>: also count per calling function; kept out of the main JSON.
    if (PROFILE && owner !== 'harness') {
      const key = `${owner}:${fn}:${op}`;
      profile[key] = (profile[key] || 0) + 1;
    }
    return owner;
  }
  function refreshPending() {
    for (const owner of Object.keys(schedules)) {
      const value = schedules[owner];
      value.pending = jobs.filter(job => job.owner === owner).length;
      value.maxPending = Math.max(value.maxPending, value.pending);
    }
  }
  function schedule(delay, callback, owner = 'harness') {
    const seconds = Math.max(0, Number(delay) || 0);
    const id = ++nextId;
    jobs.push({ id, due: now + seconds * 1000, callback, owner });
    const stats = schedules[owner];
    stats.scheduled++;
    stats.delays[String(seconds)] = (stats.delays[String(seconds)] || 0) + 1;
    refreshPending();
    return id;
  }
  function cancel(id) {
    const index = jobs.findIndex(job => job.id === id);
    if (index >= 0) {
      schedules[jobs[index].owner].cancelled++;
      jobs.splice(index, 1);
      refreshPending();
    }
  }
  function setClock(time) {
    if (clock) clock.raw.text = clockText(scenario.start + Math.floor((time - START_MS) / 1000));
  }
  function advance(target) {
    let callbacks = 0;
    for (;;) {
      jobs.sort((a, b) => a.due - b.due || a.id - b.id);
      if (!jobs.length || jobs[0].due > target) break;
      assert.ok(++callbacks < 10000, 'zero-delay scheduler runaway');
      const job = jobs.shift();
      now = job.due;
      setClock(now);
      schedules[job.owner].executed++;
      refreshPending();
      job.callback();
    }
    now = target;
    setClock(now);
    assert.ok(jobs.every(job => job.due > now), 'due callback left unexecuted');
  }

  // Internal native implementation walks raw nodes, never counted public methods.
  // One FindChildTraverse native call stays one call regardless of subtree size.
  function walk(panel, visit) {
    const raw = panel.raw;
    if (raw.deleted) return;
    visit(panel);
    for (const child of raw.children) walk(child, visit);
  }
  function find(panel, id) {
    let result = null;
    walk(panel, node => { if (!result && node.raw.id === id) result = node; });
    return result;
  }
  function valid(panel) {
    for (let cursor = panel; cursor; cursor = cursor.raw.parent) if (cursor.raw.deleted) return false;
    return true;
  }
  function move(parent, child, sibling, after) {
    const children = parent.raw.children;
    const from = children.indexOf(child);
    if (from < 0 || !children.includes(sibling)) return;
    children.splice(from, 1);
    children.splice(children.indexOf(sibling) + (after ? 1 : 0), 0, child);
  }
  function attachStore(panel) {
    let page;
    let hashchange;
    let pendingUrl;
    function observe(url) {
      const message = JSON.parse(decodeURIComponent(new URL(url).hash.slice(1)));
      store.requests.push(message);
    }
    function deliver(title) {
      const text = String(title);
      const message = JSON.parse(text.slice(5));
      store.replies.push(message);
      // Match the validator's committed-page reply delay and duplicate title echo.
      for (const delay of [0.05, 0.17]) schedule(delay, () => panel.raw.events.HTMLTitle?.(panel, text));
    }
    function commit(url) {
      const sandbox = {
        JSON, Math, String, Number, decodeURIComponent,
        location: { href: url, hash: new URL(url).hash },
        localStorage: {
          getItem(key) { store.reads++; return disk.has(key) ? disk.get(key) : null; },
          setItem(key, value) { store.writes++; disk.set(key, String(value)); },
          removeItem(key) { disk.delete(key); }
        },
        addEventListener(name, fn) { if (name === 'hashchange') hashchange = fn; },
        document: { set title(value) { deliver(value); } }
      };
      sandbox.window = sandbox;
      page = vm.createContext(sandbox);
      observe(url);
      vm.runInContext(pageSource, page, { filename: 'hpv2-store/bt/index.html' });
    }
    panel.raw.setUrl = url => {
      const text = String(url);
      assert.ok(text.startsWith('https://hantu-raya.github.io/hpv2-store/bt/#'), 'unexpected store target');
      panel.raw.url = text;
      pendingUrl = text;
      if (page) {
        page.location.href = text;
        page.location.hash = new URL(text).hash;
        observe(text);
        hashchange();
      } else {
        schedule(0.8, () => { if (!page) commit(pendingUrl); });
      }
    };
  }

  function panel(type, parent, id = '', owned = false) {
    const raw = {
      id, paneltype: type, parent, children: [], classes: new Set(), attributes: {}, events: {},
      owned, deleted: false, text: '', style: {}, hittest: true, hittestchildren: true,
      visible: true, acceptsinput: true, acceptsfocus: true, focused: false, src: '',
      actualxoffset: 0, actualyoffset: 0, actuallayoutwidth: 360, actuallayoutheight: 360,
      contentwidth: 360, contentheight: 360, actualuiscale_x: 1, actualuiscale_y: 1
    };
    let proxy;
    const methods = {
      IsValid: () => valid(proxy),
      GetParent: () => raw.parent,
      Children: () => raw.children.filter(valid),
      GetChildCount: () => raw.children.filter(valid).length,
      GetChild: index => raw.children.filter(valid)[index] || null,
      FindChildTraverse: id => find(proxy, id),
      FindChildrenWithClassTraverse: name => {
        const result = [];
        walk(proxy, child => { if (child.raw.classes.has(name)) result.push(child); });
        return result;
      },
      BHasClass: name => raw.classes.has(name),
      BAscendantHasClass: name => {
        for (let cursor = proxy; cursor; cursor = cursor.raw.parent) if (cursor.raw.classes.has(name)) return true;
        return false;
      },
      SetHasClass: (name, on) => { if (on) raw.classes.add(name); else raw.classes.delete(name); },
      AddClass: name => raw.classes.add(name),
      RemoveClass: name => raw.classes.delete(name),
      SetPanelEvent: (name, callback) => { raw.events[name] = callback; },
      GetAttributeInt: (name, fallback) => Object.hasOwn(raw.attributes, name) ? raw.attributes[name] : fallback,
      GetAttributeString: (name, fallback) => Object.hasOwn(raw.attributes, name) ? raw.attributes[name] : fallback,
      SetAttributeInt: (name, value) => { raw.attributes[name] = value; },
      SetAttributeString: (name, value) => { raw.attributes[name] = String(value); },
      BAcceptsInput: () => raw.acceptsinput,
      BAcceptsFocus: () => raw.acceptsfocus,
      SetAcceptsInput: value => { raw.acceptsinput = !!value; },
      SetAcceptsFocus: value => { raw.acceptsfocus = !!value; },
      SetFocus: () => { raw.focused = true; },
      SetImage: value => { raw.src = value; },
      MoveChildBefore: (child, before) => move(proxy, child, before, false),
      MoveChildAfter: (child, after) => move(proxy, child, after, true),
      DeleteAsync: delay => { schedule(delay || 0, () => { raw.deleted = true; }); },
      BLoadLayout: (url, replaceChildren, replaceStyles) => {
        assert.equal(replaceChildren, false);
        assert.equal(replaceStyles, false);
        const filename = /^file:\/\/\{resources\}\/layout\/([\w.-]+\.xml)$/.exec(url)?.[1];
        assert.ok(filename, `unexpected layout ${url}`);
        loadLayout(proxy, fs.readFileSync(path.join(sourceRoot, 'layout', filename), 'utf8'));
        return true;
      },
      // Window px: the sum of ancestor offsets; a drag proxy follows raw.win (the cursor) once the engine moves it.
      GetPositionWithinWindow: () => {
        if (raw.win) return { x: raw.win.x, y: raw.win.y };
        let x = 0;
        let y = 0;
        for (let cursor = proxy; cursor; cursor = cursor.raw.parent) { x += cursor.raw.actualxoffset; y += cursor.raw.actualyoffset; }
        return { x, y };
      },
      SetDraggable: value => { raw.draggable = !!value; },
      SetURL: url => { assert.ok(raw.setUrl, 'SetURL on non-HTML panel'); raw.setUrl(url); }
    };
    const wrapped = Object.fromEntries(Object.entries(methods).map(([name, fn]) => [name, (...params) => {
      count(name);
      return fn(...params);
    }]));
    const style = new Proxy(raw.style, {
      get(target, property) { count(`style.read.${String(property)}`); return target[property]; },
      set(target, property, value) { count(`style.write.${String(property)}`); target[property] = value; return true; },
      deleteProperty(target, property) { count(`style.delete.${String(property)}`); delete target[property]; return true; }
    });
    proxy = new Proxy(raw, {
      get(target, property) {
        if (property === 'raw') return raw;
        if (property === 'style') return style;
        if (Object.hasOwn(wrapped, property)) return wrapped[property];
        if (Object.hasOwn(target, property)) count(`property.read.${String(property)}`);
        return target[property];
      },
      set(target, property, value) { count(`property.write.${String(property)}`); target[property] = value; return true; }
    });
    panels.push(proxy);
    if (parent) parent.raw.children.push(proxy);
    if (type === 'CitadelHTMLPanel') attachStore(proxy);
    if (type === 'CitadelColorPicker') panel('TextEntry', proxy, 'HexValue', owned);
    return proxy;
  }

  function applyXmlAttributes(target, attrs) {
    const raw = target.raw;
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'class') for (const item of value.split(/\s+/).filter(Boolean)) raw.classes.add(item);
      else if (name === 'style') {
        for (const item of value.split(';')) {
          const colon = item.indexOf(':');
          if (colon < 0) continue;
          const property = item.slice(0, colon).trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          raw.style[property] = item.slice(colon + 1).trim();
        }
      } else if (['hittest', 'hittestchildren', 'visible', 'acceptsfocus', 'acceptsinput'].includes(name)) raw[name] = value !== 'false';
      else if (['text', 'src'].includes(name)) raw[name] = value;
      else if (name !== 'id') raw.attributes[name] = value;
    }
  }
  function loadLayout(host, xml) {
    // These script-less layouts use simple nested XML. The first visual node
    // applies to the BLoadLayout host; preserve anonymous children and hierarchy.
    const stack = [];
    let appliedRoot = false;
    let skipDepth = 0;
    for (const match of xml.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<\/?[A-Za-z][\w]*\b[^>]*>/g)) {
      const token = match[0];
      const name = /^<\/?([\w]+)/.exec(token)[1];
      const closing = token.startsWith('</');
      const selfClosing = token.endsWith('/>');
      if (['root', 'include'].includes(name)) continue;
      if (['styles', 'scripts', 'snippets'].includes(name)) { skipDepth += closing ? -1 : selfClosing ? 0 : 1; continue; }
      if (skipDepth) continue;
      if (closing) { assert.ok(stack.length, `unbalanced ${name}`); stack.pop(); continue; }
      const attrs = Object.fromEntries([...token.matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], decodeXml(item[2])]));
      const current = !appliedRoot ? host : panel(name, stack[stack.length - 1], attrs.id || '', true);
      assert.ok(current, 'layout node missing parent');
      appliedRoot = true;
      applyXmlAttributes(current, attrs);
      if (!selfClosing) stack.push(current);
    }
    assert.ok(appliedRoot && stack.length === 0, 'layout must have a balanced visual root');
  }

  const root = panel('CitadelHud', null, 'Hud');
  const core = panel('Panel', root, 'HudCore');
  core.raw.classes.add('HudCore');
  const gameplay = panel('Panel', core, 'gameplay_hud');
  const clamp = panel('Panel', gameplay, 'clamp_width');
  const perspective = panel('GlobalClassListener', clamp, 'minimap_persp');
  const container = panel('Panel', perspective, 'minimap_container');
  const overlay = panel('Panel', container, 'HudMinimapContainer');
  overlay.raw.actuallayoutwidth = overlay.raw.actuallayoutheight = 420;
  overlay.raw.contentwidth = overlay.raw.contentheight = 420;
  const minimap = panel('HudMinimap', overlay, 'hud_minimap');
  minimap.raw.actualxoffset = minimap.raw.actualyoffset = 30;
  const topBar = panel('Panel', gameplay, 'TopBar');
  clock = panel('Label', topBar, 'GameTime');
  clock.raw.classes.add('GameTime');
  const charges = panel('Panel', topBar, 'RejuvenatorCharges');
  const friendly = panel('Panel', charges, 'RejuvenatorFriendly');
  panel('Panel', charges, 'RejuvenatorEnemy');
  const chat = panel('Panel', core, 'Chat');
  const controls = panel('Panel', chat, 'ChatControls');
  const input = panel('TextEntry', controls, 'ChatInput');
  const target = panel('Label', controls, 'ChatTargetLabel');
  target.raw.text = 'To (TEAM):';
  const players = [];
  for (let i = 0; i < 12; i++) {
    const marker = panel('Panel', minimap, `player_${i}`);
    for (const name of ['map_button', 'player', 'active', i < 6 ? 'friend' : 'enemy', i % 2 ? 'arrowDown' : 'arrowUp']) marker.raw.classes.add(name);
    marker.raw.actualxoffset = i < 6 ? 80 + (i % 3) * 88 : 36 + (i % 3) * 100;
    marker.raw.actualyoffset = i < 6 ? 140 : 250;
    marker.raw.actuallayoutwidth = marker.raw.actuallayoutheight = 32;
    marker.raw.style.opacity = '0.8';
    panel('Image', marker, 'LocalSpecularImage');
    players.push(marker);
  }
  const powerups = [];
  for (let i = 0; i < 2; i++) {
    const marker = panel('Panel', minimap, `powerup_${i}`);
    for (const name of ['map_button', 'powerup_spawn', i ? 'powerup_survival' : 'powerup_gun', 'active']) marker.raw.classes.add(name);
    marker.raw.actualxoffset = i ? 270 : 90;
    marker.raw.actualyoffset = 144;
    powerups.push(marker);
  }
  for (const [i, kind] of ['neutral_small', 'neutral_medium', 'neutral_large', 'neutral_vault', 'urn'].entries()) {
    const marker = panel('Panel', minimap, `neutral_${i}`);
    for (const name of ['map_button', kind]) marker.raw.classes.add(name);
  }
  const rift = panel('Panel', minimap, 'rift_marker');
  for (const name of ['map_button', 'capture_point']) rift.raw.classes.add(name);
  if (scenario.name === 'hideoutIdle') {
    for (const name of ['InHideout', 'connectedToHideout']) root.raw.classes.add(name);
    perspective.raw.classes.add('InHideout');
  }
  // A save from an earlier session (moved widgets, picked colours, strength) is on the page before boot.
  if (scenario.saved) disk.set('hantu.bufftimer.v1/settings', record(scenario.saved));
  setClock(now);

  function fire(id, event = 'onactivate', ...params) {
    const found = find(root, id);
    assert.ok(found && typeof found.raw.events[event] === 'function', `#${id} ${event} must be bound`);
    found.raw.events[event](...params);
  }
  const sandbox = {
    console, Date: { now: () => now },
    $: {
      GetContextPanel() { count('GetContextPanel'); return minimap; },
      CreatePanel(type, parent, id) {
        count('CreatePanel');
        const created = panel(type, parent, id, true);
        // A 1600x900 screen at ui scale 0.8333 (1920x1080 layout px); the dock sits where the stock minimap box is.
        const raw = created.raw;
        if (id === 'TimerOverlayFrame' || id === 'BTMinimapSettingsHost') {
          Object.assign(raw, { actuallayoutwidth: 1600, actuallayoutheight: 900, actualuiscale_x: 0.8333333134651184, actualuiscale_y: 0.8333333134651184 });
        }
        if (id === 'BTTimerDock') {
          Object.assign(raw, { actualxoffset: 1233.33, actualyoffset: 520.83, actuallayoutwidth: 366.67, actuallayoutheight: 366.67, actualuiscale_x: 0.8333333134651184 });
        }
        return created;
      },
      Schedule(delay, callback) { return schedule(delay, callback, count('Schedule')); },
      CancelScheduled(id) { count('CancelScheduled'); cancel(id); },
      RegisterEventHandler(name, target, callback) { count('RegisterEventHandler'); target.raw.events[name] = callback; },
      Msg() { count('Msg'); },
      DispatchEvent(name, ...params) {
        count('DispatchEvent');
        events.push({ atMs: Math.round(now - START_MS), name, args: params.map(value => value?.raw ? value.raw.id : value),
          ...(name === 'CitadelChatInputSubmitted' ? { text: input.raw.text } : {}) });
        if (name === 'SetInputFocus' && params[0]?.raw) params[0].raw.focused = true;
        if (name === 'DropInputFocus' && params[0]?.raw) params[0].raw.focused = false;
      }
    }
  };
  const context = vm.createContext(sandbox);
  function boot() {
    sources.forEach((source, index) => vm.runInContext(source, context, { filename: scriptNames[index] }));
  }
  function snapshot() {
    const result = [];
    function visit(node, parentPath) {
      const raw = node.raw;
      if (!valid(node)) return;
      const peers = raw.parent?.raw.children.filter(child => !child.raw.deleted && child.raw.paneltype === raw.paneltype && !child.raw.id) || [];
      const name = raw.id || `${raw.paneltype}[${peers.indexOf(node)}]`;
      const panelPath = `${parentPath}/${name}`;
      result.push({ panel: panelPath, type: raw.paneltype, text: raw.text,
        classes: [...raw.classes].sort(), style: sorted(raw.style), attributes: sorted(raw.attributes),
        hittest: raw.hittest, hittestchildren: raw.hittestchildren, visible: raw.visible,
        acceptsinput: raw.acceptsinput, acceptsfocus: raw.acceptsfocus, src: raw.src });
      for (const child of raw.children) visit(child, panelPath);
    }
    visit(root, '');
    return { panels: result.sort((a, b) => a.panel.localeCompare(b.panel)), events: events.slice(),
      store: { requests: store.requests.slice(), replies: store.replies.slice(), disk: sorted(Object.fromEntries(disk)) } };
  }
  function summary() {
    const text = id => find(root, id)?.raw.text || '';
    const has = (id, cls) => !!find(root, id)?.raw.classes.has(cls);
    return {
      gameTime: clock.raw.text, rejuv: text('RejuvTime'), bridge: text('BuffTime'),
      mini: text('RejuvMiniTime'), rift: text('RiftTimerTime'), urn: text('UrnTimerTime'),
      claimLeft: text('ClaimTimerLeft'), claimRight: text('ClaimTimerRight'),
      claims: ['Left', 'Right'].filter(side => has(`MinimapBuffClaim${side}`, 'active')),
      allyClaims: ['Left', 'Right'].filter(side => has(`MinimapBuffClaim${side}`, 'ally-claim')),
      lingers: panels.filter(node => valid(node) && node.raw.id.startsWith('LingerQ_') && node.raw.classes.has('active')).length,
      arrowWashes: players.slice(6).map(marker => find(marker, 'LocalSpecularImage').raw.style.washColor || ''),
      neutral: has('Rejuv', 'neutral-mode'), riftConfirmed: has('RiftTimerCard', 'rift-confirmed'),
      menuOpen: has('BTSettingsPanel', 'open'), pickerOpen: has('BTColorEditor', 'open'),
      status: text('BTSettingsStatus'), storeReads: store.reads, storeWrites: store.writes,
      chatSubmits: events.filter(event => event.name === 'CitadelChatInputSubmitted').length,
      claimBg: ['Left', 'Right'].map(side => find(root, `ClaimBg${side}`)?.raw.style.backgroundColor || ''),
      glowBg: ['Left', 'Right'].map(side => find(root, `MinimapGlow${side}`)?.raw.style.backgroundColor || ''),
      slots: Object.fromEntries(['BTSlotBuff', 'BTSlotRift', 'BTSlotUrn', 'BTSlotClaimL'].map(id =>
        [id, `${find(root, id)?.raw.style.position || ''} ${find(root, id)?.raw.style.uiScale || ''}`])),
      editing: has('BTLayoutBar', 'open')
    };
  }
  return { boot, advance, counts, schedules, snapshot, summary, fire, find: id => find(root, id),
    root, minimap, players, powerups, friendly, rift, store, disk, drags: {} };
}

const scenarios = [
  { name: 'hideoutIdle', start: 0, seconds: 60 },
  { name: 'earlyLane', start: 180, seconds: 60 },
  { name: 'neutralOverride', start: 240, seconds: 60 },
  { name: 'rejuvSpawnClaim', start: 590, seconds: 30 },
  { name: 'bridgePowerupClaim', start: 590, seconds: 60 },
  { name: 'lateRiftUrn', start: 1770, seconds: 60 },
  { name: 'lingerHeavy', start: 900, seconds: 60 },
  { name: 'settingsMenuOpen', start: 180, seconds: 60 },
  // Saved look and layout from an earlier session: moved Bridge pill and claim boxes, picked claim/glow colours,
  // strength 140; one ally and one enemy claim paint the custom colours.
  { name: 'customLookClaim', start: 590, seconds: 60, saved: {
    s: 4, u: '#FFFFFF', d: '#FF4D4D', l: 1, g: 1,
    t: { b: [0.1, 0.2, 1.5, 't'], cl: [0.4, 0.1, 0.75, 't'], cr: [0.6, 0.1, 1.25, 't'] },
    c: { a: '#3DFFE0', e: '#FF9A3D', w: '#A970FF', v: '#FFFFFF' }, k: 140 } },
  // Layout edit session during a match: move the Bridge pill, flip the Rift card, resize the Urn card, drag the
  // edit box, DONE.
  { name: 'layoutEditDrag', start: 180, seconds: 30 }
];

// One engine drag: DragStart hands over the callbacks, the proxy follows the cursor path, DragEnd after mouse up.
function dragAt(game, elapsed, id, startMs, path) {
  const step = elapsed - startMs;
  if (step === 0) {
    const panel = game.find(id);
    const callbacks = { displayPanel: null, offsetX: 0, offsetY: 0, removePositionBeforeDrop: true };
    game.fire(id, 'DragStart', panel, callbacks);
    game.drags[id] = callbacks.displayPanel;
  }
  const proxy = game.drags[id];
  if (!proxy || step < 0) return;
  const index = step / 100 - 1;
  if (index >= 0 && index < path.length) proxy.raw.win = path[index];
  if (index === path.length) {
    delete proxy.raw.win;
    game.fire(id, 'DragEnd', game.find(id), proxy);
    delete game.drags[id];
  }
}

function drive(game, scenario, elapsed) {
  const setClass = (node, name, enabled) => { if (enabled) node.raw.classes.add(name); else node.raw.classes.delete(name); };
  if (scenario.name !== 'hideoutIdle') {
    // Include death and vision edges without disturbing the stationary allies used for claims.
    setClass(game.players[11], 'PlayerDead', elapsed >= 12000 && elapsed < 18000);
    if (scenario.name !== 'lingerHeavy') setClass(game.players[10], 'active', !(elapsed >= 20000 && elapsed < 27000));
  }
  if (scenario.name === 'rejuvSpawnClaim') {
    setClass(game.friendly, 'RejuvCount_1', elapsed >= 15000);
    if (elapsed === 8000) game.fire('RejuvPingButton');
  }
  if (scenario.name === 'bridgePowerupClaim' || scenario.name === 'customLookClaim') {
    // Two players reach the spawn points before the Bridge reset; disappearance after the native markers
    // have been scanned attributes the claims (both allies, or ally left and enemy right).
    const enemyRight = scenario.name === 'customLookClaim';
    for (let side = 0; side < 2; side++) {
      const player = game.players[side && enemyRight ? 6 : side];
      player.raw.actualxoffset = side ? 270 : 90;
      player.raw.actualyoffset = 144;
      setClass(game.powerups[side], 'active', elapsed < 14000 + side * 1000);
    }
    if (elapsed === 8000) game.fire('BuffPingButton');
  }
  if (scenario.name === 'layoutEditDrag') {
    if (elapsed === 2000) game.fire('BTLayoutButton');
    if (elapsed === 3000) game.fire('BTSlotBuff', 'onmouseover');
    dragAt(game, elapsed, 'BTSlotBuff', 4000, [{ x: 500, y: 300 }, { x: 540, y: 320 }, { x: 600, y: 350 }, { x: 600, y: 350 }, { x: 700, y: 420 }]);
    if (elapsed === 7000) game.fire('BTSlotRiftSideL');
    dragAt(game, elapsed, 'BTSlotUrnHandleBR', 8000, [{ x: 1500, y: 800 }, { x: 1540, y: 830 }, { x: 1580, y: 860 }]);
    dragAt(game, elapsed, 'BTLayoutBarGrip', 11000, [{ x: 800, y: 100 }, { x: 760, y: 140 }]);
    if (elapsed === 14000) game.fire('BTLayoutDone');
  }
  if (scenario.name === 'lateRiftUrn') {
    setClass(game.rift, 'koth_warning', elapsed >= 10000 && elapsed < 30000);
    setClass(game.find('neutral_4'), 'active', elapsed >= 30000);
  }
  if (scenario.name === 'lingerHeavy') {
    for (let i = 6; i < 12; i++) setClass(game.players[i], 'active', Math.floor((elapsed + (i - 6) * 700) / 3500) % 2 === 0);
  }
  if (scenario.name === 'settingsMenuOpen') {
    for (let i = 6; i < 12; i++) {
      const up = (Math.floor(elapsed / 3000) + i) % 2 === 0;
      setClass(game.players[i], 'arrowUp', up);
      setClass(game.players[i], 'arrowDown', !up);
    }
    if (elapsed === 2000) game.fire('BTSettingsGear');
    if (elapsed === 5000) game.fire('BTUpColor');
    if (elapsed === 6000) game.fire('BTPreset7');
    if (elapsed === 7000) { game.find('BTSpectrum').raw.value = 300; game.fire('BTSpectrum', 'onvaluechanged'); }
    if (elapsed === 8000) game.fire('BTUpColor');
  }
}

function measure(scenario) {
  const game = createHarness(scenario);
  const digest = crypto.createHash('sha256');
  const samples = [];
  const witnesses = [];
  const distinct = new Set();
  function observe(elapsed) {
    const snapshot = JSON.stringify(game.snapshot());
    distinct.add(snapshot);
    digest.update(JSON.stringify({ second: elapsed / 1000, state: JSON.parse(snapshot) }) + '\n');
    const summary = game.summary();
    witnesses.push(summary);
    if ([0, 1000, 5000, 10000, 15000, 20000, 30000, 60000].includes(elapsed) || elapsed === scenario.seconds * 1000) {
      samples.push({ second: elapsed / 1000, ...summary });
    }
  }
  game.boot();
  drive(game, scenario, 0);
  game.advance(START_MS);
  observe(0);
  for (let elapsed = STEP_MS; elapsed <= scenario.seconds * 1000; elapsed += STEP_MS) {
    // Apply stock HUD changes before callbacks due at the same 100 ms boundary.
    game.advance(START_MS + elapsed - 0.001);
    drive(game, scenario, elapsed);
    game.advance(START_MS + elapsed);
    if (elapsed % 1000 === 0) observe(elapsed);
  }
  assert.ok(distinct.size > 1, `${scenario.name}: no observed state changes`);
  assert.ok(game.store.reads > 0 && game.store.replies.some(reply => reply.o === 'ready' && reply.ok), `${scenario.name}: real store page not ready`);
  assert.ok(witnesses.some(sample => sample.arrowWashes.every(Boolean)), `${scenario.name}: enemy arrows were not painted`);
  const any = predicate => witnesses.some(predicate);
  if (scenario.name === 'earlyLane') assert.ok(any(sample => sample.bridge !== '0:00'), 'early lane did not tick');
  // The Rejuv has waited at Spawn since the start: the override shows, the mini card stays hidden (2026-10-09).
  if (scenario.name === 'neutralOverride') {
    assert.ok(any(sample => sample.neutral), 'neutral override absent');
    assert.ok(!any(sample => sample.mini), 'mini card shown while the Rejuv waits at Spawn');
  }
  if (scenario.name === 'rejuvSpawnClaim') {
    assert.ok(any(sample => sample.rejuv === 'Spawn') && any(sample => sample.mini && sample.rejuv !== 'Spawn'), 'Rejuv spawn/claim transition absent');
    assert.ok(any(sample => sample.chatSubmits > 0), 'Rejuv chat path absent');
  }
  if (scenario.name === 'bridgePowerupClaim') {
    assert.ok(any(sample => sample.claims.length === 2 && sample.allyClaims.length === 2), 'ally claim boxes absent');
    assert.ok(any(sample => sample.chatSubmits > 0), 'Bridge chat path absent');
  }
  if (scenario.name === 'lateRiftUrn') assert.ok(any(sample => sample.riftConfirmed) && any(sample => sample.urn === '0:00'), 'Rift warning/urn spawn absent');
  if (scenario.name === 'lingerHeavy') assert.ok(any(sample => sample.lingers > 0), 'linger labels absent');
  if (scenario.name === 'settingsMenuOpen') {
    assert.ok(any(sample => sample.menuOpen && sample.pickerOpen), 'gear/editor path absent');
    assert.ok(any(sample => sample.arrowWashes.includes('#FF4DFF')), 'preset colour not painted');
    assert.ok(any(sample => sample.arrowWashes.includes('#6DFF00')), 'spectrum colour not painted');
    assert.equal(game.store.writes, 1, 'the preset + spectrum burst reaches the durable store once');
  }
  if (scenario.name === 'customLookClaim') {
    assert.ok(any(sample => sample.arrowWashes.includes('#FFFFFF')), 'saved arrow colour not painted');
    assert.ok(any(sample => sample.claims.length === 2 && sample.allyClaims.length === 1), 'ally + enemy claim absent');
    assert.ok(any(sample => /61,255,224/.test(sample.claimBg[0])) && any(sample => /255,154,61/.test(sample.claimBg[1])),
      'saved ally/enemy claim colours not painted');
    assert.ok(any(sample => sample.glowBg.some(Boolean)), 'glow look not painted');
    assert.ok(any(sample => sample.slots.BTSlotClaimL.endsWith(' 75%')), 'saved claim box scale not placed');
  }
  if (scenario.name === 'layoutEditDrag') {
    assert.ok(any(sample => sample.editing) && !witnesses[witnesses.length - 1].editing, 'edit session absent or not ended');
    const saved = game.disk.get('hantu.bufftimer.v1/settings') || '';
    for (const key of ['"b":', '"f":', '"u":']) assert.ok(saved.includes(key), `DONE did not save ${key} (${saved})`);
  }
  return {
    simSeconds: scenario.seconds,
    counts: { timer: sorted(game.counts.timer), settings: sorted(game.counts.settings) },
    perSecond: Object.fromEntries(['timer', 'settings'].map(owner => [owner, Number((total(game.counts[owner]) / scenario.seconds).toFixed(3))])),
    schedules: Object.fromEntries(Object.entries(game.schedules).map(([owner, stats]) => [owner, { ...stats, delays: sorted(stats.delays) }])),
    harnessCounts: sorted(game.counts.harness),
    observed: { digest: digest.digest('hex'), distinctSnapshots: distinct.size, samples }
  };
}

const report = {
  version: 1, stepMs: STEP_MS,
  note: 'Synthetic VM native-boundary calls (boot included; raw native internals and observations excluded). One shared minimap context per scenario. Counts and state digests are deterministic; no wall-clock timing or source-root path in output.',
  scenarios: Object.fromEntries(scenarios.map(scenario => [scenario.name, measure(scenario)]))
};
const json = JSON.stringify(report, null, 2) + '\n';
if (args.output) fs.writeFileSync(path.resolve(args.output), json);
else process.stdout.write(json);
if (PROFILE) fs.writeFileSync(path.resolve(PROFILE), JSON.stringify(profiles, null, 2) + '\n');
console.log('scenario                 timer/s  settings/s  callbacks  digest');
for (const [name, result] of Object.entries(report.scenarios)) {
  const callbacks = result.schedules.timer.executed + result.schedules.settings.executed;
  console.log(`${name.padEnd(24)} ${String(result.perSecond.timer).padStart(7)} ${String(result.perSecond.settings).padStart(11)} ${String(callbacks).padStart(10)}  ${result.observed.digest.slice(0, 12)}`);
}
