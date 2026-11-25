/*
 * Molecules: watch a reaction happen at the atomic level.
 *
 * A 2D particle simulation. Molecules fly with speeds drawn from the Maxwell-Boltzmann
 * distribution for the chosen temperature and collide elastically. A collision between the
 * right reactants reacts only if its energy along the line of centres exceeds the activation
 * barrier (so the Arrhenius behaviour emerges from the speeds, not from a rule). When it
 * reacts, the atoms of the reactant molecules regroup into product molecules, and the
 * reaction heat goes into (or comes out of) the products' motion.
 *
 * The chemistry part (parseEquation, balance, buildTemplate, bondChanges, thermoFor) has no
 * DOM dependency and is tested in tests/engine.test.js.
 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { BY_SYMBOL } = isNode ? require('./elements.js') : root;
  const { COMPOUNDS, SPECIES } = isNode ? require('./thermo.js') : root;
  const Engine = isNode ? require('./engine.js') : root.Engine;
  const { usesOf } = isNode ? require('./uses.js') : root;

  const R = 8.314462618; // J/(mol·K)
  const NA = 6.02214076e23;
  const KJ_PER_EV = 96.485332;
  const KSIM = 40; // simulation Boltzmann constant: <½mv²> = KSIM·T, with m in u and v in px/s

  /* ---------- element appearance ---------- */

  // Jmol / CPK colours.
  const CPK = {
    H: '#ffffff', He: '#d9ffff', Li: '#cc80ff', Be: '#c2ff00', B: '#ffb5b5', C: '#505050', N: '#3050f8', O: '#ff0d0d',
    F: '#90e050', Ne: '#b3e3f5', Na: '#ab5cf2', Mg: '#8aff00', Al: '#bfa6a6', Si: '#f0c8a0', P: '#ff8000', S: '#ffff30',
    Cl: '#1ff01f', Ar: '#80d1e3', K: '#8f40d4', Ca: '#3dff00', Sc: '#e6e6e6', Ti: '#bfc2c7', V: '#a6a6ab', Cr: '#8a99c7',
    Mn: '#9c7ac7', Fe: '#e06633', Co: '#f090a0', Ni: '#50d050', Cu: '#c88033', Zn: '#7d80b0', Ga: '#c28f8f', Ge: '#668f8f',
    As: '#bd80e3', Se: '#ffa100', Br: '#a62929', Kr: '#5cb8d1', Rb: '#702eb0', Sr: '#00ff00', Y: '#94ffff', Zr: '#94e0e0',
    Nb: '#73c2c9', Mo: '#54b5b5', Tc: '#3b9e9e', Ru: '#248f8f', Rh: '#0a7d8c', Pd: '#006985', Ag: '#c0c0c0', Cd: '#ffd98f',
    In: '#a67573', Sn: '#668080', Sb: '#9e63b5', Te: '#d47a00', I: '#940094', Xe: '#429eb0', Cs: '#57178f', Ba: '#00c900',
    La: '#70d4ff', Ce: '#ffffc7', W: '#2194d6', Pt: '#d0d0e0', Au: '#ffd123', Hg: '#b8b8d0', Pb: '#575961', Bi: '#9e4fb5',
    U: '#008fff', Pu: '#006bff',
  };
  // Covalent radii in Å (Cordero et al. 2008); others fall back to 1.45 Å.
  const RADIUS = {
    H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58, Na: 1.66, Mg: 1.41,
    Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06, K: 2.03, Ca: 1.76, Ti: 1.6, Cr: 1.39, Mn: 1.39, Fe: 1.32,
    Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.2, As: 1.19, Se: 1.2, Br: 1.2, Kr: 1.16, Rb: 2.2, Sr: 1.95,
    Ag: 1.45, Cd: 1.44, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.4, Cs: 2.44, Ba: 2.15, Pt: 1.36, Au: 1.36, Hg: 1.32,
    Pb: 1.46, Bi: 1.48, U: 1.96,
  };
  const VALENCE = { H: 1, B: 3, C: 4, N: 3, O: 2, F: 1, Si: 4, P: 3, S: 2, Cl: 1, Ge: 4, As: 3, Se: 2, Br: 1, Te: 2, I: 1, Xe: 2 };
  // Highest common valence when bonded to oxygen (oxoacids, oxides).
  const VALENCE_WITH_O = { N: 5, P: 5, S: 6, Cl: 7, Br: 5, I: 7, Se: 6, Xe: 6, C: 4, Si: 4, B: 3 };

  const colorOf = (el) => CPK[el] || (BY_SYMBOL[el] && BY_SYMBOL[el].isMetal ? '#a7aebf' : '#ff1493');
  const pxRadius = (el) => 4 + 9 * (RADIUS[el] || 1.45);
  const massOf = (el) => (BY_SYMBOL[el] ? BY_SYMBOL[el].massNum : 50);

  /* ---------- equations ---------- */

  const TERM = /^\s*(\d+)?\s*([A-Z][A-Za-z0-9()]*?)\s*(?:\((s|l|g|aq)\))?\s*$/;

  /** "2 H2(g) + O2 -> 2 H2O" -> { left, right, coefsGiven } ; throws Error with a readable message. */
  function parseEquation(text) {
    const t = String(text || '').replace(/→|⟶|=>|=/g, '->');
    const parts = t.split('->');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      throw new Error('Write the reaction as reactants -> products, for example 2 H2 + O2 -> 2 H2O.');
    }
    let coefsGiven = false;
    const side = (s) => s.split('+').map((raw) => {
      const m = TERM.exec(raw);
      if (!m) throw new Error(`"${raw.trim()}" is not a formula. Use element symbols with counts, like H2O or Ca(OH)2.`);
      if (m[1]) coefsGiven = true;
      let counts;
      try { counts = Engine.parseFormula(m[2]); } catch (e) { throw new Error(`Could not read the formula "${m[2]}".`); }
      const bad = Object.keys(counts).filter((el) => !BY_SYMBOL[el]);
      if (bad.length || !Object.keys(counts).length) throw new Error(`"${m[2]}" contains ${bad.length ? `an unknown element symbol (${bad.join(', ')})` : 'no elements'}. Symbols are case-sensitive: Co is cobalt, CO is carbon monoxide.`);
      const atoms = Object.values(counts).reduce((a, b) => a + b, 0);
      if (atoms > 40) throw new Error(`${m[2]} has ${atoms} atoms per molecule; the simulation handles up to 40.`);
      return { coef: m[1] ? Number(m[1]) : 1, formula: m[2], phase: m[3] || null, counts };
    });
    const left = side(parts[0]);
    const right = side(parts[1]);
    if (left.length + right.length > 6) throw new Error('Use at most 6 different substances in one reaction.');
    if ([...left, ...right].some((x) => x.coef < 1 || x.coef > 12)) throw new Error('Coefficients must be whole numbers from 1 to 12.');
    return { left, right, coefsGiven };
  }

  function atomTotals(terms) {
    const t = {};
    terms.forEach((x) => Object.keys(x.counts).forEach((el) => { t[el] = (t[el] || 0) + x.coef * x.counts[el]; }));
    return t;
  }

  function isBalanced(eq) {
    const a = atomTotals(eq.left);
    const b = atomTotals(eq.right);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => a[k] === b[k]);
  }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  /** Smallest whole-number coefficients that balance the equation (in place). Returns false if none up to the limit. */
  function balance(eq) {
    const terms = [...eq.left, ...eq.right];
    const n = terms.length;
    const els = [...new Set(terms.flatMap((x) => Object.keys(x.counts)))];
    const max = n <= 4 ? 12 : n === 5 ? 9 : 7;
    const coefs = new Array(n).fill(1);
    let best = null;
    const check = () => els.every((el) => {
      let s = 0;
      for (let i = 0; i < n; i += 1) s += (i < eq.left.length ? 1 : -1) * coefs[i] * (terms[i].counts[el] || 0);
      return s === 0;
    });
    for (;;) {
      if (check()) {
        const sum = coefs.reduce((a, b) => a + b, 0);
        if (!best || sum < best.sum) best = { sum, coefs: coefs.slice() };
      }
      let i = 0;
      while (i < n && coefs[i] === max) { coefs[i] = 1; i += 1; }
      if (i === n) break;
      coefs[i] += 1;
    }
    if (!best) return false;
    const g = best.coefs.reduce(gcd);
    terms.forEach((x, i) => { x.coef = best.coefs[i] / g; });
    return true;
  }

  function formatEquation(eq, withPhases = true) {
    const side = (terms) => terms.map((x) => `${x.coef > 1 ? x.coef + ' ' : ''}${x.formula}${withPhases && x.phase ? `(${x.phase})` : ''}`).join(' + ');
    return `${side(eq.left)} -> ${side(eq.right)}`;
  }

  /* ---------- molecule structures (schematic 2D) ---------- */

  const isMetal = (el) => BY_SYMBOL[el] && BY_SYMBOL[el].isMetal;
  const isNoble = (el) => BY_SYMBOL[el] && BY_SYMBOL[el].category === 'ng';

  function anionCharge(el) {
    const e = BY_SYMBOL[el];
    if (el === 'H') return -1;
    if (e.group === 17) return -1;
    if (e.group === 16) return -2;
    if (e.group === 15) return -3;
    if (e.group === 14) return -4;
    return -1;
  }

  // Hand-drawn topologies for molecules the generic builder gets wrong.
  // Each node: [element, parent index, bond order].
  const TOPOLOGY = {
    C2H5OH: [['C'], ['C', 0, 1], ['O', 1, 1], ['H', 2, 1], ['H', 0, 1], ['H', 0, 1], ['H', 0, 1], ['H', 1, 1], ['H', 1, 1]],
    CH3OH: [['C'], ['O', 0, 1], ['H', 1, 1], ['H', 0, 1], ['H', 0, 1], ['H', 0, 1]],
    CH3COOH: [['C'], ['C', 0, 1], ['O', 1, 2], ['O', 1, 1], ['H', 3, 1], ['H', 0, 1], ['H', 0, 1], ['H', 0, 1]],
    HCOOH: [['C'], ['O', 0, 2], ['O', 0, 1], ['H', 2, 1], ['H', 0, 1]],
    N2O4: [['N'], ['N', 0, 1], ['O', 0, 2], ['O', 0, 1], ['O', 1, 2], ['O', 1, 1]],
    NO2: [['N'], ['O', 0, 2], ['O', 0, 1]],
    HNO3: [['N'], ['O', 0, 2], ['O', 0, 1], ['O', 0, 1], ['H', 3, 1]],
    H2SO4: [['S'], ['O', 0, 2], ['O', 0, 2], ['O', 0, 1], ['O', 0, 1], ['H', 3, 1], ['H', 4, 1]],
    O3: [['O'], ['O', 0, 2], ['O', 0, 1]],
    N2O: [['N'], ['N', 0, 2], ['O', 0, 2]],
  };

  /** Generic topology: backbone of the least numerous heavy element, other heavy atoms on it, then hydrogens. */
  function genericTopology(counts) {
    const els = Object.keys(counts);
    const nodes = [];
    const free = [];
    const add = (el, parent, order = 1) => {
      nodes.push([el, parent, order]);
      free.push(VALENCE[el] || 1);
      if (parent != null) { free[parent] -= order; free[free.length - 1] -= order; }
      return nodes.length - 1;
    };
    const heavy = els.filter((e) => e !== 'H');
    const hCount = counts.H || 0;
    if (!heavy.length) { // H2
      add('H', null);
      for (let i = 1; i < hCount; i += 1) add('H', i - 1);
      return nodes;
    }
    if (heavy.length === 1 && !hCount) { // homonuclear: diatomic (O=O, N≡N), chain or ring
      const n = counts[heavy[0]];
      const order = n === 2 ? Math.min(3, VALENCE[heavy[0]] || 1) : 1;
      for (let i = 0; i < n; i += 1) add(heavy[0], i ? i - 1 : null, i ? order : 1);
      return nodes;
    }
    // backbone element: carbon if present, else the least numerous heavy element (ties: lowest χ)
    const en = (e) => (BY_SYMBOL[e].en == null ? 9 : BY_SYMBOL[e].en);
    const back = heavy.includes('C') ? 'C' : heavy.slice().sort((a, b) => counts[a] - counts[b] || en(a) - en(b))[0];
    const backbone = [];
    for (let i = 0; i < counts[back]; i += 1) backbone.push(add(back, i ? backbone[i - 1] : null));
    // raise valence of backbone atoms bonded to oxygen (oxides, oxoacids)
    if (heavy.includes('O') && VALENCE_WITH_O[back]) backbone.forEach((i) => { free[i] += VALENCE_WITH_O[back] - VALENCE[back]; });
    const others = heavy.filter((e) => e !== back).sort((a, b) => en(a) - en(b));
    others.forEach((el) => {
      for (let k = 0; k < counts[el]; k += 1) {
        // attach to the backbone atom with the most free valence (ties: the last one)
        let best = backbone[backbone.length - 1];
        backbone.forEach((i) => { if (free[i] > free[best]) best = i; });
        add(el, best);
      }
    });
    // hydrogens: heteroatoms first in acids (no carbon), carbon first in organics
    const order = nodes.map((_, i) => i).filter((i) => nodes[i][0] !== 'H')
      .sort((a, b) => (heavy.includes('C') ? en(nodes[a][0]) - en(nodes[b][0]) : en(nodes[b][0]) - en(nodes[a][0])));
    for (let k = 0; k < hCount; k += 1) {
      let target = order.find((i) => free[i] > 0);
      if (target == null) target = order[k % order.length];
      add('H', target);
    }
    // multiple bonds where both ends still have free valence (C=O, O=O, C≡C ...)
    for (let pass = 0; pass < 2; pass += 1) {
      nodes.forEach((nd, i) => {
        const p = nd[1];
        if (p == null || nd[0] === 'H' || nodes[p][0] === 'H') return;
        if (free[i] > 0 && free[p] > 0 && nd[2] < 3) { nd[2] += 1; free[i] -= 1; free[p] -= 1; }
      });
    }
    return nodes;
  }

  function layoutTopology(nodes, homoRing) {
    const n = nodes.length;
    const pos = new Array(n);
    const kids = nodes.map(() => []);
    nodes.forEach((nd, i) => { if (nd[1] != null) kids[nd[1]].push(i); });
    const bondLen = (a, b) => (pxRadius(nodes[a][0]) + pxRadius(nodes[b][0])) * 0.86;
    if (homoRing) { // rings of one element (P4, S8): a regular polygon
      const rr = bondLen(0, 0) / (2 * Math.sin(Math.PI / n));
      nodes.forEach((_, i) => { pos[i] = [rr * Math.cos((2 * Math.PI * i) / n), rr * Math.sin((2 * Math.PI * i) / n)]; });
      return pos;
    }
    pos[0] = [0, 0];
    const place = (i, inAngle, depth) => {
      const ch = kids[i];
      if (!ch.length) return;
      const el = nodes[i][0];
      const g = BY_SYMBOL[el].group;
      let angles;
      if (inAngle == null) { // root
        if (ch.length === 2 && (g === 16 || g === 15)) angles = [-52.25, 52.25].map((d) => (d * Math.PI) / 180 + Math.PI / 2);
        else angles = ch.map((_, k) => (2 * Math.PI * k) / ch.length);
      } else if (ch.length === 1) {
        const linear = nodes[ch[0]][2] === 3 || nodes[i][2] === 3 || (nodes[i][2] === 2 && nodes[ch[0]][2] === 2);
        angles = [inAngle + Math.PI + (linear ? 0 : (depth % 2 ? 1 : -1) * (Math.PI / 3))];
      } else {
        const step = (2 * Math.PI) / (ch.length + 1);
        angles = ch.map((_, k) => inAngle + Math.PI + step * (k + 1) - Math.PI);
      }
      ch.forEach((c, k) => {
        const a = angles[k];
        const L = bondLen(i, c);
        pos[c] = [pos[i][0] + L * Math.cos(a), pos[i][1] + L * Math.sin(a)];
        place(c, a + Math.PI, depth + 1);
      });
    };
    place(0, null, 0);
    return pos;
  }

  function layoutIonic(counts) {
    // Cations and anions on a checkerboard; polyatomic anions are drawn as small covalent groups.
    const cations = Object.keys(counts).filter(isMetal);
    const nonmetals = Object.keys(counts).filter((e) => !isMetal(e));
    const ions = [];
    const anionCharges = {};
    let negative = 0;
    nonmetals.forEach((el) => { anionCharges[el] = anionCharge(el); negative += anionCharge(el) * counts[el]; });
    const nCat = cations.reduce((s, el) => s + counts[el], 0);
    const simple = nonmetals.length === 1;
    cations.forEach((el) => {
      const ox = BY_SYMBOL[el].ox.find((x) => x > 0) || 1;
      const q = simple && cations.length === 1 ? Math.round(-negative / nCat) : ox;
      for (let k = 0; k < counts[el]; k += 1) ions.push({ el, cation: true, charge: q });
    });
    nonmetals.forEach((el) => { for (let k = 0; k < counts[el]; k += 1) ions.push({ el, cation: false, charge: simple ? anionCharges[el] : 0 }); });
    // neighbouring cation and anion just touch
    const rMax = (cat) => ions.filter((x) => x.cation === cat).reduce((m, x) => Math.max(m, pxRadius(x.el)), 0);
    const step = (rMax(true) + (rMax(false) || rMax(true))) * 0.92;
    const pts = [];
    for (let i = -4; i <= 4; i += 1) for (let j = -4; j <= 4; j += 1) pts.push([i, j]);
    pts.sort((a, b) => (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2) || a[0] - b[0] || a[1] - b[1]);
    const used = new Set();
    return ions.map((ion) => {
      const parity = ion.cation ? 0 : 1;
      const p = pts.find((q) => !used.has(q.join()) && Math.abs(q[0] + q[1]) % 2 === parity);
      used.add(p.join());
      return { el: ion.el, x: p[0] * step, y: p[1] * step, charge: ion.charge };
    });
  }

  const TEMPLATES = new Map();

  /** Atoms (local coordinates in px), bonds, radius and mass of one molecule / formula unit. */
  function buildTemplate(formula) {
    if (TEMPLATES.has(formula)) return TEMPLATES.get(formula);
    const counts = Engine.parseFormula(formula);
    const els = Object.keys(counts);
    const nAtoms = Object.values(counts).reduce((a, b) => a + b, 0);
    let atoms = [];
    let bonds = [];
    const metals = els.filter(isMetal);
    const ionic = metals.length > 0 && els.some((e) => !isMetal(e) && !isNoble(e));
    if (nAtoms === 1) {
      atoms = [{ el: els[0], x: 0, y: 0, charge: 0 }];
    } else if (ionic) {
      atoms = layoutIonic(counts);
    } else if (metals.length === els.length) { // a metallic cluster / alloy unit: no drawn bonds
      atoms = layoutIonic(Object.fromEntries(els.map((e) => [e, counts[e]]))).map((a) => ({ ...a, charge: 0 }));
    } else {
      const key = formula.replace(/\(.*?[a-z]{3,}.*?\)/g, '');
      const nodes = (TOPOLOGY[key] || genericTopology(counts)).map((nd) => [nd[0], nd[1] == null ? null : nd[1], nd[2] || 1]);
      const homo = els.length === 1 && nAtoms >= 4;
      const pos = layoutTopology(nodes, homo);
      atoms = nodes.map((nd, i) => ({ el: nd[0], x: pos[i][0], y: pos[i][1], charge: 0 }));
      bonds = nodes.map((nd, i) => (nd[1] == null ? null : { a: nd[1], b: i, order: nd[2] })).filter(Boolean);
      if (homo) bonds.push({ a: nodes.length - 1, b: 0, order: 1 });
    }
    // centre on the centre of mass
    const M = atoms.reduce((s, a) => s + massOf(a.el), 0);
    const cx = atoms.reduce((s, a) => s + massOf(a.el) * a.x, 0) / M;
    const cy = atoms.reduce((s, a) => s + massOf(a.el) * a.y, 0) / M;
    atoms = atoms.map((a) => ({ el: a.el, lx: a.x - cx, ly: a.y - cy, r: pxRadius(a.el), color: colorOf(a.el), charge: a.charge || 0 }));
    const radius = atoms.reduce((m, a) => Math.max(m, Math.hypot(a.lx, a.ly) + a.r), 0);
    const t = { formula, atoms, bonds, radius, mass: M, ionic, nAtoms };
    TEMPLATES.set(formula, t);
    return t;
  }

  /* ---------- bonds and energy ---------- */

  const ORDER_SYMBOL = { 1: '–', 2: '=', 3: '≡' };
  // Average bond enthalpies, kJ/mol (gas phase). Used only when no tabulated ΔH exists.
  const BOND_ENTHALPY = {
    'H-H1': 436, 'C-H1': 413, 'C-C1': 348, 'C-C2': 614, 'C-C3': 839, 'C-O1': 358, 'C-O2': 799, 'C-O3': 1072,
    'H-O1': 463, 'O-O1': 146, 'O-O2': 495, 'N-N1': 163, 'N-N2': 418, 'N-N3': 941, 'H-N1': 391, 'C-N1': 293,
    'C-N2': 615, 'C-N3': 891, 'N-O1': 201, 'N-O2': 607, 'F-F1': 155, 'Cl-Cl1': 242, 'Br-Br1': 193, 'I-I1': 151,
    'F-H1': 567, 'Cl-H1': 431, 'Br-H1': 366, 'H-I1': 299, 'C-Cl1': 328, 'C-F1': 485, 'C-Br1': 276, 'C-I1': 240,
    'H-S1': 339, 'S-S1': 266, 'O-S2': 523, 'H-P1': 322, 'Cl-P1': 326, 'O-Si1': 452, 'H-Si1': 323, 'C-S1': 259,
    'C-S2': 577, 'F-O1': 190, 'Cl-O1': 203, 'F-N1': 272, 'Cl-N1': 200, 'P-P1': 201, 'Si-Si1': 226,
  };

  function bondKey(a, b) {
    const [x, y] = [a, b].sort((p, q) => (p === 'H') - (q === 'H') || p.localeCompare(q));
    return [x, y];
  }

  function bondsOf(formula) {
    const t = buildTemplate(formula);
    const out = {};
    t.bonds.forEach(({ a, b, order }) => {
      const [x, y] = bondKey(t.atoms[a].el, t.atoms[b].el);
      const k = `${x}${ORDER_SYMBOL[order]}${y}`;
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  /** Bonds broken in the reactants and formed in the products, for one reaction event. */
  function bondChanges(eq) {
    const tally = (terms) => {
      const t = {};
      terms.forEach((x) => Object.entries(bondsOf(x.formula)).forEach(([k, v]) => { t[k] = (t[k] || 0) + v * x.coef; }));
      return t;
    };
    const broken = tally(eq.left);
    const formed = tally(eq.right);
    // a bond type that survives on both sides is not really broken and remade: cancel it
    Object.keys(broken).forEach((k) => {
      if (formed[k]) {
        const m = Math.min(broken[k], formed[k]);
        broken[k] -= m; formed[k] -= m;
        if (!broken[k]) delete broken[k];
        if (!formed[k]) delete formed[k];
      }
    });
    const enthalpy = (bonds) => {
      let s = 0;
      for (const [k, v] of Object.entries(bonds)) {
        const m = /^([A-Z][a-z]?)([–=≡])([A-Z][a-z]?)$/.exec(k);
        const order = { '–': 1, '=': 2, '≡': 3 }[m[2]];
        const key = `${[m[1], m[3]].sort().join('-')}${order}`;
        if (BOND_ENTHALPY[key] == null) return null;
        s += BOND_ENTHALPY[key] * v;
      }
      return s;
    };
    // Average bond energies only describe gases: ions, metals and solid elements (graphite, sulfur ...)
    // also need lattice energies, so no estimate is given for them.
    const ionicTerms = [...eq.left, ...eq.right].some((x) => {
      const t = buildTemplate(x.formula);
      return t.ionic || (t.nAtoms === 1 && BY_SYMBOL[t.atoms[0].el].state !== 'g');
    });
    const hb = enthalpy(broken);
    const hf = enthalpy(formed);
    return { broken, formed, dHestimate: !ionicTerms && hb != null && hf != null ? hb - hf : null };
  }

  function lookupSpecies(formula, phase) {
    const counts = Engine.parseFormula(formula);
    const els = Object.keys(counts);
    const single = els.length === 1 ? BY_SYMBOL[els[0]] : null;
    // an element in its standard state (H2, O2, Na, C ...) has ΔHf° = 0 by definition
    if (single && formula === single.refFormula) return { dHf: 0, S: single.S, name: single.name };
    // free atoms and allotropes (O, H, O3, C(diamond) ...)
    if (SPECIES[formula]) return { dHf: SPECIES[formula].dHf, S: SPECIES[formula].S, name: SPECIES[formula].name };
    const matches = COMPOUNDS.filter((c) => c.formula === formula);
    if (!matches.length) return null;
    const c = matches.find((m) => m.phase === phase) || matches.find((m) => m.phase === 'g') || matches[0];
    return { dHf: c.dHf, S: c.S, name: c.name, phase: c.phase };
  }

  /** ΔH° (kJ) and ΔS° (J/K) for the reaction as written, from measured (tabulated) data only. */
  function thermoFor(eq) {
    let dH = 0;
    let dS = 0;
    let complete = true;
    for (const [terms, sign] of [[eq.left, -1], [eq.right, 1]]) {
      for (const x of terms) {
        const d = lookupSpecies(x.formula, x.phase);
        if (!d) { complete = false; break; }
        dH += sign * x.coef * d.dHf;
        dS = dS == null || d.S == null ? null : dS + sign * x.coef * d.S;
      }
    }
    if (complete) return { dH, dS, source: 'tabulated' };
    return { dH: null, dS: null, source: 'unknown' };
  }

  function nameOf(formula) {
    const d = lookupSpecies(formula, null);
    return d && d.name ? d.name : formula;
  }

  /* ---------- presets ---------- */

  const PRESETS = [
    { id: 'h2o', name: 'Hydrogen burns in oxygen', eq: '2 H2(g) + O2(g) -> 2 H2O(g)', T: 300, Ea: 70, thermostat: false,
      tip: 'Nothing happens at room temperature: the barrier is too high. Tap the box to strike a spark and watch the heat set off a chain reaction.' },
    { id: 'ch4', name: 'Methane burns (natural gas flame)', eq: 'CH4(g) + 2 O2(g) -> CO2(g) + 2 H2O(g)', T: 300, Ea: 80, thermostat: false,
      tip: 'Strike a spark. Each event takes apart five molecules and builds three new ones.' },
    { id: 'hcl', name: 'Hydrogen + chlorine', eq: 'H2(g) + Cl2(g) -> 2 HCl(g)', T: 300, Ea: 60, thermostat: false,
      tip: 'In reality UV light starts this as a radical chain. Here a spark does the same job.' },
    { id: 'nh3', name: 'Making ammonia (Haber process)', eq: 'N2(g) + 3 H2(g) -> 2 NH3(g)', T: 700, Ea: 120, thermostat: true,
      tip: 'The N≡N triple bond is very strong. Without a catalyst almost nothing reacts. Lower the barrier to see what an iron catalyst does.' },
    { id: 'nacl', name: 'Sodium + chlorine → salt', eq: '2 Na(s) + Cl2(g) -> 2 NaCl(s)', T: 900, Ea: 15, thermostat: true,
      tip: 'Each sodium atom hands an electron to chlorine. The ions then stick together and grow into salt crystals.' },
    { id: 'mgo', name: 'Magnesium burns', eq: '2 Mg(s) + O2(g) -> 2 MgO(s)', T: 300, Ea: 55, thermostat: false,
      tip: 'Strike a spark. Very exothermic: the products come out fast and clump into an oxide.' },
    { id: 'rust', name: 'Iron rusts', eq: '4 Fe(s) + 3 O2(g) -> 2 Fe2O3(s)', T: 900, Ea: 25, thermostat: true,
      tip: 'Seven molecules have to meet for one event, so this is slow. Real rusting also needs water.' },
    { id: 'h2o2', name: 'Hydrogen peroxide decomposes', eq: '2 H2O2(g) -> 2 H2O(g) + O2(g)', T: 450, Ea: 45, thermostat: true,
      tip: 'A decomposition: the same molecule on both sides of the collision.' },
    { id: 'no2', name: 'Nitrogen dioxide pairs up', eq: '2 NO2(g) -> N2O4(g)', T: 300, Ea: 5, thermostat: true,
      tip: 'Almost no barrier: two molecules with an unpaired electron join when they touch.' },
    { id: 'o3', name: 'Oxygen → ozone (uphill)', eq: '3 O2(g) -> 2 O3(g)', T: 2500, Ea: 100, thermostat: true,
      tip: 'Endothermic: every event takes heat out of the gas. Turn off "Hold temperature" and watch it cool itself down.' },
    { id: 'eth', name: 'Ethanol burns', eq: 'C2H5OH(g) + 3 O2(g) -> 2 CO2(g) + 3 H2O(g)', T: 300, Ea: 85, thermostat: false,
      tip: 'Strike a spark. Nine atoms of ethanol and six of oxygen rearrange into five product molecules.' },
    { id: 'thermite', name: 'Thermite', eq: 'Fe2O3(s) + 2 Al(s) -> Al2O3(s) + 2 Fe(s)', T: 300, Ea: 90, thermostat: false,
      tip: 'Aluminium steals oxygen from iron oxide. Needs a very hot spark, then releases enough heat to melt iron.' },
  ];

  /* ====================================================================================
   * Browser part: simulation and drawing
   * ==================================================================================== */

  const SPECIES_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2'];

  const sim = {
    eq: null, species: [], mols: [], flashes: [], history: [], events: 0, time: 0,
    T: 300, Ea: 70, heat: 0.03, sets: 30, thermostat: false, labels: false, speed: 1,
    running: false, visible: false, thermo: null, raf: 0, lastFrame: 0, lastSample: 0, w: 600, h: 400,
  };
  let els = null; // DOM handles, set in init()

  function gauss() {
    let u = 0; let v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function thermalVelocity(mass, T) {
    const s = Math.sqrt((KSIM * T) / mass); // per component, so <½m(vx²+vy²)> = KSIM·T
    return [gauss() * s, gauss() * s];
  }

  function makeMolecule(sp, x, y, T) {
    const s = sim.species[sp];
    const t = s.tmpl;
    const [vx, vy] = thermalVelocity(t.mass, T);
    return {
      sp, x, y, vx, vy, ang: Math.random() * Math.PI * 2, om: (Math.random() - 0.5) * 2, units: 1,
      atoms: t.atoms.map((a) => ({ ...a })), bonds: t.bonds, radius: t.radius, mass: t.mass, morph: null, born: sim.time,
    };
  }

  function worldAtoms(m) {
    const c = Math.cos(m.ang); const s = Math.sin(m.ang);
    return m.atoms.map((a) => [m.x + a.lx * c - a.ly * s, m.y + a.lx * s + a.ly * c]);
  }

  function setupSpecies() {
    const eq = sim.eq;
    sim.species = [...eq.left.map((x) => ({ ...x, side: 'L' })), ...eq.right.map((x) => ({ ...x, side: 'R' }))]
      .map((x, i) => ({ ...x, tmpl: buildTemplate(x.formula), color: SPECIES_COLORS[i % SPECIES_COLORS.length], name: nameOf(x.formula) }));
  }

  /** Reaction sets actually placed: the slider value, capped so the box never gets crowded. */
  function setsUsed() {
    const perSet = sim.eq.left.reduce((s, x) => s + x.coef, 0);
    const maxMolecules = Math.min(260, Math.floor((sim.w * sim.h) / 2200));
    return Math.max(1, Math.min(sim.sets, Math.floor(maxMolecules / perSet)));
  }

  function populate() {
    sim.mols = [];
    sim.flashes = [];
    sim.history = [];
    sim.events = 0;
    sim.time = 0;
    sim.lastSample = -1;
    const sets = setsUsed();
    sim.startSets = sets;
    sim.species.forEach((s, i) => {
      if (s.side !== 'L') return;
      for (let k = 0; k < s.coef * sets; k += 1) {
        let placed = null;
        for (let tries = 0; tries < 60 && !placed; tries += 1) {
          const r = s.tmpl.radius;
          const x = r + Math.random() * (sim.w - 2 * r);
          const y = r + Math.random() * (sim.h - 2 * r);
          if (sim.mols.every((m) => Math.hypot(m.x - x, m.y - y) > m.radius + r + 2)) placed = [x, y];
        }
        if (!placed) placed = [Math.random() * sim.w, Math.random() * sim.h];
        sim.mols.push(makeMolecule(i, placed[0], placed[1], sim.T));
      }
    });
    sample();
  }

  function measuredT() {
    if (!sim.mols.length) return 0;
    const ke = sim.mols.reduce((s, m) => s + 0.5 * m.mass * (m.vx * m.vx + m.vy * m.vy), 0);
    return ke / sim.mols.length / KSIM;
  }

  /* ---------- reactions ---------- */

  const needs = () => sim.species.map((s) => (s.side === 'L' ? s.coef : 0));
  const reactantCount = () => sim.eq.left.reduce((s, x) => s + x.coef, 0);
  const ready = (m) => !m.morph && m.units === 1 && sim.time - m.born > 0.15;

  /** Reacts if this collision carries enough energy and the other reactants are close by. */
  function tryReact(a, b, eK, consumed) {
    const need = needs();
    if (!need[a.sp] && need[b.sp]) [a, b] = [b, a]; // unimolecular: the reactant may be either partner
    if (!need[a.sp] || (!need[b.sp] && reactantCount() > 1)) return false;
    if (eK * R / 1000 < sim.Ea) return false; // collision energy (kJ/mol) below the barrier
    if (!ready(a) || !ready(b)) return false;
    const chosen = [a];
    const left = need.slice();
    left[a.sp] -= 1;
    if (reactantCount() > 1) {
      if (!left[b.sp]) return false;
      chosen.push(b);
      left[b.sp] -= 1;
    }
    const cx = (a.x + b.x) / 2; const cy = (a.y + b.y) / 2;
    const reach = 90 + 25 * reactantCount();
    if (left.some((v) => v > 0)) {
      const pool = sim.mols.filter((m) => m !== a && m !== b && left[m.sp] > 0 && ready(m) && !consumed.has(m))
        .map((m) => [Math.hypot(m.x - cx, m.y - cy), m]).filter(([d]) => d < reach).sort((p, q) => p[0] - q[0]);
      for (const [, m] of pool) {
        if (left[m.sp] > 0) { chosen.push(m); left[m.sp] -= 1; }
      }
      if (left.some((v) => v > 0)) return false;
    }
    if (chosen.some((m) => consumed.has(m))) return false;
    react(chosen);
    chosen.forEach((m) => consumed.add(m));
    return true;
  }

  function react(chosen) {
    const atomsPool = [];
    let px = 0; let py = 0; let M = 0; let ke = 0;
    chosen.forEach((m) => {
      worldAtoms(m).forEach((p, i) => atomsPool.push({ el: m.atoms[i].el, x: p[0], y: p[1] }));
      px += m.mass * m.vx; py += m.mass * m.vy; M += m.mass;
      ke += 0.5 * m.mass * (m.vx * m.vx + m.vy * m.vy);
    });
    const cx = chosen.reduce((s, m) => s + m.mass * m.x, 0) / M;
    const cy = chosen.reduce((s, m) => s + m.mass * m.y, 0) / M;
    sim.mols = sim.mols.filter((m) => !chosen.includes(m));

    const products = [];
    sim.species.forEach((s, i) => { if (s.side === 'R') for (let k = 0; k < s.coef; k += 1) products.push(i); });
    const ring = 6 + products.length * 7;
    const made = products.map((sp, k) => {
      const a = (2 * Math.PI * k) / products.length + Math.random();
      const m = makeMolecule(sp, clamp(cx + ring * Math.cos(a), 20, sim.w - 20), clamp(cy + ring * Math.sin(a), 20, sim.h - 20), 0);
      // take real atoms from the reactants: nearest atom of the same element
      const targets = worldAtoms(m);
      m.morph = {
        t0: sim.time,
        from: targets.map((tp, j) => {
          let bestI = -1; let bestD = Infinity;
          atomsPool.forEach((p, idx) => {
            if (p.el !== m.atoms[j].el) return;
            const d = (p.x - tp[0]) ** 2 + (p.y - tp[1]) ** 2;
            if (d < bestD) { bestD = d; bestI = idx; }
          });
          const p = atomsPool.splice(bestI, 1)[0];
          return [p.x, p.y];
        }),
      };
      return m;
    });

    // Energy: the reactants' kinetic energy plus the share of the reaction heat kept in the gas.
    const dH = sim.thermo && sim.thermo.dH != null ? sim.thermo.dH : 0;
    const q = (-dH * 1000) / R * KSIM; // per event, in the simulation's energy units
    const eOut = Math.max(0.15 * ke, ke + sim.heat * q);
    const Mp = made.reduce((s, m) => s + m.mass, 0);
    const vcx = px / Mp; const vcy = py / Mp;
    made.forEach((m) => {
      const share = eOut / made.length;
      const v = Math.sqrt((2 * share) / m.mass);
      const a = Math.random() * Math.PI * 2;
      m.vx = vcx + v * Math.cos(a);
      m.vy = vcy + v * Math.sin(a);
      sim.mols.push(m);
    });
    sim.events += 1;
    sim.flashes.push({ x: cx, y: cy, t0: sim.time, exo: dH <= 0 });
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function mergeClusters(a, b) {
    // two formula units of an ionic solid product stick together: the crystal grows
    const wa = worldAtoms(a); const wb = worldAtoms(b);
    const M = a.mass + b.mass;
    const cx = (a.mass * a.x + b.mass * b.x) / M;
    const cy = (a.mass * a.y + b.mass * b.y) / M;
    a.atoms = [...a.atoms.map((at, i) => ({ ...at, lx: wa[i][0] - cx, ly: wa[i][1] - cy })),
      ...b.atoms.map((at, i) => ({ ...at, lx: wb[i][0] - cx, ly: wb[i][1] - cy }))];
    a.vx = (a.mass * a.vx + b.mass * b.vx) / M;
    a.vy = (a.mass * a.vy + b.mass * b.vy) / M;
    a.x = cx; a.y = cy; a.ang = 0; a.om = (a.om + b.om) * 0.25;
    a.mass = M; a.units += b.units;
    a.radius = a.atoms.reduce((m, at) => Math.max(m, Math.hypot(at.lx, at.ly) + at.r), 0);
    sim.mols = sim.mols.filter((m) => m !== b);
  }

  /* ---------- physics ---------- */

  function step(dt) {
    sim.time += dt;
    const mols = sim.mols;
    for (const m of mols) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.ang += m.om * dt;
      if (m.x < m.radius) { m.x = m.radius; m.vx = Math.abs(m.vx); }
      if (m.x > sim.w - m.radius) { m.x = sim.w - m.radius; m.vx = -Math.abs(m.vx); }
      if (m.y < m.radius) { m.y = m.radius; m.vy = Math.abs(m.vy); }
      if (m.y > sim.h - m.radius) { m.y = sim.h - m.radius; m.vy = -Math.abs(m.vy); }
      const sp = Math.hypot(m.vx, m.vy);
      if (sp > 1400) { m.vx *= 1400 / sp; m.vy *= 1400 / sp; }
    }
    // broad phase: uniform grid
    const cell = 64;
    const grid = new Map();
    mols.forEach((m, i) => {
      const k = `${Math.floor(m.x / cell)},${Math.floor(m.y / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    const removed = new Set();
    for (let i = 0; i < mols.length; i += 1) {
      const a = mols[i];
      if (removed.has(a)) continue;
      const gx = Math.floor(a.x / cell); const gy = Math.floor(a.y / cell);
      const reach = Math.ceil((a.radius + 40) / cell);
      for (let ox = -reach; ox <= reach; ox += 1) {
        for (let oy = -reach; oy <= reach; oy += 1) {
          const list = grid.get(`${gx + ox},${gy + oy}`);
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const b = mols[j];
            if (removed.has(b) || removed.has(a)) continue;
            const dx = b.x - a.x; const dy = b.y - a.y;
            const d = Math.hypot(dx, dy);
            const minD = (a.radius + b.radius) * 0.9;
            if (d >= minD || d === 0) continue;
            const nx = dx / d; const ny = dy / d;
            const vrn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (vrn < 0) {
              const mu = (a.mass * b.mass) / (a.mass + b.mass);
              const eK = (0.5 * mu * vrn * vrn) / KSIM; // collision energy along the line of centres, in kelvin
              if (tryReact(a, b, eK, removed)) continue; // the atoms regrouped into new molecules
              const sa = sim.species[a.sp];
              if (a.sp === b.sp && sa.side === 'R' && sa.tmpl.ionic && sa.phase !== 'g' && !a.morph && !b.morph && a.units + b.units <= 18) {
                mergeClusters(a, b);
                removed.add(b);
                continue;
              }
              const jimp = 2 * mu * vrn;
              a.vx += (jimp / a.mass) * nx; a.vy += (jimp / a.mass) * ny;
              b.vx -= (jimp / b.mass) * nx; b.vy -= (jimp / b.mass) * ny;
            }
            const push = (minD - d) / 2;
            const wa = b.mass / (a.mass + b.mass); const wb = a.mass / (a.mass + b.mass);
            a.x -= nx * push * 2 * wa; a.y -= ny * push * 2 * wa;
            b.x += nx * push * 2 * wb; b.y += ny * push * 2 * wb;
          }
        }
      }
    }
    if (sim.thermostat && sim.mols.length) {
      const T = measuredT();
      if (T > 0) {
        const lam = Math.sqrt(Math.max(0.5, Math.min(2, 1 + (dt / 0.4) * (sim.T / T - 1))));
        sim.mols.forEach((m) => { m.vx *= lam; m.vy *= lam; });
      }
    }
    sim.mols.forEach((m) => { if (m.morph && sim.time - m.morph.t0 > 0.6) m.morph = null; });
    sim.flashes = sim.flashes.filter((f) => sim.time - f.t0 < 0.6);
  }

  function counts() {
    const c = sim.species.map(() => 0);
    sim.mols.forEach((m) => { c[m.sp] += m.units; });
    return c;
  }

  function sample() {
    sim.history.push({ t: sim.time, c: counts(), T: measuredT() });
    if (sim.history.length > 240) sim.history.shift();
  }

  function spark(x, y) {
    sim.mols.forEach((m) => {
      if (Math.hypot(m.x - x, m.y - y) < 120) {
        const [vx, vy] = thermalVelocity(m.mass, 14000);
        m.vx = vx; m.vy = vy;
      }
    });
    sim.flashes.push({ x, y, t0: sim.time, exo: true, spark: true });
  }

  /* ---------- drawing ---------- */

  const sprites = new Map();
  function sprite(color, r, dpr) {
    const key = `${color}|${r}|${dpr}`;
    if (sprites.has(key)) return sprites.get(key);
    const size = Math.ceil((r * 2 + 2) * dpr);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const grad = g.createRadialGradient(r * 0.65, r * 0.6, r * 0.1, r + 1, r + 1, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, shade(color, -0.45));
    g.fillStyle = grad;
    g.beginPath(); g.arc(r + 1, r + 1, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.75; g.stroke();
    sprites.set(key, c);
    return c;
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
    return `rgb(${ch.join(',')})`;
  }

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  function drawMolecule(g, m, positions, dpr, alpha, labels, bondColor) {
    if (m.bonds.length) {
      g.strokeStyle = bondColor;
      g.globalAlpha = alpha;
      m.bonds.forEach(({ a, b, order }) => {
        const [x1, y1] = positions[a]; const [x2, y2] = positions[b];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ox = (-(y2 - y1) / len) * 3; const oy = ((x2 - x1) / len) * 3;
        const offs = order === 1 ? [0] : order === 2 ? [-0.7, 0.7] : [-1.2, 0, 1.2];
        g.lineWidth = order === 1 ? 3.2 : 2.2;
        offs.forEach((o) => { g.beginPath(); g.moveTo(x1 + ox * o, y1 + oy * o); g.lineTo(x2 + ox * o, y2 + oy * o); g.stroke(); });
      });
      g.globalAlpha = 1;
    }
    m.atoms.forEach((a, i) => {
      const [x, y] = positions[i];
      g.drawImage(sprite(a.color, a.r, dpr), x - a.r - 1, y - a.r - 1, a.r * 2 + 2, a.r * 2 + 2);
      if (labels && a.r >= 8) {
        g.fillStyle = luminance(a.color) > 0.55 ? '#1b1f27' : '#ffffff';
        g.font = `600 ${Math.max(8, Math.round(a.r * 0.85))}px system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(a.el, x, y + 0.5);
      }
      if (a.charge) {
        const s = `${Math.abs(a.charge) > 1 ? Math.abs(a.charge) : ''}${a.charge > 0 ? '+' : '−'}`;
        g.font = '700 9px system-ui, sans-serif';
        g.fillStyle = a.charge > 0 ? '#c0392b' : '#2457c5';
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText(s, x + a.r * 0.55, y - a.r * 0.55);
      }
    });
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function render() {
    const cv = els.canvas;
    const g = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = cssVar('--surface-2', '#eef0f4');
    g.fillRect(0, 0, sim.w, sim.h);
    const bondColor = cssVar('--muted', '#5d6675');
    sim.flashes.forEach((f) => {
      const t = (sim.time - f.t0) / 0.6;
      g.beginPath();
      g.arc(f.x, f.y, 10 + t * (f.spark ? 110 : 45), 0, Math.PI * 2);
      g.strokeStyle = f.spark ? `rgba(255,200,60,${1 - t})` : f.exo ? `rgba(255,140,40,${0.9 * (1 - t)})` : `rgba(80,140,255,${0.9 * (1 - t)})`;
      g.lineWidth = 3;
      g.stroke();
    });
    sim.mols.forEach((m) => {
      let pos = worldAtoms(m);
      let alpha = 1;
      if (m.morph) {
        const t = Math.min(1, (sim.time - m.morph.t0) / 0.6);
        const e = t * t * (3 - 2 * t);
        pos = pos.map((p, i) => [m.morph.from[i][0] + (p[0] - m.morph.from[i][0]) * e, m.morph.from[i][1] + (p[1] - m.morph.from[i][1]) * e]);
        alpha = e;
      }
      drawMolecule(g, m, pos, dpr, alpha, sim.labels, bondColor);
    });
  }

  function renderChart() {
    const cv = els.chart;
    const g = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth; const h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const H = sim.history;
    if (H.length < 2) return;
    const max = Math.max(1, ...H.flatMap((p) => p.c));
    const pad = { l: 30, r: 8, t: 8, b: 16 };
    g.strokeStyle = cssVar('--border', '#d9dde5');
    g.lineWidth = 1;
    g.fillStyle = cssVar('--muted', '#5d6675');
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    [0, 0.5, 1].forEach((f) => {
      const y = pad.t + (1 - f) * (h - pad.t - pad.b);
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
      g.fillText(String(Math.round(max * f)), pad.l - 4, y);
    });
    g.textAlign = 'left';
    g.fillText('molecules over time', pad.l, h - 6);
    const t0 = H[0].t; const t1 = H[H.length - 1].t || 1;
    sim.species.forEach((s, k) => {
      g.strokeStyle = s.color;
      g.lineWidth = 2;
      g.setLineDash(s.side === 'L' ? [] : [5, 3]);
      g.beginPath();
      H.forEach((p, i) => {
        const x = pad.l + ((p.t - t0) / Math.max(1e-6, t1 - t0)) * (w - pad.l - pad.r);
        const y = pad.t + (1 - p.c[k] / max) * (h - pad.t - pad.b);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    });
    g.setLineDash([]);
  }

  function miniMolecule(canvas, formula) {
    const t = buildTemplate(formula);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 64; const h = canvas.clientHeight || 48;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(1, (Math.min(w, h) / 2 - 2) / t.radius);
    g.translate(w / 2, h / 2);
    g.scale(s, s);
    const m = { atoms: t.atoms, bonds: t.bonds };
    drawMolecule(g, m, t.atoms.map((a) => [a.lx, a.ly]), dpr * s, 1, false, cssVar('--muted', '#5d6675'));
  }

  /* ---------- UI ---------- */

  const fmt = (x, d = 1) => (x == null ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−'));
  const sub = (f) => String(f).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/([A-Za-z)])(\d+)/g, '$1<sub>$2</sub>');

  function describe() {
    const eq = sim.eq;
    const th = sim.thermo;
    const bc = bondChanges(eq);
    const list = (o) => Object.entries(o).map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
    const ionicProducts = eq.right.filter((x) => buildTemplate(x.formula).ionic);
    const ionicReactants = eq.left.filter((x) => buildTemplate(x.formula).ionic);
    const inN = eq.left.reduce((s, x) => s + x.coef, 0);
    const outN = eq.right.reduce((s, x) => s + x.coef, 0);
    const atoms = Object.values(atomTotals(eq.left)).reduce((a, b) => a + b, 0);
    const parts = [];
    parts.push(`<p>Each reaction event needs <strong>${inN} molecule${inN > 1 ? 's' : ''}</strong> to meet with enough energy. Their <strong>${atoms} atoms</strong> regroup into <strong>${outN} new molecule${outN > 1 ? 's' : ''}</strong>; no atom is created or destroyed.</p>`);
    if (Object.keys(bc.broken).length || Object.keys(bc.formed).length) {
      parts.push(`<p><span class="mol-k">Bonds broken</span> ${list(bc.broken)}<br><span class="mol-k">Bonds formed</span> ${list(bc.formed)}</p>`);
    }
    if (ionicProducts.length && !ionicReactants.length) {
      const metals = [...new Set(ionicProducts.flatMap((x) => Object.keys(x.counts).filter(isMetal)))].map((e) => BY_SYMBOL[e].name.toLowerCase());
      parts.push(`<p>Electrons move from ${metals.join(' and ')} to the non-metal, giving ions (+ and − in the view). Opposite charges attract, so the formula units stick together and grow into a crystal.</p>`);
    }
    if (th.dH != null) {
      const perEventEv = th.dH / KJ_PER_EV;
      const zj = (th.dH * 1000 / NA) * 1e21;
      const kind = th.dH < 0 ? 'releases' : 'absorbs';
      parts.push(`<p>Each event ${kind} <strong>${fmt(Math.abs(perEventEv), 2)} eV</strong> (${fmt(Math.abs(zj), 0)} zJ). Scaled up to a mole of events that is ${fmt(Math.abs(th.dH), 1)} kJ (measured).</p>`);
    } else {
      parts.push('<p>ΔH for this reaction has not been measured for every substance in it, so it is shown as unknown, and the animation releases no reaction heat.</p>');
    }
    return parts.join('');
  }

  function renderThermo() {
    const th = sim.thermo;
    const G = th.dH != null && th.dS != null ? th.dH - (sim.T * th.dS) / 1000 : null;
    els.thermo.innerHTML = `
      <div><div class="lbl">ΔH°</div><div class="val ${th.dH < 0 ? 'neg' : th.dH > 0 ? 'pos' : ''}">${fmt(th.dH)}</div><div class="unit">kJ${th.dH == null ? ', not measured' : ''}</div></div>
      <div><div class="lbl">ΔS°</div><div class="val">${fmt(th.dS)}</div><div class="unit">J/K</div></div>
      <div><div class="lbl">ΔG at ${Math.round(sim.T)} K</div><div class="val ${G < 0 ? 'neg' : G > 0 ? 'pos' : ''}">${fmt(G)}</div><div class="unit">kJ</div></div>`;
  }

  function renderLegend() {
    els.legend.innerHTML = sim.species.map((s, i) => `
      <div class="mol-sp" data-sp="${i}">
        <canvas class="mol-mini" width="64" height="48" data-formula="${s.formula}"></canvas>
        <div class="mol-sp-text">
          <div><span class="mol-swatch ${s.side === 'L' ? '' : 'dashed'}" style="border-color:${s.color}"></span><strong>${sub(s.formula)}</strong> <span class="muted">${s.side === 'L' ? 'reactant' : 'product'}</span></div>
          <div class="muted mol-sp-name">${s.name !== s.formula ? s.name : ''}</div>
        </div>
        <div class="mol-sp-count" id="mol-count-${i}">0</div>
      </div>`).join('');
    els.legend.querySelectorAll('canvas.mol-mini').forEach((c) => miniMolecule(c, c.dataset.formula));
  }

  function renderUses() {
    const seen = new Set();
    const products = sim.species.filter((s) => s.side === 'R' && !seen.has(s.formula) && seen.add(s.formula));
    els.uses.innerHTML = products.map((s) => {
      const u = usesOf(s.formula);
      const head = `<div class="mol-use-head"><canvas class="mol-mini" width="64" height="48" data-formula="${s.formula}"></canvas><div><strong>${sub(s.formula)}</strong>${s.name !== s.formula ? `<div class="muted">${s.name}</div>` : ''}</div></div>`;
      const body = u
        ? `<p>${u.uses}</p>${u.safety ? `<p class="uses-safety"><strong>Safety &amp; environment:</strong> ${u.safety}</p>` : ''}`
        : `<p class="muted">This site has no notes on what it is used for. <a href="https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(s.formula)}" target="_blank" rel="noopener">Look it up on PubChem</a>.</p>`;
      return `<div class="mol-use">${head}${body}</div>`;
    }).join('');
    els.uses.querySelectorAll('canvas.mol-mini').forEach((c) => miniMolecule(c, c.dataset.formula));
  }

  function renderReadout() {
    const c = counts();
    c.forEach((v, i) => { const el = document.getElementById(`mol-count-${i}`); if (el) el.textContent = v; });
    els.readT.textContent = `${Math.round(measuredT()).toLocaleString()} K`;
    els.readEvents.textContent = sim.events.toLocaleString();
    els.readProgress.textContent = `${Math.min(100, Math.round((100 * sim.events) / sim.startSets))}%`;
  }

  function load(text, opts = {}) {
    let eq;
    try {
      eq = parseEquation(text);
    } catch (err) {
      showMessage(err.message, true);
      return false;
    }
    let note = '';
    if (!isBalanced(eq)) {
      const given = eq.coefsGiven;
      if (!balance(eq)) {
        showMessage('These substances cannot be balanced into a reaction (check the formulas: every element must appear on both sides).', true);
        return false;
      }
      note = given ? `That equation was not balanced, so it was rebalanced: ${formatEquation(eq, false)}.` : `Balanced automatically: ${formatEquation(eq, false)}.`;
    }
    if (eq.left.reduce((s, x) => s + x.coef, 0) > 12) {
      showMessage('That reaction needs more than 12 molecules to meet at once, which is too many to simulate.', true);
      return false;
    }
    sim.eq = eq;
    sim.thermo = thermoFor(eq);
    setupSpecies();
    if (opts.T != null) sim.T = opts.T;
    if (opts.Ea != null) sim.Ea = opts.Ea;
    if (opts.thermostat != null) sim.thermostat = opts.thermostat;
    syncControls();
    els.title.textContent = opts.name || 'Your reaction';
    els.eq.innerHTML = formatEquation(eq).split(' -> ').map((s) => s.split(' + ').map((t) => sub(t).replace(/\((s|l|g|aq)\)/, '<span class="ph">($1)</span>')).join(' + ')).join('<span class="arrow">→</span>');
    els.tip.textContent = opts.tip || 'Raise the temperature or lower the barrier to make collisions succeed more often, or tap the box to strike a spark.';
    els.explain.innerHTML = describe();
    renderThermo();
    renderLegend();
    renderUses();
    if (sim.visible) resize();
    populate();
    showMessage(note, false);
    if (!sim.running) toggle(true);
    return true;
  }

  function showMessage(msg, isError) {
    els.msg.textContent = msg || '';
    els.msg.classList.toggle('error', !!isError);
    els.msg.hidden = !msg;
  }

  function syncControls() {
    els.temp.value = sim.T; els.tempVal.textContent = `${sim.T} K`;
    els.ea.value = sim.Ea; els.eaVal.textContent = `${sim.Ea} kJ/mol`;
    els.amount.value = sim.sets; els.amountVal.textContent = sim.sets;
    els.heat.value = Math.round(sim.heat * 100); els.heatVal.textContent = `${Math.round(sim.heat * 100)}%`;
    els.speed.value = sim.speed; els.speedVal.textContent = `${sim.speed}×`;
    els.thermostat.checked = sim.thermostat;
    els.labels.checked = sim.labels;
  }

  function resize() {
    const wrap = els.canvas.parentElement;
    const w = Math.max(280, wrap.clientWidth);
    const h = Math.round(Math.min(520, Math.max(300, w * 0.62)));
    const dpr = window.devicePixelRatio || 1;
    const sx = w / sim.w; const sy = h / sim.h;
    sim.mols.forEach((m) => { m.x *= sx; m.y *= sy; });
    sim.w = w; sim.h = h;
    els.canvas.style.height = `${h}px`;
    els.canvas.width = Math.round(w * dpr);
    els.canvas.height = Math.round(h * dpr);
    render();
  }

  function frame(now) {
    sim.raf = 0;
    if (!sim.visible) return;
    const dtReal = Math.min(0.05, (now - (sim.lastFrame || now)) / 1000);
    sim.lastFrame = now;
    if (sim.running) {
      const dt = dtReal * sim.speed;
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      for (let i = 0; i < n; i += 1) step(dt / n);
      if (sim.time - sim.lastSample > 0.25) { sample(); sim.lastSample = sim.time; renderChart(); }
      renderReadout();
    }
    render();
    sim.raf = requestAnimationFrame(frame);
  }

  function toggle(on) {
    sim.running = on == null ? !sim.running : on;
    els.play.textContent = sim.running ? 'Pause' : 'Play';
    els.play.setAttribute('aria-pressed', String(sim.running));
  }

  function setVisible(v) {
    sim.visible = v;
    if (v) {
      if (!sim.eq) load(PRESETS[0].eq, PRESETS[0]);
      resize();
      sim.lastFrame = 0;
      if (!sim.raf) sim.raf = requestAnimationFrame(frame);
    }
  }

  function hit(x, y) {
    let best = null;
    sim.mols.forEach((m) => { if (Math.hypot(m.x - x, m.y - y) < m.radius && (!best || m.radius < best.radius)) best = m; });
    return best;
  }

  function init() {
    const $ = (id) => document.getElementById(id);
    els = {
      canvas: $('mol-canvas'), chart: $('mol-chart'), tipBox: $('mol-hover'), title: $('mol-title'), eq: $('mol-eq-display'),
      tip: $('mol-tip-text'), explain: $('mol-explain'), thermo: $('mol-thermo'), legend: $('mol-legend'), msg: $('mol-msg'),
      preset: $('mol-preset'), custom: $('mol-custom'), loadBtn: $('mol-load'), play: $('mol-play'), reset: $('mol-reset'),
      spark: $('mol-spark'), reverse: $('mol-reverse'), temp: $('mol-temp'), tempVal: $('mol-temp-val'), ea: $('mol-ea'),
      eaVal: $('mol-ea-val'), amount: $('mol-amount'), amountVal: $('mol-amount-val'), heat: $('mol-heat'), heatVal: $('mol-heat-val'),
      speed: $('mol-speed'), speedVal: $('mol-speed-val'), thermostat: $('mol-thermostat'), labels: $('mol-labels'),
      uses: $('mol-uses'), readT: $('mol-read-t'), readEvents: $('mol-read-events'), readProgress: $('mol-read-progress'),
    };
    els.preset.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('') + '<option value="custom">Your own reaction…</option>';
    els.preset.addEventListener('change', () => {
      const p = PRESETS.find((x) => x.id === els.preset.value);
      if (p) { els.custom.value = ''; load(p.eq, p); } else { els.custom.focus(); }
    });
    const loadCustom = () => {
      if (!els.custom.value.trim()) { showMessage('Type a reaction first, for example 2 H2 + O2 -> 2 H2O.', true); return; }
      els.preset.value = 'custom';
      load(els.custom.value, { name: 'Your reaction' });
    };
    els.loadBtn.addEventListener('click', loadCustom);
    els.custom.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); loadCustom(); } });
    els.play.addEventListener('click', () => toggle());
    els.reset.addEventListener('click', () => { populate(); renderChart(); renderReadout(); });
    els.spark.addEventListener('click', () => spark(sim.w / 2, sim.h / 2));
    els.reverse.addEventListener('click', () => {
      const r = sim.eq;
      const text = formatEquation({ left: r.right, right: r.left });
      load(text, { name: `Reverse: ${els.title.textContent.replace(/^Reverse: /, '')}` });
    });
    const slider = (input, out, fn) => input.addEventListener('input', () => { fn(Number(input.value)); syncControls(); renderThermo(); });
    slider(els.temp, els.tempVal, (v) => { sim.T = v; });
    slider(els.ea, els.eaVal, (v) => { sim.Ea = v; });
    slider(els.heat, els.heatVal, (v) => { sim.heat = v / 100; });
    slider(els.speed, els.speedVal, (v) => { sim.speed = v; });
    slider(els.amount, els.amountVal, (v) => { sim.sets = v; });
    els.amount.addEventListener('change', () => { populate(); renderChart(); });
    els.temp.addEventListener('change', () => {
      if (!sim.thermostat) sim.mols.forEach((m) => { [m.vx, m.vy] = thermalVelocity(m.mass, sim.T); });
    });
    els.thermostat.addEventListener('change', () => { sim.thermostat = els.thermostat.checked; });
    els.labels.addEventListener('change', () => { sim.labels = els.labels.checked; render(); });
    const pointer = (ev) => {
      const r = els.canvas.getBoundingClientRect();
      return [ev.clientX - r.left, ev.clientY - r.top];
    };
    els.canvas.addEventListener('pointerdown', (ev) => { const [x, y] = pointer(ev); spark(x, y); });
    els.canvas.addEventListener('pointermove', (ev) => {
      const [x, y] = pointer(ev);
      const m = hit(x, y);
      if (!m) { els.tipBox.hidden = true; return; }
      const s = sim.species[m.sp];
      els.tipBox.innerHTML = `<b>${sub(s.formula)}</b>${s.name !== s.formula ? ` · ${s.name}` : ''}${m.units > 1 ? `<br>crystal of ${m.units} formula units` : ''}<br>${s.side === 'L' ? 'reactant' : 'product'} · ${m.atoms.length} atoms`;
      els.tipBox.style.left = `${Math.min(x + 12, sim.w - 200)}px`;
      els.tipBox.style.top = `${y + 12}px`;
      els.tipBox.hidden = false;
    });
    els.canvas.addEventListener('pointerleave', () => { els.tipBox.hidden = true; });
    window.addEventListener('resize', () => { if (sim.visible) resize(); });
    document.addEventListener('visibilitychange', () => { sim.lastFrame = 0; });
    syncControls();
  }

  const api = {
    parseEquation, balance, isBalanced, formatEquation, buildTemplate, bondsOf, bondChanges, thermoFor, PRESETS,
    init, load, setVisible, sim,
  };
  if (isNode) module.exports = api;
  else root.MolLab = api;
})(this);
