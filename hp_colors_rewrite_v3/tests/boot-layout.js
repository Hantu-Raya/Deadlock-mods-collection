'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const v8 = require('node:v8');
const nodeTest = require('node:test');
const adapter = require('../../scripts/hp-colors-panorama-test-adapter.js');
const sourceRoot = path.resolve(process.env.HPV3_SOURCE_ROOT || path.join(__dirname, '..'));

// Whole-codebase audit 3 (P2): every Escape-menu fixture is ~10 MiB of mock panels and each file
// boots hundreds of VM contexts. They are garbage once a test ends, but V8 may defer collecting
// them, so a file's peak memory depended on GC timing. The harness bounds it: each script source
// compiles once per process (one shared vm.Script, run in every context), each layout file parses
// once, and after any test that leaves more than HEAP_LIMIT of heap, finished fixtures are
// collected before the next test starts. The live set between tests is ~10 MiB, so this only
// removes garbage; it changes no test behavior.
const HEAP_LIMIT = 128 * 1048576;
v8.setFlagsFromString('--expose-gc');
const collect = vm.runInNewContext('gc');
const heapStats = { collections: 0, compiled: 0, reused: 0 };
nodeTest.afterEach(() => {
  if (process.memoryUsage().heapUsed > HEAP_LIMIT) { collect(); heapStats.collections++; }
});
const scripts = new Map();
function runInVm(source, context, filename = 'panorama-test.js') {
  const key = filename + '\n' + source;
  let script = scripts.get(key);
  if (script) heapStats.reused++;
  else { script = new vm.Script(source, { filename }); scripts.set(key, script); heapStats.compiled++; }
  if (!vm.isContext(context)) vm.createContext(context);
  return script.runInContext(context);
}
const layouts = new Map();
function readLayout(file) {
  const text = fs.readFileSync(file, 'utf8'), cached = layouts.get(file);
  if (cached && cached.text === text) return cached.tree;
  const tree = parseLayout(text);
  layouts.set(file, { text, tree });
  return tree;
}

// Live 6779/6782: some style properties are aliases of a base property. Assigning "" or null to an
// alias alone throws "Cannot set a property alias to undefined, only a base property" (6779:
// margin/font/animation longhands and borderColor; 6782: horizontalAlign, seen as a preview paint
// failure; 6785: backgroundSize, releasing the pickup track on HERO -> UNITS). The background layer
// longhands are modelled as one group: clearing backgroundImage clears them too (panorama.dll describes
// the image as "combined with" position/size/texture-size/repeat), and, as live 6785 showed, reading
// backgroundImage back from a panel with layer longhands returns the whole layer
// ("url( ... )  / 100.0% 100.0% unset unset"), which is rejected when written back. Every v3 test runs
// against this: the style setter of every mock panel (constructor, CreatePanel and test-assigned bags)
// is wrapped once on the shared prototype. textAlign has no evidence of being an alias and is not listed.
const BACKGROUND_LAYER = ['backgroundPosition', 'backgroundSize', 'backgroundTextureSize', 'backgroundRepeat'];
const STYLE_ALIASES = new Set(['horizontalAlign', 'verticalAlign', 'borderColor', ...BACKGROUND_LAYER,
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch',
  'animationName', 'animationDuration', 'animationTimingFunction', 'animationDelay',
  'animationIterationCount', 'animationDirection', 'animationFillMode', 'animationFrameTime']);
// Live 6793 (2026-10-17): inline style writes do not resolve stylesheet colour macros; the game threw
// "Invalid value for property 'wash-color': offBlack". Stylesheets may use them, scripts may not.
const COLOR_PROPERTIES = new Set(['washColor', 'color', 'backgroundColor', 'borderColor']);
const COLOR_MACRO = /\b(offBlack|offWhite|colorEnemy|colorFriend|brandGreen|team1ColorDark|team2ColorDark|team1Color|team2Color)\b/;
const aliasGuards = new WeakMap();
function aliasGuard(bag) {
  if (!bag || typeof bag !== 'object') return bag;
  if (!aliasGuards.has(bag)) aliasGuards.set(bag, new Proxy(bag, {
    get(target, property) {
      const value = target[property];
      if (property !== 'backgroundImage' || !value || !BACKGROUND_LAYER.some(key => Object.hasOwn(target, key))) return value;
      return value + '  / ' + BACKGROUND_LAYER.map(key => target[key] || 'unset').join(' ');
    },
    set(target, property, value) {
      const unset = value === '' || value === null || value === undefined;
      if (STYLE_ALIASES.has(String(property)) && unset)
        throw new Error('Cannot set a property alias to undefined, only a base property, we don\'t support unset of alias alone (' + String(property) + '=' + JSON.stringify(value === undefined ? '' : value) + ')');
      if (property === 'backgroundImage' && / \/ /.test(String(value))) throw new Error('Invalid value for property \'background-image\': ' + value);
      if (COLOR_PROPERTIES.has(String(property)) && COLOR_MACRO.test(String(value)))
        throw new Error('Invalid value for property \'' + String(property).replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + '\': ' + value);
      if (property === 'backgroundImage' && unset) for (const key of BACKGROUND_LAYER) if (Object.hasOwn(target, key)) delete target[key];
      target[property] = value; return true;
    },
  }));
  return aliasGuards.get(bag);
}
if (!Object.getOwnPropertyDescriptor(adapter.MockPanel.prototype, 'style')) {
  const bags = new WeakMap();
  Object.defineProperty(adapter.MockPanel.prototype, 'style', {
    configurable: true,
    get() { return bags.get(this); },
    set(value) { bags.set(this, aliasGuard(value)); },
  });
}

