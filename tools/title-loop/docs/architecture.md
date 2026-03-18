# Title Extractor Architecture

## Pipeline Overview

The title extractor (`lib/text-classifier/title-extractor.ts`) takes raw OCR text from recipe photos and identifies recipe titles using a multi-stage pipeline combining structural heuristics and semantic embeddings. It was developed through 31 automated improvement iterations, reaching 100% accuracy on real recipe files (11/11) from iteration 18 onward, and 98.2% on the combined corpus (real + synthetic) by iteration 31.

```
                          RAW OCR TEXT
                              |
                    +---------v----------+
                    |   Split into lines  |
                    +--------------------+
                              |
                    +---------v----------+
                    |  Skip garbled burst |  findBurstEnd(): discard leading
                    |  + overflow skip   |  short lines, OCR noise, cooking
                    |  + body prologue   |  instruction prologues, and
                    +--------------------+  previous-recipe overflow blocks
                              |
                    +---------v----------+
                    |  Pre-join hyphen-   |  "ROASTED CHICKEN WITH VEGET-"
                    |  broken lines       |  + "ABLES" -> single line
                    +--------------------+
                              |
                    +---------v----------+
                    |  Coalesce short     |  Consecutive ALL_CAPS lines with
                    |  ALL_CAPS fragments |  <=2 words each merged into one
                    +--------------------+  (OCR-fragmented headings)
                              |
                    +---------v----------+
                    |  Pre-merge          |  Lines starting with /&+:( are
                    |  continuation lines |  joined to preceding line
                    +--------------------+    e.g. "SAFFRON BUNS" + "/ VARIATION"
                              |               -> "SAFFRON BUNS / VARIATION"
                    +---------v----------+
                    |  Generate candidates|  For each line: single, 2-line join,
                    |  (single + joins)   |  3-line join. Dedup by normalized text.
                    |  + OCR repair       |  Dictionary-guided + blind OCR repair
                    |  + blind variants   |  variants for early-position candidates
                    +--------------------+
                              |
                    +---------v----------+
                    |  Hard filters       |  16 independent checks per candidate
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
              |  | + continuation join |         |
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
              |  | preamble + 0.08-12  |         |
              |  | direct-succ + 0.10  |         |
              |  | (capped at +0.15)   |         |
              |  +--------------------+          |
              |                                  |
              ==================================+
                              |
                    +---------v----------+
                    |  Bilingual          |  Suppress ALL_CAPS translation at
                    |  detection          |  pos 1-2 via embedding similarity
                    |  (pre-threshold)    |  OR layout-based cross-lingual
                    +--------------------+  fallback (no shared words)
                              |
                    +---------v----------+
                    |  Subtitle           |  Penalize longer mixed-case at
                    |  suppression        |  pos 1-2 when short title at pos 0
                    +--------------------+
                              |
                    +---------v----------+
                    |  Bilingual layout   |  Boost pos-0 foreign food name
                    |  boost              |  when translation + section label
                    +--------------------+  follow within 5 lines
                              |
                    +---------v----------+
                    |  OCR artifact       |  Pre-filter ALL_CAPS candidates
                    |  pre-filter         |  with no vocabulary corroboration
                    +--------------------+  in rest of document
                              |
                    +---------v----------+
                    |  Threshold filter   |  max(0.08, bestThresholdScore * 0.7)
                    |                     |  Empty-pool fallback: if nothing
                    |                     |  survives, take best positional
                    +--------------------+  (relaxed rawScore for early pos)
                              |
                    +---------v----------+
                    |  Title-absent page  |  When first 3 lines are all
                    |  guard              |  ingredients/instructions, require
                    +--------------------+  high rawScore and early position
                              |
                    +---------v----------+
                    |  Post-threshold     |
                    |  cleanup            |
                    |  - prefix removal   |  Remove "ARAYES" when "ARAYES SHRAK" present
                    |  - join protection  |  Keep continuation joins, drop fragments
                    |  - sub-section      |  Remove ALL_CAPS headers followed by
                    |    removal          |  ingredients when longer parent exists
                    |  - component single |  Remove single words when their join survives
                    |    removal          |  ("Lamb" + "Stew" removed when "Lamb Stew" present
                    |  - distant sub-sec  |  Remove short candidates >10 lines from
                    |    protection       |  position-0 compound title
                    +--------------------+
                              |
                    +---------v----------+
                    |  Dedup              |  Shorter substring wins (with
                    |  (substring-based)  |  category-label suffix protection)
                    +--------------------+  "Pierogi Ruskie" beats
                              |             "Pierogi Ruskie 200g maki"
                    +---------v----------+
                    |  Multi-title guard  |  2+ ALL_CAPS -> corroboration + ingredient gap check
                    |                     |  1 ALL_CAPS -> highest score (late-doc guard at 75%)
                    |                     |  0 ALL_CAPS -> keep close, collapse distant (>10 lines)
                    +--------------------+
                              |
                    +---------v----------+
                    |  Sort by position,  |
                    |  cap at 3, join     |
                    |  with " + "         |
                    +--------------------+
                              |
                    +---------v----------+
                    |  OCR normalization  |  Dictionary repair, blind digit->letter,
                    |  (normalizeOcrTitle)|  title-case conversion, erratic casing fix
                    +--------------------+
                              |
                        EXTRACTED TITLE
```

