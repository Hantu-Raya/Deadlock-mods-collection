"""Diff two single-file VPK v2 archives by entry content (sha1 of preload+data)."""
import hashlib, struct, sys

def read_cstr(b, i):
    j = b.index(b'\0', i)
    return b[i:j].decode('utf-8', 'replace'), j + 1

def entries(path):
    b = open(path, 'rb').read()
    sig, ver, tree = struct.unpack_from('<III', b, 0)
    assert sig == 0x55AA1234, hex(sig)
    head = 12 if ver == 1 else 28
    i, out = head, {}
    while True:
        ext, i = read_cstr(b, i)
        if not ext: break
        while True:
            d, i = read_cstr(b, i)
            if not d: break
            while True:
                n, i = read_cstr(b, i)
                if not n: break
                crc, pre, arc, off, ln, term = struct.unpack_from('<IHHIIH', b, i); i += 18
                preload = b[i:i + pre]; i += pre
                data = b[head + tree + off: head + tree + off + ln] if arc == 0x7FFF else b''
                name = (d.strip() + '/' if d.strip() else '') + n + '.' + ext
                out[name] = hashlib.sha1(preload + data).hexdigest()[:12]
    return out

a, b = entries(sys.argv[1]), entries(sys.argv[2])
added = sorted(set(b) - set(a)); removed = sorted(set(a) - set(b))
changed = sorted(k for k in set(a) & set(b) if a[k] != b[k])
print(f'old {len(a)} new {len(b)} added {len(added)} removed {len(removed)} changed {len(changed)}')
for tag, rows in (('+', added), ('-', removed), ('~', changed)):
    for k in rows:
        if not k.endswith(('.vtex_c', '.vsnd_c')) or tag != '~': print(tag, k)
print('changed textures/sounds:', sum(1 for k in changed if k.endswith(('.vtex_c', '.vsnd_c'))))
