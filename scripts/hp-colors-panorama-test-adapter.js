'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const hpColorsContractSource = fs.readFileSync(
  path.resolve(__dirname, '../hp_colors_rewrite/panorama/scripts/hp_colors_contract.js'),
  'utf8',
);

class ClassSet extends Set {
  includes(value) { return this.has(value); }
  join(separator) { return Array.from(this).join(separator); }
  toJSON() { return Array.from(this); }
}

function makeClassSet(classes) {
  if (classes instanceof Set) return new ClassSet(classes);
  return new ClassSet(Array.isArray(classes) ? classes : []);
}
function incrementCounter(counters, key) {
  if (counters) counters[key] = (counters[key] || 0) + 1;
}


class MockPanel {
  constructor(first = '', second = {}, third = undefined) {
    let type = 'Panel';
    let id = '';
    let parent = null;
    let options = {};

    if (third !== undefined) {
      type = first || 'Panel';
      parent = second === true ? null : second;
      id = third || '';
    } else if (second instanceof MockPanel || second === true || second === null) {
      id = first || '';
      parent = second === true ? null : second;
    } else {
      id = first || '';
      options = second || {};
      type = options.type || options.paneltype || 'Panel';
      parent = options.parent || null;
    }

    this.type = type;
    this.paneltype = type;
    this.id = id;
    this.parent = null;
    this.children = [];
    this.events = {};
    this.options = [];
    this.selected = null;
    this.attributes = Object.assign(Object.create(null), options.attributes || options.attrs || {});
    this.attrs = this.attributes;
    this.valid = options.valid !== undefined ? Boolean(options.valid) : true;
    Object.defineProperty(this, '__text', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: options.text || '',
    });
    Object.defineProperty(this, 'text', {
      configurable: true,
      enumerable: true,
      get: () => {
        incrementCounter(this.operationCounts, 'textReads');
        return this.__text;
      },
      set: (value) => {
        incrementCounter(this.operationCounts, 'textWrites');
        this.__text = value;
      },
    });
    this.placeholder = options.placeholder || '';
    this.visible = options.visible !== undefined ? Boolean(options.visible) : true;
    this.canfocus = Boolean(options.canfocus);
    this.focused = false;
    this.actualxoffset = options.actualxoffset || 0;
    this.actualyoffset = options.actualyoffset || 0;
    this.scrolloffset_x = options.scrolloffset_x || 0;
    this.scrolloffset_y = options.scrolloffset_y || 0;
    this.actualuiscale_x = options.actualuiscale_x || 1;
    this.actualuiscale_y = options.actualuiscale_y || 1;
    this.sendScrollPositionChangedEvents = false;
    this._actualLayoutWidth = options.actuallayoutwidth === undefined ? 120 : options.actuallayoutwidth;
    this.layoutWidthReads = 0;
    Object.defineProperty(this, 'actuallayoutwidth', {
      configurable: true,
      enumerable: true,
      get: () => {
        this.layoutWidthReads += 1;
        incrementCounter(this.operationCounts, 'layoutWidthReads');
        return this._actualLayoutWidth;
      },
      set: (value) => {
        this._actualLayoutWidth = value;
      },
    });
    this._actualLayoutHeight = options.actuallayoutheight === undefined ? 32 : options.actuallayoutheight;
    this.layoutHeightReads = 0;
    this.contentwidth = options.contentwidth === undefined ? this._actualLayoutWidth : options.contentwidth;
    this.contentheight = options.contentheight === undefined ? this._actualLayoutHeight : options.contentheight;
    this.findCounts = options.findCounts || null;
    this.childReadCounts = options.childReadCounts || null;
    this.eventSetCounter = options.eventSetCounter || null;
    this.operationCounts = options.operationCounts || null;
    this.classReadCount = 0;
    this.__styleWrites = [];
    this.__deletedStyleWrites = [];
    this.explicitHitFlags = {};
    this._hittest = options.hittest === undefined ? true : Boolean(options.hittest);
    this._hittestchildren = options.hittestchildren === undefined ? true : Boolean(options.hittestchildren);
    Object.defineProperty(this, 'hittest', {
      configurable: true,
      enumerable: true,
      get: () => this._hittest,
      set: (value) => {
        this.explicitHitFlags.hittest = true;
        this._hittest = value;
      },
    });
    Object.defineProperty(this, 'hittestchildren', {
      configurable: true,
      enumerable: true,
      get: () => this._hittestchildren,
      set: (value) => {
        this.explicitHitFlags.hittestchildren = true;
        this._hittestchildren = value;
      },
    });
    Object.defineProperty(this, 'classes', {
      configurable: true,
      enumerable: true,
      get: () => this.__classes,
      set: (value) => { this.__classes = makeClassSet(value); },
    });
    this.classes = options.classes || [];

