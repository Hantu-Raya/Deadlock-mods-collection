'use strict';
// PRESETS page: the preset library and the share-code panel.
const { image, pascal, esc } = require('./menu-markup');
const { buttonEmitter } = require('./menu-buttons');

function presetsEmitter(writer) {
  const { id, out } = writer;
  const { action } = buttonEmitter(writer);
  function library(depth) {
    out(depth, '<Panel class="HPC3Library">');
    out(depth + 1, '<Panel class="HPC3LibraryHeader">');
    out(depth + 2, `<Label id="${id('HPColorsHeroIdentityLabel')}" class="HPC3Meta" text="NO HERO DETECTED" hittest="false" />`);
    out(depth + 2, '<Panel class="HPC3EntryActions">');
    out(depth + 3, `<TextEntry id="${id('HPColorsPresetNameEntry')}" class="HPC3PresetName" placeholder="PRESET N" maxchars="48" />`);
    action(depth + 3, 'PresetSave', 'SAVE NEW');
    action(depth + 3, 'PresetRestore', 'RESTORE DEFAULT');
    out(depth + 2, '</Panel>');
    out(depth + 2, `<Label id="${id('HPColorsPresetStatus')}" class="HPC3CodeStatus" text="" />`);
    out(depth + 1, '</Panel>');
    out(depth + 1, `<Label id="${id('HPColorsPresetLibraryHeading')}" class="HPC3LibraryHeading" text="LIBRARY · 0/128" hittest="false" />`);
    out(depth + 1, `<Panel id="${id('HPColorsPresetList')}" class="HPC3PresetList">`);
    out(depth + 2, `<Button id="${id('HPColorsPresetDefault')}" class="HPC3PresetTile"><Panel class="HPC3PresetTileFace" hittest="false">${image('icons/icon_gear.vsvg', 'HPC3PresetGear')}<Label id="${id('HPColorsPresetDefaultNameLabel')}" class="HPC3PresetTileName" text="Rewrite Default" hittest="false" /></Panel>${image('icons/icon_checkmark.vsvg', 'HPC3PresetSource')}${image('icons/icon_star_white.vsvg', 'HPC3PresetDefaultMark')}</Button>`);
    out(depth + 1, '</Panel>');
    out(depth + 1, '<Panel class="HPC3PresetToolbar">');
    out(depth + 2, `<TextEntry id="${id('HPColorsPresetSelectedNameEntry')}" class="HPC3PresetName" maxchars="48" />`);
    out(depth + 2, '<Panel class="HPC3PresetActions">');
    for (const word of ['APPLY', 'RENAME', 'UP', 'DOWN', 'COPY', 'DELETE', 'HEROES', 'DEFAULT']) action(depth + 3, 'PresetSelected' + pascal(word.toLowerCase()), word);
    out(depth + 2, '</Panel>');
    out(depth + 1, '</Panel>');
    out(depth, '</Panel>');
  }
  function sharePanel(depth) {
    out(depth, `<Panel id="${id('HPColorsShareSection')}" class="HPC3Share">`);
    out(depth + 1, '<Panel class="HPC3ColumnHeading"><Label class="HPC3ColumnTitle" text="SHARE CODES" /></Panel>');
    // Either box imports either code kind, so both accept the larger bundle length.
    for (const [key, title, help] of [
      ['Settings', 'SETTINGS CODE', 'Your current settings as one code. IMPORT applies a pasted settings code; a bundle code adds its presets instead.'],
      ['Bundle', 'PRESET / BUNDLE CODE', 'IMPORT adds a bundle\'s presets without changing your look; a settings code applies instead. REPLACE ALL replaces the library and current settings after confirmation.']]) {
      const maxchars = 32768;
      out(depth + 1, `<Panel id="${id('HPColors' + key + 'CodeRow')}" class="HPC3Row HPC3CodeRow">`);
      out(depth + 2, '<Panel class="HPC3Copy">');
      out(depth + 3, `<Label class="HPC3RowTitle" text="${title}" hittest="false" />`);
      out(depth + 3, `<Label class="HPC3Help" text="${esc(help)}" hittest="false" />`);
      out(depth + 2, '</Panel>');
      out(depth + 2, '<Panel class="HPC3EntryActions">');
      out(depth + 3, `<TextEntry id="${id('HPColors' + key + 'CodeEntry')}" class="HPC3CodeEntry" maxchars="${maxchars}" />`);
      action(depth + 3, key + 'Copy', 'COPY');
      action(depth + 3, key + 'Import', 'IMPORT');
      if (key === 'Bundle') action(depth + 3, 'BundleReplace', 'REPLACE ALL');
      out(depth + 2, '</Panel>');
      out(depth + 1, '</Panel>');
    }
    out(depth + 1, `<Label id="${id('HPColorsCodeStatus')}" class="HPC3CodeStatus" text="" />`);
    out(depth, '</Panel>');
  }
  return { library, sharePanel };
}

module.exports = { presetsEmitter };
