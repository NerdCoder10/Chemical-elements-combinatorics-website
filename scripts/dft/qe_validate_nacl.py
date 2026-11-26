#!/usr/bin/env python3
"""Check the Quantum ESPRESSO setup on NaCl (measured ΔHf° = -411.2 kJ/mol, NIST-JANAF)."""
import os
import sys
import time

from ase import Atoms
from ase.build import bulk

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qe import run  # noqa: E402

EV = 96.485332
t = time.time()
na = run(bulk('Na', 'bcc', a=4.23), 'Na_bcc')
cl2 = run(Atoms('Cl2', positions=[[6, 6, 5.0], [6, 6, 6.99]], cell=[12, 12, 12], pbc=True), 'Cl2_molecule', molecule=True, spin=False)
nacl = run(bulk('NaCl', 'rocksalt', a=5.64), 'NaCl_rocksalt')
dh = nacl['energy'] / (nacl['natoms'] / 2) - na['energy_per_atom'] - cl2['energy'] / 2
print({k: v['seconds'] for k, v in (('Na', na), ('Cl2', cl2), ('NaCl', nacl))}, 'converged', na['converged'], cl2['converged'], nacl['converged'])
print(f'ΔHf(NaCl) = {dh * EV:.1f} kJ/mol (measured -411.2); total {time.time() - t:.0f} s')
