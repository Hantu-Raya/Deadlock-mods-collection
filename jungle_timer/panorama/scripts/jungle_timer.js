(() => {
  "use strict";

  // ===========================================
  // CONSTANTS
  // ===========================================

  const NEUTRAL_SCAN_INTERVAL_MS = 500;
  const NEUTRAL_RENDER_INTERVAL_MS = 250;
  const NEUTRAL_STATE_PURGE_MS = 15000;
  const NEUTRAL_RING_SIZE_PX = 18;
  const NEUTRAL_RING_THICKNESS_PX = 3;
  const NEUTRAL_ICON_COOLDOWN_OPACITY = 0.60;
  const NEUTRAL_RADIAL_START_DEG = 0;
  const NEUTRAL_RING_SHOW_MS = 60000;    // hide ring when > 60 s (unless scoreboard open)
  const NEUTRAL_RING_FADE_MS = 30000;    // fade-in completes at 30 s — stays semi below this
  const NEUTRAL_RING_SEMI_OPACITY = 0.50; // permanent semi-opacity cap

  const NEUTRAL_RESPAWN_SECONDS = {
    neutral_weak: 85,
    neutral_medium: 290,
    neutral_large: 335,
    neutral_vault: 300
  };

  // Tier color map: Weak=green, Medium=orange, Large=red, Vault=purple.
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

  const MINIMAP_SNAPSHOT_INTERVAL_MS = 400;

  // ===========================================
  // STATE VARIABLES
  // ===========================================

  let hnd = null;
  let lastNeutralScanCheck = 0;
  let lastNeutralRenderCheck = 0;
  let _snapshotTs = 0;
  const _neutralRespawnState = new Map();
  let _neutralStateSeq = 0;
  let _neutralSweepToken = 0;
  let _neutralCoordCache = {};
  let _gameTimePanel = null;
  let _tCache = 0;
  let _tCacheTs = 0;

  // Reusable objects to avoid GC
  const _minimapSnapshot = {
    neutralCamps: [],
    ts: 0
  };

  // ===========================================
  // UI PANEL REFERENCES
  // ===========================================

  const UI = {
    root: null,
    hud: null,
    minimap: null,
    minimapContainer: null
  };

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================

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

  function fmt(s) {
    s = Math.max(0, s | 0);
    const m = (s / 60) | 0;
    const ss = s % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (ss < 10 ? "0" + ss : "" + ss);
  }

  function findRoot(p) {
    while (p.GetParent?.()) {
      p = p.GetParent();
    }
    return p;
  }

  // ===========================================
  // GAME TIME UTILITY
  // ===========================================

  function gTime(nowMs) {
    const n = nowMs || Date.now();

    if (n - _tCacheTs < 200) return _tCache;

    let t = 0;

    if (_gameTimePanel?.IsValid?.()) {
      try {
        t = parseSec(_gameTimePanel.text);
      } catch {}
    }

    if (!t) {
      try {
        const tb = UI.root.FindChildTraverse("TopBar");
        if (tb) {
          const a = tb.FindChildrenWithClassTraverse("GameTime");
          if (a?.[0]?.text) {
            _gameTimePanel = a[0];
            t = parseSec(a[0].text);
          }
        }
      } catch {}
    }

    if (t > 0) {
      _tCache = t;
      _tCacheTs = n;
    }

    return t;
  }

  function parseSec(t) {
    if (!t) return 0;
    const s = String(t);
    const ci = s.indexOf(":");
    if (ci < 0) return 0;

    let mm = 0;
    let ss = 0;
    let c;

    for (let i = 0; i < ci; i++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) mm = mm * 10 + (c - 48);
    }
    for (let i = ci + 1, n = 0; i < s.length && n < 2; i++, n++) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) ss = ss * 10 + (c - 48);
      else break;
    }

    return mm * 60 + (ss > 59 ? ss % 60 : ss);
  }

  function isHideout() {
    if (!UI.hud?.BHasClass) return false;
    try {
      return UI.hud.BHasClass("connectedToHideout") ||
             UI.hud.BHasClass("connectedtohideout") ||
             UI.hud.BHasClass("connectedToHideOut");
    } catch {}
    return false;
  }

  // ===========================================
  // MINIMAP UTILITIES
  // ===========================================

  function findMinimap() {
    if (UI.minimap?.IsValid?.()) return UI.minimap;
    try {
      UI.minimap = UI.root.FindChildTraverse("hud_minimap");
    } catch {}
    return UI.minimap;
  }

  function isScoreboardOpen(mm) {
    try {
      if (mm?.IsValid?.() && mm.BHasClass?.("gScoreboardOpen")) return true;
      if (UI.root?.IsValid?.() && UI.root.BHasClass?.("gScoreboardOpen")) return true;
    } catch {}
    return false;
  }

  // ===========================================
  // MINIMAP SNAPSHOT (neutrals only)
  // ===========================================

  function collectMinimapSnapshot(nowMs) {
    const mm = findMinimap();
    if (!mm) return null;

    const now = nowMs || Date.now();
    if (_snapshotTs > 0 && now - _snapshotTs < MINIMAP_SNAPSHOT_INTERVAL_MS) {
      return _minimapSnapshot;
    }

    let buttons = null;
    try {
      buttons = mm.FindChildrenWithClassTraverse("map_button");
    } catch {
      return _minimapSnapshot;
    }

    if (!buttons?.length) {
      _minimapSnapshot.neutralCamps.length = 0;
      _minimapSnapshot.ts = now;
      _snapshotTs = now;
      return _minimapSnapshot;
    }

    const mmW = mm.contentwidth || 200;
    const mmH = mm.contentheight || 200;
    let neutralCount = 0;

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

        const xPct = clampPct(actualX / mmW * 100);
        const yPct = clampPct(actualY / mmH * 100);

        let entry = _minimapSnapshot.neutralCamps[neutralCount];
        if (!entry) {
          entry = { id: "", panel: null, type: "", isActive: false, xPct: 0, yPct: 0, actualX: 0, actualY: 0 };
          _minimapSnapshot.neutralCamps[neutralCount] = entry;
        }

        entry.id = neutralId;
        entry.panel = btn;
        entry.type = neutralType;
        entry.isActive = btn.BHasClass("active");
        entry.xPct = xPct;
        entry.yPct = yPct;
        entry.actualX = actualX;
        entry.actualY = actualY;
        neutralCount++;
      }
    } catch {}

    _minimapSnapshot.neutralCamps.length = neutralCount;
    _minimapSnapshot.ts = now;
    _snapshotTs = now;
    return _minimapSnapshot;
  }

  // ===========================================
  // NEUTRAL TYPE / RING HELPERS
  // ===========================================

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

  // ===========================================
  // NEUTRAL KEY RESOLUTION
  // ===========================================

  function resolveNeutralStateKey(neutralType, xPct, yPct, mapX, mapY, panel) {
    // Match by panel identity first
    if (panel?.IsValid?.()) {
      for (const [k, st] of _neutralRespawnState.entries()) {
        if (!st || st.type !== neutralType) continue;
        if (st.panel?.IsValid?.() && st.panel === panel) return k;
      }
    }

    // Fall back to nearest-by-position
    let bestKey = null;
    let bestDist = Infinity;

    for (const [k, st] of _neutralRespawnState.entries()) {
      if (!st || st.type !== neutralType) continue;

      const sx = safeMapCoord(st.mapX);
      const sy = safeMapCoord(st.mapY);
      const cx = safeMapCoord(mapX);
      const cy = safeMapCoord(mapY);
      let dx = 0;
      let dy = 0;

      if (sx !== null && sy !== null && cx !== null && cy !== null) {
        dx = sx - cx;
        dy = sy - cy;
      } else {
        dx = (st.mapPctX || 0) - xPct;
        dy = (st.mapPctY || 0) - yPct;
      }

      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestKey = k;
      }
    }

    if (bestKey && bestDist <= 36) return bestKey;

    _neutralStateSeq++;
    return "neutral_state_" + _neutralStateSeq;
  }

  // ===========================================
  // NEUTRAL RING CLEAR HELPERS
  // ===========================================

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
    st.lastOpacity = -1;
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
  }

  function setNeutralIconOpacity(st, opacityVal) {
    if (!st || !st.panel?.IsValid?.()) return;
    try {
      if (opacityVal === null) {
        if (st.lastIconOpacity !== null) {
          st.panel.style.opacity = null;
          st.lastIconOpacity = null;
        }
      } else {
        const opStr = String(opacityVal);
        if (st.lastIconOpacity !== opStr) {
          st.panel.style.opacity = opStr;
          st.lastIconOpacity = opStr;
        }
      }
    } catch {}
  }

  function clearNeutralTimerEntry(key, st) {
    if (!st) st = _neutralRespawnState.get(key);
    if (!st) return;
    clearNeutralRing(st);
    clearNeutralDetailLabel(st);
    setNeutralIconOpacity(st, null);
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

  // ===========================================
  // SCAN NEUTRAL RESPAWN STATE
  // ===========================================

  function scanNeutralRespawnState(snapshot, nowMs, gameNowSec) {
    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : gTime(now);
    const camps = snapshot?.neutralCamps || [];
    const token = ++_neutralSweepToken;

    try {
      for (let i = 0, len = camps.length; i < len; i++) {
        const camp = camps[i];
        if (!camp) continue;

        const key = resolveNeutralStateKey(
          camp.type, camp.xPct, camp.yPct, camp.actualX, camp.actualY, camp.panel
        );
        let st = _neutralRespawnState.get(key);
        const isActive = camp.isActive;
        const durationSec = NEUTRAL_RESPAWN_SECONDS[camp.type] || 0;

        if (!st) {
          st = {
            type: camp.type,
            wasActive: isActive,
            respawnEndMs: 0,
            respawnEndGameSec: 0,
            durationMs: 0,
            ringRoot: null,
            ringFill: null,
            lastClip: "",
            lastRingSize: -1,
            lastParentMode: "",
            lastFillColor: "",
            lastTrackBorder: "",
            lastTrackBg: "",
            detailLabel: null,
            lastText: "",
            lastTextColor: "",
            lastTextPosX: -1,
            lastTextPosY: -1,
            panel: camp.panel || null,
            panelW: safePanelExtent(camp.panel?.actuallayoutwidth || camp.panel?.contentwidth, 24),
            panelH: safePanelExtent(camp.panel?.actuallayoutheight || camp.panel?.contentheight, 24),
            lastIconOpacity: null,
            mapPctX: camp.xPct,
            mapPctY: camp.yPct,
            mapX: camp.actualX,
            mapY: camp.actualY,
            lastSeenMs: now,
            sweepToken: token,
            lastPosX: -1,
            lastPosY: -1,
            lastOpacity: -1,
            ringVisible: true
          };
          _neutralRespawnState.set(key, st);
        } else {
          st.type = camp.type;
        }

        // Update panel reference if changed
        if (st.panel !== camp.panel) {
          setNeutralIconOpacity(st, null);
        }

        st.panel = camp.panel || null;
        st.mapPctX = camp.xPct;
        st.mapPctY = camp.yPct;
        st.mapX = camp.actualX;
        st.mapY = camp.actualY;
        st.lastSeenMs = now;
        st.sweepToken = token;

        if (st.wasActive && !isActive && durationSec > 0) {
          // Camp went inactive => start respawn timer
          st.durationMs = durationSec * 1000;
          st.respawnEndMs = now + durationSec * 1000;
          st.respawnEndGameSec = gameNow > 0 ? (gameNow + durationSec) : 0;
        } else if (!st.wasActive && isActive) {
          // Camp came back => clear timer
          st.respawnEndMs = 0;
          st.respawnEndGameSec = 0;
          st.durationMs = 0;
          clearNeutralRing(st);
          clearNeutralDetailLabel(st);
          setNeutralIconOpacity(st, null);
        } else if (st.respawnEndMs > 0 || st.respawnEndGameSec > 0) {
          // just heartbeat
        }

        st.wasActive = isActive;
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

  // ===========================================
  // RENDER NEUTRAL TIMER (per-camp)
  // ===========================================

  function renderNeutralTimer(st, key, nowMs, gameNowSec, container, mm) {
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

    // --- Visibility gate: hide ring when > 60s AND scoreboard closed ---
    const scoreboardOpen = isScoreboardOpen(mm);
    const nowEarly = nowMs || Date.now();
    let remainingMsEarly = Math.max(0, st.respawnEndMs - nowEarly);
    if (gameNowSec > 0 && st.respawnEndGameSec > 0) {
      remainingMsEarly = Math.max(0, (st.respawnEndGameSec - gameNowSec) * 1000);
    }
    
    // If it's over 60s and Tab is NOT pressed, hide it completely
    if (remainingMsEarly > NEUTRAL_RING_SHOW_MS && !scoreboardOpen) {
      if (st.ringRoot?.IsValid?.()) {
        st.ringRoot.style.visibility = "collapse";
        st.ringVisible = false;
      }
      setNeutralIconOpacity(st, 0); // Hide icon completely
      clearNeutralDetailLabel(st);
      return;
    }

    // --- Create / retrieve ring root ---
    const ringId = getNeutralRingId(key);
    let ringRoot = st.ringRoot;
    if (!ringRoot?.IsValid?.()) {
      ringRoot = container.FindChildTraverse(ringId);
    }
    if (!ringRoot?.IsValid?.()) {
      ringRoot = $.CreatePanel("Panel", container, ringId);
      ringRoot.AddClass("neutral-cooldown-ring");
      ringRoot.hittest = false;
      ringRoot.hittestchildren = false;
    }

    // --- Create / retrieve ring fill ---
    const ringFillId = ringId + "_fill";
    let ringFill = st.ringFill;
    if (!ringFill?.IsValid?.()) {
      ringFill = ringRoot.FindChildTraverse(ringFillId);
    }
    if (!ringFill?.IsValid?.()) {
      ringFill = $.CreatePanel("Panel", ringRoot, ringFillId);
      ringFill.AddClass("neutral-cooldown-ring-fill");
      ringFill.style.borderWidth = NEUTRAL_RING_THICKNESS_PX + "px";
    }

    // --- Apply theme colors (guard redundant writes) ---
    const theme = NEUTRAL_RING_THEME[st.type] || NEUTRAL_RING_THEME_DEFAULT;
    if (theme.fill !== st.lastFillColor) {
      ringFill.style.borderColor = theme.fill;
      st.lastFillColor = theme.fill;
    }
    if (theme.trackBorder !== st.lastTrackBorder) {
      ringRoot.style.borderColor = theme.trackBorder;
      st.lastTrackBorder = theme.trackBorder;
    }
    if (theme.trackBg !== st.lastTrackBg) {
      ringRoot.style.backgroundColor = theme.trackBg;
      st.lastTrackBg = theme.trackBg;
    }

    // --- Determine icon position and size ---
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

    const mmW = mm?.contentwidth || 0;
    const mmH = mm?.contentheight || 0;
    const mmOffsetX = mm?.actualxoffset || 0;
    const mmOffsetY = mm?.actualyoffset || 0;
    const inverted = mm?.IsValid?.() && mm.BHasClass?.("invert_map");
    if (inverted) {
      iconLocalX = mmW - iconLocalX - iconW;
      iconLocalY = mmH - iconLocalY - iconH;
    }

    const iconX = mmOffsetX + iconLocalX;
    const iconY = mmOffsetY + iconLocalY;

    // --- Ring size ---
    const ringSize = Math.max(NEUTRAL_RING_SIZE_PX, Math.min(iconW, iconH));
    if (Math.abs((st.lastRingSize ?? -1) - ringSize) > 0.05) {
      ringRoot.style.width = ringSize + "px";
      ringRoot.style.height = ringSize + "px";
      st.lastRingSize = ringSize;
    }

    // --- Ring position ---
    const centerX = iconX + iconW * 0.5;
    const centerY = iconY + iconH * 0.5;
    const px = centerX - ringSize * 0.5;
    const py = centerY - ringSize * 0.5;

    if (hasLivePanel) {
      // Parent ring directly to the icon panel; use Panorama's built-in centering so
      // no raw pixel arithmetic is needed — this is fully resolution/aspect-ratio agnostic.
      if (ringRoot.GetParent?.() !== iconPanel) {
        ringRoot.SetParent(iconPanel);
        st.lastPosX = -9999;
        st.lastPosY = -9999;
      }
      if (st.lastParentMode !== "icon") {
        ringRoot.style.horizontalAlign = "center";
        ringRoot.style.verticalAlign = "center";
        ringRoot.style.position = "0px 0px 0px";
        st.lastParentMode = "icon";
        st.lastPosX = 0;
        st.lastPosY = 0;
      }
    } else {
      // Fallback: no live panel — position ring absolutely inside the minimap container.
      if (ringRoot.GetParent?.() !== container) {
        ringRoot.SetParent(container);
        st.lastPosX = -9999;
        st.lastPosY = -9999;
      }
      if (st.lastParentMode !== "container") {
        ringRoot.style.horizontalAlign = "left";
        ringRoot.style.verticalAlign = "top";
        st.lastParentMode = "container";
        st.lastPosX = -9999;
        st.lastPosY = -9999;
      }
      if (Math.abs((st.lastPosX ?? -9999) - px) > 0.05 || Math.abs((st.lastPosY ?? -9999) - py) > 0.05) {
        ringRoot.style.position = px + "px " + py + "px 0px";
        st.lastPosX = px;
        st.lastPosY = py;
      }
    }

    // --- Compute remaining time ---
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

    // --- Ring opacity: fade in 60s→30s, stay semi below 30s, full when Tab open ---
    let targetOpacity;
    if (scoreboardOpen) {
      targetOpacity = 1;
    } else if (remainingMs <= NEUTRAL_RING_FADE_MS) {
      targetOpacity = NEUTRAL_RING_SEMI_OPACITY;
    } else {
      const t = (NEUTRAL_RING_SHOW_MS - remainingMs) / (NEUTRAL_RING_SHOW_MS - NEUTRAL_RING_FADE_MS);
      targetOpacity = NEUTRAL_RING_SEMI_OPACITY * Math.max(0, Math.min(1, t));
    }
    const opStr = targetOpacity.toFixed(2);
    if (opStr !== st.lastOpacity) {
      ringRoot.style.opacity = opStr;
      st.lastOpacity = opStr;
    }
    // Restore visibility if previously collapsed
    if (!st.ringVisible) {
      ringRoot.style.visibility = null;
      st.ringVisible = true;
    }

    // Apply exact same opacity to icon
    setNeutralIconOpacity(st, targetOpacity);

    // --- Drive radial clip ---
    const pct = Math.max(0, Math.min(1, remainingMs / durationMs));
    const sweepDeg = (pct * 360).toFixed(2);
    const clip = "radial(50% 50%, " + NEUTRAL_RADIAL_START_DEG + "deg, " + sweepDeg + "deg)";
    if (clip !== st.lastClip) {
      ringFill.style.clip = clip;
      st.lastClip = clip;
    }

    st.ringRoot = ringRoot;
    st.ringFill = ringFill;

    // --- Detail label (shown when scoreboard open) ---
    // scoreboardOpen already computed above
    if (scoreboardOpen) {
      const detailId = ringId + "_text";
      let detailLabel = st.detailLabel;
      if (!detailLabel?.IsValid?.()) {
        detailLabel = container.FindChildTraverse(detailId);
      }
      if (!detailLabel?.IsValid?.()) {
        detailLabel = $.CreatePanel("Label", container, detailId);
        detailLabel.AddClass("neutral-cooldown-timer-detail");
      }

      const textX = centerX - 18;
      const textY = py + ringSize + 1;
      if (Math.abs((st.lastTextPosX ?? -9999) - textX) > 0.05 || Math.abs((st.lastTextPosY ?? -9999) - textY) > 0.05) {
        detailLabel.style.position = textX + "px " + textY + "px 0px";
        st.lastTextPosX = textX;
        st.lastTextPosY = textY;
      }

      const text = fmt(Math.ceil(remainingMs / 1000));
      if (text !== st.lastText) {
        detailLabel.text = text;
        st.lastText = text;
      }
      if (theme.text !== st.lastTextColor) {
        detailLabel.style.color = theme.text;
        st.lastTextColor = theme.text;
      }
      st.detailLabel = detailLabel;
    } else if (st.detailLabel?.IsValid?.()) {
      clearNeutralDetailLabel(st);
    }

    // --- Clear timer when expired ---
    if (remainingMs <= 0) {
      st.respawnEndMs = 0;
      st.respawnEndGameSec = 0;
      clearNeutralRing(st);
      clearNeutralDetailLabel(st);
      setNeutralIconOpacity(st, null);
      st.durationMs = 0;
    }
  }

  // ===========================================
  // RENDER ALL NEUTRAL TIMERS
  // ===========================================

  function renderNeutralRespawnTimers(nowMs, gameNowSec) {
    const mm = findMinimap();
    const container = UI.minimapContainer;
    if (!mm || !container?.IsValid?.()) return;

    const now = nowMs || Date.now();
    const gameNow = gameNowSec > 0 ? gameNowSec : gTime(now);

    for (const [key, st] of _neutralRespawnState.entries()) {
      if (!st || (st.respawnEndMs <= 0 && st.respawnEndGameSec <= 0)) continue;
      renderNeutralTimer(st, key, now, gameNow, container, mm);
    }
  }

  // ===========================================
  // STATE MANAGEMENT
  // ===========================================

  function reset() {
    if (hnd) {
      $.CancelScheduled(hnd);
      hnd = null;
    }

    lastNeutralScanCheck = 0;
    lastNeutralRenderCheck = 0;
    _snapshotTs = 0;
    _neutralCoordCache = {};
    _minimapSnapshot.neutralCamps.length = 0;
    _minimapSnapshot.ts = 0;

    clearNeutralRespawnTimers();
  }

  // ===========================================
  // BOOT / INITIALIZATION
  // ===========================================

  function boot() {
    const r = findRoot($.GetContextPanel());
    UI.root = r;
    UI.hud = r.FindChildTraverse("Hud");
    UI.minimapContainer = r.FindChildTraverse("HudMinimapContainer");

    if (!UI.minimapContainer?.IsValid?.()) {
      return $.Schedule(0.5, boot);
    }

    reset();
    loop();
  }

  // ===========================================
  // MAIN LOOP
  // ===========================================

  function loop() {
    const rn = Date.now();
    const now = gTime(rn);

    if (rn - lastNeutralScanCheck >= NEUTRAL_SCAN_INTERVAL_MS) {
      lastNeutralScanCheck = rn;
      const snapshot = collectMinimapSnapshot(rn);
      if (snapshot) {
        scanNeutralRespawnState(snapshot, rn, now);
      }
    }

    if (rn - lastNeutralRenderCheck >= NEUTRAL_RENDER_INTERVAL_MS) {
      lastNeutralRenderCheck = rn;
      renderNeutralRespawnTimers(rn, now);
    }

    hnd = $.Schedule(0.1, loop);
  }

  // ===========================================
  // START
  // ===========================================

  boot();
})();
