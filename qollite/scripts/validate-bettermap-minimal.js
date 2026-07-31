#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class Panel {
  constructor(id) {
    this.id = id;
    this.children = [];
    this.classes = new Set();
    this.events = {};
    this.style = {};
    this.value = 0;
    this.selected = false;
  }

  add(child) {
    this.children.push(child);
    return child;
  }

  FindChildTraverse(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }
  FindChildrenWithClassTraverse(className) {
    const found = [];
    for (const child of this.children) {
      if (child.BHasClass(className)) found.push(child);
      found.push(...child.FindChildrenWithClassTraverse(className));
    }
    return found;
  }


  SetHasClass(className, enabled) {
    if (enabled) this.classes.add(className);
    else this.classes.delete(className);
  }

  BHasClass(className) {
    return this.classes.has(className);
  }

  SetSelected(selected) {
    this.selected = !!selected;
  }

  SetPanelEvent(name, callback) {
    this.events[name] = callback;
  }
}

function trigger(panel, event) {
  assert(typeof panel.events[event] === 'function', `${panel.id} must bind ${event}`);
  panel.events[event]();
}

function makeRuntime() {
  const root = new Panel('root');
  const hud = root.add(new Panel('hud_minimap'));
  const perspective = root.add(new Panel('minimap_persp'));
  const mapRender = hud.add(new Panel('map_render'));
  mapRender.style.opacity = '0.2';
  const canvas = mapRender.add(new Panel('canvas'));
  const lowerBackground = mapRender.add(new Panel('lower_background'));
  lowerBackground.SetHasClass('backgroundImage', true);
  const upperBackground = hud.add(new Panel('upper_background'));
  upperBackground.SetHasClass('backgroundImage', true);
  const tunnelParent = mapRender.add(new Panel('tunnel_overlay'));
  tunnelParent.style.opacity = '1.0';
  const markerParent = mapRender.add(new Panel('marker_parent'));
  markerParent.style.opacity = '1.0';
  const toggle = root.add(new Panel('minimap_minimal_toggle'));
  const opacitySetting = root.add(new Panel('minimap_minimal_opacity_slider'));
  const opacitySlider = opacitySetting.add(new Panel('Slider'));
  const context = {
    console,
    $: { GetContextPanel: () => root },
  };

  return {
    context,
    hud,
    perspective,
    mapRender,
    baseLayers: [canvas, lowerBackground, upperBackground],
    tunnelParent,
    markerParent,
    toggle,
    opacitySlider,
  };
}

function load(runtime, filename) {
  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    runtime.context,
    { filename },
  );
}

const scripts = path.join(__dirname, '..', 'panorama', 'scripts');
const runtime = makeRuntime();
load(runtime, path.join(scripts, 'qollite_map_state.js'));
load(runtime, path.join(scripts, 'qollite_map_minimal.js'));

const { QolLiteMapState, QolLiteMapMinimal } = runtime.context;
function assertBaseOpacity(opacity, phase) {
  for (const panel of runtime.baseLayers) {
    assert(Number(panel.style.opacity) === opacity, `${phase} must set ${panel.id} opacity`);
  }
}

function assertRenderOpacityOwnership(phase) {
  assert(runtime.mapRender.style.opacity === '0.2', `${phase} must leave map_render opacity to CSS`);
  for (const panel of [runtime.tunnelParent, runtime.markerParent]) {
    assert(Number(panel.style.opacity) === 1, `${phase} must leave ${panel.id} fully opaque`);
  }
}

assert(QolLiteMapState.get().minimalMap === false, 'minimalist minimap must default disabled');
assert(QolLiteMapState.get().minimalMapOpacity === 0.9, 'minimalist opacity must default to 0.9');

QolLiteMapMinimal.init();
assert(!runtime.hud.BHasClass('BmMinimalMap'), 'default state must clear the HUD minimalist class');
assert(!runtime.perspective.BHasClass('BmMinimalMap'), 'default state must clear the perspective minimalist class');
assertBaseOpacity(1, 'default state');
assertRenderOpacityOwnership('default state');
assert(runtime.opacitySlider.value === 0.9, 'init must synchronize the opacity slider');

