---
schema: 1
id: 5
title: Improve title selection from the recognized text.
status: planned
created: "2026-03-09T22:53:33.343Z"
updated: "2026-03-09T22:53:33.343Z"
tags:
  - bug
dependencies: []
---

Today it takes the first line or something. It should interpret the recognized text somehow contextually and recognize the title instead of subheadings like "Ingredients".

## Implementation Plan

I now have a complete understanding. Let me write the implementation plan.

## Relevant Files

- **`lib/text-classifier/title-extractor.ts`** — Current heuristic title extraction. Takes the first line that passes basic filters (3-50 chars, not an ingredient, not all-caps, not starting with a number). This is the main file to change.
- **`lib/text-classifier/index.web.ts`** — Web classifier entry; calls `extractTitle()` synchronously then classifies tags via worker.
- **`lib/text-classifier/index.native.ts`** — Native classifier entry; same pattern, calls `extractTitle()` then classifies.
- **`lib/text-classifier/embeddings.ts`** — Shared cosine similarity + embedding classification utilities. Could be reused for title scoring.
- **`lib/text-classifier/labels.ts`** — Label descriptions for seasons, cuisines, categories. Contains section-header-like keywords that could help identify non-title lines.
- **`lib/text-classifier/cli.ts`** — CLI testing tool; prints extracted title. Useful for validation.
- **`features/background-processing/context/BackgroundProcessingContext.tsx:178`** — Calls `classifyText(ocrResult.text)`, which internally calls `extractTitle`. The full OCR text (all blocks joined by `\n`) is passed in.
- **`lib/photo-processor/ocr-bridge/types.ts`** — `OcrResult` with `text` and `textBlocks` fields.

## Analysis

**Current behavior**: `extractTitle()` iterates lines top-to-bottom and returns the *first* line that is 3-50 characters, not an ingredient measurement, not all-caps, and doesn't start with a number. This is a naive "first valid line" approach.

**Why it fails**: Recipe photos from cookbooks often have structural text above the actual title — section headers like "Składniki" (Ingredients), "Przepis" (Recipe), "Rozdział 3" (Chapter 3), subheadings like "Dania główne" (Main courses), or page numbers. The current filter only skips all-caps lines and numbered lines, so mixed-case headers like "Ingredients" or "Składniki" pass through and get selected as the title.

**What needs to change**: The extractor needs to distinguish between **section headers/structural text** and **actual recipe titles**. Two complementary approaches:

1. **Negative filtering** — Maintain a list of common recipe section headers (in English and Polish) to skip, similar to how ingredients are already filtered.
2. **Semantic scoring** — Since MiniLM embeddings are already available in the pipeline, use them to score candidate lines against a "recipe title" description and pick the best match. However, this would make title extraction async and add latency.

Given the app already has the embeddings infrastructure but title extraction is currently synchronous, the pragmatic approach is to **strengthen the heuristic filtering** with section-header detection and a simple scoring system, keeping it synchronous and fast.

## Steps

### 1. Add section header detection to `title-extractor.ts`

Add a list of common recipe section headers in both English and Polish that should be skipped:

```typescript
const SECTION_HEADERS = [
  // English
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "serves", "serving", "servings",
  "yield", "cook time", "prep time", "total time", "nutrition",
  "equipment", "introduction", "overview", "variations", "storage",
  // Polish
  "składniki", "przygotowanie", "sposób przygotowania", "wykonanie",
  "sposób wykonania", "porady", "wskazówki", "porcje", "czas przygotowania",
  "czas pieczenia", "dodatki", "na porcje", "stopień trudności",
];
```

Add a `looksLikeSectionHeader(line: string): boolean` function that checks if the line (lowercased, trimmed) matches or closely matches any section header.

### 2. Add scoring heuristics instead of first-match

Replace the "return first valid line" logic with a **candidate scoring system**:

```typescript
export function extractTitle(text: string): string | undefined {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  const candidates: Array<{ line: string; score: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Hard filters — skip these entirely
    if (line.length < 3 || line.length > 60) continue;
    if (looksLikeIngredient(line)) continue;
    if (startsWithNumber(line)) continue;
    if (looksLikeSectionHeader(line)) continue;
    
    // Score the candidate
    let score = 0;
    
    // Prefer lines near the top (position bonus, decaying)
    score += Math.max(0, 10 - i * 2);
    
    // Prefer title-case or sentence-case over all-caps
    if (isAllCaps(line)) score -= 5;
    else if (isTitleCase(line)) score += 3;
    
    // Prefer moderate length (typical title: 10-40 chars)
    if (line.length >= 10 && line.length <= 40) score += 2;
    
    // Penalize lines that end with common non-title punctuation
    if (line.endsWith(".") || line.endsWith(",") || line.endsWith(":")) score -= 2;
    
    // Penalize lines with too many words (likely a paragraph, not a title)
    const wordCount = line.split(/\s+/).length;
    if (wordCount > 8) score -= 3;
    
    // Bonus if preceded by empty line or is first non-empty line (standalone heading)
    if (i === 0 || lines[i - 1]?.length === 0) score += 2;

    candidates.push({ line, score });
  }

  if (candidates.length === 0) return undefined;
  
  // Return highest-scoring candidate
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].line;
}
```

### 3. Add `isTitleCase` helper

```typescript
function isTitleCase(line: string): boolean {
  const words = line.split(/\s+/);
  if (words.length === 0) return false;
  // First word starts with uppercase
  return /^[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸŻŹĆŃÓŁĘĄŚ]/u.test(words[0]);
}
```

### 4. Relax the length upper bound

Change from 50 to 60 characters to accommodate longer recipe titles (e.g., "Kurczak w sosie śmietanowym z pieczarkami").

### 5. Add unit tests

Create `lib/text-classifier/title-extractor.test.ts` with cases covering:

- **Basic title at top**: `"Spaghetti Carbonara\nIngredients\n..."` → `"Spaghetti Carbonara"`
- **Section header before title**: `"Składniki\nPierogi Ruskie\n200g mąki..."` → `"Pierogi Ruskie"` (not "Składniki")
- **All-caps header skipped**: `"INGREDIENTS\nChocolate Cake\n..."` → `"Chocolate Cake"`
- **Subheading before title**: `"Dania główne\nRosół z makaronem\n..."` → `"Rosół z makaronem"`
- **Numbered line skipped**: `"12\nApple Pie\n1 cup flour..."` → `"Apple Pie"`
- **Title after noise**: `"Page 42\nChapter 3\nTomato Soup\n..."` → `"Tomato Soup"`
- **Polish section headers**: `"Przygotowanie\nBarszcz czerwony\n..."` → `"Barszcz czerwony"`

### 6. Update CLI output format

In `cli.ts`, enhance the title output to also show runner-up candidates for debugging, by exporting a `extractTitleCandidates()` function that returns scored candidates.

## Testing

1. **Unit tests**: Run `npx jest lib/text-classifier/title-extractor.test.ts` (or vitest equivalent) with the test cases above.
2. **CLI testing**: Use `npx tsx lib/text-classifier/cli.ts` with real OCR text samples from recipe photos. Compare old vs. new title extraction.
3. **Manual E2E**: Import a recipe photo where the title was previously extracted incorrectly (e.g., one where "Ingredients" or "Składniki" was picked as the title). Verify the correct title is now extracted after background processing completes.
4. **Regression**: Test with recipes where the title IS the first line — ensure they still work correctly (the position bonus should handle this).
