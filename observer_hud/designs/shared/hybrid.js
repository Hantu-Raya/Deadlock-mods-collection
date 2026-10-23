// Round 2 helpers shared by designs 6-10 (markup for shared/hybrid.css).
(() => {
  "use strict";
  const OH = window.OH;
  const pct = (v) => Math.round(v * 100);

  // The ultimate sits on the portrait corner, so a cooldown number never reads as part of the
  // next card's name (round-2 review: "34 Doyle").
  OH.card = (p, opts = {}) => `
    <div class="hc ${opts.arch ? "arch" : ""} ${p.dead ? "dead" : ""}">
      <div class="pic"><img src="${p.portrait}" alt="">${p.dead ? `<div class="over">${p.dead}</div>` : ""}
        ${p.ult === "ready" ? `<span class="ul ready"><i></i></span>` : `<span class="ul">${p.ult}</span>`}</div>
      <div class="hp"><b class="${p.hp > 0 && p.hp < 0.3 ? "low" : ""}" style="width:${pct(p.hp)}%"></b></div>
      <div class="row"><span class="nm">${p.name}</span></div>
    </div>`;
  OH.cards = (key, opts) => OH.teams[key].players.map((p) => OH.card(p, opts)).join("");
  // Default logo slot is a monogram of the team tag; an organiser logo (team.customLogo) replaces it.
  // The stock patron emblems read as random icons (RzR feedback on design 8).
  OH.logo = (key) => {
    const t = OH.teams[key];
    return t.customLogo ? `<span class="lg"><img src="${t.customLogo}" alt=""></span>` : `<span class="lg mono">${t.tag}</span>`;
  };
  OH.leadHtml = () => {
    const l = OH.lead();
    return `<span class="lead-${l.team}">${OH.teams[l.team].tag} +${OH.souls(l.value)}</span>`;
  };
  OH.trend = (max = 4) => OH.leadHistory.map((v) => {
    const h = Math.min(50, (Math.abs(v) / max) * 50).toFixed(1);
    return `<i><b class="${v >= 0 ? "up" : "dn"}" style="height:${h}%"></b></i>`;
  }).join("");
  OH.share = () => OH.teams.amber.souls / (OH.teams.amber.souls + OH.teams.sapphire.souls);

  // Shrinks a label until it fits its box, down to a floor, then lets ellipsis take over.
  // Panorama's text-overflow: shrink does the same in game. Measures after the fonts load.
  OH.fitText = (selector, floor = 13) => {
    const run = () => document.querySelectorAll(selector).forEach((el) => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > floor) {
        size -= 1;
        el.style.fontSize = size + "px";
      }
    });
    run();
    if (document.fonts) document.fonts.ready.then(run);
  };
})();