## Hard Filters Detail

`passesHardFilters()` applies 16 independent checks. A candidate is rejected if **any** check fails:

| # | Filter | Example rejected |
|---|--------|-----------------|
| 1 | Length 3-80 chars | `"A"`, very long body text |
| 2 | Ingredient detection | `"2 cups flour"`, `"100g masla"`, `"do smaku"` |
| 3 | Leading number | `"1. Preheat oven"`, `"- 2 jajka"` |
| 4 | Metadata patterns | `"SERVES 4"`, `"NA 3 PAPRYKI"`, `"30 MIN"`, `"PORCJI:"` |
| 5 | OCR garble | Low vowel ratio, lowercase-start, mid-sentence boundary, pipe-in-word, mixed Latin+Cyrillic, garbled camelCase |
| 6 | Cooking instruction | `"Preheat oven to 350"`, `"Ugotuj ziemniaki"` (English 4+ words, Polish 2+ words) |
| 7 | OCR-normalized instruction | `"Podaw4ć"` -> `"Podawać"` (4->a repair then recheck) |
| 8 | Pipe separator | `"Lato \| Dania glowne"` (chapter header) |
| 9 | Trailing page number | `"VEGETABLE SIDES                         145"` |
| 10 | Multi-slash breadcrumb | `"/ Jesien / Zupy"` (2+ slashes = navigation) |
| 11 | Bullet line | `"- flour"`, `"* sugar"` |
| 12 | Sub-section header | `"For the sauce:"`, lines ending with `:` |
| 13 | Page reference | `"Page 42"`, `"Strona 15"` |
| 14 | Corrupted annotations | `"[CORRUPTED SPILLOVER..."`, `"(OCR corruption..."` |
| 15 | Section label | `"INGREDIENTS"`, `"SKLADNIKI"`, `"Przygotowanie"`, `"WARZYWA"`, `"DESERY"` |
| 16 | Non-title words / word limit | `"the"`, `"buns"` (single word); 8+ words without separator |

## Pre-processing Detail

### Burst/Overflow Detection (`findBurstEnd`)

Three stages skip non-title content at the start of the document:

1. **Overflow preamble skip**: Blocks introduced by "PREVIOUS RECIPE OVERFLOW", "CORRUPTED SECTION", etc. are skipped past the next visual separator (`====`, `----`) or double-blank-line cluster.
2. **Garbled burst skip**: Short lines (<20 chars) that fail `isLikelyGarbled()` and aren't ALL_CAPS are skipped.
3. **Body prologue skip**: When 3+ consecutive opening lines are cooking instructions, prose continuations, or body-ending text, they are skipped to find the actual title region.

### Candidate Generation (`buildCandidates`)

1. **Hyphen-broken line join**: `"VEGET-"` + `"ABLES"` merged into `"VEGETABLES"`.
2. **Short ALL_CAPS coalescing**: Consecutive ALL_CAPS lines (each <=2 words, <=25 chars) merged into a single heading. Category-label words at the end of a multi-word title are allowed through (e.g., "LEMON HERB ROASTED" + "VEGETABLES").
3. **Continuation pre-merge**: Lines starting with `/&+:(` are merged into the preceding line. The standalone is only emitted as a fallback if the merge fails hard filters.
4. **Metadata continuation skip**: Short ALL_CAPS fragments immediately after metadata lines (e.g., "DLA 4 OSOB" + "BALLS") are excluded.
5. **Single, 2-line, and 3-line candidates**: Section labels block joins only when the join would be <=2 words or the label is a process label (not a food category).
6. **Blind OCR variant generation**: For early-position candidates (line <=5) with OCR artifacts or erratic casing, additional candidates are generated with digit-to-letter repair (`0->O`, `1->I/L`, `4->A`, `5->S`) and casing normalization.

