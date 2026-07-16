'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FULL_ONLY_SETTING_IDS = Object.freeze(['hp_precise_pips_enabled']);

const HP_COLORS_LANE_CONTRACT = Object.freeze({
  title: 'HP Colors',
  full: Object.freeze({
    expectedCount: 56,
    storageNamespace: 'hp_colors',
    storageVersion: 99,
    scriptNames: Object.freeze(['anita_ui_core.js', 'healthbar_logic.js']),
  }),
  minimal: Object.freeze({
    expectedCount: 55,
    staticBridge: true,
    rootCfgRawAttr: 'hp_colors_minimal_cfg_raw',
  }),
  bridge: Object.freeze({
    eventChannel: 'ClientUI_FireOutput',
    presetSnapshotMagic: 'HP_COLORS_PRESET_SNAPSHOT',
    presetRequestMagic: 'HP_COLORS_PRESET_REQUEST',
    bulkUpdateMagic: 'ANITA_BULK_UPDATE',
    singleUpdateMagic: 'ANITA_UPDATE',
    bootstrapRequestMagic: 'ANITA_REQUEST_BOOTSTRAP',
    registerMagic: 'ANITA_REGISTER',
    aliveMagic: 'ANITA_ALIVE',
    handshakeMagic: 'ANITA_HANDSHAKE',
    sharedCfgRawKey: '__hpColorsCfgRaw',
    sharedDurableCfgRawKey: '__hpColorsDurableCfgRaw',
    sharedBootstrapSeenKey: '__hpColorsBootstrapSeen',
    sharedFirstPaintProbeKey: '__hpColorsFirstPaintProbe',
    sharedPresetRequestKey: '__hpColorsPresetRequests',
    sharedMatchResetKey: '__hpColorsMatchReset',
    sharedMatchResetAckKey: '__hpColorsMatchResetAck',
  }),
  presetStore: Object.freeze({
    storeId: 'HPColorsPresetStore',
    startupPresetId: 'HPColorsPreset_001',
    entryClass: 'hp_colors_preset_entry',
  }),
});

const HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES = Object.freeze({
  fullPublisher: Object.freeze(['eventChannel','presetSnapshotMagic','presetRequestMagic','singleUpdateMagic','bulkUpdateMagic','bootstrapRequestMagic','registerMagic','aliveMagic','handshakeMagic','sharedCfgRawKey','sharedMatchResetKey','storeId','startupPresetId','entryClass']),
  fullRuntime: Object.freeze(['eventChannel','presetSnapshotMagic','presetRequestMagic','bulkUpdateMagic','singleUpdateMagic','bootstrapRequestMagic','sharedCfgRawKey','sharedDurableCfgRawKey','sharedBootstrapSeenKey','sharedFirstPaintProbeKey','sharedPresetRequestKey','sharedMatchResetKey','sharedMatchResetAckKey']),
  minimalPublisher: Object.freeze(['eventChannel','presetSnapshotMagic','presetRequestMagic','sharedCfgRawKey','rootCfgRawAttr','storeId','startupPresetId','entryClass']),
  minimalRuntime: Object.freeze(['eventChannel','presetSnapshotMagic','presetRequestMagic','sharedCfgRawKey','rootCfgRawAttr']),
});

