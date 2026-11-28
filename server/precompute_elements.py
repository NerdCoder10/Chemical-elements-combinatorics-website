#!/usr/bin/env python3
"""Compute and cache the reference energy of every element the potential supports (server/cache/el_*.json)."""
import sys
import time
from multiprocessing import get_context

sys.path.insert(0, '.')
import pipeline  # noqa: E402

pipeline.calculator()
pool = get_context('fork').Pool(pipeline.WORKERS)
done = 0
for sym, e in sorted(pipeline.ELS.items(), key=lambda kv: kv[1]['Z']):
    if e['Z'] not in pipeline.supported():
        continue
    t = time.time()
    try:
        r = pipeline.element_reference(sym, pool)
        done += 1
        print(f"{sym}: {r['energy_per_atom']:.4f} eV/atom ({r['form']}) {time.time() - t:.0f}s", flush=True)
    except Exception as ex:
        print(f'{sym}: FAILED {ex}', flush=True)
print('elements cached:', done)
