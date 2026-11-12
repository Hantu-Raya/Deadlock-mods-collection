'use strict';
// Glyph/text action buttons, dialog buttons and the shared notice-card header used by the dialogs.
const { glyphs, image, esc } = require('./menu-markup');

function buttonEmitter({ id, out }) {
  function action(depth, name, text) {
    const glyph = glyphs[text];
    out(depth, `<Button id="${id('HPColors' + name + 'Button')}" class="${glyph ? 'InputButtonBorderRadius HPC3GlyphButton' + (text === 'APPLY' ? ' Fill CTA' : '') : 'SecondaryButton light HPC3ActionButton'}" tooltip="${esc(text)}">${glyph ? '<Panel class="Bottom" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Top" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Content" hittest="false">' + image(glyph, 'HPC3Glyph') + '</Panel>' : `<Label text="${esc(text)}" hittest="false" />`}</Button>`);
  }
  function dialogAction(depth, name, text, primary = false, extra = '') {
    const warning = name === 'PresetDeleteConfirm' || name === 'BundleReplaceConfirm';
    out(depth, `<Button id="${id('HPColors' + name + 'Button')}" class="${primary ? 'InputButtonBorderRadius Fill ' + (warning ? 'Warning' : 'CTA') : 'InputButton Fill'} HPC3DialogButton${extra ? ' ' + extra : ''}"><Panel class="Bottom" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Top" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Content" hittest="false"><Label text="${esc(text)}" hittest="false" /></Panel></Button>`);
  }
  function noticeStart(depth, icon) {
    out(depth, '<Panel class="HPC3NoticeShadow" hittest="false" />');
    out(depth, '<Panel class="HPC3NoticeBg" hittest="false" />');
    out(depth, '<Panel class="HPC3NoticeContent">');
    out(depth + 1, '<Panel class="HPC3NoticeHeader">');
    out(depth + 2, image(icon, 'HPC3NoticeIcon'));
  }
  function noticeHeaderEnd(depth) { out(depth, '</Panel>'); }
  function escClose(depth, key) {
    out(depth, `<Button id="${id('HPColors' + key + 'EscClose')}" class="HPC3EscClose"><Label class="HPC3EscKey" text="ESC" hittest="false" /><Label class="HPC3EscCloseLabel" text="CLOSE" hittest="false" /></Button>`);
  }
  return { action, dialogAction, noticeStart, noticeHeaderEnd, escClose };
}

module.exports = { buttonEmitter };
