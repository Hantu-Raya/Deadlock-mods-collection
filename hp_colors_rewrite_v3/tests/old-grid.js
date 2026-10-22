'use strict';
const { computed } = require('./style-cascade');

// Effective BAR STYLE OLD geometry, independent of how the renderer builds the grid: flat boxes
// (position "x% y%") or row panels (row position/height, optional row clip) holding boxes.
// Colored layers report grid percent; the rim layer reports CSS px. Boxes are ordered bottom
// row first, then left to right, so index i is the i-th 100-HP box when every box is shown.
const shown = panel => computed(panel, 'visibility') !== 'collapse';
function rowPanels(container) { return container.children.filter(panel => panel.BHasClass('HPColorsV3PipRow')); }
function clipOf(row) {
  const match = /rect\(\s*[-\d.]+%\s*,\s*([-\d.]+)%\s*,\s*[-\d.]+%\s*,\s*([-\d.]+)%\s*\)/.exec(row.style.clip || '');
  return match ? [Number(match[2]), Number(match[1])] : null;
}
function boxes(container) {
  const out = [], rows = rowPanels(container);
  if (rows.length) {
    for (const row of rows) {
      if (!shown(row)) continue;
      const y = parseFloat(row.style.position.split(/\s+/)[1]), rowHeight = parseFloat(row.style.height), clip = clipOf(row);
      for (const box of row.children) {
        if (!shown(box)) continue;
        const x = parseFloat(box.style.position), w = parseFloat(computed(box, 'width'));
        const h = rowHeight * parseFloat(computed(box, 'height')) / 100;
        let left = x, right = x + w;
        if (clip) { left = Math.max(left, clip[0]); right = Math.min(right, clip[1]); }
        if (right - left > 1e-6) out.push({ x: left, y, w: right - left, h, boxX: x, boxW: w });
      }
    }
  } else {
    for (const box of container.children) {
      if (!shown(box)) continue;
      const [x, y] = box.style.position.split(/\s+/).map(parseFloat), w = parseFloat(box.style.width);
      if (w > 1e-6) out.push({ x, y, w, h: parseFloat(box.style.height), boxX: x, boxW: w });
    }
  }
  return out.sort((a, b) => b.y - a.y || a.x - b.x);
}
// Rims in px: flat boxes carry their own top/height; row panels carry them for every rim in the row.
function rims(container) {
  const out = [], rows = rowPanels(container);
  if (rows.length) {
    for (const row of rows) {
      if (!shown(row)) continue;
      const y = parseFloat(row.style.position.split(/\s+/)[1]), h = parseFloat(row.style.height);
      for (const box of row.children) if (shown(box))
        out.push({ x: parseFloat(box.style.position), y, w: parseFloat(box.style.width), h, color: box.style.backgroundColor });
    }
  } else {
    for (const box of container.children) if (shown(box)) {
      const [x, y] = box.style.position.split(/\s+/).map(parseFloat);
      out.push({ x, y, w: parseFloat(box.style.width), h: parseFloat(box.style.height), color: box.style.backgroundColor });
    }
  }
  return out.sort((a, b) => b.y - a.y || a.x - b.x);
}
// Every renderer-made panel below a layer container (rows and boxes).
function descendants(container) {
  const out = [];
  (function walk(panel) { for (const child of panel.children) { out.push(child); walk(child); } })(container);
  return out;
}
function near(actual, expected, label, tolerance = 0.002) {
  if (!(Math.abs(actual - expected) <= tolerance)) throw new Error(label + ': ' + actual + ' != ' + expected);
}
// v2 grid contract: 100-HP boxes 8.5% wide, 10 per row, first box bottom-left, rows grow up,
// box height 80/rows % of the grid.
function expectEmpty(container, total, label) {
  const count = Math.ceil(total / 100 - 0.05), rows = Math.ceil(count / 10), list = boxes(container);
  if (list.length !== count) throw new Error(label + ' box count ' + list.length + ' != ' + count);
  list.forEach((box, i) => {
    near(box.x, i % 10 * 10, label + ' x ' + i); near(box.y, (rows - 1 - Math.floor(i / 10)) * 100 / rows, label + ' y ' + i);
    near(box.w, 8.5 * Math.min(100, total - i * 100) / 100, label + ' w ' + i); near(box.h, 80 / rows, label + ' h ' + i);
  });
  return { count, rows, list };
}
module.exports = { boxes, rims, descendants, near, expectEmpty };
