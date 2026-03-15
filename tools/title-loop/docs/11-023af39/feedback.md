# Iteration 11 Failure Analysis

## Failure: CHLEBEK Z WARZYWAMI I BOCZKIEM

**Expected:** `CHLEBEK Z WARZYWAMI I BOCZKIEM`
**Got:** `CHLEBEK`

**Input structure (key lines):**
```
idx 0:  Lato | Dania główne                      ← book category header ("Summer | Main dishes")
idx 1:  CHLEBEK Z WARZYWAMI I BOCZKIEM           ← actual recipe title (5 words, ALL_CAPS)
idx 2:  WARZYWA I BOCZEK                         ← section header ("Vegetables and Bacon")
idx 3:  500 g strączków zielonego groszku        ← ingredient (starts with number)
idx 4:  1 żółta papryka                          ← ingredient
...
idx 8:  CHLEBEK                                  ← section header ("Bread")
idx 9:  500 g mąki                               ← ingredient (starts with number)
...
```

---

## Root Cause: False Positive in Bilingual Title Detection

### What the bilingual detection is supposed to do

The bilingual detection at lines 409–431 targets a specific page layout: a **mixed-case title in language A** at position 0, followed immediately by an **ALL_CAPS romanization/translation** at positions 1–2. It suppresses the ALL_CAPS candidate from the threshold calculation so the original mixed-case title can win.

### Why it misfires here

`prePos0` = `"Lato | Dania główne"` — This line passes the check: it is at position 0 and is not ALL_CAPS.

However, `"Lato | Dania główne"` is not a recipe title at all. It is a **book chapter header** meaning "Summer | Main dishes". It marks the section of the cookbook, not a recipe.

`nearbyAllCaps` = candidates at positions 1–2:
- `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` (position 1)
- `"WARZYWA I BOCZEK"` (position 2)

The algorithm then computes cosine similarity between `"Lato | Dania główne"` and each of these. Both are Polish food-related texts. In a multilingual embedding space, food-domain terms share enough semantic neighbourhood that the similarity of `"Summer | Main dishes"` to `"BREAD WITH VEGETABLES AND BACON"` can exceed the 0.4 threshold.

When one or both are identified as `translationCandidates`, the filter:
```javascript
scoredForThreshold = scored.filter((s) => {
  const sLower = s.text.toLowerCase();
  return !translationCandidates.some((t) => sLower.startsWith(t.text.toLowerCase()));
});
```
also removes the 2-line join `"CHLEBEK Z WARZYWAMI I BOCZKIEM WARZYWA I BOCZEK"` (it starts with the suppressed text). The result is that **all longer ALL_CAPS candidates anchored at position 1 are purged from `scoredForThreshold`** — and therefore from `selected`.

### The cascade after suppression

With `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` absent from `selected`:

1. **Prefix removal doesn't fire** (lines 458–466). The guard is `if (firstStructuralHeading && selected.some((s) => s.text === firstStructuralHeading.text))`. `firstStructuralHeading` may point to `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` from `rawScored` (embedding quality), but it is not in `selected`, so the condition is false. `"CHLEBEK"` is never removed as a prefix.

2. **Pre-dedup section filter cannot act** (lines 506–523). The filter correctly identifies `"CHLEBEK"` (position 8) as an ALL_CAPS candidate followed by an ingredient line (`"500 g mąki"` starts with a number). But the filter only removes `"CHLEBEK"` when a longer candidate containing it exists in `selected`. Since `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` was suppressed, `hasLongerParent = false`. `"CHLEBEK"` survives.

3. **Dedup rule** (shorter wins) has nothing to act on — `"CHLEBEK"` is the only ALL_CAPS survivor in the upper portion of the document.

4. **Multi-title guard** sees `"CHLEBEK"` as the first (or only) surviving ALL_CAPS candidate and returns it.

Result: `"CHLEBEK"` — the bread sub-section header — is returned instead of the recipe title.

---

## Why Previous Fix Was Insufficient

Iteration 10 identified the pre-dedup section filter (lines 506–523) and the prefix removal step (lines 458–466) as mechanisms to handle the `"CHLEBEK"` / `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` conflict. Both mechanisms are correct **when the full title is present in `selected`**. The iteration 10 fix correctly handles the 25-candidate cap issue (the full title now has 5 words, fitting the `wordCount <= 5` priority tier). But neither fix anticipated the bilingual detection suppressing the full title before either mechanism gets a chance to act.

---

## Common Themes

### 1. Book category headers are indistinguishable from recipe titles by position

`"Lato | Dania główne"` ("Summer | Main dishes") appears at position 0 and passes all hard filters. The algorithm has no concept of "chapter header" vs "recipe title". The bilingual detection triggers on it as if it were a foreign-language recipe title, suppressing the real title two lines below.

### 2. Bilingual detection uses a 0.4 similarity threshold that is too permissive for food content

The bilingual detection was designed for clearly-paired translations (e.g., Korean title → ALL_CAPS romanization). The 0.4 threshold is calibrated for cross-lingual translation, but within Polish food text, `"Summer | Main dishes"` and `"BREAD WITH VEGETABLES AND BACON"` may share enough domain vocabulary to exceed it. This causes the correction mechanism to fire on a completely unrelated pair.

### 3. Cascading dependency on full title presence

Multiple downstream safety mechanisms (prefix removal at line 458, pre-dedup filter at line 506) are gated on the full title being present in `selected`. They are not independently robust — they share the same precondition. One upstream suppression (bilingual detection) disables both simultaneously, leaving no fallback.

### 4. Section headers as recipe title candidates

`"WARZYWA I BOCZEK"` and `"CHLEBEK"` are cookbook sub-section headers (ingredient groups for the two components of the recipe). They resemble recipe titles structurally: short, ALL_CAPS, Polish food words. The algorithm cannot distinguish them from standalone recipe titles without knowing the document structure. The document structure (each section header immediately followed by its ingredient list) is the necessary signal, and while the multi-title guard and pre-dedup filter attempt to use it, both are blocked by the earlier suppression.
