/*
 * Theoretical (DFT) predictions for element combinations, from js/dft.js (JARVIS-DFT).
 *
 * Each computed compound has a formation energy ΔHf (eV/atom, ~0 K) and an energy above the
 * convex hull, Ehull (eV/atom): how far it lies above the most stable mixture of competing
 * phases of the same overall composition. Ehull = 0 means DFT predicts the compound is
 * thermodynamically stable.
 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { DFT_ROWS } = isNode ? require('./dft.js') : root;
  const { COMPOUNDS } = isNode ? require('./thermo.js') : root;

  const EV_TO_KJ = 96.485332; // kJ/mol per eV/atom
  const STABLE = 0.001; // eV/atom: treat as on the hull
  const METASTABLE = 0.05; // eV/atom: often still synthesisable
  const NEAR = 0.1;

  function counts(formula) {
    const c = {};
    formula.replace(/([A-Z][a-z]?)(\d*)/g, (_, el, n) => { c[el] = (c[el] || 0) + (n ? Number(n) : 1); });
    return c;
  }
  const keyOf = (symbols) => [...new Set(symbols)].sort().join('-');

  const ENTRIES = DFT_ROWS.split('\n').map((line) => {
    const [formula, fe, ehull, spg, gap, known, poly, jid] = line.split('|');
    const c = counts(formula);
    const atoms = Object.values(c).reduce((s, v) => s + v, 0);
    return {
      formula,
      counts: c,
      elements: Object.keys(c).sort(),
      atoms,
      fe: Number(fe),
      ehull: Number(ehull),
      spg,
      gap: gap === '' ? null : Number(gap),
      known: known === '1',
      polymorphs: Number(poly),
      jid: 'JVASP-' + jid,
      dHf: Number(fe) * atoms * EV_TO_KJ, // kJ per mole of formula units
    };
  });

  // A compound also counts as known if the site's measured database has a solid of the same
  // composition (the dataset's ICSD link is missing for some well-known compounds, e.g. LuF3).
  const ratioKey = (c) => {
    const n = Object.values(c).reduce((s, v) => s + v, 0);
    return Object.keys(c).sort().map((k) => `${k}${(c[k] / n).toFixed(4)}`).join('');
  };
  const MEASURED = new Set((COMPOUNDS || []).filter((c) => c.phase === 's').map((c) => ratioKey(counts(c.formula.replace(/\(([A-Za-z]+)\)(\d*)/g, (m, g, k) => g.repeat(Number(k) || 1))))));
  ENTRIES.forEach((e) => { if (!e.known && MEASURED.has(ratioKey(e.counts))) e.known = true; });

  const BY_SET = {};
  ENTRIES.forEach((e) => { (BY_SET[e.elements.join('-')] = BY_SET[e.elements.join('-')] || []).push(e); });
  const order = (a, b) => a.ehull - b.ehull || a.fe - b.fe;
  Object.values(BY_SET).forEach((list) => list.sort(order));

  function statusOf(list) {
    const best = list[0];
    if (best.fe < 0 && best.ehull <= STABLE) return 'stable';
    if (best.fe < 0 && best.ehull <= NEAR) return 'metastable';
    return 'unstable';
  }

  const SETS = Object.keys(BY_SET).map((key) => {
    const list = BY_SET[key];
    const stable = list.filter((e) => e.fe < 0 && e.ehull <= STABLE);
    return {
      key,
      elements: key.split('-'),
      size: key.split('-').length,
      compounds: list.length,
      best: list[0],
      stable: stable.length,
      hypothetical: stable.filter((e) => !e.known).length,
      known: list.filter((e) => e.known).length,
      status: statusOf(list),
    };
  });
  const SET_INFO = {};
  SETS.forEach((s) => { SET_INFO[s.key] = s; });

  function forSet(symbols) {
    return BY_SET[keyOf(symbols)] || [];
  }
  function infoFor(symbols) {
    return SET_INFO[keyOf(symbols)] || null;
  }

  function stabilityText(e) {
    if (e.fe >= 0) return `Positive formation energy (+${e.fe.toFixed(3)} eV/atom): the elements would not combine into this.`;
    if (e.ehull <= STABLE) {
      return `On the convex hull: predicted thermodynamically stable. ${e.known
        ? 'This structure has been observed experimentally (ICSD).'
        : 'No experimentally determined structure is linked to it in the dataset, so it is either a genuinely new prediction or a known compound whose record is missing.'}`;
    }
    const x = `${e.ehull.toFixed(3)} eV/atom (${(e.ehull * EV_TO_KJ).toFixed(1)} kJ/mol per atom) above the convex hull`;
    if (e.ehull <= METASTABLE) return `Metastable: ${x}. Compounds this close to the hull can often still be made.`;
    if (e.ehull <= 0.2) return `Unstable: ${x}. It would tend to decompose into more stable phases.`;
    return `Highly unstable: ${x}. A hypothetical arrangement that DFT says should not exist.`;
  }

  function gapText(e) {
    if (e.gap == null) return '';
    if (e.gap === 0) return 'Electronic character: metallic (no band gap).';
    const kind = e.gap < 3 ? 'semiconductor' : 'insulator';
    return `Electronic character: ${kind}, band gap ≈ ${e.gap} eV (this DFT method typically underestimates gaps).`;
  }

  const api = {
    ENTRIES, SETS, forSet, infoFor, stabilityText, gapText, keyOf, EV_TO_KJ, STABLE, METASTABLE, NEAR,
  };
  if (isNode) module.exports = api;
  else root.Theory = api;
})(this);
