"""Analyze a native PE without executing it or modifying the original.

Example (PowerShell, one command):
  python scripts/run-ida-workflow.py --ida 'F:/Program Files/IDA Professional 9.0/idat.exe' --binary 'G:/SteamLibrary/steamapps/common/Deadlock/game/bin/win64/tier0.dll' --out .scratch/rea-tier0-new --string VEngineCvar007 --decompile-string-refs

Outputs: request.json, report.json, ida.log, and an IDB with its own binary copy.
The output directory must not already exist. No packages or providers are installed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys


def native_pe(path):
    """Preflight native x86/x64 PE; CLR assemblies need a managed decompiler."""
    with path.open("rb") as stream:
        dos = stream.read(64)
        if len(dos) != 64 or dos[:2] != b"MZ":
            raise ValueError("Input is not a PE DLL/EXE")
        stream.seek(struct.unpack_from("<I", dos, 60)[0])
        header = stream.read(24)
        if len(header) != 24 or header[:4] != b"PE\0\0":
            raise ValueError("Invalid PE header")
        machine, = struct.unpack_from("<H", header, 4)
        optional_size, = struct.unpack_from("<H", header, 20)
        optional = stream.read(optional_size)
    if machine not in (0x14C, 0x8664) or len(optional) != optional_size or len(optional) < 2:
        raise ValueError("Only native x86/x64 PE DLLs and EXEs are supported")
    magic, = struct.unpack_from("<H", optional)
    directory_start = {0x10B: 96, 0x20B: 112}.get(magic)
    if directory_start is None or len(optional) < directory_start:
        raise ValueError("Invalid PE optional header")
    directory_count, = struct.unpack_from("<I", optional, directory_start - 4)
    if directory_count > (len(optional) - directory_start) // 8:
        raise ValueError("Truncated PE data directories")
    if directory_count > 14 and any(struct.unpack_from("<II", optional, directory_start + 14 * 8)):
        raise ValueError("Managed PE/CLR detected; use ILSpy or another managed decompiler")
    flags, = struct.unpack_from("<H", header, 22)
    return "dll" if flags & 0x2000 else "exe"


def bounded(maximum):
    def parse(value):
        result = int(value)
        if not 1 <= result <= maximum:
            raise argparse.ArgumentTypeError(f"Expected 1..{maximum}")
        return result
    return parse


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ida", type=Path, required=True, help="Installed ida.exe or idat.exe")
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True, help="Previously absent evidence directory")
    parser.add_argument("--string", action="append", default=[], help="Literal string query; repeatable")
    parser.add_argument("--contains", action="store_true", help="Substring instead of exact string matching")
    parser.add_argument("--function", action="append", default=[], help="Name, absolute 0x address, rva:HEX, or entry")
    parser.add_argument("--decompile-string-refs", action="store_true")
    parser.add_argument("--limit", type=bounded(1000), default=20, help="Per-list evidence limit")
    parser.add_argument("--max-functions", type=bounded(100), default=20)
    parser.add_argument("--max-lines", type=bounded(2000), default=200)
    parser.add_argument("--timeout", type=bounded(3600), default=600, help="IDA process timeout in seconds")
    parser.add_argument("--reuse-db", type=Path, help="Copy a closed saved IDB; its binary hash must match")
    args = parser.parse_args()
    source = args.binary.resolve(strict=True)
    ida = args.ida.resolve(strict=True)
    if not ida.is_file() or ida.name.lower() not in ("ida.exe", "idat.exe"):
        raise ValueError("--ida must name the installed IDA executable")
    if source.suffix.lower() not in (".dll", ".exe"):
        raise ValueError("--binary must be a DLL or EXE")
    if len(args.string) > 100 or len(args.function) > 100 or any(len(q) > 4096 or not q for q in args.string):
        raise ValueError("Use at most 100 nonempty bounded queries/targets")
    kind = native_pe(source)
    reuse = args.reuse_db.resolve(strict=True) if args.reuse_db else None
    if reuse and (not reuse.is_file() or reuse.suffix.lower() not in (".i64", ".idb")):
        raise ValueError("--reuse-db must name a closed saved IDB")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    snapshot = out / ("input" + source.suffix.lower())
    shutil.copyfile(source, snapshot)
    with snapshot.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    native_pe(snapshot)
    request = {"source_path": str(source), "snapshot_path": str(snapshot), "sha256": digest, "kind": kind,
               "strings": args.string, "contains": args.contains, "functions": args.function,
               "decompile_string_refs": args.decompile_string_refs, "limit": args.limit,
               "max_functions": args.max_functions, "max_lines": args.max_lines}
    request_path = out / "request.json"
    request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
    worker = Path(__file__).with_name("ida_workflow.py").resolve(strict=True)
    script_arg = "-S" + subprocess.list2cmdline([str(worker), str(request_path)])
    database = out / ("analysis" + reuse.suffix.lower() if reuse else "analysis.i64")
    if reuse:
        shutil.copyfile(reuse, database)
        command = [str(ida), "-A", "-L" + str(out / "ida.log"), script_arg, str(database)]
    else:
        command = [str(ida), "-A", "-c", "-o" + str(database),
                   "-L" + str(out / "ida.log"), script_arg, str(snapshot)]
    with (out / "launcher.log").open("w", encoding="utf-8") as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=args.timeout)
    report_path = out / "report.json"
    if result.returncode != 0 or not report_path.exists():
        raise RuntimeError(f"IDA failed ({result.returncode}); inspect {out / 'ida.log'} and launcher.log")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report["identity"]["database_sha256"] != digest:
        raise RuntimeError("IDA database/input hash mismatch; evidence must not be used")
    failed = sum(f["pseudocode"]["status"] != "ok" for f in report["functions"]["items"])
    print(json.dumps({"report": str(report_path), "sha256": digest,
                      "functions": len(report["functions"]["items"]),
                      "decompilation_failures": failed,
                      "unresolved_targets": len(report["functions"]["errors"]),
                      "functions_truncated": report["functions"]["truncated"]}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"IDA workflow: {error}", file=sys.stderr)
        sys.exit(1)
