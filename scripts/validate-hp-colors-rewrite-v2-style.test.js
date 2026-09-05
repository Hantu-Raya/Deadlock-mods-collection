'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const sourceRoot = path.resolve(__dirname, '../hp_colors_rewrite_v2/panorama/scripts');
const contractSource = fs.readFileSync(path.join(sourceRoot, 'hp_colors_v2_contract.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(sourceRoot, 'unit_status_v2_colors.js'), 'utf8');
const styleSeam = 'var STOCK_TEAM1_COLOR = "#E7B659";';

function loadStyleHelpers() {
  const $ = {};
  const context = vm.createContext({ $ });
  vm.runInContext(contractSource, context);
  vm.runInContext(
    rendererSource.replace(
      styleSeam,
      '$.__setStyle = setStyle; $.__drift = cachedStyleDrift; return;\n' + styleSeam,
    ),
    context,
  );
  return { setStyle: $.__setStyle, cachedStyleDrift: $.__drift };
}

test('alias restoration clears the base and preserves sibling inline styles', () => {
  const { setStyle } = loadStyleHelpers();
  const groups = {
    margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
    font: ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch'],
    animation: ['animationName', 'animationDuration', 'animationDelay'],
    border: ['borderColor', 'borderTopWidth', 'borderTopStyle', 'borderLeftWidth', 'borderLeftStyle'],
  };
  const values = {
    marginLeft: '12px', marginTop: '4px', marginRight: '8px',
    fontFamily: 'Arial', fontSize: '20px', fontWeight: 'bold',
    animationDuration: '1s', animationName: 'pulse', animationDelay: '0.2s',
    borderColor: 'red', borderTopWidth: '2px', borderTopStyle: 'solid', borderLeftWidth: '3px', borderLeftStyle: 'dashed',
  };
  const panel = { id: 'AliasFixture', style: new Proxy(values, {
    set(target, property, value) {
      if (value === null && !groups[property]) throw new Error('Cannot unset alias alone');
      if (value === null) for (const alias of groups[property]) target[alias] = '';
      target[property] = value === null ? '' : value;
      return true;
    },
  }) };
  const cache = {};
  for (const property of ['marginLeft', 'fontSize', 'animationDuration', 'borderColor'])
    setStyle(panel, property, '', cache, property);

  assert.equal(values.marginLeft, '');
  assert.equal(values.marginTop, '4px');
  assert.equal(values.marginRight, '8px');
  assert.equal(values.fontSize, '');
  assert.equal(values.fontFamily, 'Arial');
  assert.equal(values.fontWeight, 'bold');
  assert.equal(values.animationDuration, '');
  assert.equal(values.animationName, 'pulse');
  assert.equal(values.animationDelay, '0.2s');
  assert.equal(values.borderColor, '');
  assert.equal(values.borderTopWidth, '2px');
  assert.equal(values.borderLeftStyle, 'dashed');

  setStyle(panel, 'marginLeft', '', cache, 'marginLeft');
  assert.equal(values.marginTop, '4px');
  assert.equal(values.marginRight, '8px');
});

test('native readback avoids normalized rewrites while repairing engine and panel changes', () => {
  const { setStyle, cachedStyleDrift } = loadStyleHelpers();
  const cache = {};
  let color = '';
  let left = '';
  let top = '';
  let writes = 0;
  const panel = { style: new Proxy({}, {
    get(target, key) {
      if (key === 'washColor') return color;
      if (key === 'margin') return left + ' ' + top;
      return '';
    },
    set(target, key, value) {
      writes++;
      if (key === 'washColor') color = value + 'FF';
      if (key === 'marginLeft') left = value;
      if (key === 'marginTop') top = value;
      return true;
    },
  }) };

  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  setStyle(panel, 'marginLeft', '30px', cache, 'left');
  setStyle(panel, 'marginTop', '10px', cache, 'top');
  for (let i = 0; i < 10; i++) {
    setStyle(panel, 'washColor', '#FD4949', cache, 'color');
    setStyle(panel, 'marginLeft', '30px', cache, 'left');
    setStyle(panel, 'marginTop', '10px', cache, 'top');
  }
  assert.equal(writes, 3, 'unchanged native values must not trigger more assignments');

  color = '#000000FF';
  assert.equal(cachedStyleDrift(panel, 'washColor', cache, 'color'), true);
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, '#FD4949FF');

  left = '0px';
  top = '0px';
  setStyle(panel, 'marginLeft', '30px', cache, 'left');
  assert.equal(cachedStyleDrift(panel, 'marginTop', cache, 'top'), true);
  setStyle(panel, 'marginTop', '10px', cache, 'top');
  assert.equal(left + ' ' + top, '30px 10px');
  assert.equal(cachedStyleDrift(panel, 'marginLeft', cache, 'left'), false);

  const replacement = { style: {} };
  setStyle(replacement, 'washColor', '#FD4949', cache, 'color');
  assert.equal(replacement.style.washColor, '#FD4949');
});

test('a rejected native write remains retryable', () => {
  const { setStyle } = loadStyleHelpers();
  const cache = {};
  let reject = true;
  let color = 'stock';
  const panel = { style: {
    get washColor() { return color; },
    set washColor(value) {
      if (reject) throw new Error('panel style temporarily unavailable');
      color = value;
    },
  } };
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, 'stock');
  reject = false;
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, '#FD4949');
});
