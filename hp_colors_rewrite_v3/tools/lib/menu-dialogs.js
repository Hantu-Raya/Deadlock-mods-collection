'use strict';
// The menu's modal dialogs (CREDITS, FEEDBACK, UPDATE AVAILABLE, RESET PAGE, DELETE PRESET, REPLACE BUNDLE,
// HEROES, CONDITION and the color picker), emitted after the editor shell at depth 2. One table row per dialog;
// `dialog` emits the shared Backdrop/Card/notice header/actions/ESC frame and `body` the dialog's own rows at depth 4.
const { SEARCH_ICON, toggleHandles, glyphs, image, esc } = require('./menu-markup');
const { buttonEmitter } = require('./menu-buttons');

function emitDialogs(writer) {
  const { id, out } = writer;
  const { dialogAction, noticeStart, noticeHeaderEnd, escClose } = buttonEmitter(writer);
  // Row: `id` the dialog, `backdrop` / `cardId` / `titleId` optional ids, `icon` the notice icon, `titleDepth` (4 for CONDITION
  // and COLOR, 6 otherwise: emitted indentation only), `actions` {name, text, primary, extra, warning}, `esc` the ESC button key.
  const DIALOGS = [
    {
      id: 'HPColorsCreditsDialog',
      backdrop: 'HPColorsCreditsBackdrop',
      icon: glyphs.HEROES,
      title: 'CREDITS',
      actions: [{ name: 'CreditsClose', text: 'CLOSE' }],
      esc: 'Credits',
      body: () => {
      for (const [key, name, text] of [
        ['Yesdaddy', 'yesdaddy', 'Taking his own time testing my mods and giving alot of Good suggestions'],
        ['Razorrzr', 'razorrzr', 'Critizing my ui and giving a solid gold']]) {
        out(4, '<Panel class="HPC3CreditEntry" hittest="false" hittestchildren="false">');
        out(5, '<Panel class="HPC3CreditHeading" hittest="false">');
        out(6, '<Panel class="HPC3CreditPortrait" hittest="false">');
        out(7, '<Panel class="HPC3HeroCircle" hittest="false" />');
        out(7, `<Image id="${id('HPColorsCredits' + key + 'Portrait')}" class="HPC3HeroPortrait" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
        out(6, '</Panel>');
        out(6, `<Label id="${id('HPColorsCredits' + key + 'Name')}" class="HPC3CreditName" text="${esc(name)}" hittest="false" />`);
        out(5, '</Panel>');
        out(5, `<Label id="${id('HPColorsCredits' + key + 'Text')}" class="HPC3DialogDescription HPC3CreditText" text="${esc(text)}" hittest="false" />`);
        out(4, '</Panel>');
      }
      },
    },
    {
    // Ticket 43: FEEDBACK pops this dialog; the underlined Discord name copies itself, the status line reports it.
      id: 'HPColorsFeedbackDialog',
      backdrop: 'HPColorsFeedbackBackdrop',
      icon: glyphs.FEEDBACK,
      title: 'FEEDBACK',
      actions: [{ name: 'FeedbackClose', text: 'CLOSE' }],
      esc: 'Feedback',
      body: () => {
      out(4, `<Label id="${id('HPColorsFeedbackText')}" class="HPC3DialogDescription" text="If you have any feedback, you can add me on Discord:" hittest="false" />`);
      out(4, `<Button id="${id('HPColorsFeedbackNameButton')}" class="HPC3FeedbackName">${image('icons/icon_discord.vsvg', 'HPC3FeedbackIcon')}<Label text="hanturaya101" hittest="false" /></Button>`);
      // The menu's direct CopyStringToClipboard throws live (ticket 29); the name copies through this unseen
      // entry (focus, select all, TextEntryCopyToClipboard), as Settings/Bundle COPY do.
      out(4, `<TextEntry id="${id('HPColorsFeedbackNameEntry')}" class="HPC3FeedbackEntry" text="hanturaya101" maxchars="32" hittest="false" />`);
      out(4, `<Label id="${id('HPColorsFeedbackStatus')}" class="HPC3DialogDescription HPC3FeedbackStatus" text="" hittest="false" />`);
      },
    },
    {
    // Update notice (ticket 33): text and the DOWNLOAD link come from the hosted latest.json result.
      id: 'HPColorsUpdateDialog',
      backdrop: 'HPColorsUpdateBackdrop',
      icon: glyphs.DOWN,
      title: 'UPDATE AVAILABLE',
      actions: [{ name: 'UpdateDownload', text: 'DOWNLOAD', primary: true, extra: 'HPC3UpdateDownload' }, { name: 'UpdateClose', text: 'CLOSE' }],
      esc: 'Update',
      body: () => {
      out(4, `<Label id="${id('HPColorsUpdateText')}" class="HPC3DialogDescription" text="" hittest="false" />`);
      },
    },
    {
      id: 'HPColorsResetPageDialog',
      icon: 'icons/icon_gear.vsvg',
      title: 'RESET PAGE',
      actions: [{ name: 'ResetPageConfirm', text: 'RESET', primary: true }, { name: 'ResetPageCancel', text: 'CANCEL' }],
      esc: 'ResetPage',
      body: () => {
      out(4, `<Label id="${id('HPColorsResetPageMessage')}" class="HPC3DialogDescription" text="" hittest="false" />`);
      },
    },
    {
      id: 'HPColorsPresetDeleteDialog',
      icon: 'icons/delete_trash.vsvg',
      title: 'DELETE PRESET',
      actions: [{ name: 'PresetDeleteConfirm', text: 'DELETE', primary: true, warning: true }, { name: 'PresetDeleteCancel', text: 'CANCEL' }],
      esc: 'PresetDelete',
      body: () => {
      out(4, `<Label id="${id('HPColorsPresetDeleteMessage')}" class="HPC3DialogDescription" text="" hittest="false" />`);
      },
    },
    {
      id: 'HPColorsBundleReplaceDialog',
      icon: 'icons/icon_copy_paste.vsvg',
      title: 'REPLACE BUNDLE',
      actions: [{ name: 'BundleReplaceConfirm', text: 'REPLACE ALL', primary: true, warning: true }, { name: 'BundleReplaceCancel', text: 'CANCEL' }],
      esc: 'BundleReplace',
      body: () => {
      out(4, `<Label id="${id('HPColorsBundleReplaceMessage')}" class="HPC3DialogDescription" text="" hittest="false" />`);
      },
    },
    {
      id: 'HPColorsHeroDialog',
      icon: glyphs.HEROES,
      titleId: 'HPColorsHeroTitleLabel',
      title: 'HEROES',
      actions: [{ name: 'HeroClose', text: 'DONE', primary: true }],
      esc: 'Hero',
      body: () => {
      out(4, '<Label class="HPC3DialogDescription" text="Use this preset for a hero. Assigning it here replaces any other preset for that hero." hittest="false" />');
      out(4, '<Panel class="HPC3HeroSearch">');
      out(5, `<TextEntry id="${id('HPColorsHeroSearchField')}" class="HPC3PresetName" placeholder="Search heroes" maxchars="80" />`);
      out(5, `<Image class="HPC3SearchFieldIcon" src="${SEARCH_ICON}" hittest="false" />`);
      out(4, '</Panel>');
      out(4, `<Label id="${id('HPColorsHeroMatchCount')}" class="HPC3Meta" text="" hittest="false" />`);
      out(4, `<Panel id="${id('HPColorsHeroList')}" class="HPC3HeroGrid" />`);
      },
    },
    {
      id: 'HPColorsConditionDialog',
      icon: 'icons/icon_gear.vsvg',
      titleId: 'HPColorsConditionTitle',
      title: 'CONDITION',
      titleDepth: 4,
      actions: [{ name: 'ConditionApply', text: 'APPLY', primary: true }, { name: 'ConditionRemove', text: 'REMOVE' }, { name: 'ConditionCancel', text: 'CANCEL' }],
      esc: 'Condition',
      body: () => {
      out(4, `<Label id="${id('HPColorsConditionSubtitle')}" class="HPC3DialogSubtitle" text="" hittest="false" />`);
      out(4, '<Label class="HPC3DialogDescription" text="Use this value after YOUR signature ability reaches the chosen tier. Click the selected slot to cycle tier 1–3." hittest="false" />');
      out(4, '<Panel class="HPC3ConditionAbilities">');
      for (let slot = 1; slot <= 4; slot++) {
        const prefix = 'HPColorsConditionSlot' + slot;
        out(5, `<Button id="${id(prefix)}" class="HPC3AbilitySlot" hittestchildren="false">`);
        // Stock hud_ability_icon.css stack, one 104px box: tier art (passive_2/3), ring (passive_1), disc (passive_0), glyph.
        out(6, `<Panel id="${id(prefix + 'TierArt')}" class="HPC3AbilityLayer HPC3AbilityTierArt" hittest="false" />`);
        out(6, `<Panel id="${id(prefix + 'Ring')}" class="HPC3AbilityLayer HPC3AbilityRing" hittest="false" />`);
        out(6, `<Panel id="${id(prefix + 'Disc')}" class="HPC3AbilityLayer HPC3AbilityDisc" hittest="false" />`);
        out(6, '<Panel class="HPC3AbilityGlyph" hittest="false">');
        out(7, `<Image id="${id(prefix + 'Image')}" class="HPC3AbilityImage" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
        out(7, `<Label id="${id(prefix + 'FallbackLabel')}" class="HPC3AbilityFallback" text="${slot}" hittest="false" />`);
        out(6, '</Panel>');
        out(6, '<Panel class="HPC3AbilityBadge" hittest="false">');
        out(7, `<Label id="${id(prefix + 'NumberLabel')}" text="${slot}" hittest="false" />`);
        out(6, '</Panel>');
        out(6, `<Label id="${id(prefix + 'Label')}" class="HPC3AbilityTier" text="" hittest="false" />`);
        out(5, '</Button>');
      }
      out(4, '</Panel>');
      out(4, `<Button id="${id('HPColorsConditionBooleanToggle')}" class="HPC3Toggle">${toggleHandles}</Button>`);
      out(4, `<Panel id="${id('HPColorsConditionOptions')}" class="HPC3PresetActions" />`);
      out(4, `<Panel id="${id('HPColorsConditionNumber')}" class="HPC3SliderGroup">`);
      out(5, `<Slider id="${id('HPColorsConditionNumberSlider')}" class="HPC3Slider HorizontalSlider" direction="horizontal" />`);
      out(5, '<Panel class="HPC3NumberValue">');
      out(6, `<Panel class="HPC3EntryBox"><TextEntry id="${id('HPColorsConditionNumberEntry')}" class="HPC3NumberEntry" maxchars="8" /></Panel>`);
      out(6, `<Label id="${id('HPColorsConditionNumberUnit')}" class="HPC3Unit" text="" hittest="false" />`);
      out(5, '</Panel>');
      out(4, '</Panel>');
      out(4, `<Panel id="${id('HPColorsConditionColor')}" class="HPC3PresetActions">`);
      out(5, `<Button id="${id('HPColorsConditionSwatch')}" class="HPC3Swatch" />`);
      out(5, `<TextEntry id="${id('HPColorsConditionHex')}" class="HPC3Hex" maxchars="7" />`);
      out(4, '</Panel>');
      out(4, `<Label id="${id('HPColorsConditionStatus')}" class="HPC3DialogDescription" text="" hittest="false" />`);
      },
    },
    {
      id: 'HPColorsPickerDialog',
      cardId: 'HPColorsPickerCard',
      icon: 'icons/icon_gear.vsvg',
      titleId: 'HPColorsPickerTitle',
      title: 'COLOR',
      titleDepth: 4,
      actions: [{ name: 'PickerDone', text: 'DONE', primary: true }, { name: 'PickerCancel', text: 'CANCEL' }],
      esc: 'Picker',
      body: () => {
      out(4, `<CitadelColorPicker id="${id('HPColorsNativePicker')}" class="HPC3NativePicker" />`);
      out(4, `<TextEntry id="${id('HPColorsPickerHex')}" class="HPC3Hex" maxchars="7" />`);
      out(4, `<Label id="${id('HPColorsPickerStatus')}" class="HPC3DialogDescription" text="Escape restores the opening color." hittest="false" />`);
      },
    },
  ];
  for (const dialog of DIALOGS) {
    out(2, `<Panel id="${id(dialog.id)}" class="HPC3Dialog">`);
    out(3, `<Button${dialog.backdrop ? ` id="${id(dialog.backdrop)}"` : ''} class="HPC3DialogBackdrop" hittest="true" />`);
    out(3, `<Panel${dialog.cardId ? ` id="${id(dialog.cardId)}"` : ''} class="HPC3DialogCard">`);
    noticeStart(4, dialog.icon);
    out(dialog.titleDepth || 6, `<Label${dialog.titleId ? ` id="${id(dialog.titleId)}"` : ''} class="HPC3DialogTitle" text="${dialog.title}" hittest="false" />`);
    noticeHeaderEnd(5);
    dialog.body();
    out(4, '<Panel class="HPC3PresetActions">');
    for (const action of dialog.actions) dialogAction(5, action);
    out(4, '</Panel>');
    escClose(4, dialog.esc);
    out(4, '</Panel>');
    out(3, '</Panel>');
    out(2, '</Panel>');
  }
}

module.exports = { emitDialogs };
