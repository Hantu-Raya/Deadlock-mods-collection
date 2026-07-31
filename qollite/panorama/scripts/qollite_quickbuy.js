(() => {
	'use strict';

	// Too high = noticeable delay in panels updating
	// Too low = potential performance impact (maybe?)
	// 0.1 = updates every 6 frames at 60fps
	const QUICKBUY_TOTAL_UPDATE_INTERVAL_SECONDS = 0.1;
	const UMM_CHANNEL = 'ClientUI_FireOutput';
	const UMM_MANIFEST = {
		umm: 1,
		t: 'register',
		id: 'enhanced_quickbuy',
		name: 'Enhanced Quickbuy',
		settings: [
			{ id: 'enabled', type: 'toggle', label: 'Enabled', default: true,
				description: 'Enable all Enhanced Quickbuy features.' },
			{ type: 'group', label: 'Display' },
			{ id: 'show_hud_items', type: 'toggle', label: 'Show queued items on HUD', default: true,
				description: 'Show Enhanced Quickbuy information during normal gameplay.' },
			{ id: 'preview_count', type: 'slider', label: 'Items shown', min: 1, max: 5, step: 1, default: 3,
				description: 'Number of queued items shown on the HUD, including the next item.' },
			{ type: 'group', label: 'Shop' },
			{ id: 'show_queue_costs', type: 'toggle', label: 'Queue costs in shop', default: true,
				description: 'Show the cumulative cost beside each queued item in the shop.' },
			{ id: 'show_shop_total', type: 'toggle', label: 'Total queue cost in shop', default: true,
				description: 'Show the total cost of the quickbuy queue in the shop.' }
		]
	};

	const quickbuySettings = {
		enabled: true,
		show_hud_items: true,
		preview_count: 3,
		show_queue_costs: true,
		show_shop_total: true
	};

	const QUICKBUY_PREVIEW_SLOTS = [
		{
			rootId: 'QuickbuyUpcomingPreview2',
			entryPanelId: 'QuickbuyPreview2Entry',
			soulsLabelId: 'QuickbuyUpcomingPreview2SoulsNeededLabel',
			queueIndex: 1
		},
		{
			rootId: 'QuickbuyUpcomingPreview3',
			entryPanelId: 'QuickbuyPreview3Entry',
			soulsLabelId: 'QuickbuyUpcomingPreview3SoulsNeededLabel',
			queueIndex: 2
		},
		{
			rootId: 'QuickbuyUpcomingPreview4',
			entryPanelId: 'QuickbuyPreview4Entry',
			soulsLabelId: 'QuickbuyUpcomingPreview4SoulsNeededLabel',
			queueIndex: 3
		},
		{
			rootId: 'QuickbuyUpcomingPreview5',
			entryPanelId: 'QuickbuyPreview5Entry',
			soulsLabelId: 'QuickbuyUpcomingPreview5SoulsNeededLabel',
			queueIndex: 4
		}
	];

	// TODO: Find better, automatic alternatives to hardcoding ts
	const QUICKBUY_ITEM_NAME_ALIASES = {
		'basic magazine': 'extended magazine',
		'dispel magic': 'debuff remover',
		'mystic reach': 'mystic expansion',
		'mystic regen': 'mystic regeneration',
		'improved cooldown': 'compress cooldown',
		'sharp shooter': 'sharpshooter',
		'spellslinger headshots': 'spirit rend'
	};

	// TODO: Find better, automatic alternatives to hardcoding ts
	const QUICKBUY_ICON_OVERRIDES = {
		'compress cooldown': 's2r://panorama/images/items/spirit/improved_cooldown_psd.vtex',
		'mystic expansion': 's2r://panorama/images/items/spirit/mystic_reach_psd.vtex',
		'mystic regeneration': 's2r://panorama/images/items/spirit/mystic_regen_psd.vtex',
		'debuff reducer': 's2r://panorama/images/items/vitality/debuff_reducer_psd.vtex',
		'debuff remover': 's2r://panorama/images/items/vitality/debuff_remover_psd.vtex',
		'dispel magic': 's2r://panorama/images/items/vitality/debuff_remover_psd.vtex'
	};

	const QUICKBUY_RAW_RECIPE_COMPONENTS = {
		'Alchemical Seal': ['Mystic Reach'],
		'Arcane Surge': ['Extra Stamina'],
		'Arctic Blast': ['Cold Front'],
		'Armor Piercing Rounds': ['High Velocity Rounds'],
		'Boundless Spirit': ['Improved Spirit'],
		'Burst Fire': ['Rapid Rounds'],
		'Capacitor': ['Tesla Bullets'],
		'Colossus': ['Extra Health'],
		'Crippling Headshot': ['Weakening Headshot'],
		'Crushing Fists': ['Melee Charge'],
		'Cultist Sacrifice': ['Monster Rounds'],
		'Disarming Hex': ['Rusted Barrel'],
		'Divine Barrier': ['Guardian Ward'],
		'Enduring Speed': ['Sprint Boots'],
		'Escalating Exposure': ['Mystic Vulnerability'],
		'Escalating Resilience': ['Basic Magazine'],
		'Express Shot': ['High Velocity Rounds'],
		'Focus Lens': ['Spirit Sap'],
		'Fortitude': ['Extra Health'],
		'Fury Trance': ['Bullet Lifesteal'],
		'Greater Expansion': ['Mystic Reach'],
		'Guardian Ward': ['Grit'],
		'Headhunter': ['Headshot Booster'],
		'Healing Booster': ['Extra Regen'],
		'Healing Nova': ['Healing Rite'],
		'Healing Tempo': ['Healing Booster'],
		'Improved Spirit': ['Extra Spirit'],
		'Indomitable': ['Reactive Barrier'],
		'Infuser': ['Spirit Lifesteal'],
		'Juggernaut': ['Enduring Speed'],
		'Kinetic Dash': ['Extra Stamina'],
		'Leech': ['Bullet Lifesteal', 'Spirit Lifesteal'],
		'Lifestrike': ['Melee Lifesteal'],
		'Lightning Scroll': ['Mystic Slow'],
		'Mercurial Magnum': ['Quicksilver Reload'],
		'Opening Rounds': ['High Velocity Rounds'],
		'Point Blank': ['Close Quarters'],
		'Radiant Regeneration': ['Mystic Regen'],
		'Rapid Recharge': ['Extra Charge'],
		'Reactive Barrier': ['Grit'],
		'Rescue Beam': ['Healing Rite'],
		'Sharp Shooter': ['High Velocity Rounds', 'Long Range'],
		'Spellbreaker': ['Debuff Reducer'],
		'Spellslinger Headshots': ['Spirit Shredder Bullets'],
		'Spirit Shielding': ['Grit'],
		'Spirit Snatch': ['Spirit Strike'],
		'Spiritual Overflow': ['Spirit Lifesteal'],
		'Stamina Mastery': ['Extra Stamina'],
		'Superior Cooldown': ['Improved Cooldown'],
		'Superior Duration': ['Duration Extender'],
		'Surge of Power': ['Extra Spirit'],
		'Swift Striker': ['Rapid Rounds'],
		'Tankbuster': ['Mystic Burst'],
		'Titanic Magazine': ['Basic Magazine'],
		'Transcendent Cooldown': ['Superior Cooldown'],
		'Trophy Collector': ['Sprint Boots'],
		'Unstoppable': ['Debuff Reducer'],
		'Vampiric Burst': ['Bullet Lifesteal'],
		'Veil Walker': ['Sprint Boots'],
		'Vortex Web': ['Slowing Hex'],
		'Weapon Shielding': ['Grit'],
		'Weighted Shots': ['Slowing Bullets']
	};

	const QUICKBUY_MOD_ICON_CLASS_NAMES = [
		'hasAbility',
		'isWeapon',
		'isArmor',
		'isTech',
		'isTier0',
		'isTier5',
		'HideModTierLabel',
		'isEnhanced',
		'hasUpgradeLevel',
		'Locked',
		'unowned',
		'owned',
		'newSlotUnlocked',
		'IsNewItem'
	];

	const QUICKBUY_PREVIEW_MOD_ICON_RESET_CLASS_NAMES = [
		'OnCooldown',
		'VerticalCooldown'
	];

	const QUICKBUY_TIER_CLASS_NAMES = [
		'ModTierLevel1',
		'ModTierLevel2',
		'ModTierLevel3',
		'ModTierLevel4',
		'ModTierLevel5' // Legendary
	];

	const hasOwn = (objectValue, propertyName) => {
		return Object.prototype.hasOwnProperty.call(objectValue, propertyName);
	};

	const textOrEmpty = value => {
		if (value === null || typeof value === 'undefined') {
			return '';
		}

		return value.toString();
	};

	const clampToZero = value => {
		return value < 0 ? 0 : value;
	};

	const normalizeItemName = itemNameText => {
		return textOrEmpty(itemNameText)
			.replace(/\s+/g, ' ')
			.replace(/^\s+|\s+$/g, '');
	};

	const canonicalizeItemName = itemNameText => {
		const itemKey = normalizeItemName(itemNameText)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.replace(/\s+/g, ' ')
			.replace(/^\s+|\s+$/g, '');

		if (hasOwn(QUICKBUY_ITEM_NAME_ALIASES, itemKey)) {
			return QUICKBUY_ITEM_NAME_ALIASES[itemKey];
		}

		return itemKey;
	};

	const parseSoulsCost = costText => {
		const digits = textOrEmpty(costText).match(/\d+/g);

		if (!digits || digits.length === 0) {
			return 0;
		}

		const soulsCost = parseInt(digits.join(''), 10);
		return isFinite(soulsCost) ? soulsCost : 0;
	};

	const findChild = (panel, childId) => {
		if (!panel || !panel.FindChildTraverse) {
			return null;
		}

		return panel.FindChildTraverse(childId);
	};

	const setPanelText = (panel, textValue) => {
		if (!panel) {
			return;
		}

		panel.text = textOrEmpty(textValue);
	};

	const setPanelClass = (panel, className, isEnabled) => {
		if (!panel || !panel.SetHasClass) {
			return;
		}

		panel.SetHasClass(className, !!isEnabled);
	};

	const getChildText = (panel, childId) => {
		const childPanel = findChild(panel, childId);
		return childPanel ? childPanel.text : '';
	};

	const setChildText = (panel, childId, textValue) => {
		setPanelText(findChild(panel, childId), textValue);
	};

	const findChildInAncestors = (startPanel, targetChildId) => {
		let currentPanel = startPanel;

		while (currentPanel) {
			const foundPanel = findChild(currentPanel, targetChildId);

			if (foundPanel) {
				return foundPanel;
			}

			if (!currentPanel.GetParent) {
				return null;
			}

			currentPanel = currentPanel.GetParent();
		}

		return null;
	};

	const getPanelChildren = panel => {
		if (!panel || !panel.GetChildCount || !panel.GetChild) {
			return [];
		}

		const children = [];

		for (let childIndex = 0; childIndex < panel.GetChildCount(); childIndex++) {
			children.push(panel.GetChild(childIndex));
		}

		return children;
	};

	const collectPanelsByClass = (rootPanel, className, outputPanels) => {
		if (!rootPanel) {
			return outputPanels;
		}

		if (rootPanel.BHasClass && rootPanel.BHasClass(className)) {
			outputPanels.push(rootPanel);
		}

		getPanelChildren(rootPanel).forEach(childPanel => {
			collectPanelsByClass(childPanel, className, outputPanels);
		});

		return outputPanels;
	};

	const collectQuickbuyItemPanels = queuePanel => {
		return collectPanelsByClass(queuePanel, 'QuickbuyItem', []);
	};

	const createQuickbuyQueueEntry = itemPanel => {
		const itemName = normalizeItemName(getChildText(itemPanel, 'ModName'));

		return {
			itemPanel: itemPanel,
			itemName: itemName,
			itemKey: canonicalizeItemName(itemName),
			baseSoulsCost: parseSoulsCost(getChildText(itemPanel, 'ModCost')),
			effectiveSoulsCost: 0,
			cumulativeSoulsCost: 0,
			remainingSoulsCost: 0
		};
	};

	const createQuickbuySellQueueEntry = itemPanel => {
		return {
			itemPanel: itemPanel,
			sellSoulsCredit: Math.floor(parseSoulsCost(getChildText(itemPanel, 'ModCost')) / 2)
		};
	};

	const collectQuickbuyQueueEntries = quickbuyQueuePanel => {
		return collectQuickbuyItemPanels(quickbuyQueuePanel).map(createQuickbuyQueueEntry);
	};

	const collectQuickbuySellQueueEntries = quickbuySellQueuePanel => {
		return collectQuickbuyItemPanels(quickbuySellQueuePanel).map(createQuickbuySellQueueEntry);
	};

	const getCurrentSoulsAmount = () => {
		const contextPanel = $.GetContextPanel();
		const currentSoulsAmountPanel = findChildInAncestors(contextPanel, 'CurrentGoldAmount');

		if (!currentSoulsAmountPanel) {
			return 0;
		}

		return parseSoulsCost(getChildText(currentSoulsAmountPanel, 'hudCurGoldLabel'));
	};

	const getSellQueueSoulsCredit = sellQueueEntries => {
		return sellQueueEntries.reduce((totalCredit, sellEntry) => {
			return totalCredit + sellEntry.sellSoulsCredit;
		}, 0);
	};

	const buildRecipeComponents = () => {
		return Object.keys(QUICKBUY_RAW_RECIPE_COMPONENTS).reduce((recipeComponents, upgradeName) => {
			const upgradeKey = canonicalizeItemName(upgradeName);
			const componentNames = QUICKBUY_RAW_RECIPE_COMPONENTS[upgradeName];

			recipeComponents[upgradeKey] = componentNames.map(canonicalizeItemName);
			return recipeComponents;
		}, {});
	};

	const QUICKBUY_RECIPE_COMPONENTS = buildRecipeComponents();

	const resetQueueEntryCostProgress = queueEntry => {
		queueEntry.effectiveSoulsCost = queueEntry.baseSoulsCost;
		queueEntry.cumulativeSoulsCost = 0;
		queueEntry.remainingSoulsCost = 0;
	};

	const addComponentPurchaseToPool = (componentPoolByName, queueEntry, queueIndex) => {
		if (!queueEntry.itemKey) {
			return;
		}

		if (!componentPoolByName[queueEntry.itemKey]) {
			componentPoolByName[queueEntry.itemKey] = [];
		}

		componentPoolByName[queueEntry.itemKey].push({
			queueIndex: queueIndex,
			soulsCost: queueEntry.baseSoulsCost,
			isConsumed: false
		});
	};

	const buildComponentPurchasePool = queueEntries => {
		const componentPoolByName = {};

		queueEntries.forEach((queueEntry, queueIndex) => {
			resetQueueEntryCostProgress(queueEntry);
			addComponentPurchaseToPool(componentPoolByName, queueEntry, queueIndex);
		});

		return componentPoolByName;
	};

	const findAvailableEarlierComponent = (componentPool, upgradeQueueIndex) => {
		if (!componentPool) {
			return null;
		}

		return componentPool.find(componentPurchase => {
			return !componentPurchase.isConsumed && componentPurchase.queueIndex < upgradeQueueIndex;
		}) || null;
	};

	const applyRecipeDiscounts = (queueEntries, componentPoolByName) => {
		queueEntries.forEach((queueEntry, queueIndex) => {
			const requiredComponentNames = QUICKBUY_RECIPE_COMPONENTS[queueEntry.itemKey];

			if (!requiredComponentNames) {
				return;
			}

			// Discounts on upgrade
			requiredComponentNames.forEach(componentName => {
				const componentPurchase = findAvailableEarlierComponent(
					componentPoolByName[componentName],
					queueIndex
				);

				if (!componentPurchase) {
					return;
				}

				componentPurchase.isConsumed = true;
				queueEntry.effectiveSoulsCost -= componentPurchase.soulsCost;
			});
		});
	};

	const updateQueueRemainingSouls = (queueEntries, availableSoulsAmount) => {
		let runningQueueSoulsCost = 0;

		queueEntries.forEach(queueEntry => {
			queueEntry.effectiveSoulsCost = clampToZero(queueEntry.effectiveSoulsCost);
			runningQueueSoulsCost += queueEntry.effectiveSoulsCost;

			queueEntry.cumulativeSoulsCost = runningQueueSoulsCost;
			queueEntry.remainingSoulsCost = clampToZero(runningQueueSoulsCost - availableSoulsAmount);
		});

		return runningQueueSoulsCost;
	};

	const buildQuickbuyQueueCostProgress = (queueEntries, currentSoulsAmount, sellQueueEntries) => {
		const sellQueueSoulsCredit = getSellQueueSoulsCredit(sellQueueEntries);
		const availableSoulsAmount = currentSoulsAmount + sellQueueSoulsCredit;
		const componentPoolByName = buildComponentPurchasePool(queueEntries);

		applyRecipeDiscounts(queueEntries, componentPoolByName);

		const runningQueueSoulsCost = updateQueueRemainingSouls(queueEntries, availableSoulsAmount);

		// On sell
		return clampToZero(runningQueueSoulsCost - sellQueueSoulsCredit);
	};

	const updateQueueEntryRemainingSoulsPanels = queueEntries => {
		queueEntries.forEach(queueEntry => {
			if (!queueEntry.itemPanel) {
				return;
			}

			setPanelClass(
				queueEntry.itemPanel,
				'HasRemainingSoulsNeeded',
				quickbuySettings.enabled && quickbuySettings.show_queue_costs && queueEntry.remainingSoulsCost > 0
			);
			setChildText(queueEntry.itemPanel, 'QueueRemainingSoulsLabel', String(queueEntry.cumulativeSoulsCost));
		});
	};

	const getNextRemainingSouls = queueEntries => {
		if (queueEntries.length === 0) {
			return 0;
		}

		return queueEntries[0].remainingSoulsCost;
	};

	const copyPanelClasses = (targetPanel, sourcePanel, classNames) => {
		if (!targetPanel) {
			return;
		}

		classNames.forEach(className => {
			const sourceHasClass = !!(sourcePanel && sourcePanel.BHasClass && sourcePanel.BHasClass(className));
			setPanelClass(targetPanel, className, sourceHasClass);
		});
	};

	const getSourceModIconImagePath = sourceModIcon => {
		const sourceModIconImage = findChild(sourceModIcon, 'ModIconImage');

		if (!sourceModIconImage || !sourceModIconImage.GetAttributeString) {
			return '';
		}

		return sourceModIconImage.GetAttributeString('src', '');
	};

	const buildPreviewIconPath = (itemName, sourceModIcon) => {
		const canonicalItemName = canonicalizeItemName(itemName);

		if (hasOwn(QUICKBUY_ICON_OVERRIDES, canonicalItemName)) {
			return QUICKBUY_ICON_OVERRIDES[canonicalItemName];
		}

		let iconFolder = 'weapon';

		if (sourceModIcon && sourceModIcon.BHasClass) {
			if (sourceModIcon.BHasClass('isArmor')) {
				iconFolder = 'vitality';
			} else if (sourceModIcon.BHasClass('isTech')) {
				iconFolder = 'spirit';
			}
		}

		const iconName = canonicalItemName.replace(/\s+/g, '_');

		if (!iconName) {
			return '';
		}

		return `s2r://panorama/images/items/${iconFolder}/${iconName}_psd.vtex`;
	};

	const syncPreviewModIcon = (previewModIcon, sourceModIcon, itemName) => {
		if (!previewModIcon) {
			return;
		}

		QUICKBUY_PREVIEW_MOD_ICON_RESET_CLASS_NAMES.forEach(className => {
			setPanelClass(previewModIcon, className, false);
		});

		copyPanelClasses(previewModIcon, sourceModIcon, QUICKBUY_MOD_ICON_CLASS_NAMES);

		const targetModIconImage = findChild(previewModIcon, 'ModIconImage');
		const sourceImagePath = getSourceModIconImagePath(sourceModIcon);
		const iconPath = sourceImagePath || buildPreviewIconPath(itemName, sourceModIcon);

		if (targetModIconImage && targetModIconImage.SetImage) {
			targetModIconImage.SetImage(iconPath || '');
		}

		copyPanelClasses(
			findChild(previewModIcon, 'mod_tier_label'),
			findChild(sourceModIcon, 'mod_tier_label'),
			QUICKBUY_TIER_CLASS_NAMES
		);
	};

	const clearPreviewSlot = (previewRoot, previewModIcon, previewSoulsLabel) => {
		setPanelClass(previewRoot, 'HasPreviewItem', false);
		setPanelClass(previewRoot, 'CanAffordUpcoming', false);
		setPanelText(previewSoulsLabel, '0');
		syncPreviewModIcon(previewModIcon, null, '');
	};

	const updateUpcomingPreviewSlots = queueEntries => {
		const contextPanel = $.GetContextPanel();

		if (!contextPanel) {
			return;
		}

		QUICKBUY_PREVIEW_SLOTS.forEach(previewSlot => {
			const previewRoot = findChild(contextPanel, previewSlot.rootId);
			const previewEntryPanel = findChild(contextPanel, previewSlot.entryPanelId);
			const previewModIcon = findChild(previewEntryPanel, 'ModIcon');
			const previewSoulsLabel = findChild(contextPanel, previewSlot.soulsLabelId);

			if (!previewRoot) {
				return;
			}

			clearPreviewSlot(previewRoot, previewModIcon, previewSoulsLabel);

			const isWithinConfiguredCount = previewSlot.queueIndex < quickbuySettings.preview_count;
			const queueEntry = isWithinConfiguredCount ? queueEntries[previewSlot.queueIndex] : null;

			if (!quickbuySettings.enabled || !queueEntry || !queueEntry.itemPanel) {
				return;
			}

			setPanelText(previewSoulsLabel, String(queueEntry.remainingSoulsCost));
			syncPreviewModIcon(
				previewModIcon,
				findChild(queueEntry.itemPanel, 'ModIcon'),
				queueEntry.itemName
			);

			setPanelClass(previewRoot, 'HasPreviewItem', true);
			setPanelClass(previewRoot, 'CanAffordUpcoming', queueEntry.remainingSoulsCost <= 0);
		});
	};

	// --- Main update loop ---

	const updateFeatureVisibility = contextPanel => {
		const isEnabled = quickbuySettings.enabled;
		const showHudItems = isEnabled && quickbuySettings.show_hud_items;
		const nextSoulsPanel = findChild(contextPanel, 'QuickbuyNextSoulsNeeded');
		const previewContainer = findChild(contextPanel, 'QuickbuyUpcomingPreviewContainer');
		const shopTotalPanel = findChild(contextPanel, 'QuickbuyShopTotalSummary');

		if (nextSoulsPanel) {
			setPanelClass(
				nextSoulsPanel,
				'EnhancedQuickbuyHidden',
				!showHudItems
			);
		}

		if (previewContainer) {
			setPanelClass(
				previewContainer,
				'EnhancedQuickbuyHidden',
				!showHudItems || quickbuySettings.preview_count <= 1
			);
		}

		if (shopTotalPanel) {
			setPanelClass(
				shopTotalPanel,
				'EnhancedQuickbuyHidden',
				!isEnabled || !quickbuySettings.show_shop_total
			);
		}
	};

	const applyUmmSetting = (key, value) => {
		if (!hasOwn(quickbuySettings, key)) {
			return;
		}

		quickbuySettings[key] = key === 'preview_count'
			? Math.max(1, Math.min(5, Math.round(Number(value) || 1)))
			: !!value;

		const contextPanel = $.GetContextPanel();
		if (contextPanel) {
			updateFeatureVisibility(contextPanel);
		}
	};

	const announceToUmm = () => {
		$.DispatchEvent(UMM_CHANNEL, JSON.stringify(UMM_MANIFEST));
	};

	$.RegisterForUnhandledEvent(UMM_CHANNEL, payload => {
		if (typeof payload !== 'string' || payload.indexOf('"umm"') === -1) {
			return;
		}

		let message;
		try {
			message = JSON.parse(payload);
		} catch (error) {
			return;
		}

		if (!message || message.umm !== 1) {
			return;
		}

		if (message.t === 'hello') {
			announceToUmm();
		} else if (message.t === 'set' && message.id === UMM_MANIFEST.id) {
			applyUmmSetting(message.key, message.value);
		}
	});

	const scheduleNextQuickbuyUpdate = () => {
		$.Schedule(QUICKBUY_TOTAL_UPDATE_INTERVAL_SECONDS, updateQuickbuyQueueCostPanels);
	};

	const updateQuickbuyQueueCostPanels = () => {
		const contextPanel = $.GetContextPanel();

		if (!contextPanel) {
			scheduleNextQuickbuyUpdate();
			return;
		}

		const quickbuyTotalCostLabel = findChild(contextPanel, 'QuickbuyShopTotalCostLabel');
		updateFeatureVisibility(contextPanel);

		const queueEntries = collectQuickbuyQueueEntries(findChild(contextPanel, 'QuickbuyQueue'));
		const sellQueueEntries = collectQuickbuySellQueueEntries(findChild(contextPanel, 'QuickbuySellQueue'));
		const totalSoulsCost = buildQuickbuyQueueCostProgress(
			queueEntries,
			getCurrentSoulsAmount(),
			sellQueueEntries
		);

		setPanelText(quickbuyTotalCostLabel, String(totalSoulsCost));
		setPanelText(
			findChild(contextPanel, 'QuickbuyNextSoulsNeededLabel'),
			String(getNextRemainingSouls(queueEntries))
		);

		updateQueueEntryRemainingSoulsPanels(queueEntries);
		updateUpcomingPreviewSlots(queueEntries);
		scheduleNextQuickbuyUpdate();
	};

	Object.keys(quickbuySettings).forEach(settingKey => {
		applyUmmSetting(settingKey, quickbuySettings[settingKey]);
	});
	announceToUmm();
	$.Schedule(0.0, updateQuickbuyQueueCostPanels);
})();
