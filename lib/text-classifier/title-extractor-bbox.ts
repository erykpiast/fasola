/**
 * Geometric title extraction from OCR bounding-box data.
 *
 * Faithful TypeScript port of the Python algorithm in
 * tools/title-loop/analyze_bboxes.py (lines 28-1091).
 *
 * Pure computation — no external dependencies.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

interface BboxObservation {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}


interface Region {
  observations: Array<BboxObservation>;
  bbox: { x: number; y: number; width: number; height: number };
  lines: number;
  text: string;
  char_density: number;
  mean_line_height: number;
}

// ── Evaluation helpers ─────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

function stripDiacritics(s: string): string {
  s = s.replace(/ł/g, "l").replace(/Ł/g, "L");
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function ocrNormalize(s: string): string {
  return s.replace(/0/g, "O").replace(/1/g, "I").replace(/5/g, "S");
}

export function normForMatch(s: string): string {
  s = normalize(s);
  // Strip quotes and apostrophes (OCR decorations / Polish „ quotes)
  s = s.replace(/["\u0027\u2018\u2019\u201C\u201D\u201E\u201F`]/g, "");
  // OCR: pipe is often misread letter I
  s = s.replace(/\|/g, "I");
  // Ensure consistent tokenization around &
  s = s.replace(/&/g, " & ");
  s = s.replace(/-/g, " ").replace(/_/g, " ");
  // Re-collapse whitespace after replacements
  s = s.replace(/\s+/g, " ").trim();
  return ocrNormalize(stripDiacritics(s));
}

function levenshtein(a: string, b: string): number {
  if (a.length < b.length) {
    return levenshtein(b, a);
  }
  if (b.length === 0) {
    return a.length;
  }
  let prev: Array<number> = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const curr: Array<number> = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = ca === b[j] ? 0 : 1;
      curr.push(Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost));
    }
    prev = curr;
  }
  return prev[prev.length - 1];
}

function checkRecall(
  extractedNorm: string,
  expectedParts: Array<string>,
  extractedWordList: Array<string>,
): boolean {
  // Primary: substring containment
  if (expectedParts.every((part) => extractedNorm.includes(part))) {
    return true;
  }

  // Fallback: word-level matching
  const extractedWords = new Set(extractedWordList);
  if (
    expectedParts.every((part) =>
      part.split(" ").every((w) => extractedWords.has(w)),
    )
  ) {
    return true;
  }

  // Fallback: adjacent word-pair concatenation
  const adjacentPairs = new Set<string>();
  for (let i = 0; i < extractedWordList.length - 1; i++) {
    adjacentPairs.add(extractedWordList[i] + extractedWordList[i + 1]);
  }
  const allForms = new Set([...extractedWords, ...adjacentPairs]);
  if (
    expectedParts.every((part) =>
      part.split(" ").every((w) => allForms.has(w)),
    )
  ) {
    return true;
  }

  // Fallback: fuzzy word matching
  function fuzzyWordMatch(w: string, wordList: Array<string>): boolean {
    const thresh = w.length >= 5 ? 2 : 1;
    return wordList.some((ew) => levenshtein(w, ew) <= thresh);
  }

  if (
    expectedParts.every((part) =>
      part.split(" ").every((w) => fuzzyWordMatch(w, extractedWordList)),
    )
  ) {
    return true;
  }

  // Fallback: suffix/prefix matching
  function suffixWordMatch(w: string, wordList: Array<string>): boolean {
    if (fuzzyWordMatch(w, wordList)) {
      return true;
    }
    if (w.length < 4) {
      return false;
    }
    for (const ew of wordList) {
      if (ew.length < 4) {
        continue;
      }
      const shorter = Math.min(w.length, ew.length);
      const longer = Math.max(w.length, ew.length);
      if (shorter < longer * 0.5) {
        continue;
      }
      if (
        w.endsWith(ew) ||
        ew.endsWith(w) ||
        w.startsWith(ew) ||
        ew.startsWith(w)
      ) {
        return true;
      }
    }
    return false;
  }

  if (
    expectedParts.every((part) =>
      part.split(" ").every((w) => suffixWordMatch(w, extractedWordList)),
    )
  ) {
    return true;
  }

  // Fallback: merged-word matching
  for (const part of expectedParts) {
    const words = part.split(" ");
    let i = 0;
    while (i < words.length) {
      const w = words[i];
      if (fuzzyWordMatch(w, extractedWordList)) {
        i += 1;
        continue;
      }
      // Try concatenating with next word
      if (i + 1 < words.length && w.length <= 2) {
        const merged = w + words[i + 1];
        if (fuzzyWordMatch(merged, extractedWordList)) {
          i += 2;
          continue;
        }
      }
      return false;
    }
    // all words in this part matched
  }
  return true;
}

function checkPrecision(
  extractedNorm: string,
  expectedParts: Array<string>,
): boolean {
  const expectedWordCount = expectedParts.reduce(
    (sum, p) => sum + p.split(" ").length,
    0,
  );
  const extractedWordCount = extractedNorm.split(" ").length;
  const maxAllowed = Math.max(expectedWordCount * 2, expectedWordCount + 4);
  return extractedWordCount <= maxAllowed;
}

export function titlesMatch(
  extracted: string | undefined,
  expected: string,
): boolean {
  if (extracted === undefined || extracted === "") {
    return false;
  }
  const extractedNorm = normForMatch(extracted);
  const expectedParts = expected.split("+").map((p) => normForMatch(p));
  const extractedWordList = extractedNorm.split(" ");

  if (!checkRecall(extractedNorm, expectedParts, extractedWordList)) {
    return false;
  }
  return checkPrecision(extractedNorm, expectedParts);
}

// ── Constants ──────────────────────────────────────────────────────────────────

const _MEASUREMENT_RE = new RegExp(
  "\\b\\d+\\s*(g|ml|kg|cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|" +
    "łyżka|łyżki|łyżek|łyżeczka|szklanka|szklanki|szczypta|garść)\\b",
  "i",
);

const _SECTION_LABELS = new Set([
  // English
  "ingredients",
  "directions",
  "instructions",
  "method",
  "preparation",
  "steps",
  "notes",
  "tip",
  "tips",
  "variations",
  "garnish",
  "topping",
  "serving",
  "glaze",
  "filling",
  "frosting",
  // Polish (no diacritics)
  "skladniki",
  "przygotowanie",
  "sposob przygotowania",
  "sposob wykonania",
  "wykonanie",
  "wskazowki",
  "sos",
  "nadzienie",
  "polewa",
  "ciasto",
  "instrukcje",
  "uwagi",
  "notatki",
  "podawanie",
]);

const _RECIPE_METADATA_RE = new RegExp(
  "\\b(DLA\\s+\\d+\\s+OSOB|GOTOWANIE\\s+\\d|PRZYGOTOWANIE\\s+\\d|MROZENIE\\s+\\d|OCZEKIWANIE\\s+\\d" +
    "|PORCJ[EI]\\b|\\d+\\s*PORCJ[EI]\\b" +
    "|\\bSERVES\\s+\\d|\\bMAKES\\s*:?\\s*\\d|\\bYIELDS?\\b" +
    "|\\d+\\s*GODZIN)",
  "i",
);

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Equivalent to Python's str.isalpha(): matches any Unicode letter. */
const _ALPHA_RE = /\p{L}/u;

