# Iteration 15 — Failure Analysis

## Failure 1: KREM SELEROWY Z GORGONZOLA → got `UuIw`

**Input structure (first 6 non-empty lines):**
```
/ Jesien / Zupy         ← line 0 — book breadcrumb (Autumn / Soups)
KREM SELEROWY Z GORGONZOLA ← line 1 — the actual title
DLA 4 OSÓB              ← line 2 — serving size (filtered correctly)
PRZYGOTOWANIE 10 MIN    ← line 3 — metadata (filtered correctly)
GOTOWANIE 30 MIN        ← line 4 — metadata (filtered correctly)
UuIw                    ← line 5 — garbled OCR
```

**Why it fails — two compounding bugs:**

**Bug A: Bilingual detection falsely suppresses the title.**

`/ Jesien / Zupy` (a category breadcrumb) is at position 0 and is mixed-case, so it becomes `prePos0`. `KREM SELEROWY Z GORGONZOLA` is at position 1, ALL_CAPS, single-origin — it enters `nearbyAllCaps`.

The layout-based bilingual fallback then fires:
- `pos0Words = {"jesien", "zupy"}`
- `capWords = {"krem", "selerowy", "gorgonzola"}`
- No word overlap → classified as a "translation candidate"

`KREM SELEROWY Z GORGONZOLA` is suppressed from `scoredForThreshold`. The real title is no longer competing.

Root cause: `/ Jesien / Zupy` is a **forward-slash-separated breadcrumb** (chapter/season navigation), not a recipe title in another language. The existing pipe filter (`text.includes(" | ")`) would have caught it if it used ` | `, but it uses ` / ` instead.

**Bug B: `UuIw` passes the garbled-text filter.**

`UuIw` is clearly OCR noise, but `isLikelyGarbled` does not flag it:
- 4 letters — the single-word short check requires `letters.length <= 3`; 4 letters escapes it
- Mixed case (U-u-I-w) — not detected by any specific pattern
- Vowel ratio: U, u, I = 3/4 = 0.75 — within the 0.15–0.85 range

So after the real title is suppressed, `UuIw` wins.

---

## Failure 2: LABANEH BALLS WITH NIGELLA SEEDS → got `BALLS`

**Input structure (relevant lines):**
```
LABANEH          ← line 0 \
BALLS            ← line 1  |— 4-line title, correctly merged
WITH NIGELLA     ← line 2  |
SEEDS            ← line 3 /
[long prose ×9 lines]
MAKES 25 LABANEH ← line 12 — metadata, filtered by MAKES pattern
BALLS            ← line 13 — repeat fragment, survives as standalone
```

**Why it fails:**

The `capsCoalesced` logic correctly merges lines 0–3 into `LABANEH BALLS WITH NIGELLA SEEDS` — this is working as designed.

However, line 13 (`BALLS`) is a second occurrence in the source: the tail end of "MAKES 25 LABANEH BALLS" after the `MAKES 25 LABANEH` prefix gets filtered as metadata. `BALLS` alone passes all hard filters and enters the candidate pool at position 13.

In the dedup step, the "shorter wins" rule removes `LABANEH BALLS WITH NIGELLA SEEDS` because `BALLS` is a shorter substring of it:

```
aLower.includes(b.text.toLowerCase()) && b.text.length < a.text.length
→ "labaneh balls with nigella seeds".includes("balls") && 5 < 32  → true
```

`LABANEH BALLS WITH NIGELLA SEEDS` is eliminated; `BALLS` survives.

The pre-dedup sub-section header filter does not help here because `BALLS` (at position 13) is followed by prose (the recipe method), not ingredients, so `followedByIngredients = false` and it is kept.

Root cause: A metadata line (`MAKES 25 LABANEH BALLS`) deposits a fragment (`BALLS`) into the candidate pool after its prefix is filtered. This fragment then destructs the correctly assembled title via the "shorter wins" dedup rule.

---

## Failure 3: Smażona zielona fasolka → got `DLA & OSOB`

**Input structure (first 10 non-empty lines):**
```
Smażona zielona fasolka  ← line 0 — the title (Polish)
GREEN BEANS BORKEUM      ← line 1 — Korean-romanisation translation
그린빈 볶음              ← line 2 — Korean script (filtered by garble check)
[2 lines of Polish prose]
DLA & OSOB               ← line 5 — OCR-corrupted "DLA 4 OSÓB" (serving size)
Przvgetowanie            ← line 6 — OCR-corrupted "Przygotowanie"
15 minut
Smazenie 15 minut
SKLADNIKI                ← line 9
```

**Why it fails:**

`DLA & OSOB` is a serving-size notation: Polish `DLA 4 OSÓB` ("FOR 4 PEOPLE"), where OCR misread `4` as `&`.

The metadata pattern intended to catch it is `/^DLA\s+\d/i`, which requires a **digit** after `DLA`. With `&` in place of `4`, the pattern does not match. `DLA & OSOB` clears all hard filters and is awarded the ALL_CAPS bonus (+0.08).

The bilingual detection correctly suppresses `GREEN BEANS BORKEUM` (as a translation of the Polish title). After that suppression, `scoredForThreshold` contains both `Smażona zielona fasolka` and `DLA & OSOB`.

The multi-title guard fires (`allCapsSelected.length === 1` = `DLA & OSOB`), collapsing `selected` to the single highest-scoring candidate. `DLA & OSOB`'s ALL_CAPS bonus (+0.08) combined with its position factor (position 5 in a ~25-line document → factor ≈ 1.07) pushes its final score above `Smażona zielona fasolka`, which gets no ALL_CAPS bonus and no structural bonus.

Root cause: A single-character OCR substitution (`4` → `&`) defeats the serving-size metadata filter. The ALL_CAPS bonus then elevates the corrupted metadata above the actual mixed-case title.

---

## Common Themes

### 1. OCR corruption bypasses hard filters
All three failures involve OCR artifacts that slip through. In case 3 a digit becomes `&`, defeating a metadata regex that requires `\d`. In case 1 `UuIw` has 4 letters instead of ≤3, escaping the single-word garble threshold.

### 2. Bilingual detection misfires on non-title position-0 lines (case 1)
The `prePos0` heuristic assumes any mixed-case line at position 0 is a title. A book breadcrumb like `/ Jesien / Zupy` satisfies this condition and triggers spurious translation-candidate suppression of the real ALL_CAPS title on line 1. The ` / `-separated breadcrumb format is not filtered (only ` | ` is).

### 3. Metadata-line fragments pollute the candidate pool (case 2)
When a multi-word metadata line (e.g., `MAKES 25 LABANEH BALLS`) is split by the metadata filter, its trailing fragment (`BALLS`) survives independently. The "shorter wins" dedup then destroys the correctly merged title that contains the fragment as a substring.

### 4. ALL_CAPS bonus can override a correct mixed-case title (case 3)
Mixed-case recipe titles (common in books that show the native-language name first) receive no ALL_CAPS bonus. Any ALL_CAPS line that passes hard filters — even corrupted metadata — gains 0.08 unconditionally, which can tip the multi-title collapse toward the wrong candidate.
