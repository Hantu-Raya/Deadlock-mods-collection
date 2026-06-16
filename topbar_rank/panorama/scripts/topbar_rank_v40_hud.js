(() => {
  "use strict";

  var ROOT_TICK_SECONDS = 1.0;
  var PLAYER_TICK_SECONDS = 0.5;
  var REJUV_DURATION = 240;
  var BRIDGE_DURATION = 300;
  var INITIAL_URN = 720;
  var URN_DURATION = 360;
  var ROOT_GENERATION_KEY = "__TopbarRankV40HudRootGeneration";
  var PLAYER_GENERATION_KEY = "__TopbarRankV40HudPlayerGeneration";
  var PREFERRED_GAME_TIME_IDS = ["HudGameTime", "GameTime", "MainGameTime"];
  var REJUV_TOKENS = ["RejuvCount_1", "RejuvCount_2", "RejuvCount_3", "RejuvCount_4"];
  var TIER_COSTS = { isTier1: 800, isTier2: 1600, isTier3: 3200, isTier4: 6400 };
  var REJUV_SEQUENCE = [
    { name: "initial", duration: 0, label: "1" },
    { name: "firstCd", duration: 413, label: "2" },
    { name: "secondCd", duration: 353, label: "3" },
    { name: "thirdCd", duration: 293, label: "3" }
  ];

  function IsValid(panel) {
    try { return !!panel && (!panel.IsValid || panel.IsValid()); } catch (e) { return false; }
  }

  function ContextPanel() {
    try { return $ && $.GetContextPanel ? $.GetContextPanel() : null; } catch (e) { return null; }
  }

  function Parent(panel) {
    try { return IsValid(panel) && panel.GetParent ? panel.GetParent() : null; } catch (e) { return null; }
  }

  function RootOf(panel) {
    var root = panel;
    var parent;
    if (!IsValid(root)) return null;
    parent = Parent(root);
    while (IsValid(parent)) {
      root = parent;
      parent = Parent(root);
    }
    return root;
  }

  function Find(root, id) {
    try {
      if (!IsValid(root) || !id) return null;
      if (root.FindChildTraverse) return root.FindChildTraverse(id);
      if (root.FindChild) return root.FindChild(id);
    } catch (e) { }
    return null;
  }

  function ChildrenWithClass(root, className) {
    try {
      if (!IsValid(root) || !root.FindChildrenWithClassTraverse) return [];
      return root.FindChildrenWithClassTraverse(className) || [];
    } catch (e) { return []; }
  }

  function HasClass(panel, className) {
    try { return IsValid(panel) && panel.BHasClass && panel.BHasClass(className); } catch (e) { return false; }
  }

  function AddClass(panel, className) {
    try { if (IsValid(panel) && className && panel.AddClass && !HasClass(panel, className)) panel.AddClass(className); } catch (e) { }
  }

  function RemoveClass(panel, className) {
    try { if (IsValid(panel) && className && panel.RemoveClass && HasClass(panel, className)) panel.RemoveClass(className); } catch (e) { }
  }

  function SetClass(panel, className, enabled) {
    if (enabled) AddClass(panel, className);
    else RemoveClass(panel, className);
  }

  function SetText(panel, text) {
    try {
      if (!IsValid(panel)) return;
      text = text == null ? "" : String(text);
      if (panel.text !== text) panel.text = text;
    } catch (e) { }
  }

  function SetVisible(panel, visible) {
    try {
      if (!IsValid(panel)) return;
      panel.visible = !!visible;
      panel.style.visibility = visible ? "visible" : "collapse";
    } catch (e) { }
  }

  function PanelClassText(panel) {
    try {
      if (!IsValid(panel)) return "";
      if (panel.GetAttributeString) return String(panel.GetAttributeString("class", ""));
      if (panel.className) return String(panel.className);
    } catch (e) { }
    return "";
  }

  function PanelHasToken(panel, token) {
    var children;
    var i;
    if (!IsValid(panel) || !token) return false;
    if (HasClass(panel, token)) return true;
    if (PanelClassText(panel).indexOf(token) !== -1) return true;
    try { children = panel.Children ? panel.Children() : []; } catch (e) { children = []; }
    for (i = 0; children && i < children.length; i += 1) {
      if (HasClass(children[i], token) || PanelClassText(children[i]).indexOf(token) !== -1) return true;
    }
    return false;
  }

  function PanelHasAnyToken(panel, tokens) {
    var i;
    for (i = 0; i < tokens.length; i += 1) if (PanelHasToken(panel, tokens[i])) return true;
    return false;
  }

  function ParseNumber(text) {
    var match;
    var value;
    var suffix;
    if (text === undefined || text === null) return 0;
    text = String(text).replace(/,/g, "").trim().toLowerCase();
    match = text.match(/^([0-9]*\.?[0-9]+)\s*([kmb])?$/);
    if (!match) return 0;
    value = parseFloat(match[1]);
    if (isNaN(value)) return 0;
    suffix = match[2] || "";
    if (suffix === "k") value *= 1000;
    else if (suffix === "m") value *= 1000000;
    else if (suffix === "b") value *= 1000000000;
    return Math.round(value);
  }

  function ParseClock(text) {
    var match;
    var minutes;
    var seconds;
    if (!text) return 0;
    match = String(text).match(/(\d+):(\d{1,2})/);
    if (!match) return 0;
    minutes = parseInt(match[1], 10) || 0;
    seconds = parseInt(match[2], 10) || 0;
    if (seconds > 59) seconds %= 60;
    return minutes * 60 + seconds;
  }

  function FormatSeconds(seconds) {
    var minutes;
    seconds = Math.max(0, seconds | 0);
    minutes = (seconds / 60) | 0;
    seconds = seconds % 60;
    return (minutes < 10 ? "0" + minutes : "" + minutes) + ":" + (seconds < 10 ? "0" + seconds : "" + seconds);
  }

  function ReadGameSeconds(state, forceRefresh) {
    var apiSeconds = ReadGameSecondsFromApi();
    var now;
    var i;
    var panel;
    if (apiSeconds !== null) return apiSeconds;
    now = Date.now ? Date.now() : 0;
    if (!forceRefresh && IsValid(state.gameTimePanel) && now - state.lastGameTimeLookup < 800) return ParseClock(state.gameTimePanel.text);
    state.lastGameTimeLookup = now;
    for (i = 0; i < PREFERRED_GAME_TIME_IDS.length; i += 1) {
      panel = Find(state.root, PREFERRED_GAME_TIME_IDS[i]);
      if (IsValid(panel) && panel.text) {
        state.gameTimePanel = panel;
        return ParseClock(panel.text);
      }
    }
    panel = ChildrenWithClass(state.root, "GameTime");
    state.gameTimePanel = panel && panel.length ? panel[0] : null;
    return IsValid(state.gameTimePanel) ? ParseClock(state.gameTimePanel.text) : 0;
  }

  function CoerceGameSeconds(value) {
    return typeof value === "number" && !isNaN(value) ? value | 0 : null;
  }

  function CoerceGameSecondsProperty(value) {
    return typeof value === "number" && !isNaN(value) ? value | 0 : null;
  }

  function ReadGameSecondsMethod(source, methodName) {
    var value;
    if (!source || typeof source[methodName] !== "function") return null;
    value = source[methodName]();
    return CoerceGameSeconds(value);
  }

  function ReadGameSecondsFromApi() {
    var value;
    try {
      if (typeof Game !== "undefined") {
        value = ReadGameSecondsMethod(Game, "GetDOTATime");
        if (value !== null) return value;
        value = ReadGameSecondsMethod(Game, "GetGameTime");
        if (value !== null) return value;
        value = CoerceGameSecondsProperty(Game.Time);
        if (value !== null) return value;
        value = CoerceGameSecondsProperty(Game.GameTime);
        if (value !== null) return value;
      }
      if (typeof GameUI !== "undefined") {
        value = ReadGameSecondsMethod(GameUI, "GetGameTime");
        if (value !== null) return value;
      }
    } catch (e) { }
    return null;
  }


  function IsHideout(root) {
    var hud;
    try {
      if (typeof Game !== "undefined" && Game.GetMapInfo) {
        var info = Game.GetMapInfo();
        var map = info ? info.map_display_name : "";
        if (map === "hero_testing_hideout" || map === "hideout" || map === "dl_hideout") return true;
      }
    } catch (e) { }
    hud = Find(root, "Hud");
    return HasClass(root, "connectedToHideout") || HasClass(root, "connectedtoHideout") || HasClass(root, "connectedtohideout") || HasClass(root, "InHideout") || HasClass(root, "inHideoutIntro") || HasClass(hud, "connectedToHideout") || HasClass(hud, "connectedtoHideout") || HasClass(hud, "connectedtohideout") || HasClass(hud, "InHideout");
  }

  function IsStreetBrawl(root) {
    return HasClass(root, "gamemode_streetbrawl") || HasClass(Find(root, "Hud"), "gamemode_streetbrawl");
  }

  function ComputeRejuvPhase(now) {
    var i;
    var total = 0;
    var duration;
    var lastIndex;
    var mod;
    var within;
    if (now <= 2) return { index: 0, phaseStart: 0, remaining: REJUV_SEQUENCE[0].duration };
    for (i = 0; i < REJUV_SEQUENCE.length; i += 1) {
      duration = REJUV_SEQUENCE[i].duration;
      if (now < total + duration) return { index: i, phaseStart: total, remaining: total + duration - now };
      total += duration;
    }
    lastIndex = REJUV_SEQUENCE.length - 1;
    duration = REJUV_SEQUENCE[lastIndex].duration;
    mod = (now - total) % BRIDGE_DURATION;
    within = mod % duration;
    return { index: lastIndex, phaseStart: now - within, remaining: duration - within };
  }

  function ReadScorePanel(panel) {
    var labels;
    if (!IsValid(panel)) return 0;
    labels = ChildrenWithClass(panel, "ScoreLabel");
    return labels && labels.length ? ParseNumber(labels[0].text) : 0;
  }

  function ReadTeamSouls(state) {
    return {
      friendly: ReadScorePanel(state.teamScoreFriendly),
      enemy: ReadScorePanel(state.teamScoreEnemy)
    };
  }

  function ApplyStateClass(panel, goodClass, badClass, neutralClass, className) {
    RemoveClass(panel, goodClass);
    RemoveClass(panel, badClass);
    RemoveClass(panel, neutralClass);
    AddClass(panel, className);
  }

  function TeamDiffThreshold(now) {
    return now / 60 < 15 ? 15 : 10;
  }

  function ApplyTeamDiffState(state, text, urnClass, advantageClass) {
    SetText(state.urnTrackerLabel, text);
    if (IsValid(state.advantageLabel)) SetText(state.advantageLabel, text);
    RemoveClass(state.urnTracker, "good");
    RemoveClass(state.urnTracker, "bad");
    RemoveClass(state.urnTracker, "neutral");
    ApplyStateClass(state.urnNetworthCard, "good", "bad", "neutral", urnClass);
    ApplyStateClass(state.advantage, "TopbarRankAdvantageGood", "TopbarRankAdvantageBad", "TopbarRankAdvantageNeutral", advantageClass);
    SetVisible(state.urnTracker, true);
    SetVisible(state.urnNetworthCard, true);
    SetVisible(state.urnHudCard, true);
  }

  function UpdateTeamDiff(state, now) {
    var souls = ReadTeamSouls(state);
    var higher = Math.max(souls.friendly, souls.enemy);
    var lower = Math.min(souls.friendly, souls.enemy);
    var diff;
    var threshold;
    var text = "--";
    var urnClass = "neutral";
    var advantageClass = "TopbarRankAdvantageNeutral";
    if (higher > 0) {
      diff = ((higher - lower) / higher) * 100 * (souls.friendly >= souls.enemy ? 1 : -1);
      text = (diff > 0 ? "+" : "") + diff.toFixed(1) + "%";
      threshold = TeamDiffThreshold(now);
      if (diff <= -threshold) {
        urnClass = "bad";
        advantageClass = "TopbarRankAdvantageBad";
      } else if (diff >= threshold) {
        urnClass = "good";
        advantageClass = "TopbarRankAdvantageGood";
      }
    }
    ApplyTeamDiffState(state, text, urnClass, advantageClass);
  }


  function SetWarningClass(panel, remaining) {
    RemoveClass(panel, "red");
    RemoveClass(panel, "yellow");
    if (remaining < 10 && remaining % 2 === 1) AddClass(panel, "red");
    else if (remaining < 20 && remaining % 2 === 1) AddClass(panel, "yellow");
  }

  function SetBuffTimerWarning(state, remaining) {
    RemoveClass(state.buffHud, "buffWarningRed");
    RemoveClass(state.buffHud, "buffWarningYellow");
    if (remaining < 10 && remaining % 2 === 1) AddClass(state.buffHud, "buffWarningRed");
    else if (remaining < 20 && remaining % 2 === 1) AddClass(state.buffHud, "buffWarningYellow");
  }


  function ClearRejuvImageClasses(state) {
    var panels = [state.rejuvImage, state.rejuvHudImage];
    var i;
    for (i = 0; i < panels.length; i += 1) {
      RemoveClass(panels[i], "rotating");
      RemoveClass(panels[i], "buff");
      RemoveClass(panels[i], "reverse");
      RemoveClass(panels[i], "white");
    }
  }

  function SetRejuvImage(state, name) {
    ClearRejuvImageClasses(state);
    if (name.indexOf("Cd") !== -1) {
      AddClass(state.rejuvImage, "reverse");
      AddClass(state.rejuvHudImage, "reverse");
      AddClass(state.rejuvImage, "rotating");
      AddClass(state.rejuvHudImage, "rotating");
      Schedule(state, 0.8, function () {
        RemoveClass(state.rejuvImage, "rotating");
        RemoveClass(state.rejuvHudImage, "rotating");
      });
    } else if (name.indexOf("Buff") !== -1) {
      AddClass(state.rejuvImage, "buff");
      AddClass(state.rejuvHudImage, "buff");
      AddClass(state.rejuvImage, "rotating");
      AddClass(state.rejuvHudImage, "rotating");
      Schedule(state, 0.8, function () {
        RemoveClass(state.rejuvImage, "rotating");
        RemoveClass(state.rejuvHudImage, "rotating");
      });
    }
  }

  function SetRejuvLabels(state, timeText, numText) {
    SetText(state.rejuvTime, timeText);
    SetText(state.rejuvHudTime, timeText);
    SetText(state.rejuvNum, numText);
    SetText(state.rejuvHudNum, numText);
  }

  function RefreshChargePanels(state) {
    state.rejuvenatorCharges = Find(state.root, "RejuvenatorCharges");
    state.rejuvenatorFriendly = Find(state.root, "RejuvenatorFriendly");
    state.rejuvenatorEnemy = Find(state.root, "RejuvenatorEnemy");
  }

  function HasRejuvCharge(state) {
    if (!IsValid(state.rejuvenatorFriendly) || !IsValid(state.rejuvenatorEnemy)) RefreshChargePanels(state);
    return PanelHasAnyToken(state.rejuvenatorFriendly, REJUV_TOKENS) || PanelHasAnyToken(state.rejuvenatorEnemy, REJUV_TOKENS);
  }

  function StartRejuvBuff(state, now) {
    state.buffEndAt = now + REJUV_DURATION;
    SetText(state.rejuvBuffTime, FormatSeconds(REJUV_DURATION));
    RemoveClass(state.rejuvBuff, "pop-in");
    AddClass(state.rejuvBuff, "pop-out");
    try { if (IsValid(state.rejuvBuff)) state.rejuvBuff.style.opacity = "1"; } catch (e) { }
  }

  function EndRejuvBuff(state) {
    if (!state.buffEndAt) return;
    state.buffEndAt = 0;
    RemoveClass(state.rejuvBuff, "pop-out");
    AddClass(state.rejuvBuff, "pop-in");
    Schedule(state, 0.5, function () {
      try { if (IsValid(state.rejuvBuff) && !state.buffEndAt) state.rejuvBuff.style.opacity = "0"; } catch (e) { }
    });
  }

  function ResetRootState(state, now) {
    var phase = ComputeRejuvPhase(now || 0);
    state.phaseIndex = phase.index;
    state.phaseStart = phase.phaseStart;
    state.spawnWaiting = phase.remaining <= 0;
    state.claimCount = 0;
    state.lastChargeActive = false;
    state.buffEndAt = 0;
    state.lastSeconds = now || 0;
    SetRejuvLabels(state, phase.remaining <= 0 ? "Spawn" : FormatSeconds(phase.remaining), REJUV_SEQUENCE[phase.index].label);
    ClearRejuvImageClasses(state);
    if (phase.remaining <= 0) {
      AddClass(state.rejuvImage, "white");
      AddClass(state.rejuvHudImage, "white");
    } else {
      SetRejuvImage(state, REJUV_SEQUENCE[phase.index].name);
    }
    EndRejuvBuff(state);
  }

  function ShowRejuvSpawn(state) {
    SetRejuvLabels(state, "Spawn", REJUV_SEQUENCE[state.phaseIndex].label);
    ClearRejuvImageClasses(state);
    AddClass(state.rejuvImage, "white");
    AddClass(state.rejuvHudImage, "white");
  }

  function ShowRejuvCountdown(state, remaining) {
    SetRejuvLabels(state, FormatSeconds(remaining), REJUV_SEQUENCE[state.phaseIndex].label);
    SetWarningClass(state.rejuvHud, remaining);
  }

  function ClaimRejuvSpawn(state, now) {
    var targetIndex;
    state.claimCount += 1;
    StartRejuvBuff(state, now);
    targetIndex = state.claimCount > 2 ? 3 : state.claimCount;
    state.phaseIndex = Math.max(0, Math.min(targetIndex, REJUV_SEQUENCE.length - 1));
    state.phaseStart = now;
    state.spawnWaiting = false;
    SetRejuvImage(state, REJUV_SEQUENCE[state.phaseIndex].name);
  }

  function UpdateRejuvBuff(state, now, chargeActive) {
    var remaining;
    if (!state.buffEndAt) return;
    remaining = Math.max(0, state.buffEndAt - now);
    SetText(state.rejuvBuffTime, FormatSeconds(remaining));
    if (remaining <= 0 || !chargeActive) EndRejuvBuff(state);
  }

  function UpdateRejuv(state, now, chargeActive) {
    var duration;
    var remaining;
    if (state.spawnWaiting) {
      ShowRejuvSpawn(state);
      UpdateRejuvBuff(state, now, chargeActive);
      if (chargeActive && !state.lastChargeActive) ClaimRejuvSpawn(state, now);
      state.lastChargeActive = chargeActive;
      return;
    }
    duration = REJUV_SEQUENCE[state.phaseIndex].duration;
    remaining = Math.max(0, duration - (now - state.phaseStart));
    if (remaining <= 0) {
      state.spawnWaiting = true;
      ShowRejuvSpawn(state);
    } else {
      ShowRejuvCountdown(state, remaining);
    }
    UpdateRejuvBuff(state, now, chargeActive);
    state.lastChargeActive = chargeActive;
  }


  function UpdateRoot(state) {
    var now = ReadGameSeconds(state, false);
    var bridgeRemaining;
    var urnRemaining;
    var chargeActive;
    if (now + 5 < state.lastSeconds || (state.lastSeconds > 30 && now <= 2)) ResetRootState(state, now);
    state.lastSeconds = now;
    if (IsHideout(state.root) || IsStreetBrawl(state.root)) {
      Schedule(state, ROOT_TICK_SECONDS, function () { UpdateRoot(state); });
      return;
    }
    bridgeRemaining = BRIDGE_DURATION - (now % BRIDGE_DURATION);
    SetText(state.buffTime, FormatSeconds(bridgeRemaining));
    SetText(state.buffHudTime, FormatSeconds(bridgeRemaining));
    SetWarningClass(state.buffHud, bridgeRemaining);
    SetBuffTimerWarning(state, bridgeRemaining);
    urnRemaining = now < INITIAL_URN ? INITIAL_URN - (now % INITIAL_URN) : URN_DURATION - (now % URN_DURATION);
    SetText(state.urnHud, FormatSeconds(urnRemaining));
    chargeActive = HasRejuvCharge(state);
    UpdateRejuv(state, now, chargeActive);
    UpdateTeamDiff(state, now);
    Schedule(state, ROOT_TICK_SECONDS, function () { UpdateRoot(state); });
  }

  function Schedule(state, delay, callback) {
    var generation = state.generation;
    try {
      $.Schedule(delay, function () {
        if (state.generation === generation) callback();
      });
    } catch (e) { }
  }

  function BuildRootState(context) {
    var root = RootOf(context);
    var state;
    if (!IsValid(root)) return null;
    try { context[ROOT_GENERATION_KEY] = (context[ROOT_GENERATION_KEY] || 0) + 1; } catch (e) { }
    state = {
      context: context,
      root: root,
      generation: context[ROOT_GENERATION_KEY] || 1,
      lastSeconds: 0,
      phaseIndex: 0,
      phaseStart: 0,
      spawnWaiting: false,
      claimCount: 0,
      lastChargeActive: false,
      buffEndAt: 0,
      lastGameTimeLookup: 0,
      gameTimePanel: null,
      buffTime: Find(root, "BuffTime"),
      buffHudTime: Find(root, "BuffTimeHUD"),
      buffHud: Find(root, "BuffHUD"),
      rejuvTime: Find(root, "RejuvTime"),
      rejuvHudTime: Find(root, "RejuvTimeHUD"),
      rejuvNum: Find(root, "RejuvNum"),
      rejuvHudNum: Find(root, "RejuvNumHUD"),
      rejuvImage: Find(root, "RejuvImg"),
      rejuvHudImage: Find(root, "RejuvImgHUD"),
      rejuvHud: Find(root, "RejuvHUD"),
      rejuvBuff: Find(root, "RejuvBuff"),
      rejuvBuffTime: Find(root, "RejuvTimeBuff"),
      urnHud: Find(root, "UrnHUD"),
      urnTracker: Find(root, "UrnTracker"),
      urnTrackerLabel: Find(root, "UrnTrackerLabel"),
      urnNetworthCard: Find(root, "UrnNetworthCard"),
      urnHudCard: Find(root, "UrnHudCard"),
      teamScoreFriendly: Find(root, "TeamScoreFriendly"),
      teamScoreEnemy: Find(root, "TeamScoreEnemy"),
      advantage: Find(root, "TopbarRankAdvantage"),
      advantageLabel: Find(root, "TopbarRankAdvantageLabel"),
      rejuvenatorCharges: null,
      rejuvenatorFriendly: null,
      rejuvenatorEnemy: null
    };
    RefreshChargePanels(state);
    return state;
  }

  function InitRoot(context) {
    var state = BuildRootState(context);
    var now;
    if (!state || !IsValid(state.buffTime) || !IsValid(state.rejuvTime) || !IsValid(state.urnTrackerLabel)) return false;
    now = ReadGameSeconds(state, true);
    ResetRootState(state, now);
    UpdateRoot(state);
    return true;
  }

  function ReadPlayerGold(state) {
    var value = ParseNumber(IsValid(state.hiddenGold) ? state.hiddenGold.text : "");
    if (!value) value = ParseNumber(IsValid(state.goldRaw) ? state.goldRaw.text : "");
    if (!value) value = ParseNumber(IsValid(state.soulsValue) ? state.soulsValue.text : "");
    return value;
  }

  function CountSpentSouls(mods) {
    var spent = 0;
    var key;
    var panels;
    var i;
    for (key in TIER_COSTS) {
      if (!Object.prototype.hasOwnProperty.call(TIER_COSTS, key)) continue;
      panels = ChildrenWithClass(mods, key);
      for (i = 0; panels && i < panels.length; i += 1) if (IsValid(panels[i])) spent += TIER_COSTS[key];
    }
    return spent;
  }

  function UpdatePlayer(state) {
    var text;
    var unspent;
    if (!IsValid(state.context)) return;
    unspent = ReadPlayerGold(state) - CountSpentSouls(state.modsContainer);
    text = (unspent / 1000).toFixed(1) + "k";
    SetText(state.display, text);
    Schedule(state, PLAYER_TICK_SECONDS, function () { UpdatePlayer(state); });
  }

  function BuildPlayerState(context) {
    try { context[PLAYER_GENERATION_KEY] = (context[PLAYER_GENERATION_KEY] || 0) + 1; } catch (e) { }
    return {
      context: context,
      root: context,
      generation: context[PLAYER_GENERATION_KEY] || 1,
      hiddenGold: Find(context, "HiddenGoldValue"),
      goldRaw: Find(context, "TopbarRankGoldRaw"),
      soulsValue: Find(context, "SoulsValue"),
      display: Find(context, "SpentSoulDisplay"),
      modsContainer: Find(context, "PlayerModsContainer")
    };
  }

  function InitPlayer(context) {
    var state = BuildPlayerState(context);
    if (!IsValid(state.display) || !IsValid(state.modsContainer)) return false;
    UpdatePlayer(state);
    return true;
  }

  function Boot() {
    var context = ContextPanel();
    if (!IsValid(context)) return;
    if (Find(context, "BuffTime") && Find(context, "RejuvTime") && Find(context, "UrnTrackerLabel")) {
      if (!InitRoot(context)) Schedule({ generation: 1 }, 0.5, Boot);
      return;
    }
    if (Find(context, "SpentSoulDisplay") && Find(context, "PlayerModsContainer")) {
      if (!InitPlayer(context)) Schedule({ generation: 1 }, 0.5, Boot);
    }
  }

  Boot();
})();
