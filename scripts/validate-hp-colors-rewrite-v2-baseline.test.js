'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
} = require('./hp-colors-panorama-test-adapter');


const root = path.resolve(__dirname, '..');
const rewriteRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT)
  : path.join(root, 'hp_colors_rewrite_v2');
const panoramaRoot = path.join(rewriteRoot, 'panorama');
const menuLayoutPath = path.join(
  panoramaRoot,
  'layout/hud_escape_menu.xml',
);
const layoutPath = path.join(
  panoramaRoot,
  'layout/unit_status_overlay_v2.xml',
);
const stylePath = path.join(panoramaRoot, 'styles/unit_status_v2.css');
const stateSourcePath = path.join(
  panoramaRoot,
  'scripts/hp_colors_v2_state.js',
);
const contractPath = path.join(
  panoramaRoot,
  'scripts/hp_colors_v2_contract.js',
);
const menuSourcePath = path.join(
  panoramaRoot,
  'scripts/hp_colors_v2_menu.js',
);
const colorConsumerPath = path.join(
  panoramaRoot,
  'scripts/unit_status_v2_colors.js',
);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}
const NEW_STOCK_LAYOUT = `<!-- xml reconstructed by Source 2 Viewer - https://valveresourceformat.github.io -->
<root>
	<styles>
		<include src="s2r://panorama/styles/unit_status_v2.vcss" />
	</styles>
	<snippets>
		<snippet name="StatusPanelSnippet">
			<Panel class="status_panel">
				<Label id="status" text="{s:status}" />
				<Label id="stacks" text="{i:stacks}" />
				<Panel id="status_duration_bg">
					<Panel id="status_duration" />
				</Panel>
			</Panel>
		</snippet>
		<snippet name="StatusEffect">
			<Panel class="statusEffect">
				<Panel class="immuneImage" />
				<Label id="stacks" text="{i:stacks}" />
				<Panel class="statusEffectContainer">
					<Panel id="StatusEffectsBorder" />
					<Panel id="StatusEffectCooldownOverlay" />
					<Panel id="StatusEffectInner" />
					<Panel class="statusEffectImage" />
				</Panel>
			</Panel>
		</snippet>
		<snippet name="StaminaPip">
			<Panel class="StaminaPip">
				<Panel class="StaminaPipIcon" />
			</Panel>
		</snippet>
	</snippets>
	<Panel class="WindowRoot" hittest="false">
		<Label id="name" text="{s:name}" />
		<Panel id="NeutralBounty">
			<Panel id="TierContainer">
				<Panel class="difficulty_icon" />
			</Panel>
			<Panel id="BountyContainer">
				<Panel class="icon_souls" />
				<Label text="{i:neutral_bounty}" />
			</Panel>
		</Panel>
		<CitadelStatusEffect id="StatusEffects" />
		<Panel id="TargetableIndicator" />
		<Panel id="UnitStatus" hittest="false">
			<Panel id="InfoHealthContainer">
				<Panel id="UnitHealthbarsContainer">
					<Panel id="UnitHealthbar" class="UnitHealthbarContainer">
						<Panel id="UnitHealthbarInner">
							<Panel id="unit_healthbar_lagging" class="HealthAmount" />
							<Panel id="unit_healthbar_deferred" class="HealthAmount" />
							<Panel id="unit_healthbar_healing" class="HealthAmount" />
							<Panel id="unit_healthbar_bullet_shield" class="HealthAmount" />
							<Panel id="unit_healthbar_ratking_armor" class="HealthAmount" />
							<Panel id="unit_healthbar_delta" class="HealthAmount" />
						</Panel>
						<Panel id="UnitHealthbarLines" />
					</Panel>
					<Panel id="UnitShieldbar" class="UnitHealthbarContainer">
						<Panel id="UnitHealthbarInner">
							<Panel id="unit_healthbar_bullet_shield" class="HealthAmount" />
						</Panel>
					</Panel>
				</Panel>
				<Panel class="unit_info_panel">
					<Panel id="unit_info_bg">
						<Image id="unit_ult_ready_icon" />
					</Panel>
				</Panel>
				<Label id="UnitHealthbarValue" text="{d:health}" />
				<Label id="UnitShieldbarValue" text="{d:health}" />
			</Panel>
		</Panel>
		<Panel id="KillStreakIndicator">
			<Panel class="KSImage" />
		</Panel>
		<Panel id="StaminaContainer" />
		<Panel id="RejuvenatorActive" />
		<Panel id="CriticalIndicator">
			<Label text="#Citadel_Hud_Critical" />
		</Panel>
		<Panel id="AssassinateIndicator">
			<Label text="#Citadel_Hud_Assassinate" />
		</Panel>
		<Panel id="UnkillableIndicator">
			<Label text="#Citadel_Hud_Unkillable" />
		</Panel>
	</Panel>
</root>`;
const XML_REWRITE_OWNED_IDS = new Set([
  'LevelContainer',
  'hp_colors_pulse_overlay',
  'hp_colors_kill_marker',
  'HPV2UltimateOverlay',
  'hp_counter_container',
]);

function parseXmlStructure(source) {
  const roots = [];
  const stack = [];
  const tokenPattern = /<\/?([A-Za-z][\w:-]*)(?:\s+([^<>]*?))?\s*\/?>/g;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const tag = match[1];
    if (token.startsWith('</')) {
      stack.pop();
      continue;
    }
    const attributes = {};
    const attributePattern = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
    for (const attribute of (match[2] || '').matchAll(attributePattern))
      attributes[attribute[1]] = attribute[2];
    const node = { tag, attributes, children: [] };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    if (!token.endsWith('/>')) stack.push(node);
  }
  assert.equal(stack.length, 0, 'layout XML tags must be balanced');
  return roots;
}

