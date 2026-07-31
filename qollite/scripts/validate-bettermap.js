'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Panel {
  constructor(id, type, parent) {
    this.id = id;
    this.type = type;
    this.parent = parent || null;
    this.children = [];
    this.classes = new Set();
    this.events = Object.create(null);
    this.style = {};
    this.attributes = Object.create(null);
    this.deleted = false;
    this.selected = false;
    if (parent) {
      parent.children.push(this);
    }
  }

  FindChildTraverse(id) {
    if (this.id === id) {
      return this;
    }
    for (const child of this.children) {
      const match = child.FindChildTraverse(id);
      if (match) {
        return match;
      }
    }
    return null;
  }

  GetChildCount() {
    return this.children.length;
  }

  GetChild(index) {
    return this.children[index] || null;
  }

  AddClass(name) {
    this.classes.add(name);
  }

  RemoveClass(name) {
    this.classes.delete(name);
  }

  BHasClass(name) {
    return this.classes.has(name);
  }

  SetAttributeString(name, value) {
    this.attributes[name] = String(value);
  }

  GetAttributeString(name, fallback) {
    return this.attributes[name] === undefined ? fallback : this.attributes[name];
  }

  SetPanelEvent(name, handler) {
    this.events[name] = handler;
  }

  SetSelected(value) {
    this.selected = !!value;
  }

  IsSelected() {
    return this.selected;
  }

  DeleteAsync() {
    this.deleted = true;
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
  }
}

function createSettings() {
  const definitions = new Map();
  const values = new Map();
  const listeners = new Map();

  function normalized(id, next) {
    const definition = definitions.get(id);
    return definition.normalize ? definition.normalize(next) : next;
  }

  return {
    define(id, definition) {
      definitions.set(id, definition);
      values.set(id, normalized(id, { ...definition.defaults }));
    },
    get(id, key) {
      const value = values.get(id);
      return key === undefined ? { ...value } : value[key];
    },
    patch(id, patch) {
      const value = normalized(id, { ...values.get(id), ...patch });
      values.set(id, value);
      for (const listener of listeners.get(id) || []) {
        listener({ ...value });
      }
    },
    subscribe(id, listener) {
      const registered = listeners.get(id) || new Set();
      registered.add(listener);
      listeners.set(id, registered);
      return () => registered.delete(listener);
    }
  };
}

function createRuntime(panels) {
  return {
    find(id) {
      return panels[id] || null;
    },
    register(name, feature) {
      this.features = this.features || {};
      this.features[name] = feature;
    },
    setClass(panel, name, enabled) {
      if (enabled) {
        panel.AddClass(name);
      } else {
        panel.RemoveClass(name);
      }
    },
    setStyle(panel, key, value) {
      if (value === undefined) {
        delete panel.style[key];
      } else {
        panel.style[key] = value;
      }
    },
    schedule(owner, delay, callback) {
      this.scheduled = this.scheduled || {};
      this.scheduled[owner] = { callback, delay };
    },
    cancel(owner) {
      if (this.scheduled) {
        delete this.scheduled[owner];
      }
    },
    run(owner) {
      const scheduled = this.scheduled && this.scheduled[owner];
      if (scheduled) {
        delete this.scheduled[owner];
        scheduled.callback();
      }
    }
  };
}

function loadFeature() {
  const hud = new Panel('gameplay_hud', 'Panel');
  const minimapPerspective = new Panel('minimap_persp', 'Panel', hud);
  const minimapContainer = new Panel('minimap_container', 'Panel', minimapPerspective);
  const minimapShell = new Panel('HudMinimapContainer', 'Panel', minimapContainer);
  const minimapFrame = new Panel('minimap_frame', 'Panel', minimapContainer);
  const minimap = new Panel('hud_minimap', 'HudMinimap', minimapShell);
  const baseLayer = new Panel('NewMinimapBackgroundsContainer', 'Panel', minimap);
  baseLayer.AddClass('NewMinimapBackgroundsContainer');
  const mapRender = new Panel('map_render', 'Panel', minimap);
  const marker = new Panel('marker', 'Button', minimap);
  marker.AddClass('map_button');
  const tunnel = new Panel('tunnel', 'Button', minimap);
  tunnel.AddClass('shop_tunnel');
  const panels = {
    gameplay_hud: hud,
    hud_minimap: minimap,
    minimap_container: minimapContainer,
    minimap_frame: minimapFrame,
    minimap_persp: minimapPerspective
  };
  const settings = createSettings();
  const runtime = createRuntime(panels);
  const umm = {
    announcements: [],
    register(id, schema) {
      this.schema = { id, schema };
      settings.define(id, schema);
    },
    announce(id) {
      this.announcements.push(id);
    }
  };
  const game = {
    now: 0,
    GetGameTime() {
      return this.now;
    }
  };
  const config = { QolLite: { Settings: settings, Runtime: runtime, UMM: umm } };
  const context = vm.createContext({
    Game: game,
    GameUI: { CustomUIConfig: () => config },
    $: {
      CreatePanel(type, parent, id) {
        return new Panel(id, type, parent);
      }
    }
  });
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'panorama', 'scripts', 'qollite_bettermap.js'),
    'utf8'
  );
  vm.runInContext(source, context, { filename: 'qollite_bettermap.js' });
  return {
    baseLayer,
    config,
    game,
    hud,
    mapRender,
    marker,
    minimap,
    minimapContainer,
    minimapFrame,
    minimapPerspective,
    runtime,
    settings,
    tunnel,
    umm
  };
}

