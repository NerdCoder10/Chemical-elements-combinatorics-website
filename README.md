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
- **Nuclear reactions**: picking specific isotopes (e.g. ²H + ³H, ¹H + ⁷Li) shows fusion and transmutation reactions with their Q-values.

## Where the numbers come from

| Case | What you get |
|---|---|
| Compound in the database (~190 compounds) | Measured ΔHf° and S° (NIST-JANAF / CODATA / CRC). The formation reaction is balanced automatically, and ΔH° and ΔS° are computed with Hess's law. |
| Metal + nonmetal, or nonmetal + nonmetal, with no tabulated data | A formula predicted from common oxidation states. ΔH comes from Pauling's electronegativity relation and ΔS from additive atomic entropies. These are **clearly labelled estimates**. |
| Metal + metal | An alloy, not a compound. ΔS is the ideal entropy of mixing. ΔH of mixing is not tabulated. |
| Noble gas (apart from Xe/Kr fluorides etc.) | No reaction: ΔH° = ΔS° = 0. |
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
js/engine.js        formula parsing, balancing, thermodynamics, predictions
js/app.js           UI
data/nubase_4.mas20.txt   NUBASE2020 source file (IAEA/AMDC)
scripts/build_isotopes.py regenerates js/isotopes.js
tests/engine.test.js
```

To regenerate the isotope data: `python3 scripts/build_isotopes.py`.

Run the tests with `node tests/engine.test.js`.
