const fs = require('fs');
const path = require('path');
const vm = require('vm');

function panel(id, parent) {
  return {
    id,
    parent,
    children: [],
    events: {},
    text: '',
    deleted: false,
    GetParent() { return this.parent; },
    FindChildTraverse(target) {
      if (this.id === target) return this;
      for (const child of this.children) {
        const found = child.FindChildTraverse(target);
        if (found) return found;
      }
      return null;
    },
    SetPanelEvent(name, callback) { this.events[name] = callback; },
    AddClass() {},
    DeleteAsync() {
      this.deleted = true;
      this.parent.children = this.parent.children.filter((child) => child !== this);
    },
  };
}

const source = fs.readFileSync(path.join(process.cwd(), 'qollite/panorama/scripts/qollite_hero_testing.js'), 'utf8');
const root = panel('root');
const stub = panel('hero_testing_stub', root);
const tabs = panel('hero_testing_tabs', stub);
const heroTools = panel('hero_tools', stub);
const gameRules = panel('game_rules', stub);
const heroToolsButton = panel('hero_tools_button', tabs);
const gameRulesButton = panel('game_rules_button', tabs);
root.children.push(stub);
stub.children.push(tabs, heroTools, gameRules);
tabs.children.push(heroToolsButton, gameRulesButton);
const stockChildren = {
  tabs: tabs.children.length,
  heroTools: heroTools.children.length,
  gameRules: gameRules.children.length,
};
const features = {};
const activated = [];
const context = {
  $: {
    CreatePanel(type, parent, id) {
      const created = panel(id, parent);
      created.type = type;
      parent.children.push(created);
      return created;
    },
    DispatchEvent(name, target) { activated.push({ name, target: target.id }); },
  },
  GameUI: {
    CustomUIConfig() {
      return {
        QolLite: {
          Runtime: {
            find(id, from) { return (from || root).FindChildTraverse(id); },
            cancel() {},
            register(name, feature) { features[name] = feature; },
          },
        },
      };
    },
  },
};

vm.runInNewContext(source, context, { filename: 'qollite_hero_testing.js' });
if (!features.heroTesting) throw new Error('hero testing feature was not registered');
features.heroTesting.init();
features.heroTesting.init();
const controls = root.FindChildTraverse('QolLiteHeroTestingControls');
if (!controls || controls.parent !== stub) throw new Error('init must add one owned control group beside the stock testing stub');
if (stub.children.filter((child) => child.id === 'QolLiteHeroTestingControls').length !== 1) throw new Error('init must be idempotent');
if (tabs.children.length !== stockChildren.tabs || heroTools.children.length !== stockChildren.heroTools || gameRules.children.length !== stockChildren.gameRules) {
  throw new Error('owned controls must preserve stock tab and content panels');
}
const shortcut = root.FindChildTraverse('QolLiteHeroToolsShortcut');
if (!shortcut || !shortcut.events.onactivate) throw new Error('hero-tools shortcut must be interactive');
shortcut.events.onactivate();
if (!activated.some((event) => event.name === 'Activated' && event.target === 'hero_tools_button')) {
  throw new Error('hero-tools shortcut must activate the stock hero-tools tab');
}
features.heroTesting.destroy();
if (root.FindChildTraverse('QolLiteHeroTestingControls')) throw new Error('destroy must remove only owned hero-testing controls');
if (!root.FindChildTraverse('hero_tools') || !root.FindChildTraverse('game_rules')) throw new Error('destroy must preserve stock hero-testing anchors');
console.log('OK: hero testing behavior passed');
