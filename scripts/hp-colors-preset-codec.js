'use strict';

const SUPPORTED_PRESET_VERSIONS = new Set([1, 97, 98, 99]);
const TOKEN_PREFIX = 'ANITA-v1-';
const HERO_SCOPE_OFF = 'off';
const HERO_SCOPE_ALL = 'all';
const HERO_SCOPE_SELECTED = 'selected';
const LEGACY_KILL_ZONE_ALIAS = 'kzs';
const KILL_ZONE_ID = 'hp_kill_zone_color';

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function normalizeNamespace(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toLookup(value) {
  if (!value) return {};
  if (value instanceof Set) {
    const out = {};
    for (const key of value) out[String(key)] = true;
    return out;
  }
  if (Array.isArray(value)) {
    const out = {};
    for (const key of value) out[String(key)] = true;
    return out;
  }
  return value;
}

function supportedVersion(value) {
  const version = Number(value);
  return SUPPORTED_PRESET_VERSIONS.has(version) ? version : 0;
}

function valuesFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.values && typeof payload.values === 'object') return payload.values;
  if (payload.vals && typeof payload.vals === 'object') return payload.vals;
  if (payload.vs && typeof payload.vs === 'object') return payload.vs;
  return null;
}
function lookupHas(value, key) {
  return hasOwn(value, key);
}

function lookupGet(value, key) {
  return hasOwn(value, key) ? value[key] : undefined;
}

function overrideOptions(options = {}) {
  return {
    aliasToId: options.aliasToId || {},
    idToAlias: options.idToAlias || {},
    allowedIds: options.allowedIds,
    ineligibleIds: options.ineligibleIds,
  };
}

function isAllowedOverrideId(id, options) {
  if (!id) return false;
  if (lookupHas(toLookup(options.ineligibleIds), id)) return false;
  if (options.allowedIds === undefined || options.allowedIds === null) return true;
  return lookupHas(toLookup(options.allowedIds), id);
}

function resolveOverrideId(key, options) {
  const text = String(key);
  const mapped = text === LEGACY_KILL_ZONE_ALIAS
    ? KILL_ZONE_ID
    : lookupGet(options.aliasToId, text);
  const isKnownAlias = mapped !== undefined && mapped !== null && String(mapped) !== text;
  const hasExplicitAllowedIds = options.allowedIds !== undefined && options.allowedIds !== null;
  if ((!isKnownAlias || hasExplicitAllowedIds && lookupHas(toLookup(options.allowedIds), text))
      && isAllowedOverrideId(text, options)) return text;
  return isAllowedOverrideId(mapped, options) ? String(mapped) : '';
}

function parseOverrideRule(rawRule) {
  let slot;
  let minTier;
  let value;
  if (Array.isArray(rawRule)) {
    if (rawRule.length !== 3) return null;
    [slot, minTier, value] = rawRule;
  } else if (rawRule && typeof rawRule === 'object') {
    if (!hasOwn(rawRule, 'slot') || !hasOwn(rawRule, 'minTier') || !hasOwn(rawRule, 'value')) return null;
    ({ slot, minTier, value } = rawRule);
  } else {
    return null;
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) return null;
  if (!Number.isInteger(minTier) || minTier < 0 || minTier > 3) return null;
  return { slot, minTier, value };
}

