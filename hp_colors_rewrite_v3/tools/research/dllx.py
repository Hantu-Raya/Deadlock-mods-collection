"""Helpers for static string/xref analysis of Deadlock DLLs (no IDA needed).

Load with: exec(open('hp_colors_rewrite_v3/tools/research/dllx.py').read())  (from the repo root)
Reads strings_<dll>.tsv written by extract.py from $DLL_RESEARCH_OUT, else hp_colors_rewrite_v3/.tmp/dll-research
(git-ignored); dump() writes there too. $DEADLOCK_GAME overrides the game folder.
Provides: S (strings per DLL), PE (raw data, sections), cstr, dis, xref index (lea reg,[rip+x]),
function ranges from .pdata, fn_strings(n, func_rva), refs(n, text) -> [(insn_rva, func_rva)].
"""
import os, re, struct, numpy as np, pefile
from collections import defaultdict
from capstone import Cs, CS_ARCH_X86, CS_MODE_64

D = (os.environ.get('DLL_RESEARCH_OUT') or 'hp_colors_rewrite_v3/.tmp/dll-research').replace('\\', '/').rstrip('/') + '/'
os.makedirs(D, exist_ok=True)
GAME = os.environ.get('DEADLOCK_GAME', 'F:/SteamLibrary/steamapps/common/Deadlock/game')
PATHS = {
    'panorama.dll': GAME + '/bin/win64/panorama.dll',
    'panoramauiclient.dll': GAME + '/bin/win64/panoramauiclient.dll',
    'client.dll': GAME + '/citadel/bin/win64/client.dll',
    'engine2.dll': GAME + '/bin/win64/engine2.dll',
    'panorama_text_pango.dll': GAME + '/bin/win64/panorama_text_pango.dll',
    'v8system.dll': GAME + '/bin/win64/v8system.dll',
    'deadlock.exe': GAME + '/bin/win64/deadlock.exe',
}
md = Cs(CS_ARCH_X86, CS_MODE_64)
S, PE = {}, {}


def load_strings(n):
    rows = []
    for l in open(D + 'strings_' + n + '.tsv', encoding='utf-8'):
        o, rva, sec, enc, t = l.rstrip('\n').split('\t', 4)
        rows.append((int(o, 16), rva, sec, enc, t))
    S[n] = rows
    return rows


def prep(n):
    if n in PE:
        return PE[n]
    data = open(PATHS[n], 'rb').read()
    pe = pefile.PE(data=data, fast_load=True)
    secs = [(s.Name.rstrip(b'\0').decode(), s.PointerToRawData, s.SizeOfRawData, s.VirtualAddress, s.Misc_VirtualSize)
            for s in pe.sections]
    p = PE[n] = dict(data=data, base=pe.OPTIONAL_HEADER.ImageBase, secs=secs, cache={})
    pd = [s for s in secs if s[0] == '.pdata'][0]
    arr = np.frombuffer(data[pd[1]:pd[1] + pd[2] // 12 * 12], dtype='<u4').reshape(-1, 3)
    arr = arr[arr[:, 0] > 0]
    order = np.argsort(arr[:, 0])
    p['fb'], p['fe'] = arr[order, 0].astype(np.int64), arr[order, 1].astype(np.int64)
    t = [s for s in secs if s[0] == '.text'][0]
    tb = np.frombuffer(data, dtype=np.uint8)[t[1]:t[1] + t[2]]
    m = ((tb[:-6] == 0x48) | (tb[:-6] == 0x4C)) & (tb[1:-5] == 0x8D) & ((tb[2:-4] & 0xC7) == 0x05)
    idx = np.nonzero(m)[0]
    disp = (tb[idx + 3].astype(np.int64) | (tb[idx + 4].astype(np.int64) << 8) |
            (tb[idx + 5].astype(np.int64) << 16) | (tb[idx + 6].astype(np.int64) << 24))
    disp = np.where(disp >= 2 ** 31, disp - 2 ** 32, disp)
    ir = idx.astype(np.int64) + t[3]
    p['lea_insn'], p['lea_tgt'] = ir, ir + 7 + disp
    fi = np.searchsorted(p['fb'], ir, side='right') - 1
    ok = (fi >= 0) & (ir < p['fe'][np.clip(fi, 0, None)])
    p['lea_fn'] = np.where(ok, p['fb'][np.clip(fi, 0, None)], -1)
    return p


def rva2off(n, rva):
    for name, raw, rs, v, vs in PE[n]['secs']:
        if v <= rva < v + rs:
            return raw + rva - v
    return None


def off2rva(n, off):
    for name, raw, rs, v, vs in PE[n]['secs']:
        if raw <= off < raw + rs:
            return off - raw + v
    return None


def cstr(n, rva, maxlen=600):
    c = PE[n]['cache']
    if rva in c:
        return c[rva]
    off = rva2off(n, rva)
    r = None
    if off is not None:
        d = PE[n]['data']
        end = d.find(b'\0', off, off + maxlen)
        if end > off:
            s = d[off:end]
            if all(32 <= ch < 127 or ch in (9, 10, 13) for ch in s):
                r = s.decode()
    c[rva] = r
    return r


def fn_of(n, rva):
    p = PE[n]
    i = np.searchsorted(p['fb'], rva, side='right') - 1
    return int(p['fb'][i]) if i >= 0 and rva < p['fe'][i] else None


def refs(n, text):
    """Code xrefs (lea) to every exact occurrence of text as a NUL-terminated string."""
    p = PE[n]
    d = p['data']
    pat = text.encode() + b'\0'
    out = []
    i = d.find(pat)
    while i >= 0:
        rva = off2rva(n, i)
        if rva is not None:
            hits = np.nonzero(p['lea_tgt'] == rva)[0]
            out += [(int(p['lea_insn'][h]), int(p['lea_fn'][h])) for h in hits]
        i = d.find(pat, i + 1)
    return out


def fn_strings(n, f):
    p = PE[n]
    hits = np.nonzero(p['lea_fn'] == f)[0]
    out = []
    for h in hits:
        s = cstr(n, int(p['lea_tgt'][h]))
        if s is not None:
            out.append((int(p['lea_insn'][h]), s))
    return out


def dis(n, rva, count=40):
    p = PE[n]
    off = rva2off(n, rva)
    out = []
    for i, ins in enumerate(md.disasm(p['data'][off:off + count * 10], rva)):
        if i >= count:
            break
        s = '%x %s %s' % (ins.address, ins.mnemonic, ins.op_str)
        m = re.search(r'rip ([+-]) 0x([0-9a-f]+)', ins.op_str)
        if m:
            t = ins.address + ins.size + int(m.group(2), 16) * (1 if m.group(1) == '+' else -1)
            cs = cstr(n, t)
            s += '   ; ->%x %s' % (t, repr(cs[:80]) if cs is not None else '')
        out.append(s)
    return out


def show(lst, width=110):
    line, out = '', []
    for x in lst:
        if len(line) + len(x) + 1 > width:
            out.append(line)
            line = ''
        line += x + ' '
    out.append(line)
    print('\n'.join(out))


def dump(name, lines):
    open(D + name, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def grep(n, rx, flags=0):
    r = re.compile(rx, flags)
    return [x for x in S[n] if r.search(x[4])]
