'use strict';

// Shared pak98 test harness: panel mocks, the real /bt/ store page behind a fake CEF panel, a deterministic
// scheduler, and launch(), which boots the settings script (and optionally the timer) like hud_minimap.xml does.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, 'buff_timer_virgin', ...parts), 'utf8');
// BT_SCRIPTS_DIR points at another copy of the two scripts, e.g. the Closure ADVANCED output, which has no test exports.
const SCRIPTS_DIR = process.env.BT_SCRIPTS_DIR || path.join(root, 'buff_timer_virgin', 'panorama', 'scripts');
const MINIFIED = !!process.env.BT_SCRIPTS_DIR;
const source = fs.readFileSync(path.join(SCRIPTS_DIR, 'bt_minimap_settings.js'), 'utf8');
const timerSource = fs.readFileSync(path.join(SCRIPTS_DIR, 'rejuvnbufftimer.js'), 'utf8');
const settingsLayout = read('panorama', 'layout', 'bt_minimap_settings.xml');
const PAGE_PATH = 'D:/hpv2-store/bt/index.html';
const pageSource = fs.readFileSync(PAGE_PATH, 'utf8').match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
const PAGE_URL = 'https://hantu-raya.github.io/hpv2-store/bt/';
const KEY = 'hantu.bufftimer.v1/settings';
const HPV2_KEYS = { 'hantu.hpcolors.v2/state': 'HPV2S1.deadbeef.e30', 'hantu.hpcolors.v2/state.prev': 'HPV2S1.cafebabe.e30' };

// The settings host layout owns all controls; pak98 leaves stock hud.xml untouched.
// BTSpectrum and BTPreset0-9 are created by the script inside BTSpectrumHost / BTPresetRow.
const panelIds = [
  'BTSettingsRoot', 'BTSettingsPanel', 'BTSettingsGear', 'BTUpColor', 'BTUpColorArrow', 'BTUpColorHex',
  'BTDownColor', 'BTDownColorArrow', 'BTDownColorHex', 'BTColorEditor', 'BTPresetRow', 'BTSpectrumHost',
  'BTColorHexEntry', 'BTLingerToggle', 'BTGlowToggle', 'BTSettingsStatus', 'BTSettingsReset',
  'BTSettingsResetLabel', 'BTSettingsStore', 'BTBorderToggle', 'BTMapOpacityHost', 'BTMapOpacityValue',
  'BTBrightnessHost', 'BTBrightnessValue',
];

// HUD scale and geometry from the probe run (1600x900 screen, actualuiscale 0.8333). Window positions are screen px.
const SCALE = 0.8333333134651184;
const FLT_MAX = 3.4028234663852886e+38;
const TIMER_LAYOUTS = {
  TimerOverlayFrame: 'bt_timer_overlay.xml',
  MinimapGlowClip: 'bt_minimap_glow.xml',
  BTLingerLayer: 'bt_linger_layer.xml',
};

