'use strict';
// Shared by the preview and world-parity tests: models the preview pane's CSS layout and inherited ui-scale.
const { computed } = require('./style-cascade');
function walk(panel, visit) { visit(panel); for (const child of panel.children) walk(child, visit); }
// Model the fake tree's CSS layout and inherited ui-scale, not the adapter's default 120×32 boxes.
// Text extents are fixed fixture measurements; this is not a font rasterizer.
function modelPreviewLayout(m, baseScale) {
  const canvas = m.find('HPColorsPreviewCanvas');
  function scale(panel) {
    let value = baseScale;
    for (let node = panel; node; node = node.GetParent()) {
      const uiScale = computed(node, 'uiScale');
      if (uiScale) value *= parseFloat(uiScale) / 100;
    }
    return value;
  }
  function size(panel, axis) {
    const value = computed(panel, axis);
    if (value && value.endsWith('px')) return parseFloat(value);
    if (value && value.endsWith('%')) return size(panel.GetParent(), axis) * parseFloat(value) / 100;
    if (value === 'width-percentage(100%)') return size(panel, 'width');
    if (panel.id === 'HPColorsPreviewName') return axis === 'width' ? 56 : 20;
    if (panel.id === 'HPColorsPreviewReadoutLine' || panel.id === 'HPColorsPreviewHpText') return axis === 'width' ? 36 : 28;
    if (panel.id === 'HPColorsPreviewLevelLabel') return axis === 'width' ? 21 : 12;
    throw new Error('Unmodeled preview extent: ' + panel.id + '.' + axis);
  }
  function offset(panel, axis) {
    if (panel === canvas) return 0;
    const horizontal = axis === 'width';
    const leading = parseFloat(computed(panel, horizontal ? 'marginLeft' : 'marginTop')) || 0;
    const trailing = parseFloat(computed(panel, horizontal ? 'marginRight' : 'marginBottom')) || 0;
    const align = computed(panel, horizontal ? 'horizontalAlign' : 'verticalAlign');
    const free = size(panel.GetParent(), axis) - size(panel, axis) - leading - trailing;
    return leading + (align === 'center' || align === 'middle' ? free / 2 : align === 'right' || align === 'bottom' ? free : 0);
  }
  walk(canvas, panel => {
    if (/BarTick/.test(panel.id)) return; // Created after attach; tick placement is asserted separately.
    for (const axis of ['x', 'y']) {
      const extent = axis === 'x' ? 'width' : 'height';
      Object.defineProperty(panel, 'actualuiscale_' + axis, { configurable: true, get: () => scale(panel) });
      // Live 6779: Panorama skips layout for opacity-0 panels (actuallayoutwidth 0, offsets FLT_MAX).
      const skipped = () => computed(panel, 'opacity') === '0';
      Object.defineProperty(panel, 'actuallayout' + extent, { configurable: true, get: () => skipped() ? 0 : size(panel, extent) * scale(panel) });
      Object.defineProperty(panel, 'actual' + axis + 'offset', { configurable: true, get: () => skipped() ? 3.4028234663852886e+38 : offset(panel, extent) * scale(panel) });
    }
  });
}
module.exports = { modelPreviewLayout };
