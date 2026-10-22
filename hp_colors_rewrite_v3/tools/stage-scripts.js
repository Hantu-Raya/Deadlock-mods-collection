#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execSync } = require('node:child_process');

// Release builds run Closure ADVANCED, the same npx compiler as the repo's other Closure lanes.
// Filter that keeps ADVANCED from breaking the runtime:
// 1. Every identifier-shaped word in the script is declared as an extern property, so no property is
//    ever renamed. Engine panel APIs, $.HPColors* entry points called from XML, JSON wire/record keys and
//    cross-file/QOLLOCK APIs keep their names. Local variables and functions are still renamed, and dead
//    code is still removed.
// 2. Panorama's bare globals are declared as extern variables.
// 3. Named callback expressions (`, function rendererTick(`) keep their name through
//    Object.defineProperty, because ADVANCED drops function-expression names. VM tests and console stacks
//    identify scheduled jobs by that name. Cost: one defineProperty per $.Schedule of those 7 callbacks.
// 4. Output checks: it parses; every $.Name the source uses and every UPPER_CASE string constant
//    (message magics, codes) survive. The build then runs the full VM suite on this output.
const CLOSURE = 'google-closure-compiler@20261011.0.0';
const PANORAMA_GLOBALS = ['$', 'GameUI', 'Game', 'GameEvents', 'Players', 'Entities', 'Abilities', 'Items', 'Buffs'];

function closureExterns(text) {
  const names = new Set(text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []);
  return '/** @externs */\n' + PANORAMA_GLOBALS.map(name => 'var ' + name + ';').join('\n') + '\n' +
    [...names].filter(name => !/^\d/.test(name)).sort().map(name => 'Object.prototype.' + name + ';').join('\n') + '\n';
}

// Index just past the brace that closes the block opening at `open`. Skips strings, templates, comments
// and regex literals well enough for these sources; a miss fails the vm.Script parse below.
function blockEnd(text, open) {
  let depth = 0, last = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i === 0) break;
    } else if (c === '/' && /^$|[(,=:[!&|?{};+\-*%<>~^]/.test(last)) {
      for (i++; i < text.length && text[i] !== '/'; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '[') while (++i < text.length && text[i] !== ']') if (text[i] === '\\') i++;
      }
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
    if (!/\s/.test(c)) last = c;
  }
  throw new Error('Unbalanced function body at offset ' + open);
}

function keepCallbackNames(text) {
  const pattern = /,(\s*)function ([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  let out = '', from = 0, match;
  while ((match = pattern.exec(text))) {
    const start = match.index + 1 + match[1].length, end = blockEnd(text, text.indexOf('{', pattern.lastIndex));
    out += text.slice(from, start) + 'Object.defineProperty(' + text.slice(start, end) + ', "name", { value: "' + match[2] + '" })';
    from = pattern.lastIndex = end;
  }
  return out + text.slice(from);
}

function closureCheck(relative, source, output) {
  new vm.Script(output, { filename: relative });
  const required = new Set();
  for (const match of source.matchAll(/\$\.([A-Za-z_][A-Za-z0-9_]*)/g)) required.add(match[1]);
  for (const match of source.matchAll(/["']([A-Z][A-Z0-9_]{5,})["']/g)) required.add(match[1]);
  for (const name of required) if (!output.includes(name)) throw new Error('Closure output for ' + relative + ' dropped required name ' + name);
}

function main(args) {
  const flag = args[1];
  if (!args[0] || args.length > 2 || (flag && flag !== '--debug' && flag !== '--minify')) throw new Error('Usage: stage-scripts.js <staged-script-directory> [--debug|--minify]');
  const root = path.resolve(args[0]);
  const debug = flag === '--debug';
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.js$/i.test(entry.name)) files.push(file);
    }
  }
  walk(root);
  // Validate every candidate first: a malformed marker must not leave a partly transformed stage.
  const transformed = files.map(file => {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n').map((line, index) => {
      const marker = line.match(/^([ \t]*)\/\/ HPV3_DEBUG (.*)$/);
      if (!marker) return line;
      const statement = marker[2];
      try {
        if (!statement.trim().endsWith(';')) throw new Error('Missing terminal semicolon');
        new vm.Script(statement);
      } catch (error) {
        throw new Error('Debug marker must contain a complete single-line statement: ' + relative + ':' + (index + 1) + ' (' + error.message + ')');
      }
      return debug ? marker[1] + statement : '';
    }).join('\n');
    if (!debug && /(?:\$\s*(?:\.\s*(?:Msg|Warning)\b|\[\s*(["'])(?:Msg|Warning)\1\s*\])|console\s*(?:\.\s*(?:log|warn|error)\b|\[\s*(["'])(?:log|warn|error)\2\s*\]))/.test(text)) {
      throw new Error('Release logging call found in ' + relative);
    }
    new vm.Script(text, { filename: relative });
    return { file, text };
  });
  for (const { file, text } of transformed) fs.writeFileSync(file, text, 'utf8');
  let before = 0, after = 0;
  if (flag === '--minify') for (const { file, text } of transformed) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    const externs = file + '.externs', output = file + '.closure';
    fs.writeFileSync(externs, closureExterns(text), 'utf8');
    const named = keepCallbackNames(text);
    new vm.Script(named, { filename: relative });
    fs.writeFileSync(file, named, 'utf8');
    try {
      // One shell command: npx is a .cmd shim on Windows. Paths are quoted; they come from our own stage walk.
      execSync(['npx --yes', CLOSURE, '--compilation_level ADVANCED --language_in ECMASCRIPT_NEXT',
        '--language_out ECMASCRIPT_2020 --rewrite_polyfills=false --warning_level QUIET',
        '--externs "' + externs + '"', '--js "' + file + '"', '--js_output_file "' + output + '"'].join(' '),
      { stdio: ['ignore', 'ignore', 'inherit'] });
      const minified = fs.readFileSync(output, 'utf8');
      closureCheck(relative, text, minified);
      fs.writeFileSync(file, minified, 'utf8');
      before += Buffer.byteLength(text); after += Buffer.byteLength(minified);
    } finally {
      fs.rmSync(externs, { force: true }); fs.rmSync(output, { force: true });
    }
  }
  console.log('HPV3 stage scripts: ' + files.length + ' transformed (' + (debug ? 'debug' : 'release') + ')' +
    (flag === '--minify' ? '; Closure ADVANCED ' + before + ' -> ' + after + ' bytes' : ''));
}
try { main(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
