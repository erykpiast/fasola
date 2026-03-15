# Iteration 12 → 13 Improvement Plan

## Summary

17 failures across 3 patterns, all rooted in two gaps: (1) no bullet-line filter, and (2) incomplete ingredient/section-label detection. Two primary changes fix all 17 failures at the candidate generation stage. Two defense-in-depth changes harden the pipeline against edge cases.

---

## Root Cause Analysis

### Pattern 1: Ingredient bullet lines (12 failures)

Lines like `- 2 jajka`, `- Sól do smaku`, `- Salt to taste` enter the candidate pool because:
- `passesHardFilters` has no check for bullet-list markers (`- `, `• `)
- `looksLikeIngredient` only knows English measurement units — misses Polish (`łyżka`, `szklanka`, `szczypta`), compact metric (`100g`, `50ml`), and qualitative patterns (`to taste`, `do smaku`)
- `startsWithNumber` checks `/^\s*\d/` which doesn't match `- 2 jajka` (starts with `- `)

These lines then compete in embedding scoring, where Polish ALL_CAPS titles like "BARSZCZ CZERWONY" may have weak similarity to the English-heavy TITLE_REFERENCE. With no structural bonus to save the real title, an ingredient line can win by embedding score alone.

### Pattern 2: Section header `INGREDIENTS` (1 failure — Mozzarella Sticks)

Document structure: `INGREDIENTS` → `MOZZARELLA STICKS` → `- 2 tbsp sugar`. The multi-title guard's `isSubHeader` check examines `sortedCaps.slice(1)` — i.e., everything except the **first** ALL_CAPS heading. It assumes `sortedCaps[0]` is the title. But here `sortedCaps[0]` = `INGREDIENTS` (a section label), so the real title `MOZZARELLA STICKS` gets demoted as a sub-header.

The core issue: section labels like `INGREDIENTS`, `SKŁADNIKI`, `DIRECTIONS`, `PRZYGOTOWANIE` are not recipe titles, but nothing filters them.

### Pattern 3: Compound ingredient joins (4 failures)

When duplicate ingredient lines appear consecutively (`- 100g butter` / `- 100g butter`), `buildCandidates` creates a 2-line join that passes hard filters because `100g` doesn't match any measurement keyword (no bare `g`). With zero ALL_CAPS survivors in `selected`, the `allCapsSelected.length === 0` branch keeps all candidates, producing garbage like `- 100g butter - 100g butter + - Salt to taste`.

This is a downstream consequence of Patterns 1 + 2: if bullet lines and section labels were filtered, the real ALL_CAPS title would survive and the multi-title guard would collapse to the correct result.

---

## Change 1: Bullet-Line Filter in `passesHardFilters`

**Priority:** Critical — fixes 16 of 17 failures directly

**Rationale:** Lines starting with `- ` (hyphen-space), `• ` (bullet), or `* ` (asterisk-space) are list items in recipe documents — always ingredients or instruction steps, never titles. This is a universal structural convention across all languages.

### Code change

**File:** `lib/text-classifier/title-extractor.ts`, function `passesHardFilters`

**Before (lines 138–149):**
```typescript
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  // Pipe-separated lines are book category/chapter headers, not recipe titles
  if (text.includes(" | ")) return false;
  // Single-word non-title fragments
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) return false;
  return true;
}
```

**After:**
```typescript
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  // Pipe-separated lines are book category/chapter headers, not recipe titles
  if (text.includes(" | ")) return false;
  // Bullet-list items (ingredients or instruction steps) are never titles
  if (/^\s*[-•*]\s/.test(text)) return false;
  // Single-word non-title fragments
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) return false;
  return true;
}
```

### Impact analysis

The regex `/^\s*[-•*]\s/` matches lines starting with optional whitespace, then a bullet marker (`-`, `•`, or `*`), then a space. This eliminates:

| Candidate | Match | Effect |
|---|---|---|
| `- 2 jajka` | `- ` at start | **Filtered** — fixes Barszcz, Drożdżówki, etc. |
| `- Sól do smaku` | `- ` at start | **Filtered** — fixes Sernik, Oscypek, Grochówka |
| `- Salt to taste` | `- ` at start | **Filtered** — fixes Garlic Bruschetta, Spinach Dip, etc. |
| `- 100g butter` | `- ` at start | **Filtered** — fixes Blackberry Jam, Duck Confit |
| `- 100g butter - 100g butter` (2-line join) | `- ` at start | **Filtered** — fixes compound joins |
| `- Sól do smaku + - 2 jajka` (multi-join) | `- ` at start | **Filtered** — fixes Kielbasa, Zupa Żurawina |
| `BARSZCZ CZERWONY` | No match | Passes ✓ |
| `Pierogi Ruskie` | No match | Passes ✓ |

