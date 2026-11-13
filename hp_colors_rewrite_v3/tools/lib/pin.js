'use strict';
// The one reader of a pinned-file manifest (game-data-pin.json, the QOLLOCK vendor/pin.json): every entry names
// an allowed vendored path, its source key, and the sha256 of the pristine LF bytes (a checkout's CRLF conversion
// is equivalent, nothing else is). Each lane words its own failures through `messages`.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { lf } = require('./layout-compose');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const isHex64 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

// sources: { vendoredPath: expected value of entry[key] }. messages: { invalid(file), missing(file, error),
// mismatch(file, actual) } build the lane's error texts. Returns the LF texts by vendored path.
function readPinnedTexts(root, entries, { sources, key, messages }) {
  const texts = Object.create(null);
  for (const file of entries) {
    if (!Object.hasOwn(sources, file.path) || file[key] !== sources[file.path] || Object.hasOwn(texts, file.path) || !isHex64(file.sha256))
      throw new Error(messages.invalid(file));
    let bytes;
    try { bytes = fs.readFileSync(path.join(root, file.path)); }
    catch (error) { throw new Error(messages.missing(file, error)); }
    const text = lf(bytes.toString('utf8'));
    const actual = sha256(Buffer.from(text, 'utf8'));
    if (actual !== file.sha256) throw new Error(messages.mismatch(file, actual));
    texts[file.path] = text;
  }
  return texts;
}

// ClientVersion=NNNN of a steam.inf, or null.
function readClientVersion(text) {
  const m = /^\s*ClientVersion\s*=\s*(\d+)\s*$/mi.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

// The installed-vs-pin mismatch text shared by game-data.js --check-installed, build.js and doctor.js (lib/toolchain.js re-exports both).
function pinMismatchMessage({ installed, pinned, steamInf }) {
  return `Installed game ClientVersion mismatch: installed=${installed} pinned=${pinned} (${steamInf}). ` +
    'Ways forward: rebase the pin to the installed build (node hp_colors_rewrite_v3/tools/game-data.js --check-upstream to review drift, ' +
    'then update vendor/ and game-data-pin.json), or pass --allow-pin-mismatch to build against the pinned data anyway.';
}

// The pin file (game-data-pin.json) parsed, or null when it is missing or not JSON; `fsx` is the fs to read through.
function readPin(file, fsx = fs) {
  try { return JSON.parse(fsx.readFileSync(file, 'utf8')); } catch { return null; }
}

// Its clientVersion, or null when the file cannot be read.
function readPinVersion(file, fsx = fs) {
  const pin = readPin(file, fsx);
  return pin ? pin.clientVersion : null;
}

module.exports = { sha256, isHex64, readPinnedTexts, readClientVersion, pinMismatchMessage, readPin, readPinVersion };
