# Chemical-elements-combinatorics-website

**Element Combinator** is an interactive periodic table. Click any of the 118 elements, optionally pick an isotope, and combine up to four of them. For each result the site shows what forms (or why nothing does), the balanced chemical equation, and ΔH°, ΔS° and ΔG°. A temperature slider shows how ΔG changes with temperature.

## Run it

It's a static site with no build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

It also works as-is on GitHub Pages. The URL hash holds the current selection, so links can be shared (e.g. `index.html#Na+Cl`, `index.html#2H+3H`).

## Features

- **Reaction lab**: periodic table, reaction tray with isotope pickers, and result cards with the equation, ΔH°, ΔS°, ΔG(T), and whether/when the reaction is favourable.
- **All combinations map**: a 118 × 118 grid of all 7,021 element pairs, coloured by outcome. Click a cell to open that pair.
- **Compound database**: a sortable, searchable table of every tabulated compound's ΔHf°, ΔSf° and ΔGf°.
- **Element details**: atomic weight, electronegativity, oxidation states, standard state, S°, and **all 3,339 known isotopes** (from NUBASE2020) with half-life, decay modes, natural abundance, atomic mass and discovery year.
- **Theory explorer**: computed (DFT) results for **32,619 element combinations** (3,507 pairs, 19,785 triples, 7,841 quadruples, and 1,486 sets of 5–7 elements) covering 65,307 compounds. Filter and sort them, and read statistics computed from the whole dataset: which elements and families form the most compounds, the most exothermic ones, and stable compounds with no experimental record.
- **Every database, combined**: for any combination of 2–7 elements, the lab reports what PubChem (124.7 million compounds), the Crystallography Open Database (431,778 measured crystal structures) and Alexandria (5.8 million DFT calculations) hold for exactly those elements: **817,518 distinct combinations** in total. Stable Alexandria compounds come with balanced formation reactions.
- **Calculated on request**: combinations no database covers can be calculated for the site with real DFT (`scripts/dft/`, PySCF, PBE). Results are stored with their raw energies in `data/calculated/` and shown in the lab. Checked on NaCl: −365.6 kJ/mol calculated vs −411.2 kJ/mol measured (the known PBE error for chlorides); geometries within 2%.
- **No guesses**: a combination that has never been measured or calculated is shown as *Unknown: never made or calculated*. The site does not estimate outcomes, and where only an energy was calculated (DFT), ΔS and ΔG are left blank instead of estimated.
- **Installable app**: on GitHub Pages the site is a progressive web app. Install it from the browser (Android/desktop: "Install app"; iPhone: Share → Add to Home Screen), and it works offline.
- **Molecules (atomic-level view)**: an animated 2D simulation of any reaction. Atoms are drawn in standard CPK colours and bonded into schematic structures. Molecules move at temperature-dependent speeds and react only when a collision beats the activation barrier, and their atoms visibly regroup into the products. Exothermic reactions heat the gas, so a spark can set off a chain reaction. Pick one of 12 examples, type any equation (it is balanced automatically), or tap **Watch it at the atomic level** on a reaction in the lab. Temperature, barrier, amount, heat retention and speed are adjustable, and the panel lists the bonds broken and formed and the energy per event.
- **Real-world uses**: every reaction product shows what it is used for (with safety and environmental notes), on the lab's reaction cards and in the Molecules tab. All 191 tabulated compounds are covered; for anything else there is a link to PubChem.
- **Nuclear reactions**: picking specific isotopes (e.g. ²H + ³H, ¹H + ⁷Li) shows fusion and transmutation reactions with their Q-values.

## Where the numbers come from

| Case | What you get |
|---|---|
| Compound in the database (~190 compounds) | Measured ΔHf° and S° (NIST-JANAF / CODATA / CRC). The formation reaction is balanced automatically, and ΔH° and ΔS° are computed with Hess's law. |
| Combination computed in JARVIS-DFT (NIST) | DFT formation energy for every computed compound. Stability comes from a convex hull recomputed by `scripts/build_dft.py` with pymatgen. Against 132 measured solids the mean error is ≈14 kJ/mol per atom, with the sign right in 132/132. 71% of experimentally known compounds come out exactly stable, and 93% lie within 0.1 eV/atom. DFT gives no entropy, so ΔS and ΔG are left blank. |
| Helium, neon or argon | No compounds at ordinary conditions: ΔH° = ΔS° = 0. |
| Never measured or calculated | Shown as unknown. Nothing is estimated. |
| Same element twice | Bond formation from free atoms, or allotrope changes (O₂→O₃, graphite→diamond, white→grey tin). |
| Elements 101–118 | Only made a few atoms at a time, so no bulk thermochemistry exists. |

Isotopes share the same electron structure, so their chemistry is essentially identical. The exception is hydrogen: D₂O is included with its own data.

## Project layout

```
index.html          page structure
css/style.css       styles (light/dark)
js/elements.js      118 elements: weights, categories, electronegativity, oxidation states, S°
js/isotopes.js      all known isotopes (GENERATED from data/nubase_4.mas20.txt)
js/thermo.js        ΔHf° / S° database for compounds, atoms and allotropes
js/dft.js           65,307 DFT-computed compounds (GENERATED by scripts/build_dft.py)
js/theory.js        indexes the DFT data by element combination
js/engine.js        formula parsing, balancing, thermodynamics
js/atlas-summary.js atlas totals, all pairs, ranked lists (GENERATED by scripts/atlas/build_atlas.py)
js/atlas/bNN.js     817,518 combination records in 64 chunks, loaded on demand (GENERATED)
js/atlas.js         atlas lookups (what each database holds)
js/uses.js          real-world uses and safety notes for compounds
js/molecular.js     atomic-level reaction simulation (Molecules tab)
js/calculated.js    DFT results calculated for this site (GENERATED by scripts/dft/export_calculated.py)
js/app.js           UI
sw.js, manifest.webmanifest, icons/   installable app (PWA)
data/nubase_4.mas20.txt   NUBASE2020 source file (IAEA/AMDC)
scripts/build_isotopes.py regenerates js/isotopes.js
tests/engine.test.js
```

To regenerate the isotope data: `python3 scripts/build_isotopes.py`.
To regenerate the DFT data: `pip install pymatgen && python3 scripts/build_dft.py`. This downloads the JARVIS dataset (~48 MB, checksum-verified) into `data/cache/`, which is git-ignored.

To rebuild the database atlas (needs `pip install ijson`; downloads ~7 GB in total, streamed or cached in `data/cache/`):

```sh
python3 scripts/atlas/fetch_pubchem.py      # PubChem CID-Mass, MD5-verified
python3 scripts/atlas/fetch_cod.py          # COD via JARVIS
python3 scripts/atlas/fetch_alexandria.py   # 58 Alexandria files, in parallel
python3 scripts/atlas/build_atlas.py
```

Run the tests with `node tests/engine.test.js`.

## Install it on your phone

1. In the GitHub repository, open **Settings → Pages**, and under **Build and deployment** choose **Deploy from a branch**, then pick the branch and the `/ (root)` folder.
2. Open the published address (`https://<owner>.github.io/<repository>/`) on your phone.
3. Android (Chrome): tap **Install app** on the page, or **⋮ → Install app**. iPhone/iPad (Safari): tap **Share → Add to Home Screen**.
