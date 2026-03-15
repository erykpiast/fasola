# Title Extractor Architecture

## Pipeline Overview

The title extractor (`lib/text-classifier/title-extractor.ts`) takes raw OCR text from recipe photos and identifies recipe titles using a multi-stage pipeline combining structural heuristics and semantic embeddings.

```
                          RAW OCR TEXT
                              |
                    +---------v----------+
                    |   Split into lines  |
                    +--------------------+
                              |
                    +---------v----------+
                    |  Skip garbled burst |  findBurstEnd(): discard leading
                    |  (short OCR noise)  |  short lines with bad vowel ratios
                    +--------------------+
                              |
                    +---------v----------+
                    |  Pre-merge          |  Lines starting with /&+:( are
                    |  continuation lines |  joined to preceding line
                    +--------------------+    e.g. "SAFFRON BUNS" + "/ VARIATION"
                              |               -> "SAFFRON BUNS / VARIATION"
                    +---------v----------+
                    |  Generate candidates|  For each line: single, 2-line join,
                    |  (single + joins)   |  3-line join. Dedup by normalized text.
                    +--------------------+
                              |
                    +---------v----------+
                    |  Hard filters       |  9 independent checks per candidate
                    |  (reject non-titles)|  (see detail below)
                    +--------------------+
                              |
                    +---------v----------+
                    |  Cap at 25          |  Prefer ALL_CAPS + short candidates
                    |  (pre-filter)       |  to limit embedding API calls
                    +--------------------+
                              |
              ================v=================
              |     EMBEDDING SCORING            |
              |                                  |
              |  +---------v----------+          |
              |  | Pass 1: rawScore   |          |
              |  | titleSim - max(    |          |
              |  |  headerSim,        |          |
              |  |  noiseSim)         |          |
              |  +--------------------+          |
              |            |                     |
              |  +---------v----------+          |
              |  | Structural heading  |         |
              |  | selection           |         |
              |  | (best ALL_CAPS by   |         |
              |  |  embedding quality) |         |
              |  +--------------------+          |
              |            |                     |
              |  +---------v----------+          |
              |  | OCR truncation      |         |
              |  | penalty (-1.0)      |         |
              |  | "FRON" vs "SAFFRON" |         |
              |  +--------------------+          |
              |            |                     |
              |  +---------v----------+          |
              |  | Pass 2: bonuses     |         |
              |  | position * 1.12     |         |
              |  | ALL_CAPS + 0.08     |         |
              |  | structural + 0.10   |         |
              |  +--------------------+          |
              |                                  |
              ==================================+
                              |
                    +---------v----------+
                    |  Bilingual          |  Suppress ALL_CAPS translation at
                    |  detection          |  pos 1-2 if cosine > 0.4 with
                    |  (pre-threshold)    |  mixed-case title at pos 0
                    +--------------------+
                              |
                    +---------v----------+
                    |  Threshold filter   |  max(0.08, bestThresholdScore * 0.7)
                    |                     |  Empty-pool fallback: if nothing
                    |                     |  survives, take best positional
                    +--------------------+
                              |
                    +---------v----------+
                    |  Post-threshold     |
                    |  cleanup            |
                    |  - prefix removal   |  Remove "ARAYES" when "ARAYES SHRAK" present
                    |  - join protection  |  Keep continuation joins, drop fragments
                    |  - sub-section      |  Remove ALL_CAPS headers followed by
                    |    removal          |  ingredients when longer parent exists
                    +--------------------+
                              |
                    +---------v----------+
                    |  Dedup              |  Shorter substring wins
                    |  (substring-based)  |  "Pierogi Ruskie" beats
                    +--------------------+  "Pierogi Ruskie 200g maki"
                              |
                    +---------v----------+
                    |  Multi-title guard  |  2+ ALL_CAPS -> check ingredient gaps
                    |                     |  1 ALL_CAPS -> highest score wins
                    |                     |  0 ALL_CAPS -> keep all
                    +--------------------+
                              |
                    +---------v----------+
                    |  Sort by position,  |
                    |  cap at 3, join     |
                    |  with " + "         |
                    +--------------------+
                              |
                        EXTRACTED TITLE
```

## Hard Filters Detail

`passesHardFilters()` applies 9 independent checks. A candidate is rejected if **any** check fails:

| # | Filter | Example rejected |
|---|--------|-----------------|
| 1 | Length 3-80 chars | `"A"`, very long body text |
| 2 | Ingredient detection | `"2 cups flour"`, `"100g masla"`, `"do smaku"` |
| 3 | Leading number | `"1. Preheat oven"`, `"- 2 jajka"` |
| 4 | Metadata patterns | `"SERVES 4"`, `"NA 3 PAPRYKI"`, `"30 MIN"` |
| 5 | OCR garble | Low vowel ratio, lowercase-start, mid-sentence boundary |
| 6 | Pipe separator | `"Lato \| Dania glowne"` (chapter header) |
| 7 | Bullet line | `"- flour"`, `"* sugar"` |
| 8 | Section label | `"INGREDIENTS"`, `"SKLADNIKI"`, `"Przygotowanie"` |
| 9 | Non-title single word | `"the"`, `"and"`, `"buns"`, `"with"` |

## Scoring Model

Each candidate receives a composite score built from three signals:

```
rawScore = cosineSim(candidate, TITLE_REF) - max(
             cosineSim(candidate, HEADER_REF),
             cosineSim(candidate, NOISE_REF)
           )

score = rawScore * positionFactor + allCapsBonus + structuralBonus
```

**Reference embeddings** (cached across calls):
- `TITLE_REF`: "recipe name, dish title, name of the food, nazwa przepisu, nazwa dania"
- `HEADER_REF`: "ingredients list, cooking directions, section heading, skladniki, przygotowanie"
- `NOISE_REF`: "page number, table of contents, book footer, garbled text"

**Bonuses:**

| Bonus | Value | Condition |
|-------|-------|-----------|
| Position factor | x1.0 to x1.12 (multiplicative) | Top-half of document, linear decay |
| ALL_CAPS | +0.08 (additive) | All letters uppercase, >= 4 alpha chars |
| Structural heading | +0.10 (additive) | Best ALL_CAPS heading by embedding quality |

The `thresholdScore` deliberately excludes the structural bonus to prevent it from inflating the cutoff on multi-recipe pages.

## Key Design Decisions

**Multiplicative position bonus**: Additive position bonuses let garbled early text dominate. Multiplicative amplifies existing quality without creating it.

**Pre-merge over downstream join protection**: Continuation lines (`/&+:`) are merged upstream in `buildCandidates` so the complete title enters the pool as a single candidate. This replaced 5 iterations of fragile downstream join-survival logic.

**Pre-threshold bilingual detection**: Must run before threshold computation. Otherwise the ALL_CAPS translation inflates the threshold beyond the mixed-case primary title's reach (chicken-and-egg problem).

**Shorter-wins dedup**: The dedup rule is intentionally simple ("shorter substring wins") because upstream filters (prefix removal, sub-section removal) ensure conflicting shorter fragments are removed before dedup runs. This has been incorrectly "improved" 5 times by the automated loop.

## Language Support

The extractor handles both English and Polish recipes:
- Measurement units: `lyżka`, `szklanka`, `szczypta`, `garsc`
- Metadata: `NA 3 PAPRYKI`, `DLA 4 OSOB`, `N MIN`, `N GODZ`
- Section labels: `SKLADNIKI`, `PRZYGOTOWANIE`, `SPOSOB WYKONANIA`
- OCR garble: Polish vowels (`ąęó`) included in vowel ratio check
- Common prepositions: `w`, `z` allowed in multi-word garble detection
