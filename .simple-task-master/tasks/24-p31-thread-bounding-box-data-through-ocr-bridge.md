---
schema: 1
id: 24
title: "[P3.1] Thread bounding box data through OCR bridge"
status: done
created: "2026-03-29T19:40:37.186Z"
updated: "2026-03-29T20:28:30.489Z"
tags:
  - phase3
  - integration
  - medium-priority
  - small
dependencies:
  - 23
---
## Description
Extend OcrResult with observations field and switch native OCR bridge to extractTextWithBounds()

## Details
Thread bounding box data through OCR bridge layer so the app can use bbox-based title extraction.

The native text-extractor module already has types and extractTextWithBounds():
- modules/text-extractor/src/types.ts defines BoundingBox and TextObservation
- modules/text-extractor/index.ts exports extractTextWithBounds(uri)

Changes required:

1. lib/photo-processor/ocr-bridge/types.ts — add observations field:
```typescript
import type { TextObservation } from "text-extractor";

export interface OcrResult {
  success: boolean;
  text?: string;
  textBlocks?: Array<string>;
  confidence?: number;
  observations?: Array<TextObservation>;  // NEW
  error?: string;
}
```

2. lib/photo-processor/ocr-bridge/index.native.ts — switch to extractTextWithBounds:
Replace: const textBlocks = await extractTextFromImage(imageUri);
With:
```typescript
import { extractTextWithBounds } from "text-extractor";

const observations = await extractTextWithBounds(imageUri);
const textBlocks = observations.map((obs) => obs.text);
// Include observations in returned OcrResult
```

3. Web platform (index.web.ts) — no changes. observations stays undefined.

Note the field name difference: TextObservation uses "bounds", BboxObservation uses "bbox". The mapping happens in the classifier (Task 3.2), not here.

## Validation
OcrResult type includes observations?: Array<TextObservation>. Native OCR bridge populates observations. Web OCR bridge unchanged. Existing text extraction behavior preserved. App compiles.