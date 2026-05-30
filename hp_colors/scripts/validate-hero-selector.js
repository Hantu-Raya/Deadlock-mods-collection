#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TARGET = path.join(ROOT, 'hp_colors', 'panorama', 'scripts', 'anita_ui_core.js');
const targetScript = path.resolve(process.argv[2] || DEFAULT_TARGET);

let root = null;
const dispatched = [];
const scheduled = [];
const sharedStore = {};
const eventHandlers = {};
let mockGameState = 6;
const presetStoreLookups = {
  findStore: 0,
  scanEntries: 0
};

class MockPanel {
  constructor(type, parent, id) {
    this.type = type;
    this.paneltype = type;
    this.parent = null;
    this.id = id || '';
    this.children = [];
    this.classes = new Set();
    this.events = {};
    this.attrs = {};
    this.style = {};
    this.options = [];
    this.selected = null;
    this.valid = true;
    this.text = '';
    this.explicitHitFlags = {};
    this._hittest = true;
    this._hittestchildren = true;
    Object.defineProperty(this, 'hittest', {
      get: () => this._hittest,
      set: value => {
        this.explicitHitFlags.hittest = true;
        this._hittest = value;
      }
    });
    Object.defineProperty(this, 'hittestchildren', {
      get: () => this._hittestchildren,
      set: value => {
        this.explicitHitFlags.hittestchildren = true;
        this._hittestchildren = value;
      }
    });
    this.visible = true;
    this.canfocus = false;
    this.actualxoffset = 0;
    this.actualyoffset = 0;
    this.actuallayoutwidth = 120;
    this.actuallayoutheight = 32;
    this.contentwidth = 120;
    this.contentheight = 32;
    if (parent === true) parent = root;
    if (parent && parent.children) this.SetParent(parent);
  }

  IsValid() { return this.valid; }
  GetParent() { return this.parent; }
  Children() { return this.children.slice(); }
  GetChildCount() { return this.children.length; }
  GetChild(index) { return this.children[index] || null; }
  AddClass(className) { this.classes.add(className); }
  RemoveClass(className) { this.classes.delete(className); }
  BHasClass(className) { return this.classes.has(className); }
  SetHasClass(className, enabled) { enabled ? this.AddClass(className) : this.RemoveClass(className); }
  ToggleClass(className) { this.SetHasClass(className, !this.BHasClass(className)); }
  SetPanelEvent(eventName, handler) { this.events[eventName] = handler; }
  SetDisableFocusOnMouseDown() {}
  SetFocus() { this.focused = true; }
  AddOption(panel) {
    if (!panel) return;
    if (!this.options.includes(panel)) this.options.push(panel);
    if (panel.parent !== this) panel.SetParent(this);
  }
  RemoveOption(id) {
    this.options = this.options.filter(option => option.id !== id);
  }
  RemoveAllOptions() {
    this.options = [];
    this.selected = null;
  }
  HasOption(id) {
    return this.options.some(option => option.id === id);
  }
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
  SetAttributeString(key, value) { this.attrs[key] = String(value); }
  GetAttributeString(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : fallback;
  }

  SetParent(parent) {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = parent;
    if (parent && parent.children && !parent.children.includes(this)) parent.children.push(this);
  }

  FindChildTraverse(id) {
    if (id === 'HPColorsPresetStore') presetStoreLookups.findStore += 1;
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }

  FindChildrenWithClassTraverse(className) {
    if (className === 'hp_colors_preset_entry') presetStoreLookups.scanEntries += 1;
    let out = [];
    if (this.classes.has(className)) out.push(this);
    for (const child of this.children) out = out.concat(child.FindChildrenWithClassTraverse(className));
    return out;
  }

  DeleteAsync() {
    this.valid = false;
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.children = [];
  }

