#!/usr/bin/env python3
"""Summarise all ~5.8 million DFT calculations of the Alexandria database (PBE, release 2025.07.02).

Streams the 58 files https://alexandria.icams.rub.de/data/pbe/2025.07.02/alexandria_000NN.json.bz2
(~3.5 GB in total) in parallel without storing them, and writes one summary per file to
data/cache/alexandria/pNNNNN.json: per element set, the number of computed compounds, every
compound on the convex hull (e_above_hull <= 1 meV/atom) and the lowest-lying compound.
Entries whose energies are NaN (failed calculations) are skipped and counted.
Citation: J. Schmidt et al., "Machine-learning-assisted determination of the global
zero-temperature phase diagram of materials", Adv. Mater. 35, 2210788 (2023);
https://alexandria.icams.rub.de.  Run:  pip install ijson && python3 scripts/atlas/fetch_alexandria.py
"""
import bz2
import json
import multiprocessing
import os
import sys
import time
import urllib.request

import ijson

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = 'https://alexandria.icams.rub.de/data/pbe/2025.07.02'
FILES = 58
OUT_DIR = os.path.join(ROOT, 'data', 'cache', 'alexandria')
STABLE = 1e-3  # eV/atom


class NanFilter:
    """File-like wrapper turning the non-standard JSON tokens NaN / Infinity into null."""
    def __init__(self, raw):
        self.raw, self.tail = raw, b''

    def read(self, size=1 << 20):
        chunk = self.raw.read(size)
        data = self.tail + chunk
        if chunk:
            self.tail, data = data[-9:], data[:-9]  # keep a tail so a token split across chunks still matches
        else:
            self.tail = b''
        return data.replace(b'-Infinity', b'null').replace(b'Infinity', b'null').replace(b'NaN', b'null')


def summarise(i):
    out = os.path.join(OUT_DIR, f'p{i:05d}.json')
    if os.path.exists(out) and os.path.getsize(out):
        return out
    url = f'{BASE}/alexandria_{i:05d}.json.bz2'
    for attempt in range(5):
        try:
            stream = NanFilter(bz2.BZ2File(urllib.request.urlopen(url, timeout=120)))
            sets, n, skipped = {}, 0, 0
            for e in ijson.items(stream, 'entries.item.data', use_float=True):
                n += 1
                if e.get('e_form') is None or e.get('e_above_hull') is None:
                    skipped += 1
                    continue
                key = '-'.join(sorted(e['elements']))
                s = sets.setdefault(key, {'n': 0, 'stable': [], 'best': None})
                s['n'] += 1
                row = [e['formula'], round(e['e_form'], 4), round(e['e_above_hull'], 4), e['spg'],
                       round(e.get('band_gap_ind') or 0, 2), e['mat_id']]
                if s['best'] is None or (row[2], row[1]) < (s['best'][2], s['best'][1]):
                    s['best'] = row
                if e['e_above_hull'] <= STABLE:
                    s['stable'].append(row)
            json.dump({'entries': n, 'skipped': skipped, 'sets': sets}, open(out, 'w'))
            print(f'{url.rsplit("/", 1)[1]}: {n:,} entries, {skipped} skipped', flush=True)
            return out
        except Exception as ex:  # truncated transfer etc.: retry with backoff
            print(f'retry {url}: {ex}', file=sys.stderr, flush=True)
            time.sleep(2 ** attempt)
    raise SystemExit(f'failed {url}')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with multiprocessing.Pool(6) as pool:
        pool.map(summarise, range(FILES))


if __name__ == '__main__':
    main()
