(function () {
  "use strict";
  // World layouts are engine-created dialogs: startup follows the live-proven
  // include pattern, not an unproven dialog root onload callback.
  // Include order (layout/unit_status_overlay_v2.xml): world_settings, bridge, renderer, timers_world, world_boot.
  // Each earlier script attaches one global; name any that is missing once, before starting. HPColorsV3Timers is not
  // required: the renderer guards it (notifyTimers) and test fixtures start the renderer without timers_world.
  var needed = ["HPColorsV3WorldSettings", "HPColorsV3Bridge", "HPColorsV3Renderer"];
  for (var i = 0; i < needed.length; i++) {
    if (!$[needed[i]]) throw new Error("world_boot: $." + needed[i] + " is missing; include order is world_settings, bridge, renderer, timers_world, world_boot");
  }
  $.HPColorsV3Renderer.start();
})();
