/* UI for the Element Combinator. Depends on elements.js, isotopes.js, thermo.js, engine.js. */
(function () {
  const MAX_TRAY = 7; // the DFT data contains compounds of up to 7 elements
  const state = { tray: [], T: 298, infoSym: null, allIsotopes: false };
  const $ = (sel) => document.querySelector(sel);

  /* ---------- formatting ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function fmtFormula(f) {
    return esc(f).replace(/([A-Za-z)])(\d+)/g, '$1<sub>$2</sub>').replace(/\((diamond|red|grey)\)/, ' ($1)');
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function fmtNum(x, digits = 1) {
    if (x == null || Number.isNaN(x)) return '—';
    const ax = Math.abs(x);
    if (ax >= 1e6) {
      const exp = Math.floor(Math.log10(ax));
      const mant = (x / 10 ** exp).toFixed(2).replace('-', '−');
      return `${mant} × 10${String(exp).split('').map((c) => SUP[c]).join('')}`;
    }
    const s = x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return s.replace('-', '−');
  }
  function signClass(x) { return x == null ? '' : x < 0 ? 'neg' : x > 0 ? 'pos' : ''; }
  function isoSup(A) { return String(A).split('').map((c) => (c === 'm' ? 'ᵐ' : SUP[c])).join(''); }
  const PHASE = { s: 's', l: 'l', g: 'g' };

  /* ---------- periodic table ---------- */

  function renderLegend() {
    const used = ['am', 'ae', 'tm', 'pt', 'md', 'nm', 'hg', 'ng', 'ln', 'an', 'uk'];
    $('#legend').innerHTML = used.map((c) => `<span><i class="cat-${c}"></i>${CATEGORIES[c]}</span>`).join('');
  }

  function renderTable() {
    const grid = $('#ptable');
    const parts = ELEMENTS.map((e) => `
      <button class="el cat-${e.category}" data-sym="${e.symbol}" style="grid-column:${e.col};grid-row:${e.row}"
        title="${e.name} (Z = ${e.Z})" aria-label="${e.name}, atomic number ${e.Z}">
        <span class="z">${e.Z}</span><span class="sym">${e.symbol}</span><span class="nm">${e.name}</span>
      </button>`);
    parts.push('<div class="el placeholder" style="grid-column:3;grid-row:6">57–71</div>');
    parts.push('<div class="el placeholder" style="grid-column:3;grid-row:7">89–103</div>');
    grid.innerHTML = parts.join('');

    grid.addEventListener('click', (ev) => {
      const b = ev.target.closest('.el[data-sym]');
      if (!b) return;
      addToTray(b.dataset.sym);
      renderInfo(b.dataset.sym);
    });
    grid.addEventListener('mouseover', (ev) => {
      const b = ev.target.closest('.el[data-sym]');
      if (b) renderInfo(b.dataset.sym);
    });
    grid.addEventListener('focusin', (ev) => {
      const b = ev.target.closest('.el[data-sym]');
      if (b) renderInfo(b.dataset.sym);
    });
  }

  function markTray() {
    const counts = {};
    state.tray.forEach((s) => { counts[s.symbol] = (counts[s.symbol] || 0) + 1; });
    document.querySelectorAll('.el[data-sym]').forEach((b) => {
      const n = counts[b.dataset.sym] || 0;
      b.classList.toggle('in-tray', n > 0);
      const old = b.querySelector('.count');
      if (old) old.remove();
      if (n > 1) b.insertAdjacentHTML('beforeend', `<span class="count">×${n}</span>`);
    });
  }

  function applySearch(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll('.el[data-sym]').forEach((b) => {
      const e = BY_SYMBOL[b.dataset.sym];
      const hit = !q || e.symbol.toLowerCase() === q || e.name.toLowerCase().includes(q) || String(e.Z) === q;
      b.classList.toggle('dim', !hit);
    });
  }

  /* ---------- element info ---------- */

  function renderInfo(sym) {
    const e = BY_SYMBOL[sym];
    state.infoSym = sym;
    const all = ISOTOPES[sym] || [];
    const isos = state.allIsotopes ? all : all.filter((i) => i.notable);
    const ox = e.ox.length ? e.ox.map((o) => (o > 0 ? '+' + o : String(o).replace('-', '−'))).join(', ') : '—';
    const stateName = { s: 'solid', l: 'liquid', g: 'gas' }[e.state] + (e.statePredicted ? ' (predicted)' : '');
    const rows = isos.map((i) => `
      <tr><td>${isoSup(i.A)}${e.symbol}</td>
      <td>${i.halfLife ? `<span class="pill radio">${esc(i.halfLife)}</span>` : '<span class="pill">stable</span>'}</td>
      <td class="decay">${esc(i.decay || '—')}</td>
      <td class="num">${i.abundance != null ? i.abundance + ' %' : '—'}</td>
      <td class="num">${i.atomicMass != null ? i.atomicMass.toFixed(6) : '—'}</td>
      <td class="num">${i.discovered}</td></tr>`).join('');
    const hidden = all.length - isos.length;
    const toggle = state.allIsotopes
      ? `<button class="btn" data-iso-toggle>Show notable only</button>`
      : `<button class="btn" data-iso-toggle>Show all ${all.length} known isotopes</button>`;
    $('#element-info').innerHTML = `
      <div class="ei-head">
        <div class="ei-tile cat-${e.category}"><small>${e.Z}</small><b>${e.symbol}</b></div>
        <div><h2 style="margin:0">${e.name}</h2><div class="muted">${e.categoryName}${e.radioactive ? ' · radioactive' : ''}</div></div>
      </div>
      <dl class="ei-props">
        <div><dt>Atomic weight</dt><dd>${e.mass}</dd></div>
        <div><dt>Group / period</dt><dd>${e.group ?? 'f-block'} / ${e.period}</dd></div>
        <div><dt>Electronegativity (Pauling)</dt><dd>${e.en ?? 'not determined'}</dd></div>
        <div><dt>Oxidation states</dt><dd>${ox}</dd></div>
        <div><dt>Standard state (25 °C)</dt><dd>${e.refFormula} (${stateName})</dd></div>
        <div><dt>ΔH<sub>f</sub>° (standard state)</dt><dd>0 kJ/mol (by definition)</dd></div>
        <div><dt>S° (standard state)</dt><dd>${e.S != null ? fmtNum(e.S, 2) + ' J/(mol·K)' : 'not reliably known'}</dd></div>
      </dl>
      <div class="iso-head">
        <h3>Isotopes <span class="muted">(${isos.length} of ${all.length} known${hidden ? ', notable shown' : ''})</span></h3>
        ${toggle}
      </div>
      <div class="iso-scroll">
        <table class="iso-table">
          <thead><tr><th>Isotope</th><th>Half-life</th><th>Decay modes</th><th class="num">Abundance</th><th class="num">Mass (u)</th><th class="num">Found</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /* ---------- tray ---------- */

  function addToTray(sym) {
    if (state.tray.length >= MAX_TRAY) state.tray.shift();
    state.tray.push({ symbol: sym, isotope: null });
    update();
  }

  function renderTray() {
    const t = $('#tray');
    if (!state.tray.length) {
      t.innerHTML = '<div class="tray-empty">Click elements in the periodic table to add them here.</div>';
      return;
    }
    t.innerHTML = state.tray.map((s, i) => {
      const e = BY_SYMBOL[s.symbol];
      const option = (iso) => {
        const lbl = `${isoSup(iso.A)}${e.symbol}${iso.abundance != null ? ` (${iso.abundance}%)` : iso.halfLife ? ` (t½ ${iso.halfLife})` : ''}`;
        return `<option value="${iso.A}" ${s.isotope === iso.A ? 'selected' : ''}>${esc(lbl)}</option>`;
      };
      const list = ISOTOPES[s.symbol] || [];
      const opts = `<optgroup label="Notable">${list.filter((x) => x.notable).map(option).join('')}</optgroup>`
        + `<optgroup label="All other known isotopes">${list.filter((x) => !x.notable).map(option).join('')}</optgroup>`;
      return `${i ? '<span class="plus">+</span>' : ''}
        <div class="slot cat-${e.category}">
          <button class="rm" data-rm="${i}" aria-label="Remove ${e.name}">×</button>
          <b>${s.isotope ? `<sup style="font-size:.55em">${isoSup(s.isotope)}</sup>` : ''}${e.symbol}</b><small>${e.name}</small>
          <select data-iso="${i}" aria-label="Isotope of ${e.name}">
            <option value="">natural</option>${opts}
          </select>
        </div>`;
    }).join('');
  }

  /* ---------- results ---------- */

  function equationHTML(r) {
    if (r.kind === 'nuclear') return esc(r.nuclearEquation);
    const side = (terms) => terms.map((t) => {
      if (t.coef === 0) return `<em>${esc(t.formula)}</em>`;
      const c = t.coef === 1 ? '' : `${+t.coef.toFixed(3)} `;
      const ph = t.phase ? `<span class="ph">(${esc(PHASE[t.phase] || t.phase)})</span>` : '';
      return `${c}${fmtFormula(t.formula)}${ph}`;
    }).join(' + ');
    return `${side(r.left)}<span class="arrow">→</span>${side(r.right)}`;
  }

  function verdict(r, T) {
    const { dH, dS } = r;
    if (r.quality === 'none') return 'No change in enthalpy or entropy.';
    if (r.kind === 'nuclear') return r.Q > 0
      ? `<strong class="good">Releases energy</strong> (exoergic) once the nuclei get close enough, which requires overcoming the Coulomb barrier (fusion temperatures, about 10⁷–10⁹ K).`
      : `<strong class="bad">Absorbs energy</strong> (endoergic). The incoming particle must supply at least ${Math.abs(r.Q)} MeV.`;
    const parts = [];
    if (dH != null) parts.push(dH < 0 ? 'Exothermic (releases heat).' : dH > 0 ? 'Endothermic (absorbs heat).' : 'Thermoneutral.');
    const G = Engine.gibbs(dH, dS, T);
    if (G != null) {
      parts.push(G < 0
        ? `<strong class="good">Favourable at ${Math.round(T)} K</strong> (ΔG < 0).`
        : `<strong class="bad">Not favourable at ${Math.round(T)} K</strong> (ΔG > 0).`);
      const Tc = Engine.crossoverT(dH, dS);
      if (dH < 0 && dS > 0) parts.push('Favourable at all temperatures.');
      else if (dH > 0 && dS < 0) parts.push('Not favourable at any temperature: it can only be driven by external energy (light, electricity, pressure).');
      else if (Tc) parts.push(dH < 0 ? `Favourable below ≈ ${fmtNum(Tc, 0)} K.` : `Favourable above ≈ ${fmtNum(Tc, 0)} K.`);
    }
    return parts.join(' ');
  }

  const QUALITY = {
    tabulated: ['q-tabulated', 'Tabulated data'],
    partial: ['q-partial', 'ΔH tabulated · ΔS estimated'],
    estimated: ['q-estimated', 'Estimated'],
    none: ['q-none', 'No reaction'],
    nuclear: ['q-nuclear', 'Nuclear'],
    dft: ['q-dft', 'Computed (DFT)'],
    alex: ['q-dft', 'Computed (Alexandria DFT)'],
  };

  const JARVIS_URL = (jid) => `https://www.ctcms.nist.gov/~knc6/jsmol/${jid}.html`;

  function stabilityBadge(e) {
    if (e.fe >= 0) return '<span class="badge st-unstable">does not form</span>';
    if (e.ehull <= Theory.STABLE) {
      let extra = '';
      if (e.known === true) extra = '<span class="badge st-known">observed</span>';
      else if (e.known === false) extra = '<span class="badge st-new" title="No experimentally determined structure (ICSD) is linked to it">no experimental record</span>';
      return `<span class="badge st-stable">predicted stable</span>${extra}`;
    }
    if (e.ehull <= Theory.METASTABLE) return '<span class="badge st-meta">metastable</span>';
    return '<span class="badge st-unstable">unstable</span>';
  }

  function reactionHTML(r, T) {
    const [qc, ql] = QUALITY[r.quality] || QUALITY.estimated;
    const G = r.kind === 'nuclear' ? r.dH : Engine.gibbs(r.dH, r.dS, T);
    const hEst = r.hEstimated ? '<div class="est">estimate</div>' : r.dft ? '<div class="est">DFT, ≈ 0 K</div>' : '';
    const sEst = r.sEstimated || (r.quality === 'estimated' && r.dS != null) ? '<div class="est">estimate</div>' : '';
    const dSText = r.kind === 'nuclear' ? 'n/a' : fmtNum(r.dS, 1);
    const dHText = r.dH == null ? 'not tabulated' : fmtNum(r.dH, 1);
    let perMol = '';
    if (r.kind === 'formation' && r.perCompound > 1 && r.dH != null) {
      perMol = `<div class="per-mol">Values are per mole of reaction as written. Per mole of ${fmtFormula(r.formula)}: ΔH<sub>f</sub>° = ${fmtNum(r.dH / r.perCompound, 1)} kJ/mol${r.dS != null ? `, ΔS<sub>f</sub>° = ${fmtNum(r.dS / r.perCompound, 1)} J/(mol·K)` : ''}.</div>`;
    }
    return `
      <article class="rx">
        <div class="rx-top"><div class="rx-name">${r.dft ? `${fmtFormula(r.dft.formula)} <span class="muted">(${esc(r.dft.spg)})</span>` : esc(r.name)}</div><span class="badges">${r.dft ? stabilityBadge(r.dft) : ''}<span class="badge ${qc}">${ql}</span></span></div>
        <div class="eq">${equationHTML(r)}</div>
        <div class="thermo">
          <div><div class="lbl">ΔH°</div><div class="val ${signClass(r.dH)}">${dHText}</div><div class="unit">kJ</div>${hEst}</div>
          <div><div class="lbl">ΔS°</div><div class="val">${dSText}</div><div class="unit">J/K</div>${sEst}</div>
          <div><div class="lbl">ΔG at ${Math.round(T)} K</div><div class="val ${signClass(G)}">${fmtNum(G, 1)}</div><div class="unit">kJ${r.kind === 'nuclear' ? ' (≈ ΔH)' : ''}</div></div>
        </div>
        <p class="verdict">${verdict(r, T)}</p>
        ${perMol}
        ${r.note ? `<p class="rx-note">${esc(r.note)}</p>` : ''}
        ${r.dft && r.dft.jid ? `<p class="rx-note"><a href="${JARVIS_URL(r.dft.jid)}" target="_blank" rel="noopener">View the computed crystal structure (${r.dft.jid})</a></p>` : ''}
      </article>`;
  }

  function isotopeNote() {
    const picked = state.tray.filter((s) => s.isotope);
    if (!picked.length) return '';
    const msgs = picked.map((s) => {
      const iso = ISOTOPES[s.symbol].find((i) => i.A === s.isotope);
      const label = `${isoSup(iso.A)}${s.symbol}`;
      return iso.halfLife
        ? `${label} is radioactive (t½ ${esc(iso.halfLife)}). Its chemistry matches ordinary ${BY_SYMBOL[s.symbol].name.toLowerCase()}, but any compound it forms will itself be radioactive.`
        : `${label} is stable. Isotopes share the same electron structure, so the chemistry and the ΔH°/ΔS° values below are essentially unchanged (the values shown are for natural isotopic composition).`;
    });
    const hNote = picked.some((s) => s.symbol === 'H')
      ? ' Hydrogen is the exception: its isotopes differ in mass by a factor of 2–3, and that shifts ΔH by a few kJ/mol.' : '';
    return `<div class="iso-note">${msgs.join(' ')}${hNote}</div>`;
  }

  function renderResults() {
    const out = $('#results');
    if (!state.tray.length) {
      out.innerHTML = '';
      return;
    }
    const sections = Engine.combine(state.tray);
    const T = state.T;
    let html = isotopeNote();
    sections.forEach((s) => {
      html += `<div class="section-head ${s.sub ? 'sub' : ''}"><h3>${esc(s.title)}</h3><p>${esc(s.summary || '')}</p></div>`;
      s.reactions.forEach((r) => { html += reactionHTML(r, T); });
    });
    const syms = [...new Set(state.tray.map((x) => x.symbol))];
    if (syms.length > 1) html += '<div id="atlas-slot" class="atlas-slot"><p class="muted">Checking every database…</p></div>';
    if (state.tray.length === 1) {
      html += '<p class="hint">Add another element to see what they form together, or click the same element again to react it with itself.</p>';
    }
    out.innerHTML = html;
    if (syms.length > 1) renderAtlas(syms, T);
  }

  /* ---------- every database (atlas) ---------- */

  const PUBCHEM_URL = (cid) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
  const atlasCache = new Map();
  let atlasToken = 0;

  function alexReaction(row, known) {
    const counts = Engine.parseFormula(row.formula);
    const atoms = Object.values(counts).reduce((a, b) => a + b, 0);
    const r = Engine.formationReaction({ formula: row.formula, phase: 's', dHf: row.fe * atoms * Atlas.EV_TO_KJ, S: null, name: row.formula },
      { quality: 'alex', dft: { formula: row.formula, fe: row.fe, ehull: row.ehull, spg: `space group ${row.spg}`, gap: row.gap, known: null } });
    const parts = [];
    parts.push(row.ehull <= Theory.STABLE
      ? 'On the Alexandria convex hull: stable against all ~5.8 million compounds that database computed.'
      : `Not stable: ${row.ehull.toFixed(3)} eV/atom above the Alexandria convex hull. This is the lowest-lying compound computed.`);
    parts.push(row.gap > 0 ? `Band gap ≈ ${row.gap} eV (PBE, typically underestimated).` : 'Metallic (no band gap).');
    parts.push(known ? 'This element combination is recorded experimentally (see PubChem / COD above), though not necessarily this exact formula.' : 'No experimental database records this element combination.');
    parts.push(`ΔH is the DFT formation energy (${row.fe.toFixed(3)} eV/atom). ΔS is an additive estimate. Alexandria id ${row.id}.`);
    r.note = parts.join(' ');
    return r;
  }

  function atlasHTML(syms, rec, T) {
    const names = syms.map((x) => BY_SYMBOL[x].name).join(' + ');
    const known = !!(rec && (rec.pubchem || rec.cod));
    const jarvis = Theory.infoFor(syms);
    const computed = !!(rec && rec.alexandria) || !!jarvis;
    let verdict;
    if (known) verdict = ['st-stable', 'Known combination'];
    else if (computed) verdict = ['st-meta', 'Only explored theoretically'];
    else verdict = ['st-unstable', 'Not in any database'];
    const items = [];
    items.push(rec && rec.pubchem
      ? `<li><strong>PubChem</strong>: ${rec.pubchem.count.toLocaleString()} compound record${rec.pubchem.count > 1 ? 's' : ''} contain exactly these elements. Example: <a href="${PUBCHEM_URL(rec.pubchem.cid)}" target="_blank" rel="noopener">${fmtFormula(rec.pubchem.formula)} (CID ${rec.pubchem.cid})</a>.</li>`
      : '<li><strong>PubChem</strong>: no compound record with exactly these elements.</li>');
    items.push(rec && rec.cod
      ? `<li><strong>Crystallography Open Database</strong>: ${rec.cod.count.toLocaleString()} experimentally determined crystal structure${rec.cod.count > 1 ? 's' : ''}, e.g. ${fmtFormula(rec.cod.formula)}.</li>`
      : '<li><strong>Crystallography Open Database</strong>: no measured crystal structure.</li>');
    items.push(rec && rec.alexandria
      ? `<li><strong>Alexandria (DFT)</strong>: ${rec.alexandria.computed.toLocaleString()} compound${rec.alexandria.computed > 1 ? 's' : ''} computed, ${rec.alexandria.stable} on the convex hull.</li>`
      : '<li><strong>Alexandria (DFT)</strong>: never computed.</li>');
    items.push(jarvis
      ? `<li><strong>JARVIS-DFT (NIST)</strong>: ${jarvis.compounds} compound${jarvis.compounds > 1 ? 's' : ''} computed, ${jarvis.stable} stable (details above).</li>`
      : '<li><strong>JARVIS-DFT (NIST)</strong>: never computed.</li>');

    let html = `<div class="section-head"><h3>Across every database: ${esc(names)} <span class="badge ${verdict[0]}">${verdict[1]}</span></h3>
      <p>What the largest open chemistry databases record for compounds made of exactly these ${syms.length} elements.</p></div>
      <div class="rx"><ul class="sources">${items.join('')}</ul></div>`;

    if (rec && rec.alexandria && rec.alexandria.rows.length) {
      html += rec.alexandria.rows.map((row) => reactionHTML(alexReaction(row, known), T)).join('');
    }
    if (!computed) {
      const m = Atlas.predict(syms);
      if (m.outside) {
        html += `<div class="rx"><div class="rx-top"><div class="rx-name">Model prediction</div><span class="badge q-none">Out of range</span></div>
          <p class="rx-note">The prediction model was not trained on ${m.outside.map((x) => BY_SYMBOL[x].name).join(', ')}, so it cannot judge this combination. ${m.outside.some((x) => BY_SYMBOL[x].category === 'ng') ? 'The noble gases were left out because the DFT databases hardly ever computed them.' : 'Elements beyond plutonium appear in no training data.'}</p></div>`;
      } else {
        const pct = Math.round(m.probability * 100);
        const cls = m.probability >= 0.5 ? 'st-stable' : m.probability >= 0.25 ? 'st-meta' : 'st-unstable';
        const metrics = Atlas.MODEL.metrics;
        html += `<div class="rx">
          <div class="rx-top"><div class="rx-name">Model prediction: ${esc(names)}</div><span class="badges"><span class="badge ${cls}">${pct}% likely to form a stable compound</span><span class="badge q-estimated">Machine-learning estimate</span></span></div>
          <div class="thermo">
            <div><div class="lbl">Chance of a stable compound</div><div class="val">${pct}%</div><div class="unit">classifier</div></div>
            <div><div class="lbl">Lowest ΔH<sub>f</sub> per atom</div><div class="val ${signClass(m.feKj)}">${fmtNum(m.feKj, 0)}</div><div class="unit">kJ/mol (≈ ${m.fe.toFixed(2)} eV)</div></div>
            <div><div class="lbl">Typical error</div><div class="val">±${fmtNum(m.mae * Atlas.EV_TO_KJ, 0)}</div><div class="unit">kJ/mol per atom</div></div>
          </div>
          <p class="rx-note">No database has explored this combination, so this is a theoretical estimate. A gradient-boosted model, trained on ${(680189).toLocaleString()} combinations that Alexandria did compute, uses only the elements' properties (electronegativity, size, position in the table, ionisation energy and so on). On combinations it had not seen, it ranks stable systems above unstable ones ${Math.round(metrics.auc * 100)}% of the time (AUC ${metrics.auc}). It cannot name the formula or the crystal structure, so no balanced equation or ΔS is given.${m.extrapolated ? ' It was trained on up to 4 elements, so a prediction for more is an extrapolation.' : ''}</p>
        </div>`;
      }
    }
    return html;
  }

  async function renderAtlas(syms, T) {
    const token = ++atlasToken;
    const key = Atlas.keyOf(syms);
    let rec;
    try {
      rec = atlasCache.has(key) ? atlasCache.get(key) : await Atlas.lookup(syms);
      atlasCache.set(key, rec);
    } catch (err) {
      const slot = $('#atlas-slot');
      if (slot && token === atlasToken) slot.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
      return;
    }
    const slot = $('#atlas-slot');
    if (slot && token === atlasToken) slot.innerHTML = atlasHTML(syms, rec, T);
  }

  /* ---------- state ---------- */

  function syncHash() {
    const h = state.tray.map((s) => (s.isotope || '') + s.symbol).join('+');
    const url = h ? '#' + h : location.pathname + location.search;
    history.replaceState(null, '', url);
  }

  function readHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    state.tray = h.split('+').slice(0, MAX_TRAY).map((tok) => {
      const m = /^(\d+m?)?([A-Z][a-z]?)$/.exec(tok);
      if (!m || !BY_SYMBOL[m[2]]) return null;
      const iso = m[1] && (ISOTOPES[m[2]] || []).some((i) => i.A === m[1]) ? m[1] : null;
      return { symbol: m[2], isotope: iso };
    }).filter(Boolean);
  }

  function update() {
    renderTray();
    markTray();
    renderResults();
    syncHash();
  }

  function setTray(tokens) {
    state.tray = tokens.map((t) => (typeof t === 'string' ? { symbol: t, isotope: null } : t));
    update();
  }

  /* ---------- examples & stats ---------- */

  const EXAMPLES = [
    ['H + O', ['H', 'O']],
    ['Na + Cl', ['Na', 'Cl']],
    ['Fe + O', ['Fe', 'O']],
    ['N + H', ['N', 'H']],
    ['Ca + C + O', ['Ca', 'C', 'O']],
    ['C + C', ['C', 'C']],
    ['Xe + F', ['Xe', 'F']],
    ['He + Na', ['He', 'Na']],
    ['Cu + Zn', ['Cu', 'Zn']],
    ['²H + ³H', [{ symbol: 'H', isotope: '2' }, { symbol: 'H', isotope: '3' }]],
    ['²H + O', [{ symbol: 'H', isotope: '2' }, 'O']],
    ['Rb + I', ['Rb', 'I']],
  ];

  function renderExamples() {
    $('#examples').innerHTML = '<span class="muted" style="font-size:.78rem;align-self:center">Try:</span>'
      + EXAMPLES.map(([l], i) => `<button class="btn" data-ex="${i}">${l}</button>`).join('');
    $('#examples').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ex]');
      if (b) setTray(EXAMPLES[b.dataset.ex][1]);
    });
  }

  let PAIR_CLASS = null;
  // Measured data first, then experimental records (PubChem, COD), then DFT, then the simple rules.
  function pairClass(a, b) {
    const c = Engine.classifyPair(a, b);
    if (c === 'data' || c === 'same') return c;
    const p = Atlas.PAIRS[Atlas.keyOf([a, b])];
    if (p && (p.pubchem || p.cod)) return 'known';
    if (c === 'dft' || (p && p.stable)) return 'dft';
    if (c === 'dft-none' || (p && p.computed)) return 'dft-none';
    return c;
  }

  function pairClasses() {
    if (PAIR_CLASS) return PAIR_CLASS;
    const n = ELEMENTS.length;
    PAIR_CLASS = [];
    for (let i = 0; i < n; i += 1) {
      PAIR_CLASS[i] = [];
      for (let j = 0; j < n; j += 1) {
        PAIR_CLASS[i][j] = j < i ? PAIR_CLASS[j][i] : pairClass(ELEMENTS[i].symbol, ELEMENTS[j].symbol);
      }
    }
    return PAIR_CLASS;
  }

  function renderStats() {
    const pc = pairClasses();
    const counts = {};
    for (let i = 0; i < pc.length; i += 1) for (let j = i; j < pc.length; j += 1) counts[pc[i][j]] = (counts[pc[i][j]] || 0) + 1;
    const nStable = Object.values(ISOTOPES).reduce((s, l) => s + l.filter((i) => i.stable).length, 0);
    $('#stats').innerHTML = [
      `<span><strong>118</strong> elements</span>`,
      `<span><strong>${NUCLIDE_COUNT.toLocaleString()}</strong> known isotopes (${nStable} stable)</span>`,
      `<span><strong>${COMPOUNDS.length}</strong> tabulated compounds</span>`,
      `<span><strong>${Theory.SETS.filter((x) => x.size > 1).length.toLocaleString()}</strong> combinations computed theoretically (${Theory.ENTRIES.length.toLocaleString()} compounds)</span>`,
      `<span><strong>${Atlas.SUMMARY.combinations.toLocaleString()}</strong> combinations found across PubChem, COD and Alexandria</span>`,
      `<span><strong>7,021</strong> element pairs: <strong>${(counts.data || 0) + (counts.known || 0)}</strong> known experimentally, <strong>${(counts.dft || 0) + (counts['dft-none'] || 0)}</strong> only computed</span>`,
    ].join('');
    return counts;
  }

  /* ---------- combination map ---------- */

  const MAP_CLASSES = [
    ['data', 'Measured ΔH° and S° on this site'],
    ['known', 'Recorded in PubChem or COD'],
    ['dft', 'DFT: compound predicted to form'],
    ['dft-none', 'DFT: computed, no stable compound'],
    ['predicted', 'Predicted compound (estimate)'],
    ['alloy', 'Metal + metal → alloy'],
    ['noble', 'Noble gas → no reaction'],
    ['superheavy', 'Superheavy: no bulk chemistry'],
    ['unknown', 'No reliable prediction'],
    ['same', 'Element with itself'],
  ];

  function renderMap(counts) {
    const css = getComputedStyle(document.documentElement);
    const color = {};
    MAP_CLASSES.forEach(([k]) => { color[k] = css.getPropertyValue(`--m-${k}`).trim(); });
    $('#map-legend').innerHTML = MAP_CLASSES.filter(([k]) => counts[k]).map(([k, l]) => `<span><i style="background:${color[k]}"></i>${l} (${(counts[k] || 0).toLocaleString()})</span>`).join('');

    const cv = $('#map');
    const ctx = cv.getContext('2d');
    const n = ELEMENTS.length;
    const cell = cv.width / n;
    const pc = pairClasses();
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        ctx.fillStyle = color[pc[i][j]];
        ctx.fillRect(j * cell, i * cell, cell, cell);
      }
    }
    // period boundaries
    ctx.strokeStyle = css.getPropertyValue('--text').trim();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    [2, 10, 18, 36, 54, 86].forEach((z) => {
      ctx.beginPath(); ctx.moveTo(z * cell, 0); ctx.lineTo(z * cell, cv.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, z * cell); ctx.lineTo(cv.width, z * cell); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    const tip = $('#map-tip');
    const label = Object.fromEntries(MAP_CLASSES);
    function cellAt(ev) {
      const r = cv.getBoundingClientRect();
      const j = Math.floor(((ev.clientX - r.left) / r.width) * n);
      const i = Math.floor(((ev.clientY - r.top) / r.height) * n);
      return i >= 0 && j >= 0 && i < n && j < n ? [i, j] : null;
    }
    cv.onmousemove = (ev) => {
      const c = cellAt(ev);
      if (!c) { tip.hidden = true; return; }
      const [i, j] = c;
      const a = ELEMENTS[i];
      const b = ELEMENTS[j];
      const cls = pc[i][j];
      const comps = cls === 'data' ? Engine.compoundsFor([a.symbol, b.symbol]).map((x) => x.formula).join(', ') : '';
      const pred = cls === 'predicted' ? Engine.predictBinary(a, b).formula + '?' : '';
      tip.innerHTML = `<b>${a.symbol} + ${b.symbol}</b> · ${a.name} + ${b.name}<br>${label[cls]}${comps ? ': ' + fmtFormula(comps) : ''}${pred ? ': ' + fmtFormula(pred) : ''}`;
      const wr = cv.parentElement.getBoundingClientRect();
      tip.style.left = Math.min(ev.clientX - wr.left + 14, wr.width - 270) + 'px';
      tip.style.top = ev.clientY - wr.top + 14 + 'px';
      tip.hidden = false;
    };
    cv.onmouseleave = () => { tip.hidden = true; };
    cv.onclick = (ev) => {
      const c = cellAt(ev);
      if (!c) return;
      setTray([ELEMENTS[c[0]].symbol, ELEMENTS[c[1]].symbol]);
      showTab('lab');
      renderInfo(ELEMENTS[c[1]].symbol);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  /* ---------- compound table ---------- */

  let ROWS = [];
  const sortState = { key: 'dHf', asc: true };

  function buildRows() {
    ROWS = COMPOUNDS.map((c) => {
      const r = Engine.formationReaction(c);
      const dHf = r.dH / r.perCompound;
      const dSf = r.dS == null ? null : r.dS / r.perCompound;
      return {
        c,
        formula: c.formula,
        name: c.name,
        phase: c.phase,
        dHf,
        dSf,
        dSEst: r.sEstimated,
        dGf: Engine.gibbs(dHf, dSf, Engine.T0),
        elements: Object.keys(Engine.countsOf(c.formula)),
      };
    });
  }

  function renderCompounds() {
    const q = $('#csearch').value.trim().toLowerCase();
    const rows = ROWS.filter((r) => !q || r.formula.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      || r.elements.some((s) => s.toLowerCase() === q || (BY_SYMBOL[s] && BY_SYMBOL[s].name.toLowerCase().includes(q))));
    const { key, asc } = sortState;
    rows.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x == null) return 1;
      if (y == null) return -1;
      const d = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return asc ? d : -d;
    });
    $('#ctbody').innerHTML = rows.map((r) => `
      <tr data-f="${esc(r.formula)}" data-ph="${r.phase}">
        <td>${fmtFormula(r.formula)}</td><td>${esc(r.name)}</td><td>${r.phase}</td>
        <td class="num ${signClass(r.dHf)}">${fmtNum(r.dHf, 2)}</td>
        <td class="num">${fmtNum(r.dSf, 1)}${r.dSEst ? '*' : ''}</td>
        <td class="num ${signClass(r.dGf)}">${fmtNum(r.dGf, 1)}</td>
      </tr>`).join('');
    document.querySelectorAll('.ctable th').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === key);
      th.classList.toggle('asc', th.dataset.sort === key && asc);
    });
  }

  function initCompounds() {
    buildRows();
    $('#csearch').addEventListener('input', renderCompounds);
    document.querySelector('.ctable thead').addEventListener('click', (ev) => {
      const th = ev.target.closest('th[data-sort]');
      if (!th) return;
      sortState.asc = sortState.key === th.dataset.sort ? !sortState.asc : true;
      sortState.key = th.dataset.sort;
      renderCompounds();
    });
    $('#ctbody').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-f]');
      if (!tr) return;
      const row = ROWS.find((r) => r.formula === tr.dataset.f && r.phase === tr.dataset.ph);
      const tokens = row.formula === 'D2O' ? [{ symbol: 'H', isotope: '2' }, 'O'] : row.elements;
      setTray(tokens);
      showTab('lab');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    renderCompounds();
  }

  /* ---------- theory explorer ---------- */

  const STATUS_LABEL = { stable: 'Forms a stable compound', metastable: 'Only metastable compounds', unstable: 'No stable compound' };
  const explorer = { rows: [], shown: 100 };

  function insightsHTML() {
    const sets = Theory.SETS.filter((x) => x.size > 1);
    const bySize = {};
    sets.forEach((x) => {
      const b = (bySize[x.size] = bySize[x.size] || { n: 0, stable: 0 });
      b.n += 1;
      if (x.status === 'stable') b.stable += 1;
    });
    const stable = Theory.ENTRIES.filter((e) => e.fe < 0 && e.ehull <= Theory.STABLE);
    const hypo = stable.filter((e) => !e.known);
    const known = Theory.ENTRIES.filter((e) => e.known);
    const knownOnHull = known.filter((e) => e.ehull <= Theory.STABLE).length;
    const knownNear = known.filter((e) => e.ehull <= Theory.NEAR).length;

    // Validation of DFT ΔHf against the measured values in this site's own database.
    const val = [];
    COMPOUNDS.filter((c) => c.phase === 's' && c.formula !== 'D2O').forEach((c) => {
      const counts = Engine.countsOf(c.formula);
      const atoms = Object.values(counts).reduce((a, b) => a + b, 0);
      const ratio = (cnt) => Object.keys(cnt).sort().map((k) => k + cnt[k] / atoms).join();
      const target = ratio(counts);
      const match = Theory.forSet(Object.keys(counts)).filter((e) => {
        const r = Object.keys(e.counts).sort().map((k) => k + e.counts[k] / e.atoms).join();
        return r === target;
      }).sort((a, b) => a.fe - b.fe)[0];
      if (match) val.push([c.dHf / atoms, match.fe * Theory.EV_TO_KJ]);
    });
    const mae = val.reduce((a, [x, y]) => a + Math.abs(x - y), 0) / val.length;
    const signs = val.filter(([x, y]) => Math.sign(x) === Math.sign(y)).length;

    // Which elements form the most (and fewest) stable compounds?
    const perEl = {};
    stable.forEach((e) => e.elements.forEach((el) => { perEl[el] = (perEl[el] || 0) + 1; }));
    const ranked = Object.entries(perEl).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 10).map(([el, n]) => `${el} (${n.toLocaleString()})`).join(', ');
    const bottom = ranked.slice(-8).reverse().map(([el, n]) => `${el} (${n})`).join(', ');

    // How often do element families combine? (pairs only)
    const fam = {};
    sets.filter((x) => x.size === 2).forEach((x) => {
      const [a, b] = x.elements.map((el) => BY_SYMBOL[el].categoryName).sort();
      const k = a === b ? `${a} + ${a}` : `${a} + ${b}`;
      const f = (fam[k] = fam[k] || { n: 0, s: 0 });
      f.n += 1;
      if (x.status === 'stable') f.s += 1;
    });
    const famRows = Object.entries(fam).filter(([, f]) => f.n >= 15).map(([k, f]) => [k, f.s / f.n, f.n]).sort((a, b) => b[1] - a[1]);
    const famList = (rows) => rows.map(([k, r, n]) => `<li>${esc(k)}: <strong>${Math.round(r * 100)}%</strong> of ${n} pairs</li>`).join('');

    const exo = stable.slice().sort((a, b) => a.fe - b.fe).slice(0, 8)
      .map((e) => `<li>${fmtFormula(e.formula)}: ${fmtNum(e.fe * Theory.EV_TO_KJ, 0)} kJ/mol per atom${e.known ? '' : ' (no experimental record)'}</li>`).join('');
    const newBig = hypo.filter((e) => e.elements.length === 2).sort((a, b) => a.fe - b.fe).slice(0, 8)
      .map((e) => `<li><a href="#" data-open="${e.elements.join('+')}">${fmtFormula(e.formula)}</a> (${e.spg}): ${fmtNum(e.fe * Theory.EV_TO_KJ, 0)} kJ/mol per atom</li>`).join('');

    const sizeRows = Object.keys(bySize).map((k) => `<tr><td>${k}</td><td class="num">${bySize[k].n.toLocaleString()}</td><td class="num">${bySize[k].stable.toLocaleString()}</td><td class="num">${Math.round((100 * bySize[k].stable) / bySize[k].n)}%</td></tr>`).join('');

    return `
      <div class="insights">
        <div class="ins-card">
          <h3>What the calculations predict</h3>
          <table class="mini"><thead><tr><th>Elements</th><th class="num">Combinations computed</th><th class="num">Form a stable compound</th><th class="num">Share</th></tr></thead><tbody>${sizeRows}</tbody></table>
          <p><strong>${stable.length.toLocaleString()}</strong> compounds are predicted thermodynamically stable. <strong>${hypo.length.toLocaleString()}</strong> of them have no experimentally determined structure linked in the dataset. Most of these are genuinely new theoretical predictions; some are known compounds whose record is missing.</p>
        </div>
        <div class="ins-card">
          <h3>How far to trust it</h3>
          <p>Compared with <strong>${val.length}</strong> measured solids in this site's database, the DFT formation enthalpy is off by <strong>${fmtNum(mae, 1)} kJ/mol per atom</strong> on average. It gets the sign (whether the compound forms at all) right in ${signs} of ${val.length} cases.</p>
          <p>Of ${known.length.toLocaleString()} experimentally known compounds, <strong>${Math.round((100 * knownOnHull) / known.length)}%</strong> come out exactly stable and ${Math.round((100 * knownNear) / known.length)}% lie within 0.1 eV/atom of the hull.</p>
          <p class="muted">Errors are largest for transition-metal oxides and halides (e.g. MnO, NiO), a known weakness of this functional. "Stable" means stable against the other compounds in this dataset. A compound can look stable simply because its competitors were never computed, which happens more often for systems of 4 or more elements.</p>
        </div>
        <div class="ins-card">
          <h3>Most compound-forming elements</h3>
          <p>${top}</p>
          <h3>Least</h3>
          <p>${bottom}</p>
        </div>
        <div class="ins-card">
          <h3>Which families combine (pairs)</h3>
          <p class="muted">Share of computed pairs that form at least one stable compound.</p>
          <ul class="tight">${famList(famRows.slice(0, 6))}</ul>
          <p class="muted">Least likely:</p>
          <ul class="tight">${famList(famRows.slice(-5).reverse())}</ul>
        </div>
        <div class="ins-card">
          <h3>Most exothermic stable compounds</h3>
          <ul class="tight">${exo}</ul>
        </div>
        <div class="ins-card">
          <h3>Strongest stable binaries with no experimental record</h3>
          <p class="muted">Predicted stable, with no experimental structure linked. Some are known compounds missing that link; the rest are candidates for synthesis, or DFT artefacts.</p>
          <ul class="tight">${newBig}</ul>
        </div>
      </div>`;
  }

  function atlasOverviewHTML() {
    const S = Atlas.SUMMARY;
    const M = Atlas.MODEL;
    const sizeName = { 2: 'Pairs', 3: 'Triples', 4: '4 elements', 5: '5 elements', 6: '6 elements', 7: '7 elements', 8: '8 or more' };
    const pct = (a, b) => {
      if (!b) return '—';
      const r = (100 * a) / b;
      return r < 0.01 ? '&lt;0.01%' : `${r.toFixed(r < 1 ? 2 : 1)}%`;
    };
    const rows = Object.keys(S.bySize).map((k) => {
      const b = S.bySize[k];
      return `<tr><td>${sizeName[k]}</td><td class="num">${b.possible ? b.possible.toLocaleString() : '—'}</td><td class="num">${b.seen.toLocaleString()}</td>
        <td class="num">${b.known.toLocaleString()} <span class="muted">(${pct(b.known, b.possible)})</span></td><td class="num">${b.computed.toLocaleString()}</td>
        <td class="num">${b.stable.toLocaleString()}</td><td class="num">${b.stableUnknown.toLocaleString()}</td></tr>`;
    }).join('');
    const link = (key) => `<a href="#" data-open="${key.split('-').join('+')}">${key.split('-').join(' + ')}</a>`;
    const newStable = S.newStable.filter((r) => r[0].split('-').length <= 3).slice(0, 12)
      .map(([key, formula, fe]) => `<li>${link(key)}: ${fmtFormula(formula)}, ${fmtNum(fe * Atlas.EV_TO_KJ, 0)} kJ/mol per atom</li>`).join('');
    const promising = M.promising[3].top.slice(0, 12)
      .map(([key, p, fe]) => `<li>${link(key)}: ${Math.round(p * 100)}% chance, ΔH<sub>f</sub> ≈ ${fmtNum(fe * Atlas.EV_TO_KJ, 0)} kJ/mol per atom</li>`).join('');
    const bs = M.metrics.bySize;
    return `
      <div class="table-scroll" style="max-height:none">
        <table class="ctable">
          <thead><tr><th>Combination</th><th class="num">Possible</th><th class="num">In any database</th><th class="num">Known experimentally</th><th class="num">Computed (DFT)</th><th class="num">DFT: stable compound</th><th class="num">Stable, never recorded</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted">"Known experimentally" means at least one PubChem record or COD crystal structure contains exactly these elements. PubChem also holds some unusual or theoretical entries, so a record is not proof that a stable bulk compound exists.</p>
      <div class="insights">
        <div class="ins-card">
          <h3>Theorising the unexplored</h3>
          <p>All pairs among the model's ${M.trained.length} elements have been computed somewhere. Of the triples, <strong>${M.promising[3].unexplored.toLocaleString()}</strong> have never been explored, and the model expects <strong>${M.promising[3].likelyStable}</strong> of them to form a stable compound. Any combination of up to 7 elements can be scored in the reaction lab.</p>
          <p>Accuracy on ${M.metrics.heldOut.toLocaleString()} held-out combinations: AUC ${M.metrics.auc} overall (pairs ${bs[2].auc}, triples ${bs[3].auc}, quadruples ${bs[4].auc}). Lowest formation energy is predicted to within ${fmtNum(M.metrics.feMae * Atlas.EV_TO_KJ, 0)} kJ/mol per atom on average.</p>
          <p class="muted">Not covered: ${M.excluded.join(', ')} (too few training examples), and elements beyond plutonium.</p>
        </div>
        <div class="ins-card">
          <h3>Most promising unexplored triples</h3>
          <p class="muted">No database has computed these. Model estimates.</p>
          <ul class="tight">${promising}</ul>
        </div>
        <div class="ins-card">
          <h3>Stable by DFT, but never recorded</h3>
          <p class="muted">On Alexandria's convex hull, with no PubChem record or COD structure for the element combination. Candidates for synthesis, or DFT artefacts.</p>
          <ul class="tight">${newStable}</ul>
        </div>
        <div class="ins-card">
          <h3>Sources</h3>
          <ul class="tight">
            <li>PubChem: ${S.sources.pubchem.compounds.toLocaleString()} compounds, ${S.sources.pubchem.sets.toLocaleString()} element combinations</li>
            <li>COD: ${S.sources.cod.structures.toLocaleString()} structures, ${S.sources.cod.sets.toLocaleString()} combinations</li>
            <li>Alexandria: ${S.sources.alexandria.entries.toLocaleString()} calculations, ${S.sources.alexandria.stable.toLocaleString()} stable compounds, ${S.sources.alexandria.sets.toLocaleString()} combinations</li>
            <li>JARVIS-DFT: ${Theory.ENTRIES.length.toLocaleString()} compounds, ${Theory.SETS.length.toLocaleString()} combinations</li>
          </ul>
        </div>
      </div>`;
  }

  function filterExplorer() {
    const raw = $('#x-elements').value.trim();
    const want = raw ? raw.split(/[\s,+\-]+/).filter(Boolean).map((t) => t[0].toUpperCase() + t.slice(1).toLowerCase()) : [];
    const size = $('#x-size').value;
    const status = $('#x-status').value;
    const onlyNew = $('#x-new').checked;
    const sort = $('#x-sort').value;
    let rows = Theory.SETS.filter((x) => x.size > 1
      && (!size || String(x.size) === size || (size === '5' && x.size >= 5))
      && (!status || x.status === status)
      && (!onlyNew || x.hypothetical > 0)
      && want.every((el) => x.elements.includes(el)));
    const sorters = {
      energy: (a, b) => a.best.fe - b.best.fe,
      compounds: (a, b) => b.compounds - a.compounds,
      stable: (a, b) => b.stable - a.stable || a.best.fe - b.best.fe,
      hypothetical: (a, b) => b.hypothetical - a.hypothetical || a.best.fe - b.best.fe,
      alpha: (a, b) => a.key.localeCompare(b.key),
    };
    rows = rows.sort(sorters[sort]);
    explorer.rows = rows;
    explorer.shown = 100;
    renderExplorerRows();
  }

  function renderExplorerRows() {
    const rows = explorer.rows;
    $('#x-count').textContent = `${rows.length.toLocaleString()} combination${rows.length === 1 ? '' : 's'}`;
    $('#x-body').innerHTML = rows.slice(0, explorer.shown).map((x) => `
      <tr data-set="${x.elements.join('+')}">
        <td><strong>${x.elements.join(' + ')}</strong></td>
        <td class="num">${x.compounds}</td>
        <td class="num">${x.stable}${x.hypothetical ? ` <span class="muted" title="stable, no experimental record">(${x.hypothetical} unrecorded)</span>` : ''}</td>
        <td>${fmtFormula(x.best.formula)} <span class="muted">${esc(x.best.spg)}</span></td>
        <td class="num ${signClass(x.best.fe)}">${fmtNum(x.best.fe * Theory.EV_TO_KJ, 1)}</td>
        <td class="num">${x.best.ehull.toFixed(3)}</td>
        <td><span class="badge st-${x.status === 'stable' ? 'stable' : x.status === 'metastable' ? 'meta' : 'unstable'}">${STATUS_LABEL[x.status]}</span></td>
      </tr>`).join('');
    $('#x-more').hidden = rows.length <= explorer.shown;
  }

  function openSet(tokens) {
    setTray(tokens.split('+'));
    showTab('lab');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initExplorer() {
    let built = false;
    document.querySelector('[data-tab="theory"]').addEventListener('click', () => {
      if (built) return;
      built = true;
      $('#atlas-overview').innerHTML = atlasOverviewHTML();
      $('#insights').innerHTML = insightsHTML();
      filterExplorer();
    });
    ['#x-elements', '#x-size', '#x-status', '#x-new', '#x-sort'].forEach((id) => $(id).addEventListener('input', filterExplorer));
    $('#x-more').addEventListener('click', () => { explorer.shown += 200; renderExplorerRows(); });
    $('#x-body').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-set]');
      if (tr) openSet(tr.dataset.set);
    });
    $('#atlas-overview').addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-open]');
      if (!a) return;
      ev.preventDefault();
      openSet(a.dataset.open);
    });
    $('#insights').addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-open]');
      if (!a) return;
      ev.preventDefault();
      openSet(a.dataset.open);
    });
  }

  /* ---------- tabs ---------- */

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      const on = p.id === 'tab-' + name;
      p.hidden = !on;
      p.classList.toggle('active', on);
    });
  }

  /* ---------- init ---------- */

  function init() {
    renderLegend();
    renderTable();
    renderExamples();
    const counts = renderStats();
    renderMap(counts);
    initCompounds();
    initExplorer();

    document.querySelector('.tabs').addEventListener('click', (ev) => {
      const t = ev.target.closest('.tab');
      if (!t) return;
      showTab(t.dataset.tab);
      if (document.documentElement.classList.contains('standalone')) window.scrollTo(0, 0);
    });
    $('#search').addEventListener('input', (ev) => applySearch(ev.target.value));
    $('#search').addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const first = document.querySelector('.el[data-sym]:not(.dim)');
      if (first && ev.target.value.trim()) { addToTray(first.dataset.sym); renderInfo(first.dataset.sym); }
    });
    $('#clear').addEventListener('click', () => setTray([]));
    $('#element-info').addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-iso-toggle]')) return;
      state.allIsotopes = !state.allIsotopes;
      renderInfo(state.infoSym);
    });
    $('#tray').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-rm]');
      if (!b) return;
      state.tray.splice(Number(b.dataset.rm), 1);
      update();
    });
    $('#tray').addEventListener('change', (ev) => {
      const s = ev.target.closest('[data-iso]');
      if (!s) return;
      state.tray[Number(s.dataset.iso)].isotope = s.value || null;
      update();
    });
    const temp = $('#temp');
    temp.addEventListener('input', () => {
      state.T = Number(temp.value);
      $('#temp-val').textContent = `${state.T} K (${(state.T - 273.15).toFixed(0)} °C)`;
      renderResults();
    });
    $('#temp-val').textContent = `${state.T} K (${(state.T - 273.15).toFixed(0)} °C)`;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderMap(counts));

    readHash();
    if (!state.tray.length) state.tray = [{ symbol: 'H', isotope: null }, { symbol: 'O', isotope: null }];
    update();
    renderInfo(state.tray[0].symbol);
  }

  /* ---------- installable app (PWA) ---------- */

  function initInstall() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {}); // refused inside some embeds; the page works without it
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (standalone) {
      document.documentElement.classList.add('standalone'); // switches on the bottom tab bar
      return;
    }
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (ev) => {
      ev.preventDefault();
      deferred = ev;
      $('#install').hidden = false;
    });
    $('#install').addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      $('#install').hidden = true;
    });
    window.addEventListener('appinstalled', () => { $('#install').hidden = true; });
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let dismissed = false;
    try { dismissed = localStorage.getItem('install-ios-dismissed') === '1'; } catch (e) { /* storage blocked */ }
    if (ios && /^https?:$/.test(location.protocol) && !dismissed) $('#install-ios').hidden = false;
    $('#install-ios-close').addEventListener('click', () => {
      $('#install-ios').hidden = true;
      try { localStorage.setItem('install-ios-dismissed', '1'); } catch (e) { /* storage blocked */ }
    });
  }

  init();
  initInstall();
})();
