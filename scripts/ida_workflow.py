"""Read-only investigation helpers for IDAPython/idalib.

REA-inspired workflow, not a REA provider: literal anchors -> xrefs -> focused
function dossiers. Import this module in an existing IDA session to reuse its
analysis; run via run-ida-workflow.py for isolated headless analysis.
"""
import json
from pathlib import Path
import traceback

import ida_auto
import ida_funcs
import ida_hexrays
import ida_ida
import ida_lines
import ida_nalt
import ida_name
import ida_pro
import ida_xref
import idautils
import idc


def location(ea):
    return {"address": hex(ea), "rva": hex(ea - ida_nalt.get_imagebase()),
            "name": ida_name.get_name(ea)}


def owner(ea):
    function = ida_funcs.get_func(ea)
    return location(function.start_ea) if function else None


def page(items, limit):
    return {"items": items[:limit], "total": len(items), "truncated": len(items) > limit}


def overview(limit=20):
    imports = []
    for index in range(ida_nalt.get_import_module_qty()):
        module = ida_nalt.get_import_module_name(index)

        def collect(ea, name, ordinal):
            imports.append({**location(ea), "module": module, "name": name, "ordinal": ordinal})
            return True

        ida_nalt.enum_import_names(index, collect)
    entries = [{**location(ea), "ordinal": ordinal, "name": name}
               for _, ordinal, ea, name in idautils.Entries()]
    return {"function_count": sum(1 for _ in idautils.Functions()),
            "import_count": len(imports), "imports": page(imports, limit),
            "entries": page(entries, limit),
            "segments": page([{**location(ea), "name": idc.get_segm_name(ea),
                               "end": hex(idc.get_segm_end(ea))} for ea in idautils.Segments()], limit)}


def find_strings(queries, contains=False, limit=20):
    """Case-sensitive literal search over IDA-recognized narrow/UTF-16 strings."""
    matches = [[] for _ in queries]
    inventory = idautils.Strings()
    inventory.setup(strtypes=[ida_nalt.STRTYPE_C, ida_nalt.STRTYPE_C_16])
    scanned = 0
    for string in inventory:
        scanned += 1
        text = str(string)
        for index, query in enumerate(queries):
            if (query in text) if contains else (query == text):
                matches[index].append((string.ea, text))
    results = []
    for query, hits in zip(queries, matches):
        items = []
        for ea, text in hits[:limit]:
            refs = [{**location(x.frm), "function": owner(x.frm), "type": x.type,
                     "is_code": bool(x.iscode)} for x in idautils.XrefsTo(ea)]
            items.append({**location(ea), "text": text[:4096], "text_truncated": len(text) > 4096,
                          "xrefs": page(refs, limit)})
        results.append({"query": query, "match": "contains" if contains else "exact",
                        "strings_scanned": scanned, "matched": len(hits), "items": items,
                        "truncated": len(hits) > limit,
                        "coverage": "IDA-recognized C/UTF-16 strings only; not encrypted or dynamically built strings"})
    return results


def resolve_function(target):
    if isinstance(target, int):
        ea = target
    elif target == "entry":
        ea = idc.get_inf_attr(idc.INF_START_EA)
    elif target.startswith("rva:"):
        ea = ida_nalt.get_imagebase() + int(target[4:], 16)
    elif target.startswith("0x"):
        ea = int(target, 16)
    else:
        ea = ida_name.get_name_ea(idc.BADADDR, target)
    function = ida_funcs.get_func(ea)
    if not function:
        raise ValueError(f"No recognized function for {target!r}")
    return function.start_ea


