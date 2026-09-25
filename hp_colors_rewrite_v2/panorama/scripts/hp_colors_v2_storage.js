(function () {
  "use strict";

  // Durable storage for HP Colors v2.
  //
  // Panorama has no writable disk API. A hidden CitadelHTMLPanel is a Steam
  // Chromium view, and a `file://` document there has a real localStorage that
  // Steam keeps in its CEF profile across game restarts. Panorama drives the
  // page with SetURL("javascript:...") and the page answers by setting its
  // title, which arrives here through the HTMLTitle panel event.
  //
  // The `file://` origin is shared with every other Steam page and mod, so every
  // key lives under one namespace owned by this mod. Changing a key orphans
  // saved data: treat these strings as data, not configuration.

  var PAGE_URL = "file://";
  var KEY_NAMESPACE = "hantu.hpcolors.v2/";
  var KEY_CURRENT = KEY_NAMESPACE + "state";
  var KEY_PREVIOUS = KEY_NAMESPACE + "state.prev";
  var TITLE_PREFIX = "HPV2S1:";
  var RECORD_TAG = "HPV2S1";
  var ENVELOPE_MAGIC = "HPV2STORE";
  var ENVELOPE_SCHEMA = 1;

  // A title carries at most 4096 characters. Records are base64url, so a
  // 3000-character slice plus the reply frame stays well below that.
  var CHUNK_CHARS = 3000;
  var MAX_CHUNKS = 64;
  var TITLE_MAX_CHARS = 4096;

  // Each exchange must progress within EXCHANGE_TIMEOUT_SEC; the whole request
  // is also capped so a trickling page cannot hold the queue indefinitely.
  var READY_TIMEOUT_SEC = 4;
  var EXCHANGE_TIMEOUT_SEC = 5;
  var TRANSFER_DEADLINE_SEC = 60;
  var MAX_INJECT_ATTEMPTS = 5;

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

  function utf8Bytes(text) {
    var encoded = encodeURIComponent(text);
    var bytes = [];
    for (var index = 0; index < encoded.length; index++) {
      var char = encoded.charAt(index);
      if (char === "%") {
        bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16));
        index += 2;
      } else {
        bytes.push(char.charCodeAt(0));
      }
    }
    return bytes;
  }

  function utf8Text(bytes) {
    var escaped = "";
    for (var index = 0; index < bytes.length; index++) {
      var hex = bytes[index].toString(16);
      escaped += "%" + (hex.length < 2 ? "0" + hex : hex);
    }
    return decodeURIComponent(escaped);
  }

  function base64UrlEncode(text) {
    var bytes = utf8Bytes(text);
    var out = "";
    for (var index = 0; index < bytes.length; index += 3) {
      var chunk =
        (bytes[index] << 16) |
        ((bytes[index + 1] || 0) << 8) |
        (bytes[index + 2] || 0);
      out += BASE64_ALPHABET.charAt((chunk >> 18) & 63);
      out += BASE64_ALPHABET.charAt((chunk >> 12) & 63);
      if (index + 1 < bytes.length) out += BASE64_ALPHABET.charAt((chunk >> 6) & 63);
      if (index + 2 < bytes.length) out += BASE64_ALPHABET.charAt(chunk & 63);
    }
    return out;
  }

  function base64UrlDecode(encoded) {
    if (!/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1)
      throw new Error("invalid base64url");
    var bytes = [];
    var bits = 0;
    var buffer = 0;
    for (var index = 0; index < encoded.length; index++) {
      buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(encoded.charAt(index));
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 255);
      }
    }
    return utf8Text(bytes);
  }

  function checksum(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  function encodeRecord(body, savedAt) {
    var payload = base64UrlEncode(
      JSON.stringify({
        m: ENVELOPE_MAGIC,
        s: ENVELOPE_SCHEMA,
        t: savedAt,
        b: body,
      }),
    );
    return RECORD_TAG + "." + checksum(payload) + "." + payload;
  }

  // Classifies before anything trusts the content: absent, corrupt (framing,
  // checksum, encoding, or envelope damage), unsupported (a newer schema
  // written by a later build), or valid.
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
    if (envelope.s !== ENVELOPE_SCHEMA) {
      return Number.isInteger(envelope.s) && envelope.s > ENVELOPE_SCHEMA
        ? { kind: "unsupported", schema: envelope.s }
        : { kind: "corrupt" };
    }
    if (typeof envelope.b !== "string" || !envelope.b) return { kind: "corrupt" };
    return {
      kind: "valid",
      body: envelope.b,
      savedAt: Number.isFinite(envelope.t) ? envelope.t : 0,
    };
  }

  // -- Page script --
  //
  // Installed once per document on one namespaced object. The page only stores
  // opaque records and checks their checksum; Panorama owns every decision.
  // Writes stage all chunks, then commit in order: a valid current record is
  // rotated to the previous key, then the new record becomes current. A
  // corrupt current record is never rotated, so a valid backup survives.
  function pageScript() {
    return (
      "(function(w){if(w.__hpv2s&&w.__hpv2s.v===1){w.__hpv2s.hello();return;}" +
      "var s={v:1,q:0,st:{}};" +
      "function send(m){m.q=++s.q;try{w.document.title='" +
      TITLE_PREFIX +
      "'+JSON.stringify(m);}catch(e){}}" +
      "function sum(t){var h=0x811c9dc5;for(var i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return('0000000'+h.toString(16)).slice(-8);}" +
      "function ok(v){if(typeof v!=='string')return false;var p=v.split('.');return p.length===3&&p[0]==='" +
      RECORD_TAG +
      "'&&sum(p[2])===p[1];}" +
      "s.hello=function(){send({i:'ready',o:'ready',ok:true,h:''+w.location.href});};" +
      "s.w=function(id,k,pk,p,n,c){try{if(p===0)s.st[id]='';" +
      "if(typeof s.st[id]!=='string'){send({i:id,o:'w',ok:false,e:'order'});return;}" +
      "s.st[id]+=c;if(p+1<n){send({i:id,o:'w',ok:true,p:p,n:n});return;}" +
      "var v=s.st[id];delete s.st[id];" +
      "if(!ok(v)){send({i:id,o:'w',ok:false,e:'checksum'});return;}" +
      "var L=w.localStorage,cur=L.getItem(k);" +
      "if(cur!==null&&cur!==v&&ok(cur))L.setItem(pk,cur);" +
      "L.setItem(k,v);send({i:id,o:'w',ok:true,p:p,n:n,d:1});" +
      "}catch(e){delete s.st[id];send({i:id,o:'w',ok:false,e:''+e});}};" +
      "s.r=function(id,k,p,z){try{var v=w.localStorage.getItem(k);" +
      "if(v===null){send({i:id,o:'r',ok:true,x:0,p:p});return;}" +
      "var n=Math.max(1,Math.ceil(v.length/z));" +
      "send({i:id,o:'r',ok:true,x:1,p:p,n:n,v:v.slice(p*z,(p+1)*z)});" +
      "}catch(e){send({i:id,o:'r',ok:false,e:''+e});}};" +
      "s.d=function(id,ks){try{for(var i=0;i<ks.length;i++)w.localStorage.removeItem(ks[i]);" +
      "send({i:id,o:'d',ok:true});}catch(e){send({i:id,o:'d',ok:false,e:''+e});}};" +
      "w.__hpv2s=s;s.hello();})(window);void(0);"
    );
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

    var generation = 1;
    var started = false;
    var ready = false;
    var unavailable = false;
    var injectAttempts = 0;
    var readyTimer = null;
    var requestSerial = 0;
    var active = null;
    var queue = [];

    function alive(requestGeneration) {
      return generation > 0 && requestGeneration === generation;
    }

    function clearTimer(handle) {
      if (handle !== null && handle !== undefined) cancelScheduled(handle);
      return null;
    }

    function sendScript(code) {
      if (!isValid(panel) || !isCallable(panel.SetURL)) return false;
      try {
        panel.SetURL("javascript:" + code);
        return true;
      } catch (error) {
        log("SetURL threw: " + String(error));
        return false;
      }
    }

    function settle(request, result) {
      if (active !== request) return;
      active = null;
      request.exchangeTimer = clearTimer(request.exchangeTimer);
      request.deadlineTimer = clearTimer(request.deadlineTimer);
      pump();
      if (isCallable(request.callback)) request.callback(result);
    }

    function fail(request, code) {
      settle(request, { ok: false, error: code });
    }

    function armExchange(request) {
      request.exchangeTimer = clearTimer(request.exchangeTimer);
      var requestGeneration = generation;
      request.exchangeTimer = schedule(EXCHANGE_TIMEOUT_SEC, function () {
        request.exchangeTimer = null;
        if (alive(requestGeneration) && active === request) fail(request, "timeout");
      });
    }

    function transmit(request) {
      var id = JSON.stringify(request.id);
      var code;
      if (request.op === "read") {
        code =
          "window.__hpv2s&&window.__hpv2s.r(" +
          id + "," + JSON.stringify(request.key) + "," +
          request.part + "," + CHUNK_CHARS + ");void(0);";
      } else if (request.op === "write") {
        code =
          "window.__hpv2s&&window.__hpv2s.w(" +
          id + "," + JSON.stringify(KEY_CURRENT) + "," +
          JSON.stringify(KEY_PREVIOUS) + "," + request.part + "," +
          request.total + "," +
          JSON.stringify(
            request.record.slice(
              request.part * CHUNK_CHARS,
              (request.part + 1) * CHUNK_CHARS,
            ),
          ) +
          ");void(0);";
      } else {
        code =
          "window.__hpv2s&&window.__hpv2s.d(" + id + "," +
          JSON.stringify([KEY_PREVIOUS, KEY_CURRENT]) + ");void(0);";
      }
      armExchange(request);
      if (!sendScript(code)) fail(request, "send_failed");
    }

    function pump() {
      if (active || !ready || !queue.length) return;
      var request = queue.shift();
      active = request;
      var requestGeneration = generation;
      request.deadlineTimer = schedule(TRANSFER_DEADLINE_SEC, function () {
        request.deadlineTimer = null;
        if (alive(requestGeneration) && active === request) fail(request, "deadline");
      });
      transmit(request);
    }

    function failAll(code) {
      var pending = queue;
      queue = [];
      if (active) fail(active, code);
      for (var index = 0; index < pending.length; index++)
        if (isCallable(pending[index].callback))
          pending[index].callback({ ok: false, error: code });
    }

    function enqueue(request) {
      request.id = "h" + String(++requestSerial);
      request.part = 0;
      request.exchangeTimer = null;
      request.deadlineTimer = null;
      if (unavailable) {
        if (isCallable(request.callback))
          request.callback({ ok: false, error: "unavailable" });
        return;
      }
      queue.push(request);
      pump();
    }

    function onReadReply(request, message) {
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
      request.received += message.v;
      if (request.part + 1 < request.total) {
        request.part += 1;
        transmit(request);
        return;
      }
      settle(request, { ok: true, record: request.received });
    }

    function onWriteReply(request, message) {
      if (message.p !== request.part) return;
      if (message.d === 1) {
        if (request.part + 1 !== request.total) return fail(request, "malformed");
        return settle(request, { ok: true });
      }
      if (request.part + 1 >= request.total) return fail(request, "malformed");
      request.part += 1;
      transmit(request);
    }

    function onReady() {
      if (ready) return;
      ready = true;
      readyTimer = clearTimer(readyTimer);
      log("bridge ready");
      pump();
    }

    function onTitle(panelOrTitle, eventTitle) {
      if (generation <= 0) return;
      var title = arguments.length > 1 ? eventTitle : panelOrTitle;
      if (typeof title !== "string" || !title) return;
      if (title.indexOf(TITLE_PREFIX) !== 0) {
        // Any other title means a document committed. Before readiness that is
        // the signal to install the page object; afterwards it means the page
        // was replaced, so the object is gone and the in-flight request with it.
        if (ready) {
          ready = false;
          injectAttempts = 0;
          if (active) fail(active, "page_reset");
        }
        if (injectAttempts < MAX_INJECT_ATTEMPTS) {
          injectAttempts += 1;
          sendScript(pageScript());
        }
        return;
      }
      if (title.length > TITLE_MAX_CHARS) return;
      var message = null;
      try {
        message = JSON.parse(title.slice(TITLE_PREFIX.length));
      } catch {
        return;
      }
      if (!message || typeof message !== "object") return;
      if (message.o === "ready" && message.i === "ready") {
        onReady();
        return;
      }
      var request = active;
      if (!request || message.i !== request.id) return;
      if (message.ok !== true) {
        fail(request, "page:" + String(message.e || "error").slice(0, 120));
        return;
      }
      if (request.op === "read" && message.o === "r") onReadReply(request, message);
      else if (request.op === "write" && message.o === "w") onWriteReply(request, message);
      else if (request.op === "delete" && message.o === "d") settle(request, { ok: true });
    }

    function markUnavailable(code) {
      if (unavailable) return;
      unavailable = true;
      ready = false;
      readyTimer = clearTimer(readyTimer);
      log("bridge unavailable: " + code);
      failAll("unavailable");
    }

    function start() {
      if (started) return true;
      started = true;
      if (!isValid(panel) || !isCallable(panel.SetURL)) {
        markUnavailable("panel");
        return false;
      }
      if (!isCallable($.RegisterEventHandler)) {
        markUnavailable("events");
        return false;
      }
      try {
        $.RegisterEventHandler("HTMLTitle", panel, onTitle);
      } catch (error) {
        markUnavailable("register");
        return false;
      }
      var startGeneration = generation;
      readyTimer = schedule(READY_TIMEOUT_SEC, function () {
        readyTimer = null;
        if (alive(startGeneration) && !ready) markUnavailable("ready_timeout");
      });
      try {
        panel.SetURL(PAGE_URL);
      } catch (error) {
        markUnavailable("navigate");
        return false;
      }
      return true;
    }

    function readKey(key, callback) {
      enqueue({ op: "read", key: key, received: "", total: 0, callback: callback });
    }

    // Reads current, then previous only when current is not usable.
    function load(callback) {
      readKey(KEY_CURRENT, function (current) {
        if (!current.ok) return callback({ kind: "error", error: current.error });
        var currentRecord = classifyRecord(current.record);
        if (currentRecord.kind === "valid") {
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
          if (currentRecord.kind === "absent" && previousRecord.kind === "absent")
            return callback({ kind: "absent" });
          if (currentRecord.kind === "unsupported" || previousRecord.kind === "unsupported")
            return callback({ kind: "unsupported" });
          callback({ kind: "corrupt" });
        });
      });
    }

    function dropQueuedWrites() {
      var kept = [];
      for (var index = 0; index < queue.length; index++) {
        if (queue[index].op === "write") {
          if (isCallable(queue[index].callback))
            queue[index].callback({ ok: false, error: "superseded" });
        } else {
          kept.push(queue[index]);
        }
      }
      queue = kept;
    }

    // One active write plus at most one queued write: a newer body replaces
    // the queued one instead of growing a backlog.
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
      enqueue({ op: "delete", callback: callback });
    }

    function dispose() {
      generation = 0;
      readyTimer = clearTimer(readyTimer);
      if (active) {
        active.exchangeTimer = clearTimer(active.exchangeTimer);
        active.deadlineTimer = clearTimer(active.deadlineTimer);
      }
      active = null;
      queue = [];
      ready = false;
    }

    return Object.freeze({
      start: start,
      load: load,
      save: save,
      forget: forget,
      dispose: dispose,
      isReady: function () {
        return ready;
      },
      isUnavailable: function () {
        return unavailable;
      },
      isBusy: function () {
        return !!active || queue.length > 0;
      },
    });
  }

  $.HPColorsV2StorageFactory = Object.freeze({
    create: create,
    keys: Object.freeze({ current: KEY_CURRENT, previous: KEY_PREVIOUS }),
    limits: Object.freeze({
      chunkChars: CHUNK_CHARS,
      maxChunks: MAX_CHUNKS,
      readyTimeoutSec: READY_TIMEOUT_SEC,
      exchangeTimeoutSec: EXCHANGE_TIMEOUT_SEC,
      transferDeadlineSec: TRANSFER_DEADLINE_SEC,
    }),
    codec: Object.freeze({
      encodeRecord: encodeRecord,
      classifyRecord: classifyRecord,
      checksum: checksum,
    }),
  });
})();
