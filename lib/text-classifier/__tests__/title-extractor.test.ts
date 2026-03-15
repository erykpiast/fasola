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

  it("keeps 2-word ALL_CAPS join over its single-word prefix (ARAYES-type)", async () => {
    // "ARAYES" alone is 1 word → never qualifies as firstStructuralHeading.
    // "ARAYES SHRAK" qualifies → pre-filter removes "ARAYES" so dedup keeps the join.
    const embed = createMockEmbed(["arayes"], ["ingredients"]);
    const text = "ARAYES\nSHRAK\nIngredients\n2 cups flour";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("ARAYES SHRAK");
  });

  it("extends ALL_CAPS structural heading when next line starts with continuation token (SAFFRON-type)", async () => {
    // "TITLE FIRST PART" qualifies as structural heading; continuation upgrades it to the join.
    // Pre-filter then removes the partial so dedup keeps the complete join.
    const embed = createMockEmbed(["title first part"], ["ingredients"]);
    const text = "TITLE FIRST PART\n/ SECOND PART\nIngredients\n1 cup flour";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("TITLE FIRST PART / SECOND PART");
  });

  it("pre-merges continuation line starting with & into preceding line (Baked Eggs type)", async () => {
    // "& Coriander" starts with & so it's merged into the preceding line before candidate
    // generation — the complete title enters the pool as a single candidate.
    const embed = createMockEmbed(
      ["baked eggs with feta"],
      ["ingredients"]
    );
    const text =
      "Baked Eggs with Feta, Harissa Tomato Sauce\n& Coriander\nIngredients\n2 eggs";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Baked Eggs with Feta, Harissa Tomato Sauce & Coriander");
  });

  it("does not pre-merge second line that lacks a continuation character (ARAYES-type safety)", async () => {
    // "SHRAK" does not start with /&+:( so it is NOT pre-merged.
    // The existing structural heading join logic handles it instead.
    const embed = createMockEmbed(["arayes"], ["ingredients"]);
    const text = "ARAYES\nSHRAK\nIngredients\n2 cups flour";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("ARAYES SHRAK");
  });

  it("returns only the first ALL_CAPS heading when subsequent ALL_CAPS headings are section headers followed by ingredients (CHLEBEK type)", async () => {
    // WARZYWA I BOCZEK is immediately followed by ingredient lines (numbers) →
    // it's a section header, not a second recipe title. Keep only CHLEBEK Z WARZYWAMI I BOCZKIEM.
    const embed = createMockEmbed(
      ["chlebek z warzywami i boczkiem", "warzywa i boczek"],
      []
    );
    const text = [
      "CHLEBEK Z WARZYWAMI I BOCZKIEM",
      "WARZYWA I BOCZEK",
      "500 g strączków zielonego groszku",
      "1 żółta papryka",
      "CHLEBEK",
      "500 g mąki",
    ].join("\n");
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("CHLEBEK Z WARZYWAMI I BOCZKIEM");
  });

  it("returns both ALL_CAPS titles when headings are NOT followed by ingredient lines (FINNISH-type)", async () => {
    // POTATO FLATBREADS is followed by body text, not ingredients →
    // these are two separate recipe titles on a multi-recipe page.
    const embed = createMockEmbed(
      ["milk flatbreads", "potato flatbreads"],
      []
    );
    const text = [
      "MILK FLATBREADS",
      "Mix flour with milk and knead",
      "Cook on a dry skillet",
      "POTATO FLATBREADS",
      "Boil potatoes until tender",
      "Mash well before mixing",
    ].join("\n");
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("MILK FLATBREADS + POTATO FLATBREADS");
  });

  it("filters bullet-list lines so real title wins", async () => {
    const embed = createMockEmbed(["mozzarella sticks"], []);
    const text = "MOZZARELLA STICKS\n- 2 tbsp sugar\n- Salt to taste";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("MOZZARELLA STICKS");
  });

  it("filters INGREDIENTS section label so real ALL_CAPS title wins", async () => {
    const embed = createMockEmbed(["mozzarella sticks"], []);
    const text = "INGREDIENTS\nMOZZARELLA STICKS\n- 2 tbsp sugar";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("MOZZARELLA STICKS");
  });

  it("filters compact metric ingredient lines so real title wins", async () => {
    const embed = createMockEmbed(["barszcz czerwony"], []);
    const text = "BARSZCZ CZERWONY\n100g buraków\n50ml bulionu";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("BARSZCZ CZERWONY");
  });

  it("prefers mixed-case title at position 0 over ALL_CAPS subtitle at position 1 (bilingual page)", async () => {
    // "Faszerowana papryka" is the Polish title at position 0 (mixed-case).
    // "PAPRIKA GYERAN-JJIM" is an ALL_CAPS romanization at position 1 — treated as subtitle.
    const embed = createMockEmbed(
      ["faszerowana papryka", "paprika gyeran"],
      []
    );
    const text =
      "Faszerowana papryka\nPAPRIKA GYERAN-JJIM\nIngredients\n200g peppers";
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Faszerowana papryka");
  });

  it("merges 4 consecutive short ALL_CAPS lines into one title (LABANEH-type)", async () => {
    // Each OCR line is ≤2 words and ≤25 chars — the short-caps merge pass coalesces them.
    const embed = createMockEmbed(["labaneh"], []);
    const text = [
      "LABANEH",
      "BALLS",
      "WITH NIGELLA",
      "SEEDS",
      "Essential to blending the flavours together",
    ].join("\n");
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("LABANEH BALLS WITH NIGELLA SEEDS");
  });

  it("short-caps merge breaks at a section label, preventing spurious joins", async () => {
    // WORD ONE and WORD TWO are short ALL_CAPS, but INGREDIENTS (section label) sits between
    // them and breaks the run — they should NOT be merged into "WORD ONE WORD TWO".
    const embed = createMockEmbed(["word one"], []);
    const text = [
      "WORD ONE",
      "INGREDIENTS",
      "WORD TWO",
      "Some body text here to fill the page",
    ].join("\n");
    const result = await extractTitleWithEmbeddings(text, embed);
    // WORD ONE wins (title word); WORD TWO is a separate candidate but scores lower.
    // The key assertion: no "WORD ONE INGREDIENTS WORD TWO" merged result.
    expect(result).toBe("WORD ONE");
  });

  it("short-caps merge does not fire when a line exceeds 2 words", async () => {
    // "THREE WORD LINE" has 3 words — above the ≤2 limit — so it is never the start of a merge run.
    const embed = createMockEmbed(["three word line"], []);
    const text = [
      "THREE WORD LINE",
      "ANOTHER LINE",
      "Body text follows here",
    ].join("\n");
    const result = await extractTitleWithEmbeddings(text, embed);
    // Candidates are generated individually; no spurious merge of the two lines by the caps pass.
    // "THREE WORD LINE ANOTHER LINE" may appear as a downstream 2-line join candidate but
    // "THREE WORD LINE" wins as the structural heading (more words, higher rawScore from title word).
    expect(result).toBe("THREE WORD LINE");
  });

  it("layout-based bilingual detection suppresses ALL_CAPS romanization with no word overlap", async () => {
    // Mixed-case title at position 0 (≥2 words) + ALL_CAPS candidate at position 1 with no
    // words in common → layout guard fires and suppresses the ALL_CAPS candidate.
    const embed = createMockEmbed(["mixed case title", "all caps different"], []);
    const text = [
      "Mixed Case Title",
      "ALL CAPS DIFFERENT",
      "Body text that fills the rest of the page",
    ].join("\n");
    const result = await extractTitleWithEmbeddings(text, embed);
    expect(result).toBe("Mixed Case Title");
  });
});
