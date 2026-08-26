"use strict";

var path = require("node:path");
var oracle = require("../../scripts/profile-stats-community-runtime-oracle");

oracle.registerProfileStatsCommunityRuntimeTests({
  sourcePath: path.resolve(__dirname, "..", "panorama", "scripts", "profile_stats_community.js")
});