  RemoveAndDeleteChildren() {
    for (const child of this.children) child.valid = false;
    this.children = [];
    this.options = [];
    this.selected = null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resetPresetStoreLookupCounters() {
  presetStoreLookups.findStore = 0;
  presetStoreLookups.scanEntries = 0;
}

function findByClass(panel, className, out = []) {
  if (panel.valid && panel.classes && panel.classes.has(className)) out.push(panel);
  for (const child of panel.children || []) findByClass(child, className, out);
  return out;
}

function decodeBase64UrlPayload(encoded) {
  assert(encoded, 'Copied token missing encoded payload');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lookup = Object.fromEntries([...chars].map((ch, index) => [ch, index]));
  const bytes = [];
  for (let i = 0; i < encoded.length; i += 4) {
    const c0 = lookup[encoded[i]];
    const c1 = lookup[encoded[i + 1]];
    const c2 = encoded[i + 2] !== undefined ? lookup[encoded[i + 2]] : 0;
    const c3 = encoded[i + 3] !== undefined ? lookup[encoded[i + 3]] : 0;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (encoded[i + 2] !== undefined) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (encoded[i + 3] !== undefined) bytes.push(((c2 & 3) << 6) | c3);
  }
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

function decodePresetToken(token) {
  return decodeBase64UrlPayload(String(token || '').split(']:')[1]);
}

function decodeCopiedBundleToken() {
  const copied = dispatched.find(args => args[0] === 'CopyStringToClipboard' &&
    /^[A-Za-z0-9_-]+$/.test(String(args[1] || '')) &&
    !String(args[1] || '').includes('[ANITA-v1-hp_colors]:'));
  assert(copied, 'No copied bundle token');
  return decodeBase64UrlPayload(copied[1]);
}

function encodePresetStorePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function installMockPresetStore(presetsOverride) {
  const store = new MockPanel('Panel', root, 'HPColorsPresetStore');
  const presets = presetsOverride || [
    {
      id: 'HPColorsPreset_001',
      name: 'Main Hunt 2',
      category: 'Builder VPK',
      values: { hp_enabled: false, hp_low_threshold: 25 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Shift',
      category: 'Builder VPK',
      values: { hp_enabled: true, hp_low_threshold: 45 }
    }
  ];
  for (const preset of presets) {
    const entry = new MockPanel('Label', store, preset.id);
    entry.AddClass('hp_colors_preset_entry');
    const payload = {
      version: 1,
      name: preset.name,
      category: preset.category,
      values: preset.values
    };
    if (preset.heroes) payload.heroes = preset.heroes;
    if (preset.heroMode) payload.hm = preset.heroMode;
    entry.text = encodePresetStorePayload(payload);
  }
  return store;
}

function copiedHpToken() {
  return dispatched.find(args => args[0] === 'CopyStringToClipboard' &&
    String(args[1] || '').includes('[ANITA-v1-hp_colors]:'));
}

function runNextScheduledByDelay(delay) {
  const index = scheduled.findIndex(job => Number(job && job.delay) === Number(delay));
  assert(index >= 0, `No scheduled validation job found for delay ${delay}`);
  const job = scheduled.splice(index, 1)[0];
  if (job && typeof job.handler === 'function') job.handler();
}

function runScheduledUntil(predicate, message, limit = 40) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return;
    assert(scheduled.length > 0, `${message}; no scheduled jobs left`);
    scheduled.sort((a, b) => Number(a.delay || 0) - Number(b.delay || 0));
    const job = scheduled.shift();
    if (job && typeof job.handler === 'function') job.handler();
  }
  assert(predicate(), `${message}; exhausted scheduled job limit`);
}

function installMockHeroProgress(heroId) {
  const alive = new MockPanel('Panel', root, 'gameplay_hud_alive');
  const crosshair = new MockPanel('Panel', alive, 'crosshair');
  const progress = new MockPanel('Panel', crosshair, 'progress');
  if (heroId) progress.AddClass(heroId);
  return progress;
}

function installMockGameTime(text) {
  const topBar = new MockPanel('Panel', root, 'TopBar');
  const gameTime = new MockPanel('Label', topBar, 'GameTime');
  gameTime.AddClass('GameTime');
  gameTime.text = String(text || '00:00');
  return gameTime;
}

function decodedBulkUpdates() {
  return dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .filter(Boolean)
    .filter(payload => payload.magic_word === 'ANITA_BULK_UPDATE');
}

function assertBakedPresetPayloadMeta(payload, label) {
  assert(payload && payload.update_source === 'baked_preset_apply', `${label} should be a baked preset payload`);
  assert(payload.force_emit === true, `${label} missing force_emit=true: ${JSON.stringify(payload)}`);
  assert(payload.bulk_emit === true, `${label} missing bulk_emit=true: ${JSON.stringify(payload)}`);
  assert(payload.force_persist === true, `${label} missing force_persist=true: ${JSON.stringify(payload)}`);
  assert(typeof payload.hero_id === 'string' && payload.hero_id.length > 0,
    `${label} missing hero_id: ${JSON.stringify(payload)}`);
  assert(typeof payload.preset_key === 'string' && payload.preset_key.length > 0,
    `${label} missing preset_key: ${JSON.stringify(payload)}`);
}

function findBakedPresetUpdate(updates, predicate, message) {
  const payload = updates.find(item => item.update_source === 'baked_preset_apply' && predicate(item));
  assert(payload, `${message}: ${JSON.stringify(updates)}`);
  assertBakedPresetPayloadMeta(payload, message);
  return payload;
}

function createMockContext(options = {}) {
  mockGameState = Object.prototype.hasOwnProperty.call(options, 'gameState') ? Number(options.gameState) : 6;
  root = new MockPanel('Root', null, 'Root');
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  for (const key of Object.keys(eventHandlers)) delete eventHandlers[key];
  root.actuallayoutwidth = 1920;
  root.actuallayoutheight = 1080;
  root.contentwidth = 1920;
  root.contentheight = 1080;

  return {
    console,
    Date,
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
    isFinite,
    parseFloat,
    setTimeout,
    clearTimeout,
    Game: {
      GetState: () => mockGameState
    },
    GameUI: {
      CustomUIConfig: () => sharedStore
    },
    $: {
      GetContextPanel: () => root,
      CreatePanel: (type, parent, id) => new MockPanel(type, parent === true ? root : parent, id),
      DispatchEvent: (...args) => {
        dispatched.push(args);
        return true;
      },
      DispatchEventAsync: (...args) => {
        dispatched.push(args);
        return true;
      },
      RegisterForUnhandledEvent: (eventName, handler) => {
        eventHandlers[eventName] = handler;
      },
      RegisterEventHandler: () => {},
      Schedule: (delay, handler) => {
        scheduled.push({ delay, handler });
        return null;
      }
    },
    SteamOverlayAPI: {
      OpenURL: () => {}
    }
  };
}

function runValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  assert(source.includes('HP_COLORS_PRESET_REQUEST'),
    'anita_ui_core.js must answer the static HP Colors preset request bridge used by fresh healthbar overlays');
  assert(source.includes('HP_COLORS_PRESET_SNAPSHOT') && source.includes('values_raw'),
    'anita_ui_core.js must publish replayable HP Colors preset snapshots with values_raw');
  const context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockPresetStore();

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register was not exposed');
  const validationConfig = {
    title: 'HP Colors',
    description: 'hero selector validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_mode', type: 'cycler', options: ['Fixed', 'Gradient'], defaultValue: 1, currentValue: 1, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 },
      { id: 'hp_pulse_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_pulse_threshold', type: 'slider', defaultValue: 25, currentValue: 25, category: 'General', min: 0, max: 100, step: 1, visibleWhen: { id: 'hp_pulse_enabled', equals: true } }
    ]
  };
  root.AnitaUI.Register(validationConfig);
  dispatched.length = 0;
  assert(typeof eventHandlers.ClientUI_FireOutput === 'function',
    'Anita UI did not register a ClientUI_FireOutput bridge listener');
  eventHandlers.ClientUI_FireOutput(JSON.stringify({
    magic_word: 'ANITA_UPDATE',
    mod_title: 'HP Colors',
    setting_id: 'hp_pulse_enabled',
    value: true
  }));
  eventHandlers.ClientUI_FireOutput(JSON.stringify({
    magic_word: 'HP_COLORS_PRESET_REQUEST',
    mod_title: 'HP Colors',
    reason: 'validator'
  }));
  const presetSnapshot = dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .find(payload => payload && payload.magic_word === 'HP_COLORS_PRESET_SNAPSHOT');
  assert(presetSnapshot && presetSnapshot.values_raw && presetSnapshot.values &&
      presetSnapshot.values.hp_low_threshold === 35,
    `Preset request bridge did not publish replayable HP Colors values: ${JSON.stringify(dispatched)}`);
  dispatched.length = 0;
  runNextScheduledByDelay(1.0);
  const replayedPresetSnapshot = dispatched
    .filter(args => args[0] === 'ClientUI_FireOutput' && typeof args[1] === 'string')
    .map(args => {
      try { return JSON.parse(args[1]); } catch (err) { return null; }
    })
    .find(payload => payload && payload.magic_word === 'HP_COLORS_PRESET_SNAPSHOT');
  assert(replayedPresetSnapshot && replayedPresetSnapshot.values_raw,
    `HP Colors must continuously replay cached preset snapshots for late-created healthbar contexts: ${JSON.stringify(dispatched)}`);

  const tabs = findByClass(root, 'AnitaTabBtn');
  assert(tabs.length >= 1, 'No Anita tab button rendered');
  assert(tabs[tabs.length - 1].events.onactivate, 'HP Colors tab missing activate handler');
  tabs[tabs.length - 1].events.onactivate();
  const hpModeElement = validationConfig.elements.find(element => element.id === 'hp_mode');
  const hpPulseEnabledElement = validationConfig.elements.find(element => element.id === 'hp_pulse_enabled');
  const hpPulseThresholdElement = validationConfig.elements.find(element => element.id === 'hp_pulse_threshold');
  assert(hpModeElement.currentValue === 0 && hpModeElement.runtimeLocked && hpModeElement.__anitaRowPanel.BHasClass('AnitaRuntimeLocked'),
    'Optimized profile should hard-lock hp_mode to Fixed in Anita UI');
  assert(hpPulseEnabledElement.currentValue === false && hpPulseEnabledElement.runtimeLocked && hpPulseEnabledElement.__anitaRowPanel.BHasClass('AnitaRuntimeLocked'),
    'Optimized profile should hard-lock low HP pulse off in Anita UI');
  assert(hpPulseThresholdElement.runtimeHidden && hpPulseThresholdElement.__anitaRowPanel.style.visibility === 'collapse',
    'Optimized profile should hide pulse-only controls in Anita UI');

  const presetBtn = findByClass(root, 'AnitaFooterBtnPreset')[0];
  assert(presetBtn && presetBtn.events.onactivate, 'Preset footer button missing activate handler');
  presetBtn.events.onactivate();

  const presetImportBtn = findByClass(root, 'AnitaPresetImportBtn')[0];
  assert(presetImportBtn && presetImportBtn.events.onactivate, 'Preset Builder IMPORT button missing activate handler');
  presetImportBtn.events.onactivate();
  let importPopup = findByClass(root, 'AnitaImportPopup')[0];
  assert(importPopup && importPopup.IsValid && importPopup.IsValid(),
    'Preset Builder IMPORT should open the paste-code import popup, not apply the selected row');
  const pasteInput = findByClass(importPopup, 'AnitaPasteInput')[0];
  assert(pasteInput && /custom/i.test(String(pasteInput.placeholder || '')),
    `Preset import popup should clearly accept custom pasted codes: ${pasteInput && pasteInput.placeholder}`);
  const importCloseLabel = findByClass(importPopup, 'AnitaImportCloseLabel')[0];
  assert(importCloseLabel && importCloseLabel.text === 'X',
    `Preset import popup close button should render minimalist X label: ${importCloseLabel && importCloseLabel.text}`);
  pasteInput.text = encodePresetStorePayload({
    name: 'Pasted Custom',
    version: 1,
    values: {
      hp_enabled: false,
      hp_low_threshold: 59
    }
  });
  const importApplyBtn = findByClass(importPopup, 'AnitaImportApplyBtn')[0];
  assert(importApplyBtn && importApplyBtn.events.onactivate, 'Preset import popup missing Apply handler');
  const importApplyLabel = findByClass(importApplyBtn, 'AnitaImportApplyLabel')[0];
  assert(importApplyLabel && importApplyLabel.text === 'IMPORT',
    `Preset import popup apply button should render IMPORT label: ${importApplyLabel && importApplyLabel.text}`);
  importApplyBtn.events.onactivate();
  assert(validationConfig.elements.find(element => element.id === 'hp_enabled').currentValue === true &&
      validationConfig.elements.find(element => element.id === 'hp_low_threshold').currentValue === 35,
    'Preset import popup should save pasted custom codes without applying them to current HP Colors settings');
  assert(findByClass(root, 'AnitaPresetRowName').some(label => label.text === 'Import 1'),
    'Preset import popup should create a saved preset row named Import 1');

  const presetNameLabel = findByClass(root, 'AnitaPresetNameLabel')[0];
  const presetNameInput = findByClass(root, 'AnitaPresetNameInput')[0];
  const presetAddBtn = findByClass(root, 'AnitaPresetAddBtn')[0];
  const presetAddHint = findByClass(root, 'AnitaPresetCreateHint')[0];
  const presetAddLabel = presetAddBtn ? findByClass(presetAddBtn, 'AnitaPresetAddLabel')[0] : null;
  assert(presetNameLabel && /preset name/i.test(String(presetNameLabel.text || '')),
    `Preset name input should have a visible label above it: ${presetNameLabel && presetNameLabel.text}`);
  assert(presetNameInput && /current settings/i.test(String(presetNameInput.placeholder || '')),
    `Preset name input should explain it names a current-settings preset: ${presetNameInput && presetNameInput.placeholder}`);
  assert(presetAddLabel && presetAddLabel.text === 'SAVE CURRENT',
    `Preset add button should say SAVE CURRENT: ${presetAddLabel && presetAddLabel.text}`);
  assert(presetAddHint && /current live HP settings/i.test(String(presetAddHint.text || '')),
    `Preset create row should explain SAVE CURRENT: ${presetAddHint && presetAddHint.text}`);

  function openHeroMenu(button) {
    assert(button && button.events.onactivate, 'Hero picker button missing activate handler');
    button.events.onactivate();
    const menu = button.__anitaHeroMenu;
    assert(menu && menu.IsValid && menu.IsValid(), 'Hero picker did not open a custom menu');
    return menu;
  }

  function findHeroMenuOption(menu, heroId) {
    return findByClass(menu, 'AnitaPresetHeroMenuOption')
      .find(option => option.GetAttributeString('anita_hero_kind', '') === 'hero' &&
        option.GetAttributeString('anita_hero_id', '') === String(heroId || ''));
  }

  function findHeroScopeOption(menu, kind) {
    return findByClass(menu, 'AnitaPresetHeroMenuOption')
      .find(option => option.GetAttributeString('anita_hero_kind', '') === kind &&
        option.GetAttributeString('anita_hero_id', '') === '');
  }

  function chooseHeroScope(button, kind, heroId) {
    const menu = button.__anitaHeroMenu && button.__anitaHeroMenu.IsValid && button.__anitaHeroMenu.IsValid()
      ? button.__anitaHeroMenu
      : openHeroMenu(button);
    const option = kind === 'hero' ? findHeroMenuOption(menu, heroId) : findHeroScopeOption(menu, kind);
    assert(option && option.events.onactivate, `Hero picker menu missing option: ${heroId || kind}`);
    option.events.onactivate();
    return option;
  }

  function chooseHero(button, heroId) {
    return chooseHeroScope(button, 'hero', heroId);
  }

  const heroPicker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  assert(heroPicker, 'No custom hero picker button rendered');
  assert(findByClass(root, 'AnitaPresetHeroDropDown').length === 0,
    'Hero picker should not use native DropDown/CitadelSettingsEnumDropDown panels');
  const firstRowPanel = findByClass(root, 'AnitaPresetRow')[0];
  assert(firstRowPanel && firstRowPanel.hittest === true && firstRowPanel.hittestchildren === true,
    'Preset row must allow child hero picker input');
  const firstTextCol = findByClass(root, 'AnitaPresetRowText')[0];
  assert(firstTextCol && firstTextCol.hittest === true && firstTextCol.hittestchildren === true,
    'Preset row text column hit flags changed unexpectedly');
  const firstHeroSelector = findByClass(root, 'AnitaPresetHeroSelector')[0];
  assert(firstHeroSelector && firstHeroSelector.hittest === true && firstHeroSelector.hittestchildren === true,
    'Hero selector wrapper must allow picker input');
  let heroSummary = findByClass(root, 'AnitaPresetHeroSummary')[0];
  assert(heroSummary && heroSummary.text === 'Hero select off',
    `Hero summary label should start with hero selection off: ${heroSummary && heroSummary.text}`);
  const heroFace = findByClass(root, 'AnitaPresetHeroDropDownFace')[0];
  assert(heroFace && heroFace.hittest === false && heroFace.hittestchildren === false,
    'Hero picker face must not capture input');
  const heroFaceLabel = findByClass(heroFace, 'AnitaPresetHeroDropDownFaceLabel')[0];
  assert(heroFaceLabel && heroFaceLabel.text === 'Off',
    `Hero picker face label missing: ${heroFaceLabel && heroFaceLabel.text}`);
  const heroFaceIcon = findByClass(heroFace, 'AnitaPresetHeroDropDownFaceIcon')[0];
  assert(heroFaceIcon && !heroFaceIcon.classes.has('Visible'),
    'Hero picker face icon should stay hidden for count-only display');
  assert(heroPicker.hittest === true, 'Hero picker hittest is not enabled');
  assert(heroPicker.hittestchildren === false, 'Hero picker children should not capture input');
  assert(heroPicker.canfocus === true, 'Hero picker focus is not enabled');
  assert(heroPicker.events.onactivate, 'Hero picker missing activate handler');

  let menu = openHeroMenu(heroPicker);
  const menuHost = menu.GetParent && menu.GetParent();
  assert(menuHost && menuHost.BHasClass && menuHost.BHasClass('AnitaPopupHost'),
    'Hero picker menu must open in AnitaPopupHost so fixed-height preset rows cannot clip it');
  assert(menu.style && menu.style.position && menu.style.opacity === '1',
    'Hero picker menu must be explicitly positioned and visible when opened');
  let options = findByClass(menu, 'AnitaPresetHeroMenuOption');
  assert(options.length > 3, 'Hero picker menu did not render options');
  assert(options[0].GetAttributeString('anita_hero_kind', '') === 'off',
    'Hero picker menu first option should disable hero targeting');
  assert(options[1].GetAttributeString('anita_hero_kind', '') === 'all',
    'Hero picker menu second option should target all heroes');
  assert(options[2].GetAttributeString('anita_hero_kind', '') === 'hero',
    'Hero picker menu should list heroes after scope controls');
  assert(options.filter(option => option.GetAttributeString('anita_hero_kind', '') === 'off').length === 1,
    'Hero picker menu should render exactly one off option');
  assert(options.filter(option => option.GetAttributeString('anita_hero_kind', '') === 'all').length === 1,
    'Hero picker menu should render exactly one all-heroes option');
  let firstHeroOption = findHeroMenuOption(menu, 'hero_inferno');
  assert(firstHeroOption, 'Hero picker menu missing Infernus option');
  assert(firstHeroOption.type === 'Button', `Hero menu option should be a Button: ${firstHeroOption.type}`);
  assert(firstHeroOption.hittest === true && firstHeroOption.hittestchildren === false,
    'Hero menu option should own its click without child input routing');
  const offHeroOption = findHeroScopeOption(menu, 'off');
  assert(offHeroOption && findByClass(offHeroOption, 'AnitaPresetHeroMenuOptionIconAll').length === 1,
    'Hero picker off option should have a compact left icon slot');
  const allHeroOption = findHeroScopeOption(menu, 'all');
  assert(allHeroOption && findByClass(allHeroOption, 'AnitaPresetHeroMenuOptionIconAll').length === 1,
    'Hero picker all option should have a compact left icon slot');
  const firstHeroIconSlot = findByClass(firstHeroOption, 'AnitaPresetHeroMenuOptionIcon')[0];
  assert(firstHeroIconSlot, 'Hero picker menu option missing left icon slot');
  assert(String(firstHeroIconSlot.style.backgroundImage || '') === 'none',
    `Hero picker icon frame should not carry the hero texture: ${firstHeroIconSlot.style.backgroundImage || ''}`);
  assert(!firstHeroIconSlot.classes.has('AnitaPresetHeroIconFallback'),
    'Hero picker icon slot should not use a framed fallback box');
  const firstHeroIconImage = findByClass(firstHeroIconSlot, 'AnitaPresetHeroMenuOptionHeroIcon')[0];
  assert(firstHeroIconImage &&
      firstHeroIconImage.style.width === '22px' &&
      firstHeroIconImage.style.height === '22px' &&
      firstHeroIconImage.style.minWidth === '22px' &&
      firstHeroIconImage.style.maxWidth === '22px' &&
      firstHeroIconImage.style.backgroundSize === '100% 100%' &&
      firstHeroIconImage.style.backgroundTextureSize === '22px 22px',
    `Hero picker icon image missing inline fixed sizing: ${JSON.stringify(firstHeroIconImage && firstHeroIconImage.style || {})}`);
  assert(firstHeroIconImage && String(firstHeroIconImage.style.backgroundImage || '') === 'none',
    `Hero picker icon image should wait for post-layout settle before loading texture: ${firstHeroIconImage && firstHeroIconImage.style.backgroundImage || ''}`);
  runNextScheduledByDelay(0.03);
  assert(firstHeroIconImage && String(firstHeroIconImage.style.backgroundImage || '').includes('s2r://panorama/images/heroes/inferno_mm_psd.vtex'),
    `Hero picker menu option missing fixed-size in-game icon image: ${firstHeroIconImage && firstHeroIconImage.style.backgroundImage || ''}`);

  chooseHeroScope(heroPicker, 'off');
  assert(heroSummary.text === 'Hero select off',
    `Hero summary label did not update after disabling scope: ${heroSummary.text}`);
  assert(heroFaceLabel.text === 'Off',
    `Hero picker face label did not update to off mode: ${heroFaceLabel.text}`);
  dispatched.length = 0;
  const copyBtn = findByClass(root, 'AnitaPresetCopyBtn')[0];
  assert(copyBtn && copyBtn.events.onactivate, 'Copy button missing activate handler');
  copyBtn.events.onactivate();
  let copied = copiedHpToken();
  assert(copied, 'No off-scope preset token copied');
  let payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'off' && !payload.hs,
    `Off-scope token should include hm=off and no hs: ${JSON.stringify(payload)}`);

  chooseHeroScope(heroPicker, 'all');
  assert(heroSummary.text === 'All heroes',
    `Hero summary label did not update after all-heroes scope: ${heroSummary.text}`);
  assert(heroFaceLabel.text === 'All heroes',
    `Hero picker face label did not update to all-heroes mode: ${heroFaceLabel.text}`);
  dispatched.length = 0;
  copyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No all-heroes preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'all' && !payload.hs,
    `All-heroes token should include hm=all and no hs: ${JSON.stringify(payload)}`);

  chooseHero(heroPicker, 'hero_inferno');
  assert(findHeroMenuOption(heroPicker.__anitaHeroMenu, 'hero_inferno') === firstHeroOption,
    'Hero picker should update existing menu option panels instead of rebuilding all heroes on selection');

  assert(heroSummary.text === '1 hero selected',
    `Hero summary label did not update after selection: ${heroSummary.text}`);
  const firstHeroCheck = firstHeroOption.__anitaHeroCheckLabel;
  assert(firstHeroCheck && firstHeroCheck.text === '✓',
    `Selected hero marker should be a compact checkmark, got: ${firstHeroCheck && firstHeroCheck.text}`);
  assert(heroFaceLabel.text === '1 hero',
    `Hero picker face label did not update to selected count: ${heroFaceLabel.text}`);
  assert(!heroFaceIcon.classes.has('Visible') && String(heroFaceIcon.style.backgroundImage || '') === 'none',
    'Hero picker face icon should stay hidden for count-only display');

  const secondHeroOption = findHeroMenuOption(heroPicker.__anitaHeroMenu, 'hero_gigawatt');
  assert(secondHeroOption, 'Hero picker menu missing Seven option');
  chooseHero(heroPicker, 'hero_gigawatt');
  assert(heroSummary.text === '2 heroes selected',
    `Hero summary label did not update after adding a second hero: ${heroSummary.text}`);
  assert(heroFaceLabel.text === '2 heroes',
    `Hero picker face label did not update to multi-hero count: ${heroFaceLabel.text}`);
  options = findByClass(heroPicker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption');
  firstHeroOption = options.find(option => option.GetAttributeString('anita_hero_id', '') === 'hero_inferno');
  const selectedSecondHeroOption = options.find(option => option.GetAttributeString('anita_hero_id', '') === 'hero_gigawatt');
  assert(firstHeroOption && firstHeroOption.classes.has('Selected'),
    'Selected Infernus option missing highlight');
  assert(selectedSecondHeroOption && selectedSecondHeroOption.classes.has('Selected'),
    'Selected Seven option missing highlight');

  dispatched.length = 0;
  copyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No scoped preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.includes('hero_inferno') && payload.hs.includes('hero_gigawatt'),
    `Copied scoped token missing multi-hero targets: ${JSON.stringify(payload)}`);

  let allPickers = findByClass(root, 'AnitaPresetHeroPickerBtn');
  let allCopyButtons = findByClass(root, 'AnitaPresetCopyBtn');
  assert(allPickers.length >= 2, `Expected at least two preset hero pickers, found ${allPickers.length}`);
  assert(allCopyButtons.length >= 2, `Expected at least two preset copy buttons, found ${allCopyButtons.length}`);
  const secondPicker = allPickers[1];
  openHeroMenu(secondPicker);
  const secondRowHeroOption = findHeroMenuOption(secondPicker.__anitaHeroMenu, 'hero_haze');
  assert(secondRowHeroOption, 'Second preset row missing Haze option');
  chooseHero(secondPicker, 'hero_haze');
  let secondHeroSummary = findByClass(root, 'AnitaPresetHeroSummary')[1];
  assert(secondHeroSummary && secondHeroSummary.text === '1 hero selected',
    `Second preset row summary label did not update independently: ${secondHeroSummary && secondHeroSummary.text}`);
  dispatched.length = 0;
  allCopyButtons[1].events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No second-row scoped preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.length === 1 && payload.hs[0] === 'hero_haze',
    `Second row copied token should only target Haze: ${JSON.stringify(payload)}`);
  dispatched.length = 0;
  copyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No first-row scoped preset token copied after second-row edit');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.includes('hero_inferno') && payload.hs.includes('hero_gigawatt') && !payload.hs.includes('hero_haze'),
    `Second row hero leaked into first row token: ${JSON.stringify(payload)}`);

  const settingsApi = root.AnitaUI;
  assert(settingsApi && typeof settingsApi === 'object', 'AnitaUI API missing after hero selection');
  tabs[tabs.length - 1].events.onactivate();
  presetBtn.events.onactivate();
  const rerenderedPicker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  assert(rerenderedPicker, 'Hero picker missing after settings re-render');
  heroSummary = findByClass(root, 'AnitaPresetHeroSummary')[0];
  assert(heroSummary && heroSummary.text === '2 heroes selected',
    `Hero summary label did not survive settings re-render: ${heroSummary && heroSummary.text}`);
  assert(findByClass(rerenderedPicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === '2 heroes',
    'Hero picker face did not survive settings re-render');
  const rerenderedCopyBtn = findByClass(root, 'AnitaPresetCopyBtn')[0];
  assert(rerenderedCopyBtn && rerenderedCopyBtn.events.onactivate, 'Copy button missing after settings re-render');
  dispatched.length = 0;
  rerenderedCopyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No scoped preset token copied after settings re-render');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'selected' && Array.isArray(payload.hs) && payload.hs.includes('hero_inferno') && payload.hs.includes('hero_gigawatt'),
    `Rerendered copy lost multi-hero targets: ${JSON.stringify(payload)}`);

  const activePicker = rerenderedPicker;
  const activeCopyBtn = rerenderedCopyBtn;

  openHeroMenu(activePicker);
  firstHeroOption = findHeroMenuOption(activePicker.__anitaHeroMenu, 'hero_inferno');
  assert(firstHeroOption, 'Refreshed hero dropdown missing Infernus option');
  chooseHero(activePicker, 'hero_inferno');
  assert(heroSummary.text === '1 hero selected',
    `Hero summary label did not remove only the selected hero: ${heroSummary.text}`);
  assert(findByClass(activePicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === '1 hero',
    'Hero picker face did not update after removing one selected hero');

  dispatched.length = 0;
  activeCopyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No one-hero preset token copied after removal');
  payload = decodePresetToken(copied[1]);
  assert(Array.isArray(payload.hs) && payload.hs.length === 1 && payload.hs[0] === 'hero_gigawatt',
    `Copied token should keep only Seven after removing Infernus: ${JSON.stringify(payload)}`);

  const allOption = findHeroScopeOption(activePicker.__anitaHeroMenu, 'all');
  assert(allOption, 'Refreshed hero dropdown missing All heroes option');
  chooseHeroScope(activePicker, 'all');
  assert(heroSummary.text === 'All heroes',
    `Hero summary label did not switch back to all heroes: ${heroSummary.text}`);
  assert(findByClass(activePicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === 'All heroes',
    'Hero picker face did not switch back to all heroes');

  dispatched.length = 0;
  activeCopyBtn.events.onactivate();
  copied = copiedHpToken();
  assert(copied, 'No all-heroes preset token copied');
  payload = decodePresetToken(copied[1]);
  assert(payload.hm === 'all' && !payload.hs, `All heroes token should include hm=all and no hs: ${JSON.stringify(payload)}`);

  chooseHero(activePicker, 'hero_inferno');
  assert(heroSummary.text === '1 hero selected',
    `Hero summary label did not switch from all to one selected hero: ${heroSummary.text}`);
  chooseHero(activePicker, 'hero_inferno');
  assert(heroSummary.text === 'Hero select off',
    `Removing the last selected hero should return to Hero select off: ${heroSummary.text}`);
  assert(findByClass(activePicker, 'AnitaPresetHeroDropDownFaceLabel')[0].text === 'Off',
    'Hero picker face should return to Off after removing the last selected hero');

  console.log(`[HERO SELECTOR PASS] ${path.relative(ROOT, targetScript)} uses custom hero picker, isolates preset rows, survives rerender, and copies off/all/selected hero scope tokens.`);
}

function runHeroPresetApplyValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  const progress = installMockHeroProgress('hero_inferno');
  const presetRows = [
    {
      id: 'HPColorsPreset_001',
      name: 'Main Hunt 2',
      category: 'Builder VPK',
      heroes: ['hero_inferno'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Shift',
      category: 'Builder VPK',
      heroes: ['hero_haze'],
      values: { hp_enabled: true, hp_low_threshold: 45 }
    }
  ];
  const store = installMockPresetStore(presetRows);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register was not exposed for hero preset apply validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero preset apply validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  let updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_inferno' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_enabled === false,
    'Initial detected hero did not apply Infernus preset');

  runNextScheduledByDelay(2.0);
  progress.RemoveClass('hero_inferno');
  progress.AddClass('hero_haze');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_haze' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 45,
    'Changed detected hero did not apply Haze preset');

  store.DeleteAsync();
  runNextScheduledByDelay(2.0);
  installMockPresetStore(presetRows);
  progress.RemoveClass('hero_haze');
  progress.AddClass('hero_inferno');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_inferno' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_enabled === false,
    'Hero watcher stopped after a transient preset-store miss');

  console.log(`[HERO PRESET PASS] ${path.relative(ROOT, targetScript)} detects hero changes and applies matching scoped presets without runtime log noise.`);
}

function runHeroPresetStableIdPriorityValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockHeroProgress('hero_inferno');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Stale row should lose',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: false, hp_low_threshold: 27 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Stable route target',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_inferno'],
      values: { hp_enabled: true, hp_low_threshold: 62 }
    }
  ]);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register missing for stable-id priority validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero stable id priority validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    __anitaPresetHeroSelections: {
      baked_0: ['hero_inferno'],
      'id:HPColorsPreset_001': ['hero_haze']
    },
    __anitaPresetHeroModes: {
      baked_0: 'selected',
      'id:HPColorsPreset_001': 'selected'
    },
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  const updates = decodedBulkUpdates();
  findBakedPresetUpdate(updates, payload =>
    payload.hero_id === 'hero_inferno' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 62,
    'Stable preset id hero scope did not override stale row-index scope');

  console.log(`[HERO STABLE-ID PASS] ${path.relative(ROOT, targetScript)} prefers stable preset ids over stale baked row indexes.`);
}

function runHeroPresetLobbyGateValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext({ gameState: 2 });
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  const progress = installMockHeroProgress('hero_inferno');
  installMockGameTime('00:00');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Infernus lobby guarded',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_inferno'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Haze active',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: true, hp_low_threshold: 45 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero preset lobby gate validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  let updates = decodedBulkUpdates();
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply'),
    `Lobby state should not spend the hero lookup window or apply a scoped preset: ${JSON.stringify(updates)}`);

  progress.RemoveClass('hero_inferno');
  progress.AddClass('hero_haze');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply'),
    `Lobby watcher tick should stay paused until active game state: ${JSON.stringify(updates)}`);

  mockGameState = 6;
  runNextScheduledByDelay(5.0);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.hero_id === 'hero_haze' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `Active game state at 00:00 should open the hero lookup window and apply the current hero preset: ${JSON.stringify(updates)}`);

  console.log(`[HERO LOBBY GATE PASS] ${path.relative(ROOT, targetScript)} pauses hero preset lookup in lobby and opens it at active game time zero.`);
}

function runHeroSelectorRuntimeScopeValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  const context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockHeroProgress('hero_haze');
  installMockPresetStore();

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register was not exposed for runtime scope validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero selector runtime scope validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  assert(tabs.length >= 1 && tabs[tabs.length - 1].events.onactivate, 'HP Colors tab missing for runtime scope validation');
  tabs[tabs.length - 1].events.onactivate();
  const presetBtn = findByClass(root, 'AnitaFooterBtnPreset')[0];
  assert(presetBtn && presetBtn.events.onactivate, 'Preset footer button missing for runtime scope validation');
  presetBtn.events.onactivate();

  function openHeroMenu(button) {
    assert(button && button.events.onactivate, 'Hero picker button missing activate handler for runtime scope validation');
    button.events.onactivate();
    assert(button.__anitaHeroMenu && button.__anitaHeroMenu.IsValid && button.__anitaHeroMenu.IsValid(),
      'Hero picker did not open a menu for runtime scope validation');
    return button.__anitaHeroMenu;
  }

  const allPickers = findByClass(root, 'AnitaPresetHeroPickerBtn');
  assert(allPickers.length >= 2, `Expected at least two preset hero pickers for runtime scope validation, found ${allPickers.length}`);
  const secondPicker = allPickers[1];
  const secondMenu = openHeroMenu(secondPicker);
  const hazeOption = findByClass(secondMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_id', '') === 'hero_haze');
  assert(hazeOption, 'Second preset row missing Haze option for runtime scope validation');

  hazeOption.events.onactivate();

  runScheduledUntil(() => decodedBulkUpdates().some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.hero_id === 'hero_haze' &&
    payload.preset_key === 'HPColorsPreset_002' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `In-game hero selector scope did not drive the runtime preset selection: ${JSON.stringify(decodedBulkUpdates())}`);

  console.log(`[HERO RUNTIME SCOPE PASS] ${path.relative(ROOT, targetScript)} uses in-game hero selector scopes when applying presets.`);
}

