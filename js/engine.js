/*
 * Reaction engine: formula parsing, balancing of formation reactions,
 * ΔH°/ΔS°/ΔG° calculation, and the DFT results for combinations that
 * have no tabulated data.
 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { ELEMENTS, BY_SYMBOL } = isNode ? require('./elements.js') : root;
  const { COMPOUNDS, SPECIES } = isNode ? require('./thermo.js') : root;
  const Theory = isNode ? require('./theory.js') : root.Theory;

  const R = 8.314462618; // J/(mol·K)
  const T0 = 298.15;
  const MEV_TO_KJ_PER_MOL = 9.648533e7;

  /* ---------- formulas ---------- */

  function parseFormula(formula) {
    const f = formula.replace(/\(.*?[a-z]{3,}.*?\)/g, ''); // drop labels such as "(diamond)"
    let i = 0;
    function group() {
      const counts = {};
      while (i < f.length && f[i] !== ')') {
        let sub;
        if (f[i] === '(') {
          i += 1;
          sub = group();
          i += 1; // skip ')'
        } else {
          const m = /^[A-Z][a-z]?/.exec(f.slice(i));
          if (!m) throw new Error(`Cannot parse formula "${formula}"`);
          i += m[0].length;
          sub = { [m[0]]: 1 };
        }
        const n = /^\d+/.exec(f.slice(i));
        const mult = n ? Number(n[0]) : 1;
        if (n) i += n[0].length;
        Object.keys(sub).forEach((k) => { counts[k] = (counts[k] || 0) + sub[k] * mult; });
      }
      return counts;
    }
    return group();
  }

  const D_FORMULAS = { D2O: { D: 2, O: 1 } }; // isotopically labelled species
  function countsOf(formula) {
    return D_FORMULAS[formula] || parseFormula(formula);
  }

  function setKey(symbols) {
    return [...new Set(symbols)].sort().join('-');
  }

  /* ---------- index of tabulated compounds by element set ---------- */

  const INDEX = {};
  COMPOUNDS.forEach((c) => {
    if (D_FORMULAS[c.formula]) return; // isotope species are offered separately
    const key = setKey(Object.keys(countsOf(c.formula)));
    (INDEX[key] = INDEX[key] || []).push(c);
  });

  function compoundsFor(symbols) {
    return INDEX[setKey(symbols)] || [];
  }

  /* ---------- reactions ---------- */

  // Reference (standard-state) form of each element, plus deuterium.
  function refOf(sym) {
    if (sym === 'D') return { formula: 'D2', atomicity: 2, phase: 'g', S: SPECIES.D2.S };
    const e = BY_SYMBOL[sym];
    return { formula: e.refFormula, atomicity: e.atomicity, phase: e.state, S: e.S };
  }

  /**
   * Formation reaction: elements in their standard states -> compound, balanced with the
   * smallest whole-number coefficients. Returns ΔH° (kJ) and ΔS° (J/K) for the reaction as written.
   */
  function formationReaction(compound, extra = {}) {
    const counts = countsOf(compound.formula);
    const syms = Object.keys(counts);
    const refs = syms.map(refOf);
    // Multiplier that clears the halves from diatomic reference forms.
    let mult = 1;
    syms.forEach((s, k) => { if ((counts[s] % refs[k].atomicity) !== 0) mult = refs[k].atomicity; });

    const left = syms.map((s, k) => ({
      coef: (counts[s] * mult) / refs[k].atomicity,
      formula: refs[k].formula,
      phase: refs[k].phase,
      S: refs[k].S,
    }));
    const right = [{ coef: mult, formula: compound.formula, phase: compound.phase }];

    // ΔS needs a measured S° for the compound; without one it stays unknown (never estimated).
    const sCompound = compound.S;
    const sEstimated = false;
    const sLeft = left.reduce((acc, r) => (acc == null || r.S == null ? null : acc + r.coef * r.S), 0);
    const dS = sCompound == null || sLeft == null ? null : mult * sCompound - sLeft;
    const dH = compound.dHf == null ? null : mult * compound.dHf;

    return {
      kind: 'formation',
      name: compound.name,
      formula: compound.formula,
      note: compound.note || '',
      left,
      right,
      dH,
      dS,
      perCompound: mult,
      hEstimated: !!compound.hEstimated,
      sEstimated,
      quality: sCompound == null ? 'partial' : 'tabulated',
      ...extra,
    };
  }

  function gibbs(dH, dS, T) {
    if (dH == null || dS == null) return null;
    return dH - (T * dS) / 1000;
  }

  // Temperature at which ΔG changes sign (assuming ΔH, ΔS independent of T).
  function crossoverT(dH, dS) {
    if (dH == null || dS == null || dS === 0) return null;
    const t = (dH * 1000) / dS;
    return t > 0 ? t : null;
  }

  function simpleReaction(left, right, dH, dS, props) {
    return { kind: 'other', left, right, dH, dS, quality: 'tabulated', note: '', ...props };
  }

  /* ---------- same element ---------- */

  function sameElementReactions(sym) {
    const e = BY_SYMBOL[sym];
    const out = [];
    const atom = SPECIES[sym];
    if (atom) {
      const n = e.atomicity;
      const dH = 0 - n * atom.dHf;
      const dS = e.S - n * atom.S;
      out.push(simpleReaction(
        [{ coef: n, formula: sym, phase: 'g' }],
        [{ coef: 1, formula: e.refFormula, phase: e.state }],
        dH, dS,
        {
          name: n > 1 ? `Free ${e.name.toLowerCase()} atoms bond into ${e.refFormula}` : `Free carbon atoms condense to graphite`,
          note: `This is the reverse of atomisation. The energy released equals the ${n > 1 ? 'bond' : 'sublimation'} enthalpy.`,
        },
      ));
    }
    const allotropes = {
      O: ['O3', 3, 2, 'Oxygen → ozone', 'Ozone forms from O₂ in electrical discharges and UV light. It is uphill at every temperature (ΔH > 0, ΔS < 0).'],
      C: ['C(diamond)', 1, 1, 'Graphite → diamond', 'Graphite is the stable form. Diamond needs very high pressure (above about 1.5 GPa) to form. Once made it lasts indefinitely because the reverse reaction is extremely slow.'],
      P: ['P(red)', 1, 1, 'White → red phosphorus', 'Heating white P (about 250 °C, no air) converts it to the more stable, far less reactive red form.'],
      Sn: ['Sn(grey)', 1, 1, 'White tin → grey tin ("tin pest")', 'Below about 13 °C grey tin becomes stable and white tin slowly crumbles to powder.'],
    };
    if (allotropes[sym]) {
      const [sp, a, b, name, note] = allotropes[sym];
      const s = SPECIES[sp];
      out.push(simpleReaction(
        [{ coef: a, formula: e.refFormula, phase: e.state }],
        [{ coef: b, formula: sp, phase: s.phase }],
        b * s.dHf, b * s.S - a * e.S,
        { name, note },
      ));
    }
    return out;
  }

  /* ---------- pairs ---------- */

  /**
   * Everything that is known or can be said about combining two different elements.
   * Returns { status, summary, reactions[] }.
   */
  function combinePair(sa, sb) {
    const a = BY_SYMBOL[sa];
    const b = BY_SYMBOL[sb];
    const tab = compoundsFor([sa, sb]);
    if (tab.length) {
      const reactions = tab.map((c) => formationReaction(c)).sort(byStability);
      return { status: 'data', summary: `${tab.length} tabulated compound${tab.length > 1 ? 's' : ''} of ${a.name} and ${b.name}.`, reactions };
    }
    const status = ruleClass(sa, sb);
    if (status === 'superheavy') {
      const heavy = [a, b].filter((e) => e.superheavy).map((e) => e.name).join(' and ');
      return {
        status,
        summary: `No measured chemistry. ${heavy} can only be made a few atoms at a time, and those atoms decay within seconds to days. No bulk compound has ever existed, so ΔH° and ΔS° cannot be measured.`,
        reactions: [],
      };
    }
    if (status === 'noble') {
      // Established: helium, neon and argon form no compounds at ordinary conditions.
      const ng = [a, b].find((e) => ['He', 'Ne', 'Ar'].includes(e.symbol));
      const other = ng === a ? b : a;
      let extra = '';
      if (ng.symbol === 'Ar' && other.symbol === 'H') extra = ' (HArF has been made, but it exists only frozen in solid argon below about 27 K.)';
      if (ng.symbol === 'He' && other.symbol === 'Na') extra = ' (Na₂He has been made, but only at pressures above about 1.1 million atmospheres.)';
      return {
        status,
        summary: `No reaction. ${ng.name} has a full shell of electrons, and no compound of it with ${other.name} has ever been made at ordinary conditions.${extra}`,
        reactions: [simpleReaction(
          [{ coef: 1, formula: a.refFormula, phase: a.state }, { coef: 1, formula: b.refFormula, phase: b.state }],
          [{ coef: 0, formula: 'no reaction', phase: '' }],
          0, 0,
          { name: 'No chemical change', quality: 'none', note: 'Nothing happens, so ΔH° = 0 and ΔS° = 0 (the small entropy of physically mixing the two is ignored).' },
        )],
      };
    }
    return {
      status: 'unknown',
      summary: `This site has no measured thermodynamic data for ${a.name} + ${b.name}. What the other databases record is shown below; if none of them has it either, the outcome is unknown.`,
      reactions: [],
    };
  }

  function byStability(x, y) {
    // Most negative ΔG° per mole of atoms in the product first.
    const atoms = (r) => {
      const c = countsOf(r.formula);
      return r.perCompound * Object.values(c).reduce((s, v) => s + v, 0);
    };
    const gx = gibbs(x.dH, x.dS, T0) ?? x.dH;
    const gy = gibbs(y.dH, y.dS, T0) ?? y.dH;
    return gx / atoms(x) - gy / atoms(y);
  }

  /**
   * Outcome class for a pair: measured data first, then DFT calculations, then established facts.
   */
  function classifyPair(sa, sb) {
    if (sa === sb) return 'same';
    if (compoundsFor([sa, sb]).length) return 'data';
    const info = Theory && Theory.infoFor([sa, sb]);
    if (info) return info.status === 'unstable' ? 'dft-none' : 'dft';
    return ruleClass(sa, sb);
  }

  /** What is known without data: only established facts, never estimates. */
  function ruleClass(sa, sb) {
    const a = BY_SYMBOL[sa];
    const b = BY_SYMBOL[sb];
    if (a.superheavy || b.superheavy) return 'superheavy';
    if (['He', 'Ne', 'Ar'].includes(sa) || ['He', 'Ne', 'Ar'].includes(sb)) return 'noble';
    return 'unknown';
  }

  /* ---------- nuclear reactions between specific isotopes ---------- */

  // reactants (isotope labels), products (display), Q-value in MeV
  const NUCLEAR = [
    [['2H', '3H'], '⁴He + n', 17.59, 'D–T fusion', 'The easiest fusion reaction to ignite. It is the basis of ITER and other tokamak designs.'],
    [['2H', '2H'], '³He + n  (50 %)  or  ³H + p  (50 %)', 3.27, 'D–D fusion', 'Two branches with about equal probability. Q = 3.27 MeV (³He + n) or 4.03 MeV (³H + p).'],
    [['2H', '3He'], '⁴He + p', 18.35, 'D–³He fusion', 'Produces few neutrons, but ³He is very scarce on Earth.'],
    [['1H', '1H'], '²H + e⁺ + νₑ', 0.42, 'Proton–proton fusion', 'The first, extremely slow step of the pp chain that powers the Sun. Annihilation of the positron releases another 1.02 MeV.'],
    [['1H', '2H'], '³He + γ', 5.49, 'p–D capture', 'The second step of the solar pp chain.'],
    [['3He', '3He'], '⁴He + 2 p', 12.86, '³He–³He fusion', 'The final step of the pp-I chain in the Sun.'],
    [['1H', '7Li'], '2 ⁴He', 17.35, 'p–⁷Li reaction', 'Cockcroft and Walton (1932): the first nuclear reaction driven by an accelerator.'],
    [['2H', '6Li'], '2 ⁴He', 22.37, 'D–⁶Li reaction', 'Lithium-6 deuteride is the fusion fuel in thermonuclear weapons.'],
    [['1H', '11B'], '3 ⁴He', 8.68, 'p–¹¹B fusion', 'Produces no neutrons ("aneutronic"), but needs far higher temperatures than D–T.'],
    [['4He', '4He'], '⁸Be', -0.092, '⁴He + ⁴He', '⁸Be is unbound and splits back apart within about 10⁻¹⁶ s. This is why stars need the triple-alpha process.'],
    [['4He', '12C'], '¹⁶O + γ', 7.16, 'Alpha capture on carbon', 'The helium-burning step that sets the carbon/oxygen ratio of the universe.'],
    [['12C', '12C'], '²⁰Ne + ⁴He', 4.62, 'Carbon burning', 'Occurs in the cores of massive stars at about 6×10⁸ K.'],
    [['4He', '14N'], '¹⁷O + p', -1.19, 'Rutherford transmutation (1919)', 'The first artificial nuclear transmutation. It is endothermic, so the alpha particle has to supply the energy.'],
    [['4He', '9Be'], '¹²C + n', 5.70, 'Alpha–beryllium reaction', 'How Chadwick discovered the neutron (1932). It is still used in Am–Be neutron sources.'],
  ];

  function nuclearReactions(isotopes) {
    // isotopes: labels like "2H", one per tray slot. A single slot (or two equal ones) matches X + X reactions.
    const out = [];
    NUCLEAR.forEach(([pair, products, Q, name, note]) => {
      const [x, y] = pair;
      const ok = x === y ? isotopes.length <= 2 && isotopes.every((l) => l === x)
        : isotopes.length === 2 && isotopes.includes(x) && isotopes.includes(y);
      if (!ok) return;
      out.push({
        kind: 'nuclear',
        name,
        nuclearEquation: `${isoLabel(x)} + ${isoLabel(y)} → ${products}`,
        Q,
        dH: -Q * MEV_TO_KJ_PER_MOL,
        dS: null,
        quality: 'nuclear',
        note: `${note} Q = ${Q} MeV per event. ΔH is that energy per mole of events. A thermodynamic ΔS is not meaningful for this reaction.`,
      });
    });
    return out;
  }

  function isoLabel(label) {
    const m = /^(\d+m?)([A-Z][a-z]?)$/.exec(label);
    if (!m) return label;
    const supDigits = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', m: 'ᵐ' };
    return m[1].split('').map((c) => supDigits[c]).join('') + m[2];
  }

  /* ---------- quantum-mechanical (DFT) calculations ---------- */

  const DFT_SHOWN = 6;
  const PAIR_BREAKDOWN_MAX = 4; // with more elements the pair-by-pair list gets too long

  function dftReaction(e) {
    const r = formationReaction({
      formula: e.formula,
      phase: 's',
      dHf: e.dHf,
      S: null,
      name: `${e.formula} (${e.spg})`,
    }, { quality: 'dft', dft: e });
    const parts = [Theory.stabilityText(e), Theory.gapText(e)];
    if (e.polymorphs > 1) parts.push(`${e.polymorphs} crystal structures were computed for this formula; the most stable one is shown.`);
    parts.push(`ΔH is the DFT formation energy (${e.fe.toFixed(3)} eV/atom, ≈ 0 K). DFT gives no entropy, so ΔS and ΔG are left blank.`);
    r.note = parts.filter(Boolean).join(' ');
    return r;
  }

  /** Section with the computed compounds of exactly this element set, or null if none were computed. */
  function dftSection(syms) {
    if (!Theory) return null;
    const list = Theory.forSet(syms);
    if (!list.length) return null;
    const info = Theory.infoFor(syms);
    const names = syms.map((s) => BY_SYMBOL[s].name).join(', ');
    let shown = list.filter((e) => e.fe < 0 && e.ehull <= Theory.NEAR).slice(0, DFT_SHOWN);
    if (!shown.length) shown = list.slice(0, 3);
    let summary;
    if (info.stable) {
      summary = `DFT computed ${info.compounds} compound${info.compounds > 1 ? 's' : ''} of ${names}. `
        + `${info.stable} ${info.stable > 1 ? 'are' : 'is'} calculated to be thermodynamically stable`
        + (info.hypothetical ? `, including ${info.hypothetical} with no experimental record (calculated, never made).` : '.');
    } else if (info.status === 'metastable') {
      summary = `DFT computed ${info.compounds} compound${info.compounds > 1 ? 's' : ''} of ${names}. None is fully stable, but the best lies within ${info.best.ehull.toFixed(3)} eV/atom of the convex hull, so it may still be made.`;
    } else {
      summary = `DFT computed ${info.compounds} hypothetical compound${info.compounds > 1 ? 's' : ''} of ${names}, and none is stable.`
        + (syms.length > 2
          ? ' These elements would rather form simpler compounds (see the pairs) than a compound containing all of them.'
          : ' By this calculation these elements do not form a compound and stay separate or mix.');
    }
    if (list.length > shown.length) summary += ` Showing the ${shown.length} lowest in energy.`;
    return {
      title: `Quantum-mechanical calculation (DFT): ${syms.map((s) => s).join(' + ')}`,
      status: 'dft',
      summary,
      reactions: shown.map(dftReaction),
      info,
    };
  }

  /* ---------- top level ---------- */

  /**
   * selection: [{ symbol, isotope }] where isotope is a mass label ("2") or null for natural.
   * Returns sections to render.
   */
  function combine(selection) {
    const syms = [...new Set(selection.map((s) => s.symbol))];
    const sections = [];
    const isoLabels = selection.filter((s) => s.isotope).map((s) => s.isotope + s.symbol);

    if (isoLabels.length && isoLabels.length === selection.length) {
      const nuc = nuclearReactions(isoLabels);
      if (nuc.length) sections.push({ title: 'Nuclear reactions between the chosen isotopes', status: 'nuclear', summary: 'At extreme temperatures or in a particle accelerator, these nuclei can fuse or transmute. This is a change to the nuclei themselves, not chemistry.', reactions: nuc });
    }

    // Heavy water: the one isotope substitution with a large, well-tabulated effect.
    const h = selection.find((s) => s.symbol === 'H');
    if (h && h.isotope === '2' && syms.length === 2 && syms.includes('O')) {
      const d2o = COMPOUNDS.find((c) => c.formula === 'D2O');
      sections.push({ title: 'Deuterium-specific result', status: 'data', summary: 'Heavy hydrogen gives heavy water. Its ΔHf° differs from H₂O by about 9 kJ/mol (a zero-point-energy isotope effect).', reactions: [formationReaction(d2o)] });
    }

    if (syms.length === 1) {
      const e = BY_SYMBOL[syms[0]];
      const rs = sameElementReactions(e.symbol);
      let summary;
      if (e.category === 'ng') summary = `${e.name} with itself: nothing happens. Noble-gas atoms stay single (monatomic).`;
      else if (rs.length) summary = `Atoms of ${e.name} can only bond to each other, which gives the element itself or one of its allotropes.`;
      else summary = `${e.name} with itself just gives the pure element${e.isMetal ? ' (held together by metallic bonding)' : ''}. No new substance forms, so ΔH° = 0 and ΔS° = 0.`;
      sections.push({ title: `${e.name} + ${e.name}`, status: 'same', summary, reactions: rs });
      return sections;
    }

    if (syms.length > 2) {
      const exact = compoundsFor(syms).map((c) => formationReaction(c)).sort(byStability);
      const names = syms.map((s) => BY_SYMBOL[s].name).join(' + ');
      const dft = dftSection(syms);
      let summary;
      if (exact.length) summary = `${exact.length} tabulated compound${exact.length > 1 ? 's' : ''} containing all ${syms.length} elements.`;
      else if (dft) summary = `No measured data for a compound containing all ${syms.length} elements. See the calculation below.`;
      else summary = `No compound containing all ${syms.length} of these elements has been measured or computed.${syms.length <= PAIR_BREAKDOWN_MAX ? ' The pairs below show what each pair forms.' : ''}`;
      sections.push({ title: names, status: exact.length ? 'data' : 'none', summary, reactions: exact });
      if (dft) sections.push(dft);
      if (syms.length > PAIR_BREAKDOWN_MAX) return sections;
      for (let i = 0; i < syms.length; i += 1) {
        for (let j = i + 1; j < syms.length; j += 1) {
          pairSections(syms[i], syms[j]).forEach((p) => sections.push({ ...p, sub: true }));
        }
      }
      return sections;
    }

    pairSections(syms[0], syms[1]).forEach((p) => sections.push(p));
    return sections;
  }

  /** Measured result or established fact for a pair, merged with the DFT calculation where one exists. */
  function pairSections(sa, sb) {
    const title = `${BY_SYMBOL[sa].name} + ${BY_SYMBOL[sb].name}`;
    const base = { title, ...combinePair(sa, sb) };
    const dft = dftSection([sa, sb]);
    if (!dft) return [base];
    const forms = dft.info.status !== 'unstable';
    void forms;
    if (base.status === 'unknown') return [{ ...dft, title }]; // the calculation is what is known
    return [base, dft];
  }

  const api = {
    parseFormula,
    countsOf,
    compoundsFor,
    formationReaction,
    gibbs,
    crossoverT,
    combinePair,
    combine,
    classifyPair,
    dftSection,
    sameElementReactions,
    nuclearReactions,
    isoLabel,
    T0,
    INDEX,
  };
  if (isNode) module.exports = api;
  else root.Engine = api;
})(this);
