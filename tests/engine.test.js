// Run with: node tests/engine.test.js
const assert = require('assert');
const { ELEMENTS, BY_SYMBOL } = require('../js/elements.js');
const { ISOTOPES, NUCLIDE_COUNT } = require('../js/isotopes.js');
const { COMPOUNDS } = require('../js/thermo.js');
const E = require('../js/engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; } catch (err) { console.error(`FAIL: ${name}\n  ${err.message}`); process.exitCode = 1; }
}
const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('all 118 elements, Z = 1..118 in order', () => {
  assert.strictEqual(ELEMENTS.length, 118);
  ELEMENTS.forEach((e, i) => assert.strictEqual(e.Z, i + 1));
  assert.strictEqual(new Set(ELEMENTS.map((e) => e.symbol)).size, 118);
});

test('periodic-table grid positions are unique', () => {
  const pos = new Set(ELEMENTS.map((e) => `${e.row}/${e.col}`));
  assert.strictEqual(pos.size, 118);
});

test('every element has isotopes; natural abundances sum to ~100 %', () => {
  ELEMENTS.forEach((e) => {
    const list = ISOTOPES[e.symbol];
    assert.ok(list && list.length, `no isotopes for ${e.symbol}`);
    const total = list.reduce((s, i) => s + (i.abundance || 0), 0);
    if (total > 0) assert.ok(Math.abs(total - 100) < 0.2, `${e.symbol} abundances sum to ${total}`);
  });
});

test('all 3,339 observed nuclides from NUBASE2020, each element has notable isotopes', () => {
  assert.strictEqual(NUCLIDE_COUNT, 3339);
  const groundStates = Object.values(ISOTOPES).flat().filter((i) => !i.A.endsWith('m'));
  assert.strictEqual(groundStates.length, 3339);
  ELEMENTS.forEach((e) => assert.ok(ISOTOPES[e.symbol].some((i) => i.notable), `no notable isotope for ${e.symbol}`));
  const c14 = ISOTOPES.C.find((i) => i.A === '14');
  assert.strictEqual(c14.halfLife, '5,700 y');
  assert.ok(ISOTOPES.U.find((i) => i.A === '235').decay.startsWith('α'));
});

test('every compound parses into known elements and formation reactions conserve atoms', () => {
  COMPOUNDS.forEach((c) => {
    const r = E.formationReaction(c);
    const left = {};
    const right = {};
    r.left.forEach((t) => {
      const counts = E.countsOf(t.formula);
      Object.keys(counts).forEach((s) => { left[s] = (left[s] || 0) + t.coef * counts[s]; });
    });
    r.right.forEach((t) => {
      const counts = E.countsOf(t.formula);
      Object.keys(counts).forEach((s) => { right[s] = (right[s] || 0) + t.coef * counts[s]; });
    });
    assert.deepStrictEqual(left, right, `unbalanced: ${c.formula}`);
    r.left.forEach((t) => assert.ok(Number.isInteger(t.coef), `fractional coefficient in ${c.formula}`));
    Object.keys(E.countsOf(c.formula)).forEach((s) => assert.ok(s === 'D' || BY_SYMBOL[s], `unknown element ${s}`));
  });
});

test('water: 2H2 + O2 -> 2H2O(l) values', () => {
  const w = COMPOUNDS.find((c) => c.formula === 'H2O' && c.phase === 'l');
  const r = E.formationReaction(w);
  assert.strictEqual(r.perCompound, 2);
  near(r.dH, -571.66);
  near(r.dS, 2 * 69.95 - 2 * 130.68 - 205.15);
});

test('tin pest crossover near 13 °C', () => {
  const [r] = E.sameElementReactions('Sn');
  const Tc = E.crossoverT(r.dH, r.dS);
  assert.ok(Tc > 280 && Tc < 300, `Tc = ${Tc}`);
});

test('noble gases do not react; superheavies have no data', () => {
  // He + F: DFT tried hypothetical helium fluorides and found none stable.
  assert.strictEqual(E.classifyPair('He', 'F'), 'dft-none');
  assert.strictEqual(E.classifyPair('Ne', 'Rn'), 'noble');
  assert.strictEqual(E.classifyPair('Xe', 'F'), 'data');
  assert.strictEqual(E.classifyPair('Og', 'F'), 'superheavy');
  const he = E.combine([{ symbol: 'He' }, { symbol: 'F' }]);
  assert.strictEqual(he[0].status, 'noble');
  assert.strictEqual(he[1].info.status, 'unstable');
});