// The engine's style setter (panorama.dll, client 6763): null clears a base property, but throws for an alias
// ("Cannot set a property alias to undefined"): horizontal-align and vertical-align are aliases of align, ui-scale-x/y/z
// of ui-scale. An empty string throws too. Live 2026-10-09: RESET LAYOUT left the minimap moved because of the alias.
const STYLE_ALIASES = new Set(['horizontalAlign', 'verticalAlign', 'uiScaleX', 'uiScaleY', 'uiScaleZ']);
function engineStyle() {
  return new Proxy({}, {
    set(target, property, value) {
      if (value === null && STYLE_ALIASES.has(property)) {
        throw new Error(`Cannot set a property alias to undefined (${String(property)})`);
      }
      if (value === '') throw new Error(`Property setter for CPanelStyle called with empty string as value for ${String(property)}`);
      // Live 2026-10-09: clearing an inline visibility: collapse with null left the minimap ring hidden for good.
      if (property === 'visibility' && value === null && target.visibility === 'collapse') return true;
      target[property] = value;
      return true;
    },
  });
}
function makePanel(id, paneltype = 'Panel', parent = null) {
  const classes = new Set();
  const panel = {
    id, paneltype, parent, children: [], style: engineStyle(), text: '', events: Object.create(null), classes,
    attributes: new Map(), deleted: false, draggable: false,
    actualuiscale_x: SCALE, actualuiscale_y: SCALE, actuallayoutwidth: 0, actuallayoutheight: 0,
    // Panels with a fixed .win report it; others follow their parent plus an inline "Xpx Ypx" position.
    GetPositionWithinWindow() {
      if (this.win) return { x: this.win.x, y: this.win.y };
      const base = this.parent ? this.parent.GetPositionWithinWindow() : { x: 0, y: 0 };
      const match = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(this.style.position || ''));
      return match ? { x: base.x + Number(match[1]) * SCALE, y: base.y + Number(match[2]) * SCALE } : base;
    },
    SetDraggable(on) { this.draggable = !!on; },
    IsDraggable() { return this.draggable; },
    IsValid() { return !this.deleted; },
    BHasClass: (name) => classes.has(name),
    SetHasClass: (name, on) => { if (on) classes.add(name); else classes.delete(name); },
    AddClass: (name) => classes.add(name),
    RemoveClass: (name) => classes.delete(name),
    GetParent() { return this.parent; },
    FindChildTraverse(id) {
      for (const child of this.children) {
        if (child.deleted) continue;
        if (child.id === id) return child;
        const found = child.FindChildTraverse(id);
        if (found) return found;
      }
      return null;
    },
    FindChildrenWithClassTraverse() { return []; },
    Children() { return this.children.filter((child) => !child.deleted); },
    GetChildCount() { return this.Children().length; },
    GetChild(index) { return this.Children()[index] || null; },
    GetAttributeInt(name, fallback) { return this.attributes.has(name) ? this.attributes.get(name) : fallback; },
    SetAttributeInt(name, value) { this.attributes.set(name, value); },
    GetAttributeString(name, fallback) { return this.attributes.has(name) ? this.attributes.get(name) : fallback; },
    SetAttributeString(name, value) { this.attributes.set(name, value); },
    MoveChildBefore(child, before) {
      this.children.splice(this.children.indexOf(child), 1);
      this.children.splice(this.children.indexOf(before), 0, child);
    },
    MoveChildAfter(child, after) {
      this.children.splice(this.children.indexOf(child), 1);
      this.children.splice(this.children.indexOf(after) + 1, 0, child);
    },
    SetImage: () => {},
    SetFocus() { this.focused = true; },
    DeleteAsync() { this.deleted = true; },
    SetPanelEvent(name, fn) { this.events[name] = fn; },
  };
  if (parent) parent.children.push(panel);
  return panel;
}

// Builds the real XML tree under host: the layout's root element is the host itself, nesting is kept.
function loadLayoutInto(host, xml, ids, onPanel) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<styles>[\s\S]*?<\/styles>/, '');
  const stack = [];
  let rootSeen = false;
  for (const match of body.matchAll(/<(\/?)([A-Za-z][\w]*)\b([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClose] = match;
    if (tag === 'root') continue;
    if (closing) { stack.pop(); continue; }
    const id = (/\bid="([^"]+)"/.exec(attrs) || [])[1] || '';
    const panel = rootSeen ? makePanel(id, tag, stack[stack.length - 1]) : host;
    rootSeen = true;
    for (const name of ((/\bclass="([^"]+)"/.exec(attrs) || [])[1] || '').split(/\s+/).filter(Boolean)) panel.classes.add(name);
    const text = /\btext="([^"]*)"/.exec(attrs);
    if (text && panel !== host) panel.text = text[1];
    if (/\bhittest="false"/.test(attrs)) panel.hittest = false;
    if (id && panel !== host) {
      ids[id] = panel;
      if (onPanel) onPanel(panel);
    }
    if (!selfClose) stack.push(panel);
  }
}

// A minimap player marker as the engine builds it: map_button + team class + an arrow child.
function makeMarker(team, arrow) {
  const marker = makePanel(`marker_${team}_${arrow}`);
  for (const name of ['map_button', 'player', 'active', team, arrow]) marker.classes.add(name);
  marker.actualxoffset = 100;
  marker.actualyoffset = 100;
  marker.image = makePanel('LocalSpecularImage', 'Image', marker);
  return marker;
}
function setArrow(marker, arrow) {
  marker.classes.delete('arrowUp');
  marker.classes.delete('arrowDown');
  marker.classes.add(arrow);
}

function createProfile(seed = {}) {
  return { disk: new Map(Object.entries(Object.assign({}, HPV2_KEYS, seed))) };
}

