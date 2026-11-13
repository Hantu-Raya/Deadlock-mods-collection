#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const { sha256, readPinnedTexts, pinMismatchMessage } = require('./lib/pin');
const SOURCES = {
  'vendor/unit_status_v2.css': 'game/citadel/pak01_dir/panorama/styles/unit_status_v2.css',
  'vendor/heroes.vdata': 'game/citadel/pak01_dir/scripts/heroes.vdata',
  'vendor/abilities.vdata': 'game/citadel/pak01_dir/scripts/abilities.vdata',
  'vendor/citadel_gc_hero_names_english.txt': 'game/citadel/resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt',
  'vendor/hud_escape_menu.xml': 'game/citadel/pak01_dir/panorama/layout/hud_escape_menu.xml',
  'vendor/unit_status_overlay_v2.xml': 'game/citadel/pak01_dir/panorama/layout/unit_status_overlay_v2.xml',
  'vendor/citadel_hud_top_bar.xml': 'game/citadel/pak01_dir/panorama/layout/citadel_hud_top_bar.xml',
  'vendor/citadel_status_effect.xml': 'game/citadel/pak01_dir/panorama/layout/citadel_status_effect.xml',
};
// v2 rectangular baseline (hp_colors_rewrite_v2/FEATURES.md "Unit-status healthbars are rectangular"):
// delete the three stock healthbar masks and the nine outer-container backers, dropping the six
// relation rules that become empty. Live 6782: an appended `opacity-mask: none` does not cancel an
// earlier mask, so the declarations must be removed. Every rule and declaration is an exact anchor;
// any drift fails closed. BAR STYLE V2 restores the masks through owned root classes (world.css).
// lib/stylesheets.js enforces the result: the generated stock sheet declares no mask and no sheet uses `none`.
const MASK = 'opacity-mask: url("s2r://panorama/images/hud/healthbar/healthbar_backer_horiz_mask_flipped.vsvg");';
const STOCK_DELETIONS = [
  ['.UnitHealthbarContainer', [MASK, 'background-color: rgb(67, 12, 12);']],
  ['.team1 .UnitHealthbarContainer', ['background-color: team1ColorDark;']],
  ['.team2 .UnitHealthbarContainer', ['background-color: team2ColorDark;']],
  ['.friend .UnitHealthbarContainer', ['background-color: offBlack;', 'background-color: rgb(4, 37, 23);']],
  ['.team_neutral .UnitHealthbarContainer', ['background-color: offBlack;']],
  ['.enemy .UnitHealthbarContainer', ['background-color: #2f0404;', 'background-color: offBlack;']],
  ['.enemy.health_critical .ShowCriticalState .UnitHealthbarContainer', ['background-color: rgb(47, 4, 4);']],
  ['#UnitHealthbarInner', [MASK]],
  ['#UnitHealthbarLines', [MASK]],
];
function rectangularStock(text) {
  for (const [selector, declarations] of STOCK_DELETIONS) {
    const pattern = new RegExp('\\n\\n' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n\\{\\n([^{}]*)\\}\\n', 'g');
    const found = [...text.matchAll(pattern)];
    if (found.length !== 1) throw new Error('Stock stylesheet rule anchor changed: ' + selector + ' (found ' + found.length + ')');
    let body = found[0][1];
    for (const declaration of declarations) {
      const line = '\t' + declaration + '\n';
      if (body.split(line).length !== 2) throw new Error('Stock stylesheet declaration anchor changed: ' + selector + ' { ' + declaration + ' }');
      body = body.replace(line, '');
    }
    const replacement = body.trim() ? '\n\n' + selector + '\n{\n' + body + '}\n' : '\n';
    text = text.slice(0, found[0].index) + replacement + text.slice(found[0].index + found[0][0].length);
  }
  return text;
}

function clientVersion(text, label) {
  const values = [...text.replace(/^\uFEFF/, '').matchAll(/^[ \t]*ClientVersion[ \t]*=[ \t]*(\d+)[ \t]*\r?$/gm)];
  if (values.length !== 1 || !Number.isSafeInteger(Number(values[0][1])) || Number(values[0][1]) <= 0) {
    throw new Error('Missing or invalid ClientVersion in ' + label);
  }
  return Number(values[0][1]);
}

function checkInstalled(root, file, allowMismatch) {
  const { pin } = readPinned(root);
  if (!fs.existsSync(file)) { console.log('Installed steam.inf absent; offline pin ClientVersion=' + pin.clientVersion); return; }
  const installed = clientVersion(fs.readFileSync(file, 'utf8'), file);
  console.log('HPV3 installed ClientVersion=' + installed + ' pinned=' + pin.clientVersion);
  if (installed === pin.clientVersion) return;
  const message = pinMismatchMessage({ installed, pinned: pin.clientVersion, steamInf: file });
  if (!allowMismatch) throw new Error(message);
  console.warn('WARNING ' + message + ' Building anyway: explicit --allow-pin-mismatch override.');
}

function readPinned(root = ROOT) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'game-data-pin.json'), 'utf8'));
  if (pin.repository !== 'SteamTracking/GameTracking-Deadlock' || !/^[0-9a-f]{40}$/.test(pin.commit) ||
      !Number.isSafeInteger(pin.clientVersion) || pin.clientVersion <= 0 ||
      !Array.isArray(pin.files) || pin.files.length !== Object.keys(SOURCES).length) throw new Error('Invalid game-data pin manifest');
  const texts = readPinnedTexts(root, pin.files, { sources: SOURCES, key: 'upstream', messages: {
    invalid: file => 'Invalid game-data pin entry: ' + file.path,
    missing: (file, error) => 'Missing vendored game-data file: ' + file.path + ' (' + error.code + ')',
    mismatch: (file, actual) => 'Game-data pin mismatch: ' + file.path + ' at ' + pin.commit + ' expected=' + file.sha256 + ' actual=' + actual + '; review/re-vendor the pinned source, do not refresh silently.',
  } });
  return { pin, texts };
}

