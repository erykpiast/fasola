---
schema: 1
id: 26
title: "[P3.3] Add unit tests for bbox title extraction"
status: done
created: "2026-03-29T19:41:05.676Z"
updated: "2026-03-29T20:27:46.946Z"
tags:
  - phase3
  - testing
  - medium-priority
  - medium
dependencies:
  - 23
---
## Description
Write vitest unit tests for normForMatch, titlesMatch, and extractTitleFromBboxes with synthetic observations

## Details
Write unit tests for key functions in the bbox title extraction module.

File: lib/text-classifier/__tests__/title-extractor-bbox.test.ts

Tests to write:

describe("normForMatch") — Purpose: Verify normalization handles Polish diacritics and OCR artifacts
  - strips Polish diacritics: "Żurek" → "ZUREK", "Łosoś" → "LOSOS"
  - normalizes OCR digit-letter confusion: "Z0PA" → "ZOPA", "P1EROG1" → "PIEROGI"
  - handles pipe-as-I substitution: "P|EROG|" → "PIEROGI"
  - collapses whitespace and strips quotes: '  „ŻUREK"  ' → "ZUREK"
  - normalizes hyphens/underscores to spaces: "SLOW-ROASTED" → "SLOW ROASTED"

describe("titlesMatch") — Purpose: Verify multi-level fuzzy matching handles real OCR errors
  - exact match: titlesMatch("ŻUREK", "ŻUREK") → true
  - diacritic differences: titlesMatch("ZUREK", "ŻUREK") → true
  - OCR digit confusion: titlesMatch("P1EROG1", "PIEROGI") → true
  - reordered words: titlesMatch("PIE BLUEBERRY", "BLUEBERRY PIE") → true
  - merged words: titlesMatch("SHORTBREAD", "SHORT BREAD") → true
  - suffix/prefix OCR cropping: titlesMatch("ZONE", "WĘDZONE") → true
  - compound titles: titlesMatch("ŻUREK BARSZCZ", "ŻUREK+BARSZCZ") → true
  - false for different titles: titlesMatch("ŻUREK", "PIEROGI") → false
  - false for undefined: titlesMatch(undefined, "ŻUREK") → false

describe("extractTitleFromBboxes") — Purpose: Verify full pipeline with synthetic observations
  - rejects ingredient measurements (single obs "200 g mąki" → undefined)
  - extracts clear title from simple layout (ŻUREK at top, Składniki + ingredients below → "ŻUREK")

Import: { normForMatch, titlesMatch, extractTitleFromBboxes } from "../title-extractor-bbox"
Use vitest: import { describe, it, expect } from "vitest"
Run: pnpm test -- "lib/text-classifier/__tests__/title-extractor-bbox.test.ts"

## Validation
Tests cover normalization (5 cases), matching (9 cases), extraction (2 cases). Tests can fail to reveal real issues. All tests pass. Each describe block has a purpose comment.