function isAlpha(c: string): boolean {
  return _ALPHA_RE.test(c);
}

function mean(arr: Array<number>): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Python-compatible banker's rounding (round half to even).
 * JS Math.round always rounds 0.5 up; Python rounds 0.5 to the nearest even.
 */
function bankersRound(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  // If fractional part is exactly 0.5, round to even
  if (Math.abs(frac - 0.5) < 1e-9) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(x);
}

// ── Core algorithm ─────────────────────────────────────────────────────────────

function findSameYGroups(
  observations: Array<BboxObservation>,
  yTolerance: number = 0.03,
  heightRatio: number = 0.5,
): Array<Array<BboxObservation>> {
  if (observations.length === 0) {
    return [];
  }

  const sortedObs = [...observations].sort(
    (a, b) => a.bbox.y - b.bbox.y,
  );
  const groups: Array<Array<BboxObservation>> = [];
  let currentGroup: Array<BboxObservation> = [sortedObs[0]];

  for (let i = 1; i < sortedObs.length; i++) {
    const obs = sortedObs[i];
    const prev = currentGroup[currentGroup.length - 1];
    const yDiff = Math.abs(obs.bbox.y - prev.bbox.y);
    const hPrev = prev.bbox.height;
    const hCurr = obs.bbox.height;
    let ratio: number;
    if (hPrev > 0 && hCurr > 0) {
      ratio = Math.min(hPrev, hCurr) / Math.max(hPrev, hCurr);
    } else {
      ratio = 0;
    }
    if (yDiff < yTolerance && ratio > heightRatio) {
      currentGroup.push(obs);
    } else {
      groups.push(currentGroup);
      currentGroup = [obs];
    }
  }

  groups.push(currentGroup);
  return groups;
}

