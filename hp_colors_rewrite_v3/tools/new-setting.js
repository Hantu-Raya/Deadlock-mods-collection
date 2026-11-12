#!/usr/bin/env node
'use strict';
// Adds one setting row to settings/schema.json the way the hand-made ones were added: the row on one
// line after an existing row (same key order and spacing as its neighbours), the next free slot numbers
// (enemy first for side-aware), a recordVersion bump with its slotAdditions entry in settings/record.json,
// and optionally a NEW-tab item in settings/news.json. It validates the result with the generator's own
// build (slot contract, news, requirements) before writing, then regenerates v3 and recomposes the
// QOLLOCK and ShowRank layouts (the schema is shared by all three lanes), and prints a checklist of the
// test pins and docs the change still needs, found by scanning the three lanes' tests/ folders.
//
//   node tools/new-setting.js --key hpTextFoo --name "HP foo" --type number --side side-aware \
//     --page "HP Text" --after hpTextSize --default enemy=4,ally=2 --bounds 0,10 --step 1 \
//     --level advanced --unit px --help-text "..." --keywords hp,foo --requires hpTextVisible \
//     --news "HP foo|Foo the HP number." [--dry-run] [--no-generate]
//
// --root points at another v3 tree (a temp copy holding at least settings/); the generator then runs
// with --settings/--record-contract/--news/--output-root/--game-data-root aimed at it.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const V3_ROOT = path.resolve(__dirname, '..');
const LANES = { qollock: 'hp_colors_rewrite_v3_qollock', showrank: 'hp_colors_rewrite_v3_showrank' };
const LANE_TOOLS = { qollock: 'tools/qollock.js', showrank: 'tools/showrank.js' };
const TYPES = ['boolean', 'number', 'enum', 'color'];
const SIDES = ['shared', 'side-aware'];
const PAGES = ['Bar', 'HP Text', 'Name', 'Indicators', 'Icons', 'Units'];
const LEVELS = ['basic', 'advanced'];
const UNITS = ['', 'px', '%', 'deg', 's'];
const VALUE_FLAGS = ['key', 'name', 'type', 'side', 'page', 'group', 'after', 'default', 'bounds', 'step', 'options', 'level', 'unit',
  'help-text', 'keywords', 'requires', 'news', 'news-id', 'date', 'root', 'qollock-root', 'showrank-root'];
const BOOL_FLAGS = ['dry-run', 'no-generate', 'same-version', 'help'];
// Column order of every existing row; optional columns sit where the existing rows put them.
const ORDER = ['key', 'slot', 'name', 'type', 'options', 'bounds', 'step', 'default', 'side', 'page', 'group', 'level', 'unit', 'help', 'keywords', 'requires'];

const USAGE = `Usage: node tools/new-setting.js --key <camelKey> --name <label> --type boolean|number|enum|color
  --side shared|side-aware --page <${PAGES.join('|')}> --level basic|advanced --help-text <text>
  [--group <card>|none] [--after <key>] [--default <value>|enemy=<v>,ally=<v>] [--bounds min,max] [--step n]
  [--options value:Label,...] [--unit ${UNITS.filter(Boolean).join('|')}] [--keywords a,b,c]
  [--requires key|key=opt/opt|key>n, conditions joined by "," (all), alternatives by "|" (either), or raw JSON]
  [--news "title|description" [--news-id id] [--date YYYY-MM-DD]]
  [--dry-run] [--no-generate] [--same-version] [--root <v3 tree>] [--qollock-root <dir>] [--showrank-root <dir>]
--group defaults to the --after row's group (none = the page's lead card); --after defaults to the
last row of that page and card. --default is required except for booleans (false).`;

