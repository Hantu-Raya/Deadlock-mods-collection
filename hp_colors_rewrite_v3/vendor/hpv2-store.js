
// Requests stay in the URL fragment and never go to GitHub Pages. Settings
// stay in this origin's localStorage in Steam's CEF profile, not on a server.
(function () {
  "use strict";
  var VERSION = 1;
  var PREFIX = "HPV2S1:";
  var CURRENT = "hantu.hpcolors.v2/state";
  var PREVIOUS = "hantu.hpcolors.v2/state.prev";
  var KEY_PATTERN = /^hantu\.hpcolors\.v\d+\/state(\.prev)?$/;
  var CHUNK = 3000;
  var MAX_CHUNKS = 64;
  var sequence = 0;
  var readId = null;
  var readKey = null;
  var readValue = null;
  var writeId = null;
  var staging = null;
  // "latest" capability: the newest released version of each mod, read from latest.json on this
  // same origin ({"hpv3": "3.1.0", "download": {"hpv3": {"normal": url, "qollock": url, "showrank": url}}}). The
  // fetch runs in the background; an "lv" request is answered at once from the copy already held,
  // so every title write still answers exactly one request.
  var LATEST_RETRY_MS = 60000;
  var LATEST_REFRESH_MS = 600000;
  var latest = null;
  var latestAt = 0;
  var latestPending = false;

  function fetchLatest() {
    if (latestPending || typeof fetch !== "function") return;
    if (latestAt && Date.now() - latestAt < (latest ? LATEST_REFRESH_MS : LATEST_RETRY_MS)) return;
    latestPending = true;
    // A fresh query and no-store keep a cached manifest from hiding a release; the page's own
    // address (checked by Panorama) does not change.
    fetch("./latest.json?n=" + Date.now().toString(36), { cache: "no-store" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (value) {
        if (value && typeof value === "object" && !Array.isArray(value)) latest = value;
      })
      .catch(function () {})
      .then(function () { latestPending = false; latestAt = Date.now(); });
  }

  function latestVersion(app) {
    if (!latest || !Object.prototype.hasOwnProperty.call(latest, app)) return null;
    var version = latest[app];
    return typeof version === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version) ? version : null;
  }

  // Download pages per build ("normal", "qollock", "showrank"); only plain GameBanana HTTPS links are passed on.
  var DOWNLOAD_URL = /^https:\/\/gamebanana\.com\/[A-Za-z0-9\/_#.?=&%-]{1,200}$/;
  function latestDownloads(app) {
    var all = latest && Object.prototype.hasOwnProperty.call(latest, "download") ? latest.download : null;
    var own = all && typeof all === "object" && Object.prototype.hasOwnProperty.call(all, app) ? all[app] : null;
    if (!own || typeof own !== "object" || Array.isArray(own)) return null;
    var links = null;
    ["normal", "qollock", "showrank"].forEach(function (build) {
      var url = Object.prototype.hasOwnProperty.call(own, build) ? own[build] : null;
      if (typeof url === "string" && DOWNLOAD_URL.test(url)) (links = links || {})[build] = url;
    });
    return links;
  }

  function checksum(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  function validRecord(value) {
    if (typeof value !== "string") return false;
    var parts = value.split(".");
    return parts.length === 3 && parts[0] === "HPV2S1" &&
      /^[0-9a-f]{8}$/.test(parts[1]) && checksum(parts[2]) === parts[1];
  }

  function validKey(key) {
    return typeof key === "string" && KEY_PATTERN.test(key);
  }

  function reply(message) {
    message.q = ++sequence;
    var title = PREFIX + JSON.stringify(message);
    if (title.length > 4096)
      title = PREFIX + JSON.stringify({ i: message.i, o: message.o, ok: false, e: "title_limit", q: sequence });
    document.title = title;
  }

  function handle() {
    var request = null;
    try {
      request = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      if (!request || typeof request.i !== "string" || request.i.length > 80)
        return;
      var id = request.i;
      var op = request.o;
      if (op === "hello") {
        reply({ i: id, o: "ready", ok: true, v: VERSION, h: location.href, c: ["vkeys", "cas", "latest"] });
        return;
      }
      if (op === "lv") {
        if (typeof request.a !== "string" || !/^[a-z0-9]{1,16}$/.test(request.a))
          throw new Error("invalid_request");
        // s: "pending" while the first fetch is still loading; ask again later.
        reply({ i: id, o: op, ok: true, l: latestVersion(request.a), d: latestDownloads(request.a),
          s: latestPending && !latestAt ? "pending" : "done" });
        fetchLatest();
        return;
      }
      if (op === "d") {
        if (request.k === undefined) {
          localStorage.removeItem(PREVIOUS);
          localStorage.removeItem(CURRENT);
        } else {
          if (!validKey(request.k)) throw new Error("invalid_key");
          localStorage.removeItem(request.k);
        }
        readId = writeId = staging = null;
        reply({ i: id, o: op, ok: true });
        return;
      }
      if ((op !== "r" && op !== "w") || typeof request.r !== "string" ||
          request.r.length > 80 || !Number.isInteger(request.p) ||
          request.p < 0 || request.p >= MAX_CHUNKS)
        throw new Error("invalid_request");
      var part = request.p;
      if (op === "r") {
        if (!validKey(request.k)) throw new Error("invalid_key");
        // One stable snapshot per logical read, across unique message ids.
        if (readId !== request.r || readKey !== request.k) {
          readId = request.r;
          readKey = request.k;
          readValue = localStorage.getItem(readKey);
        }
        if (readValue === null) {
          reply({ i: id, o: op, ok: true, x: 0, p: part });
          return;
        }
        var total = Math.max(1, Math.ceil(readValue.length / CHUNK));
        reply({ i: id, o: op, ok: true, x: 1, p: part, n: total,
          v: readValue.slice(part * CHUNK, (part + 1) * CHUNK) });
        return;
      }
      var key = request.k === undefined ? CURRENT : request.k;
      if (!validKey(key)) throw new Error("invalid_key");
      if (!Number.isInteger(request.n) || request.n < 1 ||
          request.n > MAX_CHUNKS || part >= request.n ||
          typeof request.v !== "string" || request.v.length > CHUNK ||
          typeof request.e !== "string" ||
          (request.m !== undefined && (typeof request.m !== "string" ||
            !/^(none|[0-9a-f]{8})$/.test(request.m))))
        throw new Error("invalid_chunk");
      if (writeId !== request.r) {
        if (part !== 0) throw new Error("missing_chunk");
        writeId = request.r;
        staging = { count: 0, chunks: [], total: request.n, expected: request.e, key: key, match: request.m };
      }
      if (staging.total !== request.n || staging.expected !== request.e || staging.key !== key ||
          staging.match !== request.m)
        throw new Error("changed_write");
      if (staging.chunks[part] === undefined) {
        staging.chunks[part] = request.v;
        staging.count++;
      } else if (staging.chunks[part] !== request.v) {
        throw new Error("changed_chunk");
      }
      if (staging.count < staging.total) {
        reply({ i: id, o: op, ok: true, p: part, n: request.n });
        return;
      }
      var value = staging.chunks.join("");
      writeId = staging = null;
      if (!validRecord(value)) throw new Error("checksum");
      var current = localStorage.getItem(key);
      var previous = key.slice(-5) === ".prev" ? null : key + ".prev";
      // "cas" capability: a write carrying m (checksum of the whole value it
      // last saw at this key, or "none") replaces only that value. A changed
      // value is refused so a newer save is never overwritten. Writes without
      // m (v2) keep the unconditional behaviour.
      if (request.m !== undefined && current !== value &&
          request.m !== (current === null ? "none" : checksum(current)))
        throw new Error("conflict");
      // Only rotate a checksum that Panorama classified as valid (or wrote).
      // Replaying a commit after a lost ack must not rotate the backup twice.
      if (previous && request.e && current !== null && current !== value &&
          current.split(".")[1] === request.e && validRecord(current))
        localStorage.setItem(previous, current);
      localStorage.setItem(key, value);
      reply({ i: id, o: op, ok: true, p: part, n: request.n, d: 1 });
    } catch (error) {
      if (request && request.o === "w") writeId = staging = null;
      if (request && request.o === "r") readId = null;
      if (request && typeof request.i === "string")
        reply({ i: request.i.slice(0, 80), o: String(request.o).slice(0, 12),
          ok: false, e: String(error).slice(0, 160) });
    }
  }

  window.addEventListener("hashchange", handle);
  fetchLatest();
  handle();
})();
