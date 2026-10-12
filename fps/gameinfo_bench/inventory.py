"""Diff a gameinfo.gi against stock and write inventory.json (reads only).

Usage: py inventory.py --base installed.gi --stock stock.gi --out inventory.json
Stock source: SteamTracking GameTracking-Deadlock game/citadel/gameinfo.gi (check its
last commit against the client's steam.inf ClientVersion before trusting it).
"""
import argparse, json
from collections import Counter
from pathlib import Path

import kv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", type=Path, required=True)
    ap.add_argument("--stock", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    ours, ours_sec = kv.parse(a.base.read_bytes().decode("utf-8"))
    stock, stock_sec = kv.parse(a.stock.read_bytes().decode("utf-8"))
    items = []
    for ident, occ in ours.items():
        ov = occ[0]["value"].value
        sv = stock[ident][0]["value"].value if ident in stock else None
        if sv is not None and sv == ov and len(occ) == 1:
            continue
        k = occ[0]["key"]
        items.append(dict(path=ident[0], key=k.value, ours=ov, stock=sv, dupes=len(occ), line=k.line + 1))
    blocks = [dict(path=p, line=b[0]["key"].line + 1) for p, b in ours_sec.items() if p not in stock_sec]
    removed = [dict(path=i[0], key=v[0]["key"].value, stock=v[0]["value"].value) for i, v in stock.items() if i not in ours]
    a.out.write_text(json.dumps(dict(base=str(a.base), stock=str(a.stock), items=items, blocks=blocks,
                                     removed_from_stock=removed), indent=1), encoding="utf-8")
    print(f"changed/added entries: {len(items)} | new blocks: {len(blocks)} | stock keys absent: {len(removed)}")
    for path, n in Counter(i["path"] for i in items).most_common():
        print(f"  {n:4d}  {path}")


if __name__ == "__main__":
    main()
