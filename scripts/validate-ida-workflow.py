"""E2E: real DLL/EXE analysis; no mocks and no execution of the target.

Failure cases: wrong target/hash, lost xref ownership, duplicate function work,
missing decompiler disguised as success, truncation disguised as completeness,
unresolved addresses, invalid/managed PE, overwriting evidence, and failed saves.
Artifacts remain under the explicitly supplied, previously absent --out directory.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def sha256(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ida", required=True)
    parser.add_argument("--dll", type=Path, required=True)
    parser.add_argument("--exe", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    runner = Path(__file__).with_name("run-ida-workflow.py")
    checks = []

    def run(binary, destination, extra, success=True):
        result = subprocess.run(
            [sys.executable, str(runner), "--ida", args.ida,
             "--binary", str(binary), "--out", str(destination), *extra],
            # The launcher owns the IDA deadline and kills/waits for its child.
            capture_output=True, text=True,
        )
        assert (result.returncode == 0) == success, result.stdout + result.stderr
        return result

    original = {str(p): sha256(p) for p in [args.dll, args.exe]}
    dll_out = args.out / "dll"
    run(args.dll, dll_out, ["--string", "VEngineCvar007", "--string", "REA_NO_SUCH_STRING_9d31",
                           "--function", "CreateInterface", "--function", "rva:0",
                           "--function", "REA_NO_SUCH_FUNCTION_9d31", "--decompile-string-refs"])
    dll = json.loads((dll_out / "report.json").read_text(encoding="utf-8"))
    assert dll["identity"]["sha256"] == original[str(args.dll)]
    assert dll["identity"]["database_sha256"] == dll["identity"]["sha256"]
    assert dll["overview"]["function_count"] > 0
    assert dll["overview"]["import_count"] > 0
    present, absent = dll["strings"]
    assert present["query"] == "VEngineCvar007" and present["matched"] >= 1
    assert any(x["function"] for hit in present["items"] for x in hit["xrefs"]["items"])
    assert absent["matched"] == 0 and not absent["truncated"]
    functions = dll["functions"]["items"]
    assert any(f["pseudocode"]["status"] == "ok" for f in functions)
    assert len({f["address"] for f in functions}) == len(functions)
    assert len(dll["functions"]["errors"]) == 2
    for f in functions:
        assert int(f["address"], 16) - int(dll["identity"]["image_base"], 16) == int(f["rva"], 16)
        assert "truncated" in f["assembly"] and "truncated" in f["callers"]
    checks.append("DLL: identity, inventory, exact strings/xrefs, batch decompilation, invalid targets, RVAs")

    exe_out = args.out / "exe"
    run(args.exe, exe_out, ["--string", ".dll", "--contains", "--limit", "1",
                           "--function", "entry", "--max-lines", "1"])
    exe = json.loads((exe_out / "report.json").read_text(encoding="utf-8"))
    assert exe["identity"]["sha256"] == original[str(args.exe)]
    assert exe["identity"]["database_sha256"] == exe["identity"]["sha256"]
    assert exe["strings"][0]["truncated"] and len(exe["strings"][0]["items"]) == 1
    entry = exe["functions"]["items"][0]
    assert entry["pseudocode"]["status"] == "ok" and entry["pseudocode"]["truncated"]
    assert len(entry["pseudocode"]["lines"]) == 1
    assert entry["assembly"]["truncated"] and len(entry["assembly"]["lines"]) == 1
    checks.append("EXE: entry-point decompilation, substring search, explicit bounded output")

    database = dll_out / "analysis.i64"
    database_before = sha256(database)
    reuse_out = args.out / "reuse"
    run(args.dll, reuse_out, ["--reuse-db", str(database), "--function", "CreateInterface"])
    reused = json.loads((reuse_out / "report.json").read_text(encoding="utf-8"))
    assert reused["identity"]["database_sha256"] == original[str(args.dll)]
    assert reused["functions"]["items"][0]["pseudocode"]["status"] == "ok"
    assert sha256(database) == database_before
    run(args.exe, args.out / "wrong-db", ["--reuse-db", str(database)], success=False)
    assert not (args.out / "wrong-db/report.json").exists()
    checks.append("Reuse: saved IDB copied without modification; mismatched binary/IDB rejected")

    # Exercise a real IDA save failure, not a mocked return value.
    save_out = (args.out / "save-failure").resolve()
    save_out.mkdir()
    save_database = save_out / "analysis.i64"
    shutil.copyfile(database, save_database)
    request_path = save_out / "request.json"
    request_path.write_text(json.dumps({"sha256": original[str(args.dll)]}), encoding="utf-8")
    injection = save_out / "failed_save.py"
    worker = runner.with_name("ida_workflow.py").resolve()
    injection.write_text(
        "import idc, runpy\n"
        "real_save = idc.save_database\n"
        f"bad_path = {str(save_out / 'absent-parent' / 'analysis.i64')!r}\n"
        "idc.save_database = lambda path, flags=0: real_save(bad_path, flags)\n"
        f"runpy.run_path({str(worker)!r}, run_name='__main__')\n", encoding="utf-8")
    save_result = subprocess.run(
        [args.ida, "-A", "-L" + str(save_out / "ida.log"),
         "-S" + subprocess.list2cmdline([str(injection), str(request_path)]), str(save_database)],
        capture_output=True, text=True, timeout=60)
    assert save_result.returncode != 0, "Failed IDB save incorrectly reported success"
    assert not (save_out / "report.json").exists(), "Failed save left a success report"
    checks.append("Save failure: actual invalid-path IDB save fails closed without a success report")

    timeout_result = run(args.dll, args.out / "timeout", ["--timeout", "1"], success=False)
    assert "timed out" in timeout_result.stderr
    assert not (args.out / "timeout/report.json").exists()
    checks.append("Timeout: launcher terminates its own IDA child and returns failure without a report")

    report_before = sha256(dll_out / "report.json")
    run(args.dll, dll_out, [], success=False)
    assert sha256(dll_out / "report.json") == report_before
    run(args.exe, args.out / "bad-limit", ["--limit", "0"], success=False)
    assert not (args.out / "bad-limit").exists()
    invalid = args.out / "invalid.dll"
    invalid.write_bytes(b"not a PE")
    run(invalid, args.out / "invalid", [], success=False)
    assert not (args.out / "invalid").exists()
    # Set a CLR directory on a copy: native workflow must reject it before IDA.
    managed = args.out / "managed.exe"
    data = bytearray(args.exe.read_bytes())
    pe = int.from_bytes(data[0x3C:0x40], "little")
    optional = pe + 24
    magic = int.from_bytes(data[optional:optional + 2], "little")
    directory = optional + (112 if magic == 0x20B else 96) + 14 * 8
    data[directory:directory + 8] = b"\x01\x00\x00\x00\x48\x00\x00\x00"
    managed.write_bytes(data)
    run(managed, args.out / "managed", [], success=False)
    assert not (args.out / "managed").exists()
    assert {str(p): sha256(p) for p in [args.dll, args.exe]} == original
    checks.append("Safety: existing evidence preserved; invalid/managed inputs and limits rejected; originals unchanged")
    evidence = {"status": "passed", "checks": checks, "input_sha256": original,
                "reports": [str(dll_out / "report.json"), str(exe_out / "report.json")]}
    (args.out / "validation.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
