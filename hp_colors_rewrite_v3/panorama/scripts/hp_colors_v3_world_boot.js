(function () {
  "use strict";
  // World layouts are engine-created dialogs: startup follows the live-proven
  // include pattern, not an unproven dialog root onload callback.
  // Include order (layout/unit_status_overlay_v2.xml): world_settings, bridge, renderer, timers_world, world_boot.
  // Each earlier script attaches one global; name any that is missing once, before starting. HPColorsV3Timers is not
  // required: it subscribes to the renderer, the renderer does not call it (test fixtures start the renderer without timers_world).
  var missing = !$.HPColorsV3WorldSettings ? "HPColorsV3WorldSettings" : !$.HPColorsV3Bridge ? "HPColorsV3Bridge" : !$.HPColorsV3Renderer ? "HPColorsV3Renderer" : "";
  if (missing) throw new Error("world_boot: $." + missing + " is missing; include order is world_settings, bridge, renderer, timers_world, world_boot");
  $.HPColorsV3Renderer.start();
})();
