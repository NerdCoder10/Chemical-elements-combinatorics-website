#!/usr/bin/env python3
"""Real DFT calculations with PySCF (periodic boundary conditions), cached on disk.

Method (the same for every calculation, so energies can be combined into formation energies):
  PBE functional; GTH-PBE pseudopotentials with the matching gth-dzvp-molopt-sr basis
  (Goedecker-Teter-Hutter, VandeVondele & Hutter, J. Chem. Phys. 127, 114105 (2007));
  Gaussian density fitting; Monkhorst-Pack k-points; Fermi smearing (0.005 Ha) for metals.
  Solids: the energy is computed at several lattice constants and the minimum is found by fitting a
  parabola (a uniform-scaling relaxation). Molecules: the same periodic code in a 10 Å box at the Gamma
  point, scanning the bond length, so solids and molecules share every convention.
Results go to data/calculated/<label>.json (kept in the repository). Run a file with: python3 scripts/dft/<script>.py
"""
import json
import os
import time

import numpy as np
from pyscf.pbc import dft, gto, scf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'calculated')
BASIS, PSEUDO, XC = 'gth-dzvp-molopt-sr', 'gth-pbe', 'pbe'


def energy(atom, a_vectors, kmesh, metal=False, spin=0):
    cell = gto.Cell()
    cell.atom, cell.a = atom, a_vectors
    cell.basis, cell.pseudo, cell.spin = BASIS, PSEUDO, spin
    cell.verbose, cell.precision = 0, 1e-8
    cell.build()
    kpts = cell.make_kpts(kmesh)
    mf = (dft.KUKS if spin else dft.KRKS)(cell, kpts).density_fit()
    mf.xc, mf.conv_tol, mf.max_cycle = XC, 1e-8, 200
    if metal:
        mf = scf.addons.smearing_(mf, sigma=0.005, method='fermi')
    e = mf.kernel()
    if not mf.converged:
        raise RuntimeError('SCF did not converge')
    return float(e) * 27.211386245988  # Hartree -> eV per cell


def scan(label, build, values, **kw):
    """Energy at each value of a structural parameter; parabola fit for the minimum. Cached."""
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{label}.json')
    if os.path.exists(path):
        return json.load(open(path))
    t = time.time()
    es = []
    for v in values:
        atom, a = build(v)
        es.append(energy(atom, a, **kw))
        print(f'  {label}: {v:.4f} -> {es[-1]:.6f} eV', flush=True)
    c = np.polyfit(values, es, 2)
    vmin = -c[1] / (2 * c[0])
    if not (min(values) <= vmin <= max(values)):
        raise RuntimeError(f'{label}: minimum {vmin:.3f} outside the scanned range {values}')
    atom, a = build(vmin)
    emin = energy(atom, a, **kw)
    res = {'label': label, 'parameter': vmin, 'energy': emin, 'scan': list(zip(values, es)),
           'method': f'PySCF PBC {XC.upper()}/{BASIS}/{PSEUDO}', 'seconds': round(time.time() - t)}
    json.dump(res, open(path, 'w'), indent=1)
    return res
