'use strict';
// Argument parsing and help for the tools. Each tool keeps its own spec (flags, messages), so every CLI still
// accepts the same arguments and words its errors the same way; the loop, the `--flag=value` split and the
// help printer live here once.
const fs = require('node:fs');
const { PROJECT_NAMES, isProject, expandProjects } = require('./projects');

// The help flags nearly every tool takes; spread into a spec's `options`.
const HELP = { '--help': { key: 'help' }, '-h': { key: 'help' } };

// parse(argv, spec) -> opts. `spec`:
//   options     { '--flag': { key, value?, lower?, convert?(raw), apply?(opts, raw) } }; a flag without `value` sets
//               opts[key] = true, a `value` flag reads the next argument (or the text after `=`).
//   defaults    initial opts (copied).
//   equals      accept `--flag=value` (default true).
//   dashGuard   a value that starts with `--` counts as missing (default false: the next argument is taken as is).
//   undefinedValue  a value flag at the end of argv yields undefined instead of an error (the tool checks later).
//   flagValues  `--flag=value` on a flag without a value is an error (default: the text is ignored).
//   once        a value flag given twice is an error.
//   command     the first argument is the command (opts.command) and is not parsed as a flag.
//   messages    { unknown(arg, name), missing(name), bare(arg) }; `bare` rejects arguments not starting with `--`.
function parse(argv, spec) {
  const { options, defaults = {}, equals = true, dashGuard = false, undefinedValue = false, flagValues = false, once = false, command = false, messages = {} } = spec;
  const opts = { ...defaults };
  let start = 0;
  if (command) { opts.command = argv[0]; start = 1; }
  for (let i = start; i < argv.length; i++) {
    const arg = argv[i];
    if (messages.bare && !arg.startsWith('--')) throw new Error(messages.bare(arg));
    const eq = equals ? arg.indexOf('=') : -1;
    const name = eq > 0 && arg.startsWith('--') ? arg.slice(0, eq) : arg;
    const inline = name !== arg;
    const def = Object.hasOwn(options, name) ? options[name] : null;
    if (!def) throw new Error(messages.unknown ? messages.unknown(arg, name) : 'unknown argument ' + arg);
    if (!def.value) {
      if (inline && flagValues) throw new Error(name + ' takes no value');
      opts[def.key] = true;
      continue;
    }
    let raw;
    if (inline) raw = arg.slice(eq + 1);
    else {
      const next = argv[i + 1];
      if (next === undefined ? !undefinedValue : dashGuard && next.startsWith('--')) throw new Error(messages.missing ? messages.missing(name) : name + ' needs a value');
      raw = next;
      i++;
    }
    if (once && Object.hasOwn(opts, def.key)) throw new Error(name + ' given twice');
    if (def.apply) def.apply(opts, raw);
    else opts[def.key] = def.lower ? raw.toLowerCase() : def.convert ? def.convert(raw) : raw;
  }
  return opts;
}

// `--project` words: 'v3, qollock, showrank or all' for messages, 'v3|qollock|showrank|all' for usage lines.
const projectWords = ({ all = true } = {}) => all ? PROJECT_NAMES.join(', ') + ' or all' : PROJECT_NAMES.slice(0, -1).join(', ') + ' or ' + PROJECT_NAMES[PROJECT_NAMES.length - 1];
const projectChoices = ({ all = true } = {}) => PROJECT_NAMES.join('|') + (all ? '|all' : '');

// The lane keys a `--project` value stands for ('all' = every lane); null when it names none.
function project(value, { all = true } = {}) {
  return isProject(value, { all }) ? expandProjects(value) : null;
}

// The tool's usage block: its header comment, lines first..last (1-based, inclusive) with the `// ` prefix removed.
const helpText = (file, first, last) => fs.readFileSync(file, 'utf8').split('\n').slice(first - 1, last).map(line => line.replace(/^\/\/ ?/, '')).join('\n');

// camelCase -> kebab-case, acronym-aware: 'enemyHPBar' -> 'enemy-hp-bar'.
const kebab = key => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

module.exports = { HELP, parse, project, projectWords, projectChoices, helpText, kebab };
