# Iteration 30 — Failure Analysis

All 9 failures are generated files; 0 real files failed.

---

## Pattern A: OCR digit-for-letter corruption → empty result (2 cases)

**Failures:** Braised Cod with White Wine, Roasted Beet and Walnut Dip

The title line contains digits substituted for letters (`Bra1sed Cod w1th Wh1te W1ne`, `Roasted Beet and Walnut D1p`). The extractor rejects the corrupted line and returns nothing rather than attempting normalization or falling back to a later occurrence.

Expected a normalized title; got empty string.

---

## Pattern B: OCR digit-for-letter corruption → body sentence extracted (3 cases)

**Failures:** Drożdże Sernik, Piernik z Śliwkami, Żurek Krakowski

Similar digit-for-letter corruption on the title line (`Sern1k`, `P1ern1k`, plus garbage tokens). The extractor rejects the title line but then incorrectly falls back to a sentence from the recipe body (e.g., "Podawać letni lub chłodny.", "Traditional Easter soup of Greater Poland.").

Expected the corrupted title (normalized); got an unrelated body sentence.

---

## Pattern C: OCR corruption partially normalized, incorrectly (1 case)

**Failure:** Sole with Brown Butter and Capers

Title line `S01e with Brown Butter and Capers` — the extractor attempted to normalize `S01e` but produced `Soie` instead of `Sole`. The digit `0` was converted to `o` but `1` became `i`, yielding a plausible-looking but wrong word.

Expected "Sole"; got "Soie". The normalization heuristic (digit→letter mapping) is imprecise for this case.

---

## Pattern D: Mixed/unusual casing and special characters → body sentence (1 case)

**Failure:** Kopytka z Pieczarkami Leśnymi

Title line `KoPyTka z P¡eczarkami Leśnymi` has erratic capitalization and a dotless-i (`¡`) character. The extractor likely rejected it (or failed to score it as a title) and fell back to a body sentence ("Ugotuj ziemniaky.").

Expected the title; got a cooking instruction sentence.

---

## Pattern E: Metadata/tags line precedes ALL-CAPS title → empty result (1 case)

**Failure:** Ogórkowa Zupa

The document opens with a metadata line (`Lato | Zupy | DLA 4 OSÓB | PRZYGOTOWANIE 15 MIN | GOTOWANIE 20 MIN`) followed by the title in ALL CAPS (`OGÓRKOWA ZUPA`). The extractor apparently gets confused by the metadata line or doesn't recognize the ALL-CAPS form as a title, returning empty.

Expected "Ogórkowa Zupa"; got empty string.

---

## Pattern F: Title absent from document start → wrong title extracted (1 case)

**Failure:** Mushroom Risotto

The document begins mid-recipe with body prose (describing risotto technique), and the title `Mushroom Risotto` never appears at the top. A different recipe title (`CARPACCIO DI PESCE SPADA`) appears later in the document and was extracted instead.

Expected "Mushroom Risotto"; got "CARPACCIO DI PESCE SPADA + CARPACCIO WITH CITRUS DRESSING". The extractor correctly found a recipe title in the text — just not the right one, because the true title was never present at the expected position.

---

## Summary by affected file type

All 9 failures are **generated files only**. No real files failed this iteration.

The dominant issue is OCR corruption on the first line (Patterns A, B, C, D — 7/9 cases): the extractor is not robust to digit-for-letter substitutions and unusual casing on the title line. Secondary issues are metadata headers before the title (Pattern E) and documents where the true title is simply absent from the beginning (Pattern F).