function releaseLogging() { throw new Error('Release invoked logging'); }
// Live 6785: Slider value writes (including sync) emit native and panel value events.
// Sliders swallow mouse panel events; only the native SliderReleased ends a drag.
function sliderEvent(harness, name, panel) {
  for (const entry of harness.handlerEntries.slice()) {
    if (entry.panel === panel && entry.eventName === name) entry.handler(panel, String(panel.value));
  }
}
function nativeSlider(panel, harness) {
  if (panel.type !== 'Slider') return panel;
  let value = panel.value;
  Object.defineProperty(panel, 'value', {
    configurable: true,
    get: () => value,
    set: next => {
      value = next;
      sliderEvent(harness, 'SliderValueChanged', panel);
      if (panel.events.onvaluechanged) panel.events.onvaluechanged();
    },
  });
  const setEvent = panel.SetPanelEvent.bind(panel);
  panel.SetPanelEvent = (name, handler) => setEvent(name,
    name === 'onmousedown' || name === 'onmouseup' ? () => {} : handler);
  return panel;
}
function createPanoramaHarness(options) {
  const harness = adapter.createPanoramaHarness(options);
  const create = harness.$.CreatePanel;
  harness.$.CreatePanel = (...args) => nativeSlider(create(...args), harness);
  harness.releaseSlider = panel => sliderEvent(harness, 'SliderReleased', panel);
  if (process.env.HPV3_DEBUG !== '1') {
    harness.$.Msg = releaseLogging;
    harness.$.Warning = releaseLogging;
  }
  return harness;
}
function createVmContext(harness, options) {
  const context = adapter.createVmContext(harness, options);
  if (process.env.HPV3_DEBUG !== '1') {
    context.console = { ...context.console, log: releaseLogging, warn: releaseLogging, error: releaseLogging };
  }
  return context;
}

function latestPublishedConfig(harness) {
  for (let i = harness.dispatches.length - 1; i >= 0; i--) {
    const [event, raw] = harness.dispatches[i];
    if (event !== 'ClientUI_FireOutput') continue;
    let config;
    try { config = JSON.parse(raw); } catch (_) { continue; }
    if (config && config.magic === 'HP_COLORS_V3_CONFIG') return config;
  }
  return undefined;
}

// Only XML syntax used by these static layouts; snippets remain templates, not live panels.
function parseLayout(text) {
  const document = { tag: 'document', attrs: {}, children: [] };
  const stack = [document];
  for (const match of text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([^>]+)>/g)) {
    const token = match[1];
    if (token.startsWith('?')) continue;
    if (token.startsWith('/')) { stack.pop(); continue; }
    const node = { tag: token.match(/^\S+/)[0], attrs: {}, children: [] };
    for (const attr of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
      node.attrs[attr[1]] = attr[2].replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }
    stack[stack.length - 1].children.push(node);
    if (!token.endsWith('/')) stack.push(node);
  }
  return document.children[0];
}

function loadLayout(relative, options = {}) {
  const layoutRoot = path.resolve(options.sourceRoot || sourceRoot);
  const tree = readLayout(path.join(layoutRoot, 'panorama/layout', relative));
  const harness = createPanoramaHarness(options.harnessOptions);
  const context = createVmContext(harness);
  // Live 6779 (console.log 2026-10-14): the Escape-menu layout context has no GameUI global;
  // using it throws ReferenceError. Other layouts keep the adapter's GameUI unless told otherwise.
  const includeGameUI = options.includeGameUI !== undefined ? options.includeGameUI : relative !== 'hud_escape_menu.xml';
  if (!includeGameUI) delete context.GameUI;
  const panelNode = tree.children.find(node => !['scripts', 'styles', 'snippets'].includes(node.tag));
  function add(node, parent) {
    const panel = nativeSlider(new adapter.MockPanel(node.tag, parent, node.attrs.id || ''), harness);
    panel.classes = (node.attrs.class || '').split(/\s+/).filter(Boolean);
    panel.text = node.attrs.text || '';
    for (const [key, value] of Object.entries(node.attrs)) panel.SetAttributeString(key, value);
    for (const child of node.children) add(child, panel);
    return panel;
  }
  function mount() {
    harness.contextPanel = add(panelNode, harness.root);
    harness.contextPanel.HPColorsV3Sheets = tree.children.find(node => node.tag === 'styles').children
      .map(node => node.attrs.src.replace('s2r://', '').replace('.vcss_c', '.css'));
    return harness.contextPanel;
  }
  if (!options.latePanels) mount();
  const includes = tree.children.find(node => node.tag === 'scripts');
  function includeScripts() {
    for (const node of includes.children) {
      const relativePath = node.attrs.src.replace('s2r://', '').replace('.vjs_c', '.js');
      if ((options.skipScripts || []).includes(path.basename(relativePath, '.js'))) continue;
      // Variant lanes load scripts from several roots; null means the caller supplies it.
      const file = options.resolveScript ? options.resolveScript(relativePath) : path.join(layoutRoot, relativePath);
      if (file === null) continue;
      runInVm(fs.readFileSync(file, 'utf8'), context, relativePath);
    }
  }
  function onload() {
    if (panelNode.attrs.onload) runInVm(panelNode.attrs.onload, context, relative + ':onload');
  }
  return { harness, context, tree, panelNode, mount, includeScripts, onload };
}

module.exports = { ...adapter, runInVm, heapStats, createPanoramaHarness, createVmContext, sourceRoot, parseLayout, loadLayout, latestPublishedConfig };
