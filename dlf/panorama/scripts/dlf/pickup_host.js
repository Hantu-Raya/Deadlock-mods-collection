// World-healthbar host for the DLF pickup rings. Replaces HPv2's renderer as the provider of
// the timer's config hooks and as this context's single ClientUI_FireOutput listener, which also
// hands the top bar's DLF_DEBUFF_CONFIG to dlf_debuff_world.js.
// Load order (unit_status_overlay_v2.xml): pickup_config, pickup_host, pickup_bridge, pickup_timers,
// dlf_debuff_world.
(() => {
  "use strict";

  const context = $.GetContextPanel();
  if (typeof context.DLFPickupHostStop === "function") context.DLFPickupHostStop();

  const config = $.DLFPickupConfig;
  if (!config) throw new Error("[DLF-PU] pickup_config.js must load before pickup_host.js");
  const noop = () => {};

  // Static spectator config: it never changes, so subscriptions only return an unsubscribe.
  context.HPV2GetNormalizedConfig = () => config;
  context.HPV2OnConfigChanged = () => noop;
  // The world ultimate overlay is off (ultimateTimerEnabled false); this is never painted.
  context.HPV2GetUltimateProgressColor = () => "#FFFFFF";

  // Cheap substring routing: only DLF timer traffic (or escaped JSON) reaches the timer,
  // which validates every message fully; debuff config goes to the debuff sampler.
  const onEvent = (payload) => {
    let raw;
    try {
      raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    } catch (e) {
      return;
    }
    if (!raw) return;
    if (raw.indexOf("DLF_DEBUFF_CONFIG") >= 0) {
      const debuffHook = context.DLFOnDebuffConfig;
      if (typeof debuffHook === "function") {
        try { debuffHook(raw); } catch (e) {}
      }
      return;
    }
    const hook = context.HPV2OnPickupMessage;
    if (typeof hook !== "function") return;
    if (raw.indexOf("DLF_PICKUP_") < 0 && raw.indexOf("DLF_ULTIMATE_SNAPSHOT") < 0 &&
        raw.indexOf("\\") < 0) return;
    try {
      hook(raw);
    } catch (e) {
      // The timer logs its own receive errors.
    }
  };

  let listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", onEvent);
  context.DLFPickupHostStop = () => {
    if (listener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); } catch (e) {}
      listener = null;
    }
  };
})();
