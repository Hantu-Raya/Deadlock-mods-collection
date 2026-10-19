'use strict';

// Diagnostics-only instrumenter for the ShowRank barebones Panorama runtime.
// It wraps the composed readable runtime with a live cost probe (see
// .scratch/showrank-barebones-audit/diagnostics-contract.md). The output is
// shipped ONLY in the separate diagnostics VPK; production never contains it.
//
// Usage: node scripts/showrank-barebones-diagnostics.js <composedRuntime.js> <outputRuntime.js>

const fs = require('fs');

const PROBE_TAG = '[SRB-P]';

// Host functions: counter name is the function name.
const HOST_COUNTED_FUNCTIONS = [
  'isValid',
  'findChild',
  'findByClass',
  'readText',
  'readAttribute',
  'setPanelClass',
  'panelHasClass',
  'setRankImage',
  'setTeamAverageImage',
  'isHideoutDocumentRoot',
  'isEscapeMenuOpen',
  'loadChart',
  'unloadChart',
  'bindScoreboardNames',
  'startEscapePass',
  'refreshMissingSession',
  'readProfileSnapshot',
  'reconcileProfileCharts'
];

// Profile Stats Community functions: counter name is "psc.<name>".
// scheduledCheck is the 0.5 s watcher tick body (the watcher callback itself is
// an anonymous function), armWatcher re-arms it, the inspect*/read* functions
// scan hero rows, and assignBridgeUrl/unloadBridge/beginRequest drive the bridge URL.
const PSC_COUNTED_FUNCTIONS = [
  'scheduledCheck',
  'armWatcher',
  'checkIdentity',
  'runtimePanelsValid',
  'inspectNativeHeroSignature',
  'inspectStockSelection',
  'readSelectedHeroSignature',
  'hasSelectionEvidence',
  'beginRequest',
  'assignBridgeUrl',
  'unloadBridge'
];

// The probe factory. It is a real function so it stays readable and
// syntax-checked, and is embedded with Function.prototype.toString. It runs in
// Panorama's V8 and is minified by Closure ADVANCED afterwards, so it is ES5
// style, and every property Closure must not rename (the `$` members, panel
// properties, performance.now) is accessed through a string literal. It must
// not reference anything outside itself.
function createProbe(__srbDollar) {
  var TAG = '[SRB-P]';
  var INTERVAL_MS = 10000;
  var slice = Array.prototype.slice;
  var apply = Function.prototype.apply;
  var seq = 0;
  var booted = false;
  var ctx = '?:?';
  var win;
  var winStart;
  var startedAt;
  var boundCache = Object.create(null);
  var proxy;

  function clean(value) {
    var text = String(value).replace(/[\s,:=]+/g, '_');
    return text === '' || text === 'undefined' || text === 'null' ? '?' : text;
  }

  function now() {
    try {
      if (typeof performance !== 'undefined' && performance && typeof performance['now'] === 'function') {
        return performance['now']();
      }
    } catch (error) {
      // fall through to Date.now
    }
    return Date.now();
  }

  function newWindow() {
    return { sch: 0, cb: 0, ms: 0, by: Object.create(null), ev: Object.create(null), n: Object.create(null) };
  }

  function bump(map, key) {
    map[key] = (map[key] || 0) + 1;
  }

  function formatMap(map) {
    var parts = [];
    var key;
    for (key in map) {
      parts.push(key + ':' + map[key]);
    }
    return parts.length ? parts.join(',') : '-';
  }

  function emit(line) {
    try {
      if (typeof __srbDollar['Msg'] === 'function') {
        __srbDollar['Msg'](line);
      }
    } catch (error) {
      // diagnostics must never break the runtime
    }
  }

  function maybeReport() {
    var t;
    var line;
    try {
      t = now();
      if (t - winStart < INTERVAL_MS) {
        return;
      }
      if (!booted) {
        booted = true;
        emit(TAG + ' v=1 ctx=' + ctx + ' seq=0 boot');
      }
      seq += 1;
      line = TAG + ' v=1 ctx=' + ctx + ' seq=' + seq + ' t=' + Math.round(t - startedAt) +
        ' win=' + Math.round(t - winStart) + ' sch=' + win.sch + ' cb=' + win.cb +
        ' ms=' + win.ms.toFixed(1) + ' by=' + formatMap(win.by) + ' ev=' + formatMap(win.ev) +
        ' n=' + formatMap(win.n);
      win = newWindow();
      winStart = t;
      emit(line);
    } catch (error) {
      // diagnostics must never break the runtime
    }
  }

  function count(name) {
    try {
      bump(win.n, name);
    } catch (error) {
      // diagnostics must never break the runtime
    }
  }

  function schedule() {
    var args = slice.call(arguments);
    var original = args[1];
    var key;
    if (typeof original === 'function') {
      try {
        key = typeof args[0] === 'number' ? String(Math.round(args[0] * 1000) / 1000) : clean(args[0]);
        win.sch += 1;
      } catch (error) {
        key = '?';
      }
      args[1] = function () {
        var t0 = now();
        try {
          return apply.call(original, this, arguments);
        } finally {
          try {
            win.cb += 1;
            bump(win.by, key);
            win.ms += now() - t0;
          } catch (error) {
            // diagnostics must never break the runtime
          }
          maybeReport();
        }
      };
    } else {
      try {
        win.sch += 1;
      } catch (error) {
        // diagnostics must never break the runtime
      }
    }
    var handle = apply.call(__srbDollar['Schedule'], __srbDollar, args);
    maybeReport();
    return handle;
  }

  function dispatchEvent() {
    try {
      bump(win.ev, clean(arguments[0]));
    } catch (error) {
      // diagnostics must never break the runtime
    }
    return apply.call(__srbDollar['DispatchEvent'], __srbDollar, arguments);
  }

  function getMember(target, key) {
    var value;
    var cached;
    if (typeof key !== 'string') {
      return __srbDollar[key];
    }
    value = __srbDollar[key];
    if (typeof value !== 'function') {
      return value;
    }
    if (key === 'Schedule') {
      return schedule;
    }
    if (key === 'DispatchEvent') {
      return dispatchEvent;
    }
    cached = boundCache[key];
    if (!cached || cached.fn !== value) {
      cached = { fn: value, bound: Function.prototype.bind.call(value, __srbDollar) };
      boundCache[key] = cached;
    }
    return cached.bound;
  }

  // Probe creation: context identity (the only panel read) and the first window.
  // Nothing is emitted here; the boot line is emitted lazily before the first window line.
  try {
    var panel = __srbDollar['GetContextPanel']();
    ctx = clean(panel['paneltype']) + ':' + clean(panel['id']);
  } catch (error) {
    ctx = '?:?';
  }
  startedAt = now();
  winStart = startedAt;
  win = newWindow();

  if (typeof Proxy === 'function') {
    // A bound function has no non-configurable own properties, so the proxy
    // invariants never conflict with the real `$`.
    proxy = new Proxy(Function.prototype.bind.call(function () {}, null), {
      apply: function (target, thisArg, args) {
        return apply.call(__srbDollar, __srbDollar, args);
      },
      get: getMember,
      set: function (target, key, value) {
        __srbDollar[key] = value;
        return true;
      },
      has: function (target, key) {
        return key in __srbDollar;
      },
      deleteProperty: function (target, key) {
        delete __srbDollar[key];
        return true;
      },
      defineProperty: function (target, key, descriptor) {
        Object.defineProperty(__srbDollar, key, descriptor);
        return true;
      }
    });
  } else {
    proxy = __srbDollar;
  }

  return { n: count, dollar: proxy };
}

