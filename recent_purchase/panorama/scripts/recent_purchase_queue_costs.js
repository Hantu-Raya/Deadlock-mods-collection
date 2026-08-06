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
    'Armor Piercing Rounds': ['High-Velocity Rounds'],
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
    'Sharpshooter': ['Long Range', 'High-Velocity Rounds'],
    'Spellbreaker': ['Debuff Reducer'],
    'Spirit Rend': ['Spirit Shredder Bullets'],
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
    'Veil Walker': ['Sprint Boots'],
    'Vortex Web': ['Slowing Hex'],
    'Weighted Shots': ['Slowing Bullets'],
    'Weapon Shielding': ['Grit'],
  };

  const RECIPES = {};

  function canon(name) {
    if (!name) return '';
    return name.toString().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
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
    if (!panel) return;
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
    if (!_goldLabel || !_goldLabel.IsValid()) {
      const root = findRoot($.GetContextPanel());
      const gold = root.FindChildTraverse('CurrentGoldAmount');
      _goldLabel = gold ? gold.FindChildTraverse('hudCurGoldLabel') : null;
    }
    return _goldLabel ? parseCost(_goldLabel.text) : 0;
  }

  function getItemChild(panel, refs, key, id) {
    const cached = refs[key];
    if (cached && cached.IsValid()) return cached;
    refs[key] = panel.FindChildTraverse(id);
    return refs[key];
  }

  function getItemRefs(panel) {
    const refs = panel._rpItemRefs || (panel._rpItemRefs = {});
    getItemChild(panel, refs, 'cost', 'ModCost');
    getItemChild(panel, refs, 'name', 'ModName');
    return refs;
  }

  function getItemVisualRefs(panel) {
    const refs = getItemRefs(panel);
    getItemChild(panel, refs, 'deficit', 'RecentPurchaseDeficitLabel');
    getItemChild(panel, refs, 'divider', 'RecentPurchaseCostDivider');
    getItemChild(panel, refs, 'goldIcon', 'goldIcon');
    return refs;
  }

  function getItems(root) {
    const out = [];
    if (!root) return out;
    const stack = [root];
    while (stack.length) {
      const p = stack.pop();
      if (p.BHasClass && p.BHasClass('QuickbuyItem')) {
        const refs = getItemRefs(p);
        const costLbl = refs.cost;
        const nameLbl = refs.name;
        out.push({
          panel: p,
          key: canon(nameLbl ? nameLbl.text : ''),
          name: nameLbl ? nameLbl.text : '',
          base: parseCost(costLbl ? costLbl.text : '')
        });
        continue;
      }
      const n = p.GetChildCount();
      for (let i = n - 1; i >= 0; i--) stack.push(p.GetChild(i));
    }
    return out;
  }

  function getSellCredit(sellRoot) {
    let cred = 0;
    if (!sellRoot) return cred;
    const stack = [sellRoot];
    while (stack.length) {
      const p = stack.pop();
      if (p.BHasClass && p.BHasClass('QuickbuyItem')) {
        const lbl = getItemRefs(p).cost;
        cred += Math.floor(parseCost(lbl ? lbl.text : '') / 2);
        continue;
      }
      const n = p.GetChildCount();
      for (let i = n - 1; i >= 0; i--) stack.push(p.GetChild(i));
    }
    return cred;
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

    const adj = total - sellCredit;
    return adj < 0 ? 0 : adj;
  }

  function applyLabels(items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.panel) continue;
      const need = it.rem;
      const hasNeed = need > 0;

      const refs = getItemVisualRefs(it.panel);
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
      if (modCost) {
        if (hasNeed) {
          setStyle(modCost, 'color', NEED_COLOR);
          setStyle(goldIcon, 'washColor', NEED_COLOR);
        } else {
          setStyle(modCost, 'color', OWNED_COLOR);
          setStyle(goldIcon, 'washColor', OWNED_COLOR);
        }
      }

      const msg = hasNeed ? 'Need ' + needText + ' more for ' + (it.name || 'item') : '';
      if (lbl) {
        if (need > 0) {
          if (lbl._lastChatMsg !== msg) {
            lbl._lastChatMsg = msg;
            lbl.SetPanelEvent('onactivate', () => sendQuickbuyChatMessage(msg));
          }
        } else if (lbl._lastChatMsg) {
          lbl._lastChatMsg = null;
          lbl.SetPanelEvent('onactivate', () => {});
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
    const root = findRoot($.GetContextPanel());
    const chat = root.FindChildTraverse("Chat");
    if (chat?.IsValid?.()) {
      _chat.panel = chat;
      return chat;
    }
    return null;
  }

  function getChatChild(key, id) {
    const cached = _chat[key];
    if (cached?.IsValid?.()) return cached;
    const chat = getChatPanel();
    if (!chat) return null;
    const controls = chat.FindChildTraverse("ChatControls");
    const child = controls ? controls.FindChildTraverse(id) : null;
    if (child?.IsValid?.()) _chat[key] = child;
    return child;
  }

  function getChatInputPanel() {
    return getChatChild("input", "ChatInput");
  }

  function getChatTargetLabel() {
    return getChatChild("targetLabel", "ChatTargetLabel");
  }

  // Cache frequently accessed panels
  let _totalLbl = null;
  let _goldLabel = null;
  let _queuePanel = null;
  let _sellPanel = null;

  function tick() {
    const ctx = $.GetContextPanel();
    if (!ctx) { $.Schedule(TICK, tick); return; }

    if (!_totalLbl || !_totalLbl.IsValid()) _totalLbl = ctx.FindChildTraverse('RecentPurchaseTotalCostLabel');
    if (!_queuePanel || !_queuePanel.IsValid()) _queuePanel = ctx.FindChildTraverse('QuickbuyQueue');
    if (!_sellPanel || !_sellPanel.IsValid()) _sellPanel = ctx.FindChildTraverse('QuickbuySellQueue');
    if (!_totalLbl) { $.Schedule(TICK, tick); return; }

    const items = getItems(_queuePanel);
    const total = compute(items, getGold(), getSellCredit(_sellPanel));
    const totalText = String(total);
    if (_totalLbl._rpText !== totalText) {
      _totalLbl.text = totalText;
      _totalLbl._rpText = totalText;
    }
    applyLabels(items);

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