function normalizeXmlStructure(nodes, removeRewriteOwned) {
  return nodes.flatMap((node) => {
    if (
      removeRewriteOwned &&
      (node.tag === 'scripts' || XML_REWRITE_OWNED_IDS.has(node.attributes.id))
    )
      return [];
    const attributes = Object.fromEntries(
      Object.entries(node.attributes)
        .map(([key, value]) => [
          key,
          key === 'src' ? value.replace(/\.vcss_c$/, '.vcss') : value,
        ])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    return [{
      tag: node.tag,
      attributes,
      children: normalizeXmlStructure(node.children, removeRewriteOwned),
    }];
  });
}
function cssBlock(source, selector) {
  const pattern = new RegExp(
    `(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'gm',
  );
  const matches = [...source.matchAll(pattern)];
  assert.ok(matches.length, `missing CSS selector: ${selector}`);
  return matches.map(match => match[1]).join('\n');
}

function installPanels(harness, ids) {
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
      operationCounts: harness.operationCounts,
    }));
  }
}

function bootMenuVm() {
  const harness = createPanoramaHarness();
  installPanels(harness, [...read(menuLayoutPath).matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const context = createVmContext(harness);
  runInVm(read(contractPath), context, contractPath);
  runInVm(read(stateSourcePath), context, stateSourcePath);
  runInVm(read(menuSourcePath), context, menuSourcePath);
  assert.equal(typeof context.$.HPColorsMenuBoot, 'function');
  assert.doesNotThrow(() => context.$.HPColorsMenuBoot());
  assert.equal(
    typeof harness.root.FindChildTraverse('HPColorsMenuButton').events.onactivate,
    'function',
    'menu boot must bind its entry point',
  );
  return { harness, context };
}

function makeSnapshot(revision, values) {
  return JSON.stringify({
    magic_word: 'HP_COLORS_V2_CONFIG',
    version: 2,
    revision,
    values,
  });
}

function addShieldbar(healthbars, harness, shieldWidth = 58) {
  const shieldbar = healthbars.add(new MockPanel('UnitShieldbar', {
    classes: ['UnitHealthbarContainer'],
    actuallayoutwidth: 76,
    actuallayoutheight: 18,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const inner = shieldbar.add(new MockPanel('UnitHealthbarInner', {
    actuallayoutwidth: 69,
    actuallayoutheight: 12,
    actualxoffset: 4,
    actualyoffset: 3.5,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const bulletShield = inner.add(new MockPanel('unit_healthbar_bullet_shield', {
    actuallayoutwidth: shieldWidth,
    style: { backgroundColor: '#DDAA11' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  return { shieldbar, inner, bulletShield };
}

function addLiveHealthbar(healthbars, harness, currentText = '300', fillWidth = 34.5, stockStyles = null) {
  const primary = healthbars.add(new MockPanel('UnitHealthbar', {
    classes: ['UnitHealthbarContainer'],
    actuallayoutwidth: 76,
    actuallayoutheight: 18,
    actualxoffset: 12,
    actualyoffset: 11,
    style: {
      width: stockStyles ? stockStyles.width : '',
      maxWidth: stockStyles ? stockStyles.maxWidth : '',
      height: stockStyles ? stockStyles.height : '',
      transform: stockStyles ? stockStyles.transform : '',
      preTransformScale2d: stockStyles ? stockStyles.preTransformScale2d || '' : '',
      transformOrigin: stockStyles ? stockStyles.transformOrigin || '' : '',
      opacity: stockStyles ? stockStyles.opacity : '',
    },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const inner = primary.add(new MockPanel('UnitHealthbarInner', {
    actuallayoutwidth: 69,
    actuallayoutheight: 12,
    actualxoffset: 4,
    actualyoffset: 3.5,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const fill = inner.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: fillWidth,
    classes: ['HealthAmount', 'HasHealth'],
    style: { washColor: '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const pulseOverlay = inner.add(new MockPanel('hp_colors_pulse_overlay', {
    style: { visibility: 'collapse' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const deferred = inner.add(new MockPanel('unit_healthbar_deferred', {
    classes: ['HealthAmount'],
    actuallayoutwidth: 0,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const healing = inner.add(new MockPanel('unit_healthbar_healing', {
    classes: ['HealthAmount'],
    actuallayoutwidth: 0,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const bulletShield = inner.add(new MockPanel('unit_healthbar_bullet_shield', {
    classes: ['HealthAmount'],
    actuallayoutwidth: 12,
    style: { backgroundColor: '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const armor = inner.add(new MockPanel('unit_healthbar_ratking_armor', {
    classes: ['HealthAmount'],
    actuallayoutwidth: 20,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const delta = inner.add(new MockPanel('unit_healthbar_delta', {
    classes: ['HealthAmount'],
    actuallayoutwidth: 0,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const lines = primary.add(new MockPanel('UnitHealthbarLines', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const killMarker = primary.add(new MockPanel('hp_colors_kill_marker', {
    style: { visibility: 'collapse' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  return { primary, inner, fill, pulseOverlay, lines, killMarker, bulletShield,
    deferred, healing, armor, delta, currentText };
}

function addCounterCanvas(windowRoot, harness) {
  const container = windowRoot.add(new MockPanel('hp_counter_container', {
    actuallayoutwidth: 200, actuallayoutheight: 210,
    style: { visibility: 'collapse' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const anchor = container.add(new MockPanel('hp_counter_anchor', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const row = anchor.add(new MockPanel('hp_counter_row', {
    actuallayoutwidth: 48, actuallayoutheight: 24,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counter = row.add(new MockPanel('hp_counter', {
    style: { visibility: 'collapse', height: 'fit-children' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counterMax = row.add(new MockPanel('hp_counter_max', {
    style: { visibility: 'collapse', height: 'fit-children' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  return { container, anchor, row, counter, counterMax };
}

function setMissingValue(values, key, value) {
  if (!Object.hasOwn(values, key)) values[key] = value;
}

function translation(transform) {
  if (!transform || transform === 'none') return [0, 0];
  const match = /^translateX\((-?[\d.]+)px\) translateY\((-?[\d.]+)px\)$/.exec(transform);
  assert.ok(match, `unsupported translation: ${transform}`);
  return [Number(match[1]), Number(match[2])];
}

function makeStatusFixture(
  role,
  values,
  revision = 1,
  currentText = '300',
  includeLegacyDecoy = false,
  includeSiblingDecoy = false,
  delayLiveBar = false,
  isPlayer = true,
  staminaStockStyles = null,
  barStockStyles = null,
  fixtureOptions = {},
) {
  values = { ...values };
  if (values.enemyColor) {
    setMissingValue(values, 'enemyMode', 'fixed');
    setMissingValue(values, 'enemyLow', values.enemyColor);
    setMissingValue(values, 'enemyMid', values.enemyColor);
    setMissingValue(values, 'enemyHigh', values.enemyColor);
    setMissingValue(values, 'enemyEnabled', true);
  }
  if (values.allyColor) {
    setMissingValue(values, 'allyMode', 'fixed');
    setMissingValue(values, 'allyLow', values.allyColor);
    setMissingValue(values, 'allyMid', values.allyColor);
    setMissingValue(values, 'allyHigh', values.allyColor);
    setMissingValue(values, 'allyEnabled', true);
  }
  const harness = createPanoramaHarness({ includeGameUI: false });
  const relationClasses =
    role === 'enemy'
      ? ['enemy']
      : role === 'ally'
        ? ['friend']
        : role === 'ambiguous'
          ? ['enemy', 'friend', 'team1']
          : role === 'neutral'
            ? ['team_neutral']
            : [];
  const kind = fixtureOptions.kind || (role === 'neutral' ? 'npc' : isPlayer ? 'player' : 'npc');
  const typeClasses = kind === 'building'
    ? ['building', 'CLASS_DESTROYABLE_BUILDING']
    : kind === 'player'
      ? ['player', 'CLASS_PLAYER']
      : kind === 'npc'
        ? (fixtureOptions.npcClasses || ['creature'])
        : [];
  const worldClasses = [...relationClasses, ...typeClasses];
  if (fixtureOptions.extraClasses)
    worldClasses.push(...fixtureOptions.extraClasses);
  if (fixtureOptions.team) worldClasses.push(fixtureOptions.team);
  else if (!worldClasses.includes('team1') && role === 'enemy') worldClasses.push('team1');
  else if (role === 'ally') worldClasses.push('team2');
  const root = harness.root;
  let siblingCounter = null;
  let siblingFill = null;
  if (includeSiblingDecoy) {
    const siblingWorld = root.add(new MockPanel('WorldUIRootSibling', {
      classes: ['enemy', 'player', 'team1'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingWindow = siblingWorld.add(new MockPanel('client_ui_panel_sibling', {
      classes: ['WindowRoot'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('name', {
      text: 'Sibling enemy',
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingBounty = siblingWindow.add(new MockPanel('NeutralBounty', {
      style: { washColor: '#111111' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingBounty.add(new MockPanel('TierContainer', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('StatusEffects', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('TargetableIndicator', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingStatus = siblingWindow.add(new MockPanel('UnitStatus', {
      actuallayoutwidth: 100,
      actuallayoutheight: 40,
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('KillStreakIndicator', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('StaminaContainer', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('RejuvenatorActive', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('CriticalIndicator', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('AssassinateIndicator', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingWindow.add(new MockPanel('UnkillableIndicator', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingInfo = siblingStatus.add(new MockPanel('InfoHealthContainer', {
      actuallayoutwidth: 100,
      actuallayoutheight: 40,
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingLevel = siblingInfo.add(new MockPanel('LevelContainer', {
      classes: ['NP_playerlevel_container'],
      actuallayoutwidth: 21,
      actuallayoutheight: 21,
      style: { visibility: 'collapse' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingLevel.add(new MockPanel('unit_level_label', {
      classes: ['NP_playerlevel'],
      text: '10',
      style: { visibility: 'collapse' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingHealthbars = siblingInfo.add(new MockPanel('UnitHealthbarsContainer', {
      actuallayoutwidth: 100,
      actuallayoutheight: 40,
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    addShieldbar(siblingHealthbars, harness);
    const siblingLiveBar = addLiveHealthbar(siblingHealthbars, harness, '900', 9);
    const siblingInfoPanel = siblingInfo.add(new MockPanel('unit_info_panel', {
      classes: ['unit_info_panel'],
      actuallayoutwidth: 22,
      actuallayoutheight: 22,
      style: {},
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingInfoBg = siblingInfoPanel.add(new MockPanel('unit_info_bg', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingInfoBg.add(new MockPanel('unit_ult_ready_icon', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingUltimate = siblingInfoBg.add(new MockPanel('HPV2UltimateOverlay', {
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingUltimate.add(new MockPanel('HPV2UltimateDark', {
      classes: ['HPV2UltimateArtwork'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingUltimate.add(new MockPanel('HPV2UltimateFill', {
      classes: ['HPV2UltimateArtwork'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingInfo.add(new MockPanel('UnitHealthbarValue', {
      text: '900',
      style: { visibility: 'visible' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    siblingInfo.add(new MockPanel('UnitShieldbarValue', {
      text: '9999',
      style: { visibility: 'visible' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const siblingCanvas = addCounterCanvas(siblingWindow, harness);
    siblingFill = siblingLiveBar.fill;
    siblingCounter = siblingCanvas.counter;
  }
  const worldRoot = root.add(new MockPanel('WorldUIRoot', {
    classes: worldClasses,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const windowRoot = worldRoot.add(new MockPanel('client_ui_panel', {
    classes: ['WindowRoot'],
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const namePanel = windowRoot.add(new MockPanel('name', {
    text: 'Enemy',
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const neutralBounty = windowRoot.add(new MockPanel('NeutralBounty', {
    style: { washColor: '#111111', opacity: '0.8' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  neutralBounty.add(new MockPanel('TierContainer', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  })).add(new MockPanel('difficulty_icon', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const bountyContainer = neutralBounty.add(new MockPanel('BountyContainer', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  bountyContainer.add(new MockPanel('icon_souls', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const bountyLabel = bountyContainer.add(new MockPanel('NeutralBountyLabel', {
    text: '900',
    style: { washColor: '#ABCDEF' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const statusEffects = windowRoot.add(new MockPanel('StatusEffects', {
    classes: ['CitadelStatusEffect'],
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const targetable = windowRoot.add(new MockPanel('TargetableIndicator', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const unitStatus = windowRoot.add(new MockPanel('UnitStatus', {
    actuallayoutwidth: 100,
    actuallayoutheight: 40,
    style: { transform: barStockStyles ? barStockStyles.unitStatusTransform : '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const killStreak = windowRoot.add(new MockPanel('KillStreakIndicator', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  killStreak.add(new MockPanel('KSImage', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const staminaContainer = windowRoot.add(new MockPanel('StaminaContainer', {
    style: {
      transform: staminaStockStyles ? staminaStockStyles.containerTransform : '',
      washColor: staminaStockStyles ? staminaStockStyles.containerWashColor : '',
    },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const staminaIcons = [];
  for (let staminaIndex = 0; staminaIndex < 3; staminaIndex += 1) {
    const staminaPip = staminaContainer.add(new MockPanel(`StaminaPip${staminaIndex}`, {
      classes: staminaIndex === 2 ? ['StaminaPip', 'PipEmpty'] : ['StaminaPip'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    staminaIcons.push(staminaPip.add(new MockPanel(`StaminaPipIcon${staminaIndex}`, {
      classes: ['StaminaPipIcon'],
      style: {
        width: staminaStockStyles ? staminaStockStyles.iconWidth : '',
        height: staminaStockStyles ? staminaStockStyles.iconHeight : '',
        washColor: '',
        backgroundColor: staminaStockStyles ? staminaStockStyles.iconBackgroundColor : '',
        borderColor: staminaStockStyles ? staminaStockStyles.iconBorderColor : '',
      },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    })));
  }
  const rejuvenator = windowRoot.add(new MockPanel('RejuvenatorActive', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const critical = windowRoot.add(new MockPanel('CriticalIndicator', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  critical.add(new MockPanel('CriticalText', {
    text: '#Citadel_Hud_Critical',
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const assassinate = windowRoot.add(new MockPanel('AssassinateIndicator', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  assassinate.add(new MockPanel('AssassinateText', {
    text: '#Citadel_Hud_Assassinate',
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const unkillable = windowRoot.add(new MockPanel('UnkillableIndicator', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  unkillable.add(new MockPanel('UnkillableText', {
    text: '#Citadel_Hud_Unkillable',
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const infoHealth = unitStatus.add(new MockPanel('InfoHealthContainer', {
    actuallayoutwidth: 100,
    actuallayoutheight: 40,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const levelContainer = infoHealth.add(new MockPanel('LevelContainer', {
    classes: ['NP_playerlevel_container'],
    actuallayoutwidth: 21,
    actuallayoutheight: 21,
    // CSS left margin and centered -14px top margin in the native 100x40 box.
    actualxoffset: -23,
    actualyoffset: 2.5,
    style: { marginLeft: '', marginTop: '', visibility: 'collapse',
      verticalAlign: 'middle', horizontalAlign: 'left',
      ...fixtureOptions.levelStyle },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const levelLabel = levelContainer.add(new MockPanel('unit_level_label', {
    classes: ['NP_playerlevel'],
    text: '10',
    style: { visibility: 'collapse' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const healthbars = infoHealth.add(new MockPanel('UnitHealthbarsContainer', {
    actuallayoutwidth: 100,
    actuallayoutheight: 40,
    actualxoffset: 0,
    actualyoffset: 0,
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const shield = addShieldbar(healthbars, harness, fixtureOptions.secondaryShieldWidth || 58);
  const liveBar = delayLiveBar
    ? { primary: null, inner: null, fill: null, pulseOverlay: null, lines: null,
      killMarker: null, bulletShield: null, deferred: null, healing: null, armor: null, delta: null }
    : addLiveHealthbar(healthbars, harness, currentText, fixtureOptions.fillWidth ?? 34.5, barStockStyles);
  if (liveBar.fill && fixtureOptions.fillStyle)
    Object.assign(liveBar.fill.style, fixtureOptions.fillStyle);
  const unitInfo = infoHealth.add(new MockPanel('unit_info_panel', {
    classes: ['unit_info_panel'],
    actuallayoutwidth: 22,
    actuallayoutheight: 22,
    actualxoffset: 0,
    actualyoffset: 2,
    style: { marginLeft: '', marginTop: '', verticalAlign: 'middle', horizontalAlign: 'left' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const infoBg = unitInfo.add(new MockPanel('unit_info_bg', {
    style: { opacity: barStockStyles ? barStockStyles.ultBackgroundOpacity : '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const ult = infoBg.add(new MockPanel('unit_ult_ready_icon', {
    style: { washColor: '' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const ultOverlay = infoBg.add(new MockPanel('HPV2UltimateOverlay', {
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  ultOverlay.add(new MockPanel('HPV2UltimateDark', {
    classes: ['HPV2UltimateArtwork'],
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  ultOverlay.add(new MockPanel('HPV2UltimateFill', {
    classes: ['HPV2UltimateArtwork'],
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const healthValue = infoHealth.add(new MockPanel('UnitHealthbarValue', {
    text: currentText,
    style: { visibility: 'visible' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const shieldValue = infoHealth.add(new MockPanel('UnitShieldbarValue', {
    text: '9999',
    style: { visibility: 'visible' },
    findCounts: harness.findCounts,
    operationCounts: harness.operationCounts,
  }));
  const counterCanvas = addCounterCanvas(windowRoot, harness);
  let stockFill = null;
  if (includeLegacyDecoy) {
    const stale = infoHealth.add(new MockPanel('RetiredLegacyBar', {
      classes: ['old_bar'],
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    const staleParent = stale.add(new MockPanel('unit_healthbar_active_parent', {
      actuallayoutwidth: 0,
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
    stockFill = staleParent.add(new MockPanel('unit_healthbar_lagging', {
      actuallayoutwidth: 0,
      style: { washColor: '' },
      findCounts: harness.findCounts,
      operationCounts: harness.operationCounts,
    }));
  }
  root.SetAttributeString('hp_colors_v2_config', makeSnapshot(revision, values));
  harness.contextPanel = unitStatus;
  const context = createVmContext(harness, { includeGameUI: false });
  if (fixtureOptions.withoutMsg) delete context.$.Msg;
  runInVm(read(contractPath), context, contractPath);
  runInVm(read(colorConsumerPath), context, colorConsumerPath);
  if (harness.scheduler.jobs.length) harness.scheduler.runNext();
  return {
    harness, context, root, worldRoot, unitStatus, windowRoot, healthbar: liveBar.primary,
    infoHealth, infoBg, neutralBounty, bountyLabel, statusEffects, targetable,
    fill: liveBar.fill, pulseOverlay: liveBar.pulseOverlay, ult, ultOverlay,
    healthValue, shieldValue, secondaryShield: shield, lines: liveBar.lines,
    killMarker: liveBar.killMarker, pipLines: liveBar.lines,
    counter: counterCanvas.counter, counterContainer: counterCanvas.container,
    counterAnchor: counterCanvas.anchor, counterMax: counterCanvas.counterMax,
    counterRow: counterCanvas.row,
    activeParent: liveBar.inner, inner: liveBar.inner, healthbars, stockFill,
    stockPip: null, siblingCounter, siblingFill, staminaContainer, staminaIcons,
    levelContainer, unitInfo, levelLabel, unitShieldbarValue: shieldValue,
    secondaryShieldFill: shield.bulletShield, namePanel, rejuvenator, critical,
    assassinate, unkillable,
  };
}

function dispatchColorSnapshot(fixture, revision, values) {
  const handler = fixture.harness.handlers.ClientUI_FireOutput;
  assert.equal(typeof handler, 'function');
  handler(makeSnapshot(revision, values));
}
test('v2 preserves the frozen static stock tree and adds only passive owned panels', () => {
  const layout = parseXmlStructure(read(layoutPath));
  assert.deepEqual(normalizeXmlStructure(layout, true),
    normalizeXmlStructure(parseXmlStructure(NEW_STOCK_LAYOUT), false));
  assert.deepEqual(layout[0].children.find(node => node.tag === 'scripts').children.map(node => node.attributes.src), [
    's2r://panorama/scripts/hp_colors_v2_contract.vjs_c',
    's2r://panorama/scripts/unit_status_v2_colors.vjs_c',
    's2r://panorama/scripts/test_event_bridge.vjs_c',
    's2r://panorama/scripts/test_topbar_pickups.vjs_c',
  ]);
  function verifyOwned(nodes, owned = false) {
    for (const node of nodes) {
      const local = owned || XML_REWRITE_OWNED_IDS.has(node.attributes.id);
      if (local) assert.equal(node.attributes.hittest, 'false', node.attributes.id);
      verifyOwned(node.children, local);
    }
  }
  verifyOwned(layout);
  const window = layout[0].children.find(node => node.attributes.class === 'WindowRoot');
  const container = window.children.find(node => node.attributes.id === 'hp_counter_container');
  const anchor = container.children.find(node => node.attributes.id === 'hp_counter_anchor');
  const row = anchor.children.find(node => node.attributes.id === 'hp_counter_row');
  assert.doesNotMatch(read(layoutPath), /hp_counter_slot/);
  assert.deepEqual(row.children.map(node => node.attributes.id), ['hp_counter', 'hp_counter_max']);
  assert.doesNotMatch(read(layoutPath), /hp_counter_native/);
});

test('v2 non-player gates independently authorize only the relation bar surface', () => {
  for (const kind of ['npc', 'building']) {
    for (const role of ['enemy', 'ally']) {
      const gate = `${kind}${role === 'enemy' ? 'Enemy' : 'Ally'}Enabled`;
      const values = {
        enabled: true, enemyEnabled: false, allyEnabled: false,
        enemyMode: 'fixed', enemyLow: '#123456', enemyMid: '#123456', enemyHigh: '#123456',
        allyMode: 'fixed', allyLow: '#654321', allyMid: '#654321', allyHigh: '#654321',
        enemyHealing: '#112233', allyHealing: '#112233',
        enemyDelta: '#223344', allyDelta: '#223344',
        enemyBulletShield: '#334455', allyBulletShield: '#334455',
        widthScale: 230, heightScale: 160, positionX: 300, positionY: 200,
        pipsVisible: false, readoutVisible: true, allyReadoutVisible: true,
        enemyKillMarkerEnabled: true, staminaWidth: 150,
        levelOffsetX: 80, ultOffsetX: 80, ultMode: 'custom', ultCustom: '#ABCDEF',
      };
      const fixture = makeStatusFixture(role, values, 1, '300',
        false, false, false, false, null, null, { kind, npcClasses: ['CLASS_TROOPER'] });
      assert.equal(fixture.healthbars.style.preTransformScale2d || '', '', gate);
      assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0], gate);
      assert.equal(fixture.fill.style.washColor, role === 'enemy' ? '#FD4949' : '#FFEFD7');
      for (const panel of [fixture.levelContainer, fixture.unitInfo])
        panel.styleWrites.length = 0;
      dispatchColorSnapshot(fixture, 2, { ...values, [gate]: true });
      assert.equal(fixture.fill.style.washColor, role === 'enemy' ? '#123456' : '#654321');
      assert.equal(fixture.inner.FindChildTraverse('unit_healthbar_healing').style.washColor, '#112233');
      assert.equal(fixture.inner.FindChildTraverse('unit_healthbar_delta').style.washColor, '#223344');
      assert.equal(fixture.inner.FindChildTraverse('unit_healthbar_bullet_shield').style.backgroundColor, '#334455');
      assert.equal(fixture.healthbars.style.preTransformScale2d, '2.3, 1.6');
      assert.deepEqual(translation(fixture.healthbars.style.transform), [30, 20]);
      assert.equal(fixture.pipLines.style.visibility || '', role === 'enemy' ? 'collapse' : '');
      assert.equal(fixture.healthValue.style.visibility, 'visible');
      assert.equal(fixture.counter.style.visibility, 'collapse');
      assert.equal(fixture.counter.text, '');
      assert.equal(fixture.killMarker.style.visibility, 'collapse');
      assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteEnemyPlayer'), false);
      assert.equal(fixture.staminaContainer.BHasClass('HPColorsRewriteStaminaOwned'), false);
      for (const panel of [fixture.levelContainer, fixture.unitInfo])
        assert.deepEqual(panel.styleWrites.filter(write =>
          ['marginLeft', 'marginTop'].includes(write.property)), [], gate);
      dispatchColorSnapshot(fixture, 3, { ...values, [gate]: false });
      assert.equal(fixture.healthbars.style.preTransformScale2d, '');
      assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
      assert.equal(fixture.fill.style.washColor, role === 'enemy' ? '#FD4949' : '#FFEFD7');
    }
  }
});

test('v2 neutral NPC opt-in changes fill only and preserves stock bounty and indicators', () => {
  const fixture = makeStatusFixture('neutral', {
    enabled: true, widthScale: 230, positionX: 300, enemyVisible: false,
    readoutVisible: true, npcEnemyEnabled: true, npcAllyEnabled: true,
  });
  const stockPanels = [fixture.neutralBounty, fixture.bountyLabel, fixture.statusEffects,
    fixture.targetable, fixture.rejuvenator, fixture.critical, fixture.assassinate,
    fixture.unkillable, fixture.healthValue, fixture.unitShieldbarValue];
  assert.equal(fixture.fill.style.washColor, '#5BEFB5');
  for (const panel of stockPanels) panel.styleWrites.length = 0;
  dispatchColorSnapshot(fixture, 2, {
    npcNeutralEnabled: true, neutralColor: '#ABCDEF',
    widthScale: 230, positionX: 300, enemyVisible: false, readoutVisible: true,
  });
  assert.equal(fixture.fill.style.washColor, '#ABCDEF');
  assert.equal(fixture.healthbars.style.preTransformScale2d || '', '');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.text, '300');
  assert.equal(fixture.unitShieldbarValue.text, '9999');
  assert.equal(fixture.bountyLabel.text, '900');
  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.critical.children[0].text, '#Citadel_Hud_Critical');
  assert.equal(fixture.assassinate.children[0].text, '#Citadel_Hud_Assassinate');
  assert.equal(fixture.unkillable.children[0].text, '#Citadel_Hud_Unkillable');
  for (const panel of stockPanels) assert.deepEqual(panel.styleWrites, []);
  fixture.fill.styleWrites.length = 0;
  for (let index = 0; index < 5; index++) fixture.harness.scheduler.runNext();
  assert.deepEqual(fixture.fill.styleWrites, [], 'unchanged passive surfaces must not repaint');
  dispatchColorSnapshot(fixture, 3, { npcNeutralEnabled: false });
  assert.equal(fixture.fill.style.washColor, '#5BEFB5');
});

test('v2 type and relation classification keeps unknowns stock and gives buildings and neutrals precedence', () => {
  const cases = [
    { kind: 'unknown', role: 'enemy', expected: '#FD4949' },
    { kind: 'npc', role: 'ambiguous', expected: '' },
    { kind: 'building', role: 'neutral', expected: '#5BEFB5' },
    { kind: 'building', role: 'enemy', extraClasses: ['player', 'CLASS_PLAYER', 'sentry'], expected: '#123456' },
    { kind: 'npc', role: 'enemy', npcClasses: ['neutral_weak'], expected: '#ABCDEF' },
    { kind: 'npc', role: 'enemy', npcClasses: ['CLASS_TROOPER_BOSS'], expected: '#123456' },
  ];
  for (const entry of cases) {
    const fixture = makeStatusFixture(entry.role, {
      enemyColor: '#123456', npcEnemyEnabled: true, buildingEnemyEnabled: true,
      npcNeutralEnabled: true, neutralColor: '#ABCDEF', widthScale: 230,
      readoutVisible: true, enemyKillMarkerEnabled: true,
    }, 1, '300', false, false, false, false, null, null, entry);
    assert.equal(fixture.fill.style.washColor, entry.expected, JSON.stringify(entry));
    assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteEnemyPlayer'), false);
    assert.equal(fixture.counter.style.visibility, 'collapse');
    assert.equal(fixture.killMarker.style.visibility, 'collapse');
    assert.equal(fixture.healthValue.style.visibility, 'visible');
  }
});

test('v2 ignores retired ghoul opacity without altering ungated NPC geometry', () => {
  for (const npcClasses of [['creature'], ['CLASS_TROOPER']]) {
    const fixture = makeStatusFixture('enemy', {
      enemyColor: '#123456', ghoulOpacityEnabled: true, ghoulOpacity: 25,
      npcEnemyEnabled: false, widthScale: 230, positionX: 300,
    }, 1, '300', false, false, false, false, null, null, { kind: 'npc', npcClasses });
    assert.equal(fixture.healthbar.style.opacity || '', '');
    assert.equal(fixture.fill.style.washColor, '#FD4949');
    assert.equal(fixture.healthbars.style.preTransformScale2d || '', '');
    assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
    assert.equal(fixture.counter.style.visibility, 'collapse');
  }
});

test('v2 releases player classes, readouts, markers, stamina and margins when kind or relation changes', () => {
  for (const destination of ['building', 'neutral', 'ambiguous', 'unknown']) {
    const fixture = makeStatusFixture('enemy', {
      enemyColor: '#123456', buildingEnemyEnabled: true, npcNeutralEnabled: true,
      widthScale: 230, positionX: 300, readoutVisible: true,
      enemyKillMarkerEnabled: true, staminaWidth: 150,
    });
    assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteEnemyPlayer'), true);
    assert.equal(fixture.killMarker.style.visibility, 'visible');
    // Classification must also handle facts split across the allowed ancestors.
    fixture.worldRoot.SetHasClass('player', false);
    fixture.worldRoot.SetHasClass('CLASS_PLAYER', false);
    if (destination === 'building') fixture.windowRoot.SetHasClass('building', true);
    if (destination === 'neutral') {
      fixture.worldRoot.SetHasClass('creature', true);
      fixture.windowRoot.SetHasClass('team_neutral', true);
    }
    if (destination === 'ambiguous') {
      fixture.worldRoot.SetHasClass('player', true);
      fixture.windowRoot.SetHasClass('friend', true);
    }
    fixture.harness.scheduler.runByDelay(1);
    assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteEnemyPlayer'), false, destination);
    assert.equal(fixture.healthValue.style.visibility, 'visible');
    assert.equal(fixture.counter.style.visibility, 'collapse');
    assert.equal(fixture.counter.text, '');
    assert.equal(fixture.killMarker.style.visibility, 'collapse');
    assert.equal(fixture.staminaContainer.BHasClass('HPColorsRewriteStaminaOwned'), false);
    assert.equal(fixture.staminaIcons[0].style.width, '');
    assert.equal(fixture.levelContainer.style.marginLeft, '');
    assert.equal(fixture.unitInfo.style.marginLeft, '');
    assert.equal(fixture.unitInfo.style.marginTop, '');
  }
});

test('v2 marker native width and inset clamp stay inside the primary inner surface', () => {
  const fixture = makeStatusFixture('enemy', {
    enemyKillMarkerEnabled: true, enemyKillMarkerThreshold: 50, enemyKillMarkerWidth: 3,
  });
  assert.equal(fixture.killMarker.style.width, '1px');
  assert.equal(fixture.killMarker.style.marginLeft, '38px');
  fixture.inner.actuallayoutwidth = 10;
  fixture.harness.scheduler.runByDelay(1);
  dispatchColorSnapshot(fixture, 2, {
    enemyKillMarkerEnabled: true, enemyKillMarkerThreshold: 5, enemyKillMarkerWidth: 60,
  });
  assert.equal(fixture.killMarker.style.width, '6px');
  assert.equal(fixture.killMarker.style.marginLeft, '4px');
  dispatchColorSnapshot(fixture, 3, {
    enemyKillMarkerEnabled: true, enemyKillMarkerThreshold: 80, enemyKillMarkerWidth: 60,
  });
  assert.equal(fixture.killMarker.style.marginLeft, '8px');
  fixture.inner.actuallayoutwidth = 2;
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.killMarker.style.width, '2px');
  assert.equal(fixture.killMarker.style.marginLeft, '4px');
  assert.equal(fixture.secondaryShieldFill.style.backgroundColor, '#DDAA11');
});


test('v2 HP/current readouts own an external engine-bound label without rewriting text', () => {
  for (const format of ['hp', 'current']) {
    const fixture = makeStatusFixture('enemy', {
      enabled: true, enemyColor: '#123456', readoutVisible: true,
      readoutFormat: format, readoutSize: 200, readoutFont: 'oracle',
      readoutOffsetX: 50, readoutOffsetY: -100, positionX: 100,
    }, 1, '2,990');
    assert.equal(fixture.counter.text, '');
    assert.equal(fixture.counterMax.text, '');
    assert.equal(fixture.counter.style.visibility, 'collapse');
    assert.equal(fixture.counterMax.style.visibility, 'collapse');
    assert.equal(fixture.healthValue.style.visibility, 'visible');
    assert.equal(fixture.healthValue.style.opacity, '1');
    assert.equal(fixture.healthValue.style.washColor, '#123456');
    assert.equal(fixture.healthValue.style.fontSize, '20px');
    assert.equal(fixture.healthValue.style.fontFamily, 'VALVEOracle, Reaver, sans-serif');
    assert.equal(fixture.counterAnchor.style.transform, '');
    assert.equal(fixture.counterRow.style.marginLeft, '152px');
    assert.equal(fixture.counterRow.style.marginTop, '0px');
    assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
    assert.equal(fixture.counterContainer.GetParent(), fixture.windowRoot);
    assert.equal(fixture.unitShieldbarValue.style.visibility, 'visible');
    for (const text of ['0', '12.4', '2,990', '2.990', '2 990', '2\u00a0990',
      '2\u2009990', '2\u202f990', '', '{d:health}']) {
      fixture.healthValue.__text = text; // Engine updates the binding, not Rewrite.
      fixture.harness.scheduler.runNext();
      assert.equal(fixture.healthValue.text, text);
      assert.equal(fixture.counter.text, '');
      assert.equal(fixture.counterMax.text, '');
      assert.equal(fixture.healthValue.style.visibility, 'visible');
      assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
    }
  }
});

test('v2 native current changes need no readout sampling within a fill-percent bucket', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true, enemyColor: '#123456', readoutVisible: true, readoutFormat: 'current',
  }, 1, '300');
  Object.defineProperty(fixture.healthValue, 'text', {
    get() { throw new Error('Rewrite must not sample the native number'); },
    set() { throw new Error('Rewrite must not write the native number'); },
  });
  fixture.healthValue.styleWrites.length = 0;
  for (const text of ['250', '0']) {
    fixture.healthValue.__text = text;
    assert.doesNotThrow(() => fixture.harness.scheduler.runNext());
    assert.equal(fixture.counter.text, '');
    assert.deepEqual(fixture.healthValue.styleWrites, []);
  }
  fixture.healthValue.DeleteAsync();
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.fill.style.washColor, '#123456');
});

test('v2 visible clipping drives enemy fill, readout, ultimate and pulse coverage', () => {
  const values = {
    enemyEnabled: true, enemyMode: 'fixed',
    enemyLow: '#FF0000', enemyMid: '#FFFF00', enemyHigh: '#00FF00',
    readoutVisible: true, readoutFormat: 'percent', ultMode: 'follow',
    enemyPulseEnabled: true, enemyPulseThreshold: 100,
    enemyPulseColorEnabled: true, enemyPulseColorMode: 'gradient',
  };
  const fixture = makeStatusFixture('enemy', values, 1, '120',
    false, false, false, true, null, null, {
      fillWidth: 69, fillStyle: { clip: 'rect(0%, 12%, 100%, 0%)' },
    });
  assert.equal(fixture.counter.text, '12%');
  for (const panel of [fixture.fill, fixture.counter, fixture.ult, fixture.ultOverlay])
    assert.equal(panel.style.washColor, '#FF0000', panel.id);
  assert.equal(fixture.pulseOverlay.style.width, '12%');

  fixture.fill.style.clip = 'rect(0%, 12.5%, 100%, 0%)';
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '12%');
  assert.equal(fixture.pulseOverlay.style.width, '12.5%');
});

test('v2 samples the exact live decimal clip while layout width stays full', () => {
  const fixture = makeStatusFixture('enemy', {
    readoutVisible: true, readoutFormat: 'percent',
    enemyPulseEnabled: true, enemyPulseThreshold: 100,
    enemyPulseColorEnabled: true, enemyPulseColorMode: 'gradient',
  }, 1, '2,990', false, false, false, true, null, null, {
    fillWidth: 69,
    fillStyle: { clip: 'rect( 0.0%, 77.710846%, 100.0%, 0.0%)' },
  });
  assert.equal(fixture.counter.text, '77%');
  assert.equal(fixture.pulseOverlay.style.width, '77.71%');
  assert.equal(fixture.fill.actuallayoutwidth, 69);
  fixture.fill.style.clip = 'rect( 0.0% 77.710846% 100.0% 0.0% )';
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '77%');
  fixture.fill.style.clip = 'rect(0%, , 77%, 100%, 0%)';
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '100%', 'malformed clips are ignored');
});

test('v2 uses the minimum available health signal and preserves layout-width sampling', () => {
  const cases = [
    { fillWidth: 20.7, expected: 30 },
    { fillWidth: 69, style: { transform: 'scaleX(0.3)' }, expected: 30 },
    { fillWidth: 69, style: { transform: 'translateX(0px) scale(0.3, 1)' }, expected: 30 },
    { fillWidth: 69, style: { preTransformScale2d: '0.3, 1' }, expected: 30 },
    { fillWidth: 69, style: { width: '30%' }, expected: 30 },
    { fillWidth: 69, style: { width: '20.7px' }, expected: 30 },
    { fillWidth: 69, style: { clip: 'rect(0px, 27.6px, 12px, 6.9px)' }, expected: 30 },
    { fillWidth: 69, x: -48.3, expected: 30 },
    { fillWidth: 34.5, style: {
      clip: 'rect(0%, 12%, 100%, 0%)', transform: 'scaleX(0.3)',
      width: '80%', preTransformScale2d: '0.6, 1',
    }, expected: 12 },
    { fillWidth: 34.5, style: {
      clip: 'rect(nope)', transform: 'scaleX(nope)', width: 'auto',
      preTransformScale2d: 'not a scale',
    }, expected: 50 },
    { fillWidth: 34.5, style: {
      transform: 'scaleX(0x0)', preTransformScale2d: '0x0, 1',
    }, expected: 50 },
    { fillWidth: 0, expected: 0 },
  ];
  for (const entry of cases) {
    const fixture = makeStatusFixture('enemy', {
      readoutVisible: true, readoutFormat: 'percent',
      enemyPulseEnabled: true, enemyPulseThreshold: 100,
      enemyPulseColorEnabled: true, enemyPulseColorMode: 'gradient',
    }, 1, '300', false, false, false, true, null, null, {
      fillWidth: entry.fillWidth, fillStyle: entry.style,
    });
    if (entry.x !== undefined) {
      fixture.fill.actualxoffset = entry.x;
      fixture.harness.scheduler.runNext();
    }
    assert.equal(fixture.counter.text, `${entry.expected}%`, JSON.stringify(entry));
    assert.equal(fixture.pulseOverlay.style.width, `${entry.expected}%`, JSON.stringify(entry));
    fixture.fill.style.clip = 'rect(0%, 8%, 100%, 0%)';
    fixture.harness.scheduler.runNext();
    assert.equal(fixture.counter.text, `${Math.min(entry.expected, 8)}%`);
  }
});

test('v2 health sampling survives unavailable style signals and absent Panorama logging', () => {
  const fixture = makeStatusFixture('enemy', {
    enemyMode: 'fixed', enemyLow: '#FF0000', enemyMid: '#FFFF00', enemyHigh: '#00FF00',
    readoutFormat: 'percent',
  }, 1, '120', false, false, false, true, null, null, {
    withoutMsg: true, fillWidth: 69,
    fillStyle: { clip: 'rect(0%, 12%, 100%, 0%)' },
  });
  assert.equal(fixture.counter.text, '12%');
  const style = fixture.fill.style;
  fixture.fill.style = new Proxy(style, {
    get(target, property) {
      if (['width', 'transform', 'preTransformScale2d'].includes(property))
        throw new Error('native style read temporarily unavailable');
      return target[property];
    },
  });
  Object.defineProperty(fixture.fill, 'actualxoffset', {
    get() { throw new Error('native offset temporarily unavailable'); },
  });
  fixture.healthValue.text = '110';
  assert.doesNotThrow(() => fixture.harness.scheduler.runNext());
  assert.equal(fixture.counter.text, '12%');
  assert.equal(fixture.fill.style.washColor, '#FF0000');
});

test('v2 uses only primary inner width and does not confuse the shield-bar duplicate IDs', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    readoutVisible: true,
    readoutFormat: 'percent',
    enemyKillMarkerEnabled: true,
    enemyKillMarkerThreshold: 50,
    enemyKillMarkerWidth: 100,
    enemyPulseEnabled: true,
    enemyPulseThreshold: 100,
    enemyPulseColorEnabled: true,
    enemyPulseColorMode: 'gradient',
  });

  assert.equal(fixture.secondaryShield.shieldbar.id, 'UnitShieldbar');
  assert.equal(fixture.secondaryShield.inner.id, 'UnitHealthbarInner');
  assert.equal(fixture.inner.id, 'UnitHealthbarInner');
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.counter.text, '50%');
  assert.equal(fixture.counterMax.text, '');
  assert.equal(fixture.secondaryShieldFill.style.backgroundColor, '#DDAA11');
  assert.equal(fixture.secondaryShieldFill.style.washColor, undefined);
  assert.equal(fixture.unitShieldbarValue.text, '9999');
  assert.equal(fixture.unitShieldbarValue.style.visibility, 'visible');
  assert.equal(fixture.pulseOverlay.style.width, '50%');
  assert.equal(fixture.killMarker.GetParent(), fixture.healthbar);
  assert.equal(fixture.killMarker.style.visibility, 'visible');
  assert.equal(fixture.killMarker.style.width, '10px');
  assert.equal(fixture.killMarker.style.marginLeft, '33.5px');
});

test('v2 ally health text is opt-in, independently styled, and native labels restore', () => {
  const stock = makeStatusFixture('ally', { enabled: true, readoutVisible: true });
  assert.equal(stock.counter.text, '');
  assert.equal(stock.counter.style.visibility, 'collapse');
  assert.equal(stock.healthValue.style.visibility, 'visible');

  const fixture = makeStatusFixture('ally', {
    enabled: true,
    allyEnabled: false,
    readoutVisible: false,
    allyReadoutVisible: true,
    allyReadoutFormat: 'percent',
    allyReadoutColorMode: 'custom',
    allyReadoutMode: 'fixed',
    allyReadoutLow: '#112233',
    allyReadoutMid: '#445566',
    allyReadoutHigh: '#778899',
    allyReadoutSize: 200,
    allyReadoutFont: 'oracle',
    allyReadoutOffsetX: 10,
    allyReadoutOffsetY: 150,
  });
  assert.equal(fixture.counter.text, '50%');
  assert.equal(fixture.counter.style.visibility, 'visible');
  assert.equal(fixture.counterMax.style.visibility, 'collapse');
  assert.equal(fixture.counter.style.washColor, '#445566');
  assert.equal(fixture.counter.style.fontSize, '20px');
  assert.equal(fixture.counter.style.fontFamily, 'VALVEOracle, Reaver, sans-serif');
  assert.equal(fixture.counterAnchor.style.transform, '');
  assert.equal(fixture.counterRow.style.marginLeft, '92px');
  assert.equal(fixture.counterRow.style.marginTop, '186px');
  assert.equal(fixture.healthValue.style.visibility, 'collapse');

  fixture.fill.actuallayoutwidth = 6.9;
  fixture.harness.scheduler.runNext();
  assert.equal(fixture.counter.text, '10%');
  assert.equal(fixture.counter.style.washColor, '#112233');

  dispatchColorSnapshot(fixture, 2, { enabled: false });
  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.unitShieldbarValue.style.visibility, 'visible');
});

test('v2 retries one incomplete live bar without polling complete bars', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    readoutVisible: true,
  });
  assert.equal(
    fixture.harness.scheduler.jobs.some((job) => job.delay === 0.05),
    false,
  );

  fixture.fill.DeleteAsync();
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(
    fixture.harness.scheduler.jobs.some((job) => job.delay === 0.05),
    true,
  );
  fixture.activeParent.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: 25,
    style: { washColor: '' },
    findCounts: fixture.harness.findCounts,
    operationCounts: fixture.harness.operationCounts,
  }));
  fixture.harness.scheduler.runByDelay(0.05);

  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.counterMax.text, '');
  assert.equal(
    fixture.harness.scheduler.jobs.some((job) => job.delay === 0.05),
    false,
  );
});

test('v2 ignores an out-of-line retired bar decoy and uses the static primary bar', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    pipsVisible: true,
  }, 1, '400', true);

  assert.equal(fixture.healthValue.text, '400');
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  assert.equal(fixture.counter.text, '');
  assert.equal(fixture.counterMax.text, '');
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.stockFill.style.washColor, '');
  assert.equal(fixture.stockPip, null);
  assert.equal(fixture.secondaryShieldFill.style.backgroundColor, '#DDAA11');
});

test('v2 scopes duplicate stock IDs to its own WorldUIRoot and WindowRoot', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    pipsVisible: true,
  }, 1, '300', false, true);

  assert.equal(fixture.healthValue.text, '300');
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  assert.equal(fixture.counter.text, '');
  assert.equal(fixture.counterMax.text, '');
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.siblingCounter.text, '');
  assert.equal(fixture.siblingFill.style.washColor, '');
  const siblingHealth = fixture.root.FindChildTraverse('WorldUIRootSibling')
    .FindChildTraverse('UnitHealthbarValue');
  const siblingParent = siblingHealth.GetParent();
  assert.equal(siblingParent.id, 'InfoHealthContainer');
  assert.equal(siblingHealth.text, '900');
  assert.deepEqual(siblingHealth.styleWrites, []);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  assert.equal(siblingHealth.GetParent(), siblingParent);
  assert.deepEqual(siblingHealth.styleWrites, []);
  assert.equal(fixture.secondaryShieldFill.style.backgroundColor, '#DDAA11');
});

test('v2 never adopts a reparented shield inner and binds a late replacement primary', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    widthScale: 230,
  });
  const retiredFill = fixture.fill;
  fixture.inner.SetParent(fixture.secondaryShield.shieldbar);
  fixture.healthbar.DeleteAsync();
  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.counter.text, '');
  assert.equal(fixture.secondaryShieldFill.style.backgroundColor, '#DDAA11');
  assert.notEqual(retiredFill.style.washColor, '#123456');

  const replacement = addLiveHealthbar(
    fixture.healthbars,
    fixture.harness,
    '450',
    34.5,
  );
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(replacement.fill.style.washColor, '#123456');
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  assert.equal(fixture.counter.text, '');
  assert.equal(fixture.secondaryShieldFill.style.backgroundColor, '#DDAA11');
});

test('v2 restores all owned styles before dropping the primary lineage', () => {
  const stock = {
    width: '76px',
    maxWidth: '80px',
    height: '18px',
    transform: 'translateX(5px)',
    preTransformScale2d: '0.95, 1',
    transformOrigin: '45% 55%',
    opacity: '0.75',
    ultBackgroundOpacity: '0.8',
    unitStatusTransform: 'translateX(4px)',
  };
  const fixture = makeStatusFixture(
    'enemy',
    {
      enabled: true,
      enemyColor: '#123456',
      enemyVisible: false,
      widthScale: 160,
      heightScale: 140,
      positionX: 80,
      positionY: 40,
      readoutVisible: true,
      pipsVisible: false,
      levelsVisible: false,
      enemyPulseEnabled: true,
      enemyPulseThreshold: 100,
      enemyPulseReadout: true,
    },
    1,
    '300',
    false,
    false,
    false,
    true,
    null,
    stock,
  );
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '1.6, 1.4');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 50%');
  assert.equal(
    fixture.healthbars.style.transform,
    'translateX(8px) translateY(4px)',
  );
  assert.equal(fixture.healthbar.style.height, stock.height);
  assert.equal(fixture.healthbar.style.width, stock.width);
  assert.equal(fixture.healthbar.style.maxWidth, stock.maxWidth);
  assert.equal(fixture.healthbar.style.preTransformScale2d, stock.preTransformScale2d);
  assert.equal(fixture.healthbar.style.transformOrigin, stock.transformOrigin);
  assert.equal(fixture.unitStatus.style.transform, stock.unitStatusTransform);
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.counterMax.text, '');
  assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteEnemyPlayer'), true);
  assert.equal(fixture.staminaContainer.BHasClass('HPColorsRewriteStaminaOwned'), false);

  // Release a still-valid tree: invalid/deleted panels cannot accept writes.
  fixture.healthbar.SetHasClass('UnitHealthbarContainer', false);
  fixture.harness.scheduler.runByDelay(1);

  assert.equal(fixture.fill.style.washColor, '#FD4949');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthbar.style.height, stock.height);
  assert.equal(fixture.healthbar.style.transform, stock.transform);
  assert.equal(fixture.healthbar.style.preTransformScale2d, stock.preTransformScale2d);
  assert.equal(fixture.healthbar.style.transformOrigin, stock.transformOrigin);
  assert.equal(fixture.healthbar.style.opacity, stock.opacity);
  assert.equal(fixture.unitStatus.style.transform, stock.unitStatusTransform);
  assert.equal(fixture.infoBg.style.opacity, stock.ultBackgroundOpacity);
  assert.equal(fixture.counter.style.visibility, 'collapse');
  assert.equal(fixture.counter.text, '');
  assert.equal(fixture.counterMax.text, '');
  assert.equal(fixture.pipLines.style.visibility, '');
  assert.equal(fixture.levelContainer.style.visibility, '');
  assert.match(cssBlock(read(stylePath), '.WindowRoot #LevelContainer.NP_playerlevel_container'), /visibility:\s*collapse/);
  assert.equal(fixture.fill.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(fixture.counter.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(fixture.healthValue.BHasClass('HPColorsRewritePulse'), false);
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.GetParent(), fixture.infoHealth);
  assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteEnemyPlayer'), false);
  assert.equal(fixture.secondaryShieldFill.style.backgroundColor, '#DDAA11');
});


test('v2 rejects ambiguous relation ownership and restores stock styles', () => {
  const fixture = makeStatusFixture('ambiguous', {
    enabled: true,
    enemyColor: '#123456',
    allyColor: '#ABCDEF',
  });

  assert.equal(fixture.fill.style.washColor, '');
  assert.equal(fixture.counter.style.visibility, 'collapse');
});


test('v2 unregisters its config event and cancels work when context dies', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
  });
  assert.equal(typeof fixture.harness.handlers.ClientUI_FireOutput, 'function');
  assert.ok(fixture.harness.scheduler.jobs.length > 0);

  fixture.unitStatus.valid = false;
  fixture.harness.scheduler.runNext();

  assert.equal(fixture.harness.handlers.ClientUI_FireOutput, undefined);
  assert.equal(fixture.harness.unregisterCalls.length, 1);
  assert.equal(fixture.harness.scheduler.jobs.length, 0);
});

test('v2 scales the measured native stack around the primary outer center', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true, enemyColor: '#123456',
    widthScale: 230, heightScale: 160, positionX: 300, positionY: 200,
  });
  assert.equal(fixture.unitStatus.actuallayoutwidth, 100);
  assert.equal(fixture.unitStatus.actuallayoutheight, 40);
  assert.equal(fixture.healthbar.actuallayoutwidth, 76);
  assert.equal(fixture.healthbar.actuallayoutheight, 18);
  assert.equal(fixture.inner.actuallayoutwidth, 69);
  assert.equal(fixture.inner.actuallayoutheight, 12);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.3, 1.6');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 50%');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [30, 20]);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.height, '');
  assert.equal(fixture.unitStatus.style.transform, '');
  assert.equal(fixture.counterContainer.style.transform, undefined);
  // Neither origin axis is a constant: use a non-centered primary.
  fixture.healthbars.actuallayoutheight = 80;
  fixture.healthbar.actualxoffset = 5;
  fixture.healthbar.actualyoffset = 4;
  fixture.healthbar.actuallayoutwidth = 60;
  fixture.healthbar.actuallayoutheight = 12;
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.healthbars.style.transformOrigin, '35% 12.5%');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.3, 1.6');
});

test('v2 maps positive and negative legacy position units without moving UnitStatus', () => {
  const fixture = makeStatusFixture('enemy', { positionX: 300, positionY: 200 });
  assert.deepEqual(translation(fixture.healthbars.style.transform), [30, 20]);
  dispatchColorSnapshot(fixture, 2, { positionX: -300, positionY: -200 });
  assert.deepEqual(translation(fixture.healthbars.style.transform), [-30, -20]);
  assert.equal(fixture.healthbar.style.transform, '');
  assert.equal(fixture.healthbar.style.marginLeft, undefined);
  assert.equal(fixture.healthbar.style.marginBottom, undefined);
  assert.equal(fixture.unitStatus.style.transform, '');
  const style = read(stylePath);
  for (const selector of ['.WindowRoot', '.WindowRoot #UnitStatus',
    '#InfoHealthContainer', '.WindowRoot #UnitHealthbarsContainer'])
    assert.match(cssBlock(style, selector), /overflow\s*:\s*noclip\s*;/);
});

test('v2 clamps native readout offsets across the canvas and retains the percent frame', () => {
  const fixture = makeStatusFixture('enemy', {
    readoutVisible: true, readoutSize: 140, readoutOffsetX: 405, readoutOffsetY: 840,
  });
  assert.equal(fixture.counterAnchor.style.transform, '');
  assert.equal(fixture.counterRow.style.marginLeft, '152px');
  assert.equal(fixture.counterRow.style.marginTop, '186px');
  assert.equal(fixture.healthValue.style.fontSize, '14px');
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  assert.equal(fixture.counterContainer.GetParent(), fixture.windowRoot);
  const style = read(stylePath);
  for (const selector of ['.WindowRoot #hp_counter_container', '.WindowRoot #hp_counter_anchor',
    '.WindowRoot #hp_counter_row'])
    assert.match(cssBlock(style, selector), /overflow\s*:\s*noclip\s*;/);
});

test('v2 default and pulse readouts use zero-based 1:1 CSS pixel offsets plus native bar translation', () => {
  for (const entry of [
    { role: 'enemy', values: {}, offsetX: 'readoutOffsetX', offsetY: 'readoutOffsetY' },
    { role: 'ally', values: { allyReadoutVisible: true },
      offsetX: 'allyReadoutOffsetX', offsetY: 'allyReadoutOffsetY' },
    { role: 'enemy', values: {
      enemyPulseEnabled: true, enemyPulseThreshold: 100, enemyPulseReadoutModifiers: true,
    }, offsetX: 'enemyPulseReadoutOffsetX', offsetY: 'enemyPulseReadoutOffsetY' },
  ]) {
    const fixture = makeStatusFixture(entry.role, entry.values);
    const baselineLeft = entry.role === 'ally' ? 82 : 92;
    assert.equal(fixture.counterAnchor.style.transform, '', entry.role);
    assert.equal(fixture.counterRow.style.marginLeft, baselineLeft + 'px');
    assert.equal(fixture.counterRow.style.marginTop, '66px');
    dispatchColorSnapshot(fixture, 2, { ...entry.values, [entry.offsetX]: 50 });
    assert.equal(fixture.counterRow.style.marginLeft, (baselineLeft + 50) + 'px', entry.offsetX);
    dispatchColorSnapshot(fixture, 3, {
      ...entry.values, [entry.offsetX]: 50, [entry.offsetY]: -100,
      positionX: 200, positionY: -100,
    });
    assert.equal(fixture.counterAnchor.style.transform, '');
    assert.equal(fixture.counterRow.style.marginLeft, '152px', entry.offsetY);
    assert.equal(fixture.counterRow.style.marginTop, '0px', entry.offsetY);
    dispatchColorSnapshot(fixture, 4, entry.values);
    assert.equal(fixture.counterRow.style.marginLeft, baselineLeft + 'px');
    assert.equal(fixture.counterRow.style.marginTop, '66px');
  }
});

test('v2 full-canvas readout frame grows left from the stock label edge and level margins retain their baseline', () => {
  const css = read(stylePath);
  assert.doesNotMatch(css, /HPColorsRewriteNativeReadout|NATIVE_READOUT_BASE_X/);
  assert.doesNotMatch(read(colorConsumerPath), /HPColorsRewriteNativeReadout|NATIVE_READOUT_BASE_X/);
  const ownedCss = css.slice(css.indexOf('/* Rewrite-owned additions'));
  for (const suffix of ['', '.HPColorsRewritePulseSubtle', '.HPColorsRewritePulseIntense'])
    assert.ok(ownedCss.includes('.WindowRoot #hp_counter_row #UnitHealthbarValue.HPColorsRewritePulse' + suffix + ','),
      `native pulse selector ${suffix}`);
  const native = cssBlock(css, '.WindowRoot #hp_counter_row #UnitHealthbarValue');
  for (const property of ['horizontal-align: left', 'vertical-align: top', 'margin: 0px',
    'padding: 0px', 'transform: none', 'white-space: nowrap', 'overflow: noclip'])
    assert.ok(native.includes(property), `adopted label ${property}`);
  assert.doesNotMatch(read(colorConsumerPath), /hp_counter_native/);
  const container = cssBlock(css, '.WindowRoot #hp_counter_container');
  for (const property of [
    'width: 100%', 'height: 100%', 'horizontal-align: center', 'vertical-align: top',
    'margin-top: 0px', 'ignore-parent-flow: true', 'overflow: noclip', 'z-index: 30',
  ]) assert.ok(container.includes(property), property);
  assert.doesNotMatch(container, /transform:\s*rotate/);
  assert.match(cssBlock(css, '.WindowRoot #name'), /transform:\s*none/);
  // Detached from #UnitStatus, the frame mirrors its damage wiggle and hidden states.
  assert.match(cssBlock(css, '.active_damage #hp_counter_container'), /animation-name:\s*active_damage_wiggle/);
  for (const hidden of ['.health_hidden', '.GameStatePreGame', '.beingSpectatedInEye',
    '.health_particle_active', '.neutral_vault', '.midboss'])
    assert.ok(new RegExp(`\\${hidden} #hp_counter_container[\\s\\S]*?visibility:\\s*collapse`).test(css), hidden);
  // Fallback resource geometry; measured bounds and reflow are tested in the style VM.
  const anchor = cssBlock(css, '.WindowRoot #hp_counter_anchor');
  for (const property of ['width: 200px', 'height: 210px', 'horizontal-align: left',
    'vertical-align: top'])
    assert.ok(anchor.includes(property), `anchor ${property}`);
  assert.doesNotMatch(anchor, /fit-children|margin-top|transform/);
  assert.doesNotMatch(css, /hp_counter_slot/);
  const row = cssBlock(css, '.WindowRoot #hp_counter_row');
  for (const property of ['width: fit-children', 'height: fit-children', 'horizontal-align: left',
    'vertical-align: top', 'margin-top: 66px', 'flow-children: right', 'margin-right: 0px',
    'margin-left: 0px', 'padding: 4px'])
    assert.ok(row.includes(property), `row ${property}`);
  const level = cssBlock(css, '.WindowRoot #LevelContainer.NP_playerlevel_container');
  assert.match(level, /margin-left:\s*-23px/);
  assert.match(level, /margin-top:\s*-14px/);
  assert.match(cssBlock(css, '.WindowRoot #UnitStatus'), /overflow:\s*noclip/);
  const fixture = makeStatusFixture('enemy', {});
  for (const panel of [fixture.levelContainer, fixture.unitInfo]) {
    assert.equal(panel.style.marginLeft, '');
    assert.equal(panel.style.marginTop, '');
  }
  assert.ok(fixture.levelContainer.actualxoffset + fixture.levelContainer.actuallayoutwidth
    < fixture.unitInfo.actualxoffset, 'CSS baseline places the badge left of the ult');
  assert.equal(fixture.levelContainer.actualyoffset + fixture.levelContainer.actuallayoutheight / 2,
    fixture.unitInfo.actualyoffset + fixture.unitInfo.actuallayoutheight / 2);
  assert.match(cssBlock(css, '.unit_info_panel'), /margin-top:\s*-14px/);
  dispatchColorSnapshot(fixture, 2, { levelOffsetX: 100, levelOffsetY: 100 });
  assert.equal(fixture.levelContainer.style.marginLeft, '-13px');
  assert.equal(fixture.levelContainer.style.marginTop, '6px');
  dispatchColorSnapshot(fixture, 3, {});
  assert.equal(fixture.levelContainer.style.marginLeft, '');
  assert.equal(fixture.levelContainer.style.marginTop, '');
});

test('v2 overview layout reset applies immediately without changing engine geometry', () => {
  const stock = {
    width: '76px', maxWidth: '80px', height: '18px',
    transform: 'translateX(5px)', opacity: '1',
    ultBackgroundOpacity: '0.8', unitStatusTransform: 'translateX(4px)',
  };
  const fixture = makeStatusFixture('enemy', {
    widthScale: 230, heightScale: 160, positionX: 300, positionY: 200,
  }, 1, '300', false, false, false, true, null, stock);
  assert.deepEqual(translation(fixture.healthbars.style.transform), [30, 20]);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.3, 1.6');
  dispatchColorSnapshot(fixture, 2, {
    widthScale: 100, heightScale: 100, positionX: 0, positionY: 0,
  });
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  for (const property of ['width', 'maxWidth', 'height', 'transform'])
    assert.equal(fixture.healthbar.style[property], stock[property]);
  assert.equal(fixture.unitStatus.style.transform, stock.unitStatusTransform);
  assert.equal(fixture.levelContainer.style.marginLeft, '');
  assert.equal(fixture.levelContainer.style.marginTop, '');
  assert.equal(fixture.unitInfo.style.marginLeft, '');
  assert.equal(fixture.unitInfo.style.marginTop, '');
});

test('v2 late optional panel discovery cannot contaminate the stock layout baseline', () => {
  const fixture = makeStatusFixture('enemy', {
    widthScale: 230, heightScale: 160, positionX: 300, positionY: 200,
  });
  fixture.ult.DeleteAsync(0);
  const replacement = fixture.infoBg.add(new MockPanel('unit_ult_ready_icon', {
    style: { washColor: '' },
    findCounts: fixture.harness.findCounts,
    operationCounts: fixture.harness.operationCounts,
  }));
  fixture.harness.scheduler.runByDelay(1);
  dispatchColorSnapshot(fixture, 2, {
    widthScale: 100, heightScale: 100, positionX: 0, positionY: 0,
  });
  assert.equal(replacement.style.washColor, fixture.fill.style.washColor);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.unitInfo.style.marginTop, '');
  dispatchColorSnapshot(fixture, 3, { enabled: false });
  assert.equal(fixture.unitInfo.style.marginLeft, '');
  assert.equal(fixture.unitInfo.style.marginTop, '');
});

