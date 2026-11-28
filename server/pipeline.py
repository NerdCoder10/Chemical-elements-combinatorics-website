"""Calculate what forms from a set of elements with a machine-learned interatomic potential.

For a set of 2-4 elements:
  1. Candidate formulas: those whose ions balance with common oxidation states (only elements close to
     the most electronegative one may be anions), or simple ratios when all elements are metals.
  2. Trial crystal structures for each formula: the most common real structure types for that
     composition pattern among Alexandria's 116,712 stable compounds (server/prototypes.json), with the
     new elements substituted in and the cell rescaled; random symmetric crystals (pyxtal) only when no
     structure type with that pattern exists.
  3. Every structure is fully relaxed (atoms and cell) with MACE-MP-0, a universal potential trained on
     ~1.6 million DFT calculations from the Materials Project (Batatia et al., arXiv:2401.00096).
  4. The convex hull (pymatgen) over the pure elements, the compounds of every smaller subset of the
     elements and the new candidates decides what is stable.

This is an approximation of DFT, not a measurement. Its accuracy is checked by validate.py.
"""
import itertools
import json
import math
import os
import re
import time
import warnings
from functools import reduce
from multiprocessing import get_context

import numpy as np

warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.environ.get('CALC_CACHE', os.path.join(HERE, 'cache'))
WORKERS = int(os.environ.get('CALC_WORKERS', os.cpu_count() or 1))
EV_TO_KJ = 96.485332
MAX_ATOMS = 16          # atoms per trial cell
TRIALS = 6              # trial structures per formula
MAX_FORMULAS = 6        # candidate formulas per element set
STEPS = 200             # relaxation steps per structure
MIN_DIST = 0.6          # reject relaxed cells with atoms closer than this x (sum of covalent radii)
FE_FLOOR = -5.0         # eV/atom: no real compound is below this; lower means the potential failed
RELAX_SECONDS = 30      # give up on a structure that has not settled by then
FMAX = 0.05             # eV/Å
GROUPS = [225, 221, 216, 194, 191, 187, 166, 164, 141, 139, 129, 123, 99, 71, 63, 62, 38, 14, 12, 2]
MOLECULES = {'H': 0.74, 'N': 1.10, 'O': 1.21, 'F': 1.42, 'Cl': 1.99, 'Br': 2.28, 'I': 2.67}

# ---------- element data, read from the site's own file ----------


def _load_elements():
    src = open(os.path.join(ROOT, 'js', 'elements.js'), encoding='utf-8').read()
    raw = src[src.index('const RAW = `') + 13:]
    raw = raw[:raw.index('`')]
    els = {}
    for line in raw.strip().split('\n'):
        z, sym, name, mass, cat, group, period, en, ox, state, s = line.split(',')
        els[sym] = {'Z': int(z), 'name': name, 'cat': cat, 'group': int(group) if group else None,
                    'en': float(en) if en else None, 'ox': [int(x) for x in ox.split()] if ox else [],
                    'metal': cat in ('am', 'ae', 'tm', 'pt', 'ln', 'an', 'uk')}
    return els


ELS = _load_elements()
PROTOS = json.load(open(os.path.join(HERE, 'prototypes.json')))


def en_key(sym):
    v = ELS[sym]['en']
    return (1.3 if v is None else v, sym)


def ox_states(sym):
    e = ELS[sym]
    states = [x for x in e['ox'] if x != 0]
    if e['metal']:
        return [x for x in states if x > 0]
    if e['cat'] == 'ng':
        return [x for x in states if x > 0]
    if not any(x < 0 for x in states):
        states = states + [{13: -3, 14: -4, 15: -3, 16: -2, 17: -1}.get(e['group'] or 0, -1)]
    return states


def charge_balanced(syms, counts):
    ens = [ELS[s]['en'] for s in syms if ELS[s]['en'] is not None]
    top = max(ens) if ens else None
    lists = [[q for q in ox_states(s) if q > 0 or top is None or ELS[s]['en'] is None or ELS[s]['en'] >= top - 0.5]
             for s in syms]
    if any(not l for l in lists):
        return False
    for qs in itertools.product(*lists):
        if sum(q * n for q, n in zip(qs, counts)) != 0:
            continue
        pos = [s for s, q in zip(syms, qs) if q > 0]
        neg = [s for s, q in zip(syms, qs) if q < 0]
        if pos and neg:
            ep = [ELS[s]['en'] for s in pos]
            en = [ELS[s]['en'] for s in neg]
            if None in ep or None in en or min(en) >= max(ep):
                return True
    return False