// A checksum-valid record, independent of the runtime's encoder.
function record(body) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) { hash ^= body.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return `BTS1.${hash.toString(16).padStart(8, '0')}.${body}`;
}

// One game launch: fresh settings VM, scheduler and panels; the profile disk alone survives restart.
// options.withTimer boots rejuvnbufftimer.js first (as hud_minimap.xml does); options.settings === false skips the
// settings script. Each script instance gets its own sandbox whose $ shares properties set by the other script.
function launch(profile, options = {}) {
  const opts = Object.assign({ commit: true, navSec: 0.8, replySec: 0.05, echoSec: 0.12, version: null, href: null, dropWrite: () => false }, options);
  const scheduled = [];
  let now = 0;
  let nextId = 0;
  let instance = 0;
  const schedule = (delaySec, callback, owner = 0) => {
    const item = { id: ++nextId, due: now + Math.max(0, Number(delaySec) || 0) * 1000, callback, owner, cancelled: false };
    scheduled.push(item);
    return item.id;
  };
  const cancel = (handle) => { const item = scheduled.find((entry) => entry.id === handle); if (item) item.cancelled = true; };
  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      scheduled.sort((a, b) => a.due - b.due || a.id - b.id);
      const index = scheduled.findIndex((item) => !item.cancelled && item.due <= target);
      if (index < 0) break;
      const [item] = scheduled.splice(index, 1);
      now = item.due;
      item.callback();
    }
    now = target;
  };

  const ids = Object.create(null);
  const topPanel = makePanel('Root', 'Panel');
  const rootPanel = makePanel('Hud', 'CitadelHud', topPanel);
  const hudCore = makePanel('HudCore', 'Panel', rootPanel);
  hudCore.AddClass('HudCore');
  const clamp = makePanel('', 'Panel', hudCore);
  clamp.AddClass('clamp_width');
  const persp = makePanel('minimap_persp', 'GlobalClassListener', clamp);
  const minimapContainer = makePanel('minimap_container', 'Panel', persp);
  // Stock hud.xml order: the blur backdrop and the ring frame draw under HudMinimapContainer.
  const minimapBlur = makePanel('minimap_blur', 'Panel', minimapContainer);
  const minimapFrame = makePanel('minimap_frame', 'Panel', minimapContainer);
  const overlay = makePanel('HudMinimapContainer', 'Panel', minimapContainer);
  const minimap = makePanel('hud_minimap', 'Panel', overlay);
  const glowClip = makePanel('MinimapGlowClip', 'Panel', overlay);
  for (const panel of [topPanel, rootPanel, hudCore, clamp]) {
    panel.win = { x: 0, y: 0 };
    panel.actuallayoutwidth = 1600;
    panel.actuallayoutheight = 900;
  }
  // #minimap_persp (440x520 layout px, margin-bottom 15) is anchored bottom-right of the 1600x900 layer. Inside it the
  // round minimap (#minimap_container, 400px at ui-scale 105% = 420 layout px, centred) starts 90 px down and the
  // 440px BTTimerDock sits at its bottom. Inline ui-scale scales all of it; inline horizontalAlign left + verticalAlign
  // top + position "Xpx Ypx" places its top-left at X,Y layer px instead. Both are laid out on the next frame like the
  // engine does, so a measurement in the same call still sees the old geometry. opts.dockBaseW: a HUD mod that
  // widens #minimap_persp (the dock is width 100%, height 440px).
  const perspStyle = {};
  let dockPanel = null;
  // Stock #minimap_location (hud.xml: the "district : building" label, 150x22 here). Stock CSS aligns it bottom-centre
  // with margin-left 240 and margin-bottom 45, so its box sits at persp px ((W + 240) / 2 - 75, 453), and turns it
  // with transform: rotateZ(-30deg). It is laid out only while an ancestor has in_map_district (next frame, like the
  // engine). opts.noLocation: a hud.xml mod without it. opts.locationHidden: the label stays collapsed whatever class
  // the script adds (whether in_map_district on #minimap_persp reveals it in game is unverified). It is created only
  // after both scripts have run: hud_minimap.xml (and its scripts) loads inside #minimap_container, before hud.xml
  // builds the later sibling #minimap_location (live 2026-10-10: a lookup at timer boot found nothing, "loc none").
  let location = null;
  const locationLayout = () => {
    if (!location) return;
    const s = perspStyle.uiScale ? parseFloat(perspStyle.uiScale) / 100 : 1;
    const baseW = opts.dockBaseW || 440;
    const shown = !opts.locationHidden && (persp.classes.has('in_map_district') || rootPanel.classes.has('in_map_district'));
    location.actualuiscale_x = SCALE * s;
    location.actualuiscale_y = SCALE * s;
    location.actualxoffset = shown ? ((baseW + 240) / 2 - 75) * SCALE * s : 0;
    location.actualyoffset = shown ? 453 * SCALE * s : 0;
    location.actuallayoutwidth = shown ? 150 * SCALE * s : 0;
    location.actuallayoutheight = shown ? 22 * SCALE * s : 0;
  };
  for (const name of ['SetHasClass', 'AddClass', 'RemoveClass']) {
    for (const owner of [persp, rootPanel]) {
      const original = owner[name];
      owner[name] = (...args) => { original(...args); schedule(0.016, locationLayout); };
    }
  }
  const perspLayout = () => {
    const s = perspStyle.uiScale ? parseFloat(perspStyle.uiScale) / 100 : 1;
    const baseW = opts.dockBaseW || 440;
    const pos = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(perspStyle.position || ''));
    const moved = perspStyle.horizontalAlign === 'left' && perspStyle.verticalAlign === 'top' && pos;
    const x0 = moved ? Number(pos[1]) * SCALE : 1600 - baseW * SCALE * s;
    const y0 = moved ? Number(pos[2]) * SCALE : 900 - 15 * SCALE * s - 520 * SCALE * s;
    persp.win = { x: x0, y: y0 };
    persp.actuallayoutwidth = baseW * SCALE * s;
    persp.actuallayoutheight = 520 * SCALE * s;
    minimapContainer.win = { x: x0 + (baseW - 420) / 2 * SCALE * s, y: y0 + 90 * SCALE * s };
    minimapContainer.actuallayoutwidth = 420 * SCALE * s;
    minimapContainer.actuallayoutheight = 420 * SCALE * s;
    locationLayout();
    if (dockPanel && !opts.dockWin) {
      dockPanel.win = { x: x0, y: y0 + 80 * SCALE * s };
      dockPanel.actuallayoutwidth = baseW * SCALE * s;
      dockPanel.actuallayoutheight = 440 * SCALE * s;
    }
  };
  perspLayout();
  // align is the base of the two alignment aliases: null clears both, "h v" sets both.
  Object.defineProperty(persp.style, 'align', {
    enumerable: false,
    get: () => (perspStyle.horizontalAlign || perspStyle.verticalAlign ? `${perspStyle.horizontalAlign} ${perspStyle.verticalAlign}` : null),
    set: (value) => {
      stats.perspWrites = (stats.perspWrites || 0) + 1;
      const [h, v] = value === null ? [null, null] : String(value).split(/\s+/);
      perspStyle.horizontalAlign = h;
      perspStyle.verticalAlign = v === undefined ? null : v;
      schedule(0.016, perspLayout);
    },
  });
  for (const property of ['uiScale', 'horizontalAlign', 'verticalAlign', 'position']) {
    Object.defineProperty(persp.style, property, {
      enumerable: true,
      get: () => perspStyle[property],
      set: (value) => {
        stats.perspWrites = (stats.perspWrites || 0) + 1;
        perspStyle[property] = value === null ? null : String(value);
        schedule(0.016, perspLayout);
      },
    });
  }
  const topBar = makePanel('TopBar', 'Panel', rootPanel);
  const clock = makePanel('GameTime', 'Label', topBar);
  clock.text = opts.clock === undefined ? '' : opts.clock;
  topBar.FindChildrenWithClassTraverse = (name) => name === 'GameTime' ? [clock] : [];
  if (opts.hideout) rootPanel.AddClass('connectedToHideout');
  ids.Hud = rootPanel;
  ids.HudMinimapContainer = overlay;
  ids.hud_minimap = minimap;
  ids.MinimapGlowClip = glowClip;
  const markers = { up: makeMarker('enemy', 'arrowUp'), down: makeMarker('enemy', 'arrowDown'), ally: makeMarker('friend', 'arrowUp') };
  const mapMarkers = Object.values(markers);
  minimap.FindChildrenWithClassTraverse = (name) => name === 'map_button' ? mapMarkers : [];
  const stats = { urls: [], requests: [], keyAccesses: [], writes: 0, reads: 0, pageLoads: 0, seedEchoes: 0, dropped: [], events: [] };
  const shared = Object.create(null);

  function observe(href) {
    const message = JSON.parse(decodeURIComponent(new URL(href).hash.slice(1)));
    stats.requests.push(message);
    if (message.o === 'w') stats.writes++;
    if (message.o === 'r') stats.reads++;
  }
  function attachStore(store) {
    let page = null;
    let hashchange = null;
    function deliver(title) {
      let text = String(title);
      const message = JSON.parse(text.slice(5));
      if (message.o === 'ready') {
        if (opts.version !== null) message.v = opts.version;
        if (opts.href !== null) message.h = opts.href;
        text = `BTS1:${JSON.stringify(message)}`;
      }
      // The page has committed; only its reply is lost. stats.writes is this write's ordinal.
      if (message.o === 'w' && opts.dropWrite(stats.writes)) return;
      const fire = () => store.events.HTMLTitle?.(store, text);
      schedule(opts.replySec, fire);
      if (opts.echoSec !== null) schedule(opts.replySec + opts.echoSec, fire);
    }
    function commit(href) {
      stats.pageLoads++;
      const localStorage = {
        getItem: (key) => { stats.keyAccesses.push(key); return profile.disk.has(key) ? profile.disk.get(key) : null; },
        setItem: (key, value) => { stats.keyAccesses.push(key); profile.disk.set(key, String(value)); },
        removeItem: (key) => { stats.keyAccesses.push(key); profile.disk.delete(key); },
      };
      const context = {
        JSON, Math, String, Number, decodeURIComponent, localStorage,
        location: { href, hash: new URL(href).hash },
        addEventListener: (event, callback) => { if (event === 'hashchange') hashchange = callback; },
        document: { set title(value) { deliver(value); } },
      };
      context.window = context;
      page = vm.createContext(context);
      observe(href);
      vm.runInContext(pageSource, page, { filename: 'hpv2-store/bt/index.html' });
    }
    store.SetURL = (url) => {
      const text = String(url);
      assert.ok(text.startsWith(`${PAGE_URL}#`), 'transport must only address the /bt/ HTTPS page');
      stats.urls.push(text);
      if (page) {
        page.location.href = text;
        page.location.hash = new URL(text).hash;
        observe(text);
        hashchange();
      } else if (opts.commit) {
        schedule(opts.navSec, () => { if (!page) commit(text); });
      }
    };
  }

  // BLoadLayout applies its root to the host; ids are parsed from the real, script-less XML.
  // A Slider behaves like the engine's: assigning .value fires onvaluechanged on a later frame.
  function makeSlider(panel) {
    let value = 0;
    Object.defineProperty(panel, 'value', {
      get: () => value,
      set: (next) => {
        if (next === value) return;
        value = next;
        schedule(0, () => { stats.seedEchoes++; panel.events.onvaluechanged?.(); });
      },
    });
    panel.min = 0;
    panel.max = 1;
    panel.increment = 0.1;
    panel.drag = (next) => { value = next; panel.events.onvaluechanged?.(); };
  }
  function create(type, parent, id) {
    const panel = makePanel(id, type, parent);
    if (id) ids[id] = panel;
    if (type === 'Slider') makeSlider(panel);
    if (id === 'BTTimerDock') {
      panel.win = Object.assign({}, opts.dockWin || { x: 1233.33, y: 520.83 });
      panel.actuallayoutwidth = (opts.dockBaseW || 440) * SCALE;
      panel.actuallayoutheight = 366.67;
      dockPanel = panel;
      if (!opts.dockWin) perspLayout();
    }
    if (id === 'TimerOverlayFrame') {
      panel.actuallayoutwidth = 1600;
      panel.actuallayoutheight = 900;
    }
    if (TIMER_LAYOUTS[id]) {
      panel.BLoadLayout = (layoutPath, a, b) => {
        assert.equal(layoutPath, `file://{resources}/layout/${TIMER_LAYOUTS[id]}`);
        assert.equal(a, false);
        assert.equal(b, false);
        loadLayoutInto(panel, read('panorama', 'layout', TIMER_LAYOUTS[id]), ids);
        return true;
      };
    }
    if (id === 'BTMinimapSettingsHost') {
      // The real host is width/height 100% of HudCore.
      panel.actuallayoutwidth = 1600;
      panel.actuallayoutheight = 900;
      panel.BLoadLayout = (layoutPath, a, b) => {
        assert.equal(layoutPath, 'file://{resources}/layout/bt_minimap_settings.xml');
        assert.equal(a, false);
        assert.equal(b, false);
        loadLayoutInto(panel, settingsLayout, ids, (child) => { if (child.id === 'BTSettingsStore') attachStore(child); });
        assert.deepEqual(panelIds.filter((name) => !panel.FindChildTraverse(name)), [], 'layout mock creates every control');
        return true;
      };
    }
    return panel;
  }
  function makeDollar(owner) {
    const own = {
      Schedule: (delay, callback) => schedule(delay, callback, owner),
      CancelScheduled: cancel,
      GetContextPanel: () => minimap,
      DispatchEvent: (name, panel) => {
        stats.events.push(name);
        if (name === 'DropInputFocus') stats.dropped.push(panel?.id);
      },
      Msg: () => {},
      RegisterEventHandler: (name, panel, fn) => { panel.events[name] = fn; },
      CreatePanel: create,
    };
    // Properties one script sets on $ (e.g. $["BTTimerLayout"]) are visible to the other, as in one layout.
    return new Proxy(own, {
      get: (target, key) => (key in target ? target[key] : shared[key]),
      set: (target, key, value) => { shared[key] = value; return true; },
    });
  }
  function runScript(code, filename) {
    const owner = ++instance;
    const sandbox = { module: { exports: {} }, exports: {}, console, globalThis: {}, WeakMap, Date: { now: () => now }, $: makeDollar(owner) };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename });
    if (!MINIFIED) assert.ok(sandbox.module.exports.__test, `${filename} test exports must be present`);
    return sandbox.module.exports.__test || null;
  }
  const startInstance = () => runScript(source, 'bt_minimap_settings.js');
  const startTimer = () => runScript(timerSource, 'rejuvnbufftimer.js');
  const game = {
    advance, stats, ids, markers, minimap, hudCore, overlay, mapMarkers, clamp, persp, rootPanel, clock, shared,
    minimapContainer, minimapBlur, minimapFrame, location: null,
    timer: opts.withTimer ? startTimer() : null,
    test: null,
    state: () => game.test.getState(),
    click: (id, event = 'onactivate') => {
      const handler = ids[id]?.events[event];
      assert.equal(typeof handler, 'function', `#${id} ${event} must be bound`);
      handler();
    },
    toggleMenu: () => game.click('BTSettingsGear'),
    toggleLinger: () => game.click('BTLingerToggle'),
    toggleGlow: () => game.click('BTGlowToggle'),
    reset: () => game.click('BTSettingsReset'),
    openPicker: (dir) => game.click(dir === 'up' ? 'BTUpColor' : 'BTDownColor'),
    select: (dir) => { if (game.state().picker !== dir) game.openPicker(dir); },
    chip: (index) => game.click(`BTPreset${index}`),
    slide: (value) => { assert.equal(typeof ids.BTSpectrum?.drag, 'function', 'spectrum slider exists'); ids.BTSpectrum.drag(value); },
    typeHex: (text) => { ids.BTColorHexEntry.text = text; game.click('BTColorHexEntry', 'ontextentrysubmit'); },
    pick: (dir, hex) => { game.select(dir); game.typeHex(hex); },
    washes: () => ({ up: markers.up.image.style.washColor, down: markers.down.image.style.washColor, ally: markers.ally.image.style.washColor }),
    liveHosts: () => hudCore.Children().filter((child) => child.id === 'BTMinimapSettingsHost'),
    liveCallbacks: (owner) => scheduled.filter((item) => item.owner === owner && !item.cancelled).length,
    bootSecond: () => { const old = game.test; game.test = startInstance(); return old; },
    bootTimerAgain: () => { const old = game.timer; game.timer = startTimer(); return old; },
    instances: () => instance,
  };
  if (opts.settings !== false) game.test = startInstance();
  if (!opts.noLocation) {
    location = makePanel('minimap_location', 'Panel', persp);
    game.location = location;
    locationLayout();
  }
  return game;
}

module.exports = {
  root, read, source, timerSource, settingsLayout, PAGE_PATH, pageSource, PAGE_URL, KEY, HPV2_KEYS, panelIds,
  SCALE, FLT_MAX, makePanel, makeMarker, setArrow, createProfile, record, launch,
};