    const initialStyle = Object.assign({}, options.style || {});
    this.style = new Proxy(initialStyle, {
      get: (target, property, receiver) => {
        incrementCounter(this.operationCounts, 'styleReads');
        return Reflect.get(target, property, receiver);
      },
      set: (target, property, value) => {
        const prop = String(property);
        incrementCounter(this.operationCounts, 'styleWrites');
        this.__styleWrites.push({ property: prop, value });
        target[property] = value === null ? '' : value;
        return true;
      },
      deleteProperty: (target, property) => {
        const prop = String(property);
        incrementCounter(this.operationCounts, 'styleWrites');
        this.__styleWrites.push({ property: prop, value: undefined });
        delete target[property];
        return true;
      },
    });
    Object.defineProperty(this, 'styleWrites', {
      configurable: true,
      enumerable: false,
      get: () => this.__styleWrites,
    });

    if (parent) this.SetParent(parent);
  }

  get actuallayoutheight() {
    this.layoutHeightReads += 1;
    return this._actualLayoutHeight;
  }
  set actuallayoutheight(value) { this._actualLayoutHeight = value; }

  add(child) {
    if (!child) return child;
    child.SetParent(this);
    return child;
  }
  IsValid() { return this.valid; }
  GetParent() {
    incrementCounter(this.operationCounts, 'parentReads');
    return this.parent;
  }
  GetPositionWithinWindow() {
    let x = 0;
    let y = 0;
    for (let panel = this; panel && panel.IsValid(); panel = panel.GetParent()) {
      x += Number(panel.actualxoffset || 0) - Number(panel.scrolloffset_x || 0);
      y += Number(panel.actualyoffset || 0) - Number(panel.scrolloffset_y || 0);
    }
    return {
      x: x * this.actualuiscale_x,
      y: y * this.actualuiscale_y,
    };
  }
  SetSendScrollPositionChangedEvents(enabled) {
    this.sendScrollPositionChangedEvents = Boolean(enabled);
  }
  Children() {
    incrementCounter(this.operationCounts, 'traversal');
    incrementCounter(this.operationCounts, 'childrenReads');
    if (this.childReadCounts) {
      const key = this.id || '(anonymous)';
      this.childReadCounts[key] = (this.childReadCounts[key] || 0) + 1;
      this.childReadCounts.__allocations = (this.childReadCounts.__allocations || 0) + 1;
    }
    return this.children.slice();
  }
  GetChildCount() {
    incrementCounter(this.operationCounts, 'traversal');
    return this.children.length;
  }
  GetChild(index) {
    incrementCounter(this.operationCounts, 'traversal');
    incrementCounter(this.operationCounts, 'childrenReads');
    return this.children[index] || null;
  }
  SetParent(parent) {
    incrementCounter(
      this.operationCounts || (parent && parent.operationCounts),
      'parentWrites',
    );
    if (this.parent && this.parent.children) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = parent || null;
    if (parent && parent.children && !parent.children.includes(this)) {
      parent.children.push(this);
      if (!this.findCounts) this.findCounts = parent.findCounts || null;
      if (!this.childReadCounts) this.childReadCounts = parent.childReadCounts || null;
      if (!this.eventSetCounter) this.eventSetCounter = parent.eventSetCounter || null;
      if (!this.operationCounts) this.operationCounts = parent.operationCounts || null;
    }
  }
  DeleteAsync() {
    incrementCounter(this.operationCounts, 'parentWrites');
    this.valid = false;
    if (this.parent && this.parent.children) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
    this.children = [];
    this.options = [];
    this.selected = null;
  }
  RemoveAndDeleteChildren() {
    for (const child of this.children) {
      incrementCounter(child.operationCounts || this.operationCounts, 'parentWrites');
      child.valid = false;
      child.parent = null;
    }
    this.children = [];
    this.options = [];
    this.selected = null;
  }
  AddClass(className) {
    incrementCounter(this.operationCounts, 'classWrites');
    this.classes.add(String(className));
  }
  RemoveClass(className) {
    incrementCounter(this.operationCounts, 'classWrites');
    this.classes.delete(String(className));
  }
  BHasClass(className) {
    this.classReadCount += 1;
    incrementCounter(this.operationCounts, 'classReads');
    return this.classes.has(String(className));
  }
  SetHasClass(className, enabled) { enabled ? this.AddClass(className) : this.RemoveClass(className); }
  ToggleClass(className) { this.SetHasClass(className, !this.BHasClass(className)); }
  SetPanelEvent(eventName, handler) {
    this.events[eventName] = handler;
    if (this.eventSetCounter) this.eventSetCounter.count += 1;
  }
  SetDisableFocusOnMouseDown() {}
  SetFocus() { this.focused = true; }
  SelectAll() { this.allSelected = true; }
  AddOption(panel) {
    if (!panel) return;
    if (!this.options.includes(panel)) this.options.push(panel);
    if (panel.parent !== this) panel.SetParent(this);
  }
  RemoveOption(id) { this.options = this.options.filter((option) => option.id !== id); }
  RemoveAllOptions() { this.options = []; this.selected = null; }
  HasOption(id) { return this.options.some((option) => option.id === id); }
  GetSelected() { return this.selected; }
  SetSelected(panelOrId) {
    if (typeof panelOrId === 'string') {
      if (this.ignoreStringSetSelected) return;
      this.selected = this.FindChildTraverse(panelOrId);
    } else {
      this.selected = panelOrId || null;
    }
  }
  FindDropDownMenuChild(id) { return this.FindChildTraverse(id); }
  AccessDropDownMenu() { return this; }
  SetImage(src) { this.src = src; }
  SetAttributeString(key, value) { this.attributes[key] = String(value); }
  GetAttributeString(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(this.attributes, key)) return this.attributes[key];
    if (key === 'text') return this.text || fallback || '';
    if (key === 'id') return this.id || fallback || '';
    return fallback || '';
  }
  FindChildTraverse(id) {
    incrementCounter(this.operationCounts, 'traversal');
    incrementCounter(this.operationCounts, 'findTraversals');
    if (this.findCounts) this.findCounts[id] = (this.findCounts[id] || 0) + 1;
    if (!this.valid) return null;
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }
  FindChildrenWithClassTraverse(className) {
    incrementCounter(this.operationCounts, 'traversal');
    incrementCounter(this.operationCounts, 'findTraversals');
    if (this.findCounts) this.findCounts[className] = (this.findCounts[className] || 0) + 1;
    let out = [];
    if (this.valid) {
      incrementCounter(this.operationCounts, 'classReads');
      if (this.classes.has(className)) out.push(this);
    }
    for (const child of this.children) out = out.concat(child.FindChildrenWithClassTraverse(className));
    return out;
  }
}

