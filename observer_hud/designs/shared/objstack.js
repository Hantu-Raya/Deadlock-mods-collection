// Designs 19 and 20 (2026-10-23): the stock objective health (#objectives_health_friendly) under the
// timers in both looks, and the soul lead graph under it. Rev 2: while the rift HUD and an objective bar
// both show, the graph waits (it would sit about 380 px down) and then shows its full time once either
// clears; with "Always" it simply comes back.
// ObjStack.mount(stage, { band: () => px }) adds the stock panel and wires [data-oh] / [data-lay] buttons;
// the page's .lead reads --lead-top (px under the top bar) and hides with .gr-held.
window.ObjStack = (() => {
  const panel = () => {
    const bar = (pct, lost) => `<div class="HealthBars"><div class="healthbar_background"><i class="fill" style="width:${pct}%"></i><i class="lost" style="left:${pct}%;width:${lost}%"></i></div></div>`;
    const walker = (key, pct) => `<div class="objective ${key}"><div class="top"><span class="entityImage"></span></div>${bar(pct, 3)}</div>`;
    return `<div class="ohp" id="ohp" aria-label="Stock objective health"><div class="teams">${walker("t1", 21)}${walker("t2", 64)}</div>
      <div class="neutral"><div class="objective boss"><div class="top"><span class="name">Mid-Boss</span></div>${bar(78, 2)}</div></div></div>
      <div class="ohp-held" id="ohpHeld">Soul lead graph waits: shows once the rift HUD or this bar clears</div>`;
  };
  const controls = () => `<span>Objective (stock)</span><div class="seg-btns"><button type="button" data-oh="oh-amber" aria-pressed="true">Amber walker</button><button type="button" data-oh="oh-both" aria-pressed="false">Both walkers</button><button type="button" data-oh="oh-mid" aria-pressed="false">Mid-boss</button><button type="button" data-oh="" aria-pressed="false">None</button></div><span></span>
    <span>Layout</span><div class="seg-btns"><button type="button" data-lay="stack" aria-pressed="true">Under the timers (proposed)</button><button type="button" data-lay="stock" aria-pressed="false">Stock spot (now)</button></div><span></span>`;
  const mount = (stage, opts) => {
    stage.insertAdjacentHTML("beforeend", panel());
    const form = stage.querySelector(".ctl");
    form.insertAdjacentHTML("beforeend", controls());
    const ohp = document.getElementById("ohp"), held = document.getElementById("ohpHeld");
    let layout = "stack";
    // Screen geometry: the top bar starts at band + 8; the chips end 126 px under it; the rift HUD starts
    // at 130 (open: scaled 0.7, 80 px; in range / secured: 114 px). Stock objective spot: HUD y 160 for
    // walkers, 140 for the mid-boss (neutral row, margin 40).
    const place = () => {
      const barTop = opts.band() + 8, has = (c) => stage.classList.contains(c);
      const kothShown = has("k-cap") || has("k-range") || has("k-done");
      const koth = has("k-cap") ? 130 + 0.7 * 114 : kothShown ? 130 + 114 : 126;
      const shown = ["oh-amber", "oh-both", "oh-mid"].some(has), mid = has("oh-mid");
      const objH = mid ? 70 : 71;
      const top = layout === "stock" ? (mid ? 140 : 160) : barTop + koth + 4;
      ohp.style.top = `${top - (mid ? 40 : 0)}px`;
      const stacked = layout === "stack" && shown;
      const leadTop = stacked ? top + objH + 4 - barTop : Math.max(130, koth + 4);
      stage.style.setProperty("--lead-top", `${leadTop}px`);
      stage.classList.toggle("oh-on", stacked);
      stage.classList.toggle("gr-held", stacked && kothShown);
      held.style.top = `${barTop + leadTop}px`;
    };
    const ohBtns = form.querySelectorAll("[data-oh]");
    ohBtns.forEach((btn) => btn.addEventListener("click", () => {
      for (const cls of ["oh-amber", "oh-both", "oh-mid"]) stage.classList.toggle(cls, cls === btn.dataset.oh);
      ohBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    }));
    const layBtns = form.querySelectorAll("[data-lay]");
    layBtns.forEach((btn) => btn.addEventListener("click", () => {
      layout = btn.dataset.lay; layBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    }));
    form.addEventListener("click", () => place());
    form.addEventListener("input", () => place());
    stage.classList.add("oh-amber");
    const q = (name) => (new RegExp(`[?&]${name}=([\\w.-]+)`).exec(location.search) || [])[1];
    if (q("oh")) form.querySelector(`[data-oh="${q("oh") === "none" ? "" : "oh-" + q("oh")}"]`).click();
    if (q("layout") === "stock") form.querySelector('[data-lay="stock"]').click();
    place();
    return { place };
  };
  return { mount };
})();
