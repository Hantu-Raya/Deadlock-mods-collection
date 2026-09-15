'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  throw new Error(`[HPV2/ThirdEye window patch] ${message}`);
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function readText(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) fail(`${label} not found: ${filePath || '(empty)'}`);
  return fs.readFileSync(filePath, 'utf8');
}

function replaceOnce(text, pattern, replacement, label) {
  const matches = text.match(pattern);
  if (!matches || matches.length !== 1) {
    fail(`${label}: expected exactly one match, found ${matches ? matches.length : 0}`);
  }
  return text.replace(pattern, replacement);
}

const ESCAPE_HOOK = `    function _hpColorsHandleEscape()\n    {\n        // HP nested dialogs have precedence over Third Eye and resume.\n        if (typeof $.HPColorsMenuCancel === "function") {\n            try {\n                if ($.HPColorsMenuCancel()) { return true; }\n            } catch (e) {\n                $.Msg("[third-eye] window: HP Colors cancel failed --- event consumed");\n                return true;\n            }\n        }\n\n        // The bridge owns the stable cross-script close API. A local fallback\n        // keeps this source safe when the bridge is absent or stripped.\n        if (typeof $["HPColorsThirdEyeCloseWindow"] === "function") {\n            try {\n                if ($["HPColorsThirdEyeCloseWindow"]()) { return true; }\n            } catch (e2) {\n                $.Msg("[third-eye] window: bridge close failed --- event consumed");\n                return true;\n            }\n        }\n        if (isOpen()) {\n            setOpen(false);\n            return true;\n        }\n        return false;\n    }\n\n    function _hpColorsResume(context)\n    {\n        try {\n            $.DispatchEvent("CitadelResumePlaying", context || $.GetContextPanel());\n        } catch (e) {}\n    }\n\n    // -- Escape menu hooks --\n\n    var _hookedEscapeMenu = null;\n    var _hookedEscapeBackground = null;\n\n    function _hookEscapeMenu()\n    {\n        // Find the EM root and EscapeBackground from the panel tree.\n        var root = thirdEye.core.panel.findRoot();\n        if (!root) { return; }\n\n        var em = root.FindChildTraverse("EscapeMenu");\n        if (em && thirdEye.core.panel.isAlive(em) && typeof em.SetPanelEvent === "function") {\n            // Esc: HP nested cancel, then Third Eye close, then resume.\n            if (_hookedEscapeMenu !== em) {\n                em.SetPanelEvent("oncancel", function()\n                {\n                    if (!_hpColorsHandleEscape()) {\n                        _hpColorsResume($.GetContextPanel());\n                    }\n                });\n                _hookedEscapeMenu = em;\n            }\n        }\n\n        var bg = root.FindChildTraverse("EscapeBackground");\n        if (bg && thirdEye.core.panel.isAlive(bg) && typeof bg.SetPanelEvent === "function") {\n            // Backdrop click follows the same nested-modal and close order.\n            if (_hookedEscapeBackground !== bg) {\n                bg.SetPanelEvent("onactivate", function()\n                {\n                    if (!_hpColorsHandleEscape()) {\n                        _hpColorsResume($.GetContextPanel());\n                    }\n                });\n                _hookedEscapeBackground = bg;\n            }\n        }\n    }\n\n    // -- Boot --`;

function patchWindowSource(source, { sourceHash, marker = '' } = {}) {
  if (!source || typeof source !== 'string') fail('window source must be text');
  const actualHash = sha256Text(source);
  if (sourceHash && actualHash !== String(sourceHash).toLowerCase()) {
    fail(`pinned ThirdEye window.js drifted: expected ${sourceHash} actual ${actualHash}`);
  }
  if (!source.includes('function _hookEscapeMenu()')) fail('pinned source has no Escape hook');
  if (!source.includes('thirdEye.ui.window = {')) fail('pinned source has no stable window export');
  if (!source.includes('MAX_BOOT_ATTEMPTS')) fail('pinned source has no finite boot retry guard');

  let patched = replaceOnce(
    source,
    /    function _hookEscapeMenu\(\)\r?\n[ \t]*\{[\s\S]*?\r?\n[ \t]*\}[ \t]*\r?\n\r?\n    \/\/ -- Boot --/,
    ESCAPE_HOOK,
    'ThirdEye Escape lifecycle hook',
  );

  patched = replaceOnce(
    patched,
    /    thirdEye\.ui\.window = \{\r?\n        setOpen: setOpen,\r?\n        toggle: toggle,\r?\n        isOpen: isOpen,\r?\n    \};/,
    '    thirdEye.ui["window"] = {\n        "setOpen": setOpen,\n        "toggle": toggle,\n        "isOpen": isOpen,\n    };',
    'stable ThirdEye window export',
  );

  const header = [
    '/* Generated from pinned Third Eye window.js',
    ` * SHA-256 ${sourceHash || actualHash}.`,
    ` * ${marker || 'HPv2 compatibility lifecycle patch'}. */`,
  ].join('\n');
  patched = `${header}\n${patched.trimStart()}`;

  if (patched.includes('s2r://') || /SetPanelEvent\s*=\s*function/.test(patched)) {
    fail('patched window contains an unsupported interception or asset mutation');
  }
  if (!patched.includes('HPColorsMenuCancel')) fail('patched window lost HP Colors cancel composition');
  if (!patched.includes('HPColorsThirdEyeCloseWindow')) fail('patched window lost stable bridge close call');
  if (!patched.includes('var _hookedEscapeMenu = null')) fail('patched window lost idempotent Escape hook guard');
  return `${patched.replace(/(?:\r?\n)+$/, '')}\n`;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) fail(`unknown positional argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) fail('usage: --input <source> --output <patched> [--sha256 <hash>]');
  const source = readText(args.input, 'Pinned ThirdEye window source');
  const output = patchWindowSource(source, { sourceHash: args.sha256, marker: args.marker });
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, output, 'utf8');
  console.log(`[HPV2/ThirdEye window patch] wrote ${path.resolve(args.output)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  patchWindowSource,
  sha256Text,
};
