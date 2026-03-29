---
schema: 1
id: 25
title: "[P3.2] Wire bbox extraction into text classifier"
status: done
created: "2026-03-29T19:40:48.684Z"
updated: "2026-03-29T20:30:21.202Z"
tags:
  - phase3
  - integration
  - medium-priority
  - small
dependencies:
  - 23
  - 24
---
## Description
Use bbox-based title extraction in index.native.ts when observations are available, with heuristic+embeddings fallback

## Details
Wire bbox-based title extraction into the text classifier when bounding box data is available.

In lib/text-classifier/index.native.ts, before existing title extraction:

```typescript
import { extractTitleFromBboxes } from "./title-extractor-bbox";

// Inside classifyText() or equivalent, before existing title extraction:
if (ocrResult.observations && ocrResult.observations.length > 0) {
  const bboxTitle = extractTitleFromBboxes({
    image: "native",
    observations: ocrResult.observations.map((obs) => ({
      text: obs.text,
      confidence: obs.confidence,
      bbox: obs.bounds, // TextObservation uses "bounds", BboxObservation uses "bbox"
    })),
  });
  if (bboxTitle) {
    return { title: bboxTitle, suggestions, processingTimeMs };
  }
}
// Existing heuristic + embeddings fallback continues below
```

Note the field mapping: native TextObservation.bounds → BboxObservation.bbox

Fallback behavior:
- observations undefined → skip bbox extraction, use existing heuristic+embeddings
- observations empty → skip bbox extraction
- extractTitleFromBboxes returns undefined → fall through to existing extraction
- Web platform → observations always undefined → always uses heuristic+embeddings

## Validation
Bbox extraction tried first when observations available. Falls back to heuristic+embeddings when observations undefined or bbox returns undefined. No behavior change on web. Field mapping: TextObservation.bounds → BboxObservation.bbox.