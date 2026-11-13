// Run: node hp_colors_rewrite_v3/mocks/extract-settings.js
// Extracts shipped v2 defaults/bounds and the actual Escape-menu row copy.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../hp_colors_rewrite_v2/panorama');
const contractSource = fs.readFileSync(path.join(root, 'scripts/hp_colors_v2_contract.js'), 'utf8');
const menuSource = fs.readFileSync(path.join(root, 'scripts/hp_colors_v2_menu.js'), 'utf8').replace(/\r\n/g, '\n');
const xml = fs.readFileSync(path.join(root, 'layout/hud_escape_menu.xml'), 'utf8');
const dollar = {};
vm.runInNewContext(contractSource, { $: dollar });
const contract = dollar.HPColorsV2ContractFactory.create();
function literal(source, declaration, end) {
  const start = source.indexOf(declaration);
  if (start < 0) throw Error(`Missing ${declaration}`);
  const finish = source.indexOf(end, start);
  if (finish < 0) throw Error(`Missing end of ${declaration}`);
  return vm.runInNewContext(`(${source.slice(start + declaration.length, finish)})`);
}
const rows = literal(menuSource, 'var SETTING_ROW_IDS = ', ';\n  var formatNoticePending');
const advanced = literal(menuSource, 'var ADVANCED_KEYS = ', ';\n  var advancedKeys');
const sliders = literal(menuSource, 'var SLIDER_CONTROLS = ', ';\n  var COLOR_CONTROLS');
const sliderByKey = Object.fromEntries(sliders.map(slider => [slider.key, slider]));
const tabs = literal(menuSource, 'var CATEGORY_DEFS = ', ';\n\n  var LEGACY_CATEGORY_DEFS');
const pageByKey = {};
for (const category of tabs) for (const tab of category.tabs) for (const key of tab.keys) pageByKey[key] = tab.name;
const html = text => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1] === 'x' ? 2 : 1), entity[1] === 'x' ? 16 : 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
});
const rowCopy = {};
const rowStart = /<Panel id="(HPColors\w+Row)" class="[^"]*HPColorsSettingRow\b/g;
let match;
while ((match = rowStart.exec(xml))) {
  const next = xml.indexOf('<Panel id="', rowStart.lastIndex);
  const fragment = xml.slice(rowStart.lastIndex, next < 0 ? xml.length : next);
  const labels = [...fragment.matchAll(/<Label\b[^>]*text="([^"]*)"[^>]*class="(HPColorsSettingTitle|HPColorsSettingHelp)"/g)];
  const copy = {};
  for (const [, text, cls] of labels) if (!copy[cls]) copy[cls] = html(text);
  if (copy.HPColorsSettingTitle) rowCopy[match[1]] = { name: copy.HPColorsSettingTitle, help: copy.HPColorsSettingHelp || '' };
}
const missing = contract.keys.filter(key => !rows[key] || !rowCopy[rows[key]]);
if (missing.length) throw Error(`Missing v2 row copy/mapping: ${missing.join(', ')}`);
const pxOffsets = /(?:Offset[XY]|^position[XY]$)/;
function pixelFactor(key) {
  if (!pxOffsets.test(key)) return 1;
  // HP-text offsets are already stored in CSS px (design.md:188).
  // Only bar/stamina and ultimate/level offsets use stored tenths.
  return /^(position[XY]|(?:stamina|ult|level)Offset[XY])$/.test(key) ? 0.1 : 1;
}
const round = n => Math.round(n * 100) / 100;
function sideFor(key) {
  if (/^(ally|npcAlly|buildingAlly)/.test(key)) return 'ally';
  if (/^(enemy|readout|stamina|npcEnemy|buildingEnemy)/.test(key) || key === 'barOutlineColor') return 'enemy';
  return 'shared';
}
function partFor(key) {
  if (/^(npc|building|neutral)/.test(key)) return 'Units';
  if (/Name|^name|^playerNames/.test(key)) return 'Name';
  if (/^(readout|allyReadout|hpText)/.test(key)) return 'HP Text';
  if (/^(enemy|ally)(Enabled|Visible|Mode|Low|Mid|High|TeamHigh|Healing|Delta|BulletShield|RatkingArmor)$/.test(key) ||
      /^(bar|allyBar|width|height|position|enabled|damageShake|lowThreshold|highThreshold|hudHealth)/.test(key)) return 'Bar';
  return 'Indicators';
}
const data = contract.keys.map(key => {
  const meta = contract.settingMeta[key], copy = rowCopy[rows[key]], factor = pixelFactor(key);
  const entry = { key, name: copy.name, help: copy.help, page: pageByKey[key] || 'SHARED', part: partFor(key), side: sideFor(key), advanced: advanced.includes(key), type: meta.color ? 'color' : meta.type, default: meta.type === 'number' ? round(contract.defaults[key] * factor) : contract.defaults[key] };
  if (meta.type === 'number') {
    entry.min = round(meta.min * factor);
    entry.max = round(meta.max * factor);
    entry.step = round((sliderByKey[key]?.increment || 1) * factor);
    entry.unit = pxOffsets.test(key) ? 'px' : /(?:Scale|Size|Opacity|Threshold|Darkness|^widthScale$|^heightScale$)/.test(key) ? '%' : '';
    if (/^(nameSize|staminaWidth|staminaHeight|pickupSize|pickupSpacing|enemyKillMarkerWidth|.*OutlineWidth|barOutlineThickness)$/.test(key)) entry.unit = 'px';
    if (/Tilt$/.test(key)) entry.unit = '°';
    if (/Bpm$/.test(key)) entry.unit = 'BPM';
  }
  if (meta.type === 'enum') entry.options = Array.from(meta.options);
  const colorKeywords = entry.type === 'color' && /^#(?:e1|fd|ff[0-6])/i.test(entry.default) ? ' red' : '';
  entry.keywords = `${key.replace(/([A-Z])/g, ' $1')} ${entry.page} ${entry.part} ${entry.side}${colorKeywords}`.toLowerCase();
  return entry;
});
const output = `// Generated from v2 contract.js, menu.js and hud_escape_menu.xml. Run node extract-settings.js.\nwindow.HP_MOCK_SETTINGS = ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync(path.join(__dirname, 'settings.js'), output);
console.log(`Extracted ${data.length} editable settings; ${Object.keys(rowCopy).length} XML rows.`);
