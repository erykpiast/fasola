# Improve EN title model accuracy from 52% to ~90%

## Context

The EN title extraction model (bert-base-cased, frozen layers 0-9) achieves 52.2% combined accuracy (63.9% real, 51.3% generated). Analysis of 819 failures reveals **three distinct problem categories**, each with a different fix:

| Category | Count | % of total | Root cause |
|---|---|---|---|
| Garbage (≤3 chars) | 329 | 19.2% | Model predicts random fragment — not enough training signal |
| Wrong span | 227 | 13.3% | Model picks the wrong text span entirely |
| Matching bug | 122 | 7.1% | **Model is correct** but eval matching has a double-space bug |
| OCR typos / trailing junk | 114 | 6.7% | Model is ~correct but extra tokens or OCR artifacts |
| Partial / truncated | 22 | 1.3% | Model finds part of the title |
| Multi-title pages | 5 | 0.3% | Multiple titles expected on one page |

## Improvement plan (3 tiers)

### Tier 1: Fix eval matching (free — +7% accuracy)

**Problem:** `titles_match()` in `eval_model.py` and `train_title_model.py` normalizes spaces BEFORE replacing hyphens, so `"Dry - braised"` → `"DRY   BRAISED"` (triple space) ≠ `"DRY BRAISED"`. Also doesn't strip quotes, parens, or trailing short junk.

**Fix:** Add a second `re.sub(r"\s+", " ", ...)` AFTER the hyphen/underscore replacement. Also strip `"`, `'`, `(`, `)` from both sides before comparison.

**Impact:** 122 failures become passes → **52.2% → 59.3%** with zero model changes.

**Files:**
- `tools/title-loop/eval_model.py` — `titles_match()`
- `tools/title-loop/train_title_model.py` — `titles_match()`

### Tier 2: Improve training data quality (+10-15% estimated)

**Problem:** 329 garbage outputs (1-3 char predictions) and 227 wrong-span predictions indicate the model doesn't have enough diverse training examples to generalize. Currently: 1,395 train examples (85 real, 1,310 generated) covering 186 unique titles.

**Fixes:**

#### 2a. Data augmentation in `prepare_training_data.py`
- **More augmented copies of real files** — currently `aug0`-`aug7` (8 copies), increase to `aug0`-`aug14` (15 copies) to boost real data signal
- Add **hyphenated title augmentations** — the model struggles with `Dry-braised`, `Fish-fragrant` etc. Generate synthetic files with hyphenated titles
- Add **short title augmentations** — single-word titles like `MAFGHOUSSA`, `SHAWARMA` are frequently missed

#### 2b. Expand generated recipe diversity in `generate_training_data.py`
- Add more EN titles to `EN_TITLES` list — currently ~50 titles, many failures are for titles not in the synthetic set
- Add more noise patterns: ALL CAPS, mixed case, titles with special characters (`'`, `-`, `/`, `(`)

#### 2c. Increase generated data with new patterns
- **OCR corruption pattern** — simulate OCR errors (letter substitutions: `l`→`1`, `O`→`0`, `rn`→`m`)
- **Header/page number clutter** — real recipes have `168 / Salads & Vegetables` type noise before/after titles

**Files:**
- `tools/title-loop/generate_training_data.py` — `EN_TITLES` list, pattern generators
- `tools/title-loop/prepare_training_data.py` — augmentation count

### Tier 3: Training improvements (+5-10% estimated)

#### 3a. Unfreeze more layers
Currently freezing layers 0-9 (training only layers 10-11 + classifier = ~20M params). Rule of thumb for real examples per unfrozen-layer config:

| Unfrozen layers | Trainable params | Real examples needed | Available after Tier 2 |
|---|---|---|---|
| 2 (current) | ~20M | 100-300 | 85 raw + 680 aug = OK |
| 4 (proposed) | ~40M | 300-600 | 85 raw + 1,275 aug = OK |
| 6 | ~60M | 600-1,200 | borderline, needs new data |
| 12 (all) | ~110M | 2,000-5,000 | not viable |

With Tier 2 increasing augmentations to 15x, switch to `freeze_layers_below: 8` (train layers 8-11).

#### 3b. Increase epochs and adjust early stopping
With a larger val set (246 samples), early stopping is now reliable. Increase max epochs from 15 to 25 and let early stopping decide.

#### 3c. Learning rate schedule
Try a lower learning rate (1e-5 instead of 2e-5) with linear warmup 0.1 → cosine decay. More conservative updates with the larger training set.

**Files:**
- `tools/title-loop/train_title_model.py` — `LANG_CONFIG["en"]`, `TrainingArguments`

## Estimated cumulative impact

| Tier | Accuracy | Delta |
|---|---|---|
| Current | 52.2% | — |
| + Tier 1 (matching fix) | ~59% | +7% |
| + Tier 2 (data quality) | ~75% | +16% |
| + Tier 3 (training tuning) | ~85% | +10% |

Getting to 90% likely requires more real training data (currently only 85 real examples in train set). The gap between real (63.9%) and generated (51.3%) accuracy suggests the synthetic data doesn't fully represent real OCR patterns.

## Implementation order

1. **Tier 1** — fix matching logic (no retraining needed)
2. **Tier 2** — expand training data, regenerate, re-tokenize
3. **Tier 3** — retrain with tuned hyperparams (overnight)
4. Re-evaluate and iterate

## Verification

After each tier:
```bash
# Tier 1: just re-evaluate with fixed matching
.venv/bin/python3 eval_model.py --lang en

# Tier 2+3: full retrain pipeline
bash retrain_en.sh 2>&1 | tee retrain_en.log
```

Target: >85% combined accuracy, >80% on real data.
