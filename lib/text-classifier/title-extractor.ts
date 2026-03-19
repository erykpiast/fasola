/**
 * Title Extraction
 * Extracts potential recipe title from OCR text using heuristics or semantic embeddings
 */

import { cosineSimilarity } from "./embeddings";
import { FOOD_DICTIONARY } from "./food-dictionary";

export type EmbedFn = (text: string) => Promise<Array<number>>;

const TITLE_REFERENCE =
  "recipe name, dish title, name of the food, nazwa przepisu, nazwa dania";
const HEADER_REFERENCE =
  "ingredients list, cooking directions, section heading, składniki, przygotowanie, sposób wykonania";
const NOISE_REFERENCE =
  "page number, table of contents, book footer, garbled text";

/**
 * Measurement units commonly found in ingredient lists
 */
const MEASUREMENT_PATTERNS = [
  // English
  "cup",
  "cups",
  "tbsp",
  "tsp",
  "tablespoon",
  "teaspoon",
  // "oz" and "lb" are matched with word boundaries in looksLikeIngredient
  // to avoid false positives ("oz" in "mozzarella", "lb" in "albacore")
  "gram",
  "grams",
  "kg",
  "ml",
  "liter",
  "pinch",
  "dash",
  "handful",
  // Polish
  "łyżka", "łyżki", "łyżek",           // tablespoon(s)
  "łyżeczka", "łyżeczki", "łyżeczek",   // teaspoon(s)
  "szklanka", "szklanki", "szklanek",    // cup(s)
  "szczypta",                            // pinch
  "garść",                               // handful
  "opakowanie", "opakowania",            // package(s)
  "plasterek", "plasterki",             // slice(s)
];

/**
 * Patterns that identify recipe metadata lines (not titles)
 */
const METADATA_PATTERNS = [
  /^(SERVES?|MAKES?|YIELDS?)\b/i,
  /^(PREP(ARATION)?|COOK(ING)?|PROOF|RISING|FERMENTATION|REST(ING)?)\s*(AND\s*)?(COOK(ING)?)?\s*TIME/i,
  /^SAMPLE\s+SCHEDULE\b/i,
  /^BULK\s+FERMENTATION\b/i,
  /^(THIS\s+RECIPE\s+)?MAKES\b/i,
  // Polish serving-size patterns: "NA 3 PAPRYKI", "NA OKOŁO 1 KG", "DLA 4 OSÓB"
  /^NA\s+(\d|OKOŁO)\b/i,
  /^DLA\s+\d/i,
  // OCR-resilient: "DLA" + any token + serving-unit word (handles DLA & OSOB, DLA § OSOB, etc.)
  /^DLA\s+\S+\s+OSOB/i,
  // OCR-resilient: "DLA" + single non-alphanumeric char (common digit→symbol OCR error)
  /^DLA\s+[^a-zA-Z0-9\s]\s/i,
  // Time-unit metadata: any line containing "N MIN" or "N GODZ" is prep/cook/rest time,
  // regardless of OCR-corrupted prefix (catches PRZYGOTOWANTE, GOTOMANTE, etc.)
  // Accept OCR-corrupted digits: I→1, O→0, S→5 (e.g. "IO MIN" = "10 MIN")
  /\b[\dIOSl]{1,3}\s*MIN\b/i,
  /\b[\dIOSl]{1,3}\s*GODZ/i,
  // "GODZ" (abbreviation for "godzin" = hours) anywhere in a line is a time metadata signal
  /\bGODZ\b/i,
  // Season/category indicators
  /^SEZON\s*:/i,
  /^KATEGORIA\s*:/i,
  /^RODZAJ\s*:/i,
  /^PORCJI\s*:/i,       // Polish serving count
  /^PORTIONS?\s*:/i,    // English serving count
  /^CZ[ĘE]Ś[ĆC]\s*\d/i,   // CZĘŚĆ 1: ... (Polish "Part 1:")
  /^PART\s+\d/i,             // PART 1: ... (English)
  /^MAIN\s+RECIPE\s*:/i,    // "MAIN RECIPE: ..." structural prefix lines
  /^--\s*\w/,               // "--VARIATION:", "--WERSJA NOWOCZESNA" sub-section headers
];

/**
 * Single-word non-title words — standalone OCR fragments unlikely to be recipe titles
 */
const NON_TITLE_WORDS = new Set([
  "the", "and", "for", "but", "not", "you", "all", "can", "are", "was",
  "has", "his", "her", "its", "our", "who", "how", "may", "new", "now",
  "old", "see", "way", "did", "get", "let", "say", "she", "too", "use",
  "buns", "with",
]);

function looksLikeIngredient(line: string): boolean {
  const lowerLine = line.toLowerCase();
  if (MEASUREMENT_PATTERNS.some((pattern) => lowerLine.includes(pattern))) return true;
  // Compact metric: "100g", "50ml", "250g" — digit immediately followed by g/ml/kg
  if (/\b\d+\s*(?:g|ml|kg)\b/i.test(line)) return true;
  // "to taste" / "do smaku" — qualitative ingredient with no unit
  if (/\bto taste\b/i.test(line) || /\bdo smaku\b/i.test(line)) return true;
  return false;
}

