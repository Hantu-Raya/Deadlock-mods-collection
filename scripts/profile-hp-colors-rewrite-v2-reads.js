'use strict';
// Where a renderer's native reads come from: per-panel/property style, layout and class reads of
// one OLD bar (4,246 HP + 600 shield) over 10 simulated seconds. Synthetic counts, not FPS.
// Usage: node scripts/profile-hp-colors-rewrite-v2-reads.js [stable|active] [top=40]
// HP_COLORS_REWRITE_SOURCE_ROOT profiles another source tree (old-vs-new).
const path = require('node:path');
const Module = require('node:module');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'scripts/validate-hp-colors-rewrite-v2-style.test.js');
const src = fs.readFileSync(file, 'utf8').replace("const test = require('node:test');", 'const test = function () {};') +
  '\nmodule.exports = { makeOwnershipFixture, setEngineLines };\n';
const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file);
const { makeOwnershipFixture, setEngineLines } = m.exports;
const { MockPanel } = require(path.join(root, 'scripts/hp-colors-panorama-test-adapter'));

const mode = process.argv[2] || 'stable';
if (!['stable', 'active'].includes(mode)) throw new Error(`unknown mode ${mode}; use stable or active`);
const top = Number(process.argv[3] || 40);
const sourceRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT) : path.join(root, 'hp_colors_rewrite_v2');
const source = fs.readFileSync(path.join(sourceRoot, 'panorama/scripts/unit_status_v2_colors.js'), 'utf8');
let shield;
const fx = makeOwnershipFixture(['player', 'enemy'], { barMask: 'old' }, ({ primary, inner, fill }) => {
  setEngineLines(primary.FindChildTraverse('UnitHealthbarLines'), 4846, 2);
  shield = inner.add(new MockPanel('unit_healthbar_bullet_shield', { classes: ['HealthAmount', 'HasHealth'], actuallayoutwidth: 0, style: { visibility: 'visible' } }));
  fill.actuallayoutwidth = 69;
  fill.style.clip = 'rect( 0.0%, 87.618652%, 100.0%, 0.0%)';
  shield.style.clip = 'rect( 0.0%, 100.0%, 100.0%, 87.618652%)';
}, null, source);
fx.harness.scheduler.runFor(1000, 1000);
const counts = new Map();
const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
let on = false;
function wrap(panel) {
  if (panel.__wrapped) return; panel.__wrapped = true;
  const style = panel.style;
  const name = panel.id || '(anon)';
  panel.style = new Proxy(style, { get(t, p) { if (on && typeof p === 'string') bump('style ' + name + '.' + p); return t[p]; }, set(t, p, v) { t[p] = v; return true; } });
  for (const key of ['actuallayoutwidth', 'actualxoffset', 'actualyoffset', 'actuallayoutheight']) {
    const d = Object.getOwnPropertyDescriptor(panel, key); let value = panel[key];
    Object.defineProperty(panel, key, { configurable: true, get: () => { if (on) bump('layout ' + name + '.' + key); return d && d.get ? d.get() : value; }, set: (v) => { if (d && d.set) d.set(v); else value = v; } });
  }
  const has = panel.BHasClass.bind(panel);
  panel.BHasClass = (c) => { if (on) bump('class ' + name + '.' + c); return has(c); };
  for (const c of panel.children) wrap(c);
}
wrap(fx.window);
on = true;
for (let t = 0; t < 10000; t += 100) {
  if (mode === 'active') {
    const hp = t % 200 ? 80 : 87.618652;
    fx.fill.style.clip = `rect( 0.0%, ${hp}%, 100.0%, 0.0%)`;
    shield.style.clip = `rect( 0.0%, ${hp + 6}%, 100.0%, ${hp}%)`;
  }
  fx.harness.scheduler.runFor(100, 1000);
}
on = false;
const rows = [...counts].sort((a, b) => b[1] - a[1]);
const total = (kind) => rows.filter(([k]) => k.startsWith(kind)).reduce((s, [, n]) => s + n, 0);
console.log(mode, 'style', total('style'), 'layout', total('layout'), 'class', total('class'));
for (const [k, n] of rows.slice(0, top)) console.log(String(n).padStart(5), k);