**Risk:** Extremely low. Recipe titles never start with `- ` or `• `. The only conceivable edge case is a title starting with `*` (e.g., an OCR artifact for a starred recipe), but `*` followed by a space is standard bullet syntax, not title formatting.

**Why this is placed before `looksLikeIngredient`:** The bullet check is O(1) regex and catches a superset of the ingredient lines that leak through `looksLikeIngredient`. Even if ingredient detection were perfect, bullet filtering is independently valuable as a structural signal.

---

## Change 2: Known Section Label Filter

**Priority:** Critical — fixes 1 failure directly (Mozzarella Sticks), provides defense-in-depth for Pattern 1

**Rationale:** Words like `INGREDIENTS`, `SKŁADNIKI`, `DIRECTIONS`, `INSTRUCTIONS`, `PRZYGOTOWANIE` are universal recipe section headers. They are never recipe titles. Filtering them prevents the `isSubHeader` guard from promoting a section label over the real title.

### Code change

**File:** `lib/text-classifier/title-extractor.ts`

Add a new constant and filter check:

```typescript
/**
 * Known recipe section labels — these are structural headers, not recipe titles.
 * Matched case-insensitively after trimming and stripping trailing punctuation (colon, period).
 */
const SECTION_LABELS = new Set([
  // English
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "variations", "variation",
  "garnish", "topping", "toppings", "frosting", "filling",
  "for the sauce", "for the filling", "for the topping", "for the dough",
  "for the crust", "for the frosting", "for the glaze",
  // Polish
  "składniki", "przygotowanie", "sposób przygotowania", "sposób wykonania",
  "wykonanie", "wskazówki", "podpowiedź", "warianty",
  "sos", "nadzienie", "polewa", "lukier", "ciasto",
]);

function isSectionLabel(text: string): boolean {
  // Strip trailing colon/period, normalize whitespace, lowercase
  const normalized = text.trim().replace(/[:.]$/, "").toLowerCase();
  return SECTION_LABELS.has(normalized);
}
```

Add to `passesHardFilters`:

```typescript
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  if (text.includes(" | ")) return false;
  if (/^\s*[-•*]\s/.test(text)) return false;
  if (isSectionLabel(text)) return false;  // NEW
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) return false;
  return true;
}
```

### Impact on Mozzarella Sticks

**Before:**
1. `INGREDIENTS` enters candidate pool, gets ALL_CAPS bonus
2. `MOZZARELLA STICKS` also enters pool
3. Multi-title guard: `allCapsSelected = [INGREDIENTS, MOZZARELLA STICKS]`, `sortedCaps[0] = INGREDIENTS`
4. `isSubHeader` demotes `MOZZARELLA STICKS` → result: `INGREDIENTS`

**After:**
1. `INGREDIENTS` → `isSectionLabel` = true → **filtered out**
2. `MOZZARELLA STICKS` enters pool, is the only ALL_CAPS candidate
3. Multi-title guard: `allCapsSelected.length === 1` → collapses to highest-scoring → `MOZZARELLA STICKS` ✓

### Impact on SKŁADNIKI-first documents (Barszcz, Kielbasa, etc.)

Even without Change 1 (bullet filter), removing `SKŁADNIKI` from the pool prevents it from triggering the multi-title guard. The real title is the sole ALL_CAPS survivor, so the guard collapses correctly. This is why Change 2 provides defense-in-depth for Pattern 1.

### Risk assessment

**False positive risk:** Could a recipe be named "Ingredients" or "Przygotowanie"? In theory yes, but in practice no — these are generic section labels. The set is conservative (common unambiguous labels only). Multi-word labels like "for the sauce" are included because they appear in cookbook sub-section headers and would never be a standalone recipe title.

**Note on trailing punctuation stripping:** Some OCR outputs produce `INGREDIENTS:` or `PRZYGOTOWANIE:` with a colon. The `replace(/[:.]$/, "")` ensures these match.

---

## Change 3: Expanded Ingredient Detection (Defense-in-Depth)

**Priority:** Medium — provides backup for edge cases where bullet filter doesn't apply (e.g., ingredient lines without bullet markers in some cookbook formats)

### 3a: Polish measurement units

**Before (lines 20–37):**
```typescript
const MEASUREMENT_PATTERNS = [
  "cup", "cups", "tbsp", "tsp", "tablespoon", "teaspoon",
  "oz", "lb", "gram", "grams", "kg", "ml", "liter",
  "pinch", "dash", "handful",
];
```

**After:**
```typescript
const MEASUREMENT_PATTERNS = [
  // English
  "cup", "cups", "tbsp", "tsp", "tablespoon", "teaspoon",
  "oz", "lb", "gram", "grams", "kg", "ml", "liter",
  "pinch", "dash", "handful",
  // Polish
  "łyżka", "łyżki", "łyżek",           // tablespoon(s)
  "łyżeczka", "łyżeczki", "łyżeczek",   // teaspoon(s)
  "szklanka", "szklanki", "szklanek",     // cup(s)
  "szczypta",                             // pinch
  "garść",                                // handful
  "opakowanie", "opakowania",             // package(s)
  "plasterek", "plasterki",              // slice(s)
];
```

