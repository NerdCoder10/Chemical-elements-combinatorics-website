#!/usr/bin/env python3
"""Check the calculation server against known answers; writes server/validation.json and js/calc-validation.js.

1. Measured: for every solid compound with tabulated ΔHf° on the site (measured_solids.json), the same
   structure search is run for that exact formula and its formation energy compared with experiment.
2. DFT: for a fixed random sample of element pairs that Alexandria computed (alexandria_pairs.json),
   the full calculation is run and "does a stable compound form?" compared with Alexandria's hull.
Run: python3 server/validate.py [number of pairs, default 40]
"""
import json
import os
import random
import sys
import time
from multiprocessing import get_context

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipeline  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
EV = 96.485332


def main(n_pairs):
    pipeline.calculator()
    pool = get_context('fork').Pool(pipeline.WORKERS)
    covered = pipeline.supported()
    ok = lambda syms: all(pipeline.ELS[s]['Z'] in covered for s in syms)
    t0 = time.time()
    measured = []
    for c in json.load(open(os.path.join(HERE, 'measured_solids.json'))):
        syms = sorted(c['counts'])
        counts = [c['counts'][s] for s in syms]
        g = __import__('math').gcd(*counts) if len(counts) > 1 else counts[0]
        counts = [k // g for k in counts]
        # the structure search handles ordinary crystals; molecular solids with large formula units are skipped
        if not ok(syms) or len(syms) > 4 or sum(counts) > 12:
            continue
        f = pipeline.formula_search(syms, counts, pool)
        if f['energy_per_atom'] is None:
            continue
        refs = [pipeline.element_reference(s, pool)['energy_per_atom'] for s in syms]
        n = sum(counts)
        fe = f['energy_per_atom'] - sum(r * k / n for r, k in zip(refs, counts))
        if fe < pipeline.FE_FLOOR:
            continue
        atoms_measured = sum(c['counts'].values())
        measured.append({'formula': c['formula'], 'calc_kJ_atom': round(fe * EV, 1), 'measured_kJ_atom': round(c['dHf'] / atoms_measured, 1)})
        print(f"{c['formula']}: calc {fe * EV:.0f} vs measured {c['dHf'] / atoms_measured:.0f} kJ/mol per atom", flush=True)
    errs = [abs(m['calc_kJ_atom'] - m['measured_kJ_atom']) for m in measured]
    sign = [(m['calc_kJ_atom'] < 0) == (m['measured_kJ_atom'] < 0) for m in measured]
    pairs_all = [p for p in json.load(open(os.path.join(HERE, 'alexandria_pairs.json'))) if ok(p['pair'].split('-'))]
    random.Random(7).shuffle(pairs_all)
    pairs = []
    for p in pairs_all[:n_pairs]:
        res = pipeline.calculate(p['pair'].split('-'), pool)
        pairs.append({'pair': p['pair'], 'alexandria_stable': p['stable'] > 0, 'calc_stable': bool(res['products']),
                      'products': [x['formula'] for x in res['products']], 'seconds': res['seconds']})
        print(f"{p['pair']}: alexandria {'forms' if p['stable'] else 'none'}, calc {pairs[-1]['products'] or 'none'} ({res['seconds']} s)", flush=True)
    share = sum(p['alexandria_stable'] for p in pairs) / len(pairs)
    out = {
        'measured': {'n': len(measured), 'mae_kJ_per_mol_atom': round(sum(errs) / len(errs), 1),
                     'sign_agreement': round(sum(sign) / len(sign), 3), 'items': measured},
        'pairs': {'n': len(pairs), 'forms_agreement': round(sum(p['alexandria_stable'] == p['calc_stable'] for p in pairs) / len(pairs), 3),
                  'baseline': round(max(share, 1 - share), 3),
                  'median_seconds': sorted(p['seconds'] for p in pairs)[len(pairs) // 2], 'items': pairs},
        'seconds': round(time.time() - t0),
    }
    json.dump(out, open(os.path.join(HERE, 'validation.json'), 'w'), indent=1)
    short = {'measured': {k: out['measured'][k] for k in ('n', 'mae_kJ_per_mol_atom', 'sign_agreement')},
             'pairs': {k: out['pairs'][k] for k in ('n', 'forms_agreement', 'baseline', 'median_seconds')}}
    with open(os.path.join(os.path.dirname(HERE), 'js', 'calc-validation.js'), 'w') as fh:
        fh.write(f'/* Written by server/validate.py. */\nvar CALC_VALIDATION = {json.dumps(short)};\n')
    print(json.dumps(short, indent=1))


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 40)