function runHeroScopeModeFallbackValidation() {
  let source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  let context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockHeroProgress('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_001',
      name: 'Global fallback',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 45 }
    },
    {
      id: 'HPColorsPreset_002',
      name: 'Shiv only',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_shiv'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    }
  ]);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register missing for selected/all fallback validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope fallback validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  let updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `All-heroes preset should apply when selected-mode presets do not claim the current hero: ${JSON.stringify(updates)}`);
  resetPresetStoreLookupCounters();
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_001' &&
    payload.values && payload.values.hp_low_threshold === 45),
    `All-heroes preset should remain the fallback after watcher tick when selected mode misses: ${JSON.stringify(updates)}`);
  assert(presetStoreLookups.findStore === 0 && presetStoreLookups.scanEntries === 0,
    `Watcher tick should reuse cached baked preset entries instead of scanning Panorama panels: ${JSON.stringify(presetStoreLookups)}`);

  dispatched.length = 0;
  scheduled.length = 0;
  root = new MockPanel('Panel', null, 'Root');
  context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockHeroProgress('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_003',
      name: 'All only',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 55 }
    },
    {
      id: 'HPColorsPreset_004',
      name: 'Disabled',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 5 }
    }
  ]);

  assert(root.AnitaUI && typeof root.AnitaUI.Register === 'function', 'AnitaUI.Register missing for all-mode validation');
  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero all scope validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_003' &&
    payload.values && payload.values.hp_low_threshold === 55),
    `All-heroes preset should apply when no selected-mode preset competes: ${JSON.stringify(updates)}`);
  assert(!scheduled.some(job => Number(job && job.delay) === 2.0),
    `All-only preset stores should not start the 2s hero watcher: ${JSON.stringify(scheduled.map(job => job && job.delay))}`);
  assert(!updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_004'),
    `Off-mode preset should never apply: ${JSON.stringify(updates)}`);

  dispatched.length = 0;
  scheduled.length = 0;
  context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  const progress = installMockHeroProgress('hero_shiv');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_005',
      name: 'All fallback',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 60 }
    },
    {
      id: 'HPColorsPreset_006',
      name: 'Shiv only',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_shiv'],
      values: { hp_enabled: false, hp_low_threshold: 25 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero reapply after no match validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  progress.RemoveClass('hero_shiv');
  progress.AddClass('hero_magician');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates().filter(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_005' &&
    payload.hero_id === 'hero_magician');
  assert(updates.length >= 1 && updates.some(payload => payload.values && payload.values.hp_low_threshold === 60),
    `Leaving a selected hero should apply the all-heroes fallback for unclaimed heroes: ${JSON.stringify(decodedBulkUpdates())}`);
  progress.RemoveClass('hero_magician');
  progress.AddClass('hero_shiv');
  runNextScheduledByDelay(2.0);
  updates = decodedBulkUpdates().filter(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_006' &&
    payload.hero_id === 'hero_shiv');
  assert(updates.length >= 2,
    `Returning to a specifically claimed hero should reapply the selected preset over all-heroes fallback: ${JSON.stringify(decodedBulkUpdates())}`);

  dispatched.length = 0;
  scheduled.length = 0;
  context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockHeroProgress('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_007',
      name: 'Picker controlled',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 70 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope immediate refresh validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();
  const picker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  picker.events.onactivate();
  const allScopeOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'all');
  allScopeOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_007' &&
    payload.values && payload.values.hp_low_threshold === 70),
    `Changing a preset row to All heroes should refresh matching config immediately: ${JSON.stringify(updates)}`);

  console.log(`[HERO SCOPE MODE PASS] ${path.relative(ROOT, targetScript)} keeps off rows disabled, uses all fallback for unclaimed heroes, and prefers selected hero matches.`);
}

function runHeroScopeLiveEditValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  let context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockHeroProgress('hero_haze');
  installMockPresetStore([
    {
      id: 'HPColorsPreset_008',
      name: 'Live edited',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 70 }
    },
    {
      id: 'HPColorsPreset_009',
      name: 'Fallback all',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 44 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope live edit validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  runNextScheduledByDelay(0.5);
  let updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_009' &&
    payload.values && payload.values.hp_low_threshold === 44),
    `Initial all fallback should apply when no selected row exists: ${JSON.stringify(updates)}`);

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();
  const picker = findByClass(root, 'AnitaPresetHeroPickerBtn')[0];
  picker.events.onactivate();
  let hazeOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'hero' &&
      option.GetAttributeString('anita_hero_id', '') === 'hero_haze');
  assert(hazeOption && hazeOption.events.onactivate, 'Live edit validation missing Haze option');
  hazeOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_008' &&
    payload.hero_id === 'hero_haze' &&
    payload.values && payload.values.hp_low_threshold === 70),
    `Changing an off row to selected current hero should apply immediately: ${JSON.stringify(updates)}`);

  const summary = findByClass(root, 'AnitaPresetHeroSummary')[0];
  assert(summary && summary.text === '1 hero selected',
    `Selected current hero summary missing: ${summary && summary.text}`);

  hazeOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'hero' &&
      option.GetAttributeString('anita_hero_id', '') === 'hero_haze');
  hazeOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  assert(summary.text === 'Hero select off',
    `Removing last selected hero should return to Hero select off during live edit: ${summary.text}`);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_009' &&
    payload.values && payload.values.hp_low_threshold === 44),
    `Returning selected row to off should re-enable explicit all fallback: ${JSON.stringify(updates)}`);

  const offOption = findByClass(picker.__anitaHeroMenu, 'AnitaPresetHeroMenuOption')
    .find(option => option.GetAttributeString('anita_hero_kind', '') === 'off');
  offOption.events.onactivate();
  runNextScheduledByDelay(0.05);
  assert(summary.text === 'Hero select off',
    `Explicit Off should be visible in summary: ${summary.text}`);
  updates = decodedBulkUpdates();
  assert(updates.some(payload => payload.update_source === 'baked_preset_apply' &&
    payload.preset_key === 'HPColorsPreset_009' &&
    payload.values && payload.values.hp_low_threshold === 44),
    `After explicit Off, all fallback should be allowed again when no selected row exists: ${JSON.stringify(updates)}`);

  console.log(`[HERO LIVE EDIT PASS] ${path.relative(ROOT, targetScript)} applies live scope edits without waiting for the 2s watcher.`);
}

function runHeroBundleScopeTokenValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;

  let context = createMockContext();
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockPresetStore([
    {
      id: 'HPColorsPreset_010',
      name: 'Disabled row',
      category: 'Builder VPK',
      heroMode: 'off',
      values: { hp_enabled: false, hp_low_threshold: 21 }
    },
    {
      id: 'HPColorsPreset_011',
      name: 'Global row',
      category: 'Builder VPK',
      heroMode: 'all',
      values: { hp_enabled: true, hp_low_threshold: 44 }
    },
    {
      id: 'HPColorsPreset_012',
      name: 'Haze only',
      category: 'Builder VPK',
      heroMode: 'selected',
      heroes: ['hero_haze'],
      values: { hp_enabled: true, hp_low_threshold: 70 }
    }
  ]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'hero scope bundle token validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing for bundle scope validation');
  bundleBtn.events.onactivate();

  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p.length === 3,
    `Bundle should include three preset rows: ${JSON.stringify(bundle)}`);
  assert(bundle.p[0][0] === 'Disabled row' && bundle.p[0][2] === 'off',
    `Bundle should preserve explicit off rows: ${JSON.stringify(bundle.p[0])}`);
  assert(bundle.p[1][0] === 'Global row' && bundle.p[1][2] === 'all',
    `Bundle should preserve explicit all-hero rows: ${JSON.stringify(bundle.p[1])}`);
  assert(bundle.p[2][0] === 'Haze only' && Array.isArray(bundle.p[2][2]) && bundle.p[2][2][0] === 'hero_haze',
    `Bundle should preserve selected hero rows as hero arrays: ${JSON.stringify(bundle.p[2])}`);

  console.log(`[HERO BUNDLE PASS] ${path.relative(ROOT, targetScript)} preserves off/all/selected hero scope in COPY ALL tokens.`);
}

function runUserPresetBundleValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  sharedStore.__hpColorsCfgRaw = JSON.stringify({
    hp_enabled: false,
    hp_low_threshold: 62
  });
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockPresetStore([]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'user preset bundle validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });
  const startupSnapshot = JSON.parse(sharedStore.__hpColorsCfgRaw || '{}');
  assert(startupSnapshot.hp_enabled === false && startupSnapshot.hp_low_threshold === 62,
    `HP Colors registration should publish a startup shared snapshot before opening Anita UI: ${JSON.stringify(startupSnapshot)}`);
  const startupBursts = scheduled.filter(job => [0.25, 1.0, 2.25, 5.0].includes(Number(job.delay)));
  assert(startupBursts.length >= 4,
    `HP Colors registration should queue startup sync bursts for fresh healthbars: ${JSON.stringify(scheduled.map(job => job.delay))}`);

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();

  const nameInput = findByClass(root, 'AnitaPresetNameInput')[0];
  const addBtn = findByClass(root, 'AnitaPresetAddBtn')[0];
  assert(nameInput && addBtn && addBtn.events.onactivate,
    'Preset Builder should expose in-game preset name input and add button');
  nameInput.text = 'My Game Build';
  if (nameInput.events.ontextentrychange) nameInput.events.ontextentrychange();
  addBtn.events.onactivate();

  assert(findByClass(root, 'AnitaPresetRowName').some(label => label.text === 'My Game Build'),
    'Saved in-game preset row did not render after SAVE CURRENT');
  dispatched.length = 0;
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing after adding user preset');
  bundleBtn.events.onactivate();

  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p.length === 1,
    `COPY ALL should include the saved in-game preset and exclude Current live settings: ${JSON.stringify(bundle)}`);
  assert(bundle.p[0][0] === 'My Game Build',
    `Saved preset name missing from COPY ALL bundle: ${JSON.stringify(bundle.p[0])}`);
  assert(bundle.p[0][1] && bundle.p[0][1].e === false && bundle.p[0][1].l === 62,
    `Saved preset values missing from COPY ALL bundle: ${JSON.stringify(bundle.p[0])}`);
  assert(bundle.p[0][2] === 'off',
    `Saved preset should default to explicit off hero scope: ${JSON.stringify(bundle.p[0])}`);

  console.log(`[HERO USER PRESET PASS] ${path.relative(ROOT, targetScript)} saves in-game presets and includes them in COPY ALL bundles.`);
}

function runUserPresetRenameValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  dispatched.length = 0;
  scheduled.length = 0;
  resetPresetStoreLookupCounters();

  const context = createMockContext();
  sharedStore.__hpColorsCfgRaw = JSON.stringify({
    hp_enabled: false,
    hp_low_threshold: 62
  });
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });
  installMockPresetStore([]);

  root.AnitaUI.Register({
    title: 'HP Colors',
    description: 'user preset rename validation',
    storageNamespace: 'hp_colors',
    storageVersion: 97,
    elements: [
      { id: 'hp_enabled', type: 'toggle', defaultValue: true, currentValue: true, category: 'General' },
      { id: 'hp_low_threshold', type: 'slider', defaultValue: 35, currentValue: 35, category: 'General', min: 0, max: 100, step: 1 }
    ]
  });

  const tabs = findByClass(root, 'AnitaTabBtn');
  tabs[tabs.length - 1].events.onactivate();
  findByClass(root, 'AnitaFooterBtnPreset')[0].events.onactivate();

  const nameInput = findByClass(root, 'AnitaPresetNameInput')[0];
  const addBtn = findByClass(root, 'AnitaPresetAddBtn')[0];
  nameInput.text = 'My Game Build';
  if (nameInput.events.ontextentrychange) nameInput.events.ontextentrychange();
  addBtn.events.onactivate();

  const rowName = findByClass(root, 'AnitaPresetRowName')
    .find(label => label.text === 'My Game Build');
  assert(rowName && rowName.events.onactivate,
    'Preset row name should be clickable for in-place rename');
  rowName.events.onactivate();

  const renameInput = findByClass(root, 'AnitaPresetRowNameInput')[0];
  assert(renameInput && renameInput.text === 'My Game Build',
    `Preset rename input should open with the existing name: ${renameInput && renameInput.text}`);
  renameInput.text = 'Renamed Game Build';
  assert(renameInput.events.ontextentrysubmit,
    'Preset rename input should commit on submit');
  renameInput.events.ontextentrysubmit();

  assert(findByClass(root, 'AnitaPresetRowName').some(label => label.text === 'Renamed Game Build'),
    'Preset row name did not update after in-place rename submit');

  dispatched.length = 0;
  const bundleBtn = findByClass(root, 'AnitaPresetBundleBtn')[0];
  assert(bundleBtn && bundleBtn.events.onactivate, 'COPY ALL button missing after renaming user preset');
  bundleBtn.events.onactivate();

  const bundle = decodeCopiedBundleToken();
  assert(Array.isArray(bundle.p) && bundle.p.length === 1,
    `COPY ALL should include only the renamed saved preset: ${JSON.stringify(bundle)}`);
  assert(bundle.p[0][0] === 'Renamed Game Build',
    `COPY ALL should export the renamed preset name: ${JSON.stringify(bundle.p[0])}`);

  console.log(`[HERO USER PRESET RENAME PASS] ${path.relative(ROOT, targetScript)} renames saved preset rows and exports the new name.`);
}

try {
  runValidation();
  runHeroPresetApplyValidation();
  runHeroPresetStableIdPriorityValidation();
  runHeroPresetLobbyGateValidation();
  runHeroSelectorRuntimeScopeValidation();
  runHeroScopeModeFallbackValidation();
  runHeroScopeLiveEditValidation();
  runHeroBundleScopeTokenValidation();
  runUserPresetBundleValidation();
  runUserPresetRenameValidation();
} catch (err) {
  console.error(`[HERO SELECTOR FAIL] ${path.relative(ROOT, targetScript)}: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
