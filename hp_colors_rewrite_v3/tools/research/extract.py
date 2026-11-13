"""Extract ASCII and UTF-16LE strings with file offsets, RVAs and sections from Deadlock DLLs.

Usage: python hp_colors_rewrite_v3/tools/research/extract.py [--out <dir>] [--game <Deadlock/game dir>] [dll ...]
       (no dll names = every DLL this research covers)
Writes <out>/strings_<dll>.tsv : offset<TAB>rva<TAB>section<TAB>enc<TAB>text
<out> defaults to $DLL_RESEARCH_OUT, else hp_colors_rewrite_v3/.tmp/dll-research (git-ignored);
<game> defaults to $DEADLOCK_GAME, else the install path below. Needs Python 3 and pefile.
"""
import os, re, sys, pefile

args = sys.argv[1:]


def option(name, default):
    if name in args:
        i = args.index(name)
        value = args[i + 1]
        del args[i:i + 2]
        return value
    return default


ROOT = option('--game', os.environ.get('DEADLOCK_GAME', 'F:/SteamLibrary/steamapps/common/Deadlock/game'))
OUT = option('--out', os.environ.get('DLL_RESEARCH_OUT') or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', '.tmp', 'dll-research'))
DLLS = {
    'panorama.dll': ROOT + '/bin/win64/panorama.dll',
    'panoramauiclient.dll': ROOT + '/bin/win64/panoramauiclient.dll',
    'client.dll': ROOT + '/citadel/bin/win64/client.dll',
    'engine2.dll': ROOT + '/bin/win64/engine2.dll',
    'panorama_text_pango.dll': ROOT + '/bin/win64/panorama_text_pango.dll',
    'v8system.dll': ROOT + '/bin/win64/v8system.dll',
    'deadlock.exe': ROOT + '/bin/win64/deadlock.exe',
}
ASCII = re.compile(rb'[\x20-\x7e\t\r\n]{4,}')
UTF16 = re.compile(rb'(?:[\x20-\x7e]\x00){4,}')


def sections(pe):
    return [(s.PointerToRawData, s.PointerToRawData + s.SizeOfRawData, s.VirtualAddress,
             s.Name.rstrip(b'\0').decode('ascii', 'replace')) for s in pe.sections]


def locate(secs, off):
    for start, end, va, name in secs:
        if start <= off < end:
            return off - start + va, name
    return None, 'hdr'


def run(name, path):
    data = open(path, 'rb').read()
    pe = pefile.PE(data=data, fast_load=True)
    secs = sections(pe)
    rows = []
    for m in ASCII.finditer(data):
        rows.append((m.start(), 'a', m.group().decode('ascii')))
    for m in UTF16.finditer(data):
        rows.append((m.start(), 'w', m.group().decode('utf-16le')))
    rows.sort()
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'strings_' + name + '.tsv'), 'w', encoding='utf-8') as f:
        for off, enc, text in rows:
            rva, sec = locate(secs, off)
            text = text.replace('\\', '\\\\').replace('\t', '\\t').replace('\r', '\\r').replace('\n', '\\n')
            f.write('0x%08x\t%s\t%s\t%s\t%s\n' % (off, '0x%08x' % rva if rva is not None else '-', sec, enc, text))
    print(name, len(rows), 'strings')


if __name__ == '__main__':
    for n in (args or DLLS):
        run(n, DLLS[n])
