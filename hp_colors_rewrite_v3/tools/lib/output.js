'use strict';
// Reading the generator's JSON inputs and writing (or, with --check, comparing) its outputs.
const fs = require('node:fs');
const path = require('node:path');

const json = value => JSON.stringify(value, null, 2) + '\n';

// JSON.parse errors do not name the file; this does.
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(text); }
  catch (error) { throw new Error(file + ': invalid JSON: ' + error.message); }
}

// Writes each output under `output`, or with check compares it (line endings ignored) and throws on
// the stale ones without writing anything.
function writeOrCheck(files, output, check) {
  const stale = [];
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(output, relative);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== text.replace(/\r\n/g, '\n')) stale.push(relative);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text, 'utf8');
    }
  }
  if (stale.length) throw new Error('Stale generated files: ' + stale.join(', '));
}

module.exports = { json, readJson, writeOrCheck };
