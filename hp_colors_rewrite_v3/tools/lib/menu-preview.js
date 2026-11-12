'use strict';
// The menu's live preview pane.
const { esc } = require('./menu-markup');
const { OVERLAY_PARTS } = require('./stock-layouts');

// previewPane(depth) emits the preview; release is shown in its footer.
function previewPaneEmitter({ id, out }, release) {
  // Preview (ticket 09): a fake unit-status tree with the world lineage
  // (WindowRoot > UnitStatus > InfoHealthContainer > UnitHealthbarsContainer > UnitHealthbar > UnitHealthbarInner)
  // and the v3 owned frame, all under HPColorsPreview ids. No stock ids and no carrier classes:
  // the renderer reads carrier classes from data held by the preview script.
  function previewPane(depth) {
    const segment = (d, key, options) => {
      out(d, `<Panel id="${id('HPColorsPreview' + key + 'Segment')}" class="HPC3PreviewSegment HPC3Preview${key}Segment">`);
      options.forEach(([value, label], index) => out(d + 1, `<Button id="${id('HPColorsPreview' + key + 'Option' + value)}" class="SecondaryButton light HPC3PreviewPill${index ? '' : ' fill Selected'}"><Label text="${label}" hittest="false" /></Button>`));
      out(d, '</Panel>');
    };
    out(depth, `<Panel id="${id('HPColorsPreview')}" class="HPC3Preview HPC3PreviewKindHero HPC3PreviewSideEnemy">`);
    out(depth + 1, `<Label id="${id('HPColorsPreviewTitle')}" class="HPC3PreviewTitle" text="HERO · ENEMY" hittest="false" />`);
    // Ticket 35: side and session-only team (Amber/Sapphire) share one row, so the plate does not move.
    out(depth + 1, '<Panel class="HPC3PreviewSegmentRow">');
    segment(depth + 2, 'Side', [['Enemy', 'ENEMY'], ['Ally', 'ALLY']]);
    segment(depth + 2, 'Team', [['Amber', 'AMBER'], ['Sapphire', 'SAPPHIRE']]);
    out(depth + 1, '</Panel>');
    segment(depth + 1, 'Kind', [['Neutral', 'NEUTRAL'], ['Objective', 'OBJECTIVE']]);
    out(depth + 1, `<Panel id="${id('HPColorsPreviewPlate')}" class="HPC3PreviewPlate" hittest="false" hittestchildren="false">`);
    out(depth + 2, `<Panel id="${id('HPColorsPreviewSceneWindow')}" class="HPC3PreviewSceneWindow" hittest="false" hittestchildren="false">`);
    out(depth + 3, `<Image id="${id('HPColorsPreviewBackdrop')}" class="HPC3PreviewBackdrop" src="s2r://panorama/images/buttons/temp_preview_panel_subtitles_png.vtex" scaling="stretch-to-cover-preserve-aspect" hittest="false" />`);
    out(depth + 3, `<Panel id="${id('HPColorsPreviewStage')}" class="HPC3PreviewStage" hittest="false" hittestchildren="false">`);
    // Ticket 22c: static Infernus model behind the bar, shop pose (user choice). Live checks 1-4: heroid="1" is
    // the key attribute (heroname alone drew nothing). Live 1:1: client.dll 6785 has no renderdeferred/antialias
    // scene-panel attribute and the live strip drew without them, so only the needed set is emitted.
    // CSS shows it only for the HERO kind with the menu open; no JS touches it.
    // Live check 8: a scene render ignores scissor clipping (overflow: clip, clip: rect()) but is clipped by a
    // parent on its own composition layer; the plate-sized scene window owns the brush/mask, not the stage.
    out(depth + 4, `<Panel id="${id('HPColorsPreviewHeroFrame')}" class="HPC3PreviewHeroFrame" hittest="false">`);
    out(depth + 5, `<CitadelHeroScenePanelNew id="${id('HPColorsPreviewHeroModel')}" class="HPC3PreviewHeroModel" heroname="hero_inferno" heroid="1" heroscenestyle="Shop" map="maps/ui/hero_shop/inferno_shop.vmap" camera="point_camera" rendershadows="false" rotate="None" hittest="false" />`);
    out(depth + 4, '</Panel>');
    const node = (key, className, children, type, text) => [key, className, children, type, text];
    const layers = ['Fill', 'Healing', 'Shield', 'Armor', 'Delta'].map(part => node('Bar' + part, 'HPC3PreviewBarLayer HPC3PreviewBar' + part, []));
    layers.push(node('BarVisualFill', 'HPC3PreviewBarLayer HPC3PreviewBarFill HPC3PreviewBarVisualFill', []));
    layers.push(node('PulseOverlay', 'HPColorsV3PulseOverlay HPC3PreviewPulseOverlay', []));
    // Same OLD grid order as the world overlay; the renderer creates its boxes on first OLD paint.
    const pipGrid = node('PipGrid', 'HPC3PreviewPipGrid', OVERLAY_PARTS.pipLayers
      .map(name => node('Pip' + name, 'HPC3PreviewPipLayer', [])));
    // No stock .healthbar_border: the 6839 world layout has no such panel, and its slanted frame art read as a
    // dark band through unit samples (yesdaddy, 2026-11-02).
    const bar = node('Bar', 'HPC3PreviewBar', [node('BarBg', 'HPC3PreviewBarBg', []),
      node('BarInner', 'HPC3PreviewBarInner', layers), node('BarLines', 'HPC3PreviewBarLines', []), node('BarOutline', 'HPC3PreviewBarOutline', []), node('KillMarker', 'HPC3PreviewKillMarker', []), pipGrid]);
    const ult = node('UltPanel', 'HPC3PreviewUltPanel', [node('UltBackground', 'HPC3PreviewUltBackground',
      [node('UltReady', 'HPC3PreviewUltReady', [], 'Image')])]);
    const level = node('Level', 'HPC3PreviewLevel', [node('LevelLabel', 'HPC3PreviewLevelLabel', null, 'Label', '19')]);
    const info = node('Info', 'HPC3PreviewInfo', [level, node('Bars', 'HPC3PreviewBars', [bar]), ult, node('HpText', 'HPC3PreviewHpText', null, 'Label', '750')]);
    // The readout and bounty trees come from the world overlay's table (stock-layouts OVERLAY_PARTS), under preview ids.
    const mirror = part => node(part.preview || part.key, part.previewCls || part.cls, part.children ? part.children.map(mirror) : null, part.label ? 'Label' : undefined, part.text);
    const [readout] = OVERLAY_PARTS.readout.map(mirror);
    const stamina = node('Stamina', 'HPC3PreviewStamina StaminaRecentlyUsed', [1, 2, 3].map(i =>
      node('StaminaPip' + i, 'StaminaPip' + (i === 3 ? ' PipEmpty' : ''),
        [node('StaminaIcon' + i, 'StaminaPipIcon', [])])));
    // The game's status-effect row: one ordinary debuff at the stock 30px size (live 6839 comparison, user
    // 2026-11-02: the preview showed only 22px pickups), then the four pickup samples.
    const effect = node('Effect', 'HPC3PreviewEffect', [node('EffectBorder', 'HPC3PreviewEffectBorder', []), node('EffectInner', 'HPC3PreviewEffectInner', []),
      node('EffectGlyph', 'HPC3PreviewEffectGlyph', []), node('EffectStacks', 'HPC3PreviewEffectStacks', null, 'Label', '3')]);
    const pickups = node('Pickups', 'HPC3PreviewPickups', [effect].concat(['Gun', 'Movement', 'Spirit', 'Survival'].map((name, i) =>
      node('Pickup' + name, 'HPC3PreviewPickup ' + ['gunpower_pickup', 'movement_pickup', 'casting_pickup', 'survival_pickup'][i], [
        node('Pickup' + name + 'Inner', 'HPC3PreviewPickupInner', []),
        node('Pickup' + name + 'Track', 'HPC3PreviewPickupTrack', []),
        node('Pickup' + name + 'Border', 'HPC3PreviewPickupBorder', []),
        node('Pickup' + name + 'Glyph', 'HPC3PreviewPickupGlyph statusEffectImage', [], 'Image')])),
      // Ticket 52: the status effect whose size slider moved last, added at the right to compare with the others.
      // The preview script gives it the game's own icon class, so the world stylesheet's size rule applies to it.
      [node('Fx', 'HPC3PreviewFx', [node('FxBorder', 'HPC3PreviewEffectBorder HPC3PreviewFxBorder', []), node('FxInner', 'HPC3PreviewEffectInner HPC3PreviewFxInner', []),
        node('FxGlyph', 'HPC3PreviewFxGlyph', []), node('FxStacks', 'HPC3PreviewEffectStacks', null, 'Label', '3')])]));
    // SHOW BOUNDS outline (ticket 22): the canvas-sized rim sits outside the motion frame, like the world bar's.
    const tree = [node('Scale', 'HPC3PreviewScale', [node('Canvas', 'HPC3PreviewCanvas ShowCriticalState', [node('CanvasBounds', 'HPC3PreviewCanvasBounds', []),
      node('Name', 'HPC3PreviewName', null, 'Label', 'Infernus'),
      node('Motion', 'HPC3PreviewMotion', [readout]), node('UnitStatus', 'HPC3PreviewUnitStatus', [info]), stamina, pickups,
      node('KillStreak', 'HPC3PreviewKillStreak', [node('KillStreakImage', 'HPC3PreviewKillStreakImage', [])]),
      node('RejuvenatorAnchor', 'HPC3PreviewRejuvenatorAnchor', []), node('Rejuvenator', 'HPC3PreviewRejuvenator', []),
      ...OVERLAY_PARTS.statusLabels.flatMap(name => [
        node(name + 'Anchor', 'HPColorsV3StatusLabelAnchor', []),
        node(name + 'Indicator', 'HPC3Preview' + name + 'Indicator', [node(name + 'Label', '', null, 'Label', '#Citadel_Hud_' + name)])]),
      // Kill bounty (ticket 50): same classes as the world pill; the renderer writes the sample text.
      ...OVERLAY_PARTS.bounty.map(mirror)])])];
    (function emit(d, nodes) {
      for (const [key, className, children, type, text] of nodes) {
        const tag = type || 'Panel';
        const attrs = `id="${id('HPColorsPreview' + key)}" class="${className}"` + (text ? ` text="${text}"` : '') + ' hittest="false"';
        if (!children || !children.length) { out(d, `<${tag} ${attrs} />`); continue; }
        out(d, `<${tag} ${attrs}>`);
        emit(d + 1, children);
        out(d, `</${tag}>`);
      }
    })(depth + 4, tree);
    out(depth + 3, '</Panel>');
    out(depth + 2, '</Panel>');
    out(depth + 1, '</Panel>');
    out(depth + 1, '<Panel class="HPC3PreviewHealthHead">');
    out(depth + 2, '<Label class="HPC3PreviewHealthLabel" text="Health" hittest="false" />');
    out(depth + 2, `<Slider id="${id('HPColorsPreviewHealthSlider')}" class="HPC3Slider HPC3PreviewHealthSlider HorizontalSlider" direction="horizontal" />`);
    out(depth + 2, `<Label id="${id('HPColorsPreviewHealthValue')}" class="HPC3PreviewHealthValue" text="75%" hittest="false" />`);
    out(depth + 1, '</Panel>');
    out(depth + 1, `<Button id="${id('HPColorsPreviewPlay')}" class="SecondaryButton light fill HPC3PlayButton"><Label id="${id('HPColorsPreviewPlayLabel')}" text="PLAY DAMAGE / HEAL" hittest="false" /></Button>`);
    out(depth + 1, `<Label id="${id('HPColorsPreviewStatus')}" class="HPC3PreviewStatus" text="" hittest="false" />`);
    out(depth + 1, `<Label id="${id('HPColorsPreviewNote')}" class="HPC3PreviewNote" text="Plain, not-targeted sample. The view adapts to the selected unit and settings; world scale varies." hittest="false" />`);
    // Bottom stack: footer (CREDITS, FEEDBACK, DONATE, version) above the supporter strip; a collapsed strip leaves the footer at the bottom.
    out(depth + 1, `<Panel id="${id('HPColorsPreviewBottom')}" class="HPC3PreviewBottom">`);
    out(depth + 2, `<Panel id="${id('HPColorsPreviewFooter')}" class="HPC3PreviewFooter">`);
    out(depth + 3, `<Button id="${id('HPColorsPreviewCreditsButton')}" class="SecondaryButton light HPC3CreditsButton"><Label text="CREDITS" hittest="false" /></Button>`);
    out(depth + 3, `<Button id="${id('HPColorsPreviewFeedbackButton')}" class="SecondaryButton light HPC3CreditsButton"><Label text="FEEDBACK" hittest="false" /></Button>`);
    out(depth + 3, `<Button id="${id('HPColorsPreviewDonateButton')}" class="SecondaryButton light HPC3CreditsButton"><Label text="DONATE" hittest="false" /></Button>`);
    out(depth + 3, `<Label id="${id('HPColorsPreviewVersion')}" class="HPC3PreviewVersion" text="${esc('v' + release)}" hittest="false" />`);
    out(depth + 2, '</Panel>');
    out(depth + 2, `<CitadelHTMLPanel id="${id('HPColorsSupporterStrip')}" class="HPC3SupporterStrip" hittest="false" hittestchildren="false" acceptsfocus="false" />`);
    out(depth + 1, '</Panel>');
    out(depth, '</Panel>');
  }
  return previewPane;
}

module.exports = { previewPaneEmitter };
