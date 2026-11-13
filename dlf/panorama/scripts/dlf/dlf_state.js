// Shared DLF match-state rules: the banner (top bar), the ESC menu and the Node checks all
// normalize through this one function, so a value the menu accepts is the value the banner shows.
// State: { season, match, seriesFormat, banCount (2|3), amber: { name, score, bans: [id, id, id], logo: { url, scale } }, sapphire: {...},
//          style: { event|team|player|score|series: { font, size, x, y, spacing } },
//          dev: { debuffs, debuffPollMs, logStatus }, graph: { show, every, size, x, y, line, fill },
//          buys (seconds a purchase notice shows: 0, 3, 5, 8, 15), cues: { bridge, urn, rift, mid } (objective
//          timer show windows), autoSeries (the match-end screen adds the winner's series point) }
// bans hold CitadelHeroImage hero IDs (0 = empty slot; a save from before the third ban gets an empty
// third slot); banCount is how many the banner and the menu show (2 or 3, default 3): at 2 the third slot
// is kept (a switch back brings it back) and the banner paints the inner ban box out. score null hides the number.
// logo.url is an http(s) image URL ("" = the team's emblem); logo.scale is a percentage of the logo slot.
// style is the banner text per section: font (FONTS key), size and letter spacing in px, x/y offsets
// in px. STYLE_LIMITS bounds each section so its text stays inside its frame in the art.
// dev holds the spectator debuff-icon switch, the world-bar poll interval (one of DEBUFF_POLL_STEPS)
// and the status-log switch (world bars print their status panels to the console).
// The ESC menu publishes the current state as JSON on the HUD root attribute ATTR.
// Player name aliases: the banner publishes the live roster ({ amber: [name x6], sapphire: [...] },
// "" = empty slot) on ROSTER_ATTR; the menu learns each player's Steam account from the ESC players
// list and publishes { "<game name>": "<account id>" } on ACCOUNTS_ATTR. An alias for a player with a
// known account lives in state.aliases { "<account id>": alias } (saved, follows the player to any
// slot and across games). Players without one (bots, not yet probed) get a session alias on
// NAMES_ATTR as { amber: [{ n: game name, a: alias } | null x6], sapphire }, shown only while its
// slot still holds the same game name.
(() => {
  "use strict";

  const MAX_TEXT = 32;
  const MAX_NUMBER = 9999;
  const MAX_SCORE = 99;
  const BAN_SLOTS = 3;
  const BAN_COUNTS = [2, 3];
  const BAN_COUNT_DEFAULT = 3;
  const TEAMS = ["amber", "sapphire"];
  const FALLBACK_NAMES = { amber: "AMBER", sapphire: "SAPPHIRE" };
  const DEBUFF_POLL_STEPS = [100, 250, 500, 1000, 2000];
  const DEV_DEFAULTS = { debuffs: true, debuffPollMs: 250, logStatus: false };
  // Soul lead graph (top bar, dlf_soul_graph.js): show = seconds at each mark (0 off, -1 always),
  // first = game time of the first mark, every = seconds between the later marks (user 2026-10-24: first
  // at 10:00, then every 5:00; marks were multiples of every before), size % and x/y px offsets as
  // [min, max, step], line colour key, fill = team-coloured area under the line.
  const GRAPH_SHOW = [0, 15, 30, 60, -1];
  const GRAPH_FIRST = [120, 300, 600, 900, 1200];
  const GRAPH_EVERY = [60, 120, 180, 300, 600];
  const GRAPH_LIMITS = { size: [70, 150, 10], x: [-600, 600, 10], y: [-40, 300, 5] };
  const GRAPH_LINES = ["green", "white", "gold", "cyan"];
  // y defaults to 35 px lower (user 2026-10-24; 0 before). A saved record keeps its own y.
  const GRAPH_DEFAULTS = { show: 30, first: 600, every: 300, size: 100, x: 0, y: 35, line: "green", fill: true };
  // Seconds a purchase notice shows on its card (dlf_buys.js; 0 off).
  const BUYS_SHOW = [0, 3, 5, 8, 15];
  const BUYS_DEFAULT = 5;
  // Objective timer show windows (Observer HUD's cues; QOLLOCK's panels in the top bar): seconds before a
  // spawn each timer shows (0 off, -1 always). The rift's time is not networked, so it is only off or
  // always (its 20 s warning). The defaults keep DLF's always-on bridge, mid-boss and rift timers.
  const CUE_KINDS = ["bridge", "urn", "rift", "mid"];
  const CUE_SHOW = [0, 15, 30, 60, 120, -1];
  const RIFT_SHOW = [0, -1];
  const CUE_DEFAULTS = { bridge: -1, urn: 30, rift: -1, mid: -1 };
  function normalizeCues(raw, fallback) {
    const cues = raw && typeof raw === "object" ? raw : {};
    const base = fallback || CUE_DEFAULTS;
    const out = {};
    for (const kind of CUE_KINDS) out[kind] = (kind === "rift" ? RIFT_SHOW : CUE_SHOW).includes(cues[kind]) ? cues[kind] : base[kind];
    return out;
  }
  // Wins a series needs from its format text ("Best of 3", "BO5"): half the games rounded up, else null.
  function seriesWins(format) {
    const match = /\b(?:best\s*of|bo)\s*(\d{1,2})\b/i.exec(String(format || ""));
    const games = match ? Number(match[1]) : 0;
    return games > 0 ? Math.ceil(games / 2) : null;
  }
  // A whole number on the field's step inside its limits, else null.
  function graphStep(value, key) {
    const [min, max, step] = GRAPH_LIMITS[key];
    return Number.isInteger(value) && value >= min && value <= max && (value - min) % step === 0 ? value : null;
  }
  function normalizeGraph(raw, fallback) {
    const graph = raw && typeof raw === "object" ? raw : {};
    const base = fallback || GRAPH_DEFAULTS;
    return {
      show: GRAPH_SHOW.includes(graph.show) ? graph.show : base.show,
      first: GRAPH_FIRST.includes(graph.first) ? graph.first : base.first,
      every: GRAPH_EVERY.includes(graph.every) ? graph.every : base.every,
      size: pick(graphStep(graph.size, "size"), base.size),
      x: pick(graphStep(graph.x, "x"), base.x),
      y: pick(graphStep(graph.y, "y"), base.y),
      line: GRAPH_LINES.includes(graph.line) ? graph.line : base.line,
      fill: typeof graph.fill === "boolean" ? graph.fill : base.fill
    };
  }
  // Font keys -> Panorama font properties. Modesto Lite Expanded is the 2026-10-20 PSD face
  // (loose vt323.ttf in the release). GOFIRE remains selectable.
  const FONTS = {
    modesto: { family: '"ModestoLite Expanded", GOFIRE, Jost', weight: "normal", style: "normal", label: "MODESTO" },
    gofire: { family: "GOFIRE, Jost", weight: "normal", style: "normal", label: "GOFIRE" },
    napalm: { family: "Operation Napalm, Jost", weight: "normal", style: "italic", label: "NAPALM" },
    jost: { family: "Jost", weight: "bold", style: "italic", label: "JOST" }
  };
  const FONT_KEYS = Object.keys(FONTS);
  const STYLE_SECTIONS = ["event", "team", "player", "score", "series"];
  // [min, max] per property; the frames in the art are the envelopes (design.md).
  const STYLE_LIMITS = {
    event: { size: [12, 26], x: [-12, 12], y: [-8, 8], spacing: [0, 6] },
    // Team names hug the band's outer end (2026-10-28 art), so X stays within the few px before the frame.
    team: { size: [12, 30], x: [-6, 6], y: [-6, 6], spacing: [0, 6] },
    player: { size: [8, 18], x: [-6, 6], y: [-4, 4], spacing: [0, 4] },
    score: { size: [16, 44], x: [-10, 10], y: [-10, 10], spacing: [0, 4] },
    series: { size: [12, 30], x: [-12, 12], y: [-10, 10], spacing: [0, 6] }
  };
  const STYLE_DEFAULTS = {
    event: { font: "modesto", size: 22, x: 0, y: 0, spacing: 2 },
    team: { font: "modesto", size: 24, x: 0, y: 0, spacing: 2 },
    player: { font: "modesto", size: 13, x: 0, y: 0, spacing: 0 },
    score: { font: "modesto", size: 30, x: 0, y: 0, spacing: 0 },
    series: { font: "modesto", size: 22, x: 0, y: 0, spacing: 2 }
  };
  // The second event line keeps the PSD ratio (22 px over 14 px).
  const eventLine2Size = (size) => Math.round(size * 14 / 22);
  const LOGO_SCALE = [50, 200];
  const LOGO_DEFAULTS = { url: "", scale: 100 };
  const MAX_URL = 512;

  const cleanText = (value) => (typeof value === "string" || typeof value === "number")
    ? String(value).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT)
    : null;
  const cleanInt = (value, max) => {
    const number = Number(value);
    return value !== null && value !== "" && Number.isInteger(number) && number >= 0 && number <= max ? number : null;
  };
  const pick = (value, fallback) => value === null ? fallback : value;
  const cleanRange = (value, [min, max]) => Number.isInteger(value) && value >= min && value <= max ? value : null;
  const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::\d{1,5})?$/i;
  // "" (no logo), an absolute http(s) URL with a plain host, or null when invalid. Never truncated:
  // a URL that is too long or carries credentials, spaces, controls or backslashes is rejected.
  function cleanUrl(value) {
    if (typeof value !== "string") return null;
    const url = value.trim();
    if (!url) return "";
    if (url.length > MAX_URL || /[\x00-\x20\x7f\\]/.test(url)) return null;
    const match = /^https?:\/\/([^/?#]*)([/?#].*)?$/i.exec(url);
    return match && HOST.test(match[1]) ? url : null;
  }

  // The images to try for a logo URL, in order (Observer HUD's $.OHState.logoSources); the editor keeps
  // the URL as typed. The game loads PNG, JPEG, still WebP and GIF; animated WebP draws grey bars while
  // ImageLoaded still fires (live 2026-10-16) and video does not load. So image and GIF hosts are asked
  // for the file itself: imgur page and .gifv/.mp4/.webm/.webp links the GIF, then the still image;
  // Giphy and Tenor links the GIF; Discord's media proxy and fxtwitter WebP as GIF; Discord CDN emoji,
  // avatars and icons as GIF when animated, else PNG; X's WebP as PNG; GitHub blob pages raw; Dropbox
  // share pages with raw=1. Other URLs load as typed.
  const URL_PARTS = /^(https?:\/\/)([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;
  const imgur = (id) => [`https://i.imgur.com/${id}.gif`, `https://i.imgur.com/${id}.png`];
  const giphy = (id) => [`https://media.giphy.com/media/${id}/giphy.gif`];
  function logoSources(url) {
    const match = typeof url === "string" ? URL_PARTS.exec(url) : null;
    if (!match) return url ? [url] : [];
    const base = match[1] + match[2] + match[3];
    const host = match[2].toLowerCase();
    const path = match[3];
    const params = match[4] ? match[4].split("&").filter((part) => part) : [];
    const withQuery = (start, list) => (list.length ? `${start}?${list.join("&")}` : start);
    const without = (name) => params.filter((part) => part.split("=")[0].toLowerCase() !== name);
    let m = null;
    if (/^(?:www\.|m\.)?imgur\.com$/.test(host) && (m = /^\/([A-Za-z0-9]{5,10})(?:\.[A-Za-z0-9]{3,4})?\/?$/.exec(path))) return imgur(m[1]);
    if (host === "i.imgur.com" && (m = /^\/([A-Za-z0-9]{5,10})\.(?:gifv|mp4|webm|webp)$/i.exec(path))) return imgur(m[1]);
    if (/^(?:www\.)?giphy\.com$/.test(host) && (m = /^\/(?:gifs|stickers|embed)\/(?:[^/]*-)?([A-Za-z0-9]{6,40})\/?$/.exec(path))) return giphy(m[1]);
    if (/^media\d*\.giphy\.com$/.test(host) && (m = /^\/media\/(?:[^/]+\/)?([A-Za-z0-9]{6,40})\/[\w-]+\.(?:webp|mp4)$/i.exec(path))) return giphy(m[1]);
    if (host === "i.giphy.com" && (m = /^\/([A-Za-z0-9]{6,40})\.(?:webp|mp4)$/i.exec(path))) return [`https://i.giphy.com/${m[1]}.gif`];
    // Tenor media keys are an 11-character id plus a 5-character format code; AAAAC is the full GIF.
    if (/^media\d*\.tenor\.com$/.test(host) && (m = /^(\/(?:m\/)?[A-Za-z0-9_-]{11})[A-Za-z0-9_-]{5}(\/[\w-]+)\.(?:gif|webp|mp4)$/.exec(path))) {
      return [`https://${host}${m[1]}AAAAC${m[2]}.gif`];
    }
    if (/^(?:www\.)?tenor\.com$/.test(host) && /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?view\/[\w-]+-\d+$/.test(path)) return [`https://${host}${path}.gif`];
    if (/\.webp$/i.test(path)) {
      if (/^(?:media|images-ext-\d+)\.discordapp\.net$/.test(host)) return [withQuery(base, without("format").concat("format=gif"))];
      if (/^(?:gif\.)?fxtwitter\.com$/.test(host)) return [withQuery(base.replace(/\.webp$/i, ".gif"), params)];
      if (host === "cdn.discordapp.com" && /^\/(?:emojis|avatars|icons)\//.test(path)) {
        const animated = params.some((part) => /^animated=true$/i.test(part)) || /\/a_[^/]*$/.test(path);
        return [withQuery(base.replace(/\.webp$/i, animated ? ".gif" : ".png"), without("animated"))];
      }
      if (host === "pbs.twimg.com") return [withQuery(base.replace(/\.webp$/i, ""), ["format=png"].concat(without("format")))];
    }
    if (host === "pbs.twimg.com" && params.some((part) => /^format=webp$/i.test(part))) {
      return [withQuery(base, params.map((part) => (/^format=webp$/i.test(part) ? "format=png" : part)))];
    }
    if (/^(?:www\.)?github\.com$/.test(host) && (m = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(path))) return [`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`];
    if (/^(?:www\.)?dropbox\.com$/.test(host) && /^\/(?:s|scl\/fi)\//.test(path)) {
      return [withQuery(base, params.filter((part) => !/^(?:dl|raw)=/i.test(part)).concat("raw=1"))];
    }
    return [url];
  }

  // Glyph advances (thousandths of an em) for FIT_CHARS, from each font file's hmtx table
  // (dlf/scripts/font-metrics.py). The engine's text-overflow: shrink squashes GOFIRE's stencil cuts
  // (live 2026-10-16), so the banner picks a whole font size itself and keeps ellipsis as the backstop.
  const FIT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 #-_.'!?&/()";
  const FIT_ADVANCES = {
    modesto: "858,814,812,898,811,774,872,903,328,677,814,795,1025,925,960,838,960,833,789,865,897,859,1091,816,841,801,785,443,647,684,742,670,717,665,726,717,320,779,421,800,251,186,320,540,848,379,439,440",
    gofire: "773,768,731,747,781,780,731,802,381,779,816,663,1036,905,757,780,759,780,753,783,748,893,1035,969,823,860,763,388,825,774,704,746,751,633,794,755,403,937,596,767,250,253,403,747,897,691,605,602",
    napalm: "574,568,504,568,492,480,504,492,182,498,545,498,592,492,510,533,562,545,492,486,510,510,861,521,510,492,527,217,498,510,486,504,504,492,521,510,349,634,384,568,199,199,176,410,586,328,311,311",
    jost: "713,644,680,711,585,537,790,763,310,321,679,512,864,770,797,604,838,628,607,545,680,713,1033,665,640,601,642,494,637,602,677,625,650,585,608,650,301,647,216,515,313,298,333,608,730,590,331,331"
  };
  const UNKNOWN_ADVANCE = 1.1; // other scripts fall back to wider fonts
  const FIT_SAFETY = 1.03; // shaping, italic overhang (GOFIRE has no kerning: hmtx matches the rendered width)
  const advanceTables = {};
  for (const key of Object.keys(FIT_ADVANCES)) {
    const widths = FIT_ADVANCES[key].split(",").map((value) => Number(value) / 1000);
    advanceTables[key] = new Map([...FIT_CHARS].map((char, index) => [char, widths[index]]));
  }
  // Estimated width in px of upper-cased text at size px with spacing px of letter spacing.
  function textWidth(text, font, size, spacing) {
    const table = advanceTables[font] || advanceTables.modesto;
    const chars = [...String(text).toUpperCase()];
    let ems = 0;
    for (const char of chars) ems += table.has(char) ? table.get(char) : UNKNOWN_ADVANCE;
    return ems * size * FIT_SAFETY + spacing * chars.length;
  }
  // The largest whole size in [min, max] whose text fits width; min when none does (ellipsis then cuts it).
  function fitFontSize(text, font, max, min, spacing, width) {
    for (let size = max; size > min; size--) {
      if (textWidth(text, font, size, spacing) <= width) return size;
    }
    return Math.min(min, max);
  }

  function normalizeLogo(raw, fallback) {
    const logo = raw && typeof raw === "object" ? raw : {};
    return {
      url: pick(cleanUrl(logo.url), fallback.url),
      scale: pick(cleanRange(logo.scale, LOGO_SCALE), fallback.scale)
    };
  }

  function normalizeStyle(raw, fallback) {
    const source = raw && typeof raw === "object" ? raw : {};
    const style = {};
    for (const section of STYLE_SECTIONS) {
      const entry = source[section] && typeof source[section] === "object" ? source[section] : {};
      const base = fallback[section];
      const limits = STYLE_LIMITS[section];
      style[section] = {
        font: FONT_KEYS.includes(entry.font) ? entry.font : base.font,
        size: pick(cleanRange(entry.size, limits.size), base.size),
        x: pick(cleanRange(entry.x, limits.x), base.x),
        y: pick(cleanRange(entry.y, limits.y), base.y),
        spacing: pick(cleanRange(entry.spacing, limits.spacing), base.spacing)
      };
    }
    // Saves from before this face stored GOFIRE at the default size and offsets. That was the
    // default, not a picked font. A section set to GOFIRE on its own is left alone.
    const untouched = STYLE_SECTIONS.every((section) => {
      const entry = style[section];
      const base = STYLE_DEFAULTS[section];
      return entry.font === "gofire" && entry.size === base.size && entry.x === base.x &&
        entry.y === base.y && entry.spacing === base.spacing;
    });
    if (untouched) {
      for (const section of STYLE_SECTIONS) style[section].font = "modesto";
    }
    return style;
  }

  // Every field falls back to `defaults` (itself normalized) when missing or invalid.
  function normalize(raw, defaults) {
    const source = raw && typeof raw === "object" ? raw : {};
    const base = defaults || null;
    const state = {
      season: pick(cleanInt(source.season, MAX_NUMBER), base ? base.season : 1),
      match: pick(cleanInt(source.match, MAX_NUMBER), base ? base.match : 1),
      seriesFormat: pick(cleanText(source.seriesFormat), base ? base.seriesFormat : ""),
      banCount: BAN_COUNTS.includes(source.banCount) ? source.banCount
        : base && BAN_COUNTS.includes(base.banCount) ? base.banCount : BAN_COUNT_DEFAULT
    };
    for (const team of TEAMS) {
      const entry = source[team] && typeof source[team] === "object" ? source[team] : {};
      const fallback = base ? base[team] : { name: FALLBACK_NAMES[team], score: null, bans: [0, 0, 0], logo: LOGO_DEFAULTS };
      const bans = [];
      for (let slot = 0; slot < BAN_SLOTS; slot++) {
        const id = Array.isArray(entry.bans) ? cleanInt(entry.bans[slot], 1000) : null;
        bans.push(pick(id, Array.isArray(entry.bans) ? 0 : fallback.bans[slot]));
      }
      const score = entry.score === null ? null : cleanInt(entry.score, MAX_SCORE);
      state[team] = {
        name: cleanText(entry.name) || fallback.name,
        score: "score" in entry && (score !== null || entry.score === null) ? score : fallback.score,
        bans,
        logo: normalizeLogo(entry.logo, fallback.logo)
      };
    }
    state.style = normalizeStyle(source.style, base ? base.style : STYLE_DEFAULTS);
    const dev = source.dev && typeof source.dev === "object" ? source.dev : {};
    const devFallback = base ? base.dev : DEV_DEFAULTS;
    state.dev = {
      debuffs: typeof dev.debuffs === "boolean" ? dev.debuffs : devFallback.debuffs,
      debuffPollMs: DEBUFF_POLL_STEPS.includes(dev.debuffPollMs) ? dev.debuffPollMs : devFallback.debuffPollMs,
      logStatus: typeof dev.logStatus === "boolean" ? dev.logStatus : devFallback.logStatus
    };
    state.graph = normalizeGraph(source.graph, base ? base.graph : GRAPH_DEFAULTS);
    state.buys = BUYS_SHOW.includes(source.buys) ? source.buys : base ? base.buys : BUYS_DEFAULT;
    state.cues = normalizeCues(source.cues, base ? base.cues : CUE_DEFAULTS);
    state.autoSeries = typeof source.autoSeries === "boolean" ? source.autoSeries : base ? base.autoSeries : false;
    state.aliases = normalizeAliases(source.aliases, base ? base.aliases : {});
    return state;
  }

  const PLAYER_SLOTS = 6;
  const MAX_ALIAS = 16;
  const cleanName = (value, max) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

  // { amber: [{ n, a } | null x6], sapphire: [...] }: anything malformed becomes an empty slot.
  function normalizeNames(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const names = {};
    for (const team of TEAMS) {
      const list = Array.isArray(source[team]) ? source[team] : [];
      names[team] = [];
      for (let slot = 0; slot < PLAYER_SLOTS; slot++) {
        const entry = list[slot];
        const game = entry && typeof entry === "object" ? cleanName(entry.n, MAX_TEXT) : "";
        const alias = entry && typeof entry === "object" ? cleanName(entry.a, MAX_ALIAS) : "";
        names[team].push(game && alias ? { n: game, a: alias } : null);
      }
    }
    return names;
  }

  const valid = (panel) => {
    try {
      return !!panel && panel.IsValid();
    } catch (e) {
      return false;
    }
  };

  // The HUD root attributes the banner, the ESC menu and the debuff column talk through (the menu
  // and the top bar share the HUD's topmost panel). One reader per script context: it caches the
  // root and the last raw value per attribute.
  function hudAttrs(context) {
    let root = null;
    const raws = new Map();
    const top = () => {
      if (valid(root)) return root;
      let panel = context;
      for (let depth = 0; depth < 40; depth++) {
        const parent = panel.GetParent();
        if (!valid(parent)) break;
        panel = parent;
      }
      root = panel;
      return panel;
    };
    const rawOf = (attr) => {
      try {
        return String(top().GetAttributeString(attr, "") || "");
      } catch (e) {
        return "";
      }
    };
    const parse = (raw) => {
      try {
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    };
    return {
      // The HUD's topmost panel (cached).
      root: top,
      // The parsed value (null when empty or unreadable).
      read: (attr) => parse(rawOf(attr)),
      // The parsed value when the attribute changed since this reader last saw it, else undefined.
      changed(attr) {
        const raw = rawOf(attr);
        if (raws.get(attr) === raw) return undefined;
        raws.set(attr, raw);
        return parse(raw);
      },
      // Publishes value as JSON; true when it was written (it differs from the last publish).
      write(attr, value) {
        const raw = JSON.stringify(value);
        if (raws.get(attr) === raw) return false;
        top().SetAttributeString(attr, raw);
        raws.set(attr, raw);
        return true;
      }
    };
  }

  // { "<account id>": alias }: a player's banner alias, kept by Steam account (saved with the match).
  const ACCOUNT = /^[1-9]\d{0,9}$/;
  const MAX_ALIASES = 24;
  function normalizeAliases(raw, fallback) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Object.assign({}, fallback);
    const aliases = {};
    for (const key of Object.keys(raw).filter((id) => ACCOUNT.test(id)).sort((a, b) => a - b).slice(0, MAX_ALIASES)) {
      const alias = cleanName(raw[key], MAX_ALIAS);
      if (alias) aliases[key] = alias;
    }
    return aliases;
  }

  // { "<game name>": "<account id>" }, from the ESC players list (only names one player has).
  function normalizeAccounts(raw) {
    const accounts = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return accounts;
    for (const name of Object.keys(raw).slice(0, 2 * MAX_ALIASES)) {
      const game = cleanName(name, MAX_TEXT);
      if (game && ACCOUNT.test(String(raw[name]))) accounts[game] = String(raw[name]);
    }
    return accounts;
  }

  // The name to show for a slot: the alias of its player's account when the account is known, else
  // a session alias tied to the slot while the same game name holds it (bots, unprobed players).
  function displayName(names, team, slot, gameName, aliases, accounts) {
    const account = gameName && accounts ? accounts[gameName] : "";
    if (account && aliases && aliases[account]) return aliases[account];
    const entry = names && names[team] ? names[team][slot] : null;
    return entry && gameName && entry.n === gameName ? entry.a : gameName;
  }

  // FNV-1a over UTF-16 code units, as 8 hex digits (save records and share codes).
  function checksum(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  // Share code: SHARE_PREFIX + checksum(json) + "." + base64url(UTF-8 json), json = { s, state, n }.
  // base64url keeps it one word for chat; whitespace a chat client wraps in is ignored on decode.
  const SHARE_PREFIX = "DLFC1.";
  const SHARE_SCHEMA = 1;
  const MAX_SHARE = 16384;
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
  // The decoded text, or null when it is not base64url of valid UTF-8.
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
  function encodeShare(state, names) {
    const json = JSON.stringify({ s: SHARE_SCHEMA, state, n: names });
    return SHARE_PREFIX + checksum(json) + "." + toBase64Url(json);
  }
  // { kind: "valid", state, names } | { kind: "unsupported" } (a newer code) | { kind: "corrupt" }.
  // state and names are raw: the caller normalizes them like any other input.
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
    return { kind: "valid", state: body.state, names: body.n };
  }

  // The banner's published aliases ({ "<in-game name>": alias } on ALIASES_ATTR) as a Map keyed by the
  // upper-cased in-game name; bad entries are skipped, at most 2 x PLAYER_SLOTS.
  function aliasMap(raw) {
    const out = new Map();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const key of Object.keys(raw)) {
      if (out.size >= 2 * PLAYER_SLOTS) break;
      const alias = raw[key];
      if (key.trim() && key.length <= 64 && typeof alias === "string" && alias.trim() && alias.length <= MAX_ALIAS) {
        out.set(key.trim().toUpperCase(), alias);
      }
    }
    return out;
  }

  $.DLFState = Object.freeze({
    ATTR: "dlf_match_state",
    ROSTER_ATTR: "dlf_roster",
    NAMES_ATTR: "dlf_player_names",
    ACCOUNTS_ATTR: "dlf_accounts",
    LOGO_STATUS_ATTR: "dlf_logo_status",
    ALIASES_ATTR: "dlf_aliases",
    aliasMap: aliasMap,
    MAX_TEXT, MAX_NUMBER, MAX_SCORE, BAN_SLOTS, TEAMS, DEBUFF_POLL_STEPS, PLAYER_SLOTS, MAX_ALIAS,
    BAN_COUNTS: BAN_COUNTS,
    GRAPH_SHOW: GRAPH_SHOW, GRAPH_FIRST: GRAPH_FIRST, GRAPH_EVERY: GRAPH_EVERY, GRAPH_LIMITS: GRAPH_LIMITS, GRAPH_LINES: GRAPH_LINES,
    GRAPH_DEFAULTS: GRAPH_DEFAULTS, normalizeGraph: normalizeGraph, BUYS_SHOW: BUYS_SHOW,
    CUE_KINDS: CUE_KINDS, CUE_SHOW: CUE_SHOW, RIFT_SHOW: RIFT_SHOW, CUE_DEFAULTS: CUE_DEFAULTS, seriesWins: seriesWins,
    FONTS, FONT_KEYS, STYLE_SECTIONS, STYLE_LIMITS, STYLE_DEFAULTS, LOGO_SCALE, MAX_URL,
    normalize, normalizeNames, normalizeAccounts, displayName, cleanUrl, logoSources: logoSources, eventLine2Size, textWidth,
    fitFontSize, cleanName, valid, hudAttrs, ACCOUNT, checksum, encodeShare, decodeShare, MAX_SHARE,
    defaults: () => normalize(typeof DLF_MATCH === "object" && DLF_MATCH ? DLF_MATCH : {}, null)
  });
})();
