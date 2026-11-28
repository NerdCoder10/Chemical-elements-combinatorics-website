"""Calculation server for the Element Combinator site.

POST /calculate  {"elements": ["Gd", "Fe", "S"]}  -> what forms, calculated with the MACE-MP-0 potential
GET  /result?elements=Gd-Fe-S                       -> cached result only (instant), or status not_calculated
GET  /health                                         -> status, supported elements, cache size
Jobs run one at a time across all CPU cores; finished results are cached on disk and reused.
Run locally:  uvicorn app:app --host 0.0.0.0 --port 8000   (from this directory)
"""
import asyncio
import os
import time
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import get_context

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import pipeline

app = FastAPI(title='Element Combinator calculation server')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['GET', 'POST'], allow_headers=['*'])

pipeline.calculator()  # load the model once, before forking the workers
POOL = get_context('fork').Pool(pipeline.WORKERS)
EXECUTOR = ThreadPoolExecutor(max_workers=1)
LOCK = asyncio.Lock()
STATE = {'running': None, 'queued': 0, 'started': None}


class Request(BaseModel):
    elements: list[str]


def _clean(elements):
    syms = sorted({e.strip() for e in elements if e.strip()})
    unknown = [s for s in syms if s not in pipeline.ELS]
    if unknown:
        raise HTTPException(400, f'Unknown element symbol: {", ".join(unknown)}')
    if not 2 <= len(syms) <= 4:
        raise HTTPException(400, 'Choose 2 to 4 different elements.')
    return syms


@app.get('/health')
def health():
    covered = pipeline.supported()
    return {'ok': True, 'workers': pipeline.WORKERS, 'running': STATE['running'], 'queued': STATE['queued'],
            'supported': sorted((s for s, e in pipeline.ELS.items() if e['Z'] in covered), key=lambda s: pipeline.ELS[s]['Z']),
            'cached_results': len([f for f in os.listdir(pipeline.CACHE) if f.startswith('set_')]) if os.path.isdir(pipeline.CACHE) else 0}


@app.get('/result')
def result(elements: str):
    syms = _clean(elements.split('-'))
    hit = pipeline._cached(f"set_{'-'.join(syms)}.json")
    return hit if hit else {'elements': syms, 'status': 'not_calculated'}


@app.post('/calculate')
async def calculate(req: Request):
    syms = _clean(req.elements)
    hit = pipeline._cached(f"set_{'-'.join(syms)}.json")
    if hit:
        return {**hit, 'cached': True}
    STATE['queued'] += 1
    async with LOCK:
        STATE['queued'] -= 1
        STATE['running'], STATE['started'] = '-'.join(syms), time.time()
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(EXECUTOR, pipeline.calculate, syms, POOL)
        except ValueError as e:
            raise HTTPException(400, str(e))
        finally:
            STATE['running'] = None