// One schema/record value the way the files write it: `{ "a": 1 }`, `[1, 2]`, no newlines.
function inline(value) {
  if (Array.isArray(value)) return '[' + value.map(inline).join(', ') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length ? '{ ' + keys.map(key => JSON.stringify(key) + ': ' + inline(value[key])).join(', ') + ' }' : '{}';
  }
  return JSON.stringify(value);
}
const recordText = record => '{\n' + Object.keys(record).map(key => '  ' + JSON.stringify(key) + ': ' + inline(record[key])).join(',\n') + '\n}\n';
function orderRow(row) {
  const out = {};
  for (const key of ORDER) if (Object.hasOwn(row, key)) out[key] = row[key];
  return out;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i], value;
    if (!arg.startsWith('--')) throw new Error('Unexpected argument: ' + arg);
    arg = arg.slice(2);
    const eq = arg.indexOf('=');
    if (eq >= 0) { value = arg.slice(eq + 1); arg = arg.slice(0, eq); }
    if (BOOL_FLAGS.includes(arg)) {
      if (value !== undefined) throw new Error('--' + arg + ' takes no value');
      opts[arg] = true;
    } else if (VALUE_FLAGS.includes(arg)) {
      // Values may start with "-" (--bounds -200,200), so the next argument is always the value.
      if (value === undefined) { if (i + 1 >= argv.length) throw new Error('--' + arg + ' needs a value'); value = argv[++i]; }
      if (Object.hasOwn(opts, arg)) throw new Error('--' + arg + ' given twice');
      opts[arg] = value;
    } else throw new Error('Unknown option --' + arg);
  }
  return opts;
}

const list = text => String(text).split(',').map(item => item.trim()).filter(Boolean);
function parseScalar(type, text, options, label) {
  const raw = String(text).trim();
  if (type === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error(label + ': boolean default must be true or false');
    return raw === 'true';
  }
  if (type === 'number') {
    const number = Number(raw);
    if (!raw || !Number.isFinite(number)) throw new Error(label + ': number default must be finite, got ' + raw);
    return number;
  }
  if (type === 'color') {
    if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) throw new Error(label + ': color default must be #RRGGBB, got ' + raw);
    return raw.toUpperCase();
  }
  if (!options.some(option => option.value === raw)) throw new Error(label + ': enum default ' + raw + ' is not one of ' + options.map(o => o.value).join(', '));
  return raw;
}
function parseDefault(opts, type, side, options) {
  if (opts.default === undefined) {
    if (type === 'boolean') return side === 'side-aware' ? { enemy: false, ally: false } : false;
    throw new Error('--default is required for ' + type + ' settings');
  }
  const text = String(opts.default);
  const perSide = /^\s*(enemy|ally)\s*=/.test(text);
  if (!perSide) {
    const value = parseScalar(type, text, options, '--default');
    return side === 'side-aware' ? { enemy: value, ally: value } : value;
  }
  if (side !== 'side-aware') throw new Error('--default enemy=/ally= values need --side side-aware');
  const sides = {};
  for (const part of text.split(',')) {
    const match = /^\s*(enemy|ally)\s*=(.*)$/.exec(part);
    if (!match || Object.hasOwn(sides, match[1])) throw new Error('--default expects enemy=<value>,ally=<value>, got ' + text);
    sides[match[1]] = parseScalar(type, match[2], options, '--default ' + match[1]);
  }
  if (!Object.hasOwn(sides, 'enemy') || !Object.hasOwn(sides, 'ally')) throw new Error('--default needs both enemy= and ally=');
  return { enemy: sides.enemy, ally: sides.ally };
}
function parseOptions(text) {
  const options = list(text).map(part => {
    const colon = part.indexOf(':');
    if (colon <= 0 || !part.slice(colon + 1).trim()) throw new Error('--options expects value:Label,..., got ' + part);
    return { value: part.slice(0, colon).trim(), label: part.slice(colon + 1).trim() };
  });
  if (!options.length) throw new Error('--options needs at least one value:Label');
  if (new Set(options.map(o => o.value)).size !== options.length) throw new Error('--options values must be unique');
  return options;
}
function parseCondition(text) {
  const raw = text.trim();
  let match = /^([A-Za-z][A-Za-z0-9]*)\s*>\s*(-?[0-9.]+)$/.exec(raw);
  if (match) {
    const above = Number(match[2]);
    if (!Number.isFinite(above)) throw new Error('--requires: bad number in ' + raw);
    return { key: match[1], above };
  }
  match = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+)$/.exec(raw);
  if (match) return { key: match[1], is: match[2].split('/').map(value => value.trim()).filter(Boolean) };
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(raw)) return { key: raw };
  throw new Error('--requires: cannot read condition ' + raw);
}
function parseRequires(text) {
  const raw = String(text).trim();
  if (raw.startsWith('[')) return JSON.parse(raw);
  return list(raw).map(part => {
    const alternatives = part.split('|').map(parseCondition);
    return alternatives.length > 1 ? { any: alternatives } : alternatives[0];
  });
}
function parseNumbers(text, label) {
  const values = list(text).map(Number);
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error(label + ': expected numbers, got ' + text);
  return values;
}
const kebab = key => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
const pascal = key => key[0].toUpperCase() + key.slice(1);
const flatKeys = row => row.side === 'side-aware' ? ['enemy' + pascal(row.key), 'ally' + pascal(row.key)] : [row.key];
const slotsOf = row => row.slot !== null && typeof row.slot === 'object' ? [row.slot.enemy, row.slot.ally] : [row.slot];
function localDate() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