test('v2 layout reset survives an incomplete required-part refresh', () => {
  const fixture = makeStatusFixture('enemy', {
    widthScale: 230, heightScale: 160, positionX: 300, positionY: 200,
  });
  fixture.fill.DeleteAsync(0);
  dispatchColorSnapshot(fixture, 2, {
    widthScale: 100, heightScale: 100, positionX: 0, positionY: 0,
  });
  const replacement = fixture.inner.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: 40, style: { washColor: '' },
    findCounts: fixture.harness.findCounts,
    operationCounts: fixture.harness.operationCounts,
  }));
  fixture.harness.scheduler.runByDelay(1);
  assert.match(replacement.style.washColor, /^#[0-9a-f]{6}$/i);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.height, '');
});

test('v2 scan repairs custom scale without touching engine-owned width or clipping', () => {
  const fixture = makeStatusFixture('enemy', {
    widthScale: 230, positionX: 300, positionY: 200,
  });
  fixture.healthbar.style.width = '72px';
  fixture.healthbar.style.maxWidth = '80px';
  fixture.healthbars.style.preTransformScale2d = '1, 1';
  fixture.windowRoot.style.overflow = 'clip';
  fixture.unitStatus.style.overflow = 'clip';
  fixture.infoHealth.style.overflow = 'clip';
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.healthbar.style.width, '72px');
  assert.equal(fixture.healthbar.style.maxWidth, '80px');
  assert.equal(fixture.healthbars.style.preTransformScale2d, '2.3, 1');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 50%');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [30, 20]);
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transform, '');
  for (const panel of [fixture.windowRoot, fixture.unitStatus, fixture.infoHealth])
    assert.equal(panel.style.overflow, 'clip');
});

