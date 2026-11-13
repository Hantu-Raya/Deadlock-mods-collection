'use strict';
// Stylesheet contract for every packed .css in panorama/styles. Errors name the sheet path, line and rule.
const fs = require('node:fs');
const path = require('node:path');
const ENGINE = require('./engine-facts.json').css;
const { UNITS } = require('./schema');

// PROJECT ceiling (not an engine limit; the engine has no selector-count limit): live 6782 a rule with a
// 37-selector / 2.9 KB selector list compiled cleanly but failed to parse at runtime ("Failed to parse selector")
// and aborted the Escape-menu load. Every packed stylesheet keeps each rule at <= 10 comma-separated selectors
// and <= 1,024 characters.
// ENGINE limits (engine-facts.json, Deadlock DLL disassembly): the text before `{` is read into a 2,048-byte
// buffer (<= 2,047 bytes, else "Failed to parse selector"), and each comma-separated selector into a 256-byte
// buffer ("Selector exceeds temp buffer size"). Measured conservatively: UTF-8 bytes of the raw text, comments
// and inner whitespace included (only leading whitespace is skipped, as the engine does).
const PROPERTIES = new Set(ENGINE.properties.values);
// Engine limits plus the two stricter project ceilings (max selectors per rule, max characters per selector list).
// A number with an optional schema unit (px, %, deg, s), stripped before the colour-macro scan.
const NUMBER_WITH_UNIT = new RegExp('[+-]?[\\d.]+(?:' + UNITS.filter(Boolean).join('|') + ')?', 'g');
const LIMITS = { ...ENGINE.limits, maxSelectors: 10, maxSelectorChars: 1024 };
const AT_RULES = new Set(ENGINE.atRules.values);
const PSEUDO = new Set([...ENGINE.pseudoClasses.flags, ...ENGINE.pseudoClasses.structural]);
const bytes = text => Buffer.byteLength(text, 'utf8');
const head = selector => {
  const first = selector.replace(/\s+/g, ' ').trim();
  return first.length > 60 ? first.slice(0, 57) + '...' : first;
};