// Builds the new row from the options, without slots; throws on anything the generator would refuse
// plus the tool's own sanity rules (unique key, sane bounds/default/step, --after on the same page).
function buildRow(opts, rows) {
  for (const flag of ['key', 'name', 'type', 'side', 'page', 'level', 'help-text'])
    if (opts[flag] === undefined || !String(opts[flag]).trim()) throw new Error('--' + flag + ' is required');
  const key = opts.key.trim();
  if (!/^[a-z][A-Za-z0-9]*$/.test(key)) throw new Error('--key must be camelCase letters/digits, got ' + key);
  if (!TYPES.includes(opts.type)) throw new Error('--type must be one of ' + TYPES.join(', '));
  if (!SIDES.includes(opts.side)) throw new Error('--side must be shared or side-aware');
  if (!PAGES.includes(opts.page)) throw new Error('--page must be one of ' + PAGES.join(', '));
  if (!LEVELS.includes(opts.level)) throw new Error('--level must be basic or advanced');
  const unit = opts.unit === undefined ? '' : opts.unit;
  if (!UNITS.includes(unit)) throw new Error('--unit must be one of "", ' + UNITS.filter(Boolean).join(', '));
  const taken = new Map();
  for (const row of rows) {
    taken.set(row.key.toLowerCase(), 'setting ' + row.key);
    for (const flat of flatKeys(row)) taken.set(flat.toLowerCase(), 'codec key ' + flat + ' of ' + row.key);
  }
  const candidate = { key, side: opts.side };
  for (const name of [key, ...flatKeys(candidate)]) {
    // Menu ids are Pascal(key) and codec keys are side + Pascal(key), so a case-insensitive clash is a clash.
    if (taken.has(name.toLowerCase())) throw new Error('--key ' + key + ' is not unique: clashes with ' + taken.get(name.toLowerCase()));
  }
  const type = opts.type;
  let options, bounds = null, step = null;
  if (type === 'enum') {
    if (opts.options === undefined) throw new Error('--options is required for enum settings');
    options = parseOptions(opts.options);
  } else if (opts.options !== undefined) throw new Error('--options only applies to enum settings');
  if (type === 'number') {
    if (opts.bounds === undefined || opts.step === undefined) throw new Error('--bounds and --step are required for number settings');
    bounds = parseNumbers(opts.bounds, '--bounds');
    if (bounds.length !== 2 || bounds[0] >= bounds[1]) throw new Error('--bounds needs min,max with min < max, got ' + opts.bounds);
    [step] = parseNumbers(opts.step, '--step');
    if (!(step > 0) || step > bounds[1] - bounds[0]) throw new Error('--step must be > 0 and fit inside the bounds, got ' + opts.step);
  } else if (opts.bounds !== undefined || opts.step !== undefined) throw new Error('--bounds/--step only apply to number settings');
  const defaults = parseDefault(opts, type, opts.side, options);
  if (type === 'number') {
    for (const value of opts.side === 'side-aware' ? [defaults.enemy, defaults.ally] : [defaults]) {
      if (value < bounds[0] || value > bounds[1]) throw new Error('--default ' + value + ' is outside --bounds ' + bounds.join(','));
      const steps = (value - bounds[0]) / step;
      if (Math.abs(steps - Math.round(steps)) > 1e-8) throw new Error('--default ' + value + ' is off the --step ' + step + ' grid from ' + bounds[0]);
    }
  }
  let after = null;
  if (opts.after !== undefined) {
    after = rows.find(row => row.key === opts.after);
    if (!after) throw new Error('--after ' + opts.after + ' does not exist in settings/schema.json');
    if (after.page !== opts.page) throw new Error('--after ' + after.key + ' is on page ' + after.page + ', not ' + opts.page);
  }
  let group;
  if (opts.group === undefined) group = after && Object.hasOwn(after, 'group') ? after.group : undefined;
  else if (opts.group.trim().toLowerCase() === 'none') group = undefined;
  else if (opts.group.trim()) group = opts.group.trim();
  else throw new Error('--group must not be empty (use none for the lead card)');
  if (!after) {
    const sameCard = rows.filter(row => row.page === opts.page && row.group === group);
    const samePage = rows.filter(row => row.page === opts.page);
    after = (sameCard.length ? sameCard : samePage).at(-1);
    if (!after) throw new Error('No row on page ' + opts.page + ' to insert after; pass --after');
  }
  const help = opts['help-text'].trim();
  const keywords = opts.keywords === undefined ? [] : list(opts.keywords);
  const row = { key, slot: null, name: opts.name.trim(), type };
  if (options) row.options = options;
  Object.assign(row, { bounds, step, default: defaults, side: opts.side, page: opts.page });
  if (group !== undefined) row.group = group;
  Object.assign(row, { level: opts.level, unit, help, keywords });
  if (opts.requires !== undefined) row.requires = parseRequires(opts.requires);
  return { row, after };
}