function detectColumns(
  observations: Array<BboxObservation>,
  minGap: number = 0.025,
): Array<Array<BboxObservation>> {
  if (observations.length < 6) {
    return [observations];
  }

  // Collect all right-edges and left-edges as candidate split points
  const edges = new Set<number>();
  for (const o of observations) {
    edges.add(
      bankersRound((o.bbox.x + o.bbox.width) * 1000) / 1000,
    );
    edges.add(bankersRound(o.bbox.x * 1000) / 1000);
  }

  let bestSplit: number | undefined = undefined;
  let bestScore = -1;

  const sortedEdges = [...edges].sort((a, b) => a - b);

  for (const splitX of sortedEdges) {
    if (splitX < 0.15 || splitX > 0.85) {
      continue;
    }

    const left: Array<BboxObservation> = [];
    const right: Array<BboxObservation> = [];
    let straddling = 0;

    for (const o of observations) {
      const ox = o.bbox.x;
      const oRight = ox + o.bbox.width;

      if (oRight <= splitX + 0.01) {
        left.push(o);
      } else if (ox >= splitX - 0.01) {
        right.push(o);
      } else {
        straddling += 1;
      }
    }

    if (left.length < 3 || right.length < 3) {
      continue;
    }

    // Check that there's actually a gap at this position
    if (left.length > 0 && right.length > 0) {
      const leftMaxRight = Math.max(
        ...left.map((o) => o.bbox.x + o.bbox.width),
      );
      const rightMinLeft = Math.min(...right.map((o) => o.bbox.x));
      const gap = rightMinLeft - leftMaxRight;
      if (gap < minGap) {
        continue;
      }
    }

    // Reject splits where too many observations straddle the boundary
    const total = left.length + right.length + straddling;
    if (straddling / total > 0.2) {
      continue;
    }

    // Score: maximize clean splits, penalize straddling
    const score = left.length + right.length - straddling * 3;

    if (score > bestScore) {
      bestScore = score;
      bestSplit = splitX;
    }
  }

  if (bestSplit === undefined) {
    return [observations];
  }

  // Split observations at bestSplit; straddling ones go to whichever side their center falls
  const leftCol: Array<BboxObservation> = [];
  const rightCol: Array<BboxObservation> = [];
  for (const o of observations) {
    const centerX = o.bbox.x + o.bbox.width / 2;
    if (centerX < bestSplit) {
      leftCol.push(o);
    } else {
      rightCol.push(o);
    }
  }

  if (leftCol.length < 3 || rightCol.length < 3) {
    return [observations];
  }

  return [leftCol, rightCol];
}