trigger(runtime.toggle, 'onactivate');
assert(QolLiteMapState.get().minimalMap === true, 'toggle must enable minimalist minimap');
assert(runtime.toggle.selected, 'toggle must synchronize enabled state');
assert(runtime.hud.BHasClass('BmMinimalMap'), 'enabling must apply the HUD minimalist class');
assert(runtime.perspective.BHasClass('BmMinimalMap'), 'enabling must apply the perspective minimalist class');
assertBaseOpacity(0.9, 'enabling');
assertRenderOpacityOwnership('enabling');

runtime.opacitySlider.value = 0;
trigger(runtime.opacitySlider, 'onvaluechanged');
assert(QolLiteMapState.get().minimalMapOpacity === 0, 'slider must preserve exact zero opacity');
assertBaseOpacity(0, 'zero opacity');
assertRenderOpacityOwnership('zero opacity');

runtime.opacitySlider.value = -0.5;
trigger(runtime.opacitySlider, 'onvaluechanged');
assert(QolLiteMapState.get().minimalMapOpacity === 0, 'slider must clamp opacity below zero');
assertBaseOpacity(0, 'low clamp');

runtime.opacitySlider.value = 1.5;
trigger(runtime.opacitySlider, 'onvaluechanged');
assert(QolLiteMapState.get().minimalMapOpacity === 1, 'slider must clamp opacity above one');
assertBaseOpacity(1, 'high clamp');

QolLiteMapState.patch({ minimalMapOpacity: 0.37 });
QolLiteMapMinimal.refresh();
assert(runtime.opacitySlider.value === 0.37, 'refresh must synchronize externally changed opacity');
assertBaseOpacity(0.37, 'refresh');
assertRenderOpacityOwnership('refresh');

trigger(runtime.toggle, 'onactivate');
assert(QolLiteMapState.get().minimalMap === false, 'toggle must disable minimalist minimap');
assert(!runtime.toggle.selected, 'toggle must synchronize disabled state');
assert(!runtime.hud.BHasClass('BmMinimalMap'), 'disabling must remove the HUD minimalist class');
assert(!runtime.perspective.BHasClass('BmMinimalMap'), 'disabling must remove the perspective minimalist class');
assertBaseOpacity(1, 'disable cleanup');
assertRenderOpacityOwnership('disable cleanup');

const minimapCss = fs.readFileSync(
  path.join(__dirname, '..', 'panorama', 'styles', 'hud_minimap.css'),
  'utf8'
);
const undergroundHudRule = minimapCss.match(/\.is_underground #hud_minimap\s*\{([^}]*)\}/);
assert(undergroundHudRule, 'underground minimap must define its background behavior');
assert(
  /background-color:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(undergroundHudRule[1]),
  'underground minimap backing must be transparent'
);

const undergroundRenderRule = minimapCss.match(/\.is_underground #map_render\s*\{([^}]*)\}/);
assert(undergroundRenderRule, 'underground minimap must define map-render visibility');
assert(
  /opacity:\s*0\.3\s*;/.test(undergroundRenderRule[1]),
  'underground map texture must use 0.3 opacity'
);
assert(
  /brightness:\s*0\.01\s*;/.test(undergroundRenderRule[1]),
  'underground map texture must use 0.01 brightness'
);
const undergroundMinimalRenderRule = minimapCss.match(
  /\.is_underground #hud_minimap\.BmMinimalMap #map_render,\s*#hud_minimap\.BmMinimalMap\.is_underground #map_render\s*\{([^}]*)\}/
);
assert(undergroundMinimalRenderRule, 'minimalist underground minimap must define map-render visibility');
assert(
  /opacity:\s*0\.3\s*;/.test(undergroundMinimalRenderRule[1]),
  'minimalist underground map texture must use 0.3 opacity'
);
assert(
  /brightness:\s*0\.01\s*;/.test(undergroundMinimalRenderRule[1]),
  'minimalist underground map texture must use 0.01 brightness'
);

const minimalistHiddenLayersRule = minimapCss.match(
  /#hud_minimap\.BmMinimalMap \.newMinimapBackground\.backgroundImage,[^{]+\{([^}]*)\}/
);
assert(minimalistHiddenLayersRule, 'minimalist minimap must define hidden background layers');
assert(
  /visibility:\s*collapse\s*;/.test(minimalistHiddenLayersRule[1]),
  'minimalist background layers must collapse so inline opacity cannot reveal them'
);

console.log('PASS validate-bettermap-minimal');