// Engine-level checks on one stylesheet text; returns { errors, warnings } as 'file:line: message' strings.
function engineFindings(file, raw) {
  const errors = [], warnings = [];
  // Comments and quoted strings become spaces (newlines kept) so indexes and lines match the raw text and
  // `{images}` inside url("...") is not taken for a block.
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '))
    .replace(/"[^"\n]*"|'[^'\n]*'/g, quoted => quoted[0] + ' '.repeat(quoted.length - 2) + quoted[0]);
  const lineOf = index => raw.slice(0, index).split('\n').length;
  for (const at of text.matchAll(/(^|[;{}\s])@([A-Za-z-]+)/g)) {
    if (!AT_RULES.has(at[2].toLowerCase())) errors.push(file + ':' + lineOf(at.index + at[1].length) + ': unsupported at-rule @' + at[2] + ' (engine accepts only @define, @keyframes, @import)');
    const atStart = at.index + at[1].length, atEnd = text.slice(atStart).search(/[;{]/);
    const atText = raw.slice(atStart + at[2].length + 1, atEnd < 0 ? raw.length : atStart + atEnd).trim();
    if (bytes(atText) > LIMITS.defineBytes) errors.push(file + ':' + lineOf(atStart) + ': @' + at[2] + ' text is ' + bytes(atText) + ' bytes (engine max ' + LIMITS.defineBytes + ')');
  }
  let depth = 0, start = 0, keyframes = false, keyframesDepth = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const lead = text.slice(start, i).length - text.slice(start, i).replace(/^\s+/, '').length;
      const rawPrelude = raw.slice(start + lead, i);
      const prelude = text.slice(start, i).trim();
      const line = lineOf(start + lead);
      const atRule = prelude.charAt(0) === '@';
      if (atRule && /^@keyframes\b/i.test(prelude)) { keyframes = true; keyframesDepth = depth; }
      if (depth === 0 && !atRule && prelude) {
        const rule = 'rule `' + head(prelude) + '`';
        if (bytes(rawPrelude) > LIMITS.selectorListBytes) errors.push(file + ':' + line + ': ' + rule + ' selector list is ' + bytes(rawPrelude) + ' bytes (engine max ' + LIMITS.selectorListBytes + '; "Failed to parse selector")');
        for (const part of rawPrelude.split(',')) {
          const size = bytes(part.replace(/^\s+/, ''));
          if (size > LIMITS.selectorChars) errors.push(file + ':' + line + ': ' + rule + ' has a selector of ' + size + ' characters (engine max ' + LIMITS.selectorChars + ' per selector; "Selector exceeds temp buffer size")');
        }
        const bare = prelude.replace(/\([^()]*\)/g, '()').replace(/"[^"]*"|'[^']*'/g, '""');
        const combinator = /[+~]/.exec(bare);
        if (combinator) errors.push(file + ':' + line + ': ' + rule + ' uses the ' + combinator[0] + ' combinator (engine supports only descendant and >)');
        for (const pseudo of bare.matchAll(/:([A-Za-z-]+)/g)) {
          if (!PSEUDO.has(pseudo[1])) warnings.push(file + ':' + line + ': ' + rule + ' uses pseudo-class :' + pseudo[1] + ' (not in the engine flag table; engine behavior not determined)');
        }
      }
      depth++; start = i + 1;
    } else if (ch === '}') {
      depth--; start = i + 1;
      if (keyframes && depth === keyframesDepth) keyframes = false;
    } else if (ch === ';') {
      start = i + 1;
    }
  }
  for (const block of text.matchAll(/\{([^{}]*)\}/g)) {
    const bodyStart = block.index + 1;
    for (const declaration of block[1].matchAll(/(^|;)\s*([A-Za-z-][\w-]*)\s*:/g)) {
      const name = declaration[2].toLowerCase();
      const at = bodyStart + declaration.index + declaration[0].indexOf(declaration[2]);
      // The engine only warns and drops the declaration; the build treats it as an error.
      if (!PROPERTIES.has(name)) errors.push(file + ':' + lineOf(at) + ': unknown property ' + declaration[2] + ' (not registered by the engine; "Invalid property name", declaration dropped)');
      const valueEnd = raw.indexOf(';', at) < 0 ? block.index + block[0].length - 1 : Math.min(raw.indexOf(';', at), block.index + block[0].length - 1);
      const value = raw.slice(raw.indexOf(':', at) + 1, valueEnd).trim();
      if (bytes(value) > LIMITS.propertyValueBytes) errors.push(file + ':' + lineOf(at) + ': ' + declaration[2] + ' value is ' + bytes(value) + ' bytes (engine max ' + LIMITS.propertyValueBytes + ')');
    }
  }
  return { errors, warnings };
}