def analyze_functions(targets, limit=20, max_functions=20, max_lines=200):
    addresses, errors = [], []
    for target in targets:
        try:
            ea = resolve_function(target)
            if ea not in addresses:
                addresses.append(ea)
        except (ValueError, TypeError) as error:
            errors.append({"target": target, "error": str(error)})
    available = bool(ida_hexrays.init_hexrays_plugin()) if addresses else None
    items = []
    for ea in addresses[:max_functions]:
        instructions = list(idautils.FuncItems(ea))
        assembly = [f"{hex(at)}: {ida_lines.tag_remove(idc.generate_disasm_line(at, 0) or '')}"
                    for at in instructions]
        callers = [{"callsite": location(x.frm), "function": owner(x.frm)}
                   for x in idautils.XrefsTo(ea) if x.type in (ida_xref.fl_CN, ida_xref.fl_CF)]
        callees = []
        for at in instructions:
            for x in idautils.XrefsFrom(at):
                if x.type in (ida_xref.fl_CN, ida_xref.fl_CF):
                    callees.append({"callsite": location(at), "target": location(x.to), "function": owner(x.to)})
        pseudocode = {"status": "unavailable", "reason": "Hex-Rays decompiler unavailable for this target",
                      "lines": [], "total": 0, "truncated": False}
        if available:
            try:
                function = ida_hexrays.decompile(ea)
                if function is None:
                    raise RuntimeError("Decompiler returned no function")
                lines = [ida_lines.tag_remove(line.line) for line in function.get_pseudocode()]
                pseudocode = {"status": "ok", "lines": lines[:max_lines], "total": len(lines),
                              "truncated": len(lines) > max_lines}
            except Exception as error:
                pseudocode = {"status": "error", "reason": str(error), "lines": [],
                              "total": 0, "truncated": False}
        items.append({**location(ea), "end": hex(ida_funcs.get_func(ea).end_ea),
                      "assembly": {"lines": assembly[:max_lines], "total": len(assembly),
                                   "truncated": len(assembly) > max_lines},
                      "pseudocode": pseudocode, "callers": page(callers, limit),
                      "callees": page(callees, limit)})
    return {**page(items, max_functions), "total": len(addresses),
            "truncated": len(addresses) > max_functions, "errors": errors,
            "decompiler_available": available,
            "call_coverage": "Recognized direct call xrefs only; indirect/virtual calls and tail jumps are not resolved"}


def investigate(request):
    if not ida_auto.auto_wait():
        raise RuntimeError("IDA auto-analysis did not complete")
    limit = request.get("limit", 20)
    max_functions = request.get("max_functions", 20)
    max_lines = request.get("max_lines", 200)
    if not (1 <= limit <= 1000 and 1 <= max_functions <= 100 and 1 <= max_lines <= 2000):
        raise ValueError("Invalid analysis bounds")
    database_sha = bytes(ida_nalt.retrieve_input_file_sha256()).hex()
    if request.get("sha256", database_sha) != database_sha:
        raise ValueError("Request hash does not match the active IDA database")
    strings = find_strings(request.get("strings", []), request.get("contains", False), limit) if request.get("strings") else []
    targets = list(request.get("functions", []))
    discovery_truncated = False
    if request.get("decompile_string_refs"):
        for result in strings:
            discovery_truncated |= result["truncated"]
            for hit in result["items"]:
                discovery_truncated |= hit["xrefs"]["truncated"]
                targets.extend(int(ref["function"]["address"], 16)
                               for ref in hit["xrefs"]["items"] if ref["function"])
    functions = analyze_functions(targets, limit, max_functions, max_lines)
    functions["candidate_discovery_truncated"] = discovery_truncated
    return {"schema_version": 1, "identity": {
                "source_path": request.get("source_path", ida_nalt.get_input_file_path()),
                "snapshot_path": request.get("snapshot_path", ida_nalt.get_input_file_path()),
                "database_input_path": ida_nalt.get_input_file_path(), "sha256": database_sha,
                "database_sha256": database_sha, "kind": request.get("kind", "unknown"),
                "image_base": hex(ida_nalt.get_imagebase()), "ida_version": ida_pro.IDA_SDK_VERSION,
                "bits": 64 if ida_ida.inf_is_64bit() else 32},
            "overview": overview(limit), "strings": strings, "functions": functions,
            "limitations": ["Static analysis only; the target was not executed.",
                            "Pseudocode is recovered analysis, not original source.",
                            "Addresses/RVAs and names are valid only for this binary hash.",
                            "Counts cover recognized IDA entities, not all possible code/data.",
                            "Truncated lists and unresolved/decompilation errors are incomplete evidence."]}


if __name__ == "__main__":
    try:
        request_path = Path(idc.ARGV[1])
        request = json.loads(request_path.read_text(encoding="utf-8"))
        report = investigate(request)
        if not idc.save_database(idc.get_idb_path(), 0):
            raise RuntimeError("IDA database save failed; no success report was produced")
        with (request_path.parent / "report.json").open("x", encoding="utf-8") as stream:
            json.dump(report, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
    except Exception:
        traceback.print_exc()
        ida_pro.qexit(1)
    ida_pro.qexit(0)
