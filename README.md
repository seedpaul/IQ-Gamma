# CHC CAT IQ (Client-side Demo Framework)

This project is a **client-side**, **GitHub Pages–compatible** JavaScript application implementing a **multi-domain CHC CAT** framework. v0.2 expands the item bank and adds additional item families/blocks, but remains non-clinical without real calibration + norms:

- Gf — Fluid Reasoning
- Gc — Controlled Verbal / Crystallized Reasoning (low vocabulary dependence)
- Gv — Visual–Spatial Processing
- Gq — Quantitative Reasoning (non-curricular)
- Gwm — Working Memory
- Gs — Processing Speed

## Critical disclaimer

This app is a **research/demo framework** and is **not** a clinical test. It does **not** replicate WAIS, Stanford–Binet, or Raven items. The included “norms” are **demo transforms** (standard normal mapping with light age adjustments) and are **not** valid norms.

To make results defensible, you must:
1. Build large calibrated item banks (typically **250–800+ items per domain**)
2. Collect large-scale norms (**N ≥ 50,000**) with stratified sampling
3. Run IRT calibration, DIF analyses, measurement invariance tests
4. Validate against external criteria and test–retest reliability

## What is implemented

### CAT engine (per subtest)
- IRT models: **2PL** (and scaffold for 3PL)
- Bayesian updating: **EAP** estimation on a theta grid
- Dynamic item selection: maximize Fisher information + content balancing + exposure control (local-only)
- Termination: stop when **SEM** < threshold (and min/max item guards)

### Subtests
- Gf: nonverbal “analogy panels” (rule induction)
- Gv: mental rotation (symbolic)
- Gq: number pattern induction (symbolic)
- Gc: minimal-lexicon logical inference (Entails / Contradicts / Not determined)
- Gwm: timed **n-back block** (block scored -> binary mapping for demo)
- Gs: timed **symbol search block** (block scored -> binary mapping for demo)

### Integrity (lightweight)
- Detects visibility changes (tab switching / backgrounding)
- Detects rapid guessing on MC items

## Run locally

Because the app loads JSON via `fetch`, you should run a local web server:

### Option A: Python
```bash
python -m http.server 8000
```
Open `http://localhost:8000`

### Option B: Node (http-server)
```bash
npx http-server -p 8000
```

## Deploy to GitHub Pages

1. Create a new GitHub repo
2. Upload these files
3. Enable **Settings → Pages → Deploy from branch**
4. Select the branch and root folder

## Expanding the item bank

Edit:
- `js/data/itembank.json`

Each item includes:
- `domain`, `family`
- IRT parameters `a`, `b` (and optional `c` for 3PL)
- a `stem` object describing how to render it
- `options` and `key` (for MC items)
- block items store parameters and are scored from performance summary

## Replace demo norms

Replace the placeholder age adjustment and theta-to-index transform in:
- `js/engine/norms.js`
- `js/engine/scoring.js`

In a real instrument, norms should be produced from your calibrated sample using continuous norming.

---

© You. Use responsibly.


## v0.3 "Pro" expansions (still non-clinical)

This release adds **field-test / norming instrumentation** to move from “demo CAT engine” toward a **calibration-ready platform**:

- **Modes**: Standard / Field-test (no scores) / Norming (scores + export)
- **Session logging** (local, anonymized): item-level responses, RTs, theta/SEM trajectory, integrity flags, device metadata
- **Exports**:
  - Full session bundle: JSON
  - Event stream: JSONL (NDJSON) for analysis pipelines
- **Integrity monitoring**: visibility changes, focus loss, paste/copy/context menu, fullscreen exits, rapid responding

To approach WAIS/SB-level defensibility without infringement, you must still perform:
1) item writing/review + large field testing
2) IRT calibration (2PL/3PL) and equating across forms/devices/languages
3) stratified continuous norming + DIF + invariance
4) test–retest + convergent/criterion validation


## v0.4 "Equating + DIF" expansions

This release adds **multi-form support** and **DIF/equating hooks** to support large-scale field testing:

- **Offline form assignment** (A/B/C) with **shared anchor items** per CHC domain
- **Form-constrained CAT pools** (CAT draws items only from the assigned form + applies local exclusions)
- **Calibration exports**
  - Session JSON + JSONL events (v0.3)
  - **Long-format CSV** suitable for IRT pipelines (R mirt/TAM; Python)
- **DIF explorer (MH screening)**
  - Choose grouping variable (Group A/B/C), reference vs focal levels, and domain
  - Produces ETS ΔMH and flags (small/moderate/large)
  - One-click **local item exclusion** for suspected DIF items (browser-local)

Important: DIF/equating here are **instrumentation + screening**, not final psychometric conclusions. Confirm DIF with larger samples + logistic/IRT DIF methods, and perform proper equating.


## v0.5 "Anchor-balanced routing + equating mini-block + IRT templates"

Additions:
- **Anchor-balanced adaptive routing per form**
  - CAT maintains a target anchor proportion with bounds (min/max anchors)
  - Optional "avoid anchors in first 2 items" to reduce warm-start artifacts
- **Automatic anchor-only mini-blocks**
  - Each CHC domain begins with a short anchor-only block (default 3 items; 2 for speed/memory)
  - Improves link stability for multi-form equating designs
- **IRT export templates**
  - Export an “IRT package” containing:
    - persons.csv, items.csv, responses_long.csv
    - mirt_template.R and tam_template.R scaffolding
    - manifest.json (schema + notes)

These features are scaffolding for real calibration/equating; you still must run large field tests, verify dimensionality/local dependence, and validate with DIF/IRT methods beyond screening.
