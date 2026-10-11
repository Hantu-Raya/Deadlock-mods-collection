// E2E failures: extension undiscovered, tool/command unregistered, wrong IDA/path,
// lost string/function results, overwritten evidence, or ignored cancellation.
// Loads OMP's actual extension loader and uses its real process-tree exec helper.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const omp = process.env.OMP_PACKAGE_ROOT ?? join(homedir(), ".bun/install/global/node_modules/@oh-my-pi/pi-coding-agent");
// The installed OMP package path is selected at runtime (supports OMP_PACKAGE_ROOT).
const { discoverExtensionPaths, loadExtensions } = await import(pathToFileURL(join(omp, "src/extensibility/extensions/loader.ts")).href);
const registration = resolve(homedir(), ".omp/agent/extensions/decomp.js");
const cwd = process.cwd();
const discovered = await discoverExtensionPaths([], cwd, undefined, { includeAmbientHooks: false });
assert(discovered.some(p => resolve(p) === registration), "User OMP extension not auto-discovered");
const loaded = await loadExtensions([registration], cwd);
assert.deepEqual(loaded.errors, []);
const extension = loaded.extensions[0];
const tool = extension.tools.get("decomp")?.definition;
const command = extension.commands.get("decomp");
assert(tool && command, "decomp tool and /decomp command must both be registered");
assert.equal(tool.approval, "exec");
const out = resolve(".scratch", "omp-decomp-e2e-" + randomUUID());
await mkdir(out, { recursive: true });
const checks = ["OMP user-level auto-discovery, real loader, decomp schema and /decomp registration"];
const context = { cwd };
const request = 'tier0.dll VEngineCvar007';
let forwarded = "";
loaded.runtime.sendUserMessage = text => { forwarded = text; };
const notifications = [];
const commandContext = { cwd, ui: { notify: text => notifications.push(text) } };
await command.handler("--help", commandContext);
assert(notifications.some(text => text.includes("/decomp")) && !forwarded);
await command.handler(request, commandContext);
assert(forwarded.includes(request) && forwarded.includes("decomp"));
checks.push("Slash command help and exact user-request forwarding (no model/API request in this test)");

const dll = await tool.execute("dll", {
  binary: "tier0.dll", strings: ["VEngineCvar007"], string_refs: true,
  functions: ["CreateInterface"], out: join(out, "dll"),
}, undefined, undefined, context);
// Summary fields were schema-validated by the registered extension.
assert(dll.details.strings[0].matched > 0);
assert(dll.details.functions.some(f => f.status === "ok"));
assert.equal(dll.details.identity.sha256, dll.details.identity.database_sha256);
const reportBefore = await readFile(dll.details.report, "utf8");
await assert.rejects(tool.execute("overwrite", { binary: "tier0.dll", out: join(out, "dll") }, undefined, undefined, context));
assert.equal(await readFile(dll.details.report, "utf8"), reportBefore);
checks.push("DLL basename resolution, IDA auto-detection, string-xref/function decompilation, no overwrite");

const exe = await tool.execute("exe", {
  binary: "deadlock.exe", functions: ["entry"], out: join(out, "exe"),
}, undefined, undefined, context);
assert.equal(exe.details.functions[0].status, "ok");
checks.push("EXE entry-point decompilation through the registered OMP tool");

const preaborted = new AbortController();
preaborted.abort();
await assert.rejects(tool.execute("preabort", { binary: "tier0.dll" }, preaborted.signal, undefined, context), /cancel/i);
const controller = new AbortController();
const running = tool.execute("abort", { binary: "tier0.dll", out: join(out, "cancelled") }, controller.signal, undefined, context);
const timer = setTimeout(() => controller.abort(), 1500);
try {
  await assert.rejects(running, /cancel/i);
} finally {
  clearTimeout(timer);
}
checks.push("Pre-aborted and in-flight calls cancelled via OMP process-tree cleanup");
const evidence = { status: "passed", checks, extension: registration,
  reports: [dll.details.report, exe.details.report] };
await writeFile(join(out, "validation.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ ...evidence, evidence: join(out, "validation.json") }, null, 2));
