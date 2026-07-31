#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".xml",
  ".vtex",
  ".vmat",
  ".vpcf",
  ".vmdl"
]);
const COMPILED_EXTENSIONS = new Set([
  ".vjs_c",
  ".vcss_c",
  ".vxml_c",
  ".vtex_c",
  ".vmat_c",
  ".vpcf_c",
  ".vmdl_c"
]);
const PASSIVE_DISABLED_PATTERN = /(?:hud[_-]?passive[_-]?items[_-]?disabled|passive[_-]?disabled|passiveItems\s*[:=]\s*(?:["']disabled["']|false))/i;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { sourceRoots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root" || argument === "--stage-source" || argument === "--compiled") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail(`Missing value for ${argument}.`);
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else if (argument === "--source-root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail("Missing value for --source-root.");
      options.sourceRoots.push(value);
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
}

function assertExactArray(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    fail(`${label} must equal ${JSON.stringify(expected)}.`);
  }
}

function readJson(filePath, label) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`Cannot read ${label}: ${filePath} (${error.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function validateContracts(contracts) {
  assertObject(contracts, "contracts.json");
  if (contracts.schemaVersion !== 1) fail("contracts.json schemaVersion must be 1.");
  assertObject(contracts.runtime, "contracts.runtime");
  if (contracts.runtime.namespace !== "GameUI.CustomUIConfig().QolLite") fail("contracts.runtime.namespace must be GameUI.CustomUIConfig().QolLite.");
  assertExactArray(contracts.runtime.featureInterface, ["init", "refresh", "destroy"], "contracts.runtime.featureInterface");
  if (contracts.runtime.scheduledCallbacksRequireGeneration !== true) fail("contracts.runtime.scheduledCallbacksRequireGeneration must be true.");
  if (contracts.runtime.renderOnlyChangedValues !== true) fail("contracts.runtime.renderOnlyChangedValues must be true.");
  assertObject(contracts.package, "contracts.package");
  if (contracts.package.output !== "qollite_passive_enabled_dir.vpk") fail("contracts.package.output must be qollite_passive_enabled_dir.vpk.");
  if (contracts.package.passiveItems !== "enabled") fail("contracts.package.passiveItems must be enabled.");
  if (contracts.package.abilitiesOverrideAllowed !== false) fail("contracts.package.abilitiesOverrideAllowed must be false.");
  if (contracts.package.opaqueSourceInputsAllowed !== false) fail("contracts.package.opaqueSourceInputsAllowed must be false.");
}

function validateProvenance(provenance) {
  assertObject(provenance, "provenance.json");
  if (provenance.schemaVersion !== 1) fail("provenance.json schemaVersion must be 1.");
  if (provenance.release !== "2.2") fail("provenance.json release must be 2.2.");
  if (provenance.passiveItems !== "enabled") fail("provenance.json passiveItems must be enabled.");
  assertObject(provenance.stock, "provenance.stock");
  if (provenance.stock.repository !== "SteamTracking/GameTracking-Deadlock") fail("provenance.stock.repository is not pinned to SteamTracking/GameTracking-Deadlock.");
  if (provenance.stock.commit !== "3573cbb746581eccc7752fc2e00c21d4447d72bb") fail("provenance.stock.commit is not the required pinned commit.");
  if (provenance.stock.build !== 6655) fail("provenance.stock.build must be 6655.");
  if (provenance.stock.root !== "game/citadel/pak01_dir/panorama") fail("provenance.stock.root must be game/citadel/pak01_dir/panorama.");
  assertExactArray(provenance.allowedOrigins, ["valve-stock-pinned", "qol-lite-original"], "provenance.allowedOrigins");
  assertObject(provenance.forbiddenInputs, "provenance.forbiddenInputs");
  const forbidden = provenance.forbiddenInputs;
  if (!Array.isArray(forbidden.paths) || forbidden.paths.length === 0 || forbidden.paths.some((entry) => typeof entry !== "string" || !entry)) fail("provenance.forbiddenInputs.paths must be a non-empty string array.");
  if (!Array.isArray(forbidden.sha256) || forbidden.sha256.length === 0 || forbidden.sha256.some((entry) => !/^[a-f0-9]{64}$/.test(entry))) fail("provenance.forbiddenInputs.sha256 must be lowercase SHA-256 values.");
  if (!Array.isArray(forbidden.sourceExtensions) || forbidden.sourceExtensions.length === 0 || forbidden.sourceExtensions.some((entry) => typeof entry !== "string" || !entry.endsWith("_c"))) fail("provenance.forbiddenInputs.sourceExtensions must list compiled extensions ending in _c.");
}

function listFiles(rootPath) {
  if (!fs.existsSync(rootPath)) fail(`Source root does not exist: ${rootPath}`);
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  };
  visit(rootPath);
  return files;
}

function isTextFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function normalRelative(rootPath, filePath) {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function validateSourceRoots(sourceRoots, provenance) {
  const forbiddenHashes = new Set(provenance.forbiddenInputs.sha256);
  const forbiddenPaths = provenance.forbiddenInputs.paths.map((entry) => entry.replace(/\\/g, "/").toLowerCase());
  const forbiddenExtensions = new Set(provenance.forbiddenInputs.sourceExtensions.map((entry) => entry.toLowerCase()));
  let sourceCount = 0;
  for (const sourceRoot of sourceRoots) {
    for (const filePath of listFiles(sourceRoot)) {
      sourceCount += 1;
      const relativePath = normalRelative(sourceRoot, filePath);
      const normalizedPath = relativePath.toLowerCase();
      const extension = path.extname(filePath).toLowerCase();
      const leaf = path.basename(filePath).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(extension)) fail(`Unsupported Panorama source input: ${filePath}`);
      if (forbiddenExtensions.has(extension) || leaf.endsWith("_c")) fail(`Compiled source input is forbidden: ${filePath}`);
      if (/^scripts\/abilities\.vdata/i.test(relativePath) || /\/scripts\/abilities\.vdata/i.test(normalizedPath)) fail(`Abilities source input is forbidden: ${filePath}`);
      if (forbiddenPaths.some((token) => normalizedPath.includes(token))) fail(`Forbidden provenance path token found in source path: ${filePath}`);
      const digest = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
      if (forbiddenHashes.has(digest)) fail(`Forbidden provenance SHA-256 found: ${filePath}`);
      if (!isTextFile(filePath)) continue;
      const text = fs.readFileSync(filePath, "utf8");
      const normalizedText = text.replace(/\\/g, "/").toLowerCase();
      if (forbiddenPaths.some((token) => normalizedText.includes(token))) fail(`Forbidden provenance path token found in source content: ${filePath}`);
      if (PASSIVE_DISABLED_PATTERN.test(text)) fail(`Passive-disabled selector or state found: ${filePath}`);
    }
  }
  if (sourceCount === 0) fail("No source files were found in the supplied source roots.");
}

function validatePassiveCss(stageSource) {
  const panoramaRoot = path.join(stageSource, "panorama");
  const rules = [];
  for (const filePath of listFiles(panoramaRoot)) {
    if (path.extname(filePath).toLowerCase() !== ".css") continue;
    const text = fs.readFileSync(filePath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = rulePattern.exec(text)) !== null) {
      if (/#hud_passive_items\b/.test(match[1])) rules.push({ filePath, body: match[2] });
    }
  }
  if (rules.length !== 1) fail(`#hud_passive_items must have exactly one unambiguous source rule; found ${rules.length}.`);
  const declarations = [...rules[0].body.matchAll(/\bvisibility\s*:\s*([^;]+);/gi)];
  if (declarations.length !== 1 || declarations[0][1].trim().toLowerCase() !== "visible") {
    fail(`#hud_passive_items must have exactly one visibility: visible declaration (${rules[0].filePath}).`);
  }
}

function validateCompiledTree(compiledRoot) {
  for (const filePath of listFiles(compiledRoot)) {
    const relativePath = normalRelative(compiledRoot, filePath);
    const extension = path.extname(filePath).toLowerCase();
    if (!COMPILED_EXTENSIONS.has(extension)) fail(`Unsupported packaged file: ${relativePath}`);
    if (/^scripts\/abilities\.vdata/i.test(relativePath)) fail(`Packaged abilities override is forbidden: ${relativePath}`);
    if (PASSIVE_DISABLED_PATTERN.test(relativePath)) fail(`Passive-disabled packed state is forbidden: ${relativePath}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(options.root || path.join(__dirname, "..", ".."));
  const contracts = readJson(path.join(root, "qollite", "contracts.json"), "contracts.json");
  const provenance = readJson(path.join(root, "qollite", "provenance.json"), "provenance.json");
  validateContracts(contracts);
  validateProvenance(provenance);
  if (options.sourceRoots.length > 0) validateSourceRoots(options.sourceRoots.map((entry) => path.resolve(root, entry)), provenance);
  if (options.stageSource) validatePassiveCss(path.resolve(root, options.stageSource));
  if (options.compiled) validateCompiledTree(path.resolve(root, options.compiled));
  process.stdout.write("QOL Lite provenance validation passed.\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`QOL Lite provenance validation failed: ${error.message}\n`);
  process.exitCode = 1;
}