// Parse the pinned text grammars, including comments, nested containers and KV3 typed strings.
// No include stripping or hero-key substring extraction: identity is read only from root objects.
function parse(text, kv3) {
  if (kv3 && !/^<!-- kv3 [^>]+-->/.test(text)) throw new Error('KV3 header missing');
  const tokens = /\s+|<!--[\s\S]*?-->|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|[{}\[\]=,:]|[^\s{}\[\]=,:"\/]+/y;
  let offset = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let token;
  function fail(message) { throw new Error((kv3 ? 'KV3' : 'Localization') + ': ' + message + ' near byte ' + offset); }
  function next() {
    while (offset < text.length) {
      tokens.lastIndex = offset;
      const match = tokens.exec(text);
      if (!match) fail('Invalid token');
      offset = tokens.lastIndex;
      if (/^(\s|<!--|\/\/|\/\*)/.test(match[0])) continue;
      token = match[0]; return;
    }
    token = undefined;
  }
  function take(expected) {
    if (token !== expected) fail('Expected ' + expected + ', got ' + token);
    next();
  }
  function scalar() {
    if (token === undefined || /^[{}\[\]=,:]$/.test(token)) fail('Expected scalar');
    const current = token; next();
    if (current.startsWith('"')) return JSON.parse(current);
    if (current === 'true' || current === 'false') return current === 'true';
    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(current)) return Number(current);
    return current;
  }
  function value() {
    if (token === '{') return object();
    if (kv3 && token === '[') {
      take('['); const values = [];
      while (token !== ']') { values.push(value()); if (token === ',') next(); }
      take(']'); return values;
    }
    const result = scalar();
    if (kv3 && token === ':') { next(); return value(); }
    return result;
  }
  function object() {
    take('{'); const result = Object.create(null);
    while (token !== '}') {
      const key = scalar();
      if (typeof key !== 'string') fail('Expected property name');
      if (Object.hasOwn(result, key)) fail('Duplicate property ' + key);
      if (kv3) take('=');
      result[key] = value();
      if (kv3 && token === ',') next();
    }
    take('}'); return result;
  }
  next();
  if (!kv3) { if (scalar() !== 'lang') fail('Expected lang'); }
  const result = object();
  if (token !== undefined) fail('Unexpected trailing token');
  return result;
}