function createScheduler(harness) {
  const jobs = [];
  let order = 0;
  function sortJobs() { jobs.sort((a, b) => a.due - b.due || a.order - b.order); }
  const scheduler = {
    jobs,
    schedule(delay, fn) {
      const delaySec = Number(delay) || 0;
      const job = {
        delay,
        due: harness.now + Math.max(0, delaySec) * 1000,
        dueAt: harness.now + Math.max(0, delaySec) * 1000,
        fn,
        handler: fn,
        order: order += 1,
      };
      jobs.push(job);
      return job;
    },
    cancel(job) {
      const index = jobs.indexOf(job);
      if (index < 0) return false;
      jobs.splice(index, 1);
      return true;
    },
    takeNext() {
      sortJobs();
      return jobs.shift() || null;
    },
    runNext() {
      const job = scheduler.takeNext();
      assert.ok(job, 'expected a scheduled callback');
      harness.now = Math.max(harness.now, Number(job.due) || harness.now);
      job.fn();
      return job;
    },
    runByDelay(delay) {
      const index = jobs.findIndex((job) => Number(job && job.delay) === Number(delay));
      assert.notEqual(index, -1, `No scheduled validation job found for delay ${delay}`);
      const job = jobs.splice(index, 1)[0];
      harness.now = Math.max(harness.now, Number(job.due) || harness.now);
      job.fn();
      return job;
    },
    runAllByDelay(delay, limit = 20) {
      let count = 0;
      for (; count < limit; count += 1) {
        const index = jobs.findIndex((job) => Number(job && job.delay) === Number(delay));
        if (index < 0) return count;
        const job = jobs.splice(index, 1)[0];
        harness.now = Math.max(harness.now, Number(job.due) || harness.now);
        job.fn();
      }
      return count;
    },
    runUntil(predicate, message, limit = 120) {
      for (let i = 0; i < limit; i += 1) {
        if (predicate()) return;
        scheduler.runNext();
      }
      assert.ok(predicate(), message);
    },
    runUntilBefore(predicate, message, maxElapsedMs, limit = 120) {
      const startMs = harness.now;
      for (let i = 0; i < limit; i += 1) {
        if (predicate()) return;
        assert.ok(jobs.length > 0, `${message}; no scheduled jobs left`);
        sortJobs();
        assert.ok((Number(jobs[0].due) || harness.now) - startMs <= maxElapsedMs, `${message}; exceeded ${maxElapsedMs}ms`);
        scheduler.runNext();
      }
      assert.ok(predicate(), `${message}; exhausted scheduled job limit`);
    },
    runFor(maxElapsedMs, limit = 200) {
      const end = harness.now + maxElapsedMs;
      for (let i = 0; i < limit && jobs.length; i += 1) {
        sortJobs();
        if (jobs[0].due > end) break;
        scheduler.runNext();
      }
      harness.now = end;
    },
    takeByFunctionName(name) {
      const index = jobs.findIndex((job) => job.fn && job.fn.name === name);
      assert.notEqual(index, -1, `expected ${name} callback`);
      return jobs.splice(index, 1)[0];
    },
    nextDelayByFunctionName(name) {
      const job = jobs.find((item) => item.fn && item.fn.name === name);
      assert.ok(job, `expected ${name} callback`);
      return job.delay;
    },
  };
  return scheduler;
}

