(function () {
  'use strict';

  var qolLite = GameUI.CustomUIConfig().QolLite;
  if (!qolLite || !qolLite.Runtime) return;

  var runtime = qolLite.Runtime;
  var controls = null;

  function activateStockTab(buttonId) {
    var button = runtime.find(buttonId);
    if (button && typeof $ !== 'undefined' && $.DispatchEvent) {
      $.DispatchEvent('Activated', button);
    }
  }

  function addShortcut(parent, id, text, tabButtonId) {
    var button = $.CreatePanel('Button', parent, id);
    if (typeof button.AddClass === 'function') button.AddClass('qollite_hero_testing_shortcut');
    if (typeof button.SetPanelEvent === 'function') {
      button.SetPanelEvent('onactivate', function () {
        activateStockTab(tabButtonId);
      });
    }
    var label = $.CreatePanel('Label', button, '');
    label.text = text;
  }

  function init() {
    var stub = runtime.find('hero_testing_stub');
    var tabs = runtime.find('hero_testing_tabs');
    var heroTools = runtime.find('hero_tools');
    var gameRules = runtime.find('game_rules');
    if (!stub || !tabs || !heroTools || !gameRules || typeof $ === 'undefined' || !$.CreatePanel) return;

    controls = runtime.find('QolLiteHeroTestingControls', stub);
    if (controls) return;

    controls = $.CreatePanel('Panel', stub, 'QolLiteHeroTestingControls');
    if (typeof controls.AddClass === 'function') controls.AddClass('qollite_hero_testing_controls');
    addShortcut(controls, 'QolLiteHeroToolsShortcut', 'Hero Tools', 'hero_tools_button');
    addShortcut(controls, 'QolLiteGameRulesShortcut', 'Game Rules', 'game_rules_button');
  }

  runtime.register('heroTesting', {
    init: init,
    refresh: init,
    destroy: function () {
      runtime.cancel('heroTesting');
      if (controls && typeof controls.DeleteAsync === 'function') controls.DeleteAsync(0);
      controls = null;
    },
  });
})();
