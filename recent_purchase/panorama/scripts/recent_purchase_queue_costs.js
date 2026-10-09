(() => {
  "use strict";

  const TICK = 0.05;
  const NEED_COLOR = '#d64259';
  const OWNED_COLOR = '#66ffd9';
  const DIVIDER_COLOR = '#d8d0c088';

  const RECIPES_RAW = {
    'Aerial Supremacy': ['Stamina Mastery'],
    'Apex Combat': ['Ricochet'],
    'Arcane Surge': ['Extra Stamina'],
    'Arctic Blast': ['Cold Front'],
    'Armor Piercer': ['High-Velocity Rounds'],
    'Ballistic Enchantment': ['Mystic Expansion'],
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
    'Escalating Resilience': ['Extended Magazine'],
    'Express Shot': ['High-Velocity Rounds'],
    'Focus Lens': ['Spirit Sap'],
    'Fortitude': ['Extra Health'],
    'Fury Trance': ['Bullet Lifesteal'],
    'Greater Expansion': ['Mystic Expansion'],
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
    'Opening Rounds': ['High-Velocity Rounds'],
    'Point Blank': ['Close Quarters'],
    'Radiant Regeneration': ['Mystic Regeneration'],
    'Rapid Recharge': ['Extra Charge'],
    'Reactive Barrier': ['Grit'],
    'Rescue Beam': ['Healing Rite'],
    'Shadow Weave': ['Sprint Boots'],
    'Sharpshooter': ['Long Range', 'High-Velocity Rounds'],
    'Spellbreaker': ['Debuff Reducer'],
    'Spirit Rend': ['Spirit Shredder'],
    'Spirit Snatch': ['Spirit Strike'],
    'Spiritual Overflow': ['Spirit Lifesteal'],
    'Spirit Shielding': ['Grit'],
    'Stamina Mastery': ['Extra Stamina'],
    'Superior Cooldown': ['Compress Cooldown'],
    'Superior Duration': ['Duration Extender'],
    'Surge of Power': ['Extra Spirit'],
    'Swift Striker': ['Rapid Rounds'],
    'Tankbuster': ['Mystic Burst'],
    'Titanic Magazine': ['Extended Magazine'],
    'Timeless Emblem': ['Transcendent Cooldown'],
    'Transcendent Cooldown': ['Superior Cooldown'],
    'Trophy Collector': ['Sprint Boots'],
    'Unstoppable': ['Debuff Reducer'],
    'Vampiric Burst': ['Bullet Lifesteal'],
    'Vortex Web': ['Slowing Hex'],
    'Weighted Shots': ['Slowing Bullets'],
    'Weapon Shielding': ['Grit'],
  };

  const RECIPES = {};

  function canon(name) {
    if (!name) return '';
    return name.toString().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function parseCost(txt) {
    if (!txt) return 0;
    const m = txt.toString().match(/\d+/g);
    return m ? parseInt(m.join(''), 10) || 0 : 0;
  }

  function formatSouls(n) {
    return String(Math.max(0, n | 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function setStyle(panel, prop, value) {
    if (!panel?.IsValid?.()) return;
    const key = '_rpStyle_' + prop;
    if (panel[key] === value) return;
    panel.style[prop] = value;
    panel[key] = value;
  }

  function styleMoneyLabel(label, color) {
    if (!label) return;
    setStyle(label, 'color', color);
    setStyle(label, 'washColor', color);
    setStyle(label, 'fontSize', '16px');
    setStyle(label, 'fontWeight', 'bold');
    setStyle(label, 'verticalAlign', 'center');
  }

  function initRecipes() {
    for (const k in RECIPES_RAW) {
      if (!RECIPES_RAW.hasOwnProperty(k)) continue;
      RECIPES[canon(k)] = RECIPES_RAW[k].map(canon);
    }
  }

  function getGold() {
    if (!_goldLabel?.IsValid?.()) {
      const root = findRoot($.GetContextPanel());
      const gold = getValidChild(root, null, 'CurrentGoldAmount');
      _goldLabel = getValidChild(gold, null, 'hudCurGoldLabel');
    }
    const text = _goldLabel ? _goldLabel.text : '';
    if (text !== _goldText) {
      _goldText = text;
      _gold = parseCost(text);
    }
    return _gold;
  }

  function getValidChild(panel, cached, id) {
    if (cached?.IsValid?.()) return cached;
    if (!panel?.IsValid?.()) return null;
    const child = panel.FindChildTraverse(id);
    return child?.IsValid?.() ? child : null;
  }

  // Private refs use dot access exclusively so Closure renames reads and writes together.
  function getItemRefs(panel) {
    const refs = panel._rpItemRefs || (panel._rpItemRefs = {});
    const cost = getValidChild(panel, refs.cost, 'ModCost');
    const name = getValidChild(panel, refs.name, 'ModName');
    refs.changed = refs.cost !== cost || refs.name !== name;
    refs.cost = cost;
    refs.name = name;
    return refs;
  }

  function getItemVisualRefs(panel) {
    const refs = getItemRefs(panel);
    const deficit = getValidChild(panel, refs.deficit, 'RecentPurchaseDeficitLabel');
    const divider = getValidChild(panel, refs.divider, 'RecentPurchaseCostDivider');
    const goldIcon = getValidChild(panel, refs.goldIcon, 'goldIcon');
    refs.changed = refs.changed || refs.deficit !== deficit || refs.divider !== divider || refs.goldIcon !== goldIcon;
    refs.deficit = deficit;
    refs.divider = divider;
    refs.goldIcon = goldIcon;
    return refs;
  }

  // Keep discovery live for inserts/reorders, but reuse records and traversal storage.
  const _stack = [];
  const _items = [];
  const _sellItems = [];

  function getItems(root, items, withVisuals) {
    let count = 0;
    let changed = false;
    _stack.length = 0;
    if (root?.IsValid?.()) _stack.push(root);
    while (_stack.length) {
      const panel = _stack.pop();
      if (!panel?.IsValid?.()) continue;
      if (panel.BHasClass && panel.BHasClass('QuickbuyItem')) {
        const refs = withVisuals ? getItemVisualRefs(panel) : getItemRefs(panel);
        const item = refs.item || (refs.item = { panel: panel });
        const name = refs.name ? refs.name.text : '';
        const costText = refs.cost ? refs.cost.text : '';
        if (items[count] !== item || refs.changed) changed = true;
        if (item.name !== name) {
          item.name = name;
          item.key = canon(name);
          changed = true;
        }
        if (item.costText !== costText) {
          item.costText = costText;
          item.base = parseCost(costText);
          changed = true;
        }
        item.refs = refs;
        items[count++] = item;
        continue;
      }
      const childCount = panel.GetChildCount();
      for (let i = childCount - 1; i >= 0; i--) _stack.push(panel.GetChild(i));
    }
    if (items.length !== count) changed = true;
    items.length = count;
    return changed;
  }

  function getSellCredit(items) {
    let credit = 0;
    for (let i = 0; i < items.length; i++) credit += Math.floor(items[i].base / 2);
    return credit;
  }

  function compute(items, souls, sellCredit) {
    const pool = {};
    let total = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.eff = it.base;
      if (!it.key) continue;
      (pool[it.key] || (pool[it.key] = [])).push({ idx: i, cost: it.base, used: false });
    }

    for (let i = 0; i < items.length; i++) {
      const comps = RECIPES[items[i].key];
      if (!comps) continue;
      for (let c = 0; c < comps.length; c++) {
        const list = pool[comps[c]];
        if (!list) continue;
        for (let j = 0; j < list.length; j++) {
          const ref = list[j];
          if (ref.used || ref.idx >= i) continue;
          items[i].eff -= ref.cost;
          ref.used = true;
          break;
        }
      }
    }

    let run = souls;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.eff < 0) it.eff = 0;
      total += it.eff;
      if (run >= it.eff) {
        it.rem = 0;
        run -= it.eff;
      } else {
        it.rem = it.eff - run;
        run = 0;
      }
    }

    return Math.max(0, total - sellCredit);
  }

  function applyLabels(items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.panel?.IsValid?.()) continue;
      const need = it.rem;
      const hasNeed = need > 0;

      const refs = it.refs;
      const lbl = refs.deficit;
      const needText = formatSouls(need);
      if (lbl) {
        const labelText = hasNeed ? '-' + needText : '0';
        if (lbl._rpText !== labelText) {
          lbl.text = labelText;
          lbl._rpText = labelText;
        }
        styleMoneyLabel(lbl, hasNeed ? NEED_COLOR : OWNED_COLOR);
      }

      const divider = refs.divider;
      styleMoneyLabel(divider, DIVIDER_COLOR);

      const modCost = refs.cost;
      const goldIcon = refs.goldIcon;
      const color = hasNeed ? NEED_COLOR : OWNED_COLOR;
      if (modCost) {
        setStyle(modCost, 'color', color);
        setStyle(goldIcon, 'washColor', color);
      }

      if (lbl) {
        lbl._lastChatMsg = hasNeed ? 'Need ' + needText + ' more for ' + (it.name || 'item') : null;
        if (hasNeed && refs.chatLabel !== lbl) {
          lbl.SetPanelEvent('onactivate', () => {
            if (lbl.IsValid() && lbl._lastChatMsg) sendQuickbuyChatMessage(lbl._lastChatMsg);
          });
          refs.chatLabel = lbl;
        }
      }
    }
  }

  // Chat helpers (adapted from buff_timer_virgin)
  let _lastChatTime = 0;
  const _chat = { panel: null, input: null, targetLabel: null };
  const CHAT_RETRY_DELAYS = [0, 0.008, 0.012, 0.016, 0.032];
  const CHAT_ALL_LABEL = "To (ALL):";

  function findRoot(p) {
    while (p?.GetParent?.()) p = p.GetParent();
    return p;
  }

  const TeamChatIntent = {
    sanitize: function (message) {
      return String(message || "").replace(/["\r\n;]/g, " ").replace(/\s+/g, " ").trim();
    },
    canSend: function (nowMs, lastSendMs, cooldownMs) {
      return Number(nowMs) - Number(lastSendMs || 0) >= Number(cooldownMs || 0);
    },
    isTeamTarget: function (label) {
      if (!label?.IsValid?.()) return false;
      const text = String(label.text || "").trim();
      if (!text || text === "#citadel_chat_placeholder") return false;
      return text !== CHAT_ALL_LABEL && text.indexOf("(ALL)") === -1;
    },
    submit: function (input, message) {
      if (submitWithoutFocus(input, message)) return true;
      submitWithMinimalFocus(input, message);
      return true;
    },
    retry: function (message, attempt, readyStreak) {
      const input = getChatInputPanel();
      const label = getChatTargetLabel();
      if (!TeamChatIntent.isTeamTarget(label) || !input?.IsValid?.()) {
        if (attempt >= CHAT_RETRY_DELAYS.length - 1) return;
        $.Schedule(CHAT_RETRY_DELAYS[attempt + 1], () => TeamChatIntent.retry(message, attempt + 1, 0));
        return;
      }
      if (readyStreak < 1 && attempt < CHAT_RETRY_DELAYS.length - 1) {
        $.Schedule(CHAT_RETRY_DELAYS[attempt + 1], () => TeamChatIntent.retry(message, attempt + 1, readyStreak + 1));
        return;
      }
      TeamChatIntent.submit(input, message);
    },
    send: function (message, wallNowMs) {
      if (!TeamChatIntent.canSend(wallNowMs, _lastChatTime, 1000)) return false;
      const safe = TeamChatIntent.sanitize(message);
      if (!safe) return false;
      _lastChatTime = wallNowMs;
      try { $.DispatchEvent("CitadelConCommand", "say_chat_team"); } catch {}
      $.Schedule(CHAT_RETRY_DELAYS[0], () => TeamChatIntent.retry(safe, 0, 0));
      return true;
    }
  };

  function sendQuickbuyChatMessage(message) {
    TeamChatIntent.send(message, Date.now());
  }

  function submitWithoutFocus(chatInput, message) {
    try {
      chatInput.text = message;
      $.DispatchEvent("CitadelChatInputSubmitted", chatInput);
      chatInput.text = "";
      return true;
    } catch { return false; }
  }

  function submitWithMinimalFocus(chatInput, message) {
    try { $.DispatchEvent("SetInputFocus", chatInput); } catch {}
    try {
      chatInput.text = message;
      $.DispatchEvent("CitadelChatInputSubmitted", chatInput);
      chatInput.text = "";
    } finally {
      closeChatUi(chatInput);
    }
  }

  function closeChatUi(chatInput) {
    const chat = getChatPanel();
    try { $.DispatchEvent("CitadelChatInputBlur", chatInput); } catch {}
    try { $.DispatchEvent("DropInputFocus", chatInput); } catch {}
    if (chat?.IsValid?.()) {
      try { $.DispatchEvent("CitadelChatInputBlur", chat); } catch {}
      try { $.DispatchEvent("DropInputFocus", chat); } catch {}
    }
    $.Schedule(0, () => {
      try { $.DispatchEvent("CitadelChatInputBlur", chatInput); } catch {}
    });
  }

  function getChatPanel() {
    if (_chat.panel?.IsValid?.()) return _chat.panel;
    _chat.panel = getValidChild(findRoot($.GetContextPanel()), null, "Chat");
    return _chat.panel;
  }

  function getChatChild(cached, id) {
    if (cached?.IsValid?.()) return cached;
    const controls = getValidChild(getChatPanel(), null, "ChatControls");
    return getValidChild(controls, null, id);
  }

  function getChatInputPanel() {
    _chat.input = getChatChild(_chat.input, "ChatInput");
    return _chat.input;
  }

  function getChatTargetLabel() {
    _chat.targetLabel = getChatChild(_chat.targetLabel, "ChatTargetLabel");
    return _chat.targetLabel;
  }

  // Cache frequently accessed panels
  let _totalLbl = null;
  let _goldLabel = null;
  let _queuePanel = null;
  let _sellPanel = null;
  let _goldText = null;
  let _gold = 0;
  let _souls = -1;
  let _sellCredit = 0;
  let _totalText = '0';

  function tick() {
    const ctx = $.GetContextPanel();
    if (ctx?.IsValid?.()) {
      _totalLbl = getValidChild(ctx, _totalLbl, 'RecentPurchaseTotalCostLabel');
      _queuePanel = getValidChild(ctx, _queuePanel, 'QuickbuyQueue');
      _sellPanel = getValidChild(ctx, _sellPanel, 'QuickbuySellQueue');
      if (_totalLbl) {
        let changed = getItems(_queuePanel, _items, true);
        if (getItems(_sellPanel, _sellItems, false)) {
          _sellCredit = getSellCredit(_sellItems);
          changed = true;
        }
        const souls = getGold();
        if (changed || souls !== _souls) {
          _souls = souls;
          _totalText = String(compute(_items, souls, _sellCredit));
          applyLabels(_items);
        }
        if (_totalLbl._rpText !== _totalText) {
          _totalLbl.text = _totalText;
          _totalLbl._rpText = _totalText;
        }
      }
    }

    $.Schedule(TICK, tick);
  }

  if (typeof module !== "undefined" && module && module.exports) {
    module.exports.__test = module.exports.__test || {};
    module.exports.__test.TeamChatIntent = TeamChatIntent;
    module.exports.__test.compute = compute;
    module.exports.__test.getItemRefs = getItemRefs;
    module.exports.__test.getItemVisualRefs = getItemVisualRefs;
  }

  initRecipes();
  $.Schedule(0.0, tick);
})();
