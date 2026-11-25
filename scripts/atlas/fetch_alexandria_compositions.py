#!/usr/bin/env python3
"""Collect the formation energy of every composition Alexandria computed (~5.8 million entries).

Streams the same 58 files as fetch_alexandria.py and keeps, for each reduced formula, the lowest
formation energy (eV/atom) over its polymorphs. Writes data/cache/alexandria_comp/pNNNNN.json
({formula: e_form}); train_composition_model.py merges them. Entries with NaN energies are skipped.
Run:  pip install ijson pymatgen && python3 scripts/atlas/fetch_alexandria_compositions.py
"""
import bz2
import json
import multiprocessing
import os
import sys
import time
import urllib.request

import ijson

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_alexandria import BASE, FILES, NanFilter  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'data', 'cache', 'alexandria_comp')


def collect(i):
    from pymatgen.core import Composition
    out = os.path.join(OUT_DIR, f'p{i:05d}.json')
    if os.path.exists(out) and os.path.getsize(out):
        return
    url = f'{BASE}/alexandria_{i:05d}.json.bz2'
    for attempt in range(5):
        try:
            stream = NanFilter(bz2.BZ2File(urllib.request.urlopen(url, timeout=120)))
            best = {}
            for e in ijson.items(stream, 'entries.item.data', use_float=True):
                fe = e.get('e_form')
                if fe is None:
                    continue
                f = Composition(e['formula']).reduced_formula
                if f not in best or fe < best[f]:
                    best[f] = round(fe, 4)
            json.dump(best, open(out, 'w'))
            print(f'{i:05d}: {len(best):,} compositions', flush=True)
            return
        except Exception as ex:
            print(f'retry {url}: {ex}', file=sys.stderr, flush=True)
            time.sleep(2 ** attempt)
    raise SystemExit(f'failed {url}')


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    with multiprocessing.Pool(6) as pool:
        pool.map(collect, range(FILES))
