# Calculation server

Calculates what forms from any 2–4 elements in about a minute, so the website can answer
combinations no database has explored. **It is an approximation of quantum mechanics, not a
measurement:** it uses MACE-MP-0, a machine-learned interatomic potential trained on ~1.6 million
DFT calculations (Batatia et al., arXiv:2401.00096; model weights from the `mace-torch` package).

How a request is answered (`pipeline.py`):
1. Candidate formulas: charge-balanced with common oxidation states, or simple ratios for metals.
2. Trial structures: the most common real structure types for that composition pattern among
   Alexandria's 116,712 stable compounds (`prototypes.json`, built by `build_prototypes.py`), with
   the new elements substituted in; random symmetric crystals only for patterns with no known type.
3. Every structure is relaxed (atoms and cell). Collapsed or unphysical results are rejected.
4. A convex hull against the pure elements and the compounds of every smaller subset decides what
   is stable. Element and formula results are cached in `cache/` and reused.

Accuracy against measurements and DFT: see `validation.json` (written by `validate.py`).

## Run it

```sh
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000      # from this directory
```

Then open the site, choose **Calculate it now**, and enter the server address
(for example `http://localhost:8000`). The site remembers it.

## Deploy it (free option: a Hugging Face Docker Space)

1. Create a Space at https://huggingface.co/new-space with SDK **Docker** (the free CPU tier has 2 vCPUs).
2. Push this repository to it; the Space builds `server/Dockerfile` (set `Dockerfile path` to
   `server/Dockerfile`, or copy it to the repository root).
3. Put the Space's URL (`https://<user>-<space>.hf.space`) into `js/config.js` as `CALC_SERVER`,
   so every visitor of the site uses it.

Speed scales with cores: a pair takes 5–75 s on 4 cores the first time, a triple a few minutes
(it also calculates the three pairs), and anything already calculated returns instantly.