test('v2 ally bar reset restores visibility and ultimate opacity immediately', () => {
  const stock = {
    width: '76px', maxWidth: '80px', height: '18px', transform: '',
    opacity: '0.9', ultBackgroundOpacity: '0.8',
  };
  const fixture = makeStatusFixture('ally', {
    allyEnabled: true, allyVisible: false, allyTeamHigh: true,
  }, 1, '300', false, false, false, true, null, stock);
  assert.equal(fixture.healthbar.style.opacity, '0.01');
  dispatchColorSnapshot(fixture, 2, {
    allyEnabled: false, allyVisible: true, allyTeamHigh: false,
  });
  assert.equal(fixture.healthbar.style.opacity, stock.opacity);
  assert.equal(fixture.infoBg.style.opacity, stock.ultBackgroundOpacity);
});

test('v2 preset apply updates layout and ally visibility on existing panels', () => {
  const enemy = makeStatusFixture('enemy', {});
  dispatchColorSnapshot(enemy, 2, { widthScale: 230, positionX: 300 });
  assert.deepEqual(translation(enemy.healthbars.style.transform), [30, 0]);
  assert.equal(enemy.healthbars.style.preTransformScale2d, '2.3, 1');
  assert.equal(enemy.healthbars.style.transformOrigin, '50% 50%');
  assert.equal(enemy.healthbar.style.width, '');
  assert.equal(enemy.healthbar.style.maxWidth, '');
  assert.equal(enemy.healthbar.style.preTransformScale2d, '');
  assert.equal(enemy.unitStatus.style.transform, '');
  const ally = makeStatusFixture('ally', { allyEnabled: false });
  dispatchColorSnapshot(ally, 2, { allyEnabled: true, allyVisible: false });
  assert.equal(ally.healthbar.style.opacity, '0.01');
});