def candidate_formulas(syms):
    """Smallest charge-balanced formulas first (or simple ratios for all-metal sets)."""
    n = len(syms)
    max_count = {2: 6, 3: 4, 4: 3}[n]
    combos = [c for c in itertools.product(range(1, max_count + 1), repeat=n) if reduce(math.gcd, c) == 1]
    combos.sort(key=lambda c: (sum(c), c))
    order = sorted(range(n), key=lambda i: en_key(syms[i]))
    known = lambda c: '-'.join(str(c[i]) for i in order) in PROTOS['patterns']
    if any(not ELS[s]['metal'] and ELS[s]['cat'] != 'ng' for s in syms):
        balanced = [c for c in combos if charge_balanced(syms, c)]
        if balanced:
            return (sorted(balanced, key=lambda c: (not known(c), sum(c))))[:MAX_FORMULAS]
    simple = [c for c in combos if known(c) and sum(c) <= 8] or [c for c in combos if sum(c) <= n + 2]
    simple.sort(key=lambda c: (sum(c), c))
    return simple[:MAX_FORMULAS]


# ---------- relaxation ----------

_CALC = None


def calculator():
    global _CALC
    if _CALC is None:
        import torch
        torch.set_num_threads(1)
        from mace.calculators import mace_mp
        _CALC = mace_mp(model='small', default_dtype='float64', device='cpu')
    return _CALC


def supported():
    """Atomic numbers the potential was trained on."""
    calc = calculator()
    return {int(z) for z in calc.models[0].atomic_numbers.tolist()}


def relax(atoms, cell=True):
    from ase.filters import FrechetCellFilter
    from ase.optimize import FIRE
    atoms.calc = calculator()
    t0 = time.time()
    try:
        opt = FIRE(FrechetCellFilter(atoms) if cell else atoms, logfile=None)
        # check every step: a collapsing cell makes the neighbour search explode, so stop early
        for _ in opt.irun(fmax=FMAX, steps=STEPS):
            if cell and not 3.0 < atoms.get_volume() / len(atoms) < 150.0:
                return None
            if time.time() - t0 > RELAX_SECONDS:
                return None
        e = atoms.get_potential_energy() / len(atoms)
        if not np.isfinite(e) or not physical(atoms):
            return None
        return float(e), atoms
    except Exception:
        return None


def physical(atoms):
    """False if any two atoms are closer than MIN_DIST x their covalent radii (a collapsed cell),
    or the cell volume per atom is absurd."""
    from ase.data import covalent_radii
    from ase.neighborlist import neighbor_list
    if atoms.pbc.any():
        vol = atoms.get_volume() / len(atoms)
        if not 3.0 < vol < 150.0:
            return False
    i, j, d = neighbor_list('ijd', atoms, 3.5)
    if len(d):
        z = atoms.get_atomic_numbers()
        lim = MIN_DIST * (covalent_radii[z[i]] + covalent_radii[z[j]])
        if (d < lim).any():
            return False
    return True


def _decorated(args):
    """Relax one structure type with the target elements substituted in."""
    from ase import Atoms
    from ase.data import covalent_radii, atomic_numbers
    proto, targets = args
    old = [proto['elements'][r] for r in proto['ranks']]
    new = [targets[r] for r in proto['ranks']]
    lat = np.array(proto['lattice'])
    v_old = sum(covalent_radii[atomic_numbers[x]] ** 3 for x in old)
    v_new = sum(covalent_radii[atomic_numbers[x]] ** 3 for x in new)
    lat = lat * (v_new / v_old) ** (1 / 3)
    atoms = Atoms(new, scaled_positions=proto['frac'], cell=lat, pbc=True)
    res = relax(atoms)
    if res is None:
        return None
    e, atoms = res
    sg = proto['sg'].split(' (')[0]
    return e, {**_structure_info(atoms), 'prototype': f"{sg} structure type (as in {proto['example']})"}


def _trial(args):
    syms, counts, group, z, seed = args
    from pyxtal import pyxtal
    np.random.seed(seed)
    c = pyxtal()
    try:
        c.from_random(3, group, syms, [n * z for n in counts])
    except Exception:
        return None
    if not c.valid:
        return None
    res = relax(c.to_ase())
    if res is None:
        return None
    e, atoms = res
    return e, _structure_info(atoms)


def _structure_info(atoms):
    from pymatgen.io.ase import AseAtomsAdaptor
    from pymatgen.symmetry.analyzer import SpacegroupAnalyzer
    s = AseAtomsAdaptor.get_structure(atoms)
    try:
        sg = SpacegroupAnalyzer(s, symprec=0.1).get_space_group_symbol()
    except Exception:
        sg = 'P1'
    return {'spacegroup': sg, 'cif': s.to(fmt='cif'), 'density': round(float(s.density), 3)}