const fixture = loadFeature();
const feature = fixture.config.QolLite.BetterMap;

assert.equal(fixture.settings.get('betterMap', 'minimalMap'), false);
assert.equal(fixture.settings.get('betterMap', 'minimalMapOpacity'), 0.9);
assert.deepEqual(fixture.settings.get('betterMap'), {
  autoUndergroundLevel: false,
  corner: 'bottom-right',
  fullWidth: false,
  largerWhenTargeting: false,
  mapOpacity: 1,
  markerOpacity: 1,
  markerSize: 1,
  minimalMap: false,
  minimalMapOpacity: 0.9,
  objectsFromSeconds: 180,
  offsetX: 0,
  offsetY: 0,
  showCrates: false,
  showGoldenStatues: false,
  showSmallObjects: false,
  size: 380,
  urnTracker: false
});
assert.equal(fixture.umm.schema.id, 'betterMap');
assert.deepEqual(fixture.umm.announcements, ['betterMap']);
feature.init();
assert.equal(fixture.minimap.BHasClass('qollite-minimal-map'), false);
assert.equal(fixture.minimapPerspective.BHasClass('qollite-minimal-map'), false);
assert.equal(fixture.baseLayer.style.opacity, undefined);
assert.equal(fixture.minimap.BHasClass('qollite-objects-ready'), false);
assert.equal(fixture.runtime.scheduled['betterMap-objects-ready'].delay, 1);
const controls = fixture.minimapPerspective.FindChildTraverse('qollite_minimal_map_controls');
const toggle = controls.FindChildTraverse('qollite_minimal_map_toggle');
const slider = controls.FindChildTraverse('qollite_minimal_map_opacity');
assert.equal(toggle.IsSelected(), false);
assert.equal(slider.value, 0.9);
toggle.SetSelected(true);
toggle.events.onactivate();
assert.equal(fixture.settings.get('betterMap', 'minimalMap'), true);
assert.equal(fixture.minimap.BHasClass('qollite-minimal-map'), true);
slider.value = 0;
slider.events.onvaluechanged();
assert.equal(fixture.settings.get('betterMap', 'minimalMapOpacity'), 0);
assert.equal(fixture.baseLayer.style.opacity, 0);

fixture.settings.patch('betterMap', { minimalMap: true, minimalMapOpacity: 0.9 });
assert.equal(fixture.minimap.BHasClass('qollite-minimal-map'), true);
assert.equal(fixture.minimapPerspective.BHasClass('qollite-minimal-map'), true);
assert.equal(fixture.baseLayer.style.opacity, 0.9);
assert.deepEqual(fixture.mapRender.style, {});
assert.deepEqual(fixture.marker.style, {});
assert.deepEqual(fixture.tunnel.style, {});

