// One mock match shown by every design, so the five mockups compare like for like.
(() => {
  "use strict";
  const A = "assets/game/";
  const hero = (id) => `${A}heroes/${id}_card_psd.png`;
  const player = (heroId, name, hp, ult, dead, souls) => ({ heroId, name, hp, ult, dead, souls, portrait: hero(heroId) });

  const OH = {
    asset: (name) => A + name,
    match: {
      event: "Deadlock Community Cup",
      stage: "Grand Final",
      game: 3,
      bestOf: 3,
      clock: "27:41",
      midboss: "1:52",
      caster: "Cast by the community",
    },
    teams: {
      amber: {
        side: "left", name: "Night Owls", tag: "NOW", series: 1, kills: 21, souls: 48210,
        walkers: 3, shrines: 2, rejuv: 1, logo: A + "hud__core__team1_icon_png.png",
        sigil: A + "hud__core__icon_team1_psd.png", patron: "The Hidden King",
        players: [
          player("haze", "Kestrel", 0.82, "ready", 0, 9.1),
          player("inferno", "Moth", 0.45, 34, 0, 8.6),
          player("lash", "Doyle", 0, 61, 12, 7.9),
          player("kelvin", "Frostbyte", 1, "ready", 0, 7.2),
          player("wraith", "Vesper", 0.67, 8, 0, 8.4),
          player("bull", "Ironclad", 0.91, "ready", 0, 7.0),
        ],
      },
      sapphire: {
        side: "right", name: "Brass Saints", tag: "BRS", series: 1, kills: 17, souls: 44930,
        walkers: 2, shrines: 2, rejuv: 0, logo: A + "hud__core__team2_icon_png.png",
        sigil: A + "hud__core__icon_team2_psd.png", patron: "The Archmother",
        players: [
          player("gigawatt", "Volt", 0.58, "ready", 0, 8.2),
          player("digger", "Mole", 0.73, 51, 0, 7.4),
          player("spectre", "Geist", 0.22, 19, 0, 7.8),
          player("hornet", "Talon", 0, 40, 21, 7.6),
          player("synth", "Pocketwatch", 0.88, "ready", 0, 7.1),
          player("sumo", "Tidal", 1, 15, 0, 6.8),
        ],
      },
    },
    souls: (n) => (n / 1000).toFixed(1) + "k",
    lead() {
      const d = this.teams.amber.souls - this.teams.sapphire.souls;
      return { team: d >= 0 ? "amber" : "sapphire", value: Math.abs(d) };
    },
    // Soul-lead history for designs that draw a trend line (amber positive), one point a minute.
    leadHistory: [0, 0.2, 0.5, -0.4, -1.1, -0.6, 0.3, 1.2, 0.9, 1.8, 2.4, 1.6, 0.8, -0.2, -1.4, -0.9, 0.6, 1.9, 2.7, 2.1, 3.0, 3.6, 2.9, 2.2, 2.8, 3.1, 3.3],
    // Scales the 1920x1080 stage to the window; screenshots use a 1920x1080 viewport (scale 1).
    fit() {
      const stage = document.querySelector(".stage");
      if (!stage) return;
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      stage.style.transform = `scale(${s})`;
    },
    mount(render) {
      const go = () => {
        render(OH);
        OH.fit();
        window.addEventListener("resize", () => OH.fit());
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
      else go();
    },
  };
  // ?long=1 swaps in long team names to check that a layout survives them.
  if (/[?&]long=1\b/.test(window.location.search)) {
    OH.teams.amber.name = "The Midnight Owls Collective";
    OH.teams.sapphire.name = "Bridgeport Brass Saints";
  }
  window.OH = OH;
})();