test('v2 measured indicator gaps follow changing native widths and restore on bypass', () => {
  const fixture = makeStatusFixture('enemy', { widthScale: 230 });
  // Scaling the 76px primary by 2.3 moves its left edge by -49.4px.
  assert.equal(fixture.levelContainer.style.marginLeft, '-72.4px');
  assert.equal(fixture.unitInfo.style.marginLeft, '-49.4px');
  assert.equal(fixture.levelContainer.style.marginTop, '');
  assert.equal(fixture.unitInfo.style.marginTop, '');
  fixture.healthbar.actuallayoutwidth = 60;
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.healthbars.style.transformOrigin, '42% 50%');
  assert.equal(fixture.levelContainer.style.marginLeft, '-62px');
  assert.equal(fixture.unitInfo.style.marginLeft, '-39px');
  dispatchColorSnapshot(fixture, 2, { widthScale: 100 });
  assert.equal(fixture.levelContainer.style.marginLeft, '');
  assert.equal(fixture.unitInfo.style.marginLeft, '');
  dispatchColorSnapshot(fixture, 3, { enabled: false });
  assert.equal(fixture.levelContainer.style.marginLeft, '');
  assert.equal(fixture.levelContainer.style.marginTop, '');
  assert.equal(fixture.unitInfo.style.marginLeft, '');
  assert.equal(fixture.unitInfo.style.marginTop, '');
});