// Checks every packed .css in `dir`. `stock` maps the generated stock sheets (the output-table entries flagged
// stockSheet in tools/generate.js) to their generated text: that text is checked instead of any file in `dir`,
// and such a sheet may use the game's @define colour macros but never a mask. `shipped` (names without
// `.css`, from the include lists in lib/stock-layouts.js) makes the folder and the layouts agree: a sheet in
// the folder that no layout includes, or one a layout includes that is missing, fails.
function checkStylesheets(dir, { stock = {}, shipped = null } = {}) {
  const files = [...new Set([...fs.readdirSync(dir).filter(name => name.endsWith('.css')), ...Object.keys(stock)])].sort();
  if (!files.length) throw new Error('No stylesheets found in ' + dir);
  if (shipped) {
    const orphan = files.filter(name => !shipped.includes(name.slice(0, -4)));
    if (orphan.length) throw new Error('Stylesheet in ' + dir + ' that no layout includes: ' + orphan.join(', ') + ' (tools/lib/stock-layouts.js lists the includes)');
    const missing = shipped.filter(name => !files.includes(name + '.css'));
    if (missing.length) throw new Error('Stylesheet included by a layout but missing from ' + dir + ': ' + missing.map(name => name + '.css').join(', '));
  }
  let rules = 0, widest = 0;
  const warnings = [];
  for (const name of files) {
    const file = path.join(dir, name);
    const isStock = Object.hasOwn(stock, name);
    const raw = isStock ? stock[name] : fs.readFileSync(file, 'utf8');
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ''));
    let depth = 0, prelude = '', skip = false, line = 1, start = 1;
    for (const ch of text) {
      if (ch === '\n') line++;
      if (ch === '{') {
        if (depth === 0) {
          const selector = prelude.slice(prelude.lastIndexOf(';') + 1).trim();
          skip = selector.charAt(0) === '@';
          if (!skip) {
            const count = selector.split(',').length;
            rules++; widest = Math.max(widest, count);
            if (!selector) throw new Error(file + ':' + start + ': empty selector');
            const rule = 'rule `' + head(selector) + '`';
            if (count > LIMITS.maxSelectors) throw new Error(file + ':' + start + ': PROJECT ceiling (stricter than the engine, which has no selector-count limit): ' + rule + ': rule has ' + count + ' selectors (max ' + LIMITS.maxSelectors + '; live 6782 fails to parse long selector lists)');
            if (selector.length > LIMITS.maxSelectorChars) throw new Error(file + ':' + start + ': PROJECT ceiling (engine max is ' + LIMITS.selectorListBytes + ' bytes): ' + rule + ': selector list has ' + selector.length + ' characters (max ' + LIMITS.maxSelectorChars + ')');
          }
        }
        depth++; prelude = '';
      } else if (ch === '}') {
        depth--; prelude = '';
        if (depth < 0) throw new Error(file + ':' + line + ': unbalanced braces');
      } else if (depth === 0) {
        if (!prelude.trim()) start = line;
        prelude += ch;
      }
    }
    if (depth !== 0) throw new Error(file + ': unbalanced braces');
    const engine = engineFindings(file, raw);
    if (engine.errors.length) throw new Error(engine.errors.join('\n'));
    warnings.push(...engine.warnings);
    // The mask rule (live 6782, see tools/game-data.js): `opacity-mask: none` does not cancel an earlier mask.
    const lineOf = index => text.slice(0, index).split('\n').length;
    const none = /opacity-mask\s*:\s*none\b/i.exec(text);
    if (none) throw new Error(file + ':' + lineOf(none.index) + ': opacity-mask: none does not cancel an earlier mask in game; remove the mask declaration instead');
    const stockMask = isStock && /opacity-mask/i.exec(text);
    if (stockMask) throw new Error(file + ':' + lineOf(stockMask.index) + ': the generated stock sheet must declare no opacity-mask (BAR STYLE V2 restores masks through owned classes)');
    // Owned sheets cannot resolve the stock base sheet's @define colour macros.
    if (!isStock) {
      const keywords = new Set(['white', 'black', 'transparent', 'none', 'solid', 'fill', 'inset', 'rgb', 'rgba',
        'gradient', 'linear', 'radial', 'from', 'to', 'color-stop']);
      for (const declaration of text.matchAll(/(?:^|[;{}])\s*((?:background-|wash-|border(?:-(?:top|bottom|left|right))?-)?color|border(?:-(?:top|bottom|left|right))?|(?:text|box|img)-shadow)\s*:\s*([^;{}]+)(?=;)/g)) {
        const value = declaration[2].replace(/#[a-f\d]+/gi, '').replace(NUMBER_WITH_UNIT, '');
        for (const token of value.matchAll(/[a-z][\w-]*/gi)) {
          if (!keywords.has(token[0].toLowerCase())) throw new Error(file + ':' + lineOf(declaration.index) + ': unresolved colour macro ' + token[0] + ' in owned CSS; use a hex literal');
        }
      }
    }
  }
  for (const warning of warnings) console.warn('warning: ' + warning);
  return { files: files.length, rules, widest, warnings };
}

module.exports = { checkStylesheets, engineFindings };
