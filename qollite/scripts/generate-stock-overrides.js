"use strict";

(() => {

  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const path = require("node:path");

  const root = path.resolve(__dirname, "..");
  const manifestPath = path.join(root, "stock", "manifest.json");

  function fail(message) {
    throw new Error(`generate-stock-overrides: ${message}`);
  }

  function readOutputRoot() {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--output" || !args[1]) {
      fail("usage: node qollite/scripts/generate-stock-overrides.js --output <stageSrc>");
    }
    return path.resolve(args[1]);
  }

  function count(text, needle) {
    return text.split(needle).length - 1;
  }

  function requireOne(text, anchor, name) {
    const matches = count(text, anchor);
    if (matches !== 1) {
      fail(`${name} anchor must match exactly once; found ${matches}`);
    }
  }

  function includeLines(kind, assets) {
    return assets.map((asset) => `\t\t<include src="s2r://panorama/${kind}/qollite_${asset}.${kind === "scripts" ? "js" : "css"}" />`).join("\n");
  }

  function inject(layout, entry) {
    const styleAnchor = "\t</styles>";
    requireOne(layout, styleAnchor, `${entry.outputPath} styles`);

    let result = layout.replace(
      styleAnchor,
      `${includeLines("styles", entry.styles)}\n${styleAnchor}`
    );
    const scripts = includeLines("scripts", entry.scripts.concat(["bootstrap"]));
    const scriptsAnchor = "\t</scripts>";
    const scriptAnchorCount = count(result, scriptsAnchor);

    if (scriptAnchorCount === 0) {
      requireOne(result, styleAnchor, `${entry.outputPath} generated scripts`);
      return result.replace(styleAnchor, `${styleAnchor}\n\t<scripts>\n${scripts}\n\t</scripts>`);
    }
    if (scriptAnchorCount !== 1) {
      fail(`${entry.outputPath} scripts anchor must match exactly once; found ${scriptAnchorCount}`);
    }
    return result.replace(scriptsAnchor, `${scripts}\n${scriptsAnchor}`);
  }

  function hash(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
  }

  function main() {
    const outputRoot = readOutputRoot();
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.commit !== "3573cbb746581eccc7752fc2e00c21d4447d72bb") {
      fail("manifest commit is not the pinned SteamTracking baseline");
    }
    if (!Array.isArray(manifest.layouts) || manifest.layouts.length === 0) {
      fail("manifest has no layouts");
    }

    const destinations = new Set();
    for (const entry of manifest.layouts) {
      if (!entry.path || !entry.outputPath || !entry.sha256) {
        fail("manifest layout is missing path, outputPath, or sha256");
      }
      if (destinations.has(entry.outputPath)) {
        fail(`duplicate output path ${entry.outputPath}`);
      }
      destinations.add(entry.outputPath);
      if (!Array.isArray(entry.scripts) || !Array.isArray(entry.styles)) {
        fail(`${entry.outputPath} assets must be arrays`);
      }
      if (entry.scripts.some((asset) => !/^[a-z0-9_]+$/.test(asset)) || entry.styles.some((asset) => !/^[a-z0-9_]+$/.test(asset))) {
        fail(`${entry.outputPath} has an invalid QOL Lite asset name`);
      }

      const sourcePath = path.join(root, "stock", "layout", entry.path);
      const stock = fs.readFileSync(sourcePath, "utf8");
      if (hash(stock) !== entry.sha256) {
        fail(`${entry.outputPath} does not match its pinned stock hash`);
      }
      const generated = inject(stock, entry);
      const destination = path.join(outputRoot, "panorama", "layout", entry.outputPath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, generated, "utf8");
    }
  }

  main();
})();
