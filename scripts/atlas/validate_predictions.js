#!/usr/bin/env node
/*
 * Check the "any combination" predictions through the same code the browser runs (js/predict.js).
 *
 * Uses the model trained WITHOUT the held-out element combinations (data/cache/composition-model-holdout.json,
 * written by train_composition_model.py) on held-out pairs and triples, and compares with Alexandria:
 *   - does a stable compound of exactly these elements exist?  (Alexandria convex hull)
 *   - is the predicted formula one of Alexandria's stable formulas (lowest three listed in the atlas)?
 *   - how far is the predicted best formation energy from Alexandria's?
 * The results are stored in js/composition-model.js under metrics.systems and shown on the site.
 * Run:  node scripts/atlas/validate_predictions.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const Predict = require(path.join(ROOT, 'js', 'predict.js'));
const Atlas = require(path.join(ROOT, 'js', 'atlas.js'));
const { ELEMENTS } = require(path.join(ROOT, 'js', 'elements.js'));

const hold = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache', 'composition-model-holdout.json'), 'utf8'));
Predict.modelLoaded(hold);

const isHeldOut = (key) => zlib.crc32(Buffer.from(key)) % 100 < 15; // same split as the training script
const ratioKey = (formula) => {
  const c = {};
  formula.replace(/([A-Z][a-z]?)(\d*)/g, (_, el, n) => { c[el] = (c[el] || 0) + (n ? Number(n) : 1); });
  const t = Object.values(c).reduce((a, b) => a + b, 0);
  return Object.keys(c).sort().map((k) => `${k}${(c[k] / t).toFixed(4)}`).join('');
};

(async () => {
  const domain = new Set(hold.trained);
  const syms = ELEMENTS.map((e) => e.symbol).filter((s) => domain.has(s));
  const results = { 2: [], 3: [] };
  for (const n of [2, 3]) {
    const sets = [];
    for (let i = 0; i < syms.length; i += 1) {
      for (let j = i + 1; j < syms.length; j += 1) {
        if (n === 2) { sets.push([syms[i], syms[j]]); continue; }
        for (let k = j + 1; k < syms.length; k += 1) sets.push([syms[i], syms[j], syms[k]]);
      }
    }
    const held = sets.map((s) => s.slice().sort()).filter((s) => isHeldOut(s.join('-')));
    held.sort((a, b) => zlib.crc32(Buffer.from(a.join('-'))) - zlib.crc32(Buffer.from(b.join('-'))));
    for (const s of held.slice(0, n === 2 ? 2000 : 3000)) {
      const rec = await Atlas.lookup(s);
      if (!rec || !rec.alexandria) continue; // Alexandria never computed it: no truth to compare with
      const truthForms = rec.alexandria.stable > 0;
      const p = Predict.predictSet(s);
      const truthKeys = rec.alexandria.stable ? rec.alexandria.rows.map((r) => ratioKey(r.formula)) : [];
      results[n].push({
        truthForms,
        predForms: p.forms,
        top1: p.forms && truthForms ? truthKeys.includes(ratioKey(p.products[0].key)) : null,
        anyHit: p.forms && truthForms ? p.products.some((x) => truthKeys.includes(ratioKey(x.key))) : null,
        feErr: p.forms && truthForms ? Math.abs(p.products[0].fe - rec.alexandria.rows[0].fe) : null,
      });
    }
  }
  const systems = {};
  for (const n of [2, 3]) {
    const r = results[n];
    const both = r.filter((x) => x.top1 !== null);
    const share = r.filter((x) => x.truthForms).length / r.length;
    systems[n] = {
      n: r.length,
      formsAgreement: +(r.filter((x) => x.truthForms === x.predForms).length / r.length).toFixed(3),
      baselineAgreement: +Math.max(share, 1 - share).toFixed(3),
      recall: +(r.filter((x) => x.truthForms && x.predForms).length / Math.max(1, r.filter((x) => x.truthForms).length)).toFixed(3),
      precision: +(r.filter((x) => x.truthForms && x.predForms).length / Math.max(1, r.filter((x) => x.predForms).length)).toFixed(3),
      formulaTop1: +(both.filter((x) => x.top1).length / Math.max(1, both.length)).toFixed(3),
      formulaAny: +(both.filter((x) => x.anyHit).length / Math.max(1, both.length)).toFixed(3),
      bestEnergyMae: +(both.reduce((a, x) => a + x.feErr, 0) / Math.max(1, both.length)).toFixed(3),
    };
  }
  console.log(JSON.stringify(systems, null, 1));
  const file = path.join(ROOT, 'js', 'composition-model.js');
  let src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('var COMPOSITION_MODEL = ') + 'var COMPOSITION_MODEL = '.length;
  const end = src.indexOf(';\nif (typeof Predict');
  const model = JSON.parse(src.slice(start, end));
  model.metrics.systems = systems;
  src = src.slice(0, start) + JSON.stringify(model) + src.slice(end);
  fs.writeFileSync(file, src);
  console.log('stored in js/composition-model.js');
})();
