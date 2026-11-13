"""Copy a compiled Source 2 resource without its RED2 (edit info) block.

    py dlf/scripts/strip_red2.py <in.vdata_c> <out.vdata_c>

Deadlock 6779 writes a KV3 node type (26) into RED2 that Source2Viewer 20.0 cannot read, so
decompiling scripts/abilities.vdata_c fails before it reaches DATA. RED2 only holds compiler
edit info; dropping its table entry leaves DATA intact (the decompile matches GameTracking).
"""
import struct
import sys

source, target = sys.argv[1:3]
data = bytearray(open(source, "rb").read())
_, header_version, _, block_offset, count = struct.unpack_from("<IHHII", data, 0)
if header_version != 12:
    raise SystemExit(f"{source}: unexpected resource header version {header_version}")
table = 8 + block_offset
blocks = []
for index in range(count):
    at = table + index * 12
    kind, relative, length = struct.unpack_from("<4sII", data, at)
    blocks.append((kind, at + 4 + relative, length))
kept = [block for block in blocks if block[0] != b"RED2"]
if not any(kind == b"DATA" for kind, _, _ in kept):
    raise SystemExit(f"{source}: no DATA block")
struct.pack_into("<I", data, 12, len(kept))
for index, (kind, absolute, length) in enumerate(kept):
    at = table + index * 12
    struct.pack_into("<4sII", data, at, kind, absolute - (at + 4), length)
open(target, "wb").write(data)