function createPanoramaHarness(options = {}) {
  const harness = {
    root: null,
    contextPanel: null,
    shared: {},
    dispatches: [],
    handlers: Object.create(null),
    handlerEntries: [],
    unregisterCalls: [],
    nextHandlerId: 1,
    logs: [],
    clipboardWrites: [],
    clipboardText: String(options.clipboardText || ''),
    scheduler: null,
    $: null,
    GameUI: null,
    Game: undefined,
    now: options.now === undefined ? 0 : Number(options.now),
    findCounts: Object.create(null),
    childReadCounts: Object.create(null),
    operationCounts: Object.assign({
      traversal: 0,
      findTraversals: 0,
      childrenReads: 0,
      parentReads: 0,
      parentWrites: 0,
      classReads: 0,
      classWrites: 0,
      styleReads: 0,
      styleWrites: 0,
      textReads: 0,
      textWrites: 0,
      layoutWidthReads: 0,
    }, options.operationCounts || {}),
    createPanelCount: 0,
    eventSetCounter: { count: 0 },
    mouseCallback: null,
    mouseCallbackWrites: 0,
  };
  harness.root = new MockPanel('Root', {
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
    eventSetCounter: harness.eventSetCounter,
    operationCounts: harness.operationCounts,
  });
  harness.root.actuallayoutwidth = options.rootWidth || 1920;
  harness.root.actuallayoutheight = options.rootHeight || 1080;
  harness.root.contentwidth = harness.root.actuallayoutwidth;
  harness.root.contentheight = harness.root.actuallayoutheight;
  harness.contextPanel = options.contextPanel === 'child'
    ? harness.root.add(new MockPanel(options.contextPanelId || 'Context', { findCounts: harness.findCounts, childReadCounts: harness.childReadCounts }))
    : harness.root;
  if (options.shared) Object.assign(harness.shared, options.shared);
  harness.scheduler = createScheduler(harness);
  harness.$ = {
    GetContextPanel: () => harness.contextPanel,
    CreatePanel: (type, parent, id) => {
      harness.createPanelCount += 1;
      return new MockPanel(type, parent === true ? harness.root : parent, id);
    },
    Schedule: (delay, fn) => harness.scheduler.schedule(delay, fn),
    CancelScheduled: (job) => harness.scheduler.cancel(job),
    RegisterForUnhandledEvent: (eventName, handler) => {
      const id = harness.nextHandlerId++;
      harness.handlers[eventName] = handler;
      harness.handlerEntries.push({ id, channel: eventName, eventName, fn: handler, handler });
      return id;
    },
    UnregisterForUnhandledEvent: (eventName, id) => {
      harness.unregisterCalls.push({ eventName, id });
      const index = harness.handlerEntries.findIndex((entry) =>
        entry.channel === eventName && entry.id === id);
      if (index < 0) return;
      const [entry] = harness.handlerEntries.splice(index, 1);
      if (harness.handlers[eventName] === entry.handler) delete harness.handlers[eventName];
    },
    RegisterEventHandler: (eventName, panel, handler) => {
      harness.handlerEntries.push({ channel: eventName, eventName, panel, fn: handler, handler });
      if (panel && typeof panel.SetPanelEvent === 'function') panel.SetPanelEvent(eventName, handler);
    },
    DispatchEvent: (...args) => {
      harness.dispatches.push(args);
      if (args[0] === 'CopyStringToClipboard') {
        if (options.clipboardThrows) throw new Error('clipboard unavailable');
        if (options.clipboardResult === false) return false;
        harness.clipboardWrites.push(String(args[1] || ''));
      }
      if (args[0] === 'TextEntryCopyToClipboard') {
        if (options.textEntryCopyResult === false) return false;
        const source = args[1];
        harness.clipboardWrites.push(String((source && source.text) || ''));
      }
      if (args[0] === 'TextEntryInsertFromClipboard') {
        if (options.clipboardPasteThrows) throw new Error('clipboard paste unavailable');
        if (options.clipboardPasteResult === false) return false;
        const target = args[1];
        if (target) target.text = harness.clipboardText;
      }
      return true;
    },
    DispatchEventAsync: (...args) => { harness.dispatches.push(args); return true; },
    Msg: (message) => { harness.logs.push(String(message)); },
  };
  harness.GameUI = {
    CustomUIConfig: () => harness.shared,
    GetCursorPosition: () => (options.cursorPosition || [0, 0]).slice(0),
    SetMouseCallback: (callback) => {
      harness.mouseCallback = typeof callback === 'function' ? callback : null;
      harness.mouseCallbackWrites += 1;
    },
  };
  if (options.includeGame !== false) {
    let gameState = options.gameState === undefined ? 7 : Number(options.gameState);
    harness.Game = {
      GetState: () => gameState,
      __setState: (value) => { gameState = Number(value); },
    };
  }
  harness.reset = () => {
    harness.dispatches.length = 0;
    harness.handlerEntries.length = 0;
    harness.unregisterCalls.length = 0;
    for (const key of Object.keys(harness.handlers)) delete harness.handlers[key];
    harness.logs.length = 0;
    harness.clipboardWrites.length = 0;
    harness.mouseCallback = null;
    harness.mouseCallbackWrites = 0;
    harness.scheduler.jobs.length = 0;
    for (const key of Object.keys(harness.shared)) delete harness.shared[key];
    for (const key of Object.keys(harness.findCounts)) delete harness.findCounts[key];
    for (const key of Object.keys(harness.childReadCounts)) delete harness.childReadCounts[key];
    harness.createPanelCount = 0;
    harness.eventSetCounter.count = 0;
    harness.root.RemoveAndDeleteChildren();
    harness.root.valid = true;
    harness.contextPanel = harness.root;
    for (const key of Object.keys(harness.operationCounts)) harness.operationCounts[key] = 0;
  };
  return harness;
}