### 3b: Compact metric notation

Add a regex check to `looksLikeIngredient` for patterns like `100g`, `50ml`, `250g`:

**Before (lines 67–70):**
```typescript
function looksLikeIngredient(line: string): boolean {
  const lowerLine = line.toLowerCase();
  return MEASUREMENT_PATTERNS.some((pattern) => lowerLine.includes(pattern));
}
```

**After:**
```typescript
function looksLikeIngredient(line: string): boolean {
  const lowerLine = line.toLowerCase();
  if (MEASUREMENT_PATTERNS.some((pattern) => lowerLine.includes(pattern))) return true;
  // Compact metric: "100g", "50ml", "250g" — digit immediately followed by g/ml/kg/l
  if (/\b\d+\s*(?:g|ml|kg|l)\b/i.test(line)) return true;
  // "to taste" / "do smaku" — qualitative ingredient with no unit
  if (/\bto taste\b/i.test(line) || /\bdo smaku\b/i.test(line)) return true;
  return false;
}
```

### Impact

| Line | Before | After |
|---|---|---|
| `100g butter` | Not detected (no `gram` keyword) | Detected via `\b\d+\s*g\b` |
| `1 łyżka cukru` | Not detected | Detected via `łyżka` in MEASUREMENT_PATTERNS |
| `Salt to taste` | Not detected | Detected via `\bto taste\b` |
| `Sól do smaku` | Not detected | Detected via `\bdo smaku\b` |
| `50ml mleka` | Not detected | Detected via `\b\d+\s*ml\b` |

### Risk: false positives on recipe titles

Could `\b\d+\s*g\b` match a legitimate title? Only if a title contains a number followed by `g`. Examples:
- "5g Internet Bread" — starts with digit → already rejected by `startsWithNumber`
- "Bread 500g" — would be matched, but no real recipe title ends with a weight

Could `\bto taste\b` match a title? "To Taste" as a recipe name is theoretically possible but not seen in any test corpus. The `\b` word boundaries prevent partial matches like "tomato" or "toasted".

---

## Change 4: Harden `startsWithNumber` for Bullet-Stripped Lines (Optional)

**Priority:** Low — fully covered by Change 1, but provides an additional safety net

Currently `startsWithNumber` only checks `/^\s*\d/`. After the bullet filter (Change 1), this is adequate. But as defense-in-depth, extend it to also catch digit-first content after a bullet marker:

**Before:**
```typescript
function startsWithNumber(line: string): boolean {
  return /^\s*\d/.test(line);
}
```

**After:**
```typescript
function startsWithNumber(line: string): boolean {
  // Match lines starting with a digit, or bullet-then-digit (e.g., "- 2 jajka")
  return /^\s*(?:[-•*]\s*)?\d/.test(line);
}
```

This catches `- 2 jajka` (digit after bullet) even if the bullet filter were somehow bypassed. Low priority because Change 1 already eliminates all bullet lines.

---

## Expected Impact Summary

| Pattern | Failures | Fix | Confidence |
|---|---|---|---|
| Ingredient bullet lines | 12 | Change 1 (bullet filter) | **Very high** — structural signal, no false-positive risk |
| `INGREDIENTS` section label | 1 | Change 2 (section label filter) | **Very high** — universal convention |
| Compound ingredient joins | 4 | Change 1 (bullet filter) eliminates both component lines | **Very high** — upstream fix prevents downstream failure |
| **Total** | **17** | | |

### Regression risk

All changes are **additive filters** in `passesHardFilters` — they only remove candidates that should never have entered the pool. No scoring logic, threshold computation, dedup, or multi-title guard behavior is modified. Existing passing tests are unaffected because:

1. Real recipe titles never start with `- ` / `• ` / `* `
2. Real recipe titles are never section labels like `INGREDIENTS` or `SKŁADNIKI`
3. Real recipe titles don't contain compact metric quantities or "to taste"/"do smaku"
4. The 80+ currently-passing test cases have none of these patterns as titles

### Performance impact

Zero additional embedding calls. All new checks are O(1) regex or Set lookups executed during candidate generation — well within the 10-second mobile budget. The candidate pool will be *smaller* (fewer false candidates), so embedding calls may actually decrease.

---

## Implementation Order

1. **Change 1** (bullet filter) — single line in `passesHardFilters`, maximum impact
2. **Change 2** (section labels) — new constant + function + one line in `passesHardFilters`
3. **Change 3** (expanded ingredients) — extend `MEASUREMENT_PATTERNS` + add regex to `looksLikeIngredient`
4. **Change 4** (optional `startsWithNumber` hardening) — only if testing reveals edge cases not covered by Changes 1–3
