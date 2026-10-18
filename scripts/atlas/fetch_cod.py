#!/usr/bin/env python3
"""Count every experimental crystal structure in the Crystallography Open Database by element set.

Uses the JARVIS mirror of COD (431,778 structures, https://ndownloader.figshare.com/files/28715301,
~1.9 GB zip, cached in data/cache/cod_db.zip) and streams it with ijson, so the 7 GB JSON
inside is never loaded into memory. Writes data/cache/cod_sets.json:
{"element-set": [structures, example reduced formula]}.
Citation: S. Gražulis et al., J. Appl. Cryst. 54, 661 (2021); COD, https://www.crystallography.net.
Run:  pip install ijson && python3 scripts/atlas/fetch_cod.py
"""
import collections
import json
import math
import os
import urllib.request
import zipfile
from functools import reduce

import ijson

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = 'https://ndownloader.figshare.com/files/28715301'
ZIP = os.path.join(ROOT, 'data', 'cache', 'cod_db.zip')
OUT = os.path.join(ROOT, 'data', 'cache', 'cod_sets.json')


def main():
    if not os.path.exists(ZIP):
        os.makedirs(os.path.dirname(ZIP), exist_ok=True)
        print('downloading', URL)
        urllib.request.urlretrieve(URL, ZIP)
    fh = zipfile.ZipFile(ZIP).open('cod_db.json')
    count, example, n = collections.Counter(), {}, 0
    for els in ijson.items(fh, 'item.atoms.elements'):
        n += 1
        c = collections.Counter(els)
        g = reduce(math.gcd, c.values())
        key = '-'.join(sorted(c))
        count[key] += 1
        if key not in example:
            example[key] = ''.join(f'{el}{c[el] // g if c[el] // g > 1 else ""}' for el in sorted(c))
        if n % 100_000 == 0:
            print(f'{n:,} structures', flush=True)
    json.dump({'structures': n, 'sets': {k: [count[k], example[k]] for k in count}}, open(OUT, 'w'))
    print(f'done: {n:,} structures, {len(count):,} element sets')


if __name__ == '__main__':
    main()
