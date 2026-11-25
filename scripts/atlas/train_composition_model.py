#!/usr/bin/env python3
"""Train the composition model that predicts what forms from ANY set of elements.

Data: the lowest formation energy of every composition Alexandria computed (~5.8 million entries,
collected by fetch_alexandria_compositions.py). The model maps a formula (e.g. Fe2GdS4) to its
formation energy per atom. In the browser, js/predict.js generates candidate formulas for any
element set (charge-balanced ones from oxidation states, or simple ratios for metals), scores
them with this model, and reports the lowest-energy one as the predicted product.

Validation holds out whole element combinations (no formula from a held-out system is seen in
training), then checks per-formula error and, for held-out pairs and triples, whether the
predicted product's energy and sign match the best compound Alexandria actually found.

Features (must match js/predict.js): for each of 9 element properties, the fraction-weighted
mean, min, max, range and weighted mean absolute deviation (NaN values skipped); then the number
of elements, the largest and smallest fraction, the L2 norm of the fractions, and whether the
formula can be charge-balanced with common oxidation states.

Run:  pip install pymatgen scikit-learn && python3 scripts/atlas/train_composition_model.py
"""
import glob
import itertools
import json
import math
import os
import re
import sys
import zlib
from functools import reduce

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, 'data', 'cache')
MAX_ELEMENTS = 7
MAX_TRAIN = 2_000_000
MIN_TRAINING = 1000  # formulas an element must appear in to be inside the model's domain
PARAMS = dict(max_iter=300, max_leaf_nodes=63, learning_rate=0.1, min_samples_leaf=40, random_state=0)


# ---------- element data, read from the site's own files ----------

def load_elements():
    src = open(os.path.join(ROOT, 'js', 'elements.js'), encoding='utf-8').read()
    raw = src[src.index('const RAW = `') + 13:]
    raw = raw[:raw.index('`')]
    els = {}
    for line in raw.strip().split('\n'):
        z, sym, name, mass, cat, group, period, en, ox, state, s = line.split(',')
        els[sym] = {
            'Z': int(z), 'cat': cat, 'group': int(group) if group else None,
            'en': float(en) if en else None,
            'ox': [int(x) for x in ox.split()] if ox else [],
            'metal': cat in ('am', 'ae', 'tm', 'pt', 'ln', 'an', 'uk'),
        }
    model = open(os.path.join(ROOT, 'js', 'model.js'), encoding='utf-8').read()
    model = json.loads(model[model.index('var ATLAS_MODEL = ') + 18: model.index(';\nif (typeof module')])
    props = {s: [math.nan if v is None else v for v in vals] for s, vals in model['elements'].items()}
    return els, props


ELS, PROPS = load_elements()
P = len(next(iter(PROPS.values())))


def ox_states(sym):
    """Must match oxStates() in js/predict.js."""
    e = ELS[sym]
    if e['cat'] == 'ng':
        return [x for x in e['ox'] if x > 0]
    states = [x for x in e['ox'] if x != 0]
    if not states:  # superheavies: guess from the group
        g = e['group'] or 3
        states = {1: [1], 2: [2], 13: [3, 1], 14: [2, 4], 15: [3, 1], 16: [2, 4, -2], 17: [-1, 1], 18: []}.get(g, [2, 3])
    if e['metal']:
        return [x for x in states if x > 0]
    if not any(x < 0 for x in states):
        g = e['group'] or 0
        states = states + [{13: -3, 14: -4, 15: -3, 16: -2, 17: -1}.get(g, -1)]
    return states


OX = {s: ox_states(s) for s in ELS}


ANION_WINDOW = 0.5  # only elements this close to the most electronegative one may be anions


def charge_balanced(syms, counts):
    """Must match chargeBalanced() in js/predict.js.

    Each element takes one common oxidation state; the charges must cancel, every anion must be at
    least as electronegative as every cation, and only elements within ANION_WINDOW of the most
    electronegative element may be anions (with oxygen present, C, P and S form CO3, PO4, SO4).
    """
    ens = [ELS[s]['en'] for s in syms if ELS[s]['en'] is not None]
    top = max(ens) if ens else None
    lists = [[q for q in OX[s] if q > 0 or top is None or ELS[s]['en'] is None or ELS[s]['en'] >= top - ANION_WINDOW]
             for s in syms]
    if any(not l for l in lists):
        return False
    if len(syms) >= 5:
        lists = [l[:3] for l in lists]
    for qs in itertools.product(*lists):
        if sum(q * n for q, n in zip(qs, counts)) != 0:
            continue
        pos = [s for s, q in zip(syms, qs) if q > 0]
        neg = [s for s, q in zip(syms, qs) if q < 0]
        if not pos or not neg:
            continue
        ens_pos = [ELS[s]['en'] for s in pos]
        ens_neg = [ELS[s]['en'] for s in neg]
        if None in ens_pos or None in ens_neg or min(ens_neg) >= max(ens_pos):
            return True
    return False


