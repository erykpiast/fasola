import {
  extractTitle,
  extractTitleWithEmbeddings,
  _resetEmbeddingCacheForTests,
} from "../title-extractor";

/**
 * Creates a mock embed function that returns predictable vectors.
 * Words matching titleWords get a vector pointing "toward titles",
 * words matching headerWords get a vector pointing "toward headers",
 * and everything else gets a neutral vector.
 */
function createMockEmbed(
  titleWords: Array<string>,
  headerWords: Array<string>
): (text: string) => Promise<Array<number>> {
  // Reference phrases from the module
  const TITLE_REF =
    "recipe name, dish title, name of the food, nazwa przepisu, nazwa dania";
  const HEADER_REF =
    "ingredients list, cooking directions, section heading, składniki, przygotowanie, sposób wykonania";
  const NOISE_REF =
    "page number, table of contents, book footer, garbled text";

  return async (text: string): Promise<Array<number>> => {
    const lower = text.toLowerCase();

    // Title reference → unit vector in dimension 0
    if (lower === TITLE_REF.toLowerCase()) {
      return [1, 0, 0];
    }
    // Header reference → unit vector in dimension 1
    if (lower === HEADER_REF.toLowerCase()) {
      return [0, 1, 0];
    }
    // Noise reference → unit vector in dimension 2 (orthogonal)
    if (lower === NOISE_REF.toLowerCase()) {
      return [0, 0, 1];
    }

    // Check if text contains title-like words → high cosine with title ref
    const isTitle = titleWords.some((w) => lower.includes(w.toLowerCase()));
    // Check if text contains header-like words → high cosine with header ref
    const isHeader = headerWords.some((w) => lower.includes(w.toLowerCase()));

    if (isTitle && !isHeader) {
      return [0.9, 0.1, 0]; // High title similarity, low header similarity
    }
    if (isHeader && !isTitle) {
      return [0.1, 0.9, 0]; // Low title similarity, high header similarity
    }
    if (isTitle && isHeader) {
      return [0.5, 0.5, 0]; // Ambiguous
    }
    // Neutral
    return [0.3, 0.3, 0.7];
  };
}

describe("extractTitle (heuristic)", () => {
  it("returns undefined for empty text", () => {
    expect(extractTitle("")).toBeUndefined();
    expect(extractTitle("  ")).toBeUndefined();
  });

  it("returns the first valid line", () => {
    expect(extractTitle("Chicken Soup\nIngredients\n1 cup water")).toBe(
      "Chicken Soup"
    );
  });

  it("skips lines that are too short or too long", () => {
    const longLine = "A".repeat(51);
    expect(extractTitle(`ab\n${longLine}\nGood Title`)).toBe("Good Title");
  });

  it("skips ingredient lines", () => {
    expect(extractTitle("2 cups flour\nApple Pie")).toBe("Apple Pie");
  });

  it("skips all-caps lines", () => {
    expect(extractTitle("INGREDIENTS\nChocolate Cake")).toBe("Chocolate Cake");
  });

  it("skips lines starting with numbers", () => {
    expect(extractTitle("12\nApple Pie")).toBe("Apple Pie");
  });
});

describe("extractTitleWithEmbeddings", () => {
  beforeEach(() => {
    _resetEmbeddingCacheForTests();
  });

  it("returns undefined for empty text", async () => {
    const embed = createMockEmbed([], []);
    expect(await extractTitleWithEmbeddings("", embed)).toBeUndefined();
    expect(await extractTitleWithEmbeddings("  ", embed)).toBeUndefined();
  });

  it("picks title over section header (Polish)", async () => {
    const embed = createMockEmbed(["pierogi ruskie"], ["składniki"]);
    const text = "Składniki\nPierogi Ruskie\n200g mąki\n3 ziemniaki";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Pierogi Ruskie");
  });

  it("picks title over section header (English)", async () => {
    const embed = createMockEmbed(["chicken soup"], ["ingredients"]);
    const text = "Ingredients\nChicken Soup\n1 cup water\nSalt";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Chicken Soup");
  });

  it("preserves all-caps titles", async () => {
    const embed = createMockEmbed(["chocolate cake"], ["ingredients"]);
    const text = "CHOCOLATE CAKE\nIngredients\n200g flour";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("CHOCOLATE CAKE");
  });

  it("skips numbered lines", async () => {
    const embed = createMockEmbed(["apple pie"], []);
    const text = "12\nApple Pie\nSome instructions";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Apple Pie");
  });

  it("joins multi-line title (2 lines)", async () => {
    const embed = createMockEmbed(
      ["kurczak w sosie śmietanowym z pieczarkami"],
      ["składniki"]
    );
    const text =
      "Kurczak w sosie\nśmietanowym z pieczarkami\nSkładniki\n200g kurczaka";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Kurczak w sosie śmietanowym z pieczarkami");
  });

  it("joins multi-line title (3 lines)", async () => {
    const embed = createMockEmbed(
      ["makaron z sosem pomidorowym i bazylią"],
      ["składniki"]
    );
    const text =
      "Makaron z sosem\npomidorowym\ni bazylią\nSkładniki\n300g makaronu";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Makaron z sosem pomidorowym i bazylią");
  });

  it("does not over-greedily join title with header", async () => {
    const embed = createMockEmbed(["apple pie"], ["ingredients"]);
    const text = "Apple Pie\nIngredients\n200g flour";
    const result = await extractTitleWithEmbeddings(text, embed);
    // Should prefer "Apple Pie" alone, not "Apple Pie Ingredients"
    expect(result).toBe("Apple Pie");
  });

  it("returns multiple titles joined with + when both score well", async () => {
    const embed = createMockEmbed(
      ["first recipe", "second recipe"],
      []
    );
    const text = "First Recipe\nSecond Recipe\nSome other text";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("First Recipe + Second Recipe");
  });

  it("skips burst of short lines at start and finds title after", async () => {
    const embed = createMockEmbed(["beef stew"], ["ingredients"]);
    // 3+ short garbled lines at start, then real content with a long line
    const text =
      "pg 42\nA.\nfoo\nThis is a longer line that triggers burst end detection\nBeef Stew\nIngredients\n500g beef";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Beef Stew");
  });

  it("two titles deep in text returns both joined", async () => {
    const embed = createMockEmbed(
      ["pasta carbonara", "tiramisu classico"],
      ["ingredients", "składniki"]
    );
    const text =
      "Ingredients\nPasta Carbonara\n200g pasta\n100g guanciale\nIngredients\nTiramisu Classico\n250g mascarpone";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Pasta Carbonara + Tiramisu Classico");
  });

  it("single-recipe page still returns one title", async () => {
    const embed = createMockEmbed(["tomato soup"], ["ingredients"]);
    const text = "Tomato Soup\nIngredients\n4 tomatoes\n1 cup cream\nSalt";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Tomato Soup");
  });
});