test('ally and enemy icons follow native translation without scaling the offset', () => {
  for (const role of ['ally', 'enemy']) {
    const fixture = makeStatusFixture(role, { widthScale: 230 });
    const initialIconX = parseFloat(fixture.unitInfo.style.marginLeft);
    const initialLevelX = parseFloat(fixture.levelContainer.style.marginLeft);
    let revision = 1;
    for (const positionX of [300, -300, 0]) {
      dispatchColorSnapshot(fixture, ++revision, { widthScale: 230, positionX });
      assert.ok(Math.abs(parseFloat(fixture.unitInfo.style.marginLeft) - initialIconX - positionX / 10) < 1e-8, role);
      assert.ok(Math.abs(parseFloat(fixture.levelContainer.style.marginLeft) - initialLevelX - positionX / 10) < 1e-8, role);
    }
  }
});

test('layout reset writes zero translation before another native layout update', () => {
  for (const role of ['ally', 'enemy']) {
    const fixture = makeStatusFixture(role, { widthScale: 230, positionX: -300 });
    let renderedTransform = fixture.healthbars.style.transform;
    fixture.healthbars.style = new Proxy(fixture.healthbars.style, {
      set(target, property, value) {
        if (property === 'transform' && value !== null && value !== '')
          renderedTransform = value;
        target[property] = value;
        return true;
      },
    });
    dispatchColorSnapshot(fixture, 2, {
      widthScale: 100, heightScale: 100, positionX: 0, positionY: 0,
    });
    assert.deepEqual(translation(renderedTransform), [0, 0], role);
  }
});