def _molecule(sym):
    from ase import Atoms
    if sym in MOLECULES:
        d = MOLECULES[sym]
        m = Atoms(sym + '2', positions=[[0, 0, 0], [0, 0, d]], cell=[15, 15, 15], pbc=False)
        m.center()
        res = relax(m, cell=False)
        return (res[0], 'diatomic molecule') if res else None
    if ELS[sym]['cat'] == 'ng':
        m = Atoms(sym, positions=[[7.5, 7.5, 7.5]], cell=[15, 15, 15], pbc=False)
        m.calc = calculator()
        return float(m.get_potential_energy()), 'isolated atom'
    return None


def _cached(name):
    path = os.path.join(CACHE, name)
    return json.load(open(path)) if os.path.exists(path) else None


def _store(name, data):
    os.makedirs(CACHE, exist_ok=True)
    json.dump(data, open(os.path.join(CACHE, name), 'w'))


def element_reference(sym, pool):
    """Lowest energy per atom of the pure element: standard crystal, molecule, or random search."""
    hit = _cached(f'el_{sym}.json')
    if hit:
        return hit
    from ase import Atoms
    from ase.build import bulk
    best = None
    gs = PROTOS['elements'].get(sym)
    if gs:
        res = relax(Atoms([sym] * gs['n'], scaled_positions=gs['frac'], cell=gs['lattice'], pbc=True))
        if res:
            best = (res[0], 'ground-state crystal (Alexandria)')
    try:
        res = relax(bulk(sym))
        if res and (best is None or res[0] < best[0]):
            best = (res[0], 'standard crystal')
    except Exception:
        pass
    mol = _molecule(sym)
    if mol and (best is None or mol[0] < best[0]):
        best = mol
    if best is None:
        tasks = [([sym], [1], g, z, 100 + i) for i, (g, z) in enumerate([(225, 4), (229, 2), (194, 2), (166, 3), (62, 4), (14, 4)])]
        for r in pool.map(_trial, tasks):
            if r and (best is None or r[0] < best[0]):
                best = (r[0], f"crystal ({r[1]['spacegroup']})")
    if best is None:
        raise RuntimeError(f'No valid reference structure for {sym}')
    out = {'element': sym, 'energy_per_atom': best[0], 'form': best[1]}
    _store(f'el_{sym}.json', out)
    return out