const HPPresetCodeCodec = {
  encodeBase64Url(text) {
    return Buffer.from(String(text || ''), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  },

  decodeBase64Url(text) {
    const encoded = String(text || '').trim();
    if (!/^[A-Za-z0-9_-]*$/.test(encoded)) throw new Error('Invalid base64url characters');
    if (encoded.length % 4 === 1) throw new Error('Invalid base64url length');
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  },

  normalizeHeroToken(value, heroById, heroIdToKey) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (hasOwn(heroById, text)) return text;
    if (/^\d+$/.test(text) && hasOwn(heroIdToKey, text)) return String(heroIdToKey[text] || '');
    return '';
  },

  normalizeHeroes(value, heroById, heroIdToKey) {
    let source = [];
    if (Array.isArray(value)) source = value;
    else if (typeof value === 'string') source = value.split(/[,|;]/);
    else if (value !== null && value !== undefined) source = [value];
    const seen = new Set();
    const out = [];
    for (const item of source) {
      const hero = this.normalizeHeroToken(item, heroById, heroIdToKey);
      if (!hero || seen.has(hero)) continue;
      seen.add(hero);
      out.push(hero);
    }
    return out;
  },

  normalizeHeroScope(mode, heroes, heroTables = {}, options = {}) {
    const normalizedHeroes = this.normalizeHeroes(
      heroes,
      heroTables.heroById || heroTables.HERO_BY_ID || {},
      heroTables.heroIdToKey || heroTables.HERO_ID_TO_KEY || {},
    );
    const text = String(mode || '').toLowerCase();
    let normalizedMode = '';
    if (text === HERO_SCOPE_OFF || text === 'disabled' || text === 'none') normalizedMode = HERO_SCOPE_OFF;
    else if (text === HERO_SCOPE_ALL || text === 'global') normalizedMode = HERO_SCOPE_ALL;
    else if (text === HERO_SCOPE_SELECTED || text === 'heroes' || text === 'hero') {
      normalizedMode = normalizedHeroes.length ? HERO_SCOPE_SELECTED : HERO_SCOPE_OFF;
    } else if (normalizedHeroes.length) normalizedMode = HERO_SCOPE_SELECTED;
    else normalizedMode = options.defaultModeWithoutHeroes || HERO_SCOPE_OFF;
    return {
      mode: normalizedMode,
      heroes: normalizedMode === HERO_SCOPE_SELECTED ? normalizedHeroes : [],
    };
  },

  expandValues(rawValues, aliasToId, allowedIds) {
    if (!rawValues || typeof rawValues !== 'object') return null;
    const allowed = toLookup(allowedIds);
    const aliases = aliasToId || {};
    const out = {};
    for (const key of Object.keys(rawValues)) {
      let fullKey = key === LEGACY_KILL_ZONE_ALIAS ? KILL_ZONE_ID : aliases[key] || key;
      if (!hasOwn(allowed, fullKey)) continue;
      out[fullKey] = rawValues[key];
    }
    return out;
  },

  normalizeOverrides(rawOverrides, options = {}) {
    if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) return {};
    const normalizedOptions = overrideOptions(options);
    const canonicalKeys = new Set();
    const keys = Object.keys(rawOverrides);
    for (const key of keys) {
      const id = resolveOverrideId(key, normalizedOptions);
      if (id === key && isAllowedOverrideId(id, normalizedOptions)) canonicalKeys.add(id);
    }
    const out = {};
    for (const key of keys) {
      const id = resolveOverrideId(key, normalizedOptions);
      if (!id || (id !== key && canonicalKeys.has(id))) continue;
      const rule = parseOverrideRule(rawOverrides[key]);
      if (rule) out[id] = rule;
    }
    return out;
  },

  compactOverrides(overrides, options = {}) {
    const normalizedOptions = overrideOptions(options);
    const canonical = this.normalizeOverrides(overrides, normalizedOptions);
    const out = {};
    for (const id of Object.keys(canonical)) {
      const alias = lookupGet(normalizedOptions.idToAlias, id);
      const key = alias === undefined || alias === null || alias === '' ? id : String(alias);
      out[key] = [
        canonical[id].slot,
        canonical[id].minTier,
        canonical[id].value,
      ];
    }
    return out;
  },

  decodePresetPayload(rawOrObject, options = {}) {
    let payload = rawOrObject;
    let raw = '';
    if (typeof rawOrObject === 'string') {
      raw = rawOrObject;
      try {
        payload = JSON.parse(rawOrObject);
      } catch (error) {
        return null;
      }
    }
    if (!payload || typeof payload !== 'object') return null;
    const version = supportedVersion(payload.version !== undefined ? payload.version : payload.v);
    if (!version) return null;
    const rawValues = valuesFromPayload(payload);
    if (!rawValues) return null;
    const values = this.expandValues(rawValues, options.aliasToId || {}, options.allowedIds || {});
    if (!values) return null;
    const overrides = this.normalizeOverrides(payload.o, options);
    const scope = this.normalizeHeroScope(
      payload.heroMode !== undefined ? payload.heroMode : payload.hm,
      payload.heroes !== undefined
        ? payload.heroes
        : payload.hs !== undefined
          ? payload.hs
          : payload.hero !== undefined
            ? payload.hero
            : payload.h,
      { heroById: options.heroById || {}, heroIdToKey: options.heroIdToKey || {} },
      { defaultModeWithoutHeroes: options.defaultModeWithoutHeroes || HERO_SCOPE_OFF },
    );
    return {
      version,
      values,
      overrides,
      heroes: scope.heroes,
      heroMode: scope.mode,
      name: typeof payload.name === 'string' ? payload.name : '',
      raw,
    };
  },

  extractToken(text, namespace) {
    const body = String(text || '').trim();
    if (!body) return '';
    const ns = normalizeNamespace(namespace);
    if (!ns) return '';
    const scoped = body.match(new RegExp('\\[' + TOKEN_PREFIX + ns + '\\]:[A-Za-z0-9_-]+'));
    if (scoped && scoped[0]) return scoped[0];
    const generic = body.match(/\[ANITA-v1-[a-z0-9_]+\]:[A-Za-z0-9_-]+/i);
    if (generic && generic[0]) return generic[0];
    if (/^[A-Za-z0-9_-]+$/.test(body)) return '[' + TOKEN_PREFIX + ns + ']:' + body;
    return '';
  },

  encodePresetToken(config, values, meta = {}) {
    const ns = normalizeNamespace(meta.namespace || (config && config.storageNamespace));
    if (!ns) return '';
    const payloadValues = {};
    for (const key of Object.keys(values || {})) {
      if (key === LEGACY_KILL_ZONE_ALIAS) continue;
      payloadValues[key] = values[key];
    }
    const heroTables = { heroById: meta.heroById || {}, heroIdToKey: meta.heroIdToKey || {} };
    const scope = this.normalizeHeroScope(meta.heroMode || meta.hm, meta.heroes || meta.hs, heroTables, {
      defaultModeWithoutHeroes: HERO_SCOPE_OFF,
    });
    const ruleOptions = Object.assign({}, meta.overrideOptions || {}, meta);
    if (ruleOptions.allowedIds === undefined && config && config.allowedIds !== undefined) ruleOptions.allowedIds = config.allowedIds;
    if (ruleOptions.ineligibleIds === undefined && config && config.ineligibleIds !== undefined) ruleOptions.ineligibleIds = config.ineligibleIds;
    const payload = {
      v: 99,
      c: Number(meta.compactVersion || 1) || 1,
      values: payloadValues,
      hm: scope.mode,
    };
    const compactOverrides = this.compactOverrides(meta.overrides || meta.o || {}, ruleOptions);
    if (Object.keys(compactOverrides).length) payload.o = compactOverrides;
    if (scope.mode === HERO_SCOPE_SELECTED && scope.heroes.length) payload.hs = scope.heroes;
    const name = String(meta.name || '').trim();
    if (name) payload.name = name;
    return '[' + TOKEN_PREFIX + ns + ']:' + this.encodeBase64Url(JSON.stringify(payload));
  },

  decodePresetToken(config, text, options = {}) {
    const namespace = options.namespace || (config && config.storageNamespace);
    const token = this.extractToken(text, namespace);
    if (!token) return null;
    const encoded = token.split(']:')[1] || '';
    let raw = '';
    try {
      raw = this.decodeBase64Url(encoded);
    } catch (error) {
      return null;
    }
    const decoded = this.decodePresetPayload(raw, options);
    if (!decoded) return null;
    decoded.token = token;
    decoded.raw = raw;
    return decoded;
  },

  encodePresetBundle(config, rows) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const tuples = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      const sourceValues = row.payloadValues || row.values || {};
      const payloadValues = {};
      for (const key of Object.keys(sourceValues)) {
        if (key === LEGACY_KILL_ZONE_ALIAS) continue;
        payloadValues[key] = sourceValues[key];
      }
      const scope = this.normalizeHeroScope(row.heroMode || row.hm, row.heroes || row.hs, {
        heroById: (config && config.heroById) || {},
        heroIdToKey: (config && config.heroIdToKey) || {},
      }, { defaultModeWithoutHeroes: HERO_SCOPE_OFF });
      const ruleOptions = Object.assign(
        {},
        (config && config.overrideOptions) || {},
        config || {},
        row.overrideOptions || {},
      );
      const compactRules = this.compactOverrides(row.overrides || row.o || {}, ruleOptions);
      const tuple = [
        String(row.name || 'Preset ' + String(i + 1)).trim() || 'Preset ' + String(i + 1),
        payloadValues,
        scope.mode === HERO_SCOPE_SELECTED && scope.heroes.length ? scope.heroes : scope.mode,
        compactRules,
      ];
      tuples.push(tuple);
    }
    if (!tuples.length) return '';
    return this.encodeBase64Url(JSON.stringify({ v: 99, p: tuples }));
  },

  decodePresetBundle(text, options = {}) {
    let payload = null;
    try {
      payload = JSON.parse(this.decodeBase64Url(text));
    } catch (error) {
      return null;
    }
    const version = supportedVersion(payload && payload.v);
    if (!version || !Array.isArray(payload.p)) return null;
    const rows = [];
    for (const tuple of payload.p) {
      if (!Array.isArray(tuple) || tuple.length < 2) continue;
      const values = this.expandValues(tuple[1], options.aliasToId || {}, options.allowedIds || {});
      if (!values) continue;
      const scopeValue = tuple.length > 2 ? tuple[2] : HERO_SCOPE_OFF;
      const mode = Array.isArray(scopeValue) ? HERO_SCOPE_SELECTED : scopeValue;
      const heroes = Array.isArray(scopeValue) ? scopeValue : [];
      const scope = this.normalizeHeroScope(mode, heroes, {
        heroById: options.heroById || {},
        heroIdToKey: options.heroIdToKey || {},
      }, { defaultModeWithoutHeroes: HERO_SCOPE_OFF });
      const overrides = this.normalizeOverrides(tuple.length > 3 ? tuple[3] : {}, options);
      rows.push({
        name: String(tuple[0] || ''),
        values,
        overrides,
        heroMode: scope.mode,
        heroes: scope.heroes,
      });
    }
    return { version, rows };
  },
};

module.exports = { HPPresetCodeCodec };