test('indicator centers preserve measured vertical gaps and mapped anchored offsets', () => {
  const fixture = makeStatusFixture('enemy', {});
  dispatchColorSnapshot(fixture, 2, { heightScale: 160, positionY: 200 });
  assert.equal(fixture.levelContainer.style.marginTop, '17.6px');
  assert.equal(fixture.unitInfo.style.marginTop, '17.6px');
  dispatchColorSnapshot(fixture, 3, { heightScale: 60, positionY: -200 });
  assert.equal(fixture.levelContainer.style.marginTop, '-48.4px');
  assert.equal(fixture.unitInfo.style.marginTop, '-48.4px');
  dispatchColorSnapshot(fixture, 4, {
    accessoryAnchorEnabled: false, widthScale: 230, heightScale: 100,
    positionX: 80, positionY: 30, levelOffsetX: -63, ultOffsetX: 245,
    levelOffsetY: 30, ultOffsetY: -20,
  });
  assert.equal(fixture.levelContainer.style.marginLeft, '-86.89px');
  assert.equal(fixture.unitInfo.style.marginLeft, '6.95px');
  assert.equal(fixture.levelContainer.style.marginTop, '-8px');
  assert.equal(fixture.unitInfo.style.marginTop, '-18px');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [8, 3]);
  dispatchColorSnapshot(fixture, 5, {
    accessoryAnchorEnabled: false, widthScale: 60,
    levelOffsetX: -63, ultOffsetX: 245,
  });
  assert.equal(fixture.levelContainer.style.marginLeft, '-11.58px');
  assert.equal(fixture.unitInfo.style.marginLeft, '29.9px');
});

test('indicator geometry stays aligned at maximum native scale and negative offset', () => {
  const fixture = makeStatusFixture('enemy', {
    widthScale: 230, heightScale: 160, positionX: -200, positionY: -200,
  });
  assert.equal(fixture.levelContainer.style.marginTop, '-62.4px');
  assert.equal(fixture.unitInfo.style.marginTop, '-62.4px');
});

test('v2 damage transitions never write engine layer dimensions or debug logs', () => {
  for (const widthScale of [100, 230]) {
    const fixture = makeStatusFixture('enemy', {
      enemyMode: 'gradient', enemyLow: '#FD4949', enemyMid: '#FF7B00',
      enemyHigh: '#00FF00', widthScale,
    });
    fixture.healthbar.style.width = '72px';
    const enginePanels = [fixture.healthbar, fixture.inner,
      ...fixture.inner.children.filter(panel => panel.BHasClass('HealthAmount')),
      fixture.secondaryShield.shieldbar, fixture.secondaryShield.inner,
      fixture.secondaryShieldFill];
    for (const panel of enginePanels) panel.styleWrites.length = 0;
    fixture.unitStatus.styleWrites.length = 0;
    fixture.harness.logs.length = 0;
    for (const width of [45, 40, 40, 45]) {
      fixture.fill.actuallayoutwidth = width;
      fixture.harness.scheduler.runNext();
    }
    fixture.harness.scheduler.runByDelay(1);
    assert.equal(fixture.healthbar.style.width, '72px');
    assert.equal(fixture.healthbars.style.preTransformScale2d, widthScale === 100 ? '' : '2.3, 1');
    for (const panel of enginePanels)
      assert.deepEqual(panel.styleWrites.filter(write =>
        ['width', 'maxWidth', 'height', 'transform'].includes(write.property)), []);
    assert.deepEqual(fixture.unitStatus.styleWrites.filter(write => write.property === 'transform'), []);
    assert.deepEqual(fixture.harness.logs, []);
  }
});

test('v2 enemy stamina display settings customize only enemy stamina and preserve empty pip interiors', () => {
  const customizedValues = {
    enabled: true,
    enemyColor: '#123456',
    staminaWidth: 150,
    staminaHeight: 52.5,
    staminaOffsetX: 24,
    staminaOffsetY: -18,
    enemyStaminaColorEnabled: true,
    enemyStaminaColor: '#654321',
  };
  const fixture = makeStatusFixture('enemy', customizedValues);

  assert.equal(
    fixture.staminaContainer.style.transform,
    'translateX(2.4px) translateY(-1.8px)',
  );
  assert.equal(fixture.staminaContainer.style.washColor, '#FFFFFF');
  assert.equal(fixture.staminaContainer.BHasClass('HPColorsRewriteStaminaOwned'), true);
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.width, '15px');
    assert.equal(icon.style.height, '5.25px');
    assert.equal(icon.style.borderColor, '#654321');
  }
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#654321');
  assert.equal(fixture.staminaIcons[1].style.backgroundColor, '#654321');
  assert.equal(fixture.staminaIcons[2].style.backgroundColor, '#000000');

  dispatchColorSnapshot(fixture, 2, {
    ...customizedValues,
    enemyStaminaColor: '#ABCDEF',
  });
  assert.equal(fixture.staminaContainer.style.washColor, '#FFFFFF');
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#ABCDEF');
  assert.equal(fixture.staminaIcons[1].style.backgroundColor, '#ABCDEF');
  assert.equal(fixture.staminaIcons[2].style.backgroundColor, '#000000');
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.borderColor, '#ABCDEF');
  }

  fixture.staminaIcons[0].GetParent().SetHasClass('PipEmpty', true);
  fixture.staminaIcons[2].GetParent().SetHasClass('PipEmpty', false);
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#000000');
  assert.equal(fixture.staminaIcons[2].style.backgroundColor, '#ABCDEF');
  dispatchColorSnapshot(fixture, 3, { enabled: false });
  assert.equal(fixture.staminaContainer.style.transform, '');
  assert.equal(fixture.staminaContainer.BHasClass('HPColorsRewriteStaminaOwned'), false);
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.width, '');
    assert.equal(icon.style.height, '');
    assert.equal(icon.style.backgroundColor, '');
    assert.equal(icon.style.borderColor, '');
  }

  const ally = makeStatusFixture('ally', {
    enabled: true,
    staminaWidth: 150,
    enemyStaminaColorEnabled: true,
    enemyStaminaColor: '#654321',
  });
  assert.equal(ally.staminaContainer.style.transform, '');
  assert.equal(ally.staminaIcons[0].style.width, '');
  assert.equal(ally.staminaIcons[0].style.backgroundColor, '');
});

test('v2 stamina section reset restores stock styles immediately', () => {
  const customizedValues = {
    enabled: true,
    enemyColor: '#123456',
    staminaWidth: 150,
    staminaHeight: 52.5,
    staminaOffsetX: 24,
    staminaOffsetY: -18,
    enemyStaminaColorEnabled: true,
    enemyStaminaColor: '#654321',
  };
  const stock = {
    containerTransform: 'translateX(7px)',
    containerWashColor: '#778899',
    iconWidth: '8px',
    iconHeight: '12px',
    iconBackgroundColor: '#112233',
    iconBorderColor: '#445566',
  };
  const fixture = makeStatusFixture(
    'enemy',
    customizedValues,
    1,
    '300',
    false,
    false,
    false,
    true,
    stock,
  );
  assert.equal(fixture.staminaIcons[0].style.width, '15px');
  assert.equal(fixture.staminaIcons[0].style.backgroundColor, '#654321');

  dispatchColorSnapshot(fixture, 2, {
    ...customizedValues,
    staminaWidth: 110,
    staminaHeight: 44.8,
    staminaOffsetX: 0,
    staminaOffsetY: 0,
    enemyStaminaColorEnabled: false,
    enemyStaminaColor: '#FD4949',
  });

  assert.equal(fixture.staminaContainer.style.transform, stock.containerTransform);
  assert.equal(fixture.staminaContainer.style.washColor, stock.containerWashColor);
  assert.equal(fixture.staminaContainer.BHasClass('HPColorsRewriteStaminaOwned'), false);
  const style = read(stylePath);
  assert.match(cssBlock(style, '.StaminaPip .StaminaPipIcon'),
    /background-image:\s*url\("s2r:\/\/panorama\/images\/hud\/healthbar\/pip_stamina_filled_png\.vtex"\)/);
  assert.match(cssBlock(style, '.StaminaPip.PipEmpty .StaminaPipIcon'), /wash-color:\s*offBlack/);
  for (const icon of fixture.staminaIcons) {
    assert.equal(icon.style.width, stock.iconWidth);
    assert.equal(icon.style.height, stock.iconHeight);
    assert.equal(icon.style.backgroundColor, stock.iconBackgroundColor);
    assert.equal(icon.style.borderColor, stock.iconBorderColor);
  }
});