// Next free slot: above every slot in the schema, the retired list and the record history (and the
// committed generated/slots.json when the tree has one), so a retired or once-introduced number never returns.
function nextSlot(rows, record, root) {
  const used = [...rows.flatMap(slotsOf), ...(record.retiredSlots || []), ...(record.slotAdditions || []).flatMap(change => change.slots),
    ...(record.defaultChanges || []).flatMap(change => change.slots)];
  const committed = path.join(root, 'generated/slots.json');
  if (fs.existsSync(committed)) used.push(...JSON.parse(fs.readFileSync(committed, 'utf8')).map(slot => slot.slot));
  return Math.max(-1, ...used.filter(Number.isSafeInteger)) + 1;
}

function readTree(root) {
  const file = name => path.join(root, 'settings', name);
  const texts = {};
  for (const name of ['schema.json', 'record.json', 'news.json']) {
    if (!fs.existsSync(file(name))) throw new Error('Missing ' + file(name));
    texts[name] = fs.readFileSync(file(name), 'utf8');
    if (texts[name].includes('\r')) throw new Error(file(name) + ' has CRLF line endings; settings/** is LF');
  }
  return texts;
}

function plan(opts, root) {
  const texts = readTree(root);
  const rows = JSON.parse(texts['schema.json']);
  const record = JSON.parse(texts['record.json']);
  const news = JSON.parse(texts['news.json']);
  if (recordText(record) !== texts['record.json']) throw new Error('settings/record.json is not in the expected one-entry-per-line layout; refusing to rewrite it');
  const lines = texts['schema.json'].split('\n');
  // Every row is one line `  { ... },` (last without comma) between `[` and `]`.
  if (lines[0] !== '[' || lines.at(-1) !== '' || lines.at(-2) !== ']' || lines.length !== rows.length + 3)
    throw new Error('settings/schema.json is not one row per line; refusing to rewrite it');
  rows.forEach((row, index) => {
    if (lines[index + 1] !== '  ' + inline(row) + (index < rows.length - 1 ? ',' : ''))
      throw new Error('settings/schema.json line ' + (index + 2) + ' (' + row.key + ') is not in the expected layout; refusing to rewrite it');
  });
  const { row, after } = buildRow(opts, rows);
  const first = nextSlot(rows, record, root);
  row.slot = row.side === 'side-aware' ? { enemy: first, ally: first + 1 } : first;
  const slots = slotsOf(row);
  const ordered = orderRow(row);
  const index = rows.indexOf(after);
  const nextRows = [...rows.slice(0, index + 1), ordered, ...rows.slice(index + 1)];
  const schemaLines = lines.slice();
  const isLast = index === rows.length - 1;
  if (isLast) schemaLines[index + 1] += ',';
  schemaLines.splice(index + 2, 0, '  ' + inline(ordered) + (isLast ? '' : ','));
  // --same-version: a feature that adds several settings bumps the record once. Later settings join the
  // newest slotAdditions entry; only valid while that version has not shipped.
  const join = opts['same-version'] === true, newest = record.slotAdditions.at(-1);
  if (join && !(newest && newest.version === record.recordVersion))
    throw new Error('--same-version needs the newest slotAdditions entry to be recordVersion ' + record.recordVersion);
  const version = join ? record.recordVersion : record.recordVersion + 1;
  const nextRecord = join
    ? { ...record, slotAdditions: [...record.slotAdditions.slice(0, -1), { version, slots: [...newest.slots, ...slots] }] }
    : { ...record, recordVersion: version, slotAdditions: [...record.slotAdditions, { version, slots }] };
  let newsItem = null, newsText = texts['news.json'];
  if (opts.news !== undefined) {
    const bar = opts.news.indexOf('|');
    const title = (bar < 0 ? opts.news : opts.news.slice(0, bar)).trim();
    const description = bar < 0 ? '' : opts.news.slice(bar + 1).trim();
    if (!title || !description) throw new Error('--news expects "title|description"');
    if (title.length > 240 || description.length > 240) throw new Error('--news title and description are at most 240 characters');
    const id = opts['news-id'] || kebab(row.key);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 48) throw new Error('news id ' + id + ' must be kebab-case, at most 48 characters');
    if (news.some(item => item.id === id)) throw new Error('news id ' + id + ' already exists; pass --news-id');
    const date = opts.date || localDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must be YYYY-MM-DD');
    newsItem = { id, release: record.release, date, badge: 'New', title, description, targets: [{ key: row.key }] };
    // Newest first; the item uses the file's three-line layout (head, description, targets).
    const head = ['id', 'release', 'date', 'badge', 'title'].map(key => JSON.stringify(key) + ': ' + JSON.stringify(newsItem[key])).join(', ');
    const block = '  { ' + head + ',\n    "description": ' + JSON.stringify(description) + ',\n    "targets": ' + inline(newsItem.targets) + ' }' + (news.length ? ',' : '');
    if (!newsText.startsWith('[\n')) throw new Error('settings/news.json does not start with "[\\n"');
    newsText = '[\n' + block + '\n' + newsText.slice(2);
    if (JSON.stringify(JSON.parse(newsText)) !== JSON.stringify([newsItem, ...news])) throw new Error('news.json insertion failed to round-trip');
  } else if (opts['news-id'] !== undefined) throw new Error('--news-id needs --news');
  const outputs = {
    'settings/schema.json': schemaLines.join('\n'),
    'settings/record.json': recordText(nextRecord),
    'settings/news.json': newsText,
  };
  if (JSON.stringify(JSON.parse(outputs['settings/schema.json'])) !== JSON.stringify(nextRows)) throw new Error('schema.json insertion failed to round-trip');
  return { row: ordered, after, slots, version, oldVersion: record.recordVersion, release: record.release, newsItem,
    rows: nextRows, record: nextRecord, news: newsItem ? [newsItem, ...news] : news, texts, outputs };
}

