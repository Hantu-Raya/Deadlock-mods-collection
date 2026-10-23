// Observer HUD match state ($.OHState): the bar, the aliases, the status column and the editor all
// read the state through normalize, so a value the editor accepts is the value the bar shows.
// State: { v: 1, style ("names" | "desk"), event, stage, bestOf (1|3|5|7),
//          amber/sapphire: { name, tag, logo: { url }, series, bans: [heroId, heroId] },
//          org: { name, logo: { url } }, info: { title, value, caption }, graph: { show, every, size, x, y },
//          logo: { shape, size, gap },
//          cues: { bridge, urn, rift, mid }, buys,
//          aliases: { "<in-game name>": "<alias>" },
//          dev: { debuffs, debuffPollMs, logStatus } }
// style picks the look: "names" (Base Game+ Names, default) or "desk" (Night Desk). org is the
// organiser wordmark or logo in the centre; info is Night Desk's optional card (no title: hidden);
// graph.show is how long Night Desk's soul lead graph shows at each mark (s; 0 off, -1 always);
// graph.every is the mark interval (s: 1, 2, 3, 5 or 10 minutes; default 5:00); size is a percentage
// (GRAPH_LIMITS.size, laid out larger around the graph's top centre) and x/y move it in px from its spot
// under the clock (GRAPH_LIMITS; [min, max, step]).
// logo is Night Desk's team logo (design 16): shape circle or square, size in px (LOGO_LIMITS; past 30 px
// each team's stock cards move outward by size - 30), gap in px between the logo's tab and the team name.
// cues: when each objective timer shows: the seconds before a spawn (15, 30, 60, 120; default 30),
// 0 off, -1 always. The rift is only 0 or -1 (the game warns 20 s ahead and never earlier).
// buys: seconds a purchase notice shows on the buyer's top-bar card (BUYS_SHOW; 0 off).
// Every field falls back on its own to the default when missing or invalid; text that is too long is
// rejected, never truncated. series runs from 0 to the wins bestOf needs. bans hold CitadelHeroImage
// hero IDs (0 = empty). Aliases are keyed by the player's in-game name for this session.
// Share codes: OHC1.<fnv1a of the JSON>.<base64url JSON> with JSON { s: 1, state }.
(() => {
  "use strict";

  const TEAMS = ["amber", "sapphire"];
  // The stock top-bar teams, fixed by game team: TeamFriendly is Amber (team 2), TeamEnemy is Sapphire
  // (team 3). key: the state key; panelId: the stock team panel; rowClass: the shop purchase row's class
  // for that buyer's team; own/other: the status column's colour for a status from that team / the other.
  // One table for the host, the column and the purchase notices (explicit keys for Closure).
  const TEAM_PANELS = Object.freeze([
    Object.freeze({ key: "amber", panelId: "TeamFriendly", rowClass: "isTeam1Purchase", own: "OHByAmber", other: "OHBySapphire" }),
    Object.freeze({ key: "sapphire", panelId: "TeamEnemy", rowClass: "isTeam2Purchase", own: "OHBySapphire", other: "OHByAmber" })
  ]);
  const LIMITS = { event: 40, stage: 28, name: 28, tag: 4, alias: 24, gameName: 32, org: 24, infoTitle: 24, infoValue: 16, infoCaption: 32 };
  const STYLES = ["names", "desk"];
  const GRAPH_SHOW = [0, 15, 30, 60, -1];
  const GRAPH_EVERY = [60, 120, 180, 300, 600];
  const GRAPH_LIMITS = { size: [70, 150, 10], x: [-600, 600, 10], y: [-40, 300, 5] };
  // Night Desk team logo (design 16): circle or square, size in px, gap in px between its tab and the name.
  const LOGO_SHAPES = ["circle", "square"];
  const LOGO_LIMITS = { size: [24, 50, 2], gap: [4, 48, 2] };
  // A whole number on the field's step inside its limits, else null.
  const onStep = (value, limits) => {
    const [min, max, step] = limits;
    return Number.isInteger(value) && value >= min && value <= max && (value - min) % step === 0 ? value : null;
  };
  const graphStep = (value, key) => onStep(value, GRAPH_LIMITS[key]);
  const logoStep = (value, key) => onStep(value, LOGO_LIMITS[key]);
  const CUE_SHOW = [0, 15, 30, 60, 120, -1];
  const RIFT_SHOW = [0, -1];
  const BEST_OF = [1, 3, 5, 7];
  const BAN_SLOTS = 2;
  const MAX_ALIASES = 24;
  const MAX_URL = 512;
  const MAX_HERO_ID = 1000;
  const DEBUFF_POLL_STEPS = [100, 250, 500, 1000, 2000];
  // Purchase notices: seconds each shows on the buyer's card (0 off); DLF showed 5.
  const BUYS_SHOW = [0, 3, 5, 8, 15];
  // A team name cleared to nothing shows the side's own name.
  const DEFAULT_NAMES = { amber: "AMBER", sapphire: "SAPPHIRE" };
  // The editor's boxes start filled with sample values (user 2026-10-22: real text, not only hints);
  // they show on the top bar until edited, and RESET returns to them. Logo URLs and aliases start empty.
  const DEFAULTS = Object.freeze({
    v: 1, style: "names", event: "Community Cup Season 2", stage: "Grand Final", bestOf: 3,
    amber: { name: "Night Owls", tag: "NOW", logo: { url: "" }, series: 0, bans: [0, 0] },
    sapphire: { name: "Brass Saints", tag: "BRS", logo: { url: "" }, series: 0, bans: [0, 0] },
    org: { name: "Community Cup", logo: { url: "" } },
    info: { title: "Prize pool", value: "$2,130", caption: "Donate to increase" },
    graph: { show: 30, every: 300, size: 100, x: 0, y: 0 },
    logo: { shape: "circle", size: 30, gap: 12 },
    cues: { bridge: 30, urn: 30, rift: -1, mid: 30 },
    buys: 5,
    aliases: {},
    dev: { debuffs: true, debuffPollMs: 250, logStatus: false }
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const winsNeeded = (bestOf) => Math.floor(bestOf / 2) + 1;

  // Collapses whitespace; null when not a string or longer than max (rejected, not cut).
  function cleanText(value, max) {
    if (typeof value !== "string") return null;
    const text = value.replace(/\s+/g, " ").trim();
    return text.length <= max ? text : null;
  }

  const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::\d{1,5})?$/i;
  // "" (no logo), an absolute http(s) URL with a plain host, or null when invalid. A URL that is too
  // long or carries credentials, spaces, controls or backslashes is rejected, never truncated.
  function cleanUrl(value) {
    if (typeof value !== "string") return null;
    const url = value.trim();
    if (!url) return "";
    if (url.length > MAX_URL || /[\x00-\x20\x7f\\]/.test(url)) return null;
    const match = /^https?:\/\/([^/?#]*)([/?#].*)?$/i.exec(url);
    return match && HOST.test(match[1]) ? url : null;
  }

  const pick = (value, fallback) => value === null || value === undefined ? fallback : value;
  const cleanInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max ? value : null;

  function normalizeAliases(raw, fallback) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Object.assign({}, fallback);
    const aliases = {};
    let count = 0;
    for (const key of Object.keys(raw)) {
      if (count >= MAX_ALIASES) break;
      const name = cleanText(key, LIMITS.gameName);
      const alias = cleanText(raw[key], LIMITS.alias);
      if (!name || !alias) continue;
      aliases[name] = alias;
      count++;
    }
    return aliases;
  }

  function normalize(raw, defaults) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const base = defaults || DEFAULTS;
    const bestOf = BEST_OF.includes(source.bestOf) ? source.bestOf : base.bestOf;
    const state = {
      v: 1,
      style: STYLES.includes(source.style) ? source.style : base.style,
      event: pick(cleanText(source.event, LIMITS.event), base.event),
      stage: pick(cleanText(source.stage, LIMITS.stage), base.stage),
      bestOf
    };
    for (const team of TEAMS) {
      const entry = source[team] && typeof source[team] === "object" ? source[team] : {};
      const fallback = base[team];
      const logo = entry.logo && typeof entry.logo === "object" ? entry.logo : {};
      const bans = [];
      for (let slot = 0; slot < BAN_SLOTS; slot++) {
        const id = Array.isArray(entry.bans) ? cleanInt(entry.bans[slot], 0, MAX_HERO_ID) : null;
        bans.push(pick(id, fallback.bans[slot]));
      }
      // A hero is banned once: a repeat in the second slot is dropped.
      if (bans[1] && bans[1] === bans[0]) bans[1] = 0;
      const series = pick(cleanInt(entry.series, 0, winsNeeded(bestOf)), Math.min(fallback.series, winsNeeded(bestOf)));
      state[team] = {
        name: cleanText(entry.name, LIMITS.name) || (entry.name === "" ? DEFAULT_NAMES[team] : fallback.name),
        tag: pick(cleanText(entry.tag, LIMITS.tag), fallback.tag).toUpperCase(),
        logo: { url: pick(cleanUrl(logo.url), fallback.logo.url) },
        series,
        bans
      };
    }
    // A hero banned by both teams keeps only the Amber ban.
    state.sapphire.bans = state.sapphire.bans.map((id) => id && state.amber.bans.includes(id) ? 0 : id);
    const org = source.org && typeof source.org === "object" ? source.org : {};
    const orgLogo = org.logo && typeof org.logo === "object" ? org.logo : {};
    state.org = {
      name: pick(cleanText(org.name, LIMITS.org), base.org.name),
      logo: { url: pick(cleanUrl(orgLogo.url), base.org.logo.url) }
    };
    const info = source.info && typeof source.info === "object" ? source.info : {};
    state.info = {
      title: pick(cleanText(info.title, LIMITS.infoTitle), base.info.title),
      value: pick(cleanText(info.value, LIMITS.infoValue), base.info.value),
      caption: pick(cleanText(info.caption, LIMITS.infoCaption), base.info.caption)
    };
    const graph = source.graph && typeof source.graph === "object" ? source.graph : {};
    state.graph = {
      show: GRAPH_SHOW.includes(graph.show) ? graph.show : base.graph.show,
      every: GRAPH_EVERY.includes(graph.every) ? graph.every : base.graph.every,
      size: pick(graphStep(graph.size, "size"), base.graph.size),
      x: pick(graphStep(graph.x, "x"), base.graph.x),
      y: pick(graphStep(graph.y, "y"), base.graph.y)
    };
    const logo = source.logo && typeof source.logo === "object" ? source.logo : {};
    state.logo = {
      shape: LOGO_SHAPES.includes(logo.shape) ? logo.shape : base.logo.shape,
      size: pick(logoStep(logo.size, "size"), base.logo.size),
      gap: pick(logoStep(logo.gap, "gap"), base.logo.gap)
    };
    const cues = source.cues && typeof source.cues === "object" ? source.cues : {};
    state.cues = {};
    for (const kind of ["bridge", "urn", "rift", "mid"]) {
      const allowed = kind === "rift" ? RIFT_SHOW : CUE_SHOW;
      state.cues[kind] = allowed.includes(cues[kind]) ? cues[kind] : base.cues[kind];
    }
    state.buys = BUYS_SHOW.includes(source.buys) ? source.buys : base.buys;
    state.aliases = normalizeAliases(source.aliases, base.aliases);
    const dev = source.dev && typeof source.dev === "object" ? source.dev : {};
    state.dev = {
      debuffs: typeof dev.debuffs === "boolean" ? dev.debuffs : base.dev.debuffs,
      debuffPollMs: DEBUFF_POLL_STEPS.includes(dev.debuffPollMs) ? dev.debuffPollMs : base.dev.debuffPollMs,
      logStatus: typeof dev.logStatus === "boolean" ? dev.logStatus : base.dev.logStatus
    };
    return state;
  }

  // Up to three capitals for a team without a tag ("Night Owls" -> "NO").
  function monogram(team) {
    if (team.tag) return team.tag;
    const words = team.name.split(" ").filter(Boolean);
    const letters = words.length > 1 ? words.map((word) => word.charAt(0)).join("") : team.name.slice(0, 3);
    return letters.slice(0, 3).toUpperCase();
  }

  // FNV-1a over UTF-16 code units, as 8 hex digits.
  function checksum(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  const SHARE_PREFIX = "OHC1.";
  const SHARE_SCHEMA = 1;
  const MAX_SHARE = 8192;
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function toBase64Url(text) {
    const bytes = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes.charCodeAt(i) << 16) | ((bytes.charCodeAt(i + 1) || 0) << 8) | (bytes.charCodeAt(i + 2) || 0);
      const chars = Math.min(4, bytes.length - i + 1);
      for (let k = 0; k < chars; k++) out += B64.charAt((n >> (18 - 6 * k)) & 63);
    }
    return out;
  }
  function fromBase64Url(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
    let percent = "";
    for (let i = 0; i < text.length; i += 4) {
      const chunk = text.slice(i, i + 4);
      let n = 0;
      for (let k = 0; k < 4; k++) n = (n << 6) | (k < chunk.length ? B64.indexOf(chunk.charAt(k)) : 0);
      for (let k = 0; k < chunk.length - 1; k++) percent += "%" + ("0" + ((n >> (16 - 8 * k)) & 255).toString(16)).slice(-2);
    }
    try {
      return decodeURIComponent(percent);
    } catch (e) {
      return null;
    }
  }
  // The DEV settings are diagnostics for this PC; they do not travel in a code.
  function encodeShare(state) {
    const shared = clone(state);
    delete shared.dev;
    const json = JSON.stringify({ s: SHARE_SCHEMA, state: shared });
    return SHARE_PREFIX + checksum(json) + "." + toBase64Url(json);
  }
  // { kind: "valid", state } | { kind: "unsupported" } (a newer code) | { kind: "corrupt" }; state is raw.
  function decodeShare(raw) {
    const text = typeof raw === "string" ? raw.replace(/\s+/g, "") : "";
    if (text.length > MAX_SHARE || text.slice(0, SHARE_PREFIX.length) !== SHARE_PREFIX) return { kind: "corrupt" };
    const parts = text.slice(SHARE_PREFIX.length).split(".");
    const json = parts.length === 2 ? fromBase64Url(parts[1]) : null;
    if (json === null || checksum(json) !== parts[0]) return { kind: "corrupt" };
    let body = null;
    try { body = JSON.parse(json); } catch (e) { return { kind: "corrupt" }; }
    if (!body || typeof body !== "object") return { kind: "corrupt" };
    if (body.s !== SHARE_SCHEMA) return { kind: Number.isInteger(body.s) && body.s > SHARE_SCHEMA ? "unsupported" : "corrupt" };
    return { kind: "valid", state: body.state };
  }

  const valid = (panel) => {
    try {
      return !!panel && panel.IsValid();
    } catch (e) {
      return false;
    }
  };

  // A stock clock label ("25:12", "1:02:03" or "-0:15") -> seconds; null when unreadable.
  function parseClock(text) {
    const match = /^\s*(-?)(\d+):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text || ""));
    if (!match) return null;
    const parts = match[4] === undefined ? [0, +match[2], +match[3]] : [+match[2], +match[3], +match[4]];
    const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return match[1] ? -seconds : seconds;
  }

  // Explicit keys: the Closure externs keep property names written as "key:" or ".key".
  $.OHState = Object.freeze({
    ATTR: "observer_hud_state",
    TEAMS: TEAMS, LIMITS: LIMITS, BEST_OF: BEST_OF, BAN_SLOTS: BAN_SLOTS, MAX_URL: MAX_URL,
    DEBUFF_POLL_STEPS: DEBUFF_POLL_STEPS, BUYS_SHOW: BUYS_SHOW, MAX_SHARE: MAX_SHARE, STYLES: STYLES, GRAPH_SHOW: GRAPH_SHOW, GRAPH_EVERY: GRAPH_EVERY, GRAPH_LIMITS: GRAPH_LIMITS, LOGO_SHAPES: LOGO_SHAPES, LOGO_LIMITS: LOGO_LIMITS, CUE_SHOW: CUE_SHOW, RIFT_SHOW: RIFT_SHOW,
    defaults: () => clone(DEFAULTS),
    normalize: normalize, cleanText: cleanText, cleanUrl: cleanUrl, monogram: monogram, winsNeeded: winsNeeded,
    checksum: checksum, encodeShare: encodeShare, decodeShare: decodeShare, valid: valid, clone: clone,
    parseClock: parseClock, TEAM_PANELS: TEAM_PANELS
  });
})();