function clusterColumn(
  observations: Array<BboxObservation>,
  yTolerance: number,
  regionGap: number,
): Array<Region> {
  if (observations.length === 0) {
    return [];
  }

  // Step 1: Sort by Y
  const sortedObs = [...observations].sort(
    (a, b) => a.bbox.y - b.bbox.y,
  );

  // Step 2: Group into horizontal bands by Y proximity
  const rawBands: Array<Array<BboxObservation>> = [];
  let currentBand: Array<BboxObservation> = [sortedObs[0]];

  for (let i = 1; i < sortedObs.length; i++) {
    const obs = sortedObs[i];
    const prev = currentBand[currentBand.length - 1];
    const yDiff = Math.abs(obs.bbox.y - prev.bbox.y);
    if (yDiff < yTolerance) {
      currentBand.push(obs);
    } else {
      rawBands.push(currentBand);
      currentBand = [obs];
    }
  }
  rawBands.push(currentBand);

  // Step 2b: Sub-split bands by height similarity.
  const bands: Array<Array<BboxObservation>> = [];
  for (const rawBand of rawBands) {
    if (rawBand.length <= 1) {
      bands.push(rawBand);
      continue;
    }
    const byHeight = [...rawBand].sort(
      (a, b) => a.bbox.height - b.bbox.height,
    );
    let subBand: Array<BboxObservation> = [byHeight[0]];
    for (let i = 1; i < byHeight.length; i++) {
      const obs = byHeight[i];
      const prevH = subBand[subBand.length - 1].bbox.height;
      const currH = obs.bbox.height;
      const ratio = currH > 0 ? prevH / currH : 0;
      if (ratio > 0.8) {
        subBand.push(obs);
      } else {
        // Re-sort by Y before appending
        bands.push([...subBand].sort((a, b) => a.bbox.y - b.bbox.y));
        subBand = [obs];
      }
    }
    bands.push([...subBand].sort((a, b) => a.bbox.y - b.bbox.y));
  }

  // Step 3: Merge adjacent bands into regions
  const regions: Array<Array<BboxObservation>> = [bands[0]];

  for (let bandIdx = 1; bandIdx < bands.length; bandIdx++) {
    const band = bands[bandIdx];
    const prevRegion = regions[regions.length - 1];
    // prevRegion is always a flat array of observations in our TS port
    const prevAll = prevRegion;

    // Compute vertical gap
    const prevMaxBottom = Math.max(
      ...prevAll.map((o) => o.bbox.y + o.bbox.height),
    );
    const currMinTop = Math.min(...band.map((o) => o.bbox.y));
    const gap = currMinTop - prevMaxBottom;

    // Compute X overlap
    const prevMinX = Math.min(...prevAll.map((o) => o.bbox.x));
    const prevMaxX = Math.max(
      ...prevAll.map((o) => o.bbox.x + o.bbox.width),
    );
    const currMinX = Math.min(...band.map((o) => o.bbox.x));
    const currMaxX = Math.max(
      ...band.map((o) => o.bbox.x + o.bbox.width),
    );

    const overlapStart = Math.max(prevMinX, currMinX);
    const overlapEnd = Math.min(prevMaxX, currMaxX);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const narrowerWidth = Math.min(
      prevMaxX - prevMinX,
      currMaxX - currMinX,
    );
    const xOverlapRatio =
      narrowerWidth > 0 ? overlap / narrowerWidth : 0;

    // Check line height consistency
    const prevMeanH = mean(prevAll.map((o) => o.bbox.height));
    const currMeanH = mean(band.map((o) => o.bbox.height));
    let heightRatio: number;
    if (prevMeanH > 0 && currMeanH > 0) {
      heightRatio =
        Math.min(prevMeanH, currMeanH) / Math.max(prevMeanH, currMeanH);
    } else {
      heightRatio = 0;
    }

    // Check line width consistency
    const prevSpan = prevMaxX - prevMinX;
    const currSpan = currMaxX - currMinX;
    let widthRatio: number;
    if (prevSpan > 0 && currSpan > 0) {
      widthRatio =
        Math.min(prevSpan, currSpan) / Math.max(prevSpan, currSpan);
    } else {
      widthRatio = 0;
    }

    if (
      gap < regionGap &&
      xOverlapRatio > 0.5 &&
      heightRatio > 0.8 &&
      widthRatio > 0.5
    ) {
      // Merge into current region
      regions[regions.length - 1] = [...prevAll, ...band];
    } else {
      regions.push(band);
    }
  }

  // Step 4: Compute region properties
  const result: Array<Region> = [];
  for (const regionObs of regions) {
    const flat = regionObs;

    const allX = flat.map((o) => o.bbox.x);
    const allY = flat.map((o) => o.bbox.y);
    const allR = flat.map((o) => o.bbox.x + o.bbox.width);
    const allB = flat.map((o) => o.bbox.y + o.bbox.height);

    const bboxX = Math.min(...allX);
    const bboxY = Math.min(...allY);
    const bboxW = Math.max(...allR) - bboxX;
    const bboxH = Math.max(...allB) - bboxY;

    // Count lines by re-grouping observations within this region by Y
    const lineGroups = findSameYGroups(flat, yTolerance);
    const numLines = lineGroups.length;

    // Concatenate text (left-to-right within each line, top-to-bottom)
    const textParts: Array<string> = [];
    for (const lineGroup of lineGroups) {
      const sortedLine = [...lineGroup].sort(
        (a, b) =>
          bankersRound(a.bbox.x * 100) / 100 -
            bankersRound(b.bbox.x * 100) / 100 ||
          a.bbox.y - b.bbox.y,
      );
      textParts.push(sortedLine.map((o) => o.text).join(" "));
    }
    const text = textParts.join(" ");

    const area = bboxW > 0 && bboxH > 0 ? bboxW * bboxH : 1;
    const charDensity = text.length / area;
    const meanLineHeight = mean(flat.map((o) => o.bbox.height));

    result.push({
      observations: flat,
      bbox: { x: bboxX, y: bboxY, width: bboxW, height: bboxH },
      lines: numLines,
      text,
      char_density: charDensity,
      mean_line_height: meanLineHeight,
    });
  }

  return result;
}

