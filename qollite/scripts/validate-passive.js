const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(process.cwd(), 'qollite/panorama/scripts/qollite_passive.js'), 'utf8');
const passiveItems = { id: 'hud_passive_items', visible: false };
const features = {};
const context = {
  GameUI: {
    CustomUIConfig() {
      return {
        QolLite: {
          Runtime: {
            find(id) { return id === passiveItems.id ? passiveItems : null; },
            register(name, feature) { features[name] = feature; },
          },
        },
      };
    },
  },
};

vm.runInNewContext(source, context, { filename: 'qollite_passive.js' });
if (!features.passive) throw new Error('passive feature was not registered');
features.passive.init();
if (passiveItems.visible !== true) throw new Error('init must keep the stock passive-items panel visible');
passiveItems.visible = false;
features.passive.refresh();
if (passiveItems.visible !== true) throw new Error('refresh must restore visibility when stock changes it');
features.passive.destroy();
if (passiveItems.visible !== true) throw new Error('destroy must not disable passive items');
console.log('OK: passive behavior passed');
