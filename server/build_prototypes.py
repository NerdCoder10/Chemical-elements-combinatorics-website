#!/usr/bin/env python3
"""Build the library of crystal structure types used as starting points (server/prototypes.json).

Source: every compound on the Alexandria PBE convex hull (116,712 structures; JARVIS mirror
https://ndownloader.figshare.com/files/49622718). Structures are grouped by their composition
pattern: the element counts ordered from least to most electronegative (NaCl -> 1-1, MgAl2O4 -> 1-2-4).
For each pattern the most common space groups are kept, one representative cell each, with the
elements replaced by their electronegativity rank, so any elements with the same pattern can be
substituted in. Elemental ground states are kept per element as references.
Run: python3 server/build_prototypes.py <path to alexandria_convex_hull_pbe ... .zip>
"""
import collections
import json
import math
import os
import sys
import zipfile
from functools import reduce

import numpy as np
import spglib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pipeline import ELS  # noqa: E402

MAX_ATOMS = 16
PER_PATTERN = 6


def en(sym):
    v = ELS.get(sym, {}).get('en')
    return 1.3 if v is None else v


def main(path):
    z = zipfile.ZipFile(path)
    data = json.load(z.open(z.namelist()[0]))
    groups = collections.defaultdict(list)
    elements = {}
    for e in data:
        a = e['atoms']
        syms = a['elements']
        if any(s not in ELS for s in syms):
            continue
        uniq = sorted(set(syms), key=lambda s: (en(s), s))
        counts = [syms.count(s) for s in uniq]
        g = reduce(math.gcd, counts)
        lattice = np.array(a['lattice_mat'], float)
        coords = np.array(a['coords'], float)
        frac = np.linalg.solve(lattice.T, coords.T).T if a.get('cartesian') else coords
        if len(uniq) == 1:
            n = len(syms)
            per_atom = e['energy_corrected'] / n
            prev = elements.get(uniq[0])
            if n <= 32 and (prev is None or per_atom < prev[0]):
                elements[uniq[0]] = (per_atom, {'lattice': lattice.round(6).tolist(), 'frac': frac.round(6).tolist(), 'n': n})
            continue
        if len(syms) > MAX_ATOMS or len(uniq) > 4:
            continue
        key = '-'.join(str(c // g) for c in counts)
        ranks = [uniq.index(s) for s in syms]
        try:
            sg = spglib.get_spacegroup((lattice, frac, ranks), symprec=0.1) or 'P1 (1)'
        except Exception:
            sg = 'P1 (1)'
        groups[key].append({'sg': sg, 'lattice': lattice.round(6).tolist(), 'frac': frac.round(6).tolist(),
                            'ranks': ranks, 'example': ''.join(f'{s}{syms.count(s) if syms.count(s) > 1 else ""}' for s in uniq),
                            'elements': uniq, 'n': len(syms)})
    protos = {}
    for key, items in groups.items():
        by_sg = collections.defaultdict(list)
        for it in items:
            by_sg[it['sg']].append(it)
        top = sorted(by_sg.items(), key=lambda kv: -len(kv[1]))[:PER_PATTERN]
        protos[key] = [{**min(v, key=lambda it: it['n']), 'count': len(v)} for _, v in top]
    out = {'source': 'Alexandria PBE convex hull (2023.12.29), JARVIS mirror', 'patterns': protos,
           'elements': {s: v[1] for s, v in elements.items()}}
    path_out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prototypes.json')
    json.dump(out, open(path_out, 'w'), separators=(',', ':'))
    print(f'{len(protos)} composition patterns, {sum(len(v) for v in protos.values())} structure types, '
          f'{len(elements)} elemental ground states -> {path_out} ({os.path.getsize(path_out) // 1024} KB)')


if __name__ == '__main__':
    main(sys.argv[1])