function clusterIntoRegions(
  observations: Array<BboxObservation>,
  yTolerance: number = 0.05,
  regionGap: number = 0.04,
): Array<Region> {
  if (observations.length === 0) {
    return [];
  }

  // Step 0: Detect columns
  const columns = detectColumns(observations);

  let allRegions: Array<Region> = [];
  for (const colObs of columns) {
    const colRegions = clusterColumn(colObs, yTolerance, regionGap);
    allRegions = allRegions.concat(colRegions);
  }

  // Step 5: Post-merge stacked title lines.
  allRegions = mergeStackedTitleLines(allRegions);

  return allRegions;
}

function mergeStackedTitleLines(regions: Array<Region>): Array<Region> {
  if (regions.length < 2) {
    return regions;
  }

  // Group regions by left edge (quantize to 0.05)
  const xGroups = new Map<number, Array<Region>>();
  for (const region of regions) {
    const xBucket =
      bankersRound(region.bbox.x * 20) / 20; // quantize to 0.05
    let group = xGroups.get(xBucket);
    if (group === undefined) {
      group = [];
      xGroups.set(xBucket, group);
    }
    group.push(region);
  }

  const mergedAll: Array<Region> = [];

  for (const [, group] of xGroups) {
    // Sort by Y within the group
    group.sort((a, b) => a.bbox.y - b.bbox.y);

    const merged: Array<Region> = [group[0]];

    for (let i = 1; i < group.length; i++) {
      const region = group[i];
      const prev = merged[merged.length - 1];

      // Current region must be small; accumulated can be larger
      const currSmall =
        region.lines <= 2 && region.text.length < 40;
      const prevNotHuge =
        prev.lines <= 10 && prev.text.length < 250;

      if (!(prevNotHuge && currSmall)) {
        merged.push(region);
        continue;
      }

      // Check left alignment (within 0.03)
      if (Math.abs(prev.bbox.x - region.bbox.x) > 0.03) {
        merged.push(region);
        continue;
      }

      // Check line height similarity (within 60%)
      // Relaxed from 0.6 to 0.4
      const prevH = prev.mean_line_height;
      const currH = region.mean_line_height;
      let hRatio: number;
      if (prevH > 0 && currH > 0) {
        hRatio = Math.min(prevH, currH) / Math.max(prevH, currH);
      } else {
        hRatio = 0;
      }
      if (hRatio < 0.4) {
        merged.push(region);
        continue;
      }

      // Check vertical proximity (gap < 0.08)
      const prevBottom = prev.bbox.y + prev.bbox.height;
      const currTop = region.bbox.y;
      const gap = currTop - prevBottom;
      if (gap > 0.08) {
        merged.push(region);
        continue;
      }

      // Merge
      const combinedObs = [
        ...prev.observations,
        ...region.observations,
      ];
      const combAllX = combinedObs.map((o) => o.bbox.x);
      const combAllY = combinedObs.map((o) => o.bbox.y);
      const combAllR = combinedObs.map(
        (o) => o.bbox.x + o.bbox.width,
      );
      const combAllB = combinedObs.map(
        (o) => o.bbox.y + o.bbox.height,
      );

      const sortedCombObs = [...combinedObs].sort(
        (a, b) =>
          bankersRound(a.bbox.y * 100) / 100 -
            bankersRound(b.bbox.y * 100) / 100 ||
          bankersRound(a.bbox.x * 100) / 100 -
            bankersRound(b.bbox.x * 100) / 100,
      );
      const text = sortedCombObs.map((o) => o.text).join(" ");

      const bboxX = Math.min(...combAllX);
      const bboxY = Math.min(...combAllY);
      const bboxW = Math.max(...combAllR) - bboxX;
      const bboxH = Math.max(...combAllB) - bboxY;
      const area = bboxW > 0 && bboxH > 0 ? bboxW * bboxH : 1;

      merged[merged.length - 1] = {
        observations: combinedObs,
        bbox: { x: bboxX, y: bboxY, width: bboxW, height: bboxH },
        lines: prev.lines + region.lines,
        text,
        char_density: text.length / area,
        mean_line_height: mean(
          combinedObs.map((o) => o.bbox.height),
        ),
      };
    }

    mergedAll.push(...merged);
  }

  return mergedAll;
}

