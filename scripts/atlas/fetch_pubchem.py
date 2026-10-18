#!/usr/bin/env python3
"""Count every PubChem compound by its set of elements.

Streams https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-Mass.gz (~1.4 GB; one line per
compound: CID, molecular formula, masses) without storing it, checks the published MD5, and
writes data/cache/pubchem_sets.json:  {"element-set": [compounds, first CID, its formula]}.
Isotope symbols D and T count as H. Run:  python3 scripts/atlas/fetch_pubchem.py
"""
import collections
import gzip
import hashlib
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = 'https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-Mass.gz'
OUT = os.path.join(ROOT, 'data', 'cache', 'pubchem_sets.json')
ELEMENTS = set("""H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr
Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re
Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh
Fl Mc Lv Ts Og""".split())
ALIAS = {'D': 'H', 'T': 'H'}
TOKEN = re.compile(r'[A-Z][a-z]?')


class HashingReader:
    """Pass-through reader that computes the MD5 of everything read."""
    def __init__(self, raw):
        self.raw, self.md5 = raw, hashlib.md5()

    def read(self, n=-1):
        data = self.raw.read(n)
        self.md5.update(data)
        return data


def main():
    expected = urllib.request.urlopen(URL + '.md5').read().decode().split()[0]
    raw = HashingReader(urllib.request.urlopen(URL))
    count, example, lines, skipped = collections.Counter(), {}, 0, 0
    with gzip.open(raw, 'rt', encoding='utf-8', errors='replace') as fh:
        for line in fh:
            parts = line.split('\t')
            if len(parts) < 2:
                continue
            lines += 1
            els = {ALIAS.get(t, t) for t in TOKEN.findall(parts[1])}
            if not els or not els <= ELEMENTS:
                skipped += 1
                continue
            key = '-'.join(sorted(els))
            count[key] += 1
            example.setdefault(key, (int(parts[0]), parts[1].strip()))
            if lines % 10_000_000 == 0:
                print(f'{lines:,} compounds, {len(count):,} element sets', flush=True)
    raw.raw.read()  # drain any trailing bytes so the checksum covers the whole file
    if raw.md5.hexdigest() != expected:
        raise SystemExit(f'MD5 mismatch: got {raw.md5.hexdigest()}, expected {expected}')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'lines': lines, 'skipped': skipped, 'md5': expected,
               'sets': {k: [count[k], *example[k]] for k in count}}, open(OUT, 'w'))
    print(f'done: {lines:,} compounds, {len(count):,} element sets, MD5 verified')


if __name__ == '__main__':
    main()