function startsWithNumber(line: string): boolean {
  // Match lines starting with a digit or Unicode fraction, optionally preceded by bullet
  return /^\s*(?:[-•*]\s*)?[\d½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(line);
}

function stripDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Known recipe section labels — these are structural headers, not recipe titles.
 * Matched case-insensitively after trimming, stripping trailing punctuation, and stripping diacritics.
 * Polish entries are stored without diacritics for OCR resilience (e.g. "SKLADNIKI" matches "składniki").
 */
const SECTION_LABELS = new Set([
  // English
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "variations", "variation",
  "garnish", "topping", "toppings", "frosting", "filling",
  "serving suggestion", "serving suggestions", "serving",
  "glaze", "for the sauce", "for the filling", "for the dough",
  "for the topping", "for the glaze", "for the pasta dough",
  "for the pasta", "for the crust",
  // Polish — recipe section labels (stored without diacritics for OCR resilience)
  "skladniki", "przygotowanie", "sposob przygotowania", "sposob wykonania",
  "wykonanie", "wskazowki", "podpowiedz", "warianty",
  "sos", "nadzienie", "polewa", "lukier", "ciasto",  // ciasto = dough/pastry base (recipe-internal section AND chapter label)
  "instrukcje",       // instructions
  "uwagi",            // notes/remarks
  "notatki",          // notes
  "podawanie",        // serving
  "przechowywanie",   // storage
  // Polish — recipe-book chapter/category labels (food groups, meal types)
  "warzywa",          // vegetables
  "mieso",            // meat (mięso)
  "miesa",            // meats (mięsa)
  "ryby",             // fish
  "owoce morza",      // seafood
  "zupy",             // soups
  "salatki",          // salads (sałatki)
  "desery",           // desserts
  "napoje",           // drinks
  "pieczywo",         // bread/baked goods
  "przekaski",        // appetizers/snacks
  "sniadania",        // breakfasts (śniadania)
  "obiady",           // dinners/lunches
  "kolacje",          // suppers
  "makarony",         // pasta dishes
  "kasza",            // groats/grains
  "kasze",            // groats/grains (plural)
  "dania glowne",     // main courses (dania główne)
  "przystawki",       // starters
  "dodatki",          // side dishes
  "przetwory",        // preserves
  "wypieki",          // baked goods
  "ciasta",           // cakes (plural)
  "ciastka",          // cookies
  "torty",            // layer cakes
  // "placki" removed — it commonly starts recipe titles like "Placki Ziemniaczane", "Placki Żółte z Kukurydzą"
  "koktajle",         // cocktails/smoothies
  // English — recipe-book chapter/category labels
  "vegetables", "seafood", "fish", "soups", "salads", "desserts",
  "appetizers", "breads", "breakfast", "pasta", "grains",
  "main courses", "side dishes", "preserves", "baked goods",
  "fish & seafood", "soups & broths", "desserts & baked goods",
  "meats", "poultry", "game",
]);

/**
 * Subset of SECTION_LABELS that are food-group/chapter labels (not structural process labels).
 * These may appear as the last word of a compound recipe title (e.g. "LEMON HERB ROASTED VEGETABLES").
 */
const CATEGORY_SECTION_LABELS = new Set([
  // English food categories
  "vegetables", "seafood", "fish", "soups", "salads", "desserts",
  "appetizers", "breads", "breakfast", "pasta", "grains",
  "meats", "poultry", "game",
  // Polish food categories
  "warzywa", "mieso", "miesa", "ryby", "zupy", "salatki", "desery",
  "napoje", "pieczywo", "przekaski", "sniadania", "obiady", "kolacje",
  "makarony", "kasza", "kasze", "przystawki", "dodatki", "wypieki",
  "ciasta", "ciastka", "torty", "koktajle",
]);

function isCategorySectionLabel(text: string): boolean {
  const normalized = stripDiacritics(text.trim().replace(/[:.]$/, "").toLowerCase());
  return CATEGORY_SECTION_LABELS.has(normalized);
}

function isSectionLabel(text: string): boolean {
  const normalized = stripDiacritics(text.trim().replace(/[:.]$/, "").toLowerCase());
  if (SECTION_LABELS.has(normalized)) return true;
  // OCR variant: leading "l" may be OCR-corrupted "I" (e.g. "lngredients" → "ingredients")
  const ocrNormalized = normalized.replace(/^l/, "i");
  if (ocrNormalized !== normalized && SECTION_LABELS.has(ocrNormalized)) return true;
  return false;
}

/**
 * Recipe-internal section labels that should ALWAYS block multi-line joins,
 * even when the combined word count is ≥ 3.
 * Category labels ("zupy", "placki", etc.) are NOT in this set — they can
 * legitimately start a multi-word recipe title like "Zupy Zimowe Warzywne".
 */
const ALWAYS_BLOCK_JOIN_LABELS = new Set([
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "variations", "variation",
  "garnish", "topping", "toppings", "frosting", "filling",
  "serving suggestion", "serving suggestions", "serving",
  "glaze", "instrukcje", "uwagi", "notatki", "podawanie", "przechowywanie",
  "skladniki", "przygotowanie", "sposob przygotowania", "sposob wykonania",
  "wykonanie", "wskazowki", "podpowiedz", "warianty",
  "sos", "nadzienie", "polewa", "lukier", "ciasto",
]);

function isAlwaysBlockJoinLabel(text: string): boolean {
  const normalized = stripDiacritics(text.trim().replace(/[:.]$/, "").toLowerCase());
  return ALWAYS_BLOCK_JOIN_LABELS.has(normalized);
}

/**
 * Returns true if the text starts with an always-block section label word.
 * Used to prevent multi-line joins from absorbing section headers as suffixes.
 * E.g. "PRZYGOTOWANIE IO MIN" starts with "przygotowanie" which is in ALWAYS_BLOCK_JOIN_LABELS.
 */
function startsWithBlockLabel(text: string): boolean {
  const normalized = stripDiacritics(text.trim().toLowerCase());
  const firstWord = normalized.split(/\s+/)[0]?.replace(/[:.]$/, "");
  if (!firstWord) return false;
  // Check single-word match (with OCR "l" → "i" variant, matching isSectionLabel)
  if (ALWAYS_BLOCK_JOIN_LABELS.has(firstWord) ||
      ALWAYS_BLOCK_JOIN_LABELS.has(firstWord.replace(/^l/, "i"))) return true;
  // Check two-word match (e.g. "sposob przygotowania")
  const twoWords = normalized.split(/\s+/).slice(0, 2).join(" ").replace(/[:.]$/, "");
  return ALWAYS_BLOCK_JOIN_LABELS.has(twoWords) ||
    ALWAYS_BLOCK_JOIN_LABELS.has(twoWords.replace(/^l/, "i"));
}

function isAllCaps(line: string): boolean {
  const letters = line.replace(/[^a-zA-Z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function looksLikeMetadata(text: string): boolean {
  return METADATA_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

/** Content words are ≥3 alpha characters after stripping punctuation. */
function extractContentWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 3)
    .map((w) => w.toUpperCase());
}

/**
 * Returns true if the candidate's vocabulary is sufficiently supported by the rest of
 * the document. Short candidates (≤3 content words) require 100% corroboration;
 * longer candidates require ≥67%. Used to detect orphaned OCR artifacts in multi-title pages.
 */
function passesCorroboration(
  text: string,
  position: number,
  allLines: string[],
  startLine: number = 0 // Only check corroboration against lines from this index onward
): boolean {
  const contentWords = extractContentWords(text);

  if (contentWords.length === 0) {
    return true; // No checkable words — pass through
  }

  let corroboratedCount = 0;
  for (const word of contentWords) {
    for (let i = startLine; i < allLines.length; i++) {
      if (i === position) continue;
      if (allLines[i].toUpperCase().includes(word)) {
        corroboratedCount++;
        break;
      }
    }
  }

  const score = corroboratedCount / contentWords.length;
  const threshold = contentWords.length <= 3 ? 1.0 : 0.67;
  return score >= threshold;
}

function isLikelyGarbled(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 2) return true;

  // Pipe embedded in words = OCR artifact (e.g., "Sp|aszcz", "pa|ką")
  if (/[a-zA-ZÀ-ÿа-яА-Я]\|[a-zA-ZÀ-ÿа-яА-Я]/.test(text)) return true;

  // Mixed Latin + Cyrillic = OCR corruption
  if (/[а-яА-ЯёЁіІїЇєЄґҐ]/.test(text) && /[a-zA-Z]/.test(text)) return true;

  // Check vowel ratio — English/Polish text typically has 30–50% vowels
  const vowels = letters.replace(/[^aeiouAEIOUyYąęóĄĘÓ]/g, "").length;
  const vowelRatio = vowels / letters.length;
  if (vowelRatio < 0.10 || vowelRatio > 0.85) return true;

  // Single orphaned word ≤3 letters that isn't a common word
  const words = text.trim().split(/\s+/);
  const COMMON_SHORT = new Set([
    "the", "and", "for", "but", "not", "you", "all", "can", "had", "her",
    "was", "one", "our", "out", "are", "has", "his", "how", "its", "may",
    "new", "now", "old", "see", "way", "who", "did", "get", "let", "say",
    "she", "too", "use",
  ]);
  // Count all Unicode letters (not just ASCII) so Polish words like "Żur" (3 letters) pass
  const unicodeLetters = text.trim().replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, "");
  if (words.length === 1 && unicodeLetters.length <= 3 && !COMMON_SHORT.has(text.trim().toLowerCase())) {
    return true;
  }

  // Single word with internal lowercase→uppercase transition — OCR noise (e.g., "UuIw", "aBC")
  // No recipe title uses this pattern as a standalone single-word candidate.
  if (words.length === 1 && /[a-z][A-Z]/.test(text.trim()) && !/^(Mc|Mac)[A-Z]/.test(text.trim())) {
    return true;
  }

  // Recipe titles never start with a lowercase letter
  if (/^[a-z]/.test(text.trim())) {
    return true;
  }

  // Mid-text sentence boundary (". " followed by a letter) — body text fragment spliced from multiple sentences
  const trimmed = text.trim();
  if (/\.\s+[a-zA-Z]/.test(trimmed) && !trimmed.endsWith(")")) {
    return true;
  }

  // Multi-word candidate containing a garbled OCR fragment: a short lowercase word that isn't a known short word
  if (words.length >= 2) {
    const commonShort2 = new Set([
      "a", "i", "of", "or", "to", "in", "on", "is", "it", "an",
      "as", "at", "by", "do", "go", "if", "no", "so", "up", "we",
      "w", "z",   // Polish prepositions (basic)
      "ze", "bo", "na", "ni", "po", "ku", "od", "za", "co",  // Polish prepositions (extended)
    ]);
    const hasGarbledWord = words.some(
      (w) =>
        /^[a-z]/.test(w) &&
        w.replace(/[^a-z]/g, "").length <= 2 &&
        !commonShort2.has(w.toLowerCase())
    );
    if (hasGarbledWord) {
      return true;
    }

    // Multi-word candidate with a garbled token: a short word with internal
    // lowercase→uppercase transition. Length capped at 7 to avoid false positives
    // from OCR-dropped-space artifacts ("withGarlic" = 10 chars). True garbled
    // tokens like "XxYyZz" or "UuIw" are ≤7 chars.
    // Narrow exemption: Mc/Mac name prefixes only (e.g., "McDonald").
    const hasGarbledCamelCase = words.some(
      (w) =>
        w.length >= 3 &&
        w.length <= 7 &&
        /[a-z][A-Z]/.test(w) &&
        !/^(Mc|Mac)[A-Z]/.test(w)
    );
    if (hasGarbledCamelCase) {
      return true;
    }
  }

  return false;
}

const COOKING_INSTRUCTION_STARTS = /^(beat|fold|stir|mix|add|pour|bake|cook|cool|remove|place|combine|whisk|knead|roll|spread|brush|slice|chop|dice|mince|drain|rinse|peel|grate|melt|simmer|boil|fry|sauté|saute|roast|grill|broil|steam|let|set|transfer|serve|garnish|arrange|sprinkle|season|preheat|cover|uncover|reduce|bring|toss|cut|trim|shape|form|scatter|score|pat|rub|skim|strain|heat|discard|rest|marinate|wrap|flip|turn|layer|stuff|drizzle|squeeze|zest|soak|thaw|freeze|chill|warm|toast|crush|pound|crack|break|separate|weigh|measure|sift|dust|coat|dip|dredge|baste|debone|butterfly|truss|shred|puree|blend|process|pulse|whip|cream|proof|rise|punch|divide|portion|assemble)\b/i;

// Polish imperative cooking verbs (with OCR-resilient forms — no diacritics required).
// These cover the most common recipe instruction starters. Includes common OCR-corrupted
// forms (e.g., "Smaż" → "Smaz", "Dodaj" → "Dodaj").
// Note: only verbs that NEVER start a recipe title. "Piecz" (bake) is excluded because
// "Pieczeń" (roast) and "Pieczarki" (mushrooms) share the prefix.
// Use a Unicode-aware word-boundary lookahead instead of \b, because JS \b does not recognise
// Polish letters (ą ć ę ł ń ó ś ź ż) as word characters. Without this, `smaż\b` would
// incorrectly match "Smażona" since \b fires between ż (non-\w) and the following o (\w).
const POLISH_COOKING_INSTRUCTION_STARTS = /^(podawaj|dodaj|dodawaj|sma[zż]|gotuj|odced[zź]|wymieszaj|mieszaj|wlej|nalej|przygotuj|zagotuj|pokr[oó]j|obierz|wrzuc|wrzuć|usma[zż]|podsma[zż]|prze[lł][oó][zż]|zblenduj|ubij|roztrzepaj|rozprowad[zź]|wyrob|zamieszaj|posyp|polej|odstaw|na[lł][oó][zż]|przykryj|odkryj|wstaw|zdejmij|ods[aą]cz|rozgrzej|posiekaj|zetrzyj|wy[lł][oó][zż]|wyjmij|ukr[oó]j|przekr[oó]j|formuj|ugniataj|rozwałkuj|ugotuj|ugotowa[cć]|upiecz|podawa[cć]|zapiekaj|obtocz|obtoczy[cć]|podgrzej|podgrzewaj)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i;

function looksLikeCookingInstruction(text: string): boolean {
  const words = text.trim().split(/\s+/);
  // Polish cooking instructions are commonly 2-3 words ("Ugotuj ziemniaki.", "Upiecz chleb.")
  // and are unambiguous because Polish recipe titles don't start with imperative verbs.
  if (POLISH_COOKING_INSTRUCTION_STARTS.test(text.trim())) {
    return words.length >= 2;  // Polish: 2+ words is enough
  }
  if (words.length < 4) return false;  // English: keep existing 4-word threshold
  if (COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  return false;
}

/**
 * A line starting with a lowercase letter and having 4+ words is prose continuation.
 * Recipe titles are capitalized (Title Case or ALL CAPS), so a lowercase-start line
 * is a strong signal for mid-recipe body text.
 */
function isBodyProse(line: string): boolean {
  return /^[a-ząćęłńóśźż]/.test(line) && wordCount(line) >= 4;
}

/**
 * Detect pages where the OCR capture starts mid-recipe with no title present.
 * Returns true if the first 3 non-empty lines (after `startFrom`) are all ingredients,
 * cooking instructions, or body prose continuation text.
 */
function isTitleAbsentPage(lines: Array<string>, startFrom: number = 0): boolean {
  const relevantLines = startFrom > 0 ? lines.slice(startFrom) : lines;
  const nonEmptyLines = relevantLines.map(l => l.trim()).filter(l => l.length > 0);

  if (nonEmptyLines.length < 3) return false;

  const first3 = nonEmptyLines.slice(0, 3);

  return first3.every(line =>
    looksLikeIngredient(line) ||
    looksLikeCookingInstruction(line) ||
    isBodyProse(line)
  );
}

function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  if (looksLikeCookingInstruction(text)) return false;
  // Apply lightweight OCR normalization before a second instruction check
  // so that "Podaw4ć" is recognized as "Podawać" (cooking instruction).
  // Only 4→a for now — the specific OCR artifact causing failures.
  // Uses same letter-adjacent guard logic as applyBlindOcrRepairToken.
  const ocrNormForInstruction = text
    .replace(/(?<=[a-zà-ż])4/g, "a")
    .replace(/4(?=[a-zà-ż])/g, "a");
  if (ocrNormForInstruction !== text && looksLikeCookingInstruction(ocrNormForInstruction)) return false;
  // Pipe-separated lines are book category/chapter headers, not recipe titles
  if (text.includes(" | ")) return false;
  // Trailing page number (e.g. "VEGETABLE SIDES                         145")
  if (/\s{3,}\d{1,4}\s*$/.test(text)) return false;
  // Slash-separated breadcrumbs (e.g., "/ Jesien / Zupy") are navigation, not titles
  // Only filter when 2+ slashes are present — single-slash lines like
  // "TITLE / SUBTITLE" are legitimate continuation-merged titles
  if ((text.match(/\//g) || []).length >= 2) return false;
  // Bullet-list items (ingredients or instruction steps) are never titles
  if (/^\s*[-•*]\s/.test(text)) return false;
  // "For the sauce:", "For the filling:" etc. are sub-section headers
  if (/^For the\s+/i.test(text) && /:\s*$/.test(text)) return false;
  // Lines ending with ":" are recipe sub-section headers, not titles.
  // Exception: compound titles using " : " as a title separator (e.g. "LEMON CURD : LEMON CURD WITH THYME").
  if (/:\s*$/.test(text.trim()) && !/ : /.test(text)) return false;
  // Page references are navigation markers, not recipe titles
  if (/^Page\s+\d+/i.test(text.trim())) return false;
  if (/^Strona\s+\d+/i.test(text.trim())) return false;
  // Corrupted spillover annotations from synthetic multi-page OCR
  if (/^\[CORRUPTED\s+SPILLOVER/i.test(text.trim())) return false;
  // Parenthetical OCR annotation lines describing corruption artifacts
  if (/^\(OCR\b/i.test(text.trim())) return false;
  if (/^\(.*\bcorruption\b/i.test(text.trim())) return false;
  // Square-bracket category tags (e.g., "[CLASSIC FALL SOUPS]")
  if (/^\[.*\]$/.test(text.trim())) return false;
  // Known recipe section labels are structural headers, not titles
  if (isSectionLabel(text)) return false;
  // Single-word non-title fragments
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) return false;
  // Lines with ≥8 words are almost certainly body text, not titles.
  // Exception: multi-title compounds with " + ", " : ", or " & " separators are allowed.
  if (words.length >= 8 && !/ [+:&/] /.test(text)) return false;
  return true;
}

/**
 * Detect initial burst of short garbled lines.
 * Returns the index of the first non-garbled or long line.
 */
function findBurstEnd(lines: Array<{ text: string }>): number {
  let i = 0;

  // Skip overflow preambles: blocks introduced by "PREVIOUS RECIPE OVERFLOW",
  // "PREVIOUS PAGE CONTENT", "CORRUPTED SECTION", etc. that precede the actual recipe.
  const OVERFLOW_MARKERS = /\b(PREVIOUS\s+(RECIPE|PAGE)\b|SPILLOVER|CONTINUATION|CORRUPTED\s+(SECTION|TEXT)\b|PARTIAL\s+RECIPE)\b/i;
  let overflowEnd = 0;
  for (let k = 0; k < lines.length && k < 30; k++) {
    // Don't re-examine lines already determined to be overflow
    if (overflowEnd > 0 && k < overflowEnd) continue;
    if (OVERFLOW_MARKERS.test(lines[k].text) || /^\[.*\b(PREVIOUS|CORRUPTED|SPILLOVER|CONTINUATION|PARTIAL)\b.*\]$/i.test(lines[k].text)) {
      // Skip forward past the overflow block to the next visual separator or blank cluster
      let m = k + 1;
      let consecutiveBlanks = 0;
      while (m < lines.length) {
        const lineText = lines[m].text;
        // Stop at visual separator
        if (/^[=\-]{4,}$/.test(lineText)) {
          overflowEnd = m + 1;
          break;
        }
        // Track consecutive blank lines
        if (lineText.trim().length === 0) {
          consecutiveBlanks++;
          if (consecutiveBlanks >= 2) {
            overflowEnd = m + 1;
            break;
          }
        } else {
          consecutiveBlanks = 0;
          // Stop at ALL_CAPS line with ≥2 words (likely next recipe heading)
          if (isAllCaps(lineText) && wordCount(lineText) >= 2) {
            overflowEnd = m; // Don't skip past the heading itself
            break;
          }
        }
        m++;
      }
      // If we walked to end without finding termination, skip everything we saw
      if (overflowEnd === 0) overflowEnd = m;
    }
  }
  if (overflowEnd > 0) i = overflowEnd;

  while (i < lines.length && lines[i].text.length < 20 && isLikelyGarbled(lines[i].text) && !isAllCaps(lines[i].text)) {
    i++;
  }
  // Skip body-content prologues: when 3+ consecutive lines at the start are cooking
  // instructions, prose continuations, or a mix of both, skip them to find the actual
  // title region. This unifies the previous separate instruction and prose checks to
  // handle interleaved patterns (e.g., instruction → prose continuation → instruction).
  if (i === 0) {
    let j = 0;
    while (j < lines.length) {
      const t = lines[j].text;
      const isInstruction = looksLikeCookingInstruction(t);
      // Short body-text continuation: lowercase-start with 2+ words catches fragments
      // like "creamy but still al dente..." that follow cooking instructions.
      // Lower threshold than isBodyProse (2 vs 4 words) to handle interleaved patterns.
      const isContinuation = /^[a-ząćęłńóśźż]/.test(t) && wordCount(t) >= 2;
      // Non-lowercase body text: comma-ending or long sentence-ending lines
      const isBodyEnding = (t.endsWith(",") || (t.endsWith(".") && wordCount(t) > 4)) && wordCount(t) >= 4;

      if (isInstruction || isContinuation || isBodyEnding) {
        j++;
      } else {
        break;
      }
    }
    if (j >= 3) {
      i = j;
    }
  }
  return i;
}

function stripParentheticalGloss(text: string): string {
  // Strip trailing English-gloss parentheticals from ALL_CAPS titles.
  // e.g. "PIEROGI RUSKIE (Boiled Dumplings with Potato and Cheese)" → "PIEROGI RUSKIE"
  // Keep if parenthetical is ALL_CAPS (variation/subtitle in same language).
  // Keep if both base and paren are mixed-case (both are part of the title).
  const match = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return text;
  const [, base, paren] = match;
  if (isAllCaps(paren)) return text;
  if (!isAllCaps(base) && !isAllCaps(paren)) return text;
  return base.trim();
}

function stripPageNumber(text: string): string {
  // "34  Berry Jam" → "Berry Jam" (2+ spaces distinguishes from "2 eggs")
  const match = text.match(/^\d{1,3}\s{2,}(.+)$/);
  return match ? match[1] : text;
}

/**
 * Strip trailing parenthesized page or step numbers.
 * "Ugotuj ziemniaky. (38)" → "Ugotuj ziemniaky."
 * "RECIPE NAME (p. 42)" → "RECIPE NAME"
 */
function stripTrailingPageRef(text: string): string {
  return text.replace(/\s*\((?:p\.?\s*)?\d{1,4}\)\s*$/, "").trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Build candidate strings from lines: single lines plus multi-line joins (2-3 consecutive).
 * Skips initial burst of short garbled lines. Scans all remaining lines. Caps at 25.
 */
export type CandidateOrigin = "single" | "2-line" | "3-line";

function buildCandidates(
  lines: Array<string>
): { candidates: Array<{ text: string; position: number; origin: CandidateOrigin }>; burstEnd: number } {
  const nonEmptyLines: Array<{ text: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      nonEmptyLines.push({ text: trimmed, index: i });
    }
  }

  const burstEnd = findBurstEnd(nonEmptyLines);

  // Pre-join hyphen-broken lines: "ROASTED CHICKEN WITH ROOT VEGET-" + "ABLES" → single line.
  // Only applies within the candidate region (after burst end).
  for (let hi = burstEnd; hi < nonEmptyLines.length - 1; hi++) {
    if (nonEmptyLines[hi].text.endsWith("-")) {
      const joined = nonEmptyLines[hi].text.slice(0, -1) + nonEmptyLines[hi + 1].text;
      nonEmptyLines[hi] = { text: joined, index: nonEmptyLines[hi].index };
      nonEmptyLines.splice(hi + 1, 1);
    }
  }

  // Pre-merge consecutive short ALL_CAPS lines (OCR-fragmented headings).
  // When a sequence of 2+ ALL_CAPS lines each has ≤2 words and ≤25 chars, they are
  // almost certainly OCR fragments of a single heading. Merge them into one line so
  // the complete title enters the candidate pool without hitting the 3-line join ceiling.
  const capsCoalesced: Array<{ text: string; index: number }> = [];
  let ci = burstEnd;
  while (ci < nonEmptyLines.length) {
    const line = nonEmptyLines[ci];
    if (
      isAllCaps(line.text) &&
      wordCount(line.text) <= 2 &&
      line.text.length <= 25 &&
      !isSectionLabel(line.text) &&
      !looksLikeMetadata(line.text)
    ) {
      let merged = line.text;
      const startIndex = line.index;
      let j = ci + 1;
      while (j < nonEmptyLines.length) {
        const next = nonEmptyLines[j];
        if (
          isAllCaps(next.text) &&
          wordCount(next.text) <= 2 &&
          next.text.length <= 25 &&
          ((!isSectionLabel(next.text) && !isSectionLabel(repairOcrText(next.text))) ||
           (wordCount(next.text) === 1 && wordCount(merged) >= 2 && wordCount(merged) <= 4 &&
            isCategorySectionLabel(next.text))) &&
          !looksLikeMetadata(next.text) &&
          (merged + " " + next.text).length <= 80
        ) {
          merged += " " + next.text;
          j++;
        } else {
          break;
        }
      }
      if (j > ci + 1) {
        capsCoalesced.push({ text: merged, index: startIndex });
        ci = j;
        continue;
      }
    }
    capsCoalesced.push(line);
    ci++;
  }

  // Pre-merge continuation lines: a line starting with /&+:( is never a standalone title.
  // Merge it into the preceding line so the complete title enters the pool as a single candidate,
  // avoiding the fragile chain of conditions required by the downstream join survival logic.
  // Limitation: only one continuation line per preceding line is merged. Titles split across
  // three or more lines with continuation tokens (rare in practice) are not handled here —
  // the downstream 2-line and 3-line join candidates cover those cases instead.
  const mergedLines: Array<{ text: string; index: number }> = [];
  for (let i = 0; i < capsCoalesced.length; i++) {
    const line = capsCoalesced[i];
    if (i + 1 < capsCoalesced.length) {
      const nextText = capsCoalesced[i + 1].text;
      if (/^[/&+:(]/.test(nextText)) {
        const mergedText = `${line.text} ${nextText}`;
        mergedLines.push({ text: mergedText, index: line.index });
        // Emit standalone as fallback ONLY when the merged form would fail hard
        // filters (e.g. "(OCR CORRUPTION: ...)" annotations make the merge too
        // long). When the merge is valid (e.g. "Title & Coriander"), only the
        // merged form is emitted to prevent the incomplete standalone from
        // winning on embedding score alone.
        const mergedProcessed = repairOcrText(
          stripParentheticalGloss(stripTrailingPageRef(stripPageNumber(mergedText)))
        );
        if (!passesHardFilters(mergedProcessed)) {
          mergedLines.push(line);
        }
        i++;
        continue;
      }
    }
    mergedLines.push(line);
  }

  const candidates: Array<{ text: string; position: number; origin: CandidateOrigin }> = [];
  const seen = new Set<string>();

  // Build a set of positions to skip: short ALL_CAPS lines immediately following metadata
  const metadataContinuationPositions = new Set<number>();
  for (let i = 0; i < mergedLines.length - 1; i++) {
    if (looksLikeMetadata(mergedLines[i].text)) {
      const next = mergedLines[i + 1];
      if (isAllCaps(next.text) && wordCount(next.text) <= 2 && next.text.length <= 15) {
        metadataContinuationPositions.add(next.index);
      }
    }
  }

  for (let i = 0; i < mergedLines.length; i++) {
    const line = mergedLines[i];

    // Skip metadata continuation fragments
    if (metadataContinuationPositions.has(line.index)) continue;

    // Single line — strip page-number prefixes and parenthetical glosses before scoring
    const singleText = repairOcrText(stripParentheticalGloss(stripTrailingPageRef(stripPageNumber(line.text))));
    if (passesHardFilters(singleText)) {
      const norm = singleText.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        candidates.push({ text: singleText, position: line.index, origin: "single" });
      }
    }

    // Blind OCR repair for early-position candidates: when the original text
    // has OCR artifacts or erratic casing and is in the first few lines,
    // generate additional candidates with blind digit→letter repair and/or
    // casing normalization. This gives the embedding scorer clean versions
    // even when dictionary repair misses.
    if (line.index <= 5) {
      const hasOcrArtifact = OCR_ARTIFACT_PATTERN.test(line.text);
      const lineHasErraticCasing = hasErraticCasing(line.text);
      if (hasOcrArtifact || lineHasErraticCasing) {
        let repairable = singleText;
        if (lineHasErraticCasing) {
          repairable = normalizeErraticCasing(repairable);
          if (repairable !== singleText && passesHardFilters(repairable)) {
            const norm = repairable.toLowerCase();
            if (!seen.has(norm)) {
              seen.add(norm);
              candidates.push({ text: repairable, position: line.index, origin: "single" });
            }
          }
        }
        const variants = generateBlindOcrVariants(repairable);
        for (const variant of variants) {
          if (passesHardFilters(variant)) {
            const norm = variant.toLowerCase();
            if (!seen.has(norm)) {
              seen.add(norm);
              candidates.push({ text: variant, position: line.index, origin: "single" });
            }
          }
        }
      }
    }

    // 2-line join — skip if first line is a section label AND join would be ≤2 words
    // (a section label followed by modifiers is likely a recipe title, not a category header)
    // Also skip if the next line is metadata (e.g. serving size "DLA & OSOB").
    // Also skip if the continuation line is an always-block section label (e.g. "PRZYGOTOWANIE IO MIN")
    // — joining a title with a section header creates garbage like "KREM + PRZYGOTOWANIE IO MIN".
    if (i + 1 < mergedLines.length && !looksLikeMetadata(mergedLines[i + 1].text)) {
      const joined2 = repairOcrText(`${line.text} ${mergedLines[i + 1].text}`);
      const shouldBlock2 = (isSectionLabel(line.text) &&
        (wordCount(joined2) <= 2 || isAlwaysBlockJoinLabel(line.text))) ||
        startsWithBlockLabel(mergedLines[i + 1].text);
      if (!shouldBlock2 && passesHardFilters(joined2)) {
        const norm = joined2.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          candidates.push({ text: joined2, position: line.index, origin: "2-line" });
        }
      }
    }

    // 3-line join — skip if first line is a section label AND join would be ≤2 words.
    // Also skip if any continuation line is metadata or an always-block section label.
    if (i + 2 < mergedLines.length &&
        !looksLikeMetadata(mergedLines[i + 1].text) &&
        !looksLikeMetadata(mergedLines[i + 2].text)) {
      const joined3 = repairOcrText(`${line.text} ${mergedLines[i + 1].text} ${mergedLines[i + 2].text}`);
      const shouldBlock3 = (isSectionLabel(line.text) &&
        (wordCount(joined3) <= 2 || isAlwaysBlockJoinLabel(line.text))) ||
        startsWithBlockLabel(mergedLines[i + 1].text) ||
        startsWithBlockLabel(mergedLines[i + 2].text);
      if (!shouldBlock3 && passesHardFilters(joined3)) {
        const norm = joined3.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          candidates.push({ text: joined3, position: line.index, origin: "3-line" });
        }
      }
    }
  }

  // Pre-filter to 25 before embedding calls: prefer ALL_CAPS and short candidates.
  // Position-based scoring handles final ranking.
  if (candidates.length > 25) {
    const prioritized = candidates.slice().sort((a, b) => {
      const aAllCaps = isAllCaps(a.text) ? 0 : 1;
      const bAllCaps = isAllCaps(b.text) ? 0 : 1;
      if (aAllCaps !== bAllCaps) return aAllCaps - bAllCaps;
      const aShort = wordCount(a.text) <= 5 ? 0 : 1;
      const bShort = wordCount(b.text) <= 5 ? 0 : 1;
      return aShort - bShort;
    });
    return { candidates: prioritized.slice(0, 25), burstEnd: nonEmptyLines[burstEnd]?.index ?? lines.length };
  }

  return { candidates, burstEnd: nonEmptyLines[burstEnd]?.index ?? lines.length };
}

/**
 * Convert an ALL_CAPS string to Title Case, using a small-words list.
 * Preserves Polish/French diacritics.
 */
function toTitleCase(text: string): string {
  const smallWords = new Set([
    "a", "an", "the", "and", "but", "or", "for", "nor",
    "in", "on", "at", "to", "of", "by", "with", "from",
    "z", "w", "i", "ze", "na", "do", "od", "za", "po",
  ]);
  return text.split(/(\s+)/).map((word, idx) => {
    if (/^\s+$/.test(word)) return word;
    const lower = word.toLowerCase();
    if (idx === 0 || !smallWords.has(lower)) {
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return lower;
  }).join("");
}

/**
 * OCR digit→letter substitution map.
 * Each key is a character that OCR commonly confuses; values are possible correct letters.
 */
const OCR_SUBSTITUTIONS: Record<string, string[]> = {
  "0": ["o"],
  "1": ["i", "l"],
  "4": ["a"],
  "5": ["s"],
  "¡": ["i"],
  "í": ["i", "l"],
  "€": ["e"],
};

const OCR_ARTIFACT_PATTERN = /[0-9¡Íí€]/;

/**
 * Attempt to repair a single OCR-corrupted word using dictionary lookup.
 * Returns the repaired word if a dictionary match is found, otherwise returns the original.
 */
function repairOcrWord(word: string): string {
  if (!OCR_ARTIFACT_PATTERN.test(word)) return word;

  const lower = word.toLowerCase();

  const positions: Array<{ index: number; replacements: Array<string> }> = [];
  for (let i = 0; i < lower.length; i++) {
    const replacements = OCR_SUBSTITUTIONS[lower[i]];
    if (replacements) {
      positions.push({ index: i, replacements });
    }
  }

  if (positions.length === 0 || positions.length > 8) return word;

  const candidates = generateSubstitutions(lower, positions, 0);

  for (const candidate of candidates) {
    if (FOOD_DICTIONARY.has(candidate)) {
      if (word === word.toUpperCase()) return candidate.toUpperCase();
      if (word[0] === word[0].toUpperCase()) {
        return candidate[0].toUpperCase() + candidate.slice(1);
      }
      return candidate;
    }
  }

  return word;
}

/**
 * Recursively generate all substitution variants for OCR artifact positions.
 */
function generateSubstitutions(
  base: string,
  positions: Array<{ index: number; replacements: Array<string> }>,
  posIdx: number,
): Array<string> {
  if (posIdx >= positions.length) return [base];

  const { index, replacements } = positions[posIdx];
  const results: Array<string> = [];

  for (const replacement of replacements) {
    const variant = base.slice(0, index) + replacement + base.slice(index + 1);
    results.push(...generateSubstitutions(variant, positions, posIdx + 1));
  }

  return results;
}

/**
 * Apply dictionary-guided OCR repair to all words in a text string.
 */
function repairOcrText(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => {
      const match = word.match(/^([^a-zA-Z0-9À-ÿ]*)(.*?)([^a-zA-Z0-9À-ÿ]*)$/);
      if (!match) return word;
      const [, prefix, core, suffix] = match;
      if (!core) return word;
      const repaired = repairOcrWord(core);
      return prefix + repaired + suffix;
    })
    .join(" ");
}

/**
 * Apply blind OCR repair to a single mixed-case token.
 * @param oneLetter - the letter to substitute for `1` in lowercase context ("i" or "l")
 */
function applyBlindOcrRepairToken(token: string, oneLetter: "i" | "l"): string {
  if (isAllCaps(token) && token.length > 1) {
    return token
      .replace(/1/g, "I")
      .replace(/0(?=[A-ZÀ-Ż])/g, "O")
      .replace(/(?<=[A-ZÀ-Ż])0/g, "O")
      .replace(/4(?=[A-ZÀ-Ż])/g, "A")
      .replace(/(?<=[A-ZÀ-Ż])4/g, "A")
      .replace(/5(?=[A-ZÀ-Ż])/g, "S")
      .replace(/(?<=[A-ZÀ-Ż])5/g, "S")
      .replace(/¡/g, "I")
      .replace(/€/g, "E")
      .replace(/[ÍÌ]/g, "I");
  }
  return token
    .replace(/(?<=[a-zà-ż])1/g, oneLetter)
    .replace(/1(?=[a-zà-ż])/g, oneLetter)
    .replace(/¡/g, "i")
    .replace(/€/g, "e")
    .replace(/(?<=[a-zà-ż])0/g, "o")
    .replace(/0(?=[a-zà-ż])/g, "o")
    .replace(/(?<=[a-zà-ż])4/g, "a")
    .replace(/4(?=[a-zà-ż])/g, "a")
    .replace(/(?<=[a-zà-ż])5/g, "s")
    .replace(/5(?=[a-zà-ż])/g, "s");
}

/**
 * Apply blind OCR repair to mixed-case text, mapping `1` to the given letter
 * between lowercase characters. Handles per-token ALL_CAPS detection internally.
 */
function applyBlindOcrRepairMixedCase(text: string, oneLetter: "i" | "l"): string {
  return text.split(/(\s+)/).map((token) => {
    if (/^\s+$/.test(token)) return token;
    return applyBlindOcrRepairToken(token, oneLetter);
  }).join("");
}

function applyBlindOcrRepair(text: string): string {
  if (isAllCaps(text)) {
    return text
      .replace(/1/g, "I")
      .replace(/0(?=[A-ZÀ-Ż])/g, "O")
      .replace(/(?<=[A-ZÀ-Ż])0/g, "O")
      .replace(/4(?=[A-ZÀ-Ż])/g, "A")
      .replace(/(?<=[A-ZÀ-Ż])4/g, "A")
      .replace(/5(?=[A-ZÀ-Ż])/g, "S")
      .replace(/(?<=[A-ZÀ-Ż])5/g, "S")
      .replace(/¡/g, "I")
      .replace(/€/g, "E")
      .replace(/[ÍÌ]/g, "I");
  }
  return applyBlindOcrRepairMixedCase(text, "i");
}

function hasErraticCasing(text: string): boolean {
  return text.split(/\s+/).some(word => {
    if (word.length < 5) return false;
    if (isAllCaps(word)) return false;
    const inner = word.slice(1);
    const upperInner = (inner.match(/[A-ZÀ-Ż]/g) || []).length;
    const lowerInner = (inner.match(/[a-zà-ż]/g) || []).length;
    return upperInner >= 2 && upperInner >= lowerInner * 0.3;
  });
}

function normalizeErraticCasing(text: string): string {
  return text.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token)) return token;
    if (isAllCaps(token)) return token;
    if (hasErraticCasing(token)) {
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    }
    return token;
  }).join("");
}