function createVmContext(harness, options = {}) {
  const DateValue = options.Date || class MockDate extends Date { static now() { return harness.now; } };
  const context = {
    console: options.console || console,
    Date: DateValue,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    Buffer,
    parseInt,
    parseFloat,
    isFinite,
    setTimeout,
    clearTimeout,
    GameUI: options.includeGameUI === false ? undefined : harness.GameUI,
    $: harness.$,
    SteamOverlayAPI: { OpenURL: () => {} },
  };
  if (harness.Game) context.Game = harness.Game;
  if (options.globals) Object.assign(context, options.globals);
  context.global = context;
  return context;
}

function runInVm(source, context, filename = 'panorama-test.js') {
  vm.createContext(context);
  return vm.runInContext(source, context, { filename });
}

function runHpColorsContractInVm(context) {
  return runInVm(hpColorsContractSource, context, 'hp_colors_contract.js');
}

function runHpColorsSourcesInVm(stateSource, menuSource, harness, options = {}) {
  const context = createVmContext(harness, options);
  if (options.settingsContractSource) {
    runInVm(options.settingsContractSource, context, 'settings_contract.js');
  } else {
    runHpColorsContractInVm(context);
  }
  runInVm(stateSource, context, 'hp_colors_state.js');
  runInVm(menuSource, context, 'hp_colors_menu.js');
  return context;
}