function scoreTitleRegion(
  region: Region,
  maxMlh: number,
  maxDensity: number,
): number {
  // Line count score
  const n = region.lines;
  let lineCountScore: number;
  if (n <= 1) {
    lineCountScore = 0.75;
  } else if (n <= 3) {
    lineCountScore = 1.0;
  } else if (n <= 6) {
    lineCountScore = Math.max(0.2, 1 - (n - 3) / 5);
  } else {
    lineCountScore = 0.1;
  }

  // Relative line height
  const relativeLineHeight =
    maxMlh > 0 ? region.mean_line_height / maxMlh : 0;

  // Vertical position
  const y = region.bbox.y;
  let verticalPosition: number;
  if (y < 0.3) {
    verticalPosition = 1.0;
  } else if (y < 0.5) {
    verticalPosition = 0.5;
  } else {
    verticalPosition = 0.1;
  }

  // Character density
  const charDensityScore =
    maxDensity > 0
      ? 1 - Math.min(region.char_density / maxDensity, 1)
      : 0;

  // Text length
  const textLengthScore = Math.max(
    0,
    1 - region.text.length / 100,
  );

  // ALL_CAPS boost, scaled by relative line height
  const alphaChars = [...region.text].filter(isAlpha);
  const upperRatio =
    alphaChars.length > 0
      ? alphaChars.filter((c) => c === c.toUpperCase()).length /
        alphaChars.length
      : 0;
  const capsBoost =
    (upperRatio > 0.8 ? 1.0 : 0.0) * relativeLineHeight;

  // Region width
  const regionWidth = region.bbox.width;
  const widthScore = Math.min(regionWidth / 0.3, 1.0);

  // Gutter noise penalty
  let gutterPenalty = 0.0;
  if (
    region.mean_line_height > 0.035 &&
    region.bbox.width < 0.2 &&
    region.bbox.x < 0.1
  ) {
    gutterPenalty = 0.3;
  }

  return (
    0.2 * lineCountScore +
    0.15 * relativeLineHeight +
    0.25 * verticalPosition +
    0.1 * charDensityScore +
    0.05 * textLengthScore +
    0.15 * capsBoost +
    0.1 * widthScore -
    gutterPenalty
  );
}

function validateTitleText(text: string): boolean {
  if (text.length < 4 || text.length > 200) {
    return false;
  }
  // Body text sentences end with periods; titles don't
  if (text.trimEnd().endsWith(".")) {
    return false;
  }
  if (_MEASUREMENT_RE.test(text)) {
    return false;
  }
  // Check against section labels (strip diacritics, case-insensitive)
  const cleaned = stripDiacritics(
    text.trim().replace(/:$/, "").toLowerCase(),
  );
  if (_SECTION_LABELS.has(cleaned)) {
    return false;
  }
  // Reject Polish recipe metadata blocks
  if (_RECIPE_METADATA_RE.test(stripDiacritics(text))) {
    return false;
  }
  return true;
}

function stripTrailingIngredients(text: string): string {
  const m = _MEASUREMENT_RE.exec(text);
  if (m === null) {
    return text;
  }
  let prefix = text.slice(0, m.index).trim();
  // Remove trailing numbers left after truncation
  prefix = prefix.replace(/\s+\d+\s*$/, "").trim();
  if (prefix.length >= 4) {
    return prefix;
  }
  return text;
}

function extractLeadingTitle(
  region: Region,
): string | undefined {
  const obs = [...region.observations].sort(
    (a, b) =>
      bankersRound(a.bbox.y * 100) / 100 -
        bankersRound(b.bbox.y * 100) / 100 || a.bbox.x - b.bbox.x,
  );
  if (obs.length === 0) {
    return undefined;
  }

  const first = obs[0];
  // First observation must be short (title-like), start with an uppercase
  // letter, and not end with a period.
  if (first.text.length > 60 || first.text.length < 4) {
    return undefined;
  }
  const firstAlpha = [...first.text].find((c) =>
    isAlpha(c),
  );
  if (
    firstAlpha !== undefined &&
    firstAlpha === firstAlpha.toLowerCase()
  ) {
    return undefined;
  }
  if (first.text.trimEnd().endsWith(".")) {
    return undefined;
  }

  // Collect observations on the same Y band as the first (multi-word titles)
  const yTol = 0.03;
  const titleObs: Array<BboxObservation> = [first];
  for (let i = 1; i < obs.length; i++) {
    const o = obs[i];
    if (
      Math.abs(o.bbox.y - first.bbox.y) < yTol &&
      o.text.length <= 40
    ) {
      titleObs.push(o);
    } else {
      break;
    }
  }

  titleObs.sort((a, b) => a.bbox.x - b.bbox.x);
  return titleObs.map((o) => o.text).join(" ");
}