/**
 * Generate multiple blind OCR repair variants for embedding comparison.
 * For ALL_CAPS text, returns a single variant (1→I is unambiguous).
 * For mixed-case text, returns two variants: one with 1→i and one with 1→l,
 * letting the embedding scorer pick the better one.
 */
function generateBlindOcrVariants(text: string): Array<string> {
  if (isAllCaps(text)) {
    const repaired = applyBlindOcrRepair(text);
    return repaired !== text ? [repaired] : [];
  }

  const variants: Array<string> = [];

  // i-variant: 1→i between lowercase letters (default, correct for most recipe text)
  const iVariant = applyBlindOcrRepair(text);

  // l-variant: 1→l between lowercase letters (fallback for words like "llama", "fillets")
  const lVariant = applyBlindOcrRepairMixedCase(text, "l");

  if (iVariant !== text) variants.push(iVariant);
  if (lVariant !== text && lVariant !== iVariant) variants.push(lVariant);

  return variants;
}

/**
 * Post-processing normalization for OCR-extracted titles.
 * Strips stray section markers and substitutes common OCR digit-for-letter artifacts.
 * Title-case conversion is applied only when a substitution was actually made, so
 * clean ALL_CAPS titles (e.g. "CHOCOLATE CAKE") are returned unchanged.
 */