function countOccurrences(source, needle) {
  let count = 0;
  let index = source.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = source.indexOf(needle, index + needle.length);
  }
  return count;
}

// Returns the index right after the opening brace of the function body that
// starts at `anchorIndex` (the `function NAME(` text), skipping a leading
// "use strict" directive so the directive prologue stays valid.
function bodyStart(source, anchorIndex, anchor, name) {
  let index = anchorIndex + anchor.length;
  let depth = 1;
  while (index < source.length && depth > 0) {
    const ch = source[index];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    index += 1;
  }
  const open = /^\s*\{/.exec(source.slice(index));
  if (depth !== 0 || !open) {
    throw new Error('cannot find the body of ' + name);
  }
  index += open[0].length;
  const directive = /^\s*(["'])use strict\1;?/.exec(source.slice(index));
  return directive ? index + directive[0].length : index;
}

function lineIndent(source, index) {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))[0];
}

function instrument(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('instrument: source must be a non-empty string');
  }
  if (source.indexOf('__srbProbe') !== -1 || source.indexOf(PROBE_TAG) !== -1) {
    throw new Error('instrument: source already contains probe code');
  }

  const targets = HOST_COUNTED_FUNCTIONS.map((name) => ({ name, counter: name }))
    .concat(PSC_COUNTED_FUNCTIONS.map((name) => ({ name, counter: 'psc.' + name })));
  const problems = [];
  const inserts = [];
  const seen = new Set();

  for (const target of targets) {
    if (seen.has(target.counter)) {
      throw new Error('duplicate counter name: ' + target.counter);
    }
    seen.add(target.counter);
    const anchor = 'function ' + target.name + '(';
    const found = countOccurrences(source, anchor);
    if (found !== 1) {
      problems.push(target.name + ' (anchor "' + anchor + '" found ' + found + ' times, expected 1)');
      continue;
    }
    const anchorIndex = source.indexOf(anchor);
    const position = bodyStart(source, anchorIndex, anchor, target.name);
    inserts.push({
      position,
      text: '\n' + lineIndent(source, anchorIndex) + '    __srbProbe.n("' + target.counter + '");'
    });
  }
  if (problems.length > 0) {
    throw new Error('instrument: anchor check failed for: ' + problems.join('; '));
  }

  inserts.sort((a, b) => b.position - a.position);
  let body = source;
  for (const insert of inserts) {
    body = body.slice(0, insert.position) + insert.text + body.slice(insert.position);
  }

  const factory = createProbe.toString();
  if (factory.indexOf(PROBE_TAG) === -1) {
    throw new Error('probe factory does not contain PROBE_TAG');
  }
  return '(function (__srbDollar) {\n' +
    '  var __srbProbe = (' + factory + ')(__srbDollar);\n' +
    '  (function ($) {\n' +
    body + (body.endsWith('\n') ? '' : '\n') +
    '  })(__srbProbe.dollar);\n' +
    '})($);\n';
}

function main(argv) {
  if (argv.length !== 2) {
    console.error('usage: node scripts/showrank-barebones-diagnostics.js <inputComposedRuntime.js> <outputRuntime.js>');
    return 1;
  }
  try {
    fs.writeFileSync(argv[1], instrument(fs.readFileSync(argv[0], 'utf8')));
  } catch (error) {
    console.error('showrank-barebones-diagnostics: ' + error.message);
    return 1;
  }
  return 0;
}

module.exports = { instrument, PROBE_TAG, HOST_COUNTED_FUNCTIONS, PSC_COUNTED_FUNCTIONS };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