const HP_LEGACY_PRESET_ALIASES = Object.freeze({ kzs: 'hp_kill_zone_color' });
const HP_RUNTIME_POSITION_SETTING_IDS = Object.freeze(['hp_counter_position', 'hp_pulse_text_position']);
const HP_EXPECTED_LOOP_REASONS = Object.freeze(['preset_apply','preset_same_raw','preset_replay_enemy','preset_replay_ally','preset_replay_level','match_reset','enemy_probe_missing_bar','enemy_skip_building','enemy_neutral','enemy_not_enemy','enemy_friend_target','enemy_dirty_hold','enemy_preset_wait','enemy_bootstrap_wait','enemy_style_drift','enemy_no_parent_width','enemy_stable','enemy_small_delta','enemy_warmup','enemy_pulse','enemy_paint','enemy_error','friendly_target','ally_missing_bar','ally_missing_building','ally_missing_rejected','ally_dirty_hold','ally_unconfirmed','ally_rebind','ally_no_parent_width','ally_stable','ally_paint','ally_error','level_poll','level_backoff']);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNewlines(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function findBalancedBlock(text, openIndex, openChar, closeChar) {
  if (openIndex < 0 || text[openIndex] !== openChar) return null;
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

function extractAssignedBlock(text, name, openChar, closeChar) {
  const source = normalizeNewlines(text);
  const re = new RegExp('(?:var|const|let)\\s+' + escapeRegExp(name) + '\\s*=\\s*\\' + openChar);
  const match = re.exec(source);
  if (!match) return null;
  return findBalancedBlock(source, match.index + match[0].length - 1, openChar, closeChar);
}

function extractContractPropertyBlock(text, propName, openChar, closeChar) {
  const source = normalizeNewlines(text);
  const re = new RegExp('\\b' + escapeRegExp(propName) + '\\s*:\\s*\\' + openChar);
  const match = re.exec(source);
  if (!match) return null;
  return findBalancedBlock(source, match.index + match[0].length - 1, openChar, closeChar);
}

function extractObjectLiteralBlock(text, name) {
  if (name) return extractAssignedBlock(text, name, '{', '}') || extractContractPropertyBlock(text, name, '{', '}');
  const source = normalizeNewlines(text);
  const index = source.indexOf('{');
  return findBalancedBlock(source, index, '{', '}');
}

function extractArrayLiteralBlock(text, name) {
  if (name) return extractAssignedBlock(text, name, '[', ']') || extractContractPropertyBlock(text, name, '[', ']');
  const source = normalizeNewlines(text);
  const index = source.indexOf('[');
  return findBalancedBlock(source, index, '[', ']');
}

function extractSettingsBlock(text) {
  return extractContractPropertyBlock(text, 'SETTINGS', '[', ']') || extractAssignedBlock(text, 'SCHEMA', '[', ']');
}

function extractDefaultsBlock(text) {
  return extractContractPropertyBlock(text, 'DEFAULTS', '{', '}') || extractAssignedBlock(text, 'DEFAULTS', '{', '}');
}

function extractAliasesBlock(text, name) {
  const contractName = name === 'HP_PERSIST_ALIASES' ? 'ALIASES' : name;
  return extractContractPropertyBlock(text, contractName, '{', '}') || extractAssignedBlock(text, name, '{', '}');
}

function extractSettingObjects(text) {
  const block = extractSettingsBlock(text);
  if (block === null) return null;
  const objects = [];
  for (let i = 0; i < block.length; i += 1) {
    if (block[i] !== '{') continue;
    const body = findBalancedBlock(block, i, '{', '}');
    if (body === null) continue;
    objects.push(body);
    i += body.length + 1;
  }
  return objects;
}

function extractSettingIds(text) {
  const objects = extractSettingObjects(text);
  if (!objects) return null;
  const ids = [];
  for (const objectText of objects) {
    const match = objectText.match(/\bid\s*:\s*["']([^"']+)["']/);
    if (match) ids.push(match[1]);
  }
  return ids;
}

function parseSimpleJsLiteral(token) {
  const value = String(token || '').trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return undefined;
}

function extractSettingDefaults(text) {
  const objects = extractSettingObjects(text);
  if (!objects) return null;
  const defaults = {};
  for (const objectText of objects) {
    const idMatch = objectText.match(/\bid\s*:\s*["']([^"']+)["']/);
    if (!idMatch) continue;
    const defaultMatch = objectText.match(/\bdefaultValue\s*:\s*("[^"]*"|'[^']*'|true|false|-?\d+(?:\.\d+)?)/);
    if (defaultMatch) defaults[idMatch[1]] = parseSimpleJsLiteral(defaultMatch[1]);
  }
  return defaults;
}

function parseObjectKeyValuePairs(block) {
  const pairs = [];
  if (block === null) return pairs;
  const kvRe = /(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*("[^"]*"|'[^']*'|true|false|-?\d+(?:\.\d+)?)/g;
  let match;
  while ((match = kvRe.exec(block)) !== null) {
    pairs.push({ key: match[1] || match[2] || match[3], token: match[4], value: parseSimpleJsLiteral(match[4]) });
  }
  return pairs;
}

function extractObjectKeys(text, name) {
  const block = name === 'DEFAULTS' || !name ? extractDefaultsBlock(text) : extractObjectLiteralBlock(text, name);
  if (block === null) return null;
  return parseObjectKeyValuePairs(block).map((pair) => pair.key);
}

function extractObjectValues(text, name) {
  const block = name === 'DEFAULTS' || !name ? extractDefaultsBlock(text) : extractObjectLiteralBlock(text, name);
  if (block === null) return null;
  const out = {};
  for (const pair of parseObjectKeyValuePairs(block)) out[pair.key] = pair.value;
  return out;
}

function extractAliases(text, name) {
  const block = extractAliasesBlock(text, name || 'HP_PERSIST_ALIASES');
  if (block === null) return null;
  const out = {};
  for (const pair of parseObjectKeyValuePairs(block)) out[pair.key] = pair.value;
  return out;
}

function extractContractString(text, propName) {
  const source = normalizeNewlines(text);
  const match = source.match(new RegExp("\\b" + escapeRegExp(propName) + "\\s*:\\s*[\"']([^\"']+)[\"']"));
  return match ? match[1] : null;
}

function extractContractNumber(text, propName) {
  const source = normalizeNewlines(text);
  const match = source.match(new RegExp('\\b' + escapeRegExp(propName) + '\\s*:\\s*(-?\\d+)'));
  return match ? Number(match[1]) : null;
}

function extractAssignedString(text, name) {
  const source = normalizeNewlines(text);
  const match = source.match(new RegExp('(?:var|const|let)\\s+' + escapeRegExp(name) + "\\s*=\\s*[\"']([^\"']+)[\"']"));
  return match ? match[1] : null;
}

function extractProtocolString(text, propertyName) {
  const source = normalizeNewlines(text);
  const direct = source.match(new RegExp("\\b" + escapeRegExp(propertyName) + "\\s*:\\s*[\"']([^\"']+)[\"']"));
  if (direct) return direct[1];
  const ref = source.match(new RegExp('\\b' + escapeRegExp(propertyName) + '\\s*:\\s*([A-Za-z_$][\\w$]*)'));
  return ref ? extractAssignedString(source, ref[1]) : null;
}

function extractFunctionDeclarationNames(text) {
  return Array.from(normalizeNewlines(text).matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm), (match) => match[1]);
}

function extractFindChildIds(text) {
  return Array.from(normalizeNewlines(text).matchAll(/FindChildTraverse\(\s*(["'])(.*?)\1\s*\)/g), (match) => match[2]);
}

function extractRuntimeIdConstants(text) {
  return Array.from(normalizeNewlines(text).matchAll(/\bvar\s+ID_[A-Z0-9_]+\s*=\s*(["'])(.*?)\1/g), (match) => match[2]);
}

function splitTopLevelArgs(argsText) {
  const args = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  const source = String(argsText || '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(source.slice(start).trim());
  return args;
}

function extractNamedCallArgs(sourceText, names) {
  const source = normalizeNewlines(sourceText);
  const calls = [];
  for (const name of names || []) {
    let searchAt = 0;
    while (searchAt < source.length) {
      const index = source.indexOf(name + '(', searchAt);
      if (index < 0) break;
      const before = source.slice(Math.max(0, index - 16), index);
      if (/[A-Za-z0-9_$]$/.test(before) || /function\s+$/.test(before)) {
        searchAt = index + name.length;
        continue;
      }
      let depth = 0;
      let quote = '';
      let escaped = false;
      let end = -1;
      for (let i = index + name.length; i < source.length; i += 1) {
        const ch = source[i];
        if (quote) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === quote) quote = '';
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch;
          continue;
        }
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end > index) calls.push({ name, argsText: source.slice(index + name.length + 1, end) });
      searchAt = end > index ? end + 1 : index + name.length;
    }
  }
  return calls;
}

function extractAssignedObjectShape(source, objectName) {
  const block = extractAssignedBlock(source, objectName, '{', '}');
  if (block === null) return { exists: false, methods: [], properties: [] };
  const methods = new Set();
  const properties = new Set();
  const entries = splitTopLevelArgs(block);
  for (const entry of entries) {
    const text = entry.trim();
    if (!text) continue;
    const shorthand = text.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*\(/);
    if (shorthand) {
      const name = shorthand[1] || shorthand[2] || shorthand[3];
      properties.add(name);
      methods.add(name);
      continue;
    }
    const property = text.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/);
    if (!property) continue;
    const name = property[1] || property[2] || property[3];
    const rest = text.slice(property[0].length).trim();
    properties.add(name);
    if (/^function\b/.test(rest)) methods.add(name);
  }
  return { exists: true, methods: Array.from(methods).sort(), properties: Array.from(properties).sort() };
}

function checkObjectInterface(errors, label, source, objectName, requiredMethods, options = {}) {
  const shape = extractAssignedObjectShape(source, objectName);
  const displayName = options.displayName || objectName;
  if (!shape.exists) {
    errors.push(`${label} missing ${displayName} object`);
    return shape;
  }
  const methodSet = new Set(shape.methods);
  for (const method of requiredMethods || []) {
    if (!methodSet.has(method)) errors.push(`${label} ${displayName} missing method: ${method}`);
  }
  return shape;
}

function collectLoopReasonContract(source, options = {}) {
  const settings = Object.assign({
    allowlistName: 'LOOP_REASON_ALLOWLIST',
    scheduleCallNames: ['scheduleLoop', 'requestLoopKick'],
    reasonArgIndex: 2,
    allowedVariableReasons: ['decision.reason'],
  }, options);
  const allowlistBlock = extractAssignedBlock(source, settings.allowlistName, '{', '}');
  const allowlist = allowlistBlock === null
    ? []
    : Array.from(allowlistBlock.matchAll(/\b([a-z][a-z0-9_]*)\s*:/g), (match) => match[1]).sort();
  const allowlistSet = new Set(allowlist);
  const scheduledReasons = [];
  const unverifiableCalls = [];
  const unknownReasons = [];
  for (const call of extractNamedCallArgs(source, settings.scheduleCallNames)) {
    const args = splitTopLevelArgs(call.argsText);
    const reasonArg = args[settings.reasonArgIndex] || '';
    if (!reasonArg) {
      unverifiableCalls.push({ name: call.name, reasonArg, argsText: call.argsText });
      continue;
    }
    const literals = Array.from(reasonArg.matchAll(/["']([a-z][a-z0-9_]*)["']/g), (match) => match[1]);
    const allowedVariable = (settings.allowedVariableReasons || []).some((name) => new RegExp('\\b' + escapeRegExp(name) + '\\b').test(reasonArg));
    if (!literals.length && !allowedVariable) {
      unverifiableCalls.push({ name: call.name, reasonArg, argsText: call.argsText });
      continue;
    }
    for (const reason of literals) {
      scheduledReasons.push(reason);
      if (!allowlistSet.has(reason)) unknownReasons.push({ name: call.name, reason });
    }
  }
  return {
    allowlist,
    scheduledReasons: Array.from(new Set(scheduledReasons)).sort(),
    unverifiableCalls,
    unknownReasons,
  };
}

function checkLoopReasonContract(errors, label, source, expectedReasons, options = {}) {
  const contract = collectLoopReasonContract(source, options);
  if (!contract.allowlist.length) {
    errors.push(`${label} missing LOOP_REASON_ALLOWLIST entries`);
    return contract;
  }
  const allowlist = new Set(contract.allowlist);
  for (const reason of expectedReasons || []) {
    if (!allowlist.has(reason)) errors.push(`${label} LOOP_REASON_ALLOWLIST missing reason: ${reason}`);
  }
  for (const call of contract.unverifiableCalls) {
    if (!call.reasonArg) errors.push(`${label} ${call.name} missing reason argument: ${call.argsText.slice(0, 120)}`);
    else errors.push(`${label} ${call.name} reason is not allowlist-verifiable: ${call.reasonArg}`);
  }
  for (const item of contract.unknownReasons) {
    errors.push(`${label} ${item.name} uses reason outside LOOP_REASON_ALLOWLIST: ${item.reason}`);
  }
  return contract;
}

function collectRuntimePanelIds(source) {
  const findChildIds = extractFindChildIds(source);
  const idConstants = extractRuntimeIdConstants(source);
  return { findChildIds, idConstants, all: Array.from(new Set(findChildIds.concat(idConstants))).sort() };
}

function checkRuntimePanelIds(errors, label, source, allowedIds, forbiddenIds) {
  const contract = collectRuntimePanelIds(source);
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);
  for (const id of contract.all) {
    if (!allowed.has(id)) errors.push(`${label} uses unverified runtime panel id: ${id}`);
  }
  for (const id of forbiddenIds || []) {
    const exactString = new RegExp(`["']${escapeRegExp(id)}["']`);
    if (exactString.test(source)) errors.push(`${label} contains forbidden fallback panel id: ${id}`);
  }
  return contract;
}

function checkBooleanFlagDefaults(errors, label, source, expected) {
  for (const [flagName, flagDefault] of Object.entries(expected || {})) {
    const match = normalizeNewlines(source).match(new RegExp('(?:var|const|let)\\s+' + escapeRegExp(flagName) + '\\s*=\\s*(true|false)\\s*;'));
    if (!match) {
      errors.push(`${label} ${flagName} missing boolean default`);
    } else if ((match[1] === 'true') !== flagDefault) {
      errors.push(`${label} ${flagName} must default ${String(flagDefault)}`);
    }
  }
}

function collectLevelTierContract(source) {
  const block = extractAssignedBlock(source, 'LEVEL_TIERS', '[', ']');
  const tiers = [];
  if (block !== null) {
    for (let i = 0; i < block.length; i += 1) {
      if (block[i] !== '{') continue;
      const body = findBalancedBlock(block, i, '{', '}');
      if (body === null) continue;
      const min = body.match(/\bmin\s*:\s*(-?\d+)/);
      const cls = body.match(/\bcls\s*:\s*["']([^"']+)["']/);
      if (cls) tiers.push({ min: min ? Number(min[1]) : null, cls: cls[1] });
      i += body.length + 1;
    }
  }
  return { tiers, classes: tiers.map((tier) => tier.cls) };
}

function checkLevelTierCssParity(errors, label, runtimeSource, cssSource, expectedTiers) {
  const contract = collectLevelTierContract(runtimeSource);
  const runtimeClasses = new Set(contract.classes);
  const cssClasses = new Set(Array.from(normalizeNewlines(cssSource).matchAll(/\.((?:level_tier)\d+)\b/g), (match) => match[1]));
  for (const tier of expectedTiers || []) {
    const expected = typeof tier === 'string' ? { cls: tier } : tier;
    if (!runtimeClasses.has(expected.cls)) errors.push(`${label} LEVEL_TIERS missing ${expected.cls}`);
    if (!cssClasses.has(expected.cls)) errors.push(`${label} css missing ${expected.cls}`);
    if (Object.prototype.hasOwnProperty.call(expected, 'min')) {
      const actual = contract.tiers.find((item) => item.cls === expected.cls);
      if (!actual || actual.min !== expected.min) {
        errors.push(`${label} LEVEL_TIERS ${expected.cls} min drift: expected ${expected.min}, got ${actual && actual.min}`);
      }
    }
  }
  return contract;
}

function checkRequiredSourceTerms(errors, label, source, terms) {
  for (const term of terms || []) {
    if (!source.includes(term)) errors.push(`${label} missing required source term: ${term}`);
  }
}

function checkForbiddenSourceTerms(errors, label, source, terms) {
  for (const term of terms || []) {
    if (source.includes(term)) errors.push(`${label} forbidden source term: ${term}`);
  }
}

function checkFunctionDeclarationCap(errors, label, source, max) {
  const names = extractFunctionDeclarationNames(source);
  if (names.length > max) errors.push(`${label} declares ${names.length} runtime functions; max ${max}`);
  return names;
}

function uniqueDuplicates(values) {
  const counts = new Map();
  for (const value of values || []) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value]) => value).sort();
}

function diffSets(left, right) {
  const rightSet = new Set(right || []);
  return Array.from(new Set(left || [])).filter((value) => !rightSet.has(value)).sort();
}

function buildMinimalSettingIds(fullSettingIds) {
  const fullOnly = new Set(FULL_ONLY_SETTING_IDS);
  return (fullSettingIds || []).filter((id) => !fullOnly.has(id));
}

function buildAliasToId(aliases, legacyAliases = HP_LEGACY_PRESET_ALIASES) {
  const out = {};
  for (const [id, alias] of Object.entries(aliases || {})) {
    if (alias) out[alias] = id;
  }
  for (const [alias, id] of Object.entries(legacyAliases || {})) out[alias] = id;
  return out;
}

function collectHpColorsSettingsSourceOfTruth(fullUiSource) {
  const settingIds = extractSettingIds(fullUiSource);
  const defaults = extractSettingDefaults(fullUiSource);
  const aliases = extractAliases(fullUiSource, 'HP_PERSIST_ALIASES');
  return {
    settingIds,
    defaults,
    aliases,
    aliasToId: buildAliasToId(aliases),
    legacyAliases: HP_LEGACY_PRESET_ALIASES,
    storageNamespace: extractContractString(fullUiSource, 'storageNamespace'),
    storageVersion: extractContractNumber(fullUiSource, 'storageVersion'),
    expectedCount: HP_COLORS_LANE_CONTRACT.full.expectedCount,
  };
}

function readHpColorLaneSources(repoRoot) {
  const root = path.resolve(repoRoot || process.cwd());
  const read = (relativePath) => normalizeNewlines(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  return {
    fullUiSource: read('hp_colors/panorama/scripts/anita_ui_core.js'),
    fullRuntimeSource: read('hp_colors/panorama/scripts/healthbar_logic.js'),
    minimalPublisherSource: read('hp_colors_minimal/panorama/scripts/anita_ui_core.js'),
    minimalRuntimeSource: read('hp_colors_minimal/panorama/scripts/healthbar_logic.js'),
  };
}

const BRIDGE_ASSIGNED_NAME_BY_PROPERTY = Object.freeze({
  eventChannel: ['EVENT_CHANNEL'],
  presetSnapshotMagic: ['PRESET_SNAPSHOT_MAGIC', 'SNAPSHOT_MAGIC'],
  presetRequestMagic: ['PRESET_REQUEST_MAGIC', 'REQUEST_MAGIC'],
  bulkUpdateMagic: ['BULK_UPDATE_MAGIC'],
  singleUpdateMagic: ['SINGLE_UPDATE_MAGIC'],
  bootstrapRequestMagic: ['BOOTSTRAP_REQUEST_MAGIC'],
  registerMagic: ['REGISTER_MAGIC'],
  aliveMagic: ['ALIVE_MAGIC'],
  handshakeMagic: ['HANDSHAKE_MAGIC'],
  sharedCfgRawKey: ['SHARED_CFG_RAW_KEY'],
  sharedDurableCfgRawKey: ['SHARED_DURABLE_CFG_RAW_KEY'],
  sharedBootstrapSeenKey: ['SHARED_BOOTSTRAP_SEEN_KEY'],
  sharedFirstPaintProbeKey: ['SHARED_FIRST_PAINT_PROBE_KEY'],
  sharedPresetRequestKey: ['SHARED_PRESET_REQUEST_KEY'],
  sharedMatchResetKey: ['SHARED_MATCH_RESET_KEY'],
  sharedMatchResetAckKey: ['SHARED_MATCH_RESET_ACK_KEY'],
  rootCfgRawAttr: ['ROOT_CFG_RAW_ATTR'],
  storeId: ['STORE_ID', 'HP_PRESET_STORE_ID'],
  startupPresetId: ['STARTUP_PRESET_ID', 'HP_STARTUP_PRESET_ID'],
  entryClass: ['ENTRY_CLASS', 'HP_PRESET_ENTRY_CLASS'],
});

function collectBridgeProtocol(source, properties) {
  const out = {};
  for (const prop of properties || []) {
    let value = extractProtocolString(source, prop);
    if (value === null) {
      for (const assignedName of BRIDGE_ASSIGNED_NAME_BY_PROPERTY[prop] || []) {
        value = extractAssignedString(source, assignedName);
        if (value !== null) break;
      }
    }
    out[prop] = value;
  }
  return out;
}

const FULL_BRIDGE_PROPERTIES = HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.fullRuntime;
const MINIMAL_BRIDGE_PROPERTIES = HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.minimalRuntime;

function expectedContractValue(prop) {
  if (Object.prototype.hasOwnProperty.call(HP_COLORS_LANE_CONTRACT.bridge, prop)) return HP_COLORS_LANE_CONTRACT.bridge[prop];
  if (Object.prototype.hasOwnProperty.call(HP_COLORS_LANE_CONTRACT.minimal, prop)) return HP_COLORS_LANE_CONTRACT.minimal[prop];
  if (Object.prototype.hasOwnProperty.call(HP_COLORS_LANE_CONTRACT.presetStore, prop)) return HP_COLORS_LANE_CONTRACT.presetStore[prop];
  return undefined;
}

function expectedBridgeObject(props) {
  const out = {};
  for (const prop of props || []) out[prop] = expectedContractValue(prop);
  return out;
}

function bridgeParityPairs(publisherProps, runtimeProps) {
  const runtimeSet = new Set(runtimeProps || []);
  return (publisherProps || [])
    .filter((prop) => runtimeSet.has(prop))
    .map((prop) => ({ label: prop, publisher: prop, runtime: prop }));
}

function checkRuntimePositionCoercion(errors, label, source) {
  for (const id of HP_RUNTIME_POSITION_SETTING_IDS) {
    const escaped = escapeRegExp(id);
    const marker = new RegExp(`(?:id|key)\\s*===\\s*["']${escaped}["']|["']${escaped}["']\\s*===\\s*(?:id|key)`);
    if (!marker.test(source)) {
      errors.push(`${label} runtime position coercion missing marker: ${id}`);
    }
  }
}

function collectFullSettingsContract(fullUiSource, fullRuntimeSource) {
  return {
    sourceOfTruth: collectHpColorsSettingsSourceOfTruth(fullUiSource),
    schemaIds: extractSettingIds(fullUiSource),
    schemaDefaults: extractSettingDefaults(fullUiSource),
    runtimeDefaultKeys: extractObjectKeys(fullRuntimeSource, 'DEFAULTS'),
    runtimeDefaults: extractObjectValues(fullRuntimeSource, 'DEFAULTS'),
    aliases: extractAliases(fullUiSource, 'HP_PERSIST_ALIASES'),
    storageNamespace: extractContractString(fullUiSource, 'storageNamespace'),
    storageVersion: extractContractNumber(fullUiSource, 'storageVersion'),
    bridge: {
      publisher: collectBridgeProtocol(fullUiSource, HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.fullPublisher),
      runtime: collectBridgeProtocol(fullRuntimeSource, HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.fullRuntime),
    },
  };
}

function collectMinimalSettingsContract(minimalPublisherSource, minimalRuntimeSource) {
  return {
    runtimeDefaultKeys: extractObjectKeys(minimalRuntimeSource, 'DEFAULTS'),
    runtimeDefaults: extractObjectValues(minimalRuntimeSource, 'DEFAULTS'),
    aliases: extractAliases(minimalPublisherSource, 'HP_PERSIST_ALIASES'),
    bridge: {
      publisher: collectBridgeProtocol(minimalPublisherSource, HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.minimalPublisher),
      runtime: collectBridgeProtocol(minimalRuntimeSource, HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.minimalRuntime),
    },
  };
}

function addMissingRegionErrors(errors, label, contract, required) {
  for (const [field, message] of Object.entries(required)) {
    const value = contract[field];
    const isMissing = value === null || value === undefined || (Array.isArray(value) && value.length === 0) || (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
    if (isMissing) errors.push(`${label} missing region: ${message}`);
  }
}

function checkKeySet(errors, label, actual, expected) {
  for (const missing of diffSets(expected, actual)) errors.push(`${label} missing key: ${missing}`);
  for (const extra of diffSets(actual, expected)) errors.push(`${label} unexpected key: ${extra}`);
}

function checkDefaultParity(errors, label, ids, expectedDefaults, actualDefaults) {
  for (const id of ids || []) {
    if (!Object.prototype.hasOwnProperty.call(actualDefaults || {}, id)) continue;
    if (!Object.prototype.hasOwnProperty.call(expectedDefaults || {}, id)) continue;
    if (expectedDefaults[id] !== actualDefaults[id]) {
      errors.push(`${label} default mismatch for ${id}: expected ${JSON.stringify(expectedDefaults[id])}, got ${JSON.stringify(actualDefaults[id])}`);
    }
  }
}

function checkAliasValues(errors, label, aliases) {
  const values = Object.values(aliases || {});
  for (const duplicate of uniqueDuplicates(values)) errors.push(`${label} duplicate compact alias value: ${duplicate}`);
}

function checkBridgeExpected(errors, label, protocol, expected) {
  for (const [property, value] of Object.entries(expected)) {
    if (!protocol || protocol[property] !== value) {
      errors.push(`${label} bridge literal drift for ${property}: expected ${JSON.stringify(value)}, got ${JSON.stringify(protocol && protocol[property])}`);
    }
  }
}

function checkBridgeProtocolParity(label, publisherSource, runtimeSource, pairs) {
  const publisherProps = [];
  const runtimeProps = [];
  for (const pair of pairs || []) {
    publisherProps.push(pair.publisher || pair[1] || pair.property || pair[0]);
    runtimeProps.push(pair.runtime || pair[2] || pair.property || pair[0]);
  }
  const publisher = collectBridgeProtocol(publisherSource, publisherProps);
  const runtime = collectBridgeProtocol(runtimeSource, runtimeProps);
  const errors = [];
  for (const pair of pairs || []) {
    const itemLabel = pair.label || pair[0];
    const publisherProp = pair.publisher || pair[1] || pair.property || pair[0];
    const runtimeProp = pair.runtime || pair[2] || pair.property || pair[0];
    if (!publisher[publisherProp] || !runtime[runtimeProp] || publisher[publisherProp] !== runtime[runtimeProp]) {
      errors.push(`${label} bridge literal drift for ${itemLabel}: publisher=${JSON.stringify(publisher[publisherProp])} runtime=${JSON.stringify(runtime[runtimeProp])}`);
    }
  }
  return { errors, publisher, runtime };
}

function checkFullSettingsContract(fullUiSource, fullRuntimeSource, options = {}) {
  const contract = collectFullSettingsContract(fullUiSource, fullRuntimeSource);
  const errors = [];
  addMissingRegionErrors(errors, 'full', contract, {
    schemaIds: 'HPSettingsContract.SETTINGS',
    schemaDefaults: 'SETTINGS defaultValue',
    runtimeDefaultKeys: 'runtime DEFAULTS',
    runtimeDefaults: 'runtime DEFAULTS values',
    aliases: 'HPSettingsContract.ALIASES',
  });

  const expectedCount = options.expectedCount || HP_COLORS_LANE_CONTRACT.full.expectedCount;
  if (contract.storageNamespace !== HP_COLORS_LANE_CONTRACT.full.storageNamespace) {
    errors.push(`full storageNamespace drift: expected ${HP_COLORS_LANE_CONTRACT.full.storageNamespace}, got ${contract.storageNamespace}`);
  }
  if (contract.storageVersion !== HP_COLORS_LANE_CONTRACT.full.storageVersion) {
    errors.push(`full storageVersion drift: expected ${HP_COLORS_LANE_CONTRACT.full.storageVersion}, got ${contract.storageVersion}`);
  }

  if ((contract.schemaIds || []).length !== expectedCount) errors.push(`full settings count mismatch: expected ${expectedCount}, got ${(contract.schemaIds || []).length}`);
  if ((contract.runtimeDefaultKeys || []).length !== expectedCount) errors.push(`full DEFAULTS count mismatch: expected ${expectedCount}, got ${(contract.runtimeDefaultKeys || []).length}`);
  if (Object.keys(contract.aliases || {}).length !== expectedCount) errors.push(`full alias count mismatch: expected ${expectedCount}, got ${Object.keys(contract.aliases || {}).length}`);
  for (const duplicate of uniqueDuplicates(contract.schemaIds || [])) errors.push(`full duplicate setting id: ${duplicate}`);
  for (const duplicate of uniqueDuplicates(contract.runtimeDefaultKeys || [])) errors.push(`full duplicate DEFAULTS key: ${duplicate}`);
  for (const duplicate of uniqueDuplicates(Object.keys(contract.aliases || {}))) errors.push(`full duplicate alias id: ${duplicate}`);

  checkKeySet(errors, 'full DEFAULTS', contract.runtimeDefaultKeys || [], contract.schemaIds || []);
  checkKeySet(errors, 'full aliases', Object.keys(contract.aliases || {}), contract.schemaIds || []);
  checkAliasValues(errors, 'full aliases', contract.aliases);
  checkDefaultParity(errors, 'full', contract.schemaIds || [], contract.schemaDefaults || {}, contract.runtimeDefaults || {});
  if (Object.prototype.hasOwnProperty.call(contract.aliases || {}, 'kzs')) errors.push('full aliases must not expose legacy alias key: kzs');
  const sourceOfTruth = contract.sourceOfTruth || collectHpColorsSettingsSourceOfTruth(fullUiSource);
  if (sourceOfTruth.legacyAliases.kzs !== 'hp_kill_zone_color') errors.push('legacy alias kzs drift');
  if (sourceOfTruth.aliasToId.kzs !== 'hp_kill_zone_color') errors.push('aliasToId legacy kzs drift');
  checkRuntimePositionCoercion(errors, 'full', fullRuntimeSource);
  for (const id of FULL_ONLY_SETTING_IDS) {
    if (!(contract.schemaIds || []).includes(id)) errors.push(`full missing full-only setting id: ${id}`);
    if (!(contract.runtimeDefaultKeys || []).includes(id)) errors.push(`full DEFAULTS missing full-only setting id: ${id}`);
    if (!Object.prototype.hasOwnProperty.call(contract.aliases || {}, id)) errors.push(`full aliases missing full-only setting id: ${id}`);
  }

  checkBridgeExpected(errors, 'full publisher', contract.bridge.publisher, expectedBridgeObject(HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.fullPublisher));
  checkBridgeExpected(errors, 'full runtime', contract.bridge.runtime, expectedBridgeObject(HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.fullRuntime));
  const parity = checkBridgeProtocolParity('full', fullUiSource, fullRuntimeSource, bridgeParityPairs(HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.fullPublisher, HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.fullRuntime));
  errors.push(...parity.errors);

  return { errors, contract };
}

function checkMinimalSettingsContract(minimalPublisherSource, minimalRuntimeSource, fullContract, options = {}) {
  const contract = collectMinimalSettingsContract(minimalPublisherSource, minimalRuntimeSource);
  const errors = [];
  const sourceFullContract = fullContract && fullContract.contract ? fullContract.contract : fullContract;
  const fullSchemaIds = (sourceFullContract && sourceFullContract.schemaIds) || [];
  const fullDefaults = (sourceFullContract && sourceFullContract.runtimeDefaults) || {};
  const expectedMinimalIds = options.expectedMinimalIds || buildMinimalSettingIds(fullSchemaIds);

  addMissingRegionErrors(errors, 'minimal', contract, {
    runtimeDefaultKeys: 'runtime DEFAULTS',
    runtimeDefaults: 'runtime DEFAULTS values',
    aliases: 'HP_PERSIST_ALIASES',
  });

  const expectedCount = options.expectedCount || HP_COLORS_LANE_CONTRACT.minimal.expectedCount;
  if ((contract.runtimeDefaultKeys || []).length !== expectedCount) errors.push(`minimal DEFAULTS count mismatch: expected ${expectedCount}, got ${(contract.runtimeDefaultKeys || []).length}`);
  if (Object.keys(contract.aliases || {}).length !== expectedCount) errors.push(`minimal alias count mismatch: expected ${expectedCount}, got ${Object.keys(contract.aliases || {}).length}`);
  for (const duplicate of uniqueDuplicates(contract.runtimeDefaultKeys || [])) errors.push(`minimal duplicate DEFAULTS key: ${duplicate}`);
  for (const duplicate of uniqueDuplicates(Object.keys(contract.aliases || {}))) errors.push(`minimal duplicate alias id: ${duplicate}`);

  checkKeySet(errors, 'minimal DEFAULTS', contract.runtimeDefaultKeys || [], expectedMinimalIds);
  checkKeySet(errors, 'minimal aliases', Object.keys(contract.aliases || {}), expectedMinimalIds);
  checkAliasValues(errors, 'minimal aliases', contract.aliases);
  checkDefaultParity(errors, 'minimal', expectedMinimalIds, fullDefaults, contract.runtimeDefaults || {});
  if (Object.prototype.hasOwnProperty.call(contract.aliases || {}, 'kzs')) errors.push('minimal aliases must not expose legacy alias key: kzs');
  checkRuntimePositionCoercion(errors, 'minimal', minimalRuntimeSource);

  const defaultSet = new Set(contract.runtimeDefaultKeys || []);
  const aliasSet = new Set(Object.keys(contract.aliases || {}));
  const expectedSet = new Set(expectedMinimalIds);
  for (const id of FULL_ONLY_SETTING_IDS) {
    if (defaultSet.has(id)) errors.push(`minimal full-only setting leakage in DEFAULTS: ${id}`);
    if (aliasSet.has(id)) errors.push(`minimal full-only setting leakage in aliases: ${id}`);
  }
  for (const id of [...defaultSet, ...aliasSet]) {
    if (String(id).startsWith('hp_') && !expectedSet.has(id)) errors.push(`minimal unknown hp_* leakage: ${id}`);
  }

  checkBridgeExpected(errors, 'minimal publisher', contract.bridge.publisher, expectedBridgeObject(HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.minimalPublisher));
  checkBridgeExpected(errors, 'minimal runtime', contract.bridge.runtime, expectedBridgeObject(HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.minimalRuntime));
  const parity = checkBridgeProtocolParity('minimal', minimalPublisherSource, minimalRuntimeSource, bridgeParityPairs(HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.minimalPublisher, HP_COLORS_BRIDGE_PROTOCOL_PROPERTIES.minimalRuntime));
  errors.push(...parity.errors);

  return { errors, contract, expectedMinimalIds };
}

module.exports = {
  FULL_ONLY_SETTING_IDS,
  HP_COLORS_LANE_CONTRACT,
  HP_EXPECTED_LOOP_REASONS,
  buildMinimalSettingIds,
  checkBooleanFlagDefaults,
  checkForbiddenSourceTerms,
  checkFullSettingsContract,
  checkFunctionDeclarationCap,
  checkLevelTierCssParity,
  checkLoopReasonContract,
  checkMinimalSettingsContract,
  checkObjectInterface,
  checkRequiredSourceTerms,
  checkRuntimePanelIds,
  collectHpColorsSettingsSourceOfTruth,
  collectLoopReasonContract,
  extractAssignedObjectShape,
  extractObjectKeys,
  readHpColorLaneSources,
};
