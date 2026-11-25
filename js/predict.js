/*
 * Predict what forms from ANY set of 2-7 elements.
 *
 * 1. Candidate formulas: every small whole-number ratio (e.g. up to 8 of each element for a pair).
 *    If any non-metal is present, only formulas that can be charge-balanced with common oxidation
 *    states are kept (NaCl yes, NaCl2 no); all-metal sets keep every ratio (intermetallics).
 * 2. Each candidate's formation energy per atom comes from a model trained on every composition
 *    in the Alexandria DFT database (js/composition-model.js, scripts/atlas/train_composition_model.py).
 * 3. The lowest-energy candidate is the predicted product. If even that is above zero, the elements
 *    are predicted not to combine.
 *
 * featuresOf, oxStates, chargeBalanced and candidates must match the Python training script exactly.
 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { BY_SYMBOL } = isNode ? require('./elements.js') : root;
  const ATLAS_MODEL = isNode ? require('./model.js').ATLAS_MODEL : root.ATLAS_MODEL;
  const EV_TO_KJ = 96.485332;
  const PROPS = ATLAS_MODEL.elements; // 9 properties per element, shared with the atlas model
  const CAPS = { 2: [8, 12], 3: [6, 14], 4: [4, 14], 5: [3, 12], 6: [2, 12], 7: [2, 14] };

  let MODEL = null;
  if (isNode) {
    try { MODEL = require('./composition-model.js').COMPOSITION_MODEL; } catch (e) { MODEL = null; } // not built yet
  }
  let loading = null;

  /** Loads js/composition-model.js on first use (it is large). */
  function ready() {
    if (MODEL) return Promise.resolve(MODEL);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      api._resolve = resolve;
      const s = document.createElement('script');
      s.src = 'js/composition-model.js';
      s.async = true;
      s.onerror = () => { loading = null; reject(new Error('Could not load the prediction model. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function modelLoaded(m) {
    MODEL = m;
    scoreCache.clear();
    if (api._resolve) api._resolve(m);
  }

  function oxStates(sym) {
    const e = BY_SYMBOL[sym];
    if (e.category === 'ng') return e.ox.filter((x) => x > 0);
    let states = e.ox.filter((x) => x !== 0);
    if (!states.length) {
      const g = e.group || 3;
      states = { 1: [1], 2: [2], 13: [3, 1], 14: [2, 4], 15: [3, 1], 16: [2, 4, -2], 17: [-1, 1], 18: [] }[g] || [2, 3];
    }
    if (e.isMetal) return states.filter((x) => x > 0);
    if (!states.some((x) => x < 0)) states = [...states, { 13: -3, 14: -4, 15: -3, 16: -2, 17: -1 }[e.group || 0] || -1];
    return states;
  }

  const ANION_WINDOW = 0.5; // only elements this close to the most electronegative one may be anions

  function chargeBalanced(syms, counts) {
    const ens = syms.map((s) => BY_SYMBOL[s].en).filter((x) => x != null);
    const top = ens.length ? Math.max(...ens) : null;
    let lists = syms.map((s) => oxStates(s).filter((q) => q > 0 || top == null || BY_SYMBOL[s].en == null || BY_SYMBOL[s].en >= top - ANION_WINDOW));
    if (lists.some((l) => !l.length)) return false;
    if (syms.length >= 5) lists = lists.map((l) => l.slice(0, 3));
    const idx = lists.map(() => 0);
    for (;;) {
      const qs = idx.map((k, i) => lists[i][k]);
      let sum = 0;
      qs.forEach((q, i) => { sum += q * counts[i]; });
      if (sum === 0) {
        const pos = syms.filter((_, i) => qs[i] > 0);
        const neg = syms.filter((_, i) => qs[i] < 0);
        if (pos.length && neg.length) {
          const ep = pos.map((s) => BY_SYMBOL[s].en);
          const en = neg.map((s) => BY_SYMBOL[s].en);
          if (ep.includes(null) || en.includes(null) || Math.min(...en) >= Math.max(...ep)) return true;
        }
      }
      let i = 0;
      while (i < idx.length && idx[i] === lists[i].length - 1) { idx[i] = 0; i += 1; }
      if (i === idx.length) return false;
      idx[i] += 1;
    }
  }

  function featuresOf(syms, counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    const fr = counts.map((c) => c / total);
    const out = [];
    const P = PROPS[syms[0]].length;
    for (let j = 0; j < P; j += 1) {
      const vals = [];
      syms.forEach((s, i) => { const v = PROPS[s][j]; if (v != null && !Number.isNaN(v)) vals.push([v, fr[i]]); });
      if (!vals.length) { out.push(NaN, NaN, NaN, NaN, NaN); continue; }
      let w = 0; let m = 0;
      vals.forEach(([, f]) => { w += f; });
      vals.forEach(([v, f]) => { m += v * f; });
      const mean = m / w;
      let lo = Infinity; let hi = -Infinity; let dev = 0;
      vals.forEach(([v]) => { if (v < lo) lo = v; if (v > hi) hi = v; });
      vals.forEach(([v, f]) => { dev += Math.abs(v - mean) * f; });
      out.push(mean, lo, hi, hi - lo, dev / w);
    }
    let sq = 0;
    fr.forEach((f) => { sq += f * f; });
    out.push(syms.length, Math.max(...fr), Math.min(...fr), Math.sqrt(sq), chargeBalanced(syms, counts) ? 1 : 0);
    return out;
  }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  function candidates(syms) {
    const n = syms.length;
    const [maxCount, maxTotal] = CAPS[n];
    const out = [];
    // same order as Python's itertools.product: the last element varies fastest
    const counts = new Array(n).fill(1);
    for (;;) {
      const total = counts.reduce((a, b) => a + b, 0);
      if (total <= maxTotal && counts.reduce(gcd) === 1) out.push(counts.slice());
      let i = n - 1;
      while (i >= 0 && counts[i] === maxCount) { counts[i] = 1; i -= 1; }
      if (i < 0) break;
      counts[i] += 1;
    }
    const nonmetal = syms.some((s) => !BY_SYMBOL[s].isMetal && BY_SYMBOL[s].category !== 'ng');
    if (nonmetal) {
      const balanced = out.filter((c) => chargeBalanced(syms, c));
      if (balanced.length) return balanced;
    }
    return out;
  }

  function score(m, x) {
    let s = m.base;
    for (const nodes of m.trees) {
      let i = 0;
      while (nodes[i][0] !== -1) {
        const [f, thr, left, right, missLeft] = nodes[i];
        const v = x[f];
        i = Number.isNaN(v) ? (missLeft ? left : right) : (v <= thr ? left : right);
      }
      s += nodes[i][5];
    }
    return s;
  }

  const formulaOf = (syms, counts) => syms.map((s, i) => s + (counts[i] > 1 ? counts[i] : '')).join('');

  /** Conventional written order: least electronegative first (NaCl, CaCO3), hydrogen after C, N, P, Si (CH4, NH3). */
  function displayFormula(syms, counts) {
    const en = (s) => (BY_SYMBOL[s].en == null ? 1.3 : BY_SYMBOL[s].en); // unknown χ (superheavies): treat as metallic
    const order = syms.map((s, i) => [s, counts[i]]).sort((a, b) => en(a[0]) - en(b[0]) || a[0].localeCompare(b[0]));
    const hydrideHost = order.find(([s]) => [14, 15].includes(BY_SYMBOL[s].group) && s !== 'H');
    const hi = order.findIndex(([s]) => s === 'H');
    if (hydrideHost && hi >= 0) {
      const [h] = order.splice(hi, 1);
      order.splice(order.findIndex(([s]) => s === hydrideHost[0]) + 1, 0, h);
    }
    return order.map(([s, c]) => s + (c > 1 ? c : '')).join('');
  }

  /* ---------- convex hull: which candidates are stable against every mixture ---------- */

  const scoreCache = new Map();
  /** Candidates of one element set with their predicted energies (memoised per set). */
  function scored(syms) {
    const key = syms.join('-');
    if (!scoreCache.has(key)) {
      scoreCache.set(key, candidates(syms).map((c) => ({ syms, counts: c, fe: score(MODEL.model, featuresOf(syms, c)) })));
    }
    return scoreCache.get(key);
  }

  /**
   * Lowest energy per atom (eV) of any mixture of `points` with overall composition `target`
   * (element fractions), by the simplex method. points[k] = { x: fractions, fe }; the first n points
   * must be the pure elements, which give a feasible starting mixture. Returns { energy, mix: [[k, weight]] }.
   */
  function cheapestMixture(points, target, skip) {
    const n = target.length;
    const cols = points.map((p, k) => k).filter((k) => k !== skip);
    const T = target.map((_, i) => cols.map((k) => points[k].x[i]));
    const rhs = target.slice();
    const basis = target.map((_, i) => i); // column positions of the elements (cols starts with them)
    const cost = cols.map((k) => points[k].fe);
    for (let iter = 0; iter < 500; iter += 1) {
      // entering column: most negative reduced cost (Bland's rule on ties prevents cycling)
      let enter = -1; let best = -1e-12;
      for (let j = 0; j < cols.length; j += 1) {
        let r = cost[j];
        for (let i = 0; i < n; i += 1) r -= cost[basis[i]] * T[i][j];
        if (r < best - 1e-12) { best = r; enter = j; }
      }
      if (enter < 0) break;
      let leave = -1; let ratio = Infinity;
      for (let i = 0; i < n; i += 1) {
        if (T[i][enter] > 1e-12) {
          const q = rhs[i] / T[i][enter];
          if (q < ratio - 1e-15 || (Math.abs(q - ratio) <= 1e-15 && basis[i] < basis[leave])) { ratio = q; leave = i; }
        }
      }
      if (leave < 0) break; // unbounded cannot happen here (all weights are bounded), but be safe
      const pv = T[leave][enter];
      for (let j = 0; j < cols.length; j += 1) T[leave][j] /= pv;
      rhs[leave] /= pv;
      for (let i = 0; i < n; i += 1) {
        if (i === leave) continue;
        const f = T[i][enter];
        if (!f) continue;
        for (let j = 0; j < cols.length; j += 1) T[i][j] -= f * T[leave][j];
        rhs[i] -= f * rhs[leave];
      }
      basis[leave] = enter;
    }
    let energy = 0;
    const mix = [];
    for (let i = 0; i < n; i += 1) {
      energy += cost[basis[i]] * rhs[i];
      if (rhs[i] > 1e-9) mix.push([cols[basis[i]], rhs[i]]);
    }
    return { energy, mix };
  }

  function subsets(syms) {
    const out = [];
    for (let mask = 1; mask < (1 << syms.length); mask += 1) {
      const sub = syms.filter((_, i) => mask & (1 << i));
      if (sub.length >= 2) out.push(sub);
    }
    return out;
  }

  /**
   * Predicted outcome for a set of 2-7 element symbols (model must be loaded):
   * { products: [{formula, counts, fe, feKj, margin}], forms, decomposition, confidence, outside, notes }.
   * A product is a formula of all the elements that lies below every mixture of the elements and of
   * simpler candidate compounds (the predicted convex hull); products are ranked by that margin.
   */
  function predictSet(symbols) {
    const syms = [...new Set(symbols)].sort();
    if (syms.length < 2 || syms.length > 7) throw new Error('Choose between 2 and 7 different elements.');
    const outside = syms.filter((s) => !MODEL.trained.includes(s));
    const notes = [];
    const nobles = syms.filter((s) => ['He', 'Ne', 'Ar'].includes(s));
    const superheavy = syms.filter((s) => BY_SYMBOL[s].Z > 94);
    if (nobles.length) {
      return { syms, products: [], forms: false, decomposition: [], confidence: 'rule', outside, candidates: 0,
        notes: [`${nobles.map((s) => BY_SYMBOL[s].name).join(' and ')} ${nobles.length > 1 ? 'have' : 'has'} a full shell of electrons and ${nobles.length > 1 ? 'form' : 'forms'} no stable compounds at ordinary conditions, so nothing is predicted to form with ${nobles.length > 1 ? 'them' : 'it'}.`] };
    }
    const n = syms.length;
    const points = syms.map((s, i) => ({ syms: [s], counts: [1], fe: 0, x: syms.map((_, j) => (i === j ? 1 : 0)) }));
    subsets(syms).forEach((sub) => scored(sub).forEach((c) => {
      const total = c.counts.reduce((a, b) => a + b, 0);
      const x = syms.map((s) => { const k = sub.indexOf(s); return k < 0 ? 0 : c.counts[k] / total; });
      points.push({ syms: sub, counts: c.counts, fe: c.fe, x });
    }));
    const full = [];
    points.forEach((p, k) => {
      if (p.syms.length !== n) return;
      const { energy, mix } = cheapestMixture(points, p.x, k);
      full.push({ k, p, margin: p.fe - energy, mix });
    });
    const describe = (p) => ({ formula: displayFormula(p.syms, p.counts), key: formulaOf(p.syms, p.counts), counts: p.counts,
      syms: p.syms, fe: p.fe, feKj: p.fe * EV_TO_KJ });
    // a product lies on the predicted hull: below every mixture of the elements and simpler compounds
    // with three or more elements the model's errors exceed small margins, so it needs a clearer one
    // (threshold tuned on half of the held-out systems by validate_predictions.js)
    const need = n >= 3 ? -0.02 : -1e-4;
    const stable = full.filter((f) => f.p.fe < 0 && f.margin < need).sort((a, b) => a.margin - b.margin);
    const products = stable.slice(0, 4).map((f) => ({ ...describe(f.p), margin: f.margin, marginKj: f.margin * EV_TO_KJ,
      marginal: f.p.fe > -0.03 || f.margin > -0.005 }));
    let decomposition = [];
    if (!stable.length && full.length) {
      // nothing of all the elements is stable: what does the most favourable one break down into?
      const least = full.slice().sort((a, b) => a.margin - b.margin)[0];
      decomposition = least.mix.map(([k, w]) => ({ ...describe(points[k]), weight: w })).sort((a, b) => b.weight - a.weight);
    }
    let confidence = 'model';
    if (outside.length) {
      confidence = 'extrapolated';
      notes.push(`The model saw few or no compounds of ${outside.map((s) => BY_SYMBOL[s].name).join(', ')}, so this is an extrapolation from periodic trends and could be far off.`);
    }
    if (superheavy.length) notes.push(`${superheavy.map((s) => BY_SYMBOL[s].name).join(', ')} can only be made a few atoms at a time and decay quickly, so no bulk compound could actually be made and checked.`);
    if (syms.some((s) => ['Kr', 'Xe'].includes(s)) && !syms.some((s) => ['F', 'O', 'Cl'].includes(s))) {
      notes.push('Krypton and xenon only bond to very electronegative partners (fluorine, oxygen, sometimes chlorine). With these elements a compound is very unlikely whatever the model says.');
    }
    return { syms, products, forms: products.length > 0, decomposition, confidence, outside, notes, candidates: full.length };
  }

  const api = { ready, modelLoaded, predictSet, candidates, displayFormula, cheapestMixture, featuresOf, chargeBalanced, oxStates, score, EV_TO_KJ,
    get model() { return MODEL; } };
  if (isNode) module.exports = api;
  else root.Predict = api;
})(this);
