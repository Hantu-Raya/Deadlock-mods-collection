'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const nodeTest = require('node:test');
const storeAvailable = fs.existsSync('D:/hpv2-store');
const test = (name, fn) => nodeTest(name, { skip: storeAvailable ? false :
  'D:/hpv2-store checkout absent; pinned storage VM tests remain available.' }, fn);

// Compatibility always compares to the immutable pre-CAS implementation. Deployment checks below
// separately validate the local deployment ref against the pin; they do not claim a live HTTPS fetch.
const pin = require('../vendor/hpv2-store.pin.json');
const PRE_CAS = '75e76209f4bdfaada1c79a05d9285c95f8c8c656';
const STORE_REF = process.env.HPV3_STORE_REF || (pin.published === false ? null : pin.commit);
const scriptOf = html => html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
const committedSource = ref => scriptOf(execFileSync('git', ['-C', 'D:/hpv2-store', 'show', `${ref}:index.html`], { encoding: 'utf8' }));
const pageSource = !storeAvailable ? null : STORE_REF ? committedSource(STORE_REF)
  : scriptOf(fs.readFileSync('D:/hpv2-store/index.html', 'utf8'));
const sha = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const CURRENT = 'hantu.hpcolors.v2/state';
const PREVIOUS = `${CURRENT}.prev`;
const V3 = 'hantu.hpcolors.v3/state';
const V3_PREVIOUS = `${V3}.prev`;
const OTHER = 'hantu.bufftimer.v1/settings';
const PAGE_URL = 'https://hantu-raya.github.io/hpv2-store/';

