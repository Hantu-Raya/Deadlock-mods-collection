// Round 4 (v2) kit. Design 11's stock top bar and editor mock, shared, with the bar moved down
// by the design's header band. A design calls V2.mount({ band, renderBand, aliasOnPortrait }).
//   band:            header band height in px (the stock bar moves down by this much)
//   renderBand(S, h): HTML of the band; h has the helpers below
//   aliasOnPortrait: keep design 11's alias label on each portrait (default false: names go in the band)
(() => {
  "use strict";
  const HERO_NAMES = { haze: "Haze", inferno: "Infernus", lash: "Lash", kelvin: "Kelvin", wraith: "Wraith", bull: "Abrams",
    gigawatt: "Seven", digger: "Mo & Krill", spectre: "Lady Geist", hornet: "Vindicta", synth: "Pocket", sumo: "Dynamo",
    astro: "Holliday", bebop: "Bebop", viscous: "Viscous", yamato: "Yamato", mirage: "Mirage", shiv: "Shiv" };
  const card = (id) => `assets/game/heroes/${id}_card_psd.png`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // http(s) only, no credentials or spaces; mirrors $.OHState.cleanUrl's rules.
  const cleanUrl = (u) => {
    u = String(u || "").trim();
    if (!u) return "";
    if (u.length > 512 || /[\s\\\u0000-\u001f]/.test(u)) return null;
    try { const x = new URL(u); return (x.protocol === "http:" || x.protocol === "https:") && !x.username && !x.password ? x.href : null; }
    catch { return null; }
  };
  // Stock geometry (CitadelHudTopBar at 1080p): teams 528 px from x 330 and 1062, cards 88 px.
  const cardCenter = (key, i) => (key === "t1" ? 330 : 1062) + 44 + 88 * i;
  // Objective cues (round 5b): nothing is on screen until an objective is close. Show windows in
  // seconds; "UP" stays until the buff or urn is taken (minimap marker / pickup feed line), at most
  // "linger". Game rules (decisions/objective-timers.md, live-tested on demo 121685912): bridge buff
  // 5:00 then every 5:00; urn 10:00 then every 5:00; rift 12:00 then every 7:00, each ±1:00 at random
  // and not networked, so it shows only from its minimap warning 20 s before; mid-boss from the stock
  // respawn timer; a held rejuvenator for its 3:00 buff.
  const CUE = { bridge: 30, urn: 60, mid: 60, rift: 20, linger: 30 };
  // Mock state from the clock. Negative bridge/urn = spawned that many seconds ago.
  const objectiveState = (clock) => {
    const [m, sec] = String(clock).split(":").map(Number);
    const t = m * 60 + sec;
    const since = (first, every) => (t < first ? first - t : -((t - first) % every));
    const next = (v, every) => (v <= -CUE.linger ? every + v : v);
    return { bridge: next(since(300, 300), 300), urn: next(since(600, 300), 300), rift: { state: "none" }, mid: { state: "cooldown", secs: 290 } };
  };
  const mmss = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  // The cues to show for a state: bridge, urn, rift in that order, the mid-boss / rejuvenator inserted in
  // the middle (it is the mid objective). The row is centred as a group, so it is always symmetric.
  const objectiveCues = (st, teams) => {
    const out = [];
    const spawn = (kind, v, win, title) => {
      if (v > 0 && v <= win) out.push({ kind, cls: v <= 10 ? "soon" : "", text: mmss(v), title });
      else if (v <= 0 && v > -CUE.linger) out.push({ kind, cls: "live", text: "UP", title });
    };
    spawn("powerup", st.bridge, CUE.bridge, "Bridge buff");
    spawn("urn", st.urn, CUE.urn, "Urn");
    const md = st.mid;
    const mid = [];
    if (md.state === "held") mid.push({ kind: "rejuv", cls: `held ${md.team}`, text: mmss(md.secs), title: `${teams[md.team].name} hold the rejuvenator` });
    else if (md.state === "up") mid.push({ kind: "rejuv", cls: "live", text: "UP", title: "Mid-boss up" });
    else if (md.secs <= CUE.mid) mid.push({ kind: "rejuv", cls: md.secs <= 10 ? "soon" : "", text: mmss(md.secs), title: "Mid-boss respawn" });
    if (st.rift.state === "warn") out.push({ kind: "rift", cls: st.rift.secs <= 10 ? "soon" : "", text: mmss(st.rift.secs), title: "Rift opening" });
    else if (st.rift.state === "live") out.push({ kind: "rift", cls: "live", text: "LIVE", title: "Rift open" });
    if (mid.length) out.splice(Math.floor(out.length / 2), 0, mid[0]);
    return out;
  };

  const V2 = {
    mount(opts) {
      OH.mount((oh) => {
        const fresh = () => ({
          event: oh.match.event, stage: oh.match.stage, bestOf: oh.match.bestOf, game: oh.match.game, clock: opts.clock || oh.match.clock,
          graph: { show: 30 },
          org: { name: "Community Cup", logo: "" },
          info: Object.assign({ title: "Prize pool", value: "$2,130.00", caption: "Donate to increase" }, opts.info),
          teams: {
            t1: { src: oh.teams.amber, name: oh.teams.amber.name, tag: oh.teams.amber.tag, logo: "", series: 1, bans: ["astro", "viscous"], alias: oh.teams.amber.players.map((p) => p.name) },
            t2: { src: oh.teams.sapphire, name: oh.teams.sapphire.name, tag: oh.teams.sapphire.tag, logo: "", series: 1, bans: ["bebop", "yamato"], alias: oh.teams.sapphire.players.map((p) => p.name) },
          },
        });
        let S = fresh();
        const stage = document.querySelector(".stage");
        stage.style.setProperty("--band", opts.band + "px");
        const k = (n) => (n / 1000).toFixed(1);

        const h = {
          esc, cardCenter, HERO_NAMES, oh,
          wins: () => Math.ceil(S.bestOf / 2),
          logo(t, cls) {
            const url = cleanUrl(t.logo);
            return url ? `<span class="${cls}"><img src="${esc(url)}" alt="" data-fallback="${esc(t.tag)}"></span>` : `<span class="${cls} mono">${esc(t.tag)}</span>`;
          },
          orgLogo(cls) {
            const url = cleanUrl(S.org.logo);
            return url ? `<span class="${cls}"><img src="${esc(url)}" alt="${esc(S.org.name)}" data-fallback="${esc(S.org.name)}"></span>` : `<span class="${cls} mono">${esc(S.org.name)}</span>`;
          },
          ban: (id) => id ? `<span class="ban" title="${esc(HERO_NAMES[id])}"><img src="${card(id)}" alt="${esc(HERO_NAMES[id])} banned"></span>` : `<span class="ban empty" aria-label="no ban"></span>`,
          // One name per card, centred on the card below it (the alias, or the in-game name).
          names: (key, cls) => S.teams[key].src.players.map((p, i) => `<span class="${cls}${p.dead ? " dead" : ""}" style="left:${cardCenter(key, i)}px">${esc(S.teams[key].alias[i] || p.name)}</span>`).join(""),
          pips: (t, cls) => Array.from({ length: Math.ceil(S.bestOf / 2) }, (_, i) => `<i class="${cls}${i < t.series ? " on" : ""}"></i>`).join(""),
          // Objective cues under the clock (round 5b). look: "names" | "desk"; o overrides the mock state.
          objectives: (look, o = {}) => {
            const st = Object.assign(objectiveState(S.clock), opts.objectives, o);
            const cues = objectiveCues(st, S.teams);
            if (!cues.length) return "";
            const chip = (c) => `<span class="cue ${c.cls}" title="${esc(c.title)}"><i class="ic ${c.kind}"></i><b>${c.text}</b></span>`;
            return `<div class="obj ${look}" aria-label="Objective timers">${cues.map(chip).join("")}</div>`;
          },
          objSheet: (look) => `<div class="objsheet" aria-label="Objective cue states"><h3>Objective cues: shown only when close (reference)</h3>
            ${[["Nothing close: nothing shown", { bridge: 200, urn: 200, rift: { state: "none" }, mid: { state: "cooldown", secs: 200 } }],
               ["Bridge buff in 0:22, urn in 0:08", { bridge: 22, urn: 8, rift: { state: "none" }, mid: { state: "cooldown", secs: 200 } }],
               ["Mid-boss in 0:45, rift opens in 0:14", { bridge: 200, urn: 200, rift: { state: "warn", secs: 14 }, mid: { state: "cooldown", secs: 45 } }],
               ["Buff and urn just spawned, rift open", { bridge: -3, urn: -6, rift: { state: "live" }, mid: { state: "cooldown", secs: 200 } }]]
              .map(([cap, o]) => `<figure><div class="slot">${h.objectives(look, o) || '<span class="none">(nothing)</span>'}</div><figcaption>${cap}</figcaption></figure>`).join("")}</div>`,
        };

        const player = (key, p, i) => `
          <div class="pl ${p.dead ? "dead" : ""}">
            <div class="coin"></div>
            <div class="badge"><img src="${p.portrait}" alt=""></div>
            <div class="hb"><div class="contents"><div class="fill ${p.hp > 0 && p.hp < 0.3 ? "low" : ""}" style="height:${Math.round(p.hp * 100)}%"></div></div><div class="border"></div></div>
            ${p.dead ? `<div class="respawn">${p.dead}</div>` : ""}
            <div class="souls">${p.souls.toFixed(1)}<small>k</small></div>
            <div class="ult ${p.ult === "ready" ? "ready" : ""}"><div class="bg"></div><img src="assets/game/hud__top_bar__icon_ultimate${p.ult === "ready" ? "" : "_off"}.svg" alt=""></div>
            ${opts.aliasOnPortrait ? `<div class="tx-alias">${esc(S.teams[key].alias[i] || p.name)}</div>` : ""}
          </div>`;
        const fallback = () => document.querySelectorAll("[data-fallback]").forEach((img) => img.addEventListener("error", () => {
          const span = img.parentElement; span.classList.add("mono"); span.textContent = img.dataset.fallback;
        }, { once: true }));
        // Text marked data-fit="max,min" shrinks to its box before it is cut (Panorama: text-overflow: shrink).
        const fit = () => document.querySelectorAll("[data-fit]").forEach((el) => {
          const [max, min] = el.dataset.fit.split(",").map(Number);
          el.style.fontSize = max + "px"; let size = max;
          while (el.scrollWidth > el.clientWidth + 0.5 && size > min) el.style.fontSize = --size + "px";
        });
        const render = () => {
          const a = S.teams.t1.src, b = S.teams.t2.src;
          document.getElementById("band").innerHTML = opts.renderBand(S, h);
          document.getElementById("topbar").innerHTML = `
            <div class="team t1">${a.players.map((p, i) => player("t1", p, i)).join("")}</div>
            <div class="team t2">${b.players.map((p, i) => player("t2", p, i)).join("")}</div>
            <div class="clock"><span>${esc(S.clock)}</span></div>
            <div class="networth"><div class="score t1"><b>${k(a.souls)}<small>k</small></b><i></i></div><div class="score t2"><i></i><b>${k(b.souls)}<small>k</small></b></div></div>
            ${opts.renderUnderClock ? opts.renderUnderClock(S, h) : ""}`;
          const sheet = document.getElementById("objsheet");
          if (sheet && opts.objSheet) sheet.innerHTML = h.objSheet(opts.objSheet);
          fit(); if (document.fonts) document.fonts.ready.then(fit);
          fallback();
        };

        // ---- Editor mock (design 11's, plus the v2 broadcast fields) ----
        const ed = document.getElementById("ed"), back = document.getElementById("edBack"), openBtn = document.getElementById("openEd");
        const heroOptions = (sel) => `<option value="">None</option>` + Object.entries(HERO_NAMES).map(([id, n]) => `<option value="${id}" ${id === sel ? "selected" : ""}>${esc(n)}</option>`).join("");
        const teamCol = (key, label) => {
          const t = S.teams[key], max = Math.ceil(S.bestOf / 2);
          return `<fieldset class="col ${key}"><legend>${label}</legend>
            <div class="trip">
              <label>Team name<input data-k="${key}.name" value="${esc(t.name)}" maxlength="28" placeholder="${key === "t1" ? "e.g. Night Owls" : "e.g. Brass Saints"}"></label>
              <label>Tag<input data-k="${key}.tag" value="${esc(t.tag)}" maxlength="4" placeholder="${key === "t1" ? "NOW" : "BRS"}"></label>
              <label>Series<input data-k="${key}.series" type="number" min="0" max="${max}" value="${t.series}"></label>
            </div>
            <label>Logo URL (optional, http/https)<input data-k="${key}.logo" value="${esc(t.logo)}" placeholder="https://…/logo.png" inputmode="url"></label>
            <div class="err" id="err-${key}" aria-live="polite"></div>
            <div class="pair">
              <label>Ban 1<select data-k="${key}.ban0">${heroOptions(t.bans[0])}</select></label>
              <label>Ban 2<select data-k="${key}.ban1">${heroOptions(t.bans[1])}</select></label>
            </div>
            <div class="pair">${t.src.players.map((p, i) => `<label>${esc(HERO_NAMES[p.heroId] || p.heroId)} player<input data-k="${key}.alias${i}" value="${esc(t.alias[i])}" maxlength="24" placeholder="alias (optional)"></label>`).join("")}</div>
          </fieldset>`;
        };
        const drawEditor = () => {
          ed.innerHTML = `<h2 id="edTitle">Tournament setup</h2>
            <p class="sub">Mock of the in-game editor in the Escape menu. Edits show on the top bar at once.</p>
            <fieldset><legend>Match</legend><div class="row">
              <label>Event title<input data-k="event" value="${esc(S.event)}" maxlength="40" placeholder="e.g. Community Cup Season 2"></label>
              <label>Stage<input data-k="stage" value="${esc(S.stage)}" maxlength="28" placeholder="e.g. Grand Final"></label>
              <label>Format<select data-k="bestOf">${[1, 3, 5, 7].map((n) => `<option value="${n}" ${n === S.bestOf ? "selected" : ""}>Bo${n}</option>`).join("")}</select></label>
            </div></fieldset>
            <fieldset><legend>Broadcast</legend><div class="pair">
              <label>Organiser name (centre wordmark)<input data-k="org.name" value="${esc(S.org.name)}" maxlength="24" placeholder="e.g. Community Cup"></label>
              <label>Organiser logo URL (replaces the wordmark)<input data-k="org.logo" value="${esc(S.org.logo)}" placeholder="https://…/logo.png" inputmode="url"></label>
            </div>
            <div class="err" id="err-org" aria-live="polite"></div>
            ${opts.infoCard ? `<div class="quad">
              <label>Info card title<input data-k="info.title" value="${esc(S.info.title)}" maxlength="24" placeholder="e.g. Prize pool"></label>
              <label>Value<input data-k="info.value" value="${esc(S.info.value)}" maxlength="16" placeholder="e.g. $2,130"></label>
              <label>Caption<input data-k="info.caption" value="${esc(S.info.caption)}" maxlength="32" placeholder="e.g. Donate to increase"></label>
            </div><p class="hint">Leave the title empty to hide the card.</p>` : ""}
            ${opts.leadGraph ? `<div class="pair">
              <label>Soul lead graph (a pin every 5:00 of game time)<select data-k="graph.show">${[[0, "Off"], [15, "At each 5:00 mark, for 15 s"], [30, "At each 5:00 mark, for 30 s"], [60, "At each 5:00 mark, for 60 s"], [-1, "Always"]].map(([n, l]) => `<option value="${n}" ${n === S.graph.show ? "selected" : ""}>${l}</option>`).join("")}</select></label>
            </div>` : ""}
            </fieldset>
            <div class="cols">${teamCol("t1", "Amber side (left)")}${teamCol("t2", "Sapphire side (right)")}</div>
            <div class="btns"><button type="button" id="edReset">Reset</button><button type="button" class="primary" id="edClose">Done</button></div>`;
          document.getElementById("edClose").onclick = closeEd;
          document.getElementById("edReset").onclick = () => { S = fresh(); drawEditor(); render(); };
        };
        ed.addEventListener("input", (e) => {
          const key = e.target.dataset.k; if (!key) return;
          const v = e.target.value;
          if (key === "event" || key === "stage") S[key] = v;
          else if (key === "bestOf") { S.bestOf = +v; const m = Math.ceil(S.bestOf / 2); for (const t of Object.values(S.teams)) t.series = Math.min(t.series, m); drawEditor(); }
          else if (key.startsWith("org.") || key.startsWith("info.") || key.startsWith("graph.")) {
            const [o, f] = key.split("."); S[o][f] = o === "graph" ? +v : v;
            if (key === "org.logo") document.getElementById("err-org").textContent = cleanUrl(v) === null ? "Not used: needs a plain http(s) address." : "";
          } else {
            const [tk, f] = key.split("."), t = S.teams[tk];
            if (f === "name" || f === "tag") t[f] = f === "tag" ? v.toUpperCase() : v;
            else if (f === "series") t.series = Math.max(0, Math.min(Math.ceil(S.bestOf / 2), Math.floor(+v || 0)));
            else if (f === "logo") { t.logo = v; document.getElementById("err-" + tk).textContent = cleanUrl(v) === null ? "Not used: needs a plain http(s) address." : ""; }
            else if (f.startsWith("ban")) t.bans[+f.slice(3)] = v;
            else if (f.startsWith("alias")) t.alias[+f.slice(5)] = v;
          }
          render();
        });
        let lastFocus = null;
        const openEd = () => { lastFocus = document.activeElement; drawEditor(); back.classList.add("on"); ed.querySelector("input").focus(); };
        const closeEd = () => { back.classList.remove("on"); (lastFocus && lastFocus !== document.body ? lastFocus : openBtn).focus(); };
        openBtn.onclick = openEd;
        back.addEventListener("click", (e) => { if (e.target === back) closeEd(); });
        document.addEventListener("keydown", (e) => {
          if (e.key !== "Escape") return;
          if (back.classList.contains("on")) closeEd(); else openEd();
        });
        if (/[?&]long=1\b/.test(location.search)) {
          S.teams.t1.alias[1] = "MothmanTheUnstoppable";
          S.teams.t2.alias[4] = "Pocketwatch_Gaming";
          S.event = "Deadlock Community Cup Season 2 Finals";
        }
        if (/[?&]editor=1\b/.test(location.search)) openEd();
        render();
      });
    },
  };
  window.V2 = V2;
})();