/**
 * Resolve the representative text for a region in a multi-recipe context.
 * Returns the text and whether a relaxed height threshold should be used,
 * or undefined if the region is not title-like.
 */
function resolveMultiRecipeText(
  region: Region,
): { text: string; relaxedH: boolean } | undefined {
  let text = stripTrailingIngredients(region.text);
  let relaxedH = false;

  if (!validateTitleText(text) || text.length > 60) {
    const leading = extractLeadingTitle(region);
    if (
      leading !== undefined &&
      validateTitleText(leading) &&
      leading.length <= 60
    ) {
      text = leading;
      relaxedH = true;
    } else {
      return undefined;
    }
  }

  const firstAlpha = [...text].find(isAlpha);
  if (firstAlpha === undefined || firstAlpha === firstAlpha.toLowerCase()) {
    // Region text starts lowercase — try widest observation
    const bestObs = region.observations.reduce((a, b) =>
      a.bbox.width > b.bbox.width ? a : b,
    );
    const obsText = bestObs.text.trim();
    const obsAlpha = [...obsText].find(isAlpha);
    if (
      obsAlpha !== undefined &&
      obsAlpha === obsAlpha.toUpperCase() &&
      validateTitleText(obsText) &&
      obsText.length <= 60
    ) {
      return { text: obsText, relaxedH: true };
    }
    return undefined;
  }

  // Reject body text sentences
  const words = text.split(" ");
  if (words.length >= 7) {
    const lc = words
      .slice(1)
      .filter((w) => w.length > 0 && w[0] === w[0].toLowerCase()).length;
    if (lc / (words.length - 1) > 0.7) {
      return undefined;
    }
  }

  return { text, relaxedH };
}

// ── Main entry point ───────────────────────────────────────────────────────────