function encodeBase64Url(value) {
  return Buffer.from(String(value), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlJson(encoded) {
  let input = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return JSON.parse(Buffer.from(input, 'base64').toString('utf8'));
}

function createPresetEntryPanel(id, preset, options = {}) {
  const payload = options.rawPayload !== undefined ? options.rawPayload : Object.assign({}, preset || {});
  const panel = new MockPanel(id, {
    type: options.type || 'Label',
    classes: ['hp_colors_preset_entry'].concat(options.classes || []),
    text: options.encodedText !== undefined ? options.encodedText : encodeBase64Url(JSON.stringify(payload)),
    attributes: options.attributes,
  });
  if (options.parent) panel.SetParent(options.parent);
  return panel;
}

function installPresetStore(harness, presetsOrPanels, options = {}) {
  const root = options.root || harness.root;
  root.children.filter((child) => child && child.id === (options.storeId || 'HPColorsPresetStore')).forEach((child) => child.DeleteAsync());
  const store = new MockPanel(options.storeId || 'HPColorsPresetStore', {
    type: options.type || 'Panel',
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
  });
  root.add(store);
  for (const item of presetsOrPanels || []) {
    if (item instanceof MockPanel) {
      store.add(item);
      continue;
    }
    const payload = {
      version: item.version === undefined ? 1 : item.version,
      name: item.name || item.id,
      category: item.category,
      values: item.values,
    };
    if (item.heroes !== undefined) payload.heroes = item.heroes;
    if (item.heroMode !== undefined) payload.heroMode = item.heroMode;
    if (item.hm !== undefined) payload.hm = item.hm;
    if (item.hs !== undefined) payload.hs = item.hs;
    store.add(createPresetEntryPanel(item.id, payload));
  }
  return store;
}

function installHeroProgressTree(harness, heroClass) {
  const alive = harness.root.add(new MockPanel('gameplay_hud_alive', { findCounts: harness.findCounts }));
  const crosshair = alive.add(new MockPanel('crosshair', { findCounts: harness.findCounts }));
  const progress = crosshair.add(new MockPanel('progress', { findCounts: harness.findCounts }));
  if (heroClass) progress.AddClass(heroClass);
  return progress;
}

function installGameTimeTree(harness, text, options = {}) {
  const topBar = harness.root.add(new MockPanel(options.topBarId || 'TopBar', { findCounts: harness.findCounts }));
  const gameTime = topBar.add(new MockPanel(options.id || 'GameTime', {
    type: options.type || 'Label',
    classes: ['GameTime'].concat(options.classes || []),
    text: String(text || '00:00'),
    attributes: { text: String(text || '00:00') },
    findCounts: harness.findCounts,
  }));
  return gameTime;
}
function installTopBarIdentityTree(harness, options = {}) {
  const root = harness.root;
  const hud = root.add(new MockPanel(options.hudId || 'Hud', {
    classes: options.hudClasses || [],
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
  }));
  const topBar = hud.add(new MockPanel(options.topBarId || 'TopBar', {
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
  }));
  const gameClock = topBar.add(new MockPanel(options.gameClockId || 'GameClock', {
    classes: ['GameClock'].concat(options.gameClockClasses || []),
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
  }));
  const gameTimeText = String(
    options.gameTime === undefined ? '00:00' : options.gameTime,
  );
  const gameTime = gameClock.add(new MockPanel(options.gameTimeId || 'GameTime', {
    type: 'Label',
    classes: ['GameTime'].concat(options.gameTimeClasses || []),
    text: gameTimeText,
    attributes: { text: gameTimeText },
    findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts,
  }));


  function makeLocalPlayerCard(heroName, cardOptions = {}) {
    const card = topBar.add(new MockPanel(cardOptions.id || 'LocalPlayer', {
      classes: ['CitadelHudTopBarPlayer', 'LocalPlayer'].concat(cardOptions.classes || []),
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
    const nameContainer = card.add(new MockPanel(
      cardOptions.nameContainerId || 'PlayerNameNWContainer',
      {
        findCounts: harness.findCounts,
        childReadCounts: harness.childReadCounts,
      },
    ));
    const heroText = String(heroName === undefined ? '' : heroName);
    const heroLabel = nameContainer.add(new MockPanel(
      cardOptions.heroId || 'HeroName',
      {
        type: 'Label',
        classes: ['HeroName'].concat(cardOptions.heroClasses || []),
        text: heroText,
        attributes: { text: heroText },
        findCounts: harness.findCounts,
        childReadCounts: harness.childReadCounts,
      },
    ));
    return {
      card,
      nameContainer,
      heroLabel,
    };
  }

  let localPlayer = makeLocalPlayerCard(options.heroName);
  return {
    hud,
    topBar,
    gameTime,
    get playerCard() { return localPlayer.card; },
    get playerNameNWContainer() { return localPlayer.nameContainer; },
    get heroName() { return localPlayer.heroLabel; },
    setHeroName(value) {
      const text = String(value === undefined ? '' : value);
      localPlayer.heroLabel.text = text;
      localPlayer.heroLabel.SetAttributeString('text', text);
    },
    setGameTime(value) {
      const text = String(value === undefined ? '' : value);
      gameTime.text = text;
      gameTime.SetAttributeString('text', text);
    },
    replaceLocalPlayerCard(heroName, cardOptions = {}) {
      localPlayer.card.DeleteAsync();
      localPlayer = makeLocalPlayerCard(heroName, cardOptions);
      return localPlayer.card;
    },
  };
}


function buildUnitStatusTree(harness, options = {}) {
  const root = harness.root;
  const unitStatus = root.add(new MockPanel('UnitStatus', { classes: options.unitStatusClasses || ['enemy', 'team1'], findCounts: harness.findCounts, childReadCounts: harness.childReadCounts }));
  const infoHealth = unitStatus.add(new MockPanel('InfoHealthContainer', { findCounts: harness.findCounts }));
  const levelContainer = infoHealth.add(new MockPanel('LevelContainer', { findCounts: harness.findCounts }));
  const level = levelContainer.add(new MockPanel('unit_level_label', { text: options.levelText || '12', attributes: { text: options.levelText || '12' }, findCounts: harness.findCounts }));
  const unitInfo = infoHealth.add(new MockPanel('UnitInfoContainer', { findCounts: harness.findCounts }));
  const unitInfoPanel = unitInfo.add(new MockPanel('unit_info_panel', { classes: ['unit_info_panel'], findCounts: harness.findCounts }));
  const ultBackground = unitInfoPanel.add(new MockPanel('unit_info_bg', { findCounts: harness.findCounts }));
  const ult = ultBackground.add(new MockPanel('unit_ult_ready_icon', { findCounts: harness.findCounts }));
  const ultIcon = ult;
  const unitHealthbar = infoHealth.add(new MockPanel('UnitHealthbarContainer', { findCounts: harness.findCounts }));
  const bg = unitHealthbar.add(new MockPanel('unit_healthbar_bg', { findCounts: harness.findCounts }));
  const missing = bg.add(new MockPanel('unit_healthbar_missing', { findCounts: harness.findCounts }));
  const redParent = missing.add(new MockPanel('unit_healthbar_active_parent', { actuallayoutwidth: options.parentWidth === undefined ? 100 : options.parentWidth, actuallayoutheight: 12, findCounts: harness.findCounts }));
  const lagging = redParent.add(new MockPanel('unit_healthbar_lagging', { actuallayoutwidth: options.barWidth === undefined ? 100 : options.barWidth, actuallayoutheight: 12, findCounts: harness.findCounts }));
  const pulseOverlay = redParent.add(new MockPanel('hp_colors_pulse_overlay', { findCounts: harness.findCounts }));
  const rb = lagging;
  const pip = redParent.add(new MockPanel('unit_healthbar_pip_label', { text: options.pipText || '100', attributes: { text: options.pipText || '100' }, findCounts: harness.findCounts }));
  const heal = redParent.add(new MockPanel('unit_healthbar_healing', { findCounts: harness.findCounts }));
  const delta = redParent.add(new MockPanel('unit_healthbar_delta', { findCounts: harness.findCounts }));
  const bulletShield = redParent.add(new MockPanel('unit_healthbar_bullet_shield', {
    actuallayoutwidth: options.bulletShieldWidth === undefined ? 0 : options.bulletShieldWidth,
    findCounts: harness.findCounts,
  }));
  const techShield = redParent.add(new MockPanel('unit_healthbar_tech_shield', {
    actuallayoutwidth: options.techShieldWidth === undefined ? 0 : options.techShieldWidth,
    findCounts: harness.findCounts,
  }));
  const killMarker = unitHealthbar.add(new MockPanel('hp_colors_kill_marker', {
    findCounts: harness.findCounts,
    hittest: false,
  }));
  const counterAnchor = unitStatus.add(new MockPanel('hp_counter_anchor', { findCounts: harness.findCounts }));
  const counterRow = counterAnchor.add(new MockPanel('hp_counter_row', { findCounts: harness.findCounts }));
  const counter = counterRow.add(new MockPanel('hp_counter', { findCounts: harness.findCounts }));
  const counterMax = counterRow.add(new MockPanel('hp_counter_max', { findCounts: harness.findCounts }));
  const name = root.add(new MockPanel('name', { text: options.nameText || 'Enemy', attributes: { text: options.nameText || 'Enemy' }, findCounts: harness.findCounts }));
  return { root, unitStatus, infoHealth, unitInfo, unitInfoPanel, ultBackground, unitHealthbar, bg, missing, redParent, lagging, rb, pulseOverlay, pip, heal, delta, bulletShield, techShield, ult, ultIcon, levelContainer, level, name, counterAnchor, counterRow, counter, counterMax, killMarker };
}

function findByClass(panel, className, out = []) {
  if (panel && panel.valid && panel.classes && panel.classes.has(className)) out.push(panel);
  for (const child of (panel && panel.children) || []) findByClass(child, className, out);
  return out;
}

function panelHasClass(panel, className) {
  return Boolean(panel && panel.classes && panel.classes.has(className));
}

function getStyleWrites(panel, property) {
  const writes = (panel && panel.__styleWrites) || [];
  return property === undefined ? writes.slice() : writes.filter((write) => write.property === property);
}

function getStyleWriteCount(panel, property) {
  return getStyleWrites(panel, property).length;
}

function assertObjectFields(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(actual[key], value, `${label} expected ${key}=${value}, got ${JSON.stringify(actual)}`);
  }
}

function dispatchClientUiPayload(harness, payload, options = {}) {
  const eventName = options.eventName || 'ClientUI_FireOutput';
  const handler = harness.handlers[eventName] || (harness.handlerEntries.find((entry) => entry.channel === eventName) || {}).fn;
  assert.equal(typeof handler, 'function', `${eventName} handler should be registered`);
  const delivered = options.asString === false || (typeof payload === 'string' && !options.forceString)
    ? payload
    : JSON.stringify(payload);
  handler(delivered);
  return payload;
}

module.exports = {
  MockPanel,
  createPanoramaHarness,
  runHpColorsSourcesInVm,
  runHpColorsContractInVm,
  createVmContext,
  runInVm,
  createPresetEntryPanel,
  installPresetStore,
  installHeroProgressTree,
  installGameTimeTree,
  installTopBarIdentityTree,
  buildUnitStatusTree,
  encodeBase64Url,
  decodeBase64UrlJson,
  findByClass,
  panelHasClass,
  getStyleWriteCount,
  getStyleWrites,
  assertObjectFields,
  dispatchClientUiPayload,
};
