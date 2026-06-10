(() => {
  "use strict";

  var ROOT_KEY = "__TopbarRankHudRoot";
  var PLAYER_KEY = "__TopbarRankHudPlayer";
  var POWERUP_CYCLE_SECONDS = 300;
  var REJUV_BUFF_DURATION_SECONDS = 240;
  var ROOT_GATE_DELAY_SECONDS = 0.1;
  var ROOT_TICK_SECONDS = 1.0;
  var HIDEOUT_TICK_SECONDS = 30;
  var PLAYER_TICK_SECONDS = 0.5;
  var CHARGE_SCAN_SECONDS = 3;
  var WARNING_YELLOW_SECONDS = 20;
  var WARNING_RED_SECONDS = 10;
  var TIER_COSTS = { isTier1: 800, isTier2: 1600, isTier3: 3200, isTier4: 6400 };
  var HIDEOUT_CLASS_NAMES = ["connectedToHideout", "connectedtoHideout", "connectedtohideout", "connectedToHideOut", "InHideout", "inHideoutIntro"];
  var REJUV_COUNT_TOKENS = ["RejuvCount_1", "RejuvCount_2", "RejuvCount_3", "RejuvCount_4"];
  var REJUV_PHASE_DURATIONS = [0, 413, 353, 293];

  function GetContextPanel() { try { return $.GetContextPanel ? $.GetContextPanel() : null; } catch (e0) { return null; } }
  function IsPanelValid(panel) { try { return !!(panel && (!panel.IsValid || panel.IsValid())); } catch (e0) { return false; } }
  function GetParent(panel) { try { return IsPanelValid(panel) ? panel.GetParent() : null; } catch (e0) { return null; } }
  function FindChild(root, id) { try { return IsPanelValid(root) && root.FindChildTraverse ? root.FindChildTraverse(id) : null; } catch (e0) { return null; } }
  function GetDocumentRoot(panel) {
    var current = IsPanelValid(panel) ? panel : GetContextPanel();
    var parent;
    var guard = 0;
    while (IsPanelValid(current) && guard < 64) {
      parent = GetParent(current);
      if (!IsPanelValid(parent)) return current;
      current = parent;
      guard += 1;
    }
    return current;
  }
  function HasClass(panel, className) { try { return IsPanelValid(panel) && panel.BHasClass && panel.BHasClass(className); } catch (e0) { return false; } }
  function HasAnyClass(panel, classes) { var i; for (i = 0; i < classes.length; i += 1) if (HasClass(panel, classes[i])) return true; return false; }
  function AddClass(panel, className) { try { if (IsPanelValid(panel) && panel.AddClass && !HasClass(panel, className)) panel.AddClass(className); } catch (e0) {} }
  function RemoveClass(panel, className) { try { if (IsPanelValid(panel) && panel.RemoveClass && HasClass(panel, className)) panel.RemoveClass(className); } catch (e0) {} }
  function SetClass(panel, className, enabled) { if (enabled) AddClass(panel, className); else RemoveClass(panel, className); }
  function SetVisible(panel, visible) { try { if (IsPanelValid(panel)) panel.visible = !!visible; } catch (e0) {} try { if (IsPanelValid(panel)) panel.style.visibility = visible ? "visible" : "collapse"; } catch (e1) {} }
  function ReadText(panel) { try { return IsPanelValid(panel) && panel.text !== undefined && panel.text !== null ? String(panel.text) : ""; } catch (e0) { return ""; } }
  function SetText(panel, text) { var value = String(text); try { if (IsPanelValid(panel) && String(panel.text || "") !== value) panel.text = value; } catch (e0) {} }
  function PanelVisibleNonCollapsed(panel) {
    if (!IsPanelValid(panel)) return false;
    try { if (panel.visible === false) return false; } catch (e0) {}
    try { if (panel.style && String(panel.style.visibility || "") === "collapse") return false; } catch (e1) {}
    return true;
  }
  function IsHideoutState(root) {
    var docRoot = GetDocumentRoot(root);
    return HasAnyClass(root, HIDEOUT_CLASS_NAMES) || HasAnyClass(docRoot, HIDEOUT_CLASS_NAMES);
  }
  function IsStreetBrawlState(root) {
    var state = GetRootState(root);
    var docRoot = GetDocumentRoot(root);
    if (HasClass(root, "gamemode_streetbrawl") || HasClass(docRoot, "gamemode_streetbrawl")) return true;
    return PanelVisibleNonCollapsed(state && state.stretBrawlContainer);
  }
  function ParseClockText(text) {
    var match = String(text || "").match(/(\d+)\s*:\s*(\d+)/);
    var minutes;
    var seconds;
    if (!match) return 0;
    minutes = Number(match[1]);
    seconds = Number(match[2]);
    if (!isFinite(minutes) || !isFinite(seconds) || minutes < 0 || seconds < 0) return 0;
    return Math.floor(minutes) * 60 + (Math.floor(seconds) % 60);
  }
  function FindFirstByClass(root, className) {
    var panels;
    try { panels = IsPanelValid(root) && root.FindChildrenWithClassTraverse ? root.FindChildrenWithClassTraverse(className) : null; } catch (e0) { panels = null; }
    return panels && panels.length ? panels[0] : null;
  }
  function ReadGameSeconds(state) {
    var value;
    var panel;
    try { if (typeof Game !== "undefined" && Game && typeof Game.GetDOTATime === "function") { value = Number(Game.GetDOTATime()); if (isFinite(value) && value >= 0) return Math.floor(value); } } catch (e0) {}
    try { if (typeof Game !== "undefined" && Game && typeof Game.GetGameTime === "function") { value = Number(Game.GetGameTime()); if (isFinite(value) && value >= 0) return Math.floor(value); } } catch (e1) {}
    try { if (typeof Game !== "undefined" && Game) { value = Number(Game.Time); if (isFinite(value) && value >= 0) return Math.floor(value); } } catch (e2) {}
    try { if (typeof Game !== "undefined" && Game) { value = Number(Game.GameTime); if (isFinite(value) && value >= 0) return Math.floor(value); } } catch (e3) {}
    try { if (typeof GameUI !== "undefined" && GameUI && typeof GameUI.GetGameTime === "function") { value = Number(GameUI.GetGameTime()); if (isFinite(value) && value >= 0) return Math.floor(value); } } catch (e4) {}
    panel = FindChild(state.docRoot, "HudGameTime") || FindChild(state.docRoot, "GameTime") || FindChild(state.docRoot, "MainGameTime");
    value = ParseClockText(ReadText(panel));
    if (value) return value;
    panel = FindChild(state.docRoot, "Hud");
    panel = FindFirstByClass(panel, "GameTime") || FindFirstByClass(state.root, "GameTime");
    return ParseClockText(ReadText(panel));
  }
  function FormatSeconds(seconds) {
    var safe = Math.max(0, Math.floor(Number(seconds) || 0));
    var m = Math.floor(safe / 60);
    var s = safe % 60;
    return String(m) + ":" + (s < 10 ? "0" : "") + String(s);
  }
  function SetWarning(panel, remaining) {
    var sec = Math.floor(Number(remaining) || 0);
    var odd = sec % 2 === 1;
    SetClass(panel, "TopbarRankWarningRed", odd && sec > 0 && sec < WARNING_RED_SECONDS);
    SetClass(panel, "TopbarRankWarningYellow", odd && sec >= WARNING_RED_SECONDS && sec < WARNING_YELLOW_SECONDS);
  }
  function ReadPanelNumber(panel) {
    var text = ReadText(panel).replace(/,/g, "").replace(/\s+/g, "").toLowerCase();
    var match = text.match(/^([+-]?\d+(?:\.\d+)?)([kmb]?)$/);
    var value;
    if (!match) return 0;
    value = Number(match[1]);
    if (!isFinite(value)) return 0;
    if (match[2] === "k") value *= 1000;
    return Math.round(value);
  }
  function ReadScorePanel(panel) { return ReadPanelNumber(FindFirstByClass(panel, "ScoreLabel")); }
  function SetAdvantageState(state, mode, text) {
    SetText(state.advantageLabel, text);
    SetClass(state.advantage, "TopbarRankAdvantageGood", mode === "good");
    SetClass(state.advantage, "TopbarRankAdvantageBad", mode === "bad");
    SetClass(state.advantage, "TopbarRankAdvantageNeutral", mode === "neutral");
  }
  function UpdateAdvantage(state, seconds) {
    var friendly = ReadScorePanel(state.teamScoreFriendly);
    var enemy = ReadScorePanel(state.teamScoreEnemy);
    var diff;
    var pct;
    var threshold;
    if (!friendly || !enemy) { SetAdvantageState(state, "neutral", "--"); return; }
    diff = friendly - enemy;
    pct = Math.abs(diff) / Math.max(friendly, enemy) * 100;
    if (enemy > friendly) pct = -pct;
    threshold = seconds >= 900 ? 10.0 : 15.0;
    SetAdvantageState(state, pct >= threshold ? "good" : (pct <= -threshold ? "bad" : "neutral"), (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%");
  }
  function GetChargeSignature(state) {
    var token = "";
    var i;
    for (i = 0; i < REJUV_COUNT_TOKENS.length; i += 1) {
      if (HasClass(state.rejuvenatorFriendly, REJUV_COUNT_TOKENS[i])) token += "F" + REJUV_COUNT_TOKENS[i] + ";";
      if (HasClass(state.rejuvenatorEnemy, REJUV_COUNT_TOKENS[i])) token += "E" + REJUV_COUNT_TOKENS[i] + ";";
    }
    return token;
  }
  function AnyChargeToken(state) { return !!GetChargeSignature(state); }
  function GetRejuvPhaseDuration(phase) { if (phase <= 1) return REJUV_PHASE_DURATIONS[1]; if (phase === 2) return REJUV_PHASE_DURATIONS[2]; return REJUV_PHASE_DURATIONS[3]; }
  function CalcRejuvPhaseAt(seconds) {
    var now = Math.max(0, Math.floor(Number(seconds) || 0));
    var cumulative = 0;
    var phase;
    var duration;
    var mod;
    var within;
    if (now <= 2) return { phase: 0, startedAt: 0, remaining: 0 };
    for (phase = 1; phase < REJUV_PHASE_DURATIONS.length; phase += 1) {
      duration = REJUV_PHASE_DURATIONS[phase];
      if (now < cumulative + duration) return { phase: phase, startedAt: cumulative, remaining: cumulative + duration - now };
      cumulative += duration;
    }
    duration = REJUV_PHASE_DURATIONS[3];
    mod = (now - cumulative) % POWERUP_CYCLE_SECONDS;
    within = mod % duration;
    return { phase: 3, startedAt: now - within, remaining: duration - within };
  }
  function PrimeRejuvPhase(state, now) {
    var computed = CalcRejuvPhaseAt(now);
    state.rejuvAutoPrimed = true;
    state.rejuvPhase = computed.phase;
    state.rejuvPhaseStartedAt = computed.startedAt;
    state.rejuvDuration = GetRejuvPhaseDuration(computed.phase);
    SetText(state.rejuvPhaseLabel, computed.phase >= 3 ? "3" : String(computed.phase + 1));
    state.rejuvSpawnWaiting = computed.remaining <= 0;
  }
  function StartRejuvPhase(state, phase, now) {
    state.rejuvPhase = phase;
    state.rejuvPhaseStartedAt = now;
    state.rejuvDuration = GetRejuvPhaseDuration(phase);
    state.rejuvSpawnWaiting = false;
    state.rejuvAutoPrimed = true;
    SetText(state.rejuvPhaseLabel, phase >= 3 ? "3" : String(phase + 1));
  }
  function ShowBuffPanel(state) {
    SetClass(state.rejuvBuff, "TopbarRankRejuvBuffVisible", true);
    SetClass(state.rejuvBuff, "TopbarRankRejuvBuffActive", true);
    SetVisible(state.rejuvBuff, true);
  }
  function StartBuff(state, now) {
    state.buffEndAt = now + REJUV_BUFF_DURATION_SECONDS;
    ShowBuffPanel(state);
    SetText(state.rejuvBuffTime, FormatSeconds(REJUV_BUFF_DURATION_SECONDS));
  }
  function EndBuff(state) {
    var epoch = state.epoch;
    state.buffEndAt = 0;
    SetClass(state.rejuvBuff, "TopbarRankRejuvBuffActive", false);
    SetClass(state.rejuvBuff, "TopbarRankRejuvBuffVisible", false);
    try { $.Schedule(0.5, function() { if (state.epoch === epoch && !state.buffEndAt) SetVisible(state.rejuvBuff, false); }); } catch (e0) { SetVisible(state.rejuvBuff, false); }
  }
  function ScanCharges(state, now) {
    var sig = GetChargeSignature(state);
    if (!state.lastChargeSignatureKnown) {
      state.lastChargeSignature = sig;
      state.lastChargeSignatureKnown = true;
      return;
    }
    if (state.rejuvSpawnWaiting && sig && sig !== state.lastChargeSignature) {
      state.claimCount += 1;
      StartBuff(state, now);
      StartRejuvPhase(state, state.claimCount >= 3 ? 3 : state.claimCount, now);
    }
    state.lastChargeSignature = sig;
  }
  function UpdateRejuv(state, now) {
    var remaining;
    var hasCharge;
    if (now - state.lastChargeScanAt >= CHARGE_SCAN_SECONDS) { state.lastChargeScanAt = now; ScanCharges(state, now); }
    if (state.rejuvSpawnWaiting && !state.rejuvAutoPrimed) PrimeRejuvPhase(state, now);
    hasCharge = AnyChargeToken(state);
    if (state.rejuvSpawnWaiting) {
      SetText(state.rejuvTime, "Spawn");
      SetWarning(state.rejuvHud, 0);
      SetClass(state.rejuvHud, "TopbarRankRejuvSpawned", true);
      SetClass(state.rejuvHud, "TopbarRankRejuvCooldown", false);
    } else {
      remaining = state.rejuvDuration - (now - state.rejuvPhaseStartedAt);
      if (remaining <= 0) {
        state.rejuvSpawnWaiting = true;
        SetText(state.rejuvTime, "Spawn");
      } else {
        SetText(state.rejuvTime, FormatSeconds(remaining));
        SetWarning(state.rejuvHud, remaining);
      }
      SetClass(state.rejuvHud, "TopbarRankRejuvSpawned", state.rejuvSpawnWaiting);
      SetClass(state.rejuvHud, "TopbarRankRejuvCooldown", !state.rejuvSpawnWaiting);
    }
    if (state.buffEndAt) {
      remaining = state.buffEndAt - now;
      if (remaining <= 0 || !hasCharge) EndBuff(state);
      else SetText(state.rejuvBuffTime, FormatSeconds(remaining));
    } else if (hasCharge) {
      remaining = state.rejuvSpawnWaiting ? REJUV_BUFF_DURATION_SECONDS : Math.min(REJUV_BUFF_DURATION_SECONDS, Math.max(0, state.rejuvDuration - (now - state.rejuvPhaseStartedAt)));
      if (remaining > 0) {
        ShowBuffPanel(state);
        SetText(state.rejuvBuffTime, FormatSeconds(remaining));
      }
    } else if (HasClass(state.rejuvBuff, "TopbarRankRejuvBuffVisible")) {
      EndBuff(state);
    }
  }
  function HideRootCustom(state) {
    SetVisible(state.powerupHud, false);
    SetVisible(state.rejuvHud, false);
    SetVisible(state.rejuvBuff, false);
    SetClass(state.rejuvBuff, "TopbarRankRejuvBuffVisible", false);
  }
  function ShowRootCustom(state) { SetVisible(state.powerupHud, true); SetVisible(state.rejuvHud, true); if (state.buffEndAt) SetVisible(state.rejuvBuff, true); }
  function ResetRootState(state) {
    state.epoch += 1;
    state.lastSeconds = 0;
    state.rejuvPhaseStartedAt = 0;
    state.rejuvDuration = 0;
    state.rejuvPhase = 0;
    state.rejuvSpawnWaiting = true;
    state.rejuvAutoPrimed = false;
    state.lastChargeSignature = "";
    state.lastChargeSignatureKnown = false;
    state.lastChargeScanAt = -CHARGE_SCAN_SECONDS;
    state.buffEndAt = 0;
    SetText(state.powerupTime, "0:00");
    SetText(state.rejuvTime, "Spawn");
    SetText(state.rejuvPhaseLabel, "1");
    SetText(state.rejuvBuffTime, "0:00");
    SetAdvantageState(state, "neutral", "--");
    HideRootCustom(state);
    ScheduleRootTick(state, ROOT_GATE_DELAY_SECONDS);
  }
  function RootTick(state, epoch) {
    var hideout;
    var street;
    var seconds;
    var powerupRemaining;
    if (state.epoch !== epoch || !IsPanelValid(state.root)) return;
    hideout = IsHideoutState(state.root);
    street = IsStreetBrawlState(state.root);
    if (hideout) { HideRootCustom(state); ScheduleRootTick(state, HIDEOUT_TICK_SECONDS); return; }
    seconds = ReadGameSeconds(state);
    if ((seconds + 5 < state.lastSeconds) || (state.lastSeconds > 30 && seconds <= 2)) { ResetRootState(state); return; }
    state.lastSeconds = seconds;
    if (street) { HideRootCustom(state); } else {
      ShowRootCustom(state);
      powerupRemaining = POWERUP_CYCLE_SECONDS - (seconds % POWERUP_CYCLE_SECONDS);
      SetText(state.powerupTime, FormatSeconds(powerupRemaining));
      SetWarning(state.powerupHud, powerupRemaining);
      UpdateRejuv(state, seconds);
    }
    UpdateAdvantage(state, seconds);
    ScheduleRootTick(state, ROOT_TICK_SECONDS);
  }
  function ScheduleRootTick(state, delay) { var epoch = state.epoch; try { $.Schedule(delay, function() { RootTick(state, epoch); }); } catch (e0) {} }
  function GetRootState(root) {
    var docRoot = GetDocumentRoot(root);
    var state;
    try { state = docRoot ? docRoot[ROOT_KEY] : null; } catch (e0) { state = null; }
    return state;
  }
  function BuildRootState(root) {
    var docRoot = GetDocumentRoot(root);
    var state = {
      root: root, docRoot: docRoot, epoch: 1, lastSeconds: 0, rejuvPhaseStartedAt: 0, rejuvDuration: 0, rejuvPhase: 0, rejuvSpawnWaiting: true, rejuvAutoPrimed: false, claimCount: 0, lastChargeSignature: "", lastChargeSignatureKnown: false, lastChargeScanAt: -CHARGE_SCAN_SECONDS, buffEndAt: 0,
      powerupTime: FindChild(root, "TopbarRankPowerupTime"), powerupHud: FindChild(root, "TopbarRankPowerupHud"), rejuvTime: FindChild(root, "TopbarRankRejuvTime"), rejuvPhaseLabel: FindChild(root, "TopbarRankRejuvPhase"), rejuvHud: FindChild(root, "TopbarRankRejuvHud"), rejuvBuff: FindChild(root, "TopbarRankRejuvBuff"), rejuvBuffTime: FindChild(root, "TopbarRankRejuvBuffTime"), advantage: FindChild(root, "TopbarRankAdvantage"), advantageLabel: FindChild(root, "TopbarRankAdvantageLabel"), teamScoreFriendly: FindChild(root, "TeamScoreFriendly"), teamScoreEnemy: FindChild(root, "TeamScoreEnemy"), rejuvenatorFriendly: FindChild(root, "RejuvenatorFriendly"), rejuvenatorEnemy: FindChild(root, "RejuvenatorEnemy"), stretBrawlContainer: FindChild(root, "StretBrawlContainer")
    };
    try { docRoot[ROOT_KEY] = state; } catch (e0) {}
    return state;
  }
  function TopbarRankHudRootLoaded() {
    var root = GetContextPanel();
    var state;
    if (!IsPanelValid(root)) return false;
    state = BuildRootState(root);
    ResetRootState(state);
    return true;
  }
  function ReadGoldText(panel) { return ReadPanelNumber(panel); }
  function CountSpentSouls(mods) {
    var panels = [];
    var spent = 0;
    var i;
    var key;
    for (key in TIER_COSTS) {
      if (!Object.prototype.hasOwnProperty.call(TIER_COSTS, key)) continue;
      try { panels = IsPanelValid(mods) && mods.FindChildrenWithClassTraverse ? mods.FindChildrenWithClassTraverse(key) : []; } catch (e1) { panels = []; }
      for (i = 0; panels && i < panels.length; i += 1) if (IsPanelValid(panels[i])) spent += TIER_COSTS[key];
    }
    return spent;
  }
  function HidePlayerCustom(state) { SetVisible(state.unspentRow, false); }
  function PlayerTick(state, epoch) {
    var rootState;
    var total;
    var spent;
    var unspent;
    var text;
    if (state.epoch !== epoch || !IsPanelValid(state.root)) return;
    rootState = GetRootState(state.root);
    if ((rootState && (IsHideoutState(rootState.root) || IsStreetBrawlState(rootState.root))) || IsHideoutState(state.root)) {
      HidePlayerCustom(state);
    } else {
      total = ReadGoldText(state.goldRaw);
      if (!total) total = ReadGoldText(state.soulsValue);
      spent = CountSpentSouls(state.modsContainer);
      unspent = total - spent;
      text = (unspent / 1000).toFixed(1) + "k";
      SetVisible(state.unspentRow, true);
      if (state.lastUnspentText !== text) { state.lastUnspentText = text; SetText(state.unspentValue, text); }
    }
    try { $.Schedule(PLAYER_TICK_SECONDS, function() { PlayerTick(state, epoch); }); } catch (e0) {}
  }
  function TopbarRankHudPlayerLoaded() {
    var root = GetContextPanel();
    var state;
    if (!IsPanelValid(root)) return false;
    state = { root: root, epoch: 1, lastUnspentText: "", goldRaw: FindChild(root, "TopbarRankGoldRaw"), soulsValue: FindChild(root, "SoulsValue"), unspentRow: FindChild(root, "TopbarRankUnspentRow"), unspentValue: FindChild(root, "TopbarRankUnspentValue"), modsContainer: FindChild(root, "PlayerModsContainer") };
    try { root[PLAYER_KEY] = state; } catch (e0) {}
    PlayerTick(state, state.epoch);
    return true;
  }
  try { $.TopbarRankHudRootLoaded = TopbarRankHudRootLoaded; } catch (e0) {}
  try { $.TopbarRankHudPlayerLoaded = TopbarRankHudPlayerLoaded; } catch (e1) {}
})();
