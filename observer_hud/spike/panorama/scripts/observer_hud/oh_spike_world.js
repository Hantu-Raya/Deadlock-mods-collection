// Throwaway spike for observer_hud/PLAN.md phase 1b: does a script in
// citadel_status_effect.xml run once per healthbar, can it tell hero bars,
// and do its relay messages reach the HUD host (oh_spike.js)?
(() => {
  "use strict";

  const TAG = "[OH-SPIKE-W]";
  const RELAY_LAYOUT = "file://{resources}/layout/observer_hud/spike_world_relay.xml";
  const RELAY_ATTR = "oh_spike_message";
  const context = $.GetContextPanel();
  const valid = (panel) => { try { return !!panel && panel.IsValid(); } catch (e) { return false; } };

  // Counters shared across contexts, if CustomUIConfig is shared (the spike also tests that).
  let shared = null;
  try { shared = GameUI.CustomUIConfig(); } catch (e) { shared = null; }
  const stats = shared ? (shared.ohSpikeWorld = shared.ohSpikeWorld || { total: 0, hero: 0, other: 0, hud: 0, logged: 0 }) : { total: 0, hero: 0, other: 0, hud: 0, logged: 0 };
  const instance = ++stats.total;

  // At layout load the panel is not yet in its final place (its parent is the dialog) and the
  // unit class is not set yet, so detection runs later and backs off on non-hero bars (DLF: 1-16 s).
  let hero = null;
  let dialog = null;
  let checks = 0;
  const detect = () => {
    const chain = [];
    let panel = context;
    let top = "";
    hero = null;
    dialog = null;
    for (let depth = 0; depth < 40 && valid(panel); depth++) {
      if (!hero && panel.BHasClass("CLASS_PLAYER")) hero = panel;
      if (!dialog && (panel.paneltype || "") === "ClientUIDialogPanel") dialog = panel;
      if (depth < 9) chain.push(`${panel.paneltype}#${panel.id || ""}`);
      top = `${panel.paneltype}#${panel.id || ""}`;
      panel = panel.GetParent();
    }
    return { chain, top };
  };

  const waitForHero = () => {
    if (!valid(context)) return;
    checks++;
    const { chain, top } = detect();
    if (top === "Panel#CitadelHudRoot") return; // the HUD's own status list: never a world bar
    if (checks === 2 && !hero && Math.random() < 0.1)
      $.Msg(`${TAG} non-hero sample: chain=${chain.join(" > ")}`);
    if (hero && dialog) {
      $.Msg(`${TAG} hero bar after ${checks} checks: chain=${chain.join(" > ")}`);
      return start();
    }
    $.Schedule(Math.min(16, 0.5 * Math.pow(2, checks - 1)), waitForHero);
  };

  let root = null;
  let relay = null;
  let lastSig = "";
  let seq = 0;
  let name = "";

  const readName = () => {
    const label = dialog.FindChildTraverse("name");
    const text = valid(label) ? label.text : "";
    return typeof text === "string" && text !== "{s:name}" ? text.trim().slice(0, 64) : "";
  };

  const send = (payload) => {
    if (!valid(relay)) {
      relay = $.CreatePanel("Panel", root, `OHSpikeWorldRelay${instance}`);
      if (!relay.BLoadLayout(RELAY_LAYOUT, false, false)) {
        relay.DeleteAsync(0);
        relay = null;
        $.Msg(`${TAG} inst ${instance} relay layout failed`);
        return;
      }
    }
    relay.SetAttributeString(RELAY_ATTR, JSON.stringify(payload));
    $.DispatchEvent("Activated", relay, "mouse");
  };

  const tick = () => {
    if (!valid(context) || !valid(dialog)) return;
    try {
      name = readName() || name;
      const list = context.FindChild("StatusEffectContainer");
      const kids = valid(list) ? list.Children() : [];
      const ids = kids.slice(0, 4).map((child) => child.id || "?");
      const stunned = kids.some((child) => child.BHasClass("stunned"));
      const sig = `${name}|${kids.length}|${ids.join(",")}|${stunned}`;
      if (sig !== lastSig) {
        lastSig = sig;
        send({ magic_word: "OH_SPIKE_WORLD", instance, seq: ++seq, at: Date.now(), name, n: kids.length, ids, stunned });
      }
    } catch (e) {
      $.Msg(`${TAG} inst ${instance} tick error ${e && e.message ? e.message : e}`);
    }
    $.Schedule(0.5, tick);
  };
  const start = () => {
    root = dialog.GetParent();
    $.Schedule(0.1, tick);
  };
  $.Schedule(0.5, waitForHero);
})();
