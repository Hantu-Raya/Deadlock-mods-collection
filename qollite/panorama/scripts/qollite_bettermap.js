(function () {
  'use strict';

  if (typeof GameUI === "undefined" || !GameUI.CustomUIConfig) return;
  var config = GameUI.CustomUIConfig();
  var QolLite = config.QolLite = config.QolLite || {};
  var Runtime = QolLite.Runtime;
  var Settings = QolLite.Settings;
  var UMM = QolLite.UMM;
  var featureId = 'betterMap';
  var minimalMapClass = 'qollite-minimal-map';
  var mapDefaults = {
    corner: 'bottom-right',
    fullWidth: false,
    largerWhenTargeting: false,
    mapOpacity: 1,
    minimalMap: false,
    minimalMapOpacity: 0.9,
    offsetX: 0,
    offsetY: 0,
    size: 380
  };
  var markerDefaults = {
    autoUndergroundLevel: false,
    markerOpacity: 1,
    markerSize: 1,
    objectsFromSeconds: 180,
    showCrates: false,
    showGoldenStatues: false,
    showSmallObjects: false,
    urnTracker: false
  };
  var state = {
    baseLayer: null,
    baseLayerOpacity: undefined,
    controls: null,
    destroyControls: false,
    initialized: false,
    layoutStyles: [],
    markerStyles: [],
    generation: 0,
    unsubscribe: null
  };

  function clampNumber(value, minimum, maximum, fallback, rounded) {
    var number = Number(value);
    if (isNaN(number)) {
      return fallback;
    }
    number = Math.max(minimum, Math.min(maximum, number));
    return rounded ? Math.round(number) : number;
  }

  function clampOpacity(value) {
    return clampNumber(value, 0, 1, 0.9, false);
  }

  function normalizeCorner(value) {
    return value === 'top-left' || value === 'top-right' || value === 'bottom-left' || value === 'bottom-right'
      ? value
      : mapDefaults.corner;
  }

  function findPanel(id, root) {
    if (!Runtime || typeof Runtime.find !== 'function') {
      return null;
    }
    return Runtime.find(id, root) || null;
  }

  function setClass(panel, name, enabled) {
    if (!panel) {
      return;
    }
    if (Runtime && typeof Runtime.setClass === 'function') {
      Runtime.setClass(panel, name, enabled);
      return;
    }
    if (enabled && typeof panel.AddClass === 'function') {
      panel.AddClass(name);
    } else if (!enabled && typeof panel.RemoveClass === 'function') {
      panel.RemoveClass(name);
    }
  }

  function setStyle(panel, property, value) {
    if (!panel) {
      return;
    }
    if (Runtime && typeof Runtime.setStyle === 'function') {
      Runtime.setStyle(panel, property, value);
      return;
    }
    if (panel.style) {
      panel.style[property] = value;
    }
  }

  function setAttribute(panel, name, value) {
    if (panel && typeof panel.SetAttributeString === 'function') {
      panel.SetAttributeString(name, String(value));
    }
  }

  function hasClass(panel, name) {
    return !!(panel && typeof panel.BHasClass === 'function' && panel.BHasClass(name));
  }

  function findBaseLayer(panel) {
    var childCount;
    var index;
    var child;
    if (!panel) {
      return null;
    }
    if (panel.id === 'NewMinimapBackgroundsContainer' || hasClass(panel, 'NewMinimapBackgroundsContainer')) {
      return panel;
    }
    if (typeof panel.GetChildCount !== 'function' || typeof panel.GetChild !== 'function') {
      return null;
    }
    childCount = panel.GetChildCount();
    for (index = 0; index < childCount; index += 1) {
      child = findBaseLayer(panel.GetChild(index));
      if (child) {
        return child;
      }
    }
    return null;
  }

  function findMarkers(panel, markers) {
    var childCount;
    var index;
    if (!panel) {
      return;
    }
    if (hasClass(panel, 'map_button') && !hasClass(panel, 'shop_tunnel')) {
      markers.push(panel);
    }
    if (typeof panel.GetChildCount !== 'function' || typeof panel.GetChild !== 'function') {
      return;
    }
    childCount = panel.GetChildCount();
    for (index = 0; index < childCount; index += 1) {
      findMarkers(panel.GetChild(index), markers);
    }
  }

  function clearMarkerClasses(minimap) {
    var markers = [];
    var index;
    findMarkers(minimap, markers);
    for (index = 0; index < markers.length; index += 1) {
      setClass(markers[index], 'qollite-adjustable-marker', false);
    }
    setClass(minimap, 'qollite-marker-size-2', false);
    setClass(minimap, 'qollite-marker-size-3', false);
    setClass(minimap, 'qollite-marker-size-4', false);
    setClass(minimap, 'qollite-marker-size-5', false);
    setClass(minimap, 'qollite-marker-size-6', false);
    setClass(minimap, 'qollite-marker-size-7', false);
    setClass(minimap, 'qollite-marker-size-8', false);
    setClass(minimap, 'qollite-show-crates', false);
    setClass(minimap, 'qollite-show-golden-statues', false);
    setClass(minimap, 'qollite-show-small-objects', false);
    setClass(minimap, 'qollite-auto-underground-level', false);
    setClass(minimap, 'qollite-urn-tracker', false);
    setClass(minimap, 'qollite-objects-ready', false);
  }

  function rememberStyle(collection, panel, property) {
    var index;
    if (!panel) {
      return;
    }
    for (index = 0; index < collection.length; index += 1) {
      if (collection[index].panel === panel && collection[index].property === property) {
        return;
      }
    }
    collection.push({
      panel: panel,
      property: property,
      value: panel.style ? panel.style[property] : undefined
    });
  }

  function restoreStyles(collection) {
    var index;
    for (index = 0; index < collection.length; index += 1) {
      setStyle(collection[index].panel, collection[index].property, collection[index].value);
    }
    collection.length = 0;
  }

  function readSettings() {
    return {
      autoUndergroundLevel: !!Settings.get(featureId, 'autoUndergroundLevel'),
      corner: normalizeCorner(Settings.get(featureId, 'corner')),
      fullWidth: !!Settings.get(featureId, 'fullWidth'),
      largerWhenTargeting: !!Settings.get(featureId, 'largerWhenTargeting'),
      mapOpacity: clampNumber(Settings.get(featureId, 'mapOpacity'), 0, 1, 1, false),
      markerOpacity: clampNumber(Settings.get(featureId, 'markerOpacity'), 0, 1, 1, false),
      markerSize: clampNumber(Settings.get(featureId, 'markerSize'), 1, 8, 1, true),
      minimalMap: !!Settings.get(featureId, 'minimalMap'),
      minimalMapOpacity: clampOpacity(Settings.get(featureId, 'minimalMapOpacity')),
      objectsFromSeconds: clampNumber(Settings.get(featureId, 'objectsFromSeconds'), 0, Number.MAX_SAFE_INTEGER, 180, true),
      offsetX: clampNumber(Settings.get(featureId, 'offsetX'), 0, 100, 0, false),
      offsetY: clampNumber(Settings.get(featureId, 'offsetY'), 0, 100, 0, false),
      showCrates: !!Settings.get(featureId, 'showCrates'),
      showGoldenStatues: !!Settings.get(featureId, 'showGoldenStatues'),
      showSmallObjects: !!Settings.get(featureId, 'showSmallObjects'),
      size: clampNumber(Settings.get(featureId, 'size'), 200, 800, 380, true),
      urnTracker: !!Settings.get(featureId, 'urnTracker')
    };
  }

  function updateControls(values) {
    var controls = state.controls;
    var toggle;
    var slider;
    if (!controls || typeof controls.FindChildTraverse !== 'function') {
      return;
    }
    toggle = controls.FindChildTraverse('qollite_minimal_map_toggle');
    slider = controls.FindChildTraverse('qollite_minimal_map_opacity');
    if (toggle && typeof toggle.SetSelected === 'function') {
      toggle.SetSelected(values.minimalMap);
    }
    if (slider) {
      slider.value = values.minimalMapOpacity;
    }
  }

  function bindControls(root) {
    var controls;
    var toggle;
    var slider;
    if (!root || typeof root.FindChildTraverse !== 'function') {
      return;
    }
    controls = root.FindChildTraverse('qollite_minimal_map_controls');
    if (!controls && typeof $.CreatePanel === 'function') {
      controls = $.CreatePanel('Panel', root, 'qollite_minimal_map_controls');
      state.destroyControls = true;
      $.CreatePanel('Label', controls, 'qollite_minimal_map_label').text = 'Minimal map';
      $.CreatePanel('ToggleButton', controls, 'qollite_minimal_map_toggle');
      $.CreatePanel('Slider', controls, 'qollite_minimal_map_opacity');
    }
    if (!controls) {
      return;
    }
    state.controls = controls;
    toggle = controls.FindChildTraverse('qollite_minimal_map_toggle');
    slider = controls.FindChildTraverse('qollite_minimal_map_opacity');
    if (toggle && typeof toggle.SetPanelEvent === 'function') {
      toggle.SetPanelEvent('onactivate', function () {
        var selected = typeof toggle.IsSelected === 'function' ? toggle.IsSelected() : !readSettings().minimalMap;
        Settings.patch(featureId, { minimalMap: selected });
      });
    }
    if (slider) {
      slider.min = 0;
      slider.max = 1;
      slider.increment = 0.01;
      if (typeof slider.SetPanelEvent === 'function') {
        slider.SetPanelEvent('onvaluechanged', function () {
          Settings.patch(featureId, { minimalMapOpacity: clampOpacity(slider.value) });
        });
      }
    }
  }

  function applyLayout(values, perspective, container, frame) {
    var cornerClass;
    var size;
    var rightAligned;
    var bottomAligned;
    restoreStyles(state.layoutStyles);
    cornerClass = 'qollite-map-corner-' + values.corner;
    setClass(perspective, 'qollite-map-corner-top-left', values.corner === 'top-left');
    setClass(perspective, 'qollite-map-corner-top-right', values.corner === 'top-right');
    setClass(perspective, 'qollite-map-corner-bottom-left', values.corner === 'bottom-left');
    setClass(perspective, 'qollite-map-corner-bottom-right', values.corner === 'bottom-right');
    setAttribute(perspective, 'data-qollite-map-corner', values.corner);
    setAttribute(perspective, 'data-qollite-map-size', values.size);
    setAttribute(perspective, 'data-qollite-offset-x', values.offsetX);
    setAttribute(perspective, 'data-qollite-offset-y', values.offsetY);
    setAttribute(perspective, 'data-qollite-map-opacity', values.mapOpacity);
    setClass(perspective, cornerClass, true);
    size = values.size + 'px';
    rightAligned = values.corner === 'top-right' || values.corner === 'bottom-right';
    bottomAligned = values.corner === 'bottom-left' || values.corner === 'bottom-right';
    rememberStyle(state.layoutStyles, perspective, 'width');
    rememberStyle(state.layoutStyles, perspective, 'height');
    rememberStyle(state.layoutStyles, container, 'width');
    rememberStyle(state.layoutStyles, container, 'height');
    rememberStyle(state.layoutStyles, frame, 'width');
    rememberStyle(state.layoutStyles, frame, 'height');
    rememberStyle(state.layoutStyles, container, 'marginLeft');
    rememberStyle(state.layoutStyles, container, 'marginRight');
    rememberStyle(state.layoutStyles, container, 'marginTop');
    rememberStyle(state.layoutStyles, container, 'marginBottom');
    setStyle(perspective, 'width', values.size + 60 + 'px');
    setStyle(perspective, 'height', values.size + 60 + 'px');
    setStyle(container, 'width', size);
    setStyle(container, 'height', size);
    setStyle(frame, 'width', size);
    setStyle(frame, 'height', size);
    setStyle(container, 'marginLeft', rightAligned ? 0 : values.offsetX + '%');
    setStyle(container, 'marginRight', rightAligned ? values.offsetX + '%' : 0);
    setStyle(container, 'marginTop', bottomAligned ? 0 : values.offsetY + '%');
    setStyle(container, 'marginBottom', bottomAligned ? values.offsetY + '%' : 0);
  }

  function applyMarkerOptions(values, minimap) {
    var markers = [];
    var index;
    var marker;
    restoreStyles(state.markerStyles);
    findMarkers(minimap, markers);
    for (index = 0; index < markers.length; index += 1) {
      marker = markers[index];
      setClass(marker, 'qollite-adjustable-marker', values.markerSize !== 1);
      if (values.markerOpacity !== 1) {
        rememberStyle(state.markerStyles, marker, 'opacity');
        setStyle(marker, 'opacity', values.markerOpacity);
      }
    }
    setClass(minimap, 'qollite-marker-size-2', values.markerSize === 2);
    setClass(minimap, 'qollite-marker-size-3', values.markerSize === 3);
    setClass(minimap, 'qollite-marker-size-4', values.markerSize === 4);
    setClass(minimap, 'qollite-marker-size-5', values.markerSize === 5);
    setClass(minimap, 'qollite-marker-size-6', values.markerSize === 6);
    setClass(minimap, 'qollite-marker-size-7', values.markerSize === 7);
    setClass(minimap, 'qollite-marker-size-8', values.markerSize === 8);
    setClass(minimap, 'qollite-show-crates', values.showCrates);
    setClass(minimap, 'qollite-show-golden-statues', values.showGoldenStatues);
    setClass(minimap, 'qollite-show-small-objects', values.showSmallObjects);
    setClass(minimap, 'qollite-auto-underground-level', values.autoUndergroundLevel);
    setClass(minimap, 'qollite-urn-tracker', values.urnTracker);
    setAttribute(minimap, 'data-qollite-marker-opacity', values.markerOpacity);
    setAttribute(minimap, 'data-qollite-marker-size', values.markerSize);
    setAttribute(minimap, 'data-qollite-objects-from-seconds', values.objectsFromSeconds);
  }

  function updateObjectsReady(values, minimap) {
    var gameTime;
    if (typeof Game === 'undefined' || !Game || typeof Game.GetGameTime !== 'function') {
      setClass(minimap, 'qollite-objects-ready', false);
      return;
    }
    try {
      gameTime = Number(Game.GetGameTime());
    } catch (error) {
      setClass(minimap, 'qollite-objects-ready', false);
      return;
    }
    setClass(minimap, 'qollite-objects-ready', !isNaN(gameTime) && gameTime >= values.objectsFromSeconds);
  }

  function scheduleObjectsReady(generation) {
    if (!Runtime || typeof Runtime.schedule !== 'function') {
      return;
    }
    if (typeof Runtime.cancel === 'function') {
      Runtime.cancel('betterMap-objects-ready');
    }
    Runtime.schedule('betterMap-objects-ready', 1, function () {
      if (!state.initialized || state.generation !== generation) {
        return;
      }
      updateObjectsReady(readSettings(), findPanel('hud_minimap'));
      scheduleObjectsReady(generation);
    });
  }

  function render() {
    var minimap = findPanel('hud_minimap');
    var perspective = findPanel('minimap_persp');
    var container = findPanel('minimap_container');
    var frame = findPanel('minimap_frame');
    var hud = findPanel('gameplay_hud');
    var values = readSettings();
    var baseLayer;
    var effectiveOpacity;
    setClass(minimap, minimalMapClass, values.minimalMap);
    setClass(perspective, minimalMapClass, values.minimalMap);
    setClass(perspective, 'qollite-larger-when-targeting', values.largerWhenTargeting);
    setClass(hud, 'qollite-full-width-hud', values.fullWidth);
    applyLayout(values, perspective, container, frame);
    applyMarkerOptions(values, minimap);
    updateObjectsReady(values, minimap);
    baseLayer = findBaseLayer(minimap);
    if (baseLayer !== state.baseLayer) {
      if (state.baseLayer) {
        setStyle(state.baseLayer, 'opacity', state.baseLayerOpacity);
      }
      state.baseLayer = baseLayer;
      state.baseLayerOpacity = baseLayer && baseLayer.style ? baseLayer.style.opacity : undefined;
    }
    effectiveOpacity = values.mapOpacity * (values.minimalMap ? values.minimalMapOpacity : 1);
    if (effectiveOpacity === 1) {
      setStyle(baseLayer, 'opacity', state.baseLayerOpacity);
    } else {
      setStyle(baseLayer, 'opacity', effectiveOpacity);
    }
    updateControls(values);
  }

  function init() {
    var perspective;
    if (state.initialized) {
      render();
      return;
    }
    state.initialized = true;
    state.generation += 1;
    perspective = findPanel('minimap_persp');
    bindControls(perspective);
    state.unsubscribe = Settings.subscribe(featureId, render);
    render();
    scheduleObjectsReady(state.generation);
  }

  function refresh() {
    if (!state.initialized) {
      init();
      return;
    }
    render();
  }

  function resetMap() {
    Settings.patch(featureId, mapDefaults);
  }

  function resetMarkers() {
    Settings.patch(featureId, markerDefaults);
  }

  function destroy() {
    var minimap = findPanel('hud_minimap');
    var perspective = findPanel('minimap_persp');
    var hud = findPanel('gameplay_hud');
    state.generation += 1;
    if (Runtime && typeof Runtime.cancel === 'function') {
      Runtime.cancel('betterMap-objects-ready');
    }
    if (typeof state.unsubscribe === 'function') {
      state.unsubscribe();
    }
    state.unsubscribe = null;
    setClass(minimap, minimalMapClass, false);
    setClass(perspective, minimalMapClass, false);
    setClass(perspective, 'qollite-larger-when-targeting', false);
    setClass(hud, 'qollite-full-width-hud', false);
    setClass(perspective, 'qollite-map-corner-top-left', false);
    setClass(perspective, 'qollite-map-corner-top-right', false);
    setClass(perspective, 'qollite-map-corner-bottom-left', false);
    setClass(perspective, 'qollite-map-corner-bottom-right', false);
    clearMarkerClasses(minimap);
    if (state.baseLayer) {
      setStyle(state.baseLayer, 'opacity', state.baseLayerOpacity);
    }
    restoreStyles(state.layoutStyles);
    restoreStyles(state.markerStyles);
    if (state.destroyControls && state.controls && typeof state.controls.DeleteAsync === 'function') {
      state.controls.DeleteAsync(0);
    }
    state.baseLayer = null;
    state.baseLayerOpacity = undefined;
    state.controls = null;
    state.destroyControls = false;
    state.initialized = false;
  }

  if (!Runtime || !Settings || !UMM || typeof Runtime.register !== 'function' || typeof UMM.register !== 'function' || typeof UMM.announce !== 'function') {
    return;
  }

  UMM.register(featureId, {
    defaults: {
      autoUndergroundLevel: markerDefaults.autoUndergroundLevel,
      corner: mapDefaults.corner,
      fullWidth: mapDefaults.fullWidth,
      largerWhenTargeting: mapDefaults.largerWhenTargeting,
      mapOpacity: mapDefaults.mapOpacity,
      markerOpacity: markerDefaults.markerOpacity,
      markerSize: markerDefaults.markerSize,
      minimalMap: mapDefaults.minimalMap,
      minimalMapOpacity: mapDefaults.minimalMapOpacity,
      objectsFromSeconds: markerDefaults.objectsFromSeconds,
      offsetX: mapDefaults.offsetX,
      offsetY: mapDefaults.offsetY,
      showCrates: markerDefaults.showCrates,
      showGoldenStatues: markerDefaults.showGoldenStatues,
      showSmallObjects: markerDefaults.showSmallObjects,
      size: mapDefaults.size,
      urnTracker: markerDefaults.urnTracker
    },
    normalize: function (values) {
      return {
        autoUndergroundLevel: !!values.autoUndergroundLevel,
        corner: normalizeCorner(values.corner),
        fullWidth: !!values.fullWidth,
        largerWhenTargeting: !!values.largerWhenTargeting,
        mapOpacity: clampNumber(values.mapOpacity, 0, 1, 1, false),
        markerOpacity: clampNumber(values.markerOpacity, 0, 1, 1, false),
        markerSize: clampNumber(values.markerSize, 1, 8, 1, true),
        minimalMap: !!values.minimalMap,
        minimalMapOpacity: clampOpacity(values.minimalMapOpacity),
        objectsFromSeconds: clampNumber(values.objectsFromSeconds, 0, Number.MAX_SAFE_INTEGER, 180, true),
        offsetX: clampNumber(values.offsetX, 0, 100, 0, false),
        offsetY: clampNumber(values.offsetY, 0, 100, 0, false),
        showCrates: !!values.showCrates,
        showGoldenStatues: !!values.showGoldenStatues,
        showSmallObjects: !!values.showSmallObjects,
        size: clampNumber(values.size, 200, 800, 380, true),
        urnTracker: !!values.urnTracker
      };
    }
  });
  UMM.announce(featureId);

  QolLite.BetterMap = {
    init: init,
    refresh: refresh,
    destroy: destroy,
    resetMap: resetMap,
    resetMarkers: resetMarkers
  };
  Runtime.register(featureId, QolLite.BetterMap);
}());
