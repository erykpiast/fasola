import {
  isValidTag,
  normalizeTag,
  parseTags,
  validateTags,
  isUrl,
  extractHostname,
} from "../recipeValidation";

describe("recipeValidation", () => {
  describe("isValidTag", () => {
    it("returns true for valid tags", () => {
      expect(isValidTag("#food")).toBe(true);
      expect(isValidTag("#italian")).toBe(true);
      expect(isValidTag("#pasta_recipe")).toBe(true);
    });

    it("returns false for tags without # prefix", () => {
      expect(isValidTag("food")).toBe(false);
    });

    it("returns false for tags with spaces", () => {
      expect(isValidTag("#food recipe")).toBe(false);
      expect(isValidTag("# food")).toBe(false);
    });
  });

  describe("normalizeTag", () => {
    it("adds # prefix if missing", () => {
      expect(normalizeTag("food")).toBe("#food");
      expect(normalizeTag("italian")).toBe("#italian");
    });

    it("keeps # prefix if present", () => {
      expect(normalizeTag("#food")).toBe("#food");
    });

    it("trims whitespace", () => {
      expect(normalizeTag("  food  ")).toBe("#food");
      expect(normalizeTag("  #food  ")).toBe("#food");
    });

    it("returns null for tags with spaces", () => {
      expect(normalizeTag("food recipe")).toBe(null);
      expect(normalizeTag("#food recipe")).toBe(null);
    });

    it("returns null for empty string", () => {
      expect(normalizeTag("")).toBe(null);
      expect(normalizeTag("   ")).toBe(null);
    });
  });

  describe("parseTags", () => {
    it("parses comma-separated tags", () => {
      expect(parseTags("food,italian,pasta")).toEqual([
        "#food",
        "#italian",
        "#pasta",
      ]);
    });

    it("parses space-separated tags", () => {
      expect(parseTags("food italian pasta")).toEqual([
        "#food",
        "#italian",
        "#pasta",
      ]);
    });

    it("parses mixed comma and space separated tags", () => {
      expect(parseTags("food, italian pasta")).toEqual([
        "#food",
        "#italian",
        "#pasta",
      ]);
    });

    it("adds # prefix to tags without it", () => {
      expect(parseTags("food #italian pasta")).toEqual([
        "#food",
        "#italian",
        "#pasta",
      ]);
    });

    it("filters out tags with spaces", () => {
      expect(parseTags("food, invalid tag, pasta")).toEqual([
        "#food",
        "#pasta",
      ]);
    });

    it("returns empty array for empty string", () => {
      expect(parseTags("")).toEqual([]);
      expect(parseTags("   ")).toEqual([]);
    });

    it("handles multiple spaces and commas", () => {
      expect(parseTags("food,,  italian  ,, pasta")).toEqual([
        "#food",
        "#italian",
        "#pasta",
      ]);
    });
  });

  describe("validateTags", () => {
    it("returns true for valid tags array", () => {
      expect(validateTags(["#food", "#italian", "#pasta"])).toBe(true);
    });

    it("returns false if any tag is missing # prefix", () => {
      expect(validateTags(["#food", "italian", "#pasta"])).toBe(false);
    });

    it("returns false if any tag contains spaces", () => {
      expect(validateTags(["#food", "#italian recipe", "#pasta"])).toBe(false);
    });

    it("returns true for empty array", () => {
      expect(validateTags([])).toBe(true);
    });
  });

  describe("isUrl", () => {
    it("returns true for http URLs", () => {
      expect(isUrl("http://example.com")).toBe(true);
      expect(isUrl("http://example.com/recipe")).toBe(true);
    });

    it("returns true for https URLs", () => {
      expect(isUrl("https://example.com")).toBe(true);
      expect(isUrl("https://example.com/recipe")).toBe(true);
    });

    it("returns false for non-URL strings", () => {
      expect(isUrl("example.com")).toBe(false);
      expect(isUrl("The Italian Cookbook")).toBe(false);
      expect(isUrl("ftp://example.com")).toBe(false);
    });
  });

  describe("extractHostname", () => {
    it("extracts hostname from http URL", () => {
      expect(extractHostname("http://example.com/recipe")).toBe("example.com");
    });

    it("extracts hostname from https URL", () => {
      expect(extractHostname("https://example.com/recipe")).toBe(
        "example.com",
      );
    });

    it("extracts hostname with subdomain", () => {
      expect(extractHostname("https://www.example.com/recipe")).toBe(
        "www.example.com",
      );
    });

    it("returns null for non-URL strings", () => {
      expect(extractHostname("example.com")).toBe(null);
      expect(extractHostname("The Italian Cookbook")).toBe(null);
    });

    it("returns null for invalid URLs", () => {
      expect(extractHostname("not a url")).toBe(null);
    });
  });
});
