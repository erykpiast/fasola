# Iteration 25 Feedback

## Failure count: 1 real, 0 generated

---

## Pattern: OCR artifact mistaken for a title component

**Affects:** Real files only

### What happened

- **Expected:** `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS`
- **Extracted:** `DAT FLATBREADS + FINNISH MILK FLATBREADS`

The extractor correctly identified that the document contains two joined recipe titles (compound `+` title). However, it picked the wrong two candidates.

### Root cause

The input contains a visually prominent all-caps string `DAT FLATBREADS` early in the text (line 4). This is an OCR corruption artifact — likely the tail end of a partially-captured or misread title from a preceding page or section. Because it is all-caps and structurally title-like, the extractor treated it as a valid title candidate.

Meanwhile, the second correct title `FINNISH POTATO FLATBREADS` either appears later in the document (outside the lines shown) or was heavily corrupted by OCR and became unrecognizable. The extractor substituted the nearby OCR artifact `DAT FLATBREADS` in its place.

`FINNISH MILK FLATBREADS` was correctly extracted as one component, confirming the extractor found it in the body of the text.

### Why this is hard

OCR artifacts that happen to be all-caps and short (2–3 words) are indistinguishable from real titles by surface-level heuristics. The string `DAT FLATBREADS` looks like a plausible recipe title fragment.

### Mitigation directions

- Prefer title candidates that share vocabulary with other text in the document (e.g., `FINNISH`, `POTATO`) over orphaned all-caps strings with no surrounding context.
- When assembling a compound `+` title, require both components to have corroborating evidence in the document (e.g., a description or ingredient list referencing the same subject).
- Penalise candidates that appear abruptly at the very start of the recognised text with no leading context — these are more likely to be carry-over artifacts from a previous page.
