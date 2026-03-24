(() => {
  "use strict";

  // --- Timing intervals ---
  const NEUTRAL_SCAN_INTERVAL_MS = 500;
  const NEUTRAL_RENDER_INTERVAL_MS = 250;
  const NEUTRAL_STATE_PURGE_MS = 15000;
  const MINIMAP_SNAPSHOT_INTERVAL_MS = 400;
  const MINIMAP_INVERT_CACHE_MS = 750;

  // Ring size in CSS pixels — must match game's .map_button.neutral { width: 24px; height: 24px; }
  // Do NOT use actuallayoutwidth here; Panorama DPI-scales CSS values, so 24px CSS = 48px actual at 4K.
  const NEUTRAL_RING_SIZE_PX = 24;
  const NEUTRAL_RING_SHOW_MS = 60000;
  const NEUTRAL_RING_FADE_MS = 30000;
  const NEUTRAL_RING_SEMI_OPACITY = 0.50;
  const NEUTRAL_DETAIL_TEXT_WIDTH_PX = 48;
  const NEUTRAL_DETAIL_TEXT_GAP_PX = 4;
  const NEUTRAL_RADIAL_START_DEG = 0;
  const MINIMAP_REFERENCE_SIZE = {
    width: 1512,
    height: 862
  };

  const NEUTRAL_RESPAWN_SECONDS = {
    neutral_weak: 85,
    neutral_medium: 290,
    neutral_large: 335,
    neutral_vault: 300
  };

  const NEUTRAL_RING_THEME = {
    neutral_weak: {
      trackBorder: "rgba(63, 95, 55, 0.90)",
      trackBg: "rgba(18, 30, 16, 0.28)",
      text: "rgba(220, 247, 206, 0.98)"
    },
    neutral_medium: {
      trackBorder: "rgba(120, 78, 34, 0.90)",
      trackBg: "rgba(33, 20, 8, 0.28)",
      text: "rgba(255, 225, 183, 0.98)"
    },
    neutral_large: {
      trackBorder: "rgba(122, 36, 33, 0.92)",
      trackBg: "rgba(38, 11, 11, 0.30)",
      text: "rgba(255, 198, 190, 0.98)"
    },
    neutral_vault: {
      trackBorder: "rgba(92, 52, 122, 0.92)",
      trackBg: "rgba(26, 12, 36, 0.30)",
      text: "rgba(236, 209, 255, 0.98)"
    }
  };
  const NEUTRAL_RING_THEME_DEFAULT = NEUTRAL_RING_THEME.neutral_medium;

  // Panel hierarchy (important for coordinate transforms):
  //   minimap_container (UI.minimapBox)      ← overlay parent, ring positions are % of this
  //     └─ HudMinimapContainer (UI.minimapContainer) ← has XY offset from minimapBox!
  //          └─ hud_minimap (UI.minimap)     ← icon actualxoffset is relative to this
  const UI = {
    root: null,
    hud: null,
    minimapBox: null,       // minimap_container — overlay parent
    minimap: null,           // hud_minimap — icon positions are relative to this
    minimapContainer: null,  // HudMinimapContainer — intermediate panel with offset
    scoreboardRoot: null,
    neutralOverlay: null
  };

  const _neutralRespawnState = new Map();
  const _neutralCoordCache = {};
  const _minimapSnapshot = {
    neutralCamps: [],
    ts: 0
  };

  let _scheduledHandle = null;
  let _lastNeutralScanCheck = 0;
  let _lastNeutralRenderCheck = 0;
  let _snapshotTs = 0;
  let _neutralStateSeq = 0;
  let _neutralSweepToken = 0;
  let _lastScoreboardOpen = false;
  let _lowTimeCacheCleared = false;
  let _minimapInvertCache = {
    ts: 0,
    minimap: null,
    inverted: false,
    teamId: 0
  };
  let _gameTimePanel = null;
  let _gameTimeCache = 0;
  let _gameTimeCacheTs = 0;

  function safeMapCoord(v) {
    const n = Number(v);
    if (!isFinite(n)) return null;
    if (Math.abs(n) > 1000000) return null;
    return n;
  }

  function clampPct(v) {
    if (!isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  function safePanelExtent(v, fallback, maxVal) {
    const n = Number(v);
    const cap = maxVal || 512;
    if (!isFinite(n) || n <= 0 || n > cap) return fallback;
    return n;
  }

  function setPanelClass(panel, className, enabled) {
    if (!panel?.IsValid?.()) return;

    const shouldHave = !!enabled;
    let hasClass = false;
    try {
      hasClass = !!panel.BHasClass?.(className);
    } catch {
      hasClass = false;
    }

    if (hasClass !== shouldHave) {
      panel.SetHasClass(className, shouldHave);
    }
  }

  function resolveMinimapReferenceSize(panel) {
    const reference = panel?.IsValid?.() ? panel : null;

    const width = safePanelExtent(
      reference?.actuallayoutwidth || reference?.contentwidth,
      MINIMAP_REFERENCE_SIZE.width,
      8192
    );
    const height = safePanelExtent(
      reference?.actuallayoutheight || reference?.contentheight,
      MINIMAP_REFERENCE_SIZE.height,
      8192
    );

    return {
      width,
      height
    };
  }

  function getMinimapScanPanels(mm) {
    const panels = [];
    if (mm?.IsValid?.()) panels.push(mm);
    if (UI.minimapBox?.IsValid?.()) panels.push(UI.minimapBox);
    if (UI.minimapContainer?.IsValid?.()) panels.push(UI.minimapContainer);
    if (UI.hud?.IsValid?.()) panels.push(UI.hud);
    if (UI.root?.IsValid?.()) panels.push(UI.root);
    if (UI.scoreboardRoot?.IsValid?.()) panels.push(UI.scoreboardRoot);
    return panels;
  }

  function fmtSeconds(seconds) {
    const s = Math.max(0, seconds | 0);
    const m = (s / 60) | 0;
    const ss = s % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (ss < 10 ? "0" + ss : "" + ss);
  }

  function findRoot(panel) {
    while (panel?.GetParent?.()) {
      panel = panel.GetParent();
    }
    return panel;
  }

  function parseGameTime(text) {
    if (!text) return 0;
    const s = String(text);
    const colon = s.indexOf(":");
    if (colon < 0) return 0;

    let minutes = 0;
    let seconds = 0;
    let c;

    for (let i = 0; i < colon; i++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) minutes = minutes * 10 + (c - 48);
    }

    for (let i = colon + 1, n = 0; i < s.length && n < 2; i++, n++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) seconds = seconds * 10 + (c - 48);
      else break;
    }

    return minutes * 60 + (seconds > 59 ? seconds % 60 : seconds);
  }

  function getGameTime(nowMs) {
    const now = nowMs || Date.now();
    if (now - _gameTimeCacheTs < 200) return _gameTimeCache;

    let t = 0;

    if (_gameTimePanel?.IsValid?.()) {
      try {
        t = parseGameTime(_gameTimePanel.text);
      } catch {}
    }

    if (!t && UI.root?.IsValid?.()) {
      try {
        const topBar = UI.root.FindChildTraverse("TopBar");
        if (topBar) {
          const gameTimePanels = topBar.FindChildrenWithClassTraverse("GameTime");
          if (gameTimePanels?.[0]?.text) {
            _gameTimePanel = gameTimePanels[0];
            t = parseGameTime(gameTimePanels[0].text);
          }
        }
      } catch {}
    }

    if (t > 0) {
      _gameTimeCache = t;
      _gameTimeCacheTs = now;
    }

    return t;
  }

  function refreshPanels() {
    if (
      UI.root?.IsValid?.() &&
      UI.hud?.IsValid?.() &&
      UI.minimapBox?.IsValid?.() &&
      UI.minimapContainer?.IsValid?.() &&
      UI.scoreboardRoot?.IsValid?.() &&
      UI.minimap?.IsValid?.()
    ) {
      return true;
    }

    const root = findRoot($.GetContextPanel());
    if (!root?.IsValid?.()) return false;

    const prevRoot = UI.root;
    const prevHud = UI.hud;
    const prevMinimapBox = UI.minimapBox;
    const prevMinimapContainer = UI.minimapContainer;
    const prevScoreboardRoot = UI.scoreboardRoot;
    const prevMinimap = UI.minimap;

    UI.root = root;
    UI.hud = root.FindChildTraverse("Hud");
    UI.minimapBox = root.FindChildTraverse("minimap_container");
    UI.minimapContainer = root.FindChildTraverse("HudMinimapContainer");
    UI.scoreboardRoot = root.FindChildTraverse("minimap_persp");

    if (!UI.minimap?.IsValid?.()) {
      try {
        UI.minimap = root.FindChildTraverse("hud_minimap");
      } catch {
        UI.minimap = null;
      }
    }

    if (
      prevRoot !== UI.root ||
      prevHud !== UI.hud ||
      prevMinimapBox !== UI.minimapBox ||
      prevMinimapContainer !== UI.minimapContainer ||
      prevScoreboardRoot !== UI.scoreboardRoot ||
      prevMinimap !== UI.minimap
    ) {
      clearMinimapInvertCache();
    }

    return !!(UI.hud?.IsValid?.() && UI.minimapBox?.IsValid?.() && UI.minimapContainer?.IsValid?.() && UI.minimap?.IsValid?.());
  }

  function getMinimap() {
    if (UI.minimap?.IsValid?.()) return UI.minimap;
    if (!UI.root?.IsValid?.()) return null;
    try {
      UI.minimap = UI.root.FindChildTraverse("hud_minimap");
    } catch {
      UI.minimap = null;
    }
    return UI.minimap;
  }

  function panelHasClassRecursive(panel, className, maxDepth) {
    let current = panel;
    let depth = 0;
    const depthLimit = Number.isFinite(maxDepth) ? maxDepth : 10;

    while (current?.IsValid?.() && depth < depthLimit) {
      try {
        if (current.BHasClass?.(className)) return true;
      } catch {}
      current = current.GetParent?.();
      depth++;
    }

    return false;
  }

  function describeButtonTeam(btn) {
    if (!btn?.IsValid?.()) return null;

    const hasFriend =
      btn.BHasClass?.("friend") ||
      btn.BHasClass?.("friendly") ||
      btn.BHasClass?.("ally");
    const hasEnemy = btn.BHasClass?.("enemy");
    const hasTeam1 = btn.BHasClass?.("team1");
    const hasTeam2 = btn.BHasClass?.("team2");

    if (!hasFriend && !hasEnemy && !hasTeam1 && !hasTeam2) return null;

    return {
      teamId: hasTeam2 ? 2 : hasTeam1 ? 1 : hasEnemy ? 2 : hasFriend ? 1 : 0
    };
  }

  function resolveMinimapTeamContext(mm) {
    for (const panel of getMinimapScanPanels(mm)) {
      let buttons = null;
      try {
        buttons = panel.FindChildrenWithClassTraverse?.("map_button");
      } catch {
        buttons = null;
      }

      if (!buttons?.length) continue;

      let fallback = null;
      for (let i = 0; i < buttons.length; i++) {
        const info = describeButtonTeam(buttons[i]);
        if (!info) continue;
        if (info.teamId === 1) {
          return { teamId: info.teamId || 1 };
        }
        if (!fallback) fallback = info;
      }

      if (fallback) {
        return { teamId: fallback.teamId || 0 };
      }
    }

    if (panelHasClassRecursive(mm, "team1", 12)) return { teamId: 1 };
    if (panelHasClassRecursive(mm, "team2", 12)) return { teamId: 2 };

    return { teamId: 0 };
  }

  function resolveMinimapThemeInfo(mm) {
    const context = resolveMinimapTeamContext(mm);
    const teamId = context?.teamId || 0;

    for (const panel of getMinimapScanPanels(mm)) {
      if (panelHasClassRecursive(panel, "theme_inverted", 12) || panelHasClassRecursive(panel, "theme-inverted", 12)) {
        return { inverted: true, teamId };
      }
      if (panelHasClassRecursive(panel, "theme_standard", 12) || panelHasClassRecursive(panel, "theme-standard", 12)) {
        return { inverted: false, teamId };
      }
      if (panelHasClassRecursive(panel, "invert_map", 12)) {
        return { inverted: true, teamId };
      }
    }

    return {
      inverted: teamId === 2 ? true : teamId === 1 ? false : !!(mm?.IsValid?.() && mm.BHasClass?.("invert_map")),
      teamId
    };
  }

  function updateMinimapInvertCache(mm, nowMs) {
    const now = nowMs || Date.now();
    if (_minimapInvertCache.minimap === mm && now - _minimapInvertCache.ts < MINIMAP_INVERT_CACHE_MS) {
      return _minimapInvertCache;
    }

    const themeInfo = resolveMinimapThemeInfo(mm);

    _minimapInvertCache = {
      ts: now,
      minimap: mm,
      inverted: !!themeInfo?.inverted,
      teamId: themeInfo?.teamId || 0
    };

    return _minimapInvertCache;
  }

  function isScoreboardOpen(mm) {
    try {
      if (UI.scoreboardRoot?.IsValid?.() && UI.scoreboardRoot.BHasClass?.("gScoreboardOpen")) return true;
      if (UI.minimapBox?.IsValid?.() && UI.minimapBox.BHasClass?.("gScoreboardOpen")) return true;
      if (UI.minimapContainer?.IsValid?.() && UI.minimapContainer.BHasClass?.("gScoreboardOpen")) return true;
      if (mm?.IsValid?.() && mm.BHasClass?.("gScoreboardOpen")) return true;
      if (UI.root?.IsValid?.() && UI.root.BHasClass?.("gScoreboardOpen")) return true;
    } catch {}
    return false;
  }

  function ensureNeutralOverlay(container) {
    if (UI.neutralOverlay?.IsValid?.()) return UI.neutralOverlay;
    if (!container?.IsValid?.()) return null;

    const overlayId = "NeutralCooldownOverlayLayer";
    let overlay = null;
    try {
      overlay = container.FindChildTraverse(overlayId);
    } catch {}

    if (!overlay?.IsValid?.()) {
      overlay = $.CreatePanel("Panel", container, overlayId);
      overlay.hittest = false;
      overlay.hittestchildren = false;
      overlay.style.position = "0px 0px 0px";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.overflow = "noclip";
      overlay.style.zIndex = "2000";
    }

    UI.neutralOverlay = overlay;
    return overlay;
  }

  function getNeutralType(btn) {
    if (!btn?.IsValid?.()) return null;
    if (btn.BHasClass("neutral_weak")) return "neutral_weak";
    if (btn.BHasClass("neutral_medium")) return "neutral_medium";
    if (btn.BHasClass("neutral_large")) return "neutral_large";
    if (btn.BHasClass("neutral_vault")) return "neutral_vault";
    return null;
  }

  function getNeutralRingId(key) {
    return "NeutralCooldownRing_" + key.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  function createState(camp, now, token) {
    return {
      type: camp.type,
      wasActive: camp.isActive,
      respawnEndMs: 0,
      respawnEndGameSec: 0,
      durationMs: 0,
      ringRoot: null,
      ringFill: null,
      detailLabel: null,
      anchorRoot: null,
      panel: camp.panel || null,
      panelW: safePanelExtent(camp.panel?.actuallayoutwidth || camp.panel?.contentwidth, 24),
      panelH: safePanelExtent(camp.panel?.actuallayoutheight || camp.panel?.contentheight, 24),
      mapPctX: camp.xPct,
      mapPctY: camp.yPct,
      anchorPctX: Number.isFinite(camp.xPct) ? camp.xPct : null,
      anchorPctY: Number.isFinite(camp.yPct) ? camp.yPct : null,
      mapX: camp.actualX,
      mapY: camp.actualY,
      lastSeenMs: now,
      sweepToken: token,
      lastRingSize: -1,
      lastPosX: -1,
      lastPosY: -1,
      lastOpacity: "",
      lastClip: "",
      lastTrackBorder: "",
      lastTrackBg: "",
      lastText: "",
      lastTextColor: "",
      lastTextPosX: -1,
      lastTextPosY: -1,
      lastTextOpacity: "",
      lastIconOpacity: "",
      ringVisible: true
    };
  }

  function resolveNeutralStateKey(neutralType, xPct, yPct, mapX, mapY, panel) {
    if (panel?.IsValid?.()) {
      for (const [key, st] of _neutralRespawnState.entries()) {
        if (!st || st.type !== neutralType) continue;
        if (st.panel?.IsValid?.() && st.panel === panel) return key;
      }
    }

    let bestKey = null;
    let bestDist = Infinity;

    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || st.type !== neutralType) continue;

      const sx = safeMapCoord(st.mapX);
      const sy = safeMapCoord(st.mapY);
      const cx = safeMapCoord(mapX);
      const cy = safeMapCoord(mapY);
      let dx;
      let dy;

      if (sx !== null && sy !== null && cx !== null && cy !== null) {
        dx = sx - cx;
        dy = sy - cy;
      } else {
        dx = (st.mapPctX || 0) - xPct;
        dy = (st.mapPctY || 0) - yPct;
      }

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = key;
      }
    }

    if (bestKey && bestDist <= 36) return bestKey;

    _neutralStateSeq++;
    return "neutral_state_" + _neutralStateSeq;
  }

  function clearNeutralRing(st) {
    if (!st) return;
    try {
      if (st.ringRoot?.IsValid?.()) st.ringRoot.DeleteAsync(0);
    } catch {}
    st.ringRoot = null;
    st.ringFill = null;
    st.lastClip = "";
    st.lastTrackBorder = "";
    st.lastTrackBg = "";
    st.lastRingSize = -1;
    st.lastPosX = -1;
    st.lastPosY = -1;
    st.lastOpacity = "";
    st.ringVisible = true;
  }

  function clearNeutralAnchor(st) {
    if (!st) return;
    try {
      if (st.anchorRoot?.IsValid?.()) st.anchorRoot.DeleteAsync(0);
    } catch {}
    st.anchorRoot = null;
  }

  function clearNeutralDetailLabel(st) {
    if (!st) return;
    try {
      if (st.detailLabel?.IsValid?.()) st.detailLabel.DeleteAsync(0);
    } catch {}
    st.detailLabel = null;
    st.lastText = "";
    st.lastTextColor = "";
    st.lastTextPosX = -1;
    st.lastTextPosY = -1;
    st.lastTextOpacity = "";
  }

  function setNeutralIconOpacity(st, opacityVal) {
    if (!st?.panel?.IsValid?.()) return;

    try {
      if (opacityVal === null) {
        if (st.lastIconOpacity !== null) {
          st.panel.style.opacity = null;
          st.lastIconOpacity = null;
        }
        return;
      }

      const opStr = String(opacityVal);
      if (st.lastIconOpacity !== opStr) {
        st.panel.style.opacity = opStr;
        st.lastIconOpacity = opStr;
      }
    } catch {}
  }

  function clearNeutralTimerEntry(key, st) {
    if (!st) st = _neutralRespawnState.get(key);
    if (!st) return;
    clearNeutralRing(st);
    clearNeutralDetailLabel(st);
    clearNeutralAnchor(st);
    setNeutralIconOpacity(st, null);
    st.respawnEndMs = 0;
    st.respawnEndGameSec = 0;
    st.durationMs = 0;
    _neutralRespawnState.delete(key);
  }

  function clearNeutralRespawnTimers() {
    for (const [key, st] of _neutralRespawnState.entries()) {
      clearNeutralTimerEntry(key, st);
    }
    _neutralRespawnState.clear();
    _neutralStateSeq = 0;
    _neutralSweepToken = 0;
  }

  function clearNeutralCoordCache() {
    for (const key of Object.keys(_neutralCoordCache)) {
      delete _neutralCoordCache[key];
    }
  }

  function clearMinimapInvertCache() {
    _minimapInvertCache.ts = 0;
    _minimapInvertCache.minimap = null;
    _minimapInvertCache.inverted = false;
    _minimapInvertCache.teamId = 0;
  }

  function clearNeutralRuntimeCaches() {
    clearNeutralRespawnTimers();
    clearNeutralCoordCache();
    clearMinimapInvertCache();
    _minimapSnapshot.neutralCamps.length = 0;
    _minimapSnapshot.ts = 0;
    _snapshotTs = 0;
    _lastNeutralScanCheck = 0;
    _lastNeutralRenderCheck = 0;
    _lastScoreboardOpen = false;
    _gameTimeCache = 0;
    _gameTimeCacheTs = 0;
    _gameTimePanel = null;
  }

  function maybeClearNeutralCachesForLowGameTime(gameNowSec) {
    if (!Number.isFinite(gameNowSec) || gameNowSec < 0) return;
    if (gameNowSec < 10) {
      if (_lowTimeCacheCleared) return;
      clearNeutralRuntimeCaches();
      _lowTimeCacheCleared = true;
      return;
    }

    _lowTimeCacheCleared = false;
  }

  function collectMinimapSnapshot(nowMs) {
    const minimap = getMinimap();
    if (!minimap?.IsValid?.()) return null;

    const now = nowMs || Date.now();
    if (_snapshotTs > 0 && now - _snapshotTs < MINIMAP_SNAPSHOT_INTERVAL_MS) {
      return _minimapSnapshot;
    }

    let buttons = null;
    try {
      buttons = minimap.FindChildrenWithClassTraverse("map_button");
    } catch {
      return _minimapSnapshot;
    }

    const camps = _minimapSnapshot.neutralCamps;
    camps.length = 0;

    if (!buttons?.length) {
      _minimapSnapshot.ts = now;
      _snapshotTs = now;
      return _minimapSnapshot;
    }

    const mmGeometry = resolveMinimapReferenceSize(UI.minimap);
    const mmW = mmGeometry.width;
    const mmH = mmGeometry.height;
    let count = 0;

    try {
      for (let i = 0, len = buttons.length; i < len; i++) {
        const btn = buttons[i];
        if (!btn?.IsValid?.() || !btn.BHasClass?.("map_button")) continue;

        const neutralType = getNeutralType(btn);
        if (!neutralType) continue;

        const neutralId = btn.id || ("neutral_idx_" + i + "_" + neutralType);
        let actualX = safeMapCoord(btn.actualxoffset);
        let actualY = safeMapCoord(btn.actualyoffset);

        if (actualX === null || actualY === null) {
          const cached = _neutralCoordCache[neutralId];
          if (!cached) continue;
          actualX = cached.x;
          actualY = cached.y;
        } else {
          _neutralCoordCache[neutralId] = { x: actualX, y: actualY };
        }

        let entry = camps[count];
        if (!entry) {
          entry = { id: "", panel: null, type: "", isActive: false, xPct: 0, yPct: 0, actualX: 0, actualY: 0 };
          camps[count] = entry;
        }

        entry.id = neutralId;
        entry.panel = btn;
        entry.type = neutralType;
        entry.isActive = btn.BHasClass("active");
        entry.actualX = actualX;
        entry.actualY = actualY;
        entry.xPct = clampPct((actualX / mmW) * 100);
        entry.yPct = clampPct((actualY / mmH) * 100);
        count++;
      }
    } catch {}

    camps.length = count;
    _minimapSnapshot.ts = now;
    _snapshotTs = now;
    return _minimapSnapshot;
  }

  function scanNeutralRespawnState(snapshot, nowMs, gameNowSec) {
    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : getGameTime(now);
    const camps = snapshot?.neutralCamps || [];
    const token = ++_neutralSweepToken;

    try {
      for (let i = 0, len = camps.length; i < len; i++) {
        const camp = camps[i];
        if (!camp) continue;

        const key = resolveNeutralStateKey(
          camp.type,
          camp.xPct,
          camp.yPct,
          camp.actualX,
          camp.actualY,
          camp.panel
        );

        let st = _neutralRespawnState.get(key);
        if (!st) {
          st = createState(camp, now, token);
          _neutralRespawnState.set(key, st);
        } else {
          st.type = camp.type;
        }

        if (st.panel !== camp.panel) {
          setNeutralIconOpacity(st, null);
        }

        st.panel = camp.panel || null;
        st.panelW = safePanelExtent(camp.panel?.actuallayoutwidth || camp.panel?.contentwidth, st.panelW || 24);
        st.panelH = safePanelExtent(camp.panel?.actuallayoutheight || camp.panel?.contentheight, st.panelH || 24);
        st.mapPctX = camp.xPct;
        st.mapPctY = camp.yPct;
        if (!Number.isFinite(st.anchorPctX) && Number.isFinite(camp.xPct)) st.anchorPctX = camp.xPct;
        if (!Number.isFinite(st.anchorPctY) && Number.isFinite(camp.yPct)) st.anchorPctY = camp.yPct;
        st.mapX = camp.actualX;
        st.mapY = camp.actualY;
        st.lastSeenMs = now;
        st.sweepToken = token;

        const durationSec = NEUTRAL_RESPAWN_SECONDS[camp.type] || 0;
        if (st.wasActive && !camp.isActive && durationSec > 0) {
          st.durationMs = durationSec * 1000;
          st.respawnEndMs = now + durationSec * 1000;
          st.respawnEndGameSec = gameNow > 0 ? (gameNow + durationSec) : 0;
        } else if (!st.wasActive && camp.isActive) {
          st.respawnEndMs = 0;
          st.respawnEndGameSec = 0;
          st.durationMs = 0;
          clearNeutralRing(st);
          clearNeutralDetailLabel(st);
          setNeutralIconOpacity(st, null);
        }

        st.wasActive = camp.isActive;
      }
    } catch {}

    purgeStaleNeutralStates(now, token);
  }

  function purgeStaleNeutralStates(now, token) {
    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || st.sweepToken === token) continue;
      if (st.respawnEndMs > 0 || st.respawnEndGameSec > 0) continue;
      if (now - (st.lastSeenMs || 0) > NEUTRAL_STATE_PURGE_MS) {
        clearNeutralTimerEntry(key, st);
      }
    }
  }

  function ensureRingRoot(layer, st, key, ringSize, ringPosX, ringPosY) {
    const ringId = getNeutralRingId(key);
    let ringRoot = st.ringRoot;

    if (!ringRoot?.IsValid?.()) {
      ringRoot = layer.FindChildTraverse(ringId);
    }
    if (!ringRoot?.IsValid?.()) {
      ringRoot = $.CreatePanel("Panel", layer, ringId);
      ringRoot.AddClass("neutral-cooldown-ring");
      ringRoot.hittest = false;
      ringRoot.hittestchildren = false;
      ringRoot.style.horizontalAlign = "left";
      ringRoot.style.verticalAlign = "top";
      ringRoot.style.zIndex = "2001";
    } else if (ringRoot.GetParent?.() !== layer) {
      ringRoot.SetParent(layer);
    }
    ringRoot.style.backgroundColor = "transparent";
    ringRoot.style.borderWidth = "0px";
    ringRoot.style.borderColor = "transparent";
    ringRoot.style.clip = null;

    if (Math.abs((st.lastRingSize ?? -1) - ringSize) > 0.05) {
      ringRoot.style.width = ringSize + "px";
      ringRoot.style.height = ringSize + "px";
      st.lastRingSize = ringSize;
    }

    if (Math.abs((st.lastPosX ?? -9999) - ringPosX) > 0.05 || Math.abs((st.lastPosY ?? -9999) - ringPosY) > 0.05) {
      ringRoot.style.position = ringPosX.toFixed(2) + "% " + ringPosY.toFixed(2) + "% 0px";
      st.lastPosX = ringPosX;
      st.lastPosY = ringPosY;
    }

    if (!st.ringVisible) {
      ringRoot.style.visibility = null;
      st.ringVisible = true;
    }

    st.ringRoot = ringRoot;
    return ringRoot;
  }

  function ensureRingFill(st, ringRoot, key) {
    const ringId = getNeutralRingId(key);
    const fillId = ringId + "_fill";
    let ringFill = st.ringFill;

    if (!ringFill?.IsValid?.()) {
      ringFill = ringRoot.FindChildTraverse(fillId);
    }
    if (!ringFill?.IsValid?.()) {
      ringFill = $.CreatePanel("Panel", ringRoot, fillId);
      ringFill.AddClass("neutral-cooldown-ring-fill");
    }
    ringFill.style.position = "0px 0px 0px";
    ringFill.style.width = "100%";
    ringFill.style.height = "100%";

    st.ringFill = ringFill;
    return ringFill;
  }

  function ensureAnchorRoot(layer, st, key, themeInfo) {
    const anchorId = getNeutralRingId(key) + "_anchor";
    let anchorRoot = st.anchorRoot;

    if (!anchorRoot?.IsValid?.()) {
      anchorRoot = layer.FindChildTraverse(anchorId);
    }
    if (!anchorRoot?.IsValid?.()) {
      anchorRoot = $.CreatePanel("Panel", layer, anchorId);
      anchorRoot.AddClass("neutral-cooldown-anchor");
      anchorRoot.hittest = false;
      anchorRoot.hittestchildren = false;
      anchorRoot.style.position = "0px 0px 0px";
      anchorRoot.style.width = "100%";
      anchorRoot.style.height = "100%";
      anchorRoot.style.overflow = "noclip";
      anchorRoot.style.zIndex = "2000";
    } else if (anchorRoot.GetParent?.() !== layer) {
      anchorRoot.SetParent(layer);
    }

    const inverted = !!themeInfo?.inverted;
    setPanelClass(anchorRoot, "invert_map", inverted);
    setPanelClass(anchorRoot, "theme-inverted", inverted);
    setPanelClass(anchorRoot, "theme-standard", !inverted);

    st.anchorRoot = anchorRoot;
    return anchorRoot;
  }

  function ensureDetailLabel(layer, st, key) {
    const ringId = getNeutralRingId(key);
    const labelId = ringId + "_text";
    let detailLabel = st.detailLabel;

    if (!detailLabel?.IsValid?.()) {
      detailLabel = layer.FindChildTraverse(labelId);
    }
    if (!detailLabel?.IsValid?.()) {
      detailLabel = $.CreatePanel("Label", layer, labelId);
      detailLabel.AddClass("neutral-cooldown-timer-detail");
    } else if (detailLabel.GetParent?.() !== layer) {
      detailLabel.SetParent(layer);
    }

    detailLabel.hittest = false;
    detailLabel.hittestchildren = false;
    detailLabel.style.visibility = null;

    st.detailLabel = detailLabel;
    return detailLabel;
  }

  function renderNeutralTimer(st, key, nowMs, gameNowSec, layer, renderCtx) {
    if (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0) {
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
      return;
    }

    const durationMs = st.durationMs > 0
      ? st.durationMs
      : (NEUTRAL_RESPAWN_SECONDS[st.type] || 0) * 1000;

    if (durationMs <= 0) {
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
      return;
    }

    const iconPanel = st.panel;
    const hasLivePanel = !!iconPanel?.IsValid?.();
    const mmW = renderCtx?.mmW || 0;
    const mmH = renderCtx?.mmH || 0;
    const offsetX = renderCtx?.offsetX || 0;
    const offsetY = renderCtx?.offsetY || 0;
    let iconW = st.panelW || 24;
    let iconH = st.panelH || 24;
    let ringPosX = 0;
    let ringPosY = 0;
    let textPosX = 0;
    let textPosY = 0;

    // Coordinate reference is minimap_container (overlay parent) — all % positions relative to this
    if (hasLivePanel) {
      iconW = safePanelExtent(iconPanel.actuallayoutwidth || iconPanel.contentwidth, iconW);
      iconH = safePanelExtent(iconPanel.actuallayoutheight || iconPanel.contentheight, iconH);
      st.panelW = iconW;
      st.panelH = iconH;
    }
    // Ring size in CSS pixels — never use actuallayoutwidth (DPI-scaled → would double-scale)
    const ringSize = NEUTRAL_RING_SIZE_PX;

    // Compute percentage-based anchor from live icon or cached state
    // Icon actualxoffset is relative to hud_minimap, but overlay lives in minimap_container.
    // HudMinimapContainer is offset within minimap_container, so we must add that offset.
    let livePctX = null;
    let livePctY = null;
    if (hasLivePanel) {
      const liveX = safeMapCoord(iconPanel.actualxoffset);
      const liveY = safeMapCoord(iconPanel.actualyoffset);
      // Accumulate offset: hud_minimap→HudMinimapContainer→minimap_container
      if (mmW > 0 && liveX !== null) livePctX = clampPct(((liveX + offsetX) / mmW) * 100);
      if (mmH > 0 && liveY !== null) livePctY = clampPct(((liveY + offsetY) / mmH) * 100);
    }

    if (iconW <= 0) iconW = 24;
    if (iconH <= 0) iconH = 24;

    const iconPctW = mmW > 0 ? (iconW / mmW) * 100 : 0;
    const iconPctH = mmH > 0 ? (iconH / mmH) * 100 : 0;

    const anchorPctX = livePctX !== null ? livePctX
      : (Number.isFinite(st.anchorPctX) ? clampPct(st.anchorPctX)
      : (Number.isFinite(st.mapPctX) ? clampPct(st.mapPctX) : 0));
    const anchorPctY = livePctY !== null ? livePctY
      : (Number.isFinite(st.anchorPctY) ? clampPct(st.anchorPctY)
      : (Number.isFinite(st.mapPctY) ? clampPct(st.mapPctY) : 0));

    // Ring CSS size == icon CSS size (both 24px), so ring top-left = icon top-left
    ringPosX = anchorPctX;
    ringPosY = anchorPctY;

    // Text positioning: CSS pixel constants must be DPI-scaled to match mmW/mmH (DPI-scaled)
    const dpiScale = NEUTRAL_RING_SIZE_PX > 0 ? (iconW / NEUTRAL_RING_SIZE_PX) : 1;
    const textPctW = mmW > 0 ? ((NEUTRAL_DETAIL_TEXT_WIDTH_PX * dpiScale) / mmW) * 100 : 0;
    const gapPct = mmH > 0 ? ((NEUTRAL_DETAIL_TEXT_GAP_PX * dpiScale) / mmH) * 100 : 0;
    textPosX = clampPct(anchorPctX + ((iconPctW - textPctW) * 0.5));
    textPosY = clampPct(anchorPctY + iconPctH + gapPct);

    const scoreboardVisible = !!renderCtx?.scoreboardVisible;
    const theme = NEUTRAL_RING_THEME[st.type] || NEUTRAL_RING_THEME_DEFAULT;
    const anchorRoot = ensureAnchorRoot(layer, st, key, renderCtx?.themeInfo);
    const ringRoot = ensureRingRoot(anchorRoot, st, key, ringSize, ringPosX, ringPosY);
    const ringFill = ensureRingFill(st, ringRoot, key);
    const detailLabel = ensureDetailLabel(anchorRoot, st, key);

    if (theme.trackBorder !== st.lastTrackBorder) {
      ringFill.style.borderColor = theme.trackBorder;
      st.lastTrackBorder = theme.trackBorder;
    }
    if (theme.trackBg !== st.lastTrackBg) {
      ringFill.style.backgroundColor = theme.trackBg;
      st.lastTrackBg = theme.trackBg;
    }

    const now = nowMs || Date.now();
    let remainingMs = Math.max(0, st.respawnEndMs - now);

    if (gameNowSec > 0 && st.respawnEndGameSec > 0) {
      remainingMs = Math.max(0, (st.respawnEndGameSec - gameNowSec) * 1000);
      const syncedEndMs = now + remainingMs;
      if (Math.abs((st.respawnEndMs || 0) - syncedEndMs) > 750) {
        st.respawnEndMs = syncedEndMs;
      }
    } else if (gameNowSec > 0 && st.respawnEndGameSec <= 0 && st.respawnEndMs > 0) {
      st.respawnEndGameSec = gameNowSec + (remainingMs / 1000);
    }

    let targetOpacity = 1;
    if (scoreboardVisible) {
      targetOpacity = 1;
    } else if (remainingMs > NEUTRAL_RING_SHOW_MS) {
      targetOpacity = 0;
    } else if (remainingMs > NEUTRAL_RING_FADE_MS) {
      const t = (NEUTRAL_RING_SHOW_MS - remainingMs) / (NEUTRAL_RING_SHOW_MS - NEUTRAL_RING_FADE_MS);
      targetOpacity = NEUTRAL_RING_SEMI_OPACITY * Math.max(0, Math.min(1, t));
    } else {
      targetOpacity = NEUTRAL_RING_SEMI_OPACITY;
    }

    const opStr = targetOpacity.toFixed(2);
    if (opStr !== st.lastOpacity) {
      ringRoot.style.opacity = opStr;
      st.lastOpacity = opStr;
    }
    setNeutralIconOpacity(st, targetOpacity);

    const pct = Math.max(0, Math.min(1, remainingMs / durationMs));
    const sweepDeg = (pct * 360).toFixed(2);
    const clip = "radial(50% 50%, " + NEUTRAL_RADIAL_START_DEG + "deg, " + sweepDeg + "deg)";
    if (clip !== st.lastClip) {
      ringFill.style.clip = clip;
      st.lastClip = clip;
    }

    const textPos = textPosX.toFixed(2) + "% " + textPosY.toFixed(2) + "% 0px";

    if (Math.abs((st.lastTextPosX ?? -9999) - textPosX) > 0.05 || Math.abs((st.lastTextPosY ?? -9999) - textPosY) > 0.05) {
      detailLabel.style.position = textPos;
      st.lastTextPosX = textPosX;
      st.lastTextPosY = textPosY;
    }

    const text = fmtSeconds(Math.ceil(remainingMs / 1000));
    if (text !== st.lastText) {
      detailLabel.text = text;
      st.lastText = text;
    }

    if (theme.text !== st.lastTextColor) {
      detailLabel.style.color = theme.text;
      st.lastTextColor = theme.text;
    }

    if (st.lastTextOpacity !== opStr) {
      detailLabel.style.opacity = opStr;
      st.lastTextOpacity = opStr;
    }

    st.ringRoot = ringRoot;
    st.ringFill = ringFill;
    st.detailLabel = detailLabel;

    if (remainingMs <= 0) {
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
    }
  }

  // Renders all active respawn timers as radial rings + countdown labels on the minimap overlay
  function renderNeutralRespawnTimers(nowMs, gameNowSec, scoreboardOpen) {
    const minimap = getMinimap();
    const container = UI.minimapBox; // overlay parent — ring % positions are relative to this
    if (!minimap?.IsValid?.() || !container?.IsValid?.()) return;
    const layer = ensureNeutralOverlay(container);
    if (!layer?.IsValid?.()) return;

    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : getGameTime(now);
    const scoreboardVisible = scoreboardOpen ?? isScoreboardOpen(minimap);
    const themeInfo = updateMinimapInvertCache(minimap, now);
    const mmGeometry = resolveMinimapReferenceSize(UI.minimapBox);
    const renderCtx = {
      mmW: mmGeometry.width,
      mmH: mmGeometry.height,
      offsetX: (UI.minimap?.IsValid?.() ? (UI.minimap.actualxoffset || 0) : 0) + (UI.minimapContainer?.IsValid?.() ? (UI.minimapContainer.actualxoffset || 0) : 0),
      offsetY: (UI.minimap?.IsValid?.() ? (UI.minimap.actualyoffset || 0) : 0) + (UI.minimapContainer?.IsValid?.() ? (UI.minimapContainer.actualyoffset || 0) : 0),
      scoreboardVisible,
      themeInfo
    };

    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0)) continue;
      renderNeutralTimer(st, key, now, gameNow, layer, renderCtx);
    }
  }

  function reset() {
    if (_scheduledHandle) {
      $.CancelScheduled(_scheduledHandle);
      _scheduledHandle = null;
    }

    _lowTimeCacheCleared = false;
    clearNeutralRuntimeCaches();
  }

  function boot() {
    if (!refreshPanels()) {
      return $.Schedule(0.5, boot);
    }

    reset();
    loop();
  }

  function loop() {
    if (!refreshPanels()) {
      _scheduledHandle = $.Schedule(0.5, loop);
      return;
    }

    const nowMs = Date.now();
    const gameNow = getGameTime(nowMs);
    maybeClearNeutralCachesForLowGameTime(gameNow);
    const minimap = getMinimap();
    const scoreboardOpen = isScoreboardOpen(minimap);
    const scoreboardJustOpened = scoreboardOpen && !_lastScoreboardOpen;
    _lastScoreboardOpen = scoreboardOpen;

    if (scoreboardJustOpened || nowMs - _lastNeutralScanCheck >= NEUTRAL_SCAN_INTERVAL_MS) {
      _lastNeutralScanCheck = nowMs;
      const snapshot = collectMinimapSnapshot(nowMs);
      if (snapshot) {
        scanNeutralRespawnState(snapshot, nowMs, gameNow);
      }
    }

    if (scoreboardJustOpened || nowMs - _lastNeutralRenderCheck >= NEUTRAL_RENDER_INTERVAL_MS) {
      _lastNeutralRenderCheck = nowMs;
      renderNeutralRespawnTimers(nowMs, gameNow, scoreboardOpen);
    }

    _scheduledHandle = $.Schedule(0.1, loop);
  }

  boot();
})();
