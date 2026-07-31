(function () {
  "use strict";

  if (typeof GameUI === "undefined" || !GameUI.CustomUIConfig) {
    return;
  }

  var config;
  try {
    config = GameUI.CustomUIConfig();
  } catch (error) {
    return;
  }
  if (!config || !config.QolLite || !config.QolLite.Runtime) {
    return;
  }

  var qolLite = config.QolLite;
  var runtime = qolLite.Runtime;
  var owner = "qollite_showrank";
  var surfaceId = "QolLiteShowRankSurface";
  var surfaceClass = "QolLiteShowRank";
  var rankNames = ["rank", "rank_badge", "player_rank"];
  var anchorIds = [
    "ProfileBadgeBackground",
    "ProfileCard",
    "AvatarImage",
    "UserName",
    "PlayerContainer",
    "MenuOptionsContainer",
    "TeamEntries",
    "Teams",
    "HeroBadge"
  ];
  var active = false;
  var root = null;
  var surface = null;

  function find(id, scope) {
    try {
      return runtime.find(id, scope);
    } catch (error) {
      return null;
    }
  }

  function contextPanel() {
    if (typeof $ === "undefined" || !$.GetContextPanel) {
      return null;
    }
    try {
      return $.GetContextPanel();
    } catch (error) {
      return null;
    }
  }

  function readValue(panel, name) {
    if (!panel) {
      return undefined;
    }

    var missing = "__qollite_missing_rank_value__";
    try {
      if (typeof panel.GetAttributeString === "function") {
        var attribute = panel.GetAttributeString(name, missing);
        if (attribute !== missing) {
          return attribute;
        }
      }
    } catch (error) {
      // Stock panels can be recreated while reading their attributes.
    }

    try {
      if (typeof panel[name] !== "undefined") {
        return panel[name];
      }
    } catch (error) {
      // Some panel properties are unavailable in all Panorama contexts.
    }

    return undefined;
  }

  function normalizeRank(value) {
    if (typeof value === "number") {
      return isFinite(value) && value >= 0 ? String(value) : null;
    }
    if (typeof value !== "string") {
      return null;
    }

    var trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    var number = Number(trimmed);
    return isFinite(number) && number >= 0 ? String(number) : null;
  }

  function rankFor(panel) {
    for (var index = 0; index < rankNames.length; index += 1) {
      var rank = normalizeRank(readValue(panel, rankNames[index]));
      if (rank !== null) {
        return rank;
      }
    }
    return null;
  }

  function findRankSource() {
    var rank = rankFor(root);
    if (rank !== null) {
      return { panel: root, rank: rank };
    }

    for (var index = 0; index < anchorIds.length; index += 1) {
      var anchor = find(anchorIds[index], root);
      rank = rankFor(anchor);
      if (rank !== null) {
        return { panel: anchor, rank: rank };
      }
    }
    return null;
  }

  function removeSurface() {
    if (!surface) {
      return;
    }
    try {
      runtime.setClass(surface, surfaceClass, false);
      surface.DeleteAsync(0);
    } catch (error) {
      // The parent context may already have been removed.
    }
    surface = null;
  }

  function ensureSurface(parent) {
    if (surface) {
      try {
        if (typeof surface.GetParent !== "function" || surface.GetParent() === parent) {
          return surface;
        }
      } catch (error) {}
      removeSurface();
    }

    surface = find(surfaceId, root);
    if (surface) {
      try {
        if (typeof surface.GetParent !== "function" || surface.GetParent() === parent) {
          return surface;
        }
      } catch (error) {}
      removeSurface();
    }

    try {
      surface = $.CreatePanel("Label", parent, surfaceId);
      runtime.setClass(surface, surfaceClass, true);
    } catch (error) {
      surface = null;
    }
    return surface;
  }

  function collapseSurface() {
    if (!surface) {
      return;
    }
    try {
      surface.text = "";
      surface.visible = false;
    } catch (error) {
      surface = null;
    }
  }

  function init() {
    if (active || surface) {
      destroy();
    }

    root = contextPanel();
    if (!root) {
      return;
    }
    active = true;
    refresh();
  }

  function refresh() {
    if (!active || !root) {
      return;
    }

    var source = findRankSource();
    if (!source) {
      collapseSurface();
      return;
    }

    var label = ensureSurface(source.panel);
    if (!label) {
      return;
    }
    try {
      if (label.text !== source.rank) {
        label.text = source.rank;
      }
      label.visible = true;
    } catch (error) {
      surface = null;
    }
  }

  function destroy() {
    active = false;
    removeSurface();
    root = null;
  }

  var feature = {
    init: init,
    refresh: refresh,
    destroy: destroy
  };

  qolLite.showrank = feature;
  runtime.register("showrank", feature);
}());
