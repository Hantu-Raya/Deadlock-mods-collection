(function () {
  "use strict";
  // requires: the menu layout includes settings, from_v2, codec, storage (from_v2 loads BEFORE the codec). The codec reads
  // $.HPColorsV3Settings at load (contract below) and $.HPColorsV3FromV2 at call time (fromV2(): v2 codes and pre-v6
  // migration); from_v2 and storage read $.HPColorsV3Codec at call time, so the order does not matter: nothing reads
  // another script while loading.
  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  // Record limits: the one owner. storage, from_v2 and the menu read $.HPColorsV3Codec.RECORD at call time.
  var RECORD = Object.freeze({
    maxChars: 192000, settingsCodeChars: 4096, bundleCodeChars: 32768, maxPresets: 128, nameMax: 48,
    slotRange: Object.freeze([1, 4]), tierRange: Object.freeze([1, 3]),
    reservedPresetId: "baked_default", compactFromVersion: 6
  });
  // The text for a save over RECORD.maxChars; storage reads it from here at call time.
  var SAVE_TOO_LARGE = "Save exceeds 192,000 characters; remove some presets";
  var RESERVED_PRESET_ID = RECORD.reservedPresetId, importSerial = 0;
  // A default change increments the generated recordVersion and adds an
  // ordered step here: preserve the old value for each absent changed slot.
  // Changed-default slots are explicitly emitted by every subsequent version,
  // including when equal to the new default. defaultChanges stores slot ids,
  // not a second default-value baseline, so older readers can project them.
  // No frozen second baseline is kept.
  // Slot-only additions adopt shipped defaults; changed defaults still require
  // an explicit upgrade step preserving absent old values.
  var UPGRADE_STEPS = {};
  contract().slotAdditions.forEach(function (change) {
    if (!contract().defaultChanges.some(function (defaults) { return defaults.version === change.version; }))
      UPGRADE_STEPS[change.version] = function (record) { return record; };
  });
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function contract() { return $.HPColorsV3Settings; }
  // undefined when the script is absent: callers keep the baseline outcome (v2 codes throw, pending upgrade throws, conditions skip).
  function fromV2() { return $.HPColorsV3FromV2; }
  // Slot and control lookups, built once per contract table (first match wins, like the scans they replace):
  // a sparse encode of a 128-preset library otherwise ran over two million control predicates.
  var lookups = null;
  function tables() {
    var c = contract();
    if (lookups && lookups.slotList === c.slots && lookups.controlList === c.controls) return lookups;
    var bySlot = Object.create(null), byControl = Object.create(null);
    c.slots.forEach(function (slot) { if (!(slot.slot in bySlot)) bySlot[slot.slot] = slot; });
    c.controls.forEach(function (row) { var key = row.side + "\u0001" + row.key; if (!(key in byControl)) byControl[key] = row; });
    lookups = { slotList: c.slots, controlList: c.controls, bySlot: bySlot, byControl: byControl };
    return lookups;
  }
  function slotById(id) { return typeof id === "number" ? tables().bySlot[id] : undefined; }
  function controlOf(slot) { return slot ? tables().byControl[slot.side + "\u0001" + slot.setting] : undefined; }
  function version() { return contract().recordVersion; }
  function values(settings, slot) { return slot.side === "shared" ? settings.shared : settings.side[slot.side]; }
  var COMPACT_FROM = RECORD.compactFromVersion;
  function checksum(text) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return ("0000000" + hash.toString(16)).slice(-8);
  }
  function encode(text) {
    // Older JSON engines can leave lone UTF-16 surrogates unescaped. Preserve
    // them as JSON escapes rather than failing UTF-8 encoding or replacing data.
    var safe = [];
    for (var index = 0; index < text.length; index++) {
      var code = text.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
        safe.push(text.charAt(index), text.charAt(++index));
      } else if (code >= 0xd800 && code <= 0xdfff) safe.push("\\u" + ("000" + code.toString(16)).slice(-4));
      else safe.push(text.charAt(index));
    }
    text = safe.join("");
    var escaped = encodeURIComponent(text), bytes = [], out = [];
    for (var i = 0; i < escaped.length; i++) {
      if (escaped.charAt(i) === "%") { bytes.push(parseInt(escaped.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(escaped.charCodeAt(i));
    }
    for (var j = 0; j < bytes.length; j += 3) {
      var bits = (bytes[j] << 16) | ((bytes[j + 1] || 0) << 8) | (bytes[j + 2] || 0);
      out.push(ALPHABET.charAt((bits >> 18) & 63), ALPHABET.charAt((bits >> 12) & 63));
      if (j + 1 < bytes.length) out.push(ALPHABET.charAt((bits >> 6) & 63));
      if (j + 2 < bytes.length) out.push(ALPHABET.charAt(bits & 63));
    }
    return out.join("");
  }
  function decode(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error("Invalid code encoding");
    var bits = 0, buffer = 0, escaped = [];
    for (var i = 0; i < text.length; i++) {
      buffer = ((buffer << 6) | ALPHABET.indexOf(text.charAt(i))) & 0xffffff;
      bits += 6;
      if (bits >= 8) { bits -= 8; escaped.push("%" + ("0" + ((buffer >> bits) & 255).toString(16)).slice(-2)); }
    }
    if (bits && (buffer & ((1 << bits) - 1))) throw new Error("Invalid code encoding");
    try { return decodeURIComponent(escaped.join("")); }
    catch (error) { throw new Error("That code contains invalid text."); }
  }
  function frame(record, tag) {
    // v6 removes pair brackets on the wire; runtime diffs and v1–5 stay pairs.
    var wire = clone(record);
    if (wire.v >= COMPACT_FROM) {
      wire.d = [].concat.apply([], wire.d);
      if (Array.isArray(wire.p)) wire.p.forEach(function (preset) { preset.d = [].concat.apply([], preset.d); });
    }
    var payload = encode(JSON.stringify(wire));
    return tag + "." + checksum(payload) + "." + payload;
  }
  function unframe(code, tag, cap, legacy) {
    if (typeof code !== "string") throw new Error("Paste a settings or bundle code first.");
    if (code.length > cap) throw new Error("This code is too large for its paste box.");
    var parts = code.trim().split(".");
    if (parts.length !== 3 || parts[0] !== tag || !/^[0-9a-f]{8}$/.test(parts[1]) || checksum(parts[2]) !== parts[1]) throw new Error("Invalid code or checksum");
    var record;
    try { record = JSON.parse(decode(parts[2])); }
    catch (error) { throw new Error("That code is incomplete or damaged."); }
    if (!legacy && (!record || !Number.isInteger(record.v) || record.v < 1)) throw new Error("Invalid record version");
    return { record: record, sum: parts[1] };
  }
  function sparse(settings) {
    if (!contract().validate(settings)) throw new Error("Invalid settings");
    settings = clone(settings);
    var result = [];
    var explicit = Object.create(null);
    (contract().defaultChanges || []).forEach(function (change) {
      if (change.version <= version()) change.slots.forEach(function (slot) { explicit[slot] = true; });
    });
    contract().slots.forEach(function (slot) {
      var value = values(settings, slot)[slot.setting];
      if (slot.type === "number") {
        var row = controlOf(slot);
        var decimals = (String(row.step).split(".")[1] || "").length;
        value = Number((row.bounds[0] + Math.round((value - row.bounds[0]) / row.step) * row.step).toFixed(decimals));
        values(settings, slot)[slot.setting] = value;
      }
      if (explicit[slot.slot] || value !== values(contract().defaults, slot)[slot.setting]) result.push([slot.slot, value]);
    });
    if (!contract().validate(settings)) throw new Error("Invalid settings");
    return result.sort(function (a, b) { return a[0] - b[0]; });
  }
  function upgrade(record, target, steps) {
    var result = clone(record);
    while (result.v < target) {
      var step = steps[result.v + 1];
      if (typeof step !== "function") throw new Error("Missing record upgrade step");
      result = step(result);
      result.v += 1;
    }
    return result;
  }
  function expand(diff, newer, compact) {
    if (!Array.isArray(diff)) throw new Error("Invalid sparse settings");
    if (compact && diff.length && !Array.isArray(diff[0])) {
      if (diff.length % 2) throw new Error("Invalid sparse settings");
      var pairs = [];
      for (var d = 0; d < diff.length; d += 2) pairs.push([diff[d], diff[d + 1]]);
      diff = pairs;
    }
    var settings = clone(contract().defaults), seen = Object.create(null), accepted = [];
    diff.forEach(function (entry) {
      if (!Array.isArray(entry) || entry.length !== 2 || !Number.isInteger(entry[0]) || entry[0] < 0 || seen[entry[0]]) throw new Error("Invalid or duplicate setting slot");
      seen[entry[0]] = true;
      var kind = classify(entry[0], entry[1], newer);
      // Unknown slot: an error unless the record is from a newer build; retired slot: always skipped; bad value: skipped only when newer.
      if (kind === "unknown" || kind === "retired") { if (kind === "unknown" && !newer) throw new Error("Unknown setting slot"); return; }
      if (kind === "invalid") { if (newer) return; throw new Error("Invalid settings values"); }
      var slot = slotById(entry[0]);
      accepted.push({ slot: slot, value: entry[1] });
      values(settings, slot)[slot.setting] = entry[1];
    });
    if (!contract().validate(settings)) {
      if (!newer) throw new Error("Invalid settings values");
      // If old cross-field rules reject a future combination, keep compatible
      // fields. Revisit deferred values so mutually compatible threshold edits
      // are not rejected merely because of application order.
      settings = clone(contract().defaults);
      var remaining = accepted.slice(), progress = true;
      while (remaining.length && progress) {
        progress = false;
        remaining = remaining.filter(function (entry) {
          var candidate = clone(settings);
          values(candidate, entry.slot)[entry.slot.setting] = entry.value;
          if (!contract().validate(candidate)) return true;
          settings = candidate; progress = true; return false;
        });
      }
    }
    return settings;
  }
  // A removed setting's slots (record.json retiredSlots) are skipped in older records, never written.
  function retired(slot) { return (contract().retiredSlots || []).indexOf(Number(slot)) >= 0; }
  // The one verdict on a setting entry (slot id, value), shared by expand, expandRules and the newer-build check:
  // "ok", "unknown" (no such slot), "retired" (removed slot) or "invalid" (known slot, rejected value).
  // newer: an unknown slot is then "unknown" without asking retired(). unchecked: skip the value check (the caller validates it).
  function classify(id, value, newer, unchecked) {
    var slot = slotById(id);
    if (!slot) return newer ? "unknown" : retired(id) ? "retired" : "unknown";
    return unchecked || contract().validateValue(controlOf(slot), value) ? "ok" : "invalid";
  }
  // A newer build wrote this entry: its slot is unknown here, or its value is rejected but of a plausible type.
  function futureEntry(id, value) {
    var kind = classify(id, value);
    if (kind === "unknown") return true;
    if (kind !== "invalid") return false;
    var row = controlOf(slotById(id));
    return row.type === "number" && typeof value === "number" && isFinite(value) || row.type === "enum" && typeof value === "string";
  }
  function metadata(value, excluded) {
    var result = {};
    Object.keys(value).forEach(function (key) {
      if (excluded.indexOf(key) === -1 && key !== "__proto__" && key !== "constructor" && key !== "prototype") result[key] = clone(value[key]);
    });
    return result;
  }
  // Native rules use generated setting-cell slots; only the sparse quadruples travel on the wire.
  function ruleRow(cell) {
    var slot = slotById(Number(cell));
    return slot && controlOf(slot);
  }
  function sparseRules(rules) {
    if (rules === undefined) return [];
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) throw new Error("Invalid ability conditions");
    var result = [];
    Object.keys(rules).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (cell) {
      var row = /^(0|[1-9]\d*)$/.test(cell) && ruleRow(cell), rule = rules[cell];
      if (!row || !rule || Object.keys(rule).some(function (key) { return ["slot", "minTier", "value"].indexOf(key) < 0; }) ||
          !Number.isInteger(rule.slot) || rule.slot < RECORD.slotRange[0] || rule.slot > RECORD.slotRange[1] ||
          !Number.isInteger(rule.minTier) || rule.minTier < RECORD.tierRange[0] || rule.minTier > RECORD.tierRange[1] || !contract().validateValue(row, rule.value))
        throw new Error("Invalid ability conditions");
      result.push(Number(cell), rule.slot, rule.minTier, row.type === "color" ? rule.value.toUpperCase() : rule.value);
    });
    return result;
  }
  function expandRules(wire, newer) {
    if (wire === undefined) return {};
    if (!Array.isArray(wire) || wire.length % 4) throw new Error("Invalid ability conditions");
    var rules = {}, seen = {};
    for (var i = 0; i < wire.length; i += 4) {
      var cell = wire[i], rule = { slot: wire[i + 1], minTier: wire[i + 2], value: wire[i + 3] };
      if (!Number.isInteger(cell) || cell < 0 || seen[cell]) throw new Error("Invalid ability conditions");
      seen[cell] = true;
      var kind = classify(cell, undefined, newer, true);
      if (kind === "retired" || kind === "unknown" && newer) continue;
      var single = {}; single[cell] = rule;
      try { sparseRules(single); } catch (error) { if (newer) continue; throw error; }
      rules[cell] = rule;
    }
    return rules;
  }
  function writeRules(record, rules) {
    var wire = sparseRules(rules);
    if (wire.length) record.c = wire;
  }
  function validateHeroRoutes(bundle, dropMissing) {
    var ids = Object.create(null), heroes = Object.create(null);
    ids[RESERVED_PRESET_ID] = true;
    bundle.presets.forEach(function (preset) { ids[preset.id] = true; });
    contract().heroes.forEach(function (hero) { heroes[hero.key] = true; });
    var changed = false;
    if (bundle.sourceWasMapped !== undefined && typeof bundle.sourceWasMapped !== "boolean") throw new Error("Invalid preset source");
    if (bundle.sourcePresetId !== undefined && bundle.sourcePresetId !== null) {
      if (typeof bundle.sourcePresetId !== "string") throw new Error("Invalid preset source");
      if (!ids[bundle.sourcePresetId]) {
        if (!dropMissing) throw new Error("Invalid preset source");
        bundle.sourcePresetId = null; bundle.sourceWasMapped = false; changed = true;
      }
    }
    // A migrated hero-scoped Current can outlive (or never have had) a saved source.
    if (bundle.sourceWasMapped && bundle.sourcePresetId === undefined) throw new Error("Invalid preset source");
    if (bundle.heroDefault !== undefined && bundle.heroDefault !== null) {
      if (typeof bundle.heroDefault !== "string") throw new Error("Invalid hero default preset");
      if (!ids[bundle.heroDefault]) {
        if (!dropMissing) throw new Error("Invalid hero default preset");
        bundle.heroDefault = null; changed = true;
      }
    }
    if (bundle.heroPresets === undefined) return changed;
    if (!bundle.heroPresets || typeof bundle.heroPresets !== "object" || Array.isArray(bundle.heroPresets)) throw new Error("Invalid hero preset map");
    Object.keys(bundle.heroPresets).forEach(function (key) {
      var id = bundle.heroPresets[key];
      if (!heroes[key] || typeof id !== "string") throw new Error("Invalid hero preset reference");
      if (!ids[id]) {
        if (!dropMissing) throw new Error("Invalid hero preset reference");
        delete bundle.heroPresets[key]; changed = true;
      }
    });
    return changed;
  }
  function bundleRecord(bundle, sharing) {
    if (!bundle || !Array.isArray(bundle.presets)) throw new Error("Invalid preset bundle");
    if (bundle.presets.length > RECORD.maxPresets) throw new Error("A bundle can contain at most " + RECORD.maxPresets + " presets");
    validateHeroRoutes(bundle);
    var record = { v: version(), k: "bundle", d: sparse(bundle.settings), p: [] };
    writeRules(record, bundle.rules);
    var ids = Object.create(null);
    bundle.presets.forEach(function (preset) {
      if (!preset || typeof preset.id !== "string" || !preset.id || ids[preset.id] || typeof preset.name !== "string") throw new Error("Invalid preset identity");
      if (preset.id === RESERVED_PRESET_ID && !sharing) throw new Error("The default preset id is reserved; import its copy as a user preset first.");
      ids[preset.id] = true;
      var item = metadata(preset, ["settings", "d", "rules", "c"]); item.d = sparse(preset.settings); writeRules(item, preset.rules); record.p.push(item);
    });
    // NEW-tab dismissals (ticket 36) and the colorblind choice are personal and stay out of shared bundle codes.
    var extra = metadata(bundle, sharing ? ["settings", "presets", "rules", "newsDismissed", "colorblind"] : ["settings", "presets", "rules"]);
    if (Object.keys(extra).length) record.b = extra;
    return record;
  }
  function futureDiff(diff) {
    if (!Array.isArray(diff)) return false;
    var flat = diff.length && !Array.isArray(diff[0]);
    return diff.some(function (entry, position) {
      if (flat) {
        if (diff.length % 2 || position % 2) return false;
        entry = [entry, diff[position + 1]];
      }
      if (!Array.isArray(entry) || entry.length !== 2 || !Number.isInteger(entry[0]) || entry[0] < 0) return false;
      return futureEntry(entry[0], entry[1]);
    });
  }
  function futureRules(wire) {
    if (!Array.isArray(wire) || wire.length % 4) return false;
    for (var i = 0; i < wire.length; i += 4)
      if (Number.isInteger(wire[i]) && wire[i] >= 0 && futureEntry(wire[i], wire[i + 3])) return true;
    return false;
  }
  function readRecord(record, kind) {
    if (record.k !== kind) throw new Error("Wrong code kind");
    var newer = record.v > version() || futureDiff(record.d) || futureRules(record.c) ||
      Array.isArray(record.p) && record.p.some(function (item) { return item && (futureDiff(item.d) || futureRules(item.c)); });
    var fromVersion = record.v, upgraded = fromVersion < version();
    if (upgraded) record = upgrade(record, version(), UPGRADE_STEPS);
    var settings = expand(record.d, newer, fromVersion >= COMPACT_FROM), rules = expandRules(record.c, newer);
    var result = { settings: settings, rules: rules, newer: newer };
    if (kind === "bundle") {
      if (!Array.isArray(record.p) || record.p.length > RECORD.maxPresets) throw new Error("A bundle can contain at most " + RECORD.maxPresets + " presets");
      if (record.b !== undefined && (!record.b || typeof record.b !== "object" || Array.isArray(record.b))) throw new Error("Invalid bundle metadata");
      if (record.b && Object.prototype.hasOwnProperty.call(record.b, "rules")) throw new Error("Invalid ability conditions");
      var bundle = metadata(record.b || {}, ["settings", "presets"]), ids = Object.create(null);
      bundle.settings = settings;
      if (Object.keys(rules).length) bundle.rules = rules;
      bundle.presets = record.p.map(function (item) {
        if (!item || typeof item.id !== "string" || !item.id || ids[item.id] || typeof item.name !== "string") throw new Error("Invalid preset identity");
        if (Object.prototype.hasOwnProperty.call(item, "rules")) throw new Error("Invalid ability conditions");
        ids[item.id] = true;
        var preset = metadata(item, ["d", "settings", "rules", "c"]); preset.settings = expand(item.d, newer, fromVersion >= COMPACT_FROM);
        var presetRules = expandRules(item.c, newer); if (Object.keys(presetRules).length) preset.rules = presetRules;
        return preset;
      });
      bundle.presets.forEach(function (preset) {
        if (preset.id !== RESERVED_PRESET_ID) return;
        var id;
        do { id = "user-import-" + Date.now().toString(36) + "-" + String(++importSerial); } while (ids[id]);
        preset.id = id; ids[id] = true;
        if (bundle.heroPresets) Object.keys(bundle.heroPresets).forEach(function (hero) {
          if (bundle.heroPresets[hero] === RESERVED_PRESET_ID) bundle.heroPresets[hero] = id;
        });
        if (bundle.heroDefault === RESERVED_PRESET_ID) bundle.heroDefault = id;
        if (bundle.sourcePresetId === RESERVED_PRESET_ID) bundle.sourcePresetId = id;
        result.canonicalized = true;
      });
      if (upgraded) {
        // Only slots introduced after the record's version can lack deliberate edits.
        // v2 dev records were default-emitting before promotion existed; treat them as v1.
        if (bundle.v2pending || bundle.v2scopes || bundle.presets.some(function (preset) { return preset.v2pending || preset.v2scopes; })) {
          var promote = fromV2() && fromV2().promotePending;
          if (typeof promote !== "function") throw new Error("V2 pending upgrade unavailable");
          promote(bundle,fromVersion);
          bundle.presets.forEach(function (preset) { promote(preset,fromVersion); });
          result.settings = bundle.settings;
          result.migrated = true;
        }
      }
      if (upgraded && fromV2()) {
        [bundle].concat(bundle.presets, bundle.v2scopes || []).forEach(function (item) {
          if (item.v2conditions !== undefined) {
            fromV2().promoteConditions(item, fromVersion); result.migrated = true;
          }
        });
        result.rules = bundle.rules || {};
      }
      if (validateHeroRoutes(bundle, true)) result.canonicalized = true;
      result.bundle = bundle;
    }
    result.message = newer ? "Code from a newer version; settings may differ" : "";
    return result;
  }
  function errorMessage(error) {
    var text = String(error && error.message || error);
    if (/^Invalid (code|record|sparse|or duplicate)/.test(text)) return "That code is incomplete or damaged.";
    if (text === "Invalid settings values" || text === "Invalid settings") return "Some settings cannot be used by this build.";
    if (text === "Wrong code kind") return "Use the matching settings or bundle paste box for this code.";
    if (text === "Unknown setting slot" || text === "Missing record upgrade step") return "This code's version is not supported by this build.";
    if (/^Invalid (preset|bundle)/.test(text)) return "Check the preset names and settings in this bundle.";
    if (/URI malformed|JSON|Unexpected|circular|TypeError/i.test(text)) return "That code or preset bundle could not be read.";
    return text;
  }
  // A bundle code pasted from another player keeps only the fields this build reads (save-security audit
  // 2026-11-02, Claude + Claude Fable 5.1): no other data rides along into the save (IMPORT appends its presets,
  // REPLACE ALL also takes its bundle fields) or into the player's own later exports. Preset names are 1-48
  // characters, trimmed, like rename, SAVE NEW and v2. The v2-migration fields an old code may carry stay
  // (v2pending is copied into the active settings on apply; v2scopes/v2conditions feed the upgrade). The player's
  // own save is read as-is and keeps unknown fields, so a newer build's data survives an older build's save.
  var SHARED_PRESET_KEYS = ["id", "name", "settings", "rules", "v2pending", "v2scopes", "v2conditions"];
  var SHARED_BUNDLE_KEYS = ["settings", "presets", "rules", "heroPresets", "heroDefault", "sourcePresetId", "sourceWasMapped", "v2pending", "v2scopes"];
  function pick(value, keys) {
    var result = {};
    keys.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key]; });
    return result;
  }
  function sharedBundle(result) {
    var source = result.bundle, bundle = pick(source, SHARED_BUNDLE_KEYS);
    bundle.presets = source.presets.map(function (preset) {
      var name = preset.name.trim();
      if (!name || preset.name.length > RECORD.nameMax) throw new Error("Invalid preset name");
      var clean = pick(preset, SHARED_PRESET_KEYS);
      clean.name = name;
      if (preset.hidden === true || preset.hidden === false) clean.hidden = preset.hidden;
      return clean;
    });
    // Baked default fields: only its hidden state, its name override and the next user preset number are read.
    if (Array.isArray(source.hiddenBakedPresetIds))
      bundle.hiddenBakedPresetIds = source.hiddenBakedPresetIds.indexOf(RESERVED_PRESET_ID) >= 0 ? [RESERVED_PRESET_ID] : [];
    var overrides = source.bakedPresetNameOverrides, bakedName = overrides && typeof overrides === "object" && !Array.isArray(overrides) &&
      Object.prototype.hasOwnProperty.call(overrides, RESERVED_PRESET_ID) ? overrides[RESERVED_PRESET_ID] : null;
    if (typeof bakedName === "string" && bakedName.trim() && bakedName.length <= RECORD.nameMax) {
      bundle.bakedPresetNameOverrides = {}; bundle.bakedPresetNameOverrides[RESERVED_PRESET_ID] = bakedName.trim();
    }
    if (Number.isSafeInteger(source.nextUserPresetNumber) && source.nextUserPresetNumber >= 1) bundle.nextUserPresetNumber = source.nextUserPresetNumber;
    result.bundle = bundle;
    return result;
  }
  function attempt(callback) {
    try { var result = callback(); result.ok = true; return result; }
    catch (error) { return { ok: false, message: errorMessage(error) }; }
  }
  // A converted v2 bundle must still fit one save; every supported v2 setting has a v3 slot, so nothing is dropped to fit.
  function fitForSave(result) {
    if (frame(bundleRecord(result.bundle), "HPV2S1").length > RECORD.maxChars) throw new Error(SAVE_TOO_LARGE);
    return result;
  }
  function exportCode(record, cap, message) {
    var code = frame(record, "HPC3");
    if (code.length > cap) throw new Error(message);
    return { code: code };
  }
  // Chat and web copies wrap codes in labels, quotes, backticks, trailing punctuation, line breaks or
  // zero-width characters. Keep only the first code. The HPC3 checksum and v2 JSON still reject real damage.
  function pastedCode(code) {
    if (typeof code !== "string") return code;
    var text = code.replace(/[\u200b-\u200d\u2060\ufeff]/g, "");
    var match = /HPCRP1|HPCR2|HPC3\./i.exec(text);
    if (!match) return code.trim();
    text = text.slice(match.index);
    if (match[0].toUpperCase() === "HPC3.") {
      // Base64url payloads never contain "." or whitespace, so a later "HPC3." starts another code.
      text = text.replace(/\s+/g, "");
      var next = text.slice(5).search(/HPC3\./i);
      if (next >= 0) text = text.slice(0, next + 5);
      var framed = /^HPC3\.([0-9a-fA-F]{8})\.([A-Za-z0-9_-]+)/i.exec(text);
      return framed ? "HPC3." + framed[1].toLowerCase() + "." + framed[2] : text;
    }
    // v2 codes are a tag followed by JSON: stop after the JSON value closes. Raw line breaks and tabs are
    // never valid inside JSON strings, so removing them only undoes wrapping.
    var tag = match[0].toUpperCase(), depth = 0, quoted = false, escaped = false;
    text = tag + text.slice(tag.length).replace(/[\r\n\t]+/g, "");
    for (var i = tag.length; i < text.length; i++) {
      var c = text.charAt(i);
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === "\"") quoted = false; continue; }
      if (c === "\"") quoted = true;
      else if (c === "{" || c === "[") depth++;
      else if ((c === "}" || c === "]") && --depth === 0) return text.slice(0, i + 1);
    }
    return text.trim();
  }
  $.HPColorsV3Codec = Object.freeze({
    RECORD: RECORD, SAVE_TOO_LARGE: SAVE_TOO_LARGE, valuesOf: values,
    checksum: checksum, upgrade: upgrade,
    errorMessage: errorMessage,
    encodeRecord: function (bundle) { return frame(bundleRecord(bundle), "HPV2S1"); },
    decodeLegacyRecord: function (code) { return unframe(code, "HPV2S1", RECORD.maxChars, true).record; },
    classifyRecord: function (code) {
      if (code === null || code === undefined) return { kind: "absent" };
      var parsed;
      try {
        parsed = unframe(code, "HPV2S1", RECORD.maxChars);
        var result = readRecord(parsed.record, "bundle");
        result.kind = result.newer ? "newer" : "valid"; result.sum = parsed.sum; return result;
      } catch (error) {
        // A framed future save is not corruption that an older build may
        // replace, even if the future body cannot be projected at all.
        return { kind: parsed && parsed.record.v > version() ? "newer" : "corrupt",
          message: errorMessage(error) };
      }
    },
  });
  $.HPColorsV3Sharing = Object.freeze({
    exportSettingsCode: function (settings, rules) { return attempt(function () {
      var record = { v: version(), k: "settings", d: sparse(settings) }; writeRules(record, rules);
      return exportCode(record, RECORD.settingsCodeChars, "Settings code exceeds 4,096 characters");
    }); },
    importSettingsCode: function (code, base) { return attempt(function () { code = pastedCode(code); return typeof code === "string" && code.slice(0,5) === "HPCR2" ? fromV2().importSettingsCode(code, base) : readRecord(unframe(code, "HPC3", RECORD.settingsCodeChars).record, "settings"); }); },
    exportBundleCode: function (bundle) { return attempt(function () { return exportCode(bundleRecord(bundle, true), RECORD.bundleCodeChars, "Bundle exceeds 32,768 characters; export fewer presets"); }); },
    importBundleCode: function (code) { return attempt(function () { code = pastedCode(code); return typeof code === "string" && code.slice(0,6) === "HPCRP1" ? fitForSave(fromV2().importBundleCode(code)) : sharedBundle(readRecord(unframe(code, "HPC3", RECORD.bundleCodeChars).record, "bundle")); }); },
  });
})();
