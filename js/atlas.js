/*
 * The combination atlas: what every database says about a set of elements, plus the model's
 * prediction where none has explored it.
 *
 * Records come from js/atlas/bNN.js (built by scripts/atlas/build_atlas.py), loaded on demand.
 * A record's chunk is FNV-1a(key) % 64, where key = sorted symbols joined by "-".
 * The model (js/model.js, scripts/atlas/train_model.py) is evaluated here in the browser.
 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const MODEL = isNode ? require('./model.js').ATLAS_MODEL : root.ATLAS_MODEL;
  const SUMMARY = isNode ? require('./atlas-summary.js').ATLAS_SUMMARY : root.ATLAS_SUMMARY;
  const BUCKETS = 64;
  const EV_TO_KJ = 96.485332;

  const chunks = {};
  const waiting = {};

  const keyOf = (symbols) => [...new Set(symbols)].sort().join('-');

  function fnv1a(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i); // keys are ASCII
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  const bucketOf = (key) => fnv1a(key) % BUCKETS;

  /** Called by each chunk file. */
  function loaded(i, text) {
    const map = new Map();
    text.split('\n').forEach((line) => { map.set(line.slice(0, line.indexOf('|')), line); });
    chunks[i] = map;
    (waiting[i] || []).forEach((w) => w.resolve(map));
    delete waiting[i];
  }

  function loadChunk(i) {
    if (chunks[i]) return Promise.resolve(chunks[i]);
    if (isNode) {
      global.Atlas = api;
      require(`./atlas/b${String(i).padStart(2, '0')}.js`);
      return Promise.resolve(chunks[i]);
    }
    return new Promise((resolve, reject) => {
      if (waiting[i]) { waiting[i].push({ resolve, reject }); return; }
      waiting[i] = [{ resolve, reject }];
      const s = document.createElement('script');
      s.src = `js/atlas/b${String(i).padStart(2, '0')}.js`;
      s.async = true;
      s.onerror = () => {
        (waiting[i] || []).forEach((w) => w.reject(new Error('Could not load the database atlas. Check your connection and try again.')));
        delete waiting[i];
        s.remove();
      };
      document.head.appendChild(s);
    });
  }

  function parseRows(text) {
    return text ? text.split(',').map((r) => {
      const [formula, fe, ehull, spg, gap, id] = r.split('^');
      return { formula, fe: Number(fe), ehull: Number(ehull), spg: Number(spg), gap: Number(gap), id: /^\d+$/.test(id) ? 'agm' + id : id };
    }) : [];
  }

  function parse(line) {
    const [key, p, c, a] = line.split('|');
    const rec = { key, elements: key.split('-'), pubchem: null, cod: null, alexandria: null };
    if (p) {
      const [count, cid, ...f] = p.split('~');
      rec.pubchem = { count: Number(count), cid: Number(cid), formula: f.join('~') };
    }
    if (c) {
      const [count, ...f] = c.split('~');
      rec.cod = { count: Number(count), formula: f.join('~') };
    }
    if (a) {
      const [n, stable, rows] = a.split('~');
      rec.alexandria = { computed: Number(n), stable: Number(stable), rows: parseRows(rows) };
    }
    return rec;
  }

  /** Resolves to the record for exactly this element set, or null if no database has it. */
  async function lookup(symbols) {
    const key = keyOf(symbols);
    const map = await loadChunk(bucketOf(key));
    const line = map.get(key);
    return line ? parse(line) : null;
  }

  /* ---------- the model ---------- */

  function featuresOf(symbols) {
    // Must match features() in scripts/atlas/train_model.py.
    const P = MODEL.props.length;
    const rows = symbols.map((s) => MODEL.elements[s].map((v) => (v == null ? NaN : v)));
    const mean = []; const lo = []; const hi = []; const range = [];
    for (let j = 0; j < P; j += 1) {
      const vals = rows.map((r) => r[j]).filter((v) => !Number.isNaN(v));
      if (!vals.length) { mean.push(NaN); lo.push(NaN); hi.push(NaN); range.push(NaN); continue; }
      const mn = Math.min(...vals); const mx = Math.max(...vals);
      mean.push(vals.reduce((a, b) => a + b, 0) / vals.length);
      lo.push(mn); hi.push(mx); range.push(mx - mn);
    }
    return [...mean, ...lo, ...hi, ...range, symbols.length];
  }

  function rawScore(m, x) {
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

  /**
   * Model estimate for any 2-7 element set inside its domain:
   * { probability (has a stable compound), fe (lowest formation energy, eV/atom), mae }, or
   * { outside: [symbols] } when an element is outside what the model was trained on.
   */
  function predict(symbols) {
    const syms = [...new Set(symbols)];
    const outside = syms.filter((s) => !MODEL.trained.includes(s));
    if (outside.length) return { outside };
    const x = featuresOf(syms);
    const probability = 1 / (1 + Math.exp(-rawScore(MODEL.classifier, x)));
    const fe = rawScore(MODEL.regressor, x);
    const bySize = MODEL.metrics.bySize[Math.min(syms.length, 4)];
    return { probability, fe, feKj: fe * EV_TO_KJ, mae: bySize ? bySize.feMae : MODEL.metrics.feMae, extrapolated: syms.length > 4 };
  }

  /** Pair index from the summary, available without loading chunks (used by the map). */
  const PAIRS = {};
  if (SUMMARY) {
    SUMMARY.pairs.split('\n').forEach((line) => {
      const [k, p, c, a, s] = line.split('|');
      PAIRS[k] = { pubchem: Number(p), cod: Number(c), computed: Number(a), stable: Number(s) };
    });
  }

  const api = { lookup, predict, featuresOf, keyOf, bucketOf, loaded, PAIRS, MODEL, SUMMARY, EV_TO_KJ };
  if (isNode) module.exports = api;
  else root.Atlas = api;
})(this);
