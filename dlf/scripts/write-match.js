"use strict";
// Validates a DLF match file and writes it as the dlf_match.js Panorama global (the banner's and
// ESC menu's defaults; ESC menu edits saved on the observer PC take precedence).
//   node dlf/scripts/write-match.js <match.json> <out dlf_match.js>
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The runtime's own limits (dlf_state.js), so a match file the build accepts is one the HUD keeps.
const S = (() => {
  const $ = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "panorama", "scripts", "dlf", "dlf_state.js"), "utf8"), { $ });
  return $.DLFState;
})();
const MAX_TEXT = S.MAX_TEXT;
const MAX_NUMBER = S.MAX_NUMBER;

function fail(message) {
  throw new Error(`match file: ${message}`);
}

function checkText(value, where) {
  if (typeof value !== "string") fail(`${where} must be a string`);
  if (value.length > MAX_TEXT) fail(`${where} is longer than ${MAX_TEXT} characters`);
}

function checkInt(value, where, max) {
  if (!(Number.isInteger(value) && value >= 0 && value <= max)) fail(`${where} must be an integer 0-${max}`);
}

function checkKeys(object, allowed, where) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`unknown key "${where}${key}"`);
}

function checkObject(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${where} must be an object`);
}

function checkRange(value, where, [min, max]) {
  if (!(Number.isInteger(value) && value >= min && value <= max)) fail(`${where} must be an integer ${min}-${max}`);
}

// Optional: each section and field falls back to the runtime default when left out.
function checkStyle(style) {
  checkObject(style, "style");
  checkKeys(style, S.STYLE_SECTIONS, "style.");
  for (const [section, entry] of Object.entries(style)) {
    checkObject(entry, `style.${section}`);
    checkKeys(entry, ["font", "size", "x", "y", "spacing"], `style.${section}.`);
    if ("font" in entry && !S.FONT_KEYS.includes(entry.font)) fail(`style.${section}.font must be one of ${S.FONT_KEYS.join(", ")}`);
    for (const key of ["size", "x", "y", "spacing"]) {
      if (key in entry) checkRange(entry[key], `style.${section}.${key}`, S.STYLE_LIMITS[section][key]);
    }
  }
}

function checkDev(dev) {
  checkObject(dev, "dev");
  checkKeys(dev, ["debuffs", "debuffPollMs", "logStatus"], "dev.");
  for (const key of ["debuffs", "logStatus"]) if (key in dev && typeof dev[key] !== "boolean") fail(`dev.${key} must be true or false`);
  if ("debuffPollMs" in dev && !S.DEBUFF_POLL_STEPS.includes(dev.debuffPollMs)) {
    fail(`dev.debuffPollMs must be one of ${S.DEBUFF_POLL_STEPS.join(", ")}`);
  }
}

function checkGraph(graph) {
  checkObject(graph, "graph");
  checkKeys(graph, ["show", "first", "every", "size", "x", "y", "line", "fill"], "graph.");
  if ("show" in graph && !S.GRAPH_SHOW.includes(graph.show)) fail(`graph.show must be one of ${S.GRAPH_SHOW.join(", ")}`);
  if ("first" in graph && !S.GRAPH_FIRST.includes(graph.first)) fail(`graph.first must be one of ${S.GRAPH_FIRST.join(", ")}`);
  if ("every" in graph && !S.GRAPH_EVERY.includes(graph.every)) fail(`graph.every must be one of ${S.GRAPH_EVERY.join(", ")}`);
  for (const key of ["size", "x", "y"]) {
    if (key in graph && S.normalizeGraph({ [key]: graph[key] })[key] !== graph[key]) {
      const [min, max, step] = S.GRAPH_LIMITS[key];
      fail(`graph.${key} must be ${min}..${max} in steps of ${step}`);
    }
  }
  if ("line" in graph && !S.GRAPH_LINES.includes(graph.line)) fail(`graph.line must be one of ${S.GRAPH_LINES.join(", ")}`);
  if ("fill" in graph && typeof graph.fill !== "boolean") fail("graph.fill must be true or false");
}

function checkLogo(logo, where) {
  checkObject(logo, where);
  checkKeys(logo, ["url", "scale"], `${where}.`);
  if ("url" in logo && S.cleanUrl(logo.url) === null) fail(`${where}.url must be an http(s) image URL of at most ${S.MAX_URL} characters`);
  if ("scale" in logo) checkRange(logo.scale, `${where}.scale`, S.LOGO_SCALE);
}

function parseMatch(text) {
  const match = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (!match || typeof match !== "object" || Array.isArray(match)) fail("must be a JSON object");
  checkKeys(match, ["season", "match", "seriesFormat", "amber", "sapphire", "style", "dev", "graph", "buys", "cues", "autoSeries"], "");
  if (match.style !== undefined) checkStyle(match.style);
  if (match.dev !== undefined) checkDev(match.dev);
  if (match.graph !== undefined) checkGraph(match.graph);
  if (match.buys !== undefined && !S.BUYS_SHOW.includes(match.buys)) fail(`buys must be one of ${S.BUYS_SHOW.join(", ")}`);
  if (match.cues !== undefined) {
    if (!match.cues || typeof match.cues !== "object" || Array.isArray(match.cues)) fail("cues must be an object");
    checkKeys(match.cues, S.CUE_KINDS, "cues.");
    for (const kind of Object.keys(match.cues)) {
      const allowed = kind === "rift" ? S.RIFT_SHOW : S.CUE_SHOW;
      if (!allowed.includes(match.cues[kind])) fail(`cues.${kind} must be one of ${allowed.join(", ")}`);
    }
  }
  if (match.autoSeries !== undefined && typeof match.autoSeries !== "boolean") fail("autoSeries must be true or false");
  checkInt(match.season, "season", MAX_NUMBER);
  checkInt(match.match, "match", MAX_NUMBER);
  checkText(match.seriesFormat, "seriesFormat");
  for (const key of ["amber", "sapphire"]) {
    const team = match[key];
    if (!team || typeof team !== "object" || Array.isArray(team)) fail(`${key} must be an object`);
    checkKeys(team, ["name", "score", "bans", "logo"], `${key}.`);
    if (team.logo !== undefined) checkLogo(team.logo, `${key}.logo`);
    checkText(team.name, `${key}.name`);
    if (team.score !== null) checkInt(team.score, `${key}.score`, 99);
    if (team.bans !== undefined) {
      if (!Array.isArray(team.bans) || team.bans.length > 3) fail(`${key}.bans must be a list of at most 3 hero IDs`);
      team.bans.forEach((id, slot) => checkInt(id, `${key}.bans[${slot}]`, 1000));
    }
  }
  return match;
}

function matchScript(match) {
  return `// Generated from dlf/match.json by dlf/scripts/write-match.js. Do not edit.\nvar DLF_MATCH = ${JSON.stringify(match, null, 2)};\n`;
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: node write-match.js <match.json> <out.js>");
    process.exit(2);
  }
  fs.writeFileSync(output, matchScript(parseMatch(fs.readFileSync(input, "utf8"))));
}

module.exports = { parseMatch, matchScript };
