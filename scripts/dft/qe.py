#!/usr/bin/env python3
"""DFT with Quantum ESPRESSO 7.3.1 (compiled from source) through ASE, cached in data/calculated/.

Method, the same for every calculation so energies combine into formation energies:
  PBE; PseudoDojo norm-conserving pseudopotentials v0.4 (standard accuracy; van Setten et al.,
  Comput. Phys. Commun. 226, 39 (2018)); 90 Ry plane-wave cutoff; Marzari-Vanderbilt smearing 0.01 Ry;
  Monkhorst-Pack k-points, at least 5 per 1/Å; full relaxation of atoms and cell (vc-relax), or of the
  atoms only for molecules (12 Å box, Gamma point); spin-polarised when a magnetic element is present.
Build QE:  configure MPIF90=mpif90 --with-scalapack=no && make pw  (see scripts/dft/README.md)
Pseudopotentials: https://www.pseudo-dojo.org/pseudos/nc-sr-04_pbe_standard_upf.tgz -> data/cache/dojo
"""
import json
import os
import shutil
import time

from ase.calculators.calculator import kptdensity2monkhorstpack
from ase.calculators.espresso import Espresso, EspressoProfile
from ase.io import write

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'calculated')
WORK = os.path.join(ROOT, 'data', 'cache', 'qe-work')
PW = os.environ.get('QE_PW', '/opt/qe-src/q-e-qe-7.3.1/bin/pw.x')
PSEUDO = '/opt/dojo'  # short link to data/cache/dojo (long paths are avoided by older pw.x builds)
NPROC = os.cpu_count() or 1
MAGNETIC = {'Fe': 3.0, 'Co': 2.0, 'Ni': 1.0, 'Mn': 4.0, 'Cr': 3.0, 'V': 2.0, 'Gd': 7.0}
SETTINGS = dict(ecutwfc=90, degauss=0.01, kptdensity=5.0, box=12.0)
os.environ.setdefault('OMP_NUM_THREADS', '1')


def run(atoms, label, molecule=False, spin=None):
    """Relax `atoms`; return {'energy': eV per cell, 'natoms', ...}. Cached by label."""
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'qe_{label}.json')
    if os.path.exists(path):
        return json.load(open(path))
    els = sorted(set(atoms.get_chemical_symbols()))
    if spin is None:
        spin = any(e in MAGNETIC for e in els)
    system = dict(ecutwfc=SETTINGS['ecutwfc'], occupations='smearing', smearing='mv', degauss=SETTINGS['degauss'])
    if spin:
        system['nspin'] = 2
        atoms.set_initial_magnetic_moments([MAGNETIC.get(s, 1.0 if molecule else 0.0) for s in atoms.get_chemical_symbols()])
    data = {'control': dict(calculation='relax' if molecule else 'vc-relax', tprnfor=True, tstress=True,
                            forc_conv_thr=1e-3, etot_conv_thr=1e-5, disk_io='none'),
            'system': system, 'electrons': dict(conv_thr=1e-8, mixing_beta=0.4),
            'ions': {}, 'cell': {} if molecule else dict(press_conv_thr=0.5)}
    kpts = (1, 1, 1) if molecule else tuple(int(k) for k in kptdensity2monkhorstpack(atoms, SETTINGS['kptdensity']))
    work = os.path.join(WORK, label)
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    profile = EspressoProfile(command=f'mpirun --allow-run-as-root -np {NPROC} {PW}', pseudo_dir=PSEUDO)
    atoms.calc = Espresso(profile=profile, directory=work, pseudopotentials={e: f'{e}.upf' for e in els},
                          input_data=data, kpts=kpts)
    t = time.time()
    energy = atoms.get_potential_energy()
    out = open(os.path.join(work, 'espresso.pwo')).read()
    res = {'label': label, 'formula': atoms.get_chemical_formula(mode='hill'), 'natoms': len(atoms), 'energy': energy,
           'energy_per_atom': energy / len(atoms), 'kpts': list(kpts), 'cell': atoms.cell.lengths().round(4).tolist(),
           'seconds': round(time.time() - t, 1), 'method': 'Quantum ESPRESSO 7.3.1, PBE, PseudoDojo NC v0.4, 90 Ry',
           'converged': ('bfgs converged' in out) or ('End of BFGS' in out) or ('End final coordinates' in out)}
    write(os.path.join(OUT, f'qe_{label}.cif'), atoms)
    json.dump(res, open(path, 'w'), indent=1)
    return res