function normalizeOcrTitle(raw: string): string {
  let text = raw.trim();

  // Step 0: Dictionary-guided OCR repair — resolve ambiguous substitutions
  // using word-level context before applying blind character replacements.
  text = repairOcrText(text);

  // Step 1: Strip trailing section markers greedily appended to the title.
  // e.g. "MAKOWIEC ZE ŚLIWKAMI + SERVING AND STORAGE:" → "MAKOWIEC ZE ŚLIWKAMI"
  text = text.replace(
    /\s*\+\s*(?:SERV[IÍ1]NG(?:\s+AND\s+STORAGE)?|TOPPING|NOTES?|TIPS?)\s*:?\s*$/i,
    ""
  );

  // Step 2: OCR character substitution.
  const beforeSub = text;
  text = applyBlindOcrRepair(text);

  // Step 3: Title-case conversion — ONLY when OCR substitution changed the text.
  // This preserves clean ALL_CAPS titles (e.g. "CHOCOLATE CAKE") as-is.
  if (text !== beforeSub && isAllCaps(text)) {
    text = toTitleCase(text);
  }

  // Step 4: Normalize erratic casing (e.g. "KoPyTka" → "Kopytka").
  if (hasErraticCasing(text)) {
    text = normalizeErraticCasing(text);
  }

  return text.trim();
}

