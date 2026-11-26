# DFT calculations for the site

Two engines, same physics (PBE density-functional theory):

| Engine | Script | NaCl check (ΔHf°, measured −411.2 kJ/mol) | Time for that check (4 cores) |
|---|---|---|---|
| Quantum ESPRESSO 7.3.1 (plane waves, PseudoDojo NC v0.4, 90 Ry) | `qe.py`, `qe_validate_nacl.py` | −357.7 kJ/mol | 139 s |
| PySCF (Gaussian basis, GTH pseudopotentials) | `pyscf_dft.py`, `validate_nacl.py` | −365.6 kJ/mol | 19 min |

PBE underbinds chlorides by about 10–15 %, so both land below the measured value by the expected amount.

## Setup (Ubuntu)

```sh
apt-get install -y gfortran libopenblas-dev libfftw3-dev libopenmpi-dev openmpi-bin make
curl -L -o qe.tar.gz https://gitlab.com/QEF/q-e/-/archive/qe-7.3.1/q-e-qe-7.3.1.tar.gz && tar xzf qe.tar.gz
cd q-e-qe-7.3.1 && ./configure MPIF90=mpif90 --with-scalapack=no && make -j4 pw   # Ubuntu's packaged pw.x 6.7 aborts
curl -L -o dojo.tgz https://www.pseudo-dojo.org/pseudos/nc-sr-04_pbe_standard_upf.tgz   # unpack into data/cache/dojo
pip install ase pyscf
```

Results are cached as JSON (+ CIF structures) in `data/calculated/`; `export_calculated.py` publishes
`result_*.json` entries to `js/calculated.js` for the site.

## What one calculation costs

A compound whose crystal structure is already known takes about a minute on 4 cores (NaCl: 58 s,
including relaxing the cell). An untested combination has no known structure, so each candidate
formula has to be tried in many candidate structures, and every competing compound has to be
calculated too, before the convex hull says what forms. That is hundreds of relaxations of 10–40-atom
cells per element combination: hours to days on 4 cores.
