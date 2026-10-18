#!/usr/bin/env python3
"""Train the model that theorises about element combinations no database has explored.

Training data: every 2-, 3- and 4-element combination that Alexandria computed (~680,000).
  * classifier: does the combination have at least one compound on the convex hull?
  * regressor:  lowest formation energy (eV/atom) found for the combination.
Features: mean, min, max and range over the elements of 9 properties (Pauling electronegativity,
Mendeleev number, atomic radius, period, group, atomic mass, first ionisation energy, electron
affinity, melting point; from pymatgen), plus the number of elements.
Both are scikit-learn HistGradientBoosting models, validated on a random 20 % hold-out, then
refit on all data and exported as plain trees to js/model.js, which the browser evaluates.
The script also scores every unexplored pair and triple and stores the most promising ones.
Run:  pip install pymatgen scikit-learn && python3 scripts/atlas/train_model.py
"""
import glob
import itertools
import json
import math
import os
import warnings

import numpy as np
from pymatgen.core.periodic_table import Element
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, roc_auc_score

warnings.filterwarnings('ignore')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, 'data', 'cache')
PROPS = ['electronegativity', 'mendeleev number', 'atomic radius', 'period', 'group', 'atomic mass',
         'first ionisation energy', 'electron affinity', 'melting point']
MIN_TRAINING = 1000  # training combinations an element needs to be inside the model's domain
PARAMS = dict(max_iter=200, max_leaf_nodes=31, learning_rate=0.1, random_state=0)


def num(f):
    try:
        v = float(f())
        return None if math.isnan(v) else v
    except Exception:
        return None


def element_table():
    table = {}
    for z in range(1, 119):
        e = Element.from_Z(z)
        table[e.symbol] = [num(lambda: e.X), num(lambda: e.mendeleev_no), num(lambda: e.atomic_radius),
                           float(e.row), float(e.group), num(lambda: e.atomic_mass),
                           num(lambda: e.ionization_energies[0]), num(lambda: e.electron_affinity),
                           num(lambda: e.melting_point)]
    return table


def features(table, symbols):
    """Must match featuresOf() in js/atlas.js."""
    M = np.array([[np.nan if v is None else v for v in table[s]] for s in symbols], float)
    with np.errstate(all='ignore'):
        mean, lo, hi = np.nanmean(M, 0), np.nanmin(M, 0), np.nanmax(M, 0)
    return list(mean) + list(lo) + list(hi) + list(hi - lo) + [len(symbols)]


def load_alexandria():
    alex = {}
    for p in sorted(glob.glob(os.path.join(CACHE, 'alexandria', 'p*.json'))):
        for k, s in json.load(open(p))['sets'].items():
            a = alex.setdefault(k, [False, math.inf])
            if s['stable']:
                a[0] = True
            cands = [r[1] for r in s['stable']] + ([s['best'][1]] if s['best'] else [])
            a[1] = min([a[1]] + cands)
    return alex


def export(model):
    """Flatten the fitted trees: per node [feature, threshold, left, right, missing-left, value]."""
    trees = []
    for (pred,) in model._predictors:
        nodes = []
        for n in pred.nodes:
            if n['is_leaf']:
                nodes.append([-1, 0, 0, 0, 0, round(float(n['value']), 6)])
            else:
                nodes.append([int(n['feature_idx']), float(n['num_threshold']), int(n['left']),
                              int(n['right']), int(n['missing_go_to_left']), 0])
        trees.append(nodes)
    return {'base': float(np.ravel(model._baseline_prediction)[0]), 'trees': trees}