fixture.settings.patch('betterMap', {
  autoUndergroundLevel: true,
  corner: 'top-left',
  fullWidth: true,
  largerWhenTargeting: true,
  mapOpacity: 0.4,
  minimalMap: false,
  markerOpacity: 0.4,
  markerSize: 3,
  objectsFromSeconds: 90,
  offsetX: 10,
  offsetY: 20,
  showCrates: true,
  showGoldenStatues: true,
  showSmallObjects: true,
  size: 620,
  urnTracker: true
});
assert.equal(fixture.minimapPerspective.GetAttributeString('data-qollite-map-size', ''), '620');
assert.equal(fixture.minimapPerspective.GetAttributeString('data-qollite-map-corner', ''), 'top-left');
assert.equal(fixture.minimap.GetAttributeString('data-qollite-objects-from-seconds', ''), '90');
assert.equal(fixture.minimapPerspective.BHasClass('qollite-map-corner-top-left'), true);
assert.equal(fixture.minimap.BHasClass('qollite-show-crates'), true);
assert.equal(fixture.minimap.BHasClass('qollite-auto-underground-level'), true);
assert.equal(fixture.minimapPerspective.BHasClass('qollite-larger-when-targeting'), true);
assert.equal(fixture.minimap.BHasClass('qollite-show-golden-statues'), true);
assert.equal(fixture.minimap.BHasClass('qollite-show-small-objects'), true);
assert.equal(fixture.minimap.BHasClass('qollite-urn-tracker'), true);
assert.equal(fixture.hud.BHasClass('qollite-full-width-hud'), true);
assert.equal(fixture.minimapContainer.style.width, '620px');
assert.equal(fixture.minimapContainer.style.marginLeft, '10%');
assert.equal(fixture.minimapContainer.style.marginTop, '20%');
assert.equal(fixture.baseLayer.style.opacity, 0.4);
assert.equal(fixture.marker.BHasClass('qollite-adjustable-marker'), true);
fixture.minimap.AddClass('is_underground');
feature.refresh();
assert.deepEqual(fixture.mapRender.style, {});
fixture.game.now = 90;
fixture.runtime.run('betterMap-objects-ready');
assert.equal(fixture.minimap.BHasClass('qollite-objects-ready'), true);
assert.equal(fixture.runtime.scheduled['betterMap-objects-ready'].delay, 1);
assert.equal(fixture.marker.style.opacity, 0.4);
assert.equal(fixture.tunnel.BHasClass('qollite-adjustable-marker'), false);
assert.deepEqual(fixture.tunnel.style, {});
fixture.settings.patch('betterMap', { markerSize: 40, size: 900 });
assert.equal(fixture.settings.get('betterMap', 'markerSize'), 8);
assert.equal(fixture.settings.get('betterMap', 'size'), 800);
feature.resetMap();
assert.deepEqual(
  {
    corner: fixture.settings.get('betterMap', 'corner'),
    fullWidth: fixture.settings.get('betterMap', 'fullWidth'),
    largerWhenTargeting: fixture.settings.get('betterMap', 'largerWhenTargeting'),
    mapOpacity: fixture.settings.get('betterMap', 'mapOpacity'),
    minimalMap: fixture.settings.get('betterMap', 'minimalMap'),
    minimalMapOpacity: fixture.settings.get('betterMap', 'minimalMapOpacity'),
    offsetX: fixture.settings.get('betterMap', 'offsetX'),
    offsetY: fixture.settings.get('betterMap', 'offsetY'),
    size: fixture.settings.get('betterMap', 'size')
  },
  {
    corner: 'bottom-right',
    fullWidth: false,
    largerWhenTargeting: false,
    mapOpacity: 1,
    minimalMap: false,
    minimalMapOpacity: 0.9,
    offsetX: 0,
    offsetY: 0,
    size: 380
  }
);
feature.resetMarkers();
assert.deepEqual(
  {
    autoUndergroundLevel: fixture.settings.get('betterMap', 'autoUndergroundLevel'),
    markerOpacity: fixture.settings.get('betterMap', 'markerOpacity'),
    markerSize: fixture.settings.get('betterMap', 'markerSize'),
    objectsFromSeconds: fixture.settings.get('betterMap', 'objectsFromSeconds'),
    showCrates: fixture.settings.get('betterMap', 'showCrates'),
    showGoldenStatues: fixture.settings.get('betterMap', 'showGoldenStatues'),
    showSmallObjects: fixture.settings.get('betterMap', 'showSmallObjects'),
    urnTracker: fixture.settings.get('betterMap', 'urnTracker')
  },
  {
    autoUndergroundLevel: false,
    markerOpacity: 1,
    markerSize: 1,
    objectsFromSeconds: 180,
    showCrates: false,
    showGoldenStatues: false,
    showSmallObjects: false,
    urnTracker: false
  }
);

fixture.settings.patch('betterMap', { minimalMap: true, minimalMapOpacity: -4 });
assert.equal(fixture.settings.get('betterMap', 'minimalMapOpacity'), 0);
assert.equal(fixture.baseLayer.style.opacity, 0);
fixture.settings.patch('betterMap', { minimalMapOpacity: 4 });
assert.equal(fixture.settings.get('betterMap', 'minimalMapOpacity'), 1);
assert.equal(fixture.baseLayer.style.opacity, undefined);
fixture.settings.patch('betterMap', { minimalMapOpacity: '0.25' });
assert.equal(fixture.settings.get('betterMap', 'minimalMapOpacity'), 0.25);
assert.equal(fixture.baseLayer.style.opacity, 0.25);

const controlsBeforeRefresh = fixture.minimapPerspective.FindChildTraverse('qollite_minimal_map_controls');
feature.refresh();
assert.strictEqual(
  fixture.minimapPerspective.FindChildTraverse('qollite_minimal_map_controls'),
  controlsBeforeRefresh
);

feature.destroy();
assert.equal(fixture.minimap.BHasClass('qollite-minimal-map'), false);
assert.equal(fixture.minimapPerspective.BHasClass('qollite-minimal-map'), false);
assert.equal(fixture.baseLayer.style.opacity, undefined);
assert.equal(fixture.minimapPerspective.FindChildTraverse('qollite_minimal_map_controls'), null);
assert.equal(fixture.minimap.BHasClass('qollite-objects-ready'), false);
assert.equal(fixture.runtime.scheduled['betterMap-objects-ready'], undefined);
fixture.settings.patch('betterMap', { minimalMap: true });
assert.equal(fixture.minimap.BHasClass('qollite-minimal-map'), false);
assert.deepEqual(fixture.mapRender.style, {});
assert.deepEqual(fixture.marker.style, {});
assert.deepEqual(fixture.tunnel.style, {});

console.log('validate-bettermap: passed');
