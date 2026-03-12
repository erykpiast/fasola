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

Use MiniLM embeddings (already in the pipeline) to semantically score candidate lines instead of heuristic word lists. Accuracy is the priority; async and added latency are acceptable.

## Relevant Files

- **`lib/text-classifier/title-extractor.ts`** — Current heuristic title extraction. Main file to change.
- **`lib/text-classifier/index.web.ts`** — Web classifier entry; calls `extractTitle()` synchronously then classifies tags via worker.
- **`lib/text-classifier/index.native.ts`** — Native classifier entry; same pattern, calls `extractTitle()` then classifies via ExecuTorch.
- **`lib/text-classifier/embeddings.ts`** — Shared `cosineSimilarity` + embedding classification utilities. Reused for title scoring.
- **`lib/text-classifier/worker.ts`** — Web Worker running Transformers.js. Title extraction with embeddings must run here (embedder only exists in worker).
- **`lib/text-classifier/cli.ts`** — CLI testing tool for validation.
- **`features/background-processing/context/BackgroundProcessingContext.tsx:178`** — Calls `classifyText(ocrResult.text)`, which internally calls `extractTitle`.

## Approach: Semantic Scoring via Dependency Injection

Add `extractTitleWithEmbeddings(text, embed)` that accepts an embedder callback. Each platform injects its own:
- **Native**: `EmbeddingsManager.forward()` (ExecuTorch)
- **Web**: Embedder inside the worker (Transformers.js)
- **CLI**: `@huggingface/transformers` pipeline

The existing sync `extractTitle` stays as fallback for TF-IDF mode and error cases.

### Scoring Algorithm

1. Split text into lines, apply only hard filters: length 3-80, not ingredient measurement, not starting with digit. **Do NOT filter all-caps lines** (recipe titles are often styled in all caps).
2. Build candidates from **single lines AND multi-line groups (2-3 consecutive lines joined with space)**. Recipe titles in cookbooks often wrap across lines in OCR output (e.g., "Kurczak w sosie\nśmietanowym z pieczarkami"). For each position, generate up to 3 candidates: the line alone, the line + next line, and the line + next 2 lines. Apply the same hard filters (length, ingredient, number) to the joined result. Deduplicate by skipping multi-line candidates whose joined text exceeds 80 chars.
3. Take first ~15 candidates (from the first ~10 line positions; titles are near the top).
4. Compute reference embeddings for two constant phrases (cached after first call):
   - `TITLE_REFERENCE` = "recipe name, dish title, name of the food, nazwa przepisu, nazwa dania"
   - `HEADER_REFERENCE` = "ingredients list, cooking directions, section heading, składniki, przygotowanie, sposób wykonania"
5. For each candidate, compute embedding and score: `cosineSimilarity(candidate, titleRef) - cosineSimilarity(candidate, headerRef)` + small position bonus.
6. Return highest-scoring candidate.

## Steps

### 1. `lib/text-classifier/title-extractor.ts` — Core logic

- Export `EmbedFn = (text: string) => Promise<Array<number>>`
- Export `extractTitleWithEmbeddings(text: string, embed: EmbedFn): Promise<string | undefined>`
- Import `cosineSimilarity` from `./embeddings`
- Build candidates: for each line position (up to first ~10 non-empty lines), generate single-line, 2-line, and 3-line joined candidates. Apply hard filters to joined text. Cap at ~15 total candidates.
- Cache reference embeddings at module level (saves 2 embed calls after first invocation)
- Keep existing `extractTitle` unchanged as sync fallback

### 2. `lib/text-classifier/index.native.ts` — Native platform

- Add `static async forward(text: string): Promise<Array<number>>` to `EmbeddingsManager`
- In `classifyWithEmbeddingsMethod`: call `extractTitleWithEmbeddings(text, EmbeddingsManager.forward.bind(EmbeddingsManager))` instead of `extractTitle(text)`
- Keep sync `extractTitle` in catch blocks and TF-IDF path

### 3. `lib/text-classifier/worker.ts` — Web worker

- Import `extractTitleWithEmbeddings`
- In `runClassification`, build `embed` callback from the existing embedder singleton
- Call `extractTitleWithEmbeddings(text, embed)` and include `title` in the response message
- Add `title?: string` to `ClassificationResponse`

### 4. `lib/text-classifier/index.web.ts` — Web entry

- Add `title?: string` to `ClassificationResponse` interface
- In `worker.onmessage`, read `response.title` from worker message (currently hardcoded to `undefined`)
- In `classifyText` embeddings path, use title from worker result
- Keep sync `extractTitle` for TF-IDF and worker-unavailable fallbacks

### 5. `lib/text-classifier/cli.ts` — CLI testing

- Use `extractTitleWithEmbeddings` in embeddings/both modes
- In comparison mode, show both heuristic and semantic titles

### 6. `lib/text-classifier/title-extractor.test.ts` — Tests

Test `extractTitleWithEmbeddings` with mock embed function returning predictable vectors:
- Section header before title (PL/EN): `"Składniki\nPierogi Ruskie\n..."` → `"Pierogi Ruskie"`
- All-caps title preserved: `"CHOCOLATE CAKE\nIngredients\n..."` → `"CHOCOLATE CAKE"`
- Numbered lines skipped: `"12\nApple Pie\n..."` → `"Apple Pie"`
- **Multi-line title**: `"Kurczak w sosie\nśmietanowym z pieczarkami\nSkładniki\n..."` → `"Kurczak w sosie śmietanowym z pieczarkami"` (2-line join scores higher than either line alone)
- **3-line title**: title split across 3 OCR lines is correctly joined
- **Multi-line not over-greedy**: doesn't join a title line with a following section header
- Regression tests for sync `extractTitle`

## Testing

1. **Unit tests**: `npx vitest run lib/text-classifier/title-extractor.test.ts`
2. **CLI testing**: `npx tsx lib/text-classifier/cli.ts sample.txt --method=both` — compare old heuristic vs new semantic titles
3. **Manual E2E**: Import a recipe photo where title was previously wrong, verify correct extraction
4. **Regression**: Recipes where the title IS the first line still work (position bonus handles this)
