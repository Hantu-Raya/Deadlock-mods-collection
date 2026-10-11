// OMP loads JavaScript extensions directly; no workspace TS build/dependencies.
import { access, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveBinary(target, cwd) {
  const local = resolve(cwd, target);
  if (await exists(local)) return local;
  if (isAbsolute(target) || target.includes("/") || target.includes("\\")) {
    throw new Error(`Binary not found: ${local}`);
  }
  const game = process.env.DEADLOCK_INSTALL_DIR ?? "G:/SteamLibrary/steamapps/common/Deadlock";
  const candidates = [join(game, "game/bin/win64", target), join(game, "game/citadel/bin/win64", target)];
  const matches = [];
  for (const path of candidates) if (await exists(path)) matches.push(resolve(path));
  if (matches.length !== 1) throw new Error(`Supply an exact DLL/EXE path: ${matches.length} installed matches for ${target}`);
  return matches[0];
}

export default function decompExtension(pi) {
  const z = pi.zod;
  const idaConfig = z.object({ Paths: z.object({ "ida-install-dir": z.string().min(1) }) });
  const reportSchema = z.object({
    identity: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), database_sha256: z.string(),
      kind: z.enum(["dll", "exe"]), source_path: z.string(), image_base: z.string(), bits: z.number() }),
    overview: z.object({ function_count: z.number(), import_count: z.number() }),
    strings: z.array(z.object({ query: z.string(), matched: z.number(), truncated: z.boolean() })),
    functions: z.object({ total: z.number(), truncated: z.boolean(), candidate_discovery_truncated: z.boolean(),
      errors: z.array(z.object({ target: z.union([z.string(), z.number()]), error: z.string() })),
      items: z.array(z.object({ address: z.string(), rva: z.string(), name: z.string(),
        pseudocode: z.object({ status: z.enum(["ok", "error", "unavailable"]), truncated: z.boolean() }) })) }),
  });

  async function installedIda() {
    const roots = [];
    if (process.env.IDADIR) roots.push(process.env.IDADIR);
    const config = join(process.env.APPDATA ?? join(homedir(), "AppData/Roaming"), "Hex-Rays/IDA Pro/ida-config.json");
    if (await exists(config)) {
      const parsed = idaConfig.parse(JSON.parse(await readFile(config, "utf8")));
      roots.push(parsed.Paths["ida-install-dir"]);
    }
    for (const root of roots) {
      for (const name of ["idat.exe", "ida.exe"]) {
        const executable = join(root, name);
        if (await exists(executable)) return resolve(executable);
      }
    }
    throw new Error("Installed IDA not found. Set IDADIR or configure Hex-Rays/IDA Pro/ida-config.json; nothing was installed.");
  }

  pi.registerTool({
    name: "decomp",
    label: "Decompile DLL / EXE",
    description: "Static native x86/x64 DLL/EXE analysis with installed IDA. Auto-detects IDA, resolves exact paths or unique Deadlock DLL/EXE names, follows literal string xrefs, and decompiles selected functions. Returns a compact summary and local JSON evidence path containing full pseudocode, assembly and direct call context. Never executes or patches the target. Managed/.NET inputs are rejected. Use native-pe-decomp skill for investigation guidance.",
    approval: "exec",
    loadMode: "discoverable",
    parameters: z.object({
      binary: z.string().min(1).describe("Exact DLL/EXE path, cwd-relative path, or unique installed Deadlock basename"),
      strings: z.array(z.string().min(1).max(4096)).max(100).optional().describe("Case-sensitive literal string anchors"),
      functions: z.array(z.string().min(1)).max(100).optional().describe("Names, absolute 0x addresses, rva:HEX, or entry"),
      contains: z.boolean().optional().describe("Substring matching; default exact"),
      string_refs: z.boolean().optional().describe("Also decompile owning functions of matched string xrefs"),
      reuse_db: z.string().optional().describe("Closed saved IDB to copy; hash must match binary"),
      out: z.string().optional().describe("Absent evidence directory; default fresh .scratch/decomp directory"),
      limit: z.number().int().min(1).max(1000).optional(),
      max_functions: z.number().int().min(1).max(100).optional(),
      max_lines: z.number().int().min(1).max(2000).optional(),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      if (signal?.aborted) throw new Error("Decompilation cancelled");
      const binary = await resolveBinary(params.binary, ctx.cwd);
      const ida = await installedIda();
      const out = params.out ? resolve(ctx.cwd, params.out) : join(ctx.cwd, ".scratch/decomp", randomUUID());
      await mkdir(dirname(out), { recursive: true });
      const runner = fileURLToPath(new URL("./run-ida-workflow.py", import.meta.url));
      const args = [runner, "--ida", ida, "--binary", binary, "--out", out];
      for (const query of params.strings ?? []) args.push(`--string=${query}`);
      for (const target of params.functions ?? []) args.push(`--function=${target}`);
      if (params.contains) args.push("--contains");
      if (params.string_refs) args.push("--decompile-string-refs");
      if (params.reuse_db) args.push("--reuse-db", resolve(ctx.cwd, params.reuse_db));
      args.push("--limit", String(params.limit ?? 20), "--max-functions", String(params.max_functions ?? 20),
        "--max-lines", String(params.max_lines ?? 200));
      onUpdate?.({ content: [{ type: "text", text: `Analyzing ${basename(binary)}; evidence: ${out}` }] });
      // OMP's exec helper owns abort/tree cleanup. Python owns the IDA timeout.
      const result = await pi.exec(process.env.OMP_DECOMP_PYTHON ?? "python", args, { cwd: ctx.cwd, signal });
      if (result.killed || signal?.aborted) throw new Error(`Decompilation cancelled; partial artifacts: ${out}`);
      if (result.code !== 0) throw new Error(`${result.stderr.trim() || "IDA analysis failed"}\nArtifacts: ${out}`);
      const report = join(out, "report.json");
      const data = reportSchema.parse(JSON.parse(await readFile(report, "utf8")));
      if (data.identity.sha256 !== data.identity.database_sha256) throw new Error("Binary/IDB hash mismatch");
      const details = { report, identity: data.identity, overview: data.overview, strings: data.strings,
        functions: data.functions.items.map(f => ({ address: f.address, rva: f.rva, name: f.name,
          status: f.pseudocode.status, truncated: f.pseudocode.truncated })),
        errors: data.functions.errors, truncated: data.functions.truncated,
        candidate_discovery_truncated: data.functions.candidate_discovery_truncated };
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) +
        "\nStatic analysis only. Full pseudocode, assembly and callers/callees are in report.json; errors/truncation are incomplete evidence." }], details };
    },
  });

  pi.registerCommand("decomp", {
    description: "Analyze a DLL/EXE with IDA: /decomp <path or game DLL name> [question or string/function anchor]",
    async handler(args, ctx) {
      if (!args.trim() || args.trim() === "--help") {
        ctx.ui.notify('/decomp <DLL/EXE path or game basename> [question]\nExamples: /decomp tier0.dll VEngineCvar007\n/decomp "D:/app/program.exe" decompile the entry point', "info");
        return;
      }
      pi.sendUserMessage("Use the decomp tool for this native DLL/EXE investigation. Resolve the exact requested target; preserve static-analysis limitations and report errors/truncation. User request:\n" + args.trim(), { deliverAs: "followUp" });
    },
  });
}