test('v2 clears ultimate background opacity when customization turns off', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    enemyVisible: false,
    widthScale: 160,
  });
  assert.equal(fixture.infoBg.style.opacity, '0.01');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '1.6, 1');
  assert.equal(fixture.healthbars.style.transformOrigin, '50% 50%');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');

  dispatchColorSnapshot(fixture, 2, { enabled: false });
  assert.equal(fixture.infoBg.style.opacity, '');
  assert.deepEqual(translation(fixture.healthbars.style.transform), [0, 0]);
  assert.equal(fixture.healthbars.style.preTransformScale2d, '');
  assert.equal(fixture.healthbars.style.transformOrigin, '');
  assert.equal(fixture.healthbar.style.width, '');
  assert.equal(fixture.healthbar.style.maxWidth, '');
  assert.equal(fixture.healthbar.style.preTransformScale2d, '');
  assert.equal(fixture.healthbar.style.transformOrigin, '');
});

test('v2 color pulse still dims the live healthbar fill', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    enemyPulseEnabled: true,
    enemyPulseThreshold: 100,
    enemyPulseIntensity: 1,
    enemyPulseColorEnabled: true,
    enemyPulseColorMode: 'gradient',
    enemyPulseColor: '#FF2222',
  });

  assert.equal(fixture.fill.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(fixture.fill.style.animationDuration, '0.800s');
  assert.equal(fixture.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'), true);
});

test('v2 pulses the current-only HP fallback without revealing an unverified maximum', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
    enemyPulseEnabled: true,
    enemyPulseThreshold: 100,
    enemyPulseReadout: true,
  });

  assert.equal(fixture.healthValue.BHasClass('HPColorsRewritePulse'), true);
  assert.equal(fixture.healthValue.style.animationDuration, '0.800s');
  assert.equal(fixture.healthValue.text, '300');
  assert.equal(fixture.healthValue.style.visibility, 'visible');
  assert.equal(fixture.healthValue.GetParent(), fixture.counterRow);
  for (const panel of [fixture.counter, fixture.counterMax]) {
    assert.equal(panel.BHasClass('HPColorsRewritePulse'), false);
    assert.equal(panel.style.animationDuration || '', '');
    assert.equal(panel.text, '');
    assert.equal(panel.style.visibility, 'collapse');
  }
});

test('v2 ally pulse fixed and gradient modes use the selected custom color', () => {
  const fixed = makeStatusFixture('ally', {
    enabled: true,
    allyColor: '#123456',
    allyPulseEnabled: true,
    allyPulseThreshold: 100,
    allyPulseColorEnabled: true,
    allyPulseColorMode: 'fixed',
    allyPulseColor: '#ABCDEF',
  });
  assert.equal(fixed.fill.style.washColor, '#ABCDEF');
  assert.equal(fixed.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'), false);

  const gradient = makeStatusFixture('ally', {
    enabled: true,
    allyColor: '#123456',
    allyPulseEnabled: true,
    allyPulseThreshold: 100,
    allyPulseColorEnabled: true,
    allyPulseColorMode: 'gradient',
    allyPulseColor: '#ABCDEF',
  });
  assert.equal(gradient.fill.style.washColor, '#123456');
  assert.equal(
    gradient.pulseOverlay.BHasClass('HPColorsRewriteColorPulse'),
    true,
  );
  assert.equal(gradient.pulseOverlay.style.washColor, '#ABCDEF');
});

test('v2 level visibility leaves native group centering and ultimate placement unchanged', () => {
  const fixture = makeStatusFixture('enemy', { levelsVisible: false });
  const before = {
    left: fixture.unitInfo.style.marginLeft,
    top: fixture.unitInfo.style.marginTop,
    info: fixture.infoHealth.style.transform,
    counter: fixture.counterContainer.style.transform,
  };
  assert.equal(fixture.levelContainer.style.visibility, 'collapse');
  dispatchColorSnapshot(fixture, 2, { levelsVisible: true });
  assert.equal(fixture.levelContainer.style.visibility, 'visible');
  assert.equal(fixture.unitInfo.style.marginLeft, before.left);
  assert.equal(fixture.unitInfo.style.marginTop, before.top);
  assert.equal(fixture.infoHealth.style.transform, before.info);
  assert.equal(fixture.counterContainer.style.transform, before.counter);
  for (const className of ['level_number_visible', 'level_number_hidden', 'HPColorsRewriteTeam1', 'level_tier2'])
    assert.equal(fixture.windowRoot.BHasClass(className), false);
});

test('v2 rejects malformed and stale configuration revisions', () => {
  const fixture = makeStatusFixture('enemy', {
    enabled: true,
    enemyColor: '#123456',
  }, 3);
  const handler = fixture.harness.handlers.ClientUI_FireOutput;

  dispatchColorSnapshot(fixture, 2, {
    enabled: true,
    enemyMode: 'fixed',
    enemyLow: '#ABCDEF',
    enemyMid: '#ABCDEF',
    enemyHigh: '#ABCDEF',
  });
  assert.equal(fixture.fill.style.washColor, '#123456');

  dispatchColorSnapshot(fixture, 3, {
    enabled: true,
    enemyMode: 'fixed',
    enemyLow: '#ABCDEF',
    enemyMid: '#ABCDEF',
    enemyHigh: '#ABCDEF',
  });
  assert.equal(fixture.fill.style.washColor, '#123456');

  handler(makeSnapshot(undefined, {
    enabled: true,
    enemyMode: 'fixed',
    enemyLow: '#ABCDEF',
    enemyMid: '#ABCDEF',
    enemyHigh: '#ABCDEF',
  }));
  assert.equal(fixture.fill.style.washColor, '#123456');
});

test('Appearance player label ownership survives surface changes and releases on retirement', () => {
  const values = {
    criticalIndicatorVisible: false, playerNamesVisible: false,
    enemyEnabled: false, npcEnemyEnabled: true, npcNeutralEnabled: true,
  };
  const fixture = makeStatusFixture('enemy', values, 1, '300', true, true);
  const primaryParts = [fixture.healthbar, fixture.inner, fixture.lines];
  assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteHideCritical'), true);
  assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteHidePlayerName'), true);
  for (const part of [fixture.secondaryShield.shieldbar,
    fixture.secondaryShield.shieldbar.FindChildTraverse('UnitHealthbarInner'),
    fixture.siblingFill, fixture.stockFill, fixture.shieldValue])
    assert.equal(part.style.opacityMask || '', '');
  assert.equal(fixture.namePanel.style.visibility || '', '');
  assert.equal(fixture.critical.style.visibility || '', '');
  fixture.worldRoot.RemoveClass('player');
  fixture.worldRoot.RemoveClass('CLASS_PLAYER');
  fixture.worldRoot.AddClass('creature');
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteHideCritical'), false);
  assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteHidePlayerName'), false);
  fixture.worldRoot.AddClass('team_neutral');
  fixture.harness.scheduler.runByDelay(1);
  for (const part of primaryParts) assert.equal(part.style.opacityMask || '', '');
  fixture.worldRoot.RemoveClass('team_neutral');
  fixture.worldRoot.RemoveClass('creature');
  fixture.worldRoot.AddClass('player');
  fixture.harness.scheduler.runByDelay(1);
  fixture.healthbar.SetParent(fixture.infoHealth);
  fixture.harness.scheduler.runByDelay(1);
  for (const part of primaryParts) assert.equal(part.style.opacityMask || '', '');
  assert.equal(fixture.windowRoot.BHasClass('HPColorsRewriteHideCritical'), false);
});

test('Appearance optional labels and lines do not block colors or create retries', () => {
  const fixture = makeStatusFixture('enemy', { enemyColor: '#123456' });
  fixture.namePanel.DeleteAsync();
  fixture.critical.DeleteAsync();
  fixture.lines.DeleteAsync();
  fixture.harness.scheduler.runByDelay(1);
  fixture.root.SetAttributeString('hp_colors_v2_config', makeSnapshot(2, {
    enemyMode: 'fixed', enemyLow: '#123456', enemyMid: '#123456', enemyHigh: '#123456',
    criticalIndicatorVisible: false, playerNamesVisible: false,
  }));
  fixture.harness.scheduler.runByDelay(1);
  assert.equal(fixture.fill.style.washColor, '#123456');
  assert.equal(fixture.harness.scheduler.jobs.some(job => job.delay === 0.05), false);
});

test('Appearance collapse CSS leaves stock critical effects intact', () => {
  const css = read(stylePath);
  for (const [owner, id] of [
    ['HPColorsRewriteHideCritical', 'CriticalIndicator'],
    ['HPColorsRewriteHidePlayerName', 'name'],
  ]) {
    const expression = new RegExp('\\.WindowRoot\\.' + owner + ' #' + id + '\\s*\\{([^}]+)\\}');
    assert.equal(css.match(expression)[1].trim(), 'visibility: collapse;');
  }
  assert.doesNotMatch(css, /opacity-mask:/);
  for (const name of ['healthCritFlash', 'healthCritFlash2', 'healthCritFlash3', 'allyHealthFlash'])
    assert.match(css, new RegExp('@keyframes.*' + name));
  assert.doesNotMatch(css, /HPColorsRewriteHide[^{}]*\{[^}]*opacity-mask/);
  assert.doesNotMatch(css, /HPColorsRewriteHide[^{}]*\{[^}]*visibility:\s*visible/);
});

test('Appearance primary replacement preserves external inline masks and leaves geometry unchanged', () => {
  const values = {
    criticalIndicatorVisible: false, playerNamesVisible: false,
    widthScale: 230, heightScale: 160, enemyKillMarkerEnabled: true,
    enemyKillMarkerThreshold: 18, enemyKillMarkerWidth: 30, readoutFormat: 'percent',
  };
  const fixture = makeStatusFixture('enemy', values);
  const geometry = [fixture.healthbars.style.preTransformScale2d, fixture.counter.text,
    fixture.killMarker.style.marginLeft, fixture.killMarker.style.width];
  dispatchColorSnapshot(fixture, 2, { ...values, criticalIndicatorVisible: true });
  assert.deepEqual([fixture.healthbars.style.preTransformScale2d, fixture.counter.text,
    fixture.killMarker.style.marginLeft, fixture.killMarker.style.width], geometry);
  dispatchColorSnapshot(fixture, 3, values);
  const oldParts = [fixture.healthbar, fixture.inner, fixture.lines];
  fixture.healthbar.SetParent(fixture.infoHealth);
  const replacement = addLiveHealthbar(fixture.healthbars, fixture.harness, '300', 34.5);
  replacement.primary.style.opacityMask = 'primary-original';
  fixture.harness.scheduler.runByDelay(1);
  for (const part of oldParts) assert.equal(part.style.opacityMask || '', '');
  assert.equal(replacement.primary.style.opacityMask, 'primary-original');
  dispatchColorSnapshot(fixture, 4, { ...values, enabled: false });
  assert.equal(replacement.primary.style.opacityMask, 'primary-original');
  assert.equal(replacement.inner.style.opacityMask || '', '');
  assert.equal(replacement.lines.style.opacityMask || '', '');
});