test('every one of the 7,021 pairs gets a result without throwing', () => {
  let n = 0;
  for (let i = 0; i < 118; i += 1) {
    for (let j = i; j < 118; j += 1) {
      const sel = [{ symbol: ELEMENTS[i].symbol }, { symbol: ELEMENTS[j].symbol }];
      const sections = E.combine(sel);
      assert.ok(sections.length > 0);
      sections.forEach((s) => s.reactions.forEach((r) => {
        assert.ok(r.dH === null || Number.isFinite(r.dH), `bad ΔH for ${sel.map((x) => x.symbol)}`);
        assert.ok(r.dS === null || Number.isFinite(r.dS), `bad ΔS for ${sel.map((x) => x.symbol)}`);
      }));
      n += 1;
    }
  }
  assert.strictEqual(n, 7021);
});

test('predicted formulas follow charge balance', () => {
  assert.strictEqual(E.predictBinary(BY_SYMBOL.Rb, BY_SYMBOL.I).formula, 'RbI');
  assert.strictEqual(E.predictBinary(BY_SYMBOL.Al, BY_SYMBOL.Se).formula, 'Al2Se3');
  assert.strictEqual(E.predictBinary(BY_SYMBOL.Ba, BY_SYMBOL.N).formula, 'Ba3N2');
});

test('DFT predictions: tens of thousands of combinations, NaCl stable and known', () => {
  const T = require('../js/theory.js');
  assert.ok(T.SETS.filter((x) => x.size >= 2).length > 30000);
  const nacl = T.forSet(['Na', 'Cl']).find((e) => e.formula === 'NaCl');
  assert.ok(nacl && nacl.ehull === 0 && nacl.known && nacl.fe < -1.5);
  // a ternary without measured data gets a DFT section with balanced reactions
  const s = E.combine([{ symbol: 'Li' }, { symbol: 'Fe' }, { symbol: 'P' }]).find((x) => x.status === 'dft');
  assert.ok(s && s.reactions.length > 0 && s.reactions.every((r) => r.dH < 0 || r.dft.fe >= 0));
});

test('atlas: model in the browser matches scikit-learn; chunk hashing matches the build', () => {
  const A = require('../js/atlas.js');
  A.MODEL.checks.forEach(([key, p, fe]) => {
    const r = A.predict(key.split('-'));
    assert.ok(Math.abs(r.probability - p) < 1e-6 && Math.abs(r.fe - fe) < 1e-6, key);
  });
  assert.deepStrictEqual(A.predict(['Ne', 'F']).outside, ['Ne']);
  assert.ok(A.SUMMARY.combinations > 800000);
  assert.strictEqual(A.bucketOf('Cl-Na'), 0x4a849bc0 % 64); // FNV-1a, same as scripts/atlas/build_atlas.py
});

test('molecules: equations parse, auto-balance and give tabulated ΔH', () => {
  const M = require('../js/molecular.js');
  const eq = M.parseEquation('C3H8 + O2 -> CO2 + H2O');
  assert.ok(!M.isBalanced(eq) && M.balance(eq));
  assert.deepStrictEqual([...eq.left, ...eq.right].map((t) => t.coef), [1, 5, 3, 4]);
  near(M.thermoFor(M.parseEquation('2 H2(g) + O2(g) -> 2 H2O(g)')).dH, -483.66);
  near(M.thermoFor(M.parseEquation('C(s) + O2(g) -> CO2(g)')).dH, -393.51); // graphite, not free C atoms
  assert.throws(() => M.parseEquation('Xx + O2 -> XxO'));
  assert.throws(() => M.parseEquation('H2 + O2'));
});

