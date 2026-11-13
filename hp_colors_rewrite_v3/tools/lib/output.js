'use strict';
// Reading the generator's JSON inputs and writing (or, with --check, comparing) its outputs.
const fs = require('node:fs');
const path = require('node:path');
const { lf } = require('./layout-compose');

const json = value => JSON.stringify(value, null, 2) + '\n';

// JSON.parse errors do not name the file; this does.
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(text); }
  catch (error) { throw new Error(file + ': invalid JSON: ' + error.message); }
}

// The stale-outputs error is 'Stale <label>: <files>[; <hint>]'. tools/dev.js decides "recompose, do not fail" from
// its first line with isStale(), so the word lives here once.
const STALE_PREFIX = 'Stale ';
const STALE = /^Stale /m;
const isStale = text => STALE.test(text);

// The files of `files` ({ relative: text }) whose copy under `root` is missing or differs (line endings ignored):
// the one answer to "is this output current".
function staleFiles(files, root) {
  return Object.keys(files).filter(relative => {
    const target = path.join(root, relative);
    return !fs.existsSync(target) || lf(fs.readFileSync(target, 'utf8')) !== lf(files[relative]);
  });
}

// Writes each output under `output`, or with check compares it (line endings ignored) and throws on
// the stale ones without writing anything. The error is 'Stale <label>: <files>[; <hint>]'.
function writeOrCheck(files, output, check, { label = 'generated files', hint = '' } = {}) {
  const stale = check ? staleFiles(files, output) : [];
  if (!check) {
    for (const [relative, text] of Object.entries(files)) {
      const target = path.join(output, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text, 'utf8');
    }
  }
  if (stale.length) throw new Error(STALE_PREFIX + label + ': ' + stale.join(', ') + (hint ? '; ' + hint : ''));
}

// The lane CLI shape shared by the variant lanes: no argument or --check runs run(check) and prints the
// line it returns; a verb in `verbs` takes exactly one path argument and returns the lines to print.
// Anything else, or a thrown error, prints (usage) / the message to stderr and sets exit code 1.
function runLaneCli(args, { run, verbs = {}, usage }) {
  try {
    if (args.length === 0 || (args[0] === '--check' && args.length === 1)) console.log(run(args[0] === '--check'));
    else if (Object.hasOwn(verbs, args[0]) && args[1] && args.length === 2) for (const line of verbs[args[0]](path.resolve(args[1]))) console.log(line);
    else throw new Error(usage);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { json, readJson, staleFiles, isStale, writeOrCheck, runLaneCli };