// Where the generator lives and which tree it reads game data from: the tree itself when it is a full
// v3 checkout, otherwise this tool's own v3 lane (read only).
function generatorFor(root) {
  const local = path.join(root, 'tools/generate.js');
  const genRoot = fs.existsSync(local) ? root : V3_ROOT;
  const dataRoot = fs.existsSync(path.join(root, 'game-data-pin.json')) && fs.existsSync(path.join(root, 'vendor')) ? root : genRoot;
  const args = ['--settings', path.join(root, 'settings/schema.json'), '--record-contract', path.join(root, 'settings/record.json'),
    '--news', path.join(root, 'settings/news.json'), '--game-data-root', dataRoot, '--output-root', root];
  return { script: path.join(genRoot, 'tools/generate.js'), genRoot, dataRoot, args };
}

// Runs the generator's build in-process on the planned rows: the same validation `generate.js` does
// (columns, defaults, requirements, news targets, slot contract against the committed outputs).
function validateWithGenerator(result, root) {
  const { script, genRoot, dataRoot } = generatorFor(root);
  const { generate } = require(script);
  const { derive } = require(path.join(genRoot, 'tools/game-data.js'));
  generate(result.rows, derive(dataRoot), result.record, result.news);
}

// Minimal unified line diff (LCS) for --dry-run.
function diff(before, after, name) {
  const a = before.split('\n'), b = after.split('\n');
  const n = a.length, m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push([' ', a[i], i, j]); i++; j++; }
    else if (i < n && (j >= m || table[i + 1][j] >= table[i][j + 1])) { ops.push(['-', a[i], i, j]); i++; }
    else { ops.push(['+', b[j], i, j]); j++; }
  }
  const changed = ops.map((op, index) => op[0] !== ' ' ? index : -1).filter(index => index >= 0);
  if (!changed.length) return '';
  const context = 2, out = ['--- a/' + name, '+++ b/' + name];
  let start = 0;
  while (start < changed.length) {
    let end = start;
    while (end + 1 < changed.length && changed[end + 1] - changed[end] <= context * 2 + 1) end++;
    const from = Math.max(0, changed[start] - context), to = Math.min(ops.length - 1, changed[end] + context);
    const slice = ops.slice(from, to + 1);
    const oldStart = slice[0][2] + 1, newStart = slice[0][3] + 1;
    out.push('@@ -' + oldStart + ',' + slice.filter(op => op[0] !== '+').length + ' +' + newStart + ',' + slice.filter(op => op[0] !== '-').length + ' @@');
    for (const op of slice) out.push(op[0] + op[1]);
    start = end + 1;
  }
  return out.join('\n') + '\n';
}