// Module-level cache for reference embeddings
let cachedTitleRefEmbedding: Array<number> | null = null;
let cachedHeaderRefEmbedding: Array<number> | null = null;
let cachedNoiseRefEmbedding: Array<number> | null = null;

export function _resetEmbeddingCacheForTests(): void {
  cachedTitleRefEmbedding = null;
  cachedHeaderRefEmbedding = null;
  cachedNoiseRefEmbedding = null;
}

export async function extractTitleWithEmbeddings(
  text: string,
  embed: EmbedFn
): Promise<string | undefined> {
  const t0 = performance.now();
  const log = (stage: string, detail?: string) => {
    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`[Title Extractor] ${elapsed}ms — ${stage}${detail ? `: ${detail}` : ""}`);
  };

  if (!text || text.trim().length === 0) {
    return undefined;
  }

  const lines = text.split("\n");
  log("buildCandidates", `${lines.length} input lines`);
  const { candidates, burstEnd } = buildCandidates(lines);
  const titleAbsent = isTitleAbsentPage(lines, burstEnd);
  log("candidates ready", `${candidates.length} candidates, burstEnd=${burstEnd}, titleAbsent=${titleAbsent}`);

  if (candidates.length === 0) {
    log("done", "no candidates");
    return undefined;
  }

  // Cache reference embeddings
  log("embed refs", "computing reference embeddings");
  if (!cachedTitleRefEmbedding) {
    cachedTitleRefEmbedding = await embed(TITLE_REFERENCE);
  }
  if (!cachedHeaderRefEmbedding) {
    cachedHeaderRefEmbedding = await embed(HEADER_REFERENCE);
  }
  if (!cachedNoiseRefEmbedding) {
    cachedNoiseRefEmbedding = await embed(NOISE_REFERENCE);
  }
  log("embed refs done");

  // Find ALL_CAPS candidates with ≥2 words where every significant word has ≥4 alpha letters.
  // Insignificant tokens (≤1 alpha letter: "/", "&", "+", ":", "D)", etc.) are filtered before
  // the check so that multi-line joins with continuation punctuation still qualify.
  const isStructuralHeading = (c: { text: string }): boolean => {
    if (!isAllCaps(c.text) || wordCount(c.text) < 2) return false;
    const sigWords = c.text.trim().split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length > 1);
    return sigWords.length >= 2 && sigWords.every((w) => w.replace(/[^A-Z]/g, "").length >= 4);
  };

  // Pass 1: compute rawScore for all candidates (embedding quality signal)
  log("pass 1", `scoring ${candidates.length} candidates`);
  const rawScored: Array<{ text: string; position: number; origin: CandidateOrigin; rawScore: number; embedding: Array<number> }> = [];
  for (const candidate of candidates) {
    const embedding = await embed(candidate.text);
    const titleSim = cosineSimilarity(embedding, cachedTitleRefEmbedding);
    const headerSim = cosineSimilarity(embedding, cachedHeaderRefEmbedding);
    const noiseSim = cosineSimilarity(embedding, cachedNoiseRefEmbedding);
    const rawScore = titleSim - Math.max(headerSim, noiseSim);
    rawScored.push({ text: candidate.text, position: candidate.position, origin: candidate.origin, rawScore, embedding });
  }
  log("pass 1 done");

  // Select baseHeading by embedding quality (rawScore), not position.
  // This prevents OCR-garbled fragments from claiming the structural heading slot.
  const structuralCandidates = rawScored.filter((s) => isStructuralHeading(s));

  // Penalize structural headings with truncated OCR words:
  // if "FRON" appears and another heading has "SAFFRON", "FRON" is likely garbled.
  for (const sc of structuralCandidates) {
    const sigWords = sc.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
    for (const other of structuralCandidates) {
      if (other === sc) continue;
      const otherSigWords = other.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
      const hasTruncation = sigWords.some((w) =>
        otherSigWords.some((ow) => ow !== w && ow.length > w.length && ow.endsWith(w))
      );
      if (hasTruncation) {
        sc.rawScore = -1.0;  // Hard disqualification — truncated OCR artifact
        break;
      }
    }
  }

  const bestStructural = structuralCandidates.length > 0
    ? structuralCandidates.reduce((a, b) => {
        const scoreDiff = a.rawScore - b.rawScore;
        if (Math.abs(scoreDiff) > 0.03) return scoreDiff > 0 ? a : b;
        // Tiebreak: single-line origin beats multi-line joins (avoids conflating two separate headings)
        if (a.origin === "single" && b.origin !== "single") return a;
        if (b.origin === "single" && a.origin !== "single") return b;
        // Tiebreak: more words (more specific) → better
        const wcDiff = wordCount(b.text) - wordCount(a.text);
        if (wcDiff !== 0) return wcDiff > 0 ? b : a;
        // Tiebreak: earlier position → better
        return a.position < b.position ? a : b;
      })
    : null;
  const baseHeading = bestStructural ?? undefined;

  // When the best structural heading has a continuation on the next line introduced by a
  // punctuation token (/, &, +, :, or parenthesis), prefer the longer 2-line join as the
  // complete heading. E.g. "SAFFRON WHEAT BUNS WITH QUARK" + "/ COTTAGE CHEESE (VARIATION D)".
  // Guard: the remainder after the prefix must start with a continuation character to avoid
  // merging two separate consecutive recipe titles (FINNISH MILK FLATBREADS stays separate
  // from FINNISH POTATO FLATBREADS because "FINNISH" does not start with a continuation token).
  let firstStructuralHeading = baseHeading && (
    rawScored.find((c) => {
      if (!isStructuralHeading(c)) return false;
      const hLower = baseHeading.text.toLowerCase();
      const cLower = c.text.toLowerCase();
      return cLower.startsWith(hLower + " ") && /^[/&+:(]/.test(cLower.slice(hLower.length + 1));
    }) ?? baseHeading
  );

  // Pass 2: apply bonuses
  log("pass 2", "applying bonuses");
  const scored: Array<{ text: string; position: number; origin: CandidateOrigin; score: number; rawScore: number; baseScore: number; thresholdScore: number }> = rawScored.map((rs, candidateIndex) => {
    // Position factor: multiplicative tiebreaker — amplifies existing signal, doesn't replace it.
    // Use candidate-relative position (rank among candidates that passed hard filters) rather than
    // raw line position, so filtered preamble lines don't penalize the first real candidate.
    const candidateRelativePosition = candidateIndex / rawScored.length;
    const positionFactor = candidateRelativePosition < 0.5
      ? 1.0 + 0.12 * (1 - candidateRelativePosition * 2)
      : 1.0;

    // ALL_CAPS bonus: recipe books use ALL_CAPS for titles and section headings.
    // Single-word ALL_CAPS terms are overwhelmingly section/category labels, not recipe titles;
    // real recipe titles in ALL_CAPS are almost always multi-word. Reduce the bonus for single words.
    const allCapsBonus = isAllCaps(rs.text) && rs.text.replace(/[^a-zA-Z]/g, "").length >= 4
      ? (wordCount(rs.text) >= 2 ? 0.08 : 0.03)
      : 0;

    // Structural heading bonus: best ALL_CAPS heading (or its continuation join) is almost always the recipe title
    const structuralBonus = firstStructuralHeading && rs.text === firstStructuralHeading.text ? 0.10 : 0;

    // thresholdScore excludes structural bonus so the bonus doesn't inflate the threshold
    // and prevent equally-valid structural headings from passing on multi-recipe pages.
    const thresholdScore = rs.rawScore + allCapsBonus;
    // baseScore excludes position factor — used for diagnostics and ranking
    const baseScore = rs.rawScore + allCapsBonus + structuralBonus;
    const score = rs.rawScore * positionFactor + allCapsBonus + structuralBonus;
    return { text: rs.text, position: rs.position, origin: rs.origin, score, rawScore: rs.rawScore, baseScore, thresholdScore };
  });

  if (scored.length === 0) {
    return undefined;
  }

  // First-after-preamble bonus (Pattern 3): when lines before the first candidate were all
  // filtered/empty, the first surviving candidate occupies the structural "title position".
  // E.g. "FISH & SEAFOOD\nHalibut with Saffron Cream Sauce\n..." — "FISH & SEAFOOD" is filtered
  // as a section label, so "Halibut..." is the first candidate and gets this boost.
  const firstCandidate = scored[0];
  // Capture base score before positional bonuses to cap combined boost later
  let hasPipePreamble = false;
  const baseScoreBeforePositionalBonuses = firstCandidate.baseScore;
  if (firstCandidate.position > 0) {
    const allPrecedingFiltered = lines
      .slice(0, firstCandidate.position)
      .every((line) => {
        const trimmed = line.trim();
        return trimmed === "" || !passesHardFilters(trimmed) || isSectionLabel(trimmed);
      });
    if (allPrecedingFiltered) {
      // Stronger bonus when preamble contained structural markers (section labels, metadata)
      // vs. only empty lines — structural markers are stronger positional evidence.
      let hasStructuralPreamble = false;
      for (const line of lines.slice(0, firstCandidate.position)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        if (trimmed.includes(" | ")) {
          hasStructuralPreamble = true;
          hasPipePreamble = true;
        } else if (isSectionLabel(trimmed) || looksLikeMetadata(trimmed)) {
          hasStructuralPreamble = true;
        }
      }
      const preambleBonus = hasStructuralPreamble ? 0.12 : 0.08;
      firstCandidate.score += preambleBonus;
      firstCandidate.baseScore += preambleBonus;
      firstCandidate.thresholdScore += preambleBonus;
    }
  }
  // Direct-successor bonus: when the line immediately before this candidate is a
  // section label, metadata, or pipe-separated line, the candidate is very likely
  // the title that follows that header. This complements the first-after-preamble
  // bonus which requires ALL preceding lines to be filtered — this one fires even
  // when earlier non-filtered lines exist. Checked for the top 3 candidates only
  // (ci <= 2) to prevent the bonus from firing on random mid-document lines.
  for (let ci = 0; ci < scored.length && ci <= 2; ci++) {
    const candidate = scored[ci];
    if (candidate.position > 0) {
      // Scan backward past blank lines to find nearest non-empty preceding line
      let prevPos = candidate.position - 1;
      while (prevPos >= 0 && lines[prevPos].trim() === "") {
        prevPos--;
      }
      if (prevPos >= 0) {
        const prevLine = lines[prevPos].trim();
        const prevIsHeader =
          isSectionLabel(prevLine) ||
          looksLikeMetadata(prevLine) ||
          prevLine.includes(" | ");
        if (prevIsHeader) {
          candidate.score += 0.10;
          candidate.baseScore += 0.10;
          candidate.thresholdScore += 0.10;
        }
      }
    }
  }

  // Cap combined positional boost (position factor + first-after-preamble + direct-successor)
  // to avoid over-boosting when multiple bonuses fire together. Applied after all positional
  // bonuses so the cap covers all of them (per improvement plan: shared +0.15 max).
  // Raise cap slightly for pipe-separated metadata followed by ALL_CAPS candidate.
  // This is a near-certain title pattern in Polish cookbooks where MiniLM
  // (English-centric) gives weak embedding scores for Polish ALL_CAPS text.
  // hasPipePreamble is set above inside the allPrecedingFiltered block, so it is
  // only true when the preamble-bonus logic also fired (consistent gating).
  const maxPositionalBoost =
    hasPipePreamble && isAllCaps(firstCandidate.text) ? 0.22 : 0.15;
  const totalPositionalBoost = firstCandidate.score - baseScoreBeforePositionalBonuses;
  if (totalPositionalBoost > maxPositionalBoost) {
    const excess = totalPositionalBoost - maxPositionalBoost;
    firstCandidate.score -= excess;
    firstCandidate.baseScore -= excess;
    firstCandidate.thresholdScore -= excess;
  }

  log("pass 2 done");

  // --- Pre-threshold bilingual title detection ---
  // When a mixed-case candidate at position 0 is followed by an ALL_CAPS candidate
  // at position ≤ 2 that is semantically similar to it, this is a bilingual recipe
  // page (e.g., Polish title + ALL_CAPS Korean romanization). Suppress confirmed
  // translation candidates before computing threshold so their bonuses don't inflate
  // the threshold beyond the mixed-case title's reach.
  // Note: we check position ≤ 2 (local proximity), not global ALL_CAPS count, so
  // section headers later in the document (SKŁADNIKI, WARZYWA, etc.) are irrelevant.
  let translationCandidates: typeof scored = [];
  let scoredForThreshold = scored;
  const prePos0 = scored.find((s) => s.position === 0 && !isAllCaps(s.text));
  if (prePos0) {
    const nearbyAllCaps = scored.filter(
      (s) => isAllCaps(s.text) && s.position >= 1 && s.position <= 2 && s.origin === "single"
    );
    const pos0Embedding = rawScored.find((r) => r.text === prePos0.text)?.embedding;

    // Method 1: embedding similarity (works for related languages)
    if (pos0Embedding && nearbyAllCaps.length > 0) {
      translationCandidates = nearbyAllCaps.filter((cap) => {
        const capEmbedding = rawScored.find((r) => r.text === cap.text)?.embedding;
        if (!capEmbedding) return false;
        return cosineSimilarity(pos0Embedding, capEmbedding) > 0.4;
      });
    }

    // Method 2: layout-based detection (cross-lingual fallback).
    // When embedding similarity is insufficient (e.g. Polish ↔ Korean romanization),
    // detect bilingual layout by position and word overlap:
    // mixed-case ≥2 words at pos 0 + ALL_CAPS ≥2 words at pos 1-2 with no shared words.
    if (translationCandidates.length === 0 && wordCount(prePos0.text) >= 2) {
      const pos0Words = new Set(
        prePos0.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      );
      translationCandidates = nearbyAllCaps.filter((cap) => {
        if (wordCount(cap.text) < 2) return false;
        const capWords = cap.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        return !capWords.some((w) => pos0Words.has(w));
      });
    }

    if (translationCandidates.length > 0) {
      // Suppress standalone translations and any multi-line joins that embed the translation
      // as a suffix or substring (e.g. "Smażona zielona fasolka GREEN BEANS BORKEUM" ends with
      // the translation; "Title GREEN BEANS BORKEUM 그린빈" includes it as a substring).
      scoredForThreshold = scored.filter((s) => {
        const sLower = s.text.toLowerCase();
        return !translationCandidates.some((t) => {
          const tLower = t.text.toLowerCase();
          return sLower.startsWith(tLower) ||
                 sLower.endsWith(" " + tLower) ||
                 sLower.includes(" " + tLower);
        });
      });
    }
  }

  // Fix 2: If the structural heading was identified as a bilingual translation, reassign it.
  // This prevents the translation's ALL_CAPS bonus from inflating the threshold and ensures
  // the fallback path in scored also uses the correct heading.
  if (
    translationCandidates.length > 0 &&
    firstStructuralHeading &&
    translationCandidates.some((t) => t.text === firstStructuralHeading!.text)
  ) {
    const nonTranslationStructural = structuralCandidates.filter(
      (sc) => !translationCandidates.some((t) => t.text === sc.text)
    );
    const newHeading = nonTranslationStructural.length > 0
      ? nonTranslationStructural.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
      : undefined;

    // Patch scored array: remove old structural bonus, apply new one
    for (const s of scored) {
      if (s.text === firstStructuralHeading.text) {
        s.score -= 0.10;
        s.baseScore -= 0.10;
      }
      if (newHeading && s.text === newHeading.text) {
        s.score += 0.10;
        s.baseScore += 0.10;
      }
    }
    // Update reference for downstream prefix-removal logic
    firstStructuralHeading = newHeading ?? undefined;
  }

  // Subtitle suppression: when a short mixed-case title at position 0 is followed by a
  // longer mixed-case candidate at position 1-2, the longer one is a subtitle/translation.
  // Apply a penalty so the primary title (position 0) wins.
  const pos0Primary = scored.find((s) => s.position === 0 && !isAllCaps(s.text) && wordCount(s.text) <= 5);
  if (pos0Primary) {
    const subtitleCandidates = scored.filter((s) =>
      s.position >= 1 && s.position <= 2 &&
      !isAllCaps(s.text) &&
      wordCount(s.text) > wordCount(pos0Primary.text) + 2
    );
    for (const sub of subtitleCandidates) {
      sub.score -= 0.15;
    }
  }

  // Bilingual layout pattern: [FoodName (≤2 words)]\n[Translation (2-5 words, mixed-case)]\n...[Section label]
  // Common in bilingual cookbooks: foreign food name at position 0, English translation at position 1-2.
  // When detected, boost the position-0 candidate so it clears the threshold.
  // Note: the ALL_CAPS bilingual block above (lines 940-995) handles mixed-case + ALL_CAPS pairs.
  // This block handles mixed-case + mixed-case translation pairs — the two do not overlap because
  // the mixed-case guard (`biSecond.text !== biSecond.text.toUpperCase()`) excludes ALL_CAPS lines.
  if (scored.length >= 2) {
    const biFirst = scored.find((s) => s.position === 0);
    // Restrict to single-line candidates (same guard as the ALL_CAPS bilingual block at line 953)
    const biSecond = scored.find((s) => s.position >= 1 && s.position <= 2 && s !== biFirst && s.origin === "single");

    if (biFirst && biSecond) {
      const firstWords = biFirst.text.trim().split(/\s+/);
      const secondWords = biSecond.text.trim().split(/\s+/);

      const isBilingualLayout =
        firstWords.length <= 2 &&
        secondWords.length >= 2 &&
        secondWords.length <= 5 &&
        // Second line is mixed-case (not ALL_CAPS, not all-lower)
        biSecond.text !== biSecond.text.toUpperCase() &&
        biSecond.text !== biSecond.text.toLowerCase() &&
        // Second line is not an ingredient or instruction
        !looksLikeIngredient(biSecond.text) &&
        !looksLikeCookingInstruction(biSecond.text);

      if (isBilingualLayout) {
        // Check if a section label follows within a few lines after the first candidate
        const sectionLabelNearby = lines
          .slice(biFirst.position + 1, biFirst.position + 6)
          .some((line) => isSectionLabel(line.trim()));

        if (sectionLabelNearby) {
          biFirst.score += 0.15;
          biFirst.baseScore += 0.15;
          biFirst.thresholdScore += 0.15;
        }
      }
    }
  }

  log("bilingual detection done", `${translationCandidates.length} translations suppressed`);

  // Pre-filter: when ≥2 ALL_CAPS candidates are present, identify OCR artifacts (those whose
  // vocabulary has no support elsewhere in the document) and remove them before computing the
  // threshold. Artifacts like "DAT FLATBREADS" can inflate the threshold via their early-position
  // bonus, which causes legitimate titles later in the document to fall just below the cutoff.
  // Safety: only pre-filter if ≥2 candidates remain after removal (avoids false-positive removal
  // of unique-vocabulary titles on two-recipe pages).
  // NOTE: The ≥2 guard is conservative — when there are exactly 2 ALL_CAPS candidates and one is
  // an artifact, the artifact is NOT removed. Relaxing to ≥1 causes regressions because 3-line
  // join candidates (which span a section label) can pass corroboration via shared vocabulary,
  // while the legitimate short title fails. See "WORD ONE / INGREDIENTS / WORD TWO" test case.
  const allCapsInScored = scoredForThreshold.filter((s) => isAllCaps(s.text));
  if (allCapsInScored.length >= 2) {
    const artifactTexts = new Set(
      allCapsInScored
        .filter((cap) => !passesCorroboration(cap.text, cap.position, lines, burstEnd))
        .map((c) => c.text)
    );
    if (artifactTexts.size > 0) {
      const remainingCaps = allCapsInScored.filter((c) => !artifactTexts.has(c.text));
      if (remainingCaps.length >= 2) {
        scoredForThreshold = scoredForThreshold.filter((s) => !artifactTexts.has(s.text));
      }
    }
  }

  // Use thresholdScore (excludes structural bonus) so the structural bonus doesn't inflate
  // the threshold and block equally-valid headings on multi-recipe pages.
  const bestThresholdScore = Math.max(...scoredForThreshold.map((s) => s.thresholdScore));
  const threshold = Math.max(0.08, bestThresholdScore * 0.7);
  log("threshold", `${threshold.toFixed(4)} (best=${bestThresholdScore.toFixed(4)})`);

  // Filter candidates above threshold
  let selected = scoredForThreshold.filter((s) => s.score >= threshold);
  log("threshold filter", `${selected.length}/${scoredForThreshold.length} candidates survived`);

  // Empty-pool fallback: when threshold filtering discards every candidate,
  // the hard filters' structural verdict should not be overruled by weak
  // embedding differentiation. Return the best positional candidate only
  // if it has a meaningful positive raw score (avoids ingredient-list leakage).
  if (selected.length === 0 && scored.length > 0) {
    const fallback = scored
      .slice()
      .sort((a, b) => a.position - b.position || b.score - a.score);
    // Position-0 candidates that passed hard filters are very likely titles even with
    // weak embedding signal. Relax the rawScore guard for early-position candidates.
    const rawScoreThreshold = fallback[0].position <= 2 ? -0.05 : 0.02;
    if (fallback[0].rawScore > rawScoreThreshold) {
      selected = [fallback[0]];
    }
  }

  // Title-absent page guard: when the page starts mid-recipe (all of the first 3 non-empty
  // lines are ingredients or cooking instructions), require a much higher rawScore and
  // discard candidates deep in the file. This prevents stray body text or adjacent recipe
  // titles from being picked up on pages with no title (Pattern 4).
  if (titleAbsent) {
    const titleAbsentThreshold = 0.10;
    selected = selected.filter(s => s.rawScore >= titleAbsentThreshold);
    selected = selected.filter(s => s.position <= 2);
  }

  // Remove word-boundary prefixes of firstStructuralHeading when the heading itself survived
  // the threshold. Cases:
  //   ARAYES case:  firstStructuralHeading = "ARAYES SHRAK" (2-word join qualifies; "ARAYES"
  //     alone = 1 word, so it never qualified). Filter removes "ARAYES" so dedup keeps the join.
  //   SAFFRON case: baseHeading was the partial line; continuation logic above upgraded
  //     firstStructuralHeading to the full join. Filter removes the partial so dedup keeps join.
  // Safety: only fires when the complete heading itself is in selected (passed the threshold).
  if (firstStructuralHeading && selected.some((s) => s.text === firstStructuralHeading.text)) {
    const fshLower = firstStructuralHeading.text.toLowerCase();
    selected = selected.filter((s) => {
      if (s.text === firstStructuralHeading.text) return true;
      const sLower = s.text.toLowerCase();
      // Remove s if it is a space-delimited prefix of the structural heading
      return !fshLower.startsWith(sLower + " ");
    });
  }

  // Protect continuation joins: when a multi-line join (2-line or 3-line) survived the threshold
  // and its second part starts with a continuation character, remove the single-line prefix/suffix
  // so the dedup "shorter wins" rule doesn't destroy the complete join.
  // Note: pre-merged single candidates (Baked Eggs case) are handled by the separate filter below
  // (lines ~1501). This block covers the rarer case where a continuation-character join was
  // generated as a 2-line/3-line candidate and the prefix single also survived threshold
  // independently (e.g. from a different code path or OCR layout).
  // Safety: only fires for joins whose continuation starts with /&+:( — digit continuations
  // like "Pierogi Ruskie 200g mąki" are NOT protected, so dedup correctly keeps the shorter form.
  const survivingJoins = selected.filter((s) => s.origin === "2-line" || s.origin === "3-line");
  if (survivingJoins.length > 0) {
    selected = selected.filter((s) => {
      if (s.origin !== "single") return true;
      const sLower = s.text.toLowerCase();
      // Remove PREFIX singles whose continuation join also survived
      const isPrefixOfJoin = survivingJoins.some((j) => {
        const jLower = j.text.toLowerCase();
        if (!jLower.startsWith(sLower + " ")) return false;
        const remainder = jLower.slice(sLower.length + 1);
        return /^[/&+:(]/.test(remainder);
      });
      if (isPrefixOfJoin) return false;
      // Remove SUFFIX singles (e.g. "& Coriander") whose parent join also survived
      const isSuffixOfJoin = survivingJoins.some((j) => {
        const jLower = j.text.toLowerCase();
        if (!jLower.endsWith(" " + sLower)) return false;
        // Only remove if the suffix starts with a continuation character
        return /^[/&+:(]/.test(sLower);
      });
      if (isSuffixOfJoin) return false;
      return true;
    });
  }

  // Safety net: remove pre-merged continuation prefix singles when a longer merged single
  // also survived the threshold. Normally buildCandidates only emits the standalone when the
  // merged form fails hard filters (so both can't coexist), but this guard handles any edge
  // case where both forms enter `selected` (e.g. from different OCR repair code paths).
  selected = selected.filter((s) => {
    if (s.origin !== "single") return true;
    const sLower = s.text.toLowerCase();
    // Remove s if a longer single candidate exists that is a continuation extension of s
    return !selected.some((other) => {
      if (other === s || other.origin !== "single") return false;
      const oLower = other.text.toLowerCase();
      if (!oLower.startsWith(sLower + " ")) return false;
      const remainder = oLower.slice(sLower.length + 1);
      return /^[/&+:(]/.test(remainder);
    });
  });

  // Pre-dedup: remove sub-section headers that are substrings of other surviving candidates.
  // A sub-section header is an ALL_CAPS candidate followed by ingredient-like lines in the source.
  // Example: "CHLEBEK" (bread section header, followed by "500 g mąki") is a substring of
  // "CHLEBEK Z WARZYWAMI I BOCZKIEM" (the real title). Without this filter, dedup kills the title.
  selected = selected.filter((candidate) => {
    if (!isAllCaps(candidate.text)) return true;
    // Check if this candidate is immediately followed by ingredient-like content
    const nextSourceLines = lines.slice(candidate.position + 1, candidate.position + 2);
    const followedByIngredients = nextSourceLines.some(
      (l) => looksLikeIngredient(l.trim()) || startsWithNumber(l.trim())
    );
    if (!followedByIngredients) return true;
    // Only remove if a longer candidate contains this one as a substring
    const candidateLower = candidate.text.toLowerCase();
    const hasLongerParent = rawScored.some(
      (other) =>
        other.text !== candidate.text &&
        other.text.length > candidate.text.length &&
        other.text.toLowerCase().includes(candidateLower)
    );
    return !hasLongerParent;
  });

  // Protect multi-line joins from being destroyed by their own component singles.
  // When "Lamb Stew" (2-line join) survives AND both "Lamb" and "Stew" (singles) also survive,
  // the join is the intended title — remove the singles.
  const joinsToProtect = selected.filter((s) => s.origin === "2-line" || s.origin === "3-line");
  if (joinsToProtect.length > 0) {
    const singlesToRemove = new Set<string>();
    for (const join of joinsToProtect) {
      const joinWords = join.text.split(/\s+/);
      const componentSingles = selected.filter(
        (s) => s.origin === "single" && joinWords.some((w) => s.text.toLowerCase() === w.toLowerCase())
      );
      if (componentSingles.length >= Math.min(joinWords.length, 2)) {
        componentSingles.forEach((s) => singlesToRemove.add(s.text));
      }
    }
    if (singlesToRemove.size > 0) {
      selected = selected.filter((s) => s.origin !== "single" || !singlesToRemove.has(s.text));
    }
  }

  // Protect position-0 compound titles from distant sub-section headers.
  // When a position-0 compound title is longer and contains a shorter candidate
  // that appears > 10 lines later, remove the distant candidate so the dedup
  // (shorter-wins rule) doesn't destroy the compound title.
  const pos0Compounds = selected.filter((s) => s.position === 0);
  if (pos0Compounds.length > 0) {
    selected = selected.filter((s) => {
      if (s.position === 0) return true;
      const sLower = s.text.toLowerCase();
      return !pos0Compounds.some(
        (p0) =>
          p0.position + 10 < s.position &&
          s.text.length < p0.text.length &&
          p0.text.toLowerCase().includes(sLower)
      );
    });
  }

  log("post-threshold cleanup done", `${selected.length} candidates remain`);

  // Deduplicate: if one title is a substring of another, keep the shorter (more focused) one.
  // DO NOT CHANGE THIS LOGIC — it has been incorrectly "improved" by the title-loop 5 times.
  // The tests require shorter wins: "Pierogi Ruskie" over "Pierogi Ruskie 200g mąki 3 ziemniaki".
  // The pre-filter above handles the conflicting case (structural heading prefix removal) so that
  // the incomplete prefix line is never present here when the complete join is in selected.
  selected = selected.filter((a) => {
    const aLower = a.text.toLowerCase();
    // Protect compound titles — these use explicit separators and the full form is intentional
    if (/ [+:&] /.test(a.text)) return true;
    return !selected.some((b) => {
      if (b === a) return false;
      if (b.text.length >= a.text.length) return false;
      if (!aLower.includes(b.text.toLowerCase())) return false;

      // Protect multi-line joins whose suffix over the shorter candidate is a food-category label.
      // E.g., "LEMON HERB ROASTED VEGETABLES" (2-line) vs "LEMON HERB ROASTED" (single):
      // "VEGETABLES" is in CATEGORY_SECTION_LABELS — keep the full joined form.
      // Use startsWith (not includes) to ensure b is a true prefix, not a mid-string match.
      if ((a.origin === "2-line" || a.origin === "3-line") &&
          aLower.startsWith(b.text.toLowerCase() + " ")) {
        const suffix = a.text.slice(b.text.length).trim();
        const suffixNorm = stripDiacritics(suffix.toLowerCase());
        if (CATEGORY_SECTION_LABELS.has(suffixNorm)) {
          return false; // Don't remove `a` — its suffix is a food-category label
        }
      }

      return true;
    });
  });

  log("dedup done", `${selected.length} candidates remain`);

  // Multi-title guard: only join multiple candidates with "+" when there is
  // structural evidence of a multi-recipe page (≥2 ALL_CAPS headings).
  // A single ALL_CAPS title among mixed-case survivors is a single-recipe page —
  // collapse to the highest-scoring candidate.
  // Zero ALL_CAPS survivors → apply positional tiebreak only when candidates are
  // spread far apart (>10 lines), which indicates body-text leakage. Closely-
  // positioned candidates are likely genuine multi-recipe content.
  if (selected.length > 1) {
    const allCapsSelected = selected.filter((s) => isAllCaps(s.text));
    if (allCapsSelected.length >= 2) {
      // Vocabulary corroboration: filter out ALL_CAPS candidates whose content words
      // don't appear elsewhere in the document. This catches orphaned OCR artifacts
      // (e.g., "DAT FLATBREADS" from a preceding page) that look structurally identical
      // to real titles but have no vocabulary support in the document body.
      const corroboratedCaps = allCapsSelected.filter((cap) =>
        passesCorroboration(cap.text, cap.position, lines, burstEnd)
      );

      // Use corroborated candidates if any remain; otherwise fall back to original set
      // (don't remove all candidates — that would break legitimate multi-title pages
      // where corroboration fails for benign reasons).
      const capsToUse = corroboratedCaps.length >= 2 ? corroboratedCaps : allCapsSelected;

      // Check whether non-first ALL_CAPS headings are section headers within one recipe
      // (followed immediately by ingredient-like content) rather than separate recipe titles.
      // A multi-recipe page has body text between titles; a single-recipe page has
      // ingredient lines immediately after each section heading.
      const sortedCaps = [...capsToUse].sort((a, b) => a.position - b.position);
      const isSubHeader = sortedCaps.slice(1).every((cap) => {
        const nextLines = lines.slice(cap.position + 1, cap.position + 3);
        return nextLines.some(
          (l) => looksLikeIngredient(l.trim()) || startsWithNumber(l.trim())
        );
      });
      if (isSubHeader) {
        selected = [sortedCaps[0]];
      } else {
        selected = capsToUse;
      }
    } else if (allCapsSelected.length === 1) {
      const theCapCandidate = allCapsSelected[0];
      // Use non-empty line count so the 75% threshold is consistent regardless of blank-line density.
      const nonEmptyCount = lines.filter((l) => l.trim().length > 0).length;
      const capRelPos = theCapCandidate.position / Math.max(nonEmptyCount, 1);
      // If the sole ALL_CAPS candidate is in the last 25% of the document,
      // it's likely a category footer, not a title. Prefer the best earlier candidate.
      if (capRelPos > 0.75) {
        const earlierCandidates = selected.filter(
          (s) => s.position / Math.max(nonEmptyCount, 1) <= 0.75
        );
        if (earlierCandidates.length > 0) {
          selected = [earlierCandidates.reduce((a, b) => (a.score > b.score ? a : b))];
        } else {
          // All candidates are in the last 25% — no positional basis to prefer one over another;
          // fall back to score, accepting that the guard cannot help here.
          selected = [selected.reduce((a, b) => (a.score > b.score ? a : b))];
        }
      } else {
        selected = [selected.reduce((a, b) => (a.score > b.score ? a : b))];
      }
    } else {
      // Zero ALL_CAPS survivors → mixed-case page.
      // If all survivors are closely positioned (within 10 lines of each other), keep them all —
      // they're likely genuine multi-recipe content on a single page.
      // If any survivor is far from the earliest, apply a positional tiebreak: the real title
      // is almost always the earliest candidate; distant survivors are likely body-text leakage.
      selected.sort((a, b) => a.position - b.position);
      const earliest = selected[0];
      const farthest = selected[selected.length - 1];
      if (farthest.position - earliest.position > 10) {
        // Large span → body-text leakage. Collapse to one: prefer the highest-scoring
        // candidate within 3 positions of the earliest (position tolerance for OCR gaps),
        // falling back to the earliest itself if none score higher.
        const closeCompetitors = selected.filter(
          (s) => s.position <= earliest.position + 3 && s.score > earliest.score
        );
        selected = closeCompetitors.length > 0
          ? [closeCompetitors.reduce((a, b) => (a.score > b.score ? a : b))]
          : [earliest];
      }
      // Span ≤ 10 → all survivors are closely positioned; fall through keeping all.
    }
  }

  log("multi-title guard done", `${selected.length} candidates remain`);

  // Cap at 3, sort by document position
  selected.sort((a, b) => a.position - b.position);
  selected = selected.slice(0, 3);

  if (selected.length === 0) {
    // Last resort: embedding scoring provided no usable signal.
    // Return the earliest candidate that passed hard filters — it already survived
    // ingredient, metadata, garbled, section-label, and cooking-instruction checks.
    // Position 0 in a recipe file is overwhelmingly the title.
    // Exclude hard-disqualified candidates (rawScore -1.0 = truncated OCR artifact).
    const lastResort = scored
      .slice()
      .filter((s) => s.rawScore > -0.5)
      .sort((a, b) => a.position - b.position || b.score - a.score);
    if (lastResort.length > 0) {
      const result = normalizeOcrTitle(lastResort[0].text.normalize("NFC").trim());
      log("done (last resort)", `"${result}"`);
      return result;
    }
    log("done", "no result");
    return undefined;
  }

  const result = selected.map((s) => normalizeOcrTitle(s.text.normalize("NFC").trim())).join(" + ");

  log("done", `"${result}"`);
  return result;
}

/**
 * Extract potential recipe title from OCR text (sync heuristic fallback)
 */
export function extractTitle(text: string): string | undefined {
  if (!text || text.trim().length === 0) {
    return undefined;
  }

  const lines = text.split("\n").map((line) => line.trim());

  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.length < 3 || line.length > 50) continue;
    if (looksLikeIngredient(line)) continue;
    if (isAllCaps(line)) continue;
    if (startsWithNumber(line)) continue;
    return line;
  }

  return undefined;
}
