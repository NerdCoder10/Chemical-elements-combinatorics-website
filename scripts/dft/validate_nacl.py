#!/usr/bin/env python3
"""Check the DFT setup against a measured answer: Na(s) + 1/2 Cl2(g) -> NaCl(s), ΔHf° = -411.2 kJ/mol (NIST-JANAF).
Run: python3 scripts/dft/validate_nacl.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyscf_dft import scan  # noqa: E402

EV = 96.485332
fcc = lambda a: [[0, a / 2, a / 2], [a / 2, 0, a / 2], [a / 2, a / 2, 0]]
bcc = lambda a: [[-a / 2, a / 2, a / 2], [a / 2, -a / 2, a / 2], [a / 2, a / 2, -a / 2]]
box = [[10, 0, 0], [0, 10, 0], [0, 0, 10]]

nacl = scan('NaCl_rocksalt', lambda a: ([['Na', (0, 0, 0)], ['Cl', (a / 2, 0, 0)]], fcc(a)), [5.5, 5.65, 5.8], kmesh=[4, 4, 4])
na = scan('Na_bcc', lambda a: ([['Na', (0, 0, 0)]], bcc(a)), [4.1, 4.2, 4.3], kmesh=[8, 8, 8], metal=True)
cl2 = scan('Cl2_molecule', lambda d: ([['Cl', (5, 5, 5 - d / 2)], ['Cl', (5, 5, 5 + d / 2)]], box), [1.96, 2.0, 2.04], kmesh=[1, 1, 1])
dh = nacl['energy'] - na['energy'] - cl2['energy'] / 2
print(f'a(NaCl) = {nacl["parameter"]:.3f} Å (measured 5.640), a(Na) = {na["parameter"]:.3f} Å (measured 4.225), d(Cl2) = {cl2["parameter"]:.3f} Å (measured 1.988)')
print(f'ΔHf(NaCl) = {dh:.3f} eV = {dh * EV:.1f} kJ/mol   (measured -411.2 kJ/mol)')

import json  # noqa: E402
json.dump({'elements': ['Cl', 'Na'], 'formula': 'NaCl', 'structure': 'rocksalt', 'dHf_kJ_per_mol': round(dh * EV, 1),
           'measured_kJ_per_mol': -411.2, 'method': nacl['method'], 'parts': ['NaCl_rocksalt', 'Na_bcc', 'Cl2_molecule'],
           'purpose': 'validation'}, open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                                                    'data', 'calculated', 'result_NaCl.json'), 'w'), indent=1)
