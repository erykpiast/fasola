import { describe, it, expect } from "vitest";
import {
  normForMatch,
  titlesMatch,
  extractTitleFromBboxes,
} from "../title-extractor-bbox";

// Purpose: Verify normalization handles Polish diacritics and OCR artifacts correctly
describe("normForMatch", () => {
  it("strips Polish diacritics", () => {
    expect(normForMatch("Żurek")).toBe("ZUREK");
    expect(normForMatch("Łosoś")).toBe("LOSOS");
    expect(normForMatch("ćma")).toBe("CMA");
  });

  it("normalizes OCR digit-letter confusion", () => {
    expect(normForMatch("Z0PA")).toBe("ZOPA");
    expect(normForMatch("P1EROG1")).toBe("PIEROGI");
  });

  it("handles pipe-as-I substitution", () => {
    expect(normForMatch("P|EROG|")).toBe("PIEROGI");
  });

  it("collapses whitespace and strips quotes", () => {
    expect(normForMatch("  \u201EŻUREK\u201D  ")).toBe("ZUREK");
  });

  it("normalizes hyphens and underscores to spaces", () => {
    expect(normForMatch("SLOW-ROASTED")).toBe("SLOW ROASTED");
  });
});

// Purpose: Verify multi-level fuzzy matching handles real OCR errors
describe("titlesMatch", () => {
  it("matches exact titles", () => {
    expect(titlesMatch("ŻUREK", "ŻUREK")).toBe(true);
  });

  it("matches despite diacritic differences", () => {
    expect(titlesMatch("ZUREK", "ŻUREK")).toBe(true);
  });

  it("matches with OCR digit confusion", () => {
    expect(titlesMatch("P1EROG1", "PIEROGI")).toBe(true);
  });

  it("matches reordered words", () => {
    expect(titlesMatch("PIE BLUEBERRY", "BLUEBERRY PIE")).toBe(true);
  });

  it("matches merged words (SHORT BREAD → SHORTBREAD)", () => {
    expect(titlesMatch("SHORTBREAD", "SHORT BREAD")).toBe(true);
  });

  it("matches with suffix/prefix OCR cropping", () => {
    expect(titlesMatch("ZONE", "WĘDZONE")).toBe(true);
  });

  it("handles compound titles with + separator", () => {
    expect(titlesMatch("ŻUREK BARSZCZ", "ŻUREK+BARSZCZ")).toBe(true);
  });

  it("returns false for completely different titles", () => {
    expect(titlesMatch("ŻUREK", "PIEROGI")).toBe(false);
  });

  it("returns false for undefined extracted", () => {
    expect(titlesMatch(undefined, "ŻUREK")).toBe(false);
  });

  it("rejects title + ingredient list (precision gate)", () => {
    expect(
      titlesMatch(
        "Sałatka z tofu DUBU-SALAD Ta lekka sałatka jest idealnym dodatkiem do koreańskich aperitifów",
        "Sałatka z tofu+DUBU-SALAD",
      ),
    ).toBe(false);
  });

  it("allows title with minor OCR extras (precision gate)", () => {
    expect(
      titlesMatch("BLUEBERRY PIE FRESH BAKED", "BLUEBERRY PIE"),
    ).toBe(true);
  });

  it("rejects title + body text (precision gate)", () => {
    expect(
      titlesMatch(
        "WAFFLES Combine the milk and butter in a pan and heat Heat your waffle iron to proper working temper",
        "WAFFLES",
      ),
    ).toBe(false);
  });

  it("accepts at max allowed word count (precision boundary)", () => {
    // 2 expected words → max(4, 6) = 6 allowed; 6 extracted = pass
    expect(
      titlesMatch("BLUEBERRY PIE golden crust top served", "BLUEBERRY PIE"),
    ).toBe(true);
  });

  it("rejects one word over max allowed (precision boundary)", () => {
    // 2 expected words → max(4, 6) = 6 allowed; 7 extracted = fail
    expect(
      titlesMatch(
        "BLUEBERRY PIE with a nice golden crust",
        "BLUEBERRY PIE",
      ),
    ).toBe(false);
  });

  it("precision gate applies multiplicative branch for longer titles", () => {
    // 5 expected words → max(10, 9) = 10 allowed
    const title = "SLOW ROASTED LAMB WITH HERBS";
    const extracted = title + " ONE TWO THREE FOUR FIVE";
    expect(titlesMatch(extracted, title)).toBe(true); // 10 words = pass
    expect(titlesMatch(extracted + " SIX", title)).toBe(false); // 11 = fail
  });

  it("hyphen normalization affects expected word count", () => {
    // "DUBU-SALAD" normalizes to "DUBU SALAD" = 2 words
    // max(4, 6) = 6 allowed
    expect(titlesMatch("DUBU SALAD TASTY", "DUBU-SALAD")).toBe(true);
    expect(
      titlesMatch("DUBU SALAD TASTY ONE EXTRA TWO MORE", "DUBU-SALAD"),
    ).toBe(false);
  });
});

// Purpose: Verify title validation rejects non-title content
describe("extractTitleFromBboxes", () => {
  it("rejects ingredient measurements", () => {
    const result = extractTitleFromBboxes([
      {
        text: "200 g mąki",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.08 },
      },
    ]);
    expect(result).toBeUndefined();
  });

  it("extracts a clear title from simple layout", () => {
    const result = extractTitleFromBboxes([
      {
        text: "ŻUREK",
        confidence: 0.99,
        bbox: { x: 0.15, y: 0.08, width: 0.7, height: 0.05 },
      },
      {
        text: "Składniki",
        confidence: 0.95,
        bbox: { x: 0.1, y: 0.25, width: 0.3, height: 0.02 },
      },
      {
        text: "200 g mąki",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.3, width: 0.4, height: 0.02 },
      },
      {
        text: "100 ml wody",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.34, width: 0.4, height: 0.02 },
      },
    ]);
    expect(result).toBe("ŻUREK");
  });

  it("returns undefined for empty observations", () => {
    expect(extractTitleFromBboxes([])).toBeUndefined();
  });

  it("strips trailing ingredients from title region", () => {
    const result = extractTitleFromBboxes([
      {
        text: "ŻUREK",
        confidence: 0.99,
        bbox: { x: 0.1, y: 0.05, width: 0.6, height: 0.06 },
      },
      {
        text: "200 g mąki",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.07, width: 0.5, height: 0.05 },
      },
    ]);
    expect(result).toBe("ŻUREK");
  });

  it("extracts leading title from region with body text", () => {
    const result = extractTitleFromBboxes([
      {
        text: "LASAGNE",
        confidence: 0.99,
        bbox: { x: 0.1, y: 0.05, width: 0.5, height: 0.06 },
      },
      {
        text: "Combine flour eggs and mix until smooth then rest",
        confidence: 0.95,
        bbox: { x: 0.1, y: 0.12, width: 0.7, height: 0.02 },
      },
      {
        text: "for thirty minutes before rolling out the dough",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.15, width: 0.7, height: 0.02 },
      },
    ]);
    expect(result).toBe("LASAGNE");
  });

  it("rejects section labels as titles", () => {
    const result = extractTitleFromBboxes([
      {
        text: "Ingredients",
        confidence: 0.99,
        bbox: { x: 0.1, y: 0.05, width: 0.4, height: 0.06 },
      },
      {
        text: "200 g flour",
        confidence: 0.9,
        bbox: { x: 0.1, y: 0.15, width: 0.4, height: 0.02 },
      },
    ]);
    expect(result).toBeUndefined();
  });
});