def features(syms, counts):
    """Must match featuresOf() in js/predict.js."""
    total = sum(counts)
    fr = [c / total for c in counts]
    out = []
    for j in range(P):
        vals = [(PROPS[s][j], f) for s, f in zip(syms, fr) if not math.isnan(PROPS[s][j])]
        if not vals:
            out += [math.nan] * 5
            continue
        w = sum(f for _, f in vals)
        mean = sum(v * f for v, f in vals) / w
        lo = min(v for v, _ in vals)
        hi = max(v for v, _ in vals)
        dev = sum(abs(v - mean) * f for v, f in vals) / w
        out += [mean, lo, hi, hi - lo, dev]
    out += [len(syms), max(fr), min(fr), math.sqrt(sum(f * f for f in fr)), 1.0 if charge_balanced(syms, counts) else 0.0]
    return out


def parse(formula):
    counts = {}
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*\.?\d*)', formula):
        counts[el] = counts.get(el, 0) + (float(n) if n else 1.0)
    syms = sorted(counts)
    return syms, [counts[s] for s in syms]


# ---------- candidates (must match candidates() in js/predict.js) ----------

CAPS = {2: (8, 12), 3: (6, 14), 4: (4, 14), 5: (3, 12), 6: (2, 12), 7: (2, 14)}


def candidates(syms):
    n = len(syms)
    max_count, max_total = CAPS[n]
    out = []
    for counts in itertools.product(range(1, max_count + 1), repeat=n):
        if sum(counts) > max_total or reduce(math.gcd, counts) != 1:
            continue
        out.append(list(counts))
    nonmetal = any(not ELS[s]['metal'] and ELS[s]['cat'] != 'ng' for s in syms)
    if nonmetal:
        balanced = [c for c in out if charge_balanced(syms, c)]
        if balanced:
            out = balanced
    return out


def formula_of(syms, counts):
    return ''.join(f'{s}{c if c > 1 else ""}' for s, c in zip(syms, counts))


# ---------- tree export ----------

def export(model):
    trees = []
    for (pred,) in model._predictors:
        nodes = []
        for nd in pred.nodes:
            if nd['is_leaf']:
                nodes.append([-1, 0, 0, 0, 0, round(float(nd['value']), 8)])
            else:
                nodes.append([int(nd['feature_idx']), float(nd['num_threshold']), int(nd['left']), int(nd['right']),
                              int(nd['missing_go_to_left']), 0])
        trees.append(nodes)
    return {'base': float(np.ravel(model._baseline_prediction)[0]), 'trees': trees}


def score(m, x):
    s = m['base']
    for nodes in m['trees']:
        i = 0
        while nodes[i][0] != -1:
            f, thr, left, right, miss, _ = nodes[i]
            v = x[f]
            i = (left if miss else right) if math.isnan(v) else (left if v <= thr else right)
        s += nodes[i][5]
    return s