### OCR Repair System

Two layers of OCR repair operate at different stages:

- **Dictionary-guided repair** (`repairOcrText`): Each word with OCR artifact characters is checked against a food dictionary. All substitution combinations are tried (e.g., `"s0up"` -> `"soup"`). Applied during candidate generation.
- **Blind repair** (`applyBlindOcrRepair`): Context-free digit-to-letter substitution based on adjacent character casing. ALL_CAPS: `1->I`, `0->O`, `4->A`, `5->S`. Mixed-case: same rules but only when adjacent to lowercase letters. Applied during final normalization (`normalizeOcrTitle`).
- **Blind variant generation** (`generateBlindOcrVariants`): For mixed-case text, produces two variants (1->i and 1->l) to let the embedding scorer choose. For ALL_CAPS, a single unambiguous variant.

## Scoring Model

Each candidate receives a composite score built from three embedding signals plus structural bonuses:

```
rawScore = cosineSim(candidate, TITLE_REF) - max(
             cosineSim(candidate, HEADER_REF),
             cosineSim(candidate, NOISE_REF)
           )

score = rawScore * positionFactor + allCapsBonus + structuralBonus
        + preambleBonus + directSuccessorBonus
```

**Reference embeddings** (cached across calls):
- `TITLE_REF`: "recipe name, dish title, name of the food, nazwa przepisu, nazwa dania"
- `HEADER_REF`: "ingredients list, cooking directions, section heading, skladniki, przygotowanie, sposob wykonania"
- `NOISE_REF`: "page number, table of contents, book footer, garbled text"

**Bonuses:**

| Bonus | Value | Condition |
|-------|-------|-----------|
| Position factor | x1.0 to x1.12 (multiplicative) | Candidate-relative position in top half, linear decay |
| ALL_CAPS | +0.08 multi-word, +0.03 single-word | All letters uppercase, >= 4 alpha chars |
| Structural heading | +0.10 (additive) | Best ALL_CAPS heading by embedding quality (or its continuation join) |
| First-after-preamble | +0.12 structural / +0.08 empty | First candidate after all-filtered preamble lines |
| Direct-successor | +0.10 (additive) | Line immediately after a section label, metadata, or pipe line |
| Combined positional cap | max +0.15 (or +0.22 for pipe+ALL_CAPS) | Prevents over-boosting when multiple positional bonuses fire |

The `thresholdScore` deliberately excludes the structural bonus to prevent it from inflating the cutoff on multi-recipe pages.

## Post-Scoring Stages

### Bilingual Detection (pre-threshold)

Three methods detect bilingual recipe pages:

1. **Embedding similarity**: Mixed-case title at pos 0 + ALL_CAPS at pos 1-2 with cosine similarity > 0.4. Suppresses the translation and any multi-line joins containing it.
2. **Layout-based cross-lingual**: When embedding similarity is too low (e.g., Polish <-> Korean), detects bilingual layout by position and zero word overlap between mixed-case (>=2 words at pos 0) and ALL_CAPS (>=2 words at pos 1-2).
3. **Mixed-case bilingual layout**: Foreign food name (<=2 words) at pos 0 + mixed-case translation (2-5 words) at pos 1-2 + section label within 5 lines. Boosts pos-0 candidate by +0.15.

When a bilingual translation is identified as the structural heading, the structural bonus is reassigned to the next best non-translation heading.

### Subtitle Suppression

When a short mixed-case title at position 0 (<=5 words) is followed by a longer mixed-case candidate at position 1-2 (3+ more words), the longer candidate receives a -0.15 penalty to prevent subtitles from winning.

### OCR Artifact Pre-filter

When >=2 ALL_CAPS candidates exist, those without vocabulary corroboration in the rest of the document are removed from the threshold computation pool. This prevents orphaned OCR artifacts (e.g., "DAT FLATBREADS" from a preceding page) from inflating the threshold.

### Multi-title Guard

- **2+ ALL_CAPS**: Vocabulary corroboration filters orphan artifacts. Then checks if non-first headings are sub-section headers (followed by ingredient lines) within one recipe, collapsing to the first heading if so.
- **1 ALL_CAPS**: Collapses to highest score. Late-document guard (>75% of non-empty lines) prefers earlier candidates.
- **0 ALL_CAPS**: Keeps all if within 10 lines of each other (genuine multi-recipe). If spread >10 lines, collapses to the highest-scoring candidate near the earliest position.