def raw_score(m, x):
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
    table = element_table()
    alex = load_alexandria()
    keys = [k for k in alex if 2 <= k.count('-') + 1 <= 4]
    X = np.array([features(table, k.split('-')) for k in keys], float)
    y = np.array([alex[k][0] for k in keys], int)
    fe = np.array([alex[k][1] for k in keys], float)
    print(f'{len(keys):,} training combinations, {y.mean():.1%} have a stable compound')

    idx = np.random.default_rng(0).permutation(len(keys))
    tr, te = idx[: int(0.8 * len(idx))], idx[int(0.8 * len(idx)):]
    clf = HistGradientBoostingClassifier(**PARAMS).fit(X[tr], y[tr])
    reg = HistGradientBoostingRegressor(**PARAMS).fit(X[tr], fe[tr])
    p, f = clf.predict_proba(X[te])[:, 1], reg.predict(X[te])
    metrics = {'heldOut': int(len(te)), 'auc': round(roc_auc_score(y[te], p), 3),
               'accuracy': round(accuracy_score(y[te], p > 0.5), 3),
               'baselineAccuracy': round(max(y[te].mean(), 1 - y[te].mean()), 3),
               'feMae': round(mean_absolute_error(fe[te], f), 3),
               'feBaselineMae': round(mean_absolute_error(fe[te], np.full(len(te), np.median(fe[tr]))), 3),
               'bySize': {}}
    for n in (2, 3, 4):
        m = X[te, -1] == n
        metrics['bySize'][n] = {'n': int(m.sum()), 'auc': round(roc_auc_score(y[te][m], p[m]), 3),
                                'accuracy': round(accuracy_score(y[te][m], p[m] > 0.5), 3),
                                'baselineAccuracy': round(max(y[te][m].mean(), 1 - y[te][m].mean()), 3),
                                'feMae': round(mean_absolute_error(fe[te][m], f[m]), 3)}
    print(json.dumps(metrics))

    clf = HistGradientBoostingClassifier(**PARAMS).fit(X, y)  # final models use all the data
    reg = HistGradientBoostingRegressor(**PARAMS).fit(X, fe)
    clf_js, reg_js = export(clf), export(reg)
    for k in keys[:200]:  # the exported trees must reproduce scikit-learn exactly
        x = features(table, k.split('-'))
        assert abs(1 / (1 + math.exp(-raw_score(clf_js, x))) - clf.predict_proba([x])[0, 1]) < 1e-4, k
        assert abs(raw_score(reg_js, x) - reg.predict([x])[0]) < 1e-4, k

    # The model only speaks for elements it has seen enough of. The noble gases He-Xe appear in
    # just 5-84 training combinations (Alexandria hardly computed them), and the model then
    # extrapolates nonsense such as stable neon fluorides, so they are left out of its domain.
    seen = {}
    for k in keys:
        for s in k.split('-'):
            seen[s] = seen.get(s, 0) + 1
    trained = sorted((s for s, c in seen.items() if c >= MIN_TRAINING), key=lambda s: Element(s).Z)
    excluded = sorted((s for s, c in seen.items() if c < MIN_TRAINING), key=lambda s: Element(s).Z)
    print('outside the model domain:', excluded)

    # Score every unexplored pair and triple of those elements.
    promising = {}
    for n in (2, 3):
        cands = ['-'.join(sorted(c)) for c in itertools.combinations(trained, n)]
        cands = [c for c in cands if c not in alex]
        if not cands:
            promising[n] = {'unexplored': 0, 'top': []}
            continue
        Xc = np.array([features(table, c.split('-')) for c in cands], float)
        pc, fc = clf.predict_proba(Xc)[:, 1], reg.predict(Xc)
        order = np.argsort(-pc)[:40]
        promising[n] = {'unexplored': len(cands), 'likelyStable': int((pc > 0.5).sum()),
                        'top': [[cands[i], round(float(pc[i]), 3), round(float(fc[i]), 3)] for i in order]}
        print(f'{n} elements: {len(cands):,} unexplored, {(pc > 0.5).sum():,} predicted to form a stable compound')

    checks = [[k, round(1 / (1 + math.exp(-raw_score(clf_js, features(table, k.split('-'))))), 6),
               round(raw_score(reg_js, features(table, k.split('-'))), 6)] for k in ('Na-Cl', 'Fe-O-Si', 'Cu-Sn-Zn-S')]
    model = {'props': PROPS, 'elements': {s: table[s] for s in table}, 'trained': trained, 'excluded': excluded,
             'checks': checks,
             'metrics': metrics, 'classifier': clf_js, 'regressor': reg_js, 'promising': promising}
    header = """/*
 * GENERATED by scripts/atlas/train_model.py. Do not edit by hand.
 * Gradient-boosted trees trained on Alexandria DFT data; evaluated in the browser by js/atlas.js.
 */
"""
    with open(os.path.join(ROOT, 'js', 'model.js'), 'w') as fh:
        fh.write(header + 'var ATLAS_MODEL = ' + json.dumps(model, separators=(',', ':')) + ';\n'
                 + "if (typeof module !== 'undefined' && module.exports) module.exports = { ATLAS_MODEL };\n")
    print('wrote js/model.js', os.path.getsize(os.path.join(ROOT, 'js', 'model.js')) // 1024, 'KB')


if __name__ == '__main__':
    main()
