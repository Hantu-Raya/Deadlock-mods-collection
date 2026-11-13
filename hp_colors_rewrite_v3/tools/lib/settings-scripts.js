'use strict';
// The two generated Panorama settings scripts: the menu context gets the whole contract, the world
// context only the fields its validation needs.

// The wire/contract version both scripts expose (generate.js puts the same value on the menu contract).
const WIRE_VERSION = '3.0.0';
// Both contexts share schema-derived validation; only the menu receives presentation data.
const validateValueSource = '  function validateValue(row, value) {\n' +
  '    if (!row) return false;\n' +
  '    if (row.type === "boolean") return typeof value === "boolean";\n' +
  '    if (row.type === "color") return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);\n' +
  '    if (row.type === "enum") return row.options.some(function (option) { return option.value === value; });\n' +
  '    if (row.type === "number") return Number.isFinite(value) && value >= row.bounds[0] && value <= row.bounds[1] && Math.abs((value - row.bounds[0]) / row.step - Math.round((value - row.bounds[0]) / row.step)) <= 1e-8;\n' +
  '    return false;\n' +
  '  }\n';
const validateSource = '  function validate(settings) {\n' +
  '    if (!settings || !settings.side || !settings.side.enemy || !settings.side.ally || !settings.shared) return false;\n' +
  '    for (var i = 0; i < fields.length; i++) {\n' +
  '      var row = fields[i], values = row.side === "shared" ? settings.shared : settings.side[row.side];\n' +
  '      if (!validateValue(row, values[row.key])) return false;\n' +
  '    }\n' +
  '    return settings.shared.lowThreshold === undefined || settings.shared.highThreshold === undefined || settings.shared.lowThreshold < settings.shared.highThreshold;\n' +
  '  }\n';
const validationSource = validateValueSource + validateSource;

// World script: the 221 rows as ONE flat array literal (stride 7) instead of one object literal per row, because
// the script is evaluated once per health-bar panel and 221 object literals cost ~100 us and ~29 KB per bar.
// Columns: key, side (0 shared / 1 enemy / 2 ally), type (0 boolean / 1 color / 2 enum / 3 number), lo, hi, step
// (numbers only, else 0), options ("a|b|c" for enums, else ""). Read by index, never by property name.
const WORLD_SIDES = ['shared', 'enemy', 'ally'];
const WORLD_TYPES = ['boolean', 'color', 'enum', 'number'];
const WORLD_STRIDE = 7;

function worldRows(controls) {
  return controls.map(control => {
    const side = WORLD_SIDES.indexOf(control.side), type = WORLD_TYPES.indexOf(control.type);
    if (side < 0 || type < 0) throw new Error('world settings: unsupported side/type on ' + control.key);
    let lo = 0, hi = 0, step = 0, options = '';
    if (type === 3) {
      [lo, hi] = control.bounds || [];
      step = control.step;
      if (![lo, hi, step].every(Number.isFinite) || !(step > 0)) throw new Error('world settings: bad bounds/step on ' + control.key);
    }
    if (type === 2) {
      const values = (control.options || []).map(option => option.value);
      if (!values.length) throw new Error('world settings: enum has no options on ' + control.key);
      if (!values.every(value => typeof value === 'string' && value !== '' && !value.includes('|'))) throw new Error('world settings: enum options must be non-empty pipe-free strings on ' + control.key);
      options = values.join('|');
    }
    return [control.key, side, type, lo, hi, step, options];
  });
}

// The world validator: same verdicts as validationSource's validate, but a message is checked field by field
// against the last ACCEPTED VALUE of that field (`seen` is true only after a fully accepted message, so the first
// message and every message after a failure validate every field). Remembered values are primitives that passed
// that field's own check, so a field equal (===) to its remembered value is valid without re-checking; NaN never
// equals itself and is re-checked. Values are compared, never the settings object, so a caller that reuses or
// mutates one settings object between messages is seen correctly. Extra keys and sections are not read, exactly
// as before; the section guard and the lowThreshold < highThreshold check run on every message.
const worldValidateSource = [
  '  var memory = null, seen = false, colorPattern = null;',
  '  function check(row, value) {',
  '    var type = rows[row + 2];',
  '    if (type === 0) return typeof value === "boolean";',
  '    if (type === 1) return typeof value === "string" && (colorPattern || (colorPattern = /^#[0-9a-f]{6}$/i)).test(value);',
  '    if (type === 2) {',
  '      var options = rows[row + 6].split("|");',
  '      for (var i = 0; i < options.length; i++) if (options[i] === value) return true;',
  '      return false;',
  '    }',
  '    if (!Number.isFinite(value)) return false;',
  '    var low = rows[row + 3], step = rows[row + 5], offset = (value - low) / step;',
  '    return value >= low && value <= rows[row + 4] && Math.abs(offset - Math.round(offset)) <= 1e-8;',
  '  }',
  '  function validate(settings) {',
  '    if (!settings || !settings.side || !settings.side.enemy || !settings.side.ally || !settings.shared) return false;',
  '    var shared = settings.shared, enemy = settings.side.enemy, ally = settings.side.ally, known = seen;',
  '    if (!memory) memory = new Array(rows.length / 7);',
  '    seen = false;',
  '    for (var row = 0, slot = 0; row < rows.length; row += 7, slot++) {',
  '      var side = rows[row + 1], value = (side === 0 ? shared : side === 1 ? enemy : ally)[rows[row]];',
  '      if (known && value === memory[slot]) continue;',
  '      if (!check(row, value)) return false;',
  '      memory[slot] = value;',
  '    }',
  '    seen = shared.lowThreshold === undefined || shared.highThreshold === undefined || shared.lowThreshold < shared.highThreshold;',
  '    return seen;',
  '  }',
].join('\n') + '\n';

function worldSettingsScript(controls) {
  const rows = worldRows(controls).map(row => '    ' + JSON.stringify(row).slice(1, -1) + ',\n').join('');
  return '// GENERATED by tools/generate.js. World validation only.\n(function () {\n  "use strict";\n' +
    '  // key, side, type, low, high, step, options; stride 7 (see tools/lib/settings-scripts.js).\n' +
    '  var rows = [\n' + rows + '  ];\n' + validateValueSource + worldValidateSource +
    '  $.HPColorsV3WorldSettings = { version: "' + WIRE_VERSION + '", validate: validate, validateValue: validateValue };\n})();\n';
}

function settingsScript(contract) {
  return '// GENERATED by tools/generate.js. Do not edit.\n(function () {\n  "use strict";\n  var contract = ' + JSON.stringify(contract) + ';\n' +
    '  var fields = contract.controls;\n' + validationSource +
    '  contract.validate = validate;\n  contract.validateValue = validateValue;\n  $.HPColorsV3Settings = contract;\n})();\n';
}

module.exports = { WIRE_VERSION, WORLD_STRIDE, validationSource, validateValueSource, worldRows, worldSettingsScript, settingsScript };