test('molecules: structures have the right bonds, angles and ions', () => {
  const M = require('../js/molecular.js');
  assert.deepStrictEqual(M.bondsOf('CO2'), { 'C=O': 2 });
  assert.deepStrictEqual(M.bondsOf('N2'), { 'N≡N': 1 });
  assert.deepStrictEqual(M.bondsOf('CH4'), { 'C–H': 4 });
  const w = M.buildTemplate('H2O').atoms;
  const angle = Math.abs(Math.atan2(w[1].ly - w[0].ly, w[1].lx - w[0].lx) - Math.atan2(w[2].ly - w[0].ly, w[2].lx - w[0].lx)) * 180 / Math.PI;
  near(angle, 104.5, 0.1);
  assert.deepStrictEqual(M.buildTemplate('Fe2O3').atoms.map((a) => a.charge).sort(), [-2, -2, -2, 3, 3]);
  const bc = M.bondChanges(M.parseEquation('2 H2 + O2 -> 2 H2O'));
  assert.deepStrictEqual(bc.broken, { 'H–H': 2, 'O=O': 1 });
  assert.deepStrictEqual(bc.formed, { 'O–H': 4 });
});

test('every tabulated compound and every example product has real-world uses', () => {
  const { usesOf } = require('../js/uses.js');
  const M = require('../js/molecular.js');
  COMPOUNDS.forEach((c) => assert.ok(usesOf(c.formula), `no uses for ${c.formula}`));
  M.PRESETS.forEach((p) => M.parseEquation(p.eq).right.forEach((t) => assert.ok(usesOf(t.formula), `no uses for ${t.formula}`)));
});

test('predict: browser candidates and energies match the Python training script', () => {
  const Pr = require('../js/predict.js');
  Pr.model.checks.forEach(([syms, nCands, formula, fe, cb]) => {
    assert.strictEqual(Pr.candidates(syms).length, nCands, `candidate count for ${syms}`);
    const counts = Engine_counts(formula, syms);
    near(Pr.score(Pr.model.model, Pr.featuresOf(syms, counts)), fe, 1e-5);
    assert.strictEqual(Pr.featuresOf(syms, counts).slice(-1)[0], cb);
  });
  assert.strictEqual(Pr.predictSet(['He', 'F']).products.length, 0); // helium is unreactive
  assert.ok(Pr.chargeBalanced(['Cl', 'Na'], [1, 1]) && !Pr.chargeBalanced(['Cl', 'Na'], [2, 1]));
  assert.ok(Pr.chargeBalanced(['C', 'Ca', 'O'], [1, 1, 3]) && !Pr.chargeBalanced(['C', 'Ca', 'O'], [2, 5, 1])); // carbonate, not carbide-oxide
  assert.deepStrictEqual([[['Cl', 'Na'], [1, 1]], [['C', 'Ca', 'O'], [1, 1, 3]], [['C', 'H'], [1, 4]], [['H', 'N'], [3, 1]], [['H', 'O'], [2, 1]]]
    .map(([s, c]) => Pr.displayFormula(s, c)), ['NaCl', 'CaCO3', 'CH4', 'NH3', 'H2O']);
  // the hull: a mixture never beats the pure elements' zero, and a pair's stable compound is found
  const pts = [{ x: [1, 0], fe: 0 }, { x: [0, 1], fe: 0 }, { x: [0.5, 0.5], fe: -1 }];
  near(Pr.cheapestMixture(pts, [0.5, 0.5], 2).energy, 0, 1e-12);
  near(Pr.cheapestMixture(pts, [0.5, 0.5], -1).energy, -1, 1e-12);
});
function Engine_counts(formula, syms) {
  const c = E.parseFormula(formula);
  return syms.map((s) => c[s]);
}

test('D-T fusion releases 17.59 MeV', () => {
  const [r] = E.nuclearReactions(['2H', '3H']);
  assert.strictEqual(r.Q, 17.59);
  assert.ok(r.dH < -1e9);
  assert.strictEqual(E.nuclearReactions(['2H', '2H']).length, 1);
  assert.strictEqual(E.nuclearReactions(['2H']).length, 1);
});

(async () => {
  const A = require('../js/atlas.js');
  try {
    const nacl = await A.lookup(['Na', 'Cl']);
    assert.ok(nacl.pubchem.count > 0 && nacl.cod.count > 0 && nacl.alexandria.rows.some((r) => r.formula === 'NaCl' && r.ehull === 0));
    const fayalite = await A.lookup(['Fe', 'Si', 'O']);
    assert.ok(fayalite.alexandria.rows.some((r) => r.formula === 'Fe2SiO4'));
    assert.strictEqual(await A.lookup(['Fe', 'Gd', 'S']), null);
    passed += 1;
  } catch (err) {
    console.error(`FAIL: atlas lookup\n  ${err.message}`);
    process.exitCode = 1;
  }
  console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
})();
