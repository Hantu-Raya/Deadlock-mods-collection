(() => {
  "use strict";

  const NEUTRAL_SCAN_INTERVAL_MS = 500;
  const NEUTRAL_RENDER_INTERVAL_MS = 250;
  const NEUTRAL_STATE_PURGE_MS = 15000;
  const MINIMAP_SNAPSHOT_INTERVAL_MS = 400;

  const NEUTRAL_RING_SIZE_PX = 18;
  const NEUTRAL_DETAIL_TEXT_WIDTH_PX = 48;
  const NEUTRAL_DETAIL_TEXT_HEIGHT_PX = 12;
  const NEUTRAL_DETAIL_TEXT_GAP_PX = 2;
  const NEUTRAL_RADIAL_START_DEG = 0;

  const NEUTRAL_RESPAWN_SECONDS = {
    neutral_weak: 85,
    neutral_medium: 290,
    neutral_large: 335,
    neutral_vault: 300
  };

  const NEUTRAL_RING_THEME = {
    neutral_weak: {
      fill: "rgba(150, 214, 126, 0.98)",
      trackBorder: "rgba(63, 95, 55, 0.90)",
      trackBg: "rgba(18, 30, 16, 0.28)",
      text: "rgba(220, 247, 206, 0.98)"
    },
    neutral_medium: {
      fill: "rgba(237, 165, 72, 0.98)",
      trackBorder: "rgba(120, 78, 34, 0.90)",
      trackBg: "rgba(33, 20, 8, 0.28)",
      text: "rgba(255, 225, 183, 0.98)"
    },
    neutral_large: {
      fill: "rgba(238, 86, 76, 0.98)",
      trackBorder: "rgba(122, 36, 33, 0.92)",
      trackBg: "rgba(38, 11, 11, 0.30)",
      text: "rgba(255, 198, 190, 0.98)"
    },
    neutral_vault: {
      fill: "rgba(199, 122, 255, 0.98)",
      trackBorder: "rgba(92, 52, 122, 0.92)",
      trackBg: "rgba(26, 12, 36, 0.30)",
      text: "rgba(236, 209, 255, 0.98)"
    }
  };
  const NEUTRAL_RING_THEME_DEFAULT = NEUTRAL_RING_THEME.neutral_medium;

  const UI = {
    root: null,
    hud: null,
    minimap: null,
    minimapContainer: null,
    scoreboardRoot: null
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

  function safePanelExtent(v, fallback) {
    const n = Number(v);
    if (!isFinite(n) || n <= 0 || n > 512) return fallback;
    return n;
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
    const root = findRoot($.GetContextPanel());
    if (!root?.IsValid?.()) return false;

    UI.root = root;
    UI.hud = root.FindChildTraverse("Hud");
    UI.minimapContainer = root.FindChildTraverse("HudMinimapContainer");
    UI.scoreboardRoot = root.FindChildTraverse("minimap_persp");

    if (!UI.minimap?.IsValid?.()) {
      try {
        UI.minimap = root.FindChildTraverse("hud_minimap");
      } catch {
        UI.minimap = null;
      }
    }

    return !!(UI.hud?.IsValid?.() && UI.minimapContainer?.IsValid?.() && UI.minimap?.IsValid?.());
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

  function ensureNeutralLayer(minimap) {
    if (!minimap?.IsValid?.()) return null;

    const legacyId = "NeutralCooldownOverlayLayer";
    try {
      const legacyOverlay = minimap.FindChildTraverse(legacyId);
      if (legacyOverlay?.IsValid?.()) {
        legacyOverlay.DeleteAsync(0);
      }
    } catch {}

    return minimap;
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
      panel: camp.panel || null,
      panelW: safePanelExtent(camp.panel?.actuallayoutwidth || camp.panel?.contentwidth, 24),
      panelH: safePanelExtent(camp.panel?.actuallayoutheight || camp.panel?.contentheight, 24),
      mapPctX: camp.xPct,
      mapPctY: camp.yPct,
      mapX: camp.actualX,
      mapY: camp.actualY,
      lastSeenMs: now,
      sweepToken: token,
      lastRingSize: -1,
      lastPosX: -1,
      lastPosY: -1,
      lastOpacity: "",
      lastClip: "",
      lastFillColor: "",
      lastTrackBorder: "",
      lastTrackBg: "",
      lastText: "",
      lastTextColor: "",
      lastTextPosX: -1,
      lastTextPosY: -1,
      lastTextOpacity: "",
      lastIconOpacity: "",
      lastRingPx: -1,
      lastRingPy: -1,
      lastTextAbsX: -1,
      lastTextAbsY: -1,
      lastParentMode: "",
      lastTextParentMode: "",
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
    st.lastFillColor = "";
    st.lastTrackBorder = "";
    st.lastTrackBg = "";
    st.lastRingSize = -1;
    st.lastParentMode = "";
    st.lastPosX = -1;
    st.lastPosY = -1;
    st.lastOpacity = "";
    st.ringVisible = true;
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
    st.lastTextParentMode = "";
    st.lastTextAbsX = -1;
    st.lastTextAbsY = -1;
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

    const mmW = minimap.contentwidth || 200;
    const mmH = minimap.contentheight || 200;
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

  function ensureRingRoot(minimap, st, key, ringSize, ringX, ringY) {
    const ringId = getNeutralRingId(key);
    let ringRoot = st.ringRoot;

    if (!ringRoot?.IsValid?.()) {
      ringRoot = minimap.FindChildTraverse(ringId);
    }
    if (!ringRoot?.IsValid?.()) {
      ringRoot = $.CreatePanel("Panel", minimap, ringId);
      ringRoot.AddClass("neutral-cooldown-ring");
      ringRoot.hittest = false;
      ringRoot.hittestchildren = false;
      ringRoot.style.horizontalAlign = "left";
      ringRoot.style.verticalAlign = "top";
    } else if (ringRoot.GetParent?.() !== minimap) {
      ringRoot.SetParent(minimap);
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

    if (Math.abs((st.lastPosX ?? -9999) - ringX) > 0.05 || Math.abs((st.lastPosY ?? -9999) - ringY) > 0.05) {
      ringRoot.style.position = ringX + "px " + ringY + "px 0px";
      st.lastPosX = ringX;
      st.lastPosY = ringY;
    }

    ringRoot.style.opacity = "1";
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

  function ensureDetailLabel(minimap, st, key) {
    const ringId = getNeutralRingId(key);
    const labelId = ringId + "_text";
    let detailLabel = st.detailLabel;

    if (!detailLabel?.IsValid?.()) {
      detailLabel = minimap.FindChildTraverse(labelId);
    }
    if (!detailLabel?.IsValid?.()) {
      detailLabel = $.CreatePanel("Label", minimap, labelId);
      detailLabel.AddClass("neutral-cooldown-timer-detail");
    } else if (detailLabel.GetParent?.() !== minimap) {
      detailLabel.SetParent(minimap);
    }

    detailLabel.hittest = false;
    detailLabel.hittestchildren = false;
    detailLabel.style.visibility = null;

    st.detailLabel = detailLabel;
    return detailLabel;
  }

  function renderNeutralTimer(st, key, nowMs, gameNowSec, minimap) {
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

    let iconLocalX = st.mapX || 0;
    let iconLocalY = st.mapY || 0;
    let iconW = st.panelW || 24;
    let iconH = st.panelH || 24;
    const iconPanel = st.panel;
    const hasLivePanel = !!iconPanel?.IsValid?.();

    if (hasLivePanel) {
      const liveX = safeMapCoord(iconPanel.actualxoffset);
      const liveY = safeMapCoord(iconPanel.actualyoffset);
      if (liveX !== null) iconLocalX = liveX;
      if (liveY !== null) iconLocalY = liveY;
      iconW = safePanelExtent(iconPanel.actuallayoutwidth || iconPanel.contentwidth, iconW);
      iconH = safePanelExtent(iconPanel.actuallayoutheight || iconPanel.contentheight, iconH);
      st.panelW = iconW;
      st.panelH = iconH;
    } else {
      iconLocalX += 2;
      iconLocalY += 2;
    }

    if (iconW <= 0) iconW = 24;
    if (iconH <= 0) iconH = 24;

    const mmW = minimap?.contentwidth || 0;
    const mmH = minimap?.contentheight || 0;
    const mmOffsetX = minimap?.actualxoffset || 0;
    const mmOffsetY = minimap?.actualyoffset || 0;
    const inverted = minimap?.IsValid?.() && minimap.BHasClass?.("invert_map");

    if (inverted) {
      iconLocalX = mmW - iconLocalX - iconW;
      iconLocalY = mmH - iconLocalY - iconH;
    }

    const iconX = mmOffsetX + iconLocalX;
    const iconY = mmOffsetY + iconLocalY;
    const ringSize = Math.max(NEUTRAL_RING_SIZE_PX, Math.min(iconW, iconH));
    const ringX = Math.round(iconX + (iconW * 0.5) - (ringSize * 0.5));
    const ringY = Math.round(iconY + (iconH * 0.5) - (ringSize * 0.5));

    const ringRoot = ensureRingRoot(minimap, st, key, ringSize, ringX, ringY);
    const ringFill = ensureRingFill(st, ringRoot, key);
    const theme = NEUTRAL_RING_THEME[st.type] || NEUTRAL_RING_THEME_DEFAULT;

    if (theme.fill !== st.lastFillColor) {
      ringFill.style.borderColor = theme.fill;
      ringFill.style.backgroundColor = theme.trackBg;
      st.lastFillColor = theme.fill;
    }
    if (theme.trackBorder !== st.lastTrackBorder) {
      ringFill.style.borderColor = theme.fill;
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

    ringRoot.style.opacity = "1";
    setNeutralIconOpacity(st, 1);

    const pct = Math.max(0, Math.min(1, remainingMs / durationMs));
    const sweepDeg = (pct * 360).toFixed(2);
    const clip = "radial(50% 50%, " + NEUTRAL_RADIAL_START_DEG + "deg, " + sweepDeg + "deg)";
    if (clip !== st.lastClip) {
      ringFill.style.clip = clip;
      st.lastClip = clip;
    }

    const detailLabel = ensureDetailLabel(minimap, st, key);
    const basePctX = Number.isFinite(st.mapPctX) ? clampPct(st.mapPctX) : (mmW > 0 ? clampPct((iconLocalX / mmW) * 100) : 0);
    const basePctY = Number.isFinite(st.mapPctY) ? clampPct(st.mapPctY) : (mmH > 0 ? clampPct((iconLocalY / mmH) * 100) : 0);
    const iconPctW = mmW > 0 ? (iconW / mmW) * 100 : 0;
    const iconPctH = mmH > 0 ? (iconH / mmH) * 100 : 0;
    const textPctW = mmW > 0 ? (NEUTRAL_DETAIL_TEXT_WIDTH_PX / mmW) * 100 : 0;
    const gapPct = mmH > 0 ? (NEUTRAL_DETAIL_TEXT_GAP_PX / mmH) * 100 : 0;
    const textPctX = clampPct(basePctX + (iconPctW * 0.5) - (textPctW * 0.5));
    const textPctY = clampPct(basePctY + iconPctH + gapPct);
    const textPos = textPctX.toFixed(2) + "% " + textPctY.toFixed(2) + "% 0px";

    if (Math.abs((st.lastTextPosX ?? -9999) - textPctX) > 0.05 || Math.abs((st.lastTextPosY ?? -9999) - textPctY) > 0.05) {
      detailLabel.style.position = textPos;
      st.lastTextPosX = textPctX;
      st.lastTextPosY = textPctY;
    }

    st.lastTextAbsX = Math.round((textPctX / 100) * mmW);
    st.lastTextAbsY = Math.round((textPctY / 100) * mmH);
    st.lastTextParentMode = detailLabel.GetParent?.() === minimap ? "minimap" : "other";
    st.lastParentMode = ringRoot.GetParent?.() === minimap ? "minimap" : "other";

    const text = fmtSeconds(Math.ceil(remainingMs / 1000));
    if (text !== st.lastText) {
      detailLabel.text = text;
      st.lastText = text;
    }

    if (theme.text !== st.lastTextColor) {
      detailLabel.style.color = theme.text;
      st.lastTextColor = theme.text;
    }

    if (st.lastTextOpacity !== "1") {
      detailLabel.style.opacity = "1";
      st.lastTextOpacity = "1";
    }

    st.ringRoot = ringRoot;
    st.ringFill = ringFill;
    st.detailLabel = detailLabel;
    st.lastRingPx = ringX;
    st.lastRingPy = ringY;

    if (remainingMs <= 0) {
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
    }
  }

  function renderNeutralRespawnTimers(nowMs, gameNowSec) {
    const minimap = getMinimap();
    if (!minimap?.IsValid?.()) return;
    const layer = ensureNeutralLayer(minimap);
    if (!layer?.IsValid?.()) return;

    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : getGameTime(now);

    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0)) continue;
      renderNeutralTimer(st, key, now, gameNow, layer);
    }
  }

  function reset() {
    if (_scheduledHandle) {
      $.CancelScheduled(_scheduledHandle);
      _scheduledHandle = null;
    }

    _lastNeutralScanCheck = 0;
    _lastNeutralRenderCheck = 0;
    _snapshotTs = 0;
    _lastScoreboardOpen = false;
    _gameTimeCache = 0;
    _gameTimeCacheTs = 0;
    _gameTimePanel = null;

    _minimapSnapshot.neutralCamps.length = 0;
    _minimapSnapshot.ts = 0;

    clearNeutralRespawnTimers();
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
    const minimap = getMinimap();
    const scoreboardOpen = !!(UI.scoreboardRoot?.IsValid?.() && UI.scoreboardRoot.BHasClass?.("gScoreboardOpen"));
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
      renderNeutralRespawnTimers(nowMs, gameNow);
    }

    _scheduledHandle = $.Schedule(0.1, loop);
  }

  boot();
})();