function laneRoots(opts, root) {
  return {
    qollock: path.resolve(opts['qollock-root'] || path.join(path.dirname(root), LANES.qollock)),
    showrank: path.resolve(opts['showrank-root'] || path.join(path.dirname(root), LANES.showrank)),
  };
}

// Checklist: every test pin and doc the new setting touches, by file:line, from the three tests/ folders.
function checklist(result, root, lanes) {
  // A settings-only tree (a temp copy) has no tests/: the pins then come from this tool's own v3 lane.
  const testsRoot = fs.existsSync(path.join(root, 'tests')) ? root : V3_ROOT;
  const rel = file => {
    for (const base of [path.dirname(root), path.dirname(V3_ROOT)]) {
      const relative = path.relative(base, file);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) return relative.replace(/\\/g, '/');
    }
    return file.replace(/\\/g, '/');
  };
  const items = [];
  const add = (file, line, text) => items.push({ where: file ? rel(file) + (line ? ':' + line : '') : '', text });
  const laneTests = lane => [lanes[lane], path.join(path.dirname(V3_ROOT), LANES[lane])].map(dir => path.join(dir, 'tests')).find(dir => fs.existsSync(dir));
  const folders = [path.join(testsRoot, 'tests'), laneTests('qollock'), laneTests('showrank')].filter(dir => dir && fs.existsSync(dir));
  const files = folders.flatMap(dir => fs.readdirSync(dir).filter(name => name.endsWith('.js')).sort().map(name => path.join(dir, name)));
  const read = file => fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const { row, oldVersion, version, slots } = result;
  const scope = row.side === 'side-aware' ? 'E/A' : 'S';
  const controls = row.side === 'side-aware' ? 2 : 1;
  const pin = new RegExp('recordVersion\\s*(?:,|===?|:)\\s*' + oldVersion + '\\b');
  for (const file of files) read(file).forEach((text, index) => {
    if (oldVersion !== version && pin.test(text)) add(file, index + 1, 'record-version pin ' + oldVersion + ' -> ' + version);
  });
  const named = name => files.find(file => path.basename(file) === name && path.dirname(file) === path.join(testsRoot, 'tests'));
  const nav = named('nav.test.js');
  if (nav) {
    const lines = read(nav);
    const pageLine = lines.findIndex(text => text.trim().startsWith('[' + JSON.stringify(row.page).replace(/"/g, "'") + ', ['));
    if (pageLine < 0) add(nav, 0, 'page ' + row.page + ' not found in STRUCTURE; add ' + "['" + row.key + "', " + scope + ']');
    else {
      let end = pageLine + 1;
      while (end < lines.length && !/^\s*\]\],?\s*$/.test(lines[end])) end++;
      const cards = [];
      for (let i = pageLine + 1; i < end; i++) { const match = /^\s*\['([^']*)',/.exec(lines[i]); if (match) cards.push({ name: match[1], line: i }); }
      // Rows without a group sit in the page's lead card (the first one, shown as LEAD[page]).
      const card = row.group === undefined ? cards[0] : cards.find(entry => entry.name === row.group);
      const fold = row.level === 'basic' ? 'basic' : 'advanced';
      if (!card) add(nav, pageLine + 1, row.page + ' card order: new card "' + row.group + '" for [\'' + row.key + "', " + scope + '] (' + fold +
        '); a card needs two or more rows (ticket 37), and the card ids/sub-nav follow schema order');
      else {
        const afterHere = lines[card.line].includes("'" + result.after.key + "'");
        add(nav, card.line + 1, row.page + ' card "' + card.name + '": add [\'' + row.key + "', " + scope + '] to the ' + fold + ' list' +
          (afterHere ? " after '" + result.after.key + "'" : ' in schema order') + ' (schema order within the card)');
      }
    }
  }
  const newsTest = named('news.test.js');
  if (newsTest && result.newsItem) {
    const lines = read(newsTest), variable = 'v' + result.release.replace(/\./g, '');
    const declared = lines.findIndex(text => new RegExp('const\\s+' + variable + '\\s*=\\s*\\[').test(text));
    if (declared >= 0) add(newsTest, declared + 1, 'release list ' + variable + ': add \'' + result.newsItem.id + '\' first (news.json is newest first)');
    else {
      const title = lines.findIndex(text => /news\.json holds the/.test(text));
      const order = lines.findIndex(text => /assert\.deepEqual\(news\.map\(item => item\.id\)/.test(text));
      const release = lines.findIndex(text => /assert\.equal\(item\.release,/.test(text));
      if (title >= 0) add(newsTest, title + 1, 'new release ' + result.release + ': name it in the test title');
      if (title >= 0) add(newsTest, title + 2, 'declare const ' + variable + " = ['" + result.newsItem.id + "'];");
      if (order >= 0) add(newsTest, order + 1, 'prepend ...' + variable + ' to the id order');
      if (release >= 0) add(newsTest, release + 1, 'map ' + variable + ' ids to release ' + result.release);
    }
  }
  const perf = named('audit-performance.test.js');
  if (perf) read(perf).forEach((text, index) => {
    for (const match of text.matchAll(/ops\('(syncAll|bootChrome)'\)\.boundaryValidityCalls\s*<=\s*(\d+)/g)) {
      if (match[1] === 'syncAll') add(perf, index + 1, 'syncAll validity budget ' + match[2] + ': +' + controls + ' control' + (controls > 1 ? 's' : '') +
        ' (last measured about 5 calls per control); re-measure and update the comment above it');
      else add(perf, index + 1, 'bootChrome validity budget ' + match[2] + (result.newsItem ? ': the NEW item adds about 2 calls' : ': unchanged unless a NEW item is added') + '; re-measure');
    }
  });
  const migration = named('migration.test.js');
  if (migration) read(migration).forEach((text, index) => {
    const body = /\bbody\((\d+)\)/.exec(text), scopes = /v2scopes\.length\s*,\s*(\d+)/.exec(text);
    if (/largest synthetic/.test(text)) add(migration, index + 1, 'largest-convertible comment: add the v' + version + ' slots (' + slots.join('/') + ') to the history');
    else if ((body || scopes) && /oversized/.test(text)) add(migration, index + 1, 'oversized v2 save (' + (body || scopes)[1] + ' scopes) must still expand past the 192,000 cap (more slots only grow it)');
    else if (body || scopes) add(migration, index + 1, 'largest convertible synthetic v2 save: ' + (body || scopes)[1] +
      ' scopes; ' + controls + ' more slot' + (controls > 1 ? 's' : '') + ' per scope copy may lower it, re-measure under the 192,000 cap');
  });
  const codec = named('codec.test.js');
  if (codec) {
    const lines = read(codec);
    let last = -1;
    lines.forEach((text, index) => { if (/test\('record v\d+/.test(text)) last = index; });
    add(codec, last >= 0 ? last + 1 : 0, 'add a "record v' + version + '" test: a v' + oldVersion + ' record reads the default, slot' +
      (slots.length > 1 ? 's ' + slots.join('/') + ' are' : ' ' + slots[0] + ' is') + ' written only when changed and round-trip');
  }
  const doc = name => path.join(root, name);
  add(null, 0, 'implement the setting: renderer/preview read ' + (row.side === 'side-aware' ? 'enemy/ally ' : '') + row.key + ' (tests/renderer.test.js, tests/preview.test.js)');
  add(doc('MAP.md'), 0, 'changelog: **Added:** under the in-development section (slots ' + slots.join('/') + ', record v' + version + '); `node tools/ticket.js new --map`');
  add(doc('issues'), 0, 'ticket: `node tools/ticket.js new --title ...`; SPEC story via `--spec-after <story>`');
  add(doc('LIVE-VERIFIED.md'), 0, 'record the in-game check once done');
  add(null, 0, 'run all suites: node --test hp_colors_rewrite_v3/tests/*.test.js, ' + LANES.qollock + '/tests, ' + LANES.showrank + '/tests');
  add(null, 0, 'release builds of all three lanes (node hp_colors_rewrite_v3/tools/build.js --project all --skip-deploy)');
  return items;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  const output = ((result.stdout || '') + (result.stderr || '')).trim();
  if (result.error) throw result.error;
  return { ok: result.status === 0, output };
}

// ShowRank's composer also reads the ShowRank barebones sources (read only): beside the lane, else the checkout's.
function showrankSource(laneRoot) {
  const candidates = [path.join(path.dirname(laneRoot), 'showrank_barebones'), path.join(path.dirname(V3_ROOT), 'showrank_barebones')];
  return candidates.find(dir => fs.existsSync(dir)) || candidates[0];
}

// Regenerates v3 then recomposes QOLLOCK and ShowRank. A lane runs its own CLI (no flags = write) when both
// it and v3 are the real checkout; otherwise its module's writeOrCheck(false, laneRoot, v3Root).
function regenerate(root, lanes) {
  const gen = generatorFor(root);
  const steps = [];
  const generated = run(process.execPath, [gen.script, ...gen.args], root);
  steps.push({ name: 'generate.js', ...generated });
  if (!generated.ok) return steps;
  const checked = run(process.execPath, [gen.script, '--check', ...gen.args], root);
  steps.push({ name: 'generate.js --check', ...checked });
  if (!checked.ok) return steps;
  const realV3 = path.resolve(root) === V3_ROOT;
  for (const lane of ['qollock', 'showrank']) {
    const tool = path.join(lanes[lane], LANE_TOOLS[lane]);
    if (!fs.existsSync(tool)) { steps.push({ name: path.basename(tool), ok: true, skipped: true, output: 'skipped: ' + tool + ' not found' }); continue; }
    const realLane = realV3 && path.resolve(lanes[lane]) === path.join(path.dirname(V3_ROOT), LANES[lane]);
    const result = realLane ? run(process.execPath, [tool], lanes[lane])
      : run(process.execPath, ['-e', 'const m=require(process.argv[1]);console.log("' + lane + ' layouts: "+m.writeOrCheck(false,process.argv[2],process.argv[3],process.argv[4])+" outputs written")',
        tool, lanes[lane], path.resolve(root), showrankSource(lanes[lane])], lanes[lane]);
    steps.push({ name: path.basename(tool), ...result });
    if (!result.ok) return steps;
  }
  return steps;
}

function main(argv, out = console.log) {
  const opts = parseArgs(argv);
  if (opts.help) { out(USAGE); return 0; }
  const root = path.resolve(opts.root || V3_ROOT);
  const lanes = laneRoots(opts, root);
  const result = plan(opts, root);
  validateWithGenerator(result, root);
  const where = 'after ' + result.after.key + (result.row.group ? ' (card ' + result.row.group + ')' : '');
  out((opts['dry-run'] ? 'Would add ' : 'Adding ') + result.row.key + ' (' + result.row.type + ', ' + result.row.side + ', ' + result.row.page + ', ' + where +
    '): slot' + (result.slots.length > 1 ? 's enemy ' + result.slots[0] + ' / ally ' + result.slots[1] : ' ' + result.slots[0]) +
    ', recordVersion ' + (result.oldVersion === result.version ? result.version + ' (unchanged, --same-version)' : result.oldVersion + ' -> ' + result.version) + (result.newsItem ? ', NEW item ' + result.newsItem.id + ' (' + result.release + ')' : ''));
  if (opts['dry-run']) {
    for (const [name, text] of Object.entries(result.outputs)) {
      const patch = diff(result.texts[path.basename(name)], text, path.relative(path.dirname(root), path.join(root, name)).replace(/\\/g, '/'));
      if (patch) out(patch.trimEnd());
    }
    out('Dry run: nothing written' + (opts['no-generate'] ? '.' : '; a real run would then run tools/generate.js, qollock.js and showrank.js.'));
  } else {
    for (const [name, text] of Object.entries(result.outputs)) if (text !== result.texts[path.basename(name)]) fs.writeFileSync(path.join(root, name), text, 'utf8');
    if (opts['no-generate']) out('Settings written; generation skipped (--no-generate). Run tools/generate.js, then qollock.js and showrank.js.');
    else {
      const steps = regenerate(root, lanes);
      for (const step of steps) out((step.skipped ? '[skip] ' : step.ok ? '[ok]   ' : '[FAIL] ') + step.name + (step.output ? ': ' + step.output.replace(/\n/g, '\n       ') : ''));
      if (steps.some(step => !step.ok)) { out('Generation failed; the settings files are written. Fix and rerun the failed step.'); return 1; }
    }
  }
  out('\nChecklist (still to touch):');
  for (const item of checklist(result, root, lanes)) out('- [ ] ' + (item.where ? item.where + ': ' : '') + item.text);
  return 0;
}

module.exports = { main, plan, parseArgs, buildRow, nextSlot, checklist, diff, inline, recordText, generatorFor, kebab, V3_ROOT };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error('new-setting: ' + error.message); process.exitCode = 1; }
}
