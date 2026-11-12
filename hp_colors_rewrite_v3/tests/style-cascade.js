'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { sourceRoot } = require('./boot-layout');

// A deliberately small test-only cascade for the flat selectors used by the pinned
// native and owned sheets. The renderer still sees the inline-only Panorama style
// bag. Unknown macros remain names: a test must not invent unpinned base-sheet facts.
const sheets = ['panorama/styles/unit_status_v2.css', 'panorama/styles/hp_colors_v3_world.css', 'panorama/styles/hp_colors_v3_menu.css',
  'panorama/styles/hp_colors_v3_status.css'];
// Only citadel_status_effect.xml includes the status sheet, so a panel takes its rules only when a test marks
// its layout's sheets (HPColorsV3Sheets) with it; every other panel sees the three own sheets.
const ownSheets = sheets.filter(file => file !== 'panorama/styles/hp_colors_v3_status.css');
const texts = sheets.map(file => fs.readFileSync(path.join(sourceRoot, file), 'utf8'));
const macros = {};
for (const text of texts) for (const match of text.matchAll(/@define\s+(\w+)\s*:\s*([^;]+);/g)) macros[match[1].toLowerCase()] = match[2].trim();
const rules = [];
for (const text of texts) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^\{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].slice(match[1].lastIndexOf(';') + 1).trim();
    if (!selector || selector.startsWith('@')) continue;
    const styles = {};
    for (const declaration of match[2].split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const key = declaration.slice(0, colon).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      styles[key] = declaration.slice(colon + 1).trim();
      if (key === 'margin') {
        const values=styles[key].split(/\s+/), sides=[values[0],values[1]||values[0],values[2]||values[0],values[3]||values[1]||values[0]];
        ['Top','Right','Bottom','Left'].forEach((side,i)=>{styles['margin'+side]=sides[i];});
      }
    }
    for (const single of selector.split(',')) rules.push({ selector: single.trim(), styles, sheet: sheets[texts.indexOf(text)],
      specificity: (single.match(/#[\w-]+/g) || []).length * 100 +
        ((single.match(/\.[\w-]+/g) || []).length + (single.match(/:[\w-]+/g) || []).length) * 10 +
        (single.match(/(?:^|[\s>])([A-Za-z][\w-]*)/g) || []).length });
  }
}
function matchesSimple(panel, selector) {
  const excluded = [...selector.matchAll(/:not\(([^()]+)\)/g)].map(match => match[1]);
  if (excluded.some(simple => matchesSimple(panel, simple))) return false;
  selector = selector.replace(/:not\([^()]+\)/g, '');
  const ids = [...selector.matchAll(/#([\w-]+)/g)].map(m => m[1]);
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
  const states = [...selector.matchAll(/:([\w-]+)/g)].map(m => m[1]);
  const type = selector.match(/^[\w-]+/);
  return (!type || panel.paneltype === type[0]) && ids.every(id => panel.id === id) &&
    classes.every(name => panel.classes.includes(name)) && states.every(state =>
      (panel.states || []).includes(state) || state === 'focus' && panel.focused === true ||
      state === 'disabled' && panel.enabled === false || state === 'selected' && panel.classes.includes('Selected'));
}
function matches(panel, selector) {
  const pieces = selector.replace(/\s*>\s*/g, ' > ').trim().split(/\s+/);
  function visit(node, index) {
    if (!node || !matchesSimple(node, pieces[index])) return false;
    if (!index) return true;
    if (pieces[index - 1] === '>') return visit(node.parent, index - 2);
    for (let parent = node.parent; parent; parent = parent.parent) if (visit(parent, index - 1)) return true;
    return false;
  }
  return visit(panel, pieces.length - 1);
}
function resolve(value) {
  const macro = /^([a-z]\w*)(?:&([\da-f]{2}))?$/i.exec(value);
  if (macro && macros[macro[1].toLowerCase()]) return macros[macro[1].toLowerCase()] + (macro[2] || '');
  return value;
}
// Inline value as a test reads it. backgroundImage reads back as the whole layer ("url(...)  / size ...",
// boot-layout.js); the image is the part tests assert.
function inline(panel, key) {
  const value = panel.style[key];
  return key === 'backgroundImage' && typeof value === 'string' ? value.replace(/\s+\/\s.*$/, '') : value;
}
function computed(panel, key) {
  const own = inline(panel, key);
  if (own !== undefined && own !== null && own !== '') return own;
  let value, specificity = -1;
  let included = ownSheets;
  for (let node = panel; node; node = node.parent) if (node.HPColorsV3Sheets) { included = node.HPColorsV3Sheets; break; }
  for (const rule of rules) if (included.includes(rule.sheet) && Object.hasOwn(rule.styles, key) && rule.specificity >= specificity && matches(panel, rule.selector)) {
    // Live 6782: a stylesheet `opacity-mask: none` does not cancel an earlier mask (the slanted
    // stock mask stayed on V1 and OLD bars). Model it as no declaration at all.
    if (key === 'opacityMask' && /^none$/i.test(rule.styles[key])) continue;
    value = resolve(rule.styles[key]); specificity = rule.specificity;
  }
  return value;
}
// Keyframe stops of a named @keyframes block in the same sheets (engine-visible animation content).
function keyframes(name) {
  for (const [i, text] of texts.entries()) {
    const start = text.indexOf("@keyframes '" + name + "'");
    if (start < 0) continue;
    const body = /^[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/.exec(text.slice(start));
    const stops = {};
    for (const stop of body[1].matchAll(/([\d.]+%)\s*\{([^{}]*)\}/g)) {
      stops[stop[1]] = {};
      for (const declaration of stop[2].split(';')) {
        const colon = declaration.indexOf(':');
        if (colon >= 0) stops[stop[1]][declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
      }
    }
    return { sheet: sheets[i], stops };
  }
  return null;
}
module.exports = { computed, keyframes, inline };