## Key Design Decisions

**Multiplicative position bonus**: Additive position bonuses let garbled early text dominate. Multiplicative amplifies existing quality without creating it.

**Candidate-relative positioning**: Position factor uses rank among candidates that passed hard filters (not raw line number), so filtered preamble lines don't penalize the first real candidate.

**Pre-merge over downstream join protection**: Continuation lines (`/&+:`) are merged upstream in `buildCandidates` so the complete title enters the pool as a single candidate. This replaced 5 iterations of fragile downstream join-survival logic.

**Pre-threshold bilingual detection**: Must run before threshold computation. Otherwise the ALL_CAPS translation inflates the threshold beyond the mixed-case primary title's reach (chicken-and-egg problem).

**Shorter-wins dedup**: The dedup rule is intentionally simple ("shorter substring wins") because upstream filters (prefix removal, sub-section removal) ensure conflicting shorter fragments are removed before dedup runs. This has been incorrectly "improved" 5 times by the automated loop. Exception: multi-line joins whose suffix is a food-category label are protected (e.g., "LEMON HERB ROASTED VEGETABLES" is not shortened to "LEMON HERB ROASTED").

**Title-absent page guard**: When the first 3 non-empty lines are all ingredients/instructions/prose, the pipeline assumes no title is present and applies a stricter rawScore threshold (0.10) with position cap (<=2) to avoid extracting body text.

**Structural heading continuation**: When the best structural heading has a continuation on the next line starting with `/&+:(`, the longer 2-line join is preferred. Guard: the remainder must start with a continuation character to avoid merging consecutive independent titles.

## Language Support

The extractor handles both English and Polish recipes:
- Measurement units: `łyżka`, `szklanka`, `szczypta`, `garść`, `opakowanie`, `plasterek`
- Metadata: `NA 3 PAPRYKI`, `DLA 4 OSOB`, `N MIN`, `N GODZ`, `PORCJI:`, `SEZON:`, `CZĘŚĆ N`
- Section labels: `SKŁADNIKI`, `PRZYGOTOWANIE`, `SPOSÓB WYKONANIA` + 40+ food-category chapter labels (both languages)
- OCR garble: Polish vowels (`ąęó`) included in vowel ratio check; mixed Latin+Cyrillic detection
- Common prepositions: `w`, `z`, `ze`, `bo`, `na`, `ni`, `po`, `ku`, `od`, `za`, `co` allowed in multi-word garble detection
- Cooking instructions: 60+ English imperative verbs, 40+ Polish imperative verbs with OCR-resilient forms and Unicode-aware word boundaries

## Iteration History

The title extractor was developed through 31 automated improvement iterations. Key milestones:

| Iteration | Score | Key change |
|-----------|-------|------------|
| 1 | 16.7% | Baseline: position bonus, metadata filter, OCR quality gate |
| 2-3 | 33.3% | Fixed substring dedup destroying valid multi-line joins |
| 4-5 | 50.0% | Quality-based heading selection, origin tracking |
| 6 | 66.7% | Separator normalization, continuation join protection |
| 7 | 50.0% | Regression: suffix join removal too aggressive |
| 8 | 75.0% | Pre-merge continuation lines upstream (major architectural change) |
| 9 | 87.5% | Pre-threshold bilingual detection |
| 10 | 75.0% | Regression: Polish metadata patterns missing |
| 11 | 87.5% | Sub-section header removal |
| 12 | 84.3% | Pipe filter, corpus expansion to 102 files |
| 13 | 98.1% | Bullet-line and section label filters, Polish ingredient detection |
| 14-15 | 72-82% | Regression from synthetic test expansion (real files 100%) |
| 16 | 90.9% | Improved bilingual filter, diacritic-stripped section labels |
| 17 | 90.9% | Polish chapter labels (WARZYWA, DESERY, etc.) added to section labels |
| 18 | 100% real | Real files reach 100%; synthetic corpus introduced |
| 19-24 | 84-91% | Polish preposition handling, body-text filters, OCR corruption resilience |
| 25 | 100% | Peak performance on all files |
| 26-30 | 90-92% | Stabilization: overflow detection, cooking instruction filters, OCR repair |
| 31 | 98.2% | Positional bonuses, title-absent guard, blind OCR variants, component protection |

**Persistent challenges** (remaining ~2% of synthetic failures): OCR digit-for-letter substitutions that produce valid-looking but incorrect words; section/category headers immediately before the actual title when both are ALL_CAPS; multi-line titles spanning 4+ lines.