def main():
    data = {}
    parts = sorted(glob.glob(os.path.join(CACHE, 'alexandria_comp', 'p*.json')))
    if len(parts) != 58:
        raise SystemExit(f'expected 58 composition files, found {len(parts)}; run fetch_alexandria_compositions.py')
    for p in parts:
        for f, fe in json.load(open(p)).items():
            if f not in data or fe < data[f]:
                data[f] = fe
    rows = []
    for f, fe in data.items():
        syms, counts = parse(f)
        if 2 <= len(syms) <= MAX_ELEMENTS and all(s in ELS for s in syms) and -6 < fe < 6:
            rows.append((syms, counts, fe, f))
    print(f'{len(data):,} compositions, {len(rows):,} usable')

    seen = {}
    for syms, *_ in rows:
        for s in syms:
            seen[s] = seen.get(s, 0) + 1
    trained = sorted((s for s, c in seen.items() if c >= MIN_TRAINING), key=lambda s: ELS[s]['Z'])
    print('outside the domain:', sorted((s for s in ELS if s not in trained), key=lambda s: ELS[s]['Z']))

    # split by element combination: a held-out system contributes no formula to training
    key = lambda syms: '-'.join(syms)
    test_sys = lambda syms: zlib.crc32(key(syms).encode()) % 100 < 15
    rng = np.random.default_rng(0)
    rng.shuffle(rows)
    train = [r for r in rows if not test_sys(r[0])][:MAX_TRAIN]
    test = [r for r in rows if test_sys(r[0])][:300_000]
    print(f'train {len(train):,}, held-out formulas {len(test):,}')

    from multiprocessing import Pool
    with Pool() as pool:
        Xtr = np.array(pool.starmap(features, [(r[0], r[1]) for r in train], chunksize=5000), float)
        Xte = np.array(pool.starmap(features, [(r[0], r[1]) for r in test], chunksize=5000), float)
    ytr = np.array([r[2] for r in train])
    yte = np.array([r[2] for r in test])
    reg = HistGradientBoostingRegressor(**PARAMS).fit(Xtr, ytr)
    pte = reg.predict(Xte)
    metrics = {'trainFormulas': len(train), 'heldOutFormulas': len(test),
               'formulaMae': round(float(mean_absolute_error(yte, pte)), 3),
               'formulaBaselineMae': round(float(mean_absolute_error(yte, np.full(len(yte), np.median(ytr)))), 3)}

    print(json.dumps(metrics, indent=1))
    # the held-out model and systems are checked through the browser code by validate_predictions.js
    json.dump({'model': export(reg), 'trained': None, 'metrics': metrics},
              open(os.path.join(CACHE, 'composition-model-holdout.json'), 'w'), separators=(',', ':'))

    # final model on all the data (held-out systems included)
    allr = rows[:MAX_TRAIN]
    with Pool() as pool:
        Xall = np.array(pool.starmap(features, [(r[0], r[1]) for r in allr], chunksize=5000), float)
    reg = HistGradientBoostingRegressor(**PARAMS).fit(Xall, np.array([r[2] for r in allr]))
    model_js = export(reg)
    diff = max(abs(score(model_js, features(r[0], r[1])) - reg.predict([features(r[0], r[1])])[0]) for r in rows[:300])
    print(f'exported trees vs scikit-learn: max difference {diff:.2e} eV/atom')
    assert diff < 1e-3  # leaf values are rounded to 8 decimals
    checks = []  # [elements, candidate count, a formula, its predicted energy, its charge-balance flag]
    for syms, f in ((['Cl', 'Na'], 'ClNa'), (['Fe', 'O'], 'Fe2O3'), (['C', 'Ca', 'O'], 'CCaO3'), (['Cu', 'Zn'], 'Cu2Zn7'),
                    (['Fe', 'Li', 'O', 'P'], 'FeLiO4P')):
        counts = [int(n) if n else 1 for n in re.findall(r'[A-Z][a-z]?(\d*)', f)]
        checks.append([syms, len(candidates(syms)), f, round(score(model_js, features(syms, counts)), 6), features(syms, counts)[-1]])
    print('checks', checks)

    out = {'metrics': metrics, 'trained': trained, 'model': model_js, 'checks': checks}
    hold = json.load(open(os.path.join(CACHE, 'composition-model-holdout.json')))
    hold['trained'] = trained
    json.dump(hold, open(os.path.join(CACHE, 'composition-model-holdout.json'), 'w'), separators=(',', ':'))
    header = """/*
 * GENERATED by scripts/atlas/train_composition_model.py. Do not edit by hand.
 * Gradient-boosted trees: formula -> formation energy (eV/atom), trained on every composition in the
 * Alexandria DFT database. Evaluated in the browser by js/predict.js. Loaded on demand.
 */
"""
    path = os.path.join(ROOT, 'js', 'composition-model.js')
    with open(path, 'w') as fh:
        fh.write(header + 'var COMPOSITION_MODEL = ' + json.dumps(out, separators=(',', ':')) + ';\n'
                 + "if (typeof Predict !== 'undefined' && Predict.modelLoaded) Predict.modelLoaded(COMPOSITION_MODEL);\n"
                 + "if (typeof module !== 'undefined' && module.exports) module.exports = { COMPOSITION_MODEL };\n")
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    sys.setrecursionlimit(10000)
    main()
