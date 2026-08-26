"use strict";

var path = require("node:path");
var oracle = require("../../scripts/profile-stats-community-runtime-oracle");
var composition = require("../../scripts/profile-stats-community-composition");
var repositoryDir = path.resolve(__dirname, "..", "..");

oracle.registerProfileStatsCommunityRuntimeTests({
  sourcePath: path.resolve(__dirname, "..", "panorama", "scripts", "profile_stats_community.js"),
  source: composition.composeProfileStatsCommunitySources(repositoryDir).runtime
});
