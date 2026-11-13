"""Print the pak01_NNN.vpk archives that hold the given entries of a VPK v2 directory file.

usage: py vpk_needed_archives.py <pak01_dir.vpk> <entry> [<entry> ...]
Entries are VPK paths such as panorama/images/main_menu/dl_v1_png.vtex_c.
Prints one depot path per archive (game/citadel/pak01_007.vpk); exits 1 when an entry is missing.
"""
import struct
import sys


def read_cstr(data, pos):
    end = data.index(b"\0", pos)
    return data[pos:end].decode("utf-8", "replace"), end + 1


def read_tree(path):
    data = open(path, "rb").read()
    sig, version, tree_size = struct.unpack_from("<III", data, 0)
    if sig != 0x55AA1234 or version != 2:
        raise SystemExit(f"{path}: not a VPK v2 directory (sig {sig:#x}, version {version})")
    pos, end, entries = 28, 28 + tree_size, {}
    while pos < end:
        ext, pos = read_cstr(data, pos)
        if not ext:
            break
        while True:
            folder, pos = read_cstr(data, pos)
            if not folder:
                break
            while True:
                name, pos = read_cstr(data, pos)
                if not name:
                    break
                _crc, preload, archive, _offset, _length, _term = struct.unpack_from("<IHHIIH", data, pos)
                pos += 18 + preload
                full = (f"{folder}/" if folder != " " else "") + name + (f".{ext}" if ext != " " else "")
                entries[full.lower()] = archive
    return entries


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    entries = read_tree(sys.argv[1])
    archives, missing = set(), []
    for wanted in sys.argv[2:]:
        archive = entries.get(wanted.lower())
        if archive is None:
            missing.append(wanted)
        elif archive != 0x7FFF:  # 0x7fff = data stored in the directory file itself
            archives.add(archive)
    for archive in sorted(archives):
        print(f"game/citadel/pak01_{archive:03d}.vpk")
    for wanted in missing:
        print(f"MISSING {wanted}", file=sys.stderr)
    sys.exit(1 if missing else 0)


if __name__ == "__main__":
    main()
