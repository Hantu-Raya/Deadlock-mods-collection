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
  var KEY_CURRENT = "hantu.hpcolors.v2/state";
  var KEY_PREVIOUS = "hantu.hpcolors.v2/state.prev";
  var TITLE_PREFIX = "HPV2S1:";
  var RECORD_TAG = "HPV2S1";
  var ENVELOPE_MAGIC = "HPV2STORE";
  // Schema 1 held the body as a JSON string; schema 2 embeds it as an object,
  // which avoids escaping every quote twice. Both are read; 2 is written.
  var ENVELOPE_SCHEMA = 2;

  // Measured live: 3000-character replies arrive intact, and each title
  // carries at most 4096 characters.
  var CHUNK_CHARS = 3000;
  var MAX_CHUNKS = 64;
  var TITLE_MAX_CHARS = 4096;

  // Live Deadlock can lose or delay an HTMLTitle at game start. The page gets
  // READY_TIMEOUT_SEC to answer (re-injected every REINJECT_SEC); each
  // exchange is resent up to EXCHANGE_RETRIES times; a whole request is
  // capped so a trickling page cannot hold the queue.
  var READY_TIMEOUT_SEC = 12;
  var REINJECT_SEC = 2;
  var MAX_INJECTS_PER_PAGE = 6;
  var EXCHANGE_TIMEOUT_SEC = 3;
  var EXCHANGE_RETRIES = 3;
  var TRANSFER_DEADLINE_SEC = 90;
  // A failed load (Steam shows http://error/) is retried this many times.
  var MAX_NAVIGATIONS = 4;
  var NAVIGATE_RETRY_SEC = 1;
  // Without any HTMLURLChanged event by then, fall back to title-driven
  // injection so a client without that event still works.
  var URL_EVENT_GRACE_SEC = 6;
  var DIAGNOSTIC_LOG_LIMIT = 8;

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
  // keeps the payload inert inside a javascript: URL, which the browser
  // percent-decodes, and inside a JSON title.

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
    var payload = base64UrlEncode(
      '{"m":"' + ENVELOPE_MAGIC + '","s":' + ENVELOPE_SCHEMA +
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
    if (Number.isInteger(envelope.s) && envelope.s > ENVELOPE_SCHEMA)
      return { kind: "unsupported", schema: envelope.s };
    var body = null;
    if (envelope.s === 1 && typeof envelope.b === "string") body = parseBody(envelope.b);
    else if (envelope.s === 2 && envelope.b && typeof envelope.b === "object")
      body = parseBody(JSON.stringify(envelope.b));
    if (!body) return { kind: "corrupt" };
    return {
      kind: "valid",
      body: body,
      sum: parts[1],
      savedAt: Number.isFinite(envelope.t) ? envelope.t : 0,
    };
  }

  // -- Page script --
  //
  // Installed once per document on one namespaced object; every call is
  // idempotent so Panorama can resend an exchange whose reply was lost. Only
  // one request is ever in flight, so the page keeps one staging buffer, one
  // read snapshot, and the last committed write id (a resent final chunk
  // answers "done" again). A commit moves the current record to the previous
  // key only when its checksum matches `e`, the record Panorama fully
  // validated; otherwise the existing backup is kept. The hello carries the
  // page address so Panorama can reject the placeholder document the panel
  // shows before `file://` commits.
  function pageScript() {
    return (
      "(function(w){if(w.__hpv2s&&w.__hpv2s.v===3){w.__hpv2s.hello();return;}" +
      "var s={v:3,q:0};" +
      "function send(m){m.q=++s.q;try{w.document.title='" +
      TITLE_PREFIX +
      "'+JSON.stringify(m);}catch(e){}}" +
      "function sum(t){var h=0x811c9dc5;for(var i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return('0000000'+h.toString(16)).slice(-8);}" +
      "function ok(v){if(typeof v!=='string')return false;var p=v.split('.');return p.length===3&&p[0]==='" +
      RECORD_TAG +
      "'&&sum(p[2])===p[1];}" +
      "s.hello=function(){send({i:'ready',o:'ready',ok:true,h:''+w.location.href});};" +
      "s.w=function(id,k,pk,p,n,c,e){try{" +
      "if(s.dn===id){send({i:id,o:'w',ok:true,p:p,n:n,d:1});return;}" +
      "if(s.si!==id){s.si=id;s.st={c:0,a:[]};}" +
      "var b=s.st;if(b.a[p]===undefined){b.a[p]=c;b.c++;}" +
      "if(b.c<n){send({i:id,o:'w',ok:true,p:p,n:n});return;}" +
      "var v=b.a.join('');s.si=null;s.st=null;" +
      "if(!ok(v)){send({i:id,o:'w',ok:false,e:'checksum'});return;}" +
      "var L=w.localStorage,cur=L.getItem(k);" +
      "if(e&&cur!==null&&cur!==v&&cur.split('.')[1]===e&&ok(cur))L.setItem(pk,cur);" +
      "L.setItem(k,v);s.dn=id;send({i:id,o:'w',ok:true,p:p,n:n,d:1});" +
      "}catch(x){s.si=null;s.st=null;send({i:id,o:'w',ok:false,e:''+x});}};" +
      "s.r=function(id,k,p,z){try{" +
      "if(s.ri!==id){s.ri=id;s.rv=w.localStorage.getItem(k);}var v=s.rv;" +
      "if(v===null){send({i:id,o:'r',ok:true,x:0,p:p});return;}" +
      "var n=Math.max(1,Math.ceil(v.length/z));" +
      "send({i:id,o:'r',ok:true,x:1,p:p,n:n,v:v.slice(p*z,(p+1)*z)});" +
      "}catch(x){s.ri=null;send({i:id,o:'r',ok:false,e:''+x});}};" +
      "s.d=function(id,ks){try{for(var i=0;i<ks.length;i++)w.localStorage.removeItem(ks[i]);" +
      "send({i:id,o:'d',ok:true});}catch(x){send({i:id,o:'d',ok:false,e:''+x});}};" +
      "w.__hpv2s=s;s.hello();})(window);void(0);"
    );
  }

  // Only the committed file:// document has storage. The panel shows an
  // about:blank placeholder first, and a script sent there while file:// is
  // still loading can abort that load (live: the page ended at http://error/).
  function isStoragePage(href) {
    return typeof href === "string" && href.indexOf("file:") === 0;
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

    var alive = true;
    var started = false;
    var ready = false;
    var unavailable = false;
    var pageTitle = "";
    var pageUrl = "";
    var sawUrlEvent = false;
    var titleOnly = false;
    var navigations = 0;
    var injects = 0;
    var readyTimer = null;
    var reinjectTimer = null;
    var serial = 0;
    var active = null;
    var queue = [];
    var diagnostics = 0;
    // Checksum of the current record this bridge fully validated or wrote;
    // only that record may be rotated into the backup key.
    var trustedSum = "";

    function clearTimer(handle) {
      if (handle !== null) cancelScheduled(handle);
      return null;
    }

    function later(seconds, callback) {
      return schedule(seconds, function () {
        if (alive) callback();
      });
    }

    function diagnose(message) {
      if (diagnostics >= DIAGNOSTIC_LOG_LIMIT) return;
      diagnostics += 1;
      log(message);
    }

    function run(code) {
      if (!isValid(panel)) return false;
      try {
        panel.SetURL("javascript:" + code + ";void(0);");
        return true;
      } catch (error) {
        diagnose("SetURL threw: " + String(error));
        return false;
      }
    }

    // -- Request queue: one request in flight, one reply per exchange --

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

    function exchangeCode(request) {
      var args = JSON.stringify(request.id);
      if (request.op === "read")
        return "window.__hpv2s&&window.__hpv2s.r(" + args + "," +
          JSON.stringify(request.key) + "," + request.part + "," + CHUNK_CHARS + ")";
      if (request.op === "write")
        return "window.__hpv2s&&window.__hpv2s.w(" + args + "," +
          JSON.stringify(KEY_CURRENT) + "," + JSON.stringify(KEY_PREVIOUS) + "," +
          request.part + "," + request.total + "," +
          JSON.stringify(
            request.record.slice(request.part * CHUNK_CHARS, (request.part + 1) * CHUNK_CHARS),
          ) + "," + JSON.stringify(trustedSum) + ")";
      return "window.__hpv2s&&window.__hpv2s.d(" + args + "," +
        JSON.stringify([KEY_PREVIOUS, KEY_CURRENT]) + ")";
    }

    // Sends the current exchange. A missing reply resends it (page calls are
    // idempotent); a late reply to an earlier send is accepted all the same.
    function transmit(request) {
      request.exchangeTimer = clearTimer(request.exchangeTimer);
      request.exchangeTimer = later(EXCHANGE_TIMEOUT_SEC, function () {
        request.exchangeTimer = null;
        if (active !== request) return;
        if (request.retries >= EXCHANGE_RETRIES) return fail(request, "timeout");
        request.retries += 1;
        diagnose(
          "no reply to " + request.op + " part " + request.part +
            "; resending (" + request.retries + "/" + EXCHANGE_RETRIES + ")",
        );
        transmit(request);
      });
      if (!run(exchangeCode(request))) fail(request, "send_failed");
    }

    function advance(request) {
      request.part += 1;
      request.retries = 0;
      transmit(request);
    }

    function pump() {
      if (active || !ready || !queue.length) return;
      var request = queue.shift();
      active = request;
      request.deadlineTimer = later(TRANSFER_DEADLINE_SEC, function () {
        request.deadlineTimer = null;
        if (active === request) fail(request, "deadline");
      });
      transmit(request);
    }

    function enqueue(request) {
      if (unavailable) {
        if (isCallable(request.callback)) request.callback({ ok: false, error: "unavailable" });
        return;
      }
      request.id = "h" + String(++serial);
      request.part = 0;
      request.retries = 0;
      request.exchangeTimer = null;
      request.deadlineTimer = null;
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
      if (!request || message.i !== request.id) return;
      if (message.ok !== true)
        return fail(request, "page:" + String(message.e || "error").slice(0, 120));
      if (request.op === "read" && message.o === "r") onRead(request, message);
      else if (request.op === "write" && message.o === "w") onWrite(request, message);
      else if (request.op === "delete" && message.o === "d") settle(request, { ok: true });
    }

    // -- Page lifecycle --

    function onReady(href) {
      if (ready) return;
      if (!isStoragePage(href)) {
        diagnose("ignored hello from placeholder page " + String(href).slice(0, 40));
        return;
      }
      ready = true;
      readyTimer = clearTimer(readyTimer);
      reinjectTimer = clearTimer(reinjectTimer);
      log("bridge ready (inject " + injects + ")");
      pump();
    }

    // Installs the page object, only into a loaded file:// document (or, on a
    // client without URL events, after the grace period). If no usable hello
    // follows, the same document is injected again.
    function inject() {
      reinjectTimer = clearTimer(reinjectTimer);
      if (ready || injects >= MAX_INJECTS_PER_PAGE) return;
      if (!isStoragePage(pageUrl) && !titleOnly) return;
      injects += 1;
      run(pageScript());
      reinjectTimer = later(REINJECT_SEC, inject);
    }

    function navigate() {
      pageUrl = "";
      pageTitle = "";
      injects = 0;
      navigations += 1;
      try {
        panel.SetURL(PAGE_URL);
        return true;
      } catch (error) {
        markUnavailable("navigate");
        return false;
      }
    }

    function onUrl(panelOrUrl, eventUrl) {
      if (!alive || ready) return;
      var url = String(arguments.length > 1 ? eventUrl : panelOrUrl || "");
      sawUrlEvent = true;
      pageUrl = url;
      // Titles seen so far belonged to the previous document.
      pageTitle = "";
      if (isStoragePage(url)) {
        // Inject once the listing has a title; the timer covers a lost title.
        if (pageTitle) inject();
        else reinjectTimer = later(REINJECT_SEC, inject);
        return;
      }
      if (!url || url === "about:blank") return;
      diagnose("page load failed at " + url.slice(0, 40) + " (load " + navigations + ")");
      if (navigations < MAX_NAVIGATIONS) later(NAVIGATE_RETRY_SEC, navigate);
      else markUnavailable("navigate_failed");
    }

    function onTitle(panelOrTitle, eventTitle) {
      if (!alive) return;
      var title = arguments.length > 1 ? eventTitle : panelOrTitle;
      if (typeof title !== "string" || !title) return;
      if (title.indexOf(TITLE_PREFIX) !== 0) {
        // A plain title means a document finished loading. Deadlock delivers
        // every HTMLTitle twice, so a repeat is ignored; after readiness plain
        // titles are only echoes (the bridge never navigates again).
        if (ready || title === pageTitle) return;
        pageTitle = title;
        injects = 0;
        inject();
        return;
      }
      var message = null;
      if (title.length <= TITLE_MAX_CHARS) {
        try {
          message = JSON.parse(title.slice(TITLE_PREFIX.length));
        } catch {}
      }
      if (!message || typeof message !== "object") {
        diagnose("ignored unreadable reply title (" + title.length + " chars)");
        return;
      }
      if (message.o === "ready" && message.i === "ready") onReady(message.h);
      else onReply(message);
    }

    function markUnavailable(code) {
      if (unavailable) return;
      unavailable = true;
      ready = false;
      readyTimer = clearTimer(readyTimer);
      reinjectTimer = clearTimer(reinjectTimer);
      log("bridge unavailable: " + code);
      var pending = active ? [active].concat(queue) : queue;
      active = null;
      queue = [];
      for (var index = 0; index < pending.length; index++) {
        pending[index].exchangeTimer = clearTimer(pending[index].exchangeTimer);
        pending[index].deadlineTimer = clearTimer(pending[index].deadlineTimer);
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
      } catch (error) {
        markUnavailable("register");
        return false;
      }
      try {
        $.RegisterEventHandler("HTMLURLChanged", panel, onUrl);
      } catch (error) {
        titleOnly = true;
      }
      readyTimer = later(READY_TIMEOUT_SEC, function () {
        readyTimer = null;
        if (!ready) markUnavailable("ready_timeout");
      });
      later(URL_EVENT_GRACE_SEC, function () {
        if (ready || sawUrlEvent) return;
        diagnose("no page URL events; injecting by title");
        titleOnly = true;
        injects = 0;
        inject();
      });
      return navigate();
    }

    // -- Public operations --

    function readKey(key, callback) {
      enqueue({ op: "read", key: key, chunks: [], total: 0, callback: callback });
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

    function dispose() {
      alive = false;
      readyTimer = clearTimer(readyTimer);
      reinjectTimer = clearTimer(reinjectTimer);
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
