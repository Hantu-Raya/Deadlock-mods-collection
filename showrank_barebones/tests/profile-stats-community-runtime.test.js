"use strict";

var path = require("node:path");
var oracle = require("../../scripts/profile-stats-community-runtime-oracle");

oracle.registerProfileStatsCommunityRuntimeTests({
  sourcePath: process.env.SHOWRANK_BAREBONES_RUNTIME || path.resolve(__dirname, "..", "panorama", "scripts", "showrank_barebones.js"),
  contextPanelType: "CitadelProfilePage"
});
