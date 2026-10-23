// Renders designs/<id>.html to designs/shots/<id>.png at 1920x1080 and fails on page errors.
//   node observer_hud/tools/render_shots.mjs d6-brass-slate d7-marquee-lite ...
//   node observer_hud/tools/render_shots.mjs --long d6-brass-slate   (long team names, writes <id>-long.png)
// Needs playwright-core (PLAYWRIGHT_CORE=<path to package>, default .scratch/yabuddy_tut/node_modules)
// and the Playwright Chromium build under %LOCALAPPDATA%/ms-playwright.
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const designs = path.join(repo, "observer_hud", "designs");
const pkg = process.env.PLAYWRIGHT_CORE || path.join(repo, ".scratch", "yabuddy_tut", "node_modules", "playwright-core");
const { chromium } = createRequire(import.meta.url)(pkg);

const pw = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
const build = existsSync(pw) ? readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : null;
const exe = build && path.join(pw, build, "chrome-win64", "chrome.exe");
if (!exe || !existsSync(exe)) throw new Error("Playwright Chromium not found under " + pw);

const args = process.argv.slice(2);
const long = args.includes("--long");
const ids = args.filter((a) => !a.startsWith("--"));
const browser = await chromium.launch({ executablePath: exe });
let failed = false;
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => errors.push("failed " + r.url().slice(0, 120)));
  await page.goto(pathToFileURL(path.join(designs, id + ".html")).href + (long ? "?long=1" : ""));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const out = path.join(designs, "shots", id + (long ? "-long" : "") + ".png");
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ id, out: path.relative(repo, out), errors }));
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
