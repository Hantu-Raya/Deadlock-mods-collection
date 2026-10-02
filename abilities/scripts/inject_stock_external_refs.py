#!/usr/bin/env python3
"""
Copy the stock RERL (external resource reference) block into a compiled
abilities.vdata_c.

The Dota Workshop resourcecompiler cannot resolve Deadlock's panorama icons, so
it emits no RERL. Stock Deadlock lists every ability/item icon texture there, so
the icons load together with the VData instead of on first HUD use.

Usage: python inject_stock_external_refs.py <compiled.vdata_c> <source.vdata> <stock.vdata_c>
"""
import re
import struct
import sys

HEADER_SIZE = 16
BLOCK_ENTRY_SIZE = 12
ALIGN = 16
IMAGE_REF = re.compile(r'panorama:"file://\{images\}/([^"]+)\.(psd|png)"', re.IGNORECASE)


def read_blocks(data):
    file_size, header_version, type_version, block_offset, block_count = struct.unpack_from("<IHHII", data, 0)
    if file_size != len(data):
        raise ValueError(f"resource size field {file_size} != actual {len(data)}")
    blocks = []
    pos = 8 + block_offset
    for _ in range(block_count):
        kind = data[pos:pos + 4].decode("ascii")
        offset, size = struct.unpack_from("<II", data, pos + 4)
        start = pos + 4 + offset
        blocks.append((kind, data[start:start + size]))
        pos += BLOCK_ENTRY_SIZE
    return header_version, type_version, blocks


def rerl_names(block):
    rel, count = struct.unpack_from("<II", block, 0)
    names = []
    for i in range(count):
        entry = rel + i * 16
        name_rel = struct.unpack_from("<I", block, entry + 8)[0]
        start = entry + 8 + name_rel
        names.append(block[start:block.index(b"\0", start)].decode("utf-8"))
    return names


def write_resource(header_version, type_version, blocks):
    table_end = HEADER_SIZE + BLOCK_ENTRY_SIZE * len(blocks)
    out = bytearray(table_end)
    starts = []
    for _, payload in blocks:
        out += b"\0" * (-len(out) % ALIGN)
        starts.append(len(out))
        out += payload
    struct.pack_into("<IHHII", out, 0, len(out), header_version, type_version, 8, len(blocks))
    for i, ((kind, payload), start) in enumerate(zip(blocks, starts)):
        pos = HEADER_SIZE + i * BLOCK_ENTRY_SIZE
        out[pos:pos + 4] = kind.encode("ascii")
        struct.pack_into("<II", out, pos + 4, start - (pos + 4), len(payload))
    return bytes(out)


def source_image_refs(source_text):
    return {f"panorama/images/{stem}_{ext}.vtex".lower() for stem, ext in IMAGE_REF.findall(source_text)}


def inject(compiled_path, source_path, stock_path):
    with open(stock_path, "rb") as f:
        _, _, stock_blocks = read_blocks(f.read())
    stock_rerl = next((payload for kind, payload in stock_blocks if kind == "RERL"), None)
    if stock_rerl is None:
        raise ValueError(f"stock {stock_path} has no RERL block")
    stock_refs = rerl_names(stock_rerl)

    with open(source_path, "r", encoding="utf-8") as f:
        expected = source_image_refs(f.read())
    missing = sorted(expected - set(stock_refs))
    extra = sorted(set(stock_refs) - expected)
    if missing or extra:
        raise ValueError(
            "source VData icons differ from the installed game's abilities.vdata_c "
            "(baseline is stale or the game updated; rerun with -RefreshFromSteamTracking). "
            f"missing from stock: {missing[:5]} ({len(missing)}), extra in stock: {extra[:5]} ({len(extra)})"
        )

    with open(compiled_path, "rb") as f:
        header_version, type_version, blocks = read_blocks(f.read())
    kept = [(kind, payload) for kind, payload in blocks if kind != "RERL"]
    output = write_resource(header_version, type_version, [("RERL", stock_rerl)] + kept)

    # Self-check: re-parse the result before replacing the compiled file.
    _, _, check = read_blocks(output)
    if check != [("RERL", stock_rerl)] + kept or rerl_names(check[0][1]) != stock_refs:
        raise ValueError("re-parsed output does not match the injected blocks")

    with open(compiled_path, "wb") as f:
        f.write(output)
    print(f"[rerl] {len(stock_refs)} external refs -> {compiled_path}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    inject(*sys.argv[1:])
