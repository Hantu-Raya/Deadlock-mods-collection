"use strict";

// Urn spawn tracker. Predicts the next soul-urn spawn and shows a mid-boss-style
// marker (urn icon + circular progress ring + TAB-only timer) in our overlay
// (above player markers) at the predicted spot from QolLiteMapUrnData.
//
// TIMING is a FIXED schedule, NOT learned: the urn first spawns at 10:00 and then
// every 5 minutes (10:00, 15:00, 20:00, ...) regardless of when the previous one
// was delivered. So the countdown is purely arithmetic - the next spawn is the
// next 5-minute grid slot after "now" - with no interval learning, no delivery-
// based re-anchoring, and no prediction that can drift or balloon.
//
// SIDE is the one thing we observe. The urn alternates sides every spawn, tied to
// the ABSOLUTE grid slot (slot 0 = 10:00, slot 1 = 15:00, ...). The first-spawn
// side is NOT fixed (it was seen on both sides across matches - likely lane-
// dependent), so we watch where the first real urn actually spawns, snap it to its
// grid slot, remember (side, slot parity), and derive every future slot's side
// from that parity. Keying off slot parity (not "flip from the last one I saw")
// makes it robust to a spawn we never observed: if nobody carries the urn it auto-
// returns and re-spawns on the other side mid-life without a clean fresh idol_spawn,
// but the grid marches on and the parity still yields the correct next side.
//
// The marker hides while a real urn is on the map (the live urn always wins). No
// side is predicted until the first real urn is observed.
//
// MODE "side" (current patch): the urn spawns at the mid point of the alternating
// side. MODE "tier" (future): net-worth lead picks top/mid/bottom; QolLiteMapUrnData
// already carries those bands, so switching is a one-line change.
var QolLiteMapUrn = (function () {
    var MAP_NAME = "dl_midtown";
    var MODE = "side";
    var FIRST_SPAWN_SEC = 600;        // fixed schedule: first urn at 10:00 ...
    var SPAWN_PERIOD = 300;           // ... then every 5 minutes, on the grid, regardless of delivery
    var CLOCK_BACK_SLACK = 3;         // game-clock read jitter tolerance; a larger backward jump = match reset
    var DESCENT_SEC = 12;             // the urn descends from the sky ~12s before it can be picked up
    var POLL_SEC = 0.15;              // brisk, so the prediction hides the instant a real urn appears
    var ADV_THRESHOLD = 0.10;

    var _marker = null;               // { root, ring, timer }
    var _markerVisible = false;
    var _anchorTime = null;           // clock (s) of the last observed spawn (for clock-back detection + logs)
    var _anchorSide = null;           // side of the last observed urn ("left"/"right")
    var _anchorSlot = null;           // grid slot index of that spawn = round((t - FIRST_SPAWN_SEC)/SPAWN_PERIOD)

    var _seenUrn = false;             // a real urn has been observed (else predict nothing - side is unknown)
    var _wasLive = false;             // live-urn state last poll (edge detection)
    var _lastLiveSide = null;         // side of the physical urn (idol_spawn/idol_dropping) while live (diag)
    var _lastIdolSig = "";            // active-idol snapshot, for change-only diagnostic logging
    var _readyForNewSpawn = true;     // only anchor a NEW spawn after the previous urn has gone (none);
                                      // a mid-delivery idol_spawn on the carry side is NOT a fresh spawn

    var _descentMarker = null;        // { root, ring, timer } - the 12s "urn is landing" overlay
    var _descentVisible = false;
    var _descentStartT = null;        // clock (s) the current urn spawned (descent start)
    var _descentUV = null;            // where to draw the descent marker (the fresh urn's spawn point)

    function _ctx() { return $.GetContextPanel(); }
    function _panel(id) { var c = _ctx(); return c ? c.FindChildTraverse(id) : null; }
    function _log(msg) { if (typeof QolLiteMapLog !== "undefined") { QolLiteMapLog.log("urn: " + msg); } }
    function _info(msg) { if (typeof QolLiteMapLog !== "undefined") { QolLiteMapLog.info("urn: " + msg); } }
    function _other(side) { return side === "left" ? "right" : "left"; }

    function _data() {
        return (typeof QolLiteMapUrnData !== "undefined" && QolLiteMapUrnData[MAP_NAME]) ? QolLiteMapUrnData[MAP_NAME] : null;
    }

    // ---- fixed schedule ----
    // Slot index of the next spawn strictly AFTER t (spawns at FIRST_SPAWN_SEC + N*SPAWN_PERIOD).
    function _nextSlot(t) {
        if (t < FIRST_SPAWN_SEC) { return 0; }
        return Math.floor((t - FIRST_SPAWN_SEC) / SPAWN_PERIOD) + 1;
    }
    // Grid slot nearest to a clock time (snaps an observed spawn onto the 5-min grid).
    function _slotOfTime(t) { return Math.round((t - FIRST_SPAWN_SEC) / SPAWN_PERIOD); }
    function _spawnTime(slot) { return FIRST_SPAWN_SEC + slot * SPAWN_PERIOD; }
    // Side of a slot: alternates by ABSOLUTE parity, anchored to the one spawn we
    // observed. (slot - _anchorSlot) even -> same side, odd -> other. Works for a
    // negative difference too (odd -> +/-1, both != 0).
    function _sideOfSlot(slot) {
        if (_anchorSide === null || _anchorSlot === null) { return null; }
        return ((slot - _anchorSlot) % 2 === 0) ? _anchorSide : _other(_anchorSide);
    }

    // ---- game-state reads ----
    function _clockSeconds() {
        var label = _panel("GameTime");
        if (!label || typeof label.text !== "string") { return null; }
        var clean = label.text.replace(/<[^>]+>/g, "");
        // Accept h:mm:ss as well as mm:ss. Past 60:00 the label grows an hours
        // field, and a naive mm:ss match reads "1:02:03" as 1:02 = 62s, which
        // sends the clock backwards and balloons the countdown to tens of minutes.
        var h = clean.match(/(\d+):(\d{2}):(\d{2})/);
        if (h) { return parseInt(h[1], 10) * 3600 + parseInt(h[2], 10) * 60 + parseInt(h[3], 10); }
        var mm = clean.match(/(\d+):(\d{2})/);
        return mm ? (parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10)) : null;
    }

    function _networth(panelId) {
        var panel = _panel(panelId);
        if (!panel || !panel.FindChildrenWithClassTraverse) { return null; }
        var labels = panel.FindChildrenWithClassTraverse("ScoreLabel");
        if (!labels || !labels.length) { return null; }
        var txt = String(labels[0].text || "").replace(/<[^>]+>/g, "").toLowerCase();
        var mult = 1, last = txt.charAt(txt.length - 1);
        if (last === "k") { mult = 1000; txt = txt.slice(0, -1); }
        else if (last === "m") { mult = 1000000; txt = txt.slice(0, -1); }
        txt = txt.replace(/[^0-9.\-]/g, "");
        var v = parseFloat(txt);
        return isNaN(v) ? null : v * mult;
    }

    function _hasClassUpFromMapRender(cls) {
        var node = _panel("map_render");
        while (node) {
            if (node.BHasClass && node.BHasClass(cls)) { return true; }
            node = node.GetParent ? node.GetParent() : null;
        }
        return false;
    }
    function _inverted() { return _hasClassUpFromMapRender("invert_map"); }
    function _detailView() {
        return _hasClassUpFromMapRender("gDetailView") || _hasClassUpFromMapRender("gScoreboardOpen");
    }

    function _isActive(p) {
        if (!p) { return false; }
        if (p.BHasClass && (p.BHasClass("active") || p.BHasClass("active_map_button"))) { return true; }
        var vis = p.style ? p.style.visibility : "";
        var op = p.style ? p.style.opacity : "";
        return !!(vis && vis !== "collapse" && op !== "0" && op !== "0.0");
    }

    function _sideOf(panel) {
        if (!panel || !panel.style) { return null; }
        var m = String(panel.style.position || "").match(/^\s*([0-9.+\-]+)%/);
        if (!m) { return null; }
        return parseFloat(m[1]) < 50 ? "left" : "right";
    }

    function _firstActiveOfClass(cls) {
        var ctx = _ctx();
        if (!ctx || !ctx.FindChildrenWithClassTraverse) { return null; }
        var found = ctx.FindChildrenWithClassTraverse(cls);
        if (found) {
            for (var i = 0; i < found.length; i++) {
                if (_isActive(found[i])) { return found[i]; }
            }
        }
        return null;
    }

    // The active urn SPAWN-location marker (idol_spawn) - its side is the true
    // spawn side. Distinct from the two deposit sites (idol_return*, one per side,
    // active throughout the urn's life), which must NOT drive the alternation.
    function _activeSpawnMarker() { return _firstActiveOfClass("idol_spawn"); }

    // The physical urn (spawn crate or a dropped/carried urn) - its position is
    // meaningful, unlike the static idol_return deposit sites. Used only for
    // diagnostics (which side the urn is really on) for now.
    function _physicalUrn() {
        return _activeSpawnMarker() || _firstActiveOfClass("idol_dropping");
    }

    // Any active idol marker on the map (spawn/dropping/return) = a real urn is up.
    var _LIVE_CLASSES = ["idol_spawn", "idol_dropping", "idol_return", "idol_return_friendly", "idol_return_enemy"];
    function _liveUrn() {
        for (var c = 0; c < _LIVE_CLASSES.length; c++) {
            var p = _firstActiveOfClass(_LIVE_CLASSES[c]);
            if (p) { return p; }
        }
        return null;
    }

    // Compact snapshot of every active idol marker (class:side ...), for the
    // diagnostic log - the untouched-respawn shows up here as whatever classes
    // the auto-returning urn actually uses.
    function _idolSig() {
        var ctx = _ctx();
        if (!ctx || !ctx.FindChildrenWithClassTraverse) { return ""; }
        var parts = [];
        for (var c = 0; c < _LIVE_CLASSES.length; c++) {
            var found = ctx.FindChildrenWithClassTraverse(_LIVE_CLASSES[c]);
            if (found) {
                for (var i = 0; i < found.length; i++) {
                    if (_isActive(found[i])) { parts.push(_LIVE_CLASSES[c] + ":" + (_sideOf(found[i]) || "?")); }
                }
            }
        }
        return parts.join(" ");
    }

    function _fmt(sec) {
        if (sec === null) { return "--:--"; }
        if (sec < 0) { sec = 0; }
        var m = Math.floor(sec / 60), s = sec % 60;
        return m + ":" + (s < 10 ? "0" + s : s);
    }

    function _tierBand() {
        var f = _networth("TeamScoreFriendly"), e = _networth("TeamScoreEnemy");
        if (f === null || e === null || e === 0) { return "mid"; }
        var d = (f - e) / e;
        // top of the map favours the team ahead; invert_map (team 2) flips it.
        if (d > ADV_THRESHOLD) { return _inverted() ? "bottom" : "top"; }
        if (d < -ADV_THRESHOLD) { return _inverted() ? "top" : "bottom"; }
        return "mid";
    }

    function _predict(t) {
        // Nothing to show until the first real urn is observed (side is unknown).
        if (t === null || !_seenUrn || _anchorSide === null) { return null; }
        var data = _data();
        if (!data || !data.spawns) { return null; }
        var slot = _nextSlot(t);             // next fixed 5-min grid spawn after now
        var side = _sideOfSlot(slot);
        if (!side) { return null; }
        var secs = _spawnTime(slot) - t;     // countdown to that fixed spawn (0..SPAWN_PERIOD)
        var band = (MODE === "tier") ? _tierBand() : "mid";
        var byBand = data.spawns[side];
        var pt = byBand && (byBand[band] || byBand.mid);
        if (!pt) { return null; }
        return { u: pt.u, v: pt.v, secs: secs, window: SPAWN_PERIOD, side: side };
    }

    // ---- marker ----
    function _ensureMarker() {
        if (_marker && _marker.root && _marker.root.IsValid && _marker.root.IsValid()) { return _marker; }
        var host = _panel("minimap_urn_host");
        if (!host) { return null; }
        var root = $.CreatePanel("Panel", host, "bm_urn_marker");
        root.AddClass("bm_urn");
        root.style.horizontalAlign = "left";
        root.style.verticalAlign = "top";
        var backer = $.CreatePanel("Panel", root, "");
        backer.AddClass("bm_urn_backer");
        var ring = $.CreatePanel("Panel", root, "");
        ring.AddClass("bm_urn_ring");
        var icon = $.CreatePanel("Panel", root, "");
        icon.AddClass("bm_urn_icon");
        var timer = $.CreatePanel("Label", root, "");
        timer.AddClass("bm_urn_timer");
        _marker = { root: root, ring: ring, timer: timer };
        return _marker;
    }

    function _showMarker(pred, detail) {
        var m = _ensureMarker();
        if (!m) { if (!_markerVisible) { _info("show FAILED: minimap_urn_host / marker missing"); } return; }
        m.root.style.x = (pred.u * 100).toFixed(3) + "%";
        m.root.style.y = (pred.v * 100).toFixed(3) + "%";
        m.root.style.visibility = "visible";
        // ring fills clockwise toward the spawn: clip the bordered circle to a
        // radial arc of 0..360deg (the trick the engine's CircularProgressBar uses).
        var win = pred.window || SPAWN_PERIOD;
        var frac = 1 - Math.max(0, Math.min(1, pred.secs / win));
        if (m.ring) {
            try { m.ring.style.clip = "radial(50% 50%, 0deg, " + Math.round(frac * 360) + "deg)"; } catch (e) {}
        }
        if (m.timer) {
            m.timer.text = _fmt(pred.secs);
            m.timer.style.visibility = detail ? "visible" : "collapse";
        }
        if (!_markerVisible) {
            _markerVisible = true;
            _log("marker shown: u=" + pred.u.toFixed(3) + " v=" + pred.v.toFixed(3) +
                " next=" + pred.side + " in=" + Math.round(pred.secs) + "s");
        }
    }

    function _hideMarker() {
        if (_marker && _marker.root) { _marker.root.style.visibility = "collapse"; }
        _markerVisible = false;
    }

    // ---- descent overlay (12s "urn is landing" timer) ----
    function _lerp(a, b, k) { return Math.round(a + (b - a) * k); }
    function _h2(n) { n = n < 0 ? 0 : (n > 255 ? 255 : n); var s = n.toString(16); return s.length < 2 ? "0" + s : s; }
    // colour ramps with the descent: just-spawned = red, half = yellow, landed = green.
    function _descentColor(f) {
        if (f < 0) { f = 0; } if (f > 1) { f = 1; }
        var r, g, b;
        if (f < 0.5) { var k = f / 0.5; r = 255; g = _lerp(77, 210, k); b = 77; }              // red -> yellow
        else { var k2 = (f - 0.5) / 0.5; r = _lerp(255, 77, k2); g = _lerp(210, 224, k2); b = _lerp(77, 122, k2); }  // yellow -> green
        return "#" + _h2(r) + _h2(g) + _h2(b);
    }
    function _ensureDescentMarker() {
        if (_descentMarker && _descentMarker.root && _descentMarker.root.IsValid && _descentMarker.root.IsValid()) { return _descentMarker; }
        var host = _panel("minimap_urn_host");
        if (!host) { return null; }
        var root = $.CreatePanel("Panel", host, "bm_urn_descent_marker");
        root.AddClass("bm_urn");
        root.style.horizontalAlign = "left";
        root.style.verticalAlign = "top";
        var backer = $.CreatePanel("Panel", root, ""); backer.AddClass("bm_urn_backer");
        var ring = $.CreatePanel("Panel", root, ""); ring.AddClass("bm_urn_ring"); ring.AddClass("bm_urn_descent_ring");
        var icon = $.CreatePanel("Panel", root, ""); icon.AddClass("bm_urn_icon");
        var timer = $.CreatePanel("Label", root, ""); timer.AddClass("bm_urn_timer");
        _descentMarker = { root: root, ring: ring, timer: timer };
        return _descentMarker;
    }
    function _showDescent(elapsed) {
        var m = _ensureDescentMarker();
        if (!m || !_descentUV) { return; }
        m.root.style.x = (_descentUV.u * 100).toFixed(3) + "%";
        m.root.style.y = (_descentUV.v * 100).toFixed(3) + "%";
        m.root.style.visibility = "visible";
        var frac = Math.max(0, Math.min(1, elapsed / DESCENT_SEC));   // ring fills as it lands
        if (m.ring) {
            // wash-color tints the white base ring (a colour multiply, not a border
            // set) - so it never accumulates border width like borderColor did.
            try { m.ring.style.washColor = _descentColor(frac); } catch (e) {}
            try { m.ring.style.clip = "radial(50% 50%, 0deg, " + Math.round(frac * 360) + "deg)"; } catch (e) {}
        }
        if (m.timer) {
            m.timer.text = String(Math.max(0, Math.ceil(DESCENT_SEC - elapsed)));
            m.timer.style.visibility = "visible";   // the descent count is short + important - always show
        }
        _descentVisible = true;
    }
    function _hideDescent() {
        if (_descentMarker && _descentMarker.root) { _descentMarker.root.style.visibility = "collapse"; }
        _descentVisible = false;
    }

    // Drop the observed side (new match / clock reset). The marker stays hidden
    // until a fresh real urn is observed, so nothing is predicted off a stale side
    // left over from the previous match. Timing needs no reset - it is the grid.
    function _resetTracking() {
        _anchorTime = null; _anchorSide = null; _anchorSlot = null; _seenUrn = false;
        _wasLive = false; _lastLiveSide = null;
        _lastIdolSig = ""; _readyForNewSpawn = true;
        _descentStartT = null; _descentUV = null;
        _hideMarker(); _hideDescent();
    }

    // ---- poll ----
    function _poll() {
        var enabled = !!QolLiteMapState.get().urnTrackerEnabled;
        var t = _clockSeconds();
        var spawn = _activeSpawnMarker();   // the urn's SPAWN marker (true spawn side)
        var live = _liveUrn();              // any urn activity (spawn / dropped / returning)

        // A new match / sandbox restart resets the game clock while this HUD context
        // (and our remembered side) survives; the old side then belongs to a game
        // that is over. If the clock jumped backwards, forget it and re-observe.
        if (t !== null && _anchorTime !== null && t + CLOCK_BACK_SLACK < _anchorTime) {
            _log("clock went backwards (t=" + t + " < anchor=" + _anchorTime + ") - reset tracking");
            _resetTracking();
        }

        // Diagnostics (DEBUG only, so release polls stay light and the console
        // quiet): snapshot every active idol marker whenever it changes, and
        // track the physical-urn side. The extra tree scans only run under DEBUG.
        if (typeof QolLiteMapLog !== "undefined" && QolLiteMapLog.isDebug()) {
            var sig = _idolSig();
            if (sig !== _lastIdolSig) {
                _lastIdolSig = sig;
                _log("idols[" + (t === null ? "?" : t) + "s]: " + (sig || "(none)"));
            }
            var phys = _physicalUrn();
            if (phys) { var ps = _sideOf(phys); if (ps) { _lastLiveSide = ps; } }
        }

        // Observe the SIDE off the SPAWN marker, and only for a GENUINELY NEW urn -
        // i.e. once the previous one has left the map (_readyForNewSpawn, set on the
        // (none) transition below). A urn spawned on side A and carried to side B
        // briefly shows idol_spawn on B mid-delivery; the ready-gate keeps that from
        // being mistaken for a fresh spawn. (Deposit sites idol_return* sit on both
        // sides throughout, which is why we key off idol_spawn only.) The schedule
        // itself is fixed, so all we take from a spawn is (side, grid slot).
        if (spawn && _readyForNewSpawn) {
            var side = _sideOf(spawn);
            if (side) {
                var slot = (t !== null) ? _slotOfTime(t) : _anchorSlot;
                if (_seenUrn) {
                    var predicted = _sideOfSlot(slot);   // what parity said this slot would be
                    if (predicted && side !== predicted) {
                        _info("MISPREDICT: predicted " + predicted + " but urn spawned " + side +
                            " (slot " + slot + ") - re-anchoring side");
                    }
                }
                _anchorSide = side;
                _anchorSlot = slot;
                _seenUrn = true;
                _readyForNewSpawn = false;
                if (t !== null) { _anchorTime = t; }
                // a fresh urn just spawned: start its 12s descent timer at its spawn point
                _descentStartT = t;
                var _db = _data();
                var _dbside = _db && _db.spawns && _db.spawns[side];
                var _dpt = _dbside && _dbside.mid;
                _descentUV = _dpt ? { u: _dpt.u, v: _dpt.v } : null;
                _log("anchor(spawn): side=" + side + " slot=" + slot + " t=" + _anchorTime);
            }
        }

        // Live-period edge: when the urn leaves the map, the next idol_spawn is a
        // fresh urn, so re-open the anchor gate. No timing re-anchor - the grid is
        // fixed, so even an untouched urn that re-spawned off our observation is
        // covered by the next grid slot automatically.
        if (!live && _wasLive) {
            _readyForNewSpawn = true;
            _log("resolve lastLiveSide=" + _lastLiveSide);
        }
        _wasLive = live;

        // A real urn always wins: whenever any urn is in play, hide our prediction
        // so it never sits on top of the live urn icon (which we never touch; our
        // overlay renders above the C++ minimap).
        if (live || !enabled) {
            _hideMarker();
        } else {
            var pred = _predict(t);
            if (pred) { _showMarker(pred, _detailView()); }
            else { _hideMarker(); }
        }

        // Descent overlay: for the first ~12s after a fresh urn spawns it is still
        // falling from the sky (not pickable). Draw a countdown on it - urn icon +
        // ring filling to full as it lands, colour red -> yellow (half) -> green.
        if (enabled && live && _descentStartT !== null && t !== null &&
            (t - _descentStartT) >= 0 && (t - _descentStartT) < DESCENT_SEC) {
            _showDescent(t - _descentStartT);
        } else {
            _hideDescent();
        }
        $.Schedule(POLL_SEC, _poll);
    }

    function _syncControls() {
        var tg = _panel("minimap_urn_tracker_toggle");
        if (tg && typeof tg.SetSelected === "function") { tg.SetSelected(!!QolLiteMapState.get().urnTrackerEnabled); }
    }

    function bindControls() {
        var tg = _panel("minimap_urn_tracker_toggle");
        if (!tg) { return; }
        tg.SetPanelEvent("onactivate", function () {
            QolLiteMapState.patch({ urnTrackerEnabled: !QolLiteMapState.get().urnTrackerEnabled });
            _syncControls();
        });
    }

    function init() {
        bindControls();
        _syncControls();
        _poll();
    }

    function refresh() { _syncControls(); }

    return { init: init, refresh: refresh };
})();
