"use strict";

var path = require("node:path");
var oracle = require("../../scripts/profile-stats-community-runtime-oracle");
var composition = require("../../scripts/profile-stats-community-composition");
var repositoryDir = path.resolve(__dirname, "..", "..");
var runtimePath = process.env.SHOWRANK_BAREBONES_RUNTIME;
var runtimeAdapter = {
  sourcePath: runtimePath || path.resolve(__dirname, "..", "panorama", "scripts", "showrank_barebones.js"),
  contextPanelType: "CitadelProfilePage"
};

if (!runtimePath) {
  runtimeAdapter.source = composition.composeBarebonesSources(repositoryDir).runtime;
}

oracle.registerProfileStatsCommunityRuntimeTests(runtimeAdapter);