export function extractTitleFromBboxes(
  observations: Array<BboxObservation>,
  yTolerance: number = 0.05,
  regionGap: number = 0.04,
): string | undefined {
  const regions = clusterIntoRegions(
    observations,
    yTolerance,
    regionGap,
  );

  if (regions.length === 0) {
    return undefined;
  }

  // Precompute region-level maxima once (used by scoring and multi-recipe)
  const maxMlh = regions.reduce(
    (m, r) => Math.max(m, r.mean_line_height),
    0,
  );
  const maxDensity = regions.reduce(
    (m, r) => Math.max(m, r.char_density),
    0,
  );

  // Score all regions
  const scored: Array<[number, Region]> = regions.map((r) => [
    scoreTitleRegion(r, maxMlh, maxDensity),
    r,
  ]);
  scored.sort((a, b) => b[0] - a[0]);

  // Greedy multi-region merge
  let primaryText: string | undefined = undefined;

  const [s1, r1] = scored[0];
  if (s1 >= 0.55) {
    let accYTop = r1.bbox.y;
    let accYBot = r1.bbox.y + r1.bbox.height;
    let accXLeft = r1.bbox.x;
    let accXRight = r1.bbox.x + r1.bbox.width;
    const mergedRegions: Array<Region> = [r1];

    let remaining = scored
      .slice(1)
      .filter(([s]) => s >= 0.5);
    let changed = true;
    while (changed) {
      changed = false;
      const newRemaining: Array<[number, Region]> = [];
      for (const [s, r] of remaining) {
        const rTop = r.bbox.y;
        const rBot = r.bbox.y + r.bbox.height;

        // Must be directly above or below accumulated region
        const gapAbove = accYTop - rBot;
        const gapBelow = rTop - accYBot;
        let verticalGap: number;
        if (gapAbove > 0 && gapBelow > 0) {
          verticalGap = Math.min(gapAbove, gapBelow);
        } else if (gapAbove <= 0 && gapBelow <= 0) {
          verticalGap = 0; // overlapping
        } else {
          verticalGap = Math.max(gapAbove, gapBelow);
        }
        if (verticalGap > 0.1) {
          newRemaining.push([s, r]);
          continue;
        }

        // Short text only
        if (r.text.length > 50) {
          newRemaining.push([s, r]);
          continue;
        }

        // No recipe metadata
        if (_RECIPE_METADATA_RE.test(stripDiacritics(r.text))) {
          newRemaining.push([s, r]);
          continue;
        }

        // Require horizontal overlap or close proximity
        const rLeft = r.bbox.x;
        const rRight = r.bbox.x + r.bbox.width;
        const xOverlap =
          Math.min(accXRight, rRight) - Math.max(accXLeft, rLeft);
        const xGapLimit = r.text.length < 15 ? -0.15 : -0.05;
        if (xOverlap <= xGapLimit) {
          newRemaining.push([s, r]);
          continue;
        }

        // Merge this region
        mergedRegions.push(r);
        accYTop = Math.min(accYTop, rTop);
        accYBot = Math.max(accYBot, rBot);
        accXLeft = Math.min(accXLeft, rLeft);
        accXRight = Math.max(accXRight, rRight);
        changed = true;
      }
      remaining = newRemaining;
    }

    if (mergedRegions.length > 1) {
      mergedRegions.sort((a, b) => a.bbox.y - b.bbox.y);
      const mergedText = stripTrailingIngredients(
        mergedRegions.map((r) => r.text).join(" "),
      );
      if (validateTitleText(mergedText)) {
        primaryText = mergedText;
      }
    }
  }

  // Try top 3 candidates individually if no merged title found
  if (primaryText === undefined) {
    for (let i = 0; i < Math.min(3, scored.length); i++) {
      const [, region] = scored[i];
      const text = stripTrailingIngredients(region.text);
      if (validateTitleText(text)) {
        primaryText = text;
        break;
      }
      // For regions too long to be titles, try extracting just the
      // leading observation(s)
      if (region.text.length > 200) {
        const leading = extractLeadingTitle(region);
        if (leading !== undefined && validateTitleText(leading)) {
          primaryText = leading;
          break;
        }
      }
    }
  }

  // Build a ranked list of candidates. candidates[0] is returned as the
  // extraction result. Additional candidates maintain structural parity
  // with the Python implementation where they serve as _TitleResult
  // alternatives for evaluation matching.
  const candidates: Array<string> = [];
  const candidateSet = new Set<string>();

  function addCandidate(text: string): void {
    if (!candidateSet.has(text)) {
      candidateSet.add(text);
      candidates.push(text);
    }
  }

  if (primaryText !== undefined) {
    addCandidate(primaryText);
  }

  // Individual top-3 region texts + leading observations as alternatives
  for (const [, region] of scored.slice(0, 3)) {
    const text = stripTrailingIngredients(region.text);
    if (validateTitleText(text)) {
      addCandidate(text);
    }
    const leading = extractLeadingTitle(region);
    if (leading !== undefined && validateTitleText(leading)) {
      addCandidate(leading);
    }
  }

  // Multi-recipe alternative: concatenate all title-like regions
  if (scored.length >= 2) {
    const multiParts: Array<[number, string]> = [];
    for (const [score, region] of scored) {
      if (score < 0.45) {
        break;
      }
      const candidate = resolveMultiRecipeText(region);
      if (candidate === undefined) {
        continue;
      }
      const hThreshold = candidate.relaxedH ? 0.45 : 0.55;
      const hRatio =
        maxMlh > 0 ? region.mean_line_height / maxMlh : 0;
      if (hRatio < hThreshold) {
        continue;
      }
      multiParts.push([region.bbox.y, candidate.text]);
    }
    if (multiParts.length >= 2) {
      multiParts.sort((a, b) => a[0] - b[0]);
      addCandidate(multiParts.map(([, t]) => t).join(" "));
    }
  }

  // ALL CAPS observation scan
  const capsParts: Array<[number, string]> = [];
  const seenCaps = new Set<string>();
  for (const obs of observations) {
    const text = obs.text.trim();
    if (text.length < 4 || text.length > 40) {
      continue;
    }
    const alpha = [...text].filter(isAlpha);
    if (alpha.length < 3) {
      continue;
    }
    const upperRatio =
      alpha.filter((c) => c === c.toUpperCase()).length / alpha.length;
    if (upperRatio < 0.8) {
      continue;
    }
    if (!validateTitleText(text)) {
      continue;
    }
    const norm = text.toUpperCase();
    if (seenCaps.has(norm)) {
      continue;
    }
    seenCaps.add(norm);
    capsParts.push([obs.bbox.y, text]);
  }
  if (capsParts.length >= 2) {
    capsParts.sort((a, b) => a[0] - b[0]);
    addCandidate(capsParts.map(([, t]) => t).join(" "));
  }

  if (candidates.length === 0) {
    return undefined;
  }
  return candidates[0];
}

export type { BboxObservation };
