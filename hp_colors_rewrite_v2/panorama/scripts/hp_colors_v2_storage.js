(function () {
  "use strict";

  // Durable storage for HP Colors v2.
  //
  // Panorama has no writable disk API. A hidden CitadelHTMLPanel opens an
  // HTTPS page whose localStorage stays in Steam's CEF profile across game
  // restarts. Requests live only in its URL fragment (never sent to the
  // server); the page replies through HTMLTitle. Fragment changes keep one
  // loaded document alive. The page protocol must match before any reads or
  // writes; an offline or incompatible page leaves saving unavailable.
  //
  // Keys are durable data, not configuration. The hosted page touches only
  // this mod's current and previous keys.
  var PAGE_URL = "https://hantu-raya.github.io/hpv2-store/";
  var PAGE_VERSION = 1;
  var KEY_CURRENT = "hantu.hpcolors.v2/state";
  var KEY_PREVIOUS = "hantu.hpcolors.v2/state.prev";
  var TITLE_PREFIX = "HPV2S1:";
  var RECORD_TAG = "HPV2S1";
  var ENVELOPE_MAGIC = "HPV2STORE";
  // Schema 4 marks bar-relative HP-text offsets. Schemas 1–3 stored absolute
  // CSS pixels and remain readable. Schema 5 came only from the withdrawn
  // centered-HP-text test build; it is read as schema 4 and never written.
  var ENVELOPE_SCHEMA = 4;
  var MAX_READ_SCHEMA = 5;

  // Measured live: 3000-character replies arrive intact, and each title
  // carries at most 4096 characters.
  var CHUNK_CHARS = 3000;
  var MAX_CHUNKS = 64;
  var TITLE_MAX_CHARS = 4096;

  // A navigation sent before Steam creates the browser surface can vanish
  // silently. Re-send hello until a real page event arrives, bounded by the
  // readiness timeout. Lost read replies get one retry; save retry belongs
  // to the editor.
  var READY_TIMEOUT_SEC = 30;
  var RENAVIGATE_SEC = 8;
  var EXCHANGE_TIMEOUT_SEC = 5;

  var BASE64_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function isCallable(value) {
    return typeof value === "function";
  }

  function isValid(panel) {
    try {
      return !!panel && isCallable(panel.IsValid) && panel.IsValid();
    } catch {
      return false;
    }
  }

  // -- Record codec (pure) --
  //
  // A record is `HPV2S1.<fnv1a32 of payload>.<base64url payload>`. Base64url
  // keeps the payload inert inside URL fragments and JSON title replies.

  function utf8Bytes(text) {
    var escaped = encodeURIComponent(text);
    var bytes = [];
    for (var index = 0; index < escaped.length; index++) {
      if (escaped.charAt(index) === "%") {
        bytes.push(parseInt(escaped.slice(index + 1, index + 3), 16));
        index += 2;
      } else {
        bytes.push(escaped.charCodeAt(index));
      }
    }
    return bytes;
  }

  function base64UrlEncode(text) {
    var bytes = utf8Bytes(text);
    var out = [];
    for (var index = 0; index < bytes.length; index += 3) {
      var chunk =
        (bytes[index] << 16) | ((bytes[index + 1] || 0) << 8) | (bytes[index + 2] || 0);
      out.push(BASE64_ALPHABET.charAt((chunk >> 18) & 63));
      out.push(BASE64_ALPHABET.charAt((chunk >> 12) & 63));
      if (index + 1 < bytes.length) out.push(BASE64_ALPHABET.charAt((chunk >> 6) & 63));
      if (index + 2 < bytes.length) out.push(BASE64_ALPHABET.charAt(chunk & 63));
    }
    return out.join("");
  }

  function base64UrlDecode(encoded) {
    if (!/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1)
      throw new Error("invalid base64url");
    var escaped = [];
    var bits = 0;
    var buffer = 0;
    for (var index = 0; index < encoded.length; index++) {
      buffer = ((buffer << 6) | BASE64_ALPHABET.indexOf(encoded.charAt(index))) & 0xffffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        var byte = (buffer >> bits) & 255;
        escaped.push(byte < 16 ? "%0" + byte.toString(16) : "%" + byte.toString(16));
      }
    }
    return decodeURIComponent(escaped.join(""));
  }

  function checksum(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }


  // `body` must be a JSON object text; it is embedded as an object.
  function encodeRecord(body, savedAt) {
    var schema = ENVELOPE_SCHEMA;
    var payload = base64UrlEncode(
      '{"m":"' + ENVELOPE_MAGIC + '","s":' + schema +
        ',"t":' + Number(savedAt || 0) + ',"b":' + body + "}",
    );
    return RECORD_TAG + "." + checksum(payload) + "." + payload;
  }

  // A restorable body is a v1 session object with a values map.
  function parseBody(text) {
    try {
      var data = JSON.parse(text);
      return data && typeof data === "object" && data.version === 1 &&
        data.values && typeof data.values === "object"
        ? text
        : null;
    } catch {
      return null;
    }
  }

  // Classifies before anything trusts the content: absent, corrupt (framing,
  // checksum, encoding, envelope, or body damage), unsupported (a newer
  // schema written by a later build), or valid with the body as JSON text
  // and the record's checksum as `sum`.
  function classifyRecord(record) {
    if (record === null || record === undefined) return { kind: "absent" };
    if (typeof record !== "string") return { kind: "corrupt" };
    var parts = record.split(".");
    if (
      parts.length !== 3 ||
      parts[0] !== RECORD_TAG ||
      !/^[0-9a-f]{8}$/.test(parts[1]) ||
      checksum(parts[2]) !== parts[1]
    )
      return { kind: "corrupt" };
    var envelope = null;
    try {
      envelope = JSON.parse(base64UrlDecode(parts[2]));
    } catch {
      return { kind: "corrupt" };
    }
    if (!envelope || typeof envelope !== "object" || envelope.m !== ENVELOPE_MAGIC)
      return { kind: "corrupt" };
    if (Number.isInteger(envelope.s) && envelope.s > MAX_READ_SCHEMA)
      return { kind: "unsupported", schema: envelope.s };
    var body = null;
    if (envelope.s === 1 && typeof envelope.b === "string") body = parseBody(envelope.b);
    else if (
      (envelope.s === 2 || envelope.s === 3 || envelope.s === 4 || envelope.s === 5) &&
      envelope.b &&
      typeof envelope.b === "object"
    )
      body = parseBody(JSON.stringify(envelope.b));
    if (!body) return { kind: "corrupt" };
    // The envelope is the durable format authority, not an untrusted body marker.
    var session = JSON.parse(body);
    if (envelope.s === 4 || envelope.s === 5) session.offsetVersion = 2;
    else delete session.offsetVersion;
    body = JSON.stringify(session);
    return {
      kind: "valid",
      body: body,
      sum: parts[1],
    };
  }

  // -- Hosted page protocol --
  //
  // Fragment = encodeURIComponent(JSON.stringify(request)). Every exchange
  // has a unique `i`; `r` identifies one logical read/write across chunks.
  // Readiness requires our latest hello id, page version, and exact HTTPS
  // document address (with only its fragment allowed to vary).
  function isStoragePage(href) {
    return typeof href === "string" && href.split("#")[0] === PAGE_URL;
  }

  // -- Bridge --

  function create(options) {
    var opts = options || {};
    var panel = opts.panel;
    var schedule =
      opts.schedule ||
      function (seconds, callback) {
        return $.Schedule(seconds, callback);
      };
    var cancelScheduled =
      opts.cancel ||
      function (handle) {
        try {
          $.CancelScheduled(handle);
        } catch {}
      };
    var now =
      opts.now ||
      function () {
        return Date.now();
      };
    var log =
      opts.log ||
      function (message) {
        $.Msg("[HP Colors Rewrite][store] " + message);
      };

    var started = false;
    var ready = false;
    var unavailable = false;
    var helloId = "";
    var readyTimer = null;
    var exchangeTimer = null;
    var renavigateTimer = null;
    var urlSeen = false;
    var lateLogged = false;
    var urlEventsLogged = 0;
    var serial = 0;
    var active = null;
    var queue = [];
    // Checksum of the current record this bridge fully validated or wrote;
    // only that record may be rotated into the backup key.
    var trustedSum = "";

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
      active = null;
      exchangeTimer = clearTimer(exchangeTimer);
      pump();
      if (isCallable(request.callback)) request.callback(result);
    }

    function fail(request, code) {
      settle(request, { ok: false, error: code });
    }

    function exchangeMessage(request) {
      request.messageId = "h" + String(++serial);
      var message = {
        "i": request.messageId,
        "r": request.id,
        "p": request.part,
      };
      if (request.op === "read") {
        message["o"] = "r";
        message["k"] = request.key;
      } else if (request.op === "write") {
        message["o"] = "w";
        message["n"] = request.total;
        message["v"] = request.record.slice(
          request.part * CHUNK_CHARS, (request.part + 1) * CHUNK_CHARS,
        );
        message["e"] = trustedSum;
      } else message["o"] = "d";
      return message;
    }

    function transmit(request) {
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
      transmit(active);
    }

    function enqueue(request) {
      if (unavailable) {
        if (isCallable(request.callback)) request.callback({ ok: false, error: "unavailable" });
        return;
      }
      request.id = "h" + String(++serial);
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
      var last = request.part + 1 === request.total;
      if (message.d === 1) {
        if (!last) return fail(request, "malformed");
        trustedSum = request.record.split(".")[1];
        return settle(request, { ok: true });
      }
      if (last) return fail(request, "malformed");
      advance(request);
    }

    function onReply(message) {
      var request = active;
      if (!request || message.i !== request.messageId) return;
      if (message.ok !== true)
        return fail(request, "page:" + String(message.e || "error").slice(0, 120));
      if (request.op === "read" && message.o === "r") onRead(request, message);
      else if (request.op === "write" && message.o === "w") onWrite(request, message);
      else if (request.op === "delete" && message.o === "d") settle(request, { ok: true });
    }

    // -- Page lifecycle --

    function onReady(message) {
      if (ready || unavailable || message.i !== helloId) return;
      if (!isStoragePage(message.h)) {
        log("ignored hello from untrusted page " + String(message.h).slice(0, 80));
        return;
      }
      if (message.v !== PAGE_VERSION || message.ok !== true) {
        markUnavailable("protocol_version (hosted page missing or incompatible)");
        return;
      }
      ready = true;
      readyTimer = clearTimer(readyTimer);
      renavigateTimer = clearTimer(renavigateTimer);
      log("bridge ready at " + PAGE_URL);
      pump();
    }

    function navigate() {
      if (ready || unavailable) return;
      helloId = "h" + String(++serial);
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
        $.RegisterEventHandler("HTMLTitle", panel, onTitle);
        $.RegisterEventHandler("HTMLURLChanged", panel, onUrl);
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

    // Reads current, then previous only when current is corrupt or absent. A
    // newer-schema current record stops here: falling back would let this
    // build overwrite data it cannot read.
    function load(callback) {
      readKey(KEY_CURRENT, function (current) {
        if (!current.ok) return callback({ kind: "error", error: current.error });
        var currentRecord = classifyRecord(current.record);
        trustedSum = currentRecord.kind === "valid" ? currentRecord.sum : "";
        if (currentRecord.kind === "valid" || currentRecord.kind === "unsupported") {
          currentRecord.source = "current";
          return callback(currentRecord);
        }
        readKey(KEY_PREVIOUS, function (previous) {
          if (!previous.ok) return callback({ kind: "error", error: previous.error });
          var previousRecord = classifyRecord(previous.record);
          if (previousRecord.kind === "valid") {
            previousRecord.source = "previous";
            previousRecord.recoveredFrom = currentRecord.kind;
            return callback(previousRecord);
          }
          callback({
            kind: currentRecord.kind === "absent" && previousRecord.kind === "absent"
              ? "absent"
              : previousRecord.kind === "unsupported" ? "unsupported" : "corrupt",
          });
        });
      });
    }

    function save(body, callback) {
      var record = encodeRecord(String(body), now());
      var total = Math.max(1, Math.ceil(record.length / CHUNK_CHARS));
      if (total > MAX_CHUNKS) {
        if (isCallable(callback)) callback({ ok: false, error: "too_large" });
        return;
      }
      dropQueuedWrites();
      enqueue({ op: "write", record: record, total: total, callback: callback });
    }

    function forget(callback) {
      dropQueuedWrites();
      enqueue({
        op: "delete",
        callback: function (result) {
          if (result.ok) trustedSum = "";
          if (isCallable(callback)) callback(result);
        },
      });
    }

    return Object.freeze({
      start: start,
      load: load,
      save: save,
      forget: forget,
    });
  }

  $.HPColorsV2StorageFactory = Object.freeze({
    create: create,
    limits: Object.freeze({ chunkChars: CHUNK_CHARS, maxChunks: MAX_CHUNKS }),
    codec: Object.freeze({
      encodeRecord: encodeRecord,
      classifyRecord: classifyRecord,
      checksum: checksum,
    }),
  });
})();