function derive(root = ROOT) {
  const { pin, texts } = readPinned(root);
  const heroes = parse(texts['vendor/heroes.vdata'], true);
  if (heroes.generic_data_type !== 'CitadelHeroData_t') throw new Error('KV3 hero data type changed');
  const abilities = parse(texts['vendor/abilities.vdata'], true);
  if (abilities.generic_data_type !== 'CitadelAbilityVData') throw new Error('KV3 ability data type changed');
  const localization = parse(texts['vendor/citadel_gc_hero_names_english.txt'], false);
  if (localization.Language !== 'english' || !localization.Tokens) throw new Error('Invalid hero localization');
  const ids = new Set();
  const displayNames = new Set();
  const catalog = [];
  for (const [key, hero] of Object.entries(heroes)) {
    if (!key.startsWith('hero_')) continue;
    if (!hero || hero._class !== 'CitadelHeroData_t') throw new Error('Invalid hero record: ' + key);
    if (!Number.isSafeInteger(hero.m_HeroID) || hero.m_HeroID < 0) throw new Error('Invalid hero id: ' + key);
    if (hero.m_HeroID === 0) continue; // Stock hero_base is an inheritance template, not a hero identity.
    if (ids.has(hero.m_HeroID)) throw new Error('Duplicate hero id: ' + hero.m_HeroID);
    ids.add(hero.m_HeroID);
    const names = localization.Tokens;
    const searchToken = typeof hero.m_strHeroSearchName === 'string' ? hero.m_strHeroSearchName.replace(/^#/, '') : '';
    const nameToken = Object.hasOwn(names, key + ':n') ? key : searchToken;
    const name = names[nameToken + ':n'];
    if (typeof name !== 'string' || !name.trim()) throw new Error('Missing hero name: ' + key);
    const displayName = nameToken === key ? name : name + ' (' + key + ')';
    if (displayNames.has(displayName.toLowerCase())) throw new Error('Duplicate hero display name: ' + displayName);
    displayNames.add(displayName.toLowerCase());
    const entry = { id: hero.m_HeroID, key, name: displayName, nameToken: '#' + nameToken };
    entry.portrait = typeof hero.m_strIconImageSmall === 'string' && hero.m_strIconImageSmall ? hero.m_strIconImageSmall : null;
    entry.abilities = [1, 2, 3, 4].map(slot => {
      const name = hero.m_mapBoundAbilities && hero.m_mapBoundAbilities['ESlot_Signature_' + slot];
      const image = abilities[name] && abilities[name].m_strAbilityImage;
      return typeof image === 'string' && image ? image : null;
    });
    for (const [field, output] of [['m_bDisabled', 'disabled'], ['m_bInDevelopment', 'inDevelopment'],
      ['m_bNeedsTesting', 'needsTesting'], ['m_bLimitedTesting', 'limitedTesting']]) {
      if (typeof hero[field] !== 'boolean') throw new Error('Invalid hero flag ' + field + ': ' + key);
      entry[output] = hero[field];
    }
    catalog.push(entry);
  }
  if (!catalog.length) throw new Error('Empty hero catalog');
  catalog.sort((a, b) => a.id - b.id);
  let stylesheet = texts['vendor/unit_status_v2.css'];
  let imports = 0;
  stylesheet = stylesheet.replace(/(@import url\("s2r:\/\/panorama\/styles\/[^"\n]+)\.vcss("\);)/g, (_, start, end) => {
    imports++; return start + '.vcss_c' + end;
  });
  if (imports !== 2) throw new Error('Stock stylesheet import anchors changed: expected 2, found ' + imports);
  stylesheet = rectangularStock(stylesheet);
  return { pin, catalog, stylesheet, menu: texts['vendor/hud_escape_menu.xml'], overlay: texts['vendor/unit_status_overlay_v2.xml'], topbar: texts['vendor/citadel_hud_top_bar.xml'], statusEffect: texts['vendor/citadel_status_effect.xml'] };
}

async function checkUpstream(root = ROOT, base) {
  const { pin } = readPinned(root);
  async function fetchBytes(url) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'HP-Colors-v3-drift-check' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { throw new Error('Upstream check failed: ' + url + ': ' + error.message); }
  }
  const headURL = base ? base + '/commits/HEAD' : 'https://api.github.com/repos/' + pin.repository + '/commits/HEAD';
  const head = JSON.parse((await fetchBytes(headURL)).toString('utf8')).sha;
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error('Invalid upstream HEAD commit');
  console.log('HPV3 upstream HEAD=' + head + ' pinned=' + pin.commit);
  const drift = [];
  const steamURL = base ? base + '/raw/' + head + '/game/citadel/steam.inf' : 'https://raw.githubusercontent.com/' + pin.repository + '/' + head + '/game/citadel/steam.inf';
  const upstreamVersion = clientVersion((await fetchBytes(steamURL)).toString('utf8'), steamURL);
  console.log('HPV3 upstream ClientVersion=' + upstreamVersion + ' pinned=' + pin.clientVersion);
  if (upstreamVersion !== pin.clientVersion) drift.push('steam.inf ClientVersion');
  for (const file of pin.files) {
    const url = base ? base + '/raw/' + head + '/' + file.upstream : 'https://raw.githubusercontent.com/' + pin.repository + '/' + head + '/' + file.upstream;
    const actual = sha256(await fetchBytes(url));
    const changed = actual !== file.sha256;
    console.log((changed ? 'DRIFT ' : 'MATCH ') + file.upstream + ' expected=' + file.sha256 + ' actual=' + actual);
    if (changed) drift.push(file.path);
  }
  if (drift.length) throw new Error('Upstream game-data drift: ' + drift.join(', ') + '; review/rebase explicitly. Vendored inputs and pin unchanged.');
  console.log('No upstream drift; vendored inputs and pin unchanged.');
}

async function main(args) {
  let root = ROOT, base, check = false, installed, allowMismatch = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check-upstream') check = true;
    else if (args[i] === '--allow-pin-mismatch') allowMismatch = true;
    else if (args[i] === '--check-installed' && args[i + 1] && !args[i + 1].startsWith('--')) installed = path.resolve(args[++i]);
    else if (['--game-data-root', '--upstream-base'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (args[i] === '--game-data-root') root = path.resolve(args[++i]);
      else base = args[++i].replace(/\/$/, '');
    } else throw new Error('Unknown or incomplete argument: ' + args[i]);
  }
  if (installed && !check && !base) return checkInstalled(root, installed, allowMismatch);
  if (!check || installed || allowMismatch) throw new Error('Pass --check-upstream for the explicit network check, or --check-installed <steam.inf> for the offline installed-version check.');
  await checkUpstream(root, base);
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { derive };