def formula_search(syms, counts, pool):
    """Lowest-energy relaxed structure for one formula: substituted structure types, else random crystals."""
    g = reduce(math.gcd, counts)
    counts = [c // g for c in counts]
    name = 'f_' + ''.join(f'{s}{c}' for s, c in zip(syms, counts)) + '.json'
    hit = _cached(name)
    if hit:
        return hit
    # energies more than FE_FLOOR below the separated elements are failures of the potential, not chemistry
    total = sum(counts)
    floor = sum(element_reference(s, pool)['energy_per_atom'] * c / total for s, c in zip(syms, counts)) + FE_FLOOR
    sane = lambda rs: [r for r in rs if r and r[0] >= floor]
    order = sorted(range(len(syms)), key=lambda i: en_key(syms[i]))
    targets = [syms[i] for i in order]
    key = '-'.join(str(counts[i]) for i in order)
    protos = PROTOS['patterns'].get(key, [])
    if protos:
        results = sane(pool.map(_decorated, [(p, targets) for p in protos]))
        if results:
            e, info = min(results, key=lambda r: r[0])
            out = {'syms': syms, 'counts': counts, 'energy_per_atom': e, 'trials': len(results), **info}
            _store(name, out)
            return out
    per_fu = sum(counts)
    zs = [z for z in (1, 2, 3, 4) if per_fu * z <= MAX_ATOMS] or [1]
    rng = np.random.default_rng(abs(hash(name)) % (2 ** 32))
    tasks = []
    for i in range(TRIALS * 3):  # extra attempts: some space groups cannot host the composition
        tasks.append((syms, counts, int(rng.choice(GROUPS)), int(zs[i % len(zs)]), int(rng.integers(1 << 30))))
    results = sane(pool.map(_trial, tasks[:TRIALS * 2]))
    if len(results) < TRIALS // 2:
        results += sane(pool.map(_trial, tasks[TRIALS * 2:]))
    if not results:
        out = {'syms': syms, 'counts': counts, 'energy_per_atom': None, 'trials': 0}
    else:
        e, info = min(results, key=lambda r: r[0])
        out = {'syms': syms, 'counts': counts, 'energy_per_atom': e, 'trials': len(results), **info,
               'prototype': 'random symmetric crystal (no known structure type with this pattern)'}
    _store(name, out)
    return out


def reduced_formula(syms, counts):
    from pymatgen.core import Composition
    return Composition(dict(zip(syms, counts))).reduced_formula


def _subset_formulas(sub, pool):
    return [formula_search(list(sub), list(c), pool) for c in candidate_formulas(list(sub))]


def calculate(elements, pool=None):
    """Full calculation for 2-4 element symbols. Returns a JSON-ready dict."""
    from pymatgen.analysis.phase_diagram import PDEntry, PhaseDiagram
    from pymatgen.core import Composition
    t0 = time.time()
    syms = sorted(set(elements))
    if not 2 <= len(syms) <= 4:
        raise ValueError('Choose 2 to 4 different elements.')
    unknown = [s for s in syms if s not in ELS]
    if unknown:
        raise ValueError(f'Unknown element symbol: {", ".join(unknown)}')
    key = '-'.join(syms)
    hit = _cached(f'set_{key}.json')
    if hit:
        hit['cached'] = True
        return hit
    covered = supported()
    missing = [s for s in syms if ELS[s]['Z'] not in covered]
    if missing:
        return {'elements': syms, 'status': 'unsupported', 'missing': missing,
                'message': f'The potential was not trained on {", ".join(ELS[s]["name"] for s in missing)}, so it cannot calculate this combination.'}
    own = pool is None
    if own:
        pool = get_context('fork').Pool(WORKERS)
    try:
        refs = {s: element_reference(s, pool) for s in syms}
        searched = []
        for k in range(2, len(syms) + 1):
            for sub in itertools.combinations(syms, k):
                for f in _subset_formulas(sub, pool):
                    if f['energy_per_atom'] is None:
                        continue
                    comp = Composition(dict(zip(f['syms'], f['counts'])))
                    searched.append((sub, f, comp))
        tested, products = [], []
        valid = []
        for sub, f, comp in searched:
            ref = sum(refs[s]['energy_per_atom'] * comp.get_atomic_fraction(s) for s in f['syms'])
            if f['energy_per_atom'] - ref >= FE_FLOOR:
                valid.append((sub, f, comp))
        searched = valid
        entries = [PDEntry(Composition(s), refs[s]['energy_per_atom']) for s in syms] + [
            PDEntry(comp, f['energy_per_atom'] * comp.num_atoms, name=comp.reduced_formula) for _, f, comp in searched]
        pd = PhaseDiagram(entries)
        for sub, f, comp in searched:
            ref = sum(refs[s]['energy_per_atom'] * comp.get_atomic_fraction(s) for s in f['syms'])
            fe = f['energy_per_atom'] - ref
            ehull = pd.get_e_above_hull(PDEntry(comp, f['energy_per_atom'] * comp.num_atoms))
            row = {'formula': comp.reduced_formula, 'elements': list(sub), 'fe_eV_per_atom': round(fe, 4),
                   'dHf_kJ_per_mol': round(fe * comp.reduced_composition.num_atoms * EV_TO_KJ, 1),
                   'e_above_hull': round(ehull, 4), 'spacegroup': f.get('spacegroup'), 'trials': f['trials'],
                   'structure_type': f.get('prototype')}
            if len(sub) == len(syms):
                tested.append(row)
                if ehull < 0.001 and fe < 0:
                    products.append({**row, 'cif': f.get('cif')})
        tested.sort(key=lambda r: r['e_above_hull'])
        products.sort(key=lambda r: r['fe_eV_per_atom'])
        decomposition = []
        if not products and tested:
            least = min(searched, key=lambda x: pd.get_e_above_hull(PDEntry(x[2], x[1]['energy_per_atom'] * x[2].num_atoms))
                        if len(x[0]) == len(syms) else 9)
            comp = least[2]
            dec = pd.get_decomposition(comp)
            decomposition = [{'formula': e.composition.reduced_formula, 'fraction': round(float(w), 3)} for e, w in dec.items()]
        out = {
            'elements': syms, 'status': 'ok', 'products': products, 'tested': tested, 'decomposition': decomposition,
            'references': refs, 'seconds': round(time.time() - t0, 1),
            'method': 'MACE-MP-0 (small) machine-learned potential; trial structures from the structure types of '
                      "Alexandria's stable compounds (random symmetric crystals where none fit); full relaxation; "
                      'convex hull with pymatgen',
            'note': 'Approximation of DFT (PBE). Formation energies relative to the elements relaxed with the same potential.',
        }
        _store(f'set_{key}.json', out)
        return out
    finally:
        if own:
            pool.close()
            pool.join()
