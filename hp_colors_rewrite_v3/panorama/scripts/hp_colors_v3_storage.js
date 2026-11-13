(function () {
  "use strict";
  // v2's proven fragment/title queue; durable bodies use the shared v3 codec.
  var PAGE_URL = "https://hantu-raya.github.io/hpv2-store/";
  var PAGE_VERSION = 1;
  var KEY_CURRENT = "hantu.hpcolors.v3/state";
  var KEY_PREVIOUS = KEY_CURRENT + ".prev";
  var TITLE_PREFIX = "HPV2S1:";
  var CHUNK_CHARS = 3000, MAX_CHUNKS = 64, TITLE_MAX_CHARS = 4096;
  // MAX_CHUNKS * CHUNK_CHARS must equal $.HPColorsV3Codec.RECORD.maxChars (tests/store-page.test.js pins both and the page copy).
  var UNAVAILABLE_RETRY_MS = 8000, UNAVAILABLE_POLL_SEC = 60;
  var READY_TIMEOUT_SEC = 30, RENAVIGATE_SEC = 8, EXCHANGE_TIMEOUT_SEC = 5;
  // Request ids must never repeat across storage incarnations: a reincluded script hands its
  // generation on (see retire below) and every inclusion adds a fresh nonce, so a stale page read
  // snapshot or a late reply to a retired bridge cannot match new work.
  var bridgeGeneration = 0;
  var INSTANCE = Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36);
  // requires: include order is settings, from_v2, codec, storage. Collaborators are read at call time through one
  // table (the codec and settings are replaced whole in tests and by a reincluded script).
  var deps = {
    get codec() { return $.HPColorsV3Codec; },
    get settings() { return $.HPColorsV3Settings; },
    get sharing() { return $.HPColorsV3Sharing; },
    get fromV2() { return $.HPColorsV3FromV2; }
  };
  function isCallable(value) { return typeof value === "function"; }
  function isValid(panel) { try { return !!panel && isCallable(panel.IsValid) && panel.IsValid(); } catch (error) { return false; } }
  // -- Hosted page protocol --
  //
  // Fragment = encodeURIComponent(JSON.stringify(request)). Every exchange
  // has a unique `i`; `r` identifies one logical read/write across chunks.
  // Readiness requires our latest hello id, page version, and exact HTTPS
  // document address (with only its fragment allowed to vary).
  function isStoragePage(href) {
    return typeof href === "string" && href.split("#")[0] === PAGE_URL;
  }

  // ==== Section 1: bridge (hosted page queue, create) ====
  // Talks to the page only through the request queue; reads codec and from_v2 through deps.

  function create(options) {
    var opts = options || {};
    var panel = opts.panel;
    var events = null;
    function schedule(seconds, callback) { return $.Schedule(seconds, callback); }
    function cancelScheduled(handle) {
      try {
        $.CancelScheduled(handle);
      } catch {}
    }
    function log(message) {
      // HPV3_DEBUG $.Msg("[HPV3] store " + message);
    }
    var started = false;
    var ready = false;
    // Hosted pages that list "latest" answer "lv" with the newest released version (latest.json).
    var latestSupported = false;
    var unavailable = false;
    var helloId = "";
    var readyTimer = null;
    var exchangeTimer = null;
    var renavigateTimer = null;
    var urlSeen = false;
    var lateLogged = false;
    var urlEventsLogged = 0;
    var serial = 0;
    var prefix = "v3-" + INSTANCE + "." + String(++bridgeGeneration) + "-";
    var active = null;
    var queue = [];
    // Checksum of the current record this bridge fully validated or wrote;
    // only that record may be rotated into the backup key.
    var trustedSum = (opts.state && opts.state.trustedSum) || "";
    // Compare-at-commit ("cas"): the checksum of the whole raw value this bridge last saw at the
    // current key ("none" when absent). The page refuses to replace anything else, so a record
    // written meanwhile (a newer build, another window) is never overwritten.
    var currentMatch = (opts.state && opts.state.currentMatch) || "";
    // Possibly committed writes retain their record identities and controller operation tokens.
    // A replacement chunk may not have committed yet: retain the earlier lost-ack candidate too,
    // until a read or acknowledgement identifies which delta actually landed.
    var unacked = (opts.state && opts.state.unacked) || [];
    var loaded = false;
    var newerSave = false;
    var unreadable = false;

    function snapshot() {
      return { trustedSum: trustedSum, currentMatch: currentMatch,
        unacked: unacked.concat(active && active.op === "write" && active.part + 1 === active.total ? [active.commit] : []) };
    }
    function clearTimer(handle) {
      if (handle !== null) cancelScheduled(handle);
      return null;
    }

    function clearAllTimers() {
      readyTimer = clearTimer(readyTimer);
      helloId = "";
      exchangeTimer = clearTimer(exchangeTimer);
      renavigateTimer = clearTimer(renavigateTimer);
    }

    function send(message) {
      if (!isValid(panel)) return false;
      try {
        panel.SetURL(PAGE_URL + "#" + encodeURIComponent(JSON.stringify(message)));
        return true;
      } catch (error) {
        log("SetURL threw: " + String(error));
        return false;
      }
    }

    // -- Request queue: one request in flight, one reply per exchange --

    function settle(request, result) {
      if (active !== request) return;
      log(request.op + " " + (result.ok ? "acknowledged" : "failed: " + result.error));
      active = null;
      exchangeTimer = clearTimer(exchangeTimer);
      pump();
      if (isCallable(request.callback)) request.callback(result);
    }

    function fail(request, code) {
      // A failed final chunk may still have committed (lost acknowledgement).
      if (active === request && request.op === "write" && code !== "conflict" && code.indexOf("page:") !== 0 &&
          request.part + 1 === request.total) {
        unacked = unacked.filter(function (commit) { return commit.record !== request.record; });
        unacked.push(request.commit);
      }
      settle(request, { ok: false, error: code });
    }

    function exchangeMessage(request) {
      request.messageId = prefix + String(++serial);
      if (request.op === "latest") return { "i": request.messageId, "o": "lv", "a": request.app };
      var message = {
        "i": request.messageId,
        "r": request.id,
        "p": request.part,
      };
      if (request.op === "read") {
        message["o"] = "r";
        message["k"] = request.key;
      } else {
        message["o"] = "w";
        message["k"] = KEY_CURRENT;
        message["n"] = request.total;
        message["v"] = request.record.slice(
          request.part * CHUNK_CHARS, (request.part + 1) * CHUNK_CHARS,
        );
        message["e"] = trustedSum;
        message["m"] = request.match;
      }
      return message;
    }

    function transmit(request) {
      log(request.op + " part " + request.part);
      exchangeTimer = clearTimer(exchangeTimer);
      exchangeTimer = schedule(EXCHANGE_TIMEOUT_SEC, function () {
        exchangeTimer = null;
        log("no reply to " + request.op + " part " + request.part);
        fail(request, "timeout");
      });
      if (!send(exchangeMessage(request))) fail(request, "send_failed");
    }

    function advance(request) {
      request.part += 1;
      transmit(request);
    }

    function pump() {
      if (active || !ready || !queue.length) return;
      active = queue.shift();
      // An older page cannot answer "lv": report it without sending anything.
      if (active.op === "latest" && !latestSupported) return settle(active, { ok: false, error: "unsupported" });
      // Fixed for every chunk of this write; a successful write updates it before the next one.
      if (active.op === "write") active.match = currentMatch;
      transmit(active);
    }

    function enqueue(request) {
      if (unavailable) {
        if (isCallable(request.callback)) request.callback({ ok: false, error: "unavailable" });
        return;
      }
      request.id = prefix + String(++serial);
      request.part = 0;
      queue.push(request);
      pump();
    }

    // Replaces a queued write with a newer one instead of growing a backlog.
    function dropQueuedWrites() {
      queue = queue.filter(function (request) {
        if (request.op !== "write") return true;
        if (isCallable(request.callback)) request.callback({ ok: false, error: "superseded" });
        return false;
      });
    }

    // -- Replies --

    function onRead(request, message) {
      if (message.p !== request.part) return;
      if (message.x === 0) {
        if (request.part !== 0) return fail(request, "changed");
        return settle(request, { ok: true, record: null });
      }
      if (
        message.x !== 1 ||
        typeof message.v !== "string" ||
        message.v.length > CHUNK_CHARS ||
        !Number.isInteger(message.n) ||
        message.n < 1 ||
        message.n > MAX_CHUNKS ||
        (request.total && message.n !== request.total)
      )
        return fail(request, "malformed");
      request.total = message.n;
      request.chunks.push(message.v);
      if (request.part + 1 < request.total) return advance(request);
      settle(request, { ok: true, record: request.chunks.join("") });
    }

    function onWrite(request, message) {
      if (message.p !== request.part) return;
      if (message.n !== request.total) return fail(request, "malformed");
      var last = request.part + 1 === request.total;
      if (message.d === 1) {
        if (!last) return fail(request, "malformed");
        trustedSum = request.record.split(".")[1];
        currentMatch = deps.codec.checksum(request.record);
        unacked = [];
        return settle(request, { ok: true });
      }
      if (last) return fail(request, "malformed");
      advance(request);
    }

    function downloadLinks(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      var links = null;
      ["normal", "qollock", "showrank"].forEach(function (build) {
        var url = Object.prototype.hasOwnProperty.call(value, build) ? value[build] : null;
        if (isDownloadUrl(url)) (links = links || {})[build] = url;
      });
      return links;
    }

    function onLatest(request, message) {
      var version = message.l === null || (typeof message.l === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(message.l)) ? message.l : undefined;
      if (version === undefined || (message.s !== "pending" && message.s !== "done")) return fail(request, "malformed");
      settle(request, { ok: true, version: version, pending: message.s === "pending", downloads: downloadLinks(message.d) });
    }

    function onReply(message) {
      var request = active;
      if (!request || message.i !== request.messageId) return;
      if (message.ok !== true) {
        var error = String(message.e || "error");
        if (request.op === "write" && error.indexOf("conflict") >= 0) {
          // The current record changed since load: block saves until it is read and classified again.
          loaded = false;
          return fail(request, "conflict");
        }
        return fail(request, "page:" + error.slice(0, 120));
      }
      if (request.op === "read" && message.o === "r") onRead(request, message);
      else if (request.op === "write" && message.o === "w") onWrite(request, message);
      else if (request.op === "latest" && message.o === "lv") onLatest(request, message);
    }

    // -- Page lifecycle --

    function onReady(message) {
      if (ready || unavailable || message.i !== helloId) return;
      if (!isStoragePage(message.h)) {
        log("ignored hello from untrusted page " + String(message.h).slice(0, 80));
        return;
      }
      // "vkeys" (versioned keys) and "cas" (compare-at-commit) are both required: an old cached page
      // without cas would replace a record written meanwhile, so v3 fails closed against it.
      if (message.v !== PAGE_VERSION || message.ok !== true || !Array.isArray(message.c) ||
          message.c.indexOf("vkeys") === -1 || message.c.indexOf("cas") === -1) {
        markUnavailable("protocol_version (hosted page missing or incompatible)");
        return;
      }
      ready = true;
      latestSupported = message.c.indexOf("latest") !== -1;
      readyTimer = clearTimer(readyTimer);
      renavigateTimer = clearTimer(renavigateTimer);
      log("bridge ready at " + PAGE_URL);
      pump();
    }

    function navigate() {
      if (ready || unavailable) return;
      helloId = prefix + String(++serial);
      if (!send({ "o": "hello", "i": helloId })) {
        markUnavailable("navigate");
        return;
      }
      if (!urlSeen) renavigateTimer = schedule(RENAVIGATE_SEC, renavigate);
    }

    function renavigate() {
      renavigateTimer = null;
      if (ready || unavailable || urlSeen) return;
      log("no page event yet; asking HTTPS page again");
      navigate();
    }

    function onUrl(panelOrUrl, eventUrl) {
      var url = String(arguments.length > 1 ? eventUrl : panelOrUrl || "");
      if (unavailable && !lateLogged) {
        lateLogged = true;
        log("late page event after giving up: " + url.slice(0, 80));
      }
      if (ready || unavailable) return;
      if (urlEventsLogged < 6) {
        urlEventsLogged += 1;
        log("page event " + (url.slice(0, 80) || "(empty)"));
      }
      // Only our HTTPS page proves the browser accepted a navigation.
      // A surface-created blank event must not cancel lost-navigation retry.
      if (isStoragePage(url)) {
        urlSeen = true;
        renavigateTimer = clearTimer(renavigateTimer);
      }
    }

    function onTitle(panelOrTitle, eventTitle) {
      var title = arguments.length > 1 ? eventTitle : panelOrTitle;
      if (typeof title !== "string" || !title) return;
      if (title.indexOf(TITLE_PREFIX) !== 0) return;
      var message = null;
      if (title.length <= TITLE_MAX_CHARS) {
        try {
          message = JSON.parse(title.slice(TITLE_PREFIX.length));
        } catch {}
      }
      if (!message || typeof message !== "object") {
        log("ignored unreadable reply title (" + title.length + " chars)");
        return;
      }
      if (message.o === "ready") onReady(message);
      else onReply(message);
    }

    function markUnavailable(code) {
      if (unavailable) return;
      unavailable = true;
      ready = false;
      clearAllTimers();
      if (events && events.title === onTitle) { events.title = null; events.url = null; }
      log("bridge unavailable: " + code);
      var pending = active ? [active].concat(queue) : queue;
      active = null;
      queue = [];
      for (var index = 0; index < pending.length; index++) {
        if (isCallable(pending[index].callback))
          pending[index].callback({ ok: false, error: "unavailable" });
      }
    }

    function start() {
      if (started) return !unavailable;
      started = true;
      if (!isValid(panel) || !isCallable(panel.SetURL)) {
        markUnavailable("panel");
        return false;
      }
      try {
        events = panel.HPColorsV3StorageEvents;
        if (!events) {
          events = {title:null,url:null};
          $.RegisterEventHandler("HTMLTitle", panel, function () { if (events.title) events.title.apply(null,arguments); });
          $.RegisterEventHandler("HTMLURLChanged", panel, function () { if (events.url) events.url.apply(null,arguments); });
          panel.HPColorsV3StorageEvents = events;
        }
        events.title = onTitle; events.url = onUrl;
      } catch {
        markUnavailable("register");
        return false;
      }
      readyTimer = schedule(READY_TIMEOUT_SEC, function () {
        readyTimer = null;
        if (!ready) markUnavailable("ready_timeout (HTTPS page offline or failed to load)");
      });
      navigate();
      return !unavailable;
    }

    // -- Public operations --

    // A read that times out is asked once more under a fresh request id (a
    // late reply to the first id stays ignored). Without it one slow reply at
    // game start would block saving for the whole process.
    function readKey(key, callback, retried) {
      enqueue({
        op: "read",
        key: key,
        chunks: [],
        total: 0,
        callback: function (result) {
          if (!result.ok && result.error === "timeout" && !retried)
            return readKey(key, callback, true);
          callback(result);
        },
      });
    }

    function loadLegacy(callback) {
      function finish(result) {
        loaded = result.kind === "valid" || result.kind === "newer" || result.kind === "absent";
        unreadable = result.kind === "corrupt"; newerSave = result.kind === "newer";
        callback(result);
      }
      // The v2 keys, envelope and current-then-backup order live in from_v2; storage passes readKey only.
      deps.fromV2.loadLegacy(readKey, function (result) { finish(fitLegacy(result)); });
    }
    // Reads current, then previous only when current is corrupt or absent. A
    // newer-schema current record stops here: falling back would let this
    // build overwrite data it cannot read.
    function load(callback) {
      var finish = callback;
      callback = function (result) {
        result.match = currentMatch;
        if (["valid","newer","absent","corrupt"].indexOf(result.kind) >= 0) unacked = [];
        finish(result);
      };
      loaded = false; unreadable = false;
      readKey(KEY_CURRENT, function (current) {
        if (!current.ok) return callback({ kind: "error", error: current.error });
        var currentRecord = deps.codec.classifyRecord(current.record);
        currentMatch = current.record === null ? "none" : deps.codec.checksum(current.record);
        var commit = unacked.filter(function (candidate) { return candidate.record === current.record; }).pop();
        var own = !!commit && currentRecord.kind === "valid";
        if (own) currentRecord.ownToken = commit.token;
        // Our own unacknowledged commit keeps the earlier trust: the page already rotated
        // that record into the backup, and replaying must not rotate a second time.
        if (own) currentRecord.own = true;
        else trustedSum = currentRecord.kind === "valid" && !currentRecord.canonicalized ? currentRecord.sum : "";
        if (currentRecord.kind === "valid" || currentRecord.kind === "newer") {
          loaded = true;
          newerSave = currentRecord.kind === "newer";
          currentRecord.source = "current";
          return callback(currentRecord);
        }
        readKey(KEY_PREVIOUS, function (previous) {
          if (!previous.ok) return callback({ kind: "error", error: previous.error });
          var previousRecord = deps.codec.classifyRecord(previous.record);
          if (previousRecord.kind === "valid" || previousRecord.kind === "newer") {
            loaded = true; newerSave = previousRecord.kind === "newer";
            previousRecord.source = "previous";
            return callback(previousRecord);
          }
          if (currentRecord.kind === "absent" && previousRecord.kind === "absent") return loadLegacy(callback);
          loaded = false; unreadable = true;
          callback({ kind: "corrupt" });
        });
      });
    }

    // record: the bundle's encoding when the caller already made it (identical output, no second encode).
    function save(bundle, callback, token, encoded) {
      if (!loaded || newerSave) {
        if (isCallable(callback)) callback({ ok: false, error: newerSave ? "newer_version" : "not_loaded" });
        return;
      }
      var record = encoded;
      if (!record) {
        try { record = deps.codec.encodeRecord(bundle); }
        catch (error) { if (isCallable(callback)) callback({ ok: false, error: "invalid", message: deps.codec.errorMessage(error) }); return; }
      }
      var total = Math.max(1, Math.ceil(record.length / CHUNK_CHARS));
      if (total > MAX_CHUNKS) {
        if (isCallable(callback)) callback({ ok: false, error: "too_large", message: deps.codec.SAVE_TOO_LARGE });
        return;
      }
      dropQueuedWrites();
      enqueue({ op: "write", record: record, commit: { record: record, token: token }, total: total, callback: callback });
    }

    return Object.freeze({
      start: start,
      load: load,
      save: save,
      dispose: function () { markUnavailable("disposed"); },
      snapshot: snapshot,
      recreate: function () { return create(Object.assign({}, opts, { state: snapshot() })); },
      // Newest released version listed in the hosted latest.json for app, through the request queue.
      latest: function (app, callback) { enqueue({ op: "latest", app: app, callback: callback }); },
      allowReset: function (confirmed) {
        if (confirmed !== true || !unreadable || newerSave || unavailable) return false;
        loaded = true; unreadable = false; trustedSum = "";
        return true;
      },
    });
  }

  // ==== Section 2: persistence (draft, merge, conflicts) and the HPColorsV3Store menu facade ====
  // Reads deps (codec, settings, sharing) and drives the bridge through load/save only.
  // A converted v2 bundle must fit one v3 save: the converter never encodes, so it is fitted here.
  // The encoded record of a bundle, thrown as SAVE_TOO_LARGE when it is over one save. Looks up the codec at call time.
  function encodeWithinCap(bundle) {
    var record = deps.codec.encodeRecord(bundle);
    if (record.length > deps.codec.RECORD.maxChars) throw new Error(deps.codec.SAVE_TOO_LARGE);
    return record;
  }
  function fitLegacy(result) {
    if (result.kind !== "valid") return result;
    try {
      encodeWithinCap(result.bundle);
      return result;
    } catch (error) {
      return { kind: "conversion_error", message: "V2 save could not be converted: " + deps.codec.errorMessage(error), source: result.source };
    }
  }
  // JSON-equivalent copy and compare without the text round trip: the result is what JSON.parse(JSON.stringify(x))
  // gives (undefined/function/symbol keys dropped, in arrays null; non-finite numbers null; -0 as 0; an own
  // "__proto__" key stays an own key), and sameJson(a, b) is true exactly when JSON.stringify(a) === JSON.stringify(b).
  // The prototypes JSON.parse hands out (they differ from this script's own only when JSON is another realm's).
  var OBJECT_PROTO = Object.getPrototypeOf(JSON.parse("{}")), ARRAY_PROTO = Object.getPrototypeOf(JSON.parse("[]"));
  var LITERAL_OBJECT = Object.getPrototypeOf({}), LITERAL_ARRAY = Object.getPrototypeOf([]);
  function jsonSkipped(item) { var kind = typeof item; return kind === "undefined" || kind === "function" || kind === "symbol"; }
  function copyJson(value) {
    if (value === null || typeof value !== "object") return typeof value === "number" ? (isFinite(value) ? value || 0 : null) : value;
    var out, item, key, i;
    if (Array.isArray(value)) {
      out = [];
      if (ARRAY_PROTO !== LITERAL_ARRAY) Object.setPrototypeOf(out, ARRAY_PROTO);
      for (i = 0; i < value.length; i++) out[i] = jsonSkipped(value[i]) ? null : copyJson(value[i]);
      return out;
    }
    out = OBJECT_PROTO === LITERAL_OBJECT ? {} : Object.create(OBJECT_PROTO);
    var keys = Object.keys(value);
    for (i = 0; i < keys.length; i++) {
      key = keys[i]; item = value[key];
      if (jsonSkipped(item)) continue;
      if (key === "__proto__") Object.defineProperty(out, key, { value: copyJson(item), writable: true, enumerable: true, configurable: true });
      else out[key] = copyJson(item);
    }
    return out;
  }
  function sameJson(a, b) {
    if (a === b) return true;
    var aObject = a !== null && typeof a === "object", bObject = b !== null && typeof b === "object";
    if (!aObject || !bObject) {
      if (aObject || bObject) return false;
      return (typeof a === "number" && !isFinite(a) ? null : a) === (typeof b === "number" && !isFinite(b) ? null : b);
    }
    var aArray = Array.isArray(a);
    if (aArray !== Array.isArray(b)) return false;
    var i, j, aKeys, bKeys;
    if (aArray) {
      if (a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) if (!sameJson(jsonSkipped(a[i]) ? null : a[i], jsonSkipped(b[i]) ? null : b[i])) return false;
      return true;
    }
    aKeys = Object.keys(a); bKeys = Object.keys(b); j = 0;
    for (i = 0; i < aKeys.length; i++) {
      if (jsonSkipped(a[aKeys[i]])) continue;
      while (j < bKeys.length && jsonSkipped(b[bKeys[j]])) j++;
      if (j >= bKeys.length || bKeys[j] !== aKeys[i] || !sameJson(a[aKeys[i]], b[bKeys[j]])) return false;
      j++;
    }
    while (j < bKeys.length && jsonSkipped(b[bKeys[j]])) j++;
    return j === bKeys.length;
  }
  // The deep copies of bundles and sessions: a saved bundle is plain JSON data, so they no longer round-trip
  // through text (a bundle with 30 presets is 160 K characters). A value JSON cannot hold at top level (undefined,
  // a function) still takes the text path, which throws as before.
  function clone(value) {
    if (jsonSkipped(value)) return JSON.parse(JSON.stringify(value));
    // Data nested deeper than the recursion allows: the text round trip decides, exactly as before this copy existed.
    try { return copyJson(value); } catch (error) { if (error instanceof RangeError) return JSON.parse(JSON.stringify(value)); throw error; }
  }
  function persistence(options) {
    var opts = options || {}, session = opts.session || {};
    var bridge = opts.bridge || create({ panel: opts.panel, state: session.bridge });
    var started = false, stopped = false, loading = false, gate = false, readonly = false, corrupt = false;
    var pending = session.pending ? clone(session.pending) : null;
    var touched = clone(session.touched || {});
    var baseline = clone(session.baseline || { settings: deps.settings.defaults, presets: [] });
    var dirtyPresets = Object.assign(Object.create(null), session.dirtyPresets || {});
    var dirtyMetadata = Object.assign(Object.create(null), session.dirtyMetadata || {});
    var orderTouched = session.orderTouched || 0;
    var hydrated = session.hydrated === true;
    var timer = null, inFlight = false, serial = session.serial || 0, retries = 0, retryAt = 0;
    var migrationNotice = session.migrationNotice || "";
    // conflicted: the page refused a commit because the current record changed since load.
    // resetPending: pending is a confirmed reset of unreadable data, valid only against those bytes.
    var conflicted = session.conflicted === true, conflicts = session.conflicts || 0, resetPending = session.resetPending === true;
    var baseMatch = session.baseMatch || "", resetMatch = session.resetMatch || "";
    function status(text, tone) {
      if (stopped) return;
      // HPV3_DEBUG $.Msg("[HPV3] save " + text);
      if (isCallable(opts.onStatus)) opts.onStatus(text, tone || "busy");
    }
    function resetAvailable(available) {
      if (!stopped && isCallable(opts.onResetAvailable)) opts.onResetAvailable(available);
    }
    function cancel() {
      if (timer !== null) { try { $.CancelScheduled(timer); } catch (error) {} timer = null; }
    }
    function schedule(seconds) {
      cancel();
      timer = $.Schedule(seconds, function () { timer = null; flush(); });
    }
    function retryUnavailable() {
      if (!stopped && pending && !gate && !loading && !readonly && !corrupt) beginLoad(true);
    }
    function unavailable() {
      gate = false; retryAt = Date.now() + UNAVAILABLE_RETRY_MS;
      status("UNAVAILABLE", "error");
      if (pending) { cancel(); timer = $.Schedule(UNAVAILABLE_POLL_SEC, function () { timer = null; retryUnavailable(); }); }
    }
    function clearBundleEdits(token) {
      [dirtyPresets, dirtyMetadata].forEach(function (edits) {
        Object.keys(edits).forEach(function (key) { if (edits[key] <= token) delete edits[key]; });
      });
      if (orderTouched <= token) orderTouched = 0;
    }
    function acknowledge(bundle, token, match) {
      baseline = clone(bundle); baseMatch = match;
      clearBundleEdits(token);
      Object.keys(touched).forEach(function (key) { if (touched[key] <= token) delete touched[key]; });
      retries = 0; conflicts = 0; resetPending = false; resetMatch = "";
    }
    function flush() {
      if (stopped || !gate || readonly || inFlight || !pending) return;
      var token = serial, bundle = clone(pending), record = pendingFor === pending ? pendingRecord : "";
      inFlight = true;
      status("SAVING");
      bridge.save(bundle, function (result) {
        inFlight = false;
        if (stopped) return;
        if (result.error === "conflict") {
          // Never overwrite the changed record: read and classify it again, then merge or stop.
          conflicts += 1;
          if (conflicts > 3) { unavailable(); return; }
          conflicted = true; status("Save changed elsewhere; reloading");
          beginLoad(false);
          return;
        }
        if (result.ok) {
          acknowledge(bundle, token, bridge.snapshot().currentMatch);
          if (token !== serial) { schedule(0.25); return; }
          pending = null;
          status(migrationNotice || "Saved", "ok"); migrationNotice = ""; return;
        }
        if (token !== serial) { retries = 0; schedule(0.25); return; }
        if (result.error === "too_large" || result.error === "invalid") { status(result.message, "error"); return; }
        if (retries < 3) {
          retries += 1;
          status("RETRYING");
          schedule(Math.pow(2, retries));
        } else unavailable();
      }, token, record);
    }
    // The encoded record of a bundle that fits one save, or "" (after reporting why not). The encoding is kept for
    // the pending draft it validated (pendingFor) so the flush does not encode it again.
    var pendingRecord = "", pendingFor = null;
    function validBundle(bundle) {
      try {
        return encodeWithinCap(bundle);
      } catch (error) { status(deps.codec.errorMessage(error), "error"); return ""; }
    }
    // validated: true when the caller already checked the size, or that check's encoded record.
    function change(bundle, mode, validated) {
      if (stopped) return false;
      if (readonly) { status("Save from a newer version", "error"); return false; }
      if (!bundle || !deps.settings.validate(bundle.settings) || !Array.isArray(bundle.presets) || bundle.presets.length > deps.codec.RECORD.maxPresets) {
        status("Some settings cannot be used by this build.", "error"); return false;
      }
      var record = typeof validated === "string" ? validated : "";
      if (mode === "bundle" && !validated && !(record = validBundle(bundle))) return false;
      if (mode === "settings" && !hydrated) migrationNotice = "Saved; settings import replaced all saved settings";
      var previousBundle = pending || baseline, previous = previousBundle.settings;
      var oldPresets = byId(previousBundle.presets), editedPresets = byId(bundle.presets);
      keyUnion(oldPresets, editedPresets).forEach(function (id) {
        if (!same(oldPresets[id], editedPresets[id])) dirtyPresets[id] = serial + 1;
      });
      keyUnion(previousBundle, bundle).forEach(function (key) {
        if (key !== "settings" && key !== "presets" && !same(previousBundle[key], bundle[key])) dirtyMetadata[key] = serial + 1;
      });
      if (!same(order(previousBundle.presets, editedPresets), order(bundle.presets, oldPresets))) orderTouched = serial + 1;
      var valuesOf = deps.codec.valuesOf;
      deps.settings.slots.forEach(function (slot) {
        var edited = valuesOf(bundle.settings, slot);
        var old = valuesOf(previous, slot);
        // Before hydration, a settings import explicitly supplies every setting, including defaults.
        if (edited[slot.setting] !== old[slot.setting] || (mode === "settings" && !hydrated))
          touched[slot.slot] = serial + 1;
      });
      pending = clone(bundle); pendingRecord = record; pendingFor = pending; serial += 1; retries = 0;
      if (gate) { status("SAVING"); schedule(0.5); }
      else if (started && !loading && !corrupt) {
        cancel();
        timer = $.Schedule(Math.max(0, retryAt - Date.now()) / 1000, function () {
          timer = null;
          if (!stopped && pending && !gate && !loading && !readonly && !corrupt) beginLoad(true);
        });
      }
      return true;
    }
    function same(a, b) {
      try { return sameJson(a, b); } catch (error) { if (error instanceof RangeError) return JSON.stringify(a) === JSON.stringify(b); throw error; }
    }
    // Old keys in order, then new keys the old map lacks (own keys, so imported ids like "__proto__" count):
    // a plain concat compared every kept preset twice, four serializations each per commit.
    function keyUnion(before, after) {
      return Object.keys(before).concat(Object.keys(after).filter(function (key) { return !Object.prototype.hasOwnProperty.call(before, key); }));
    }
    function byId(presets) {
      var result = Object.create(null);
      presets.forEach(function (preset) { result[preset.id] = preset; });
      return result;
    }
    function order(presets, present) {
      return presets.map(function (preset) { return preset.id; }).filter(function (id) { return present[id]; });
    }
    function mergeDraft(restored) {
      var before = byId(baseline.presets), local = byId(pending.presets), remote = byId(restored.presets), overlaps = [];
      Object.keys(dirtyPresets).forEach(function (id) {
        if (!same(remote[id], before[id])) overlaps.push("preset " + id);
      });
      Object.keys(dirtyMetadata).forEach(function (key) {
        if (!same(restored[key], baseline[key])) overlaps.push("metadata " + key);
      });
      if (orderTouched && !same(order(baseline.presets, remote), order(restored.presets, before))) overlaps.push("preset order");
      if (overlaps.length) {
        status("CONFLICT: " + overlaps.join(", ") + " changed elsewhere; local draft not saved; export your draft with Bundle COPY; recover via REPLACE ALL (confirmation required)", "error");
        return null;
      }
      var merged = clone(restored);
      var valuesOf = deps.codec.valuesOf;
      deps.settings.slots.forEach(function (slot) {
        var edited = valuesOf(pending.settings, slot);
        var target = valuesOf(merged.settings, slot);
        if (touched[slot.slot]) target[slot.setting] = edited[slot.setting];
      });
      Object.keys(dirtyPresets).forEach(function (id) {
        if (!local[id]) merged.presets = merged.presets.filter(function (p) { return p.id !== id; });
        else if (remote[id]) merged.presets = merged.presets.map(function (p) { return p.id === id ? clone(local[id]) : p; });
        else merged.presets.push(clone(local[id]));
      });
      if (orderTouched) {
        var localOrder = pending.presets.map(function (p) { return p.id; });
        merged.presets.sort(function (a, b) {
          var aIndex = localOrder.indexOf(a.id), bIndex = localOrder.indexOf(b.id);
          return (aIndex < 0 ? localOrder.length : aIndex) - (bIndex < 0 ? localOrder.length : bIndex);
        });
      }
      Object.keys(dirtyMetadata).forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(pending, key)) merged[key] = clone(pending[key]);
        else delete merged[key];
      });
      return merged;
    }
    function applyLoaded(bundle, result) {
      hydrated = true;
      if (isCallable(opts.onLoad)) opts.onLoad(clone(bundle), result);
    }
    function beginLoad(renew, resetBundle) {
      if (stopped || loading) return false;
      cancel();
      if (renew) {
        var previousBridge = bridge;
        previousBridge.dispose();
        bridge = previousBridge.recreate();
      }
      loading = true; gate = false; resetAvailable(false);
      status("LOADING");
      bridge.start();
      bridge.load(function (result) {
        if (stopped) return;
        loading = false;
        // After a refused commit, a record that is not our own unacknowledged write was saved
        // elsewhere: only this session's touched slots may be reapplied on top of it.
        var foreign = !result.own && (conflicted || (baseMatch && result.match !== baseMatch));
        conflicted = false;
        if (result.kind === "corrupt") {
          corrupt = true;
          if (resetPending && result.match === resetMatch) resetBundle = pending;
          else if (resetPending) { resetPending = false; resetMatch = ""; }
          if (!resetBundle || !bridge.allowReset(true)) {
            resetAvailable(true);
            status("UNAVAILABLE: saved data is unreadable; confirm reset to save", "error");
            return;
          }
          // A fresh read at confirmation found no recoverable/newer data.
          corrupt = false; gate = true; readonly = false;
          pending = clone(resetBundle); resetPending = true; resetMatch = result.match;
          baseMatch = result.match; clearBundleEdits(Infinity);
          applyLoaded(pending, result); status("SAVING"); schedule(0.5); return;
        }
        if (result.kind !== "valid" && result.kind !== "newer" && result.kind !== "absent") {
          corrupt = false; unavailable();
          if (result.kind === "conversion_error") status("UNAVAILABLE: " + result.message, "error");
          return;
        }
        corrupt = false; readonly = result.kind === "newer"; gate = !readonly;
        var restored = result.bundle || { settings: clone(deps.settings.defaults), presets: [] };
        var observed = clone(restored);
        if ((resetBundle || resetPending) && result.kind === "valid" && !result.own) {
          // Another writer repaired the save between offering and confirming
          // reset (or before the reset committed). Do not replace newly
          // readable data with the stale reset.
          pending = null; touched = {}; resetPending = false; resetMatch = "";
          baseline = observed; baseMatch = result.match; clearBundleEdits(Infinity); applyLoaded(restored, result);
          status("Saved data changed; reset cancelled", "error"); return;
        }
        if (resetPending && result.kind === "absent" && resetMatch && result.match !== resetMatch) {
          pending = null; touched = {}; resetPending = false;
          baseline = observed; baseMatch = result.match; clearBundleEdits(Infinity); applyLoaded(restored, result);
          status("Saved data changed; reset cancelled", "error"); return;
        }
        if (resetBundle && result.kind === "absent") {
          pending = clone(resetBundle); resetPending = true; resetMatch = result.match;
        }
        if (readonly && pending) {
          // Unknown records are never merged or acknowledged over an outstanding local draft.
          // Keep its baseline and edit tokens intact for COPY and same-context recovery.
          status("Save from a newer version", "error"); return;
        }
        if (result.own) acknowledge(observed, result.ownToken, result.match);
        if (pending && !readonly) {
          restored = resetPending ? clone(pending) : mergeDraft(restored);
          if (!restored) { gate = false; return; }
          var restoredRecord = validBundle(restored);
          if (!restoredRecord) {
            gate = false; status("UNAVAILABLE: edits conflict with saved settings or preset limits; export your draft", "error"); return;
          }
          pending = clone(restored); pendingRecord = restoredRecord; pendingFor = pending;
          if (foreign && result.kind === "valid" && !migrationNotice) migrationNotice = "Saved; merged a change saved elsewhere";
        }
        if (result.migrated && !readonly) { pending = clone(restored); serial += 1; }
        baseline = observed; baseMatch = result.match;
        applyLoaded(restored, result);
        if (readonly) { pending = null; touched = {}; clearBundleEdits(Infinity); status("Save from a newer version", "error"); }
        else if (pending) { status("SAVING"); schedule(0.5); }
        else status("Saved", "ok");
      });
      return true;
    }
    return Object.freeze({
      start: function () { if (!started && !stopped) { started = true; beginLoad(false); } },
      change: change,
      isHydrated: function () { return hydrated; },
      latestRelease: function (callback) {
        if (stopped) return callback({ ok: false, error: "unavailable" });
        bridge.latest("hpv3", function (result) { if (!stopped) callback(result); });
      },
      presetEditError: function () {
        if (readonly) return "Save from a newer version; presets cannot be changed by this build.";
        if (corrupt) return "Confirm reset of the unreadable save before editing presets.";
        return !hydrated || loading || stopped ? "Wait for saved settings to finish loading before editing presets." : "";
      },
      reset: function (confirmed, bundle) {
        if (confirmed !== true || !corrupt || readonly || loading || !validBundle(bundle)) return false;
        return beginLoad(true, clone(bundle));
      },
      snapshot: function () {
        return clone({ pending: pending, serial: serial, touched: touched, baseline: baseline,
          dirtyPresets: dirtyPresets, dirtyMetadata: dirtyMetadata, orderTouched: orderTouched,
          hydrated: hydrated, resetPending: resetPending, resetMatch: resetMatch, baseMatch: baseMatch, migrationNotice: migrationNotice,
          conflicted: conflicted, conflicts: conflicts, bridge: bridge.snapshot() });
      },
      dispose: function () {
        stopped = true; cancel();
        bridge.dispose();
      },
    });
  }

  // Download links are opened in the external browser, so only the HP Colors mod's own GameBanana download
  // page passes (save-security audit 2026-11-02: a hacked manifest must not send players to another mod).
  // The menu checks the link it is about to open through the same test (store.isDownloadUrl).
  function isDownloadUrl(url) {
    return typeof url === "string" && /^https:\/\/gamebanana\.com\/mods\/download\/603113(#FileInfo_\d{1,12})?$/.test(url);
  }

  // Menu/preset facade. Settings-only operations never discard bundle metadata.
  // The menu API attached by hp_colors_v3_menu.js always carries every member this store calls; menuApi is null
  // before attach and after retire, and the callers that can run then check it.
  var menuApi = null, menuRoot = null, controller = null, menuBundle = null;
  var importMode = "";
  // A session handed over by a retired store incarnation, kept until a menu attaches.
  var inheritedSession = null, retiredStore = false;
  function commitConfig(config) {
    menuBundle = currentBundle(config.settings);
    var hasRules = Object.keys(config.rules || {}).length > 0;
    if (hasRules) menuBundle.rules = clone(config.rules); else delete menuBundle.rules;
    // The applied custom preset follows every edit (user, 2026-11-02: edits were not kept in it, so applying
    // it again, or the hero default routing back to it, restored the values it was created with). The baked
    // Default never changes.
    var source = menuBundle.sourcePresetId;
    if (source && source !== deps.codec.RECORD.reservedPresetId) (menuBundle.presets || []).forEach(function (preset) {
      if (preset.id !== source) return;
      preset.settings = clone(config.settings);
      if (hasRules) preset.rules = clone(config.rules); else delete preset.rules;
    });
    if (controller) controller.change(menuBundle, importMode);
    importMode = "";
  }
  function currentBundle(settings) {
    var bundle = menuBundle ? clone(menuBundle) : { presets: [] };
    bundle.settings = clone(settings);
    return bundle;
  }
  function refreshPresets() {
    if (menuApi && isValid(menuRoot)) menuApi.refreshPresets();
  }
  function unwrap(result) {
    if (!result.ok) throw new Error(result.message);
    if (menuApi) menuApi.setCodeStatus(result.message || "");
    return result;
  }
  var presetSerial = 0;
  function commitBundle(bundle, apply) {
    if (!controller || !isValid(menuRoot)) throw new Error("Wait for saved settings to finish loading before editing presets.");
    var refusal = controller.presetEditError();
    if (refusal) throw new Error(refusal);
    var record;
    try { record = encodeWithinCap(bundle); }
    catch (error) { throw new Error(deps.codec.errorMessage(error)); }
    if (!controller.change(bundle, "bundle", record)) throw new Error("That preset change could not be saved.");
    menuBundle = clone(bundle);
    if (apply !== false) menuApi.applySettings(bundle.settings, bundle.rules || {});
    refreshPresets();
    return true;
  }
  function attachTo(api) {
    var root = api.getRoot();
    menuApi = api;
    if (root === menuRoot) { refreshPresets(); return; }
    var session = controller ? controller.snapshot() : inheritedSession;
    inheritedSession = null;
    if (controller) controller.dispose();
    menuRoot = root;
    var panel = root.FindChildTraverse("HPColorsV3StorePanel");
    controller = persistence({
      panel: panel,
      session: session,
      onLoad: function (bundle) {
        if (!isValid(root) || root !== menuRoot) return;
        menuBundle = clone(bundle);
        menuApi.hydrateSettings(bundle.settings);
        refreshPresets();
      },
      // The menu may be reincluded onto the same root after this controller started.
      onStatus: function (text, tone) { if (isValid(root) && root === menuRoot) menuApi.setSaveStatus(text, tone); },
      onResetAvailable: function (available) {
        if (isValid(root) && root === menuRoot) menuApi.setSaveResetAvailable(available);
      },
    });
    controller.start();
  }
  // Reinclusion of this script on the same context (audit F1): the previous incarnation stops
  // writing, retrying and answering, and hands over everything a reload must not lose.
  var priorStore = $.HPColorsV3Store, handoff = null;
  if (priorStore && isCallable(priorStore.retire)) {
    try { handoff = priorStore.retire(); } catch (error) { handoff = null; }
  }
  if (handoff) {
    bridgeGeneration = Math.max(bridgeGeneration, Number(handoff.generation) || 0);
    presetSerial = Math.max(presetSerial, Number(handoff.presetSerial) || 0);
    menuBundle = handoff.menuBundle || null;
    importMode = handoff.importMode || "";
    inheritedSession = handoff.session || null;
  }
  $.HPColorsV3Persistence = Object.freeze({ create: persistence });
  $.HPColorsV3Store = Object.freeze({
    attach: function (api) { if (!retiredStore) attachTo(api); },
    retire: function () {
      if (retiredStore) return null;
      retiredStore = true;
      var result = {
        generation: bridgeGeneration, presetSerial: presetSerial,
        menuBundle: menuBundle ? clone(menuBundle) : null, importMode: importMode,
        session: controller ? controller.snapshot() : inheritedSession,
        api: menuApi, root: menuRoot,
      };
      // Disposal cancels the debounce/retry timers and the bridge; late callbacks see a stopped controller.
      if (controller) controller.dispose();
      controller = null; menuApi = null; menuRoot = null; inheritedSession = null;
      return result;
    },
    commit: commitConfig,
    getBundle: function (settings) {
      return currentBundle(settings || (menuApi ? menuApi.getSettings() : deps.settings.defaults));
    },
    // Hero routing reads only the route every settled second: no copy of the whole preset library.
    getRoute: function () {
      var bundle = menuBundle || {};
      return { heroPresets: clone(bundle.heroPresets || {}), heroDefault: bundle.heroDefault === undefined ? null : bundle.heroDefault };
    },
    isHydrated: function () { return !!controller && controller.isHydrated(); },
    isDownloadUrl: isDownloadUrl,
    // Advisory update check: { ok, version ("X.Y.Z" or null), pending }. Never touches settings or saves.
    latestRelease: function (callback) {
      if (!controller) return callback({ ok: false, error: "unavailable" });
      controller.latestRelease(callback);
    },
    canEditPresets: function () { return !!controller && !controller.presetEditError(); },
    replaceBundle: function (bundle) { return commitBundle(bundle); },
    applyPreset: function (preset, automatic, mappedRoute) {
      var bundle = currentBundle(preset.settings);
      bundle.sourcePresetId = preset.id || deps.codec.RECORD.reservedPresetId;
      bundle.sourceWasMapped = automatic === true ? mappedRoute === true :
        Object.keys(bundle.heroPresets || {}).some(function (hero) { return bundle.heroPresets[hero] === bundle.sourcePresetId; });
      ["v2pending","rules"].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(preset,key)) bundle[key] = clone(preset[key]); else delete bundle[key];
      });
      commitBundle(bundle, false);
      menuApi.applyPresetSettings(bundle.settings, bundle.sourcePresetId, automatic === true, bundle.sourceWasMapped, bundle.rules || {});
      return true;
    },
    resetUnreadableSave: function (confirmed) {
      return !!controller && isValid(menuRoot) && controller.reset(confirmed, currentBundle(menuApi.getSettings()));
    },
    exportSettingsCode: function (settings) { return unwrap(deps.sharing.exportSettingsCode(settings, menuApi ? menuApi.getRules() : menuBundle && menuBundle.rules)).code; },
    decodeSettingsCode: function (code) {
      return unwrap(deps.sharing.importSettingsCode(code, currentBundle(menuApi ? menuApi.getSettings() : deps.settings.defaults))).settings;
    },
    importSettingsCode: function (code) {
      var result = unwrap(deps.sharing.importSettingsCode(code, currentBundle(menuApi ? menuApi.getSettings() : deps.settings.defaults)));
      if (result.metadata) {
        menuBundle = currentBundle(result.settings);
        Object.keys(result.metadata).forEach(function (key) { menuBundle[key] = clone(result.metadata[key]); });
      }
      importMode = "settings";
      // This store owns the import's one commit: a changed import commits through the menu's edit; an equal
      // one still commits here, so mode "settings" touches every slot (audit 2026-11-02: the menu used to
      // commit a second, identical time after a changed import).
      // Only when the menu already holds exactly this import: a refusing (retired) menu commits nothing.
      var rules = result.rules || {};
      if (menuApi && !menuApi.editSettings(result.settings, rules) &&
          JSON.stringify(menuApi.getSettings()) === JSON.stringify(result.settings) && JSON.stringify(menuApi.getRules()) === JSON.stringify(rules))
        commitConfig({ settings: result.settings, rules: rules });
      return result.settings;
    },
    exportBundleCode: function (settings) { return unwrap(deps.sharing.exportBundleCode(currentBundle(settings))).code; },
    decodeBundleCode: function (code) { return unwrap(deps.sharing.importBundleCode(code)).bundle; },
    importBundleCode: function (code) {
      if (!controller) throw new Error("Wait for saved settings to finish loading before editing presets.");
      var refusal = controller.presetEditError();
      if (refusal) throw new Error(refusal);
      var result = unwrap(deps.sharing.importBundleCode(code)), bundle = currentBundle(menuApi.getSettings());
      if (!result.bundle.presets.length) throw new Error("This bundle has no presets to append. Use REPLACE ALL to restore active settings and metadata; confirmation replaces the saved preset library.");
      var ids = Object.create(null);
      bundle.presets.forEach(function (preset) { ids[preset.id] = true; });
      result.bundle.presets.forEach(function (preset) {
        var item = clone(preset);
        do { item.id = "user-import-" + Date.now().toString(36) + "-" + (++presetSerial); } while (ids[item.id]);
        ids[item.id] = true; bundle.presets.push(item);
      });
      commitBundle(bundle, false);
      if (menuApi) menuApi.setCodeStatus(
        (result.message ? result.message + " " : "") + "Presets imported; active settings and metadata unchanged. Use REPLACE ALL for full bundle recovery.", "ok");
      return bundle.settings;
    },
  });
  $.HPColorsV3StorageFactory = Object.freeze({ create: create });
  // Resume at once on the menu the retired store served: a storage-only reinclusion has no menu
  // boot to attach again, and edits must not fall into a store without a controller meanwhile.
  if (handoff && handoff.api && isValid(handoff.root)) {
    try { attachTo(handoff.api); } catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] store handoff failed: " + error);
    }
  }
})();
