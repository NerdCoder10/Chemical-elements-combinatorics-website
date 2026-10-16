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

test('D-T fusion releases 17.59 MeV', () => {
  const [r] = E.nuclearReactions(['2H', '3H']);
  assert.strictEqual(r.Q, 17.59);
  assert.ok(r.dH < -1e9);
  assert.strictEqual(E.nuclearReactions(['2H', '2H']).length, 1);
  assert.strictEqual(E.nuclearReactions(['2H']).length, 1);
});

console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