function fnv(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function record(body) {
  return `HPV2S1.${fnv(body)}.${body}`;
}

function page(seed = {}, source = pageSource) {
  const disk = new Map(Object.entries(seed));
  const accesses = [];
  let title;
  let hashchange;
  let serial = 0;
  const location = { href: PAGE_URL, hash: '' };
  const context = vm.createContext({
    JSON, Math, String, Number, decodeURIComponent, location,
    localStorage: {
      getItem: (key) => {
        accesses.push(['get', key]);
        return disk.has(key) ? disk.get(key) : null;
      },
      setItem: (key, value) => {
        accesses.push(['set', key]);
        disk.set(key, String(value));
      },
      removeItem: (key) => {
        accesses.push(['remove', key]);
        disk.delete(key);
      },
    },
    document: { set title(value) { title = value; } },
    addEventListener: (event, callback) => {
      if (event === 'hashchange') hashchange = callback;
    },
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'hpv2-store/index.html' });
  return {
    disk,
    accesses,
    request(message) {
      const data = { i: `test${++serial}`, ...message };
      location.hash = `#${encodeURIComponent(JSON.stringify(data))}`;
      location.href = PAGE_URL + location.hash;
      title = undefined;
      hashchange();
      assert.ok(title?.startsWith('HPV2S1:'), 'every request must produce a page title');
      const reply = JSON.parse(title.slice('HPV2S1:'.length));
      assert.equal(reply.i, data.i);
      assert.equal(reply.o, data.o === 'hello' ? 'ready' : data.o);
      assert.equal(reply.ok, reply.e === undefined, 'errors fail closed; success has no error');
      assert.equal(reply.q, serial, 'every reply has a fresh sequence');
      if (reply.ok && (data.o === 'r' || data.o === 'w')) {
        assert.equal(reply.p, data.p);
      }
      return reply;
    },
  };
}

// v2's exact message shapes retain replies and storage effects; only ready gains cas.
test('v2 protocol transcript is byte-identical on the fixed pre-CAS and pinned page', () => {
  const valid = record('{"v2":1}'), big = record('w'.repeat(6200));
  const seed = { [CURRENT]: valid, [PREVIOUS]: 'old backup' };
  const steps = [
    { o: 'hello' },
    { o: 'r', r: 'r1', p: 0, k: CURRENT }, { o: 'r', r: 'r1', p: 0, k: PREVIOUS },
    { o: 'w', r: 'w1', p: 0, n: 1, v: record('a'), e: fnv('{"v2":1}') },
    { o: 'w', r: 'w1', p: 0, n: 1, v: record('a'), e: fnv('{"v2":1}') },
    { o: 'w', r: 'w2', p: 0, n: 1, v: record('b'), e: 'deadbeef' },
    ...[0, 1, 2].map(p => ({ o: 'w', r: 'w3', p, n: 3, v: big.slice(p * 3000, (p + 1) * 3000), e: '' })),
    { o: 'r', r: 'r2', p: 0, k: CURRENT }, { o: 'r', r: 'r2', p: 2, k: CURRENT },
    { o: 'w', r: 'w4', p: 1, n: 2, v: 'x', e: '' },
    { o: 'w', r: 'w5', p: 0, n: 1, v: 'HPV2S1.00000000.bad', e: '' },
    { o: 'w', r: 'w6', p: 0, n: 1, v: record('c'), e: 5 },
    { o: 'd' },
    { o: 'r', r: 'r3', p: 0, k: CURRENT },
  ];
  const run = source => {
    const store = page(seed, source);
    const replies = steps.map(step => { const reply = store.request(step); if (reply.o === 'ready') delete reply.c; return reply; });
    return JSON.stringify({ replies, disk: [...store.disk], accesses: store.accesses });
  };
  assert.equal(run(pageSource), run(committedSource(PRE_CAS)));
  assert.deepEqual(page({}, committedSource(PRE_CAS)).request({ o: 'hello' }).c, ['vkeys']);
});

function write(store, key, value, expected = '') {
  return store.request({ o: 'w', r: `write-${key}`, p: 0, n: 1, k: key, v: value, e: expected });
}

function read(store, key, id = `read-${key}`) {
  return store.request({ o: 'r', r: id, p: 0, k: key });
}

test('ready retains v2 wire version and advertises versioned keys, compare-at-commit and latest release', () => {
  const ready = page().request({ o: 'hello' });
  assert.equal(ready.o, 'ready');
  assert.equal(ready.ok, true);
  assert.equal(ready.v, 1);
  assert.equal(ready.h, PAGE_URL + '#%7B%22i%22%3A%22test1%22%2C%22o%22%3A%22hello%22%7D');
  assert.deepEqual(ready.c, ['vkeys', 'cas', 'latest']);
  assert.equal(typeof ready.q, 'number');
});

test('v3 key write/read round trip, v3 backup stays in its own namespace', () => {
  const store = page({ [CURRENT]: record('v2') });
  const first = record('first');
  const second = record('second');
  assert.equal(write(store, V3, first).d, 1);
  assert.equal(read(store, V3).v, first);
  assert.equal(write(store, V3, second, first.split('.')[1]).d, 1);
  assert.equal(store.disk.get(V3), second);
  assert.equal(store.disk.get(V3_PREVIOUS), first);
  assert.equal(read(store, V3_PREVIOUS).v, first);
  assert.equal(store.disk.get(CURRENT), record('v2'));
  assert.equal(store.disk.has(PREVIOUS), false);
});

test('explicit previous-key write does not create another backup', () => {
  const store = page({ [V3]: record('current') });
  const backup = record('previous');
  assert.equal(write(store, V3_PREVIOUS, backup).d, 1);
  assert.equal(store.disk.get(V3_PREVIOUS), backup);
  assert.equal(store.disk.get(V3), record('current'));
  assert.equal(store.disk.size, 2);
});

test('keyed delete removes only that key, including each version and previous key', () => {
  const seed = {
    [CURRENT]: 'v2', [PREVIOUS]: 'v2-backup',
    [V3]: 'v3', [V3_PREVIOUS]: 'v3-backup', [OTHER]: 'buff timer',
  };
  for (const key of [CURRENT, PREVIOUS, V3, V3_PREVIOUS]) {
    const store = page(seed);
    assert.equal(store.request({ o: 'd', k: key }).ok, true);
    const expected = new Map(Object.entries(seed));
    expected.delete(key);
    assert.deepEqual(store.disk, expected, `delete ${key} removes exactly its target`);
    assert.deepEqual(store.accesses, [['remove', key]]);
  }
});

test('keyless v2 Forget removes both v2 keys, preserves v3 and other mods', () => {
  const store = page({
    [CURRENT]: 'v2', [PREVIOUS]: 'v2-backup',
    [V3]: 'v3', [V3_PREVIOUS]: 'v3-backup', [OTHER]: 'buff timer',
  });
  assert.equal(store.request({ o: 'd' }).ok, true);
  assert.equal(store.disk.has(CURRENT), false);
  assert.equal(store.disk.has(PREVIOUS), false);
  assert.equal(store.disk.get(V3), 'v3');
  assert.equal(store.disk.get(V3_PREVIOUS), 'v3-backup');
  assert.equal(store.disk.get(OTHER), 'buff timer');
});

test('non-matching keys fail for reads, writes and deletes without touching storage', () => {
  const store = page({ [CURRENT]: record('v2'), [OTHER]: 'buff timer' });
  for (const key of [
    'hantu.hpcolors.v3x/state', OTHER, '../', 'hantu.hpcolors.v3/state.prev/extra',
    'xhantu.hpcolors.v3/state', 'hantu.hpcolors.v3/statex',
    'hantu.hpcolors.v/state', 'hantu.hpcolors.v-3/state',
    'hantu.hpcolors.v3/state.prev.prev', '', null, 3, {}, [],
  ]) {
    assert.match(read(store, key).e, /invalid_key/);
    assert.match(write(store, key, record('unsafe')).e, /invalid_key/);
    assert.match(store.request({ o: 'd', k: key }).e, /invalid_key/);
  }
  assert.match(read(store, undefined).e, /invalid_key/);
  assert.deepEqual(store.accesses, [], 'rejected keys must not even access storage');
  assert.equal(store.disk.size, 2);
  assert.equal(store.disk.get(CURRENT), record('v2'));
  assert.equal(store.disk.get(OTHER), 'buff timer');
});

test('versioned key pattern accepts arbitrary numeric versions, not only v2/v3', () => {
  for (const version of ['0', '1', '10', '003', '999999']) {
    const current = `hantu.hpcolors.v${version}/state`;
    const previous = `${current}.prev`;
    const store = page({ [CURRENT]: record('v2'), [OTHER]: 'buff timer' });
    const first = record('first');
    const second = record('second');
    assert.equal(write(store, current, first).d, 1);
    assert.equal(read(store, current).v, first);
    assert.equal(write(store, current, second, first.split('.')[1]).d, 1);
    assert.equal(read(store, current, 'updated-current').v, second);
    assert.equal(read(store, previous).v, first);
    assert.equal(store.request({ o: 'd', k: current }).ok, true);
    assert.equal(store.request({ o: 'd', k: previous }).ok, true);
    assert.deepEqual(store.disk, new Map([[CURRENT, record('v2')], [OTHER, 'buff timer']]));
  }
});

test('chunks cannot change target key mid-write', () => {
  const store = page();
  const value = record('x'.repeat(3050));
  assert.equal(store.request({ o: 'w', r: 'chunks', p: 0, n: 2, k: V3,
    v: value.slice(0, 3000), e: '' }).ok, true);
  assert.match(store.request({ o: 'w', r: 'chunks', p: 1, n: 2, k: CURRENT,
    v: value.slice(3000), e: '' }).e, /changed_write/);
  assert.equal(store.disk.has(V3), false);
  assert.equal(store.disk.has(CURRENT), false);
  assert.equal(store.request({ o: 'w', r: 'retry', p: 0, n: 2, k: V3,
    v: value.slice(0, 3000), e: '' }).ok, true);
  assert.equal(store.request({ o: 'w', r: 'retry', p: 1, n: 2, k: V3,
    v: value.slice(3000), e: '' }).d, 1);
  assert.equal(read(store, V3).n, 2);
  assert.equal(store.disk.get(V3), value);
});

// Audit F2: "cas" (compare-at-commit). m is the checksum of the whole raw value the writer last
// saw at the key, or "none" when it saw no value; the page refuses to replace anything else.
function cas(store, key, value, match, { expected = '', r = `cas-${key}` } = {}) {
  return store.request({ o: 'w', r, p: 0, n: 1, k: key, v: value, e: expected, m: match });
}

test('cas: an absent expectation commits only while the key is still absent', () => {
  const store = page();
  const mine = record('mine');
  assert.equal(cas(store, V3, mine, 'none').d, 1);
  assert.equal(store.disk.get(V3), mine);
  const other = page({ [V3]: record('other writer') });
  assert.match(cas(other, V3, mine, 'none').e, /conflict/);
  assert.equal(other.disk.get(V3), record('other writer'));
  assert.equal(other.disk.has(V3_PREVIOUS), false, 'a refused write rotates nothing');
});

test('cas: a checksum expectation replaces the seen value and refuses a changed (newer) one', () => {
  const seen = record('{"v":11}');
  const store = page({ [V3]: seen });
  const mine = record('{"v":11,"mine":1}');
  assert.equal(cas(store, V3, mine, fnv(seen), { expected: seen.split('.')[1] }).d, 1);
  assert.equal(store.disk.get(V3), mine);
  assert.equal(store.disk.get(V3_PREVIOUS), seen, 'trusted rotation still follows e');
  const newer = record('{"v":999,"futureOnly":1}');
  store.disk.set(V3, newer);
  const reply = cas(store, V3, record('{"v":11,"again":1}'), fnv(mine), { expected: mine.split('.')[1], r: 'again' });
  assert.equal(reply.ok, false); assert.match(reply.e, /conflict/);
  assert.equal(store.disk.get(V3), newer, 'never overwrite a record written meanwhile');
  assert.equal(store.disk.get(V3_PREVIOUS), seen);
});

test('cas: corrupt current is replaced only when the writer saw those exact bytes', () => {
  const corrupt = 'HPV2S1.00000000.garbage';
  const store = page({ [V3]: corrupt });
  assert.match(cas(store, V3, record('x'), 'none').e, /conflict/);
  assert.match(cas(store, V3, record('x'), fnv('HPV2S1.00000000.other'), { r: 'b' }).e, /conflict/);
  assert.equal(store.disk.get(V3), corrupt);
  assert.equal(cas(store, V3, record('x'), fnv(corrupt), { r: 'c' }).d, 1);
  assert.equal(store.disk.get(V3), record('x'));
  assert.equal(store.disk.has(V3_PREVIOUS), false, 'corrupt bytes are never rotated into the backup');
});

test('cas: a replayed commit after a lost acknowledgement succeeds without rotating twice', () => {
  const first = record('first');
  const store = page({ [V3]: first });
  const second = record('second');
  const options = { expected: first.split('.')[1], r: 'replay' };
  assert.equal(cas(store, V3, second, fnv(first), options).d, 1);
  assert.equal(cas(store, V3, second, fnv(first), options).d, 1, 'already holds the value being written');
  assert.equal(store.disk.get(V3), second);
  assert.equal(store.disk.get(V3_PREVIOUS), first);
});

test('cas: the current key changing during a multi-chunk write is refused at the final chunk', () => {
  const seen = record('seen');
  const store = page({ [V3]: seen });
  const value = record('y'.repeat(6100));
  const chunk = (p, m, r = 'multi') => store.request({ o: 'w', r, p, n: 3, k: V3,
    v: value.slice(p * 3000, (p + 1) * 3000), e: seen.split('.')[1], m });
  assert.equal(chunk(0, fnv(seen)).ok, true);
  assert.equal(chunk(1, fnv(seen)).ok, true);
  const newer = record('{"v":999}');
  store.disk.set(V3, newer);
  assert.match(chunk(2, fnv(seen)).e, /conflict/);
  assert.equal(store.disk.get(V3), newer);
  assert.equal(store.disk.has(V3_PREVIOUS), false);
  assert.match(chunk(2, fnv(seen)).e, /missing_chunk/, 'a refused write leaves no staging to finish');
  for (const p of [0, 1]) assert.equal(chunk(p, fnv(newer), 'reloaded').ok, true);
  assert.equal(chunk(2, fnv(newer), 'reloaded').d, 1);
  assert.equal(store.disk.get(V3), value);
});

test('cas: malformed or mid-write-changed expectations fail without touching storage', () => {
  const store = page({ [V3]: record('seen') });
  for (const m of ['', 'NONE', 'ABCDEF12', '1234567', 12345678, null])
    assert.match(cas(store, V3, record('x'), m).e, /invalid_chunk/, String(m));
  const value = record('z'.repeat(3050));
  assert.equal(store.request({ o: 'w', r: 'mid', p: 0, n: 2, k: V3, v: value.slice(0, 3000), e: '', m: fnv(record('seen')) }).ok, true);
  assert.match(store.request({ o: 'w', r: 'mid', p: 1, n: 2, k: V3, v: value.slice(3000), e: '', m: 'none' }).e, /changed_write/);
  assert.equal(store.request({ o: 'w', r: 'mid2', p: 0, n: 2, k: V3, v: value.slice(0, 3000), e: '' }).ok, true);
  assert.match(store.request({ o: 'w', r: 'mid2', p: 1, n: 2, k: V3, v: value.slice(3000), e: '', m: 'none' }).e, /changed_write/,
    'adding m mid-write is a change too');
  assert.equal(store.disk.get(V3), record('seen'));
});

test('v2 writes without m keep the unconditional version-1 behaviour', () => {
  const unrelated = record('written by someone else');
  const store = page({ [CURRENT]: unrelated });
  const mine = record('v2 save');
  assert.equal(write(store, CURRENT, mine, 'deadbeef').d, 1);
  assert.equal(store.disk.get(CURRENT), mine, 'no compare without m');
  assert.equal(store.disk.has(PREVIOUS), false, 'rotation still requires e to match');
  const keyless = store.request({ o: 'w', r: 'keyless', p: 0, n: 1, v: record('keyless'), e: fnv('v2 save') });
  assert.deepEqual(Object.keys(keyless).sort(), ['d', 'i', 'n', 'o', 'ok', 'p', 'q']);
  assert.equal(store.disk.get(CURRENT), record('keyless'));
  assert.equal(store.disk.get(PREVIOUS), mine);
});

test('lv: requires a plain mod id, answers at once and touches no storage', () => {
  const store = page({ [V3]: record('kept') });
  for (const a of [undefined, '', 'HPV3', 'hp-v3', '__proto__', 'a'.repeat(17), 3])
    assert.match(store.request({ o: 'lv', a }).e, /invalid_request/, String(a));
  const answer = store.request({ o: 'lv', a: 'hpv3' });
  assert.equal(answer.ok, true);
  assert.equal(answer.l, null, 'no fetch in this context: no version');
  assert.equal(answer.s, 'done');
  assert.deepEqual(store.accesses, []);
  assert.equal(store.disk.get(V3), record('kept'));
});

test('pinned fixture script matches the pinned page source', () => {
  assert.equal(sha(pageSource), pin.sha256, 'Hosted page drift; refresh the vendored fixture explicitly.');
  assert.equal(sha(fs.readFileSync(path.join(__dirname, '../vendor', pin.file), 'utf8')), pin.sha256);
});

test('deployment bookkeeping names the intended hash and capabilities independently of v2 compatibility', () => {
  const source = committedSource('main'), ready = page({}, source).request({ o: 'hello' });
  assert.equal(sha(source), pin.published === false ? pin.publishedSha256 : pin.sha256,
    'local deployment ref moved; re-pin only after verifying actual served bytes');
  assert.equal(ready.v, 1);
  // Unpublished: main is still the served page, with the capabilities the pin records for it.
  assert.deepEqual(ready.c, pin.published === false ? pin.publishedCapabilities : ['vkeys', 'cas', 'latest']);
});

test('audit M5: publish checklist step 6 runs the complete page suite green in its published state', () => {
  if (process.env.HPV3_SIMULATED_PUBLICATION === '1') return;
  const candidateHtml = `<script>${pageSource}</script>`;
  const code = `
    const cp = require('node:child_process');
    const original = cp.execFileSync;
    const candidate = ${JSON.stringify(candidateHtml)};
    cp.execFileSync = function (file, args, options) {
      if (file === 'git' && args.includes('show') &&
          ['main:index.html','simulated-cas:index.html'].includes(args.at(-1))) return candidate;
      return original.apply(this, arguments);
    };
    const pinPath = require.resolve(${JSON.stringify(path.join(__dirname, '../vendor/hpv2-store.pin.json'))});
    const pin = require(pinPath);
    require.cache[pinPath].exports = { ...pin, commit: 'simulated-cas', published: true };
    delete require.cache[pinPath].exports.publishedSha256;
    delete require.cache[pinPath].exports.publishedCapabilities;
    require(${JSON.stringify(__filename)});
  `;
  const output = execFileSync(process.execPath, ['--test-reporter=tap', '-e', code], {
    encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')), HPV3_SIMULATED_PUBLICATION: '1' },
  });
  assert.match(output, /# fail 0\b/);
  assert.match(output, /# todo 0\b/);
  assert.match(output, /# skipped 0\b/);
});
