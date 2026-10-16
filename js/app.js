/* UI for the Element Combinator. Depends on elements.js, isotopes.js, thermo.js, engine.js. */
(function () {
  const MAX_TRAY = 4;
  const state = { tray: [], T: 298 };
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
    const isos = ISOTOPES[sym] || [];
    const ox = e.ox.length ? e.ox.map((o) => (o > 0 ? '+' + o : String(o).replace('-', '−'))).join(', ') : '—';
    const stateName = { s: 'solid', l: 'liquid', g: 'gas' }[e.state] + (e.statePredicted ? ' (predicted)' : '');
    const rows = isos.map((i) => `
      <tr><td>${isoSup(i.A)}${e.symbol}</td>
      <td class="num">${i.abundance != null ? i.abundance + ' %' : '—'}</td>
      <td>${i.halfLife ? `<span class="pill radio">t½ ${esc(i.halfLife)}</span>` : '<span class="pill">stable</span>'}</td></tr>`).join('');
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
      <table class="iso-table">
        <thead><tr><th>Isotope</th><th>Natural abundance</th><th>Stability</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
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
      const opts = (ISOTOPES[s.symbol] || []).map((iso) => {
        const lbl = `${isoSup(iso.A)}${e.symbol}${iso.abundance != null ? ` (${iso.abundance}%)` : iso.halfLife ? ` (t½ ${iso.halfLife})` : ''}`;
        return `<option value="${iso.A}" ${s.isotope === iso.A ? 'selected' : ''}>${esc(lbl)}</option>`;
      }).join('');
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
  };

  function reactionHTML(r, T) {
    const [qc, ql] = QUALITY[r.quality] || QUALITY.estimated;
    const G = r.kind === 'nuclear' ? r.dH : Engine.gibbs(r.dH, r.dS, T);
    const hEst = r.hEstimated ? '<div class="est">estimate</div>' : '';
    const sEst = r.sEstimated || (r.quality === 'estimated' && r.dS != null) ? '<div class="est">estimate</div>' : '';
    const dSText = r.kind === 'nuclear' ? 'n/a' : fmtNum(r.dS, 1);
    const dHText = r.dH == null ? 'not tabulated' : fmtNum(r.dH, 1);
    let perMol = '';
    if (r.kind === 'formation' && r.perCompound > 1 && r.dH != null) {
      perMol = `<div class="per-mol">Values are per mole of reaction as written. Per mole of ${fmtFormula(r.formula)}: ΔH<sub>f</sub>° = ${fmtNum(r.dH / r.perCompound, 1)} kJ/mol${r.dS != null ? `, ΔS<sub>f</sub>° = ${fmtNum(r.dS / r.perCompound, 1)} J/(mol·K)` : ''}.</div>`;
    }
    return `
      <article class="rx">
        <div class="rx-top"><div class="rx-name">${esc(r.name)}</div><span class="badge ${qc}">${ql}</span></div>
        <div class="eq">${equationHTML(r)}</div>
        <div class="thermo">
          <div><div class="lbl">ΔH°</div><div class="val ${signClass(r.dH)}">${dHText}</div><div class="unit">kJ</div>${hEst}</div>
          <div><div class="lbl">ΔS°</div><div class="val">${dSText}</div><div class="unit">J/K</div>${sEst}</div>
          <div><div class="lbl">ΔG at ${Math.round(T)} K</div><div class="val ${signClass(G)}">${fmtNum(G, 1)}</div><div class="unit">kJ${r.kind === 'nuclear' ? ' (≈ ΔH)' : ''}</div></div>
        </div>
        <p class="verdict">${verdict(r, T)}</p>
        ${perMol}
        ${r.note ? `<p class="rx-note">${esc(r.note)}</p>` : ''}
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
    if (state.tray.length === 1) {
      html += '<p class="hint">Add another element to see what they form together, or click the same element again to react it with itself.</p>';
    }
    out.innerHTML = html;
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
  function pairClasses() {
    if (PAIR_CLASS) return PAIR_CLASS;
    const n = ELEMENTS.length;
    PAIR_CLASS = [];
    for (let i = 0; i < n; i += 1) {
      PAIR_CLASS[i] = [];
      for (let j = 0; j < n; j += 1) {
        PAIR_CLASS[i][j] = j < i ? PAIR_CLASS[j][i] : Engine.classifyPair(ELEMENTS[i].symbol, ELEMENTS[j].symbol);
      }
    }
    return PAIR_CLASS;
  }

  function renderStats() {
    const pc = pairClasses();
    const counts = {};
    for (let i = 0; i < pc.length; i += 1) for (let j = i; j < pc.length; j += 1) counts[pc[i][j]] = (counts[pc[i][j]] || 0) + 1;
    const nIso = Object.values(ISOTOPES).reduce((s, l) => s + l.length, 0);
    const nStable = Object.values(ISOTOPES).reduce((s, l) => s + l.filter((i) => i.stable).length, 0);
    $('#stats').innerHTML = [
      `<span><strong>118</strong> elements</span>`,
      `<span><strong>${nIso}</strong> isotopes listed (${nStable} stable)</span>`,
      `<span><strong>${COMPOUNDS.length}</strong> tabulated compounds</span>`,
      `<span><strong>7,021</strong> element pairs: <strong>${counts.data}</strong> with data, <strong>${counts.predicted}</strong> predicted, <strong>${counts.alloy}</strong> metal–metal, <strong>${counts.noble}</strong> noble-gas</span>`,
    ].join('');
    return counts;
  }

  /* ---------- combination map ---------- */

  const MAP_CLASSES = [
    ['data', 'Tabulated compound(s)'],
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

    document.querySelector('.tabs').addEventListener('click', (ev) => {
      const t = ev.target.closest('.tab');
      if (t) showTab(t.dataset.tab);
    });
    $('#search').addEventListener('input', (ev) => applySearch(ev.target.value));
    $('#search').addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const first = document.querySelector('.el[data-sym]:not(.dim)');
      if (first && ev.target.value.trim()) { addToTray(first.dataset.sym); renderInfo(first.dataset.sym); }
    });
    $('#clear').addEventListener('click', () => setTray([]));
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

  init();
})();
